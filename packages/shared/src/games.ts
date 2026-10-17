// The game room (docs/plan/09-game-room.md): the consoles, what they play, how
// you plug them into a TV, and the buttons on their pads. Shared by the client
// (emulator, panels), the world-server (rules) and the library checks.

export const SYSTEMS = {
  "2600": {
    label: "Woodgrain console",
    core: "stella2014",
    ext: ["a26", "bin"],
    maxBytes: 64 * 1024,
    ports: 2,
    // the pad's buttons, in the order the panel shows them
    buttons: ["up", "down", "left", "right", "b", "start", "select"],
  },
  nes: {
    label: "8-bit console",
    core: "fceumm",
    ext: ["nes"],
    maxBytes: 1024 * 1024,
    ports: 2,
    buttons: ["up", "down", "left", "right", "a", "b", "start", "select"],
  },
  snes: {
    label: "16-bit console",
    core: "snes9x",
    ext: ["sfc", "smc"],
    maxBytes: 8 * 1024 * 1024,
    ports: 2,
    buttons: ["up", "down", "left", "right", "a", "b", "x", "y", "l", "r", "start", "select"],
  },
  md: {
    label: "16-bit console (black)",
    core: "genesis_plus_gx",
    ext: ["md", "gen", "bin", "smd"],
    maxBytes: 8 * 1024 * 1024,
    ports: 2,
    // A B C map to the pad's y b a (the core's 3-button layout), start
    buttons: ["up", "down", "left", "right", "y", "b", "a", "start"],
  },
  gb: {
    label: "Handheld on the TV",
    core: "gambatte",
    ext: ["gb", "gbc"],
    maxBytes: 8 * 1024 * 1024,
    ports: 1,
    buttons: ["up", "down", "left", "right", "a", "b", "start", "select"],
  },
  // the disc console (docs/plan/23-disc-console.md): a disc is one .chd / .pbp /
  // .iso or a .cue with its .bin tracks (discFits); it needs the team's BIOS
  ps1: {
    label: "32-bit disc console",
    core: "pcsx_rearmed",
    ext: ["chd", "pbp", "cue", "bin", "iso"],
    maxBytes: 900 * 1024 * 1024,
    ports: 2,
    // ✕ ○ □ △ are the pad's b a y x (where they sit)
    buttons: ["up", "down", "left", "right", "b", "a", "y", "x", "l", "r", "l2", "r2", "l3", "r3", "start", "select"],
  },
} as const;

export type GameSystem = keyof typeof SYSTEMS;
// Consoles that play discs: big, maybe several files, brought in chunks.
export const DISC_SYSTEMS: readonly GameSystem[] = ["ps1"];
export const isDiscSystem = (s: string): boolean => (DISC_SYSTEMS as readonly string[]).includes(s);
export const isSystem = (s: unknown): s is GameSystem => typeof s === "string" && Object.hasOwn(SYSTEMS, s);

// Which catalog item is which console.
export const CONSOLES: Record<string, GameSystem> = {
  console_2600: "2600",
  console_nes: "nes",
  console_snes: "snes",
  console_md: "md",
  console_gb: "gb",
  console_ps1: "ps1",
  console_ps1_slim: "ps1",
};
export const isConsole = (kind: string): boolean => Object.hasOwn(CONSOLES, kind);

// (the bits of a pad's mask, in this order: new buttons only ever go at the end)
export const PAD_BUTTONS = [
  "up",
  "down",
  "left",
  "right",
  "a",
  "b",
  "x",
  "y",
  "l",
  "r",
  "start",
  "select",
  "l2",
  "r2",
  "l3",
  "r3",
] as const;
export type PadButton = (typeof PAD_BUTTONS)[number];
export const isPadButton = (b: unknown): b is PadButton =>
  typeof b === "string" && (PAD_BUTTONS as readonly string[]).includes(b);
export const PAD_BITS_MAX = (1 << PAD_BUTTONS.length) - 1;
// Pads with sticks (docs/plan/23-disc-console.md P4): their two sticks travel
// with the buttons as [lx, ly, rx, ry], each −127…127 (0 at rest).
export const hasSticks = (system: string): boolean => system === "ps1";
export const STICK_MAX = 127;
export const sticksFit = (a: unknown): a is number[] =>
  Array.isArray(a) && a.length === 4 && a.every((v) => Number.isInteger(v) && v >= -STICK_MAX && v <= STICK_MAX);
// The disc console's pad: held together, these switch its analog mode (the
// core's pcsx_rearmed_analog_combo "l1+r1+l3")
export const ANALOG_COMBO: readonly PadButton[] = ["l", "r", "l3"];

// A cable from a console reaches a TV this far (tiles between their footprints).
export const CABLE_REACH = 4;
// The TVs a console plugs into: the CRT (made for it) and the media screens —
// the console TV, the wall and HD TVs, the giant TV and the cinema screen —
// which keep their own TV input (YouTube / Jellyfin) as well.
export const GAME_TVS = ["crt_tv", "tv_console", "tv_wall", "tv_hd", "tv_giant", "cinema_screen"] as const;
export const isGameTv = (kind: string): boolean => (GAME_TVS as readonly string[]).includes(kind);
// the shape of a console's picture (letterboxed on a wide TV)
export const GAME_ASPECT = 4 / 3;
// TVs have two inputs (AV1, AV2).
export const TV_INPUTS = 2;
// You take a pad standing this near the console (its cord's length).
export const PAD_REACH = 3.2;
// How many TVs may stream at once in a space (bandwidth).
export const MAX_LIVE_TVS = 3;

// The distance between two footprints (0 when they touch or overlap).
export function gap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

// A game's file name is fine for a console (by its extension) and size.
export function romFits(system: GameSystem, name: string, bytes: number): boolean {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const s = SYSTEMS[system];
  return (s.ext as readonly string[]).includes(ext) && bytes > 0 && bytes <= s.maxBytes;
}

// A disc's files (the same rules as Yondra's YutopiaGameSystems::filesFit):
// one .chd / .pbp / .iso, or a .cue with its .bin tracks; the whole under the
// console's size. null when they make a disc, else why not — and the files in
// the order the core wants them (the .cue first).
export function discFits(
  system: GameSystem,
  files: readonly { name: string; size: number }[],
): { why: string | null; ordered: { name: string; size: number }[] } {
  const ext = (n: string) => n.toLowerCase().split(".").pop() ?? "";
  const s = SYSTEMS[system];
  const no = (why: string) => ({ why, ordered: [] });
  if (!files.length) return no("Pick the disc's files.");
  if (files.some((f) => !(s.ext as readonly string[]).includes(ext(f.name)))) return no("Those aren't a disc's files.");
  if (files.reduce((n, f) => n + f.size, 0) > s.maxBytes) return no("That disc is too big.");
  const cues = files.filter((f) => ext(f.name) === "cue");
  if (cues.length > 1) return no("One disc at a time: one .cue.");
  if (cues.length === 1) {
    const tracks = files.filter((f) => ext(f.name) === "bin");
    if (!tracks.length || tracks.length !== files.length - 1) return no("A .cue comes with its .bin tracks.");
    return { why: null, ordered: [cues[0], ...tracks] };
  }
  if (files.length > 1) return no("A disc in several files needs its .cue.");
  if (ext(files[0].name) === "bin") return no("A .bin needs its .cue (or bring the disc as .chd).");
  return { why: null, ordered: [...files] };
}

// A cartridge: "b:<slug>" ships with Yutopia (shared/library.ts), "u:<id>" a
// team uploaded to its space (Yondra).
export const GAME_ID = /^(b:[a-z0-9-]{1,32}|u:\d{1,10})$/;

export interface GameInfo {
  id: string;
  system: GameSystem;
  title: string;
  color: string; // the cartridge's label colour
  builtIn: boolean; // ships with Yutopia (open licence) vs uploaded by the team
  author?: string;
  license?: string;
  players: number;
  bytes: number;
  mine?: boolean; // uploads: I brought it (I can take it away)
  // uploads: its files in the order the core gets them (a disc: the .cue, its
  // tracks) and its hash (what a browser keeps it under)
  files?: { name: string; bytes: number }[];
  sha1?: string;
}

// Where the picture is on a CRT TV (rot-0 local tiles on its 2 × 1 footprint,
// z in px): the glass on its front face (+y). The art draws the tube around it;
// the engine puts the live picture on it.
export const TV_SCREEN = { x0: 0.48, x1: 1.32, y: 0.79, z0: 18, z1: 42 } as const;

// A rot-0 local point on a w × h footprint, turned like the items' drawings
// (90° clockwise steps, the same turn as `Sketch.rp`).
export function turnLocal(x: number, y: number, rot: number, w: number, h: number): [number, number] {
  let X = x;
  let Y = y;
  let W = w;
  let H = h;
  for (let i = 0; i < (rot & 3); i++) {
    [X, Y] = [H - Y, X];
    [W, H] = [H, W];
  }
  return [X, Y];
}
