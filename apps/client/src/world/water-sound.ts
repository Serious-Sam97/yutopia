"use client";

import { mixer } from "./audio";
import { loopable } from "./weather-sound";

// The water's sound (docs/plan/66-the-water.md, S9 and phase 9): recordings (CC0, picked by ear on
// /dev/water-sound: public/sfx/water, its manifest; tools/sfx-water.json, made by tools/sfx-weather.mjs)
// fetched the first time they're heard:
//   - going in: a splash by how hard (a step down, a jump, a dive, a fall), a car's and its sinking;
//     the ice giving way;
//   - in it: strokes (breast; crawl going fast), treading still, a gasp coming up, out of breath after
//     long under (a man's or a woman's, by the swimmer: voiceOf); the wading steps are the steps' own (steps.ts, by the water over the feet);
//   - under: its bed, the current going by in the river, bubbles — everything else muffled (the
//     mixer's `muffle`);
//   - the water's own: the pond lapping at its shore, the rapid and the falls where they are (the
//     reaches' murmur is the weather's river);
//   - out: the climb out, drips off me for a while (the soaked steps: the steps').
// Part of the Grounds' sound (grounds-sound.ts): the controller says who's where, this plays it.

/** Where I am, for the water's beds. */
export interface WetHere {
  /** me in the water: 0 out, 1 wading, 2 afloat, 3 under */
  swim: number;
  /** how fast I'm going (m/s) */
  speed: number;
  /** out on the land (not in a car, nor indoors) */
  out: boolean;
  /** how high I hear from over the land (m): the water's sounds fade over the first fifteen up */
  up?: number;
  /** the pond's shore near: 0 none … 1 on it */
  pond: number;
  /** how far the rapid and the falls are (m) */
  rapid: number;
  falls: number;
  /** the current where I am, under (m/s) */
  current: number;
  /** the water's ice (the room's: 0 open … 1 frozen) */
  ice: number;
  /** s since I was last in the water (none yet: no drips), and how soaked I came out (0 … 1) */
  after?: number;
  soaked?: number;
}

export const LOOPS = ["under", "current", "pond-lap", "rapid", "falls", "tread", "drip-body"] as const;
export type Loop = (typeof LOOPS)[number];
export const SHOTS = [
  "in-step",
  "in-jump",
  "in-dive",
  "in-fall",
  "car-sink",
  "ice-crack",
  "stroke-breast",
  "stroke-crawl",
  "gasp-man",
  "gasp-woman",
  "breathless-man",
  "breathless-woman",
  "bubbles",
  "climb-out",
] as const;
export type Shot = (typeof SHOTS)[number];
type Slot = Loop | Shot;

/** each bed's level at its fullest (the recordings at −24 dB RMS, under the ambience bus) */
export const FULL: Record<Loop, number> = {
  under: 0.75,
  current: 0.55,
  "pond-lap": 0.45,
  rapid: 0.7,
  falls: 0.85,
  tread: 0.4,
  "drip-body": 0.35,
};
/** each one-shot's level (cut to peak about −3 dB, under the effects bus) */
export const LOUD: Record<Shot, number> = {
  "in-step": 0.45,
  "in-jump": 0.6,
  "in-dive": 0.55,
  "in-fall": 0.75,
  "car-sink": 0.6,
  "ice-crack": 0.7,
  "stroke-breast": 0.3,
  "stroke-crawl": 0.32,
  "gasp-man": 0.45,
  "gasp-woman": 0.45,
  "breathless-man": 0.35,
  "breathless-woman": 0.35,
  bubbles: 0.4,
  "climb-out": 0.45,
};
/** heard as they are under the water (not muffled) */
const CLEAR = new Set<Slot>(["under", "current", "bubbles"]);
/** how far the rapid and the falls are heard (m) */
export const RAPID_HEARD = 70;
export const FALLS_HEARD = 100;
/** how long the drips go on after I'm out (s) */
export const DRIPS_FOR = 45;
/** a stroke every so often (s): breast's slow pull, crawl's arm over arm going fast */
export const STROKE = { breast: 1.3, crawl: 0.62, fast: 1.9 };
/** how far someone else's water is heard (m) */
export const HEARD = 30;
/** how long the recordings are kept unwanted (ms) */
const LET_GO_MS = 120_000;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Each bed's level for where I am. Pure: the bench and the tests. */
export function mixOf(h: WetHere): Record<Loop, number> {
  const under = h.swim === 3;
  const low = 1 - clamp01(((h.up ?? 0) - 3) / 15);
  const where = h.out ? 1 : 0.15;
  const near = (d: number, far: number) => clamp01(1 - d / far) ** 1.5;
  // (the pond laps where it's open: none frozen over)
  const open = 1 - clamp01((h.ice - 0.3) / 0.5);
  const after = h.after ?? Number.POSITIVE_INFINITY;
  const drip =
    h.swim <= 1 && after < DRIPS_FOR ? (1 - after / DRIPS_FOR) ** 1.5 * clamp01(((h.soaked ?? 0) - 0.3) / 0.5) : 0;
  const lvl: Record<Loop, number> = {
    under: under ? 1 : 0,
    current: under ? clamp01(h.current / 1.5) : 0,
    "pond-lap": under ? 0 : h.pond * open * where * low,
    rapid: near(h.rapid, RAPID_HEARD) * where * low,
    falls: near(h.falls, FALLS_HEARD) * where * low,
    tread: h.swim === 2 ? (h.speed < 0.4 ? 1 : 0.35) : 0,
    "drip-body": drip,
  };
  for (const b of LOOPS) lvl[b] *= FULL[b];
  return lvl;
}

/** The splash going in, by how fast I was falling (m/s) and whether it took me under. */
export function splashOf(fall: number, under: boolean): { slot: Shot; gain: number } | null {
  if (fall < 1.5) return null;
  const slot: Shot = under && fall > 6 ? "in-dive" : fall < 3 ? "in-step" : fall < 7 ? "in-jump" : "in-fall";
  return { slot, gain: clamp01(0.55 + fall / 14) };
}

/** Whose voice gasps coming up: the avatar's gender; a neutral one's by who they are (one each, kept). */
export function voiceOf(gender: string | undefined, id: string): "man" | "woman" {
  if (gender === "masculine") return "man";
  if (gender === "feminine") return "woman";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h & 1 ? "woman" : "man";
}

/** Someone in or by the water this frame (my own `me`). */
export interface Wader {
  id: string;
  /** 0 out, 1 wading, 2 afloat, 3 under */
  swim: number;
  /** where they are (m), their feet's height */
  x: number;
  y: number;
  z: number;
  /** how loud (0 … 1) and where (−1 … 1) */
  gain: number;
  pan: number;
  /** their avatar's gender: whose gasp and breath (voiceOf) */
  gender?: string;
  me?: boolean;
}

interface Track {
  swim: number;
  x: number;
  y: number;
  z: number;
  speed: number;
  fall: number;
  under: number;
  stroke: number;
  bubble: number;
  seen: number;
}

interface Live {
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
  quiet: number;
}

export class WaterSound {
  private files: Promise<Record<string, string[][]>> | null = null;
  private bufs = new Map<Slot, Promise<AudioBuffer[]>>();
  private ready = new Map<Slot, AudioBuffer[]>();
  private last = new Map<Slot, number>();
  private wanted = new Map<Slot, number>();
  private live = new Map<Loop, Live>();
  private tidied = 0;
  /** who's in the water, as they were */
  private track = new Map<string, Track>();
  /** the cars in the water (their splash heard once), the ice's holes heard */
  private wetCars = new Set<string>();
  private holes = new Set<string>();
  private dry = Number.POSITIVE_INFINITY;
  private soaked = 0;
  private muffled = false;
  private started = false;
  /** a candidate other than the first (the bench's) */
  private chosen: Partial<Record<Slot, number>> = {};

  constructor(private readonly base = "/sfx/water/") {}

  private ctx(): AudioContext | null {
    const c = mixer.ctx;
    return c && c.state === "running" ? c : null;
  }

  /** The bench's: candidate `i` for a slot. */
  choose(slot: Slot, i: number): void {
    this.chosen[slot] = i;
    this.bufs.delete(slot);
    this.ready.delete(slot);
    const l = this.live.get(slot as Loop);
    if (l) {
      l.src.stop();
      l.gain.disconnect();
      this.live.delete(slot as Loop);
    }
  }

  /** A slot's recordings fetched (once) so its first isn't late. */
  preload(slot: Slot): void {
    const ctx = this.ctx();
    if (ctx) this.load(ctx, slot);
  }

  // a slot's recordings: a bed's one, crossfaded to loop; a one-shot's every take
  private load(ctx: AudioContext, slot: Slot): AudioBuffer[] | null {
    this.wanted.set(slot, performance.now());
    const got = this.ready.get(slot);
    if (got) return got;
    if (this.bufs.has(slot)) return null;
    this.files ??= fetch(`${this.base}manifest.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((m: Record<string, { files: string[] }[]>) =>
        Object.fromEntries(Object.entries(m).map(([s, c]) => [s, c.map((x) => x.files)])),
      )
      .catch(() => {
        this.files = null;
        return {};
      });
    const loop = (LOOPS as readonly string[]).includes(slot);
    const p = this.files.then(async (all) => {
      const names = all[slot]?.[this.chosen[slot] ?? 0] ?? [];
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
        .map((b) => (loop ? loopable(ctx, b, 0.05, Math.min(0.5, b.duration / 6)) : b));
      if (this.bufs.get(slot) === p) this.ready.set(slot, bufs);
      return bufs;
    });
    this.bufs.set(slot, p);
    return null;
  }

  /** One of a slot's takes, never the same twice running: `gain` 0 … 1, `pan` −1 … 1, `at` s on. */
  shot(slot: Shot, gain: number, pan = 0, at = 0): void {
    const ctx = this.ctx();
    if (!ctx || gain <= 0.01) return;
    const bank = this.load(ctx, slot);
    if (!bank?.length) return;
    let i = Math.floor(Math.random() * bank.length);
    if (bank.length > 1 && i === this.last.get(slot)) i = (i + 1) % bank.length;
    this.last.set(slot, i);
    const src = ctx.createBufferSource();
    src.buffer = bank[i];
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.08;
    const g = ctx.createGain();
    g.gain.value = LOUD[slot] * gain * 10 ** (((Math.random() - 0.5) * 2) / 20);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src
      .connect(g)
      .connect(p)
      .connect(CLEAR.has(slot) ? mixer.clear : mixer.buses.effects);
    src.start(ctx.currentTime + at);
    src.onended = () => p.disconnect();
  }

  /** This frame: where I am (the beds), who's in the water (their splashes, strokes, gasps), the cars
   *  near (one going in), the ice's holes (one giving way) — each with how loud and where. */
  update(
    dt: number,
    h: WetHere,
    waders: Wader[],
    cars: { id: string; wet: boolean; gain: number; pan: number }[] = [],
    holes: { key: string; gain: number; pan: number }[] = [],
  ): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const now = performance.now();
    // ── who's in the water ──
    const seen = new Set<string>();
    for (const w of waders) {
      seen.add(w.id);
      this.wader(w, dt, now);
    }
    for (const [id, t] of this.track) if (!seen.has(id) && now - t.seen > 2000) this.track.delete(id);
    // ── me: out for how long, how soaked ──
    if (h.swim >= 2) {
      this.dry = 0;
      this.soaked = 1;
    } else if (h.swim === 1) this.dry = Math.min(this.dry, 0);
    else this.dry += dt;
    // ── the beds ──
    const mix = mixOf({ ...h, after: h.after ?? this.dry, soaked: h.soaked ?? this.soaked });
    for (const b of LOOPS) this.bed(ctx, b, mix[b], dt);
    // ── under: the rest muffled ──
    const under = h.swim === 3;
    if (under !== this.muffled) {
      this.muffled = under;
      mixer.muffle(under ? 1 : 0);
    }
    // ── a car going in: its splash, then it sinking ──
    const wet = new Set<string>();
    for (const c of cars) {
      if (!c.wet) continue;
      wet.add(c.id);
      if (this.wetCars.has(c.id)) continue;
      this.shot("in-fall", c.gain, c.pan);
      this.shot("car-sink", c.gain, c.pan, 0.7);
    }
    this.wetCars = wet;
    if (cars.length) this.preload("in-fall");
    // ── the ice giving way: a hole that wasn't ──
    const keys = new Set<string>();
    for (const o of holes) {
      keys.add(o.key);
      // (the holes there when I came aren't heard giving way)
      if (this.started && !this.holes.has(o.key)) this.shot("ice-crack", o.gain, o.pan);
    }
    this.holes = keys;
    this.started = true;
    if (now - this.tidied > 10_000) this.tidy(now);
  }

  // someone in the water: going in, under and up, swimming, out
  private wader(w: Wader, dt: number, now: number): void {
    let t = this.track.get(w.id);
    if (!t) {
      t = {
        swim: w.swim,
        x: w.x,
        y: w.y,
        z: w.z,
        speed: 0,
        fall: 0,
        under: 0,
        stroke: Math.random(),
        bubble: 2,
        seen: now,
      };
      this.track.set(w.id, t);
      return;
    }
    // (how fast they were coming down, the last quarter second — a jump across the map, a teleport,
    // isn't a fall, nor swum)
    const went = Math.hypot(w.x - t.x, w.y - t.y);
    const vz = dt > 0 && went < 3 ? (w.z - t.z) / dt : 0;
    t.fall = Math.max(-vz, t.fall * Math.exp(-dt * 4));
    if (dt > 0 && went < 3) t.speed += (went / dt - t.speed) * Math.min(1, dt * 6);
    t.x = w.x;
    t.y = w.y;
    t.z = w.z;
    t.seen = now;
    const was = t.swim;
    t.swim = w.swim;
    const g = w.gain;
    if (g > 0.01 || w.me) {
      if (was <= 1 && w.swim >= 2) {
        // in: a splash by how hard (walked in off the shelf: none)
        const s = splashOf(t.fall, w.swim === 3);
        if (s) this.shot(s.slot, s.gain * g, w.pan);
      } else if (was === 2 && w.swim === 3) {
        // under: a duck dive's splash, my breath going out
        this.shot("in-step", 0.5 * g, w.pan);
        if (w.me) this.shot("bubbles", 0.8);
      } else if (was === 3 && w.swim === 2) {
        // up: a gasp the longer under; out of breath after long
        if (t.under > 3) this.shot(`gasp-${voiceOf(w.gender, w.id)}`, clamp01(0.5 + t.under / 20) * g, w.pan);
        if (t.under > 15)
          for (let i = 1; i <= 3; i++)
            this.shot(`breathless-${voiceOf(w.gender, w.id)}`, (1 - i * 0.2) * g, w.pan, 0.9 + i * 1.3);
      } else if (was >= 2 && w.swim === 0) this.shot("climb-out", g, w.pan);
      // swimming: a stroke now and then, crawl going fast
      if (w.swim === 2 && t.speed > 0.35) {
        const crawl = t.speed > STROKE.fast;
        t.stroke -= dt / (crawl ? STROKE.crawl : STROKE.breast);
        if (t.stroke <= 0) {
          t.stroke = 0.9 + Math.random() * 0.2;
          this.shot(crawl ? "stroke-crawl" : "stroke-breast", g, w.pan);
        }
      }
      // under: my breath out now and then
      if (w.swim === 3 && w.me) {
        t.bubble -= dt;
        if (t.bubble <= 0) {
          t.bubble = 3 + Math.random() * 4;
          this.shot("bubbles", 0.5 + Math.random() * 0.3);
        }
      }
    }
    t.under = w.swim === 3 ? t.under + dt : 0;
    // (the swimmer's sounds fetched as they go in: not late for the first stroke)
    if (w.swim >= 1 && (g > 0.01 || w.me))
      for (const s of ["in-jump", "stroke-breast", `gasp-${voiceOf(w.gender, w.id)}`, "climb-out"] as const)
        this.preload(s);
  }

  // a bed faded to `level`: started when it's first wanted, stopped once it's been silent a while
  private bed(ctx: AudioContext, b: Loop, level: number, dt: number): void {
    let l = this.live.get(b);
    if (!l) {
      if (level < 0.002) return;
      const buf = this.load(ctx, b)?.[0];
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      src
        .connect(gain)
        .connect(pan)
        .connect(CLEAR.has(b) ? mixer.clear : mixer.buses.ambience);
      src.start(ctx.currentTime, Math.random() * buf.duration);
      l = { src, gain, pan, quiet: 0 };
      this.live.set(b, l);
    }
    if (level >= 0.002) this.wanted.set(b, performance.now());
    // (under and out again quickly: a dive's a moment's change, the rest slow)
    l.gain.gain.setTargetAtTime(level, ctx.currentTime, b === "under" || b === "current" ? 0.08 : 0.8);
    l.quiet = level < 0.002 ? l.quiet + dt : 0;
    if (l.quiet > 8) {
      l.src.stop();
      l.gain.disconnect();
      this.live.delete(b);
    }
  }

  // the recordings unwanted two minutes let go (not one playing)
  private tidy(now: number): void {
    this.tidied = now;
    for (const slot of [...this.bufs.keys()]) {
      if (this.live.has(slot as Loop)) continue;
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
  levels(): Partial<Record<Loop, number>> {
    return Object.fromEntries([...this.live].map(([b, l]) => [b, l.gain.gain.value]));
  }

  stop(): void {
    const ctx = mixer.ctx;
    const t = ctx?.currentTime ?? 0;
    for (const l of this.live.values()) {
      l.gain.gain.cancelScheduledValues(t);
      l.gain.gain.setTargetAtTime(0, t, 0.08);
      l.src.stop(t + 0.5);
      l.src.onended = () => l.gain.disconnect();
    }
    this.live.clear();
    this.track.clear();
    if (this.muffled) mixer.muffle(0);
    this.muffled = false;
  }
}
