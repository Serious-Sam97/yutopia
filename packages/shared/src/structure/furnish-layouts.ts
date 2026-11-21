// The town's furnished buildings' layouts, by hand (docs/plan/113-the-furniture-by-hand.md), and the stairs of every
// other building with storeys. In each building's own frame (structure/furnishings.ts): from outside facing its
// door, `u` along its front from the left, `v` in from the front; a piece's footprint's middle and the way its front
// looks. Measured from life (design/furniture-by-hand/refs.md): a bar's back bar 0.95 behind its counter, its
// stools 0.68 apart; a booth's benches 1.9 a booth back to back; a 4-top's chairs pulled up to its edge; aisles
// 1.2 m and more; a shop's checkout by its door, its coolers on the back wall.
import type { Face, Layout, Piece } from "./furnishings.ts";

// ── the patterns rooms are made of ──
/** A diner's (or a bar's) booth: its table's end at the wall, a bench each side facing over it; `at` where along
 *  the wall its first bench's back stands. Walls: the building's left (u 0), right (u W), front (v 0), back (v D). */
function booth(wall: "left" | "right" | "front" | "back", at: number, W: number, D: number, v = 0): Piece[] {
  const t = 0.1; // (the wall's inner face)
  const along = (k: number) => at + k;
  if (wall === "left")
    return [
      { kind: "booth_table", u: t + 1.0, v: along(0.94), face: "right", variant: v },
      { kind: "booth_seat", u: t + 0.6, v: along(0.48), face: "in", variant: v },
      { kind: "booth_seat", u: t + 0.6, v: along(1.4), face: "out", variant: v },
    ];
  if (wall === "right")
    return [
      { kind: "booth_table", u: W - t - 1.0, v: along(0.94), face: "left", variant: v },
      { kind: "booth_seat", u: W - t - 0.6, v: along(0.48), face: "in", variant: v },
      { kind: "booth_seat", u: W - t - 0.6, v: along(1.4), face: "out", variant: v },
    ];
  if (wall === "front")
    return [
      { kind: "booth_table", u: along(0.94), v: t + 1.0, face: "in", variant: v },
      { kind: "booth_seat", u: along(0.48), v: t + 0.6, face: "right", variant: v },
      { kind: "booth_seat", u: along(1.4), v: t + 0.6, face: "left", variant: v },
    ];
  return [
    { kind: "booth_table", u: along(0.94), v: D - t - 1.0, face: "out", variant: v },
    { kind: "booth_seat", u: along(0.48), v: D - t - 0.6, face: "right", variant: v },
    { kind: "booth_seat", u: along(1.4), v: D - t - 0.6, face: "left", variant: v },
  ];
}
/** A table for four (0.76 square: the bar's oak, the diner's Formica) with a chair pulled up to each side (bentwood:
 *  variant 2), its seat's front at the table's edge. */
function fourTop(u: number, v: number, storey = 0, chair = 2, table = 0): Piece[] {
  const d = 0.72;
  return [
    { kind: "pub_table", u, v, face: "in", storey, variant: table },
    { kind: "chair", u, v: v - d, face: "in", variant: chair, storey },
    { kind: "chair", u, v: v + d, face: "out", variant: chair, storey },
    { kind: "chair", u: u - d, v, face: "right", variant: chair, storey },
    { kind: "chair", u: u + d, v, face: "left", variant: chair, storey },
  ];
}
/** A pub's high table by its window, a bar stool either side of it. */
function highTop(u: number, v: number, storey = 0): Piece[] {
  return [
    { kind: "high_table", u, v, face: "in", storey },
    { kind: "bar_stool", u: u - 0.6, v, face: "right", storey },
    { kind: "bar_stool", u: u + 0.6, v, face: "left", storey },
  ];
}
/** Pieces in a row along v at u (each `step` apart from `from`, `n` of them), all one way. */
function rowV(
  kind: string,
  u: number,
  from: number,
  step: number,
  n: number,
  face: Face,
  extra: Partial<Piece> = {},
): Piece[] {
  return Array.from({ length: n }, (_, i) => ({ kind, u, v: from + i * step, face, ...extra }));
}
function rowU(
  kind: string,
  v: number,
  from: number,
  step: number,
  n: number,
  face: Face,
  extra: Partial<Piece> = {},
): Piece[] {
  return Array.from({ length: n }, (_, i) => ({ kind, u: from + i * step, v, face, ...extra }));
}

// ── the bar (16 × 16, its shopfront glass to the floor, party walls each side; two storeys) ──
// The bar down the right-hand wall (a tavern's long counter, its back bar 0.95 behind, 13 stools), booths along the
// left-hand wall, four 4-tops between, high tables at the window, the jukebox by the booths; the stairs across the
// back, up to its function room: the pool table, a sofa by the windows, high tables.
const BAR: Layout = {
  stairs: { u: 6, v: 12, face: "left" },
  pieces: [
    // (from 3 m in from the glass to the back: seen from the door, the back wall free — refs.md §1)
    ...rowV("back_bar", 15.4, 4.5, 3, 3, "left", { variant: 0 }),
    ...rowV("bar_counter", 13.93, 4.5, 3, 3, "left", { variant: 0 }),
    ...rowV("bar_stool", 13.2, 3.4, 0.62, 14, "right"),
    ...[2.4, 4.3, 6.2, 8.1, 10.0].flatMap((v) => booth("left", v, 16, 16, 2)),
    ...fourTop(4.6, 5.2),
    ...fourTop(8.4, 5.2),
    ...fourTop(4.6, 9.0),
    ...fourTop(8.4, 9.0),
    ...highTop(3.0, 1.4),
    ...highTop(5.6, 1.4),
    ...highTop(11.2, 1.4),
    { kind: "jukebox", u: 0.6, v: 12.6, face: "right" },
    // upstairs: the function room
    { kind: "pool_table", u: 7.0, v: 6.0, face: "in", storey: 1 },
    { kind: "sofa", u: 0.55, v: 4.6, face: "right", storey: 1 },
    { kind: "coffee_table", u: 1.75, v: 4.6, face: "right", storey: 1 },
    ...highTop(13.6, 4.6, 1),
    ...highTop(13.6, 8.0, 1),
  ],
};

// ── the diner (18 × 14, windows all round, its door in the middle of its front; one storey) ──
// Its counter across the back with 13 chrome stools, the back counter under the back windows (the pastry case, the
// griddles, the prep counters); booths along the front windows each side of the door and along both ends; four
// 4-tops between; the jukebox by the counter's end.
const DINER: Layout = {
  pieces: [
    { kind: "cafe_counter", u: 7.0, v: 13.4, face: "out", variant: 2, atWindow: true },
    { kind: "kitchen_stove", u: 9.0, v: 13.4, face: "out", variant: 1, atWindow: true },
    { kind: "kitchen_stove", u: 10.0, v: 13.4, face: "out", variant: 1, atWindow: true },
    { kind: "counter", u: 11.5, v: 13.4, face: "out", atWindow: true },
    { kind: "counter", u: 13.5, v: 13.4, face: "out", atWindow: true },
    ...rowU("bar_counter", 11.48, 7, 3, 3, "out", { variant: 1 }),
    ...rowU("bar_stool", 10.74, 6.0, 0.68, 13, "in", { variant: 1 }),
    ...[0.1, 2.0, 3.9, 5.8, 10.3, 12.2, 14.1, 16.0].flatMap((u) => booth("front", u, 18, 14, 0)),
    ...[2.4, 4.3, 6.2, 8.1].flatMap((v) => [...booth("left", v, 18, 14, 0), ...booth("right", v, 18, 14, 0)]),
    ...fourTop(4.8, 5.0, 0, 2, 1),
    ...fourTop(4.8, 8.0, 0, 2, 1),
    ...fourTop(13.2, 5.0, 0, 2, 1),
    ...fourTop(13.2, 8.0, 0, 2, 1),
    // (at the counter's end, facing the room: every wall's windows)
    { kind: "jukebox", u: 4.85, v: 11.48, face: "out" },
  ],
};

// ── the market (16 × 16, shopfront glass, a back door; a stockroom upstairs) ──
// The checkout left of the door facing the aisles, the ice-cream freezer by it; produce right of the door; wall
// shelves down the left and right; gondolas front to back with a 3 m main aisle off the door; the coolers along
// the back wall; the stairs in the back right corner up to the stockroom's shelving and its desk.
const MARKET: Layout = {
  stairs: { u: 12, v: 9, face: "out" },
  pieces: [
    { kind: "checkout", u: 5.6, v: 2.0, face: "in" },
    { kind: "ice_cream_freezer", u: 3.2, v: 2.0, face: "in" },
    // (past the first 2.5 m in from the door: its landing strip kept clear — refs.md §3)
    { kind: "produce_stand", u: 11.0, v: 3.4, face: "out" },
    { kind: "produce_stand", u: 13.2, v: 3.4, face: "out", variant: 1 },
    ...rowV("grocery_shelf", 0.54, 3.6, 2, 5, "right"),
    ...rowV("grocery_shelf", 15.46, 3.6, 2, 3, "left"),
    ...rowV("grocery_shelf", 3.4, 5.2, 2, 4, "right"),
    ...rowV("grocery_shelf", 6.0, 5.2, 2, 4, "right"),
    ...rowV("grocery_shelf", 10.0, 5.2, 2, 4, "left"),
    { kind: "grocery_shelf", u: 12.6, v: 5.2, face: "left" },
    ...rowU("drinks_fridge", 15.55, 5.6, 0.64, 10, "out"),
    // the stockroom
    ...rowV("shelving", 0.3, 4.6, 3.4, 3, "right", { storey: 1 }),
    ...rowU("shelving", 15.7, 4.6, 3.4, 2, "out", { storey: 1 }),
    { kind: "desk", u: 6.0, v: 5.0, face: "in", storey: 1 },
    { kind: "chair", u: 6.0, v: 5.85, face: "out", storey: 1 },
  ],
};

// ── the farmhouse (14 × 12, a centre hall, two storeys of 2.67 and 2.9) ──
// In at the front door: the hall with the stairs straight ahead; the parlour on the left (the fire on its end wall,
// the sofa facing it, armchairs), the dining room on the right (its table for six, the bookcase); the kitchen across
// the back (the range, the counters, the sink under the window, the fridge), its back door. Upstairs: a bedroom each
// side of the hall (a double bed with its head to the hall wall, its nightstands, a wardrobe between the front windows), and
// a reading corner at the back.
const FARMHOUSE: Layout = {
  stairs: { u: 5, v: 2, face: "out" },
  walls: [
    // the hall's walls, an opening each side by the front door
    { storey: 0, a: [5, 0.1], b: [5, 1.0] },
    { storey: 0, a: [5, 2.1], b: [5, 7] },
    { storey: 0, a: [9, 0.1], b: [9, 1.0] },
    { storey: 0, a: [9, 2.1], b: [9, 7] },
    // the front rooms' back walls, an opening each into the kitchen
    { storey: 0, a: [0.1, 7], b: [2.0, 7] },
    { storey: 0, a: [3.0, 7], b: [5, 7] },
    { storey: 0, a: [9, 7], b: [11.0, 7] },
    { storey: 0, a: [12.0, 7], b: [13.9, 7] },
    // upstairs: the bedrooms' walls, their doorways off the hall by the landing
    { storey: 1, a: [5, 0.1], b: [5, 0.4] },
    { storey: 1, a: [5, 1.4], b: [5, 9] },
    { storey: 1, a: [9, 0.1], b: [9, 0.4] },
    { storey: 1, a: [9, 1.4], b: [9, 9] },
  ],
  pieces: [
    // the parlour
    { kind: "fireplace", u: 0.6, v: 4.4, face: "right" },
    { kind: "sofa", u: 4.35, v: 4.4, face: "left", variant: 1 },
    { kind: "coffee_table", u: 3.0, v: 4.4, face: "left" },
    { kind: "rug", u: 2.6, v: 4.4, face: "left" },
    { kind: "armchair", u: 2.0, v: 2.4, face: "in", variant: 1 },
    { kind: "rocking_chair", u: 2.0, v: 6.3, face: "out" },
    // the dining room
    { kind: "farm_table", u: 11.3, v: 3.8, face: "left" },
    ...rowV("chair", 10.45, 3.3, 1.0, 2, "right", { variant: 2 }),
    ...rowV("chair", 12.15, 3.3, 1.0, 2, "left", { variant: 2 }),
    { kind: "chair", u: 11.3, v: 2.45, face: "in", variant: 2 },
    { kind: "chair", u: 11.3, v: 5.15, face: "out", variant: 2 },
    { kind: "bookcase", u: 13.4, v: 4.4, face: "left" },
    // the kitchen
    { kind: "kitchen_stove", u: 5.5, v: 11.4, face: "out", variant: 0 },
    { kind: "counter", u: 7.0, v: 11.4, face: "out" },
    { kind: "kitchen_sink", u: 8.45, v: 11.4, face: "out", variant: 0, atWindow: true },
    { kind: "dishwasher", u: 9.4, v: 11.4, face: "out", variant: 1 },
    { kind: "fridge", u: 12.6, v: 11.4, face: "out" },
    { kind: "cupboard", u: 0.6, v: 10.8, face: "right" },
    { kind: "coat_rack", u: 2.0, v: 11.35, face: "out" },
    // (the kitchen's own table, for four, by its side window)
    { kind: "farm_table", u: 2.3, v: 9.2, face: "in", variant: 0 },
    { kind: "chair", u: 1.8, v: 8.35, face: "in", variant: 2 },
    { kind: "chair", u: 2.8, v: 8.35, face: "in", variant: 2 },
    { kind: "chair", u: 1.8, v: 10.05, face: "out", variant: 2 },
    { kind: "chair", u: 2.8, v: 10.05, face: "out", variant: 2 },
    // upstairs: the bedrooms
    { kind: "double_bed", u: 3.35, v: 5.0, face: "left", variant: 0, storey: 1 },
    { kind: "bedside_table", u: 4.5, v: 3.6, face: "left", storey: 1 },
    { kind: "bedside_table", u: 4.5, v: 6.4, face: "left", storey: 1 },
    { kind: "wardrobe", u: 3.55, v: 0.6, face: "in", variant: 0, storey: 1 },
    { kind: "runner_rug", u: 1.4, v: 5.0, face: "right", storey: 1 },
    { kind: "rocking_chair", u: 1.2, v: 9.8, face: "in", skew: 30, storey: 1 },
    { kind: "double_bed", u: 10.65, v: 5.0, face: "right", variant: 1, storey: 1 },
    { kind: "bedside_table", u: 9.5, v: 3.6, face: "right", storey: 1 },
    { kind: "bedside_table", u: 9.5, v: 6.4, face: "right", storey: 1 },
    { kind: "wardrobe", u: 10.45, v: 0.6, face: "in", variant: 1, storey: 1 },
    { kind: "runner_rug", u: 12.6, v: 5.0, face: "left", storey: 1 },
    { kind: "armchair", u: 12.8, v: 9.8, face: "in", skew: -30, variant: 1, storey: 1 },
    // the reading corner behind the stairs, between the bedrooms
    { kind: "bookcase", u: 7.0, v: 11.4, face: "out", storey: 1 },
    { kind: "armchair", u: 7.0, v: 10.0, face: "in", variant: 0, storey: 1 },
  ],
};

// ── the barn (18 wide × 24 deep, its big door in the front's middle; a hay loft over) ──
// Its drive floor down the middle from the big door; a row of box stalls along each side wall, their backs to it,
// their doors on the floor; the workbench by the door, hay stacked at the back, a couple of bales to sit on; the
// stairs up in the back corner to the loft, its hay mow.
const BARN: Layout = {
  stairs: { u: 14, v: 17, face: "out" },
  pieces: [
    ...rowV("horse_stall", 2.1, 5.5, 3.0, 5, "right", { atWindow: true, variant: 1 }),
    ...rowV("horse_stall", 15.9, 5.5, 3.0, 4, "left", { atWindow: true, variant: 1 }),
    { kind: "workbench", u: 1.9, v: 0.6, face: "in" },
    { kind: "hay_stack", u: 7.0, v: 22.8, face: "out" },
    { kind: "hay_stack", u: 9.1, v: 22.8, face: "out", variant: 1 },
    { kind: "hay_stack", u: 7.0, v: 20.7, face: "out" },
    { kind: "hay_bale", u: 12.0, v: 3.0, face: "left" },
    { kind: "hay_bale", u: 12.4, v: 4.0, face: "left", skew: 20 },
    // the loft's hay
    ...[2.0, 4.1, 6.2, 8.3, 10.4].flatMap((u) => [
      { kind: "hay_stack", u, v: 2.2, face: "in" as const, storey: 1 },
      { kind: "hay_stack", u, v: 4.3, face: "in" as const, storey: 1 },
    ]),
    ...[3.0, 5.1, 7.2].flatMap((v) => [{ kind: "hay_stack", u: 2.0, v: 6.4 + v, face: "in" as const, storey: 1 }]),
    // (a mow's worth down the other side, clear of the stairs' well at the back)
    ...[2.2, 4.3, 6.4, 8.5, 10.6, 12.7].flatMap((v) => [
      { kind: "hay_stack", u: 16.0, v, face: "in" as const, storey: 1, variant: 1 },
      { kind: "hay_stack", u: 13.9, v, face: "in" as const, storey: 1 },
    ]),
    { kind: "hay_bale", u: 9.0, v: 8.0, face: "in", storey: 1 },
    { kind: "hay_bale", u: 9.6, v: 9.0, face: "left", skew: 15, storey: 1 },
  ],
};

// ── the gatehouse (6 × 5, glass round three sides, its door in the solid one; one storey) ──
// The guard's desk under a side window's sill, looking along the road, the chair at it; the supply locker against the
// solid wall by the door, a coat rack; a table and chair for a break at the back.
const GATEHOUSE: Layout = {
  pieces: [
    // (a desk under the sill of a side window, looking along the road; no monitors before the glass — refs.md §6)
    { kind: "desk", u: 5.4, v: 2.2, face: "left", variant: 1 },
    { kind: "chair", u: 4.5, v: 2.2, face: "right", variant: 1 },
    { kind: "locker", u: 1.3, v: 0.6, face: "in" },
    { kind: "coat_rack", u: 4.2, v: 0.5, face: "in" },
    // (the break corner at the back)
    { kind: "pub_table", u: 1.0, v: 4.2, face: "in" },
    { kind: "chair", u: 1.0, v: 3.45, face: "in", variant: 2 },
  ],
};

export const FURNISHED: Record<string, Layout> = {
  bar: BAR,
  diner: DINER,
  market: MARKET,
  farmhouse: FARMHOUSE,
  barn: BARN,
  gatehouse: GATEHOUSE,
};

/** The stairs of the buildings with storeys and no furniture of theirs: by hand, clear of the door and its way in.
 *  A house (8 × 10) up from its hall along its right-hand wall, its door toward the front door, as a narrow house's
 *  run; a shop's (14 × 14) in its back corner away from its back door (its stockroom over); the hall's (26 × 20) in
 *  its back corner; the hotel's (20 × 22) off its lobby along its right-hand wall. */
const HOUSE = { u: 4, v: 3, face: "out" as const };
const SHOP = { u: 10, v: 7, face: "out" as const };
export const STAIRS: Record<string, { u: number; v: number; face: Face }> = {
  ...Object.fromEntries(
    ["w0", "w1", "w2", "w3", "w4", "w5", "w6", "e0", "e1", "e2", "e3", "e4", "e5", "e6"].map((k) => [
      `house-${k}`,
      HOUSE,
    ]),
  ),
  books: SHOP,
  hardware: SHOP,
  motors: SHOP,
  bakery: SHOP,
  laundry: SHOP,
  post: SHOP,
  hall: { u: 22, v: 13, face: "out" },
  hotel: { u: 16, v: 6, face: "out" },
};
