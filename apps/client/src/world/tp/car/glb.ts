import { type CarLook, FLATS, PART } from "@yutopia/shared/car";
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type Texture,
  TorusGeometry,
  Vector3,
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

// the windscreen's crack: lines from a star low on the passenger's side (and more of them, worse)
const cracks: (CanvasTexture | null)[] = [null, null];
function crackTex(bad = false): CanvasTexture {
  const i = bad ? 1 : 0;
  const had = cracks[i];
  if (had) return had;
  const W = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = W / 2;
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
  star(W * 0.3, W * 0.36, 11, 200);
  if (bad) {
    star(W * 0.68, W * 0.2, 9, 160);
    star(W * 0.5, W * 0.42, 7, 120);
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  cracks[i] = t;
  return t;
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
  readonly seats: { hip: Vector3; side: 1 | -1; front: boolean }[] = [];
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
      this.doors.push({
        group: g,
        side,
        front: /_f[lr]$/.test(d),
        open: slide
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
    this.ready = true;
    this.setEnv(this.env);
    this.setLights(this.lights);
    if (this.radioSays) this.setRadio(...this.radioSays);
    const bits = this.partBits;
    this.partBits = 0;
    this.setWear(this.wear.uGrime.value, this.dmg, bits);
    this.setBeacon(this.beacon.on, this.beacon.t);
    if (this.holesWant) this.setHoles(this.holesWant);
    this.done();
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
  /** (plan 93 S2) a door's window wound down, or up (a broken side's stays gone: setParts) */
  private downs = new Set<number>();
  windowDown(door: number, down: boolean) {
    if (down === this.downs.has(door)) return;
    if (down) this.downs.add(door);
    else this.downs.delete(door);
    const name = this.e.doors[door];
    const p = name ? this.parts.get(name) : undefined;
    if (!p) return;
    const left = (this.e.pivots[name]?.at[2] ?? 0) < 0;
    const broken = !!(this.partBits & (left ? PART.sideL : PART.sideR));
    p.holder.traverse((x) => {
      const m = x as Mesh;
      const n = (m.material as Material | undefined)?.name;
      if (m.isMesh && (n === "glass" || n === "glass_tint")) m.visible = !down && !broken;
    });
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
  private holesWant: readonly { u: number; w: number; h: number; face: number }[] | null = null;
  private holesKey = "";
  private holeMeshes: InstancedMesh[] = [];
  setHoles(list: readonly { u: number; w: number; h: number; face: number }[]) {
    const key = list.map((x) => `${x.u},${x.w},${x.h},${x.face}`).join(";");
    if (key === this.holesKey) return;
    this.holesWant = list;
    if (!this.ready) return;
    this.holesKey = key;
    for (const m of this.holeMeshes) {
      m.removeFromParent();
      m.geometry.dispose();
      m.dispose();
    }
    this.holeMeshes = [];
    if (!list.length) return;
    // (the body's own skin: what isn't glass, a light or a plate — found from outside the box it was struck on)
    const skins: Object3D[] = [];
    this.body.traverse((o) => {
      const m = o as Mesh;
      const n = (m.material as Material | undefined)?.name ?? "";
      if (m.isMesh && m.visible && !/glass|emit_|plate|screen|collider/.test(n) && !/collider/.test(m.name))
        skins.push(m);
    });
    this.root.updateMatrixWorld(true);
    const ray = new Raycaster();
    const N: [number, number, number][] = [
      [-1, 0, 0], // front (the model faces −x)
      [1, 0, 0],
      [0, 0, 1], // its left: +z
      [0, 0, -1],
      [0, 1, 0],
    ];
    const at: Matrix4[] = [];
    const q = new Quaternion();
    const Z = new Vector3(0, 0, 1);
    for (const h of list) {
      const n = N[h.face] ?? N[0];
      const p = v1.set(-h.u, h.h, -h.w);
      const nb = v2.set(n[0], n[1], n[2]);
      const from = this.body.localToWorld(p.clone().addScaledVector(nb, 0.3));
      const dir = nb.clone().transformDirection(this.body.matrixWorld).negate();
      ray.set(from, dir);
      ray.far = 0.9;
      const hit = ray.intersectObjects(skins, false)[0];
      if (!hit?.face) continue;
      // (its face's own normal, the body's frame; out a hair so it's on it)
      const wn = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      const local = this.body.worldToLocal(hit.point.clone().addScaledVector(wn, 0.003));
      const ln = wn.clone().transformDirection(m4.copy(this.body.matrixWorld).invert()).normalize();
      q.setFromUnitVectors(Z, ln);
      at.push(new Matrix4().compose(local, q, new Vector3(1, 1, 1)));
    }
    if (!at.length) return;
    const make = (g: BufferGeometry, colour: number, order: number) => {
      const m = new InstancedMesh(
        g,
        this.mat(
          new MeshBasicMaterial({
            color: colour,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
          }),
        ),
        at.length,
      );
      at.forEach((x, i) => {
        m.setMatrixAt(i, x);
      });
      m.renderOrder = order;
      m.frustumCulled = false;
      this.geos.push(g);
      this.body.add(m);
      this.holeMeshes.push(m);
    };
    // (the bare metal round it, then the hole)
    // (a little over a round's own size: seen from a few steps off)
    make(new RingGeometry(0.011, 0.02, 12), 0x9a9690, 1);
    make(new CircleGeometry(0.0115, 10), 0x0a0a0a, 2);
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
    this.snowPane.visible = !!t;
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
  setWear(grime: number, dmg: readonly number[], parts = 0) {
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
        if (j !== undefined) inf[j] = this.dmg[i];
      }
    }
    // (before its file's in: kept, shown as it comes — adopt)
    if (!this.ready) this.partBits = parts;
    else if (parts !== this.partBits) this.setParts(parts);
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
    // (a side's windows shattered: its doors' glass gone; plan 93 S5: a window wound down stays down)
    for (const [name, p] of this.parts) {
      if (!name.startsWith("door_")) continue;
      const left = (this.e.pivots[name]?.at[2] ?? 0) < 0;
      const gone = !!(bits & (left ? PART.sideL : PART.sideR)) || this.downs.has(this.e.doors.indexOf(name));
      p.holder.traverse((x) => {
        const m = x as Mesh;
        const n = (m.material as Material | undefined)?.name;
        if (m.isMesh && (n === "glass" || n === "glass_tint")) m.visible = !gone;
      });
    }
    // (plan 93 S1: a flat tyre down on its rim — a parked car's here; a driven one's set each frame as it goes)
    this.wheels.forEach((w, i) => {
      if (w.rest) w.steer.position.y = w.rest.y - (bits & FLATS[i] ? 0.04 : 0);
    });
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
      this.glb.add(mesh);
      this.crack = { mesh, mat };
    }
    if (this.crack) {
      this.crack.mesh.visible = !!screen;
      const bad = !!(bits & PART.screenBad);
      if (this.crack.mat.map !== crackTex(bad)) {
        this.crack.mat.map = crackTex(bad);
        this.crack.mat.needsUpdate = true;
      }
    }
    this.setLights(this.lights);
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
      if (Math.abs(pv.axis[1]) > 0.5) p.anim.rotation.y = sgn * a;
      else p.anim.rotation.z = sgn * a;
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
