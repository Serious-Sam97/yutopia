// The map standing in the Strike Park now (docs/plan/114-the-strike-park.md, S-M6, "the dynamic park"):
// one value the server sets (`strike.map` in the room's state) and every client follows. The physics
// world's chunks over the arena are asked for again when it changes (`strikeVersion`), the 3D rebuilds.

import { STRIKE_PARK } from "./land.ts";
import type { MapBox, StrikeMap } from "./map.ts";
import { mapBoxes } from "./map.ts";
import { STRIKE_MAPS, strikeMap } from "./maps/index.ts";

let now: StrikeMap = STRIKE_MAPS[0];
/** Bumped when the map standing changes. */
export let strikeVersion = 0;
/** The map standing (or "" while the crew's striking it: the arena bare). */
let standing = true;

export function strikeMapNow(): StrikeMap {
  return now;
}
export function strikeStanding(): boolean {
  return standing;
}
/** Puts up map `key` (standing) or strikes it (`up` false: the arena bare). True if it changed. */
export function setStrikeMap(key: string, up = true): boolean {
  const next = strikeMap(key);
  if (next === now && up === standing) return false;
  now = next;
  standing = up;
  strikeVersion++;
  return true;
}

/** A map's solids in the world (building coords, y absolute): its boxes moved to the arena. */
export function strikeWorldBoxes(map: StrikeMap = now): MapBox[] {
  if (!standing) return [];
  return mapBoxes(map).map((b) => ({ ...b, x: b.x + STRIKE_PARK.x, y: b.y + STRIKE_PARK.h, z: b.z + STRIKE_PARK.z }));
}
/** World → the map's local metres, and back. */
export const toLocal = (x: number, z: number): [number, number] => [x - STRIKE_PARK.x, z - STRIKE_PARK.z];
export const toWorld = (x: number, z: number): [number, number] => [x + STRIKE_PARK.x, z + STRIKE_PARK.z];
