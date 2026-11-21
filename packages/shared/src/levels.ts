import type { WorldObjectDef } from "./catalog.ts";
import type { Point } from "./geom.ts";
import { isFloor, type LevelDef, type MapDef, type TileLevel, type TileMap } from "./map.ts";
import { cellTop } from "./structure/query.ts";
import { STOREY } from "./units.ts";

// The building: floors stacked STOREY tiles apart (docs/plan/25-building-floors.md).
// The world's map is its *home* floor (the studio) and carries the others in
// `levels`, each a map of its own placed by its corner (ox, oy) in the home
// floor's coords — the building's coords. Things and people say which floor
// they're on (an object's props.level, a player's `level`); a thing with no
// level is on the home floor, so a world from before floors needs no change.
// Each floor is drawn, walked, heard and built on its own; stairs and
// elevators (stairs.ts, lifts) go between them.

export const floorOf = (m: { floor?: number }): number => m.floor ?? 0;
export const homeOf = (m: { floor?: number; home?: number }): number => m.home ?? m.floor ?? 0;
export const elevOf = (level: number): number => SPACE_FLOORS.get(level)?.z ?? level * STOREY;

// ── plan 112: the town's buildings' storeys ─────────────────────────────────
// A town building's inside (its space) is floors of the one structure, numbered from SPACE_BASE up, each at its own
// height (Floor.z: the land's under it, its door's sill, its storeys') and with its own floors above and below — not
// the HQ's, a STOREY a floor. Whoever holds the live structure registers them (the world server and the client, on
// every change — never a preview of one); what asks a floor's height, the one over it or under it asks here.
export const SPACE_BASE = 32;
/** Past the last floor a town storey may be (Player.level is a byte). */
export const SPACE_TOP = 256;
export interface SpaceFloor {
  index: number;
  z: number;
  space: string;
  storey: number;
  /** its walls' height (to the floor above, or its ceiling) */
  ceil: number;
  grid: { x0: number; y0: number; w: number; h: number };
  up: number | null;
  down: number | null;
}
const SPACE_FLOORS = new Map<number, SpaceFloor>();
/** each space's ground storey (by its plot) */
let SPACE_GROUNDS: SpaceFloor[] = [];
type FloorLike = {
  index: number;
  z: number;
  grid: SpaceFloor["grid"];
  space?: string;
  storey?: number;
  ceil?: number;
  away?: boolean;
};
/** The structure's town storeys (those of buildings in the world, not taken away), registered. */
export function setSpaceFloors(floors: readonly FloorLike[]): void {
  SPACE_FLOORS.clear();
  const by = new Map<string, FloorLike[]>();
  for (const f of floors) {
    if (f.space === undefined || f.away) continue;
    const l = by.get(f.space);
    if (l) l.push(f);
    else by.set(f.space, [f]);
  }
  const grounds: SpaceFloor[] = [];
  for (const [space, list] of by) {
    list.sort((a, b) => (a.storey ?? 0) - (b.storey ?? 0));
    list.forEach((f, i) => {
      const sf: SpaceFloor = {
        index: f.index,
        z: f.z,
        space,
        storey: f.storey ?? i,
        ceil: f.ceil ?? STOREY - 0.5,
        grid: f.grid,
        up: list[i + 1]?.index ?? null,
        down: list[i - 1]?.index ?? null,
      };
      SPACE_FLOORS.set(f.index, sf);
      if (i === 0) grounds.push(sf);
    });
  }
  SPACE_GROUNDS = grounds;
}
/** A town building's storey (plan 112), or null: the HQ's floors and the land. */
export const spaceFloor = (level: number): SpaceFloor | null => SPACE_FLOORS.get(level) ?? null;
export const isSpaceLevel = (level: number): boolean => SPACE_FLOORS.has(level);
/** The floor over this one (none: null) — the HQ's next, a town building's storey above. */
export const aboveOf = (level: number): number | null => {
  const s = SPACE_FLOORS.get(level);
  return s ? s.up : level + 1;
};
/** The floor under this one (none: null). */
export const belowOf = (level: number): number | null => {
  const s = SPACE_FLOORS.get(level);
  return s ? s.down : level - 1;
};
/** How far it is up to the floor over this one: a storey (a town building's top storey: up to its ceiling). */
export const riseOf = (level: number): number => {
  const s = SPACE_FLOORS.get(level);
  if (!s) return STOREY;
  const u = s.up !== null ? SPACE_FLOORS.get(s.up) : null;
  return u ? u.z - s.z : s.ceil;
};
/** The ground storey of the town building whose plot holds (x, y) (world), or null. */
export function spaceGroundAt(x: number, y: number): SpaceFloor | null {
  for (const g of SPACE_GROUNDS) {
    const { x0, y0, w, h } = g.grid;
    if (x >= x0 && y >= y0 && x <= x0 + w && y <= y0 + h) return g;
  }
  return null;
}
/** Out on the land, or on a town building's ground storey — its door and windows on the street (plan 113 review):
 *  what's seen and shot across. */
export const onStreet = (level: number): boolean => level === 0 || SPACE_FLOORS.get(level)?.storey === 0;
/** Two floors one place for sight and shots: the same, or both on the street. */
export const sameStreet = (a: number, b: number): boolean => a === b || (onStreet(a) && onStreet(b));
/** Every registered town storey. */
export const spaceFloors = (): readonly SpaceFloor[] => [...SPACE_FLOORS.values()];
/** A person's height (Player.z: the world's, plan 72 phase 6) as one over their floor — what a
 *  floor's grid and the walker work in till phase 7 — and back. */
export const overFloor = (level: number, z: number): number => z - elevOf(level);
export const worldZ = (level: number, z: number): number => z + elevOf(level);

/** The HQ's own floors, bottom up (plan 112: not the town's storeys) — what its floor picker, lifts and floor count
 *  are of. */
export function hqFloorsOf(m: MapDef): number[] {
  return floorsOf(m).filter((l) => !SPACE_FLOORS.has(l) && l < SPACE_BASE);
}

/** Every floor of the building, bottom up. */
export function floorsOf(m: MapDef): number[] {
  const set = new Set([homeOf(m), ...(m.levels ?? []).map((l) => l.index)]);
  return [...set].sort((a, b) => a - b);
}

export const hasFloor = (m: MapDef, level: number): boolean => floorsOf(m).includes(level);

/** Where floor `level`'s corner is (where its tile rows start), in the building's coords — on a
 *  world map (MapDef.world) the world's, the home floor's own corner too. */
export function offsetOf(m: MapDef, level: number): Point {
  if (level === homeOf(m)) return m.world ? { x: m.ox ?? 0, y: m.oy ?? 0 } : { x: 0, y: 0 };
  const l = m.levels?.find((v) => v.index === level);
  return { x: l?.ox ?? 0, y: l?.oy ?? 0 };
}

/** What turns floor `level`'s places into the world's: nothing on a world map (MapDef.world, its
 *  places are the world's), the floor's corner on an older one. */
export function shiftOf(m: MapDef, level: number): Point {
  return m.world ? { x: 0, y: 0 } : offsetOf(m, level);
}

/** A point on floor `from` in floor `to`'s coords (the same spot of the building). A world map's
 *  floors share the world's (MapDef.world): the point as it is. */
export function across(m: MapDef, from: number, to: number, p: Point): Point {
  if (m.world) return { x: p.x, y: p.y };
  const a = offsetOf(m, from);
  const b = offsetOf(m, to);
  return { x: p.x + a.x - b.x, y: p.y + a.y - b.y };
}

/** One floor as a map of its own (the home floor: the map itself). Call it on
 *  the home map, or on a view (views carry the floors list). A tile map's floor has its rows; a
 *  world's (MapDef.st) is asked of its structure. */
export function levelMap(m: TileMap, level: number): TileMap | null;
export function levelMap(m: MapDef, level: number): MapDef | null;
export function levelMap(m: MapDef, level: number): MapDef | null {
  const home = homeOf(m);
  if (level === home && m.home === undefined) return m;
  const l = m.levels?.find((v) => v.index === level);
  if (!l) return level === floorOf(m) ? m : null;
  const rows = "tiles" in l ? (l as TileLevel) : null;
  return {
    key: m.key,
    name: l.name,
    width: l.width,
    height: l.height,
    ...(rows && {
      tiles: rows.tiles,
      hWalls: rows.hWalls,
      vWalls: rows.vWalls,
      hBacks: rows.hBacks,
      vBacks: rows.vBacks,
    }),
    ...(m.st && { st: m.st }),
    areas: l.areas,
    spawn: l.spawn ?? centreOf(m, l, m.world ? l.ox : 0, m.world ? l.oy : 0),
    objects: [],
    floor: l.index,
    ox: l.ox,
    oy: l.oy,
    ...(m.world ? { world: true as const } : {}),
    home,
    levels: m.levels,
    outdoor: l.outdoor,
  };
}

/** The home map with floor `lm` (a level view, edited) written back. */
export function withLevel(root: TileMap, lm: TileMap): TileMap {
  const level = floorOf(lm);
  if (level === homeOf(root)) {
    const { home: _h, ox: _x, oy: _y, outdoor: _o, ...rest } = lm;
    return { ...root, ...rest, floor: root.floor, levels: root.levels, objects: root.objects };
  }
  const def = levelDefOf(
    lm,
    root.levels?.find((l) => l.index === level),
  );
  const levels = (root.levels ?? []).filter((l) => l.index !== level);
  return { ...root, levels: [...levels, def].sort((a, b) => a.index - b.index) };
}

/** A level view as a LevelDef (the stored shape). */
export function levelDefOf(lm: TileMap, was?: TileLevel): TileLevel {
  return {
    index: floorOf(lm),
    name: was?.name ?? lm.name,
    ox: lm.ox ?? was?.ox ?? 0,
    oy: lm.oy ?? was?.oy ?? 0,
    ...(lm.outdoor || was?.outdoor ? { outdoor: true } : {}),
    width: lm.width,
    height: lm.height,
    tiles: [...lm.tiles],
    hWalls: [...lm.hWalls],
    vWalls: [...lm.vWalls],
    ...(lm.hBacks ? { hBacks: [...lm.hBacks] } : {}),
    ...(lm.vBacks ? { vBacks: [...lm.vBacks] } : {}),
    areas: lm.areas.map((a) => ({ ...a })),
    ...(was?.spawn ? { spawn: { ...was.spawn } } : {}),
  };
}

function centreOf(m: MapDef, l: LevelDef, ox: number, oy: number): Point {
  // (a world's floor: asked of its structure — its cells by their middles, world)
  const tiles = (l as Partial<TileLevel>).tiles;
  const st = m.st;
  const floorHere = (x: number, y: number): boolean =>
    tiles ? isFloor(tiles[y]?.[x] ?? " ") : !!st && isFloor(cellTop(st, l.index, x + l.ox, y + l.oy));
  // the floor tile nearest the middle (a floor's own arrival point)
  const cx = l.width / 2;
  const cy = l.height / 2;
  let best: Point = { x: cx + ox, y: cy + oy };
  let bd = Number.POSITIVE_INFINITY;
  for (let y = 0; y < l.height; y++)
    for (let x = 0; x < l.width; x++) {
      if (!floorHere(x, y)) continue;
      const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
      if (d < bd) {
        bd = d;
        best = { x: x + 0.5 + ox, y: y + 0.5 + oy };
      }
    }
  return best;
}

// ── what's on which floor ───────────────────────────────────────────────────
/** The floor a thing is on (props.level; none: the home floor). */
export function objLevel(o: { props?: Record<string, unknown> | null }, m: { floor?: number; home?: number }): number {
  const l = o.props?.level;
  return typeof l === "number" && Number.isInteger(l) ? l : homeOf(m);
}

/** The things on the floor this map is. */
export function onLevel<T extends { props?: Record<string, unknown> | null }>(objects: Iterable<T>, m: MapDef): T[] {
  const f = floorOf(m);
  const home = homeOf(m);
  const out: T[] = [];
  for (const o of objects) {
    const l = o.props?.level;
    if ((typeof l === "number" && Number.isInteger(l) ? l : home) === f) out.push(o);
  }
  return out;
}

/** A thing put on floor `level`: its props say so (nothing said on the home floor). */
export function atLevel(o: WorldObjectDef, level: number, m: MapDef): WorldObjectDef {
  const props = { ...(o.props ?? {}) };
  if (level === homeOf(m)) delete props.level;
  else props.level = level;
  return { ...o, props };
}
