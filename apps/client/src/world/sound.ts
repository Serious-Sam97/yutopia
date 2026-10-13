"use client";

import { mixer } from "./audio";

// All sound is synthesized — no asset files. Three parts:
//  · room tone per area (soft tape hiss + hum, vinyl crackle in the lounge, fans in the server room)
//  · footsteps that change with the floor
//  · a procedural lo-fi radio, deterministic from (station, startedAt) so every
//    client in the room plays the same bar at the same time.

type Floor = "wood" | "carpet" | "tile" | "felt" | "stage" | "grate";

interface Tone {
  out: GainNode;
  nodes: AudioNode[];
  stop: () => void;
}

const TONES: Record<
  string,
  { hiss: number; hum: number; humHz: number; crackle?: boolean; fans?: boolean; drone?: boolean }
> = {
  tracking: { hiss: 0.012, hum: 0.006, humHz: 60 },
  lobby: { hiss: 0.009, hum: 0.003, humHz: 50 },
  lounge: { hiss: 0.01, hum: 0.004, humHz: 55, crackle: true },
  "war-room": { hiss: 0.006, hum: 0.008, humHz: 48 },
  hall: { hiss: 0.008, hum: 0.002, humHz: 60 },
  booth: { hiss: 0.003, hum: 0.002, humHz: 40 },
  "live-room": { hiss: 0.012, hum: 0.006, humHz: 50 },
  stage: { hiss: 0.014, hum: 0.008, humHz: 50 },
  "server-room": { hiss: 0.02, hum: 0.012, humHz: 41, fans: true, drone: true },
  standup: { hiss: 0.01, hum: 0.006, humHz: 60 },
};

class Sound {
  private noise: AudioBuffer | null = null;
  private tone: Tone | null = null;
  private toneKey = "";
  private stepT = 0;

  private ctx(): AudioContext | null {
    const c = mixer.ctx;
    return c && c.state === "running" ? c : null;
  }

  noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brown-ish
      d[i] = last * 3.5 * 0.5 + w * 0.5 * 0.15;
    }
    this.noise = buf;
    return buf;
  }

  // ── room tone ─────────────────────────────────────────────────────────────
  setArea(areaKey: string, kind: string) {
    const key = kind === "booth" ? "booth" : areaKey || "hall";
    if (key === this.toneKey) return;
    const ctx = this.ctx();
    if (!ctx) return;
    this.toneKey = key;
    const old = this.tone;
    if (old) {
      old.out.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
      setTimeout(() => old.stop(), 2500);
    }
    this.tone = this.makeTone(ctx, TONES[key] ?? TONES.hall);
    this.tone.out.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
  }

  private makeTone(ctx: AudioContext, t: (typeof TONES)[string]): Tone {
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(mixer.buses.ambience);
    const nodes: AudioNode[] = [];
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = t.fans ? 2200 : 5200;
    const hissG = ctx.createGain();
    hissG.gain.value = t.hiss;
    src.connect(lp).connect(hissG).connect(out);
    src.start();
    nodes.push(src);
    const hum = ctx.createOscillator();
    hum.frequency.value = t.humHz;
    const humG = ctx.createGain();
    humG.gain.value = t.hum;
    hum.connect(humG).connect(out);
    hum.start();
    nodes.push(hum);
    if (t.drone) {
      for (const f of [t.humHz * 1.5, t.humHz * 1.505]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        const f2 = ctx.createBiquadFilter();
        f2.type = "lowpass";
        f2.frequency.value = 180;
        const g = ctx.createGain();
        g.gain.value = 0.006;
        o.connect(f2).connect(g).connect(out);
        o.start();
        nodes.push(o);
      }
    }
    let crackleTimer: ReturnType<typeof setInterval> | null = null;
    if (t.crackle) {
      crackleTimer = setInterval(() => {
        if (Math.random() > 0.55) return;
        const b = ctx.createBufferSource();
        b.buffer = this.noiseBuffer(ctx);
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 3000;
        const g = ctx.createGain();
        const at = ctx.currentTime + Math.random() * 0.1;
        g.gain.setValueAtTime(0.03 * Math.random(), at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.012);
        b.connect(hp).connect(g).connect(out);
        b.start(at, Math.random());
        b.stop(at + 0.02);
      }, 90);
    }
    return {
      out,
      nodes,
      stop: () => {
        if (crackleTimer) clearInterval(crackleTimer);
        for (const n of nodes) (n as AudioScheduledSourceNode).stop?.();
        out.disconnect();
      },
    };
  }

  // ── footsteps ─────────────────────────────────────────────────────────────
  step(dt: number, walking: boolean, running: boolean, floor: Floor) {
    if (!walking) {
      this.stepT = 0.15;
      return;
    }
    this.stepT -= dt;
    if (this.stepT > 0) return;
    this.stepT = running ? 0.22 : 0.34;
    const ctx = this.ctx();
    if (!ctx) return;
    const spec: Record<Floor, [number, number, number]> = {
      wood: [900, 0.09, 0.05],
      carpet: [380, 0.05, 0.07],
      tile: [2400, 0.07, 0.03],
      felt: [320, 0.04, 0.07],
      stage: [700, 0.1, 0.05],
      grate: [3200, 0.08, 0.06],
    };
    const [freq, gain, len] = spec[floor];
    const b = ctx.createBufferSource();
    b.buffer = this.noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq * (0.9 + Math.random() * 0.2);
    bp.Q.value = floor === "grate" ? 8 : 1.4;
    const g = ctx.createGain();
    const at = ctx.currentTime;
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    b.connect(bp).connect(g).connect(mixer.buses.effects);
    b.start(at, Math.random() * 1.5);
    b.stop(at + len + 0.02);
  }

  stopAll() {
    this.tone?.stop();
    this.tone = null;
    this.toneKey = "";
    radio.stop();
  }
}

export const sound = new Sound();

// ── procedural lo-fi radio ─────────────────────────────────────────────────
export const STATIONS = [
  {
    name: "WALNUT FM",
    bpm: 74,
    chords: [
      [50, 57, 60, 65],
      [55, 62, 65, 69],
      [48, 55, 59, 64],
      [53, 60, 64, 67],
    ],
  },
  {
    name: "TAPE HISS 88.4",
    bpm: 82,
    chords: [
      [45, 52, 55, 60],
      [50, 57, 60, 64],
      [43, 50, 53, 59],
      [48, 55, 58, 62],
    ],
  },
  {
    name: "AMBER NIGHTS",
    bpm: 68,
    chords: [
      [52, 59, 62, 66],
      [47, 54, 57, 62],
      [49, 56, 59, 64],
      [45, 52, 56, 61],
    ],
  },
] as const;

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

class Radio {
  private timer: ReturnType<typeof setInterval> | null = null;
  private out: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private station = 0;
  private startedAt = 0;
  private scheduledUntil = 0; // in beats
  private level = 0;

  play(station: number, startedAt: number) {
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running") return;
    if (this.timer && this.station === station && this.startedAt === startedAt) return;
    this.stop();
    this.station = station % STATIONS.length;
    this.startedAt = startedAt;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    const warmth = ctx.createBiquadFilter();
    warmth.type = "lowpass";
    warmth.frequency.value = 3800;
    this.pan = ctx.createStereoPanner();
    this.out.connect(warmth).connect(this.pan).connect(mixer.buses.music);
    const beatSec = 60 / STATIONS[this.station].bpm;
    this.scheduledUntil = Math.floor(this.beatNow(beatSec)) + 1;
    this.timer = setInterval(() => this.schedule(ctx, beatSec), 100);
  }

  // Volume from how close I am to the nearest radio (0..1) and which side it's
  // on (−1..1), smoothed.
  setLevel(level: number, pan = 0) {
    this.level = level;
    const ctx = mixer.ctx;
    if (this.out && ctx) this.out.gain.setTargetAtTime(level * 0.55, ctx.currentTime, 0.25);
    if (this.pan && ctx) this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime, 0.25);
  }

  private beatNow(beatSec: number) {
    return (Date.now() - this.startedAt) / 1000 / beatSec;
  }

  private schedule(ctx: AudioContext, beatSec: number) {
    const now = this.beatNow(beatSec);
    const ahead = now + 0.6 / beatSec;
    while (this.scheduledUntil < ahead) {
      const beat = this.scheduledUntil;
      const at = ctx.currentTime + (beat - now) * beatSec;
      if (at >= ctx.currentTime - 0.01 && this.level > 0.001)
        this.playBeat(ctx, beat, Math.max(at, ctx.currentTime), beatSec);
      this.scheduledUntil++;
    }
  }

  private playBeat(ctx: AudioContext, beat: number, at: number, beatSec: number) {
    const out = this.out;
    if (!out) return;
    const st = STATIONS[this.station];
    const bar = Math.floor(beat / 4);
    const inBar = beat % 4;
    const chord = st.chords[bar % st.chords.length];
    // swung 8ths: drums on the beat, hats on the off-beat
    const swing = beatSec * 0.58;
    if (inBar === 0 || inBar === 2) this.kick(ctx, out, at, inBar === 2 ? 0.5 : 1);
    if (inBar === 1 || inBar === 3) this.snare(ctx, out, at);
    this.hat(ctx, out, at, 0.5);
    this.hat(ctx, out, at + swing, 0.32);
    if (inBar === 0) this.keys(ctx, out, chord, at, beatSec * 3.6);
    if (inBar === 2 && bar % 2 === 1) this.keys(ctx, out, chord.slice(1), at + swing, beatSec * 1.4, 0.6);
    this.bass(ctx, out, chord[0] - 12 + (inBar === 3 ? 7 : 0), at, beatSec * 0.9);
  }

  private env(_ctx: AudioContext, g: GainNode, at: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  private kick(ctx: AudioContext, out: AudioNode, at: number, vel: number) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
    this.env(ctx, g, at, 0.55 * vel, 0.004, 0.28);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.35);
  }

  private snare(ctx: AudioContext, out: AudioNode, at: number) {
    const b = ctx.createBufferSource();
    b.buffer = sound.noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    this.env(ctx, g, at, 0.22, 0.003, 0.16);
    b.connect(bp).connect(g).connect(out);
    b.start(at, Math.random());
    b.stop(at + 0.22);
  }

  private hat(ctx: AudioContext, out: AudioNode, at: number, vel: number) {
    const b = ctx.createBufferSource();
    b.buffer = sound.noiseBuffer(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    this.env(ctx, g, at, 0.06 * vel, 0.002, 0.05);
    b.connect(hp).connect(g).connect(out);
    b.start(at, Math.random());
    b.stop(at + 0.08);
  }

  // Rhodes-ish: sine + soft triangle, slow tremolo, gentle detune.
  private keys(ctx: AudioContext, out: AudioNode, notes: readonly number[], at: number, len: number, vel = 1) {
    for (const n of notes) {
      for (const [type, mul, detune] of [
        ["sine", 1, -4],
        ["triangle", 0.35, 5],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = midi(n);
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.045 * mul * vel, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + len);
        o.connect(g).connect(out);
        o.start(at);
        o.stop(at + len + 0.05);
      }
    }
  }

  private bass(ctx: AudioContext, out: AudioNode, n: number, at: number, len: number) {
    const o = ctx.createOscillator();
    o.frequency.value = midi(n);
    const g = ctx.createGain();
    this.env(ctx, g, at, 0.16, 0.01, len);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + len + 0.05);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const out = this.out;
    const pan = this.pan;
    const ctx = mixer.ctx;
    if (out && ctx) {
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      setTimeout(() => {
        out.disconnect();
        pan?.disconnect();
      }, 600);
    }
    this.out = null;
    this.startedAt = 0;
  }
}

export const radio = new Radio();
