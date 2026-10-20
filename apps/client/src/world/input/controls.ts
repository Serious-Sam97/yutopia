import { type MoveInput, NO_INPUT } from "@yutopia/shared/move";
import { type Action, actionOf, type Bindings, loadBindings } from "./bindings";
import { PadState } from "./pad";

// The body's controls (docs/plan/29-the-move.md, A-I): the keyboard, the
// mouse's buttons and a pad read into the movement core's input once a frame —
// the way to go turned from the camera's to the floor's, a stick's tilt kept
// as its speed, crouch as a toggle (a sprint's crouch is a slide), and what
// was pressed this frame.

/** Pressed this frame (besides the body's own: jump, dodge, crouch). */
export type Press = "use" | "torch" | "shoulder" | "camera" | "look";
const PRESSES: Press[] = ["use", "torch", "shoulder", "camera", "look"];
// the actions the world takes from the keys here (the rest are still its own keys)
const WORLD: Action[] = ["up", "down", "left", "right", "walk", "sprint", "jump", "crouch", "dodge", "aim"];

export class MoveControls {
  b: Bindings = loadBindings();
  readonly pad = new PadState();
  private held = new Set<Action>();
  private codes = new Set<string>();
  private hits = new Set<Action>();
  // down since the last read (held for it even if it's already up again: a tap between two slow
  // frames still moves you)
  private since = new Set<Action>();
  /** crouching (the toggle's state) */
  crouched = false;
  private padSprint = false;

  /** A key (`code`) or a mouse button (`Mouse0`, `Mouse2`) went down: true if it's ours. */
  down(code: string): boolean {
    const a = actionOf(this.b, code);
    if (!a) return false;
    if (!this.codes.has(code)) {
      this.codes.add(code);
      if (!this.held.has(a)) this.hits.add(a);
      this.held.add(a);
      this.since.add(a);
    }
    this.pad.live = false;
    return true;
  }
  /** A key down in the world: only the moves taken over so far (the rest are still the
   *  world's own keys): true if it's one of them. */
  world(code: string): boolean {
    const a = actionOf(this.b, code);
    return !!a && WORLD.includes(a) && this.down(code);
  }
  up(code: string): void {
    this.codes.delete(code);
    const a = actionOf(this.b, code);
    if (a && ![...this.codes].some((c) => actionOf(this.b, c) === a)) this.held.delete(a);
  }
  /** Everything let go (the window lost focus). */
  clear(): void {
    this.codes.clear();
    this.held.clear();
    this.hits.clear();
    this.since.clear();
  }

  /** This frame's input. `camYaw`: where the camera faces on the floor (atan2 in floor
   *  coords: up on the stick or W goes that way); `look`: where it looks (aiming faces it);
   *  `usePad` false: the pad's someone else's for now (a console being played). */
  read(camYaw: number, look = camYaw, usePad = true): { move: MoveInput; presses: Set<Press> } {
    const p = this.pad;
    p.poll();
    if (!usePad) p.mute();
    const padOn = (a: Action) => {
      const i = this.b.pad[a];
      return i !== undefined && p.held(i);
    };
    const padHit = (a: Action) => {
      const i = this.b.pad[a];
      return i !== undefined && p.pressed(i);
    };
    const on = (a: Action) => this.held.has(a) || this.since.has(a) || padOn(a);
    const hit = (a: Action) => this.hits.has(a) || padHit(a);

    // the way: the keys (a diagonal is as fast as straight on), else the left stick's tilt
    let fwd = (on("up") ? 1 : 0) - (on("down") ? 1 : 0);
    let side = (on("right") ? 1 : 0) - (on("left") ? 1 : 0);
    let mag = Math.hypot(fwd, side) > 0 ? 1 : 0;
    if (mag === 0 && p.left.mag > 0) {
      fwd = -p.left.y;
      side = p.left.x;
      mag = p.left.mag;
    }
    const n = Math.hypot(fwd, side) || 1;
    const fx = Math.cos(camYaw);
    const fy = Math.sin(camYaw);
    const x = ((fx * fwd - fy * side) / n) * mag;
    const y = ((fy * fwd + fx * side) / n) * mag;

    // sprint: held on the keys; on a pad L3 starts it and it lasts until you stop
    if (padHit("sprint")) this.padSprint = true;
    if (p.left.mag < 0.3) this.padSprint = false;
    const sprint = this.held.has("sprint") || this.padSprint;
    // crouch: a toggle (or held, in the settings); sprinting stands you up
    let crouchPressed = false;
    if (this.b.crouchHold) {
      const c = on("crouch");
      crouchPressed = c && !this.crouched;
      this.crouched = c;
    } else if (hit("crouch")) {
      this.crouched = !this.crouched;
      crouchPressed = this.crouched;
    }
    if (hit("sprint") && this.crouched) this.crouched = false;
    const aim = this.held.has("aim") || p.lt > 0.4;

    const move: MoveInput = {
      ...NO_INPUT,
      x,
      y,
      sprint,
      walk: on("walk"),
      crouch: this.crouched,
      crouchPressed,
      aim,
      jump: on("jump"),
      jumpPressed: hit("jump"),
      dodgePressed: hit("dodge"),
      look,
    };
    const presses = new Set<Press>();
    for (const a of PRESSES) if (hit(a)) presses.add(a);
    this.hits.clear();
    this.since.clear();
    return { move, presses };
  }
}

/** The presses go to the first fixed step of a frame only. */
export function afterFirstStep(m: MoveInput): void {
  m.jumpPressed = false;
  m.dodgePressed = false;
  m.crouchPressed = false;
}
