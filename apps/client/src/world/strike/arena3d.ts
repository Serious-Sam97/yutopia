// The Strike Park in 3D (docs/plan/114-the-strike-park.md, S-M6, S-M8): the compound (its concrete walls,
// the gallery's parapets, the lobby's desk, the Map Board, the big screen over the gate, the stairs) and the
// map standing in the arena, made from the map's own data (shared strike/map.ts mapBoxes) — one merged mesh a
// material, its textures tiled by the metre. The map is our own (F1); its look the world's: snow on what's
// open to the sky, timber, brick, steel (F5).

import { coloursOf, layoutOf } from "@yutopia/shared/building-styles";
import type { Building } from "@yutopia/shared/grounds";
import {
  climateOf,
  type MapBox,
  type Mat,
  mapBoxes,
  STRIKE_BOARD,
  STRIKE_DESK,
  STRIKE_FIRING_LINE,
  STRIKE_GATE,
  STRIKE_INNER,
  STRIKE_KIT,
  STRIKE_PARK,
  STRIKE_SCREEN,
  STRIKE_SIGN,
  STRIKE_STAIRS,
  STRIKE_TARGETS,
  STRIKE_WALL_H,
  STRIKE_WALL_T,
  STRIKE_YARD,
  type StrikeMap,
  strikeSignPosts,
  strikeSignWings,
  strikeWalls,
} from "@yutopia/shared/strike";
import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
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
  MultiplyBlending,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { asset } from "@/lib/asset";
import {
  kitBatches,
  kitMaterial,
  type MatKey,
  type Pack,
  type Packed,
  packBatches,
  packGeometry,
} from "../tp/kit-buildings";

/** A texture's metres a repeat. */
const TILE = 2;

/** A canvas a material's look (a 256 px square, 2 m of it): drawn once each. */
const looks = new Map<string, CanvasTexture>();
function look(kind: string): CanvasTexture {
  const had = looks.get(kind);
  if (had) return had;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  let seed = [...kind].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const speckle = (n: number, a: number, dark = true) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = dark ? `rgba(0,0,0,${a * rnd()})` : `rgba(255,255,255,${a * rnd()})`;
      g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3);
    }
  };
  switch (kind) {
    case "brick": {
      g.fillStyle = "#8a4b3a";
      g.fillRect(0, 0, 256, 256);
      const bh = 256 / 26;
      for (let r = 0; r < 26; r++) {
        const off = r % 2 ? 0 : 16;
        for (let x = -off; x < 256; x += 32) {
          const k = 0.85 + rnd() * 0.3;
          g.fillStyle = `rgb(${Math.round(138 * k)},${Math.round(75 * k)},${Math.round(58 * k)})`;
          g.fillRect(x + 1, r * bh + 1, 30, bh - 2);
        }
      }
      speckle(500, 0.15);
      break;
    }
    case "plank":
    case "wood": {
      const base = kind === "plank" ? [150, 112, 74] : [112, 80, 52];
      g.fillStyle = `rgb(${base.join(",")})`;
      g.fillRect(0, 0, 256, 256);
      const w = kind === "plank" ? 256 / 10 : 256 / 6;
      for (let x = 0; x < 256; x += w) {
        const k = 0.85 + rnd() * 0.3;
        g.fillStyle = `rgb(${base.map((v) => Math.round(v * k)).join(",")})`;
        g.fillRect(x, 0, w - 2, 256);
        g.fillStyle = "rgba(40,25,10,0.5)";
        g.fillRect(x + w - 2, 0, 2, 256);
        for (let i = 0; i < 8; i++) {
          g.fillStyle = "rgba(60,40,20,0.18)";
          g.fillRect(x + rnd() * w, 0, 1, 256);
        }
      }
      break;
    }
    case "crate": {
      g.fillStyle = "#9c7a4c";
      g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 32) {
        g.fillStyle = "rgba(60,40,20,0.35)";
        g.fillRect(0, y, 256, 2);
      }
      g.strokeStyle = "#5e4426";
      g.lineWidth = 22;
      g.strokeRect(11, 11, 234, 234);
      g.beginPath();
      g.moveTo(11, 11);
      g.lineTo(245, 245);
      g.stroke();
      speckle(300, 0.15);
      break;
    }
    case "metal":
    case "sheet": {
      const base = kind === "sheet" ? [74, 98, 112] : [96, 100, 104];
      for (let x = 0; x < 256; x++) {
        const k = kind === "sheet" ? 0.8 + 0.2 * Math.sin((x / 256) * Math.PI * 24) : 0.92 + rnd() * 0.04;
        g.fillStyle = `rgb(${base.map((v) => Math.round(v * k)).join(",")})`;
        g.fillRect(x, 0, 1, 256);
      }
      speckle(700, 0.12);
      g.fillStyle = "rgba(120,60,30,0.12)";
      for (let i = 0; i < 20; i++) g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 10, 6 + rnd() * 40);
      break;
    }
    case "drywall":
      g.fillStyle = "#d9d4c9";
      g.fillRect(0, 0, 256, 256);
      speckle(400, 0.05);
      g.fillStyle = "rgba(0,0,0,0.06)";
      g.fillRect(0, 0, 2, 256);
      break;
    case "tile":
      g.fillStyle = "#c9c4b8";
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = "rgba(0,0,0,0.15)";
      for (let i = 0; i <= 256; i += 32) {
        g.fillRect(i, 0, 2, 256);
        g.fillRect(0, i, 256, 2);
      }
      break;
    case "rock":
    case "stone": {
      g.fillStyle = kind === "rock" ? "#6f6b66" : "#8c877f";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 60; i++) {
        const k = 0.8 + rnd() * 0.35;
        g.fillStyle = `rgba(${Math.round(120 * k)},${Math.round(116 * k)},${Math.round(110 * k)},0.6)`;
        g.beginPath();
        g.ellipse(rnd() * 256, rnd() * 256, 10 + rnd() * 30, 8 + rnd() * 20, rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
      speckle(500, 0.2);
      break;
    }
    case "snow":
      g.fillStyle = "#eef2f5";
      g.fillRect(0, 0, 256, 256);
      speckle(300, 0.04);
      break;
    default: {
      // concrete
      g.fillStyle = "#9a9a96";
      g.fillRect(0, 0, 256, 256);
      speckle(1400, 0.12);
      speckle(400, 0.08, false);
      g.fillStyle = "rgba(0,0,0,0.08)";
      g.fillRect(0, 127, 256, 2);
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  looks.set(kind, t);
  return t;
}

/** A box `w × h × d` whose faces' UVs run by the metre (TILE m a repeat); its sides cut in rows ~1.2 m high so the
 *  baked light (bakeBox) has vertices to grade up a wall. */
function tiledBox(w: number, h: number, d: number): BoxGeometry {
  const rows = Math.max(1, Math.min(8, Math.round(h / 1.2)));
  const g = new BoxGeometry(w, h, d, 1, rows, 1);
  const uv = g.getAttribute("uv");
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const x = pos.getX(i) + w / 2;
    const y = pos.getY(i) + h / 2;
    const z = pos.getZ(i) + d / 2;
    if (nx > 0.5) uv.setXY(i, z / TILE, y / TILE);
    else if (ny > 0.5) uv.setXY(i, x / TILE, z / TILE);
    else uv.setXY(i, x / TILE, y / TILE);
  }
  return g;
}

// ── the baked light (plan 115 phases 67–79: "light baked"): worked out once as the map's built, no lights to pay for
// each frame — a wall darker toward its foot (where it meets the ground: the contact shadow), anything under a roof
// or a floor above darker still (the interiors' gloom), and a soft shadow on the ground under every block and roof ──

/** Per metre of the map: the lowest underside above head height over it (a roof, an upper floor), Infinity open. */
interface Cover {
  x0: number;
  z0: number;
  w: number;
  d: number;
  at: Float32Array;
}
function coverOf(map: StrikeMap, boxes: MapBox[]): Cover {
  const S = map.size;
  const w = Math.ceil(S.x1 - S.x0);
  const d = Math.ceil(S.z1 - S.z0);
  const at = new Float32Array(w * d).fill(Number.POSITIVE_INFINITY);
  for (const b of boxes) {
    const bottom = b.y - b.hy;
    if (bottom < 1.9 || b.m === "glass") continue;
    // (a turned box by the square round it)
    const ex = Math.abs(Math.cos(b.a)) * b.hx + Math.abs(Math.sin(b.a)) * b.hz;
    const ez = Math.abs(Math.sin(b.a)) * b.hx + Math.abs(Math.cos(b.a)) * b.hz;
    if (ex * ez < 2) continue;
    const i0 = Math.max(0, Math.floor(b.x - ex - S.x0));
    const i1 = Math.min(w - 1, Math.floor(b.x + ex - S.x0));
    const j0 = Math.max(0, Math.floor(b.z - ez - S.z0));
    const j1 = Math.min(d - 1, Math.floor(b.z + ez - S.z0));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (bottom < at[j * w + i]) at[j * w + i] = bottom;
  }
  return { x0: S.x0, z0: S.z0, w, d, at };
}
const coverAt = (c: Cover, x: number, z: number): number => {
  const i = Math.floor(x - c.x0);
  const j = Math.floor(z - c.z0);
  if (i < 0 || j < 0 || i >= c.w || j >= c.d) return Number.POSITIVE_INFINITY;
  return c.at[j * c.w + i];
};
/** The light baked into a box's vertices (its geometry already placed in the world). */
function bakeBox(g: BufferGeometry, b: MapBox, cover: Cover) {
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  const foot = b.y - b.hy;
  const standing = b.hy * 2 > 0.6;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - STRIKE_PARK.x;
    const y = pos.getY(i) - STRIKE_PARK.h;
    const z = pos.getZ(i) - STRIKE_PARK.z;
    let k = 1;
    if (standing) {
      const t = Math.min(1, Math.max(0, (y - foot) / 2.4));
      k = 0.6 + 0.4 * t * t * (3 - 2 * t);
    }
    if (y < coverAt(cover, x, z) - 0.15) k *= 0.74;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
}
/** The ground's soft shadows (a picture multiplied over it): under each block on the ground, under each roof. */
function groundShade(map: StrikeMap, boxes: MapBox[]): Mesh {
  const S = map.size;
  const w = S.x1 - S.x0;
  const d = S.z1 - S.z0;
  const ppm = Math.min(4, 1024 / Math.max(w, d));
  const c = document.createElement("canvas");
  c.width = Math.round(w * ppm);
  c.height = Math.round(d * ppm);
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const shapes = document.createElement("canvas");
  shapes.width = c.width;
  shapes.height = c.height;
  const sg = shapes.getContext("2d") as CanvasRenderingContext2D;
  const rect = (ctx: CanvasRenderingContext2D, b: MapBox, grow: number) => {
    ctx.save();
    ctx.translate((b.x - S.x0) * ppm, (b.z - S.z0) * ppm);
    ctx.rotate(-b.a);
    ctx.fillRect((-b.hx - grow) * ppm, (-b.hz - grow) * ppm, (b.hx + grow) * 2 * ppm, (b.hz + grow) * 2 * ppm);
    ctx.restore();
  };
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  // the roofs' gloom: wide and soft
  sg.fillStyle = "rgba(0,0,0,0.3)";
  for (const b of boxes) if (b.y - b.hy >= 1.9 && b.m !== "glass" && b.hx * b.hz > 1) rect(sg, b, 0);
  g.filter = `blur(${Math.round(ppm * 1.2)}px)`;
  g.globalCompositeOperation = "multiply";
  g.drawImage(shapes, 0, 0);
  // the contact shadows: tight round each block standing on the ground
  sg.clearRect(0, 0, c.width, c.height);
  sg.fillStyle = "rgba(0,0,0,0.72)";
  for (const b of boxes) if (b.y - b.hy < 0.4 && b.hy * 2 > 0.5 && b.m !== "glass") rect(sg, b, 0.55);
  g.filter = `blur(${Math.max(2, Math.round(ppm * 0.9))}px)`;
  g.drawImage(shapes, 0, 0);
  g.filter = "none";
  g.globalCompositeOperation = "source-over";
  const t = new CanvasTexture(c);
  const m = new MeshBasicMaterial({
    map: t,
    transparent: true,
    blending: MultiplyBlending,
    premultipliedAlpha: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -12,
  });
  const mesh = new Mesh(new PlaneGeometry(w, d).rotateX(-Math.PI / 2), m);
  mesh.position.set((S.x0 + S.x1) / 2 + STRIKE_PARK.x, STRIKE_PARK.h + 0.08, (S.z0 + S.z1) / 2 + STRIKE_PARK.z);
  mesh.name = "strike-ground-shade";
  mesh.renderOrder = 1;
  return mesh;
}

const MAT_LOOK: Record<Mat, string> = {
  concrete: "concrete",
  brick: "brick",
  stone: "stone",
  rock: "rock",
  wood: "wood",
  plank: "plank",
  drywall: "drywall",
  metal: "metal",
  sheet: "sheet",
  glass: "glass",
  snow: "snow",
  tile: "tile",
};
/** Tints by a piece's `look` (a container's colour, a mill's paint): its index picks one. */
const SHEET_TINTS = [0x7a8f99, 0x9a5a44, 0x5d7a5a, 0xb08a48, 0x7c6a8f, 0x8a8a84];

/** The looks that are buildings: their sides get windows (lit after dark). */
const FACADES = new Set([
  "mill-house",
  "barn",
  "kiln",
  "mill",
  "hotel",
  "chalet",
  "warehouse",
  "office",
  "weigh-house",
  "depot",
  "cottage",
  "boat-shop",
  "boathouse",
  "range-hut",
  "cabin",
  "neighbour",
  "relay-hut",
  "lift-house",
  "shed",
  "lift-station",
]);
/** A window bay (m): its width, a storey's height. */
const BAY = { w: 3, h: 3.4 };
let windowTex: CanvasTexture | null = null;
/** One bay of a storey: a window in its frame and sill, the rest clear (the wall's own texture shows). */
function windows(): CanvasTexture {
  if (windowTex) return windowTex;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 146;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.clearRect(0, 0, 128, 146);
  // the frame, the glass (dark, a cold sky caught in its top), the bars, the sill
  g.fillStyle = "#e7e1d3";
  g.fillRect(34, 34, 60, 72);
  const glass = g.createLinearGradient(0, 38, 0, 102);
  glass.addColorStop(0, "#5d6f7c");
  glass.addColorStop(1, "#1c232a");
  g.fillStyle = glass;
  g.fillRect(38, 38, 52, 64);
  g.fillStyle = "#e7e1d3";
  g.fillRect(62, 38, 4, 64);
  g.fillRect(38, 68, 52, 3);
  g.fillStyle = "#cfc8b8";
  g.fillRect(30, 106, 68, 5);
  windowTex = new CanvasTexture(c);
  windowTex.wrapS = windowTex.wrapT = RepeatWrapping;
  windowTex.colorSpace = SRGBColorSpace;
  return windowTex;
}
/** The window planes on a box's four sides (bays along each, storeys up it), just off its faces. */
function facadePlanes(b: MapBox, out: BufferGeometry[]) {
  const H = b.hy * 2;
  if (H < 3.2) return;
  const m4 = new Matrix4();
  const sides: [number, number, number, number][] = [
    // [local offset x, local offset z, its width, rotation about y]
    [0, b.hz + 0.03, b.hx * 2, 0],
    [0, -b.hz - 0.03, b.hx * 2, Math.PI],
    [b.hx + 0.03, 0, b.hz * 2, Math.PI / 2],
    [-b.hx - 0.03, 0, b.hz * 2, -Math.PI / 2],
  ];
  for (const [ox, oz, w, ry] of sides) {
    if (w < BAY.w) continue;
    const bays = Math.floor(w / BAY.w);
    const storeys = Math.max(1, Math.floor((H - 0.6) / BAY.h));
    const pw = bays * BAY.w;
    const ph = storeys * BAY.h;
    const g = new PlaneGeometry(pw, ph);
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * bays, uv.getY(i) * storeys);
    const c = Math.cos(b.a);
    const s = Math.sin(b.a);
    m4.makeRotationY(b.a + ry);
    m4.setPosition(
      b.x + ox * c + oz * s + STRIKE_PARK.x,
      b.y - b.hy + 0.2 + ph / 2 + STRIKE_PARK.h,
      b.z - ox * s + oz * c + STRIKE_PARK.z,
    );
    g.applyMatrix4(m4);
    out.push(g);
  }
}

/** What's built, to free. */
export interface Built {
  root: Group;
  dispose(): void;
  /** the floods after dark, 0 … 1: the textured surfaces given back some of their own light */
  lit(k: number): void;
}
/** Each textured Lambert under root lit `k` from within (its own map as the glow). */
function litter(root: Group): (k: number) => void {
  let was = -1;
  return (k) => {
    const q = Math.round(k * 20) / 20;
    if (q === was) return;
    was = q;
    root.traverse((o) => {
      const m = (o as Mesh).material as MeshLambertMaterial | undefined;
      if (!m || !(m as MeshLambertMaterial).isMeshLambertMaterial) return;
      if (m.name === "windows") {
        m.emissiveIntensity = q * 0.55;
        return;
      }
      if (m.map && !m.emissiveMap) {
        m.emissiveMap = m.map;
        m.emissive.set(0xfff1dc);
        m.needsUpdate = true;
      }
      m.emissiveIntensity = q * 0.42;
    });
  };
}

/** The map standing in the arena, in the world (building coords: x, z; y the world's). */
export function buildMap(map: StrikeMap, night: boolean, skip: ReadonlySet<number> = new Set()): Built {
  const root = new Group();
  root.name = `strike-map-${map.key}`;
  const by = new Map<string, BufferGeometry[]>();
  const m4 = new Matrix4();
  const put = (key: string, g: BufferGeometry) => {
    const l = by.get(key);
    if (l) l.push(g);
    else by.set(key, [g]);
  };
  const boxes = mapBoxes(map);
  const fronts: BufferGeometry[] = [];
  const cover = coverOf(map, boxes);
  const snowy = climateOf(map.key).snow >= 0.5;
  for (const b of boxes) {
    // (drawn by the buildings' kit instead: kitDress; by the prop kit: buildProps)
    if (skip.has(b.i)) continue;
    if (props && isPropBox(b)) continue;
    if (b.look && FACADES.has(b.look)) facadePlanes(b, fronts);
    const kind = b.look === "crate" && b.m === "wood" ? "crate" : MAT_LOOK[b.m];
    const g = tiledBox(b.hx * 2, b.hy * 2, b.hz * 2);
    m4.makeRotationY(b.a);
    m4.setPosition(b.x + STRIKE_PARK.x, b.y + STRIKE_PARK.h, b.z + STRIKE_PARK.z);
    g.applyMatrix4(m4);
    bakeBox(g, b, cover);
    // (containers in a few colours: the yard's)
    const tint = b.m === "sheet" ? SHEET_TINTS[Math.abs(Math.round(b.x * 7 + b.z * 3)) % SHEET_TINTS.length] : 0;
    put(`${kind}|${tint}`, g);
    // snow on what's open to the sky and big enough to hold it — on the snowy maps only (a wet or hot map's tops bare:
    // the slabs on its low kerbs and floors read as white flakes over the ground)
    if (snowy && b.m !== "glass" && b.hx > 0.4 && b.hz > 0.4 && openAbove(b, boxes)) {
      const s = tiledBox(b.hx * 2 + 0.06, 0.08, b.hz * 2 + 0.06);
      m4.makeRotationY(b.a);
      m4.setPosition(b.x + STRIKE_PARK.x, b.y + b.hy + 0.04 + STRIKE_PARK.h, b.z + STRIKE_PARK.z);
      s.applyMatrix4(m4);
      bakeBox(s, b, cover);
      put("snow|0", s);
    }
  }
  const mats: Material[] = [];
  for (const [key, list] of by) {
    const [kind, tint] = key.split("|");
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    let mat: Material;
    if (kind === "glass")
      mat = new MeshLambertMaterial({
        color: 0xa9c4d0,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        vertexColors: true,
      });
    else {
      const lm = new MeshLambertMaterial({ map: look(kind), vertexColors: true });
      if (Number(tint)) lm.color = new Color(Number(tint)).multiplyScalar(1.6);
      mat = lm;
    }
    mats.push(mat);
    const mesh = new Mesh(merged, mat);
    mesh.castShadow = kind !== "glass" && kind !== "snow";
    mesh.receiveShadow = true;
    mesh.name = `strike-${kind}`;
    root.add(mesh);
  }
  // (the baked light's shadows on the ground)
  {
    const shade = groundShade(map, boxes);
    mats.push(shade.material as Material);
    root.add(shade);
  }
  // the map's ground over the arena's pad (plan 115 F3: its climate's — sand for the hot maps, mud for the wet; the
  // snowy maps keep the world's snow layer)
  const cg = climateOf(map.key).ground;
  if (cg !== "none") {
    const t = groundTex(cg);
    const S = map.size;
    const w = S.x1 - S.x0;
    const d = S.z1 - S.z0;
    t.repeat.set(w / 6, d / 6);
    // (pulled toward the eye in the depth test as well as lifted: the world's own ground and snow just under it never
    // show through it in flakes, however far off)
    const gm = new MeshLambertMaterial({
      map: t,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -6,
    });
    mats.push(gm);
    const g = new Mesh(new PlaneGeometry(w, d).rotateX(-Math.PI / 2), gm);
    g.position.set((S.x0 + S.x1) / 2 + STRIKE_PARK.x, STRIKE_PARK.h + 0.05, (S.z0 + S.z1) / 2 + STRIKE_PARK.z);
    g.receiveShadow = true;
    g.name = "strike-ground";
    root.add(g);
  }
  // the sites painted on the ground (plan 115 phases 61–62): a stencilled letter in a hazard-striped border, as worn
  // paint; the rescue zone the same, "R"
  const paints: [import("@yutopia/shared/strike").Rect, string][] = [];
  if (map.sites) {
    paints.push([map.sites.A, "A"]);
    if (map.sites.B) paints.push([map.sites.B, "B"]);
  }
  if (map.rescue) paints.push([map.rescue, "RESCUE"]);
  for (const [r, text] of paints) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const t = sitePaint(text, w / d);
    const pm = new MeshLambertMaterial({
      map: t,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -10,
    });
    mats.push(pm);
    const g = new Mesh(new PlaneGeometry(w, d).rotateX(-Math.PI / 2), pm);
    g.position.set(
      (r.x0 + r.x1) / 2 + STRIKE_PARK.x,
      STRIKE_PARK.h + floorUnder(map, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2) + 0.075,
      (r.z0 + r.z1) / 2 + STRIKE_PARK.z,
    );
    g.receiveShadow = true;
    g.name = `strike-site-${text}`;
    root.add(g);
  }
  // the buildings' windows: one mesh, the glass lit from within after dark (emissive)
  if (fronts.length) {
    const g = mergeGeometries(fronts, false);
    for (const f of fronts) f.dispose();
    if (g) {
      const wm = new MeshLambertMaterial({ map: windows(), transparent: true, alphaTest: 0.5, emissive: 0xffc97a });
      wm.emissiveIntensity = 0;
      wm.name = "windows";
      mats.push(wm);
      const mesh = new Mesh(g, wm);
      mesh.receiveShadow = true;
      mesh.name = "strike-windows";
      root.add(mesh);
    }
  }
  // the props: lamps, the river's ice, the range's targets, signs
  const geos: BufferGeometry[] = [];
  const pole = new MeshLambertMaterial({ color: 0x3a3d40 });
  const lampHead = new MeshBasicMaterial({ color: night ? 0xffe2a8 : 0xd8d2c0 });
  const ice = new MeshLambertMaterial({ color: 0xbfd8e4, transparent: true, opacity: 0.85 });
  const target = new MeshLambertMaterial({ map: targetFace(), side: DoubleSide });
  mats.push(pole, lampHead, ice, target);
  for (const p of map.pieces) {
    if (p.k !== "prop") continue;
    const x = p.x + STRIKE_PARK.x;
    const z = p.z + STRIKE_PARK.z;
    const y = (p.y ?? 0) + STRIKE_PARK.h;
    if (p.kind === "lamp") {
      const pg = new CylinderGeometry(0.07, 0.09, 4.2, 8).translate(x, y + 2.1, z);
      geos.push(pg);
      const head = new Mesh(new BoxGeometry(0.5, 0.18, 0.3).translate(x, y + 4.25, z), lampHead);
      root.add(head);
      const pm = new Mesh(pg, pole);
      pm.castShadow = true;
      root.add(pm);
    } else if (p.kind === "ice") {
      const s = p.s ?? 20;
      const m = new Mesh(new PlaneGeometry(s, 14).rotateX(-Math.PI / 2).translate(x, y + 0.03, z), ice);
      m.receiveShadow = true;
      root.add(m);
    } else if (p.kind === "crane") {
      root.add(crane(x, y, z, p.ry ?? 0, (p.s ?? 1) * 1, mats));
    } else if (p.kind === "signal") {
      const post = new Mesh(new CylinderGeometry(0.06, 0.08, 4, 8).translate(x, y + 2, z), pole);
      const head = new Mesh(new BoxGeometry(0.4, 0.9, 0.3).translate(x, y + 4.2, z), pole);
      const red = new Mesh(
        new SphereGeometry(0.09, 8, 6).translate(x, y + 4.4, z + 0.16),
        new MeshBasicMaterial({ color: 0xd8332a }),
      );
      const green = new Mesh(
        new SphereGeometry(0.09, 8, 6).translate(x, y + 4.05, z + 0.16),
        new MeshBasicMaterial({ color: 0x2f5a35 }),
      );
      mats.push(red.material as Material, green.material as Material);
      root.add(post, head, red, green);
    } else if (p.kind === "bull-wheel") {
      const steel = new MeshLambertMaterial({ map: look("metal") });
      mats.push(steel);
      const wheel = new Mesh(new TorusGeometry(2.2 * (p.s ?? 1), 0.16, 8, 40).rotateX(Math.PI / 2), steel);
      wheel.position.set(x, y + 3.2, z);
      const hub = new Mesh(new CylinderGeometry(0.35, 0.35, 3.2, 12).translate(x, y + 1.6, z), steel);
      root.add(wheel, hub);
    } else if (p.kind === "lift-chair") {
      const steel = new MeshLambertMaterial({ color: 0x3d4650 });
      mats.push(steel);
      const seat = new Mesh(new BoxGeometry(1.6, 0.12, 0.6).translate(x, y + 1.4, z), steel);
      const back = new Mesh(new BoxGeometry(1.6, 0.7, 0.08).translate(x, y + 1.8, z - 0.28), steel);
      const hanger = new Mesh(new CylinderGeometry(0.04, 0.04, 2.6, 6).translate(x, y + 2.9, z), steel);
      root.add(seat, back, hanger);
    } else if (p.kind === "sofa") {
      const cloth = new MeshLambertMaterial({ color: 0x6b3b32 });
      mats.push(cloth);
      const g = new Group();
      g.add(new Mesh(new BoxGeometry(2.1, 0.45, 0.9).translate(0, 0.22, 0), cloth));
      g.add(new Mesh(new BoxGeometry(2.1, 0.5, 0.22).translate(0, 0.6, -0.34), cloth));
      g.position.set(x, y, z);
      g.rotation.y = p.ry ?? 0;
      root.add(g);
    } else if (p.kind === "sign") {
      const board = new MeshLambertMaterial({ color: 0xe9dcc0 });
      mats.push(board);
      const g = new Group();
      g.add(new Mesh(new BoxGeometry(1.6, 0.9, 0.06).translate(0, 1.6, 0), board));
      for (const dx of [-0.6, 0.6]) g.add(new Mesh(new BoxGeometry(0.08, 1.6, 0.08).translate(dx, 0.8, 0), pole));
      g.position.set(x, y, z);
      g.rotation.y = p.ry ?? 0;
      root.add(g);
    } else if (p.kind === "target") {
      const m = new Mesh(new CircleGeometry(0.45, 24).translate(0, 1.4, 0), target);
      m.position.set(x, y, z);
      m.rotation.y = p.ry ?? 0;
      root.add(m);
      const post = new Mesh(new BoxGeometry(0.08, 1.0, 0.08).translate(x, y + 0.5, z), pole);
      root.add(post);
    }
  }
  void geos;
  return {
    root,
    lit: litter(root),
    dispose() {
      root.traverse((o) => {
        if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
      });
      for (const m of mats) m.dispose();
      root.removeFromParent();
    },
  };
}

/** Whether nothing of the map covers box b's top (a roof's snow; not the floor under a balcony). */
function openAbove(b: MapBox, all: MapBox[]): boolean {
  const top = b.y + b.hy;
  for (const o of all) {
    if (o === b || o.y - o.hy < top - 0.01) continue;
    if (Math.abs(o.x - b.x) < o.hx + b.hx && Math.abs(o.z - b.z) < o.hz + b.hz && o.a === 0 && b.a === 0) {
      // (most of it covered)
      const ox = Math.min(o.x + o.hx, b.x + b.hx) - Math.max(o.x - o.hx, b.x - b.hx);
      const oz = Math.min(o.z + o.hz, b.z + b.hz) - Math.max(o.z - o.hz, b.z - b.hz);
      if (ox * oz > b.hx * b.hz * 2) return false;
    }
  }
  return true;
}

let targetTex: CanvasTexture | null = null;
function targetFace(): CanvasTexture {
  if (targetTex) return targetTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  for (let r = 5; r >= 1; r--) {
    g.fillStyle = r % 2 ? "#f2ede0" : "#2c2a28";
    g.beginPath();
    g.arc(64, 64, r * 12.6, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#b3402c";
  g.beginPath();
  g.arc(64, 64, 7, 0, Math.PI * 2);
  g.fill();
  targetTex = new CanvasTexture(c);
  targetTex.colorSpace = SRGBColorSpace;
  return targetTex;
}

/** The compound: its walls and their parapets, the stairs to the gallery, the desk, the Map Board's
 *  frame (its face drawn by the caller: `board`), the big screen's (`screen`). */
export function buildCompound(): Built & { board: Mesh; screen: Mesh } {
  const root = new Group();
  root.name = "strike-compound";
  const y = STRIKE_PARK.h;
  const walls: BufferGeometry[] = [];
  const m4 = new Matrix4();
  for (const [ax, az, bx, bz, h] of strikeWalls()) {
    const L = Math.hypot(bx - ax, bz - az);
    const g = tiledBox(L + STRIKE_WALL_T, h, STRIKE_WALL_T);
    m4.makeRotationY(Math.atan2(-(bz - az), bx - ax));
    m4.setPosition((ax + bx) / 2, y + h / 2, (az + bz) / 2);
    g.applyMatrix4(m4);
    walls.push(g);
    for (const side of [-1, 1]) {
      const p = tiledBox(L + STRIKE_WALL_T, 1.1, 0.2);
      const o = side * (STRIKE_WALL_T / 2 - 0.1);
      const nx = az === bz ? 0 : o;
      const nz = az === bz ? o : 0;
      m4.makeRotationY(Math.atan2(-(bz - az), bx - ax));
      m4.setPosition((ax + bx) / 2 + nx, y + h + 0.55, (az + bz) / 2 + nz);
      p.applyMatrix4(m4);
      walls.push(p);
    }
  }
  // the stairs up to the gallery
  const S = STRIKE_STAIRS;
  const steps = Math.ceil(STRIKE_WALL_H / 0.25);
  for (let k = 0; k < steps; k++) {
    const x0 = S.x0 + ((S.x1 - S.x0) * k) / steps;
    const top = (STRIKE_WALL_H * (k + 1)) / steps;
    const g = tiledBox(S.x1 - x0, top, S.w);
    g.translate((x0 + S.x1) / 2, y + top / 2, S.z);
    walls.push(g);
  }
  // (the desk: its own model now — joinDesk)
  const merged = mergeGeometries(walls, false);
  for (const g of walls) g.dispose();
  const concrete = new MeshLambertMaterial({ map: look("concrete") });
  const wall = new Mesh(merged, concrete);
  wall.castShadow = true;
  wall.receiveShadow = true;
  root.add(wall);
  // the Map Board: a walnut frame on two legs, its face the caller's canvas
  const B = STRIKE_BOARD;
  const walnut = new MeshLambertMaterial({ color: 0x4a2f1e });
  const frame = new Mesh(new BoxGeometry(B.w + 0.3, B.h + 0.3, 0.16), walnut);
  frame.position.set(B.x, y + 1.0 + B.h / 2, B.z);
  root.add(frame);
  for (const dx of [-B.w / 2 + 0.2, B.w / 2 - 0.2]) {
    const leg = new Mesh(new BoxGeometry(0.14, 1.1, 0.14), walnut);
    leg.position.set(B.x + dx, y + 0.55, B.z);
    root.add(leg);
  }
  const board = new Mesh(new PlaneGeometry(B.w, B.h), new MeshBasicMaterial({ color: 0xffffff }));
  board.position.set(B.x, y + 1.0 + B.h / 2, B.z + 0.09);
  root.add(board);
  // the big screen over the gate, facing the road in
  const SC = STRIKE_SCREEN;
  const housing = new Mesh(new BoxGeometry(SC.w + 0.4, SC.h + 0.4, 0.5), new MeshLambertMaterial({ color: 0x22262a }));
  housing.position.set(SC.x, y + SC.y + SC.h / 2, SC.z);
  root.add(housing);
  const screen = new Mesh(new PlaneGeometry(SC.w, SC.h), new MeshBasicMaterial({ color: 0xffffff }));
  screen.position.set(SC.x, y + SC.y + SC.h / 2, SC.z + 0.26);
  root.add(screen);
  yardDress(root);
  return {
    root,
    board,
    screen,
    lit: litter(root),
    dispose() {
      root.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
      });
      root.removeFromParent();
    },
  };
}

/** A tower crane: a lattice mast (a box), its jib and counter-jib, the cab; `jib` turns (the show swings it). */
export function crane(x: number, y: number, z: number, ry: number, s: number, mats: Material[]): Group {
  const yellow = new MeshLambertMaterial({ color: 0xd8a72c });
  const dark = new MeshLambertMaterial({ color: 0x2b2f33 });
  mats.push(yellow, dark);
  const g = new Group();
  g.name = "crane";
  const H = 26 * s;
  g.add(new Mesh(new BoxGeometry(1.4, H, 1.4).translate(0, H / 2, 0), yellow));
  const jib = new Group();
  jib.name = "jib";
  jib.position.y = H;
  jib.add(new Mesh(new BoxGeometry(30 * s, 1.1, 1.1).translate(9 * s, 0.6, 0), yellow));
  jib.add(new Mesh(new BoxGeometry(4, 2.2, 2).translate(-8 * s, -0.4, 0), dark));
  jib.add(new Mesh(new BoxGeometry(2.2, 2.2, 2.2).translate(1.6, -1.6, 0), dark));
  // (plan 115 phase 81) the cable a unit long, scaled by the caller (its "len"), a hook and a load on its end: a
  // container, or a wall panel strapped to a spreader — the map's pieces carried in and out
  const cable = new Mesh(new CylinderGeometry(0.04, 0.04, 1, 4).translate(0, -0.5, 0), dark);
  cable.name = "cable";
  cable.position.set(20 * s, 0, 0);
  jib.add(cable);
  const load = new Group();
  load.name = "load";
  load.position.set(20 * s, -12, 0);
  load.add(new Mesh(new BoxGeometry(0.5, 0.6, 0.5).translate(0, -0.3, 0), dark));
  load.add(new Mesh(new BoxGeometry(5.6, 0.25, 0.3).translate(0, -1.6, 0), yellow));
  for (const sx of [-2.5, 2.5])
    load.add(
      new Mesh(new CylinderGeometry(0.02, 0.02, 1.3, 3).translate(sx * 0.5, -1, 0).rotateZ(sx > 0 ? -0.9 : 0.9), dark),
    );
  const box = new MeshLambertMaterial({ color: ry > 1.5 ? 0x7b3328 : 0x2f5d73 });
  const rib = new MeshLambertMaterial({ color: ry > 1.5 ? 0x5e261e : 0x234759 });
  mats.push(box, rib);
  load.add(new Mesh(new BoxGeometry(6, 2.6, 2.4).translate(0, -3.1, 0), box));
  for (let i = -2.7; i <= 2.71; i += 0.6)
    load.add(new Mesh(new BoxGeometry(0.08, 2.5, 2.46).translate(i, -3.1, 0), rib));
  jib.add(load);
  g.add(jib);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  return g;
}

/** The charge: a dark case with a keypad and a red light (`light`, blinked by the caller). */
export function chargeModel(): { g: Group; light: MeshBasicMaterial; dispose(): void } {
  const g = new Group();
  const caseMat = new MeshLambertMaterial({ color: 0x2e2a26 });
  const pad = new MeshLambertMaterial({ color: 0x8c8a7e });
  const light = new MeshBasicMaterial({ color: 0xff3020 });
  g.add(new Mesh(new BoxGeometry(0.42, 0.16, 0.3).translate(0, 0.08, 0), caseMat));
  g.add(new Mesh(new BoxGeometry(0.16, 0.02, 0.12).translate(0.08, 0.17, 0), pad));
  g.add(new Mesh(new SphereGeometry(0.025, 8, 6).translate(-0.12, 0.18, 0.06), light));
  return {
    g,
    light,
    dispose() {
      g.traverse((o) => {
        if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
      });
      caseMat.dispose();
      pad.dispose();
      light.dispose();
      g.removeFromParent();
    },
  };
}

/** A hostage: a figure in a high-vis vest, hands tied, kneeling or stood (carried along by a Warden). */
export function hostageModel(): { g: Group; dispose(): void } {
  const g = new Group();
  const skin = new MeshLambertMaterial({ color: 0xc89a7a });
  const vest = new MeshLambertMaterial({ color: 0xe8732a });
  const legs = new MeshLambertMaterial({ color: 0x3c4450 });
  g.add(new Mesh(new CylinderGeometry(0.2, 0.18, 0.62, 10).translate(0, 1.1, 0), vest));
  g.add(new Mesh(new SphereGeometry(0.13, 12, 10).translate(0, 1.55, 0), skin));
  g.add(new Mesh(new BoxGeometry(0.34, 0.8, 0.2).translate(0, 0.4, 0), legs));
  return {
    g,
    dispose() {
      g.traverse((o) => {
        if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
      });
      skin.dispose();
      vest.dispose();
      legs.dispose();
      g.removeFromParent();
    },
  };
}

// ── the buildings' kit (plan 110's Blender kit: walls, windows, doors, roofs, trims) dressing the maps' buildings
// (plan 115 arc G): a block whose look is a building is laid out as one of the kit's kinds on its plot — its door
// to the lane it opens on — and drawn by the kit; its solid stays the map's own (the checks' layout) ──

/** A look → the kit's kind for it. */
const KIT_OF: Record<string, string> = {
  "mill-house": "townhouses",
  barn: "barn",
  shed: "shed",
  kiln: "warehouse",
  mill: "warehouse",
  hotel: "hotel",
  chalet: "house",
  "lift-house": "shed",
  "lift-station": "shed",
  warehouse: "warehouse",
  office: "office",
  "weigh-house": "shed",
  depot: "warehouse",
  boathouse: "boathouse",
  cottage: "house",
  "boat-shop": "shop",
  "range-hut": "shed",
  cabin: "shed",
  neighbour: "apartments",
};

/** The map's blocks the kit draws, as the kit's buildings (world coords). */
export function kitPlan(map: StrikeMap, face: (b: MapBox) => "n" | "s" | "e" | "w"): { i: number; b: Building }[] {
  const out: { i: number; b: Building }[] = [];
  for (const b of mapBoxes(map)) {
    const kind = b.look ? KIT_OF[b.look] : undefined;
    if (!kind || b.a !== 0 || b.y - b.hy > 0.05) continue;
    const w = b.hx * 2;
    const d = b.hz * 2;
    if (Math.min(w, d) < 3.5) continue;
    const H = b.hy * 2;
    // (a long block: a row of buildings, ~30 m each — one roof over 75 m was a mountain)
    const along = w >= d ? "x" : "z";
    const L = Math.max(w, d);
    const n = Math.max(1, Math.ceil(L / 30));
    const f = face(b);
    for (let k = 0; k < n; k++) {
      const a0 = -L / 2 + (L * k) / n;
      const a1 = -L / 2 + (L * (k + 1)) / n;
      const x0 = along === "x" ? b.x + a0 : b.x - b.hx;
      const x1 = along === "x" ? b.x + a1 : b.x + b.hx;
      const z0 = along === "z" ? b.z + a0 : b.z - b.hz;
      const z1 = along === "z" ? b.z + a1 : b.z + b.hz;
      out.push({
        i: b.i,
        b: {
          key: `strike:${map.key}:${b.i}:${k}`,
          kind: kind as Building["kind"],
          name: "",
          x0: x0 + STRIKE_PARK.x,
          z0: z0 + STRIKE_PARK.z,
          x1: x1 + STRIKE_PARK.x,
          z1: z1 + STRIKE_PARK.z,
          floors: Math.max(1, Math.round(H / 3.4)),
          face: f,
          vacant: false,
        },
      });
    }
  }
  return out;
}

/** The kit's buildings drawn (the kit loaded: kit-buildings.ts loadKit). */
export function buildKit(plan: { i: number; b: Building }[]): Built {
  const root = new Group();
  root.name = "strike-kit";
  const geos: BufferGeometry[] = [];
  const packs: { near: Packed }[] = [];
  for (const { b } of plan) {
    const L = layoutOf(b);
    if (!L) continue;
    const raw = kitBatches(L, STRIKE_PARK.h, coloursOf(b), null);
    packs.push({ near: packBatches(raw.near) });
  }
  const all = new Map<MatKey, Pack[]>();
  for (const p of packs)
    for (const [k, a] of p.near) {
      const t = all.get(k) ?? [];
      t.push(a);
      all.set(k, t);
    }
  for (const [k, list] of all) {
    const geo = packGeometry(list);
    geos.push(geo);
    const m = new Mesh(
      geo,
      kitMaterial(k, () => {}),
    );
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  return {
    root,
    // (the kit's materials are the kit's, shared with the town: only the geometry is ours)
    lit() {},
    dispose() {
      for (const g of geos) g.dispose();
      root.removeFromParent();
    },
  };
}

// ── the billboard on the county road (plan 115 phase 39, F7): two wings in a V, their faces to the traffic each way,
// the park's own art (stencilled name, the two teams, the way in), lit at night ──
let signTex: CanvasTexture | null = null;
function signFace(): CanvasTexture {
  if (signTex) return signTex;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  // the steel, a weathered gradient
  const bg = g.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, "#2a302d");
  bg.addColorStop(1, "#171b19");
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 512);
  // the hazard band along the bottom
  g.save();
  g.beginPath();
  g.rect(0, 440, 1024, 72);
  g.clip();
  for (let x = -80; x < 1100; x += 56) {
    g.fillStyle = "#e8a33a";
    g.beginPath();
    g.moveTo(x, 512);
    g.lineTo(x + 28, 512);
    g.lineTo(x + 100, 440);
    g.lineTo(x + 72, 440);
    g.fill();
  }
  g.restore();
  // the emblem: a ring and cross hairs over a pine (the park's own)
  g.save();
  g.translate(150, 210);
  g.strokeStyle = "#e9dcc0";
  g.lineWidth = 10;
  g.beginPath();
  g.arc(0, 0, 104, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#e8a33a";
  g.beginPath();
  g.moveTo(0, -76);
  g.lineTo(52, 30);
  g.lineTo(18, 30);
  g.lineTo(46, 74);
  g.lineTo(-46, 74);
  g.lineTo(-18, 30);
  g.lineTo(-52, 30);
  g.closePath();
  g.fill();
  g.fillStyle = "#e9dcc0";
  for (const [x, y, w, h] of [
    [-6, -132, 12, 40],
    [-6, 92, 12, 40],
    [-132, -6, 40, 12],
    [92, -6, 40, 12],
  ])
    g.fillRect(x, y, w, h);
  g.restore();
  // the name, stencilled (a gap through each letter's middle)
  g.fillStyle = "#e9dcc0";
  g.font = "900 120px 'Avenir Next Condensed', 'Arial Narrow', Impact, sans-serif";
  g.textBaseline = "alphabetic";
  g.fillText("STRIKE PARK", 300, 200);
  g.fillStyle = "#1f2421";
  for (let x = 300; x < 1000; x += 64) g.fillRect(x + 28, 120, 6, 90);
  g.font = "600 40px 'Avenir Next Condensed', 'Arial Narrow', sans-serif";
  g.fillStyle = "#e8a33a";
  g.fillText("RAIDERS", 304, 262);
  g.fillStyle = "#e9dcc0";
  g.fillText("vs", 478, 262);
  g.fillStyle = "#6fa3c7";
  g.fillText("WARDENS", 530, 262);
  g.fillStyle = "#e9dcc0";
  g.font = "500 34px 'Avenir Next', sans-serif";
  g.fillText("5 v 5 · rounds · six maps · bots any hour", 304, 320);
  // the way in
  g.fillStyle = "#e8a33a";
  g.font = "800 44px 'Avenir Next Condensed', 'Arial Narrow', sans-serif";
  g.fillText("TURN HERE  →  400 m", 304, 400);
  signTex = new CanvasTexture(c);
  signTex.colorSpace = SRGBColorSpace;
  signTex.anisotropy = 8;
  return signTex;
}
/** The billboard (world coords; `ground` the land's height at (x, z)). */
export function buildSign(ground: (x: number, z: number) => number): Built & { light(k: number): void } {
  const root = new Group();
  root.name = "strike-sign";
  const S = STRIKE_SIGN;
  const yg = ground(S.x, S.z);
  const face = new MeshLambertMaterial({ map: signFace(), emissive: 0xffffff, emissiveMap: signFace() });
  face.emissiveIntensity = 0;
  const back = new MeshLambertMaterial({ color: 0x2b302d });
  const post = new MeshLambertMaterial({ color: 0x3a3f42 });
  const lampMat = new MeshBasicMaterial({ color: 0x555555 });
  const H = S.h1 - S.h0;
  for (const w of strikeSignWings()) {
    const L = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
    const mx = (w.x0 + w.x1) / 2;
    const mz = (w.z0 + w.z1) / 2;
    const ry = Math.atan2(w.nx, w.nz);
    const front = new Mesh(new PlaneGeometry(L, H), face);
    front.position.set(mx + w.nx * 0.16, yg + S.h0 + H / 2, mz + w.nz * 0.16);
    front.rotation.y = ry;
    const box = new Mesh(new BoxGeometry(L, H + 0.2, 0.3), back);
    box.position.set(mx, yg + S.h0 + H / 2, mz);
    box.rotation.y = ry;
    box.castShadow = true;
    // its lamps on arms over the face
    for (const t of [0.25, 0.75]) {
      const lx = w.x0 + (w.x1 - w.x0) * t + w.nx * 0.9;
      const lz = w.z0 + (w.z1 - w.z0) * t + w.nz * 0.9;
      const lamp = new Mesh(new BoxGeometry(0.5, 0.12, 0.3), lampMat);
      lamp.position.set(lx, yg + S.h1 + 0.25, lz);
      lamp.rotation.y = ry;
      root.add(lamp);
    }
    root.add(front, box);
  }
  for (const [x, z] of strikeSignPosts()) {
    const p = new Mesh(new CylinderGeometry(0.14, 0.16, S.h1, 10), post);
    p.position.set(x, ground(x, z) + S.h1 / 2 - 0.1, z);
    p.castShadow = true;
    root.add(p);
  }
  return {
    root,
    lit() {},
    light(k: number) {
      face.emissiveIntensity = k * 0.75;
      lampMat.color.setHex(k > 0.3 ? 0xfff1d2 : 0x555555);
    },
    dispose() {
      root.traverse((o) => {
        if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
      });
      for (const m of [face, back, post, lampMat]) m.dispose();
      root.removeFromParent();
    },
  };
}

// ── the lobby yard dressed (plan 115 arc F, phases 45 and 57): pavers over the dirt, the teams' banners down the walls,
// the team doors signed, lamp posts along the walk, benches and planters about the hub, the teams' flags by the gate ──
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d") as CanvasRenderingContext2D);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function banner(team: "r" | "w"): CanvasTexture {
  const col = team === "r" ? "#e8a33a" : "#6fa3c7";
  const ink = team === "r" ? "#1b1d1a" : "#081521";
  return canvasTex(256, 768, (g) => {
    g.fillStyle = col;
    g.fillRect(0, 0, 256, 768);
    g.fillStyle = "rgba(0,0,0,.12)";
    for (let y = 0; y < 768; y += 6) g.fillRect(0, y, 256, 1);
    g.fillStyle = ink;
    g.fillRect(0, 0, 256, 26);
    g.fillRect(0, 742, 256, 26);
    // the emblem: a chevron (Raiders) or a shield (Wardens)
    g.save();
    g.translate(128, 250);
    g.fillStyle = ink;
    g.beginPath();
    if (team === "r") {
      g.moveTo(-80, -40);
      g.lineTo(0, 40);
      g.lineTo(80, -40);
      g.lineTo(80, 10);
      g.lineTo(0, 90);
      g.lineTo(-80, 10);
    } else {
      g.moveTo(-70, -80);
      g.lineTo(70, -80);
      g.lineTo(70, 10);
      g.quadraticCurveTo(70, 70, 0, 100);
      g.quadraticCurveTo(-70, 70, -70, 10);
    }
    g.closePath();
    g.fill();
    g.restore();
    g.save();
    g.translate(128, 560);
    g.rotate(-Math.PI / 2);
    g.fillStyle = ink;
    g.font = "900 64px 'Avenir Next Condensed', 'Arial Narrow', Impact, sans-serif";
    g.textAlign = "center";
    g.fillText(team === "r" ? "RAIDERS" : "WARDENS", 0, 22);
    g.restore();
  });
}
function plate(text: string, col: string): CanvasTexture {
  return canvasTex(1024, 192, (g) => {
    g.fillStyle = "#1f2421";
    g.fillRect(0, 0, 1024, 192);
    g.fillStyle = col;
    g.fillRect(0, 0, 1024, 14);
    g.fillRect(0, 178, 1024, 14);
    g.fillStyle = "#e9dcc0";
    g.font = "900 104px 'Avenir Next Condensed', 'Arial Narrow', Impact, sans-serif";
    g.textAlign = "center";
    g.fillText(text, 512, 134);
  });
}
function yardDress(root: Group) {
  const y = STRIKE_PARK.h;
  const Y = STRIKE_YARD;
  const T = STRIKE_WALL_T / 2;
  // the pavers
  const paver = canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#8d8a83";
      g.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          const k = 0.9 + ((r * 7 + c * 3) % 5) * 0.03;
          g.fillStyle = `rgb(${Math.round(150 * k)},${Math.round(146 * k)},${Math.round(138 * k)})`;
          g.fillRect(c * 64 + 2, r * 64 + 2, 60, 60);
        }
      for (let i = 0; i < 600; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
    },
    true,
  );
  const W = Y.x1 - Y.x0 - T * 2;
  const D = Y.z1 - Y.z0 - T * 2;
  paver.repeat.set(W / 4, D / 4);
  const pave = new Mesh(new PlaneGeometry(W, D).rotateX(-Math.PI / 2), new MeshLambertMaterial({ map: paver }));
  pave.position.set((Y.x0 + Y.x1) / 2, y + 0.035, (Y.z0 + Y.z1) / 2);
  pave.receiveShadow = true;
  root.add(pave);
  // the banners down the inner wall's yard face (between the buildings) and the outer wall's
  const bR = new MeshLambertMaterial({ map: banner("r"), side: DoubleSide });
  const bW = new MeshLambertMaterial({ map: banner("w"), side: DoubleSide });
  const inner = Y.z0 + T + 0.05;
  const outer = Y.z1 - T - 0.05;
  for (const [x, z, team, face] of [
    [-315, inner, "r", 0],
    [-306, inner, "w", 0],
    [-292, inner, "r", 0],
    [-248, inner, "w", 0],
    [-210, inner, "r", 0],
    [-286, outer, "w", Math.PI],
    [-272, outer, "r", Math.PI],
    [-226, outer, "w", Math.PI],
  ] as [number, number, "r" | "w", number][]) {
    const m = new Mesh(new PlaneGeometry(2.2, 6.6), team === "r" ? bR : bW);
    m.position.set(x, y + 5.0, z);
    m.rotation.y = face;
    root.add(m);
  }
  // the team doors signed: the Raiders' (west) and the Wardens' (east) way into the arena
  for (const [x, text, col] of [
    [STRIKE_INNER.doors[0], "RAIDERS ▸ ARENA", "#e8a33a"],
    [STRIKE_INNER.doors[1], "WARDENS ▸ ARENA", "#6fa3c7"],
  ] as [number, string, string][]) {
    const m = new Mesh(
      new PlaneGeometry(6.4, 1.2),
      new MeshLambertMaterial({ map: plate(text, col), emissive: 0xffffff, emissiveIntensity: 0.12 }),
    );
    m.material.emissiveMap = m.material.map;
    m.position.set(x, y + 4.6, inner + 0.03);
    root.add(m);
  }
  // lamp posts along the walk, benches and planters about the hub, the flags by the gate
  const steel = new MeshLambertMaterial({ color: 0x343a3d });
  const head = new MeshLambertMaterial({ color: 0xfff0cf, emissive: 0xffd9a0, emissiveIntensity: 0.2 });
  const wood = new MeshLambertMaterial({ map: look("plank") });
  const green = new MeshLambertMaterial({ color: 0x4f6b3a });
  const mid = (Y.z0 + Y.z1) / 2 + 0.5;
  for (const x of [-345, -322, -296, -270, -244, -218, -190]) {
    const p = new Mesh(new CylinderGeometry(0.08, 0.1, 4.6, 8), steel);
    p.position.set(x, y + 2.3, mid);
    const h = new Mesh(new BoxGeometry(0.6, 0.16, 0.36), head);
    h.position.set(x, y + 4.65, mid);
    root.add(p, h);
  }
  for (const [x, z, ry] of [
    [-262, -609.8, 0],
    [-268, -609.8, 0],
    [-276, -609.8, 0],
    [-255, -618.4, Math.PI],
    [-285, -618.4, Math.PI],
  ] as [number, number, number][]) {
    const g = new Group();
    g.add(new Mesh(new BoxGeometry(2.0, 0.08, 0.5).translate(0, 0.46, 0), wood));
    g.add(new Mesh(new BoxGeometry(2.0, 0.5, 0.08).translate(0, 0.75, -0.22), wood));
    for (const dx of [-0.85, 0.85]) g.add(new Mesh(new BoxGeometry(0.08, 0.46, 0.44).translate(dx, 0.23, 0), steel));
    g.position.set(x, y, z);
    g.rotation.y = ry;
    root.add(g);
  }
  for (const [x, z] of [
    [-258.5, -609.5],
    [-272, -609.5],
    [-280.6, -609.5],
  ] as [number, number][]) {
    const box = new Mesh(new BoxGeometry(1.0, 0.7, 1.0), new MeshLambertMaterial({ map: look("concrete") }));
    box.position.set(x, y + 0.35, z);
    const bush = new Mesh(new SphereGeometry(0.6, 10, 8), green);
    bush.position.set(x, y + 1.05, z);
    bush.scale.y = 0.8;
    root.add(box, bush);
  }
  // the barrier on the road in, before the turning circle (plan 115 phase 40): its post and its striped arm, raised
  {
    const bx = STRIKE_GATE.x + 5.2;
    const bz = STRIKE_GATE.z + 24;
    const post = new Mesh(new BoxGeometry(0.4, 1.1, 0.4), new MeshLambertMaterial({ color: 0xd9a33a }));
    post.position.set(bx, y + 0.55, bz);
    const stripes = canvasTex(256, 16, (g) => {
      for (let x = 0; x < 256; x += 32) {
        g.fillStyle = "#c8362a";
        g.fillRect(x, 0, 16, 16);
        g.fillStyle = "#f1ece1";
        g.fillRect(x + 16, 0, 16, 16);
      }
    });
    const arm = new Mesh(new BoxGeometry(7.2, 0.12, 0.12), new MeshLambertMaterial({ map: stripes }));
    arm.geometry.translate(-3.6, 0, 0);
    arm.position.set(bx, y + 1.05, bz);
    arm.rotation.z = -1.25;
    root.add(post, arm);
  }
  // the practice range's targets on the outer wall (plan 115 phase 47), the firing line painted across the yard
  {
    const face = new MeshLambertMaterial({ map: targetFace(), side: DoubleSide });
    const board = new MeshLambertMaterial({ color: 0x5c4026 });
    for (const t of STRIKE_TARGETS) {
      const back = new Mesh(new BoxGeometry(1.2, 1.2, 0.06), board);
      back.position.set(t.x, y + t.y, t.z + 0.08);
      const disc = new Mesh(new CircleGeometry(t.r, 32), face);
      disc.position.set(t.x, y + t.y, t.z + 0.04);
      disc.rotation.y = Math.PI;
      root.add(back, disc);
    }
    const line = new Mesh(
      new PlaneGeometry(30, 0.18).rotateX(-Math.PI / 2),
      new MeshLambertMaterial({ color: 0xe9dcc0 }),
    );
    line.position.set(-339, y + 0.045, STRIKE_FIRING_LINE);
    root.add(line);
    const sign = new Mesh(
      new PlaneGeometry(3.2, 0.6),
      new MeshLambertMaterial({ map: plate("RANGE · 15 m", "#e8a33a") }),
    );
    sign.position.set(-339, y + 3.2, STRIKE_TARGETS[0].z + 0.05);
    sign.rotation.y = Math.PI;
    root.add(sign);
  }
  const flagR = new MeshLambertMaterial({ map: banner("r"), side: DoubleSide });
  const flagW = new MeshLambertMaterial({ map: banner("w"), side: DoubleSide });
  for (const [dx, mat] of [
    [-8, flagR],
    [8, flagW],
  ] as [number, MeshLambertMaterial][]) {
    const x = STRIKE_GATE.x + dx;
    const z = STRIKE_GATE.z - 3;
    const p = new Mesh(new CylinderGeometry(0.06, 0.08, 9, 8), steel);
    p.position.set(x, y + 4.5, z);
    const f = new Mesh(new PlaneGeometry(1.6, 2.6), mat);
    f.position.set(x + 0.82, y + 7.6, z);
    root.add(p, f);
  }
}

const groundTexs = new Map<string, CanvasTexture>();
/** A map's ground (6 m a repeat): sun-baked sand and gravel, or dark wet mud with puddles' sheen. */
function groundTex(kind: "sand" | "mud"): CanvasTexture {
  const had = groundTexs.get(kind);
  if (had) return had;
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  let seed = kind === "sand" ? 11 : 29;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  g.fillStyle = kind === "sand" ? "#c9a774" : "#4f4232";
  g.fillRect(0, 0, 512, 512);
  // blotches of lighter and darker ground
  for (let i = 0; i < 90; i++) {
    const r = 20 + rnd() * 70;
    const x = rnd() * 512;
    const y = rnd() * 512;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() > 0.5;
    const a = 0.08 + rnd() * 0.12;
    const col =
      kind === "sand"
        ? light
          ? `rgba(232,206,160,${a})`
          : `rgba(150,112,70,${a})`
        : light
          ? `rgba(110,96,76,${a})`
          : `rgba(30,24,18,${a})`;
    gr.addColorStop(0, col);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // grit, pebbles
  for (let i = 0; i < 2600; i++) {
    const d = rnd();
    g.fillStyle =
      kind === "sand"
        ? `rgba(${90 + d * 60},${70 + d * 40},${40 + d * 30},${0.25 + rnd() * 0.3})`
        : `rgba(${20 + d * 50},${18 + d * 40},${14 + d * 30},${0.3 + rnd() * 0.4})`;
    const s = rnd() * 2.6 + 0.6;
    g.fillRect(rnd() * 512, rnd() * 512, s, s);
  }
  if (kind === "mud")
    for (let i = 0; i < 14; i++) {
      // puddles' sheen
      const x = rnd() * 512;
      const y = rnd() * 512;
      g.fillStyle = "rgba(150,165,175,0.18)";
      g.beginPath();
      g.ellipse(x, y, 18 + rnd() * 40, 8 + rnd() * 18, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  groundTexs.set(kind, t);
  return t;
}

// ── the park's own prop kit (plan 115 phase 60: tools/art/strike/props.py → public/life/strike/props.glb): the
// container, the crate, the barrel, the pallet, the sandbags, the barrier — each part's meshes by role. The maps'
// containers and crates are drawn as these (instanced: a whole yard of them a draw a role), their solids the map's own ──
interface PropMesh {
  role: string;
  geo: BufferGeometry;
}
let props: Map<string, PropMesh[]> | null = null;
let propsLoading: Promise<boolean> | null = null;
export const propsReady = (): boolean => !!props;
export function loadProps(): Promise<boolean> {
  propsLoading ??= (async () => {
    try {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const g = await new GLTFLoader().loadAsync(asset("/life/strike/props.glb"));
      g.scene.updateMatrixWorld(true);
      const out = new Map<string, PropMesh[]>();
      const inv = new Matrix4();
      for (const node of g.scene.children) {
        inv.copy(node.matrixWorld).invert();
        const list: PropMesh[] = [];
        node.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          const role = (Array.isArray(m.material) ? m.material[0] : m.material).name.split(".")[0];
          const geo = m.geometry.clone();
          geo.applyMatrix4(new Matrix4().multiplyMatrices(inv, m.matrixWorld));
          list.push({ role, geo });
        });
        out.set(node.name, list);
      }
      props = out;
      return true;
    } catch {
      return false;
    }
  })();
  return propsLoading;
}
const PROP_COL: Record<string, number> = {
  paint: 0xffffff,
  steel: 0x2b2e31,
  wood: 0x9a7346,
  wooddark: 0x5c4026,
  drum: 0x3d5a74,
  burlap: 0xa8946a,
  concrete: 0xa5a29b,
  rust: 0x6e3420,
  bark: 0x4d3a28,
  cut: 0xc9a06a,
  glass: 0x26323a,
  rubber: 0x141414,
  hull: 0xd8d2c4,
  galv: 0x8b8f92,
  brick: 0x8a4b3a,
  crane: 0xd9a21f,
  white: 0xe6e2d8,
  red: 0xa8342a,
  lamp: 0xffe3a0,
};
/** The containers' paints (a yard's: rust red, blue, green, ochre, grey, white). */
const CONTAINER_PAINT = [0x8e3b2a, 0x2f5b86, 0x3f6a45, 0xb78a2e, 0x6d7276, 0xc9c5ba, 0x7a3550, 0x2e6f72];

/** The maps' own pieces the prop kit draws, by their look: its part, its size as modelled (x, y, z: m), tiled along
 *  a long block or stretched to it (plan 115 arc H: the hero pieces — the train, the logs, the boats…). */
const FIT: Record<string, { part: string; x: number; y: number; z: number; tile?: boolean }> = {
  wagon: { part: "boxcar", x: 14, y: 3.84, z: 3 },
  flatcar: { part: "flatcar", x: 14, y: 1.12, z: 3 },
  tanker: { part: "tanker", x: 14, y: 3.9, z: 3 },
  "brake-van": { part: "brakevan", x: 7.8, y: 4, z: 3 },
  "buffer-stop": { part: "bufferstop", x: 2, y: 1.1, z: 3 },
  logs: { part: "logs", x: 6, y: 2.2, z: 2.4 },
  sacks: { part: "sacks", x: 4, y: 1.2, z: 2 },
  boat: { part: "boat", x: 6, y: 0.82, z: 1.6 },
  "boat-iced": { part: "boat", x: 6, y: 0.82, z: 1.6 },
  woodpile: { part: "woodpile", x: 8, y: 1.82, z: 2 },
  van: { part: "van", x: 6, y: 2.3, z: 2.4 },
  truck: { part: "van", x: 6, y: 2.3, z: 2.4 },
  "parked-car": { part: "van", x: 6, y: 2.3, z: 2.4 },
  skip: { part: "skip", x: 4, y: 1.4, z: 2 },
  barricade: { part: "barricade", x: 6.3, y: 1.3, z: 0.3 },
  sandbags: { part: "sandbags", x: 2, y: 0.65, z: 0.6, tile: true },
  "relay-hut": { part: "relayhut", x: 3, y: 2.8, z: 3 },
};

/** (plan 115, the last stretch: the showpieces) each map's skyline, standing outside its play between its edge and
 *  the arena's wall (never the south side: the gallery and the team doors) — a mill chimney and a water tower over
 *  the Sawmill, a container gantry and a signal box over Freight, a chairlift's pylons climbing past the Lodge, a
 *  tower crane over Glass Tower, a lighthouse past the Boathouse, the Range's watchtowers. Local metres; `ry` the
 *  model's x axis turned; no solids: they're beyond reach. */
export const BACKDROPS: Record<string, { part: string; x: number; z: number; ry?: number; s?: number }[]> = {
  sawmill: [
    { part: "chimney", x: -95, z: -58 },
    { part: "watertower", x: 95, z: 36 },
    { part: "watertower", x: -95, z: 30, ry: 0.7, s: 0.85 },
  ],
  freight: [
    { part: "portainer", x: 4, z: -97 },
    { part: "signalbox", x: 96, z: 24, ry: Math.PI / 2 },
    { part: "relayhut", x: -95, z: -40 },
  ],
  lodge: [
    { part: "pylon", x: 72, z: -30, ry: 0.5 },
    { part: "pylon", x: 82, z: -56, ry: 0.5 },
    { part: "pylon", x: 92, z: -82, ry: 0.5 },
    { part: "watertower", x: -78, z: -80, s: 0.8 },
  ],
  tower: [
    { part: "towercrane", x: -78, z: -70, ry: -Math.PI / 4 },
    { part: "towercrane", x: 82, z: -62, ry: (-Math.PI * 3) / 4, s: 0.9 },
  ],
  boathouse: [
    { part: "lighthouse", x: 62, z: -62, ry: 0.4 },
    { part: "watertower", x: -66, z: -58, s: 0.75 },
  ],
  range: [
    { part: "watchtower", x: -72, z: -58 },
    { part: "watchtower", x: 72, z: -58, ry: Math.PI },
    { part: "signalbox", x: 0, z: -80 },
  ],
};
/** Is box b one the prop kit draws (a container stack, a crate stack, a hero piece)? */
export const isPropBox = (b: MapBox): boolean =>
  (b.m === "sheet" && !!b.look && b.look.startsWith("container")) || b.look === "crate" || (!!b.look && b.look in FIT);

/** The map's containers and crates as the prop kit's (instanced). */
export function buildProps(map: StrikeMap): Built {
  const root = new Group();
  root.name = "strike-props";
  const mats: Material[] = [];
  const geos: BufferGeometry[] = [];
  if (!props) return { root, lit() {}, dispose() {} };
  const placed = new Map<string, { m: Matrix4; c?: number }[]>();
  const add = (part: string, m: Matrix4, c?: number) => {
    const l = placed.get(part) ?? [];
    l.push({ m, c });
    placed.set(part, l);
  };
  let k = 0;
  for (const b of mapBoxes(map)) {
    if (!isPropBox(b)) continue;
    const baseY = b.y - b.hy + STRIKE_PARK.h;
    if (b.look === "crate") {
      const s = b.hx * 2;
      const levels = Math.max(1, Math.round((b.hy * 2) / s));
      for (let i = 0; i < levels; i++) {
        const m = new Matrix4().compose(
          new Vector3(b.x + STRIKE_PARK.x, baseY + i * s, b.z + STRIKE_PARK.z),
          new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), b.a + i * 0.12),
          new Vector3(s, s, s),
        );
        add("crate", m);
      }
      continue;
    }
    const fit = b.look ? FIT[b.look] : undefined;
    if (fit) {
      // the model turned so its long side lies along the block's, stretched to it (or tiled, sandbags)
      const boxLong = 2 * Math.max(b.hx, b.hz);
      const boxShort = 2 * Math.min(b.hx, b.hz);
      const modelLongX = fit.x >= fit.z;
      const mLong = Math.max(fit.x, fit.z);
      const mShort = Math.min(fit.x, fit.z);
      const n = fit.tile ? Math.max(1, Math.round(boxLong / mLong)) : 1;
      const seg = boxLong / n;
      const boxLongX = b.hx >= b.hz;
      // (the model's long axis onto the block's: a quarter turn when they differ)
      const turn = modelLongX === boxLongX ? 0 : Math.PI / 2;
      const sLong = seg / mLong;
      const sShort = boxShort / mShort;
      const sy = (b.hy * 2) / fit.y;
      const c = Math.cos(b.a);
      const sn = Math.sin(b.a);
      for (let i = 0; i < n; i++) {
        const t = -boxLong / 2 + seg * (i + 0.5);
        const lx = boxLongX ? t : 0;
        const lz = boxLongX ? 0 : t;
        const x = b.x + lx * c + lz * sn + STRIKE_PARK.x;
        const z = b.z - lx * sn + lz * c + STRIKE_PARK.z;
        const scale = modelLongX ? new Vector3(sLong, sy, sShort) : new Vector3(sShort, sy, sLong);
        const m = new Matrix4().compose(
          new Vector3(x, baseY, z),
          new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), b.a + turn),
          scale,
        );
        add(fit.part, m, CONTAINER_PAINT[(k * 5 + i) % CONTAINER_PAINT.length]);
      }
      k++;
      continue;
    }
    // a container stack: tiled along its long side, stacked to its height
    const alongX = b.hx >= b.hz;
    const L = 2 * Math.max(b.hx, b.hz);
    const Wd = 2 * Math.min(b.hx, b.hz);
    const n = Math.max(1, Math.round(L / 6.16));
    const levels = Math.max(1, Math.round((b.hy * 2) / 2.59));
    const sl = L / n;
    const sy = (b.hy * 2) / levels / 2.59;
    const ry = b.a + (alongX ? 0 : Math.PI / 2);
    const c = Math.cos(b.a);
    const sn = Math.sin(b.a);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < levels; j++) {
        const t = -L / 2 + sl * (i + 0.5);
        // (along its long side, in the box's own frame: +x to (c, −sn), +z to (sn, c))
        const lx = alongX ? t : 0;
        const lz = alongX ? 0 : t;
        const x = b.x + lx * c + lz * sn + STRIKE_PARK.x;
        const z = b.z - lx * sn + lz * c + STRIKE_PARK.z;
        // (every other one turned end for end: the doors not all one way)
        const flip = (i + j + k) % 3 === 0 ? Math.PI : 0;
        const m = new Matrix4().compose(
          new Vector3(x, baseY + j * 2.59 * sy, z),
          new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ry + flip),
          new Vector3((sl - 0.12) / 6.06, sy, Math.min(1, (Wd - 0.06) / 2.44)),
        );
        add("container", m, CONTAINER_PAINT[(k * 7 + i * 3 + j * 5) % CONTAINER_PAINT.length]);
      }
    k++;
  }
  for (const d of BACKDROPS[map.key] ?? []) {
    const sc = d.s ?? 1;
    add(
      d.part,
      new Matrix4().compose(
        new Vector3(d.x + STRIKE_PARK.x, STRIKE_PARK.h, d.z + STRIKE_PARK.z),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), d.ry ?? 0),
        new Vector3(sc, sc, sc),
      ),
    );
  }
  // (the chairlift's haul rope, pylon to pylon: both its sides, sagging a little)
  const lift = (BACKDROPS[map.key] ?? []).filter((d) => d.part === "pylon");
  if (lift.length > 1) {
    const ropeMat = new MeshLambertMaterial({ color: 0x1c1f22 });
    mats.push(ropeMat);
    const ropes: BufferGeometry[] = [];
    for (let i = 0; i + 1 < lift.length; i++)
      for (const side of [-3, 3]) {
        const at = (d: (typeof lift)[number]) => {
          const r = d.ry ?? 0;
          // (the crossarm's tip: its z side turned with the pylon)
          return new Vector3(
            d.x + STRIKE_PARK.x + Math.sin(r) * side,
            STRIKE_PARK.h + 11.4,
            d.z + STRIKE_PARK.z + Math.cos(r) * side,
          );
        };
        const a = at(lift[i]);
        const b = at(lift[i + 1]);
        const n = 8;
        for (let k = 0; k < n; k++) {
          const p0 = a.clone().lerp(b, k / n);
          const p1 = a.clone().lerp(b, (k + 1) / n);
          p0.y -= Math.sin((Math.PI * k) / n) * 0.9;
          p1.y -= Math.sin((Math.PI * (k + 1)) / n) * 0.9;
          const len = p0.distanceTo(p1);
          const g = new CylinderGeometry(0.035, 0.035, len, 4);
          g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), p1.clone().sub(p0).normalize()));
          g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
          ropes.push(g);
        }
      }
    const merged = mergeGeometries(ropes, false);
    for (const g of ropes) g.dispose();
    if (merged) {
      geos.push(merged);
      root.add(new Mesh(merged, ropeMat));
    }
  }
  for (const [part, list] of placed) {
    for (const pm of props.get(part) ?? []) {
      const mat = new MeshLambertMaterial({ color: PROP_COL[pm.role] ?? 0x888888 });
      if (pm.role === "wood" || pm.role === "wooddark") mat.map = look("plank");
      if (pm.role === "lamp") mat.emissive = new Color(0xffd27a);
      mats.push(mat);
      const im = new InstancedMesh(pm.geo, mat, list.length);
      list.forEach((it, i) => {
        im.setMatrixAt(i, it.m);
        if (pm.role === "paint") im.setColorAt(i, new Color(it.c ?? 0x8e3b2a));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      root.add(im);
    }
  }
  return {
    root,
    lit() {},
    dispose() {
      for (const m of mats) m.dispose();
      for (const g of geos) g.dispose();
      root.removeFromParent();
    },
  };
}

/** The floor's height at (x, z) in a map: the top of whatever's under the point that's low enough to stand on (a
 *  site on a loading dock or a terrace), else the pad. */
function floorUnder(map: StrikeMap, x: number, z: number): number {
  let y = 0;
  for (const b of mapBoxes(map)) {
    const top = b.y + b.hy;
    if (top > 4.5 || top <= y) continue;
    if (Math.abs(x - b.x) < b.hx && Math.abs(z - b.z) < b.hz && b.a === 0 && b.hx > 2 && b.hz > 2) y = top;
  }
  return y;
}
/** A site's paint: the letter stencilled big in worn white, a hazard-striped border (amber and black). */
function sitePaint(text: string, aspect: number): CanvasTexture {
  const W = 512;
  const H = Math.max(128, Math.min(1024, Math.round(W / Math.max(0.25, aspect))));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.clearRect(0, 0, W, H);
  // the border's stripes
  const b = 18;
  g.save();
  g.beginPath();
  g.rect(0, 0, W, H);
  g.rect(b, b, W - b * 2, H - b * 2);
  g.clip("evenodd");
  for (let x = -H; x < W + H; x += 36) {
    g.fillStyle = "rgba(232,163,58,0.85)";
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 18, 0);
    g.lineTo(x + 18 + H, H);
    g.lineTo(x + H, H);
    g.fill();
  }
  g.restore();
  // the letter
  g.fillStyle = "rgba(240,236,226,0.78)";
  const size = text.length > 1 ? Math.min(H * 0.5, W / (text.length * 0.62)) : Math.min(W, H) * 0.7;
  g.font = `900 ${size}px 'Avenir Next Condensed', 'Arial Narrow', Impact, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, W / 2, H / 2 + size * 0.04);
  // the stencil's bridges and the wear: scuffs cut out of the paint
  g.globalCompositeOperation = "destination-out";
  g.fillRect(W / 2 - 4, H / 2 - size * 0.45, 8, size * 0.2);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(0,0,0,${0.2 + Math.random() * 0.6})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 10, 1 + Math.random() * 4);
  }
  g.globalCompositeOperation = "source-over";
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The war room's screen (plan 115 phase 48): a freestanding display inside, facing its door; its face the caller's. */
export function warScreen(): { root: Group; screen: Mesh; dispose(): void } {
  const root = new Group();
  const y = STRIKE_PARK.h;
  const frame = new Mesh(new BoxGeometry(3.4, 2.0, 0.14), new MeshLambertMaterial({ color: 0x1c1f22 }));
  frame.position.set(-184, y + 2.0, -604.4);
  const legs = new Mesh(new BoxGeometry(0.1, 1.0, 0.1), new MeshLambertMaterial({ color: 0x1c1f22 }));
  legs.position.set(-184, y + 0.5, -604.4);
  const screen = new Mesh(new PlaneGeometry(3.2, 1.8), new MeshBasicMaterial({ color: 0xffffff }));
  screen.position.set(-184, y + 2.0, -604.48);
  screen.rotation.y = Math.PI;
  root.add(frame, legs, screen);
  return {
    root,
    screen,
    dispose() {
      root.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (m.material as Material).dispose();
      });
      root.removeFromParent();
    },
  };
}

/** The briefing hall's miniature of the map standing (plan 115 phase 54): its blocks at 1/65 on a plinth in the aisle,
 *  coloured by what they're made of; the sites marked. */
export function miniature(map: StrikeMap): Built {
  const root = new Group();
  root.name = "strike-miniature";
  const y = STRIKE_PARK.h;
  const at = { x: -190, z: -626.2 };
  const k = 1 / 68;
  // (heights lifted ×3 so the walls read from standing height)
  const kv = k * 3;
  const plinth = new Mesh(new BoxGeometry(2.9, 0.9, 2.9), new MeshLambertMaterial({ color: 0x5a4a3a }));
  plinth.position.set(at.x, y + 0.45, at.z);
  root.add(plinth);
  const COL: Partial<Record<Mat, number>> = {
    brick: 0x8a4b3a,
    wood: 0x7a5434,
    plank: 0x9a7346,
    sheet: 0x6d8a99,
    metal: 0x5d6266,
    concrete: 0x9a9a96,
    rock: 0x6f6b66,
    stone: 0x8c877f,
    drywall: 0xd9d4c9,
    glass: 0x9fbfcc,
  };
  const by = new Map<number, BufferGeometry[]>();
  const m4 = new Matrix4();
  for (const b of mapBoxes(map)) {
    // (the ground slab under it all left out: the plinth is its ground)
    if (b.y + b.hy <= 0.05 && b.hx * b.hz > 400) continue;
    // (the map's edge walls and the roofs left off, and everything cut at 4 m: a plan you look into, not a box)
    const S = map.size;
    if (Math.min(b.x - S.x0, S.x1 - b.x, b.z - S.z0, S.z1 - b.z) < 2.5) continue;
    if (b.hy < 0.45 && b.y > 2.4) continue;
    const y0 = Math.max(0, b.y - b.hy);
    const y1 = Math.min(4, b.y + b.hy);
    if (y1 <= y0) continue;
    const g = new BoxGeometry(b.hx * 2 * k, Math.max(0.004, (y1 - y0) * kv), b.hz * 2 * k);
    m4.makeRotationY(b.a);
    m4.setPosition(at.x + b.x * k, y + 0.9 + ((y0 + y1) / 2) * kv, at.z + b.z * k);
    g.applyMatrix4(m4);
    const c = COL[b.m] ?? 0x888888;
    const l = by.get(c) ?? [];
    l.push(g);
    by.set(c, l);
  }
  const mats: Material[] = [];
  for (const [c, list] of by) {
    const g = mergeGeometries(list, false);
    for (const x of list) x.dispose();
    if (!g) continue;
    const mat = new MeshLambertMaterial({ color: c });
    mats.push(mat);
    root.add(new Mesh(g, mat));
  }
  if (map.sites)
    for (const [r, col] of [
      [map.sites.A, 0xe8a33a],
      [map.sites.B, 0xe8a33a],
    ] as const) {
      if (!r) continue;
      const mat = new MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 });
      mats.push(mat);
      const g = new Mesh(new PlaneGeometry((r.x1 - r.x0) * k, (r.z1 - r.z0) * k).rotateX(-Math.PI / 2), mat);
      g.position.set(at.x + ((r.x0 + r.x1) / 2) * k, y + 0.905, at.z + ((r.z0 + r.z1) / 2) * k);
      root.add(g);
    }
  return {
    root,
    lit() {},
    dispose() {
      root.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      for (const m of mats) m.dispose();
      plinth.material.dispose();
      root.removeFromParent();
    },
  };
}

/** The customization corner (plan 115 phase 55) against the outer wall's yard face: a team locker, a full-length mirror
 *  (a live reflection — the caller turns it on only when someone's near), a bench, the "KIT" plate. */
export async function kitCorner(): Promise<Built & { mirror: Mesh | null }> {
  const root = new Group();
  root.name = "strike-kit-corner";
  const y = STRIKE_PARK.h;
  const K = STRIKE_KIT;
  const mats: Material[] = [];
  const lm = (o: ConstructorParameters<typeof MeshLambertMaterial>[0]) => {
    const m = new MeshLambertMaterial(o);
    mats.push(m);
    return m;
  };
  const lockerFace = canvasTex(256, 224, (g) => {
    g.fillStyle = "#3b4a3f";
    g.fillRect(0, 0, 256, 224);
    for (let i = 0; i < 4; i++) {
      const x = 4 + i * 63;
      g.fillStyle = i % 2 ? "#41524a" : "#3e4e44";
      g.fillRect(x, 4, 59, 216);
      g.fillStyle = "#26302a";
      for (let k = 0; k < 4; k++) g.fillRect(x + 14, 16 + k * 7, 30, 3);
      g.fillStyle = "#c9c2b0";
      g.fillRect(x + 48, 104, 4, 22);
      g.fillStyle = i < 2 ? "#e8a33a" : "#6fa3c7";
      g.fillRect(x + 14, 190, 30, 8);
    }
  });
  const locker = new Mesh(new BoxGeometry(2.6, 2.1, 0.55), [
    lm({ color: 0x323f36 }),
    lm({ color: 0x323f36 }),
    lm({ color: 0x2b362f }),
    lm({ color: 0x2b362f }),
    lm({ color: 0x323f36 }),
    lm({ map: lockerFace }),
  ]);
  locker.position.set(K.x - 2.6, y + 1.05, K.z - 0.3);
  const frame = new Mesh(new BoxGeometry(1.2, 2.05, 0.08), lm({ color: 0x5c4026 }));
  frame.position.set(K.x + 0.2, y + 1.12, K.z - 0.06);
  const bench = new Mesh(new BoxGeometry(1.8, 0.08, 0.42), lm({ map: look("plank") }));
  bench.position.set(K.x - 1.3, y + 0.45, K.z - 2.4);
  const legs = new Mesh(new BoxGeometry(1.6, 0.41, 0.3), lm({ color: 0x2b2f33 }));
  legs.position.set(K.x - 1.3, y + 0.205, K.z - 2.4);
  const sign = new Mesh(new PlaneGeometry(2.2, 0.5), lm({ map: plate("KIT · YOUR TEAM LOOK", "#e8a33a") }));
  sign.position.set(K.x - 1.2, y + 2.6, K.z - 0.02);
  sign.rotation.y = Math.PI;
  root.add(locker, frame, bench, legs, sign);
  // the mirror: three's Reflector, loaded with the chunk that needs it
  let mirror: Mesh | null = null;
  try {
    const { Reflector } = await import("three/addons/objects/Reflector.js");
    const r = new Reflector(new PlaneGeometry(1.0, 1.85), {
      textureWidth: 512,
      textureHeight: 1024,
      color: 0xb8bcc0,
      clipBias: 0.003,
    });
    r.position.set(K.x + 0.2, y + 1.12, K.z - 0.11);
    r.rotation.y = Math.PI;
    r.visible = false;
    root.add(r);
    mirror = r;
  } catch {
    mirror = null;
  }
  return {
    root,
    mirror,
    lit() {},
    dispose() {
      root.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      (mirror as unknown as { dispose?: () => void } | null)?.dispose?.();
      for (const m of mats) m.dispose();
      root.removeFromParent();
    },
  };
}

/** The join desk (rebuilt after the user's "make it more robust, show that you've joined"): a heavy sign-up counter —
 *  a steel kick plate, the Raiders' half and the Wardens', a walnut top — with a terminal on it (its face the
 *  caller's: who's in), a lamp at each end lit by how many have joined that side, an overhead "JOIN THE MATCH · E"
 *  sign on two posts, and a painted ring on the ground round it: where E works. Its solid is the Grounds' (1.2 × 3.6
 *  × 1.1, shapes/grounds.ts strike_lobby). */
export function joinDesk(): Built & {
  screen: Mesh;
  lamp: Record<"r" | "w", MeshLambertMaterial>;
  ring: MeshBasicMaterial;
} {
  const root = new Group();
  root.name = "strike-join-desk";
  const D = STRIKE_DESK;
  const y = STRIKE_PARK.h;
  const mats: Material[] = [];
  const add = (g: BufferGeometry, m: Material, x: number, yy: number, z: number) => {
    const mesh = new Mesh(g, m);
    mesh.position.set(D.x + x, y + yy, D.z + z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const lm = (o: ConstructorParameters<typeof MeshLambertMaterial>[0]) => {
    const m = new MeshLambertMaterial(o);
    mats.push(m);
    return m;
  };
  const steel = lm({ color: 0x2a2e31 });
  const walnut = lm({ map: look("plank"), color: 0x8a5a3a });
  const half = (t: "r" | "w") =>
    canvasTex(512, 256, (g) => {
      g.fillStyle = t === "r" ? "#b9781f" : "#3e5d72";
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = "rgba(0,0,0,.12)";
      for (let x = -256; x < 512; x += 48) {
        g.beginPath();
        g.moveTo(x, 256);
        g.lineTo(x + 24, 256);
        g.lineTo(x + 280, 0);
        g.lineTo(x + 256, 0);
        g.fill();
      }
      g.fillStyle = t === "r" ? "#1b1d1a" : "#e9eef2";
      g.font = "900 92px 'Avenir Next Condensed', 'Arial Narrow', sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(t === "r" ? "RAIDERS" : "WARDENS", 256, 118);
      g.font = "700 30px 'Avenir Next Condensed', sans-serif";
      g.fillText("SIGN UP HERE", 256, 200);
    });
  // the kick plate, the two halves (their fronts painted, both long sides), the top
  add(new BoxGeometry(3.7, 0.14, 1.3), steel, 0, 0.07, 0);
  for (const [t, x] of [
    ["r", -0.9],
    ["w", 0.9],
  ] as const) {
    const face = lm({ map: half(t) });
    const side = lm({ color: t === "r" ? 0x9a6418 : 0x334e60 });
    add(new BoxGeometry(1.8, 0.92, 1.18), [side, side, side, side, face, face] as unknown as Material, x, 0.6, 0);
    mats.push(side);
  }
  add(new BoxGeometry(0.06, 0.92, 1.2), steel, 0, 0.6, 0);
  add(new BoxGeometry(3.84, 0.08, 1.36), walnut, 0, 1.1, 0);
  // the brass edge on the top
  const brass = lm({ color: 0xb08a48 });
  for (const z of [-0.68, 0.68]) add(new BoxGeometry(3.84, 0.03, 0.03), brass, 0, 1.13, z);
  // the terminal: a stand, a sloped screen facing the yard (south, +z)
  add(new BoxGeometry(0.16, 0.22, 0.16), steel, 0, 1.25, 0);
  const bezel = add(new BoxGeometry(1.0, 0.64, 0.06), steel, 0, 1.6, 0.02);
  bezel.rotation.x = -0.28;
  const screen = new Mesh(new PlaneGeometry(0.92, 0.56), new MeshBasicMaterial({ color: 0xffffff }));
  mats.push(screen.material as Material);
  screen.position.set(D.x, y + 1.6 + Math.sin(0.28) * 0.0, D.z + 0.055);
  screen.rotation.x = -0.28;
  root.add(screen);
  // the lamps at its ends: a post, a cage, a globe lit by how many have joined that side
  const lamp = {
    r: lm({ color: 0xe8a33a, emissive: new Color(0xe8a33a), emissiveIntensity: 0.2 }),
    w: lm({ color: 0x6fa3c7, emissive: new Color(0x6fa3c7), emissiveIntensity: 0.2 }),
  };
  for (const [t, x] of [
    ["r", -2.12],
    ["w", 2.12],
  ] as const) {
    add(new CylinderGeometry(0.05, 0.07, 1.55, 10), steel, x, 0.78, 0);
    add(new CylinderGeometry(0.14, 0.14, 0.04, 14), steel, x, 1.56, 0);
    add(new SphereGeometry(0.13, 16, 12), lamp[t], x, 1.7, 0);
    add(new TorusGeometry(0.135, 0.012, 6, 16), steel, x, 1.7, 0).rotation.x = Math.PI / 2;
  }
  // the overhead sign on two posts behind it
  for (const x of [-1.95, 1.95]) add(new BoxGeometry(0.1, 3.2, 0.1), steel, x, 1.6, -0.75);
  const signTex = canvasTex(1024, 160, (g) => {
    g.fillStyle = "#14181b";
    g.fillRect(0, 0, 1024, 160);
    g.fillStyle = "#e8a33a";
    g.fillRect(0, 0, 1024, 10);
    g.fillRect(0, 150, 1024, 10);
    g.font = "900 84px 'Avenir Next Condensed', 'Arial Narrow', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#e9dcc0";
    g.fillText("JOIN THE MATCH", 430, 84);
    g.fillStyle = "#e8a33a";
    g.fillRect(800, 34, 100, 100);
    g.fillStyle = "#14181b";
    g.fillText("E", 850, 88);
  });
  const signMat = new MeshBasicMaterial({ map: signTex });
  mats.push(signMat);
  const sign = new Mesh(new BoxGeometry(4.0, 0.62, 0.08), [steel, steel, steel, steel, signMat, signMat]);
  sign.position.set(D.x, y + 3.05, D.z - 0.75);
  root.add(sign);
  // the ring on the ground where E works (3 m round its middle)
  const ringTex = canvasTex(512, 32, (g) => {
    g.fillStyle = "#e8a33a";
    for (let x = 0; x < 512; x += 32) g.fillRect(x, 0, 20, 32);
  });
  ringTex.wrapS = RepeatWrapping;
  const ring = new MeshBasicMaterial({
    map: ringTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -6,
  });
  mats.push(ring);
  const rg = new RingGeometry(2.75, 2.95, 96, 1);
  // (the dashes run round it: u from the angle)
  {
    const pos = rg.getAttribute("position");
    const uv = rg.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getY(i), pos.getX(i));
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, ((a + Math.PI) / (Math.PI * 2)) * 24, r > 2.85 ? 1 : 0);
    }
  }
  const ringMesh = new Mesh(rg.rotateX(-Math.PI / 2), ring);
  ringMesh.position.set(D.x, y + 0.03, D.z);
  root.add(ringMesh);
  return {
    root,
    screen,
    lamp,
    ring,
    lit() {},
    dispose() {
      root.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      for (const m of mats) m.dispose();
      for (const t of [signTex, ringTex]) t.dispose();
      root.removeFromParent();
    },
  };
}
