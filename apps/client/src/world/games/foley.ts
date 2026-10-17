import { mixer } from "../audio";

// The disc console's sounds (docs/plan/23-disc-console.md P5), synthesized like
// the rest of Yutopia's: the lid's latch and hinge, the power button, the disc
// spinning up (a rising whir and the laser's seek ticks) and down. `gain`: how
// much of it reaches you (hearing, from where the console is).

function ready(gain: number): { ctx: AudioContext; out: AudioNode; t: number } | null {
  const ctx = mixer.ctx;
  if (!ctx || ctx.state !== "running" || gain <= 0.02) return null;
  return { ctx, out: mixer.buses.effects, t: ctx.currentTime };
}
const env = (g: GainNode, at: number, peak: number, attack: number, len: number) => {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
};
// a short burst of filtered noise: a plastic click
function click(ctx: AudioContext, out: AudioNode, at: number, freq: number, peak: number, len = 0.03) {
  const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * len)), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ctx.createBufferSource();
  s.buffer = b;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = 2.5;
  const g = ctx.createGain();
  env(g, at, peak, 0.002, len);
  s.connect(bp).connect(g).connect(out);
  s.start(at);
}
function thump(ctx: AudioContext, out: AudioNode, at: number, from: number, to: number, peak: number, len: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + len);
  env(g, at, peak, 0.004, len);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + len + 0.05);
}

// The lid: the latch lets go and it springs up; or it's pushed down and clicks shut.
export function lid(open: boolean, gain: number) {
  const r = ready(gain);
  if (!r) return;
  const { ctx, out, t } = r;
  if (open) {
    click(ctx, out, t, 2600, 0.35 * gain);
    thump(ctx, out, t + 0.01, 220, 90, 0.18 * gain, 0.12);
    click(ctx, out, t + 0.16, 1400, 0.12 * gain, 0.05); // the hinge's stop
  } else {
    thump(ctx, out, t, 160, 70, 0.22 * gain, 0.1);
    click(ctx, out, t + 0.02, 3000, 0.4 * gain);
    click(ctx, out, t + 0.07, 2200, 0.2 * gain);
  }
}

// The power button: a soft, deep click.
export function power(gain: number) {
  const r = ready(gain);
  if (!r) return;
  click(r.ctx, r.out, r.t, 1800, 0.3 * gain, 0.025);
  thump(r.ctx, r.out, r.t, 140, 80, 0.12 * gain, 0.06);
}

// The disc: spinning up (the whir climbing, the laser seeking a few times) or down.
export function spin(up: boolean, gain: number) {
  const r = ready(gain);
  if (!r) return;
  const { ctx, out, t } = r;
  const len = up ? 1.6 : 0.9;
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(up ? 30 : 190, t);
  o.frequency.exponentialRampToValueAtTime(up ? 190 : 25, t + len);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05 * gain, t + (up ? 0.6 : 0.05));
  g.gain.exponentialRampToValueAtTime(up ? 0.02 * gain : 0.0001, t + len);
  if (up) g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.5);
  o.connect(lp).connect(g).connect(out);
  o.start(t);
  o.stop(t + len + 0.6);
  // the air the disc moves
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * (len + 0.5)), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource();
  s.buffer = b;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(up ? 300 : 1200, t);
  bp.frequency.exponentialRampToValueAtTime(up ? 1200 : 300, t + len);
  const ng = ctx.createGain();
  env(ng, t, 0.025 * gain, up ? 0.5 : 0.05, len + 0.4);
  s.connect(bp).connect(ng).connect(out);
  s.start(t);
  // the laser sled finding the start of the disc
  if (up) for (const dt of [0.7, 0.85, 1.25, 1.33]) click(ctx, out, t + dt, 4200, 0.06 * gain, 0.012);
}
