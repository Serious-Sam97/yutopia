import type { PetLook, PetOutfit, Species } from "@yutopia/shared/pets";
import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshToonMaterial,
  NearestFilter,
  type Object3D,
  PlaneGeometry,
  RedFormat,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Pets as 3D models (docs/plan/14-pets-v2.md): every species built from soft
// primitives — an ellipsoid body, a sphere head, capsule legs, a tube tail,
// cones for ears, a flat bill, wings and tail feathers — in the pet's colour,
// marking and clothes, with a procedural rig: breathing, blinking, a wagging
// tail, a head that looks at you, a walk cycle, and a pose for everything it
// does (sleep, tricks, play, battles). The third-person view shows it in the
// room; the iso view renders it into sprites (pets-render.ts); the panel spins
// it on a turntable. Units: tiles, +X forward, +Y up. Origin: between the feet.

export type PoseKind =
  | "idle"
  | "walk"
  | "sit"
  | "sleep"
  | "jump"
  | "roll"
  | "spin"
  | "playdead"
  | "speak"
  | "highfive"
  | "dance"
  | "pounce"
  | "hop"
  | "dive"
  | "chill"
  | "eat"
  | "pet"
  | "lesson"
  | "battle"
  | "attack"
  | "special"
  | "defend"
  | "hurt"
  | "ko"
  // species idle sets (M3)
  | "scratch"
  | "pant"
  | "groom"
  | "stretch"
  | "twitch"
  | "binky"
  | "slide"
  | "shake"
  | "yawn"
  | "flat"
  | "preen"
  | "wing"
  // its mind (docs/plan/17-pets-minds.md): begging, a nudge, a sniff
  | "beg"
  | "nudge"
  | "sniff"
  // docs/plan/52-the-pet-two.md D5: lying down (a sphinx), the play-bow, a head tilt, nose down on the move
  | "lie"
  | "playbow"
  | "tilt"
  | "sniffground";
// How it feels, in its body (docs/plan/52 D4): the tail, the ears, the head, the walk's bounce.
// "": as its face says (the feeling).
export type BodyMood = "" | "happy" | "bored" | "scared" | "sulk" | "alert";
export type Face3 =
  | "open"
  | "closed"
  | "happy"
  | "angry"
  | "sad"
  | "surprised"
  | "sleepy"
  | "excited"
  | "scared"
  | "smug";

export interface PoseIn {
  kind: PoseKind;
  t: number; // 0..1 through the cycle (or the one-shot)
  face: Face3;
  look: number; // where the head turns (radians about up, 0 ahead), eased by the rig
  carry?: string | null; // a toy in the mouth (shared/held.ts kind)
  flash?: number; // 0..1 red (hurt)
  mood?: BodyMood;
  // how fast it's going (tiles/s): what picks a dog's gait — measured from its moves when unset
  // (the sheets and stills, standing still, set it)
  speed?: number;
}
// lying down: a slower cross-fade into and out of these (it doesn't snap from a run to the floor)
const LOW: ReadonlySet<PoseKind> = new Set(["sleep", "ko", "lie", "flat", "playdead", "chill", "slide", "dive"]);
// poses that place their own legs' hips
const OWN_LEGS: ReadonlySet<PoseKind> = new Set(["sit", "lesson", "beg", "scratch", "groom", "playbow"]);

// What's drawn for each species. Tiles; a person stands ~2 tall.
interface Profile {
  body: [number, number, number]; // half extents x (length), y, z (width)
  up: number; // body centre height
  head: { r: number; x: number; y: number; sx?: number; sy?: number; sz?: number }; // relative to the body centre
  legs: { x: number; z: number; len: number; r: number }[]; // hip positions (relative to body centre), lengths
  ears: "floppy" | "pointy" | "long" | "round" | "none" | "crest" | "fold";
  muzzle: "snout" | "small" | "bill" | "blunt" | "beak";
  tail: "curl" | "long" | "puff" | "paddle" | "nub" | "feathers";
  bird?: boolean;
  belly?: boolean;
  neck: number; // where the neck meets the head, for collars (relative to head centre, y)
  // the body as one swept shape: stations along it (body-local x, y; the
  // radius; width and height of the section as factors of it)
  spine: Station[];
  fuzz: number; // how furry its outline is (tiles)
}
interface Station {
  x: number;
  y: number;
  r: number;
  sz?: number;
  sy?: number;
}

const PROFILES: Record<Species, Profile> = {
  // (docs/plan/52-the-pet-two.md D5: a dog, not a lion cub — a smaller head on a longer, slimmer body,
  // a deep chest and a tucked belly, longer legs, a longer muzzle with a stop)
  dog: {
    body: [0.25, 0.115, 0.1],
    up: 0.36,
    head: { r: 0.132, x: 0.31, y: 0.2, sx: 1.04, sy: 0.96, sz: 0.94 },
    legs: [
      { x: 0.16, z: 0.062, len: 0.3, r: 0.034 },
      { x: 0.16, z: -0.062, len: 0.3, r: 0.034 },
      { x: -0.16, z: 0.066, len: 0.3, r: 0.038 },
      { x: -0.16, z: -0.066, len: 0.3, r: 0.038 },
    ],
    ears: "floppy",
    muzzle: "snout",
    tail: "curl",
    belly: true,
    neck: -0.1,
    spine: [
      { x: -0.3, y: 0.01, r: 0.003 },
      { x: -0.26, y: 0.015, r: 0.085, sz: 0.95 },
      { x: -0.16, y: 0.025, r: 0.092, sz: 0.94 },
      { x: -0.05, y: 0.035, r: 0.085, sz: 0.9, sy: 0.88 },
      { x: 0.07, y: 0.0, r: 0.112, sz: 0.92, sy: 1.18 },
      { x: 0.17, y: 0.015, r: 0.112, sz: 0.9, sy: 1.12 },
      { x: 0.25, y: 0.08, r: 0.07 },
      { x: 0.29, y: 0.15, r: 0.05 },
      { x: 0.3, y: 0.19, r: 0.003 },
    ],
    fuzz: 0.006,
  },
  cat: {
    body: [0.2, 0.1, 0.095],
    up: 0.24,
    head: { r: 0.14, x: 0.25, y: 0.14 },
    legs: [
      { x: 0.12, z: 0.06, len: 0.2, r: 0.032 },
      { x: 0.12, z: -0.06, len: 0.2, r: 0.032 },
      { x: -0.12, z: 0.06, len: 0.2, r: 0.034 },
      { x: -0.12, z: -0.06, len: 0.2, r: 0.034 },
    ],
    ears: "pointy",
    muzzle: "small",
    tail: "long",
    neck: -0.08,
    spine: [
      { x: -0.25, y: 0, r: 0.003 },
      { x: -0.2, y: 0.01, r: 0.09 },
      { x: -0.08, y: 0.04, r: 0.105 },
      { x: 0.05, y: 0.02, r: 0.1 },
      { x: 0.15, y: 0, r: 0.105 },
      { x: 0.22, y: 0.04, r: 0.08 },
      { x: 0.28, y: 0.12, r: 0.055 },
      { x: 0.31, y: 0.16, r: 0.003 },
    ],
    fuzz: 0.007,
  },
  rabbit: {
    body: [0.16, 0.13, 0.11],
    up: 0.2,
    head: { r: 0.125, x: 0.17, y: 0.14 },
    legs: [
      { x: 0.09, z: 0.06, len: 0.12, r: 0.03 },
      { x: 0.09, z: -0.06, len: 0.12, r: 0.03 },
      { x: -0.08, z: 0.07, len: 0.14, r: 0.045 },
      { x: -0.08, z: -0.07, len: 0.14, r: 0.045 },
    ],
    ears: "long",
    muzzle: "small",
    tail: "puff",
    belly: true,
    neck: -0.08,
    spine: [
      { x: -0.22, y: -0.02, r: 0.003 },
      { x: -0.16, y: 0.02, r: 0.14 },
      { x: -0.05, y: 0.03, r: 0.13 },
      { x: 0.06, y: 0, r: 0.1 },
      { x: 0.14, y: 0.02, r: 0.09 },
      { x: 0.2, y: 0.08, r: 0.06 },
      { x: 0.22, y: 0.12, r: 0.003 },
    ],
    fuzz: 0.012,
  },
  platypus: {
    body: [0.21, 0.085, 0.15],
    up: 0.12,
    head: { r: 0.1, x: 0.22, y: 0.035, sy: 0.8 },
    legs: [
      { x: 0.13, z: 0.13, len: 0.06, r: 0.026 },
      { x: 0.13, z: -0.13, len: 0.06, r: 0.026 },
      { x: -0.13, z: 0.13, len: 0.06, r: 0.026 },
      { x: -0.13, z: -0.13, len: 0.06, r: 0.026 },
    ],
    ears: "none",
    muzzle: "bill",
    tail: "paddle",
    belly: true,
    neck: -0.06,
    spine: [
      { x: -0.3, y: -0.02, r: 0.003, sz: 1.3, sy: 0.7 },
      { x: -0.24, y: -0.01, r: 0.07, sz: 1.4, sy: 0.8 },
      { x: -0.1, y: 0, r: 0.085, sz: 1.7 },
      { x: 0.05, y: 0, r: 0.085, sz: 1.7 },
      { x: 0.16, y: 0, r: 0.075, sz: 1.5 },
      { x: 0.23, y: 0.01, r: 0.055, sz: 1.2 },
      { x: 0.27, y: 0.03, r: 0.003 },
    ],
    fuzz: 0.001,
  },
  capybara: {
    body: [0.26, 0.17, 0.15],
    up: 0.36,
    head: { r: 0.16, x: 0.3, y: 0.12, sx: 1.15, sy: 0.95 },
    legs: [
      { x: 0.16, z: 0.09, len: 0.28, r: 0.05 },
      { x: 0.16, z: -0.09, len: 0.28, r: 0.05 },
      { x: -0.16, z: 0.09, len: 0.28, r: 0.052 },
      { x: -0.16, z: -0.09, len: 0.28, r: 0.052 },
    ],
    ears: "round",
    muzzle: "blunt",
    tail: "nub",
    neck: -0.1,
    spine: [
      { x: -0.32, y: 0, r: 0.003 },
      { x: -0.27, y: 0, r: 0.16, sz: 0.95 },
      { x: -0.12, y: 0, r: 0.17 },
      { x: 0.05, y: 0, r: 0.17 },
      { x: 0.2, y: 0, r: 0.165 },
      { x: 0.3, y: 0.03, r: 0.13 },
      { x: 0.36, y: 0.08, r: 0.003 },
    ],
    fuzz: 0.005,
  },
  parrot: {
    body: [0.12, 0.17, 0.11],
    up: 0.3,
    head: { r: 0.12, x: 0.05, y: 0.25 },
    legs: [
      { x: 0.03, z: 0.05, len: 0.13, r: 0.016 },
      { x: 0.03, z: -0.05, len: 0.13, r: 0.016 },
    ],
    ears: "crest",
    muzzle: "beak",
    tail: "feathers",
    bird: true,
    belly: true,
    neck: -0.08,
    spine: [
      { x: 0, y: -0.2, r: 0.003 },
      { x: 0, y: -0.15, r: 0.08 },
      { x: 0.01, y: -0.05, r: 0.11 },
      { x: 0.03, y: 0.08, r: 0.1 },
      { x: 0.04, y: 0.18, r: 0.07 },
      { x: 0.05, y: 0.24, r: 0.003 },
    ],
    fuzz: 0.008,
  },
};

const INK = 0x2a1a12;
export const PET_SIZE = 1.35;
const CREAM = 0xf7f0de;

function shade(hex: string, k: number): Color {
  const c = new Color(hex);
  return c.multiplyScalar(k);
}
function mix(hex: string, other: number, t: number): Color {
  return new Color(hex).lerp(new Color(other), t);
}

export type MatFactory = (color: Color | number | string, o?: { flat?: boolean; glow?: boolean }) => Material;
export const plainMat: MatFactory = (color, o) => petMaterial(color, o);

// ── geometry helpers (shared, never disposed) ───────────────────────────────
const SPHERE = new SphereGeometry(1, 28, 20);
const SPHERE_LO = new SphereGeometry(1, 16, 12);
const CAPS = new Map<string, CapsuleGeometry>();
const capsule = (r: number, len: number) => {
  const k = `${r.toFixed(3)}|${len.toFixed(3)}`;
  let g = CAPS.get(k);
  if (!g) {
    g = new CapsuleGeometry(r, len, 6, 14);
    CAPS.set(k, g);
  }
  return g;
};
function ellipsoid(mat: Material, rx: number, ry: number, rz: number, lo = false): Mesh {
  const m = new Mesh(lo ? SPHERE_LO : SPHERE, mat);
  m.scale.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}

// One smooth shape swept along a curve through its stations (a body from
// rump to neck, a leg from hip to ankle): rings of an ellipse, the radius and
// its squash blended between stations, closed where the radius goes to nothing.
export function sweep(st: Station[], rings = 10, segs = 28): BufferGeometry {
  const pts = st.map((p) => new Vector3(p.x, p.y, 0));
  const curve = new CatmullRomCurve3(pts, false, "catmullrom", 0.5);
  const n = st.length;
  const N = rings * (n - 1);
  const dir = pts[n - 1].clone().sub(pts[0]);
  const ref = Math.abs(dir.y) > Math.abs(dir.x) ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const pos: number[] = [];
  const idx: number[] = [];
  const smooth = (w: number) => w * w * (3 - 2 * w);
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    const p = curve.getPoint(u);
    const t = curve.getTangent(u).normalize();
    const f = u * (n - 1);
    const i0 = Math.min(n - 2, Math.floor(f));
    const w = smooth(f - i0);
    const a = st[i0];
    const b = st[i0 + 1];
    const r = a.r + (b.r - a.r) * w;
    const sz = (a.sz ?? 1) + ((b.sz ?? 1) - (a.sz ?? 1)) * w;
    const sy = (a.sy ?? 1) + ((b.sy ?? 1) - (a.sy ?? 1)) * w;
    const bn = new Vector3().crossVectors(t, ref).normalize();
    const nm = new Vector3().crossVectors(bn, t).normalize();
    for (let j = 0; j < segs; j++) {
      const ang = (j / segs) * Math.PI * 2;
      const q = p
        .clone()
        .addScaledVector(nm, Math.cos(ang) * r * sy)
        .addScaledVector(bn, Math.sin(ang) * r * sz);
      pos.push(q.x, q.y, q.z);
    }
  }
  for (let k = 0; k < N; k++)
    for (let j = 0; j < segs; j++) {
      const a = k * segs + j;
      const b = k * segs + ((j + 1) % segs);
      const c = (k + 1) * segs + j;
      const d = (k + 1) * segs + ((j + 1) % segs);
      idx.push(a, c, b, b, c, d);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // wound the wrong way round (the frame's handedness): flip every triangle — judged over every
  // ring, not one vertex (a wide, short body fooled the one: a bulldog drawn inside out, docs/plan/52)
  const nrm = g.getAttribute("normal");
  let facing = 0;
  for (let k = 0; k <= N; k++) {
    const c = curve.getPoint(k / N);
    for (let j = 0; j < segs; j++) {
      const v = k * segs + j;
      facing +=
        (pos[v * 3] - c.x) * nrm.getX(v) + (pos[v * 3 + 1] - c.y) * nrm.getY(v) + (pos[v * 3 + 2] - c.z) * nrm.getZ(v);
    }
  }
  if (facing < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

// Three tones, as the illustrated people: the toon ramp the pets are lit with.
let rampTex: DataTexture | null = null;
function ramp(): DataTexture {
  if (rampTex) return rampTex;
  const t = new DataTexture(new Uint8Array([120, 196, 255]), 3, 1, RedFormat);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.needsUpdate = true;
  rampTex = t;
  return t;
}
// A warm rim light from behind the upper left, on any lit material.
const RIM = `
  vec3 rimDir = normalize( vViewPosition );
  float rim = pow( 1.0 - clamp( dot( normalize( normal ), rimDir ), 0.0, 1.0 ), 3.0 );
  outgoingLight += vec3( 1.0, 0.86, 0.62 ) * rim * 0.22 * diffuseColor.rgb * 2.2;
`;
export function rimPatch(m: Material) {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `${RIM}\n#include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ""}|pet-rim`;
  m.needsUpdate = true;
}
// A pet's material: toon-ramped, rim-lit (the room's light map is patched in by the view).
export function petMaterial(color: Color | number | string, o?: { glow?: boolean }): Material {
  const m = new MeshToonMaterial({ color, gradientMap: ramp(), emissive: o?.glow ? color : 0 });
  rimPatch(m);
  return m;
}

// An ink line round every part: a copy drawn with its back faces, pushed out
// by `INK_T` tiles on each axis — and fuzzed along the normal by noise for a
// furry edge (`fuzz` tiles; the platypus is sleek). Parts flagged `noOutline`
// (eyes, lids, whiskers, glints) keep clean.
const INK_T = 0.009;
const outlineMats = new Map<number, MeshBasicMaterial>();
function outlineMat(fuzz: number): MeshBasicMaterial {
  const key = Math.round(fuzz * 10000);
  let m = outlineMats.get(key);
  if (m) return m;
  m = new MeshBasicMaterial({ color: INK, side: BackSide });
  if (fuzz > 0) {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.fuzz = { value: fuzz };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float fuzz;
          float petHash( vec3 p ) { return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }
          float petNoise( vec3 p ) {
            vec3 i = floor( p ); vec3 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
            float a = petHash( i ), b = petHash( i + vec3( 1, 0, 0 ) ), c = petHash( i + vec3( 0, 1, 0 ) ), d = petHash( i + vec3( 1, 1, 0 ) );
            float e = petHash( i + vec3( 0, 0, 1 ) ), g = petHash( i + vec3( 1, 0, 1 ) ), h = petHash( i + vec3( 0, 1, 1 ) ), k = petHash( i + vec3( 1, 1, 1 ) );
            return mix( mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y ), mix( mix( e, g, f.x ), mix( h, k, f.x ), f.y ), f.z );
          }`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vec3 fuzzP = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
          float tuft = petNoise( fuzzP * 70.0 ) * 0.6 + petNoise( fuzzP * 160.0 ) * 0.4;
          transformed += normal * fuzz * max( 0.0, tuft - 0.35 ) * 2.2;`,
        );
    };
    m.customProgramCacheKey = () => `pet-outline-${key}`;
  }
  outlineMats.set(key, m);
  return m;
}
export function outline(root: Object3D, fuzz = 0) {
  const mat = outlineMat(fuzz);
  const targets: Mesh[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || m.userData.noOutline || m.userData.outline || !m.geometry) return;
    if (outlineMats.has(Math.round(fuzz * 10000)) && m.material === mat) return;
    targets.push(m);
  });
  for (const m of targets) {
    const g = m.geometry;
    g.computeBoundingBox();
    const bb = g.boundingBox;
    if (!bb) continue;
    const size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((v, i) => {
      const sc = i === 0 ? m.scale.x : i === 1 ? m.scale.y : m.scale.z;
      return Math.max(1e-4, v * Math.abs(sc));
    });
    // (too small to outline: whiskers, glints)
    if (Math.max(...size) < 0.02) continue;
    const o = new Mesh(g, m.userData.sleek ? outlineMat(0) : mat);
    o.scale.set(1 + (2 * INK_T) / size[0], 1 + (2 * INK_T) / size[1], 1 + (2 * INK_T) / size[2]);
    o.userData.outline = true;
    o.castShadow = false;
    o.receiveShadow = false;
    m.add(o);
  }
}

interface Snap {
  body: [Vector3, Vector3, Vector3];
  head: Vector3;
  root: [number, number];
  legs: [Vector3, number][];
  tail: Vector3;
  ears: Vector3[];
}

// Breeds (M4): the same species, shaped differently — ears, tail, fuzz, size.
interface Breed {
  ears?: Profile["ears"];
  earSize?: number; // × the ears (a chihuahua's, a sphynx's)
  tufts?: boolean; // hair tufts on pointy ears (a maine coon)
  tail?: Profile["tail"];
  fuzz?: number;
  size?: number; // the whole pet
  headR?: number; // × the head radius
  eyeR?: number; // × the eyes
  legLen?: number; // × the legs
  bodyR?: number; // × the body's radius
  bodyLen?: number; // × the body's length
  slope?: number; // the rump this much lower than the chest (a shepherd)
  muzzle?: "long" | "short" | "flat" | "fox"; // × the snout's length (fox: pointed, a shiba's)
  jowls?: boolean; // loose cheeks beside a flat muzzle (a bulldog)
  wrinkles?: boolean; // folds on the brow (a pug, a sphynx)
  crest?: number; // × the crest / tail feathers
  points?: boolean; // dark ears, tail and legs (a siamese)
  saddle?: boolean; // a dark back (a marked capybara, a shepherd)
  saddleK?: number; // how dark the saddle is (shade of the coat)
  preset?: "mask" | "tuxedo" | "dalmatian" | "rosettes" | "calico"; // a marking that paints itself
  eye?: string; // the breed's iris colour when the look sets none
  // (docs/plan/52 D5: silhouettes, not only colours)
  width?: number; // × the body's width (a bulldog's barrel)
  pompoms?: boolean; // a poodle's clip: puffs at the ankles and a topknot
  ruff?: boolean; // a thick ruff round the neck (a husky)
  feather?: boolean; // long feathered hair under the chest, the ears and the tail (a golden)
}
const MUZZLE_LEN = { long: 1.3, short: 0.72, flat: 0.42, fox: 1.12 } as const;
const BREED: Record<string, Breed> = {
  shiba: { ears: "pointy", earSize: 0.85, tail: "curl", fuzz: 0.008, muzzle: "fox", bodyR: 1.05, size: 0.9 },
  beagle: { ears: "floppy", earSize: 1.25, tail: "long", fuzz: 0.004, bodyLen: 1.05, legLen: 0.86, size: 0.9 },
  poodle: {
    ears: "floppy",
    tail: "puff",
    fuzz: 0.02,
    headR: 1.02,
    legLen: 1.18,
    bodyR: 0.9,
    pompoms: true,
    muzzle: "long",
  },
  corgi: {
    ears: "pointy",
    earSize: 1.35,
    tail: "nub",
    bodyLen: 1.22,
    bodyR: 1.08,
    legLen: 0.5,
    fuzz: 0.008,
    muzzle: "fox",
    eye: "#5b3a26",
  },
  dachshund: {
    ears: "floppy",
    earSize: 1.2,
    tail: "long",
    bodyLen: 1.45,
    bodyR: 0.9,
    legLen: 0.42,
    muzzle: "long",
    fuzz: 0.003,
  },
  husky: {
    ears: "pointy",
    tail: "curl",
    fuzz: 0.014,
    bodyR: 1.12,
    width: 1.08,
    legLen: 1.05,
    size: 1.1,
    ruff: true,
    preset: "mask",
    eye: "#4a7fb5",
  },
  golden: {
    ears: "floppy",
    tail: "long",
    fuzz: 0.016,
    bodyR: 1.06,
    legLen: 1.04,
    size: 1.1,
    feather: true,
    eye: "#5b3a26",
  },
  pug: {
    ears: "fold",
    tail: "curl",
    size: 0.84,
    headR: 1.14,
    bodyR: 1.1,
    legLen: 0.82,
    muzzle: "flat",
    wrinkles: true,
    fuzz: 0.003,
    eye: "#5b3a26",
  },
  bulldog: {
    ears: "fold",
    tail: "nub",
    bodyR: 1.25,
    width: 1.35,
    bodyLen: 0.88,
    legLen: 0.62,
    headR: 1.1,
    muzzle: "flat",
    jowls: true,
    fuzz: 0.002,
    eye: "#5b3a26",
  },
  dalmatian: {
    ears: "floppy",
    tail: "long",
    bodyR: 0.92,
    legLen: 1.1,
    fuzz: 0.003,
    preset: "dalmatian",
    eye: "#5b3a26",
  },
  chihuahua: {
    ears: "pointy",
    earSize: 1.8,
    tail: "curl",
    size: 0.6,
    headR: 1.32,
    bodyR: 0.86,
    muzzle: "short",
    eyeR: 1.3,
    legLen: 0.95,
    fuzz: 0.004,
  },
  shepherd: {
    ears: "pointy",
    earSize: 1.3,
    tail: "long",
    bodyLen: 1.1,
    legLen: 1.08,
    size: 1.12,
    slope: 0.1,
    muzzle: "long",
    saddle: true,
    saddleK: 0.3,
    fuzz: 0.009,
    eye: "#5b3a26",
  },
  tabby: {},
  siamese: { fuzz: 0.003, bodyR: 0.9, legLen: 1.1, points: true, eye: "#4a7fb5" },
  persian: { fuzz: 0.02, headR: 1.12, legLen: 0.8, tail: "puff", bodyR: 1.08, muzzle: "flat", eye: "#b5562f" },
  mainecoon: { size: 1.14, fuzz: 0.018, bodyR: 1.04, bodyLen: 1.08, tufts: true, eye: "#e8a33d" },
  sphynx: { fuzz: 0, earSize: 1.6, bodyR: 0.9, legLen: 1.06, wrinkles: true, eye: "#6e9b4a" },
  fold: { ears: "fold", headR: 1.1, bodyR: 1.04, fuzz: 0.009, eye: "#e8a33d" },
  calico: { fuzz: 0.008, preset: "calico", eye: "#6e9b4a" },
  tuxedo: { fuzz: 0.004, preset: "tuxedo", eye: "#6e9b4a" },
  bengal: { fuzz: 0.003, bodyR: 0.92, bodyLen: 1.08, legLen: 1.08, preset: "rosettes", eye: "#6e9b4a" },
  ragdoll: { fuzz: 0.017, bodyR: 1.06, points: true, eye: "#4a7fb5" },
  bombay: { fuzz: 0.002, bodyR: 0.96, eye: "#e8a33d" },
  british: { headR: 1.12, bodyR: 1.12, legLen: 0.84, fuzz: 0.008, eye: "#e8a33d" },
  lop: { ears: "floppy", fuzz: 0.012 },
  dwarf: { size: 0.82, headR: 1.12, fuzz: 0.014 },
  hare: { size: 1.12, bodyR: 0.9, legLen: 1.25, fuzz: 0.008 },
  young: { size: 0.82, headR: 1.1 },
  old: { fuzz: 0.004, bodyR: 1.06 },
  mottled: { fuzz: 0.002 },
  plain: {},
  marked: { saddle: true },
  shaggy: { fuzz: 0.013 },
  macaw: { crest: 0.7, bodyLen: 1.0 },
  cockatoo: { crest: 1.7, fuzz: 0.01 },
  budgie: { size: 0.8, crest: 0.5, headR: 1.1 },
};
export function breedProfile(species: Species, breed: string): Profile & { breed: Breed } {
  const base = PROFILES[species];
  const b = BREED[breed] ?? {};
  const len = b.bodyLen ?? 1;
  // (shorter legs: the body that much lower — it stood on air before, docs/plan/52 D5)
  const drop = base.legs[0].len * (1 - (b.legLen ?? 1));
  const pr: Profile & { breed: Breed } = {
    ...base,
    up: base.up - drop,
    ears: b.ears ?? base.ears,
    tail: b.tail ?? base.tail,
    fuzz: b.fuzz ?? base.fuzz,
    // (a longer body carries its head and legs further out)
    head: { ...base.head, r: base.head.r * (b.headR ?? 1), x: base.head.x * len },
    legs: base.legs.map((l) => ({ ...l, x: l.x * len, len: l.len * (b.legLen ?? 1) })),
    body: [base.body[0] * len, base.body[1], base.body[2] * (b.width ?? 1)],
    spine: base.spine.map((st) => ({
      ...st,
      x: st.x * len,
      y: st.y + (b.slope && st.x < 0 ? st.x * b.slope : 0),
      r: st.r * (b.bodyR ?? 1),
      sz: (st.sz ?? 1) * (b.width ?? 1),
    })),
    breed: b,
  };
  return pr;
}

// ── the model ───────────────────────────────────────────────────────────────
export class PetModel {
  readonly root = new Group(); // at the feet, facing +X
  private body = new Group(); // moves with breathing / bobs / lies down
  private bodyMesh: Mesh;
  private head = new Group(); // at the neck
  private headMesh: Mesh;
  private legs: { pivot: Group; len: number; mesh: Mesh }[] = [];
  private tail = new Group();
  private tailMesh: Mesh | null = null;
  private tailKind: Profile["tail"];
  private ears: Group[] = [];
  private eyes: {
    pupil: Group;
    white: Mesh;
    iris: Mesh;
    lidUp: Mesh;
    lidDown: Mesh;
    brow: Mesh;
    side: number;
    r: number;
  }[] = [];
  private cheeks: Mesh[] = [];
  private mouth: Mesh;
  private teeth: Mesh;
  private tongue: Mesh | null = null;
  // clothes with life (M4): a cape that flaps, a hat that tilts, a scarf that lags
  private cape: Mesh | null = null;
  private hat: Group | null = null;
  private scarfTail: Mesh | null = null;
  private capeLag = { x: 0, v: 0 };
  private hatLag = { x: 0, v: 0 };
  private carried = new Group();
  private carriedKind = "";
  private zs: Sprite[] = [];
  private wings: Mesh[] = [];
  private pr: Profile & { breed: Breed };
  private mats: Material[] = [];
  private bodyMats: (MeshLambertMaterial | MeshToonMaterial)[] = [];
  private baseColors = new Map<MeshLambertMaterial | MeshToonMaterial, Color>();
  private looked = 0;
  // weight (M2): how it's moving, lagging ears and tail, a landing squash, and
  // a cross-fade from the last pose kind
  private lastAt: Vector3 | null = null;
  private lastYaw = 0;
  private speed = 0;
  private turn = 0;
  private earLag = { x: 0, v: 0 };
  private tailLag = { x: 0, v: 0 };
  private squash = 0;
  private wasUp = 0;
  private lastKind: PoseKind | null = null;
  private blendFrom: Snap | null = null;
  private blendT = 1;
  private blendDur = 0.22;
  private gait = 0; // a dog's stride, 0..1, on the ground's pace
  private blinkAt = 0;
  private blinkUntil = 0;
  readonly height: number; // standing, to the top of the head
  readonly size: number; // the longer of its height and its length (to frame it)

  constructor(
    readonly species: Species,
    readonly look: PetLook,
    readonly outfit: PetOutfit,
    mat: MatFactory = plainMat,
    readonly name = "",
  ) {
    const pr = breedProfile(species, look.breed);
    this.pr = pr;
    this.tailKind = pr.tail;
    const M = (c: Color | number | string, o?: { flat?: boolean; glow?: boolean }) => {
      const m = mat(c, o);
      this.mats.push(m);
      if (m instanceof MeshLambertMaterial || m instanceof MeshToonMaterial) {
        this.bodyMats.push(m);
        this.baseColors.set(m, m.color.clone());
      }
      return m;
    };
    const coat = M(look.color);
    const dark = M(shade(look.color, 0.72));
    const pointsM = pr.breed.points ? M(shade(look.color, 0.38)) : coat; // a siamese's dark ends
    const light = M(mix(look.color, CREAM, 0.5));
    const ink = M(INK);
    const white = M(0xfffaf0);
    const pink = M(0xd98a8a);
    const markM = M(look.markColor);
    // the parts coloured on their own (a teal platypus with an orange bill…)
    const parts = look.parts ?? {};
    const partM = (k: keyof NonNullable<PetLook["parts"]>, fallback: Material) =>
      parts[k] ? M(parts[k] as string) : fallback;
    const eyeColor = look.eyeColor ?? pr.breed.eye;

    // body: one shape swept along its spine (rump to neck)
    const [bx, by, bz] = pr.body;
    this.body.position.y = pr.up;
    this.root.add(this.body);
    this.bodyMesh = new Mesh(sweep(pr.spine, 10, 32), coat);
    this.bodyMesh.castShadow = true;
    this.body.add(this.bodyMesh);
    if (pr.belly) {
      // a lighter underside, tucked just inside the sweep's lower half
      const belly = ellipsoid(partM("belly", light), bx * 0.66, by * 0.5, bz * 0.74, true);
      belly.position.set(pr.bird ? 0.015 : 0.0, pr.bird ? -0.02 : -by * 0.42, 0);
      belly.castShadow = false;
      belly.userData.noOutline = true;
      this.body.add(belly);
    }
    const h0 = pr.head;
    if (species === "capybara") {
      // a capybara is a slab: a rounded box inside the sweep squares it off
      const barrel = new Mesh(new RoundedBoxGeometry(bx * 1.9, by * 1.9, bz * 1.96, 6, by * 0.75), coat);
      barrel.castShadow = true;
      this.body.add(barrel);
    }
    if (species === "parrot") {
      const chest = ellipsoid(partM("belly", light), bx * 0.72, by * 0.62, bz * 0.8, true);
      chest.position.set(bx * 0.28, -by * 0.22, 0);
      chest.castShadow = false;
      chest.userData.noOutline = true;
      this.body.add(chest);
    }
    void h0;
    if (pr.breed.saddle) {
      const saddle = new Mesh(
        new SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45),
        pr.breed.saddleK ? M(shade(look.color, pr.breed.saddleK)) : dark,
      );
      saddle.scale.set(bx * 0.95, by * 1.08, bz * 1.06);
      saddle.position.x = -bx * 0.1;
      saddle.castShadow = false;
      saddle.userData.noOutline = true;
      this.body.add(saddle);
    }
    // markings on the back
    if (look.mark === "spots") {
      for (const [x, z, r] of [
        [-0.35, 0.3, 0.3],
        [0.25, -0.2, 0.26],
        [0.0, 0.55, 0.2],
        [-0.1, -0.6, 0.22],
      ] as const) {
        const s = ellipsoid(markM, bx * r, by * 0.16, bz * r * 1.1, true);
        s.position.set(bx * x, by * 0.9, bz * z);
        s.castShadow = false;
        this.body.add(s);
      }
    } else if (look.mark === "stripes") {
      for (const x of [-0.5, -0.1, 0.3]) {
        const ring = new Mesh(new TorusGeometry(by * 1.0, 0.014, 8, 28, Math.PI), markM);
        ring.scale.set(1, (bz * 1.02) / by, 1);
        ring.rotation.set(0, Math.PI / 2, 0);
        ring.position.set(bx * x, 0, 0);
        ring.castShadow = false;
        this.body.add(ring);
      }
    }

    // markings a breed brings with it
    const preset = pr.breed.preset;
    const stick = (m: Mesh) => {
      m.castShadow = false;
      m.userData.noOutline = true;
      this.body.add(m);
      return m;
    };
    if (preset === "dalmatian") {
      // small ink spots all over, no two alike
      let seed = 7;
      const rnd = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      for (let i = 0; i < 22; i++) {
        const a = rnd() * Math.PI * 2;
        const x = (rnd() - 0.5) * 1.8;
        const rr = 0.13 + rnd() * 0.12;
        const s = ellipsoid(markM, bx * rr, by * rr, bz * rr, true);
        s.position.set(bx * x, by * Math.sin(a) * 0.92, bz * Math.cos(a) * 0.92);
        stick(s);
      }
    } else if (preset === "rosettes") {
      // open rings along the flanks, a dark dot inside
      for (const side of [-1, 1])
        for (const [x, y] of [
          [-0.45, 0.25],
          [-0.05, 0.5],
          [0.3, 0.1],
          [-0.25, -0.2],
        ] as const) {
          const ring = new Mesh(new TorusGeometry(by * 0.16, 0.009, 6, 16), markM);
          ring.position.set(bx * x, by * y, side * bz * 0.96);
          ring.rotation.y = Math.PI / 2;
          stick(ring);
          const dot = ellipsoid(M(shade(look.color, 0.72)), by * 0.08, by * 0.08, 0.01, true);
          dot.position.copy(ring.position);
          stick(dot);
        }
    } else if (preset === "calico") {
      // three colours: the coat, an orange patch over the shoulder, a dark one on the rump
      const orange = ellipsoid(M(0xe8a33d), bx * 0.42, by * 0.7, bz * 0.95, true);
      orange.position.set(bx * 0.25, by * 0.42, bz * 0.12);
      orange.rotation.z = 0.2;
      stick(orange);
      const black = ellipsoid(M(0x2a2420), bx * 0.36, by * 0.62, bz * 0.9, true);
      black.position.set(-bx * 0.42, by * 0.4, -bz * 0.14);
      stick(black);
    } else if (preset === "tuxedo") {
      // a white chest and belly
      const bib = ellipsoid(white, bx * 0.5, by * 0.72, bz * 0.72, true);
      bib.position.set(bx * 0.62, -by * 0.36, 0);
      stick(bib);
    } else if (preset === "mask") {
      // a light underside; the face and legs get theirs below
      const under = ellipsoid(white, bx * 0.9, by * 0.7, bz * 0.82, true);
      under.position.set(0, -by * 0.4, 0);
      stick(under);
    }

    // legs: a pivot at the hip, a tapered shape down to the ankle, a paw
    for (const leg of pr.legs) {
      const pivot = new Group();
      pivot.position.set(leg.x, pr.up - by * 0.55, leg.z);
      const len = leg.len;
      const r = leg.r;
      const mesh = new Mesh(
        sweep(
          [
            { x: 0, y: r * 0.9, r: 0.003 },
            { x: 0, y: 0, r: r * 1.35 },
            { x: 0, y: -len * 0.4, r: r * 1.02 },
            { x: 0, y: -len * 0.8, r: r * 0.86 },
            { x: 0, y: -len + r * 0.5, r: r * 0.9 },
            { x: 0, y: -len + r * 0.1, r: 0.003 },
          ],
          6,
          20,
        ),
        pointsM,
      );
      mesh.castShadow = true;
      pivot.add(mesh);
      // paw pads (seen when it sits or rolls), a cat's claws
      if (!pr.bird) {
        const pad = ellipsoid(M(shade(look.color, 0.45)), r * 0.9, r * 0.25, r * 0.8, true);
        pad.position.set(r * 0.5, -len + r * 0.12, 0);
        pad.castShadow = false;
        pad.userData.noOutline = true;
        pivot.add(pad);
        if (species === "cat")
          for (const zz of [-0.5, 0, 0.5]) {
            const claw = new Mesh(new ConeGeometry(r * 0.12, r * 0.4, 6), M(CREAM));
            claw.rotation.z = -Math.PI / 2;
            claw.position.set(r * 1.6, -len + r * 0.3, zz * r);
            claw.userData.noOutline = true;
            pivot.add(claw);
          }
      }
      if (pr.breed.pompoms && !pr.bird) {
        // a poodle's clip: a puff round each ankle
        const puff = ellipsoid(coat, r * 2.1, r * 1.9, r * 2.1, true);
        puff.position.set(r * 0.2, -len + r * 2.2, 0);
        pivot.add(puff);
      }
      if (look.mark === "socks" || preset === "tuxedo" || preset === "mask") {
        const sock = new Mesh(capsule(r * 1.06, Math.max(0.01, len * 0.4 - r)), look.mark === "socks" ? markM : white);
        sock.position.y = -len + len * 0.2;
        pivot.add(sock);
      }
      // a paw (or a bird's foot)
      if (pr.bird) {
        const foot = new Mesh(new BoxGeometry(0.06, 0.012, 0.03), partM("feet", M(0x8a6a3a)));
        foot.position.set(0.012, -len, 0);
        pivot.add(foot);
      } else {
        const paw = ellipsoid(
          partM("feet", pr.muzzle === "bill" ? dark : preset === "tuxedo" || preset === "mask" ? white : coat),
          r * 1.35,
          r * 0.7,
          r * 1.25,
          true,
        );
        paw.position.set(r * 0.45, -len + r * 0.5, 0);
        pivot.add(paw);
        if (pr.muzzle === "bill") {
          // webbed: wider and flatter, ahead of the leg
          paw.scale.set(r * 1.9, r * 0.4, r * 1.6);
          paw.position.x = r * 1.3;
        }
      }
      this.root.add(pivot);
      this.legs.push({ pivot, len, mesh });
    }

    // head
    const h = pr.head;
    this.head.position.set(h.x - h.r * 0.5, h.y - h.r * 0.2, 0); // the neck
    this.body.add(this.head);
    this.headMesh = ellipsoid(coat, h.r * (h.sx ?? 1), h.r * (h.sy ?? 1), h.r * (h.sz ?? 1));
    this.headMesh.position.set(h.r * 0.5, h.r * 0.2, 0);
    this.head.add(this.headMesh);
    const hc = this.headMesh.position; // head centre in the head group
    if (pr.breed.pompoms) {
      // the topknot
      const knot = ellipsoid(coat, h.r * 0.62, h.r * 0.55, h.r * 0.6, true);
      knot.position.set(hc.x + h.r * 0.05, hc.y + h.r * 0.78, 0);
      this.head.add(knot);
    }
    if (pr.breed.ruff) {
      // a thick ruff round the neck, lighter underneath
      const ruff = ellipsoid(coat, h.r * 0.75, h.r * 1.05, h.r * 1.08, true);
      ruff.position.set(-h.r * 0.15, -h.r * 0.25, 0);
      this.head.add(ruff);
      const bib = ellipsoid(light, h.r * 0.5, h.r * 0.8, h.r * 0.8, true);
      bib.position.set(h.r * 0.1, -h.r * 0.55, 0);
      bib.castShadow = false;
      bib.userData.noOutline = true;
      this.head.add(bib);
    }
    if (pr.breed.feather) {
      // long hair hanging from the chest and the belly
      const fringe = ellipsoid(light, bx * 0.55, by * 0.38, bz * 0.7, true);
      fringe.position.set(bx * 0.3, -by * 0.85, 0);
      fringe.castShadow = false;
      this.body.add(fringe);
    }
    if (look.mark === "patch") {
      // round the right eye, flat on the head (the eye sits at fx, 0.2, 0.46 of r)
      const fx = pr.muzzle === "bill" ? 0.62 : pr.bird ? 0.6 : 0.72;
      const patch = ellipsoid(markM, h.r * 0.2, h.r * 0.42, h.r * 0.42, true);
      patch.position.set(hc.x + h.r * fx * 0.97, hc.y + h.r * 0.2, hc.z + h.r * (pr.bird ? 0.6 : 0.46) * 0.97);
      patch.rotation.y = 0.62;
      patch.castShadow = false;
      this.head.add(patch);
    }

    // muzzle
    const mz = new Group();
    mz.position.copy(hc);
    this.head.add(mz);
    const nose = (r: number, x: number, y: number) => {
      const n = ellipsoid(ink, r, r * 0.8, r * 1.1, true);
      n.position.set(x, y, 0);
      n.castShadow = false;
      mz.add(n);
    };
    // the snout's length (a dog's longer than the old round-faced one: docs/plan/52 D5)
    const ml = pr.breed.muzzle ? MUZZLE_LEN[pr.breed.muzzle] : species === "dog" ? 1.18 : 1;
    const dogFace = species === "dog";
    const fox = pr.breed.muzzle === "fox";
    const faceM = preset === "mask" || preset === "tuxedo" ? white : light;
    const snoutM = partM("bill", faceM);
    if (preset === "mask" || preset === "tuxedo") {
      // a white cap of the head over the face: up the brow for a mask, the chin for a tuxedo
      const cap = new Mesh(
        new SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * (preset === "mask" ? 0.34 : 0.36)),
        white,
      );
      cap.scale.set(h.r * (h.sx ?? 1) * 1.02, h.r * (h.sy ?? 1) * 1.02, h.r * (h.sz ?? 1) * 1.02);
      cap.rotation.z = -Math.PI / 2 - (preset === "mask" ? 0.42 : 0.6);
      cap.castShadow = false;
      cap.userData.noOutline = true;
      mz.add(cap);
    }
    if (preset === "dalmatian") {
      // a spot or two on the head as well
      for (const [x, y, z] of [
        [0.1, 0.55, 0.5],
        [-0.3, 0.3, -0.7],
      ] as const) {
        const sp = ellipsoid(markM, h.r * 0.24, h.r * 0.2, h.r * 0.22, true);
        sp.position.set(h.r * x, h.r * y, h.r * z);
        sp.castShadow = false;
        sp.userData.noOutline = true;
        mz.add(sp);
      }
    }
    if (pr.breed.jowls)
      for (const s of [-1, 1]) {
        const jowl = ellipsoid(snoutM, h.r * 0.3, h.r * 0.34, h.r * 0.24, true);
        jowl.position.set(h.r * 0.62, -h.r * 0.46, s * h.r * 0.42);
        jowl.castShadow = false;
        mz.add(jowl);
      }
    if (pr.breed.wrinkles)
      for (const y of [0.62, 0.78]) {
        const fold = new Mesh(new TorusGeometry(h.r * 0.5, 0.006, 6, 20, Math.PI * 0.7), M(shade(look.color, 0.6)));
        fold.position.set(h.r * 0.38, h.r * y, 0);
        fold.rotation.set(Math.PI / 2, 0, Math.PI * 0.65);
        fold.castShadow = false;
        fold.userData.noOutline = true;
        mz.add(fold);
      }
    switch (pr.muzzle) {
      case "snout": {
        // (a dog's: narrower, set below the skull — the stop — and a fox's tapering to the nose)
        const wide = ml < 1 ? 1.15 : dogFace ? (fox ? 0.78 : 0.88) : 1;
        const m = ellipsoid(
          snoutM,
          h.r * 0.62 * ml,
          h.r * 0.48 * (ml < 1 ? 1.1 : dogFace ? 0.86 : 1),
          h.r * 0.55 * wide,
        );
        m.position.set(h.r * (0.72 - (1 - ml) * 0.5), -h.r * (dogFace && ml >= 1 ? 0.3 : 0.22), 0);
        mz.add(m);
        if (dogFace && ml >= 1) {
          // the brow over the stop
          const brow = ellipsoid(coat, h.r * 0.42, h.r * 0.3, h.r * 0.62, true);
          brow.position.set(h.r * 0.56, h.r * 0.14, 0);
          brow.castShadow = false;
          brow.userData.noOutline = true;
          mz.add(brow);
        }
        nose(h.r * (fox ? 0.13 : 0.17), h.r * (1.3 - (1 - ml) * 0.72), -h.r * (dogFace && ml >= 1 ? 0.18 : 0.1));
        this.tongue = ellipsoid(pink, h.r * 0.14, h.r * 0.05, h.r * 0.1, true);
        this.tongue.position.set(h.r * (1.12 + Math.max(0, ml - 1) * 0.55), -h.r * 0.62, 0);
        this.tongue.visible = false;
        mz.add(this.tongue);
        break;
      }
      case "small": {
        const m = ellipsoid(snoutM, h.r * 0.42 * ml, h.r * 0.3, h.r * 0.42);
        m.position.set(h.r * (0.78 - (1 - ml) * 0.3), -h.r * 0.25, 0);
        mz.add(m);
        nose(h.r * 0.1, h.r * (1.15 - (1 - ml) * 0.35), -h.r * 0.15);
        // whiskers
        for (const s of [-1, 1])
          for (const a of [-0.25, 0, 0.25]) {
            const w = new Mesh(new CylinderGeometry(0.003, 0.003, h.r * 1.1, 4), ink);
            w.position.set(h.r * 0.95, -h.r * 0.25 + a * 0.3 * h.r, s * h.r * 0.55);
            w.rotation.set(Math.PI / 2, 0, (a * 0.8 + 0.2) * s);
            w.rotation.x = Math.PI / 2 + a;
            w.castShadow = false;
            w.userData.noOutline = true;
            mz.add(w);
          }
        break;
      }
      case "bill": {
        const billM = parts.bill ? M(parts.bill) : M(0x5f4a3a);
        const bill = new Mesh(new RoundedBoxGeometry(h.r * 1.6, h.r * 0.3, h.r * 1.45, 4, h.r * 0.14), billM);
        bill.position.set(h.r * 1.15, -h.r * 0.32, 0);
        bill.castShadow = true;
        mz.add(bill);
        const lip = new Mesh(
          new RoundedBoxGeometry(h.r * 1.45, h.r * 0.12, h.r * 1.3, 3, h.r * 0.06),
          parts.bill ? M(shade(parts.bill, 1.18)) : M(0x7b6049),
        );
        lip.position.set(h.r * 1.2, -h.r * 0.14, 0);
        mz.add(lip);
        for (const s of [-1, 1]) nose(h.r * 0.07, h.r * 1.95, -h.r * 0.12 + 0.001 * s);
        break;
      }
      case "blunt": {
        // a square muzzle
        const m = new Mesh(new RoundedBoxGeometry(h.r * 1.3, h.r * 1.1, h.r * 1.5, 5, h.r * 0.34), snoutM);
        m.position.set(h.r * 0.78, -h.r * 0.3, 0);
        m.castShadow = true;
        mz.add(m);
        nose(h.r * 0.2, h.r * 1.42, -h.r * 0.08);
        break;
      }
      case "beak": {
        const upper = new Mesh(new ConeGeometry(h.r * 0.4, h.r * 0.95, 14), partM("bill", M(0xe9d8b8)));
        upper.rotation.z = -Math.PI / 2;
        upper.rotation.x = 0;
        upper.position.set(h.r * 1.2, -h.r * 0.05, 0);
        upper.castShadow = true;
        mz.add(upper);
        const lower = new Mesh(new ConeGeometry(h.r * 0.25, h.r * 0.5, 10), M(0xd4bf98));
        lower.rotation.z = -Math.PI / 2 - 0.35;
        lower.position.set(h.r * 0.95, -h.r * 0.38, 0);
        mz.add(lower);
        break;
      }
    }
    // mouth (opens when it speaks / pants), with teeth behind the lip
    this.teeth = new Mesh(new BoxGeometry(h.r * 0.1, h.r * 0.06, h.r * 0.28), white);
    const reach = pr.muzzle === "snout" ? Math.max(0, ml - 1) * 0.55 : 0; // (a longer muzzle's mouth further out)
    this.teeth.position.set(
      h.r * (pr.muzzle === "bill" ? 1.6 : pr.muzzle === "beak" ? 1.0 : 1.08 + reach),
      -h.r * (pr.muzzle === "beak" ? 0.36 : 0.47),
      0,
    );
    this.teeth.visible = false;
    this.teeth.castShadow = false;
    this.teeth.userData.noOutline = true;
    if (!pr.bird && pr.muzzle !== "bill") mz.add(this.teeth);
    this.mouth = ellipsoid(ink, h.r * 0.16, h.r * 0.06, h.r * 0.2, true);
    this.mouth.position.set(
      h.r * (pr.muzzle === "bill" ? 1.6 : pr.muzzle === "beak" ? 1.0 : 1.05 + reach),
      -h.r * (pr.muzzle === "beak" ? 0.4 : 0.52),
      0,
    );
    this.mouth.visible = false;
    mz.add(this.mouth);

    // eyes
    const eyeR = h.r * (pr.bird ? 0.22 : 0.27) * (pr.breed.eyeR ?? 1);
    const irisM = eyeColor ? M(eyeColor) : ink;
    for (const side of [-1, 1]) {
      const g = new Group();
      const fx = pr.muzzle === "bill" ? 0.62 : pr.bird ? 0.6 : 0.72;
      g.position.set(hc.x + h.r * fx, hc.y + h.r * 0.2, hc.z + side * h.r * (pr.bird ? 0.6 : 0.46));
      g.rotation.y = side * 0.62;
      const whiteM = ellipsoid(white, eyeR, eyeR * 1.1, eyeR * 0.75, true);
      whiteM.castShadow = false;
      whiteM.userData.noOutline = true;
      // the pupil sits on the white and slides with the look
      const pupil = new Group();
      const iris = ellipsoid(irisM, eyeR * 0.58, eyeR * 0.66, eyeR * 0.4, true);
      iris.position.x = eyeR * 0.5;
      iris.castShadow = false;
      iris.userData.noOutline = true;
      if (eyeColor) {
        // a coloured iris round an ink pupil (in the iris' own scaled space)
        const dot = ellipsoid(ink, 0.56, 0.56, 1, true);
        dot.position.x = 0.32;
        dot.castShadow = false;
        dot.userData.noOutline = true;
        iris.add(dot);
      }
      const glint = ellipsoid(white, eyeR * 0.17, eyeR * 0.17, eyeR * 0.12, true);
      glint.position.set(eyeR * 0.86, eyeR * 0.28, -eyeR * 0.18);
      glint.castShadow = false;
      glint.userData.noOutline = true;
      pupil.add(iris, glint);
      // lids: caps of the eye in the coat's colour, the upper one coming down, the lower one up
      const lid = () => {
        const m = new Mesh(new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), coat);
        m.scale.set(eyeR * 1.1, eyeR * 1.2, eyeR * 0.86);
        m.rotation.z = Math.PI / 2; // open: the cap's pole points back into the head, out of sight
        m.castShadow = false;
        m.userData.noOutline = true;
        return m;
      };
      const lidUp = lid();
      const lidDown = lid();
      const brow = new Mesh(new BoxGeometry(eyeR * 0.3, eyeR * 0.32, eyeR * 1.6), ink);
      brow.position.set(eyeR * 0.5, eyeR * 1.5, 0);
      brow.visible = false;
      brow.castShadow = false;
      brow.userData.noOutline = true;
      g.add(whiteM, pupil, lidUp, lidDown, brow);
      this.head.add(g);
      this.eyes.push({ pupil, white: whiteM, iris, lidUp, lidDown, brow, side, r: eyeR });
      // a cheek that puffs when it's happy
      const cheek = ellipsoid(M(mix(look.color, 0xf0a0a0, 0.45)), h.r * 0.22, h.r * 0.16, h.r * 0.1, true);
      cheek.position.set(hc.x + h.r * (pr.bird ? 0.5 : 0.62), hc.y - h.r * 0.14, hc.z + side * h.r * 0.66);
      cheek.rotation.y = side * 0.7;
      cheek.castShadow = false;
      cheek.userData.noOutline = true;
      cheek.visible = false;
      this.head.add(cheek);
      this.cheeks.push(cheek);
    }

    // ears
    const inner = partM("ears", M(mix(look.color, 0xf0c8b8, 0.5)));
    const earK = pr.breed.earSize ?? 1;
    const earAt = (side: number, x: number, y: number, z: number) => {
      const e = new Group();
      e.position.set(hc.x + h.r * x, hc.y + h.r * y, hc.z + side * h.r * z);
      e.scale.setScalar(earK);
      this.head.add(e);
      this.ears.push(e);
      return e;
    };
    switch (pr.ears) {
      case "floppy":
        for (const side of [-1, 1]) {
          const e = earAt(side, -0.1, 0.55, 0.78);
          const flap = ellipsoid(dark, h.r * 0.28, h.r * 0.62, h.r * 0.14);
          flap.position.set(0, -h.r * 0.45, side * h.r * 0.1);
          flap.rotation.x = side * 0.25;
          e.add(flap);
        }
        break;
      case "pointy":
        for (const side of [-1, 1]) {
          const e = earAt(side, 0.05, 0.72, 0.52);
          const cone = new Mesh(new ConeGeometry(h.r * 0.3, h.r * 0.7, 10), coat);
          cone.position.y = h.r * 0.3;
          cone.rotation.z = -0.15;
          cone.rotation.x = side * 0.35;
          cone.castShadow = true;
          const in2 = new Mesh(new ConeGeometry(h.r * 0.17, h.r * 0.5, 8), inner);
          in2.position.set(h.r * 0.06, h.r * 0.28, 0);
          in2.rotation.z = -0.15;
          in2.rotation.x = side * 0.35;
          e.add(cone, in2);
          if (pr.breed.tufts) {
            // a wisp of hair off the tip
            const tuft = new Mesh(new ConeGeometry(h.r * 0.07, h.r * 0.3, 6), light);
            tuft.position.set(-h.r * 0.02, h.r * 0.74, 0);
            tuft.rotation.z = -0.3;
            tuft.rotation.x = side * 0.35;
            tuft.userData.noOutline = true;
            e.add(tuft);
          }
        }
        break;
      case "long":
        for (const side of [-1, 1]) {
          const e = earAt(side, -0.05, 0.75, 0.38);
          const ear = ellipsoid(coat, h.r * 0.2, h.r * 0.85, h.r * 0.1);
          ear.position.y = h.r * 0.7;
          ear.rotation.z = -0.2;
          ear.rotation.x = side * 0.3;
          const in2 = ellipsoid(inner, h.r * 0.11, h.r * 0.62, h.r * 0.05, true);
          in2.position.set(h.r * 0.08, h.r * 0.7, 0);
          in2.rotation.z = -0.2;
          in2.rotation.x = side * 0.3;
          in2.castShadow = false;
          e.add(ear, in2);
        }
        break;
      case "round":
        for (const side of [-1, 1]) {
          const e = earAt(side, -0.1, 0.72, 0.62);
          const ear = ellipsoid(coat, h.r * 0.22, h.r * 0.22, h.r * 0.12, true);
          const in2 = ellipsoid(inner, h.r * 0.12, h.r * 0.12, h.r * 0.05, true);
          in2.position.x = h.r * 0.1;
          in2.castShadow = false;
          e.add(ear, in2);
        }
        break;
      case "fold":
        // small flaps folded forward over the head
        for (const side of [-1, 1]) {
          const e = earAt(side, 0.0, 0.7, 0.6);
          const flap = ellipsoid(dark, h.r * 0.26, h.r * 0.2, h.r * 0.14);
          flap.position.set(h.r * 0.08, h.r * 0.02, 0);
          flap.rotation.x = side * 0.5;
          flap.rotation.z = -0.35;
          e.add(flap);
        }
        break;
      case "crest":
        for (let i = 0; i < 3; i++) {
          const e = earAt(0, -0.1 - i * 0.18, 0.75, 0);
          const ck = pr.breed.crest ?? 1;
          const f = new Mesh(new ConeGeometry(h.r * 0.14 * ck, h.r * (0.8 + i * 0.15) * ck, 8), i === 1 ? light : dark);
          f.position.y = h.r * 0.35;
          f.rotation.z = 0.45 + i * 0.3;
          f.castShadow = true;
          e.add(f);
        }
        break;
      case "none":
        break;
    }

    // tail
    // (a dog's set high on the rump, where it shows what it feels)
    this.tail.position.set(-bx * 0.92, by * (species === "dog" ? 0.42 : 0.1), 0);
    this.body.add(this.tail);
    switch (pr.tail) {
      case "curl": {
        const curve = new CatmullRomCurve3([
          new Vector3(0, 0, 0),
          new Vector3(-0.08, 0.1, 0.01),
          new Vector3(-0.06, 0.22, 0.03),
          new Vector3(0.04, 0.27, 0.04),
          new Vector3(0.1, 0.2, 0.05),
        ]);
        this.tailMesh = new Mesh(new TubeGeometry(curve, 16, 0.03, 10, false), coat);
        break;
      }
      case "long": {
        const curve = new CatmullRomCurve3([
          new Vector3(0, 0, 0),
          new Vector3(-0.14, 0.03, 0.02),
          new Vector3(-0.22, 0.14, 0.03),
          new Vector3(-0.2, 0.3, 0.02),
        ]);
        this.tailMesh = new Mesh(new TubeGeometry(curve, 16, pr.breed.feather ? 0.036 : 0.024, 10, false), coat);
        break;
      }
      case "puff":
        this.tailMesh = ellipsoid(light, 0.06, 0.06, 0.06, true);
        this.tailMesh.position.set(-0.03, 0.02, 0);
        break;
      case "paddle":
        this.tailMesh = new Mesh(new RoundedBoxGeometry(0.26, 0.045, 0.2, 4, 0.02), dark);
        this.tailMesh.position.set(-0.14, -0.02, 0);
        break;
      case "feathers":
        for (const [i, zz] of [-0.035, 0, 0.035].entries()) {
          const fk = pr.breed.crest ?? 1;
          const f = new Mesh(
            new RoundedBoxGeometry(0.22 * (0.6 + fk * 0.5), 0.016, 0.045, 2, 0.008),
            i === 1 ? coat : dark,
          );
          f.position.set(-0.14, -0.1, zz);
          f.rotation.z = 0.55;
          f.castShadow = true;
          this.tail.add(f);
        }
        break;
      case "nub":
        break;
    }
    if (this.tailMesh) {
      this.tailMesh.castShadow = true;
      if (pr.breed.points) this.tailMesh.material = pointsM;
      if (parts.tail) this.tailMesh.material = M(parts.tail);
      this.tail.add(this.tailMesh);
      // a lighter tip on a curled or long tail
      if (pr.tail === "curl" || pr.tail === "long") {
        const tip = ellipsoid(
          parts.tail ? M(shade(parts.tail, 1.2)) : pr.breed.points ? pointsM : light,
          0.035,
          0.035,
          0.035,
          true,
        );
        tip.position.set(pr.tail === "curl" ? 0.1 : -0.2, pr.tail === "curl" ? 0.2 : 0.3, 0.05);
        tip.castShadow = false;
        this.tail.add(tip);
      }
    }

    // wings
    if (pr.bird) {
      for (const side of [-1, 1]) {
        const w = ellipsoid(dark, bx * 0.75, by * 0.82, bz * 0.3);
        w.position.set(-bx * 0.15, by * 0.02, side * bz * 0.92);
        w.rotation.x = side * 0.12;
        w.rotation.z = 0.35;
        this.body.add(w);
        this.wings.push(w);
        const tip = ellipsoid(M(shade(look.color, 0.55)), bx * 0.3, by * 0.4, bz * 0.18, true);
        tip.position.set(-bx * 0.55, -by * 0.5, side * bz * 0.95);
        tip.rotation.z = 0.55;
        this.body.add(tip);
        const ring = ellipsoid(white, h.r * 0.34, h.r * 0.34, h.r * 0.12, true);
        ring.position.set(hc.x + h.r * 0.58, hc.y + h.r * 0.2, hc.z + side * h.r * 0.58);
        ring.rotation.y = side * 0.62;
        ring.castShadow = false;
        this.head.add(ring);
      }
    }

    // clothes
    this.dress(M, hc, h.r, bx, by, bz);

    // what it carries, in its mouth
    this.carried.position.set(hc.x + h.r * 1.2, hc.y - h.r * 0.45, 0);
    this.head.add(this.carried);

    // Z's for sleeping
    for (let i = 0; i < 3; i++) {
      const s = new Sprite(zMaterial());
      s.scale.set(0.12, 0.12, 1);
      s.visible = false;
      this.root.add(s);
      this.zs.push(s);
    }

    // ink outlines, as the people and the items have: a back-faced copy of
    // each part, a hair bigger (the same thickness whatever the part's size)
    outline(this.root, pr.fuzz);
    // pets read bigger than life next to the people (a dog comes up to the thigh)
    const sz = PET_SIZE * (pr.breed.size ?? 1);
    this.root.scale.setScalar(sz);
    this.height = (pr.up + h.y + h.r * 1.4) * sz;
    this.size = Math.max(this.height, (bx + h.x + h.r * 1.6) * sz);
    this.root.traverse((o) => {
      o.frustumCulled = false;
    });
  }

  private dress(
    M: (c: Color | number | string) => Material,
    hc: Vector3,
    r: number,
    bx: number,
    by: number,
    bz: number,
  ) {
    const o = this.outfit;
    const pr = this.pr;
    if (o.hat !== "none") {
      const c = M(o.hatColor);
      const d = M(shade(o.hatColor, 0.78));
      const hat = new Group();
      hat.position.set(hc.x, hc.y + r * 0.8, hc.z);
      this.head.add(hat);
      this.hat = hat;
      switch (o.hat) {
        case "cap": {
          const dome = new Mesh(new SphereGeometry(r * 0.72, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), c);
          dome.position.y = -r * 0.05;
          const brim = new Mesh(
            new CylinderGeometry(r * 0.5, r * 0.5, r * 0.06, 16, 1, false, -Math.PI / 2, Math.PI),
            d,
          );
          brim.position.set(r * 0.5, -r * 0.05, 0);
          brim.scale.set(1.3, 1, 1);
          hat.add(dome, brim);
          break;
        }
        case "bow": {
          for (const s of [-1, 1]) {
            const loop = new Mesh(new ConeGeometry(r * 0.26, r * 0.5, 10), c);
            loop.rotation.x = (s * Math.PI) / 2;
            loop.position.set(0, r * 0.15, s * r * 0.3);
            hat.add(loop);
          }
          const knot = ellipsoid(d, r * 0.14, r * 0.14, r * 0.14, true);
          knot.position.y = r * 0.15;
          hat.add(knot);
          break;
        }
        case "crown": {
          const gold = M(0xe8c94a);
          const band = new Mesh(new CylinderGeometry(r * 0.55, r * 0.5, r * 0.3, 8, 1, true), gold);
          (band.material as Material).side = DoubleSide;
          band.position.y = r * 0.1;
          hat.add(band);
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const pt = new Mesh(new ConeGeometry(r * 0.12, r * 0.3, 6), gold);
            pt.position.set(Math.cos(a) * r * 0.5, r * 0.38, Math.sin(a) * r * 0.5);
            hat.add(pt);
          }
          const gem = ellipsoid(M(0xc4402b), r * 0.08, r * 0.08, r * 0.08, true);
          gem.position.set(r * 0.52, r * 0.12, 0);
          hat.add(gem);
          break;
        }
        case "party": {
          const cone = new Mesh(new ConeGeometry(r * 0.42, r * 1.3, 18), c);
          cone.position.y = r * 0.55;
          const pom = ellipsoid(M(0xe8a33d), r * 0.13, r * 0.13, r * 0.13, true);
          pom.position.y = r * 1.22;
          hat.add(cone, pom);
          break;
        }
        case "beanie": {
          const dome = new Mesh(new SphereGeometry(r * 0.8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), c);
          dome.position.y = -r * 0.12;
          const band = new Mesh(new TorusGeometry(r * 0.76, r * 0.1, 8, 24), d);
          band.rotation.x = Math.PI / 2;
          band.position.y = -r * 0.08;
          const pom = ellipsoid(M(CREAM), r * 0.16, r * 0.16, r * 0.16, true);
          pom.position.y = r * 0.72;
          hat.add(dome, band, pom);
          break;
        }
        case "fedora": {
          // a brim with a pinched crown and a band, worn low over the eyes
          const brim = new Mesh(new CylinderGeometry(r * 0.98, r * 0.98, r * 0.05, 24), c);
          brim.scale.set(1.1, 1, 1);
          brim.rotation.z = -0.12; // dipped at the front
          const crown = new Mesh(new CylinderGeometry(r * 0.46, r * 0.6, r * 0.52, 20), c);
          crown.scale.set(1.08, 1, 0.88);
          crown.position.y = r * 0.26;
          const top = new Mesh(new SphereGeometry(r * 0.46, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), c);
          top.scale.set(1.08, 0.5, 0.88);
          top.position.y = r * 0.52;
          // the pinch: a crease each side of the front of the crown
          for (const s of [-1, 1]) {
            const crease = new Mesh(new BoxGeometry(r * 0.3, r * 0.3, r * 0.05), d);
            crease.position.set(r * 0.32, r * 0.48, s * r * 0.3);
            crease.rotation.y = s * 0.45;
            crease.rotation.z = -0.2;
            crease.userData.noOutline = true;
            hat.add(crease);
          }
          const band = new Mesh(new CylinderGeometry(r * 0.615, r * 0.615, r * 0.12, 20), M(0x2a2420));
          band.position.y = r * 0.06;
          hat.add(brim, crown, top, band);
          hat.position.y -= r * (pr.muzzle === "bill" ? 0.3 : 0.12);
          hat.position.x += r * 0.08;
          hat.rotation.z = -0.14;
          break;
        }
        case "tophat": {
          const top = new Mesh(new CylinderGeometry(r * 0.5, r * 0.52, r * 0.9, 20), c);
          top.position.y = r * 0.45;
          const brim = new Mesh(new CylinderGeometry(r * 0.85, r * 0.85, r * 0.06, 24), c);
          const ribbon = new Mesh(new CylinderGeometry(r * 0.53, r * 0.53, r * 0.14, 20), M(0xc4402b));
          ribbon.position.y = r * 0.1;
          hat.add(top, brim, ribbon);
          break;
        }
      }
      hat.traverse((m) => {
        m.castShadow = true;
      });
    }
    if (o.collar !== "none" && !pr.bird) {
      const c = M(o.collarColor);
      const neck = new Group();
      neck.position.set(hc.x - r * 0.35, hc.y + pr.neck, hc.z);
      this.head.add(neck);
      const ring = (tube: number) => {
        const t = new Mesh(new TorusGeometry(r * 0.78, tube, 8, 28), c);
        t.rotation.x = Math.PI / 2;
        t.rotation.z = 0.15;
        t.scale.set(1, 1.1, 1);
        return t;
      };
      switch (o.collar) {
        case "collar": {
          neck.add(ring(r * 0.09));
          // a name tag, engraved
          const tag = new Mesh(new CylinderGeometry(r * 0.17, r * 0.17, r * 0.03, 16), M(0xe8c94a));
          tag.rotation.z = Math.PI / 2;
          tag.position.set(r * 0.74, -r * 0.14, 0);
          neck.add(tag);
          if (this.name) {
            const label = new Mesh(new PlaneGeometry(r * 0.3, r * 0.3), nameTagMaterial(this.name));
            label.position.set(r * 0.76, -r * 0.14, 0);
            label.rotation.y = Math.PI / 2;
            label.userData.noOutline = true;
            neck.add(label);
          }
          break;
        }
        case "bell": {
          neck.add(ring(r * 0.08));
          const bell = ellipsoid(M(0xe8a33d), r * 0.14, r * 0.14, r * 0.14, true);
          bell.position.set(r * 0.72, -r * 0.1, 0);
          neck.add(bell);
          break;
        }
        case "bandana": {
          neck.add(ring(r * 0.07));
          const tri = new Mesh(new ConeGeometry(r * 0.6, r * 0.9, 3), c);
          tri.rotation.set(0, Math.PI / 6, Math.PI);
          tri.position.set(r * 0.55, -r * 0.5, 0);
          tri.scale.set(1, 1, 0.25);
          neck.add(tri);
          break;
        }
        case "bowtie": {
          neck.add(ring(r * 0.05));
          for (const s of [-1, 1]) {
            const loop = new Mesh(new ConeGeometry(r * 0.2, r * 0.42, 8), c);
            loop.rotation.x = (s * Math.PI) / 2;
            loop.position.set(r * 0.75, -r * 0.05, s * r * 0.24);
            neck.add(loop);
          }
          const knot = ellipsoid(M(shade(o.collarColor, 0.7)), r * 0.1, r * 0.1, r * 0.1, true);
          knot.position.set(r * 0.78, -r * 0.05, 0);
          neck.add(knot);
          break;
        }
        case "scarf": {
          neck.add(ring(r * 0.14));
          const tail = new Mesh(new RoundedBoxGeometry(r * 0.26, r * 0.7, r * 0.1, 2, r * 0.04), c);
          tail.position.set(r * 0.62, -r * 0.42, r * 0.2);
          tail.rotation.z = 0.2;
          neck.add(tail);
          this.scarfTail = tail;
          break;
        }
      }
      neck.traverse((m) => {
        m.castShadow = true;
      });
    }
    if (o.coat !== "none") {
      const c = M(o.coatColor);
      const d = M(shade(o.coatColor, 0.78));
      if (o.coat === "cape") {
        const cape = new Mesh(new PlaneGeometry(bz * 2.4, by * 2.6, 4, 6), c);
        (cape.material as Material).side = DoubleSide;
        cape.position.set(-bx * 0.7, by * 0.3, 0);
        cape.rotation.y = Math.PI / 2;
        cape.rotation.x = -0.35;
        cape.castShadow = true;
        this.body.add(cape);
        this.cape = cape;
        const clasp = ellipsoid(M(0xe8c94a), 0.025, 0.025, 0.025, true);
        clasp.position.set(bx * 0.2, by * 0.95, 0);
        this.body.add(clasp);
      } else {
        // a shell over the back and sides, open under the belly
        const shell = new Mesh(new SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), c);
        shell.scale.set(bx * 1.08, by * 1.1, bz * 1.1);
        shell.castShadow = true;
        this.body.add(shell);
        if (o.coat === "sweater" || o.coat === "jersey") {
          const hem = new Mesh(new TorusGeometry(1, 0.06, 6, 28), d);
          hem.scale.set(bx * 0.95, bz * 1.08, 1);
          hem.rotation.x = Math.PI / 2;
          hem.position.y = -by * 0.3;
          hem.castShadow = false;
          this.body.add(hem);
        }
        if (o.coat === "jersey") {
          const stripe = new Mesh(new TorusGeometry(1, 0.03, 6, 28, Math.PI), M(CREAM));
          stripe.scale.set(by * 1.12, bz * 1.12, 1);
          stripe.rotation.y = Math.PI / 2;
          stripe.castShadow = false;
          this.body.add(stripe);
        }
        if (o.coat === "raincoat") {
          for (const x of [0.2, -0.2]) {
            const btn = ellipsoid(M(CREAM), 0.016, 0.016, 0.01, true);
            btn.position.set(bx * x, by * 1.1, 0);
            btn.castShadow = false;
            this.body.add(btn);
          }
        }
        if (o.coat === "hoodie" || o.coat === "raincoat") {
          const hood = new Mesh(
            new SphereGeometry(r * 0.95, 20, 12, Math.PI * 0.6, Math.PI * 1.3, 0, Math.PI * 0.6),
            d,
          );
          (hood.material as Material).side = DoubleSide;
          hood.position.set(hc.x - r * 0.3, hc.y + r * 0.1, hc.z);
          hood.rotation.y = Math.PI;
          hood.castShadow = true;
          this.head.add(hood);
        }
      }
    }
  }

  // ── posing ────────────────────────────────────────────────────────────────
  // `dt` in seconds for the eased bits (the head turning, blinking); pass 0
  // to land exactly on the pose (the iso renderer).
  pose(p: PoseIn, dt = 0, now = 0) {
    const pr = this.pr;
    const [bx, by] = pr.body;
    const t = p.t;
    const TAU = Math.PI * 2;
    // how it moved since the last frame (the view places the root after posing)
    if (dt > 0) {
      const at = this.root.position;
      if (this.lastAt) {
        const d = Math.hypot(at.x - this.lastAt.x, at.z - this.lastAt.z);
        const v = d > 1.5 ? 0 : d / dt;
        this.speed += (v - this.speed) * Math.min(1, dt * 10);
        let dy = this.root.rotation.y - this.lastYaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const tr = Math.abs(dy) > 2 ? 0 : dy / dt;
        this.turn += (tr - this.turn) * Math.min(1, dt * 10);
      } else this.lastAt = new Vector3();
      this.lastAt.copy(at);
      this.lastYaw = this.root.rotation.y;
      if (this.lastKind && this.lastKind !== p.kind) {
        this.blendFrom = this.snap();
        this.blendT = 0;
        this.blendDur = LOW.has(p.kind) || LOW.has(this.lastKind) ? 0.5 : 0.22;
      }
      this.lastKind = p.kind;
    }
    // reset
    this.body.position.set(0, pr.up, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    this.root.rotation.set(0, 0, 0);
    this.root.position.y = 0;
    this.head.rotation.set(0, 0, 0);
    for (const l of this.legs) {
      l.pivot.rotation.set(0, 0, 0);
      l.pivot.scale.set(1, 1, 1);
    }
    this.tail.rotation.set(0, 0, 0);
    for (const e of this.ears) e.rotation.set(0, 0, 0);
    for (const w of this.wings) w.rotation.set(0, 0, 0);
    let lying = false;
    let mouthOpen = 0;
    let eyes: Face3 = p.face;
    let wag = 0.35 + (eyes === "happy" ? 0.5 : 0);
    let wagSpeed = 1;
    let legsTucked = false;
    const legSwing = (amp: number, phase: number) => {
      // diagonal pairs together: front-left with back-right
      this.legs.forEach((l, i) => {
        const s = i === 0 || i === 3 ? 1 : -1;
        l.pivot.rotation.z = Math.sin(phase * TAU) * amp * s;
      });
    };
    switch (p.kind) {
      case "idle": {
        this.body.scale.y = 1 + Math.sin(t * TAU) * 0.02;
        this.body.position.y += Math.sin(t * TAU) * 0.004;
        break;
      }
      case "walk": {
        wagSpeed = 2;
        switch (this.species) {
          case "cat":
            // a slink: low, smooth, the tail up, the head forward
            legSwing(0.42, t);
            this.body.position.y -= 0.03;
            this.body.rotation.z = Math.sin(t * TAU) * 0.015;
            this.head.rotation.z = 0.12;
            this.tail.rotation.z = 0.55;
            wag = 0.15;
            break;
          case "rabbit": {
            // hops: both front paws together, both hind feet together
            const k = Math.max(0, Math.sin(t * TAU));
            this.root.position.y = k * 0.09;
            this.body.rotation.z = -k * 0.3;
            for (const [i, l] of this.legs.entries()) l.pivot.rotation.z = i < 2 ? -0.7 * k + 0.2 : 0.9 * k - 0.3;
            this.head.rotation.z = -k * 0.15;
            break;
          }
          case "platypus":
            // a waddle: the body rolls with each step, the feet out to the sides
            legSwing(0.5, t);
            this.body.rotation.x = Math.sin(t * TAU) * 0.16;
            this.body.rotation.y = Math.sin(t * TAU) * 0.08;
            this.head.rotation.y = -Math.sin(t * TAU) * 0.12;
            for (const l of this.legs) l.pivot.rotation.x = Math.sign(l.pivot.position.z) * 0.35;
            break;
          case "capybara":
            // a plod: slow, heavy, hardly any bounce
            legSwing(0.38, t);
            this.body.position.y += Math.abs(Math.sin(t * TAU * 2)) * 0.006;
            this.body.rotation.z = Math.sin(t * TAU) * 0.02;
            this.head.rotation.z = Math.sin(t * TAU * 2) * 0.03 + 0.05;
            break;
          case "parrot":
            // a bob, the head leading, the wings lifting on every other step
            legSwing(0.5, t);
            this.body.position.y += Math.abs(Math.sin(t * TAU * 2)) * 0.012;
            this.head.rotation.z = Math.sin(t * TAU * 2 + 0.8) * 0.18;
            this.body.rotation.z = Math.sin(t * TAU * 2) * 0.05;
            for (const w of this.wings) w.rotation.x += Math.max(0, Math.sin(t * TAU)) * 0.35 * Math.sign(w.position.z);
            break;
          case "dog": {
            // its gaits by how fast it's going (docs/plan/52 D5): a walk, a trot, a gallop — the legs on
            // the ground's pace (a stride by its legs' length), not on a clock; into a turn, the body bends
            const sp = p.speed ?? this.speed;
            const leg = this.legs[0]?.len ?? 0.3;
            const gait = sp < 1.8 ? 0 : sp < 5.4 ? 1 : 2;
            const stride = leg * (gait === 0 ? 4.2 : gait === 1 ? 6 : 8.5); // tiles a cycle
            if (dt > 0 && sp > 0.05) this.gait = (this.gait + (sp * dt) / stride) % 1;
            const ph = dt > 0 ? this.gait : t;
            const up = pr.up;
            if (gait === 0) {
              // four beats: each foot in turn
              const off = [0.25, 0.75, 0, 0.5];
              for (const [i, l] of this.legs.entries()) l.pivot.rotation.z = Math.sin((ph + off[i]) * TAU) * 0.3;
              this.body.position.y += Math.abs(Math.sin(ph * TAU * 2)) * up * 0.012;
              this.head.rotation.z = Math.sin(ph * TAU * 2) * 0.04 + 0.06;
              wagSpeed = 1.2;
            } else if (gait === 1) {
              // a trot: diagonal pairs, a bounce on every step
              legSwing(0.55, ph);
              this.body.position.y += Math.abs(Math.sin(ph * TAU * 2)) * up * 0.045;
              this.body.rotation.z = Math.sin(ph * TAU) * 0.03;
              this.head.rotation.z = Math.sin(ph * TAU * 2) * 0.05;
              this.tail.rotation.z = 0.25;
              wagSpeed = 2;
            } else {
              // a gallop: the forelegs together, then the hind; the back flexing; a moment off the ground
              const fore = Math.sin(ph * TAU);
              const hind = Math.sin((ph + 0.45) * TAU);
              for (const [i, l] of this.legs.entries())
                l.pivot.rotation.z =
                  (i < 2 ? Math.sin((ph + i * 0.06) * TAU) : Math.sin((ph + 0.45 + (i - 2) * 0.06) * TAU)) * 0.85;
              this.body.rotation.z = Math.sin((ph + 0.2) * TAU) * 0.14;
              this.body.position.y += Math.max(0, Math.sin(ph * TAU * 2 + 0.6)) * up * 0.08;
              this.head.rotation.z = -Math.sin((ph + 0.2) * TAU) * 0.1 + 0.08;
              this.tail.rotation.z = 0.05 + (fore - hind) * 0.05;
              wag = 0.15;
            }
            const bend = Math.max(-0.35, Math.min(0.35, this.turn * 0.12));
            this.body.rotation.y += bend * 0.5;
            this.head.rotation.y += bend;
            break;
          }
          default:
            // a trot: diagonal pairs, a bounce on every step
            legSwing(0.55, t);
            this.body.position.y += Math.abs(Math.sin(t * TAU * 2)) * 0.015;
            this.body.rotation.z = Math.sin(t * TAU) * 0.03;
            this.head.rotation.z = Math.sin(t * TAU * 2) * 0.05;
            this.tail.rotation.z = 0.25;
            break;
        }
        break;
      }
      case "sit":
      case "lesson": {
        // the rear sinks, the back legs fold flat, the front ones stay straight
        this.body.rotation.z = 0.5;
        this.body.position.y -= by * 0.55;
        this.body.position.x -= bx * 0.1;
        const dogSit = this.species === "dog"; // (its longer forelegs straight under it: docs/plan/52)
        for (const [i, l] of this.legs.entries()) {
          if (i >= 2) {
            l.pivot.rotation.z = -1.4;
            l.pivot.position.y = pr.up - by * 0.55 - by * 0.5;
          } else {
            l.pivot.rotation.z = dogSit ? 0.06 : 0.5;
            l.pivot.position.y = pr.up - by * 0.55 - by * (dogSit ? 0.05 : 0.3);
          }
        }
        this.head.rotation.z = -0.35;
        if (p.kind === "lesson") this.head.rotation.z += Math.sin(t * TAU * 3) * 0.12;
        wagSpeed = 0.6;
        break;
      }
      case "sleep":
      case "ko": {
        lying = true;
        legsTucked = true;
        this.body.position.y = by * 0.95;
        this.body.rotation.x = p.kind === "ko" ? 1.2 : 0.35;
        this.head.rotation.z = 0.35;
        this.head.rotation.x = p.kind === "ko" ? 0.6 : 0.2;
        eyes = "closed";
        this.body.scale.y = 1 + Math.sin(t * TAU) * 0.03;
        wag = 0.05;
        break;
      }
      case "playdead":
      case "chill": {
        lying = true;
        this.body.position.y = by * 1.05;
        this.body.rotation.x = Math.PI; // on its back
        this.head.rotation.z = 0.3;
        for (const l of this.legs) l.pivot.rotation.z = p.kind === "chill" ? 0.3 : 0.1;
        eyes = p.kind === "playdead" ? "closed" : "happy";
        if (p.kind === "playdead") mouthOpen = 0.5;
        break;
      }
      case "jump":
      case "hop": {
        const k = Math.sin(Math.min(1, t) * Math.PI);
        this.root.position.y = k * (p.kind === "hop" ? 0.18 : 0.28);
        this.body.rotation.z = -k * 0.3;
        for (const [i, l] of this.legs.entries()) l.pivot.rotation.z = i < 2 ? -0.6 * k : 0.6 * k;
        eyes = "happy";
        break;
      }
      case "pounce": {
        if (t < 0.4) {
          const k = t / 0.4;
          this.body.scale.y = 1 - k * 0.3;
          this.body.position.y -= by * 0.3 * k;
          this.body.rotation.z = 0.2 * k;
        } else {
          const k = Math.sin(((t - 0.4) / 0.6) * Math.PI);
          this.root.position.y = k * 0.22;
          this.root.position.x = (t - 0.4) * 0.5;
          this.body.rotation.z = -0.35 * k;
          for (const [i, l] of this.legs.entries()) l.pivot.rotation.z = i < 2 ? -0.9 * k : 0.7 * k;
        }
        eyes = "angry";
        break;
      }
      case "roll": {
        this.body.rotation.x = t * TAU;
        this.body.position.y = by * 1.05 + Math.abs(Math.sin(t * TAU)) * 0.02;
        legsTucked = true;
        eyes = "happy";
        break;
      }
      case "spin": {
        this.root.rotation.y = t * TAU;
        this.root.position.y = Math.abs(Math.sin(t * TAU * 2)) * 0.04;
        legSwing(0.3, t * 3);
        eyes = "happy";
        break;
      }
      case "speak": {
        this.head.rotation.z = -0.25 + Math.sin(t * TAU * 2) * 0.12;
        mouthOpen = Math.max(0, Math.sin(t * TAU * 2));
        this.root.position.y = Math.max(0, Math.sin(t * TAU * 2)) * 0.02;
        break;
      }
      case "highfive": {
        const k = Math.sin(Math.min(1, t) * Math.PI);
        this.body.rotation.z = 0.35 * k;
        this.body.position.y -= by * 0.2 * k;
        this.legs[0].pivot.rotation.z = -2.2 * k; // the front-left paw up
        this.legs[1].pivot.rotation.z = 0.3 * k;
        if (this.legs.length > 2) {
          this.legs[2].pivot.rotation.z = -0.9 * k;
          this.legs[3].pivot.rotation.z = -0.9 * k;
        }
        eyes = "happy";
        break;
      }
      case "dance": {
        this.root.position.y = Math.abs(Math.sin(t * TAU * 2)) * 0.06;
        this.body.rotation.x = Math.sin(t * TAU) * 0.25;
        this.body.rotation.z = Math.sin(t * TAU * 2) * 0.08;
        this.head.rotation.z = Math.sin(t * TAU * 2 + 1) * 0.2;
        legSwing(0.5, t * 2);
        for (const w of this.wings) w.rotation.z = Math.sin(t * TAU * 2) * 0.6;
        eyes = "happy";
        wagSpeed = 2;
        break;
      }
      case "dive": {
        // belly down, legs back, a slide
        this.body.position.y = by * 1.1 + Math.max(0, Math.sin(t * Math.PI)) * 0.08;
        this.body.rotation.z = -0.25;
        for (const l of this.legs) l.pivot.rotation.z = 1.3;
        this.head.rotation.z = 0.2;
        eyes = "happy";
        break;
      }
      case "eat": {
        this.head.rotation.z = 0.75 + Math.sin(t * TAU * 3) * 0.1;
        this.body.rotation.z = 0.12;
        this.body.position.y -= by * 0.1;
        mouthOpen = Math.max(0, Math.sin(t * TAU * 3)) * 0.6;
        break;
      }
      case "pet": {
        this.body.scale.y = 1 - Math.abs(Math.sin(t * TAU * 2)) * 0.1;
        this.head.rotation.z = -0.3;
        this.head.rotation.x = Math.sin(t * TAU) * 0.25;
        eyes = "happy";
        wag = 1;
        wagSpeed = 3;
        break;
      }
      // species idle sets (M3)
      case "beg": {
        // sat up on its haunches, front paws in the air, eyes on you
        this.body.rotation.z = 0.95;
        this.body.position.y -= by * 0.3;
        this.body.position.x -= bx * 0.2;
        for (const [i, l] of this.legs.entries()) {
          if (i >= 2) {
            l.pivot.rotation.z = -1.5;
            l.pivot.position.y = pr.up - by * 0.3 - by * 0.5;
          } else {
            l.pivot.rotation.z = -1.9 + Math.sin(t * TAU * 2 + i * 1.3) * 0.3;
            l.pivot.position.y = pr.up - by * 0.3 - by * 0.05;
          }
        }
        this.head.rotation.z = -0.6;
        mouthOpen = 0.25;
        wag += 0.3;
        wagSpeed = 1.6;
        break;
      }
      case "nudge": {
        // a push forward with the head, again and again
        const k = Math.max(0, Math.sin(t * TAU * 2));
        this.body.rotation.z = -0.12 * k;
        this.body.position.x += bx * 0.14 * k;
        this.head.rotation.z = 0.4 * k;
        eyes = "happy";
        wag += 0.3;
        break;
      }
      case "sniff": {
        // nose to the ground, side to side, the tail up
        this.head.rotation.z = -0.6;
        this.head.rotation.y = Math.sin(t * TAU * 3) * 0.3;
        this.head.rotation.x = Math.sin(t * TAU * 12) * 0.03;
        this.body.rotation.z = -0.08;
        this.tail.rotation.z = 0.5;
        for (const e of this.ears) e.rotation.z += 0.25;
        break;
      }
      case "scratch": {
        // sat down, a hind leg going at an ear
        this.body.rotation.z = 0.5;
        this.body.position.y -= by * 0.55;
        for (const [i, l] of this.legs.entries()) {
          if (i < 2) l.pivot.rotation.z = 0.5;
          else if (i === 2) l.pivot.rotation.z = -1.4;
          else {
            l.pivot.rotation.z = -1.9 + Math.sin(t * TAU * 6) * 0.35;
            l.pivot.rotation.x = 0.9;
          }
          l.pivot.position.y = pr.up - by * 0.55 - by * (i < 2 ? 0.3 : 0.5);
        }
        this.head.rotation.z = -0.1;
        this.head.rotation.x = 0.35 + Math.sin(t * TAU * 6) * 0.05;
        eyes = "closed";
        break;
      }
      case "pant": {
        this.body.scale.y = 1 + Math.sin(t * TAU * 2) * 0.035;
        this.head.rotation.z = -0.2;
        mouthOpen = 0.8 + Math.sin(t * TAU * 2) * 0.15;
        eyes = "happy";
        break;
      }
      case "groom": {
        // sat, a front paw up to the mouth, licked
        this.body.rotation.z = 0.5;
        this.body.position.y -= by * 0.55;
        for (const [i, l] of this.legs.entries()) {
          if (i === 0) {
            l.pivot.rotation.z = -1.7 + Math.sin(t * TAU * 3) * 0.1;
            l.pivot.rotation.x = -0.3;
          } else if (i === 1) l.pivot.rotation.z = 0.5;
          else l.pivot.rotation.z = -1.4;
          l.pivot.position.y = pr.up - by * 0.55 - by * (i < 2 ? 0.3 : 0.5);
        }
        this.head.rotation.z = 0.55;
        this.head.rotation.y = 0.35;
        mouthOpen = Math.max(0, Math.sin(t * TAU * 3)) * 0.4;
        eyes = "closed";
        break;
      }
      case "stretch": {
        // the front down and out, the rear up
        const k = Math.sin(Math.min(1, t) * Math.PI);
        this.body.rotation.z = -0.35 * k;
        this.body.position.y += by * 0.15 * k;
        for (const [i, l] of this.legs.entries()) l.pivot.rotation.z = i < 2 ? -1.1 * k : 0.2 * k;
        this.head.rotation.z = 0.45 * k;
        this.tail.rotation.z = 0.7 * k;
        eyes = k > 0.5 ? "closed" : eyes;
        break;
      }
      case "twitch": {
        // a nose twitch, the ears taking turns
        this.head.rotation.x = Math.sin(t * TAU * 12) * 0.04;
        this.head.rotation.z = -0.05;
        for (const [i, e] of this.ears.entries()) e.rotation.z += Math.sin(t * TAU * 2 + i * Math.PI) * 0.2;
        break;
      }
      case "binky": {
        // a jump with a twist in the air
        const k = Math.sin(Math.min(1, t) * Math.PI);
        this.root.position.y = k * 0.26;
        this.root.rotation.y = Math.sin(t * Math.PI) * 1.1;
        this.body.rotation.x = Math.sin(t * TAU) * 0.5;
        for (const [i, l] of this.legs.entries()) l.pivot.rotation.z = i < 2 ? -0.8 * k : 0.8 * k;
        eyes = "excited";
        break;
      }
      case "slide": {
        // a belly slide along the floor
        this.body.position.y = by * 1.05;
        this.body.rotation.z = -0.15;
        for (const [i, l] of this.legs.entries()) {
          l.pivot.rotation.z = i < 2 ? -1.2 : 1.3;
          l.pivot.rotation.x = Math.sign(l.pivot.position.z) * 0.6;
        }
        this.head.rotation.z = 0.1;
        eyes = "happy";
        break;
      }
      case "shake": {
        // shaking dry: the body whips side to side, the head the other way
        this.body.rotation.x = Math.sin(t * TAU * 5) * 0.4;
        this.head.rotation.x = -Math.sin(t * TAU * 5) * 0.5;
        for (const e of this.ears) e.rotation.x += Math.sin(t * TAU * 5 + 1) * 0.6;
        eyes = "closed";
        break;
      }
      case "yawn": {
        const k = Math.sin(Math.min(1, t) * Math.PI);
        this.head.rotation.z = -0.45 * k;
        mouthOpen = k;
        eyes = k > 0.3 ? "closed" : "sleepy";
        break;
      }
      case "flat": {
        // lying flat out, the legs splayed
        lying = true;
        this.body.position.y = by * 0.85;
        for (const l of this.legs) {
          l.pivot.rotation.x = Math.sign(l.pivot.position.z) * 1.25;
          l.pivot.rotation.z = l.pivot.position.x > 0 ? -0.9 : 0.9;
        }
        this.head.rotation.z = 0.45;
        this.body.scale.y = 1 + Math.sin(t * TAU) * 0.03;
        eyes = "sleepy";
        break;
      }
      case "preen": {
        // the head round to a lifted wing
        this.head.rotation.y = 1.2;
        this.head.rotation.z = 0.55 + Math.sin(t * TAU * 3) * 0.08;
        for (const w of this.wings) if (w.position.z > 0) w.rotation.z = 0.9;
        mouthOpen = Math.max(0, Math.sin(t * TAU * 3)) * 0.3;
        eyes = "closed";
        break;
      }
      case "wing": {
        // both wings out, a stretch
        const k = Math.sin(Math.min(1, t) * Math.PI);
        for (const w of this.wings) w.rotation.z = 1.25 * k;
        for (const w of this.wings) w.rotation.x = Math.sign(w.position.z) * 0.5 * k;
        this.body.position.y += 0.02 * k;
        this.head.rotation.z = -0.25 * k;
        break;
      }
      case "lie": {
        // down like a sphinx: on its belly, the forelegs out ahead, the hind tucked, the head up
        lying = true;
        this.body.position.y = by * 1.0;
        this.body.scale.y = 1 + Math.sin(t * TAU) * 0.02;
        for (const [i, l] of this.legs.entries()) l.pivot.rotation.z = i < 2 ? -1.5 : 1.45;
        this.head.rotation.z = 0.1;
        wag = 0.15;
        break;
      }
      case "playbow": {
        // the front down, the rump up, the tail going: play with me
        const k = 0.85 + Math.sin(t * TAU * 2) * 0.15;
        this.body.rotation.z = -0.42 * k;
        this.body.position.y -= by * 0.3 * k;
        for (const [i, l] of this.legs.entries()) {
          l.pivot.rotation.z = i < 2 ? -1.25 * k : 0.12;
          l.pivot.position.y = pr.up - by * 0.55 - (i < 2 ? by * 0.75 * k : 0);
        }
        this.head.rotation.z = 0.4;
        this.tail.rotation.z = -0.7;
        eyes = "excited";
        mouthOpen = 0.4;
        wag = 1;
        wagSpeed = 3;
        break;
      }
      case "tilt": {
        // a head tilt, held: what was that?
        const k = Math.sin((Math.min(1, t * 2) * Math.PI) / 2);
        this.head.rotation.x = 0.45 * k;
        this.head.rotation.z = 0.12;
        for (const [i, e] of this.ears.entries()) e.rotation.z += (i ? 0.2 : -0.25) * k;
        break;
      }
      case "sniffground": {
        // on the move, slowly, the nose on the ground, side to side
        legSwing(0.22, t);
        this.head.rotation.z = -0.85;
        this.head.rotation.y = Math.sin(t * TAU * 2) * 0.25;
        this.body.rotation.z = -0.06;
        this.tail.rotation.z = -0.35;
        wag = 0.5;
        break;
      }
      case "battle": {
        this.body.scale.y = 0.92;
        this.body.position.y -= by * 0.12;
        this.body.rotation.z = 0.08;
        this.head.rotation.z = 0.1;
        for (const [i, l] of this.legs.entries()) l.pivot.rotation.z = i < 2 ? 0.25 : -0.25;
        eyes = "angry";
        wag = 0.1;
        break;
      }
      case "attack":
      case "special": {
        const k = t < 0.5 ? Math.sin(t * Math.PI) : 0;
        this.root.position.x = k * 0.35;
        this.root.position.y = k * 0.12;
        this.body.rotation.z = -0.45 * k;
        if (p.kind === "special") this.root.rotation.y = t < 0.5 ? t * 2 * TAU : 0;
        for (const [i, l] of this.legs.entries()) l.pivot.rotation.z = i < 2 ? -0.8 * k : 0.6 * k;
        mouthOpen = k;
        eyes = "angry";
        break;
      }
      case "defend": {
        this.body.scale.set(1.06, 0.78, 1.1);
        this.body.position.y -= by * 0.25;
        this.head.rotation.z = 0.45;
        for (const l of this.legs) l.pivot.rotation.z = 0;
        eyes = "closed";
        break;
      }
      case "hurt": {
        const k = Math.sin(Math.min(1, t) * Math.PI);
        this.root.position.x = -k * 0.15;
        this.body.rotation.z = 0.3 * k;
        this.head.rotation.z = -0.4 * k;
        eyes = "closed";
        mouthOpen = k * 0.7;
        break;
      }
    }
    // legs lying flat / tucked
    if (legsTucked) for (const l of this.legs) l.pivot.rotation.z = lying && this.body.rotation.x > 2 ? 0.2 : 1.45;
    if (lying) for (const l of this.legs) l.pivot.position.y = this.body.position.y - by * 0.3;
    else
      for (const [i, l] of this.legs.entries())
        if (!OWN_LEGS.has(p.kind)) l.pivot.position.y = pr.up - by * 0.55 + (i >= 2 ? 0 : 0);
    // the mood in the ears and the tail: back and tucked when scared or angry,
    // forward and up when excited or surprised
    const back = eyes === "scared" || eyes === "angry";
    const alert = eyes === "excited" || eyes === "surprised";
    if (pr.ears !== "none" && pr.ears !== "crest")
      for (const e of this.ears) e.rotation.z += back ? 0.55 : alert ? -0.3 : 0;
    if (pr.ears === "crest") for (const e of this.ears) e.rotation.z += back ? 0.6 : alert ? -0.5 : 0;
    // (about z a positive turn lowers the tail and raises the nose: tucked is +, up is −)
    if (!lying) {
      if (eyes === "scared") this.tail.rotation.z += this.tailKind === "feathers" ? 0.3 : 1.1;
      else if (alert) this.tail.rotation.z += this.tailKind === "feathers" ? -0.3 : -0.35;
    }
    if (alert) {
      wag = 1;
      wagSpeed = 3;
    } else if (eyes === "scared") wag = 0.05;
    // the mood it's in (the server's: docs/plan/52 D4), in its body: the tail, the ears, the head
    const mood = p.mood ?? "";
    if (mood && !lying) {
      const earsBy = (v: number) => {
        if (pr.ears !== "none") for (const e of this.ears) e.rotation.z += v;
      };
      switch (mood) {
        case "happy":
          this.tail.rotation.z -= 0.3;
          wag = Math.max(wag, 0.9);
          wagSpeed = Math.max(wagSpeed, 2);
          earsBy(-0.15);
          if (p.kind === "walk") this.body.position.y += pr.up * 0.02 * Math.abs(Math.sin(t * TAU * 2));
          break;
        case "bored":
          this.tail.rotation.z += 0.4;
          wag = 0.08;
          this.head.rotation.z -= 0.25;
          earsBy(0.2);
          break;
        case "scared":
          // (tucked: by the face's if it's scared — rigOf's — else here)
          if (eyes !== "scared") this.tail.rotation.z += 1.1;
          wag = 0.03;
          earsBy(0.6);
          this.head.rotation.z -= 0.3;
          this.body.position.y -= by * 0.18;
          break;
        case "sulk":
          this.tail.rotation.z += 0.6;
          wag = 0;
          earsBy(0.35);
          this.head.rotation.z -= 0.35;
          this.head.rotation.y += 0.5;
          break;
        case "alert":
          this.tail.rotation.z -= 0.5;
          wag = 0.12;
          wagSpeed = 2.5;
          earsBy(-0.4);
          this.head.rotation.z += 0.18;
          break;
      }
    }
    // the tail wags
    const wagT = now ? now / 1000 : t * 4;
    if (this.tailKind === "curl" || this.tailKind === "long")
      this.tail.rotation.y = Math.sin(wagT * 6 * wagSpeed) * wag;
    else if (this.tailKind === "paddle") this.tail.rotation.y = Math.sin(wagT * 3 * wagSpeed) * wag * 0.5;
    else this.tail.rotation.x = Math.sin(wagT * 8 * wagSpeed) * wag * 0.4;
    // the head follows the look, eased; ears twitch now and then
    const look = p.kind === "walk" || (lying && p.kind !== "lie") ? 0 : p.look;
    this.looked += (look - this.looked) * (dt ? Math.min(1, dt * 8) : 1);
    this.head.rotation.y += this.looked;
    if (now && this.ears.length && pr.ears !== "crest") {
      const tw = Math.max(0, Math.sin(now / 900) - 0.92) * 6;
      this.ears[0].rotation.x += tw * 0.3;
    }
    // blink (3D only: `now` given)
    if (now) {
      if (now > this.blinkAt) {
        this.blinkAt = now + 2500 + Math.random() * 3500;
        this.blinkUntil = now + 120;
      }
      if (now < this.blinkUntil && eyes === "open") eyes = "closed";
    }
    this.setFace(eyes, mouthOpen, this.looked);
    // Z's
    const asleep = p.kind === "sleep";
    for (const [i, z] of this.zs.entries()) {
      z.visible = asleep;
      if (!asleep) continue;
      const k = (((t * 1.5 + i / 3) % 1) + 1) % 1;
      z.position.set(bx * 0.6 + k * 0.08, this.height * 0.5 + k * 0.35, 0.08 + k * 0.06);
      z.scale.setScalar(0.07 + k * 0.08);
      (z.material as SpriteMaterial).opacity = Math.sin(k * Math.PI);
    }
    this.setCarry(p.carry ?? null);
    this.setFlash(p.flash ?? 0);
    if (dt > 0) this.weight(dt, lying);
  }

  // Weight (M2): ears and tail lag the body with a spring (back while it
  // runs, swinging out of a turn), a landing squash after a jump, and a
  // short cross-fade when the pose kind changes.
  private weight(dt: number, lying: boolean) {
    const spring = (s: { x: number; v: number }, target: number, k = 90, damp = 11) => {
      s.v += (target - s.x) * k * dt - s.v * damp * dt;
      s.x += s.v * dt;
    };
    spring(this.earLag, lying ? 0 : -Math.min(1, this.speed / 5) * 0.55);
    spring(this.tailLag, Math.max(-0.9, Math.min(0.9, -this.turn * 0.25)));
    for (const e of this.ears) e.rotation.x += this.earLag.x * (this.pr.ears === "long" ? 1.2 : 0.6);
    if (this.pr.ears === "crest") for (const e of this.ears) e.rotation.z += this.earLag.x * 0.5;
    this.tail.rotation.y += this.tailLag.x;
    // clothes with life: a cape flaps out behind as it runs, a hat tilts into
    // a turn and settles, a scarf's tail swings
    const sp2 = (s: { x: number; v: number }, target: number, k: number, damp: number) => {
      s.v += (target - s.x) * k * dt - s.v * damp * dt;
      s.x += s.v * dt;
    };
    if (this.cape) {
      sp2(this.capeLag, -Math.min(1, this.speed / 4.5) * 0.9, 60, 7);
      this.cape.rotation.x =
        -0.35 + this.capeLag.x + Math.sin(performance.now() / 160) * 0.06 * Math.min(1, this.speed);
    }
    if (this.hat) {
      sp2(this.hatLag, Math.max(-0.4, Math.min(0.4, this.turn * 0.12)), 140, 9);
      this.hat.rotation.x = this.hatLag.x;
      this.hat.rotation.z = this.earLag.x * 0.3;
    }
    if (this.scarfTail) this.scarfTail.rotation.z = 0.2 + this.earLag.x * 1.2;
    // landing: the body squashes, then springs back
    const up = this.root.position.y;
    if (this.wasUp > 0.03 && up <= 0.001) this.squash = 1;
    this.wasUp = up;
    this.squash *= Math.exp(-dt * 7);
    if (this.squash > 0.01) {
      const k = this.squash * Math.sin(Math.min(1, this.squash) * Math.PI);
      this.body.scale.multiply(new Vector3(1 + 0.16 * k, 1 - 0.2 * k, 1 + 0.16 * k));
      this.body.position.y -= this.pr.body[1] * 0.2 * k;
      for (const l of this.legs) l.pivot.rotation.z *= 1 - 0.5 * k;
    }
    // cross-fade from the last pose
    if (this.blendFrom && this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
      const k = 1 - this.blendT * this.blendT * (3 - 2 * this.blendT);
      this.lerpFrom(this.blendFrom, k);
      if (this.blendT >= 1) this.blendFrom = null;
    }
  }

  // The posed transforms, to fade from.
  private snap(): Snap {
    const ev = (e: { x: number; y: number; z: number }) => new Vector3(e.x, e.y, e.z);
    return {
      body: [this.body.position.clone(), ev(this.body.rotation), this.body.scale.clone()],
      head: ev(this.head.rotation),
      root: [this.root.position.y, this.root.rotation.y],
      legs: this.legs.map((l) => [ev(l.pivot.rotation), l.pivot.position.y]),
      tail: ev(this.tail.rotation),
      ears: this.ears.map((e) => ev(e.rotation)),
    };
  }
  private lerpFrom(from: Snap, k: number) {
    const mixV = (o: { x: number; y: number; z: number }, a: Vector3) => {
      o.x = o.x + (a.x - o.x) * k;
      o.y = o.y + (a.y - o.y) * k;
      o.z = o.z + (a.z - o.z) * k;
    };
    mixV(this.body.position, from.body[0]);
    mixV(this.body.rotation, from.body[1]);
    mixV(this.body.scale, from.body[2]);
    mixV(this.head.rotation, from.head);
    this.root.position.y += (from.root[0] - this.root.position.y) * k;
    this.legs.forEach((l, i) => {
      const f = from.legs[i];
      if (!f) return;
      mixV(l.pivot.rotation, f[0]);
      l.pivot.position.y += (f[1] - l.pivot.position.y) * k;
    });
    mixV(this.tail.rotation, from.tail);
    this.ears.forEach((e, i) => {
      if (from.ears[i]) mixV(e.rotation, from.ears[i]);
    });
  }

  // The eyes: the lids close from above (and up from below for a happy
  // squint), the pupils slide with the look, cheeks puff when it's happy.
  private setFace(eyes: Face3, mouthOpen: number, look: number) {
    const UP: Partial<Record<Face3, number>> = {
      closed: 1,
      happy: 0.55,
      angry: 0.32,
      sad: 0.3,
      sleepy: 0.6,
      scared: 0.18,
      smug: 0.5,
    };
    const DOWN: Partial<Record<Face3, number>> = { happy: 0.5, closed: 0.15, sleepy: 0.12 };
    const up0 = UP[eyes] ?? 0;
    const down = DOWN[eyes] ?? 0;
    // pupils: big when excited, pinpricks when scared or surprised
    const irisK = eyes === "excited" ? 1.3 : eyes === "scared" || eyes === "surprised" ? 0.7 : 1;
    const wide = eyes === "surprised" ? 1.18 : 1;
    for (const e of this.eyes) {
      // a smug look: one lid lower than the other
      const up = eyes === "smug" ? (e.side > 0 ? 0.55 : 0.15) : up0;
      e.white.scale.set(e.r * wide, e.r * 1.1 * wide, e.r * 0.75);
      e.iris.scale.set(e.r * 0.58 * irisK, e.r * 0.66 * irisK, e.r * 0.4);
      // the caps turn over the front of the eye as they close: the upper one
      // from the top, the lower one from underneath (open: tucked behind)
      e.lidUp.rotation.z = Math.PI / 2 - up * Math.PI;
      e.lidDown.rotation.z = Math.PI / 2 + down * Math.PI;
      e.lidDown.visible = down > 0.01;
      e.pupil.position.z = -look * e.r * 0.35;
      e.pupil.position.y = eyes === "sad" ? -e.r * 0.12 : 0;
      const browed = eyes === "angry" || eyes === "sad" || eyes === "scared" || eyes === "surprised";
      e.brow.visible = browed;
      e.brow.rotation.x = (eyes === "angry" ? -0.6 : eyes === "surprised" ? 0 : 0.6) * e.side;
      e.brow.position.y = e.r * (eyes === "angry" ? 1.0 : eyes === "surprised" ? 1.5 : 1.15);
      e.brow.rotation.z = eyes === "angry" ? -0.25 : eyes === "surprised" ? 0 : 0.2;
    }
    for (const c of this.cheeks) c.visible = eyes === "happy" || eyes === "excited";
    this.mouth.visible = mouthOpen > 0.05;
    this.mouth.scale.y = this.pr.head.r * 0.06 * (0.5 + mouthOpen * 2.5);
    this.teeth.visible = mouthOpen > 0.45;
    if (this.tongue) this.tongue.visible = eyes === "happy" && mouthOpen < 0.3;
  }

  private setCarry(kind: string | null) {
    if (kind === this.carriedKind) return;
    this.carriedKind = kind ?? "";
    for (const c of [...this.carried.children]) this.carried.remove(c);
    if (!kind) return;
    const m = toyMesh(kind, plainMat);
    if (m) this.carried.add(m);
  }

  private setFlash(k: number) {
    for (const m of this.bodyMats) {
      const base = this.baseColors.get(m);
      if (!base) continue;
      if (k > 0) m.color.copy(base).lerp(new Color(0xff5a4a), k * 0.7);
      else if (!m.color.equals(base)) m.color.copy(base);
    }
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    this.root.traverse((o) => {
      const g = (o as Mesh).geometry;
      if (g && g !== SPHERE && g !== SPHERE_LO && !(g instanceof CapsuleGeometry)) g.dispose();
    });
  }
}

// A toy as a small mesh: a ball, a frisbee, a rope, a feather, the laser's dot.
export function toyMesh(kind: string, mat: MatFactory, big = false): Object3D | null {
  const s = big ? 1.5 : 1;
  switch (kind) {
    case "ball": {
      const g = new Group();
      const b = new Mesh(SPHERE, mat(0xc4402b));
      b.scale.setScalar(0.1 * s);
      b.castShadow = true;
      const band = new Mesh(new TorusGeometry(0.1 * s, 0.016 * s, 6, 24), mat(CREAM));
      band.rotation.x = 0.4;
      g.add(b, band);
      return g;
    }
    case "frisbee": {
      const d = new Mesh(new CylinderGeometry(0.17 * s, 0.15 * s, 0.022, 28), mat(0xe8a33d));
      d.castShadow = true;
      return d;
    }
    case "rope": {
      const g = new Group();
      const curve = new CatmullRomCurve3([
        new Vector3(-0.14, 0, 0),
        new Vector3(-0.05, 0.02, 0.01),
        new Vector3(0.05, 0.02, -0.01),
        new Vector3(0.14, 0, 0),
      ]);
      const r = new Mesh(new TubeGeometry(curve, 12, 0.02 * s, 8), mat(0xd9b26a));
      r.castShadow = true;
      for (const x of [-0.14, 0.14]) {
        const k = new Mesh(SPHERE_LO, mat(0xb5562f));
        k.scale.setScalar(0.035 * s);
        k.position.x = x;
        g.add(k);
      }
      g.add(r);
      return g;
    }
    case "feather": {
      const f = new Mesh(new PlaneGeometry(0.06 * s, 0.2 * s), mat(0x7a5c8a));
      (f.material as Material).side = DoubleSide;
      f.rotation.z = 0.4;
      return f;
    }
    case "laser": {
      const dot = new Mesh(SPHERE_LO, mat(0xff2d2d, { glow: true }));
      dot.scale.set(0.05 * s, 0.006, 0.05 * s);
      return dot;
    }
    default:
      return null;
  }
}

// A name on a tag: the first letters, engraved on the brass.
const nameMats = new Map<string, MeshBasicMaterial>();
function nameTagMaterial(name: string): MeshBasicMaterial {
  const key = name.slice(0, 6).toUpperCase();
  let m = nameMats.get(key);
  if (m) return m;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#e8c94a";
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#6b5218";
  g.font = `bold ${key.length > 4 ? 30 : 40}px ui-rounded, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(key, 64, 68);
  const tex = new CanvasTexture(c);
  m = new MeshBasicMaterial({ map: tex, transparent: true });
  nameMats.set(key, m);
  return m;
}

let zMat: SpriteMaterial | null = null;
function zMaterial(): SpriteMaterial {
  if (zMat) return zMat.clone();
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.font = "bold 48px ui-rounded, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#2a1a12";
  g.fillText("z", 32, 36);
  const tex = new CanvasTexture(c);
  zMat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  return zMat.clone();
}

// ── what the server state means for the rig ─────────────────────────────────
export interface RigIn {
  species?: Species; // (the gait's pace)
  a: number; // ANIM 0 idle, 1 walk, 2 sit/asleep
  mode: string;
  act: string;
  actAt: number;
  feeling: string;
  hurtAt?: number;
  carry?: string | null;
  mood?: BodyMood; // the server's (docs/plan/52 D4); unset: the feeling's face only
}
export interface RigOut {
  kind: PoseKind;
  cycle: number; // ms per cycle; one-shots play once
  once: boolean;
  face: Face3;
  mood: BodyMood;
}
export function rigOf(s: RigIn, now: number): RigOut & { t: number; flash: number } {
  const [what, arg] = s.act.split(":");
  let kind: PoseKind = "idle";
  let cycle = 3200;
  let once = false;
  let face: Face3 = s.feeling === "happy" ? "happy" : s.feeling === "ok" || s.feeling === "bored" ? "open" : "sad";
  if (s.feeling === "tired") face = "sleepy";
  // (a mood shows in the face too)
  if (s.mood === "scared") face = "scared";
  else if (s.mood === "sulk") face = "sad";
  else if (s.mood === "bored" && face === "open") face = "sleepy";
  if (s.a === 1) {
    kind = "walk";
    cycle = s.species === "capybara" ? 760 : s.species === "rabbit" ? 520 : 560;
  } else if (s.a === 2 || s.mode === "sleep") {
    kind = "sleep";
    cycle = 3000;
  }
  switch (what) {
    case "trick":
      face = "happy";
      switch (arg) {
        case "sit":
          kind = "sit";
          break;
        case "roll":
          kind = "roll";
          cycle = 1100;
          break;
        case "spin":
          kind = "spin";
          cycle = 900;
          face = "smug";
          break;
        case "jump":
          kind = "jump";
          cycle = 800;
          break;
        case "hop":
          kind = "hop";
          cycle = 550;
          break;
        case "pounce":
          kind = "pounce";
          cycle = 1000;
          break;
        case "playdead":
          kind = "playdead";
          break;
        case "speak":
        case "talk":
          kind = "speak";
          cycle = 700;
          break;
        case "highfive":
          kind = "highfive";
          cycle = 1800;
          once = true;
          break;
        case "dance":
          kind = "dance";
          cycle = 1000;
          break;
        case "dive":
          kind = "dive";
          cycle = 1300;
          break;
        case "chill":
          kind = "chill";
          break;
        case "fetch":
          kind = "jump";
          cycle = 700;
          break;
      }
      break;
    case "lesson":
      kind = "lesson";
      cycle = 1200;
      face = "open";
      break;
    // its moves (docs/plan/52-the-pet-two.md D2/D5, features/pets.ts): act "move:<kind>"
    case "move": {
      const MOVES: Record<string, [PoseKind, number, boolean]> = {
        lie: ["lie", 3200, false],
        playbow: ["playbow", 900, false],
        shake: ["shake", 1300, true],
        tilt: ["tilt", 1600, true],
        sniffground: ["sniffground", 900, false],
      };
      const k = MOVES[arg];
      if (k) [kind, cycle, once] = k;
      // a few bounds after a passing car: running (its gait, a gallop at that pace, by its speed)
      else if (arg === "chase") {
        kind = "walk";
        face = "excited";
      }
      if (arg === "playbow") face = "excited";
      break;
    }
    case "idle": {
      // species idle sets (features/pets.ts idle()): act "idle:<kind>"
      const IDLE: Record<string, [PoseKind, number, boolean]> = {
        scratch: ["scratch", 1200, false],
        pant: ["pant", 1000, false],
        groom: ["groom", 1400, false],
        stretch: ["stretch", 2600, true],
        twitch: ["twitch", 1500, false],
        binky: ["binky", 1100, true],
        slide: ["slide", 2200, true],
        shake: ["shake", 1300, true],
        yawn: ["yawn", 2600, true],
        flat: ["flat", 3200, false],
        preen: ["preen", 1300, false],
        wing: ["wing", 2000, true],
        // docs/plan/52 D5
        lie: ["lie", 3200, false],
        playbow: ["playbow", 900, false],
        tilt: ["tilt", 1600, true],
        sniffground: ["sniffground", 900, false],
      };
      const k = IDLE[arg];
      if (k) [kind, cycle, once] = k;
      break;
    }
    case "play":
      face = "happy";
      if (arg === "rope") {
        kind = "battle";
      } else if (arg === "feather") {
        kind = "pounce";
        cycle = 900;
      } else if (s.a !== 1) {
        kind = "jump";
        cycle = 800;
      }
      break;
    case "fetch": // carrying it back / chasing (features/pets.ts)
      face = "excited";
      break;
    case "eat":
    case "drink":
      if (s.a !== 1) {
        kind = "eat";
        cycle = 700;
      }
      face = "happy";
      break;
    case "pet":
      kind = "pet";
      cycle = 800;
      face = "happy";
      break;
    case "battle":
      kind = "battle";
      face = "angry";
      break;
    case "attack":
    case "special":
      kind = what;
      cycle = 1000;
      once = true;
      face = "angry";
      break;
    case "defend":
      kind = "defend";
      break;
    case "rest":
      kind = "sit";
      face = "open";
      break;
    // its mind (features/pets.ts think / plan)
    case "beg":
      if (s.a !== 1) {
        kind = "beg";
        cycle = 1600;
      }
      face = "sad";
      break;
    case "nudge":
      if (s.a !== 1) {
        kind = "nudge";
        cycle = 900;
      }
      face = "happy";
      break;
    case "seek":
      if (s.a !== 1) {
        kind = "sniff";
        cycle = 1400;
      }
      face = "open";
      break;
    case "hide":
      if (s.a !== 1) kind = "flat";
      face = "scared";
      break;
    case "watch":
      if (s.a !== 1) kind = "sit";
      face = "open";
      break;
    case "zoom":
    case "company":
    case "greet":
      face = "excited";
      break;
    case "ko":
      kind = "ko";
      face = "sad";
      break;
    default:
      break;
  }
  const hurt = s.hurtAt && now - s.hurtAt < 400 ? 1 - (now - s.hurtAt) / 400 : 0;
  if (hurt > 0 && kind !== "ko") {
    kind = "hurt";
    cycle = 400;
    once = true;
    face = "scared";
  }
  const since = Math.max(0, now - (kind === "hurt" ? (s.hurtAt ?? now) : s.actAt));
  const t = once ? Math.min(1, since / cycle) : (since % cycle) / cycle;
  return { kind, cycle, once, face, t, flash: hurt, mood: s.mood ?? "" };
}
