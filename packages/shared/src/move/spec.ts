// The move (docs/plan/29-the-move.md): every number of how a body moves, as
// data — tuned in /dev/move, the same on the client and the server.

/** The step the body is simulated at, s (a fixed step: the same at any frame rate). */
export const STEP_DT = 1 / 120;

export const GAITS = ["still", "walk", "jog", "sprint", "crouch", "aim"] as const;
export type Gait = (typeof GAITS)[number];

// ── on the wire (Player.mv, .yaw): the gait and two flags in a byte, the facing in another ──
const MV_CROUCH = 8;
const MV_AIM = 16;
/** The body's gait, crouching and aiming in a byte (Player.mv). */
export function packMv(gait: Gait, crouch = false, aim = false): number {
  return (Math.max(0, GAITS.indexOf(gait)) & 7) | (crouch ? MV_CROUCH : 0) | (aim ? MV_AIM : 0);
}
export function unpackMv(mv: number): { gait: Gait; crouch: boolean; aim: boolean } {
  return { gait: GAITS[mv & 7] ?? "still", crouch: (mv & MV_CROUCH) !== 0, aim: (mv & MV_AIM) !== 0 };
}
/** A facing (rad) in a byte, and back. */
export const yawToByte = (yaw: number) => Math.round((yaw / (2 * Math.PI)) * 256) & 255;
export const byteToYaw = (b: number) => ((b & 255) / 256) * 2 * Math.PI;

export interface MoveSpec {
  /** tiles / s on a floor (the ground's own `speed` multiplies them outdoors) */
  walk: number;
  jog: number;
  sprint: number;
  crouch: number;
  aim: number;
  /** sprinting only within this of where the body faces, rad */
  sprintCone: number;
  /** how fast the body turns to face its way, rad / s: on the ground, in the air */
  turn: number;
  airTurn: number;
  /** the ground's acceleration in the air, a share */
  air: number;
  /** s from the press to the feet leaving the ground */
  takeoff: number;
  /** s after stepping off something that a jump still goes */
  coyote: number;
  /** s a press before landing is kept: on the ground, falling */
  buffer: number;
  fallBuffer: number;
  /** the jump's apex, tiles: a tap, held; a sprint's flip: a tap, held */
  hopTap: number;
  hop: number;
  flipTap: number;
  flip: number;
  /** gravity, tiles / s² (jump.ts) */
  g: number;
  /** walked up (and down) without a jump: a step, a kerb, a stair, tiles */
  stepUp: number;
  /** a landing this fast (tiles / s down) or more is a hard one */
  hardLand: number;
  roll: { len: number; speed: number; iframes: [number, number]; recover: number };
  slide: { len: number; boost: number; minSpeed: number; enter: number };
  vault: { len: number; low: number; high: number; reach: number; beyond: number };
  mantle: { len: number; high: number };
}

export const MOVE: MoveSpec = {
  walk: 2.2,
  jog: 4.2,
  sprint: 6.8,
  crouch: 1.6,
  aim: 2.0,
  sprintCone: Math.PI / 4,
  turn: 12,
  airTurn: 4,
  air: 0.3,
  takeoff: 0.04,
  coyote: 0.11,
  buffer: 0.15,
  fallBuffer: 0.22,
  hopTap: 0.55,
  hop: 0.8,
  flipTap: 1.0,
  flip: 1.45,
  g: 20,
  stepUp: 0.27,
  hardLand: 7,
  roll: { len: 0.35, speed: 8.5, iframes: [0.1, 0.25], recover: 0.25 },
  // into a slide from a sprint: a boost, then the ground's own friction; up again under minSpeed
  slide: { len: 1.2, boost: 1.2, minSpeed: 2.2, enter: 0.8 },
  // a vault: over a top this high above the feet (tiles), found within `reach` ahead, with
  // ground to land on within `beyond` of its far side
  vault: { len: 0.55, low: 0.28, high: 0.75, reach: 0.65, beyond: 1.4 },
  // (up to a parked car's roof: 1.43)
  mantle: { len: 0.75, high: 1.5 },
};
