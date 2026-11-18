import { along, type Route } from "../grounds.ts";
import { type CarState, type Controls, headingOf } from "./state.ts";

// Plan 98 phase 23 (F10b): a driver for the town's own cars on Jolt — the same car, the same physics as a player's.
// Along a route (shared grounds.ts: a polyline, by distance): steered by pure pursuit at a point ahead on it (further
// the faster), as fast as it's asked but no faster than the bends ahead allow, a stop eased into, held still on the
// brake. What it may not drive into (people, cars) is the caller's: it says how fast it may go.

/** m/s² of sideways grip a careful driver keeps to round a bend */
const BEND_G = 2.2;
const LOOK_S = 3.5;
const LOOK_K = 0.7;

/** Where along `r` a point (x, z) is, near `s0` (within `win` metres either way). */
export function projectOn(r: Route, x: number, z: number, s0: number, win = 8): number {
  let best = s0;
  let bd = Infinity;
  const a = Math.max(0, s0 - win);
  const b = Math.min(r.len, s0 + win);
  for (let s = a; s <= b; s += 0.25) {
    const p = along(r, s);
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/** How fast the bends of `r` from `s` on allow (m/s): the tightest within the stopping distance, slowed for in time. */
export function bendSpeed(r: Route, s: number, v: number): number {
  let out = Infinity;
  const reach = Math.max(12, (v * v) / (2 * 3) + 8);
  let prev = along(r, s).a;
  for (let d = 2; d <= reach && s + d <= r.len; d += 2) {
    const a = along(r, s + d).a;
    const k = Math.abs(Math.atan2(Math.sin(a - prev), Math.cos(a - prev))) / 2;
    prev = a;
    if (k < 1e-3) continue;
    const vb = Math.sqrt(BEND_G / k);
    // (the bend `d` ahead: slowed to it at ~3 m/s²)
    out = Math.min(out, Math.sqrt(vb * vb + 2 * 3 * Math.max(0, d - 4)));
  }
  return out;
}

/** The driver's hands and feet this step: along `r` from `s` (where it is on it), at `want` m/s at most. */
export function aiControls(st: CarState, r: Route, s: number, want: number): Controls {
  const h = headingOf(st.q);
  const fx = Math.cos(h);
  const fz = Math.sin(h);
  const v = st.v.x * fx + st.v.z * fz;
  const L = LOOK_S + Math.max(0, v) * LOOK_K;
  const t = along(r, Math.min(r.len, s + L));
  const dx = t.x - st.p.x;
  const dz = t.z - st.p.z;
  const al = Math.atan2(Math.sin(Math.atan2(dz, dx) - h), Math.cos(Math.atan2(dz, dx) - h));
  const ld = Math.max(1, Math.hypot(dx, dz));
  const delta = Math.atan((2 * st.spec.wheelbase * Math.sin(al)) / ld);
  // (the car's steer: +1 its right — a turn toward +angle in the ground's (x, z) is to its right)
  const steer = Math.max(-1, Math.min(1, delta / st.spec.steer.max));
  const vt = Math.min(want, bendSpeed(r, s, v));
  let up = Math.max(0, Math.min(1, (vt - v) * 0.5 + (vt > 0.3 ? 0.05 : 0)));
  let down = Math.max(0, Math.min(1, (v - vt) * 0.45));
  // (stopped where it's to stop: held on the brake)
  if (vt < 0.25) {
    up = 0;
    down = Math.max(down, v < 0.6 ? 0.5 : down);
  }
  return { up, down, steer, hand: 0, digital: false };
}
