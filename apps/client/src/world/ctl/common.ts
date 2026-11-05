import { type JumpTrack, parseAvatar } from "@yutopia/shared";
import type { Pet } from "@yutopia/state";

// What the controller and its features share (plan 72 phase 4).
export const VORTEX_LOOK = parseAvatar({
  body: "slim",
  skin: "#9aa67e",
  hair: "mohawk",
  hairColor: "#c4402b",
  top: "jacket",
  topColor: "#2a2420",
  bottom: "trousers",
  bottomColor: "#1c1410",
  accessory: "glasses",
  accessoryColor: "#ffa630",
});

// A pet's look, clothes and needs as the server keeps them (it cleans them on the way in).
export const petNeeds = (pet: Pet) => ({
  food: pet.food,
  water: pet.water,
  energy: pet.energy,
  fun: pet.fun,
  health: pet.health,
});

export function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export const INTERACT_RANGE = 1.7;
/** A lock-on's reach (tiles), and how long it holds on out of it (ms): docs/plan/56-the-controls.md E */

export interface Remote {
  level: number; // the floor they're on (their coords are that floor's)
  buf: Sample[];
  off: number; // their clock to mine: the lowest gap seen (NaN: none yet)
  verbAt: number; // when their last verb shows (as late as they're drawn)
  offAt: number;
  jumpKey: string; // their last jump (kind|server ms), timed from when it showed up here
  track: JumpTrack;
  flow: number; // their Flowmotion move (Player.flow) and when it shows here
  flowAt: number;
  carried?: boolean; // in a car last frame (out of it: their feet heard down)
}

export const INTERP_MS = 110;

// someone as they were at a moment of their own clock, put on mine (docs/plan/29-the-move.md M7)
export interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  a: number;
  mv: number;
  yaw: number;
}

/** How hard it's raining (0 … 1) by the room's weather: what the view draws and the sound plays. */
export function rainOf(w: { kind?: string; fall?: number }, storm: number): number {
  return w.kind === "rain" || w.kind === "sleet" ? Math.min(1, Math.max(storm, (w.fall ?? 0) * 1.5)) : 0;
}
