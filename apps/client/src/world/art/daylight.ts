// Time of day from the local clock: the ambient light every surface is
// multiplied by, the sun (colour + direction, for windows and the sky), and how
// "night" it is (lamps, screens and bloom take over as it gets dark).

export type Phase = "night" | "dawn" | "morning" | "day" | "golden" | "dusk";
export type RGB = [number, number, number];

export interface Daylight {
  hour: number;
  phase: Phase;
  ambient: RGB; // 0..1 multiplier
  sun: { color: RGB; elevation: number; azimuth: number }; // radians; elevation < 0 = below the horizon
  night: number; // 0 day … 1 deep night
  window: RGB; // what windows add at full strength: sunlight by day, a little moonlight at night
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
  return { hour: h, phase: t < 0.5 ? p0 : p1, ambient, sun: { color, elevation, azimuth }, night, window };
}

// The old single "night level" (0..0.85) as a clock time: 0 → noon, 0.85 → 23:00.
export function hourForNight(level: number): number {
  return level <= 0.01 ? 12 : 20 + Math.min(1, level / 0.85) * 3;
}
