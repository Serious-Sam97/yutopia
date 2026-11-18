// A bicycle on Jolt (docs/plan/101-the-bicycles.md, phase 2): two wheels on a `VehicleConstraint` held up by Jolt's
// motorcycle controller (it leans into the turn by itself), pushed along by its rider's legs (a force, as the
// toboggan's feet), braked by Jolt's brakes; and the arcade layer a bike wants — the steering kept within what the
// ground's grip and the lean allow, the wheelie and the stoppie held at their balance, the hop, the rider's say in
// the air (pitch, the spin), the tricks — and the judge that throws its rider off (a crash, a bad landing, a slide).
//
// Its state is a car's (CarState: the wire, the playback, the sound and the gauges read it): its two wheels
// written into the car's four — FL and FR the front, RL and RR the back. What's only a bike's (the cranks, the gear,
// stood or sat, the trick, the fall) is `bk`.

import { FEEL, softHits } from "../car/drive.ts";
import { blend, GRIP, type Grip, type Ground } from "../car/grip.ts";
import type { CarSpec } from "../car/specs.ts";
import { type CarState, type CarWorld, type Controls, SUNK } from "../car/state.ts";
import type { CarDef, CarRead, WorldCar } from "../physics/car.ts";
import { type BikeSpec, paceOn, treadOn } from "./specs.ts";
import { type Landing, landingOf, newTricks, type TrickId, type Tricks } from "./tricks.ts";

const G = 9.81;
const AIR = 1.29;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const toward = (x: number, to: number, up: number, down: number, dt: number) =>
  to > x ? Math.min(to, x + up * dt) : Math.max(to, x - down * dt);

/** The tyre's spring (Hz) and its damping: no suspension, a fat tyre's give. */
const TYRE_HZ = 5.5;
const TYRE_DAMP = 0.75;
const TRAVEL = 0.05;

/** Why a rider came off. */
export type FallWhy = "crash" | "landing" | "trick" | "sideways" | "endo" | "loop" | "slide" | "over" | "hit";

/** What a bike is doing beyond a car's state (the rider's pose reads it, the wire carries some). */
export interface BikeState {
  /** the cranks' turn (rad) and their speed (rpm), the gear (0: the lowest) */
  crank: number;
  cadence: number;
  gear: number;
  /** pedalling now (0..1: how hard) */
  effort: number;
  /** stood on the pedals (0 sat … 1 stood: a sprint, a climb, the air, a trick) */
  stand: number;
  /** the hop's charge (0..1: crouched for it) */
  charge: number;
  /** in the air, for how long (s); 0 on the ground */
  air: number;
  /** the body's pitch (rad, + nose up) and roll (rad, + leaning to its right), off the world's up */
  pitch: number;
  roll: number;
  /** the wheelie (+) or the stoppie (−) under way: how far, 0..1 */
  wheelie: number;
  /** a foot down (stopped: −1 the left, 1 the right, 0 riding) */
  foot: number;
  /** the trick under way and how far through (0..1) */
  trick: TrickId | null;
  trickT: number;
  /** the brake held (0..1) */
  brake: number;
  /** thrown off: why, when (the sim's clock), how fast it was going (world m/s) — once */
  fell: { why: FallWhy; at: number; v: [number, number, number] } | null;
  /** the last landing (a trick landed, how clean) */
  landed: Landing | null;
  /** its back wheel spinning past the ground (m/s): a climb on ice */
  spin: number;
  /** the lean the rider asks for (rad, + to the right) */
  leanTo: number;
  /** wheeled on foot (F9a): its rider walking beside it; how far they've walked (m, the steps' clock) */
  walk: boolean;
  walked: number;
}

export const newBikeState = (): BikeState => ({
  crank: 0,
  cadence: 0,
  gear: 0,
  effort: 0,
  stand: 0,
  charge: 0,
  air: 0,
  pitch: 0,
  roll: 0,
  wheelie: 0,
  foot: 0,
  trick: null,
  trickT: 0,
  brake: 0,
  fell: null,
  landed: null,
  spin: 0,
  leanTo: 0,
  walk: false,
  walked: 0,
});

/** A bicycle's spec as a Jolt car: its hull round bike and rider, its two wheels (front, back) on their tyres' give,
 *  the front's fork raked, Jolt's motorcycle controller holding its lean; no engine (the rider's push is a force). */
export function bikeDefOf(spec: CarSpec): CarDef {
  const b = spec.bike as BikeSpec;
  const rearL = spec.wheelbase - spec.front;
  const w2 = (2 * Math.PI * TYRE_HZ) ** 2;
  const wheel = (front: boolean) => {
    const [r, width] = b.wheels[front ? 0 : 1];
    const c = front ? b.caster : 0;
    // (at rest, `rest` down its travel: the mount that far back up the fork)
    const rest = Math.max(0, TRAVEL - G / w2);
    return {
      x: (front ? spec.front : -rearL) - rest * Math.sin(c),
      y: -spec.cog + r + rest * Math.cos(c),
      z: 0,
      r,
      width,
      travel: TRAVEL,
      hz: TYRE_HZ,
      damp: TYRE_DAMP,
      preload: 0,
      steer: front ? spec.steer.max : 0,
      brake: b.brakes[front ? 0 : 1],
      hand: front ? 0 : b.brakes[1],
      inertia: front ? 0.08 : 0.1,
      caster: c || undefined,
    };
  };
  // the hull: narrow at the bottom bracket (leant over, it never scrapes before the tyres let go), wide at the bars
  // and the rider's shoulders, the head on top; from the centre of mass
  const y = (h: number) => h - spec.cog;
  const fx = spec.front + b.wheels[0][0] * 0.7;
  const rx = -rearL - b.wheels[1][0] * 0.7;
  const pts: number[] = [];
  const box = (x0: number, x1: number, h: number, hw: number) => {
    for (const x of [x0, x1]) for (const z of [-hw, hw]) pts.push(x, y(h), z);
  };
  box(rx, fx, 0.3, 0.05);
  box(rx + 0.15, fx - 0.1, 0.62, 0.1);
  box(-rearL * 0.6, spec.front * 0.9, spec.body.height - 0.62, spec.body.width / 2);
  box(-0.25, 0.25, spec.body.height, 0.12);
  return {
    mass: spec.mass,
    inertia: spec.inertia,
    hull: { hx: 0.5, hy: 0.5, hz: 0.2, cx: 0, cy: 0, pts },
    wheels: [wheel(true), wheel(false)],
    bars: [],
    drive: {
      torque: 0,
      minRpm: 1,
      maxRpm: 200,
      curve: [
        [0, 1],
        [1, 1],
      ],
      inertia: 0.05,
      damping: 0.05,
      gears: [1],
      reverse: -1,
      shiftUp: 190,
      shiftDown: 2,
      shiftTime: 0.1,
      clutch: 1,
      diffs: [{ l: -1, r: 1, ratio: 1, share: 1, split: 1 }],
    },
    bike: { maxLean: b.maxLean },
    maxTilt: Math.PI,
  };
}

/** What a bike's driving needs besides the car's: the grip under each wheel with its tread. */
function gripOf(world: CarWorld, spec: CarSpec, g: Ground, x: number, z: number, studs: boolean): Grip {
  const k = world.coverAt ? world.coverAt(x, z) : (world.cover ?? 0);
  let base = GRIP[g];
  if (k > 0 && (g === "asphalt" || g === "walk" || g === "slush")) base = blend(GRIP[g], GRIP.path, k * 0.85);
  const b = spec.bike as BikeSpec;
  const [mu, crr, plough, sink] = treadOn(studs ? "studded" : b.tread, g);
  return { ...base, mu: base.mu * mu, crr: base.crr * crr, plough: base.plough * plough, sink: base.sink * sink };
}

/** A bicycle's driving: as `Drive` (car/drive.ts) is a car's — `pre` before the world's step, `post` after. */
export class BikeDrive {
  readonly read: CarRead;
  readonly bk: BikeState = newBikeState();
  readonly tricks: Tricks = newTricks();
  /** flat tyres, the cars' bits (FL FR RL RR: the front 1|2, the back 4|8) */
  flats = 0;
  chains = 0;
  ext: { f: [number, number, number]; at: [number, number, number] } | null = null;
  canRight = false;
  pad = false;
  /** its tyres studded (the winter mountain bike) */
  studs = false;
  /** a single fixed gear: the cranks turn whenever the wheel does (the road-fixed) */
  fixed = false;
  private readonly grips: Grip[] = [GRIP.asphalt, GRIP.asphalt];
  private readonly prevV: [number, number, number] = [0, 0, 0];
  private hopWas = false;
  private trickWas = false;
  /** the front's or the back's grip used past its peak, for how long (s): sliding out */
  private slideT = 0;
  private wasAir = 0;
  private lastPitchUp = 0;
  /** the rider's steering, smoothed (−1..1): the lean asked */
  private leanAsk = 0;
  /** the back brake eased as it locks (0..1) */
  private backEase = 1;
  /** the knocks of the last moment added up (m/s past what the tyres could do; it fades): a crash isn't one frame */
  private knock = 0;

  constructor(
    readonly s: CarState,
    readonly car: WorldCar,
  ) {
    this.read = readOfBike();
    // (its lean is ours — balance(): Jolt's own spring was too slow for a bicycle's light roll, or shook it off)
    car.holdLean(false);
    car.tire = (i, sl, sa, susp) => {
      const g = this.grips[i] ?? GRIP.asphalt;
      const mu = FEEL.mu0 + g.mu * FEEL.mu;
      const pk = g.kappa * FEEL.peak;
      const pa = g.alpha * FEEL.peak;
      const sx = sl / pk;
      const sy = sa / pa;
      const sn = Math.hypot(sx, sy);
      const slide = g.slide + (1 - g.slide) * FEEL.slide;
      const cap = sn <= 1 ? 1 : slide + (1 - slide) * Math.exp(-g.shape * 0.8 * (sn - 1));
      const wl = sn > 1e-3 ? sx / sn : 0.7;
      const wa = sn > 1e-3 ? sy / sn : 0.7;
      const flat = this.flats & (i === 0 ? 3 : 12) ? 0.45 : 1;
      const f = mu * cap * susp * flat;
      this.car.out.long = f * (0.35 + 0.65 * wl);
      this.car.out.lat = f * (0.35 + 0.65 * wa);
    };
  }

  private get b(): BikeSpec {
    return this.s.spec.bike as BikeSpec;
  }

  /** A tyre burst (the cars' bits): flat after. */
  burst(bits: number) {
    this.flats |= bits;
  }

  /** On its wheels again: a bike's picked up by its rider (car/getin's act), never righted by R. */
  right(_world: CarWorld): boolean {
    return false;
  }

  /** Read from Jolt as it is now, nothing counted. */
  prime() {
    const s = this.s;
    const r = this.read;
    this.car.read(r);
    s.p.x = r.p[0];
    s.p.y = r.p[1];
    s.p.z = r.p[2];
    s.q.x = r.q[0];
    s.q.y = r.q[1];
    s.q.z = r.q[2];
    s.q.w = r.q[3];
    s.v.x = r.v[0];
    s.v.y = r.v[1];
    s.v.z = r.v[2];
    this.prevV[0] = s.v.x;
    this.prevV[1] = s.v.y;
    this.prevV[2] = s.v.z;
  }

  /** Thrown off now (a car into it, a shot): the fall's why, its rider let go. */
  throwOff(why: FallWhy) {
    this.fall(why);
  }
  private fall(why: FallWhy) {
    const k = this.bk;
    if (k.fell) return;
    const s = this.s;
    k.fell = { why, at: s.t, v: [s.v.x, s.v.y, s.v.z] };
    k.trick = null;
    k.wheelie = 0;
    k.effort = 0;
    // (no one holding it up: it falls over, its lean let go — tipped its way, or a side, so it never stands balanced)
    this.car.holdLean(false);
    const X = axis(s.q, 1, 0, 0);
    const side = Math.sign(k.roll) || ((s.t * 1000) % 2 < 1 ? 1 : -1);
    const tip = side * 2.2;
    this.car.setVelocity([s.v.x, s.v.y, s.v.z], [s.w.x + X[0] * tip, s.w.y + X[1] * tip, s.w.z + X[2] * tip]);
    s.w.x += X[0] * tip;
    s.w.y += X[1] * tip;
    s.w.z += X[2] * tip;
  }

  /** Before the world's step: the rider's legs, hands and weight; the arcade layer. */
  pre(raw: Controls, world: CarWorld, dt: number) {
    const s = this.s;
    const spec = s.spec;
    const b = this.b;
    const k = this.bk;
    const r = this.read;
    s.t += dt;
    s.hit = null;
    const X = axis(s.q, 1, 0, 0);
    const Y = axis(s.q, 0, 1, 0);
    const Z = axis(s.q, 0, 0, 1);
    const vf = s.v.x * X[0] + s.v.y * X[1] + s.v.z * X[2];
    const speed = Math.hypot(s.v.x, s.v.y, s.v.z);
    const front = r.wheels[0];
    const back = r.wheels[1];
    const onGround = front.contact || back.contact;
    // ── the body's pitch and roll off the world's up ──
    k.pitch = Math.asin(clamp(X[1], -1, 1));
    // (+ leaning to its right: its up tipped toward its right, Z's y going down)
    k.roll = Math.atan2(-Z[1], Y[1]);
    if (k.walk) {
      this.walking(raw, world, dt, X, vf, speed);
      return;
    }
    if (k.fell) {
      // (no rider: nothing but the brakes' drag till it lies still)
      this.car.input(0, 0, 0.3, 0.3);
      this.drag(world, X, speed, dt);
      this.prevV[0] = s.v.x;
      this.prevV[1] = s.v.y;
      this.prevV[2] = s.v.z;
      return;
    }
    this.pad = !raw.digital;
    // ── the grounds under each wheel ──
    for (let i = 0; i < 2; i++) {
      const w = r.wheels[i];
      const x = w.contact ? w.cx : s.p.x;
      const z = w.contact ? w.cz : s.p.z;
      const g = world.ground(x, z);
      s.wheels[i * 2].ground = g;
      s.wheels[i * 2 + 1].ground = g;
      this.grips[i] = gripOf(world, spec, g, x, z, this.studs);
    }
    const muF = FEEL.mu0 + this.grips[0].mu * FEEL.mu;
    const muR = FEEL.mu0 + this.grips[1].mu * FEEL.mu;
    // ── the steering (an arcade bike's): the rider's A/D asks for a lean — as far as the grip and the bike allow —,
    // and the front wheel turns only as much as the lean she has now carries round (a real bike's countersteer, done
    // for her); at a crawl, no lean: the bars turned as they're asked ──
    const leanMost = Math.min(b.maxLean * 0.92, Math.atan(Math.min(muF, muR) * 1.05));
    const fast = smooth(1.2, 4.5, Math.abs(vf));
    const ask = clamp(raw.steer, -1, 1);
    const lockT = raw.digital ? 0.22 : 0.08;
    this.leanAsk = toward(this.leanAsk, ask, 1 / lockT, 1.4 / lockT, dt);
    k.leanTo = this.leanAsk * leanMost * fast;
    const v2 = Math.max(1, vf * vf);
    const byLean = Math.atan((spec.wheelbase * G * Math.tan(k.roll)) / v2);
    const direct = this.leanAsk * spec.steer.max;
    const steer = clamp(direct + (byLean - direct) * fast, -spec.steer.max, spec.steer.max);
    s.str = onGround ? steer : toward(s.str, 0, 2, 2, dt);
    // ── the legs: pedalled (W), stood on the pedals sprinting (Shift + W), freewheeling ──
    const pedal = raw.up > 0.05 && back.contact && k.charge < 0.05;
    const sprint = pedal && !!raw.sprint;
    // (the ground's own pace for its tread: deep snow a crawl on a road bike, the mountain bike's knobblies keep going)
    const pace = Math.min(
      paceOn(this.studs ? "studded" : b.tread, s.wheels[0].ground),
      paceOn(this.studs ? "studded" : b.tread, s.wheels[2].ground),
    );
    const want = (sprint ? b.sprint : b.cruise) * pace * (raw.digital ? 1 : clamp(raw.up, 0, 1));
    let push = 0;
    if (pedal) {
      const aero = 0.5 * AIR * spec.aero.cda * vf * Math.abs(vf);
      const roll = 0.006 * spec.mass * G;
      push = clamp((spec.mass * (want - vf)) / b.tau + aero + roll, 0, b.force * (sprint ? 1.2 : 1));
    }
    // (S from a stop: walked back by the feet, slowly — on the move S brakes)
    const backing = raw.down > 0.5 && raw.up < 0.05 && vf < 0.6 && back.contact && front.contact;
    if (backing) push = clamp((spec.mass * (-1.1 - vf)) / 0.5, -220, 220);
    // (the back tyre's grip the most it takes: past it, it spins — a climb on ice)
    const gripMost = muR * Math.max(0, back.load) * 0.95;
    k.spin = 0;
    if (push > gripMost) {
      k.spin = clamp((push - gripMost) / 60, 0, 6);
      push = gripMost;
    }
    k.effort = toward(
      k.effort,
      pedal ? (sprint ? 1 : 0.55) * clamp(push / (b.force * 0.5) + 0.35, 0.35, 1) : 0,
      4,
      3,
      dt,
    );
    s.thr = k.effort;
    // ── the brakes (S): both, the front the stronger — eased off as it starts to lock (a bike's front locked is a
    // fall: the arcade middle keeps it on the edge) ──
    let brake = backing ? 0 : clamp(raw.down, 0, 1);
    let rearOnly = 0;
    // (each wheel's own: the back one, light as the weight goes forward, would lock at once)
    let backK = 1;
    if (brake > 0.05 && Math.abs(vf) > 1.5) {
      const lockF = front.slipLong / (this.grips[0].kappa * FEEL.peak) - 1.1;
      if (front.contact && lockF > 0) brake *= clamp(1 - lockF * 0.6, 0.4, 1);
      const lockB = back.slipLong / (this.grips[1].kappa * FEEL.peak) - 1.1;
      this.backEase =
        back.contact && lockB > 0 ? Math.max(0.15, this.backEase - dt * 6) : Math.min(1, this.backEase + dt * 3);
      backK = this.backEase;
    }
    k.brake = brake;
    // ── the weight: back (Q) and forward (Z) ──
    const leanIn = clamp(raw.lean ?? 0, -1, 1);
    const P = spec.inertia[2];
    const R = spec.inertia[0];
    const Yi = spec.inertia[1];
    let tz = 0; // about its own z (+ nose up)
    let tx = 0; // about its own x (+ rolling to its left... see below)
    let ty = 0; // about the world's up (+ turning left)
    const ctl = 0.55 + 0.45 * b.trick;
    // the wheelie: weight back and pedalling — the front up, held at its balance
    const wz = s.w.x * Z[0] + s.w.y * Z[1] + s.w.z * Z[2];
    const wx = s.w.x * X[0] + s.w.y * X[1] + s.w.z * X[2];
    const wUp = s.w.y;
    let wheelie = 0;
    const h = spec.cog;
    const dR = spec.wheelbase - spec.front;
    if (onGround && back.contact && leanIn > 0.2 && vf > 0.8) {
      // (about the back tyre's contact: its weight held over it as it comes up — past the natural balance (the centre
      // of gravity right over the contact) a touch, for a trick bike more)
      const balance = 0.36 + 0.14 * b.trick;
      const th = k.pitch;
      const Pe = P + spec.mass * (dR * dR + h * h);
      const hold = spec.mass * G * (dR * Math.cos(th) - h * Math.sin(th));
      const wn = 4 + 2.5 * ctl;
      tz += hold + Pe * (wn * wn * (balance - th) - 2 * wn * wz);
      wheelie = clamp(th / balance, 0, 1);
    } else if (onGround && front.contact && leanIn < -0.2 && brake > 0.3 && vf > 2) {
      // the stoppie: weight forward on the front brake — the back up, held there about the front's contact; the back
      // brake off
      const balance = -(0.26 + 0.12 * b.trick);
      const th = k.pitch;
      const f = spec.front;
      const Pe = P + spec.mass * (f * f + h * h);
      const hold = -spec.mass * G * (f * Math.cos(th) + h * Math.sin(th));
      const wn = 4 + 2.5 * ctl;
      tz += hold + Pe * (wn * wn * (balance - th) - 2 * wn * wz);
      brake = Math.max(brake, 0.85);
      rearOnly = -1;
      wheelie = -clamp(th / balance, 0, 1);
    }
    k.wheelie = toward(k.wheelie, wheelie, 6, 6, dt);
    // ── the hop: Space held, crouched, its charge built; let go, up it goes, the bars pulled ──
    const hopNow = !!raw.hop;
    if (hopNow && onGround) k.charge = Math.min(1, k.charge + dt / b.hopCharge);
    if (!hopNow && this.hopWas && onGround && k.charge > 0.05) {
      const up = b.hop * (0.4 + 0.6 * k.charge);
      this.car.setVelocity(
        [s.v.x, Math.max(s.v.y, 0) + up, s.v.z],
        [s.w.x + Z[0] * 1.2 * ctl, s.w.y + Z[1] * 1.2 * ctl, s.w.z + Z[2] * 1.2 * ctl],
      );
      s.v.y = Math.max(s.v.y, 0) + up;
      this.lastPitchUp = s.t;
    }
    if (!hopNow || !onGround) k.charge = hopNow && !onGround ? k.charge : 0;
    this.hopWas = hopNow;
    // ── in the air: the rider's say — the nose up or down, the spin, kept level side to side; the tricks ──
    const inAir = !onGround;
    if (inAir) {
      k.air += dt;
      // (the weight's keys alone: W is held into a jump, it mustn't tip the nose)
      const pitchIn = leanIn;
      // (a moment after the hop's pull, the nose comes down level again on its own)
      const settle = s.t - this.lastPitchUp > 0.18 ? -k.pitch * 2.2 : 0;
      const wzT = pitchIn * 3.2 * ctl + (pitchIn === 0 ? settle : 0);
      tz += P * 10 * (wzT - wz);
      // the spin (A/D held, no trick key): about the world's up — a 360 held for a second on the BMX
      const spinIn = this.tricks.cur ? 0 : clamp(raw.steer, -1, 1);
      const wyT = -spinIn * (3.8 + 4.8 * b.trick);
      ty += Yi * 14 * (wyT - wUp);
      // (kept level side to side: it lands on its wheels)
      tx += R * (-10 * k.roll - 3 * wx);
      // a trick (E + a way): the tailwhip (E + A/D), the barspin (E), the superman (E + W), the no-hander (E + S)
      const tk = !!raw.trick;
      if (tk && !this.trickWas && k.air > 0.08 && !this.tricks.cur) {
        const id: TrickId =
          raw.up > 0.5
            ? "superman"
            : raw.down > 0.5
              ? "nohander"
              : Math.abs(raw.steer) > 0.5
                ? raw.steer < 0
                  ? "tailwhipL"
                  : "tailwhipR"
                : "barspin";
        this.tricks.start(id, b.trick);
      }
      this.trickWas = tk;
      this.tricks.tick(dt, true, Math.abs(wUp) * dt);
    } else {
      this.trickWas = !!raw.trick;
      this.tricks.tick(dt, false, 0);
    }
    k.trick = this.tricks.cur?.id ?? null;
    k.trickT = this.tricks.cur ? this.tricks.cur.t / this.tricks.cur.len : 0;
    // ── stood or sat: the sprint, a climb, the air, a wheelie, the hop's crouch; a foot down at a stop ──
    const climb = k.pitch > 0.1 && pedal;
    const standWant = sprint || climb || inAir || k.charge > 0.05 || Math.abs(k.wheelie) > 0.3 ? 1 : 0;
    k.stand = toward(k.stand, standWant, 3.5, 2.5, dt);
    k.foot = (speed < 0.7 || backing) && !pedal && onGround ? k.foot || (k.roll < 0 ? -1 : 1) : 0;
    // ── to Jolt: no throttle (the legs are a force), the steering, the brakes (the back's on the hand: Jolt's
    // handbrake is the back wheel's alone) ──
    const frontBrake = rearOnly > 0 ? 0 : brake;
    const backBrake = rearOnly < 0 ? 0 : brake * backK;
    this.car.input(0, s.str / spec.steer.max, frontBrake, backBrake);
    // ── the balance: leant to where the turn asks (the steering's own, so the lean leads the turn as a rider's does),
    // a little toward the foot put down at a stop; kept up, as a rider keeps it ──
    if (onGround) {
      const at = k.foot ? k.foot * 0.09 : k.leanTo;
      // (about its tyres' contact: its own roll and its mass that high over them; gravity's tip at that height undone)
      const h = spec.cog;
      const Re = R + spec.mass * h * h;
      const wn = 7;
      tx += (Re * wn * wn + spec.mass * G * h) * (at - k.roll) - Re * 2 * wn * wx;
    }
    // ── the forces: the legs along it, the rolling, the snow, the air; the rider's torques ──
    let fx = X[0] * push;
    let fy = X[1] * push;
    let fz = X[2] * push;
    const d = this.dragForce(world, X, speed);
    fx += d[0];
    fy += d[1];
    fz += d[2];
    const e = this.ext;
    if (e) {
      fx += e.f[0];
      fy += e.f[1];
      fz += e.f[2];
    }
    const T = [Z[0] * tz + X[0] * tx, Z[1] * tz + X[1] * tx + ty, Z[2] * tz + X[2] * tx];
    this.car.push(fx, fy, fz, T[0], T[1], T[2]);
    softHits(s, this.car, world, X, dt);
    this.prevV[0] = s.v.x;
    this.prevV[1] = s.v.y;
    this.prevV[2] = s.v.z;
  }

  /** (F9a) Wheeled on foot: pushed to a walk (W; Shift a jog, S back), its bars turned as asked, held upright — no
   *  lean, no tricks, no falls; stopped, held still. */
  private walking(raw: Controls, world: CarWorld, dt: number, X: number[], vf: number, speed: number) {
    const s = this.s;
    const spec = s.spec;
    const k = this.bk;
    const r = this.read;
    for (let i = 0; i < 2; i++) {
      const w = r.wheels[i];
      const g = world.ground(w.contact ? w.cx : s.p.x, w.contact ? w.cz : s.p.z);
      s.wheels[i * 2].ground = g;
      s.wheels[i * 2 + 1].ground = g;
      this.grips[i] = gripOf(world, spec, g, s.p.x, s.p.z, this.studs);
    }
    const want = raw.up > 0.05 ? (raw.sprint ? 2.3 : 1.5) : raw.down > 0.05 ? -0.9 : 0;
    const push = clamp((spec.mass * (want - vf)) / 0.35, -260, 260);
    const hold = want === 0 && Math.abs(vf) < 0.4;
    s.str = toward(s.str, clamp(raw.steer, -1, 1) * spec.steer.max * 0.8, 3, 3, dt);
    this.car.input(0, s.str / spec.steer.max, hold ? 0.6 : 0, hold ? 0.6 : 0);
    // (kept upright: the walker's hand on it)
    const Z = axis(s.q, 0, 0, 1);
    const wx = s.w.x * X[0] + s.w.y * X[1] + s.w.z * X[2];
    const R = spec.inertia[0] + spec.mass * spec.cog * spec.cog;
    const tx = (R * 49 + spec.mass * G * spec.cog) * (0 - k.roll) - R * 14 * wx;
    const d = this.dragForce(world, X, speed);
    const T = [X[0] * tx, X[1] * tx, X[2] * tx];
    this.car.push(X[0] * push + d[0], X[1] * push + d[1], X[2] * push + d[2], T[0], T[1], T[2]);
    void Z;
    k.walked += Math.abs(vf) * dt;
    k.effort = 0;
    k.stand = 0;
    k.charge = 0;
    k.foot = 0;
    k.brake = 0;
    k.trick = null;
    s.thr = 0;
    this.prevV[0] = s.v.x;
    this.prevV[1] = s.v.y;
    this.prevV[2] = s.v.z;
  }

  /** The rolling, the snow ploughed and the air against it (N, world). */
  private dragForce(world: CarWorld, X: number[], speed: number): [number, number, number] {
    const s = this.s;
    const r = this.read;
    const vf = s.v.x * X[0] + s.v.y * X[1] + s.v.z * X[2];
    let fx = 0;
    let fy = 0;
    let fz = 0;
    for (let i = 0; i < 2; i++) {
      const w = r.wheels[i];
      if (!w.contact) continue;
      const g = this.grips[i];
      const N = Math.max(0, w.load);
      const flat = this.flats & (i === 0 ? 3 : 12) ? 0.05 : 0;
      const rr = (g.crr + flat + g.plough * Math.min(Math.abs(vf), 12)) * N * Math.tanh(vf / 0.3);
      fx -= X[0] * rr;
      fy -= X[1] * rr;
      fz -= X[2] * rr;
    }
    const wet = world.water?.(s.p.x, s.p.z) ?? 0;
    if (wet > 0.15) {
      const k = s.spec.mass * 2.2 * Math.min(2, wet);
      fx -= s.v.x * k;
      fz -= s.v.z * k;
    }
    const ad = 0.5 * AIR * s.spec.aero.cda * speed;
    fx -= ad * s.v.x;
    fy -= ad * s.v.y;
    fz -= ad * s.v.z;
    return [fx, fy, fz];
  }
  private drag(world: CarWorld, X: number[], speed: number, _dt: number) {
    const d = this.dragForce(world, X, speed);
    this.car.push(d[0], d[1], d[2]);
  }

  /** After the world's step: Jolt's bike read back into the state (its two wheels into the car's four); the cranks;
   *  a knock found; the landing judged; whether its rider stays on. */
  post(world: CarWorld, dt: number, named?: (body: number) => string | undefined) {
    const s = this.s;
    const r = this.read;
    const k = this.bk;
    const spec = s.spec;
    const b = this.b;
    this.car.read(r, (x) => (named?.(x) ? 1 : 0));
    s.p.x = r.p[0];
    s.p.y = r.p[1];
    s.p.z = r.p[2];
    s.q.x = r.q[0];
    s.q.y = r.q[1];
    s.q.z = r.q[2];
    s.q.w = r.q[3];
    s.v.x = r.v[0];
    s.v.y = r.v[1];
    s.v.z = r.v[2];
    s.w.x = r.w[0];
    s.w.y = r.w[1];
    s.w.z = r.w[2];
    const X = axis(s.q, 1, 0, 0);
    const Y = axis(s.q, 0, 1, 0);
    const Z = axis(s.q, 0, 0, 1);
    const vf = s.v.x * X[0] + s.v.y * X[1] + s.v.z * X[2];
    let slid = 0;
    for (let i = 0; i < 2; i++) {
      const w = r.wheels[i];
      const g = this.grips[i];
      const R = b.wheels[i][0];
      for (const j of [i * 2, i * 2 + 1]) {
        const sw = s.wheels[j];
        sw.contact = w.contact;
        const c = TRAVEL - w.len;
        sw.cv = dt > 0 && Number.isFinite(sw.c) ? clamp((c - sw.c) / dt, -5, 5) : 0;
        sw.c = c;
        sw.w = w.spin;
        sw.turn = w.angle % (Math.PI * 2);
        sw.steer = w.steer;
        sw.load = w.load;
        sw.kappa = w.slipLong * Math.sign(sw.w * R - vf || 1);
        sw.alpha = w.slipLat;
        sw.used = Math.hypot(w.slipLong / (g.kappa * FEEL.peak), w.slipLat / (g.alpha * FEEL.peak));
        sw.slip = w.contact ? Math.hypot(sw.w * R - vf, Math.abs(vf) * Math.tan(Math.min(1.4, w.slipLat))) : 0;
        if (w.contact) {
          sw.px = w.cx;
          sw.py = w.cy;
          sw.pz = w.cz;
        }
        sw.vx = vf;
        sw.sink = toward(sw.sink, w.contact ? g.sink * (1 - 0.4 * smooth(4, 14, Math.abs(vf))) : 0, 0.4, 0.4, dt);
      }
      // (sideways past its grip: a locked back wheel skidding straight is no fall)
      if (w.contact) slid = Math.max(slid, w.slipLat / (g.alpha * FEEL.peak));
    }
    // ── the cranks: turned by the legs (and the wheel, a fixed gear's); the gear picked by the cadence ──
    const gears = b.gears;
    const dev = gears[k.gear] ?? gears[0];
    const wheelCad = (60 * Math.max(0, vf)) / dev;
    if (k.effort > 0.05 || this.fixed) {
      // (from a stand the legs turn it slowly before the wheel goes)
      const cad = Math.max(wheelCad, k.effort > 0.05 ? 32 + 40 * k.effort * (1 - smooth(0.5, 3, vf)) : 0);
      k.cadence = cad;
      k.crank = (k.crank + (cad / 60) * Math.PI * 2 * dt) % (Math.PI * 2);
    } else k.cadence = toward(k.cadence, 0, 200, 200, dt);
    if (gears.length > 1) {
      if (wheelCad > 96 && k.gear < gears.length - 1) k.gear++;
      else if (wheelCad < 58 && k.gear > 0) k.gear--;
    }
    s.gear = k.gear + 1;
    s.rpm = k.cadence;
    s.fuel = spec.fuel.litres;
    // ── a hard knock: the velocity changed past what the tyres and brakes could do ──
    const dvx = s.v.x - this.prevV[0];
    const dvy = s.v.y - this.prevV[1];
    const dvz = s.v.z - this.prevV[2];
    const dh = Math.hypot(dvx, dvz);
    const can = 1.6 * G * dt + 0.25;
    this.knock = Math.max(0, this.knock - dt * 12) + Math.max(0, dh - can);
    if (dh > can && !s.hit)
      s.hit = { j: spec.mass * (dh - can * 0.5), x: s.p.x, z: s.p.z, what: "wall", at: s.t, v: dh };
    else if (Math.abs(dvy) > 3 && !s.hit)
      s.hit = { j: spec.mass * Math.abs(dvy) * 0.3, x: s.p.x, z: s.p.z, what: "ground", at: s.t };
    s.odo += (Math.abs(vf) * dt) / 1000;
    s.still = Math.hypot(s.v.x, s.v.y, s.v.z) < 0.05 ? s.still + dt : 0;
    if ((world.water?.(s.p.x, s.p.z) ?? 0) >= SUNK) s.drowned = true;
    k.pitch = Math.asin(clamp(X[1], -1, 1));
    k.roll = Math.atan2(-Z[1], Y[1]);
    if (k.fell || k.walk) return;
    // ── the judge: does the rider stay on? ──
    const onGround = r.wheels[0].contact || r.wheels[1].contact;
    if (onGround && this.wasAir > 0.22) {
      const land = landingOf({
        air: this.wasAir,
        X,
        Y,
        v: [s.v.x, s.v.y, s.v.z],
        vyBefore: this.prevV[1],
        trick: this.tricks.cur,
        skill: b.trick,
        tricks: this.tricks.done,
        spun: this.tricks.spun,
      });
      k.landed = land;
      this.tricks.landed();
      if (!land.clean) this.fall(land.why as FallWhy);
      else if (land.wobble > 0) {
        // (a shaky landing: it loses some of its speed)
        const keep = 1 - 0.3 * land.wobble;
        this.car.setVelocity([s.v.x * keep, s.v.y, s.v.z * keep], [s.w.x, s.w.y, s.w.z]);
      }
    }
    this.wasAir = onGround ? 0 : this.wasAir + dt;
    if (onGround) k.air = 0;
    if (k.fell) return;
    if (this.knock > 3.6) this.fall("crash");
    else if (Math.abs(k.roll) > b.maxLean + 0.3) this.fall("over");
    else if (k.pitch > 1.12 && onGround) this.fall("loop");
    else if (k.pitch < -0.98 && onGround) this.fall("endo");
    else {
      // (sliding out: a tyre past its grip a while, going on — the low side on ice)
      this.slideT = slid > 1.7 && Math.abs(vf) > 3 && onGround ? this.slideT + dt : Math.max(0, this.slideT - dt * 2);
      if (this.slideT > 0.3) this.fall("slide");
    }
  }
}

function axis(q: { x: number; y: number; z: number; w: number }, x: number, y: number, z: number): number[] {
  const ix = q.w * x + q.y * z - q.z * y;
  const iy = q.w * y + q.z * x - q.x * z;
  const iz = q.w * z + q.x * y - q.y * x;
  const iw = -q.x * x - q.y * y - q.z * z;
  return [
    ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  ];
}

function readOfBike(): CarRead {
  const w = () => ({
    contact: false,
    len: 0,
    spin: 0,
    angle: 0,
    steer: 0,
    cx: 0,
    cy: 0,
    cz: 0,
    nx: 0,
    ny: 1,
    nz: 0,
    slipLong: 0,
    slipLat: 0,
    load: 0,
    on: 0,
  });
  return {
    p: [0, 0, 0],
    q: [0, 0, 0, 1],
    v: [0, 0, 0],
    w: [0, 0, 0],
    rpm: 0,
    gear: 0,
    clutch: 0,
    shifting: false,
    wheels: [w(), w()],
  };
}
