import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, type KindShape, one } from "./units.ts";

// Plan 68 phase 15 (docs/plan/68-more-furniture.md): Rugs & floor — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/floor2.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts).
export const CATALOG = {
  // (rugs and mats flat on the floor, walked over; their field or colour the paint)
  round_rug: { label: "Round rug", w: 3, h: 3, solid: false, buildable: true, variants: 3, look: 0, paint: true },
  runner_rug: { label: "Runner", w: 4, h: 1, solid: false, buildable: true, variants: 3, look: 0, paint: true },
  cowhide: { label: "Cowhide rug", w: 2, h: 2, solid: false, buildable: true, variants: 3, look: 0, paint: true },
  puzzle_mat: { label: "Puzzle mat", w: 2, h: 2, solid: false, buildable: true, variants: 3, look: 0, paint: true },
  welcome_mat: { label: "Welcome mat", w: 1, h: 1, solid: false, buildable: true, variants: 3, look: 0, paint: true },
  // its tiles lit in a pattern (switched like a lamp)
  dance_floor: {
    label: "Dance floor",
    w: 3,
    h: 3,
    solid: false,
    buildable: true,
    variants: 3,
    look: 0,
    interact: "lamp",
    light: { color: 0xff6ad0, radius: 3.5, intensity: 0.35 },
  },
  // (stood on: a stage built of 2×1 decks, steps up to it)
  stage_riser: { label: "Stage riser", w: 2, h: 1, solid: true, buildable: true, variants: 3, look: 0 },
  stage_steps: { label: "Stage steps", w: 1, h: 1, solid: true, buildable: true, variants: 3, look: 0 },
  floor_tape: {
    label: "Floor tape lane",
    w: 4,
    h: 1,
    solid: false,
    buildable: true,
    variants: 3,
    look: 0,
    paint: true,
  },
  floor_decal: { label: "Floor decal", w: 1, h: 1, solid: false, buildable: true, variants: 4, look: 0, paint: true },
} satisfies Record<string, CatalogEntry>;

const flat = (u0: number, v0: number, u1: number, v1: number, y1: number) => one(box(u0, v0, u1, v1, 0, y1));
export const SHAPES = {
  round_rug: flat(0.08, 0.08, 2.92, 2.92, 0.04),
  runner_rug: flat(0.12, 0.08, 3.88, 0.92, 0.02),
  cowhide: flat(0.16, 0.12, 1.84, 1.88, 0.02),
  puzzle_mat: flat(0.02, 0.02, 1.98, 1.98, 0.02),
  welcome_mat: flat(0.05, 0.2, 0.95, 0.8, 0.02),
  dance_floor: flat(0, 0, 3, 3, 0.04),
  stage_riser: one(box(0, 0, 2, 1, 0, 0.4)),
  // (the top step first — what a body dropped on lands on — the lower one in front)
  stage_steps: one(box(0, 0, 1, 0.5, 0, 0.4), box(0, 0.5, 1, 1, 0, 0.2)),
  floor_tape: flat(0.05, 0.1, 3.95, 0.9, 0.01),
  floor_decal: flat(0.1, 0.1, 0.9, 0.9, 0.01),
} satisfies Record<string, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {
  stage_riser: 0.4,
  stage_steps: 0.4,
};
export const HANGS: Record<string, [number, number, number]> = {};
