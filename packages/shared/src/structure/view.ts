// The world's map (docs/plan/72-the-3d-core.md, phase 11: the tile-map adapter deleted): the home
// floor with the others in `levels`, each by its corner and extent, its rooms, its arrival point —
// and the structure itself (MapDef.st), which every floor and wall is asked of (query.ts). No tile
// rows: nothing reads them off a world's map. A world map (MapDef.world): every place in it the
// world's.
import type { AreaDef, LevelDef, MapDef, TileMap } from "../map.ts";
import { structureFromMap } from "./from-map.ts";
import type { Floor, Structure } from "./types.ts";

/** A floor's rooms as the map's areas: each room's own props, its rectangle, its outline where it
 *  isn't that rectangle. */
export function roomsOf(s: Structure, floor: number): AreaDef[] {
  return s.rooms
    .filter((r) => r.floor === floor)
    .map((r) => {
      const [rx0, ry0, rx1, ry1] = r.rect;
      const box =
        r.outline.length === 4 && r.outline.every(([x, y]) => (x === rx0 || x === rx1) && (y === ry0 || y === ry1));
      return {
        key: r.key,
        ...r.props,
        x: rx0,
        y: ry0,
        w: rx1 - rx0,
        h: ry1 - ry0,
        ...(box ? {} : { outline: r.outline.map(([x, y]): [number, number] => [x, y]) }),
      } as AreaDef;
    });
}

// (each floor's view kept while its rooms are the same objects: an edit elsewhere keeps them)
const kept = new WeakMap<Floor, { rooms: unknown[]; areas: AreaDef[] }>();
function areasOf(s: Structure, f: Floor): AreaDef[] {
  const rooms = s.rooms.filter((r) => r.floor === f.index);
  const had = kept.get(f);
  if (had && had.rooms.length === rooms.length && had.rooms.every((r, i) => r === rooms[i])) return had.areas;
  const areas = roomsOf(s, f.index);
  kept.set(f, { rooms, areas });
  return areas;
}

/** A floor's grid as whole tiles: its own when it's on them, else the tiles that cover it. */
function tilesOver(g: { x0: number; y0: number; w: number; h: number }) {
  const ox = Math.floor(g.x0 + 1e-6);
  const oy = Math.floor(g.y0 + 1e-6);
  return { ox, oy, width: Math.ceil(g.x0 + g.w - 1e-6) - ox, height: Math.ceil(g.y0 + g.h - 1e-6) - oy };
}

/** The structure as the world's map: the home floor's, the others in `levels` (objects left empty:
 *  things aren't structure). */
export function viewOf(s: Structure): MapDef {
  const home = s.floors.find((f) => f.index === s.home) ?? s.floors[0];
  const levels: LevelDef[] = s.floors
    // (a town building's storeys taken out of the world with it: kept, not a floor of it — plan 112)
    .filter((f) => f !== home && !f.away)
    .map((f) => ({
      index: f.index,
      name: f.name,
      // (whole tiles over its plot: a town building stood off the tiles — the rest hut out on the long road, one
      // God mode set down — has a floor that isn't, and a map's cells are tiles — plan 113 review)
      ...tilesOver(f.grid),
      ...(f.outdoor ? { outdoor: true } : {}),
      areas: areasOf(s, f),
      ...(f.spawn ? { spawn: { x: f.spawn[0], y: f.spawn[1] } } : {}),
    }));
  return {
    key: s.key,
    name: s.name,
    width: home.grid.w,
    height: home.grid.h,
    st: s,
    areas: areasOf(s, home),
    world: true,
    ox: home.grid.x0,
    oy: home.grid.y0,
    spawn: { x: s.spawn[0], y: s.spawn[1] },
    objects: [],
    floor: home.index,
    ...(levels.length ? { levels } : {}),
    ...(home.outdoor ? { outdoor: true } : {}),
    ...(s.core ? { core: { x: s.core[0], y: s.core[1] } } : {}),
  };
}

/** A tile map as the world would have it (the tests', a generator's checked as the world reads it):
 *  its structure's view. */
export const worldOf = (m: TileMap): MapDef => viewOf(structureFromMap(m));
