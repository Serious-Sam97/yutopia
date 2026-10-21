import { ANIM } from "@yutopia/shared";
import { ARMS, FLARE, flareFlight, type GunId, MUZZLE_REACH, pellets, REWIND } from "@yutopia/shared/dark";
import { heightAt } from "@yutopia/shared/grounds";
import { takeStack, WEAPONS } from "@yutopia/shared/inventory";
import { MV_AIM } from "@yutopia/shared/move";
import type { Player } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Guns and flares (docs/plan/30-the-dark.md, D6). You aim, the server decides:
// a shot says where its muzzle is and where it points; the server checks the
// weapon is in the hand and loaded, the rate, that the muzzle is where it has
// you, then takes the ray against the shadowed where you saw them (features/
// dark.ts keeps a second of where they were) — only an exposed one is hurt, a
// shielded one throws a spark. No friendly fire. A reload is a round at a time
// out of the pockets (a shot stops it). A flare is thrown on an arc and lit
// where it lands: a pool the shadowed can't come into for 12 s.

const HEARD = 60; // tiles: who's told of a shot (its tracer, its flash) or a throw

interface Hand {
  shotAt: number;
  /** reloading: the next round goes in at (server ms) */
  reloadAt: number;
}

registerFeature((room: WorldRoom) => {
  const hands = new Map<string, Hand>();
  const hand = (sid: string) => {
    const h = hands.get(sid) ?? { shotAt: 0, reloadAt: 0 };
    hands.set(sid, h);
    return h;
  };
  const onLand = (p: Player) => p.level === 0 && room.gridFor(p.uid, 0).onLand(p.x, p.y);
  const free = (p: Player) => !p.busy && !p.act && p.a !== ANIM.sit && p.hp > 0;
  // the weapon in the hand: its slot in what they carry
  const inHand = (sid: string, p: Player) => {
    const inv = room.survival?.inventory(sid);
    if (!inv || !p.gun) return null;
    const i = inv.weapons.findIndex((w) => w?.id === p.gun);
    return i >= 0 ? { inv, w: inv.weapons[i] as { id: GunId; loaded: number } } : null;
  };
  // the others near (outside, within HEARD): they see the shot and hear it
  const near = (p: Player, x: number, y: number) =>
    (room.clients as WorldClient[]).filter((c) => {
      if (c.sessionId === p.sid) return false;
      const q = room.state.players.get(c.sessionId);
      return !!q && q.level === 0 && Math.hypot(q.x - x, q.y - y) <= HEARD;
    });

  room.on("arms:ping", (client, m) => room.send(client, "arms:pong", { t: Number(m?.t) || 0 }));

  room.on("arms:draw", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const inv = room.survival?.inventory(client.sessionId);
    if (!p || !inv) return;
    const slot = Number(m?.slot);
    const w = slot === 0 || slot === 1 ? inv.weapons[slot] : null;
    p.gun = w ? w.id : "";
    hand(client.sessionId).reloadAt = 0; // (a change of weapon stops a reload)
  });

  room.on("arms:reload", (client) => {
    const p = room.state.players.get(client.sessionId);
    const h = p && inHand(client.sessionId, p);
    if (!p || !h || h.w.loaded >= WEAPONS[h.w.id].mag) return;
    const hd = hand(client.sessionId);
    if (!hd.reloadAt) hd.reloadAt = Date.now() + ARMS[h.w.id].reload * 1000;
  });

  room.on("arms:fire", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const now = Date.now();
    if (!p || !onLand(p) || !free(p) || (p.mv & MV_AIM) === 0) return;
    const h = inHand(client.sessionId, p);
    if (!h || h.w.loaded <= 0) return;
    const gun = ARMS[h.w.id];
    const hd = hand(client.sessionId);
    if (now - hd.shotAt < gun.rate * 1000 - 30) return;
    const ox = Number(m?.ox);
    const oy = Number(m?.oy);
    const oz = Number(m?.oz);
    const yaw = Number(m?.yaw);
    const pitch = Number(m?.pitch);
    if (![ox, oy, oz, yaw, pitch].every(Number.isFinite)) return;
    // the muzzle where the server has them (a ray from elsewhere isn't theirs)
    const feet = heightAt(p.x + (room.levelMap(0).ox ?? 0), p.y + (room.levelMap(0).oy ?? 0));
    if (Math.hypot(ox - p.x, oy - p.y) > MUZZLE_REACH || oz < feet || oz > feet + 2.4) return;
    hd.shotAt = now;
    hd.reloadAt = 0;
    h.w.loaded--;
    room.survival?.changed(client.sessionId);
    // where they saw the shadowed: the playback's delay and their line's lag back
    const lag = Math.max(0, Math.min(REWIND.maxLag, Number(m?.lag) || 0));
    const seenAt = now - REWIND.delay - lag;
    const seed = Number(m?.seed) >>> 0;
    for (const dir of pellets(h.w.id, yaw, Math.max(-1.2, Math.min(1.2, pitch)), seed)) {
      const hit = room.dark?.shoot({ x: ox, y: oy, z: oz, ...dir }, gun.range, seenAt, gun.damage, now);
      if (hit) room.send(client, "arms:hit", hit);
    }
    const shot = { sid: client.sessionId, gun: h.w.id, ox, oy, oz, yaw, pitch, seed };
    for (const c of near(p, ox, oy)) room.send(c, "arms:shot", shot);
  });

  room.on("arms:flare", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const inv = room.survival?.inventory(client.sessionId);
    if (!p || !inv || !onLand(p) || !free(p)) return;
    if (takeStack(inv, "flare", 1) < 1) return;
    room.survival?.changed(client.sessionId);
    const ox = room.levelMap(0).ox ?? 0;
    const oy = room.levelMap(0).oy ?? 0;
    const g = room.gridFor(p.uid, 0);
    const z0 = heightAt(p.x + ox, p.y + oy) + FLARE.hand;
    const yaw = Number(m?.yaw) || 0;
    const pitch = Math.max(-0.6, Math.min(1, Number(m?.pitch) || 0));
    const to = flareFlight(
      p.x,
      p.y,
      z0,
      yaw,
      pitch,
      (x, y) => heightAt(x + ox, y + oy),
      (x, y) => !g.onLand(x, y) || !g.fits(x, y, 0.05),
    );
    const now = Date.now();
    const throwOut = { sid: client.sessionId, x0: p.x, y0: p.y, z0, ...to };
    room.send(client, "arms:throw", throwOut);
    for (const c of near(p, p.x, p.y)) room.send(c, "arms:throw", throwOut);
    pending.push({ at: now + to.secs * 1000, x: to.x, y: to.y, z: to.z });
  });
  const pending: { at: number; x: number; y: number; z: number }[] = [];

  let checkedAt = 0;
  return {
    leave(client) {
      hands.delete(client.sessionId);
    },
    tick(_dt, now) {
      // flares landing: lit
      for (let i = pending.length - 1; i >= 0; i--)
        if (now >= pending[i].at) {
          const f = pending[i];
          pending.splice(i, 1);
          room.dark?.light(f.x, f.y, f.z, now);
        }
      // reloads: a round at a time out of the pockets, till full or out
      for (const [sid, hd] of hands) {
        if (!hd.reloadAt || now < hd.reloadAt) continue;
        const p = room.state.players.get(sid);
        const h = p && inHand(sid, p);
        if (!p || !h) {
          hd.reloadAt = 0;
          continue;
        }
        const ammo = WEAPONS[h.w.id].ammo;
        if (h.w.loaded >= WEAPONS[h.w.id].mag || takeStack(h.inv, ammo, 1) < 1) {
          hd.reloadAt = 0;
          continue;
        }
        h.w.loaded++;
        room.survival?.changed(sid);
        hd.reloadAt = h.w.loaded < WEAPONS[h.w.id].mag ? now + ARMS[h.w.id].reload * 1000 : 0;
      }
      // a weapon dropped (or never had) isn't in the hand
      if (now - checkedAt > 500) {
        checkedAt = now;
        for (const p of room.state.players.values())
          if (p.gun) {
            const inv = room.survival?.inventory(p.sid);
            if (inv && !inv.weapons.some((w) => w?.id === p.gun)) p.gun = "";
          }
      }
    },
  };
});
