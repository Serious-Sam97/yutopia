import type { WorldObjectDef } from "./catalog.ts";
import type { Point } from "./iso.ts";
import { across, floorOf, objLevel, STOREY } from "./levels.ts";
import type { Edge, MapDef } from "./map.ts";

// A staircase (the catalog's `stairs`): a switchback in a 4 × 6 well from its
// floor to the one above (docs/plan/25-building-floors.md). Local coords (rot
// 0): u across 0..4, v along 0..6; the door side is v = 0.
//
//   v 0..1   the landing by the door: floor (the floor's own)
//   v 1..4   flight A (u 2..4): up, away from the door, 0 → STOREY/2
//   v 4..6   the half landing (all across), STOREY/2
//   v 4..1   flight B (u 0..2): up, back towards the door, STOREY/2 → STOREY,
//            arriving by the same door one floor up
//
// A wall runs between the flights (u = 2, v 1..4). The floor above has a hole
// over v 1..6; there flight B (seen from up there, STOREY lower) is the way
// down and the next staircase's flight A the way up. You really walk them: the
// treads are surfaces (Grid ramps) your feet follow, step by step.
//
// Turned like everything else (Sketch.rp): rot 1 puts the door on the east,
// rot 2 south, rot 3 west.

export const STAIRS_W = 4;
export const STAIRS_D = 6;
const V_FLIGHT = 1; // where the flights start (the door's landing ends)
const V_TURN = 4; // where they turn (the half landing starts)
const HALF = STOREY / 2;

/** A surface you walk on, in tile coords of the floor it's on: a rectangle
 *  whose height runs from h0 at `along` = a0 to h1 at a1 (flat: h0 = h1). */
export interface Ramp {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  axis: "x" | "y";
  a0: number;
  a1: number;
  h0: number;
  h1: number;
}

export function rampHeight(r: Ramp, x: number, y: number): number {
  if (r.h0 === r.h1) return r.h0;
  const a = r.axis === "x" ? x : y;
  const t = Math.max(0, Math.min(1, (a - r.a0) / (r.a1 - r.a0)));
  return r.h0 + (r.h1 - r.h0) * t;
}

export const inRamp = (r: Ramp, x: number, y: number): boolean => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;

/** Local (u, v) → tile coords of the stairs' floor (the same turn as Sketch.rp). */
export function stairsPoint(o: { x: number; y: number; rot?: number }, u: number, v: number): Point {
  let X = u;
  let Y = v;
  let W = STAIRS_W;
  let H = STAIRS_D;
  for (let i = 0; i < ((o.rot ?? 0) & 3); i++) {
    [X, Y] = [H - Y, X];
    [W, H] = [H, W];
  }
  return { x: o.x + X, y: o.y + Y };
}

/** Tile coords → local (u, v). */
export function stairsLocal(o: { x: number; y: number; rot?: number }, x: number, y: number): { u: number; v: number } {
  const r = (o.rot ?? 0) & 3;
  const X = x - o.x;
  const Y = y - o.y;
  if (r === 1) return { u: Y, v: STAIRS_D - X };
  if (r === 2) return { u: STAIRS_W - X, v: STAIRS_D - Y };
  if (r === 3) return { u: STAIRS_W - Y, v: X };
  return { u: X, v: Y };
}

// a local rectangle (u0..u1 × v0..v1) as a tile-coords rectangle
function rect(o: { x: number; y: number; rot?: number }, u0: number, v0: number, u1: number, v1: number) {
  const a = stairsPoint(o, u0, v0);
  const b = stairsPoint(o, u1, v1);
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

// a local slope along v (from v0 at h0 to v1 at h1) as a ramp
function slope(
  o: { x: number; y: number; rot?: number },
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  h0: number,
  h1: number,
): Ramp {
  const r = rect(o, u0, Math.min(v0, v1), u1, Math.max(v0, v1));
  const a = stairsPoint(o, 0, v0);
  const b = stairsPoint(o, 0, v1);
  const axis = a.x !== b.x ? "x" : "y";
  return { ...r, axis, a0: axis === "x" ? a.x : a.y, a1: axis === "x" ? b.x : b.y, h0, h1 };
}

/** The stairs' surfaces, `dz` up from their floor (−STOREY: seen from the floor above). */
export function stairsRamps(o: { x: number; y: number; rot?: number }, dz = 0): Ramp[] {
  return [
    slope(o, 2, STAIRS_W, V_FLIGHT, V_TURN, dz, dz + HALF), // flight A
    slope(o, 0, STAIRS_W, V_TURN, STAIRS_D, dz + HALF, dz + HALF), // the half landing
    slope(o, 0, 2, V_TURN, V_FLIGHT, dz + HALF, dz + STOREY), // flight B
  ];
}

/** The tiles of the well (v 1..6): no floor of their own, only the treads. */
export function stairsWell(o: { x: number; y: number; rot?: number }): [number, number][] {
  const r = rect(o, 0, V_FLIGHT, STAIRS_W, STAIRS_D);
  const out: [number, number][] = [];
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) out.push([x, y]);
  return out;
}

// a local line (u, v0..v1 or u0..u1, v) as the tile edges along it
function lineEdges(o: { x: number; y: number; rot?: number }, a: [number, number], b: [number, number]): Edge[] {
  const p = stairsPoint(o, a[0], a[1]);
  const q = stairsPoint(o, b[0], b[1]);
  const out: Edge[] = [];
  if (p.x === q.x) for (let y = Math.min(p.y, q.y); y < Math.max(p.y, q.y); y++) out.push({ x: p.x, y, dir: "v" });
  else for (let x = Math.min(p.x, q.x); x < Math.max(p.x, q.x); x++) out.push({ x, y: p.y, dir: "h" });
  return out;
}

/** The wall between the two flights. */
export function stairsDivider(o: { x: number; y: number; rot?: number }): Edge[] {
  return lineEdges(o, [2, V_FLIGHT], [2, V_TURN]);
}

/** On a floor with nothing going up: the rail across the top of the hole where
 *  the next flight would start (the flight below is a floor down). */
export function stairsTopRail(o: { x: number; y: number; rot?: number }): Edge[] {
  return lineEdges(o, [2, V_FLIGHT], [STAIRS_W, V_FLIGHT]);
}

export const isStairs = (o: { kind: string }): boolean => o.kind === "stairs";

/** Is (x, y) on these stairs' well (where floors change)? */
export function onStairs(o: WorldObjectDef, x: number, y: number): boolean {
  const { u, v } = stairsLocal(o, x, y);
  return u >= 0 && u <= STAIRS_W && v >= V_FLIGHT - 0.5 && v <= STAIRS_D;
}

// A body on the stairs is on whichever floor its feet are nearest: in a floor's
// frame its feet stay between these (hysteresis: past them it's the next floor).
export const FLOOR_BAND: [number, number] = [-0.6, STOREY - 0.6];

/** Past the band, the feet are on the next floor up or down (when there is one):
 *  the new floor, and how much their height changes (its frame is STOREY off). */
export function floorChange(z: number, level: number, floors: number[]): { level: number; dz: number } | null {
  if (z > FLOOR_BAND[1] && floors.includes(level + 1)) return { level: level + 1, dz: -STOREY };
  if (z < FLOOR_BAND[0] && floors.includes(level - 1)) return { level: level - 1, dz: STOREY };
  return null;
}

/** The tiles of a floor open to another, as "x,y": "floor" — where the stairs
 *  from the floor below come up through it (no floor drawn there); "ceiling" —
 *  over its own stairs (no ceiling: they go on up). */
export function wellsOf(
  map: MapDef,
  objects: Iterable<WorldObjectDef>,
  which: "floor" | "ceiling" = "floor",
): Set<string> {
  const f = floorOf(map);
  const out = new Set<string>();
  for (const o of objects) {
    if (o.kind !== "stairs") continue;
    const l = objLevel(o, map);
    const at = which === "ceiling" ? (l === f ? o : null) : l === f - 1 ? { ...o, ...across(map, l, f, o) } : null;
    if (at) for (const [x, y] of stairsWell(at)) out.add(`${x},${y}`);
  }
  return out;
}

/** The middle of the stairs' fire doors (the pair on their door side, u 0..2). */
export function stairsDoor(o: { x: number; y: number; rot?: number }): Point {
  return stairsPoint(o, 1, 0);
}

/** The way up a staircase, from inside its door to the floor above's landing
 *  (its floor's tile coords; the last point is on the floor above, in the same
 *  spot of the building): flight A, the half landing, flight B. Reversed, the
 *  way down from the floor above. */
export function stairsWayUp(o: { x: number; y: number; rot?: number }): Point[] {
  return [
    [1, 0.55],
    [3, 0.8],
    [3, 3.9],
    [3, 5],
    [1, 5],
    [1, 3.9],
    [1, 1.05],
    [1, 0.5],
  ].map(([u, v]) => stairsPoint(o, u, v));
}
