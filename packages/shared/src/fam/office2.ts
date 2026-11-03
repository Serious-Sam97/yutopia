import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, cyl, isoPx, type KindShape, one } from "./units.ts";

// Plan 68 phase 6 (docs/plan/68-more-furniture.md): Office — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/office2.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts).

/** What things stand on, m: the security desk's top (a desk's), the sorting desk's (a counter's). */
export const SURFACES: Record<string, number> = {
  security_desk: 0.74,
  sorting_desk: 0.9,
};

export const CATALOG = {
  mobile_whiteboard: { label: "Mobile whiteboard", w: 2, h: 1, solid: true, buildable: true, variants: 2, look: 0 },
  punch_clock: {
    label: "Punch clock",
    w: 1,
    h: 1,
    solid: false,
    wall: true,
    buildable: true,
    variants: 2,
    look: 0,
  },
  tube_station: { label: "Pneumatic tube station", w: 1, h: 1, solid: true, buildable: true, variants: 2, look: 0 },
  paper_shredder: { label: "Paper shredder", w: 1, h: 1, solid: true, buildable: true },
  plotter: { label: "Plotter", w: 2, h: 1, solid: true, buildable: true },
  // a cold drink in hand, as the vending machine's
  drinks_fridge: {
    label: "Drinks fridge",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    interact: "vending",
    light: { color: 0xdcecff, radius: 1.8, intensity: 0.28, h: 1.2 },
  },
  security_desk: {
    label: "Security desk",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    surface: isoPx(SURFACES.security_desk),
    top: [1, 2, 7, 4], // (its front: the monitors and the camera keyboard behind)
    light: { color: 0xa8c8d8, radius: 2, intensity: 0.25, h: 1.1 },
  },
  fire_extinguisher: {
    label: "Fire extinguisher",
    w: 1,
    h: 1,
    solid: false,
    wall: true,
    buildable: true,
    variants: 2,
    look: 0,
  },
  first_aid_cabinet: {
    label: "First-aid cabinet",
    w: 1,
    h: 1,
    solid: false,
    wall: true,
    buildable: true,
    variants: 2,
    look: 0,
  },
  sorting_desk: {
    label: "Mail sorting desk",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    surface: isoPx(SURFACES.sorting_desk),
    top: [1, 2, 7, 4], // (its front: the pigeonholes behind, the scale and the stamp at its ends)
  },
} satisfies Record<string, CatalogEntry>;

export const SHAPES = {
  mobile_whiteboard: one(box(0.1, 0.42, 1.9, 0.6, 0.16, 2.03), box(0.1, 0.12, 1.9, 0.88, 0, 0.16)),
  punch_clock: one(box(0.06, 0.1, 0.94, 0.3, 0.99, 1.66)),
  tube_station: one(
    box(0.19, 0.21, 0.81, 0.84, 0, 0.99),
    cyl(0.5, 0.33, 0.12, 0.99, 3.27),
    box(0.47, 0.02, 0.53, 0.21, 2.23, 2.27), // (its bracket to the wall)
  ),
  paper_shredder: one(box(0.28, 0.33, 0.72, 0.68, 0, 0.62), box(0.38, 0.44, 0.62, 0.5, 0.62, 0.76)),
  plotter: one(box(0.1, 0.15, 1.9, 0.85, 0, 1.13)),
  drinks_fridge: one(box(0.19, 0.17, 0.81, 0.84, 0, 1.96)),
  security_desk: one(box(0.05, 0.05, 1.95, 0.95, 0, 0.74), box(0.28, 0.08, 1.72, 0.4, 0.74, 1.42)),
  fire_extinguisher: one(box(0.36, 0.1, 0.62, 0.31, 0.55, 1.53)),
  first_aid_cabinet: one(box(0.26, 0.1, 0.74, 0.27, 1.18, 1.64)),
  sorting_desk: one(box(0.05, 0.05, 1.95, 0.95, 0, 0.9), box(0.07, 0.05, 1.93, 0.37, 0.9, 1.64)),
} satisfies Record<string, KindShape>;

export const SEATS: Record<string, SeatSpec> = {};
/** Stood on, m: the drinks fridge's top. */
export const STANDS: Record<string, number> = {
  drinks_fridge: 1.96,
};
export const HANGS: Record<string, [number, number, number]> = {
  // (the clock between its card racks; the extinguisher under its sign; the cabinet)
  punch_clock: [4, 39, 65],
  fire_extinguisher: [2, 21, 60],
  first_aid_cabinet: [2, 46, 65],
};
