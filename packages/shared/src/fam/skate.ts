import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, type KindShape, one } from "./units.ts";

// Plan 103 F6a (docs/plan/103-the-skate.md): the skate park's pieces in the build menu — a quarter pipe, a vert
// ramp, a mini ramp, a kicker, a fun box, a ledge, a manual pad, a spine, a flat and a kinked rail (the half-pipe
// and the bowl too big for a lot) — each exactly the park's piece (skate/pieces.ts PIECES: the board rides its
// profile, skate/parks.ts piecesOfThings), set in its footprint as skate/parks.ts SKATE_FITS says; out of doors,
// solid as stepped boxes under the riding face (walked up where it's gentle, a wall where it's steep, the rails a
// thin wall to the bar). Plain numbers here: the catalog is on the page and the skate's code isn't — they're
// skate/parks.ts skateKindParts' and SKATE_FITS' (parks.test.ts holds them to it). Their models: the client's
// world/furn/fam/skate.ts, from the profiles themselves.

const entryOf = (label: string, w: number, h: number, variants = 3): CatalogEntry => ({
  label,
  w,
  h,
  solid: true,
  buildable: true,
  outdoor: true,
  variants,
  look: 0,
});

export const CATALOG = {
  sk_quarter: entryOf("Quarter pipe (skate)", 5, 4),
  sk_vert: entryOf("Vert ramp", 8, 5),
  sk_mini: entryOf("Mini ramp", 10, 5),
  sk_kicker: entryOf("Kicker", 2, 2),
  sk_funbox: entryOf("Fun box", 6, 3),
  sk_ledge: entryOf("Skate ledge", 4, 1),
  sk_manualpad: entryOf("Manual pad", 4, 2),
  sk_spine: entryOf("Spine", 5, 4),
  sk_rail: entryOf("Flat rail", 5, 1, 2),
  sk_kinkrail: entryOf("Kinked rail", 6, 1, 2),
} satisfies Record<string, CatalogEntry>;

// (each one's piece's stepped boxes, the tallest first: skate/parks.ts skateKindParts to the
// millimetre: each a hair wider, never higher)
export const SHAPES = {
  sk_quarter: one(
    box(0.1, 0, 4.9, 1.796, 0, 1.742),
    box(0.1, 1.795, 4.9, 1.876, 0, 0.569),
    box(0.1, 1.875, 4.9, 2.016, 0, 0.452),
    box(0.1, 2.015, 4.9, 2.175, 0, 0.341),
    box(0.1, 2.174, 4.9, 2.375, 0, 0.229),
    box(0.1, 2.374, 4.9, 2.654, 0, 0.113),
  ),
  sk_vert: one(
    box(0.4, 0, 7.6, 2.53, 0, 3.55),
    box(0.4, 2.529, 7.6, 2.55, 0, 0.925),
    box(0.4, 2.549, 7.6, 2.669, 0, 0.812),
    box(0.4, 2.668, 7.6, 2.809, 0, 0.695),
    box(0.4, 2.808, 7.6, 2.968, 0, 0.576),
    box(0.4, 2.967, 7.6, 3.147, 0, 0.46),
    box(0.4, 3.146, 7.6, 3.347, 0, 0.349),
    box(0.4, 3.346, 7.6, 3.605, 0, 0.231),
    box(0.4, 3.604, 7.6, 3.944, 0, 0.116),
  ),
  sk_mini: one(
    box(8.152, 0.1, 9.844, 4.9, 0, 1.44),
    box(0.156, 0.1, 1.848, 4.9, 0, 1.44),
    box(8.033, 0.1, 8.153, 4.9, 0, 0.454),
    box(1.847, 0.1, 1.967, 4.9, 0, 0.454),
    box(7.894, 0.1, 8.034, 4.9, 0, 0.346),
    box(1.966, 0.1, 2.106, 4.9, 0, 0.346),
    box(7.715, 0.1, 7.895, 4.9, 0, 0.234),
    box(2.105, 0.1, 2.285, 4.9, 0, 0.234),
    box(7.456, 0.1, 7.716, 4.9, 0, 0.117),
    box(2.284, 0.1, 2.544, 4.9, 0, 0.117),
  ),
  sk_kicker: one(
    box(0.2, 0.378, 1.8, 0.459, 0, 0.581),
    box(0.2, 0.458, 1.8, 0.697, 0, 0.465),
    box(0.2, 0.696, 1.8, 0.935, 0, 0.348),
    box(0.2, 0.934, 1.8, 1.174, 0, 0.232),
    box(0.2, 1.173, 1.8, 1.412, 0, 0.116),
  ),
  sk_funbox: one(
    box(1.811, 0.3, 4.189, 2.7, 0, 0.6),
    box(1.751, 0.3, 1.812, 2.7, 0, 0.578),
    box(4.188, 0.3, 4.469, 2.7, 0, 0.48),
    box(1.491, 0.3, 1.752, 2.7, 0, 0.462),
    box(4.468, 0.3, 4.729, 2.7, 0, 0.364),
    box(1.231, 0.3, 1.492, 2.7, 0, 0.346),
    box(4.728, 0.3, 4.989, 2.7, 0, 0.249),
    box(0.971, 0.3, 1.232, 2.7, 0, 0.231),
    box(4.988, 0.3, 5.248, 2.7, 0, 0.133),
    box(0.712, 0.3, 0.972, 2.7, 0, 0.115),
  ),
  sk_ledge: one(box(0, 0.25, 4, 0.75, 0, 0.46)),
  sk_manualpad: one(box(0, 0.25, 4, 1.75, 0, 0.2)),
  sk_spine: one(
    box(0.1, 1.441, 4.9, 2.558, 0, 1.652),
    box(0.1, 2.557, 4.9, 2.577, 0, 0.564),
    box(0.1, 1.423, 4.9, 1.444, 0, 0.564),
    box(0.1, 2.576, 4.9, 2.697, 0, 0.457),
    box(0.1, 1.303, 4.9, 1.424, 0, 0.457),
    box(0.1, 2.696, 4.9, 2.856, 0, 0.339),
    box(0.1, 1.144, 4.9, 1.304, 0, 0.339),
    box(0.1, 2.855, 4.9, 3.035, 0, 0.232),
    box(0.1, 0.965, 4.9, 1.145, 0, 0.232),
    box(0.1, 3.034, 4.9, 3.294, 0, 0.117),
    box(0.1, 0.706, 4.9, 0.966, 0, 0.117),
  ),
  sk_rail: one(
    box(-0.03, 0.47, 1.28, 0.53, 0, 0.38),
    box(1.22, 0.47, 2.53, 0.53, 0, 0.38),
    box(2.47, 0.47, 3.78, 0.53, 0, 0.38),
    box(3.72, 0.47, 5.03, 0.53, 0, 0.38),
  ),
  sk_kinkrail: one(
    box(-0.03, 0.47, 1.53, 0.53, 0, 2.032),
    box(1.47, 0.47, 3.03, 0.53, 0, 1.599),
    box(2.97, 0.47, 4.53, 0.53, 0, 0.733),
    box(4.47, 0.47, 6.03, 0.53, 0, 0.3),
  ),
} satisfies Record<keyof typeof CATALOG, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {};
export const HANGS: Record<string, [number, number, number]> = {};
