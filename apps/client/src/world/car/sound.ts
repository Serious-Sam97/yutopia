import { type CarKind, type CarState, GRIP, readout } from "@yutopia/shared/car";
import {
  bank,
  doorSlots,
  type EngineRec,
  type EngineVoice,
  engineNow,
  engineRec,
  hornSlot,
  kindBeds,
  type Load,
  loopable,
  type Mic,
  slotBuffers,
  startSlot,
  voiceOf,
} from "./sound-bank";

// A car's sound (docs/plan/28 Sound; docs/plan/92 phase 11: recorded). The engine is its voice's recorded set
// (sound-bank.ts: the picks on /dev/car-sound), each loop played at the car's revs over its own and the ones
// either side crossfaded, by mic — the exhaust and the bay outside, the cabin's own inside, a far one at a
// distance. On top: the intake, the gear lever, pops on a lift; the tyres by the ground under them and how
// they slide; the wind; knocks by what was hit and how hard; a scrape, a loose bumper, glass; the doors, the
// belt, the handbrake, the indicator, the wipers, the horn, the siren; the snowcat's tracks, the skis and
// runners, the plough. Each recorded sound comes in when it's fetched; till then (and for the sounds no
// recording fitted: chosen.json's `synth`) the old synthesized one plays. Heard in space: a 3D panner, its
// level and its top falling off to ~120 m; from inside, the outside muffled and the cabin's sounds forward.

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < d.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (s / 0x7fffffff) * 2 - 1;
  }
  noiseBuf = b;
  return b;
}
function loopNoise(ctx: AudioContext): AudioBufferSourceNode {
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx);
  n.loop = true;
  n.loopStart = Math.random();
  n.start(ctx.currentTime, Math.random() * 1.5);
  return n;
}
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

/** How far a car is heard (m); past it, nothing. */
/** (a smoothstep from a to b) */
const smooth = (a: number, b: number, x: number): number => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
export const HEARD = 120;
/** A car's level at `d` m: whole to 6 m, then falling to nothing at HEARD. */
export const distanceGain = (d: number): number => (d <= 6 ? 1 : clamp(1 - (d - 6) / (HEARD - 6)) ** 1.7);

/** Fetch a voice's recordings ahead (by a car, before it's started). */
export function preloadEngine(ctx: AudioContext, voice: EngineVoice = "four"): Promise<EngineRec | null> {
  void bank();
  return engineRec(ctx, voice);
}

const LOADS: Load[] = ["on", "off"];
/** A loop's level by its load and where its revs sit in the voice's range (the old 190E set's own levels). */
const level = (l: Load, x: number) => (l === "on" ? 0.55 + 0.45 * x : 0.26 + 0.24 * x);
/** Which of today's synthesized engines stands in for a voice till its recordings are in. */
const SYNTH: Record<EngineVoice, "four" | "v8" | "two" | "diesel"> = {
  four: "four",
  revvy: "four",
  v8: "v8",
  "diesel-light": "diesel",
  diesel: "diesel",
  two: "two",
};
/** The slots heard as loops (a bed: its level set every frame). */
const BEDS = [
  "intake",
  "skid",
  "snow-roll",
  "snow-slide",
  "gravel",
  "slush",
  "road-roll",
  "wind",
  "scrape",
  "rattle",
  "wiper",
  "indicator",
  "ice-hiss",
  "gear-whine",
  // (plan 93 B: the tyres by the grip they use — the scrub, a held squeal; packed snow's squeak)
  "scrub",
  "squeal-loop",
  "snow-squeak",
];
/** The slots played once (a take each time, gone round). */
const SHOTS = [
  "shift",
  "pops",
  "squeal",
  "chirp",
  "splash",
  "hit-light",
  "hit-mid",
  "hit-heavy",
  "hit-glass",
  "hit-post",
  "hit-tree",
  "hit-snowbank",
  "thump",
  "belt",
  "handbrake",
  "stop",
  "tick-cool",
  "boot",
  "bonnet",
];

export interface Hearing {
  inside: boolean; // in this car, the windows up
  /** (plan 93 S5) inside, a window down (0 shut … 1 mine open): the outside and the wind let in; outside, the
   *  glass of the car I'm in between it and me (0 none … 1 shut all round) */
  open?: number;
  through?: number;
  /** metres from the listener */
  dist: number;
  /** where it is from the listener, in the camera's frame (x right, y up, −z ahead); null: right here */
  at: { x: number; y: number; z: number } | null;
}
/** What the car's driver does that's heard (mine; the others' as their wire has it). */
export interface CarExtras {
  hand?: number; // the handbrake, 0..1
  wipers?: number; // 0..3
  indicating?: boolean;
  bumperHang?: boolean;
  scrape?: number; // metal along something, 0..1 (decaying)
  /** (plan 93 S6) how many of its wheels wear chains (0..4) */
  chains?: number;
}
interface Voice {
  src: AudioBufferSourceNode;
  g: GainNode;
  at: number;
}
interface Bed {
  src: AudioBufferSourceNode;
  g: GainNode;
}
/** Who's heard: its kind (the doors, the horn, its own beds) and variant (its engine). */
export interface CarWho {
  kind: CarKind;
  variant?: string;
}

export class CarSound {
  private out: GainNode; // its level by distance
  private air: BiquadFilterNode; // the top lost over distance
  private panner: PannerNode;
  private hrtf = false;
  private outside: BiquadFilterNode; // the world outside the cabin
  private cabin: GainNode; // the cabin's own sounds (not muffled)
  private eng: {
    o: OscillatorNode[];
    g: GainNode;
    lp: BiquadFilterNode;
    am: GainNode;
    amo: OscillatorNode;
    ng: GainNode;
    nbp: BiquadFilterNode;
    intake: GainNode;
    ibp: BiquadFilterNode;
  };
  private tyre: {
    sq: BiquadFilterNode[];
    sqg: GainNode;
    roll: GainNode;
    rlp: BiquadFilterNode;
    crunch: GainNode;
    cbp: BiquadFilterNode;
    cam: GainNode;
    hiss: GainNode;
    splash: GainNode;
  };
  private wind: { g: GainNode; bp: BiquadFilterNode };
  private whine: { o: OscillatorNode; g: GainNode };
  // the recorded engine: its loops (each mic's made when first heard), its level, the cabin's filter
  private rec: { g: GainNode; lp: BiquadFilterNode; mic: Partial<Record<Mic, GainNode>> };
  private voices: Partial<Record<Mic, Record<Load, Voice[]>>> = {};
  private beds = new Map<string, Bed>();
  private bufs = new Map<string, AudioBuffer[]>();
  private turn = new Map<string, number>();
  private synthSlots = new Set<string>(["tick-cool", "gear-whine", "limiter", "ice-hiss", "thump"]);
  private load = 0;
  private startAt = -1; // when the starter clip began
  private startLen = 0; // …and when the loops come in under its end
  private inside = false;
  private hornNode: { stop: () => void } | null = null;
  private lastGear = 0;
  private lastThr = 0;
  private lastHit = -1;
  private lastBlink = false;
  private lastHand = 0;
  private popT = 0;
  private popped = false;
  private squealAt = -9;
  /** (plan 93 B) the most grip any tyre used last frame, and the last chirp */
  private usedWas = 0;
  private chirpAt = -9;
  private splashAt = -9;
  private wetWas = false;
  private crank = 0; // seconds of cranking left
  private dead = false;
  private readonly voice: EngineVoice | null;
  private readonly kind: CarKind;
  private srcs: AudioScheduledSourceNode[] = [];
  private keep<T extends AudioScheduledSourceNode>(n: T): T {
    this.srcs.push(n);
    return n;
  }

  constructor(
    private ctx: AudioContext,
    private dest: AudioNode,
    /** whose: its kind and variant (the saloon by default) */
    who: CarWho = { kind: "sedan" },
  ) {
    const c = ctx;
    this.kind = who.kind;
    this.voice = voiceOf(who.kind, who.variant);
    this.out = c.createGain();
    this.out.gain.value = 0;
    this.air = c.createBiquadFilter();
    this.air.type = "lowpass";
    this.air.frequency.value = 18000;
    this.panner = c.createPanner();
    this.panner.panningModel = "equalpower";
    this.panner.distanceModel = "linear";
    this.panner.rolloffFactor = 0; // (the level by distance is ours: distanceGain)
    this.panner.positionZ.value = -1;
    this.out.connect(this.air).connect(this.panner).connect(dest);
    this.outside = c.createBiquadFilter();
    this.outside.type = "lowpass";
    this.outside.frequency.value = 18000;
    this.outside.connect(this.out);
    this.cabin = c.createGain();
    this.cabin.connect(this.out);
    // ── the synthesized engine (till the recordings are in): three harmonics of its firing, shaped,
    // filtered by load; pulses of noise
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
    }
    shaper.curve = curve;
    const eg = c.createGain();
    eg.gain.value = 0;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 2.5;
    const o: OscillatorNode[] = [];
    for (const [type, mul, lvl] of [
      ["sawtooth", 1, 0.5],
      ["square", 0.5, 0.35],
      ["triangle", 2, 0.25],
      ["sine", 0.25, 0.3],
    ] as [OscillatorType, number, number][]) {
      const os = c.createOscillator();
      os.type = type;
      const g = c.createGain();
      g.gain.value = lvl;
      os.connect(g).connect(shaper);
      os.start();
      (os as unknown as { mul: number }).mul = mul;
      o.push(this.keep(os));
    }
    const am = c.createGain();
    am.gain.value = 0.7;
    const amo = c.createOscillator();
    amo.type = "sawtooth";
    const amd = c.createGain();
    amd.gain.value = 0.3;
    amo.connect(amd).connect(am.gain);
    amo.start();
    this.keep(amo);
    shaper.connect(am).connect(lp).connect(eg).connect(this.outside);
    const nsrc = this.keep(loopNoise(c));
    const nbp = c.createBiquadFilter();
    nbp.type = "bandpass";
    nbp.Q.value = 1.2;
    const ng = c.createGain();
    ng.gain.value = 0;
    const ngate = c.createGain();
    ngate.gain.value = 0.5;
    amd.connect(ngate.gain);
    nsrc.connect(nbp).connect(ngate).connect(ng).connect(this.outside);
    const isrc = this.keep(loopNoise(c));
    const ibp = c.createBiquadFilter();
    ibp.type = "bandpass";
    ibp.Q.value = 3;
    const intake = c.createGain();
    intake.gain.value = 0;
    isrc.connect(ibp).connect(intake).connect(this.outside);
    this.eng = { o, g: eg, lp, am, amo, ng, nbp, intake, ibp };
    // ── the synthesized tyres (each till its recording's in; ice's hiss always — nothing recorded fitted)
    const sqg = c.createGain();
    sqg.gain.value = 0;
    const sq: BiquadFilterNode[] = [];
    const qsrc = this.keep(loopNoise(c));
    for (const [f, q] of [
      [1300, 9],
      [2250, 12],
    ]) {
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = q;
      qsrc.connect(bp).connect(sqg);
      sq.push(bp);
    }
    sqg.connect(this.outside);
    const rsrc = this.keep(loopNoise(c));
    const rlp = c.createBiquadFilter();
    rlp.type = "lowpass";
    rlp.frequency.value = 300;
    const roll = c.createGain();
    roll.gain.value = 0;
    rsrc.connect(rlp).connect(roll).connect(this.outside);
    const csrc = this.keep(loopNoise(c));
    const cbp = c.createBiquadFilter();
    cbp.type = "bandpass";
    cbp.frequency.value = 1400;
    cbp.Q.value = 0.8;
    const cam = c.createGain();
    cam.gain.value = 0.5;
    const crackle = this.keep(loopNoise(c));
    const clp = c.createBiquadFilter();
    clp.type = "lowpass";
    clp.frequency.value = 40;
    const cdepth = c.createGain();
    cdepth.gain.value = 8;
    crackle.connect(clp).connect(cdepth).connect(cam.gain);
    const crunch = c.createGain();
    crunch.gain.value = 0;
    csrc.connect(cbp).connect(cam).connect(crunch).connect(this.outside);
    const hsrc = this.keep(loopNoise(c));
    const hhp = c.createBiquadFilter();
    hhp.type = "highpass";
    hhp.frequency.value = 3500;
    const hiss = c.createGain();
    hiss.gain.value = 0;
    hsrc.connect(hhp).connect(hiss).connect(this.outside);
    const ssrc = this.keep(loopNoise(c));
    const sbp = c.createBiquadFilter();
    sbp.type = "bandpass";
    sbp.frequency.value = 2200;
    sbp.Q.value = 0.6;
    const splash = c.createGain();
    splash.gain.value = 0;
    ssrc.connect(sbp).connect(splash).connect(this.outside);
    this.tyre = { sq, sqg, roll, rlp, crunch, cbp, cam, hiss, splash };
    // ── the wind
    const wsrc = this.keep(loopNoise(c));
    const wbp = c.createBiquadFilter();
    wbp.type = "bandpass";
    wbp.Q.value = 0.5;
    const wg = c.createGain();
    wg.gain.value = 0;
    wsrc.connect(wbp).connect(wg).connect(this.outside);
    this.wind = { g: wg, bp: wbp };
    // ── the gearbox's whine in the low gears and reverse (made: nothing recorded fitted)
    const wo = c.createOscillator();
    wo.type = "triangle";
    const wog = c.createGain();
    wog.gain.value = 0;
    wo.connect(wog).connect(this.cabin);
    wo.start();
    this.keep(wo);
    this.whine = { o: wo, g: wog };
    // ── the recorded engine (its own filter inside: the bay's heard through the firewall, not the glass)
    const rlpf = c.createBiquadFilter();
    rlpf.type = "lowpass";
    rlpf.frequency.value = 18000;
    const rg = c.createGain();
    rg.gain.value = 0;
    rg.connect(rlpf).connect(this.out);
    this.rec = { g: rg, lp: rlpf, mic: {} };
    // ── its recordings: the voice's set, then each sound this kind makes, as they come
    if (this.voice) void engineRec(ctx, this.voice);
    void bank().then((b) => {
      if (this.dead || !b) return;
      if (b.chosen.synth) this.synthSlots = new Set(b.chosen.synth);
      const [dOpen, dShut] = doorSlots(this.kind);
      const want = [...BEDS, ...kindBeds(this.kind), ...SHOTS, dOpen, dShut];
      if (this.voice) want.push(startSlot(this.voice));
      for (const slot of new Set(want)) {
        if (this.synthSlots.has(slot)) continue;
        void slotBuffers(ctx, slot).then((bs) => {
          if (this.dead || !bs.length) return;
          this.bufs.set(slot, bs);
          if (BEDS.includes(slot) || kindBeds(this.kind).includes(slot)) this.makeBed(slot, bs[0]);
        });
      }
    });
  }

  // ── the recordings: beds and shots ──────────────────────────────────────────────────────────────
  private makeBed(slot: string, b: AudioBuffer) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = loopable(c, b, 0.03, 0.3);
    src.loop = true;
    const g = c.createGain();
    g.gain.value = 0;
    // (the cabin's own: the indicator's relay; the rest outside the glass)
    src.connect(g).connect(slot === "indicator" ? this.cabin : this.outside);
    src.start(c.currentTime, Math.random() * src.buffer.duration);
    this.beds.set(slot, { src: this.keep(src), g });
  }
  /** A bed at this level (and pitch); false if it isn't in (the synth plays). */
  private bed(slot: string, lvl: number, rate = 1): boolean {
    const b = this.beds.get(slot);
    if (!b) return false;
    const t = this.ctx.currentTime;
    b.g.gain.setTargetAtTime(lvl, t, 0.05);
    b.src.playbackRate.setTargetAtTime(clamp(rate, 0.5, 2), t, 0.05);
    return true;
  }
  private has(slot: string) {
    return this.beds.has(slot) || this.bufs.has(slot);
  }
  /** One take of a slot (gone round); false if it isn't in. */
  private shot(slot: string, gain: number, o: { rate?: number; to?: AudioNode; at?: number } = {}): boolean {
    const bs = this.bufs.get(slot);
    if (!bs?.length || this.dead) return false;
    const i = (this.turn.get(slot) ?? Math.floor(Math.random() * bs.length)) % bs.length;
    this.turn.set(slot, i + 1);
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = bs[i];
    src.playbackRate.value = o.rate ?? 0.96 + Math.random() * 0.08;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(o.to ?? this.outside);
    src.start(o.at ?? c.currentTime);
    return true;
  }

  // ── the engine ─────────────────────────────────────────────────────────────────────────────────
  private makeVoices(m: Mic, R: EngineRec): Record<Load, Voice[]> {
    const c = this.ctx;
    const mg = c.createGain();
    mg.connect(this.rec.g);
    this.rec.mic[m] = mg;
    const by = R.loops[m] as Record<Load, [AudioBuffer, number][]>;
    const out = { on: [], off: [] } as Record<Load, Voice[]>;
    for (const l of LOADS)
      for (const [buf, at] of by[l]) {
        const src = c.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const g = c.createGain();
        g.gain.value = 0;
        src.connect(g).connect(mg);
        src.start(c.currentTime, Math.random() * buf.duration);
        out[l].push({ src: this.keep(src), g, at });
      }
    return out;
  }

  /** The starter: the picked recording's crank and catch (the voice's set's own if none); if neither's in
   *  within half a second, the synth's cranking (longer cold) and then it catches. */
  start(cold: number) {
    let done = false;
    this.crank = 9; // (quiet till it's known which)
    const go = () => {
      if (done || this.dead) return;
      done = true;
      const c = this.ctx;
      const R = this.voice ? engineNow(this.voice) : null;
      const pick = this.voice ? this.bufs.get(startSlot(this.voice)) : undefined;
      const buf = pick?.[Math.floor(Math.random() * pick.length)] ?? R?.start ?? null;
      if (buf && buf.duration > 1.2) {
        const t = c.currentTime;
        const len = Math.min(5, buf.duration);
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        const lvl = 0.35 * (this.inside ? 0.6 : 1);
        g.gain.setValueAtTime(lvl, t);
        g.gain.setValueAtTime(lvl, t + len - 0.8);
        g.gain.linearRampToValueAtTime(0.0001, t + len);
        src.connect(g).connect(this.rec.lp);
        src.start(t);
        src.stop(t + len + 0.05);
        this.keep(src);
        this.crank = 0.3;
        this.startAt = t;
        this.startLen = len;
      } else if (this.voice) {
        // (a short take — a V8's catch: the synth's crank, then it as the engine fires)
        this.crank = 0.7 + cold * 1.6;
        this.burst(0.25, 160, 3, this.crank, "starter");
        if (buf) this.shot(startSlot(this.voice), 0.35, { to: this.rec.lp, at: c.currentTime + this.crank - 0.1 });
      }
    };
    setTimeout(go, 500);
    void Promise.all([this.voice ? engineRec(this.ctx, this.voice) : null, bank()]).then(() =>
      setTimeout(go, this.voice && this.bufs.has(startSlot(this.voice)) ? 0 : 60),
    );
  }

  /** The driver's belt clicking home (as they sit down to drive). */
  belt() {
    if (!this.shot("belt", 0.3, { to: this.cabin })) this.burst(0.05, 2600, 4, 0.03, "click");
  }

  // ── (plan 93 S6) the chains' rattle: noise through a band, chopped at the cross chains' rate on the road ──
  private chainsNode: { g: GainNode; lfo: OscillatorNode; bp: BiquadFilterNode } | null = null;
  private rattle(n: number, hard: number, speed: number, r: number) {
    const c = this.ctx;
    const t = c.currentTime;
    if (n <= 0 || this.dead) {
      this.chainsNode?.g.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    if (!this.chainsNode) {
      const src = this.keep(loopNoise(c));
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600;
      bp.Q.value = 1.8;
      // (chopped: a square wave's on half — a slap a cross chain)
      const chop = c.createGain();
      chop.gain.value = 0.5;
      const lfo = c.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = 10;
      const lg = c.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(chop.gain);
      lfo.start();
      this.keep(lfo);
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(bp).connect(chop).connect(g).connect(this.outside);
      this.chainsNode = { g, lfo, bp };
    }
    const k = this.chainsNode;
    if (!Number.isFinite(speed) || !(r > 0)) return;
    // (ten cross chains a turn of the wheel)
    k.lfo.frequency.setTargetAtTime(Math.max(1, (speed / (2 * Math.PI * r)) * 10), t, 0.05);
    k.bp.frequency.setTargetAtTime(hard > 0.5 ? 2600 : 1400, t, 0.2);
    const lvl = 0.07 * (n / 4) * (0.25 + 0.75 * hard) * clamp(speed / 3) * (1 - 0.3 * clamp((speed - 10) / 10));
    k.g.gain.setTargetAtTime(lvl, t, 0.08);
  }

  /** (plan 93 S5) A window wound by its switch: the motor's whir in the door (falling as it goes down, rising
   *  as it comes up), its stop at the end — the cabin's own. Made: nothing recorded fitted. */
  window(down: boolean) {
    if (this.dead) return;
    const c = this.ctx;
    const t = c.currentTime;
    const len = 1.5;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(down ? 120 : 105, t);
    o.frequency.linearRampToValueAtTime(down ? 100 : 128, t + len);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 520;
    bp.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.06);
    g.gain.setValueAtTime(0.05, t + len - 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(bp).connect(g).connect(this.cabin);
    o.start(t);
    o.stop(t + len + 0.05);
    // (the glass home in its seal, or down in the door: a soft knock)
    const k = c.createOscillator();
    k.frequency.value = 90;
    const kg = c.createGain();
    kg.gain.setValueAtTime(0.0001, t + len);
    kg.gain.exponentialRampToValueAtTime(0.08, t + len + 0.005);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.09);
    k.connect(kg).connect(this.cabin);
    k.start(t + len);
    k.stop(t + len + 0.12);
  }

  /** Switched off as its driver leaves: the stop, then the engine ticking as it cools — heard on after
   *  this sound's gone (straight out, by the car). */
  switchOff() {
    if (this.dead || !this.voice) return;
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 1;
    g.connect(this.dest);
    this.shot("stop", 0.4, { to: g });
    // (the tick: a few dry clicks over the next seconds, made — nothing recorded fitted)
    const t0 = c.currentTime + 1.2;
    for (let i = 0; i < 9; i++) {
      const at = t0 + i * 0.5 + Math.random() * 0.6;
      if (!this.synthSlots.has("tick-cool") && this.shot("tick-cool", 0.12, { to: g, at })) continue;
      const n = c.createBufferSource();
      n.buffer = noise(c);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3200 + Math.random() * 1800;
      bp.Q.value = 6;
      const cg = c.createGain();
      cg.gain.setValueAtTime(0.0001, at);
      cg.gain.exponentialRampToValueAtTime(0.05 * (1 - i / 12), at + 0.002);
      cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
      n.connect(bp).connect(cg).connect(g);
      n.start(at, Math.random());
      n.stop(at + 0.05);
    }
    setTimeout(() => g.disconnect(), 9000);
  }

  /** The police car's siren: the recording; till it's in, a two-tone wail (a sawtooth swept every 3.6 s). */
  private sirenNode: { g: GainNode } | null = null;
  private sirenBed = false;
  siren(on: boolean) {
    if (this.dead) return;
    const c = this.ctx;
    if (on && !this.sirenBed && !this.beds.has("siren")) {
      this.sirenBed = true;
      void slotBuffers(c, "siren").then((bs) => {
        if (!this.dead && bs[0]) this.makeBed("siren", bs[0]);
      });
    }
    if (this.bed("siren", on ? 0.45 : 0)) {
      this.sirenNode?.g.gain.setTargetAtTime(0, c.currentTime, 0.05);
      return;
    }
    if (!this.sirenNode) {
      if (!on) return;
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 950;
      const lfo = c.createOscillator();
      lfo.type = "triangle";
      lfo.frequency.value = 1 / 3.6;
      const lg = c.createGain();
      lg.gain.value = 380;
      lfo.connect(lg).connect(o.frequency);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1100;
      bp.Q.value = 0.9;
      const g = c.createGain();
      g.gain.value = 0;
      o.connect(bp).connect(g).connect(this.outside);
      o.start();
      lfo.start();
      this.keep(o);
      this.keep(lfo);
      this.sirenNode = { g };
    }
    this.sirenNode.g.gain.setTargetAtTime(on ? 0.11 : 0, c.currentTime, 0.05);
  }

  update(s: CarState, h: Hearing, dt: number, blinkOn: boolean, inCar: boolean, x: CarExtras = {}) {
    if (this.dead) return;
    const c = this.ctx;
    const t = c.currentTime;
    const r = readout(s);
    const run = s.rpm > 50 && this.crank <= 0;
    if (this.crank > 0) this.crank -= dt;
    const tc = 0.04;
    // ── in space: its level and top by distance, where it is round me
    const thr = h.inside || !Number.isFinite(h.through) ? 0 : (h.through ?? 0);
    this.out.gain.setTargetAtTime(h.inside ? 1 : distanceGain(h.dist) * (1 - 0.5 * thr), t, 0.08);
    this.air.frequency.setTargetAtTime(
      h.inside ? 18000 : Math.max(900, 18000 * Math.exp(-h.dist / 40)) * (1000 / 18000) ** thr,
      t,
      0.1,
    );
    const hrtf = !h.inside && h.dist < 30;
    if (hrtf !== this.hrtf) {
      this.hrtf = hrtf;
      this.panner.panningModel = hrtf ? "HRTF" : "equalpower";
    }
    const at = h.inside || !h.at ? { x: 0, y: 0, z: -1 } : h.at;
    this.panner.positionX.setTargetAtTime(at.x, t, 0.05);
    this.panner.positionY.setTargetAtTime(at.y, t, 0.05);
    this.panner.positionZ.setTargetAtTime(at.z, t, 0.05);
    const open = h.inside && Number.isFinite(h.open) ? clamp(h.open ?? 0) : 0;
    this.outside.frequency.setTargetAtTime(h.inside ? 1100 + 5400 * open : 18000, t, 0.1);
    this.cabin.gain.setTargetAtTime(inCar ? 1 : 0.35, t, 0.1);
    this.inside = h.inside;
    // ── the engine
    const sv = this.voice ? SYNTH[this.voice] : null;
    const v8 = sv === "v8";
    const two = sv === "two";
    const diesel = sv === "diesel";
    const f = Math.max(10, s.rpm / (v8 ? 15 : diesel ? 20 : 30));
    const load = clamp(s.thr * (s.clutch > 0.5 ? 1 : 0.55));
    const R = this.voice ? engineNow(this.voice) : null;
    const syn = sv && !R ? 1 : 0; // (the synth's engine only till the recordings are in)
    if (R) this.recorded(s, h, R, run, load, dt);
    for (const o of this.eng.o) o.frequency.setTargetAtTime(f * (o as unknown as { mul: number }).mul, t, 0.02);
    this.eng.amo.frequency.setTargetAtTime(v8 ? f / 2 : f, t, 0.02);
    this.eng.lp.frequency.setTargetAtTime(
      v8
        ? 110 + s.rpm * 0.2 + load * 900
        : two
          ? 700 + s.rpm * 0.32 + load * 1800
          : diesel
            ? 90 + s.rpm * 0.18 + load * 500
            : 180 + s.rpm * 0.28 + load * 1400,
      t,
      tc,
    );
    let eg = run ? (0.1 + 0.18 * load + 0.04 * (s.rpm / 6000)) * (v8 ? 1.35 : two ? 0.8 : diesel ? 1.4 : 1) : 0;
    const limit = run && s.rpm > s.spec.engine.limit - 80;
    // the limiter's stutter
    if (limit) eg *= 0.35 + 0.65 * (Math.sin(t * 95) > 0 ? 1 : 0);
    this.eng.g.gain.setTargetAtTime(syn * eg * (h.inside ? 1.15 : 1), t, 0.02);
    this.eng.nbp.frequency.setTargetAtTime(f * (diesel ? 6 : 3), t, tc);
    this.eng.ng.gain.setTargetAtTime(run ? syn * (0.05 + 0.08 * load) * (two ? 1.8 : diesel ? 2.2 : 1) : 0, t, tc);
    // the intake under throttle: its recording; the synth's breath only with the synth's engine
    const intakeK = run && this.voice ? load * clamp(s.rpm / 5000) : 0;
    if (!this.bed("intake", 0.2 * intakeK, 0.8 + s.rpm / 9000)) {
      this.eng.ibp.frequency.setTargetAtTime(400 + s.rpm * 0.22, t, tc);
      this.eng.intake.gain.setTargetAtTime(syn * 0.07 * intakeK, t, tc);
    }
    // pops: a lift at high revs (a take of the backfires; else the synth's bursts)
    this.popT -= dt;
    if (run && this.lastThr > 0.6 && s.thr < 0.15 && s.rpm > 3800) {
      this.popT = 0.6;
      this.popped = false;
    }
    if (this.popT > 0 && !this.popped && this.has("pops")) {
      this.popped = this.shot("pops", 0.3);
    } else if (this.popT > 0 && !this.has("pops") && Math.random() < dt * 9)
      this.burst(0.07 + Math.random() * 0.08, 300 + Math.random() * 300, 0.6, 0.05, "pop");
    this.lastThr = s.thr;
    // a gear change: the lever and the clutch (heard inside)
    if (r.gear !== this.lastGear) {
      if (inCar && !this.shot("shift", 0.28, { to: this.cabin })) this.burst(0.05, 900, 2, 0.04, "click");
      this.lastGear = r.gear;
    }
    // the gearbox's whine: first, second and reverse
    const low = r.gear === -1 || r.gear === 1 || r.gear === 2;
    const whine = run && low && this.voice ? clamp(r.speed / 8) * (r.gear === -1 ? 1.4 : r.gear === 1 ? 1 : 0.6) : 0;
    if (this.synthSlots.has("gear-whine") || !this.bed("gear-whine", 0.15 * whine, 0.6 + r.speed / 12)) {
      this.whine.o.frequency.setTargetAtTime(220 + r.speed * (r.gear === -1 ? 95 : 70), t, 0.05);
      this.whine.g.gain.setTargetAtTime(0.012 * whine * (inCar ? 1 : 0.4), t, 0.08);
    }
    // ── the tyres: the ground under each wheel, how fast it rolls, how much of its grip it uses (plan 93 B: the
    // rubber's voice led by that — a scrub from about half its grip, a squeal held near and past its peak, a chirp
    // when it's taken quickly, the long skid only in a real slide; on packed snow a squeak, never the rubber's)
    let squeal = 0; // the skid: a slide (past the peak and sliding)
    let held = 0; // the squeal held round a corner (near and past the peak)
    let scrub = 0; // the scrub (from half the grip)
    let usedHard = 0;
    let squeak = 0;
    let snowRoll = 0;
    let snowSlide = 0;
    let hiss = 0;
    let wet = 0;
    let grit = 0;
    let hard = 0;
    let rough = 0;
    let snowy = 0;
    const going = clamp(r.speed / 6);
    for (const w of s.wheels) {
      if (!w.contact) continue;
      const g = GRIP[w.ground];
      const isHard = w.ground === "asphalt" || w.ground === "walk" || w.ground === "floor" || w.ground === "rock";
      const slide = clamp((w.used - 0.85) * 1.6) * clamp(w.slip / 1.5);
      if (isHard || w.ground === "wet") {
        // (the wet: a little of it, under its hiss)
        const k = isHard ? 1 : 0.45;
        squeal = Math.max(squeal, slide * k);
        held = Math.max(held, smooth(0.82, 1.1, w.used) * going * k);
        scrub = Math.max(scrub, smooth(0.5, 0.9, w.used) * going * k);
        usedHard = Math.max(usedHard, w.used * k);
        if (isHard) hard += 0.25;
      }
      if (w.ground === "snow" || w.ground === "deep" || w.ground === "path") {
        snowRoll += 0.25 * clamp(r.speed / 6);
        snowSlide = Math.max(snowSlide, slide);
        snowy += 0.25;
        // (cold packed snow squeaks under the weight: rolling slowly, and as it's leaned on in a turn)
        if (w.ground !== "deep")
          squeak = Math.max(
            squeak,
            clamp(r.speed / 1.5) * (1 - 0.75 * clamp((r.speed - 3) / 7)) * (0.5 + 0.5 * smooth(0.4, 1, w.used)),
          );
      }
      if (w.ground === "ice" || w.ground === "blackice") hiss += 0.25 * clamp(r.speed / 15) + 0.3 * slide;
      if (w.ground === "slush") wet += 0.25 * clamp(r.speed / 10);
      if (w.ground === "wet") wet += 0.16 * clamp(r.speed / 14);
      if (w.ground === "mud") wet += 0.2 * clamp(r.speed / 8) + 0.15 * slide;
      if (w.ground === "grass" || w.ground === "earth" || w.ground === "rock")
        grit += 0.25 * clamp(r.speed / 6) + 0.15 * slide;
      rough += 0.25 * g.rough;
    }
    const sp = clamp(r.speed / 25);
    // the road under the tyres; the rubber (scrub, held squeal, skid, a chirp); snow rolling, squeaking and
    // sliding; grit; wet
    const rolled = this.bed("road-roll", hard * sp * (inCar ? 0.45 : 0.3), 0.8 + r.speed / 60);
    this.bed("scrub", 0.22 * scrub * (1 - held), 0.9 + 0.15 * scrub);
    const heldIn = this.bed("squeal-loop", 0.5 * held * (1 - 0.6 * squeal), 0.92 + 0.1 * held + r.speed / 300);
    const skid = this.bed("skid", 0.75 * squeal, 0.95 + 0.1 * squeal);
    // (a chirp: the grip taken quickly — a flick in, a launch, a stab of the brake)
    const rise = (usedHard - this.usedWas) / Math.max(dt, 1e-3);
    if (usedHard > 0.85 && rise > 3 && t - this.chirpAt > 0.7 && this.shot("chirp", 0.3 * clamp(rise / 8, 0.4, 1)))
      this.chirpAt = t;
    this.usedWas = usedHard;
    if (!heldIn && squeal > 0.45 && t - this.squealAt > 1.4 && this.shot("squeal", 0.25 * squeal)) this.squealAt = t;
    this.bed("snow-squeak", 0.35 * squeak * (snowy > 0 ? 1 : 0), 0.9 + 0.2 * squeak);
    const snowed = this.bed("snow-roll", 0.5 * snowRoll, 0.85 + r.speed / 40);
    const slid = this.bed("snow-slide", 0.5 * snowSlide * snowy, 0.9 + 0.2 * snowSlide);
    this.bed("gravel", 0.4 * grit, 0.85 + r.speed / 40);
    const wetted = this.bed("slush", 0.45 * wet, 0.85 + r.speed / 40);
    if (wet > 0.15 && !this.wetWas && r.speed > 8 && t - this.splashAt > 1.5 && this.shot("splash", 0.35))
      this.splashAt = t;
    this.wetWas = wet > 0.15;
    // (the synth's, for what isn't in: its chatter louder and softer at random)
    const sqK = skid ? 0 : Math.max(squeal, heldIn ? 0 : 0.6 * held);
    this.tyre.sqg.gain.setTargetAtTime(0.5 * sqK * (0.55 + 0.45 * Math.random()), t, 0.015);
    this.tyre.sq.forEach((bp, i) => {
      bp.frequency.setTargetAtTime((i ? 2250 : 1300) * (1 + 0.12 * sqK) * (0.93 + 0.14 * Math.random()), t, 0.02);
    });
    this.tyre.roll.gain.setTargetAtTime(sp * (rolled ? rough * 4 : 0.05 + rough * 8), t, tc);
    this.tyre.rlp.frequency.setTargetAtTime(120 + r.speed * 18, t, tc);
    const crunch = (snowed ? 0 : snowRoll) + (slid ? 0 : 0.2 * snowSlide * snowy * 4) + 0.5 * grit;
    this.tyre.crunch.gain.setTargetAtTime(0.045 * crunch, t, tc);
    this.tyre.cbp.frequency.setTargetAtTime(900 + r.speed * 40, t, tc);
    if (this.synthSlots.has("ice-hiss") || !this.bed("ice-hiss", 0.4 * hiss))
      this.tyre.hiss.gain.setTargetAtTime(0.03 * hiss, t, tc);
    else this.tyre.hiss.gain.setTargetAtTime(0, t, tc);
    this.tyre.splash.gain.setTargetAtTime(wetted ? 0 : 0.05 * wet, t, tc);
    // its own: the snowcat's tracks, skis and runners on snow, the plough's blade, its reversing beep
    const moving = clamp(r.speed / 6);
    this.bed("tracks", 0.5 * moving, 0.7 + r.speed / 12);
    this.bed("runners", 0.45 * clamp(r.speed / 10) * (snowy || this.kind === "toboggan" ? 1 : 0.3), 0.8 + r.speed / 30);
    this.bed("plough", 0.45 * moving * (snowy > 0 ? 1 : 0.4));
    this.bed("reverse-beep", run && r.gear === -1 ? 0.3 : 0);
    // ── the wind
    // (plan 93 S6) chains: their links slapping the road with each turn of the wheel — loud on the hard ground,
    // a muffled jingle on the snow
    this.rattle(x.chains ?? 0, hard, r.speed, s.spec.wheel.r);
    // (plan 93 S5: a window down at speed — the wind's buffet through it, louder and nearer)
    const windK = Math.min(1, (r.speed / 40) ** 2) * (1 + 1.6 * open);
    if (this.bed("wind", 0.4 * windK, 0.8 + r.speed / 80 - 0.1 * open)) this.wind.g.gain.setTargetAtTime(0, t, 0.2);
    else {
      this.wind.g.gain.setTargetAtTime(
        Math.min(0.08 + 0.1 * open, (r.speed / 30) ** 2 * 0.06 * (1 + 1.6 * open)),
        t,
        0.2,
      );
      this.wind.bp.frequency.setTargetAtTime(300 + r.speed * 14, t, 0.2);
    }
    // ── the body: a scrape, a loose bumper
    this.bed("scrape", 0.7 * clamp(x.scrape ?? 0), 0.85 + r.speed / 40);
    this.bed("rattle", x.bumperHang ? 0.35 * clamp(r.speed / 10) : 0, 0.9 + r.speed / 50);
    // a knock: by what was hit and how hard
    if (s.hit && s.hit.at !== this.lastHit) {
      this.lastHit = s.hit.at;
      this.knock(s.hit.what ?? "wall", clamp(s.hit.j / 9000));
    }
    // ── the cabin: the indicator's relay, the wipers, the handbrake's ratchet
    if (inCar && !this.bed("indicator", x.indicating ? 0.22 : 0)) {
      if (blinkOn !== this.lastBlink) this.burst(0.04, blinkOn ? 2400 : 1900, 4, 0.02, "click");
    } else if (!inCar) this.bed("indicator", 0);
    this.lastBlink = blinkOn;
    const wipers = x.wipers ?? 0;
    this.bed("wiper", wipers ? (inCar ? 0.2 : 0.06) : 0, wipers === 1 ? 0.85 : wipers === 3 ? 1.2 : 1);
    const hand = x.hand ?? 0;
    if (hand > 0.5 && this.lastHand <= 0.5 && !this.shot("handbrake", inCar ? 0.3 : 0.12, { to: this.cabin }))
      this.burst(0.06, 1500, 3, 0.08, "click");
    this.lastHand = hand;
  }

  /** A knock: the picked recording for what it hit (a trunk, a post, a snowbank, metal by how hard), the
   *  synth's thud and ring till they're in; a person or a pet only a soft thud; a landing the suspension's. */
  private knock(what: string, k: number) {
    if (what === "person" || what === "pet") {
      this.burst(0.15 + 0.25 * k, 160, 0.7, 0.18 + 0.2 * k, "thud");
      return;
    }
    if (what === "ground") {
      if (this.synthSlots.has("thump") || !this.shot("thump", 0.2 + 0.4 * k))
        this.burst(0.18 + 0.3 * k, 110, 0.7, 0.16 + 0.15 * k, "thud");
      return;
    }
    const slot =
      what === "tree"
        ? "hit-tree"
        : what === "bank"
          ? "hit-snowbank"
          : what === "post" || what === "fence"
            ? "hit-post"
            : k < 0.25
              ? "hit-light"
              : k < 0.6
                ? "hit-mid"
                : "hit-heavy";
    if (this.shot(slot, 0.35 + 0.5 * k, { rate: 0.94 + Math.random() * 0.1 })) return;
    const soft = what === "bank" || what === "tree";
    this.burst(0.15 + 0.25 * k, soft ? 160 : 420, soft ? 0.7 : 1.4, 0.18 + 0.2 * k, "thud");
    if (!soft && k > 0.15) this.ring(0.12 * k);
  }

  /** Glass giving (a lamp, the windscreen, a side's windows). */
  glass() {
    if (!this.shot("hit-glass", 0.5)) this.ring(0.05);
  }
  /** The bumper off onto the road. */
  bumperDrop() {
    if (!this.shot("hit-light", 0.4, { rate: 0.8 })) this.burst(0.25, 300, 1, 0.2, "thud");
  }
  /** The boot or the bonnet shut. */
  lid(which: "boot" | "bonnet") {
    if (!this.shot(which, 0.4)) this.burst(0.3, 160, 0.8, 0.14, "thud");
  }

  /** The recorded engine at these revs and this load, by these mics. */
  private recorded(s: CarState, h: Hearing, R: EngineRec, run: boolean, load: number, dt: number) {
    const t = this.ctx.currentTime;
    this.load += (load - this.load) * Math.min(1, dt * 12);
    // the mics: inside the cabin's own (else the exhaust and the bay through the firewall); outside the
    // exhaust, the bay close by, the far one at a distance
    const has = (m: Mic) => !!R.loops[m];
    const farK = has("far") ? clamp((h.dist - 25) / 50) : 0;
    const mix: Partial<Record<Mic, number>> = h.inside
      ? has("cabin")
        ? { cabin: 1 }
        : { ex: 0.45, bay: 0.85 }
      : { ex: has("ex") ? 1 - farK : 0, bay: h.dist < 20 ? (has("ex") ? 0.25 : 1) : 0, far: farK };
    // (a set with only some mics: its first stands in)
    const first = (Object.keys(R.loops) as Mic[])[0];
    if (!Object.entries(mix).some(([m, v]) => (v ?? 0) > 0 && has(m as Mic))) mix[first] = 1;
    for (const m of Object.keys(R.loops) as Mic[]) {
      const k = mix[m] ?? 0;
      if (k > 0 && !this.voices[m]) this.voices[m] = this.makeVoices(m, R);
      this.rec.mic[m]?.gain.setTargetAtTime(k, t, 0.1);
    }
    const rpm = Math.max(300, s.rpm);
    const span = Math.log(R.hi / R.lo) || 1;
    for (const l of LOADS) {
      const lw = Math.sqrt(l === "on" ? this.load : 1 - this.load);
      for (const m of Object.keys(this.voices) as Mic[]) {
        const vs = this.voices[m]?.[l];
        if (!vs?.length) continue;
        const ws = weights(
          rpm,
          vs.map((v) => v.at),
        );
        vs.forEach((v, i) => {
          const x = clamp(Math.log(v.at / R.lo) / span);
          v.g.gain.setTargetAtTime(ws[i] * lw * level(l, x), t, 0.03);
          v.src.playbackRate.setTargetAtTime(clamp(rpm / v.at, 0.3, 2.2), t, 0.02);
        });
      }
    }
    let g = run ? 1.1 : 0;
    // the limiter's stutter; the loops come in under the starter clip's end
    if (run && s.rpm > s.spec.engine.limit - 80) g *= 0.35 + 0.65 * (Math.sin(t * 95) > 0 ? 1 : 0);
    if (this.startAt >= 0) g *= clamp((t - this.startAt - (this.startLen - 1.0)) / 0.8);
    this.rec.g.gain.setTargetAtTime(g, t, 0.02);
    this.rec.lp.frequency.setTargetAtTime(h.inside ? (has("cabin") ? 7000 : 2400) : 18000, t, 0.1);
  }

  /** A door: its kind's recording opening and shutting; till it's in, a click and a thud. */
  door(open: boolean) {
    if (this.dead) return;
    const [o, sh] = doorSlots(this.kind);
    if (this.shot(open ? o : sh, open ? 0.3 : 0.45)) return;
    if (open) this.burst(0.08, 1800, 3, 0.05, "click");
    else {
      this.burst(0.3, 140, 0.8, 0.16, "thud");
      this.burst(0.06, 900, 2, 0.04, "click");
    }
  }

  /** The horn while held: its kind's recording, the middle of the blast looped; till it's in, two tones. */
  horn(on: boolean) {
    const c = this.ctx;
    if (on && !this.hornNode && !this.dead) {
      const b = this.bufs.get(hornSlot(this.kind))?.[0];
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(b ? 0.5 : 0.11, c.currentTime, 0.01);
      if (b) {
        const src = c.createBufferSource();
        src.buffer = b;
        src.loop = true;
        src.loopStart = b.duration * 0.2;
        src.loopEnd = b.duration * 0.8;
        src.connect(g).connect(this.outside);
        src.start();
        this.hornNode = {
          stop: () => {
            g.gain.setTargetAtTime(0, c.currentTime, 0.03);
            src.stop(c.currentTime + 0.15);
          },
        };
        return;
      }
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2000;
      g.connect(lp).connect(this.outside);
      const o = [392, 494].map((f) => {
        const os = c.createOscillator();
        os.type = "sawtooth";
        os.frequency.value = f;
        os.connect(g);
        os.start();
        return os;
      });
      this.hornNode = {
        stop: () => {
          g.gain.setTargetAtTime(0, c.currentTime, 0.02);
          for (const os of o) os.stop(c.currentTime + 0.12);
        },
      };
    } else if (!on && this.hornNode) {
      this.hornNode.stop();
      this.hornNode = null;
    }
  }

  /** A short sound: a burst of filtered noise (and the starter's whirr). */
  private burst(gain: number, freq: number, q: number, len: number, kind: "pop" | "thud" | "click" | "starter") {
    const c = this.ctx;
    const t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.02);
    const bp = c.createBiquadFilter();
    bp.type = kind === "thud" ? "lowpass" : "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    g.connect(this.outside);
    if (kind === "starter") {
      // the starter motor's whine, wavering as it turns the engine over
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 140;
      const lfo = c.createOscillator();
      lfo.frequency.value = 5.5;
      const lg = c.createGain();
      lg.gain.value = 30;
      lfo.connect(lg).connect(o.frequency);
      const ag = c.createGain();
      ag.gain.value = 0.5;
      const al = c.createGain();
      al.gain.value = 0.5;
      lfo.connect(al).connect(ag.gain);
      o.connect(bp).connect(ag).connect(g);
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(gain, t);
      g.gain.setValueAtTime(gain, t + len - 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.start(t);
      lfo.start(t);
      o.stop(t + len + 0.05);
      lfo.stop(t + len + 0.05);
      return;
    }
    const n = c.createBufferSource();
    n.buffer = noise(c);
    n.connect(bp).connect(g);
    n.start(t, Math.random());
    n.stop(t + len + 0.05);
  }
  /** Metal: a few inharmonic partials ringing down. */
  private ring(gain: number) {
    const c = this.ctx;
    const t = c.currentTime;
    for (const f of [310, 523, 847, 1290]) {
      const o = c.createOscillator();
      o.frequency.value = f * (0.95 + Math.random() * 0.1);
      const g = c.createGain();
      g.gain.setValueAtTime(gain / 3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5 + Math.random() * 0.4);
      o.connect(g).connect(this.outside);
      o.start(t);
      o.stop(t + 1);
    }
  }

  dispose() {
    this.dead = true;
    this.horn(false);
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      this.panner.disconnect();
      for (const n of this.srcs)
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
    }, 300);
  }
}

/** How much of each loop at `r` revs: the two either side, an equal-power crossfade by log revs. */
function weights(r: number, at: number[]): number[] {
  const w = at.map(() => 0);
  const n = at.length - 1;
  if (n < 0) return w;
  if (r <= at[0]) w[0] = 1;
  else if (r >= at[n]) w[n] = 1;
  else
    for (let i = 0; i < n; i++)
      if (r < at[i + 1]) {
        const x = Math.log(r / at[i]) / Math.log(at[i + 1] / at[i]);
        w[i] = Math.cos((x * Math.PI) / 2);
        w[i + 1] = Math.sin((x * Math.PI) / 2);
        break;
      }
  return w;
}
