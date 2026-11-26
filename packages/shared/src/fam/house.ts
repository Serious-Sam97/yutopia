import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, cyl, type KindShape, one } from "./units.ts";

// Plan 130 phase 3 (docs/plan/130-the-house-build.md, F10a): the house's columns — a porch's round and square ones,
// the classic orders, a log post, brick and stone piers, a steel pole, a pergola's post, a newel post at a stair's foot.
// Each stands on a tile, its middle at the tile's, a storey high (STOREY_H: up to the slab over it); placed free, they
// go anywhere (plan 72's free things). Their catalog entries and solids here; their models the client's
// world/furn/fam/house.ts.

/** A column's height: a storey's walls (WALL_H, to the ceiling). */
const STOREY_H = 3.266;
const c = (r: number, h = STOREY_H): KindShape => one(cyl(0.5, 0.5, r, 0, h));
const sq = (s: number, h = STOREY_H): KindShape => one(box(0.5 - s / 2, 0.5 - s / 2, 0.5 + s / 2, 0.5 + s / 2, 0, h));
const col = (label: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({
  label,
  w: 1,
  h: 1,
  solid: true,
  buildable: true,
  ...extra,
});

export const CATALOG = {
  porch_column: col("Porch column", { variants: 3, look: 0, paint: true }),
  square_post: col("Square post", { variants: 3, look: 0, paint: true }),
  tuscan_column: col("Tuscan column"),
  doric_column: col("Doric column"),
  ionic_column: col("Ionic column"),
  log_post: col("Log post"),
  brick_pier: col("Brick pier"),
  stone_pier: col("Stone pier"),
  steel_pole: col("Steel pole"),
  pergola_post: col("Pergola post"),
  newel_post: col("Newel post"),
  // (plan 130 phase 10) fireplaces — against a wall, their fire a light (on and off as a lamp)
  ...FIREPLACES(),
  // porches, pergolas and the garden's structures — free standing, out of doors
  pergola_cedar: yard("Cedar pergola", 3, 3),
  pergola_white: yard("White pergola", 3, 3),
  pergola_louvre: yard("Louvred pergola", 3, 3),
  porch_roof: yard("Porch roof", 3, 2),
  gazebo: yard("Gazebo", 3, 3),
  pavilion: yard("Pavilion", 3, 3),
  garden_arbor: yard("Garden arbor", 2, 1),
  carport: yard("Carport", 3, 5),
  trellis: yard("Trellis", 2, 1),
  lattice_screen: yard("Lattice screen", 2, 1),
  // hung on the wall: awnings and a door's hood, the door's details
  awning_stripe: hang("Striped awning", 2, { variants: 3, look: 0 }),
  awning_metal: hang("Metal awning", 2),
  door_hood: hang("Door hood", 1),
  house_numbers: hang("House numbers", 1, { variants: 3, look: 0 }),
  porch_lantern: hang("Porch lantern", 1, { light: { color: 0xffc27a, radius: 4, intensity: 0.5 } }),
  wall_mailbox: hang("Wall mailbox", 1, { variants: 3, look: 0 }),
  // (the quality pass, F9a) the ornate ones, modelled in Blender (the client's public/life/house/ornate.glb)
  fp_victorian: {
    label: "Victorian fireplace",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    interact: "lamp",
    light: { color: 0xff9a4a, radius: 4.5, intensity: 0.6 },
  },
  corinthian_column: col("Corinthian column"),
  porch_bracket: hang("Porch bracket", 1),
  baluster_rail: { label: "Balustrade", w: 2, h: 1, solid: true, buildable: true },
} satisfies Record<string, CatalogEntry>;
export const SHAPES = {
  porch_column: c(0.14),
  square_post: sq(0.22),
  tuscan_column: c(0.22),
  doric_column: c(0.24),
  ionic_column: c(0.22),
  log_post: c(0.16),
  brick_pier: sq(0.46),
  stone_pier: sq(0.5),
  steel_pole: c(0.05),
  pergola_post: sq(0.16, 2.6),
  newel_post: sq(0.18, 1.2),
  ...Object.fromEntries(Object.keys(FIREPLACES()).map((k) => [k, fireShape(k)])),
  // (the yard's: their posts, what stops you; the roofs over you don't)
  pergola_cedar: posts(3, 3, 0.16, 2.6),
  pergola_white: posts(3, 3, 0.18, 2.6),
  pergola_louvre: posts(3, 3, 0.14, 2.7),
  porch_roof: posts(3, 2, 0.16, 2.6, true),
  gazebo: posts(3, 3, 0.14, 2.5),
  pavilion: posts(3, 3, 0.2, 2.6),
  garden_arbor: { parts: [box(0.05, 0.4, 0.2, 0.6, 0, 2.3), box(1.8, 0.4, 1.95, 0.6, 0, 2.3)] },
  carport: posts(3, 5, 0.1, 2.5),
  trellis: one(box(0.05, 0.45, 1.95, 0.55, 0, 2.1)),
  lattice_screen: one(box(0.02, 0.44, 1.98, 0.56, 0, 1.9)),
  awning_stripe: one(box(0.05, 0.1, 1.95, 0.95, 2.08, 2.75)),
  awning_metal: one(box(0.05, 0.1, 1.95, 0.86, 2.11, 2.57)),
  door_hood: one(box(0.0, 0.1, 1.0, 0.7, 2.24, 2.81)),
  house_numbers: one(box(0.2, 0.1, 0.8, 0.13, 1.6, 1.8)),
  porch_lantern: one(box(0.35, 0.1, 0.65, 0.35, 1.77, 2.13)),
  wall_mailbox: one(box(0.3, 0.1, 0.7, 0.22, 1.0, 1.4)),
  fp_victorian: one(box(0.02, 0.03, 1.98, 0.4, 0, 1.26)),
  corinthian_column: c(0.2),
  porch_bracket: one(box(0.45, 0.1, 0.55, 0.6, 2.28, 2.86)),
  baluster_rail: one(box(0.0, 0.44, 2.0, 0.56, 0, 1.0)),
} satisfies Record<string, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {};
// (quarter tiles along the wall, its lowest and highest, m up)
export const HANGS: Record<string, [number, number, number]> = {
  awning_stripe: [8, 2.08, 2.75],
  awning_metal: [8, 2.11, 2.57],
  door_hood: [4, 2.24, 2.81],
  house_numbers: [4, 1.6, 1.8],
  porch_lantern: [4, 1.77, 2.13],
  wall_mailbox: [4, 1.0, 1.4],
  porch_bracket: [4, 2.28, 2.86],
};

/** (plan 130 phase 10) The fireplaces: [label, width (tiles), its light]. */
function FIREPLACES(): Record<string, CatalogEntry> {
  const fire = { color: 0xff9a4a, radius: 4.5, intensity: 0.6 };
  const f = (label: string, w: number): CatalogEntry => ({
    label,
    w,
    h: 1,
    solid: true,
    buildable: true,
    interact: "lamp",
    light: fire,
  });
  return {
    fp_brick: f("Brick fireplace", 2),
    fp_stone: f("Stone fireplace", 2),
    fp_marble: f("Marble mantel", 2),
    fp_modern: f("Linear fireplace", 2),
    fp_stove: f("Wood stove", 1),
    fp_corner: f("Corner fireplace", 1),
    fp_rustic: f("Rustic hearth", 2),
    fp_tiled: f("Tiled fireplace", 2),
  };
}
/** A fireplace's solid: its breast against the wall (the tile's back), a stove's body. */
function fireShape(k: string): KindShape {
  if (k === "fp_stove") return one(box(0.22, 0.25, 0.78, 0.8, 0, 1.0));
  if (k === "fp_corner") return one(box(0.05, 0.05, 0.75, 0.75, 0, 2.4));
  if (k === "fp_modern") return one(box(0.05, 0.05, 1.95, 0.4, 0, 1.4));
  return one(box(0.05, 0.05, 1.95, 0.55, 0, 1.25));
}
/** A yard structure's entry: free standing, out of doors. */
function yard(label: string, w: number, h: number): CatalogEntry {
  return { label, w, h, solid: true, buildable: true, outdoor: true };
}
/** Hung on a wall. */
function hang(label: string, w: number, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return { label, w, h: 1, solid: false, wall: true, buildable: true, variants: 1, ...extra };
}
/** Its posts at the corners (and a porch roof's along its front only), `s` thick, `h` high. */
function posts(w: number, d: number, s: number, h: number, front = false): KindShape {
  const at = (u: number, v: number) => box(u - s / 2, v - s / 2, u + s / 2, v + s / 2, 0, h);
  const e = 0.15;
  const corners = front ? [at(e, d - e), at(w - e, d - e)] : [at(e, e), at(w - e, e), at(e, d - e), at(w - e, d - e)];
  return { parts: corners };
}
