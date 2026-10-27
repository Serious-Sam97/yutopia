import { activePad } from "../pads";

// A gamepad, read once a frame (docs/plan/29-the-move.md, A-I): the sticks
// through a round deadzone rescaled (so a light tilt is a walk, not nothing,
// and a full one is exactly 1), the triggers analog, and each button's press
// and release this frame.

const DEAD = 0.15;

export interface Stick {
  x: number;
  y: number;
  /** 0..1 */
  mag: number;
}

/** A stick past its round deadzone, rescaled to 0..1 beyond it. */
export function stick(x: number, y: number, dead = DEAD): Stick {
  const m = Math.hypot(x, y);
  if (m <= dead) return { x: 0, y: 0, mag: 0 };
  const mag = Math.min(1, (m - dead) / (1 - dead));
  return { x: (x / m) * mag, y: (y / m) * mag, mag };
}

export class PadState {
  left: Stick = { x: 0, y: 0, mag: 0 };
  right: Stick = { x: 0, y: 0, mag: 0 };
  lt = 0;
  rt = 0;
  private down: boolean[] = [];
  private was: boolean[] = [];
  /** a pad moved since the keys were last used */
  live = false;
  private pad: Gamepad | null = null;

  poll(): void {
    const p = activePad();
    this.pad = p;
    this.was = this.down;
    if (!p) {
      this.down = [];
      this.left = this.right = { x: 0, y: 0, mag: 0 };
      this.lt = this.rt = 0;
      return;
    }
    this.left = stick(p.axes[0] ?? 0, p.axes[1] ?? 0);
    this.right = stick(p.axes[2] ?? 0, p.axes[3] ?? 0, 0.12);
    this.lt = p.buttons[6]?.value ?? 0;
    this.rt = p.buttons[7]?.value ?? 0;
    this.down = p.buttons.map((b, i) => (i === 6 || i === 7 ? b.value > 0.4 : b.pressed));
    if (this.left.mag > 0 || this.right.mag > 0 || this.down.some(Boolean)) this.live = true;
  }
  /** The left stick's tilt now, read without polling (a seat's wanting to know if I walk off). */
  leftNow(): number {
    const p = activePad();
    return p ? stick(p.axes[0] ?? 0, p.axes[1] ?? 0).mag : 0;
  }
  /** Read as if nothing were pressed or moved (the pad's busy elsewhere this frame). */
  mute(): void {
    this.down = [];
    this.was = [];
    this.left = this.right = { x: 0, y: 0, mag: 0 };
    this.lt = this.rt = 0;
  }
  held(i: number): boolean {
    return !!this.down[i];
  }
  pressed(i: number): boolean {
    return !!this.down[i] && !this.was[i];
  }
  released(i: number): boolean {
    return !this.down[i] && !!this.was[i];
  }
  /** a thump in the hands (`strong` 0..1 the big motor, `weak` the small one) */
  rumble(strong: number, weak: number, ms: number): void {
    const a = (
      this.pad as
        | (Gamepad & {
            vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> };
          })
        | null
    )?.vibrationActuator;
    void a
      ?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: weak })
      ?.catch(() => {});
  }
}
