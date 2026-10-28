// Reach (docs/plan/50-the-volume.md, E): what a body's hands get to, and what gets to it — in three
// dimensions. Its hands reach from the floor it stands on (bent down) to REACH_UP over its feet (an
// arm up): within that band, a thing's as far as it is across the floor, as reach always was; out
// of it, the height's gap counts too — a flier over the lot reaches nothing down there, nor does
// anything reach it (plan 49's aloft gate, gone into this). A thing's height is its shapes'
// (shared/shapes); a body's, its capsule's (BODY_H). Sight (a ray from the hand, walls in the way)
// is the server's, on Jolt (features/physics.ts). Every feature's own reach distance stands.
import type { WorldObjectDef } from "./catalog.ts";
import { kindSolids } from "./shapes/index.ts";

/** A body's hands reach up this far over its feet (and down to what it stands on), m. */
export const REACH_UP = 2.1;
/** Its hand reaching out: where sight is taken from, m over its feet. */
export const HAND = 1.2;
/** A body's height (the physics world's capsule: shared/physics BODY). */
export const BODY_H = 1.75;

export interface Feet {
  x: number;
  y: number;
  z: number;
}

/** How far a body is from what spans [y0, y1] up at (x, y) (its floor's coords and heights):
 *  across, and up or down out of the hands' band. */
export function reachTo(p: Feet, at: { x: number; y: number }, y0 = 0, y1 = y0): number {
  const across = Math.hypot(p.x - at.x, p.y - at.y);
  const off = offBand(p.z, y0, y1);
  return off ? Math.hypot(across, off) : across;
}

/** How far up or down out of the hands' band (feet at `z`) what spans [y0, y1] is: 0 within it. */
export function offBand(z: number, y0: number, y1 = y0): number {
  return Math.max(0, y0 - (z + REACH_UP), z - y1);
}

/** Two bodies, each its whole height: across, and the gap between them up or down (a high-five, a
 *  strike, a car's knock: what's over your head isn't touched). */
export function between(a: Feet, b: Feet, ha = BODY_H, hb = BODY_H): number {
  const across = Math.hypot(a.x - b.x, a.y - b.y);
  const off = Math.max(0, a.z - (b.z + hb), b.z - (a.z + ha));
  return off ? Math.hypot(across, off) : across;
}

/** A thing's height over what it stands on, [bottom, top] (its shapes'; a wall's hung thing at its
 *  height on the wall) — [0, 1] for a thing with none. */
export function spanOf(def: WorldObjectDef): [number, number] {
  const ss = kindSolids(def);
  if (!ss.length) return [0, 1];
  let y0 = Number.POSITIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const s of ss) {
    const [a, b] = s.t === "box" ? [s.y - s.hy, s.y + s.hy] : [s.y0, s.y1];
    y0 = Math.min(y0, a);
    y1 = Math.max(y1, b);
  }
  return [y0, y1];
}
