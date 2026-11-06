import { entry, footprint, type WorldObjectDef } from "./catalog.ts";
import type { Structure } from "./structure/types.ts";

// How many tiles of wall a wall item's drawing is (0 = not a wall item).
export function entryWallItem(kind: string): number {
  return entry(kind).wall ? footprint(kind, 0).w : 0;
}

// Floors. Anything not listed (wall/void) is not walkable.
export const FLOORS = {
  ".": "wood",
  ",": "carpet",
  _: "tile",
  "~": "stage",
  ":": "felt",
  x: "grate",
  // outdoors (the parking lot, levels.ts)
  a: "asphalt",
  c: "concrete",
} as const;
export type FloorChar = keyof typeof FLOORS;
export const WALL = "#"; // v1 maps only (walls were tiles); see convert.ts
export const VOID = " ";

// ── walls on tile edges (map v2) ─────────────────────────────────────────────
// `hWalls[y][x]` is the edge on the north side of tile (x, y) (y = 0..height),
// `vWalls[y][x]` the edge on the west side of tile (x, y) (x = 0..width).
// One char per edge: "." none, a material = a full wall, the material in
// upper case = that wall with a window, "h" = a half wall.
export const NO_WALL = ".";
export const WALL_MATS = {
  p: "plaster",
  w: "walnut",
  f: "foam",
  b: "brick",
  k: "cork",
  g: "glass",
} as const;
export type WallMat = keyof typeof WALL_MATS;
export const HALF_WALL = "h";
export const EDGE_CHARS = [NO_WALL, ...Object.keys(WALL_MATS), "P", "W", "F", "B", "K", HALF_WALL] as const;

export const isWallEdge = (ch: string | undefined): boolean => !!ch && ch !== NO_WALL;
export const isWindow = (ch: string | undefined): boolean => !!ch && "PWFBK".includes(ch) && ch.length === 1;
// what you can't see (or light can't go) through: full opaque walls
export const blocksLight = (ch: string | undefined): boolean => isWallEdge(ch) && ch !== "g" && ch !== HALF_WALL;
// a wall things can hang on (boards, posters): opaque, full height, no window
export const holdsItems = (ch: string | undefined): boolean => blocksLight(ch) && !isWindow(ch);
export const wallMat = (ch: string): WallMat => (ch === HALF_WALL ? "p" : (ch.toLowerCase() as WallMat));

// ── two faces ────────────────────────────────────────────────────────────────
// A full opaque wall (plaster, walnut, foam, brick, cork; with a window or not)
// has two faces, each in its own material: the edge's char is the "front" one
// (the +y face of a wall along x, the +x face of one along y: the faces the iso
// view looked at), `hBacks` / `vBacks` (same shape as hWalls / vWalls) the other
// one — "." (or nothing stored) = the same as the front. Glass and half walls
// are one thing through and through.
export const FACE_MATS = "pwfbk";
export const isFacedWall = (ch: string | undefined): boolean => !!ch && ch.length === 1 && "pwfbkPWFBK".includes(ch);

export type EdgeDir = "h" | "v";
export interface Edge {
  x: number;
  y: number;
  dir: EdgeDir; // h: north edge of (x, y); v: west edge of (x, y)
}

export type AreaKind =
  | "open" // proximity audio
  | "private" // everyone inside hears everyone inside, nobody outside
  | "booth" // private + knock to enter
  | "stage" // heard by the whole space
  | "standup"; // private + standup ritual

export interface AreaDef {
  key: string;
  name: string;
  kind: AreaKind;
  x: number;
  y: number;
  w: number;
  h: number;
  // Smaller, more specific areas win over the room they sit in.
  priority?: number;
  // Rooms can belong to someone: they can lock its doors (only they get in/out).
  ownerId?: number | null;
  ownerName?: string | null;
  // clutter preset (dressing.ts): tidy | lived | busy; none when absent
  dressing?: "tidy" | "lived" | "busy" | null;
  // generated pieces someone took (turned into real objects) or removed
  dressOff?: string[];
  // its outline (the structure's room: the face its walls close round — docs/plan/72 phase 10), in the
  // same frame as x, y; none: the rectangle x, y, w, h is the room
  outline?: [number, number][];
}

/** Is (x, y) in the room — its outline (even-odd), or its rectangle when it has none? */
export function inArea(a: AreaDef, x: number, y: number): boolean {
  if (x < a.x || y < a.y || x >= a.x + a.w || y >= a.y + a.h) {
    if (!a.outline) return false;
  } else if (!a.outline) return true;
  const r = a.outline;
  let n = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < xi + ((y - yi) / (yj - yi)) * (xj - xi)) n++;
  }
  return n % 2 === 1;
}

/** A building's floors as the world has them (structure/view.ts: made from the structure, docs/plan/72
 *  phase 11 — its floors and walls asked of `st`, structure/query.ts) or as a tile map has them
 *  (`TileMap`: the generators', the old saves' — read only to be turned into a structure). */
export interface MapDef {
  key: string;
  name: string;
  /** its extent in cells (a floor's: the cells it was laid out on), from its corner (ox, oy) */
  width: number;
  height: number;
  /** the structure it was made from (a world's: every floor and wall asked of it) */
  st?: Structure;
  spawn: { x: number; y: number };
  areas: AreaDef[];
  objects: WorldObjectDef[];
  // The building (levels.ts): which floor this map is (0 = the ground, STOREY
  // tiles a floor), where its corner sits in the home floor's coords, the
  // building's other floors (on the home map) and, on a view of another floor,
  // which one is home. All absent: a building of one floor, the ground.
  floor?: number;
  ox?: number;
  oy?: number;
  /** its places are the world's (plan 72 phase 6: every map the structure gives, structure/view.ts):
   *  areas, spawn and every x, y asked of it in world metres, its tile rows starting at (ox, oy).
   *  Absent: an older map, its places its own tiles' (a floor's corner at ox, oy in the
   *  building's: levels.ts) — the built-in maps and the old boot's conversions (structure/finish). */
  world?: true;
  home?: number;
  levels?: LevelDef[];
  outdoor?: boolean;
  // where the building's core (its stairs and elevators) stands, in the home
  // floor's coords (building.ts)
  core?: { x: number; y: number };
}

/** The tile rows a tile map's floor is: its floor chars, the walls on its cells' edges. */
export interface TileRows {
  tiles: string[]; // floor chars or VOID (v1 maps also had WALL tiles)
  hWalls: string[]; // height + 1 rows of width chars
  vWalls: string[]; // height rows of width + 1 chars
  // the other face's material where it differs (two faces, above); absent = none
  hBacks?: string[];
  vBacks?: string[];
}

/** A map drawn in tiles (the generators', the built-in maps', the old saves'): turned into a
 *  structure (structure/from-map.ts) before the world reads it. */
export interface TileMap extends MapDef, TileRows {
  levels?: TileLevel[];
}

// One floor of the building other than the home one (levels.ts): a map of its
// own (rooms; a tile map's: its tiles and walls), placed by its corner in the home floor's coords.
export interface LevelDef {
  index: number;
  name: string;
  ox: number;
  oy: number;
  outdoor?: boolean; // open sky (the parking lot): no ceiling, snow falls
  width: number;
  height: number;
  areas: AreaDef[];
  spawn?: { x: number; y: number };
}
/** A tile map's other floor: its rows too. */
export interface TileLevel extends LevelDef, TileRows {}

/** Where a map's tile rows start, in the coordinates its places are in: a world map's corner
 *  (MapDef.world), an older map's own 0, 0. */
export const originOf = (map: { world?: true; ox?: number; oy?: number }): { x: number; y: number } =>
  map.world ? { x: map.ox ?? 0, y: map.oy ?? 0 } : { x: 0, y: 0 };
/** What turns a map's places into the world's: nothing on a world map (MapDef.world), an older
 *  floor's corner on one of those (its places its own tiles'). */
export const worldShift = (map: { world?: true; ox?: number; oy?: number }): { x: number; y: number } =>
  map.world ? { x: 0, y: 0 } : { x: map.ox ?? 0, y: map.oy ?? 0 };
/** The tiles a map spans, in its places' coordinates: [x0, y0, x1, y1) (loop x0 ≤ x < x1). */
export function spanOf(map: { world?: true; ox?: number; oy?: number; width: number; height: number }) {
  const o = originOf(map);
  return { x0: o.x, y0: o.y, x1: o.x + map.width, y1: o.y + map.height };
}

/** Is an edge one of the map's (its places' coordinates)? */
export function edgeInMap(
  map: { world?: true; ox?: number; oy?: number; width: number; height: number },
  e: Edge,
): boolean {
  const { x0, y0, x1, y1 } = spanOf(map);
  return e.dir === "h"
    ? e.x >= x0 && e.x < x1 && e.y >= y0 && e.y <= y1
    : e.y >= y0 && e.y < y1 && e.x >= x0 && e.x <= x1;
}
/** Is a tile one of the map's (its places' coordinates)? */
export function tileInMap(
  map: { world?: true; ox?: number; oy?: number; width: number; height: number },
  x: number,
  y: number,
): boolean {
  const { x0, y0, x1, y1 } = spanOf(map);
  return x >= x0 && y >= y0 && x < x1 && y < y1;
}

// The wall on the north edge of (x, y) / the west edge of (x, y).
export function hWall(map: TileMap, x: number, y: number): string {
  if (map.world) {
    x -= map.ox ?? 0;
    y -= map.oy ?? 0;
  }
  if (x < 0 || x >= map.width || y < 0 || y > map.height) return NO_WALL;
  return map.hWalls[y]?.[x] ?? NO_WALL;
}
export function vWall(map: TileMap, x: number, y: number): string {
  if (map.world) {
    x -= map.ox ?? 0;
    y -= map.oy ?? 0;
  }
  if (y < 0 || y >= map.height || x < 0 || x > map.width) return NO_WALL;
  return map.vWalls[y]?.[x] ?? NO_WALL;
}
export function edgeAt(map: TileMap, e: Edge): string {
  return e.dir === "h" ? hWall(map, e.x, e.y) : vWall(map, e.x, e.y);
}

// The material of one face of a wall (side +1: its +y / +x face), or null when
// it isn't a two-faced wall.
export function faceMat(map: TileMap, e: Edge, side: number): WallMat | null {
  const ch = edgeAt(map, e);
  if (!isFacedWall(ch)) return null;
  if (side > 0) return ch.toLowerCase() as WallMat;
  const b = backAt(map, e);
  return b !== NO_WALL ? (b as WallMat) : (ch.toLowerCase() as WallMat);
}
export function backAt(map: TileMap, e: Edge): string {
  const o = originOf(map);
  const b = (e.dir === "h" ? map.hBacks : map.vBacks)?.[e.y - o.y]?.[e.x - o.x];
  return b && FACE_MATS.includes(b) ? b : NO_WALL;
}

// Is there a wall between two side-by-side tiles?
export function wallBetween(map: TileMap, x: number, y: number, nx: number, ny: number): string {
  if (nx === x + 1 && ny === y) return vWall(map, nx, y);
  if (nx === x - 1 && ny === y) return vWall(map, x, y);
  if (ny === y + 1 && nx === x) return hWall(map, x, ny);
  if (ny === y - 1 && nx === x) return hWall(map, x, y);
  return NO_WALL;
}

// An edge on the outside of the building (floor on one side only).
export function isOuterEdge(map: TileMap, e: Edge): boolean {
  const a = e.dir === "h" ? tileAt(map, e.x, e.y - 1) : tileAt(map, e.x - 1, e.y);
  const b = tileAt(map, e.x, e.y);
  return isFloor(a) !== isFloor(b);
}

// The edge nearest to a point (tile coords, floats): for clicking walls.
export function nearestEdge(x: number, y: number): Edge {
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const dh = Math.min(fy, 1 - fy);
  const dv = Math.min(fx, 1 - fx);
  if (dh <= dv) return { x: Math.floor(x), y: fy < 0.5 ? Math.floor(y) : Math.floor(y) + 1, dir: "h" };
  return { x: fx < 0.5 ? Math.floor(x) : Math.floor(x) + 1, y: Math.floor(y), dir: "v" };
}

export function emptyEdges(width: number, height: number): { hWalls: string[]; vWalls: string[] } {
  return {
    hWalls: Array.from({ length: height + 1 }, () => NO_WALL.repeat(width)),
    vWalls: Array.from({ length: height }, () => NO_WALL.repeat(width + 1)),
  };
}

/** (A world map's edges are world: its corner taken off.) */
export function setEdge(
  map: { hWalls: string[]; vWalls: string[]; world?: true; ox?: number; oy?: number },
  e: Edge,
  ch: string,
): void {
  const o = originOf(map);
  const [x, y] = [e.x - o.x, e.y - o.y];
  const rows = e.dir === "h" ? map.hWalls : map.vWalls;
  const row = rows[y];
  if (row === undefined || x < 0 || x >= row.length) return;
  rows[y] = row.slice(0, x) + ch + row.slice(x + 1);
}

// Set the back face's material ("." = as the front). The rows are made (as
// long as the walls' rows) the first time one is set. (Mutates `map`'s arrays:
// give it copies.)
export function setBack(
  map: {
    hWalls: string[];
    vWalls: string[];
    hBacks?: string[];
    vBacks?: string[];
    world?: true;
    ox?: number;
    oy?: number;
  },
  e0: Edge,
  ch: string,
): void {
  const o = originOf(map);
  const e = { ...e0, x: e0.x - o.x, y: e0.y - o.y };
  const key = e.dir === "h" ? "hBacks" : "vBacks";
  const walls = e.dir === "h" ? map.hWalls : map.vWalls;
  if (!map[key]) {
    if (ch === NO_WALL) return;
    map[key] = walls.map((r) => NO_WALL.repeat(r.length));
  }
  const rows = map[key] as string[];
  const row = (rows[e.y] ?? "").padEnd(walls[e.y]?.length ?? 0, NO_WALL);
  if (e.x < 0 || e.x >= row.length) return;
  rows[e.y] = row.slice(0, e.x) + ch + row.slice(e.x + 1);
}

// Any back face that differs from its front?
export const hasBacks = (map: { hBacks?: string[]; vBacks?: string[] }): boolean =>
  [...(map.hBacks ?? []), ...(map.vBacks ?? [])].some((r) => /[^.]/.test(r));

export function tileAt(map: TileMap, x: number, y: number): string {
  if (map.world) {
    x -= map.ox ?? 0;
    y -= map.oy ?? 0;
  }
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return VOID;
  return map.tiles[y][x] ?? VOID;
}

export function isFloor(ch: string): ch is FloorChar {
  return Object.hasOwn(FLOORS, ch);
}

// Highest-priority area containing the point (tile coords, floats ok).
export function areaAt(map: MapDef, x: number, y: number): AreaDef | null {
  let best: AreaDef | null = null;
  for (const a of map.areas) {
    if (inArea(a, x, y)) {
      if (!best || (a.priority ?? 0) > (best.priority ?? 0)) best = a;
    }
  }
  return best ?? areasBeyond?.(map, x, y) ?? null;
}
// Rooms and places past a floor's own (the Grounds round the ground floor:
// the town's bar, the woods…; docs/plan/27). Set once they're loaded.
let areasBeyond: ((map: MapDef, x: number, y: number) => AreaDef | null) | null = null;
export function setAreasBeyond(f: ((map: MapDef, x: number, y: number) => AreaDef | null) | null): void {
  areasBeyond = f;
}

// Small builder so maps are written as rooms + doors instead of ASCII by hand.
export class MapBuilder {
  private grid: string[][];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.grid = Array.from({ length: height }, () => Array.from({ length: width }, () => VOID));
  }

  // Rectangle including its walls. Walls never overwrite existing floor, so rooms
  // can share walls and later rooms don't punch holes in earlier ones.
  room(x0: number, y0: number, x1: number, y1: number, floor: FloorChar): this {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        if (edge) {
          if (!isFloor(this.grid[y][x])) this.grid[y][x] = WALL;
        } else {
          this.grid[y][x] = floor;
        }
      }
    }
    return this;
  }

  floor(x0: number, y0: number, x1: number, y1: number, floor: FloorChar): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.grid[y][x] = floor;
    return this;
  }

  door(x: number, y: number, floor: FloorChar): this {
    this.grid[y][x] = floor;
    return this;
  }

  build(): string[] {
    return this.grid.map((r) => r.join(""));
  }
}
