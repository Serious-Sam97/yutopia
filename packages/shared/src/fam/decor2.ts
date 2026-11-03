import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, cyl, type KindShape, one } from "./units.ts";

// Plan 68 phase 14 (docs/plan/68-more-furniture.md): Decor — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/decor2.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts).
export const CATALOG = {
  // a planted, a reef or a river tank on its cabinet: fish swimming, bubbles, its light (switched)
  big_aquarium: {
    label: "Big aquarium",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    interact: "lamp",
    light: { color: 0x8fd8ff, radius: 2.4, intensity: 0.3 },
  },
  // its fire behind the glass door (switched like a lamp), the flue up through the ceiling
  wood_stove: {
    label: "Wood stove",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    interact: "lamp",
    light: { color: 0xff9a4a, radius: 3.5, intensity: 0.5 },
  },
  indoor_tree: { label: "Indoor tree", w: 2, h: 2, solid: true, buildable: true, variants: 2, look: 0 },
  fountain: { label: "Fountain", w: 2, h: 2, solid: true, buildable: true, variants: 2, look: 0 },
  sculpture: { label: "Sculpture", w: 1, h: 1, solid: true, buildable: true, variants: 3, look: 0 },
  floor_vase: { label: "Floor vase", w: 1, h: 1, solid: true, buildable: true, variants: 3, look: 0 },
  // (on a surface: picked by the id unless chosen, so a shelf of them varies)
  vase: { label: "Vase", w: 1, h: 1, solid: false, onSurface: true, buildable: true, variants: 3 },
  terrarium: { label: "Terrarium", w: 1, h: 1, solid: false, onSurface: true, buildable: true, variants: 3 },
  trophy: { label: "Trophy", w: 1, h: 1, solid: false, onSurface: true, buildable: true, variants: 3 },
  book_stack: { label: "Stacked books", w: 1, h: 1, solid: false, onSurface: true, buildable: true, variants: 3 },
  // (from the ceiling, over heads)
  hanging_plant: { label: "Hanging plant", w: 1, h: 1, solid: false, buildable: true, variants: 3, look: 0 },
  moss_wall: { label: "Moss wall", w: 2, h: 1, solid: false, wall: true, buildable: true, variants: 3, look: 0 },
} satisfies Record<string, CatalogEntry>;

export const SHAPES = {
  // (its cabinet and tank, to the lid)
  big_aquarium: one(box(0.06, 0.19, 1.94, 0.83, 0, 1.46)),
  // (the stove's body on its legs, its flue to the ceiling, the hearth pad under it)
  wood_stove: one(
    box(0.22, 0.2, 0.78, 0.72, 0, 0.72),
    cyl(0.5, 0.36, 0.08, 0.72, 3.27),
    box(0.05, 0.05, 0.95, 0.95, 0, 0.02),
  ),
  indoor_tree: {
    parts: [cyl(1, 1, 0.32, 0, 0.6)],
    odd: "its planter only: the tree's canopy is walked under and brushed past",
  },
  // (the basin's rim — you go round a fountain — and its middle)
  fountain: one(cyl(1, 1, 0.92, 0, 0.46), cyl(1, 1, 0.14, 0.46, 1.62)),
  sculpture: one(box(0.28, 0.28, 0.72, 0.72, 0, 1.52)),
  floor_vase: {
    parts: [box(0.28, 0.28, 0.78, 0.77, 0, 0.72)],
    odd: "the vase: the pampas and branches over it are brushed past",
  },
  vase: one(box(0.39, 0.39, 0.63, 0.6, 0, 0.44)),
  terrarium: one(box(0.38, 0.38, 0.62, 0.63, 0, 0.3)),
  trophy: one(box(0.4, 0.44, 0.6, 0.56, 0, 0.31)),
  book_stack: one(box(0.33, 0.36, 0.68, 0.64, 0, 0.19)),
  hanging_plant: { parts: [box(0.1, 0.08, 0.92, 0.94, 1.91, 3.27)], odd: "hung from the ceiling, over heads" },
  moss_wall: one(box(0.25, 0.1, 1.75, 0.35, 0.99, 2.01)),
} satisfies Record<string, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {};
export const HANGS: Record<string, [number, number, number]> = {
  moss_wall: [6, 39, 79],
};
