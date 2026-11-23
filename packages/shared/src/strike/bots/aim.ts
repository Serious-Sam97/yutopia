// A bot's aim (docs/plan/117-bot-brains.md, phase 4, F5a): a person's, not a snap.
//  - It reacts after its level's time, longer when it wasn't looking that way (surprise), shorter when it expected
//    them there.
//  - It turns at its level's rate: a flick that lands off (overshooting, by how far it flicked) and settles.
//  - It tracks a mover behind them (the level's lag).
//  - Its shots go out with the guns' own spread and bloom (shared dark/arms.ts — the rules players get: moving is
//    inaccurate, crouched and still is true), and meet whoever's on the line (their body, their head).

import {
  ARMS,
  bloomCalm,
  bloomShot,
  damageAt,
  type GunId,
  isAuto,
  isScoped,
  pellets,
  spreadOf,
} from "../../dark/arms.ts";
import { type StrikeMap, shotThrough } from "../map.ts";
import type { LevelSpec } from "./level.ts";

/** Angle a minus b, wrapped to (−π, π]. */
export const wrap = (a: number) => {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x <= -Math.PI) x += Math.PI * 2;
  return x;
};

export interface Aim {
  yaw: number;
  pitch: number;
  /** who it's on ("" none), since when it saw them (s), when it can first turn to them */
  on: string;
  seenAt: number;
  reactAt: number;
  /** the error the aim carries (rad), settling */
  ey: number;
  ep: number;
  /** the target's last angles (for its speed across the view) */
  ty: number;
  tp: number;
  /** the gun's bloom and when it was last fired (s); rounds in this burst; a pause till (s) */
  bloom: number;
  shotAt: number;
  burst: number;
  pauseTo: number;
  /** a charged gun (the Daybreak): charging since (s), 0 not */
  chargeAt: number;
}
export const newAim = (yaw = 0): Aim => ({
  yaw,
  pitch: 0,
  on: "",
  seenAt: 0,
  reactAt: 0,
  ey: 0,
  ep: 0,
  ty: 0,
  tp: 0,
  bloom: 0,
  shotAt: -9,
  burst: 0,
  pauseTo: 0,
  chargeAt: 0,
});

/** Turns the look toward (yaw, pitch) at most `rate` rad/s — a flick when far, an ease when near. */
export function turnTo(a: Aim, yaw: number, pitch: number, rate: number, dt: number) {
  const dy = wrap(yaw - a.yaw);
  const dp = pitch - a.pitch;
  const d = Math.hypot(dy, dp);
  if (d < 1e-6) return;
  // (near: an ease, 14/s; far: the rate's cap)
  const step = Math.min(d, Math.max(d * (1 - Math.exp(-14 * dt)), 0), rate * dt);
  a.yaw = wrap(a.yaw + (dy / d) * step);
  a.pitch += (dp / d) * step;
}

/** A target seen this step: angles to its aim point, `surprise` (1 expected … 1.6 from behind). Begins its
 *  reaction when it's a new one. */
export function acquire(
  a: Aim,
  L: LevelSpec,
  id: string,
  yaw: number,
  pitch: number,
  surprise: number,
  now: number,
  rand: () => number,
) {
  if (a.on === id) return;
  a.on = id;
  a.seenAt = now;
  a.reactAt = now + L.react * surprise * (0.8 + 0.45 * rand());
  // (the flick lands off: a random error, and over by a share of how far it has to go)
  const fy = wrap(yaw - a.yaw);
  const fp = pitch - a.pitch;
  const r = L.err0 * (0.6 + 0.7 * rand());
  const t = rand() * Math.PI * 2;
  const over = Math.min(0.12, Math.hypot(fy, fp) * 0.07 * (L.err0 / 0.09));
  const fl = Math.hypot(fy, fp) || 1;
  a.ey = Math.cos(t) * r + (fy / fl) * over;
  a.ep = Math.sin(t) * r * 0.5 + (fp / fl) * over;
  a.ty = yaw;
  a.tp = pitch;
  a.burst = 0;
}
/** Nobody in sight any more. */
export function letGo(a: Aim) {
  a.on = "";
  a.burst = 0;
}

/** One step of the aim on its target: the error settling to its floor, the lag behind a mover, the turn. Returns the
 *  error left between where it looks and where they are (rad). */
export function track(a: Aim, L: LevelSpec, yaw: number, pitch: number, now: number, dt: number, rand: () => number) {
  // (their speed across the view: the aim lags behind it)
  const wy = dt > 0 ? wrap(yaw - a.ty) / dt : 0;
  const wp = dt > 0 ? (pitch - a.tp) / dt : 0;
  a.ty = yaw;
  a.tp = pitch;
  if (now < a.reactAt) return Math.hypot(wrap(yaw - a.yaw), pitch - a.pitch);
  const k = Math.exp(-L.settle * dt);
  a.ey *= k;
  a.ep *= k;
  // (a person's hand never quite still: a wander at the floor)
  const e = Math.hypot(a.ey, a.ep);
  if (e < L.errFloor) {
    a.ey += (rand() * 2 - 1) * L.errFloor * dt * 6;
    a.ep += (rand() * 2 - 1) * L.errFloor * dt * 3;
  }
  const lagY = -Math.max(-0.25, Math.min(0.25, wy * L.lag));
  const lagP = -Math.max(-0.1, Math.min(0.1, wp * L.lag));
  turnTo(a, yaw + a.ey + lagY, pitch + a.ep + lagP, L.turn, dt);
  return Math.hypot(wrap(yaw - a.yaw), pitch - a.pitch);
}

/** Someone a shot can meet: their feet and height (crouched lower). */
export interface Body {
  id: string;
  x: number;
  y: number;
  z: number;
  h: number;
}
export interface Shot {
  victim: string;
  dmg: number;
  head: boolean;
  o: [number, number, number];
  yaw: number;
  pitch: number;
  gun: GunId;
  walls: number;
}

/** The first body a ray from o along (yaw, pitch) meets within `range` (m along it), and where. */
export function rayBody(
  o: [number, number, number],
  yaw: number,
  pitch: number,
  bodies: Body[],
  range: number,
): { b: Body; t: number; head: boolean } | null {
  const dx = Math.cos(yaw) * Math.cos(pitch);
  const dy = Math.sin(pitch);
  const dz = Math.sin(yaw) * Math.cos(pitch);
  let best: { b: Body; t: number; head: boolean } | null = null;
  for (const b of bodies) {
    // (the ray's closest pass by the body's upright line, in plan; its height there)
    const px = b.x - o[0];
    const pz = b.z - o[2];
    const hl = Math.hypot(dx, dz) || 1e-6;
    const t = (px * dx + pz * dz) / (hl * hl);
    if (t <= 0 || t > range) continue;
    const cx = o[0] + dx * t - b.x;
    const cz = o[2] + dz * t - b.z;
    if (cx * cx + cz * cz > 0.3 * 0.3) continue;
    const y = o[1] + dy * t;
    if (y < b.y || y > b.y + b.h) continue;
    if (best && t >= best.t) continue;
    best = { b, t, head: y >= b.y + b.h - 0.3 };
  }
  return best;
}

/** A shot (each pellet) along the look, the gun's spread and bloom on it; what each meets through the map's walls. */
export function fire(
  map: StrikeMap,
  a: Aim,
  gun: GunId,
  o: [number, number, number],
  stance: { speed: number; crouch: boolean; aimed: boolean },
  bodies: Body[],
  now: number,
  rand: () => number,
): Shot[] {
  const A = ARMS[gun];
  a.bloom = bloomCalm(gun, a.bloom, Math.max(0, now - a.shotAt));
  const spread = spreadOf(gun, a.bloom, {
    speed: stance.speed,
    crouch: stance.crouch,
    aim: stance.aimed,
    winded: false,
    scope: stance.aimed && isScoped(gun),
  });
  a.bloom = bloomShot(gun, a.bloom);
  a.shotAt = now;
  a.burst++;
  const out: Shot[] = [];
  const seed = Math.floor(rand() * 0xffffffff) >>> 0;
  // (a pellet's hits on one body add up as one shot's)
  const byBody = new Map<string, Shot>();
  for (const pe of pellets(gun, a.yaw, a.pitch, seed, spread)) {
    const met = rayBody(o, pe.yaw, pe.pitch, bodies, A.range);
    if (!met) {
      out.push({ victim: "", dmg: 0, head: false, o, yaw: pe.yaw, pitch: pe.pitch, gun, walls: 0 });
      continue;
    }
    const dx = Math.cos(pe.yaw) * Math.cos(pe.pitch);
    const dy = Math.sin(pe.pitch);
    const dz = Math.sin(pe.yaw) * Math.cos(pe.pitch);
    const at: [number, number, number] = [o[0] + dx * met.t, o[1] + dy * met.t, o[2] + dz * met.t];
    const through = shotThrough(map, o, at);
    if (through.kept <= 0) {
      out.push({ victim: "", dmg: 0, head: false, o, yaw: pe.yaw, pitch: pe.pitch, gun, walls: through.walls });
      continue;
    }
    const d = Math.hypot(at[0] - o[0], at[2] - o[2]);
    const dmg = damageAt(gun, A.damage, d, met.head) * through.kept;
    // (a body's head pellets and its body pellets summed apart: the park's head multiplier only on the head's)
    const bodyKey = `${met.b.id}|${met.head ? "h" : "b"}`;
    const had = byBody.get(bodyKey);
    if (had) {
      had.dmg += dmg;
    } else {
      const s: Shot = {
        victim: met.b.id,
        dmg,
        head: met.head,
        o,
        yaw: pe.yaw,
        pitch: pe.pitch,
        gun,
        walls: through.walls,
      };
      byBody.set(bodyKey, s);
      out.push(s);
    }
  }
  for (const s of out) s.dmg = Math.max(s.victim ? 1 : 0, Math.round(s.dmg));
  return out;
}

/** Whether it's time for another round: the gun's rate, a burst's pause, the AK's burst at range. */
export function ready(a: Aim, L: LevelSpec, gun: GunId, d: number, now: number): boolean {
  const A = ARMS[gun];
  if (now - a.shotAt < A.rate) return false;
  if (now < a.pauseTo) return false;
  if (isAuto(gun) && L.burst > 0 && d > 12 && a.burst >= L.burst) {
    // (a burst's over at range: a pause for the bloom to settle)
    a.burst = 0;
    a.pauseTo = now + 0.25 + d / 120;
    return false;
  }
  return true;
}

/** The seconds a bot's reload takes, by gun (the world's own reloads, about). */
export const RELOAD_S: Record<GunId, number> = { revolver: 2.2, shotgun: 2.3, ak47: 2.6, sniper: 3, daybreak: 2.4 };
/** Rounds in a gun (the world's mags). */
export const MAG: Record<GunId, number> = { revolver: 6, shotgun: 2, ak47: 30, sniper: 5, daybreak: 3 };
