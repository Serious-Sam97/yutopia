import { blend, curve, footGrip, GRIP, type Grip, type Ground } from "./grip.ts";
import { type CarSpec, torqueAt } from "./specs.ts";

// The car's physics (docs/plan/28-the-car.md, M0–M8): a rigid body on four
// raycast wheels over the Grounds' heightfield. Springs, dampers and anti-roll
// bars; a tyre per wheel (slip ratio and angle on a friction ellipse, a curve
// per surface, load sensitivity); the engine, clutch, gearbox and an open
// differential; brakes and the handbrake; the helps (ABS, traction, stability,
// the steering and countersteer helpers) on top. Deterministic: the same
// inputs from the same state give the same result, here and on the server.
//
// World axes are the Grounds' building coords (x east, y up, z south). The
// car's own: x forward, y up, z to its right. Fixed steps of `STEP`.

export const STEP = 1 / 120;
const G = 9.81;
const AIR = 1.29; // cold air (kg/m³)
const SMAX = 0.35; // a spring's free length (only differences matter)
const VLOW = 2.5; // below this the tyres' slip is measured against it (no 0/0)
const TAU = Math.PI * 2;

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
  what?: "tree" | "post" | "wall" | "car" | "person" | "fence" | "bank";
}

export interface CarWorld {
  height(x: number, z: number): number;
  ground(x: number, z: number): Ground;
  /** fresh snow on the roads (a storm): 0..1 */
  cover?: number;
  /** …here: less where a plough's been through (wave 3); none: `cover` everywhere */
  coverAt?(x: number, z: number): number;
  solids(x: number, z: number, r: number, out: Solid[]): void;
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
function unrot(q: Quat, v: V3, o: V3): V3 {
  return rot({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, v, o);
}
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
function cross(a: V3, b: V3, o: V3): V3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
}
function norm(a: V3): V3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  a.x /= l;
  a.y /= l;
  a.z /= l;
  return a;
}
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const toward = (x: number, to: number, up: number, down: number, dt: number) =>
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
  s.rpm =
    on && (s.fuel > 0 || s.spec.pushed) ? s.spec.engine.idle + (s.spec.pushed ? 60 : 400 * (1 - s.temp / 0.55)) : 0;
}

// scratch
const X = v3();
const Y = v3();
const Z = v3();
const tmp = v3();
const tmp2 = v3();
const F = v3();
const T = v3();
const solids: Solid[] = [];

/** The grip under a wheel: its ground, the road under a storm's fresh snow. */
function gripOf(world: CarWorld, g: Ground, x?: number, z?: number): Grip {
  const k = world.coverAt && x !== undefined && z !== undefined ? world.coverAt(x, z) : (world.cover ?? 0);
  if (k > 0 && (g === "asphalt" || g === "walk" || g === "slush")) return blend(GRIP[g], GRIP.path, k * 0.85);
  return GRIP[g];
}
/** Wheel i's grip (0, 1 the front axle's): its ground, and what it stands on (a ski, a track). */
function gripAt(world: CarWorld, spec: CarSpec, i: number, g: Ground, x?: number, z?: number): Grip {
  const foot = spec.feet?.[i < 2 ? 0 : 1] ?? "tyre";
  const base = gripOf(world, g, x, z);
  return foot === "tyre" ? base : footGrip(foot, g, base);
}

/** One step of `STEP` seconds. */
const PUSH_N = 650; // N: a shove off the snow
const PUSH_V = 1.5; // m/s: as fast as feet push it (a brisk walk)
export function stepCar(s: CarState, raw: Controls, world: CarWorld, helps: Helps = HELPS) {
  const dt = STEP;
  const spec = s.spec;
  s.t += dt;
  s.hit = null;
  rot(s.q, v3(1, 0, 0), X);
  rot(s.q, v3(0, 1, 0), Y);
  rot(s.q, v3(0, 0, 1), Z);
  const vf = dot(s.v, X);
  const vs = dot(s.v, Z);
  const speed = Math.hypot(s.v.x, s.v.y, s.v.z);

  // ── the driver's hands and feet, through the helps ──
  let wantUp = raw.up;
  let wantDown = raw.down;
  if (s.gear === -1 && helps.auto) [wantUp, wantDown] = [raw.down, raw.up]; // (in reverse S drives, W brakes)
  const rateUp = raw.digital ? 1 / 0.18 : 1 / 0.05;
  s.thr = toward(s.thr, wantUp, rateUp, raw.digital ? 1 / 0.1 : 1 / 0.05, dt);
  s.brk = toward(s.brk, wantDown, raw.digital ? 1 / 0.12 : 1 / 0.04, 1 / 0.08, dt);
  s.hb = toward(s.hb, raw.hand, 1 / 0.08, 1 / 0.12, dt);
  // reverse: S held at a stop puts it in reverse; W held at a stop (in reverse) back into first
  if (helps.auto) {
    const stopped = Math.abs(vf) < 0.7;
    const towards = s.gear === -1 ? raw.up > 0.5 && raw.down < 0.05 : raw.down > 0.5 && raw.up < 0.05;
    if (!towards) s.rev = 0;
    else if (stopped && s.rev >= 0) s.rev += dt;
    if (s.rev > 0.3) {
      s.rev = -1; // (once per hold)
      shift(s, s.gear === -1 ? 1 : -1);
      s.thr = 0;
    }
  } else {
    if (raw.shiftUp) shift(s, Math.min(spec.gears.length - 2, s.gear + 1));
    if (raw.shiftDown && (s.gear > 1 || Math.abs(vf) < 1.5)) shift(s, Math.max(-1, s.gear - 1));
  }
  // the steering: limited by speed so the front tyres stay near their peak (keys), and the
  // countersteer helper leaning into a slide
  const front = gripAt(world, spec, 0, s.wheels[0].ground, s.wheels[0].px, s.wheels[0].pz);
  let maxSteer = spec.steer.max;
  if (helps.steer) {
    const lat = (spec.wheelbase * front.mu * G) / Math.max(1, vf * vf);
    // (the angle that has the front tyres at their peak in the tightest turn the grip allows)
    maxSteer = Math.min(spec.steer.max, front.alpha * 0.5 + lat * 0.8);
  }
  const target = clamp(raw.steer, -1, 1) * maxSteer;
  const rate = raw.digital
    ? (target * s.str < 0 || Math.abs(target) < Math.abs(s.str) ? 3.2 : 2.2) * (1 - 0.5 * smooth(5, 30, speed))
    : 6;
  s.str = toward(s.str, target, rate, rate, dt);
  let steer = s.str;
  const beta = Math.atan2(vs, Math.max(0.5, Math.abs(vf)));
  if (helps.counter > 0 && vf > 2) {
    // (as the tail swings out the helper takes the wheel: less of the driver's lock, more
    // of the slide's own angle — a keyboard can hold a drift instead of spinning)
    const k = helps.counter * smooth(2, 5, vf);
    steer = steer * (1 - 0.8 * k * smooth(0.15, 0.6, Math.abs(beta))) + k * clamp(beta, -0.6, 0.6);
  }
  steer = clamp(steer, -spec.steer.max, spec.steer.max);

  // throttle: the rev limiter, idle, traction control; the stability control's brake
  let thr = s.thr;
  s.helping = 0;
  const idleRpm = spec.engine.idle + 250 * clamp(1 - s.temp / 0.55, 0, 1);
  const driven = spec.drive === "all" ? [0, 1, 2, 3] : [2, 3];
  // traction control: a driven wheel spinning past its peak is braked (the torque goes to the
  // other one, over the open diff); both spinning, the throttle is eased
  const tcsBrake = [0, 0, 0, 0];
  if (helps.tcs && s.gear !== 0) {
    let worst = Number.POSITIVE_INFINITY;
    for (const i of driven) {
      const wh = s.wheels[i];
      const g = gripAt(world, spec, i, wh.ground, wh.px, wh.pz);
      // (spinning the way it's driven: forwards, or backwards in reverse)
      const dir = s.gear === -1 ? -1 : 1;
      const over = dir * (wh.w * spec.wheel.r - wh.vx) - Math.max(0.3, g.kappa * 1.3 * Math.abs(wh.vx));
      worst = Math.min(worst, over);
      if (over > 0 && wh.contact) {
        tcsBrake[i] = Math.min(900, over * 500);
        s.helping |= 2;
      }
    }
    if (worst > 0) thr *= clamp(1 - worst * 1.5, 0.1, 1);
    // (and cornering hard: the driven tyres past their combined peak — no power to the slide)
    let used = 0;
    for (const i of driven) used = Math.max(used, s.wheels[i].used);
    if (used > 1.05 && Math.abs(vs) > 0.3) {
      thr *= clamp(1 - (used - 1.05) * 2.5, 0.15, 1);
      s.helping |= 2;
    }
  }
  const escBrake = [0, 0, 0, 0];
  if (helps.esc && vf > 3) {
    // oversteer: the car turning faster than its wheels ask (or the grip allows), or the tail
    // out past 0.12 rad — brake the outside front, ease the throttle
    const yaw = -dot(s.w, Y); // (turning right: +)
    const ask = (vf * Math.tan(s.wheels[0].steer + s.wheels[1].steer) * 0.5) / spec.wheelbase;
    const can = (front.mu * G) / Math.max(3, vf);
    const ref = Math.sign(ask) * Math.min(Math.abs(ask), can);
    const excess =
      Math.sign(yaw) === Math.sign(ref) || Math.abs(ref) < 0.02
        ? Math.abs(yaw) - Math.abs(ref)
        : Math.abs(yaw) + Math.abs(ref);
    const over = Math.max(excess - 0.12, Math.abs(beta) - 0.12);
    if (over > 0) {
      const outer = yaw > 0 ? 0 : 1;
      escBrake[outer] = Math.min(1500, 3000 * over);
      thr *= clamp(1 - over * 4, 0, 1);
      s.helping |= 4;
    }
  }
  if (s.rpm > spec.engine.limit) thr = 0;
  else if (s.rpm < idleRpm && s.rpm > 50) thr = Math.max(thr, clamp((idleRpm - s.rpm) / 300, 0, 0.35));

  // ── the drivetrain: engine, clutch, gearbox ──
  if (s.shiftT > 0) {
    s.shiftT -= dt;
    if (s.shiftT <= 0) s.gear = s.shiftTo;
  }
  s.sinceShift += dt;
  const ratio = (spec.gears[s.gear + 1] ?? 0) * spec.final * (s.low && spec.low ? spec.low : 1);
  let win = 0;
  for (const i of driven) win += s.wheels[i].w;
  win = (win / driven.length) * ratio; // the gearbox's input (engine side), rad/s
  let we = (s.rpm * TAU) / 60;
  const running = s.rpm > 50;
  const te = running
    ? thr * torqueAt(spec, s.rpm) - (1 - thr) * (spec.engine.drag[0] + spec.engine.drag[1] * s.rpm)
    : 0;
  // the clutch (always automatic: in at speed, slipping to pull away, out at a stop and while shifting)
  let want = 0;
  if (s.shiftT <= 0 && s.gear !== 0 && running) {
    const rin = (Math.abs(win) * 60) / TAU;
    if (rin > idleRpm + 120) want = 1;
    // (biting from just over idle — a sedan's — or, a belt drive's, up where its engine makes its power)
    else {
      const [from, span] = spec.engage ?? [idleRpm + 80, 900];
      want = s.thr > 0.02 ? clamp((s.rpm - from) / span, 0, 1) : 0;
    }
  }
  // (and the engine's braking locking the driven wheels on ice: the clutch lets go)
  if (helps.tcs && want > 0 && thr < 0.05) {
    let lock = 0;
    for (const i of driven) lock += s.wheels[i].kappa * (s.gear === -1 ? -1 : 1);
    if (lock / driven.length < -0.25) want = 0;
  }
  s.clutch = toward(s.clutch, want, 4, 10, dt);
  const n = driven.length;
  const drive = [0, 0, 0, 0];
  let reflect = 0; // the engine's inertia seen at each driven wheel when the clutch is locked
  if (ratio === 0 || s.clutch < 0.01) {
    s.locked = false;
    if (running) we += (te / spec.engine.inertia) * dt;
  } else if (s.locked) {
    const t = te * ratio * spec.efficiency;
    for (const i of driven) drive[i] = t / n;
    reflect = (spec.engine.inertia * ratio * ratio) / n;
    if (s.clutch < 0.9 || Math.abs(te) > s.clutch * spec.clutch) s.locked = false;
  } else {
    const cap = s.clutch * spec.clutch;
    const iw = spec.wheel.inertia * n;
    const eq = (we - win) / (dt * (1 / spec.engine.inertia + (ratio * ratio) / iw));
    const tc = clamp(eq, -cap, cap);
    we += ((te - tc) / spec.engine.inertia) * dt;
    for (const i of driven) drive[i] = (tc * ratio * spec.efficiency) / n;
    if (s.clutch > 0.95 && Math.abs(we - win) < 3) s.locked = true;
  }
  // pushed (the toboggan): no engine at the wheels — they run free; W (S: back) is a shove off the
  // ground with the feet (on the body, not through the runners), as hard as a person pushes, up to
  // walking pace and no more (on ice the feet slip)
  const shoveF = v3();
  if (spec.pushed) {
    s.locked = false;
    reflect = 0;
    drive.fill(0);
    const back = s.gear === -1 ? -1 : 1;
    const f = rot(s.q, v3(1, 0, 0), v3());
    const vf = (s.v.x * f.x + s.v.z * f.z) * back;
    const g = s.wheels[0].ground;
    const feet = g === "ice" || g === "blackice" ? 0.35 : 1;
    const shove =
      s.gear === 0 || !s.wheels.some((w) => w.contact) ? 0 : s.thr * PUSH_N * feet * clamp((PUSH_V - vf) / 0.3, 0, 1);
    shoveF.x = f.x * shove * back;
    shoveF.z = f.z * shove * back;
  }
  // the gearbox shifting itself
  if (helps.auto && s.shiftT <= 0 && s.sinceShift > 0.7 && s.gear >= 1) {
    const rin = (Math.abs(win) * 60) / TAU;
    let spin = 0;
    let peak = 0;
    for (const i of driven) {
      spin += s.wheels[i].kappa;
      peak += gripAt(world, spec, i, s.wheels[i].ground, s.wheels[i].px, s.wheels[i].pz).kappa;
    }
    spin /= n;
    peak /= n;
    const ground = s.wheels[2].contact || s.wheels[3].contact;
    // (shifting up short of its limiter: the pickup's V8 runs out of revs at 5000; down well below that)
    const up = spec.shiftAt ?? Math.min(2300 + 3300 * s.thr, spec.engine.limit - 250);
    const down = Math.min(1100 + 1900 * s.thr, up * 0.55);
    // (not while it's spinning up — past what the ground's grip peaks at, or the traction control's)
    if (rin > up && s.gear < spec.gears.length - 2 && spin < Math.max(0.3, peak * 1.6) && ground) shift(s, s.gear + 1);
    else if (rin < down && s.gear > 1) {
      const next = (rin * (spec.gears[s.gear] ?? 1)) / (spec.gears[s.gear + 1] ?? 1);
      if (next < spec.engine.limit - 400) shift(s, s.gear - 1);
    }
  }
  if (helps.auto && s.gear === 0 && s.thr > 0.05 && s.shiftT <= 0) shift(s, 1);

  // ── the wheels: springs, tyres, spin ──
  const m = mounts(spec);
  const wb = spec.wheelbase;
  const turnR = Math.abs(steer) > 1e-4 ? wb / Math.tan(Math.abs(steer)) : 1e9;
  F.x = 0;
  F.y = -spec.mass * G;
  F.z = 0;
  T.x = T.y = T.z = 0;
  const addForce = (px: number, py: number, pz: number, fx: number, fy: number, fz: number) => {
    F.x += fx;
    F.y += fy;
    F.z += fz;
    const rx = px - s.p.x;
    const ry = py - s.p.y;
    const rz = pz - s.p.z;
    T.x += ry * fz - rz * fy;
    T.y += rz * fx - rx * fz;
    T.z += rx * fy - ry * fx;
  };
  const comp = [0, 0, 0, 0];
  const mountW = [v3(), v3(), v3(), v3()];
  // springs first (the anti-roll bars need both sides)
  for (let i = 0; i < 4; i++) {
    const wh = s.wheels[i];
    const mt = m[i];
    const ax = spec.axles[i < 2 ? 0 : 1];
    const M = mountW[i];
    rot(s.q, v3(mt.x, mt.y, mt.z), M);
    M.x += s.p.x;
    M.y += s.p.y;
    M.z += s.p.z;
    // down the body's −y to the ground (twice: the ground under where the wheel lands)
    const dy = -Y.y || -1;
    let len = SMAX;
    for (let k = 0; k < 2; k++) {
      const cx = M.x - Y.x * len;
      const cz = M.z - Y.z * len;
      wh.ground = world.ground(cx, cz);
      const gh = world.height(cx, cz) - wh.sink;
      len = (M.y - gh - spec.wheel.r) / -dy;
    }
    const cMin = mt.c0 - ax.droop;
    let c = SMAX - len;
    // (on its side or its roof, no wheel touches; a wheel driven past its bump stop stays there:
    // the underside takes the rest)
    wh.contact = c >= cMin && Y.y > 0.35;
    if (!wh.contact) c = cMin;
    c = Math.min(c, ax.travel + 0.12);
    wh.cv = (c - wh.c) / dt;
    wh.c = c;
    comp[i] = c;
  }
  const loads = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const wh = s.wheels[i];
    if (!wh.contact) continue;
    const ax = spec.axles[i < 2 ? 0 : 1];
    const other = i ^ 1;
    let f = ax.k * Math.max(0, wh.c) + (wh.cv > 0 ? ax.bump : ax.rebound) * wh.cv;
    f += ax.arb * (wh.c - (s.wheels[other].contact ? comp[other] : m[other].c0 - ax.droop));
    if (wh.c > ax.travel) f += ax.k * 9 * (wh.c - ax.travel) + 4 * ax.bump * Math.max(0, wh.cv);
    loads[i] = clamp(f, 0, spec.mass * G * 3);
  }
  for (let i = 0; i < 4; i++) {
    const wh = s.wheels[i];
    const ax = spec.axles[i < 2 ? 0 : 1];
    const isFront = i < 2;
    const side = i % 2 === 0 ? -1 : 1;
    // its steer (Ackermann: the inside wheel turns more)
    let st = 0;
    if (isFront && Math.abs(steer) > 1e-4) {
      const inside = Math.sign(steer) === side;
      st = Math.sign(steer) * Math.atan(wb / Math.max(0.5, turnR + (inside ? -1 : 1) * spec.track * 0.35));
    }
    wh.steer = st;
    const N = loads[i];
    wh.load = N;
    const M = mountW[i];
    const len = SMAX - wh.c;
    const cx = M.x - Y.x * len;
    const cy = M.y - Y.y * len;
    const cz = M.z - Y.z * len;
    // the ground's normal
    const e = 0.3;
    const nx = -(world.height(cx + e, cz) - world.height(cx - e, cz)) / (2 * e);
    const nz = -(world.height(cx, cz + e) - world.height(cx, cz - e)) / (2 * e);
    const nn = norm(v3(nx, 1, nz));
    const px = cx - nn.x * spec.wheel.r;
    const py = cy - nn.y * spec.wheel.r;
    const pz = cz - nn.z * spec.wheel.r;
    wh.px = px;
    wh.py = py;
    wh.pz = pz;
    // the brakes on this wheel
    let tb = s.brk * ax.brake + escBrake[i] + tcsBrake[i];
    if (!isFront) tb += s.hb * spec.hand;
    if (helps.hold && !spec.pushed && Math.abs(vf) < 0.25 && s.thr < 0.02 && speed < 0.4)
      tb = Math.max(tb, ax.brake * 0.4);
    const inertia = spec.wheel.inertia + (driven.includes(i) ? reflect : 0);
    if (!wh.contact || N <= 0) {
      // in the air: it spins on under drive and brakes
      wh.w += (drive[i] / inertia) * dt;
      const db = (tb / inertia) * dt;
      wh.w = Math.abs(wh.w) <= db ? 0 : wh.w - Math.sign(wh.w) * db;
      wh.kappa = wh.alpha = wh.used = wh.slip = wh.fx = wh.fy = 0;
      wh.hold = false;
      wh.turn = (wh.turn + wh.w * dt) % TAU;
      continue;
    }
    // the wheel's forward and its right, in the ground's plane
    const fl = v3(Math.cos(st), 0, Math.sin(st));
    const W = rot(s.q, fl, v3());
    const wn = dot(W, nn);
    W.x -= nn.x * wn;
    W.y -= nn.y * wn;
    W.z -= nn.z * wn;
    norm(W);
    const S = norm(cross(W, nn, v3()));
    // the contact patch's velocity
    cross(s.w, v3(px - s.p.x, py - s.p.y, pz - s.p.z), tmp);
    const vpx = s.v.x + tmp.x;
    const vpy = s.v.y + tmp.y;
    const vpz = s.v.z + tmp.z;
    const vx = vpx * W.x + vpy * W.y + vpz * W.z;
    const vy = vpx * S.x + vpy * S.y + vpz * S.z;
    wh.vx = vx;
    const g = gripAt(world, spec, i, wh.ground, px, pz);
    const mu = g.mu * clamp((N / 3200) ** -0.1, 0.8, 1.25);
    const R = spec.wheel.r;
    const vden = Math.max(Math.abs(vx), VLOW);
    const force = (w: number) => {
      const kappa = (w * R - vx) / vden;
      const alpha = Math.atan(vy / vden);
      const sx = kappa / g.kappa;
      const sy = alpha / g.alpha;
      const sl = Math.hypot(sx, sy);
      if (sl < 1e-9) return { fx: 0, fy: 0, kappa, alpha, sl };
      const f = mu * N * curve(g, sl);
      return { fx: (f * sx) / sl, fy: (-f * sy) / sl, kappa, alpha, sl };
    };
    // the spin, implicitly (a stiff tyre on a light wheel): backward Euler, linearised
    const f0 = force(wh.w);
    const dw = 0.05;
    const k = Math.max(0, (force(wh.w + dw).fx - f0.fx) / dw);
    const den = inertia + dt * R * k;
    let w1 = wh.w + (dt * (drive[i] - f0.fx * R)) / den;
    let db = (tb * dt) / den;
    // ABS: let a locking wheel go
    if (helps.abs && tb > 0 && Math.abs(vx) > 2 && f0.kappa * Math.sign(vx) < -Math.max(0.1, g.kappa * 1.2)) {
      db *= 0.25;
      s.helping |= 1;
    }
    w1 = Math.abs(w1) <= db ? 0 : w1 - Math.sign(w1) * db;
    wh.w = w1;
    let { fx, fy, kappa, alpha, sl } = force(w1);
    // at a stop: held where it stands (sideways always; along, when braked)
    const patch = Math.hypot(vx, vy);
    const braked = tb > 120;
    if (!wh.hold && patch < 0.35 && Math.abs(drive[i]) < 60) {
      wh.hold = true;
      wh.hx = px;
      wh.hz = pz;
    }
    if (wh.hold) {
      const dx = px - wh.hx;
      const dz = pz - wh.hz;
      const lat = dx * S.x + dz * S.z;
      const lon = dx * W.x + dz * W.z;
      const ky = -30000 * lat - 3000 * vy;
      const kx = braked ? -30000 * lon - 3000 * vx : fx;
      if (Math.hypot(kx, ky) > mu * N || patch > 0.9 || (Math.abs(drive[i]) > 60 && !braked)) wh.hold = false;
      else {
        fy = ky;
        fx = kx;
        if (braked) wh.w = 0;
      }
    }
    wh.kappa = kappa;
    wh.alpha = alpha;
    wh.used = sl;
    wh.slip = Math.hypot(w1 * R - vx, vy);
    wh.fx = fx;
    wh.fy = fy;
    wh.turn = (wh.turn + wh.w * dt) % TAU;
    // rolling resistance and the snow it ploughs (and the wheel digging itself in)
    const rr = (g.crr + g.plough * Math.min(Math.abs(vx), 12)) * N * Math.tanh(vx / 0.3);
    const target = g.sink * (1 - 0.4 * smooth(4, 14, Math.abs(vx)));
    // (a spinning wheel digs itself in; rolling packs its rut back down, and so, slowly, does not
    // spinning it — dug in, nothing got it out again: easing it, rocking it, gets you out)
    if (g.sink > 0.04 && Math.abs(kappa) > 0.5) wh.dig = Math.min(g.sink * 0.5, wh.dig + 0.03 * Math.abs(kappa) * dt);
    else if (Math.abs(vx) > 0.4 && Math.abs(kappa) < 0.3) wh.dig = Math.max(-g.sink * 0.35, wh.dig - 0.05 * dt);
    else if (Math.abs(wh.w * R - vx) < 1.1) wh.dig = Math.max(0, wh.dig - 0.02 * dt);
    if (g.sink < 0.01) wh.dig = 0;
    wh.sink = toward(wh.sink, target + wh.dig, 0.4, 0.4, dt);
    // the forces at the contact (the side force up at the roll centre)
    const rc = ax.roll;
    addForce(px, py, pz, Y.x * N, Y.y * N, Y.z * N);
    addForce(
      px + nn.x * rc,
      py + nn.y * rc,
      pz + nn.z * rc,
      W.x * (fx - rr) + S.x * fy,
      W.y * (fx - rr) + S.y * fy,
      W.z * (fx - rr) + S.z * fy,
    );
  }

  // ── the underside in the snow, a bumper on the ground ──
  const b = spec.body;
  const yb = -spec.cog + spec.clearance;
  let belly = 0;
  for (const [lx, lz] of [
    [b.ahead * 0.92, -b.width * 0.38],
    [b.ahead * 0.92, b.width * 0.38],
    [0, -b.width * 0.3],
    [0, b.width * 0.3],
    [-b.behind * 0.92, -b.width * 0.38],
    [-b.behind * 0.92, b.width * 0.38],
  ]) {
    rot(s.q, v3(lx, yb, lz), tmp);
    const px = s.p.x + tmp.x;
    const py = s.p.y + tmp.y;
    const pz = s.p.z + tmp.z;
    const gh = world.height(px, pz);
    const pen = gh - py;
    if (pen <= 0) continue;
    belly = Math.max(belly, pen);
    const g = GRIP[world.ground(px, pz)];
    const soft = g.sink > 0.04;
    cross(s.w, tmp, tmp2);
    const pvx = s.v.x + tmp2.x;
    const pvy = s.v.y + tmp2.y;
    const pvz = s.v.z + tmp2.z;
    const fn = (soft ? 50000 : 300000) * pen + (soft ? 2500 : 9000) * Math.max(0, -pvy);
    const hv = Math.hypot(pvx, pvz);
    const fr = (soft ? 0.4 : 0.35) * fn * Math.min(1, hv / 0.2);
    addForce(px, py, pz, hv > 1e-6 ? (-pvx / hv) * fr : 0, fn, hv > 1e-6 ? (-pvz / hv) * fr : 0);
    if (!soft && pen > 0.02 && -pvy > 0.6 && !s.hit)
      s.hit = { j: spec.mass * -pvy * 0.3, x: px, z: pz, what: "ground", at: s.t };
  }
  s.belly = belly;

  // aero
  const ad = 0.5 * AIR * spec.aero.cda * speed;
  F.x -= ad * s.v.x;
  F.y -= ad * s.v.y;
  F.z -= ad * s.v.z;
  F.x += shoveF.x;
  F.z += shoveF.z;

  // ── integrate (asleep at rest: the holds keep it there) ──
  const resting = speed < 0.05 && Math.hypot(s.w.x, s.w.y, s.w.z) < 0.05 && s.thr < 0.01 && Math.abs(raw.steer) < 0.01;
  s.still = resting ? s.still + dt : 0;
  if (s.still < 1.5) {
    s.v.x += (F.x / spec.mass) * dt;
    s.v.y += (F.y / spec.mass) * dt;
    s.v.z += (F.z / spec.mass) * dt;
    unrot(s.q, T, tmp);
    unrot(s.q, s.w, tmp2);
    const [ix, iy, iz] = spec.inertia;
    // (Euler's equations, the gyroscopic term)
    const gx = (iz - iy) * tmp2.y * tmp2.z;
    const gy = (ix - iz) * tmp2.z * tmp2.x;
    const gz = (iy - ix) * tmp2.x * tmp2.y;
    tmp2.x += ((tmp.x - gx) / ix) * dt;
    tmp2.y += ((tmp.y - gy) / iy) * dt;
    tmp2.z += ((tmp.z - gz) / iz) * dt;
    rot(s.q, tmp2, s.w);
    s.p.x += s.v.x * dt;
    s.p.y += s.v.y * dt;
    s.p.z += s.v.z * dt;
    integrate(s.q, s.w, dt);
  } else {
    s.v.x = s.v.y = s.v.z = 0;
    s.w.x = s.w.y = s.w.z = 0;
  }

  // ── what it hits ──
  collide(s, world);

  // the engine's speed: tied to the wheels when the clutch holds
  if (s.locked && ratio !== 0) {
    let w = 0;
    for (const i of driven) w += s.wheels[i].w;
    we = (w / n) * ratio;
  }
  if (running) {
    we = Math.max(we, (idleRpm * 0.55 * TAU) / 60);
    s.rpm = (Math.abs(we) * 60) / TAU;
  }
  // the 4x4's centre diff, locked: the axles turn together
  if (spec.drive === "all" && s.lock) {
    const f = (s.wheels[0].w + s.wheels[1].w) / 2;
    const r = (s.wheels[2].w + s.wheels[3].w) / 2;
    const a = (f + r) / 2;
    for (const i of [0, 1]) s.wheels[i].w += a - f;
    for (const i of [2, 3]) s.wheels[i].w += a - r;
  }
  // warming up, fuel, the odometer
  s.temp = Math.min(0.55, s.temp + (running ? (0.00055 + s.rpm * 0.0000004 + thr * 0.0006) * dt : -0.0002 * dt));
  // (three times a real one's thirst: a tank's an hour or so of driving — the gas station's a
  // place to go; dry, the engine coughs out and stays out)
  if (running && !spec.pushed) s.fuel = Math.max(0, s.fuel - 4.35e-6 * s.rpm * (0.25 + thr) * dt);
  if (running && s.fuel <= 0 && !spec.pushed) s.rpm = 0;
  s.odo += (Math.abs(vf) * dt) / 1000;
}

function shift(s: CarState, to: number) {
  if (to === s.gear || s.shiftT > 0) return;
  s.shiftTo = to;
  s.shiftT = s.spec.shift;
  s.sinceShift = 0;
  s.locked = false;
  s.clutch = 0;
}

function integrate(q: Quat, w: V3, dt: number) {
  const hx = w.x * dt * 0.5;
  const hy = w.y * dt * 0.5;
  const hz = w.z * dt * 0.5;
  const x = q.x + hx * q.w + hy * q.z - hz * q.y;
  const y = q.y + hy * q.w + hz * q.x - hx * q.z;
  const z = q.z + hz * q.w + hx * q.y - hy * q.x;
  const ww = q.w - hx * q.x - hy * q.y - hz * q.z;
  const l = Math.hypot(x, y, z, ww) || 1;
  q.x = x / l;
  q.y = y / l;
  q.z = z / l;
  q.w = ww / l;
}

// ── collisions: the car's footprint (a box) against what's round it ─────────
const nrm = v3();
const CORNERS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
function collide(s: CarState, world: CarWorld) {
  const b = s.spec.body;
  const hx = (b.ahead + b.behind) / 2;
  const hz = b.width / 2;
  const off = (b.ahead - b.behind) / 2;
  const fx = X.x;
  const fz = X.z;
  const fl = Math.hypot(fx, fz) || 1;
  const ax = fx / fl;
  const az = fz / fl;
  // (the box's axes: along ax, az; across −az, ax)
  const cx = s.p.x + ax * off;
  const cz = s.p.z + az * off;
  solids.length = 0;
  world.solids(cx, cz, hx + 2, solids);
  let touched = false;
  let hardest = 0;
  for (const o of solids) {
    let depth = 0;
    let px = 0;
    let pz = 0;
    if (o.kind === "circle") {
      const r = o.r ?? 0.2;
      const dx = o.x - cx;
      const dz = o.z - cz;
      const lu = dx * ax + dz * az;
      const lv = -dx * az + dz * ax;
      const qu = clamp(lu, -hx, hx);
      const qv = clamp(lv, -hz, hz);
      const ex = lu - qu;
      const ev = lv - qv;
      const d = Math.hypot(ex, ev);
      if (d >= r) continue;
      let nu: number;
      let nv: number;
      if (d > 1e-6) {
        nu = -ex / d;
        nv = -ev / d;
        depth = r - d;
      } else {
        // inside the box: out the side it came in by — where it was a step ago, the car moving on
        // (a trunk met at speed is past the bumper before it's seen: out the nearest side, the car
        // slid on along it onto the trunk, impaled for good) — else the nearest side
        const pu = lu + (s.v.x * ax + s.v.z * az) * STEP;
        const pv = lv + (-s.v.x * az + s.v.z * ax) * STEP;
        const wasOut = Math.abs(pu) > hx - 0.05 || Math.abs(pv) > hz - 0.05;
        const du = hx - Math.abs(lu);
        const dv = hz - Math.abs(lv);
        if (wasOut ? Math.abs(pu) - hx > Math.abs(pv) - hz : du < dv) {
          nu = -Math.sign(lu);
          nv = 0;
          depth = du + r;
        } else {
          nu = 0;
          nv = -Math.sign(lv);
          depth = dv + r;
        }
      }
      // the normal pushing the car away, in world x/z
      nrm.x = nu * ax - nv * az;
      nrm.z = nu * az + nv * ax;
      px = o.x + nrm.x * r;
      pz = o.z + nrm.z * r;
    } else {
      // box against box (separating axes in 2D)
      const ox = o.hx ?? 0.5;
      const oz = o.hz ?? 0.5;
      const oa = o.a ?? 0;
      const bx = Math.cos(oa);
      const bz = Math.sin(oa);
      const axes = [
        [ax, az],
        [-az, ax],
        [bx, bz],
        [-bz, bx],
      ];
      const dx = o.x - cx;
      const dz = o.z - cz;
      let best = Number.POSITIVE_INFINITY;
      let bnx = 0;
      let bnz = 0;
      let sep = false;
      for (const [ux, uz] of axes) {
        const ra = hx * Math.abs(ux * ax + uz * az) + hz * Math.abs(-ux * az + uz * ax);
        const rb = ox * Math.abs(ux * bx + uz * bz) + oz * Math.abs(-ux * bz + uz * bx);
        const dd = dx * ux + dz * uz;
        const ov = ra + rb - Math.abs(dd);
        if (ov <= 0) {
          sep = true;
          break;
        }
        if (ov < best) {
          best = ov;
          const sg = dd > 0 ? -1 : 1;
          bnx = ux * sg;
          bnz = uz * sg;
        }
      }
      if (sep) continue;
      depth = best;
      nrm.x = bnx;
      nrm.z = bnz;
      // the contact: the corners of either box inside the other, averaged (a corner into a
      // side hits there; flat against flat, the middle of where they touch — no spin from it)
      let cpx = 0;
      let cpz = 0;
      let cn = 0;
      const inBox = (
        qx: number,
        qz: number,
        bx0: number,
        bz0: number,
        ux: number,
        uz: number,
        ex: number,
        ez: number,
      ) => {
        const dx0 = qx - bx0;
        const dz0 = qz - bz0;
        return Math.abs(dx0 * ux + dz0 * uz) <= ex + 0.02 && Math.abs(-dx0 * uz + dz0 * ux) <= ez + 0.02;
      };
      for (const [su, sv] of CORNERS) {
        const qx = cx + ax * hx * su - az * hz * sv;
        const qz = cz + az * hx * su + ax * hz * sv;
        if (inBox(qx, qz, o.x, o.z, bx, bz, ox, oz)) {
          cpx += qx;
          cpz += qz;
          cn++;
        }
        const rx0 = o.x + bx * ox * su - bz * oz * sv;
        const rz0 = o.z + bz * ox * su + bx * oz * sv;
        if (inBox(rx0, rz0, cx, cz, ax, az, hx, hz)) {
          cpx += rx0;
          cpz += rz0;
          cn++;
        }
      }
      if (cn) {
        px = cpx / cn;
        pz = cpz / cn;
      } else {
        // (edges crossing: halfway between the centres, on the car's face)
        px = cx - nrm.x * (hx * Math.abs(nrm.x * ax + nrm.z * az) + hz * Math.abs(-nrm.x * az + nrm.z * ax));
        pz = cz - nrm.z * (hx * Math.abs(nrm.x * ax + nrm.z * az) + hz * Math.abs(-nrm.x * az + nrm.z * ax));
      }
    }
    nrm.y = 0;
    // push out (a soft thing gives a little; something that moves takes its share)
    const mine = o.m ? o.m / (o.m + s.spec.mass) : 1;
    const push = (o.soft ? 0.25 : 0.8) * mine;
    const out = Math.max(0, depth - 0.005) * push;
    s.p.x += nrm.x * out;
    s.p.z += nrm.z * out;
    // (the tyres held where they stood move with it: they'd pull it straight back into it)
    for (const w of s.wheels)
      if (w.hold) {
        w.hx += nrm.x * out;
        w.hz += nrm.z * out;
      }
    // the impulse at the contact (at the CoG's height: no roll or pitch from a wall)
    const rx = px - s.p.x;
    const rz = pz - s.p.z;
    // (the other's point of contact moving with it, and turning)
    const qx = px - o.x;
    const qz = pz - o.z;
    const ow = o.wy ?? 0;
    const rvx = s.v.x - s.w.y * rz - ((o.vx ?? 0) - ow * qz);
    const rvz = s.v.z + s.w.y * rx - ((o.vz ?? 0) + ow * qx);
    const vn = rvx * nrm.x + rvz * nrm.z;
    touched = true;
    if (vn >= 0) continue;
    hardest = Math.max(hardest, -vn);
    // (a knock bounces a little; a lean, a slow push, doesn't; a crash crumples, it hardly bounces)
    const e = o.soft ? 0 : 0.22 * smooth(0.6, 3, -vn) * (1 - 0.75 * smooth(4, 12, -vn));
    const rn = rx * nrm.z - rz * nrm.x; // (r × n)·y
    const iy = s.spec.inertia[1];
    // the other's share: its mass, and its turning about its middle (a box's)
    const om = o.m ?? 0;
    const oi = om ? (om * ((o.hx ?? 1) ** 2 + (o.hz ?? 0.5) ** 2) * 4) / 12 : 0;
    const on = qx * nrm.z - qz * nrm.x;
    const inv = (r: number, ro: number) => 1 / s.spec.mass + (r * r) / iy + (om ? 1 / om + (ro * ro) / oi : 0);
    const j = (-(1 + e) * vn) / inv(rn, on);
    // friction along it (metal on metal grinds; a wall's is smoother)
    const tx = -nrm.z;
    const tz = nrm.x;
    const vt = rvx * tx + rvz * tz;
    const rt = rx * tz - rz * tx;
    const ot = qx * tz - qz * tx;
    let jt = -vt / inv(rt, ot);
    const mu = o.soft ? 0.6 : o.what === "car" ? 0.45 : 0.3;
    jt = clamp(jt, -mu * j, mu * j);
    const jx = nrm.x * j + tx * jt;
    const jz = nrm.z * j + tz * jt;
    s.v.x += jx / s.spec.mass;
    s.v.z += jz / s.spec.mass;
    // (a knock turns it, but no one knock sets it spinning: the bodywork gives, the tyres drag)
    s.w.y += clamp((rz * jx - rx * jz) / iy, -1.2, 1.2);
    o.shove?.(-jx, -jz, px, pz);
    s.still = 0;
    if (!s.hit || j > s.hit.j)
      s.hit = { j, x: px, z: pz, what: o.what ?? (o.kind === "box" ? "wall" : "post"), at: s.t, id: o.id, v: -vn };
  }
  // against things (wedged among trunks, along a wall): never spinning like a top — each contact's
  // turn added to the last one's pumped it up and up
  if (touched) s.w.y = clamp(s.w.y, -3, 3);
  // a crash: the wheels stop with it (not still turning at the speed it hit at, driving it on)
  if (hardest > 4) {
    const vf = s.v.x * fx + s.v.z * fz;
    for (const w of s.wheels) if (w.contact) w.w = vf / fl / s.spec.wheel.r;
  }
}

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
