import { entry, footprint, type WorldObjectDef } from "./catalog.ts";
import { doorEdge } from "./grid.ts";
import type { Point } from "./iso.ts";
import {
  type AreaDef,
  type AreaKind,
  EDGE_CHARS,
  type Edge,
  edgeAt,
  emptyEdges,
  FLOORS,
  holdsItems,
  isFloor,
  isOuterEdge,
  isTheme,
  isWallEdge,
  isWindow,
  type MapDef,
  NO_WALL,
  setEdge,
  type Theme,
  tileAt,
  VOID,
  type WallMat,
} from "./map.ts";

// Per-space layouts: the map is data (saved in Yondra), not code. Builders
// paint floors (tiles) and walls (tile edges), draw rooms, resize the map.
// Every rule here is shared by the client (previews) and the world-server
// (authority).

export interface Layout {
  version?: 2;
  width: number;
  height: number;
  tiles: string[];
  hWalls?: string[]; // v2 (absent in v1 layouts: walls were "#" tiles)
  vWalls?: string[];
  areas: AreaDef[];
  spawn: Point;
  theme?: Theme;
}

export const MAP_MIN = 16;
export const MAP_MAX = 96;
export const MAP_SIZES = [
  { key: "S", width: 32, height: 24 },
  { key: "M", width: 48, height: 36 },
  { key: "L", width: 64, height: 48 },
  { key: "XL", width: 80, height: 60 },
  { key: "XXL", width: 96, height: 72 },
] as const;
// floors (and VOID = no floor) are painted on tiles; walls on edges
export const PAINT_CHARS = [VOID, ...Object.keys(FLOORS)] as const;
export const ROOM_KINDS: AreaKind[] = ["private", "open", "booth"];

export function layoutFromMap(map: MapDef): Layout {
  return {
    version: 2,
    width: map.width,
    height: map.height,
    tiles: [...map.tiles],
    hWalls: [...map.hWalls],
    vWalls: [...map.vWalls],
    areas: map.areas.map((a) => ({ ...a })),
    spawn: { ...map.spawn },
    theme: map.theme ?? "clouds",
  };
}

// A v2 layout as a map (v1 layouts go through convertV1 first).
export function mapFromLayout(key: string, name: string, l: Layout): MapDef {
  const edges = l.hWalls && l.vWalls ? { hWalls: [...l.hWalls], vWalls: [...l.vWalls] } : emptyEdges(l.width, l.height);
  return {
    key,
    name,
    width: l.width,
    height: l.height,
    tiles: [...l.tiles],
    ...edges,
    areas: l.areas.map((a) => ({ ...a })),
    spawn: { ...l.spawn },
    objects: [],
    theme: isTheme(l.theme) ? l.theme : "clouds",
  };
}

// Shape check for layouts coming from storage or clients (v1 or v2).
export function validLayout(l: unknown): l is Layout {
  if (!l || typeof l !== "object") return false;
  const x = l as Layout;
  if (!Number.isInteger(x.width) || !Number.isInteger(x.height)) return false;
  if (x.width < MAP_MIN || x.width > MAP_MAX || x.height < MAP_MIN || x.height > MAP_MAX) return false;
  if (!Array.isArray(x.tiles) || x.tiles.length !== x.height) return false;
  const v2 = Array.isArray(x.hWalls) || Array.isArray(x.vWalls);
  const ok = new Set<string>(v2 ? PAINT_CHARS : [...PAINT_CHARS, "#"]);
  for (const row of x.tiles) {
    if (typeof row !== "string" || row.length !== x.width) return false;
    for (const ch of row) if (!ok.has(ch)) return false;
  }
  if (v2) {
    const edge = new Set<string>(EDGE_CHARS);
    const rows = (r: unknown, n: number, w: number) =>
      Array.isArray(r) &&
      r.length === n &&
      r.every((s) => typeof s === "string" && s.length === w && [...s].every((c) => edge.has(c)));
    if (!rows(x.hWalls, x.height + 1, x.width) || !rows(x.vWalls, x.height, x.width + 1)) return false;
  }
  if (x.theme !== undefined && !isTheme(x.theme)) return false;
  if (!Array.isArray(x.areas) || x.areas.length > 200) return false;
  if (!x.spawn || !isFloor(x.tiles[Math.floor(x.spawn.y)]?.[Math.floor(x.spawn.x)] ?? VOID)) return false;
  return true;
}

function setTile(tiles: string[], x: number, y: number, ch: string) {
  const row = tiles[y];
  tiles[y] = row.slice(0, x) + ch + row.slice(x + 1);
}

// ── floors ─────────────────────────────────────────────────────────────────
// Why a tile can't be painted (null = fine). Floors may go anywhere; taking a
// floor away (VOID) may not leave furniture, people, the arrival point or a
// wall item in mid-air.
export function paintBlocker(
  map: MapDef,
  objects: WorldObjectDef[],
  bodies: Point[],
  x: number,
  y: number,
  ch: string,
): string | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return "outside the map";
  if (!(PAINT_CHARS as readonly string[]).includes(ch)) return "unknown tile";
  if (isFloor(ch)) return null;
  if (Math.floor(map.spawn.x) === x && Math.floor(map.spawn.y) === y) return "that's where people arrive";
  if (bodies.some((b) => Math.floor(b.x) === x && Math.floor(b.y) === y)) return "someone is standing there";
  for (const o of objects) {
    const e = entry(o.kind);
    if (o.kind === "door") continue;
    const { w, h } = footprint(o.kind, e.wall ? 0 : (o.rot ?? 0));
    if (x >= o.x && x < o.x + w && y >= o.y && y < o.y + h) return `${e.label} is there`;
  }
  return null;
}

export function applyPaint(map: MapDef, cells: { x: number; y: number; ch: string }[]): MapDef {
  const tiles = [...map.tiles];
  for (const c of cells) setTile(tiles, c.x, c.y, c.ch);
  return { ...map, tiles };
}

// ── walls ──────────────────────────────────────────────────────────────────
function inMap(map: MapDef, e: Edge): boolean {
  return e.dir === "h"
    ? e.x >= 0 && e.x < map.width && e.y >= 0 && e.y <= map.height
    : e.y >= 0 && e.y < map.height && e.x >= 0 && e.x <= map.width;
}

// The two tiles an edge separates.
export function edgeSides(e: Edge): [[number, number], [number, number]] {
  return e.dir === "h"
    ? [
        [e.x, e.y - 1],
        [e.x, e.y],
      ]
    : [
        [e.x - 1, e.y],
        [e.x, e.y],
      ];
}

function covers(o: WorldObjectDef, x: number, y: number): boolean {
  const e = entry(o.kind);
  const { w, h } = footprint(o.kind, e.wall ? 0 : (o.rot ?? 0));
  return x >= o.x && x < o.x + w && y >= o.y && y < o.y + h;
}

// Why a wall (or no wall) can't go on an edge (null = fine): never through a
// piece of furniture, never over a door, never away from under a hanging board;
// windows only in outer walls.
export function edgeBlocker(map: MapDef, objects: WorldObjectDef[], e: Edge, ch: string): string | null {
  if (!inMap(map, e)) return "outside the map";
  if (!(EDGE_CHARS as readonly string[]).includes(ch)) return "unknown wall";
  const [a, b] = edgeSides(e);
  for (const o of objects) {
    if (o.kind === "door") {
      const d = doorEdge(o);
      if (isWallEdge(ch) && d.dir === e.dir && d.x === e.x && d.y === e.y) return "a door is there";
      continue;
    }
    const ent = entry(o.kind);
    if (ent.wall) {
      // boards hang on the north edge of their tiles
      if (!holdsItems(ch) && e.dir === "h" && covers(o, e.x, e.y) && e.y === o.y)
        return `${ent.label} hangs on that wall`;
      continue;
    }
    if (isWallEdge(ch) && covers(o, a[0], a[1]) && covers(o, b[0], b[1])) return `${ent.label} is in the way`;
  }
  if (isWindow(ch) && !isOuterEdge(map, e)) return "windows go in outer walls";
  return null;
}

export function applyEdges(map: MapDef, edges: (Edge & { ch: string })[]): MapDef {
  const next = { ...map, hWalls: [...map.hWalls], vWalls: [...map.vWalls] };
  for (const e of edges) setEdge(next, e, e.ch);
  return next;
}

// ── size ───────────────────────────────────────────────────────────────────
// Resize anchored at the top-left: new space is empty (void, no walls),
// anything outside is cut. Areas are clipped or dropped; the spawn moves inside.
export function resizeMap(map: MapDef, width: number, height: number): MapDef {
  const w = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(width)));
  const h = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(height)));
  const fit = (rows: string[], n: number, len: number) =>
    Array.from({ length: n }, (_, y) => (rows[y] ?? "").slice(0, len).padEnd(len, NO_WALL));
  const tiles: string[] = [];
  for (let y = 0; y < h; y++) tiles.push((y < map.height ? map.tiles[y].slice(0, w) : "").padEnd(w, VOID));
  const areas = map.areas
    .map((a) => ({ ...a, w: Math.min(a.w, w - a.x), h: Math.min(a.h, h - a.y) }))
    .filter((a) => a.w > 0 && a.h > 0 && a.x < w && a.y < h);
  const next: MapDef = {
    ...map,
    width: w,
    height: h,
    tiles,
    hWalls: fit(map.hWalls, h + 1, w),
    vWalls: fit(map.vWalls, h, w + 1),
    areas,
  };
  if (!isFloor(tileAt(next, Math.floor(map.spawn.x), Math.floor(map.spawn.y))))
    next.spawn = firstFloor(next) ?? { x: 1.5, y: 1.5 };
  return next;
}

export function firstFloor(map: MapDef): Point | null {
  const cx = map.width / 2;
  const cy = map.height / 2;
  let best: Point | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (isFloor(tileAt(map, x, y))) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < bestD) {
          bestD = d;
          best = { x: x + 0.5, y: y + 0.5 };
        }
      }
  return best;
}

// A ring of walls around a rectangle of tiles (on its outer edges).
function ring(x: number, y: number, w: number, h: number): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i < w; i++) out.push({ x: x + i, y, dir: "h" }, { x: x + i, y: y + h, dir: "h" });
  for (let j = 0; j < h; j++) out.push({ x, y: y + j, dir: "v" }, { x: x + w, y: y + j, dir: "v" });
  return out;
}

// A fresh, empty studio: one big room, walls along the map's border.
export function blankMap(key: string, name: string, width: number, height: number): MapDef {
  const w = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(width)));
  const h = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(height)));
  const map: MapDef = {
    key,
    name,
    width: w,
    height: h,
    tiles: Array.from({ length: h }, () => ".".repeat(w)),
    ...emptyEdges(w, h),
    areas: [{ key: "main", name: "Studio", kind: "open", x: 0, y: 0, w, h }],
    spawn: { x: Math.floor(w / 2) + 0.5, y: h - 2.5 },
    objects: [],
  };
  for (const e of ring(0, 0, w, h)) setEdge(map, e, "p");
  return map;
}

export interface RoomSpec {
  key: string;
  name: string;
  kind: AreaKind;
  x: number;
  y: number;
  w: number;
  h: number;
  ownerId: number | null;
  ownerName: string | null;
  walls: boolean;
  floor?: string;
  wall?: WallMat; // wall material (default: foam for booths, plaster otherwise)
}

// A room (an area) and, optionally, walls on the edges around it with a
// doorway in the middle of the bottom wall (the top one at the map's edge).
// Returns where the door goes: the edge, as a door object's x, y, rot.
export function addRoom(
  map: MapDef,
  objects: WorldObjectDef[],
  _bodies: Point[],
  r: RoomSpec,
): { map: MapDef; door: { x: number; y: number; rot: 0 | 1 } | null } | string {
  if (r.w < 2 || r.h < 2) return "rooms need at least 2×2 tiles";
  if (r.x < 0 || r.y < 0 || r.x + r.w > map.width || r.y + r.h > map.height) return "the room doesn't fit in the map";
  if (map.areas.some((a) => a.key === r.key)) return "a room with that name exists";
  const floor = r.floor && isFloor(r.floor) ? r.floor : null;
  const cells: { x: number; y: number; ch: string }[] = [];
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const t = tileAt(map, x, y);
      if (floor && t !== floor) cells.push({ x, y, ch: floor });
      else if (!isFloor(t)) cells.push({ x, y, ch: floor ?? "." });
    }
  let next = applyPaint(map, cells);
  let door: { x: number; y: number; rot: 0 | 1 } | null = null;
  if (r.walls) {
    const mat = r.wall ?? (r.kind === "booth" ? "f" : "p");
    const dx = r.x + Math.floor(r.w / 2);
    // the doorway: bottom wall, or the top one when the room sits on the map's bottom edge
    const dy = r.y + r.h < map.height ? r.y + r.h : r.y;
    const walls: (Edge & { ch: string })[] = [];
    for (const e of ring(r.x, r.y, r.w, r.h)) {
      if (e.dir === "h" && e.x === dx && e.y === dy) continue;
      if (isWallEdge(edgeAt(next, e)) && edgeAt(next, e) === mat) continue;
      const why = edgeBlocker(next, objects, e, mat);
      if (why) return `can't build a wall there: ${why}`;
      walls.push({ ...e, ch: mat });
    }
    next = applyEdges(next, walls);
    // keep the doorway open even if a wall was there
    next = applyEdges(next, [{ x: dx, y: dy, dir: "h", ch: NO_WALL }]);
    door = { x: dx, y: dy, rot: 0 };
  }
  const area: AreaDef = {
    key: r.key,
    name: r.name.slice(0, 40),
    kind: r.kind,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    priority: 3,
    ownerId: r.ownerId,
    ownerName: r.ownerName,
  };
  next.areas = [...next.areas, area];
  return { map: next, door };
}

// Repaint the walls around a room in another material (keeps windows).
export function setRoomWalls(map: MapDef, key: string, mat: WallMat): MapDef {
  const a = map.areas.find((x) => x.key === key);
  if (!a) return map;
  const edges: (Edge & { ch: string })[] = [];
  for (const e of ring(a.x, a.y, a.w, a.h)) {
    const ch = edgeAt(map, e);
    if (!isWallEdge(ch) || ch === "h") continue;
    edges.push({ ...e, ch: isWindow(ch) && mat !== "g" ? mat.toUpperCase() : mat });
  }
  return applyEdges(map, edges);
}

export function roomKey(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "room";
  return `room-${base}`;
}
