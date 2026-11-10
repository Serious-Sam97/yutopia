// Plan 73, phase 4.3 — the life look's people in the world: what PersonModel shows in the life look
// (look/life-people.ts's body as an avatar), on PersonModel's own bones.
//
//   setLifeHost(host)   the view, in the life look: its renderer (for the files' textures) and how the
//                       world's people are lit (the room's light after a material's own piece). Every
//                       CharFactory made after it draws life people; none before it (the dev benches)
//   lifeBaseNow(g)      the man's or the woman's file, or null while it (or this file's half in
//                       look/, loaded on first use: the loaders stay out of the chars chunk) loads
//   LifeLook            one person: their body's rest joints (the arms turned straight down: see
//                       below), what reaches and seats need of it (as chars/bake.ts Baked gives
//                       today's), their parts bound to the skeleton, the materials by the view's state
//
// The arms: the file's hang out from straight down (build_person.py ARM_OUT: all the way down pushed
// the shoulders up into pads), their forearms at an angle of their own. Our rig has an arm at rest hang
// straight down — every writer of a shoulder assumes it (the clips, the reaches' IK, the ragdoll,
// Flowmotion's grips). So the bones are made with each upper arm and forearm turned straight down, and
// the parts bound to them turned back as the file has them: a shoulder at rest then holds its arm
// straight down, and nobody else needs to know.
import { type AvatarLayers, DEFAULT_AVATAR } from "@yutopia/shared";
import {
  type Bone,
  type BufferGeometry,
  Color,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  type Skeleton,
  SkinnedMesh,
  Sphere,
  Vector3,
  type WebGLRenderer,
} from "three";
import type { LifeBase, LifeBody, LifeGender, LifePart } from "../look/life-people";
import type { Piece, Shader } from "../look/yulit";
import { buildPerson } from "./build";
import type { Anchor, HangSpec, Kit, SpringSpec } from "./kit";
import { JOINTS, type JointName, PARENT, type RestPose } from "./rig";

type LifeMod = typeof import("../look/life-people");

export interface LifeHost {
  renderer: WebGLRenderer;
  /** light `m` as the world's people are: `base` first (the material's own part), then the room's */
  lit(m: Material, base: Piece): void;
}

let host: LifeHost | null = null;
let mod: LifeMod | null = null;
let modLoading: Promise<void> | null = null;

/** The life look's people from here on (the view, in the life look), or none (null). */
export function setLifeHost(h: LifeHost | null): void {
  host = h;
}
export const lifeHost = (): LifeHost | null => host;

/** The life half of the people, once loaded (null meanwhile: asked for). */
export function lifeMod(): LifeMod | null {
  if (!mod && !modLoading)
    modLoading = import("../look/life-people").then(
      (m) => {
        mod = m;
      },
      () => {
        modLoading = null;
      },
    );
  return mod;
}

/** A gender's file through `h`, once loaded (null meanwhile: asked for). */
export function lifeBaseNow(g: LifeGender, h: LifeHost): LifeBase | null {
  return lifeMod()?.lifeBaseNow(g, h.renderer) ?? null;
}

/** A gender's far person (plan 73 4.5), once loaded (null meanwhile: asked for). */
export function lifeFarNow(g: LifeGender, h: LifeHost): LifePart | null {
  return lifeMod()?.lifeFarNow(g, h.renderer) ?? null;
}

// (whether a part has anything weighted to a joint — a swing's: once a geometry)
const hanging = new WeakMap<BufferGeometry, Map<number, boolean>>();
function hangsOn(g: BufferGeometry, joint: number): boolean {
  let m = hanging.get(g);
  if (!m) hanging.set(g, (m = new Map()));
  const had = m.get(joint);
  if (had !== undefined) return had;
  const si = g.getAttribute("skinIndex");
  const sw = g.getAttribute("skinWeight");
  let yes = false;
  if (si && sw && joint >= 0)
    for (let i = 0; i < si.count && !yes; i++)
      for (let k = 0; k < 4; k++)
        if (si.getComponent(i, k) === joint && sw.getComponent(i, k) > 0.2) {
          yes = true;
          break;
        }
  m.set(joint, yes);
  return yes;
}

const trisOf = (g: BufferGeometry) => (g.getIndex()?.count ?? g.getAttribute("position").count) / 3;

/** A seed from a name (who a neutral avatar is drawn as: the same wherever they're drawn). */
export function nameSeed(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ── what reaches need of a body: where the hand goes to the ear, the mouth, the chest (wrist targets),
// from today's person of the same gender and build, scaled to this one's height off the joint they
// hang from (the head's, the chest's) — phase 4.6 checks them on the bench ─────────────────────────

interface Ref {
  height: number;
  anchors: Record<Anchor, [number, number, number]>;
  head: Vector3;
  chest: Vector3;
  /** the eyes and the right ear, at rest (model space) */
  eyes: Vector3;
  ear: Vector3;
}
const refs = new Map<string, Ref>();

function placeOf(rest: RestPose, j: JointName): Vector3 {
  const v = new Vector3();
  for (let at: JointName | null = j; at; at = PARENT[at]) v.add(new Vector3(...rest[at]));
  return v;
}

function refOf(gender: LifeGender, build: string): Ref {
  const key = `${gender}|${build}`;
  let r = refs.get(key);
  if (!r) {
    const k: Kit = buildPerson(
      {
        ...DEFAULT_AVATAR,
        gender: gender === "man" ? "masculine" : "feminine",
        body: build as AvatarLayers["body"],
      },
      2,
    );
    r = {
      height: k.p.height,
      anchors: k.anchors,
      head: placeOf(k.rest, "head"),
      chest: placeOf(k.rest, "chest"),
      eyes: placeOf(k.rest, "head").add(new Vector3(...k.eye)),
      ear: placeOf(k.rest, "head").add(new Vector3(...k.ear)),
    };
    refs.set(key, r);
  }
  return r;
}

// ── the person's own part of each material: the light's tint on them out on the land, and wet under
// the water's line wading (as Person3D.setTint's copies give today's people) ─────────────────────────

interface OwnU {
  lifeTint: { value: Color };
  lifeWater: { value: number };
  /** their eyes' colour (the eyes' piece reads it: look/life-people.ts eyePiece) */
  lifeIris: { value: Color };
}
function ownPiece(u: OwnU, then: Piece | null): Piece {
  return {
    key: `life-own${then ? `+${then.key}` : ""}`,
    patch(sh: Shader, r) {
      sh.uniforms.lifeTint = u.lifeTint;
      sh.uniforms.lifeWater = u.lifeWater;
      sh.uniforms.lifeIris = u.lifeIris;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vLifeY;")
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvLifeY = (modelMatrix * vec4(transformed, 1.0)).y;",
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying float vLifeY;\nuniform vec3 lifeTint;\nuniform float lifeWater;",
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
diffuseColor.rgb *= lifeTint;
if (vLifeY < lifeWater) diffuseColor.rgb *= 0.66;
else if (vLifeY < lifeWater + 0.02) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8), 0.35);`,
        );
      // (the outfit's colours by its mask: after, on the same line — it takes the colour include's place)
      then?.patch(sh, r);
    },
  };
}

// one colour over all of it (the shadowed, the burning): the hair's cards cut by their alpha only
function cutHair(m: MeshBasicMaterial): void {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <map_fragment>",
      "#ifdef USE_MAP\ndiffuseColor.a *= texture2D( map, vMapUv ).a;\n#endif",
    );
  };
  m.customProgramCacheKey = () => "life-cut";
}

// Faded (away), the person's parts are see-through one over another — the skin under the shirt showed
// through it. So the solid parts are drawn to the depth first, a hair behind: then only each pixel's
// nearest surface is coloured. (With the see-through things, before them: among the solid ones, it hid
// what's behind the person — the sofa they sat on.)
const DEPTH = new MeshBasicMaterial({
  colorWrite: false,
  transparent: true,
  depthWrite: true,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});
const SOLID = new Set(["body", "clothes", "shoes", "far"]);
// (and the made garments, phase 5: the hair's and the beards' are cut out, not solid)
const solid = (name: string) => SOLID.has(name) || (name.startsWith("wear-") && !/^wear-(hair|beard)-/.test(name));

/** How the view draws them: their own materials, those faded (away), or one material over all. */
export type LifeState = "own" | "away" | Material;

const AWAY = 0.55;

/** One person in the life look (PersonModel's, while the look is life). */
export class LifeLook {
  readonly body: LifeBody;
  readonly gender: LifeGender;
  /** each joint's place from its parent at rest, the arms straight down (PersonModel's skeleton) */
  readonly rest: RestPose;
  /** the eyes' bones, from the head */
  readonly eyesRest: [Vector3, Vector3];
  /** the shoulders as the file has them, for binding */
  readonly bindTurn: Partial<Record<JointName, Quaternion>>;
  readonly height: number;
  readonly hipY: number;
  /** the ankle joints over the soles, standing (the rig's legs fitted to: chars/model.ts fitLeg) */
  readonly ankleY: number;
  readonly thighR = 0.085;
  readonly anchors: Record<Anchor, [number, number, number]>;
  readonly arm: [number, number];
  readonly eye: [number, number, number];
  readonly ear: [number, number, number];
  readonly springs: SpringSpec[] = [];
  readonly collide: { joint: JointName; at: [number, number, number]; r: number }[] = [];
  readonly hangs: HangSpec[] = [];
  private nearTris = 0;
  readonly meshes: SkinnedMesh[] = [];
  private parts: { part: LifePart; geometry: BufferGeometry; own: Material; piece: Piece }[] = [];
  private mine: Material[] = [];
  private away: Material[] = [];
  private cut: MeshBasicMaterial | null = null;
  private depth = new Map<number, SkinnedMesh>();
  /** (plan 74 phase 1) hair's and lashes' soft edge: a second, blended draw of each */
  private edges = new Map<number, SkinnedMesh>();
  /** (plan 73 4.5) drawn as the far person: one coarse mesh (when it's loaded) */
  private farOn = false;
  private farAt = -1;
  private bound: { skeleton: Skeleton; root: Object3D } | null = null;
  private M: LifeMod;
  private state: LifeState = "own";
  private u: OwnU;

  constructor(
    M: LifeMod,
    readonly base: LifeBase,
    readonly avatar: AvatarLayers,
    readonly part: "all" | "arms",
    private h: LifeHost,
    /** the seed from their name (their eyes' colour) */
    seed = 0,
    /** (phase 5.4) what they wear: their wardrobe's garments, made — none, the file's own outfit */
    worn: import("../look/life-people").LifeWorn | null = null,
  ) {
    this.u = {
      lifeTint: { value: new Color(1, 1, 1) },
      lifeWater: { value: -1e6 },
      lifeIris: { value: M.irisOf(seed) },
    };
    this.M = M;
    this.gender = base.gender;
    this.eyeTurn = [M.EYE_YAW, M.EYE_PITCH];
    const b = M.lifeBody(base, avatar, worn);
    this.body = b;
    // the arms straight down, as the rig's hang: each upper arm turned down about its shoulder, then each
    // forearm about its elbow (measured, each arm: the file's don't hang at one angle — a fixed 9° left
    // them 7° in, and a phone held to the ear stopped 5 cm short of it. 4.6)
    const DOWN = new Vector3(0, -1, 0);
    const turns: Partial<Record<JointName, Quaternion>> = {};
    const at = {} as Record<JointName, Vector3>;
    for (const j of JOINTS) at[j] = b.at[j].clone();
    const under = (j: JointName, top: JointName) => {
      for (let p = PARENT[j]; p; p = PARENT[p]) if (p === top) return true;
      return false;
    };
    for (const [top, next] of [
      ["shoulderL", "elbowL"],
      ["elbowL", "wristL"],
      ["shoulderR", "elbowR"],
      ["elbowR", "wristR"],
    ] as [JointName, JointName][]) {
      const q = new Quaternion().setFromUnitVectors(at[next].clone().sub(at[top]).normalize(), DOWN);
      turns[top] = q;
      const o = at[top];
      for (const j of JOINTS) if (under(j, top)) at[j].sub(o).applyQuaternion(q).add(o);
    }
    const rest = {} as RestPose;
    for (const j of JOINTS) {
      const p = PARENT[j];
      const v = p ? at[j].clone().sub(at[p]) : at[j].clone();
      rest[j] = [v.x, v.y, v.z];
    }
    this.rest = rest;
    // (bound as the file has them: each turn undone, in its own bone's frame — the forearm's after the
    // upper arm's)
    this.bindTurn = {};
    for (const [j, q] of Object.entries(turns)) this.bindTurn[j as JointName] = (q as Quaternion).clone().invert();
    this.eyesRest = [b.rest.eyeL.clone(), b.rest.eyeR.clone()];
    this.height = b.height;
    this.hipY = b.hipY;
    this.ankleY = (b.at.ankleL.y + b.at.ankleR.y) / 2;
    const A = b.at;
    this.arm = [A.elbowL.distanceTo(A.shoulderL), A.wristL.distanceTo(A.elbowL)];
    const eyes = A.eyeL.clone().add(A.eyeR).multiplyScalar(0.5).sub(A.head);
    this.eye = [eyes.x, eyes.y, eyes.z];
    const ref = refOf(base.gender, b.build);
    const s = this.height / ref.height;
    const off = (a: [number, number, number], from: Vector3, to: Vector3): [number, number, number] => [
      to.x + (a[0] - from.x) * s,
      to.y + (a[1] - from.y) * s,
      to.z + (a[2] - from.z) * s,
    ];
    // (off the face's own landmarks: the head joint sits in a different place in a life head — off it,
    // a sip put the hand over the eye and a call held the phone out past the ear. 4.6)
    const ear = M.lifeEar(base);
    const eyesAt = A.eyeL.clone().add(A.eyeR).multiplyScalar(0.5);
    this.anchors = {
      ear: off(ref.anchors.ear, ref.ear, ear),
      mouth: off(ref.anchors.mouth, ref.eyes, eyesAt),
      chin: off(ref.anchors.chin, ref.eyes, eyesAt),
      chest: off(ref.anchors.chest, ref.chest, A.chest),
      belly: off(ref.anchors.belly, ref.chest, A.chest),
    };
    this.ear = [ear.x - A.head.x, ear.y - A.head.y, ear.z - A.head.z];
    // each part, its material its own (the base's shared ones copied: the tint and the water line are
    // this person's), lit by the room after its own piece
    const shared = new Set(base.parts.map((p) => p.material));
    for (const p of b.parts) {
      const geometry = part === "arms" ? M.lifeArms(p) : p.geometry;
      if (!geometry) continue;
      let own = p.material;
      if (shared.has(own)) {
        own = own.clone();
        own.userData = { ...p.material.userData };
        this.mine.push(own);
      }
      const piece = ownPiece(this.u, (own.userData.lifePiece as Piece | undefined) ?? null);
      // (no snow's layer or a way's wet on a person: the rain's on them is the view's — mood.wetOf)
      own.userData.wx = "none";
      h.lit(own, piece);
      this.parts.push({ part: p, geometry, own, piece });
      this.nearTris += trisOf(geometry);
    }
    // (5.5) what swings: a skirt's hang, hair below the nape — the file weights them to their joints
    // (build_person.py); kept out of the head and the chest
    const swings = (j: string) => b.parts.some((p) => hangsOn(p.geometry, M.ALL_BONES.indexOf(j as never)));
    if (swings("skirt")) this.springs.push({ joint: "skirt", tip: [0, -0.45, 0], hz: 2.2, damp: 0.5, limit: 0.3 });
    if (swings("hair")) this.springs.push({ joint: "hair", tip: [0, -0.32, -0.1], hz: 1.8, damp: 0.4, limit: 0.55 });
    // (5.7) a bag on the pack's joint (props.py's `-bag` pieces): it swings as they walk
    if (swings("pack")) this.springs.push({ joint: "pack", tip: [0, -0.4, -0.15], hz: 1.6, damp: 0.45, limit: 0.35 });
    if (this.springs.length)
      this.collide.push(
        { joint: "head", at: [0, 0.09, 0.02], r: 0.105 },
        { joint: "chest", at: [0, 0.06, 0.02], r: 0.15 },
      );
  }

  /** The triangles drawn (near: every part; far: the one mesh). */
  get tris(): number {
    return Math.round(this.farOn && this.farAt >= 0 ? trisOf(this.parts[this.farAt].geometry) : this.nearTris);
  }

  /** The parts on `skeleton` (PersonModel's bones, the eyes after the joints), into `root`. */
  bind(skeleton: Skeleton, root: Object3D): void {
    this.bound = { skeleton, root };
    for (let i = 0; i < this.parts.length; i++) this.addMesh(i);
    this.setState(this.state);
  }

  private addMesh(i: number): void {
    const b = this.bound;
    if (!b) return;
    const { part, geometry, own } = this.parts[i];
    const sm = new SkinnedMesh(geometry, own);
    sm.name = `life-${part.name}`;
    sm.castShadow = !/^(eyes|lashes|brows|teeth|tongue)$/.test(part.name);
    sm.receiveShadow = true;
    // (culled by a sphere round the whole figure, generous enough for any pose — as today's)
    sm.frustumCulled = this.part !== "arms";
    sm.boundingSphere = new Sphere(new Vector3(0, this.height * 0.5, 0), this.height * 0.75);
    if (part.name === "brows" || /beard/.test(part.name)) sm.renderOrder = 2;
    sm.updateMorphTargets();
    sm.morphTargetDictionary = { ...part.morphs };
    sm.bindMode = "attached";
    sm.bind(b.skeleton, new Matrix4());
    b.root.add(sm);
    this.meshes[i] = sm;
    if (this.M.hasSoftEdge(part.name)) {
      const m = this.M.softEdgeMaterial(own);
      this.h.lit(m, this.parts[i].piece);
      this.mine.push(m);
      this.edges.set(i, this.M.softEdgeMesh(sm, m));
    }
    for (const k of ["slim", "broad", "coat"] as const) {
      const at = sm.morphTargetDictionary[k];
      if (at !== undefined && sm.morphTargetInfluences) sm.morphTargetInfluences[at] = this.body.morph[k];
    }
  }

  /** Near (every part) or far (the one coarse mesh, once its file's in). Cheap to call every frame. */
  setFar(on: boolean): void {
    if (on && this.farAt < 0 && this.part === "all" && this.bound) {
      const far = lifeFarNow(this.gender, this.h);
      if (far) {
        const own = far.material.clone();
        own.userData = { wx: "none" };
        const piece = ownPiece(this.u, this.M.farPiece(this.avatar, this.gender));
        this.h.lit(own, piece);
        this.mine.push(own);
        this.farAt = this.parts.push({ part: far, geometry: far.geometry, own, piece }) - 1;
        this.addMesh(this.farAt);
      }
    }
    const want = on && this.farAt >= 0;
    if (want === this.farOn) return;
    this.farOn = want;
    this.setState(this.state);
  }

  morph(k: string, v: number): void {
    for (const m of this.meshes) {
      const i = m.morphTargetDictionary?.[k];
      if (i !== undefined && m.morphTargetInfluences) m.morphTargetInfluences[i] = v;
    }
  }

  setFace(blink: number, talk: number, smile = 0): void {
    this.morph("blink", blink);
    this.morph("talk", talk);
    this.morph("smile", smile);
  }

  /** The light on them out on the land (null: none of their own). */
  setTint(c: Color | null): void {
    if (c) this.u.lifeTint.value.copy(c);
    else this.u.lifeTint.value.setRGB(1, 1, 1);
  }
  /** The water's line (world y) wading; none, far below. */
  setWater(y: number): void {
    this.u.lifeWater.value = y;
  }

  /** Draw them as the view says. */
  setState(s: LifeState): void {
    this.state = s;
    if (!this.meshes.length) return;
    if (s === "away")
      this.parts.forEach(({ own, piece }, i) => {
        if (this.away[i]) return;
        const m = own.clone();
        m.userData = { ...own.userData };
        m.transparent = true;
        m.opacity = own.opacity * AWAY;
        this.h.lit(m, piece);
        this.away[i] = m;
      });
    const over = typeof s === "string" ? null : s;
    if (over && !this.cut) {
      const hair = this.parts.find((p) => p.part.name === "hair")?.own as MeshBasicMaterial | undefined;
      this.cut = new MeshBasicMaterial({ map: hair?.map ?? null, alphaTest: 0.4 });
      cutHair(this.cut);
    }
    if (over && this.cut) {
      // (the hair's cut follows the one material's colour and fade: the burning change it every frame)
      const o = over as MeshBasicMaterial;
      if (o.color) this.cut.color.copy(o.color);
      this.cut.opacity = o.opacity;
      this.cut.transparent = o.transparent;
    }
    // (see-through: away, or the one material over all faded — the burning)
    const faded = s === "away" || (typeof s !== "string" && s.transparent);
    if (faded)
      this.meshes.forEach((sm, i) => {
        if (this.depth.has(i) || !solid(this.parts[i].part.name) || !sm.skeleton) return;
        const d = new SkinnedMesh(sm.geometry, DEPTH);
        d.name = `${sm.name}-depth`;
        d.renderOrder = -1;
        d.frustumCulled = sm.frustumCulled;
        d.boundingSphere = sm.boundingSphere;
        d.morphTargetDictionary = sm.morphTargetDictionary;
        d.morphTargetInfluences = sm.morphTargetInfluences; // (the same array: the face moves both)
        d.bind(sm.skeleton, sm.bindMatrix);
        sm.parent?.add(d);
        this.depth.set(i, d);
      });
    this.meshes.forEach((sm, i) => {
      const { part, own } = this.parts[i];
      const fine = /^(lashes|brows|teeth|tongue)$/.test(part.name);
      // (near: every part but the far one; far: it alone)
      const here = (part.name === "far") === this.farOn;
      sm.visible = here && !(over && fine);
      if (over) sm.material = part.name === "hair" && this.cut ? this.cut : over;
      else sm.material = s === "away" && this.away[i] ? this.away[i] : own;
      const d = this.depth.get(i);
      if (d) d.visible = faded && sm.visible;
      // (the soft edge with their own look only: away, or under the one material, the core alone)
      const e = this.edges.get(i);
      if (e) e.visible = sm.visible && !over && s !== "away";
    });
  }

  /** The eyes' bones (PersonModel's, made with the skeleton). */
  eyeBones: [Bone, Bone] | null = null;
  private eyeTurn: [number, number];

  /** Where the eyes look: x + to the person's left, y + up; −1…1. */
  setEyes(x: number, y: number): void {
    if (!this.eyeBones) return;
    for (const e of this.eyeBones) e.rotation.set(-y * this.eyeTurn[1], x * this.eyeTurn[0], 0);
  }

  /** The top of the head over the head joint, standing. */
  get crown(): number {
    return this.height - this.body.at.head.y;
  }

  dispose(): void {
    for (const sm of [...this.meshes, ...this.depth.values(), ...this.edges.values()]) sm.removeFromParent();
    this.edges.clear();
    this.meshes.length = 0;
    this.depth.clear();
    for (const m of this.mine) m.dispose();
    for (const m of this.away) m?.dispose();
    this.cut?.dispose();
    this.body.dispose();
  }
}
