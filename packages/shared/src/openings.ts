import { entry, type WorldObjectDef } from "./catalog.ts";
import {
  type AreaDef,
  backAt,
  type Edge,
  type EdgeDir,
  edgeAt,
  HALF_WALL,
  hWall,
  isFloor,
  isWallEdge,
  isWindow,
  type MapDef,
  NO_WALL,
  setBack,
  setEdge,
  tileAt,
  vWall,
} from "./map.ts";

// Doors and windows, Sims-style: things set into a wall. The wall stays a wall
// (its material, both faces) and the opening cuts its own hole through it, the
// whole width of each edge it takes, from z0 to z1 (iso px). Stored like a
// door always was: rot even = edges along x from the north edge of (x, y),
// rot odd = edges along y from the west edge of (x, y); `w` of them (catalog).
// Doors let people through (unless locked for them, grid.ts); windows don't.
// Older saves had doors in a gap in the wall and windows painted on as an
// upper-case wall char: `openingsIntoWalls` turns them into this.

export const isOpening = (kind: string): boolean => !!entry(kind).opening;
// Doors (people go through: archways always, the rest unless locked) and windows.
export const isDoorKind = (kind: string): boolean => entry(kind).opening === "door";
export const isWindowKind = (kind: string): boolean => entry(kind).opening === "window";

// How a door works. leaves: how many it has (a double door and saloon doors
// two; an archway none); slides: a barn door rolls along the wall instead of
// swinging; lockable: saloon doors and archways can't be; a door starts open,
// saloon doors closed (they swing as people pass).
export function doorLeaves(kind: string): number {
  return kind === "archway" ? 0 : kind === "door_double" || kind === "door_saloon" ? 2 : 1;
}
export const doorSlides = (kind: string): boolean => kind === "door_barn";
export const doorLockable = (kind: string): boolean =>
  isDoorKind(kind) && kind !== "door_saloon" && kind !== "archway";
export const doorStartState = (kind: string): string | undefined =>
  kind === "archway" ? undefined : kind === "door_saloon" ? "closed" : "open";

// Shut right now (a closed or locked one nobody's passing through); an archway never.
export function doorShut(o: { kind: string; props?: Record<string, unknown> }): boolean {
  if (!isDoorKind(o.kind) || !doorLeaves(o.kind)) return false;
  const st = String(o.props?.state ?? doorStartState(o.kind));
  return (st === "closed" || st === "locked") && !o.props?.passing;
}
// …and what a shut one does to light (saloon doors are half-height: none)
export const doorBlocksLight = (o: { kind: string; props?: Record<string, unknown> }): boolean =>
  doorShut(o) && o.kind !== "door_saloon";

// The hole each one cuts, px up (the art draws its frame in it: art/items).
// Doors and the windows' tops line up with the doorways (DOOR_Z 88).
const CUTS: Record<string, [number, number]> = {
  door: [0, 88],
  door_double: [0, 88],
  door_studio: [0, 88],
  door_barn: [0, 88],
  door_saloon: [0, 88],
  archway: [0, 98],
  window: [36, 88],
  window_wide: [36, 88],
  window_tall: [12, 100],
  window_round: [38, 78],
  window_arched: [26, 96],
  window_high: [94, 118],
  window_stained: [20, 100],
  window_blinds: [36, 88],
  window_studio: [28, 92],
};
export function openingCut(kind: string): [number, number] {
  return CUTS[kind] ?? (isDoorKind(kind) ? [0, 88] : [36, 88]);
}

export const openingDir = (o: { rot?: number }): EdgeDir => ((o.rot ?? 0) % 2 === 0 ? "h" : "v");

// The edges it takes.
export function openingEdges(o: { kind: string; x: number; y: number; rot?: number }): Edge[] {
  const dir = openingDir(o);
  const n = Math.max(1, entry(o.kind).w);
  return Array.from({ length: n }, (_, i) => (dir === "h" ? { dir, x: o.x + i, y: o.y } : { dir, x: o.x, y: o.y + i }));
}

export const edgeKey = (e: Edge): string => `${e.dir}${e.x},${e.y}`;

// Every opening's hole, by edge: what the walls are drawn (and light passes)
// around. `i` / `n`: which of its edges this is.
export interface WallCut {
  id: string;
  kind: string;
  z0: number;
  z1: number;
  i: number;
  n: number;
}
export function wallCuts(objects: Iterable<WorldObjectDef>): Map<string, WallCut> {
  const out = new Map<string, WallCut>();
  for (const o of objects) {
    if (!isOpening(o.kind)) continue;
    const [z0, z1] = openingCut(o.kind);
    const edges = openingEdges(o);
    for (const [i, e] of edges.entries()) out.set(edgeKey(e), { id: o.id, kind: o.kind, z0, z1, i, n: edges.length });
  }
  return out;
}

// A short signature of all the holes (walls are drawn again when it changes).
export function cutsSig(objects: Iterable<WorldObjectDef>): string {
  return [...wallCuts(objects).entries()]
    .map(([k, c]) => `${k}:${c.z0}-${c.z1}`)
    .sort()
    .join(";");
}

// Can this wall take it? Full walls (any material, either face) take both;
// glass walls take a (glass) door but not a window; half walls neither.
export function wallTakes(kind: string, ch: string | undefined): boolean {
  if (!isWallEdge(ch) || ch === HALF_WALL || isWindow(ch)) return false;
  if (ch === "g") return isDoorKind(kind);
  return true;
}

const sidesOf = (e: Edge): [[number, number], [number, number]] =>
  e.dir === "h"
    ? [
        [e.x, e.y - 1],
        [e.x, e.y],
      ]
    : [
        [e.x - 1, e.y],
        [e.x, e.y],
      ];

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - 1e-6 && b0 < a1 - 1e-6;

// Why it can't go where it is (null = it fits): every edge a wall that takes
// it, a door with floor on both sides (a window: on one at least), no wall
// meeting it between its edges, no other door or window there, nothing
// hanging (either face) where it cuts the wall. `hung`: the wall items on an
// edge (hang.ts), as [z0, z1, label].
export function openingBlocker(
  map: MapDef,
  others: WorldObjectDef[],
  o: WorldObjectDef,
  hung: (e: Edge) => [number, number, string][] = () => [],
): string | null {
  const door = isDoorKind(o.kind);
  const edges = openingEdges(o);
  const [z0, z1] = openingCut(o.kind);
  for (const e of edges) {
    const inMap =
      e.dir === "h"
        ? e.x >= 0 && e.x < map.width && e.y >= 0 && e.y <= map.height
        : e.y >= 0 && e.y < map.height && e.x >= 0 && e.x <= map.width;
    if (!inMap) return "outside the map";
    const ch = edgeAt(map, e);
    if (!isWallEdge(ch)) return door ? "doors go in a wall" : "windows go in a wall";
    if (!wallTakes(o.kind, ch)) return ch === HALF_WALL ? "not in a half wall" : "not in a glass wall";
    const [[ax, ay], [bx, by]] = sidesOf(e);
    const a = isFloor(tileAt(map, ax, ay));
    const b = isFloor(tileAt(map, bx, by));
    if (door ? !(a && b) : !(a || b)) return door ? "a door needs floor on both sides" : "no floor by it";
    for (const [h0, h1, label] of hung(e)) if (overlaps(h0, h1, z0, z1)) return `${label} hangs there`;
  }
  // a wall meeting it where two of its edges join
  for (let i = 1; i < edges.length; i++) {
    const across =
      edges[0].dir === "h"
        ? [vWall(map, o.x + i, o.y - 1), vWall(map, o.x + i, o.y)]
        : [hWall(map, o.x - 1, o.y + i), hWall(map, o.x, o.y + i)];
    if (across.some(isWallEdge)) return "a wall meets it there";
  }
  const mine = new Set(edges.map(edgeKey));
  for (const x of others) {
    if (x.id === o.id || !isOpening(x.kind)) continue;
    if (openingEdges(x).some((e) => mine.has(edgeKey(e)))) return `a ${entry(x.kind).label.toLowerCase()} is there`;
  }
  return null;
}

// Nearest spot on a wall face for an opening in hand: its middle at `along`
// (world tiles along the face's line). (The face's side doesn't matter: an
// opening goes through.)
export function openingNear(o: WorldObjectDef, f: { dir: EdgeDir; line: number }, along: number): WorldObjectDef {
  const n = Math.max(1, entry(o.kind).w);
  const k = Math.floor(along - n / 2 + 0.5);
  return f.dir === "h" ? { ...o, x: k, y: f.line, rot: 0 } : { ...o, x: f.line, y: k, rot: 1 };
}

// The middle of it, on its wall's line (tile coords).
export function openingCentre(o: { kind: string; x: number; y: number; rot?: number }): { x: number; y: number } {
  const n = Math.max(1, entry(o.kind).w);
  return openingDir(o) === "h" ? { x: o.x + n / 2, y: o.y } : { x: o.x, y: o.y + n / 2 };
}

// ── older saves ──────────────────────────────────────────────────────────────
// Doors in a gap get the wall they stand in (the material, both faces, of the
// wall beside them); windows painted on (an upper-case wall char) become a
// window in that wall, which goes back to its own material. Returns the map
// (a copy when it changed) and the windows made (ids from where they are: the
// same every time, so a conversion that's run twice makes nothing new).
export function openingsIntoWalls(
  map: MapDef,
  objects: WorldObjectDef[],
): { map: MapDef; objects: WorldObjectDef[]; added: WorldObjectDef[]; mapChanged: boolean } {
  const next: MapDef = {
    ...map,
    hWalls: [...map.hWalls],
    vWalls: [...map.vWalls],
    hBacks: map.hBacks && [...map.hBacks],
    vBacks: map.vBacks && [...map.vBacks],
  };
  let mapChanged = false;
  const doors = new Set<string>();
  for (const o of objects) {
    if (o.kind !== "door") continue;
    const e = openingEdges(o)[0];
    doors.add(edgeKey(e));
    if (isWallEdge(edgeAt(next, e))) continue;
    // the wall beside it along the line (either end), else plaster
    const along: Edge[] =
      e.dir === "h"
        ? [
            { dir: "h", x: e.x - 1, y: e.y },
            { dir: "h", x: e.x + 1, y: e.y },
          ]
        : [
            { dir: "v", x: e.x, y: e.y - 1 },
            { dir: "v", x: e.x, y: e.y + 1 },
          ];
    const from = along.find((a) => wallTakes("door", edgeAt(next, a).toLowerCase()));
    const ch = from ? edgeAt(next, from).toLowerCase() : "p";
    setEdge(next, e, ch);
    if (from && backAt(next, from) !== NO_WALL) setBack(next, e, backAt(next, from));
    mapChanged = true;
  }
  const have = new Set(objects.map((o) => o.id));
  const added: WorldObjectDef[] = [];
  const window = (e: Edge) => {
    const ch = edgeAt(next, e);
    if (!isWindow(ch)) return;
    setEdge(next, e, ch.toLowerCase());
    mapChanged = true;
    const id = `win-${e.dir}${e.x}-${e.y}`;
    if (doors.has(edgeKey(e)) || have.has(id)) return;
    added.push({ id, kind: "window", x: e.x, y: e.y, rot: e.dir === "h" ? 0 : 1 });
  };
  for (let y = 0; y <= next.height; y++) for (let x = 0; x < next.width; x++) window({ dir: "h", x, y });
  for (let y = 0; y < next.height; y++) for (let x = 0; x <= next.width; x++) window({ dir: "v", x, y });
  if (!mapChanged) return { map, objects, added, mapChanged };
  return { map: next, objects: [...objects, ...added], added, mapChanged };
}

// ── owned rooms, locked ──────────────────────────────────────────────────────
// The edges round a room (its rectangle's border).
export function ringOf(a: AreaDef): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i < a.w; i++) out.push({ dir: "h", x: a.x + i, y: a.y }, { dir: "h", x: a.x + i, y: a.y + a.h });
  for (let j = 0; j < a.h; j++) out.push({ dir: "v", x: a.x, y: a.y + j }, { dir: "v", x: a.x + a.w, y: a.y + j });
  return out;
}
