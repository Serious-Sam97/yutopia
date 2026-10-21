import type { dirFromDelta, Grid, JumpKind, Point } from "@yutopia/shared";
import {
  type Body,
  type Footing,
  type Gait,
  MOVE,
  MoveClock,
  type MoveEnv,
  type MoveSpec,
  MV_WINDED,
  newBody,
  packMv,
  STEP_DT,
  type StepEvents,
  speedOf,
  stepBody,
  type VerbKind,
  verbProgress,
  yawToByte,
} from "@yutopia/shared/move";
import { FULL_VITALS, freshClock, spendRoll, stepVitals } from "@yutopia/shared/vitals";
import type { WorldController } from "../controller";
import { actionOf } from "./bindings";
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

// the 8 facings (shared/iso.ts) as world angles, for my 3D facing
const DIR_ANGLE = [
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
].map(([x, y]) => Math.atan2(y, x));

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

/** What the dark's chunk (world/dark) is handed: it shows the stamina and claims a use press
 *  near something to search or pick up. */
export interface DarkHooks {
  /** a use press (E is its own; this is the pad's X): taken (true) or left to the world */
  use(): boolean;
  /** first aid from the pockets (the pad's d-pad ↓) */
  aid(): void;
  /** the inventory opened or closed (I, the pad's Menu) */
  inventory(): void;
  /** the inventory open: I stand still, and don't aim */
  frozen(): boolean;
  /** the frame's pad presses, before the world has them: taken ones are deleted (Y while aiming
   *  is the next weapon, not the camera) */
  presses(p: Set<Press>, aiming: boolean): void;
  dispose(): void;
}

export class Walker {
  readonly controls = new MoveControls();
  // my stamina, run as the server runs it (shared/vitals.ts) so the sprint stops at once when
  // it's out; the server's word (Player.st) taken when they drift apart
  readonly vitals = { ...FULL_VITALS };
  readonly breath = freshClock();
  /** out on the land (stamina drains), as of the last frame */
  outside = false;
  /** my torch focused: on, aiming, out on the land, battery left (docs/plan/30-the-dark.md D4) */
  focus = false;
  /** aiming (the right button, LT): as of the last frame */
  aiming = false;
  /** down (docs/plan/30-the-dark.md D7): a crawl, no sprint, no jump, no aim */
  down = false;
  private torchOn = false;
  private dark: DarkHooks | null = null;
  private steppedAt = 0;
  private onFoot = false;
  private darkLoading = false;
  // the right button: aiming (the world says where it may: WalkCtx.canAim)
  private onDown = (e: PointerEvent) => e.button === 2 && this.controls.down("Mouse2");
  private onUp = (e: PointerEvent) => e.button === 2 && this.controls.up("Mouse2");
  // the inventory's key (I): wherever I am — the dark's chunk loaded for it if it isn't yet
  private onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (
      e.repeat ||
      e.defaultPrevented ||
      el?.isContentEditable ||
      el?.tagName === "INPUT" ||
      el?.tagName === "TEXTAREA"
    )
      return;
    if (actionOf(this.controls.b, e.code) !== "inventory") return;
    // (only on foot: not riding, driving, at an arcade — the walker steps only then)
    if (!this.onFoot || performance.now() - this.steppedAt > 250) return;
    e.preventDefault();
    this.inventory();
  };
  constructor(readonly ctl?: WorldController) {
    window.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointerup", this.onUp);
    if (ctl) window.addEventListener("keydown", this.onKey);
  }
  dispose(): void {
    window.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("keydown", this.onKey);
    this.dark?.dispose();
    this.dark = null;
  }
  // the dark's chunk (its HUD, the loot, the pockets): the first time out on the land, or asked for
  private loadDark(then?: () => void): void {
    if (this.dark) {
      then?.();
      return;
    }
    if (this.darkLoading || !this.ctl) return;
    this.darkLoading = true;
    const ctl = this.ctl;
    void import("../dark").then((m) => {
      if (ctl.room) {
        this.dark = m.startDark(ctl, this);
        then?.();
      } else this.darkLoading = false;
    });
  }
  /** The inventory opened or closed (I, the pad's Menu). */
  inventory(): void {
    this.loadDark(() => this.dark?.inventory());
  }
  /** My 8-way facing (`me.d`) and drawn angle (returned) after a frame. First person (`view`): I face where I look — turned some other
   *  way (a seat, someone high-fiving me) the view turns there — flipping 8-way only a
   *  little past a boundary (no flutter on it, no message spam). Else, turned some other
   *  way while standing, I face it in 3D too. */
  face(
    me: { d: number },
    view: { yaw: number } | null,
    moved: boolean,
    lookD: number,
    angle: number,
    dir8: typeof dirFromDelta, // (the page's: importing it here splits the page's chunks)
  ): number {
    const dirFromDelta = dir8;
    if (view) {
      if (me.d !== lookD && lookD >= 0) view.yaw = DIR_ANGLE[me.d] ?? view.yaw;
      const d8 = dirFromDelta(Math.cos(view.yaw), Math.sin(view.yaw), me.d as 0);
      if (d8 !== me.d) {
        let off = view.yaw - (DIR_ANGLE[me.d] ?? view.yaw);
        off = Math.atan2(Math.sin(off), Math.cos(off));
        if (Math.abs(off) > Math.PI / 8 + 0.1 || lookD < 0) me.d = d8;
      }
      return view.yaw;
    }
    if (!moved && dirFromDelta(Math.cos(angle), Math.sin(angle), me.d as 0) !== me.d) return DIR_ANGLE[me.d] ?? angle;
    return angle;
  }

  /** where my body is (the floor's coords, feet height) */
  where(): { x: number; y: number; z: number } {
    return { x: this.last.x, y: this.last.y, z: this.last.z };
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

    this.steppedAt = performance.now();
    this.onFoot = c.usePad;
    const crouched = this.controls.crouched;
    const { move, presses } = this.controls.read(c.camYaw, c.camYaw, c.usePad);
    // the inventory open: standing still, no aim (the world doesn't stop), its own pad
    const frozen = !!this.dark?.frozen();
    if (frozen) {
      move.x = 0;
      move.y = 0;
      move.sprint = false;
      move.aim = false;
      move.jump = false;
      move.jumpPressed = false;
      move.dodgePressed = false;
      move.crouchPressed = false;
      // (the pad's B closes it: not a crouch)
      this.controls.crouched = crouched;
      move.crouch = crouched;
      for (const p of [...presses]) if (p !== "inventory") presses.delete(p);
    }
    const manual = Math.hypot(move.x, move.y) > 0.05;
    const path = manual || frozen ? null : c.path;
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
    // out of breath (docs/plan/30-the-dark.md D2): no sprint, no roll
    this.syncBreath();
    move.tired = this.breath.winded;
    if (this.breath.winded) move.dodgePressed = false;
    // down: a crawl (crouched, slow: the crouch's 1.6 at this tilt is 0.6 tiles / s)
    if (this.down) {
      const m = Math.hypot(move.x, move.y);
      if (m > 1e-3) {
        move.x = (move.x / m) * 0.225;
        move.y = (move.y / m) * 0.225;
      }
      move.crouch = true;
      move.sprint = false;
      move.aim = false;
      move.jump = false;
      move.jumpPressed = false;
      move.dodgePressed = false;
      move.crouchPressed = false;
    }
    // (run out, none until it's back to 25%: shared vitals.ts `drained`)
    this.focus = move.aim && this.outside && this.torchOn && this.vitals.bat > 0 && !this.breath.drained;

    const env: MoveEnv = { grid: c.grid, footing: c.footing, blocked: c.blocked };
    const events: StepEvents[] = [];
    let first = true;
    const alpha = this.clock.advance(dt, () => {
      this.prev = { ...this.body };
      if (path?.length) follow(this.body, path, move);
      const ev = stepBody(this.body, move, env, SPEC);
      events.push(ev);
      const out = c.grid.onLand(this.body.x, this.body.y);
      if (ev.verb === "roll") spendRoll(this.vitals, this.breath, out);
      stepVitals(
        this.vitals,
        this.breath,
        { sprinting: this.body.gait === "sprint", outside: out, night: 0, storm: 0, warm: true, focus: this.focus },
        STEP_DT,
      );
      if (this.breath.winded) {
        move.tired = true;
        move.dodgePressed = false;
      }
      if (first) {
        afterFirstStep(move);
        first = false;
      }
    });
    const b = this.body;
    // first time out on the land: the dark's chunk (its HUD, the loot, the pockets)
    this.outside = c.grid.onLand(b.x, b.y);
    if (this.outside) this.loadDark();
    if (presses.has("inventory")) this.inventory();
    if (presses.has("use") && this.dark?.use()) presses.delete("use");
    if (presses.has("aid")) this.dark?.aid();
    this.aiming = move.aim;
    this.dark?.presses(presses, move.aim);
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
      mv: packMv(b.gait, move.crouch, move.aim) | (this.breath.winded ? MV_WINDED : 0),
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

  // the server's stamina (a byte) against mine: more than 10 apart, or out where I'm not, take its
  private syncBreath(): void {
    const room = this.ctl?.room;
    const me = room?.state.players.get(room.sessionId);
    this.torchOn = !!me?.torch;
    this.down = (me?.downAt ?? 0) > 0;
    const st = me?.st;
    if (typeof st !== "number") return;
    this.vitals.wm = me?.wm ?? 100; // (frozen: stamina comes back at half speed)
    if (Math.abs(st - this.vitals.st) > 10 || (st === 0 && !this.breath.winded && this.vitals.st > 0)) {
      this.vitals.st = st;
      if (st === 0) this.breath.winded = true;
    }
  }

  /** Everything let go (the window lost focus); the body stops where it is. */
  clear(): void {
    this.controls.clear();
  }
}
