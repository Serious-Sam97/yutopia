import { StateView } from "@colyseus/schema";
import { findPath, levelMap, type Point } from "@yutopia/shared";
import { beamAt, beamOf } from "@yutopia/shared/beam";
import {
  blackoutAt,
  dangerAt,
  dayPrey,
  FLARE,
  HQ_DOORS,
  inFlare,
  inLampPool,
  LAMP_POOL_R,
  newShade,
  nightness,
  onPathAt,
  type Prey,
  type Ray,
  REWIND,
  rayDir,
  rayMeets,
  SHADE,
  SHADOWED,
  type Shade,
  type ShadeSense,
  shadeCode,
  shadowedWanted,
  think,
  wound,
} from "@yutopia/shared/dark";
import { heightAt, LAMPS } from "@yutopia/shared/grounds";
import { byteToYaw, GAITS, MV_AIM, yawToByte } from "@yutopia/shared/move";
import { prefetch, ready, stopLand } from "../land.ts";
import { Flare, Shadow } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The shadowed (docs/plan/30-the-dark.md, D5): people from the company, in
// their office clothes, wrapped in a dark that moves. Run here for everyone:
// a director per group of people out on the land spends the danger (shared
// danger.ts) on them (by day fewer, for those off the paths) — out of the
// dark 25–45 tiles off, behind your beam if it can, never in the light or by
// the HQ — their mind is shared dark/fsm.ts, and this walks them (straight
// while they see you, two whiskers; A* only when blocked, a few a tick) and
// lands their strikes. They're sent only to whoever is outside near them
// (StateView). An admin switches them off (mod:dark).

// (YUTOPIA_DARK_FAST: the tests' — out of the dark at once, no quiet)
const FAST = process.env.YUTOPIA_DARK_FAST === "1";
const SPAWN_EVERY = FAST ? 300 : 4000; // ms, a group
const SPAWN_AT = [25, 45] as const; // tiles from someone
const CAP = SHADOWED.cap;
const SEEN_RANGE = 70; // sent to whoever's outside within this
const NEAR_HQ = 45; // none out of the dark nearer the HQ's doors than this
const GROUP = 30; // people this close are one group (one director)
const FAR_THINK = 0.25; // s: those with nobody within 40 tiles think at 4 Hz
const PATHS_A_TICK = 3;
const REPATH = 1.5;
const ROLL_SAFE: [number, number] = [0, 350]; // ms into a roll (as the server heard it): struck through, missed
const SPRINT = GAITS.indexOf("sprint");
const MV_CROUCH = 8;

interface Run {
  shade: Shade;
  wire: Shadow;
  z: number;
  yaw: number;
  path: Point[];
  pathAt: number;
  thinkAt: number;
  sentAt: number;
  sight: Map<string, { v: boolean; t: number }>;
  /** where it was, the last second (server ms): a shot is taken against where the shooter saw it */
  hist: { t: number; x: number; y: number; z: number }[];
}

export interface DarkHooks {
  /** A shot's ray from where the shooter saw the shadowed (`seenAt`, server ms): what it
   *  meets first along `range` (null: nothing), and what that did. */
  shoot(ray: Ray, range: number, seenAt: number, damage: number, now: number): ShotHit | null;
  /** A flare lit at (x, y) on ground z, for FLARE.secs. */
  light(x: number, y: number, z: number, now: number): void;
  /** the dark switched off (mod:dark peaceful): no threat at all */
  readonly peaceful: boolean;
}
export interface ShotHit {
  id: string;
  kind: "spark" | "hurt" | "killed";
  x: number;
  y: number;
  z: number;
}

registerFeature((room: WorldRoom) => {
  const shades = new Map<string, Run>();
  let mode: "normal" | "peaceful" | "called" = "normal"; // (called: only the ones an admin calls up)
  let seq = 0;
  let tension = 0; // 0..1: grows with strikes and close calls; high, the director holds off
  let quietUntil = 0;
  const lastSpawn = new Map<string, number>(); // group key → when
  let viewsAt = 0;
  let landAt = 0;
  let clock = 0; // s
  const ground = () => levelMap(room.map, 0);
  const ox = () => ground()?.ox ?? 0;
  const oy = () => ground()?.oy ?? 0;
  const grid = () => room.gridFor(0, 0);
  // (people's coords are the ground floor's; the Grounds' are the building's)
  const toB = (x: number, y: number) => ({ x: x + ox(), z: y + oy() });
  const outside = (p: { level: number; x: number; y: number }) => p.level === 0 && grid().onLand(p.x, p.y);

  // ── the light: the lamps' pools (not in a blackout), flares (phase 5) ─────
  const lampAt = (x: number, y: number, night: number, dark: boolean): { x: number; y: number } | null => {
    // a flare's light: day or night, blackout or not
    for (const f of room.state.flares.values()) if (inFlare(f, x, y)) return { x: f.x, y: f.y };
    if (dark || night < 0.3) return null;
    const b = toB(x, y);
    if (!inLampPool(b.x, b.z)) return null;
    let best: { x: number; y: number } | null = null;
    let bd = Number.POSITIVE_INFINITY;
    for (const l of LAMPS) {
      const d = Math.hypot(l.x - b.x, l.z - b.z);
      if (d < (LAMP_POOL_R[l.kind] ?? 5) && d < bd) {
        bd = d;
        best = { x: l.x - ox(), y: l.z - oy() };
      }
    }
    return best;
  };

  const spawn = (x: number, y: number, t: number) => {
    const id = `sh${(++seq).toString(36)}`;
    const wire = new Shadow();
    wire.id = id;
    wire.x = x;
    wire.y = y;
    wire.look = Math.floor(Math.random() * 256);
    const shade = newShade(x, y, t);
    wire.s = shadeCode(shade.state);
    wire.at = Date.now();
    room.state.shadows.set(id, wire);
    const b = toB(x, y);
    shades.set(id, {
      shade,
      wire,
      z: heightAt(b.x, b.z),
      yaw: 0,
      path: [],
      pathAt: -9,
      thinkAt: 0,
      sentAt: 0,
      sight: new Map(),
      hist: [],
    });
    viewsAt = 0; // (show it to those near now)
    return id;
  };
  const remove = (id: string) => {
    const r = shades.get(id);
    if (!r) return;
    for (const c of room.clients) (c as WorldClient).view?.remove(r.wire);
    room.state.shadows.delete(id);
    shades.delete(id);
  };

  // somewhere for one to come out of the dark: on the land, clear, in no light, not by the HQ,
  // `from` someone, behind their beam if it can
  const spawnPoint = (
    p: { x: number; y: number; yaw: number },
    night: number,
    dark: boolean,
    day: boolean,
  ): Point | null => {
    const g = grid();
    const doorsX = HQ_DOORS.x - ox();
    const doorsY = HQ_DOORS.z - oy();
    const behind = byteToYaw(p.yaw) + Math.PI;
    for (let k = 0; k < 12; k++) {
      const a = behind + (Math.random() - 0.5) * (k < 6 ? 1.6 : Math.PI * 2);
      const r = SPAWN_AT[0] + Math.random() * (SPAWN_AT[1] - SPAWN_AT[0]);
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      // (only on land already made: making it here is a long tick — land.ts makes it ahead)
      if (!ready(x + ox(), y + oy()) || !g.onLand(x, y) || !g.fits(x, y, 0.35)) continue;
      if (Math.hypot(x - doorsX, y - doorsY) < NEAR_HQ) continue;
      if (lampAt(x, y, night, dark)) continue;
      if (day && onPathAt(x + ox(), y + oy())) continue; // (by day, off the paths)
      return { x, y };
    }
    return null;
  };

  // ── walking: straight with whiskers; A* (a few a tick) when that's blocked ──
  let paths = 0;
  // (who's out there this tick: they keep a little off people and off each other)
  let bodies: { x: number; y: number }[] = [];
  const crowded = (r: Run, x: number, y: number) => {
    for (const b of bodies) if (Math.hypot(b.x - x, b.y - y) < 0.75) return true;
    for (const o of shades.values())
      if (
        o !== r &&
        Math.hypot(o.shade.x - x, o.shade.y - y) < 0.7 &&
        Math.hypot(o.shade.x - x, o.shade.y - y) < Math.hypot(o.shade.x - r.shade.x, o.shade.y - r.shade.y)
      )
        return true;
    return false;
  };
  const free = (x: number, y: number, fleeing: boolean, night: number, dark: boolean) =>
    grid().onLand(x, y) && grid().fits(x, y, 0.3) && (fleeing || !lampAt(x, y, night, dark));
  const walk = (r: Run, goal: Point, speed: number, dt: number, night: number, dark: boolean) => {
    const s = r.shade;
    const fleeing = s.state === "flee";
    let to = goal;
    if (r.path.length) {
      if (clock - r.pathAt > REPATH) r.path = [];
      else {
        while (r.path.length && Math.hypot(r.path[0].x - s.x, r.path[0].y - s.y) < 0.4) r.path.shift();
        if (r.path.length) to = r.path[0];
      }
    }
    const dx = to.x - s.x;
    const dy = to.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return;
    const step = Math.min(d, speed * dt);
    const base = Math.atan2(dy, dx);
    for (const off of [0, 0.6, -0.6, 1.2, -1.2]) {
      const a = base + off;
      const nx = s.x + Math.cos(a) * step;
      const ny = s.y + Math.sin(a) * step;
      // (the whisker: a little further ahead must be clear too)
      if (
        !free(nx, ny, fleeing, night, dark) ||
        !free(s.x + Math.cos(a) * 0.7, s.y + Math.sin(a) * 0.7, fleeing, night, dark)
      )
        continue;
      // (up against someone, or another of them: it stops there — no walking through)
      if (crowded(r, nx, ny)) {
        if (off === 0) return;
        continue;
      }
      s.x = nx;
      s.y = ny;
      r.yaw = a;
      return;
    }
    // boxed in: a path round (a few a tick, then again in a moment)
    if (!r.path.length && paths < PATHS_A_TICK && clock - r.pathAt > REPATH) {
      paths++;
      r.pathAt = clock;
      r.path = findPath(grid(), { x: s.x, y: s.y }, goal, 1500) ?? [];
    }
  };

  // ── strikes ─────────────────────────────────────────────────────────────
  const strike = (r: Run, sid: string, now: number) => {
    const p = room.state.players.get(sid);
    if (!p || !outside(p)) return;
    const d = Math.hypot(p.x - r.shade.x, p.y - r.shade.y);
    if (d > SHADE.reach) return; // (out of reach: missed)
    // mid-roll: through it (a message's lag of grace)
    const rolling = p.jump === "roll" && now - p.jumpAt >= ROLL_SAFE[0] && now - p.jumpAt <= ROLL_SAFE[1];
    if (rolling) return;
    room.survival?.hurt(sid, SHADE.strikeDamage);
    tension = Math.min(1, tension + 0.2);
    const c = room.clients.getById(sid) as WorldClient | undefined;
    if (c) room.send(c, "dark:hit", { id: r.wire.id, n: SHADE.strikeDamage });
  };

  // ── admins: off (peaceful) or on; one out of the dark near me (for trying the feel) ──
  room.on("mod:dark", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.admin) return;
    if (m?.mode === "peaceful" || m?.mode === "normal" || m?.mode === "called") mode = m.mode;
    if (mode === "peaceful") for (const id of [...shades.keys()]) remove(id);
    const n = Math.max(0, Math.min(10, Number(m?.spawn) || 0));
    // (that many, round me 8–14 tiles off: a few spots tried for each — some are trees)
    let made = 0;
    for (let k = 0; made < n && k < n * 10 && outside(p); k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 6;
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      if (!grid().onLand(x, y) || !grid().fits(x, y, 0.35)) continue;
      spawn(x, y, clock);
      made++;
    }
  });

  // ── shots and flares (features/arms.ts asks) ──────────────────────────────
  // where it was at `t` (server ms): between the two samples round then
  const whereAt = (r: Run, t: number) => {
    const h = r.hist;
    if (!h.length) return { x: r.shade.x, y: r.shade.y, z: r.z };
    let i = h.length - 1;
    while (i > 0 && h[i].t > t) i--;
    const a = h[i];
    const b = h[Math.min(h.length - 1, i + 1)];
    const k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
  };
  let flareSeq = 0;
  room.dark = {
    get peaceful() {
      return mode === "peaceful";
    },
    shoot(ray, range, seenAt, damage, now) {
      let best: { r: Run; t: number } | null = null;
      for (const r of shades.values()) {
        if (r.shade.state === "dissolve") continue;
        // where the shooter saw it, give or take a little (the playback, the line's jitter)
        let t: number | null = null;
        for (const dt of [-REWIND.slackMs, 0, REWIND.slackMs]) {
          const p = whereAt(r, seenAt + dt);
          const m = rayMeets(ray, p.x, p.y, p.z, range, REWIND.slack);
          if (m !== null && (t === null || m < t)) t = m;
        }
        if (t !== null && (!best || t < best.t)) best = { r, t };
      }
      if (!best) return null;
      const d = rayDir(ray.yaw, ray.pitch);
      const hit = { x: ray.x + d.x * best.t, y: ray.y + d.y * best.t, z: ray.z + d.z * best.t };
      // (a wall or a trunk on the way: it stops there)
      if (!grid().clear({ x: ray.x, y: ray.y }, { x: hit.x, y: hit.y }, 0.02, Math.max(ray.z, hit.z))) return null;
      const s = best.r.shade;
      const kind = wound(s, damage, clock);
      if (kind === "killed") {
        best.r.wire.k = true;
        best.r.wire.s = shadeCode(s.state);
        best.r.wire.at = now;
        tension = Math.min(1, tension + 0.15);
      }
      return { id: best.r.wire.id, kind, ...hit };
    },
    light(x, y, z, now) {
      const f = new Flare();
      f.id = `fl${(++flareSeq).toString(36)}`;
      f.x = x;
      f.y = y;
      f.z = z;
      f.at = now;
      f.until = now + FLARE.secs * 1000;
      room.state.flares.set(f.id, f);
    },
  };

  return {
    join(client) {
      client.view = new StateView();
    },
    back(client) {
      client.view = new StateView();
      viewsAt = 0;
    },
    tick(dt, now) {
      clock += dt;
      paths = 0;
      const hour = room.state.hour;
      const night = nightness(hour);
      const dark = blackoutAt(now, hour);
      // (the dawn: shared danger.ts' ramp, 5:00–7:30; peaceful, as good as)
      const dawn = mode === "peaceful" || (hour >= 5 && hour < 7.5);
      // who's out there (the ones the shadowed may have), and who isn't to be had
      const prey: (Prey & { yaw: number; level: number })[] = [];
      const beams: ReturnType<typeof beamOf>[] = [];
      for (const p of room.state.players.values()) {
        if (!outside(p)) continue;
        const riding = p.busy.startsWith("ride:") || p.busy.startsWith("drive:");
        const hidden =
          riding || p.status === "away" || p.status === "dnd" || !!lampAt(p.x, p.y, night, dark) || p.hp <= 0;
        prey.push({
          id: p.sid,
          x: p.x,
          y: p.y,
          crouch: (p.mv & MV_CROUCH) !== 0,
          sprinting: (p.mv & 7) === SPRINT,
          hidden,
          yaw: p.yaw,
          level: p.level,
        });
        // a focused torch: shared beam.ts, as both views draw it
        if (p.focused) {
          const b = toB(p.x, p.y);
          beams.push(
            beamOf(p.x, p.y, heightAt(b.x, b.z), byteToYaw(p.yaw), (p.mv & MV_AIM) !== 0 ? p.pitch / 40 : null, true),
          );
        }
      }

      // the land round those out there made ahead, as far as the shadowed come from (once a second)
      if (now - landAt >= 1000) {
        landAt = now;
        for (const p of prey) prefetch(p.x + ox(), p.y + oy(), SPAWN_AT[1] + 4);
      }

      // the director: per group of people out there, as many as the danger buys
      if (mode === "normal" && now >= quietUntil) {
        const groups: (typeof prey)[] = [];
        for (const p of prey) {
          const g = groups.find((g) => g.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < GROUP));
          if (g) g.push(p);
          else groups.push([p]);
        }
        for (const g of groups) {
          const cx = g.reduce((a, p) => a + p.x, 0) / g.length;
          const cy = g.reduce((a, p) => a + p.y, 0) / g.length;
          const b = toB(cx, cy);
          const danger = dangerAt({ hour, storm: room.state.storm, x: b.x, z: b.z, lit: false, inHQ: false });
          // (by day, fewer: only for those off the paths and away from the HQ; a storm's the night's)
          const day = night < 0.3 && room.state.storm < 0.5;
          const hunted = day ? g.filter((p) => dayPrey(p.x + ox(), p.y + oy())) : g;
          const want = dawn ? 0 : shadowedWanted(hunted.length, danger);
          let here = 0;
          for (const r of shades.values()) if (Math.hypot(r.shade.x - cx, r.shade.y - cy) < SPAWN_AT[1] + 10) here++;
          const key = g[0].id;
          if (here >= want || shades.size >= CAP || now - (lastSpawn.get(key) ?? 0) < SPAWN_EVERY) continue;
          if (!FAST && tension > 0.7) {
            quietUntil = now + 25_000; // (a fight's over: quiet for a while)
            tension = 0.3;
            continue;
          }
          const who = hunted[Math.floor(Math.random() * hunted.length)];
          const at = spawnPoint(who, night, dark, day);
          if (!at) continue;
          spawn(at.x, at.y, clock);
          lastSpawn.set(key, now);
        }
      }
      tension = Math.max(0, tension - 0.02 * dt);

      // their minds, their feet
      const t = clock;
      bodies = prey;
      for (const [id, r] of shades) {
        const s = r.shade;
        let nearest = Number.POSITIVE_INFINITY;
        for (const p of prey) nearest = Math.min(nearest, Math.hypot(p.x - s.x, p.y - s.y));
        // (far from everyone: 4 Hz)
        const step = nearest < 40 ? dt : FAR_THINK;
        if (nearest >= 40 && t - r.thinkAt < FAR_THINK) continue;
        r.thinkAt = t;
        const b = toB(s.x, s.y);
        r.z = heightAt(b.x, b.z);
        let burn = 0;
        for (const beam of beams) {
          // (anywhere on the body: low, the chest, the head — point-blank the cone meets it low)
          const k = Math.max(
            beamAt(beam, s.x, s.y, r.z + 0.4),
            beamAt(beam, s.x, s.y, r.z + 0.9),
            beamAt(beam, s.x, s.y, r.z + 1.4),
          );
          if (k > 0 && grid().clear({ x: beam.x, y: beam.y }, { x: s.x, y: s.y }, 0.02, beam.z))
            burn += 0.6 + 0.4 * Math.min(1, k * 3); // (in the cone at all: 27/s at least, 45 close in — shared fsm.ts SHADE.burn)
        }
        const light = lampAt(s.x, s.y, night, dark);
        const sense: ShadeSense = {
          t,
          night,
          dawn,
          burn,
          lit: !!light,
          light,
          prey,
          // (a line of sight, kept a fifth of a second: 5 Hz is quicker than anyone notices)
          sees: (x, y) => {
            const k = `${Math.round(x * 2)},${Math.round(y * 2)}`;
            const was = r.sight.get(k);
            if (was && t - was.t < 0.2) return was.v;
            const v = grid().clear({ x: s.x, y: s.y }, { x, y }, 0.02, r.z + 1.4);
            r.sight.set(k, { v, t });
            if (r.sight.size > 64) r.sight.clear();
            return v;
          },
        };
        const act = think(s, sense, step);
        if (act.gone) {
          remove(id);
          continue;
        }
        if (act.goal) walk(r, act.goal, act.speed, step, night, dark);
        // face who it's after (standing, winding up), else the way it goes
        const tgt = s.target ? room.state.players.get(s.target) : undefined;
        if (tgt && (s.state === "windup" || s.state === "emerge" || !act.goal))
          r.yaw = Math.atan2(tgt.y - s.y, tgt.x - s.x);
        if (act.strike) strike(r, act.strike, now);
        if (burn > 0 || s.state === "windup") tension = Math.min(1, tension + 0.01 * dt * 60 * step);
        // on the wire: its state at once; where it is ten times a second
        const w = r.wire;
        if (act.became) {
          w.s = shadeCode(s.state);
          w.at = now;
        }
        // (where it was, a second of it, for the shots' rewind)
        r.hist.push({ t: now, x: s.x, y: s.y, z: r.z });
        while (r.hist.length > 2 && now - r.hist[0].t > 1200) r.hist.shift();
        const sh = Math.round(s.shield);
        if (sh !== w.sh) w.sh = sh;
        if (act.became || now - r.sentAt >= 100) {
          r.sentAt = now;
          w.x = s.x;
          w.y = s.y;
          w.a = yawToByte(r.yaw);
        }
      }

      // flares burnt out
      for (const f of [...room.state.flares.values()]) if (now >= f.until) room.state.flares.delete(f.id);

      // who sees which: everyone outside, those within 70 tiles (twice a second)
      if (now - viewsAt >= 500) {
        viewsAt = now;
        for (const c of room.clients as WorldClient[]) {
          const p = room.state.players.get(c.sessionId);
          if (!c.view || !p) continue;
          const out = outside(p);
          for (const r of shades.values()) {
            const near = out && Math.hypot(r.shade.x - p.x, r.shade.y - p.y) <= SEEN_RANGE;
            const has = c.view.has(r.wire);
            if (near && !has) c.view.add(r.wire);
            else if (!near && has) c.view.remove(r.wire);
          }
        }
      }
    },
    dispose() {
      stopLand();
      for (const id of [...shades.keys()]) remove(id);
      room.dark = null;
    },
  };
});
