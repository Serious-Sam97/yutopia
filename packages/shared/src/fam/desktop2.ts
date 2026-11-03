import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, cyl, type KindShape, one } from "./units.ts";

// Plan 68 phase 7 (docs/plan/68-more-furniture.md): On desks — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/desktop2.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts). Every one
// a thing on a surface (a 1×1 frame round its middle, up from the top it stands on), sized for a desk;
// their looks picked by id unless chosen (no room has to match a pencil cup).
const desk = (label: string, variants: number): CatalogEntry => ({
  label,
  w: 1,
  h: 1,
  solid: false,
  onSurface: true,
  buildable: true,
  ...(variants > 1 ? { variants } : {}),
});

export const CATALOG = {
  newtons_cradle: desk("Newton's cradle", 2),
  desk_globe: desk("Desk globe", 3),
  desk_fan: desk("Desk fan", 3),
  desk_snow_globe: desk("Snow globe", 3),
  // (its lid's lamp switched as a lamp is: the water lit, a little light by it)
  desk_aquarium: {
    ...desk("Small aquarium", 3),
    interact: "lamp",
    light: { color: 0x8fd8ff, radius: 1.4, intensity: 0.22 },
  },
  typewriter: desk("Typewriter", 3),
  headphones_stand: desk("Headphones on a stand", 3),
  film_camera: desk("Film camera", 3),
  walkman: desk("Walkman", 3),
  rolodex: desk("Rolodex", 3),
  pencil_cup: desk("Pencil cup", 3),
  hourglass: desk("Hourglass", 2),
  bonsai: desk("Bonsai", 3),
  rubiks_cube: desk("Rubik's cube", 2),
  vortex_figurine: desk("Vortex figurine", 3),
} satisfies Record<string, CatalogEntry>;

// (in each one's 1×1 frame from the surface, rot 0 — turned to face the sitter, −z; measured from the
// models over their looks, live parts at rest)
export const SHAPES = {
  newtons_cradle: one(box(0.39, 0.433, 0.61, 0.565, 0, 0.178)),
  desk_globe: one(box(0.385, 0.412, 0.616, 0.589, 0, 0.316)),
  desk_fan: one(box(0.386, 0.355, 0.614, 0.595, 0, 0.319)),
  desk_snow_globe: one(cyl(0.5, 0.5, 0.066, 0, 0.153)),
  desk_aquarium: one(box(0.335, 0.4, 0.665, 0.6, 0, 0.237)),
  typewriter: one(box(0.298, 0.358, 0.702, 0.643, 0, 0.307)),
  headphones_stand: one(box(0.388, 0.428, 0.622, 0.572, 0, 0.264)),
  film_camera: one(box(0.393, 0.433, 0.597, 0.606, 0, 0.108)),
  walkman: one(box(0.381, 0.398, 0.588, 0.579, 0, 0.034)),
  rolodex: one(box(0.414, 0.441, 0.586, 0.559, 0, 0.128)),
  pencil_cup: one(cyl(0.5, 0.5, 0.049, 0, 0.2)),
  hourglass: one(cyl(0.5, 0.5, 0.051, 0, 0.2)),
  bonsai: one(box(0.393, 0.435, 0.613, 0.565, 0, 0.269)),
  rubiks_cube: one(box(0.461, 0.461, 0.539, 0.539, 0, 0.057)),
  vortex_figurine: one(cyl(0.5, 0.5, 0.056, 0, 0.13)),
} satisfies Record<string, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {};
export const HANGS: Record<string, [number, number, number]> = {};
