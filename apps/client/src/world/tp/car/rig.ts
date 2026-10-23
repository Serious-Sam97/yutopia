import { type CarState, mounts, readout } from "@yutopia/shared/car";
import { Quaternion, Vector3 } from "three";
import type { Lights, Sedan } from "./sedan";
import type { Cluster } from "./vfd";

// A car's model posed from its physics (docs/plan/28-the-car.md): the body
// where the sim has it (smoothed between its fixed steps), the wheels riding
// their springs, steering and spinning, the steering wheel and the pedals'
// lamps, the cluster (redrawn ten times a second), the wipers sweeping, the
// pine tree swinging with the car's g.

const FLIP = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI); // (the model's nose is −x)
const qa = new Quaternion();
const qb = new Quaternion();
const va = new Vector3();
const vb = new Vector3();

export interface RigState {
  beams: "off" | "low" | "high";
  ind: -1 | 0 | 1; // the indicator switched on
  hazard: boolean;
  wipers: 0 | 1 | 2 | 3;
  dome: boolean;
  clock: string;
  outside: number;
  dash: number; // the cluster's brightness (night: full)
}

/** What a car model needs from a car's sim, kept between two of its steps. */
export class CarRig {
  private prevP = new Vector3();
  private prevQ = new Quaternion();
  private curP = new Vector3();
  private curQ = new Quaternion();
  private origin: Vector3;
  private c0: number[];
  private clusterAt = 0;
  private blink = 0;
  private wipe = [0, 0]; // each wiper's phase 0..2 (out and back)
  private swing = { x: 0, z: 0, vx: 0, vz: 0 }; // the pine tree on its string
  private lastV = new Vector3();
  private accel = new Vector3();
  /** the car's g this frame (car-local: x forward, z right), for the cockpit camera */
  readonly g = new Vector3();
  state: RigState = {
    beams: "off",
    ind: 0,
    hazard: false,
    wipers: 0,
    dome: false,
    clock: "12:00",
    outside: -8,
    dash: 0.4,
  };

  constructor(
    readonly model: Sedan,
    private car: CarState,
  ) {
    const s = car.spec;
    // the model's origin (the footprint's middle, on the ground) from the centre of gravity
    // (the model's profile: its front axle at u axleF, its middle at L / 2)
    const cogU = model.dims.axleF + s.front;
    this.origin = new Vector3(cogU - model.dims.L / 2, -s.cog, 0);
    this.c0 = mounts(s).map((m) => m.c0);
    this.snap();
  }

  /** The sim stepped: remember where it was before. */
  stepped() {
    this.prevP.copy(this.curP);
    this.prevQ.copy(this.curQ);
    this.curP.set(this.car.p.x, this.car.p.y, this.car.p.z);
    this.curQ.set(this.car.q.x, this.car.q.y, this.car.q.z, this.car.q.w);
  }
  /** Jump (a teleport, a snap from the server). */
  snap() {
    this.curP.set(this.car.p.x, this.car.p.y, this.car.p.z);
    this.curQ.set(this.car.q.x, this.car.q.y, this.car.q.z, this.car.q.w);
    this.prevP.copy(this.curP);
    this.prevQ.copy(this.curQ);
  }

  /** Pose the model for this frame: `alpha` how far between the last two steps (0..1). */
  pose(alpha: number, dt: number, t: number) {
    const m = this.model;
    const s = this.car;
    va.lerpVectors(this.prevP, this.curP, alpha);
    qa.slerpQuaternions(this.prevQ, this.curQ, alpha);
    // the root: the CoG, back to the model's origin, turned to the model's frame
    vb.copy(this.origin).applyQuaternion(qa);
    m.root.position.copy(va).add(vb);
    m.root.quaternion.copy(qa).multiply(FLIP);
    // the wheels on their springs (model: the wheel's centre rises as the spring compresses)
    for (let i = 0; i < 4; i++) {
      const w = s.wheels[i];
      const mw = m.wheels[i];
      mw.steer.position.y = mw.rest.y + (w.c - this.c0[i]);
      mw.steer.rotation.y = -w.steer;
      mw.spin.rotation.z = w.turn * (mw.turnK ?? 1);
    }
    m.steering.rotation.z = -s.str * s.spec.steer.ratio;
    // the lamps
    this.blink = (this.blink + dt) % 0.9;
    const on = this.blink < 0.45;
    const r = readout(s);
    const st = this.state;
    const lights: Lights = {
      beams: st.beams,
      tail: st.beams !== "off",
      brake: s.brk > 0.05 || s.hb > 0.5 ? Math.max(s.brk, 0.6) : 0,
      reverse: s.gear === -1,
      ind: on ? st.ind : 0,
      hazard: st.hazard && on,
      dash: s.rpm > 50 ? st.dash : 0,
      dome: st.dome,
    };
    m.setLights(lights);
    // the cluster, ten times a second
    if (t - this.clusterAt > 0.1) {
      this.clusterAt = t;
      const gear = r.gear === -1 ? "R" : r.gear === 0 ? "N" : String(r.gear);
      const c: Cluster = {
        kmh: Math.abs(r.kmh),
        rpm: s.rpm,
        gear: s.rpm < 50 ? "P" : gear,
        fuel: s.fuel / s.spec.fuel.litres,
        temp: Math.min(1, s.temp / 0.55) * 0.55,
        clock: st.clock,
        outside: st.outside,
        odo: 87412 + s.odo,
        beams: st.beams,
        ind: on ? (st.hazard ? 1 : st.ind) : 0,
        hand: s.hb > 0.5,
        helps: s.helping !== 0,
      };
      m.setCluster(c);
    }
    // the wipers: a sweep out and back, faster on 2 and 3, resting on 0
    const speeds = [0, 0.75, 1.3, 1.9];
    for (let i = 0; i < m.wipers.length; i++) {
      const wp = m.wipers[i];
      if (st.wipers > 0 || this.wipe[i] > 0) {
        this.wipe[i] += dt * Math.max(speeds[st.wipers], 0.9);
        if (st.wipers === 0 && this.wipe[i] >= 2) this.wipe[i] = 0;
        else this.wipe[i] %= 2;
      }
      const k = this.wipe[i] <= 1 ? this.wipe[i] : 2 - this.wipe[i];
      const e = k * k * (3 - 2 * k);
      wp.arm.rotation.z = wp.park + (wp.sweep - wp.park) * e;
    }
    // the car's acceleration (for the pine tree and the cockpit's sway)
    if (dt > 0) {
      vb.set(s.v.x, s.v.y, s.v.z);
      this.accel.subVectors(vb, this.lastV).divideScalar(Math.max(dt, 1e-3));
      this.lastV.copy(vb);
      qb.set(s.q.x, s.q.y, s.q.z, s.q.w).invert();
      this.g.copy(this.accel).applyQuaternion(qb).divideScalar(9.81);
      this.g.clampLength(0, 1.6);
      // a pendulum: pushed the other way to the car's g
      const sw = this.swing;
      const k = 38; // (a ~6 cm string)
      // (sw: how far it hangs forward and to the right; the car's g pushes it the other way)
      sw.vx += (-k * sw.x - 2.2 * sw.vx - this.g.x * 9.81 * 0.9) * dt;
      sw.vz += (-k * sw.z - 2.2 * sw.vz - this.g.z * 9.81 * 0.9) * dt;
      sw.x += sw.vx * dt;
      sw.z += sw.vz * dt;
      sw.x = Math.max(-0.9, Math.min(0.9, sw.x));
      sw.z = Math.max(-0.9, Math.min(0.9, sw.z));
      // (model axes: x back, z left)
      m.freshener.rotation.z = -sw.x * 0.6;
      m.freshener.rotation.x = sw.z * 0.6;
    }
  }

  /** Where the car is right now (smoothed), world. */
  position(out = new Vector3()): Vector3 {
    return out.copy(this.model.root.position);
  }
}
