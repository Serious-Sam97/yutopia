import {
  type CarLook,
  DOOR_GONE,
  DOOR_HANG,
  doorSlot,
  FLATS,
  type Hole,
  PANE_CRACK,
  PANE_GONE,
  PART,
  WRECK,
} from "@yutopia/shared/car";
import {
  Box3,
  BoxGeometry,
  type BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  type InterleavedBufferAttribute,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  type Intersection,
  Raycaster,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type Texture,
  TorusGeometry,
  Vector2,
  Vector3,
  Vector4,
  type WebGLRenderer,
} from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { asset } from "@/lib/asset";
import { AssetQueue, loadLifeGLTF } from "../../look/life-assets";
import { libMaterial } from "../../look/life-matlib";
import { LIBRARY, type MatId } from "../../look/life-matlib-list";
import { mergeWith } from "../merge-static";
import { tailPatch } from "../tail-glow";
import { layerShader } from "../wx3d";
import { type Door, type Lights, parkedDash, type Sedan, skyLit, type Wheel, type Wiper } from "./model";
import { plateTexture } from "./screen-tex";
import { type Cluster, drawCluster, drawRadio } from "./vfd";

// The cars made in Blender (docs/plan/92-the-cars.md, phases 5–8: tools/art/cars/build_cars.py →
// public/life/cars/<variant>.glb, its manifest beside them) as the game's car models (model.ts).
//
//   - The manifest (loaded once, before the first car) says where every moving part's pivot is, where the
//     seats, the eye, the lamps and the sockets are: a car's model is made at once from it — its doors,
//     wheels, steering wheel and wipers already there to be turned — and its geometry comes a moment later
//     (`ready`), moved into those parts.
//   - Each file is loaded once (an AssetQueue: held while a car shows it, let go oldest-first past its
//     budget); every car of a variant shares its geometry and its plain materials. A car's own: its paint
//     (its colour, its grime and snow, its dents as the model's morphs), its lamps, its dash, its plate.
//   - Its frame: the files are glTF's (x forward, z right, the origin on the ground under the centre of
//     gravity); the game's models are the other way round (nose −x, +z left): the file sits in the model
//     turned half round (`glb`).
//   - Near (its cabin, its engine, every part), mid (a parked car round you: fewer of everything) and far
//     (one per body: a car's outline in its paint).

type V3 = [number, number, number];
interface Pivot {
  at: V3;
  axis: V3;
  parent: string;
  side?: number;
  kind?: string;
  ratio?: number;
  w?: number;
  h?: number;
  detach?: boolean;
}
export interface ManifestCar {
  file: string;
  body: string;
  variant: string;
  kind: string;
  name: string;
  dims: { length: number; width: number; height: number; ahead: number; cog: number };
  wheelbase: number;
  track: number;
  wheel: { r: number; width: number; style?: string };
  hubs: Record<string, V3>;
  seats: V3[];
  eye: V3;
  points: Record<string, V3>;
  pivots: Record<string, Pivot>;
  doors: string[];
  tris: { near: number; mid?: number; far?: number };
  bytes?: { near: number; mid?: number };
  materials?: string[];
  morphs?: string[];
  /** (docs/plan/92 phase 9) its collider's points: the Jolt hull */
  hull?: V3[];
}
export interface CarManifest {
  version: number;
  cars: Record<string, ManifestCar>;
  far: Record<string, { file: string; tris?: number }>;
  extras: Record<string, { file: string; socket: string }>;
  wheels: Record<string, { file: string; ref: { r: number; width: number } }>;
}

const BASE = "/life/cars/";
let manifest: CarManifest | null = null;
let manifestP: Promise<CarManifest> | null = null;
/** The cars' manifest, fetched once. */
export function loadCarManifest(): Promise<CarManifest> {
  manifestP ??= fetch(asset(`${BASE}manifest.json`))
    .then((r) => {
      if (!r.ok) throw new Error(`cars manifest: ${r.status}`);
      return r.json() as Promise<CarManifest>;
    })
    .then((m) => {
      manifest = m;
      return m;
    })
    .catch((e) => {
      manifestP = null;
      throw e;
    });
  return manifestP;
}
/** The manifest, once it's in. */
export const carManifest = (): CarManifest | null => manifest;

/** A variant's Jolt hull (its collider's points, the manifest's) from its centre of mass, `cog` m up:
 *  x ahead, y up, z right, flat — or none (the box). */
export function hullPoints(variant: string, cog: number): number[] | undefined {
  const h = entryOf(variant)?.hull;
  if (!h || h.length < 4) return undefined;
  const out: number[] = [];
  for (const p of h) out.push(p[0], p[1] - cog, p[2]);
  return out;
}

/** The manifest's entry for a variant (or the work vehicle of that kind); the saloon's if it has none. */
export function entryOf(variant: string): ManifestCar | null {
  const m = manifest;
  if (!m) return null;
  return m.cars[variant] ?? m.cars[`${variant}-base`] ?? m.cars["saloon-base"] ?? null;
}

// ── the files ───────────────────────────────────────────────────────────────────────────────────

interface Loaded {
  scene: Group;
  bytes: number;
}
const queues = new Map<WebGLRenderer, AssetQueue<Loaded>>();
/** The library's materials laid on the cabin's named ones (walnut, carpet, tweed…): one each, kept. */
const libs = new Map<WebGLRenderer, Map<string, Material>>();

/** The cabin's materials the library has maps for (the rest keep the file's own). */
const CLOTH = new Set(["walnut", "carpet", "leather", "tweed", "velvet"]);
function libFor(r: WebGLRenderer, id: string, color: Color): Material {
  let m = libs.get(r);
  if (!m) {
    m = new Map();
    libs.set(r, m);
  }
  const key = `${id}|${color.getHexString()}`;
  let x = m.get(key);
  if (!x) {
    x = libMaterial(id as MatId, r, { color });
    x.userData.shared = true;
    skyLit(x);
    m.set(key, x);
  }
  return x;
}

/** A file as it comes in: its collider out, its cabin's cloth and wood from the library, its materials
 *  lit as the cars' are. */
function prepare(scene: Group, r: WebGLRenderer): number {
  const gone: Object3D[] = [];
  let bytes = 0;
  scene.traverse((o) => {
    if (o.name === "collider" || o.name.endsWith("-collider")) {
      gone.push(o);
      return;
    }
    const m = o as Mesh;
    if (!m.isMesh) return;
    // (the file's, shared by every car showing it: never let go by one of them)
    m.geometry.userData.shared = true;
    for (const a of Object.values(m.geometry.attributes))
      bytes += (a.array as ArrayLike<number> & { byteLength: number }).byteLength;
    const mat = m.material as MeshStandardMaterial;
    if (mat && !Array.isArray(mat)) {
      if (!mat.map && CLOTH.has(mat.name) && mat.name in LIBRARY && m.geometry.getAttribute("uv"))
        m.material = libFor(r, mat.name, mat.color);
      else skyLit(mat);
    }
    m.castShadow = !(mat as MeshStandardMaterial)?.transparent && !mat?.name?.startsWith("emit_");
    m.receiveShadow = true;
  });
  for (const o of gone) o.removeFromParent();
  splitLamps(scene);
  return bytes;
}

/** The head and tail lamps' light are one mesh for both sides in the files: split by side (the file's −z
 *  its left), so one can break and go out (docs/plan/92 phase 9). Once a file, shared by its cars. */
function splitLamps(scene: Group) {
  scene.updateMatrixWorld(true);
  const todo: Mesh[] = [];
  scene.traverse((o) => {
    const m = o as Mesh;
    const n = (m.material as Material | undefined)?.name;
    if (m.isMesh && (n === "emit_head" || n === "emit_tail") && m.geometry.index) todo.push(m);
  });
  const inv = new Matrix4();
  for (const m of todo) {
    const g = m.geometry;
    const idx = g.index;
    const pos = g.getAttribute("position");
    if (!idx || !pos) continue;
    // (the mesh's frame in the scene's: which side a triangle's middle is on)
    inv.copy(scene.matrixWorld).invert().multiply(m.matrixWorld);
    const sides: number[][] = [[], []];
    for (let i = 0; i < idx.count; i += 3) {
      let z = 0;
      for (let k = 0; k < 3; k++) z += v1.fromBufferAttribute(pos, idx.getX(i + k)).applyMatrix4(inv).z;
      const s = z < 0 ? 0 : 1;
      sides[s].push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    }
    if (!sides[0].length || !sides[1].length) {
      m.userData.side = sides[0].length ? "l" : "r";
      continue;
    }
    for (const [k, list] of sides.entries()) {
      const h = new BufferGeometry();
      for (const [name, a] of Object.entries(g.attributes)) h.setAttribute(name, a);
      h.setIndex(list);
      h.userData.shared = true;
      const c = new Mesh(h, m.material);
      c.name = `${m.name}-${k ? "r" : "l"}`;
      c.userData.side = k ? "r" : "l";
      c.position.copy(m.position);
      c.quaternion.copy(m.quaternion);
      c.scale.copy(m.scale);
      c.castShadow = false;
      m.parent?.add(c);
    }
    m.removeFromParent();
  }
}
/** The cars' textures are shared files (public/life/cars/tex, the library's ../mat): each GLB names them
 *  by URI, and the loader makes its own copy of each. One image a URI on the GPU: every copy's `source`
 *  the first's (three uploads by source — each keeps its own transform, docs/plan/92 phase 9). */
const sources = new Map<WebGLRenderer, Map<string, Texture["source"]>>();
function shareTextures(g: GLTF, url: string, r: WebGLRenderer) {
  const parser = g.parser as unknown as {
    json: {
      textures?: { source?: number; extensions?: Record<string, { source?: number }> }[];
      images?: { uri?: string }[];
    };
    associations: Map<object, { textures?: number }>;
  };
  let byUri = sources.get(r);
  if (!byUri) {
    byUri = new Map();
    sources.set(r, byUri);
  }
  const base = new URL(url, location.href);
  g.scene.traverse((o) => {
    const m = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (!m || Array.isArray(m)) return;
    for (const v of Object.values(m)) {
      const t = v as Texture;
      if (!t?.isTexture) continue;
      const ti = parser.associations.get(t)?.textures;
      if (ti === undefined) continue;
      const tj = parser.json.textures?.[ti];
      const src = tj?.extensions?.KHR_texture_basisu?.source ?? tj?.source;
      const uri = src === undefined ? undefined : parser.json.images?.[src]?.uri;
      if (!uri) continue;
      const key = new URL(uri, base).pathname;
      const had = byUri.get(key);
      if (had && had !== t.source) t.source = had;
      else if (!had) byUri.set(key, t.source);
    }
  });
}

function free(scene: Object3D) {
  scene.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mat = m.material as Material;
    if (mat && !Array.isArray(mat) && !mat.userData.shared) {
      for (const v of Object.values(mat)) if ((v as Texture)?.isTexture) (v as Texture).dispose();
      mat.dispose();
    }
  });
}
function queueFor(r: WebGLRenderer): AssetQueue<Loaded> {
  let q = queues.get(r);
  if (!q) {
    q = new AssetQueue<Loaded>({
      load: async (file) => {
        const url = asset(`${BASE}${file}`);
        const g = await loadLifeGLTF(r, url);
        const scene = g.scene;
        shareTextures(g, url, r);
        const bytes = prepare(scene, r);
        return { scene, bytes };
      },
      size: (x) => x.bytes,
      free: (x) => free(x.scene),
      pieces: (x) => {
        let n = 0;
        x.scene.traverse((o) => {
          if ((o as Mesh).isMesh) n++;
        });
        return n;
      },
      concurrency: 3,
      // (what may stay unheld: a few variants' worth, the far ones, the wheels and the extras)
      budget: 48 * 1024 * 1024,
    });
    queues.set(r, q);
  }
  return q;
}
/** A renderer's files and library materials let go (it's gone: the buy panel's stand, docs/plan/92 F13b). */
export function forgetRenderer(r: WebGLRenderer) {
  queues.get(r)?.drain();
  queues.delete(r);
  for (const m of libs.get(r)?.values() ?? []) m.dispose();
  libs.delete(r);
}
/** What the cars' files hold now (the memory checks). */
export const carAssetStats = (r: WebGLRenderer) => queues.get(r)?.stats() ?? null;
// (the checks read it from the page)
if (typeof window !== "undefined")
  (window as unknown as { __carAssets?: unknown }).__carAssets = () => [...queues.values()].map((q) => q.stats());

// (a file's held by everyone who shows it: asked for, then let go)
function hold(r: WebGLRenderer, file: string, prio: number, then: (s: Group) => void, gone: () => boolean) {
  queueFor(r)
    .get(file, prio)
    .then(
      (x) => {
        if (gone()) return;
        then(x.scene);
      },
      (e) => console.warn(`car model ${file} didn't load`, e),
    );
}

// ── the frame: the file's (x ahead, z right) to the model's (x back, z left) ───────────────────────

const toModel = (v: V3, out = new Vector3()) => out.set(-v[0], v[1], -v[2]);
const Z = new Vector3(0, 0, 1);
const v1 = new Vector3();
const v2 = new Vector3();
const m4 = new Matrix4();
/** (plan 96 F3a) a round's mark on the skin, across (m): its hole, its bare metal, its scorch */
const MARK_SIZE = 0.06;
/** (plan 95 F6a) a flat tyre's hub, down on its rim (m) */
const FLAT_DROP = 0.08;
/** (plan 96 F5a) a blowout's collapse (s) */
const FLAT_S = 0.6;
/** (plan 95 F1a) a window wound all the way down or up (s) */
const WIN_S = 1.5;

// ── the paint's wear: the road's dirt up its sides, the snow on it ────────────────────────────────

interface Wear {
  uGrime: { value: number };
  uCarInv: { value: Matrix4 };
  uSnow: { value: number };
}
function paintWear(m: MeshStandardMaterial, u: Wear) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrime = u.uGrime;
    sh.uniforms.uCarInv = u.uCarInv;
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform mat4 uCarInv; varying vec3 vCarPos; varying vec3 vCarN;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvCarPos = (uCarInv * modelMatrix * vec4(transformed, 1.0)).xyz;\nvCarN = mat3(uCarInv * modelMatrix) * objectNormal;",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uGrime; varying vec3 vCarPos; varying vec3 vCarN;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float grime = uGrime * (1.0 - smoothstep(0.25, 0.95, vCarPos.y)) * (0.8 + 0.2 * sin(vCarPos.x * 9.0 + vCarPos.z * 5.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.075, 0.06), grime * 0.8);
        // (the shell's inside — the pillars, the roof, the sills seen from the seats: faced toward the cabin's
        // middle, or their backs —: trim, not the paint's colour; docs/plan/92 polish)
        bool carIn = !gl_FrontFacing || (vCarPos.y > 0.8 && dot(vCarN, vec3(0.0, 0.9, 0.0) - vCarPos) > 0.0);
        if (carIn) diffuseColor.rgb = vec3(0.16, 0.152, 0.14);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, grime);\nif (carIn) roughnessFactor = 0.85;",
      );
    sh.uniforms.wxCarSnow = u.uSnow;
    layerShader(sh, "car");
  };
  m.customProgramCacheKey = () => "car-paint-glb";
}

/** A material of the file's made this car's own (a clone: three's clone leaves the shader's patches out). */
function own<M extends Material>(m: M): M {
  const c = m.clone() as M;
  c.userData = { ...m.userData, skyLit: false, shared: false };
  return c;
}

/** (plan 95 F6a) A car's flat tyres, for its tyre's shader: each wheel's hub (world; w its drop, 0 not flat) and
 *  axle (world), the tyre's radius and half its width (m). */
interface FlatU {
  hub: { value: Vector4[] };
  axle: { value: Vector3[] };
  size: { value: Vector2 };
}
/** (plan 95 F6a) Its flat: each point of a tyre below its hub by more than its radius less the drop pushed up onto
 *  that line — flat on the road where it sits, however it turns —, its walls bulging out there and a little
 *  above it. In the world's frame (y up), back into the mesh's own. */
const FLAT_GLSL = `{
  vec4 fw = modelMatrix * vec4(transformed, 1.0);
  vec3 dw = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 hb = uFlatHub[i];
    if (hb.w <= 0.0) continue;
    vec3 rel = fw.xyz - hb.xyz;
    vec3 ax = uFlatAxle[i];
    float along = dot(rel, ax);
    if (abs(along) > uFlatSize.y) continue;
    vec3 rad = rel - ax * along;
    if (length(rad) > uFlatSize.x * 1.2) continue;
    float floorY = -(uFlatSize.x - hb.w);
    float side = along >= 0.0 ? 1.0 : -1.0;
    if (rad.y < floorY) {
      float dz = floorY - rad.y;
      dw.y += dz;
      dw += ax * side * dz * 0.55;
    } else {
      dw += ax * side * smoothstep(floorY + 0.14, floorY, rad.y) * hb.w * 0.3;
    }
  }
  transformed += inverse(mat3(modelMatrix)) * dw;
}`;
function flatTyre(m: Material, u: FlatU) {
  if (m.userData.flatTyre) return;
  m.userData.flatTyre = true;
  const prev = m.onBeforeCompile;
  const key = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uFlatHub = u.hub;
    sh.uniforms.uFlatAxle = u.axle;
    sh.uniforms.uFlatSize = u.size;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec4 uFlatHub[4]; uniform vec3 uFlatAxle[4]; uniform vec2 uFlatSize;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${FLAT_GLSL}`);
  };
  m.customProgramCacheKey = () => `${key.call(m)}|flat`;
}

// the windscreen's crack: lines from a star low on the passenger's side (and more of them, worse)
const cracks: (CanvasTexture | null)[] = [null, null, null, null];
/** (`pane`: plan 94 P3's for the other panes — square, its star in the middle reaching to the edges, laid across
 *  each pane's own two longest ways) */
function crackTex(bad = false, pane = false, spot = false): CanvasTexture {
  const i = spot ? 3 : pane ? 2 : bad ? 1 : 0;
  const had = cracks[i];
  if (had) return had;
  const W = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = pane ? W : W / 2;
  const g = cv.getContext("2d") as CanvasRenderingContext2D;
  let seed = bad ? 7 : 3;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const star = (cx: number, cy: number, n: number, reach: number) => {
    g.strokeStyle = "rgba(235,242,248,0.85)";
    g.lineCap = "round";
    for (let k = 0; k < n; k++) {
      let a = (k / n) * Math.PI * 2 + rnd() * 0.5;
      let x = cx;
      let y = cy;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x, y);
      const len = reach * (0.4 + rnd() * 0.8);
      for (let d = 0; d < len; d += 9) {
        a += (rnd() - 0.5) * 0.5;
        x += Math.cos(a) * 9;
        y += Math.sin(a) * 9;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // (the rings round the star where the glass gave)
    for (let r = 10; r < reach * 0.5; r += 14 + rnd() * 10) {
      g.lineWidth = 0.9;
      g.beginPath();
      g.arc(cx, cy, r, rnd() * 6, rnd() * 6 + 1.5 + rnd() * 2);
      g.stroke();
    }
    g.fillStyle = "rgba(240,246,250,0.6)";
    g.beginPath();
    g.arc(cx, cy, 5, 0, Math.PI * 2);
    g.fill();
  };
  // (u: the model's z across — the passenger's side the low u; v up the glass: the canvas's y down)
  // (plan 95 F5a: one round's star in laminated glass — its spider's legs and rings, the hole in the middle —,
  // laid where it went in)
  if (spot) {
    star(W * 0.5, W * 0.5, 14, 240);
    star(W * 0.5, W * 0.5, 9, 110);
    g.fillStyle = "rgba(20,22,24,0.9)";
    g.beginPath();
    g.arc(W * 0.5, W * 0.5, 4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(245,248,250,0.8)";
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(W * 0.5, W * 0.5, 8, 0, Math.PI * 2);
    g.stroke();
  } else if (pane) {
    star(W * 0.5, W * 0.5, 13, 300);
    star(W * 0.5, W * 0.5, 7, 140);
  } else star(W * 0.3, W * 0.36, 11, 200);
  if (bad && !pane) {
    star(W * 0.68, W * 0.2, 9, 160);
    star(W * 0.5, W * 0.42, 7, 120);
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  cracks[i] = t;
  return t;
}

/** (plan 96 F3a) A round's mark on a car's skin, ~6 cm across: the hole, black and ragged; the paint chipped off
 *  round it to the bare metal; a soft scorch fading out past that. Made once. */
let markTexture: CanvasTexture | null = null;
function markTex(): CanvasTexture {
  if (markTexture) return markTexture;
  const W = 128;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = W;
  const g = cv.getContext("2d") as CanvasRenderingContext2D;
  const c = W / 2;
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // (the scorch: soot fading out, a few specks)
  const sc = g.createRadialGradient(c, c, c * 0.35, c, c, c);
  sc.addColorStop(0, "rgba(28,24,20,0.6)");
  sc.addColorStop(0.55, "rgba(28,24,20,0.25)");
  sc.addColorStop(1, "rgba(28,24,20,0)");
  g.fillStyle = sc;
  g.fillRect(0, 0, W, W);
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const r = c * (0.4 + rnd() * 0.5);
    g.fillStyle = `rgba(20,18,16,${0.15 + rnd() * 0.35})`;
    g.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 1.5, 1.5);
  }
  // (a ragged edge: a ring of points at a radius, each a little in or out)
  const ragged = (r0: number, jag: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const r = c * r0 * (1 + (rnd() - 0.5) * jag);
      if (i === 0) g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      else g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  };
  // (the bare metal where the paint flaked off, a lighter rim where the round turned the edge out)
  ragged(0.44, 0.35, "rgb(150,146,138)");
  ragged(0.3, 0.25, "rgb(186,182,174)");
  // (the hole)
  ragged(0.2, 0.3, "rgb(10,10,10)");
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  markTexture = t;
  return t;
}

/** (plan 94 P3; plan 95 F5a) A crack's picture laid across a pane's glass (its points, its own frame) along its
 *  two longest ways: its middle at `at` — where its round went in — and twice the glass's size, so the crack
 *  runs right across it from there; none, the glass's middle, the picture its size. */
function crackUV(pos: BufferAttribute, at: Vector3 | null): Float32Array {
  const bb = new Box3().setFromBufferAttribute(pos);
  const ext = bb.getSize(new Vector3());
  const ax = [0, 1, 2].sort((p, q) => ext.getComponent(q) - ext.getComponent(p));
  const uv = new Float32Array(pos.count * 2);
  for (let j = 0; j < pos.count; j++)
    for (let k = 0; k < 2; k++) {
      const a = ax[k];
      const e = ext.getComponent(a) || 1;
      const x = pos.getComponent(j, a);
      uv[j * 2 + k] = at ? 0.5 + (x - at.getComponent(a)) / (2 * e) : (x - bb.min.getComponent(a)) / e;
    }
  return uv;
}

const LAMP: Record<string, number> = {
  emit_head: 0xfff3dc,
  emit_tail: 0xff2414,
  emit_brake: 0xff1a0a,
  emit_reverse: 0xf2f4ff,
  emit_ind: 0xffa01e,
  emit_beacon_r: 0xff2020,
  emit_beacon_b: 0x2a5cff,
  emit_beacon: 0xffa020,
  emit_sign: 0xffd27a,
};

// ── a car ───────────────────────────────────────────────────────────────────────────────────────

export interface BuildCar {
  /** a manifest key ("saloon-gl"), or a work vehicle's kind */
  variant: string;
  look?: CarLook;
  role?: string;
  plate?: string;
  /** near: everything (a car someone's in, or about to be); mid: a parked car round you */
  level?: "near" | "mid";
  renderer: WebGLRenderer;
  /** load priority: lower sooner (a distance) */
  priority?: number;
  /** the seats the car's kind has (shared SEATS_OF: car-local from its CoG, x ahead, z right; the hip's
   *  height): those its model hasn't (a pickup's bed, the panel van's load space) are sat there */
  pad?: { at: [number, number][]; hip: number[] };
}

interface Part {
  outer: Group;
  anim: Group;
  holder: Group;
}

/** A car's model from its Blender file: made now, its geometry in when the file is (`ready`). */
export function buildCar(o: BuildCar): Sedan {
  return new GlbCar(o);
}

class GlbCar implements Sedan {
  readonly root = new Group();
  readonly body = new Group();
  private readonly glb = new Group();
  readonly wheels: Wheel[] = [];
  readonly doors: Door[] = [];
  readonly steering: Group;
  readonly wipers: Wiper[] = [];
  readonly freshener = new Group();
  readonly snow: Mesh[] = [];
  readonly seats: { hip: Vector3; side: 1 | -1; front: boolean; floor?: number }[] = [];
  readonly eye: Vector3;
  readonly hood: Vector3;
  readonly pedals?: Vector3[];
  readonly dims: { L: number; axleF: number; kind: string };
  readonly lamps: { head: Vector3[]; tail: Vector3[]; exhaust: Vector3 };
  readonly rearView: Mesh;
  screen = { u0: 0.9, y0: 0.95, u1: 1.6, y1: 1.4, hw0: 0.7, hw1: 0.6, len: 0.8 };
  ready = false;
  /** when its geometry's in (the stills wait on it) */
  readonly loaded: Promise<void>;
  private done: () => void = () => {};

  private readonly e: ManifestCar;
  private readonly parts = new Map<string, Part>();
  private readonly held: string[] = [];
  private gone = false;
  private readonly mine: Material[] = []; // (this car's own materials: let go with it)
  private readonly geos: BufferGeometry[] = [];
  private paint: MeshStandardMaterial[] = [];
  private paintMeshes: Mesh[] = [];
  private lampMats = new Map<string, MeshStandardMaterial[]>();
  private screenMat: MeshBasicMaterial | null = null;
  private radioMat: MeshBasicMaterial | null = null;
  private radio: { c: HTMLCanvasElement; t: CanvasTexture } | null = null;
  private radioSays: ["FM" | "AM" | "TAPE", number, number] | null = null;
  private cluster: { c: HTMLCanvasElement; t: CanvasTexture } | null = null;
  private snowMat: MeshStandardMaterial | null = null;
  private snowPane: Mesh | null = null;
  private envMats = new Set<MeshStandardMaterial>();
  private env: Texture | null = null;
  private wear: Wear = { uGrime: { value: 0 }, uCarInv: { value: new Matrix4() }, uSnow: { value: 0 } };
  private dmg = [0, 0, 0, 0, 0];
  /** its broken parts (shared car/damage.ts PART), as shown */
  private partBits = 0;
  private crack: { mesh: Mesh; mat: MeshBasicMaterial } | null = null;
  /** (plan 94 P3) each pane's middle (the model's: damage.ts PANES), and the cracks over the rest of the glass */
  private paneMid: (Vector3 | null)[] = [null, null, null, null, null, null];
  private paneCrackMat: MeshBasicMaterial | null = null;
  /** (plan 94 P2) what's come off it or hangs (shared WRECK); each door's state (0 on, 1 hanging, 2 gone) and
   *  last opening; a lid's least opening (sprung) and last */
  private wreckBits = 0;
  private doorState: number[] = [];
  private doorA: number[] = [];
  private lidMin = new Map<string, number>();
  /** (plan 94 P1) burnt out: each material's charred copy (made once, its own) */
  private burnt = false;
  private charred = new Map<Material, Material>();
  private lidA = new Map<string, number>();
  private lampK = 1;
  private lights: Lights = { beams: "off", tail: false, brake: 0, reverse: false, ind: 0, dash: 0, dome: false };
  private rimAt = new Vector3();
  private rimR = 0.19;
  private rollers: { g: Group; k: number }[] = [];
  private tail: ReturnType<typeof tailPatch>;
  private beacon: { on: boolean; t: number } = { on: false, t: 0 };

  constructor(private readonly o: BuildCar) {
    const e = entryOf(o.variant);
    if (!e) throw new Error("cars: the manifest isn't in yet");
    this.e = e;
    this.loaded = new Promise((ok) => {
      this.done = ok;
    });
    this.root.add(this.body);
    this.body.add(this.glb);
    this.glb.rotation.y = Math.PI;
    this.root.name = `car:${o.variant}`;
    // the moving parts, where the file has their pivots
    for (const name of Object.keys(e.pivots)) this.part(name);
    // the steering wheel (a stand-in group if it has none)
    this.steering = this.parts.get("steering")?.anim ?? new Group();
    // the wheels: FL, FR, RL, RR
    for (const k of ["fl", "fr", "rl", "rr"]) {
      const hub = e.hubs[k] ?? e.points[`hub_${k}`];
      // (none of its own — the snowcat's tracks, a toboggan's runners, a ski that doesn't spin —: groups
      // the rig may turn all the same)
      let steer = this.parts.get(`steer_${k}`)?.anim;
      if (!steer) {
        steer = new Group();
        if (hub) steer.position.set(hub[0], hub[1], hub[2]);
        this.glb.add(steer);
      }
      let spin = this.parts.get(`spin_${k}`)?.anim;
      if (!spin) {
        spin = new Group();
        (this.parts.get(`steer_${k}`)?.holder ?? steer).add(spin);
      }
      this.wheels.push({
        steer,
        spin,
        front: k[0] === "f",
        side: (k[1] === "l" ? 1 : -1) as 1 | -1,
        rest: steer.position.clone(),
        // (turned about the file's z, the model's −z: the other way round)
        turnK: -1,
      });
    }
    // the doors
    for (const d of e.doors) {
      const p = this.parts.get(d);
      const pv = e.pivots[d];
      if (!p || !pv) continue;
      const side = (pv.side ?? (pv.at[2] < 0 ? 1 : -1)) as 1 | -1;
      const g = p.anim;
      const slide = pv.kind === "slide";
      const fold = pv.kind === "fold";
      const di = this.doors.length;
      const base: (a: number) => void = slide
          ? (a: number) => {
              // (the van's: out a little, then back along its side)
              const k = Math.min(1, a / 1.05);
              g.position.set(pv.at[0] - 0.75 * k, pv.at[1], pv.at[2] - side * 0.09 * Math.min(1, k * 4));
            }
          : fold
            ? (a: number) => {
                g.rotation.y = side * Math.min(1.5, a * 1.4);
              }
            : (a: number) => {
                g.rotation.y = -side * a;
              };
      this.doors.push({
        group: g,
        side,
        front: /_f[lr]$/.test(d),
        // (plan 94 P2: hanging off its lower hinge — ajar whatever's asked, its back edge dropped; gone: nothing)
        open: (a: number) => {
          this.doorA[di] = a;
          const st = this.doorState[di] ?? 0;
          if (st === 2) return;
          base(st === 1 ? Math.max(a, 0.55) : a);
          g.rotation.z = st === 1 ? 0.24 : 0;
          if (!g.matrixAutoUpdate) {
            g.updateMatrix();
            g.updateMatrixWorld(true);
          }
        },
      });
    }
    // the seats, the eye, the pedals
    for (const [i, s] of e.seats.entries())
      this.seats.push({ hip: toModel(s), side: s[2] < 0 ? 1 : s[2] > 0 ? -1 : 1, front: i < 2 });
    const pad = o.pad;
    if (pad)
      for (let i = this.seats.length; i < pad.at.length; i++) {
        const [x, z] = pad.at[i];
        this.seats.push({ hip: toModel([x, pad.hip[i] ?? 0.5, z]), side: z <= 0 ? 1 : -1, front: false });
      }
    // (the file's eye is where the seated body's eyes are: its head bone sits 0.1 m behind it — checked
    // in the world, docs/plan/92 polish; the cockpit's framing is the camera's pitch, camera.ts)
    this.eye = toModel(e.eye);
    this.hood = toModel([e.dims.ahead - 1.05, Math.max(e.eye[1] - 0.12, 1.0), 0]);
    const th = e.points.pedal_throttle;
    if (th && e.pivots.pedal_0) {
      const d = [th[0] - e.pivots.pedal_2.at[0], th[1] - e.pivots.pedal_2.at[1], 0];
      this.pedals = [0, 1, 2].map((i) => {
        const a = e.pivots[`pedal_${i}`]?.at ?? th;
        return toModel([a[0] + d[0], a[1] + d[1], a[2]]);
      });
    }
    // where its CoG is along it: the model's origin is under it (rig.ts takes `axleF + front - L / 2`)
    const front = e.hubs.fl ? e.hubs.fl[0] : e.wheelbase / 2;
    this.dims = { L: e.dims.length, axleF: e.dims.length / 2 - front, kind: e.kind };
    const head = ["headlight_l", "headlight_r"].map((n) => e.points[n]).filter((p): p is V3 => !!p);
    this.lamps = {
      head: head.map((p) => toModel(p)),
      // (either side of its tail, at the lamps' height)
      tail: [-1, 1].map((s) => toModel([-(e.dims.length - e.dims.ahead) + 0.05, 0.8, s * (e.dims.width / 2 - 0.25)])),
      exhaust: toModel(e.points.exhaust_0 ?? [-e.dims.length + e.dims.ahead, 0.3, 0.4]),
    };
    // the wipers (turned up the glass from where they lie: their fans worked out once they're in)
    for (const n of ["wiper_l", "wiper_r"]) {
      const p = this.parts.get(n);
      const pv = e.pivots[n];
      if (!p || !pv) continue;
      this.wipers.push({
        arm: p.anim,
        park: 0,
        sweep: 1.6,
        pivot: -pv.at[2],
        len: 0.5,
        blade: 0.45,
        fan: { park: 0, sweep: 1.6 },
      });
    }
    // the steering wheel's rim (the hands': cars.ts), till its geometry says how big it is
    const st = e.pivots.steering;
    if (st) toModel(st.at, this.rimAt);
    // the inside mirror and the pine tree under it (a guess till the windscreen's in)
    this.rearView = new Mesh(
      this.geo(new PlaneGeometry(0.22, 0.065).rotateY(Math.PI / 2)),
      this.mat(new MeshBasicMaterial({ color: 0x3b4148 })),
    );
    this.body.add(this.rearView, this.freshener);
    this.placeMirror(e.eye[0] + 0.62, e.eye[1] + 0.06);
    this.freshener.add(this.pineTree());
    // the tail lamps' red on the snow behind
    this.tail = tailPatch(e.dims.length - e.dims.ahead);
    this.root.add(this.tail);
    // its files
    const lvl = o.level ?? "near";
    const file = lvl === "mid" && e.tris.mid ? e.file.replace(/\.glb$/, "-mid.glb") : e.file;
    this.want(file, (s) => this.adopt(s));
  }

  // ── the parts ──
  private part(name: string): Part | null {
    const had = this.parts.get(name);
    if (had) return had;
    const pv = this.e.pivots[name];
    if (!pv) return null;
    const up = pv.parent && pv.parent !== "root" && pv.parent !== "body" ? this.part(pv.parent) : null;
    const pAt = up ? this.e.pivots[pv.parent].at : [0, 0, 0];
    const outer = new Group();
    outer.name = `p:${name}`;
    outer.position.set(pv.at[0] - pAt[0], pv.at[1] - pAt[1], pv.at[2] - pAt[2]);
    let anim = outer;
    let holder = outer;
    if (name === "steering" || name.startsWith("wiper_")) {
      // (turned about its own axis: the column's, toward the driver; the glass's normal for a wiper)
      const s = name === "steering" ? -1 : 1;
      v1.set(pv.axis[0] * s, pv.axis[1] * s, pv.axis[2] * s).normalize();
      const q = new Quaternion().setFromUnitVectors(Z, v1);
      outer.quaternion.copy(q);
      anim = new Group();
      holder = new Group();
      holder.quaternion.copy(q).invert();
      outer.add(anim);
      anim.add(holder);
    }
    (up ? up.holder : this.glb).add(outer);
    const p = { outer, anim, holder };
    this.parts.set(name, p);
    return p;
  }

  private want(file: string, then: (s: Group) => void) {
    this.held.push(file);
    hold(this.o.renderer, file, this.o.priority ?? 0, then, () => this.gone);
  }

  private geo<G extends BufferGeometry>(g: G): G {
    this.geos.push(g);
    return g;
  }
  private mat<M extends Material>(m: M): M {
    this.mine.push(m);
    if ((m as unknown as MeshStandardMaterial).isMeshStandardMaterial)
      this.envMats.add(m as unknown as MeshStandardMaterial);
    return m;
  }

  /** The file's in: its parts moved into the model's, its paint and lamps made this car's own. */
  private adopt(src: Group) {
    const e = this.e;
    const o = this.o;
    const look = o.look;
    const near = (o.level ?? "near") === "near";
    const scene = src.clone(true);
    scene.updateMatrixWorld(true);
    // the windscreen (before its glass moves anywhere): the snow's pane over it, the mirror under its top
    this.findScreen(scene);
    // (plan 94 P3) its glass as panes, each to crack and go on its own
    this.tagPanes(scene);
    // (plan 94 P2) its rear bumper as a part of its own (the file has it in the body)
    this.splitRearBumper(scene);
    // the parts: what each pivot holds, moved into the model's
    for (const [name, p] of this.parts) {
      const node = scene.getObjectByName(name);
      if (!node) continue;
      for (const ch of [...node.children]) if (!this.parts.has(ch.name)) p.holder.add(ch);
    }
    // the wheels' own look: another style's in place of what the file came with
    const style = look?.wheels;
    const made = e.wheel.style;
    if (near && style && made && style !== made && carManifest()?.wheels[style]) this.wheelsOf(style);
    // the extras (and the role's roof part)
    const extras = [...(look?.extras ?? [])];
    if (o.role === "police") extras.push("lightbar");
    if (o.role === "taxi") extras.push("taxisign");
    for (const x of extras) this.extra(x);
    this.glb.add(scene);
    // its own materials
    this.ownMaterials(this.glb);
    // the rollers that turn with the tracks (the snowcat's, the snowmobile's bogies)
    for (const [name, p] of this.parts)
      if (name.startsWith("roller_")) this.rollers.push({ g: p.anim, k: e.wheel.r / 0.12 });
    // the wipers: which way they lie (their fans on the windscreen's picture), how long they are
    for (const w of this.wipers) {
      const pv = e.pivots[w.arm === this.parts.get("wiper_l")?.anim ? "wiper_l" : "wiper_r"];
      const b = pv ? boxOf(w.arm, this.glb, pv.at) : null;
      if (!b) continue;
      // (lying out along the file's −z from the pivot: up is a positive turn; along +z, negative)
      const toward = b.cz < 0 ? 1 : -1;
      w.len = Math.max(0.25, b.span);
      w.blade = w.len * 0.85;
      w.sweep = 1.6 * toward;
      w.fan = toward > 0 ? { park: 0, sweep: 1.6 } : { park: Math.PI, sweep: Math.PI - 1.6 };
    }
    // the steering wheel's rim
    const sw = this.parts.get("steering");
    if (sw) {
      const b = boxOf(sw.holder, this.glb, e.pivots.steering.at);
      // (boxOf's span is already a radius — the pivot to the rim's farthest point —: the hands on the rim's
      // middle, a little inside it; ×0.47 had them on the hub — docs/plan/92 polish)
      if (b) this.rimR = Math.max(0.13, Math.min(0.21, b.span * 0.9));
    }
    this.seatFloors();
    this.ready = true;
    this.setEnv(this.env);
    this.setLights(this.lights);
    if (this.radioSays) this.setRadio(...this.radioSays);
    const bits = this.partBits;
    const wb = this.wreckBits;
    this.partBits = 0;
    this.wreckBits = 0;
    this.setWear(this.wear.uGrime.value, this.dmg, bits, wb, this.burntWant ? 3 : 0);
    // (plan 96 F5a: as it came in seen — a tyre shot from now on blows out, not just is)
    this.flatSeen = true;
    this.setBeacon(this.beacon.on, this.beacon.t);
    if (this.holesWant) this.setHoles(this.holesWant);
    this.done();
  }

  /** (plan 96) Each seat's footwell floor: straight down onto its carpet where the feet go — ahead of the hip by
   *  the reach of a sat person's feet (a front seat's 0.55 m, a rear one's 0.4) —, its height in the model's frame;
   *  none found (a seat with no carpet before it: a bed, a sled), left to the fit's own guess. */
  private seatFloors() {
    const floors: Mesh[] = [];
    this.root.traverse((x) => {
      const m = x as Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      if (/^(carpet|floor|rubber_mat)$/.test((m.material as Material).name ?? "")) floors.push(m);
    });
    if (!floors.length) return;
    this.root.updateMatrixWorld(true);
    const ray = new Raycaster();
    const down = new Vector3(0, -1, 0).transformDirection(this.root.matrixWorld);
    for (const seat of this.seats) {
      const ahead = seat.front ? 0.55 : 0.4;
      const ys: number[] = [];
      // (under each foot: a hand's width either side of the hip's line)
      for (const dz of [-0.13, 0.13]) {
        const from = this.root.localToWorld(v1.set(seat.hip.x - ahead, seat.hip.y + 0.05, seat.hip.z + dz));
        ray.set(from, down);
        ray.far = 0.9;
        const hit = ray.intersectObjects(floors, false)[0];
        if (hit) ys.push(this.root.worldToLocal(hit.point.clone()).y);
      }
      if (ys.length) seat.floor = Math.max(...ys);
    }
  }

  /** The wheels of another style: its tyre and rim sized to this car's, the file's own let go (its
   *  brake discs kept). */
  private wheelsOf(style: string) {
    const w = carManifest()?.wheels[style];
    if (!w) return;
    const e = this.e;
    this.want(w.file, (s) => {
      const src = s.getObjectByName("spin") ?? s;
      for (const k of ["fl", "fr", "rl", "rr"]) {
        const p = this.parts.get(`spin_${k}`);
        if (!p) continue;
        for (const ch of [...p.holder.children]) if (!ch.name.endsWith("-disc")) ch.removeFromParent();
        const c = src.clone(true);
        c.position.set(0, 0, 0);
        const right = (e.hubs[k]?.[2] ?? 0) > 0;
        c.scale.set(e.wheel.r / w.ref.r, e.wheel.r / w.ref.r, (e.wheel.width / w.ref.width) * (right ? -1 : 1));
        p.holder.add(c);
        this.ownMaterials(c);
      }
    });
  }

  /** An extra on its socket(s): a roof rack on the roof, mud flaps behind each wheel, chains on the tyres. */
  private extra(id: string) {
    const x = carManifest()?.extras[id];
    if (!x) return;
    const e = this.e;
    const sockets: { at: V3; right: boolean; under?: Group }[] = [];
    if (x.socket === "hub_*") {
      for (const k of ["fl", "fr", "rl", "rr"]) {
        const p = this.parts.get(`spin_${k}`);
        if (p) sockets.push({ at: [0, 0, 0], right: (e.hubs[k]?.[2] ?? 0) > 0, under: p.holder });
      }
    } else if (x.socket.endsWith("*")) {
      const pre = x.socket.slice(0, -1);
      for (const [n, at] of Object.entries(e.points)) if (n.startsWith(pre)) sockets.push({ at, right: at[2] > 0 });
    } else if (x.socket.startsWith("x_spot")) {
      for (const n of ["x_spot_l", "x_spot_r"])
        if (e.points[n]) sockets.push({ at: e.points[n], right: e.points[n][2] > 0 });
    } else if (e.points[x.socket]) sockets.push({ at: e.points[x.socket], right: false });
    if (!sockets.length) return;
    const k = id === "chains" ? e.wheel.r / 0.317 : 1;
    this.want(x.file, (s) => {
      for (const sk of sockets) {
        const c = s.clone(true);
        c.position.set(sk.at[0], sk.at[1], sk.at[2]);
        c.scale.set(k, k, k * (sk.right ? -1 : 1));
        (sk.under ?? this.glb).add(c);
        this.ownMaterials(c);
      }
    });
  }

  /** The car's own materials, under `root`: its paint (and the police's white doors, a second colour),
   *  its lamps, its dash, its plate; the rest shared with every car of its file. */
  private ownMaterials(root: Object3D) {
    const look = this.o.look;
    const colour = look?.colour ?? 0x6b2430;
    const role = this.o.role ?? "";
    root.traverse((x) => {
      // (the police's and the taxi's liveries: parts of their own, shown on a car of that role)
      if (x.name.startsWith("livery_")) x.visible = !!role && x.name.startsWith(`livery_${role}`);
      const m = x as Mesh;
      if (!m.isMesh) return;
      const mat = m.material as MeshStandardMaterial;
      if (!mat || Array.isArray(mat)) return;
      const n = mat.name;
      if (n === "paint" || n === "paint2") {
        // (the police's doors white; a second colour on the line of those that have one)
        const door = n === "paint" && role === "police" && underDoor(m);
        const want = door ? 0xf2f2ee : n === "paint2" ? (look?.colour2 ?? darker(colour)) : colour;
        let p = this.paint.find((q) => q.userData.colour === want && q.userData.kind === n);
        if (!p) {
          p = this.mat(own(mat));
          p.color.set(want);
          p.userData.colour = want;
          p.userData.kind = n;
          paintWear(p, this.wear);
          skyLit(p);
          this.paint.push(p);
        }
        m.material = p;
        if (m.morphTargetDictionary) this.paintMeshes.push(m);
      } else if (n.startsWith("emit_")) {
        // (an indicator's side: by the lamp it's in)
        let key = n;
        if (n === "emit_ind") key = within(m, "lamp_ind_r") ? "emit_ind_r" : "emit_ind_l";
        // (the head and tail lamps split by side: one can break — splitLamps)
        else if ((n === "emit_head" || n === "emit_tail") && m.userData.side) key = `${n}_${m.userData.side}`;
        let list = this.lampMats.get(key);
        if (!list) {
          list = [];
          this.lampMats.set(key, list);
        }
        const c = this.mat(own(mat));
        if (c.emissive.getHex() === 0) c.emissive.set(LAMP[n] ?? 0xffffff);
        c.emissiveIntensity = 0;
        c.toneMapped = false;
        skyLit(c);
        list.push(c);
        m.material = c;
      } else if (n === "screen" && within(m, "radio_screen")) {
        // (the radio's window: the band and the station, its own canvas — docs/plan/92 phase 9)
        if (!this.radioMat)
          this.radioMat = this.mat(new MeshBasicMaterial({ map: parkedDash().radio, toneMapped: false }));
        m.material = this.radioMat;
      } else if (n === "screen") {
        this.clusterMesh = m;
        if (!this.screenMat) {
          this.screenMat = this.mat(new MeshBasicMaterial({ map: parkedDash().cluster, toneMapped: false }));
        }
        m.material = this.screenMat;
      } else if (n === "plate" && this.o.plate && m.geometry.getAttribute("uv")) {
        const p = this.mat(own(mat));
        p.map = plateTexture(this.o.plate);
        skyLit(p);
        m.material = p;
      } else if (n === "tyre" && mat.isMeshStandardMaterial) {
        // (plan 95 F6a: its own, the flat's squash in its shader — one program for every car's, compiled with it)
        if (!this.tyreMat) {
          this.tyreMat = this.mat(own(mat));
          flatTyre(this.tyreMat, this.flatU);
          this.envMats.add(this.tyreMat);
        }
        m.material = this.tyreMat;
      } else if (n.startsWith("livery")) {
        m.visible = !!role && n.includes(role);
      } else if (mat.isMeshStandardMaterial) this.envMats.add(mat);
      if (n === "glass" || n === "glass_tint") m.castShadow = false;
    });
  }

  /** The windscreen from the file's glass: what faces ahead and up, in front of the cabin. */
  private findScreen(scene: Object3D) {
    const e = this.e;
    let xs: { x: number; y: number; z: number }[] = [];
    scene.traverse((x) => {
      const m = x as Mesh;
      // (the windscreen's own material since the quality pass: glass_ws, its sun band)
      const gn = (m.material as Material)?.name;
      if (!m.isMesh || (gn !== "glass" && gn !== "glass_ws")) return;
      // (a door's own glass is a side window)
      if (within(m, "door_")) return;
      const pos = m.geometry.getAttribute("position");
      const nrm = m.geometry.getAttribute("normal");
      if (!pos || !nrm) return;
      const nm = new Matrix4().extractRotation(m.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        v2.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).applyMatrix4(nm);
        if (v2.x < 0.3 || v2.y < 0.15) continue;
        v1.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m.matrixWorld);
        if (v1.x < e.eye[0]) continue;
        xs.push({ x: v1.x, y: v1.y, z: v1.z });
      }
    });
    if (xs.length < 4) return;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of xs) {
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    if (y1 - y0 < 0.15) return;
    const band = (lo: number, hi: number) => xs.filter((p) => p.y >= lo && p.y <= hi);
    const bot = band(y0, y0 + (y1 - y0) * 0.15);
    const top = band(y1 - (y1 - y0) * 0.15, y1);
    const avg = (a: typeof xs, k: "x" | "z") => a.reduce((s, p) => s + p[k], 0) / a.length;
    const hw = (a: typeof xs) => Math.max(...a.map((p) => Math.abs(p.z)));
    const xb = avg(bot, "x");
    const xt = avg(top, "x");
    const hw0 = hw(bot) * 0.96;
    const hw1 = hw(top) * 0.96;
    xs = [];
    const len = Math.hypot(xb - xt, y1 - y0);
    this.screen = { u0: e.dims.ahead - xb, y0, u1: e.dims.ahead - xt, y1, hw0, hw1, len };
    // the pane the snow and the rain lie on: just off the glass, its picture across (z) and up it
    const n = v1
      .set(y1 - y0, xb - xt, 0)
      .normalize()
      .multiplyScalar(0.014);
    const g = new BufferGeometry();
    const P = [
      [xb + n.x, y0 + n.y, -hw0],
      [xb + n.x, y0 + n.y, hw0],
      [xt + n.x, y1 + n.y, -hw1],
      [xt + n.x, y1 + n.y, hw1],
    ];
    g.setAttribute("position", new Float32BufferAttribute(P.flat(), 3));
    // (u: the model's z from −hw to hw — the file's z the other way —; v up the glass)
    g.setAttribute("uv", new Float32BufferAttribute([1, 0, 0, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 1, 3, 2]);
    g.computeVertexNormals();
    this.snowMat = this.mat(
      new MeshStandardMaterial({
        transparent: true,
        depthWrite: false,
        roughness: 0.9,
        emissive: 0xffffff,
        emissiveIntensity: 0.08,
        side: DoubleSide,
      }),
    );
    this.snowPane = new Mesh(this.geo(g), this.snowMat);
    this.snowPane.visible = false;
    // (plan 95 F4a: a round meeting it meets the windscreen — the shot's ray test reads it so)
    this.snowPane.userData.paneOf = 0;
    this.snowPane.renderOrder = 2;
    this.glb.add(this.snowPane);
    // the inside mirror: under the windscreen's top, a hand's breadth behind it
    this.placeMirror(xt - 0.1, y1 - 0.07);
  }
  private placeMirror(x: number, y: number) {
    toModel([x, y, 0], this.rearView.position);
    this.freshener.position.copy(this.rearView.position).add(v1.set(-0.02, -0.04, 0));
  }
  private pineTree(): Mesh {
    const s = new Shape();
    s.moveTo(0, 0);
    s.lineTo(0.025, -0.03);
    s.lineTo(0.012, -0.03);
    s.lineTo(0.03, -0.062);
    s.lineTo(0.004, -0.062);
    s.lineTo(0.004, -0.075);
    s.lineTo(-0.004, -0.075);
    s.lineTo(-0.004, -0.062);
    s.lineTo(-0.03, -0.062);
    s.lineTo(-0.012, -0.03);
    s.lineTo(-0.025, -0.03);
    s.closePath();
    const g = this.geo(new ShapeGeometry(s).rotateY(Math.PI / 2));
    g.translate(0, -0.03, 0);
    const m = new Mesh(g, this.mat(new MeshStandardMaterial({ color: 0x2e6b3a, roughness: 0.9, side: DoubleSide })));
    m.castShadow = false;
    return m;
  }

  // ── what the rest of the car's code asks of it ──
  private clusterMesh: Mesh | null = null;
  private clusterPt: Vector3 | null = null;
  /** The cluster's middle (model coords): the cockpit's picture framed by it (camera.ts) — docs/plan/92 polish. */
  clusterAt(out: Vector3): Vector3 | null {
    const m = this.clusterMesh;
    if (!m?.parent) return null;
    if (!this.clusterPt) {
      m.geometry.computeBoundingBox();
      const box = m.geometry.boundingBox;
      if (!box) return null;
      const c = box.getCenter(new Vector3());
      this.root.updateWorldMatrix(true, true);
      c.applyMatrix4(m.matrixWorld).applyMatrix4(m4.copy(this.root.matrixWorld).invert());
      this.clusterPt = c;
    }
    return out.copy(this.clusterPt);
  }
  rim(phi: number, out = new Vector3()): Vector3 {
    // (the wheel's plane faces the driver: 12 o'clock up it, the driver's right toward the model's −z)
    const st = this.e.pivots.steering;
    const ax = st ? v2.set(-st.axis[0], st.axis[1], -st.axis[2]).normalize() : v2.set(1, 0, 0);
    const up = v1.set(0, 1, 0).addScaledVector(ax, -ax.y).normalize();
    const right = new Vector3().crossVectors(up, ax).normalize();
    // (the driver faces the model's −x: their right is −z)
    if (right.z > 0) right.negate();
    return out
      .copy(this.rimAt)
      .addScaledVector(up, Math.cos(phi) * this.rimR)
      .addScaledVector(right, Math.sin(phi) * this.rimR);
  }
  /** (plan 93) the gear lever's knob: its pivot's, a hand's length up the lever */
  leverAt(out: Vector3): Vector3 | null {
    const pv = this.e.pivots.lever;
    if (!pv) return null;
    return toModel(pv.at, out).add(v1.set(0, 0.17, 0));
  }
  // ── (plan 93 S2; plan 95 F1a) the doors' windows: wound down into the door, along their own glass, over WIN_S ──
  /** each door's (by its index in the doors): where its window is (0 up … 1 down), where it's going, how fast (/s) */
  private winK: number[] = [];
  private winTo: number[] = [];
  private winRate: number[] = [];
  /** each door pane's way down into its door (its parent's frame), the whole of its height */
  private paneSlide: (Vector3 | null)[] = [null, null, null, null, null, null];
  /** A door's window wound down, or up (a broken side's stays gone: setParts): moving there over `secs` from
   *  where it is. The first word of it (the car just come into view) is where it is, not moved. True: a move
   *  began (heard: the motor). */
  windowDown(door: number, down: boolean, secs = WIN_S): boolean {
    const to = down ? 1 : 0;
    if (this.winTo[door] === undefined) {
      this.winTo[door] = to;
      this.winK[door] = to;
      this.winRate[door] = 1 / secs;
      this.placeWindows();
      return false;
    }
    // (going there already: as fast as the quicker asks — a gun out of it)
    if (this.winTo[door] === to) {
      this.winRate[door] = Math.max(this.winRate[door] ?? 0, 1 / secs);
      return false;
    }
    this.winTo[door] = to;
    this.winRate[door] = 1 / secs;
    const i = this.paneOfDoor(door);
    return i >= 0 && !!this.paneSlide[i] && !(this.partBits & PANE_GONE[i]);
  }
  /** (plan 95 F1a) Each frame: the windows on their way, moved. */
  windowsTick(dt: number) {
    let moved = false;
    for (let d = 0; d < this.winTo.length; d++) {
      const to = this.winTo[d];
      const k = this.winK[d];
      if (to === undefined || k === to) continue;
      const step = (this.winRate[d] ?? 1 / WIN_S) * dt;
      this.winK[d] = to > k ? Math.min(to, k + step) : Math.max(to, k - step);
      moved = true;
    }
    if (moved) this.placeWindows();
  }
  /** a window moving now (any door's) */
  windowsMoving(): boolean {
    return this.winTo.some((to, d) => to !== undefined && this.winK[d] !== to);
  }
  private paneOfDoor(door: number): number {
    const n = ["door_fl", "door_fr", "door_rl", "door_rr"].indexOf(this.e.doors[door] ?? "");
    return n < 0 ? -1 : 2 + n;
  }
  /** (plan 95 F1a) a pane's window: how far down (0 up … 1 down; a door's own — the quarter's fixed glass never) */
  private paneK(i: number): number {
    if (i < 2) return 0;
    const d = this.e.doors.indexOf(["door_fl", "door_fr", "door_rl", "door_rr"][i - 2]);
    return d < 0 ? 0 : (this.winK[d] ?? 0);
  }
  private paneDown(i: number): boolean {
    return this.paneK(i) >= 0.999;
  }
  /** (plan 95 F1a) Each door pane (and its two-pass twin, and its crack) where its window's wound to: down its
   *  own glass, a motor's even pace eased at its ends; all the way down, hidden (showPanes). */
  private placeWindows() {
    this.root.traverse((x) => {
      const ud = x.userData;
      const i = (ud.pane ?? ud.crackOf) as number | undefined;
      if (typeof i !== "number" || i < 2 || ud.fixed) return;
      const sl = this.paneSlide[i];
      const rest = ud.winRest as Vector3 | undefined;
      if (!sl || !rest) return;
      const k = this.paneK(i);
      const e = 0.75 * k + 0.25 * k * k * (3 - 2 * k);
      x.position.copy(rest).addScaledVector(sl, e);
      x.updateMatrix();
      if (!x.matrixAutoUpdate) x.updateMatrixWorld(true);
    });
    this.showPanes(this.partBits);
  }
  /** (plan 95 F1a) A door pane's way down: straight down into its door, as far as it's tall; its rest kept. */
  private slideOf(m: Mesh, i: number) {
    m.userData.winRest = m.position.clone();
    if (this.paneSlide[i] || !m.parent) return;
    const pos = m.geometry.getAttribute("position");
    if (!pos) return;
    m.updateMatrix();
    // (up in its parent's frame: the model's up, its door shut — straight down, not down its slope: glass leaning
    // in at its top, its slope's way down goes out through the door's skin)
    m.parent.updateWorldMatrix(true, false);
    const down = new Vector3(0, -1, 0).transformDirection(m4.copy(m.parent.matrixWorld).invert());
    const a = new Vector3();
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < pos.count; j++) {
      const q = a.fromBufferAttribute(pos, j).applyMatrix4(m.matrix).dot(down);
      lo = Math.min(lo, q);
      hi = Math.max(hi, q);
    }
    this.paneSlide[i] = down.multiplyScalar((hi - lo) * 1.03);
  }
  /** (plan 94 P3) Each pane and its crack as the bits have it: gone, hidden; cracked, its crack over it; a door's
   *  window wound down, down. Both of a two-pass's meshes (their `pane` alike). */
  private showPanes(bits: number) {
    this.root.traverse((x) => {
      const ud = x.userData;
      const i = (ud.pane ?? ud.crackOf) as number | undefined;
      if (typeof i !== "number") return;
      const gone = !!(bits & PANE_GONE[i]);
      const down = !ud.fixed && this.paneDown(i);
      x.visible = !gone && !down && (ud.crackOf === undefined || !!(bits & PANE_CRACK[i]));
    });
  }
  /** (plan 94 P3) The middle of a pane (the model's coords), for the shards; null if it has none. */
  paneAt(i: number): Vector3 | null {
    return this.paneMid[i] ?? null;
  }

  /** (plan 94 P3) Its glass told apart: the windscreen (glass_ws), the rear window (the boot's, the back doors', or
   *  the body's that faces back), each door's window, and the body's side glass by its side (the quarter: the
   *  side's rear pane). The body's own glass is in one mesh in the file — split here by the way each triangle
   *  faces. In the file's frame (x ahead, z<0 its left), before the parts move. */
  private tagPanes(scene: Object3D) {
    const GL = new Set(["glass", "glass_ws", "glass_tint"]);
    const found: Mesh[] = [];
    scene.traverse((x) => {
      const m = x as Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      if (GL.has((m.material as Material | undefined)?.name ?? "")) found.push(m);
    });
    const boxes = Array.from({ length: 6 }, () => new Box3());
    const bx = new Box3();
    const put = (m: Mesh, i: number, fixed = false) => {
      m.userData.pane = i;
      if (fixed) m.userData.fixed = true;
      m.geometry.computeBoundingBox();
      if (m.geometry.boundingBox) boxes[i].union(bx.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
    };
    const ahead = this.e.eye[0];
    for (const m of found) {
      const d = ["door_fl", "door_fr", "door_rl", "door_rr"].findIndex((n) => within(m, n));
      if (d >= 0) {
        put(m, 2 + d);
        this.slideOf(m, 2 + d);
        continue;
      }
      if (within(m, "boot")) {
        put(m, 1);
        continue;
      }
      if ((m.material as Material).name === "glass_ws") {
        put(m, 0);
        continue;
      }
      // (another door's — a sliding one: its side's rear pane)
      if (within(m, "door_")) {
        m.geometry.computeBoundingBox();
        const c = (m.geometry.boundingBox ?? bx.makeEmpty()).getCenter(v1).applyMatrix4(m.matrixWorld);
        put(m, c.z < 0 ? 4 : 5);
        continue;
      }
      // the body's: each triangle by the way it faces and where it is
      const g = m.geometry;
      const pos = g.getAttribute("position");
      if (!pos) continue;
      const idx = g.index;
      const tris = idx ? idx.count / 3 : pos.count / 3;
      const vi = (t: number, k: number) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
      const groups = new Map<number, number[]>();
      const a = new Vector3();
      const b = new Vector3();
      const c = new Vector3();
      for (let t = 0; t < tris; t++) {
        a.fromBufferAttribute(pos, vi(t, 0)).applyMatrix4(m.matrixWorld);
        b.fromBufferAttribute(pos, vi(t, 1)).applyMatrix4(m.matrixWorld);
        c.fromBufferAttribute(pos, vi(t, 2)).applyMatrix4(m.matrixWorld);
        const mx = (a.x + b.x + c.x) / 3;
        const mz = (a.z + b.z + c.z) / 3;
        v2.subVectors(b, a).cross(v1.subVectors(c, a)).normalize();
        const i =
          Math.abs(v2.x) > 0.5 && Math.abs(v2.x) > Math.abs(v2.z)
            ? mx < ahead
              ? 1
              : 0
            : (mx > ahead + 0.3 ? 2 : 4) + (mz < 0 ? 0 : 1);
        let list = groups.get(i);
        if (!list) groups.set(i, (list = []));
        list.push(t);
      }
      if (groups.size <= 1 || Object.keys(g.morphAttributes).length) {
        const [only] = [...groups.keys()];
        put(m, only ?? 4, true);
        continue;
      }
      const parent = m.parent;
      if (!parent) continue;
      for (const [i, list] of groups) {
        const sub = new BufferGeometry();
        for (const name of Object.keys(g.attributes)) {
          const at = g.getAttribute(name);
          const n = at.itemSize;
          const arr = new Float32Array(list.length * 3 * n);
          let o = 0;
          for (const t of list)
            for (let k = 0; k < 3; k++) {
              const j = vi(t, k);
              for (let q = 0; q < n; q++) arr[o++] = at.getComponent(j, q);
            }
          sub.setAttribute(name, new Float32BufferAttribute(arr, n, at.normalized));
        }
        const piece = new Mesh(this.geo(sub), m.material);
        piece.name = `${m.name}.${i}`;
        piece.position.copy(m.position);
        piece.quaternion.copy(m.quaternion);
        piece.scale.copy(m.scale);
        piece.castShadow = m.castShadow;
        piece.receiveShadow = m.receiveShadow;
        piece.renderOrder = m.renderOrder;
        parent.add(piece);
        piece.updateMatrixWorld(true);
        put(piece, i, true);
      }
      m.removeFromParent();
    }
    boxes.forEach((bb, i) => {
      if (bb.isEmpty()) return;
      const c = bb.getCenter(new Vector3());
      this.paneMid[i] = toModel([c.x, c.y, c.z]);
    });
  }
  /** (plan 94 P3) A crack over each pane (but the windscreen's own, on its snow pane) that's cracked and has none
   *  yet: a copy of its glass a hair off it, the crack's picture laid flat across it. */
  private crackPanes(bits: number) {
    const add: Mesh[] = [];
    this.root.traverse((x) => {
      const m = x as Mesh;
      const i = m.userData.pane as number | undefined;
      if (!m.isMesh || typeof i !== "number" || i === 0 || m.userData.twoPassFront || m.userData.cracked) return;
      if (!(bits & PANE_CRACK[i]) || bits & PANE_GONE[i]) return;
      add.push(m);
    });
    for (const m of add) {
      m.userData.cracked = true;
      const src = m.geometry;
      const pos = src.getAttribute("position");
      if (!pos || !m.parent) continue;
      // (its picture across the glass's two longest ways — from where its round went in, plan 95 F5a)
      const uv = crackUV(pos as BufferAttribute, this.crackAt[m.userData.pane as number] ?? null);
      const g = new BufferGeometry();
      g.setAttribute("position", pos);
      g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
      if (src.index) g.setIndex(src.index);
      if (!this.paneCrackMat)
        this.paneCrackMat = this.mat(
          new MeshBasicMaterial({
            map: crackTex(false, true),
            transparent: true,
            depthWrite: false,
            opacity: 0.9,
            side: DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
          }),
        );
      const c = new Mesh(this.geo(g), this.paneCrackMat);
      c.name = `${m.name}.crack`;
      c.userData = { crackOf: m.userData.pane, fixed: m.userData.fixed, winRest: m.userData.winRest };
      c.renderOrder = 3;
      c.position.copy(m.position);
      c.quaternion.copy(m.quaternion);
      c.scale.copy(m.scale);
      c.castShadow = false;
      c.matrixAutoUpdate = m.matrixAutoUpdate;
      m.parent.add(c);
      c.updateMatrix();
      c.updateMatrixWorld(true);
    }
  }

  /** (plan 93 S6) snow chains on its wheels (FL FR RL RR: bits 1 2 4 8): on each, round its tread — the cross
   *  chains across it, the side chains round its walls —, turning with it. `r`, `width`: its tyre's (m). */
  private chainBits = 0;
  private chainMeshes: Mesh[] = [];
  setChains(bits: number, r: number, width: number) {
    if (bits === this.chainBits) return;
    this.chainBits = bits;
    for (const m of this.chainMeshes) m.removeFromParent();
    this.chainMeshes = [];
    if (!bits) return;
    const g = chainGeometry(r, width);
    this.wheels.forEach((w, i) => {
      if (!(bits & (1 << i))) return;
      const m = new Mesh(g, chainMaterial());
      m.castShadow = true;
      w.spin.add(m);
      this.chainMeshes.push(m);
    });
  }

  /** (plan 93 S5) a door's sill — its glass's foot (the body's frame: its height, and how far out its outer face
   *  is from the middle) — measured once off the glass itself, the door shut */
  private sills = new Map<number, { y: number; out: number } | null>();
  sillOf(door: number): { y: number; out: number } | null {
    if (this.sills.has(door)) return this.sills.get(door) ?? null;
    const name = this.e.doors[door];
    const p = name ? this.parts.get(name) : undefined;
    let got: { y: number; out: number } | null = null;
    if (p) {
      this.body.updateWorldMatrix(true, true);
      const inv = new Matrix4().copy(this.body.matrixWorld).invert();
      const box = new Box3();
      const all = new Box3();
      p.holder.traverse((x) => {
        const m = x as Mesh;
        const n = (m.material as Material | undefined)?.name;
        if (!m.isMesh || (n !== "glass" && n !== "glass_tint")) return;
        m.geometry.computeBoundingBox();
        if (!m.geometry.boundingBox) return;
        box.copy(m.geometry.boundingBox).applyMatrix4(new Matrix4().multiplyMatrices(inv, m.matrixWorld));
        all.union(box);
      });
      if (!all.isEmpty()) got = { y: all.min.y, out: Math.max(Math.abs(all.min.z), Math.abs(all.max.z)) };
    }
    this.sills.set(door, got);
    return got;
  }

  // ── (plan 93 S1) where it's been shot: a hole and its chipped ring, on the body's own skin ──
  // (plan 95 F4a, point 6: each on the very piece it's in — a door's, the bonnet's, the body's —, so it swings, falls,
  // drops and goes with it; found from just off the skin along its own way out where the shooter's screen gave it,
  // else its face's)
  private holesWant: readonly Hole[] | null = null;
  private holesKey = "";
  private dentsKey = "";
  private holeMeshes: InstancedMesh[] = [];
  setHoles(all: readonly Hole[]) {
    this.holesWant = all;
    if (!this.ready) return;
    // (plan 95 F5a: those in glass — the windscreen's stars, where a pane cracked from)
    this.setStars(all.filter((x) => x.pane !== undefined));
    const list = all.filter((x) => x.pane === undefined);
    const key = list.map((x) => `${x.u},${x.w},${x.h},${x.face},${x.n?.join("/") ?? ""}`).join(";");
    if (key === this.holesKey) return;
    this.holesKey = key;
    for (const m of this.holeMeshes) {
      m.removeFromParent();
      m.dispose();
    }
    this.holeMeshes = [];
    if (!list.length) return;
    // (the body's own skin: what isn't glass, a light or a plate)
    const skins: Object3D[] = [];
    this.root.traverseVisible((o) => {
      const m = o as Mesh;
      if (!m.isMesh || (m as { isInstancedMesh?: boolean }).isInstancedMesh || m.userData.hole) return;
      const n = (m.material as Material | undefined)?.name ?? "";
      if (!/glass|emit_|plate|screen|collider|lens/.test(n) && !/collider/.test(m.name) && m.userData.paneOf === undefined)
        skins.push(m);
    });
    // (plan 96 F4a: each part at rest while they're laid — a bonnet sprung, a door hanging: on it as it was)
    const back = this.partsAtRest();
    this.root.updateMatrixWorld(true);
    const ray = new Raycaster();
    const N: [number, number, number][] = [
      [-1, 0, 0], // front (the model faces −x)
      [1, 0, 0],
      [0, 0, 1], // its left: +z
      [0, 0, -1],
      [0, 1, 0],
    ];
    // (each piece's: where on it, in its own frame)
    const on = new Map<Object3D, Matrix4[]>();
    const q = new Quaternion();
    const spinQ = new Quaternion();
    const Z = new Vector3(0, 0, 1);
    const hits: Intersection[] = [];
    for (const h of list) {
      // (the car's frame to the model's: forward −x, right −z, up y)
      const n = h.n ? [-h.n[0], h.n[2], -h.n[1]] : (N[h.face] ?? N[0]);
      const p = v1.set(-h.u, h.h, -h.w);
      const nb = v2.set(n[0], n[1], n[2]).normalize();
      const at = this.body.localToWorld(p.clone());
      const from = this.body.localToWorld(p.clone().addScaledVector(nb, 0.3));
      const dir = nb.clone().transformDirection(this.body.matrixWorld).negate();
      ray.set(from, dir);
      ray.far = 0.9;
      hits.length = 0;
      ray.intersectObjects(skins, false, hits);
      // (the skin nearest the point it was struck at — not a mirror or a trim it might pass first)
      let hit: Intersection | null = null;
      for (const x of hits) if (x.face && (!hit || x.point.distanceTo(at) < hit.point.distanceTo(at))) hit = x;
      if (!hit?.face) continue;
      const obj = hit.object;
      const wn = hit.face.normal.clone().transformDirection(obj.matrixWorld);
      if (wn.dot(dir) > 0) wn.negate();
      const inv = m4.copy(obj.matrixWorld).invert();
      const local = hit.point.clone().addScaledVector(wn, 0.003).applyMatrix4(inv);
      const ln = wn.clone().transformDirection(inv).normalize();
      // (its own scale undone: the hole the size of a round on any piece; each its own way round)
      const sc = new Vector3().setFromMatrixScale(obj.matrixWorld);
      q.setFromUnitVectors(Z, ln).multiply(spinQ.setFromAxisAngle(Z, (on.size + (on.get(obj)?.length ?? 0)) * 2.39996 + h.u * 7));
      let list2 = on.get(obj);
      if (!list2) on.set(obj, (list2 = []));
      list2.push(new Matrix4().compose(local, q, new Vector3(1 / (sc.x || 1), 1 / (sc.y || 1), 1 / (sc.z || 1))));
    }
    back();
    if (!on.size) return;
    // (plan 96 F3a: each a 6 cm mark — the hole, the bare metal, the scorch — in one draw a piece)
    this.markMat ??= this.mat(
      new MeshBasicMaterial({
        map: markTex(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    if (!this.markGeo) {
      this.markGeo = new PlaneGeometry(MARK_SIZE, MARK_SIZE);
      this.geos.push(this.markGeo);
    }
    for (const [obj, at] of on) {
      const m = new InstancedMesh(this.markGeo, this.markMat, at.length);
      at.forEach((x, i) => {
        m.setMatrixAt(i, x);
      });
      m.renderOrder = 2;
      m.frustumCulled = false;
      m.userData.hole = true;
      m.userData.mark = true;
      obj.add(m);
      m.updateMatrixWorld(true);
      this.holeMeshes.push(m);
    }
  }
  private markMat: MeshBasicMaterial | null = null;
  private markGeo: PlaneGeometry | null = null;

  /** (plan 96 F4a) Each part a round can move (the bonnet, the boot lid, a door, a bumper, a mirror) put at rest —
   *  its pivot unturned, its place as it was —, the matrices made; returned, a way to put them back as they were. */
  private partsAtRest(): () => void {
    const kept: [Object3D, Vector3, Quaternion][] = [];
    for (const [name, p] of this.parts) {
      if (!/^(bonnet|boot|bumper_[fr]|mirror_[lr]|door_)/.test(name)) continue;
      const a = p.anim;
      const at = a.userData.at as Vector3 | undefined;
      const turned = Math.abs(a.quaternion.w) < 0.99999;
      if (!turned && (!at || a.position.equals(at))) continue;
      kept.push([a, a.position.clone(), a.quaternion.clone()]);
      a.quaternion.identity();
      if (at) a.position.copy(at);
      // (its own matrices and all under it: a parked car's still model isn't walked again from its root)
      a.updateMatrix();
      a.updateWorldMatrix(false, true);
    }
    return () => {
      for (const [a, pos, q] of kept) {
        a.position.copy(pos);
        a.quaternion.copy(q);
        a.updateMatrix();
        a.updateWorldMatrix(false, true);
      }
    };
  }

  // ── (plan 95 F5a) its glass where rounds went in: a star on the windscreen at each, staying (laminated); a side's
  // or the rear's crack drawn from the first that struck it ──
  private starsKey = "";
  private starMeshes: InstancedMesh[] = [];
  private starsN = 0;
  /** each pane's crack's middle (its own glass's frame), where its first round went in; null: its middle */
  private crackAt: (Vector3 | null)[] = [null, null, null, null, null, null];
  private starMat: MeshBasicMaterial | null = null;
  private starGeo: PlaneGeometry | null = null;
  private setStars(list: readonly Hole[]) {
    const key = list.map((x) => `${x.u},${x.w},${x.h},${x.pane},${x.n?.join("/") ?? ""}`).join(";");
    if (key === this.starsKey) return;
    this.starsKey = key;
    for (const m of this.starMeshes) {
      m.removeFromParent();
      m.dispose();
    }
    this.starMeshes = [];
    this.crackAt = [null, null, null, null, null, null];
    this.starsN = 0;
    // (each pane's own glass: not its two-pass twin, not a crack laid on it)
    const panes: Mesh[][] = [[], [], [], [], [], []];
    this.root.traverse((o) => {
      const m = o as Mesh;
      const i = m.userData.pane as number | undefined;
      if (m.isMesh && typeof i === "number" && !m.userData.twoPassFront) panes[i]?.push(m);
    });
    const back = this.partsAtRest();
    this.root.updateMatrixWorld(true);
    const ray = new Raycaster();
    const N: [number, number, number][] = [
      [-1, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0, 1, 0],
    ];
    const hits: Intersection[] = [];
    const Z = new Vector3(0, 0, 1);
    const q = new Quaternion();
    const spin = new Quaternion();
    const on = new Map<Object3D, Matrix4[]>();
    list.forEach((h, k) => {
      const i = h.pane as number;
      const glass = panes[i];
      if (!glass?.length) return;
      if (i > 0 && this.crackAt[i]) return;
      const n = h.n ? [-h.n[0], h.n[2], -h.n[1]] : (N[h.face] ?? N[0]);
      const p = v1.set(-h.u, h.h, -h.w);
      const nb = v2.set(n[0], n[1], n[2]).normalize();
      const at = this.body.localToWorld(p.clone());
      ray.set(this.body.localToWorld(p.clone().addScaledVector(nb, 0.3)), nb.clone().transformDirection(this.body.matrixWorld).negate());
      ray.far = 0.9;
      hits.length = 0;
      ray.intersectObjects(glass, false, hits);
      let hit: Intersection | null = null;
      for (const x of hits) if (x.face && (!hit || x.point.distanceTo(at) < hit.point.distanceTo(at))) hit = x;
      if (!hit?.face) return;
      const obj = hit.object;
      const inv = m4.copy(obj.matrixWorld).invert();
      const local = hit.point.clone().applyMatrix4(inv);
      if (i > 0) {
        this.crackAt[i] = local;
        return;
      }
      const wn = hit.face.normal.clone().transformDirection(obj.matrixWorld);
      const ln = wn.transformDirection(inv).normalize();
      const sc = new Vector3().setFromMatrixScale(obj.matrixWorld);
      // (each its own way round: the same star never twice the same)
      q.setFromUnitVectors(Z, ln).multiply(spin.setFromAxisAngle(Z, k * 2.39996));
      let l2 = on.get(obj);
      if (!l2) on.set(obj, (l2 = []));
      l2.push(new Matrix4().compose(local.addScaledVector(ln, 0.002), q, new Vector3(1 / (sc.x || 1), 1 / (sc.y || 1), 1 / (sc.z || 1))));
      this.starsN++;
    });
    back();
    if (on.size) {
      this.starMat ??= this.mat(
        new MeshBasicMaterial({
          map: crackTex(false, false, true),
          transparent: true,
          depthWrite: false,
          opacity: 0.95,
          side: DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        }),
      );
      // (a star's reach: a round's in laminated glass, ~35 cm across — one plane for every star the car has, made
      // once: a new one each time they were laid again stayed till the car's model went, plan 97 L1)
      if (!this.starGeo) {
        this.starGeo = new PlaneGeometry(0.36, 0.36);
        this.geos.push(this.starGeo);
      }
      const g = this.starGeo;
      for (const [obj, at] of on) {
        const m = new InstancedMesh(g, this.starMat, at.length);
        at.forEach((x, j) => {
          m.setMatrixAt(j, x);
        });
        m.renderOrder = 4;
        m.frustumCulled = false;
        m.userData.hole = true;
        obj.add(m);
        m.updateMatrixWorld(true);
        this.starMeshes.push(m);
      }
    }
    // (the whole windscreen picture only without stars; each side's crack from its own point)
    if (this.crack) this.crack.mesh.visible = !!(this.partBits & PART.screen) && !(this.partBits & PART.screenGone) && !this.starsN;
    this.root.traverse((x) => {
      const m = x as Mesh;
      const i = m.userData.crackOf as number | undefined;
      if (!m.isMesh || typeof i !== "number" || i === 0) return;
      const uv = crackUV(m.geometry.getAttribute("position") as BufferAttribute, this.crackAt[i]);
      const at = m.geometry.getAttribute("uv") as BufferAttribute | undefined;
      if (at && at.array.length === uv.length) {
        (at.array as Float32Array).set(uv);
        at.needsUpdate = true;
      } else m.geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    });
  }
  /** (plan 95 F5a) A point on it in its own frame (u forward, w right, h up: m) where the model's root has it. */
  skinAt(u: number, w: number, h: number, out: Vector3): Vector3 {
    this.root.updateMatrixWorld();
    this.body.localToWorld(out.set(-u, h, -w));
    return this.root.worldToLocal(out);
  }

  /** the road wheels' angle, + to the right (the model faces −x: a right turn is −y) */
  setSteer(road: number) {
    for (const w of this.wheels) if (w.front) w.steer.rotation.y = -road;
    this.steering.rotation.z = -road * (this.e.pivots.steering?.ratio ?? 15);
  }
  setLights(l: Lights) {
    this.lights = l;
    const set = (k: string, v: number) => {
      for (const m of this.lampMats.get(k) ?? []) m.emissiveIntensity = v;
    };
    const head = (l.beams === "off" ? 0 : l.beams === "low" ? 2.2 : 3.4) * this.lampK;
    // (a broken lamp's out: docs/plan/92 phase 9)
    const P = this.partBits;
    set("emit_head", head);
    set("emit_head_l", P & PART.headL ? 0 : head);
    set("emit_head_r", P & PART.headR ? 0 : head);
    const tl = Math.max(l.tail || l.beams !== "off" ? 0.9 : 0, l.brake * 2.4);
    set("emit_tail", tl);
    set("emit_tail_l", P & PART.tailL ? 0 : tl);
    set("emit_tail_r", P & PART.tailR ? 0 : tl);
    set("emit_brake", l.brake * 3.2);
    set("emit_reverse", l.reverse ? 2.2 : 0);
    set("emit_ind_l", l.ind === 1 || l.hazard ? 2.6 : 0);
    set("emit_ind_r", l.ind === -1 || l.hazard ? 2.6 : 0);
    const d = Math.max(0, Math.min(1, l.dash));
    if (this.screenMat) this.screenMat.color.setScalar(0.3 + 0.7 * d);
    if (this.radioMat) this.radioMat.color.setScalar(0.3 + 0.7 * d);
    this.tail.material.opacity = (l.tail ? 0.35 : 0) + 0.45 * l.brake;
    this.tail.visible = this.tail.material.opacity > 0.01;
    // (the tracks' rollers turned with the wheels: asked every frame, as the lamps are)
    if (this.rollers.length) {
      const a = this.wheels[2]?.spin.rotation.z ?? 0;
      for (const r of this.rollers) r.g.rotation.z = a * r.k;
    }
  }
  setCluster(c: Cluster) {
    if (!this.screenMat) return;
    if (!this.cluster) {
      const cv = document.createElement("canvas");
      cv.width = 1024;
      cv.height = 256;
      const t = new CanvasTexture(cv);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
      this.cluster = { c: cv, t };
      this.screenMat.map = t;
      this.screenMat.needsUpdate = true;
    }
    drawCluster(this.cluster.c, c);
    this.cluster.t.needsUpdate = true;
    // (the gauges' own needles, where the cabin has them: about the file's −x)
    const fuel = this.parts.get("needle_fuel");
    if (fuel) fuel.anim.rotation.x = (0.5 - Math.max(0, Math.min(1, c.fuel))) * 1.6;
    const temp = this.parts.get("needle_temp");
    if (temp) temp.anim.rotation.x = (0.5 - Math.max(0, Math.min(1, c.temp))) * 1.6;
  }
  setRadio(band: "FM" | "AM" | "TAPE", f: number, preset: number) {
    // (the radio's window, where the cabin has one: drawn on a canvas of this car's own — once it's in)
    this.radioSays = [band, f, preset];
    if (!this.radioMat) return;
    if (!this.radio) {
      const cv = document.createElement("canvas");
      cv.width = 512;
      cv.height = 128;
      const t = new CanvasTexture(cv);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      this.radio = { c: cv, t };
      this.radioMat.map = t;
      this.radioMat.needsUpdate = true;
    }
    drawRadio(this.radio.c, band, f, preset);
    this.radio.t.needsUpdate = true;
  }
  setScreenSnow(t: Texture | null) {
    const m = this.snowMat;
    if (!m || !this.snowPane) return;
    if (m.map === t) return;
    const had = !!m.map;
    m.map = t;
    m.emissiveMap = t;
    if (had !== !!t) m.needsUpdate = true;
    this.snowPane.visible = !!t && !(this.partBits & PART.screenGone);
  }
  setEnv(t: Texture | null) {
    this.env = t;
    for (const m of this.envMats) {
      if (m.envMap === t) continue;
      const had = !!m.envMap;
      m.envMap = t;
      if (had !== !!t) m.needsUpdate = true;
    }
  }
  setBeacon(on: boolean, t: number) {
    this.beacon = { on, t };
    const set = (k: string, v: number) => {
      for (const m of this.lampMats.get(k) ?? []) m.emissiveIntensity = v;
    };
    // (the police's bar: red, then blue, twice a second each; the taxi's sign lit while free; a work
    // vehicle's beacon turning)
    const red = Math.floor(t * 4) % 2 === 0;
    set("emit_beacon_r", on && red ? 4 : 0.1);
    set("emit_beacon_b", on && !red ? 4 : 0.1);
    set("emit_sign", on ? 1.6 : 0.15);
    set("emit_beacon", on ? 0.4 + 3.6 * Math.max(0, Math.sin(t * 9)) ** 4 : 0.05);
  }
  setWear(grime: number, dmg: readonly number[], parts = 0, wreck = 0, fire = 0) {
    this.wear.uGrime.value = Math.max(0, Math.min(1, grime));
    for (let i = 0; i < 5; i++) this.dmg[i] = Math.max(0, Math.min(1, dmg[i] ?? 0));
    // (its dents: the file's own, pressed in by how hard each side was hit — the roof by a roll)
    const names = ["dent_front", "dent_rear", "dent_left", "dent_right", "dent_roof"];
    for (const m of this.paintMeshes) {
      const d = m.morphTargetDictionary;
      const inf = m.morphTargetInfluences;
      if (!d || !inf) continue;
      for (let i = 0; i < 5; i++) {
        const j = d[names[i]];
        // (plan 94 P2: past half, pressed in past the file's own dent — to 1.4 of it)
        const z = this.dmg[i];
        if (j !== undefined) inf[j] = z * (1 + 0.4 * Math.max(0, Math.min(1, (z - 0.5) * 2)) ** 2);
      }
    }
    // (plan 96 F3a: its dents changed — its holes laid again on the skin as it is now, not left under it)
    const dents = this.dmg.map((x) => x.toFixed(3)).join(",");
    if (dents !== this.dentsKey) {
      this.dentsKey = dents;
      if (this.ready && this.holesWant?.some((x) => x.pane === undefined)) {
        this.holesKey = "";
        this.setHoles(this.holesWant);
      }
    }
    // (before its file's in: kept, shown as it comes — adopt)
    if (!this.ready) {
      this.partBits = parts;
      this.wreckBits = wreck;
      this.burntWant = fire >= 3;
    } else {
      if (parts !== this.partBits) this.setParts(parts);
      if (wreck !== this.wreckBits) this.setWreck(wreck);
      this.setBurnt(fire >= 3);
    }
    // (where it is, for the dirt up its sides: the paint's own frame)
    this.root.updateWorldMatrix(true, false);
    this.wear.uCarInv.value.copy(this.root.matrixWorld).invert();
    const k = this.dmg[0] > 0.6 ? 0.35 : 1;
    if (k !== this.lampK) {
      this.lampK = k;
      this.setLights(this.lights);
    }
  }
  setSnow(k: number) {
    this.wear.uSnow.value = k;
  }

  /** Parked for good (docs/plan/92 phase 10): its dents pressed into copies of its panels as they are now (a
   *  morph can't be merged), and every piece — the doors', the wheels', the bonnet's under their pivots — drawn
   *  merged in the car's own frame, one mesh per material: a parked car in a handful of draws, not a hundred.
   *  Nothing on it moves after (the dents changed: cars.ts builds it again). The paint's wear works in the
   *  car's frame (uCarInv), so the pieces moved into it read the same. */
  bakeStill(): number {
    if (!this.ready) return 0;
    const own = new Set<BufferGeometry>();
    // (the paint's and whatever else the file dents with it — the bumpers' chrome, the rubbers)
    const morphed: Mesh[] = [];
    this.root.traverse((x) => {
      const m = x as Mesh;
      if (m.isMesh && m.geometry.morphAttributes.position?.length) morphed.push(m);
    });
    for (const m of morphed) {
      const inf = m.morphTargetInfluences ?? [];
      const src = m.geometry;
      const morphs = src.morphAttributes.position ?? [];
      const g = src.clone();
      g.userData = {};
      const pos = g.getAttribute("position");
      const rel = src.morphTargetsRelative;
      for (let j = 0; j < morphs.length; j++) {
        const w = inf[j] ?? 0;
        if (!w) continue;
        const mp = morphs[j];
        for (let i = 0; i < pos.count; i++)
          for (let c = 0; c < 3; c++) {
            const base = pos.getComponent(i, c);
            const t = mp.getComponent(i, c);
            pos.setComponent(i, c, base + w * (rel ? t : t - src.getAttribute("position").getComponent(i, c)));
          }
      }
      g.morphAttributes = {};
      g.morphTargetsRelative = false;
      m.geometry = g;
      m.morphTargetInfluences = undefined;
      m.morphTargetDictionary = undefined;
      own.add(g);
    }
    this.root.updateMatrixWorld(true);
    const inv = new Matrix4().copy(this.root.matrixWorld).invert();
    const into = new Map<Mesh, Matrix4>();
    const walk = (o: Object3D) => {
      for (const c of o.children) {
        if (!c.visible || c === this.tail) continue;
        const m = c as Mesh;
        if (m.isMesh && !m.children.length) into.set(m, new Matrix4().multiplyMatrices(inv, m.matrixWorld));
        else walk(c);
      }
    };
    walk(this.root);
    // (its glass and lenses too: one car's see-through pieces of a material blend among themselves)
    const { used } = mergeWith([...into.keys()], this.root, (m) => into.get(m) as Matrix4, true);
    for (const m of used) {
      m.removeFromParent();
      if (own.has(m.geometry)) m.geometry.dispose();
    }
    return used.length;
  }

  /** What it broke (docs/plan/92 phase 9): the bumper hanging off one end, or gone; a mirror folded back;
   *  a lamp out (setLights); the windscreen cracked; a side's windows gone. Shown again from nothing each
   *  time (mended: all back). */
  private setParts(bits: number) {
    this.partBits = bits;
    const b = this.parts.get("bumper_f");
    if (b) {
      const hang = !!(bits & PART.bumperHang);
      // (hanging: one end down, a little out — the file's x ahead, so a roll about it drops a side)
      // (its pivot's own place kept: the offset on top of it)
      const at = (b.anim.userData.at as Vector3 | undefined) ?? b.anim.position.clone();
      b.anim.userData.at = at;
      // (hanging by its right end: turned about the car's length round that end, its left end down near the
      // road, a little out at the bottom)
      const th = hang ? -0.18 : 0;
      const zr = this.e.dims.width * 0.42;
      b.anim.rotation.set(th, 0, hang ? -0.05 : 0);
      b.anim.position.set(at.x + (hang ? 0.02 : 0), at.y + zr * Math.sin(th), at.z + zr * (1 - Math.cos(th)));
      b.anim.visible = !(bits & PART.bumperGone);
    }
    // (folded back on its hinge: the left's out along −z swung toward the back, the right's along +z)
    const ml = this.parts.get("mirror_l");
    if (ml) ml.anim.rotation.y = bits & PART.mirrorL ? 1.15 : 0;
    const mr = this.parts.get("mirror_r");
    if (mr) mr.anim.rotation.y = bits & PART.mirrorR ? -1.15 : 0;
    // (plan 94 P3: each pane cracked, or gone — its glass hidden; plan 93 S5: a window wound down stays down)
    this.crackPanes(bits);
    this.showPanes(bits);
    // (plan 93 S1: a flat tyre down on its rim — a parked car's here; a driven one's set each frame as it goes)
    // (plan 95 F6a: down on its rim, its corner sagging, its tyre squashed)
    let fl = 0;
    FLATS.forEach((b, i) => {
      if (bits & b) fl |= 1 << i;
    });
    this.setFlats(fl);
    this.wheels.forEach((w, i) => {
      if (w.rest) w.steer.position.y = w.rest.y + this.flatY[i];
    });
    this.flatsTick();
    // (the windscreen: its crack on a pane over the glass, as the snow's)
    const screen = bits & (PART.screen | PART.screenBad);
    if (screen && this.snowPane && !this.crack) {
      const mat = this.mat(
        new MeshBasicMaterial({
          map: crackTex(),
          transparent: true,
          depthWrite: false,
          opacity: 0.85,
          side: DoubleSide,
        }),
      );
      const mesh = new Mesh(this.snowPane.geometry, mat);
      mesh.renderOrder = 3;
      mesh.userData.paneOf = 0;
      this.glb.add(mesh);
      this.crack = { mesh, mat };
    }
    if (this.crack) {
      // (plan 95 F5a: its rounds' stars where they went in instead — the whole picture a crash's)
      this.crack.mesh.visible = !!screen && !(bits & PART.screenGone) && !this.starsN;
      const bad = !!(bits & PART.screenBad);
      if (this.crack.mat.map !== crackTex(bad)) {
        this.crack.mat.map = crackTex(bad);
        this.crack.mat.needsUpdate = true;
      }
    }
    this.setLights(this.lights);
  }

  private burntWant = false;
  /** (plan 94 G5) A corner jacked up: wheel `i` (FL FR RL RR) off the ground by `k` of 6 cm — the body turned about
   *  the far corner (that one down, the two beside half up); 0 down again. */
  liftCorner(i: number, k: number) {
    const name = ["fl", "fr", "rl", "rr"][i];
    const hub = this.e.hubs[name] ?? this.e.points[`hub_${name}`];
    if (!hub) return;
    const p = toModel(hub, v1);
    const h = 0.06 * Math.max(0, Math.min(1, k));
    // (small turns: the hub up h, the far corner still — a quarter of it from each turn, half from the rise)
    this.lift.x = Math.abs(p.z) > 0.1 ? -h / (4 * p.z) : 0;
    this.lift.z = Math.abs(p.x) > 0.1 ? h / (4 * p.x) : 0;
    this.lift.y = h / 2;
    this.poseBody();
  }
  /** the body's tilt and rise: a corner jacked (liftCorner) and its flats' sag (setFlats), together */
  private lift = { x: 0, z: 0, y: 0 };
  private sag = { x: 0, z: 0, y: 0 };
  private poseBody() {
    this.body.rotation.x = this.lift.x + this.sag.x;
    this.body.rotation.z = this.lift.z + this.sag.z;
    this.body.position.y = this.lift.y + this.sag.y;
    if (!this.body.matrixAutoUpdate) {
      this.body.updateMatrix();
      this.body.updateMatrixWorld(true);
    }
  }

  // ── (plan 95 F6a) a flat: its tyre squashed where it sits, its hub FLAT_DROP down, its corner sagging ──
  private tyreMat: MeshStandardMaterial | null = null;
  private readonly flatU: FlatU = {
    hub: { value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()] },
    axle: { value: [new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 0)] },
    size: { value: new Vector2(0.3, 0.15) },
  };
  private flatBits = 0;
  /** each wheel's hub's own rise against its body (m: its rest + its spring's + this), the body's sag undone at
   *  the good ones, the flat's down — the rig's, the others', a parked car's (setParts) */
  readonly flatY = [0, 0, 0, 0];
  /** The flats (bits FL FR RL RR): the body tipped to them — a plane through its corners as near as can be to
   *  each flat one FLAT_DROP down and the others where they were —, each hub put where it sits on its tyre. */
  setFlats(bits: number) {
    bits &= 15;
    if (bits === this.flatBits && this.flatSeen) return;
    const now = performance.now() / 1000;
    for (let i = 0; i < 4; i++) {
      const on = !!(bits & (1 << i));
      const was = !!(this.flatBits & (1 << i));
      // (plan 96 F5a: newly blown, its collapse from now; first seen flat, or mended: as it is)
      if (on && !was && this.flatSeen) this.flatT0[i] = now;
      else if (on !== was || !this.flatSeen) {
        this.flatT0[i] = -9;
        this.flatK[i] = on ? 1 : 0;
      }
    }
    this.flatSeen = true;
    this.flatBits = bits;
    this.flatsStep();
    this.applyFlats();
    this.flatsTick();
  }
  /** (plan 96 F5a) each wheel's flat as far as it's gone (0 up … 1 down; past 1 a moment, the corner's dip), when
   *  its blowout began (s, performance's clock; −9 none going), whether it's been seen */
  private readonly flatK = [0, 0, 0, 0];
  private readonly flatT0 = [-9, -9, -9, -9];
  private flatSeen = false;
  /** (plan 96 F5a) A blowout going: true while any wheel's collapse is under way. */
  flatsBusy(): boolean {
    const now = performance.now() / 1000;
    return this.flatT0.some((t) => t > 0 && now - t < FLAT_S + 0.05);
  }
  /** (plan 96 F5a) Each blowing wheel's flat by its curve: the tyre gone in a quick collapse, the corner dipping a
   *  little past it and back — done in FLAT_S. */
  private flatsStep(): boolean {
    const now = performance.now() / 1000;
    let moved = false;
    for (let i = 0; i < 4; i++) {
      const t0 = this.flatT0[i];
      if (t0 < 0) continue;
      const u = Math.min(1, (now - t0) / FLAT_S);
      const fall = 1 - (1 - u) ** 3;
      const dip = 0.18 * Math.sin(Math.PI * Math.max(0, Math.min(1, (u - 0.45) / 0.55)));
      const k = u >= 1 ? 1 : fall + dip;
      if (k !== this.flatK[i]) moved = true;
      this.flatK[i] = k;
      if (u >= 1) this.flatT0[i] = -9;
    }
    return moved;
  }
  /** The flats as far as each has gone: the body tipped to them — a plane through its corners as near as can be to
   *  each one its drop down and the others where they were —, each hub put where it sits on its tyre. */
  private applyFlats() {
    const P: Vector3[] = [];
    const v: number[] = [];
    ["fl", "fr", "rl", "rr"].forEach((k, i) => {
      const hub = this.e.hubs[k] ?? this.e.points[`hub_${k}`];
      P.push(hub ? toModel(hub, new Vector3()) : new Vector3());
      v.push(-FLAT_DROP * this.flatK[i]);
    });
    const mx = P.reduce((a, p) => a + p.x, 0) / 4;
    const mz = P.reduce((a, p) => a + p.z, 0) / 4;
    const c = v.reduce((a, b) => a + b, 0) / 4;
    let sxx = 0;
    let szz = 0;
    let gx = 0;
    let gz = 0;
    P.forEach((p, i) => {
      sxx += (p.x - mx) ** 2;
      szz += (p.z - mz) ** 2;
      gx += v[i] * (p.x - mx);
      gz += v[i] * (p.z - mz);
    });
    gx = sxx > 1e-6 ? gx / sxx : 0;
    gz = szz > 1e-6 ? gz / szz : 0;
    // (a turn about z lifts +x by x·θ; about x lowers +z by z·φ)
    this.sag.z = gx;
    this.sag.x = -gz;
    this.sag.y = c - gx * mx - gz * mz;
    this.poseBody();
    P.forEach((p, i) => {
      const plane = this.sag.y + gx * p.x + gz * p.z;
      this.flatY[i] = v[i] - plane;
    });
  }
  /** (plan 95 F6a) Each frame a flat's car moves (and once, set): its flat tyres' hubs and axles, where they are.
   *  (plan 96 F5a) A blowout going, its flat as far as it's gone first; `wheels`: no one else poses its wheels (a
   *  parked car) — put them on their hubs' rise here. */
  flatsTick(wheels = false) {
    if (this.flatsStep()) {
      this.applyFlats();
      if (wheels)
        this.wheels.forEach((w, i) => {
          if (!w.rest) return;
          w.steer.position.y = w.rest.y + this.flatY[i];
          w.steer.updateMatrix();
          w.steer.updateWorldMatrix(false, true);
        });
    }
    const U = this.flatU;
    if (!this.flatBits) {
      for (const h of U.hub.value) h.w = 0;
      return;
    }
    U.size.value.set(this.e.wheel.r, this.e.wheel.width * 0.5 + 0.06);
    this.root.updateMatrixWorld();
    this.wheels.forEach((w, i) => {
      const h = U.hub.value[i];
      if (!(this.flatBits & (1 << i))) {
        h.w = 0;
        return;
      }
      w.spin.updateWorldMatrix(true, false);
      w.spin.getWorldPosition(v1);
      // (the tyre squashed as far as it's gone — its dip past it a little more)
      h.set(v1.x, v1.y, v1.z, FLAT_DROP * Math.max(0.001, this.flatK[i]));
      U.axle.value[i].set(0, 0, 1).transformDirection(w.spin.matrixWorld);
    });
  }
  /** (plan 94 G5) A wheel off its hub (changed), or on. */
  wheelShown(i: number, on: boolean) {
    const w = this.wheels[i];
    if (w) w.steer.visible = on;
  }
  /** (plan 94 P1) Where its engine burns: the middle of its bay, the model's coords. */
  engineAt(out: Vector3): Vector3 {
    const front = this.e.pivots.bumper_f?.at[1] ?? 0.45;
    return toModel([this.e.dims.ahead - 0.8, front + 0.2, 0], out);
  }
  /** (plan 94 P1) Burnt out, or not: every material a charred copy of itself (the paint near black, the metal dark,
   *  matt), its glass, lenses, lamps and tyres gone; or all as it was (made new). */
  private setBurnt(on: boolean) {
    if (on === this.burnt) return;
    this.burnt = on;
    // (its tyres burnt away: down on its rims)
    this.glb.position.y = on ? -this.e.wheel.r * 0.3 : 0;
    this.glb.updateMatrix();
    this.glb.updateMatrixWorld(true);
    const GONE = /glass|lens|emit|tyre|reflector/;
    this.root.traverse((x) => {
      const m = x as Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const ud = m.userData;
      if (!on) {
        if (ud.unburnt) m.material = ud.unburnt as Material;
        if (ud.burntHid !== undefined) m.visible = ud.burntHid as boolean;
        delete ud.unburnt;
        delete ud.burntHid;
        return;
      }
      // (plan 95 point 6: its holes stay as they are, on the charred skin)
      if (ud.hole) return;
      const mat = m.material as Material;
      const n = mat.name ?? "";
      if (GONE.test(n) || ud.crackOf !== undefined) {
        ud.burntHid = m.visible;
        m.visible = false;
        return;
      }
      let c = this.charred.get(mat);
      if (!c) {
        c = mat.clone();
        c.onBeforeCompile = mat.onBeforeCompile;
        c.customProgramCacheKey = mat.customProgramCacheKey;
        c.userData = { ...mat.userData };
        const k = c as MeshStandardMaterial;
        if (k.color) k.color.lerp(new Color(/paint/.test(n) ? 0x1c1612 : 0x121110), 0.94);
        if (k.map) k.map = null;
        if (k.roughness !== undefined) k.roughness = 1;
        if (k.metalness !== undefined) k.metalness = 0.15;
        if (k.emissive) k.emissive.setHex(0);
        c.needsUpdate = true;
        this.mine.push(c);
        this.charred.set(mat, c);
      }
      ud.unburnt = mat;
      m.material = c;
    });
  }
  /** (plan 94 P2) What's come off or hangs, shown: each door hanging off its lower hinge or gone; the bonnet and
   *  the boot lid sprung (a little up) or gone; the rear bumper hanging or gone; a mirror off. Shown again from
   *  nothing each time (mended: all back). */
  private setWreck(bits: number) {
    this.wreckBits = bits;
    const fix = (g: Group) => {
      if (!g.matrixAutoUpdate) {
        g.updateMatrix();
        g.updateMatrixWorld(true);
      }
    };
    this.e.doors.forEach((name, i) => {
      const slot = doorSlot(name);
      const st = slot < 0 ? 0 : bits & DOOR_GONE[slot] ? 2 : bits & DOOR_HANG[slot] ? 1 : 0;
      this.doorState[i] = st;
      const p = this.parts.get(name);
      if (p) p.outer.visible = st !== 2;
      this.doors[i]?.open(this.doorA[i] ?? 0);
    });
    const lid = (names: string[], loose: boolean, gone: boolean, a: number) => {
      for (const n of names) {
        const p = this.parts.get(n);
        if (!p) continue;
        p.outer.visible = !gone;
        if (loose) this.lidMin.set(n, a);
        else this.lidMin.delete(n);
        this.setPart(n, this.lidA.get(n) ?? 0);
      }
    };
    lid(["bonnet"], !!(bits & WRECK.bonnetLoose), !!(bits & WRECK.bonnetGone), 0.13);
    lid(["boot", "boot_l", "boot_r"], !!(bits & WRECK.bootLoose), !!(bits & WRECK.bootGone), 0.11);
    const ml = this.parts.get("mirror_l");
    if (ml) ml.outer.visible = !(bits & WRECK.mirrorLOff);
    const mr = this.parts.get("mirror_r");
    if (mr) mr.outer.visible = !(bits & WRECK.mirrorROff);
    const b = this.parts.get("bumper_r");
    if (b) {
      this.hangBumper(b, !!(bits & WRECK.bumperRHang), -1);
      b.outer.visible = !(bits & WRECK.bumperRGone);
      fix(b.anim);
    }
  }
  /** A bumper hanging by its right end (turned about the car's length round that end: its left end down near the
   *  road, a little out at the bottom), or back on. `out`: the way out of the car at its end (the file's x). */
  private hangBumper(b: Part, hang: boolean, out: 1 | -1) {
    const at = (b.anim.userData.at as Vector3 | undefined) ?? b.anim.position.clone();
    b.anim.userData.at = at;
    const th = hang ? -0.18 : 0;
    const zr = this.e.dims.width * 0.42;
    b.anim.rotation.set(th, 0, hang ? -0.05 * out : 0);
    b.anim.position.set(at.x + (hang ? 0.02 * out : 0), at.y + zr * Math.sin(th), at.z + zr * (1 - Math.cos(th)));
  }
  /** (plan 94 P2) The rear bumper out of the body's own meshes: what's chrome, trim or rubber at its back end and
   *  low — moved into a part of its own (`bumper_r`) about its middle, to hang and come off as the front's does.
   *  In the file's frame, before the parts move; nothing if the file's has none there (a painted one stays). */
  private splitRearBumper(scene: Object3D) {
    const body = scene.getObjectByName("body");
    if (!body || this.parts.has("bumper_r")) return;
    const MATS = new Set(["chrome", "trim", "rubber"]);
    let minX = Infinity;
    body.traverse((x) => {
      const m = x as Mesh;
      if (!m.isMesh || (m.material as Material)?.name !== "paint") return;
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox;
      if (bb) minX = Math.min(minX, bx3.copy(bb).applyMatrix4(m.matrixWorld).min.x);
    });
    if (!Number.isFinite(minX)) return;
    const top = (this.e.pivots.bumper_f?.at[1] ?? 0.45) + 0.17;
    const meshes: Mesh[] = [];
    body.traverse((x) => {
      const m = x as Mesh;
      if (m.isMesh && !Array.isArray(m.material) && MATS.has((m.material as Material)?.name ?? "")) meshes.push(m);
    });
    const cuts: { m: Mesh; tris: number[]; keep: number[] }[] = [];
    const box = new Box3();
    const a = new Vector3();
    for (const m of meshes) {
      const g = m.geometry;
      const pos = g.getAttribute("position");
      if (!pos) continue;
      const idx = g.index;
      const n = idx ? idx.count / 3 : pos.count / 3;
      const tris: number[] = [];
      const keep: number[] = [];
      for (let t = 0; t < n; t++) {
        let ok = true;
        for (let k = 0; k < 3 && ok; k++) {
          a.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k).applyMatrix4(m.matrixWorld);
          if (a.x > minX + 0.6 || a.y > top) ok = false;
        }
        (ok ? tris : keep).push(t);
      }
      if (!tris.length) continue;
      for (const t of tris)
        for (let k = 0; k < 3; k++) box.expandByPoint(a.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k).applyMatrix4(m.matrixWorld));
      cuts.push({ m, tris, keep });
    }
    // (a bumper's across the car's back: too little there, it isn't one)
    if (!cuts.length || box.getSize(a).z < this.e.dims.width * 0.5) return;
    const mid = box.getCenter(new Vector3());
    const outer = new Group();
    outer.name = "p:bumper_r";
    outer.position.copy(mid);
    this.glb.add(outer);
    const inv = new Matrix4().makeTranslation(-mid.x, -mid.y, -mid.z);
    for (const { m, tris, keep } of cuts) {
      const piece = new Mesh(this.geo(subGeometry(m.geometry, tris)), m.material);
      piece.name = `${m.name}.rear`;
      m4.multiplyMatrices(inv, m.matrixWorld).decompose(piece.position, piece.quaternion, piece.scale);
      piece.castShadow = m.castShadow;
      piece.receiveShadow = m.receiveShadow;
      outer.add(piece);
      m.geometry = this.geo(subGeometry(m.geometry, keep));
    }
    this.parts.set("bumper_r", { outer, anim: outer, holder: outer });
  }

  partCopy(name: string): Object3D | null {
    const p = this.parts.get(name);
    if (!p || !this.ready) return null;
    p.anim.updateWorldMatrix(true, true);
    const out = new Group();
    for (const ch of p.holder.children) {
      const c = ch.clone(true);
      c.applyMatrix4(p.holder.matrixWorld);
      out.add(c);
    }
    // (its middle the group's origin: it tumbles about it)
    const mid = middleOf(out, out, [0, 0, 0]);
    for (const c of out.children) c.position.sub(mid);
    out.position.copy(mid);
    return out;
  }
  /** A lid or a back door opened `a` (radians): the bonnet, the boot (or the van's two back doors) — turned
   *  about its hinge the way that takes it away from the car. */
  setPart(name: string, a: number) {
    const names = name === "boot" ? ["boot", "boot_l", "boot_r"] : [name];
    for (const n of names) {
      const p = this.parts.get(n);
      const pv = this.e.pivots[n];
      if (!p || !pv || !this.ready) continue;
      let sgn = this.lidSign.get(n);
      if (sgn === undefined) {
        const b = middleOf(p.holder, this.glb, pv.at);
        sgn = Math.abs(pv.axis[1]) > 0.5 ? -Math.sign(b.z || 1) : Math.sign(b.x || 1);
        this.lidSign.set(n, sgn);
      }
      // (plan 94 P2: sprung, never shut past it; gone, hidden — setWreck)
      this.lidA.set(n, a);
      const at = Math.max(a, this.lidMin.get(n) ?? 0);
      if (Math.abs(pv.axis[1]) > 0.5) p.anim.rotation.y = sgn * at;
      else p.anim.rotation.z = sgn * at;
      // (a parked car's a still model — its matrices made once and left (culling.stillModel): this hinge's own,
      // and what hangs on it, made again — the boot's lid, the bonnet up for a mend)
      if (!p.anim.matrixAutoUpdate) {
        p.anim.updateMatrix();
        p.anim.updateMatrixWorld(true);
      }
    }
  }
  private lidSign = new Map<string, number>();
  /** Which door a seat's person gets in by: on their side, the one hinged nearest ahead of the seat
   *  (a hinge is a door's front edge: the front seat's nearest hinge is the back door's, just
   *  behind it); the van's slide for its back, the 4x4's front doors for its back seats. */
  doorOf = (seat: number): number => {
    const s = this.seats[seat];
    if (!s) return -1;
    let best = -1;
    let bd = Infinity;
    this.doors.forEach((d, i) => {
      if (d.side !== s.side && this.doors.some((x) => x.side === s.side)) return;
      // (a front seat by a front door: the van's slide is hinged just ahead of its passenger's)
      const fr = (j: number) => this.e.doors[j]?.startsWith("door_f");
      if (s.front && !fr(i) && this.doors.some((x, j) => x.side === s.side && fr(j))) return;
      const pv = this.e.pivots[this.e.doors[i]];
      // (the model faces −x: ahead of the seat is a smaller x; one behind it only if none's ahead)
      const ahead = pv ? s.hip.x - -pv.at[0] : -9;
      const dx = ahead >= -0.05 ? ahead : 10 - ahead;
      if (dx < bd) {
        bd = dx;
        best = i;
      }
    });
    return best;
  };
  dispose() {
    this.gone = true;
    const q = queues.get(this.o.renderer);
    for (const f of this.held) q?.release(f);
    this.held.length = 0;
    for (const m of this.mine) m.dispose();
    for (const g of this.geos) g.dispose();
    // (what's been made of it since: a still model's merged parts, its shadow's proxy)
    this.root.traverse((x) => {
      const g = (x as Mesh).geometry as BufferGeometry | undefined;
      if (g && !g.userData.shared) g.dispose();
    });
    this.cluster?.t.dispose();
    this.radio?.t.dispose();
    this.tail.geometry.dispose();
    this.tail.material.dispose();
    this.root.removeFromParent();
  }
}

/** A part of a Blender car turned open (the sheet's: /dev/cars). */
export function setCarPart(car: Sedan, name: string, a: number) {
  (car as Partial<GlbCar>).setPart?.(name, a);
}

/** A car's far model: its body's outline in its paint (one file a body, shared; its paint by colour). */
export function buildFar(
  body: string,
  colour: number,
  renderer: WebGLRenderer,
  priority = 0,
): { root: Group; ready: () => boolean; dispose: () => void } {
  const root = new Group();
  const f = carManifest()?.far[body];
  let ready = false;
  let gone = false;
  const mats: Material[] = [];
  if (f) {
    hold(
      renderer,
      f.file,
      priority,
      (s) => {
        const c = s.clone(true);
        c.rotation.y = Math.PI;
        c.traverse((x) => {
          const m = x as Mesh;
          if (!m.isMesh) return;
          const mat = m.material as MeshStandardMaterial;
          if (mat?.name === "paint") {
            const p = own(mat);
            p.color.set(colour);
            skyLit(p);
            mats.push(p);
            m.material = p;
          }
        });
        root.add(c);
        ready = true;
      },
      () => gone,
    );
  }
  return {
    root,
    ready: () => ready,
    dispose: () => {
      gone = true;
      if (f) queues.get(renderer)?.release(f.file);
      for (const m of mats) m.dispose();
      root.removeFromParent();
    },
  };
}

/** Starts the files most cars want: the far outlines, the manifest's wheels and the common extras. */
export function preloadCars(renderer: WebGLRenderer) {
  const m = carManifest();
  if (!m) return;
  for (const f of Object.values(m.far))
    hold(
      renderer,
      f.file,
      50,
      () => {},
      () => false,
    );
}

// ── helpers ──
const bx3 = new Box3();
/** Some of a geometry's triangles (by number) as a geometry of their own, unindexed: every attribute, and its
 *  morphs. */
function subGeometry(g: BufferGeometry, tris: number[]): BufferGeometry {
  const idx = g.index;
  const vi = (t: number, k: number) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  const take = (at: BufferAttribute | InterleavedBufferAttribute) => {
    const n = at.itemSize;
    const arr = new Float32Array(tris.length * 3 * n);
    let o = 0;
    for (const t of tris)
      for (let k = 0; k < 3; k++) {
        const j = vi(t, k);
        for (let q = 0; q < n; q++) arr[o++] = at.getComponent(j, q);
      }
    const out = new Float32BufferAttribute(arr, n, at.normalized);
    out.name = at.name;
    return out;
  };
  const out = new BufferGeometry();
  for (const name of Object.keys(g.attributes)) out.setAttribute(name, take(g.getAttribute(name)));
  for (const name of ["position", "normal", "color"] as const) {
    const list = g.morphAttributes[name];
    if (list) out.morphAttributes[name] = list.map(take);
  }
  out.morphTargetsRelative = g.morphTargetsRelative;
  return out;
}
function within(o: Object3D, prefix: string): boolean {
  for (let p: Object3D | null = o; p; p = p.parent)
    if (p.name.startsWith(prefix) || p.name.startsWith(`p:${prefix}`)) return true;
  return false;
}
function underDoor(o: Object3D): boolean {
  return within(o, "door_");
}
function darker(c: number): number {
  return new Color(c).multiplyScalar(0.55).getHex();
}
/** The middle of what's under `g`, in `frame`'s coords from `at`. */
function middleOf(g: Object3D, frame: Object3D, at: V3): Vector3 {
  frame.updateWorldMatrix(true, true);
  const inv = new Matrix4().copy(frame.matrixWorld).invert();
  const sum = new Vector3();
  let n = 0;
  g.traverse((x) => {
    const m = x as Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute("position");
    if (!pos) return;
    const k = new Matrix4().multiplyMatrices(inv, m.matrixWorld);
    for (let i = 0; i < pos.count; i += 7) {
      sum.add(v1.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(k));
      n++;
    }
  });
  return n ? sum.divideScalar(n).sub(v2.set(at[0], at[1], at[2])) : sum;
}
/** What's under `g`, in `frame`'s coords from `at`: how far it reaches, and its middle's z. */
function boxOf(g: Group, frame: Object3D, at: V3): { span: number; cz: number } | null {
  frame.updateWorldMatrix(true, true);
  m4.copy(frame.matrixWorld).invert();
  let span = 0;
  let cz = 0;
  let n = 0;
  g.traverse((x) => {
    const m = x as Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute("position");
    if (!pos) return;
    const k = new Matrix4().multiplyMatrices(m4, m.matrixWorld);
    for (let i = 0; i < pos.count; i += 3) {
      v1.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(k);
      v1.x -= at[0];
      v1.y -= at[1];
      v1.z -= at[2];
      span = Math.max(span, v1.length());
      cz += v1.z;
      n++;
    }
  });
  return n ? { span, cz: cz / n } : null;
}
export type { MeshPhysicalMaterial };

// (plan 93 S6) a snow chain round a tyre (its axle along z): 10 cross chains over the tread, a side chain round
// each wall at ~80% of its radius — made once a size, shared (never disposed with a car)
const chainGeos = new Map<string, BufferGeometry>();
let chainMat: MeshStandardMaterial | null = null;
function chainMaterial(): MeshStandardMaterial {
  chainMat ??= new MeshStandardMaterial({ color: 0x5e6166, metalness: 0.8, roughness: 0.55 });
  chainMat.userData.shared = true;
  return chainMat;
}
function chainGeometry(r: number, width: number): BufferGeometry {
  const key = `${r.toFixed(3)}|${width.toFixed(3)}`;
  const had = chainGeos.get(key);
  if (had) return had;
  const parts: BufferGeometry[] = [];
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // (a cross chain: a little zig across the tread, lying on it)
    const b = new BoxGeometry(0.016, 0.011, width + 0.03);
    b.rotateZ(a);
    b.rotateY(0.18 * (i % 2 ? 1 : -1));
    b.translate(Math.cos(a) * (r + 0.004), Math.sin(a) * (r + 0.004), 0);
    parts.push(b);
  }
  for (const side of [-1, 1]) {
    const t = new TorusGeometry(r * 0.8, 0.0045, 4, 28);
    t.translate(0, 0, side * (width / 2 + 0.006));
    parts.push(t);
    // (the side chain's arms out to the cross chains' ends)
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const arm = new BoxGeometry(r * 0.22, 0.006, 0.006);
      arm.translate(r * 0.9, 0, side * (width / 2 + 0.008));
      arm.rotateZ(a);
      parts.push(arm);
    }
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed())) ?? new BufferGeometry();
  for (const p of parts) p.dispose();
  g.userData.shared = true;
  chainGeos.set(key, g);
  return g;
}
