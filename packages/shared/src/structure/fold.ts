// The one frame (docs/plan/72-the-3d-core.md, phase 6): an older map — every floor's places its
// own tiles', each floor's corner at (ox, oy) in the home floor's — and its things, moved into the
// world's. The home floor's corner is the world's 0, 0 (the land was always drawn in its frame),
// so only the other floors' places move: their rooms, spawns and things, by their corner. The
// tile rows stay as they are, starting at the same corner (MapDef.world).
//
// For the old boot's conversions' output (structure/finish.ts: the migration, a new world) and
// the old maps the tests write; nothing at run time is in the old frame.
import type { WorldObjectDef } from "../catalog.ts";
import { homeOf, objLevel, offsetOf } from "../levels.ts";
import type { AreaDef, MapDef } from "../map.ts";

/** An older map in the world's frame (a world map as it is). */
export function foldMap(m: MapDef): MapDef {
  if (m.world) return m;
  // (a room's dressing taken away is kept by its pieces' ids, which said where they stood on the
  // floor's tiles; now where in the room, from its corner: dressing.ts)
  const dress = (a: AreaDef) => (a.dressOff ? { dressOff: a.dressOff.map((id) => dressIn(id, a.x, a.y)) } : {});
  const levels = m.levels?.map((l) => ({
    ...l,
    areas: l.areas.map((a) => ({
      ...a,
      x: a.x + l.ox,
      y: a.y + l.oy,
      ...(a.outline ? { outline: a.outline.map(([x, y]): [number, number] => [x + l.ox, y + l.oy]) } : {}),
      ...dress(a),
    })),
    ...(l.spawn ? { spawn: { x: l.spawn.x + l.ox, y: l.spawn.y + l.oy } } : {}),
  }));
  const areas = m.areas.map((a) => ({ ...a, ...dress(a) }));
  const out: MapDef = { ...m, areas, world: true, ox: 0, oy: 0, ...(levels ? { levels } : {}) };
  return out;
}

/** An older dressing piece's id (`d-{room}-{kind}-{x}-{y}`, a frame `d-{room}-f{x}-{y}`: its tile
 *  on its floor) as today's: its tile from its room's corner (ax, ay). */
export function dressIn(id: string, ax: number, ay: number): string {
  const m = /^(d-.*-)(f?)(\d+)-(\d+)$/.exec(id);
  return m ? `${m[1]}${m[2]}${Number(m[3]) - ax}-${Number(m[4]) - ay}` : id;
}

/** A thing on an older map's floor, in the world's frame (by its floor's corner). */
export function foldThing(m: MapDef, o: WorldObjectDef): WorldObjectDef {
  if (m.world) return o;
  const level = objLevel(o, m);
  if (level === homeOf(m)) return o;
  const off = offsetOf(m, level);
  return off.x || off.y ? { ...o, x: o.x + off.x, y: o.y + off.y } : o;
}

export const foldThings = (m: MapDef, objects: readonly WorldObjectDef[]): WorldObjectDef[] =>
  objects.map((o) => foldThing(m, o));

/** A world map's floor as an older map: its places its own tiles' (from its corner), not the
 *  world's — for the browser's per-floor drawing, built in a floor's own frame and placed at its
 *  corner (tp/build.ts and the light maps; phase 8 draws the structure instead and this goes). */
export function localView(lm: MapDef): MapDef {
  if (!lm.world) return lm;
  const ox = lm.ox ?? 0;
  const oy = lm.oy ?? 0;
  const { world: _w, ...rest } = lm;
  if (!ox && !oy) return rest;
  return {
    ...rest,
    areas: lm.areas.map((a) => ({
      ...a,
      x: a.x - ox,
      y: a.y - oy,
      ...(a.outline ? { outline: a.outline.map(([x, y]): [number, number] => [x - ox, y - oy]) } : {}),
    })),
    spawn: { x: lm.spawn.x - ox, y: lm.spawn.y - oy },
    ...(lm.core ? { core: { x: lm.core.x - ox, y: lm.core.y - oy } } : {}),
  };
}

/** A thing on a world map's floor in that floor's own frame (localView's). */
export function localThing<T extends { x: number; y: number }>(lm: MapDef, o: T): T {
  const ox = lm.world ? (lm.ox ?? 0) : 0;
  const oy = lm.world ? (lm.oy ?? 0) : 0;
  return ox || oy ? { ...o, x: o.x - ox, y: o.y - oy } : o;
}
