import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, type KindShape, one } from "./units.ts";

// Plan 68 phase 12 (docs/plan/68-more-furniture.md): On the walls — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/walls2.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts). All hung on
// a wall (`wall: true`); the signs and the fittings a room matches (`look: 0`), the art and the
// keepsakes picked by their id until chosen.
const hung = (label: string, w: number, variants: number, match = false): CatalogEntry => ({
  label,
  w,
  h: 1,
  solid: false,
  wall: true,
  buildable: true,
  variants,
  ...(match ? { look: 0 } : {}),
});
export const CATALOG = {
  cuckoo_clock: hung("Cuckoo clock", 1, 3),
  world_clocks: hung("World-time clocks", 3, 3, true),
  wall_calendar: hung("Wall calendar", 1, 3),
  thermostat: hung("Thermostat", 1, 3, true),
  members_map: hung("Members' map", 2, 3),
  pegboard: hung("Pegboard with tools", 2, 3),
  wall_skateboard: hung("Mounted skateboard", 1, 3),
  framed_records: hung("Framed records", 2, 3),
  tapestry: hung("Tapestry", 2, 3),
  wall_mirror: hung("Mirror", 1, 3),
  carved_antlers: hung("Carved antlers", 1, 3),
  // (lit day and night: a little green on the wall under it)
  exit_sign: { ...hung("Exit sign", 1, 2, true), light: { color: 0x5fe08a, radius: 1.6, intensity: 0.14, h: 2.3 } },
  fire_alarm: hung("Fire alarm", 1, 3, true),
  guitar_hooks: hung("Guitars on hooks", 2, 2),
} satisfies Record<string, CatalogEntry>;

// (in the wall's frame: u along it, v out from it — its face at 0.1 — y up, m)
export const SHAPES = {
  cuckoo_clock: one(box(0.31, 0.1, 0.69, 0.29, 1.04, 2.1)),
  world_clocks: one(box(0.37, 0.1, 2.63, 0.14, 1.59, 2.04)),
  wall_calendar: one(box(0.33, 0.1, 0.67, 0.13, 1.19, 1.84)),
  thermostat: one(box(0.44, 0.1, 0.56, 0.14, 1.4, 1.5)),
  members_map: one(box(0.15, 0.1, 1.85, 0.16, 1.08, 1.95)),
  pegboard: one(box(0.1, 0.1, 1.9, 0.21, 0.95, 1.85)),
  wall_skateboard: one(box(0.12, 0.1, 0.88, 0.25, 1.38, 1.64)),
  framed_records: one(box(0.16, 0.1, 1.84, 0.14, 1.38, 1.82)),
  tapestry: one(box(0.11, 0.1, 1.89, 0.17, 0.9, 2.04)),
  wall_mirror: one(box(0.07, 0.1, 0.93, 0.14, 0.97, 2.04)),
  carved_antlers: one(box(0.21, 0.1, 0.79, 0.23, 1.44, 2.15)),
  exit_sign: one(box(0.31, 0.1, 0.69, 0.16, 2.21, 2.39)),
  fire_alarm: one(box(0.42, 0.1, 0.59, 0.18, 1.23, 2.16)),
  guitar_hooks: one(box(0.15, 0.1, 1.85, 0.24, 1.0, 2.11)),
} satisfies Record<string, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {};
// (quarter tiles along the wall, its lowest and highest, m up)
export const HANGS: Record<string, [number, number, number]> = {
  cuckoo_clock: [2, 1.0462, 2.118],
  world_clocks: [10, 1.5821, 2.0415],
  wall_calendar: [2, 1.1738, 1.8628],
  thermostat: [2, 1.378, 1.5056],
  members_map: [8, 1.0718, 1.9649],
  pegboard: [8, 0.9442, 1.8628],
  wall_skateboard: [4, 1.378, 1.6587],
  framed_records: [8, 1.378, 1.8373],
  tapestry: [8, 0.8931, 2.0415],
  wall_mirror: [4, 0.9442, 2.0415],
  carved_antlers: [4, 1.429, 2.1691],
  exit_sign: [2, 2.1946, 2.3987],
  fire_alarm: [2, 1.2249, 2.1691],
  guitar_hooks: [8, 0.9952, 2.118],
};
