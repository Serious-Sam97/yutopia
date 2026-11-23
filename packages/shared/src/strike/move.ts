// The Strike Park's movement (docs/plan/114-the-strike-park.md, S-M1): CS's ground and air rules — speed
// by what's in the hand, acceleration and friction that make counter-strafing a skill, walking and
// crouching, a little air strafe and no bunny-hop gain, tagging. Pure: the client steps it (its walker
// mode feeds the velocity to the body), the bots step it, the tests measure it.
//
// CS's numbers (sv_accelerate 5.5, sv_friction 5.2, sv_stopspeed 80 u/s, sv_airaccelerate 12, the air's
// wish speed capped at 30 u/s), its units turned to metres (1 u = 0.0254 m).

import { SPEED, TAG } from "./rules.ts";

const U = 0.0254;
export const CSMOVE = {
  accelerate: 5.5,
  friction: 5.2,
  stopspeed: 80 * U,
  airAccelerate: 12,
  airCap: 30 * U,
  /** the jump's take-off speed: CS's √(2 g h), its 57 u high jump at 800 u/s² */
  jumpV: Math.sqrt(2 * 800 * 57) * U,
  gravity: 800 * U,
  /** landing from a jump slows you (CS2: to this share) */
  landing: 0.8,
} as const;

export interface MoveIn {
  /** wished direction in the world (x, z), length ≤ 1 (0 when no key's held) */
  wx: number;
  wz: number;
  /** Shift: walking; Ctrl: crouching */
  walk: boolean;
  crouch: boolean;
  /** the run speed with what's in the hand (rules.speedWith), the scope's if scoped */
  max: number;
  onGround: boolean;
  /** seconds of tagging left (rules.TAG) */
  tagged: number;
}
export interface Vel {
  x: number;
  z: number;
}

/** One step of `dt` s: the horizontal velocity after it (the vertical's the body's own). */
export function stepMove(v: Vel, inp: MoveIn, dt: number): Vel {
  let { x, z } = v;
  if (inp.onGround) {
    // friction first (CS's: the stop speed's floor makes small speeds stop fast)
    const sp = Math.hypot(x, z);
    if (sp > 0) {
      const control = Math.max(sp, CSMOVE.stopspeed);
      const drop = control * CSMOVE.friction * dt;
      const k = Math.max(0, sp - drop) / sp;
      x *= k;
      z *= k;
    }
  }
  const wl = Math.hypot(inp.wx, inp.wz);
  if (wl > 1e-6) {
    const dx = inp.wx / wl;
    const dz = inp.wz / wl;
    let wish = inp.max * Math.min(1, wl);
    if (inp.crouch) wish *= SPEED.crouch;
    else if (inp.walk) wish *= SPEED.walk;
    if (inp.tagged > 0) wish *= TAG.share;
    if (inp.onGround) {
      const cur = x * dx + z * dz;
      const add = wish - cur;
      if (add > 0) {
        const acc = Math.min(add, CSMOVE.accelerate * dt * wish);
        x += dx * acc;
        z += dz * acc;
      }
    } else {
      // the air: the wish capped (no gain going straight; a little steering)
      const w = Math.min(wish, CSMOVE.airCap);
      const cur = x * dx + z * dz;
      const add = w - cur;
      if (add > 0) {
        const acc = Math.min(add, CSMOVE.airAccelerate * dt * wish);
        x += dx * acc;
        z += dz * acc;
      }
    }
  }
  if (inp.onGround) {
    // (never over the hand's speed on the ground: no bunny-hop gain carried in)
    const sp = Math.hypot(x, z);
    let cap = inp.max;
    if (inp.crouch) cap *= SPEED.crouch;
    else if (inp.walk) cap *= SPEED.walk;
    if (inp.tagged > 0) cap *= TAG.share;
    if (sp > cap && sp > 0) {
      // (slowed to it over a few frames, not at once: a jump's landing)
      const k = Math.max(cap / sp, 1 - 10 * dt);
      x *= k;
      z *= k;
    }
  }
  return { x, z };
}

/** How inaccurate moving makes a shot (CS's: nothing to a third of the run speed, then up to full by
 *  the run speed; in the air, always the most). 0–1: the gun's moving spread's share to add. */
export function moveInaccuracy(speed: number, max: number, onGround: boolean): number {
  if (!onGround) return 1;
  const t = (speed - max * 0.34) / (max * 0.66);
  return Math.max(0, Math.min(1, t));
}
