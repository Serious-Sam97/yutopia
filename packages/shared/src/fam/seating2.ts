import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, type KindShape, one } from "./units.ts";

// Plan 68 phase 3 (docs/plan/68-more-furniture.md): Seating — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/seating2.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts).
export const CATALOG = {
  egg_chair: {
    label: "Egg chair",
    w: 1,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    variants: 3,
    look: 0,
    paint: true,
  },
  rocking_chair: {
    label: "Rocking chair",
    w: 1,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    variants: 3,
    look: 0,
    paint: true,
  },
  // (hung from a hook in the ceiling: the seat swings under it)
  hanging_chair: {
    label: "Hanging chair",
    w: 1,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    variants: 2,
    look: 0,
    paint: true,
  },
  gaming_chair: { label: "Gaming chair", w: 1, h: 1, solid: false, seat: true, buildable: true, variants: 3, look: 0 },
  window_seat: {
    label: "Window seat",
    w: 2,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    variants: 2,
    look: 0,
    paint: true,
  },
  // (the sofas' corner: joins two of them into an L, its back along two sides)
  corner_sofa: {
    label: "Corner sofa piece",
    w: 1,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    variants: 3,
    look: 0,
    paint: true,
  },
  floor_cushions: {
    label: "Floor cushions",
    w: 1,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    variants: 2,
    look: 0,
    paint: true,
  },
  bleachers: { label: "Bleachers", w: 3, h: 2, solid: false, seat: true, buildable: true, variants: 2, look: 0 },
  hammock: {
    label: "Hammock",
    w: 3,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    variants: 2,
    look: 0,
    paint: true,
  },
} satisfies Record<string, CatalogEntry>;

export const SHAPES = {
  egg_chair: one(box(0.06, 0.03, 0.94, 0.85, 0, 0.44), box(0.06, 0.03, 0.94, 0.5, 0.44, 1.09)),
  rocking_chair: one(box(0.07, 0.07, 0.93, 0.93, 0, 0.46), box(0.22, 0.06, 0.78, 0.35, 0.46, 1.13)),
  hanging_chair: {
    parts: [box(0.04, 0.02, 0.96, 0.94, 0.3, 1.68), box(0.45, 0.43, 0.55, 0.53, 1.68, 3.27)],
    odd: "hung from the ceiling: its seat, and the chain or rope up to the hook",
  },
  gaming_chair: one(box(0.17, 0.17, 0.83, 0.83, 0, 0.5), box(0.2, 0.08, 0.8, 0.33, 0.5, 1.35)),
  window_seat: one(box(0.03, 0.02, 1.97, 0.78, 0, 0.45), box(0.03, 0.02, 1.97, 0.22, 0.45, 0.95)),
  corner_sofa: one(box(0.05, 0.05, 1, 0.95, 0, 0.46), box(0.05, 0.05, 1, 0.36, 0.46, 0.89)),
  floor_cushions: one(box(0.08, 0.06, 0.97, 0.93, 0, 0.32)),
  bleachers: one(
    box(0.04, 1.4, 2.96, 1.95, 0, 0.42),
    box(0.04, 0.8, 2.96, 1.4, 0, 0.82),
    box(0.04, 0.05, 2.96, 0.8, 0, 1.22),
    box(0.04, 0.07, 2.96, 0.13, 1.22, 1.95),
  ),
  hammock: {
    parts: [box(0.04, 0.1, 2.96, 0.9, 0, 0.62), box(0.04, 0.4, 0.2, 0.6, 0, 1.42), box(2.8, 0.4, 2.96, 0.6, 0, 1.42)],
    odd: "cloth: the bed sways, walked through as any seat",
  },
} satisfies Record<string, KindShape>;

// (as drawn, sat on: the cushion's top, its front edge, its back's face, from the tile's middle)
export const SEATS: Record<string, SeatSpec> = {
  egg_chair: { top: 0.44, front: 0.34, back: -0.28, lean: [0.12, 0.25], arms: 0.58 },
  rocking_chair: { top: 0.45, front: 0.25, back: -0.2, lean: [0.12, 0.24], arms: 0.66 },
  hanging_chair: { top: 0.45, front: 0.36, back: -0.26, lean: [0.15, 0.3] },
  gaming_chair: { top: 0.48, front: 0.27, back: -0.15, lean: [0.12, 0.3], arms: 0.7 },
  window_seat: { top: 0.45, front: 0.25, back: -0.31, lean: [0.1, 0.22], solid: true },
  corner_sofa: { top: 0.455, front: 0.42, back: -0.1, lean: [0.2, 0.3], solid: true },
  floor_cushions: { top: 0.31, front: 0.3, back: null, rear: -0.25, lean: [0.05, 0.05] },
  // (the front row's: one seat a kind — a back row's sitter needs a seat by the tile, see the plan)
  bleachers: { top: 0.42, front: 0.24, back: null, rear: -0.08, lean: [0, 0] },
  // (sat across it, leant back into the cloth rising behind)
  hammock: { top: 0.48, front: 0.32, back: -0.28, lean: [0.3, 0.45] },
};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {};
export const HANGS: Record<string, [number, number, number]> = {};
