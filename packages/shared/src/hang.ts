import { entry, footprint, rotOf, type WorldObjectDef } from "./catalog.ts";
import {
  type Edge,
  type EdgeDir,
  edgeAt,
  holdsItems,
  hWall,
  isFloor,
  isWallEdge,
  type MapDef,
  tileAt,
  vWall,
} from "./map.ts";
import { edgeKey, isDoorKind, wallCuts } from "./openings.ts";

// Things on walls, Sims-style — like things on a desk's top (tops.ts): a board,
// a poster, a TV hangs anywhere on either face of a wall, on a grid of quarter
// tiles along it and up it, as long as all of it is on wall (no corner in the
// way, nor a door or window where it would hang: above a door is fine) and it
// overlaps nothing else on that face.
//
// Stored on the object: `rot` = the face (the item kit's turn: its back against
// that wall) — 0 on the north wall of its tile, facing +y; 1 on the east wall,
// facing −x; 2 on the south wall, facing −y; 3 on the west wall, facing +x;
// x, y = the tile in front of it; props.wu = how many quarter tiles its drawing
// is shifted along the wall (+x or +y) from that tile's corner (0..3); props.wz
// = how many quarter-tile steps it's raised (lowered when negative) from its
// own height. Older saves have neither: wu 0, wz 0, and only rot 3 is the west
// wall (any other turn the north wall).
export const WQ = 4; // steps per tile, along and up
export const WZ_PX = 9.8; // px per step up (a quarter tile, 39.2 px a tile)
export const HANG_LOW = 5; // the skirting's top
export const HANG_HIGH = 125; // under the wall's cap (WALL_Z 128 − 3 in art/items/walls.ts)

// Each wall item at rest: [quarter tiles along (centred in its drawing, which
// is `w` tiles wide: 4·w − this is even), lowest px, highest px].
const HANG_SIZE: Record<string, [number, number, number]> = {
  board_wall: [12, 19, 72],
  screen_wall: [16, 10, 86],
  whiteboard: [8, 22, 64],
  notice_board: [8, 28, 62],
  acoustic_panel: [4, 22, 68],
  clock: [2, 43, 61],
  neon: [6, 36, 64],
  poster: [4, 30, 66],
  light_switch: [2, 32, 45],
  frame: [2, 40, 60],
  tv_wall: [4, 44, 80],
  tv_hd: [12, 17, 80],
  projector_screen: [12, 17, 86],
  tv_giant: [20, 15, 118],
  cinema_screen: [24, 6, 124],
};

export function hangSize(kind: string): [number, number, number] {
  const s = HANG_SIZE[kind];
  if (s) return s;
  const w = entry(kind).w;
  return [w * WQ, 24, 64];
}

// A wall face: the wall line (`line` = y of a wall along x, x of one along y)
// and which side (+1: the face looking to +y / +x; −1: to −y / −x).
export interface Face {
  dir: EdgeDir;
  line: number;
  side: 1 | -1;
}

export const faceRot = (f: { dir: EdgeDir; side: number }): 0 | 1 | 2 | 3 =>
  f.dir === "h" ? (f.side > 0 ? 0 : 2) : f.side > 0 ? 3 : 1;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

// Placed with the free grid (props.wu set) rather than an older save's way.
export const freeHang = (o: { props?: Record<string, unknown> }): boolean => isInt(o.props?.wu);

// The face it hangs on, as a turn.
export function hangRot(o: { rot?: number; props?: Record<string, unknown> }): 0 | 1 | 2 | 3 {
  const r = (o.rot ?? 0) & 3;
  if (freeHang(o)) return r as 0 | 1 | 2 | 3;
  return r === 3 ? 3 : 0;
}

export interface Hang extends Face {
  rot: 0 | 1 | 2 | 3;
  u0: number; // its span along the wall, in quarter tiles (world)
  u1: number;
  z0: number; // how high it reaches, px (raised)
  z1: number;
  lift: number; // px it's raised from its own height
  ax: number; // its drawing's corner (the tile frame it's drawn in), world tiles
  ay: number;
}

export function hangOf(o: WorldObjectDef): Hang {
  const rot = hangRot(o);
  const dir: EdgeDir = rot % 2 === 0 ? "h" : "v";
  const side: 1 | -1 = rot === 0 || rot === 3 ? 1 : -1;
  const wu = freeHang(o) ? Math.max(0, Math.min(WQ - 1, o.props?.wu as number)) : 0;
  const wz = isInt(o.props?.wz) ? (o.props?.wz as number) : 0;
  const ax = dir === "h" ? o.x + wu / WQ : o.x;
  const ay = dir === "v" ? o.y + wu / WQ : o.y;
  const line = dir === "h" ? (side > 0 ? o.y : o.y + 1) : side > 0 ? o.x : o.x + 1;
  const [n, lo, hi] = hangSize(o.kind);
  const m = (entry(o.kind).w * WQ - n) / 2;
  const u0 = (dir === "h" ? ax : ay) * WQ + m;
  const lift = wz * WZ_PX;
  return { rot, dir, line, side, u0, u1: u0 + n, z0: lo + lift, z1: hi + lift, lift, ax, ay };
}

// The edges it covers.
export function hangEdges(h: Hang): Edge[] {
  const out: Edge[] = [];
  for (let k = Math.floor(h.u0 / WQ); k * WQ < h.u1; k++)
    out.push(h.dir === "h" ? { dir: "h", x: k, y: h.line } : { dir: "v", x: h.line, y: k });
  return out;
}
export function wallSpan(o: WorldObjectDef): Edge[] {
  return entry(o.kind).wall ? hangEdges(hangOf(o)) : [];
}

// The tile in front of a face at a step along it.
function frontTile(f: Face, k: number): [number, number] {
  const back = f.side > 0 ? f.line : f.line - 1;
  return f.dir === "h" ? [k, back] : [back, k];
}
// The tiles it looks into (the room it's in).
export function hangTiles(o: WorldObjectDef): [number, number][] {
  const h = hangOf(o);
  return hangEdges(h).map((e) => frontTile(h, h.dir === "h" ? e.x : e.y));
}

// The floor strip in front of it, `depth` tiles out from the wall (world tiles).
export function hangStrip(o: WorldObjectDef, depth: number): { x0: number; y0: number; x1: number; y1: number } {
  const h = hangOf(o);
  const a0 = h.u0 / WQ;
  const a1 = h.u1 / WQ;
  const b0 = h.side > 0 ? h.line : h.line - depth;
  const b1 = h.side > 0 ? h.line + depth : h.line;
  return h.dir === "h" ? { x0: a0, x1: a1, y0: b0, y1: b1 } : { x0: b0, x1: b1, y0: a0, y1: a1 };
}

// A point on the floor in front of its middle, `out` tiles from the wall.
export function hangSpot(o: WorldObjectDef, out = 0.6): { x: number; y: number } {
  const h = hangOf(o);
  const a = (h.u0 + h.u1) / 2 / WQ;
  const b = h.line + h.side * out;
  return h.dir === "h" ? { x: a, y: b } : { x: b, y: a };
}

// How far a point (someone) is from using a thing: from its footprint, or for
// a wall item from the floor in front of it — and only from its own side of
// the wall.
export function reachOf(o: WorldObjectDef, p: { x: number; y: number }): number {
  let r: { x0: number; y0: number; x1: number; y1: number };
  if (entry(o.kind).wall) {
    const h = hangOf(o);
    if (((h.dir === "h" ? p.y : p.x) - h.line) * h.side < 0) return Number.POSITIVE_INFINITY;
    r = hangStrip(o, 1);
  } else {
    const { w, h } = footprint(o.kind, rotOf(o));
    r = { x0: o.x, y0: o.y, x1: o.x + w, y1: o.y + h };
  }
  const cx = Math.max(r.x0, Math.min(p.x, r.x1));
  const cy = Math.max(r.y0, Math.min(p.y, r.y1));
  return Math.hypot(p.x - cx, p.y - cy);
}

// A point of its drawing (rot-0 local tiles: x along its front, y out from
// the wall's line) in the world, as the item kit turns it.
export function hangPoint(o: WorldObjectDef, lx: number, ly: number): [number, number] {
  const h = hangOf(o);
  let x = lx;
  let y = ly;
  let W = entry(o.kind).w;
  let H = entry(o.kind).h;
  for (let i = 0; i < h.rot; i++) {
    [x, y] = [H - y, x];
    [W, H] = [H, W];
  }
  return [h.ax + x, h.ay + y];
}

// Which way it looks (unit, world tiles).
export const hangNormal = (h: Face): [number, number] => (h.dir === "h" ? [0, h.side] : [h.side, 0]);

// Hung the same way on another face: its span starting at quarter tile `u`
// (world, along the wall) and raised `wz` steps.
export function hangAt(o: WorldObjectDef, f: Face, u: number, wz: number): WorldObjectDef {
  const [n] = hangSize(o.kind);
  const m = (entry(o.kind).w * WQ - n) / 2;
  const c = Math.round(u - m); // its drawing's corner, in quarter tiles
  const k = Math.floor(c / WQ);
  const [x, y] = frontTile(f, k);
  return { ...o, x, y, rot: faceRot(f), props: { ...(o.props ?? {}), wu: c - k * WQ, wz: Math.round(wz) } };
}

// Hung on a face with its middle as near `along` (world tiles) and `z` (px) as
// the grid allows; `z` null keeps how high it is.
export function hangNear(o: WorldObjectDef, f: Face, along: number, z: number | null): WorldObjectDef {
  const [n, lo, hi] = hangSize(o.kind);
  const wz = z === null ? (isInt(o.props?.wz) ? (o.props?.wz as number) : 0) : Math.round((z - (lo + hi) / 2) / WZ_PX);
  return hangAt(o, f, Math.round(along * WQ - n / 2), clampLift(o.kind, wz));
}

// Lifts that keep it on the wall (between the skirting and the cap).
export function liftRange(kind: string): [number, number] {
  const [, lo, hi] = hangSize(kind);
  return [Math.ceil((HANG_LOW - lo) / WZ_PX - 1e-9), Math.floor((HANG_HIGH - hi) / WZ_PX + 1e-9)];
}
export function clampLift(kind: string, wz: number): number {
  const [a, b] = liftRange(kind);
  return Math.max(Math.min(a, 0), Math.min(Math.max(b, 0), wz));
}

// A wall item in today's form: its face as a turn, wu and wz set (older saves
// keep where they were).
export function hangCanon(o: WorldObjectDef): WorldObjectDef {
  if (!entry(o.kind).wall) return o;
  const h = hangOf(o);
  const wu = Math.round((h.dir === "h" ? h.ax - o.x : h.ay - o.y) * WQ);
  const wz = Math.round(h.lift / WZ_PX);
  return { ...o, rot: h.rot, props: { ...(o.props ?? {}), wu, wz } };
}

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - 1e-6 && b0 < a1 - 1e-6;

// Is anything (but `except`) hanging on this face over this span?
export function hungOver(objects: Iterable<WorldObjectDef>, h: Hang, except?: string): WorldObjectDef | undefined {
  for (const x of objects) {
    if (x.id === except || !entry(x.kind).wall) continue;
    const g = hangOf(x);
    if (g.dir !== h.dir || g.line !== h.line || g.side !== h.side) continue;
    if (overlaps(g.u0, g.u1, h.u0, h.u1) && overlaps(g.z0, g.z1, h.z0, h.z1)) return x;
  }
  return undefined;
}

// Is anything hanging on this edge, either face (but `except`)?
export function hungOn(objects: Iterable<WorldObjectDef>, e: Edge, except?: string): WorldObjectDef | undefined {
  for (const o of objects)
    if (o.id !== except && entry(o.kind).wall && wallSpan(o).some((s) => s.dir === e.dir && s.x === e.x && s.y === e.y))
      return o;
  return undefined;
}

// Why it can't hang where it is (null = it fits): all of it on wall that holds
// things, floor in front, no wall meeting this face across it, clear of the
// rest on this face, between the skirting and the cap.
export function hangBlocker(map: MapDef, others: WorldObjectDef[], o: WorldObjectDef): string | null {
  const h = hangOf(o);
  if (h.z0 < HANG_LOW - 1e-6 || h.z1 > HANG_HIGH + 1e-6) return "off the wall";
  for (const e of hangEdges(h)) {
    if (!holdsItems(edgeAt(map, e))) return "no wall to hang it on";
    const [tx, ty] = frontTile(h, h.dir === "h" ? e.x : e.y);
    if (!isFloor(tileAt(map, tx, ty))) return "no floor in front";
  }
  // a wall meeting this face somewhere along it (a corner it would cut through)
  const back = h.side > 0 ? h.line : h.line - 1;
  for (let p = Math.ceil(h.u0 / WQ); p * WQ < h.u1; p++) {
    if (p * WQ <= h.u0) continue;
    const across = h.dir === "h" ? vWall(map, p, back) : hWall(map, back, p);
    if (isWallEdge(across)) return "a wall is in the way";
  }
  if (hungOver(others, h, o.id)) return "something hangs there";
  // a door or window cuts the wall there (either face: they go through)
  const cuts = wallCuts(others);
  for (const e of hangEdges(h)) {
    const c = cuts.get(edgeKey(e));
    if (c && overlaps(c.z0, c.z1, h.z0, h.z1)) return isDoorKind(c.kind) ? "a door is there" : "a window is there";
  }
  return null;
}
export function hangFits(map: MapDef, others: WorldObjectDef[], o: WorldObjectDef): boolean {
  return hangBlocker(map, others, o) === null;
}

// ── pointing at a wall ───────────────────────────────────────────────────────
// A ray from the camera through the pointer (world tiles, z in px): `o` where
// it starts, `d` its direction.
export interface Ray {
  o: { x: number; y: number; z: number };
  d: { x: number; y: number; z: number };
}
const FACE_OUT = 0.1; // a wall's face is this far out from its line (WALL_HALF_T)
const WALL_TOP = HANG_HIGH + 3;

// The wall face the ray meets first, facing it, where: along (world tiles) and
// z (px). `skip`: walls to look through (faded, cut away).
export function faceHit(
  map: MapDef,
  ray: Ray,
  skip?: (e: Edge) => boolean,
): { face: Face; along: number; z: number; t: number } | null {
  let best: { face: Face; along: number; z: number; t: number } | null = null;
  const test = (dir: EdgeDir, x: number, y: number) => {
    const ch = dir === "h" ? hWall(map, x, y) : vWall(map, x, y);
    if (!isWallEdge(ch)) return;
    const e: Edge = { dir, x, y };
    if (skip?.(e)) return;
    const dn = dir === "h" ? ray.d.y : ray.d.x;
    if (Math.abs(dn) < 1e-9) return;
    const side: 1 | -1 = dn < 0 ? 1 : -1; // the face looking back at the ray
    const line = dir === "h" ? y : x;
    const plane = line + side * FACE_OUT;
    const t = (plane - (dir === "h" ? ray.o.y : ray.o.x)) / dn;
    if (t <= 0 || (best && t >= best.t)) return;
    const along = dir === "h" ? ray.o.x + ray.d.x * t : ray.o.y + ray.d.y * t;
    const z = ray.o.z + ray.d.z * t;
    const a0 = dir === "h" ? x : y;
    if (along < a0 || along > a0 + 1 || z < 0 || z > WALL_TOP) return;
    best = { face: { dir, line, side }, along, z, t };
  };
  for (let y = 0; y <= map.height; y++) for (let x = 0; x < map.width; x++) test("h", x, y);
  for (let y = 0; y < map.height; y++) for (let x = 0; x <= map.width; x++) test("v", x, y);
  return best;
}

// The wall face nearest a point on the floor, among the four round its tile
// that hold things (or `takes`) and face into it: where along it (world tiles).
export function faceNear(
  map: MapDef,
  x: number,
  y: number,
  takes: (ch: string) => boolean = holdsItems,
): { face: Face; along: number } | null {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!isFloor(tileAt(map, tx, ty))) return null;
  const fx = x - tx;
  const fy = y - ty;
  const cands: [number, Face, number][] = [
    [fy, { dir: "h", line: ty, side: 1 }, x],
    [1 - fy, { dir: "h", line: ty + 1, side: -1 }, x],
    [fx, { dir: "v", line: tx, side: 1 }, y],
    [1 - fx, { dir: "v", line: tx + 1, side: -1 }, y],
  ];
  cands.sort((a, b) => a[0] - b[0]);
  for (const [, f, along] of cands) {
    const e: Edge = f.dir === "h" ? { dir: "h", x: tx, y: f.line } : { dir: "v", x: f.line, y: ty };
    if (takes(edgeAt(map, e))) return { face: f, along };
  }
  return null;
}
