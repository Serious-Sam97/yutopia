import { ANIM, overFloor } from "@yutopia/shared";
import {
  ARM,
  ARMS,
  atHead,
  BODY,
  bloomCalm,
  bloomShot,
  burstAt,
  damageAt,
  dumpsOnOpen,
  FLARE,
  flareFlight,
  type GunId,
  isAuto,
  isCharged,
  isWhole,
  MUZZLE_REACH,
  ORB,
  orbFlight,
  pastAt,
  pellets,
  pvpDamage,
  type Ray,
  REWIND,
  rayDir,
  rayMeets,
  spreadOf,
} from "@yutopia/shared/dark";
import { heightAt, inDeepWater } from "@yutopia/shared/grounds";
import { addStack, count, isWeapon, QUICK, takeStack, WEAPONS, weaponIn } from "@yutopia/shared/inventory";
import { MV_AIM, MV_WINDED, unpackMv } from "@yutopia/shared/move";
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
// pvpDamage); a wall on the way stops it. A reload (docs/plan/79-the-guns.md,
// AW2's): opened, everything in it out (the live rounds back to the pockets),
// the revolver's speedloader in, the AK's new magazine (its charging handle
// racked after, if it ran dry), or the double-barrel's shells one at a time;
// shut; the sniper's bolt back (its rounds stay), a round at a time, home. The AK
// fires while its trigger's held: each round its own shot. The sniper's bolt is
// worked after each (Player.arm); a shot down its scope goes almost dead on. A flare is thrown on an arc and lit where it
// lands: a pool the shadowed can't come into for 12 s.
// The feel's rules (docs/plan/32-the-arms.md): a gun's up only after its draw;
// shots go out with the spread the server works out (shared spreadOf — its own
// shot times' bloom, how they stand and move), and that's what the others'
// tracers use; a pellet's damage falls off with range (the double-barrel's) and
// the head takes more. A shot while a gun's open snaps it shut instead (a round
// in it). Player.arm says
// what the hand's doing, for everyone's screens.

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
  /** reloading: the next step at (server ms) — a round in (the revolver); the double-barrel's
   *  `step`: open, a shell in, shut */
  reloadAt: number;
  step: "" | "open" | "load" | "shut";
  /** the reload began with it empty (the AK's charging handle racked at the end) */
  dry: boolean;
  /** (plan 82) this closing racks the AK's charging handle */
  rack: boolean;
  /** the bolt worked after a shot (the sniper's), from / till (server ms) */
  boltFrom: number;
  boltTill: number;
  /** charging since (the Daybreak's: server ms, 0 not) */
  chargeAt: number;
  /** the gun's up at (server ms) */
  drawnAt: number;
  /** the spread's bloom (rad) as of `bloomAt` (server ms) */
  bloom: number;
  bloomAt: number;
}

registerFeature((room: WorldRoom) => {
  const hands = new Map<string, Hand>();
  const hand = (sid: string) => {
    const h = hands.get(sid) ?? {
      shotAt: 0,
      reloadAt: 0,
      step: "",
      dry: false,
      rack: false,
      boltFrom: 0,
      boltTill: 0,
      chargeAt: 0,
      drawnAt: 0,
      bloom: 0,
      bloomAt: 0,
    };
    hands.set(sid, h);
    return h;
  };
  // the ground at (x, y) in a floor's own frame: the land's, out on it; the floor's (0) indoors
  const floorAt = (g: { onLand(x: number, y: number): boolean }, x: number, y: number) =>
    g.onLand(x, y) ? heightAt(x, y) : 0;
  // where everyone was, the last second or so (a shot is taken against where its shooter saw them)
  const trails = new Map<string, Was[]>();
  const free = (p: Player) => !p.busy && !p.act && p.a !== ANIM.sit && p.hp > 0 && !p.fellAt;
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
    let best: { q: Player; t: number; head: boolean } | null = null;
    for (const q of room.state.players.values()) {
      if (!target(p, q)) continue;
      const trail = trails.get(q.sid) ?? [];
      let t: number | null = null;
      let head = false;
      for (const dt of [-REWIND.slackMs, 0, REWIND.slackMs]) {
        const w = pastAt(trail, seenAt + dt) ?? { x: q.x, y: q.y, z: overFloor(q.level, q.z), at: null };
        if (w.at && w.at.level !== p.level) continue;
        const h = w.at?.crouch ? CROUCHED : BODY.h;
        const m = rayMeets(ray, w.x, w.y, w.z, range, REWIND.slack, h);
        if (m !== null && (t === null || m < t)) {
          t = m;
          head = atHead(ray, m, w.z, h);
        }
      }
      if (t !== null && (!best || t < best.t)) best = { q, t, head };
    }
    return best;
  };

  // how fast they've gone, the last fifth of a second (tiles / s)
  const speedOf = (sid: string, now: number) => {
    const t = trails.get(sid);
    if (!t || t.length < 2) return 0;
    const b = t[t.length - 1];
    let a = t[0];
    for (let i = t.length - 1; i >= 0; i--)
      if (now - t[i].t >= 200) {
        a = t[i];
        break;
      }
    return b.t > a.t ? Math.hypot(b.x - a.x, b.y - a.y) / ((b.t - a.t) / 1000) : 0;
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
    const hd = hand(client.sessionId);
    // (a change of weapon stops a reload; the one taken out is up after its draw)
    hd.reloadAt = 0;
    hd.step = "";
    hd.drawnAt = it && isWeapon(it.id) ? Date.now() + ARMS[it.id].draw * 1000 : 0;
  });

  room.on("arms:reload", (client) => {
    const p = room.state.players.get(client.sessionId);
    const h = p && inHand(client.sessionId, p);
    if (!p || !h || h.w.loaded >= WEAPONS[h.w.id].mag || count(h.inv, WEAPONS[h.w.id].ammo) < 1) return;
    const hd = hand(client.sessionId);
    if (hd.reloadAt) return;
    // (opened first — the revolver's cylinder swung out, the double-barrel broken: plan 79 F11a, F12a)
    hd.step = "open";
    hd.dry = h.w.loaded <= 0;
    hd.rack = false;
    hd.reloadAt = Date.now() + ARMS[h.w.id].open * 1000;
  });

  // the Daybreak pressed: charging (plan 79 phase 7) — up, loaded, not open, not too soon; let go, not
  room.on("arms:charge", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const h = p && inHand(client.sessionId, p);
    const hd = hand(client.sessionId);
    if (m?.stop || !p || !h || !isCharged(h.w.id)) {
      hd.chargeAt = 0;
      return;
    }
    const now = Date.now();
    if (!free(p) || (p.mv & MV_AIM) === 0 || now < hd.drawnAt || hd.step || h.w.loaded <= 0) return;
    if (now - hd.shotAt < ARMS[h.w.id].rate * 1000 - 30) return;
    hd.chargeAt = now;
  });

  room.on("arms:fire", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const now = Date.now();
    if (!p || !free(p) || (p.mv & MV_AIM) === 0) return;
    const h = inHand(client.sessionId, p);
    if (!h) return;
    const gun = ARMS[h.w.id];
    const hd = hand(client.sessionId);
    if (now < hd.drawnAt - 30) return;
    // open (the cylinder out, the barrels broken): a shot snaps it shut instead (a round in it), and the
    // next one fires
    if (hd.step) {
      if (hd.step !== "shut" && h.w.loaded > 0) {
        hd.step = "shut";
        hd.rack = false;
        hd.reloadAt = now + gun.snap * 1000;
      }
      return;
    }
    if (h.w.loaded <= 0) return;
    // (charged first — the Daybreak's: its time up since arms:charge, a little early for the line)
    const charged = isCharged(h.w.id);
    if (charged && (!hd.chargeAt || now - hd.chargeAt < ARMS.daybreak.charge * 1000 - 150)) return;
    hd.chargeAt = 0;
    // (full auto — the AK's: a round's slot each `rate`, a shot late on the line may take the one it
    // missed, so a held trigger's rate holds through the line's jitter; never faster than it over time)
    const rateMs = gun.rate * 1000;
    if (now - hd.shotAt < rateMs - 30) return;
    const ox = Number(m?.ox);
    const oy = Number(m?.oy);
    const oz = Number(m?.oz);
    const yaw = Number(m?.yaw);
    const pitch = Number(m?.pitch);
    if (![ox, oy, oz, yaw, pitch].every(Number.isFinite)) return;
    // the muzzle where the server has them (a ray from elsewhere isn't theirs)
    // (their feet: where they stand — p.z, the land's height out on it — or the floor under them,
    // whichever's lower, a message's lag either way)
    // (heights over their floor, as the muzzle's: Player.z is the world's)
    const pz = overFloor(p.level, p.z);
    const floor = floorAt(room.gridFor(p.uid, p.level), p.x, p.y);
    const feet = Math.min(pz, floor);
    if (Math.hypot(ox - p.x, oy - p.y) > MUZZLE_REACH || oz < feet || oz > Math.max(pz, floor) + 2.4) return;
    hd.shotAt = isAuto(h.w.id) ? Math.max(now - rateMs, hd.shotAt + rateMs) : now;
    hd.reloadAt = 0;
    h.w.loaded--;
    // (the bolt worked after it — everyone sees it: Player.arm)
    if ("bolt" in gun) {
      hd.boltFrom = now + gun.boltAt * 1000;
      hd.boltTill = hd.boltFrom + gun.bolt * 1000;
    }
    room.survival?.changed(client.sessionId);
    // where they saw the shadowed: the playback's delay and their line's lag back
    const lag = Math.max(0, Math.min(REWIND.maxLag, Number(m?.lag) || 0));
    const seenAt = now - REWIND.delay - lag;
    const seenPeople = now - REWIND.people - lag;
    const seed = Number(m?.seed) >>> 0;
    // the spread: the bloom from its own shot times, how they stand and go — then this shot's on it
    const id = h.w.id;
    const mv = unpackMv(p.mv);
    const bloom = bloomCalm(id, hd.bloom, (now - hd.bloomAt) / 1000);
    const spread = spreadOf(id, bloom, {
      speed: speedOf(client.sessionId, now),
      crouch: mv.crouch,
      aim: true,
      winded: (p.mv & MV_WINDED) !== 0,
      // (down a scope: as the shooter says — plan 79 phase 6; taken at their word, as their moves are)
      scope: m?.scope === true,
    });
    hd.bloom = bloomShot(id, bloom);
    hd.bloomAt = now;
    // the Daybreak: a ball of light off from the muzzle, flying (the tick), not a ray
    if (charged) {
      const g = room.gridFor(p.uid, p.level);
      const pt = Math.max(-1.2, Math.min(1.2, pitch));
      const end = orbFlight(
        ox,
        oy,
        oz,
        yaw,
        pt,
        (x, y) => floorAt(g, x, y),
        // (the ground ends it here; walls and trunks as it flies — Jolt's sight, the tick: open water
        // isn't a wall, the grid's "can't stand there" was)
        () => false,
      );
      const o: Orb = {
        id: `orb${(++orbSeq).toString(36)}`,
        sid: client.sessionId,
        level: p.level,
        x0: ox,
        y0: oy,
        z0: oz,
        d: rayDir(yaw, pt),
        t0: now,
        end,
        last: { x: ox, y: oy, z: oz },
      };
      orbs.push(o);
      const msg = { id: o.id, sid: o.sid, x0: ox, y0: oy, z0: oz, ...end, level: p.level };
      room.send(client, "arms:orb", msg);
      for (const c of near(p, ox, oy)) room.send(c, "arms:orb", msg);
      return;
    }
    const shadeDamage = (t: number, head: boolean) => damageAt(id, gun.damage, t, head);
    for (const dir of pellets(id, yaw, Math.max(-1.2, Math.min(1.2, pitch)), seed, spread)) {
      const ray = { x: ox, y: oy, z: oz, ...dir };
      const who = personAlong(p, ray, gun.range, seenPeople);
      // the shadowed (out on the land): one nearer than whoever's along it takes it
      const hit = p.level === 0 ? room.dark?.shoot(ray, who ? who.t : gun.range, seenAt, shadeDamage, now) : null;
      if (hit) {
        room.send(client, "arms:hit", hit);
        continue;
      }
      if (!who) continue;
      const d = rayDir(ray.yaw, ray.pitch);
      const at = { x: ox + d.x * who.t, y: oy + d.y * who.t, z: oz + d.z * who.t };
      // (a wall or a trunk on the way: it stops there — Jolt's sight, the shot's own line)
      if (!(room.sight?.(p.level, { x: ox, y: oy, z: oz }, at) ?? true)) continue;
      const q = who.q;
      const n = damageAt(id, pvpDamage(id), who.t, who.head);
      room.survival?.hurt(q.sid, n);
      // (the body thrown from the shot, as everyone sees it: plan 58 7)
      const qp = room.state.players.get(q.sid);
      if (qp) {
        qp.hitAt = now;
        qp.hitYaw = Math.atan2(oy - qp.y, ox - qp.x);
      }
      room.send(client, "arms:hit", { id: q.sid, kind: q.downAt ? "downed" : "person", head: who.head, ...at });
      const qc = (room.clients as WorldClient[]).find((c) => c.sessionId === q.sid);
      if (qc) room.send(qc, "dark:hit", { id: client.sessionId, n, shot: true });
    }
    const shot = { sid: client.sessionId, gun: id, ox, oy, oz, yaw, pitch, seed, spread };
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
    const z0 = overFloor(level, p.z) + FLARE.hand;
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
  // the Daybreak's balls in the air (plan 79 phase 7): where from, which way, when; where they stop at
  // the latest
  interface Orb {
    id: string;
    sid: string;
    level: number;
    x0: number;
    y0: number;
    z0: number;
    d: { x: number; y: number; z: number };
    t0: number;
    end: { x: number; y: number; z: number; secs: number };
    /** where it was the last tick (a wall between that and now: it bursts there) */
    last: { x: number; y: number; z: number };
  }
  const orbs: Orb[] = [];
  let orbSeq = 0;
  // a ball's burst: the shadowed (the dark's), the others in reach on its floor (half; past a wall:
  // not), everyone near told
  const burst = (o: Orb, x: number, y: number, z: number, now: number) => {
    const shooter = room.state.players.get(o.sid);
    const sc = (room.clients as WorldClient[]).find((c) => c.sessionId === o.sid);
    room.dark?.blast(x, y, z, o.level, ARMS.daybreak.damage, now, (hit) => {
      if (sc) room.send(sc, "arms:hit", hit);
    });
    for (const q of room.state.players.values()) {
      if (shooter ? !target(shooter, q) : q.level !== o.level || q.sid === o.sid) continue;
      const qz = overFloor(q.level, q.z);
      const d = Math.hypot(q.x - x, q.y - y, Math.max(0, Math.abs(qz + 0.9 - z) - 0.9));
      const n = burstAt(pvpDamage("daybreak"), d);
      if (n <= 0) continue;
      if (!(room.sight?.(o.level, { x, y, z: z + 0.3 }, { x: q.x, y: q.y, z: qz + 1.2 }) ?? true)) continue;
      room.survival?.hurt(q.sid, n);
      q.hitAt = now;
      q.hitYaw = Math.atan2(y - q.y, x - q.x);
      if (sc)
        room.send(sc, "arms:hit", {
          id: q.sid,
          kind: q.downAt ? "downed" : "person",
          head: false,
          x: q.x,
          y: q.y,
          z: qz + 1,
        });
      const qc = (room.clients as WorldClient[]).find((c) => c.sessionId === q.sid);
      if (qc) room.send(qc, "dark:hit", { id: o.sid, n, shot: true });
    }
    const msg = { id: o.id, x, y, z, level: o.level };
    for (const c of room.clients as WorldClient[]) {
      const cp = room.state.players.get(c.sessionId);
      if (cp && cp.level === o.level && Math.hypot(cp.x - x, cp.y - y) <= HEARD) room.send(c, "arms:burst", msg);
    }
  };

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
        t.push({ t: now, x: q.x, y: q.y, z: overFloor(q.level, q.z), level: q.level, crouch: unpackMv(q.mv).crouch });
        while (t.length > 2 && now - t[0].t > KEPT_MS) t.shift();
      }
      // flares landing: lit
      for (let i = pending.length - 1; i >= 0; i--)
        if (now >= pending[i].at) {
          const f = pending[i];
          pending.splice(i, 1);
          // (into deep water: out — plan 66)
          if (f.level === 0 && inDeepWater(f.x, f.y)) continue;
          room.dark?.light(f.x, f.y, f.z, f.level, now);
        }
      // the Daybreak's balls flying: the shields they pass burn; on a body, or at their end, they burst
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        const t = Math.min((now - o.t0) / 1000, o.end.secs);
        const along = t * ORB.speed;
        const x = o.x0 + o.d.x * along;
        const y = o.y0 + o.d.y * along;
        const z = o.z0 + o.d.z * along;
        // (a wall or a trunk since the last tick: it bursts against it)
        if (!(room.sight?.(o.level, o.last, { x, y, z }) ?? true)) {
          orbs.splice(i, 1);
          burst(o, o.last.x, o.last.y, o.last.z, now);
          continue;
        }
        o.last = { x, y, z };
        room.dark?.sear(x, y, o.level, now);
        const shooter = room.state.players.get(o.sid);
        let on = t >= o.end.secs;
        // (one of us in its way — not the one who fired it)
        if (!on)
          for (const q of room.state.players.values()) {
            if (shooter ? !target(shooter, q) : q.level !== o.level || q.sid === o.sid) continue;
            const qz = overFloor(q.level, q.z);
            if (Math.hypot(q.x - x, q.y - y) < ORB.hit && z > qz - 0.2 && z < qz + BODY.h + 0.2) {
              on = true;
              break;
            }
          }
        // (one of the shadowed: where they are now)
        if (!on && o.level === 0 && room.dark?.near?.(x, y, z, ORB.hit)) on = true;
        if (!on) continue;
        orbs.splice(i, 1);
        burst(o, x, y, z, now);
      }
      // reloads (plan 79 F11a, F12a — AW2's): opened, and what's in it out — the live rounds back to the
      // pockets, what fits; then the revolver's speedloader (every round it needs at once), the
      // double-barrel's shells one at a time, till full or out of them; shut
      for (const [sid, hd] of hands) {
        if (!hd.reloadAt || now < hd.reloadAt) continue;
        const p = room.state.players.get(sid);
        const h = p && inHand(sid, p);
        if (!p || !h) {
          hd.reloadAt = 0;
          hd.step = "";
          continue;
        }
        const ammo = WEAPONS[h.w.id].ammo;
        const mag = WEAPONS[h.w.id].mag;
        // (the revolver's speedloader, the AK's magazine: all at once; the double-barrel's shells one by one)
        const whole = isWhole(h.w.id);
        if (hd.step === "shut" || !hd.step) {
          hd.step = "";
          hd.reloadAt = 0;
          continue;
        }
        if (hd.step === "open" && h.w.loaded > 0 && dumpsOnOpen(h.w.id)) {
          // (all of it out: the live ones back where they fit — the rest stay in)
          h.w.loaded -= addStack(h.inv, ammo, h.w.loaded);
          room.survival?.changed(sid);
        }
        if (hd.step === "load") {
          const got = takeStack(h.inv, ammo, whole ? mag - h.w.loaded : 1);
          if (got > 0) {
            h.w.loaded += got;
            room.survival?.changed(sid);
          }
        }
        // (the speedloader or the magazine once; the shells till full or none left)
        const more = h.w.loaded < mag && count(h.inv, ammo) > 0 && (!whole || hd.step === "open");
        hd.step = more ? "load" : "shut";
        const g = ARMS[h.w.id];
        // (shut: the AK run dry has its charging handle racked — longer)
        hd.rack = "rack" in g && hd.dry && h.w.loaded > 0;
        const shut = hd.rack && "rack" in g ? g.rack : g.shut;
        hd.reloadAt = now + (more ? ("speed" in g ? g.speed : g.reload) : shut) * 1000;
      }
      // what each hand's doing, for everyone's screens
      for (const p of room.state.players.values()) {
        const hd = p.gun ? hands.get(p.sid) : undefined;
        const arm = !hd
          ? ARM.idle
          : now < hd.drawnAt
            ? ARM.draw
            : hd.step
              ? // (the double-barrel's closing its own — plan 81: everyone's screen shuts it then; the AK's too, and
                // whether its charging handle's racked — plan 82; the sniper's bolt run home — plan 83; the others' as
                // ever)
                hd.step === "shut" && (p.gun === "shotgun" || p.gun === "ak47" || p.gun === "sniper")
                ? hd.rack && p.gun === "ak47"
                  ? ARM.rack
                  : ARM.shut
                : ARM.open
              : hd.reloadAt
                ? ARM.reload
                : now >= hd.boltFrom && now < hd.boltTill
                  ? ARM.bolt
                  : hd.chargeAt && now - hd.chargeAt < ARMS.daybreak.charge * 1000 + 600
                    ? ARM.charge
                    : ARM.idle;
        if (p.arm !== arm) p.arm = arm;
      }
      // a weapon dropped (or never had) isn't in the hand
      if (now - checkedAt > 500) {
        checkedAt = now;
        for (const p of room.state.players.values()) {
          const inv = room.survival?.inventory(p.sid);
          // (the cue's off a pool table, not out of the pockets: features/pballs.ts)
          if (p.gun && p.gun !== "cue" && inv && !weaponIn(inv, p.gun)) p.gun = "";
          // (plan 80) the revolver carried: its holster on the hip, for everyone to see
          const holster = !!inv && !!weaponIn(inv, "revolver");
          if (p.holster !== holster) p.holster = holster;
          // (plan 81) the double-barrel carried: slung on the back
          const sling = !!inv && !!weaponIn(inv, "shotgun");
          if (p.sling !== sling) p.sling = sling;
          // (plan 82) the AK carried: slung on the back, mirrored
          const slingAk = !!inv && !!weaponIn(inv, "ak47");
          if (p.slingAk !== slingAk) p.slingAk = slingAk;
          // (plan 83) the sniper carried: slung on the AK's diagonal, over it
          const slingSn = !!inv && !!weaponIn(inv, "sniper");
          if (p.slingSn !== slingSn) p.slingSn = slingSn;
        }
      }
    },
  };
});
