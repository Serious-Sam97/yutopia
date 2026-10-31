import type { Bone } from "three";
import { ZPX } from "./kit3d";

// Where a sitter goes on each seat (docs/plan/62-the-touch.md, phase 1): the seats' own shapes, and
// her place on one fitted to her.

// Each seat as it's drawn (art/items, sat on: the cushion sunk, the back leant), m along the way its
// sitter faces from the tile's middle (plan 62): the cushion's top less what it gives, its front edge,
// its back's face (none: a bench, a bean bag), the least and most she leans back, solid to the floor
// in front (the shins kept clear of it), its arms' top. Out on the land (no kind) the server's put
// her where she sits: a park bench, a stand's row.
export interface SeatShape {
  top: number;
  front: number;
  back: number | null;
  lean: [number, number];
  solid?: boolean;
  arms?: number;
  /** a backless seat's own back edge: the hips no further back than on it */
  rear?: number;
}
export const SEATS: Record<string, SeatShape> = {
  chair: { top: 14 / ZPX, front: 0.3, back: -0.32, lean: [0, 0.15] },
  armchair: { top: 13.5 / ZPX, front: 0.4, back: -0.21, lean: [0.1, 0.3], solid: true, arms: 19 / ZPX },
  sofa: { top: 16.6 / ZPX, front: 0.42, back: -0.1, lean: [0.2, 0.3], solid: true },
  beanbag: { top: 11 / ZPX, front: 0.36, back: null, lean: [0.4, 0.4], solid: true },
  bench: { top: 11.2 / ZPX, front: 0.32, back: null, lean: [0, 0] },
  // (a piano's stool, played sat on: its top 13.4 iso px, art/items/play.ts)
  stool: { top: 13 / ZPX, front: 0.15, back: null, rear: -0.15, lean: [0, 0] },
};
const SEAT_LAND: SeatShape = { top: 14 / ZPX, front: 0, back: null, lean: [0, 0] };
const PELVIS = 0.09; // m: the seat of the trousers behind the hips' joint
const BLADES = 0.45; // m: the shoulder blades over the hips, sat
/** Where the hips go along the seat (m ahead of its middle) and how far she leans back: the knees at
 *  its front edge, the trunk back to its back — as far as the seat lets her lean, the rest of the
 *  way the hips go back. */
export function seatFit(s: SeatShape, thigh: number): { along: number; recline: number } {
  if (s === SEAT_LAND) return { along: 0, recline: 0 };
  let along = s.front - thigh * 0.95;
  let recline = s.lean[0];
  if (s.back !== null) {
    const gap = along - s.back - PELVIS;
    recline = Math.min(s.lean[1], Math.max(s.lean[0], Math.atan2(gap, BLADES)));
    along -= Math.max(0, gap - BLADES * Math.tan(recline));
    along = Math.max(along, s.back + PELVIS);
  }
  if (s.rear !== undefined) along = Math.max(along, s.rear + PELVIS);
  return { along, recline };
}
export const seatShape = (kind: string | undefined): SeatShape => (kind && SEATS[kind]) || SEAT_LAND;
/** m: the ankle over the sole (chars/moves ANKLE) */
export const ANKLE_M = 0.061;

/** Her legs from her bones (the people's chunk kept as it is): the thigh's length, and the hips'
 *  joint over the floor stood — the thigh, the shin and the ankle over the sole. */
export function legOf(bone: (j: "kneeL" | "ankleL") => Bone | null): { thigh: number; hipY: number } {
  const knee = bone("kneeL")?.position.length() ?? 0.4;
  const ankle = bone("ankleL")?.position.length() ?? 0.4;
  return { thigh: knee, hipY: knee + ankle + ANKLE_M };
}
