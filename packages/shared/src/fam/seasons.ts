import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, type KindShape, one } from "./units.ts";

// Plan 68 phase 20 (docs/plan/68-more-furniture.md): Other seasons — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/seasons.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts). Indoors and
// out.
export const CATALOG = {
  pumpkins: { label: "Pumpkins", w: 1, h: 1, solid: false, buildable: true, variants: 3 },
  // (on a table or the floor; lit like a lamp, its candle's light)
  jack_o_lantern: {
    label: "Jack-o'-lantern",
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    buildable: true,
    interact: "lamp",
    variants: 3,
    light: { color: 0xff9a3a, radius: 1.8, intensity: 0.32 },
  },
  leaf_garland: {
    label: "Autumn leaves garland",
    w: 3,
    h: 1,
    solid: false,
    wall: true,
    buildable: true,
    variants: 3,
    look: 0,
  },
  bunting: { label: "Bunting", w: 3, h: 1, solid: false, wall: true, buildable: true, variants: 3 },
  // (hung from the ceiling, over heads)
  paper_chains: { label: "Paper chains", w: 3, h: 1, solid: false, buildable: true, variants: 3 },
} satisfies Record<string, CatalogEntry>;

export const SHAPES = {
  pumpkins: {
    parts: [box(0.07, 0.16, 0.93, 0.89, 0, 0.71)],
    odd: "the heap (or the bale and what's on it): set down, walked through as a present is",
  },
  jack_o_lantern: one(box(0.37, 0.37, 0.7, 0.64, 0, 0.225)),
  leaf_garland: one(box(0.06, 0.1, 2.94, 0.23, 1.82, 2.28)),
  bunting: one(box(0.07, 0.1, 2.94, 0.14, 1.8, 2.3)),
  paper_chains: { parts: [box(0.09, 0.29, 2.91, 0.71, 2.67, 3.27)], odd: "hung from the ceiling, over heads" },
} satisfies Record<string, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {};
export const HANGS: Record<string, [number, number, number]> = {
  // (swagged from three hooks over heads: the leaves hanging under the twine, the flags under the cord)
  leaf_garland: [12, 71, 90],
  bunting: [12, 70, 90],
};
