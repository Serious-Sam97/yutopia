import { SEAT_NEXT, SEAT_SPEC, type SeatSpec } from "@yutopia/shared";
import type { Bone } from "three";
import { FURN } from "../furn/flag";

// Where a sitter goes on each seat (docs/plan/62-the-touch.md, phase 1): the seats' own shapes, and
// her place on one fitted to her.

// Each seat as it's drawn, sat on (shared furniture.ts SEAT_SPEC: the cushion's top less what it
// gives, its front edge, its back's face, the lean, solid in front, its arms' top, m from the tile's
// middle along the way its sitter faces). With ?furn=new the redrawn seats not yet signed off are sat
// on as they're drawn (plan 67: SEAT_NEXT). Out on the land (no kind) the server's put her where she
// sits: a park bench, a stand's row.
export type SeatShape = SeatSpec;
export const SEATS: Record<string, SeatShape> = FURN === "new" ? { ...SEAT_SPEC, ...SEAT_NEXT } : SEAT_SPEC;
const SEAT_LAND: SeatShape = { top: 0.3573, front: 0, back: null, lean: [0, 0] };
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
