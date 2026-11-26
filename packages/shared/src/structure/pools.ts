// Pools (docs/plan/130-the-house-build.md, phase 11 — F11a): a swimming pool dug in a home lot's yard — a box on the
// plan, so deep, tiled, its coping round it, a ladder down one side, lights in its walls. Kept as its ground storey's
// "pools" layer (ops.ts): the land holed over it (found.ts landHolesOf), its basin solid (physics/build.ts), its
// water what plan 66's swim and dive read (`poolWaterAt` — the registry `setPoolWater` fills, as the land's holes').

import type { StructOp } from "./ops.ts";
import { inRing } from "./rings.ts";
import type { Structure, XY } from "./types.ts";

export const POOLS = "pools";
export const POOL_DEPTHS = [1.0, 1.4, 1.8, 2.4] as const;
export const POOL_TILES: Record<string, number> = {
  blue: 0x3f8fc4,
  teal: 0x2f9a9a,
  white: 0xdde8ee,
  black: 0x2c3440,
  mosaic: 0x4f7fb8,
};
export const POOL_COPINGS = ["stone", "brick", "concrete", "wood"] as const;
/** The water's surface under the land's (m). */
export const POOL_FREEBOARD = 0.15;

export interface Pool {
  id: string;
  ring: XY[];
  depth: number;
  tile: string;
  coping: (typeof POOL_COPINGS)[number];
  /** the side (0..3 of its ring's edges) its ladder's on; −1 none */
  ladder: number;
  lights: boolean;
}
export type PoolDraft = Omit<Pool, "id" | "ring"> & { a: XY; b: XY };

const r3 = (v: number) => Math.round(v * 1000) / 1000;
export const poolsOf = (s: Structure, floor: number): Pool[] =>
  (s.layers?.[POOLS]?.[String(floor)] as Pool[] | undefined) ?? [];
const boxOf = (ring: XY[]) => {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};
const overlaps = (a: XY[], b: XY[], m = 0) => {
  const p = boxOf(a);
  const q = boxOf(b);
  return p.x0 < q.x1 + m && q.x0 < p.x1 + m && p.y0 < q.y1 + m && q.y0 < p.y1 + m;
};

/** A pool dug from `a` to `b` (half metres), or why not: a lot's ground storey's yard, 2–12 by 2–20 m, clear of its
 *  foundations, its basement digs, its other pools, its walls. */
export function poolAddOps(s: Structure, floor: number, d: PoolDraft, id: string): StructOp | string {
  const f = s.floors.find((q) => q.index === floor);
  if (!f || (f.storey ?? 0) !== 0 || !f.space?.startsWith("home:")) return "dig it in a lot's yard";
  const h = (v: number) => Math.round(v * 2) / 2;
  const [x0, x1] = [h(Math.min(d.a[0], d.b[0])), h(Math.max(d.a[0], d.b[0]))];
  const [y0, y1] = [h(Math.min(d.a[1], d.b[1])), h(Math.max(d.a[1], d.b[1]))];
  const [w, l] = [Math.min(x1 - x0, y1 - y0), Math.max(x1 - x0, y1 - y0)];
  if (!(w >= 2 && l >= 2)) return "2 m a side at least";
  if (w > 12 || l > 20) return "12 by 20 m at most";
  if (!(POOL_DEPTHS as readonly number[]).includes(d.depth)) return "not a pool's depth";
  if (!(d.tile in POOL_TILES)) return "not a pool's tile";
  if (!(POOL_COPINGS as readonly string[]).includes(d.coping)) return "not a coping";
  if (!Number.isInteger(d.ladder) || d.ladder < -1 || d.ladder > 3) return "not a side for its ladder";
  const ring: XY[] = [
    [r3(x0), r3(y0)],
    [r3(x1), r3(y0)],
    [r3(x1), r3(y1)],
    [r3(x0), r3(y1)],
  ];
  const { x0: gx0, y0: gy0, w: gw, h: gh } = f.grid;
  if (
    !ring.every((p) => p[0] >= gx0 - 0.01 && p[1] >= gy0 - 0.01 && p[0] <= gx0 + gw + 0.01 && p[1] <= gy0 + gh + 0.01)
  )
    return "off the lot";
  // (in the yard: on the land — not over a foundation, a basement, another pool; a coping's width off them)
  for (const name of ["found", "dig", POOLS])
    for (const q of (s.layers?.[name]?.[String(floor)] as { ring: XY[] }[] | undefined) ?? [])
      if (overlaps(ring, q.ring, 0.4)) return name === POOLS ? "another pool's there" : "keep it off the house";
  for (const sl of s.slabs)
    if (sl.floor === floor && sl.top !== "g" && Math.abs(sl.z - f.z) < 1e-3 && overlaps(ring, sl.outline, 0.3))
      return "keep it off the house";
  for (const w0 of s.walls)
    if (
      w0.floor === floor &&
      [w0.a, w0.b, [(w0.a[0] + w0.b[0]) / 2, (w0.a[1] + w0.b[1]) / 2] as XY].some((p) => inRing(ring, p[0], p[1]))
    )
      return "a wall's in the way";
  const pool: Pool = { id, ring, depth: d.depth, tile: d.tile, coping: d.coping, ladder: d.ladder, lights: !!d.lights };
  return { op: "layer", name: POOLS, floor, data: [...poolsOf(s, floor), pool] };
}
/** A pool filled in again. */
export function poolRemoveOps(s: Structure, floor: number, id: string): StructOp | string {
  const list = poolsOf(s, floor);
  if (!list.some((q) => q.id === id)) return "no such pool";
  const rest = list.filter((q) => q.id !== id);
  return { op: "layer", name: POOLS, floor, data: rest.length ? rest : null };
}

// ── the water: the registry the swim asks (world metres) ─────────────────────────────────────────────────────────────
interface PoolWater {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  level: number;
  bed: number;
  floor: number;
}
let WATER: PoolWater[] = [];
let FLOORS = new Set<number>();
/** The floors with a pool (their walkers ask the pools' water). */
export const poolFloors = (): ReadonlySet<number> => FLOORS;
/** The pools' water from a structure (its lots' yards: the land's top is the floor's less its foundation). */
export function setPoolWater(s: Structure): void {
  const out: PoolWater[] = [];
  for (const [fl, list] of Object.entries(s.layers?.[POOLS] ?? {})) {
    const f = s.floors.find((q) => q.index === Number(fl));
    if (!f || f.away) continue;
    const land = f.z - (f.found ?? 0);
    for (const p of (list as Pool[]) ?? []) {
      const b = boxOf(p.ring);
      out.push({
        x0: b.x0,
        z0: b.y0,
        x1: b.x1,
        z1: b.y1,
        level: land - POOL_FREEBOARD,
        bed: land - p.depth,
        floor: f.index,
      });
    }
  }
  WATER = out;
  FLOORS = new Set(out.map((w) => w.floor));
}
/** The water of a pool at (x, z) on floor `floor` (world heights), or null. */
export function poolWaterAt(
  x: number,
  z: number,
  floor?: number,
): { level: number; bed: number; depth: number; flow: [number, number]; kind: "pool" } | null {
  for (const w of WATER)
    if ((floor === undefined || w.floor === floor) && x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1)
      return { level: w.level, bed: w.bed, depth: w.level - w.bed, flow: [0, 0], kind: "pool" };
  return null;
}
