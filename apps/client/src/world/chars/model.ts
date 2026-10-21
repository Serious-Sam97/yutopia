import type { AvatarLayers } from "@yutopia/shared";
import {
  Bone,
  Group,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from "three";
import { armsOf, type Baked, bake } from "./bake";
import { buildPerson } from "./build";
import { solveArm } from "./ik";
import { inkMaterial } from "./ink";
import type { Anchor } from "./kit";
import type { Lod } from "./params";
import { JOINTS, type JointName, PARENT, type Pose, REST, type RestPose } from "./rig";

// People in the world: a factory that builds and caches each look at each
// level of detail (shared by everyone wearing it, built a few per frame so
// nothing stutters), and the person — one skinned mesh for the body, one for
// its line, both on one skeleton.

let body: MeshBasicMaterial | null = null;
/** The one material every person's body is drawn with: flat, its colours in the vertices. */
export function bodyMaterial(): MeshBasicMaterial {
  if (!body) body = new MeshBasicMaterial({ vertexColors: true });
  return body;
}

/** What makes two looks the same model (everything in the avatar is drawn). */
export function lookKey(a: AvatarLayers): string {
  return JSON.stringify(a);
}

interface Entry {
  baked: Baked | null;
  refs: number;
  idleSince: number;
}
interface Job {
  key: string;
  avatar: AvatarLayers;
  lod: Lod;
  prio: number;
}

export class CharFactory {
  private entries = new Map<string, Entry>();
  private queue: Job[] = [];
  /** unused models kept this long (ms) before they're disposed, then the oldest first past `keep` */
  constructor(
    private keepMs = 20_000,
    private keep = 24,
  ) {}

  private key(a: AvatarLayers, lod: Lod) {
    return `${lookKey(a)}|${lod}`;
  }

  /** A baked model if ready, else queued (lower `prio` builds first). */
  get(a: AvatarLayers, lod: Lod, prio = 0): Baked | null {
    const key = this.key(a, lod);
    const e = this.entries.get(key);
    if (e?.baked) return e.baked;
    const job = this.queue.find((j) => j.key === key);
    if (job) job.prio = Math.min(job.prio, prio);
    else if (!e) this.queue.push({ key, avatar: a, lod, prio });
    return null;
  }

  /** The nearest level that's ready (or null), asking for `lod` meanwhile. */
  best(a: AvatarLayers, lod: Lod, prio = 0): { baked: Baked; lod: Lod } | null {
    const want = this.get(a, lod, prio);
    if (want) return { baked: want, lod };
    for (const l of [2, 1, 0] as Lod[]) {
      if (l === lod) continue;
      const e = this.entries.get(this.key(a, l));
      if (e?.baked) return { baked: e.baked, lod: l };
    }
    // nothing yet: the coarse one is quick, so it comes first
    if (lod !== 2) this.get(a, 2, prio - 1);
    return null;
  }

  acquire(a: AvatarLayers, lod: Lod) {
    const e = this.entries.get(this.key(a, lod));
    if (e) e.refs++;
  }
  release(a: AvatarLayers, lod: Lod) {
    const e = this.entries.get(this.key(a, lod));
    if (!e) return;
    e.refs = Math.max(0, e.refs - 1);
    if (e.refs === 0) e.idleSince = performance.now();
  }

  /** Build what's queued for up to `budgetMs` (at least one), and let go of what's unused. */
  pump(budgetMs = 4): number {
    const t0 = performance.now();
    let built = 0;
    this.queue.sort((a, b) => a.prio - b.prio);
    while (this.queue.length && (built === 0 || performance.now() - t0 < budgetMs)) {
      const job = this.queue.shift() as Job;
      if (this.entries.get(job.key)?.baked) continue;
      const baked = bake(buildPerson(job.avatar, job.lod));
      this.entries.set(job.key, { baked, refs: 0, idleSince: performance.now() });
      built++;
    }
    this.sweep();
    return built;
  }

  private sweep() {
    const now = performance.now();
    const idle = [...this.entries].filter(([, e]) => e.refs === 0).sort((a, b) => a[1].idleSince - b[1].idleSince);
    let over = idle.length - this.keep;
    for (const [key, e] of idle) {
      if (over <= 0 && now - e.idleSince < this.keepMs) continue;
      e.baked?.body.dispose();
      e.baked?.ink.dispose();
      e.baked?.arms?.body.dispose();
      e.baked?.arms?.ink.dispose();
      this.entries.delete(key);
      over--;
    }
  }

  get pending() {
    return this.queue.length;
  }
  get size() {
    return this.entries.size;
  }

  dispose() {
    for (const e of this.entries.values()) {
      e.baked?.body.dispose();
      e.baked?.ink.dispose();
      e.baked?.arms?.body.dispose();
      e.baked?.arms?.ink.dispose();
    }
    this.entries.clear();
    this.queue = [];
  }
}

/** Hands that reach for a part of the body this frame (blended in by `w`). */
export type Reach = Partial<Record<"L" | "R", { at: Anchor; w: number; dx?: number; dz?: number }>>;

const ik = { shoulder: new Quaternion(), elbow: 0 };
const target = new Vector3();
const pole = new Vector3();

/** One person: shows the best ready level of their look, posed by joint. */
export class PersonModel {
  readonly root = new Group();
  readonly bones = {} as Record<JointName, Bone>;
  private skeleton: Skeleton | null = null;
  private restKey = "";
  private bodyMesh: SkinnedMesh | null = null;
  private inkMesh: SkinnedMesh | null = null;
  private shown: { baked: Baked; lod: Lod } | null = null;
  private pose: Pose = REST;
  private lift: [number, number, number] = [0, 0, 0];
  private restHips: [number, number, number] = [0, 0, 0];
  private face: [number, number] = [0, 0];
  private held: { a: AvatarLayers; lod: Lod } | null = null;

  constructor(
    private f: CharFactory,
    public avatar: AvatarLayers,
    public lod: Lod = 1,
    private mats: { body: Material; ink: Material } = { body: bodyMaterial(), ink: inkMaterial() },
    /** "arms": only shoulder to fingertips (my own, seen from my eyes in first person) */
    readonly part: "all" | "arms" = "all",
  ) {
    this.root.name = "person";
  }

  /** Draw with other materials (faded while away, lit by the room). */
  setMaterials(body: Material, ink: Material) {
    if (this.mats.body === body && this.mats.ink === ink) return;
    this.mats = { body, ink };
    if (this.bodyMesh) this.bodyMesh.material = body;
    if (this.inkMesh) this.inkMesh.material = ink;
  }

  /** Change look or detail; the old model stays until the new one is ready. */
  set(avatar: AvatarLayers, lod: Lod) {
    this.avatar = avatar;
    this.lod = lod;
  }

  /** Swap in whatever is newly ready. Call every frame (cheap when nothing changed). */
  update(prio = 0): boolean {
    const got = this.f.best(this.avatar, this.lod, prio);
    if (got && got.baked !== this.shown?.baked) this.show(got.baked, got.lod);
    return !!this.shown;
  }

  get ready() {
    return !!this.shown;
  }
  get height() {
    return this.shown?.baked.height ?? 1.7;
  }
  /** How far to lower the person so a seated pose rests on a seat `seatY` high. */
  sitDrop(seatY: number): number {
    const b = this.shown?.baked;
    if (!b) return 0;
    return seatY - (b.hipY - b.thighR * 0.92);
  }
  get tris() {
    return this.shown?.baked.tris ?? 0;
  }
  get shownLod(): Lod | null {
    return this.shown?.lod ?? null;
  }

  private show(baked: Baked, lod: Lod) {
    if (this.held) this.f.release(this.held.a, this.held.lod);
    this.f.acquire(this.avatar, lod);
    this.held = { a: this.avatar, lod };
    this.shown = { baked, lod };
    const restKey = JSON.stringify(baked.rest);
    if (restKey !== this.restKey) this.makeSkeleton(baked.rest, restKey);
    const sk = this.skeleton as Skeleton;
    const g = this.part === "arms" ? armsOf(baked) : baked;
    if (!this.bodyMesh) {
      this.bodyMesh = new SkinnedMesh(g.body, this.mats.body);
      this.inkMesh = new SkinnedMesh(g.ink, this.mats.ink);
      // (the arms are only ever drawn in front of the eyes)
      this.bodyMesh.frustumCulled = this.inkMesh.frustumCulled = this.part !== "arms";
      this.bodyMesh.castShadow = true;
      this.bodyMesh.receiveShadow = true;
      this.inkMesh.castShadow = false;
      this.root.add(this.bodyMesh, this.inkMesh);
    } else {
      this.bodyMesh.geometry = g.body;
      (this.inkMesh as SkinnedMesh).geometry = g.ink;
    }
    const id = new Matrix4();
    this.bodyMesh.bind(sk, id);
    (this.inkMesh as SkinnedMesh).bind(sk, id);
    this.bodyMesh.updateMorphTargets();
    this.setFace(this.face[0], this.face[1]);
  }

  private makeSkeleton(rest: RestPose, key: string) {
    this.skeleton?.dispose();
    for (const j of JOINTS) this.bones[j]?.removeFromParent();
    this.restHips = [...rest.hips];
    for (const j of JOINTS) {
      const b = new Bone();
      b.name = j;
      b.position.set(...rest[j]);
      this.bones[j] = b;
      const parent = PARENT[j];
      if (parent) this.bones[parent].add(b);
    }
    this.bones.hips.updateMatrixWorld(true);
    this.skeleton = new Skeleton(JOINTS.map((j) => this.bones[j]));
    this.root.add(this.bones.hips);
    this.restKey = key;
    this.setPose(this.pose);
  }

  /** Pose the joints (joints not named go back to rest); `lift` moves the hips (a bob, a hop,
   *  sitting down); `reach` puts a hand on the body (the phone at the ear, a mug at the mouth). */
  setPose(p: Pose, lift?: [number, number, number], reach?: Reach) {
    this.pose = p;
    if (lift) this.lift = lift;
    if (!this.skeleton) return;
    for (const j of JOINTS) {
      const r = p[j] ?? REST[j];
      if (r) this.bones[j].rotation.set(r[0], r[1], r[2]);
      else this.bones[j].rotation.set(0, 0, 0);
    }
    const h = this.restHips;
    this.bones.hips.position.set(h[0] + this.lift[0], h[1] + this.lift[1], h[2] + this.lift[2]);
    const b = this.shown?.baked;
    if (!reach || !b) return;
    for (const side of ["L", "R"] as const) {
      const r = reach[side];
      if (!r || r.w <= 0) continue;
      const sx = side === "L" ? -1 : 1; // anchors are for the right hand: the left mirrors x
      const a = b.anchors[r.at];
      const sh = b.rest[`shoulder${side}`];
      // into the spine's space, from the shoulder joint
      target.set(
        a[0] * sx + (r.dx ?? 0) * sx - b.rest.hips[0] - b.rest.spine[0] - sh[0],
        a[1] - b.rest.hips[1] - b.rest.spine[1] - sh[1],
        a[2] + (r.dz ?? 0) - b.rest.hips[2] - b.rest.spine[2] - sh[2],
      );
      pole.set(side === "L" ? 0.6 : -0.6, -1, -0.45);
      solveArm(target, b.arm[0], b.arm[1], pole, ik);
      const w = Math.min(1, r.w);
      const shoulder = this.bones[`shoulder${side}`];
      shoulder.quaternion.slerp(ik.shoulder, w);
      const el = this.bones[`elbow${side}`];
      el.rotation.set(el.rotation.x + (ik.elbow - el.rotation.x) * w, el.rotation.y * (1 - w), el.rotation.z * (1 - w));
    }
  }

  /** Put a hand on a point in the world (a steering wheel's rim), after `setPose`: two-bone IK
   *  from the posed shoulder, the elbow pointing down and out by `pole` (the spine's space,
   *  the right arm's; the left mirrors x). */
  reachTo(side: "L" | "R", world: Vector3, w = 1, poleR: [number, number, number] = [-0.6, -1, -0.45]) {
    const b = this.shown?.baked;
    if (!b || !this.skeleton || w <= 0) return;
    const spine = this.bones.spine;
    spine.updateWorldMatrix(true, false);
    target.copy(world);
    spine.worldToLocal(target);
    const sh = b.rest[`shoulder${side}`];
    target.x -= sh[0];
    target.y -= sh[1];
    target.z -= sh[2];
    pole.set(side === "L" ? -poleR[0] : poleR[0], poleR[1], poleR[2]);
    solveArm(target, b.arm[0], b.arm[1], pole, ik);
    const k = Math.min(1, w);
    const shoulder = this.bones[`shoulder${side}`];
    shoulder.quaternion.slerp(ik.shoulder, k);
    const el = this.bones[`elbow${side}`];
    el.rotation.set(el.rotation.x + (ik.elbow - el.rotation.x) * k, el.rotation.y * (1 - k), el.rotation.z * (1 - k));
  }

  /** The face: eyes closed (0..1) and mouth open (0..1). */
  setFace(blink: number, talk: number) {
    this.face = [blink, talk];
    const m = this.bodyMesh?.morphTargetInfluences;
    if (m) {
      m[0] = blink;
      m[1] = talk;
    }
  }

  /** Where a joint is in the model's own space right now (a hand for a held thing, the head for a tag). */
  jointPosition(j: JointName, out = new Vector3()): Vector3 {
    this.root.updateMatrixWorld(true);
    const b = this.bones[j];
    if (!b) return out.set(0, this.height * 0.5, 0);
    b.getWorldPosition(out);
    return this.root.worldToLocal(out);
  }

  /** Where the eyes are right now, in the model's own space (first person looks from here). */
  eyePosition(out = new Vector3()): Vector3 {
    const e = this.shown?.baked.eye;
    const head = this.bones.head;
    if (!e || !head) return out.set(0, this.height * 0.92, 0.08);
    this.root.updateMatrixWorld(true);
    head.localToWorld(out.set(e[0], e[1], e[2]));
    return this.root.worldToLocal(out);
  }

  /** The right ear in the head bone's space (an earbud hangs there), or null before it's shown. */
  earPoint(): [number, number, number] | null {
    return this.shown?.baked.ear ?? null;
  }

  /** The bone to hang things on (a mug in the right hand, a phone). */
  bone(j: JointName): Bone | null {
    return this.skeleton ? this.bones[j] : null;
  }

  dispose() {
    if (this.held) this.f.release(this.held.a, this.held.lod);
    this.held = null;
    this.skeleton?.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
