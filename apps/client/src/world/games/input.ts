import { type GameSystem, PAD_BUTTONS, type PadButton } from "@yutopia/shared/games";

// Your pad, from the keyboard or a gamepad: which of the console's buttons are
// down, as a bitmask (PAD_BUTTONS order) — the same form whether it drives the
// emulator here or goes to whoever runs the game.

// Keys → buttons, per console (the panel shows the same table).
const DPAD: Record<string, PadButton> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
export const KEYMAP: Record<GameSystem, Record<string, PadButton>> = {
  "2600": { ...DPAD, KeyX: "b", KeyZ: "b", Space: "b", Enter: "start", ShiftLeft: "select", ShiftRight: "select" },
  nes: { ...DPAD, KeyX: "a", KeyZ: "b", Enter: "start", ShiftLeft: "select", ShiftRight: "select" },
  snes: {
    ...DPAD,
    KeyX: "a",
    KeyZ: "b",
    KeyS: "x",
    KeyA: "y",
    KeyQ: "l",
    KeyW: "r",
    Enter: "start",
    ShiftLeft: "select",
    ShiftRight: "select",
  },
  // A B C on the pad (the core's y b a)
  md: { ...DPAD, KeyZ: "y", KeyX: "b", KeyC: "a", Enter: "start" },
  gb: { ...DPAD, KeyX: "a", KeyZ: "b", Enter: "start", ShiftLeft: "select", ShiftRight: "select" },
};

// What the panel prints for each console (key → the console's own names).
export const KEY_HINTS: Record<GameSystem, [string, string][]> = {
  "2600": [
    ["←↑↓→", "joystick"],
    ["Space / X", "fire"],
    ["Enter", "reset"],
    ["Shift", "select"],
  ],
  nes: [
    ["←↑↓→", "pad"],
    ["X", "A"],
    ["Z", "B"],
    ["Enter", "Start"],
    ["Shift", "Select"],
  ],
  snes: [
    ["←↑↓→", "pad"],
    ["X Z S A", "A B X Y"],
    ["Q W", "L R"],
    ["Enter", "Start"],
    ["Shift", "Select"],
  ],
  md: [
    ["←↑↓→", "pad"],
    ["Z X C", "A B C"],
    ["Enter", "Start"],
  ],
  gb: [
    ["←↑↓→", "pad"],
    ["X", "A"],
    ["Z", "B"],
    ["Enter", "Start"],
    ["Shift", "Select"],
  ],
};

export const bit = (b: PadButton) => 1 << PAD_BUTTONS.indexOf(b);

// A standard-mapping gamepad: buttons by where they are (bottom, right, left,
// top), shoulders, back/start, the d-pad or the left stick.
export function gamepadBits(system: GameSystem): number {
  const gp = navigator.getGamepads?.().find((g) => g?.connected && g.mapping === "standard") ?? null;
  if (!gp) return 0;
  const on = (i: number) => !!gp.buttons[i]?.pressed;
  const ax = gp.axes[0] ?? 0;
  const ay = gp.axes[1] ?? 0;
  let bits = 0;
  if (on(12) || ay < -0.5) bits |= bit("up");
  if (on(13) || ay > 0.5) bits |= bit("down");
  if (on(14) || ax < -0.5) bits |= bit("left");
  if (on(15) || ax > 0.5) bits |= bit("right");
  if (system === "2600") {
    if (on(0) || on(1)) bits |= bit("b");
  } else if (system === "md") {
    if (on(2)) bits |= bit("y"); // A
    if (on(0)) bits |= bit("b"); // B
    if (on(1)) bits |= bit("a"); // C
  } else {
    if (on(0)) bits |= bit("b");
    if (on(1)) bits |= bit("a");
    if (on(2)) bits |= bit("y");
    if (on(3)) bits |= bit("x");
    if (on(4)) bits |= bit("l");
    if (on(5)) bits |= bit("r");
  }
  if (on(9)) bits |= bit("start");
  if (on(8)) bits |= bit("select");
  return bits;
}

// The keys held right now → bits, for one console.
export function keyBits(system: GameSystem, held: Set<string>): number {
  let bits = 0;
  const map = KEYMAP[system];
  for (const code of held) {
    const b = map[code];
    if (b) bits |= bit(b);
  }
  return bits;
}
