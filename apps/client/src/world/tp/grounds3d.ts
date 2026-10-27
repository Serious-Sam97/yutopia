import { CAR_COLOURS } from "@yutopia/shared";
import {
  BENCH,
  BUILDINGS,
  type Building,
  CHUNK,
  CORN,
  FARM,
  FENCE,
  GATE,
  GROUNDS,
  groundAt,
  groundSurfaceAt,
  groundsRng,
  type Inside,
  insideFence,
  insideOf,
  KART_CROWD,
  KART_GATE,
  KART_LAND,
  KART_PARK,
  KART_SHOW,
  KART_TURN,
  kartBridged,
  kartFloods,
  kartLayoutNow,
  kartShowNow,
  kartTrack,
  LAMPS,
  LOT,
  MOTORS,
  type P,
  PLAZA,
  POND,
  POND_LEVEL,
  RAVINE,
  RIVER,
  ROAD_CLOSED,
  SCARECROWS,
  STATUE,
  STREET,
  type Surface,
  standLights,
  TOWER,
  TRACTOR,
  type Tree,
  terrainAt,
  trackAt,
  treesIn,
  WAYS,
  type Way,
  wallEdgeAt,
  wayHalf,
} from "@yutopia/shared/grounds";
import { lotLayout } from "@yutopia/shared/lot";
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
  type Sphere,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Texture,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hexOf, houseLook, shopLook } from "../grounds-look";
import {
  bareTree3,
  carGeometry,
  facadeCanvases,
  G,
  lettersCanvas,
  place,
  poolCanvas,
  roadCanvas,
  snowCanvas,
  tinted,
  type V,
} from "./campus";
import { beam, railing, truss } from "./landmarks3d";
import { lotDressing, lotPaintCanvas, lotSignCanvas } from "./lot3d";
import {
  asphaltCanvas,
  crossingHeaps,
  crossingPaint,
  lotCover,
  paintCover,
  roadCover,
  slabCanvas,
  snowPoles,
  streetCorners,
  wayDressing,
} from "./roads3d";
import type { Themes } from "./sky";
import { bankAlong, driftAlong, face, flatSnow, icicles, ridge, SNOW, slopeSnow, wobble } from "./snow3d";
import { motorsForecourt } from "./spot3d";
import { streetGeometry } from "./town3d";

// the change's show: the old circuit whitens to the snow's colour (docs/plan/47-the-track-changer.md)
const SHOW_SNOW = new Color("#eef2f5");
// (how far the park's bridge sinks to be gone: its deck, 5.6 m up, and its parapets under the snow)
const BRIDGE_SINK = 8;

/** The Kart Park's 3D (karts3d.ts), loaded from here only: the game's scenery, the stills and the
 *  sandbox share this one import, so the build makes one chunk of it, not one for each. */
export const loadKarts = () => import("./karts3d");

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
  /** the studio's east wall (its map's width): a bigger studio than the Grounds' own 48
   *  pushes it east, and the courtyard bridge starts there, not inside the studio */
  hqEast?: number;
  /** a still's own cars parked in the lot's bays, besides the seeded ones (no snow under them) */
  parked?: { x: number; z: number }[];
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
// Ice (docs/plan/33-the-look.md): dark and clear where the wind swept it, snow lying across it in
// long drifts the wind laid down one way, white cracks; tileable.
function iceCanvas(T: Themes): HTMLCanvasElement {
  const S = 512;
  const { c, g } = T.canvas(S, S);
  const r = T.rng(307);
  g.fillStyle = "#7f93a4";
  g.fillRect(0, 0, S, S);
  // darker clear patches, lighter frosted ones
  for (let i = 0; i < 30; i++) {
    const x = r() * S;
    const y = r() * S;
    const w = 50 + r() * 90;
    const dark = r() < 0.5;
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, w);
        grd.addColorStop(0, dark ? "rgba(84,104,122,0.55)" : "rgba(176,192,205,0.45)");
        grd.addColorStop(1, "rgba(127,147,164,0)");
        g.fillStyle = grd;
        g.beginPath();
        g.ellipse(x + ox, y + oy, w, w * 0.55, -0.45, 0, Math.PI * 2);
        g.fill();
      }
  }
  // snow drifted across it, all one way
  for (let i = 0; i < 46; i++) {
    const x = r() * S;
    const y = r() * S;
    const w = 30 + r() * 90;
    const h = 3 + r() * 9;
    g.fillStyle = `rgba(238,243,247,${0.35 + r() * 0.45})`;
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        g.beginPath();
        g.ellipse(x + ox, y + oy, w, h, -0.45, 0, Math.PI * 2);
        g.fill();
      }
  }
  // cracks: white, branching
  g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    let x = r() * S;
    let y = r() * S;
    let a = r() * Math.PI * 2;
    g.strokeStyle = `rgba(232,240,246,${0.45 + r() * 0.35})`;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 9; k++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * (10 + r() * 16);
      y += Math.sin(a) * (10 + r() * 16);
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
// Its shape by `o` (docs/plan/33-the-look.md: a wood of one tree read as a plantation): how many
// tiers, how tall, how broad, how much of each tier the snow covers.
export function pineGeometry(
  r: () => number,
  o: { tiers?: number; H?: number; width?: number; snow?: number } = {},
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const tiers = o.tiers ?? 7;
  const H = o.H ?? 10.5;
  const wide = o.width ?? 1;
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1);
    const y0 = 1.1 + k * (H - 2.6);
    const rad = 2.7 * wide * (1 - k * 0.82) * (0.92 + r() * 0.16);
    const h = (2.6 - k * 0.9) * (H / 10.5) ** 0.5;
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
    const sh = h * (o.snow ?? 0.5);
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

// A far birch and a far bare tree: a trunk and a few limbs (the near ones' wire of twigs, at a
// hundred tiles and more, is a few pixels; they went missing there instead).
export function farBirchGeometry(): BufferGeometry {
  const parts = [tinted(new CylinderGeometry(0.1, 0.18, 9, 4).translate(0, 4.5, 0), 0xe6e2da)];
  for (const [a, y, l] of [
    [0.4, 5.2, 2.2],
    [2.5, 6.4, 2],
    [4.4, 7.4, 1.6],
  ]) {
    const g = new CylinderGeometry(0.03, 0.06, l, 3).translate(0, l / 2, 0);
    g.rotateZ(-0.9).rotateY(a).translate(0, y, 0);
    parts.push(tinted(g, 0x4b3d36));
  }
  const m = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return m;
}
export function farBareGeometry(): BufferGeometry {
  const parts = [tinted(new CylinderGeometry(0.12, 0.24, 5, 4).translate(0, 2.5, 0), 0x4a525c)];
  for (const [a, y, l] of [
    [0.3, 3.6, 2.6],
    [2.2, 4.2, 2.4],
    [4.1, 3.9, 2.5],
    [5.4, 4.6, 1.8],
  ]) {
    const g = new CylinderGeometry(0.03, 0.08, l, 3).translate(0, l / 2, 0);
    g.rotateZ(-0.7).rotateY(a).translate(0, y, 0);
    parts.push(tinted(g, 0x4a525c));
  }
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
  private trim = new G(); // a building's sills and such, added with it (settle)
  private asphalts = new Map<string, Texture>();
  private paintMats = new Map<string, MeshLambertMaterial>();
  /** The lines' material for a kind of way: worn and snowed over with it (roads3d.ts). */
  private paintMat(kind: string): MeshLambertMaterial {
    let m = this.paintMats.get(kind);
    if (!m) {
      m = this.keep(new MeshLambertMaterial({ vertexColors: true }));
      paintCover(m, kind);
      this.paintMats.set(kind, m);
    }
    return m;
  }
  /** A way's asphalt picture (its lanes by its width), one per way. */
  private asphalt(w: Way): Texture {
    let t = this.asphalts.get(w.key);
    if (!t) {
      t = this.keep(tex(asphaltCanvas(this.T, w)));
      t.anisotropy = 8;
      this.asphalts.set(w.key, t);
    }
    return t;
  }
  private roadCtx = {
    near: (x: number, z: number, pad = 0) => this.near(x, z, pad),
    yAt: (w: Way, i: number, x: number, z: number) => (w.bridged[i] ? w.h[i] : groundAt(x, z)),
  };
  private ts: {
    snow: CanvasTexture;
    road: CanvasTexture;
    trail: CanvasTexture;
    walk: CanvasTexture;
    slabs: CanvasTexture;
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
      slabs: this.keep(tex(slabCanvas(T))),
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
    run(() => this.motors());
    for (const f of this.farmSteps()) run(f);
    // the Kart Park (the game's: the stills and the sandbox stage it themselves)
    if (o.stream && KART_LAND) {
      run(() => this.kartParkLamps());
      run(() => this.kartPark());
    }
    // (last: they gather every light and glow the steps before added)
    run(() => this.lamps());
    run(() => this.ridges());
  }
  private pending: (() => void)[] = [];
  /** steps still to build (`step()`) */
  get left(): number {
    return this.pending.length;
  }
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

  private beacon: { m: MeshBasicMaterial; halo: SpriteMaterial } | null = null;
  /** The water tower's beacon: a second on, a second and a half off, after dark. */
  tick(t: number) {
    this.kartCircuit();
    this.kartShow(t);
    if (!this.beacon) return;
    const on = t % 2.5 < 1 ? 1 : 0.06;
    const k = Math.min(1, this.lastNight * 1.4);
    this.beacon.m.opacity = k * on;
    this.beacon.halo.opacity = k * on * 0.9;
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
    widthAt?: (i: number) => number,
  ) {
    let v = 0;
    const L = w.line;
    // (a bridge's deck: flush with the way — shared deckAt; the driveway's last two tiles eased
    // down to the lot's own asphalt, so where they meet is no step for the ink to outline)
    const ease = (x: number, z: number) => (x > LOT.x0 && x < LOT.x1 ? Math.min(1, Math.max(0, (LOT.z0 - z) / 2)) : 1);
    const yAt = (i: number, x: number, z: number) => (w.bridged[i] ? w.h[i] : groundAt(x, z)) + lift * ease(x, z);
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
      const wk = (k: number) => (widthAt ? widthAt(k) : width);
      const P = (x: number, z: number, nx: number, nz: number, s: number, k: number): V => {
        const px = x + nx * (off + s * wk(k) * 0.5);
        const pz = z + nz * (off + s * wk(k) * 0.5);
        return [px, yAt(k, px, pz), pz];
      };
      // (narrower: the picture's middle, so across it still counts the way's own tiles)
      const U = (s: number, k: number) => 0.5 + (s * wk(k)) / (2 * width);
      into.quad(
        P(ax, az, anx, anz, -1, i),
        P(ax, az, anx, anz, 1, i),
        P(bx, bz, bnx, bnz, 1, i + 1),
        P(bx, bz, bnx, bnz, -1, i + 1),
        [0, 1, 0],
        [
          [U(-1, i), v],
          [U(1, i), v],
          [U(1, i + 1), v1],
          [U(-1, i + 1), v1],
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
    const banks = new G();
    const paint = new G();
    const slabs = new G();
    let lines = new G();
    const r = groundsRng(77 + (only ? WAYS.indexOf(only) : 0));
    for (const w of only ? [only] : WAYS) {
      if (w.kind === "trail") {
        this.ribbon(w, w.w + 0.8, 0, 0.03, 9, trail);
        // trodden down: the snow either side stands a little higher (a low berm, open where
        // another way crosses and on the footbridge)
        for (const side of [1, -1] as const)
          bankAlong(banks, w.line, w.w / 2 + 0.75, side, groundAt, r, {
            h: 0.2,
            w: 1.1,
            skip: (x, z, i) =>
              w.bridged[i] || !this.near(x, z, 10) || WAYS.some((u) => u !== w && nearLine(u, x, z) < u.w / 2 + 1.2),
          });
      } else if (w.kind === "walk") this.ribbon(w, w.w, 0, 0.04, 6, walk);
      else {
        // the asphalt, its own picture by its width; the lines, verges, kerbs and pavements over it
        // (roads3d.ts)
        const ag = new G();
        this.ribbon(w, w.w, 0, 0.05, 9, ag, 0, w.line.length - 1, w.flare ? (i) => 2 * wayHalf(w, i) : undefined);
        if (!ag.empty) {
          const am = this.lambert(0xffffff, this.asphalt(w));
          roadCover(am, w);
          this.add(ag.build(), am, "receive");
        }
        wayDressing(w, this.roadCtx, nearLine, paint, slabs, lines);
        streetCorners(w, this.roadCtx, nearLine, banks);
        if (!lines.empty) {
          this.add(lines.build(), this.paintMat(w.kind), "receive");
          lines = new G();
        }
        // the plough's banks beyond a road's verges: a ridge each side (none on a bridge, across
        // another way's mouth or the lot's, nor out of reach; a street's kerbs: streetCorners)
        if (w.kind !== "street")
          for (const side of [1, -1] as const)
            bankAlong(banks, w.line, (i) => wayHalf(w, i) + 1.2, side, groundAt, r, {
              h: 0.55,
              w: 1.8,
              skip: (x, z, i) =>
                w.bridged[i] ||
                !this.near(x, z, 10) ||
                WAYS.some((u) => u !== w && u.kind !== "trail" && nearLine(u, x, z) < u.w / 2 + 1.5) ||
                (x > LOT.x0 - 2 && x < LOT.x1 + 2 && z > LOT.z0 - 2 && z < LOT.z1 + 2) ||
                (KART_LAND && Math.hypot(x - KART_TURN.x, z - KART_TURN.z) < KART_TURN.r + 7),
            });
      }
    }
    if (!road.empty) this.add(road.build(), this.lambert(0xffffff, this.ts.road), "receive");
    if (!paint.empty) this.add(paint.build(), this.lambert(), "receive");
    if (!slabs.empty) this.add(slabs.build(), this.lambert(0xffffff, this.ts.slabs), "receive");
    if (!trail.empty) this.add(trail.build(), this.lambert(0xffffff, this.ts.trail), "receive");
    if (!walk.empty) this.add(walk.build(), this.lambert(0xffffff, this.ts.walk), "receive");
    // (they only take shadows: a long low ridge's own came out jagged on the road)
    if (!banks.empty) this.add(banks.build(), this.lambert(), "receive");
    if (only && only !== WAYS[WAYS.length - 1]) return;
    if (this.near(420, -405, 40)) {
      const cw = new G();
      crossingPaint(cw, groundAt);
      this.add(cw.build(), this.paintMat("street"), "receive");
      const heaps = crossingHeaps(groundAt);
      this.add(mergeGeometries(heaps, false), this.lambert(), "receive");
      for (const h of heaps) h.dispose();
    }
    const poles = snowPoles((x, z, p) => this.near(x, z, p), groundAt);
    if (poles.length) {
      this.add(mergeGeometries(poles, false), this.lambert());
      for (const p of poles) p.dispose();
    }
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
      const deck = (i: number): V => [L[i][0], w.h[i] + 0.05, L[i][1]];
      if (timber) {
        // the footbridge: a stringer either side under the deck, a railing on posts along both
        for (const s of [1, -1]) {
          const off = (i: number): V => {
            const [px, pz] = L[Math.max(a, i - 1)];
            const [qx, qz] = L[Math.min(b, i + 1)];
            const l = Math.hypot(qx - px, qz - pz) || 1;
            const p = deck(i);
            return [p[0] - ((qz - pz) / l) * s * (w.w / 2 + 0.2), p[1], p[2] + ((qx - px) / l) * s * (w.w / 2 + 0.2)];
          };
          for (let i = a; i < b; i += 3) {
            const j = Math.min(b, i + 3);
            const p = off(i);
            const q = off(j);
            beam(g, [p[0], p[1] - 0.3, p[2]], [q[0], q[1] - 0.3, q[2]], 0.32, 0x4a3b2e);
            railing(g, p, q, 1.05, 1.5, 0x5a4636);
          }
        }
      } else {
        // the road's: a steel through truss, its guard rails, the deck's edge girders
        truss(g, deck(a), deck(b), w.w / 2 + 0.7, 5.2, 4, 0x56606a);
      }
      // the deck's underside
      for (let i = a; i < b; i++) {
        const [ax, az] = L[i];
        const [bx, bz] = L[i + 1];
        const l = Math.hypot(bx - ax, bz - az) || 1;
        const nx = -(bz - az) / l;
        const nz = (bx - ax) / l;
        g.color(timber ? 0x4a3b2e : 0x3d4247);
        const o = w.w / 2 + 0.3;
        g.quad(
          [ax + nx * o, w.h[i] - 0.25, az + nz * o],
          [bx + nx * o, w.h[i + 1] - 0.25, bz + nz * o],
          [bx - nx * o, w.h[i + 1] - 0.25, bz - nz * o],
          [ax - nx * o, w.h[i] - 0.25, az - nz * o],
          [0, -1, 0],
        );
        // its edges, seen from the side
        for (const s of [1, -1])
          face(
            g,
            [ax + nx * s * o, w.h[i] - 0.25, az + nz * s * o],
            [bx + nx * s * o, w.h[i + 1] - 0.25, bz + nz * s * o],
            [bx + nx * s * o, w.h[i + 1] + 0.06, bz + nz * s * o],
            [ax + nx * s * o, w.h[i] + 0.06, az + nz * s * o],
            [nx * s, 0, nz * s],
          );
      }
      // the steel bridge's piers on the ice
      if (!timber)
        for (const k of [a + Math.round((b - a) * 0.33), a + Math.round((b - a) * 0.66)]) {
          const [x, z] = L[k];
          g.color(0x6a6f75).box(x - 1, terrainAt(x, z) - 1, z - 4.4, x + 1, w.h[k] - 0.6, z + 4.4);
          g.color(0x7a7f85).box(x - 1.3, w.h[k] - 0.6, z - 4.9, x + 1.3, w.h[k] - 0.25, z + 4.9); // its cap
          // ice heaped against it upstream
          g.color(0xe6eef4).box(x - 1.4, terrainAt(x, z) - 0.2, z - 4.6, x - 0.9, terrainAt(x, z) + 0.5, z + 4.6);
        }
      this.add(g.build(), this.lambert());
    }
  }

  // ── the pond and the river, frozen ──
  private water() {
    const ice = this.keep(
      new MeshStandardMaterial({ map: this.ts.ice, roughness: 0.38, metalness: 0.0, color: 0xf2f6f9 }),
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
      // the shore: snow lying over the ice's edge all round (but where the dock goes out)
      const shore = new G();
      const rs = groundsRng(911);
      const lump = wobble(rs, 6);
      const st = Array.from({ length: 161 }, (_, i) => {
        const a = (i / 160) * Math.PI * 2;
        const x = POND.cx + Math.cos(a) * POND.rx;
        const z = POND.cz + Math.sin(a) * POND.rz;
        // (the ellipse's outward normal)
        const nx0 = Math.cos(a) / POND.rx;
        const nz0 = Math.sin(a) / POND.rz;
        const l = Math.hypot(nx0, nz0);
        const dock = x > -257 && x < -247 && z < -85;
        return { x, z, nx: nx0 / l, nz: nz0 / l, k: dock ? 0 : 0.8 + 0.35 * lump(i * 1.4) };
      });
      ridge(
        shore,
        st,
        [
          [-1.6, -1],
          [-0.7, 0.22],
          [0.3, 0.4],
          [1.4, -1],
        ],
        (x, z) => Math.max(groundAt(x, z), POND_LEVEL + 0.1),
      );
      this.add(shore.build(), this.lambert());
      // the dock: planks on posts, a canoe turned over under snow
      const d = new G();
      const dx0 = -253.5;
      const dx1 = -250.5;
      const y = POND_LEVEL + 0.55;
      for (let z = -98; z < -84; z += 0.45)
        d.color(z % 0.9 < 0.45 ? 0x6b5442 : 0x5e4a3b).box(dx0, y, z, dx1, y + 0.12, z + 0.4);
      d.color(0xf1f4f7).box(dx0 + 0.15, y + 0.12, -97.8, dx1 - 0.15, y + 0.2, -84.4);
      for (const z of [-97, -92, -87, -84.4])
        for (const x of [dx0 + 0.15, dx1 - 0.15]) {
          d.color(0x3f342c).box(x - 0.14, POND_LEVEL - 0.3, z - 0.14, x + 0.14, y + 0.55, z + 0.14);
          d.color(0xf1f4f7).box(x - 0.16, y + 0.55, z - 0.16, x + 0.16, y + 0.66, z + 0.16); // snow capping it
        }
      // a ladder down to the ice at its end, a mooring cleat
      for (const x of [dx0 + 1, dx1 - 1]) d.color(0x3f342c).box(x - 0.04, POND_LEVEL, -84.5, x + 0.04, y + 0.12, -84.4);
      for (let yy = POND_LEVEL + 0.2; yy < y; yy += 0.3)
        d.color(0x3f342c).box(dx0 + 1, yy, -84.48, dx1 - 1, yy + 0.05, -84.42);
      d.color(0x2a2e33).box(dx0 + 0.3, y + 0.12, -90.2, dx0 + 0.7, y + 0.22, -90.0);
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

  // ── the parking lot (docs/plan/42-the-lot.md): the stills draw the new one whole from the
  // shared layout; the game (stream) the ground floor's own, with its banks and cover ──
  private lot() {
    const l = lotLayout(18);
    if (!this.near((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2, 40)) return;
    // (in the game the ground floor draws its asphalt, its cars and lamp posts: stills only)
    if (!this.o.stream) this.lotFloor(l);
    // the roads' weather over the driven asphalt (not the dump's strip nor the pavement)
    {
      const c = new G().color(0xffffff);
      const [x0, x1] = [l.dump.x1, l.pavement.x0];
      // (a little past the lot's north and south edges: up over the floor, seen at a slant its edge
      // parted from the floor's and a strip of bare asphalt showed, a dark line; east and west the
      // kerbs cover it)
      const [z0, z1] = [l.z0 - 0.4, l.z1 + 0.4];
      c.quad([x0, 0.12, z0], [x1, 0.12, z0], [x1, 0.12, z1], [x0, 0.12, z1], [0, 1, 0]);
      const m = this.keep(new MeshLambertMaterial({ color: 0xffffff }));
      // (it lies on the ground floor's asphalt: lit as that is, by its light map — its lamps' pools
      // — not the land's: the game's view sees to it, sky.ts)
      m.userData.onFloor = true;
      lotCover(m, {
        aisles: l.aisles,
        cross: [(l.cross[0].z0 + l.cross[0].z1) / 2, (l.cross[1].z0 + l.cross[1].z1) / 2],
      });
      // (its weather is a Grounds patch: the game's view.ts puts every one on — light3d.ts
      // patchGrounds; a still has this one put on by itself, unlit by the land's light)
      if (!this.o.stream) {
        const own = m.userData.grounds as { patch: (sh: unknown) => void };
        m.onBeforeCompile = (sh) => own.patch(sh);
        m.customProgramCacheKey = () => "yutopia-lot-cover-still";
      }
      this.add(c.build(), m, "receive");
    }
    // its kerbs, islands, pavement, snow and sign (the game's cars come and go: no snow in its
    // empty bays there yet)
    const d = lotDressing(l, this.o.stream ? null : [...l.cars, ...(this.o.parked ?? [])]);
    this.add(d.solid, this.lambert());
    this.add(d.snow, this.lambert());
    const st = this.keep(tex(lotSignCanvas(this.T), false));
    this.add(d.sign, this.lambert(0xffffff, st, false), "none");
  }

  /** The lot's floor as a still draws it (the game's is the ground floor's own): the asphalt
   *  painted, the seeded cars under snow, the lamps, the path to the doors. */
  private lotFloor(l: ReturnType<typeof lotLayout>) {
    // the asphalt, painted
    const t = this.keep(tex(lotPaintCanvas(this.T, l, 20), false));
    const a = new G();
    a.quad(
      [l.x0, 0.03, l.z0],
      [l.x1, 0.03, l.z0],
      [l.x1, 0.03, l.z1],
      [l.x0, 0.03, l.z1],
      [0, 1, 0],
      [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    );
    this.add(a.build(), this.lambert(0xffffff, t, false), "receive");
    // the cars, under snow
    const solids: BufferGeometry[] = [];
    const glass: BufferGeometry[] = [];
    for (const c of l.cars) {
      const { solid, glass: gl } = carGeometry(c.wagon, CAR_COLOURS[c.colour], c.snowy);
      const ry = (c.dir > 0 ? 0 : Math.PI) + c.tilt;
      solids.push(place(solid, c.x, 0.03, c.z, ry));
      glass.push(place(gl, c.x, 0.03, c.z, ry));
    }
    this.add(mergeGeometries(solids, false), this.lambert());
    this.add(mergeGeometries(glass, false), this.lambert(0x9aa6ae), "cast");
    for (const g of [...solids, ...glass]) g.dispose();
    for (const m of l.lamps) this.lampAt(m.x, m.z, m.rot === 0 ? 0 : Math.PI, "cobra");
    // the cleared path from the pavement to the doors
    const p = new G().color(0xbab9b4);
    p.quad([l.pavement.x1, 0.035, 16], [0, 0.035, 16], [0, 0.035, 20], [l.pavement.x1, 0.035, 20], [0, 1, 0]);
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
    this.settle(b);
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
    const wallC =
      b.sign === "BAR" ? 0x4a3426 : b.kind === "barn" ? 0x6a4a34 : b.kind === "farmhouse" ? 0xd8c9a8 : 0xe6e0d4;
    // (the farm's: as tall as they are outside — under their roofs, not open to the sky)
    const H = b.kind === "barn" ? 5.2 : b.kind === "farmhouse" ? 3.0 : 2.7;
    const doorH = b.kind === "barn" ? 2.8 : 2.4; // (as high as the doorway outside: tp barn(), farmhouse())
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
    // over the doorway, when the walls go higher than it
    if (H > doorH + 0.2) {
      const d = i.door;
      for (let u = d.from; u < d.to; u++) {
        if (d.dir === "h") {
          const z = d.at === b.z0 ? b.z0 + e : b.z1 - e;
          const n: V = d.at === b.z0 ? [0, 0, 1] : [0, 0, -1];
          g.quad([u, y0 + doorH, z], [u + 1, y0 + doorH, z], [u + 1, y0 + H, z], [u, y0 + H, z], n);
        } else {
          const x = d.at === b.x0 ? b.x0 + e : b.x1 - e;
          const n: V = d.at === b.x0 ? [1, 0, 0] : [-1, 0, 0];
          g.quad([x, y0 + doorH, u], [x, y0 + doorH, u + 1], [x, y0 + H, u + 1], [x, y0 + H, u], n);
        }
      }
    }
    // the barn's roof from below: the underside of its slopes, its gable ends, the trusses (they
    // face down: a camera above them still sees in). (The farmhouse has none: its room's too low for
    // the camera over your shoulder to be under a ceiling — as the town's, it's open above.)
    if (b.kind === "barn") {
      const zm = (b.z0 + b.z1) / 2;
      const top = y0 + H;
      const ridge = top + 4.2;
      g.color(0x5a3e2c);
      g.quad([b.x1, top, b.z0 + e], [b.x0, top, b.z0 + e], [b.x0, ridge, zm], [b.x1, ridge, zm], [0, -1, 0.6]);
      g.quad([b.x0, top, b.z1 - e], [b.x1, top, b.z1 - e], [b.x1, ridge, zm], [b.x0, ridge, zm], [0, -1, -0.6]);
      g.color(wallC);
      g.quad([b.x0 + e, top, b.z1], [b.x0 + e, top, b.z0], [b.x0 + e, ridge, zm], [b.x0 + e, ridge, zm], [1, 0, 0]);
      g.quad([b.x1 - e, top, b.z0], [b.x1 - e, top, b.z1], [b.x1 - e, ridge, zm], [b.x1 - e, ridge, zm], [-1, 0, 0]);
      // trusses: a tie beam across, two rafters up to the ridge, a king post
      g.color(0x4a3426);
      for (let x = b.x0 + 3; x < b.x1 - 1; x += 4) {
        g.box(x - 0.1, top - 0.2, b.z0 + 0.1, x + 0.1, top, b.z1 - 0.1);
        g.box(x - 0.08, top, zm - 0.08, x + 0.08, ridge - 0.1, zm + 0.08);
        for (let k = 0; k < 8; k++) {
          const u = (k + 0.5) / 8;
          for (const [za, zb] of [
            [b.z0 + 0.2, zm],
            [b.z1 - 0.2, zm],
          ]) {
            const z = za + (zb - za) * u;
            const y = top + (ridge - top) * u - 0.25;
            g.box(x - 0.08, y - 0.12, z - 0.35, x + 0.08, y + 0.12, z + 0.35);
          }
        }
      }
      g.box(b.x0, ridge - 0.35, zm - 0.12, b.x1, ridge - 0.1, zm + 0.12);
      // the hay loft over the east end: its floor, a ladder up to it
      g.color(0x6d5a44).box(b.x1 - 6, top - 2.2, b.z0 + 0.15, b.x1 - 0.15, top - 2.0, b.z1 - 0.15);
      g.color(0xc9a95a).box(b.x1 - 5.5, top - 2.0, b.z0 + 1, b.x1 - 0.5, top - 1.2, b.z0 + 6);
      g.color(0x5a4636);
      for (const dz of [-0.35, 0.35]) g.box(b.x1 - 6.4, y0, zm + dz - 0.05, b.x1 - 6.3, top - 2.0, zm + dz + 0.05);
      for (let y = y0 + 0.4; y < top - 2.1; y += 0.4) g.box(b.x1 - 6.4, y, zm - 0.35, b.x1 - 6.3, y + 0.06, zm + 0.35);
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
        case "locker":
          // two doors, a gap between, louvres up top, a handle each
          g.color(0x4f5a52).box(x, y0, z, x + w, y0 + h, z + d);
          g.color(0x2b2f2c).box(x + w / 2 - 0.015, y0 + 0.05, z + d, x + w / 2 + 0.015, y0 + h - 0.05, z + d + 0.01);
          for (let k = 0; k < 3; k++)
            for (const u of [x + 0.1, x + w / 2 + 0.1])
              g.color(0x3a423d).box(
                u,
                y0 + h - 0.35 + k * 0.07,
                z + d,
                u + w / 2 - 0.2,
                y0 + h - 0.32 + k * 0.07,
                z + d + 0.01,
              );
          for (const u of [x + w / 2 - 0.09, x + w / 2 + 0.06])
            g.color(0xa7a9ad).box(u, y0 + 0.95, z + d, u + 0.03, y0 + 1.1, z + d + 0.03);
          break;
        case "screens":
          glow.push([x, y0 + 0.85, z, x + 0.06, y0 + h, z + d, 0x9fd2c0]);
          break;
        // the barn's: hay stacked in bales, the stalls' boards, the workbench and its tools
        case "hay":
          for (let k = 0; k < h - 0.05; k += 0.5)
            for (let u = x; u < x + w - 0.05; u += 1.25)
              g.color(k % 1 < 0.25 ? 0xc9a95a : 0xbf9e50).box(
                u + 0.03,
                y0 + k,
                z + 0.03,
                Math.min(x + w, u + 1.2),
                y0 + Math.min(h, k + 0.48),
                z + d - 0.03,
              );
          break;
        case "stall":
          for (let k = 0; k < 4; k++)
            g.color(0x7a5a3e).box(x, y0 + 0.15 + k * 0.3, z, x + w, y0 + 0.4 + k * 0.3, z + d);
          g.color(0x5a4636).box(x, y0, z, x + w, y0 + h, z + 0.12);
          break;
        // the farmhouse's
        case "stove":
          g.color(0x2b2a26).box(x, y0, z, x + w, y0 + h, z + d);
          g.color(0x3a3a38).box(x - 0.02, y0 + h, z + 0.05, x + w - 0.05, y0 + h + 0.03, z + d - 0.05);
          for (const [u, v] of [
            [0.25, 0.25],
            [0.25, 0.65],
            [0.55, 0.25],
            [0.55, 0.65],
          ])
            g.color(0x111111).box(x + u - 0.1, y0 + h + 0.03, z + v - 0.1, x + u + 0.1, y0 + h + 0.05, z + v + 0.1);
          g.color(0x8a8f94).box(x - 0.03, y0 + 0.2, z + 0.1, x, y0 + h - 0.15, z + d - 0.1); // the oven's door
          g.color(0x4a4a46).box(x + 0.25, y0 + h, z + d - 0.25, x + 0.35, y0 + h + 1.6, z + d - 0.15); // its pipe
          break;
        case "sofa":
          g.color(0x6b4a3a).box(x, y0 + 0.15, z, x + w, y0 + 0.45, z + d);
          g.color(0x6b4a3a).box(x, y0 + 0.45, z, x + 0.25, y0 + h, z + d);
          g.color(0x5a3c2e).box(x, y0 + 0.45, z, x + w, y0 + 0.65, z + 0.2);
          g.color(0x5a3c2e).box(x, y0 + 0.45, z + d - 0.2, x + w, y0 + 0.65, z + d);
          for (let k = 0; k < 3; k++)
            g.color(0x7d5844).box(
              x + 0.3,
              y0 + 0.45,
              z + 0.25 + k * ((d - 0.5) / 3),
              x + w - 0.05,
              y0 + 0.55,
              z + 0.2 + (k + 1) * ((d - 0.5) / 3),
            );
          g.color(0x2a2420).box(x + 0.05, y0, z + 0.05, x + w - 0.05, y0 + 0.15, z + d - 0.05);
          g.color(0xb9a77a).box(x + 0.3, y0 + 0.55, z + 0.4, x + 0.55, y0 + 0.85, z + 0.9); // a cushion
          break;
        case "armchair":
          g.color(0x2f4a3b).box(x, y0 + 0.15, z, x + w, y0 + 0.45, z + d);
          g.color(0x2f4a3b).box(x, y0 + 0.45, z + d - 0.25, x + w, y0 + h, z + d);
          g.color(0x27402f).box(x, y0 + 0.45, z, x + 0.2, y0 + 0.65, z + d);
          g.color(0x27402f).box(x + w - 0.2, y0 + 0.45, z, x + w, y0 + 0.65, z + d);
          g.color(0x2a2420).box(x + 0.05, y0, z + 0.05, x + w - 0.05, y0 + 0.15, z + d - 0.05);
          break;
        case "coffee":
          g.color(0x6a4a34).box(x, y0 + h - 0.06, z, x + w, y0 + h, z + d);
          for (const [u, v] of [
            [0.08, 0.08],
            [w - 0.14, 0.08],
            [0.08, d - 0.14],
            [w - 0.14, d - 0.14],
          ])
            g.color(0x4a3426).box(x + u, y0, z + v, x + u + 0.06, y0 + h - 0.06, z + v + 0.06);
          g.color(0xe8e4dc).box(x + 0.3, y0 + h, z + 0.4, x + 0.6, y0 + h + 0.1, z + 0.7); // a mug
          break;
        case "rug":
          g.color(0x8a3b2e).box(x, y0 + 0.03, z, x + w, y0 + 0.05, z + d);
          g.color(0xc9a95a).box(x + 0.25, y0 + 0.05, z + 0.25, x + w - 0.25, y0 + 0.055, z + d - 0.25);
          g.color(0x8a3b2e).box(x + 0.45, y0 + 0.055, z + 0.45, x + w - 0.45, y0 + 0.06, z + d - 0.45);
          break;
        case "fireplace":
          g.color(0x8a6a5a).box(x, y0, z, x + w, y0 + h, z + d);
          g.color(0x7a5a4a).box(x + 0.6, y0 + h, z + 0.15, x + w - 0.6, y0 + 3.0, z + d);
          g.color(0x5a4636).box(x - 0.15, y0 + h - 0.05, z - 0.1, x + w + 0.15, y0 + h + 0.08, z + d); // the mantel
          g.color(0x1a1412).box(x + 0.5, y0 + 0.1, z - 0.02, x + w - 0.5, y0 + 0.95, z + 0.1);
          glow.push([x + 0.65, y0 + 0.12, z - 0.03, x + w - 0.65, y0 + 0.4, z - 0.01, 0xff7a2a]); // the embers
          g.color(0x3a2a20).box(x + 0.7, y0 + 0.12, z + 0.05, x + w - 0.7, y0 + 0.25, z + 0.3); // the logs
          g.color(0xc9b28a).box(x + 0.4, y0 + h + 0.08, z + 0.2, x + 0.6, y0 + h + 0.4, z + 0.4); // a candle
          break;
        case "bookshelf":
          g.color(0x5a3e2c).box(x, y0, z, x + w, y0 + h, z + d);
          for (let k = 0.15; k < h - 0.2; k += 0.45)
            for (let u = x + 0.08; u < x + w - 0.12; u += 0.11) {
              const r = Math.sin(u * 91.7 + k * 13.3) * 43758.5453;
              const q = r - Math.floor(r);
              if (q < 0.1) continue;
              const c = [0x6b2430, 0x2f4a3b, 0x3d4a5c, 0xc39a4a, 0xe8e4dc, 0x5a3e2c][Math.floor(q * 6)];
              g.color(c).box(u, y0 + k, z + d, u + 0.09, y0 + k + 0.28 + q * 0.08, z + d + 0.02);
            }
          break;
        case "bed":
          g.color(0x5a3e2c).box(x, y0, z, x + w, y0 + 0.35, z + d);
          g.color(0xe8e4dc).box(x + 0.05, y0 + 0.35, z + 0.05, x + w - 0.05, y0 + 0.5, z + d - 0.05);
          g.color(0x6b8aa8).box(x + 0.02, y0 + 0.5, z + 0.8, x + w - 0.02, y0 + 0.58, z + d - 0.02); // the quilt
          for (const u of [0.25, w / 2 + 0.05])
            g.color(0xf4f1ea).box(x + u, y0 + 0.5, z + 0.15, x + u + w / 2 - 0.35, y0 + 0.65, z + 0.65);
          g.color(0x4a3426).box(x, y0, z - 0.1, x + w, y0 + 1.1, z + 0.05); // the headboard
          break;
        case "nightstand":
          g.color(0x5a3e2c).box(x, y0, z, x + w, y0 + h, z + d);
          g.color(0x3a2a20).box(x + 0.05, y0 + h * 0.5, z - 0.01, x + w - 0.05, y0 + h * 0.52, z);
          g.color(0xe8d8b0).box(x + 0.15, y0 + h, z + 0.15, x + 0.35, y0 + h + 0.35, z + 0.35); // a lamp, unlit
          break;
        case "wardrobe":
          g.color(0x5a3e2c).box(x, y0, z, x + w, y0 + h, z + d);
          g.color(0x3a2a20).box(x + w / 2 - 0.01, y0 + 0.1, z - 0.01, x + w / 2 + 0.01, y0 + h - 0.1, z);
          for (const u of [w / 2 - 0.12, w / 2 + 0.08])
            g.color(0xc9a24a).box(x + u, y0 + 1.0, z - 0.03, x + u + 0.04, y0 + 1.2, z);
          break;
        case "bench":
          g.color(0x5a4636).box(x, y0 + h - 0.1, z, x + w, y0 + h, z + d);
          for (const u of [x + 0.1, x + w - 0.2])
            g.color(0x4a3a2c).box(u, y0, z + 0.1, u + 0.1, y0 + h - 0.1, z + d - 0.1);
          g.color(0x8a8f94).box(x + 0.4, y0 + h, z + 0.2, x + 0.9, y0 + h + 0.2, z + 0.6);
          g.color(0x2f5d8a).box(x + 1.6, y0 + h, z + 0.25, x + 2.3, y0 + h + 0.25, z + 0.7);
          g.color(0x6a4a34).box(x, y0 + 1.6, z, x + w, y0 + 2.3, z + 0.06); // the pegboard
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
  /** What settled round a building: drifts banked against its walls (but its front where it
   *  meets a pavement, a porch or the water, and its doors), its windows' sills. */
  private settle(b: Building) {
    this.flushWindows();
    const g = this.trim;
    this.trim = new G();
    if (!["hq", "block", "silo", "shelter", "gas"].includes(b.kind)) {
      const r = groundsRng(Math.round(b.x0 * 17 + b.z0 * 5 + 11));
      const keepFront = b.kind === "church" || b.kind === "barn";
      const sides: [number, number, number, number, number, number, string][] = [
        [b.x0, b.z0, b.x1, b.z0, 0, -1, "n"],
        [b.x0, b.z1, b.x1, b.z1, 0, 1, "s"],
        [b.x0, b.z0, b.x0, b.z1, -1, 0, "w"],
        [b.x1, b.z0, b.x1, b.z1, 1, 0, "e"],
      ];
      const small = b.x1 - b.x0 < 8 || b.z1 - b.z0 < 8;
      for (const [ax, az, bx, bz, nx, nz, side] of sides) {
        if (side === b.face && !keepFront) continue;
        // (the door, in the middle of its face)
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        const gap = Math.min(5.5, Math.hypot(bx - ax, bz - az) * 0.3);
        driftAlong(g, [ax, az], [bx, bz], [nx, nz], groundAt, r, {
          h: small ? 0.4 : 0.55 + r() * 0.25,
          w: small ? 1.0 : 1.5,
          skip: side === b.face ? (x, z) => Math.hypot(x - mx, z - mz) < gap : undefined,
        });
      }
    }
    if (!g.empty) this.add(g.build(), this.lambert());
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
      case "barn":
        return this.barn(b);
      case "silo":
        return this.silo(b);
      case "farmhouse":
        return this.farmhouse(b);
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
    // drifts at the foot of the walls (open at the doors)
    const dg = new G();
    const rd = groundsRng(b.z1 * 13 + 5);
    const skip = (x: number, z: number) => this.isDoor(b, x, z);
    for (const [ax, az, bx, bz, nx, nz] of [
      [b.x0, b.z0, b.x1, b.z0, 0, -1],
      [b.x0, b.z1, b.x1, b.z1, 0, 1],
      [b.x0, b.z0, b.x0, b.z1, -1, 0],
      [b.x1, b.z0, b.x1, b.z1, 1, 0],
    ])
      driftAlong(dg, [ax, az], [bx, bz], [nx, nz], () => y0, rd, { h: 0.7, w: 2.0, skip });
    this.add(dg.build(), this.lambert());
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
  /** A glass bridge across the courtyard at the studio's level: the headquarters' east wall
   *  to the east block's west one (it stopped in mid-air when the block moved east). */
  private courtyardBridge() {
    const east = BUILDINGS.find((b) => b.key === "east");
    const hq = BUILDINGS.find((b) => b.key === "hq");
    if (!east || !hq) return;
    const a = Math.max(hq.x1, this.o.hqEast ?? hq.x1) + 0.1;
    const b = east.x0 - 0.1;
    if (b - a < 1 || !this.near((a + b) / 2, 18, 30)) return;
    const y = 14;
    const g = new G();
    g.color(0xe3e6ea).box(a, y + 2.9, 16.4, b, y + 3.15, 19.6);
    g.color(0xf6f8fa).box(a, y + 3.15, 16.4, b, y + 3.35, 19.6);
    g.color(0xd3d6da).box(a, y - 0.35, 16.4, b, y, 19.6);
    // mullions every 2 tiles along both sides
    for (let x = a + 2; x < b - 0.5; x += 2) {
      g.color(0x9aa3ad).box(x - 0.06, y, 16.38, x + 0.06, y + 2.9, 16.5);
      g.color(0x9aa3ad).box(x - 0.06, y, 19.5, x + 0.06, y + 2.9, 19.62);
    }
    this.add(g.build(), this.lambert());
    const gl = new G().color(0x7f95a6);
    gl.quad([a, y, 16.45], [b, y, 16.45], [b, y + 2.9, 16.45], [a, y + 2.9, 16.45], [0, 0, -1]);
    gl.quad([a, y, 19.55], [b, y, 19.55], [b, y + 2.9, 19.55], [a, y + 2.9, 19.55], [0, 0, 1]);
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
  /** A pitched roof over (x0, z0)–(x1, z1) at y, its ridge `rise` up (along x when `alongX`):
   *  boards with an edge to them (a soffit under the overhang, a fascia along the eaves, rake
   *  boards up the gables), the snow settled on it with a lip over the eaves and icicles, the
   *  gables in the walls' colour. */
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
    gable = 0xd9d4c9,
  ) {
    const r = groundsRng(Math.round(x0 * 7 + z0 * 13 + 3));
    const xm = (x0 + x1) / 2;
    const zm = (z0 + z1) / 2;
    const trim = 0xe6e1d6;
    const soffit = new Color(roof).multiplyScalar(0.7).getHex();
    // (in the roof's frame: u along the ridge, v across it; back to x, z)
    const P = (u: number, yy: number, v: number): V => (alongX ? [u, yy, v] : [v, yy, u]);
    const [u0, u1] = alongX ? [x0 - over, x1 + over] : [z0 - over, z1 + over];
    const [v0, v1, vm] = alongX ? [z0, z1, zm] : [x0, x1, xm];
    for (const [va, vw, s] of [
      [v0 - over, v0, -1],
      [v1 + over, v1, 1],
    ] as const) {
      const out: V = P(0, 0, s);
      g.color(roof);
      face(g, P(u0, y, va), P(u1, y, va), P(u1, y + rise, vm), P(u0, y + rise, vm), [out[0] * 0.6, 1, out[2] * 0.6]);
      // the soffit under the overhang, the fascia board along the eave
      g.color(soffit);
      face(g, P(u0, y - 0.15, va), P(u1, y - 0.15, va), P(u1, y - 0.15, vw), P(u0, y - 0.15, vw), [0, -1, 0]);
      g.color(trim);
      face(g, P(u0, y - 0.17, va), P(u1, y - 0.17, va), P(u1, y + 0.03, va), P(u0, y + 0.03, va), out);
      // rake boards up both gables
      for (const [u, k] of [
        [u0, -1],
        [u1, 1],
      ] as const)
        face(
          g,
          P(u, y - 0.17, va),
          P(u, y - 0.17 + rise, vm),
          P(u, y + 0.03 + rise, vm),
          P(u, y + 0.03, va),
          P(k, 0, 0),
        );
      // the snow on this side
      slopeSnow(
        g,
        P(u0 + 0.06, y + rise, vm),
        P(u1 - 0.06, y + rise, vm),
        P(u0 + 0.06, y, va),
        P(u1 - 0.06, y, va),
        0.24,
        r,
        0.55,
      );
    }
    g.color(gable);
    for (const u of alongX ? [x0, x1] : [z0, z1]) {
      const k = u === (alongX ? x0 : z0) ? -1 : 1;
      face(g, P(u, y, v0), P(u, y, v1), P(u, y + rise, vm), P(u, y + rise, vm), P(k, 0, 0));
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
    sill = true,
  ) {
    if (sill) {
      // a sill under it (the window's planes face along x or z), snow lying on the sill
      const a = w / 2 + 0.12;
      const [xa, xb] = nz ? [x - a, x + a] : [x + Math.min(0, nx * 0.18), x + Math.max(0, nx * 0.18)];
      const [za, zb] = nz ? [z + Math.min(0, nz * 0.18), z + Math.max(0, nz * 0.18)] : [z - a, z + a];
      this.trim.color(0xd6d0c4).box(xa, y - 0.12, za, xb, y, zb);
      const i = 0.04;
      this.trim
        .color(SNOW)
        .box(
          xa + (nz ? i : 0),
          y,
          za + (nz ? 0 : i),
          xb - (nz ? i : 0),
          y + 0.05 + 0.03 * Math.abs(Math.sin(x * 12.9 + z * 7.3)),
          zb - (nz ? 0 : i),
        );
    }
    // (a building's windows are one mesh a kind of light: hundreds of little meshes, drawn
    // the first time all at once, were a long frame on the way into the town)
    const g = this.windows(warm, on);
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
  }
  private winBatch = new Map<string, G>();
  private windows(warm: boolean, on: number): G {
    const k = `${warm}|${on}`;
    let g = this.winBatch.get(k);
    if (!g) {
      g = new G().color(0xffffff);
      this.winBatch.set(k, g);
    }
    return g;
  }
  private winMats = new Map<string, MeshLambertMaterial>();
  private flushWindows() {
    for (const [k, g] of this.winBatch) {
      let m = this.winMats.get(k);
      if (!m) {
        const [warm, on] = k.split("|");
        m = this.keep(
          new MeshLambertMaterial({
            color: 0x2c3540,
            emissive: warm === "true" ? 0xffc87a : 0xbcd2ea,
            emissiveIntensity: 0,
          }),
        );
        this.glows(m, Number(on), "windows");
        this.winMats.set(k, m);
      }
      if (!g.empty) this.add(g.build(), m, "none");
    }
    this.winBatch.clear();
  }
  /** A wall's picture, one per colour (the town's houses share theirs). */
  private wallTex = new Map<string, Texture>();
  private wallPic(kind: "siding" | "brick", hex: string, seed = 0): Texture {
    const k = `${kind}|${hex}`;
    let t = this.wallTex.get(k);
    if (!t) {
      t = this.keep(tex(kind === "brick" ? brickCanvas(this.T, hex, seed) : sidingCanvas(this.T, hex)));
      this.wallTex.set(k, t);
    }
    return t;
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
    flatSnow(g, b.x0 - 0.58, b.z0 - 0.58, b.x1 + 0.58, b.z1 + 0.58, y0 + 2.95, 0.3, groundsRng(b.x0 * 3 + 1));
    icicles(g, [b.x0 - 0.6, y0 + 2.6, b.z1 + 0.6], [b.x1 + 0.6, y0 + 2.6, b.z1 + 0.6], groundsRng(b.z0 * 3), 0.6);
    // a fascia round the roof, mullions at the corners and halfway along, the door on the west
    // face, a camera on the roof's corner, a floodlight on a pole
    g.color(0x3a4048).box(b.x0 - 0.62, y0 + 2.55, b.z0 - 0.62, b.x1 + 0.62, y0 + 2.75, b.z1 + 0.62);
    const xm = (b.x0 + b.x1) / 2;
    const zm = (b.z0 + b.z1) / 2;
    g.color(0x2a3036);
    for (const x of [xm]) {
      g.box(x - 0.05, y0 + 1, b.z0 - 0.04, x + 0.05, y0 + 2.6, b.z0 + 0.04);
      g.box(x - 0.05, y0 + 1, b.z1 - 0.04, x + 0.05, y0 + 2.6, b.z1 + 0.04);
    }
    for (const z of [zm - 1.5, zm + 1.5]) g.box(b.x1 - 0.04, y0 + 1, z - 0.05, b.x1 + 0.04, y0 + 2.6, z + 0.05);
    g.color(0x2a3036).box(b.x0 - 0.06, y0, zm - 0.6, b.x0 + 0.04, y0 + 2.4, zm + 0.6); // the door
    g.color(0xc9a85a).box(b.x0 - 0.1, y0 + 1.05, zm + 0.35, b.x0 - 0.06, y0 + 1.15, zm + 0.45);
    for (let k = 0; k < 2; k++)
      g.color(0xb7b0a2).box(b.x0 - 0.9 + k * 0.3, y0, zm - 0.8, b.x0, y0 + 0.18 * (k + 1), zm + 0.8);
    g.color(0x2a2e33).box(b.x0 - 0.3, y0 + 2.95, b.z0 - 0.3, b.x0 + 0.1, y0 + 3.25, b.z0 + 0.1);
    g.color(0x2a2e33).box(b.x0 - 0.75, y0 + 3.0, b.z0 - 0.45, b.x0 - 0.1, y0 + 3.25, b.z0 - 0.2); // the camera
    beam(g, [b.x1 + 1.2, y0, b.z0 - 1.2], [b.x1 + 1.2, y0 + 5.5, b.z0 - 1.2], 0.14, 0x5d6268);
    g.color(0x2a2e33).box(b.x1 + 0.9, y0 + 5.3, b.z0 - 1.6, b.x1 + 1.5, y0 + 5.7, b.z0 - 1.0);
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
    // its housing on a plinth, the pivot, the counterweight behind it
    bar.color(0x9a9690).box(px - 0.45, py - 0.1, pz - 0.45, px + 0.45, py + 0.15, pz + 0.45);
    bar.color(0xd8a62a).box(px - 0.3, py + 0.15, pz - 0.3, px + 0.3, py + 1.1, pz + 0.3);
    bar.color(0x2a2e33).box(px - 0.32, py + 0.6, pz - 0.32, px + 0.32, py + 0.68, pz + 0.32);
    bar.color(0x3a3e44).box(px - 0.12, py + 0.95, pz - 0.38, px + 0.12, py + 1.15, pz + 0.38);
    bar.color(0x3a3e44).box(px + 0.3, py + 0.9, pz - 0.15, px + 0.9, py + 1.2, pz + 0.15);
    flatSnow(bar, px - 0.3, pz - 0.3, px + 0.3, pz + 0.3, py + 1.1, 0.1, groundsRng(7));
    // the boom: red and white, a skirt hanging under it, the rest post at its end
    for (let k = 0; k < 8; k++)
      bar
        .color(k % 2 ? 0xf2f2f2 : 0xc8322a)
        .box(px - 0.3 - (k + 1) * 0.95, py + 0.98, pz - 0.06, px - 0.3 - k * 0.95, py + 1.1, pz + 0.06);
    bar.color(0xf4f7fa).box(px - 7.9, py + 1.1, pz - 0.05, px - 0.4, py + 1.15, pz + 0.05);
    for (let x = px - 1; x > px - 7.9; x -= 0.35)
      bar.color(0xe9e6dc).box(x - 0.02, py + 0.55, pz - 0.015, x + 0.02, py + 0.98, pz + 0.015);
    bar.color(0x8e9399).box(-44.6, py, pz - 0.12, -44.2, py + 0.85, pz + 0.12);
    bar.color(0x8e9399).box(-44.6, py + 0.85, pz - 0.22, -44.2, py + 1.0, pz - 0.12);
    bar.color(0x8e9399).box(-44.6, py + 0.85, pz + 0.12, -44.2, py + 1.0, pz + 0.22);
    this.add(bar.build(), this.lambert());
    // its warning light, lit after dark
    const wl = new G().color(0xffffff);
    wl.box(px - 0.1, py + 1.15, pz - 0.1, px + 0.1, py + 1.3, pz + 0.1);
    this.add(
      wl.build(),
      this.glows(
        this.keep(new MeshLambertMaterial({ color: 0x5a1a14, emissive: 0xff3a1a, emissiveIntensity: 0 })),
        1.2,
        "lamp",
      ),
      "none",
    );
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
    posts = true,
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
    if (!posts) return;
    const legs = new G().color(0x3a3e44);
    const tx = Math.cos(ry);
    const tz = -Math.sin(ry);
    for (const s of [-1, 1]) {
      const px = x + tx * s * (w / 2 - 0.2);
      const pz = z + tz * s * (w / 2 - 0.2);
      legs.box(px - 0.06, y0, pz - 0.06, px + 0.06, y0 + up + h, pz + 0.06);
    }
    this.add(legs.build(), this.lambert());
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
    this.pitched(roof, b.x0, b.z0, b.x1, b.z1, y0 + H, 2.4, true, 0x3b3530, 0.5, 0x6e2a22);
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
    r.color(0x5d6267).box(b.x0 - 0.4, y0 + H - 0.05, b.z0 - 0.4, b.x1 + 0.4, y0 + H + 0.15, b.z1 + 0.4);
    flatSnow(r, b.x0 - 0.38, b.z0 - 0.38, b.x1 + 0.38, b.z1 + 0.38, y0 + H + 0.15, 0.4, groundsRng(b.x0 * 5 + 2));
    icicles(r, [b.x0 - 0.4, y0 + H - 0.05, b.z0 - 0.4], [b.x1 + 0.4, y0 + H - 0.05, b.z0 - 0.4], groundsRng(b.z1), 0.5);
    // the roll-up door: its slats, its frame, the drum's box over it; a lamp; a side door
    r.color(0x9aa0a6).box(b.x0 + 2, y0, b.z0 - 0.06, b.x0 + 7, y0 + 3.2, b.z0 + 0.02);
    for (let y = 0.2; y < 3.2; y += 0.22)
      r.color(0x868c92).box(b.x0 + 2, y0 + y, b.z0 - 0.09, b.x0 + 7, y0 + y + 0.04, b.z0 - 0.06);
    r.color(0x5d6267).box(b.x0 + 1.8, y0, b.z0 - 0.12, b.x0 + 2, y0 + 3.4, b.z0 + 0.02);
    r.color(0x5d6267).box(b.x0 + 7, y0, b.z0 - 0.12, b.x0 + 7.2, y0 + 3.4, b.z0 + 0.02);
    r.color(0x5d6267).box(b.x0 + 1.8, y0 + 3.2, b.z0 - 0.4, b.x0 + 7.2, y0 + 3.7, b.z0);
    r.color(0x6b4a3a).box(b.x0 + 9, y0, b.z0 - 0.06, b.x0 + 10, y0 + 2.2, b.z0 + 0.02);
    r.color(0x2a2e33).box(b.x0 + 9.3, y0 + 3.0, b.z0 - 0.35, b.x0 + 9.7, y0 + 3.2, b.z0); // its lamp
    r.color(0x6b6f74).box(b.x1 - 4, y0, b.z0 - 3.4, b.x1 - 1, y0 + 0.9, b.z0 - 1.4); // the plough blade
    r.color(0xd8d0c0);
    const salt = tinted(new ConeGeometry(1.6, 1.5, 9).translate(0, 0.75, 0), 0xcfc7b8);
    this.add(r.build(), this.lambert());
    this.add(place(salt, b.x1 + 2, y0, b.z0 + 2), this.lambert());
  }
  // ── the farm (docs/plan/31-the-day.md): the barn, the silo, the farmhouse ──
  // walls as quads round a box, with a gap (a doorway) on one face if asked
  private walls(
    g: G,
    b: { x0: number; z0: number; x1: number; z1: number },
    y0: number,
    H: number,
    gap?: { face: "w" | "e" | "n" | "s"; from: number; to: number; h: number },
  ) {
    const U = (a: number, y: number): [number, number] => [a / 3, y / 3];
    const side = (ax: number, az: number, bx: number, bz: number, ya: number, yb: number, n: V) => {
      const len = Math.hypot(bx - ax, bz - az);
      g.quad([ax, ya, az], [bx, ya, bz], [bx, yb, bz], [ax, yb, az], n, [
        U(0, ya - y0),
        U(len, ya - y0),
        U(len, yb - y0),
        U(0, yb - y0),
      ]);
    };
    const face = (f: "w" | "e" | "n" | "s", ax: number, az: number, bx: number, bz: number, n: V) => {
      if (!gap || gap.face !== f) return side(ax, az, bx, bz, y0, y0 + H, n);
      const alongZ = ax === bx;
      const a = alongZ ? az : ax;
      const c = alongZ ? bz : bx;
      const lo = Math.min(gap.from, gap.to);
      const hi = Math.max(gap.from, gap.to);
      const at = (u: number): [number, number] => (alongZ ? [ax, u] : [u, az]);
      const [p0, p1] = a < c ? [a, c] : [c, a];
      const seg = (u0: number, u1: number, ya: number, yb: number) => {
        const [x0, z0] = at(u0);
        const [x1, z1] = at(u1);
        if (a < c) side(x0, z0, x1, z1, ya, yb, n);
        else side(x1, z1, x0, z0, ya, yb, n);
      };
      seg(p0, lo, y0, y0 + H);
      seg(hi, p1, y0, y0 + H);
      seg(lo, hi, y0 + gap.h, y0 + H);
    };
    face("n", b.x0, b.z0, b.x1, b.z0, [0, 0, -1]);
    face("s", b.x1, b.z1, b.x0, b.z1, [0, 0, 1]);
    face("w", b.x0, b.z1, b.x0, b.z0, [-1, 0, 0]);
    face("e", b.x1, b.z0, b.x1, b.z1, [1, 0, 0]);
  }
  // a window's white frame, its cross and sill, round dark glass (the glass: litWindow), on a face
  // whose outward normal is (nx, nz); (x, z) its middle on the wall, y its foot
  private frame(g: G, x: number, y: number, z: number, w: number, h: number, nx: number, nz: number, trim = 0xece6da) {
    const tx = -nz;
    const tz = nx;
    const o = 0.06;
    const bar = (u0: number, v0: number, u1: number, v1: number, t = 0.09) => {
      const ax = x + tx * u0 + nx * o;
      const az = z + tz * u0 + nz * o;
      const bx = x + tx * u1 + nx * (o + t);
      const bz = z + tz * u1 + nz * (o + t);
      g.box(Math.min(ax, bx), y + v0, Math.min(az, bz), Math.max(ax, bx), y + v1, Math.max(az, bz));
    };
    g.color(trim);
    bar(-w / 2 - 0.1, -0.1, w / 2 + 0.1, 0); // the sill
    bar(-w / 2 - 0.1, h, w / 2 + 0.1, h + 0.12); // the head
    bar(-w / 2 - 0.1, 0, -w / 2, h); // the sides
    bar(w / 2, 0, w / 2 + 0.1, h);
    bar(-0.03, 0, 0.03, h, 0.05); // the cross
    bar(-w / 2, h / 2 - 0.03, w / 2, h / 2 + 0.03, 0.05);
  }
  private barn(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const siding = this.keep(tex(sidingCanvas(this.T, "#8e2b20")));
    const H = 5.2;
    const zm = (b.z0 + b.z1) / 2;
    const K = 3.2; // the gambrel's knee: this far in from each side, 2.8 up
    const i = insideOf(b);
    const door = i?.door;
    const dz0 = door ? door.from - 0.6 : 0;
    const dz1 = door ? door.to + 0.6 : 0;
    const g = new G();
    this.walls(g, b, y0 + 0.6, H - 0.6, door ? { face: "w", from: dz0, to: dz1, h: 2.8 } : undefined);
    // the gable ends: red pentagons (the gambrel's shape), siding on them too
    const P = (x: number, y: number, z: number): V => [x, y, z];
    for (const [x, nx] of [
      [b.x0, -1],
      [b.x1, 1],
    ] as const) {
      const n: V = [nx, 0, 0];
      const a = P(x, y0 + H, b.z0);
      const k0 = P(x, y0 + H + 2.8, b.z0 + K);
      const r = P(x, y0 + H + 4.2, zm);
      const k1 = P(x, y0 + H + 2.8, b.z1 - K);
      const c = P(x, y0 + H, b.z1);
      if (nx < 0) {
        g.quad(c, a, k0, k1, n);
        g.quad(k1, k0, r, r, n);
      } else {
        g.quad(a, c, k1, k0, n);
        g.quad(k0, k1, r, r, n);
      }
    }
    this.add(g.build(), this.lambert(0xffffff, siding, false));
    const r = new G();
    // the stone foundation (the doorway's gap kept)
    r.color(0x8a8780);
    r.box(b.x0 - 0.06, y0, b.z0 - 0.06, b.x1 + 0.06, y0 + 0.6, b.z0 + 0.3);
    r.box(b.x0 - 0.06, y0, b.z1 - 0.3, b.x1 + 0.06, y0 + 0.6, b.z1 + 0.06);
    r.box(b.x1 - 0.3, y0, b.z0, b.x1 + 0.06, y0 + 0.6, b.z1);
    r.box(b.x0 - 0.06, y0, b.z0, b.x0 + 0.3, y0 + 0.6, door ? dz0 : b.z1);
    if (door) r.box(b.x0 - 0.06, y0, dz1, b.x0 + 0.3, y0 + 0.6, b.z1);
    const rs = groundsRng(b.x0 * 3 + 7);
    r.color(0x77746d);
    for (let k = 0; k < 40; k++) {
      const u = rs();
      const side = Math.floor(rs() * 2);
      const x = b.x0 + u * (b.x1 - b.x0);
      const z = side ? b.z0 - 0.08 : b.z1 + 0.02;
      r.box(x, y0 + 0.08 + rs() * 0.35, z, x + 0.3 + rs() * 0.3, y0 + 0.22 + rs() * 0.3, z + 0.06);
    }
    // the gambrel roof: steep low, shallow high, overhanging; snow on it but its dark edge showing
    const over = 0.6;
    const prof: [number, number][] = [
      [b.z0 - over, H - 0.35],
      [b.z0 + K, H + 2.8],
      [zm, H + 4.2],
      [b.z1 - K, H + 2.8],
      [b.z1 + over, H - 0.35],
    ];
    for (let k = 0; k < 4; k++) {
      const [za, ya] = prof[k];
      const [zb, yb] = prof[k + 1];
      const dz = zb - za;
      const dy = yb - ya;
      const l = Math.hypot(dz, dy);
      const n: V = [0, Math.abs(dz) / l, ((k < 2 ? -1 : 1) * Math.abs(dy)) / l];
      r.color(0x3d3a36);
      r.quad(
        [b.x1 + over, y0 + ya, za],
        [b.x0 - over, y0 + ya, za],
        [b.x0 - over, y0 + yb, zb],
        [b.x1 + over, y0 + yb, zb],
        n,
      );
      r.color(0xf4f7fa);
      r.quad(
        [b.x1 + over - 0.15, y0 + ya + 0.16, za + (k < 2 ? 0.15 : -0.15)],
        [b.x0 - over + 0.15, y0 + ya + 0.16, za + (k < 2 ? 0.15 : -0.15)],
        [b.x0 - over + 0.15, y0 + yb + 0.16, zb],
        [b.x1 + over - 0.15, y0 + yb + 0.16, zb],
        n,
      );
    }
    // white trim: the corners, the eaves' fascia, the gables' rake boards
    const t = 0xece6da;
    r.color(t);
    for (const [x, z] of [
      [b.x0, b.z0],
      [b.x1, b.z0],
      [b.x0, b.z1],
      [b.x1, b.z1],
    ])
      r.box(x - 0.16, y0 + 0.6, z - 0.16, x + 0.16, y0 + H, z + 0.16);
    for (const z of [b.z0 - over, b.z1 + over])
      r.box(b.x0 - over, y0 + H - 0.55, z - 0.06, b.x1 + over, y0 + H - 0.3, z + 0.06);
    // the rake boards: a white band along the roof's edge at each gable end, under the snow's lip
    for (const [x, nx] of [
      [b.x0 - over, -1],
      [b.x1 + over, 1],
    ] as const)
      for (let k = 0; k < 4; k++) {
        const [za, ya] = prof[k];
        const [zb, yb] = prof[k + 1];
        r.quad(
          [x, y0 + ya - 0.28, za],
          [x, y0 + yb - 0.28, zb],
          [x, y0 + yb + 0.02, zb],
          [x, y0 + ya + 0.02, za],
          [nx, 0, 0],
        );
      }
    // the doors: the doorway's white frame, the X-braced doors slid open either side, their rail
    if (door) {
      r.color(t).box(b.x0 - 0.14, y0 + 2.8, dz0 - 0.2, b.x0 + 0.04, y0 + 3.05, dz1 + 0.2);
      for (const z of [dz0 - 0.2, dz1]) r.color(t).box(b.x0 - 0.14, y0, z, b.x0 + 0.04, y0 + 2.8, z + 0.2);
      for (const [za, zb] of [
        [dz0 - 3.2, dz0 - 0.2],
        [dz1 + 0.2, dz1 + 3.2],
      ]) {
        r.color(0x8e2b20).box(b.x0 - 0.24, y0 + 0.08, za, b.x0 - 0.14, y0 + 2.75, zb);
        for (let p = za + 0.25; p < zb - 0.1; p += 0.25)
          r.color(0x7a2419).box(b.x0 - 0.25, y0 + 0.1, p, b.x0 - 0.24, y0 + 2.7, p + 0.02);
        r.color(t);
        r.box(b.x0 - 0.3, y0 + 0.08, za, b.x0 - 0.22, y0 + 0.28, zb);
        r.box(b.x0 - 0.3, y0 + 2.55, za, b.x0 - 0.22, y0 + 2.75, zb);
        r.box(b.x0 - 0.3, y0 + 0.08, za, b.x0 - 0.22, y0 + 2.75, za + 0.2);
        r.box(b.x0 - 0.3, y0 + 0.08, zb - 0.2, b.x0 - 0.22, y0 + 2.75, zb);
        r.box(b.x0 - 0.3, y0 + 1.33, za, b.x0 - 0.22, y0 + 1.5, zb);
        // the X: two straight boards corner to corner (14 little cubes a diagonal read as stairs)
        const xf = b.x0 - 0.31;
        const yl = y0 + 0.28;
        const yh = y0 + 2.55;
        const h = 0.12;
        for (const [z0, z1] of [
          [za + 0.2, zb - 0.2],
          [zb - 0.2, za + 0.2],
        ]) {
          r.quad([xf, yl - h, z0], [xf, yh - h, z1], [xf, yh + h, z1], [xf, yl + h, z0], [-1, 0, 0]);
          // its edges, so it stands proud of the boards
          r.quad([xf, yl + h, z0], [xf, yh + h, z1], [xf + 0.08, yh + h, z1], [xf + 0.08, yl + h, z0], [0, 1, 0]);
          r.quad([xf, yl - h, z0], [xf, yh - h, z1], [xf + 0.08, yh - h, z1], [xf + 0.08, yl - h, z0], [0, -1, 0]);
        }
      }
      r.color(0x2f2f2f).box(b.x0 - 0.34, y0 + 2.95, dz0 - 3.4, b.x0 - 0.22, y0 + 3.05, dz1 + 3.4);
      // a lantern by them (unlit: nobody's here)
      r.color(0x2a2a2a).box(b.x0 - 0.5, y0 + 3.2, dz1 + 0.8, b.x0 - 0.2, y0 + 3.6, dz1 + 1.1);
      r.color(0xe8d8a8).box(b.x0 - 0.47, y0 + 3.25, dz1 + 0.83, b.x0 - 0.23, y0 + 3.5, dz1 + 1.07);
    }
    // the hay loft's door in the west gable, a pent hood over it with the hay hook's beam
    r.color(t).box(b.x0 - 0.12, y0 + H + 0.3, zm - 1.2, b.x0 + 0.02, y0 + H + 2.5, zm + 1.2);
    r.color(0x6d2018).box(b.x0 - 0.16, y0 + H + 0.45, zm - 1.05, b.x0 - 0.08, y0 + H + 2.35, zm + 1.05);
    r.color(t).box(b.x0 - 0.2, y0 + H + 0.45, zm - 0.06, b.x0 - 0.14, y0 + H + 2.35, zm + 0.06);
    r.color(0x5a4636).box(b.x0 - 1.0, y0 + H + 2.75, zm - 0.07, b.x0, y0 + H + 2.88, zm + 0.07);
    r.color(0x8e2b20).box(b.x0 - 0.7, y0 + H + 2.88, zm - 1.25, b.x0, y0 + H + 2.98, zm + 1.25);
    r.color(0xf4f7fa).box(b.x0 - 0.7, y0 + H + 2.98, zm - 1.25, b.x0, y0 + H + 3.08, zm + 1.25);
    // the cupola on the ridge: louvred sides, a little pyramid roof, the weathervane
    const rx = (b.x0 + b.x1) / 2;
    const ry = y0 + H + 4.2;
    r.color(t).box(rx - 0.8, ry - 0.3, zm - 0.8, rx + 0.8, ry + 1.1, zm + 0.8);
    r.color(0x8e2b20);
    for (let y = ry; y < ry + 1.0; y += 0.18) {
      r.box(rx - 0.82, y, zm - 0.6, rx - 0.78, y + 0.1, zm + 0.6);
      r.box(rx + 0.78, y, zm - 0.6, rx + 0.82, y + 0.1, zm + 0.6);
    }
    this.add(r.build(), this.lambert());
    const cap = tinted(new ConeGeometry(1.25, 0.9, 4).rotateY(Math.PI / 4).translate(0, 0.45, 0), 0x3d3a36);
    const capSnow = tinted(new ConeGeometry(1.1, 0.75, 4).rotateY(Math.PI / 4).translate(0, 0.62, 0), 0xf4f7fa);
    const vane = tinted(new BoxGeometry(0.06, 1.2, 0.06).translate(0, 1.4, 0), 0x2a2a2a);
    const arrow = tinted(new BoxGeometry(1.1, 0.08, 0.04).translate(0, 1.85, 0), 0x2a2a2a);
    const bird = tinted(new BoxGeometry(0.5, 0.35, 0.04).translate(0.1, 2.15, 0), 0x2a2a2a);
    this.add(place(mergeGeometries([cap, capSnow, vane, arrow, bird], false), rx, ry + 1.1, zm), this.lambert());
    for (const q of [cap, capSnow, vane, arrow, bird]) q.dispose();
    // framed windows down the long sides (dark: nobody's in)
    const w = new G();
    for (let x = b.x0 + 4; x < b.x1 - 2; x += 6) {
      this.litWindow(x, y0 + 2.2, b.z0, 1, 1, 0, -1, true, 0);
      this.litWindow(x, y0 + 2.2, b.z1, 1, 1, 0, 1, true, 0);
      this.frame(w, x, y0 + 2.2, b.z0, 1, 1, 0, -1);
      this.frame(w, x, y0 + 2.2, b.z1, 1, 1, 0, 1);
    }
    this.add(w.build(), this.lambert());
  }
  private silo(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const R = Math.min(b.x1 - b.x0, b.z1 - b.z0) / 2 - 0.2;
    const Hh = 13;
    const parts: BufferGeometry[] = [
      // the concrete footing
      tinted(new CylinderGeometry(R + 0.35, R + 0.45, 0.5, 28).translate(0, 0.25, 0), 0x9a968e),
    ];
    // the ribbed sheets, ring on ring, a shade apart; their bolted seams
    for (let y = 0.5, k = 0; y < Hh; y += 0.5, k++)
      parts.push(
        tinted(new CylinderGeometry(R, R, 0.5, 28, 1, true).translate(0, y + 0.25, 0), k % 2 ? 0xaeb3b7 : 0xa2a7ab),
      );
    for (let y = 2.5; y < Hh; y += 2.5)
      parts.push(tinted(new CylinderGeometry(R + 0.06, R + 0.06, 0.12, 28, 1, true).translate(0, y, 0), 0x7e8388));
    // the dome, its snow, the vent on top, a railing round its rim
    parts.push(
      tinted(
        new SphereGeometry(R + 0.05, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1).translate(0, Hh, 0),
        0x8f9499,
      ),
      tinted(
        new SphereGeometry(R + 0.12, 28, 6, 0, Math.PI * 2, 0, Math.PI / 3.2)
          .scale(1, 0.5, 1)
          .translate(0, Hh + 0.04, 0),
        0xf6f8fa,
      ),
      tinted(new CylinderGeometry(0.45, 0.55, 0.7, 12).translate(0, Hh + R * 0.5 + 0.2, 0), 0x7e8388),
      tinted(new ConeGeometry(0.7, 0.4, 12).translate(0, Hh + R * 0.5 + 0.75, 0), 0x6a6f74),
      tinted(new CylinderGeometry(R + 0.4, R + 0.4, 0.06, 28, 1, true).translate(0, Hh + 0.9, 0), 0x5c6166),
    );
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8)
      parts.push(
        tinted(
          new BoxGeometry(0.05, 0.9, 0.05).translate(Math.cos(a) * (R + 0.4), Hh + 0.45, Math.sin(a) * (R + 0.4)),
          0x5c6166,
        ),
      );
    // the caged ladder up its west side
    for (const dz of [-0.3, 0.3])
      parts.push(tinted(new BoxGeometry(0.06, Hh + 0.8, 0.06).translate(-R - 0.25, (Hh + 0.8) / 2, dz), 0x5c6166));
    for (let y = 0.5; y < Hh + 0.6; y += 0.4)
      parts.push(tinted(new BoxGeometry(0.05, 0.05, 0.6).translate(-R - 0.25, y, 0), 0x5c6166));
    for (let y = 2.4; y < Hh; y += 0.9)
      parts.push(
        tinted(
          new TorusGeometry(0.5, 0.03, 4, 12, Math.PI)
            .rotateX(Math.PI / 2)
            .rotateY(Math.PI / 2)
            .translate(-R - 0.25, y, 0),
          0x5c6166,
        ),
      );
    // the chute down to the barn's side
    for (let k = 0; k < 7; k++)
      parts.push(
        tinted(new BoxGeometry(0.5, 0.5, 0.5).translate(-R - 0.6 - k * 0.55, Hh - 1 - k * 0.65, 1.6), 0x8a8f94),
      );
    this.add(place(mergeGeometries(parts, false), cx, y0, cz), this.lambert());
    for (const p of parts) p.dispose();
  }
  private farmhouse(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const siding = this.keep(tex(sidingCanvas(this.T, "#e3dccb")));
    const H = 6.2;
    const door = insideOf(b)?.door;
    const g = new G();
    this.walls(
      g,
      b,
      y0 + 0.45,
      H - 0.45,
      door ? { face: "n", from: door.from + 0.3, to: door.to - 0.3, h: 2.0 } : undefined,
    );
    this.add(g.build(), this.lambert(0xffffff, siding, false));
    const r = new G();
    this.pitched(r, b.x0, b.z0, b.x1, b.z1, y0 + H, 3, true, 0x3a3f45, 0.55, 0xe3dccb);
    const t = 0xf2eee6;
    const z = b.z0;
    const xm = (b.x0 + b.x1) / 2;
    // the foundation, the corner boards, the gutters along the eaves
    r.color(0x8a8780).box(b.x0 - 0.05, y0, b.z0 - 0.05, b.x1 + 0.05, y0 + 0.45, b.z1 + 0.05);
    r.color(t);
    for (const [x, zz] of [
      [b.x0, b.z0],
      [b.x1, b.z0],
      [b.x0, b.z1],
      [b.x1, b.z1],
    ])
      r.box(x - 0.13, y0 + 0.45, zz - 0.13, x + 0.13, y0 + H, zz + 0.13);
    r.color(0x4a4f55);
    for (const zz of [b.z0 - 0.65, b.z1 + 0.5]) r.box(b.x0 - 0.55, y0 + H - 0.2, zz, b.x1 + 0.55, y0 + H, zz + 0.15);
    for (const x of [b.x0 - 0.45, b.x1 + 0.35]) r.box(x, y0 + 0.45, b.z0 - 0.65, x + 0.1, y0 + H - 0.2, b.z0 - 0.55);
    // the porch along the front (north): its floor, steps, posts, railings, a roof under snow
    r.color(0x8a7f6e).box(b.x0 + 1, y0 + 0.3, z - 2.2, b.x1 - 1, y0 + 0.5, z);
    r.color(0x7a6f5e);
    for (const [k, w] of [
      [0, 1.8],
      [1, 1.4],
    ] as const)
      r.box(xm - w / 2 - 0.4, y0 + k * 0.17, z - 2.2 - (2 - k) * 0.35, xm + w / 2 + 0.4, y0 + (k + 1) * 0.17, z - 2.2);
    const posts: number[] = [];
    for (let x = b.x0 + 1.2; x <= b.x1 - 1; x += (b.x1 - b.x0 - 2.4) / 3) posts.push(x);
    r.color(t);
    for (const x of posts) r.box(x - 0.1, y0 + 0.5, z - 2.1, x + 0.1, y0 + 2.9, z - 1.9);
    for (const [xa, xb] of [
      [b.x0 + 1.2, xm - 1.1],
      [xm + 1.1, b.x1 - 1.2],
    ]) {
      r.box(xa, y0 + 1.35, z - 2.06, xb, y0 + 1.45, z - 1.94);
      r.box(xa, y0 + 0.6, z - 2.04, xb, y0 + 0.66, z - 1.96);
      for (let x = xa + 0.2; x < xb; x += 0.3) r.box(x - 0.03, y0 + 0.6, z - 2.03, x + 0.03, y0 + 1.35, z - 1.97);
    }
    r.color(0x3a3f45).box(b.x0 + 0.8, y0 + 2.9, z - 2.4, b.x1 - 0.8, y0 + 3.05, z);
    slopeSnow(
      r,
      [b.x0 + 0.85, y0 + 3.05, z - 0.05],
      [b.x1 - 0.85, y0 + 3.05, z - 0.05],
      [b.x0 + 0.85, y0 + 3.05, z - 2.35],
      [b.x1 - 0.85, y0 + 3.05, z - 2.35],
      0.18,
      groundsRng(b.x0 * 11),
      0.5,
    );
    // the door: its frame, the door itself stood open into the room
    if (door) {
      r.color(t);
      r.box(door.from + 0.15, y0 + 0.45, z - 0.08, door.from + 0.3, y0 + 2.55, z + 0.02);
      r.box(door.to - 0.3, y0 + 0.45, z - 0.08, door.to - 0.15, y0 + 2.55, z + 0.02);
      r.box(door.from + 0.15, y0 + 2.45, z - 0.08, door.to - 0.15, y0 + 2.6, z + 0.02);
      r.color(0x4a3a2c).box(door.from + 0.3, y0 + 0.47, z + 0.05, door.from + 0.38, y0 + 2.43, z + 1.3);
    }
    // a brick chimney with its cap
    const cz = (b.z0 + b.z1) / 2;
    r.color(0x8a4a3a).box(b.x1 - 3, y0 + H - 1, cz + 0.5, b.x1 - 2, y0 + H + 3.6, cz + 1.5);
    r.color(0x6f3a2e).box(b.x1 - 3.1, y0 + H + 3.4, cz + 0.4, b.x1 - 1.9, y0 + H + 3.6, cz + 1.6);
    r.color(0xf4f7fa).box(b.x1 - 3.05, y0 + H + 3.6, cz + 0.45, b.x1 - 1.95, y0 + H + 3.78, cz + 1.55);
    this.add(r.build(), this.lambert());
    // the windows: dark (nobody's home), framed, with shutters
    const w = new G();
    const win = (x: number, y: number, zz: number, nx: number, nz: number, ww = 1.2, hh = 1.4) => {
      this.litWindow(x, y, zz, ww, hh, nx, nz, true, 0);
      this.frame(w, x, y, zz, ww, hh, nx, nz, t);
      const tx = -nz;
      const tz = nx;
      w.color(0x2f4a3b);
      for (const s of [-1, 1]) {
        const ax = x + tx * s * (ww / 2 + 0.15) + nx * 0.05;
        const az = zz + tz * s * (ww / 2 + 0.15) + nz * 0.05;
        const bx = x + tx * s * (ww / 2 + 0.6) + nx * 0.1;
        const bz = zz + tz * s * (ww / 2 + 0.6) + nz * 0.1;
        w.box(Math.min(ax, bx), y - 0.05, Math.min(az, bz), Math.max(ax, bx), y + hh + 0.05, Math.max(az, bz));
      }
    };
    for (const dx of [-4, 4]) {
      win(xm + dx, y0 + 1.0, z, 0, -1);
      win(xm + dx, y0 + 3.7, z, 0, -1);
    }
    win(xm, y0 + 3.7, z, 0, -1);
    for (const dz of [-2.5, 2.5]) {
      win(b.x0, y0 + 1.0, cz + dz, -1, 0, 1.1);
      win(b.x1, y0 + 1.0, cz + dz, 1, 0, 1.1);
      win(b.x0, y0 + 3.7, cz + dz, -1, 0, 1.1);
      win(b.x1, y0 + 3.7, cz + dz, 1, 0, 1.1);
    }
    for (const dx of [-4, 0, 4]) win(xm + dx, y0 + 3.7, b.z1, 0, 1);
    this.add(w.build(), this.lambert());
  }
  /** The farm's yard a step at a time (the cornfield in bands of rows: all at once was a 100 ms frame). */
  private farmSteps(): (() => void)[] {
    if (!this.near((FARM.x0 + FARM.x1) / 2, (FARM.z0 + FARM.z1) / 2, 200)) return [];
    const bands = 6;
    const rows = Math.ceil((CORN.x1 - CORN.x0 - 1) / CORN.row);
    const per = Math.ceil(rows / bands);
    const out: (() => void)[] = [];
    for (let k = 0; k < bands; k++) out.push(() => this.corn(k * per, Math.min(rows, (k + 1) * per)));
    out.push(() => this.farm());
    return out;
  }
  // the stalks of rows [r0, r1): a thin stem (two crossed strips), dry leaves drooping off it, a
  // tassel; some broken off short, some leaning
  private corn(r0: number, r1: number) {
    const r = groundsRng(3131 + r0);
    const corn = new G();
    const strip = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number) => {
      // a thin card from a to b, facing across (both sides drawn; lit as from above, even)
      const dx = bx - ax;
      const dz = bz - az;
      const l = Math.hypot(dx, dz) || 1;
      const px = (-dz / l) * (w / 2) || w / 2;
      const pz = (dx / l) * (w / 2);
      corn.quad(
        [ax - px, ay, az - pz],
        [ax + px, ay, az + pz],
        [bx + px, by, bz + pz],
        [bx - px, by, bz - pz],
        [0.15, 1, 0.1],
      );
    };
    for (let x = CORN.x0 + 1 + r0 * CORN.row; x < Math.min(CORN.x1, CORN.x0 + 1 + r1 * CORN.row); x += CORN.row)
      for (let z = CORN.z0 + 0.4; z < CORN.z1; z += 0.5 + r() * 0.3) {
        if (r() < 0.1) continue;
        const sx = x + (r() - 0.5) * 0.3;
        const sz = z;
        const short = r() < 0.14;
        const h = short ? 0.45 + r() * 0.45 : 1.5 + r() * 0.7;
        const lx = (r() - 0.5) * 0.3;
        const lz = (r() - 0.5) * 0.3;
        const y = groundAt(sx, sz) - 0.05;
        const c = [0xb59c6c, 0xa88d5c, 0xc4ad7f, 0x9a8458][Math.floor(r() * 4)];
        corn.color(c);
        strip(sx, y, sz, sx + lx, y + h, sz + lz, 0.07);
        strip(sx, y, sz - 0.035, sx + lx, y + h, sz + lz - 0.035, 0.07);
        if (short) continue;
        // the leaves: out and down from the stem, each a long thin strip, dry
        const n = 3 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) {
          const t = 0.25 + (k / n) * 0.6;
          const a = r() * Math.PI * 2;
          const L = 0.45 + r() * 0.35;
          const ax = sx + lx * t;
          const az = sz + lz * t;
          const ay = y + h * t;
          corn.color(c - 0x0a0a06);
          strip(ax, ay, az, ax + Math.cos(a) * L, ay + 0.12 - r() * 0.35, az + Math.sin(a) * L, 0.09);
        }
        // the tassel, and now and then snow caught in the top leaves
        corn.color(0xd2bc8c);
        strip(sx + lx, y + h, sz + lz, sx + lx * 1.3, y + h + 0.3, sz + lz * 1.3, 0.05);
        if (r() < 0.2)
          corn
            .color(0xf4f7fa)
            .box(sx + lx - 0.07, y + h * 0.8, sz + lz - 0.07, sx + lx + 0.07, y + h * 0.8 + 0.07, sz + lz + 0.07);
      }
    // (its own material, both sides of the cards — the cached ones are shared; one for the field)
    this.cornMat ??= this.keep(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
    this.add(corn.build(), this.cornMat);
  }
  private cornMat: MeshLambertMaterial | null = null;
  // the rest of the yard: the fence round the field, the scarecrows, the tractor, hay bales
  private farm() {
    const rr = groundsRng(4747);
    // the fence round the field (the lane's side open at its gate): split rails on round-topped posts
    const f = new G();
    const post = (x: number, z: number) => {
      const y = groundAt(x, z);
      f.color(0x5a4636).box(x - 0.08, y, z - 0.08, x + 0.08, y + 1.15, z + 0.08);
      f.color(0x4a3a2c).box(x - 0.06, y + 1.15, z - 0.06, x + 0.06, y + 1.22, z + 0.06);
      f.color(0xf4f7fa).box(x - 0.08, y + 1.22, z - 0.08, x + 0.08, y + 1.27, z + 0.08);
    };
    const rail = (ax: number, az: number, bx: number, bz: number) => {
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.5));
      for (let k = 0; k < n; k++) {
        const x0 = ax + ((bx - ax) * k) / n;
        const z0 = az + ((bz - az) * k) / n;
        const x1 = ax + ((bx - ax) * (k + 1)) / n;
        const z1 = az + ((bz - az) * (k + 1)) / n;
        const y = groundAt((x0 + x1) / 2, (z0 + z1) / 2);
        for (const hy of [0.45, 0.8]) {
          const wob = (rr() - 0.5) * 0.08;
          f.color(rr() < 0.5 ? 0x6b5442 : 0x5f4a3a);
          f.box(
            Math.min(x0, x1) - 0.05,
            y + hy + wob,
            Math.min(z0, z1) - 0.05,
            Math.max(x0, x1) + 0.05,
            y + hy + wob + 0.11,
            Math.max(z0, z1) + 0.05,
          );
          f.color(0xf4f7fa);
          f.box(
            Math.min(x0, x1) - 0.04,
            y + hy + wob + 0.11,
            Math.min(z0, z1) - 0.04,
            Math.max(x0, x1) + 0.04,
            y + hy + wob + 0.15,
            Math.max(z0, z1) + 0.04,
          );
        }
        post(x1, z1);
      }
      post(ax, az);
    };
    const e = { x0: CORN.x0 - 1.5, z0: CORN.z0 - 1.5, x1: CORN.x1 + 1.5, z1: CORN.z1 + 1.5 };
    rail(e.x0, e.z0, e.x1, e.z0);
    rail(e.x0, e.z1, e.x1, e.z1);
    rail(e.x0, e.z0, e.x0, e.z1);
    const gm = (e.z0 + e.z1) / 2;
    rail(e.x1, e.z0, e.x1, gm - 3);
    rail(e.x1, gm + 3, e.x1, e.z1);
    this.add(f.build(), this.lambert());
    // the scarecrows: a post and crossbar, a plaid shirt stuffed with straw, patched trousers, a
    // burlap head with a stitched face, a hat; snow on the shoulders and the brim
    const crows: BufferGeometry[] = [];
    for (const sc of SCARECROWS) {
      const y = groundAt(sc.x, sc.z);
      const shirt = 0x8a3b2e;
      const parts = [
        tinted(new BoxGeometry(0.12, 2.6, 0.12).translate(0, 1.3, 0), 0x5a4636),
        tinted(new BoxGeometry(1.9, 0.1, 0.1).translate(0, 1.9, 0), 0x5a4636),
        tinted(new CylinderGeometry(0.28, 0.36, 0.75, 10).translate(0, 1.55, 0), shirt), // the body
        tinted(new BoxGeometry(1.55, 0.26, 0.26).translate(0, 1.9, 0), shirt), // the arms
        tinted(new BoxGeometry(1.57, 0.04, 0.27).translate(0, 1.82, 0), 0x5e2620), // the plaid's lines
        tinted(new BoxGeometry(0.05, 0.75, 0.37).translate(0.12, 1.55, 0), 0x5e2620),
        tinted(new BoxGeometry(0.05, 0.75, 0.37).translate(-0.12, 1.55, 0), 0x5e2620),
        tinted(new CylinderGeometry(0.13, 0.11, 0.85, 8).translate(-0.13, 0.95, 0), 0x3d4a5c), // the trousers
        tinted(new CylinderGeometry(0.13, 0.11, 0.85, 8).translate(0.13, 0.95, 0), 0x3d4a5c),
        tinted(new BoxGeometry(0.12, 0.14, 0.02).translate(0.13, 0.9, 0.12), 0x8a6a4a), // a patch
        tinted(new SphereGeometry(0.27, 10, 8).scale(1, 1.1, 1).translate(0, 2.32, 0), 0xc9b48a), // burlap
        tinted(new BoxGeometry(0.08, 0.05, 0.02).translate(-0.09, 2.38, 0.26), 0x2a2420), // the eyes
        tinted(new BoxGeometry(0.08, 0.05, 0.02).translate(0.09, 2.38, 0.26), 0x2a2420),
        tinted(new BoxGeometry(0.22, 0.03, 0.02).translate(0, 2.22, 0.26), 0x2a2420), // the stitched mouth
        tinted(new CylinderGeometry(0.4, 0.42, 0.05, 12).translate(0, 2.55, 0), 0x3a3228), // the hat
        tinted(new CylinderGeometry(0.2, 0.24, 0.3, 12).translate(0, 2.72, 0), 0x3a3228),
        tinted(new CylinderGeometry(0.4, 0.4, 0.03, 12).translate(0, 2.59, 0), 0xf4f7fa),
        tinted(new BoxGeometry(1.4, 0.06, 0.28).translate(0, 2.05, 0), 0xf4f7fa),
      ];
      for (const [x, yy] of [
        [-0.8, 1.88],
        [0.8, 1.88],
        [-0.13, 0.5],
        [0.13, 0.5],
        [0, 2.05],
      ])
        for (let k = 0; k < 3; k++)
          parts.push(
            tinted(
              new ConeGeometry(0.05, 0.3, 4)
                .rotateZ(Math.PI + (k - 1) * 0.5 + (x < 0 ? 0.3 : x > 0 ? -0.3 : 0))
                .translate(x + (k - 1) * 0.05, yy - 0.1, 0),
              0xd8c08a,
            ),
          );
      crows.push(place(mergeGeometries(parts, false), sc.x, y, sc.z, sc.ry));
      for (const p of parts) p.dispose();
    }
    this.add(mergeGeometries(crows, false), this.lambert());
    for (const c of crows) c.dispose();
    // the tractor's toolbox (the loot spot's), on the ground where the tractor parks (the tractor
    // itself is a vehicle now — shared car/homes.ts — drawn by world/car/cars.ts)
    {
      const y = groundAt(TRACTOR.x, TRACTOR.z);
      const tb = new G();
      const tx = TRACTOR.x - Math.sin(TRACTOR.ry) * 1.9;
      const tz = TRACTOR.z + Math.cos(TRACTOR.ry) * 1.9;
      tb.color(0x2f5d8a).box(tx - 0.3, y, tz - 0.15, tx + 0.3, y + 0.27, tz + 0.15);
      tb.color(0x244a6e).box(tx - 0.31, y + 0.2, tz - 0.16, tx + 0.31, y + 0.23, tz + 0.16);
      tb.color(0x8a8f94).box(tx - 0.12, y + 0.27, tz - 0.02, tx + 0.12, y + 0.33, tz + 0.02);
      this.add(tb.build(), this.lambert());
    }
    // round hay bales by the barn: their wrapped sides, their darker ends, snow on top
    const bales: BufferGeometry[] = [];
    for (const [x, z, rot] of [
      [437, -298, 0],
      [437.2, -296.6, 0.2],
      [438.4, -297.4, 1.4],
      [466, -300, 0.1],
    ]) {
      const y = groundAt(x, z);
      bales.push(
        place(
          tinted(new CylinderGeometry(0.62, 0.62, 1.1, 18).rotateX(Math.PI / 2).translate(0, 0.62, 0), 0xc9a95a),
          x,
          y,
          z,
          rot,
        ),
      );
      for (const sd of [-1, 1])
        bales.push(
          place(
            tinted(
              new CylinderGeometry(0.5, 0.5, 0.02, 16).rotateX(Math.PI / 2).translate(0, 0.62, sd * 0.56),
              0xa88a44,
            ),
            x,
            y,
            z,
            rot,
          ),
        );
      bales.push(place(tinted(new BoxGeometry(0.75, 0.1, 1.05).translate(0, 1.22, 0), 0xf6f8fa), x, y, z, rot));
    }
    this.add(mergeGeometries(bales, false), this.lambert());
    for (const b of bales) b.dispose();
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
    flatSnow(g, b.x0 - 0.28, b.z0 - 0.28, b.x1 + 0.28, b.z1 + 0.28, y0 + 2.7, 0.26, groundsRng(b.x0 + 9));
    icicles(g, [b.x0 - 0.3, y0 + 2.5, b.z0 - 0.3], [b.x1 + 0.3, y0 + 2.5, b.z0 - 0.3], groundsRng(b.z0 + 9), 0.5);
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
  /** Four textured walls round a box, the face `tall` rising to `Hf` (a false front). */
  private wallsUV(
    g: G,
    b: { x0: number; z0: number; x1: number; z1: number },
    y0: number,
    H: number,
    k: number,
    tall?: { side: "n" | "s" | "e" | "w"; Hf: number },
  ) {
    const { x0, z0, x1, z1 } = b;
    const U = (a: number, y: number): [number, number] => [a / k, y / k];
    const h = (s: string) => (tall && tall.side === s ? tall.Hf : H);
    const fw = (a: V, bb: V, hh: number, n: V, len: number) =>
      g.quad(a, bb, [bb[0], y0 + hh, bb[2]], [a[0], y0 + hh, a[2]], n, [U(0, 0), U(len, 0), U(len, hh), U(0, hh)]);
    fw([x0, y0, z0], [x1, y0, z0], h("n"), [0, 0, -1], x1 - x0);
    fw([x0, y0, z1], [x1, y0, z1], h("s"), [0, 0, 1], x1 - x0);
    fw([x0, y0, z0], [x0, y0, z1], h("w"), [-1, 0, 0], z1 - z0);
    fw([x1, y0, z0], [x1, y0, z1], h("e"), [1, 0, 0], z1 - z0);
    // a false front's back, seen over the roof
    if (tall) {
      const s = tall.side;
      const z = s === "n" ? z0 + 0.25 : z1 - 0.25;
      const n: V = [0, 0, s === "n" ? 1 : -1];
      g.quad([x0, y0 + H, z], [x1, y0 + H, z], [x1, y0 + tall.Hf, z], [x0, y0 + tall.Hf, z], n, [
        U(0, H),
        U(x1 - x0, H),
        U(x1 - x0, tall.Hf),
        U(0, tall.Hf),
      ]);
    }
  }
  /** The town's shops and their kin (docs/plan/33-the-look.md, phase 4): a façade kit — brick with
   *  a dentilled cornice or clapboard with a false front, framed windows with stone heads on every
   *  face, a shopfront of panes over a panelled base, a striped or plain awning; the town hall
   *  columned under a pediment, the post office's flag, the diner's chrome and roof sign, the
   *  hotel's marquee. */
  private shop(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const r = groundsRng(b.x0 * 31 + 7);
    const fh = 3.8;
    const H = b.floors * fh + 0.8;
    // (what it looks like: decided with the iso view's — world/grounds-look.ts)
    const L = shopLook(b);
    const { civic, diner, brick } = L;
    const wall = this.wallPic(brick ? "brick" : "siding", L.wall, b.x0);
    const { x0, z0, x1, z1 } = b;
    const nz = b.face === "n" ? -1 : 1;
    const fz = b.face === "n" ? z0 : z1;
    const w = x1 - x0;
    const xm = (x0 + x1) / 2;
    const trim = hexOf(L.trim);
    // clapboard (and the one-storey ones, for their signs) get a false front
    const falseFront = L.falseFront;
    const Hf = falseFront ? H + 1.4 : H;
    const g = new G();
    this.wallsUV(g, b, y0, H, 4, falseFront ? { side: b.face, Hf } : undefined);
    this.add(g.build(), this.lambert(0xffffff, wall, false));
    const c = new G();
    // the top: a cornice with dentils (brick), a capped false front with a raised middle (clapboard),
    // a plain coping (civic, the diner)
    if (falseFront) {
      c.color(trim).box(
        x0 - 0.15,
        y0 + Hf - 0.3,
        Math.min(fz, fz + nz * 0.3),
        x1 + 0.15,
        y0 + Hf,
        Math.max(fz, fz + nz * 0.3),
      );
      c.color(trim).box(
        xm - 1.6,
        y0 + Hf,
        Math.min(fz, fz + nz * 0.25),
        xm + 1.6,
        y0 + Hf + 0.7,
        Math.max(fz, fz + nz * 0.25),
      );
      c.color(trim).box(
        xm - 1.75,
        y0 + Hf + 0.7,
        Math.min(fz, fz + nz * 0.32),
        xm + 1.75,
        y0 + Hf + 0.9,
        Math.max(fz, fz + nz * 0.32),
      );
      flatSnow(c, xm - 1.7, Math.min(fz, fz + nz * 0.3), xm + 1.7, Math.max(fz, fz + nz * 0.3), y0 + Hf + 0.9, 0.12, r);
      flatSnow(c, x0 - 0.1, Math.min(fz, fz + nz * 0.28), x1 + 0.1, Math.max(fz, fz + nz * 0.28), y0 + Hf, 0.12, r);
      // the plain roof behind it, a low coping round its other sides
      c.color(0x8c857a).box(x0 - 0.1, y0 + H - 0.2, z0 - 0.1, x1 + 0.1, y0 + H, z1 + 0.1);
    } else if (brick) {
      c.color(0x8c857a).box(x0 - 0.3, y0 + H - 0.35, z0 - 0.3, x1 + 0.3, y0 + H, z1 + 0.3);
      c.color(trim).box(x0 - 0.2, y0 + H - 0.75, z0 - 0.2, x1 + 0.2, y0 + H - 0.35, z1 + 0.2);
      for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.45)
        c.color(0x8c857a).box(x, y0 + H - 0.95, fz + nz * 0.0, x + 0.22, y0 + H - 0.75, fz + nz * 0.18);
      // a corbelled band over the shopfront
      c.color(trim).box(x0, y0 + 3.7, Math.min(fz, fz + nz * 0.12), x1, y0 + 3.85, Math.max(fz, fz + nz * 0.12));
    } else {
      c.color(diner ? 0xb8bec4 : 0xbdb6a6).box(x0 - 0.2, y0 + H - 0.4, z0 - 0.2, x1 + 0.2, y0 + H, z1 + 0.2);
    }
    flatSnow(c, x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2, y0 + H, 0.34, r);
    {
      const ez = fz + nz * 0.3;
      icicles(c, [x0 - 0.2, y0 + Hf - 0.3, ez], [x1 + 0.2, y0 + Hf - 0.3, ez], r, 0.3);
    }
    this.add(c.build(), this.lambert());
    // upstairs windows, on the front and the sides: framed, a stone head over each
    const head = new G();
    const upper = (x: number, y: number, z: number, ww: number, hh: number, nx: number, nzz: number, lit: number) => {
      this.litWindow(x, y, z, ww, hh, nx, nzz, true, lit);
      this.frame(head, x, y, z, ww, hh, nx, nzz, trim);
      const tx = -nzz;
      const tz = nx;
      const a = ww / 2 + 0.22;
      const [hx0, hx1] = [x - tx * a, x + tx * a].sort((p, q) => p - q);
      const [hz0, hz1] = [z - tz * a, z + tz * a].sort((p, q) => p - q);
      head
        .color(brick ? 0xcfc6b4 : trim)
        .box(
          Math.min(hx0, hx0 + nx * 0.18),
          y + hh + 0.12,
          Math.min(hz0, hz0 + nzz * 0.18),
          Math.max(hx1, hx1 + nx * 0.18),
          y + hh + 0.38,
          Math.max(hz1, hz1 + nzz * 0.18),
        );
    };
    const lit = L.lit(64);
    let li = 0;
    for (let f = 1; f < b.floors; f++) {
      const n = Math.max(2, Math.floor(w / 4));
      for (let k = 0; k < n; k++) {
        const x = x0 + (w / n) * (k + 0.5);
        if (b.vacant) continue;
        upper(x, y0 + f * fh + 1.3, fz, 1.3, 1.7, 0, nz, lit[li++ % 64] ? 0.8 : 0);
      }
      const d = z1 - z0;
      for (const [sx, snx] of [
        [x0, -1],
        [x1, 1],
      ] as const)
        for (const t of d > 12 ? [0.3, 0.7] : [0.5])
          upper(sx, y0 + f * fh + 1.3, z0 + d * t, 1.2, 1.6, snx, 0, lit[li++ % 64] ? 0.7 : 0);
    }
    this.add(head.build(), this.lambert());
    const front = new G();
    if (b.vacant) {
      // boarded: planks across the shopfront and the upstairs windows, snow banked at the door
      for (let y = 0.7; y < 3; y += 0.32)
        front
          .color(r() < 0.5 ? 0xa48a6a : 0x96805f)
          .box(x0 + 0.8 + r() * 0.3, y0 + y, fz + nz * 0.02, x1 - 0.8 - r() * 0.3, y0 + y + 0.26, fz + nz * 0.1);
      for (let f = 1; f < b.floors; f++)
        for (let k = 0; k < 3; k++) {
          const x = x0 + (w / 3) * (k + 0.5);
          front
            .color(0x2a2e33)
            .box(x - 0.65, y0 + f * fh + 1.3, fz + nz * 0.01, x + 0.65, y0 + f * fh + 3, fz + nz * 0.03);
          for (let y = 1.4; y < 2.9; y += 0.42)
            front
              .color(0x9a8264)
              .box(x - 0.8, y0 + f * fh + y, fz + nz * 0.03, x + 0.8, y0 + f * fh + y + 0.3, fz + nz * 0.09);
        }
      this.add(front.build(), this.lambert());
      this.signBoard("FOR LEASE", xm, fz + nz * 0.3, b.face === "n" ? Math.PI : 0, 1.6, 0.5, 1.5, "#d8d2c2", "#7a2a22");
      return;
    }
    if (civic) return this.civicFront(b, y0, fz, nz, xm, w, H, trim, r);
    // the shopfront: a panelled base, panes over it, a transom, pilasters, the door
    const tone = b.sign === "BAR" ? "#c86a3c" : diner ? "#f0d9a0" : "#e6b878";
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
    const wy0 = diner ? 1.25 : 0.7;
    const wy1 = diner ? 2.7 : 3.0;
    const wg = new G().color(0xffffff);
    const ww = w - 2;
    wg.quad(
      [xm - (nz * ww) / 2, y0 + wy0, fz + nz * 0.05],
      [xm + (nz * ww) / 2, y0 + wy0, fz + nz * 0.05],
      [xm + (nz * ww) / 2, y0 + wy1, fz + nz * 0.05],
      [xm - (nz * ww) / 2, y0 + wy1, fz + nz * 0.05],
      [0, 0, nz],
    );
    this.add(wg.build(), win, "none");
    const dark = b.sign === "BAR" ? 0x2a1614 : 0x23292e;
    const F = (xa: number, ya: number, xb: number, yb: number, d0: number, d1: number, col = dark) =>
      front
        .color(col)
        .box(xa, y0 + ya, Math.min(fz + nz * d0, fz + nz * d1), xb, y0 + yb, Math.max(fz + nz * d0, fz + nz * d1));
    if (diner) {
      // chrome below and above the strip of windows, a red band, rounded-off corners as bars
      F(x0 - 0.02, 0, x1 + 0.02, wy0 - 0.25, 0, 0.12, 0xb8bec4);
      F(x0 - 0.02, wy0 - 0.25, x1 + 0.02, wy0, 0, 0.14, 0xa8322a);
      F(x0 - 0.02, wy1, x1 + 0.02, wy1 + 0.18, 0, 0.14, 0xa8322a);
      for (let x = x0 + 1; x < x1 - 0.5; x += 1.6) F(x - 0.04, wy0, x + 0.04, wy1, 0, 0.1, 0xd8dde2);
      F(xm - 0.7, 0, xm + 0.7, 2.45, 0.04, 0.16, 0xc9ced3); // the door
      F(xm - 0.3, 1.5, xm + 0.3, 2.1, 0.16, 0.18, 0xf0d9a0); // its round window, squared
    } else {
      F(x0 + 0.4, 0, x0 + 1, 3.4, 0.02, 0.24); // pilasters
      F(x1 - 1, 0, x1 - 0.4, 3.4, 0.02, 0.24);
      F(x0 + 0.4, 3.0, x1 - 0.4, 3.4, 0.02, 0.22); // the fascia under the awning
      F(x0 + 1, 0, x1 - 1, wy0, 0.02, 0.14); // the panelled base
      for (let x = x0 + 1.4; x < x1 - 1.2; x += 1.5) F(x, 0.15, x + 1.1, wy0 - 0.15, 0.14, 0.17, 0x353c42);
      F(x0 + 1, 2.55, x1 - 1, 2.62, 0.05, 0.12); // the transom bar
      for (let x = x0 + 1 + 1.7; x < x1 - 1.4; x += 1.7)
        if (Math.abs(x - xm) > 1.1) F(x - 0.04, wy0, x + 0.04, wy1, 0.05, 0.11);
      F(xm - 0.8, 0, xm + 0.8, 2.6, 0.04, 0.12); // the door: its frame…
      F(xm - 0.6, 1.0, xm + 0.6, 2.4, 0.12, 0.13, 0x46525c); // …its glass
      F(xm + 0.45, 1.1, xm + 0.52, 1.3, 0.13, 0.18, 0xc9a85a); // …its handle
    }
    // the awning (not the diner's, nor the hotel's: a marquee), striped on some
    if (!diner && b.kind !== "hotel") {
      const aw = hexOf(L.awning);
      const striped = L.striped;
      const n = Math.round((w - 1.2) / 0.6);
      for (let i = 0; i < n; i++) {
        const xa = x0 + 0.6 + ((w - 1.2) * i) / n;
        const xb = x0 + 0.6 + ((w - 1.2) * (i + 1)) / n;
        front.color(striped && i % 2 ? 0xe9e2d0 : aw);
        face(
          front,
          [xa, y0 + 3.5, fz],
          [xb, y0 + 3.5, fz],
          [xb, y0 + 2.9, fz + nz * 1.6],
          [xa, y0 + 2.9, fz + nz * 1.6],
          [0, 1, nz],
        );
        // the valance hanging off its edge
        face(
          front,
          [xa, y0 + 2.9, fz + nz * 1.6],
          [xb, y0 + 2.9, fz + nz * 1.6],
          [xb, y0 + 2.62, fz + nz * 1.6],
          [xa, y0 + 2.62, fz + nz * 1.6],
          [0, 0, nz],
        );
      }
      // its ends
      front.color(aw);
      for (const x of [x0 + 0.6, x1 - 0.6])
        face(
          front,
          [x, y0 + 3.5, fz],
          [x, y0 + 2.9, fz + nz * 1.6],
          [x, y0 + 2.62, fz + nz * 1.6],
          [x, y0 + 2.9, fz],
          [x < xm ? -1 : 1, 0, 0],
        );
      slopeSnow(
        front,
        [x0 + 0.7, y0 + 3.5, fz + nz * 0.02],
        [x1 - 0.7, y0 + 3.5, fz + nz * 0.02],
        [x0 + 0.7, y0 + 2.92, fz + nz * 1.55],
        [x1 - 0.7, y0 + 2.92, fz + nz * 1.55],
        0.13,
        r,
        0.45,
      );
    }
    if (b.kind === "hotel") {
      // the marquee over its door, lit underneath
      front
        .color(0x23292e)
        .box(xm - 2.4, y0 + 3.1, Math.min(fz, fz + nz * 3), xm + 2.4, y0 + 3.45, Math.max(fz, fz + nz * 3));
      flatSnow(
        front,
        xm - 2.35,
        Math.min(fz, fz + nz * 2.95),
        xm + 2.35,
        Math.max(fz, fz + nz * 2.95),
        y0 + 3.45,
        0.18,
        r,
      );
      for (const sx of [-2.2, 2.2])
        front
          .color(0xc9a85a)
          .box(xm + sx - 0.06, y0, fz + nz * 2.85 - 0.06, xm + sx + 0.06, y0 + 3.1, fz + nz * 2.85 + 0.06);
      const ug = new G().color(0xffffff);
      ug.quad(
        [xm - 2.3, y0 + 3.08, fz + nz * 0.1],
        [xm + 2.3, y0 + 3.08, fz + nz * 0.1],
        [xm + 2.3, y0 + 3.08, fz + nz * 2.9],
        [xm - 2.3, y0 + 3.08, fz + nz * 2.9],
        [0, -1, 0],
      );
      this.add(
        ug.build(),
        this.glows(
          this.keep(new MeshLambertMaterial({ color: 0x5a5040, emissive: 0xffd9a0, emissiveIntensity: 0 })),
          1.1,
          "windows",
        ),
        "none",
      );
    }
    this.add(front.build(), this.lambert());
    // the sign: over the awning (on the false front, for the low ones); the diner's up on its roof
    if (b.sign) {
      const st = this.keep(
        tex(
          signCanvas(
            this.T,
            b.sign,
            512,
            96,
            b.sign === "BAR" ? "#2a0e0c" : diner ? "#a8322a" : "#1d2226",
            b.sign === "BAR" ? "#ffb48a" : diner ? "#fff1d8" : "#efe3c4",
          ),
          false,
        ),
      );
      const sm = this.glows(
        this.keep(new MeshLambertMaterial({ map: st, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 0 })),
        b.sign === "BAR" || diner ? 1.4 : 0.7,
        "sign",
      );
      const sw = diner ? Math.min(w - 2, 9) : Math.min(w - 1.5, 6.2);
      const sh = sw * 0.1875;
      const plane = new Mesh(this.keep(new BoxGeometry(sw, sh, 0.12)), sm);
      const sy = diner ? y0 + H + 1.2 + sh / 2 : y0 + 3.72 + sh / 2;
      plane.position.set(xm, sy, fz + nz * (diner ? 1.2 : 0.1));
      plane.rotation.y = nz > 0 ? 0 : Math.PI;
      this.root.add(plane);
      if (diner) {
        const legs = new G().color(0x3a3f45);
        for (const sx of [-sw / 2 + 0.4, sw / 2 - 0.4])
          legs.box(xm + sx - 0.07, y0 + H, fz + nz * 1.2 - 0.07, xm + sx + 0.07, sy - sh / 2, fz + nz * 1.2 + 0.07);
        legs
          .color(SNOW)
          .box(xm - sw / 2, sy + sh / 2, fz + nz * 1.2 - 0.07, xm + sw / 2, sy + sh / 2 + 0.06, fz + nz * 1.2 + 0.07);
        this.add(legs.build(), this.lambert());
      }
    }
    this.lights.push({ p: new Vector3(xm, y0 + 3.2, fz + nz * 1.2), kind: "porch", color: 0xffc98a, r: 5 });
    this.pool(xm, fz + nz * 2.4, 4.5, 0xffc98a);
    if (b.kind === "hotel")
      this.signBoard("HOTEL", x1 + 0.2, fz + nz * 1.2, Math.PI / 2, 1.2, 4, 3.5, "#1d2226", "#f2d6a2", true);
  }
  /** The town hall and the post office: steps up to a double door, framed windows either side;
   *  the hall's columns under a pediment with its clock, a flag over each. */
  private civicFront(
    b: Building,
    y0: number,
    fz: number,
    nz: number,
    xm: number,
    w: number,
    H: number,
    trim: number,
    r: () => number,
  ) {
    const g = new G();
    const hall = b.key === "hall";
    const Z = (d: number) => fz + nz * d;
    const zz = (a: number, c: number) => [Math.min(Z(a), Z(c)), Math.max(Z(a), Z(c))] as const;
    // a stone base course round the front
    g.color(0xb7b0a2).box(b.x0 - 0.05, y0, zz(0, 0.12)[0], b.x1 + 0.05, y0 + 0.7, zz(0, 0.12)[1]);
    // the steps
    for (let k = 0; k < 3; k++) {
      const [a, c] = zz(0, 1.6 - k * 0.45);
      g.color(0xc9c3b6).box(xm - 2.6 + k * 0.2, y0, a, xm + 2.6 - k * 0.2, y0 + 0.2 * (k + 1), c);
    }
    // the double door, its frame and fanlight
    {
      const [a, c] = zz(0.02, 0.14);
      g.color(trim).box(xm - 1.2, y0 + 0.6, a, xm + 1.2, y0 + 3.6, c);
      g.color(0x3b2f27).box(
        xm - 0.95,
        y0 + 0.6,
        Math.min(Z(0.12), Z(0.16)),
        xm + 0.95,
        y0 + 3.0,
        Math.max(Z(0.12), Z(0.16)),
      );
      g.color(0x2a2e33).box(
        xm - 0.02,
        y0 + 0.6,
        Math.min(Z(0.15), Z(0.17)),
        xm + 0.02,
        y0 + 3.0,
        Math.max(Z(0.15), Z(0.17)),
      );
    }
    this.litWindow(xm, y0 + 3.05, fz, 1.9, 0.45, 0, nz, true, 0.8, false);
    // framed windows either side, on the ground floor
    for (const sx of [-1, 1])
      for (const k of hall ? [4.2, 8.4] : [3.6]) {
        const x = xm + sx * k;
        if (Math.abs(x - xm) > w / 2 - 1) continue;
        this.litWindow(x, y0 + 1.2, fz, 1.3, 1.9, 0, nz, true, r() < 0.5 ? 0.7 : 0);
        this.frame(g, x, y0 + 1.2, fz, 1.3, 1.9, 0, nz, trim);
      }
    if (hall) {
      // four columns under a pediment, the clock in its gable
      const cz = Z(2.2);
      for (const sx of [-2.4, -0.8, 0.8, 2.4]) {
        g.color(0xe6e1d6).box(xm + sx - 0.3, y0 + 0.6, cz - 0.3, xm + sx + 0.3, y0 + 0.8, cz + 0.3);
        this.add(
          place(tinted(new CylinderGeometry(0.2, 0.24, 3.4, 10), 0xece6da), xm + sx, y0 + 0.8 + 1.7, cz),
          this.lambert(),
        );
        g.color(0xe6e1d6).box(xm + sx - 0.3, y0 + 4.2, cz - 0.3, xm + sx + 0.3, y0 + 4.35, cz + 0.3);
      }
      const [a, c] = zz(0, 2.6);
      g.color(0xe6e1d6).box(xm - 3.2, y0 + 4.35, a, xm + 3.2, y0 + 4.8, c);
      const pz = Z(2.6);
      g.color(0xe6e1d6);
      face(g, [xm - 3.3, y0 + 4.8, pz], [xm + 3.3, y0 + 4.8, pz], [xm, y0 + 6.3, pz], [xm, y0 + 6.3, pz], [0, 0, nz]);
      for (const s of [-1, 1])
        face(
          g,
          [xm + s * 3.3, y0 + 4.8, pz],
          [xm + s * 3.3, y0 + 4.8, fz],
          [xm, y0 + 6.3, fz],
          [xm, y0 + 6.3, pz],
          [s * 0.6, 1, 0],
        );
      slopeSnow(
        g,
        [xm, y0 + 6.3, fz],
        [xm, y0 + 6.3, pz],
        [xm - 3.3, y0 + 4.8, fz],
        [xm - 3.3, y0 + 4.8, pz],
        0.14,
        r,
        0.4,
      );
      slopeSnow(
        g,
        [xm, y0 + 6.3, pz],
        [xm, y0 + 6.3, fz],
        [xm + 3.3, y0 + 4.8, pz],
        [xm + 3.3, y0 + 4.8, fz],
        0.14,
        r,
        0.4,
      );
      // the clock
      this.add(
        place(
          tinted(new CylinderGeometry(0.55, 0.55, 0.08, 16).rotateX(Math.PI / 2), 0xf2ead6),
          xm,
          y0 + 5.35,
          Z(2.66),
        ),
        this.lambert(),
      );
      g.color(0x1f2124).box(
        xm - 0.03,
        y0 + 5.33,
        Math.min(Z(2.7), Z(2.72)),
        xm + 0.03,
        y0 + 5.75,
        Math.max(Z(2.7), Z(2.72)),
      );
      g.color(0x1f2124).box(
        xm - 0.02,
        y0 + 5.33,
        Math.min(Z(2.7), Z(2.72)),
        xm + 0.3,
        y0 + 5.37,
        Math.max(Z(2.7), Z(2.72)),
      );
    } else {
      // a little flat canopy over the door
      const [a, c] = zz(0, 1.4);
      g.color(trim).box(xm - 1.6, y0 + 3.75, a, xm + 1.6, y0 + 3.95, c);
      flatSnow(g, xm - 1.55, a, xm + 1.55, c, y0 + 3.95, 0.12, r);
    }
    // the flag on its pole, over the roof's corner
    const fx = b.x0 + 1;
    g.color(0xd8d6cc).box(fx - 0.05, y0 + H, fz - nz * 1 - 0.05, fx + 0.05, y0 + H + 4.2, fz - nz * 1 + 0.05);
    g.color(0x2c3e55).box(fx + 0.05, y0 + H + 3.2, fz - nz * 1 - 0.02, fx + 1.5, y0 + H + 4.1, fz - nz * 1 + 0.02);
    g.color(0xa8322a).box(fx + 0.05, y0 + H + 3.2, fz - nz * 1 - 0.025, fx + 1.5, y0 + H + 3.4, fz - nz * 1 + 0.025);
    this.add(g.build(), this.lambert());
    // its name: on the hall's entablature, over the post office's canopy
    if (b.sign)
      this.signBoard(
        b.sign,
        xm,
        Z(hall ? 2.66 : 0.12),
        nz > 0 ? 0 : Math.PI,
        hall ? 4.4 : 3.6,
        hall ? 0.4 : 0.55,
        hall ? 4.38 : 4.05,
        "#e8e2d2",
        "#2a2e33",
        false,
        !hall,
      );
    this.lights.push({ p: new Vector3(xm, y0 + 3.4, Z(1.4)), kind: "porch", color: 0xffc98a, r: 5 });
    this.pool(xm, Z(2.6), 4.5, 0xffc98a);
  }
  /** A townhouse (docs/plan/33-the-look.md, phase 4): one of three — two storeys under a side
   *  gable, two under a gable to the street with a porch across the front, a storey and a half with
   *  a dormer — in one of seven colours, shutters of another; framed windows on every face, a
   *  chimney, the mailbox at the pavement. */
  private house(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    // (what it looks like: decided with the iso view's — world/grounds-look.ts)
    const L = houseLook(b);
    const q = groundsRng(b.z0 * 17 + b.x0);
    const { kind, H } = L;
    const hex = L.wall;
    const shutter = hexOf(L.shutter);
    const trim = 0xece6da;
    const siding = this.wallPic("siding", hex);
    const { x0, z0, x1, z1 } = b;
    const g = new G();
    this.wallsUV(g, b, y0, H, 3);
    this.add(g.build(), this.lambert(0xffffff, siding, false));
    const r = new G();
    const wallHex = new Color(hex).getHex();
    // the roof: along the street (a side gable) or end on to it (a front gable)
    const front = kind === 1;
    this.pitched(r, x0, z0, x1, z1, y0 + H, L.rise, front, 0x3a3f45, 0.45, wallHex);
    const nx = b.face === "e" ? 1 : -1;
    const fx = b.face === "e" ? x1 : x0;
    const bx = b.face === "e" ? x0 : x1;
    const zm = (z0 + z1) / 2;
    const X = (d: number) => fx + nx * d;
    const xx = (a: number, c: number) => [Math.min(X(a), X(c)), Math.max(X(a), X(c))] as const;
    // the porch: steps, posts, a small roof (across the front for a front gable)
    const pz0 = front ? z0 + 0.4 : zm - 1.6;
    const pz1 = front ? z1 - 0.4 : zm + 1.6;
    {
      const [a, c] = xx(0, 1.6);
      r.color(0x9a948a).box(a, y0, pz0 + 0.2, c, y0 + 0.5, pz1 - 0.2);
      const [sa, sc] = xx(1.6, 2.1);
      r.color(0x8c867c).box(sa, y0, zm - 0.7, sc, y0 + 0.25, zm + 0.7);
      const [ra, rc] = xx(0, 1.8);
      r.color(0x3a3f45).box(ra, y0 + 2.75, pz0, rc, y0 + 2.9, pz1);
      slopeSnow(
        r,
        [X(0.05), y0 + 2.9, pz0 + 0.05],
        [X(0.05), y0 + 2.9, pz1 - 0.05],
        [X(1.75), y0 + 2.9, pz0 + 0.05],
        [X(1.75), y0 + 2.9, pz1 - 0.05],
        0.16,
        q,
        0.5,
      );
      const posts = front ? [pz0 + 0.2, zm - 1.2, zm + 1.2, pz1 - 0.2] : [pz0 + 0.2, pz1 - 0.2];
      for (const z of posts) r.color(trim).box(X(1.6) - 0.08, y0 + 0.5, z - 0.08, X(1.6) + 0.08, y0 + 2.75, z + 0.08);
      // a railing between the posts (not across the steps)
      if (front)
        for (const [za, zb] of [
          [pz0 + 0.2, zm - 1.2],
          [zm + 1.2, pz1 - 0.2],
        ]) {
          r.color(trim).box(X(1.6) - 0.05, y0 + 1.35, za, X(1.6) + 0.05, y0 + 1.45, zb);
          for (let z = za + 0.25; z < zb; z += 0.3)
            r.color(trim).box(X(1.6) - 0.03, y0 + 0.5, z - 0.03, X(1.6) + 0.03, y0 + 1.35, z + 0.03);
        }
    }
    // the door, framed, a light over it
    {
      const [a, c] = xx(0, 0.1);
      r.color(trim).box(a, y0 + 0.5, zm - 0.65, c, y0 + 2.75, zm + 0.65);
      const [da, dc] = xx(0.08, 0.13);
      r.color(new Color(shutter).getHex()).box(da, y0 + 0.5, zm - 0.5, dc, y0 + 2.6, zm + 0.5);
    }
    // windows: framed, shuttered at the front, a sill on the rest
    const win = (
      x: number,
      y: number,
      z: number,
      ww: number,
      hh: number,
      wnx: number,
      wnz: number,
      lit: number,
      shut: boolean,
    ) => {
      this.litWindow(x, y, z, ww, hh, wnx, wnz, true, lit);
      this.frame(r, x, y, z, ww, hh, wnx, wnz, trim);
      if (!shut) return;
      const tx = -wnz;
      const tz = wnx;
      for (const s of [-1, 1]) {
        const cx = x + tx * s * (ww / 2 + 0.38);
        const cz = z + tz * s * (ww / 2 + 0.38);
        const hw = 0.3;
        r.color(shutter).box(
          Math.min(cx - tx * hw, cx + tx * hw) + Math.min(0, wnx * 0.04),
          y,
          Math.min(cz - tz * hw, cz + tz * hw) + Math.min(0, wnz * 0.04),
          Math.max(cx - tx * hw, cx + tx * hw) + Math.max(0, wnx * 0.1),
          y + hh,
          Math.max(cz - tz * hw, cz + tz * hw) + Math.max(0, wnz * 0.1),
        );
      }
    };
    for (const dz of [-2.7, 2.7]) win(fx, y0 + 0.9, zm + dz, 1.1, 1.5, nx, 0, q() < 0.4 ? 0.7 : 0, true);
    if (kind === 2) {
      // the dormer, out of the roof to the street
      const dy = y0 + H + 0.6;
      const [a, c] = xx(-2.6, 0.3);
      r.color(wallHex).box(a, y0 + H, zm - 1.1, c, dy + 1.6, zm + 1.1);
      this.pitched(
        r,
        Math.min(X(-2.6), X(0.3)),
        zm - 1.1,
        Math.max(X(-2.6), X(0.3)),
        zm + 1.1,
        dy + 1.6,
        0.9,
        true,
        0x3a3f45,
        0.2,
        wallHex,
      );
      win(X(0.3), dy + 0.15, zm, 1, 1.2, nx, 0, q() < 0.3 ? 0.6 : 0, false);
    } else for (const dz of [-2.7, 0, 2.7]) win(fx, y0 + 3.9, zm + dz, 1.0, 1.4, nx, 0, q() < 0.3 ? 0.6 : 0, true);
    if (front) win(fx, y0 + H + 0.8, zm, 0.8, 1.0, nx, 0, q() < 0.3 ? 0.6 : 0, false); // the attic's, in the gable
    // the back and the sides
    for (const dz of [-2.4, 2.4]) win(bx, y0 + 0.9, zm + dz, 1, 1.3, -nx, 0, q() < 0.25 ? 0.6 : 0, false);
    if (kind !== 2)
      for (const dz of [-2.4, 2.4]) win(bx, y0 + 3.9, zm + dz, 1, 1.3, -nx, 0, q() < 0.25 ? 0.6 : 0, false);
    const xc = (x0 + x1) / 2;
    for (const [z, nzz] of [
      [z0, -1],
      [z1, 1],
    ] as const) {
      win(xc, y0 + 0.9, z, 1, 1.3, 0, nzz, q() < 0.2 ? 0.6 : 0, false);
      if (kind !== 2) win(xc, y0 + 3.9, z, 1, 1.3, 0, nzz, q() < 0.2 ? 0.6 : 0, false);
    }
    // the chimney, at one end of the ridge
    {
      const cz = L.chimneyEnd ? z0 + 1.6 : z1 - 1.6;
      const cxx = front ? (q() < 0.5 ? x0 + 2 : x1 - 2) : xc;
      const top = y0 + H + L.rise + 0.8;
      r.color(0x7b3b2c).box(cxx - 0.4, y0 + H, cz - 0.35, cxx + 0.4, top, cz + 0.35);
      r.color(0x5b4a44).box(cxx - 0.48, top, cz - 0.43, cxx + 0.48, top + 0.15, cz + 0.43);
      flatSnow(r, cxx - 0.46, cz - 0.41, cxx + 0.46, cz + 0.41, top + 0.15, 0.12, q);
    }
    // the mailbox at the pavement
    const mz = z1 - 0.5;
    r.color(0x3a3f45).box(X(1.9) - 0.05, y0, mz - 0.05, X(1.9) + 0.05, y0 + 1.1, mz + 0.05);
    r.color(0x2a2e33).box(X(1.9) - 0.22, y0 + 1.1, mz - 0.25, X(1.9) + 0.22, y0 + 1.38, mz + 0.25);
    r.color(0xa8322a).box(X(1.9) + 0.22, y0 + 1.2, mz + 0.1, X(1.9) + 0.25, y0 + 1.5, mz + 0.16); // its flag
    r.color(SNOW).box(X(1.9) - 0.22, y0 + 1.38, mz - 0.25, X(1.9) + 0.22, y0 + 1.45, mz + 0.25);
    this.add(r.build(), this.lambert());
    this.lights.push({ p: new Vector3(X(1.2), y0 + 2.6, zm), kind: "porch", color: 0xffc98a, r: 3 });
    this.pool(X(2), zm, 3, 0xffc98a);
  }
  /** A window with a pointed head (the church's), lit by the hour. */
  private pointed(x: number, y: number, z: number, w: number, h: number, nx: number, nz: number, on: number) {
    const g = this.windows(true, on);
    const tx = -nz;
    const tz = nx;
    const o = 0.04;
    const P = (u: number, v: number): V => [x + tx * u + nx * o, y + v, z + tz * u + nz * o];
    face(g, P(-w / 2, 0), P(w / 2, 0), P(w / 2, h), P(-w / 2, h), [nx, 0, nz]);
    // the arch: a fan of faces up to its point
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI;
      const a1 = ((i + 1) / n) * Math.PI;
      const pt = (a: number): V => {
        const u = Math.cos(a) * (w / 2);
        const v = Math.sin(a) * w * 0.75;
        return P(u, h + v * (1 - 0.25 * Math.abs(Math.cos(a))));
      };
      face(g, P(0, h), pt(a0), pt(a1), pt(a1), [nx, 0, nz]);
    }
    // its frame: two jambs and a sill, and the snow on the sill
    const fr = new G().color(0xe6e1d6);
    const a = w / 2 + 0.1;
    for (const s of [-1, 1]) {
      const c0 = P(s * a, 0);
      fr.box(c0[0] - 0.06, y, c0[2] - 0.06, c0[0] + 0.06 + nx * 0.06, y + h, c0[2] + 0.06 + nz * 0.06);
    }
    const s0 = P(-a, 0);
    const s1 = P(a, 0);
    fr.box(
      Math.min(s0[0], s1[0]) - 0.05,
      y - 0.12,
      Math.min(s0[2], s1[2]) - 0.05,
      Math.max(s0[0], s1[0]) + 0.05 + nx * 0.12,
      y,
      Math.max(s0[2], s1[2]) + 0.05 + nz * 0.12,
    );
    fr.color(SNOW).box(
      Math.min(s0[0], s1[0]),
      y,
      Math.min(s0[2], s1[2]),
      Math.max(s0[0], s1[0]) + nx * 0.1,
      y + 0.06,
      Math.max(s0[2], s1[2]) + nz * 0.1,
    );
    this.add(fr.build(), this.lambert());
  }
  /** The church: white clapboard, pointed windows, a door up steps under the steeple, its belfry
   *  open (louvres in it), a cross on the spire. */
  private church(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const siding = this.keep(tex(sidingCanvas(this.T, "#ecebe5")));
    const H = 6;
    const { x0, z0, x1, z1 } = b;
    const g = new G();
    this.wallsUV(g, b, y0, H, 3);
    this.add(g.build(), this.lambert(0xffffff, siding, false));
    const r = new G();
    this.pitched(r, x0, z0, x1, z1, y0 + H, 6, false, 0x2f343a, 0.5, 0xecebe5);
    const xm = (x0 + x1) / 2;
    const sz0 = z1 - 1;
    const sz1 = z1 + 2.5;
    // the steeple: a tower, a belfry with open louvred sides, its cornices, the spire and a cross
    r.color(0xecebe5).box(xm - 2, y0, sz0, xm + 2, y0 + 10, sz1);
    r.color(0xe0ddd4).box(xm - 2.15, y0 + 10, sz0 - 0.15, xm + 2.15, y0 + 10.3, sz1 + 0.15);
    for (const [px, pz] of [
      [-1.75, sz0 + 0.25],
      [1.75, sz0 + 0.25],
      [-1.75, sz1 - 0.25],
      [1.75, sz1 - 0.25],
    ])
      r.color(0xecebe5).box(xm + px - 0.25, y0 + 10.3, pz - 0.25, xm + px + 0.25, y0 + 12.8, pz + 0.25);
    r.color(0x1a1d21).box(xm - 1.5, y0 + 10.3, sz0 + 0.5, xm + 1.5, y0 + 12.8, sz1 - 0.5); // the dark inside
    for (let y = 10.6; y < 12.6; y += 0.32) {
      r.color(0xd8d4ca).box(xm - 1.5, y0 + y, sz1 - 0.55, xm + 1.5, y0 + y + 0.08, sz1 - 0.35);
      r.color(0xd8d4ca).box(xm - 1.5, y0 + y, sz0 + 0.35, xm + 1.5, y0 + y + 0.08, sz0 + 0.55);
      r.color(0xd8d4ca).box(xm - 1.75, y0 + y, sz0 + 0.5, xm - 1.55, y0 + y + 0.08, sz1 - 0.5);
      r.color(0xd8d4ca).box(xm + 1.55, y0 + y, sz0 + 0.5, xm + 1.75, y0 + y + 0.08, sz1 - 0.5);
    }
    r.color(0x2f343a).box(xm - 2.2, y0 + 12.8, sz0 - 0.2, xm + 2.2, y0 + 13.4, sz1 + 0.2);
    flatSnow(r, xm - 2.15, sz0 - 0.15, xm + 2.15, sz1 + 0.15, y0 + 13.4, 0.15, groundsRng(b.x0));
    r.color(0x8b8f93).box(xm - 0.05, y0 + 21.6, (sz0 + sz1) / 2 - 0.05, xm + 0.05, y0 + 23.2, (sz0 + sz1) / 2 + 0.05);
    r.color(0x8b8f93).box(xm - 0.4, y0 + 22.5, (sz0 + sz1) / 2 - 0.05, xm + 0.4, y0 + 22.6, (sz0 + sz1) / 2 + 0.05);
    // the door up steps on the steeple's face
    r.color(0xe0ddd4).box(xm - 1.2, y0, sz1, xm + 1.2, y0 + 3.4, sz1 + 0.12);
    r.color(0x5a2a22).box(xm - 0.85, y0 + 0.45, sz1 + 0.12, xm + 0.85, y0 + 2.9, sz1 + 0.18);
    r.color(0x2a1a16).box(xm - 0.02, y0 + 0.45, sz1 + 0.18, xm + 0.02, y0 + 2.9, sz1 + 0.2);
    for (let k = 0; k < 3; k++)
      r.color(0xc9c3b6).box(xm - 2 + k * 0.15, y0, sz1, xm + 2 - k * 0.15, y0 + 0.15 * (k + 1), sz1 + 1.4 - k * 0.4);
    this.add(r.build(), this.lambert());
    const spire = tinted(new ConeGeometry(2.1, 8.2, 4).rotateY(Math.PI / 4).translate(0, 4.1, 0), 0x2f343a);
    this.add(place(spire, xm, y0 + 13.4, (sz0 + sz1) / 2), this.lambert());
    const snowCap = tinted(new ConeGeometry(2.14, 1.2, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.6, 0), 0xf2f5f8);
    this.add(place(snowCap, xm, y0 + 13.4, (sz0 + sz1) / 2), this.lambert());
    for (const z of [z0 + 4, z0 + 9, z0 + 14, z0 + 19])
      for (const [x, nx] of [
        [x0, -1],
        [x1, 1],
      ] as const)
        this.pointed(x, y0 + 1.3, z, 1.3, 2.6, nx, 0, 0.6);
    this.pointed(xm, y0 + 7.4, sz1, 0.9, 1.0, 0, 1, 0.8);
    this.lights.push({ p: new Vector3(xm, y0 + 3.2, sz1 + 1.2), kind: "porch", color: 0xffc98a, r: 4 });
    this.pool(xm, sz1 + 2.2, 4, 0xffc98a);
  }
  private gas(b: Building) {
    const y0 = groundAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const g = new G();
    // the kiosk at the back, the canopy over the pumps at the front
    g.color(0xd8d4cb).box(b.x0 + 2, y0, b.z1 - 6, b.x0 + 12, y0 + 3.2, b.z1);
    flatSnow(g, b.x0 + 1.8, b.z1 - 6.2, b.x0 + 12.2, b.z1 + 0.2, y0 + 3.2, 0.32, groundsRng(b.x0 + 5));
    for (const x of [b.x0 + 3, b.x1 - 3])
      for (const z of [b.z0 + 2, b.z0 + 8]) g.color(0xe9e9e6).box(x - 0.25, y0, z - 0.25, x + 0.25, y0 + 4.6, z + 0.25);
    g.color(0xb8322a).box(b.x0 + 1, y0 + 4.6, b.z0, b.x1 - 1, y0 + 5.4, b.z0 + 10);
    flatSnow(g, b.x0 + 0.95, b.z0 - 0.05, b.x1 - 0.95, b.z0 + 10.05, y0 + 5.4, 0.32, groundsRng(b.x1 + 5));
    icicles(g, [b.x0 + 1, y0 + 4.6, b.z0 - 0.02], [b.x1 - 1, y0 + 4.6, b.z0 - 0.02], groundsRng(b.z0 + 5), 0.4);
    // the islands: a kerb, two pumps each (a red body, a white head with its dials, a hose
    // hanging to the nozzle in its holster), a bin and a squeegee bucket at the end
    const dials = new G().color(0xffffff);
    for (const x of [b.x0 + 7, b.x1 - 7]) {
      g.color(0x9a948a).box(x - 0.6, y0, b.z0 + 3.2, x + 0.6, y0 + 0.25, b.z0 + 6.8);
      g.color(0xd8a62a).box(x - 0.62, y0 + 0.25, b.z0 + 3.18, x + 0.62, y0 + 0.3, b.z0 + 3.4);
      for (const z of [b.z0 + 4.5, b.z0 + 5.5]) {
        g.color(0xb8322a).box(x - 0.35, y0 + 0.25, z - 0.3, x + 0.35, y0 + 1.25, z + 0.3);
        g.color(0xe9e6dc).box(x - 0.37, y0 + 1.25, z - 0.32, x + 0.37, y0 + 1.85, z + 0.32);
        g.color(0x2a2e33).box(x - 0.37, y0 + 1.85, z - 0.32, x + 0.37, y0 + 1.92, z + 0.32);
        flatSnow(g, x - 0.36, z - 0.31, x + 0.36, z + 0.31, y0 + 1.92, 0.08, groundsRng(Math.round(x * 3 + z)));
        for (const s of [-1, 1]) {
          dials.quad(
            [x + s * 0.375, y0 + 1.38, z - 0.2],
            [x + s * 0.375, y0 + 1.38, z + 0.2],
            [x + s * 0.375, y0 + 1.72, z + 0.2],
            [x + s * 0.375, y0 + 1.72, z - 0.2],
            [s, 0, 0],
          );
          g.color(0x2a2e33).box(x + s * 0.36, y0 + 0.75, z + 0.05, x + s * 0.46, y0 + 1.05, z + 0.17); // the nozzle
          beam(g, [x + s * 0.4, y0 + 1.6, z - 0.1], [x + s * 0.55, y0 + 0.5, z - 0.05], 0.05, 0x1f2124);
          beam(g, [x + s * 0.55, y0 + 0.5, z - 0.05], [x + s * 0.42, y0 + 0.95, z + 0.1], 0.05, 0x1f2124);
        }
      }
      g.color(0x2f4a3b).box(x - 0.22, y0 + 0.25, b.z0 + 6.2, x + 0.22, y0 + 1.0, b.z0 + 6.6);
      g.color(0x3a6b8a).box(x - 0.18, y0 + 0.25, b.z0 + 3.5, x + 0.18, y0 + 0.75, b.z0 + 3.85);
    }
    this.add(g.build(), this.lambert());
    this.add(
      dials.build(),
      this.glows(
        this.keep(new MeshLambertMaterial({ color: 0x1d2a22, emissive: 0x9ff0b0, emissiveIntensity: 0 })),
        0.9,
        "sign",
      ),
      "none",
    );
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

  // ── the Kart Park (docs/plan/46-the-karts.md): its floodlights and the gate's lamps among the
  // lamps, their pools on the ground; the park itself (tp/karts3d.ts, a chunk of its own, loaded
  // when the steps get here: the step waits for it) ──
  private parkMod: {
    m: typeof import("./karts3d");
    T3: typeof import("three");
    items: typeof import("../art/items");
  } | null = null;
  private parkLoading = false;
  private kartParkLamps() {
    for (const f of kartFloods()) {
      const y = groundAt(f.x, f.z);
      this.lights.push({ p: new Vector3(f.x, y + 12.8, f.z), kind: "porch", color: 0xfff0d6, r: 16 });
      this.pool(f.x + Math.cos(f.ry) * 12, f.z + Math.sin(f.ry) * 12, 11, 0xfff0d6);
    }
    // the stands' lights (shared standLights; the game's are the view's — tp/view.ts) and the
    // floods' pools on the straight
    for (const l of standLights()) {
      const y = groundAt(l.x, l.z);
      this.lights.push({ p: new Vector3(l.x, y + l.h, l.z), kind: "porch", color: 0xffe6bc, r: l.radius });
      if (l.pz !== l.z) this.pool(l.x, l.pz, l.pool, 0xfff0d6);
    }
    const gy = groundAt(KART_GATE.x, KART_GATE.z);
    this.lights.push({ p: new Vector3(KART_GATE.x, gy + 6.6, KART_GATE.z + 1), kind: "porch", color: 0xffd9a0, r: 8 });
    this.pool(KART_GATE.x, KART_GATE.z + 3, 6, 0xffd9a0);
  }
  private kartPark() {
    if (!this.parkMod) {
      if (!this.parkLoading) {
        this.parkLoading = true;
        // (and the item art: the fire's benches are the office's — kart/park3d.ts)
        void Promise.all([loadKarts(), import("three"), import("../art/items")]).then(([m, T3, items]) => {
          this.parkMod = { m, T3, items };
        });
      }
      this.pending.push(() => this.kartPark());
      return;
    }
    const { m, T3, items } = this.parkMod;
    const g = new Group();
    const park = m.stageKarts(
      T3,
      g,
      // (the stands' painted crowd: their seats; the rest are for people: shared kartSeats)
      { karts: [], rack: true, crowd: KART_CROWD, lap: "—", order: [], noCrates: true, circuit: false },
      { night: 0, lit: false, cam: new Vector3(KART_PARK.x, 0, KART_PARK.z), items },
    );
    for (const x of park.glows) this.glows(x.m, x.on);
    this.root.add(g);
    this.disposables.push(park);
    this.parkBuilt = true;
    this.kartCircuit();
  }

  // ── the circuit raced (docs/plan/47-the-track-changer.md): built a part a step, and again when
  // the layout changes — the new one swapped in for the old in one step, nothing missing between ──
  private parkBuilt = false;
  private circuitWant = "";
  private circuit: { id: string; g: Group; dispose(): void } | null = null;
  /** circuits being built (their parts so far), and old ones waiting a step to go: freed with the
   *  Grounds if they're still about */
  private circuitBuilds = new Set<{ dispose(): void }[]>();
  private circuitGone = new Set<{ dispose(): void }>();
  /** The layout raced drawn (now or a few steps on). Asked every frame (tick): cheap. */
  private kartCircuit() {
    if (!this.parkMod || !this.parkBuilt) return;
    const now = kartLayoutNow();
    const id = `${now.key}${now.reverse ? "-r" : ""}`;
    if (id === this.circuitWant) return;
    this.circuitWant = id;
    // (a change before this client saw the last one's show out: that one's done now)
    this.showEnd();
    const { m, T3 } = this.parkMod;
    const g = new Group();
    g.name = "kart-circuit";
    const made: { dispose(): void }[] = [];
    this.circuitBuilds.add(made);
    const keep = <T extends { dispose(): void }>(d: T): T => {
      made.push(d);
      return d;
    };
    const parts = m.buildCircuit(T3, kartTrack(now.key, now.reverse), g, 0, keep);
    const step = () => {
      // (wanted no more: another layout since)
      if (this.circuitWant !== id) {
        for (const d of made) d.dispose();
        this.circuitBuilds.delete(made);
        return;
      }
      if (!parts.next().done) {
        this.pending.push(step);
        return;
      }
      this.circuitBuilds.delete(made);
      // (the new one in first: what this step added is what gets the Grounds' light — step())
      this.root.add(g);
      // the gantry over the line (the park's): its lights to the grid, whichever way it's raced
      const gantry = this.root.getObjectByName("kart-gantry");
      if (gantry) {
        const p = trackAt(kartTrack(now.key, now.reverse), 0);
        gantry.position.x = p.x;
        gantry.position.z = p.z;
        gantry.rotation.y = -p.a;
      }
      const old = this.circuit;
      this.circuit = {
        id,
        g,
        dispose: () => {
          for (const d of made) d.dispose();
          g.removeFromParent();
        },
      };
      // the bridge (the park's: there for a layout over it), sunk under the snow or risen out of it
      // as the ploughs go
      const bridge = this.root.getObjectByName("kart-bridge");
      const has = kartBridged(now.key);
      if (kartShowNow() >= 0) {
        // (the change's show on: the new one drawn behind the ploughs, the old drifting over)
        this.showBegin(g, kartTrack(now.key, now.reverse), old);
        if (this.shown && bridge && bridge.visible !== has) this.shown.bridge = { o: bridge, has };
      } else {
        if (bridge) bridge.visible = has;
        // (the old one gone a step on: removed in this one, what this step added would come back
        // short — step() — and the new one go unlit)
        if (old) {
          this.circuitGone.add(old);
          this.pending.push(() => {
            this.circuitGone.delete(old);
            old.dispose();
          });
        }
      }
    };
    this.pending.push(step);
  }

  // ── the change's show (docs/plan/47-the-track-changer.md, phase 6): the new circuit drawn behind
  // the ploughs (its sweeps to the ploughs' phase — karts3d.ts makeSweep —, the rest as a plough
  // passes), lifted a little over the old; the old one whitening under the snow, gone at the end ──
  private shown: {
    g: Group;
    parts: { o: Mesh; ph: number[]; n: number[] }[];
    bits: { o: Object3D; ph: number }[];
    old: { dispose(): void } | null;
    mats: { m: MeshStandardMaterial; c: Color; e: number }[];
    /** the old's parts a colour can't whiten (a map, vertex colours): hidden once the rest's white */
    painted: Object3D[];
    /** the bridge, going (`has` false) or coming */
    bridge?: { o: Object3D; has: boolean };
    f: number;
    t: number;
  } | null = null;
  private showBegin(g: Group, t: ReturnType<typeof kartTrack>, old: { g: Group; dispose(): void } | null) {
    this.showEnd();
    const q = t.len / KART_SHOW.ploughs;
    const parts: NonNullable<typeof this.shown>["parts"] = [];
    const bits: NonNullable<typeof this.shown>["bits"] = [];
    const at = new Vector3();
    g.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const rv = o.userData.reveal as { ph: number[]; n: number[] } | undefined;
      if (rv) {
        parts.push({ o, ph: rv.ph, n: rv.n });
        o.geometry.setDrawRange(0, 0);
        return;
      }
      // (a thing on its own: shown as the plough gets to the nearest of the circuit)
      // (an instanced one's spread is its instances')
      let sp: Sphere | null;
      if (o instanceof InstancedMesh) {
        o.computeBoundingSphere();
        sp = o.boundingSphere;
      } else {
        o.geometry.computeBoundingSphere();
        sp = o.geometry.boundingSphere;
      }
      // (in the circuit's own frame, the Grounds' coords: each is the circuit's child)
      o.updateMatrix();
      at.copy(sp?.center ?? at.set(0, 0, 0)).applyMatrix4(o.matrix);
      let best = 0;
      let bd = Number.POSITIVE_INFINITY;
      for (const p of t.pts) {
        const d = (p.x - at.x) ** 2 + (p.z - at.z) ** 2;
        if (d < bd) {
          bd = d;
          best = p.s;
        }
      }
      bits.push({ o, ph: (best % q) / q });
      o.visible = false;
    });
    g.position.y = 0.02;
    const mats: NonNullable<typeof this.shown>["mats"] = [];
    const painted: Object3D[] = [];
    if (old) {
      old.g.position.y = -0.02;
      const seen = new Set<MeshStandardMaterial>();
      old.g.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if ((m as MeshStandardMaterial).map || (m as MeshStandardMaterial).vertexColors) painted.push(o);
          if (m instanceof MeshStandardMaterial && !seen.has(m)) {
            seen.add(m);
            mats.push({ m, c: m.color.clone(), e: m.emissiveIntensity });
          }
        }
      });
    }
    this.shown = { g, parts, bits, old, mats, painted, f: Math.max(0, kartShowNow()), t: -1 };
  }
  private kartShow(t: number) {
    const sh = this.shown;
    if (!sh) return;
    const dt = sh.t < 0 ? 0 : Math.min(0.1, t - sh.t);
    sh.t = t;
    const want = kartShowNow();
    if (want < 0 || sh.g.parent !== this.root) return this.showEnd();
    // (the server's a few times a second: run on between, never far ahead of it)
    const run = 1000 / (KART_SHOW.to - KART_SHOW.from);
    sh.f = Math.max(want, Math.min(sh.f + dt * run, want + 0.04));
    for (const p of sh.parts) {
      let i = 0;
      while (i < p.ph.length && p.ph[i] <= sh.f) i++;
      p.o.geometry.setDrawRange(0, i ? p.n[i - 1] : 0);
    }
    for (const b of sh.bits) b.o.visible = b.ph <= sh.f;
    // the old: white over, its lights out
    const w = Math.min(1, sh.f / 0.6);
    for (const m of sh.mats) {
      m.m.color.copy(m.c).lerp(SHOW_SNOW, w);
      m.m.emissiveIntensity = m.e * (1 - w);
    }
    for (const o of sh.painted) o.visible = w < 1;
    if (sh.bridge) {
      const up = sh.bridge.has ? sh.f : 1 - sh.f;
      sh.bridge.o.visible = up > 0;
      sh.bridge.o.position.y = -BRIDGE_SINK * (1 - up);
    }
  }
  private showEnd() {
    const sh = this.shown;
    if (!sh) return;
    this.shown = null;
    for (const p of sh.parts) p.o.geometry.setDrawRange(0, Number.POSITIVE_INFINITY);
    for (const b of sh.bits) b.o.visible = true;
    sh.g.position.y = 0;
    if (sh.bridge) {
      sh.bridge.o.visible = sh.bridge.has;
      sh.bridge.o.position.y = 0;
    }
    sh.old?.dispose();
  }

  // ── the car dealer's forecourt (docs/plan/43-the-spot.md, tp/spot3d.ts): its concrete, kerb,
  // rail, signs, bunting and flood lamps; the vehicles on show are cars (shared car/homes.ts) ──
  private motors() {
    const { yard } = MOTORS;
    if (!this.near((yard.x0 + yard.x1) / 2, (yard.z0 + yard.z1) / 2, 40)) return;
    const m = motorsForecourt(this.T, groundAt(512, -389));
    m.root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      this.keep(o.geometry);
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        this.keep(mat);
        if ((mat as MeshLambertMaterial).map) this.keep((mat as MeshLambertMaterial).map as Texture);
      }
    });
    this.root.add(m.root);
    for (const l of m.lit) this.glows(l.m, l.on, l.m.map ? "sign" : "lamp");
    for (const p of m.floods) {
      this.lights.push({ p, kind: "porch", color: 0xfff1d6, r: 9 });
      this.pool(p.x, p.z, 7, 0xfff1d6);
    }
  }

  // ── lamps: posts, heads lit at night, pools of light on the snow ──
  private lampGeo: BufferGeometry[] = [];
  private headGeo = new G();
  private glowCards: { x: number; y: number; z: number; s: number; c: number }[] = [];
  private pools = new G();
  // (draped over the ground a cell at a time: one flat quad at the lamp's own height sank under
  // the land's rolls and the road's camber round it, and most of a pool went unseen)
  private pool(x: number, z: number, r: number, c = 0xdce8ff) {
    if (!this.near(x, z, 10)) return;
    this.pools.color(c);
    const N = Math.max(2, Math.ceil(r / 1.5));
    const y = (px: number, pz: number) => groundAt(px, pz) + 0.1;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const [x0, x1] = [x - r + (2 * r * i) / N, x - r + (2 * r * (i + 1)) / N];
        const [z0, z1] = [z - r + (2 * r * j) / N, z - r + (2 * r * (j + 1)) / N];
        const [u0, u1, v0, v1] = [i / N, (i + 1) / N, j / N, (j + 1) / N];
        this.pools.quad(
          [x0, y(x0, z0), z0],
          [x1, y(x1, z0), z0],
          [x1, y(x1, z1), z1],
          [x0, y(x0, z1), z1],
          [0, 1, 0],
          [
            [u0, v0],
            [u1, v0],
            [u1, v1],
            [u0, v1],
          ],
        );
      }
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
    // (the Kart Park's floods are its own masts: karts3d.ts, their pools kartParkLamps)
    for (const l of LAMPS) if (l.kind !== "flood") this.lampAt(l.x, l.z, l.ry, l.kind);
    if (this.lampGeo.length) this.add(mergeGeometries(this.lampGeo, false), this.lambert());
    for (const g of this.lampGeo) g.dispose();
    const head = this.glows(
      this.keep(new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, toneMapped: false })),
      1,
      "lamp",
    );
    if (!this.headGeo.empty) this.add(this.headGeo.build(), head, "none");
    // the pools: added light on the ground — over whatever's painted on it (the paddock's paint, a
    // circuit's lines: pulled to the camera by their polygon offset, at a glancing look they came
    // in front of the pool and hid it, a straight edge across the ground past some distance)
    const pm = this.glows(
      this.keep(
        new MeshBasicMaterial({
          map: this.ts.pool,
          vertexColors: true,
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -10,
          polygonOffsetUnits: -4,
        }),
      ),
      0.85,
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
        posts.box(x - 0.05, y - 0.2, z - 0.05, x + 0.05, y + 2.45, z + 0.05);
        // which way is out (the arms lean out over it)
        const mx = (x + x2) / 2;
        const mz = (z + z2) / 2;
        const out = insideFence(mx - tz * 2, mz + tx * 2) ? -1 : 1;
        const ox = -tz * out;
        const oz = tx * out;
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
        // the top rail; the arm leaning out at the top, three strands along the arms
        beam(posts, [x, y + 2.4, z], [x2, y2 + 2.4, z2], 0.06, 0x5d6268, true);
        beam(posts, [x, y + 2.4, z], [x + ox * 0.45, y + 2.95, z + oz * 0.45], 0.05, 0x5d6268);
        for (const k of [0.15, 0.5, 0.85])
          beam(
            wire,
            [x + ox * 0.45 * k, y + 2.4 + 0.55 * k, z + oz * 0.45 * k],
            [x2 + ox * 0.45 * k, y2 + 2.4 + 0.55 * k, z2 + oz * 0.45 * k],
            0.025,
            0x3a3e44,
          );
        // snow caught on the mesh's foot, following the ground
        posts.color(0xf4f7fa);
        face(posts, [x, y - 0.05, z], [x2, y2 - 0.05, z2], [x2, y2 + 0.32, z2], [x, y + 0.38, z], [ox, 0, oz]);
        face(
          posts,
          [x, y + 0.38, z],
          [x2, y2 + 0.32, z2],
          [x2 + ox * 0.6, y2 - 0.05, z2 + oz * 0.6],
          [x + ox * 0.6, y - 0.05, z + oz * 0.6],
          [ox, 1, oz],
        );
        face(posts, [x, y - 0.05, z], [x2, y2 - 0.05, z2], [x2, y2 + 0.25, z2], [x, y + 0.3, z], [-ox, 0, -oz]);
        face(
          posts,
          [x, y + 0.3, z],
          [x2, y2 + 0.25, z2],
          [x2 - ox * 0.45, y2 - 0.05, z2 - oz * 0.45],
          [x - ox * 0.45, y - 0.05, z - oz * 0.45],
          [-ox, 1, -oz],
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
      // the water tower: four legs splayed out from its foot (inside the ring nobody walks in)
      // to under the tank, braced in X at three levels, a riser up the middle, a ladder, a
      // walkway round the tank with its rail, the tank and its roof under snow, the beacon
      const { x: tx, z: tz } = TOWER;
      const y = terrainAt(tx, tz);
      const g = new G();
      const steel = 0x8e959c;
      const leg = (k: number, yy: number): V => {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const r = 2.3 + ((yy - y) / 24) * 2.6;
        return [tx + Math.cos(a) * r, yy, tz + Math.sin(a) * r];
      };
      for (let k = 0; k < 4; k++) {
        beam(g, leg(k, y), leg(k, y + 24.2), 0.5, steel);
        g.color(0x9a9690).box(
          leg(k, y)[0] - 0.5,
          y - 0.3,
          leg(k, y)[2] - 0.5,
          leg(k, y)[0] + 0.5,
          y + 0.35,
          leg(k, y)[2] + 0.5,
        );
        for (const [y0, y1] of [
          [y + 1, y + 8],
          [y + 8, y + 16],
          [y + 16, y + 24],
        ]) {
          beam(g, leg(k, y0), leg(k + 1, y1), 0.12, 0x6f767d);
          beam(g, leg(k, y1), leg(k + 1, y0), 0.12, 0x6f767d);
          beam(g, leg(k, y1), leg(k + 1, y1), 0.2, steel, true);
        }
      }
      beam(g, [tx, y, tz], [tx, y + 24.5, tz], 0.9, 0x7d848b);
      // the ladder up the south leg (the gate's side)
      {
        const p0 = leg(0, y + 0.3);
        const p1 = leg(0, y + 24);
        for (const o of [-0.25, 0.25])
          beam(g, [p0[0] + o, p0[1], p0[2] + 0.45], [p1[0] + o, p1[1], p1[2] + 0.45], 0.05, 0x5d6268);
        for (let t = 0.02; t < 1; t += 0.03) {
          const p: V = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t + 0.45];
          beam(g, [p[0] - 0.25, p[1], p[2]], [p[0] + 0.25, p[1], p[2]], 0.04, 0x5d6268);
        }
      }
      this.add(g.build(), this.lambert());
      const tank: BufferGeometry[] = [];
      tank.push(place(tinted(new CylinderGeometry(6.6, 4.4, 2.6, 24, 1).translate(0, 25.6, 0), 0xc9ced3), tx, y, tz)); // its bowl
      tank.push(place(tinted(new CylinderGeometry(6.6, 6.6, 6.4, 24, 3).translate(0, 30.1, 0), 0xdadde0), tx, y, tz));
      tank.push(place(tinted(new CylinderGeometry(6.65, 6.65, 0.35, 24).translate(0, 28.2, 0), 0xb9bec4), tx, y, tz)); // seams
      tank.push(place(tinted(new CylinderGeometry(6.65, 6.65, 0.35, 24).translate(0, 31.4, 0), 0xb9bec4), tx, y, tz));
      tank.push(place(tinted(new ConeGeometry(7.1, 3.6, 24, 1).translate(0, 35.1, 0), 0xb4b9bf), tx, y, tz));
      tank.push(
        place(
          tinted(
            new ConeGeometry(7.15, 3.65, 24, 1, true, 0, Math.PI * 2).translate(0, 35.2, 0).scale(1, 1, 1),
            0xf2f5f8,
          ),
          tx,
          y,
          tz,
        ),
      );
      tank.push(place(tinted(new CylinderGeometry(0.35, 0.35, 1.6, 8).translate(0, 37.6, 0), 0x8e959c), tx, y, tz));
      // the walkway round the bowl and its rail
      tank.push(
        place(tinted(new CylinderGeometry(7.6, 7.6, 0.18, 28, 1, false).translate(0, 26.9, 0), 0x6f767d), tx, y, tz),
      );
      tank.push(place(tinted(new CylinderGeometry(7.55, 7.55, 0.08, 28).translate(0, 27.03, 0), 0xf2f5f8), tx, y, tz));
      tank.push(
        place(tinted(new CylinderGeometry(7.6, 7.6, 0.06, 28, 1, true).translate(0, 28.0, 0), 0x5d6268), tx, y, tz),
      );
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 14)
        tank.push(
          place(
            tinted(new BoxGeometry(0.05, 1, 0.05).translate(0, 27.5, 0), 0x5d6268),
            tx + Math.cos(a) * 7.58,
            y,
            tz + Math.sin(a) * 7.58,
          ),
        );
      this.add(mergeGeometries(tank, false), this.lambert());
      for (const t of tank) t.dispose();
      // the beacon: it blinks (tick)
      const beacon = this.keep(
        new MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false, transparent: true, opacity: 0 }),
      );
      const bm = new Mesh(this.keep(new SphereGeometry(0.5, 10, 8)), beacon);
      bm.position.set(tx, y + 38.7, tz);
      this.root.add(bm);
      const halo = new Sprite(
        this.keep(
          new SpriteMaterial({
            map: this.ts.glow,
            color: 0xff3a2a,
            blending: AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0,
          }),
        ),
      );
      halo.position.copy(bm.position);
      halo.scale.setScalar(6);
      this.root.add(halo);
      this.beacon = { m: beacon, halo: halo.material };
      // its fence: chain-link between posts, a gate to the south
      const chain = this.keep(tex(chainCanvas(this.T)));
      const posts = new G().color(0x5d6268);
      const mesh = new G().color(0xffffff);
      const step = Math.PI / 12;
      for (let a = 0; a < Math.PI * 2 - 1e-6; a += step) {
        const P = (an: number): V => [
          tx + Math.cos(an) * 9,
          terrainAt(tx + Math.cos(an) * 9, tz + Math.sin(an) * 9),
          tz + Math.sin(an) * 9,
        ];
        const p = P(a);
        const q = P(a + step);
        posts.box(p[0] - 0.05, p[1] - 0.2, p[2] - 0.05, p[0] + 0.05, p[1] + 2, p[2] + 0.05);
        // (the gap to the south: x within 1.5 of the middle, z past it)
        if ((p[2] > tz && Math.abs(p[0] - tx) < 1.6) || (q[2] > tz && Math.abs(q[0] - tx) < 1.6)) continue;
        const L = Math.hypot(q[0] - p[0], q[2] - p[2]);
        mesh.quad(
          [p[0], p[1] + 0.05, p[2]],
          [q[0], q[1] + 0.05, q[2]],
          [q[0], q[1] + 1.9, q[2]],
          [p[0], p[1] + 1.9, p[2]],
          [Math.cos(a), 0, Math.sin(a)],
          [
            [0, 0],
            [L, 0],
            [L, 1.9],
            [0, 1.9],
          ],
        );
        beam(posts, [p[0], p[1] + 1.95, p[2]], [q[0], q[1] + 1.95, q[2]], 0.06, 0x5d6268, true);
      }
      this.add(posts.build(), this.lambert());
      this.add(
        mesh.build(),
        this.keep(new MeshLambertMaterial({ map: chain, transparent: true, alphaTest: 0.35, side: DoubleSide })),
        "cast",
      );
      this.signBoard("DANGER\nNO CLIMBING", tx + 2.2, tz + 9.15, 0, 1.2, 0.7, 0.9, "#e9e6dc", "#8b2a22", false, false);
    }
    if (this.near(STATUE.x, STATUE.z, 40)) {
      // the plaza paved in slabs (the joints between them dark), snow along its edges; the
      // pedestal in three steps with a cornice and a bronze plaque; the founder in his long
      // coat and hat, pointing the way, green where the weather's had him, snow on him
      const y = groundAt(STATUE.x, STATUE.z);
      const p = new G();
      const rp = groundsRng(4242);
      p.color(0x6f6c66).quad(
        [PLAZA.x0, y + 0.05, PLAZA.z0],
        [PLAZA.x1, y + 0.05, PLAZA.z0],
        [PLAZA.x1, y + 0.05, PLAZA.z1],
        [PLAZA.x0, y + 0.05, PLAZA.z1],
        [0, 1, 0],
      );
      for (let x = PLAZA.x0; x < PLAZA.x1; x += 2)
        for (let z = PLAZA.z0; z < PLAZA.z1; z += 2) {
          const v = rp();
          // (snowed over, now and then, more towards the edges)
          const edge = Math.min(x - PLAZA.x0, PLAZA.x1 - x - 2, z - PLAZA.z0, PLAZA.z1 - z - 2);
          const snowy = rp() < (edge < 3 ? 0.55 : 0.12);
          p.color(snowy ? 0xe9eef2 : v < 0.33 ? 0xb4b0a8 : v < 0.66 ? 0xbcb8b0 : 0xa9a59d).quad(
            [x + 0.05, y + 0.07, z + 0.05],
            [x + 1.95, y + 0.07, z + 0.05],
            [x + 1.95, y + 0.07, z + 1.95],
            [x + 0.05, y + 0.07, z + 1.95],
            [0, 1, 0],
          );
        }
      const X = STATUE.x;
      const Z = STATUE.z;
      p.color(0x8f8b83).box(X - 2.4, y, Z - 2.4, X + 2.4, y + 0.3, Z + 2.4);
      p.color(0x97938b).box(X - 2.0, y + 0.3, Z - 2.0, X + 2.0, y + 0.6, Z + 2.0);
      p.color(0x9d988f).box(X - 1.4, y + 0.6, Z - 1.4, X + 1.4, y + 2.9, Z + 1.4);
      p.color(0xa8a39a).box(X - 1.6, y + 2.9, Z - 1.6, X + 1.6, y + 3.2, Z + 1.6);
      p.color(0x5f6b5a).box(X - 0.7, y + 1.3, Z - 1.42, X + 0.7, y + 2.1, Z - 1.38); // the plaque (north, to the street)
      flatSnow(p, X - 2.35, Z - 2.35, X + 2.35, Z + 2.35, y + 0.3, 0.12, rp);
      flatSnow(p, X - 1.55, Z - 1.55, X + 1.55, Z + 1.55, y + 3.2, 0.18, rp);
      this.add(p.build(), this.lambert(), "both");
      const bronze = 0x47423a;
      const verd = 0x5f7a6c;
      const fig: BufferGeometry[] = [
        tinted(new BoxGeometry(0.3, 0.14, 0.18).translate(0.06, 0.07, 0.17), bronze), // his shoes
        tinted(new BoxGeometry(0.3, 0.14, 0.18).translate(0.06, 0.07, -0.17), bronze),
        tinted(new CylinderGeometry(0.12, 0.13, 0.8, 8).translate(0, 0.54, 0.16), bronze),
        tinted(new CylinderGeometry(0.12, 0.13, 0.8, 8).translate(0, 0.54, -0.16), bronze),
        tinted(new CylinderGeometry(0.42, 0.62, 1.8, 12, 1, true).translate(0, 1.45, 0), bronze), // the long coat
        tinted(new CylinderGeometry(0.4, 0.42, 0.65, 12).translate(0, 2.68, 0), bronze),
        tinted(new CylinderGeometry(0.43, 0.43, 0.14, 12).translate(0, 3.05, 0), verd), // the collar
        tinted(new CylinderGeometry(0.13, 0.15, 0.22, 8).translate(0, 3.17, 0), bronze),
        tinted(new SphereGeometry(0.28, 12, 9).translate(0, 3.42, 0), bronze),
        tinted(new CylinderGeometry(0.46, 0.46, 0.05, 14).translate(0, 3.6, 0), verd), // the hat's brim
        tinted(new CylinderGeometry(0.25, 0.28, 0.32, 12).translate(0, 3.78, 0), verd),
        // the arm, out and up the way he points; the hand
        tinted(new CylinderGeometry(0.1, 0.13, 1.25, 7).rotateZ(-1.15).translate(0.6, 3.05, -0.38), verd),
        tinted(new SphereGeometry(0.09, 7, 5).translate(1.17, 3.33, -0.38), bronze),
        // the other at his side, a hat-less hand on a cane
        tinted(new CylinderGeometry(0.1, 0.13, 1.05, 7).rotateZ(0.12).translate(-0.06, 2.4, 0.46), bronze),
        tinted(new CylinderGeometry(0.035, 0.035, 1.9, 6).rotateZ(0.12).translate(-0.12, 0.95, 0.52), 0x2f2c27),
        // snow: on his hat, his shoulders, his arm
        tinted(new CylinderGeometry(0.24, 0.26, 0.07, 12).translate(0, 3.97, 0), SNOW),
        tinted(new CylinderGeometry(0.47, 0.47, 0.04, 14, 1, true).translate(0, 3.645, 0), SNOW),
        tinted(new CylinderGeometry(0.44, 0.44, 0.05, 12).translate(0, 3.12, 0), SNOW),
        tinted(new BoxGeometry(0.9, 0.04, 0.14).rotateZ(0.42).translate(0.6, 3.21, -0.38), SNOW),
      ];
      this.add(place(mergeGeometries(fig, false), STATUE.x, y + 3.2, STATUE.z, Math.PI / 2, 1.05), this.lambert());
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
      // two sawhorse barricades across the road: striped boards on A-frame legs, a lamp on each
      const g = new G();
      const X = ROAD_CLOSED.x;
      for (const zc of [ROAD_CLOSED.z - 4.6, ROAD_CLOSED.z, ROAD_CLOSED.z + 4.6]) {
        for (const dz of [-1.9, 1.9])
          for (const dx of [-0.35, 0.35]) beam(g, [X, y + 1.25, zc + dz], [X + dx, y, zc + dz], 0.08, 0xe9e6dc);
        for (const yy of [0.55, 1.05])
          for (let k = 0; k < 8; k++)
            g.color(k % 2 ? 0xf2f2f2 : 0xc8322a).box(
              X - 0.2,
              y + yy,
              zc - 2.2 + k * 0.55,
              X - 0.16,
              y + yy + 0.22,
              zc - 1.65 + k * 0.55,
            );
        g.color(SNOW).box(X - 0.22, y + 1.27, zc - 2.2, X - 0.14, y + 1.31, zc + 2.2);
        g.color(0x2a2e33).box(X - 0.25, y + 1.27, zc + 1.7, X - 0.1, y + 1.47, zc + 1.9);
      }
      this.add(g.build(), this.lambert());
      const lamps = new G().color(0xffffff);
      for (const zc of [ROAD_CLOSED.z - 4.6, ROAD_CLOSED.z, ROAD_CLOSED.z + 4.6])
        lamps.box(X - 0.27, y + 1.47, zc + 1.72, X - 0.08, y + 1.62, zc + 1.88);
      this.add(
        lamps.build(),
        this.glows(
          this.keep(new MeshLambertMaterial({ color: 0x5a4014, emissive: 0xffb02a, emissiveIntensity: 0 })),
          1.2,
          "lamp",
        ),
        "none",
      );
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

  // ── the town: its street furniture (its parked cars are cars like the lot's: world/car/cars.ts) ──
  private town() {
    if (!this.near(420, -405, 160)) return;
    // the street furniture (shared STREET: it stands in the way)
    const parts = streetGeometry(STREET);
    this.add(mergeGeometries(parts, false), this.lambert());
    for (const p of parts) p.dispose();
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
    this.showEnd();
    this.circuit?.dispose();
    for (const o of this.circuitGone) o.dispose();
    for (const made of this.circuitBuilds) for (const d of made) d.dispose();
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
