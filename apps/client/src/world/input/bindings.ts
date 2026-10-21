// The keys (docs/plan/29-the-move.md, Controls): what each key does, by where
// it is on the keyboard (`KeyboardEvent.code`: W is where W is on QWERTY,
// whatever the layout prints on it), and each pad button (the standard
// mapping). Rebindable; saved on this device.

export const ACTIONS = [
  "up",
  "down",
  "left",
  "right",
  "walk",
  "sprint",
  "crouch",
  "jump",
  "dodge",
  "use",
  "aim",
  "torch",
  "shoulder",
  "camera",
  "look",
  "aid", // first aid from the pockets (docs/plan/30-the-dark.md): the pad's d-pad ↓
  "inventory", // the pockets, all of them (the dark's inventory): I, the pad's Menu
] as const;
export type Action = (typeof ACTIONS)[number];

/** Keys by `code`; the mouse's buttons as Mouse0 (left), Mouse2 (right). */
export type KeyBindings = Record<Action, string[]>;

export const DEFAULT_KEYS: KeyBindings = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  walk: ["AltLeft", "AltRight"],
  sprint: ["ShiftLeft", "ShiftRight"],
  crouch: ["KeyC"],
  jump: ["Space"],
  dodge: ["KeyQ"],
  use: ["KeyE", "KeyX"],
  aim: ["Mouse2"],
  torch: ["KeyF"],
  shoulder: ["KeyV"],
  camera: ["KeyY"],
  look: ["KeyZ"],
  aid: [],
  inventory: ["KeyI"],
};

// the standard pad: 0 A/✕ 1 B/○ 2 X/□ 3 Y/△ 4 LB 5 RB 6 LT 7 RT 8 View 9 Menu 10 L3 11 R3 12–15 d-pad ↑↓←→
export type PadBindings = Partial<Record<Action, number>>;
export const DEFAULT_PAD: PadBindings = {
  jump: 0,
  crouch: 1,
  use: 2,
  camera: 3,
  dodge: 4,
  aim: 6,
  sprint: 10,
  shoulder: 11,
  torch: 12,
  aid: 13,
  inventory: 9,
};

const STORE = "yutopia.bindings";

export interface Bindings {
  keys: KeyBindings;
  pad: PadBindings;
  /** crouch: a toggle (default) or held */
  crouchHold: boolean;
}

export function loadBindings(): Bindings {
  const base: Bindings = { keys: structuredClone(DEFAULT_KEYS), pad: { ...DEFAULT_PAD }, crouchHold: false };
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Bindings>;
    for (const a of ACTIONS) {
      const k = saved.keys?.[a];
      if (Array.isArray(k) && k.every((c) => typeof c === "string")) base.keys[a] = k;
      const p = saved.pad?.[a];
      if (typeof p === "number") base.pad[a] = p;
    }
    if (typeof saved.crouchHold === "boolean") base.crouchHold = saved.crouchHold;
  } catch {
    // (storage blocked or garbled: the defaults)
  }
  return base;
}

export function saveBindings(b: Bindings): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(b));
  } catch {
    // (storage blocked: kept for this visit only)
  }
}

/** Which action a key (code) does, if any. */
export function actionOf(b: Bindings, code: string): Action | null {
  for (const a of ACTIONS) if (b.keys[a].includes(code)) return a;
  return null;
}

// ── what the keys are called ────────────────────────────────────────────────
const NAMES: Record<string, string> = {
  Space: "Space",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  AltLeft: "Alt",
  AltRight: "Alt",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Mouse0: "LMB",
  Mouse2: "RMB",
};
let layout: Map<string, string> | null = null;

/** Learns this keyboard's own labels (where the browser can tell: Chrome, Edge). */
export async function learnLayout(): Promise<void> {
  const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
  try {
    if (kb?.getLayoutMap) layout = await kb.getLayoutMap();
  } catch {
    layout = null;
  }
}

/** A key's label as printed on this keyboard (AZERTY's A where QWERTY has Q…). */
export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  const own = layout?.get(code);
  if (own) return own.toUpperCase();
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

const PAD_NAMES = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "L3", "R3", "↑", "↓", "←", "→"];
export const padLabel = (i: number) => PAD_NAMES[i] ?? `#${i}`;
