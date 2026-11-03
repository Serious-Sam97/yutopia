import { spDay, spHour } from "./clock.ts";

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

// ── the sky's schedule (docs/plan/65-the-weather.md, W1) ──
// A front at a time, not a die a day: two slow curves of the clock — how warm the air is and how
// much the sky holds — each a smooth noise over the hours (seeded, so the same for everyone at any
// time, with no history). When the sky holds enough, it comes down; snow, sleet or rain by the
// temperature, which is the front's plus the hour's. A storm window (stormAt) is a front's gust:
// a blizzard on a snowy day, a downpour on a wet one, nothing when it's dry.

export type SkyKind = "clear" | "cloudy" | "rain" | "sleet" | "snow";
export const SKY_KINDS: readonly SkyKind[] = ["clear", "cloudy", "rain", "sleet", "snow"];

/** The sky at a moment: what it's doing, how hard it's coming down (0 … 1), the air (°C), the
 *  cloud (0 … 1), how wild (the storm window's, only while it's coming down) and the thunder
 *  (0 … 1: a storm window in warm rain). */
export interface Sky {
  kind: SkyKind;
  fall: number;
  temp: number;
  cloud: number;
  storm: number;
  thunder: number;
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** A smooth noise over a line: a random height at each whole `x`, eased between (the quintic, so
 *  neither it nor its slope jumps). */
function line(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i * 7919 + seed);
  const b = hash((i + 1) * 7919 + seed);
  return a + (b - a) * f * f * f * (f * (f * 6 - 15) + 10);
}

const HOUR = 3_600_000;

/** How warm the front is at `ms`, 0 … 1: cold and mild spells of a few days, turning within a day. */
export function warmthAt(ms: number): number {
  const h = ms / HOUR;
  return 0.7 * line(h / 44, 101) + 0.3 * line(h / 11, 211);
}

/** How much the sky holds at `ms`, 0 … 1: over WET_FALL it's coming down. Wet spells of a day or
 *  two, dry ones of days. */
export function wetAt(ms: number): number {
  const h = ms / HOUR;
  return 0.8 * line(h / 22, 307) + 0.2 * line(h / 5, 401);
}

// The lines (set against 10,000 days, weather.test.ts): clouds over WET_CLOUD, coming down over
// WET_FALL — ~35% clear, ~32% cloudy (the dry whiles between showers too), ~16% raining, ~4% sleet,
// ~13% snowing (most of it in spells of days).
export const WET_CLOUD = 0.4;
export const WET_FALL = 0.55;
const COLD = -9.5; // °C, the coldest front's
const MILD = 16.5; // the mildest's
export const SNOW_BELOW = 0.5; // °C: snow under it, sleet to SLEET_BELOW, rain over
export const SLEET_BELOW = 2;

/** The air at `ms` in °C: the front's warmth, and the hour's (São Paulo's: coldest about 6:00,
 *  warmest at 15:00, ±4 °C under a clear sky, ±1.6 under cloud). */
export function tempAt(ms: number, cloud = cloudOf(wetAt(ms))): number {
  const h = spHour(ms);
  // up from 6:00 to 15:00, down over the 15 hours after: a cosine each way (no jump, no kink)
  const day = Math.cos(Math.PI * (h >= 6 && h < 15 ? (h - 15) / 9 : ((h + 9) % 24) / 15));
  return COLD + (MILD - COLD) * warmthAt(ms) + 4 * (1 - 0.6 * cloud) * day;
}

const cloudOf = (wet: number) => smooth(WET_CLOUD - 0.1, WET_FALL, wet);

/** The water's warmth at `ms` in °C (docs/plan/66-the-water.md, S3): the air's over the day before,
 *  slow to follow it (a mean of its last 24 hours, every two), never under 1 °C while it's open. */
export function waterTempAt(ms: number): number {
  let sum = 0;
  for (let k = 0; k < 12; k++) sum += tempAt(ms - k * 2 * HOUR);
  return Math.max(1, sum / 12);
}

// The rain comes in showers (the user's, 2026-11-03: a front of two days rained 42 h without a
// stop): within a wet front a third, quicker line says whether a shower's on — ~4 h (11 h at the
// most, as a rule), a dry while of ~2½ h between under the same cloud, shorter the harder the front
// — and how hard, heavy only near its top. The snow keeps falling as the front has it.
const SHOWER_ON = [0.38, 0.3]; // the line over it is a shower: a weak front's, the hardest's
const SHOWER_EDGE = 0.4; // how far over that it's all on (its coming and going, ~20–60 min)
const SHOWER_HEAVY = 0.75; // how far over it it's at its heaviest

/** How much of a front's rain is falling at `ms`, 0 (a dry while) … 1 (a heavy shower), in a front
 *  of `hard` (0 … 1). */
export function showerAt(ms: number, hard: number): number {
  const h = ms / HOUR;
  const s = 0.8 * line(h / 2.6, 503) + 0.2 * line(h / 1.4, 607);
  const on = SHOWER_ON[0] + (SHOWER_ON[1] - SHOWER_ON[0]) * hard;
  const heavy = smooth(on + SHOWER_EDGE / 2, on + SHOWER_HEAVY, s);
  return smooth(on, on + SHOWER_EDGE, s) * (0.45 + 0.55 * heavy);
}

/** The sky at `ms` (server time), as the schedule has it. */
export function skyAt(ms: number): Sky {
  const wet = wetAt(ms);
  const cloud = cloudOf(wet);
  const temp = tempAt(ms, cloud);
  // light as it starts (in the half hour or so the line takes), steady soon after, hard at the top
  // of a front; never a jump
  const front =
    wet > WET_FALL
      ? 0.15 * smooth(WET_FALL, WET_FALL + 0.02, wet) + 0.85 * smooth(WET_FALL, WET_FALL + 0.2, wet)
      : 0;
  // (the rain in showers, the snow as the front has it: sleet between)
  const showers = smooth(SNOW_BELOW, SLEET_BELOW, temp);
  const falling =
    showers > 0 ? front * (1 - showers + showers * showerAt(ms, smooth(WET_FALL, WET_FALL + 0.25, wet))) : front;
  // (a dry while between showers is a cloudy sky)
  const coming = wet > WET_FALL && (showers === 0 || falling > 0.02);
  const fall = coming ? falling : 0;
  const kind: SkyKind = !coming
    ? wet > WET_CLOUD
      ? "cloudy"
      : "clear"
    : temp < SNOW_BELOW
      ? "snow"
      : temp < SLEET_BELOW
        ? "sleet"
        : "rain";
  const storm = coming ? stormAt(ms) * smooth(0.2, 0.6, fall) : 0;
  return { kind, fall, temp, cloud, storm, thunder: thunderOf(kind, storm, temp) };
}

/** A thunderstorm's lightning (W7): the same for everyone, by the clock — in 7 s slots, a hash says
 *  whether one strikes in it (more often the more thunder: a quarter of them at the least, three in
 *  four at the most) and when. The slot and the moment in it, or null.
 *  (sky.ts flashes it, grounds-sound.ts thunders it: docs/plan/65-the-weather.md W7, W8) */
export function strikeIn(ms: number, thunder: number): { slot: number; at: number } | null {
  if (thunder <= 0.05) return null;
  const slot = Math.floor(ms / 7000);
  // (the integer hash: exact in every browser, as Math.sin isn't bound to be)
  if (hash(slot) >= 0.25 + 0.5 * thunder) return null;
  return { slot, at: slot * 7000 + Math.floor(hash(slot ^ 0x5bd1e995) * 7000) };
}
/** How far off a slot's strike is, 0 (overhead) … 1 (km off): the same for everyone. Its flash
 *  dimmer, its thunder later and duller the farther. */
export function strikeFar(slot: number): number {
  return hash(slot ^ 0x2545f491);
}

/** The thunder in a storm (0 … 1): a downpour's, when the air's warm (~7–11 °C and over). */
export const thunderOf = (kind: SkyKind, storm: number, temp: number): number =>
  kind === "rain" ? storm * smooth(7, 11, temp) : 0;

/** The daylight at São Paulo's `hour`, 0 … 1 (the sun on the snow, the drying). */
export function sunAt(hour: number): number {
  return Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12.5));
}

// ── what lies on the ground (W2) ──
// Four numbers of the world, 0 … 1, stepped by one rule: the server each second from where it is
// (so an admin's snow lies and melts by it after), `groundAt` by replaying the schedule.

export interface Ground {
  snow: number; // snow lying: white at 1
  wet: number; // how wet things are
  puddles: number;
  ice: number; // the pond's and the river's
}
export const DRY: Ground = { snow: 0, wet: 0, puddles: 0, ice: 0 };

// The speeds (the user's: hours), per hour
const SNOW_IN = 0.5; // × fall: white in ~2½ h of steady snow (fall 0.8)
const BLIZZARD = 1.7; // × storm, on top: ~45 min in a blizzard
const MELT = 0.025; // per °C over 0: ~8 h at +5 °C under cloud, ~5 h in the sun
const WET_IN = 2.2; // × fall: soaked in ~30 min of rain
const DRY_OUT = 0.35; // ~3 h on a grey day, ~1 h in the sun (and faster in the wind)
const POOL = 1.3; // puddles: after ~30 min of real rain, full in ~45 min more
const DRAIN = 0.3; // gone in ~3 h after it stops
const FREEZE = 1 / 6; // the ice: ~6 h at −4 °C
const THAW = 1 / 4; // ~4 h at +4 °C

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** The ground `dtMs` on from `g` under `sky` at São Paulo's `hour`. */
export function stepGround(g: Ground, sky: Sky, hour: number, dtMs: number): Ground {
  const dt = dtMs / HOUR;
  const sun = sunAt(hour) * (1 - sky.cloud);
  const snowing = sky.kind === "snow" ? sky.fall : 0;
  const raining = sky.kind === "rain" || sky.kind === "sleet" ? sky.fall : 0;
  // the snow: in while it snows (a wet snow near 0 °C settles slower), out above freezing (faster
  // in the sun and the rain)
  const settle = smooth(SNOW_BELOW, -1, sky.temp) * 0.6 + 0.4;
  let snow = g.snow + snowing * settle * (SNOW_IN + BLIZZARD * SNOW_IN * sky.storm) * dt;
  const melt = sky.temp > 0 ? (MELT * sky.temp * (1 + 0.5 * sun) + 0.06 * raining) * dt : 0;
  const melting = Math.min(snow, melt);
  snow -= melting;
  // the wet: rain soaks it, snow melting keeps it so; it dries in the sun and the wind, not when
  // it's freezing hard
  const thawing = g.snow > 0.02 && sky.temp > 0 ? 0.7 : 0;
  let wet = g.wet + WET_IN * raining * dt;
  if (wet < thawing) wet = Math.min(thawing, wet + 1.5 * dt);
  if (!raining && wet > thawing) {
    const drying = DRY_OUT * (1 + 1.6 * sun + 0.8 * sky.storm) * (sky.temp < -2 ? 0.3 : 1) * dt;
    wet = Math.max(thawing, wet - drying);
  }
  // the puddles: once it's soaked and it's coming down (or a thaw's running off), drained after
  let puddles = g.puddles;
  if (g.wet > 0.85 && raining > 0.3) puddles += POOL * raining * dt;
  else if (thawing && melting > 0 && puddles < 0.5) puddles = Math.min(0.5, puddles + 0.3 * dt);
  else if (!raining) puddles -= DRAIN * (1 + sun) * dt;
  // the water's ice: hard frost freezes it, a thaw takes it
  let ice = g.ice;
  if (sky.temp < -2) ice += FREEZE * Math.min(2, -sky.temp / 4) * dt;
  else if (sky.temp > 2) ice -= THAW * Math.min(2, sky.temp / 4) * dt;
  return { snow: clamp01(snow), wet: clamp01(wet), puddles: clamp01(puddles), ice: clamp01(ice) };
}

export const REPLAY_MS = 4 * 24 * HOUR;
const REPLAY_STEP = 10 * 60_000;

/** The ground at `ms` as the schedule left it: the rule replayed from four days back, from bare
 *  (in 10-minute steps; anything older is gone, as a rule). */
export function groundAt(ms: number): Ground {
  return groundFrom(DRY, Math.floor((ms - REPLAY_MS) / REPLAY_STEP) * REPLAY_STEP, ms);
}

/** The ground at `to` from `g` at `from`, the schedule's sky over it (a saved ground brought up to
 *  now at the server's start; over four days apart, the replay's). */
export function groundFrom(g: Ground, from: number, to: number): Ground {
  if (to - from > REPLAY_MS + REPLAY_STEP) return groundAt(to); // (groundAt's own start is within a step of it)
  for (let t = from; t < to; t += REPLAY_STEP) {
    const dt = Math.min(REPLAY_STEP, to - t);
    g = stepGround(g, skyAt(t + dt / 2), spHour(t + dt / 2), dt);
  }
  return g;
}

// ── an admin's call (W10) ──
// The World panel's weather: called for a while (shared admin.ts WEATHER_CALL_MS), the air left
// as the schedule has it (a snow made cold enough to be snow, a rain warm enough to be rain).

export type WeatherCall = "clear" | "cloudy" | "rain" | "snow" | "storm";
export const WEATHER_CALLS: readonly WeatherCall[] = ["clear", "cloudy", "rain", "snow", "storm"];

/** The sky an admin called, over the schedule's `base` (its air). A storm's a blizzard or a downpour
 *  by the air, with thunder in a warm one. */
export function calledSky(to: WeatherCall, base: Sky): Sky {
  const calm = { storm: 0, thunder: 0 };
  if (to === "clear") return { ...base, ...calm, kind: "clear", fall: 0, cloud: 0, temp: base.temp };
  if (to === "cloudy") return { ...base, ...calm, kind: "cloudy", fall: 0, cloud: 1 };
  const temp = to === "snow" ? Math.min(base.temp, -2) : to === "rain" ? Math.max(base.temp, 6) : base.temp;
  const kind: SkyKind = temp < SNOW_BELOW ? "snow" : temp < SLEET_BELOW ? "sleet" : "rain";
  if (to !== "storm") return { kind, fall: 0.8, temp, cloud: 1, ...calm };
  return { kind, fall: 1, temp, cloud: 1, storm: 1, thunder: thunderOf(kind, 1, temp) };
}

/** What the world saved of its weather (the API's world settings, `weather`): the ground then and
 *  when, and the call in force. */
export interface SavedWeather {
  snow: number;
  wet: number;
  puddles: number;
  ice: number;
  at: number;
  call: { to: WeatherCall; by: string; until: number } | null;
}

/** The weather at the server's start (`now`) from what it saved (anything, as it came back): the
 *  ground brought up to now by the rule under the schedule's sky, the call if it's still running.
 *  Nothing saved (or nothing sound), the schedule's replay and no call. */
export function weatherFrom(saved: unknown, now: number): { ground: Ground; call: SavedWeather["call"] } {
  const s = (saved ?? {}) as Partial<Record<keyof SavedWeather, unknown>>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : null);
  const g = { snow: n(s.snow), wet: n(s.wet), puddles: n(s.puddles), ice: n(s.ice) };
  const at = typeof s.at === "number" && Number.isFinite(s.at) && s.at > 0 && s.at <= now ? s.at : 0;
  const sound = at && g.snow !== null && g.wet !== null && g.puddles !== null && g.ice !== null;
  const ground = sound ? groundFrom(g as Ground, at, now) : groundAt(now);
  const c = (s.call ?? null) as { to?: unknown; by?: unknown; until?: unknown } | null;
  const call =
    c && WEATHER_CALLS.includes(c.to as WeatherCall) && typeof c.until === "number" && c.until > now
      ? { to: c.to as WeatherCall, by: typeof c.by === "string" ? c.by : "", until: c.until }
      : null;
  return { ground, call };
}

// ── the cold (W9) ──

/** How the air bites (stepVitals' `chill`): 1 at freezing (the night's warmth drain as it always
 *  was), none by +12 °C, up to 2 in a bitter cold; rain coming down on you colder still. */
export function chillOf(temp: number, rain = 0): number {
  return Math.min(2, Math.max(0, (12 - temp) / 12) + 0.35 * rain);
}
