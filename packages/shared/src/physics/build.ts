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
import {
  CHUNK,
  groundsChunk,
  heightAt,
  holesToWire,
  ICE_FAST,
  ICE_TOP,
  ICE_WALK,
  type IceHole,
  iceEdge,
  POND,
  POND_LEVEL,
  RIVER,
  riverWater,
} from "../grounds.ts";
import { elevOf, floorsOf, levelMap, objLevel, offsetOf, onLevel, STOREY } from "../levels.ts";
import { liftDoorEdges, liftHere, liftWallEdges } from "../lift.ts";
import { type Edge, hWall, isFloor, type MapDef, tileAt, vWall } from "../map.ts";
import { doorLockable, edgeKey, isOpening, openingEdges, wallCuts } from "../openings.ts";
import { type GroundSolid, type GroundWhat, groundSolidAt, groundSolidsIn } from "../shapes/grounds.ts";
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
  /** what Flowmotion moves off here, out of doors (physics/flow.ts): the walls with the outside on
   *  a side — each as high as its storey, so a run up the face goes on up the floor above's — and
   *  the parkour pieces stood outside */
  flow: GroundSolid[];
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
  const out: BuildingSolids = { statics: new Map(), cars: new Map(), locked: new Map(), flow: [] };
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
    const outside = (x: number, y: number) => !isFloor(tileAt(lm, x, y));
    const wall = (e: Edge, ch: string) => {
      const w = wallSolids(e, ch, cuts.get(edgeKey(e)));
      for (const s of [...w.solids, ...(w.pane ? [w.pane] : [])]) put(level, moved(s, ox, elev, oz));
      // (out of doors on a side: Flowmotion's — indoors it's off)
      if (
        w.solids.length &&
        (e.dir === "h" ? outside(e.x, e.y - 1) || outside(e.x, e.y) : outside(e.x - 1, e.y) || outside(e.x, e.y))
      )
        for (const s of w.solids) out.flow.push({ what: "building_wall", s: moved(toStorey(s), ox, elev, oz) });
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
        // (what it is: a plant's pot, boxes, a bin, a cable stepped over — shapes DECOR_PARTS)
        { id: d.id, kind: "decor", x: tx, y: ty, props: { d: d.kind } },
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
      const flow = level === 0 && outside(o.x, o.y) ? PARKOUR[o.kind] : undefined;
      for (const s of kindSolids(o, elev + base)) {
        add(`thing:${o.id}`, stairs ? "floor" : "solid", moved(s, ox, 0, oz));
        if (flow) out.flow.push({ what: flow, s: moved(s, ox, 0, oz) });
      }
    }
  }
  return out;
}

// the build menu's parkour pieces, by what Flowmotion makes of them (out of doors only)
const PARKOUR: Partial<Record<string, GroundSolid["what"]>> = {
  pk_rail: "pk_rail",
  pk_rail_long: "pk_rail",
  pk_wall: "pk_wall",
  pk_wall_tall: "pk_wall",
  pk_pole: "pk_pole",
  pk_pole_tall: "pk_pole",
  // (plan 68 phase 17: run up the climbing wall, the quarter pipe and the cargo net and over their
  // tops; grind the balance beam)
  pk_climb_wall: "pk_wall",
  pk_quarter_pipe: "pk_wall",
  pk_cargo_net: "pk_wall",
  pk_beam: "pk_rail",
};

// a wall's piece that goes to its top, on up to the next storey's floor (the slab between is
// the same face from outside); the rest (under a window, over a door) as it is
function toStorey(s: Solid3): Solid3 {
  if (s.t !== "box" || Math.abs(s.y + s.hy - WALL_H) > 0.01) return s;
  const y0 = s.y - s.hy;
  return { ...s, y: (y0 + STOREY) / 2, hy: (STOREY - y0) / 2 };
}

// a wall-thick box along an edge (a floor's own coords), y0..y1 up
function edgeBox(e: Edge, y0: number, y1: number): Solid3 {
  const t = WALL_T / 2;
  return e.dir === "h" ? box3(e.x, e.y - t, e.x + 1, e.y + t, y0, y1) : box3(e.x - t, e.y, e.x + t, e.y + 1, y0, y1);
}

/** What's stood on at (x, z), `top` high, in a Grounds chunk's things (Jolt's key for them,
 *  `grounds:cx,cz`: its compound doesn't say which): the thing's kind, or null. */
export function groundsThingAt(key: string, x: number, z: number, top: number): GroundWhat | null {
  const [cx, cz] = key
    .slice(key.indexOf(":") + 1)
    .split(",")
    .map(Number);
  return groundSolidAt(cx, cz, x, z, top);
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

// (the water's ice walked on — W6 — is grounds.ts's, the paths' too: one number for both)
export { ICE_WALK };

/** The water's ice where it's iced over (W6; plan 66 S4): a sheet at its level over the carved beds,
 *  in from the shores to `iceEdge(ice)` — the pond in strips a metre wide (two where its middle's
 *  open), the river a slab either side a sample (one across it frozen over) — and a hole's cells left
 *  out (the strip or slab there in metre cells). */
export function iceSheet(ice: number, holes: readonly IceHole[] = []): Solid3[] {
  const out: Solid3[] = [];
  if (ice <= 0.01) return out;
  const T = 0.3;
  const edge = iceEdge(ice);
  const inHole = (x: number, z: number) => holes.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + 0.3);
  const near = (x: number, z: number, reach: number) => holes.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + reach);
  // a box along (ax, az) → (bx, bz), from `o0` to `o1` across it (its left), at y — in cells where a
  // hole's near
  const piece = (ax: number, az: number, bx: number, bz: number, o0: number, o1: number, y: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz);
    if (l < 1e-3 || o1 - o0 < 0.05) return;
    const nx = -dz / l;
    const nz = dx / l;
    const a = Math.atan2(-dz, dx);
    const at = (u: number, o: number): [number, number] => [ax + (dx / l) * u + nx * o, az + (dz / l) * u + nz * o];
    const [mx, mz] = at(l / 2, (o0 + o1) / 2);
    if (!near(mx, mz, Math.hypot(l, o1 - o0) / 2 + 0.5)) {
      out.push({ t: "box", x: mx, y: y - T / 2, z: mz, hx: l / 2 + 0.2, hy: T / 2, hz: (o1 - o0) / 2, a });
      return;
    }
    // (in metre cells, both ways: a hole's left out)
    for (let u = 0; u < l; u += 1) {
      const u2 = Math.min(l, u + 1);
      for (let o = o0; o < o1; o += 1) {
        const o2 = Math.min(o1, o + 1);
        const [cx, cz] = at((u + u2) / 2, (o + o2) / 2);
        if (inHole(cx, cz)) continue;
        out.push({ t: "box", x: cx, y: y - T / 2, z: cz, hx: (u2 - u) / 2 + 0.02, hy: T / 2, hz: (o2 - o) / 2, a });
      }
    }
  };
  // the pond: a strip a metre, its ice from its shore in to `edge` of its ellipse (both sides of
  // its open middle)
  const top = POND_LEVEL + ICE_TOP;
  for (let z = POND.cz - POND.rz; z < POND.cz + POND.rz; z += 1) {
    const m = z + 0.5 - POND.cz;
    const half = POND.rx * Math.sqrt(Math.max(0, 1 - (m / POND.rz) ** 2)) + 0.6;
    const inner =
      edge > 0 && Math.abs(m) < POND.rz * edge ? POND.rx * edge * Math.sqrt(1 - (m / (POND.rz * edge)) ** 2) : 0;
    const x0 = POND.cx - half;
    const x1 = POND.cx + half;
    // (along x: its left is −z — the strip's own width the metre in z)
    const row = (a: number, b: number) => piece(a, z + 0.5, b, z + 0.5, -0.5, 0.5, top);
    if (inner <= 0) row(x0, x1);
    else {
      row(x0, POND.cx - inner);
      row(POND.cx + inner, x1);
    }
  }
  // the river: a slab a sample either side from its edge to its shore (across, frozen over)
  const L = RIVER.line;
  const w = riverWater();
  const H = RIVER.w / 2;
  for (let i = 0; i + 1 < L.length; i++) {
    const [ax, az] = L[i];
    const [bx, bz] = L[i + 1];
    // (fast water doesn't freeze: the rapid and the falls stay open)
    if (w.speed[i] > ICE_FAST || w.speed[i + 1] > ICE_FAST) continue;
    const y = (w.level[i] + w.level[i + 1]) / 2 + ICE_TOP;
    if (edge <= 0) piece(ax, az, bx, bz, -H - 0.6, H + 0.6, y);
    else {
      piece(ax, az, bx, bz, H * edge, H + 0.6, y);
      piece(ax, az, bx, bz, -H - 0.6, -H * edge, y);
    }
  }
  return out;
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

  /** The water's ice as the room has it (W6; plan 66 S4): `ice` (made again as it moves 0.02) and
   *  its holes — what's iced walked, the open water swum. */
  ice(ice: number, holes: readonly IceHole[] = []): void {
    const q = Math.round(Math.max(0, Math.min(1, ice)) * 50) / 50;
    const key = `${q}|${holesToWire(holes)}`;
    if (key === this.iceKey) return;
    this.iceKey = key;
    const solids = iceSheet(q, holes);
    if (solids.length) this.world.setStatic("ice", solids, "floor");
    else this.world.remove("ice");
  }
  private iceKey: string | null = null;

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
