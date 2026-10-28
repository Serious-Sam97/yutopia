// The world's solids, from what the game already knows (docs/plan/50-the-volume.md, B): the
// Grounds' land and things (shapes/grounds), and the building — each floor's walls with their
// doors and windows cut, its slab, its furniture and clutter (shapes) — in one space: a floor at
// its storey's height and its corner's place (levels.ts), as one building will be (phase 6).
// The server and the browser both build from here, so they hold the same world.
//
// Statics go in by key, one body each, so an edit touches only what changed:
//   land:cx,cz      a Grounds chunk's land (a heightfield; layer land)
//   grounds:cx,cz   the Grounds' things in it (a compound)
//   wall:L:cx,cz    floor L's walls, panes, rails and clutter in that chunk (a compound; layer wall:
//                   sight stops at it)
//   slab:L:cx,cz    its slab there (layer floor: through walls, it still holds you up)
//   clutter:L:cx,cz the rooms' clutter there (dressing.ts: furniture)
//   thing:id        a piece of furniture (the stairs' treads: floor)
//   lift:id         a lift's stop: the car's walls and shut doors, or the empty shaft
//   door:id         a locked door, its way shut (layer door: its owner passes — passKeys)
// Parked cars are vehicles (kinematic: the car sim moves them): car:id.
import { parkedBody } from "../car/park.ts";
import { footprint, standHeight, type WorldObjectDef } from "../catalog.ts";
import { dressItems } from "../dressing.ts";
import { doorOwner, ZPX_TILE } from "../grid.ts";
import { CHUNK, groundsChunk, heightAt } from "../grounds.ts";
import { elevOf, floorsOf, levelMap, objLevel, offsetOf, onLevel, STOREY } from "../levels.ts";
import { liftDoorEdges, liftHere, liftWallEdges } from "../lift.ts";
import { type Edge, hWall, isFloor, type MapDef, tileAt, vWall } from "../map.ts";
import { doorLockable, edgeKey, isOpening, openingEdges, wallCuts } from "../openings.ts";
import { groundSolidsIn } from "../shapes/grounds.ts";
import {
  blocksOf,
  box3,
  kindSolids,
  openingHole,
  type Solid3,
  type SolidBox3,
  slabSolid,
  WALL_H,
  WALL_T,
  wallSolids,
} from "../shapes/index.ts";
import { stairsTopRail, stairsWell } from "../stairs.ts";
import type { Land, Layer, PhysicsWorld } from "./world.ts";

const LAT = 2; // the chunks' height samples a metre (grounds.ts)

/** A Grounds chunk's land as a heightfield. */
export function landOf(cx: number, cz: number): Land {
  const c = groundsChunk(cx, cz);
  return { x0: cx * CHUNK, z0: cz * CHUNK, n: CHUNK * LAT + 1, step: 1 / LAT, h: c.h };
}

const chunkOf = (x: number, z: number) => `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
const at = (s: Solid3) => chunkOf(s.x, s.z);

// a solid moved by (dx, dz) and up dy (a floor's place in the building)
function moved(s: Solid3, dx: number, dy: number, dz: number): Solid3 {
  return s.t === "box"
    ? { ...s, x: s.x + dx, y: s.y + dy, z: s.z + dz }
    : { ...s, x: s.x + dx, z: s.z + dz, y0: s.y0 + dy, y1: s.y1 + dy };
}

/** The ground under a stored floor's thing (its outdoor tiles stand on the land). */
function baseOf(lm: MapDef, level: number, x: number, y: number): number {
  if (level !== 0 || isFloor(tileAt(lm, Math.floor(x), Math.floor(y)))) return 0;
  const o = offsetOf(lm, level);
  return heightAt(o.x + x, o.y + y);
}

export interface BuildingSolids {
  /** each static by its key (the top of the file), what it is (its layer) */
  statics: Map<string, { solids: Solid3[]; layer: Layer }>;
  /** car:id → its body (kinematic) */
  cars: Map<string, SolidBox3>;
  /** door:id → whose it is (null: nobody's — nobody passes it locked) */
  locked: Map<string, number | null>;
}

/** The locked doors `uid` passes (their own rooms'): PhysicsWorld.pass of these. */
export function passKeys(b: BuildingSolids, uid: number | null | undefined): string[] {
  if (uid == null) return [];
  return [...b.locked].filter(([, owner]) => owner === uid).map(([k]) => k);
}

const RAIL_H = 1.1; // a stairwell's rail with nothing going up from it (m)

/** Every floor of the building (`map` the home floor, carrying the others) as solids. */
// A floor's tiles where `solid` as slabs topped at `top` (the floor layer): row runs merged down
// while they match, each in one chunk.
function lay(
  lm: MapDef,
  ox: number,
  oz: number,
  solid: (x: number, y: number) => boolean,
  top: number,
  key: string,
  add: (k: string, layer: Layer, s: Solid3) => void,
) {
  let open = new Map<string, { x0: number; x1: number; y0: number }>();
  for (let y = 0; y <= lm.height; y++) {
    const runs: [number, number][] = [];
    for (let x = 0; x < lm.width && y < lm.height; ) {
      if (!solid(x, y)) {
        x++;
        continue;
      }
      const x0 = x;
      // (a run stops at a chunk's edge: each slab in one chunk)
      while (
        x < lm.width &&
        solid(x, y) &&
        (x === x0 || Math.floor((ox + x) / CHUNK) === Math.floor((ox + x0) / CHUNK))
      )
        x++;
      runs.push([x0, x]);
    }
    const next = new Map<string, { x0: number; x1: number; y0: number }>();
    for (const [x0, x1] of runs) {
      const k = `${x0}-${x1}`;
      const o = open.get(k);
      // (and down only within the chunk)
      if (o && Math.floor((oz + o.y0) / CHUNK) === Math.floor((oz + y) / CHUNK)) {
        next.set(k, o);
        open.delete(k);
      } else next.set(k, { x0, x1, y0: y });
    }
    for (const o of open.values()) {
      const slab = slabSolid(ox + o.x0, oz + o.y0, ox + o.x1, oz + y, top);
      add(`${key}:${at(slab)}`, "floor", slab);
    }
    open = next;
  }
}

export function buildingSolids(map: MapDef, objects: Iterable<WorldObjectDef>): BuildingSolids {
  const all = [...objects];
  const out: BuildingSolids = { statics: new Map(), cars: new Map(), locked: new Map() };
  const add = (k: string, layer: Layer, s: Solid3) => {
    const had = out.statics.get(k);
    if (had) had.solids.push(s);
    else out.statics.set(k, { solids: [s], layer });
  };
  const put = (level: number, s: Solid3) => add(`wall:${level}:${at(s)}`, "wall", s);
  for (const level of floorsOf(map)) {
    const lm = levelMap(map, level);
    if (!lm) continue;
    const here = onLevel(all, lm);
    const { x: ox, y: oz } = offsetOf(map, level);
    const elev = elevOf(level);
    // the walls, cut by their doors and windows
    const cuts = wallCuts(here);
    const wall = (e: Edge, ch: string) => {
      const w = wallSolids(e, ch, cuts.get(edgeKey(e)));
      for (const s of [...w.solids, ...(w.pane ? [w.pane] : [])]) put(level, moved(s, ox, elev, oz));
    };
    for (let y = 0; y <= lm.height; y++) for (let x = 0; x < lm.width; x++) wall({ dir: "h", x, y }, hWall(lm, x, y));
    for (let y = 0; y < lm.height; y++) for (let x = 0; x <= lm.width; x++) wall({ dir: "v", x, y }, vWall(lm, x, y));
    // the slab under its floor tiles (not the stairs' hole from the floor below), row runs merged
    // down while they match
    const hole = new Set<string>();
    for (const o of all)
      if (o.kind === "stairs" && objLevel(o, map) === level - 1) {
        const b = offsetOf(map, level - 1);
        for (const [x, y] of stairsWell(o)) hole.add(`${x + b.x - ox},${y + b.y - oz}`);
      }
    const solid = (x: number, y: number) => isFloor(tileAt(lm, x, y)) && !hole.has(`${x},${y}`);
    lay(lm, ox, oz, solid, elev, `slab:${level}`, add);
    // the top floor's roof: a slab over all of it, where the next floor's would be (one building,
    // docs/plan/50 D: flown up to from inside, it stops you; landed on from outside, it holds you)
    if (!floorsOf(map).includes(level + 1))
      lay(lm, ox, oz, (x, y) => isFloor(tileAt(lm, x, y)), elev + STOREY, `roof:${level}`, add);
    // the rooms' clutter (dressing.ts): what blocks walking, as the table's decor (furniture: sight
    // goes past it)
    for (const d of dressItems(lm, here)) {
      if (!d.solid || !d.tile) continue;
      const [tx, ty] = d.tile;
      for (const s of kindSolids(
        { id: d.id, kind: "decor", x: tx, y: ty },
        elev + baseOf(lm, level, tx + 0.5, ty + 0.5),
      )) {
        const c = moved(s, ox, 0, oz);
        add(`clutter:${level}:${at(c)}`, "solid", c);
      }
    }
    // a stairwell from the floor below with nothing going on up from here: a rail across its top
    for (const o of all)
      if (o.kind === "stairs" && objLevel(o, map) === level - 1) {
        const b = offsetOf(map, level - 1);
        const up = here.some((u) => u.kind === "stairs" && u.x + ox === o.x + b.x && u.y + oz === o.y + b.y);
        if (!up)
          for (const e of stairsTopRail({ ...o, x: o.x + b.x - ox, y: o.y + b.y - oz }))
            put(level, moved(edgeBox(e, 0, RAIL_H), ox, elev, oz));
      }
    // the furniture: a body each; parked cars are vehicles; doors and windows are their walls' cuts
    // (a locked one shut too, for all but its owner); a lift's stop its car's walls and doors
    for (const o of here) {
      if (doorLockable(o.kind) && o.props?.state === "locked") {
        const [y0, y1] = openingHole(o.kind);
        const k = `door:${o.id}`;
        for (const e of openingEdges(o)) add(k, "door", moved(edgeBox(e, y0, y1), ox, elev, oz));
        out.locked.set(k, doorOwner(lm, o));
        continue;
      }
      if (isOpening(o.kind)) continue;
      if (o.kind === "elevator") {
        const k = `lift:${o.id}`;
        if (!liftHere(o, lm)) {
          // (the car's elsewhere: the empty shaft, shut — as the grid has it)
          const { w, h } = footprint(o.kind, o.rot ?? 0);
          add(k, "wall", box3(ox + o.x, oz + o.y, ox + o.x + w, oz + o.y + h, elev, elev + WALL_H));
          continue;
        }
        for (const e of liftWallEdges(o)) add(k, "wall", moved(edgeBox(e, 0, WALL_H), ox, elev, oz));
        if (o.props?.door !== "open")
          for (const e of liftDoorEdges(o)) add(k, "wall", moved(edgeBox(e, 0, WALL_H), ox, elev, oz));
        continue;
      }
      if (o.kind === "car") {
        if (o.props?.driven) continue;
        const b = parkedBody(o);
        const base = elev + (b.h ?? baseOf(lm, level, b.x, b.y));
        const top = (standHeight("car") ?? 0) / ZPX_TILE;
        // (its heading a points along (cos a, sin a): turned −a as three.js turns things)
        const c = box3(b.x + ox - b.hx, b.y + oz - b.hy, b.x + ox + b.hx, b.y + oz + b.hy, base, base + top, -b.a);
        out.cars.set(`car:${o.id}`, c);
        continue;
      }
      // (only what stops a body — seats are sat in, walked into — and the stairs, stood on; the rest
      // is reach's, phase 5)
      const stairs = o.kind === "stairs";
      if (!stairs && blocksOf(o.kind) !== "solid") continue;
      const base = baseOf(lm, level, o.x + 0.5, o.y + 0.5);
      for (const s of kindSolids(o, elev + base)) add(`thing:${o.id}`, stairs ? "floor" : "solid", moved(s, ox, 0, oz));
    }
  }
  return out;
}

// a wall-thick box along an edge (a floor's own coords), y0..y1 up
function edgeBox(e: Edge, y0: number, y1: number): Solid3 {
  const t = WALL_T / 2;
  return e.dir === "h" ? box3(e.x, e.y - t, e.x + 1, e.y + t, y0, y1) : box3(e.x - t, e.y, e.x + t, e.y + 1, y0, y1);
}

/** How many statics a world of this building and these Grounds chunks holds (for its sizes). */
export function staticCount(b: BuildingSolids, groundChunks: number): number {
  return b.statics.size + 2 * groundChunks;
}

// a cheap signature of a list of solids (changed or not)
function sig(ss: Solid3[]): string {
  let s = "";
  for (const o of ss)
    s +=
      o.t === "box"
        ? `b${o.x.toFixed(3)},${o.y.toFixed(3)},${o.z.toFixed(3)},${o.hx.toFixed(3)},${o.hy.toFixed(3)},${o.hz.toFixed(3)},${o.a.toFixed(3)};`
        : `c${o.x.toFixed(3)},${o.z.toFixed(3)},${o.r.toFixed(3)},${o.y0.toFixed(3)},${o.y1.toFixed(3)};`;
  return s;
}

/** Keeps a PhysicsWorld matching the world: the Grounds' chunks as asked for, the building
 *  diffed on every change (only what changed is made again). */
export class WorldBuilder {
  private readonly sigs = new Map<string, string>();
  private readonly ground = new Set<string>();
  constructor(readonly world: PhysicsWorld) {}

  /** A Grounds chunk: its land and its things (once; again after the park's layout changes). */
  groundChunk(cx: number, cz: number, again = false): void {
    const k = `${cx},${cz}`;
    if (this.ground.has(k) && !again) return;
    this.ground.add(k);
    this.world.setLand(`land:${k}`, landOf(cx, cz));
    const things = groundSolidsIn(cx, cz).map((g) => g.s);
    // (the Grounds' things stop sight as walls do: a building, the fence, a trunk)
    if (things.length) this.world.setStatic(`grounds:${k}`, things, "wall");
    else this.world.remove(`grounds:${k}`);
  }

  /** Every Grounds chunk in a rectangle (the server: all of them, once). */
  groundRect(x0: number, z0: number, x1: number, z1: number): void {
    for (let cz = Math.floor(z0 / CHUNK); cz * CHUNK < z1; cz++)
      for (let cx = Math.floor(x0 / CHUNK); cx * CHUNK < x1; cx++) this.groundChunk(cx, cz);
  }

  /** The building as it is now: what's new or changed made, what's gone removed. */
  building(b: BuildingSolids): { made: number; removed: number } {
    let made = 0;
    let removed = 0;
    const want = b.statics;
    for (const k of [...this.sigs.keys()])
      if (!want.has(k)) {
        this.world.remove(k);
        this.sigs.delete(k);
        removed++;
      }
    for (const [k, { solids: ss, layer }] of want) {
      const s = layer + sig(ss);
      if (this.sigs.get(k) === s) continue;
      this.world.setStatic(k, ss, layer);
      this.sigs.set(k, s);
      made++;
    }
    for (const id of [...this.world.vehicleIds()])
      if (id.startsWith("car:") && !b.cars.has(id)) this.world.removeVehicle(id);
    for (const [id, box] of b.cars) this.world.setVehicle(id, box);
    return { made, removed };
  }
}
