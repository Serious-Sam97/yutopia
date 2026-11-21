import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, cyl, type KindShape, one } from "./units.ts";

// Plan 113 (docs/plan/113-the-furniture-by-hand.md, F3a): the town's buildings' own pieces — what their insides
// had as fits and the catalog hadn't: a double bed and a wardrobe for the farmhouse; a diner's booth (its benches
// and its table, set across from the windows); a bar counter with its foot rail and a back bar (the tavern's, the
// diner's); hay bales and stacks and a horse stall for the barn; a grocery's shelves, checkout and produce stand.
// Their catalog entries, shapes (from their models: the client's world/furn/fam/town.ts), seats, surfaces, spread
// into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts). Measures from life
// (design/furniture-by-hand/refs.md): a bar's top at 1.07 over a 0.76 stool, a booth's seat at 0.46 by a
// 0.76 table, a full bed 1.37 × 1.91 on its frame, a small square bale 0.9 × 0.46 × 0.36, a stall 3.0 × 3.6.

/** The tops things stand on, m. */
const TOP = {
  pub_table: 0.75,
  farm_table: 0.76,
  booth_table: 0.76,
  bar_counter: 1.07,
  back_bar: 0.92,
  checkout: 0.9,
};
export const SURFACES: Record<string, number> = TOP;

export const CATALOG = {
  double_bed: {
    label: "Double bed",
    w: 2,
    h: 3,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    paint: true,
  },
  wardrobe: { label: "Wardrobe", w: 2, h: 1, solid: true, buildable: true, variants: 3, look: 0, paint: true },
  // (a bar's or a diner's table for four: 0.76 square — the catalog's card table is a baize one)
  pub_table: {
    label: "Table for four",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    surface: TOP.pub_table,
    top: [1, 1, 3, 3],
  },
  // (a kitchen's or a dining room's table for six: 1.8 × 0.9 — the catalog's dining table is a boardroom's)
  farm_table: {
    label: "Farmhouse table",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    surface: TOP.farm_table,
    top: [0, 0, 3, 4], // (its left end: the jug and bowl at its middle)
  },
  // (a diner's booth: two benches facing over its table, the table's end at the window)
  booth_seat: {
    label: "Booth bench",
    w: 2,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    variants: 3,
    look: 0,
    paint: true,
  },
  booth_table: {
    label: "Booth table",
    w: 1,
    h: 2,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    surface: TOP.booth_table,
    top: [1, 1, 3, 4], // (its middle: the napkins and the cruet by the window)
  },
  bar_counter: {
    label: "Bar counter",
    w: 3,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    surface: TOP.bar_counter,
    top: [0, 0, 12, 3], // (the top, back from its overhang's edge)
  },
  back_bar: {
    label: "Back bar",
    w: 3,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    surface: TOP.back_bar,
    top: [0, 1, 12, 2],
    light: { color: 0xffd9a0, radius: 2.6, intensity: 0.28 },
  },
  hay_bale: { label: "Hay bale", w: 1, h: 1, solid: false, seat: true, buildable: true, variants: 2, look: 0 },
  hay_stack: { label: "Hay stack", w: 2, h: 2, solid: true, buildable: true, variants: 2, look: 0 },
  horse_stall: { label: "Horse stall", w: 3, h: 4, solid: true, buildable: true, variants: 3, look: 0 },
  grocery_shelf: {
    label: "Grocery shelves",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
  },
  checkout: {
    label: "Checkout",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    surface: TOP.checkout,
    top: [6, 1, 8, 3], // (the bagging end: the till and belt take the rest)
  },
  produce_stand: { label: "Produce stand", w: 2, h: 1, solid: true, buildable: true, variants: 2, look: 0 },
} satisfies Record<string, CatalogEntry>;

export const SHAPES = {
  // (its frame to the mattress's top, the headboard to its top against the wall, the footboard)
  double_bed: one(
    box(0.3, 0.02, 1.7, 2.12, 0, 0.58),
    box(0.28, 0, 1.72, 0.07, 0.58, 1.18),
    box(0.3, 2.06, 1.7, 2.12, 0.58, 0.72),
  ),
  wardrobe: one(box(0.38, 0.02, 1.62, 0.62, 0, 2.02)),
  farm_table: one(box(0.1, 0.05, 1.9, 0.95, 0, TOP.farm_table)),
  pub_table: one(box(0.12, 0.12, 0.88, 0.88, 0, TOP.pub_table)),
  // (the seat, then its high back against the next booth's)
  booth_seat: one(box(0.4, 0.14, 1.6, 0.66, 0, 0.46), box(0.4, 0.02, 1.6, 0.16, 0.46, 1.12)),
  // (its top; the bracket at the window and the pedestal under its far end)
  booth_table: one(box(0.12, 0.0, 0.88, 1.18, 0.72, TOP.booth_table), cyl(0.5, 0.9, 0.06, 0, 0.72)),
  // (the bar to its top, the top's overhang over the customers' knees, the foot rail)
  bar_counter: one(
    box(0.02, 0.1, 2.98, 0.66, 0, TOP.bar_counter - 0.05),
    box(0.0, 0.04, 3.0, 0.82, TOP.bar_counter - 0.05, TOP.bar_counter),
    box(0.02, 0.82, 2.98, 0.9, 0.16, 0.24),
  ),
  // (the cabinets to their top; the mirror and shelves to the crown, against the wall)
  // (the diner's look is low — its urns and pie case to 1.45 — the shape the tavern's, its mirror to the crown)
  back_bar: one(box(0.02, 0.02, 2.98, 0.62, 0, TOP.back_bar), box(0.02, 0.0, 2.98, 0.3, TOP.back_bar, 2.42)),
  hay_bale: one(box(0.05, 0.27, 0.95, 0.73, 0, 0.36)),
  hay_stack: one(box(0.04, 0.04, 1.96, 1.96, 0, 1.08), box(0.1, 0.5, 1.9, 1.5, 1.08, 1.44)),
  // (its two sides, its front with its sliding door shut)
  // (its front as thick as its door's run on its track: a walker meets it)
  // (its back boarded too: a box stall stood anywhere is shut on all four sides)
  horse_stall: one(
    box(0, 0.02, 0.07, 3.8, 0, 2.2),
    box(2.93, 0.02, 3.0, 3.8, 0, 2.2),
    box(0, 3.8, 3.0, 3.98, 0, 2.31),
    box(0.07, 0.0, 2.93, 0.08, 0, 1.4),
  ),
  grocery_shelf: one(box(0.04, 0.06, 1.96, 0.94, 0, 1.62)),
  // (the counter, the till's stand, the sweets rack low on the customers' side)
  checkout: one(
    box(0.05, 0.1, 1.95, 0.75, 0, TOP.checkout),
    box(0.15, 0.2, 0.55, 0.55, TOP.checkout, 1.25),
    box(1.35, 0.75, 1.85, 0.99, 0, 0.75),
  ),
  produce_stand: one(box(0.04, 0.05, 1.96, 0.95, 0, 0.92)),
} satisfies Record<string, KindShape>;

export const SEATS: Record<string, SeatSpec> = {
  // (a booth's bench: its seat at 0.46 by a 0.76 table, its back upright, high)
  booth_seat: { top: 0.46, front: 0.16, back: -0.34, lean: [0.04, 0.12], solid: true },
  // (sat on a bale: its top, no back)
  hay_bale: { top: 0.36, front: 0.23, back: null, lean: [0, 0] },
};
/** The models' tops, stood on (furniture.ts STAND). */
export const STANDS: Record<string, number> = {
  double_bed: 0.58,
  wardrobe: 2.02,
  hay_stack: 1.44,
  horse_stall: 2.2,
  grocery_shelf: 1.62,
  produce_stand: 0.92,
};
export const HANGS: Record<string, [number, number, number]> = {};
