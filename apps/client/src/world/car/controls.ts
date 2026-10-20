import type { Controls } from "@yutopia/shared/car";

// The car's controls (docs/plan/28-the-car.md, Controls): the keyboard and a
// gamepad read into the sim's Controls, plus the switches pressed this frame.
//
//              keys            pad
//   throttle   W ↑             RT
//   brake      S ↓             LT          (held at a stop: reverse)
//   steer      A D ← →         left stick
//   handbrake  Space           A / ✕
//   gears      E / Q           RB / LB     (the manual box)
//   horn       H               left stick press
//   lights     L               d-pad ↑     (off · low · high)
//   indicators , .  hazards /  d-pad ← → ↓
//   wipers     V               B / ○
//   radio      R               —
//   camera     C  look back B  Y / △  right stick press
//   get out    X               X / □

export type Switch =
  | "lights"
  | "left"
  | "right"
  | "hazard"
  | "wipers"
  | "radio"
  | "camera"
  | "exit"
  | "up"
  | "down"
  | "diff"
  | "range";

const KEY_SWITCH: Record<string, Switch> = {
  KeyL: "lights",
  Comma: "left",
  Period: "right",
  Slash: "hazard",
  KeyV: "wipers",
  KeyR: "radio",
  KeyC: "camera",
  KeyX: "exit",
  KeyE: "up",
  KeyQ: "down",
  KeyK: "diff",
  KeyJ: "range",
};
const PAD_SWITCH: [number, Switch][] = [
  [12, "lights"],
  [14, "left"],
  [15, "right"],
  [13, "hazard"],
  [1, "wipers"],
  [3, "camera"],
  [2, "exit"],
  [5, "up"],
  [4, "down"],
];

export class CarInput {
  private keys = new Set<string>();
  private pressed: Switch[] = [];
  private padPrev: boolean[] = [];
  /** the last thing used: the keys (smoothed in the sim) or a pad (analog) */
  pad = false;
  horn = false;
  lookBack = false;

  keyDown(code: string): boolean {
    const known = code in KEY_SWITCH || DRIVE_KEYS.has(code) || code === "KeyH" || code === "KeyB";
    if (!known) return false;
    if (!this.keys.has(code) && KEY_SWITCH[code]) this.pressed.push(KEY_SWITCH[code]);
    this.keys.add(code);
    this.pad = false;
    return true;
  }
  keyUp(code: string) {
    this.keys.delete(code);
  }
  clear() {
    this.keys.clear();
    this.pressed = [];
  }

  /** This frame's controls and the switches pressed since the last read. */
  read(pad: Gamepad | null): { c: Controls; switches: Switch[] } {
    const k = this.keys;
    const on = (...c: string[]) => c.some((x) => k.has(x));
    let up = on("KeyW", "ArrowUp") ? 1 : 0;
    let down = on("KeyS", "ArrowDown") ? 1 : 0;
    let steer = (on("KeyD", "ArrowRight") ? 1 : 0) - (on("KeyA", "ArrowLeft") ? 1 : 0);
    let hand = on("Space") ? 1 : 0;
    this.horn = on("KeyH");
    this.lookBack = on("KeyB");
    let digital = true;
    const switches = this.pressed;
    this.pressed = [];
    if (pad) {
      const b = (i: number) => pad.buttons[i]?.value ?? 0;
      const x = pad.axes[0] ?? 0;
      const sx = Math.abs(x) < 0.08 ? 0 : (x - Math.sign(x) * 0.08) / 0.92;
      const used = b(7) > 0.05 || b(6) > 0.05 || Math.abs(sx) > 0 || b(0) > 0.5;
      if (used) this.pad = true;
      if (this.pad) {
        up = Math.max(up, b(7));
        down = Math.max(down, b(6));
        // (a little expo: fine near the middle)
        if (sx !== 0) steer = Math.sign(sx) * Math.abs(sx) ** 1.5;
        hand = Math.max(hand, b(0) > 0.5 ? 1 : 0);
        digital = false;
      }
      this.horn ||= b(10) > 0.5;
      this.lookBack ||= b(11) > 0.5;
      for (const [i, sw] of PAD_SWITCH) {
        const now = b(i) > 0.5;
        if (now && !this.padPrev[i]) switches.push(sw);
        this.padPrev[i] = now;
      }
    }
    return {
      c: {
        up,
        down,
        steer,
        hand,
        digital,
        shiftUp: switches.includes("up"),
        shiftDown: switches.includes("down"),
      },
      switches,
    };
  }

  /** A gamepad's rumble: the surface, a knock, the limiter. */
  rumble(pad: Gamepad | null, strong: number, weak: number, ms = 60) {
    const act = (
      pad as (Gamepad & { vibrationActuator?: { playEffect(t: string, p: object): Promise<unknown> } }) | null
    )?.vibrationActuator;
    if (!act || !this.pad || (strong < 0.02 && weak < 0.02)) return;
    void act
      .playEffect("dual-rumble", {
        duration: ms,
        strongMagnitude: Math.min(1, strong),
        weakMagnitude: Math.min(1, weak),
      })
      .catch(() => {});
  }
}
const DRIVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);
