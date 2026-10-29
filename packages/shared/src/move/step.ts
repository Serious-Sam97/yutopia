import { type Grid, moveStep } from "../grid.ts";
import { type Height, type JumpKind, stepHeight } from "../jump.ts";
import { type Gait, MOVE, type MoveSpec, STEP_DT } from "./spec.ts";
import { type Footing, footGrip, GRIP } from "./surface.ts";
import { probeVault, rollSpeed, type VerbKind, verbLen, verbPath } from "./verbs.ts";

// The body (docs/plan/29-the-move.md, M0–M4): one step of a body that has
// weight — it speeds up and slows down by what's under its feet (it skates on
// ice), turns at a rate, jumps a moment after the press (and still does just
// after stepping off something, or when pressed just before landing), goes
// higher the longer the jump is held, steers little in the air, and does its
// verbs (vault, mantle, roll, slide). Pure and deterministic: the same steps
// on the client and, to check them, on the server. Run at STEP_DT
// (`MoveClock`), whatever the frame rate. Directions are the floor's (x
// east, y south); `yaw` is atan2(y, x) of where the body faces.

export interface MoveInput {
  /** where to go, the floor's coords, length 0..1 (a stick's tilt; keys: 1) */
  x: number;
  y: number;
  sprint: boolean;
  walk: boolean;
  /** crouching (a toggle the input keeps), and switched on this step (a sprint's slide) */
  crouch: boolean;
  crouchPressed: boolean;
  aim: boolean;
  /** the jump button: held, and pressed this step */
  jump: boolean;
  jumpPressed: boolean;
  dodgePressed: boolean;
  /** where the camera looks (aiming faces it), rad */
  look: number;
  /** face where the camera looks whatever the way (first person: S backs up, A / D step aside) */
  faceLook?: boolean;
  /** no sprinting (out of breath: plan 30) */
  tired?: boolean;
}

export const NO_INPUT: MoveInput = {
  x: 0,
  y: 0,
  sprint: false,
  walk: false,
  crouch: false,
  crouchPressed: false,
  aim: false,
  jump: false,
  jumpPressed: false,
  dodgePressed: false,
  look: 0,
};

/** What a body asks of the world it moves through: where it fits, what's under it, whether a way's
 *  clear — the grid's answers (iso, the 3D view before Jolt's in) or Jolt's (shared/physics
 *  JoltCollider). */
export type Collider = Pick<Grid, "fitsAt" | "groundAt" | "clear" | "onRamp" | "onLand" | "speedAt">;

/** How a body is moved and kept on its feet (docs/plan/50-the-volume.md C): by its velocity for
 *  dt — along what's in the way (a blocked way's speed gone), up a step `stepUp` high walking and
 *  down one, falling, landing; `fly`: no gravity, neither. The grid's way (none: this file's) or
 *  Jolt's character (shared/physics CharacterMover). True: it landed this step. */
export interface Mover {
  step(b: Body, dt: number, stepUp: number, blocked?: (x: number, y: number) => boolean, fly?: boolean): boolean;
  /** It can move the body at (x, y): its world has the ground there (else the grid's way) */
  ready?(x: number, y: number): boolean;
}

export interface MoveEnv {
  grid: Collider;
  /** what moves the body (none: the grid's own way, below) */
  mover?: Mover;
  /** what's underfoot at (x, y) (grounds.ts `groundSurfaceAt` outdoors, else "floor") */
  footing(x: number, y: number): Footing;
  /** how fast the ground lets you go there (1 a floor; default: the grid's `speedAt`) */
  speed?(x: number, y: number): number;
  /** something there the grid doesn't know about (a car on the move): in the way */
  blocked?(x: number, y: number): boolean;
}

const groundSpeed = (env: MoveEnv, x: number, y: number) => env.speed?.(x, y) ?? env.grid.speedAt(x, y);

export interface VerbNow {
  kind: VerbKind;
  /** s into it, and how long it takes */
  t: number;
  len: number;
  x0: number;
  y0: number;
  z0: number;
  /** its way (a unit vector) */
  ux: number;
  uy: number;
  /** the top (vault, mantle) or a slide's starting speed; how far it carries (a vault's, a
   *  mantle's) or a slide's speed now */
  h: number;
  dist: number;
  /** where a vault's top starts and ends, ahead of where it began */
  near?: number;
  far?: number;
}

export interface Body {
  x: number;
  y: number;
  /** the feet, tiles up, and how fast they rise */
  z: number;
  vz: number;
  up: boolean;
  vx: number;
  vy: number;
  yaw: number;
  gait: Gait;
  /** s left to jump after stepping off; a press kept for this long */
  coyote: number;
  buffer: number;
  /** s to the feet leaving the ground (-1: no jump coming) */
  takeoff: number;
  jump: JumpKind | null;
  /** still going up from a jump (letting go now cuts it), from this height */
  rising: boolean;
  riseFrom: number;
  verb: VerbNow | null;
  /** 0..1, the last landing's force (the body's squash) */
  landed: number;
  /** s simulated */
  t: number;
}

export interface StepEvents {
  jumped?: JumpKind;
  /** landed this step, this hard (0..1) */
  landed?: number;
  verb?: VerbKind;
  ended?: VerbKind;
}

export function newBody(x: number, y: number, z = 0, yaw = 0): Body {
  return {
    x,
    y,
    z,
    vz: 0,
    up: false,
    vx: 0,
    vy: 0,
    yaw,
    gait: "still",
    coyote: 0,
    buffer: 0,
    takeoff: -1,
    jump: null,
    rising: false,
    riseFrom: z,
    verb: null,
    landed: 0,
    t: 0,
  };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
function turnTo(from: number, to: number, max: number): number {
  const d = wrap(to - from);
  return Math.abs(d) <= max ? to : wrap(from + Math.sign(d) * max);
}

/** The body's speed over the ground, tiles / s. */
export const speedOf = (b: Body) => Math.hypot(b.vx, b.vy);

/** In a roll's i-frames (plan 30: a strike lands on nobody rolling through it). */
export function dodging(b: Body, spec: MoveSpec = MOVE): boolean {
  return b.verb?.kind === "roll" && b.verb.t >= spec.roll.iframes[0] && b.verb.t <= spec.roll.iframes[1];
}

/** One step (`dt`, STEP_DT) of a body under `inp`. */
export function stepBody(b: Body, inp: MoveInput, env: MoveEnv, spec: MoveSpec = MOVE, dt = STEP_DT): StepEvents {
  const ev: StepEvents = {};
  const grid = env.grid;
  b.t += dt;
  b.buffer = inp.jumpPressed ? (b.up ? spec.fallBuffer : spec.buffer) : Math.max(0, b.buffer - dt);
  b.coyote = b.up ? Math.max(0, b.coyote - dt) : spec.coyote;

  if (b.verb) {
    // a jump out of a slide
    if (b.verb.kind === "slide" && b.buffer > 0) b.verb = null;
    else {
      stepVerb(b, env, spec, dt, ev);
      return ev;
    }
  }

  const mag = Math.min(1, Math.hypot(inp.x, inp.y));
  const ux = mag > 1e-3 ? inp.x / Math.hypot(inp.x, inp.y) : Math.cos(b.yaw);
  const uy = mag > 1e-3 ? inp.y / Math.hypot(inp.x, inp.y) : Math.sin(b.yaw);
  const foot = footGrip(env.footing(b.x, b.y));
  const speed = speedOf(b);

  // ── the verbs a press starts
  if (inp.dodgePressed && !b.up && b.takeoff < 0) {
    begin(b, "roll", ux, uy, 0, 0, spec);
    ev.verb = "roll";
    stepVerb(b, env, spec, dt, ev);
    return ev;
  }
  if (inp.crouchPressed && !b.up && b.gait === "sprint" && speed > spec.slide.enter * spec.sprint) {
    const sx = speed > 1e-3 ? b.vx / speed : ux;
    const sy = speed > 1e-3 ? b.vy / speed : uy;
    begin(b, "slide", sx, sy, speed + spec.slide.boost, speed + spec.slide.boost, spec);
    ev.verb = "slide";
    stepVerb(b, env, spec, dt, ev);
    return ev;
  }
  if (b.buffer > 0 && b.takeoff < 0 && (!b.up || b.coyote > 0)) {
    // something ahead to get over, going towards it
    const p = mag > 0.2 ? probeVault(grid, b.x, b.y, b.z, ux, uy, speed, spec) : null;
    b.buffer = 0;
    b.coyote = 0;
    if (p) {
      begin(b, p.kind, ux, uy, p.h, p.dist, spec, p.near, p.far);
      ev.verb = p.kind;
      stepVerb(b, env, spec, dt, ev);
      return ev;
    }
    b.takeoff = spec.takeoff;
    b.jump = b.gait === "sprint" ? "flip" : "hop";
  }
  // in the air with the jump held, going at something too high to clear: catch its edge, climb up
  if (b.up && inp.jump && mag > 0.2 && b.vz < 2.5 && b.takeoff < 0) {
    const p = probeVault(grid, b.x, b.y, b.z, ux, uy, 0, spec);
    if (p?.kind === "mantle" && p.h >= 0.3) {
      begin(b, "mantle", ux, uy, p.h, p.dist, spec, p.near);
      ev.verb = "mantle";
      stepVerb(b, env, spec, dt, ev);
      return ev;
    }
  }
  if (b.takeoff >= 0) {
    b.takeoff -= dt;
    if (b.takeoff <= 0) {
      const h = b.jump === "flip" ? spec.flip : spec.hop;
      b.vz = Math.sqrt(2 * spec.g * h);
      b.up = true;
      b.rising = true;
      b.riseFrom = b.z;
      b.takeoff = -1;
      ev.jumped = b.jump ?? "hop";
    }
  }
  // let go on the way up: no higher than a tap's
  if (b.rising) {
    if (b.vz <= 0) b.rising = false;
    else if (!inp.jump) {
      const tap = b.jump === "flip" ? spec.flipTap : spec.hopTap;
      const rest = Math.max(0.04, tap - (b.z - b.riseFrom));
      b.vz = Math.min(b.vz, Math.sqrt(2 * spec.g * rest));
      b.rising = false;
    }
  }

  // ── the gait and the speed wanted
  const facing = Math.cos(Math.atan2(uy, ux) - b.yaw);
  let gait: Gait;
  let want: number;
  if (mag < 0.05) {
    gait = "still";
    want = 0;
  } else if (inp.aim) {
    gait = "aim";
    want = spec.aim;
  } else if (inp.crouch) {
    gait = "crouch";
    want = spec.crouch;
  } else if (inp.walk) {
    gait = "walk";
    want = spec.walk;
  } else if (inp.sprint && !inp.tired && facing >= Math.cos(spec.sprintCone)) {
    gait = "sprint";
    want = spec.sprint;
  } else {
    // a stick's tilt: up to a walk at half, a jog at full; keys are full
    want = mag <= 0.5 ? (spec.walk * mag) / 0.5 : spec.walk + ((spec.jog - spec.walk) * (mag - 0.5)) / 0.5;
    gait = want <= spec.walk + 1e-6 ? "walk" : "jog";
  }
  // the crouch's slower speeds and the aim's hold for a stick's tilt too
  if (gait === "crouch" || gait === "aim") want *= Math.min(1, mag / 0.6);
  want *= groundSpeed(env, b.x, b.y);
  const wx = ux * want;
  const wy = uy * want;

  // ── speeding up, slowing down, turning: by the grip underfoot (a little, in the air)
  const air = spec.air * GRIP.floor.accel;
  const dvx = wx - b.vx;
  const dvy = wy - b.vy;
  const dv = Math.hypot(dvx, dvy);
  if (dv > 1e-9) {
    const gaining = wx * b.vx + wy * b.vy >= b.vx * b.vx + b.vy * b.vy;
    const rate = b.up ? air : gaining ? foot.accel : foot.decel;
    const k = Math.min(1, (rate * dt) / dv);
    b.vx += dvx * k;
    b.vy += dvy * k;
  }

  // ── moving: sliding along walls, a blocked way's speed gone; up steps, and down them; the
  // feet: falling, landing, stepping off
  settle(b, env, dt, b.up ? 0 : spec.stepUp, spec, ev);

  // ── facing: where you aim, else where you mean to go
  const heading =
    inp.aim || inp.faceLook
      ? inp.look
      : mag > 0.1
        ? Math.atan2(uy, ux)
        : speedOf(b) > 0.3
          ? Math.atan2(b.vy, b.vx)
          : b.yaw;
  const rate = b.up ? spec.airTurn : spec.turn * foot.turn;
  b.yaw = turnTo(b.yaw, heading, rate * dt);
  b.gait = gait === "still" && speedOf(b) > 0.4 ? b.gait : gait;
  return ev;
}

/** Moved and on its feet: by the env's mover, or the grid's way. */
function settle(b: Body, env: MoveEnv, dt: number, stepUp: number, spec: MoveSpec, ev: StepEvents) {
  const falling = b.vz;
  let down: boolean;
  // (where the mover's world hasn't the land yet — just teleported far, the browser's chunks
  // still being made — the grid's way: else nothing's under the body, it falls, and the land
  // made over it a moment later has it under the ground for good)
  if (env.mover && (env.mover.ready?.(b.x, b.y) ?? true)) down = env.mover.step(b, dt, stepUp, env.blocked);
  else {
    move(b, env.grid, dt, stepUp, env.blocked);
    stepDown(b, env.grid, spec);
    down = fall(b, env.grid, dt);
  }
  if (down) landed(b, falling, spec, ev);
}

function move(b: Body, grid: Collider, dt: number, stepUp = 0, blocked?: (x: number, y: number) => boolean) {
  const s = speedOf(b);
  if (s < 1e-6) return;
  const tx = b.x + b.vx * dt;
  const ty = b.y + b.vy * dt;
  // (a car on the move: slid along like a wall — one that came onto me, walked out of)
  const by = blocked?.(b.x, b.y) ? undefined : blocked;
  const p = moveStep(grid, { x: b.x, y: b.y }, { x: b.vx / s, y: b.vy / s }, s, dt, b.z, by);
  // stopped by something knee-high with room on top (a step, a kerb): onto it, no jump
  if (stepUp > 0 && (Math.abs(p.x - tx) > 1e-9 || Math.abs(p.y - ty) > 1e-9)) {
    const reach = b.z + stepUp;
    if (grid.fitsAt(tx, ty, reach)) {
      const g = grid.groundAt(tx, ty, reach);
      if (g > b.z + 1e-3 && g <= reach + 1e-6 && grid.fitsAt(tx, ty, g) && !by?.(tx, ty)) {
        b.x = tx;
        b.y = ty;
        b.z = g;
        return;
      }
    }
  }
  if (Math.abs(p.x - tx) > 1e-9) b.vx = 0;
  if (Math.abs(p.y - ty) > 1e-9) b.vy = 0;
  b.x = p.x;
  b.y = p.y;
}

/** Walking off a step down (no higher than one up): the feet follow it, no fall. */
function stepDown(b: Body, grid: Collider, spec: MoveSpec) {
  if (b.up || b.takeoff >= 0) return;
  const g = grid.groundAt(b.x, b.y, b.z);
  if (g < b.z - 1e-3 && b.z - g <= spec.stepUp + 1e-6) b.z = g;
}

// falling, landing, stepping off (the grid's way): true, landed
function fall(b: Body, grid: Collider, dt: number): boolean {
  const h: Height = { z: b.z, vz: b.vz, up: b.up };
  const down = stepHeight(grid, b.x, b.y, h, dt);
  b.z = h.z;
  b.vz = h.vz;
  b.up = h.up;
  return down;
}

// landed (`falling`: how fast it came down)
function landed(b: Body, falling: number, spec: MoveSpec, ev: StepEvents) {
  const impact = Math.min(1, Math.max(0, -falling) / (spec.hardLand * 1.5));
  b.landed = impact;
  ev.landed = impact;
  b.rising = false;
  b.jump = null;
  // a hard landing costs you some speed
  if (impact > 0.5) {
    const keep = 1 - 0.5 * (impact - 0.5);
    b.vx *= keep;
    b.vy *= keep;
  }
}

function begin(
  b: Body,
  kind: VerbKind,
  ux: number,
  uy: number,
  h: number,
  dist: number,
  spec: MoveSpec,
  near?: number,
  far?: number,
) {
  b.verb = { kind, t: 0, len: verbLen(kind, spec), x0: b.x, y0: b.y, z0: b.z, ux, uy, h, dist, near, far };
  b.takeoff = -1;
  b.rising = false;
  b.yaw = Math.atan2(uy, ux);
}

function stepVerb(b: Body, env: MoveEnv, spec: MoveSpec, dt: number, ev: StepEvents) {
  const v = b.verb as VerbNow;
  const grid = env.grid;
  v.t += dt;
  const k = Math.min(1, v.t / v.len);
  if (v.kind === "vault" || v.kind === "mantle") {
    // along its shape, over the top (the probe found it clear)
    const p = verbPath(v.kind, k, v.h, v.dist, spec, v.near, v.far);
    const nx = v.x0 + v.ux * p.ahead;
    const ny = v.y0 + v.uy * p.ahead;
    b.vx = (nx - b.x) / dt;
    b.vy = (ny - b.y) / dt;
    b.x = nx;
    b.y = ny;
    b.z = v.z0 + p.up;
    b.vz = 0;
    b.up = p.up > 0.02;
    if (k >= 1) {
      // out of it on the move (a vault) or standing on the top (a mantle)
      const out = v.kind === "vault" ? spec.jog : 0;
      b.vx = v.ux * out;
      b.vy = v.uy * out;
      b.z = grid.groundAt(b.x, b.y, b.z + 0.1);
      b.up = false;
      end(b, ev);
    }
    return;
  }
  // the roll and the slide: moved over the ground, stopped by what's in the way
  let s: number;
  if (v.kind === "roll") s = rollSpeed(k, spec) * groundSpeed(env, b.x, b.y);
  else {
    v.dist = Math.max(0, v.dist - footGrip(env.footing(b.x, b.y)).slide * dt);
    s = v.dist;
  }
  b.vx = v.ux * s;
  b.vy = v.uy * s;
  settle(b, env, dt, b.up ? 0 : spec.stepUp, spec, ev);
  if (k >= 1 || (v.kind === "slide" && s < spec.slide.minSpeed)) end(b, ev);
}

function end(b: Body, ev: StepEvents) {
  ev.ended = b.verb?.kind;
  b.verb = null;
}

/** Runs a body's fixed steps for each frame: how far the frame is between the last two (0..1),
 *  for drawing it smoothly. */
export class MoveClock {
  private acc = 0;
  advance(frame: number, step: () => void): number {
    this.acc = Math.min(this.acc + Math.max(0, frame), 0.25);
    while (this.acc >= STEP_DT) {
      step();
      this.acc -= STEP_DT;
    }
    return this.acc / STEP_DT;
  }
}
