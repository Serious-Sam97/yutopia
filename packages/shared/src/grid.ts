import { entry, footprint, standHeight, type WorldObjectDef } from "./catalog.ts";
import { dressItems } from "./dressing.ts";
import type { Point } from "./iso.ts";
import { across, floorOf, objLevel, onLevel, STOREY } from "./levels.ts";
import { liftDoorEdges, liftHere, liftWallEdges } from "./lift.ts";
import { type AreaDef, type Edge, edgeAt, hWall, isFloor, isWallEdge, type MapDef, tileAt, vWall } from "./map.ts";
import { doorLockable, isDoorKind, isOpening, openingCentre, openingEdges, ringOf, wallTakes } from "./openings.ts";
import { inRamp, type Ramp, rampHeight, stairsDivider, stairsRamps, stairsTopRail, stairsWell } from "./stairs.ts";

// Walkability: floor tiles minus solid furniture, and walls on tile edges that
// bodies can't cross (thin walls, WALL_T thick). Rebuilt whenever objects or
// the map change (build mode); cheap enough for maps this size.
export const WALL_T = 0.2; // wall thickness, tiles (the wall is centred on its edge)
// Heights (shared/jump.ts): a body jumps up onto solid things it can stand on.
// Each tile has a top: 0 the floor, the top of the thing on it (tiles up), or
// Infinity (no floor, walls' clutter, something not to stand on).
export const STEP = 0.12; // tiles: a body steps up this much, and lands on a top its feet are this close to
export const ZPX_TILE = 39.19; // iso px of height a tile (45.25 · cos 30°)
const RAMP_REACH = 0.35; // tiles: how far up a stair tread the feet still find it

// ── outdoors (docs/plan/27-the-grounds.md) ──────────────────────────────────
// The ground floor of a building stands on the Grounds: past its stored tiles
// (and on its empty ones) the land goes on — the generated terrain, its height
// the ground's, its trees and steep rock in the way. Land is ground, never an
// obstacle: whatever its height, a body on it stands on it.
export interface Outdoors {
  /** a tile you can stand on (the floor's own coords) */
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

export class Grid {
  readonly walk: Uint8Array;
  readonly top: Float32Array; // what a body stands on in each tile, tiles up (Infinity: nothing)
  readonly hBlock: Uint8Array; // north edge of (x, y): (height + 1) × width
  readonly vBlock: Uint8Array; // west edge of (x, y): height × (width + 1)
  readonly seats = new Map<number, { id: string; rot: number }>();
  // stairs (stairs.ts): the treads' surfaces, and the tiles of their wells,
  // which have no floor of their own (only the treads)
  readonly ramps: Ramp[] = [];
  readonly well: Uint8Array;
  // the floor's empty tiles that are land (outdoors), and the land beyond it
  readonly land: Uint8Array;
  outside: Outdoors | null = null;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.walk = new Uint8Array(width * height);
    this.top = new Float32Array(width * height).fill(Number.POSITIVE_INFINITY);
    this.hBlock = new Uint8Array((height + 1) * width);
    this.vBlock = new Uint8Array(height * (width + 1));
    this.well = new Uint8Array(width * height);
    this.land = new Uint8Array(width * height);
  }

  // `as` = whose grid: doors are a way through their wall, but locked ones are
  // walls for everyone but their room's owner. Without it (shared paths,
  // previews) locked doors block everyone. Windows are wall.
  // `dressing: false` leaves the rooms' clutter out (placement checks: furniture wins).
  // `map` is one floor (levels.ts): only the things on it count, and the stairs
  // coming up from the floor below (their top half is how you get down).
  static from(
    map: MapDef,
    objects: Iterable<WorldObjectDef>,
    as?: { uid: number | null },
    opts: { dressing?: boolean } = {},
  ): Grid {
    const g = new Grid(map.width, map.height);
    const all = [...objects];
    const list = onLevel(all, map);
    objects = list;
    const W = map.width;
    const out = outdoorsFor?.(map) ?? null;
    g.outside = out;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < W; x++) {
        const floor = isFloor(tileAt(map, x, y));
        g.walk[y * W + x] = floor ? 1 : 0;
        if (floor) g.top[y * W + x] = 0;
        else if (out) {
          g.land[y * W + x] = 1;
          g.walk[y * W + x] = out.walkable(x, y) ? 1 : 0;
        }
      }
    for (let y = 0; y <= map.height; y++)
      for (let x = 0; x < W; x++) if (isWallEdge(hWall(map, x, y))) g.hBlock[y * W + x] = 1;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x <= W; x++) if (isWallEdge(vWall(map, x, y))) g.vBlock[y * (W + 1) + x] = 1;
    // stairs: up from here, and down to the floor below (theirs, seen from here)
    const floor = floorOf(map);
    const up = list.filter((o) => o.kind === "stairs");
    const down = all
      .filter((o) => o.kind === "stairs" && objLevel(o, map) === floor - 1)
      .map((o) => ({ ...o, ...across(map, floor - 1, floor, o) }));
    for (const o of up) g.addStairs(o, 0);
    for (const o of down) {
      g.addStairs(o, -STOREY);
      // nothing going on up from here: a rail where the next flight would start
      if (!up.some((u) => u.x === o.x && u.y === o.y && (u.rot ?? 0) === (o.rot ?? 0)))
        for (const e of stairsTopRail(o)) g.blockEdge(e);
    }
    for (const o of objects) {
      const e = entry(o.kind);
      const { w, h } = footprint(o.kind, o.rot ?? 0);
      // an elevator (lift.ts): where its car is, a box you're in or out of —
      // walls round it, the doors a way through while they're open (so whoever's
      // inside when they shut can still move, and gets out when they open); a
      // floor it isn't at, the empty shaft
      if (o.kind === "elevator") {
        if (!liftHere(o, map)) {
          for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) g.block(o.x + dx, o.y + dy);
          continue;
        }
        for (const e of liftWallEdges(o)) g.blockEdge(e);
        for (const e of liftDoorEdges(o)) {
          if (o.props?.door === "open") g.openEdge(e);
          else g.blockEdge(e);
        }
        continue;
      }
      if (e.seat)
        for (let dy = 0; dy < h; dy++)
          for (let dx = 0; dx < w; dx++) g.seats.set(g.idx(o.x + dx, o.y + dy), { id: o.id, rot: o.rot ?? 0 });
      if (isDoorKind(o.kind)) {
        const locked =
          doorLockable(o.kind) && o.props?.state === "locked" && (as?.uid == null || doorOwner(map, o) !== as.uid);
        for (const e of openingEdges(o)) {
          if (locked) g.blockEdge(e);
          else g.openEdge(e);
        }
        continue;
      }
      if (isOpening(o.kind)) continue;
      // a car (docs/plan/28-the-car.md): out being driven, nowhere here; parked at any angle
      // (props.a, its heading), the tiles under its body
      if (o.kind === "car" && (o.props?.driven || typeof o.props?.a === "number")) {
        if (o.props?.driven) continue;
        const a = Number(o.props?.a);
        const cx = o.x + w / 2 + (Number(o.props?.dx) || 0);
        const cy = o.y + h / 2 + (Number(o.props?.dz) || 0);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        for (let ty = Math.floor(cy - 3); ty <= Math.ceil(cy + 3); ty++)
          for (let tx = Math.floor(cx - 3); tx <= Math.ceil(cx + 3); tx++) {
            const dx = tx + 0.5 - cx;
            const dy = ty + 0.5 - cy;
            if (Math.abs(dx * ca + dy * sa) < 2.55 && Math.abs(-dx * sa + dy * ca) < 1.05) g.block(tx, ty);
          }
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

  // A staircase `dz` up from this floor (−STOREY: the one from the floor below).
  private addStairs(o: { x: number; y: number; rot?: number }, dz: number) {
    this.ramps.push(...stairsRamps(o, dz));
    for (const [x, y] of stairsWell(o)) {
      if (!this.inBounds(x, y)) continue;
      const i = this.idx(x, y);
      this.well[i] = 1;
      this.walk[i] = 0;
      this.top[i] = Number.POSITIVE_INFINITY;
    }
    for (const e of stairsDivider(o)) this.blockEdge(e);
  }

  /** What's under a point to stand on, no higher than `up` (tiles; −Infinity: nothing). */
  standOn(px: number, py: number, up: number): number {
    const x = Math.floor(px);
    const y = Math.floor(py);
    if (!this.inBounds(x, y)) return this.landTop(x, y, px, py, up, !!this.outside?.walkable(x, y));
    const i = this.idx(x, y);
    // land: its height, whatever it is (ground, not something to climb) — or what's on it
    if (this.land[i]) return this.landTop(x, y, px, py, up, this.walk[i] === 1);
    if (this.well[i]) {
      let best = Number.NEGATIVE_INFINITY;
      for (const r of this.ramps) {
        if (!inRamp(r, px, py)) continue;
        const h = rampHeight(r, px, py);
        // (treads are a slope: feet follow them up even a slow frame's long step;
        // the next flight up is a storey above, never within reach)
        if (h <= up + RAMP_REACH && h > best) best = h;
      }
      return best;
    }
    const t = this.top[i];
    // (a hair over: tops are float32, so a 0.12 step on a 0.24 one isn't a step too far)
    return t <= up + 1e-4 ? t : Number.NEGATIVE_INFINITY;
  }

  /** The land at (px, py): its height where it's walked, else the top of what's on it (no higher
   *  than `up`), else nothing. */
  private landTop(x: number, y: number, px: number, py: number, up: number, walk: boolean): number {
    const o = this.outside;
    if (!o) return Number.NEGATIVE_INFINITY;
    if (walk) return o.height(px, py);
    const t = o.top?.(x, y) ?? Number.NaN;
    const h = o.height(px, py) + t;
    return h <= up ? h : Number.NEGATIVE_INFINITY;
  }

  /** Is (x, y) on a staircase (its feet follow the treads)? */
  onRamp(x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    return this.inBounds(tx, ty) && this.well[this.idx(tx, ty)] === 1;
  }

  /** How fast a body goes at (x, y) (1 on a floor; outdoors, what the ground lets it). */
  speedAt(x: number, y: number): number {
    return this.outside?.speed && this.onLand(x, y) ? this.outside.speed(x, y) : 1;
  }

  /** Is (x, y) on the land outdoors (the feet follow the ground's rise and fall)? */
  onLand(x: number, y: number): boolean {
    if (!this.outside) return false;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    return !this.inBounds(tx, ty) || this.land[this.idx(tx, ty)] === 1;
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

  openEdge(e: Edge): void {
    if (e.dir === "h" && e.x >= 0 && e.x < this.width && e.y >= 0 && e.y <= this.height)
      this.hBlock[e.y * this.width + e.x] = 0;
    if (e.dir === "v" && e.y >= 0 && e.y < this.height && e.x >= 0 && e.x <= this.width)
      this.vBlock[e.y * (this.width + 1) + e.x] = 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  ok(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return !!this.outside?.walkable(x, y);
    return this.walk[this.idx(x, y)] === 1;
  }

  hWallAt(x: number, y: number): boolean {
    if (x >= 0 && x < this.width && y >= 0 && y <= this.height) return this.hBlock[y * this.width + x] === 1;
    return !!this.outside?.edge?.("h", x, y);
  }

  vWallAt(x: number, y: number): boolean {
    if (y >= 0 && y < this.height && x >= 0 && x <= this.width) return this.vBlock[y * (this.width + 1) + x] === 1;
    return !!this.outside?.edge?.("v", x, y);
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
    if (z <= 0 && z > -STEP && !this.ramps.length) return this.fits(x, y, r);
    const up = z + STEP;
    const none = Number.NEGATIVE_INFINITY;
    if (
      this.standOn(x - r, y - r, up) === none ||
      this.standOn(x + r, y - r, up) === none ||
      this.standOn(x - r, y + r, up) === none ||
      this.standOn(x + r, y + r, up) === none
    )
      return false;
    return this.clearOfWalls(x, y, r);
  }

  // What a body at (x, y) with its feet z up stands on: the highest top under
  // any of it within a step of its feet (it stands on an edge, platform-style).
  groundAt(x: number, y: number, z: number, r = BODY_R): number {
    const up = z + STEP;
    // on the land: the ground under the middle of you (a slope's uphill corner
    // isn't a step to stand on), unless a floor or a top under you is higher
    if (this.outside && this.onLand(x, y) && this.ok(Math.floor(x), Math.floor(y))) {
      let g = this.outside.height(x, y);
      for (const [cx, cy] of [
        [x - r, y - r],
        [x + r, y - r],
        [x - r, y + r],
        [x + r, y + r],
      ])
        if (!this.onLand(cx, cy)) {
          const t = this.standOn(cx, cy, up);
          if (t > g) g = t;
        }
      return g;
    }
    // (stairs: the treads can be below the floor's level, down to the floor below)
    let g = this.ramps.length ? Number.NEGATIVE_INFINITY : 0;
    for (const [cx, cy] of [
      [x - r, y - r],
      [x + r, y - r],
      [x - r, y + r],
      [x + r, y + r],
    ]) {
      const t = this.standOn(cx, cy, up);
      if (t > g) g = t;
    }
    return g === Number.NEGATIVE_INFINITY ? -2 * STOREY : g;
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

// The middle of a door (tile coords; a double door spans two edges).
export function doorCentre(o: { kind?: string; x: number; y: number; rot?: number }): Point {
  return openingCentre({ kind: o.kind ?? "door", x: o.x, y: o.y, rot: o.rot });
}

// Can a door go on this edge? In a wall that takes one (openings.ts), with
// floor on both sides. (Where exactly, with what's around: openingBlocker.)
export function doorFits(map: MapDef, e: Edge): boolean {
  const floor = (x: number, y: number) => isFloor(tileAt(map, x, y));
  if (!wallTakes("door", edgeAt(map, e))) return false;
  return e.dir === "h" ? floor(e.x, e.y - 1) && floor(e.x, e.y) : floor(e.x - 1, e.y) && floor(e.x, e.y);
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

// Who may lock or unlock it: the owner of its room, and nobody else (not even
// an admin: an owner's lock is theirs); a door to a room with no owner, the
// admins.
export function mayLockDoor(
  map: MapDef,
  door: { x: number; y: number; rot?: number; props?: Record<string, unknown> },
  who: { uid: number | null; admin?: boolean },
): boolean {
  if (!doorLockable((door as { kind?: string }).kind ?? "door")) return false;
  const owner = doorOwner(map, door);
  return owner != null ? who.uid === owner : !!who.admin;
}

// Owned rooms with a door locked right now, and who holds the key: their
// walls, doors and windows (and the room itself) are the owner's to change.
export function lockedRooms(map: MapDef, objects: Iterable<WorldObjectDef>): { area: AreaDef; ownerId: number }[] {
  const out = new Map<string, { area: AreaDef; ownerId: number }>();
  for (const o of objects) {
    if (!doorLockable(o.kind) || o.props?.state !== "locked") continue;
    const a = doorRoom(map, o);
    if (a?.ownerId) out.set(a.key, { area: a, ownerId: a.ownerId });
  }
  return [...out.values()];
}

// Why `uid` can't change an edge (a wall, or a door or window in it): it's on
// the border of someone else's locked room. null = they can.
export function lockedEdge(map: MapDef, objects: Iterable<WorldObjectDef>, e: Edge, uid: number | null): string | null {
  for (const { area, ownerId } of lockedRooms(map, objects)) {
    if (ownerId === uid) continue;
    if (ringOf(area).some((r) => r.dir === e.dir && r.x === e.x && r.y === e.y))
      return `${area.ownerName ?? "Its owner"} locked ${area.name}`;
  }
  return null;
}
