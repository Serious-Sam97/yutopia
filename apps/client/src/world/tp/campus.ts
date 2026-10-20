import {
  edgeKey,
  entranceZOf,
  hWall,
  isFloor,
  isWindow,
  isWindowKind,
  type MapDef,
  tileAt,
  vWall,
  type WallCut,
} from "@yutopia/shared";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MultiplyBlending,
  Plane,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Daylight } from "../art/daylight";
import type { Themes } from "./sky";

// The snow theme's outside, in 3D: the studio is the top floor of a corporate
// headquarters alone in the snow (docs/plan/18-snow-campus.md). The main block
// carries the studio's floor on four storeys of mirrored curtain wall; across a
// courtyard stand two more blocks of the same glass, joined to it by a glazed
// bridge. West of it a ploughed parking lot with 80s sedans under snow and
// lamp posts; one driveway curves away to the horizon; a water tower on the
// lawn; a line of conifers all round; snow falling wherever the camera is.
//
// Units are tiles, y up, the studio's floor at y = 0 (map y → z).

export const GROUND = -14; // four storeys down
const STOREY = 3.5;
const WALL = 128 / 39.19; // the studio's walls (WALL_H iso px, as tiles)
const PARAPET = 3.9;
const SKIN = 0.12; // the facade stands this far outside the floor's edge
const BAY = 4; // one curtain-wall bay (tiles)
const WIN0 = 36 / 39.19; // the studio's windows, bottom and top (iso px → tiles)
const WIN1 = 88 / 39.19;

// ── geometry builder: non-indexed triangles with position, normal, uv, colour ─
class G {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  private rgb = [1, 1, 1];
  color(hex: number) {
    const c = new Color(hex);
    this.rgb = [c.r, c.g, c.b];
    return this;
  }
  // a, b, c, d around the quad; wound to face `n`; uvs per corner
  quad(
    a: V,
    b: V,
    c: V,
    d: V,
    n: V,
    uv: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  ) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const ok = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0;
    const order = ok ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    const P = [a, b, c, d];
    for (const i of order) {
      this.pos.push(P[i][0], P[i][1], P[i][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.col.push(this.rgb[0], this.rgb[1], this.rgb[2]);
    }
  }
  // an axis-aligned box (all six faces), uvs by face size
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]);
  }
  get empty() {
    return this.pos.length === 0;
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new Float32BufferAttribute(this.col, 3));
    return g;
  }
}
type V = [number, number, number];

// three's own geometries, coloured and merged (non-indexed, with colours)
function tinted(g: BufferGeometry, hex: number): BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (g.index) g.dispose();
  const c = new Color(hex);
  const count = n.getAttribute("position").count;
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  n.setAttribute("color", new Float32BufferAttribute(col, 3));
  return n;
}
const place = (g: BufferGeometry, x: number, y: number, z: number, ry = 0, s = 1) => {
  const m = new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ry),
    new Vector3(s, s, s),
  );
  return g.applyMatrix4(m);
};

// ── the footprint's outer edges, as runs with their outward side ─────────────
interface Run {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  nx: number;
  nz: number;
}
function runs(f: (x: number, z: number) => boolean, x0: number, z0: number, x1: number, z1: number): Run[] {
  const out: Run[] = [];
  // the edge on line z faces north (nz = -1) where row z is floor and row z-1
  // isn't, south where row z-1 is floor and row z isn't; merged along x
  for (let z = z0; z <= z1; z++)
    for (const nz of [-1, 1]) {
      const tz = nz < 0 ? z : z - 1;
      let start = -1;
      for (let x = x0; x <= x1; x++) {
        const inside = x < x1 && f(x, tz) && !f(x, tz + nz);
        if (inside && start < 0) start = x;
        if (!inside && start >= 0) {
          out.push({ x0: start, z0: z, x1: x, z1: z, nx: 0, nz });
          start = -1;
        }
      }
    }
  for (let x = x0; x <= x1; x++)
    for (const nx of [-1, 1]) {
      const tx = nx < 0 ? x : x - 1;
      let start = -1;
      for (let z = z0; z <= z1; z++) {
        const inside = z < z1 && f(tx, z) && !f(tx + nx, z);
        if (inside && start < 0) start = z;
        if (!inside && start >= 0) {
          out.push({ x0: x, z0: start, x1: x, z1: z, nx, nz: 0 });
          start = -1;
        }
      }
    }
  return out;
}
const runLen = (r: Run) => Math.abs(r.x1 - r.x0) + Math.abs(r.z1 - r.z0);

// ── textures ─────────────────────────────────────────────────────────────────
// The curtain wall: 4 bays × 4 storeys. Each storey: a concrete spandrel with
// snow on its ledge, then mirrored glass in a grid of mullions. The lit offices
// (night) are a second canvas, the emissive map.
function facadeCanvases(T: Themes) {
  const PX = 64; // px per tile
  const W = BAY * 4 * PX;
  const H = STOREY * 4 * PX;
  const body = T.canvas(W, H);
  const lit = T.canvas(W, H);
  const g = body.g;
  const r = T.rng(71);
  const SP = 0.875 * PX; // spandrel height
  lit.g.fillStyle = "#000";
  lit.g.fillRect(0, 0, W, H);
  for (let s = 0; s < 4; s++) {
    const y0 = s * STOREY * PX;
    // spandrel
    g.fillStyle = "#d8d4cb";
    g.fillRect(0, y0, W, SP);
    g.fillStyle = "#b6b1a7";
    g.fillRect(0, y0 + SP - 6, W, 6);
    g.fillStyle = "#c9c5bb";
    g.fillRect(0, y0 + SP - 14, W, 2);
    // snow on the ledge, a ragged line
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(0, y0);
    for (let x = 0; x <= W; x += 6) g.lineTo(x, y0 + 7 + r() * 6);
    g.lineTo(W, y0);
    g.fill();
    // glass: the sky reflected, lighter at the top of each pane
    const gy = y0 + SP;
    const gh = STOREY * PX - SP;
    const grd = g.createLinearGradient(0, gy, 0, gy + gh);
    grd.addColorStop(0, "#73848f");
    grd.addColorStop(0.35, "#46545e");
    grd.addColorStop(1, "#242d35");
    g.fillStyle = grd;
    g.fillRect(0, gy, W, gh);
    // a faint band of brighter reflection across the panes
    g.fillStyle = "rgba(190,205,215,0.10)";
    g.fillRect(0, gy + gh * 0.18, W, gh * 0.12);
    // transom
    g.fillStyle = "#1b2127";
    g.fillRect(0, gy + gh * 0.38, W, 4);
    // mullions: a heavy one per bay, a light one in the middle
    for (let b = 0; b < 4; b++) {
      g.fillStyle = "#171c21";
      g.fillRect(b * BAY * PX - 4, gy, 8, gh);
      g.fillStyle = "#1f262c";
      g.fillRect(b * BAY * PX + (BAY * PX) / 2 - 2, gy, 4, gh);
      // lit offices at night: some half-bays, cold white, a few warm
      for (const half of [0, 1]) {
        if (r() > 0.2) continue;
        const x = b * BAY * PX + half * ((BAY * PX) / 2) + 6;
        const warm = r() < 0.25;
        lit.g.fillStyle = warm ? "#a9956a" : "#8fa3b6";
        lit.g.fillRect(x, gy + 6, (BAY * PX) / 2 - 12, gh - 10);
        lit.g.fillStyle = "rgba(0,0,0,0.25)";
        lit.g.fillRect(x, gy + gh * 0.38 - 2, (BAY * PX) / 2 - 12, 8); // the transom shadow
      }
    }
    g.fillStyle = "#171c21";
    g.fillRect(W - 4, gy, 4, gh);
  }
  const tex = (c: HTMLCanvasElement) => {
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  return { map: tex(body.c), lit: tex(lit.c) };
}

// Snow: a soft tileable field with drifts and blue hollows.
function snowCanvas(T: Themes, size = 512, seed = 41): HTMLCanvasElement {
  const { c, g } = T.canvas(size, size);
  g.fillStyle = "#f2f4f7";
  g.fillRect(0, 0, size, size);
  const r = T.rng(seed);
  for (let i = 0; i < 90; i++) {
    const x = r() * size;
    const y = r() * size;
    const w = 30 + r() * 120;
    const blue = r() < 0.7;
    // drawn at every offset so the tile wraps (the gradient centred on each copy)
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, w);
        grd.addColorStop(0, blue ? "rgba(188,205,224,0.42)" : "rgba(255,255,255,0.6)");
        grd.addColorStop(1, "rgba(188,205,224,0)");
        g.fillStyle = grd;
        g.beginPath();
        g.ellipse(x + ox, y + oy, w, w * 0.45, 0, 0, Math.PI * 2);
        g.fill();
      }
  }
  return c;
}

// The parking lot, drawn in plan: ploughed asphalt, painted bays, islands,
// tyre tracks, the slush where cars turn. `px` per tile.
interface Lot {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  cols: { x: number; dir: 1 | -1 }[]; // bay columns: x of the bay's aisle side, nose direction (-dir)
  aisles: number[]; // centre x of each aisle
  bayW: number;
  bayL: number;
  bays: { x: number; z: number; dir: 1 | -1 }[];
}
function lotCanvas(T: Themes, lot: Lot, px: number): HTMLCanvasElement {
  const W = Math.round((lot.x1 - lot.x0) * px);
  const H = Math.round((lot.z1 - lot.z0) * px);
  const { c, g } = T.canvas(W, H);
  const r = T.rng(97);
  const X = (x: number) => (x - lot.x0) * px;
  const Z = (z: number) => (z - lot.z0) * px;
  g.fillStyle = "#3a3d42";
  g.fillRect(0, 0, W, H);
  // wet patches and slush streaks
  for (let i = 0; i < 60; i++) {
    const x = r() * W;
    const y = r() * H;
    const w = 20 + r() * 80;
    const grd = g.createRadialGradient(x, y, 0, x, y, w);
    grd.addColorStop(0, r() < 0.5 ? "rgba(90,96,104,0.5)" : "rgba(20,22,26,0.4)");
    grd.addColorStop(1, "rgba(60,64,70,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, w, w * 0.4, 0, 0, Math.PI * 2);
    g.fill();
  }
  // snow left in the bays' corners and along the edges
  g.fillStyle = "rgba(240,243,247,0.55)";
  for (let i = 0; i < 160; i++) {
    const x = r() * W;
    const y = r() * H;
    g.beginPath();
    g.ellipse(x, y, 3 + r() * 10, 2 + r() * 5, 0, 0, Math.PI * 2);
    g.fill();
  }
  // tyre tracks down the aisles (dark, two lines)
  g.strokeStyle = "rgba(15,17,20,0.55)";
  g.lineWidth = px * 0.3;
  for (const aisle of lot.aisles) {
    const ax = X(aisle);
    for (const off of [-0.9, 0.9]) {
      g.beginPath();
      g.moveTo(ax + off * px, 0);
      for (let y = 0; y <= H; y += 24) g.lineTo(ax + off * px + Math.sin(y / 90) * px * 0.3, y);
      g.stroke();
    }
  }
  // the painted bays
  g.strokeStyle = "rgba(235,238,240,0.85)";
  g.lineWidth = Math.max(1.5, px * 0.12);
  for (const col of lot.cols) {
    const xa = X(col.x);
    const xb = X(col.x - col.dir * lot.bayL);
    for (let z = lot.z0 + 3; z + lot.bayW <= lot.z1 - 3; z += lot.bayW) {
      g.beginPath();
      g.moveTo(xa, Z(z));
      g.lineTo(xb, Z(z));
      g.stroke();
    }
    // the end line of the row
    g.beginPath();
    g.moveTo(xb, Z(lot.z0 + 3));
    g.lineTo(xb, Z(lot.z1 - 3));
    g.stroke();
  }
  // a kerb all round
  g.strokeStyle = "#8d9299";
  g.lineWidth = px * 0.25;
  g.strokeRect(px * 0.2, px * 0.2, W - px * 0.4, H - px * 0.4);
  return c;
}

// A tileable strip of road: asphalt with two tyre tracks and snow at the
// verges (u across, v along).
function roadCanvas(T: Themes): HTMLCanvasElement {
  const W = 128;
  const H = 512;
  const { c, g } = T.canvas(W, H);
  const r = T.rng(23);
  g.fillStyle = "#454950";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#f0f3f6";
  g.fillRect(0, 0, 14, H);
  g.fillRect(W - 14, 0, 14, H);
  g.fillStyle = "rgba(240,243,246,0.5)";
  for (let i = 0; i < 70; i++) {
    const y = r() * H;
    const w = 6 + r() * 14;
    g.beginPath();
    g.ellipse(r() < 0.5 ? 10 + r() * 12 : W - 10 - r() * 12, y, w * 0.6, 3 + r() * 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "rgba(18,20,24,0.6)";
  g.lineWidth = 7;
  for (const x of [38, 90]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  // a centre line, faded under slush
  g.fillStyle = "rgba(230,220,160,0.35)";
  for (let y = 0; y < H; y += 48) g.fillRect(W / 2 - 1.5, y, 3, 26);
  return c;
}

function lettersCanvas(T: Themes, text: string): HTMLCanvasElement {
  const { c, g } = T.canvas(1024, 160);
  g.fillStyle = "#f6eedb";
  g.font = "500 118px Georgia, 'Times New Roman', serif";
  g.textBaseline = "middle";
  const gap = 22;
  const widths = [...text].map((ch) => g.measureText(ch).width);
  let x = 512 - (widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1)) / 2;
  [...text].forEach((ch, i) => {
    g.fillText(ch, x, 86);
    x += widths[i] + gap;
  });
  return c;
}

function poolCanvas(T: Themes): HTMLCanvasElement {
  const { c, g } = T.canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(225,238,255,0.6)");
  grd.addColorStop(0.45, "rgba(200,220,245,0.22)");
  grd.addColorStop(1, "rgba(200,220,245,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return c;
}

// ── the ground's shape: gentle rolls and drifts, flat where things stand ──────
const smooth01 = (t: number) => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};
interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
class Terrain {
  constructor(
    private flats: Rect[],
    private cx: number,
    private cz: number,
    private radius: number,
  ) {}
  at(x: number, z: number): number {
    const h =
      0.55 * Math.sin(x * 0.041 + 1.3) * Math.cos(z * 0.037 - 0.7) +
      0.22 * Math.sin(x * 0.13 + z * 0.09) * Math.cos(x * 0.07 - z * 0.15 + 2.1) +
      0.09 * Math.sin(x * 0.31 - z * 0.27);
    let m = smooth01((this.radius - Math.hypot(x - this.cx, z - this.cz)) / 25);
    for (const f of this.flats) {
      const dx = Math.max(0, f.x0 - x, x - f.x1);
      const dz = Math.max(0, f.z0 - z, z - f.z1);
      m = Math.min(m, smooth01(Math.hypot(dx, dz) / 7));
    }
    return h * m;
  }
}

// Soft shadows multiplied onto the ground: a radial one (under cars, posts,
// trees) and a band (the foot of every wall).
function shadowCanvases(T: Themes) {
  const blob = T.canvas(128, 128);
  const g1 = blob.g.createRadialGradient(64, 64, 0, 64, 64, 64);
  g1.addColorStop(0, "#8c9096");
  g1.addColorStop(0.55, "#d4d7db");
  g1.addColorStop(1, "#ffffff");
  blob.g.fillStyle = g1;
  blob.g.fillRect(0, 0, 128, 128);
  const band = T.canvas(4, 128);
  const g2 = band.g.createLinearGradient(0, 0, 0, 128);
  g2.addColorStop(0, "#9ea3a9");
  g2.addColorStop(0.5, "#dfe2e5");
  g2.addColorStop(1, "#ffffff");
  band.g.fillStyle = g2;
  band.g.fillRect(0, 0, 4, 128);
  return { blob: blob.c, band: band.c };
}

// Trodden snow by the entrance: slush and footprints, over the clean snow.
function slushCanvas(T: Themes): HTMLCanvasElement {
  const W = 512;
  const H = 256;
  const { c, g } = T.canvas(W, H);
  const r = T.rng(59);
  for (let i = 0; i < 90; i++) {
    const x = r() * W;
    const y = r() * H;
    if (Math.abs(y - H / 2) < H * 0.17) continue; // the path itself is cleared
    const w = 8 + r() * 36;
    const grd = g.createRadialGradient(x, y, 0, x, y, w);
    grd.addColorStop(0, `rgba(150,166,184,${0.25 + r() * 0.35})`);
    grd.addColorStop(1, "rgba(150,166,184,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, w, w * 0.5, 0, 0, Math.PI * 2);
    g.fill();
  }
  // footprints wandering off the path
  g.fillStyle = "rgba(120,136,156,0.55)";
  for (let t = 0; t < 6; t++) {
    let x = W * (0.2 + r() * 0.6);
    let y = H / 2 + (r() < 0.5 ? -1 : 1) * H * 0.18;
    const dy = y < H / 2 ? -1 : 1;
    const a = (r() - 0.5) * 1.2;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse(x + (i % 2 ? 4 : -4), y, 2.2, 3.6, a, 0, Math.PI * 2);
      g.fill();
      x += Math.sin(a) * 9;
      y += dy * 9 * Math.cos(a);
    }
  }
  return c;
}

// A bare winter tree in 3D: a trunk forking into branches, each a thin cone.
function bareTree3(r: () => number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const up = new Vector3(0, 1, 0);
  const branch = (p: Vector3, dir: Vector3, len: number, rad: number, depth: number) => {
    const g = new CylinderGeometry(rad * 0.62, rad, len, 5, 1, true).translate(0, len / 2, 0);
    const q = new Quaternion().setFromUnitVectors(up, dir);
    g.applyQuaternion(q);
    g.translate(p.x, p.y, p.z);
    parts.push(g);
    if (depth <= 0 || len < 0.3) return;
    const end = p.clone().add(dir.clone().multiplyScalar(len));
    const n = 2 + (r() < 0.45 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const d = dir
        .clone()
        .add(new Vector3((r() - 0.5) * 1.3, 0.25 + r() * 0.3, (r() - 0.5) * 1.3))
        .normalize();
      branch(end, d, len * (0.6 + r() * 0.14), rad * 0.62, depth - 1);
    }
  };
  branch(new Vector3(0, 0, 0), new Vector3((r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12).normalize(), 2.4, 0.2, 5);
  const merged = tinted(mergeGeometries(parts, false), 0x4a525c);
  for (const g of parts) g.dispose();
  return merged;
}

// A snow-laden conifer: tiers of dark cones, each with snow on its shoulders.
function coniferGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const base = new Color(0x24302b);
  const tip = new Color(0x3d4f46);
  const tiers: [number, number, number][] = [
    [2.5, 3.8, 2.5],
    [2.0, 3.6, 4.9],
    [1.5, 3.2, 7.1],
    [0.95, 2.9, 9.1],
  ];
  for (const [rad, h, y] of tiers) {
    const g = new ConeGeometry(rad, h, 8).translate(0, y, 0).toNonIndexed();
    const pos = g.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const k = (pos.getY(i) - (y - h / 2)) / h;
      const c = base.clone().lerp(tip, k * 0.7);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new Float32BufferAttribute(col, 3));
    parts.push(g);
    const sh = h * 0.42;
    parts.push(tinted(new ConeGeometry(rad * 0.8, sh, 8).translate(0, y + h / 2 - sh / 2 + 0.03, 0), 0xe9eef1));
  }
  parts.push(tinted(new CylinderGeometry(0.18, 0.3, 1.4, 6).translate(0, 0.7, 0), 0x3a2e26));
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

// The light thrown ahead of a car's headlights, on the snow.
function beamCanvas(T: Themes): HTMLCanvasElement {
  const { c, g } = T.canvas(128, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "rgba(255,246,220,0.9)");
  grd.addColorStop(0.5, "rgba(255,246,220,0.35)");
  grd.addColorStop(1, "rgba(255,246,220,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(44, 0);
  g.lineTo(84, 0);
  g.lineTo(128, 256);
  g.lineTo(0, 256);
  g.closePath();
  g.fill();
  return c;
}

// ── cars: an 80s sedan or wagon from its side profile ────────────────────────
const CAR_W = 2.1;
const CAR_L = 5;
// the body up to the beltline, then the greenhouse on top of it
function lowerProfile(): Shape {
  const s = new Shape();
  s.moveTo(0, 0.42);
  s.lineTo(0, 0.8);
  s.lineTo(0.2, 0.9);
  s.lineTo(1.8, 0.99);
  s.lineTo(4.3, 1.0);
  s.lineTo(4.9, 0.96);
  s.lineTo(5, 0.8);
  s.lineTo(5, 0.42);
  s.closePath();
  return s;
}
function cabinProfile(wagon: boolean, o = 0): Shape {
  const s = new Shape();
  s.moveTo(2.2, 0.97 - o);
  s.lineTo(2.33 - o, 1.49 + o);
  if (wagon) {
    s.lineTo(4.72 + o, 1.51 + o);
    s.lineTo(4.97 + o, 1.04);
  } else {
    s.lineTo(3.56 + o, 1.51 + o);
    s.lineTo(4.27 + o, 1.0 - o);
  }
  s.lineTo(4.3, 0.97 - o);
  s.closePath();
  return s;
}
const CHROME = 0xcdd1d5;
const GLASS = 0x1a2228;
function carGeometry(wagon: boolean, body: number, snowy = true): { solid: BufferGeometry; glass: BufferGeometry } {
  const parts: BufferGeometry[] = [];
  const glassParts: BufferGeometry[] = [];
  const ext = (sh: Shape, w: number, bevel: number) =>
    new ExtrudeGeometry(sh, {
      depth: w - bevel * 2,
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 2,
    }).translate(0, 0, -w / 2 + bevel);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number, into = parts) =>
    into.push(tinted(new BoxGeometry(w, h, d).translate(x, y, z), hex));
  parts.push(tinted(ext(lowerProfile(), CAR_W, 0.06), body));
  parts.push(tinted(ext(cabinProfile(wagon), CAR_W - 0.16, 0.04), body));
  // glass: the windscreen and rear window are the cabin's own slanted faces, a
  // hair outside it; the side windows are panes on the cabin's flanks, with
  // the pillars left between them
  glassParts.push(tinted(ext(cabinProfile(wagon, 0.02), CAR_W - 0.3, 0), GLASS));
  const panes: [number, number][] = wagon
    ? [
        [2.5, 3.0],
        [3.1, 3.72],
        [3.82, 4.5],
      ]
    : [
        [2.5, 3.0],
        [3.1, 3.55],
      ];
  for (const [x0, x1] of panes)
    for (const side of [-1, 1])
      box(x1 - x0, 0.34, 0.03, (x0 + x1) / 2, 1.24, side * (CAR_W / 2 - 0.08 + 0.01), GLASS, glassParts);
  // trim: a chrome strip along the beltline, bumpers with their rubber, grille, plates, handles, mirrors
  box(4.6, 0.025, CAR_W + 0.02, 2.5, 0.985, 0, CHROME);
  for (const x of [-0.06, 5.06]) {
    box(0.14, 0.14, CAR_W + 0.06, x, 0.56, 0, CHROME);
    box(0.17, 0.05, CAR_W + 0.08, x, 0.56, 0, 0x16181b);
  }
  box(0.03, 0.17, 0.9, -0.005, 0.7, 0, 0x23262a);
  for (const side of [-1, 1]) {
    box(0.03, 0.18, 0.42, -0.02, 0.7, side * 0.66, 0xf3ecc4);
    box(0.03, 0.14, 0.5, 5.02, 0.68, side * 0.62, 0xb0241f);
    box(0.14, 0.03, 0.02, 3.0, 0.86, side * (CAR_W / 2 + 0.005), CHROME);
    if (!wagon) box(0.14, 0.03, 0.02, 3.9, 0.86, side * (CAR_W / 2 + 0.005), CHROME);
    box(0.12, 0.09, 0.16, 2.34, 1.1, side * (CAR_W / 2 + 0.1), body);
    box(0.03, 0.03, 0.1, 2.34, 1.05, side * (CAR_W / 2 + 0.03), 0x23262a);
  }
  box(0.02, 0.12, 0.34, -0.085, 0.46, 0, 0xf0ead6);
  box(0.02, 0.12, 0.34, 5.085, 0.46, 0, 0xf0ead6);
  // wheels: tyre, hubcap, a dark well behind
  for (const x of [0.95, 4.05])
    for (const side of [-1, 1]) {
      const z = side * (CAR_W / 2 - 0.13);
      parts.push(
        tinted(new CylinderGeometry(0.36, 0.36, 0.26, 16).rotateX(Math.PI / 2).translate(x, 0.36, z), 0x1b1d20),
      );
      parts.push(
        tinted(
          new CylinderGeometry(0.2, 0.2, 0.29, 12).rotateX(Math.PI / 2).translate(x, 0.36, z + side * 0.01),
          0xc3c6ca,
        ),
      );
      parts.push(
        tinted(
          new CylinderGeometry(0.07, 0.07, 0.31, 8).rotateX(Math.PI / 2).translate(x, 0.36, z + side * 0.01),
          0x6e7378,
        ),
      );
    }
  if (snowy) {
    // snow on the roof, the hood, the trunk and the foot of the windscreen
    const roofL = wagon ? 2.3 : 1.15;
    const roofX = wagon ? 3.5 : 2.95;
    box(roofL, 0.1, CAR_W - 0.4, roofX, 1.56, 0, 0xffffff);
    box(1.25, 0.07, CAR_W - 0.5, 1.05, 0.99, 0, 0xffffff);
    box(0.3, 0.06, CAR_W - 0.6, 2.28, 1.03, 0, 0xffffff);
    if (!wagon) box(0.5, 0.06, CAR_W - 0.5, 4.6, 1.0, 0, 0xffffff);
  }
  const solid = mergeGeometries(parts, false);
  const glass = mergeGeometries(glassParts, false);
  for (const g of [...parts, ...glassParts]) g.dispose();
  solid.translate(-CAR_L / 2, 0, 0);
  glass.translate(-CAR_L / 2, 0, 0);
  return { solid, glass };
}

const CAR_COLOURS = [0xcbbd98, 0x6b2430, 0x4a5a73, 0xe8e6df, 0x1f2124, 0x6a4a35, 0x8b8f93, 0x2f4a3b, 0xb8702a];

// A box of snowflakes that wraps round the camera: each flake keeps a position
// in the box; where it shows is that position folded round the camera. Flakes
// that would show over the studio's footprint go under the ground instead.
class Flakes {
  readonly points: Points;
  readonly material: PointsMaterial;
  private geo: BufferGeometry;
  private at: Float32Array;
  constructor(
    private box: Vector3,
    count: number,
    size: number,
    opacity: number,
    map: CanvasTexture,
    r: () => number,
  ) {
    this.at = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.at[i * 3] = r() * box.x;
      this.at[i * 3 + 1] = r() * box.y;
      this.at[i * 3 + 2] = r() * box.z;
    }
    this.geo = new BufferGeometry();
    this.geo.setAttribute("position", new Float32BufferAttribute(new Float32Array(count * 3), 3));
    this.material = new PointsMaterial({ color: 0xffffff, size, map, transparent: true, opacity, depthWrite: false });
    this.points = new Points(this.geo, this.material);
    this.points.frustumCulled = false;
  }
  update(dt: number, cam: Vector3, animate: boolean, fx0: number, fz0: number, fx1: number, fz1: number) {
    const p = this.geo.getAttribute("position");
    const f = this.at;
    const B = this.box;
    const fold = (v: number, c: number, size: number) => c - size / 2 + ((((v - c) % size) + size) % size);
    for (let i = 0; i < p.count; i++) {
      if (animate) {
        f[i * 3 + 1] -= dt * (0.8 + (i % 7) * 0.08);
        if (f[i * 3 + 1] < 0) f[i * 3 + 1] += B.y;
        f[i * 3] += Math.sin(f[i * 3 + 1] * 0.7 + i) * dt * 0.25;
      }
      let x = fold(f[i * 3], cam.x, B.x);
      let y = fold(f[i * 3 + 1], cam.y, B.y);
      const z = fold(f[i * 3 + 2], cam.z, B.z);
      if (y < GROUND) y += B.y;
      if (x > fx0 && x < fx1 && z > fz0 && z < fz1) {
        x = cam.x;
        y = GROUND - 200;
      }
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  }
  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}

// A car that comes down the driveway now and then, parks by the building for
// a while, and leaves: a polyline it follows at a speed by stretch, with its
// headlights on and a beam on the snow (bright after dark). Everyone sees the
// same car: where it is comes from the clock (a cycle of VISIT_S, its waits
// drawn from the cycle's number), not from anything one browser decided.
const VISIT_S = 420;
const BACK_UP = 6; // tiles it reverses out of the bay
const BACK_V = 1.4;
class Visitor {
  readonly root = new Group();
  private pts: { x: number; z: number; s: number; v: number }[] = [];
  private total = 0;
  // the drive in and the drive out as (time, distance along the route) samples
  private inTrack: number[] = [];
  private outTrack: number[] = [];
  private heading = 0;
  private shown = false;
  private lights: MeshBasicMaterial;
  private tail: MeshBasicMaterial;
  private beam: MeshBasicMaterial;
  private beamMesh: Mesh;
  constructor(
    route: { x: number; z: number; v: number }[], // from the horizon to the bay
    private bay: { x: number; z: number; ry: number },
    solid: BufferGeometry,
    glass: BufferGeometry,
    solidMat: MeshLambertMaterial,
    glassMat: MeshLambertMaterial,
    beamTex: CanvasTexture,
  ) {
    let acc = 0;
    for (let i = 0; i < route.length; i++) {
      if (i > 0) acc += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
      this.pts.push({ x: route[i].x, z: route[i].z, s: acc, v: route[i].v });
    }
    this.total = acc;
    const STEP = 0.05;
    for (let d = 0; d < this.total; d += STEP * this.at(d).v) this.inTrack.push(d);
    this.inTrack.push(this.total);
    for (let d = this.total; d > 0; d -= STEP * (d > this.total - BACK_UP ? BACK_V : this.at(d).v))
      this.outTrack.push(d);
    this.outTrack.push(0);
    this.root.add(new Mesh(solid, solidMat), new Mesh(glass, glassMat));
    this.lights = new MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0, toneMapped: false });
    this.tail = new MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, toneMapped: false });
    for (const side of [-1, 1]) {
      const h = new Mesh(new PlaneGeometry(0.42, 0.2), this.lights);
      h.position.set(-CAR_L / 2 - 0.04, 0.7, side * 0.66);
      h.rotation.y = -Math.PI / 2;
      const t = new Mesh(new PlaneGeometry(0.5, 0.14), this.tail);
      t.position.set(CAR_L / 2 + 0.04, 0.68, side * 0.62);
      t.rotation.y = Math.PI / 2;
      this.root.add(h, t);
    }
    this.beam = new MeshBasicMaterial({
      map: beamTex,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.beamMesh = new Mesh(new PlaneGeometry(5, 11).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), this.beam);
    this.beamMesh.position.set(-CAR_L / 2 - 5.6, 0.02, 0);
    this.root.add(this.beamMesh);
    this.park();
  }
  private park() {
    this.root.position.set(this.bay.x, GROUND + 0.02, this.bay.z);
    this.heading = this.bay.ry;
    this.root.rotation.y = this.heading;
  }
  private at(s: number) {
    const P = this.pts;
    let i = 1;
    while (i < P.length - 1 && P[i].s < s) i++;
    const a = P[i - 1];
    const b = P[i];
    const t = Math.max(0, Math.min(1, (s - a.s) / Math.max(1e-6, b.s - a.s)));
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: b.x - a.x, dz: b.z - a.z, v: b.v };
  }
  // the car's nose points along -x in its own frame: heading from a world direction
  // (eased; at once when it's just come into view)
  private face(dx: number, dz: number, dt: number, reverse = false) {
    const want = Math.atan2(-dz, -dx) + (reverse ? Math.PI : 0);
    let d = want - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.heading += this.shown ? d * Math.min(1, dt * 4) : d;
    this.root.rotation.y = this.heading;
  }
  // a sample of a track, `t` seconds in
  private along(track: number[], t: number): number {
    const f = t / 0.05;
    const i = Math.min(track.length - 1, Math.floor(f));
    const j = Math.min(track.length - 1, i + 1);
    return track[i] + (track[j] - track[i]) * (f - i);
  }
  /** Where it is in its cycle at a time (seconds; the same for everyone). */
  private phaseAt(now: number): { phase: "away" | "arrive" | "parked" | "leave"; t: number } {
    const k = Math.floor(now / VISIT_S);
    // (two numbers from the cycle's: a hash, the same in every browser)
    const r = (i: number) => {
      const x = Math.sin(k * 12.9898 + i * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    const away = 20 + r(1) * 100;
    const parked = 90 + r(2) * 120;
    const arrive = (this.inTrack.length - 1) * 0.05;
    const leave = (this.outTrack.length - 1) * 0.05;
    let t = now - k * VISIT_S;
    if (t < away) return { phase: "away", t };
    t -= away;
    if (t < arrive) return { phase: "arrive", t };
    t -= arrive;
    if (t < parked) return { phase: "parked", t };
    t -= parked;
    if (t < leave) return { phase: "leave", t };
    return { phase: "away", t: 0 };
  }
  update(dt: number, night: number, animate: boolean) {
    if (!animate) {
      this.park();
      this.root.visible = true;
      this.lights.opacity = this.tail.opacity = this.beam.opacity = 0;
      return;
    }
    const { phase, t } = this.phaseAt(Date.now() / 1000);
    const on = phase === "arrive" || phase === "leave";
    const lit = on ? 0.35 + 0.65 * night : 0;
    this.lights.opacity = lit;
    this.tail.opacity = lit * 0.9;
    this.beam.opacity = on ? night * 0.8 : 0;
    this.root.visible = phase !== "away";
    if (phase === "parked") this.park();
    else if (phase === "arrive") {
      const p = this.at(this.along(this.inTrack, t));
      this.root.position.set(p.x, GROUND + 0.02, p.z);
      this.face(p.dx, p.dz, dt);
    } else if (phase === "leave") {
      const s = this.along(this.outTrack, t);
      const p = this.at(s);
      this.root.position.set(p.x, GROUND + 0.02, p.z);
      this.face(-p.dx, -p.dz, dt, s > this.total - BACK_UP);
    }
    this.shown = this.root.visible;
  }
  dispose() {
    this.lights.dispose();
    this.tail.dispose();
    this.beam.dispose();
    this.beamMesh.geometry.dispose();
  }
}

// Steam from a rooftop vent: a few puffs rising, swelling and fading, on a loop.
class Steam {
  readonly root = new Group();
  private puffs: { s: Sprite; t: number; drift: number }[] = [];
  constructor(tex: CanvasTexture, n = 9) {
    for (let i = 0; i < n; i++) {
      const m = new SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
      const s = new Sprite(m);
      this.puffs.push({ s, t: i / n, drift: 0.6 + (i % 3) * 0.3 });
      this.root.add(s);
    }
  }
  setTint(c: Color) {
    for (const p of this.puffs) p.s.material.color.copy(c);
  }
  update(dt: number, animate: boolean) {
    for (const p of this.puffs) {
      if (animate) p.t = (p.t + dt * 0.22) % 1;
      const t = p.t;
      p.s.position.set(t * p.drift * 1.8, 0.4 + t * 3.2, Math.sin(t * 5 + p.drift) * 0.25);
      const k = 0.7 + t * 2.6;
      p.s.scale.set(k, k, 1);
      p.s.material.opacity = 0.55 * (1 - t) * Math.min(1, t * 5);
    }
  }
  dispose() {
    for (const p of this.puffs) p.s.material.dispose();
  }
}

// ── the campus ───────────────────────────────────────────────────────────────
export class Campus {
  readonly root = new Group();
  private disposables: { dispose(): void }[] = [];
  // materials tinted by the hour: [material, base colour]
  private tinted: [MeshLambertMaterial | MeshBasicMaterial | PointsMaterial, Color][] = [];
  private facade: MeshLambertMaterial;
  // the main block's own (the building you're in): cut above your floor from inside
  private mainFacade: MeshLambertMaterial;
  private mainCut: MeshLambertMaterial[] = [];
  private cutPlane = new Plane(new Vector3(0, -1, 0), 0);
  private cutY: number | null = null;
  private glassTint = new Color();
  private lamps: MeshBasicMaterial; // lamp heads, the entrance, lit at night
  private pools: MeshBasicMaterial;
  private letters: MeshBasicMaterial;
  private beacon: MeshBasicMaterial;
  private flakes: Flakes[] = [];
  private terrain: Terrain;
  private visitor: Visitor | null = null;
  private steam: Steam | null = null;
  private bollards: MeshBasicMaterial | null = null;
  private steamTint = new Color(1, 1, 1);
  private trees: Mesh[] = [];
  private treeTint = new Color(1, 1, 1);
  private t = 0;
  private cx: number;
  private cz: number;
  // the building's ground floor is real (shared levels.ts, docs/plan/25): the
  // lot, its cars and lamp posts are things on it, the doors an opening in the
  // facade — the campus leaves those out
  private walkable: boolean;
  private door: { z0: number; z1: number } | null = null;
  // the top storey's skin even close up (the studio isn't drawn: you're below it)
  skinAlways = false;
  // the studio's footprint (snow never falls inside it)
  private fx0: number;
  private fz0: number;
  private fx1: number;
  private fz1: number;

  constructor(
    map: MapDef,
    private T: Themes,
    cuts: Map<string, WallCut> = new Map(),
  ) {
    const W = map.width;
    const H = map.height;
    this.cx = W / 2;
    this.cz = H / 2;
    this.walkable = !!map.levels?.some((l) => l.index === 0);
    const ezDoor = entranceZOf(map);
    if (this.walkable) {
      const p0 = Math.round(ezDoor - 2);
      this.door = { z0: p0, z1: p0 + 4 };
    }
    this.fx0 = -0.5;
    this.fz0 = -0.5;
    this.fx1 = W + 0.5;
    this.fz1 = H + 0.5;
    const floor = (x: number, z: number) => x >= 0 && z >= 0 && x < W && z < H && isFloor(tileAt(map, x, z));
    const { map: facadeMap, lit } = facadeCanvases(T);
    this.facade = new MeshLambertMaterial({
      map: facadeMap,
      emissive: 0xffffff,
      emissiveMap: lit,
      emissiveIntensity: 0,
    });
    this.mainFacade = this.facade.clone();
    this.disposables.push(facadeMap, lit, this.facade, this.mainFacade);
    const concrete = this.lambert(0xcfcbc2);
    const white = this.lambert(0xf4f6f8);
    // soft shadows on the ground (multiplied): blobs under things, a band at the foot of walls
    const shadows = new G();
    const bands = new G();
    const shadowAt = (x: number, z: number, rx: number, rz: number, ry = 0, y = GROUND + 0.028) => {
      const c = Math.cos(ry);
      const sn = Math.sin(ry);
      const P = (u: number, v: number): V => [x + u * c + v * sn, y, z - u * sn + v * c];
      shadows.quad(P(-rx, -rz), P(rx, -rz), P(rx, rz), P(-rx, rz), [0, 1, 0]);
    };
    // the ground's shape: flat under the lot, the blocks, the building and the tower
    const lotRect: Rect = { x0: -56, z0: -8, x1: -10, z1: H + 12 };
    const blocks: Rect[] = [
      { x0: W + 12, z0: -30, x1: W + 40, z1: H + 12 },
      { x0: -4, z0: H + 12, x1: W + 2, z1: H + 36 },
    ];
    const towerAt = { x: -34, z: -96 };
    this.terrain = new Terrain(
      [
        lotRect,
        ...blocks,
        { x0: -3, z0: -3, x1: W + 3, z1: H + 3 },
        // the path from the lot to the doors (walked on: never under the snow)
        ...(this.walkable ? [{ x0: -14, z0: ezDoor - 5, x1: 0, z1: ezDoor + 5 }] : []),
        { x0: towerAt.x - 6, z0: towerAt.z - 6, x1: towerAt.x + 6, z1: towerAt.z + 6 },
      ],
      this.cx,
      this.cz,
      200,
    );
    const ground = (x: number, z: number) => GROUND + this.terrain.at(x, z);

    // ── the main block: the studio's floor on four storeys of glass ──
    const skin = new G();
    const topSkin = new G();
    const cap = new G();
    const coping = new G();
    const mainRuns = runs(floor, -1, -1, W + 1, H + 1);
    // a window in the studio's wall there (shared openings.ts; older saves' painted ones): its hole, tiles up
    const win = (r: Run, i: number): [number, number] | null => {
      const e = r.nz !== 0 ? { dir: "h" as const, x: r.x0 + i, y: r.z0 } : { dir: "v" as const, x: r.x0, y: r.z0 + i };
      const c = cuts.get(edgeKey(e));
      if (c && isWindowKind(c.kind)) return [c.z0 / 39.19, c.z1 / 39.19];
      return isWindow(e.dir === "h" ? hWall(map, e.x, e.y) : vWall(map, e.x, e.y)) ? [WIN0, WIN1] : null;
    };
    for (const r of mainRuns) this.facadeRun(skin, cap, coping, r, 0, (i) => win(r, i), topSkin);
    const mainWhite = this.lambert(0xf4f6f8);
    const mainConcrete = this.lambert(0xcfcbc2);
    this.mainCut = [this.mainFacade, mainWhite, mainConcrete];
    this.add(skin.build(), this.mainFacade);
    // the top storey's skin would stand between a camera just outside the
    // building and you (walls fade, this wouldn't): only from further away
    this.topSkin = this.add(topSkin.build(), this.mainFacade);
    this.add(cap.build(), mainWhite);
    this.add(coping.build(), mainConcrete);

    // ── two more blocks across a courtyard, with roofs, and a bridge ──
    const bSkin = new G();
    const bCap = new G();
    const bCoping = new G();
    const roofs = new G();
    const plant = new G().color(0x8e9399);
    const r0 = T.rng(5);
    for (const b of blocks) {
      const inside = (x: number, z: number) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1;
      for (const r of runs(inside, b.x0 - 1, b.z0 - 1, b.x1 + 1, b.z1 + 1))
        this.facadeRun(bSkin, bCap, bCoping, r, STOREY, null);
      roofs.quad(
        [b.x0 - SKIN, STOREY, b.z0 - SKIN],
        [b.x1 + SKIN, STOREY, b.z0 - SKIN],
        [b.x1 + SKIN, STOREY, b.z1 + SKIN],
        [b.x0 - SKIN, STOREY, b.z1 + SKIN],
        [0, 1, 0],
        [
          [0, 0],
          [(b.x1 - b.x0) / 24, 0],
          [(b.x1 - b.x0) / 24, (b.z1 - b.z0) / 24],
          [0, (b.z1 - b.z0) / 24],
        ],
      );
      // rooftop plant: a few units and a stair head
      for (let i = 0; i < 5; i++) {
        const x = b.x0 + 3 + r0() * (b.x1 - b.x0 - 8);
        const z = b.z0 + 3 + r0() * (b.z1 - b.z0 - 8);
        const w = 2 + r0() * 3;
        const d = 1.5 + r0() * 2;
        plant.box(x, STOREY, z, x + w, STOREY + 0.9 + r0() * 0.8, z + d);
        plant
          .color(0xffffff)
          .box(x - 0.05, STOREY + 0.9 + r0() * 0.8, z - 0.05, x + w + 0.05, STOREY + 1.85, z + d + 0.05);
        plant.color(0x8e9399);
      }
    }
    this.add(bSkin.build(), this.facade);
    this.add(bCap.build(), white);
    this.add(bCoping.build(), concrete);
    // snow drifted against the foot of every wall, and the wall's shadow on the snow
    const drifts: BufferGeometry[] = [];
    const rd = T.rng(67);
    const ezMain = H / 2;
    const allRuns = [
      ...mainRuns,
      ...blocks.flatMap((b) =>
        runs((x, z) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1, b.x0 - 1, b.z0 - 1, b.x1 + 1, b.z1 + 1),
      ),
    ];
    for (const r of allRuns) {
      const len = runLen(r);
      const dx = r.nx === 0 ? 1 : 0;
      const dz = r.nz === 0 ? 1 : 0;
      for (let t = 0.8; t < len; t += 1.6 + rd() * 1.4) {
        const sz = 0.9 + rd() * 1.5;
        // (all of it outside the wall: the ground floor's rooms are behind it)
        const out = SKIN + 0.12 + sz * 0.55;
        const x = r.x0 + dx * t + r.nx * out;
        const z = r.z0 + dz * t + r.nz * out;
        if (r.nx === -1 && r.x0 === 0 && Math.abs(z - ezMain) < 6.5) continue; // the entrance
        const g = new SphereGeometry(1, 9, 6).scale(sz * (dx ? 1.3 : 0.55), sz * 0.38, sz * (dz ? 1.3 : 0.55));
        drifts.push(place(tinted(g, 0xf6f8fa), x, GROUND - 0.12, z));
      }
      const ax = r.x0 + r.nx * SKIN;
      const az = r.z0 + r.nz * SKIN;
      const bx = r.x1 + r.nx * SKIN;
      const bz = r.z1 + r.nz * SKIN;
      const D = 3.2;
      bands.quad(
        [ax, GROUND + 0.026, az],
        [bx, GROUND + 0.026, bz],
        [bx + r.nx * D, GROUND + 0.026, bz + r.nz * D],
        [ax + r.nx * D, GROUND + 0.026, az + r.nz * D],
        [0, 1, 0],
      );
    }
    this.add(mergeGeometries(drifts, false), this.lambert(0xffffff), true);
    for (const g of drifts) g.dispose();
    const snowTex = this.snowTexture(1, 1);
    const roofMat = this.lambert(0xe9ecef, snowTex);
    this.add(roofs.build(), roofMat);
    this.add(plant.build(), this.lambert(0xffffff), true);
    // the glazed bridge from the studio's east wall to the east block
    const bz = Math.round(H / 2);
    const bridge = new G();
    bridge.color(0xe3e6ea).box(W + SKIN, 2.9, bz - 1.6, W + 12 - SKIN, 3.15, bz + 1.6); // roof slab
    bridge.color(0xd3d6da).box(W + SKIN, -0.35, bz - 1.6, W + 12 - SKIN, 0, bz + 1.6); // floor slab
    this.add(bridge.build(), this.lambert(0xffffff), true);
    const bridgeGlass = new G().color(0x7f95a6);
    bridgeGlass.quad(
      [W + SKIN, 0, bz - 1.55],
      [W + 12 - SKIN, 0, bz - 1.55],
      [W + 12 - SKIN, 2.9, bz - 1.55],
      [W + SKIN, 2.9, bz - 1.55],
      [0, 0, -1],
    );
    bridgeGlass.quad(
      [W + SKIN, 0, bz + 1.55],
      [W + 12 - SKIN, 0, bz + 1.55],
      [W + 12 - SKIN, 2.9, bz + 1.55],
      [W + SKIN, 2.9, bz + 1.55],
      [0, 0, 1],
    );
    const bgMat = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: DoubleSide });
    this.add(bridgeGlass.build(), bgMat);
    this.tinted.push([bgMat, new Color(1, 1, 1)]);

    // ── the ground: an endless snowfield, with the site drawn nearer in ──
    const far = new Mesh(
      new PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2),
      this.lambert(0xf2f4f7, this.snowTexture(100, 100)),
    );
    far.position.set(this.cx, GROUND - 0.05, this.cz);
    this.add(far);
    const siteGeo = new PlaneGeometry(420, 420, 150, 150).rotateX(-Math.PI / 2);
    {
      const pos = siteGeo.getAttribute("position");
      for (let i = 0; i < pos.count; i++) pos.setY(i, this.terrain.at(pos.getX(i) + this.cx, pos.getZ(i) + this.cz));
      siteGeo.computeVertexNormals();
    }
    const site = new Mesh(siteGeo, this.lambert(0xf2f4f7, this.snowTexture(9, 9, 43)));
    site.position.set(this.cx, GROUND, this.cz);
    this.add(site);

    // ── the parking lot, west of the building ──
    const lot: Lot = {
      ...lotRect,
      cols: [],
      aisles: [],
      bayW: 2.8,
      bayL: 5.6,
      bays: [],
    };
    // columns of bays, nose-in, either side of two aisles (x of the aisle's edge, the nose direction)
    // columns of bays, nose-in, either side of two aisles (x of the aisle's
    // edge; the bay runs the other way from `dir`, and so does the car's nose)
    const c0 = lot.x1 - 2 - lot.bayL;
    const c1 = c0 - 6.5;
    const c2 = c1 - 2 * lot.bayL;
    const c3 = c2 - 6.5;
    const c4 = c3 - 2 * lot.bayL;
    lot.cols = [
      { x: c0, dir: -1 }, // by the building: noses to the wall
      { x: c1, dir: 1 },
      { x: c2, dir: -1 },
      { x: c3, dir: 1 },
      { x: c4, dir: -1 },
    ];
    lot.aisles = [c0 - 3.25, c2 - 3.25];
    for (const col of lot.cols)
      for (let z = lot.z0 + 3; z + lot.bayW <= lot.z1 - 3; z += lot.bayW)
        lot.bays.push({ x: col.x - (col.dir * lot.bayL) / 2, z: z + lot.bayW / 2, dir: col.dir });
    const lotTex = new CanvasTexture(lotCanvas(T, lot, 20));
    lotTex.colorSpace = SRGBColorSpace;
    lotTex.anisotropy = 8;
    this.disposables.push(lotTex);
    const lotMesh = new Mesh(
      new PlaneGeometry(lot.x1 - lot.x0, lot.z1 - lot.z0).rotateX(-Math.PI / 2),
      this.lambert(0xffffff, lotTex),
    );
    lotMesh.position.set((lot.x0 + lot.x1) / 2, GROUND + 0.02, (lot.z0 + lot.z1) / 2);
    // (walkable: the ground floor's asphalt is the lot)
    if (!this.walkable) this.add(lotMesh);
    else {
      lotMesh.geometry.dispose();
      (lotMesh.material as MeshLambertMaterial).dispose();
    }
    // cars in the bays nearest the building most often
    const rc = T.rng(123);
    const taken = new Set<number>();
    // the visitor's bay: in the row by the building, a little south of the entrance
    let visitorBay = 0;
    for (let i = 0; i < lot.bays.length; i++)
      if (
        lot.bays[i].dir === -1 &&
        lot.bays[i].x > lot.x1 - 9 &&
        Math.abs(lot.bays[i].z - (H / 2 + 6)) < Math.abs(lot.bays[visitorBay].z - (H / 2 + 6))
      )
        visitorBay = i;
    taken.add(visitorBay);
    const solids: BufferGeometry[] = [];
    const glasses: BufferGeometry[] = [];
    let n = 0;
    for (let tries = 0; n < 16 && tries < 200; tries++) {
      const i = Math.floor(rc() ** 1.7 * lot.bays.length);
      if (taken.has(i)) continue;
      taken.add(i);
      n++;
      const b = lot.bays[i];
      const wagon = rc() < 0.3;
      const colour = CAR_COLOURS[Math.floor(rc() * CAR_COLOURS.length)];
      const snowy = rc() > 0.2;
      const ry = (b.dir > 0 ? 0 : Math.PI) + (rc() - 0.5) * 0.04;
      const z = b.z + (rc() - 0.5) * 0.3;
      // (walkable: the cars are things on the ground floor, drawn there)
      if (this.walkable) continue;
      const { solid, glass } = carGeometry(wagon, colour, snowy);
      solids.push(place(solid, b.x, GROUND + 0.02, z, ry));
      glasses.push(place(glass, b.x, GROUND + 0.02, z, ry));
      shadowAt(b.x, z, 3.1, 1.7, ry, GROUND + 0.03);
    }
    const carMat = this.lambert(0xffffff, undefined, true);
    if (solids.length) this.add(mergeGeometries(solids, false), carMat);
    for (const s of solids) s.dispose();
    const carGlass = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.92 });
    if (glasses.length) this.add(mergeGeometries(glasses, false), carGlass);
    this.tinted.push([carGlass, new Color(1, 1, 1)]);
    for (const s of glasses) s.dispose();
    // ploughed snow heaped along the lot's edges
    const banks: BufferGeometry[] = [];
    const rb = T.rng(31);
    const bank = (x: number, z: number) => {
      const s = 1.1 + rb() * 1.6;
      const g = new SphereGeometry(1, 10, 7).scale(s, s * 0.42, s * (0.7 + rb() * 0.6));
      banks.push(place(tinted(g, 0xf7f9fb), x, ground(x, z) - 0.1, z, rb() * Math.PI));
    };
    for (let z = lot.z0; z <= lot.z1; z += 2.2) {
      bank(lot.x0 - 1.2 + (rb() - 0.5), z + (rb() - 0.5));
      if (z < H / 2 - 5 || z > H / 2 + 5) bank(lot.x1 + 1.2 + (rb() - 0.5), z + (rb() - 0.5));
    }
    for (let x = lot.x0; x <= lot.x1; x += 2.2) {
      if (x > lot.x0 + 4 && x < lot.x0 + 12) continue; // the driveway's mouth
      bank(x + (rb() - 0.5), lot.z0 - 1.2 + (rb() - 0.5));
      bank(x + (rb() - 0.5), lot.z1 + 1.2 + (rb() - 0.5));
    }
    // the banks' far side, down the driveway
    this.add(mergeGeometries(banks, false), this.lambert(0xffffff), true);
    for (const b of banks) b.dispose();

    // ── the driveway: from the lot's corner, curving away to the horizon ──
    const road = new G();
    const A = { x: lot.x0 + 8, z: lot.z0 - 1 };
    const P1 = { x: lot.x0 - 30, z: lot.z0 - 90 };
    const P2 = { x: lot.x0 - 190, z: lot.z0 - 160 };
    const B = { x: lot.x0 - 330, z: lot.z0 - 330 };
    const bez = (t: number) => {
      const u = 1 - t;
      return {
        x: u * u * u * A.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * B.x,
        z: u * u * u * A.z + 3 * u * u * t * P1.z + 3 * u * t * t * P2.z + t * t * t * B.z,
      };
    };
    const ROAD_W = 7;
    let prev = bez(0);
    let v = 0;
    const roadPts: { x: number; z: number; tx: number; tz: number }[] = [];
    for (let i = 1; i <= 160; i++) {
      const p = bez(i / 160);
      const dx = p.x - prev.x;
      const dz = p.z - prev.z;
      const len = Math.hypot(dx, dz);
      const nx = -dz / len;
      const nz = dx / len;
      const v1 = v + len / 14;
      // (the field's plane is coarser than the road's samples: ride a little above it)
      const q = (x: number, z: number): V => [x, ground(x, z) + 0.14, z];
      road.quad(
        q(prev.x + nx * ROAD_W * 0.5, prev.z + nz * ROAD_W * 0.5),
        q(prev.x - nx * ROAD_W * 0.5, prev.z - nz * ROAD_W * 0.5),
        q(p.x - nx * ROAD_W * 0.5, p.z - nz * ROAD_W * 0.5),
        q(p.x + nx * ROAD_W * 0.5, p.z + nz * ROAD_W * 0.5),
        [0, 1, 0],
        [
          [0, v],
          [1, v],
          [1, v1],
          [0, v1],
        ],
      );
      roadPts.push({ x: p.x, z: p.z, tx: dx / len, tz: dz / len });
      v = v1;
      prev = p;
    }
    const roadTex = new CanvasTexture(roadCanvas(T));
    roadTex.colorSpace = SRGBColorSpace;
    roadTex.wrapT = RepeatWrapping;
    roadTex.anisotropy = 8;
    this.disposables.push(roadTex);
    this.add(road.build(), this.lambert(0xffffff, roadTex));
    // the lot's mouth onto the driveway
    const mouth = new G();
    mouth.quad(
      [lot.x0 + 4, GROUND + 0.012, lot.z0 - 1.5],
      [lot.x0 + 12, GROUND + 0.012, lot.z0 - 1.5],
      [lot.x0 + 12, GROUND + 0.012, lot.z0 + 0.3],
      [lot.x0 + 4, GROUND + 0.012, lot.z0 + 0.3],
      [0, 1, 0],
    );
    this.add(mouth.build(), this.lambert(0x3f4348));
    // a gatehouse by the mouth, with its barrier up
    const gate = new G();
    const gx = lot.x0 + 13.5;
    const gz = lot.z0 - 0.5;
    gate.color(0xd8d4cb).box(gx - 1.2, GROUND, gz - 1.2, gx + 1.2, GROUND + 2.6, gz + 1.2);
    gate.color(0x2c3a40).box(gx - 1.25, GROUND + 1.2, gz - 0.9, gx + 1.25, GROUND + 2.1, gz + 0.9);
    gate.color(0x2c3a40).box(gx - 0.9, GROUND + 1.2, gz - 1.25, gx + 0.9, GROUND + 2.1, gz + 1.25);
    gate.color(0xffffff).box(gx - 1.35, GROUND + 2.6, gz - 1.35, gx + 1.35, GROUND + 2.85, gz + 1.35);
    gate.color(0x8e9399).box(gx - 1.6, GROUND, gz - 0.15, gx - 1.3, GROUND + 1.1, gz + 0.15);
    gate.color(0xd93a2f).box(gx - 1.52, GROUND + 1.1, gz - 0.06, gx - 1.38, GROUND + 4.6, gz + 0.06); // the arm, up
    for (let y = 1.3; y < 4.4; y += 0.8)
      gate.color(0xf6f6f6).box(gx - 1.53, GROUND + y, gz - 0.065, gx - 1.37, GROUND + y + 0.4, gz + 0.065);
    this.add(gate.build(), this.lambert(0xffffff), true);
    shadowAt(gx, gz, 2.2, 2.2);

    // ── the entrance under the lobby's windows: canopy, glass vestibule, the name, a cleared path ──
    const west = mainRuns.filter((r) => r.nx === -1).sort((a, b) => runLen(b) - runLen(a))[0];
    if (west) {
      const ex = west.x0 - SKIN;
      const ez = (west.z0 + west.z1) / 2;
      const ent = new G();
      ent.color(0xd8d4cb).box(ex - 4.2, GROUND + 3.3, ez - 5.5, ex + 0.3, GROUND + 3.75, ez + 5.5); // canopy
      ent.color(0xffffff).box(ex - 4.25, GROUND + 3.75, ez - 5.55, ex + 0.3, GROUND + 3.95, ez + 5.55); // snow on it
      for (const z of [ez - 5, ez + 5])
        ent.color(0x8e9399).box(ex - 3.9, GROUND, z - 0.18, ex - 3.55, GROUND + 3.3, z + 0.18);
      ent.color(0x5b5f66).box(ex - 1.1, GROUND, ez - 4, ex, GROUND + 0.08, ez + 4); // the mat
      this.add(ent.build(), this.lambert(0xffffff), true);
      const vest = new G().color(0x9fb4c4);
      // (walkable: its front is open — you walk in)
      if (!this.walkable)
        vest.quad(
          [ex - 1.1, GROUND, ez - 4],
          [ex - 1.1, GROUND, ez + 4],
          [ex - 1.1, GROUND + 3.3, ez + 4],
          [ex - 1.1, GROUND + 3.3, ez - 4],
          [-1, 0, 0],
        );
      vest.quad(
        [ex - 1.1, GROUND, ez - 4],
        [ex, GROUND, ez - 4],
        [ex, GROUND + 3.3, ez - 4],
        [ex - 1.1, GROUND + 3.3, ez - 4],
        [0, 0, -1],
      );
      vest.quad(
        [ex - 1.1, GROUND, ez + 4],
        [ex, GROUND, ez + 4],
        [ex, GROUND + 3.3, ez + 4],
        [ex - 1.1, GROUND + 3.3, ez + 4],
        [0, 0, 1],
      );
      const vm = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45, side: DoubleSide });
      this.add(vest.build(), vm);
      this.tinted.push([vm, new Color(1, 1, 1)]);
      // warm light inside the vestibule at night
      const glow = new G().color(0xffd9a0);
      glow.quad(
        [ex - 1.05, GROUND + 0.2, ez - 3.9],
        [ex - 0.05, GROUND + 0.2, ez - 3.9],
        [ex - 0.05, GROUND + 3.2, ez - 3.9],
        [ex - 1.05, GROUND + 3.2, ez - 3.9],
        [0, 0, -1],
      );
      glow.quad(
        [ex - 1.05, GROUND + 0.2, ez + 3.9],
        [ex - 0.05, GROUND + 0.2, ez + 3.9],
        [ex - 0.05, GROUND + 3.2, ez + 3.9],
        [ex - 1.05, GROUND + 3.2, ez + 3.9],
        [0, 0, 1],
      );
      // (walkable: no glass in front, the lobby's own light is behind it — this
      // was a solid wall of light across the open doorway at night)
      if (!this.walkable)
        glow.quad(
          [ex - 1.05, GROUND + 0.2, ez - 3.9],
          [ex - 1.05, GROUND + 0.2, ez + 3.9],
          [ex - 1.05, GROUND + 3.2, ez + 3.9],
          [ex - 1.05, GROUND + 3.2, ez - 3.9],
          [-1, 0, 0],
        );
      this.lamps = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
      this.add(glow.build(), this.lamps);
      // the name on the canopy
      const lt = new CanvasTexture(lettersCanvas(T, "YUTOPIA"));
      lt.colorSpace = SRGBColorSpace;
      lt.anisotropy = 8;
      this.disposables.push(lt);
      this.letters = new MeshBasicMaterial({ map: lt, transparent: true, side: DoubleSide });
      const sign = new Mesh(new PlaneGeometry(8.5, 8.5 / 6.4), this.letters);
      sign.position.set(ex - 4.22, GROUND + 4.55, ez);
      sign.rotation.y = -Math.PI / 2;
      this.add(sign);
      const post = new G().color(0x8e9399);
      post.box(ex - 4.0, GROUND + 3.95, ez - 4.3, ex - 3.85, GROUND + 5.3, ez - 4.15);
      post.box(ex - 4.0, GROUND + 3.95, ez + 4.15, ex - 3.85, GROUND + 5.3, ez + 4.3);
      this.add(post.build(), this.lambert(0xffffff), true);
      // the cleared path to the lot, and two flagpoles
      const path = new G();
      path.quad(
        [lot.x1 + 0.5, GROUND + 0.012, ez - 2.2],
        [ex - 1, GROUND + 0.012, ez - 2.2],
        [ex - 1, GROUND + 0.012, ez + 2.2],
        [lot.x1 + 0.5, GROUND + 0.012, ez + 2.2],
        [0, 1, 0],
      );
      if (!this.walkable) this.add(path.build(), this.lambert(0x4c5056));
      // trodden snow either side of the path, bollard lights along it
      const slushTex = new CanvasTexture(slushCanvas(T));
      slushTex.colorSpace = SRGBColorSpace;
      this.disposables.push(slushTex);
      const slushMat = new MeshLambertMaterial({ map: slushTex, transparent: true, depthWrite: false });
      this.tinted.push([slushMat, new Color(1, 1, 1)]);
      const slush = new Mesh(new PlaneGeometry(ex - 1 - (lot.x1 + 0.5), 11).rotateX(-Math.PI / 2), slushMat);
      slush.position.set((ex - 1 + lot.x1 + 0.5) / 2, GROUND + 0.014, ez);
      this.add(slush);
      const bollardGeo: BufferGeometry[] = [];
      const bollardGlow = new G().color(0xffd9a0);
      this.bollards = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, toneMapped: false });
      for (let x = lot.x1 + 2.5; x < ex - 2; x += 3)
        for (const z of [ez - 2.8, ez + 2.8]) {
          bollardGeo.push(
            place(tinted(new CylinderGeometry(0.1, 0.12, 1.0, 8).translate(0, 0.5, 0), 0x4a4e54), x, GROUND, z),
          );
          bollardGeo.push(
            place(tinted(new CylinderGeometry(0.13, 0.13, 0.06, 8).translate(0, 1.03, 0), 0x2b2e33), x, GROUND, z),
          );
          bollardGlow.quad(
            [x - 0.1, GROUND + 0.9, z - 0.1],
            [x + 0.1, GROUND + 0.9, z - 0.1],
            [x + 0.1, GROUND + 1.0, z - 0.1],
            [x - 0.1, GROUND + 1.0, z - 0.1],
            [0, 0, -1],
          );
          bollardGlow.quad(
            [x - 0.1, GROUND + 0.9, z + 0.1],
            [x + 0.1, GROUND + 0.9, z + 0.1],
            [x + 0.1, GROUND + 1.0, z + 0.1],
            [x - 0.1, GROUND + 1.0, z + 0.1],
            [0, 0, 1],
          );
          bollardGlow.quad(
            [x - 0.1, GROUND + 0.9, z - 0.1],
            [x - 0.1, GROUND + 0.9, z + 0.1],
            [x - 0.1, GROUND + 1.0, z + 0.1],
            [x - 0.1, GROUND + 1.0, z - 0.1],
            [-1, 0, 0],
          );
          bollardGlow.quad(
            [x + 0.1, GROUND + 0.9, z - 0.1],
            [x + 0.1, GROUND + 0.9, z + 0.1],
            [x + 0.1, GROUND + 1.0, z + 0.1],
            [x + 0.1, GROUND + 1.0, z - 0.1],
            [1, 0, 0],
          );
        }
      this.add(mergeGeometries(bollardGeo, false), this.lambert(0xffffff), true);
      for (const g of bollardGeo) g.dispose();
      this.add(bollardGlow.build(), this.bollards);
      const poles: BufferGeometry[] = [];
      for (const z of [ez - 3, ez + 3]) {
        poles.push(
          place(tinted(new CylinderGeometry(0.07, 0.1, 11, 8).translate(0, 5.5, 0), 0xd0d4d8), ex - 7.5, GROUND, z),
        );
        poles.push(place(tinted(new SphereGeometry(0.16, 8, 6).translate(0, 11.1, 0), 0xe6c870), ex - 7.5, GROUND, z));
        // a flag, cream, hanging in the still air
        poles.push(
          place(tinted(new BoxGeometry(0.06, 1.6, 0.9).translate(0, 10.1, 0.52), 0xf6eedb), ex - 7.5, GROUND, z),
        );
      }
      this.add(mergeGeometries(poles, false), this.lambert(0xffffff), true);
      for (const p of poles) p.dispose();
    } else {
      this.lamps = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0 });
      this.letters = new MeshBasicMaterial();
    }

    // ── lamp posts: over the lot and down the driveway; pools of light at night ──
    const posts: BufferGeometry[] = [];
    const heads = new G().color(0xe9f2ff);
    const pools = new G();
    const lampAt = (x: number, z: number, ry: number, post = true) => {
      const gy = ground(x, z);
      if (post)
        posts.push(place(tinted(new CylinderGeometry(0.09, 0.13, 9, 8).translate(0, 4.5, 0), 0x3a3e44), x, gy, z, ry));
      if (post) {
        posts.push(
          place(tinted(new CylinderGeometry(0.22, 0.26, 0.5, 8).translate(0, 0.25, 0), 0x3a3e44), x, gy, z, ry),
        );
        posts.push(place(tinted(new BoxGeometry(2.2, 0.12, 0.12).translate(1.0, 8.95, 0), 0x3a3e44), x, gy, z, ry));
        posts.push(place(tinted(new BoxGeometry(1.0, 0.24, 0.42).translate(2.0, 8.9, 0), 0x50555b), x, gy, z, ry));
        posts.push(place(tinted(new BoxGeometry(1.0, 0.08, 0.42).translate(2.0, 9.06, 0), 0xffffff), x, gy, z, ry));
        shadowAt(x, z, 0.9, 0.9, 0, gy + 0.028);
      }
      const hx = x + Math.cos(ry) * 2.0;
      const hz = z - Math.sin(ry) * 2.0;
      if (post)
        heads.quad(
          [hx - 0.55, GROUND + 8.77, hz - 0.24],
          [hx + 0.55, GROUND + 8.77, hz - 0.24],
          [hx + 0.55, GROUND + 8.77, hz + 0.24],
          [hx - 0.55, GROUND + 8.77, hz + 0.24],
          [0, -1, 0],
        );
      // (a lot lamp on the walkable ground floor: its pool is that floor's light
      // map's — one drawn here as well lay right on its asphalt and flickered)
      if (!post) return;
      const R = 10.5;
      pools.quad(
        [hx - R, GROUND + 0.03, hz - R],
        [hx + R, GROUND + 0.03, hz - R],
        [hx + R, GROUND + 0.03, hz + R],
        [hx - R, GROUND + 0.03, hz + R],
        [0, 1, 0],
      );
    };
    // (walkable: the lot's lamp posts are things on the ground floor, their light too)
    const lotPost = !this.walkable;
    for (const x of [c2, c4])
      for (const z of [lot.z0 + 9, lot.z0 + 23, lot.z0 + 37]) lampAt(x, z, Math.PI / 2, lotPost);
    lampAt(lot.x1 - 1, lot.z0 + 4, Math.PI, lotPost);
    lampAt(lot.x1 - 1, lot.z1 - 4, Math.PI, lotPost);
    for (let i = 8; i < roadPts.length; i += 12) {
      const p = roadPts[i];
      const side = (i / 12) % 2 === 0 ? 1 : -1;
      lampAt(
        p.x - p.tz * side * (ROAD_W / 2 + 1),
        p.z + p.tx * side * (ROAD_W / 2 + 1),
        Math.atan2(p.tx * side, p.tz * side),
      );
    }
    this.add(mergeGeometries(posts, false), this.lambert(0xffffff), true);
    for (const p of posts) p.dispose();
    const headMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, toneMapped: false });
    this.add(heads.build(), headMat);
    this.headMat = headMat;
    const poolTex = new CanvasTexture(poolCanvas(T));
    this.disposables.push(poolTex);
    this.pools = new MeshBasicMaterial({
      map: poolTex,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.add(pools.build(), this.pools);

    // ── the water tower on the lawn, north-west ──
    const tx = towerAt.x;
    const tz = towerAt.z;
    const tower: BufferGeometry[] = [];
    tower.push(place(tinted(new CylinderGeometry(1.7, 2.1, 24, 18).translate(0, 12, 0), 0xdadde0), tx, GROUND, tz));
    tower.push(place(tinted(new CylinderGeometry(4.2, 1.7, 4, 18).translate(0, 26, 0), 0xcfd3d7), tx, GROUND, tz));
    tower.push(
      place(tinted(new SphereGeometry(7.4, 24, 16).scale(1, 0.72, 1).translate(0, 30.5, 0), 0xe6e8ea), tx, GROUND, tz),
    );
    tower.push(place(tinted(new CylinderGeometry(7.6, 7.6, 0.5, 24).translate(0, 29.4, 0), 0xb9bec4), tx, GROUND, tz)); // the walkway
    tower.push(place(tinted(new CylinderGeometry(0.5, 0.5, 2.2, 8).translate(0, 36.5, 0), 0xb9bec4), tx, GROUND, tz));
    this.add(mergeGeometries(tower, false), this.lambert(0xffffff), true);
    for (const t of tower) t.dispose();
    shadowAt(tx, tz, 9, 9);
    this.beacon = new MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false, transparent: true, opacity: 0 });
    const beacon = new Mesh(new SphereGeometry(0.55, 10, 8), this.beacon);
    beacon.position.set(tx, GROUND + 37.8, tz);
    this.add(beacon);

    // ── the horizon: conifers all round, groves nearer; bare trees in 3D near, as drawings far ──
    const conifer = coniferGeometry();
    this.disposables.push(conifer);
    const rt = T.rng(77);
    const plant3 = (n: number, where: () => [number, number], scale: () => number) => {
      const mesh = new InstancedMesh(conifer, this.lambert(0xffffff, undefined, true), n);
      const m = new Matrix4();
      const tint = new Color();
      for (let i = 0; i < n; i++) {
        const [x, z] = where();
        const sc = scale();
        m.compose(
          new Vector3(x, ground(x, z) - 0.1, z),
          new Quaternion().setFromEuler(new Euler((rt() - 0.5) * 0.08, rt() * Math.PI * 2, (rt() - 0.5) * 0.08)),
          new Vector3(sc, sc * (0.9 + rt() * 0.4), sc),
        );
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, tint.setHSL(0.38 + rt() * 0.08, 0.12 + rt() * 0.12, 0.82 + rt() * 0.18));
      }
      this.root.add(mesh);
    };
    plant3(
      520,
      () => {
        const a = rt() * Math.PI * 2;
        const d = 215 + rt() ** 0.6 * 90;
        return [this.cx + Math.cos(a) * d, this.cz + Math.sin(a) * d];
      },
      () => 0.7 + rt() * 0.8,
    );
    const groves = [
      { x: W + 95, z: -45, r: 34 },
      { x: -98, z: H + 40, r: 30 },
      { x: 36, z: -135, r: 38 },
      { x: W + 70, z: H + 85, r: 32 },
    ];
    plant3(
      170,
      () => {
        const g = groves[Math.floor(rt() * groves.length)];
        const a = rt() * Math.PI * 2;
        const d = rt() ** 0.6 * g.r;
        return [g.x + Math.cos(a) * d, g.z + Math.sin(a) * d];
      },
      () => 0.85 + rt() * 0.6,
    );
    // bare trees in 3D on the lawn, by the lot and along the drive
    const treeKinds = [41, 42, 43].map((seed) => bareTree3(T.rng(seed)));
    for (const k of treeKinds) this.disposables.push(k);
    const rb2 = T.rng(3);
    const spots: [number, number][] = [];
    for (let i = 0; i < 14; i++) spots.push([-12 + rb2() * (W + 10), -16 - rb2() * 46]); // the lawn north
    for (let i = 0; i < 8; i++) spots.push([lot.x0 - 6 - rb2() * 24, lot.z0 + rb2() * (lot.z1 - lot.z0)]); // west of the lot
    for (let i = 0; i < 10; i++) {
      const p = roadPts[10 + Math.floor(rb2() * 60)];
      const side = rb2() < 0.5 ? -1 : 1;
      const off = ROAD_W / 2 + 4 + rb2() * 8;
      spots.push([p.x - p.tz * side * off, p.z + p.tx * side * off]);
    }
    for (let i = 0; i < 6; i++) spots.push([tx - 20 + rb2() * 40, tz + 14 + rb2() * 20]);
    const treeMeshes = treeKinds.map(
      (k) => new InstancedMesh(k, this.lambert(0xffffff, undefined, true), Math.ceil(spots.length / 3)),
    );
    const counts = [0, 0, 0];
    const tm = new Matrix4();
    spots.forEach(([x, z], i) => {
      const kind = i % 3;
      const sc = 0.8 + rb2() * 0.7;
      tm.compose(
        new Vector3(x, ground(x, z) - 0.05, z),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rb2() * Math.PI * 2),
        new Vector3(sc, sc, sc),
      );
      treeMeshes[kind].setMatrixAt(counts[kind]++, tm);
      shadowAt(x, z, 1.6 * sc, 1.6 * sc, 0, ground(x, z) + 0.028);
    });
    treeMeshes.forEach((m, i) => {
      m.count = counts[i];
      this.root.add(m);
    });
    // the far clumps stay drawings turned to the camera
    const kinds2: CanvasTexture[] = [];
    for (let k = 0; k < 4; k++) {
      const c = T.canvas(160, 220);
      T.bareTree(c.g, 80, 214, 190, T.rng(40 + k), "#4a525c");
      const t = new CanvasTexture(c.c);
      t.colorSpace = SRGBColorSpace;
      kinds2.push(t);
      this.disposables.push(t);
    }
    const clumps = [
      { x: W + 60, z: -110, r: 26 },
      { x: -150, z: 40, r: 30 },
      { x: W + 120, z: H + 60, r: 30 },
      { x: -60, z: H + 120, r: 26 },
      { x: 170, z: 10, r: 24 },
    ];
    for (let i = 0; i < 60; i++) {
      const c = clumps[i % clumps.length];
      const a = rb2() * Math.PI * 2;
      const d = rb2() ** 0.7 * c.r;
      const h = 6 + rb2() * 6;
      const mat = new MeshBasicMaterial({ map: kinds2[i % 4], transparent: true, alphaTest: 0.1, side: DoubleSide });
      const mesh = new Mesh(new PlaneGeometry(h * (160 / 220), h), mat);
      const x = c.x + Math.cos(a) * d;
      const z = c.z + Math.sin(a) * d;
      mesh.position.set(x, ground(x, z) + h / 2 - 0.1, z);
      this.disposables.push(mat, mesh.geometry);
      this.trees.push(mesh);
      this.root.add(mesh);
    }

    // ── life: a visitor's car now and then, steam off the east block's roof ──
    {
      const bay = lot.bays[visitorBay];
      const aisle = lot.aisles[0];
      const route: { x: number; z: number; v: number }[] = [];
      for (let i = roadPts.length - 1; i >= 0; i -= 2) route.push({ x: roadPts[i].x, z: roadPts[i].z, v: 7 });
      route.push({ x: lot.x0 + 8, z: lot.z0 + 1.6, v: 3 });
      route.push({ x: aisle - 0.4, z: lot.z0 + 1.6, v: 3 });
      route.push({ x: aisle - 0.4, z: bay.z - 2.2, v: 2.2 });
      route.push({ x: aisle + 1.6, z: bay.z - 0.3, v: 1.6 });
      route.push({ x: bay.x, z: bay.z, v: 1.2 });
      const { solid, glass } = carGeometry(false, 0x6b2430, false);
      this.disposables.push(solid, glass);
      const beamTex = new CanvasTexture(beamCanvas(T));
      beamTex.flipY = false; // the narrow, bright end at the car
      this.disposables.push(beamTex);
      this.visitor = new Visitor(route, { x: bay.x, z: bay.z, ry: Math.PI }, solid, glass, carMat, carGlass, beamTex);
      this.root.add(this.visitor.root);
    }
    {
      const vent = new G().color(0x7d8288);
      const vx = blocks[0].x0 + 9;
      const vz = blocks[0].z0 + 14;
      vent.box(vx - 0.5, STOREY, vz - 0.5, vx + 0.5, STOREY + 1.6, vz + 0.5);
      vent.color(0x5d6268).box(vx - 0.65, STOREY + 1.6, vz - 0.65, vx + 0.65, STOREY + 1.8, vz + 0.65);
      this.add(vent.build(), this.lambert(0xffffff), true);
      const puff = T.canvas(64, 64);
      const pg = puff.g.createRadialGradient(32, 32, 0, 32, 32, 32);
      pg.addColorStop(0, "rgba(255,255,255,0.9)");
      pg.addColorStop(0.5, "rgba(255,255,255,0.4)");
      pg.addColorStop(1, "rgba(255,255,255,0)");
      puff.g.fillStyle = pg;
      puff.g.fillRect(0, 0, 64, 64);
      const puffTex = new CanvasTexture(puff.c);
      this.disposables.push(puffTex);
      this.steam = new Steam(puffTex);
      this.steam.root.position.set(vx, STOREY + 1.7, vz);
      this.root.add(this.steam.root);
    }

    // the shadows, multiplied onto whatever ground is under them
    const { blob, band } = shadowCanvases(T);
    for (const [g, c] of [
      [shadows, blob],
      [bands, band],
    ] as [G, HTMLCanvasElement][]) {
      if (g.empty) continue;
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      this.disposables.push(tex);
      const m = new MeshBasicMaterial({
        map: tex,
        transparent: true,
        blending: MultiplyBlending,
        premultipliedAlpha: true,
        depthWrite: false,
      });
      this.disposables.push(m);
      this.add(g.build(), m);
    }

    // ── snow: boxes of flakes that go with the camera (wrapping), never over the studio:
    // a near one of small flakes, a far sparser one so the field snows too ──
    const dot = T.canvas(32, 32);
    const grd = dot.g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    dot.g.fillStyle = grd;
    dot.g.fillRect(0, 0, 32, 32);
    const flake = new CanvasTexture(dot.c);
    this.disposables.push(flake);
    for (const [box, count, size, op, seed] of [
      [new Vector3(36, 24, 36), 2600, 0.09, 0.9, 9],
      [new Vector3(150, 34, 150), 2400, 0.3, 0.55, 10],
    ] as [Vector3, number, number, number, number][]) {
      const f = new Flakes(box, count, size, op, flake, T.rng(seed));
      this.flakes.push(f);
      this.disposables.push(f);
      this.tinted.push([f.material, new Color(1, 1, 1)]);
      this.root.add(f.points);
    }
  }
  private headMat: MeshBasicMaterial;
  private topSkin: Mesh;

  // One run of facade: the glass skin down to the ground, a parapet with a
  // snowy cap. The main block's top storey is the studio itself: its skin goes
  // round the studio's real windows (`win` says which tiles have one), and the
  // coping sits on its walls.
  private facadeRun(
    skin: G,
    cap: G,
    coping: G,
    r: Run,
    top: number,
    win: ((i: number) => [number, number] | null) | null,
    topSkin?: G,
  ) {
    const studio = !!win;
    const nx = r.nx;
    const nz = r.nz;
    // along the run, with the outward offset, ends extended so corners close
    const dx = nx === 0 ? 1 : 0;
    const dz = nz === 0 ? 1 : 0;
    const ax = r.x0 + nx * SKIN - dx * SKIN;
    const az = r.z0 + nz * SKIN - dz * SKIN;
    const bx = r.x1 + nx * SKIN + dx * SKIN;
    const bz = r.z1 + nz * SKIN + dz * SKIN;
    const len = Math.hypot(bx - ax, bz - az);
    const U = BAY * 4;
    const V = STOREY * 4;
    const v = (y: number) => (STOREY - y) / V;
    const n: V = [nx, 0, nz];
    const band = (
      x0: number,
      z0: number,
      x1: number,
      z1: number,
      u0: number,
      u1: number,
      y0: number,
      y1: number,
      into: G = skin,
    ) =>
      into.quad([x0, y1, z0], [x1, y1, z1], [x1, y0, z1], [x0, y0, z0], n, [
        [u0, v(y1)],
        [u1, v(y1)],
        [u1, v(y0)],
        [u0, v(y0)],
      ]);
    const door = this.door;
    if (door && nx === -1 && r.x0 === 0 && door.z0 > r.z0 && door.z1 < r.z1) {
      // the entrance: an opening in the glass, as tall as the ground floor's walls
      const u = (z: number) => (z - az) / U;
      band(ax, az, ax, door.z0, 0, u(door.z0), GROUND, top);
      band(ax, door.z1, bx, bz, u(door.z1), len / U, GROUND, top);
      band(ax, door.z0, ax, door.z1, u(door.z0), u(door.z1), GROUND + WALL, top);
    } else band(ax, az, bx, bz, 0, len / U, GROUND, top);
    if (win) {
      // the top storey, tile by tile, open where a window is
      const tiles = Math.abs(r.x1 - r.x0) + Math.abs(r.z1 - r.z0);
      for (let i = 0; i < tiles; i++) {
        const x0 = r.x0 + nx * SKIN + dx * (i === 0 ? -SKIN : i);
        const z0 = r.z0 + nz * SKIN + dz * (i === 0 ? -SKIN : i);
        const x1 = r.x0 + nx * SKIN + dx * (i === tiles - 1 ? i + 1 + SKIN : i + 1);
        const z1 = r.z0 + nz * SKIN + dz * (i === tiles - 1 ? i + 1 + SKIN : i + 1);
        const u0 = Math.hypot(x0 - ax, z0 - az) / U;
        const u1 = Math.hypot(x1 - ax, z1 - az) / U;
        const g = topSkin ?? skin;
        const hole = win(i);
        if (hole) {
          band(x0, z0, x1, z1, u0, u1, 0, hole[0] - 0.02, g);
          band(x0, z0, x1, z1, u0, u1, hole[1] + 0.03, WALL, g);
        } else band(x0, z0, x1, z1, u0, u1, 0, WALL, g);
      }
    }
    // the parapet: outer face, snowy cap, inner face (the blocks' roofs end at it)
    const base = studio ? WALL - 0.02 : top;
    const inX = studio ? nx * 0.1 : -nx * 0.4;
    const inZ = studio ? nz * 0.1 : -nz * 0.4;
    coping.quad([ax, base, az], [bx, base, bz], [bx, PARAPET, bz], [ax, PARAPET, az], n);
    cap.quad(
      [ax, PARAPET, az],
      [bx, PARAPET, bz],
      [r.x1 + inX, PARAPET, r.z1 + inZ],
      [r.x0 + inX, PARAPET, r.z0 + inZ],
      [0, 1, 0],
    );
    if (!studio)
      coping.quad(
        [r.x0 + inX, base, r.z0 + inZ],
        [r.x1 + inX, base, r.z1 + inZ],
        [r.x1 + inX, PARAPET, r.z1 + inZ],
        [r.x0 + inX, PARAPET, r.z0 + inZ],
        [-nx, 0, -nz],
      );
  }

  private lambert(hex: number, map?: CanvasTexture, vertex = false): MeshLambertMaterial {
    const m = new MeshLambertMaterial({ color: hex, map: map ?? null, vertexColors: vertex });
    this.disposables.push(m);
    this.tinted.push([m, new Color(hex)]);
    return m;
  }
  private snowTexture(rx: number, ry: number, seed = 41): CanvasTexture {
    const t = new CanvasTexture(snowCanvas(this.T, 512, seed));
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
    this.disposables.push(t);
    return t;
  }
  private add(g: BufferGeometry | Mesh, mat?: MeshLambertMaterial | MeshBasicMaterial, vertex = false): Mesh {
    if (g instanceof Mesh) {
      this.root.add(g);
      this.disposables.push(g.geometry);
      return g;
    }
    const m = mat ?? this.lambert(0xffffff);
    if (vertex) m.vertexColors = true;
    const mesh = new Mesh(g, m);
    this.disposables.push(g);
    this.root.add(mesh);
    return mesh;
  }

  // The hour: everything outside takes the ambient (and goes blue-dark at
  // night, as the iso backdrop); the glass reflects the sky; lights come on.
  setDay(d: Daylight, skyMid: number) {
    const amb = new Color(d.ambient[0], d.ambient[1], d.ambient[2]);
    const k = 1 - 0.58 * d.night;
    for (const [m, base] of this.tinted) m.color.copy(base).multiply(amb).multiplyScalar(k);
    this.glassTint.setHex(skyMid, SRGBColorSpace);
    // the facade: a little of the sky's colour in the glass, darker at night
    this.facade.color
      .copy(amb)
      .lerp(this.glassTint, 0.25)
      .multiplyScalar(0.75 + 0.35 * (1 - d.night))
      .multiplyScalar(k);
    this.facade.emissiveIntensity = Math.max(0, d.night * 0.55 - 0.03);
    this.mainFacade.color.copy(this.facade.color);
    this.mainFacade.emissiveIntensity = this.facade.emissiveIntensity;
    const on = Math.min(1, Math.max(0, d.night * 1.3 - 0.1));
    this.lamps.opacity = on * 0.85;
    this.headMat.opacity = on;
    this.pools.opacity = on;
    this.letters.color.setRGB(1, 1, 1).multiplyScalar(0.7 + 0.3 * on);
    this.treeTint.copy(amb).multiplyScalar(k);
    for (const t of this.trees) (t.material as MeshBasicMaterial).color.copy(this.treeTint);
    if (this.bollards) this.bollards.opacity = on;
    this.steamTint.copy(amb).multiplyScalar(0.6 + 0.4 * k);
    this.steam?.setTint(this.steamTint);
    this.night = d.night;
  }
  private night = 0;

  /** Inside the building on a floor under the studio, the Sims rule: nothing of
   *  the main block above `y` (world height; null: all of it, seen from outside).
   *  The floors above aren't drawn, so their glass would hang in the air. */
  cutAbove(y: number | null) {
    if (y === this.cutY) return;
    this.cutY = y;
    this.cutPlane.constant = y ?? 0;
    for (const m of this.mainCut) {
      m.clippingPlanes = y === null ? null : [this.cutPlane];
      m.needsUpdate = true;
    }
  }

  update(dt: number, cam: Vector3, animate: boolean) {
    if (animate) this.t += dt;
    const outX = Math.max(0, this.fx0 + 0.5 - cam.x, cam.x - this.fx1 + 0.5);
    const outZ = Math.max(0, this.fz0 + 0.5 - cam.z, cam.z - this.fz1 + 0.5);
    this.topSkin.visible = this.skinAlways || Math.hypot(outX, outZ) > 14.5;
    for (const t of this.trees) t.rotation.y = Math.atan2(cam.x - t.position.x, cam.z - t.position.z);
    // the tower's beacon blinks at night
    this.beacon.opacity = this.night > 0.1 ? (Math.sin(this.t * 2.2) > 0.3 ? this.night : 0.08) : 0;
    for (const f of this.flakes) f.update(dt, cam, animate, this.fx0, this.fz0, this.fx1, this.fz1);
    this.visitor?.update(dt, this.night, animate);
    this.steam?.update(dt, animate);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.visitor?.dispose();
    this.steam?.dispose();
  }
}
