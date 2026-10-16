import { mixer } from "../audio";
import { noiseBuffer } from "../foley";

// The game tables' sounds, synthesized like the rest of Yutopia's: phenolic
// balls clicking (brighter and louder the harder they meet), the dull thump of
// a cushion, the leather tock of the cue's tip, a ball dropping into a pocket
// and rolling down the return, the chalk; the ping-pong ball's pock on the
// table and tock off a racket, the net's buzz. `gain` already carries the
// distance (heard from where the table is).

const ready = (): AudioContext | null => {
  const ctx = mixer.ctx;
  return ctx && ctx.state === "running" ? ctx : null;
};

function out(ctx: AudioContext, gain: number, pan: number): AudioNode {
  const g = ctx.createGain();
  g.gain.value = gain;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(p).connect(mixer.buses.effects);
  return g;
}

// a short resonant ping + a click of noise
function ping(ctx: AudioContext, dest: AudioNode, f: number, decay: number, level: number, at = 0) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.92, t + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + decay + 0.02);
}
function burst(
  ctx: AudioContext,
  dest: AudioNode,
  f: number,
  q: number,
  len: number,
  level: number,
  at = 0,
  type: BiquadFilterType = "bandpass",
) {
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = type;
  bp.frequency.value = f;
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(bp).connect(g).connect(dest);
  s.start(t, Math.random() * 1.5);
  s.stop(t + len + 0.02);
}

// v: the impact's speed, m/s
export function clack(v: number, gain: number, pan = 0) {
  const ctx = ready();
  if (!ctx || gain < 0.01 || v < 0.02) return;
  const k = Math.min(1, v / 4);
  const d = out(ctx, gain, pan);
  ping(ctx, d, 2900 + 900 * k + Math.random() * 300, 0.035 + 0.02 * k, 0.05 + 0.32 * k ** 0.8);
  ping(ctx, d, 5200 + Math.random() * 500, 0.02, 0.03 + 0.12 * k);
  burst(ctx, d, 3800, 1.4, 0.03, 0.05 + 0.25 * k);
}

export function cushion(v: number, gain: number, pan = 0) {
  const ctx = ready();
  if (!ctx || gain < 0.01 || v < 0.05) return;
  const k = Math.min(1, v / 3.5);
  const d = out(ctx, gain, pan);
  ping(ctx, d, 140 + 40 * k, 0.09, 0.08 + 0.3 * k);
  burst(ctx, d, 600, 0.9, 0.07, 0.04 + 0.12 * k);
}

export function cueTip(v: number, gain: number, pan = 0, miscue = false) {
  const ctx = ready();
  if (!ctx || gain < 0.01) return;
  const k = Math.min(1, v / 8);
  const d = out(ctx, gain, pan);
  ping(ctx, d, miscue ? 900 : 1500 + 400 * k, 0.03, 0.08 + 0.25 * k);
  burst(ctx, d, miscue ? 2600 : 1900, 2, 0.025, 0.08 + 0.2 * k);
  if (miscue) burst(ctx, d, 4200, 3, 0.09, 0.12);
}

// into the pocket: the thud on the leather, then the roll down to the tray
export function pocketDrop(v: number, gain: number, pan = 0) {
  const ctx = ready();
  if (!ctx || gain < 0.01) return;
  const k = Math.min(1, v / 3);
  const d = out(ctx, gain, pan);
  ping(ctx, d, 210, 0.12, 0.18 + 0.2 * k);
  burst(ctx, d, 900, 0.8, 0.08, 0.1 + 0.1 * k);
  // the roll down the return gutter, with a knock as it meets the others
  burst(ctx, d, 380, 0.7, 0.9, 0.05, 0.12, "lowpass");
  ping(ctx, d, 2600, 0.03, 0.07, 0.95);
}

export function chalk(gain = 0.5) {
  const ctx = ready();
  if (!ctx) return;
  const d = out(ctx, gain, 0);
  for (let i = 0; i < 3; i++) burst(ctx, d, 5200, 0.6, 0.06, 0.05, i * 0.07, "highpass");
}

// ── ping-pong ──
export function pock(v: number, gain: number, pan = 0) {
  const ctx = ready();
  if (!ctx || gain < 0.01) return;
  const k = Math.min(1, v / 10);
  const d = out(ctx, gain, pan);
  ping(ctx, d, 1150 + 200 * k, 0.05, 0.12 + 0.25 * k);
  burst(ctx, d, 2400, 1.2, 0.03, 0.08 + 0.12 * k);
}
export function tock(v: number, gain: number, pan = 0) {
  const ctx = ready();
  if (!ctx || gain < 0.01) return;
  const k = Math.min(1, v / 18);
  const d = out(ctx, gain, pan);
  ping(ctx, d, 760 + 300 * k, 0.045, 0.14 + 0.3 * k);
  burst(ctx, d, 1700 + 900 * k, 1.5, 0.035, 0.1 + 0.2 * k);
}
export function netBuzz(gain: number, pan = 0) {
  const ctx = ready();
  if (!ctx || gain < 0.01) return;
  const d = out(ctx, gain, pan);
  burst(ctx, d, 700, 3, 0.12, 0.12);
}
export function floorBounce(gain: number, pan = 0, at = 0) {
  const ctx = ready();
  if (!ctx || gain < 0.01) return;
  const d = out(ctx, gain, pan);
  ping(ctx, d, 900, 0.04, 0.08, at);
}
