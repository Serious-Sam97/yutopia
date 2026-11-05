export * from "./actions.ts";
export * from "./avatar.ts";
export * from "./build.ts";
export * from "./building.ts";
export * from "./catalog.ts";
export * from "./clock.ts";
export * from "./convert.ts";
export * from "./doors.ts";
export * from "./dressing.ts";
export * from "./faces.ts";
export * from "./facing.ts";
export * from "./furniture.ts";
export * from "./ground.ts";
export * from "./hang.ts";
export * from "./hearing.ts";
export * from "./held.ts";
export * from "./history.ts";
export * from "./iso.ts";
export * from "./jump.ts";
export * from "./levels.ts";
export * from "./lift.ts";
export * from "./lot.ts";
export * from "./map.ts";
export * from "./map-edit.ts";
export * from "./migrate.ts";
export * from "./openings.ts";
export * from "./protocol.ts";
export * from "./stairs.ts";
export * from "./tops.ts";
export * from "./units.ts";
export * from "./weather.ts";

import type { MapDef } from "./map.ts";
import { studio, studioV1 } from "./maps/studio.ts";

export { studio, studioV1 };
export const MAPS: Record<string, MapDef> = { studio };
export function getMap(key: string): MapDef {
  return MAPS[key] ?? studio;
}
export { FAM_CHAIRS, FAM_COMMANDERS, FAM_KINDS } from "./fam/index.ts";
