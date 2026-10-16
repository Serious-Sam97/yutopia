"use client";

import type { Ringtone, TextTone } from "@yutopia/shared/phone";
import { mixer } from "../audio";
import { noiseBuffer, ready } from "../foley";

// Every sound the phone makes, played live by small synths (no audio files,
// like the rest of Yutopia): ten ringtones that loop while a call rings — from
// your own phone, or from someone else's pocket near you (positional) — text
// tones, the keypad's DTMF, the line's tones, the shutter, the buzz, the boot.

const hz = (n: number) => 440 * 2 ** ((n - 69) / 12); // MIDI note → Hz

type Out = AudioNode;

// one voice of an instrument, at `t`, into `out`
function voice(ctx: AudioContext, out: Out, kind: string, note: number, t: number, len: number, vel = 1) {
  const f = hz(note);
  const g = ctx.createGain();
  g.connect(out);
  const osc = (type: OscillatorType, mul: number, det = 0, amp = 1) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mul;
    o.detune.value = det;
    const og = ctx.createGain();
    og.gain.value = amp;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + len + 0.6);
    return o;
  };
  const env = (peak: number, a: number, d: number, sus = 0) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * vel, t + a);
    if (sus > 0) {
      g.gain.exponentialRampToValueAtTime(peak * vel * sus, t + a + d);
      g.gain.setValueAtTime(peak * vel * sus, t + len);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
    } else g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  switch (kind) {
    case "ep": // a city-pop electric piano: sine + a bell partial
      osc("sine", 1, 0, 1);
      osc("sine", 2, 4, 0.25);
      osc("triangle", 4, -3, 0.06);
      env(0.16, 0.004, 0.9);
      break;
    case "rhodes": // softer, lo-fi
      osc("sine", 1, -6, 1);
      osc("sine", 1, 6, 0.7);
      osc("sine", 3, 0, 0.08);
      env(0.12, 0.012, 1.4);
      break;
    case "saw": {
      // a detuned saw stab through a sweeping filter (the Vortex chord)
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 6;
      lp.frequency.setValueAtTime(400, t);
      lp.frequency.exponentialRampToValueAtTime(5200, t + 0.18);
      lp.frequency.exponentialRampToValueAtTime(900, t + len);
      g.disconnect();
      g.connect(lp).connect(out);
      osc("sawtooth", 1, -9, 0.5);
      osc("sawtooth", 1, 9, 0.5);
      osc("square", 0.5, 0, 0.25);
      env(0.12, 0.01, 0.3, 0.6);
      break;
    }
    case "bass": {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 9;
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(300, t + 0.16);
      g.disconnect();
      g.connect(lp).connect(out);
      osc("sawtooth", 1, 0, 1);
      osc("square", 0.5, 0, 0.4);
      env(0.22, 0.004, 0.22);
      break;
    }
    case "square": // 8-bit
      osc("square", 1, 0, 1);
      env(0.07, 0.002, len * 0.95, 0.7);
      break;
    case "beep": // a 1985 cordless's beep
      osc("square", 1, 0, 0.6);
      osc("sine", 1.5, 0, 0.4);
      env(0.07, 0.002, len, 0.9);
      break;
    case "bell": {
      // a telephone's bell: two metal partials hammered ~20 times a second
      const am = ctx.createGain();
      g.disconnect();
      g.connect(am).connect(out);
      const lfo = ctx.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = 22;
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      am.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      lfo.start(t);
      lfo.stop(t + len + 0.1);
      osc("sine", 1, 0, 0.7);
      osc("sine", 2.76, 0, 0.35);
      osc("sine", 5.4, 0, 0.12);
      env(0.16, 0.003, 0.1, 0.9);
      break;
    }
    case "chime":
      osc("sine", 1, 0, 1);
      osc("sine", 2.01, 0, 0.3);
      osc("sine", 3.98, 0, 0.12);
      env(0.15, 0.002, 1.6);
      break;
    case "glass":
      osc("sine", 1, 0, 1);
      osc("sine", 2.32, 0, 0.5);
      osc("sine", 4.25, 0, 0.25);
      env(0.12, 0.001, 0.7);
      break;
  }
}

// a pitch sweep (tape spinning, a blip)
function sweep(
  ctx: AudioContext,
  out: Out,
  type: OscillatorType,
  f0: number,
  f1: number,
  t: number,
  len: number,
  peak: number,
) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + len + 0.02);
}
function hiss(ctx: AudioContext, out: Out, f: number, q: number, t: number, len: number, peak: number) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = f;
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(bp).connect(g).connect(out);
  s.start(t);
  s.stop(t + len + 0.02);
}

// A ringtone: one bar, played from `t`; returns how long the bar is (s).
const RING: Record<Exclude<Ringtone, "silent">, (ctx: AudioContext, out: Out, t: number) => number> = {
  citypop(ctx, out, t) {
    // Fmaj9 → Em7 arpeggio, bright
    const s = 0.13;
    const a = [65, 69, 72, 76, 79, 76, 72, 69];
    const b = [64, 67, 71, 74, 76, 74, 71, 67];
    for (const [i, n] of [...a, ...b].entries()) voice(ctx, out, "ep", n, t + i * s, s * 2, i % 4 === 0 ? 1 : 0.75);
    voice(ctx, out, "bass", 41, t, 0.3);
    voice(ctx, out, "bass", 40, t + 8 * s, 0.3);
    return 16 * s + 0.6;
  },
  vortex(ctx, out, t) {
    // his chord: two stabs and a low answer
    for (const n of [50, 57, 62, 65, 69]) voice(ctx, out, "saw", n, t, 0.35, 0.8);
    for (const n of [50, 57, 62, 65, 69]) voice(ctx, out, "saw", n, t + 0.45, 0.25, 0.7);
    for (const n of [46, 53, 58, 62, 65]) voice(ctx, out, "saw", n, t + 0.9, 0.9, 0.9);
    hiss(ctx, out, 6000, 0.7, t, 0.25, 0.03);
    return 2.6;
  },
  rewind(ctx, out, t) {
    // a cassette rewinding: the squeal up, a clack, again
    sweep(ctx, out, "sawtooth", 180, 1400, t, 0.7, 0.05);
    hiss(ctx, out, 3000, 1.2, t, 0.7, 0.05);
    hiss(ctx, out, 1500, 4, t + 0.72, 0.05, 0.25);
    sweep(ctx, out, "sawtooth", 220, 1700, t + 0.9, 0.6, 0.05);
    hiss(ctx, out, 1500, 4, t + 1.52, 0.05, 0.25);
    return 2.4;
  },
  hifi(ctx, out, t) {
    // the classic two-tone trill, twice
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 10; i++) voice(ctx, out, "beep", i % 2 ? 90 : 86, t + r * 0.9 + i * 0.055, 0.05, 1);
    return 2.6;
  },
  synthbass(ctx, out, t) {
    const s = 0.15;
    const line = [36, 48, 36, 46, 36, 48, 43, 46];
    for (const [i, n] of line.entries()) voice(ctx, out, "bass", n, t + i * s, s * 0.8, i % 2 ? 0.7 : 1);
    voice(ctx, out, "ep", 72, t, 0.4, 0.6);
    voice(ctx, out, "ep", 74, t + 4 * s, 0.4, 0.6);
    return 8 * s + 0.4;
  },
  arcade(ctx, out, t) {
    const s = 0.09;
    const m = [72, 76, 79, 84, 79, 76, 77, 81, 84, 89, 84, 81];
    for (const [i, n] of m.entries()) voice(ctx, out, "square", n, t + i * s, s * 0.85);
    return m.length * s + 0.7;
  },
  bell(ctx, out, t) {
    voice(ctx, out, "bell", 91, t, 1.6);
    return 4;
  },
  rotary(ctx, out, t) {
    // the double ring of an old line
    voice(ctx, out, "bell", 88, t, 0.4);
    voice(ctx, out, "bell", 88, t + 0.6, 0.4);
    return 3;
  },
  lofi(ctx, out, t) {
    for (const n of [57, 60, 64, 67]) voice(ctx, out, "rhodes", n, t, 1.1, 0.8);
    for (const n of [55, 59, 62, 65]) voice(ctx, out, "rhodes", n, t + 1.2, 1.1, 0.8);
    hiss(ctx, out, 5000, 0.4, t, 2.4, 0.012);
    return 2.8;
  },
};

// A ring that loops until stopped; gain and pan follow where it rings from.
export class Ringer {
  private out: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  constructor(
    readonly tone: Ringtone,
    gain = 1,
    pan = 0,
    vibrate = false,
  ) {
    const ctx = ready();
    if (!ctx) return;
    this.out = ctx.createGain();
    this.out.gain.value = gain;
    this.pan = ctx.createStereoPanner();
    this.pan.pan.value = pan;
    this.out.connect(this.pan).connect(mixer.buses.effects);
    const loop = () => {
      if (this.stopped || !this.out) return;
      const t = ctx.currentTime + 0.05;
      let len = 2.5;
      if (tone !== "silent") len = RING[tone](ctx, this.out, t);
      if (vibrate || tone === "silent") buzz(ctx, this.out, t, tone === "silent" ? 0.6 : 0.3);
      this.timer = setTimeout(loop, len * 1000);
    };
    loop();
  }
  set(gain: number, pan: number) {
    const ctx = mixer.ctx;
    if (!ctx || !this.out || !this.pan) return;
    this.out.gain.setTargetAtTime(Math.max(0, gain), ctx.currentTime, 0.1);
    this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime, 0.1);
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    const ctx = mixer.ctx;
    if (ctx && this.out) {
      this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      const o = this.out;
      setTimeout(() => o.disconnect(), 400);
    }
  }
}

// the phone buzzing (on a desk, in a pocket): a low rattle
function buzz(ctx: AudioContext, out: Out, t: number, len: number) {
  for (const at of [0, len + 0.15]) {
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 160;
    const am = ctx.createOscillator();
    am.frequency.value = 37;
    const amg = ctx.createGain();
    amg.gain.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(0.05, t + at + 0.02);
    g.gain.setValueAtTime(0.05, t + at + len - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    am.connect(amg).connect(g.gain);
    o.connect(lp).connect(g).connect(out);
    o.start(t + at);
    o.stop(t + at + len + 0.02);
    am.start(t + at);
    am.stop(t + at + len + 0.02);
  }
}

// one bar of a ringtone, to try it in Settings (stops itself)
export function previewRing(tone: Ringtone): () => void {
  const r = new Ringer(tone, 0.9, 0, tone === "silent");
  const stop = setTimeout(() => r.stop(), 3200);
  return () => {
    clearTimeout(stop);
    r.stop();
  };
}

export function textTone(tone: TextTone, gain = 1) {
  const ctx = ready();
  if (!ctx || gain <= 0.01) return;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(mixer.buses.effects);
  const t = ctx.currentTime + 0.01;
  switch (tone) {
    case "pop":
      sweep(ctx, out, "sine", 620, 1180, t, 0.09, 0.2);
      sweep(ctx, out, "sine", 900, 1500, t + 0.11, 0.08, 0.14);
      break;
    case "chime":
      voice(ctx, out, "chime", 84, t, 0.6);
      voice(ctx, out, "chime", 91, t + 0.12, 0.8);
      break;
    case "tape":
      hiss(ctx, out, 1600, 5, t, 0.04, 0.3);
      sweep(ctx, out, "sawtooth", 300, 900, t + 0.05, 0.18, 0.04);
      hiss(ctx, out, 1300, 5, t + 0.25, 0.04, 0.3);
      break;
    case "blip":
      voice(ctx, out, "square", 88, t, 0.05);
      voice(ctx, out, "square", 93, t + 0.07, 0.07);
      break;
    case "glass":
      voice(ctx, out, "glass", 96, t, 0.5);
      break;
    case "silent":
      buzz(ctx, out, t, 0.25);
      break;
  }
}

// small sounds of using it
export type Ui =
  | "tap"
  | "back"
  | "open"
  | "close"
  | "send"
  | "shutter"
  | "boot"
  | "lock"
  | "error"
  | "end"
  | "connect"
  | "toggle";
export function ui(kind: Ui, gain = 1) {
  const ctx = ready();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(mixer.buses.effects);
  const t = ctx.currentTime + 0.005;
  switch (kind) {
    case "tap":
      sweep(ctx, out, "sine", 1800, 1200, t, 0.03, 0.05);
      break;
    case "toggle":
      sweep(ctx, out, "sine", 1200, 1700, t, 0.04, 0.06);
      break;
    case "back":
      sweep(ctx, out, "sine", 1300, 800, t, 0.05, 0.05);
      break;
    case "open":
      sweep(ctx, out, "sine", 520, 1040, t, 0.12, 0.07);
      hiss(ctx, out, 4000, 0.8, t, 0.12, 0.012);
      break;
    case "close":
      sweep(ctx, out, "sine", 900, 420, t, 0.12, 0.06);
      break;
    case "lock":
      hiss(ctx, out, 2400, 3, t, 0.03, 0.2);
      break;
    case "send":
      hiss(ctx, out, 2800, 0.9, t, 0.22, 0.05);
      sweep(ctx, out, "sine", 500, 1600, t, 0.2, 0.05);
      break;
    case "shutter":
      // the mirror's clack and the curtain
      hiss(ctx, out, 3500, 1.5, t, 0.05, 0.4);
      hiss(ctx, out, 1800, 2, t + 0.07, 0.06, 0.3);
      sweep(ctx, out, "triangle", 300, 120, t, 0.05, 0.1);
      break;
    case "boot":
      for (const n of [50, 57, 62, 65, 69, 74]) voice(ctx, out, "saw", n, t, 1.2, 0.55);
      voice(ctx, out, "chime", 86, t + 0.35, 1.2, 0.6);
      hiss(ctx, out, 7000, 0.6, t, 0.8, 0.02);
      break;
    case "error":
      voice(ctx, out, "beep", 64, t, 0.09);
      voice(ctx, out, "beep", 60, t + 0.12, 0.14);
      break;
    case "end":
      for (const [i, n] of [79, 76, 72].entries()) voice(ctx, out, "beep", n, t + i * 0.13, 0.1, 0.8);
      break;
    case "connect":
      voice(ctx, out, "chime", 84, t, 0.3, 0.7);
      voice(ctx, out, "chime", 88, t + 0.08, 0.5, 0.7);
      break;
  }
}

// The keypad's DTMF tones (row × column frequencies).
const DTMF_ROWS = [697, 770, 852, 941];
const DTMF_COLS = [1209, 1336, 1477];
const KEYS = "123456789*0#";
export function dtmf(key: string) {
  const ctx = ready();
  const i = KEYS.indexOf(key);
  if (!ctx || i < 0) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
  g.gain.setValueAtTime(0.05, t + 0.11);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  g.connect(mixer.buses.effects);
  for (const f of [DTMF_ROWS[Math.floor(i / 3)], DTMF_COLS[i % 3]]) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(g);
    o.start(t);
    o.stop(t + 0.16);
  }
}

// The line's tones while a call isn't up: ring-back (calling), busy, then off.
export class LineTone {
  private nodes: AudioScheduledSourceNode[] = [];
  private g: GainNode | null = null;
  constructor(kind: "ringback" | "busy" | "static") {
    const ctx = ready();
    if (!ctx) return;
    this.g = ctx.createGain();
    this.g.gain.value = 0;
    this.g.connect(mixer.buses.effects);
    const t = ctx.currentTime;
    if (kind === "static") {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(ctx);
      s.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      bp.Q.value = 0.5;
      s.connect(bp).connect(this.g);
      s.start(t);
      this.nodes.push(s);
      this.g.gain.setTargetAtTime(0.03, t, 0.2);
      return;
    }
    const [f1, f2, on, off] = kind === "ringback" ? [440, 480, 2, 4] : [480, 620, 0.5, 0.5];
    for (const f of [f1, f2]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(this.g);
      o.start(t);
      this.nodes.push(o);
    }
    // the cadence, scheduled ahead for a few minutes
    for (let at = t; at < t + 180; at += on + off) {
      this.g.gain.setValueAtTime(0.035, at);
      this.g.gain.setValueAtTime(0, at + on);
    }
  }
  stop() {
    const ctx = mixer.ctx;
    if (this.g && ctx) {
      this.g.gain.cancelScheduledValues(ctx.currentTime);
      this.g.gain.setValueAtTime(0, ctx.currentTime);
    }
    for (const n of this.nodes)
      try {
        n.stop();
      } catch {}
    this.nodes = [];
  }
}
