import { CAR_COLOURS, campusLot } from "@yutopia/shared";
import {
  BENCH,
  BUILDINGS,
  type Building,
  CHUNK,
  FENCE,
  GATE,
  GROUNDS,
  groundAt,
  groundSurfaceAt,
  groundsRng,
  type Inside,
  insideOf,
  LAMPS,
  LOT,
  lotBanks,
  type P,
  PLAZA,
  POND,
  POND_LEVEL,
  RAVINE,
  RIVER,
  ROAD_CLOSED,
  STATUE,
  type Surface,
  TOWER,
  TOWN_CARS,
  type Tree,
  terrainAt,
  treesIn,
  WAYS,
  type Way,
  wallEdgeAt,
} from "@yutopia/shared/grounds";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  bareTree3,
  carGeometry,
  facadeCanvases,
  G,
  type Lot,
  lettersCanvas,
  lotCanvas,
  place,
  poolCanvas,
  roadCanvas,
  snowCanvas,
  tinted,
  type V,
} from "./campus";
import type { Themes } from "./sky";

// The Grounds in 3D — phase 0's prototype (docs/plan/27-the-grounds.md): the
// land, the ways, the water, the woods, every building and lamp, built from
// the shared Grounds (packages/shared grounds.ts) round a point, the detail
// falling off with the distance. Units are tiles, y up, the ground round the
// headquarters at y = 0. Phase 1 makes this the game's: chunks streamed in
// and out as you walk instead of built once round a spot.

const STOREY = 3.5;
const BAY = 4;

/** A lamp's light, for the scene to light the nearest few for real. */
export interface LampLight {
  p: Vector3; // the head
  kind: "cobra" | "town" | "lone" | "porch" | "gate";
  color: number;
  r: number; // its pool's radius
}

export interface GroundsOpts {
  cx: number;
  cz: number;
  radius: number; // build out to here (tiles)
  /** chunks nearer than this at full detail */
  near?: number;
  /** no trees here (the game's camera fades what's between it and you) */
  clear?: { x: number; z: number; r: number }[];
  /** in the game (grounds-stream.ts): the land and the woods are streamed by
   *  chunk, the headquarters is the campus's, the lot is the ground floor's own */
  stream?: boolean;
}

export const SURF: Record<Surface, number> = {
  snow: 0xf3f6f9,
  deep: 0xeef3f8,
  path: 0xd6d4cf,
  asphalt: 0xc4c8cc,
  walk: 0xd8d8d4,
  ice: 0xc3d2dc,
  floor: 0xc9c5bd,
  rock: 0x737880,
};

// ── textures ────────────────────────────────────────────────────────────────
function tex(c: HTMLCanvasElement, repeat = true): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (repeat) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
  }
  t.anisotropy = 8;
  return t;
}
// Packed snow on a trail: trodden grey-white, boot prints, a few dark wet spots.
function trailCanvas(T: Themes): HTMLCanvasElement {
  const { c, g } = T.canvas(128, 512);
  const r = T.rng(301);
  g.fillStyle = "#e3e2de";
  g.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 140; i++) {
    const x = 18 + r() * 92;
    const y = r() * 512;
    g.fillStyle = `rgba(150,150,150,${0.08 + r() * 0.12})`;
    g.beginPath();
    g.ellipse(x, y, 4 + r() * 3, 8 + r() * 4, (r() - 0.5) * 0.5, 0, Math.PI * 2);
    g.fill();
  }
  // soft untrodden edges
  for (const x0 of [0, 128]) {
    const grd = g.createLinearGradient(x0, 0, x0 === 0 ? 24 : 104, 0);
    grd.addColorStop(0, "rgba(246,248,250,1)");
    grd.addColorStop(1, "rgba(246,248,250,0)");
    g.fillStyle = grd;
    g.fillRect(x0 === 0 ? 0 : 104, 0, 24, 512);
  }
  return c;
}
// A pavement: concrete slabs under a dusting, a kerb on the street side (u = 0).
function walkCanvas(T: Themes): HTMLCanvasElement {
  const { c, g } = T.canvas(128, 256);
  const r = T.rng(303);
  g.fillStyle = "#b9b8b3";
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = "rgba(80,80,80,0.35)";
  g.lineWidth = 2;
  for (let y = 0; y < 256; y += 64) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y);
    g.stroke();
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(246,248,250,${0.4 + r() * 0.5})`;
    g.beginPath();
    g.ellipse(r() * 128, r() * 256, 6 + r() * 20, 3 + r() * 8, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#8f9196";
  g.fillRect(0, 0, 10, 256);
  return c;
}
// Ice under snow: mostly a white crust, wind-scoured patches of bare grey-blue
// ice with white cracks in them.
function iceCanvas(T: Themes): HTMLCanvasElement {
  const S = 512;
  const { c, g } = T.canvas(S, S);
  const r = T.rng(307);
  g.fillStyle = "#dfe6ec";
  g.fillRect(0, 0, S, S);
  const blobs: [number, number, number, number][] = [];
  for (let i = 0; i < 26; i++) blobs.push([r() * S, r() * S, 40 + r() * 80, 5 + r() * 9]);
  for (const [x, y, w, h] of blobs)
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, w);
        grd.addColorStop(0, "rgba(160,181,198,0.6)");
        grd.addColorStop(0.7, "rgba(172,192,207,0.35)");
        grd.addColorStop(1, "rgba(200,214,226,0)");
        g.fillStyle = grd;
        g.beginPath();
        g.ellipse(x + ox, y + oy, w, h, -0.5, 0, Math.PI * 2);
        g.fill();
      }
  // drifted snow in soft ridges across it
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(246,249,251,${0.25 + r() * 0.35})`;
    g.beginPath();
    g.ellipse(r() * S, r() * S, 20 + r() * 50, 3 + r() * 6, -0.5, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "rgba(240,246,250,0.75)";
  g.lineWidth = 1;
  for (const [x0, y0] of blobs) {
    let x = x0;
    let y = y0;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (r() - 0.5) * 40;
      y += (r() - 0.5) * 30;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}
// Brick: courses with mortar, a little variation, soot towards the top.
function brickCanvas(T: Themes, base: string, seed: number): HTMLCanvasElement {
  const { c, g } = T.canvas(256, 256);
  const r = T.rng(seed);
  g.fillStyle = "#8a8378";
  g.fillRect(0, 0, 256, 256);
  const bw = 32;
  const bh = 12;
  const col = new Color(base);
  for (let y = 0; y < 256; y += bh)
    for (let x = -((y / bh) % 2) * (bw / 2); x < 256; x += bw) {
      const k = 0.82 + r() * 0.3;
      g.fillStyle = `rgb(${(col.r * 255 * k) | 0},${(col.g * 255 * k) | 0},${(col.b * 255 * k) | 0})`;
      g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  return c;
}
// Clapboard siding: horizontal boards with a shadow line each.
function sidingCanvas(T: Themes, base: string): HTMLCanvasElement {
  const { c, g } = T.canvas(128, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 10) {
    g.fillStyle = "rgba(0,0,0,0.16)";
    g.fillRect(0, y + 8, 128, 2);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(0, y, 128, 2);
  }
  return c;
}
// Corrugated metal.
function corrugatedCanvas(T: Themes): HTMLCanvasElement {
  const { c, g } = T.canvas(128, 64);
  for (let x = 0; x < 128; x++) {
    const k = 0.5 + 0.5 * Math.sin((x / 128) * Math.PI * 2 * 12);
    const v = (130 + k * 50) | 0;
    g.fillStyle = `rgb(${v},${v + 3},${v + 6})`;
    g.fillRect(x, 0, 1, 64);
  }
  return c;
}
// Chain-link: a diamond mesh on transparent.
function chainCanvas(T: Themes): HTMLCanvasElement {
  const { c, g } = T.canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = "rgba(70,74,80,0.95)";
  g.lineWidth = 2.2;
  for (let k = -64; k < 128; k += 16) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 64, 64);
    g.stroke();
    g.beginPath();
    g.moveTo(k + 64, 0);
    g.lineTo(k, 64);
    g.stroke();
  }
  return c;
}
// A painted sign: dark board, a thin rule, letters in cream (lit at night).
function signCanvas(T: Themes, text: string, w = 512, h = 128, bg = "#1d2226", fg = "#efe3c4"): HTMLCanvasElement {
  const { c, g } = T.canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg;
  g.lineWidth = 3;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = fg;
  const lines = text.split("\n");
  const size = Math.min(h * 0.62, (h * 0.8) / lines.length, (w * 1.5) / Math.max(...lines.map((l) => l.length)));
  g.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const [i, l] of lines.entries()) g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.1);
  return c;
}
// A shop window at night: warm light, shelves and silhouettes inside.
function shopWindowCanvas(T: Themes, seed: number, tone: string): HTMLCanvasElement {
  const { c, g } = T.canvas(256, 128);
  const r = T.rng(seed);
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, tone);
  grd.addColorStop(1, "#3a2a1a");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "rgba(40,28,18,0.55)";
  for (let i = 0; i < 6; i++) g.fillRect(r() * 220, 40 + r() * 50, 20 + r() * 40, 6 + r() * 30);
  g.fillStyle = "rgba(20,14,10,0.9)";
  for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 5, 128);
  g.fillRect(0, 0, 256, 6);
  return c;
}
// A ring of light for a lamp's head (a sprite-less glow card).
function glowCanvas(T: Themes): HTMLCanvasElement {
  const { c, g } = T.canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,240,210,1)");
  grd.addColorStop(0.18, "rgba(255,226,170,0.55)");
  grd.addColorStop(0.5, "rgba(255,210,150,0.12)");
  grd.addColorStop(1, "rgba(255,210,150,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return c;
}

// ── trees ───────────────────────────────────────────────────────────────────
// A birch in winter: a white trunk with dark marks, thin dark twigs.
export function birchGeometry(r: () => number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const up = new Vector3(0, 1, 0);
  // the trunk, a few segments with marks
  let y = 0;
  const lean = new Vector3((r() - 0.5) * 0.08, 1, (r() - 0.5) * 0.08).normalize();
  for (let i = 0; i < 9; i++) {
    const h = 1.0;
    const rad = 0.17 - i * 0.012;
    const g = new CylinderGeometry(rad - 0.012, rad, h, 7, 1, true).translate(0, y + h / 2, 0);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(up, lean));
    parts.push(tinted(g, r() < 0.5 ? 0xd9d6cf : 0xeeebe4));
    // a few dark marks on it
    for (let k = 0; k < 2; k++)
      if (r() < 0.6) {
        const a = r() * Math.PI * 2;
        const m = new BoxGeometry(0.1, 0.07 + r() * 0.12, 0.02).translate(0, y + r() * h, rad - 0.005).rotateY(a);
        m.applyQuaternion(new Quaternion().setFromUnitVectors(up, lean));
        parts.push(tinted(m, 0x24221f));
      }
    y += h;
  }
  const branch = (p: Vector3, dir: Vector3, len: number, rad: number, depth: number) => {
    const g = new CylinderGeometry(rad * 0.6, rad, len, 4, 1, true).translate(0, len / 2, 0);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(up, dir));
    g.translate(p.x, p.y, p.z);
    parts.push(tinted(g, depth > 2 ? 0xbdb9b0 : 0x4b3d36));
    if (depth <= 0) return;
    const end = p.clone().add(dir.clone().multiplyScalar(len));
    for (let i = 0; i < 2; i++) {
      const d = dir
        .clone()
        .add(new Vector3((r() - 0.5) * 1.4, 0.2 + r() * 0.5, (r() - 0.5) * 1.4))
        .normalize();
      branch(end, d, len * 0.62, rad * 0.6, depth - 1);
    }
  };
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const h = 3.8 + i * 0.85;
    branch(
      lean.clone().multiplyScalar(h),
      new Vector3(Math.cos(a), 0.9 + r() * 0.5, Math.sin(a)).normalize(),
      1.6 + r() * 0.8,
      0.06,
      3,
    );
  }
  const m = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return m;
}
// A spruce near you: seven tiers of drooping boughs, their tips ragged, snow
// lying on the top of each tier; the trunk showing under the lowest.
export function pineGeometry(r: () => number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const tiers = 7;
  const H = 10.5;
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1);
    const y0 = 1.1 + k * (H - 2.6);
    const rad = 2.7 * (1 - k * 0.82) * (0.92 + r() * 0.16);
    const h = 2.6 - k * 0.9;
    const seg = 13;
    const g = new ConeGeometry(rad, h, seg, 2, true).translate(0, y0 + h / 2, 0).toNonIndexed();
    const pos = g.getAttribute("position");
    // the boughs' tips: ragged and drooping
    const jag = Array.from({ length: seg + 1 }, () => 0.78 + r() * 0.42);
    jag[seg] = jag[0];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = pos.getY(i);
      const d = Math.hypot(x, z);
      if (d < 1e-4) continue;
      const a = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
      const j = jag[Math.round((a / (Math.PI * 2)) * seg) % seg];
      const f = (d / rad) ** 1.5;
      pos.setXYZ(i, x * (1 + (j - 1) * f), y - f * 0.35 * (j - 0.7), z * (1 + (j - 1) * f));
    }
    g.computeVertexNormals();
    const col = new Float32Array(pos.count * 3);
    const dark = new Color(0x1f2b26);
    const light = new Color(0x34463d);
    for (let i = 0; i < pos.count; i++) {
      const c = dark.clone().lerp(light, Math.min(1, (pos.getY(i) - y0) / h + r() * 0.15));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new Float32BufferAttribute(col, 3));
    parts.push(g);
    // the snow on it: a thinner cone over the upper part, a little ragged
    const sh = h * 0.5;
    const sg = new ConeGeometry(rad * 0.72, sh, seg, 1, true).translate(0, y0 + h - sh / 2 + 0.06, 0).toNonIndexed();
    const sp = sg.getAttribute("position");
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i);
      const z = sp.getZ(i);
      if (Math.hypot(x, z) < 1e-4) continue;
      const a = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
      const j = jag[Math.round((a / (Math.PI * 2)) * seg) % seg];
      sp.setXYZ(i, x * (0.85 + 0.25 * j), sp.getY(i) - (j - 0.8) * 0.2, z * (0.85 + 0.25 * j));
    }
    sg.computeVertexNormals();
    parts.push(tinted(sg, 0xeef2f5));
  }
  parts.push(tinted(new CylinderGeometry(0.16, 0.3, 2.2, 7).translate(0, 1.1, 0), 0x3a2e26));
  const m = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return m;
}
// A far pine: two tiers, snow on the shoulders (cheap).
export function farPineGeometry(): BufferGeometry {
  const parts = [
    tinted(new ConeGeometry(2.4, 5.5, 6).translate(0, 4.2, 0), 0x26332d),
    tinted(new ConeGeometry(1.6, 4.4, 6).translate(0, 7.6, 0), 0x2d3b34),
    tinted(new ConeGeometry(1.25, 1.6, 6).translate(0, 9.0, 0), 0xe2e8ec),
    tinted(new CylinderGeometry(0.2, 0.3, 1.6, 4).translate(0, 0.8, 0), 0x3a2e26),
  ];
  const m = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return m;
}

// ── the module ──────────────────────────────────────────────────────────────
export class Grounds3 {
  readonly root = new Group();
  readonly lights: LampLight[] = [];
  private disposables: { dispose(): void }[] = [];
  private night: { m: MeshBasicMaterial | MeshLambertMaterial | MeshStandardMaterial; on: number; kind: string }[] = [];
  private lambertCache = new Map<string, MeshLambertMaterial>();
  private ts: {
    snow: CanvasTexture;
    road: CanvasTexture;
    trail: CanvasTexture;
    walk: CanvasTexture;
    ice: CanvasTexture;
    pool: CanvasTexture;
    glow: CanvasTexture;
  };

  constructor(
    private T: Themes,
    private o: GroundsOpts,
  ) {
    this.ts = {
      snow: this.keep(tex(snowCanvas(T, 512, 43))),
      road: this.keep(tex(roadCanvas(T))),
      trail: this.keep(tex(trailCanvas(T))),
      walk: this.keep(tex(walkCanvas(T))),
      ice: this.keep(tex(iceCanvas(T))),
      pool: this.keep(tex(poolCanvas(T), false)),
      glow: this.keep(tex(glowCanvas(T), false)),
    };
    // (in the game a step a frame or so: `step()`; for a still, all at once)
    const run = (f: () => void) => (o.stream ? this.pending.push(f) : f());
    if (!o.stream) this.terrain();
    if (o.stream) for (const w of WAYS) run(() => this.ways(w));
    else this.ways();
    run(() => this.water());
    run(() => this.lot());
    if (!o.stream) this.woods();
    for (const b of BUILDINGS)
      if (this.near(b.x0, b.z0, 60) && !(o.stream && b.kind === "hq")) run(() => this.building(b));
    run(() => this.courtyardBridge());
    run(() => this.fence());
    run(() => this.landmarks());
    run(() => this.town());
    // (last: they gather every light and glow the steps before added)
    run(() => this.lamps());
    run(() => this.ridges());
  }
  private pending: (() => void)[] = [];
  // the stored blocks' storeys above their ground floor (gone while you're in one)
  private cuts = new Map<string, { b: Building; parts: Object3D[] }>();
  private cutKey = "";
  /** You're at (x, z) (building coords): inside a stored block, its storeys above go. */
  cutAt(x: number, z: number) {
    let key = "";
    for (const [k, c] of this.cuts) if (x >= c.b.x0 && x < c.b.x1 && z >= c.b.z0 && z < c.b.z1) key = k;
    if (key === this.cutKey) return;
    this.cutKey = key;
    for (const [k, c] of this.cuts) for (const p of c.parts) p.visible = k !== key;
  }
  private lastNight = 0;
  /** Built a step more (the game's: a few ms a frame). The new meshes, to patch. False: all built. */
  step(): Object3D[] | false {
    const f = this.pending.shift();
    if (!f) return false;
    const n = this.root.children.length;
    f();
    if (!this.pending.length) this.setNight(this.lastNight);
    return this.root.children.slice(n);
  }

  private keep<T extends { dispose(): void }>(t: T): T {
    this.disposables.push(t);
    return t;
  }
  private near(x: number, z: number, pad = 0): boolean {
    return Math.hypot(x - this.o.cx, z - this.o.cz) < this.o.radius + pad;
  }
  private lambert(hex = 0xffffff, map?: Texture, vertex = true): MeshLambertMaterial {
    const key = `${hex}|${map?.uuid ?? ""}|${vertex}`;
    let m = this.lambertCache.get(key);
    if (!m) {
      m = this.keep(new MeshLambertMaterial({ color: hex, map, vertexColors: vertex }));
      this.lambertCache.set(key, m);
    }
    return m;
  }
  private add(g: BufferGeometry, m: Material, shadow: "both" | "cast" | "receive" | "none" = "both"): Mesh {
    const mesh = new Mesh(g, m);
    mesh.castShadow = shadow === "both" || shadow === "cast";
    mesh.receiveShadow = shadow === "both" || shadow === "receive";
    this.root.add(mesh);
    this.keep(g);
    return mesh;
  }
  /** Lit at night: `on` is how bright when it's fully dark. */
  private glows<M extends MeshBasicMaterial | MeshLambertMaterial | MeshStandardMaterial>(
    m: M,
    on = 1,
    kind = "lamp",
  ): M {
    this.night.push({ m, on, kind });
    return m;
  }

  /** 0 = day, 1 = full night: the lamps, the windows, the signs. */
  setNight(k: number) {
    this.lastNight = k;
    for (const n of this.night) {
      const v = n.on * k;
      if (n.m instanceof MeshBasicMaterial) {
        n.m.opacity = Math.min(1, v);
        n.m.visible = v > 0.01;
      } else n.m.emissiveIntensity = v;
    }
  }

  // ── the land ──
  private terrain() {
    const { cx, cz, radius } = this.o;
    const near = this.o.near ?? 140;
    const mat = this.lambert(0xffffff, this.ts.snow);
    const c0 = Math.floor((cx - radius) / CHUNK);
    const c1 = Math.floor((cx + radius) / CHUNK);
    const r0 = Math.floor((cz - radius) / CHUNK);
    const r1 = Math.floor((cz + radius) / CHUNK);
    const parts: BufferGeometry[] = [];
    const far: BufferGeometry[] = [];
    const tint = new Color();
    const blue = new Color(0xdbe5f0);
    for (let j = r0; j <= r1; j++)
      for (let i = c0; i <= c1; i++) {
        const x0 = i * CHUNK;
        const z0 = j * CHUNK;
        // (outside the Grounds: the ridges carry on to the far ring)
        const d = Math.hypot(x0 + CHUNK / 2 - cx, z0 + CHUNK / 2 - cz);
        if (d > radius + CHUNK) continue;
        const step = d < near ? 1 : d < near * 2 ? 2 : 4;
        const n = CHUNK / step;
        const pos: number[] = [];
        const col: number[] = [];
        const uv: number[] = [];
        const idx: number[] = [];
        const vert = (x: number, z: number, y: number) => {
          pos.push(x, y, z);
          const s = d < near * 2 ? groundSurfaceAt(x, z) : "deep";
          tint.setHex(SURF[s]);
          if (s === "snow" || s === "deep") tint.lerp(blue, 0.35 + 0.35 * Math.sin(x * 0.05 + z * 0.031));
          col.push(tint.r, tint.g, tint.b);
          uv.push(x / 14, z / 14);
        };
        for (let b = 0; b <= n; b++)
          for (let a = 0; a <= n; a++) {
            const x = x0 + a * step;
            const z = z0 + b * step;
            vert(x, z, terrainAt(x, z));
          }
        for (let b = 0; b < n; b++)
          for (let a = 0; a < n; a++) {
            const p = b * (n + 1) + a;
            idx.push(p, p + n + 1, p + 1, p + 1, p + n + 1, p + n + 2);
          }
        // skirts down from the edges (no cracks where detail changes)
        const edge = (list: number[]) => {
          const base = pos.length / 3;
          for (const p of list) vert(pos[p * 3], pos[p * 3 + 2], pos[p * 3 + 1] - 1.6);
          for (let k = 0; k < list.length - 1; k++) {
            const a = list[k];
            const bb = list[k + 1];
            idx.push(a, base + k, bb, bb, base + k, base + k + 1);
            idx.push(a, bb, base + k, bb, base + k + 1, base + k);
          }
        };
        const row = (b: number) => Array.from({ length: n + 1 }, (_, a) => b * (n + 1) + a);
        const colm = (a: number) => Array.from({ length: n + 1 }, (_, b) => b * (n + 1) + a);
        edge(row(0));
        edge(row(n));
        edge(colm(0));
        edge(colm(n));
        const g = new BufferGeometry();
        g.setAttribute("position", new Float32BufferAttribute(pos, 3));
        g.setAttribute("color", new Float32BufferAttribute(col, 3));
        g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        (step === 1 ? parts : far).push(g);
      }
    if (parts.length) this.add(mergeGeometries(parts, false), mat, "receive");
    if (far.length) this.add(mergeGeometries(far, false), mat, "none");
    for (const g of [...parts, ...far]) g.dispose();
  }

  // ── roads, streets, trails, pavements; the plough's banks ──
  private ribbon(
    w: Way,
    width: number,
    off: number,
    lift: number,
    texLen: number,
    into: G,
    from = 0,
    to = w.line.length - 1,
  ) {
    let v = 0;
    const L = w.line;
    const yAt = (i: number, x: number, z: number) => (w.bridged[i] ? w.h[i] + 0.35 : groundAt(x, z)) + lift;
    for (let i = from; i < to; i++) {
      const [ax, az] = L[i];
      const [bx, bz] = L[i + 1];
      if (!this.near(ax, az, 20)) continue;
      const tn = (k: number) => {
        const [px, pz] = L[Math.max(0, k - 1)];
        const [qx, qz] = L[Math.min(L.length - 1, k + 1)];
        const l = Math.hypot(qx - px, qz - pz) || 1;
        return [-(qz - pz) / l, (qx - px) / l];
      };
      const [anx, anz] = tn(i);
      const [bnx, bnz] = tn(i + 1);
      const len = Math.hypot(bx - ax, bz - az);
      const v1 = v + len / texLen;
      const P = (x: number, z: number, nx: number, nz: number, s: number, k: number): V => {
        const px = x + nx * (off + s * width * 0.5);
        const pz = z + nz * (off + s * width * 0.5);
        return [px, yAt(k, px, pz), pz];
      };
      into.quad(
        P(ax, az, anx, anz, -1, i),
        P(ax, az, anx, anz, 1, i),
        P(bx, bz, bnx, bnz, 1, i + 1),
        P(bx, bz, bnx, bnz, -1, i + 1),
        [0, 1, 0],
        [
          [0, v],
          [1, v],
          [1, v1],
          [0, v1],
        ],
      );
      v = v1;
    }
  }
  /** The ways (`only`: one of them; then the bridges with the last). */
  private ways(only?: Way) {
    const road = new G();
    const trail = new G();
    const walk = new G();
    const banks: BufferGeometry[] = [];
    const r = groundsRng(77 + (only ? WAYS.indexOf(only) : 0));
    for (const w of only ? [only] : WAYS) {
      if (w.kind === "trail") this.ribbon(w, w.w + 0.8, 0, 0.03, 9, trail);
      else if (w.kind === "walk") this.ribbon(w, w.w, 0, 0.04, 6, walk);
      else {
        this.ribbon(w, w.w, 0, 0.05, 14, road);
        if (w.kind === "street") {
          // pavements, a kerb up from the street
          for (const s of [1, -1]) {
            const g = new G();
            this.ribbon(w, 2.6, s * (w.w / 2 + 1.3), 0.2, 6, g);
            if (!g.empty) this.add(g.build(), this.lambert(0xffffff, this.ts.walk));
          }
        }
        // the plough's banks along the verges
        const L = w.line;
        for (let f = 2; f < L.length - 2; f += 1.4) {
          const i = Math.round(f);
          if (w.bridged[i] || !this.near(L[i][0], L[i][1], 10)) continue;
          if (w.kind === "street" && r() < 0.35) continue;
          const [px, pz] = L[i - 1];
          const [qx, qz] = L[i + 1];
          const l = Math.hypot(qx - px, qz - pz) || 1;
          const nx = -(qz - pz) / l;
          const nz = (qx - px) / l;
          for (const s of [1, -1]) {
            const o = w.w / 2 + (w.kind === "street" ? 0.25 : 0.7) + r() * 0.4;
            const x = L[i][0] + nx * s * o;
            const z = L[i][1] + nz * s * o;
            // (not across another way's mouth, nor the lot's)
            if (WAYS.some((u) => u !== w && u.kind !== "trail" && nearLine(u, x, z) < u.w / 2 + 1.5)) continue;
            if (x > LOT.x0 - 2 && x < LOT.x1 + 2 && z > LOT.z0 - 2 && z < LOT.z1 + 2) continue;
            const sz = w.kind === "street" ? 0.4 + r() * 0.3 : 0.6 + r() * 0.5;
            const g = new SphereGeometry(1, 12, 6).scale(sz * 2.6, sz * 0.38, sz * 0.8);
            banks.push(place(tinted(g, 0xf4f7fa), x, groundAt(x, z) - 0.08, z, Math.atan2(nx, nz)));
          }
        }
      }
    }
    if (!road.empty) this.add(road.build(), this.lambert(0xffffff, this.ts.road), "receive");
    if (!trail.empty) this.add(trail.build(), this.lambert(0xffffff, this.ts.trail), "receive");
    if (!walk.empty) this.add(walk.build(), this.lambert(0xffffff, this.ts.walk), "receive");
    if (banks.length) this.add(mergeGeometries(banks, false), this.lambert());
    for (const g of banks) g.dispose();
    if (only && only !== WAYS[WAYS.length - 1]) return;
    // bridges: the road's steel one over the river, the trail's timber footbridge over the ravine
    for (const w of WAYS) {
      const idx = w.line.map((_, i) => i).filter((i) => w.bridged[i]);
      if (idx.length < 2) continue;
      const a = idx[0];
      const b = idx[idx.length - 1];
      if (!this.near(w.line[a][0], w.line[a][1], 30)) continue;
      const g = new G();
      const L = w.line;
      const timber = w.kind === "trail";
      for (let i = a; i < b; i++) {
        const [ax, az] = L[i];
        const [bx, bz] = L[i + 1];
        const l = Math.hypot(bx - ax, bz - az) || 1;
        const nx = -(bz - az) / l;
        const nz = (bx - ax) / l;
        const y0 = w.h[i] + 0.35;
        const y1 = w.h[i + 1] + 0.35;
        for (const s of [1, -1]) {
          const o = w.w / 2 + 0.15;
          const P = (x: number, z: number, y: number): V => [x + nx * s * o, y, z + nz * s * o];
          // the girder / the rail
          g.color(timber ? 0x5a4636 : 0x4d555c);
          const top = timber ? 1.05 : 1.3;
          g.quad(P(ax, az, y0 - 0.5), P(bx, bz, y1 - 0.5), P(bx, bz, y1 + top), P(ax, az, y0 + top), [
            nx * s,
            0,
            nz * s,
          ]);
          g.quad(P(ax, az, y0 - 0.5), P(bx, bz, y1 - 0.5), P(bx, bz, y1 + top), P(ax, az, y0 + top), [
            -nx * s,
            0,
            -nz * s,
          ]);
          // snow along its top
          g.color(0xf2f5f8);
          const P2 = (x: number, z: number, y: number, e: number): V => [x + nx * s * (o + e), y, z + nz * s * (o + e)];
          g.quad(
            P2(ax, az, y0 + top + 0.04, -0.12),
            P2(bx, bz, y1 + top + 0.04, -0.12),
            P2(bx, bz, y1 + top + 0.04, 0.12),
            P2(ax, az, y0 + top + 0.04, 0.12),
            [0, 1, 0],
          );
        }
        // the deck's underside
        g.color(timber ? 0x4a3b2e : 0x3d4247);
        const o = w.w / 2 + 0.15;
        g.quad(
          [ax + nx * o, w.h[i] - 0.2, az + nz * o],
          [bx + nx * o, w.h[i + 1] - 0.2, bz + nz * o],
          [bx - nx * o, w.h[i + 1] - 0.2, bz - nz * o],
          [ax - nx * o, w.h[i] - 0.2, az - nz * o],
          [0, -1, 0],
        );
      }
      // the steel bridge's piers on the ice
      if (!timber)
        for (const k of [a + Math.round((b - a) * 0.33), a + Math.round((b - a) * 0.66)]) {
          const [x, z] = L[k];
          g.color(0x6a6f75).box(x - 1, terrainAt(x, z) - 1, z - 4.4, x + 1, w.h[k] - 0.2, z + 4.4);
        }
      this.add(g.build(), this.lambert());
    }
  }

  // ── the pond and the river, frozen ──
  private water() {
    const ice = this.keep(
      new MeshStandardMaterial({ map: this.ts.ice, roughness: 0.62, metalness: 0.0, color: 0xdde6ee }),
    );
    if (this.near(POND.cx, POND.cz, POND.rx)) {
      const g = new G();
      const n = 64;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        const y = POND_LEVEL + 0.04;
        const P = (a: number, k: number): V => [
          POND.cx + Math.cos(a) * POND.rx * k,
          y,
          POND.cz + Math.sin(a) * POND.rz * k,
        ];
        const U = (p: V): [number, number] => [p[0] / 30, p[2] / 30];
        const ps = [P(a0, 0), P(a1, 0), P(a1, 1.02), P(a0, 1.02)];
        g.quad(ps[0], ps[1], ps[2], ps[3], [0, 1, 0], ps.map(U) as [number, number][]);
      }
      this.add(g.build(), ice, "receive");
      // the dock: planks on posts, a canoe turned over under snow
      const d = new G();
      const dx0 = -253.5;
      const dx1 = -250.5;
      const y = POND_LEVEL + 0.55;
      for (let z = -98; z < -84; z += 0.45)
        d.color(z % 0.9 < 0.45 ? 0x6b5442 : 0x5e4a3b).box(dx0, y, z, dx1, y + 0.12, z + 0.4);
      d.color(0xf1f4f7).box(dx0 + 0.15, y + 0.12, -97.8, dx1 - 0.15, y + 0.2, -84.4);
      for (const z of [-97, -92, -87, -84.4])
        for (const x of [dx0 + 0.15, dx1 - 0.15])
          d.color(0x3f342c).box(x - 0.14, POND_LEVEL - 0.3, z - 0.14, x + 0.14, y, z + 0.14);
      this.add(d.build(), this.lambert());
      const canoe = tinted(
        new SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.45, 0.32, 2.3),
        0x7a2f22,
      );
      const cs = tinted(
        new SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.42, 0.18, 2.1).translate(0, 0.2, 0),
        0xf4f6f9,
      );
      const c = mergeGeometries([canoe, cs], false);
      this.add(place(c, -252, y + 0.12, -91, 0.05), this.lambert());
    }
    // the river: a ribbon of ice in its bed, snow drifted on it
    const g = new G();
    let v = 0;
    const L = RIVER.line;
    for (let i = 0; i < L.length - 1; i++) {
      const [ax, az] = L[i];
      const [bx, bz] = L[i + 1];
      if (!this.near(ax, az, 30)) continue;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const o = RIVER.w / 2 + 0.6;
      const ya = RIVER.h[i] + 0.04;
      const yb = RIVER.h[i + 1] + 0.04;
      const ps: V[] = [
        [ax - nx * o, ya, az - nz * o],
        [ax + nx * o, ya, az + nz * o],
        [bx + nx * o, yb, bz + nz * o],
        [bx - nx * o, yb, bz - nz * o],
      ];
      g.quad(ps[0], ps[1], ps[2], ps[3], [0, 1, 0], ps.map((p) => [p[0] / 24, p[2] / 24]) as [number, number][]);
      v += len;
    }
    if (!g.empty) this.add(g.build(), ice, "receive");
    void v;
    // the ravine's creek: a thin ice line on its floor
    const k = new G();
    for (let i = 0; i < RAVINE.line.length - 1; i++) {
      const [ax, az] = RAVINE.line[i];
      const [bx, bz] = RAVINE.line[i + 1];
      if (!this.near(ax, az, 20)) continue;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const ya = terrainAt(ax, az) + 0.05;
      const yb = terrainAt(bx, bz) + 0.05;
      const ps: V[] = [
        [ax - nx * 1.4, ya, az - nz * 1.4],
        [ax + nx * 1.4, ya, az + nz * 1.4],
        [bx + nx * 1.4, yb, bz + nz * 1.4],
        [bx - nx * 1.4, yb, bz - nz * 1.4],
      ];
      k.quad(ps[0], ps[1], ps[2], ps[3], [0, 1, 0], ps.map((p) => [p[0] / 24, p[2] / 24]) as [number, number][]);
    }
    if (!k.empty) this.add(k.build(), ice, "receive");
  }

  // ── the parking lot: its asphalt, cars and lamps as the game has them ──
  private lot() {
    if (!this.near((LOT.x0 + LOT.x1) / 2, (LOT.z0 + LOT.z1) / 2, 40)) return;
    const lay = campusLot(36);
    const lot: Lot = {
      ...LOT,
      cols: lay.cols as Lot["cols"],
      aisles: lay.aisles,
      bayW: lay.bayW,
      bayL: lay.bayL,
      bays: lay.bays as Lot["bays"],
    };
    const t = this.keep(tex(lotCanvas(this.T, lot, 20), false));
    const g = new G();
    g.quad(
      [LOT.x0, 0.03, LOT.z0],
      [LOT.x1, 0.03, LOT.z0],
      [LOT.x1, 0.03, LOT.z1],
      [LOT.x0, 0.03, LOT.z1],
      [0, 1, 0],
      [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    );
    if (!this.o.stream) this.add(g.build(), this.lambert(0xffffff, t, false), "receive");
    // the cars, nose-in, under snow
    const solids: BufferGeometry[] = [];
    const glass: BufferGeometry[] = [];
    for (const c of lay.cars) {
      const { solid, glass: gl } = carGeometry(
        c.wagon,
        [0xcbbd98, 0x6b2430, 0x4a5a73, 0xe8e6df, 0x1f2124, 0x6a4a35, 0x8b8f93, 0x2f4a3b, 0xb8702a][c.colour],
        c.snowy,
      );
      const ry = (c.dir > 0 ? 0 : Math.PI) + c.tilt;
      solids.push(place(solid, c.x, 0.03, c.z, ry));
      glass.push(place(gl, c.x, 0.03, c.z, ry));
    }
    if (!this.o.stream) {
      this.add(mergeGeometries(solids, false), this.lambert());
      this.add(mergeGeometries(glass, false), this.lambert(0x9aa6ae), "cast");
    }
    for (const s of [...solids, ...glass]) s.dispose();
    // the plough's banks round it (open where the driveway and the path go out)
    const banks: BufferGeometry[] = lotBanks().map((k) =>
      place(tinted(new SphereGeometry(1, 9, 6).scale(k.s, k.s * 0.42, k.sz), 0xf6f8fa), k.x, -0.1, k.z, k.ry),
    );
    this.add(mergeGeometries(banks, false), this.lambert());
    for (const b of banks) b.dispose();
    // (in the game the lot's lamp posts and its path are the ground floor's)
    if (this.o.stream) return;
    for (const l of lay.lamps) this.lampAt(l.x, l.z, l.x > LOT.x1 - 3 ? Math.PI : Math.PI / 2, "cobra");
    // the cleared path from the lot to the doors, and the canopy over them
    const p = new G().color(0xbab9b4);
    p.quad([LOT.x1, 0.035, 16], [0, 0.035, 16], [0, 0.035, 20], [LOT.x1, 0.035, 20], [0, 1, 0]);
    this.add(p.build(), this.lambert(), "receive");
  }

  // ── the woods: instanced, full detail near, cheap far ──
  private woods() {
    const { cx, cz, radius } = this.o;
    const near = (this.o.near ?? 140) * 1.1;
    const trees: Tree[] = [];
    for (let j = Math.floor((cz - radius) / CHUNK); j <= Math.floor((cz + radius) / CHUNK); j++)
      for (let i = Math.floor((cx - radius) / CHUNK); i <= Math.floor((cx + radius) / CHUNK); i++)
        for (const t of treesIn(i, j))
          if (
            Math.hypot(t.x - cx, t.z - cz) < radius &&
            !(this.o.clear ?? []).some((c) => Math.hypot(t.x - c.x, t.z - c.z) < c.r)
          )
            trees.push(t);
    const r = groundsRng(9);
    const pines = [0, 1, 2].map(() => this.keep(pineGeometry(r)));
    const farPine = this.keep(farPineGeometry());
    const birches = [0, 1, 2].map(() => this.keep(birchGeometry(r)));
    const bares = [0, 1, 2].map(() => this.keep(bareTree3(r)));
    const mat = this.lambert();
    const groups = new Map<BufferGeometry, Matrix4[]>();
    const m4 = (t: Tree, s: number) =>
      new Matrix4().compose(
        new Vector3(t.x, t.y - 0.25, t.z),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), t.ry),
        new Vector3(s, s * (0.9 + (t.s % 0.2)), s),
      );
    for (const t of trees) {
      const d = Math.hypot(t.x - cx, t.z - cz);
      let g: BufferGeometry;
      let s = t.s;
      if (t.kind === "pine") {
        g = d < near ? pines[Math.floor(t.ry * 10) % 3] : farPine;
        s *= 1.45;
      } else if (d > near * 1.8) continue;
      else if (t.kind === "birch") g = birches[Math.floor(t.ry * 10) % 3];
      else {
        g = bares[Math.floor(t.ry * 10) % 3];
        s *= 1.7;
      }
      const l = groups.get(g) ?? [];
      groups.set(g, l);
      l.push(m4(t, s));
    }
    for (const [g, ms] of groups) {
      const mesh = new InstancedMesh(g, mat, ms.length);
      for (const [i, m] of ms.entries()) mesh.setMatrixAt(i, m);
      mesh.castShadow = g !== farPine;
      mesh.receiveShadow = false;
      this.root.add(mesh);
    }
    // soft snow mounds at the trunks' feet (near only)
    const mounds: BufferGeometry[] = [];
    for (const t of trees)
      if (t.kind === "pine" && Math.hypot(t.x - cx, t.z - cz) < near * 0.6)
        mounds.push(
          place(tinted(new SphereGeometry(1, 7, 4).scale(2.2 * t.s, 0.45, 2.2 * t.s), 0xf6f8fb), t.x, t.y - 0.2, t.z),
        );
    if (mounds.length) this.add(mergeGeometries(mounds, false), mat, "receive");
    for (const m of mounds) m.dispose();
  }

  // ── buildings ──
  private facade: { map: CanvasTexture; lit: CanvasTexture } | null = null;
  private curtainMat(): MeshLambertMaterial {
    if (!this.facade) {
      this.facade = facadeCanvases(this.T);
      this.keep(this.facade.map);
      this.keep(this.facade.lit);
    }
    const m = this.keep(
      new MeshLambertMaterial({
        map: this.facade.map,
        emissive: 0xffffff,
        emissiveMap: this.facade.lit,
        emissiveIntensity: 0,
      }),
    );
    return this.glows(m, 0.9, "windows");
  }
  private building(b: Building) {
    const n = this.root.children.length;
    this.buildingBody(b);
    // one you walk into (the town's bar, diner, market; the gatehouse): its
    // inside; while you're in, its outside goes (a doll's house: the inside's
    // walls face in, the near one turned away from the camera)
    const inside = this.o.stream ? insideOf(b) : null;
    if (!inside) return;
    const added = this.root.children.slice(n);
    this.cuts.set(b.key, { b, parts: added });
    this.interior(inside);
  }
  private interior(i: Inside) {
    const { b } = i;
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const g = new G();
    // the floor
    g.color(new Color(i.floor).getHex());
    g.quad(
      [b.x0 + 0.05, y0 + 0.03, b.z0 + 0.05],
      [b.x1 - 0.05, y0 + 0.03, b.z0 + 0.05],
      [b.x1 - 0.05, y0 + 0.03, b.z1 - 0.05],
      [b.x0 + 0.05, y0 + 0.03, b.z1 - 0.05],
      [0, 1, 0],
    );
    // the walls from inside (the doorway open)
    const wallC = b.sign === "BAR" ? 0x4a3426 : 0xe6e0d4;
    const H = 2.7;
    const e = 0.12;
    g.color(wallC);
    for (let x = b.x0; x < b.x1; x++) {
      if (wallEdgeAt("h", x, b.z0))
        g.quad([x, y0, b.z0 + e], [x + 1, y0, b.z0 + e], [x + 1, y0 + H, b.z0 + e], [x, y0 + H, b.z0 + e], [0, 0, 1]);
      if (wallEdgeAt("h", x, b.z1))
        g.quad([x, y0, b.z1 - e], [x + 1, y0, b.z1 - e], [x + 1, y0 + H, b.z1 - e], [x, y0 + H, b.z1 - e], [0, 0, -1]);
    }
    for (let z = b.z0; z < b.z1; z++) {
      if (wallEdgeAt("v", b.x0, z))
        g.quad([b.x0 + e, y0, z], [b.x0 + e, y0, z + 1], [b.x0 + e, y0 + H, z + 1], [b.x0 + e, y0 + H, z], [1, 0, 0]);
      if (wallEdgeAt("v", b.x1, z))
        g.quad([b.x1 - e, y0, z], [b.x1 - e, y0, z + 1], [b.x1 - e, y0 + H, z + 1], [b.x1 - e, y0 + H, z], [-1, 0, 0]);
    }
    // the furniture
    const glow: [number, number, number, number, number, number, number][] = [];
    for (const f of i.fits) {
      const { x, z, w, d, h } = f;
      switch (f.kind) {
        case "counter":
          g.color(b.sign === "BAR" ? 0x3e2718 : 0xd8d2c4).box(x, y0, z, x + w, y0 + h - 0.08, z + d);
          g.color(b.sign === "BAR" ? 0x7a5236 : 0xb9b2a3).box(
            x - 0.08,
            y0 + h - 0.08,
            z - 0.12,
            x + w + 0.08,
            y0 + h,
            z + d + 0.08,
          );
          break;
        case "stool":
          g.color(0x2b2a26).box(x + 0.25, y0, z + 0.25, x + 0.35, y0 + h - 0.08, z + 0.35);
          g.color(0xb5562f).box(x, y0 + h - 0.1, z, x + w, y0 + h, z + d);
          break;
        case "table":
          g.color(0x2b2a26).box(
            x + w / 2 - 0.06,
            y0,
            z + d / 2 - 0.06,
            x + w / 2 + 0.06,
            y0 + h - 0.06,
            z + d / 2 + 0.06,
          );
          g.color(0x8a5a36).box(x, y0 + h - 0.06, z, x + w, y0 + h, z + d);
          break;
        case "chair":
          g.color(0x5b3a26).box(x, y0 + 0.42, z, x + w, y0 + 0.5, z + d);
          g.color(0x5b3a26).box(x, y0, z, x + 0.06, y0 + 0.42, z + 0.06);
          g.color(0x5b3a26).box(x + w - 0.06, y0, z + d - 0.06, x + w, y0 + h, z + d);
          break;
        case "booth":
          g.color(0x8a3b2e).box(x, y0, z, x + w, y0 + 0.5, z + 0.7);
          g.color(0x8a3b2e).box(x, y0, z, x + w, y0 + h, z + 0.25);
          g.color(0x8a3b2e).box(x, y0, z + d - 0.7, x + w, y0 + 0.5, z + d);
          g.color(0xd8d2c4).box(x + 0.4, y0 + 0.75, z + 1.0, x + w - 0.4, y0 + 0.8, z + d - 1.0);
          g.color(0x9aa1a6).box(x + w / 2 - 0.05, y0, z + d / 2 - 0.05, x + w / 2 + 0.05, y0 + 0.75, z + d / 2 + 0.05);
          break;
        case "shelf":
          g.color(b.sign === "BAR" ? 0x3e2718 : 0x9aa0a6).box(x, y0, z, x + w, y0 + h, z + d);
          // what's on it: bottles, tins, boxes, a row a shelf
          for (let k = 0.5; k < h - 0.2; k += 0.55)
            for (let u = x + 0.1; u < x + w - 0.2; u += 0.3) {
              const r = Math.sin(u * 12.9 + k * 78.2) * 43758.5453;
              const c = [0x2f4a3b, 0x6b2430, 0xc39a4a, 0x3d4a5c, 0xe8e6df, 0xb5562f][
                Math.floor((r - Math.floor(r)) * 6)
              ];
              const front = f.z + f.d > b.z1 - 1.5 ? z - 0.02 : z + d + 0.02;
              g.color(c).box(
                u,
                y0 + k,
                Math.min(front, front - 0.2),
                u + 0.2,
                y0 + k + 0.35,
                Math.max(front, front - 0.2),
              );
            }
          break;
        case "fridge":
          g.color(0xd6d2c8).box(x, y0, z, x + w, y0 + h, z + d);
          glow.push([x - 0.02, y0 + 0.2, z + 0.2, x, y0 + h - 0.2, z + d - 0.2, 0xdfeeff]);
          break;
        case "jukebox":
          g.color(0x5a1e1e).box(x, y0, z, x + w, y0 + h, z + d);
          glow.push([x + 0.15, y0 + 0.8, z + d, x + w - 0.15, y0 + h - 0.15, z + d + 0.02, 0xffb35c]);
          break;
        case "till":
          g.color(0x9a948a).box(x, y0, z, x + w, y0 + h, z + d);
          g.color(0x2b2a26).box(x + 0.4, y0 + h, z + 0.3, x + 1.0, y0 + h + 0.3, z + 0.8);
          break;
        case "desk":
          g.color(0x5a4636).box(x, y0, z, x + w, y0 + h, z + d);
          break;
        case "screens":
          glow.push([x, y0 + 0.85, z, x + 0.06, y0 + h, z + d, 0x9fd2c0]);
          break;
      }
    }
    this.add(g.build(), this.lambert());
    if (glow.length) {
      const gg = new G();
      for (const [ax, ay, az, bx, by, bz, c] of glow) gg.color(c).box(ax, ay, az, bx, by, bz);
      const m = this.glows(
        this.keep(new MeshLambertMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0 })),
        0.8,
        "windows",
      );
      m.emissiveMap = null;
      this.add(gg.build(), m, "none");
    }
    // its light, for the night
    this.lights.push({
      p: new Vector3((b.x0 + b.x1) / 2, y0 + 2.4, (b.z0 + b.z1) / 2),
      kind: "porch",
      color: 0xffd29a,
      r: 6,
    });
  }
  private buildingBody(b: Building) {
    switch (b.kind) {
      case "hq":
      case "block":
        return this.block(b);
      case "gatehouse":
        return this.gatehouse(b);
      case "boathouse":
        return this.boathouse(b);
      case "shed":
        return this.shed(b);
      case "shelter":
        return this.shelter(b);
      case "house":
        return this.house(b);
      case "church":
        return this.church(b);
      case "gas":
        return this.gas(b);
      default:
        return this.shop(b);
    }
  }
  private block(b: Building) {
    const y0 = terrainAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const top = y0 + b.floors * STOREY;
    const skin = new G();
    const S = 0.12;
    // (a block whose ground floor is the stored floor's: that floor draws its
    // glass; the skin starts a storey up, a slab's edge between)
    const own = !!(b.stored && this.o.stream);
    const base = own ? y0 + STOREY : y0;
    const v0 = (base - y0) / (STOREY * 4);
    const v1 = (top - y0) / (STOREY * 4);
    const face = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      skin.quad(
        [ax + nx * S, base, az + nz * S],
        [bx + nx * S, base, bz + nz * S],
        [bx + nx * S, top, bz + nz * S],
        [ax + nx * S, top, az + nz * S],
        [nx, 0, nz],
        [
          [0, v0],
          [len / (BAY * 4), v0],
          [len / (BAY * 4), v1],
          [0, v1],
        ],
      );
    };
    face(b.x0, b.z0, b.x1, b.z0, 0, -1);
    face(b.x1, b.z1, b.x0, b.z1, 0, 1);
    face(b.x0, b.z1, b.x0, b.z0, -1, 0);
    face(b.x1, b.z0, b.x1, b.z1, 1, 0);
    const skinMesh = this.add(skin.build(), this.curtainMat());
    const above: Object3D[] = [skinMesh];
    // parapet, roof under snow, rooftop plant
    const cap = new G().color(0xe9ebec);
    if (own) cap.color(0xd8d4cb).box(b.x0 - S, y0 + 3.2, b.z0 - S, b.x1 + S, base, b.z1 + S);
    cap.color(0xe9ebec);
    cap.box(b.x0 - 0.3, top, b.z0 - 0.3, b.x1 + 0.3, top + 0.7, b.z0 + 0.2);
    cap.box(b.x0 - 0.3, top, b.z1 - 0.2, b.x1 + 0.3, top + 0.7, b.z1 + 0.3);
    cap.box(b.x0 - 0.3, top, b.z0 - 0.3, b.x0 + 0.2, top + 0.7, b.z1 + 0.3);
    cap.box(b.x1 - 0.2, top, b.z0 - 0.3, b.x1 + 0.3, top + 0.7, b.z1 + 0.3);
    cap.color(0xf6f8fa).box(b.x0, top - 0.1, b.z0, b.x1, top + 0.35, b.z1);
    const r = groundsRng(b.x0 * 7 + b.z0);
    for (let i = 0; i < 5; i++) {
      const x = b.x0 + 3 + r() * (b.x1 - b.x0 - 8);
      const z = b.z0 + 3 + r() * (b.z1 - b.z0 - 8);
      const w = 2 + r() * 3;
      const d = 1.5 + r() * 2;
      const h = 0.9 + r() * 0.8;
      cap.color(0x8e9399).box(x, top, z, x + w, top + h, z + d);
      cap.color(0xf6f8fa).box(x - 0.05, top + h, z - 0.05, x + w + 0.05, top + h + 0.2, z + d + 0.05);
    }
    above.push(this.add(cap.build(), this.lambert()));
    if (own) this.cuts.set(b.key, { b, parts: above });
    // drifts at the foot of the walls
    const drifts: BufferGeometry[] = [];
    const rd = groundsRng(b.z1 * 13 + 5);
    const along = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0.8; t < len; t += 1.6 + rd() * 1.4) {
        const x = ax + ((bx - ax) * t) / len + nx * 0.8;
        const z = az + ((bz - az) * t) / len + nz * 0.8;
        if (this.isDoor(b, x, z)) continue;
        const sz = 0.9 + rd() * 1.4;
        drifts.push(
          place(
            tinted(
              new SphereGeometry(1, 8, 5).scale(sz * (nx ? 0.55 : 1.3), sz * 0.38, sz * (nz ? 0.55 : 1.3)),
              0xf6f8fa,
            ),
            x,
            y0 - 0.12,
            z,
          ),
        );
      }
    };
    along(b.x0, b.z0, b.x1, b.z0, 0, -1);
    along(b.x0, b.z1, b.x1, b.z1, 0, 1);
    along(b.x0, b.z0, b.x0, b.z1, -1, 0);
    along(b.x1, b.z0, b.x1, b.z1, 1, 0);
    this.add(mergeGeometries(drifts, false), this.lambert());
    for (const d of drifts) d.dispose();
    // the doors: a lit glass vestibule (you walk in)
    if (b.enter && !own)
      for (const d of this.doorsOf(b)) this.vestibule(d.x, d.z, d.nx, d.nz, y0, b.kind === "hq" && d.nx < 0);
  }
  private doorsOf(b: Building): { x: number; z: number; nx: number; nz: number }[] {
    if (b.key === "hq")
      return [
        { x: 0, z: 18, nx: -1, nz: 0 },
        { x: b.x1, z: 18, nx: 1, nz: 0 },
      ];
    if (b.key === "east") return [{ x: b.x0, z: 18, nx: -1, nz: 0 }];
    if (b.key === "south") return [{ x: 24, z: b.z0, nx: 0, nz: -1 }];
    return [];
  }
  private isDoor(b: Building, x: number, z: number): boolean {
    return this.doorsOf(b).some((d) => Math.hypot(d.x - x, d.z - z) < 6.5);
  }
  private vestibule(x: number, z: number, nx: number, nz: number, y0: number, canopy: boolean) {
    const g = new G();
    const tx = -nz;
    const tz = nx;
    const W = 4;
    const D = 1.4;
    const H = 3;
    const P = (a: number, d: number, y: number): V => [x + tx * a + nx * d, y0 + y, z + tz * a + nz * d];
    // the frame
    g.color(0x2a3036);
    for (const a of [-W / 2, -W / 6, W / 6, W / 2]) {
      const [px, , pz] = P(a, D, 0);
      g.box(px - 0.08, y0, pz - 0.08, px + 0.08, y0 + H, pz + 0.08);
    }
    const [ax, , az] = P(-W / 2 - 0.1, 0, 0);
    const [bx, , bz] = P(W / 2 + 0.1, D + 0.1, 0);
    g.color(0xd8d4cb).box(Math.min(ax, bx), y0 + H, Math.min(az, bz), Math.max(ax, bx), y0 + H + 0.3, Math.max(az, bz));
    g.color(0xf6f8fa).box(
      Math.min(ax, bx),
      y0 + H + 0.3,
      Math.min(az, bz),
      Math.max(ax, bx),
      y0 + H + 0.45,
      Math.max(az, bz),
    );
    // the mat
    g.color(0x50545a);
    g.quad(P(-W / 2, D + 1.5, 0.04), P(W / 2, D + 1.5, 0.04), P(W / 2, 0, 0.04), P(-W / 2, 0, 0.04), [0, 1, 0]);
    if (canopy) {
      g.color(0xd8d4cb);
      const [cx0, , cz0] = P(-6, 0, 0);
      const [cx1, , cz1] = P(6, 4.4, 0);
      g.box(Math.min(cx0, cx1), y0 + 3.4, Math.min(cz0, cz1), Math.max(cx0, cx1), y0 + 3.8, Math.max(cz0, cz1));
      g.color(0xffffff).box(
        Math.min(cx0, cx1),
        y0 + 3.8,
        Math.min(cz0, cz1),
        Math.max(cx0, cx1),
        y0 + 4.0,
        Math.max(cz0, cz1),
      );
      g.color(0x8e9399);
      for (const a of [-5.5, 5.5]) {
        const [px, , pz] = P(a, 4.1, 0);
        g.box(px - 0.18, y0, pz - 0.18, px + 0.18, y0 + 3.4, pz + 0.18);
      }
    }
    this.add(g.build(), this.lambert());
    // its glass, lit from inside
    const glass = new G().color(0xffffff);
    glass.quad(P(-W / 2, D, 0), P(W / 2, D, 0), P(W / 2, D, H), P(-W / 2, D, H), [nx, 0, nz]);
    for (const s of [-1, 1])
      glass.quad(P((s * W) / 2, 0, 0), P((s * W) / 2, D, 0), P((s * W) / 2, D, H), P((s * W) / 2, 0, H), [
        tx * s,
        0,
        tz * s,
      ]);
    const gm = this.keep(
      new MeshLambertMaterial({
        color: 0x6f8798,
        emissive: 0xffe2b0,
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0.8,
        side: DoubleSide,
      }),
    );
    this.add(glass.build(), this.glows(gm, 0.75, "windows"), "none");
    // its light on the ground in front
    const [lx, , lz] = P(0, D + 0.3, 0);
    this.lights.push({ p: new Vector3(lx, y0 + 2.9, lz), kind: "porch", color: 0xffd7a0, r: 5 });
    this.pool(lx + nx * 1.5, lz + nz * 1.5, 5, 0xffd9a8);
    if (canopy) {
      const lt = this.keep(tex(lettersCanvas(this.T, "YUTOPIA"), false));
      const lm = this.keep(new MeshBasicMaterial({ map: lt, transparent: true, toneMapped: false }));
      const plane = new Mesh(this.keep(new BoxGeometry(9, 1.4, 0.02)), lm);
      const [px, , pz] = P(0, 4.42, 0);
      plane.position.set(px, y0 + 3.62, pz);
      plane.rotation.y = Math.atan2(nx, nz);
      this.root.add(plane);
    }
  }
  /** A glass bridge across the courtyard at the studio's level. */
  private courtyardBridge() {
    if (!this.near(54, 18, 30)) return;
    const y = 14;
    const g = new G();
    g.color(0xe3e6ea).box(48.1, y + 2.9, 16.4, 59.9, y + 3.15, 19.6);
    g.color(0xf6f8fa).box(48.1, y + 3.15, 16.4, 59.9, y + 3.35, 19.6);
    g.color(0xd3d6da).box(48.1, y - 0.35, 16.4, 59.9, y, 19.6);
    this.add(g.build(), this.lambert());
    const gl = new G().color(0x7f95a6);
    gl.quad([48.1, y, 16.45], [59.9, y, 16.45], [59.9, y + 2.9, 16.45], [48.1, y + 2.9, 16.45], [0, 0, -1]);
    gl.quad([48.1, y, 19.55], [59.9, y, 19.55], [59.9, y + 2.9, 19.55], [48.1, y + 2.9, 19.55], [0, 0, 1]);
    const m = this.keep(
      new MeshLambertMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        side: DoubleSide,
        emissive: 0xffe6c0,
        emissiveIntensity: 0,
      }),
    );
    this.add(gl.build(), this.glows(m, 0.4, "windows"), "none");
  }
  /** A box with a pitched roof (ridge along x when `alongX`), snow on it. */
  private pitched(
    g: G,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    rise: number,
    alongX: boolean,
    roof: number,
    over = 0.4,
  ) {
    const xm = (x0 + x1) / 2;
    const zm = (z0 + z1) / 2;
    if (alongX) {
      for (const [za, s] of [
        [z0 - over, -1],
        [z1 + over, 1],
      ] as const) {
        g.color(roof);
        g.quad(
          [x0 - over, y, za],
          [x1 + over, y, za],
          [x1 + over, y + rise, zm],
          [x0 - over, y + rise, zm],
          [0, 1, s * 0.6],
        );
        g.color(0xf4f7fa);
        g.quad(
          [x0 - over, y + 0.18, za],
          [x1 + over, y + 0.18, za],
          [x1 + over, y + rise + 0.18, zm],
          [x0 - over, y + rise + 0.18, zm],
          [0, 1, s * 0.6],
        );
      }
      g.color(0xd9d4c9);
      for (const x of [x0, x1])
        g.quad([x, y, z0], [x, y, z1], [x, y + rise, zm], [x, y + rise, zm], [x === x0 ? -1 : 1, 0, 0]);
    } else {
      for (const [xa, s] of [
        [x0 - over, -1],
        [x1 + over, 1],
      ] as const) {
        g.color(roof);
        g.quad(
          [xa, y, z0 - over],
          [xa, y, z1 + over],
          [xm, y + rise, z1 + over],
          [xm, y + rise, z0 - over],
          [s * 0.6, 1, 0],
        );
        g.color(0xf4f7fa);
        g.quad(
          [xa, y + 0.18, z0 - over],
          [xa, y + 0.18, z1 + over],
          [xm, y + rise + 0.18, z1 + over],
          [xm, y + rise + 0.18, z0 - over],
          [s * 0.6, 1, 0],
        );
      }
      g.color(0xd9d4c9);
      for (const z of [z0, z1])
        g.quad([x0, y, z], [x1, y, z], [xm, y + rise, z], [xm, y + rise, z], [0, 0, z === z0 ? -1 : 1]);
    }
  }
  private litWindow(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    nx: number,
    nz: number,
    warm = true,
    on = 1,
  ) {
    const g = new G().color(0xffffff);
    const tx = -nz;
    const tz = nx;
    const o = 0.04;
    g.quad(
      [x - (tx * w) / 2 + nx * o, y, z - (tz * w) / 2 + nz * o],
      [x + (tx * w) / 2 + nx * o, y, z + (tz * w) / 2 + nz * o],
      [x + (tx * w) / 2 + nx * o, y + h, z + (tz * w) / 2 + nz * o],
      [x - (tx * w) / 2 + nx * o, y + h, z - (tz * w) / 2 + nz * o],
      [nx, 0, nz],
    );
    const m = this.keep(
      new MeshLambertMaterial({ color: 0x2c3540, emissive: warm ? 0xffc87a : 0xbcd2ea, emissiveIntensity: 0 }),
    );
    this.add(g.build(), this.glows(m, on, "windows"), "none");
  }
  private gatehouse(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const g = new G();
    g.color(0xd8d4cb).box(b.x0, y0, b.z0, b.x1, y0 + 1.0, b.z1);
    g.color(0x2a3036);
    for (const [x, z] of [
      [b.x0, b.z0],
      [b.x1, b.z0],
      [b.x0, b.z1],
      [b.x1, b.z1],
    ])
      g.box(x - 0.1, y0 + 1, z - 0.1, x + 0.1, y0 + 2.6, z + 0.1);
    g.color(0xd8d4cb).box(b.x0 - 0.6, y0 + 2.6, b.z0 - 0.6, b.x1 + 0.6, y0 + 2.95, b.z1 + 0.6);
    g.color(0xf6f8fa).box(b.x0 - 0.62, y0 + 2.95, b.z0 - 0.62, b.x1 + 0.62, y0 + 3.2, b.z1 + 0.62);
    // the desk, a monitor inside
    g.color(0x5a4636).box(b.x0 + 0.2, y0 + 1.0, b.z0 + 0.4, b.x0 + 1.0, y0 + 1.05, b.z1 - 0.4);
    this.add(g.build(), this.lambert());
    // the glass band, lit warm
    const gl = new G().color(0xffffff);
    const yb = y0 + 1.0;
    const yt = y0 + 2.6;
    gl.quad([b.x0, yb, b.z0], [b.x1, yb, b.z0], [b.x1, yt, b.z0], [b.x0, yt, b.z0], [0, 0, -1]);
    gl.quad([b.x0, yb, b.z1], [b.x1, yb, b.z1], [b.x1, yt, b.z1], [b.x0, yt, b.z1], [0, 0, 1]);
    gl.quad([b.x0, yb, b.z0], [b.x0, yb, b.z1], [b.x0, yt, b.z1], [b.x0, yt, b.z0], [-1, 0, 0]);
    gl.quad([b.x1, yb, b.z0], [b.x1, yb, b.z1], [b.x1, yt, b.z1], [b.x1, yt, b.z0], [1, 0, 0]);
    const m = this.keep(
      new MeshLambertMaterial({
        color: 0x51606b,
        emissive: 0xffcf8a,
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0.85,
        side: DoubleSide,
      }),
    );
    this.add(gl.build(), this.glows(m, 1.1, "windows"), "none");
    this.lights.push({
      p: new Vector3((b.x0 + b.x1) / 2, y0 + 2.4, (b.z0 + b.z1) / 2),
      kind: "gate",
      color: 0xffd090,
      r: 6,
    });
    this.pool((b.x0 + b.x1) / 2 - 2.5, (b.z0 + b.z1) / 2, 6, 0xffd9a8);
    // the barrier across the road, down
    const bar = new G();
    const px = -36;
    const pz = GATE.z - 0.5;
    const py = groundAt(px, pz);
    bar.color(0x8e9399).box(px - 0.3, py, pz - 0.3, px + 0.3, py + 1.1, pz + 0.3);
    for (let k = 0; k < 8; k++)
      bar
        .color(k % 2 ? 0xf2f2f2 : 0xc8322a)
        .box(px - 0.3 - (k + 1) * 0.95, py + 0.95, pz - 0.07, px - 0.3 - k * 0.95, py + 1.12, pz + 0.07);
    bar.color(0x8e9399).box(-44.6, py, pz - 0.12, -44.2, py + 0.95, pz + 0.12);
    this.add(bar.build(), this.lambert());
    // the sign by the road
    this.signBoard(
      "PRIVATE PROPERTY\nAUTHORISED VEHICLES ONLY\nALL VISITORS REPORT TO THE GATEHOUSE",
      -47.5,
      GATE.z + 4,
      Math.PI / 2,
      4.2,
      1.8,
      1.0,
      "#e9e6dc",
      "#1c2228",
    );
  }
  private signBoard(
    text: string,
    x: number,
    z: number,
    ry: number,
    w: number,
    h: number,
    up: number,
    bg = "#1d2226",
    fg = "#efe3c4",
    lit = false,
  ) {
    const y0 = groundAt(x, z);
    const c = signCanvas(this.T, text, 512, Math.round((512 * h) / w), bg, fg);
    const t = this.keep(tex(c, false));
    const m = lit
      ? this.glows(
          this.keep(new MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0 })),
          0.6,
          "sign",
        )
      : this.keep(new MeshLambertMaterial({ map: t }));
    const board = new Mesh(this.keep(new BoxGeometry(w, h, 0.08)), [
      this.lambert(0x2a2e33, undefined, false),
      this.lambert(0x2a2e33, undefined, false),
      this.lambert(0xf2f5f8, undefined, false),
      this.lambert(0x2a2e33, undefined, false),
      m,
      this.lambert(0x2a2e33, undefined, false),
    ]);
    board.position.set(x, y0 + up + h / 2, z);
    board.rotation.y = ry;
    board.castShadow = true;
    this.root.add(board);
    const posts = new G().color(0x3a3e44);
    const tx = Math.cos(ry);
    const tz = -Math.sin(ry);
    for (const s of [-1, 1]) {
      const px = x + tx * s * (w / 2 - 0.2);
      const pz = z + tz * s * (w / 2 - 0.2);
      posts.box(px - 0.06, y0, pz - 0.06, px + 0.06, y0 + up + h, pz + 0.06);
    }
    this.add(posts.build(), this.lambert());
  }
  private boathouse(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const siding = this.keep(tex(sidingCanvas(this.T, "#6e2a22")));
    const walls = new G();
    const H = 3.2;
    const U = (a: number, y: number): [number, number] => [a / 3, y / 3];
    const box = (x0: number, z0: number, x1: number, z1: number) => {
      walls.quad(
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0 + H, z0],
        [x0, y0 + H, z0],
        [0, 0, -1],
        [U(0, 0), U(x1 - x0, 0), U(x1 - x0, H), U(0, H)],
      );
      walls.quad(
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y0 + H, z1],
        [x0, y0 + H, z1],
        [0, 0, 1],
        [U(0, 0), U(x1 - x0, 0), U(x1 - x0, H), U(0, H)],
      );
      walls.quad(
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y0 + H, z1],
        [x0, y0 + H, z0],
        [-1, 0, 0],
        [U(0, 0), U(z1 - z0, 0), U(z1 - z0, H), U(0, H)],
      );
      walls.quad(
        [x1, y0, z0],
        [x1, y0, z1],
        [x1, y0 + H, z1],
        [x1, y0 + H, z0],
        [1, 0, 0],
        [U(0, 0), U(z1 - z0, 0), U(z1 - z0, H), U(0, H)],
      );
    };
    box(b.x0, b.z0, b.x1, b.z1);
    this.add(walls.build(), this.lambert(0xffffff, siding));
    const roof = new G();
    this.pitched(roof, b.x0, b.z0, b.x1, b.z1, y0 + H, 2.4, true, 0x3b3530, 0.5);
    // the big doors to the water, white trim
    roof.color(0xe8e4da).box(b.x0 + 3, y0, b.z1 + 0.02, b.x1 - 3, y0 + 2.6, b.z1 + 0.12);
    roof.color(0x5a231c).box(b.x0 + 3.2, y0, b.z1 + 0.1, b.x1 - 3.2, y0 + 2.45, b.z1 + 0.16);
    this.add(roof.build(), this.lambert());
    this.litWindow(b.x0 + 1.7, y0 + 1.2, b.z1, 1.2, 1.0, 0, 1, true, 0.8);
  }
  private shed(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const metal = this.keep(tex(corrugatedCanvas(this.T)));
    const g = new G();
    const H = 4;
    const U = (a: number, y: number): [number, number] => [a / 2, y / 2];
    g.quad(
      [b.x0, y0, b.z0],
      [b.x1, y0, b.z0],
      [b.x1, y0 + H, b.z0],
      [b.x0, y0 + H, b.z0],
      [0, 0, -1],
      [U(0, 0), U(b.x1 - b.x0, 0), U(b.x1 - b.x0, H), U(0, H)],
    );
    g.quad(
      [b.x0, y0, b.z1],
      [b.x1, y0, b.z1],
      [b.x1, y0 + H, b.z1],
      [b.x0, y0 + H, b.z1],
      [0, 0, 1],
      [U(0, 0), U(b.x1 - b.x0, 0), U(b.x1 - b.x0, H), U(0, H)],
    );
    g.quad(
      [b.x0, y0, b.z0],
      [b.x0, y0, b.z1],
      [b.x0, y0 + H, b.z1],
      [b.x0, y0 + H, b.z0],
      [-1, 0, 0],
      [U(0, 0), U(b.z1 - b.z0, 0), U(b.z1 - b.z0, H), U(0, H)],
    );
    g.quad(
      [b.x1, y0, b.z0],
      [b.x1, y0, b.z1],
      [b.x1, y0 + H, b.z1],
      [b.x1, y0 + H, b.z0],
      [1, 0, 0],
      [U(0, 0), U(b.z1 - b.z0, 0), U(b.z1 - b.z0, H), U(0, H)],
    );
    this.add(g.build(), this.lambert(0xffffff, metal));
    const r = new G();
    r.color(0xf6f8fa).box(b.x0 - 0.4, y0 + H, b.z0 - 0.4, b.x1 + 0.4, y0 + H + 0.45, b.z1 + 0.4);
    r.color(0x9aa0a6).box(b.x0 + 2, y0, b.z0 - 0.06, b.x0 + 7, y0 + 3.2, b.z0 + 0.02); // the roll-up door
    r.color(0x6b6f74).box(b.x1 - 4, y0, b.z0 - 3.4, b.x1 - 1, y0 + 0.9, b.z0 - 1.4); // the plough blade
    r.color(0xd8d0c0);
    const salt = tinted(new ConeGeometry(1.6, 1.5, 9).translate(0, 0.75, 0), 0xcfc7b8);
    this.add(r.build(), this.lambert());
    this.add(place(salt, b.x1 + 2, y0, b.z0 + 2), this.lambert());
  }
  private shelter(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const g = new G();
    g.color(0x2f3439);
    for (const [x, z] of [
      [b.x0, b.z0],
      [b.x1, b.z0],
      [b.x0, b.z1],
      [b.x1, b.z1],
    ])
      g.box(x - 0.06, y0, z - 0.06, x + 0.06, y0 + 2.5, z + 0.06);
    g.color(0x2f3439).box(b.x0 - 0.3, y0 + 2.5, b.z0 - 0.3, b.x1 + 0.3, y0 + 2.7, b.z1 + 0.3);
    g.color(0xf4f7fa).box(b.x0 - 0.3, y0 + 2.7, b.z0 - 0.3, b.x1 + 0.3, y0 + 2.95, b.z1 + 0.3);
    g.color(0x6a5040).box(b.x0 + 0.5, y0 + 0.45, b.z0 + 0.3, b.x1 - 0.5, y0 + 0.55, b.z0 + 0.8); // the bench
    this.add(g.build(), this.lambert());
    const gl = new G().color(0x8fa3b0);
    gl.quad([b.x0, y0 + 0.2, b.z0], [b.x1, y0 + 0.2, b.z0], [b.x1, y0 + 2.4, b.z0], [b.x0, y0 + 2.4, b.z0], [0, 0, -1]);
    gl.quad(
      [b.x0, y0 + 0.2, b.z0],
      [b.x0, y0 + 0.2, b.z1 - 1],
      [b.x0, y0 + 2.4, b.z1 - 1],
      [b.x0, y0 + 2.4, b.z0],
      [-1, 0, 0],
    );
    gl.quad(
      [b.x1, y0 + 0.2, b.z0],
      [b.x1, y0 + 0.2, b.z1 - 1],
      [b.x1, y0 + 2.4, b.z1 - 1],
      [b.x1, y0 + 2.4, b.z0],
      [1, 0, 0],
    );
    const m = this.keep(
      new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45, side: DoubleSide }),
    );
    this.add(gl.build(), m, "none");
    this.signBoard("BUS STOP", b.x1 + 1.2, b.z1 + 0.6, 0, 1.1, 0.5, 2.1, "#1d4a7a", "#f2f2f2");
  }
  private shop(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const r = groundsRng(b.x0 * 31 + 7);
    const fh = 3.8;
    const H = b.floors * fh + 0.8;
    const brick = r() < 0.6;
    const wall = this.keep(
      tex(
        brick
          ? brickCanvas(this.T, ["#7b3b2c", "#6c4436", "#8a5a42", "#5b4a44"][Math.floor(r() * 4)], b.x0)
          : sidingCanvas(this.T, ["#c9c2b2", "#8d9a9c", "#b9a98b"][Math.floor(r() * 3)]),
      ),
    );
    const g = new G();
    const U = (a: number, y: number): [number, number] => [a / 4, y / 4];
    const { x0, z0, x1, z1 } = b;
    g.quad(
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0 + H, z0],
      [x0, y0 + H, z0],
      [0, 0, -1],
      [U(0, 0), U(x1 - x0, 0), U(x1 - x0, H), U(0, H)],
    );
    g.quad(
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y0 + H, z1],
      [x0, y0 + H, z1],
      [0, 0, 1],
      [U(0, 0), U(x1 - x0, 0), U(x1 - x0, H), U(0, H)],
    );
    g.quad(
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y0 + H, z1],
      [x0, y0 + H, z0],
      [-1, 0, 0],
      [U(0, 0), U(z1 - z0, 0), U(z1 - z0, H), U(0, H)],
    );
    g.quad(
      [x1, y0, z0],
      [x1, y0, z1],
      [x1, y0 + H, z1],
      [x1, y0 + H, z0],
      [1, 0, 0],
      [U(0, 0), U(z1 - z0, 0), U(z1 - z0, H), U(0, H)],
    );
    this.add(g.build(), this.lambert(0xffffff, wall, false));
    // cornice and the roof's snow
    const c = new G();
    c.color(0x8c857a).box(x0 - 0.25, y0 + H - 0.5, z0 - 0.25, x1 + 0.25, y0 + H, z1 + 0.25);
    c.color(0xf4f7fa).box(x0 - 0.2, y0 + H, z0 - 0.2, x1 + 0.2, y0 + H + 0.3, z1 + 0.2);
    this.add(c.build(), this.lambert());
    // the front: towards the street
    const nz = b.face === "n" ? -1 : 1;
    const fz = b.face === "n" ? z0 : z1;
    const w = x1 - x0;
    const xm = (x0 + x1) / 2;
    const front = new G();
    if (b.vacant) {
      front.color(0xa48a6a).box(x0 + 1, y0 + 0.6, fz + nz * 0.02, x1 - 1, y0 + 3, fz + nz * 0.08);
      for (let f = 1; f < b.floors; f++)
        for (let k = 0; k < 3; k++) {
          const x = x0 + (w / 3) * (k + 0.5);
          front
            .color(0x9a8264)
            .box(x - 0.7, y0 + f * fh + 0.9, fz + nz * 0.02, x + 0.7, y0 + f * fh + 2.6, fz + nz * 0.08);
        }
      this.add(front.build(), this.lambert());
      this.signBoard("FOR LEASE", xm, fz + nz * 0.3, b.face === "n" ? Math.PI : 0, 1.6, 0.5, 1.5, "#d8d2c2", "#7a2a22");
      return;
    }
    // the shopfront: a frame, a big lit window either side of the door, an awning
    const tone = b.sign === "BAR" ? "#c86a3c" : b.kind === "diner" ? "#f0d9a0" : "#e6b878";
    const wt = this.keep(tex(shopWindowCanvas(this.T, b.x0, tone), false));
    const win = this.glows(
      this.keep(
        new MeshLambertMaterial({
          map: wt,
          color: 0x404850,
          emissive: 0xffffff,
          emissiveMap: wt,
          emissiveIntensity: 0,
        }),
      ),
      0.95,
      "windows",
    );
    const wg = new G().color(0xffffff);
    const ww = w - 2;
    wg.quad(
      [xm - (nz * ww) / 2, y0 + 0.6, fz + nz * 0.05],
      [xm + (nz * ww) / 2, y0 + 0.6, fz + nz * 0.05],
      [xm + (nz * ww) / 2, y0 + 3.0, fz + nz * 0.05],
      [xm - (nz * ww) / 2, y0 + 3.0, fz + nz * 0.05],
      [0, 0, nz],
    );
    this.add(wg.build(), win, "none");
    front.color(0x23292e);
    front.box(x0 + 0.4, y0, fz + nz * 0.02, x0 + 1, y0 + 3.4, fz + nz * 0.2);
    front.box(x1 - 1, y0, fz + nz * 0.02, x1 - 0.4, y0 + 3.4, fz + nz * 0.2);
    front.box(x0 + 0.4, y0 + 3.0, fz + nz * 0.02, x1 - 0.4, y0 + 3.4, fz + nz * 0.2);
    front.box(xm - 0.8, y0, fz + nz * 0.04, xm + 0.8, y0 + 2.6, fz + nz * 0.12); // the door
    // the awning, snow on it
    const aw = b.sign === "BAR" ? 0x5a1e1e : [0x2f4a3b, 0x6b2430, 0x2c3e55, 0x6a5a40][Math.floor(r() * 4)];
    front.color(aw);
    front.quad(
      [x0 + 0.6, y0 + 3.5, fz],
      [x1 - 0.6, y0 + 3.5, fz],
      [x1 - 0.6, y0 + 2.9, fz + nz * 1.6],
      [x0 + 0.6, y0 + 2.9, fz + nz * 1.6],
      [0, 1, nz],
    );
    front.color(0xf4f7fa);
    front.quad(
      [x0 + 0.6, y0 + 3.62, fz],
      [x1 - 0.6, y0 + 3.62, fz],
      [x1 - 0.6, y0 + 3.02, fz + nz * 1.5],
      [x0 + 0.6, y0 + 3.02, fz + nz * 1.5],
      [0, 1, nz],
    );
    this.add(front.build(), this.lambert());
    // the sign over the awning (lit), upstairs windows (some lit)
    if (b.sign) {
      const st = this.keep(
        tex(
          signCanvas(
            this.T,
            b.sign,
            512,
            96,
            b.sign === "BAR" ? "#2a0e0c" : "#1d2226",
            b.sign === "BAR" ? "#ffb48a" : "#efe3c4",
          ),
          false,
        ),
      );
      const sm = this.glows(
        this.keep(new MeshLambertMaterial({ map: st, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 0 })),
        b.sign === "BAR" ? 1.4 : 0.7,
        "sign",
      );
      const sw = Math.min(w - 1.5, 8);
      const plane = new Mesh(this.keep(new BoxGeometry(sw, sw * 0.1875, 0.1)), sm);
      plane.position.set(xm, y0 + 4.3, fz + nz * 0.08);
      plane.rotation.y = nz > 0 ? 0 : Math.PI;
      this.root.add(plane);
    }
    for (let f = 1; f < b.floors; f++)
      for (let k = 0; k < Math.max(2, Math.floor(w / 4)); k++) {
        const n = Math.max(2, Math.floor(w / 4));
        const x = x0 + (w / n) * (k + 0.5);
        const lit = r() < 0.45;
        this.litWindow(x, y0 + f * fh + 0.9, fz, 1.3, 1.8, 0, nz, true, lit ? 0.8 : 0);
      }
    // the door's light on the pavement
    this.lights.push({ p: new Vector3(xm, y0 + 3.2, fz + nz * 1.2), kind: "porch", color: 0xffc98a, r: 5 });
    this.pool(xm, fz + nz * 2.4, 4.5, 0xffc98a);
    if (b.kind === "hotel")
      this.signBoard("HOTEL", x1 + 0.2, fz + nz * 1.2, Math.PI / 2, 1.2, 4, 3.5, "#1d2226", "#f2d6a2", true);
  }
  private house(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const siding = this.keep(tex(sidingCanvas(this.T, "#d8d2c4")));
    const H = 6.4;
    const g = new G();
    const U = (a: number, y: number): [number, number] => [a / 3, y / 3];
    const { x0, z0, x1, z1 } = b;
    g.quad(
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0 + H, z0],
      [x0, y0 + H, z0],
      [0, 0, -1],
      [U(0, 0), U(x1 - x0, 0), U(x1 - x0, H), U(0, H)],
    );
    g.quad(
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y0 + H, z1],
      [x0, y0 + H, z1],
      [0, 0, 1],
      [U(0, 0), U(x1 - x0, 0), U(x1 - x0, H), U(0, H)],
    );
    g.quad(
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y0 + H, z1],
      [x0, y0 + H, z0],
      [-1, 0, 0],
      [U(0, 0), U(z1 - z0, 0), U(z1 - z0, H), U(0, H)],
    );
    g.quad(
      [x1, y0, z0],
      [x1, y0, z1],
      [x1, y0 + H, z1],
      [x1, y0 + H, z0],
      [1, 0, 0],
      [U(0, 0), U(z1 - z0, 0), U(z1 - z0, H), U(0, H)],
    );
    this.add(g.build(), this.lambert(0xffffff, siding, false));
    const r = new G();
    this.pitched(r, x0, z0, x1, z1, y0 + H, 2.6, false, 0x3a3f45, 0.45);
    // the porch: steps, a small roof, the door
    const nx = b.face === "e" ? 1 : -1;
    const fx = b.face === "e" ? x1 : x0;
    const zm = (z0 + z1) / 2;
    r.color(0x9a948a).box(Math.min(fx, fx + nx * 1.6), y0, zm - 1.4, Math.max(fx, fx + nx * 1.6), y0 + 0.5, zm + 1.4);
    r.color(0xf4f7fa).box(
      Math.min(fx, fx + nx * 1.8),
      y0 + 2.9,
      zm - 1.6,
      Math.max(fx, fx + nx * 1.8),
      y0 + 3.15,
      zm + 1.6,
    );
    r.color(0x3a3f45).box(
      Math.min(fx, fx + nx * 1.8),
      y0 + 2.75,
      zm - 1.6,
      Math.max(fx, fx + nx * 1.8),
      y0 + 2.9,
      zm + 1.6,
    );
    for (const s of [-1.4, 1.4])
      r.color(0xe8e4da).box(
        fx + nx * 1.6 - 0.08,
        y0 + 0.5,
        zm + s - 0.08,
        fx + nx * 1.6 + 0.08,
        y0 + 2.75,
        zm + s + 0.08,
      );
    r.color(0x2f3a44).box(
      Math.min(fx, fx + nx * 0.06),
      y0 + 0.5,
      zm - 0.5,
      Math.max(fx, fx + nx * 0.06),
      y0 + 2.6,
      zm + 0.5,
    );
    // a mailbox by the street
    r.color(0x3a3f45).box(fx + nx * 4.2 - 0.05, y0, z1 - 1.05, fx + nx * 4.2 + 0.05, y0 + 1.1, z1 - 0.95);
    r.color(0x2a2e33).box(fx + nx * 4.2 - 0.25, y0 + 1.1, z1 - 1.2, fx + nx * 4.2 + 0.25, y0 + 1.4, z1 - 0.8);
    this.add(r.build(), this.lambert());
    const q = groundsRng(b.z0 * 17 + b.x0);
    for (const dz of [-2.6, 2.6]) this.litWindow(fx, y0 + 0.9, zm + dz, 1.2, 1.5, nx, 0, true, q() < 0.4 ? 0.7 : 0);
    for (const dz of [-2.6, 0, 2.6]) this.litWindow(fx, y0 + 3.9, zm + dz, 1.1, 1.4, nx, 0, true, q() < 0.3 ? 0.6 : 0);
    this.lights.push({ p: new Vector3(fx + nx * 1.2, y0 + 2.6, zm), kind: "porch", color: 0xffc98a, r: 3 });
    this.pool(fx + nx * 2, zm, 3, 0xffc98a);
  }
  private church(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const siding = this.keep(tex(sidingCanvas(this.T, "#ecebe5")));
    const H = 6;
    const g = new G();
    const U = (a: number, y: number): [number, number] => [a / 3, y / 3];
    const { x0, z0, x1, z1 } = b;
    g.quad(
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0 + H, z0],
      [x0, y0 + H, z0],
      [0, 0, -1],
      [U(0, 0), U(x1 - x0, 0), U(x1 - x0, H), U(0, H)],
    );
    g.quad(
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y0 + H, z1],
      [x0, y0 + H, z1],
      [0, 0, 1],
      [U(0, 0), U(x1 - x0, 0), U(x1 - x0, H), U(0, H)],
    );
    g.quad(
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y0 + H, z1],
      [x0, y0 + H, z0],
      [-1, 0, 0],
      [U(0, 0), U(z1 - z0, 0), U(z1 - z0, H), U(0, H)],
    );
    g.quad(
      [x1, y0, z0],
      [x1, y0, z1],
      [x1, y0 + H, z1],
      [x1, y0 + H, z0],
      [1, 0, 0],
      [U(0, 0), U(z1 - z0, 0), U(z1 - z0, H), U(0, H)],
    );
    this.add(g.build(), this.lambert(0xffffff, siding, false));
    const r = new G();
    this.pitched(r, x0, z0, x1, z1, y0 + H, 6, false, 0x2f343a, 0.5);
    // the steeple at the front
    const xm = (x0 + x1) / 2;
    r.color(0xecebe5).box(xm - 2, y0, z1 - 1, xm + 2, y0 + 13, z1 + 2.5);
    r.color(0x2f343a).box(xm - 2.2, y0 + 13, z1 - 1.2, xm + 2.2, y0 + 13.4, z1 + 2.7);
    this.add(r.build(), this.lambert());
    const spire = tinted(new ConeGeometry(2.1, 9, 4).rotateY(Math.PI / 4).translate(0, 4.5, 0), 0x2f343a);
    this.add(place(spire, xm, y0 + 13.4, z1 + 0.75), this.lambert());
    for (const z of [z0 + 4, z0 + 9, z0 + 14, z0 + 19])
      for (const [x, nx] of [
        [x0, -1],
        [x1, 1],
      ] as const)
        this.litWindow(x, y0 + 1.4, z, 1.4, 3.2, nx, 0, true, 0.6);
    this.litWindow(xm, y0 + 5.5, z1 + 2.5, 1.2, 2.4, 0, 1, true, 0.8);
  }
  private gas(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const g = new G();
    // the kiosk at the back, the canopy over the pumps at the front
    g.color(0xd8d4cb).box(b.x0 + 2, y0, b.z1 - 6, b.x0 + 12, y0 + 3.2, b.z1);
    g.color(0xf4f7fa).box(b.x0 + 1.8, y0 + 3.2, b.z1 - 6.2, b.x0 + 12.2, y0 + 3.5, b.z1 + 0.2);
    for (const x of [b.x0 + 3, b.x1 - 3])
      for (const z of [b.z0 + 2, b.z0 + 8]) g.color(0xe9e9e6).box(x - 0.25, y0, z - 0.25, x + 0.25, y0 + 4.6, z + 0.25);
    g.color(0xb8322a).box(b.x0 + 1, y0 + 4.6, b.z0, b.x1 - 1, y0 + 5.4, b.z0 + 10);
    g.color(0xf4f7fa).box(b.x0 + 0.9, y0 + 5.4, b.z0 - 0.1, b.x1 - 0.9, y0 + 5.7, b.z0 + 10.1);
    for (const x of [b.x0 + 7, b.x1 - 7]) {
      g.color(0x9a948a).box(x - 0.6, y0, b.z0 + 3.5, x + 0.6, y0 + 0.25, b.z0 + 6.5);
      g.color(0xd6d2c8).box(x - 0.35, y0 + 0.25, b.z0 + 4.2, x + 0.35, y0 + 1.7, b.z0 + 4.8);
      g.color(0xd6d2c8).box(x - 0.35, y0 + 0.25, b.z0 + 5.2, x + 0.35, y0 + 1.7, b.z0 + 5.8);
    }
    this.add(g.build(), this.lambert());
    // the canopy's lit underside
    const u = new G().color(0xffffff);
    u.quad(
      [b.x0 + 1, y0 + 4.58, b.z0],
      [b.x1 - 1, y0 + 4.58, b.z0],
      [b.x1 - 1, y0 + 4.58, b.z0 + 10],
      [b.x0 + 1, y0 + 4.58, b.z0 + 10],
      [0, -1, 0],
    );
    const m = this.glows(
      this.keep(new MeshLambertMaterial({ color: 0xcfd2d4, emissive: 0xf4f8ff, emissiveIntensity: 0 })),
      1.0,
      "windows",
    );
    this.add(u.build(), m, "none");
    this.lights.push({ p: new Vector3((b.x0 + b.x1) / 2, y0 + 4.4, b.z0 + 5), kind: "porch", color: 0xeef3ff, r: 9 });
    this.pool((b.x0 + b.x1) / 2, b.z0 + 5, 9, 0xe8f0ff);
    this.litWindow(b.x0 + 7, y0 + 0.4, b.z1 - 6, 6, 2.2, 0, -1, true, 0.9);
    this.signBoard("GAS\n1.19", b.x0 + 0.5, b.z0 - 1, Math.PI, 1.6, 2.2, 3.4, "#f2f2ee", "#a5281c", true);
  }

  // ── lamps: posts, heads lit at night, pools of light on the snow ──
  private lampGeo: BufferGeometry[] = [];
  private headGeo = new G();
  private glowCards: { x: number; y: number; z: number; s: number; c: number }[] = [];
  private pools = new G();
  private pool(x: number, z: number, r: number, c = 0xdce8ff) {
    if (!this.near(x, z, 10)) return;
    const y = groundAt(x, z) + 0.06;
    this.pools.color(c);
    this.pools.quad([x - r, y, z - r], [x + r, y, z - r], [x + r, y, z + r], [x - r, y, z + r], [0, 1, 0]);
  }
  private lampAt(x: number, z: number, ry: number, kind: LampLight["kind"]) {
    if (!this.near(x, z, 20)) return;
    const gy = groundAt(x, z);
    const P = this.lampGeo;
    if (kind === "cobra") {
      P.push(place(tinted(new CylinderGeometry(0.09, 0.13, 9, 8).translate(0, 4.5, 0), 0x3a3e44), x, gy, z, ry));
      P.push(place(tinted(new CylinderGeometry(0.22, 0.26, 0.5, 8).translate(0, 0.25, 0), 0x3a3e44), x, gy, z, ry));
      P.push(place(tinted(new BoxGeometry(2.2, 0.12, 0.12).translate(1.0, 8.95, 0), 0x3a3e44), x, gy, z, ry));
      P.push(place(tinted(new BoxGeometry(1.0, 0.24, 0.42).translate(2.0, 8.9, 0), 0x50555b), x, gy, z, ry));
      P.push(place(tinted(new BoxGeometry(1.0, 0.08, 0.42).translate(2.0, 9.06, 0), 0xffffff), x, gy, z, ry));
      const hx = x + Math.cos(ry) * 2.0;
      const hz = z - Math.sin(ry) * 2.0;
      this.headGeo.color(0xeaf2ff);
      this.headGeo.quad(
        [hx - 0.45, gy + 8.76, hz - 0.2],
        [hx + 0.45, gy + 8.76, hz - 0.2],
        [hx + 0.45, gy + 8.76, hz + 0.2],
        [hx - 0.45, gy + 8.76, hz + 0.2],
        [0, -1, 0],
      );
      this.lights.push({ p: new Vector3(hx, gy + 8.7, hz), kind, color: 0xdfe8ff, r: 10 });
      this.glowCards.push({ x: hx, y: gy + 8.6, z: hz, s: 2.4, c: 0xdfe8ff });
      this.pool(hx, hz, 10);
    } else if (kind === "porch") {
      P.push(place(tinted(new BoxGeometry(0.25, 0.35, 0.25).translate(0, 2.4, 0), 0x2a2e33), x, gy, z, ry));
      this.glowCards.push({ x, y: gy + 2.3, z, s: 1.6, c: 0xffd29a });
      this.lights.push({ p: new Vector3(x, gy + 2.3, z), kind, color: 0xffd29a, r: 4 });
      this.pool(x, z, 4, 0xffd9a8);
    } else {
      // a town lamp: a dark post, a lantern on top
      P.push(place(tinted(new CylinderGeometry(0.08, 0.14, 4.2, 8).translate(0, 2.1, 0), 0x1f2a26), x, gy, z));
      P.push(place(tinted(new CylinderGeometry(0.24, 0.3, 0.6, 8).translate(0, 0.3, 0), 0x1f2a26), x, gy, z));
      P.push(place(tinted(new CylinderGeometry(0.34, 0.2, 0.18, 8).translate(0, 4.9, 0), 0x1f2a26), x, gy, z));
      P.push(place(tinted(new ConeGeometry(0.42, 0.4, 8).translate(0, 5.18, 0), 0x1f2a26), x, gy, z));
      P.push(place(tinted(new ConeGeometry(0.36, 0.22, 8).translate(0, 5.3, 0), 0xf4f7fa), x, gy, z));
      this.headGeo.color(0xffe0a8);
      const s = new G();
      s.color(0xffe0a8).box(-0.24, 4.25, -0.24, 0.24, 4.82, 0.24);
      this.headGeo.pos.push(...s.pos.map((v, i) => (i % 3 === 0 ? v + x : i % 3 === 1 ? v + gy : v + z)));
      this.headGeo.nor.push(...s.nor);
      this.headGeo.uv.push(...s.uv);
      this.headGeo.col.push(...s.col);
      this.lights.push({ p: new Vector3(x, gy + 4.55, z), kind, color: 0xffd9a0, r: kind === "lone" ? 7 : 6 });
      this.glowCards.push({ x, y: gy + 4.55, z, s: 1.5, c: 0xffd9a0 });
      this.pool(x, z, kind === "lone" ? 7 : 6, 0xffd9a8);
    }
  }
  private lamps() {
    for (const l of LAMPS) this.lampAt(l.x, l.z, l.ry, l.kind);
    if (this.lampGeo.length) this.add(mergeGeometries(this.lampGeo, false), this.lambert());
    for (const g of this.lampGeo) g.dispose();
    const head = this.glows(
      this.keep(new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, toneMapped: false })),
      1,
      "lamp",
    );
    if (!this.headGeo.empty) this.add(this.headGeo.build(), head, "none");
    // the pools: added light on the ground
    const pm = this.glows(
      this.keep(
        new MeshBasicMaterial({
          map: this.ts.pool,
          vertexColors: true,
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      ),
      0.5,
      "pool",
    );
    if (!this.pools.empty) {
      const m = this.add(this.pools.build(), pm, "none");
      m.renderOrder = 2;
    }
    // glow cards round the heads (always facing up the camera's way: billboards set by the scene)
    const gm = this.glows(
      this.keep(
        new MeshBasicMaterial({
          map: this.ts.glow,
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
      0.9,
      "glow",
    );
    const card = this.keep(new BufferGeometry());
    card.copy(new BoxGeometry(1, 1, 0.001));
    this.cards = new InstancedMesh(card, gm, Math.max(1, this.glowCards.length));
    this.cards.count = this.glowCards.length;
    this.cards.renderOrder = 3;
    this.root.add(this.cards);
  }
  private cards: InstancedMesh | null = null;
  /** Face the lamps' glow cards to the camera. */
  faceCards(cam: Vector3) {
    if (!this.cards) return;
    const o = new Object3D();
    this.glowCards.forEach((c, i) => {
      o.position.set(c.x, c.y, c.z);
      o.lookAt(cam);
      o.scale.set(c.s, c.s, 1);
      o.updateMatrix();
      this.cards?.setMatrixAt(i, o.matrix);
    });
    this.cards.instanceMatrix.needsUpdate = true;
  }

  // ── the company's fence: chain-link, posts, barbed wire, signs ──
  private fence() {
    const chain = this.keep(tex(chainCanvas(this.T)));
    const posts = new G().color(0x5d6268);
    const mesh = new G().color(0xffffff);
    const wire = new G().color(0x3a3e44);
    let n = 0;
    for (let i = 0; i < FENCE.length; i++) {
      const [ax, az] = FENCE[i];
      const [bx, bz] = FENCE[(i + 1) % FENCE.length];
      const len = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / len;
      const tz = (bz - az) / len;
      for (let t = 0; t < len; t += 3) {
        const x = ax + tx * t;
        const z = az + tz * t;
        if (!this.near(x, z, 6)) continue;
        if (Math.abs(z - GATE.z) < 1 && x > GATE.x - 5 && x < GATE.x + 12) continue; // the gate, the booth
        const x2 = ax + tx * Math.min(len, t + 3);
        const z2 = az + tz * Math.min(len, t + 3);
        const y = terrainAt(x, z);
        const y2 = terrainAt(x2, z2);
        posts.box(x - 0.05, y - 0.2, z - 0.05, x + 0.05, y + 2.6, z + 0.05);
        // the arm leaning out at the top, three strands
        mesh.quad(
          [x, y + 0.05, z],
          [x2, y2 + 0.05, z2],
          [x2, y2 + 2.4, z2],
          [x, y + 2.4, z],
          [-tz, 0, tx],
          [
            [0, 0],
            [3, 0],
            [3, 2.4],
            [0, 2.4],
          ],
        );
        for (const k of [2.6, 2.8, 3.0])
          wire.box(
            Math.min(x, x2) - 0.012,
            (y + y2) / 2 + k - 0.012,
            Math.min(z, z2) - 0.012,
            Math.max(x, x2) + 0.012,
            (y + y2) / 2 + k + 0.012,
            Math.max(z, z2) + 0.012,
          );
        posts.box(x - 0.03, y + 2.6, z - 0.03, x + 0.03, y + 3.05, z + 0.03);
        // snow caught on the mesh's foot
        posts
          .color(0xf4f7fa)
          .box(
            Math.min(x, x2) - 0.25,
            y - 0.1,
            Math.min(z, z2) - 0.25,
            Math.max(x, x2) + 0.25,
            y + 0.35,
            Math.max(z, z2) + 0.25,
          );
        posts.color(0x5d6268);
        if (++n % 20 === 7)
          this.signBoard(
            "PRIVATE PROPERTY\nNO TRESPASSING",
            x + tz * 0.2 + tx * 1.5,
            z - tx * 0.2 + tz * 1.5,
            Math.atan2(-tz, tx) + Math.PI,
            1.2,
            0.7,
            1.2,
            "#e9e6dc",
            "#8b2a22",
          );
      }
    }
    if (!posts.empty) this.add(posts.build(), this.lambert());
    if (!wire.empty) this.add(wire.build(), this.lambert(), "none");
    if (!mesh.empty) {
      const m = this.keep(
        new MeshLambertMaterial({ map: chain, transparent: true, alphaTest: 0.35, side: DoubleSide }),
      );
      this.add(mesh.build(), m, "cast");
    }
  }

  // ── the tower, the statue, the bench, the road's end ──
  private landmarks() {
    if (this.near(TOWER.x, TOWER.z, 60)) {
      const { x: tx, z: tz } = TOWER;
      const y = terrainAt(tx, tz);
      const tower: BufferGeometry[] = [];
      tower.push(place(tinted(new CylinderGeometry(1.7, 2.1, 24, 18).translate(0, 12, 0), 0xdadde0), tx, y, tz));
      tower.push(place(tinted(new CylinderGeometry(4.2, 1.7, 4, 18).translate(0, 26, 0), 0xcfd3d7), tx, y, tz));
      tower.push(
        place(tinted(new SphereGeometry(7.4, 24, 16).scale(1, 0.72, 1).translate(0, 30.5, 0), 0xe6e8ea), tx, y, tz),
      );
      tower.push(
        place(
          tinted(
            new SphereGeometry(7.5, 24, 8, 0, Math.PI * 2, 0, Math.PI / 5).scale(1, 0.72, 1).translate(0, 30.6, 0),
            0xf6f8fa,
          ),
          tx,
          y,
          tz,
        ),
      );
      tower.push(place(tinted(new CylinderGeometry(7.6, 7.6, 0.5, 24).translate(0, 29.4, 0), 0xb9bec4), tx, y, tz));
      tower.push(place(tinted(new CylinderGeometry(0.5, 0.5, 2.2, 8).translate(0, 36.5, 0), 0xb9bec4), tx, y, tz));
      this.add(mergeGeometries(tower, false), this.lambert());
      for (const t of tower) t.dispose();
      const beacon = this.glows(
        this.keep(new MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false, transparent: true, opacity: 0 })),
        1,
        "lamp",
      );
      const bm = new Mesh(this.keep(new SphereGeometry(0.55, 10, 8)), beacon);
      bm.position.set(tx, y + 37.8, tz);
      this.root.add(bm);
      this.glowCards.push({ x: tx, y: y + 37.8, z: tz, s: 5, c: 0xff3a2a });
      // its fence
      const f = new G().color(0x5d6268);
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 18)
        f.box(
          tx + Math.cos(a) * 9 - 0.05,
          y,
          tz + Math.sin(a) * 9 - 0.05,
          tx + Math.cos(a) * 9 + 0.05,
          y + 1.8,
          tz + Math.sin(a) * 9 + 0.05,
        );
      this.add(f.build(), this.lambert());
    }
    if (this.near(STATUE.x, STATUE.z, 40)) {
      // the plaza, the pedestal, the founder pointing the way, snow on him
      const y = groundAt(STATUE.x, STATUE.z);
      const p = new G();
      p.color(0xbcb8b0).quad(
        [PLAZA.x0, y + 0.06, PLAZA.z0],
        [PLAZA.x1, y + 0.06, PLAZA.z0],
        [PLAZA.x1, y + 0.06, PLAZA.z1],
        [PLAZA.x0, y + 0.06, PLAZA.z1],
        [0, 1, 0],
      );
      p.color(0x8f8b83).box(STATUE.x - 2.4, y, STATUE.z - 2.4, STATUE.x + 2.4, y + 0.5, STATUE.z + 2.4);
      p.color(0x9d988f).box(STATUE.x - 1.4, y + 0.5, STATUE.z - 1.4, STATUE.x + 1.4, y + 3.2, STATUE.z + 1.4);
      p.color(0xf4f7fa).box(STATUE.x - 1.5, y + 3.2, STATUE.z - 1.5, STATUE.x + 1.5, y + 3.4, STATUE.z + 1.5);
      this.add(p.build(), this.lambert(), "both");
      const bronze = 0x3e3a33;
      const fig: BufferGeometry[] = [
        tinted(new CylinderGeometry(0.45, 0.75, 2.4, 10).translate(0, 1.2, 0), bronze), // the long coat
        tinted(new CylinderGeometry(0.42, 0.45, 0.9, 10).translate(0, 2.8, 0), bronze),
        tinted(new SphereGeometry(0.34, 12, 10).translate(0, 3.55, 0), bronze),
        tinted(new CylinderGeometry(0.11, 0.13, 1.4, 6).rotateZ(-1.2).translate(0.75, 3.25, 0), bronze), // the arm, pointing
        tinted(new CylinderGeometry(0.11, 0.13, 1.1, 6).rotateZ(0.25).translate(-0.5, 2.3, 0), bronze),
        tinted(new SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3).translate(0, 3.62, 0), 0xf4f7fa), // snow on his head
        tinted(new CylinderGeometry(0.44, 0.46, 0.08, 10).translate(0, 3.26, 0), 0xf4f7fa), // and shoulders
      ];
      this.add(place(mergeGeometries(fig, false), STATUE.x, y + 3.4, STATUE.z, -Math.PI / 2, 1.05), this.lambert());
      for (const f of fig) f.dispose();
    }
    if (this.near(BENCH.x, BENCH.z, 20)) {
      const y = groundAt(BENCH.x, BENCH.z);
      const b = new G();
      b.color(0x5a4636);
      for (const dz of [0, 0.22, 0.44])
        b.box(BENCH.x - 1, y + 0.45, BENCH.z + dz, BENCH.x + 1, y + 0.52, BENCH.z + dz + 0.16);
      for (const dy of [0.7, 0.9])
        b.box(BENCH.x - 1, y + dy, BENCH.z - 0.06, BENCH.x + 1, y + dy + 0.12, BENCH.z + 0.04);
      b.color(0x2a2e33);
      for (const dx of [-0.85, 0.85])
        b.box(BENCH.x + dx - 0.05, y, BENCH.z - 0.05, BENCH.x + dx + 0.05, y + 1.0, BENCH.z + 0.6);
      b.color(0xf4f7fa).box(BENCH.x - 1, y + 0.52, BENCH.z, BENCH.x + 1, y + 0.62, BENCH.z + 0.6);
      this.add(b.build(), this.lambert());
    }
    if (this.near(ROAD_CLOSED.x, ROAD_CLOSED.z, 30)) {
      const y = groundAt(ROAD_CLOSED.x, ROAD_CLOSED.z);
      const g = new G();
      for (let k = 0; k < 6; k++)
        g.color(k % 2 ? 0xf2f2f2 : 0xc8322a).box(
          ROAD_CLOSED.x - 0.15,
          y + 0.9,
          ROAD_CLOSED.z - 5 + k * 1.7,
          ROAD_CLOSED.x + 0.15,
          y + 1.2,
          ROAD_CLOSED.z - 3.3 + k * 1.7,
        );
      for (const dz of [-4.8, 4.8])
        g.color(0x3a3e44).box(
          ROAD_CLOSED.x - 0.08,
          y,
          ROAD_CLOSED.z + dz - 0.08,
          ROAD_CLOSED.x + 0.08,
          y + 1.2,
          ROAD_CLOSED.z + dz + 0.08,
        );
      this.add(g.build(), this.lambert());
      const drift = tinted(new SphereGeometry(1, 12, 7).scale(4, 1.8, 7), 0xf4f7fa);
      this.add(place(drift, ROAD_CLOSED.x + 5, y - 0.3, ROAD_CLOSED.z), this.lambert());
      this.signBoard(
        "ROAD CLOSED",
        ROAD_CLOSED.x - 0.6,
        ROAD_CLOSED.z,
        Math.PI / 2,
        2.4,
        0.7,
        1.3,
        "#f2f2ee",
        "#a5281c",
      );
    }
  }

  // ── the town: parked cars along Main Street ──
  private town() {
    if (!this.near(420, -405, 160)) return;
    const solids: BufferGeometry[] = [];
    const glass: BufferGeometry[] = [];
    for (const c of TOWN_CARS) {
      const { solid, glass: gl } = carGeometry(c.wagon, CAR_COLOURS[c.colour], c.snowy);
      const y = groundAt(c.x, c.z);
      const ry = c.dir > 0 ? 0 : Math.PI;
      solids.push(place(solid, c.x, y + 0.03, c.z, ry + c.tilt));
      glass.push(place(gl, c.x, y + 0.03, c.z, ry));
    }
    if (solids.length) {
      this.add(mergeGeometries(solids, false), this.lambert());
      this.add(mergeGeometries(glass, false), this.lambert(0x9aa6ae), "cast");
    }
    for (const g of [...solids, ...glass]) g.dispose();
  }

  // ── far ridges and mountains: the one painted thing (beyond everything you can reach) ──
  readonly ridgeMat = new MeshBasicMaterial({ vertexColors: true, fog: false });
  private ridges() {
    this.keep(this.ridgeMat);
    const g = new G();
    const cx = (GROUNDS.x0 + GROUNDS.x1) / 2;
    const cz = (GROUNDS.z0 + GROUNDS.z1) / 2;
    const r = groundsRng(1717);
    for (const [R, hMin, hMax, shade] of [
      [1500, 90, 220, 0.62],
      [1150, 50, 130, 0.78],
    ] as const) {
      const n = 220;
      let h0: number = hMin;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        const h1 = Math.max(hMin, Math.min(hMax, h0 + (r() - 0.5) * (hMax - hMin) * 0.45));
        const P = (a: number, y: number): V => [cx + Math.cos(a) * R, y, cz + Math.sin(a) * R];
        g.color(new Color(shade, shade, shade + 0.04).getHex());
        g.quad(P(a0, -20), P(a1, -20), P(a1, h1), P(a0, h0), [-Math.cos(a0), 0, -Math.sin(a0)]);
        h0 = h1;
      }
    }
    const m = new Mesh(g.build(), this.ridgeMat);
    this.keep(m.geometry);
    m.renderOrder = -1;
    this.root.add(m);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.root.removeFromParent();
  }
}

/** The distance from (x, z) to a way's line (its samples). */
function nearLine(w: Way, x: number, z: number): number {
  // (a quick "nowhere near": its box)
  const b = (boxes.get(w) ?? boxOf(w)) as { x0: number; x1: number; z0: number; z1: number };
  if (x < b.x0 - 12 || x > b.x1 + 12 || z < b.z0 - 12 || z > b.z1 + 12) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < w.line.length; i += 2) {
    const d = Math.hypot(w.line[i][0] - x, w.line[i][1] - z);
    if (d < best) best = d;
  }
  return best;
}
const boxes = new Map<Way, { x0: number; x1: number; z0: number; z1: number }>();
function boxOf(w: Way) {
  const xs = w.line.map((p) => p[0]);
  const zs = w.line.map((p) => p[1]);
  const b = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  boxes.set(w, b);
  return b;
}
export type { P };
