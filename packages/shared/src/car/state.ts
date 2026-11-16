import type { Ground } from "./grip.ts";
import type { RutHit } from "./ruts.ts";
import type { CarSpec } from "./specs.ts";

// A car's state (docs/plan/28-the-car.md; on Jolt since docs/plan/92-the-cars.md): where it is and
// how it's turned, its wheels, its engine, gearbox, tank and warmth — what the rig, the sound, the
// gauges and the wire read. Its physics is Jolt's, driven by drive.ts (the old sim of plan 28 —
// raycast wheels on the heightfield, its own tyres, 2D collisions — went in plan 92's phase 4); here
// what a car is, put down on its wheels, its engine started, its readout.
//
// World axes are the Grounds' building coords (x east, y up, z south). The
// car's own: x forward, y up, z to its right.

const G = 9.81;
const SMAX = 0.35; // a spring's free length (only differences matter: the wheels' rest)

export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Something a car can hit: a trunk or a post (circle), a wall or a car (box). In x/z. */
export interface Solid {
  kind: "circle" | "box";
  x: number;
  z: number;
  r?: number;
  hx?: number;
  hz?: number;
  a?: number; // a box's turn (its own x along cos a, sin a)
  soft?: boolean; // gives (a snowbank, a person): it absorbs
  vx?: number;
  vz?: number;
  wy?: number; // its turn rate (rad/s, about y)
  /** something that moves when hit (another car): its mass; without one it doesn't budge */
  m?: number;
  /** told the impulse it takes (at px, pz) when it can move (a parked car shoved) */
  shove?: (jx: number, jz: number, px: number, pz: number) => void;
  id?: string;
  /** what it is, for the sound */
  what?: "tree" | "post" | "wall" | "car" | "person" | "pet" | "fence" | "bank";
}

export interface CarWorld {
  height(x: number, z: number): number;
  ground(x: number, z: number): Ground;
  /** fresh snow on the roads (a storm): 0..1 */
  cover?: number;
  /** …here: less where a plough's been through (wave 3); none: `cover` everywhere */
  coverAt?(x: number, z: number): number;
  solids(x: number, z: number, r: number, out: Solid[]): void;
  /** the water over the ground here (m; 0 none: docs/plan/66-the-water.md, S5) */
  water?(x: number, z: number): number;
  /** (plan 93 S6) the rut a wheel at (x, z) is in, if any (shared car/ruts.ts) */
  rut?(x: number, z: number, out: RutHit): RutHit | null;
}

export interface Helps {
  abs: boolean;
  tcs: boolean;
  esc: boolean;
  steer: boolean; // the steering limited by speed (keys)
  counter: number; // the countersteer helper, 0..1
  auto: boolean; // the gearbox shifts itself
  hold: boolean; // holds the car still at a stop
}
export const HELPS: Helps = { abs: true, tcs: true, esc: true, steer: true, counter: 0.75, auto: true, hold: true };
export const NO_HELPS: Helps = {
  abs: false,
  tcs: false,
  esc: false,
  steer: false,
  counter: 0,
  auto: false,
  hold: false,
};

/** What the driver does this step. */
export interface Controls {
  up: number; // W / RT, 0..1
  down: number; // S / LT, 0..1
  steer: number; // −1 (left) .. 1 (right)
  hand: number; // 0..1
  shiftUp?: boolean; // (edges, manual)
  shiftDown?: boolean;
  /** keys (on/off: smoothed here) or a pad (already analog) */
  digital?: boolean;
}
export const IDLE: Controls = { up: 0, down: 0, steer: 0, hand: 0, digital: true };

export interface Wheel {
  c: number; // spring compression
  cv: number; // its speed
  w: number; // spin (rad/s)
  turn: number; // its angle (drawing)
  steer: number;
  load: number;
  kappa: number;
  alpha: number;
  used: number; // the share of its grip it uses (0..1+)
  slip: number; // the contact patch sliding (m/s)
  ground: Ground;
  contact: boolean;
  sink: number;
  dig: number;
  /** a point it's held to at a stop (no creep on a slope) */
  hold: boolean;
  hx: number;
  hz: number;
  /** its contact patch (world) */
  px: number;
  py: number;
  pz: number;
  fx: number;
  fy: number;
  vx: number; // the patch's speed along the wheel
}

export interface Hit {
  j: number; // the impulse (N·s)
  x: number;
  z: number;
  what: Solid["what"] | "ground";
  at: number; // sim time
  id?: string; // what it hit (a person: their session)
  v?: number; // how fast the two met (m/s)
}

export interface CarState {
  spec: CarSpec;
  p: V3;
  q: Quat;
  v: V3;
  w: V3;
  wheels: Wheel[]; // FL, FR, RL, RR
  rpm: number;
  gear: number; // −1 reverse, 0 neutral, 1..5
  clutch: number;
  locked: boolean;
  shiftT: number;
  shiftTo: number;
  sinceShift: number;
  // smoothed inputs
  thr: number;
  brk: number;
  str: number;
  hb: number;
  rev: number; // seconds held towards reverse (or back)
  helping: number; // 1 ABS, 2 traction, 4 stability, acting now
  temp: number; // 0 cold .. 0.55 warm .. 1 hot
  fuel: number; // litres
  odo: number; // km
  t: number;
  still: number; // seconds at rest (asleep past 1.5)
  belly: number; // the underside in the snow (m)
  drowned?: boolean; // driven into water to its floor: the engine dead, it won't start (plan 66)
  hit: Hit | null;
  low: boolean; // the 4x4's low range
  lock: boolean; // its centre diff locked
}

// ── vectors (plain, allocation-light) ────────────────────────────────────────
const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
function rot(q: Quat, v: V3, o: V3): V3 {
  // o = q · v · q⁻¹
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  o.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
  o.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
  o.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
  return o;
}
function _unrot(q: Quat, v: V3, o: V3): V3 {
  return rot({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, v, o);
}
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
function _cross(a: V3, b: V3, o: V3): V3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
}
function _norm(a: V3): V3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  a.x /= l;
  a.y /= l;
  a.z /= l;
  return a;
}
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const _smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const _toward = (x: number, to: number, up: number, down: number, dt: number) =>
  to > x ? Math.min(to, x + up * dt) : Math.max(to, x - down * dt);

/** A turn about the vertical: the car's heading `a` (atan2 of its forward's z, x). */
export function headingQuat(a: number): Quat {
  // a turn of −a about y takes the car's x (forward) to (cos a, 0, sin a)
  return { x: 0, y: Math.sin(-a / 2), z: 0, w: Math.cos(-a / 2) };
}
/** The heading of a car's orientation. */
export function headingOf(q: Quat): number {
  const f = rot(q, v3(1, 0, 0), v3());
  return Math.atan2(f.z, f.x);
}

// ── the wheels' places ───────────────────────────────────────────────────────
/** A wheel's mount (car-local, from the CoG) and its spring's static compression. */
export function mounts(spec: CarSpec): { x: number; y: number; z: number; c0: number }[] {
  const rearL = spec.wheelbase - spec.front;
  const out: { x: number; y: number; z: number; c0: number }[] = [];
  for (const front of [true, false])
    for (const side of [-1, 1]) {
      const ax = spec.axles[front ? 0 : 1];
      const share = (front ? rearL : spec.front) / spec.wheelbase / 2;
      const c0 = (spec.mass * G * share) / ax.k;
      const x = front ? spec.front : -rearL;
      const y = -spec.cog + spec.wheel.r + SMAX - c0;
      out.push({ x, y, z: (side * spec.track) / 2, c0 });
    }
  return out;
}

export function createCar(spec: CarSpec, x: number, y: number, z: number, a: number): CarState {
  const m = mounts(spec);
  const wheels: Wheel[] = m.map((mt) => ({
    c: mt.c0,
    cv: 0,
    w: 0,
    turn: 0,
    steer: 0,
    load: 0,
    kappa: 0,
    alpha: 0,
    used: 0,
    slip: 0,
    ground: "asphalt" as Ground,
    contact: true,
    sink: 0,
    dig: 0,
    hold: false,
    hx: 0,
    hz: 0,
    px: 0,
    py: 0,
    pz: 0,
    fx: 0,
    fy: 0,
    vx: 0,
  }));
  return {
    spec,
    p: v3(x, y + spec.cog, z),
    q: headingQuat(a),
    v: v3(),
    w: v3(),
    wheels,
    rpm: 0,
    gear: 0,
    clutch: 0,
    locked: false,
    shiftT: 0,
    shiftTo: 0,
    sinceShift: 9,
    thr: 0,
    brk: 0,
    str: 0,
    hb: 0,
    rev: 0,
    helping: 0,
    temp: 0.1,
    fuel: spec.fuel.litres * 0.7,
    odo: 0,
    t: 0,
    still: 0,
    belly: 0,
    hit: null,
    low: false,
    lock: false,
  };
}

/** Put a car down on the ground where it stands: its wheels on the land, leaning with the slope,
 *  its springs at rest (a car parked on a hill, a car spawned). Keeps its heading. */
export function settle(s: CarState, world: CarWorld) {
  const spec = s.spec;
  const a = headingOf(s.q);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const rearL = spec.wheelbase - spec.front;
  const at = (fx: number, fz: number) => world.height(s.p.x + ca * fx - sa * fz, s.p.z + sa * fx + ca * fz);
  const hf = (at(spec.front, -spec.track / 2) + at(spec.front, spec.track / 2)) / 2;
  const hr = (at(-rearL, -spec.track / 2) + at(-rearL, spec.track / 2)) / 2;
  const hl = (at(spec.front, -spec.track / 2) + at(-rearL, -spec.track / 2)) / 2;
  const hrt = (at(spec.front, spec.track / 2) + at(-rearL, spec.track / 2)) / 2;
  const pitch = Math.atan2(hf - hr, spec.wheelbase); // nose up (+)
  const roll = Math.atan2(hrt - hl, spec.track); // right side up (+)
  // heading about y, then pitch about the car's z, then roll about its x
  const qy = headingQuat(a);
  const qp = { x: 0, y: 0, z: Math.sin(pitch / 2), w: Math.cos(pitch / 2) };
  const qr = { x: Math.sin(-roll / 2), y: 0, z: 0, w: Math.cos(-roll / 2) };
  const q = mul(mul(qy, qp), qr);
  s.q.x = q.x;
  s.q.y = q.y;
  s.q.z = q.z;
  s.q.w = q.w;
  const mid = hf * (rearL / spec.wheelbase) + hr * (spec.front / spec.wheelbase);
  s.p.y = mid + spec.cog / Math.cos(pitch);
  s.v.x = s.v.y = s.v.z = 0;
  s.w.x = s.w.y = s.w.z = 0;
  const m = mounts(spec);
  s.wheels.forEach((wh, i) => {
    wh.c = m[i].c0;
    wh.cv = 0;
    wh.w = 0;
    wh.hold = false;
  });
}
function mul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** The engine on (idling) or off. */
export function setEngine(s: CarState, on: boolean) {
  if (s.drowned) on = false;
  s.rpm =
    on && (s.fuel > 0 || s.spec.pushed) ? s.spec.engine.idle + (s.spec.pushed ? 60 : 400 * (1 - s.temp / 0.55)) : 0;
}

/** The water over the ground (m) at which a car's engine drowns (plan 66, S5). */
export const DROWN = 0.5;
/** …and deep enough that its people are out of it, swimming. */
export const SUNK = 1.2;

/** What the gauges and the sound read. */
export function readout(s: CarState) {
  const X1 = rot(s.q, v3(1, 0, 0), v3());
  const vf = dot(s.v, X1);
  return {
    kmh: vf * 3.6,
    speed: Math.hypot(s.v.x, s.v.z),
    rpm: s.rpm,
    gear: s.shiftT > 0 ? s.shiftTo : s.gear,
    shifting: s.shiftT > 0,
    beta: Math.atan2(dot(s.v, rot(s.q, v3(0, 0, 1), v3())), Math.max(0.5, Math.abs(vf))),
  };
}
