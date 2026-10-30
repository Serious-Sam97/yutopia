import type { FlowSpec } from "./flow.ts";

// The move (docs/plan/29-the-move.md): every number of how a body moves, as
// data — tuned in /dev/move, the same on the client and the server.

/** The step the body is simulated at, s (a fixed step: the same at any frame rate). */
export const STEP_DT = 1 / 120;

/** Feet more than this many tiles over whatever's under them: aloft (docs/plan/49-the-height.md) —
 *  the 3D camera follows them all the way up, and the client's prompts (the page's: no shapes there)
 *  go. Reach itself is three-dimensional now (shared reach.ts: docs/plan/50-the-volume.md E). */
export const ALOFT = 2;

export const GAITS = ["still", "walk", "jog", "sprint", "crouch", "aim"] as const;
export type Gait = (typeof GAITS)[number];

// ── on the wire (Player.mv, .yaw): the gait and two flags in a byte, the facing in another ──
const MV_CROUCH = 8;
export const MV_AIM = 16;
/** In `pos` only (not kept on Player.mv): the sender is out of breath (docs/plan/30-the-dark.md
 *  D2) — the server takes it at its word, since it only holds them back. */
export const MV_WINDED = 32;
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
  /** a sprint's jump a leap, not a flip (the KH body: the flip's the jump in the air) — as high */
  leap?: boolean;
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
  // ── the KH feel (docs/plan/56-the-controls.md B): none of these, the body as plan 29 made it ──
  /** gravity on the way down, tiles / s² (`g` is the way up) */
  gDown?: number;
  /** the hang at the top: gravity × `k` while the feet rise or fall slower than `band` tiles / s */
  hang?: { band: number; k: number };
  /** no faster down than this, tiles / s */
  fallCap?: number;
  /** jumps in the air (the double jump), and how high each goes, tiles */
  airJumps?: number;
  airJump?: number;
  /** the air dash (the dodge in the air), once an air time: `dist` tiles in `len` s, no fall */
  airDash?: { len: number; dist: number };
  /** the footings' accel and decel × this (a snappier body on every ground) */
  grip?: number;
  /** …the decel × this instead, when given (plan 58: a stop that takes a moment) */
  gripStop?: number;
  /** facing turned at this rad / s at a run (from `turn` standing, by the speed): turns on the
   *  move are arcs (plan 58) */
  turnRun?: number;
  /** on the move, facing the way it goes, not the way it's asked to: an arc's way, a reversal's
   *  slowing down still facing on, turned round once it's slow (plan 58) */
  faceWay?: boolean;
  /** Flowmotion (flow.ts: docs/plan/56-the-controls.md F) */
  flow?: FlowSpec;
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

/** The body after Kingdom Hearts 3 (docs/plan/56-the-controls.md B): a run by default, the dash on
 *  a held dodge, snappy on its feet, a high jump with a hang at the top and a quick fall, a second
 *  jump and a dash in the air. Tried in /dev/move; the world keeps MOVE until it's signed off. */
export const KH_MOVE: MoveSpec = {
  ...MOVE,
  // (the walk a real one for her legs: at 2.2 m/s it couldn't be — 2026-10-30, plan 58 phase 4a)
  walk: 1.5,
  jog: 5,
  sprint: 8.2,
  sprintCone: Math.PI / 3,
  turn: 24,
  airTurn: 14,
  air: 0.85,
  hopTap: 0.7,
  hop: 1.5,
  flipTap: 0.9,
  flip: 1.7,
  leap: true,
  g: 26,
  gDown: 44,
  hang: { band: 1.5, k: 0.5 },
  fallCap: 14,
  airJumps: 1,
  airJump: 0.9,
  airDash: { len: 0.18, dist: 3 },
  grip: 2.3,
  flow: {
    kickUp: 1.3,
    kickOut: 4.5,
    runUp: 5.5,
    runLen: 1.0,
    side: 8.5,
    sideLen: 1.1,
    sideUp: 3.6,
    sideG: 0.2,
    swing: 9,
    fling: 9.5,
    grind: 7,
    jump: 2.0,
    reach: 0.55,
  },
  roll: { ...MOVE.roll },
  slide: { ...MOVE.slide },
  vault: { ...MOVE.vault },
  mantle: { ...MOVE.mantle },
};

/** The KH body with weight (docs/plan/58-the-animation.md G.A): a run reached in ~0.2 s, a stop in
 *  ~0.25 s (a skid from a sprint), arcs on the run, facing where it goes. Tried in /dev/move with
 *  plan 58's animations; the world keeps KH_MOVE till it's signed off. */
export const KH_FEEL: MoveSpec = {
  ...KH_MOVE,
  grip: 1,
  gripStop: 0.75,
  turnRun: 11,
  faceWay: true,
};
