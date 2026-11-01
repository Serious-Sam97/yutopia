import { mixer } from "./audio";
import { playSample, sample } from "./sfx";

// The elevators' and the stairs' sounds in the world (docs/plan/26): the samples
// in public/sfx (world/sfx.ts) through the effects bus, so the volume settings
// hold. Loaded once the building has elevators; a sound asked for before it's
// in (or that isn't there) is skipped. (The steps on the stairs are the steps'
// own since docs/plan/63: concrete treads, steps.ts.)

const NAMES = [
  "lift/button",
  "lift/chime",
  "lift/door-open",
  "lift/door-close",
  "lift/ride.wav",
  "stairs/door-open",
  "stairs/door-close",
];
const ready = new Map<string, AudioBuffer>();
let loading = false;

export function loadLiftSounds() {
  if (loading) return;
  loading = true;
  const ctx = mixer.ensure();
  for (const n of NAMES) void sample(ctx, n).then((b) => b && ready.set(n, b));
}

/** Play one (gain 0..1, already for the distance); returns how to stop it. */
export function liftSound(
  name: string,
  o: { gain?: number; rate?: number; loop?: boolean; delay?: number } = {},
): ((fade?: number) => void) | null {
  const ctx = mixer.ctx;
  const b = ready.get(name);
  if (!ctx || !b || (o.gain ?? 1) <= 0.01) return null;
  return playSample(ctx, b, {
    out: mixer.buses.effects,
    gain: o.gain,
    rate: o.rate,
    loop: o.loop,
    at: ctx.currentTime + (o.delay ?? 0),
    fadeIn: o.loop ? 0.6 : undefined,
  });
}

/** How loud something `d` tiles away is (heard across the floor, not past ~14). */
export const nearGain = (d: number): number => Math.max(0, Math.min(1, 1.15 - d / 12));
