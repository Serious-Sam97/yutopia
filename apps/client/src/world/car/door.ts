// Plan 98 phase 6 (F4a): a car door let go open swings on its hinge. In the body's frame (x toward the tail, z to its
// left), a door hinged at its front edge opened `a` rad points (cos a, 0, side·sin a) from its hinge. What swings it:
// the car's acceleration (its weight lags: a hard brake flings it open to its stop, pulling away slams it), the air at
// speed (pressed shut), the check strap's detent (held a little half open), its hinges' friction (a door at rest stays
// put on a car at rest), its stop, and its latch (shut if it comes in hard enough, else left ajar).

/** rad: its stop, the check strap's detent, ajar (not latched) */
export const DOOR_STOP = 1.05;
const DETENT = 0.45;
const AJAR = 0.025;
/** rad/s closing: faster than this into the frame, it latches */
const LATCH_W = 0.6;

export interface Swung {
  a: number;
  w: number;
  /** shut this step: how hard (rad/s) */
  latched: boolean;
  hit: number;
}

/**
 * One step of a door: its opening `a` and swing `w` (rad/s), the car's acceleration `acc` and its speed along its own
 * length `vx` (m/s, + toward the tail: backing) in the body's frame, the door's side (+1 its left).
 */
export function swingDoor(
  a: number,
  w: number,
  acc: { x: number; y: number; z: number },
  side: number,
  dt: number,
  vx = 0,
): Swung {
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  // (its weight: a rod from its hinge — the push at its middle over its inertia about the hinge, ×1.43 a metre long)
  const tx = -sa;
  const tz = side * ca;
  let al = 1.43 * -(acc.x * tx + acc.z * tz);
  // (the air going by: forward (vx < 0) it presses the door shut)
  al -= 0.02 * vx * vx * sa * (vx < 0 ? 1 : -0.3);
  // (the check strap's detent, half open)
  const dd = a - DETENT;
  if (Math.abs(dd) < 0.12) al -= 9 * dd;
  // (its hinges' damping)
  al -= 1.6 * w;
  // (its hinges' friction: at rest and pushed little, it stays)
  if (Math.abs(w) < 0.06 && Math.abs(al) < 0.9) return { a, w: 0, latched: false, hit: 0 };
  let nw = w + al * dt;
  let na = a + nw * dt;
  if (na >= DOOR_STOP) {
    na = DOOR_STOP;
    nw = nw > 0 ? -0.25 * nw : nw;
  }
  if (na <= AJAR && nw < 0) {
    if (-nw > LATCH_W) return { a: 0, w: 0, latched: true, hit: -nw };
    na = AJAR;
    nw = 0;
  }
  return { a: na, w: nw, latched: false, hit: 0 };
}
