import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, cyl, type KindShape, one } from "./units.ts";

// Plan 68 phase 17 (docs/plan/68-more-furniture.md): Parkour — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/parkour2.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts).
// All out of doors (Flowmotion's off indoors), solid where a body meets them, as pk_rail / pk_wall /
// pk_pole are. What Flowmotion makes of each (physics/build.ts PARKOUR) and the bounce and the ride
// are the central code's: the measures they'd read are here (TRAMPOLINE, ZIP_LINE, QUARTER_PIPE).

/** The trampoline's mat: its middle in the kind's frame (m), its radius, its top (stood on). */
export const TRAMPOLINE = { u: 1.5, v: 1.5, r: 1.16, top: 0.76, frame: 1.42 };
/** The zip line's cable (the kind's frame, m): from the start pole's top over the platform to the
 *  end pole's, its sag at the middle; the handle hangs from the start, its grip this far under. */
export const ZIP_LINE = {
  from: [0.2, 3.45, 0.5] as const,
  to: [9.62, 2.45, 0.5] as const,
  sag: 0.18,
  grip: 1.0,
  platform: 0.9,
};
/** The quarter pipe's transition: a quarter circle `r` round, its toe at v `toe` on the ground, up to
 *  its lip `top` high at v `lip` (the deck behind it, back to v 0). */
export const QUARTER_PIPE = { r: 1.6, toe: 3, top: 1.2, lip: 3 - Math.sqrt(1.6 ** 2 - 0.4 ** 2) };

export const CATALOG = {
  pk_vault_box: {
    label: "Vault box",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    outdoor: true,
    variants: 3,
    look: 0,
  },
  pk_beam: { label: "Balance beam", w: 4, h: 1, solid: true, buildable: true, outdoor: true, variants: 3, look: 0 },
  pk_monkey_bars: {
    label: "Monkey bars",
    w: 4,
    h: 1,
    solid: true,
    buildable: true,
    outdoor: true,
    variants: 3,
    look: 0,
  },
  pk_climb_wall: {
    label: "Climbing wall",
    w: 4,
    h: 1,
    solid: true,
    buildable: true,
    outdoor: true,
    variants: 3,
    look: 0,
  },
  pk_trampoline: {
    label: "Trampoline",
    w: 3,
    h: 3,
    solid: true,
    buildable: true,
    outdoor: true,
    variants: 3,
    look: 0,
  },
  pk_quarter_pipe: {
    label: "Quarter pipe",
    w: 3,
    h: 3,
    solid: true,
    buildable: true,
    outdoor: true,
    variants: 3,
    look: 0,
  },
  pk_zip_line: { label: "Zip line", w: 10, h: 1, solid: true, buildable: true, outdoor: true, variants: 2, look: 0 },
  pk_cargo_net: { label: "Cargo net", w: 4, h: 1, solid: true, buildable: true, outdoor: true, variants: 3, look: 0 },
  pk_tyre_run: { label: "Tyre run", w: 4, h: 2, solid: true, buildable: true, outdoor: true, variants: 3, look: 0 },
} satisfies Record<string, CatalogEntry>;

// the tyre run's tyres: two rows of five, touching (their middles, m), each `TYRE_R` round, `TYRE_H` tall
export const TYRE_R = 0.33;
export const TYRE_H = 0.2;
export const TYRES: [number, number][] = [0.62, 1.38].flatMap((v) =>
  [0, 1, 2, 3, 4].map((i) => [0.48 + i * 0.76, v] as [number, number]),
);

// (the body first: it's where a dropped body is stood, physics/furniture.test)
const qp = QUARTER_PIPE;
export const SHAPES = {
  // (its widest: the vaulting box's foot; the foam and the concrete inside it)
  pk_vault_box: one(box(0.24, 0.14, 1.76, 0.86, 0, 0.72)),
  // (the beam on its posts' feet: stepped up onto, walked along)
  pk_beam: one(box(0.06, 0.38, 3.94, 0.62, 0, 0.4)),
  // (the two end ladders — their uprights and rungs — then the bars overhead, walked under)
  pk_monkey_bars: one(
    cyl(0.14, 0.1, 0.05, 0, 2.3),
    cyl(0.14, 0.9, 0.05, 0, 2.3),
    cyl(3.86, 0.1, 0.05, 0, 2.3),
    cyl(3.86, 0.9, 0.05, 0, 2.3),
    ...[0.42, 0.84, 1.26, 1.68].flatMap((y) => [
      box(0.11, 0.1, 0.17, 0.9, y - 0.025, y + 0.025),
      box(3.83, 0.1, 3.89, 0.9, y - 0.025, y + 0.025),
    ]),
    box(0.09, 0.05, 3.91, 0.95, 2.14, 2.3),
  ),
  // (the wall, holds and all, both faces)
  pk_climb_wall: one(box(0, 0.31, 4, 0.69, 0, 3.05)),
  // (the mat on its frame; the ladder's two treads at the front-right corner)
  pk_trampoline: one(
    cyl(TRAMPOLINE.u, TRAMPOLINE.v, TRAMPOLINE.frame + 0.04, 0, TRAMPOLINE.top),
    box(2.48, 2.48, 2.72, 2.72, 0, 0.28),
    box(2.68, 2.68, 2.92, 2.92, 0, 0.04),
  ),
  // (the deck and the transition's steep half one block, then the run-in in steps under its face, the
  // toe's plate — Jolt has no curve: walked up the steps to where it's steep, run up the rest)
  pk_quarter_pipe: one(
    box(0, 0, 3, 1.6, 0, qp.top),
    box(0, 1.6, 3, 1.8, 0, 0.54),
    box(0, 1.8, 3, 2.0, 0, 0.35),
    box(0, 2.0, 3, 2.4, 0, 0.12),
    box(0, 2.4, 3, 3, 0, 0.04),
  ),
  // (the platform and its steps, the start pole through it, the end pole; the cable overhead)
  pk_zip_line: one(
    box(0.04, 0.04, 1.06, 0.96, 0, ZIP_LINE.platform),
    cyl(0.2, 0.5, 0.14, 0, 3.62),
    box(1.06, 0.22, 1.34, 0.78, 0, 0.6),
    box(1.34, 0.22, 1.62, 0.78, 0, 0.3),
    cyl(9.62, 0.5, 0.14, 0, 2.62),
  ),
  // (the net, a wall to climb; its poles and the beam over it)
  pk_cargo_net: one(
    box(0.22, 0.42, 3.78, 0.58, 0, 2.86),
    cyl(0.12, 0.5, 0.12, 0, 3.12),
    cyl(3.88, 0.5, 0.12, 0, 3.12),
    box(0, 0.4, 4, 0.6, 2.86, 3.12),
  ),
  // (each tyre a step up: stood on its rim)
  pk_tyre_run: one(...TYRES.map(([u, v]) => cyl(u, v, TYRE_R, 0, TYRE_H))),
} satisfies Record<string, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {
  pk_vault_box: 0.72,
  pk_beam: 0.4,
  pk_climb_wall: 3.05,
  pk_trampoline: TRAMPOLINE.top,
  pk_quarter_pipe: QUARTER_PIPE.top,
  pk_zip_line: ZIP_LINE.platform,
  pk_tyre_run: TYRE_H,
};
export const HANGS: Record<string, [number, number, number]> = {};
