import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, cyl, type KindShape, one } from "./units.ts";

// Plan 68 phase 18 (docs/plan/68-more-furniture.md): Kitchen & café — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/kitchen.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts).
// At the kitchen counter's height (0.90, tables.ts) and the fridge's and microwave's care (staples.ts).
// The island's stools are a seat kind of their own (`counter_stool`, at a counter's 0.65), set at its
// overhang as the bar stool is at a high table: the island stays a surface.

/** The tops things stand on and the seat sat on, m. */
const TOP = {
  kitchen_island: 0.9,
  kitchen_stove: 0.93, // (on the hob's trivets)
  dishwasher: 0.9,
  cafe_counter: 0.9,
};
export const SURFACES: Record<string, number> = TOP;

export const CATALOG = {
  kitchen_island: {
    label: "Kitchen island",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    paint: true,
    surface: TOP.kitchen_island,
  },
  counter_stool: {
    label: "Counter stool",
    w: 1,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    variants: 3,
    look: 0,
    paint: true,
  },
  kitchen_stove: {
    label: "Range cooker",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    interact: "lamp", // (the hob lit and out)
    surface: TOP.kitchen_stove,
    top: [0, 1, 4, 4], // (the hob, before its backguard)
    light: { color: 0xffa860, radius: 1.8, intensity: 0.22 },
  },
  kitchen_sink: { label: "Sink unit", w: 1, h: 1, solid: true, buildable: true, variants: 3, look: 0, paint: true },
  dishwasher: {
    label: "Dishwasher",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    surface: TOP.dishwasher,
  },
  fruit_bowl: { label: "Fruit bowl", w: 1, h: 1, solid: false, onSurface: true, buildable: true, variants: 3, look: 0 },
  toaster: { label: "Toaster", w: 1, h: 1, solid: false, onSurface: true, buildable: true, variants: 3, look: 0 },
  kettle: {
    label: "Kettle",
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    buildable: true,
    variants: 3,
    look: 0,
    interact: "tea", // (a tea, in a mug)
  },
  cafe_counter: {
    label: "Café counter",
    w: 3,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    surface: TOP.cafe_counter,
    top: [5, 0, 12, 4], // (the till's end: the pastry case takes the left)
    light: { color: 0xffe6bc, radius: 2.4, intensity: 0.3 },
  },
  ice_cream_freezer: {
    label: "Ice-cream freezer",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    interact: "icecream",
  },
} satisfies Record<string, CatalogEntry>;

export const SHAPES = {
  // (the cabinets and top, then the top's overhang over the stools' knees)
  kitchen_island: one(box(0.02, 0.02, 1.98, 0.74, 0, 0.9), box(0.02, 0.74, 1.98, 0.98, 0.86, 0.9)),
  counter_stool: one(cyl(0.5, 0.5, 0.22, 0, 0.9)),
  // (the range to its hob's trivets, then its backguard, the knobs' rail out front)
  kitchen_stove: one(box(0.05, 0.06, 0.95, 0.96, 0, TOP.kitchen_stove), box(0.05, 0.06, 0.95, 0.2, 0.93, 1.1)),
  // (the unit to its worktop, then the tap)
  kitchen_sink: one(box(0.02, 0.03, 0.98, 0.97, 0, 0.9), box(0.42, 0.08, 0.58, 0.32, 0.9, 1.25)),
  dishwasher: one(box(0.02, 0.03, 0.98, 0.97, 0, 0.9)),
  fruit_bowl: one(box(0.29, 0.29, 0.71, 0.71, 0, 0.2)),
  toaster: one(box(0.33, 0.39, 0.67, 0.61, 0, 0.22)),
  kettle: one(box(0.36, 0.37, 0.64, 0.63, 0, 0.27)),
  // (the counter to its top, then the pastry case on its left)
  cafe_counter: one(box(0.02, 0.04, 2.98, 0.96, 0, 0.9), box(0.06, 0.1, 1.24, 0.9, 0.9, 1.4)),
  ice_cream_freezer: one(box(0.22, 0.14, 1.78, 0.86, 0, 0.9)),
} satisfies Record<string, KindShape>;

export const SEATS: Record<string, SeatSpec> = {
  // (a counter stool at the island's overhang: a bar stool's, lower, its low back not leant on)
  counter_stool: { top: 0.65, front: 0.17, back: null, rear: -0.17, lean: [0, 0], rest: 0.25 },
};
export const STANDS: Record<string, number> = {
  kitchen_sink: 0.9,
};
export const HANGS: Record<string, [number, number, number]> = {};
