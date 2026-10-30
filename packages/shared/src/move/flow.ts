import type { startFlow, stepFlow } from "./flow-moves.ts";
import type { MoveSpec } from "./spec.ts";
import type { Body, Collider } from "./step.ts";

// Flowmotion (docs/plan/56-the-controls.md F): momentum off the world, after Kingdom Hearts 3 —
//   a wall kick: jump at a wall in the air, or roll into one, and kick off it, up and back;
//   a wall run: dash into a wall that can be run and run up it, kicking off at the end (over the
//     top, if it's in reach); dash at it slantwise and run along it instead, in a low arc;
//   a pole swing: roll or dash into a pole and swing round it while the dash is held, flung out
//     along the way it goes when let go;
//   a rail grind: land on a rail and slide along it, off its end or jumped off;
//   a ledge grab: falling at a top a little too high to mantle, hang from it, then up (or drop);
//   and the flow jump: off any of them, higher than a jump, the air's jump and dash given back.
// What can be run, swung round or ground along is tagged (the world's `FlowWorld`); the ledges are
// the collider's own tops. Each move sets the body where it is (the mover places it there), the
// same step on both ends.

/** The world's tagged things, as Flowmotion asks for them (tiles; z up) — and the moves themselves
 *  (`FLOW_MOVES`), handed in with them: the step doesn't carry them, so they load where the world
 *  that has them does (the 3D view's physics), not with every body that moves. */
export interface FlowWorld {
  moves: FlowMoves;
  /** an upright pole near (x, y) at feet z: its middle, radius, top */
  pole(x: number, y: number, z: number, reach: number): { x: number; y: number; r: number; top: number } | null;
  /** a wall the body's against going (ux, uy): its face's outward normal on the floor, how far
   *  from it, its top, whether it can be run up */
  wall(
    x: number,
    y: number,
    z: number,
    ux: number,
    uy: number,
    reach: number,
  ): { nx: number; ny: number; d: number; top: number; run: boolean } | null;
  /** a rail under (x, y) near feet z: the nearest point on its top, its way, how far to each end */
  rail(
    x: number,
    y: number,
    z: number,
    reach: number,
  ): { x: number; y: number; z: number; ux: number; uy: number; back: number; ahead: number } | null;
}

export interface FlowSpec {
  /** off a wall: up (tiles) and out (tiles / s) */
  kickUp: number;
  kickOut: number;
  /** up a wall: tiles / s, for at most `runLen` s */
  runUp: number;
  runLen: number;
  /** along a wall: at least `side` tiles / s for at most `sideLen` s, starting up at `sideUp`
   *  tiles / s under `sideG` of the fall's pull (a low arc) */
  side: number;
  sideLen: number;
  sideUp: number;
  sideG: number;
  /** round a pole (tiles / s along), flung off it (tiles / s) */
  swing: number;
  fling: number;
  /** along a rail, at least (tiles / s) */
  grind: number;
  /** the flow jump's height (tiles) */
  jump: number;
  /** how near a wall or a pole has to be (tiles from its face) */
  reach: number;
}

export type FlowKind = "wallrun" | "wallside" | "swing" | "grind" | "hang" | "climb";
export interface FlowNow {
  kind: FlowKind;
  t: number;
  /** a pole's middle and the radius round it, the angle and its way (1, -1); a rail's or a wall's
   *  way (a wall's: its outward normal); a top */
  cx: number;
  cy: number;
  r: number;
  a: number;
  dir: number;
  ux: number;
  uy: number;
  top: number;
  /** a grind's speed along the rail (signed), how far it is to its ends; along a wall, its speed */
  s: number;
  back: number;
  ahead: number;
  /** a climb: from (x0, y0, z0) up onto the top at (x1, y1), on at `s` after */
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
}

/** s from a hang (or the top of a wall run) up onto the top */
export const CLIMB = 0.34;
/** how far over the feet a wall's top must be to run up it (less, it's mantled or jumped) */
export const RUN_MIN = 2.2;

/** Flowmotion's moves (flow-moves.ts), for a `FlowWorld` to hand the step. */
export interface FlowMoves {
  start: typeof startFlow;
  step: typeof stepFlow;
}

// ── how a move looks (the pose's, here and on the wire) ──

/** A Flowmotion move as it's drawn: which, how long it's been going (a climb: how far through, 0..1;
 *  a spin: the flow jump's, 0..1), where its wall or pole is (1 the body's left, −1 its right), and
 *  how fast it goes (a run's cycle by it). */
export interface FlowLook {
  kind: FlowKind | "spin";
  t: number;
  side: number;
  speed: number;
}

/** s a flow jump's spin takes (drawn: the move itself is a jump's) */
export const SPIN_LEN = 0.6;

/** The look of a body's move now, or null. */
export function flowLook(b: Body, spec: MoveSpec): FlowLook | null {
  const f = b.flow;
  if (!f) return null;
  // (the body's left: the floor's y being south)
  const leftOf = (dx: number, dy: number) => (dx * Math.sin(b.yaw) - dy * Math.cos(b.yaw) >= 0 ? 1 : -1);
  switch (f.kind) {
    case "wallrun":
      return { kind: "wallrun", t: f.t, side: 1, speed: spec.flow?.runUp ?? 5 };
    case "wallside":
      return { kind: "wallside", t: f.t, side: leftOf(-f.ux, -f.uy), speed: f.s };
    case "swing":
      return { kind: "swing", t: f.t, side: leftOf(f.cx - b.x, f.cy - b.y), speed: 0 };
    case "climb":
      return { kind: "climb", t: f.t / CLIMB, side: 1, speed: 0 };
    default:
      return { kind: f.kind, t: f.t, side: 1, speed: Math.abs(f.s) };
  }
}

// on the wire (a player's `flow`, a byte): the kind's place + 1, its side's 16 (0: none)
const CODES: FlowLook["kind"][] = ["wallrun", "wallside", "swing", "grind", "hang", "climb", "spin"];
export const flowCode = (l: Pick<FlowLook, "kind" | "side"> | null): number =>
  l ? CODES.indexOf(l.kind) + 1 + (l.side < 0 ? 16 : 0) : 0;
export const isFlowCode = (c: unknown): c is number =>
  typeof c === "number" && Number.isInteger(c) && (c & 15) <= CODES.length && (c & ~31) === 0;

/** Someone's move from its byte and `secs` since it began (as late as they're drawn). */
export function flowOfCode(code: number, secs: number, spec: MoveSpec): FlowLook | null {
  const kind = CODES[(code & 15) - 1];
  if (!kind) return null;
  const side = code & 16 ? -1 : 1;
  const t = Math.max(0, secs);
  const f = spec.flow;
  switch (kind) {
    case "climb":
      return t > CLIMB ? null : { kind, t: t / CLIMB, side, speed: 0 };
    case "spin":
      return t > SPIN_LEN ? null : { kind, t: t / SPIN_LEN, side, speed: 0 };
    case "wallrun":
      return { kind, t, side, speed: f?.runUp ?? 5 };
    case "wallside":
      return { kind, t, side, speed: f?.side ?? 8 };
    case "grind":
      return { kind, t, side, speed: f?.grind ?? 7 };
    default:
      return { kind, t, side, speed: 0 };
  }
}
