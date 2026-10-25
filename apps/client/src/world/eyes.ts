// The eyes (docs/plan/44-the-night.md N3): out in the pitch dark they adjust, slowly — the nearest
// shapes come back over ~40 s — and a bright light puts them out again in half a second (a lamp's
// pool, the rooms, headlamps or someone's torch in your face; not your own torch on the snow).
// Each viewer's own, on the client: how adjusted, 0 … 1, as seconds spent adjusting.

export const ADAPT_S = 40; // seconds in the dark to see all you will
export const BLIND_S = 0.5; // a full glare puts them out in this

/** The glare (0 … 1) from the light where you stand, its luminance (0 … 1, as the views' tints). */
export function glareOf(lum: number): number {
  const k = Math.min(1, Math.max(0, (lum - 0.14) / 0.24));
  return k * k * (3 - 2 * k);
}

/** A step: `t` the seconds adjusted, `glare` 0 … 1, `dark` how dark it is out (daylight.ts). */
export function stepEyes(t: number, dt: number, glare: number, dark: number): number {
  if (dark < 0.05) return 0;
  const lit = t - ((dt * ADAPT_S) / BLIND_S) * glare;
  return glare > 0.05 ? Math.max(0, lit) : Math.min(ADAPT_S, t + dt);
}

/** How adjusted (0 … 1): slow at first, as the dark sinks in. */
export function eyesOf(t: number): number {
  const k = Math.min(1, Math.max(0, t / ADAPT_S));
  return k * k * (3 - 2 * k);
}

// Seen and unseen (N4): out under the sky after dark someone is seen when the light on them is
// past `lum` (their tint's luminance) or they're within `near` of you; else there's no name and
// no emote over them, and their body is as dark as the light on it. Chat bubbles still show:
// you can hear someone in the dark.
export const SEEN = { lum: 0.08, near: 2.5 };
export function unseen(lum: number, dist: number, dark: number): boolean {
  return dark > 0.5 && dist > SEEN.near && lum < SEEN.lum;
}
/** What you see right round you in the dark — your own body, someone a step away — as a faint
 *  light on them (0 … ~0.1, on their tint). */
export function nearLift(dist: number, dark: number): number {
  return dist >= SEEN.near ? 0 : 0.1 * (1 - dist / SEEN.near) * dark;
}
