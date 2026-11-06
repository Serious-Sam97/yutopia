import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, cyl, type KindShape, one } from "./units.ts";

// Plan 68 phase 11 (docs/plan/68-more-furniture.md): Lights — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/lights2.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts). Every one
// a lamp (`interact: "lamp"`): switched on and off by hand and by its room's switch, its light gone
// when it's off (art/light.ts).
export const CATALOG = {
  // on a wall: swagged from three hooks, twinkling
  fairy_lights: {
    label: "Fairy lights",
    w: 3,
    h: 1,
    solid: false,
    wall: true,
    buildable: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xffd28a, radius: 3, intensity: 0.3 },
  },
  // from the ceiling, over heads (its lowest at 2.35 m)
  chandelier: {
    label: "Chandelier",
    w: 1,
    h: 1,
    solid: false,
    buildable: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xffdca0, radius: 6, intensity: 0.65, h: 2.55 },
  },
  paper_lanterns: {
    label: "Paper lanterns",
    w: 1,
    h: 1,
    solid: false,
    buildable: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xffe6c0, radius: 4.5, intensity: 0.45, h: 2.5 },
  },
  edison_cluster: {
    label: "Edison bulb cluster",
    w: 1,
    h: 1,
    solid: false,
    buildable: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xffb45a, radius: 4.5, intensity: 0.5, h: 2.5 },
  },
  // on a desk or a table
  bankers_lamp: {
    label: "Banker's lamp",
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    buildable: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xffe0a8, radius: 1.8, intensity: 0.32 },
  },
  salt_lamp: {
    label: "Salt lamp",
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    buildable: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xff8a5a, radius: 1.5, intensity: 0.26 },
  },
  candles: {
    label: "Candles",
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    buildable: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xffb050, radius: 1.6, intensity: 0.28 },
  },
  // on the floor: throws its light up at the ceiling
  uplighter: {
    label: "Floor uplighter",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xffd9a8, radius: 5, intensity: 0.55 },
  },
  track_lights: {
    label: "Track lights",
    w: 2,
    h: 1,
    solid: false,
    buildable: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xfff0d8, radius: 5.5, intensity: 0.55, h: 3.0 },
  },
  // out of doors: a pool of light in the dark between its two posts
  festoon_lights: {
    label: "Festoon lights",
    w: 4,
    h: 1,
    solid: true,
    outdoor: true,
    buildable: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xffc27a, radius: 6, intensity: 0.6 },
  },
} satisfies Record<string, CatalogEntry>;

export const SHAPES = {
  fairy_lights: one(box(0.15, 0.1, 2.86, 0.16, 1.6, 2.18)),
  chandelier: { parts: [box(0.08, 0.08, 0.92, 0.92, 2.35, 3.27)], odd: "hung from the ceiling, over heads" },
  paper_lanterns: { parts: [box(0.11, 0.17, 0.91, 0.88, 2.09, 3.27)], odd: "hung from the ceiling, over heads" },
  edison_cluster: { parts: [box(0.32, 0.32, 0.68, 0.68, 2.39, 3.27)], odd: "hung from the ceiling, over heads" },
  bankers_lamp: one(box(0.355, 0.36, 0.645, 0.6, 0, 0.43)),
  salt_lamp: one(box(0.37, 0.34, 0.63, 0.63, 0, 0.27)),
  candles: one(box(0.32, 0.35, 0.65, 0.65, 0, 0.43)),
  uplighter: one(cyl(0.5, 0.5, 0.2, 0, 1.87)),
  track_lights: { parts: [box(0.09, 0.43, 1.91, 0.58, 3.0, 3.27)], odd: "on the ceiling" },
  festoon_lights: {
    parts: [
      cyl(0.22, 0.5, 0.2, 0, 0.42),
      cyl(0.22, 0.5, 0.06, 0, 2.85),
      cyl(3.78, 0.5, 0.2, 0, 0.42),
      cyl(3.78, 0.5, 0.06, 0, 2.85),
    ],
    odd: "its two posts: the lights swagged between them, over heads, are walked under",
  },
} satisfies Record<string, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {};
// (on a wall: quarter tiles along, its lowest and highest, m up)
export const HANGS: Record<string, [number, number, number]> = {
  fairy_lights: [11, 1.6076, 2.1946],
};
