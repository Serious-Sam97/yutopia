export * from "./avatar.ts";
export * from "./build.ts";
export * from "./catalog.ts";
export * from "./grid.ts";
export * from "./hearing.ts";
export * from "./iso.ts";
export * from "./map.ts";
export * from "./map-edit.ts";
export * from "./path.ts";
export * from "./protocol.ts";

import type { MapDef } from "./map.ts";
import { studio } from "./maps/studio.ts";

export { studio };
export const MAPS: Record<string, MapDef> = { studio };
export function getMap(key: string): MapDef {
  return MAPS[key] ?? studio;
}
