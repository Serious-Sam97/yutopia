import { BUILDINGS } from "../grounds.ts";
import type { CarState } from "./sim.ts";

// A car over the wire (docs/plan/28-the-car.md, Together): the driver's
// client runs the sim and sends this at 20 Hz; the server checks it is a car
// that could have got there, keeps it in the room's state, and everyone else
// draws it 110 ms in the past from these. Positions are the Grounds' (the
// building's coords); `y` the height of the centre of gravity.

export interface CarWire {
  seq: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx: number;
  vy: number;
  vz: number;
  wy: number; // yaw rate
  steer: number; // the road wheels' angle (+: right)
  rpm: number;
  gear: number;
  fl: number; // CAR_FLAGS
  slip: number; // the most any tyre is sliding (m/s): tracks, sound
  fuel: number;
}

/** The switches and the lamps, packed. */
export const CAR_FLAGS = {
  low: 1,
  high: 2,
  brake: 4,
  reverse: 8,
  left: 16,
  right: 32,
  hazard: 64,
  horn: 128,
  wipers1: 256,
  wipers2: 512, // (both: the fastest)
  engine: 1024,
  hand: 2048,
  windows: 4096, // windows down
  dome: 8192,
  radio1: 16384, // the radio's station: (fl >> 14) & 3, 0 off
  radio2: 32768,
} as const;

export const CAR_HZ = 20;
/** The fastest a car may be said to go (m/s), and how hard it may change speed. */
const VMAX = 62;
const AMAX = 2.2 * 9.81; // a hard knock included

export function toWire(s: CarState, seq: number, fl: number): CarWire {
  let slip = 0;
  for (const w of s.wheels) slip = Math.max(slip, w.contact ? w.slip : 0);
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return {
    seq,
    x: r3(s.p.x),
    y: r3(s.p.y),
    z: r3(s.p.z),
    qx: r3(s.q.x),
    qy: r3(s.q.y),
    qz: r3(s.q.z),
    qw: r3(s.q.w),
    vx: r3(s.v.x),
    vy: r3(s.v.y),
    vz: r3(s.v.z),
    wy: r3(s.w.y),
    steer: r3((s.wheels[0].steer + s.wheels[1].steer) / 2),
    rpm: Math.round(s.rpm),
    gear: s.shiftT > 0 ? s.shiftTo : s.gear,
    fl,
    slip: r3(slip),
    fuel: r3(s.fuel),
  };
}

const finite = (...xs: unknown[]) => xs.every((x) => typeof x === "number" && Number.isFinite(x));

/** Could a car have gone from `a` to `b` in `dt` seconds? A reason it couldn't, or null.
 *  `ground` the land's height under a point. */
export function implausible(
  a: CarWire | null,
  b: CarWire,
  dt: number,
  ground: (x: number, z: number) => number,
): string | null {
  if (!finite(b.x, b.y, b.z, b.qx, b.qy, b.qz, b.qw, b.vx, b.vy, b.vz, b.wy, b.steer, b.rpm, b.gear, b.fl))
    return "bad numbers";
  const ql = Math.hypot(b.qx, b.qy, b.qz, b.qw);
  if (Math.abs(ql - 1) > 0.02) return "bad turn";
  const v = Math.hypot(b.vx, b.vy, b.vz);
  if (v > VMAX) return "too fast";
  if (Math.abs(b.rpm) > 9000 || b.gear < -1 || b.gear > 6) return "bad engine";
  const h = ground(b.x, b.z);
  if (b.y < h - 0.8 || b.y > h + 8) return "off the ground";
  // inside a building (a few tiles in: a bumper over a wall's edge is a knock, not a cheat)
  for (const bd of BUILDINGS) {
    const r = bd.built ?? bd;
    if (b.x > r.x0 + 1.2 && b.x < r.x1 - 1.2 && b.z > r.z0 + 1.2 && b.z < r.z1 - 1.2) return "in a building";
  }
  if (!a) return null;
  const t = Math.max(0.03, Math.min(1.5, dt));
  const moved = Math.hypot(b.x - a.x, b.z - a.z);
  // (a late packet carries the time it was late: the slack grows with it)
  if (moved > VMAX * t + 2) return "jumped";
  // (a crash stops it dead, or throws it back a little, in one packet: slower is always believable)
  const dv = Math.hypot(b.vx - a.vx, b.vz - a.vz);
  const faster = Math.hypot(b.vx, b.vz) - Math.hypot(a.vx, a.vz);
  if (dv > AMAX * t + 4 && faster > AMAX * t + 1) return "accelerated";
  return null;
}
