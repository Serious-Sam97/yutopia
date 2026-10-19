import { canPlace } from "./build.ts";
import { entry, placedFootprint, type WorldObjectDef } from "./catalog.ts";
import { convertV1 } from "./convert.ts";
import type { Point } from "./iso.ts";
import { floorOf, floorsOf, levelMap, objLevel, offsetOf } from "./levels.ts";
import {
  type AreaDef,
  type Edge,
  edgeAt,
  emptyEdges,
  isFloor,
  isOuterEdge,
  isWallEdge,
  type LevelDef,
  MapBuilder,
  type MapDef,
  setEdge,
  tileAt,
} from "./map.ts";
import { isOpening, openingEdges } from "./openings.ts";

// The Ruptura-style headquarters made real (docs/plan/25-building-floors.md):
// the studio is the top of five floors; below it three blank office floors and
// the ground floor — the lobby, and outside it the parking lot the campus has
// always drawn, now walkable. One core runs up through all of them: two
// elevator cars and a staircase. Applied once to a world from before floors
// (it has no `levels`); the studio's own things stay where they are, but for
// the few in the core's way.

export const CAMPUS_HOME = 4; // the studio's floor
// the core, in the building's (the studio's) coords: cars at x 6–8 and 8–10,
// the stairwell at x 10–14, all their doors on the north edge (y 29)
// (where it goes when the studio has room there: the south end of its Lobby;
// otherwise the first 8 × 6 stretch of floor — `findCore`; the map keeps it)
// (7 deep since the stairs' landing became two tiles: one row further into
// the Lobby than the first one — upgradeCore moves a building made before)
export const CORE = { x: 6, y: 29, w: 8, h: 7 };
export const LIFT_SHAFTS = [
  { shaft: "A", x: 8, y: 29 },
  { shaft: "B", x: 6, y: 29 },
];
export const STAIRS_AT = { x: 10, y: 29 };
type Core = Point;
// the core's rectangle, its shafts and stairs, for a core at `c`
const rectOf = (c: Core) => ({ x: c.x, y: c.y, w: CORE.w, h: CORE.h });
const shaftsOf = (c: Core) => LIFT_SHAFTS.map((s) => ({ ...s, x: s.x - CORE.x + c.x, y: s.y - CORE.y + c.y }));
const stairsOf = (c: Core) => ({ x: STAIRS_AT.x - CORE.x + c.x, y: STAIRS_AT.y - CORE.y + c.y });

/** Where the core goes in a studio (null: nowhere it fits): all floor, and
 *  where it disturbs least — walls it would cut through, things it would move.
 *  The designed spot (the south end of the studio's Lobby) when it's nearly free. */
export function findCore(home: MapDef, objects: WorldObjectDef[] = []): Core | null {
  const fits = (c: Core) => {
    for (let y = c.y; y < c.y + CORE.h; y++)
      for (let x = c.x; x < c.x + CORE.w; x++) if (!isFloor(tileAt(home, x, y))) return false;
    return true;
  };
  const cost = (c: Core) => {
    let n = 0;
    for (let y = c.y; y <= c.y + CORE.h; y++)
      for (let x = c.x; x < c.x + CORE.w; x++)
        if (y > c.y && y < c.y + CORE.h && isWallEdge(edgeAt(home, { dir: "h", x, y }))) n += 10;
    for (let y = c.y; y < c.y + CORE.h; y++)
      for (let x = c.x + 1; x < c.x + CORE.w; x++) if (isWallEdge(edgeAt(home, { dir: "v", x, y }))) n += 10;
    for (const o of objects) if (o.props?.level === undefined && hits(c, o)) n += 1;
    return n;
  };
  if (fits(CORE) && cost(CORE) <= 3) return { x: CORE.x, y: CORE.y };
  let best: { c: Core; n: number } | null = null;
  for (let y = home.height - CORE.h; y >= 0; y--)
    for (let x = 0; x + CORE.w <= home.width; x++) {
      const c = { x, y };
      if (!fits(c)) continue;
      const n = cost(c);
      if (!best || n < best.n) best = { c, n };
      if (n === 0) return c;
    }
  return best?.c ?? null;
}
// the ground floor's corner in the building's coords: room for the lot (campus
// x −56..−10) and the path to the doors
export const GROUND_OFFSET = { x: -60, y: -10 };

/** The campus's own seeded random (the same as the iso art's `rng`). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── the parking lot (the campus's: tp/campus.ts draws the same) ──────────────
export interface LotLayout {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  bayW: number;
  bayL: number;
  cols: { x: number; dir: number }[];
  aisles: number[];
  bays: { x: number; z: number; dir: number }[];
  // where the campus parks its cars (a seeded pick, the visitor's bay kept free)
  cars: { x: number; z: number; dir: number; wagon: boolean; colour: number; snowy: boolean; tilt: number }[];
  visitorBay: number;
  lamps: { x: number; z: number }[];
  // the cleared path from the lot to the doors (z of its middle)
  entranceZ: number;
}

export const CAR_COLOURS = [0xcbbd98, 0x6b2430, 0x4a5a73, 0xe8e6df, 0x1f2124, 0x6a4a35, 0x8b8f93, 0x2f4a3b, 0xb8702a];

/** The lot west of a studio `H` tiles deep (building coords, map y → z). */
export function campusLot(H: number, entranceZ = H / 2): LotLayout {
  const lot = { x0: -56, z0: -8, x1: -10, z1: H + 12, bayW: 2.8, bayL: 5.6 };
  const c0 = lot.x1 - 2 - lot.bayL;
  const c1 = c0 - 6.5;
  const c2 = c1 - 2 * lot.bayL;
  const c3 = c2 - 6.5;
  const c4 = c3 - 2 * lot.bayL;
  const cols = [
    { x: c0, dir: -1 }, // by the building: noses to the wall
    { x: c1, dir: 1 },
    { x: c2, dir: -1 },
    { x: c3, dir: 1 },
    { x: c4, dir: -1 },
  ];
  const bays: LotLayout["bays"] = [];
  for (const col of cols)
    for (let z = lot.z0 + 3; z + lot.bayW <= lot.z1 - 3; z += lot.bayW)
      bays.push({ x: col.x - (col.dir * lot.bayL) / 2, z: z + lot.bayW / 2, dir: col.dir });
  let visitorBay = 0;
  for (let i = 0; i < bays.length; i++)
    if (
      bays[i].dir === -1 &&
      bays[i].x > lot.x1 - 9 &&
      Math.abs(bays[i].z - (H / 2 + 6)) < Math.abs(bays[visitorBay].z - (H / 2 + 6))
    )
      visitorBay = i;
  const taken = new Set([visitorBay]);
  const rc = seeded(123);
  const cars: LotLayout["cars"] = [];
  for (let tries = 0; cars.length < 16 && tries < 200; tries++) {
    const i = Math.floor(rc() ** 1.7 * bays.length);
    if (taken.has(i)) continue;
    taken.add(i);
    const b = bays[i];
    const wagon = rc() < 0.3;
    const colour = Math.floor(rc() * CAR_COLOURS.length);
    const snowy = rc() > 0.2;
    const tilt = (rc() - 0.5) * 0.04;
    const z = b.z + (rc() - 0.5) * 0.3;
    cars.push({ x: b.x, z, dir: b.dir, wagon, colour, snowy, tilt });
  }
  const lamps: { x: number; z: number }[] = [];
  for (const x of [c2, c4]) for (const z of [lot.z0 + 9, lot.z0 + 23, lot.z0 + 37]) lamps.push({ x, z });
  lamps.push({ x: lot.x1 - 1, z: lot.z0 + 4 }, { x: lot.x1 - 1, z: lot.z1 - 4 });
  return { ...lot, cols, aisles: [c0 - 3.25, c2 - 3.25], bays, cars, visitorBay, lamps, entranceZ };
}

/** The paint on a lot (`lot`: its asphalt's rectangle, any coords): each bay's
 *  sides and its far end, as thin rectangles [x, y, w, h] in the same coords. */
export function lotStripes(lot: {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}): [number, number, number, number][] {
  const bayW = 2.8;
  const bayL = 5.6;
  const t = 0.09;
  const c0 = lot.x1 - 2 - bayL;
  const c1 = c0 - 6.5;
  const c2 = c1 - 2 * bayL;
  const c3 = c2 - 6.5;
  const c4 = c3 - 2 * bayL;
  const out: [number, number, number, number][] = [];
  for (const [x, dir] of [
    [c0, -1],
    [c1, 1],
    [c2, -1],
    [c3, 1],
    [c4, -1],
  ]) {
    const far = x - dir * bayL;
    const a = Math.min(x, far);
    let z = lot.z0 + 3;
    for (; z + bayW <= lot.z1 - 3; z += bayW) out.push([a, z - t / 2, bayL, t]);
    out.push([a, z - t / 2, bayL, t]);
    // the bays' far end (back to back: one line between the two columns)
    out.push([far - t / 2, lot.z0 + 3, t, z - (lot.z0 + 3)]);
  }
  return out;
}

/** The middle of the studio's longest run of floor on its west side (where
 *  the campus puts the entrance). */
export function entranceZOf(home: MapDef): number {
  let best = { len: 0, mid: home.height / 2 };
  let start = -1;
  for (let y = 0; y <= home.height; y++) {
    const f = y < home.height && isFloor(tileAt(home, 0, y));
    if (f && start < 0) start = y;
    if (!f && start >= 0) {
      if (y - start > best.len) best = { len: y - start, mid: (start + y) / 2 };
      start = -1;
    }
  }
  return best.mid;
}

// ── the core ────────────────────────────────────────────────────────────────
// Its walls, in the building's coords: the shafts' sides and backs, the
// stairwell's; the north side open where the doors are.
function coreWalls(c: Core): { e: Edge; ch: string }[] {
  const { x, y, w, h } = rectOf(c);
  const out: { e: Edge; ch: string }[] = [];
  for (let yy = y; yy < y + h; yy++)
    for (const xx of [x, x + 4, x + w]) out.push({ e: { dir: "v", x: xx, y: yy }, ch: "p" });
  for (let yy = y; yy < y + 2; yy++) out.push({ e: { dir: "v", x: x + 2, y: yy }, ch: "p" }); // between the cars
  for (let xx = x; xx < x + 4; xx++) out.push({ e: { dir: "h", x: xx, y: y + 2 }, ch: "p" }); // the cars' backs
  for (let xx = x; xx < x + w; xx++) {
    const door = xx < x + 6; // the cars, and the stairs' door (its west half)
    out.push({ e: { dir: "h", x: xx, y }, ch: door ? "." : "p" });
    out.push({ e: { dir: "h", x: xx, y: y + h }, ch: "p" });
  }
  return out;
}

function inCore(c: Core, x: number, y: number, w = 1, h = 1): boolean {
  const r = rectOf(c);
  return x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;
}

// a level's walls with the core in (its corner at `off` in the building)
function withCore<T extends { hWalls: string[]; vWalls: string[] }>(m: T, off: Point, c: Core | null): T {
  const out = { ...m, hWalls: [...m.hWalls], vWalls: [...m.vWalls] };
  if (!c) return out;
  // nothing else inside it, then its own walls
  const { x, y, w, h } = rectOf(c);
  for (let yy = y + 1; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) setEdge(out, { dir: "h", x: xx - off.x, y: yy - off.y }, ".");
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x + 1; xx < x + w; xx++) setEdge(out, { dir: "v", x: xx - off.x, y: yy - off.y }, ".");
  for (const { e, ch } of coreWalls(c)) setEdge(out, { ...e, x: e.x - off.x, y: e.y - off.y }, ch);
  return out;
}

// the core's things on a floor: the two cars' stops, and stairs up (not on the top floor)
function coreThings(level: number, off: Point, top: boolean, c: Core | null): WorldObjectDef[] {
  if (!c) return [];
  const st = stairsOf(c);
  const out: WorldObjectDef[] = shaftsOf(c).map((s) => ({
    id: `lift-${s.shaft}-${level}`,
    kind: "elevator",
    x: s.x - off.x,
    y: s.y - off.y,
    rot: 0,
    props: { level, shaft: s.shaft, door: "closed" },
  }));
  if (!top)
    out.push({
      id: `stairs-${level}`,
      kind: "stairs",
      x: st.x - off.x,
      y: st.y - off.y,
      rot: 0,
      props: { level },
    });
  return out;
}

// windows every few tiles along a floor's outer walls (not into the core, not
// where something else is set in the wall)
function outerWindows(m: MapDef, level: number, skip: (e: Edge) => boolean = () => false): WorldObjectDef[] {
  const out: WorldObjectDef[] = [];
  const add = (e: Edge, along: number) => {
    if (along % 4 !== 2 || !isWallEdge(edgeAt(m, e)) || edgeAt(m, e) === "g" || !isOuterEdge(m, e) || skip(e)) return;
    out.push({
      id: `win-${level}-${e.dir}${e.x}-${e.y}`,
      kind: "window",
      x: e.x,
      y: e.y,
      rot: e.dir === "h" ? 0 : 1,
      props: { level },
    });
  };
  for (let y = 0; y <= m.height; y++) for (let x = 0; x < m.width; x++) add({ dir: "h", x, y }, x);
  for (let y = 0; y < m.height; y++) for (let x = 0; x <= m.width; x++) add({ dir: "v", x, y }, y);
  return out;
}

// walls on every outer edge of a set of floor tiles
function outerWalls(m: MapDef, ch = "p"): MapDef {
  const out = { ...m, hWalls: [...m.hWalls], vWalls: [...m.vWalls] };
  for (let y = 0; y <= m.height; y++)
    for (let x = 0; x < m.width; x++) if (isOuterEdge(m, { dir: "h", x, y })) setEdge(out, { dir: "h", x, y }, ch);
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x <= m.width; x++) if (isOuterEdge(m, { dir: "v", x, y })) setEdge(out, { dir: "v", x, y }, ch);
  return out;
}

// (room keys are the building's: one name a room, whatever its floor)
const coreArea = (off: Point, level: number, c: Core | null): AreaDef[] =>
  c
    ? [
        {
          key: `core-${level}`,
          name: "Stairs & elevators",
          kind: "open",
          x: c.x - off.x,
          y: c.y - off.y,
          w: CORE.w,
          h: CORE.h,
          priority: 3,
        },
      ]
    : [];

// ── the floors ──────────────────────────────────────────────────────────────
/** A blank office floor on the studio's footprint: bare tile floor, the
 *  curtain wall's windows, the core. Builders make it something. */
export function blankLevel(
  home: MapDef,
  index: number,
  core: Core | null = home.core ?? findCore(home),
): { level: LevelDef; objects: WorldObjectDef[] } {
  const tiles = home.tiles.map((r) => [...r].map((c) => (isFloor(c) ? "_" : " ")).join(""));
  let m: MapDef = { ...home, tiles, ...emptyEdges(home.width, home.height), hBacks: undefined, vBacks: undefined };
  m = withCore(outerWalls(m), { x: 0, y: 0 }, core);
  const level: LevelDef = {
    index,
    name: `Floor ${index}`,
    ox: 0,
    oy: 0,
    width: m.width,
    height: m.height,
    tiles: m.tiles,
    hWalls: m.hWalls,
    vWalls: m.vWalls,
    areas: [
      { key: `floor-${index}`, name: `Floor ${index}`, kind: "open", x: 0, y: 0, w: m.width, h: m.height },
      ...coreArea({ x: 0, y: 0 }, index, core),
    ],
    spawn: core ? { x: core.x + 3.5, y: core.y - 1.5 } : { x: m.width / 2, y: m.height / 2 },
  };
  return { level, objects: [...outerWindows(m, index), ...coreThings(index, { x: 0, y: 0 }, false, core)] };
}

// The lobby of a 48 × 36 studio (the designed one, docs/plan/25 mocks): the
// glass front on the lot side with the doors in it, the reception, the core to
// the south, the long white corridor east through the offices.
function lobbyRooms(): { map: MapDef; objects: WorldObjectDef[] } {
  const tiles = new MapBuilder(48, 36)
    .room(0, 0, 22, 7, ",") // Mail room
    .room(0, 7, 22, 29, "_") // Lobby
    .room(0, 29, 5, 35, ",") // Security
    .room(5, 29, 9, 35, "_") // the shafts
    .room(9, 29, 13, 35, "_") // the stairwell
    .room(13, 29, 22, 35, ",") // Records
    .room(22, 0, 47, 15, ",") // Offices north
    .room(22, 15, 47, 19, "_") // the corridor
    .room(22, 19, 47, 35, ",") // Offices south
    .door(22, 16, "_")
    .door(22, 17, "_")
    .door(22, 18, "_")
    .door(10, 7, ",")
    .door(11, 7, ",")
    .door(30, 15, ",")
    .door(38, 15, ",")
    .door(30, 19, ",")
    .door(38, 19, ",")
    .build();
  const areas: AreaDef[] = [
    { key: "ground-lobby", name: "Lobby", kind: "open", x: 0, y: 8, w: 22, h: 22 },
    { key: "ground-corridor", name: "Corridor", kind: "open", x: 23, y: 16, w: 25, h: 4 },
    { key: "ground-mail", name: "Mail room", kind: "open", x: 0, y: 0, w: 22, h: 8 },
    { key: "ground-security", name: "Security", kind: "private", x: 0, y: 30, w: 6, h: 6 },
    { key: "ground-records", name: "Records", kind: "open", x: 14, y: 30, w: 8, h: 6 },
    { key: "ground-offices-n", name: "North offices", kind: "open", x: 22, y: 0, w: 26, h: 16, dressing: "tidy" },
    { key: "ground-offices-s", name: "South offices", kind: "open", x: 22, y: 20, w: 26, h: 16, dressing: "tidy" },
  ];
  const objects: WorldObjectDef[] = [];
  const add = (id: string, kind: string, x: number, y: number, rot = 0, props?: Record<string, unknown>) =>
    objects.push({ id: `g-${id}`, kind, x, y, rot, ...(props ? { props } : {}) });
  add("reception", "reception", 9, 12, 1);
  add("reception-chair", "chair", 10, 13, 1);
  for (const [i, [x, y]] of [
    [6, 11],
    [6, 23],
    [15, 11],
    [15, 23],
  ].entries())
    add(`column-${i}`, "column", x, y);
  add("bench-n", "bench", 2, 9, 0);
  add("bench-s", "bench", 2, 27, 2);
  add("sofa", "sofa", 15, 27, 2);
  add("armchair-a", "armchair", 13, 25, 1);
  add("armchair-b", "armchair", 18, 25, 3);
  add("table", "coffee_table", 15, 25);
  for (const [i, [x, y]] of [
    [1, 8],
    [1, 28],
    [21, 13],
    [21, 20],
    [21, 27],
  ].entries())
    add(`plant-${i}`, "plant", x, y);
  add("cooler", "water_cooler", 21, 22);
  for (const [i, [x, y, r]] of [
    [33, 4, 0],
    [38, 4, 0],
    [43, 4, 0],
    [33, 26, 2],
    [38, 26, 2],
    [43, 26, 2],
  ].entries()) {
    add(`office-desk-${i}`, "desk", x, y, r);
    add(`office-chair-${i}`, "chair", x, r === 0 ? y - 1 : y + 1, r);
  }
  add("mail-shelf", "bookcase", 4, 1);
  add("mail-counter", "counter", 12, 4);
  const c = convertV1(
    {
      key: "ground",
      name: "Lobby",
      width: 48,
      height: 36,
      tiles,
      hWalls: [],
      vWalls: [],
      spawn: { x: 12.5, y: 17.5 },
      areas,
      objects,
    },
    objects,
    () => "p",
  );
  return { map: c.map, objects: c.objects };
}

/** The ground floor: the lobby (on the studio's footprint) and the lot. */
export function groundLevel(
  home: MapDef,
  core: Core | null = home.core ?? findCore(home),
): { level: LevelDef; objects: WorldObjectDef[] } {
  const off = GROUND_OFFSET;
  const bx = -off.x; // the building's corner in this floor's coords
  const by = -off.y;
  const W = bx + home.width;
  const H = by + home.height + 14;
  const ez = entranceZOf(home);
  const lot = campusLot(home.height, ez);
  const designed = home.width === 48 && home.height === 36 && home.tiles.every((r) => !r.includes(" "));
  const inside = designed ? lobbyRooms() : null;

  // tiles: the lot (asphalt), the cleared path (concrete), the building
  const rows: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => " "));
  for (let y = Math.ceil(lot.z0) + by; y < Math.floor(lot.z1) + by; y++)
    for (let x = Math.ceil(lot.x0) + bx; x < Math.floor(lot.x1) + bx; x++) rows[y][x] = "a";
  const p0 = Math.round(ez - 2);
  for (let y = p0 + by; y < p0 + 4 + by; y++) for (let x = Math.floor(lot.x1) + bx; x < bx; x++) rows[y][x] = "c";
  for (let y = 0; y < home.height; y++)
    for (let x = 0; x < home.width; x++)
      if (isFloor(tileAt(home, x, y))) rows[y + by][x + bx] = inside ? inside.map.tiles[y][x] : "_";
  let m: MapDef = {
    ...home,
    width: W,
    height: H,
    tiles: rows.map((r) => r.join("")),
    ...emptyEdges(W, H),
    hBacks: undefined,
    vBacks: undefined,
  };
  // the building's walls: the lobby's rooms, the outer ones, the core
  if (inside)
    for (let y = 0; y <= home.height; y++)
      for (let x = 0; x <= home.width; x++) {
        if (x < home.width && inside.map.hWalls[y]?.[x] && inside.map.hWalls[y][x] !== ".")
          setEdge(m, { dir: "h", x: x + bx, y: y + by }, inside.map.hWalls[y][x].toLowerCase());
        if (y < home.height && inside.map.vWalls[y]?.[x] && inside.map.vWalls[y][x] !== ".")
          setEdge(m, { dir: "v", x: x + bx, y: y + by }, inside.map.vWalls[y][x].toLowerCase());
      }
  // outer walls of the building only (the lot and the path are open ground)
  const building = (x: number, y: number) => x >= bx && y >= by && x < bx + home.width && y < by + home.height;
  for (let y = 0; y <= H; y++)
    for (let x = 0; x < W; x++) {
      const e: Edge = { dir: "h", x, y };
      if (isOuterEdge(m, e) && (building(x, y) || building(x, y - 1))) setEdge(m, e, "p");
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x <= W; x++) {
      const e: Edge = { dir: "v", x, y };
      if ((building(x, y) || building(x - 1, y)) && (building(x, y) !== building(x - 1, y) || isOuterEdge(m, e)))
        setEdge(m, e, "p");
    }
  // the lobby's front: glass, the doors an opening in it (under the canopy)
  for (let y = 0; y < home.height; y++) {
    const e: Edge = { dir: "v", x: bx, y: y + by };
    if (!isFloor(tileAt(home, 0, y))) continue;
    const door = y >= p0 && y < p0 + 4;
    const lobbyFront = !inside || (y >= 8 && y <= 28);
    setEdge(m, e, door ? "." : lobbyFront ? "g" : "p");
  }
  m = withCore(m, off, core);
  const areas: AreaDef[] = [
    {
      key: "lot",
      name: "Parking lot",
      kind: "open",
      x: Math.ceil(lot.x0) + bx,
      y: Math.ceil(lot.z0) + by,
      w: -Math.ceil(lot.x0), // (the path too: up to the doors)
      h: Math.floor(lot.z1) - Math.ceil(lot.z0),
    },
    ...(inside
      ? inside.map.areas.map((a) => ({ ...a, x: a.x + bx, y: a.y + by }))
      : [{ key: "ground-lobby", name: "Lobby", kind: "open" as const, x: bx, y: by, w: home.width, h: home.height }]),
    ...coreArea(off, 0, core),
  ];
  const level: LevelDef = {
    index: 0,
    name: "Ground",
    ox: off.x,
    oy: off.y,
    width: W,
    height: H,
    tiles: m.tiles,
    hWalls: m.hWalls,
    vWalls: m.vWalls,
    areas,
    spawn: { x: bx + 4.5, y: by + ez },
  };

  // its things: the lobby's, the cars, the lamp posts, windows, the core
  const objects: WorldObjectDef[] = [];
  for (const o of inside?.objects ?? [])
    objects.push({ ...o, x: o.x + bx, y: o.y + by, props: { ...(o.props ?? {}), level: 0 } });
  const taken = new Set<string>();
  const take = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (taken.has(`${xx},${yy}`)) return false;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) taken.add(`${xx},${yy}`);
    return true;
  };
  for (const [i, c] of lot.cars.entries()) {
    // a car is 5 × 2 (rot 0: its nose to −x); where exactly it stands in its bay is art
    const x = Math.round(c.x - 2.5);
    const z = Math.round(c.z - 1);
    if (!take(x + bx, z + by, 5, 2)) continue;
    objects.push({
      id: `car-${i}`,
      kind: "car",
      x: x + bx,
      y: z + by,
      rot: c.dir > 0 ? 0 : 2,
      props: {
        level: 0,
        variant: c.colour,
        ...(c.wagon ? { wagon: 1 } : {}),
        ...(c.snowy ? { snowy: 1 } : {}),
        dx: Math.round((c.x - 2.5 - x) * 100) / 100,
        dz: Math.round((c.z - 1 - z) * 100) / 100,
      },
    });
  }
  for (const [i, l] of lot.lamps.entries()) {
    const x = Math.floor(l.x) + bx;
    const y = Math.floor(l.z) + by;
    if (!take(x, y, 1, 1)) continue;
    objects.push({ id: `lamp-post-${i}`, kind: "lamp_post", x, y, rot: 0, props: { level: 0 } });
  }
  const front = (e: Edge) => e.dir === "v" && e.x === bx;
  objects.push(...outerWindows(m, 0, front));
  objects.push(...coreThings(0, off, false, core));
  return { level, objects };
}

/** The studio as the top of the building: the core cut into it, and the
 *  things standing where it goes moved out of its way. */
export function homeWithCore(
  home: MapDef,
  objects: WorldObjectDef[],
  core: Core | null,
): { map: MapDef; moved: WorldObjectDef[] } {
  const map = withCore(home, { x: 0, y: 0 }, core);
  map.areas = [...home.areas.filter((a) => !a.key.startsWith("core-")), ...coreArea({ x: 0, y: 0 }, CAMPUS_HOME, core)];
  if (!core) return { map, moved: [] };
  const hitsCore = (o: WorldObjectDef) => hits(core, o);
  const moved: WorldObjectDef[] = [];
  const level = objects.filter((o) => o.props?.level === undefined);
  const others = level.filter((o) => !hitsCore(o));
  for (const o of level) {
    if (!hitsCore(o)) continue;
    const spot = nearestFree(map, others, o, hitsCore);
    if (!spot) continue;
    const next = { ...o, x: spot.x, y: spot.y };
    others.push(next);
    moved.push(next);
  }
  return { map, moved };
}

function hits(c: Core, o: WorldObjectDef): boolean {
  if (isOpening(o.kind))
    return openingEdges(o).some((e) => inCore(c, e.x, e.y) && !(e.dir === "h" && e.y === c.y + CORE.h));
  if (entry(o.kind).wall) return false;
  const f = placedFootprint(o);
  return inCore(c, o.x, o.y, f.w, f.h) || inFront(c, o);
}

// the row in front of the core's doors (the two cars', the stairs'): kept
// clear, or half a car's doorway is a lamp
function inFront(c: Core, o: WorldObjectDef): boolean {
  if (isOpening(o.kind) || entry(o.kind).wall) return false;
  const f = placedFootprint(o);
  return o.x < c.x + 6 && o.x + f.w > c.x && o.y < c.y && o.y + f.h > c.y - 1;
}

/** Things standing in front of the core's doors, on any floor, moved aside
 *  (a building made before they were kept clear: the studio's lobby lamp). */
export function clearCoreFronts(home: MapDef, objects: WorldObjectDef[]): WorldObjectDef[] {
  const core = home.core;
  if (!core) return [];
  const moved: WorldObjectDef[] = [];
  for (const level of floorsOf(home)) {
    const lm = levelMap(home, level);
    if (!lm) continue;
    const off = offsetOf(home, level);
    const c = { x: core.x - off.x, y: core.y - off.y };
    const on = objects.filter((o) => objLevel(o, home) === level && o.kind !== "elevator" && o.kind !== "stairs");
    const others = on.filter((o) => !inFront(c, o));
    for (const o of on) {
      if (!inFront(c, o)) continue;
      const spot = nearestFree(lm, others, o, (n) => hits(c, n));
      if (!spot) continue;
      const next = { ...o, x: spot.x, y: spot.y };
      others.push(next);
      moved.push(next);
    }
  }
  return moved;
}

function nearestFree(
  map: MapDef,
  others: WorldObjectDef[],
  o: WorldObjectDef,
  hitsCore: (o: WorldObjectDef) => boolean,
): Point | null {
  for (let r = 1; r < 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const next = { ...o, x: o.x + dx, y: o.y + dy };
        if (hitsCore(next)) continue;
        if (canPlace(map, others, next)) return { x: next.x, y: next.y };
      }
  return null;
}

/** A building made with the first core (6 deep: the stairs' landing one tile)
 *  brought up to today's: the core a row further north and 7 deep, on every
 *  floor — its walls, its room, the cars' stops and the stairs a row north,
 *  anything else in its way (or in front of its doors) moved aside. null:
 *  nothing to do, or no floor there to grow into. */
export function upgradeCore(
  home: MapDef,
  objects: WorldObjectDef[],
): { map: MapDef; objects: WorldObjectDef[]; moved: WorldObjectDef[] } | null {
  const old = home.core;
  const area = home.areas.find((a) => a.key.startsWith("core-"));
  if (!old || !area || area.h === CORE.h) return null;
  const c = { x: old.x, y: old.y - 1 };
  for (let x = c.x; x < c.x + CORE.w; x++) if (!isFloor(tileAt(home, x, c.y))) return null;
  const rooms = (areas: AreaDef[], off: Point, level: number) => [
    ...areas.filter((a) => !a.key.startsWith("core-")),
    ...coreArea(off, level, c),
  ];
  const map: MapDef = {
    ...withCore(home, { x: 0, y: 0 }, c),
    core: c,
    areas: rooms(home.areas, { x: 0, y: 0 }, floorOf(home)),
    levels: (home.levels ?? []).map((l) => {
      const off = { x: l.ox, y: l.oy };
      return { ...withCore(l, off, c), areas: rooms(l.areas, off, l.index) };
    }),
  };
  // the stops and the stairs: a row north (in the old core: theirs)
  const moved = new Map<string, WorldObjectDef>();
  const oldRect = { x: old.x, y: old.y, w: CORE.w, h: CORE.h - 1 };
  let next = objects.map((o) => {
    if (o.kind !== "elevator" && o.kind !== "stairs") return o;
    const off = offsetOf(map, objLevel(o, map));
    const bx = o.x + off.x;
    const by = o.y + off.y;
    if (bx < oldRect.x || bx >= oldRect.x + oldRect.w || by < oldRect.y || by >= oldRect.y + oldRect.h) return o;
    const m = { ...o, y: o.y - 1 };
    moved.set(m.id, m);
    return m;
  });
  // anything else now in the core, or in front of its doors, moved aside
  for (const level of floorsOf(map)) {
    const lm = levelMap(map, level);
    if (!lm) continue;
    const off = offsetOf(map, level);
    const cf = { x: c.x - off.x, y: c.y - off.y };
    const on = next.filter((o) => objLevel(o, map) === level && o.kind !== "elevator" && o.kind !== "stairs");
    const others = on.filter((o) => !hits(cf, o));
    for (const o of on) {
      if (!hits(cf, o)) continue;
      const spot = nearestFree(lm, others, o, (n) => hits(cf, n));
      if (!spot) continue;
      const m = { ...o, x: spot.x, y: spot.y };
      others.push(m);
      moved.set(m.id, m);
    }
  }
  next = next.map((o) => moved.get(o.id) ?? o);
  return { map, objects: next, moved: [...moved.values()] };
}

/** The whole building from a studio with no floors yet (null: it has them). */
export function campusBuilding(
  home: MapDef,
  objects: WorldObjectDef[],
): { map: MapDef; add: WorldObjectDef[]; moved: WorldObjectDef[] } | null {
  if (home.levels?.length || floorOf(home) !== 0) return null;
  const core = findCore(home, objects);
  const studio = homeWithCore(home, objects, core);
  const ground = groundLevel(home, core);
  const blanks = [1, 2, 3].map((i) => blankLevel(home, i, core));
  const map: MapDef = {
    ...studio.map,
    floor: CAMPUS_HOME,
    levels: [ground.level, ...blanks.map((b) => b.level)],
    ...(core ? { core } : {}),
  };
  const have = new Set(objects.map((o) => o.id));
  const add = [
    ...ground.objects,
    ...blanks.flatMap((b) => b.objects),
    ...coreThings(CAMPUS_HOME, { x: 0, y: 0 }, true, core),
  ].filter((o) => !have.has(o.id));
  return { map, add, moved: studio.moved };
}
