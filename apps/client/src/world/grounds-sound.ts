"use client";

import type * as GroundsModule from "@yutopia/shared/grounds";
import { mixer } from "./audio";
import { sound } from "./sound";
import { WaterSound } from "./water-sound";
import { WeatherSound } from "./weather-sound";

// The Grounds' sound (docs/plan/27-the-grounds.md, the mood), synthesized as
// the rest is (sound.ts): the wind — stronger in the open, hushed in the woods,
// a roar in a storm; indoors only a storm's, muffled (a calm one heard through closed
// windows read as a fan) —, a crow now and then by day, the lamps'
// buzz under them after dark, the river's ice ticking, a dog far off in the
// town at night, the bar's music through its door. Loaded with the Grounds. And the weather's
// (weather-sound.ts: the rain by where I am, the thunder, the drips, the birds, the river running), and
// the water's (water-sound.ts: going in, swimming, under, the rapid and the falls; the controller's).

type G = typeof GroundsModule;

export interface Here {
  x: number; // building coords
  z: number;
  land: boolean; // out on the land (not on a floor's tiles)
  inside: boolean; // in one of the Grounds' buildings
  night: number; // 0 day … 1 night
  storm: number; // 0 … 1
  fog?: number; // the morning fog, 0 … 1 (docs/plan/64-the-fog.md F6): hushed
  car?: boolean; // in a car
  roof?: number; // under a roof, how much of its rain's heard: 1 right under it, less floors down
  up?: number; // how high I hear from over the land (m: the camera's)
  hour?: number; // the hour as the sky has it
  /** the room's weather (docs/plan/65-the-weather.md): how hard it rains, sleet, a thunderstorm's,
   *  °C, the ground's wet, the water's ice (0 open … 1 frozen), the cloud */
  wx?: {
    rain: number;
    sleet: boolean;
    thunder: number;
    temp: number;
    wet: number;
    ice: number;
    cloud: number;
    vol?: number;
  };
}

/** the water's ice from which it's walked on, and the river's ice ticks (shared physics ICE_WALK) */
const FROZEN = 0.8;

export class GroundsSound {
  private wind: { out: GainNode; bp: BiquadFilterNode; src: AudioBufferSourceNode } | null = null;
  private buzz: { out: GainNode; nodes: OscillatorNode[] } | null = null;
  private music: { out: GainNode; timer: ReturnType<typeof setInterval> } | null = null;
  private t = 0;
  private nextCrow = 20;
  private nextTick = 2;
  private nextDog = 30;
  private nextDrip = 1;
  private open = 1; // eased: how open it is round you (1 none of the woods)
  readonly weather = new WeatherSound();
  readonly water = new WaterSound();
  /** the mixer, for the dark's sound (world/dark/voices.ts takes it from here: importing it
   *  there split the world page's chunks — docs/plan/30-the-dark.md phase 2's trap) */
  readonly mixer = mixer;

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
    // (in the morning fog the air's still: next to no wind — docs/plan/64-the-fog.md F6)
    const fog = h.fog ?? 0;
    // (and by the weather: a grey day's breezier, the rain's gusts — docs/plan/65 W8)
    const wx = h.wx;
    const by = wx ? 0.75 + 0.25 * wx.cloud + 0.5 * Math.min(1, wx.rain) : 1;
    // (and up off the ground, more of it: flying, god mode's camera)
    const aloft = 1 + 0.6 * Math.min(1, Math.max(0, ((h.up ?? 0) - 5) / 35));
    // (the weather's volume an admin set, for everyone: the wind's the weather's too)
    this.weather.volume(wx?.vol ?? 1);
    const level =
      ((h.land ? 0.03 + 0.05 * this.open : 0) * (1 - 0.85 * fog) * by + 0.22 * h.storm) *
      gust *
      out *
      aloft *
      (wx?.vol ?? 1);
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
      this.nextCrow = (35 + Math.random() * 80) * (1 - 0.4 * fog);
      // (in the fog: somewhere far off, quieter, and early too — first light's enough)
      if (h.land && h.night < (fog > 0.3 ? 0.7 : 0.4) && h.storm < 0.3)
        this.caw(ctx, (0.5 + Math.random() * 0.5) * (1 - 0.65 * fog), Math.random() * 1.6 - 0.8);
    }
    // ── in the fog, the trees dripping round you ──
    this.nextDrip -= dt;
    if (this.nextDrip < 0) {
      this.nextDrip = 0.5 + Math.random() * 2.2;
      const k = h.land ? fog * Math.min(1, woods * 1.6 + 0.15) : 0;
      if (k > 0.05) this.drip(ctx, 0.022 * k * (0.5 + Math.random() * 0.5), Math.random() * 1.8 - 0.9);
    }
    // ── the river's ice, ticking, near it (frozen: else it runs — the weather's) ──
    const river = h.land ? riverDistance(G, h.x, h.z) : 99;
    const ice = wx?.ice ?? 1;
    this.nextTick -= dt;
    if (this.nextTick < 0) {
      this.nextTick = 0.4 + Math.random() * 2.6;
      if (river < 30 && ice >= FROZEN) this.tick(ctx, (1 - river / 30) * 0.05);
    }
    // ── the weather's: the rain by where I am, the thunder, the drips, the birds, the river ──
    if (wx) {
      const P = G.POND;
      const e = Math.hypot((h.x - P.cx) / P.rx, (h.z - P.cz) / P.rz);
      const pond = e < 1 ? 1 : Math.max(0, 1 - ((e - 1) * Math.min(P.rx, P.rz)) / 30);
      this.weather.update(dt, {
        out: h.land && !h.car,
        car: !!h.car,
        roof: h.roof ?? 1,
        up: h.up ?? 0,
        woods: 1 - this.open,
        water: h.land ? Math.max(pond, Math.max(0, 1 - river / 25)) : 0,
        river: h.land ? Math.max(0, 1 - river / 35) : 0,
        night: h.night,
        storm: h.storm,
        fog,
        hour: h.hour ?? 12,
        ...wx,
      });
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

  // a drip off a branch onto the snow: a short, falling plip
  private drip(ctx: AudioContext, gain: number, pan: number) {
    const at = ctx.currentTime + 0.01;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, at);
    out.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    out.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    const o = ctx.createOscillator();
    o.type = "sine";
    const f = 1400 + Math.random() * 1300;
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, at + 0.08);
    o.connect(out).connect(p).connect(mixer.buses.ambience);
    o.start(at);
    o.stop(at + 0.1);
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

  /** Thin ice under a step (the water not long frozen, or thawing): a creak, now and then a crack
   *  running off. `thin` 0 … 1 (just walkable). */
  crack(thin: number, gain = 1) {
    const ctx = this.ctx();
    if (!ctx || thin <= 0) return;
    const at = ctx.currentTime + 0.02;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.2 - 0.6;
    pan.connect(mixer.buses.effects);
    // the creak: a low, wavering groan
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const f = 90 + Math.random() * 70;
    o.frequency.setValueAtTime(f, at);
    o.frequency.linearRampToValueAtTime(f * (0.7 + Math.random() * 0.2), at + 0.35);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.05 * thin * gain, at + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    o.connect(lp).connect(g).connect(pan);
    o.start(at);
    o.stop(at + 0.42);
    // the crack, the thinner the likelier: a sharp tick and its ping running off under the ice
    if (Math.random() < 0.25 + 0.5 * thin) {
      const c = ctx.createBufferSource();
      c.buffer = sound.noiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800 + Math.random() * 1600;
      bp.Q.value = 6;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.09 * thin * gain, at + 0.08);
      cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      c.connect(bp).connect(cg).connect(pan);
      c.start(at + 0.08, Math.random());
      c.stop(at + 0.18);
      const ping = ctx.createOscillator();
      ping.frequency.setValueAtTime(2600 + Math.random() * 1200, at + 0.1);
      ping.frequency.exponentialRampToValueAtTime(500, at + 0.5);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0.0001, at + 0.1);
      pg.gain.exponentialRampToValueAtTime(0.02 * thin * gain, at + 0.11);
      pg.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
      ping.connect(pg).connect(pan);
      ping.start(at + 0.1);
      ping.stop(at + 0.56);
    }
  }

  stop() {
    this.weather.stop();
    this.water.stop();
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
