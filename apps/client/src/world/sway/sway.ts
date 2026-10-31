import type { DanglePart, PhysicsWorld } from "@yutopia/shared/physics";
import { type Bone, Quaternion, Vector3 } from "three";
import type { PersonModel } from "@/world/chars";
import type { HangSpec } from "@/world/chars/kit";
import type { JointName } from "@/world/chars/rig";

// The sway (docs/plan/61-the-sway.md): what a person wears that swings, on Jolt — a bag hung from
// where its strap leaves the body (swung within limits fore and aft and out, free to rise up its
// strap a little: it lifts in a jump's fall and thumps down on landing), a ponytail, a scarf's
// ends, a tie, a badge, earrings — against stand-ins of their body (kinematic capsules moved to the
// bones each frame: the head, the chest, the hips, the thighs, the shins, the upper arms), read back
// as the bones they hang on. What the builders hang (`HangSpec`) says where and what shape; the
// recipes here how it swings. The springs they'd have swung on are left to it (`skip`). One
// person's; the world is stepped by its owner, between `pre` and `post`. The physics world's
// coordinates are the scene's less `origin` (the floor seen's frame).

export const SWAY_CHUNK = "yutopia-sway";

/** A stand-in: from a joint to another (or a ball `up` above the first), this round (m, at 1.7 m tall). */
const STAND: { a: JointName; b?: JointName; up?: number; r: number }[] = [
  { a: "head", up: 0.1, r: 0.1 },
  { a: "chest", b: "neck", r: 0.12 },
  { a: "spine", b: "chest", r: 0.12 },
  { a: "thighL", b: "thighR", r: 0.1 },
  { a: "thighL", b: "kneeL", r: 0.07 },
  { a: "thighR", b: "kneeR", r: 0.07 },
  { a: "kneeL", b: "ankleL", r: 0.05 },
  { a: "kneeR", b: "ankleR", r: 0.05 },
  { a: "shoulderL", b: "elbowL", r: 0.045 },
  { a: "shoulderR", b: "elbowR", r: 0.045 },
  { a: "elbowL", b: "wristL", r: 0.04 },
  { a: "elbowR", b: "wristR", r: 0.04 },
  { a: "wristL", b: "fingersL", r: 0.04 },
  { a: "wristR", b: "fingersR", r: 0.04 },
];
const HEAD = 0;
// (what lies on the chest meets none of the body's stand-ins: the chest it lies on, the arms swinging
// past, a knee tucked up in a jump — light, they'd fling it or press it into the shirt)
const CHEST = STAND.map((_, i) => i);

/** How a thing swings: how heavy (kg); its strap's slack (m, at 1.7 m tall) and stretch (Hz); how
 *  far it swings forward (rad), back (into the body, for what lies on it), out; its twist; its
 *  joint's friction (N·m); the spring (Hz) drawing it back to lie as it was built (what lies on the
 *  body, not hanging free); its damping; the stand-ins it never meets (what it lies on or hangs by). */
export interface Recipe {
  mass: number;
  slack?: number;
  stretch?: number;
  cone: number;
  back?: number;
  out: number;
  twist: number;
  friction: number;
  rest?: number;
  drag: number;
  spin: number;
  skip?: number[];
}
const BAG = { drag: 0.35, spin: 1.2 };
export const RECIPES: Record<string, Recipe> = {
  satchel: { ...BAG, mass: 1.4, slack: 0.06, stretch: 14, cone: 0.6, out: 0.3, twist: 0.25, friction: 0.15 },
  crossbody: { ...BAG, mass: 0.6, slack: 0.04, stretch: 14, cone: 0.5, out: 0.25, twist: 0.25, friction: 0.06 },
  // (by the arm, heavier and damped: the arm's swing knocks it, never flings it)
  tote: { ...BAG, mass: 2, slack: 0.05, stretch: 12, cone: 0.45, out: 0.15, twist: 0.3, friction: 0.25 },
  // (belted on against the waist: it never meets the trunk's stand-ins it sits in, only its limits)
  fannypack: {
    skip: [1, 2, 3, 10, 11, 12, 13],
    mass: 0.4,
    slack: 0.02,
    stretch: 16,
    cone: 0.15,
    back: 0.03,
    out: 0.1,
    twist: 0.1,
    friction: 0.03,
    rest: 6,
    drag: 0.5,
    spin: 2,
  },
  // (strapped on: it hardly swings into the back or off it — the straps hold it to it — and bounces)
  backpack: {
    mass: 2.5,
    slack: 0.03,
    stretch: 16,
    cone: 0.02,
    back: 0.06,
    out: 0.05,
    twist: 0.08,
    friction: 0.3,
    rest: 6,
    drag: 0.4,
    spin: 1.5,
  },
  badge: {
    mass: 0.05,
    cone: 0.7,
    back: 0,
    out: 0.3,
    twist: 0.2,
    friction: 5e-4,
    rest: 2.5,
    drag: 1,
    spin: 2,
    skip: CHEST,
  },
  tie: {
    mass: 0.06,
    cone: 0.7,
    back: 0,
    out: 0.4,
    twist: 0.2,
    friction: 8e-4,
    rest: 4,
    drag: 1.2,
    spin: 3,
    skip: CHEST,
  },
  scarf: {
    mass: 0.12,
    cone: 0.6,
    back: 0.02,
    out: 0.4,
    twist: 0.2,
    friction: 0.002,
    rest: 3,
    drag: 1.5,
    spin: 3,
    skip: CHEST,
  },
  tail: { mass: 0.12, cone: 0.7, out: 0.5, twist: 0.2, friction: 0.004, drag: 1.2, spin: 2.5, skip: [HEAD] },
  earring: { mass: 0.005, cone: 0.6, out: 0.6, twist: 0.3, friction: 0, drag: 2, spin: 3, skip: CHEST },
};
/** moved further than this in a frame, it's a teleport: everything put back to hanging (m) */
const JUMP = 1;

const UP = new Vector3(0, 1, 0);
const v = new Vector3();
const w = new Vector3();
const d = new Vector3();
const q = new Quaternion();
const pq = new Quaternion();
const lq = new Quaternion();
const X = new Vector3(1, 0, 0);
// (a way's tilt fore and aft in its parent's space: + forward, from hanging straight down)
const pitchOf = (x: Vector3) => Math.atan2(x.z, -x.y);

interface Hung {
  joint: JointName;
  id: number;
  /** where it hangs from, in its parent bone's space */
  piv: Vector3;
  /** from the bone's turn to its body's (its body's = the bone's × this), and its middle off the
   *  bone (the bone's space) */
  off: Quaternion;
  c: Vector3;
  /** the bone's own rest place (its parent's space): moved on Jolt, put back each frame */
  rest: Vector3;
  /** how it hung at first, fore and aft (rad, its parent's space: + forward), and how far it may go
   *  either way (forward, back) — as drawn: Jolt holds them a frame or two late on a quick-turned
   *  anchor (a chest pitching in a run), and a badge lying on it went into the shirt */
  pitch: number;
  fwd: number;
  back: number;
}
type Origin = () => { x: number; y: number; z: number };

export class Sway {
  /** the joints left to Jolt: the model's springs skip them */
  readonly skip = new Set<JointName>();
  private proxies: number | null = null;
  private hung: Hung[] = [];
  private key: unknown = null;
  private readonly at = new Float32Array(STAND.length * 7);
  private readonly one = new Float32Array(7);
  private readonly last = new Vector3(Number.NaN, 0, 0);
  private o = { x: 0, y: 0, z: 0 };
  private scale = 1;

  constructor(
    private readonly world: PhysicsWorld,
    readonly model: PersonModel,
    private readonly origin: Origin = () => ({ x: 0, y: 0, z: 0 }),
  ) {}

  /** Before the world's step (after `setPose`, the root placed): the stand-ins and anchors to the
   *  bones, reached over `dt` s. */
  pre(dt: number): void {
    const m = this.model;
    const worn = m.worn();
    if (!worn?.length) {
      if (this.proxies) this.clear();
      this.key = worn;
      return;
    }
    if (worn !== this.key) this.build();
    if (!this.proxies) return;
    for (const h of this.hung) {
      m.bones[h.joint].position.copy(h.rest);
      m.bones[h.joint].quaternion.identity();
    }
    m.root.updateWorldMatrix(true, true);
    m.root.getWorldPosition(v);
    const o = this.origin();
    // (put elsewhere, or the floor seen changed under it: back to hanging)
    if (!(v.distanceTo(this.last) < JUMP) || o.x !== this.o.x || o.y !== this.o.y || o.z !== this.o.z) {
      this.build();
      return;
    }
    this.last.copy(v);
    this.stand(this.at);
    this.world.moveProxies(this.proxies, this.at, dt);
    for (const h of this.hung) this.world.moveDangle(h.id, this.anchor(h), dt);
  }

  /** After the world's step: each bone where its body is. */
  post(): void {
    const m = this.model;
    const o = this.o;
    for (const h of this.hung) {
      if (!this.world.dangleParts(h.id, this.one)) continue;
      const bone = m.bones[h.joint];
      const parent = bone.parent;
      if (!parent) continue;
      const b = this.one;
      // (its body in its parent's space; past its limits fore and aft as Jolt has it — late — turned
      // back within them about where it hangs from)
      parent.getWorldQuaternion(pq);
      lq.copy(pq.invert()).multiply(q.set(b[3], b[4], b[5], b[6]));
      parent.worldToLocal(v.set(b[0] + o.x, b[1] + o.y, b[2] + o.z));
      d.copy(v).sub(h.piv);
      const tilt = pitchOf(d) - h.pitch;
      const over = tilt > h.fwd ? tilt - h.fwd : tilt < -h.back ? tilt + h.back : 0;
      if (over) {
        // (+ about its left swings it back: undo the excess)
        q.setFromAxisAngle(X, over);
        lq.premultiply(q);
        v.copy(h.piv).add(d.applyQuaternion(q));
      }
      // (the bone's turn: its body's, less the body's own off it; its place, the body's less its
      // middle off the bone)
      lq.multiply(pq.copy(h.off).invert());
      bone.quaternion.copy(lq);
      bone.position.copy(v.sub(w.copy(h.c).applyQuaternion(lq)));
      bone.updateMatrixWorld(true);
    }
  }

  /** Everything back to hanging, still (a teleport, a seek, the loop round). */
  reset(): void {
    this.key = null;
  }

  /** Swinging anything (it wears something that does, and it's made). */
  get on(): boolean {
    return this.hung.length > 0;
  }

  dispose(): void {
    this.clear();
  }

  private clear() {
    const m = this.model;
    for (const h of this.hung) {
      this.world.removeDangle(h.id);
      m.bones[h.joint].position.copy(h.rest);
      m.bones[h.joint].quaternion.identity();
    }
    this.hung = [];
    this.skip.clear();
    if (this.proxies) this.world.removeProxies(this.proxies);
    this.proxies = null;
  }

  // (the stand-ins' places now, the world's: each its middle, turned from up to its way)
  private stand(out: Float32Array) {
    const B = this.model.bones;
    const o = this.o;
    STAND.forEach((s, i) => {
      B[s.a].getWorldPosition(v);
      if (s.b) {
        B[s.b].getWorldPosition(w);
        q.setFromUnitVectors(UP, d.copy(w).sub(v).normalize());
        v.add(w).multiplyScalar(0.5);
      } else {
        B[s.a].getWorldQuaternion(q);
        v.add(w.set(0, (s.up ?? 0) * this.scale, 0).applyQuaternion(q));
      }
      out.set([v.x - o.x, v.y - o.y, v.z - o.z, q.x, q.y, q.z, q.w], i * 7);
    });
  }

  // (where a dangle hangs from now, the world's: on its parent bone, turned as it is)
  private anchor(h: Hung): Float32Array {
    const p = this.model.bones[h.joint].parent as Bone;
    p.localToWorld(v.copy(h.piv));
    p.getWorldQuaternion(q);
    const o = this.o;
    this.one.set([v.x - o.x, v.y - o.y, v.z - o.z, q.x, q.y, q.z, q.w]);
    return this.one;
  }

  private build() {
    this.clear();
    const m = this.model;
    const worn = m.worn();
    this.key = worn;
    if (!worn?.length) return;
    this.scale = m.height / 1.7;
    this.o = { ...this.origin() };
    const o = this.o;
    m.root.updateWorldMatrix(true, true);
    m.root.getWorldPosition(this.last);
    const B = m.bones;
    // the stand-ins, their lengths as the bones are now
    const lens = STAND.map((s) => (s.b ? B[s.a].getWorldPosition(v).distanceTo(B[s.b].getWorldPosition(w)) : 0));
    this.proxies = this.world.addProxies(
      STAND.map((s, i) => ({ r: s.r * this.scale, h: lens[i] / 2 })),
      12,
    );
    if (!this.proxies) return;
    this.stand(this.at);
    this.world.moveProxies(this.proxies, this.at, 0, true);
    // (one a joint: the last hung on it — a scarf over a tie, the second of a pair of tails)
    const each = new Map<JointName, HangSpec>();
    for (const h of worn) each.set(h.joint, h);
    let sub = STAND.length;
    for (const h of each.values()) {
      const R = RECIPES[h.kind];
      if (!R) continue;
      const bone = B[h.joint];
      const parent = bone.parent as Bone;
      // (it hangs from where its strap leaves the body, or from its joint)
      const piv = h.from ? new Vector3(...h.from) : bone.position.clone();
      const at = parent.localToWorld(piv.clone());
      const c = new Vector3(...h.c);
      const mid = bone.localToWorld(c.clone());
      const off = new Quaternion();
      // (a box turned about up; a rod along from where it hangs to its middle)
      if (h.box) off.setFromAxisAngle(UP, h.yaw ?? 0);
      else off.setFromUnitVectors(UP, c.clone().sub(bone.worldToLocal(at.clone())).normalize().negate());
      const bq = bone.getWorldQuaternion(new Quaternion()).multiply(off);
      const r = h.r ?? 0.02;
      const part: DanglePart = {
        parent: -1,
        at: [at.x - o.x, at.y - o.y, at.z - o.z],
        c: [mid.x - o.x, mid.y - o.y, mid.z - o.z],
        q: [bq.x, bq.y, bq.z, bq.w],
        across: this.across(parent),
        box: h.box,
        r,
        h: Math.max(0.005, mid.distanceTo(at) - r),
        mass: R.mass,
        slack: (R.slack ?? 0) * this.scale,
        stretch: R.stretch,
        cone: R.cone,
        back: R.back,
        coneAcross: R.out,
        twist: R.twist,
        friction: R.friction,
        rest: R.rest,
        drag: R.drag,
        spin: R.spin,
        skip: R.skip,
      };
      const hung: Hung = {
        joint: h.joint,
        id: 0,
        piv,
        off,
        c,
        rest: bone.position.clone(),
        pitch: pitchOf(parent.worldToLocal(mid.clone()).sub(piv)),
        fwd: R.cone,
        back: R.back ?? R.cone,
      };
      const id = this.world.addDangle(this.anchor(hung), [part], this.proxies, sub++);
      if (!id) continue;
      hung.id = id;
      this.hung.push(hung);
      this.skip.add(h.joint);
    }
  }

  // (a bone's own left, in the world: what's across a dangle hung from it)
  private across(b: Bone): [number, number, number] {
    b.getWorldQuaternion(q);
    return v.set(1, 0, 0).applyQuaternion(q).toArray() as [number, number, number];
  }
}
