import { canPlace } from "./build.ts";
import { entry, placedFootprint, type WorldObjectDef } from "./catalog.ts";
import { convertV1 } from "./convert.ts";
import type { Point } from "./iso.ts";
import { floorOf, floorsOf, levelMap, objLevel, offsetOf } from "./levels.ts";
import { LOT, lotLayout } from "./lot.ts";
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

// ── the parking lot: one layout for every world (lot.ts, docs/plan/42-the-lot.md; the index
// exports it itself — passed on from here, the bundler kept all of this module on the page) ──

/** A car parked square in a bay (`c`: its middle in the building's coords, `dir` which way it
 *  noses) as an object's place on the ground floor (`bx, by`: the building's corner there): a car
 *  is 5 × 2 (rot 0: its nose to −x), exactly where by props.dx / dz. */
function bayPlace(c: { x: number; z: number; dir: number }, bx: number, by: number) {
  const x = Math.round(c.x - 2.5);
  const z = Math.round(c.z - 1);
  return {
    x: x + bx,
    y: z + by,
    rot: c.dir > 0 ? 0 : 2,
    dx: Math.round((c.x - 2.5 - x) * 100) / 100,
    dz: Math.round((c.z - 1 - z) * 100) / 100,
  };
}

/** The lot's tiles into a ground floor's rows (`bx, by`: the building's corner there): asphalt,
 *  and the pavement along the building concrete. */
function stampLot(rows: string[][], bx: number, by: number) {
  const pave = Math.round(lotLayout().pavement.x0);
  for (let z = LOT.z0; z < LOT.z1; z++)
    for (let x = LOT.x0; x < LOT.x1; x++) rows[z + by][x + bx] = x >= pave ? "c" : "a";
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
  // (deep enough for the lot, whatever the studio: lot.ts)
  const H = Math.max(by + home.height + 14, by + LOT.z1);
  const ez = entranceZOf(home);
  const lot = lotLayout(ez);
  const designed = home.width === 48 && home.height === 36 && home.tiles.every((r) => !r.includes(" "));
  const inside = designed ? lobbyRooms() : null;

  // tiles: the lot (asphalt), the cleared path (concrete), the building
  const rows: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => " "));
  stampLot(rows, bx, by);
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
    const at = bayPlace(c, bx, by);
    if (!take(at.x, at.y, 5, 2)) continue;
    objects.push({
      id: `car-${i}`,
      kind: "car",
      x: at.x,
      y: at.y,
      rot: at.rot,
      props: {
        level: 0,
        variant: c.colour,
        ...(c.wagon ? { wagon: 1 } : {}),
        ...(c.snowy ? { snowy: 1 } : {}),
        dx: at.dx,
        dz: at.dz,
      },
    });
  }
  for (const [i, l] of lot.lamps.entries()) {
    const x = Math.floor(l.x) + bx;
    const y = Math.floor(l.z) + by;
    if (!take(x, y, 1, 1)) continue;
    objects.push({ id: `lamp-post-${i}`, kind: "lamp_post", x, y, rot: l.rot, props: { level: 0 } });
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

// ── the courtyard's blocks (docs/plan/27-the-grounds.md, phase 2) ─────────────
// The east and the south block stand on the Grounds across the courtyard from
// the headquarters (shared grounds.ts BUILDINGS: the same rectangles). Their
// ground floors are the ground floor's own — blank, for builders to make
// something of: the floor grows to take them in (its corner stays where it
// was, so nothing on it moves). Glass all round, a doorway, a sealed core
// (their upper floors aren't open yet).
// (Clear of a studio up to 64 × 48 with a 12-tile courtyard: they stood at
// x 60 and y 48 — inside a studio grown past 60 wide, on one 48 deep;
// moveBlocks takes a stored ground floor's from there to here.)
export const BLOCKS = [
  {
    key: "east-block",
    name: "East block",
    x0: 76,
    y0: -10,
    x1: 100, // (the ground floor at most 160 wide: −60 … 100; map-edit LEVEL_MAX, the API's too)
    y1: 48,
    door: { dir: "v" as const, at: 76, from: 16, to: 20 },
    core: { x: 86, y: 14, w: 8, h: 7 },
  },
  {
    key: "south-block",
    name: "South block",
    x0: -4,
    y0: 60,
    x1: 50,
    y1: 84,
    door: { dir: "h" as const, at: 60, from: 22, to: 26 },
    core: { x: 34, y: 70, w: 8, h: 7 },
  },
];
// where they stood first (2026-10-20): their cores, to clear them
const OLD_CORES: Record<string, { x: number; y: number; w: number; h: number }> = {
  "east-block": { x: 76, y: 14, w: 8, h: 7 },
  "south-block": { x: 34, y: 58, w: 8, h: 7 },
};

/** A stored ground floor whose blocks stand where they first did: they go (their
 *  floor, glass and core — not the studio's own outline), the things built in
 *  them move with them, and upgradeGround puts them in again where they stand
 *  now. Null: nothing to move. */
export function moveBlocks(
  map: MapDef,
  objects: WorldObjectDef[],
): { map: MapDef; objects: WorldObjectDef[]; moved: WorldObjectDef[] } | null {
  const l0 = map.levels?.find((l) => l.index === 0);
  if (!l0) return null;
  const ox = l0.ox;
  const oy = l0.oy;
  const old = BLOCKS.flatMap((b) => {
    const a = l0.areas.find((x) => x.key === b.key);
    return a && (a.x !== b.x0 - ox || a.y !== b.y0 - oy) ? [{ b, a }] : [];
  });
  if (!old.length) return null;
  const m: { hWalls: string[]; vWalls: string[] } = { hWalls: [...l0.hWalls], vWalls: [...l0.vWalls] };
  const rows = l0.tiles.map((r) => [...r]);
  // the studio's footprint in this floor's coords (its outline is the lobby's walls)
  const sx0 = -ox;
  const sy0 = -oy;
  const sx1 = sx0 + map.width;
  const sy1 = sy0 + map.height;
  const inStudio = (x: number, y: number) => x >= sx0 && x < sx1 && y >= sy0 && y < sy1;
  const onOutline = (e: Edge) =>
    e.dir === "h"
      ? (e.y === sy0 || e.y === sy1) && e.x >= sx0 && e.x < sx1
      : (e.x === sx0 || e.x === sx1) && e.y >= sy0 && e.y < sy1;
  const clear = (e: Edge) => {
    if (!onOutline(e) && "gp".includes(edgeAt(l0 as unknown as MapDef, e))) setEdge(m, e, ".");
  };
  const moved: WorldObjectDef[] = [];
  let out = objects;
  for (const { b, a } of old) {
    for (let y = a.y; y < a.y + a.h; y++)
      for (let x = a.x; x < a.x + a.w; x++) if (rows[y]?.[x] === "_" && !inStudio(x, y)) rows[y][x] = " ";
    for (let x = a.x; x < a.x + a.w; x++) for (const y of [a.y, a.y + a.h]) clear({ dir: "h", x, y });
    for (let y = a.y; y < a.y + a.h; y++) for (const x of [a.x, a.x + a.w]) clear({ dir: "v", x, y });
    const c0 = OLD_CORES[b.key];
    const c = { x: c0.x - ox, y: c0.y - oy, w: c0.w, h: c0.h };
    for (let x = c.x; x < c.x + c.w; x++) for (const y of [c.y, c.y + c.h]) clear({ dir: "h", x, y });
    for (let y = c.y; y < c.y + c.h; y++) for (const x of [c.x, c.x + c.w]) clear({ dir: "v", x, y });
    // what was built in it goes with it
    const dx = b.x0 - ox - a.x;
    const dy = b.y0 - oy - a.y;
    out = out.map((o) => {
      if (objLevel(o, map) !== 0 || inStudio(o.x, o.y)) return o;
      if (o.x < a.x || o.y < a.y || o.x >= a.x + a.w || o.y >= a.y + a.h) return o;
      const n = { ...o, x: o.x + dx, y: o.y + dy };
      moved.push(n);
      return n;
    });
  }
  const keys = new Set(old.map((o) => o.b.key));
  const level: LevelDef = {
    ...l0,
    tiles: rows.map((r) => r.join("")),
    hWalls: m.hWalls,
    vWalls: m.vWalls,
    areas: l0.areas.filter((x) => !keys.has(x.key)),
  };
  const cleared = { ...map, levels: (map.levels ?? []).map((l) => (l.index === 0 ? level : l)) };
  // (back in where they stand now; the other one, already there, stays)
  const back = upgradeBlocks(cleared, keys);
  return { map: back ?? cleared, objects: out, moved };
}

/** The ground floor with the blocks' ground floors in it (null: they're there,
 *  or it has no ground floor). */
export function upgradeGround(map: MapDef): MapDef | null {
  const l0 = map.levels?.find((l) => l.index === 0);
  if (!l0 || l0.areas.some((a) => a.key === BLOCKS[0].key)) return null;
  return upgradeBlocks(map, new Set(BLOCKS.map((b) => b.key)));
}
function upgradeBlocks(map: MapDef, which: Set<string>): MapDef | null {
  const l0 = map.levels?.find((l) => l.index === 0);
  if (!l0) return null;
  const blocks = BLOCKS.filter((b) => which.has(b.key));
  const ox = l0.ox;
  const oy = l0.oy;
  const W = Math.max(l0.width, ...blocks.map((b) => b.x1 - ox));
  const H = Math.max(l0.height, ...blocks.map((b) => b.y1 - oy));
  const pad = (rows: string[], n: number, w: number, ch: string) => [
    ...rows.map((r) => r.padEnd(w, ch)),
    ...Array.from({ length: n - rows.length }, () => ch.repeat(w)),
  ];
  const m: MapDef = {
    ...(levelMap(map, 0) as MapDef),
    width: W,
    height: H,
    tiles: pad(l0.tiles, H, W, " "),
    hWalls: pad(l0.hWalls, H + 1, W, "."),
    vWalls: pad(l0.vWalls, H, W + 1, "."),
    ...(l0.hBacks ? { hBacks: pad(l0.hBacks, H + 1, W, ".") } : {}),
    ...(l0.vBacks ? { vBacks: pad(l0.vBacks, H, W + 1, ".") } : {}),
  };
  const rows = m.tiles.map((r) => [...r]);
  const areas: AreaDef[] = [...l0.areas];
  for (const b of blocks) {
    const x0 = b.x0 - ox;
    const y0 = b.y0 - oy;
    const x1 = b.x1 - ox;
    const y1 = b.y1 - oy;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!isFloor(rows[y][x])) rows[y][x] = "_";
    m.tiles = rows.map((r) => r.join(""));
    // glass all round, the doorway open
    const door = (e: Edge) =>
      b.door.dir === e.dir &&
      (e.dir === "v" ? e.x : e.y) === (e.dir === "v" ? b.door.at - ox : b.door.at - oy) &&
      (e.dir === "v" ? e.y + oy : e.x + ox) >= b.door.from &&
      (e.dir === "v" ? e.y + oy : e.x + ox) < b.door.to;
    for (let x = x0; x < x1; x++)
      for (const y of [y0, y1]) {
        const e: Edge = { dir: "h", x, y };
        setEdge(m, e, door(e) ? "." : "g");
      }
    for (let y = y0; y < y1; y++)
      for (const x of [x0, x1]) {
        const e: Edge = { dir: "v", x, y };
        setEdge(m, e, door(e) ? "." : "g");
      }
    // the core: plaster walls round it, no way in
    const c = { x: b.core.x - ox, y: b.core.y - oy, w: b.core.w, h: b.core.h };
    for (let x = c.x; x < c.x + c.w; x++) for (const y of [c.y, c.y + c.h]) setEdge(m, { dir: "h", x, y }, "p");
    for (let y = c.y; y < c.y + c.h; y++) for (const x of [c.x, c.x + c.w]) setEdge(m, { dir: "v", x, y }, "p");
    areas.push({ key: b.key, name: b.name, kind: "open", x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  const level: LevelDef = {
    ...l0,
    width: W,
    height: H,
    tiles: m.tiles,
    hWalls: m.hWalls,
    vWalls: m.vWalls,
    ...(m.hBacks ? { hBacks: m.hBacks } : {}),
    ...(m.vBacks ? { vBacks: m.vBacks } : {}),
    areas,
  };
  return { ...map, levels: (map.levels ?? []).map((l) => (l.index === 0 ? level : l)) };
}

/** A stored ground floor with the old lot (docs/plan/42-the-lot.md, null: it has today's, or no
 *  ground floor): the lot stamped again where it was — its asphalt, the pavement along the building
 *  (how it knows: no concrete there yet), its area — the lamp posts moved onto the islands, each
 *  seeded car (car-i) into its own bay and any other car parked on it into the free bay nearest
 *  it. Cars being driven, the ones that live elsewhere and everything off the lot stay as they are. */
export function upgradeLot(
  map: MapDef,
  objects: WorldObjectDef[],
): { map: MapDef; objects: WorldObjectDef[]; moved: WorldObjectDef[] } | null {
  const l0 = map.levels?.find((l) => l.index === 0);
  if (!l0) return null;
  const bx = -l0.ox;
  const by = -l0.oy;
  const l = lotLayout(entranceZOf(map));
  const pave = Math.round(l.pavement.x0);
  if (l0.tiles[30 + by]?.[pave + 1 + bx] === "c") return null;
  // the rows: down to the lot's south edge, whatever the studio
  const H = Math.max(l0.height, LOT.z1 + by);
  const W = l0.width;
  const pad = (rows: string[], n: number, ch: string) => [
    ...rows,
    ...Array.from({ length: Math.max(0, n - rows.length) }, () => ch.repeat(rows[0]?.length ?? W)),
  ];
  const rows = pad(l0.tiles, H, " ").map((r) => [...r]);
  stampLot(rows, bx, by);
  const level: LevelDef = {
    ...l0,
    height: H,
    tiles: rows.map((r) => r.join("")),
    hWalls: pad(l0.hWalls, H + 1, "."),
    vWalls: pad(l0.vWalls, H, "."),
    ...(l0.hBacks ? { hBacks: pad(l0.hBacks, H + 1, ".") } : {}),
    ...(l0.vBacks ? { vBacks: pad(l0.vBacks, H, ".") } : {}),
    areas: l0.areas.map((a) =>
      a.key === "lot" ? { ...a, x: LOT.x0 + bx, y: LOT.z0 + by, w: -LOT.x0, h: LOT.z1 - LOT.z0 } : a,
    ),
  };
  const next = { ...map, levels: (map.levels ?? []).map((x) => (x.index === 0 ? level : x)) };

  const moved = new Map<string, WorldObjectDef>();
  const onGround = (o: WorldObjectDef) => objLevel(o, map) === 0;
  // the lamp posts: onto the islands, reaching over the aisles
  for (const [i, m] of l.lamps.entries()) {
    const o = objects.find((x) => x.id === `lamp-post-${i}`);
    if (!o || !onGround(o)) continue;
    moved.set(o.id, { ...o, x: Math.floor(m.x) + bx, y: Math.floor(m.z) + by, rot: m.rot });
  }
  // the cars on the lot (their middles; the building's coords)
  const middle = (o: WorldObjectDef) => {
    const { w, h } = placedFootprint(o);
    return { x: o.x + w / 2 + (Number(o.props?.dx) || 0) - bx, z: o.y + h / 2 + (Number(o.props?.dz) || 0) - by };
  };
  const square = (o: WorldObjectDef, c: { x: number; z: number; dir: number }) => {
    const at = bayPlace(c, bx, by);
    const props: Record<string, unknown> = { ...(o.props ?? {}), dx: at.dx, dz: at.dz };
    delete props.a;
    delete props.hy;
    delete props.parkedAt;
    moved.set(o.id, { ...o, x: at.x, y: at.y, rot: at.rot, props });
  };
  const seededOf = (id: string) => l.cars[Number(/^car-(\d+)$/.exec(id)?.[1] ?? -1)];
  const bayOf = (c: { x: number; z: number }) => l.bays.findIndex((b) => b.x === c.x && Math.abs(b.z - c.z) < 1);
  // (every seeded car's bay kept for it, wherever it is now: the tow brings it back there)
  const taken = new Set(l.cars.map(bayOf));
  const parked = objects.filter((o) => {
    if (o.kind !== "car" || !onGround(o) || o.props?.driven || o.props?.home) return false;
    const c = middle(o);
    return c.x > LOT.x0 && c.x < LOT.x1 && c.z > LOT.z0 && c.z < LOT.z1;
  });
  for (const o of parked) {
    const c = seededOf(o.id);
    if (c) square(o, c);
  }
  for (const o of parked) {
    if (seededOf(o.id)) continue;
    const at = middle(o);
    let best = -1;
    for (const [i, b] of l.bays.entries())
      if (
        b.kind === "plain" &&
        !taken.has(i) &&
        (best < 0 || Math.hypot(b.x - at.x, b.z - at.z) < Math.hypot(l.bays[best].x - at.x, l.bays[best].z - at.z))
      )
        best = i;
    if (best < 0) continue;
    taken.add(best);
    square(o, l.bays[best]);
  }
  return { map: next, objects: objects.map((o) => moved.get(o.id) ?? o), moved: [...moved.values()] };
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
  return { map: upgradeGround(map) ?? map, add, moved: studio.moved };
}
