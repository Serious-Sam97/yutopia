"use client";

import { strikeFar, strikeIn } from "@yutopia/shared/weather";
import { mixer } from "./audio";

// The weather's sound (docs/plan/65-the-weather.md, W8 and phase 9): recorded beds (CC0, picked by
// ear on /dev/weather-sound: public/sfx/weather, its manifest; tools/sfx-weather.mjs makes them),
// each fetched the first time it's heard, looped with its seam crossfaded, faded in and out by
// the weather and by where I am:
//   - the rain: light and heavy in the open; softer under the trees with the leaves' patter; on
//     the roof over me indoors (muffled); on the car's roof in a car; on open water by the pond
//     and the river. Sleet hisses in its place.
//   - the thunder after a flash: the strike's (shared weather.ts strikeIn, the same moment as the
//     sky's), later and duller the farther it is (strikeFar), muffled indoors.
//   - after the rain, the drips; birds on warm, dry days (loudest in the morning); the river
//     running where it isn't frozen.
// Part of the Grounds' sound (grounds-sound.ts): it says what's round me, this plays it.

/** What's round me, for the weather's sound. */
export interface WxHere {
  /** out in the open (on the land, not in a building, not in a car) */
  out: boolean;
  /** in a car */
  car: boolean;
  /** indoors, how much of the roof's rain's heard: 1 right under it (a Grounds building, the top
   *  floor), the windows' below */
  roof?: number;
  /** how much of the woods round me, 0 … 1 (eased) */
  woods: number;
  /** open water near: 0 none … 1 at its edge */
  water: number;
  /** the river near: 0 none … 1 on its bank */
  river: number;
  night: number;
  storm: number;
  fog: number;
  /** São Paulo's hour */
  hour: number;
  /** how high I hear from over the land (m: the camera's — flying, god mode, a roof): the ground's
   *  sounds fade out over the first fifteen metres up */
  up?: number;
  /** seconds since the rain stopped (the player keeps it, as it sees the rain; the bench's set):
   *  the drips, full as it stops and gone in ten minutes */
  after?: number;
  /** the room's weather: how hard it rains (0 … 1), sleet, a thunderstorm's, °C, the ground's wet,
   *  the water's ice (0 open … 1 frozen), the cloud */
  rain: number;
  sleet: boolean;
  thunder: number;
  temp: number;
  wet: number;
  ice: number;
  cloud: number;
}

export const BEDS = [
  "rain-light",
  "rain-heavy",
  "rain-trees",
  "rain-roof",
  "rain-car",
  "rain-water",
  "sleet",
  "birds",
  "river",
  "drips",
] as const;
export type Bed = (typeof BEDS)[number];
type Slot = Bed | "thunder-near" | "thunder-far";

/** each bed's level at its fullest (the recordings at −24 dB RMS, under the ambience bus) */
export const FULL: Record<Bed, number> = {
  "rain-light": 0.55,
  "rain-heavy": 0.8,
  "rain-trees": 0.6,
  "rain-roof": 0.5,
  "rain-car": 0.75,
  "rain-water": 0.55,
  sleet: 0.6,
  birds: 0.32,
  river: 0.6,
  drips: 0.45,
};
const OPEN_HZ = 20000;
/** how long a slot's recordings are kept unwanted (ms) */
export const LET_GO_MS = 120_000;
/** how long the drips go on after the rain (s) */
export const DRIPS_FOR = 600;
const INSIDE_HZ = 1600; // the roof's and the walls' muffling
const CAR_HZ = 1200;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Each bed's level and its muffling (Hz), for what's round me. Pure: the bench and the tests. */
export function mixOf(h: WxHere): Record<Bed, { level: number; lp: number }> {
  const r = clamp01(h.rain);
  const open = 1 - h.woods;
  const where = h.out ? 1 : 0.25; // (the open's beds heard through the walls or the car's)
  const lp = h.out ? OPEN_HZ : h.car ? CAR_HZ : INSIDE_HZ;
  // (light rain up to the half, the heavy over it, crossfaded)
  const heavy = smooth(0.4, 0.9, r);
  const light = clamp01(r * 2.2) * (1 - 0.75 * heavy);
  const sleet = h.sleet ? clamp01(r * 2) : 0;
  const rainK = h.sleet ? 0.4 : 1;
  // the birds: a warm, dry, calm day, the morning loud; the fog hushes them
  const morning = Math.exp(-(((h.hour - 6.5) / 1.8) ** 2));
  const birds =
    (1 - h.night) *
    smooth(4, 12, h.temp) *
    (r < 0.02 ? 1 : 0) *
    (1 - clamp01(h.storm * 3)) *
    (0.35 + 0.65 * morning) *
    (0.6 + 0.4 * (1 - h.cloud)) *
    (1 - 0.85 * h.fog) *
    (0.7 + 0.3 * h.woods);
  // the drips: the trees and the eaves for ten minutes after it stops (as the roofs' drawn drops),
  // most just after, more under the trees — not for the hours the ground takes to dry, and none
  // after a melt with no rain
  const after = h.after ?? Number.POSITIVE_INFINITY;
  const drips =
    r < 0.08 && after < DRIPS_FOR
      ? (1 - after / DRIPS_FOR) ** 1.5 * smooth(0.15, 0.6, h.wet) * (0.35 + 0.65 * h.woods)
      : 0;
  // up off the ground (flying, god mode's camera, a roof): what's on it fades — the drips, the river,
  // the rain on the water and the leaves, the birds most of the way — the rain round me only its
  // falling on the ground
  const low = 1 - smooth(3, 18, h.up ?? 0);
  const air = 0.55 + 0.45 * low;
  const lvl: Record<Bed, number> = {
    "rain-light": light * rainK * (1 - 0.6 * h.woods) * where * air,
    "rain-heavy": heavy * rainK * (1 - 0.5 * h.woods) * where * air,
    "rain-trees": r > 0.01 ? (0.3 + 0.7 * r) * h.woods * where * low : 0,
    "rain-roof": !h.out && !h.car ? clamp01(r * 1.6) * (h.roof ?? 1) : 0,
    "rain-car": h.car ? clamp01(r * 1.5) : 0,
    "rain-water": r * h.water * (1 - h.ice) * where * low,
    sleet: sleet * (0.5 + 0.5 * open) * where * air,
    birds: birds * (h.out ? 1 : 0.12) * (0.25 + 0.75 * low),
    river: h.river * clamp01(1 - h.ice / 0.8) * (h.out ? 1 : 0.15) * low,
    drips: drips * where * low,
  };
  const out = {} as Record<Bed, { level: number; lp: number }>;
  for (const b of BEDS) out[b] = { level: lvl[b] * FULL[b], lp: b === "rain-roof" || b === "rain-car" ? OPEN_HZ : lp };
  return out;
}

/** A loop with no seam: its tail crossfaded into its head (and the MP3's padding off both ends). */
export function loopable(ctx: BaseAudioContext, b: AudioBuffer, skip = 0.05, xf = 0.5): AudioBuffer {
  const sr = b.sampleRate;
  const s0 = Math.round(skip * sr);
  const x = Math.round(xf * sr);
  const len = b.length - 2 * s0 - x;
  if (len <= x) return b; // (too short to loop so: as it is)
  const out = ctx.createBuffer(b.numberOfChannels, len, sr);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c);
    const d = out.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = src[s0 + i];
    for (let i = 0; i < x; i++) {
      const k = ((i / x) * Math.PI) / 2;
      d[i] = src[s0 + i] * Math.sin(k) + src[s0 + len + i] * Math.cos(k);
    }
  }
  return out;
}

/** The thunder after a strike `far` (0 … 1) off: how long after the flash (s), how loud, how dull. */
export function thunderOf(far: number, out: boolean, car: boolean): { delay: number; gain: number; lp: number } {
  return {
    delay: 0.35 + far * 6.5,
    gain: (1 - 0.6 * far) * (out ? 1 : car ? 0.55 : 0.4),
    lp: Math.min(out ? 12000 - 9000 * far : 900, car ? CAR_HZ * 1.6 : 20000),
  };
}

interface Live {
  src: AudioBufferSourceNode;
  gain: GainNode;
  lp: BiquadFilterNode;
  quiet: number;
}

export class WeatherSound {
  private files: Promise<Record<string, string[][]>> | null = null;
  private bufs = new Map<Slot, Promise<AudioBuffer[]>>();
  private ready = new Map<Slot, AudioBuffer[]>();
  private live = new Map<Bed, Live>();
  private heard = -1; // the last strike's slot thundered
  private dry = Number.POSITIVE_INFINITY; // s since I last heard it raining (none yet: no drips)
  /** when each slot was last wanted (performance.now): after two minutes unwanted its recordings
   *  are let go — a 30 s bed decoded is ~11 MB — fetched again (~70 ms, off the main thread) the
   *  next time */
  private wanted = new Map<Slot, number>();
  private tidied = 0;
  /** the peals sounding or to come (stopped with the rest) */
  private peals = new Set<AudioBufferSourceNode>();
  // everything out through one gentle compressor: a near crack over a downpour, the trees and the
  // water stays under 0 dB (its own: the voices and the rest untouched)
  // (and the weather's volume, an admin's for everyone, in front of it: the room's weather.vol)
  private bus: GainNode | null = null;
  private level = 1;
  private out(ctx: AudioContext): AudioNode {
    if (!this.bus) {
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = -12;
      c.knee.value = 8;
      c.ratio.value = 4;
      c.attack.value = 0.004;
      c.release.value = 0.25;
      c.connect(mixer.buses.ambience);
      const g = ctx.createGain();
      g.gain.value = this.level;
      g.connect(c);
      this.bus = g;
    }
    return this.bus;
  }
  /** The weather's volume (0 none, 1 as it is, 2 twice: the room's weather.vol, docs/plan/65). */
  volume(v: number): void {
    if (v === this.level) return;
    this.level = v;
    const ctx = mixer.ctx;
    if (this.bus && ctx) this.bus.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }
  /** The weather's volume as it is. */
  get vol(): number {
    return this.level;
  }
  /** a candidate other than the first (the bench's) */
  private chosen: Partial<Record<Slot, number>> = {};

  constructor(private readonly base = "/sfx/weather/") {}

  private ctx(): AudioContext | null {
    const c = mixer.ctx;
    return c && c.state === "running" ? c : null;
  }

  /** The bench's: candidate `i` for a slot (its beds and peals fetched again). */
  choose(slot: Slot, i: number): void {
    this.chosen[slot] = i;
    this.bufs.delete(slot);
    this.ready.delete(slot);
    const l = this.live.get(slot as Bed);
    if (l) {
      l.src.stop();
      l.gain.disconnect();
      this.live.delete(slot as Bed);
    }
  }

  // a slot's recordings: a bed's one, crossfaded to loop; thunder's every candidate's peals (unless
  // the bench chose one)
  private load(ctx: AudioContext, slot: Slot): AudioBuffer[] | null {
    const got = this.ready.get(slot);
    if (got) return got;
    if (this.bufs.has(slot)) return null;
    this.files ??= fetch(`${this.base}manifest.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((m: Record<string, { files: string[] }[]>) =>
        Object.fromEntries(Object.entries(m).map(([s, c]) => [s, c.map((x) => x.files)])),
      )
      // (none: asked again the next time)
      .catch(() => {
        this.files = null;
        return {};
      });
    const p = this.files.then(async (all) => {
      const c = all[slot] ?? [];
      const i = this.chosen[slot];
      const names = slot.startsWith("thunder") && i === undefined ? c.flat() : (c[i ?? 0] ?? []);
      const bufs = (
        await Promise.all(
          names.map((n) =>
            fetch(this.base + n)
              .then((r) => (r.ok ? r.arrayBuffer() : null))
              .then((b) => (b ? ctx.decodeAudioData(b) : null))
              .catch(() => null),
          ),
        )
      )
        .filter((b): b is AudioBuffer => !!b)
        .map((b) => (slot.startsWith("thunder") ? b : loopable(ctx, b)));
      // (only if it's still the one wanted: a pick made while it loaded loads its own)
      if (this.bufs.get(slot) === p) this.ready.set(slot, bufs);
      return bufs;
    });
    this.bufs.set(slot, p);
    return null;
  }

  update(dt: number, h: WxHere): void {
    const ctx = this.ctx();
    if (!ctx) return;
    this.dry = h.rain > 0.05 ? 0 : this.dry + dt;
    const mix = mixOf({ ...h, after: h.after ?? this.dry });
    const now = performance.now();
    for (const b of BEDS) {
      if (mix[b].level >= 0.002) this.wanted.set(b, now);
      this.bed(ctx, b, mix[b].level, mix[b].lp, dt);
    }
    if (h.thunder > 0.05) {
      this.wanted.set("thunder-near", now);
      this.wanted.set("thunder-far", now);
    }
    this.thunder(ctx, h);
    if (now - this.tidied > 10_000) this.tidy(now);
  }

  // a bed faded to `level`: started when it's first wanted, stopped once it's been silent a while
  private bed(ctx: AudioContext, b: Bed, level: number, lp: number, dt: number): void {
    let l = this.live.get(b);
    if (!l) {
      if (level < 0.002) return;
      const buf = this.load(ctx, b)?.[0];
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lp;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(f).connect(gain).connect(this.out(ctx));
      // (somewhere in it: two beds started together aren't in step)
      src.start(ctx.currentTime, Math.random() * buf.duration);
      l = { src, gain, lp: f, quiet: 0 };
      this.live.set(b, l);
    }
    l.gain.gain.setTargetAtTime(level, ctx.currentTime, 1.2);
    l.lp.frequency.setTargetAtTime(lp, ctx.currentTime, 0.4);
    l.quiet = level < 0.002 ? l.quiet + dt : 0;
    if (l.quiet > 8) {
      l.src.stop();
      l.gain.disconnect();
      this.live.delete(b);
    }
  }

  // the thunder after the sky's flash: this slot's strike, once
  private thunder(ctx: AudioContext, h: WxHere): void {
    if (h.thunder <= 0.05) return;
    const ms = Date.now();
    const s = strikeIn(ms, h.thunder);
    // (the near and the far peals both fetched while it thunders, before the first is due)
    const near = this.load(ctx, "thunder-near");
    const far = this.load(ctx, "thunder-far");
    if (!s || s.slot === this.heard || ms < s.at) return;
    this.heard = s.slot;
    const k = strikeFar(s.slot);
    const bank = k < 0.4 ? near : far;
    if (!bank?.length) return;
    const t = thunderOf(k, h.out, h.car);
    // (late by its distance from the flash: a moment already gone if I'd only just come)
    // (late by its distance from the flash; long gone — back to a hidden tab, or come in after it —
    // none at all)
    const late = (ms - s.at) / 1000 - t.delay;
    if (late > 0.5) return;
    const at = ctx.currentTime + Math.max(0, -late);
    const src = ctx.createBufferSource();
    src.buffer = bank[s.slot % bank.length];
    src.playbackRate.value = 0.92 + ((s.slot * 7) % 13) / 80;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = t.lp;
    const g = ctx.createGain();
    g.gain.value = t.gain * (0.8 + 0.4 * h.thunder) * 0.9;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.sin(s.slot * 3.1) * 0.6;
    src.connect(f).connect(g).connect(pan).connect(this.out(ctx));
    src.start(at);
    this.peals.add(src);
    src.onended = () => {
      this.peals.delete(src);
      pan.disconnect();
    };
  }

  // the recordings unwanted two minutes let go (not one playing)
  private tidy(now: number): void {
    this.tidied = now;
    for (const slot of [...this.bufs.keys()]) {
      if (this.live.has(slot as Bed)) continue;
      if (now - (this.wanted.get(slot) ?? 0) < LET_GO_MS) continue;
      this.bufs.delete(slot);
      this.ready.delete(slot);
    }
  }

  /** What's held now (the e2e's, the bench's): the slots whose recordings are in. */
  held(): Slot[] {
    return [...this.ready.keys()];
  }

  /** What's playing now and how loud (the e2e's, the bench's). */
  levels(): Partial<Record<Bed, number>> {
    return Object.fromEntries([...this.live].map(([b, l]) => [b, l.gain.gain.value]));
  }

  stop(): void {
    // (faded out over a moment, not cut: no click)
    const ctx = mixer.ctx;
    const t = ctx?.currentTime ?? 0;
    for (const l of this.live.values()) {
      l.gain.gain.cancelScheduledValues(t);
      l.gain.gain.setTargetAtTime(0, t, 0.08);
      l.src.stop(t + 0.5);
      l.src.onended = () => l.gain.disconnect();
    }
    this.live.clear();
    for (const p of this.peals) p.stop();
    this.peals.clear();
  }
}
