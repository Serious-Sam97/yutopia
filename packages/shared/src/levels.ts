import type { WorldObjectDef } from "./catalog.ts";
import type { Point } from "./iso.ts";
import { isFloor, type LevelDef, type MapDef } from "./map.ts";

// The building: floors stacked STOREY tiles apart (docs/plan/25-building-floors.md).
// The world's map is its *home* floor (the studio) and carries the others in
// `levels`, each a map of its own placed by its corner (ox, oy) in the home
// floor's coords — the building's coords. Things and people say which floor
// they're on (an object's props.level, a player's `level`); a thing with no
// level is on the home floor, so a world from before floors needs no change.
// Each floor is drawn, walked, heard and built on its own; stairs and
// elevators (stairs.ts, lifts) go between them.

export const STOREY = 3.5; // tiles, floor to floor (the walls are 3.27, the rest is ceiling and slab)

export const floorOf = (m: { floor?: number }): number => m.floor ?? 0;
export const homeOf = (m: { floor?: number; home?: number }): number => m.home ?? m.floor ?? 0;
export const elevOf = (level: number): number => level * STOREY;

/** Every floor of the building, bottom up. */
export function floorsOf(m: MapDef): number[] {
  const set = new Set([homeOf(m), ...(m.levels ?? []).map((l) => l.index)]);
  return [...set].sort((a, b) => a - b);
}

export const hasFloor = (m: MapDef, level: number): boolean => floorsOf(m).includes(level);

/** Where floor `level`'s corner is, in the building's coords. */
export function offsetOf(m: MapDef, level: number): Point {
  if (level === homeOf(m)) return { x: 0, y: 0 };
  const l = m.levels?.find((v) => v.index === level);
  return { x: l?.ox ?? 0, y: l?.oy ?? 0 };
}

/** A point on floor `from` in floor `to`'s coords (the same spot of the building). */
export function across(m: MapDef, from: number, to: number, p: Point): Point {
  const a = offsetOf(m, from);
  const b = offsetOf(m, to);
  return { x: p.x + a.x - b.x, y: p.y + a.y - b.y };
}

/** One floor as a map of its own (the home floor: the map itself). Call it on
 *  the home map, or on a view (views carry the floors list). */
export function levelMap(m: MapDef, level: number): MapDef | null {
  const home = homeOf(m);
  if (level === home && m.home === undefined) return m;
  const l = m.levels?.find((v) => v.index === level);
  if (!l) return level === floorOf(m) ? m : null;
  return {
    key: m.key,
    name: l.name,
    width: l.width,
    height: l.height,
    tiles: l.tiles,
    hWalls: l.hWalls,
    vWalls: l.vWalls,
    hBacks: l.hBacks,
    vBacks: l.vBacks,
    areas: l.areas,
    spawn: l.spawn ?? centreOf(l),
    objects: [],
    floor: l.index,
    ox: l.ox,
    oy: l.oy,
    home,
    levels: m.levels,
    outdoor: l.outdoor,
  };
}

/** The home map with floor `lm` (a level view, edited) written back. */
export function withLevel(root: MapDef, lm: MapDef): MapDef {
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
export function levelDefOf(lm: MapDef, was?: LevelDef): LevelDef {
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

function centreOf(l: { width: number; height: number; tiles: string[] }): Point {
  // the floor tile nearest the middle (a floor's own arrival point)
  const cx = l.width / 2;
  const cy = l.height / 2;
  let best: Point = { x: cx, y: cy };
  let bd = Number.POSITIVE_INFINITY;
  for (let y = 0; y < l.height; y++)
    for (let x = 0; x < l.width; x++) {
      if (!isFloor(l.tiles[y]?.[x] ?? " ")) continue;
      const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
      if (d < bd) {
        bd = d;
        best = { x: x + 0.5, y: y + 0.5 };
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
