import type { JumpKind } from "@yutopia/shared";
import { mixer } from "./audio";
import { type Floor, sound } from "./sound";

// The feel of a jump (shared/jump.ts), fetched with the first one seen: dust
// kicked back at take-off and thrown out in a ring on landing, the air rushing
// past, the thud. Its own little chunk: the world page has no room left.
export const JUMPS_CHUNK = "yutopia-jumps";

const ready = (): AudioContext | null => {
  const c = mixer.ctx;
  return c && c.state === "running" ? c : null;
};

/** A jump's dust in iso (world px from (x, y)): `hard` 0..1, how hard it went. */
export function jumpDust(kind: "land" | "kick", hard: number, x: number, y: number) {
  const land = kind === "land";
  const n = Math.round((land ? 22 : 8) * (0.5 + hard / 2));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const sp = (land ? 70 : 34) * (0.5 + hard / 2) * (0.75 + Math.random() * 0.5);
    return {
      x: x + Math.cos(a) * 6,
      y: y + Math.sin(a) * 3,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp * 0.5,
      t: 0,
      life: (land ? 0.55 : 0.35) + Math.random() * 0.2,
      r: (land ? 3 : 2.2) + Math.random() * 2.5,
      c: Math.random() < 0.5 ? 0xe6d6b4 : 0xcdb894,
      g: -14, // (drifting up as it slows)
      drag: 4.5,
    };
  });
}

/** Off the floor: air rushing past (a flip: a swish that goes round with the turn). `gain`: 0..1, how near. */
export function jumpSound(kind: JumpKind, gain = 1) {
  const ctx = ready();
  if (!ctx) return;
  const at = ctx.currentTime;
  const flip = kind === "flip";
  const len = flip ? 0.62 : 0.2;
  const b = ctx.createBufferSource();
  b.buffer = sound.noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = flip ? 2.2 : 1.6;
  bp.frequency.setValueAtTime(500, at);
  if (flip) {
    // up as it leaves the floor, round once through the tuck, down as it opens
    bp.frequency.exponentialRampToValueAtTime(2400, at + 0.18);
    bp.frequency.exponentialRampToValueAtTime(900, at + 0.36);
    bp.frequency.exponentialRampToValueAtTime(2000, at + 0.5);
    bp.frequency.exponentialRampToValueAtTime(600, at + len);
  } else bp.frequency.exponentialRampToValueAtTime(1800, at + len);
  const g = ctx.createGain();
  const peak = (flip ? 0.09 : 0.05) * gain;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.05);
  if (flip) g.gain.setValueAtTime(peak * 0.8, at + 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  b.connect(bp).connect(g).connect(mixer.buses.effects);
  b.start(at, Math.random() * 1.2);
  b.stop(at + len + 0.05);
}

/** Back down: a thud through the floor and the floor's own sound, harder after a flip. */
export function landSound(kind: JumpKind, floor: Floor, gain = 1) {
  const ctx = ready();
  if (!ctx) return;
  const at = ctx.currentTime;
  const hard = (kind === "flip" ? 1 : 0.7) * gain;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(130, at);
  o.frequency.exponentialRampToValueAtTime(48, at + 0.14);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, at);
  og.gain.exponentialRampToValueAtTime(0.22 * hard, at + 0.008);
  og.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  o.connect(og).connect(mixer.buses.effects);
  o.start(at);
  o.stop(at + 0.2);
  // the soles on the floor (as a footstep, louder and both feet at once)
  const spec: Record<Floor, [number, number]> = {
    wood: [900, 0.08],
    carpet: [380, 0.1],
    tile: [2400, 0.05],
    felt: [320, 0.1],
    stage: [700, 0.08],
    grate: [3200, 0.1],
    asphalt: [1500, 0.11],
    concrete: [1900, 0.06],
  };
  const [freq, len] = spec[floor];
  for (const dt of [0, 0.018]) {
    const b = ctx.createBufferSource();
    b.buffer = sound.noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq * (0.85 + Math.random() * 0.3);
    bp.Q.value = floor === "grate" ? 8 : 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16 * hard, at + dt);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dt + len);
    b.connect(bp).connect(g).connect(mixer.buses.effects);
    b.start(at + dt, Math.random() * 1.5);
    b.stop(at + dt + len + 0.02);
  }
}
