import { entry, footprint, type WorldObjectDef } from "./catalog.ts";
import { doorRot } from "./grid.ts";
import type { Point } from "./iso.ts";
import { type AreaDef, type AreaKind, FLOORS, isFloor, type MapDef, tileAt, VOID, WALL } from "./map.ts";

// Per-space layouts: the map is data (saved in Yondra), not code. Builders
// paint walls/floors, draw rooms, resize the map. Every rule here is shared by
// the client (previews) and the world-server (authority).

export interface Layout {
  width: number;
  height: number;
  tiles: string[];
  areas: AreaDef[];
  spawn: Point;
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
export const PAINT_CHARS = [WALL, VOID, ...Object.keys(FLOORS)] as const;
export const ROOM_KINDS: AreaKind[] = ["private", "open", "booth"];

export function layoutFromMap(map: MapDef): Layout {
  return {
    width: map.width,
    height: map.height,
    tiles: [...map.tiles],
    areas: map.areas.map((a) => ({ ...a })),
    spawn: { ...map.spawn },
  };
}

export function mapFromLayout(key: string, name: string, l: Layout): MapDef {
  return {
    key,
    name,
    width: l.width,
    height: l.height,
    tiles: [...l.tiles],
    areas: l.areas.map((a) => ({ ...a })),
    spawn: { ...l.spawn },
    objects: [],
  };
}

// Shape check for layouts coming from storage or clients.
export function validLayout(l: unknown): l is Layout {
  if (!l || typeof l !== "object") return false;
  const x = l as Layout;
  if (!Number.isInteger(x.width) || !Number.isInteger(x.height)) return false;
  if (x.width < MAP_MIN || x.width > MAP_MAX || x.height < MAP_MIN || x.height > MAP_MAX) return false;
  if (!Array.isArray(x.tiles) || x.tiles.length !== x.height) return false;
  const ok = new Set<string>(PAINT_CHARS);
  for (const row of x.tiles) {
    if (typeof row !== "string" || row.length !== x.width) return false;
    for (const ch of row) if (!ok.has(ch)) return false;
  }
  if (!Array.isArray(x.areas) || x.areas.length > 200) return false;
  if (!x.spawn || !isFloor(x.tiles[Math.floor(x.spawn.y)]?.[Math.floor(x.spawn.x)] ?? VOID)) return false;
  return true;
}

function setTile(tiles: string[], x: number, y: number, ch: string) {
  const row = tiles[y];
  tiles[y] = row.slice(0, x) + ch + row.slice(x + 1);
}

// Why a tile can't be painted (null = fine). Floors may go under furniture;
// walls/void may not cover furniture, people, doors, the spawn, or the wall a
// board hangs on.
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
  // boards, screens, panels hang on a wall: keep that wall
  if (ch !== WALL) {
    for (const o of objects) {
      const e = entry(o.kind);
      if (e.wall && y === o.y - 1 && x >= o.x && x < o.x + footprint(o.kind, 0).w)
        return `${e.label} hangs on that wall`;
    }
  }
  if (isFloor(ch)) return null;
  if (Math.floor(map.spawn.x) === x && Math.floor(map.spawn.y) === y) return "that's where people arrive";
  if (bodies.some((b) => Math.floor(b.x) === x && Math.floor(b.y) === y)) return "someone is standing there";
  for (const o of objects) {
    const e = entry(o.kind);
    const { w, h } = footprint(o.kind, e.wall ? 0 : (o.rot ?? 0));
    if (e.wall) continue;
    if (x >= o.x && x < o.x + w && y >= o.y && y < o.y + h) return `${e.label} is there`;
  }
  return null;
}

export function applyPaint(map: MapDef, cells: { x: number; y: number; ch: string }[]): MapDef {
  const tiles = [...map.tiles];
  for (const c of cells) setTile(tiles, c.x, c.y, c.ch);
  return { ...map, tiles };
}

// Resize anchored at the top-left: new space is empty (void), anything outside
// is cut. Areas are clipped or dropped; the spawn moves inside if needed.
export function resizeMap(map: MapDef, width: number, height: number): MapDef {
  const w = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(width)));
  const h = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(height)));
  const tiles: string[] = [];
  for (let y = 0; y < h; y++) {
    const row = y < map.height ? map.tiles[y].slice(0, w) : "";
    tiles.push(row.padEnd(w, VOID));
  }
  const areas = map.areas
    .map((a) => ({ ...a, w: Math.min(a.w, w - a.x), h: Math.min(a.h, h - a.y) }))
    .filter((a) => a.w > 0 && a.h > 0 && a.x < w && a.y < h);
  const next: MapDef = { ...map, width: w, height: h, tiles, areas };
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

// A fresh, empty studio: one big room with walls around it.
export function blankMap(key: string, name: string, width: number, height: number): MapDef {
  const w = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(width)));
  const h = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(height)));
  const tiles: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) row += x === 0 || y === 0 || x === w - 1 || y === h - 1 ? WALL : ".";
    tiles.push(row);
  }
  return {
    key,
    name,
    width: w,
    height: h,
    tiles,
    areas: [{ key: "main", name: "Studio", kind: "open", x: 1, y: 1, w: w - 2, h: h - 2 }],
    spawn: { x: Math.floor(w / 2) + 0.5, y: h - 3.5 },
    objects: [],
  };
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
}

// A room (an area) and, optionally, its walls: a ring just outside the rect
// with a doorway in the middle of the bottom wall. Returns where the door goes.
export function addRoom(
  map: MapDef,
  objects: WorldObjectDef[],
  bodies: Point[],
  r: RoomSpec,
): { map: MapDef; door: { x: number; y: number; rot: 0 | 1 } | null } | string {
  if (r.w < 2 || r.h < 2) return "rooms need at least 2×2 tiles";
  const x0 = r.walls ? r.x - 1 : r.x;
  const y0 = r.walls ? r.y - 1 : r.y;
  const x1 = r.walls ? r.x + r.w : r.x + r.w - 1;
  const y1 = r.walls ? r.y + r.h : r.y + r.h - 1;
  if (x0 < 0 || y0 < 0 || x1 >= map.width || y1 >= map.height) return "the room doesn't fit in the map";
  if (map.areas.some((a) => a.key === r.key)) return "a room with that name exists";
  const floor = r.floor && isFloor(r.floor) ? r.floor : null;
  const cells: { x: number; y: number; ch: string }[] = [];
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const t = tileAt(map, x, y);
      if (floor && t !== floor) cells.push({ x, y, ch: floor });
      else if (!isFloor(t)) cells.push({ x, y, ch: floor ?? "." });
    }
  let door: { x: number; y: number; rot: 0 | 1 } | null = null;
  if (r.walls) {
    const dx = r.x + Math.floor(r.w / 2);
    const dy = r.y + r.h;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const ring = x === x0 || x === x1 || y === y0 || y === y1;
        if (!ring) continue;
        if (x === dx && y === dy) {
          cells.push({ x, y, ch: floor ?? "." });
          continue;
        }
        if (tileAt(map, x, y) === WALL) continue;
        const why = paintBlocker(map, objects, bodies, x, y, WALL);
        if (why) return `can't build a wall at ${x},${y}: ${why}`;
        cells.push({ x, y, ch: WALL });
      }
    door = { x: dx, y: dy, rot: 0 };
  }
  const next = applyPaint(map, cells);
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
  if (door && doorRot(next, door.x, door.y) === null) door = null;
  return { map: next, door };
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
