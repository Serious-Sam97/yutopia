// Time of day from the local clock: the ambient light every surface is
// multiplied by, the sun (colour + direction, for windows and the sky), how
// "night" it is (lamps, screens and bloom take over as it gets dark), and how
// dark it is out under the sky (docs/plan/44-the-night.md: indoors keeps
// `ambient`; outside, after dusk, only what a light lights is seen).

export type Phase = "night" | "dawn" | "morning" | "day" | "golden" | "dusk";
export type RGB = [number, number, number];

export interface Daylight {
  hour: number;
  phase: Phase;
  ambient: RGB; // 0..1 multiplier
  sun: { color: RGB; elevation: number; azimuth: number }; // radians; elevation < 0 = below the horizon
  night: number; // 0 day … 1 deep night
  window: RGB; // what windows add at full strength: sunlight by day, a little moonlight at night
  dark: number; // out under the sky: 0 by day … 1 pitch dark (21:30–5:00)
}

// [hour, ambient, sun colour, phase]
const KEYS: [number, RGB, RGB, Phase][] = [
  [0, [0.44, 0.46, 0.66], [0.55, 0.62, 0.9], "night"], // moonlight
  [5, [0.46, 0.47, 0.66], [0.6, 0.62, 0.88], "night"],
  [6.5, [0.8, 0.7, 0.72], [1, 0.62, 0.5], "dawn"],
  [8, [0.98, 0.95, 0.9], [1, 0.9, 0.75], "morning"],
  [10, [1, 1, 1], [1, 0.98, 0.92], "day"],
  [16, [1, 1, 0.98], [1, 0.95, 0.85], "day"],
  [17.5, [1, 0.9, 0.74], [1, 0.72, 0.4], "golden"],
  [19, [0.78, 0.62, 0.66], [0.98, 0.5, 0.36], "dusk"],
  [20.5, [0.5, 0.48, 0.66], [0.6, 0.55, 0.85], "night"],
  [24, [0.44, 0.46, 0.66], [0.55, 0.62, 0.9], "night"],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

export function daylight(hour: number): Daylight {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const [h0, a0, s0, p0] = KEYS[i];
  const [h1, a1, s1, p1] = KEYS[i + 1];
  const t = smooth((h - h0) / (h1 - h0));
  const ambient = a0.map((v, k) => lerp(v, a1[k], t)) as RGB;
  const color = s0.map((v, k) => lerp(v, s1[k], t)) as RGB;
  // sun: rises ~6:30 in the east, peaks at 13:00, sets ~19:30 in the west
  const day = (h - 6.5) / 13;
  const elevation = Math.sin(day * Math.PI) * 1.05;
  const azimuth = Math.PI * (0.25 + day); // east → south → west (over the city)
  const lum = ambient[0] * 0.3 + ambient[1] * 0.55 + ambient[2] * 0.15;
  const night = Math.max(0, Math.min(1, (1 - lum) / 0.52));
  // sunlight through a window: strongest with the sun up, warm and long at golden hour
  const up = Math.max(0, Math.sin(Math.max(0, day) * Math.PI));
  const k = elevation > 0 ? 0.16 + 0.22 * (1 - up) : 0.07;
  const window = color.map((v) => v * k) as RGB;
  return {
    hour: h,
    phase: t < 0.5 ? p0 : p1,
    ambient,
    sun: { color, elevation, azimuth },
    night,
    window,
    dark: darkAt(h),
  };
}

// The pitch dark: coming down over dusk (19:00–21:30), gone again over dawn (5:00–7:00) —
// slower than dusk and dawn themselves, or the two together were a jump.
function darkAt(h: number): number {
  if (h >= 21.5 || h < 5) return 1;
  if (h >= 19) return smooth((h - 19) / 2.5);
  if (h < 7) return smooth((7 - h) / 2);
  return 0;
}

// What's left of the sky's light outside at full dark, as a share of the night's
// before it (lamps, beams, headlights and lit windows aren't the sky's: they stay):
// the land and what's on it in 3D (linear — 1% on white snow is still plainly grey
// on screen), the lot's ambient in the light map (both views), the land in iso.
export const DARK_LEFT = { land3: 0.035, lot: 0.03, land2: 0.06 };
// …and what eyes adjusted to it (eyes.ts, 0 … 1) put back on top: the nearest shapes come back,
// grey (the lot's in 3D as a fill of its own: light3d.ts lmEyes, linear)
export const EYES_LIFT = { land3: 0.085, lot: 0.06, land2: 0.1, lot3: 0.006 };
/** The sky's light outside, by how dark it is: 1 → `left` (geometric, so it falls
 *  evenly, not all at the end). */
export const darkK = (dark: number, left: number) => left ** dark;
/** The lot's ambient (its open tiles, in the light map): the hour's, gone in the dark (`eyes`:
 *  how adjusted to it, eyes.ts). */
export function outAmbient(d: Daylight, eyes = 0): RGB {
  const k = darkK(d.dark, DARK_LEFT.lot + EYES_LIFT.lot * eyes);
  return [d.ambient[0] * k, d.ambient[1] * k, d.ambient[2] * k];
}

// The brightest a lit surface gets (3D, linear; its highlights roll off towards
// it): white by day, never clipped; after dark the bloom takes what's over it,
// so lit things ease in under it and only what's meant to glow — lamps,
// screens — glows (a white shoe under a lamp was a blaze). It comes down over
// dusk as the bloom comes in.
export function litCap(night: number): number {
  const n = Math.min(1, Math.max(0, (night - 0.03) / 0.22));
  return 0.7 + 0.3 * (1 - n * n * (3 - 2 * n));
}

// The old single "night level" (0..0.85) as a clock time: 0 → noon, 0.85 → 23:00.
export function hourForNight(level: number): number {
  return level <= 0.01 ? 12 : 20 + Math.min(1, level / 0.85) * 3;
}
