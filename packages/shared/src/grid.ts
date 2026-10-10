import { entry, footprint, type WorldObjectDef } from "./catalog.ts";
import type { Point } from "./iso.ts";
import { type AreaDef, isFloor, type MapDef, tileAt, WALL } from "./map.ts";

// Walkability grid built from floor tiles minus solid furniture. Rebuilt whenever
// objects change (build mode); cheap enough for maps this size.
export class Grid {
  readonly walk: Uint8Array;
  readonly seats = new Map<number, { id: string; rot: number }>();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.walk = new Uint8Array(width * height);
  }

  // `as` = whose grid: locked doors are walls for everyone but their room's
  // owner. Without it (shared paths, previews) locked doors block everyone.
  static from(map: MapDef, objects: Iterable<WorldObjectDef>, as?: { uid: number | null }): Grid {
    const g = new Grid(map.width, map.height);
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) g.walk[y * map.width + x] = isFloor(tileAt(map, x, y)) ? 1 : 0;
    for (const o of objects) {
      const e = entry(o.kind);
      const { w, h } = footprint(o.kind, o.rot ?? 0);
      if (e.seat)
        for (let dy = 0; dy < h; dy++)
          for (let dx = 0; dx < w; dx++) g.seats.set(g.idx(o.x + dx, o.y + dy), { id: o.id, rot: o.rot ?? 0 });
      if (o.kind === "door") {
        if (o.props?.state === "locked" && (as?.uid == null || doorOwner(map, o) !== as.uid)) g.block(o.x, o.y);
        continue;
      }
      if (!e.solid || e.wall) continue;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) g.block(o.x + dx, o.y + dy);
    }
    return g;
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  block(x: number, y: number): void {
    if (this.inBounds(x, y)) this.walk[this.idx(x, y)] = 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  ok(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.walk[this.idx(x, y)] === 1;
  }

  seatAt(x: number, y: number): { id: string; rot: number } | undefined {
    return this.seats.get(this.idx(Math.floor(x), Math.floor(y)));
  }

  // A body is a small square around its center; all four corners must be on floor.
  fits(x: number, y: number, r = BODY_R): boolean {
    return (
      this.ok(Math.floor(x - r), Math.floor(y - r)) &&
      this.ok(Math.floor(x + r), Math.floor(y - r)) &&
      this.ok(Math.floor(x - r), Math.floor(y + r)) &&
      this.ok(Math.floor(x + r), Math.floor(y + r))
    );
  }

  // True if a body can slide straight from a to b.
  clear(a: Point, b: Point, r = BODY_R): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(d / 0.2));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.fits(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r)) return false;
    }
    return true;
  }

  // Nearest walkable tile center to a point (for spawns and teleports).
  nearestOpen(x: number, y: number, maxR = 8): Point | null {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.ok(cx + dx, cy + dy)) return { x: cx + dx + 0.5, y: cy + dy + 0.5 };
        }
    }
    return null;
  }
}

export const BODY_R = 0.22;
export const WALK_SPEED = 4.2; // tiles per second
export const RUN_SPEED = 7;

// Slide along walls: try the full move, then each axis on its own.
export function moveStep(grid: Grid, pos: Point, dir: Point, speed: number, dt: number): Point {
  const nx = pos.x + dir.x * speed * dt;
  const ny = pos.y + dir.y * speed * dt;
  if (grid.fits(nx, ny)) return { x: nx, y: ny };
  if (grid.fits(nx, pos.y)) return { x: nx, y: pos.y };
  if (grid.fits(pos.x, ny)) return { x: pos.x, y: ny };
  return pos;
}

// Server-side sanity check for client-reported movement.
export function isLegalMove(grid: Grid, from: Point, to: Point, dtSec: number): boolean {
  if (!grid.fits(to.x, to.y, 0.05)) return false;
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  if (d > RUN_SPEED * Math.max(dtSec, 0.05) * 1.6 + 0.35) return false;
  return grid.clear(from, to, 0.05);
}

// ── doors ──────────────────────────────────────────────────────────────────
// Orientation from the walls around a tile: 0 = the wall runs along x (walls at
// x±1), 1 = along y (walls at y±1). null = not a doorway.
export function doorRot(map: MapDef, x: number, y: number): 0 | 1 | null {
  const wall = (tx: number, ty: number) => tileAt(map, tx, ty) === WALL;
  if (!isFloor(tileAt(map, x, y))) return null;
  if (wall(x - 1, y) && wall(x + 1, y)) return 0;
  if (wall(x, y - 1) && wall(x, y + 1)) return 1;
  return null;
}

// The room a door belongs to: an area whose wall ring passes through the door.
export function doorRoom(map: MapDef, door: { x: number; y: number; props?: Record<string, unknown> }): AreaDef | null {
  const key = door.props?.roomKey;
  if (typeof key === "string") {
    const a = map.areas.find((x) => x.key === key);
    if (a) return a;
  }
  const rings = map.areas.filter(
    (a) =>
      door.x >= a.x - 1 &&
      door.x <= a.x + a.w &&
      door.y >= a.y - 1 &&
      door.y <= a.y + a.h &&
      (door.x === a.x - 1 || door.x === a.x + a.w || door.y === a.y - 1 || door.y === a.y + a.h),
  );
  return rings.find((a) => a.ownerId) ?? rings[0] ?? null;
}

export function doorOwner(map: MapDef, door: { x: number; y: number; props?: Record<string, unknown> }): number | null {
  return doorRoom(map, door)?.ownerId ?? null;
}
