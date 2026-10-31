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
import { armsOf, type Baked, bake, THIGH_BONES } from "./bake";
import { buildPerson } from "./build";
import { solveArm } from "./ik";
import { inkMaterial } from "./ink";
import type { Anchor, HangSpec, SpringSpec } from "./kit";
import type { Lod } from "./params";
import { JOINTS, type JointName, PARENT, type Pose, REST, type RestPose, type SpringName } from "./rig";

// People in the world: a factory that builds and caches each look at each
// level of detail (shared by everyone wearing it, built a few per frame so
// nothing stutters), and the person — one skinned mesh for the body, one for
// its line, both on one skeleton.

let body: MeshBasicMaterial | null = null;
/** The one material every person's body is drawn with: flat, its colours in the vertices. */
export function bodyMaterial(): MeshBasicMaterial {
  if (!body) {
    body = new MeshBasicMaterial({ vertexColors: true });
    legShade(body);
    celShade(body);
  }
  return body;
}

// (2026-10-30) The far leg a shade darker: side on, two legs in one flat colour read as one short
// shape. Each leg's vertex knows its leg and its hip joint at rest (bake.ts `legSide`, `legHip`); the
// vertex shader finds both hips where the thighs' bones have them now (the other's the mirror of its
// own) and darkens the leg whose hip is the farther from the camera — side on, all of it; face on,
// none. (Worked out per vertex: a material's uniforms aren't sent again between people sharing it.)
/** Darken the far leg on `m` (chained after what's patched on it already: the world's light). */
export function legShade(m: Material): void {
  const was = m.onBeforeCompile;
  const key = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    was.call(m, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float legSide;\nattribute vec3 legHip;\nvarying float vFarLeg;",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
vFarLeg = 0.0;
#ifdef USE_SKINNING
if (legSide != 0.0) {
  float own = legSide > 0.0 ? ${THIGH_BONES[0]}.0 : ${THIGH_BONES[1]}.0;
  float other = legSide > 0.0 ? ${THIGH_BONES[1]}.0 : ${THIGH_BONES[0]}.0;
  vec4 a = viewMatrix * modelMatrix * (bindMatrixInverse * (getBoneMatrix(own) * (bindMatrix * vec4(legHip, 1.0))));
  vec4 b = viewMatrix * modelMatrix * (bindMatrixInverse * (getBoneMatrix(other) * (bindMatrix * vec4(-legHip.x, legHip.y, legHip.z, 1.0))));
  vFarLeg = clamp((b.z - a.z) / 0.1, 0.0, 1.0) * abs(legSide);
}
#endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFarLeg;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - 0.2 * vFarLeg;");
  };
  m.customProgramCacheKey = () => `${key.call(m)}|legs`;
}

// (2026-10-31, plan 59) Cel shading: the side of each form turned from a light over the viewer's left
// shoulder takes a cool shadow tone, cut sharp with a soft edge — volume without textures, like the
// world's facets; the lit side's edges catch a warm rim, and the figure darkens a little toward the
// feet, standing in its own shade. In view space, so the light keeps to the camera.
/** Two-tone shade the body on `m` (chained after what's patched on it already). */
export function celShade(m: Material, k = 1): void {
  const was = m.onBeforeCompile;
  const key = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    was.call(m, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCelN;\nvarying float vCelY;\nattribute float pat;\nattribute vec3 col2;\nvarying float vPat;\nvarying vec3 vCol2;\nvarying vec3 vPP;\nvarying vec3 vPN;",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
vCelY = position.y;
vPat = pat;
vCol2 = col2;
vPP = position;
vPN = normal;
#ifdef USE_SKINNING
vCelN = normalize(transformedNormal);
#else
vCelN = vec3(0.0, 0.0, 1.0);
#endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCelN;\nvarying float vCelY;\nvarying float vPat;\nvarying vec3 vCol2;\nvarying vec3 vPP;\nvarying vec3 vPN;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
// (plan 60) a pattern over the colour, in the garment's own space at rest (it moves with it): across
// a face turned to the front or back by x, a side by z; up by y — plaid two sets of bands with a fine
// line between, stripes one, check two halves, dots a grid, tweed a herringbone
if (vPat > 0.5) {
  float wx = smoothstep(0.35, 0.65, abs(vPN.z) / (abs(vPN.x) + abs(vPN.z) + 1e-4));
  float u = mix(vPP.z, vPP.x, wx);
  float v = vPP.y;
  if (vPat < 1.5) {
    float P = 0.085;
    float bx = 1.0 - smoothstep(0.34, 0.37, fract(u / P));
    float by = 1.0 - smoothstep(0.34, 0.37, fract(v / P));
    vec3 c = mix(diffuseColor.rgb, vCol2, 0.5 * bx + 0.5 * by);
    float lx = 1.0 - smoothstep(0.012, 0.024, abs(fract(u / P) - 0.68));
    float ly = 1.0 - smoothstep(0.012, 0.024, abs(fract(v / P) - 0.68));
    diffuseColor.rgb = mix(c, vCol2 * 0.55, 0.7 * max(lx, ly));
  } else if (vPat < 2.5) {
    float by = 1.0 - smoothstep(0.48, 0.52, fract(v / 0.055));
    diffuseColor.rgb = mix(diffuseColor.rgb, vCol2, by);
  } else if (vPat < 3.5) {
    // check (gingham): bands both ways, half the second colour each, full where they cross
    float bx = 1.0 - smoothstep(0.48, 0.52, fract(u / 0.05));
    float by = 1.0 - smoothstep(0.48, 0.52, fract(v / 0.05));
    diffuseColor.rgb = mix(diffuseColor.rgb, vCol2, 0.5 * bx + 0.5 * by);
  } else if (vPat > 4.5) {
    // tweed: a herringbone — fine diagonal ribs, their slant turned every band — over a fleck
    // (coarse enough not to shimmer at a distance, soft enough to read as cloth)
    float band = mod(floor(u / 0.05), 2.0) * 2.0 - 1.0;
    float rib = 1.0 - smoothstep(0.25, 0.5, abs(fract((v + band * u) / 0.022) - 0.5));
    float fleck = step(0.95, fract(sin(dot(floor(vec2(u, v) / 0.012), vec2(12.99, 78.23))) * 43758.5));
    diffuseColor.rgb = mix(diffuseColor.rgb, vCol2, 0.22 * rib + 0.2 * fleck);
  } else {
    // dots in a grid, every other row shifted half a step
    vec2 g = vec2(u, v) / 0.045;
    g.x += 0.5 * mod(floor(g.y), 2.0);
    float d = length(fract(g) - 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, vCol2, 1.0 - smoothstep(0.2, 0.24, d));
  }
}
{
  vec3 n = normalize(vCelN);
  float l = dot(n, normalize(vec3(-0.6, 0.5, 0.62)));
  float dark = 1.0 - smoothstep(-0.2, 0.12, l);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.6, 0.64, 0.86), dark * ${k.toFixed(3)});
  float rim = smoothstep(0.55, 0.85, 1.0 - abs(n.z)) * smoothstep(0.05, 0.4, -n.x) * (1.0 - dark);
  diffuseColor.rgb += rim * ${(0.16 * k).toFixed(3)} * vec3(1.0, 0.9, 0.75);
  diffuseColor.rgb *= mix(1.0, mix(0.8, 1.0, smoothstep(0.0, 0.6, vCelY)), ${k.toFixed(3)});
}`,
      );
  };
  m.customProgramCacheKey = () => `${key.call(m)}|cel${k}`;
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

// ── the springs (plan 58 phase 2d): hair, a skirt, a scarf's ends, a pack — each a damped spring off
// its parent, its tip chasing where it'd hang (partly as its parent holds it, partly straight down),
// held to its length, kept out of the head and the chest, the bone turned after it (no further than
// its limit). Stepped after the pose; never in it.
interface SpringRun {
  spec: SpringSpec;
  p: Vector3;
  v: Vector3;
  on: boolean;
}
// (how much of each hangs by gravity rather than its parent's turn — a pack's strapped to the back:
// hardly any, or it swung off it like a board leant forward)
const HANG: Record<SpringName, number> = { hair: 0.55, skirt: 0.35, scarf: 0.65, pack: 0.04 };
// (scratch, reused: nothing's made in the step)
const SP = {
  a: new Vector3(),
  b: new Vector3(),
  c: new Vector3(),
  t: new Vector3(),
  d: new Vector3(),
  o: new Vector3(),
  q: new Quaternion(),
  pq: new Quaternion(),
  none: new Quaternion(),
};
const DOWN = new Vector3(0, -1, 0);
const target = new Vector3();
const pole = new Vector3();
const handAt = new Vector3();

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
  /** the hips' place at rest, in the root (plan 58 5d: a ragdoll's hips read back as a lift off it) */
  restHips: [number, number, number] = [0, 0, 0];
  private face: [number, number] = [0, 0];
  private eyes: [number, number] = [0, 0];
  private held: { a: AvatarLayers; lod: Lod } | null = null;
  private springs: SpringRun[] = [];

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
  /** How far the top of the head (its hair or hat) is above the head joint, standing. */
  get crown(): number {
    const b = this.shown?.baked;
    if (!b) return 0.3;
    const r = b.rest;
    return b.height - (r.hips[1] + r.spine[1] + r.chest[1] + r.neck[1] + r.head[1]);
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
    this.springs = baked.springs.map((spec) => ({ spec, p: new Vector3(), v: new Vector3(), on: false }));
    this.setFace(this.face[0], this.face[1]);
    this.setEyes(this.eyes[0], this.eyes[1]);
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
      // into the chest's space, from the shoulder joint
      const R = b.rest;
      target.set(
        a[0] * sx + (r.dx ?? 0) * sx - R.hips[0] - R.spine[0] - R.chest[0] - sh[0],
        a[1] - R.hips[1] - R.spine[1] - R.chest[1] - sh[1],
        a[2] + (r.dz ?? 0) - R.hips[2] - R.spine[2] - R.chest[2] - sh[2],
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
   *  from the posed shoulder, the elbow pointing down and out by `pole` (the chest's space,
   *  the right arm's; the left mirrors x). */
  reachTo(side: "L" | "R", world: Vector3, w = 1, poleR: [number, number, number] = [-0.6, -1, -0.45]) {
    const b = this.shown?.baked;
    if (!b || !this.skeleton || w <= 0) return;
    const chest = this.bones.chest;
    chest.updateWorldMatrix(true, false);
    target.copy(world);
    chest.worldToLocal(target);
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

  /** (plan 58 5b) Hands put where a move has them — on a top, an edge, the ground — given in the
   *  body's own space (x its left, y up from its feet, z ahead): `Locomotion.handsOut`. After
   *  `setPose` and the root placed. */
  handsTo(
    hands: { [S in "L" | "R"]?: { at: [number, number, number]; w: number; pole?: [number, number, number] } } | null,
  ) {
    if (!hands) return;
    this.root.updateMatrixWorld(true);
    for (const S of ["L", "R"] as const) {
      const h = hands[S];
      if (!h || h.w <= 0) continue;
      this.reachTo(S, this.root.localToWorld(handAt.set(h.at[0], h.at[1], h.at[2])), h.w, h.pole);
    }
  }

  /** What's worn that swings on Jolt near (docs/plan/61), once it's shown. */
  worn(): readonly HangSpec[] | null {
    const b = this.shown?.baked;
    return b && this.skeleton ? b.hangs : null;
  }

  /** Swing the springs (after `setPose`, once a frame): `rest` holds them as they hang (reduced
   *  motion, far off) and starts them there next time; those in `skip` left as they are (swung on
   *  Jolt, docs/plan/61). */
  step(dt: number, rest = false, skip?: ReadonlySet<JointName>) {
    const b = this.shown?.baked;
    if (!b || !this.skeleton || !this.springs.length) return;
    this.root.updateMatrixWorld(true);
    const L = SP.a;
    for (const s of this.springs) {
      if (skip?.has(s.spec.joint)) continue;
      const bone = this.bones[s.spec.joint];
      const parent = bone.parent;
      if (!parent) continue;
      bone.quaternion.identity();
      bone.updateMatrixWorld(true);
      const pivot = SP.b.setFromMatrixPosition(bone.matrixWorld);
      const tip = L.set(...s.spec.tip);
      const len = tip.length();
      tip.applyMatrix4(bone.matrixWorld);
      // where it'd hang: as its parent holds it, drawn down by its weight
      const target = SP.t
        .copy(tip)
        .sub(pivot)
        .normalize()
        .lerp(DOWN, HANG[s.spec.joint])
        .normalize()
        .multiplyScalar(len)
        .add(pivot);
      if (rest || !s.on || s.p.distanceTo(target) > 1 || dt <= 0) {
        s.on = !rest;
        s.p.copy(target);
        s.v.set(0, 0, 0);
        if (rest || dt <= 0) continue;
      }
      const w = 2 * Math.PI * s.spec.hz;
      const n = Math.max(1, Math.ceil(Math.min(dt, 0.1) * 240));
      const h = Math.min(dt, 0.1) / n;
      for (let i = 0; i < n; i++) {
        const ax = w * w * (target.x - s.p.x) - 2 * s.spec.damp * w * s.v.x;
        const ay = w * w * (target.y - s.p.y) - 2 * s.spec.damp * w * s.v.y;
        const az = w * w * (target.z - s.p.z) - 2 * s.spec.damp * w * s.v.z;
        s.v.x += ax * h;
        s.v.y += ay * h;
        s.v.z += az * h;
        s.p.addScaledVector(s.v, h);
        // its length kept
        const d = SP.d.copy(s.p).sub(pivot).normalize();
        s.p.copy(pivot).addScaledVector(d, len);
        // out of the head and the chest (its velocity into them taken off)
        for (const c of b.collide) {
          const cb = this.bones[c.joint];
          const centre = SP.c.set(...c.at).applyMatrix4(cb.matrixWorld);
          const off = SP.o.copy(s.p).sub(centre);
          const dist = off.length();
          if (dist >= c.r || dist < 1e-6) continue;
          off.divideScalar(dist);
          s.p.copy(centre).addScaledVector(off, c.r);
          const into = s.v.dot(off);
          if (into < 0) s.v.addScaledVector(off, -into);
        }
      }
      // the bone turned from how it hangs at rest to where its tip is, no further than its limit
      const from = tip.sub(pivot).normalize();
      const to = SP.d.copy(s.p).sub(pivot).normalize();
      SP.q.setFromUnitVectors(from, to);
      const angle = 2 * Math.acos(Math.min(1, Math.abs(SP.q.w)));
      if (angle > s.spec.limit) SP.q.slerp(SP.none, 1 - s.spec.limit / angle);
      // (into the parent's space: the bone's rest turn is none, so its world turn is the parent's)
      parent.getWorldQuaternion(SP.pq);
      bone.quaternion.copy(SP.pq).invert().multiply(SP.q).multiply(SP.pq);
      bone.updateMatrixWorld(true);
    }
  }

  /** The face: eyes closed (0..1) and mouth open (0..1). */
  setFace(blink: number, talk: number) {
    this.face = [blink, talk];
    const m = this.bodyMesh?.morphTargetInfluences;
    if (m) {
      m[0] = blink;
      m[1] = talk;
      // (an eye's shut line, where there is one: only as the lids meet)
      if (m.length > 4) m[4] = Math.min(1, Math.max(0, (blink - 0.65) / 0.3));
    }
  }
  /** Where the eyes look (plan 58 G.D): x + to the person's left, y + up; −1..1 each. */
  setEyes(x: number, y: number) {
    this.eyes = [x, y];
    const m = this.bodyMesh?.morphTargetInfluences;
    if (m && m.length > 3) {
      m[2] = x;
      m[3] = y;
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
