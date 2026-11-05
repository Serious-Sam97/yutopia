import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, cyl, type KindShape, one } from "./units.ts";

// Plan 68 phase 5 (docs/plan/68-more-furniture.md): Storage — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/storage2.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts).

/** What things stand on, m: the plan chest's top, the safe's. */
export const SURFACES: Record<string, number> = {
  plan_chest: 0.9,
  office_safe: 0.78,
};

export const CATALOG = {
  // flip-through bins of records on a stand (a record picked → the radio: not yet, a hook)
  record_crates: { label: "Record crates", w: 1, h: 1, solid: true, buildable: true, variants: 2, look: 0 },
  plan_chest: {
    label: "Plan chest",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    surface: SURFACES.plan_chest,
    top: [1, 0, 7, 3], // (its top board, over the drawers)
  },
  // lit inside (switched as a lamp), its trophies by its seed
  display_cabinet: {
    label: "Display cabinet",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    interact: "lamp",
    light: { color: 0xfff0cc, radius: 1.6, intensity: 0.25, h: 1.7 },
  },
  ladder_bookcase: { label: "Library bookcase", w: 3, h: 1, solid: true, buildable: true, variants: 2, look: 0 },
  mail_cubbies: { label: "Mail cubbies", w: 2, h: 1, solid: true, buildable: true, variants: 2, look: 0 },
  office_safe: {
    label: "Safe",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    surface: SURFACES.office_safe,
    top: [1, 1, 3, 3],
  },
  shoe_rack: { label: "Shoe & boot rack", w: 1, h: 1, solid: true, buildable: true, variants: 2, look: 0 },
  umbrella_stand: { label: "Umbrella stand", w: 1, h: 1, solid: true, buildable: true, variants: 2, look: 0 },
  cassette_rack: {
    label: "Cassette wall rack",
    w: 1,
    h: 1,
    solid: false,
    wall: true,
    buildable: true,
    variants: 2,
    look: 0,
  },
} satisfies Record<string, CatalogEntry>;

export const SHAPES = {
  record_crates: one(box(0.06, 0.24, 0.94, 0.76, 0, 0.46), box(0.1, 0.28, 0.9, 0.8, 0.46, 0.98)),
  plan_chest: one(box(0.17, 0.04, 1.83, 0.84, 0, 0.9), box(0.22, 0.84, 1.78, 0.99, 0.1, 0.86)),
  display_cabinet: one(box(0.13, 0.31, 0.87, 0.82, 0, 1.85)),
  ladder_bookcase: one(box(0.04, 0.06, 2.96, 0.46, 0, 2.6), box(1.27, 0.46, 1.73, 0.97, 0, 2.42)), // (the case, its ladder)
  mail_cubbies: one(box(0.08, 0.32, 1.92, 0.94, 0, 0.9), box(0.1, 0.32, 1.9, 0.68, 0.9, 1.9)),
  office_safe: one(box(0.19, 0.21, 0.81, 0.82, 0, 0.78), box(0.4, 0.82, 0.6, 0.88, 0.2, 0.58)),
  shoe_rack: one(box(0.07, 0.28, 0.93, 0.7, 0, 0.74)),
  umbrella_stand: one(cyl(0.5, 0.5, 0.135, 0, 0.98)), // (the stand; its umbrellas lean no further out than its rim)
  cassette_rack: one(box(0.12, 0.1, 0.88, 0.23, 1.04, 2.03)),
} satisfies Record<string, KindShape>;

export const SEATS: Record<string, SeatSpec> = {};
/** Stood on, m: the display cabinet's cornice. */
export const STANDS: Record<string, number> = {
  display_cabinet: 1.85,
};
export const HANGS: Record<string, [number, number, number]> = {
  // (its two banks of tapes, the ledge with what's on it)
  cassette_rack: [4, 1.0462, 2.0415],
};
