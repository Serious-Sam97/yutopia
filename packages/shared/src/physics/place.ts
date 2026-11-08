// A floor's questions answered by Jolt (docs/plan/72-the-3d-core.md, phase 7: Jolt the only
// truth): whether a body fits there, what it stands on, whether its way's clear, where the nearest
// spot it fits is — Jolt's world; whether it's out on the land, on the stairs' treads, how fast
// the ground lets it go — the floor's map and the land; its seats — the things. The same questions
// the tile grid answered (it's gone: plan 72 phase 7), so the move core, the walker and the server ask them as they
// did. A floor's x, y the world's; heights over the floor (a body's z over its floor, as the walker
// and the grid work — Player.z is the world's: levels.ts overFloor).
//
// Where Jolt has no land yet (a chunk out of the world's ring) the land answers for itself: its
// height, its own walkable test (grounds.ts) — the land is ground, never in the way. With no Jolt
// world at all yet (the browser's, the second before it's in) the floor's map says: its floor tiles
// can be stood on, at its height.
import { entry, footprint, quarterOf, type WorldObjectDef } from "../catalog.ts";
import { FAM_CHAIRS } from "../fam/index.ts";
import { isFreeThing, thingCorners } from "../free-things.ts";
import type { Point } from "../geom.ts";
import { BODY_R, chairAt, DESK_PULL, type Outdoors, outdoorsOf, type Seat, STEP, seatFront } from "../ground.ts";
import { across, elevOf, floorOf, objLevel, onLevel } from "../levels.ts";
import { isFloor, type MapDef, tileInMap } from "../map.ts";
import { inRamp, type Ramp, rampHeight, type SlabUnder, stairsRamps, stairsWell } from "../stairs.ts";
import { cellOf, floorAtPoint } from "../structure/query.ts";
import { STOREY } from "../units.ts";
import type { Through } from "./body.ts";
import { BODY } from "./size.ts";
import type { PhysicsWorld } from "./world.ts";

/** How deep under the feet the ground is looked for: past it, nothing (no walking off the world). */
const DEEP = 3 * STOREY;
/** How high a top's looked for from (a thing's top a body might be up on: a desk, a cabinet) */
const TOPS_FROM = 2.2;
/** How far up a stair tread the feet still find it */
const RAMP_REACH = 0.35;

/** A floor's seats by tile ("x,y"): its chairs, sofas, benches — and the chess table's own chairs —
 *  a desk's chair pulled in to its top (docs/plan/62). */
export function seatsOf(things: readonly WorldObjectDef[]): Map<string, Seat> {
  const out = new Map<string, Seat>();
  const tops = new Set<string>();
  for (const o of things) {
    const e = entry(o.kind);
    const { w, h } = footprint(o.kind, quarterOf(o));
    if (e.surface && !e.onSurface)
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) tops.add(`${o.x + dx},${o.y + dy}`);
    // (a free seat, turned any way — plan 72 phase 11.9: the tiles whose middles it covers and the
    // one its middle's on, each sat on its seat's line nearest it, facing away from its back)
    if (e.seat && isFreeThing(o)) {
      const yaw = o.yaw ?? 0;
      const [ax, ay] = [Math.cos(yaw), Math.sin(yaw)];
      const front: [number, number] = [-ay, ax];
      const reach = Math.max(0, e.w / 2 - 0.5);
      const rot = Math.round(yaw / (Math.PI / 2)) & 3;
      const corners = thingCorners(o);
      const tiles = new Set([`${Math.floor(o.x)},${Math.floor(o.y)}`]);
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      for (let ty = Math.floor(Math.min(...ys)); ty <= Math.floor(Math.max(...ys)); ty++)
        for (let tx = Math.floor(Math.min(...xs)); tx <= Math.floor(Math.max(...xs)); tx++)
          if (inPoly(corners, tx + 0.5, ty + 0.5)) tiles.add(`${tx},${ty}`);
      for (const k of tiles) {
        const [tx, ty] = k.split(",").map(Number);
        const u = Math.max(-reach, Math.min(reach, (tx + 0.5 - o.x) * ax + (ty + 0.5 - o.y) * ay));
        out.set(k, { id: o.id, rot, kind: o.kind, pull: 0, front, spot: { x: o.x + ax * u, y: o.y + ay * u } });
      }
      continue;
    }
    if (e.seat)
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++)
          out.set(`${o.x + dx},${o.y + dy}`, { id: o.id, rot: quarterOf(o), kind: o.kind, pull: 0 });
    for (const c of FAM_CHAIRS[o.kind] ?? []) {
      const at = chairAt(o, c);
      out.set(`${Math.floor(at.x)},${Math.floor(at.y)}`, { id: o.id, rot: at.rot, kind: o.kind, pull: at.pull });
    }
  }
  for (const [k, s] of out) {
    if (s.kind !== "chair" || s.spot) continue;
    const [x, y] = k.split(",").map(Number);
    const [fx, fy] = seatFront(s.rot);
    if (tops.has(`${x + fx},${y + fy}`)) s.pull = DESK_PULL;
  }
  return out;
}

// (a point inside a convex polygon's ring, either way round)
function inPoly(r: readonly [number, number][], x: number, y: number): boolean {
  let k = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) k = !k;
  }
  return k;
}

export class Place {
  /** the floor's seats by tile */
  readonly seats: Map<string, Seat>;
  /** the land round the ground floor (null: none here — another floor, a lone map) */
  readonly outside: Outdoors | null;
  /** the stairs' treads (up from here, and down from the floor below: −STOREY) */
  readonly ramps: Ramp[] = [];
  private readonly well = new Set<string>();
  private readonly elev: number;

  constructor(
    private readonly world: PhysicsWorld | null,
    /** the floor (a world map's view: levels.ts levelMap) */
    readonly map: MapDef,
    /** every thing in the building (the stairs from the floor below count here) */
    things: readonly WorldObjectDef[],
    readonly through: Through = { mask: "all", pass: null },
    /** the land round it, if not the Grounds' (a test's) */
    outside?: Outdoors | null,
  ) {
    const level = floorOf(map);
    this.elev = elevOf(level);
    const here = onLevel(things, map);
    this.seats = seatsOf(here);
    this.outside = outside === undefined ? outdoorsOf(map) : outside;
    for (const o of here)
      if (o.kind === "stairs") {
        this.ramps.push(...stairsRamps(o, 0));
        for (const [x, y] of stairsWell(o)) this.well.add(`${x},${y}`);
      }
    for (const o of things)
      if (o.kind === "stairs" && objLevel(o, map) === level - 1) {
        const q = { ...o, ...across(map, level - 1, level, o) };
        this.ramps.push(...stairsRamps(q, -STOREY));
        for (const [x, y] of stairsWell(q)) this.well.add(`${x},${y}`);
      }
  }

  /** Jolt has what's under (x, y): the building, or land that's built. */
  private ready(x: number, y: number): boolean {
    if (!this.world) return false;
    if (!this.onLand(x, y)) return true;
    return this.world.has(`land:${Math.floor(x / 32)},${Math.floor(y / 32)}`);
  }
  // (no Jolt here: the land's own say, else the floor's tiles)
  private mapFits(x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (this.onLand(x, y)) return !!this.outside?.walkable(tx, ty);
    return isFloor(cellOf(this.map, tx, ty));
  }
  // (the land is ground whatever its height — the grid's word: a height asked under it, out on it,
  // is asked from it; a body's feet are never under the land)
  private atLeastLand(x: number, y: number, z: number): number {
    return this.outside && this.onLand(x, y) ? Math.max(z, this.outside.height(x, y)) : z;
  }
  private mapGround(x: number, y: number): number {
    return this.onLand(x, y) ? (this.outside?.height(x, y) ?? 0) : 0;
  }

  // ── what's underfoot (the floor's map, the land, the stairs) ──
  /** Out on the land (no floor of the building under it — its slab, exactly: plan 72 phase 11): the
   *  feet follow the ground. */
  onLand(x: number, y: number): boolean {
    return !!this.outside && !isFloor(floorAtPoint(this.map, x, y));
  }
  /** On a staircase's treads (their tiles: the well). */
  onRamp(x: number, y: number): boolean {
    return this.well.has(`${Math.floor(x)},${Math.floor(y)}`);
  }
  /** How fast a body goes there (1 on a floor; on the land what the ground lets it). */
  speedAt(x: number, y: number): number {
    return this.outside?.speed && this.onLand(x, y) ? this.outside.speed(x, y) : 1;
  }
  /** The treads' height at (x, y), within reach of `up` (−Infinity: none). */
  rampAt(x: number, y: number, up: number): number {
    let best = Number.NEGATIVE_INFINITY;
    for (const r of this.ramps) {
      if (!inRamp(r, x, y)) continue;
      const h = rampHeight(r, x, y);
      if (h <= up + RAMP_REACH && h > best) best = h;
    }
    return best;
  }

  // ── a body (Jolt) ──
  /** A body with its feet z over the floor fits at (x, y): nothing in its way, something under it. */
  fitsAt(x: number, y: number, z: number, r = BODY_R): boolean {
    if (!this.ready(x, y)) return this.mapFits(x, y);
    const world = this.world as PhysicsWorld;
    const Y = this.elev + this.atLeastLand(x, y, z);
    if (this.through.mask === "all" && !world.fits(x, Y + STEP, y, r, BODY.h - STEP, "tops", this.through.pass))
      return false;
    return world.groundUnder(x, Y + STEP, y, r, DEEP, "all") !== null;
  }
  /** What a body there stands on, its feet z over the floor (over it: within a step), the floor's. */
  groundAt(x: number, y: number, z: number, r = BODY_R): number {
    if (!this.ready(x, y)) return this.mapGround(x, y);
    return this.under(x, y, z, r).g;
  }
  /** What's under the feet as groundAt finds it, and what it is (Jolt's key; "land"). */
  underfoot(x: number, y: number, z: number, r = BODY_R): { g: number; on: string } {
    if (!this.ready(x, y)) return { g: this.mapGround(x, y), on: "" };
    return this.under(x, y, z, r);
  }
  // the highest of: the land under the middle of you — out on it whatever its height (the grid's
  // word: the land is ground, never too high or too low to stand on) — and the top of anything
  // under any of you within a step over the feet (down to the land, out on it)
  private under(x: number, y: number, z: number, r: number): { g: number; on: string } {
    const world = this.world as PhysicsWorld;
    const top = this.elev + this.atLeastLand(x, y, z) + STEP;
    const lh = this.outside && this.onLand(x, y) ? this.elev + this.outside.height(x, y) : null;
    const landFrom = lh === null ? top : lh + 1;
    const land = world.rayHit(x, landFrom, y, 0, -1, 0, lh === null ? DEEP : 2, "land");
    const on = world.groundUnder(
      x,
      top,
      y,
      r,
      lh === null ? DEEP : Math.max(DEEP, top - lh + 1),
      "tops",
      this.through.pass,
    );
    const l = land === null ? Number.NEGATIVE_INFINITY : landFrom - land;
    if (on === null || l >= on) return { g: l === Number.NEGATIVE_INFINITY ? -2 * STOREY : l - this.elev, on: "land" };
    return { g: on - this.elev, on: world.underKey() ?? "" };
  }
  /** A body slides straight from a to b, its feet z up. */
  clear(a: Point, b: Point, r = BODY_R, z = 0): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(d / 0.1));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.fitsAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, z, r)) return false;
    }
    return true;
  }
  /** A body standing at (x, y) fits: on whatever's there within a step of the floor (or the land). */
  fits(x: number, y: number, r = BODY_R): boolean {
    // (out on the land, the land's own word too: a ridge too steep, deep water — not to stand on)
    if (this.outside && this.onLand(x, y) && !this.outside.walkable(Math.floor(x), Math.floor(y))) return false;
    const g = this.groundAt(x, y, this.atLeastLand(x, y, 0), r);
    return (this.onLand(x, y) || g > -STOREY) && this.fitsAt(x, y, g, r);
  }
  /** From tile (x, y) to its neighbour (nx, ny), a body's middle goes straight (no wall between,
   *  room all the way) — the grid's edge test. */
  step(x: number, y: number, nx: number, ny: number): boolean {
    const z = this.topAt(x, y);
    return this.clear({ x: x + 0.5, y: y + 0.5 }, { x: nx + 0.5, y: ny + 0.5 }, BODY_R, Number.isFinite(z) ? z : 0);
  }
  /** (x, y) is somewhere on this floor: its tiles, or the land round it. */
  inBounds(x: number, y: number): boolean {
    return !!this.outside || tileInMap(this.map, x, y);
  }
  /** Tile (x, y) can be stood in (a body fits at its middle). */
  ok(x: number, y: number): boolean {
    return this.fits(x + 0.5, y + 0.5);
  }
  /** The highest thing a body stands on at tile (x, y)'s middle — the floor, the land, a desk's top
   *  — over the floor (Infinity: nothing it can stand on: in the way, and no room on top). */
  topAt(x: number, y: number): number {
    const cx = x + 0.5;
    const cy = y + 0.5;
    const g = this.groundAt(cx, cy, this.atLeastLand(cx, cy, TOPS_FROM));
    return this.fitsAt(cx, cy, g) ? g : Number.POSITIVE_INFINITY;
  }
  /** The nearest tile middle a body fits at, ring by ring out to maxR (null: none). */
  nearestOpen(x: number, y: number, maxR = 8): Point | null {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let r = 0; r <= maxR; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.fits(cx + dx + 0.5, cy + dy + 0.5)) return { x: cx + dx + 0.5, y: cy + dy + 0.5 };
        }
    return null;
  }

  // ── seats (the things) ──
  seatAt(x: number, y: number): Seat | undefined {
    return this.seats.get(`${Math.floor(x)},${Math.floor(y)}`);
  }
  /** Where someone sits on the seat at (x, y): its tile's middle, a desk's chair pulled in to it. */
  seatSpot(x: number, y: number): Point {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const s = this.seatAt(x, y);
    if (s?.spot) return { ...s.spot };
    const [fx, fy] = s ? seatFront(s.rot) : [0, 0];
    const k = s?.pull ?? 0;
    return { x: tx + 0.5 + fx * k, y: ty + 0.5 + fy * k };
  }
}

/** floorAt's question asked of Jolt's world (stairs.ts SlabUnder — docs/plan/72 phase 7: the floor
 *  from the slab under you): floor `l` has its slab under `p`, or a staircase's treads coming up
 *  into it through its well (`isStairs`: a thing's id is a staircase), looked for from just over
 *  the floor's height — or over the feet, when they're higher (up its own flight: the treads there
 *  stand over the well of the stairs below, no slab under them) — down to a little under the floor
 *  or the feet, whichever's lower. */
export function slabsOf(
  world: PhysicsWorld,
  isStairs: (id: string) => boolean,
  /** in a lift's shaft (lift.ts shaftAt): every floor it goes through has a floor there — the car's */
  shaft?: (l: number, p: { x: number; y: number }) => boolean,
): SlabUnder {
  return (l, p, z = 0) => {
    if (shaft?.(l, p)) return true;
    // (what holds a body up through walls — the floors' slabs, the stairs' treads, the land: not
    // what stands on them, a plant, a parked car)
    const top = Math.max(z, 0) + 0.3;
    const bottom = Math.min(z, 0) - 0.6;
    if (world.groundUnder(p.x, elevOf(l) + top, p.y, 0.05, top - bottom, "clip") === null) return false;
    const k = world.underKey() ?? "";
    if (k.startsWith(`slab:${l}:`)) return true;
    return k.startsWith("thing:") && isStairs(k.slice(6));
  };
}
