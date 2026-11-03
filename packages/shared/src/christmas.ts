import { canPlace } from "./build.ts";
import { entry, placedFootprint, type WorldObjectDef } from "./catalog.ts";
import type { Point } from "./iso.ts";
import { atLevel, floorOf, floorsOf, levelMap, onLevel } from "./levels.ts";
import type { AreaDef, MapDef } from "./map.ts";
import { planFor, refurnished } from "./office.ts";
import { isOpening } from "./openings.ts";

// Christmas put out (docs/plan/68-more-furniture.md, phase 2): an admin's switch dresses every room
// in the building for Christmas around what's there — nothing taken away — and puts it all away
// again. Each room: the tree in a back corner with presents by it, a wreath and a garland on its
// back wall, stockings either side of a fireplace, mistletoe in the middle, poinsettias in the
// corners, a hot cocoa station in a kitchen, the small pieces on its tables and desks. Every piece
// only where it can be put down and clear of the doors (build.ts canPlace), its id marked so the
// switch knows its own.

export const XMAS_TAG = "xmas-";
/** Put out by the switch (not placed by hand). */
export const decked = (o: { id: string }): boolean => o.id.startsWith(XMAS_TAG);

/** One room's Christmas, around `keep` (the floor's things). */
export function deckRoom(
  a: AreaDef,
  map: MapDef,
  keep: WorldObjectDef[],
  bodies: Point[] = [],
  tag = "",
): WorldObjectDef[] {
  const level = floorOf(map);
  const here = onLevel(keep, map);
  // (the doors' tiles and their neighbours: kept clear)
  const clear = new Set<string>();
  for (const d of here)
    if (isOpening(d.kind) && entry(d.kind).opening === "door") {
      const { w, h } = placedFootprint(d);
      for (let y = d.y - 1; y <= d.y + h; y++) for (let x = d.x - 1; x <= d.x + w; x++) clear.add(`${x},${y}`);
    }
  const out: WorldObjectDef[] = [];
  let n = 0;
  const put = (kind: string, x: number, y: number, rot = 0, props: Record<string, unknown> = {}): boolean => {
    const o = atLevel(
      { id: `${XMAS_TAG}${a.key}-${level}${tag && `-${tag}`}-${n++}`, kind, x, y, rot, props },
      level,
      map,
    );
    const e = entry(kind);
    if (!e.onSurface && !e.wall) {
      const { w, h } = placedFootprint(o);
      // (inside the room, clear of the doors)
      if (x < a.x || y < a.y || x + w > a.x + a.w || y + h > a.y + a.h) return false;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (clear.has(`${x + dx},${y + dy}`)) return false;
    }
    if (!canPlace(map, [...here, ...out], o, bodies)) return false;
    out.push(o);
    return true;
  };
  if (a.w < 3 || a.h < 3) return [];
  // the tree in a back corner, presents round its foot, the nutcracker by it
  const right = a.x + a.w - 2;
  for (const [tx, ty] of [
    [right - 1, a.y],
    [a.x + 1, a.y],
    [right - 1, a.y + a.h - 3],
    [a.x + 1, a.y + a.h - 3],
  ]) {
    if (!put("xmas_tree", tx, ty, 0, { variant: 0 })) continue;
    let gifts = 0;
    for (const [px, py] of [
      [tx - 1, ty + 1],
      [tx + 2, ty + 1],
      [tx, ty + 2],
      [tx + 1, ty + 2],
    ])
      if (gifts < 2 && put("present", px, py, 0, { variant: gifts })) gifts++;
    if (a.w >= 6) put("nutcracker", tx + 2, ty, 0) || put("nutcracker", tx - 1, ty, 0);
    break;
  }
  // on the back wall: a wreath, and a garland over heads in a bigger room
  for (let x = a.x + Math.floor(a.w / 2); x < a.x + a.w; x++) if (put("wreath", x, a.y, 0, { wu: 0 })) break;
  if (a.w >= 6) for (let x = a.x; x + 3 <= a.x + a.w; x++) if (put("garland", x, a.y, 0, { wu: 0 })) break;
  // stockings either side of a fireplace, on its wall
  for (const f of here)
    if (f.kind === "fireplace" && f.x >= a.x && f.x < a.x + a.w && f.y >= a.y && f.y < a.y + a.h) {
      const r = (f.rot ?? 0) & 3;
      if (r === 0 || r === 2)
        for (const sx of [f.x - 1, f.x + 2]) put("stocking", sx, f.y, r, { wu: r === 0 ? 2 : 0, variant: sx % 3 });
    }
  // mistletoe in the middle, poinsettias in the front corners
  put("mistletoe", a.x + Math.floor(a.w / 2), a.y + Math.floor(a.h / 2), 0);
  for (const [x, y] of [
    [a.x, a.y + a.h - 1],
    [a.x + a.w - 1, a.y + a.h - 1],
  ])
    put("poinsettia", x, y, 0, { variant: (x + y) % 3 });
  // a kitchen's hot cocoa, along its front wall
  if (planFor(a) === "kitchen")
    for (let x = a.x + 1; x + 2 <= a.x + a.w - 1; x++) if (put("cocoa_station", x, a.y + a.h - 1, 2)) break;
  // on its tables and desks: a candle arch, a little tree, the village, a gingerbread house
  const smalls = ["candle_arch", "xmas_tree_small", "xmas_village", "gingerbread_house"];
  let k = 0;
  for (const host of here) {
    if (k >= smalls.length) break;
    const surface = entry(host.kind).surface;
    if (!surface || host.x < a.x || host.x >= a.x + a.w || host.y < a.y || host.y >= a.y + a.h) continue;
    if (put(smalls[k], host.x, host.y, 0, { z: surface })) k++;
  }
  return out;
}

/** Every room of every floor dressed for Christmas (the rooms a refurnishing furnishes). */
export function deckBuilding(
  map: MapDef,
  objects: WorldObjectDef[],
  bodies: (level: number) => Point[] = () => [],
  tag = "",
): WorldObjectDef[] {
  const out: WorldObjectDef[] = [];
  for (const level of floorsOf(map)) {
    const lm = levelMap(map, level);
    if (!lm) continue;
    for (const a of lm.areas) {
      if (!refurnished(a)) continue;
      out.push(...deckRoom(a, lm, [...objects, ...out], bodies(level), tag));
    }
  }
  return out;
}
