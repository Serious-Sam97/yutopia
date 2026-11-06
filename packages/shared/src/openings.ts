import { entry, quarterOf, quarterYaw, type WorldObjectDef } from "./catalog.ts";
import {
  type AreaDef,
  backAt,
  type Edge,
  type EdgeDir,
  edgeAt,
  edgeInMap,
  HALF_WALL,
  isFloor,
  isWallEdge,
  isWindow,
  type MapDef,
  NO_WALL,
  setBack,
  setEdge,
  spanOf,
  type TileMap,
} from "./map.ts";
import { cellOf, hWallOf, vWallOf, wallOf } from "./structure/query.ts";

// Doors and windows, Sims-style: things set into a wall. The wall stays a wall
// (its material, both faces) and the opening cuts its own hole through it, the
// whole width of each edge it takes, from z0 to z1 (m up). Stored like a
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
  return kind === "archway" ? 0 : kind === "door_double" || kind === "door_saloon" || kind === "door_auto" ? 2 : 1;
}
export const doorSlides = (kind: string): boolean => kind === "door_barn" || kind === "door_auto";
export const doorLockable = (kind: string): boolean =>
  isDoorKind(kind) && kind !== "door_saloon" && kind !== "archway" && kind !== "door_revolving";
// (plan 68: the automatic doors and the revolving door shut till someone comes, the garage's down)
export const doorStartState = (kind: string): string | undefined =>
  kind === "archway"
    ? undefined
    : kind === "door_saloon" || kind === "door_auto" || kind === "door_revolving" || kind === "door_garage"
      ? "closed"
      : "open";
/** How near someone opens it as they pass (tiles from its middle, across the wall): the automatic
 *  doors from further off (plan 68). */
export const doorReach = (kind: string): number => (kind === "door_auto" ? 1.6 : 0.55);

// Shut right now (a closed or locked one nobody's passing through); an archway never.
export function doorShut(o: { kind: string; props?: Record<string, unknown> }): boolean {
  if (!isDoorKind(o.kind) || !doorLeaves(o.kind)) return false;
  const st = String(o.props?.state ?? doorStartState(o.kind));
  return (st === "closed" || st === "locked") && !o.props?.passing;
}
// …and what a shut one does to light (saloon doors are half-height: none)
export const doorBlocksLight = (o: { kind: string; props?: Record<string, unknown> }): boolean =>
  doorShut(o) && o.kind !== "door_saloon";

// The hole each one cuts, m up (the kit draws its frame in it: furn/openings.ts).
// Doors and the windows' tops line up with the doorways (2.25 m).
const CUTS: Record<string, [number, number]> = {
  door: [0, 2.2456],
  door_double: [0, 2.2456],
  door_studio: [0, 2.2456],
  door_barn: [0, 2.2456],
  door_saloon: [0, 2.2456],
  archway: [0, 2.5008],
  door_auto: [0, 2.2456],
  door_revolving: [0, 2.2456],
  door_garage: [0, 2.4498],
  window: [0.9187, 2.2456],
  window_wide: [0.9187, 2.2456],
  window_tall: [0.3062, 2.5518],
  window_round: [0.9697, 1.9904],
  window_arched: [0.6635, 2.4498],
  window_high: [2.3987, 3.0112],
  window_stained: [0.5104, 2.5518],
  window_blinds: [0.9187, 2.2456],
  window_studio: [0.7145, 2.3477],
};
export function openingCut(kind: string): [number, number] {
  return CUTS[kind] ?? (isDoorKind(kind) ? [0, 2.2456] : [0.9187, 2.2456]);
}

export const openingDir = (o: { yaw?: number }): EdgeDir => (quarterOf(o) % 2 === 0 ? "h" : "v");

// The edges it takes.
export function openingEdges(o: {
  kind: string;
  x: number;
  y: number;
  yaw?: number;
  props?: Record<string, unknown> | null;
}): Edge[] {
  // (one in a wall drawn free: on no tile edge — structure/free-openings.ts)
  if (o.props?.free === true) return [];
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
  const list = [...objects];
  // (and those in walls drawn free: by their wall and spot — plan 72 phase 11.6)
  const free = list.flatMap((o) => {
    const on = o.props?.free === true && isOpening(o.kind) ? (o.props.on as { wall?: string; at?: number }) : null;
    return on ? [`free:${on.wall}@${on.at}:${openingCut(o.kind).join("-")}:${entry(o.kind).w}`] : [];
  });
  return [...[...wallCuts(list).entries()].map(([k, c]) => `${k}:${c.z0}-${c.z1}`), ...free].sort().join(";");
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
    if (!edgeInMap(map, e)) return "outside the map";
    const ch = wallOf(map, e);
    if (!isWallEdge(ch)) return door ? "doors go in a wall" : "windows go in a wall";
    if (!wallTakes(o.kind, ch)) return ch === HALF_WALL ? "not in a half wall" : "not in a glass wall";
    const [[ax, ay], [bx, by]] = sidesOf(e);
    const a = isFloor(cellOf(map, ax, ay));
    const b = isFloor(cellOf(map, bx, by));
    if (door ? !(a && b) : !(a || b)) return door ? "a door needs floor on both sides" : "no floor by it";
    for (const [h0, h1, label] of hung(e)) if (overlaps(h0, h1, z0, z1)) return `${label} hangs there`;
  }
  // a wall meeting it where two of its edges join
  for (let i = 1; i < edges.length; i++) {
    const across =
      edges[0].dir === "h"
        ? [vWallOf(map, o.x + i, o.y - 1), vWallOf(map, o.x + i, o.y)]
        : [hWallOf(map, o.x - 1, o.y + i), hWallOf(map, o.x, o.y + i)];
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
  return f.dir === "h" ? { ...o, x: k, y: f.line, yaw: quarterYaw(0) } : { ...o, x: f.line, y: k, yaw: quarterYaw(1) };
}

// The middle of it, on its wall's line (tile coords).
export function openingCentre(o: {
  kind: string;
  x: number;
  y: number;
  yaw?: number;
  props?: Record<string, unknown> | null;
}): { x: number; y: number } {
  const n = Math.max(1, entry(o.kind).w);
  // (in a wall drawn free: from its start along its yaw)
  if (o.props?.free === true) {
    const yaw = o.yaw ?? 0;
    return { x: o.x + (Math.cos(yaw) * n) / 2, y: o.y + (Math.sin(yaw) * n) / 2 };
  }
  return openingDir(o) === "h" ? { x: o.x + n / 2, y: o.y } : { x: o.x, y: o.y + n / 2 };
}

// ── older saves ──────────────────────────────────────────────────────────────
// Doors in a gap get the wall they stand in (the material, both faces, of the
// wall beside them); windows painted on (an upper-case wall char) become a
// window in that wall, which goes back to its own material. Returns the map
// (a copy when it changed) and the windows made (ids from where they are: the
// same every time, so a conversion that's run twice makes nothing new).
export function openingsIntoWalls(
  map: TileMap,
  objects: WorldObjectDef[],
): { map: TileMap; objects: WorldObjectDef[]; added: WorldObjectDef[]; mapChanged: boolean } {
  const next: TileMap = {
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
    added.push({ id, kind: "window", x: e.x, y: e.y, yaw: quarterYaw(e.dir === "h" ? 0 : 1) });
  };
  const sp = spanOf(next);
  for (let y = sp.y0; y <= sp.y1; y++) for (let x = sp.x0; x < sp.x1; x++) window({ dir: "h", x, y });
  for (let y = sp.y0; y < sp.y1; y++) for (let x = sp.x0; x <= sp.x1; x++) window({ dir: "v", x, y });
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
