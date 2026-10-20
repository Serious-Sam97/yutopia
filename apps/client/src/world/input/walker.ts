import type { Grid, JumpKind, Point } from "@yutopia/shared";
import {
  type Body,
  type Footing,
  type Gait,
  MOVE,
  MoveClock,
  type MoveEnv,
  type MoveSpec,
  newBody,
  packMv,
  type StepEvents,
  speedOf,
  stepBody,
  type VerbKind,
  verbProgress,
  yawToByte,
} from "@yutopia/shared/move";
import { afterFirstStep, MoveControls, type Press } from "./controls";

// My body in the world (docs/plan/29-the-move.md, phase 2): the movement core
// run on its fixed step under the keys, the pad or a click-to-walk path, and
// handed to the controller drawn smoothly between steps — where I am, how
// high, which way I face, what happened (a jump, a landing). Put somewhere
// from outside (the server's snap, a floor change on the stairs, a ride), the
// body is put there too.

export interface WalkCtx {
  grid: Grid;
  footing(x: number, y: number): Footing;
  /** something the grid doesn't know about in the way (a car on the move) */
  blocked?(x: number, y: number): boolean;
  /** where the camera faces on the floor (atan2): W, the stick's up, go that way */
  camYaw: number;
  /** first person: I face where the camera looks (S backs up, A / D step aside) */
  faceLook: boolean;
  /** a jump (or a verb, a crouch) may start (not seated, not busy at something) */
  canJump: boolean;
  /** aiming is possible (a 3D view) */
  canAim: boolean;
  /** the keys and the pad walk me (not while a console is being played on the pad) */
  usePad: boolean;
  /** a path to walk (click-to-walk), when the keys aren't moving me; walked off as I go */
  path: Point[] | null;
  /** where I am as far as everyone else knows (moved from outside: the body follows) */
  at: { x: number; y: number; z: number };
}

export interface WalkOut {
  x: number;
  y: number;
  z: number;
  /** the feet off whatever's under them, and rising (tiles / s) */
  up: boolean;
  vz: number;
  yaw: number;
  speed: number;
  gait: Gait;
  /** moved this frame */
  moved: boolean;
  /** the keys or the pad are moving me (a path gives way) */
  manual: boolean;
  /** a jump left the ground this frame (which), a landing (how hard) */
  jumped: JumpKind | null;
  landed: number | null;
  /** a verb started this frame (and the top it goes over), and the one under way (how far in) */
  started: { kind: VerbKind; h: number } | null;
  verb: { kind: VerbKind; t: number } | null;
  crouch: boolean;
  aim: boolean;
  presses: Set<Press>;
  /** Player.mv, Player.yaw */
  mv: number;
  yawByte: number;
}

const SPEC: MoveSpec = MOVE;

/** A click-to-walk path, step by step: towards its next point (one passed counts as reached:
 *  no turning back for it), easing into the last; walked off as it goes. */
function follow(b: Body, path: Point[], move: { x: number; y: number }) {
  while (path.length) {
    const wp = path[0];
    const dx = wp.x - b.x;
    const dy = wp.y - b.y;
    const d = Math.hypot(dx, dy);
    const last = path.length === 1;
    const behind = d < 0.4 && dx * b.vx + dy * b.vy < 0;
    if (d < (last ? 0.04 : 0.15) || (behind && (!last || d < 0.15))) path.shift();
    else break;
  }
  if (!path.length) {
    move.x = 0;
    move.y = 0;
    return;
  }
  const wp = path[0];
  const d = Math.hypot(wp.x - b.x, wp.y - b.y);
  const mag = path.length === 1 ? Math.max(0.2, Math.min(1, d / 0.6)) : 1;
  move.x = ((wp.x - b.x) / d) * mag;
  move.y = ((wp.y - b.y) / d) * mag;
}

export class Walker {
  readonly controls = new MoveControls();
  // the right button: aiming (the world says where it may: WalkCtx.canAim)
  private onDown = (e: PointerEvent) => e.button === 2 && this.controls.down("Mouse2");
  private onUp = (e: PointerEvent) => e.button === 2 && this.controls.up("Mouse2");
  constructor() {
    window.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointerup", this.onUp);
  }
  dispose(): void {
    window.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
  }
  /** s from a jump's press to its take-off */
  readonly takeoff = SPEC.takeoff;
  private body: Body = newBody(0, 0);
  private prev: Body = newBody(0, 0);
  private clock = new MoveClock();
  private last = { x: Number.NaN, y: Number.NaN, z: Number.NaN };
  private wall = 0; // the clock when the last frame was (ms)

  frame(dt: number, c: WalkCtx): WalkOut {
    // (the time that really passed — up to a quarter second — not the frame's capped step:
    // slow frames mustn't walk me in slow motion)
    const now = performance.now();
    if (this.wall > 0) dt = Math.min(0.25, Math.max(0, (now - this.wall) / 1000));
    this.wall = now;
    // put somewhere from outside: the body there (far: a teleport, its speed gone)
    const b0 = this.body;
    // (written so the first frame, from nowhere — NaN — counts as moved too)
    if (
      !(Math.abs(c.at.x - this.last.x) <= 1e-4) ||
      !(Math.abs(c.at.y - this.last.y) <= 1e-4) ||
      !(Math.abs(c.at.z - this.last.z) <= 1e-4)
    ) {
      const far = !(Math.hypot(c.at.x - b0.x, c.at.y - b0.y) < 1.5);
      b0.x = c.at.x;
      b0.y = c.at.y;
      b0.z = c.at.z;
      if (far) {
        b0.vx = 0;
        b0.vy = 0;
        b0.vz = 0;
        b0.up = false;
        b0.verb = null;
        b0.takeoff = -1;
      }
      this.prev = { ...b0 };
    }

    const { move, presses } = this.controls.read(c.camYaw, c.camYaw, c.usePad);
    const manual = Math.hypot(move.x, move.y) > 0.05;
    const path = manual ? null : c.path;
    move.faceLook = c.faceLook;
    move.look = c.camYaw;
    if (!c.canJump) {
      move.jump = false;
      move.jumpPressed = false;
      move.crouch = false;
      move.crouchPressed = false;
      move.dodgePressed = false;
    }
    if (!c.canAim) move.aim = false;

    const env: MoveEnv = { grid: c.grid, footing: c.footing, blocked: c.blocked };
    const events: StepEvents[] = [];
    let first = true;
    const alpha = this.clock.advance(dt, () => {
      this.prev = { ...this.body };
      if (path?.length) follow(this.body, path, move);
      events.push(stepBody(this.body, move, env, SPEC));
      if (first) {
        afterFirstStep(move);
        first = false;
      }
    });
    const b = this.body;
    const p = this.prev;
    const x = p.x + (b.x - p.x) * alpha;
    const y = p.y + (b.y - p.y) * alpha;
    const z = p.z + (b.z - p.z) * alpha;
    const dyaw = Math.atan2(Math.sin(b.yaw - p.yaw), Math.cos(b.yaw - p.yaw));
    const yaw = p.yaw + dyaw * alpha;
    const moved = Math.hypot(x - this.last.x, y - this.last.y) > 1e-4;
    this.last = { x, y, z };
    let jumped: JumpKind | null = null;
    let landed: number | null = null;
    let started: WalkOut["started"] = null;
    for (const e of events) {
      if (e.jumped) jumped = e.jumped;
      if (e.landed !== undefined) landed = Math.max(landed ?? 0, e.landed);
      // (a vault's or a mantle's top: a verb lasts longer than a frame, so it's still the body's)
      if (e.verb) started = { kind: e.verb, h: e.verb === "vault" || e.verb === "mantle" ? (b.verb?.h ?? 0) : 0 };
    }
    return {
      x,
      y,
      z,
      up: b.up,
      vz: b.vz,
      yaw,
      speed: speedOf(b),
      gait: b.gait,
      moved,
      manual,
      jumped,
      landed,
      presses,
      started,
      verb: b.verb ? { kind: b.verb.kind, t: verbProgress(b.verb, SPEC) } : null,
      crouch: move.crouch,
      aim: move.aim,
      mv: packMv(b.gait, move.crouch, move.aim),
      yawByte: yawToByte(b.yaw),
    };
  }

  /** Moved by (dx, dy, dz) from outside on purpose (up or down the stairs into the next
   *  floor's frame): the body goes on as it was. */
  shift(dx: number, dy: number, dz: number): void {
    for (const o of [this.body, this.prev, this.last]) {
      o.x += dx;
      o.y += dy;
      o.z += dz;
    }
  }

  /** Everything let go (the window lost focus); the body stops where it is. */
  clear(): void {
    this.controls.clear();
  }
}
