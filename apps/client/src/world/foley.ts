import { mixer } from "./audio";

// The sounds of using things, synthesized like the rest of Yutopia's sound:
// the espresso machine brewing, the water cooler's glug, a can dropping in the
// vending machine, and the piano (a soft felt-hammer tone, positional).
export type MachineSound = "brew" | "pour" | "clunk";

let noise: AudioBuffer | null = null;
export function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noise = b;
  return b;
}

export function ready(): AudioContext | null {
  const ctx = mixer.ctx;
  return ctx && ctx.state === "running" ? ctx : null;
}

export function machineSound(kind: MachineSound) {
  const ctx = ready();
  if (!ctx) return;
  const out = mixer.buses.effects;
  const t = ctx.currentTime;
  const hiss = (f: number, q: number, at: number, len: number, peak: number, lfo = 0) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.08);
    g.gain.setValueAtTime(peak, at + len - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    if (lfo) {
      // a gurgle: the band wobbles
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.frequency.value = lfo;
      og.gain.value = f * 0.35;
      o.connect(og).connect(bp.frequency);
      o.start(at);
      o.stop(at + len);
    }
    s.connect(bp).connect(g).connect(out);
    s.start(at);
    s.stop(at + len + 0.05);
  };
  const tone = (type: OscillatorType, f0: number, f1: number, at: number, len: number, peak: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + len);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + len + 0.02);
  };
  switch (kind) {
    case "brew":
      // the pump's hum, then the hiss and gurgle of the shot
      tone("sawtooth", 58, 60, t, 1.4, 0.035);
      hiss(1400, 1.4, t + 0.25, 1.2, 0.08, 7);
      hiss(3800, 2, t + 0.6, 0.8, 0.03);
      break;
    case "pour":
      // the cooler's bottle: a few glugs
      for (let i = 0; i < 4; i++) {
        const at = t + 0.1 + i * 0.2;
        tone("sine", 320 + i * 30, 160, at, 0.12, 0.12);
        hiss(900, 3, at, 0.16, 0.05);
      }
      break;
    case "clunk":
      // a can tumbling down and landing in the flap
      tone("triangle", 420, 180, t, 0.08, 0.18);
      tone("triangle", 380, 160, t + 0.14, 0.08, 0.14);
      tone("triangle", 120, 60, t + 0.32, 0.22, 0.45);
      hiss(2600, 1, t + 0.32, 0.18, 0.06);
      break;
  }
}

// A piano note, n semitones from middle C. `gain` 0..1 (how near it is), `pan`
// −1..1 (where it is). Partials with a fast attack and a long felt decay.
export function pianoNote(n: number, gain = 1, pan = 0) {
  const ctx = ready();
  if (!ctx || gain <= 0.01) return;
  const t = ctx.currentTime;
  const f = 261.63 * 2 ** (n / 12);
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  const g = ctx.createGain();
  const peak = 0.22 * gain;
  const decay = 1.6 - Math.max(0, n) * 0.02;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(f * 9, t);
  lp.frequency.exponentialRampToValueAtTime(f * 2.5, t + 0.4);
  for (const [k, a, type] of [
    [1, 1, "triangle"],
    [2, 0.4, "sine"],
    [3, 0.18, "sine"],
    [4.02, 0.08, "sine"],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * k;
    const og = ctx.createGain();
    og.gain.value = a;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
  lp.connect(g).connect(p).connect(mixer.buses.music);
}

// Two people at it, when the hands meet (`gain` 0..1 by how near it is): a
// high five's slap, a fist bump's soft knock, two glasses' clink.
export function socialSound(kind: string, gain = 1) {
  const ctx = ready();
  if (!ctx || gain <= 0.02) return;
  const out = mixer.buses.effects;
  const t = ctx.currentTime;
  const burst = (f: number, q: number, len: number, peak: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak * gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(bp).connect(g).connect(out);
    s.start(t);
    s.stop(t + len + 0.02);
  };
  const ping = (f: number, len: number, peak: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.02);
  };
  if (kind === "highfive") {
    burst(2400, 0.9, 0.09, 0.5);
    burst(900, 1.2, 0.06, 0.25);
  } else if (kind === "fistbump") burst(320, 1.4, 0.08, 0.35);
  else if (kind === "cheers") {
    ping(2630, 0.5, 0.12);
    ping(3950, 0.35, 0.06);
    ping(5210, 0.2, 0.03);
  }
}

// A card done: a short bright fanfare (a rising arpeggio on the vibes).
export function fanfare(gain = 1) {
  const ctx = ready();
  if (!ctx || gain <= 0.02) return;
  const t = ctx.currentTime;
  [0, 4, 7, 12].forEach((n, i) => {
    const f = 523.25 * 2 ** (n / 12);
    const at = t + i * 0.09;
    for (const [k, a] of [
      [1, 1],
      [4, 0.18],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f * k;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.13 * a * gain, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + (i === 3 ? 1.1 : 0.4));
      o.connect(g).connect(mixer.buses.effects);
      o.start(at);
      o.stop(at + 1.2);
    }
  });
}
