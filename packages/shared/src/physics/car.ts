// A car on Jolt (docs/plan/92-the-cars.md, phase 1): a dynamic body on a `VehicleConstraint` — Jolt's
// wheels (a cylinder cast each, the suspension's spring), its engine, gearbox and differentials, or
// its tracks — with each tyre's grip given by us every collision step (`OnTireMaxImpulseCallback`:
// the surface under that wheel, the friction ellipse, the arcade layer's say). Made and destroyed by
// the world (world.ts addCar / removeCar: the one owner, plan 50 guardrail 3); feature code only
// sees this handle and plain numbers.
//
// Axes: the car's own x forward, y up, z to its right (shared/car's), its origin its centre of mass.

import type Jolt from "jolt-physics";
import type { JoltModule } from "./load.ts";

/** A wheel: its mount (car-local, from the centre of mass, the suspension at full droop), its size,
 *  its suspension (travel from full droop up to the bump stop; a spring of `hz` with `damp` of
 *  critical; `preload` m pushed down at full droop), what it steers, brakes and weighs. */
export interface WheelDef {
  x: number;
  y: number;
  z: number;
  r: number;
  width: number;
  travel: number;
  hz: number;
  damp: number;
  preload?: number;
  steer: number; // max angle (rad); 0: it doesn't steer
  brake: number; // N·m
  hand: number; // N·m (the handbrake's)
  inertia: number; // kg·m²
}

/** The drivetrain: Jolt's engine (its curve normalised to `torque`), gearbox and diffs. */
export interface DriveDef {
  torque: number; // N·m at the curve's 1
  minRpm: number;
  maxRpm: number;
  curve: [number, number][]; // [rpm / maxRpm, torque / `torque`]
  inertia: number;
  damping: number; // the engine's own drag (engine braking)
  gears: number[]; // forward ratios (1st…)
  reverse: number;
  shiftUp: number;
  shiftDown: number;
  shiftTime: number;
  clutch: number; // the clutch's strength
  release?: number; // s: the clutch biting again after a shift
  /** each diff: the wheels it drives (left, right), its ratio (the final drive) and its share of
   *  the engine's torque */
  diffs: { l: number; r: number; ratio: number; share: number; split?: number; lsd?: number }[];
  /** the centre's limited slip (several diffs: how unequal they may spin) */
  centre?: number;
}

/** Tracks in place of a gearbox's diffs (the snowcat): a side's driven wheel, its wheels. */
export interface TrackDef {
  driven: number;
  wheels: number[];
  ratio: number;
  inertia: number;
  brake: number;
}

export interface CarDef {
  mass: number;
  /** principal inertia about its x (roll), y (yaw), z (pitch) */
  inertia: [number, number, number];
  /** the hull: a box of half sides (hx, hy, hz) centred at (cx, cy) from the centre of mass — or, given
   *  `pts` (x, y, z flat, from the centre of mass: x ahead, z right), the model's own convex hull
   *  (docs/plan/92 phase 9: its GLB's `collider`, through the manifest) */
  hull: { hx: number; hy: number; hz: number; cx: number; cy: number; pts?: number[] };
  wheels: WheelDef[];
  /** anti-roll bars: a pair (left, right) and its stiffness (N·m/rad) */
  bars: { l: number; r: number; k: number }[];
  drive: DriveDef;
  tracks?: [TrackDef, TrackDef];
  /** how far it may pitch or roll before Jolt holds it (rad; π: never) */
  maxTilt?: number;
}

/** What a car reads back (read()), reused: its centre of mass, its turn, velocities; each wheel. */
export interface CarRead {
  p: [number, number, number];
  q: [number, number, number, number];
  v: [number, number, number];
  w: [number, number, number];
  rpm: number;
  gear: number; // −1 reverse, 0 neutral, 1…
  clutch: number;
  shifting: boolean;
  wheels: {
    contact: boolean;
    /** the suspension's length now (from the mount, along −y), m */
    len: number;
    spin: number; // rad/s
    angle: number; // rotation angle (rad)
    steer: number;
    /** the contact: where, its normal, the patch's velocity, the slips Jolt measured */
    cx: number;
    cy: number;
    cz: number;
    nx: number;
    ny: number;
    nz: number;
    slipLong: number;
    slipLat: number;
    /** the suspension's push last step (N) */
    load: number;
    /** what's under it: its body's key, if the world named it */
    on: number;
  }[];
}

/** A tyre's grip, asked for each wheel every collision step: from Jolt's measured slips (the
 *  longitudinal a ratio, the lateral an angle, rad, both ≥ 0) and the suspension's impulse
 *  (N·s this step), the most impulse the tyre may give along and across (N·s). */
export type TireFn = (wheel: number, slipLong: number, slipLat: number, suspension: number, dt: number) => void;

/** The world's insides a car needs (passed by world.ts, never anyone else). */
export interface CarHost {
  J: JoltModule;
  system: Jolt.PhysicsSystem;
  bodies: Jolt.BodyInterface;
  layer: number;
  forget(...o: (object | null | undefined)[]): void;
  shape(s: Jolt.ShapeSettings): Jolt.Shape | null;
  letGo(shape: Jolt.Shape): void;
}

export class WorldCar {
  readonly body: Jolt.Body;
  readonly id: Jolt.BodyID;
  private readonly constraint: Jolt.VehicleConstraint;
  private readonly listener: Jolt.VehicleConstraintStepListener;
  private readonly tester: Jolt.VehicleCollisionTester;
  private readonly wheeled: Jolt.WheeledVehicleController | null;
  private readonly tracked: Jolt.TrackedVehicleController | null;
  private readonly callbacks: Jolt.WheeledVehicleControllerCallbacksJS | null;
  private readonly wheels: Jolt.Wheel[] = [];
  private readonly wheelsWV: Jolt.WheelWV[] = [];
  private readonly loads: number[];
  private readonly lastLoad: number[];
  /** the tyres' answer, set by `tire` in its call: along and across (N·s) */
  readonly out = { long: 0, lat: 0 };
  tire: TireFn | null = null;
  private readonly v: Jolt.Vec3;
  private readonly r: Jolt.RVec3;
  private readonly q: Jolt.Quat;
  private readonly right: Jolt.Vec3;
  private readonly up: Jolt.Vec3;
  readonly def: CarDef;
  private gone = false;

  constructor(
    private readonly h: CarHost,
    def: CarDef,
    at: { x: number; y: number; z: number; q: [number, number, number, number] },
  ) {
    const J = h.J;
    this.def = def;
    this.v = new J.Vec3(0, 0, 0);
    this.r = new J.RVec3(0, 0, 0);
    this.q = new J.Quat(0, 0, 0, 1);
    this.right = new J.Vec3(0, 0, 1);
    this.up = new J.Vec3(0, 1, 0);
    // the hull: the model's convex hull, or a rounded box — its centre of mass at the body's origin
    const shape = hullShape(h, def.hull, this.v, this.q);
    if (!shape) throw new Error("[physics] a car's hull refused");
    this.r.Set(at.x, at.y, at.z);
    this.q.Set(at.q[0], at.q[1], at.q[2], at.q[3]);
    const bcs = new J.BodyCreationSettings(shape, this.r, this.q, J.EMotionType_Dynamic, h.layer);
    bcs.mOverrideMassProperties = J.EOverrideMassProperties_MassAndInertiaProvided;
    const mp = bcs.mMassPropertiesOverride;
    mp.mMass = def.mass;
    // (principal inertia, the car's own axes)
    const I = mp.mInertia;
    this.v.Set(def.inertia[0], 0, 0);
    I.SetAxisX(this.v);
    this.v.Set(0, def.inertia[1], 0);
    I.SetAxisY(this.v);
    this.v.Set(0, 0, def.inertia[2]);
    I.SetAxisZ(this.v);
    this.v.Set(0, 0, 0);
    I.SetTranslation(this.v);
    this.h.forget(I);
    bcs.mMotionQuality = J.EMotionQuality_LinearCast;
    bcs.mFriction = 0.5;
    bcs.mRestitution = 0.04; // (a crash crumples: little comes back)
    bcs.mLinearDamping = 0; // (the air's drag is the drive's own: quadratic)
    bcs.mAngularDamping = 0.05;
    bcs.mAllowSleeping = true;
    this.body = h.bodies.CreateBody(bcs);
    J.destroy(bcs);
    this.id = this.body.GetID();
    h.bodies.AddBody(this.id, J.EActivation_Activate);
    h.letGo(shape);

    // the constraint: its wheels and bars
    const vcs = new J.VehicleConstraintSettings();
    vcs.mUp = this.up;
    this.v.Set(1, 0, 0);
    vcs.mForward = this.v;
    vcs.mMaxPitchRollAngle = def.maxTilt ?? Math.PI;
    const tracked = !!def.tracks;
    const wheelSettings: Jolt.WheelSettings[] = [];
    for (const w of def.wheels) {
      const ws = tracked ? new J.WheelSettingsTV() : new J.WheelSettingsWV();
      this.v.Set(w.x, w.y, w.z);
      ws.mPosition = this.v;
      this.v.Set(0, -1, 0);
      ws.mSuspensionDirection = this.v;
      ws.mSteeringAxis = this.up;
      ws.mWheelUp = this.up;
      this.v.Set(1, 0, 0);
      ws.mWheelForward = this.v;
      ws.mSuspensionMinLength = 0;
      ws.mSuspensionMaxLength = w.travel;
      ws.mSuspensionPreloadLength = w.preload ?? 0;
      ws.mSuspensionSpring.mMode = J.ESpringMode_FrequencyAndDamping;
      ws.mSuspensionSpring.mFrequency = w.hz;
      ws.mSuspensionSpring.mDamping = w.damp;
      ws.mRadius = w.r;
      ws.mWidth = w.width;
      if (!tracked) {
        const wv = ws as Jolt.WheelSettingsWV;
        wv.mInertia = w.inertia;
        wv.mAngularDamping = 0.04;
        wv.mMaxSteerAngle = w.steer;
        wv.mMaxBrakeTorque = w.brake;
        wv.mMaxHandBrakeTorque = w.hand;
        // (flat: the tyre's curve is ours, given in the callback — tire())
        const flat = (c: Jolt.LinearCurve) => {
          c.Clear();
          c.AddPoint(0, 1);
          c.AddPoint(100, 1);
        };
        flat(wv.mLongitudinalFriction);
        flat(wv.mLateralFriction);
      } else {
        const tv = ws as Jolt.WheelSettingsTV;
        tv.mLongitudinalFriction = 4;
        tv.mLateralFriction = 1.2;
      }
      vcs.mWheels.push_back(ws);
      wheelSettings.push(ws);
    }
    for (const b of def.bars) {
      const bar = new J.VehicleAntiRollBar();
      bar.mLeftWheel = b.l;
      bar.mRightWheel = b.r;
      bar.mStiffness = b.k;
      vcs.mAntiRollBars.push_back(bar);
      J.destroy(bar);
    }
    const d = def.drive;
    const engineOf = (e: Jolt.VehicleEngineSettings) => {
      e.mMaxTorque = d.torque;
      e.mMinRPM = d.minRpm;
      e.mMaxRPM = d.maxRpm;
      e.mInertia = d.inertia;
      e.mAngularDamping = d.damping;
      e.mNormalizedTorque.Clear();
      for (const [x, y] of d.curve) e.mNormalizedTorque.AddPoint(x, y);
    };
    const gearsOf = (t: Jolt.VehicleTransmissionSettings) => {
      t.mMode = J.ETransmissionMode_Auto;
      t.mGearRatios.clear();
      for (const g of d.gears) t.mGearRatios.push_back(g);
      t.mReverseGearRatios.clear();
      t.mReverseGearRatios.push_back(d.reverse);
      t.mSwitchTime = d.shiftTime;
      t.mClutchReleaseTime = d.release ?? 0.25;
      t.mSwitchLatency = 0.4;
      t.mShiftUpRPM = d.shiftUp;
      t.mShiftDownRPM = d.shiftDown;
      t.mClutchStrength = d.clutch;
    };
    if (def.tracks) {
      const cs = new J.TrackedVehicleControllerSettings();
      engineOf(cs.mEngine);
      gearsOf(cs.mTransmission);
      for (let i = 0; i < 2; i++) {
        const t = cs.get_mTracks(i);
        const td = def.tracks[i];
        t.mDrivenWheel = td.driven;
        t.mWheels.clear();
        for (const w of td.wheels) t.mWheels.push_back(w);
        t.mInertia = td.inertia;
        t.mAngularDamping = 0.5;
        t.mMaxBrakeTorque = td.brake;
        t.mDifferentialRatio = td.ratio;
        h.forget(t);
      }
      vcs.mController = cs;
    } else {
      const cs = new J.WheeledVehicleControllerSettings();
      engineOf(cs.mEngine);
      gearsOf(cs.mTransmission);
      cs.mDifferentials.clear();
      for (const df of d.diffs) {
        const ds = new J.VehicleDifferentialSettings();
        ds.mLeftWheel = df.l;
        ds.mRightWheel = df.r;
        ds.mDifferentialRatio = df.ratio;
        ds.mEngineTorqueRatio = df.share;
        ds.mLeftRightSplit = df.split ?? 0.5;
        ds.mLimitedSlipRatio = df.lsd ?? 1.4;
        cs.mDifferentials.push_back(ds);
        J.destroy(ds);
      }
      cs.mDifferentialLimitedSlipRatio = d.centre ?? 1.4;
      vcs.mController = cs;
    }
    this.constraint = new J.VehicleConstraint(this.body, vcs);
    this.constraint.AddRef();
    J.destroy(vcs);
    h.forget(...wheelSettings);
    this.tester = new J.VehicleCollisionTesterCastCylinder(h.layer, 0.05);
    this.constraint.SetVehicleCollisionTester(this.tester);
    h.system.AddConstraint(this.constraint);
    this.listener = new J.VehicleConstraintStepListener(this.constraint);
    h.system.AddStepListener(this.listener);
    const ctl = this.constraint.GetController();
    this.wheeled = tracked ? null : J.castObject(ctl, J.WheeledVehicleController);
    this.tracked = tracked ? J.castObject(ctl, J.TrackedVehicleController) : null;
    for (let i = 0; i < def.wheels.length; i++) {
      const w = this.constraint.GetWheel(i);
      this.wheels.push(w);
      if (!tracked) this.wheelsWV.push(J.castObject(w, J.WheelWV));
    }
    this.loads = def.wheels.map(() => 0);
    this.lastLoad = def.wheels.map(() => 0);
    // the tyres: ours, every collision step
    if (this.wheeled) {
      const cb = new J.WheeledVehicleControllerCallbacksJS();
      const heap = J.HEAPF32;
      cb.OnTireMaxImpulseCallback = (
        i: number,
        res: number,
        susp: number,
        lf: number,
        sf: number,
        sl: number,
        sa: number,
        dt: number,
      ) => {
        this.loads[i] = dt > 0 ? susp / dt : 0;
        const at = res >> 2;
        const f = this.tire;
        if (!f) {
          heap[at] = lf * susp;
          heap[at + 1] = sf * susp;
          return;
        }
        f(i, sl, sa, susp, dt);
        // (the heap may have grown since: its view taken again)
        const hp = J.HEAPF32;
        hp[at] = this.out.long;
        hp[at + 1] = this.out.lat;
      };
      cb.SetWheeledVehicleController(this.wheeled);
      this.callbacks = cb;
    } else this.callbacks = null;
  }

  /** The driver's hands and feet: forward −1..1 (below 0 reverse), steering −1..1 (1 right), the
   *  brake and the handbrake 0..1. Tracks: each side's share instead of steering. */
  input(forward: number, right: number, brake: number, hand: number): void {
    if (this.gone) return;
    if (this.wheeled) this.wheeled.SetDriverInput(forward, right, brake, hand);
    else if (this.tracked) {
      // (a tracked car steers by slowing one side: right turns slow the right track)
      const l = right > 0 ? 1 : 1 + right * 1.6;
      const r = right < 0 ? 1 : 1 - right * 1.6;
      this.tracked.SetDriverInput(forward, Math.max(-1, l), Math.max(-1, r), brake);
    }
    if (forward !== 0 || right !== 0 || brake !== 0) this.h.bodies.ActivateBody(this.id);
  }

  /** The gearbox: auto, or manual and in this gear (−1 reverse, 0 neutral). */
  gearbox(auto: boolean, gear?: number): void {
    const t = (this.wheeled ?? this.tracked)?.GetTransmission();
    if (!t) return;
    t.mMode = auto ? this.h.J.ETransmissionMode_Auto : this.h.J.ETransmissionMode_Manual;
    if (!auto && gear !== undefined && gear !== t.GetCurrentGear()) t.Set(gear, gear === 0 ? 0 : 1);
  }

  /** (plan 92 feedback) The engine's revs set: a shift's rev match (car/drive.ts) — what's left for the
   *  clutch to take up when it bites. */
  revs(rpm: number): void {
    if (this.gone) return;
    this.wheeled?.GetEngine().SetCurrentRPM(rpm);
  }

  /** The 4x4's centre locked (its axles turned together) and its range (× the diffs' ratios: the
   *  low box). */
  setDiffs(lock: boolean, range: number): void {
    const w = this.wheeled;
    if (!w) return;
    w.SetDifferentialLimitedSlipRatio(lock ? 1.02 : (this.def.drive.centre ?? 1.4));
    const ds = w.GetDifferentials();
    for (let i = 0; i < ds.size(); i++) {
      const d = ds.at(i);
      d.mDifferentialRatio = (this.def.drive.diffs[i]?.ratio ?? d.mDifferentialRatio) * range;
      this.h.forget(d);
    }
    this.h.forget(ds);
  }

  /** The engine's revs set (started, stalled, cold idle). */
  setRpm(rpm: number): void {
    (this.wheeled ?? this.tracked)?.GetEngine().SetCurrentRPM(rpm);
  }
  /** The engine's torque scaled (0: off — dead, dry, drowned, a toboggan). */
  setTorque(scale: number): void {
    const e = (this.wheeled ?? this.tracked)?.GetEngine();
    if (e) e.mMaxTorque = this.def.drive.torque * Math.max(0, scale);
  }

  /** A force at the centre of mass and a torque, world axes, this step. */
  push(fx: number, fy: number, fz: number, tx = 0, ty = 0, tz = 0): void {
    if (this.gone) return;
    const B = this.h.bodies;
    if (fx || fy || fz) {
      this.v.Set(fx, fy, fz);
      B.AddForce(this.id, this.v, this.h.J.EActivation_Activate);
    }
    if (tx || ty || tz) {
      this.v.Set(tx, ty, tz);
      B.AddTorque(this.id, this.v, this.h.J.EActivation_Activate);
    }
  }
  /** An impulse at a world point. */
  impulse(jx: number, jy: number, jz: number, x: number, y: number, z: number): void {
    this.v.Set(jx, jy, jz);
    this.r.Set(x, y, z);
    this.h.bodies.AddImpulse(this.id, this.v, this.r);
    this.h.bodies.ActivateBody(this.id);
  }

  /** Put somewhere (spawned, righted, snapped): its centre of mass at (x, y, z), turned q, going v
   *  and spinning w (world). */
  place(x: number, y: number, z: number, q: [number, number, number, number], v?: number[], w?: number[]): void {
    const J = this.h.J;
    const B = this.h.bodies;
    this.r.Set(x, y, z);
    this.q.Set(q[0], q[1], q[2], q[3]);
    B.SetPositionAndRotation(this.id, this.r, this.q, J.EActivation_Activate);
    this.v.Set(v?.[0] ?? 0, v?.[1] ?? 0, v?.[2] ?? 0);
    B.SetLinearVelocity(this.id, this.v);
    this.v.Set(w?.[0] ?? 0, w?.[1] ?? 0, w?.[2] ?? 0);
    B.SetAngularVelocity(this.id, this.v);
  }
  /** Its velocities set (world). */
  setVelocity(v: number[], w: number[]): void {
    const B = this.h.bodies;
    this.v.Set(v[0], v[1], v[2]);
    B.SetLinearVelocity(this.id, this.v);
    this.v.Set(w[0], w[1], w[2]);
    B.SetAngularVelocity(this.id, this.v);
  }
  /** A wheel's spin set (got going on a snap; stopped on a crash). */
  setSpin(i: number, w: number): void {
    this.wheels[i]?.SetAngularVelocity(w);
  }

  awake(): boolean {
    return this.h.bodies.IsActive(this.id);
  }

  /** How it is now, into `o` (made by readOf). */
  read(o: CarRead, named?: (bodyIndex: number) => number): void {
    const B = this.h.bodies;
    const p = this.body.GetCenterOfMassPosition();
    const q = B.GetRotation(this.id);
    const v = B.GetLinearVelocity(this.id);
    const w = B.GetAngularVelocity(this.id);
    o.p[0] = p.GetX();
    o.p[1] = p.GetY();
    o.p[2] = p.GetZ();
    o.q[0] = q.GetX();
    o.q[1] = q.GetY();
    o.q[2] = q.GetZ();
    o.q[3] = q.GetW();
    o.v[0] = v.GetX();
    o.v[1] = v.GetY();
    o.v[2] = v.GetZ();
    o.w[0] = w.GetX();
    o.w[1] = w.GetY();
    o.w[2] = w.GetZ();
    const ctl = this.wheeled ?? this.tracked;
    if (ctl) {
      const e = ctl.GetEngine();
      const t = ctl.GetTransmission();
      o.rpm = e.GetCurrentRPM();
      o.gear = t.GetCurrentGear();
      o.clutch = t.GetClutchFriction();
      o.shifting = t.IsSwitchingGear();
    }
    for (let i = 0; i < this.wheels.length; i++) {
      const wh = this.wheels[i];
      const ow = o.wheels[i];
      ow.contact = wh.HasContact();
      ow.len = wh.GetSuspensionLength();
      ow.spin = wh.GetAngularVelocity();
      ow.angle = wh.GetRotationAngle();
      // (Jolt's angle is about up, + to the left; ours is + to the right, as the driver's input)
      ow.steer = -wh.GetSteerAngle();
      ow.load = this.loads[i];
      this.lastLoad[i] = this.loads[i];
      if (ow.contact) {
        const c = wh.GetContactPosition();
        const n = wh.GetContactNormal();
        ow.cx = c.GetX();
        ow.cy = c.GetY();
        ow.cz = c.GetZ();
        ow.nx = n.GetX();
        ow.ny = n.GetY();
        ow.nz = n.GetZ();
        ow.on = named ? named(wh.GetContactBodyID().GetIndexAndSequenceNumber()) : 0;
      } else {
        ow.load = 0;
        ow.on = 0;
      }
      const wv = this.wheelsWV[i];
      ow.slipLong = wv ? wv.mLongitudinalSlip : 0;
      ow.slipLat = wv ? wv.mLateralSlip : 0;
    }
  }

  /** Gone from the world: its constraint, listener, callbacks, body — and their wrappers. */
  destroy(): void {
    if (this.gone) return;
    this.gone = true;
    const J = this.h.J;
    const S = this.h.system;
    S.RemoveStepListener(this.listener);
    S.RemoveConstraint(this.constraint);
    if (this.callbacks) J.destroy(this.callbacks);
    J.destroy(this.listener);
    // (the constraint holds the tester: both freed with its last ref)
    this.constraint.Release();
    this.h.forget(this.constraint, this.tester, this.wheeled, this.tracked, ...this.wheels, ...this.wheelsWV);
    this.h.bodies.RemoveBody(this.id);
    this.h.bodies.DestroyBody(this.id);
    this.h.forget(this.body, this.id);
    for (const o of [this.v, this.r, this.q, this.right, this.up]) J.destroy(o);
  }
}

/** A read-back for a car of n wheels. */
export function readOf(n: number): CarRead {
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

/** Someone else's car in my world (docs/plan/92 phase 3), or the Grounds' own (the shuttle, the
 *  plough): a dynamic body of its hull and weight, no wheels, pulled each frame to where its driver
 *  has it — so my car meets it by their weights (a kinematic one would be a wall that never gives),
 *  and a walker is stopped by it as by anything solid. */
/** A car's hull as a shape, its centre of mass at its origin: the model's convex hull where it has one
 *  (its points from the centre of mass), else the rounded box (`v`, `q`: scratch). */
/** The hull's box as points, its lower front and back edges cut back at 20°. */
function chamfered(b: CarDef["hull"]): number[] {
  const k = Math.min(b.hy * 0.8, 0.25);
  const inset = Math.min(b.hx * 0.3, k / Math.tan((20 * Math.PI) / 180));
  const top = b.cy + b.hy;
  const bot = b.cy - b.hy;
  const out: number[] = [];
  for (const z of [-b.hz, b.hz])
    for (const [x, y] of [
      [b.cx + b.hx, top],
      [b.cx - b.hx, top],
      [b.cx + b.hx, bot + k],
      [b.cx - b.hx, bot + k],
      [b.cx + b.hx - inset, bot],
      [b.cx - b.hx + inset, bot],
    ])
      out.push(x, y, z);
  return out;
}

function hullShape(h: CarHost, hull: CarDef["hull"], v: Jolt.Vec3, q: Jolt.Quat): Jolt.Shape | null {
  const J = h.J;
  // (no collider of its own: the box, its nose and tail chamfered underneath — a 20° approach, as a
  // bumper's; a square nose struck a rise steeper than it and stopped dead, threw it up nose first)
  const pts = hull.pts ?? chamfered(hull);
  if (pts && pts.length >= 12) {
    const hs = new J.ConvexHullShapeSettings();
    const list = hs.mPoints;
    for (let i = 0; i + 2 < pts.length; i += 3) {
      v.Set(pts[i], pts[i + 1], pts[i + 2]);
      list.push_back(v);
    }
    h.forget(list);
    hs.mMaxConvexRadius = 0.04;
    // (its own centre of mass, the hull's volume's: moved back to the origin — the car's is the spec's)
    const res = hs.Create();
    if (!res.HasError()) {
      const got = res.Get();
      const c = got.GetCenterOfMass();
      v.Set(-c.GetX(), -c.GetY(), -c.GetZ());
      h.forget(c, got);
      J.destroy(res);
      const off = new J.OffsetCenterOfMassShapeSettings(v, hs);
      const shape = h.shape(off);
      if (shape) return shape;
    } else {
      J.destroy(res);
      J.destroy(hs);
    }
  }
  v.Set(hull.hx, hull.hy, hull.hz);
  const box = new J.BoxShapeSettings(v, Math.min(0.08, hull.hy * 0.4));
  v.Set(hull.cx, hull.cy, 0);
  q.Set(0, 0, 0, 1);
  const placed = new J.RotatedTranslatedShapeSettings(v, q, box);
  // (the shape's own centre of mass is the box's: moved back to the origin)
  v.Set(-hull.cx, -hull.cy, 0);
  const com = new J.OffsetCenterOfMassShapeSettings(v, placed);
  return h.shape(com);
}

export class PulledCar {
  readonly body: Jolt.Body;
  readonly id: Jolt.BodyID;
  private readonly v: Jolt.Vec3;
  private readonly r: Jolt.RVec3;
  private readonly q: Jolt.Quat;
  private gone = false;
  private placed = false;

  constructor(
    private readonly h: CarHost,
    readonly hull: CarDef["hull"],
    readonly mass: number,
    at: { x: number; y: number; z: number; q: [number, number, number, number] },
  ) {
    const J = h.J;
    this.v = new J.Vec3(hull.hx, hull.hy, hull.hz);
    this.r = new J.RVec3(at.x, at.y, at.z);
    this.q = new J.Quat(0, 0, 0, 1);
    const shape = hullShape(h, hull, this.v, this.q);
    if (!shape) throw new Error("[physics] a pulled car's hull refused");
    this.q.Set(at.q[0], at.q[1], at.q[2], at.q[3]);
    const bcs = new J.BodyCreationSettings(shape, this.r, this.q, J.EMotionType_Dynamic, h.layer);
    bcs.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia;
    bcs.mMassPropertiesOverride.mMass = mass;
    bcs.mGravityFactor = 0;
    bcs.mFriction = 0.5;
    bcs.mRestitution = 0.04;
    bcs.mLinearDamping = 0;
    bcs.mAngularDamping = 0;
    bcs.mMotionQuality = J.EMotionQuality_LinearCast;
    bcs.mAllowSleeping = false;
    this.body = h.bodies.CreateBody(bcs);
    J.destroy(bcs);
    this.id = this.body.GetID();
    h.bodies.AddBody(this.id, J.EActivation_Activate);
    h.letGo(shape);
  }

  /** To its driver's pose: velocities that take it there over `tau` s from where it is (and its
   *  own velocity on top) — a stiff spring, never a teleport, unless it's far (a jump). */
  pull(x: number, y: number, z: number, q: number[], v: number[], wy: number, dt: number, tau = 0.08): void {
    if (this.gone) return;
    const J = this.h.J;
    const B = this.h.bodies;
    const p = this.body.GetCenterOfMassPosition();
    const dx = x - p.GetX();
    const dy = y - p.GetY();
    const dz = z - p.GetZ();
    if (!this.placed || dx * dx + dy * dy + dz * dz > 25) {
      this.placed = true;
      this.r.Set(x, y, z);
      this.q.Set(q[0], q[1], q[2], q[3]);
      B.SetPositionAndRotation(this.id, this.r, this.q, J.EActivation_Activate);
      this.v.Set(v[0], v[1], v[2]);
      B.SetLinearVelocity(this.id, this.v);
      return;
    }
    const k = 1 / Math.max(tau, dt);
    this.v.Set(v[0] + dx * k, v[1] + dy * k, v[2] + dz * k);
    B.SetLinearVelocity(this.id, this.v);
    // (its turn: the rotation from where it is to where it's wanted, as a spin)
    const c = this.body.GetRotation();
    const cx = c.GetX();
    const cy = c.GetY();
    const cz = c.GetZ();
    const cw = c.GetW();
    // d = q · c⁻¹
    let ex = q[3] * -cx + q[0] * cw + q[1] * -cz - q[2] * -cy;
    let ey = q[3] * -cy + q[1] * cw + q[2] * -cx - q[0] * -cz;
    let ez = q[3] * -cz + q[2] * cw + q[0] * -cy - q[1] * -cx;
    let ew = q[3] * cw - q[0] * -cx - q[1] * -cy - q[2] * -cz;
    if (ew < 0) {
      ex = -ex;
      ey = -ey;
      ez = -ez;
      ew = -ew;
    }
    const s = Math.sqrt(ex * ex + ey * ey + ez * ez);
    const ang = 2 * Math.atan2(s, ew);
    const f = s > 1e-9 ? (ang / s) * k : 0;
    this.v.Set(ex * f, wy + ey * f, ez * f);
    B.SetAngularVelocity(this.id, this.v);
  }

  destroy(): void {
    if (this.gone) return;
    this.gone = true;
    this.h.bodies.RemoveBody(this.id);
    this.h.bodies.DestroyBody(this.id);
    this.h.forget(this.body, this.id);
    for (const o of [this.v, this.r, this.q]) this.h.J.destroy(o);
  }
}
