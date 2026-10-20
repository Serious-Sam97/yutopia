// Virtual gamepads for the core (docs/plan/23-disc-console.md, analog route A).
// RetroArch's web joypad driver ("rwebpad") reads navigator.getGamepads() every
// frame; while a game runs it gets these instead: one per port, built from what
// each player holds (yours from the keyboard or your real pad, the others' from
// the network). That carries the sticks' real values, which synthetic keys
// can't, and the core's rumble comes back through `vibrationActuator`. The
// page's own code keeps reading the real pads through `realGamepads`.

export type Rumble = { strong: number; weak: number; ms: number };

// The standard mapping's button order (what rwebpad's built-in profile expects).
export const STD = {
  b: 0, // bottom (✕)
  a: 1, // right (○)
  y: 2, // left (□)
  x: 3, // top (△)
  l: 4,
  r: 5,
  l2: 6,
  r2: 7,
  select: 8,
  start: 9,
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

interface VButton {
  pressed: boolean;
  touched: boolean;
  value: number;
}
interface VGamepad {
  id: string;
  index: number;
  connected: boolean;
  mapping: "standard";
  timestamp: number;
  axes: number[];
  buttons: VButton[];
  vibrationActuator: {
    type: string;
    playEffect(t: string, p: Record<string, number>): Promise<string>;
    reset(): Promise<string>;
  };
}

const nav = typeof navigator === "undefined" ? null : navigator;
const realGet = nav?.getGamepads ? nav.getGamepads.bind(nav) : () => [] as (Gamepad | null)[];
// The pads really plugged in (never the virtual ones).
export const realGamepads = (): (Gamepad | null)[] => [...realGet()];

const pads: VGamepad[] = [];
let installed = false;
const rumbles = new Map<number, (r: Rumble) => void>();

function make(index: number): VGamepad {
  return {
    id: `Yutopia pad ${index + 1} (STANDARD GAMEPAD)`,
    index,
    connected: true,
    mapping: "standard",
    timestamp: performance.now(),
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    vibrationActuator: {
      type: "dual-rumble",
      async playEffect(_t, p) {
        rumbles.get(index)?.({ strong: p.strongMagnitude ?? 0, weak: p.weakMagnitude ?? 0, ms: p.duration ?? 0 });
        return "complete";
      },
      async reset() {
        rumbles.get(index)?.({ strong: 0, weak: 0, ms: 0 });
        return "complete";
      },
    },
  };
}

// Swap navigator.getGamepads for the virtual pads, `ports` of them, and tell
// the core they were plugged in. Undone by the returned function. Call it
// after the core launched: Nostalgist re-announces whatever getGamepads lists
// as real GamepadEvents, which only take real pads.
export function installVirtualPads(ports: number): () => void {
  if (!nav || installed) return () => {};
  installed = true;
  const before = Object.getOwnPropertyDescriptor(nav, "getGamepads"); // (put back after)
  pads.length = 0;
  for (let i = 0; i < ports; i++) pads.push(make(i));
  Object.defineProperty(nav, "getGamepads", { configurable: true, value: read });
  for (const gp of pads) {
    const ev = new Event("gamepadconnected");
    Object.defineProperty(ev, "gamepad", { value: gp });
    window.dispatchEvent(ev);
  }
  return () => {
    for (const gp of pads) {
      gp.connected = false;
      const ev = new Event("gamepaddisconnected");
      Object.defineProperty(ev, "gamepad", { value: gp });
      window.dispatchEvent(ev);
    }
    if (before) Object.defineProperty(nav, "getGamepads", before);
    else delete (nav as { getGamepads?: unknown }).getGamepads; // the prototype's own again
    pads.length = 0;
    installed = false;
  };
}

// While a core starts: no pads at all (Nostalgist announces whatever
// getGamepads lists to the core; the core is only ever to see the virtual ones,
// plugged in after). Undone by the returned function.
export function hidePads(): () => void {
  if (!nav || installed) return () => {};
  const before = Object.getOwnPropertyDescriptor(nav, "getGamepads");
  Object.defineProperty(nav, "getGamepads", { configurable: true, value: () => [] });
  return () => {
    if (before) Object.defineProperty(nav, "getGamepads", before);
    else delete (nav as { getGamepads?: unknown }).getGamepads;
  };
}

// The core reads the pads once a frame (RetroArch's input poll): a pulse is a
// port's buttons for exactly one read — the disc console's analog switch toggles
// on every frame its combo is held (its latch is shared by both ports), so it's
// held for one frame exactly. So the core must be the only one to call
// navigator.getGamepads while these are in (the page reads `realGamepads`):
// another read would take the pulse, and the switch never reach the core.
const pulses = new Map<number, number>(); // port index → buttons for the next read
const pulsed = new Map<number, VButton[]>(); // what those pads really hold (put back next read)
function read(): VGamepad[] {
  for (const [i, real] of pulsed) if (pads[i]) pads[i].buttons = real;
  pulsed.clear();
  for (const [i, bits] of pulses) {
    const gp = pads[i];
    if (!gp) continue;
    pulsed.set(i, gp.buttons);
    gp.buttons = gp.buttons.map((_, j) => {
      const on = (bits & (1 << j)) !== 0;
      return { pressed: on, touched: on, value: on ? 1 : 0 };
    });
    gp.timestamp = performance.now();
  }
  pulses.clear();
  return [...pads];
}
export function pulseVirtualPad(port: number, buttons: number): void {
  if (pads[port - 1]) pulses.set(port - 1, buttons);
}

// A port's state: buttons by standard index (a bitmask), sticks −1..1 [lx, ly, rx, ry].
export function setVirtualPad(port: number, buttons: number, axes: readonly number[]): void {
  const gp = pads[port - 1];
  if (!gp) return;
  let changed = false;
  for (let i = 0; i < gp.buttons.length; i++) {
    const on = (buttons & (1 << i)) !== 0;
    if (gp.buttons[i].pressed === on) continue;
    gp.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 };
    changed = true;
  }
  for (let i = 0; i < 4; i++) {
    const v = Math.max(-1, Math.min(1, axes[i] ?? 0));
    if (gp.axes[i] === v) continue;
    gp.axes[i] = v;
    changed = true;
  }
  if (changed) gp.timestamp = performance.now();
}

// What the core asks a port's pad to do (relayed to whoever holds it).
export function onRumble(port: number, f: ((r: Rumble) => void) | null): void {
  if (f) rumbles.set(port - 1, f);
  else rumbles.delete(port - 1);
}
