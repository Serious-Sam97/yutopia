import { spDay } from "./clock.ts";

// The weather over the Grounds (docs/plan/27-the-grounds.md, the mood):
// blizzard spells timed by the server, so everyone is in the same storm. The
// schedule is a function of the clock (an hour's window at a time, seeded by
// its number); the server puts where it is into the room's state each second
// (an admin can call one up or send it off), the clients ease towards it.

export const STORM_WINDOW_MS = 60 * 60_000;
const RAMP_MS = 90_000; // how long a storm takes to come up (and to die down)

function hash(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** The storm in window `w` (its number since the epoch), or null: when it starts
 *  and stops (ms into the window). About every other hour, 6 to 14 minutes. */
export function stormIn(w: number): { from: number; to: number } | null {
  if (hash(w * 3 + 1) > 0.5) return null;
  const len = (6 + hash(w * 3 + 2) * 8) * 60_000;
  const from = hash(w * 3 + 3) * (STORM_WINDOW_MS - len - RAMP_MS);
  return { from, to: from + len };
}

/** How hard it's storming at `ms` (server time): 0 calm … 1 a blizzard. */
export function stormAt(ms: number): number {
  const w = Math.floor(ms / STORM_WINDOW_MS);
  const s = stormIn(w);
  if (!s) return 0;
  const t = ms - w * STORM_WINDOW_MS;
  if (t < s.from || t > s.to + RAMP_MS) return 0;
  const up = Math.min(1, (t - s.from) / RAMP_MS);
  const down = Math.min(1, Math.max(0, (s.to + RAMP_MS - t) / RAMP_MS));
  const k = Math.min(up, down);
  return k * k * (3 - 2 * k);
}

/** Where the wind blows from (radians, building coords: 0 = from the west,
 *  blowing east); it backs slowly round over the hours. */
export function windAt(ms: number): number {
  const h = ms / 3_600_000;
  return 0.6 + Math.sin(h * 0.37) * 0.9 + Math.sin(h * 0.11 + 2) * 0.5;
}

// ── the morning fog (docs/plan/64-the-fog.md) ──
// Most mornings: a mist, a fog (a haze, thickest in the low places) or now and then the thick
// one, a wall (Silent Hill's). Which one is the day's (São Paulo's, so everyone wakes up in the
// same one); how much of it there is, the hour's: it forms in the dark from 4:00, is thickest
// round sunrise and burns off through the morning, later the thicker it is. The server puts
// it in the room's state each second (an admin can call one up or send it off).

export type FogKind = "mist" | "fog" | "thick";
export const FOG_KINDS: readonly FogKind[] = ["mist", "fog", "thick"];

// each kind: its share of the mornings, its haze at its height, and when it burns off (h)
const FOG: Record<FogKind, { share: number; haze: number; off: [number, number] }> = {
  mist: { share: 0.3, haze: 0.45, off: [7.5, 9.75] },
  fog: { share: 0.25, haze: 1, off: [7.75, 10.5] },
  thick: { share: 0.15, haze: 1, off: [8, 11] },
};

/** The morning on São Paulo's day `day` (clock.ts spDay): its kind and how thick within it
 *  (0.7 … 1), or null: a clear one. About 30% clear, 30% a mist, 25% a fog, 15% thick. */
export function fogOn(day: number): { kind: FogKind; k: number } | null {
  let r = hash(day * 5 + 7);
  for (const kind of FOG_KINDS) {
    if (r < FOG[kind].share) return { kind, k: 0.7 + 0.3 * hash(day * 5 + 8) };
    r -= FOG[kind].share;
  }
  return null;
}

/** How much of a `kind` of fog there is at `hour`, 0 … 1: up over 4:00–6:00, all of it till it
 *  burns off, gone after. */
export function fogCurve(kind: FogKind, hour: number): number {
  const [a, b] = FOG[kind].off;
  const s = (t: number) => {
    const k = Math.min(1, Math.max(0, t));
    return k * k * (3 - 2 * k);
  };
  return Math.min(s((hour - 4) / 2), s((b - hour) / (b - a)));
}

/** How far a `kind` of fog has lifted at `hour`, 0 … 1: none while it forms and holds, all of it
 *  by the time it's gone — burning off, its floor rises, the ground clearing first and the tree
 *  tops and the HQ's roof last (docs/plan/64-the-fog.md, F1). */
export function fogLift(kind: FogKind, hour: number): number {
  const [a, b] = FOG[kind].off;
  const k = Math.min(1, Math.max(0, (hour - a) / (b - a)));
  return hour < 4 ? 0 : k * k * (3 - 2 * k);
}

/** The fog as the 3D view draws it: `haze` (0 … 1, the height fog: ~150 m at 1, thicker low
 *  down), `wall` (0 … 1, the thick one's: ~15 m at 1, at any height) and `lift` (0 … 1: how far
 *  the haze's floor has risen off the ground as it burns off). A mist is a haze at 0.45; a fog
 *  all of it; a thick one all of it and the wall. */
export interface Fog {
  haze: number;
  wall: number;
  lift: number;
}
export const NO_FOG: Fog = { haze: 0, wall: 0, lift: 0 };

/** A kind of fog at its height (an admin's called one: on the ground, not lifting), or none. */
export function fogOf(kind: FogKind | null, k = 1, lift = 0): Fog {
  if (!kind) return NO_FOG;
  return { haze: FOG[kind].haze * k, wall: kind === "thick" ? k : 0, lift };
}

/** The fog on São Paulo's `day` at the world's `hour` (state.hour: an hour an admin set
 *  brings that morning's fog with it). */
export function fogAt(day: number, hour: number): Fog {
  const m = fogOn(day);
  if (!m) return NO_FOG;
  const k = m.k * fogCurve(m.kind, hour);
  return k > 0 ? fogOf(m.kind, k, fogLift(m.kind, hour)) : NO_FOG;
}

/** The rime on the trees (docs/plan/64-the-fog.md, F6), 0 … 1: freezing fog leaves it through
 *  the morning — a mist a little, a thick one all of it — and it stays till noon, gone by 13:30. */
export function rimeAt(day: number, hour: number): number {
  const m = fogOn(day);
  if (!m) return 0;
  const s = (t: number) => {
    const k = Math.min(1, Math.max(0, t));
    return k * k * (3 - 2 * k);
  };
  const peak = { mist: 0.35, fog: 0.75, thick: 1 }[m.kind] * m.k;
  return peak * Math.min(s((hour - 5) / 3.5), 1 - s((hour - 12) / 1.5));
}

/** This morning's (São Paulo's day at `ms`), as the schedule has it: for the admins' panel. */
export const fogToday = (ms: number) => fogOn(spDay(ms));
