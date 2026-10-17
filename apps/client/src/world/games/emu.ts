import { ANALOG_COMBO, type GameSystem, type PadButton, STICK_MAX, SYSTEMS } from "@yutopia/shared/games";
import type { Nostalgist } from "nostalgist";
import { hidePads, installVirtualPads, onRumble, pulseVirtualPad, type Rumble, STD, setVirtualPad } from "./vpad";

// The emulator, in the browser of whoever turned the console on: a libretro core
// (served from /emu/cores, fetched by tools/emu-cores.mjs) run by Nostalgist.
// Every player's buttons (and sticks) come in through `press` / `sticks` — our
// own bindings for the local player (input.ts), the network for the others —
// into virtual pads the core reads (vpad.ts): it never reads the keyboard or the
// real gamepads itself. Its picture and sound can be captured
// for the TV everyone sees (world/games/tv.ts).

// Marks this chunk for `pnpm budget`.
export const GAMES_CHUNK = "yutopia-games";

// The picture's size: a 4:3 frame the cores scale into (captured for the TV).
export const EMU_W = 640;
export const EMU_H = 480;

// The sound buffer (ms): the web audio driver fills it from the page's own
// frame loop, so a hitch on the main thread longer than this is a gap you hear
// (the 16-bit cores take the most time per frame — and the host's page is
// also drawing the world and sending the TV out). Bigger = safer, later.
const AUDIO_LATENCY: Record<GameSystem, number> = { "2600": 80, nes: 80, gb: 80, snes: 128, md: 112, ps1: 160 };

function retroarchConfig(system: GameSystem): Record<string, string | number | boolean> {
  const c: Record<string, string | number | boolean> = {
    // our own input only: no joypad driver reading the gamepads, no menu on a key
    // the pads: RetroArch's web joypad driver, reading the virtual pads (vpad.ts)
    // — never the real ones (what the core gets is what our bindings say)
    input_joypad_driver: "rwebpad",
    input_autodetect_enable: true,
    input_menu_toggle: "nul",
    input_enable_hotkey: "nul",
    savestate_auto_load: false,
    savestate_thumbnail_enable: false,
    video_smooth: false,
    audio_latency: AUDIO_LATENCY[system],
    notification_show_when_menu_is_alive: false,
    video_font_enable: false,
  };
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
  l2: 12,
  r2: 13,
  l3: 14,
  r3: 15,
};

// The console's sound, whichever way the core plays it (OpenAL, scheduled
// buffers…): whatever it connects to its speakers is rerouted through a gain
// (what the host hears: the TV's volume, how far they stand) and also feeds a
// stream we can send with the TV (the raw sound: viewers set their own volume).
// Only audio contexts other than the world's own are touched.
const taps = new WeakMap<BaseAudioContext, MediaStreamAudioDestinationNode>();
const ears = new WeakMap<BaseAudioContext, GainNode>(); // the host's own volume
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
  const disconnect = AudioNode.prototype.disconnect as (this: AudioNode, ...a: unknown[]) => unknown;
  AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
    const dst = args[0];
    const ctx = this.context;
    if (!(dst instanceof AudioDestinationNode) || ctx === worldCtx || !(ctx instanceof AudioContext))
      return connect.apply(this, args);
    let tap = taps.get(ctx);
    let ear = ears.get(ctx);
    if (!tap || !ear) {
      tap = ctx.createMediaStreamDestination();
      ear = ctx.createGain();
      connect.call(ear, dst);
      taps.set(ctx, tap);
      ears.set(ctx, ear);
      tapped.add(new WeakRef(ctx));
    }
    connect.call(this, tap);
    connect.call(this, ear);
    return dst;
  } as typeof AudioNode.prototype.connect;
  AudioNode.prototype.disconnect = function (this: AudioNode, ...args: unknown[]) {
    const ear = args[0] instanceof AudioDestinationNode ? ears.get(this.context) : undefined;
    if (!ear) return disconnect.apply(this, args);
    try {
      disconnect.call(this, ear);
      disconnect.call(this, taps.get(this.context));
    } catch {
      // never connected through us
    }
  } as typeof AudioNode.prototype.disconnect;
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

const named = (fileName: string, fileContent: Blob) => ({ fileName, fileContent });

// The disc console's pads: DualShocks (they start digital; L1 + R1 + L3 held
// together switch analog on and off), their sticks only sticks. A port's device
// type only sticks through a remap file (RetroArch puts every port back to a
// plain pad on load without one).
const REMAPS = "/home/web_user/retroarch/userdata/remaps";
const DUALSHOCK = 517; // RETRO_DEVICE_SUBCLASS(ANALOG, 1) in PCSX ReARMed
function padSetup(system: GameSystem): {
  config: Record<string, string | number | boolean>;
  files: { path: string; text: string }[];
} {
  if (system !== "ps1") return { config: {}, files: [] };
  return {
    config: { input_remapping_directory: REMAPS, auto_remaps_enable: true, input_remap_binds_enable: true },
    files: [
      {
        path: `${REMAPS}/PCSX-ReARMed/PCSX-ReARMed.rmp`,
        text: [1, 2]
          .flatMap((p) => [`input_libretro_device_p${p} = "${DUALSHOCK}"`, `input_player${p}_analog_dpad_mode = "0"`])
          .join("\n"),
      },
    ],
  };
}

// A core's own options: the disc console boots the team's BIOS (its start-up
// logo on the TV for everyone); with none it's the core's stand-in (HLE) —
// what the game room only allows for the dev stack's test BIOS (room.ts).
function coreOptions(system: GameSystem, bios: boolean): Record<string, string> {
  if (system !== "ps1") return {};
  return {
    pcsx_rearmed_bios: bios ? "auto" : "HLE",
    pcsx_rearmed_show_bios_bootlogo: "enabled",
    pcsx_rearmed_vibration: "enabled",
    pcsx_rearmed_analog_combo: "l1+r1+l3",
  };
}
// Above this, a game's files are written into the core's file system by us (see startEmu).
const DIRECT_BYTES = 32 * 1024 * 1024;
const CONTENT_DIR = "/home/web_user/retroarch/userdata/content"; // (Nostalgist's)
const base = (name: string) => name.replace(/\.[^.]+$/, "");

export interface Emu {
  canvas: HTMLCanvasElement;
  system: GameSystem;
  // a player's button (port 1 or 2), down or up
  press(port: number, button: PadButton, down: boolean): void;
  release(port: number): void; // everything that player holds, up (sticks back to rest)
  sticks(port: number, sticks: readonly number[]): void; // [lx, ly, rx, ry] −127…127 (pads with sticks)
  analog(port: number): void; // the disc console's pad: switch its analog mode (on ↔ off)
  onRumble(f: ((port: number, r: Rumble) => void) | null): void; // what the core asks a pad to do
  pause(): void;
  resume(): void;
  saveState(): Promise<Blob>;
  saveSRAM(): Promise<Blob | null>;
  loadState(state: Blob): Promise<void>;
  audio(): MediaStream | null; // the console's sound, for the TV stream
  volume(v: number): void; // what the host hears of it (0..1; the stream stays at full)
  exit(): void;
  emscripten(): unknown; // the core's module (dev tools: its memory)
}

export async function startEmu(o: {
  system: GameSystem;
  rom: Blob;
  romName: string;
  canvas: HTMLCanvasElement;
  state?: Blob | null;
  sram?: Blob | null;
  worldAudio?: BaseAudioContext | null; // the world's own sound (never tapped)
  // a disc's other files (a .cue's .bin tracks), by their own names
  more?: File[];
  bios?: File[]; // into the core's system folder
  // the disc console's spike (docs/plan/23-disc-console.md P0): another core, more config
  core?: string;
  config?: Record<string, string | number | boolean>;
  coreConfig?: Record<string, string>;
  files?: { path: string; text: string }[]; // written before the core starts (a remap file…)
}): Promise<Emu> {
  const { Nostalgist: N } = await import("nostalgist");
  quietWakeLock();
  tapSpeakers(o.worldAudio ?? null);
  const before = new Set<BaseAudioContext>(contexts()); // (earlier games' contexts)
  const sys = SYSTEMS[o.system];
  o.canvas.width = EMU_W;
  o.canvas.height = EMU_H;
  // RetroArch sizes its canvas from the CSS box × the screen's pixel ratio
  // (a ResizeObserver reading the device-pixel box): a 640 px box on a 2×
  // screen went out as 1280 × 960 — four times the pixels to encode, send and
  // decode. The box is sized so the picture stays EMU_W × EMU_H, from what the
  // browser reports (not devicePixelRatio: an emulated ratio can differ from
  // the real device pixels, and the screen may change), and again whenever it
  // changes.
  const fit = (ratio: number) => {
    o.canvas.style.width = `${EMU_W / ratio}px`;
    o.canvas.style.height = `${EMU_H / ratio}px`;
  };
  fit(window.devicePixelRatio || 1);
  const sizing = new ResizeObserver((entries) => {
    const e = entries.find((x) => x.target === o.canvas);
    const box = e?.devicePixelContentBoxSize?.[0];
    const css = e?.contentRect.width ?? 0;
    if (!box?.inlineSize || !css) return;
    if (Math.abs(box.inlineSize - EMU_W) <= 1 && Math.abs(box.blockSize - EMU_H) <= 1) return;
    fit(box.inlineSize / css);
  });
  try {
    sizing.observe(o.canvas, { box: "device-pixel-content-box" });
  } catch {
    sizing.observe(o.canvas);
  }
  // A disc (hundreds of MB, maybe in several files) goes into the core's file
  // system from here, handed over without a copy: Nostalgist's own writes make
  // four (a 771 MB disc took the tab from 0.2 to 3.3 GB). The core gets a
  // one-line .m3u that names it.
  const pads = padSetup(o.system);
  const disc =
    o.more?.length || o.rom.size > DIRECT_BYTES
      ? [named(o.romName, o.rom), ...(o.more ?? []).map((f) => named(f.name, f))]
      : null;
  const unhide = hidePads();
  const n: Nostalgist = await N.launch({
    core: o.core ?? sys.core,
    // by name: Nostalgist calls a bare Blob / File "data<n>.bin" (a .cue names its tracks)
    // (Nostalgist takes an .m3u for a set of discs and wants the first one next
    // to it; it gets an empty stand-in, the real files are ours)
    rom: disc
      ? [named(`${base(o.romName)}.m3u`, new Blob([o.romName])), named(`${base(o.romName)}.none`, new Blob([]))]
      : named(o.romName, o.rom),
    ...(o.bios?.length ? { bios: o.bios.map((f) => named(f.name, f)) } : {}),
    retroarchCoreConfig: { ...coreOptions(o.system, !!o.bios?.length), ...o.coreConfig },
    element: o.canvas,
    size: { width: EMU_W, height: EMU_H },
    style: { imageRendering: "pixelated", backgroundColor: "#000" },
    respondToGlobalEvents: false,
    resolveCoreJs: (core: unknown) => `/emu/cores/${String(core)}_libretro.js`,
    resolveCoreWasm: (core: unknown) => `/emu/cores/${String(core)}_libretro.wasm`,
    retroarchConfig: { ...retroarchConfig(o.system), ...pads.config, ...o.config } as never,
    // EmulatorJS-built cores (the 2600's) look for their canvas's parent
    emscriptenModule: { parent: o.canvas.parentElement ?? document.body } as never,
    ...(o.sram ? { sram: new File([o.sram], "sram") } : {}),
    async beforeLaunch(nn: Nostalgist) {
      const fs = nn.getEmscriptenFS() as {
        mkdirTree(p: string): void;
        writeFile(p: string, d: string | Uint8Array, opts?: { canOwn?: boolean }): void;
      };
      for (const f of [...pads.files, ...(o.files ?? [])]) {
        fs.mkdirTree(f.path.slice(0, f.path.lastIndexOf("/")));
        fs.writeFile(f.path, f.text);
      }
      for (const f of disc ?? [])
        fs.writeFile(`${CONTENT_DIR}/${f.fileName}`, new Uint8Array(await f.fileContent.arrayBuffer()), {
          canOwn: true,
        });
    },
  }).finally(unhide);
  fit(window.devicePixelRatio || 1); // (launch styles the canvas too; the observer corrects it)
  // the page keeps the keyboard: the core only hears what we press for it
  o.canvas.tabIndex = -1;
  o.canvas.blur();
  const held = new Map<number, Set<PadButton>>();
  let dest: MediaStreamAudioDestinationNode | null = null;
  let heard = -1;
  // EmulatorJS-built cores take buttons straight in (and save their own way)
  const mod = n.getEmscriptenModule() as unknown as EjsModule;
  const ejs = typeof mod._simulate_input === "function";
  // the pads the core reads (after launch: Nostalgist announces real pads as
  // GamepadEvents, which only take real ones); per port, the standard
  // mapping's buttons as bits and the sticks −1…1
  const unplug = installVirtualPads(2);
  const vbits = [0, 0, 0];
  const vsticks = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const send = (port: number, button: PadButton, down: boolean) => {
    if (ejs) return mod._simulate_input(port - 1, RETROPAD[button], down ? 1 : 0);
    const b = 1 << STD[button];
    vbits[port] = down ? vbits[port] | b : vbits[port] & ~b;
    setVirtualPad(port, vbits[port], vsticks[port]);
  };
  // the core's audio context: OpenAL's, else whichever got tapped since launch
  const mine = (): BaseAudioContext | null => {
    const al = n.getEmscriptenAL() as { currentCtx?: { audioCtx: AudioContext } } | null;
    const ctx = al?.currentCtx?.audioCtx;
    if (ctx && taps.get(ctx)) return ctx;
    for (const c of contexts()) if (!before.has(c) && taps.get(c)) return c;
    return null;
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
      if (port === 1 || port === 2) emu.sticks(port, [0, 0, 0, 0]);
    },
    sticks(port, s) {
      if (ejs || (port !== 1 && port !== 2)) return;
      vsticks[port] = s.map((v) => v / STICK_MAX);
      setVirtualPad(port, vbits[port], vsticks[port]);
    },
    analog(port) {
      if (o.system !== "ps1" || ejs || (port !== 1 && port !== 2)) return;
      pulseVirtualPad(
        port,
        ANALOG_COMBO.reduce((n, b) => n | (1 << STD[b]), 0),
      );
    },
    onRumble(f) {
      for (const p of [1, 2]) onRumble(p, f ? (r) => f(p, r) : null);
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
      const ctx = mine();
      dest = (ctx && taps.get(ctx)) || null;
      return dest?.stream ?? null;
    },
    volume(v) {
      if (v === heard) return;
      const ctx = mine();
      const ear = ctx && ears.get(ctx);
      if (!ear) return;
      heard = v;
      ear.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    },
    emscripten: () => n.getEmscriptenModule(),
    exit() {
      sizing.disconnect();
      emu.onRumble(null);
      unplug();
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
