// The car on Jolt (docs/plan/92-the-cars.md, phases 1–2): a car's spec made a Jolt car (defOf), and
// its driving — the driver's hands and feet smoothed, the helps, the arcade layer (assist.ts), the
// tyres' grip by the ground under each wheel, what the world does that Jolt doesn't know (rolling
// through snow, the water, the air's drag, a wheel sinking into deep snow) — then Jolt's step read
// back into the car's state (CarState: what the rig, the sound, the gauges and the wire read).
//
// The world is stepped by whoever owns it (the browser's physics, a test): each frame `pre` before
// the step, `post` after.

import type { CarDef, CarRead, WorldCar } from "../physics/car.ts";
import { ASSIST, type AssistState, assist, assistOut, assistState } from "./assist.ts";
import { blend, footGrip, GRIP, type Grip, type Ground } from "./grip.ts";
import type { RutHit } from "./ruts.ts";
import type { CarSpec } from "./specs.ts";
import { type CarState, type CarWorld, type Controls, HELPS, type Helps, type Hit, type Solid, SUNK } from "./state.ts";

const G = 9.81;
const AIR = 1.29;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const toward = (x: number, to: number, up: number, down: number, dt: number) =>
  to > x ? Math.min(to, x + up * dt) : Math.max(to, x - down * dt);

/** The water deep enough that the engine drowns (plan 66, S5). */
export const DROWN_AT = 0.5;

// ── the feel's own numbers (the arcade middle, F1a): on top of each spec's ──
export const FEEL = {
  /** the tyres: peak grip `mu0 + mu ×` the ground's (≥ 1.0 g on asphalt; the low grounds lifted
   *  most: ice still slides, but it can be driven), the slide's floor raised, the peaks a little
   *  wider (broad: a long plateau, a gentle fall) */
  mu0: 0.1,
  mu: 1.08,
  slide: 0.2, // (of what was lost, given back)
  peak: 1.35,
  /** springs (Hz at the wheel) and damping (of critical) */
  hz: [1.75, 1.65],
  damp: 0.55,
  /** the engine's torque × this (quicker: 0–100 in 8–9 s), the brakes', the handbrake's */
  torque: 1.42,
  brakes: 1.25,
  hand: 2.2,
  /** the limited slip at the driven axle (Jolt's ratio: 1.4 a sporting one) */
  lsd: 1.5,
  /** the anti-roll bars × this (plan 92 feedback: at the spec's numbers Jolt's bars all but locked
   *  the roll — 0.2° at 1.1 g, a puck on rails; at this it leans ~3° at 1 g, its weight felt) */
  arb: 0.025,
  /** the clutch: its strength (Jolt's) and how long it takes to bite again after a shift (s) */
  clutch: 20,
  release: 0.3,
  /** the shift's time without drive × this (the spec's are a driver's own; the box changes quicker) */
  shift: 0.5,
};

/** A car's spec as a Jolt car: its hull, four wheels (FL, FR, RL, RR) on their springs, its
 *  engine, gearbox and diffs (the snowcat: two tracks). */
export function defOf(spec: CarSpec): CarDef {
  const rearL = spec.wheelbase - spec.front;
  const b = spec.body;
  const wheels = [true, false].flatMap((front) =>
    [-1, 1].map((side) => {
      const ax = spec.axles[front ? 0 : 1];
      const travel = ax.travel; // (from the bump stop to rest)
      const max = travel + ax.droop;
      const hz = FEEL.hz[front ? 0 : 1];
      const w2 = (2 * Math.PI * hz) ** 2;
      // (at rest it hangs `droop` above full droop: preloaded for what's left of its weight)
      const preload = Math.max(0, G / w2 - ax.droop);
      const yc = -spec.cog + spec.wheel.r; // the wheel's centre at rest
      return {
        x: front ? spec.front : -rearL,
        y: yc + travel,
        z: (side * spec.track) / 2,
        r: spec.wheel.r,
        width: spec.wheel.width,
        travel: max,
        hz,
        damp: FEEL.damp,
        preload,
        steer: front ? spec.steer.max : 0,
        brake: ax.brake * FEEL.brakes,
        hand: front ? 0 : spec.hand * FEEL.hand,
        inertia: spec.wheel.inertia,
      };
    }),
  );
  const c = spec.engine.curve;
  const torque = Math.max(...c.map((p) => p[1]));
  const lim = spec.engine.limit;
  const gears = spec.gears.slice(2);
  const tracked = spec.feet?.[0] === "track" && spec.feet?.[1] === "track";
  const all = spec.drive === "all";
  const drive = {
    torque: spec.pushed ? 0 : torque * FEEL.torque * spec.efficiency,
    minRpm: Math.max(1, spec.engine.idle),
    maxRpm: lim,
    // (Jolt's curve: x the fraction from its least revs to its most)
    curve: c
      .filter((p) => p[0] <= lim * 1.1)
      .map(([r, t]): [number, number] => [(r - spec.engine.idle) / (lim - spec.engine.idle), t / torque]),
    inertia: spec.engine.inertia,
    damping: 0.12 + spec.engine.drag[0] * 0.004,
    gears,
    reverse: -Math.abs(spec.gears[0]), // (Jolt's reverse ratios are negative)
    shiftUp: spec.shiftAt ?? Math.min(spec.engine.redline, lim - 250),
    shiftDown: Math.max(spec.engine.idle * 1.6, (spec.shiftAt ?? spec.engine.redline) * 0.42),
    shiftTime: spec.shift * FEEL.shift,
    clutch: FEEL.clutch,
    release: FEEL.release,
    diffs: all
      ? [
          { l: 0, r: 1, ratio: spec.final, share: 0.42, lsd: FEEL.lsd },
          { l: 2, r: 3, ratio: spec.final, share: 0.58, lsd: FEEL.lsd },
        ]
      : spec.drive === "front"
        ? [{ l: 0, r: 1, ratio: spec.final, share: 1, lsd: FEEL.lsd }]
        : [{ l: 2, r: 3, ratio: spec.final, share: 1, lsd: FEEL.lsd }],
    centre: 1.6,
  };
  return {
    mass: spec.mass,
    inertia: spec.inertia,
    hull: {
      hx: (b.ahead + b.behind) / 2,
      hy: Math.max(0.12, (b.height - spec.clearance) / 2),
      hz: b.width / 2,
      cx: (b.ahead - b.behind) / 2,
      cy: -spec.cog + spec.clearance + Math.max(0.12, (b.height - spec.clearance) / 2),
    },
    wheels,
    bars: [
      { l: 0, r: 1, k: spec.axles[0].arb * FEEL.arb },
      { l: 2, r: 3, k: spec.axles[1].arb * FEEL.arb },
    ],
    drive,
    tracks: tracked
      ? [
          { driven: 2, wheels: [0, 2], ratio: spec.final, inertia: 6, brake: spec.axles[1].brake * 2 },
          { driven: 3, wheels: [1, 3], ratio: spec.final, inertia: 6, brake: spec.axles[1].brake * 2 },
        ]
      : undefined,
  };
}

/** The grip under a wheel: its ground (a storm's fresh snow on the road), its foot (a ski, a track). */
export function gripAt(world: CarWorld, spec: CarSpec, i: number, g: Ground, x: number, z: number): Grip {
  const k = world.coverAt ? world.coverAt(x, z) : (world.cover ?? 0);
  let base = GRIP[g];
  if (k > 0 && (g === "asphalt" || g === "walk" || g === "slush")) base = blend(GRIP[g], GRIP.path, k * 0.85);
  const foot = spec.feet?.[i < 2 ? 0 : 1] ?? "tyre";
  return foot === "tyre" ? base : footGrip(foot, g, base);
}

/** (plan 93 A.5) each body's rear side grip × this: its balance — the saloon's mild understeer, the hot hatch's
 *  lively tail (the same as its front), the tall and the long ones lazy */
const REAR_BIAS: Partial<Record<CarSpec["kind"], number>> = {
  sedan: 1.06,
  estate: 1.06,
  hatch: 1.0,
  offroad: 1.08,
  pickup: 1.05,
  van: 1.1,
};

const HARD = new Set<Ground>(["asphalt", "walk", "floor", "rock", "earth", "wet"]);
/** (plan 93 S6) chains: the grip they give on snow and ice; the most they're driven at (m/s, 45 km/h); the most a
 *  full rut turns the front wheels toward its middle (rad) */
export const CHAIN_GRIP = 1.5;
export const CHAIN_V = 12.5;
const RUT_STEER = 0.08;
const PUSH_N = 650;
const PUSH_V = 1.5;
const sv: Solid[] = [];

/** A car driven on Jolt: its state, its Jolt car, what it keeps between steps. */
export class Drive {
  readonly read: CarRead;
  private readonly as: AssistState = assistState();
  private readonly ao = assistOut();
  private readonly grips: Grip[];
  private readonly rest: number[];
  /** the tyres' grip multipliers this step (the arcade layer's): side, along */
  private readonly side: number[];
  /** (plan 93 S1) its flat tyres, FL FR RL RR as bits 1 2 4 8: half their grip, dragging */
  flats = 0;
  /** (plan 93 S6) its chained wheels, bits as `flats`: ×1.5 the grip on snow and ice, a little less on the hard
   *  ground, and no faster than CHAIN_V */
  chains = 0;
  /** (plan 93 S7) a force from outside the car this step (a tow rope's pull: car/cars.ts), N, at a point (the
   *  world's) — its turn about the centre of gravity too */
  ext: { f: [number, number, number]; at: [number, number, number] } | null = null;
  /** (plan 93 S6) each wheel's rut this step (its depth, 0 none) */
  private readonly rutK: number[];
  private readonly rutHit: RutHit = { off: 0, k: 0, dx: 1, dz: 0 };
  private readonly along: number[];
  private engineOn = false;
  private prevV: [number, number, number] = [0, 0, 0];
  private gearWant = 1;
  /** (plan 93) the steering's lock where the front's at its peak (rad) */
  private steerCap = 1;
  private diffs = "";
  private manual = false;
  /** the gear the box was last in (Jolt's auto box drops to neutral off the throttle: coasting, it still
   *  reads — and sounds — as that gear; docs/plan/92 polish) */
  private held = 0;
  pad = false;
  /** may be righted (R, on its roof or side, still) */
  canRight = false;

  constructor(
    readonly s: CarState,
    readonly car: WorldCar,
  ) {
    const n = car.def.wheels.length;
    this.read = readOfDrive(n);
    this.grips = Array.from({ length: n }, () => GRIP.asphalt);
    // (the spring's length at rest: from the bump stop down its travel)
    this.rest = car.def.wheels.map((_w, i) => s.spec.axles[i < 2 ? 0 : 1].travel);
    this.side = Array(n).fill(1);
    this.along = Array(n).fill(1);
    this.rutK = Array(n).fill(0);
    const spec = s.spec;
    car.tire = (i, sl, sa, susp) => {
      const g = this.grips[i];
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
      const f = mu * cap * susp;
      // (a flat: the rim on the rubber, half its grip)
      // (plan 93 S6: chains bite the snow and ice, skate a little on the hard ground; a rut's packed floor)
      const ch = this.chains & (1 << i) ? (HARD.has(this.s.wheels[i]?.ground) ? 0.92 : CHAIN_GRIP) : 1;
      const fk = (this.flats & (1 << i) ? 0.5 : 1) * ch * (1 + 0.15 * this.rutK[i]);
      this.car.out.long = f * (0.35 + 0.65 * wl) * this.along[i] * fk;
      this.car.out.lat = f * (0.35 + 0.65 * wa) * this.side[i] * fk;
    };
    void spec;
  }
  /** The engine on (its revs) or off: as setEngine has the state. */
  private engine() {
    const on = this.s.rpm > 50 && !this.s.drowned && (this.s.fuel > 0 || !!this.s.spec.pushed);
    if (on !== this.engineOn) {
      this.engineOn = on;
      this.car.setTorque(on && !this.s.spec.pushed ? 1 : 0);
      if (on) this.car.setRpm(this.s.rpm);
    }
  }

  /** Before the world's step: the driver, the helps, the arcade layer, the tyres' grounds. */
  pre(raw: Controls, world: CarWorld, dt: number, helps: Helps = HELPS) {
    const s = this.s;
    const spec = s.spec;
    const r = this.read;
    s.t += dt;
    s.hit = null;
    this.engine();
    // ── a shift's rev match: while the clutch is out, the engine's revs eased to what the wheels turn it
    // at in the new gear (plan 92 feedback: held at the old gear's, the clutch slammed them down as it
    // bit — a surge, the body jerked, the tail kicked in a turn: the hiccup on every change) ──
    if (r.shifting && s.gear > 0 && this.engineOn && !spec.pushed) {
      const ratio = (spec.gears[s.gear + 1] ?? 1) * spec.final * (s.low && spec.low ? spec.low : 1);
      const ids = spec.drive === "front" ? [0, 1] : spec.drive === "rear" ? [2, 3] : [0, 1, 2, 3];
      let spin = 0;
      for (const i of ids) spin += Math.abs(r.wheels[i]?.spin ?? 0) / ids.length;
      const want = Math.max(spec.engine.idle, Math.min(spec.engine.limit, (spin * ratio * 60) / (2 * Math.PI)));
      this.car.revs(r.rpm + (want - r.rpm) * Math.min(1, dt / 0.07));
    }
    const X = axis(s.q, 1, 0, 0);
    const Y = axis(s.q, 0, 1, 0);
    const Z = axis(s.q, 0, 0, 1);
    const vf = s.v.x * X[0] + s.v.y * X[1] + s.v.z * X[2];
    const vs = s.v.x * Z[0] + s.v.y * Z[1] + s.v.z * Z[2];
    const speed = Math.hypot(s.v.x, s.v.y, s.v.z);
    // ── the water: dragged as deep as it's in; to the floor, drowned ──
    const wet = world.water?.(s.p.x, s.p.z) ?? 0;
    if (wet >= DROWN_AT && !s.drowned) {
      s.drowned = true;
      s.rpm = 0;
      this.engine();
    }
    if (s.drowned) raw = { ...raw, up: 0 };

    // ── the hands and feet (keys smoothed; a pad as it is) ──
    let wantUp = raw.up;
    let wantDown = raw.down;
    // (in reverse S drives, W brakes)
    if (helps.auto && this.gearWant === -1) [wantUp, wantDown] = [raw.down, raw.up];
    s.thr = toward(s.thr, wantUp, raw.digital ? 1 / 0.14 : 1 / 0.04, raw.digital ? 1 / 0.08 : 1 / 0.04, dt);
    s.brk = toward(s.brk, wantDown, raw.digital ? 1 / 0.1 : 1 / 0.04, 1 / 0.07, dt);
    s.hb = toward(s.hb, raw.hand, 1 / 0.06, 1 / 0.1, dt);
    this.pad = !raw.digital;
    // reverse: S held at a stop; W held at a stop in reverse, back to first
    if (helps.auto) {
      const stopped = Math.abs(vf) < 0.7;
      const back = this.gearWant === -1;
      const towards = back ? raw.up > 0.5 && raw.down < 0.05 : raw.down > 0.5 && raw.up < 0.05;
      if (!towards) s.rev = 0;
      else if (stopped && s.rev >= 0) s.rev += dt;
      if (s.rev > 0.3) {
        s.rev = -1;
        this.gearWant = back ? 1 : -1;
        s.thr = 0;
      }
      this.car.gearbox(true);
      this.manual = false;
    } else {
      // (manual, F4a: Q/E; never into reverse rolling forward)
      if (!this.manual) this.gearWant = s.gear;
      if (raw.shiftUp) this.gearWant = Math.min(spec.gears.length - 2, s.gear + 1);
      if (raw.shiftDown && (s.gear > 1 || Math.abs(vf) < 1.5)) this.gearWant = Math.max(-1, s.gear - 1);
      this.car.gearbox(false, this.gearWant);
      this.manual = true;
    }
    // the 4x4's centre lock (K) and its low range (J)
    const dk = `${s.lock}|${s.low}`;
    if (dk !== this.diffs) {
      this.diffs = dk;
      this.car.setDiffs(s.lock, s.low && spec.low ? spec.low : 1);
    }
    // ── the steering: limited by speed (keys), the countersteer helper in a slide ──
    const front = this.grips[0];
    let maxSteer = spec.steer.max;
    if (helps.steer) {
      const lat = (spec.wheelbase * (FEEL.mu0 + front.mu * FEEL.mu) * G) / Math.max(1, vf * vf);
      maxSteer = Math.min(spec.steer.max, front.alpha * FEEL.peak * 0.9 + lat * 1.1);
    }
    // (plan 93 A.4: the lock where the front tyres are at their peak, not past it — the front's slip angle
    // fed back: past 95% of its peak, the cap comes in to where it was; under it, opens again; not at a crawl,
    // where a full lock's the geometry, not a slip)
    // (not in a slide — the handbrake, the body's slip past ~12°: the front's angle there is the countersteer's)
    const slid = s.hb > 0.1 || Math.abs(Math.atan2(vs, Math.max(0.5, Math.abs(vf)))) > 0.2;
    if (helps.steer && ASSIST.tyreLed && Math.abs(vf) > 4 && !slid) {
      const pa = front.alpha * FEEL.peak;
      const aF = (Math.abs(s.wheels[0].alpha) + Math.abs(s.wheels[1].alpha)) / 2;
      const over = aF - 0.95 * pa;
      this.steerCap =
        over > 0 && Math.abs(s.str) > 0.02
          ? Math.max(0.035, Math.min(this.steerCap, Math.abs(s.str) - over * 0.7))
          : Math.min(spec.steer.max, this.steerCap + 1.2 * dt);
      maxSteer = Math.min(maxSteer, this.steerCap);
    } else this.steerCap = spec.steer.max;
    const target = clamp(raw.steer, -1, 1) * maxSteer;
    // (keys: a time to full lock, longer as it goes — plan 92 feedback: at a rate in rad/s the lock the
    // speed allows was there in 0.06 s, the car flicked round like a puck; back to the middle quicker)
    // (plan 93 D: at a crawl a person winds the wheel's 1.5 turns, hand over hand — 0.6 s, not a flick;
    // from ~20 km/h the lock's small and quick again)
    const lockT = 0.16 + 0.44 * (1 - smooth(1.5, 6, speed)) + 0.22 * smooth(5, 30, speed);
    const rate = raw.digital
      ? ((target * s.str < 0 || Math.abs(target) < Math.abs(s.str) ? 1.6 : 1) * Math.max(0.08, maxSteer)) / lockT
      : 8;
    s.str = toward(s.str, target, rate, rate, dt);
    let steer = s.str;
    const beta = Math.atan2(vs, Math.max(0.5, Math.abs(vf)));
    if (helps.counter > 0 && vf > 2) {
      const k = helps.counter * smooth(2, 5, vf);
      steer = steer * (1 - 0.7 * k * smooth(0.15, 0.6, Math.abs(beta))) + k * clamp(beta, -0.6, 0.6);
    }
    steer = clamp(steer, -spec.steer.max, spec.steer.max);

    // ── the tyres' grounds (where each wheel touched last step) ──
    let touching = 0;
    let rutSteer = 0;
    for (let i = 0; i < r.wheels.length; i++) {
      const w = r.wheels[i];
      const sw = s.wheels[i];
      if (w.contact) touching++;
      const x = w.contact ? w.cx : s.p.x;
      const z = w.contact ? w.cz : s.p.z;
      sw.ground = world.ground(x, z);
      this.grips[i] = gripAt(world, spec, i, sw.ground, x, z);
      this.rutK[i] = w.contact && world.rut?.(x, z, this.rutHit) ? this.rutHit.k : 0;
      // (plan 93 S6: a front wheel in a rut — the rut tugs the steering toward its middle, damped by how fast it's
      // crossing: the car's taken along it, the back following)
      if (i < 2 && this.rutK[i] > 0) {
        const h = this.rutHit;
        const vn = -s.v.x * h.dz + s.v.z * h.dx;
        const sideOf = Math.sign(X[0] * h.dx + X[2] * h.dz) || 1;
        rutSteer -= clamp(h.off / 0.12 + vn * 2.2, -1, 1) * h.k * RUT_STEER * sideOf * 0.5;
      }
    }
    steer = clamp(steer + rutSteer, -spec.steer.max, spec.steer.max);
    // (plan 93 S6: chains on, no faster than a chain's for — the throttle let off past it)
    if (this.chains && vf > CHAIN_V) s.thr *= clamp((CHAIN_V + 0.8 - vf) / 0.8, 0, 1);

    // ── the helps: traction (the throttle eased on wheelspin), ABS (the brake eased on a lock) ──
    let thr = s.thr;
    s.helping = 0;
    const driven = spec.drive === "all" ? [0, 1, 2, 3] : spec.drive === "front" ? [0, 1] : [2, 3];
    if (helps.tcs && !spec.pushed) {
      let over = 0;
      for (const i of driven) {
        const w = r.wheels[i];
        const pk = this.grips[i].kappa * FEEL.peak;
        if (w.contact && Math.abs(vf) > 1) over = Math.max(over, w.slipLong / pk - 1.6);
      }
      if (over > 0) {
        thr *= clamp(1 - over * 0.6, 0.25, 1);
        s.helping |= 2;
      }
    }
    let brake = s.brk;
    if (helps.abs && brake > 0.1 && Math.abs(vf) > 2) {
      let lock = 0;
      for (let i = 0; i < r.wheels.length; i++) {
        const w = r.wheels[i];
        if (w.contact) lock = Math.max(lock, w.slipLong / (this.grips[i].kappa * FEEL.peak) - 1.3);
      }
      if (lock > 0) {
        brake *= clamp(1 - lock * 0.5, 0.45, 1);
        s.helping |= 1;
      }
    }
    // (held still at a stop: the brakes on lightly)
    if (helps.hold && !spec.pushed && speed < 0.35 && thr < 0.02 && Math.abs(vf) < 0.3) brake = Math.max(brake, 0.35);
    if (s.rpm > spec.engine.limit) thr = 0;

    // ── to Jolt: forward (back in reverse), the steering, the brakes ──
    if (helps.auto) {
      if (this.gearWant === -1 && s.gear !== -1 && Math.abs(vf) < 1) {
        // (into reverse: Jolt's auto box goes there asked backward at a stand)
      }
    }
    const back = helps.auto ? this.gearWant === -1 : s.gear === -1;
    const fwd = spec.pushed ? 0 : (back ? -1 : 1) * thr;
    // (a throttle asked while it rolls the other way: the brakes first)
    let brk = brake;
    if (helps.auto && thr > 0.05 && Math.abs(vf) > 1.2 && Math.sign(vf) !== (back ? -1 : 1)) brk = Math.max(brk, thr);
    this.car.input(this.engineOn || spec.pushed ? fwd : 0, steer / spec.steer.max, brk, s.hb);

    // ── the arcade layer ──
    const ao = assist(
      {
        dt,
        mass: spec.mass,
        inertia: spec.inertia,
        wheelbase: spec.wheelbase,
        X,
        Y,
        Z,
        v: [s.v.x, s.v.y, s.v.z],
        w: [s.w.x, s.w.y, s.w.z],
        vf,
        vs,
        steer,
        mu: FEEL.mu0 + front.mu * FEEL.mu,
        thr,
        brk: brake,
        hand: s.hb,
        touching,
        n: r.wheels.length,
        pad: this.pad,
        frontUsed: Math.max(s.wheels[0].used, s.wheels[1].used),
        steerK: clamp(raw.steer, -1, 1),
      },
      this.as,
      this.ao,
    );
    this.canRight = ao.canRight;
    for (let i = 0; i < r.wheels.length; i++) {
      this.side[i] = i < 2 ? ao.front : ao.rear * (ASSIST.tyreLed ? (REAR_BIAS[spec.kind] ?? 1) : 1);
      this.along[i] = 1;
    }
    let fx = ao.f[0];
    let fy = ao.f[1];
    let fz = ao.f[2];
    // ── what Jolt doesn't know: rolling through snow, ploughing it, the water, the air ──
    for (let i = 0; i < r.wheels.length; i++) {
      const w = r.wheels[i];
      if (!w.contact) continue;
      const g = this.grips[i];
      const N = Math.max(0, w.load);
      // (a ski, a track, a runner on bare ground grinds: slow on the roads, plan 34's decision)
      const foot = spec.feet?.[i < 2 ? 0 : 1] ?? "tyre";
      const grind =
        foot !== "tyre" && foot !== "lug" && HARD.has(s.wheels[i].ground) ? 0.7 * smooth(3, 10, Math.abs(vf)) : 0;
      // (a flat drags: the tyre's own rolling × 8)
      const flat = this.flats & (1 << i) ? 7 * g.crr + 0.06 : 0;
      // (plan 93 S6: in a rut, the snow already pressed: less to plough)
      const plough = g.plough * (1 - 0.6 * this.rutK[i]);
      const rr = (g.crr + flat + grind + plough * Math.min(Math.abs(vf), 12)) * N * Math.tanh(vf / 0.3);
      fx -= X[0] * rr;
      fy -= X[1] * rr;
      fz -= X[2] * rr;
    }
    if (wet > 0.15) {
      const k = spec.mass * 2.2 * Math.min(2, wet);
      fx -= s.v.x * k;
      fz -= s.v.z * k;
    }
    const ad = 0.5 * AIR * spec.aero.cda * speed;
    fx -= ad * s.v.x;
    fy -= ad * s.v.y;
    fz -= ad * s.v.z;
    // (pushed, the toboggan: a shove off the ground with the feet, to walking pace)
    if (spec.pushed) {
      const dir = s.gear === -1 || this.gearWant === -1 ? -1 : 1;
      const vfd = vf * dir;
      const g = s.wheels[0].ground;
      const feet = g === "ice" || g === "blackice" ? 0.35 : 1;
      const shove = touching === 0 ? 0 : s.thr * PUSH_N * feet * clamp((PUSH_V - vfd) / 0.3, 0, 1);
      fx += X[0] * shove * dir;
      fz += X[2] * shove * dir;
    }
    let tx = ao.t[0];
    let ty = ao.t[1];
    let tz = ao.t[2];
    const e = this.ext;
    if (e) {
      fx += e.f[0];
      fy += e.f[1];
      fz += e.f[2];
      const rx = e.at[0] - s.p.x;
      const ry = e.at[1] - s.p.y;
      const rz = e.at[2] - s.p.z;
      tx += ry * e.f[2] - rz * e.f[1];
      ty += rz * e.f[0] - rx * e.f[2];
      tz += rx * e.f[1] - ry * e.f[0];
    }
    this.car.push(fx, fy, fz, tx, ty, tz);
    // (the people, the pets, the snowbanks: soft, round it — they give, and are knocked)
    this.soft(world, X, dt);
    this.prevV = [s.v.x, s.v.y, s.v.z];
    void ASSIST;
  }

  /** (plan 93, /dev/car's trace) the arcade layer's yaw this step, as an angular acceleration (rad/s², + right) */
  get assistYaw(): number {
    const Y = axis(this.s.q, 0, 1, 0);
    return -(this.ao.t[0] * Y[0] + this.ao.t[1] * Y[1] + this.ao.t[2] * Y[2]) / this.s.spec.inertia[1];
  }

  /** Read from Jolt as it is now, nothing counted (made, put somewhere): no knock from the jump. */
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
    this.prevV = [s.v.x, s.v.y, s.v.z];
  }

  /** On its wheels again (R, on its roof or side): lifted, turned upright, its heading kept. */
  right(world: CarWorld): boolean {
    if (!this.canRight) return false;
    const s = this.s;
    const X = axis(s.q, 1, 0, 0);
    const a = Math.atan2(X[2], X[0]);
    const h = world.height(s.p.x, s.p.z);
    const q = { x: 0, y: Math.sin(-a / 2), z: 0, w: Math.cos(-a / 2) };
    this.car.place(s.p.x, h + s.spec.cog + 0.6, s.p.z, [q.x, q.y, q.z, q.w]);
    this.as.upset = 0;
    this.canRight = false;
    return true;
  }

  /** People and pets in its way (never hurt: they're knocked, the car pushed off them softly) and
   *  the soft snowbanks: from the world's solids round it. */
  private soft(world: CarWorld, X: number[], dt: number) {
    const s = this.s;
    const b = s.spec.body;
    const hx = (b.ahead + b.behind) / 2;
    const hz = b.width / 2;
    const off = (b.ahead - b.behind) / 2;
    const fl = Math.hypot(X[0], X[2]) || 1;
    const ax = X[0] / fl;
    const az = X[2] / fl;
    const cx = s.p.x + ax * off;
    const cz = s.p.z + az * off;
    sv.length = 0;
    world.solids(cx, cz, hx + 2, sv);
    let px = 0;
    let pz = 0;
    for (const o of sv) {
      if (!o.soft || o.kind !== "circle") continue;
      const r0 = o.r ?? 0.3;
      const dx = o.x - cx;
      const dz = o.z - cz;
      const lu = dx * ax + dz * az;
      const lv = -dx * az + dz * ax;
      const qu = clamp(lu, -hx, hx);
      const qv = clamp(lv, -hz, hz);
      const eu = lu - qu;
      const ev = lv - qv;
      const d = Math.hypot(eu, ev);
      if (d >= r0) continue;
      let nu = 0;
      let nv = 0;
      if (d > 1e-6) {
        nu = -eu / d;
        nv = -ev / d;
      } else if (hx - Math.abs(lu) < hz - Math.abs(lv)) nu = -Math.sign(lu);
      else nv = -Math.sign(lv);
      const nx = nu * ax - nv * az;
      const nz = nu * az + nv * ax;
      // (the car's speed into it)
      const vin = -(s.v.x * nx + s.v.z * nz);
      const depth = r0 - d;
      const m = o.m ?? 80;
      // (soft: a fraction of its speed into it taken, by the masses — a person, a bank)
      // (plan 93 S3: a person or a pet met at a crawl stops it at the bumper — never crept through; faster, it
      // gives a little, and they're knocked)
      const person = o.what === "person" || o.what === "pet";
      const crawl = person && vin < 1.2;
      if (vin > 0) {
        const share = m / (m + s.spec.mass);
        const dvn = crawl ? vin : vin * Math.min(1, share * 1.6 + 0.04);
        px += nx * dvn;
        pz += nz * dvn;
        const j = s.spec.mass * dvn;
        if (!s.hit || j > s.hit.j)
          s.hit = { j, x: o.x - nx * r0, z: o.z - nz * r0, what: o.what ?? "bank", at: s.t, id: o.id, v: vin };
      }
      const out = crawl ? 80 : 20;
      px += nx * depth * out * dt;
      pz += nz * depth * out * dt;
    }
    if (px || pz) {
      this.car.setVelocity([s.v.x + px, s.v.y, s.v.z + pz], [s.w.x, s.w.y, s.w.z]);
      s.v.x += px;
      s.v.z += pz;
    }
  }

  /** After the world's step: Jolt's car read back into the state; a hard knock found. */
  post(world: CarWorld, dt: number, named?: (body: number) => string | undefined) {
    const s = this.s;
    const r = this.read;
    // (the engine as setEngine left it since: started, dried up)
    this.engine();
    this.car.read(r, (b) => (named?.(b) ? 1 : 0));
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
    const Z = axis(s.q, 0, 0, 1);
    const spec = s.spec;
    const vf = s.v.x * X[0] + s.v.y * X[1] + s.v.z * X[2];
    const R = spec.wheel.r;
    const m = this.c0s();
    let belly = 0;
    for (let i = 0; i < r.wheels.length; i++) {
      const w = r.wheels[i];
      const sw = s.wheels[i];
      sw.contact = w.contact;
      // (its spring's compression as the old sim had it: c0 at rest)
      sw.c = m[i] + (this.rest[i] - w.len);
      sw.cv = 0;
      sw.w = w.spin;
      sw.turn = w.angle % (Math.PI * 2);
      sw.steer = w.steer;
      sw.load = w.load;
      sw.kappa = w.slipLong * Math.sign(sw.w * R - vf || 1);
      sw.alpha = w.slipLat;
      const g = this.grips[i];
      sw.used = Math.hypot(w.slipLong / (g.kappa * FEEL.peak), w.slipLat / (g.alpha * FEEL.peak));
      // (the patch sliding over the ground: m/s)
      const pv = Math.abs(vf);
      sw.slip = w.contact ? Math.hypot(sw.w * R - vf, pv * Math.tan(Math.min(1.4, w.slipLat))) : 0;
      if (w.contact) {
        sw.px = w.cx;
        sw.py = w.cy;
        sw.pz = w.cz;
      }
      sw.vx = vf;
      // ── deep snow: the wheel sinks (its spin digs it in; rolling packs it back) ──
      const target = g.sink * (1 - 0.4 * smooth(4, 14, Math.abs(vf)));
      if (g.sink > 0.04 && Math.abs(sw.kappa) > 0.5)
        sw.dig = Math.min(g.sink * 0.5, sw.dig + 0.03 * Math.abs(sw.kappa) * dt);
      else if (Math.abs(vf) > 0.4 && Math.abs(sw.kappa) < 0.3) sw.dig = Math.max(-g.sink * 0.35, sw.dig - 0.05 * dt);
      else sw.dig = Math.max(0, sw.dig - 0.02 * dt);
      if (g.sink < 0.01) sw.dig = 0;
      sw.sink = toward(sw.sink, w.contact ? target + sw.dig : 0, 0.4, 0.4, dt);
      belly = Math.max(belly, sw.sink - spec.clearance);
    }
    s.belly = Math.max(0, belly);
    // the belly on the snow: dragged (the sedan beaches where the 4x4 goes)
    if (s.belly > 0) {
      const sp = Math.hypot(s.v.x, s.v.z);
      if (sp > 0.01) {
        const f = Math.min(1, s.belly / 0.06) * spec.mass * G * 0.55;
        const k = Math.min(1, sp / 0.3);
        this.car.push((-s.v.x / sp) * f * k, 0, (-s.v.z / sp) * f * k);
      }
    }
    // ── the engine ──
    const running = this.engineOn && !spec.pushed;
    if (r.gear !== 0) this.held = r.gear;
    else if (this.manual || Math.abs(vf) < 0.5) this.held = 0;
    const gear = r.gear === 0 && this.held !== 0 ? this.held : r.gear;
    s.gear = gear;
    s.shiftT = r.shifting ? 0.01 : 0;
    s.shiftTo = gear;
    s.clutch = r.clutch;
    s.locked = r.clutch > 0.95 && !r.shifting;
    if (running) {
      const idle = spec.engine.idle + 250 * clamp(1 - s.temp / 0.55, 0, 1);
      s.rpm = Math.max(r.rpm, s.thr < 0.05 && Math.abs(vf) < 1 ? idle : spec.engine.idle * 0.55);
    } else if (spec.pushed) s.rpm = s.rpm > 0 ? spec.engine.idle : 0;
    else s.rpm = 0;
    // ── a hard knock: the velocity changed past what the tyres and the brakes could do ──
    const dvx = s.v.x - this.prevV[0];
    const dvy = s.v.y - this.prevV[1];
    const dvz = s.v.z - this.prevV[2];
    const dh = Math.hypot(dvx, dvz);
    const can = 1.6 * G * dt + 0.25;
    if (dh > can && !s.hit) {
      // (where: the side of the hull the change came from)
      const ux = -dvx / dh;
      const uz = -dvz / dh;
      const b = spec.body;
      const along = ux * X[0] + uz * X[2];
      const across = ux * Z[0] + uz * Z[2];
      const lx = along > 0 ? b.ahead : -b.behind;
      const lz = (across * b.width) / 2;
      const hx = s.p.x + X[0] * lx * Math.abs(along) + Z[0] * lz;
      const hz = s.p.z + X[2] * lx * Math.abs(along) + Z[2] * lz;
      const o = solidAt(world, hx, hz);
      s.hit = { j: spec.mass * (dh - can * 0.5), x: hx, z: hz, what: o?.what ?? "wall", at: s.t, v: dh };
      const hit = s.hit as Hit;
      if (hit.what === "car") hit.id = o?.id ?? idAt(world, hx, hz);
      // (a parked car knocked: it takes the blow — the shove I drive, the server told where it ends)
      if (o?.shove) o.shove(-dvx * spec.mass * 0.6, -dvz * spec.mass * 0.6, hx, hz);
    } else if (Math.abs(dvy) > 3 && !s.hit)
      s.hit = { j: spec.mass * Math.abs(dvy) * 0.3, x: s.p.x, z: s.p.z, what: "ground", at: s.t };
    // ── warming up, fuel, the odometer ──
    s.temp = Math.min(0.55, s.temp + (running ? (0.00055 + s.rpm * 0.0000004 + s.thr * 0.0006) * dt : -0.0002 * dt));
    if (running) s.fuel = Math.max(0, s.fuel - 4.35e-6 * s.rpm * (0.25 + s.thr) * dt);
    if (running && s.fuel <= 0) {
      s.rpm = 0;
      this.engine();
    }
    s.odo += (Math.abs(vf) * dt) / 1000;
    const resting = Math.hypot(s.v.x, s.v.y, s.v.z) < 0.05;
    s.still = resting ? s.still + dt : 0;
    if ((world.water?.(s.p.x, s.p.z) ?? 0) >= SUNK) s.drowned = true;
  }
  private c0Cache: number[] | null = null;
  private c0s(): number[] {
    if (this.c0Cache) return this.c0Cache;
    const spec = this.s.spec;
    const rearL = spec.wheelbase - spec.front;
    this.c0Cache = [0, 1, 2, 3].map((i) => {
      const front = i < 2;
      const ax = spec.axles[front ? 0 : 1];
      const share = (front ? rearL : spec.front) / spec.wheelbase / 2;
      return (spec.mass * G * share) / ax.k;
    });
    return this.c0Cache;
  }
}

function solidAt(world: CarWorld, x: number, z: number): Solid | null {
  sv.length = 0;
  world.solids(x, z, 1.8, sv);
  let best: Solid | null = null;
  let bd = 2.2;
  for (const o of sv) {
    const d = Math.hypot(o.x - x, o.z - z) - (o.kind === "circle" ? (o.r ?? 0) : Math.min(o.hx ?? 0, o.hz ?? 0));
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}
function idAt(world: CarWorld, x: number, z: number): string | undefined {
  sv.length = 0;
  world.solids(x, z, 3, sv);
  let best: Solid | null = null;
  let bd = 4;
  for (const o of sv)
    if (o.what === "car") {
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
  return best?.id;
}

/** A car's axis (its own x, y, z) in the world. */
function axis(
  q: { x: number; y: number; z: number; w: number },
  x: number,
  y: number,
  z: number,
): [number, number, number] {
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

function readOfDrive(n: number): CarRead {
  return {
    p: [0, 0, 0],
    q: [0, 0, 0, 1],
    v: [0, 0, 0],
    w: [0, 0, 0],
    rpm: 0,
    gear: 0,
    clutch: 0,
    shifting: false,
    wheels: Array.from({ length: n }, () => ({
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
    })),
  };
}
