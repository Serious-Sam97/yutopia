// The furniture's measures (docs/plan/67-the-furniture.md, phase 1): where a kind is sat on, what
// stands on it and how high a body stands on top of it, one place a kind, in metres. The catalog's
// `surface` and `standHeight` (iso px, as the rest of the world reads them) and the 3D view's seats
// (tp/seats3d.ts) are read from here. Phase 1 moved the iso art's numbers in unchanged; the
// families' phases (2–8) change them as each is redrawn at true scale — first in the *_NEXT tables
// (drawn with the client's ?furn=new), moved up here when the family goes live (seating and the
// desks, tables and storage: 2026-11-03).

/** Iso px a metre of height (the art's ZPX: 45.25 · cos 30°): today's numbers were measured in it. */
export const ISO_PX = 45.25 * Math.cos(Math.PI / 6);
const iso = (px: number) => px / ISO_PX;
/** Metres → the iso px the catalog keeps (to a thousandth: today's numbers come back exact). */
export const isoPx = (m: number): number => Math.round(m * ISO_PX * 1000) / 1000;

/** Where a sitter goes on a seat (as drawn, sat on: the cushion sunk, the back leant), m along the
 *  way its sitter faces from the tile's middle (plan 62): the cushion's top less what it gives, its
 *  front edge, its back's face (null: a bench, a bean bag), the least and most she leans back (rad),
 *  solid to the floor in front (the shins kept clear of it), its arms' top; a backless seat's own
 *  back edge (`rear`). */
export interface SeatSpec {
  top: number;
  front: number;
  back: number | null;
  lean: [number, number];
  solid?: boolean;
  arms?: number;
  rear?: number;
}

/** The seats by what's sat on (a kind, or the piano's `stool`). */
export const SEAT_SPEC: Record<string, SeatSpec> = {
  // (plan 67 phase 2, at true scale for the 1.79 m people; all of a kind's looks sat on alike)
  chair: { top: 0.47, front: 0.27, back: -0.22, lean: [0, 0.15] },
  armchair: { top: 0.44, front: 0.38, back: -0.15, lean: [0.1, 0.3], solid: true, arms: 0.6 },
  sofa: { top: 0.455, front: 0.42, back: -0.1, lean: [0.2, 0.3], solid: true },
  beanbag: { top: 0.33, front: 0.36, back: null, lean: [0.4, 0.4], solid: true },
  bench: { top: 0.45, front: 0.22, back: null, lean: [0, 0] },
  // (a piano's stool, played sat on: its top 13.4 iso px, art/items/play.ts)
  stool: { top: iso(13), front: 0.15, back: null, rear: -0.15, lean: [0, 0] },
};

/** The redrawn seats, not yet in the world (the client's `?furn=new` draws them, plan 67): each
 *  moves into SEAT_SPEC when its family is signed off. At true scale for the 1.79 m people (phase 2:
 *  seating, world/furn/seating.ts). */
export const SEAT_NEXT: Record<string, SeatSpec> = {};

/** What things stand on a kind's top (tabletops, a body that's jumped up): its height, m. */
export const SURFACE: Record<string, number> = {
  // (plan 67 phase 3, at true scale: a desk at 0.74, a counter at 0.90)
  desk: 0.74,
  meeting_table: 0.74,
  coffee_table: 0.42,
  side_table: 0.55,
  bookcase: 1.8,
  counter: 0.9,
  cupboard: 0.85,
  tape_shelf: 1.12,
  reception: 0.74,
};

/** The redrawn surfaces, not yet in the world (as SEAT_NEXT): at true scale for the 1.79 m people
 *  (phase 3: world/furn/tables.ts, storage.ts) — a desk at 0.74, a counter at 0.90. */
export const SURFACE_NEXT: Record<string, number> = {};
/** …and where on them things stand, when that changes (quarter-tile cells of the rot-0 footprint,
 *  as the catalog's `top`): the reception desk's work surface, behind its raised front ledge. */
export const TOP_NEXT: Record<string, [number, number, number, number]> = {};

/** How high a body stands on the solid things without a surface, m (by what its drawing shows).
 *  Thin, tall or awkward things (lamps, plants, partitions, a mic stand, the water cooler's bottle)
 *  aren't stood on. */
export const STAND: Record<string, number> = {
  arcade: iso(54),
  vending: iso(62),
  piano: iso(44),
  crt_tv: iso(47),
  tv_console: iso(46),
  cart_shelf: 0.8,
  disc_rack: 1.38,
  slot_track: iso(23),
  pool_table: iso(27),
  pingpong_table: iso(24),
  mixing_desk: iso(18),
  speaker_cab: iso(46),
  column: iso(84),
  car: iso(56),
  server_rack: iso(66),
  crt_terminal: iso(20),
  pet_house: iso(16),
  toy_box: iso(16),
  // (a parkour wall's cap: run up and stood on)
  pk_wall: iso(125),
  pk_wall_tall: iso(235),
};
/** …redrawn (phase 3): the cartridge shelf's top, the disc tower's. */
export const STAND_NEXT: Record<string, number> = {};
