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
} as const;

export type GameSystem = keyof typeof SYSTEMS;
export const isSystem = (s: unknown): s is GameSystem => typeof s === "string" && Object.hasOwn(SYSTEMS, s);

// Which catalog item is which console.
export const CONSOLES: Record<string, GameSystem> = {
  console_2600: "2600",
  console_nes: "nes",
  console_snes: "snes",
  console_md: "md",
  console_gb: "gb",
};
export const isConsole = (kind: string): boolean => Object.hasOwn(CONSOLES, kind);

export const PAD_BUTTONS = ["up", "down", "left", "right", "a", "b", "x", "y", "l", "r", "start", "select"] as const;
export type PadButton = (typeof PAD_BUTTONS)[number];
export const isPadButton = (b: unknown): b is PadButton =>
  typeof b === "string" && (PAD_BUTTONS as readonly string[]).includes(b);

// A cable from a console reaches a TV this far (tiles between their footprints).
export const CABLE_REACH = 4;
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
