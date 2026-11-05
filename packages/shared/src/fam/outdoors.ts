import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, cyl, type KindShape, one } from "./units.ts";

// Plan 68 phase 19 (docs/plan/68-more-furniture.md): Outdoors — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/outdoors.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts). All of them
// only out of doors, on the snow campus's land.

/** The picnic table's top (m): its boards, where things stand. */
const PICNIC_TOP = 0.76;

export const CATALOG = {
  // (a ring of fire, lit or out like a lamp: its flames live, a light; the log seats go round it)
  fire_pit: {
    label: "Fire pit",
    w: 2,
    h: 2,
    solid: true,
    buildable: true,
    outdoor: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xff8a3a, radius: 5, intensity: 0.7 },
  },
  log_seat: {
    label: "Log seat",
    w: 2,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    outdoor: true,
    variants: 3,
    look: 0,
  },
  // (sat on at its benches — every tile faces the way it's turned: the far bench is sat on facing
  // out — and things stand on its top)
  picnic_table: {
    label: "Picnic table",
    w: 2,
    h: 2,
    solid: false,
    seat: true,
    buildable: true,
    outdoor: true,
    variants: 3,
    look: 0,
    surface: PICNIC_TOP,
    top: [1, 3, 7, 5],
  },
  bike_rack: { label: "Bike rack", w: 3, h: 2, solid: true, buildable: true, outdoor: true, variants: 3, look: 0 },
  bus_shelter: {
    label: "Bus shelter",
    w: 3,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    outdoor: true,
    variants: 3,
    look: 0,
  },
  mailbox: { label: "Mailbox", w: 1, h: 1, solid: true, buildable: true, outdoor: true, variants: 3 },
  street_sign: { label: "Street sign", w: 1, h: 1, solid: true, buildable: true, outdoor: true, variants: 3 },
  flag_pole: { label: "Flag pole", w: 2, h: 1, solid: true, buildable: true, outdoor: true, variants: 3, look: 0 },
  ski_rack: { label: "Sled & ski rack", w: 2, h: 1, solid: true, buildable: true, outdoor: true, variants: 3 },
  snowman: { label: "Snowman", w: 1, h: 1, solid: true, buildable: true, outdoor: true, variants: 3 },
  bird_feeder: { label: "Bird feeder", w: 1, h: 1, solid: true, buildable: true, outdoor: true, variants: 3 },
  patio_heater: {
    label: "Patio heater",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    outdoor: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xff7a3a, radius: 4, intensity: 0.55, h: 2.0 },
  },
} satisfies Record<string, CatalogEntry>;

export const SHAPES = {
  fire_pit: {
    parts: [cyl(1, 1, 0.55, 0, 0.42), cyl(1, 1, 0.3, 0, 0.93), box(0.15, 0.06, 1.86, 1.86, 0, 0.02)],
    odd: "its ring, the fire over it (not walked into), the trodden ground round it and the log pile on it",
  },
  log_seat: one(box(0.1, 0.29, 1.9, 0.74, 0, 0.45)),
  picnic_table: one(box(0.08, 0.29, 1.92, 1.71, 0, 0.45), box(0.08, 0.66, 1.92, 1.34, 0.45, 0.76)),
  bike_rack: one(box(0.1, 0.13, 2.9, 1.86, 0, 1.05)),
  bus_shelter: {
    parts: [
      box(0, 0, 3, 0.1, 0, 2.3),
      box(0, 0, 0.1, 0.84, 0, 2.3),
      box(2.86, 0, 3, 0.84, 0, 2.3),
      box(0.6, 0.15, 2.4, 0.52, 0, 0.46),
      box(0, 0, 3, 1, 2.2, 2.4),
      box(0.06, 0.78, 0.38, 0.86, 2.3, 2.9),
    ],
    odd: "a seat: its back and ends, the perch inside, the roof and its sign over heads, the front left open",
  },
  mailbox: one(box(0.23, 0.23, 0.77, 0.79, 0, 1.5)),
  street_sign: one(cyl(0.5, 0.5, 0.05, 0, 2.65), box(0.06, 0.06, 0.94, 0.94, 1.75, 2.65)),
  flag_pole: {
    parts: [box(0.79, 0.29, 1.21, 0.71, 0, 0.12), cyl(1, 0.5, 0.06, 0, 4.49), box(1, 0.29, 1.97, 0.71, 3.55, 4.35)],
    odd: "its plinth and pole; the flag streams high over heads",
  },
  ski_rack: one(box(0, 0.03, 2, 0.62, 0, 1.68), box(0.3, 0.6, 1.5, 1, 0, 0.2)),
  snowman: one(cyl(0.5, 0.5, 0.44, 0, 1.64), box(0.02, 0.4, 0.98, 0.6, 0.85, 1.2)),
  bird_feeder: one(cyl(0.5, 0.5, 0.06, 0, 1.45), box(0.27, 0.29, 0.81, 0.71, 1.4, 1.9)),
  patio_heater: one(cyl(0.5, 0.5, 0.26, 0, 0.83), cyl(0.5, 0.5, 0.05, 0.83, 2.2), cyl(0.5, 0.5, 0.43, 2.19, 2.38)),
} satisfies Record<string, KindShape>;

export const SEATS: Record<string, SeatSpec> = {
  // (the half log's flat top, its front edge: as the bench)
  log_seat: { top: 0.43, front: 0.18, back: null, lean: [0, 0] },
  // (its benches are narrow, the knees go under the top: the hips on the bench's middle)
  picnic_table: { top: 0.45, front: 0.36, back: null, lean: [0, 0] },
  // (the perch inside, its back rail on the back glass)
  bus_shelter: { top: 0.46, front: 0.06, back: -0.38, lean: [0.05, 0.15] },
};
export const SURFACES: Record<string, number> = { picnic_table: PICNIC_TOP };
export const STANDS: Record<string, number> = {};
export const HANGS: Record<string, [number, number, number]> = {};
