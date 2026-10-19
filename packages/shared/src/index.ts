export * from "./actions.ts";
export * from "./avatar.ts";
export * from "./build.ts";
export * from "./building.ts";
export * from "./catalog.ts";
export * from "./convert.ts";
export * from "./dressing.ts";
export * from "./faces.ts";
export * from "./grid.ts";
export * from "./hang.ts";
export * from "./hearing.ts";
export * from "./held.ts";
export * from "./history.ts";
export * from "./iso.ts";
export * from "./jump.ts";
export * from "./levels.ts";
export * from "./map.ts";
export * from "./map-edit.ts";
export * from "./openings.ts";
export * from "./path.ts";
export * from "./protocol.ts";
export * from "./stairs.ts";
export * from "./tops.ts";

import type { MapDef } from "./map.ts";
import { studio, studioV1 } from "./maps/studio.ts";

export { studio, studioV1 };
export const MAPS: Record<string, MapDef> = { studio };
export function getMap(key: string): MapDef {
  return MAPS[key] ?? studio;
}
