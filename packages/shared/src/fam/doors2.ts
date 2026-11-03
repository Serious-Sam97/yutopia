import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, type KindShape, one } from "./units.ts";

// Plan 68 phase 13 (docs/plan/68-more-furniture.md): Doors & windows — the doors and windows
// themselves are the catalog's openings (redrawn by the client's world/furn/openings.ts); here the
// skylight, set in the ceiling, its daylight falling into the room.
export const CATALOG = {
  skylight: {
    label: "Skylight",
    w: 2,
    h: 2,
    solid: false,
    buildable: true,
    light: { color: 0xe8f1ff, radius: 4.5, intensity: 0.45, h: 3.2 },
  },
} satisfies Record<string, CatalogEntry>;
export const SHAPES = {
  skylight: { ...one(box(0.04, 0.04, 1.96, 1.96, 3.1, 3.27)), odd: "set in the ceiling, over heads" },
} satisfies Record<string, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {};
export const HANGS: Record<string, [number, number, number]> = {};
