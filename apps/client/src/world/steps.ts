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
export type Shoe = "hard" | "soft" | "sandals";

/** A shoe's family (shared avatar.ts's shoes): what it sounds like. */
export function shoeOf(shoes: string | undefined): Shoe {
  if (shoes === "sandals") return "sandals";
  return shoes && /boots|chelsea|loafers/.test(shoes) ? "hard" : "soft";
}

const LOUD: Record<StepGait, number> = { crouch: 0.22, walk: 0.7, jog: 0.85, sprint: 1 };
/** a step's level under the effects bus (recordings at about −22 dB RMS, peaks near 0) */
const LEVEL = 0.5;
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
  /** −1..1, where it is */
  pan?: number;
  /** the context's time to play it (default now) */
  at?: number;
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

  constructor(
    private readonly ctx: () => AudioContext | null,
    private readonly out: () => AudioNode,
    /** the synth's step, while a surface's recordings aren't in (sound.ts) */
    private readonly synth: (f: Footing, gain: number) => void,
    private readonly base = "/sfx/steps/",
  ) {}

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
    const at = o.at ?? ctx.currentTime;
    // (never the same one twice running)
    const n = bank.bufs.length;
    let i = Math.floor(Math.random() * n);
    if (n > 1 && i === this.last.get(k)) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
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
    const dull = ctx.createBiquadFilter();
    dull.type = "lowpass";
    dull.frequency.value = Math.min(o.gait === "crouch" ? 2200 : 18000, DAMPED[f] ?? 18000);
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
    let end: AudioNode = g;
    if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      g.connect(p);
      end = p;
    }
    end.connect(this.out());
    src.connect(tone).connect(dull).connect(g);
    src.start(at);
    src.stop(at + len + 0.02);
    if (o.shoe === "sandals")
      this.slap(ctx, end === g ? this.out() : end, at + 0.06 + Math.random() * 0.02, 0.09 * loud);
    if (o.shoe === "soft" && (f === "tile" || f === "wood") && Math.random() < 0.08)
      this.squeak(ctx, end === g ? this.out() : end, at + 0.04, 0.025 * loud);
  }

  /** A paw (pets: docs/plan/63, phase 3) — the surface's own step, short, light and higher (`rate`),
   *  and a dog's claws ticking on a hard floor. */
  paw(f: Footing, o: { rate: number; gain: number; len: number; claws?: boolean; pan?: number }): void {
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
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan ?? 0));
    src.connect(g).connect(p).connect(this.out());
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
    const len = 0.04;
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    s.connect(bp).connect(g).connect(out);
    s.start(at);
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
  verb?: unknown;
  flowCode?: number;
  jump?: unknown;
  pet?: { species: string };
}

/** Where I hear from: my id and floor, a walker's gain (the voices' rule), pan (the camera's) and
 *  what's under their feet. */
export interface Ears {
  me: string;
  level: number;
  gain(w: Walker): number;
  pan(w: Walker): number;
  footing(w: Walker): Footing;
}

/** this far (tiles) and no further, and only so many at once: the nearest */
export const HEARD = 9;
export const VOICES = 12;
/** Player.mv's gait (shared move GAITS: still, walk, jog, sprint, crouch, aim) as a step's */
const MV_GAITS = ["walk", "walk", "jog", "sprint", "crouch", "walk", "walk", "walk"] as const;
/** half a stride, by gait (tiles): a step by the way gone */
const HALF: Record<StepGait, number> = { walk: 0.62, crouch: 0.66, jog: 1.31, sprint: 1.77 };
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

interface Heard {
  x: number;
  y: number;
  /** tiles a second, eased */
  speed: number;
  way: number;
  /** when their body last put a foot down (ms) */
  body: number;
  side: "L" | "R";
  /** among the nearest, on my floor, this frame */
  near: boolean;
  w: Walker;
}

/** Everyone else's steps: their body's feet as they land (the 3D view's, on screen), else by the way
 *  they go — the nearest few, as loud and where the voices' rule has them. */
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
    for (const w of walkers) {
      if (w.id === ears.me) continue;
      ids.add(w.id);
      let h = this.heard.get(w.id);
      if (!h) {
        h = { x: w.x, y: w.y, speed: 0, way: 0, body: 0, side: "R", near: false, w };
        this.heard.set(w.id, h);
      }
      const went = Math.hypot(w.x - h.x, w.y - h.y);
      h.x = w.x;
      h.y = w.y;
      h.w = w;
      h.near = false;
      // (a jump across the map — a teleport, a floor changed — isn't walked)
      if (went > 1.5 || dt <= 0) continue;
      h.speed += (went / dt - h.speed) * Math.min(1, dt * 8);
      if (!this.moving(w, h)) {
        h.way = 0;
        continue;
      }
      h.way += went;
      const d = meAt ? Math.hypot(w.x - meAt.x, w.y - meAt.y) : 0;
      if ((w.level ?? 0) === ears.level && d <= HEARD) near.push({ h, d });
    }
    for (const id of [...this.heard.keys()]) if (!ids.has(id)) this.heard.delete(id);
    near.sort((a, b) => a.d - b.d);
    for (const { h } of near.slice(0, VOICES)) {
      h.near = true;
      const pet = h.w.pet;
      if (pet) {
        const P = PAWS[pet.species] ?? PAWS.dog;
        if (h.way >= P.every) {
          h.way = 0;
          this.paw(h, P);
        }
      } else if (now - h.body > 700 && h.way >= HALF[this.gait(h)]) this.play(h);
    }
  }

  /** A foot of theirs put down (their body's, on screen). */
  body(id: string, side: "L" | "R", now: number): void {
    const h = this.heard.get(id);
    if (!h?.near || !this.moving(h.w, h)) return;
    h.body = now;
    h.side = side;
    this.play(h);
  }

  // walking, on their feet: not sat, in the air, a verb or a move
  private moving(w: Walker, h: Heard): boolean {
    if (w.a === 2 || w.verb || w.flowCode || w.jump) return false;
    if (w.z !== undefined && w.ground !== undefined && w.z > w.ground + 0.05) return false;
    return w.a === 1 || h.speed > 0.3;
  }

  private gait(h: Heard): StepGait {
    const mv = h.w.mv;
    if (mv !== undefined && mv & 7) return (mv & 8) !== 0 ? "crouch" : MV_GAITS[mv & 7];
    return h.speed > 6 ? "sprint" : h.speed > 3.2 ? "jog" : "walk";
  }

  private play(h: Heard): void {
    const ears = this.ears;
    if (!ears) return;
    h.way = 0;
    const gain = ears.gain(h.w);
    if (gain <= 0.02) return;
    this.player.step(ears.footing(h.w), {
      gait: this.gait(h),
      shoe: shoeOf(h.w.avatar?.shoes),
      gain,
      pan: ears.pan(h.w),
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
    this.player.paw(f, { rate: P.rate, gain: g * gain, len: P.len, claws: P.claws, pan: ears.pan(h.w) });
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
