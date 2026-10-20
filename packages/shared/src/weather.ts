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
