import type { AvatarLayers } from "@yutopia/shared";
import {
  Bone,
  type Color,
  Euler,
  Group,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from "three";
import { celBands } from "../cel";
import { armsOf, type Baked, bake, THIGH_BONES } from "./bake";
import { buildPerson } from "./build";
import { fingerAt, thumbAt } from "./hands";
import { solveArm } from "./ik";
import { inkMaterial } from "./ink";
import type { Anchor, HangSpec, SpringSpec } from "./kit";
import { HOOK_CURL, type LifeHost, LifeLook, type LifeState, lifeBaseNow, lifeHost, lifeMod } from "./life";
import { ANKLE, BALL, HEEL, HIP_H, SHIN, THIGH } from "./moves";
import type { Lod } from "./params";
import {
  GRIP_SHAPES,
  gripAt,
  type HandFrame,
  type HeldShape,
  heldDistance,
  IN_DRINK,
  PAD_HANDLE,
  PALM_HALF,
} from "./props";

const PHONE_SHAPE = GRIP_SHAPES.phone;
const PAD_SHAPE = GRIP_SHAPES.pad;

import { JOINTS, type JointName, PARENT, type Pose, REST, type RestPose, type SpringName } from "./rig";

// People in the world: a factory that builds and caches each look at each
// level of detail (shared by everyone wearing it, built a few per frame so
// nothing stutters), and the person — one skinned mesh for the body, one for
// its line, both on one skeleton.

let body: MeshBasicMaterial | null = null;
/** (plan 78 phase 2) the ring's and the little finger's curl against the middle's (a real hand's cascade:
 *  each a little more round from the index to the little finger) */
const CASCADE = { ring: 1.07, little: 1.15 };
/** each finger's fan off the middle's line shut by this much of it at FAN_SHUT's curl (rad) and on */
const FAN_CLOSE = 0.8;
const FAN_SHUT = 1.3;
const _q = new Quaternion();
const DEG = Math.PI / 180;
const _p0 = new Vector3();
const _p1 = new Vector3();
const _p2 = new Vector3();
const _p3 = new Vector3();
const _aim = new Vector3();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _qc = new Quaternion();
const _tip = new Vector3();
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** (plan 78 phase 5) how far a finger may press into what it holds (m): skin on a handle */
const SOFT = 0.004;
/** (plan 78 phase 5) the sipping forearm's rise to the hand (rad) */
const SIP_SLANT = 0.75;
/** (plan 78 phase 5) a mug's ring and little finger tucked under its handle (the rig's curl) */
const TUCK_CURL = 1.5;
// (plan 78 phase 5: closeHands' scratch)
const _hm = new Matrix4();
const _hm2 = new Matrix4();
const _hp = new Vector3();
const _hq = new Quaternion();
const _hqi = new Quaternion();
const _hs = new Vector3();
const _hhp = new Vector3();
const _hhq = new Quaternion();
const _hhc = new Vector3();
const _hhd = new Vector3();
const _hl = new Vector3();
const _hv = new Vector3();
const _one = new Vector3(1, 1, 1);
const _f1 = new Quaternion();
const _f2 = new Quaternion();
const _f3 = new Quaternion();
const _g1 = new Quaternion();
const _g2 = new Quaternion();
const _g3 = new Quaternion();
const _a1 = new Vector3();
const _a2 = new Vector3();
const _a3 = new Vector3();
const _a4 = new Vector3();
const _e = new Euler();
const _rm = new Vector3();
// (bothHands' scratch)
const _tq = new Quaternion();
const _tq2 = new Quaternion();
const _tc = new Vector3();
const _tv = new Vector3();
const _tn = new Vector3();
const _tf = new Vector3();
const _tx = new Vector3();
const _ty = new Vector3();
const _tm = new Matrix4();
const _tg = { L: new Vector3(), R: new Vector3() };

const _tt = new Vector3();
const _tl = { L: new Vector3(), R: new Vector3() };
const _hd = new Vector3();
const _hm3 = new Vector3();
const _hi = new Vector3();
const _hu = new Vector3();
/** (handsTo: a hand shape's point, the world's) */
const _shapeAt = new Vector3();
const _meetTo = new Vector3();

/** (plan 78 phase 5) The things held in both hands: where off the chest (the body's own turn: x its left, y
 *  up, z ahead), the face's tilt back toward the eyes (its normal's up and back), each hand's hold — the
 *  palms facing each other, its sides in them: its middle out of the palm toward the other hand, up toward
 *  the thumb (the fingers pass under its back, the thumb over its face), how far along toward the fingers;
 *  its half thickness */
const TWO = {
  phone: { at: [0, -0.19, 0.36], up: [0.93, -0.36], out: 0.033, across: 0.034, along: 0.7, lift: 0.03, half: 0.0075 },
  // (a photo: raised before the eyes on its side, in both hands by its ends, the screen to the face — out at the
  // eyes' height, most of an arm away, as photos of one taken: plan 78 phase 7; under the chin it read as reading)
  photo: { at: [0, 0.28, 0.5], up: [0.15, -0.99], out: 0.058, across: 0.034, along: 0.7, lift: 0, half: 0.0075 },
  pad: { at: [0, -0.26, 0.36], up: [0.92, -0.38], out: 0.05, across: 0.012, along: 0.8, lift: 0, half: 0.015 },
} as const;
const _ra = new Vector3();
const _rb = new Vector3();
const _rc = new Vector3();
const _rz = new Vector3();
const _rd = new Vector3();
const _rn = new Vector3();
const _rk = new Vector3();
const _rj = new Vector3();
const _re = new Vector3();
const _rh = new Vector3();
const _rt = new Vector3();
const _rs = new Vector3();
const _rv = new Vector3();
const _rw = new Vector3();
const _rx = new Vector3();
const _ry = new Vector3();
/** (plan 78 phase 4) the thumb's last bone's length past its joint, and how far off a finger its pad rests
 *  (the two half-thicknesses) */
const THUMB_TIP = 0.026;
const PAD_OFF = 0.017;
const _ax = new Vector3();
/** (plan 78 phase 3) how much of the forearm's twist its middle bone takes (none at the elbow, all at the
 *  wrist: the radius turning round the ulna, the skin twisting along it). Measured at a 69° turn, the
 *  forearm's girth kept along it: 0.55 the evenest (93% at worst; all at the wrist 86% there, 0.85 87%
 *  mid-forearm) */
const FORE_TWIST = 0.55;
/** A turn's twist about a unit axis (rad, signed: its swing-twist split) */
function twistAbout(q: Quaternion, a: Vector3): number {
  return 2 * Math.atan2(q.x * a.x + q.y * a.y + q.z * a.z, q.w);
}

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
${celBands("vCelN", k)}
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
    /** (plan 73 4.3) the life look's people: by default the view's, if it set them up before this
     *  factory was made; the HUD's pictures give their own (their renderer, their light) */
    readonly life: LifeHost | null = lifeHost(),
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
/** (plan 77: `pole`, where the elbow points — the right arm's, the chest's space; the left mirrors x) */
export type Reach = Partial<
  Record<"L" | "R", { at: Anchor; w: number; dx?: number; dz?: number; pole?: [number, number, number] }>
>;

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
// (plan 80: gripTo, wristFor, wristOver)
const _gs = new Vector3();
const _ga = new Vector3();
const _ge = new Vector3();
const _gw = new Vector3();
const _gp = new Quaternion();
const _gpp = new Quaternion();
const _gr = new Quaternion();
const _gl = new Quaternion();
const _gsw = new Quaternion();
const _g0s = new Quaternion();
const _g0e = new Quaternion();
const _g0w = new Quaternion();
const _g1s = new Quaternion();
const _g1e = new Quaternion();
const _wo = new Vector3();
const _wo2 = new Vector3();
const _wo3 = new Vector3();
const _wp = { twist: 0, bend: 0, side: 0 };
const _woq = new Quaternion();
const _wfA = new Vector3();
const _wfB = new Vector3();
const _wfC = new Vector3();
const _wfM = new Matrix4();
const _wfN = new Matrix4();
const _wfS = new Vector3();
const handAt = new Vector3();

// ── (plan 73 4.6) the life look's legs fitted to the rig's ─────────────────────────────────────────
// The rig poses one leg: thigh and shin THIGH and SHIN long, the ankle ANKLE over the sole, the hips HIP_H
// up (moves.ts) — its crouches, steps, seat fits and foot plants are all worked out for it. A life body's
// legs are their own (the man's hips 7.5 cm higher, the woman's thigh shorter than her shin). So each
// life leg is solved to put the ball of its foot where the rig's is, turned as the rig's foot is, the knee
// bending the rig's way: the feet plant, lock and sit where the rig means them to. (The ball, not the
// point under the ankle: the life foot's ball is 3 cm further on — rolled onto it, the foot went into
// the floor and dragged. Flat, the ball's a fixed step from the ankle; pushing off, the pivot itself.)
const LG = {
  hipsInv: new Quaternion(),
  tk: new Quaternion(),
  foot: new Quaternion(),
  q1: new Quaternion(),
  tw: new Quaternion(),
  kq: new Quaternion(),
  t: new Vector3(),
  v: new Vector3(),
  a0: new Vector3(),
  k0: new Vector3(),
  r0: new Vector3(),
  ax: new Vector3(),
  ra: new Vector3(),
  X: new Vector3(1, 0, 0),
};

export function fitLeg(
  hips: Bone,
  thigh: Bone,
  knee: Bone,
  ankle: Bone,
  rest: { knee: [number, number, number]; ankle: [number, number, number]; ball: number },
  hipY: number,
  ankleY: number,
): void {
  const L = LG;
  L.hipsInv.copy(hips.quaternion).invert();
  L.tk.copy(thigh.quaternion).multiply(knee.quaternion);
  L.foot.copy(L.tk).multiply(ankle.quaternion);
  // where the life ankle goes, from the life thigh joint (the hips' space): the rig's ankle — its leg,
  // its thigh joint HIP_H − hipY off ours (straight up, the root's) —, then the life foot's ball under
  // the rig's
  const T = L.t.set(0, -THIGH, 0).applyQuaternion(thigh.quaternion);
  T.add(L.v.set(0, -SHIN, 0).applyQuaternion(L.tk));
  T.add(L.v.set(0, HIP_H - hipY, 0).applyQuaternion(L.hipsInv));
  T.add(L.v.set(0, ankleY - ANKLE, BALL - rest.ball).applyQuaternion(L.foot));
  // the life leg at rest: thigh to knee, knee to ankle, and how bent it stands
  const k0 = L.k0.set(...rest.knee);
  const a0 = L.a0.set(...rest.ankle);
  const a = k0.length();
  const b = a0.length();
  const D = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-3, T.length()));
  // the knee: turned about its own axis (x) till thigh and shin together reach D — exactly, the life
  // leg's knee and ankle a little off one plane: |k0 + Rx(θ)·a0|² = D², i.e. P cos θ + Q sin θ = m
  const m = (D * D - a * a - b * b) / 2 - k0.x * a0.x;
  const P = k0.y * a0.y + k0.z * a0.z;
  const Q = k0.z * a0.y - k0.y * a0.z;
  const phi = Math.atan2(Q, P);
  const th = phi + Math.acos(Math.max(-1, Math.min(1, m / Math.max(1e-9, Math.hypot(P, Q)))));
  L.kq.setFromAxisAngle(L.X, th);
  // the thigh: the ankle swung onto the target, then turned about it so the knee bends the rig's way
  const A = L.r0.copy(a0).applyQuaternion(L.kq).add(k0).normalize();
  const Tn = L.v.copy(T).normalize();
  L.q1.setFromUnitVectors(A, Tn);
  const ours = L.ax.copy(L.X).applyQuaternion(L.q1);
  const theirs = L.ra.copy(L.X).applyQuaternion(thigh.quaternion);
  ours.addScaledVector(Tn, -ours.dot(Tn));
  theirs.addScaledVector(Tn, -theirs.dot(Tn));
  if (ours.lengthSq() > 1e-8 && theirs.lengthSq() > 1e-8) {
    ours.normalize();
    theirs.normalize();
    const ang = Math.atan2(L.r0.copy(ours).cross(theirs).dot(Tn), ours.dot(theirs));
    L.tw.setFromAxisAngle(Tn, ang);
    L.q1.premultiply(L.tw);
  }
  thigh.quaternion.copy(L.q1);
  knee.quaternion.copy(L.kq);
  // the foot turned as the rig's (in the hips' space)
  ankle.quaternion.copy(L.tk.copy(L.q1).multiply(L.kq).invert().multiply(L.foot));
}

/** What reaches, seats and the eyes need of a body: today's bake, or the life look's (chars/life.ts). */
type Fit = Pick<
  Baked,
  "rest" | "anchors" | "arm" | "eye" | "ear" | "springs" | "collide" | "hangs" | "height" | "hipY" | "thighR"
>;

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
  /** (plan 77 phase 6) a life body's knuckles (the middle and tip of the fingers, the index, the thumb) */
  private knuckles: Record<string, Bone> | null = null;
  /** (plan 73 4.3) a seed from their name: who a neutral avatar is drawn as in the life look */
  seed = 0;
  private life: LifeLook | null = null;
  private lifeKey = "";
  private lifeState: LifeState = "own";
  private lifeTint: Color | null = null;
  private lifeWater = -1e6;
  /** (plan 73 4.6) the life look's legs fitted to the rig's (off: a ragdoll's pose, read off the bones
   *  as they lie — already the body's own) */
  fitLegs = true;
  private ownMat: Material;
  private awayMat: Material | null;

  constructor(
    private f: CharFactory,
    public avatar: AvatarLayers,
    public lod: Lod = 1,
    private mats: { body: Material; ink: Material; away?: Material } = { body: bodyMaterial(), ink: inkMaterial() },
    /** "arms": only shoulder to fingertips (my own, seen from my eyes in first person) */
    readonly part: "all" | "arms" = "all",
  ) {
    this.root.name = "person";
    this.ownMat = mats.body;
    this.awayMat = mats.away ?? null;
  }

  /** Draw with other materials (faded while away, lit by the room). In the life look by role: the
   *  first given its own, `away`'s its own faded, any other one material over all of it. */
  setMaterials(body: Material, ink: Material) {
    if (this.f.life) {
      this.lifeState = body === this.ownMat ? "own" : body === this.awayMat ? "away" : body;
      this.life?.setState(this.lifeState);
      return;
    }
    if (this.mats.body === body && this.mats.ink === ink) return;
    this.mats = { body, ink };
    if (this.bodyMesh) this.bodyMesh.material = body;
    if (this.inkMesh) this.inkMesh.material = ink;
  }

  /** (the life look) The light on them out on the land, as a tint (null: none). */
  setTint(c: Color | null) {
    this.lifeTint = c;
    this.life?.setTint(c);
  }
  /** (the life look) Wading: the water's line, world y (null: none). */
  setWater(y: number | null) {
    this.lifeWater = y ?? -1e6;
    this.life?.setWater(this.lifeWater);
  }
  /** (plan 73) drawn as the life look's people */
  get isLife(): boolean {
    return !!this.f.life;
  }

  /** (the life look) Where its soles touch, in the ankle's space: the ball under the toe joint and the heel
   *  the rig's heel lands on (fitLeg): the ankle `ankleY` over them — for the benches, which measure
   *  contacts (a life foot's joints sit well over its sole: its toe joint 4.5 cm). Null in today's. */
  lifeSole(): { ankleY: number; ball: number; heel: number } | null {
    const L = this.life;
    if (!L) return null;
    const ball = (L.rest.toeL[2] + L.rest.toeR[2]) / 2;
    return { ankleY: L.ankleY, ball, heel: ball - BALL - HEEL };
  }

  private get fit(): Fit | null {
    return this.life ?? this.shown?.baked ?? null;
  }

  /** Change look or detail; the old model stays until the new one is ready. */
  set(avatar: AvatarLayers, lod: Lod) {
    this.avatar = avatar;
    this.lod = lod;
  }

  /** Swap in whatever is newly ready. Call every frame (cheap when nothing changed). */
  update(prio = 0): boolean {
    if (this.f.life) return this.updateLife();
    const got = this.f.best(this.avatar, this.lod, prio);
    if (got && got.baked !== this.shown?.baked) this.show(got.baked, got.lod);
    return !!this.shown;
  }

  // the life look: their body once its file's in, made again when their look changes
  private updateLife(): boolean {
    const M = lifeMod();
    const host = this.f.life;
    if (!M || !host) return !!this.life;
    const g = M.lifeGender(this.avatar, this.seed);
    const key = `${g}|${lookKey(this.avatar)}|${this.part}`;
    // (far off — the coarsest level — the far person: one coarse mesh, plan 73 4.5)
    this.life?.setFar(this.lod === 2);
    if (key === this.lifeKey) return !!this.life;
    const base = lifeBaseNow(g, host);
    if (!base) return !!this.life;
    // (phase 5.4) what their wardrobe says, its garments' files in (a file each, loaded once; a file from
    // before phase 5 has none: the file's own outfit)
    const worn = base.wearFiles.length ? M.lifeWornNow(base, this.avatar, host.renderer) : null;
    if (base.wearFiles.length && !worn) return !!this.life;
    const look = new LifeLook(M, base, this.avatar, this.part, host, this.seed, worn);
    this.life?.dispose();
    this.life = look;
    this.lifeKey = key;
    const restKey = JSON.stringify([look.rest, look.eyesRest, look.knuckleRest]);
    if (restKey !== this.restKey) this.makeSkeleton(look.rest, restKey, look);
    look.eyeBones = [this.root.getObjectByName("eyeL") as Bone, this.root.getObjectByName("eyeR") as Bone];
    look.bind(this.skeleton as Skeleton, this.root);
    // (5.5) its springs — a skirt's hang, long hair — swung by step() as today's are
    this.springs = look.springs.map((spec) => ({ spec, p: new Vector3(), v: new Vector3(), on: false }));
    look.setState(this.lifeState);
    look.setTint(this.lifeTint);
    look.setWater(this.lifeWater);
    look.setFar(this.lod === 2);
    this.setFace(this.face[0], this.face[1]);
    this.setEyes(this.eyes[0], this.eyes[1]);
    return true;
  }

  get ready() {
    return !!this.shown || !!this.life;
  }
  get height() {
    return this.fit?.height ?? 1.7;
  }
  /** How far the top of the head (its hair or hat) is above the head joint, standing. */
  get crown(): number {
    if (this.life) return this.life.crown;
    const b = this.shown?.baked;
    if (!b) return 0.3;
    const r = b.rest;
    return b.height - (r.hips[1] + r.spine[1] + r.chest[1] + r.neck[1] + r.head[1]);
  }
  /** (plan 77) Her legs as a seat fits her: the thigh's length (her own — where her knees meet a seat's
   *  front) and the hips' joint over the floor stood, in the rig's frame: the seated poses solve the
   *  rig's legs (sit2, car3) and a life body's are fitted to them after, from HIP_H (fitLeg) — off the
   *  life bones' own height the rig's feet were planned from hips 4–7 cm too high, and the life legs
   *  reached down and out for a floor under the floor. Today's people's are their own bones'. */
  leg(): { thigh: number; hipY: number } {
    const knee = this.skeleton ? this.bones.kneeL.position.length() : THIGH;
    const shin = this.skeleton ? this.bones.ankleL.position.length() : SHIN;
    return { thigh: knee, hipY: this.life ? HIP_H : knee + shin + ANKLE };
  }
  /** How far to lower the person so a seated pose rests on a seat `seatY` high. */
  sitDrop(seatY: number): number {
    const b = this.fit;
    if (!b) return 0;
    return seatY - (b.hipY - b.thighR * 0.92);
  }
  get tris() {
    return this.life?.tris ?? this.shown?.baked.tris ?? 0;
  }
  get shownLod(): Lod | null {
    if (this.life) return 0;
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

  /** The bones from a rest pose (with the life look's: its two eyes under the head, after the joints,
   *  and bound as its file stands — its shoulders turned out, chars/life.ts). */
  private makeSkeleton(rest: RestPose, key: string, life?: LifeLook) {
    this.skeleton?.dispose();
    this.knuckles = null;
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
    const all = JOINTS.map((j) => this.bones[j]);
    if (life) {
      for (const [i, e] of (["eyeL", "eyeR"] as const).entries()) {
        const b = new Bone();
        b.name = e;
        b.position.copy(life.eyesRest[i]);
        this.bones.head.add(b);
        all.push(b);
      }
      // (plan 77 phase 6) the knuckles, after the eyes, in the file's order (life-people.ts ALL_BONES)
      const kn: Record<string, Bone> = {};
      for (const [k, at] of Object.entries(life.knuckleRest)) {
        const b = new Bone();
        b.name = k;
        b.position.copy(at);
        // (life-people.ts knuckleParent: the ring's and the little's base off the wrist)
        const p = k.startsWith("forearm")
          ? `elbow${k.slice(-1)}`
          : k.includes("3")
            ? k.replace("3", "2")
            : k.includes("2")
              ? k.replace("2", "")
              : `wrist${k.slice(-1)}`;
        (kn[p] ?? this.bones[p as JointName]).add(b);
        kn[k] = b;
        all.push(b);
      }
      this.knuckles = kn;
      for (const [j, q] of Object.entries(life.bindTurn)) this.bones[j as JointName].quaternion.copy(q);
    }
    this.bones.hips.updateMatrixWorld(true);
    this.skeleton = new Skeleton(all);
    this.root.add(this.bones.hips);
    this.restKey = key;
    this.setPose(this.pose);
  }

  /** Pose the joints (joints not named go back to rest); `lift` moves the hips (a bob, a hop,
   *  sitting down); `reach` puts a hand on the body (the phone at the ear, a mug at the mouth). */
  setPose(p: Pose, lift?: [number, number, number], reach?: Reach) {
    this.pose = p;
    this.lastReach = reach;
    if (lift) this.lift = lift;
    if (!this.skeleton) return;
    for (const j of JOINTS) {
      const r = p[j] ?? REST[j];
      if (r) this.bones[j].rotation.set(r[0], r[1], r[2]);
      else this.bones[j].rotation.set(0, 0, 0);
    }
    const h = this.restHips;
    this.bones.hips.position.set(h[0] + this.lift[0], h[1] + this.lift[1], h[2] + this.lift[2]);
    // (plan 77 phase 6: a life hand's curl shared down its knuckles. Plan 78: each about its own hinge
    // (phase 1); five fingers, the ring's and the little's curl a little more (the cascade) and each
    // finger's fan closing as it curls (phase 2); and each joint at the hand library's angle for the rig's
    // curl, less the file's own rest bend (phase 4, chars/hands.ts) — a real hand's knuckles, middles and
    // tips, not one bend shared by fixed parts)
    const kn = this.knuckles;
    const life = this.life;
    if (kn && life)
      for (const S of ["L", "R"] as const) {
        const sign = S === "R" ? 1 : -1;
        const H = life.hinge;
        const curl = sign * this.bones[`fingers${S}`].rotation.z;
        // (the pose's own curls, before the knuckles are turned: closeHands' fallback)
        this.rigCurl[S].fingers = curl;
        this.rigCurl[S].index = sign * this.bones[`index${S}`].rotation.z;
        const chain = (j: string, c: number, base: Bone | undefined) => {
          if (!base || !H[`${j}${S}`]) return;
          const a = fingerAt(c);
          const rest = life.restBend[`${j}${S}`] ?? { mcp: 0, pip: 0 };
          const shut = Math.min(1, Math.max(0, c / FAN_SHUT)) * FAN_CLOSE;
          base.quaternion
            .setFromAxisAngle(life.palm[S], -(life.fan[`${j}${S}`] ?? 0) * shut)
            .multiply(_q.setFromAxisAngle(H[`${j}${S}`], a.mcp * DEG - rest.mcp));
          kn[`${j}2${S}`]?.quaternion.setFromAxisAngle(H[`${j}2${S}`], a.pip * DEG - rest.pip);
          kn[`${j}3${S}`]?.quaternion.setFromAxisAngle(H[`${j}3${S}`], a.dip * DEG);
        };
        chain("fingers", curl, this.bones[`fingers${S}`]);
        chain("index", sign * this.bones[`index${S}`].rotation.z, this.bones[`index${S}`]);
        chain("ring", CASCADE.ring * curl, kn[`ring${S}`]);
        chain("little", CASCADE.little * curl, kn[`little${S}`]);
        const tb = this.bones[`thumb${S}`];
        const fold = sign * tb.rotation.y;
        const th = thumbAt(fold);
        kn[`thumb2${S}`]?.quaternion.setFromAxisAngle(H[`thumb2${S}`], th.mcp * DEG);
        kn[`thumb3${S}`]?.quaternion.setFromAxisAngle(H[`thumb3${S}`], th.ip * DEG);
        // (phase 4) the thumb's base aimed, on the life hand, where a real thumb rests once the fingers are
        // posed: relaxed, its pad by the index's side at its middle bone; in a fist, over the outside of the
        // index's and the middle finger's middle bones. (Turned by the rig's angles alone it went 4 cm off
        // the index, or through the palm in a fist.) A grip's thumb is the held thing's (props).
        // (a loose fist's too — a runner's, its thumb on the index's side, as photos of one: plan 78 phase 7)
        const relax = clamp01((fold - 0.4) / 0.3) * clamp01((1.2 - curl) / 0.35);
        // (plan 78 phase 7: from a half-closed hand on — a running one's, a grip's — its thumb over the fingers
        // too: only a full fist's had it, and a looser one's thumb sank into the palm)
        const shut = clamp01((curl - 1.15) / 0.3) * clamp01((fold - 0.55) / 0.25);
        if (relax + shut > 0.01) {
          this.bones[`wrist${S}`].updateWorldMatrix(true, true);
          const at = (b: Bone | undefined, v: Vector3) => (b ? b.getWorldPosition(v) : v.set(0, 0, 0));
          const i2 = at(kn[`index2${S}`], _p0);
          const i3 = at(kn[`index3${S}`], _p1);
          const target = _aim.copy(i2).add(i3).multiplyScalar(0.5);
          if (relax > 0) {
            // (off the index's side, toward the thumb: across the knuckles, from the middle's to the index's)
            const side = at(this.bones[`index${S}`], _p2)
              .sub(at(this.bones[`fingers${S}`], _p3))
              .normalize();
            target.addScaledVector(side, PAD_OFF * relax);
          }
          if (shut > 0) {
            // (between the index's and the middle's middle bones, out from the fist's middle)
            const m2 = at(kn[`fingers2${S}`], _p2);
            const m3 = at(kn[`fingers3${S}`], _p3);
            const over = m2.add(m3).multiplyScalar(0.5).add(target).multiplyScalar(0.5);
            const mid = at(this.bones[`wrist${S}`], _p3).lerp(at(this.bones[`fingers${S}`], _p1), 0.75);
            const out = _p0.copy(over).sub(mid).normalize();
            // (a little further off than a resting pad's: the skin's thicker over a fist's knuckles — at
            // PAD_OFF the thumb's tip pierced the index it lay on, a sliver from above)
            const fistAt = over.addScaledVector(out, PAD_OFF + 0.006);
            target.lerp(fistAt, shut / (relax + shut));
          }
          const base = at(tb, _p1);
          const t2 = at(kn[`thumb2${S}`], _p2);
          const t3 = at(kn[`thumb3${S}`], _p3);
          // (the pad: half way along the last bone)
          const tip = _tip
            .copy(t3)
            .sub(t2)
            .normalize()
            .multiplyScalar(THUMB_TIP * 0.5)
            .add(t3);
          const turn = _qa.setFromUnitVectors(tip.sub(base).normalize(), target.sub(base).normalize());
          _qb.identity().slerp(turn, Math.min(1, relax + shut));
          // (the world turn into the base's own: its parent's frame round it)
          const pw = (tb.parent as Bone).getWorldQuaternion(_qa);
          tb.quaternion.premultiply(_qb.premultiply(_qc.copy(pw).invert()).multiply(pw));
        }
      }
    const L = this.life;
    if (L && this.fitLegs)
      for (const S of ["L", "R"] as const)
        fitLeg(
          this.bones.hips,
          this.bones[`thigh${S}`],
          this.bones[`knee${S}`],
          this.bones[`ankle${S}`],
          { knee: L.rest[`knee${S}`], ankle: L.rest[`ankle${S}`], ball: L.rest[`toe${S}`][2] },
          L.hipY,
          L.ankleY,
        );
    const b = this.fit;
    if (!reach || !b) {
      this.heldRest();
      this.closeHands();
      this.shareTwist();
      this.bothHands();
      return;
    }
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
      const rp = r.pole ?? [-0.6, -1, -0.45];
      pole.set(side === "L" ? -rp[0] : rp[0], rp[1], rp[2]);
      solveArm(target, b.arm[0], b.arm[1], pole, ik);
      const w = Math.min(1, r.w);
      const shoulder = this.bones[`shoulder${side}`];
      shoulder.quaternion.slerp(ik.shoulder, w);
      const el = this.bones[`elbow${side}`];
      el.rotation.set(el.rotation.x + (ik.elbow - el.rotation.x) * w, el.rotation.y * (1 - w), el.rotation.z * (1 - w));
    }
    this.heldRest(reach);
    this.closeHands();
    this.shareTwist();
    this.heldReach(reach);
    this.bothHands();
  }

  /** (plan 78 phase 5) A drink held, not at the mouth: as photos of it have it — the fist upright, the thumb
   *  on the handle's top, the fingers pointing in toward the body's middle, so the mug's body is in front of
   *  the fist and its handle out to the side (`1 − w` of the way, as a sip takes over). */
  private heldRest(reach?: Reach) {
    const L = this.life;
    if (!L) return;
    for (const S of ["R", "L"] as const) {
      const h = this.grips[S];
      const fr = L.grip[S];
      if (!h || h.root || !fr || !(h.kind === "mug" || h.kind === "cup" || h.kind === "soda")) continue;
      const r = reach?.[S];
      const w = 1 - (r && r.at === "mouth" ? Math.min(1, r.w) : 0);
      if (w <= 0.01) continue;
      this.root.updateMatrixWorld(true);
      const rq = this.root.getWorldQuaternion(_qa);
      const up = _rz.set(0, 1, 0);
      const inward = _rk.set(S === "R" ? 0.8 : -0.8, 0, 0.6).applyQuaternion(rq);
      // (the fist stood up — the handle along the fingers' row, two of them through it; the fingers point in
      // only as far as the wrist bends easily: turned in further it bent 54° and the fist leant)
      for (let i = 0; i < 2; i++) {
        this.aimHand(S, fr.along, inward, 0.35 * w);
        this.aimHand(S, fr.across, up, 1.3 * w);
      }
    }
  }

  /** (plan 78 phase 5) A reach with something in the hand goes by the thing, not the wrist: the phone's
   *  speaker to the ear, its length on toward the mouth; a drink's rim to the lips. */
  private heldReach(reach: Reach) {
    const L = this.life;
    if (!L) return;
    const head = this.bones.head;
    for (const S of ["R", "L"] as const) {
      const r = reach[S];
      const h = this.grips[S];
      if (!r || r.w <= 0 || !h || h.root) continue;
      this.root.updateMatrixWorld(true);
      const mouth = head.localToWorld(_rm.set(L.eye[0], L.eye[1] - 0.075, L.eye[2] + 0.005));
      // (the right arm's way: reachTo mirrors it for the left)
      const pole3 = r.pole ? ([r.pole[0], r.pole[1], r.pole[2]] as [number, number, number]) : undefined;
      if (r.at === "ear" && h.kind === "phone") {
        const ear = head.localToWorld(_re.copy(this.bones[`ear${S}`].position));
        const out = _rh.copy(ear).sub(head.getWorldPosition(_rt)).normalize();
        const at = _rt.copy(ear).addScaledVector(out, 0.022);
        const speaker = _rs.set(0, 0.055, 0.004).applyQuaternion(h.quat).add(h.pos);
        const frame = L.grip[S];
        // (its length on from the ear toward the mouth, in the head's side: flat along the cheek, not into it)
        const down = _rn.copy(mouth).sub(ear);
        down.addScaledVector(out, -down.dot(out));
        const along = _rk.copy(ear).sub(mouth);
        along.addScaledVector(out, -along.dot(out));
        for (let pass = 0; pass < 3; pass++) {
          for (let i = 0; i < 2; i++) {
            this.holdAt(S, speaker, at, r.w, pole3);
            // (its screen to the head — the palm's way — its length along the head's side)
            if (frame) {
              this.aimHand(S, frame.n, _ra.copy(out).negate(), 1.2);
              this.aimHand(S, frame.along, along, 1.2);
            }
          }
          this.holdAt(S, speaker, at, r.w, pole3);
          // (a corner into the head: out by as far, and again)
          const depth = this.phoneInHead(S, h.pos, h.quat);
          if (depth <= 0.002) break;
          at.addScaledVector(out, depth + 0.003);
        }
        void down;
      } else if (r.at === "mouth" && (h.kind === "mug" || h.kind === "cup" || h.kind === "soda")) {
        const ahead = _rh.set(0, 0, 1).applyQuaternion(head.getWorldQuaternion(_qa));
        const at = _rt.copy(mouth).addScaledVector(ahead, 0.045);
        const frame = L.grip[S];
        if (!frame) continue;
        // (the elbow out to the side and down, the forearm up across at a slant — as a sip's is)
        const sipPole: [number, number, number] = [-1, -0.7, 0.1];
        // (then the arm brought round in line with the hand — the elbow back along the hand's own way — so
        // the wrist barely bends: the hand where it is, the forearm behind it)
        const inLine = () => {
          this.root.updateMatrixWorld(true);
          const wq = wr.getWorldQuaternion(_qa);
          const w = wr.getWorldPosition(_rb);
          // (the forearm up from below at a slant to it — level, the elbow went up to the shoulder)
          const e = _rk.copy(frame.along).applyQuaternion(wq);
          e.y = 0;
          e.normalize()
            .multiplyScalar(-Math.cos(SIP_SLANT))
            .add(_rn.set(0, -Math.sin(SIP_SLANT), 0))
            .multiplyScalar(0.24)
            .add(w);
          const sh = this.bones[`shoulder${S}`].getWorldPosition(_rd);
          const p = e.sub(sh).applyQuaternion(this.bones.chest.getWorldQuaternion(_qc).invert()).normalize();
          sipPole[0] = S === "L" ? -p.x : p.x;
          sipPole[1] = p.y;
          sipPole[2] = p.z;
        };
        // (its top as the hand has it now — worked out, not read back off the drawn mug, which lags a frame
        // and fed back: its handle in the index's and the middle finger's curl, its body in front of the fist,
        // stood up about the handle as props.ts keepUpright stands it — tipped back to the mouth, sip·1.05)
        const wr = this.bones[`wrist${S}`];
        const handle = gripAt("mug", frame, _rs);
        // (its up tipped back to the mouth, sip·1.05 rad)
        const tip = 1.05 * r.w;
        const want = _rz.set(0, Math.cos(tip), -Math.sin(tip)).applyQuaternion(this.root.getWorldQuaternion(_qc));
        // (its top where the hand has it — the hand tips it, as a real one does, and what the hand can't,
        // props.ts keepUpright turns in the fingers no more than IN_DRINK, about the handle)
        const top = (o: Vector3) => {
          this.root.updateMatrixWorld(true);
          const wq = wr.getWorldQuaternion(_qa);
          const hw = _rv.copy(handle).applyMatrix4(wr.matrixWorld);
          const fore = _ra.copy(frame.along).applyQuaternion(wq);
          const upNow = _rd.copy(frame.across).applyQuaternion(wq);
          _qb.setFromUnitVectors(upNow, want);
          const ang = 2 * Math.acos(Math.min(1, Math.abs(_qb.w)));
          if (ang > IN_DRINK) _qb.slerpQuaternions(_q.identity(), _qb.clone(), IN_DRINK / ang);
          return o.copy(fore).multiplyScalar(0.077).addScaledVector(upNow, 0.05).applyQuaternion(_qb).add(hw);
        };
        for (let i = 0; i < 2; i++) {
          this.holdAtBy(S, top, at, r.w, sipPole);
          // (the hand tips it, the fist beside it pointing in across the face — as photos of a sip have it:
          // the handle out to the side, not on the mug's far side)
          this.aimHand(S, frame.across, want, 1.2);
          this.aimHand(
            S,
            frame.along,
            _rk.set(S === "R" ? 0.75 : -0.75, 0.15, 0.55).applyQuaternion(this.root.getWorldQuaternion(_qc)),
            0.8 * r.w,
          );
          inLine();
        }
        this.holdAtBy(S, top, at, r.w, sipPole);
        // (the hand's turn again, from the arm now in line)
        this.aimHand(S, frame.across, want, 1.2);
        this.aimHand(
          S,
          frame.along,
          _rk.set(S === "R" ? 0.75 : -0.75, 0.15, 0.55).applyQuaternion(this.root.getWorldQuaternion(_qc)),
          0.8 * r.w,
        );
        this.holdAtBy(S, top, at, r.w, sipPole);
      }
    }
  }

  /** (plan 78 phase 5) How deep the held phone's corners go into the head (an ellipsoid, as closeHands'), m */
  private phoneInHead(S: "L" | "R", pos: Vector3, quat: Quaternion): number {
    const wr = this.bones[`wrist${S}`];
    const head = this.bones.head;
    this.root.updateMatrixWorld(true);
    head.getWorldQuaternion(_hhq);
    const c = head.getWorldPosition(_hhp).add(_hhc.set(0, 0.09, 0.02).applyQuaternion(_hhq));
    _hhq.invert();
    let most = 0;
    for (const x of [-0.035, 0.035])
      for (const y of [-0.07, 0, 0.07]) {
        const p = _hhd.set(x, y, 0.006).applyQuaternion(quat).add(pos).applyMatrix4(wr.matrixWorld);
        const d = p.sub(c).applyQuaternion(_hhq);
        const k = Math.hypot(d.x / 0.076, d.y / 0.115, d.z / 0.1);
        if (k < 1) most = Math.max(most, (1 - k) * (d.length() / Math.max(k, 1e-6)));
      }
    return most;
  }

  /** (plan 78 phase 5) Bring a point held in a hand (its wrist's space) to a point in the world: the arm
   *  solved again and again as the hand's turn moves the point about the wrist. `w` of the way. */
  holdAt(S: "L" | "R", grip: Vector3, target: Vector3, w = 1, pole?: [number, number, number]) {
    const wr = this.bones[`wrist${S}`];
    this.holdAtBy(S, (out) => out.copy(grip).applyMatrix4(wr.matrixWorld), target, w, pole);
  }
  /** (the same, the held point worked out from the hand as it is, in the world) */
  private holdAtBy(
    S: "L" | "R",
    point: (out: Vector3) => Vector3,
    target: Vector3,
    w = 1,
    pole?: [number, number, number],
  ) {
    if (w <= 0) return;
    const wr = this.bones[`wrist${S}`];
    this.root.updateMatrixWorld(true);
    const from = _rw.copy(wr.getWorldPosition(_rx));
    for (let i = 0; i < 3; i++) {
      this.root.updateMatrixWorld(true);
      const g = point(_rc);
      const wp = wr.getWorldPosition(_rx);
      // (the wrist where the point lands on the target, `w` of the way from where it was)
      const t = _ry.copy(target).sub(g).add(wp).sub(from).multiplyScalar(w).add(from);
      this.reachTo(S, t, 1, pole);
    }
  }

  /** Put a hand on a point in the world (a steering wheel's rim), after `setPose`: two-bone IK
   *  from the posed shoulder, the elbow pointing down and out by `pole` (the chest's space,
   *  the right arm's; the left mirrors x). */
  reachTo(
    side: "L" | "R",
    world: Vector3,
    w = 1,
    poleR: [number, number, number] = [-0.6, -1, -0.45],
    /** (plan 80) close the fingers on what's held (gripTo closes its own hand once, after) */
    close = true,
  ) {
    const b = this.fit;
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
    if (close) this.closeHands();
    this.shareTwist();
  }
  /** (plan 80) A wrist's own turn `q` (its parent's frame — the forearm's) as a real wrist's three: the twist
   *  about the forearm (shared down it), the bend up or down (about the palm's across) and side to side (about
   *  its normal) — rad, into `out`. */
  wristParts(S: "L" | "R", q: Quaternion, out = { twist: 0, bend: 0, side: 0 }) {
    out.twist = out.bend = out.side = 0;
    const wr = this.bones[`wrist${S}`];
    if (!wr) return out;
    const a = _wo.copy(wr.position).normalize();
    // (q and −q are one turn: read it from the one with w ≥ 0 — else a small twist reads as nearly a whole one)
    const sg = q.w < 0 ? -1 : 1;
    out.twist = 2 * Math.atan2(sg * (q.x * a.x + q.y * a.y + q.z * a.z), sg * q.w);
    const F = this.life?.grip[S];
    if (!F) return out;
    _woq.setFromAxisAngle(a, -out.twist).premultiply(q);
    const sw = 2 * Math.acos(Math.min(1, Math.abs(_woq.w)));
    if (sw > 1e-5) {
      const ax = _wo2
        .set(_woq.x, _woq.y, _woq.z)
        .normalize()
        .multiplyScalar(Math.sign(_woq.w) || 1);
      // (the bend's and the side's axes as the hand has them once twisted — read against the untwisted hand,
      // a twisted one's bend read as side)
      _woq.setFromAxisAngle(a, out.twist);
      out.bend = sw * ax.dot(_wo3.copy(F.across).applyQuaternion(_woq));
      out.side = sw * ax.dot(_wo3.copy(F.n).applyQuaternion(_woq));
    }
    return out;
  }

  /** (plan 80) How far a wrist's own turn `q` goes past a real wrist's reach, summed (rad; 0 within it): the
   *  twist past ±80°, the bend up or down past ±60°, side to side past −25° … +35° (thumb-ward the less). As
   *  aimHand clamps. */
  wristOver(S: "L" | "R", q: Quaternion): number {
    const w = this.wristParts(S, q, _wp);
    const lo = S === "R" ? -0.44 : -0.61;
    const hi = S === "R" ? 0.61 : 0.44;
    return (
      Math.max(0, Math.abs(w.twist) - 1.4) +
      Math.max(0, Math.abs(w.bend) - 1.05) +
      Math.max(0, lo - w.side, w.side - hi)
    );
  }

  /** (plan 80) Where a life hand's wrist goes (the world's), and its turn, for the hand's own frame to be
   *  at a place: the palm's middle at `palm`, the fingers along `along`, the index's side (toward the
   *  thumb) toward `index`. False on a body without life hands. */
  wristFor(S: "L" | "R", palm: Vector3, along: Vector3, index: Vector3, at: Vector3, q: Quaternion): boolean {
    const F = this.life?.grip[S];
    return !!F && this.wristTo(S, palm, F.along, along, F.across, index, at, q);
  }

  /** (plan 80) The same for any two of the hand's own lines (its wrist's space): `a` along `aTo` (the world's),
   *  `b` turned toward `bTo` — a held torch's line ahead, the back of the hand up. */
  wristTo(
    S: "L" | "R",
    palm: Vector3,
    a: Vector3,
    aTo: Vector3,
    b: Vector3,
    bTo: Vector3,
    at: Vector3,
    q: Quaternion,
  ): boolean {
    const F = this.life?.grip[S];
    const wr = this.bones[`wrist${S}`];
    if (!F || !wr) return false;
    const A = _wfA.copy(aTo).normalize();
    const B = _wfB.copy(bTo).addScaledVector(A, -bTo.dot(A)).normalize();
    _wfM.makeBasis(A, B, _wfC.crossVectors(A, B));
    const a0 = _wfA.copy(a).normalize();
    const b0 = _wfB.copy(b).addScaledVector(a0, -b.dot(a0)).normalize();
    _wfN.makeBasis(a0, b0, _wfC.crossVectors(a0, b0));
    q.setFromRotationMatrix(_wfM.multiply(_wfN.transpose()));
    // (the palm's middle from the wrist: 0.55 of the way to the middle knuckle, 2.2 cm out of the palm — the
    // mocks' own, tools/art/guns/pose.py hand_rest)
    const k = wr.getWorldScale(_wfS).x;
    at.copy(F.mid)
      .multiplyScalar(0.55)
      .addScaledVector(_wfC.copy(F.n).normalize(), 0.022)
      .multiplyScalar(k)
      .applyQuaternion(q);
    at.subVectors(palm, at);
    return true;
  }

  /** (plan 80) A life index finger at a curl of the library's — the trigger finger: straight along the frame,
   *  or in the guard on the trigger. After the grips (they close it round what's held). */
  indexTo(S: "L" | "R", c: number) {
    this.poseFinger(S, "index", c);
  }
  /** (plan 80) All four fingers of a life hand at a curl of the library's (the cascade's): a flat palm (a rod
   *  struck), an open hand. After the grips. */
  fingersTo(S: "L" | "R", c: number) {
    this.poseFinger(S, "fingers", c);
    this.poseFinger(S, "index", c);
    this.poseFinger(S, "ring", c * CASCADE.ring);
    this.poseFinger(S, "little", c * CASCADE.little);
  }

  /** (plan 80) What gripTo last left each hand: how far its wrist fell short of the place (m), and how far
   *  past a real wrist's reach it's turned (rad, wristOver) */
  readonly gripLeft = { L: { short: 0, over: 0 }, R: { short: 0, over: 0 } };

  /** (plan 80) Put a hand at a place, turned: the wrist at `at` (the world's), its world turn `q`. The arm's
   *  two-bone IK (reachTo, its elbow toward `pole`), then the elbow swung round the shoulder→wrist line to
   *  where the wrist is left least past a real one's reach (and the elbow not up by the ear) — the turn it
   *  then takes is exactly `q`, whatever: what's held in it keeps its way (a gun never canted). The twist
   *  shared down the forearm; the fingers closed on what the hand holds. `w` blends it in. After setPose. */
  gripTo(
    S: "L" | "R",
    at: Vector3,
    q: Quaternion,
    w = 1,
    poleR: [number, number, number] = [-0.6, -1, -0.45],
    /** (far off: the elbow where the pole has it, no search; the fingers left as they are) */
    cheap = false,
  ) {
    if (!this.fit || !this.skeleton || w <= 0) return;
    const sh = this.bones[`shoulder${S}`];
    const el = this.bones[`elbow${S}`];
    const wr = this.bones[`wrist${S}`];
    if (!sh.parent || !wr.parent) return;
    _g0s.copy(sh.quaternion);
    _g0e.copy(el.quaternion);
    _g0w.copy(wr.quaternion);
    this.reachTo(S, at, 1, poleR, false);
    sh.updateWorldMatrix(true, true);
    const s0 = sh.getWorldPosition(_gs);
    const wp = wr.getWorldPosition(_gw);
    const E = el.getWorldPosition(_ge).sub(s0);
    const axis = _ga.copy(wp).sub(s0).normalize();
    const P = (wr.parent as Bone).getWorldQuaternion(_gp);
    const k = sh.getWorldScale(_wfS).x || 1;
    // (each swing tried: what the wrist's left to do, past its reach, first; the elbow up past the shoulder's
    // height or in across the chest after; then the least swing off the pole's)
    let best = 0;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let i = cheap ? 0 : -10; i <= (cheap ? 0 : 10); i++) {
      const th = i * 0.14;
      _gr.setFromAxisAngle(axis, th);
      _gl.copy(_gr).multiply(P).invert().multiply(q);
      const e = _wo.copy(E).applyQuaternion(_gr);
      const up = Math.max(0, e.y / k);
      // (past a wrist's reach, hard; then a forearm twisted off its neutral and a wrist bent, as a person minds
      // them — at ease, a little; a palm turned up by the forearm or a wrist bent double, a lot)
      const over = this.wristOver(S, _gl);
      const pt = _wp;
      const cost =
        4 * over + 0.35 * Math.abs(pt.twist) + 0.25 * Math.hypot(pt.bend, pt.side) + 2 * up + 0.04 * Math.abs(th);
      if (cost < bestCost - 1e-6) {
        bestCost = cost;
        best = th;
      }
    }
    // the swing given to the shoulder (in its parent's frame), the wrist turned to `q` under it
    _gr.setFromAxisAngle(axis, best);
    (sh.parent as Bone).getWorldQuaternion(_gpp);
    sh.quaternion.premultiply(_gsw.copy(_gpp).invert().multiply(_gr).multiply(_gpp));
    wr.quaternion.copy(_gr).multiply(P).invert().multiply(q);
    this.gripLeft[S].over = this.wristOver(S, wr.quaternion);
    this.gripLeft[S].short = wp.distanceTo(at) / k;
    if (w < 1) {
      _g1s.copy(sh.quaternion);
      _g1e.copy(el.quaternion);
      sh.quaternion.copy(_g0s).slerp(_g1s, w);
      el.quaternion.copy(_g0e).slerp(_g1e, w);
      _g1s.copy(wr.quaternion);
      wr.quaternion.copy(_g0w).slerp(_g1s, w);
    }
    this.shareTwist();
    if (!cheap) this.closeHands(S);
  }

  /** (plan 78 phase 5) A life finger at a curl of the library's (closeHands' way, its fan shut with it) */
  private poseFinger(S: "L" | "R", j: string, c: number) {
    const life = this.life;
    const kn = this.knuckles;
    if (!life || !kn) return;
    const base = j === "fingers" || j === "index" ? this.bones[`${j}${S}` as JointName] : kn[`${j}${S}`];
    const H = life.hinge;
    if (!base || !H[`${j}${S}`]) return;
    const a = fingerAt(c);
    const rest = life.restBend[`${j}${S}`] ?? { mcp: 0, pip: 0 };
    const shut = clamp01(c / FAN_SHUT) * FAN_CLOSE;
    base.quaternion
      .setFromAxisAngle(life.palm[S], -(life.fan[`${j}${S}`] ?? 0) * shut)
      .multiply(_q.setFromAxisAngle(H[`${j}${S}`], a.mcp * DEG - rest.mcp));
    kn[`${j}2${S}`]?.quaternion.setFromAxisAngle(H[`${j}2${S}`], a.pip * DEG - rest.pip);
    kn[`${j}3${S}`]?.quaternion.setFromAxisAngle(H[`${j}3${S}`], a.dip * DEG);
  }
  /** (…and its tip, the world's: 2.2 cm on from its last joint) */
  private fingerTip(S: "L" | "R", j: string, out: Vector3): Vector3 {
    const kn = this.knuckles;
    const k2 = kn?.[`${j}2${S}`];
    const k3 = kn?.[`${j}3${S}`];
    if (!k2 || !k3) return out.set(0, 0, 0);
    this.bones[`wrist${S}`].updateWorldMatrix(true, true);
    const p2 = k2.getWorldPosition(_p2);
    const p3 = k3.getWorldPosition(_p3);
    return out.copy(p3).sub(p2).normalize().multiplyScalar(0.022).add(p3);
  }

  /** (plan 80) A life hand's fingers as points (the world's), for checks — a hand through a hand, through a
   *  gun: each finger's knuckle, middle joint, last joint and tip, thumb first. Empty without life hands. */
  fingerPoints(S: "L" | "R"): Vector3[][] {
    const kn = this.knuckles;
    if (!kn || !this.life) return [];
    this.bones[`wrist${S}`].updateWorldMatrix(true, true);
    const out: Vector3[][] = [];
    for (const j of ["thumb", "index", "fingers", "ring", "little"]) {
      const base = j === "ring" || j === "little" ? kn[`${j}${S}`] : this.bones[`${j}${S}` as JointName];
      const k2 = kn[`${j}2${S}`];
      const k3 = kn[`${j}3${S}`];
      if (!base || !k2 || !k3) continue;
      const p1 = base.getWorldPosition(new Vector3());
      const p2 = k2.getWorldPosition(new Vector3());
      const p3 = k3.getWorldPosition(new Vector3());
      const tip = p3
        .clone()
        .sub(p2)
        .normalize()
        .multiplyScalar(j === "thumb" ? THUMB_TIP : 0.022)
        .add(p3);
      out.push([p1, p2, p3, tip]);
    }
    return out;
  }

  /** (bothHands: the thumbs' tap, −1 … 1: + the right one up, − the left) */
  private tap = 0;

  /** (plan 80) A life thumb laid straight and its pad turned to a point (the world's): a handgun's support
   *  thumb along the frame, thumbs forward. After gripTo. */
  thumbTo(S: "L" | "R", target: Vector3) {
    const kn = this.knuckles;
    const life = this.life;
    const tb = this.bones[`thumb${S}`];
    if (!kn || !life || !tb) return;
    const H = life.hinge;
    const th = thumbAt(-0.2);
    kn[`thumb2${S}`]?.quaternion.setFromAxisAngle(H[`thumb2${S}`], th.mcp * DEG);
    kn[`thumb3${S}`]?.quaternion.setFromAxisAngle(H[`thumb3${S}`], th.ip * DEG);
    this.aimThumb(S, tb, target);
  }

  /** (plan 78 phase 4/5) Turn a life thumb at its base so its pad comes to a point (the world's) */
  private aimThumb(S: "L" | "R", tb: Bone, target: Vector3) {
    const kn = this.knuckles;
    if (!kn) return;
    this.bones[`wrist${S}`].updateWorldMatrix(true, true);
    const base = tb.getWorldPosition(_p1);
    const t2 = kn[`thumb2${S}`]?.getWorldPosition(_p2);
    const t3 = kn[`thumb3${S}`]?.getWorldPosition(_p3);
    if (!t2 || !t3) return;
    const tip = _tip
      .copy(t3)
      .sub(t2)
      .normalize()
      .multiplyScalar(THUMB_TIP * 0.5)
      .add(t3);
    _qa.setFromUnitVectors(tip.sub(base).normalize(), _aim.copy(target).sub(base).normalize());
    const pw = (tb.parent as Bone).getWorldQuaternion(_qc);
    tb.quaternion.premultiply(_qa.premultiply(_qb.copy(pw).invert()).multiply(pw));
  }

  /** (plan 78 phase 3) A life arm's twist about its forearm shared down it: the elbow's own twist taken
   *  out and given to the wrist (the hand ends where it was), and the forearm's middle bone turned
   *  FORE_TWIST of the wrist's — a palm turned by the forearm, not wrung at the wrist or the elbow.
   *  After every pose and reach (twice is the same as once). */
  private shareTwist() {
    const kn = this.knuckles;
    if (!kn) return;
    for (const S of ["L", "R"] as const) {
      const fore = kn[`forearm${S}`];
      const wr = this.bones[`wrist${S}`];
      if (!fore || wr.position.lengthSq() < 1e-10) continue;
      _ax.copy(wr.position).normalize(); // (the forearm's line, in the elbow's frame)
      const el = this.bones[`elbow${S}`];
      const te = twistAbout(el.quaternion, _ax);
      if (Math.abs(te) > 1e-5) {
        el.quaternion.multiply(_q.setFromAxisAngle(_ax, -te));
        wr.quaternion.premultiply(_q.setFromAxisAngle(_ax, te));
      }
      fore.quaternion.setFromAxisAngle(_ax, FORE_TWIST * twistAbout(wr.quaternion, _ax));
    }
  }

  /** (plan 58 5b) Hands put where a move has them — on a top, an edge, the ground — given in the
   *  body's own space (x its left, y up from its feet, z ahead): `Locomotion.handsOut`. After
   *  `setPose` and the root placed. */
  handsTo(
    hands:
      | {
          [S in "L" | "R"]?: {
            at: [number, number, number];
            w: number;
            pole?: [number, number, number];
            palm?: [number, number, number];
            point?: [number, number, number];
            thumb?: [number, number, number];
          };
        }
      | null,
  ) {
    if (!hands) return;
    this.root.updateMatrixWorld(true);
    for (const S of ["L", "R"] as const) {
      const h = hands[S];
      if (!h || h.w <= 0) continue;
      this.reachTo(S, this.root.localToWorld(handAt.set(h.at[0], h.at[1], h.at[2])), h.w, h.pole);
      // (plan 78 phase 7: a life hand turned as the pose has it — its palm, its fingers — within a wrist's
      // reach; the wrist where it was put)
      const fr = this.life?.grip[S];
      if (fr && (h.palm || h.point)) {
        const rq = this.root.getWorldQuaternion(_tq);
        for (let i = 0; i < 2; i++) {
          if (h.point)
            this.aimHand(S, fr.along, _rk.set(h.point[0], h.point[1], h.point[2]).applyQuaternion(rq), 1.4 * h.w);
          if (h.palm) this.aimHand(S, fr.n, _rk.set(h.palm[0], h.palm[1], h.palm[2]).applyQuaternion(rq), 1.4 * h.w);
        }
      }
      if (fr && h.thumb) this.thumbsMeet(S, h);
    }
    // (an arm solved again turns its hand with it: a held drink's hand stood up again)
    this.heldRest(this.lastReach);
    this.closeHands();
    this.bothHands();
  }

  /** (plan 78 phase 7) A hand's thumb pad to a point where it meets the other's — a hand heart's point: aimed,
   *  and the hand moved by what it falls short (a smaller hand's thumbs stopped 4 cm apart), up to 3 cm. */
  private thumbsMeet(
    S: "L" | "R",
    h: {
      at: [number, number, number];
      w: number;
      pole?: [number, number, number];
      palm?: [number, number, number];
      point?: [number, number, number];
      thumb?: [number, number, number];
    },
  ) {
    const kn = this.knuckles;
    const fr = this.life?.grip[S];
    if (!kn || !fr || !h.thumb) return;
    const tb = this.bones[`thumb${S}`];
    const to = _meetTo.set(h.thumb[0], h.thumb[1], h.thumb[2]);
    const rq = this.root.getWorldQuaternion(_tq);
    let ox = 0;
    let oy = 0;
    for (let i = 0; i < 3; i++) {
      this.aimThumb(S, tb, this.root.localToWorld(_shapeAt.copy(to)));
      const t2 = kn[`thumb2${S}`]?.getWorldPosition(_p2);
      const t3 = kn[`thumb3${S}`]?.getWorldPosition(_p3);
      if (!t2 || !t3) return;
      const tip = this.root.worldToLocal(
        _tv
          .copy(t3)
          .sub(t2)
          .normalize()
          .multiplyScalar(THUMB_TIP * 0.5)
          .add(t3),
      );
      const dx = to.x - tip.x;
      const dy = to.y - tip.y;
      if (Math.hypot(dx, dy) < 0.003 || i === 2) break;
      ox = Math.max(-0.03, Math.min(0.03, ox + dx));
      oy = Math.max(-0.03, Math.min(0.03, oy + dy));
      this.reachTo(S, this.root.localToWorld(handAt.set(h.at[0] + ox, h.at[1] + oy, h.at[2])), h.w, h.pole);
      for (let k = 0; k < 2; k++) {
        if (h.point)
          this.aimHand(S, fr.along, _rk.set(h.point[0], h.point[1], h.point[2]).applyQuaternion(rq), 1.4 * h.w);
        if (h.palm) this.aimHand(S, fr.n, _rk.set(h.palm[0], h.palm[1], h.palm[2]).applyQuaternion(rq), 1.4 * h.w);
      }
    }
  }

  /** (plan 78 phase 5) A thing held in both hands in front of the chest — the phone texting, a game pad: as
   *  a real one's held, its face up toward the eyes, each palm under its side, the fingers up its back, the
   *  thumbs come over its face (the screen, the buttons). Null lets go. Where it is, the body's root space:
   *  `twoPlace` (the caller draws it there). */
  holdTwo(kind: "phone" | "photo" | "pad" | null, tap = 0) {
    this.two = kind;
    this.tap = tap;
    if (!kind) {
      if (this.grips.L?.root) delete this.grips.L;
      if (this.grips.R?.root) delete this.grips.R;
    }
  }
  private two: "phone" | "photo" | "pad" | null = null;
  /** where the two-handed thing is (root space), once held */
  readonly twoPlace = { pos: new Vector3(), quat: new Quaternion(), on: false };
  private bothHands() {
    const L = this.life;
    const kind = this.two;
    this.twoPlace.on = false;
    if (!L || !kind || !this.knuckles) return;
    const T = TWO[kind];
    this.root.updateMatrixWorld(true);
    const rq = this.root.getWorldQuaternion(_tq);
    // (where it goes: off the chest, in the body's own turn; its face toward the eyes, its top on from it)
    const C = this.bones.chest.getWorldPosition(_tc).add(_tv.set(T.at[0], T.at[1], T.at[2]).applyQuaternion(rq));
    const N = _tn.set(0, T.up[0], T.up[1]).applyQuaternion(rq).normalize();
    const F = _tf
      .set(0, T.up[1] * -1, T.up[0])
      .applyQuaternion(rq)
      .normalize()
      .negate();
    if (F.dot(_tv.set(0, 0, 1).applyQuaternion(rq)) < 0) F.negate();
    // (its own axes: across from the left hand to the right, its face, its top)
    const X = _tx.crossVectors(F, N).normalize();
    if (kind === "phone") _tm.makeBasis(X, F, N);
    // (on its side: its length across, from hand to hand)
    else if (kind === "photo") _tm.makeBasis(F, _ty.copy(X).negate(), N);
    else _tm.makeBasis(X, N, _ty.crossVectors(X, N).normalize());
    const q = _tq2.setFromRotationMatrix(_tm);
    // (the elbows down and out — the right arm's way: reachTo mirrors it for the left)
    const pole = (_S: "L" | "R"): [number, number, number] => [-0.9, -1, -0.25];
    for (const S of ["R", "L"] as const) {
      const fr = L.grip[S];
      if (!fr) continue;
      if (kind === "photo") {
        // (a photo, as photos of one being taken: each hand at an end, the palms facing, the thumb round onto
        // a front corner, the fingers tipped away from the face so they wrap the back — up, they curled over
        // its top; turned palm-to-face, past a wrist's reach, the palms went down)
        const grip = _tg[S]
          .copy(fr.mid)
          .multiplyScalar(T.along)
          .addScaledVector(fr.n, PALM_HALF + T.out)
          .addScaledVector(fr.across, T.across);
        _tl[S].copy(grip);
        const back = _rk.copy(F).multiplyScalar(0.45).addScaledVector(N, -0.9).normalize();
        for (let i = 0; i < 2; i++) {
          this.aimHand(S, fr.across, N, 1.6);
          this.aimHand(S, fr.along, back, 1.6);
          this.holdAt(S, grip, C, 1, pole(S));
        }
        continue;
      }
      if (kind === "phone") {
        // (its middle, as this hand holds it: out of the palm toward the other hand, up toward the thumb,
        // along toward the fingertips — the hands hold its lower half)
        const grip = _tg[S]
          .copy(fr.mid)
          .multiplyScalar(T.along)
          .addScaledVector(fr.along, T.lift)
          .addScaledVector(fr.n, PALM_HALF + T.out)
          .addScaledVector(fr.across, T.across);
        _tl[S].copy(grip);
        // (the palms facing each other, the thumb's side up to the eyes, the fingers on along its top)
        for (let i = 0; i < 2; i++) {
          this.aimHand(S, fr.across, N, 1.6);
          this.aimHand(S, fr.along, F, 1.6);
          this.holdAt(S, grip, C, 1, pole(S));
        }
        continue;
      }
      // (a pad: each fist round its own handle — the handle across the palm at the fingers' roots, the
      // thumb's end up toward the body, the palm turned in toward the pad's middle; the thumb over the top)
      const H = PAD_HANDLE;
      const sx = S === "R" ? 1 : -1;
      const hDir = _hd.set(H.dir[0], H.dir[1], H.dir[2]).normalize().applyQuaternion(q);
      const mid = _hm3
        .set(sx * H.x + (H.dir[0] * H.len) / 2, H.y + (H.dir[1] * H.len) / 2, H.z + (H.dir[2] * H.len) / 2)
        .applyQuaternion(q)
        .add(C);
      _tl[S].set(sx * H.x + (H.dir[0] * H.len) / 2, H.y + (H.dir[1] * H.len) / 2, H.z + (H.dir[2] * H.len) / 2);
      const grip = _tg[S]
        .copy(fr.mid)
        .multiplyScalar(0.92)
        .addScaledVector(fr.n, PALM_HALF + H.r);
      const inward = _hi.copy(C).sub(mid);
      inward.addScaledVector(hDir, -inward.dot(hDir)).normalize();
      for (let i = 0; i < 2; i++) {
        this.aimHand(S, fr.n, inward, 1.6);
        this.aimHand(S, fr.across, _hu.copy(hDir).negate(), 1.6);
        this.holdAt(S, grip, mid, 1, pole(S));
      }
    }
    // (where the two hands hold it: half way between what each one's hold makes of it — the target, where
    // they don't quite reach)
    this.root.updateMatrixWorld(true);
    const at = (S: "L" | "R", out: Vector3) => {
      out.copy(_tg[S]).applyMatrix4(this.bones[`wrist${S}`].matrixWorld);
      // (the hold's point, back to its middle: a phone's hold is its middle; a pad's its handle)
      if (kind === "pad") out.sub(_hv.copy(_tl[S]).applyQuaternion(q));
      return out;
    };
    const cR = at("R", _tv);
    const cL = at("L", _ty);
    C.copy(cR).add(cL).multiplyScalar(0.5);
    // (into the root's space)
    const rqi = _tq.invert();
    this.twoPlace.pos.copy(C);
    this.root.worldToLocal(this.twoPlace.pos);
    this.twoPlace.quat.copy(q).premultiply(rqi);
    this.twoPlace.on = true;
    const shape = kind === "pad" ? PAD_SHAPE : PHONE_SHAPE;
    for (const S of ["L", "R"] as const) {
      this.grips[S] ??= { shape, pos: new Vector3(), quat: new Quaternion(), root: true, kind };
      const o = this.grips[S];
      o.shape = shape;
      o.pos.copy(this.twoPlace.pos);
      o.quat.copy(this.twoPlace.quat);
      o.root = true;
      o.kind = kind;
    }
    this.closeHands();
    // (a pad's index fingers on its triggers, the front top edge over each handle — as photos of a pad held)
    if (kind === "pad")
      for (const S of ["R", "L"] as const) {
        const trig = _tt
          .set(S === "R" ? 0.05 : -0.05, 0.014, -0.03)
          .applyQuaternion(q)
          .add(C);
        let best = 0.6;
        let bestD = Number.POSITIVE_INFINITY;
        for (let c = 0.05; c <= 1.6; c += 0.1) {
          this.poseFinger(S, "index", c);
          const tip = this.fingerTip(S, "index", _tv);
          const d = tip.distanceTo(trig);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        this.poseFinger(S, "index", best);
      }
    // (each thumb on its face — the screen, the buttons — near its own side, lifting by turns as it taps)
    // (a pad's thumbs on its sticks: over the handles, a little in)
    const halfW = kind === "phone" ? 0.012 : kind === "photo" ? 0.058 : 0.035;
    for (const S of ["R", "L"] as const) {
      const tb = this.bones[`thumb${S}`];
      const kn = this.knuckles;
      const H = L.hinge;
      const th = thumbAt(0.25);
      kn[`thumb2${S}`]?.quaternion.setFromAxisAngle(H[`thumb2${S}`], th.mcp * DEG);
      kn[`thumb3${S}`]?.quaternion.setFromAxisAngle(H[`thumb3${S}`], th.ip * DEG);
      const lift = Math.max(0, S === "R" ? this.tap : -this.tap) * 0.012;
      const target = _tt
        .copy(C)
        .addScaledVector(_tx.set(S === "R" ? -1 : 1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(_tq)), halfW)
        .addScaledVector(N, T.half + 0.008 + lift);
      this.aimThumb(S, tb, target);
    }
    this.shareTwist();
  }

  /** What's worn that swings on Jolt near (docs/plan/61), once it's shown. */
  worn(): readonly HangSpec[] | null {
    const b = this.fit;
    return b && this.skeleton ? b.hangs : null;
  }

  /** Swing the springs (after `setPose`, once a frame): `rest` holds them as they hang (reduced
   *  motion, far off) and starts them there next time; those in `skip` left as they are (swung on
   *  Jolt, docs/plan/61). */
  step(dt: number, rest = false, skip?: ReadonlySet<JointName>) {
    const b = this.fit;
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
    if (this.life) {
      this.life.setFace(blink, talk);
      return;
    }
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
    if (this.life) {
      this.life.setEyes(x, y);
      return;
    }
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
    const e = this.fit?.eye;
    const head = this.bones.head;
    if (!e || !head) return out.set(0, this.height * 0.92, 0.08);
    this.root.updateMatrixWorld(true);
    head.localToWorld(out.set(e[0], e[1], e[2]));
    return this.root.worldToLocal(out);
  }

  /** The right ear in the head bone's space (an earbud hangs there), or null before it's shown. */
  earPoint(): [number, number, number] | null {
    return this.fit?.ear ?? null;
  }

  /** The bone to hang things on (a mug in the right hand, a phone). */
  /** (plan 78 phase 5) A life hand's frame (its wrist's space) for a held thing to sit in; null on any other
   *  body (chars/props.ts inHand keeps the mitten's places) */
  handFrame(S: "L" | "R"): HandFrame | null {
    return this.life?.grip[S] ?? null;
  }

  /** (plan 78 phase 5) Turn a hand at its wrist so a line of its own (its wrist's space: a held torch's
   *  way, across the palm) points along `dir` (the world's), no more than `most` (rad) — a torch aimed by
   *  the hand, not turned in it. After posing; the forearm takes its share of the twist. */
  aimHand(S: "L" | "R", line: Vector3, dir: Vector3, most = 1.3) {
    const wr = this.bones[`wrist${S}`];
    if (!wr.parent) return;
    wr.updateWorldMatrix(true, false);
    const now = _hv.copy(line).applyQuaternion(wr.getWorldQuaternion(_qa)).normalize();
    _q.setFromUnitVectors(now, _hl.copy(dir).normalize());
    const ang = 2 * Math.acos(Math.min(1, Math.abs(_q.w)));
    _qb.identity().slerp(_q, ang > most ? most / ang : 1);
    // (the world's turn into the wrist's own: its parent's frame round it)
    const pw = wr.parent.getWorldQuaternion(_qa);
    wr.quaternion.premultiply(_qb.premultiply(_qc.copy(pw).invert()).multiply(pw));
    // (a real wrist's reach: the twist the forearm's, up to ±80°; the bend up or down ±60°, and side to side
    // −25° … +35° — past them the thing turns in the hand instead)
    const F = this.life?.grip[S];
    if (F) {
      const a = _hv.copy(wr.position).normalize();
      const q = wr.quaternion;
      const tw = twistAbout(q, a);
      _qb.setFromAxisAngle(a, Math.max(-1.4, Math.min(1.4, tw)));
      // (the swing left: about an axis across the forearm — the bend's part about the palm's across, the
      // side to side's about its normal)
      _qc.setFromAxisAngle(a, -tw).premultiply(q);
      const sw = 2 * Math.acos(Math.min(1, Math.abs(_qc.w)));
      if (sw > 1e-5) {
        const ax = _hl
          .set(_qc.x, _qc.y, _qc.z)
          .normalize()
          .multiplyScalar(Math.sign(_qc.w) || 1);
        const bend = Math.max(-1.05, Math.min(1.05, sw * ax.dot(F.across)));
        const side = Math.max(-0.44, Math.min(0.61, sw * ax.dot(F.n)));
        S === "R"
          ? Math.max(-0.44, Math.min(0.61, sw * ax.dot(F.n)))
          : Math.max(-0.61, Math.min(0.44, sw * ax.dot(F.n)));
        _ra.copy(F.across).multiplyScalar(bend).addScaledVector(F.n, side);
        const s2 = _ra.length();
        _qc.setFromAxisAngle(s2 > 1e-6 ? _ra.normalize() : a, s2);
        q.copy(_qc).multiply(_qb);
      }
    }
    this.shareTwist();
  }

  /** (plan 78 phase 5) What a hand holds, for its fingers to close on: its shape (chars/props.ts HELD_SHAPE)
   *  and where it sits — in the wrist's space (props.ts gripPlace: a mug, the phone, the torch) or, `root`,
   *  the body's (a pad between the two hands). Null lets go. */
  hold(S: "L" | "R", h: { shape: HeldShape; pos: Vector3; quat: Quaternion; root?: boolean; kind?: string } | null) {
    if (!h) delete this.grips[S];
    else {
      this.grips[S] ??= {
        shape: h.shape,
        pos: new Vector3(),
        quat: new Quaternion(),
        root: false,
        kind: "",
      };
      const o = this.grips[S];
      o.shape = h.shape;
      o.kind = h.kind ?? "";
      o.pos.copy(h.pos);
      o.quat.copy(h.quat);
      o.root = !!h.root;
    }
  }
  private lastReach: Reach | undefined;
  private rigCurl = { L: { fingers: 0, index: 0 }, R: { fingers: 0, index: 0 } };
  private grips: Partial<
    Record<"L" | "R", { shape: HeldShape; pos: Vector3; quat: Quaternion; root: boolean; kind: string }>
  > = {};

  /** (plan 78 phase 5) A life hand closed on what it holds: each finger curled (the library's way, its fan
   *  closing) till its bones meet the thing's surface, not past it; the thumb's pad turned to the thing's
   *  nearest side. After every pose and reach (twice is once). */
  private closeHands(only?: "L" | "R") {
    const kn = this.knuckles;
    const life = this.life;
    if (!kn || !life) return;
    for (const S of ["L", "R"] as const) {
      if (only && S !== only) continue;
      const h = this.grips[S];
      if (!h) continue;
      const wrist = this.bones[`wrist${S}`];
      // the thing in the wrist's space
      if (h.root) {
        this.root.updateMatrixWorld(true);
        _hm.copy(wrist.matrixWorld).invert().multiply(this.root.matrixWorld);
        _hm2.compose(h.pos, h.quat, _one);
        _hm.multiply(_hm2).decompose(_hp, _hq, _hs);
      } else {
        _hp.copy(h.pos);
        _hq.copy(h.quat);
      }
      _hqi.copy(_hq).invert();
      // (and the head, a hand at the ear: its fingers stop at it — an ellipsoid, 7.6 cm half-wide, 11.5 high,
      // 10 deep, its middle 9 cm over the head joint; in the wrist's space)
      this.root.updateMatrixWorld(true);
      _hm.copy(wrist.matrixWorld).invert().multiply(this.bones.head.matrixWorld);
      _hm.decompose(_hhp, _hhq, _hs);
      _hhp.add(_hhc.set(0, 0.09, 0.02).applyQuaternion(_hhq));
      _hhq.invert();
      const headGap = (v: Vector3) => {
        const d = _hhd.copy(v).sub(_hhp).applyQuaternion(_hhq);
        const k = Math.hypot(d.x / 0.076, d.y / 0.115, d.z / 0.1);
        return k < 1e-6 ? -0.1 : (k - 1) * (d.length() / k);
      };
      const gap = (v: Vector3, r: number) =>
        Math.min(heldDistance(h.shape, _hl.copy(v).sub(_hp).applyQuaternion(_hqi)), headGap(v)) - r;
      const H = life.hinge;
      const sign = S === "R" ? 1 : -1;
      // (a phone at the ear: the fingers flat up its back alike — at the straightest one's curl)
      const alike: { c: number; set: (c: number) => void }[] = [];
      for (const j of ["fingers", "index", "ring", "little"]) {
        const base = j === "fingers" || j === "index" ? this.bones[`${j}${S}` as JointName] : kn[`${j}${S}`];
        const k2 = kn[`${j}2${S}`];
        const k3 = kn[`${j}3${S}`];
        if (!base || !k2 || !k3 || !H[`${j}${S}`]) continue;
        const rest = life.restBend[`${j}${S}`] ?? { mcp: 0, pip: 0 };
        const fan = life.fan[`${j}${S}`] ?? 0;
        // (the knuckle's bend from one curl of the library, the middle's and the tip's from another)
        const pose = (cm: number, cp: number) => {
          const a = fingerAt(cm);
          const b = fingerAt(cp);
          const shut = clamp01(cm / FAN_SHUT) * FAN_CLOSE;
          _f1
            .setFromAxisAngle(life.palm[S], -fan * shut)
            .multiply(_q.setFromAxisAngle(H[`${j}${S}`], a.mcp * DEG - rest.mcp));
          _f2.setFromAxisAngle(H[`${j}2${S}`], b.pip * DEG - rest.pip);
          _f3.setFromAxisAngle(H[`${j}3${S}`], b.dip * DEG);
        };
        // (how near the finger's bones come to the thing: + clear of it, − into it — its first bone alone,
        // or the middle's and the tip's)
        const clear = (cm: number, cp: number, first: boolean) => {
          pose(cm, cp);
          _g1.copy(_f1);
          _a1.copy(base.position);
          _a2.copy(k2.position).applyQuaternion(_g1).add(_a1);
          let m = Number.POSITIVE_INFINITY;
          if (first) {
            for (let u = 0.35; u <= 1.001; u += 0.325) m = Math.min(m, gap(_hv.lerpVectors(_a1, _a2, u), 0.009));
            return m;
          }
          _g2.copy(_g1).multiply(_f2);
          _a3.copy(k3.position).applyQuaternion(_g2).add(_a2);
          _g3.copy(_g2).multiply(_f3);
          _a4.copy(k3.position).normalize().multiplyScalar(0.022).applyQuaternion(_g3).add(_a3);
          for (let u = 0; u <= 1.001; u += 0.5) m = Math.min(m, gap(_hv.lerpVectors(_a2, _a3, u), 0.008));
          for (let u = 0; u <= 1.001; u += 0.5) m = Math.min(m, gap(_hv.lerpVectors(_a3, _a4, u), 0.007));
          return m;
        };
        // (closing from `lo` till `f` meets the thing: the last curl clear of it)
        const close = (lo: number, f: (c: number) => number) => {
          let hi = 1.8;
          if (f(lo) <= 0) return lo;
          if (f(hi) > 0) return hi;
          for (let i = 0; i < 9; i++) {
            const mid = (lo + hi) / 2;
            if (f(mid) > 0) lo = mid;
            else hi = mid;
          }
          return lo;
        };
        // a real hand's two steps: the knuckle bends till the finger's first bone meets the thing (the middle
        // and the tip curling with it the library's way), then the middle and the tip go on round it till
        // they meet it too
        const open = j === "index" ? Math.min(0.35, this.rigCurl[S].index) : Math.min(0.45, this.rigCurl[S].fingers);
        const cm = close(0.05, (c) => Math.min(clear(c, c, true), clear(c, c, false)));
        const cp = close(cm, (c) => clear(cm, c, false));
        // (a thing the open fingers pass through but the curled ones clear — a handle, a barrel in the fist's
        // crook: opened from closed till they meet it; one they're in both ways: as relaxed)
        const into = clear(0.05, 0.05, false) <= 0 && clear(0.05, 0.05, true) <= 0;
        // (a finger may press it a little — skin on a handle: SOFT)
        const whole = (c: number) => Math.min(clear(c, c, true), clear(c, c, false)) + SOFT;
        let c = cm;
        let c2 = cp;
        // (a mug by its handle, as photos of it: the index and the middle finger hooked through it — the
        // handle's placed in their hook, LifeLook's — the ring and the little tucked under it)
        if (h.kind === "mug") c = c2 = j === "index" || j === "fingers" ? HOOK_CURL : TUCK_CURL;
        else if (into || whole(0.05) <= 0 || h.kind === "mug") {
          if (whole(1.8) > 0) {
            // (out from closed in steps till the first touch, then that step halved down)
            let hi2 = 1.8;
            let lo2 = 1.8;
            while (lo2 > 0.05) {
              lo2 = Math.max(0.05, hi2 - 0.12);
              if (whole(lo2) <= 0) break;
              hi2 = lo2;
            }
            if (whole(lo2) > 0) hi2 = lo2;
            else
              for (let i = 0; i < 5; i++) {
                const m = (lo2 + hi2) / 2;
                if (whole(m) > 0) hi2 = m;
                else lo2 = m;
              }
            c = c2 = hi2;
          } else c = c2 = open;
        }
        pose(c, c2);
        base.quaternion.copy(_f1);
        k2.quaternion.copy(_f2);
        k3.quaternion.copy(_f3);
        alike.push({
          c,
          set: (k: number) => {
            pose(k, k);
            base.quaternion.copy(_f1);
            k2.quaternion.copy(_f2);
            k3.quaternion.copy(_f3);
          },
        });
      }
      if (h.kind === "phone" && !h.root && alike.length) {
        const k = Math.min(...alike.map((a) => a.c));
        for (const a of alike) a.set(k);
      }
      // (two-handed: the thumbs are aimed on its face — bothHands)
      if (h.root) continue;
      // the thumb opened, then folded in (the rig's swing, the library's joints) till it meets the thing
      const tb = this.bones[`thumb${S}`];
      const t2 = kn[`thumb2${S}`];
      const t3 = kn[`thumb3${S}`];
      if (!t2 || !t3) continue;
      const thumbPose = (t: number) => {
        _e.set(0.3 * t, sign * t, 0);
        _f1.setFromEuler(_e);
        const th = thumbAt(t);
        _f2.setFromAxisAngle(H[`thumb2${S}`], th.mcp * DEG);
        _f3.setFromAxisAngle(H[`thumb3${S}`], th.ip * DEG);
      };
      const thumbClear = (t: number) => {
        thumbPose(t);
        _a1.copy(tb.position);
        _a2.copy(t2.position).applyQuaternion(_f1).add(_a1);
        _g2.copy(_f1).multiply(_f2);
        _a3.copy(t3.position).applyQuaternion(_g2).add(_a2);
        _g3.copy(_g2).multiply(_f3);
        _a4.copy(t3.position).normalize().multiplyScalar(THUMB_TIP).applyQuaternion(_g3).add(_a3);
        let m = Number.POSITIVE_INFINITY;
        for (let u = 0.5; u <= 1.001; u += 0.25) m = Math.min(m, gap(_hv.lerpVectors(_a1, _a2, u), 0.011));
        for (let u = 0; u <= 1.001; u += 0.5) m = Math.min(m, gap(_hv.lerpVectors(_a2, _a3, u), 0.009));
        for (let u = 0; u <= 1.001; u += 0.5) m = Math.min(m, gap(_hv.lerpVectors(_a3, _a4, u), 0.008));
        return m;
      };
      let tlo = -0.35;
      let thi = 1.2;
      let t = thi;
      // (plan 80: a handgun's support hand, thumbs forward — its thumb laid straight along the frame, not
      // folded round onto the gun hand's trigger finger)
      if (h.kind === "support") t = -0.2;
      else if (thumbClear(tlo) <= 0) t = tlo;
      else if (thumbClear(thi) > 0) t = sign * tb.rotation.y;
      else {
        for (let i = 0; i < 10; i++) {
          const mid = (tlo + thi) / 2;
          if (thumbClear(mid) > 0) tlo = mid;
          else thi = mid;
        }
        t = tlo;
      }
      thumbPose(t);
      tb.quaternion.copy(_f1);
      t2.quaternion.copy(_f2);
      t3.quaternion.copy(_f3);
      void sign;
    }
  }

  bone(j: JointName): Bone | null {
    return this.skeleton ? this.bones[j] : null;
  }

  dispose() {
    if (this.held) this.f.release(this.held.a, this.held.lod);
    this.held = null;
    this.life?.dispose();
    this.life = null;
    this.skeleton?.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
