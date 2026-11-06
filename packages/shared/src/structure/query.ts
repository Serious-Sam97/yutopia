// What a floor is, asked of the structure (docs/plan/72-the-3d-core.md, phase 11: the tile-map
// adapter deleted — every reader asks here). The floor under a point (its slabs at the floor's
// height, the last drawn on top), the wall on a whole-metre line between two cells (the walls that
// stand on those lines, a floor's own height and kind), a floor's extent. Each floor's answers are
// kept per structure (an edit makes a new one: asked again, made again — a floor at a time).
import {
  backAt,
  edgeAt,
  HALF_WALL,
  isFacedWall,
  type MapDef,
  NO_WALL,
  type TileMap,
  tileAt,
  VOID,
  type WallMat,
} from "../map.ts";
import { HALF_WALL_H, WALL_H, WALL_T } from "../units.ts";
import { isArc } from "./arc.ts";
import { inRing } from "./rings.ts";
import type { Floor, Slab, Structure, Wall, XY } from "./types.ts";

/** An edge between two cells: the north edge of (x, y) ("h") or its west edge ("v"). */
export interface CellEdge {
  dir: "h" | "v";
  x: number;
  y: number;
}

/** A wall on whole-metre lines, corner to corner, its floor's height and as high as its kind
 *  stands: one the cells' edges can say (others — drawn free, an arc, its own height or thickness —
 *  are asked of by their segments). */
export function onTiles(w: Wall, f: Floor): boolean {
  if (isArc(w) || (w.thick !== undefined && Math.abs(w.thick - WALL_T) > 1e-6)) return false;
  const [ax, ay, bx, by] = [w.a[0] - f.grid.x0, w.a[1] - f.grid.y0, w.b[0] - f.grid.x0, w.b[1] - f.grid.y0];
  if (![ax, ay, bx, by].every(Number.isInteger) || (ax !== bx && ay !== by)) return false;
  const h = w.front === HALF_WALL ? HALF_WALL_H : WALL_H;
  return Math.abs(w.height - h) < 1e-3 && Math.abs(w.base - f.z) < 1e-3;
}

interface Ix {
  floor: Floor;
  /** its slabs at its own height, in the order drawn, with their boxes */
  slabs: { slab: Slab; x0: number; y0: number; x1: number; y1: number }[];
  /** the edges' faces ("h:x,y" / "v:x,y"): front, and back where it differs */
  front: Map<string, string>;
  back: Map<string, string>;
}

const kept = new WeakMap<Structure, Map<number, Ix | null>>();

function ix(s: Structure, floor: number): Ix | null {
  let m = kept.get(s);
  if (!m) {
    m = new Map();
    kept.set(s, m);
  }
  if (m.has(floor)) return m.get(floor) ?? null;
  const f = s.floors.find((q) => q.index === floor);
  if (!f) {
    m.set(floor, null);
    return null;
  }
  const slabs: Ix["slabs"] = [];
  for (const slab of s.slabs) {
    // (a mezzanine — over its floor's height — isn't the floor)
    if (slab.floor !== floor || Math.abs(slab.z - f.z) >= 1e-3) continue;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of slab.outline) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    slabs.push({ slab, x0, y0, x1, y1 });
  }
  const front = new Map<string, string>();
  const back = new Map<string, string>();
  const { x0, y0, w, h } = f.grid;
  for (const wall of s.walls) {
    if (wall.floor !== floor || !onTiles(wall, f)) continue;
    const [ax, ay] = wall.a;
    const [bx, by] = wall.b;
    if (ay === by) {
      if (ay < y0 || ay > y0 + h) continue;
      for (let x = Math.max(Math.min(ax, bx), x0); x < Math.min(Math.max(ax, bx), x0 + w); x++) {
        front.set(`h:${x},${ay}`, wall.front);
        if (wall.back) back.set(`h:${x},${ay}`, wall.back);
      }
    } else if (ax === bx) {
      if (ax < x0 || ax > x0 + w) continue;
      for (let y = Math.max(Math.min(ay, by), y0); y < Math.min(Math.max(ay, by), y0 + h); y++) {
        front.set(`v:${ax},${y}`, wall.front);
        if (wall.back) back.set(`v:${ax},${y}`, wall.back);
      }
    }
  }
  const out: Ix = { floor: f, slabs, front, back };
  m.set(floor, out);
  return out;
}

/** Floor `floor` of the structure (null: none). */
export const structFloor = (s: Structure, floor: number): Floor | null =>
  s.floors.find((f) => f.index === floor) ?? null;

/** The slab under (x, y) on floor `floor` at its own height — the last drawn on top — or null. */
export function slabUnder(s: Structure, floor: number, x: number, y: number): Slab | null {
  const i = ix(s, floor);
  if (!i) return null;
  for (let k = i.slabs.length - 1; k >= 0; k--) {
    const q = i.slabs[k];
    if (x < q.x0 || x > q.x1 || y < q.y0 || y > q.y1) continue;
    if (inRing(q.slab.outline, x, y) && !q.slab.holes.some((r) => inRing(r, x, y))) return q.slab;
  }
  return null;
}

/** What the floor is at (x, y) — its slab's top (the floor char) — or VOID where there's none. */
export const topAt = (s: Structure, floor: number, x: number, y: number): string =>
  slabUnder(s, floor, x, y)?.top ?? VOID;

/** The cell (tx, ty)'s floor (read by its middle): its top, or VOID. */
export const cellTop = (s: Structure, floor: number, tx: number, ty: number): string =>
  topAt(s, floor, tx + 0.5, ty + 0.5);

/** The wall's front face on a cell edge (NO_WALL: none). */
export function edgeFront(s: Structure, floor: number, e: CellEdge): string {
  return ix(s, floor)?.front.get(`${e.dir}:${e.x},${e.y}`) ?? NO_WALL;
}
/** The wall's back face on a cell edge, where it differs from its front (NO_WALL: it doesn't). */
export function edgeBack(s: Structure, floor: number, e: CellEdge): string {
  return ix(s, floor)?.back.get(`${e.dir}:${e.x},${e.y}`) ?? NO_WALL;
}

/** Every walled cell edge of a floor, with its faces (the light's, the AO's raster). */
export function cellEdges(s: Structure, floor: number): { e: CellEdge; front: string; back: string }[] {
  const i = ix(s, floor);
  if (!i) return [];
  return [...i.front].map(([k, front]) => {
    const [dir, rest] = k.split(":");
    const [x, y] = rest.split(",").map(Number);
    return { e: { dir: dir as "h" | "v", x, y }, front, back: i.back.get(k) ?? NO_WALL };
  });
}

/** A floor's extent (world, whole metres): the cells it was laid out on. [x0, y0, x1, y1). */
export function extentOf(s: Structure, floor: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const f = structFloor(s, floor);
  if (!f) return null;
  return { x0: f.grid.x0, y0: f.grid.y0, x1: f.grid.x0 + f.grid.w, y1: f.grid.y0 + f.grid.h };
}

/** A key that changes when a floor's slabs or walls do (a raster's: the light's, the bake's). */
export function floorSig(s: Structure, floor: number): string {
  const i = ix(s, floor);
  if (!i) return "";
  const parts: string[] = [];
  for (const q of i.slabs)
    parts.push(q.slab.id, q.slab.top, JSON.stringify(q.slab.outline), JSON.stringify(q.slab.holes));
  for (const [k, v] of i.front) parts.push(k, v, i.back.get(k) ?? "");
  return parts.join("|");
}

/** (x, y) is on a whole-metre point (a cell's corner). */
export const onGrid = (p: XY): boolean => Number.isInteger(p[0]) && Number.isInteger(p[1]);

// ── asked of a floor's map (levels.ts levelMap): a world's by its structure (MapDef.st); a tile
// map's — the generators', the built-in maps', an old save's on its way in — by its rows ──

const rowsOf = (m: MapDef): TileMap | null => ("tiles" in m ? (m as TileMap) : null);
const levelOf = (m: { floor?: number }): number => m.floor ?? 0;
// (a world's floor in its own frame — fold.ts localView, the browser's drawing: its places from its
// corner, the structure's the world's)
const dx = (m: MapDef): number => (m.world ? 0 : (m.ox ?? 0));
const dy = (m: MapDef): number => (m.world ? 0 : (m.oy ?? 0));
const shifted = (m: MapDef, e: CellEdge): CellEdge => (m.world ? e : { ...e, x: e.x + dx(m), y: e.y + dy(m) });

/** The floor's cell (tx, ty): its floor char, or VOID. */
export function cellOf(m: MapDef, tx: number, ty: number): string {
  if (m.st) return cellTop(m.st, levelOf(m), tx + dx(m), ty + dy(m));
  const r = rowsOf(m);
  return r ? tileAt(r, tx, ty) : VOID;
}
/** The floor at a point, exactly (its slab's top on a world; a tile map's cell). */
export function floorAtPoint(m: MapDef, x: number, y: number): string {
  if (m.st) return topAt(m.st, levelOf(m), x + dx(m), y + dy(m));
  return cellOf(m, Math.floor(x), Math.floor(y));
}
/** The wall's front on a cell edge (NO_WALL: none). */
export function wallOf(m: MapDef, e: CellEdge): string {
  if (m.st) return edgeFront(m.st, levelOf(m), shifted(m, e));
  const r = rowsOf(m);
  return r ? edgeAt(r, e) : NO_WALL;
}
/** The wall's back face on a cell edge where it differs (NO_WALL: it doesn't). */
export function backOf(m: MapDef, e: CellEdge): string {
  if (m.st) return edgeBack(m.st, levelOf(m), shifted(m, e));
  const r = rowsOf(m);
  return r ? backAt(r, e) : NO_WALL;
}
/** The wall on the north edge of (x, y) / its west edge. */
export const hWallOf = (m: MapDef, x: number, y: number): string => wallOf(m, { dir: "h", x, y });
export const vWallOf = (m: MapDef, x: number, y: number): string => wallOf(m, { dir: "v", x, y });
/** One face's material of a two-faced wall on an edge (side +1: its +y / +x face), or null. */
export function faceOf(m: MapDef, e: CellEdge, side: number): WallMat | null {
  const ch = wallOf(m, e);
  if (!isFacedWall(ch)) return null;
  if (side > 0) return ch.toLowerCase() as WallMat;
  const b = backOf(m, e);
  return b !== NO_WALL ? (b as WallMat) : (ch.toLowerCase() as WallMat);
}
/** A wall between two side-by-side cells. */
export function wallBetweenOf(m: MapDef, x: number, y: number, nx: number, ny: number): string {
  if (nx === x + 1 && ny === y) return vWallOf(m, nx, y);
  if (nx === x - 1 && ny === y) return vWallOf(m, x, y);
  if (ny === y + 1 && nx === x) return hWallOf(m, x, ny);
  if (ny === y - 1 && nx === x) return hWallOf(m, x, y);
  return NO_WALL;
}
/** A floor's layout changed (its slabs and walls; a tile map's rows). */
export function layoutSig(m: MapDef): string {
  if (m.st) return floorSig(m.st, levelOf(m));
  const r = rowsOf(m);
  return r ? [...r.tiles, ...r.hWalls, ...r.vWalls, ...(r.hBacks ?? []), ...(r.vBacks ?? [])].join("|") : "";
}
/** A floor's floors changed (its slabs; a tile map's tiles) — not its walls. */
export function floorsSig(m: MapDef): string {
  if (m.st) {
    const i = ix(m.st, levelOf(m));
    return i
      ? i.slabs.map((q) => `${q.slab.id}:${q.slab.top}:${JSON.stringify([q.slab.outline, q.slab.holes])}`).join("|")
      : "";
  }
  return rowsOf(m)?.tiles.join("\n") ?? "";
}

/** Which way a wall's front faces (a unit step on the floor), as it's drawn: a wall on the cells'
 *  edges by the tile rule (along x: +y; along y: +x), any other by its left (a to b: (−dy, dx)). */
export function frontNormal(w: Wall, f: Floor | null): XY {
  if (f && onTiles(w, f)) return w.a[1] === w.b[1] ? [0, 1] : [1, 0];
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
  return [-(w.b[1] - w.a[1]) / L, (w.b[0] - w.a[0]) / L];
}
