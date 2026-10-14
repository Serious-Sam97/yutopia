import { entry, footprint, type WorldObjectDef, wallRot } from "./catalog.ts";

// How many tiles of wall a wall item covers (0 = not a wall item).
export function entryWallItem(kind: string): number {
  return entry(kind).wall ? footprint(kind, 0).w : 0;
}

// The edges a wall item hangs on, one per tile: the north edges of a row of
// tiles, or (turned) the west edges of a column.
export function wallSpan(o: { kind: string; x: number; y: number; rot?: number }): Edge[] {
  const n = entryWallItem(o.kind);
  const west = wallRot(o.rot) === 3;
  return Array.from({ length: n }, (_, i) =>
    west ? { dir: "v" as const, x: o.x, y: o.y + i } : { dir: "h" as const, x: o.x + i, y: o.y },
  );
}

// Is anything (but `except`) hanging on this edge?
export function hungOn(objects: Iterable<WorldObjectDef>, e: Edge, except?: string): WorldObjectDef | undefined {
  for (const o of objects)
    if (o.id !== except && entry(o.kind).wall && wallSpan(o).some((s) => s.dir === e.dir && s.x === e.x && s.y === e.y))
      return o;
  return undefined;
}

// Floors. Anything not listed (wall/void) is not walkable.
export const FLOORS = {
  ".": "wood",
  ",": "carpet",
  _: "tile",
  "~": "stage",
  ":": "felt",
  x: "grate",
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
}

// What surrounds the studio (chosen per space in build mode).
export const THEMES = ["clouds", "city", "snow"] as const;
export type Theme = (typeof THEMES)[number];
export const isTheme = (t: unknown): t is Theme => typeof t === "string" && (THEMES as readonly string[]).includes(t);

export interface MapDef {
  key: string;
  name: string;
  width: number;
  height: number;
  tiles: string[]; // floor chars or VOID (v1 maps also had WALL tiles)
  hWalls: string[]; // height + 1 rows of width chars
  vWalls: string[]; // height rows of width + 1 chars
  spawn: { x: number; y: number };
  areas: AreaDef[];
  objects: WorldObjectDef[];
  theme?: Theme; // default "clouds"
}

// The wall on the north edge of (x, y) / the west edge of (x, y).
export function hWall(map: MapDef, x: number, y: number): string {
  if (x < 0 || x >= map.width || y < 0 || y > map.height) return NO_WALL;
  return map.hWalls[y]?.[x] ?? NO_WALL;
}
export function vWall(map: MapDef, x: number, y: number): string {
  if (y < 0 || y >= map.height || x < 0 || x > map.width) return NO_WALL;
  return map.vWalls[y]?.[x] ?? NO_WALL;
}
export function edgeAt(map: MapDef, e: Edge): string {
  return e.dir === "h" ? hWall(map, e.x, e.y) : vWall(map, e.x, e.y);
}

// Is there a wall between two side-by-side tiles?
export function wallBetween(map: MapDef, x: number, y: number, nx: number, ny: number): string {
  if (nx === x + 1 && ny === y) return vWall(map, nx, y);
  if (nx === x - 1 && ny === y) return vWall(map, x, y);
  if (ny === y + 1 && nx === x) return hWall(map, x, ny);
  if (ny === y - 1 && nx === x) return hWall(map, x, y);
  return NO_WALL;
}

// An edge on the outside of the building (floor on one side only).
export function isOuterEdge(map: MapDef, e: Edge): boolean {
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

export function setEdge(map: { hWalls: string[]; vWalls: string[] }, e: Edge, ch: string): void {
  const rows = e.dir === "h" ? map.hWalls : map.vWalls;
  const row = rows[e.y];
  if (row === undefined || e.x < 0 || e.x >= row.length) return;
  rows[e.y] = row.slice(0, e.x) + ch + row.slice(e.x + 1);
}

export function tileAt(map: MapDef, x: number, y: number): string {
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
    if (x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h) {
      if (!best || (a.priority ?? 0) > (best.priority ?? 0)) best = a;
    }
  }
  return best;
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
