import { mixer } from "./audio";
import { playSample, sample } from "./sfx";

// The elevators' and the stairs' sounds in the world (docs/plan/26): the samples
// in public/sfx (world/sfx.ts) through the effects bus, so the volume settings
// hold. Loaded once the building has elevators; a sound asked for before it's
// in (or that isn't there) is skipped.

const NAMES = [
  "lift/button",
  "lift/chime",
  "lift/door-open",
  "lift/door-close",
  "lift/ride.wav",
  "stairs/door-open",
  "stairs/door-close",
  "stairs/step-1",
  "stairs/step-2",
  "stairs/step-3",
  "stairs/step-4",
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

// On the stairs: a step's sound every so often while walking (a stair's
// rhythm is quicker and shorter than the floor's), one of the four, a hair
// different each time.
let stepT = 0;
export function stairStep(dt: number, walking: boolean, running: boolean) {
  if (!walking) {
    stepT = 0.12;
    return;
  }
  stepT -= dt;
  if (stepT > 0) return;
  stepT = running ? 0.2 : 0.3;
  loadLiftSounds();
  liftSound(`stairs/step-${1 + Math.floor(Math.random() * 4)}`, { gain: 0.5, rate: 0.95 + Math.random() * 0.1 });
}
