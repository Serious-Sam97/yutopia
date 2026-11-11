import { entry, quarterOf } from "./catalog.ts";
import type { Point } from "./geom.ts";
import type { MapDef } from "./map.ts";

// A body's size and pace, the land round a floor, and the seats things have (docs/plan/72 phase 7:
// what the tile grid held besides its tiles — the floor's questions are Jolt's, physics/place.ts).

export const STEP = 0.12; // tiles: a body steps up this much, and lands on a top its feet are this close to

export const BODY_R = 0.22;
export const WALK_SPEED = 4.2; // tiles per second
export const RUN_SPEED = 7;

// Slide along walls (and the sides of things higher than the feet, z up): try
// the full move, then each axis on its own.
// (`blocked`: something else in the way — a car on the move)
export function moveStep(
  grid: { fitsAt(x: number, y: number, z: number): boolean },
  pos: Point,
  dir: Point,
  speed: number,
  dt: number,
  z = 0,
  blocked?: (x: number, y: number) => boolean,
): Point {
  const nx = pos.x + dir.x * speed * dt;
  const ny = pos.y + dir.y * speed * dt;
  const fits = (x: number, y: number) => grid.fitsAt(x, y, z) && !blocked?.(x, y);
  if (fits(nx, ny)) return { x: nx, y: ny };
  if (fits(nx, pos.y)) return { x: nx, y: pos.y };
  if (fits(pos.x, ny)) return { x: pos.x, y: ny };
  return pos;
}

// ── outdoors (docs/plan/27-the-grounds.md) ──────────────────────────────────
// The ground floor of a building stands on the Grounds: past its stored tiles
// (and on its empty ones) the land goes on — the generated terrain, its height
// the ground's, its trees and steep rock in the way. Land is ground, never an
// obstacle: whatever its height, a body on it stands on it.
export interface Outdoors {
  /** a tile you can stand on (a world map's floor: world; an older one's: its own tiles) */
  walkable(tx: number, ty: number): boolean;
  /** the ground's height at a point (tiles up from the floor's datum) */
  height(x: number, y: number): number;
  /** how fast you go on it there (1: as on a floor; deep snow less) */
  speed?(x: number, y: number): number;
  /** a wall on an edge past the floor's own (the town's buildings): h north of (x, y), v west */
  edge?(dir: "h" | "v", x: number, y: number): boolean;
  /** something low on a tile you can't walk (the bench, a parked car): its top over the ground,
   *  tiles — stood on, vaulted, climbed (docs/plan/29-the-move.md M4); none: not a number */
  top?(tx: number, ty: number): number;
}
let outdoorsFor: ((map: MapDef) => Outdoors | null) | null = null;
/** Who knows the land round a floor (the Grounds; set once they're loaded). */
export function setOutdoors(f: ((map: MapDef) => Outdoors | null) | null): void {
  outdoorsFor = f;
}
/** The land round a floor (null: none — another floor, a lone map, the Grounds not loaded). */
export const outdoorsOf = (map: MapDef): Outdoors | null => outdoorsFor?.(map) ?? null;

/** A seat on a tile: what it is, its turn, and how far a sitter's pulled in to a desk (tiles). */
export interface Seat {
  id: string;
  rot: number;
  kind: string;
  pull: number;
  /** a free seat's (docs/plan/72 phase 11.9 — turned any way): the way its sitter faces, a unit
   *  step on the floor, and where they sit (its seat's line nearest the tile) */
  front?: [number, number];
  spot?: { x: number; y: number };
}
/** The way a seat's sitter faces, a unit step on the floor: a free one's own, else by its turn. */
export const seatDir = (s: Seat): [number, number] => s.front ?? seatFront(s.rot);
/** …as radians (atan2 of the step). */
export const seatYaw = (s: Seat): number => {
  const [fx, fy] = seatDir(s);
  return Math.atan2(fy, fx);
};
/** …as a facing byte (256 a turn: +y is 64) — the world server's `seatFacing` for a free one. */
export const seatByte = (s: Seat): number => Math.round((seatYaw(s) / Math.PI) * 128) & 255;
/** A chair of a kind whose seats face different ways (fam CHAIRS: the chess table's), placed: its
 *  middle (tiles), the way it faces (a seat's rot) and its middle along that way from its tile's
 *  middle (a seat's `pull`). */
export function chairAt(
  o: { x: number; y: number; yaw?: number; kind: string },
  c: { u: number; v: number; face: number },
): { x: number; y: number; rot: number; pull: number } {
  const e = entry(o.kind);
  // (the kind's frame turned as the shapes turn it: shapes turnPoint)
  let [X, Y, W, H] = [c.u, c.v, e.w, e.h];
  for (let i = 0; i < (quarterOf(o) & 3); i++) {
    [X, Y] = [H - Y, X];
    [W, H] = [H, W];
  }
  const x = o.x + X;
  const y = o.y + Y;
  const rot = (c.face + quarterOf(o)) & 3;
  const [fx, fy] = seatFront(rot);
  return { x, y, rot, pull: (x - Math.floor(x) - 0.5) * fx + (y - Math.floor(y) - 0.5) * fy };
}
/** How far a chair at a desk (and whoever's on it) comes in to it, tiles: the knees under its top,
 *  still on the chair's own tile (docs/plan/62-the-touch.md, phase 2) — no further than the body's own
 *  round can come to the desk's edge (at 0.4 the sitter stopped at 0.29 on the desk, the chair drawn
 *  11 cm on, its back through them). */
export const DESK_PULL = 0.5 - BODY_R - 0.005;
/** The way a seat's sitter faces, as a step on the floor: away from its back (on −y at rot 0) —
 *  the world server's `seatFacing`. */
export function seatFront(rot: number): [number, number] {
  return (
    [
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 0],
    ] as [number, number][]
  )[((rot % 4) + 4) % 4];
}
