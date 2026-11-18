// A board heard (docs/plan/104-the-skate-again.md, F12a): Tony Hawk's sound model. Eleven slots a surface — the wheels
// rolling (a loop), a grind (a loop), the pop, the landing, a bonk into something, off a grind and onto one, a slide
// (a loop: board-, lip-, tailslides), off a slide and onto one, a powerslide (the cess) — on concrete, wood (the
// ramps' masonite), metal (rails, coping) and asphalt (the streets); and the board's own: a push's foot on the ground,
// a bail (her body and the board's clatter), the wheels spinning in the air (spinning down over ~3 s: the pitch
// dropping, then silent), the kick-up to the hand, a wooden ramp's hollow boom under a landing, the board put down.
//   - The wheels' loop is pitched and levelled straight by the speed (speed/maxSpeed between each surface's least
//     and most — Tony Hawk's way); a grind's or a slide's loops while it's on; off the ground the roll stops and the
//     wheels' spin winds down.
//   - Each slot plays chosen.json's pick of its candidates (public/sfx/skate/manifest.json, cut by
//     tools/sfx-skate.mjs, picked by ear on /dev/skate-sound): a recording (a shot's takes, or a bed's seamless loop
//     between its `loop` points), another slot's pitched and filtered (a reuse: no recording for that surface), or −1
//     the one made here (noise and tones) — which also plays till the recording's in.
//   - SkateSound is my own board (distance-free); SkateVoice another's at a distance (the wheels, a grind, a landing:
//     the cars' distanceGain).
import { asset } from "@/lib/asset";
import { mixer } from "../audio";
import { distanceGain } from "../car/sound";
import { sample } from "../sfx";

export type SkateSurface = "concrete" | "wood" | "metal" | "asphalt";
export const SKATE_SURFACES: readonly SkateSurface[] = ["concrete", "wood", "metal", "asphalt"];
/** Tony Hawk's eleven, each a surface's ("<slot>.<surface>") */
export const SKATE_SLOTS = [
  "roll",
  "grind",
  "jump",
  "land",
  "bonk",
  "grind-jump",
  "grind-land",
  "slide",
  "slide-jump",
  "slide-land",
  "cess",
] as const;
/** the board's own, one for every surface */
export const SKATE_OWN = ["push", "bail", "spin", "kickup", "boom", "on"] as const;
/** the slots that loop */
export const SKATE_BEDS = new Set(["roll", "grind", "slide", "spin"]);
export type SkateState = "roll" | "air" | "grind" | "slide" | "manual" | "wall" | "lip" | "off";
export type SkateHit =
  | "jump"
  | "land"
  | "bonk"
  | "grind-jump"
  | "grind-land"
  | "slide-jump"
  | "slide-land"
  | "cess"
  | "bail"
  | "kick-up"
  | "on"
  | "off";
export interface SkateUpdate {
  /** m/s, and the board's most (the wheels' pitch and level go straight between them) */
  speed: number;
  maxSpeed: number;
  /** what the wheels are on */
  surface: SkateSurface;
  state: SkateState;
  /** a grind's or a slide's: what it's on (the surface's by default) */
  grindOn?: SkateSurface;
  /** in the air this long (s): the wheels' spin-down (else timed here from the take-off) */
  airT?: number;
  /** 0..1 the push's cycle (0: not pushing) — the foot down as each starts */
  push: number;
}

// ── the bank ──
export interface SkateCand {
  name: string;
  files?: string[];
  /** a bed's seamless loop (s) */
  loop?: [number, number];
  /** a bed's: played this much faster than the surface's rates */
  pitch?: number;
  /** a reuse: that slot's pick, at `rate`, through `lp`/`hp` (Hz), `gain` */
  reuse?: string;
  rate?: number;
  lp?: number;
  hp?: number;
  gain?: number;
  title?: string;
  author?: string;
  source?: string;
  license?: string;
}
type SkateMan = Record<string, SkateCand[]>;
let bankP: Promise<{ man: SkateMan; chosen: Record<string, number> } | null> | null = null;
/** The skate's recordings' list and picks, once. */
export function skateBank() {
  const j = (f: string) =>
    fetch(asset(`/sfx/skate/${f}`))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  bankP ??= Promise.all([j("manifest.json"), j("chosen.json")]).then(([man, chosen]) => {
    if (!man) return null;
    const m: SkateMan = {};
    for (const [k, v] of Object.entries(man as Record<string, unknown>)) if (Array.isArray(v)) m[k] = v as SkateCand[];
    return { man: m, chosen: (chosen ?? {}) as Record<string, number> };
  });
  return bankP;
}
/** A slot's sound, decoded: its takes, a bed's loop, how it's played. */
export interface SkateTake {
  bufs: AudioBuffer[];
  loop: [number, number] | null;
  rate: number;
  lp: number;
  hp: number;
  gain: number;
}
/** A slot's pick (`picks`: the bench's, over chosen.json's; `only`: that candidate), a reuse followed; null for
 *  none (the one made here). */
export async function skateTakes(
  ctx: BaseAudioContext,
  slot: string,
  picks: Record<string, number> = {},
  only?: number,
  depth = 0,
): Promise<SkateTake | null> {
  const b = await skateBank();
  const i = only ?? picks[slot] ?? b?.chosen[slot] ?? 0;
  const c = i >= 0 ? b?.man[slot]?.[i] : undefined;
  if (!c || depth > 3) return null;
  if (c.reuse) {
    const t = await skateTakes(ctx, c.reuse, picks, undefined, depth + 1);
    if (!t) return null;
    return {
      ...t,
      rate: t.rate * (c.rate ?? 1),
      lp: Math.min(t.lp, c.lp ?? 20000),
      hp: Math.max(t.hp, c.hp ?? 0),
      gain: t.gain * (c.gain ?? 1),
    };
  }
  const bufs = (await Promise.all((c.files ?? []).map((f) => sample(ctx, `skate/${f}`)))).filter(
    (x): x is AudioBuffer => !!x,
  );
  if (!bufs.length) return null;
  return { bufs, loop: c.loop ?? null, rate: c.pitch ?? 1, lp: 20000, hp: 0, gain: 1 };
}
/** A take's chain in: its high- and low-pass where it has them, into `dest`. */
function chainIn(ctx: BaseAudioContext, take: { lp: number; hp: number }, dest: AudioNode): AudioNode {
  let node = dest;
  if (take.lp < 19000) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = take.lp;
    f.connect(node);
    node = f;
  }
  if (take.hp > 20) {
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = take.hp;
    f.connect(node);
    node = f;
  }
  return node;
}
/** One of a take's shots, once, into `dest` (the bench's, and the boards'). */
export function playTake(
  ctx: BaseAudioContext,
  dest: AudioNode,
  take: SkateTake,
  gain = 1,
  rate = 1,
  which?: number,
): AudioBufferSourceNode | null {
  const buf = take.bufs[which ?? Math.floor(Math.random() * take.bufs.length)];
  if (!buf) return null;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = take.rate * rate;
  const g = ctx.createGain();
  g.gain.value = gain * take.gain;
  g.connect(chainIn(ctx, take, dest));
  s.connect(g);
  s.start();
  return s;
}

const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (r: readonly [number, number], k: number) => r[0] + (r[1] - r[0]) * k;

/** Each surface's wheels: their pitch and level at a crawl and at the board's most (Tony Hawk's min and max). */
const ROLL: Record<SkateSurface, { rate: [number, number]; vol: [number, number] }> = {
  concrete: { rate: [0.72, 1.3], vol: [0.22, 0.85] },
  wood: { rate: [0.7, 1.22], vol: [0.28, 1] },
  metal: { rate: [0.82, 1.4], vol: [0.22, 0.8] },
  asphalt: { rate: [0.7, 1.25], vol: [0.32, 1] },
};
/** A grind's and a slide's loop: their pitch and level by the speed. */
const RUB = { rate: [0.88, 1.14] as [number, number], vol: [0.6, 1] as [number, number] };
/** The wheels' spin in the air: winding down to silent over this long (s). */
const SPIN_S = 3;

// ── made here: noise (brown for the wheels' rumble, white for a scrape) and tones ──
const noises = new Map<string, AudioBuffer>();
function noiseBuf(c: BaseAudioContext, brown: boolean): AudioBuffer {
  const key = `${brown}:${c.sampleRate}`;
  const have = noises.get(key);
  if (have) return have;
  const n = c.sampleRate * 2;
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  let s = 777;
  let last = 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const w = (s / 0x7fffffff) * 2 - 1;
    last = (last + 0.06 * w) / 1.06;
    d[i] = brown ? last * 3.2 + w * 0.12 : w * 0.5;
  }
  // (its ends crossfaded: looped without a click)
  const x = Math.floor(c.sampleRate * 0.05);
  for (let i = 0; i < x; i++) {
    const k = i / x;
    d[i] = d[i] * k + d[n - x + i] * (1 - k);
  }
  noises.set(key, b);
  return b;
}
/** A bed made here (−1, or till the recording's in): noise through a band, how loud. */
function madeBed(slot: string, surf: SkateSurface): { brown: boolean; f: number; q: number; gain: number } {
  if (slot === "roll")
    return {
      brown: true,
      f: { concrete: 380, wood: 250, metal: 720, asphalt: 520 }[surf],
      q: { concrete: 1, wood: 1.3, metal: 2, asphalt: 0.7 }[surf],
      gain: 0.55,
    };
  if (slot === "spin") return { brown: false, f: 1500, q: 9, gain: 0.35 };
  const metal = surf === "metal";
  return {
    brown: false,
    f: (slot === "grind"
      ? { concrete: 900, wood: 600, metal: 2600, asphalt: 1100 }
      : { concrete: 1000, wood: 700, metal: 1800, asphalt: 1200 })[surf],
    q: metal ? (slot === "grind" ? 9 : 4) : 1.2,
    gain: metal ? 0.3 : 0.4,
  };
}

/** A loop: started as it's first heard, stopped after it's been quiet a while (no source runs silent for long). */
class Bed {
  private src: AudioBufferSourceNode | null = null;
  private srcRec = false;
  private g: GainNode;
  private chain: AudioNode | null = null;
  private quietAt = 0;
  private level = 0;
  take: SkateTake | null = null;
  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
    private slot: string,
    private surf: SkateSurface,
  ) {
    this.g = ctx.createGain();
    this.g.gain.value = 0;
    this.g.connect(dest);
  }
  /** Its level and pitch now (eased over `tc` s). */
  set(gain: number, rate: number, tc = 0.06) {
    const c = this.ctx;
    const t = c.currentTime;
    let fresh = false;
    if (gain > 0.002) {
      this.quietAt = 0;
      // (the recording came in while the made one played: over to it)
      if (this.src && !this.srcRec && this.take) this.stop();
      if (!this.src) {
        this.start();
        fresh = true;
      }
    } else if (this.src) {
      if (!this.quietAt) this.quietAt = t;
      else if (t - this.quietAt > 1.5) this.stop();
    }
    const made = this.srcRec ? null : madeBed(this.slot, this.surf);
    const level = gain * (made ? made.gain : (this.take?.gain ?? 1));
    this.level = level;
    this.g.gain.setTargetAtTime(level, t, tc);
    const r = rate * (made ? 1 : (this.take?.rate ?? 1));
    // (a loop just started is at its pitch at once; then it's eased)
    if (this.src && fresh) this.src.playbackRate.value = r;
    else if (this.src) this.src.playbackRate.setTargetAtTime(r, t, tc);
  }
  get on() {
    return this.level > 0.002;
  }
  private start() {
    const c = this.ctx;
    const s = c.createBufferSource();
    const take = this.take;
    s.loop = true;
    if (take?.bufs[0]) {
      const b = take.bufs[0];
      s.buffer = b;
      const [a, z] = take.loop ?? [0, b.duration];
      s.loopStart = a;
      s.loopEnd = Math.min(z, b.duration);
      this.chain = chainIn(c, take, this.g);
      s.connect(this.chain);
      s.start(c.currentTime, a + Math.random() * Math.max(0, s.loopEnd - a));
      this.srcRec = true;
    } else {
      const m = madeBed(this.slot, this.surf);
      s.buffer = noiseBuf(c, m.brown);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = m.f;
      bp.Q.value = m.q;
      bp.connect(this.g);
      this.chain = bp;
      s.connect(bp);
      s.start(c.currentTime, Math.random() * 1.5);
      this.srcRec = false;
    }
    this.src = s;
  }
  stop() {
    try {
      this.src?.stop();
    } catch {}
    this.src?.disconnect();
    if (this.chain && this.chain !== this.g) this.chain.disconnect();
    this.src = null;
    this.chain = null;
  }
  dispose() {
    this.stop();
    this.g.disconnect();
  }
}

/** What's shared by mine and another's: the slots' takes as they come in, the loops, the one-offs. */
abstract class Board {
  protected out: GainNode;
  protected takes = new Map<string, SkateTake>();
  protected beds = new Map<string, Bed>();
  protected gone = false;
  private lastTake = new Map<string, AudioBuffer>();
  constructor(
    protected ctx: AudioContext,
    slots: string[],
    protected picks: Record<string, number> = {},
  ) {
    this.out = ctx.createGain();
    for (const slot of slots)
      void skateTakes(ctx, slot, picks).then((t) => {
        if (this.gone || !t) return;
        this.takes.set(slot, t);
        const b = this.beds.get(slot);
        if (b) b.take = t;
      });
  }
  protected bed(slot: string, surf: SkateSurface | null): Bed {
    const key = surf ? `${slot}.${surf}` : slot;
    let b = this.beds.get(key);
    if (!b) {
      b = new Bed(this.ctx, this.out, slot, surf ?? "concrete");
      b.take = this.takes.get(key) ?? null;
      this.beds.set(key, b);
    }
    return b;
  }
  /** Every loop of `slot` to `gain` on `surf`, the others of it quiet. */
  protected beds4(slot: string, surf: SkateSurface | null, gain: number, rate: number, tc = 0.06) {
    for (const s of SKATE_SURFACES) {
      const key = `${slot}.${s}`;
      if (s === surf) this.bed(slot, s).set(gain, rate, tc);
      else this.beds.get(key)?.set(0, rate, tc);
    }
  }
  /** A slot's shot (a take not the last one), or the one made here. */
  protected shot(key: string, gain: number, rate = 1) {
    const t = this.takes.get(key);
    if (!t) {
      this.made(key, gain);
      return;
    }
    let i = Math.floor(Math.random() * t.bufs.length);
    if (t.bufs.length > 1 && t.bufs[i] === this.lastTake.get(key)) i = (i + 1) % t.bufs.length;
    this.lastTake.set(key, t.bufs[i]);
    playTake(this.ctx, this.out, t, gain, rate * (0.96 + Math.random() * 0.08), i);
  }
  /** The one made here: a burst of noise through a band, a falling tone. */
  protected made(key: string, gain: number) {
    const [slot, surf = "concrete"] = key.split(".") as [string, SkateSurface | undefined];
    const metal = surf === "metal";
    const wood = surf === "wood";
    switch (slot) {
      case "jump":
        this.burst(2200, 0.03, 0.4 * gain, 3);
        this.tone(wood ? 120 : 150, 0.07, 0.35 * gain);
        break;
      case "land":
      case "slide-land":
      case "grind-land":
        this.burst(metal ? 2600 : 900, 0.05, 0.4 * gain, metal ? 6 : 1.5);
        this.tone(metal ? 520 : wood ? 85 : 110, metal ? 0.3 : 0.1, 0.3 * gain);
        break;
      case "grind-jump":
      case "slide-jump":
        this.burst(metal ? 3000 : 1300, 0.04, 0.35 * gain, metal ? 5 : 2);
        break;
      case "bonk":
        this.tone(metal ? 640 : wood ? 190 : 120, metal ? 0.5 : 0.15, 0.45 * gain);
        this.burst(metal ? 2400 : 700, 0.04, 0.3 * gain, 2);
        break;
      case "cess":
        this.burst(1700, 0.45, 0.3 * gain, 0.8);
        break;
      case "push":
        this.burst(1600, 0.08, 0.14 * gain, 0.8);
        break;
      case "bail":
        this.burst(400, 0.25, 0.45 * gain, 0.7);
        this.tone(90, 0.2, 0.4 * gain);
        this.burst(2600, 0.06, 0.3 * gain, 3);
        break;
      case "kickup":
        this.burst(1800, 0.03, 0.3 * gain, 3);
        this.tone(220, 0.05, 0.2 * gain);
        break;
      case "boom":
        this.tone(68, 0.5, 0.5 * gain, 0.8);
        this.burst(160, 0.3, 0.3 * gain, 0.8);
        break;
      default:
        this.burst(1400, 0.04, 0.25 * gain, 2.5);
    }
  }
  private burst(freq: number, len: number, gain: number, q: number) {
    const c = this.ctx;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = noiseBuf(c, false);
    s.playbackRate.value = 1.5;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(bp).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + len + 0.02);
  }
  private tone(freq: number, len: number, gain: number, drop = 0.5) {
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * drop, t + len);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + len + 0.02);
  }
  /** The wheels (and a grind's or a slide's loop) by the state: shared by mine and another's. */
  protected wheels(o: SkateUpdate, slideAs: "slide" | "grind") {
    const k = clamp(o.speed / Math.max(0.1, o.maxSpeed));
    const st = o.state;
    const rolling = (st === "roll" || st === "manual" || st === "wall") && o.speed > 0.15;
    const r = ROLL[o.surface];
    const crawl = clamp(o.speed / 0.8);
    this.beds4(
      "roll",
      rolling ? o.surface : null,
      rolling ? lerp(r.vol, k) * crawl * (st === "manual" ? 0.72 : 1) : 0,
      lerp(r.rate, k) * (st === "manual" ? 1.04 : 1),
      st === "air" ? 0.03 : 0.06,
    );
    const on = o.grindOn ?? o.surface;
    const rub = lerp(RUB.vol, k) * clamp(o.speed / 1.5, 0.45, 1);
    const rr = lerp(RUB.rate, k);
    this.beds4("grind", st === "grind" || (st === "slide" && slideAs === "grind") ? on : null, rub, rr, 0.03);
    if (slideAs === "slide") this.beds4("slide", st === "slide" ? on : null, rub, rr, 0.03);
  }
  protected quiet() {
    for (const b of this.beds.values()) b.set(0, 1, 0.06);
  }
  dispose() {
    this.gone = true;
    for (const b of this.beds.values()) b.dispose();
    this.beds.clear();
    this.out.disconnect();
  }
}

const ALL_SLOTS = [...SKATE_SLOTS.flatMap((s) => SKATE_SURFACES.map((f) => `${s}.${f}`)), ...SKATE_OWN];

/** My own board: every slot, heard right here. */
export class SkateSound extends Board {
  private pushWas = 0;
  private airAt = -1;
  private spin0 = { rate: 1, vol: 0 };
  private wasAir = false;
  constructor(ctx: AudioContext, dest: AudioNode = mixer.buses.effects, picks: Record<string, number> = {}) {
    super(ctx, ALL_SLOTS, picks);
    this.out.gain.value = 0.9;
    this.out.connect(dest);
  }

  /** Every frame: how fast, on what, doing what. */
  update(o: SkateUpdate): void {
    if (this.gone) return;
    if (o.state === "off") {
      this.hush();
      return;
    }
    this.wheels(o, "slide");
    // the wheels' spin in the air: from the take-off's pitch down, silent after SPIN_S
    const air = o.state === "air";
    const k = clamp(o.speed / Math.max(0.1, o.maxSpeed));
    if (air && !this.wasAir) {
      this.airAt = this.ctx.currentTime;
      this.spin0 = { rate: lerp([0.8, 1.3], k), vol: 0.15 + 0.5 * k };
    }
    this.wasAir = air;
    const spin = this.bed("spin", null);
    if (air) {
      const f = clamp((o.airT ?? this.ctx.currentTime - this.airAt) / SPIN_S);
      spin.set(this.spin0.vol * (1 - f) ** 1.6, this.spin0.rate * (1 - 0.6 * f), 0.05);
    } else if (spin.on) spin.set(0, this.spin0.rate, 0.03);
    // a push's foot down, as each of its cycles starts
    if (o.push > 0 && (this.pushWas === 0 || o.push < this.pushWas) && o.state === "roll")
      this.shot("push", 0.45 + 0.25 * Math.random(), o.surface === "asphalt" ? 0.95 : 1);
    this.pushWas = o.push;
  }

  /** A moment: on `surface` (a grind's, a slide's: what it's on), `k` how hard (0..1). */
  hit(what: SkateHit, surface: SkateSurface, k = 0.6): void {
    if (this.gone) return;
    const kk = clamp(k);
    switch (what) {
      case "jump":
        this.shot(`jump.${surface}`, 0.7 + 0.3 * kk);
        break;
      case "land":
        this.shot(`land.${surface}`, 0.4 + 0.6 * kk);
        // (a wooden ramp's hollow boom under it, by how hard)
        if (surface === "wood") this.shot("boom", 0.2 + 0.8 * kk);
        break;
      case "bonk":
      case "grind-jump":
      case "grind-land":
      case "slide-jump":
      case "slide-land":
        this.shot(`${what}.${surface}`, 0.45 + 0.55 * kk);
        break;
      case "cess":
        this.shot(`cess.${surface}`, 0.5 + 0.5 * kk);
        break;
      case "bail":
        this.shot("bail", 0.7 + 0.3 * kk);
        this.shot(`land.${surface}`, 0.35, 0.9);
        break;
      case "kick-up":
        this.shot("kickup", 0.7);
        break;
      case "on":
        this.shot("on", 0.55);
        break;
      case "off":
        // (stepping off: the tail tapped down)
        this.shot(`land.${surface}`, 0.25, 1.1);
        break;
    }
  }

  /** Quiet (off the board). */
  hush(): void {
    this.quiet();
    this.wasAir = false;
    this.pushWas = 0;
  }
}

/** Another's board, where it is from me: the wheels, a grind (and a slide as one), a landing — by distance. */
export class SkateVoice extends Board {
  private air: BiquadFilterNode;
  private panner: PannerNode;
  constructor(ctx: AudioContext, dest: AudioNode = mixer.buses.effects, picks: Record<string, number> = {}) {
    super(
      ctx,
      SKATE_SURFACES.flatMap((f) => [`roll.${f}`, `grind.${f}`, `land.${f}`]),
      picks,
    );
    const c = ctx;
    this.out.gain.value = 0;
    this.air = c.createBiquadFilter();
    this.air.type = "lowpass";
    this.air.frequency.value = 16000;
    this.panner = c.createPanner();
    this.panner.panningModel = "equalpower";
    this.panner.distanceModel = "linear";
    this.panner.rolloffFactor = 0; // (the level by distance is ours: distanceGain)
    this.out.connect(this.air).connect(this.panner).connect(dest);
  }
  /** Every frame: as SkateSound's, and how far (m) and where from me (the camera's frame: x right, y up, −z ahead;
   *  null: right here). */
  update(o: SkateUpdate & { dist: number; at: { x: number; y: number; z: number } | null }): void {
    if (this.gone) return;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(distanceGain(o.dist) * 0.8, t, 0.06);
    this.air.frequency.setTargetAtTime(o.dist > 20 ? 16000 - Math.min(13000, o.dist * 110) : 16000, t, 0.1);
    const a = o.at ?? { x: 0, y: 0, z: -1 };
    this.panner.positionX.value = a.x;
    this.panner.positionY.value = a.y;
    this.panner.positionZ.value = a.z;
    if (o.state === "off" || distanceGain(o.dist) < 0.01) {
      this.quiet();
      return;
    }
    this.wheels(o, "grind");
  }
  /** Its landing (the rest isn't heard from another's). */
  hit(what: SkateHit, surface: SkateSurface, k = 0.6): void {
    if (this.gone || what !== "land") return;
    this.shot(`land.${surface}`, 0.4 + 0.6 * clamp(k));
  }
  hush(): void {
    this.quiet();
  }
}

/** The board's sound, made when it's first heard (the mixer's context up). */
let one: SkateSound | null = null;
export function skateSound(): SkateSound | null {
  const c = mixer.ctx;
  if (!c) return null;
  one ??= new SkateSound(c);
  return one;
}
