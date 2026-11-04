import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, isoPx, type KindShape, one } from "./units.ts";

// Plan 68 phase 9 (docs/plan/68-more-furniture.md): Game room — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/gameroom.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts).
export const CATALOG = {
  // (the games — air hockey, foosball, darts, chess, the claw — are later phases: modelled ready, their
  // playing surfaces' measures in the client's fam/gameroom.ts PLAY)
  air_hockey: {
    interact: "hockey",
    label: "Air hockey table",
    w: 3,
    h: 2,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
  },
  foosball: {
    interact: "foosball",
    label: "Foosball table",
    w: 2,
    h: 2,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
  },
  dartboard: {
    interact: "darts",
    label: "Dartboard",
    w: 1,
    h: 1,
    solid: false,
    wall: true,
    buildable: true,
    variants: 3,
    look: 0,
  },
  chess_table: {
    interact: "chess",
    label: "Chess table",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
  },
  // (plan 70 phase 9) a life-size board on the floor: two commanders send the men from the daises at
  // its ends, and anyone can stand in for a man (squares 1.1 m; the men at a person's size)
  wizard_chess: {
    interact: "chess",
    label: "Wizard's chess board",
    w: 10,
    h: 10,
    solid: false,
    buildable: true,
    variants: 3,
    look: 1,
  },
  pinball: {
    label: "Pinball machine",
    w: 1,
    h: 2,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    light: { color: 0xff9ad0, radius: 2, intensity: 0.28 },
  },
  claw_machine: {
    interact: "claw",
    label: "Claw machine",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    light: { color: 0xffe2f0, radius: 2.4, intensity: 0.32 },
  },
  jukebox: {
    label: "Jukebox",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    interact: "radio",
    variants: 3,
    look: 0,
    light: { color: 0xffb060, radius: 2.8, intensity: 0.4 },
  },
  skee_ball: {
    label: "Skee-ball lane",
    w: 1,
    h: 3,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    light: { color: 0xffd28a, radius: 2.4, intensity: 0.3 },
  },
  card_table: {
    label: "Card table",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    paint: true,
    surface: isoPx(0.74),
  },
  cornhole_board: {
    label: "Beanbag toss board",
    w: 1,
    h: 2,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    paint: true,
  },
} satisfies Record<string, CatalogEntry>;
export const SHAPES = {
  // (the table to its rails, the score on the near rail)
  air_hockey: one(box(0.34, 0.37, 2.66, 1.63, 0, 0.865), box(1.31, 1.55, 1.69, 1.63, 0.865, 0.94)),
  // (the cabinet to its rim, the rods and grips out either side, the score's beads over it)
  foosball: one(
    box(0.26, 0.62, 1.74, 1.38, 0, 0.91),
    box(0.36, 0.31, 1.64, 1.69, 0.83, 0.87),
    box(0.31, 0.84, 1.69, 1.16, 0.91, 0.95),
  ),
  dartboard: one(box(0.03, 0.1, 0.97, 0.47, 1.07, 2.08)),
  // (the table; its chairs are seats, walked onto and sat on as every seat is — plan 70: CHAIRS)
  chess_table: one(box(0.69, 0.09, 1.31, 0.91, 0, 0.72)),
  // (walked on: the board a few centimetres up, the daises a step)
  wizard_chess: one(box(0, 0, 10, 10, 0, 0.04), box(0.05, 4.2, 0.55, 5.8, 0, 0.16), box(9.45, 4.2, 9.95, 5.8, 0, 0.16)),
  pinball: one(box(0.13, 0.28, 0.87, 1.85, 0, 1.12), box(0.14, 0.27, 0.86, 0.55, 1.08, 1.97)),
  claw_machine: one(box(0.09, 0.1, 0.91, 0.96, 0, 1.98)),
  jukebox: one(box(0.08, 0.21, 0.92, 0.83, 0, 1.49)),
  // (the lane, then the rings' cage and the score up top)
  skee_ball: one(box(0.1, 1.0, 0.9, 2.99, 0, 0.92), box(0.1, 0.1, 0.9, 1.16, 0, 2.43)),
  card_table: one(box(0.07, 0.07, 0.93, 0.93, 0, 0.74)),
  // (the board, a bag fallen short in front of it)
  cornhole_board: one(box(0.19, 0.38, 0.81, 1.61, 0, 0.3), box(0.52, 1.64, 0.72, 1.84, 0, 0.04)),
} satisfies Record<keyof typeof CATALOG, KindShape>;
export const SEATS: Record<string, SeatSpec> = {
  // (plan 70) the chess table's chairs, from the chair's middle (its CHAIRS spot) the way it faces
  chess_table: { top: 0.46, front: 0.22, back: -0.2, lean: [0, 0.12] },
};
/** (plan 70, docs/plan/70-the-chess.md) The seats of a kind whose seats face different ways — the chess
 *  table's two chairs, each facing the board: where each one's middle is in the kind's frame (m, as
 *  its shapes), and the way it faces at the kind's rot 0 (grid.ts `seatFront`'s quarter: 3 is +x, 1
 *  is −x). The chess table's first is white's, its second black's. */
/** (plan 70 phase 9) Where a board's commanders stand (its frame, m) and the way they face at rot 0:
 *  white's first. Standing there takes the side, as sitting in a chess table's chair does. */
export const COMMANDERS: Record<string, { u: number; v: number; face: number }[]> = {
  wizard_chess: [
    { u: 0.3, v: 5, face: 3 },
    { u: 9.7, v: 5, face: 1 },
  ],
};
export const CHAIRS: Record<string, { u: number; v: number; face: number }[]> = {
  chess_table: [
    { u: 0.34, v: 0.5, face: 3 },
    { u: 1.66, v: 0.5, face: 1 },
  ],
};
export const SURFACES: Record<string, number> = { card_table: 0.74 };
export const STANDS: Record<string, number> = { air_hockey: 0.865, foosball: 0.91 };
// (the dartboard: across its open cabinet's doors, from the pub board's slate to the cabinet's top)
export const HANGS: Record<string, [number, number, number]> = { dartboard: [4, 42, 82] };
