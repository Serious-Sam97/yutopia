import { mixer } from "../audio";

// Build mode's foley, synthesized like the rest of Yutopia's sound: a soft
// whoosh when you pick something up, a wooden thunk when it lands, a tick per
// quarter turn, a puff when it's gone, a dull bump when it doesn't fit, and a
// faint click as a held thing snaps to the next tile.
export type BuildSound = "pickup" | "drop" | "rotate" | "remove" | "nope" | "snap" | "select";

let noise: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const b = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noise = b;
  return b;
}

let lastSnap = 0;

export function buildSound(kind: BuildSound) {
  const ctx = mixer.ctx;
  if (!ctx || ctx.state !== "running") return;
  const out = mixer.buses.effects;
  const t = ctx.currentTime;
  const env = (g: GainNode, a: number, d: number, peak: number, at = t) => {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + a);
    g.gain.exponentialRampToValueAtTime(0.0001, at + a + d);
  };
  const tone = (type: OscillatorType, f0: number, f1: number, a: number, d: number, peak: number, at = t) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + a + d);
    env(g, a, d, peak, at);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + a + d + 0.02);
  };
  const hiss = (f: number, q: number, a: number, d: number, peak: number, sweep = 1, at = t) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f, at);
    bp.frequency.exponentialRampToValueAtTime(f * sweep, at + a + d);
    const g = ctx.createGain();
    env(g, a, d, peak, at);
    s.connect(bp).connect(g).connect(out);
    s.start(at);
    s.stop(at + a + d + 0.02);
  };
  switch (kind) {
    case "pickup": // an upward whoosh with a little lift
      hiss(700, 1.2, 0.04, 0.16, 0.18, 2.6);
      tone("sine", 320, 520, 0.01, 0.12, 0.06);
      break;
    case "drop": // a wooden thunk and a bit of dust
      tone("triangle", 150, 70, 0.004, 0.16, 0.42);
      tone("sine", 95, 55, 0.004, 0.2, 0.3);
      hiss(1800, 0.8, 0.01, 0.12, 0.05, 0.5, t + 0.02);
      break;
    case "rotate": // a ratchet tick
      tone("square", 1400, 900, 0.002, 0.03, 0.05);
      hiss(4200, 3, 0.002, 0.03, 0.06);
      break;
    case "remove": // a soft poof
      hiss(900, 0.7, 0.02, 0.32, 0.22, 0.35);
      tone("sine", 420, 160, 0.01, 0.25, 0.05);
      break;
    case "nope": // doesn't fit: a dull double bump
      tone("triangle", 110, 95, 0.004, 0.08, 0.3);
      tone("triangle", 100, 85, 0.004, 0.08, 0.26, t + 0.11);
      break;
    case "snap": {
      // the held thing hops to the next tile (rate-limited)
      const now = performance.now();
      if (now - lastSnap < 45) return;
      lastSnap = now;
      tone("sine", 900, 760, 0.002, 0.025, 0.025);
      break;
    }
    case "select":
      tone("sine", 660, 880, 0.004, 0.06, 0.05);
      break;
  }
}
