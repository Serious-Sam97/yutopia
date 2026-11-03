// The furniture's measures (docs/plan/67-the-furniture.md, phase 1): where a kind is sat on, what
// stands on it and how high a body stands on top of it, one place a kind, in metres. The catalog's
// `surface` and `standHeight` (iso px, as the rest of the world reads them) and the 3D view's seats
// (tp/seats3d.ts) are read from here. Phase 1 moved the iso art's numbers in unchanged; the
// families' phases (2–8) change them as each is redrawn at true scale — first in the *_NEXT tables
// (drawn with the client's ?furn=new), moved up here when the family goes live (seating and the
// desks, tables and storage: 2026-11-03).

import { FAM_SEATS, FAM_STANDS, FAM_SURFACES } from "./fam/index.ts";
import { ISO_PX, isoPx } from "./fam/units.ts";

export { ISO_PX, isoPx };
const iso = (px: number) => px / ISO_PX;

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
  /** a footrest the feet go on, m up (a bar stool's ring), the floor if none */
  rest?: number;
}

/** The seats by what's sat on (a kind, or the piano's `stool`). */
export const SEAT_SPEC: Record<string, SeatSpec> = {
  // (plan 67 phase 2, at true scale for the 1.79 m people; all of a kind's looks sat on alike)
  chair: { top: 0.47, front: 0.27, back: -0.22, lean: [0, 0.15] },
  armchair: { top: 0.44, front: 0.38, back: -0.15, lean: [0.1, 0.3], solid: true, arms: 0.6 },
  sofa: { top: 0.455, front: 0.42, back: -0.1, lean: [0.2, 0.3], solid: true },
  beanbag: { top: 0.33, front: 0.36, back: null, lean: [0.4, 0.4], solid: true },
  bench: { top: 0.45, front: 0.22, back: null, lean: [0, 0] },
  // (a piano's stool, played sat on: plan 67 phase 6, a piano bench's 0.5 for its keys at 0.74)
  stool: { top: 0.5, front: 0.15, back: null, rear: -0.15, lean: [0, 0] },
  // (plan 67 phase 8b, the office staples: a bar stool at a high table, the booth's bench inside it)
  // (plan 68: a loveseat sits as the sofa does)
  loveseat: { top: 0.455, front: 0.42, back: -0.1, lean: [0.2, 0.3], solid: true },
  bar_stool: { top: 0.76, front: 0.17, back: null, rear: -0.17, lean: [0, 0], rest: 0.3 },
  phone_booth: { top: 0.46, front: 0.06, back: -0.38, lean: [0.05, 0.15] },
  // (plan 68's families: fam/*.ts)
  ...FAM_SEATS,
};

/** The redrawn seats, not yet in the world (the client's `?furn=new` draws them, plan 67): each
 *  moves into SEAT_SPEC when its family is signed off. At true scale for the 1.79 m people (phase 2:
 *  seating, world/furn/seating.ts). */
export const SEAT_NEXT: Record<string, SeatSpec> = {};

/** A keyboard's keys' tops over the desk it's on, m (world/furn/desktop.ts): where typing hands go. */
export const KEYBOARD_TOP = 0.03;

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
  // (plan 67 phase 8b: a standing desk, a bistro table, the open shelving's top)
  standing_desk: 1.05,
  // (plan 68: the fireplace's mantel shelf)
  fireplace: 1.15,
  high_table: 1.05,
  shelving: 1.2,
  // (plan 68's families: fam/*.ts)
  ...FAM_SURFACES,
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
  arcade: 1.8, // (plan 67 phase 6: the models' tops, world/furn/play.ts)
  vending: 1.8,
  piano: 1.27,
  crt_tv: 1.13, // (plan 67: its cabinet's top)
  tv_console: iso(46),
  cart_shelf: 0.8,
  disc_rack: 1.38,
  slot_track: 0.77,
  pool_table: 0.86,
  pingpong_table: 0.76,
  mixing_desk: 0.84,
  speaker_cab: iso(46),
  column: iso(84),
  car: iso(56),
  server_rack: 1.98,
  crt_terminal: 1.16, // (the terminal's top: its cart's free edge is too narrow to stand on)
  pet_house: 0.72, // (plan 67: its roof's ridge, where a body lands — Jolt, physics/furniture.test)
  // (phase 8b's: their tops)
  filing_cabinet: 1.32,
  printer: 1.0,
  fridge: 1.82,
  toy_box: 0.5, // (plan 67 phase 8: its lid)
  // (a parkour wall's cap: run up and stood on)
  pk_wall: iso(125),
  pk_wall_tall: iso(235),
  // (plan 68's families: fam/*.ts)
  ...FAM_STANDS,
};
/** …redrawn (phase 3): the cartridge shelf's top, the disc tower's. */
export const STAND_NEXT: Record<string, number> = {};

/** Where a sign's moving words are drawn (plan 68: the ticker's scroll, the split-flap's flaps — the
 *  client's tp/live.ts): across x0..x1 and up y0..y1 (m, on the wall from where it hangs), its face z
 *  out from the wall's line (the wall's face at 0.1). Their default words, unset. */
export const TEXT_FACE = {
  vfd_ticker: { x0: 0.22, x1: 1.78, y0: 1.98, y1: 2.12, z: 0.165 },
  split_flap: { x0: 0.2, x1: 2.8, y0: 1.5, y1: 2.06, z: 0.17 },
} as const;
export const TEXT_DEFAULT: Record<string, string> = {
  marquee_sign: "OPEN",
  vfd_ticker: "WELCOME TO THE STUDIO * TAPE IS ROLLING",
  split_flap: "STUDIO/ON AIR/ALL WELCOME",
};

/** The game tables' playing surfaces, m (plan 67 phase 6, at true scale): the cloth, the ping-pong
 *  top, the slot track's board (shared tables.ts TABLES.top and slotcar.ts SLOT_TOP read them). */
export const TABLE_TOP = { pool_table: 0.79, pingpong_table: 0.76, slot_track: 0.76 } as const;

/** Where the hands go on the things used (plan 62's parts, the client's tp/view.ts partsOf; plan 67
 *  phase 6 at true scale, world/furn/play.ts): in the thing's own tiles at rot 0 (x across, y down
 *  its footprint) and metres up. */
export const HANDS_AT = {
  // the cold tap; the paper cups out of the bottom of the holder on its side
  water_cooler: { tap: [0.56, 0.7, 0.9], cups: [0.73, 0.5, 0.84] },
  // the keypad; the flap, low down
  vending: { keypad: [0.8, 0.9, 1.12], flap: [0.4, 0.9, 0.26] },
  // the keys (the stool's x: catalog PIANO_STOOL), over their front half, their top; the keybed's
  // front edge and its underside (the knees go under it)
  piano: { keys: [1, 0.7, 0.74], ledge: [1, 0.81, 0.65] },
  // (plan 68) the cocoa urn's tap; a mug off the stack beside it
  cocoa_station: { tap: [0.42, 0.66, 0.98], mugs: [0.83, 0.62, 0.96] },
  // (plan 68) the drinks fridge's handle, then in at its shelves; the freezer's lid, then down in a tub
  drinks_fridge: { handle: [0.755, 0.83, 1.0], shelf: [0.5, 0.74, 1.1] },
  ice_cream_freezer: { lid: [1.0, 0.8, 0.86], tub: [1.0, 0.5, 0.76] },
} as const satisfies Record<string, Record<string, readonly [number, number, number]>>;
