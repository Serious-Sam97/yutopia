import type { dirFromDelta, Grid, JumpKind, Point } from "@yutopia/shared";
import {
  type Body,
  type Footing,
  type Gait,
  MOVE,
  MoveClock,
  type MoveEnv,
  type MoveInput,
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
import { FAST_X, FLY_ACROSS, FLY_RISE, FLY_SPRINT, FLY_TOP, P_CLIP, P_FAST, P_FLY } from "./powers";

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
const AIM_BLADE = 0.45; // (shared beam.ts AIM_BLADE: a copy — this chunk doesn't carry beam.ts)

// an admin's powers (docs/plan/48-the-admin.md): fast, through walls, flying — the server holds
// them and takes the moves they allow; here they're only how I move
const FAST_SPEC: MoveSpec = {
  ...MOVE,
  walk: MOVE.walk * FAST_X,
  jog: MOVE.jog * FAST_X,
  sprint: MOVE.sprint * FAST_X,
  crouch: MOVE.crouch * FAST_X,
  aim: MOVE.aim * FAST_X,
};
/** The grid with nothing in the way (through walls): only the ground's height is kept. */
function noWalls(grid: Grid): Grid {
  const g = Object.create(grid) as Grid;
  g.fitsAt = () => true;
  g.clear = () => true;
  return g;
}
/** A flier's step: across at a jog's pace (×3 sprinting), up while the jump's held, down while
 *  sinking; never below the ground, nor through what's in the way (unless the grid lets it). */
function stepFly(b: Body, inp: MoveInput, env: MoveEnv, dt: number, sinking: boolean, fast: boolean): StepEvents {
  const k = fast ? FAST_X : 1;
  const speed = FLY_ACROSS * (inp.sprint ? FLY_SPRINT : 1) * k;
  const mag = Math.min(1, Math.hypot(inp.x, inp.y));
  const tx = mag > 1e-3 ? (inp.x / Math.hypot(inp.x, inp.y)) * mag * speed : 0;
  const ty = mag > 1e-3 ? (inp.y / Math.hypot(inp.x, inp.y)) * mag * speed : 0;
  const ease = Math.min(1, dt * 8);
  b.vx += (tx - b.vx) * ease;
  b.vy += (ty - b.vy) * ease;
  b.vz = ((inp.jump ? 1 : 0) - (sinking ? 1 : 0)) * FLY_RISE * k;
  b.t += dt;
  b.verb = null;
  b.takeoff = -1;
  b.rising = false;
  // (on Jolt: its character, no gravity — over the fence, the ceiling in the way)
  if (env.mover) {
    if (b.z + b.vz * dt > FLY_TOP) b.vz = Math.max(0, (FLY_TOP - b.z) / dt);
    env.mover.step(b, dt, 0, env.blocked, true);
    if (mag > 0.05) b.yaw = inp.faceLook ? inp.look : Math.atan2(b.vy, b.vx);
    b.gait = mag < 0.05 ? "still" : inp.sprint ? "sprint" : "jog";
    return {};
  }
  const g = env.grid;
  const nz = Math.min(FLY_TOP, b.z + b.vz * dt);
  const fits = (x: number, y: number, z: number) => g.fitsAt(x, y, z) && g.clear(b, { x, y }, undefined, z);
  let nx = b.x + b.vx * dt;
  let ny = b.y + b.vy * dt;
  // (into something: along it, one way or the other)
  if (!fits(nx, ny, nz)) {
    if (fits(nx, b.y, nz)) ny = b.y;
    else if (fits(b.x, ny, nz)) nx = b.x;
    else {
      nx = b.x;
      ny = b.y;
    }
  }
  const ground = g.groundAt(nx, ny, nz);
  b.x = nx;
  b.y = ny;
  b.z = Math.max(ground, nz);
  b.up = b.z > ground + 0.05;
  if (mag > 0.05) b.yaw = inp.faceLook ? inp.look : Math.atan2(b.vy, b.vx);
  b.gait = mag < 0.05 ? "still" : inp.sprint ? "sprint" : "jog";
  return {};
}

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
  /** the room it listens to: a rejoin (a world restart, the network) is another, and it's made again */
  readonly room: unknown;
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
  /** knocked down (a pool ball): no moving, no aim, no jump till up */
  fell = false;
  private torchOn = false;
  /** an admin's powers on me (Player.powers), flying now (the power on, not switched off by a
   *  double-tap of the jump), sinking (C or Ctrl held), held still by an admin */
  powers = 0;
  flying = false;
  private sinking = false;
  private spaceAt = 0;
  heldStill = false;
  /** a gun in my hand, in 3D (world/dark/arms.ts says): aiming indoors too */
  armed = false;
  private dark: DarkHooks | null = null;
  private steppedAt = 0;
  private onFoot = false;
  private darkLoading = false;
  private darkIdle = 0; // when the dark's chunk comes anyway, indoors too (performance.now; 0: not yet set)
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
    if (!this.stepping) return;
    e.preventDefault();
    this.inventory();
  };
  // flying (an admin's power): a double-tap of Space lands or takes off; C or Ctrl held sinks
  private onFlyKey = (e: KeyboardEvent) => {
    if (!(this.powers & P_FLY)) return;
    const el = e.target as HTMLElement | null;
    if (el?.isContentEditable || el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") return;
    const down = e.type === "keydown";
    if (e.code === "KeyC" || e.code === "ControlLeft" || e.code === "ControlRight") this.sinking = down && this.flying;
    if (e.code === "Space" && down && !e.repeat) {
      const now = performance.now();
      if (now - this.spaceAt < 300) {
        this.flying = !this.flying;
        this.spaceAt = 0;
      } else this.spaceAt = now;
    }
  };
  constructor(readonly ctl?: WorldController) {
    window.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointerup", this.onUp);
    if (ctl) {
      window.addEventListener("keydown", this.onKey);
      window.addEventListener("keydown", this.onFlyKey);
      window.addEventListener("keyup", this.onFlyKey);
    }
  }
  dispose(): void {
    window.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keydown", this.onFlyKey);
    window.removeEventListener("keyup", this.onFlyKey);
    this.dark?.dispose();
    this.dark = null;
  }
  // the dark's chunk (its HUD, the loot, the pockets, the guns): the first time out on the land, or
  // asked for, or a few seconds in, when the page is idle (the office is armed too)
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
  /** On foot just now (the walker stepped this frame or so: not riding, driving, at an arcade). */
  get stepping(): boolean {
    return this.onFoot && performance.now() - this.steppedAt < 250;
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
    view: { yaw: number; lookYaw?: number } | null,
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
      // (aiming: as the body stands — turned onto the crosshair, bladed: shared beam.ts AIM_BLADE)
      return this.aiming ? (view.lookYaw ?? view.yaw) + AIM_BLADE : view.yaw;
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
    // (knocked down by a pool ball: where they fell till they're up — shared/pool-throw.ts KNOCK)
    // (held still by an admin, too: docs/plan/48-the-admin.md)
    const frozen = !!this.dark?.frozen() || this.fell || this.heldStill;
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
    if (!c.canJump) {
      move.jump = false;
      move.jumpPressed = false;
      move.crouch = false;
      move.crouchPressed = false;
      move.dodgePressed = false;
    }
    if (!c.canAim && !this.armed) move.aim = false;
    // (aiming, the body stands bladed, turned right of the look: shared beam.ts AIM_BLADE)
    move.look = c.camYaw + (move.aim ? AIM_BLADE : 0);
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
    this.focus = move.aim && this.torchOn && this.vitals.bat > 0 && !this.breath.drained;

    // (an admin's powers: through walls, fast, flying)
    const clip = (this.powers & P_CLIP) !== 0;
    const fast = (this.powers & P_FAST) !== 0;
    // my body on Jolt's world in 3D (docs/plan/50-the-volume.md C: its character moves me, through
    // my own locked doors), the grid's way in iso and until Jolt's in
    const room = this.ctl?.room;
    const uid = room?.state.players.get(room.sessionId)?.uid ?? null;
    const phys = this.ctl?.tp?.physicsBody(uid, this.ctl.level, clip, c.grid, this.flying) ?? null;
    // (a private space I may not go into: its edge stops me like a wall — nobody's put back)
    const shut = clip ? null : this.shutBy(uid);
    const blocked = clip ? undefined : shut ? (x: number, y: number) => !!c.blocked?.(x, y) || shut(x, y) : c.blocked;
    const env: MoveEnv = phys
      ? { grid: phys.collider, mover: phys.mover, footing: c.footing, blocked }
      : { grid: clip ? noWalls(c.grid) : c.grid, footing: c.footing, blocked };
    const flying = this.flying;
    if (flying) {
      move.crouch = false;
      move.crouchPressed = false;
      move.dodgePressed = false;
    }
    const events: StepEvents[] = [];
    let first = true;
    const alpha = this.clock.advance(dt, () => {
      this.prev = { ...this.body };
      if (path?.length) follow(this.body, path, move);
      const ev = flying
        ? stepFly(this.body, move, env, STEP_DT, this.sinking, fast)
        : stepBody(this.body, move, env, fast ? FAST_SPEC : SPEC);
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
    // first time out on the land: the dark's chunk (its HUD, the loot, the pockets); indoors, a
    // few seconds in, when the page has a moment
    this.outside = c.grid.onLand(b.x, b.y);
    // (rejoined — the world restarted, the line dropped — it's another room: the dark's chunk
    // listening to the old one would keep the pockets as they were, a gun that never empties)
    if (this.dark && this.ctl && this.dark.room !== this.ctl.room) {
      this.dark.dispose();
      this.dark = null;
      this.darkLoading = false;
      this.loadDark();
    }
    if (!this.darkIdle) this.darkIdle = now + 3000;
    if (this.outside) this.loadDark();
    else if (!this.dark && now >= this.darkIdle) {
      this.darkIdle = Number.POSITIVE_INFINITY;
      const go = () => this.loadDark();
      if (typeof requestIdleCallback === "function") requestIdleCallback(go, { timeout: 5000 });
      else go();
    }
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
  // A booth someone's talking in, or a room its owner locked, that I'm not let into (the server's
  // own rule: world-server WorldRoom.mayEnter): stepping into it, I'm stopped at its edge and knock
  // (once in 4 s). Null when there's none of either on my floor.
  private knockedAt = 0;
  private shutBy(uid: number | null): ((x: number, y: number) => boolean) | null {
    const room = this.ctl?.room;
    const map = this.ctl?.map;
    const st = room?.state;
    if (!room || !st || !map || uid === null) return null;
    const closed = map.areas.some((a) => a.kind === "booth" || st.locks.has(a.key));
    if (!closed) return null;
    const here = st.players.get(room.sessionId)?.area ?? "";
    return (x, y) => {
      // (the floor's own room there: the one on top)
      let a: (typeof map.areas)[number] | null = null;
      for (const q of map.areas)
        if (x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h && (!a || (q.priority ?? 0) > (a.priority ?? 0)))
          a = q;
      if (!a || a.key === here) return false;
      const locked = st.locks.has(a.key);
      if (a.kind !== "booth" && !locked) return false;
      if (a.kind === "booth" && a.ownerId === uid && !locked) return false;
      const key = a.key;
      let taken = false;
      st.players.forEach((q: { uid: number; area: string; bot: boolean }) => {
        if (q.uid !== uid && q.area === key && !q.bot) taken = true;
      });
      if (!taken || st.boothGuests.has(`${key}:${uid}`)) return false;
      const now = performance.now();
      if (now - this.knockedAt > 4000) {
        this.knockedAt = now;
        room.send("knock", { area: key });
      }
      return true;
    };
  }

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
    // (an admin's powers, and an admin holding me still)
    const pw = me?.admin ? (me?.powers ?? 0) : 0;
    if (pw & P_FLY && !(this.powers & P_FLY)) this.flying = true;
    if (!(pw & P_FLY)) {
      this.flying = false;
      this.sinking = false;
    }
    this.powers = pw;
    this.heldStill = (me?.frozenUntil ?? 0) > Date.now();
    this.down = (me?.downAt ?? 0) > 0;
    this.fell = (me?.fellAt ?? 0) > 0;
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
