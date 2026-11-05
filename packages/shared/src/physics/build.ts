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
//   lift:id         a lift's stop: its shaft's walls the storey's height, and its landing's doors
//                   shut but where the car stands open (the car's a carrier: liftCarBody)
//   door:id         a locked door, its way shut (layer door: its owner passes — passKeys)
// Parked cars are vehicles (kinematic: the car sim moves them): car:id.
import { parkedBody } from "../car/park.ts";
import { standHeight, type WorldObjectDef } from "../catalog.ts";
import { doorOwner } from "../doors.ts";
import { dressItems } from "../dressing.ts";
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
  waterAt,
} from "../grounds.ts";
import { grownLakeR, grownLevel, grownNow, lakeBowl } from "../grow.ts";
import { landVersion } from "../land.ts";
import { across, levelMap, objLevel, onLevel } from "../levels.ts";
import { CAR_FLOOR, liftDoorEdges, liftHere, liftRect, liftShafts, liftWallEdges, shaftHoles } from "../lift.ts";
import { LAKE, LONG_ROAD, lakeR } from "../longroad.ts";
import { type Edge, isFloor, type MapDef, tileAt, worldShift } from "../map.ts";
import { doorLockable, isOpening, openingEdges } from "../openings.ts";
import { type GroundSolid, type GroundWhat, groundSolidAt, groundSolidsIn } from "../shapes/grounds.ts";
import { blocksOf, box3, kindSolids, openingHole, type Solid3, type SolidBox3, WALL_T } from "../shapes/index.ts";
import { stairsTopRail, stairsWell } from "../stairs.ts";
import { foldMap, foldThings } from "../structure/fold.ts";
import { structureFromMap } from "../structure/from-map.ts";
import type { Structure } from "../structure/types.ts";
import { STOREY } from "../units.ts";
import { crossings, cutsOf, slabBoxes, wallPieces } from "./structure-solids.ts";
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
  const o = worldShift(lm);
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
  /** the lifts' cars' floors at each stop, as the navmesh walks them (not Jolt's: the car is a
   *  carrier there, where it is — liftCarBody): a way into the car, its landing's doors the
   *  obstacle while they're shut */
  liftFloors: { level: number; s: Solid3 }[];
}

/** The locked doors `uid` passes (their own rooms'): PhysicsWorld.pass of these. */
export function passKeys(b: BuildingSolids, uid: number | null | undefined): string[] {
  if (uid == null) return [];
  return [...b.locked].filter(([, owner]) => owner === uid).map(([k]) => k);
}

const RAIL_H = 1.1; // a stairwell's rail with nothing going up from it (m)

/** Every floor of the building as solids: its walls and slabs from its structure (made from `map`
 *  when none is given — the tests' older maps), its things, clutter, stairs and lifts from `map`
 *  (a world map: the adapter's — structure/to-map.ts) and `objects`. */
export function buildingSolids(map0: MapDef, objects: Iterable<WorldObjectDef>, structure?: Structure): BuildingSolids {
  const map = foldMap(map0);
  const all = foldThings(map0, [...objects]);
  const st = structure ?? structureFromMap(map);
  const out: BuildingSolids = { statics: new Map(), cars: new Map(), locked: new Map(), flow: [], liftFloors: [] };
  const shafts = liftShafts(all, map);
  const add = (k: string, layer: Layer, s: Solid3) => {
    const had = out.statics.get(k);
    if (had) had.solids.push(s);
    else out.statics.set(k, { solids: [s], layer });
  };
  const put = (level: number, s: Solid3) => add(`wall:${level}:${at(s)}`, "wall", s);
  const floors = st.floors.map((f) => f.index);
  for (const f of st.floors) {
    const level = f.index;
    const lm = levelMap(map, level);
    if (!lm) continue;
    const here = onLevel(all, lm);
    const ox = 0;
    const oz = 0;
    const elev = f.z;
    // the floor's own: its slabs' rings (what's floor, read even-odd)
    const rings = st.slabs.filter((x) => x.floor === level).flatMap((x) => [x.outline, ...x.holes]);
    const indoors = (x: number, y: number) => crossings(rings, y).filter((c) => c < x).length % 2 === 1;
    // the walls, cut by their doors and windows (out of doors on a side: Flowmotion's runs too)
    const cuts = cutsOf(st, here, level);
    for (const w of st.walls) {
      if (w.floor !== level) continue;
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
      const [nx, ny] = [-(w.b[1] - w.a[1]) / len, (w.b[0] - w.a[0]) / len];
      const outside = (u: number) => {
        const x = w.a[0] + ((w.b[0] - w.a[0]) / len) * u;
        const y = w.a[1] + ((w.b[1] - w.a[1]) / len) * u;
        return !indoors(x + nx * 0.5, y + ny * 0.5) || !indoors(x - nx * 0.5, y - ny * 0.5);
      };
      const pcs = wallPieces(w, cuts.get(w.id) ?? [], outside);
      for (const s of [...pcs.solids, ...pcs.panes]) put(level, s);
      for (const s of pcs.flow) out.flow.push({ what: "building_wall", s });
    }
    // the slab under its floor (not the stairs' well from the floor below)
    const wells: [number, number, number, number][] = [];
    for (const o of all)
      if (o.kind === "stairs" && objLevel(o, map) === level - 1)
        for (const [x, y] of stairsWell(o)) wells.push([x, y, x + 1, y + 1]);
    // (and a lift's shaft going on down from here: open — its car's floor is its own)
    wells.push(...shaftHoles(shafts, level));
    for (const slab of slabBoxes(rings, wells, elev)) add(`slab:${level}:${at(slab)}`, "floor", slab);
    // the top floor's roof: a slab over all of it, where the next floor's would be (one building,
    // docs/plan/50 D: flown up to from inside, it stops you; landed on from outside, it holds you)
    if (!floors.includes(level + 1))
      for (const slab of slabBoxes(rings, [], elev + STOREY)) add(`roof:${level}:${at(slab)}`, "floor", slab);
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
        const q = across(map, level - 1, level, o);
        const up = here.some((u) => u.kind === "stairs" && u.x === q.x && u.y === q.y);
        if (!up) for (const e of stairsTopRail({ ...o, ...q })) put(level, moved(edgeBox(e, 0, RAIL_H), ox, elev, oz));
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
        // the shaft's three walls the storey's height (up to the next floor's slab: nothing slips
        // out between them); its landing's doors shut, but where the car stands open — over them,
        // the wall on up
        const k = `lift:${o.id}`;
        const open = liftHere(o, lm) && o.props?.door === "open";
        for (const e of liftWallEdges(o)) add(k, "wall", moved(edgeBox(e, 0, STOREY), ox, elev, oz));
        for (const e of liftDoorEdges(o))
          add(k, "wall", moved(edgeBox(e, open ? LIFT_DOOR_TOP : 0, STOREY), ox, elev, oz));
        const [x0, y0, x1, y1] = liftRect(o);
        out.liftFloors.push({ level, s: box3(ox + x0, oz + y0, ox + x1, oz + y1, elev - CAR_FLOOR, elev) });
        continue;
      }
      if (o.kind === "car") {
        if (o.props?.driven) continue;
        const b = parkedBody(o);
        const base = elev + (b.h ?? baseOf(lm, level, b.x, b.y));
        const top = standHeight("car") ?? 0;
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
      const flow = level === 0 && !indoors(o.x + 0.5, o.y + 0.5) ? PARKOUR[o.kind] : undefined;
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

/** Over a lift's open doors (m): the wall on up from there. */
const LIFT_DOOR_TOP = 2.3;

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
  // Silver Lake (docs/plan/69) and god mode's grown lakes (its phase 10): rows 2 m wide, each iced
  // where it's the lake's and from its shore in to `edge`
  for (const lk of lakes()) {
    const ly = lk.level + ICE_TOP;
    for (const row of lk.rows) {
      let from: number | null = null;
      for (let k = 0; k <= row.l.length; k++) {
        const l = row.l[k];
        const on = k < row.l.length && l <= 1 && (edge <= 0 || l >= edge);
        if (on && from === null) from = k;
        if (!on && from !== null) {
          const [ax, az] = lk.pt(row.u0 + from * 2, row.v);
          const [bx, bz] = lk.pt(row.u0 + k * 2, row.v);
          piece(ax, az, bx, bz, -1, 1, ly);
          from = null;
        }
      }
    }
  }
  return out;
}

// The lakes that ice: each in its own frame (u along it, v across), its rows 2 m apart, a cell every
// 2 m along — how far out each is (1 its shore; 9 where it's dry), made once (a grown one's again as
// it's laid anew)
interface IceLake {
  level: number;
  pt: (u: number, v: number) => [number, number];
  rows: { v: number; u0: number; l: Float32Array }[];
}
function iceRows(
  pt: IceLake["pt"],
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  side: (x: number, z: number) => number,
): IceLake["rows"] {
  const rows: IceLake["rows"] = [];
  for (let v = v0; v < v1; v += 2) {
    const l = new Float32Array(Math.floor((u1 - u0) / 2));
    for (let k = 0; k < l.length; k++) {
      const [x, z] = pt(u0 + k * 2 + 1, v + 1);
      l[k] = side(x, z);
    }
    rows.push({ v: v + 1, u0, l });
  }
  return rows;
}
let silver: IceLake | null = null;
const grownIce = new Map<string, IceLake>();
function lakes(): IceLake[] {
  const out: IceLake[] = [];
  if (LONG_ROAD) {
    if (!silver) {
      const c = Math.cos(LAKE.tilt);
      const s = Math.sin(LAKE.tilt);
      const pt = (u: number, v: number): [number, number] => [LAKE.cx + u * c - v * s, LAKE.cz + u * s + v * c];
      const R = LAKE.rx * 1.4;
      const V = LAKE.rz * 1.4;
      silver = {
        level: LAKE.level,
        pt,
        // (its deep middle wet, past its bowl dry: only its shore's asked)
        rows: iceRows(pt, -R, R, -V, V, (x, z) => {
          const r = lakeR(x, z);
          return r < 0.85 || (r < 1.25 && waterAt(x, z)?.kind === "lake") ? Math.min(1, r) : 9;
        }),
      };
    }
    out.push(silver);
  }
  const live = new Set<string>();
  for (const g of grownNow()) {
    if (g.def.biome !== "lake") continue;
    const k = JSON.stringify([g.def, g.y]);
    live.add(k);
    let lk = grownIce.get(k);
    if (!lk) {
      // (over its bowl, its shape read from an 8 m grid: the wobble's ~90 m waves — every 2 m with the
      // water asked of the land too, a big lake was seconds; the water's asked on its shore only)
      const b = lakeBowl(g.def);
      const ex = b.rx * 1.4;
      const ez = b.rz * 1.4;
      const G = 8;
      const nx = Math.ceil((2 * ex) / G) + 2;
      const nz = Math.ceil((2 * ez) / G) + 2;
      const grid = new Float32Array(nx * nz);
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) grid[j * nx + i] = grownLakeR(g, b.cx - ex + i * G, b.cz - ez + j * G);
      const rAt = (x: number, z: number) => {
        const u = Math.min(nx - 1.001, Math.max(0, (x - b.cx + ex) / G));
        const v = Math.min(nz - 1.001, Math.max(0, (z - b.cz + ez) / G));
        const i = Math.floor(u);
        const j = Math.floor(v);
        const fu = u - i;
        const fv = v - j;
        const at = (a: number, c: number) => grid[(j + c) * nx + i + a];
        return (at(0, 0) * (1 - fu) + at(1, 0) * fu) * (1 - fv) + (at(0, 1) * (1 - fu) + at(1, 1) * fu) * fv;
      };
      const pt = (u: number, v: number): [number, number] => [u, v];
      lk = {
        level: grownLevel(g),
        pt,
        rows: iceRows(pt, b.cx - ex, b.cx + ex, b.cz - ez, b.cz + ez, (x, z) => {
          const r = rAt(x, z);
          return r < 0.95 || (r < 1.3 && waterAt(x, z)?.kind === "lake") ? Math.min(1, r) : 9;
        }),
      };
      grownIce.set(k, lk);
    }
    out.push(lk);
  }
  for (const k of [...grownIce.keys()]) if (!live.has(k)) grownIce.delete(k);
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

  /** A Grounds chunk taken out again (nobody's near it: docs/plan/69, L2). */
  dropChunk(cx: number, cz: number): void {
    const k = `${cx},${cz}`;
    if (!this.ground.delete(k)) return;
    this.world.remove(`land:${k}`);
    this.world.remove(`grounds:${k}`);
  }
  /** Whether a Grounds chunk is built. */
  hasChunk(cx: number, cz: number): boolean {
    return this.ground.has(`${cx},${cz}`);
  }
  /** The Grounds chunks built, "cx,cz" each. */
  chunksBuilt(): ReadonlySet<string> {
    return this.ground;
  }

  /** The water's ice as the room has it (W6; plan 66 S4): `ice` (made again as it moves 0.02) and
   *  its holes — what's iced walked, the open water swum (and again once the land's grown: a lake
   *  of god mode's — docs/plan/69, phase 10). */
  ice(ice: number, holes: readonly IceHole[] = []): void {
    const q = Math.round(Math.max(0, Math.min(1, ice)) * 50) / 50;
    const key = `${q}|${holesToWire(holes)}|${landVersion}`;
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
