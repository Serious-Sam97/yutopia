// A board heard (docs/plan/103-the-skate.md, phase 7 — F14b: picked by me, yours to veto): its wheels rolling (by
// the speed, rougher on paving and paths, the cars' own recording of a road under it where it's loaded), the pop
// of an ollie, the landing's slap and the trucks' clack, a grind on steel (a ring) or a slide on a ledge (a scrape),
// a push's scuff, a bail's knock. Made here till recordings are picked (each slot: a buffer of our own, the cars'
// `road-roll`, `thump`, `hit-light` where they help).
import { asset } from "@/lib/asset";
import { mixer } from "../audio";
import { slotBuffers } from "../car/sound-bank";
import { sample } from "../sfx";

// ── the recordings (public/sfx/skate: fetched on the user's OK 2026-11-18, cut by tools/sfx-skate.mjs; chosen.json's
// pick of each slot — −1 the one made here) ──
interface SkateCand {
  name: string;
  files: string[];
  /** a bed's: the speed it sounds like (m/s) */
  rate?: number;
}
let bankP: Promise<{ man: Record<string, SkateCand[]>; chosen: Record<string, number> } | null> | null = null;
function skateBank() {
  const j = (f: string) =>
    fetch(asset(`/sfx/skate/${f}`))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  bankP ??= Promise.all([j("manifest.json"), j("chosen.json")]).then(([man, chosen]) =>
    man ? { man: man as Record<string, SkateCand[]>, chosen: (chosen ?? {}) as Record<string, number> } : null,
  );
  return bankP;
}
/** A slot's pick, decoded: its takes and the speed it sounds like; null for none (the made one). */
async function takes(ctx: BaseAudioContext, slot: string): Promise<{ bufs: AudioBuffer[]; rate: number } | null> {
  const b = await skateBank();
  const i = b?.chosen[slot] ?? 0;
  const c = i >= 0 ? b?.man[slot]?.[i] : undefined;
  if (!c) return null;
  const bufs = (await Promise.all(c.files.map((f) => sample(ctx, `skate/${f}`)))).filter((x): x is AudioBuffer => !!x);
  return bufs.length ? { bufs, rate: c.rate ?? 5 } : null;
}
interface Bed {
  src: AudioBufferSourceNode;
  g: GainNode;
  rate: number;
}

const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
let noise: AudioBuffer | null = null;
function noiseBuf(c: BaseAudioContext): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  const n = c.sampleRate * 2;
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  // (brown-ish: the wheels' rumble is low)
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.06 * w) / 1.06;
    d[i] = last * 3.2 + w * 0.12;
  }
  noise = b;
  return b;
}

export class SkateSound {
  private ctx: AudioContext;
  private out: GainNode;
  private roll: { g: GainNode; bp: BiquadFilterNode; src: AudioBufferSourceNode };
  private road: { g: GainNode; src: AudioBufferSourceNode } | null = null;
  private grind: { g: GainNode; bp: BiquadFilterNode };
  private thumps: AudioBuffer[] = [];
  private knocks: AudioBuffer[] = [];
  private pushWas = 0;
  /** (recorded) the wheels on concrete, round a pool, a grind on steel, a slide; the pops and the landings */
  private rollRec: Bed | null = null;
  private poolRec: Bed | null = null;
  private grindRec: Bed | null = null;
  private slideRec: Bed | null = null;
  private pops: AudioBuffer[] = [];
  private lands: AudioBuffer[] = [];
  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const c = ctx;
    this.out = c.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(mixer.buses.effects);
    // the wheels: a rumble band, up with the speed
    const src = c.createBufferSource();
    src.buffer = noiseBuf(c);
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.value = 300;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g).connect(this.out);
    src.start();
    this.roll = { g, bp, src };
    // a grind: the steel's ring (a narrow band, high) or a ledge's scrape (wider, lower)
    const gs = c.createBufferSource();
    gs.buffer = noiseBuf(c);
    gs.loop = true;
    gs.playbackRate.value = 1.7;
    const gbp = c.createBiquadFilter();
    gbp.type = "bandpass";
    gbp.Q.value = 9;
    gbp.frequency.value = 2600;
    const gg = c.createGain();
    gg.gain.value = 0;
    gs.connect(gbp).connect(gg).connect(this.out);
    gs.start();
    this.grind = { g: gg, bp: gbp };
    // the cars' own: a road rolling (thinned for urethane), a thump, a knock
    void slotBuffers(c, "road-roll").then((bs) => {
      const b = bs[0];
      if (!b) return;
      const s = c.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.playbackRate.value = 1.6;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 500;
      const rg = c.createGain();
      rg.gain.value = 0;
      s.connect(hp).connect(rg).connect(this.out);
      s.start();
      this.road = { g: rg, src: s };
    });
    // the recordings, each as it comes in (in place of the made one)
    const bed = (slot: string, set: (b: Bed) => void) =>
      void takes(c, slot).then((t) => {
        const b = t?.bufs[0];
        if (!b || !t) return;
        const s = c.createBufferSource();
        s.buffer = b;
        s.loop = true;
        const g = c.createGain();
        g.gain.value = 0;
        s.connect(g).connect(this.out);
        s.start(0, Math.random() * b.duration);
        set({ src: s, g, rate: t.rate });
      });
    bed("roll", (b) => {
      this.rollRec = b;
    });
    bed("pool", (b) => {
      this.poolRec = b;
    });
    bed("grind", (b) => {
      this.grindRec = b;
    });
    bed("slide", (b) => {
      this.slideRec = b;
    });
    void takes(c, "pop").then((t) => {
      if (t) this.pops = t.bufs;
    });
    void takes(c, "land").then((t) => {
      if (t) this.lands = t.bufs;
    });
    void slotBuffers(c, "thump").then((bs) => {
      this.thumps = bs;
    });
    void slotBuffers(c, "hit-light").then((bs) => {
      this.knocks = bs;
    });
  }

  /** Each frame: how fast it rolls (m/s), on what (0 smooth … 1 rough), grinding (on steel: true; a ledge: false;
   *  none: null), in the air, a push's cycle. */
  update(speed: number, rough: number, grind: "steel" | "ledge" | null, air: boolean, push: number, ramp = false) {
    const t = this.ctx.currentTime;
    const k = air || grind ? 0 : clamp(speed / 9);
    // the recorded wheels (on a park's ramp, the pool's; else the concrete's) over the made rumble, which thins
    const rec = ramp && this.poolRec ? this.poolRec : this.rollRec;
    const other = rec === this.poolRec ? this.rollRec : this.poolRec;
    if (rec) {
      rec.g.gain.setTargetAtTime(k * (0.55 + 0.3 * rough), t, 0.06);
      rec.src.playbackRate.setTargetAtTime(clamp(0.55 + (0.45 * speed) / rec.rate, 0.5, 1.8), t, 0.06);
    }
    other?.g.gain.setTargetAtTime(0, t, 0.08);
    const made = rec ? 0.35 : 1;
    const gs = grind === "steel" && this.grindRec ? this.grindRec : null;
    const sl = grind === "ledge" && this.slideRec ? this.slideRec : null;
    for (const [b, on] of [
      [this.grindRec, gs],
      [this.slideRec, sl],
    ] as const) {
      if (!b) continue;
      b.g.gain.setTargetAtTime(on ? clamp(speed / 6, 0.45, 1) * 0.7 : 0, t, 0.03);
      if (on) b.src.playbackRate.setTargetAtTime(clamp(0.7 + (0.3 * speed) / b.rate, 0.6, 1.5), t, 0.05);
    }
    this.roll.g.gain.setTargetAtTime(k * (0.18 + 0.25 * rough) * made, t, 0.05);
    this.roll.bp.frequency.setTargetAtTime(160 + 380 * k + 500 * rough, t, 0.05);
    this.roll.src.playbackRate.setTargetAtTime(0.7 + 0.6 * k, t, 0.05);
    if (this.road) {
      this.road.g.gain.setTargetAtTime(k * 0.35 * (1 - 0.5 * rough), t, 0.05);
      this.road.src.playbackRate.setTargetAtTime(1.2 + 0.8 * k, t, 0.05);
    }
    const gk = grind && !(gs || sl) ? clamp(speed / 6, 0.4, 1) : 0;
    this.grind.g.gain.setTargetAtTime(gk * (grind === "steel" ? 0.22 : 0.3), t, 0.03);
    this.grind.bp.frequency.setTargetAtTime(grind === "steel" ? 2400 + 120 * speed : 700 + 40 * speed, t, 0.03);
    this.grind.bp.Q.setTargetAtTime(grind === "steel" ? 9 : 1.4, t, 0.03);
    // (a push's foot down on the ground: a scuff at the start of each)
    if (push > 0 && push < this.pushWas) this.burst(1600, 0.08, 0.12, 0.8);
    this.pushWas = push;
  }

  /** A moment: the pop, a landing (how hard), the trucks' clack, a bail, on and off. */
  hit(what: string, k = 0.5) {
    if (what === "pop") {
      if (this.pops.length) this.play(this.pops, 0.8, 0.95 + Math.random() * 0.1);
      else {
        this.burst(2200, 0.03, 0.4, 3);
        this.tone(140, 0.07, 0.35);
      }
    } else if (what === "land") {
      if (this.lands.length) this.play(this.lands, 0.45 + 0.5 * k, 0.95 + Math.random() * 0.1);
      else this.burst(900, 0.05, 0.25 + 0.4 * k, 1.5);
      this.play(this.thumps, 0.1 + 0.35 * k, 1.4);
    } else if (what === "bail") {
      this.play(this.knocks, 0.6, 1);
      this.burst(400, 0.25, 0.4, 0.7);
    } else if (what === "on" || what === "off") this.burst(1400, 0.04, 0.25, 2.5);
    else if (what.startsWith("grind:")) this.burst(what === "grind:rail" ? 3000 : 1200, 0.05, 0.35, 4);
  }

  private burst(freq: number, len: number, gain: number, q: number) {
    const c = this.ctx;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = noiseBuf(c);
    s.playbackRate.value = 2;
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
  private tone(freq: number, len: number, gain: number) {
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + len);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + len + 0.02);
  }
  private play(bs: AudioBuffer[], gain: number, rate: number) {
    const b = bs[Math.floor(Math.random() * bs.length)];
    if (!b) return;
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = gain;
    s.connect(g).connect(this.out);
    s.start();
  }
  /** Quiet (off the board). */
  hush() {
    const t = this.ctx.currentTime;
    this.roll.g.gain.setTargetAtTime(0, t, 0.08);
    this.grind.g.gain.setTargetAtTime(0, t, 0.05);
    this.road?.g.gain.setTargetAtTime(0, t, 0.08);
    for (const b of [this.rollRec, this.poolRec, this.grindRec, this.slideRec]) b?.g.gain.setTargetAtTime(0, t, 0.08);
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
