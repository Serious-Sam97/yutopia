"use client";

import type * as GroundsModule from "@yutopia/shared/grounds";
import { mixer } from "./audio";
import { sound } from "./sound";

// The Grounds' sound (docs/plan/27-the-grounds.md, the mood), synthesized as
// the rest is (sound.ts): the wind — stronger in the open, hushed in the woods,
// a roar in a storm, muffled indoors —, a crow now and then by day, the lamps'
// buzz under them after dark, the river's ice ticking, a dog far off in the
// town at night, the bar's music through its door. Loaded with the Grounds.

type G = typeof GroundsModule;

export interface Here {
  x: number; // building coords
  z: number;
  land: boolean; // out on the land (not on a floor's tiles)
  inside: boolean; // in one of the Grounds' buildings
  night: number; // 0 day … 1 night
  storm: number; // 0 … 1
}

export class GroundsSound {
  private wind: { out: GainNode; bp: BiquadFilterNode; src: AudioBufferSourceNode } | null = null;
  private buzz: { out: GainNode; nodes: OscillatorNode[] } | null = null;
  private music: { out: GainNode; timer: ReturnType<typeof setInterval> } | null = null;
  private t = 0;
  private nextCrow = 20;
  private nextTick = 2;
  private nextDog = 30;
  private open = 1; // eased: how open it is round you (1 none of the woods)

  constructor(private G: G) {
    // a step in the snow: grains crunching after the first (sound.ts step)
    sound.onCrunch = (ctx, at, len, gain) => {
      for (let i = 0; i < 4; i++) {
        const t = at + 0.015 + Math.random() * len;
        const c = ctx.createBufferSource();
        c.buffer = sound.noiseBuffer(ctx);
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 3200 + Math.random() * 2000;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(gain * 0.5, t);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
        c.connect(hp).connect(cg).connect(mixer.buses.effects);
        c.start(t, Math.random() * 1.5);
        c.stop(t + 0.02);
      }
    };
  }

  private ctx(): AudioContext | null {
    const c = mixer.ctx;
    return c && c.state === "running" ? c : null;
  }

  update(dt: number, h: Here) {
    const ctx = this.ctx();
    if (!ctx) return;
    this.t += dt;
    const G = this.G;
    // ── the wind ──
    if (!this.wind) {
      const src = ctx.createBufferSource();
      src.buffer = sound.noiseBuffer(ctx);
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 0.7;
      bp.frequency.value = 400;
      const out = ctx.createGain();
      out.gain.value = 0;
      src.connect(bp).connect(out).connect(mixer.buses.ambience);
      src.start();
      this.wind = { out, bp, src };
    }
    const woods = h.land ? Math.min(1, G.treeDensity(h.x, h.z) * 1.4) : 0;
    this.open += (1 - woods - this.open) * Math.min(1, dt * 0.8);
    // gusts: two slow waves
    const gust = 0.6 + 0.25 * Math.sin(this.t * 0.37) + 0.15 * Math.sin(this.t * 1.13 + 1);
    const out = h.land ? 1 : h.inside ? 0.12 : 0.18;
    const level = (0.03 + 0.05 * this.open + 0.22 * h.storm) * gust * out;
    this.wind.out.gain.setTargetAtTime(level, ctx.currentTime, 0.4);
    this.wind.bp.frequency.setTargetAtTime(
      (h.land ? 320 + 380 * gust + 500 * h.storm : 240) * (h.inside ? 0.5 : 1),
      ctx.currentTime,
      0.5,
    );
    // ── the lamps' buzz, under one after dark ──
    let near = 99;
    if (h.land && h.night > 0.3)
      for (const l of G.LAMPS) {
        const d = Math.hypot(l.x - h.x, l.z - h.z);
        if (d < near) near = d;
      }
    const buzz = near < 7 ? (1 - near / 7) * 0.012 * h.night : 0;
    if (buzz > 0 && !this.buzz) {
      const o = ctx.createGain();
      o.gain.value = 0;
      o.connect(mixer.buses.ambience);
      const nodes = [120, 240, 360].map((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = i ? "sine" : "sawtooth";
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = [0.35, 0.4, 0.2][i];
        osc.connect(g).connect(o);
        osc.start();
        return osc;
      });
      this.buzz = { out: o, nodes };
    }
    if (this.buzz) {
      this.buzz.out.gain.setTargetAtTime(buzz, ctx.currentTime, 0.3);
      if (buzz === 0 && this.buzz.out.gain.value < 1e-4) {
        for (const n of this.buzz.nodes) n.stop();
        this.buzz.out.disconnect();
        this.buzz = null;
      }
    }
    // ── a crow, by day, out in the woods or on the lawn ──
    this.nextCrow -= dt;
    if (this.nextCrow < 0) {
      this.nextCrow = 35 + Math.random() * 80;
      if (h.land && h.night < 0.4 && h.storm < 0.3) this.caw(ctx, 0.5 + Math.random() * 0.5, Math.random() * 1.6 - 0.8);
    }
    // ── the river's ice, ticking, near it ──
    const river = h.land ? riverDistance(G, h.x, h.z) : 99;
    this.nextTick -= dt;
    if (this.nextTick < 0) {
      this.nextTick = 0.4 + Math.random() * 2.6;
      if (river < 30) this.tick(ctx, (1 - river / 30) * 0.05);
    }
    // ── a dog, far off in the town at night ──
    this.nextDog -= dt;
    if (this.nextDog < 0) {
      this.nextDog = 40 + Math.random() * 90;
      const T = G.TOWN;
      const inTown = h.x > T.x0 - 120 && h.x < T.x1 + 60 && h.z > T.z0 - 60 && h.z < T.z1 + 120;
      if (h.land && inTown && h.night > 0.5) this.bark(ctx);
    }
    // ── the bar's music, through its door ──
    const bar = G.BUILDINGS.find((b) => b.sign === "BAR");
    let m = 0;
    if (bar) {
      const dx = Math.max(bar.x0 - h.x, 0, h.x - bar.x1);
      const dz = Math.max(bar.z0 - h.z, 0, h.z - bar.z1);
      const d = Math.hypot(dx, dz);
      m = d === 0 ? 0.05 : d < 20 ? (1 - d / 20) * 0.025 : 0;
    }
    if (m > 0 && !this.music) this.music = this.band(ctx);
    if (this.music) {
      this.music.out.gain.setTargetAtTime(m, ctx.currentTime, 0.5);
      if (m === 0 && this.music.out.gain.value < 1e-4) {
        clearInterval(this.music.timer);
        this.music.out.disconnect();
        this.music = null;
      }
    }
  }

  /** A horn (a car's two notes, the shuttle's lower), `gain` 0…1 by how near. */
  horn(gain: number, big: boolean) {
    const ctx = this.ctx();
    if (!ctx || gain <= 0) return;
    const at = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, at);
    out.gain.exponentialRampToValueAtTime(0.09 * gain, at + 0.02);
    out.gain.setValueAtTime(0.09 * gain, at + (big ? 0.55 : 0.32));
    out.gain.exponentialRampToValueAtTime(0.0001, at + (big ? 0.65 : 0.4));
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    out.connect(lp).connect(mixer.buses.effects);
    for (const f of big ? [220, 277] : [392, 494]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(out);
      o.start(at);
      o.stop(at + (big ? 0.7 : 0.45));
    }
  }

  // a crow: two or three harsh, falling caws
  private caw(ctx: AudioContext, gain: number, pan: number) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(mixer.buses.ambience);
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const at = ctx.currentTime + i * 0.42 + Math.random() * 0.05;
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(620, at);
      o.frequency.exponentialRampToValueAtTime(380, at + 0.28);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1300;
      bp.Q.value = 2.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05 * gain, at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      o.connect(bp).connect(g).connect(p);
      o.start(at);
      o.stop(at + 0.32);
    }
  }

  // a far dog: two short muffled barks
  private bark(ctx: AudioContext) {
    for (let i = 0; i < 2; i++) {
      const at = ctx.currentTime + i * 0.38;
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(330, at);
      o.frequency.exponentialRampToValueAtTime(210, at + 0.12);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 700;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.025, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      o.connect(lp).connect(g).connect(mixer.buses.ambience);
      o.start(at);
      o.stop(at + 0.18);
    }
  }

  // the ice: a dry click, ringing a little
  private tick(ctx: AudioContext, gain: number) {
    const at = ctx.currentTime;
    const b = ctx.createBufferSource();
    b.buffer = sound.noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400 + Math.random() * 3000;
    bp.Q.value = 9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    b.connect(bp).connect(g).connect(mixer.buses.ambience);
    b.start(at, Math.random());
    b.stop(at + 0.1);
  }

  // the bar's band through a wall: a bass line and a kick, all low
  private band(ctx: AudioContext) {
    const out = ctx.createGain();
    out.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    out.connect(lp).connect(mixer.buses.ambience);
    const notes = [55, 55, 65.4, 73.4, 55, 55, 82.4, 73.4];
    let i = 0;
    const beat = () => {
      const at = ctx.currentTime + 0.02;
      const kick = ctx.createOscillator();
      kick.frequency.setValueAtTime(110, at);
      kick.frequency.exponentialRampToValueAtTime(45, at + 0.12);
      const kg = ctx.createGain();
      kg.gain.setValueAtTime(0.9, at);
      kg.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      kick.connect(kg).connect(out);
      kick.start(at);
      kick.stop(at + 0.22);
      const bass = ctx.createOscillator();
      bass.type = "triangle";
      bass.frequency.value = notes[i++ % notes.length];
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.6, at);
      bg.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      bass.connect(bg).connect(out);
      bass.start(at);
      bass.stop(at + 0.52);
    };
    const timer = setInterval(beat, 560);
    return { out, timer };
  }

  stop() {
    this.wind?.src.stop();
    this.wind?.out.disconnect();
    this.wind = null;
    if (this.buzz) for (const n of this.buzz.nodes) n.stop();
    this.buzz?.out.disconnect();
    this.buzz = null;
    if (this.music) clearInterval(this.music.timer);
    this.music?.out.disconnect();
    this.music = null;
  }
}

// how far (tiles) from the river's middle line
function riverDistance(G: G, x: number, z: number): number {
  const p = G.RIVER.pts;
  let best = 1e9;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i];
    const [bx, bz] = p[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}
