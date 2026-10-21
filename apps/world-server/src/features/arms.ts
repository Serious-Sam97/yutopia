import { ANIM } from "@yutopia/shared";
import {
  ARMS,
  BODY,
  FLARE,
  flareFlight,
  type GunId,
  MUZZLE_REACH,
  pastAt,
  pellets,
  pvpDamage,
  type Ray,
  REWIND,
  rayDir,
  rayMeets,
} from "@yutopia/shared/dark";
import { heightAt } from "@yutopia/shared/grounds";
import { isWeapon, QUICK, takeStack, WEAPONS, weaponIn } from "@yutopia/shared/inventory";
import { MV_AIM, unpackMv } from "@yutopia/shared/move";
import type { Player } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Guns and flares (docs/plan/30-the-dark.md, D6), anywhere — the snow, the
// office's floors. You aim, the server decides: a shot says where its muzzle is
// and where it points; the server checks the weapon is in the hand and loaded,
// the rate, that the muzzle is where it has you, then takes the ray against the
// shadowed where you saw them (features/dark.ts keeps a second of where they
// were) — only an exposed one is hurt, a shielded one throws a spark — and
// against the others on your floor where you saw them (a second of where they
// were, kept here): one of us hit takes half what the shadowed would (shared
// pvpDamage); a wall on the way stops it. A reload is a round at a time out of
// the pockets (a shot stops it). A flare is thrown on an arc and lit where it
// lands: a pool the shadowed can't come into for 12 s.

const HEARD = 60; // tiles: who's told of a shot (its tracer, its flash) or a throw
const CROUCHED = 1.25; // tiles: one of us crouched, as a target
const KEPT_MS = 1200; // where the others were: this long back

interface Was {
  t: number;
  x: number;
  y: number;
  z: number;
  level: number;
  crouch: boolean;
}

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
  const ox = () => room.levelMap(0).ox ?? 0;
  const oy = () => room.levelMap(0).oy ?? 0;
  // the ground at (x, y) in a floor's own frame: the land's, out on it; the floor's (0) indoors
  const floorAt = (g: { onLand(x: number, y: number): boolean }, x: number, y: number) =>
    g.onLand(x, y) ? heightAt(x + ox(), y + oy()) : 0;
  // where everyone was, the last second or so (a shot is taken against where its shooter saw them)
  const trails = new Map<string, Was[]>();
  const free = (p: Player) => !p.busy && !p.act && p.a !== ANIM.sit && p.hp > 0;
  // the weapon in the hand: its slot in what they carry
  const inHand = (sid: string, p: Player) => {
    const inv = room.survival?.inventory(sid);
    if (!inv || !p.gun) return null;
    const w = weaponIn(inv, p.gun);
    return w ? { inv, w: w as { id: GunId; loaded: number } } : null;
  };
  // the others near (on the same floor, within HEARD): they see the shot and hear it
  const near = (p: Player, x: number, y: number) =>
    (room.clients as WorldClient[]).filter((c) => {
      if (c.sessionId === p.sid) return false;
      const q = room.state.players.get(c.sessionId);
      return !!q && q.level === p.level && Math.hypot(q.x - x, q.y - y) <= HEARD;
    });
  // one of us a shot can hit: on the shooter's floor, someone else, on their feet, not in a seat
  const target = (p: Player, q: Player) =>
    q.sid !== p.sid &&
    q.uid !== p.uid &&
    q.level === p.level &&
    !q.downAt &&
    q.hp > 0 &&
    !q.busy.startsWith("ride:") &&
    !q.busy.startsWith("drive:");
  // the nearest of the others along a ray, where the shooter saw them (`seenAt`, server ms)
  const personAlong = (p: Player, ray: Ray, range: number, seenAt: number) => {
    let best: { q: Player; t: number } | null = null;
    for (const q of room.state.players.values()) {
      if (!target(p, q)) continue;
      const trail = trails.get(q.sid) ?? [];
      let t: number | null = null;
      for (const dt of [-REWIND.slackMs, 0, REWIND.slackMs]) {
        const w = pastAt(trail, seenAt + dt) ?? { x: q.x, y: q.y, z: q.z, at: null };
        if (w.at && w.at.level !== p.level) continue;
        const m = rayMeets(ray, w.x, w.y, w.z, range, REWIND.slack, w.at?.crouch ? CROUCHED : BODY.h);
        if (m !== null && (t === null || m < t)) t = m;
      }
      if (t !== null && (!best || t < best.t)) best = { q, t };
    }
    return best;
  };

  room.on("arms:ping", (client, m) => room.send(client, "arms:pong", { t: Number(m?.t) || 0 }));

  room.on("arms:draw", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const inv = room.survival?.inventory(client.sessionId);
    if (!p || !inv) return;
    // (a quick slot 0–3 with a weapon in it; -1: put away; a stack there: nothing changes)
    const slot = Number(m?.slot);
    const it = Number.isInteger(slot) && slot >= 0 && slot < QUICK ? inv.quick[slot] : null;
    if (it && !isWeapon(it.id)) return;
    p.gun = it ? it.id : "";
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
    if (!p || !free(p) || (p.mv & MV_AIM) === 0) return;
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
    // (their feet: where they stand — p.z, the land's height out on it — or the floor under them,
    // whichever's lower, a message's lag either way)
    const floor = floorAt(room.gridFor(p.uid, p.level), p.x, p.y);
    const feet = Math.min(p.z, floor);
    if (Math.hypot(ox - p.x, oy - p.y) > MUZZLE_REACH || oz < feet || oz > Math.max(p.z, floor) + 2.4) return;
    hd.shotAt = now;
    hd.reloadAt = 0;
    h.w.loaded--;
    room.survival?.changed(client.sessionId);
    // where they saw the shadowed: the playback's delay and their line's lag back
    const lag = Math.max(0, Math.min(REWIND.maxLag, Number(m?.lag) || 0));
    const seenAt = now - REWIND.delay - lag;
    const seenPeople = now - REWIND.people - lag;
    const seed = Number(m?.seed) >>> 0;
    const g = room.gridFor(p.uid, p.level);
    for (const dir of pellets(h.w.id, yaw, Math.max(-1.2, Math.min(1.2, pitch)), seed)) {
      const ray = { x: ox, y: oy, z: oz, ...dir };
      const who = personAlong(p, ray, gun.range, seenPeople);
      // the shadowed (out on the land): one nearer than whoever's along it takes it
      const hit = p.level === 0 ? room.dark?.shoot(ray, who ? who.t : gun.range, seenAt, gun.damage, now) : null;
      if (hit) {
        room.send(client, "arms:hit", hit);
        continue;
      }
      if (!who) continue;
      const d = rayDir(ray.yaw, ray.pitch);
      const at = { x: ox + d.x * who.t, y: oy + d.y * who.t, z: oz + d.z * who.t };
      // (a wall or a trunk on the way: it stops there)
      if (!g.clear({ x: ox, y: oy }, at, 0.02, Math.max(oz, at.z))) continue;
      const q = who.q;
      room.survival?.hurt(q.sid, pvpDamage(h.w.id));
      room.send(client, "arms:hit", { id: q.sid, kind: q.downAt ? "downed" : "person", ...at });
      const qc = (room.clients as WorldClient[]).find((c) => c.sessionId === q.sid);
      if (qc) room.send(qc, "dark:hit", { id: client.sessionId, n: pvpDamage(h.w.id), shot: true });
    }
    const shot = { sid: client.sessionId, gun: h.w.id, ox, oy, oz, yaw, pitch, seed };
    for (const c of near(p, ox, oy)) room.send(c, "arms:shot", shot);
  });

  room.on("arms:flare", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const inv = room.survival?.inventory(client.sessionId);
    if (!p || !inv || !free(p)) return;
    if (takeStack(inv, "flare", 1) < 1) return;
    room.survival?.changed(client.sessionId);
    const level = p.level;
    const g = room.gridFor(p.uid, level);
    const z0 = p.z + FLARE.hand;
    const yaw = Number(m?.yaw) || 0;
    const pitch = Math.max(-0.6, Math.min(1, Number(m?.pitch) || 0));
    const to = flareFlight(
      p.x,
      p.y,
      z0,
      yaw,
      pitch,
      (x, y) => floorAt(g, x, y),
      (x, y) => !g.fits(x, y, 0.05),
    );
    const now = Date.now();
    const throwOut = { sid: client.sessionId, x0: p.x, y0: p.y, z0, ...to };
    room.send(client, "arms:throw", throwOut);
    for (const c of near(p, p.x, p.y)) room.send(c, "arms:throw", throwOut);
    pending.push({ at: now + to.secs * 1000, x: to.x, y: to.y, z: to.z, level });
  });
  const pending: { at: number; x: number; y: number; z: number; level: number }[] = [];

  let checkedAt = 0;
  return {
    leave(client) {
      hands.delete(client.sessionId);
      trails.delete(client.sessionId);
    },
    tick(_dt, now) {
      // where everyone is: kept a second or so
      for (const q of room.state.players.values()) {
        const t = trails.get(q.sid) ?? [];
        trails.set(q.sid, t);
        t.push({ t: now, x: q.x, y: q.y, z: q.z, level: q.level, crouch: unpackMv(q.mv).crouch });
        while (t.length > 2 && now - t[0].t > KEPT_MS) t.shift();
      }
      // flares landing: lit
      for (let i = pending.length - 1; i >= 0; i--)
        if (now >= pending[i].at) {
          const f = pending[i];
          pending.splice(i, 1);
          room.dark?.light(f.x, f.y, f.z, f.level, now);
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
            if (inv && !weaponIn(inv, p.gun)) p.gun = "";
          }
      }
    },
  };
});
