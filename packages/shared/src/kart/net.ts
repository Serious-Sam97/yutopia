// The karts on the wire (docs/plan/46-the-karts.md, K-M3): your kart is yours — your client drives
// it and sends where it is 20×/s; the server checks it's a kart that could be there and counts its
// laps. Items, crates, hits, places and the clock are the server's.

import { KART, type KartSpec } from "./sim.ts";

export const KART_HZ = 20;
/** Karts a race or a battle takes. */
export const KART_SLOTS = 8;
/** How near the desk (or the rack) you take a kart, metres. */
export const KART_REACH = 6;
/** A Grand Prix's laps, a battle's length. */
export const KART_LAPS = [1, 3, 5] as const;
export const BATTLE_MS = 180_000;
/** The lights: one a second, out a light's time after the fifth (always: the start's a thing you
 *  time, as Mario Kart's count — kartStart). */
export const LIGHT_MS = 1000;
export const GO_MS = 5 * LIGHT_MS;
/** The start (docs/plan/46-the-karts.md, "The start"): `early` how long before the lights went out
 *  the throttle went down and stayed down (s; −1: not down). Down from just before the fourth light
 *  (2.25 s) to a little after the fifth (0.8 s), a rocket start; later, to 0.25 s, a smaller one;
 *  held from before the fourth, the engine floods (bogged off the line). */
export function kartStart(early: number): "rocket" | "good" | "go" | "flooded" {
  if (early < 0) return "go";
  if (early > 2.25) return "flooded";
  if (early >= 0.8) return "rocket";
  return early >= 0.25 ? "good" : "go";
}
/** The engine's revs on the grid, the throttle held `held` s (−1: not): up to near the limiter in
 *  ~0.6 s; held too long (flooding), bouncing off it. Minus when flooded (as the slots say it). */
export function gridRevs(held: number, t: number): number {
  if (held < 0) return 0;
  if (held > 2.25) return -(0.84 + 0.1 * Math.abs(Math.sin(t * 17)));
  const u = Math.min(1, held / 0.6);
  return 0.3 + 0.6 * (1 - (1 - u) * (1 - u)) + 0.03 * Math.sin(t * 23);
}
/** At the flag: how long the others have after the winner, how long the results stay up. */
export const LAST_ONE_MS = 25_000;
export const RESULTS_MS = 9000;
/** The lobby: once someone's ready, the race starts this long after; everyone ready, sooner. */
export const READY_MS = 20_000;
export const ALL_READY_MS = 3000;
/** A battle's smash: back after this long, blinking (no one can hit you) this long. */
export const SMASH_MS = 2000;
export const BLINK_MS = 1500;
/** The kart colours on the rack (and their trim), in slot order. */
export const KART_COLOURS: [string, string][] = [
  ["#b5562f", "#f3ead6"],
  ["#2f4a3b", "#e8a33d"],
  ["#e8a33d", "#2a2018"],
  ["#3d4a5c", "#f3ead6"],
  ["#6b2430", "#e8a33d"],
  ["#cdbf9f", "#b5562f"],
  ["#4a5a73", "#f3ead6"],
  ["#20262c", "#e8a33d"],
];

/** A kart's state as its driver sends it. */
export interface KartWire {
  /** sequence */
  q: number;
  x: number;
  y: number;
  z: number;
  a: number;
  vx: number;
  vy: number;
  vz: number;
  /** the wheel, the drift (−1/0/1), the spark tier, boost left (s), spun out left (s) */
  st: number;
  d: number;
  tr: number;
  b: number;
  sp: number;
  air: boolean;
  /** a trick in the air (off the jump) */
  tk?: boolean;
  /** on the grid: the engine's revs (gridRevs) */
  rv?: number;
}

/** Why a report isn't one a kart could make (null: it could). `dt` seconds since the last one. */
export function implausibleKart(
  prev: { x: number; z: number; vx: number; vz: number } | null,
  w: KartWire,
  dt: number,
  s: KartSpec = KART,
): string | null {
  for (const v of [w.x, w.y, w.z, w.a, w.vx, w.vy, w.vz]) if (!Number.isFinite(v)) return "nan";
  const v = Math.hypot(w.vx, w.vz);
  // (a boost, a plough, a turbo's kick on a boost pad: the fastest a kart goes, and some slack)
  if (v > s.vmax * 1.6 + 2) return "speed";
  if (!prev) return null;
  const t = Math.max(0.03, Math.min(1.5, dt));
  const moved = Math.hypot(w.x - prev.x, w.z - prev.z);
  const could = (Math.max(v, Math.hypot(prev.vx, prev.vz)) + 4) * t + 1.5;
  if (moved > could) return "jump";
  return null;
}
