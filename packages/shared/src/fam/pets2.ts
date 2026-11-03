import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, type KindShape, one } from "./units.ts";

// Plan 68 phase 16 (docs/plan/68-more-furniture.md): Pets — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/pets2.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts). What pets
// do with them is the world server's (features/pets.ts: not yet — see the plan).
export const CATALOG = {
  // (its carpet the paint)
  cat_tree: { label: "Cat tree", w: 1, h: 1, solid: true, buildable: true, variants: 3, look: 0, paint: true },
  // the agility course: a bar jump, a tunnel, weave poles
  agility_jump: { label: "Agility jump", w: 2, h: 1, solid: false, buildable: true, variants: 2, look: 0 },
  agility_tunnel: { label: "Agility tunnel", w: 3, h: 1, solid: true, buildable: true, variants: 3, look: 0 },
  weave_poles: { label: "Weave poles", w: 4, h: 1, solid: false, buildable: true, variants: 2, look: 0 },
  ball_launcher: { label: "Ball launcher", w: 1, h: 1, solid: false, buildable: true, variants: 2, look: 0 },
  litter_box: { label: "Litter box", w: 1, h: 1, solid: false, buildable: true, variants: 2, look: 0 },
  // a free-standing pet gate with a flap in it (a person's stopped; a pet's flap swings)
  pet_door: { label: "Pet gate with flap", w: 1, h: 1, solid: true, buildable: true, variants: 2, look: 0 },
  auto_feeder: { label: "Auto-feeder", w: 1, h: 1, solid: false, buildable: true, variants: 2, look: 0 },
  bird_cage: { label: "Bird cage", w: 1, h: 1, solid: true, buildable: true, variants: 3, look: 0 },
  hamster_wheel: {
    label: "Hamster cage",
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    buildable: true,
    variants: 2,
    look: 0,
  },
  pet_sofa: { label: "Pet sofa", w: 1, h: 1, solid: false, buildable: true, variants: 3, look: 0, paint: true },
} satisfies Record<string, CatalogEntry>;

export const SHAPES = {
  cat_tree: one(box(0.14, 0.19, 0.82, 0.81, 0, 1.5)),
  agility_jump: one(box(0.22, 0.28, 1.78, 0.72, 0, 0.94)),
  agility_tunnel: one(box(0.09, 0.08, 2.91, 0.92, 0, 0.69)),
  weave_poles: one(box(0.32, 0.35, 3.68, 0.65, 0, 1.01)),
  ball_launcher: one(box(0.27, 0.29, 0.79, 0.73, 0, 0.37)),
  litter_box: one(box(0.2, 0.22, 0.82, 0.85, 0, 0.43)),
  pet_door: one(box(0.03, 0.33, 0.97, 0.67, 0, 0.82)),
  auto_feeder: one(box(0.35, 0.28, 0.65, 0.79, 0, 0.41)),
  // (the cage hung from its stand's hook, the pole and foot beside it)
  bird_cage: one(box(0.13, 0.25, 0.8, 0.75, 0, 1.72)),
  hamster_wheel: one(box(0.28, 0.36, 0.72, 0.64, 0, 0.34)),
  pet_sofa: one(box(0.12, 0.25, 0.88, 0.79, 0, 0.44)),
} satisfies Record<string, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {};
export const HANGS: Record<string, [number, number, number]> = {};
