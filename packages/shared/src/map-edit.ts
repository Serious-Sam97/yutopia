import { entry, placedFootprint, type WorldObjectDef } from "./catalog.ts";
import { hangOf, hangTiles, WQ, wallSpan } from "./hang.ts";
import type { Point } from "./iso.ts";
import {
  type AreaDef,
  type AreaKind,
  backAt,
  EDGE_CHARS,
  type Edge,
  edgeAt,
  emptyEdges,
  FACE_MATS,
  FLOORS,
  hasBacks,
  holdsItems,
  isFacedWall,
  isFloor,
  isTheme,
  isWallEdge,
  isWindow,
  type MapDef,
  NO_WALL,
  setBack,
  setEdge,
  type Theme,
  tileAt,
  VOID,
  type WallMat,
} from "./map.ts";
import { edgeKey, isDoorKind, isOpening, openingEdges, wallCuts, wallTakes } from "./openings.ts";

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
  hBacks?: string[]; // the walls' other faces where they differ (map.ts: two faces)
  vBacks?: string[];
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
    ...(hasBacks(map) ? backRows(map) : {}),
    areas: map.areas.map((a) => ({ ...a })),
    spawn: { ...map.spawn },
    theme: map.theme ?? "clouds",
  };
}

// The back faces' rows, full size (as long as the walls' rows).
function backRows(map: { hWalls: string[]; vWalls: string[]; hBacks?: string[]; vBacks?: string[] }): {
  hBacks: string[];
  vBacks: string[];
} {
  const fit = (walls: string[], backs?: string[]) =>
    walls.map((r, y) => (backs?.[y] ?? "").slice(0, r.length).padEnd(r.length, NO_WALL));
  return { hBacks: fit(map.hWalls, map.hBacks), vBacks: fit(map.vWalls, map.vBacks) };
}

// A v2 layout as a map (v1 layouts go through convertV1 first).
export function mapFromLayout(key: string, name: string, l: Layout): MapDef {
  const edges = l.hWalls && l.vWalls ? { hWalls: [...l.hWalls], vWalls: [...l.vWalls] } : emptyEdges(l.width, l.height);
  const backs = l.hWalls && l.vWalls && (l.hBacks || l.vBacks) ? backRows({ ...edges, ...l }) : {};
  return {
    key,
    name,
    width: l.width,
    height: l.height,
    tiles: [...l.tiles],
    ...edges,
    ...backs,
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
    const back = new Set<string>([NO_WALL, ...FACE_MATS]);
    const backs = (r: unknown, n: number, w: number) =>
      r === undefined ||
      (Array.isArray(r) &&
        r.length === n &&
        r.every((s) => typeof s === "string" && s.length === w && [...s].every((c) => back.has(c))));
    if (!backs(x.hBacks, x.height + 1, x.width) || !backs(x.vBacks, x.height, x.width + 1)) return false;
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
    if (isOpening(o.kind)) {
      // a door opens onto floor on both sides
      if (isDoorKind(o.kind) && openingEdges(o).some((d) => edgeSides(d).some(([tx, ty]) => tx === x && ty === y)))
        return "a door opens onto it";
      continue;
    }
    if (e.wall) {
      if (hangTiles(o).some(([tx, ty]) => tx === x && ty === y)) return `${e.label} hangs there`;
      continue;
    }
    const { w, h } = placedFootprint(o);
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
  const { w, h } = placedFootprint(o);
  return x >= o.x && x < o.x + w && y >= o.y && y < o.y + h;
}

// Why a wall (or no wall) can't go on an edge (null = fine): never through a
// piece of furniture, never away from under a hanging board or from round a
// door or window (repainting it is fine, if the new wall takes it); no
// windows painted on (older saves' were; openings.ts turns them into things).
export function edgeBlocker(map: MapDef, objects: WorldObjectDef[], e: Edge, ch: string): string | null {
  if (!inMap(map, e)) return "outside the map";
  if (!(EDGE_CHARS as readonly string[]).includes(ch)) return "unknown wall";
  const [a, b] = edgeSides(e);
  const cut = wallCuts(objects).get(edgeKey(e));
  if (cut && !wallTakes(cut.kind, ch))
    return isDoorKind(cut.kind) ? "a door is in that wall" : "a window is in that wall";
  for (const o of objects) {
    if (isOpening(o.kind)) continue;
    const ent = entry(o.kind);
    if (ent.wall) {
      // never away from under something hanging on it (either face)
      if (!holdsItems(ch) && wallSpan(o).some((s) => s.dir === e.dir && s.x === e.x && s.y === e.y))
        return `${ent.label} hangs on that wall`;
      // nor a wall built across one
      if (isWallEdge(ch) && hangCrosses(o, e)) return `${ent.label} hangs across there`;
      continue;
    }
    if (isWallEdge(ch) && covers(o, a[0], a[1]) && covers(o, b[0], b[1])) return `${ent.label} is in the way`;
  }
  // (windows are things in a wall now, openings.ts: no painting them on)
  if (isWindow(ch)) return "windows go in from the catalog now";
  return null;
}

// Does a wall on edge `e` run across a wall item (meet its face somewhere along it)?
function hangCrosses(o: WorldObjectDef, e: Edge): boolean {
  const h = hangOf(o);
  if (e.dir === h.dir) return false;
  const back = h.side > 0 ? h.line : h.line - 1;
  const [p, q] = h.dir === "h" ? [e.x, e.y] : [e.y, e.x];
  return q === back && p * WQ > h.u0 && p * WQ < h.u1;
}

// An edit of one edge: `ch` the wall it gets; `side` (a material on a wall
// that's there): paint only that face (+1: its +y / +x face, −1 the other).
export type EdgeEdit = Edge & { ch: string; side?: number };

export function applyEdges(map: MapDef, edges: EdgeEdit[]): MapDef {
  const next = {
    ...map,
    hWalls: [...map.hWalls],
    vWalls: [...map.vWalls],
    hBacks: map.hBacks && [...map.hBacks],
    vBacks: map.vBacks && [...map.vBacks],
  };
  for (const e of edges) {
    const cur = edgeAt(next, e);
    const front = isFacedWall(cur) ? cur.toLowerCase() : null;
    const back = backAt(next, e) === NO_WALL ? front : backAt(next, e);
    if (e.side && front && FACE_MATS.includes(e.ch) && e.ch.length === 1) {
      // one face only
      if (e.side > 0) {
        setEdge(next, e, isWindow(cur) ? e.ch.toUpperCase() : e.ch);
        setBack(next, e, back === e.ch ? NO_WALL : (back ?? NO_WALL));
      } else setBack(next, e, e.ch === front ? NO_WALL : e.ch);
      continue;
    }
    setEdge(next, e, e.ch);
    // still a two-faced wall (a window put in, the front repainted): the back keeps its look
    const keep = front && isFacedWall(e.ch) ? back : null;
    setBack(next, e, keep && keep !== e.ch.toLowerCase() ? keep : NO_WALL);
  }
  if (next.hBacks && !hasBacks(next)) {
    next.hBacks = undefined;
    next.vBacks = undefined;
  }
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
    hBacks: map.hBacks && fit(map.hBacks, h + 1, w),
    vBacks: map.vBacks && fit(map.vBacks, h, w + 1),
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

// A ring of walls around a rectangle of tiles (on its outer edges); `side`:
// the face looking into it.
function ring(x: number, y: number, w: number, h: number): (Edge & { side: 1 | -1 })[] {
  const out: (Edge & { side: 1 | -1 })[] = [];
  for (let i = 0; i < w; i++) out.push({ x: x + i, y, dir: "h", side: 1 }, { x: x + i, y: y + h, dir: "h", side: -1 });
  for (let j = 0; j < h; j++) out.push({ x, y: y + j, dir: "v", side: 1 }, { x: x + w, y: y + j, dir: "v", side: -1 });
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

// A room (an area) and, optionally, walls on the edges around it and a door
// in the middle of the bottom wall (the top one at the map's edge). Returns
// where the door goes: the edge, as a door object's x, y, rot.
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
    const walls: EdgeEdit[] = [];
    for (const e of ring(r.x, r.y, r.w, r.h)) {
      const cur = edgeAt(next, e);
      // a wall that's there (a neighbour's): only its face on this side changes
      if (isFacedWall(cur) && FACE_MATS.includes(mat)) {
        walls.push({ ...e, ch: mat });
        continue;
      }
      if (isWallEdge(cur) && cur === mat) continue;
      const why = edgeBlocker(next, objects, e, mat);
      if (why) return `can't build a wall there: ${why}`;
      walls.push({ dir: e.dir, x: e.x, y: e.y, ch: mat });
    }
    next = applyEdges(next, walls);
    // (a door or window there already: no second one)
    if (!wallCuts(objects).has(edgeKey({ dir: "h", x: dx, y: dy }))) door = { x: dx, y: dy, rot: 0 };
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

// Repaint the walls around a room in another material: the faces looking into
// it (the room next door keeps its side), windows kept. Glass is the whole wall
// (not where a window is: those walls keep theirs).
export function setRoomWalls(map: MapDef, key: string, mat: WallMat, objects: WorldObjectDef[] = []): MapDef {
  const a = map.areas.find((x) => x.key === key);
  if (!a) return map;
  const cuts = wallCuts(objects);
  const edges: EdgeEdit[] = [];
  for (const e of ring(a.x, a.y, a.w, a.h)) {
    const ch = edgeAt(map, e);
    if (!isWallEdge(ch) || ch === "h") continue;
    const cut = cuts.get(edgeKey(e));
    if (cut && !wallTakes(cut.kind, mat)) continue;
    if (mat !== "g" && isFacedWall(ch)) edges.push({ ...e, ch: mat });
    else edges.push({ dir: e.dir, x: e.x, y: e.y, ch: isWindow(ch) && mat !== "g" ? mat.toUpperCase() : mat });
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
