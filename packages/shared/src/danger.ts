import { BUILDINGS, groundSurfaceAt, treeDensity } from "./grounds.ts";

// How dangerous it is out on the Grounds (docs/plan/30-the-dark.md, D1): what
// the shadowed's director spends (phase 4) and what the drone rises with. By
// day the land is uneasy, by night hunted; a blizzard and the woods make it
// worse, the HQ's doors keep some of it off. Inside the HQ, in a lamp's pool
// or a flare's, it's nothing at all. The town's buildings are not safe.

export interface DangerAt {
  /** the world's hour (shared clock.ts, the room's state) */
  hour: number;
  /** 0 calm … 1 a blizzard (shared weather.ts, the room's state) */
  storm: number;
  /** where (building coords, tiles: x east, z south) */
  x: number;
  z: number;
  /** in a lamp's pool (not in a blackout) or a flare's */
  lit: boolean;
  /** inside the headquarters (any floor) */
  inHQ: boolean;
}

export const DANGER_DAY = 0.2;
export const DANGER_NIGHT = 0.8;
// the hours it turns (shared with the light: art/daylight.ts's dawn and dusk)
const DAWN = [5, 7.5];
const DUSK = [17.5, 20.5];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How dark the hour is for danger: 0 day … 1 night, ramping at dawn and dusk. */
export function nightness(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  return h < 12 ? 1 - smooth(DAWN[0], DAWN[1], h) : smooth(DUSK[0], DUSK[1], h);
}

// the HQ's front doors (its west face, halfway along)
const HQ = BUILDINGS.find((b) => b.kind === "hq") as (typeof BUILDINGS)[number];
export const HQ_DOORS = { x: HQ.x0, z: (HQ.z0 + HQ.z1) / 2 };

/** The danger at a spot and an hour, 0..1. */
export function dangerAt(a: DangerAt): number {
  if (a.inHQ || a.lit) return 0;
  const base = DANGER_DAY + (DANGER_NIGHT - DANGER_DAY) * nightness(a.hour);
  const storm = 0.25 * Math.min(1, Math.max(0, a.storm));
  const woods = 1 + 0.3 * Math.min(1, treeDensity(a.x, a.z) / 0.95);
  const doors = 0.5 + 0.5 * smooth(40, 50, Math.hypot(a.x - HQ_DOORS.x, a.z - HQ_DOORS.z));
  return Math.min(1, (base + storm) * woods * doors);
}

// ── how many of the shadowed: the director's sum (world-server features/dark.ts) ──
// Per person out there, danger × PER_HEAD (night in the open: 4 each, the woods
// 5), CAP in all. Nights and storms only: by day they wait in nests instead
// (shared dark/nests.ts, docs/plan/31-the-day.md).
export const SHADOWED = { perHead: 5, cap: 60 };
const PATHS = new Set(["path", "asphalt", "walk", "floor"]);
/** On a road, a trail, a pavement, the lot (building coords, tiles). */
export function onPathAt(x: number, z: number): boolean {
  // (rough: no slope, so no land made for it — a path's a path on any slope)
  return PATHS.has(groundSurfaceAt(Math.floor(x) + 0.5, Math.floor(z) + 0.5, true));
}
/** How many a group may have round it: `people` of them, the danger at the group. */
export function shadowedWanted(people: number, danger: number): number {
  return people > 0 ? Math.min(SHADOWED.cap, Math.ceil(people * SHADOWED.perHead * danger)) : 0;
}

// ── blackouts: every lamp on the Grounds out for a few minutes ───────────────
// Timed like the storms (shared weather.ts): a window at a time, seeded by its
// number, so the server and everyone agree. Rare: one window in ten has one.
export const BLACKOUT_WINDOW_MS = 2 * 60 * 60_000;

function hash(n: number): number {
  let x = (n | 0) ^ 0x7f4a7c15;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** The blackout in window `w` (its number since the epoch), or null: when it
 *  starts and stops (ms into the window). 3 to 6 minutes. */
export function blackoutIn(w: number): { from: number; to: number } | null {
  if (hash(w * 3 + 1) > 0.1) return null;
  const len = (3 + hash(w * 3 + 2) * 3) * 60_000;
  const from = hash(w * 3 + 3) * (BLACKOUT_WINDOW_MS - len);
  return { from, to: from + len };
}

/** Are the lamps out at `ms` (server time)? Only after dark (by `hour`, the
 *  world's: an admin's hour counts): by day there's nothing to put out. */
export function blackoutAt(ms: number, hour: number): boolean {
  if (nightness(hour) < 0.5) return false;
  const w = Math.floor(ms / BLACKOUT_WINDOW_MS);
  const b = blackoutIn(w);
  const t = ms - w * BLACKOUT_WINDOW_MS;
  return !!b && t >= b.from && t < b.to;
}
