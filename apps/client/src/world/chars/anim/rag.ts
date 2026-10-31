import type { PhysicsWorld, RagPart } from "@yutopia/shared/physics";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { PersonModel } from "../model";
import type { Moved } from "../moves";
import type { Euler3, JointName, Pose } from "../rig";

// Plan 58 phase 5d (docs/plan/58-the-animation.md, C2): gone limp — a high fall, a hard hit — on
// Jolt's ragdoll, the world's own physics (the one owner: PhysicsWorld.addRagdoll). A body a bone:
// each part is made where its bone is and turned as it is, its capsule along the bone to the next
// joint, so what Jolt gives back is the bone itself. Read back onto the model, then as a pose (each
// joint's turn off its parent's, the hips as a lift off the root) for the get-up to start from.

interface Spec {
  bone: JointName;
  parent: number;
  /** the bone it reaches to (its capsule's end), and how far past it (m) */
  to: JointName;
  past?: number;
  r: number;
  mass: number;
  hinge?: "knee" | "elbow";
  cone?: number;
  twist?: number;
}
// (12 parts, ~70 kg: the trunk's three, the head, the arms' and legs' two each)
const SPECS: Spec[] = [
  { bone: "hips", parent: -1, to: "spine", past: 0.12, r: 0.12, mass: 14 },
  { bone: "spine", parent: 0, to: "chest", r: 0.11, mass: 9, cone: 0.35, twist: 0.3 },
  { bone: "chest", parent: 1, to: "neck", r: 0.13, mass: 12, cone: 0.3, twist: 0.3 },
  { bone: "neck", parent: 2, to: "head", past: 0.2, r: 0.1, mass: 5, cone: 0.55, twist: 0.6 },
  { bone: "shoulderL", parent: 2, to: "elbowL", r: 0.05, mass: 2.2, cone: 1.4, twist: 0.8 },
  { bone: "elbowL", parent: 4, to: "wristL", past: 0.08, r: 0.045, mass: 1.8, hinge: "elbow" },
  { bone: "shoulderR", parent: 2, to: "elbowR", r: 0.05, mass: 2.2, cone: 1.4, twist: 0.8 },
  { bone: "elbowR", parent: 6, to: "wristR", past: 0.08, r: 0.045, mass: 1.8, hinge: "elbow" },
  { bone: "thighL", parent: 0, to: "kneeL", r: 0.075, mass: 8, cone: 1.1, twist: 0.4 },
  { bone: "kneeL", parent: 8, to: "ankleL", past: 0.05, r: 0.06, mass: 4, hinge: "knee" },
  { bone: "thighR", parent: 0, to: "kneeR", r: 0.075, mass: 8, cone: 1.1, twist: 0.4 },
  { bone: "kneeR", parent: 10, to: "ankleR", past: 0.05, r: 0.06, mass: 4, hinge: "knee" },
];

const q = new Quaternion();
const qp = new Quaternion();
const p = new Vector3();
const e = new Vector3();
const m4 = new Matrix4();
const eu = new Euler();
const tup = (v: Vector3): [number, number, number] => [v.x, v.y, v.z];
const up = new Vector3(0, 1, 0);

/** One person's ragdoll: made from how their model stands now, run by the world, read back. */
export class RagdollRig {
  private id: number | null = null;
  private readonly buf = new Float32Array(SPECS.length * 7);
  /** the pose it went limp from: the joints it doesn't move (wrists, ankles, fingers) kept */
  private from: Pose = {};
  private lift: [number, number, number] = [0, 0, 0];
  pose: Pose = {};

  constructor(
    private readonly world: PhysicsWorld,
    private readonly model: PersonModel,
    /** where the physics world's origin is in the scene (the world's: its floor's frame) */
    private readonly origin: () => { x: number; y: number; z: number } = () => ({ x: 0, y: 0, z: 0 }),
  ) {}

  /** Limp from the model's pose as it's shown now, going at `vel` (m/s, world); `hit`: a blow to a
   *  part (its index in the parts: 2 the chest, 3 the head) as an impulse (N·s). False if refused. */
  start(pose: Pose, vel: [number, number, number], hit?: { part: number; impulse: [number, number, number] }): boolean {
    this.stop();
    const M = this.model;
    M.root.updateMatrixWorld(true);
    this.from = { ...pose };
    const o = this.origin();
    const parts: RagPart[] = [];
    for (const s of SPECS) {
      const b = M.bone(s.bone);
      const c = M.bone(s.to);
      if (!b || !c) return false;
      b.getWorldPosition(p);
      b.getWorldQuaternion(q);
      e.copy(c.position);
      if (s.past) e.addScaledVector(e.clone().normalize(), s.past);
      const dir = e.clone().normalize().applyQuaternion(q);
      const axis = new Vector3(1, 0, 0).applyQuaternion(q);
      // (where it hangs from its parent at rest: the parent's turn, the bone's own way)
      let rest: Vector3 | undefined;
      if (s.parent >= 0) {
        const pb = M.bone(SPECS[s.parent].bone);
        if (pb) rest = e.clone().normalize().applyQuaternion(pb.getWorldQuaternion(qp));
      }
      // (a hinge's limits from how bent it is now: a knee 0…2.5 rad, an elbow −2.5…0)
      const bent = pose[s.bone]?.[0] ?? 0;
      const hinge: [number, number] | undefined =
        s.hinge === "knee" ? [-bent, 2.5 - bent] : s.hinge === "elbow" ? [-2.5 - bent, -bent] : undefined;
      parts.push({
        parent: s.parent,
        at: [p.x - o.x, p.y - o.y, p.z - o.z],
        q: [q.x, q.y, q.z, q.w],
        end: tup(e),
        r: s.r,
        mass: s.mass,
        dir: tup(dir),
        axis: tup(axis),
        rest: rest ? tup(rest) : undefined,
        hinge,
        cone: s.cone,
        twist: s.twist,
      });
    }
    this.id = this.world.addRagdoll(parts, vel);
    if (this.id !== null && hit) this.world.pushRagdoll(this.id, hit.part, hit.impulse);
    if (this.id !== null) this.read();
    return this.id !== null;
  }

  get on(): boolean {
    return this.id !== null;
  }

  /** How fast its quickest part goes (m/s). */
  speed(): number {
    return this.id === null ? 0 : this.world.ragdollSpeed(this.id);
  }

  /** After the world's step: the parts read back as the bones, then as a pose off the model's root
   *  (`pose`, and `moved()` with the hips' lift). */
  read(root?: { at: Vector3; yaw: number }): void {
    if (this.id === null || !this.world.ragdollParts(this.id, this.buf)) return;
    // (into the scene: the world's origin added back)
    const o = this.origin();
    for (let i = 0; i < SPECS.length; i++) {
      this.buf[i * 7] += o.x;
      this.buf[i * 7 + 1] += o.y;
      this.buf[i * 7 + 2] += o.z;
    }
    const M = this.model;
    M.root.updateMatrixWorld(true);
    const world = new Map<JointName, Quaternion>();
    const B = this.buf;
    const out: Pose = { ...this.from };
    SPECS.forEach((s, i) => {
      const wq = new Quaternion(B[i * 7 + 3], B[i * 7 + 4], B[i * 7 + 5], B[i * 7 + 6]);
      world.set(s.bone, wq);
      // (its turn off its parent's: the root for the hips)
      // (off a root given — the world's: where it'll stand, turned the way it lies — else the model's)
      const par =
        s.parent >= 0
          ? world.get(SPECS[s.parent].bone)
          : root
            ? new Quaternion().setFromAxisAngle(up, root.yaw)
            : M.root.getWorldQuaternion(qp).clone();
      const local = (par as Quaternion).clone().invert().multiply(wq);
      eu.setFromQuaternion(local, "XYZ");
      out[s.bone] = [eu.x, eu.y, eu.z] as Euler3;
      // (the joints between parts as they were: the chest's to the neck's done by the parts' own)
      if (i === 0) {
        p.set(B[0], B[1], B[2]);
        if (root) m4.makeRotationY(root.yaw).setPosition(root.at).invert();
        else m4.copy(M.root.matrixWorld).invert();
        p.applyMatrix4(m4);
        const r = M.restHips;
        this.lift = [p.x - r[0], p.y - r[1], p.z - r[2]];
      }
    });
    // (limp: the wrists and the feet let go)
    for (const j of ["wristL", "wristR"] as const) out[j] = [0.3, 0, 0];
    for (const j of ["ankleL", "ankleR"] as const) out[j] = [0.45, 0, 0];
    out.head = [0, 0, 0];
    this.pose = out;
  }

  /** As a body's pose (for the model's `setPose`, and the get-up to start from). */
  moved(): Moved {
    return { pose: this.pose, lift: [...this.lift] };
  }

  /** Where the hips are (world) and which way the front of the trunk faces (world): face up when its
   *  y is over nought. */
  lying(): { hips: Vector3; front: Vector3; head: Vector3 } | null {
    if (this.id === null) return null;
    const B = this.buf;
    const front = new Vector3(0, 0, 1).applyQuaternion(new Quaternion(B[10], B[11], B[12], B[13]));
    return { hips: new Vector3(B[0], B[1], B[2]), front, head: new Vector3(B[21], B[22], B[23]) };
  }

  stop(): void {
    if (this.id !== null) this.world.removeRagdoll(this.id);
    this.id = null;
  }
}

type Hands = import("./air").Hands;
// (a pose laid over another by each joint's turn, slerped)
const qa = new Quaternion();
const qb = new Quaternion();
function blend(a: Pose, b: Pose, w: number): Pose {
  const out: Pose = { ...a };
  for (const j of Object.keys(b) as JointName[]) {
    const x = a[j] ?? [0, 0, 0];
    const y = b[j] ?? [0, 0, 0];
    qa.setFromEuler(eu.set(x[0], x[1], x[2])).slerp(qb.setFromEuler(eu.set(y[0], y[1], y[2])), w);
    eu.setFromQuaternion(qa);
    out[j] = [eu.x, eu.y, eu.z];
  }
  return out;
}
type GetUp = (u: number, back: boolean) => { m: Moved; hands: Hands | null };

/** Down and up again: limp on the ragdoll till it's lain still a moment (or 4 s), then stood where
 *  it lay — the root moved under the hips, turned the way the body lies — and the get-up from its
 *  back or its front, blended in from how it lay. */
export class Downed {
  readonly rig: RagdollRig;
  private t = 0;
  private still = 0;
  private up: { u: number; back: boolean; from: Moved } | null = null;
  /** (8) never getting up: one of the shadowed, shot down, lying there as it burns away */
  private stay = false;

  constructor(
    world: PhysicsWorld,
    private readonly model: PersonModel,
    origin?: () => { x: number; y: number; z: number },
    /** (the world's) the root stays where the body is — it isn't the rig's to move: the pose is read
     *  off it wherever the ragdoll's gone, and the get-up's turned the way she lies (`root.yaw`) */
    private readonly anchored = false,
  ) {
    this.rig = new RagdollRig(world, model, origin);
  }

  get on(): boolean {
    return this.rig.on || !!this.up;
  }

  /** Gone limp from `pose`, going at `vel`, perhaps hit (RagdollRig.start). */
  fall(
    pose: Pose,
    vel: [number, number, number],
    hit?: { part: number; impulse: [number, number, number] },
    stay = false,
  ): boolean {
    this.stay = stay;
    this.t = 0;
    this.still = 0;
    this.up = null;
    return this.rig.start(pose, vel, hit);
  }

  /** After the world's step: the body to show, its hands, and once it's lain still where the root's
   *  to go (set it before the next call); null when it's up. */
  update(
    dt: number,
    groundY: (x: number, z: number) => number,
    getUp: GetUp,
    len: number,
  ): { m: Moved; hands: Hands | null; root?: { x: number; y: number; z: number; yaw: number } } | null {
    const R = this.rig;
    if (R.on) {
      // (the root kept under the hips as it goes: where the body is, for the camera and the world)
      const was = R.lying();
      const M = this.model;
      if (was && !this.anchored) M.root.position.set(was.hips.x, groundY(was.hips.x, was.hips.z), was.hips.z);
      R.read();
      this.t += dt;
      this.still = R.speed() < 0.25 ? this.still + dt : 0;
      const at = { x: M.root.position.x, y: M.root.position.y, z: M.root.position.z, yaw: M.root.rotation.y };
      if (this.stay || (this.still < 0.5 && this.t < 4)) return { m: R.moved(), hands: null, root: at };
      const L = R.lying();
      if (!L) return null;
      const back = L.front.y > 0;
      const fx = (L.head.x - L.hips.x) * (back ? -1 : 1);
      const fz = (L.head.z - L.hips.z) * (back ? -1 : 1);
      const root = { x: L.hips.x, y: groundY(L.hips.x, L.hips.z), z: L.hips.z, yaw: Math.atan2(fx, fz) };
      // (how it lies, read again off where it'll stand — anchored, off the root where the body is, turned
      // the way it lies: the caller turns the person so)
      if (!this.anchored) {
        this.model.root.position.set(root.x, root.y, root.z);
        this.model.root.rotation.y = root.yaw;
        R.read();
      } else {
        const at = this.model.root.getWorldPosition(new Vector3());
        root.x = at.x;
        root.y = at.y;
        root.z = at.z;
        R.read({ at, yaw: root.yaw });
      }
      this.up = { u: 0, back, from: R.moved() };
      R.stop();
      return { m: this.up.from, hands: null, root };
    }
    const U = this.up;
    if (!U) return null;
    U.u = Math.min(1, U.u + dt / len);
    const g = getUp(U.u, U.back);
    const w = 1 - (1 - Math.min(1, U.u / 0.22)) ** 3;
    const m: Moved = {
      pose: blend(U.from.pose, g.m.pose, w),
      lift: [0, 1, 2].map((i) => U.from.lift[i] + (g.m.lift[i] - U.from.lift[i]) * w) as [number, number, number],
    };
    const hands = g.hands;
    if (hands) for (const h of Object.values(hands)) if (h) h.w *= w;
    if (U.u >= 1) this.up = null;
    return { m, hands };
  }

  stop(): void {
    this.rig.stop();
    this.up = null;
  }
}
