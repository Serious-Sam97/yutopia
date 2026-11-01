import type { Footing } from "@yutopia/shared/footing";

// The steps (docs/plan/63-the-steps.md, phase 2): a step's recording for what the feet are on (CC0,
// picked by ear on /dev/steps: public/sfx/steps, its manifest), never the same one twice running,
// a little higher or lower and louder or softer each time; the shoe as a filter on it (hard soles
// brighter, soft ones duller and quieter with a squeak now and then on a smooth floor, sandals a
// slap after), the gait as its weight (a crouch barely heard, a sprint's ball strike short). A
// surface's recordings fetched the first time it's stepped on; till they're in, the synth's step
// (sound.ts). Its own little chunk: the world page has no room left; the host hands it the audio.
export const STEPS_CHUNK = "yutopia-steps";

export type StepGait = "crouch" | "walk" | "jog" | "sprint";
/** Where a sound is (phase 5): its pan (−1..1), or its pan and a low-pass (Hz: far off, or through
 *  a doorway; 0 none) */
export type Place = number | { pan: number; lp: number };
export type Shoe = "hard" | "soft" | "sandals";

/** The next of a surface's `n` recordings — any but the `last` one. */
export function nextOf(n: number, last: number | undefined, r = Math.random): number {
  const i = Math.floor(r() * n);
  return n > 1 && i === last ? (i + 1 + Math.floor(r() * (n - 1))) % n : i;
}

/** steps sounding at once, at most (someone else's past it goes: mine always) */
export const LIVE = 8;

/** A shoe's family (shared avatar.ts's shoes): what it sounds like. */
export function shoeOf(shoes: string | undefined): Shoe {
  if (shoes === "sandals") return "sandals";
  return shoes && /boots|chelsea|loafers/.test(shoes) ? "hard" : "soft";
}

const LOUD: Record<StepGait, number> = { crouch: 0.22, walk: 0.7, jog: 0.85, sprint: 1 };
/** a step's level under the effects bus (recordings at about −22 dB RMS, peaks near 0; 0.5 → 0.38,
 *  2.4 dB down, on the user's ear 2026-11-01) */
const LEVEL = 0.38;
/** each surface's recordings brought to this RMS (their first 150 ms), so none stands out */
const TARGET = 10 ** (-22 / 20);
/** with no recordings of their own: another's, damped */
const BORROW: Partial<Record<Footing, Footing>> = { blackice: "ice" };
const DAMPED: Partial<Record<Footing, number>> = { felt: 1600 };

export interface StepOpts {
  gait: StepGait;
  shoe: Shoe;
  /** 0..1, how near (others'); 1 mine */
  gain?: number;
  /** where it is (−1..1; a low-pass too: far, or through a doorway) */
  pan?: Place;
  /** the context's time to play it (default now) */
  at?: number;
  /** a step setting off, stopping or turning on the spot: the sole scuffed along the ground too */
  scuff?: boolean;
}

interface Bank {
  bufs: AudioBuffer[];
  /** the surface's own level: brought to TARGET */
  gain: number;
}

export class StepPlayer {
  private files: Promise<Record<string, string[]>> | null = null;
  private banks = new Map<Footing, Promise<Bank | null>>();
  private ready = new Map<Footing, Bank | null>();
  private last = new Map<Footing, number>();
  /** steps sounding now */
  private live = 0;
  // everything the steps make goes out through this: the steps' volume (an admin's, for everyone)
  private master: GainNode | null = null;
  private level = 1;
  private dest(ctx: AudioContext): AudioNode {
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = this.level;
      this.master.connect(this.out());
    }
    return this.master;
  }
  /** The steps' volume (0 none, 1 as they are, 2 twice: the room's `stepsVol`, docs/plan/63). */
  volume(v: number): void {
    if (v === this.level) return;
    this.level = v;
    const ctx = this.ctx();
    if (this.master && ctx) this.master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }
  /** The steps' volume as it is. */
  get vol(): number {
    return this.level;
  }

  constructor(
    private readonly ctx: () => AudioContext | null,
    private readonly out: () => AudioNode,
    /** the synth's step, while a surface's recordings aren't in (sound.ts) */
    private readonly synth: (f: Footing, gain: number) => void,
    private readonly base = "/sfx/steps/",
  ) {}

  /** The audio's clock (s), for what's scheduled a moment on: 0 with no audio. */
  now(): number {
    return this.ctx()?.currentTime ?? 0;
  }

  /** A surface's recordings, fetched (once) so its first step isn't the synth's. */
  preload(f: Footing): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const k = BORROW[f] ?? f;
    if (this.banks.has(k)) return;
    this.files ??= fetch(`${this.base}manifest.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((m: Record<string, { files: string[] }[]>) =>
        Object.fromEntries(Object.entries(m).map(([s, c]) => [s, c[0]?.files ?? []])),
      )
      .catch(() => ({}));
    const p = this.files.then(async (all) => {
      const bufs = (
        await Promise.all(
          (all[k] ?? []).map((n) =>
            fetch(this.base + n)
              .then((r) => (r.ok ? r.arrayBuffer() : null))
              .then((b) => (b ? ctx.decodeAudioData(b) : null))
              .catch(() => null),
          ),
        )
      ).filter((b): b is AudioBuffer => !!b);
      const bank = bufs.length ? { bufs, gain: levelOf(bufs) } : null;
      this.ready.set(k, bank);
      return bank;
    });
    this.banks.set(k, p);
  }

  /** One step on `f`. */
  step(f: Footing, o: StepOpts): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const near = o.gain ?? 1;
    if (near <= 0.01) return;
    const loud = LOUD[o.gait] * near;
    const k = BORROW[f] ?? f;
    const bank = this.ready.get(k);
    if (!bank) {
      this.preload(f);
      this.synth(f, loud);
      return;
    }
    // (so many at once and no more: someone else's quieter one goes — never mine)
    if (this.live >= LIVE && near < 1) return;
    const at = o.at ?? ctx.currentTime;
    const i = nextOf(bank.bufs.length, this.last.get(k));
    this.last.set(k, i);
    const b = bank.bufs[i];
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = (1 + (Math.random() - 0.5) * 0.08) * (o.gait === "sprint" ? 1.04 : 1);
    // the shoe: hard soles brighter, soft duller, sandals soft with a slap after
    const tone = ctx.createBiquadFilter();
    if (o.shoe === "hard") {
      tone.type = "highshelf";
      tone.frequency.value = 2500;
      tone.gain.value = 3;
    } else {
      tone.type = "lowpass";
      tone.frequency.value = o.shoe === "soft" ? 3400 : 4200;
      tone.Q.value = 0.6;
    }
    // the gait (a crouch dull) and a surface borrowing another's recordings (the felt over carpet)
    const cut = Math.min(o.gait === "crouch" ? 2200 : 18000, DAMPED[f] ?? 18000);
    let dull: AudioNode = tone;
    if (cut < 18000) {
      const d = ctx.createBiquadFilter();
      d.type = "lowpass";
      d.frequency.value = cut;
      tone.connect(d);
      dull = d;
    }
    const g = ctx.createGain();
    const vary = 10 ** (((Math.random() - 0.5) * 3) / 20);
    const level =
      LEVEL *
      bank.gain *
      loud *
      vary *
      (o.shoe === "soft" ? 0.72 : o.shoe === "sandals" ? 0.8 : 1.05) *
      (BORROW[f] || DAMPED[f] ? 0.7 : 1);
    // (a sprint lands on the ball of the foot: short)
    const len = o.gait === "sprint" ? Math.min(b.duration, 0.24) : b.duration;
    g.gain.setValueAtTime(level, at);
    g.gain.setValueAtTime(level, at + len * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, at + len);
    this.route(ctx, g, o.pan ?? 0);
    src.connect(tone);
    dull.connect(g);
    src.start(at);
    src.stop(at + len + 0.02);
    this.live++;
    src.onended = () => {
      this.live--;
    };
    // (what goes with it, when it does: its own way out)
    const extra = () => this.placed(ctx, o.pan ?? 0);
    if (o.shoe === "sandals") this.slap(ctx, extra(), at + 0.06 + Math.random() * 0.02, 0.09 * loud);
    if (o.scuff) this.noise(ctx, extra(), at + 0.02, 0.14, "bandpass", BAND[f] * 1.3, 1.2, 0.06 * loud, 0.03);
    if (o.shoe === "soft" && (f === "tile" || f === "wood") && Math.random() < 0.08)
      this.squeak(ctx, extra(), at + 0.04, 0.025 * loud);
  }

  /** A paw (pets: docs/plan/63, phase 3) — the surface's own step, short, light and higher (`rate`),
   *  and a dog's claws ticking on a hard floor. */
  paw(f: Footing, o: { rate: number; gain: number; len: number; claws?: boolean; pan?: Place }): void {
    const ctx = this.ctx();
    if (!ctx || o.gain <= 0.01) return;
    const k = BORROW[f] ?? f;
    const bank = this.ready.get(k);
    if (!bank) {
      this.preload(f);
      return;
    }
    const at = ctx.currentTime;
    const b = bank.bufs[Math.floor(Math.random() * bank.bufs.length)];
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = o.rate * (1 + (Math.random() - 0.5) * 0.1);
    const g = ctx.createGain();
    const level = LEVEL * bank.gain * o.gain;
    g.gain.setValueAtTime(level, at);
    g.gain.linearRampToValueAtTime(0.0001, at + o.len);
    const p = this.placed(ctx, o.pan ?? 0);
    src.connect(g).connect(p);
    src.start(at);
    src.stop(at + o.len + 0.02);
    if (o.claws && HARD.has(f)) {
      const c = ctx.createOscillator();
      const cg = ctx.createGain();
      c.type = "square";
      c.frequency.setValueAtTime(3800 + Math.random() * 900, at + 0.01);
      cg.gain.setValueAtTime(0.0001, at + 0.01);
      cg.gain.exponentialRampToValueAtTime(0.02 * o.gain, at + 0.012);
      cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
      c.connect(cg).connect(p);
      c.start(at + 0.01);
      c.stop(at + 0.04);
    }
  }

  // a sandal's sole slapping the heel after the step
  private slap(ctx: AudioContext, out: AudioNode, at: number, peak: number): void {
    this.noise(ctx, out, at, 0.04, "bandpass", 1500, 1.1, peak);
  }

  // noise through a filter, `len` s from `at` (`attack`: eased in, s; else struck); `loop`: held
  // till the stop it returns
  private noiseBuf: AudioBuffer | null = null;
  private noise(
    ctx: AudioContext,
    out: AudioNode,
    at: number,
    len: number,
    type: BiquadFilterType,
    f: number,
    q: number,
    peak: number,
    attack = 0,
    loop = false,
  ): (fade?: number) => void {
    if (!this.noiseBuf || this.noiseBuf.sampleRate !== ctx.sampleRate) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    const bp = ctx.createBiquadFilter();
    bp.type = type;
    bp.frequency.value = f;
    bp.Q.value = q;
    const g = ctx.createGain();
    if (attack) {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + attack);
    } else g.gain.setValueAtTime(peak, at);
    if (!loop) g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    s.connect(bp).connect(g).connect(out);
    s.start(at, Math.random() * 1.5);
    if (!loop) s.stop(at + len + 0.02);
    let done = false;
    return (fade = 0.12) => {
      if (done) return;
      done = true;
      const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      s.stop(t + fade + 0.02);
    };
  }

  // ── the other moments the feet (and hands, and the body) meet something (phase 4) ──
  // where a sound goes (phase 5): through its low-pass (far off, through a doorway) and its pan, out
  // dry and into the room's reverb
  private placed(ctx: AudioContext, place: Place): AudioNode {
    const head = ctx.createGain();
    this.route(ctx, head, place);
    return head;
  }
  // `from` on out that way: its low-pass and pan only when it has them (a step of mine: straight out)
  private route(ctx: AudioContext, from: AudioNode, place: Place): void {
    const pan = typeof place === "number" ? place : place.pan;
    const lp = typeof place === "number" ? 0 : place.lp;
    let tail: AudioNode = from;
    if (lp > 0 && lp < 15000) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lp;
      f.Q.value = 0.5;
      tail.connect(f);
      tail = f;
    }
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      tail.connect(p);
      tail = p;
    }
    tail.connect(this.dest(ctx));
    const wet = this.wet();
    if (wet) tail.connect(wet);
  }

  // ── the room (phase 5): one reverb, its impulse made for the kind of space I'm in, crossfaded
  //    between two as it changes ──
  private room: {
    send: GainNode;
    conv: [ConvolverNode, ConvolverNode];
    gain: [GainNode, GainNode];
    live: 0 | 1;
    space: Space;
  } | null = null;
  private irs = new Map<Space, AudioBuffer>();
  private wet(): AudioNode | null {
    const r = this.room;
    return r && SPACES[r.space].wet > 0 ? r.send : null;
  }
  /** The kind of space I'm in (the controller's, as I go): the steps' reverb. */
  space(s: Space): void {
    const ctx = this.ctx();
    if (!ctx || this.room?.space === s) return;
    if (!this.room) {
      const send = ctx.createGain();
      send.gain.value = 0;
      const conv: [ConvolverNode, ConvolverNode] = [ctx.createConvolver(), ctx.createConvolver()];
      const gain: [GainNode, GainNode] = [ctx.createGain(), ctx.createGain()];
      for (const i of [0, 1] as const) {
        gain[i].gain.value = 0;
        send.connect(conv[i]).connect(gain[i]).connect(this.dest(ctx));
      }
      this.room = { send, conv, gain, live: 0, space: "dry" };
    }
    const r = this.room;
    const t = ctx.currentTime;
    const S = SPACES[s];
    r.send.gain.setTargetAtTime(S.wet, t, 0.15);
    if (S.wet > 0) {
      // (into the idle one, then over to it)
      const next: 0 | 1 = r.live === 0 ? 1 : 0;
      let ir = this.irs.get(s);
      if (!ir) {
        ir = impulse(ctx, S);
        this.irs.set(s, ir);
      }
      r.conv[next].buffer = ir;
      r.gain[next].gain.setTargetAtTime(1, t, 0.15);
      r.gain[r.live].gain.setTargetAtTime(0, t, 0.15);
      r.live = next;
    }
    r.space = s;
  }

  /** Both feet down from a jump or a fall (`hard` 0..1): the surface's steps together, harder, and
   *  (a hard one, `thud` not false: a jump's has its own, jumps.ts) the body's weight through them. */
  land(
    f: Footing,
    hard: number,
    o: { gain?: number; pan?: Place; shoe?: Shoe; at?: number; thud?: boolean } = {},
  ): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const at = o.at ?? ctx.currentTime;
    const g = (o.gain ?? 1) * (0.7 + 0.7 * hard);
    for (const dt of [0, 0.02 + Math.random() * 0.015])
      this.step(f, { gait: hard > 0.5 ? "sprint" : "jog", shoe: o.shoe ?? "soft", gain: g, pan: o.pan, at: at + dt });
    if (hard > 0.3 && o.thud !== false) this.thud(hard * (o.gain ?? 1), o.pan ?? 0, at);
  }

  /** A body meeting the ground (a fall's, a roll's, the ragdoll's): a dull thump and its cloth. */
  thud(gain: number, pan: Place = 0, at?: number): void {
    const ctx = this.ctx();
    if (!ctx || gain <= 0.01) return;
    const t = at ?? ctx.currentTime;
    const out = this.placed(ctx, pan);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.3 * gain, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.25);
    this.noise(ctx, out, t, 0.12, "lowpass", 500, 0.7, 0.18 * gain);
    this.cloth(gain * 0.6, pan, 0.25, t + 0.01);
  }

  /** Clothes moving: a rustle `len` s long. */
  cloth(gain: number, pan: Place = 0, len = 0.3, at?: number): void {
    const ctx = this.ctx();
    if (!ctx || gain <= 0.01) return;
    this.noise(ctx, this.placed(ctx, pan), at ?? ctx.currentTime, len, "bandpass", 1300, 0.6, 0.05 * gain, len * 0.3);
  }

  /** A hand on something: a vault's push off it, a ledge caught, a bar gripped. */
  hand(gain: number, pan: Place = 0, at?: number): void {
    const ctx = this.ctx();
    if (!ctx || gain <= 0.01) return;
    const t = at ?? ctx.currentTime;
    const out = this.placed(ctx, pan);
    this.noise(ctx, out, t, 0.06, "bandpass", 2100, 0.9, 0.25 * gain);
    this.noise(ctx, out, t, 0.05, "bandpass", 700, 1.2, 0.15 * gain);
  }

  /** Sliding on the surface (a slide, a skid, a roll): its scrape — held till the stop it returns
   *  (`len` none), or `len` s; the snow sprays. */
  scrape(f: Footing, gain: number, pan: Place = 0, len = 0): (() => void) | null {
    const ctx = this.ctx();
    if (!ctx || gain <= 0.01) return null;
    const t = ctx.currentTime;
    const out = this.placed(ctx, pan);
    const loop = !len;
    const a = this.noise(ctx, out, t, len, "bandpass", BAND[f], 1.1, 0.12 * gain, 0.04, loop);
    const b = SPRAY.has(f) ? this.noise(ctx, out, t, len, "highpass", 4500, 0.7, 0.05 * gain, 0.04, loop) : null;
    return () => {
      a();
      b?.();
    };
  }

  /** Metal on metal (a grind along a rail): held till the stop it returns. */
  grind(gain: number, pan: Place = 0): (() => void) | null {
    const ctx = this.ctx();
    if (!ctx || gain <= 0.01) return null;
    const t = ctx.currentTime;
    const out = this.placed(ctx, pan);
    const a = this.noise(ctx, out, t, 0, "bandpass", 3200, 6, 0.1 * gain, 0.05, true);
    const ring = ctx.createOscillator();
    const rg = ctx.createGain();
    ring.frequency.value = 1380 + Math.random() * 120;
    ring.frequency.setTargetAtTime(1300, t, 0.6);
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(0.012 * gain, t + 0.08);
    ring.connect(rg).connect(out);
    ring.start(t);
    return () => {
      a();
      const n = ctx.currentTime;
      rg.gain.cancelScheduledValues(n);
      rg.gain.setValueAtTime(Math.max(0.0001, rg.gain.value), n);
      rg.gain.exponentialRampToValueAtTime(0.0001, n + 0.2);
      ring.stop(n + 0.25);
    };
  }

  /** A lift's car under a landing (`hard` 0..1): its floor on its cables, a hollow boom and a rattle. */
  liftCar(hard: number, gain: number, pan: Place = 0, at?: number): void {
    const ctx = this.ctx();
    if (!ctx || gain * hard <= 0.01) return;
    const t = at ?? ctx.currentTime;
    const out = this.placed(ctx, pan);
    const g = gain * (0.4 + 0.6 * hard);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(74, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.5);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.22 * g, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.65);
    this.noise(ctx, out, t, 0.45, "bandpass", 230, 4, 0.12 * g, 0.005);
    this.noise(ctx, out, t + 0.03, 0.18, "bandpass", 2600, 5, 0.04 * g);
  }

  /** A seat taking the weight (`down`) or giving it back: a soft settle and a creak. */
  seat(down: boolean, gain: number, pan: Place = 0): void {
    const ctx = this.ctx();
    if (!ctx || gain <= 0.01) return;
    const t = ctx.currentTime + (down ? 0.25 : 0.1);
    const out = this.placed(ctx, pan);
    if (down) this.noise(ctx, out, t, 0.16, "lowpass", 260, 0.7, 0.3 * gain);
    const o = ctx.createOscillator();
    const bp = ctx.createBiquadFilter();
    const og = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(down ? 120 : 105, t);
    o.frequency.exponentialRampToValueAtTime(down ? 92 : 125, t + 0.22);
    bp.type = "bandpass";
    bp.frequency.value = 650;
    bp.Q.value = 3;
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.03 * gain, t + 0.04);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(bp).connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.3);
    this.cloth(gain * 0.5, pan, 0.3, t - 0.1);
  }

  // a soft sole's squeak on a smooth floor
  private squeak(ctx: AudioContext, out: AudioNode, at: number, peak: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(2300, at);
    o.frequency.exponentialRampToValueAtTime(3100, at + 0.06);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.08);
  }
}

/** The kinds of space the steps ring in (phase 5): out in the open and the woods dry, a paved
 *  street a slap off the buildings, rooms by their size, the stairwell's concrete, the server
 *  room's metal, a lift's car, a booth's deadened walls. */
export type Space = "dry" | "street" | "booth" | "small" | "room" | "hall" | "stairs" | "server" | "lift";
/** each one's tail (s, to −60 dB), how much of a step goes into it, how bright it is (Hz), a slap (s) */
export const SPACES: Record<Space, { len: number; wet: number; bright: number; slap?: number }> = {
  dry: { len: 0, wet: 0, bright: 0 },
  street: { len: 0.35, wet: 0.08, bright: 4000, slap: 0.07 },
  booth: { len: 0.12, wet: 0.05, bright: 3000 },
  small: { len: 0.35, wet: 0.1, bright: 5000 },
  room: { len: 0.6, wet: 0.14, bright: 5500 },
  hall: { len: 1.1, wet: 0.18, bright: 6500 },
  stairs: { len: 1.8, wet: 0.26, bright: 7500 },
  server: { len: 0.7, wet: 0.16, bright: 8000 },
  lift: { len: 0.2, wet: 0.14, bright: 3500 },
};

/** A space's impulse, made: stereo noise dying away over its tail, darkened to its brightness (a
 *  one-pole low-pass), a street's slap off the buildings as an echo early in it. */
export function impulse(ctx: BaseAudioContext, S: (typeof SPACES)[Space]): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * (S.len + (S.slap ?? 0))));
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  const k = Math.exp((-2 * Math.PI * S.bright) / ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate;
      lp = (1 - k) * (Math.random() * 2 - 1) + k * lp;
      d[i] = lp * Math.exp((-6.9 * t) / Math.max(S.len, 0.01));
    }
    if (S.slap) {
      const at = Math.floor(S.slap * ctx.sampleRate) + c * 37;
      for (let i = 0; i < 300 && at + i < n; i++) d[at + i] += 1.5 * Math.exp(-i / 60) * (Math.random() * 2 - 1);
    }
  }
  return b;
}

// a surface's scrape: the band its noise is in (the synth's, sound.ts); the snow's spray
const BAND: Record<Footing, number> = {
  wood: 900,
  hollow: 700,
  carpet: 380,
  tile: 2400,
  concrete: 1900,
  rock: 1700,
  asphalt: 1500,
  grate: 3200,
  sheet: 2600,
  earth: 600,
  felt: 320,
  snow: 1800,
  deep: 900,
  packed: 2300,
  ice: 3600,
  slush: 1200,
  blackice: 3600,
};
const SPRAY = new Set<Footing>(["snow", "deep", "packed", "slush"]);

// hard floors (a dog's claws heard on them)
const HARD = new Set<Footing>([
  "wood",
  "hollow",
  "tile",
  "concrete",
  "rock",
  "asphalt",
  "grate",
  "sheet",
  "ice",
  "blackice",
]);

// ── everyone else's (docs/plan/63-the-steps.md, phase 3) ─────────────────────────────────────────

/** Someone drawn this frame, as the 3D view has them (the controller's bodies). */
export interface Walker {
  id: string;
  x: number;
  y: number;
  z?: number;
  ground?: number;
  level?: number;
  /** their anim (1 walking, 2 sitting) */
  a?: number;
  /** their gait, crouching and aiming in a byte (Player.mv); none: by their speed */
  mv?: number;
  avatar?: { shoes?: string };
  /** a verb under way (mine; someone's: their jump's kind — a verb's or a jump's) */
  verb?: { kind: string } | null;
  /** a Flowmotion move: mine as it is, someone's by its code (shared move flowCode) */
  flow?: { kind: string } | null;
  flowCode?: number;
  jump?: unknown;
  emote?: string;
  pet?: { species: string };
}

/** Where I hear from: my id and floor, a walker's gain (the voices' rule), pan (the camera's), what's
 *  under their feet, and whether they're down (the dark's: crawling, or kneeling by someone). */
export interface Ears {
  me: string;
  level: number;
  gain(w: Walker): number;
  pan(w: Walker): number;
  /** their low-pass (Hz; 0 none): far off, through a doorway (phase 5) */
  lp?(w: Walker): number;
  footing(w: Walker): Footing;
  down?(id: string): "down" | "kneel" | undefined;
  /** standing in a lift's car (its floor answers a landing) */
  lift?(w: Walker): boolean;
}

/** this far (tiles) and no further, and only so many at once: the nearest */
export const HEARD = 9;
export const VOICES = 12;
/** Player.mv's gait (shared move GAITS: still, walk, jog, sprint, crouch, aim) as a step's */
const MV_GAITS = ["walk", "walk", "jog", "sprint", "crouch", "walk", "walk", "walk"] as const;
/** the verbs (shared move VERBS) and Flowmotion's codes (shared move flow.ts CODES), as they go on
 *  the wire — a copy (the shared module's on the page: steps.test.ts checks they agree) */
export const VERB_KINDS = ["vault", "mantle", "roll", "slide", "adash"];
export const FLOW_CODES = ["wallrun", "wallside", "swing", "grind", "hang", "climb", "spin"];
/** half a stride, by gait (tiles): a step by the way gone */
const HALF: Record<StepGait, number> = { walk: 0.62, crouch: 0.66, jog: 1.31, sprint: 1.77 };
/** a crawl's hand or knee down (tiles) */
const CRAWL = 0.35;
/** a paw: how far between them (tiles), its pitch, how loud, how long; a cat's barely heard but on snow */
const PAWS: Record<string, { every: number; rate: number; gain: number; len: number; claws?: boolean }> = {
  dog: { every: 0.22, rate: 1.7, gain: 0.35, len: 0.1, claws: true },
  cat: { every: 0.2, rate: 1.9, gain: 0.05, len: 0.08 },
  rabbit: { every: 0.45, rate: 0.85, gain: 0.3, len: 0.12 },
  capybara: { every: 0.3, rate: 1.2, gain: 0.4, len: 0.12 },
  platypus: { every: 0.18, rate: 1.6, gain: 0.25, len: 0.09 },
  parrot: { every: 0.15, rate: 2.2, gain: 0.08, len: 0.06 },
};
const SOFT_SNOW = new Set<Footing>(["snow", "deep", "packed", "slush"]);
/** a fall heard from this high (m); a roll from this (locomotion's) */
/** walked this long (s) with no step of their body's, it isn't stepping: steps by the way they go */
const QUIET = 0.5;
const FALL = 0.3;
const ROLL = 2.2;
/** a body's step this slow (tiles/s) is setting off, stopping or turning on the spot: scuffed */
export const SCUFF = 1.2;
/** the emotes' feet, by their poses (chars/anim/acts.ts emote2): the tape's a foot down each time its
 *  sway crosses the middle (sin(4.4 t)), the fist pump's one hop down at 1.45 s (its second pump,
 *  sin(6.5 t), between 0.9 and 1.9 s) */
export const TAPE = Math.PI / 4.4;
export const PUMP_DOWN = (3 * Math.PI) / 6.5;

interface Heard {
  x: number;
  y: number;
  /** tiles a second, eased; and what it was a moment ago (a skid's braking) */
  speed: number;
  was: number;
  way: number;
  /** walked this long (s) with no foot of their body's put down: it isn't stepping (off screen…) */
  quiet: number;
  side: "L" | "R";
  /** among the nearest, on my floor, this frame */
  near: boolean;
  w: Walker;
  // what they were doing last frame (a moment is its change)
  verb: string;
  flow: string;
  flowT: number;
  /** how high over what's under them they've been since they left it (m) */
  top: number;
  sat: boolean;
  emote: string;
  emoteT: number;
  down: string;
  skidAt: number;
  /** a slide's or a grind's sound, held while it lasts */
  loop: (() => void) | null;
}

const verbOf = (w: Walker) => (w.verb && VERB_KINDS.includes(w.verb.kind) ? w.verb.kind : "");
const flowOf = (w: Walker) => w.flow?.kind ?? (w.flowCode ? (FLOW_CODES[(w.flowCode & 15) - 1] ?? "") : "");

/** Everyone else's steps: their body's feet as they land (the 3D view's, on screen), else by the way
 *  they go — the nearest few, as loud and where the voices' rule has them. And every other moment a
 *  body meets something, mine too (phase 4): the moves (a vault's hand, a mantle's scramble, a
 *  roll, a slide's scrape, a wall run's steps and its kick, a grind, a bar gripped), a fall off an
 *  edge, a seat, an emote's steps, a skid, a crawl. */
export class Footfalls {
  private heard = new Map<string, Heard>();
  private ears: Ears | null = null;

  constructor(private readonly player: StepPlayer) {}

  /** This frame's walkers (`dt` s since the last, `now` ms). */
  frame(walkers: Walker[], ears: Ears, dt: number, now: number): void {
    this.ears = ears;
    const near: { h: Heard; d: number }[] = [];
    const ids = new Set<string>();
    let meAt: Walker | undefined;
    for (const w of walkers) if (w.id === ears.me) meAt = w;
    let mine: Heard | null = null;
    for (const w of walkers) {
      ids.add(w.id);
      let h = this.heard.get(w.id);
      if (!h) {
        // (as they are when first seen: nothing heard for what they were already doing)
        h = {
          x: w.x,
          y: w.y,
          speed: 0,
          was: 0,
          way: 0,
          quiet: 0,
          side: "R",
          near: false,
          w,
          verb: verbOf(w),
          flow: flowOf(w),
          flowT: 0,
          top: 0,
          sat: w.a === 2,
          emote: w.emote ?? "",
          emoteT: 0,
          down: ears.down?.(w.id) ?? "",
          skidAt: 0,
          loop: null,
        };
        this.heard.set(w.id, h);
      }
      const went = Math.hypot(w.x - h.x, w.y - h.y);
      h.x = w.x;
      h.y = w.y;
      h.w = w;
      h.near = false;
      // (a jump across the map — a teleport, a floor changed — isn't walked)
      if (went > 1.5 || dt <= 0) continue;
      h.was = h.speed;
      h.speed += (went / dt - h.speed) * Math.min(1, dt * 8);
      h.way = this.moving(w, h) ? h.way + went : 0;
      if (went > 0 && this.moving(w, h)) h.quiet += dt;
      if (w.id === ears.me) mine = h;
      else {
        const d = meAt ? Math.hypot(w.x - meAt.x, w.y - meAt.y) : 0;
        if ((w.level ?? 0) === ears.level && d <= HEARD) near.push({ h, d });
      }
    }
    for (const [id, h] of [...this.heard])
      if (!ids.has(id)) {
        h.loop?.();
        this.heard.delete(id);
      }
    near.sort((a, b) => a.d - b.d);
    const heard = near.slice(0, VOICES).map((n) => n.h);
    if (mine) heard.push(mine);
    for (const h of heard) {
      h.near = true;
      this.moments(h, dt, now);
      if (h.w.id === ears.me && h.down !== "down") continue; // (my steps: the controller's)
      if (!this.moving(h.w, h)) continue;
      const pet = h.w.pet;
      if (pet) {
        const P = PAWS[pet.species] ?? PAWS.dog;
        if (h.way >= P.every) {
          h.way = 0;
          this.paw(h, P);
        }
      } else if (h.down === "down") {
        if (h.way >= CRAWL) this.crawl(h);
      } else if (h.quiet >= QUIET && h.way >= HALF[this.gait(h)]) this.play(h);
    }
    // (out of earshot, a slide's or a grind's sound ends)
    for (const h of this.heard.values()) if (!h.near && h.loop) this.endLoop(h);
  }

  // where they're heard from: the camera's pan, and their low-pass (far, or another room)
  private placeOf(w: Walker): Place {
    const ears = this.ears;
    if (!ears || w.id === ears.me) return 0;
    return { pan: ears.pan(w), lp: ears.lp?.(w) ?? 0 };
  }

  /** A foot of theirs put down (their body's, on screen). */
  body(id: string, side: "L" | "R"): void {
    const h = this.heard.get(id);
    if (!h?.near || h.w.id === this.ears?.me || h.down || !this.moving(h.w, h)) return;
    h.quiet = 0;
    h.side = side;
    this.play(h, h.speed < SCUFF);
  }

  /** Both feet down at once out of their body's own hop (a turn round from a run). */
  landed(id: string, hard: number): void {
    const h = this.heard.get(id);
    const ears = this.ears;
    if (!h?.near || !ears || h.w.id === ears.me) return;
    const g = ears.gain(h.w);
    if (g > 0.02)
      this.player.land(ears.footing(h.w), hard, {
        gain: g,
        pan: this.placeOf(h.w),
        shoe: shoeOf(h.w.avatar?.shoes),
        thud: false,
      });
  }

  /** Limp on the ragdoll, a body hit something (the 3D view's): a thud by how hard. */
  impact(id: string, hard: number): void {
    const h = this.heard.get(id);
    const ears = this.ears;
    if (!h?.near || !ears) return;
    this.player.thud(hard * ears.gain(h.w), this.placeOf(h.w));
  }

  /** Off a car (the controller's: they were in it): their feet on the ground. */
  alight(id: string): void {
    const h = this.heard.get(id);
    const ears = this.ears;
    if (!h || !ears) return;
    const gain = ears.gain(h.w);
    if (gain > 0.02)
      this.player.land(ears.footing(h.w), 0.15, {
        gain: gain * 0.7,
        pan: this.placeOf(h.w),
        shoe: shoeOf(h.w.avatar?.shoes),
      });
  }

  // walking, on their feet: not sat, in the air, a verb or a move
  private moving(w: Walker, h: Heard): boolean {
    if (w.a === 2 || verbOf(w) || flowOf(w) || w.jump) return false;
    if (w.z !== undefined && w.ground !== undefined && w.z > w.ground + 0.05) return false;
    return w.a === 1 || h.speed > 0.3;
  }

  private gait(h: Heard): StepGait {
    const mv = h.w.mv;
    if (mv !== undefined && mv & 7) return (mv & 8) !== 0 ? "crouch" : MV_GAITS[mv & 7];
    return h.speed > 6 ? "sprint" : h.speed > 3.2 ? "jog" : "walk";
  }

  private play(h: Heard, scuff = false): void {
    const ears = this.ears;
    if (!ears) return;
    h.way = 0;
    const gain = ears.gain(h.w);
    if (gain <= 0.02) return;
    this.player.step(ears.footing(h.w), {
      gait: this.gait(h),
      shoe: shoeOf(h.w.avatar?.shoes),
      gain,
      pan: this.placeOf(h.w),
      scuff,
    });
  }

  private paw(h: Heard, P: (typeof PAWS)[string]): void {
    const ears = this.ears;
    if (!ears) return;
    const gain = ears.gain(h.w);
    if (gain <= 0.02) return;
    const f = ears.footing(h.w);
    // (a cat's soft pads: heard only in the snow)
    const g = h.w.pet?.species === "cat" && SOFT_SNOW.has(f) ? 0.25 : P.gain;
    this.player.paw(f, { rate: P.rate, gain: g * gain, len: P.len, claws: P.claws, pan: this.placeOf(h.w) });
  }

  // on hands and knees (the dark's down): a hand or a knee on the floor, and the clothes dragged
  private crawl(h: Heard): void {
    const ears = this.ears;
    if (!ears) return;
    h.way = 0;
    const gain = ears.gain(h.w);
    if (gain <= 0.02) return;
    const pan = this.placeOf(h.w);
    this.player.step(ears.footing(h.w), { gait: "crouch", shoe: "soft", gain: gain * 1.6, pan });
    this.player.cloth(gain * 0.8, pan, 0.25);
  }

  private endLoop(h: Heard): void {
    h.loop?.();
    h.loop = null;
  }

  // what changed since the last frame: a move begun or ended, a fall's landing, a seat, an emote, a
  // skid, getting down or up
  private moments(h: Heard, dt: number, now: number): void {
    const ears = this.ears;
    if (!ears) return;
    const w = h.w;
    const gain = () => ears.gain(w);
    const pan = () => this.placeOf(w);
    const f = () => ears.footing(w);
    const P = this.player;
    // a move: its start (and a wall run's kick at its end), what's held while it lasts
    const verb = verbOf(w);
    if (verb !== h.verb) {
      this.endLoop(h);
      if (verb) this.verbStart(h, verb, gain(), pan(), f);
      h.verb = verb;
    }
    const flow = flowOf(w);
    if (flow !== h.flow) {
      const g = gain();
      if ((h.flow === "wallrun" || h.flow === "wallside") && g > 0.02)
        P.step("concrete", { gait: "sprint", shoe: shoeOf(w.avatar?.shoes), gain: g * 1.3, pan: pan() });
      this.endLoop(h);
      if (flow && g > 0.02) {
        if (flow === "grind") h.loop = P.grind(g, pan());
        else if (flow === "hang" || flow === "swing") {
          P.hand(g, pan());
          P.cloth(g, pan(), 0.3);
        } else if (flow === "climb") {
          P.hand(g, pan());
          const ctx = P.now();
          for (const t of [0.15, 0.35, 0.55])
            P.step("concrete", {
              gait: "crouch",
              shoe: shoeOf(w.avatar?.shoes),
              gain: g * 1.5,
              pan: pan(),
              at: ctx + t,
            });
        }
      }
      h.flow = flow;
      h.flowT = 0;
    }
    // (on a wall, running: the feet on it, quick)
    if (flow === "wallrun" || flow === "wallside") {
      h.flowT += dt;
      if (h.flowT >= 0.16) {
        h.flowT -= 0.16;
        const g = gain();
        if (g > 0.02) P.step("concrete", { gait: "sprint", shoe: shoeOf(w.avatar?.shoes), gain: g, pan: pan() });
      }
    }
    // off an edge: in the air with no jump of their own, then down — as hard as how far
    const up = w.z !== undefined && w.ground !== undefined && w.z > w.ground + 0.05;
    if (up && !w.jump && !verb && !flow) h.top = Math.max(h.top, (w.z ?? 0) - (w.ground ?? 0));
    else if (!up && h.top > 0) {
      if (h.top >= FALL && !w.jump) {
        const g = gain();
        if (g > 0.02) {
          P.land(f(), Math.min(1, h.top / ROLL), { gain: g, pan: pan(), shoe: shoeOf(w.avatar?.shoes) });
          if (ears.lift?.(w)) P.liftCar(Math.min(1, h.top / ROLL), g, pan());
          if (h.top >= ROLL) {
            P.thud(g, pan());
            P.scrape(f(), g, pan(), 0.4);
          }
        }
      }
      h.top = 0;
    } else if (w.jump || verb || flow) h.top = 0;
    // a seat taking the weight, or given back
    const sat = w.a === 2;
    if (sat !== h.sat) {
      P.seat(sat, gain(), pan());
      h.sat = sat;
    }
    // the emotes with feet in them: the tape's side steps, the fist pump's stomp, up onto the toes
    const emote = w.emote ?? "";
    if (emote !== h.emote) {
      h.emote = emote;
      h.emoteT = 0;
    } else if (emote) {
      const t0 = h.emoteT;
      h.emoteT += dt;
      const past = (t: number) => t0 < t && h.emoteT >= t;
      const step = (gait: StepGait, k: number) =>
        P.step(f(), { gait, shoe: shoeOf(w.avatar?.shoes), gain: gain() * k, pan: pan() });
      if (emote === "tape" && Math.floor(h.emoteT / TAPE) > Math.floor(t0 / TAPE)) step("walk", 0.8);
      else if (emote === "fire" && past(PUMP_DOWN))
        P.land(f(), 0.3, { gain: gain(), pan: pan(), shoe: shoeOf(w.avatar?.shoes), thud: false });
    }
    // a skid: braking hard from a run, on their feet
    if (h.was > 4 && (h.speed - h.was) / Math.max(dt, 1e-3) < -14 && !up && !verb && !flow && now - h.skidAt > 800) {
      h.skidAt = now;
      P.scrape(f(), gain(), pan(), 0.35);
    }
    // down (crawling) or kneeling by someone: a knee on the floor
    const down = ears.down?.(w.id) ?? "";
    if (down !== h.down) {
      if (down) {
        P.thud(gain() * 0.35, pan());
        P.cloth(gain(), pan(), 0.3);
      }
      h.down = down;
    }
  }

  // a verb begun: a vault's hand on what it goes over and the feet after; a mantle's hand and its
  // scramble up; a roll over the shoulder; a slide's scrape, held while it lasts
  private verbStart(h: Heard, verb: string, g: number, pan: Place, f: () => Footing): void {
    if (g <= 0.02) return;
    const P = this.player;
    const shoe = shoeOf(h.w.avatar?.shoes);
    const t = P.now();
    if (verb === "vault") {
      P.hand(g, pan, t + 0.12);
      P.land(f(), 0.25, { gain: g * 0.8, pan, shoe, at: t + 0.42 });
    } else if (verb === "mantle") {
      P.hand(g, pan);
      for (const d of [0.18, 0.36]) P.step("concrete", { gait: "crouch", shoe, gain: g * 1.5, pan, at: t + d });
    } else if (verb === "roll") {
      P.thud(g * 0.6, pan);
      P.cloth(g, pan, 0.5);
      P.scrape(f(), g * 0.6, pan, 0.4);
    } else if (verb === "slide") h.loop = P.scrape(f(), g, pan);
  }
}

/** The gain that brings a surface's recordings to TARGET: their onsets' RMS, averaged (kept to ×0.5–×3). */
export function levelOf(bufs: AudioBuffer[]): number {
  let sum = 0;
  for (const b of bufs) {
    const d = b.getChannelData(0);
    const n = Math.min(d.length, Math.floor(b.sampleRate * 0.15));
    let s = 0;
    for (let i = 0; i < n; i++) s += d[i] * d[i];
    sum += Math.sqrt(s / Math.max(1, n));
  }
  const rms = sum / Math.max(1, bufs.length);
  return Math.max(0.5, Math.min(3, TARGET / Math.max(rms, 1e-6)));
}
