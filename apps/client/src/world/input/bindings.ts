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
  "pets", // the pets' command wheel, held (docs/plan/52-the-pet-two.md D7): T (P is the phone)
  // the camera on keys, behind me, lock-on (docs/plan/56-the-controls.md: KH_KEYS; none in the world yet)
  "camLeft",
  "camRight",
  "camUp",
  "camDown",
  "recenter",
  "lock",
  "emotes", // the emote wheel, held (docs/plan/56-the-controls.md phase 6): X, the pad's d-pad ←
] as const;
export type Action = (typeof ACTIONS)[number];

/** Keys by `code`; the mouse's buttons as Mouse0 (left), Mouse1 (the wheel's), Mouse2 (right). */
export type KeyBindings = Record<Action, string[]>;

/** Plan 29's keys (the arrows walked, Z looked with the mouse, X used): what a device saved before
 *  plan 56 is read against, and /dev/move's "today". */
export const PLAN29_KEYS: KeyBindings = {
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
  pets: ["KeyT"],
  camLeft: [],
  camRight: [],
  camUp: [],
  camDown: [],
  recenter: [],
  lock: [],
  emotes: [],
};

// the standard pad: 0 A/✕ 1 B/○ 2 X/□ 3 Y/△ 4 LB 5 RB 6 LT 7 RT 8 View 9 Menu 10 L3 11 R3 12–15 d-pad ↑↓←→
export type PadBindings = Partial<Record<Action, number>>;
/** Plan 29's pad (X used, Y the camera, LB rolled, L3 sprinted). */
export const PLAN29_PAD: PadBindings = {
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
  /** the pad's dodge held is the dash (plan 56's: no sprint button on the pad) */
  dashOnDodge?: boolean;
}

/** On a Mac (the browser's shortcuts are Cmd's there, not Ctrl's). */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & { userAgentData?: { platform?: string } };
  // (either says so: Safari and Firefox have only `platform`; some Chromes' `userAgentData` doesn't
  // agree with it — a test browser on a Mac reports Windows there)
  const mac = /mac|iphone|ipad/i;
  return mac.test(n.platform || "") || mac.test(n.userAgentData?.platform || "");
}
/** Walk's keys: Ctrl on a Mac; Alt elsewhere — Ctrl+W closes the tab on Windows and Linux, and a page
 *  can't stop it (the user's call, 2026-10-30). */
export const walkKeys = (mac: boolean): string[] => (mac ? ["ControlLeft", "ControlRight"] : ["AltLeft", "AltRight"]);

// The controls after Kingdom Hearts 3 (docs/plan/56-the-controls.md, Controls): WASD only walks,
// the mouse (always: the pointer's locked in play) and the arrows turn the camera, Shift held runs
// fast and Q rolls (as before: the user's call), F or the wheel's button locks on (focuses on
// someone or something; the lantern leaves F to be an item in the pockets), R puts the camera
// behind me, RMB or Z aims; on a pad X dodges (held: the dash), Y uses, RB locks on, R3
// recenters, View swaps the camera.
// /dev/move's for now: the world's come in phase 2.
export const KH_KEYS: KeyBindings = {
  up: ["KeyW"],
  down: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  walk: walkKeys(isMac()),
  sprint: ["ShiftLeft", "ShiftRight"],
  crouch: ["KeyC"],
  jump: ["Space"],
  dodge: ["KeyQ"],
  use: ["KeyE"],
  aim: ["Mouse2", "KeyZ"],
  torch: [],
  shoulder: ["KeyV"],
  camera: ["KeyY"],
  look: [],
  aid: [],
  inventory: ["KeyI"],
  pets: ["KeyT"],
  camLeft: ["ArrowLeft"],
  camRight: ["ArrowRight"],
  camUp: ["ArrowUp"],
  camDown: ["ArrowDown"],
  recenter: ["KeyR"],
  lock: ["KeyF", "Mouse1"],
  emotes: ["KeyX"],
};
export const KH_PAD: PadBindings = {
  jump: 0,
  crouch: 1,
  dodge: 2,
  use: 3,
  lock: 5,
  aim: 6,
  camera: 8,
  inventory: 9,
  recenter: 11,
  aid: 13,
  emotes: 14,
  pets: 15,
};
export const khBindings = (): Bindings => ({
  keys: structuredClone(KH_KEYS),
  pad: { ...KH_PAD },
  crouchHold: false,
  dashOnDodge: true,
});
/** Plan 29's (not what's saved on this device): /dev/move's "today". */
export const plan29Bindings = (): Bindings => ({
  keys: structuredClone(PLAN29_KEYS),
  pad: { ...PLAN29_PAD },
  crouchHold: false,
});

// The world's (docs/plan/56-the-controls.md): the KH keys and pad — F focuses (the lock-on, the
// user's call); the lantern on L (and the pad's ↑) till it's an item in the pockets (plan 57).
export const DEFAULT_KEYS: KeyBindings = {
  ...structuredClone(KH_KEYS),
  torch: ["KeyL"],
};
export const DEFAULT_PAD: PadBindings = { ...KH_PAD, torch: 12 };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// defaults since given up (saved as they were, they move to today's: what you'd set yourself is
// kept) — walk: Alt till 2026-10-30, then Ctrl for a few hours everywhere, now Ctrl on a Mac and
// Alt elsewhere, so the other one's the given-up default there
const retired = (): Partial<Record<Action, string[][]>> => ({ walk: [walkKeys(!isMac())] });

export function loadBindings(): Bindings {
  const base: Bindings = {
    keys: structuredClone(DEFAULT_KEYS),
    pad: { ...DEFAULT_PAD },
    crouchHold: false,
    dashOnDodge: true,
  };
  // (walk's own default: the platform's, as it is now)
  base.keys.walk = walkKeys(isMac());
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Bindings>;
    // (saved before plan 56: what was plan 29's own default moves to the new one; what you'd set
    // yourself is kept)
    for (const a of ACTIONS) {
      const k = saved.keys?.[a];
      if (
        Array.isArray(k) &&
        k.every((c) => typeof c === "string") &&
        !same(k, PLAN29_KEYS[a]) &&
        !(retired()[a] ?? []).some((r) => same(k, r))
      )
        base.keys[a] = k;
      const p = saved.pad?.[a];
      if (typeof p === "number" && p !== PLAN29_PAD[a]) base.pad[a] = p;
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
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Mouse0: "LMB",
  Mouse1: "MMB",
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
