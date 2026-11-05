// The old boot's conversions, in their order, once (docs/plan/72-the-3d-core.md, phase 6). The
// world-server used to run them at every start — each changed a world from an older era into
// today's, and was a no-op after. Now they run when a world becomes a structure (tools/world-v4.mts)
// and to make a brand-new world from the built-in studio; never at a start. What comes out is in
// the world's frame (fold.ts): the map a world map, the things on the other floors moved.
import { campusBuilding, clearCoreFronts, moveBlocks, upgradeCore, upgradeGround, upgradeLot } from "../building.ts";
import type { WorldObjectDef } from "../catalog.ts";
import { monitorsToComputers } from "../computer.ts";
import type { MapDef } from "../map.ts";
import { openingsIntoWalls } from "../openings.ts";
import { splitAll, topsOnHosts } from "../tops.ts";
import { foldMap, foldThings } from "./fold.ts";

export interface Finished {
  map: MapDef;
  objects: WorldObjectDef[];
  /** things changed or made (by id): what to store */
  changed: Map<string, WorldObjectDef>;
  /** what each step did (a line a step that did something) */
  log: string[];
}

/** `fresh`: a world not seeded yet (the studio's own things go with its map); `building`: the
 *  building's floors (the world-server's YUTOPIA_BUILDING, on unless a test turns it off). */
export function finishWorld(
  map0: MapDef,
  objects0: WorldObjectDef[],
  opts: { fresh: boolean; building: boolean },
): Finished {
  let map = map0;
  let objects = objects0;
  const changed = new Map<string, WorldObjectDef>();
  const log: string[] = [];
  const keep = (list: WorldObjectDef[]) => {
    for (const o of list) changed.set(o.id, o);
  };
  // doors and windows set into walls: doors in a gap get their wall, windows painted on become windows
  const into = openingsIntoWalls(map, objects);
  if (into.mapChanged) {
    map = opts.fresh ? { ...into.map, objects: [...into.map.objects, ...into.added] } : into.map;
    objects = opts.fresh ? [...into.objects, ...into.added] : into.objects;
    if (!opts.fresh) keep(into.added);
    log.push(`[openings] into the walls (${into.added.length} windows)`);
  }
  // furniture from before bare desks: what was drawn on it becomes real things
  const bare = splitAll(objects);
  objects = bare.objects;
  if (bare.changed.length) {
    keep(bare.changed);
    log.push(`[bare] ${bare.changed.length} things set out on their own`);
  }
  // monitors from before the computers: each becomes one
  const pcs = monitorsToComputers(objects);
  objects = pcs.objects;
  if (pcs.changed.length) {
    keep(pcs.changed);
    log.push(`[computers] ${pcs.changed.length} monitors are computers now`);
  }
  // things on desks and tables at their host's top as it is now (plan 67)
  const lifted = topsOnHosts(objects);
  objects = lifted.objects;
  if (lifted.changed.length) {
    keep(lifted.changed);
    log.push(`[tops] ${lifted.changed.length} things set on their hosts' tops again`);
  }
  if (opts.building) {
    // the building: a world from before floors becomes the top of five
    const b = campusBuilding(map, objects);
    if (b) {
      map = b.map;
      const moved = new Map(b.moved.map((o) => [o.id, o]));
      objects = [...objects.map((o) => moved.get(o.id) ?? o), ...b.add];
      keep([...b.moved, ...b.add]);
      log.push(`[building] ${b.add.length} new things, ${b.moved.length} moved`);
    }
    // the core a row deeper
    const up = upgradeCore(map, objects);
    if (up) {
      map = up.map;
      objects = up.objects;
      keep(up.moved);
      log.push(`[building] the core: ${up.moved.length} moved`);
    }
    // the courtyard's blocks out of a bigger studio's way
    const sh = moveBlocks(map, objects);
    if (sh) {
      map = sh.map;
      objects = sh.objects;
      keep(sh.moved);
      log.push(`[building] the blocks: ${sh.moved.length} moved`);
    }
    // the courtyard's blocks' ground floors the ground floor's own
    const grown = upgradeGround(map);
    if (grown) {
      map = grown;
      log.push("[building] the ground floor grown");
    }
    // the lot stamped as today's
    const lot = upgradeLot(map, objects);
    if (lot) {
      map = lot.map;
      objects = lot.objects;
      keep(lot.moved);
      log.push(`[building] the lot: ${lot.moved.length} moved`);
    }
    // nothing standing in front of the core's doors
    const fronts = clearCoreFronts(map, objects);
    if (fronts.length) {
      const moved = new Map(fronts.map((o) => [o.id, o]));
      objects = objects.map((o) => moved.get(o.id) ?? o);
      keep(fronts);
      log.push(`[building] the core's doors: ${fronts.length} moved`);
    }
  }
  // the one frame (fold.ts): the other floors' rooms, spawns and things in the world's
  const folded = foldThings(map, objects);
  let moved = 0;
  for (const [i, o] of folded.entries())
    if (o !== objects[i]) {
      changed.set(o.id, o);
      moved++;
    }
  if (moved) log.push(`[frame] ${moved} things on the other floors in the world's frame`);
  return { map: foldMap(map), objects: folded, changed, log };
}
