import type { KartInput } from "@yutopia/shared/kart";

// The kart's controls (docs/plan/46-the-karts.md, K-M6): the keyboard and a gamepad read into the
// sim's KartInput, plus the buttons pressed this frame.
//
//              keys            pad
//   go         W ↑             RT
//   brake/back S ↓             LT
//   steer      A D ← →         left stick
//   hop/drift  Space  (or K)   RB / B ○
//   item       Shift  (or E)   A / ✕
//   look back  C               Y / △
//   restart    R               Start       (the sandbox: back to the grid, the lights)
//   reset      T               Back        (the sandbox: back on the road where you are)

export type KartButton = "item" | "restart" | "reset" | "ghost" | "panel" | "spin";

const KEY_BUTTON: Record<string, KartButton> = {
  ShiftLeft: "item",
  ShiftRight: "item",
  KeyE: "item",
  KeyR: "restart",
  KeyT: "reset",
  KeyG: "ghost",
  Tab: "panel",
  KeyX: "spin",
};
const PAD_BUTTON: [number, KartButton][] = [
  [0, "item"],
  [9, "restart"],
  [8, "reset"],
];
const DRIVE = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyK",
  "KeyC",
]);

export class KartControls {
  private keys = new Set<string>();
  private pressed: KartButton[] = [];
  private padPrev: boolean[] = [];
  /** the last thing used: the keys or a pad */
  pad = false;
  lookBack = false;
  /** a phone's buttons on the screen (kart/karts.ts touchPad): what's held now */
  touch = { on: false, throttle: 0, brake: 0, steer: 0, hop: false };
  /** a button on the screen pressed */
  press(b: KartButton) {
    this.pressed.push(b);
  }

  keyDown(code: string): boolean {
    const known = code in KEY_BUTTON || DRIVE.has(code);
    if (!known) return false;
    if (!this.keys.has(code) && KEY_BUTTON[code]) this.pressed.push(KEY_BUTTON[code]);
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
    Object.assign(this.touch, { throttle: 0, brake: 0, steer: 0, hop: false });
  }

  /** This frame's controls and the buttons pressed since the last read. */
  read(pad: Gamepad | null): { i: KartInput; buttons: KartButton[] } {
    const on = (...c: string[]) => c.some((x) => this.keys.has(x));
    let throttle = on("KeyW", "ArrowUp") ? 1 : 0;
    let brake = on("KeyS", "ArrowDown") ? 1 : 0;
    let steer = (on("KeyD", "ArrowRight") ? 1 : 0) - (on("KeyA", "ArrowLeft") ? 1 : 0);
    let hop = on("Space", "KeyK");
    this.lookBack = on("KeyC");
    let digital = true;
    const buttons = this.pressed;
    this.pressed = [];
    const tc = this.touch;
    if (tc.on) {
      throttle = Math.max(throttle, tc.throttle);
      brake = Math.max(brake, tc.brake);
      if (tc.steer !== 0) steer = tc.steer;
      hop ||= tc.hop;
    }
    if (pad) {
      const b = (i: number) => pad.buttons[i]?.value ?? 0;
      const x = pad.axes[0] ?? 0;
      const sx = Math.abs(x) < 0.1 ? 0 : (x - Math.sign(x) * 0.1) / 0.9;
      if (b(7) > 0.05 || b(6) > 0.05 || sx !== 0 || b(5) > 0.5 || b(1) > 0.5) this.pad = true;
      if (this.pad) {
        throttle = Math.max(throttle, b(7));
        brake = Math.max(brake, b(6));
        if (sx !== 0) steer = Math.sign(sx) * Math.abs(sx) ** 1.4;
        hop ||= b(5) > 0.5 || b(1) > 0.5;
        digital = false;
      }
      this.lookBack ||= b(3) > 0.5;
      for (const [i, bt] of PAD_BUTTON) {
        const now = b(i) > 0.5;
        if (now && !this.padPrev[i]) buttons.push(bt);
        this.padPrev[i] = now;
      }
    }
    return { i: { throttle, brake, steer, hop, digital }, buttons };
  }

  /** A gamepad's rumble. */
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
