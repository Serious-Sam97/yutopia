// Floors painted tile by tile (docs/plan/130-the-house-build.md, phase 4 — F4a, The Sims' floor tool): over a floor's
// slabs, a material per tile of the 1 m grid, or per part of one — each tile cut into 8 triangles round its middle (by
// its diagonals and its medians), so a whole tile, a half (a side's), a quarter (a corner's square), a triangle (a
// diagonal's half) are each some of the 8. Kept as the floor's "tiles" layer (ops.ts): "x,y" (the tile's corner,
// world metres) → one material, or the 8 parts' ("" not painted). Drawn over the slabs (the client's floor bake); a
// paint only — what's walked on is the slab under it.

import { isCover } from "./coverings.ts";
import type { StructOp } from "./ops.ts";
import { slabUnder } from "./query.ts";
import type { Structure, XY } from "./types.ts";

/** A tile's paint: one material all over, or each of its 8 parts' ("": that part not painted). */
export type TileCell = string | string[];
export type TileLayer = Record<string, TileCell>;
export const TILES = "tiles";
export const TILE_PARTS = 8;
/** The most tiles one stroke paints. */
export const TILES_AT_ONCE = 4096;

// the 8 parts, round the middle from the north edge's west half, clockwise (a tile's own frame, 0..1, y down)
const C: XY = [0.5, 0.5];
const P: XY[] = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
];
/** Part k's triangle in the tile's own frame. */
export const partTri = (k: number): [XY, XY, XY] => [C, P[k], P[(k + 1) % 8]];

/** What a brush paints of a tile. */
export type TileBrush = "tile" | "half" | "quarter" | "tri";
export const TILE_BRUSHES: readonly TileBrush[] = ["tile", "half", "quarter", "tri"];
const bits = (...ks: number[]) => ks.reduce((m, k) => m | (1 << k), 0);
/** The parts a brush paints with the pointer at (fx, fy) in a tile (0..1): the half, the quarter or the diagonal's half
 *  the pointer's in. */
export function brushMask(b: TileBrush, fx: number, fy: number): number {
  if (b === "tile") return 0xff;
  if (b === "quarter") {
    if (fy < 0.5) return fx < 0.5 ? bits(7, 0) : bits(1, 2);
    return fx < 0.5 ? bits(5, 6) : bits(3, 4);
  }
  if (b === "half") {
    // (the side it's nearest: north, east, south, west)
    const d = [fy, 1 - fx, 1 - fy, fx];
    const i = d.indexOf(Math.min(...d));
    return [bits(7, 0, 1, 2), bits(1, 2, 3, 4), bits(3, 4, 5, 6), bits(5, 6, 7, 0)][i];
  }
  // (a triangle: the half of the tile across the diagonal nearer the pointer's corner)
  const nw = fx + fy < 1;
  const ne = fx > fy;
  if (Math.abs(fx + fy - 1) > Math.abs(fx - fy)) return nw ? bits(6, 7, 0, 1) : bits(2, 3, 4, 5);
  return ne ? bits(0, 1, 2, 3) : bits(4, 5, 6, 7);
}

/** A tile's parts as 8 materials. */
const partsOf = (c: TileCell | undefined): string[] => (Array.isArray(c) ? [...c] : Array(TILE_PARTS).fill(c ?? ""));
/** The parts back to a cell (one material when they're all one; none when none). */
function cellOf(parts: string[]): TileCell | null {
  if (parts.every((p) => p === "")) return null;
  return parts.every((p) => p === parts[0]) ? parts[0] : parts;
}

/** A floor's tiles with these painted (`mat`; null: their paint taken off). */
export function painted(
  layer: TileLayer | undefined,
  cells: readonly { x: number; y: number; mask: number }[],
  mat: string | null,
): TileLayer {
  const out: TileLayer = { ...(layer ?? {}) };
  for (const c of cells) {
    const key = `${c.x},${c.y}`;
    const parts = partsOf(out[key]);
    for (let k = 0; k < TILE_PARTS; k++) if (c.mask & (1 << k)) parts[k] = mat ?? "";
    const cell = cellOf(parts);
    if (cell === null) delete out[key];
    else out[key] = cell;
  }
  return out;
}

/** Why these tiles can't be painted on floor `floor` (null: they can): whole metres, on its floor (a slab there). */
export function tilesWhy(
  s: Structure,
  floor: number,
  cells: readonly { x: number; y: number; mask: number }[],
  mat: string | null,
  mats: readonly string[],
): string | null {
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return "no such floor";
  if (cells.length > TILES_AT_ONCE) return "too many at once";
  if (mat !== null && !mats.includes(mat) && !isCover(mat, "floor")) return "not a floor's material";
  for (const c of cells) {
    if (!Number.isInteger(c.x) || !Number.isInteger(c.y) || !Number.isInteger(c.mask) || c.mask <= 0 || c.mask > 0xff)
      return "not a tile";
    if (mat !== null && !floorAt(s, floor, c.x + 0.5, c.y + 0.5)) return "no floor there to paint";
  }
  return null;
}

/** A floor under (x, y) to paint (a home lot's ground — the land — isn't one: plan 130). */
const floorAt = (s: Structure, floor: number, x: number, y: number): boolean => {
  const sl = slabUnder(s, floor, x, y);
  return !!sl && sl.top !== "g";
};

/** The operation that paints them. */
export const tilesOp = (s: Structure, floor: number, layer: TileLayer): StructOp => ({
  op: "layer",
  name: TILES,
  floor,
  data: Object.keys(layer).length ? layer : null,
});
/** A floor's tiles layer. */
export const tilesOf = (s: Structure, floor: number): TileLayer =>
  (s.layers?.[TILES]?.[String(floor)] as TileLayer | undefined) ?? {};

/** The tiles a room's floor covers (Shift: the room), or every tile of a floor with a slab (Ctrl Shift: the storey). */
export function tilesIn(
  s: Structure,
  floor: number,
  inside: (x: number, y: number) => boolean,
): { x: number; y: number; mask: number }[] {
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return [];
  const out: { x: number; y: number; mask: number }[] = [];
  const { x0, y0, w, h } = f.grid;
  for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++)
    for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++)
      if (inside(x + 0.5, y + 0.5) && floorAt(s, floor, x + 0.5, y + 0.5)) out.push({ x, y, mask: 0xff });
  return out;
}
