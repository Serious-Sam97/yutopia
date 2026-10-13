import { type GameSystem, type PadButton, SYSTEMS } from "@yutopia/shared/games";
import type { Nostalgist } from "nostalgist";

// The emulator, in the browser of whoever turned the console on: a libretro core
// (served from /emu/cores, fetched by tools/emu-cores.mjs) run by Nostalgist.
// Every player's buttons come in through `press` — our own keyboard and gamepad
// handling for the local player, the network for the others — so the core never
// reads the keyboard or gamepads itself. Its picture and sound can be captured
// for the TV everyone sees (world/games/tv.ts).

// Marks this chunk for `pnpm budget`.
export const GAMES_CHUNK = "yutopia-games";

// The picture's size: a 4:3 frame the cores scale into (captured for the TV).
export const EMU_W = 640;
export const EMU_H = 480;

// Keys only the core sees (synthetic events): distinct per player.
const KEYS: Record<1 | 2, Record<PadButton, string>> = {
  1: {
    up: "up",
    down: "down",
    left: "left",
    right: "right",
    a: "x",
    b: "z",
    x: "s",
    y: "a",
    l: "q",
    r: "w",
    start: "enter",
    select: "rshift",
  },
  2: {
    up: "t",
    down: "g",
    left: "f",
    right: "h",
    a: "l",
    b: "k",
    x: "o",
    y: "i",
    l: "r",
    r: "y",
    start: "p",
    select: "u",
  },
};

function retroarchConfig(): Record<string, string | number | boolean> {
  const c: Record<string, string | number | boolean> = {
    // our own input only: no joypad driver reading the gamepads, no menu on a key
    input_joypad_driver: "null",
    input_menu_toggle: "nul",
    input_enable_hotkey: "nul",
    savestate_auto_load: false,
    savestate_thumbnail_enable: false,
    video_smooth: false,
    audio_latency: 64,
    notification_show_when_menu_is_alive: false,
    video_font_enable: false,
  };
  for (const p of [1, 2] as const) for (const [b, key] of Object.entries(KEYS[p])) c[`input_player${p}_${b}`] = key;
  return c;
}

// EmulatorJS's build of RetroArch: buttons by RetroPad index, states in memory
interface EjsModule {
  _simulate_input(player: number, index: number, value: number): void;
  cwrap(name: string, ret: string, types: string[]): (...args: unknown[]) => unknown;
  HEAPU8: Uint8Array;
}
const RETROPAD: Record<PadButton, number> = {
  b: 0,
  y: 1,
  select: 2,
  start: 3,
  up: 4,
  down: 5,
  left: 6,
  right: 7,
  a: 8,
  x: 9,
  l: 10,
  r: 11,
};

// The console's sound, whichever way the core plays it (OpenAL, an audio
// worklet…): whatever it connects to its speakers also feeds a stream we can
// send with the TV. Only audio contexts other than the world's own are tapped.
const taps = new WeakMap<BaseAudioContext, MediaStreamAudioDestinationNode>();
const tapped = new Set<WeakRef<BaseAudioContext>>();
const contexts = (): BaseAudioContext[] =>
  [...tapped].map((r) => r.deref()).filter((c): c is BaseAudioContext => !!c && c.state !== "closed");
let tapping = false;
let worldCtx: BaseAudioContext | null = null;
function tapSpeakers(world: BaseAudioContext | null) {
  worldCtx = world;
  if (tapping) return;
  tapping = true;
  const connect = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
  AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
    const out = connect.apply(this, args);
    const dst = args[0];
    if (dst instanceof AudioDestinationNode && this.context !== worldCtx) {
      let tap = taps.get(this.context);
      if (!tap && this.context instanceof AudioContext) {
        tap = this.context.createMediaStreamDestination();
        taps.set(this.context, tap);
        tapped.add(new WeakRef(this.context));
      }
      if (tap) connect.call(this, tap);
    }
    return out;
  } as typeof AudioNode.prototype.connect;
}

// RetroArch asks to keep the screen awake when it starts; refused (no gesture,
// a hidden page), the rejection went unhandled. Asked politely now.
let wakeQuiet = false;
function quietWakeLock() {
  const wl = (navigator as unknown as { wakeLock?: { request: (t?: "screen") => Promise<unknown> } }).wakeLock;
  if (!wl || wakeQuiet) return;
  wakeQuiet = true;
  const request = wl.request.bind(wl);
  wl.request = (type?: "screen") => request(type).catch(() => ({ release: async () => {}, released: true }));
}

export interface Emu {
  canvas: HTMLCanvasElement;
  system: GameSystem;
  // a player's button (port 1 or 2), down or up
  press(port: number, button: PadButton, down: boolean): void;
  release(port: number): void; // everything that player holds, up
  pause(): void;
  resume(): void;
  saveState(): Promise<Blob>;
  saveSRAM(): Promise<Blob | null>;
  loadState(state: Blob): Promise<void>;
  audio(): MediaStream | null; // the console's sound, for the TV stream
  exit(): void;
}

export async function startEmu(o: {
  system: GameSystem;
  rom: Blob;
  romName: string;
  canvas: HTMLCanvasElement;
  state?: Blob | null;
  sram?: Blob | null;
  worldAudio?: BaseAudioContext | null; // the world's own sound (never tapped)
}): Promise<Emu> {
  const { Nostalgist: N } = await import("nostalgist");
  quietWakeLock();
  tapSpeakers(o.worldAudio ?? null);
  const before = new Set<BaseAudioContext>(contexts()); // (earlier games' contexts)
  const sys = SYSTEMS[o.system];
  o.canvas.width = EMU_W;
  o.canvas.height = EMU_H;
  const n: Nostalgist = await N.launch({
    core: sys.core,
    rom: new File([o.rom], o.romName),
    element: o.canvas,
    size: { width: EMU_W, height: EMU_H },
    style: { width: "100%", height: "100%", imageRendering: "pixelated", backgroundColor: "#000" },
    respondToGlobalEvents: false,
    resolveCoreJs: (core: unknown) => `/emu/cores/${String(core)}_libretro.js`,
    resolveCoreWasm: (core: unknown) => `/emu/cores/${String(core)}_libretro.wasm`,
    retroarchConfig: retroarchConfig() as never,
    // EmulatorJS-built cores (the 2600's) look for their canvas's parent
    emscriptenModule: { parent: o.canvas.parentElement ?? document.body } as never,
    ...(o.sram ? { sram: new File([o.sram], "sram") } : {}),
  });
  // the page keeps the keyboard: the core only hears what we press for it
  o.canvas.tabIndex = -1;
  o.canvas.blur();
  const held = new Map<number, Set<PadButton>>();
  let dest: MediaStreamAudioDestinationNode | null = null;
  // EmulatorJS-built cores take buttons straight in (and save their own way)
  const mod = n.getEmscriptenModule() as unknown as EjsModule;
  const ejs = typeof mod._simulate_input === "function";
  const send = (port: number, button: PadButton, down: boolean) => {
    if (ejs) mod._simulate_input(port - 1, RETROPAD[button], down ? 1 : 0);
    else if (down) n.pressDown({ button, player: port });
    else n.pressUp({ button, player: port });
  };
  const emu: Emu = {
    canvas: o.canvas,
    system: o.system,
    press(port, button, down) {
      if (port !== 1 && port !== 2) return;
      const set = held.get(port) ?? new Set();
      held.set(port, set);
      if (down === set.has(button)) return;
      if (down) set.add(button);
      else set.delete(button);
      send(port, button, down);
    },
    release(port) {
      for (const b of held.get(port) ?? []) send(port, b, false);
      held.delete(port);
    },
    pause: () => n.pause(),
    resume: () => n.resume(),
    async saveState() {
      if (ejs) {
        // "size|address|ok" of a state the core just wrote into its memory
        const [size, at, ok] = String(mod.cwrap("save_state_info", "string", [])()).split("|");
        if (ok !== "1") throw new Error(`save state: ${size}`);
        return new Blob([mod.HEAPU8.slice(Number(at), Number(at) + Number(size))]);
      }
      return (await n.saveState()).state;
    },
    async saveSRAM() {
      if (ejs) return null; // (the 2600 has no battery saves)
      // a cartridge with a battery writes its save at once; one without never
      // does (Nostalgist would keep looking for a minute)
      const none = new Promise<null>((r) => setTimeout(() => r(null), 1500));
      return Promise.race([n.saveSRAM().catch(() => null), none]);
    },
    async loadState(state) {
      if (!ejs) return n.loadState(new File([state], "state"));
      const fs = n.getEmscriptenFS() as { writeFile(p: string, d: Uint8Array): void };
      fs.writeFile("/game.state", new Uint8Array(await state.arrayBuffer()));
      mod.cwrap("load_state", "number", ["string", "number"])("game.state", 0);
    },
    audio() {
      if (dest) return dest.stream;
      // the core's audio context: OpenAL's, else whichever got tapped since launch
      const al = n.getEmscriptenAL() as { currentCtx?: { audioCtx: AudioContext } } | null;
      const ctx = al?.currentCtx?.audioCtx;
      dest = (ctx && taps.get(ctx)) || null;
      if (!dest) for (const c of contexts()) if (!before.has(c) && taps.get(c)) dest = taps.get(c) ?? null;
      return dest?.stream ?? null;
    },
    exit() {
      try {
        n.exit({ removeCanvas: false });
      } catch {
        // already gone
      }
    },
  };
  // where it left off (after launch: the same way for every core)
  if (o.state) await emu.loadState(o.state).catch(() => {});
  return emu;
}
