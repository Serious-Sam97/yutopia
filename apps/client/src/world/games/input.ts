import { type GameSystem, hasSticks, PAD_BUTTONS, type PadButton, STICK_MAX, SYSTEMS } from "@yutopia/shared/games";
import { latestPad } from "../pads";
import { realGamepads } from "./vpad";

// Your pad (docs/plan/23-disc-console.md P4): what the keyboard, a gamepad's
// buttons and its sticks do on each console — its bindings, the defaults below
// unless you changed them (Controllers) — read into the console's buttons (a
// bitmask, PAD_BUTTONS order) and, on a pad with sticks, the sticks
// ([lx, ly, rx, ry], −127…127). The same whether it drives the emulator here or
// goes to whoever runs the game. Kept per device (a gamepad is this computer's).

export type StickDir = "lx-" | "lx+" | "ly-" | "ly+" | "rx-" | "rx+" | "ry-" | "ry+";
export type Control = PadButton | StickDir;
export const STICK_DIRS: readonly StickDir[] = ["lx-", "lx+", "ly-", "ly+", "rx-", "rx+", "ry-", "ry+"];
export const isStickDir = (c: string): c is StickDir => (STICK_DIRS as readonly string[]).includes(c);

// What each thing does: keys by KeyboardEvent.code; a gamepad's buttons by
// index ("0"…); its axes by index and direction ("0-", "0+"…).
export interface Binding {
  keys: Record<string, Control>;
  buttons: Record<string, Control>;
  axes: Record<string, Control>;
}
export interface PadPrefs {
  device: string; // the gamepad picked (its id; "" = whichever one is pressed)
  deadzone: number; // a stick moved less than this (0…1) is at rest
  dpadStick: boolean; // on consoles without sticks, the left stick moves the d-pad
  per: Partial<Record<GameSystem, Binding>>; // only the consoles you changed
}

// ── the defaults ────────────────────────────────────────────────────────────
const DPAD: Record<string, PadButton> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const KEYS: Record<GameSystem, Record<string, Control>> = {
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
  // ✕ ○ □ △ (the pad's b a y x), L1 R1 L2 R2, L3 R3; the sticks on I J K L (right)
  ps1: {
    ...DPAD,
    KeyX: "b",
    KeyC: "a",
    KeyZ: "y",
    KeyS: "x",
    KeyQ: "l",
    KeyW: "r",
    KeyE: "l2",
    KeyR: "r2",
    KeyV: "l3",
    KeyB: "r3",
    KeyI: "ry-",
    KeyK: "ry+",
    KeyJ: "rx-",
    KeyL: "rx+",
    Enter: "start",
    ShiftLeft: "select",
    ShiftRight: "select",
  },
};
// a standard-mapping gamepad's buttons: bottom, right, left, top, shoulders,
// triggers, back / start, the stick clicks, the d-pad
const STD_BUTTONS: Control[] = [
  "b",
  "a",
  "y",
  "x",
  "l",
  "r",
  "l2",
  "r2",
  "select",
  "start",
  "l3",
  "r3",
  "up",
  "down",
  "left",
  "right",
];
// A PlayStation pad the browser can't map (its DirectInput order — Firefox
// shows some like this): □ ✕ ○ △, the shoulders, triggers, Share / Options,
// the stick clicks; its d-pad is a hat switch (an axis, see HAT).
const PS_DINPUT: Control[] = ["y", "b", "a", "x", "l", "r", "l2", "r2", "select", "start", "l3", "r3"];
export type Layout = "standard" | "ps-dinput";
export const layoutOf = (gp: Gamepad | null): Layout =>
  !gp || gp.mapping === "standard" || padFamily(gp.id) !== "playstation" ? "standard" : "ps-dinput";
function defaultButtons(system: GameSystem, layout: Layout = "standard"): Record<string, Control> {
  const has = SYSTEMS[system].buttons as readonly string[];
  const out: Record<string, Control> = {};
  (layout === "ps-dinput" ? PS_DINPUT : STD_BUTTONS).forEach((c, i) => {
    if (has.includes(c)) out[String(i)] = c;
  });
  if (layout === "ps-dinput") {
    if (system === "2600" && out["1"] === undefined) out["1"] = "b";
    if (system === "md") Object.assign(out, { "0": "y", "1": "b", "2": "a" });
    return out;
  }
  if (system === "2600") out["1"] = "b"; // either face button fires
  if (system === "md") Object.assign(out, { "2": "y", "0": "b", "1": "a" }); // A B C where they sit
  return out;
}
const STICK_AXES: Record<string, StickDir> = {
  "0-": "lx-",
  "0+": "lx+",
  "1-": "ly-",
  "1+": "ly+",
  "2-": "rx-",
  "2+": "rx+",
  "3-": "ry-",
  "3+": "ry+",
};
// (on a DirectInput PlayStation pad the right stick is axes 2 and 5; 3 and 4 are the triggers)
const PS_DINPUT_AXES: Record<string, StickDir> = { ...STICK_AXES, "5-": "ry-", "5+": "ry+" };
delete PS_DINPUT_AXES["3-"];
delete PS_DINPUT_AXES["3+"];
export function defaultBinding(system: GameSystem, layout: Layout = layoutOf(myGamepad())): Binding {
  return {
    keys: { ...KEYS[system] },
    buttons: defaultButtons(system, layout),
    axes: hasSticks(system) ? { ...(layout === "ps-dinput" ? PS_DINPUT_AXES : STICK_AXES) } : {},
  };
}

// ── what you set (this device) ────────────────────────────────────────────────
const KEY = "yutopia:pads";
const DEFAULT_PREFS: PadPrefs = { device: "", deadzone: 0.2, dpadStick: true, per: {} };
let cache: PadPrefs | null = null;
const subs = new Set<() => void>();
export function padPrefs(): PadPrefs {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    cache = { ...DEFAULT_PREFS, ...raw, per: { ...(raw?.per ?? {}) } };
  } catch {
    cache = { ...DEFAULT_PREFS };
  }
  const c = cache as PadPrefs;
  if (!(c.deadzone >= 0.05 && c.deadzone <= 0.6)) c.deadzone = DEFAULT_PREFS.deadzone;
  c.dpadStick = c.dpadStick !== false;
  if (typeof c.device !== "string") c.device = "";
  return c;
}
export function setPadPrefs(patch: Partial<PadPrefs>) {
  cache = { ...padPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {}
  for (const f of subs) f();
}
export function onPadPrefs(f: () => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}
export function bindingOf(system: GameSystem): Binding {
  return padPrefs().per[system] ?? defaultBinding(system);
}
// One thing bound to a control (it leaves whatever it did before); a control
// keeps one key, one button and one stick direction at most.
export function bind(system: GameSystem, kind: keyof Binding, what: string, control: Control) {
  const b = structuredClone(bindingOf(system));
  for (const [k, c] of Object.entries(b[kind])) if (c === control || k === what) delete b[kind][k];
  b[kind][what] = control;
  setPadPrefs({ per: { ...padPrefs().per, [system]: b } });
}
export function unbind(system: GameSystem, kind: keyof Binding, control: Control) {
  const b = structuredClone(bindingOf(system));
  for (const [k, c] of Object.entries(b[kind])) if (c === control) delete b[kind][k];
  setPadPrefs({ per: { ...padPrefs().per, [system]: b } });
}
export function resetBinding(system: GameSystem) {
  const per = { ...padPrefs().per };
  delete per[system];
  setPadPrefs({ per });
}

// ── the pad you play with ────────────────────────────────────────────────────
// The one picked (when it's plugged in); else one the browser maps to the
// standard layout; else the one with the most buttons (a pad can come with a
// touchpad or motion sensors listed as gamepads of their own). One pad can be
// listed more than once under the same name, too (a DualSense over Bluetooth on
// macOS: its HID interfaces, only one of which ever sends anything), so of
// those it's the one whose state moved last.
export function myGamepad(): Gamepad | null {
  const all = realGamepads().filter((g): g is Gamepad => !!g?.connected);
  const id = padPrefs().device;
  const picked = id ? all.filter((g) => g.id === id) : [];
  if (picked.length) return latestPad(picked);
  const std = all.filter((g) => g.mapping === "standard");
  if (std.length) return latestPad(std);
  const most = Math.max(0, ...all.map((g) => g.buttons.length));
  return latestPad(all.filter((g) => g.buttons.length === most));
}

// A hat switch (an unmapped pad's d-pad, one axis): −1 up, then clockwise in
// eighths to 1 (up-left); at rest it's outside −1…1 (≈ 1.29).
const HAT_DIRS: PadButton[][] = [
  ["up"],
  ["up", "right"],
  ["right"],
  ["down", "right"],
  ["down"],
  ["down", "left"],
  ["left"],
  ["up", "left"],
];
export function hatButtons(v: number): PadButton[] {
  if (!(v >= -1.05 && v <= 1.05)) return [];
  return HAT_DIRS[Math.max(0, Math.min(7, Math.round(((v + 1) * 7) / 2)))];
}
const HAT_AXIS = 9;
export const pressed = (b: GamepadButton | undefined) => !!b && (b.pressed || b.value > 0.5);

export const bit = (b: PadButton) => 1 << PAD_BUTTONS.indexOf(b);

// The console's buttons and sticks from the keys held, your pad, the touch pad.
export function readPad(
  system: GameSystem,
  held: ReadonlySet<string>,
  touch = 0,
): { bits: number; sticks: [number, number, number, number] } {
  const b = bindingOf(system);
  const { deadzone, dpadStick } = padPrefs();
  let bits = touch;
  const s = [0, 0, 0, 0];
  const apply = (c: Control | undefined, amount: number) => {
    if (!c) return;
    if (isStickDir(c)) {
      const i = ["lx", "ly", "rx", "ry"].indexOf(c.slice(0, 2));
      s[i] += (c[2] === "-" ? -1 : 1) * amount;
    } else if (amount > 0.5) bits |= bit(c);
  };
  for (const code of held) apply(b.keys[code], 1);
  const gp = myGamepad();
  if (gp) {
    // an unmapped pad's d-pad (its hat), unless that axis is bound to something
    if (gp.mapping !== "standard" && gp.axes.length > HAT_AXIS && !b.axes[`${HAT_AXIS}-`] && !b.axes[`${HAT_AXIS}+`])
      for (const d of hatButtons(gp.axes[HAT_AXIS])) bits |= bit(d);
    gp.buttons.forEach((btn, i) => {
      if (pressed(btn)) apply(b.buttons[String(i)], 1);
    });
    gp.axes.forEach((v, i) => {
      if (i === HAT_AXIS && gp.mapping !== "standard" && !b.axes[`${i}-`] && !b.axes[`${i}+`]) return;
      const a = Math.abs(v);
      if (a <= deadzone) return;
      const amount = Math.min(1, (a - deadzone) / (1 - deadzone)); // (rescaled past the dead zone)
      const dir = v < 0 ? "-" : "+";
      const bound = b.axes[`${i}${dir}`];
      if (bound) apply(bound, isStickDir(bound) ? amount : a > 0.5 ? 1 : 0);
      // a console without sticks: the left stick moves the d-pad
      else if (dpadStick && !hasSticks(system) && i < 2 && a > 0.5)
        bits |= bit(i === 0 ? (dir === "-" ? "left" : "right") : dir === "-" ? "up" : "down");
    });
  }
  const q = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * STICK_MAX);
  return { bits, sticks: [q(s[0]), q(s[1]), q(s[2]), q(s[3])] };
}

// ── names ───────────────────────────────────────────────────────────────────
// Each console's own names for its buttons (what the panel and Controllers show).
const NAMES: Record<GameSystem, Partial<Record<Control, string>>> = {
  "2600": { b: "fire", start: "reset", select: "select" },
  nes: { a: "A", b: "B", start: "Start", select: "Select" },
  snes: { a: "A", b: "B", x: "X", y: "Y", l: "L", r: "R", start: "Start", select: "Select" },
  md: { y: "A", b: "B", a: "C", start: "Start" },
  gb: { a: "A", b: "B", start: "Start", select: "Select" },
  ps1: {
    b: "✕",
    a: "○",
    y: "□",
    x: "△",
    l: "L1",
    r: "R1",
    l2: "L2",
    r2: "R2",
    l3: "L3",
    r3: "R3",
    start: "Start",
    select: "Select",
    "lx-": "left stick ←",
    "lx+": "left stick →",
    "ly-": "left stick ↑",
    "ly+": "left stick ↓",
    "rx-": "right stick ←",
    "rx+": "right stick →",
    "ry-": "right stick ↑",
    "ry+": "right stick ↓",
  },
};
const ARROWS: Partial<Record<Control, string>> = { up: "↑", down: "↓", left: "←", right: "→" };
export const controlName = (system: GameSystem, c: Control) => NAMES[system][c] ?? ARROWS[c] ?? c;
// What can be bound on a console: its buttons, then its sticks' directions.
export const controlsOf = (system: GameSystem): Control[] => [
  ...(SYSTEMS[system].buttons as readonly PadButton[]),
  ...(hasSticks(system) ? STICK_DIRS : []),
];

export function keyName(code: string): string {
  const fixed: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    ShiftLeft: "Shift",
    ShiftRight: "Shift",
    ControlLeft: "Ctrl",
    ControlRight: "Ctrl",
    AltLeft: "Alt",
    AltRight: "Alt",
    Enter: "Enter",
    Space: "Space",
    Backspace: "⌫",
  };
  return (
    fixed[code] ??
    code
      .replace(/^Key/, "")
      .replace(/^Digit/, "")
      .replace(/^Numpad/, "Num ")
  );
}

// A pad's family, by who made it (its id carries the vendor): what its buttons are called.
export type PadFamily = "playstation" | "xbox" | "nintendo" | "generic";
export function padFamily(id: string): PadFamily {
  // (Xbox and Nintendo first: Sony's pads call themselves just "Wireless Controller")
  if (/045e|xbox|xinput/i.test(id)) return "xbox";
  if (/057e|nintendo|switch|joy-con/i.test(id)) return "nintendo";
  if (/054c|playstation|dualshock|dualsense|wireless controller/i.test(id)) return "playstation";
  return "generic";
}
const GLYPHS: Record<PadFamily, string[]> = {
  playstation: ["✕", "○", "□", "△", "L1", "R1", "L2", "R2", "Share", "Options", "L3", "R3", "↑", "↓", "←", "→", "PS"],
  xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "LS", "RS", "↑", "↓", "←", "→", "Xbox"],
  nintendo: ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+", "LS", "RS", "↑", "↓", "←", "→", "Home"],
  generic: ["1", "2", "3", "4", "LB", "RB", "LT", "RT", "Back", "Start", "LS", "RS", "↑", "↓", "←", "→", "Home"],
};
const PS_DINPUT_GLYPHS = ["□", "✕", "○", "△", "L1", "R1", "L2", "R2", "Share", "Options", "L3", "R3", "PS", "Touchpad"];
export function buttonName(family: PadFamily, i: number, layout: Layout = "standard"): string {
  if (layout === "ps-dinput") return PS_DINPUT_GLYPHS[i] ?? `#${i}`;
  return GLYPHS[family][i] ?? `#${i}`;
}
export function axisName(family: PadFamily, axis: string): string {
  const [i, dir] = [Number(axis.slice(0, -1)), axis.slice(-1)];
  const stick =
    i < 2
      ? family === "playstation"
        ? "L stick"
        : "left stick"
      : family === "playstation"
        ? "R stick"
        : "right stick";
  const way = i % 2 === 0 ? (dir === "-" ? "←" : "→") : dir === "-" ? "↑" : "↓";
  return i < 4 ? `${stick} ${way}` : `axis ${i} ${dir}`;
}

// What the panel prints for a console: its keys, from the bindings.
export function keyHints(system: GameSystem): [string, string][] {
  const b = bindingOf(system);
  const by = new Map<string, string[]>();
  for (const [code, c] of Object.entries(b.keys)) {
    const label = ["up", "down", "left", "right"].includes(c) ? "pad" : controlName(system, c);
    const keys = by.get(label) ?? [];
    const k = keyName(code);
    if (!keys.includes(k)) keys.push(k);
    by.set(label, keys);
  }
  return [...by].map(([label, keys]) => [keys.join(" "), label]);
}
