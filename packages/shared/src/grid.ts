import { entry, footprint, standHeight, type WorldObjectDef } from "./catalog.ts";
import { dressItems } from "./dressing.ts";
import type { Point } from "./iso.ts";
import { type AreaDef, type Edge, hWall, isFloor, isWallEdge, type MapDef, NO_WALL, tileAt, vWall } from "./map.ts";

// Walkability: floor tiles minus solid furniture, and walls on tile edges that
// bodies can't cross (thin walls, WALL_T thick). Rebuilt whenever objects or
// the map change (build mode); cheap enough for maps this size.
export const WALL_T = 0.2; // wall thickness, tiles (the wall is centred on its edge)
// Heights (shared/jump.ts): a body jumps up onto solid things it can stand on.
// Each tile has a top: 0 the floor, the top of the thing on it (tiles up), or
// Infinity (no floor, walls' clutter, something not to stand on).
export const STEP = 0.12; // tiles: a body steps up this much, and lands on a top its feet are this close to
export const ZPX_TILE = 39.19; // iso px of height a tile (45.25 · cos 30°)

export class Grid {
  readonly walk: Uint8Array;
  readonly top: Float32Array; // what a body stands on in each tile, tiles up (Infinity: nothing)
  readonly hBlock: Uint8Array; // north edge of (x, y): (height + 1) × width
  readonly vBlock: Uint8Array; // west edge of (x, y): height × (width + 1)
  readonly seats = new Map<number, { id: string; rot: number }>();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.walk = new Uint8Array(width * height);
    this.top = new Float32Array(width * height).fill(Number.POSITIVE_INFINITY);
    this.hBlock = new Uint8Array((height + 1) * width);
    this.vBlock = new Uint8Array(height * (width + 1));
  }

  // `as` = whose grid: locked doors are walls for everyone but their room's
  // owner. Without it (shared paths, previews) locked doors block everyone.
  // `dressing: false` leaves the rooms' clutter out (placement checks: furniture wins).
  static from(
    map: MapDef,
    objects: Iterable<WorldObjectDef>,
    as?: { uid: number | null },
    opts: { dressing?: boolean } = {},
  ): Grid {
    const g = new Grid(map.width, map.height);
    const list = [...objects];
    objects = list;
    const W = map.width;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < W; x++) {
        const floor = isFloor(tileAt(map, x, y));
        g.walk[y * W + x] = floor ? 1 : 0;
        if (floor) g.top[y * W + x] = 0;
      }
    for (let y = 0; y <= map.height; y++)
      for (let x = 0; x < W; x++) if (isWallEdge(hWall(map, x, y))) g.hBlock[y * W + x] = 1;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x <= W; x++) if (isWallEdge(vWall(map, x, y))) g.vBlock[y * (W + 1) + x] = 1;
    for (const o of objects) {
      const e = entry(o.kind);
      const { w, h } = footprint(o.kind, o.rot ?? 0);
      if (e.seat)
        for (let dy = 0; dy < h; dy++)
          for (let dx = 0; dx < w; dx++) g.seats.set(g.idx(o.x + dx, o.y + dy), { id: o.id, rot: o.rot ?? 0 });
      if (o.kind === "door") {
        if (o.props?.state === "locked" && (as?.uid == null || doorOwner(map, o) !== as.uid)) g.blockEdge(doorEdge(o));
        continue;
      }
      if (!e.solid || e.wall) continue;
      const stand = standHeight(o.kind);
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) g.block(o.x + dx, o.y + dy, stand === undefined ? undefined : stand / ZPX_TILE);
    }
    if (opts.dressing !== false)
      for (const d of dressItems(map, list)) if (d.solid && d.tile) g.block(d.tile[0], d.tile[1]);
    return g;
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  /** Something solid on a tile: `stand` = its top (tiles up) when it can be stood on. */
  block(x: number, y: number, stand?: number): void {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.walk[i] = 0;
    // (on the floor only, and nothing taller and unstandable there already)
    this.top[i] = stand !== undefined && this.top[i] !== Number.POSITIVE_INFINITY ? stand : Number.POSITIVE_INFINITY;
  }

  /** What a body stands on in tile (x, y), tiles up (Infinity: nothing). */
  topAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.top[this.idx(x, y)] : Number.POSITIVE_INFINITY;
  }

  blockEdge(e: Edge): void {
    if (e.dir === "h" && e.x >= 0 && e.x < this.width && e.y >= 0 && e.y <= this.height)
      this.hBlock[e.y * this.width + e.x] = 1;
    if (e.dir === "v" && e.y >= 0 && e.y < this.height && e.x >= 0 && e.x <= this.width)
      this.vBlock[e.y * (this.width + 1) + e.x] = 1;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  ok(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.walk[this.idx(x, y)] === 1;
  }

  hWallAt(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y <= this.height && this.hBlock[y * this.width + x] === 1;
  }

  vWallAt(x: number, y: number): boolean {
    return y >= 0 && y < this.height && x >= 0 && x <= this.width && this.vBlock[y * (this.width + 1) + x] === 1;
  }

  // One step between neighbouring tiles (8-way): no wall on the way, and no
  // cutting a corner past a wall or a blocked tile.
  step(x: number, y: number, nx: number, ny: number): boolean {
    if (!this.ok(nx, ny)) return false;
    const dx = nx - x;
    const dy = ny - y;
    const across = (ax: number, ay: number, bx: number, by: number) =>
      bx > ax
        ? !this.vWallAt(bx, ay)
        : bx < ax
          ? !this.vWallAt(ax, ay)
          : by > ay
            ? !this.hWallAt(ax, by)
            : !this.hWallAt(ax, ay);
    if (dx === 0 || dy === 0) return across(x, y, nx, ny);
    return (
      this.ok(nx, y) &&
      this.ok(x, ny) &&
      across(x, y, nx, y) &&
      across(nx, y, nx, ny) &&
      across(x, y, x, ny) &&
      across(x, ny, nx, ny)
    );
  }

  seatAt(x: number, y: number): { id: string; rot: number } | undefined {
    return this.seats.get(this.idx(Math.floor(x), Math.floor(y)));
  }

  // A body is a small square around its centre: its corners must be on floor,
  // and it may not touch a wall (walls are WALL_T thick; their ends count too).
  fits(x: number, y: number, r = BODY_R): boolean {
    if (
      !this.ok(Math.floor(x - r), Math.floor(y - r)) ||
      !this.ok(Math.floor(x + r), Math.floor(y - r)) ||
      !this.ok(Math.floor(x - r), Math.floor(y + r)) ||
      !this.ok(Math.floor(x + r), Math.floor(y + r))
    )
      return false;
    return this.clearOfWalls(x, y, r);
  }

  // A body with its feet z tiles up: every corner over something no higher than
  // a step above them (the floor, or a top it's up on), and no wall.
  fitsAt(x: number, y: number, z: number, r = BODY_R): boolean {
    if (z <= 0) return this.fits(x, y, r);
    const up = z + STEP;
    if (
      this.topAt(Math.floor(x - r), Math.floor(y - r)) > up ||
      this.topAt(Math.floor(x + r), Math.floor(y - r)) > up ||
      this.topAt(Math.floor(x - r), Math.floor(y + r)) > up ||
      this.topAt(Math.floor(x + r), Math.floor(y + r)) > up
    )
      return false;
    return this.clearOfWalls(x, y, r);
  }

  // What a body at (x, y) with its feet z up stands on: the highest top under
  // any of it within a step of its feet (it stands on an edge, platform-style).
  groundAt(x: number, y: number, z: number, r = BODY_R): number {
    const up = z + STEP;
    let g = 0;
    for (const [cx, cy] of [
      [x - r, y - r],
      [x + r, y - r],
      [x - r, y + r],
      [x + r, y + r],
    ]) {
      const t = this.topAt(Math.floor(cx), Math.floor(cy));
      if (t <= up && t > g) g = t;
    }
    return g;
  }

  private clearOfWalls(x: number, y: number, r: number): boolean {
    const t = WALL_T / 2;
    // horizontal walls on lines Y crossing the body (grown by the wall's half thickness)
    for (let Y = Math.ceil(y - r - t); Y <= Math.floor(y + r + t); Y++)
      for (let X = Math.floor(x - r - t); X <= Math.floor(x + r + t); X++) if (this.hWallAt(X, Y)) return false;
    for (let X = Math.ceil(x - r - t); X <= Math.floor(x + r + t); X++)
      for (let Y = Math.floor(y - r - t); Y <= Math.floor(y + r + t); Y++) if (this.vWallAt(X, Y)) return false;
    return true;
  }

  // True if a body can slide straight from a to b (its feet z up).
  clear(a: Point, b: Point, r = BODY_R, z = 0): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(d / 0.1));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.fitsAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, z, r)) return false;
    }
    return true;
  }

  // Nearest spot a body fits, at a tile centre (for spawns and teleports).
  nearestOpen(x: number, y: number, maxR = 8): Point | null {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.ok(cx + dx, cy + dy) && this.fits(cx + dx + 0.5, cy + dy + 0.5))
            return { x: cx + dx + 0.5, y: cy + dy + 0.5 };
        }
    }
    return null;
  }
}

export const BODY_R = 0.22;
export const WALK_SPEED = 4.2; // tiles per second
export const RUN_SPEED = 7;

// Slide along walls: try the full move, then each axis on its own.
// Slide along walls (and the sides of things higher than the feet, z up): try
// the full move, then each axis on its own.
export function moveStep(grid: Grid, pos: Point, dir: Point, speed: number, dt: number, z = 0): Point {
  const nx = pos.x + dir.x * speed * dt;
  const ny = pos.y + dir.y * speed * dt;
  if (grid.fitsAt(nx, ny, z)) return { x: nx, y: ny };
  if (grid.fitsAt(nx, pos.y, z)) return { x: nx, y: pos.y };
  if (grid.fitsAt(pos.x, ny, z)) return { x: pos.x, y: ny };
  return pos;
}

// Server-side sanity check for client-reported movement: feet z up at `to`
// (zPath: the highest they were on the way).
export function isLegalMove(grid: Grid, from: Point, to: Point, dtSec: number, z = 0, zPath = z): boolean {
  if (!grid.fitsAt(to.x, to.y, z, 0.05)) return false;
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  if (d > RUN_SPEED * Math.max(dtSec, 0.05) * 1.6 + 0.35) return false;
  return grid.clear(from, to, 0.05, Math.max(z, zPath));
}

// ── doors ──────────────────────────────────────────────────────────────────
// A door sits on a tile edge: rot even = the north edge of its tile (in a wall
// along x), rot odd = the west edge (a wall along y).
export function doorEdge(o: { x: number; y: number; rot?: number }): Edge {
  return (o.rot ?? 0) % 2 === 0 ? { x: o.x, y: o.y, dir: "h" } : { x: o.x, y: o.y, dir: "v" };
}

// The middle of a door's edge (tile coords).
export function doorCentre(o: { x: number; y: number; rot?: number }): Point {
  return (o.rot ?? 0) % 2 === 0 ? { x: o.x + 0.5, y: o.y } : { x: o.x, y: o.y + 0.5 };
}

// Can a door go on this edge? It must be a gap in a wall line: no wall on the
// edge itself, walls on both edges next to it along the line, floor both sides.
export function doorFits(map: MapDef, e: Edge): boolean {
  const floor = (x: number, y: number) => isFloor(tileAt(map, x, y));
  if (e.dir === "h") {
    if (hWall(map, e.x, e.y) !== NO_WALL || !floor(e.x, e.y - 1) || !floor(e.x, e.y)) return false;
    return isWallEdge(hWall(map, e.x - 1, e.y)) && isWallEdge(hWall(map, e.x + 1, e.y));
  }
  if (vWall(map, e.x, e.y) !== NO_WALL || !floor(e.x - 1, e.y) || !floor(e.x, e.y)) return false;
  return isWallEdge(vWall(map, e.x, e.y - 1)) && isWallEdge(vWall(map, e.x, e.y + 1));
}

// Which edge of a tile (north first, then west) can take a door: 0 / 1 / null.
export function doorRot(map: MapDef, x: number, y: number): 0 | 1 | null {
  if (doorFits(map, { x, y, dir: "h" })) return 0;
  if (doorFits(map, { x, y, dir: "v" })) return 1;
  return null;
}

// The room a door belongs to: its roomKey, or a room whose border the door's
// edge lies on (owned rooms first).
export function doorRoom(
  map: MapDef,
  door: { x: number; y: number; rot?: number; props?: Record<string, unknown> },
): AreaDef | null {
  const key = door.props?.roomKey;
  if (typeof key === "string") {
    const a = map.areas.find((x) => x.key === key);
    if (a) return a;
  }
  const e = doorEdge(door);
  const rings = map.areas.filter((a) =>
    e.dir === "h"
      ? (e.y === a.y || e.y === a.y + a.h) && e.x >= a.x && e.x < a.x + a.w
      : (e.x === a.x || e.x === a.x + a.w) && e.y >= a.y && e.y < a.y + a.h,
  );
  return rings.find((a) => a.ownerId) ?? rings[0] ?? null;
}

export function doorOwner(
  map: MapDef,
  door: { x: number; y: number; rot?: number; props?: Record<string, unknown> },
): number | null {
  return doorRoom(map, door)?.ownerId ?? null;
}
