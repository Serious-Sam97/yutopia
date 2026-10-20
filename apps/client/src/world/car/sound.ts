import { type CarState, GRIP, readout } from "@yutopia/shared/car";
import { sample } from "../sfx";

// A car's sound (docs/plan/28-the-car.md, Sound). The engine is recorded
// (below); until the recordings are in (or if they can't be had) it's
// synthesized: its firing pulses, the load in its tone, the intake under
// throttle. The rest is synthesized: the limiter's stutter, pops on a lift at
// high revs, the starter's whirr as a stand-in, the tyres by
// the ground under them (a squeal on asphalt, a crunch on snow, the hiss of
// ice, slush splashing), the wind, the knocks, the gear lever's clunk, the
// indicator's tick, the horn. Heard from inside, the outside goes through a
// low-pass and the cabin's own sounds come forward.

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

// The recorded engine: a Mercedes-Benz 190E-16V on a dyno (Chippy569, CC0 —
// public/sfx/CREDITS.md), loops at three revs at full load ("on") and none
// ("off"), by the exhaust ("ex") and in the engine bay ("bay"). Each is
// played at the car's revs over the revs it runs at — measured from its
// firing frequency, not its label — and the two either side crossfaded.
type Load = "on" | "off";
type Mic = "ex" | "bay";
const LOADS: Load[] = ["on", "off"];
const MICS: Mic[] = ["ex", "bay"];
/** [file, the revs it runs at, its level]. */
const POINTS: Record<Load, [string, number, number][]> = {
  on: [
    ["lo", 1290, 0.55],
    ["mid", 2560, 0.75],
    ["hi", 6210, 1],
  ],
  off: [
    ["lo", 1030, 0.26],
    ["mid", 2430, 0.32],
    ["hi", 6300, 0.5],
  ],
};
/** How much of each mic: out by the car, and in it (the bay's through the firewall). */
const MIX: Record<"out" | "in", Record<Mic, number>> = { out: { ex: 1, bay: 0.25 }, in: { ex: 0.45, bay: 0.85 } };
const START_LEVEL = 0.3; // the starter clip, its idle as loud as the idle loop's
interface Rec {
  bufs: Record<string, AudioBuffer>;
  start: AudioBuffer | null;
}
let recP: Promise<Rec | null> | null = null;
let recReady: Rec | null = null;

/** Fetch and decode the engine's recordings, once (to have them by the time
 *  someone gets in). Null if any loop is missing: the synth stays. */
export function preloadEngine(ctx: AudioContext): Promise<Rec | null> {
  if (!recP) {
    const names = MICS.flatMap((m) => LOADS.flatMap((l) => POINTS[l].map(([f]) => `${m}-${l}-${f}`)));
    recP = Promise.all([...names.map((n) => sample(ctx, `car/${n}`)), sample(ctx, "car/start")]).then((bs) => {
      const start = bs.pop() ?? null;
      if (bs.some((b) => !b)) return null;
      const bufs: Record<string, AudioBuffer> = {};
      names.forEach((n, i) => {
        bufs[n] = loopable(ctx, bs[i] as AudioBuffer);
      });
      recReady = { bufs, start };
      return recReady;
    });
  }
  return recP;
}
/** A loop with no seam: its tail crossfaded into its head (and the MP3's padding off both ends). */
function loopable(ctx: BaseAudioContext, b: AudioBuffer, skip = 0.03, xf = 0.12): AudioBuffer {
  const sr = b.sampleRate;
  const s0 = Math.round(skip * sr);
  const x = Math.round(xf * sr);
  const len = b.length - 2 * s0 - x;
  const src = b.getChannelData(0);
  const out = ctx.createBuffer(1, len, sr);
  const d = out.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = src[s0 + i];
  for (let i = 0; i < x; i++) {
    const k = ((i / x) * Math.PI) / 2;
    d[i] = src[s0 + i] * Math.sin(k) + src[s0 + len + i] * Math.cos(k);
  }
  return out;
}
/** How much of each loop at `r` revs: the two either side, an equal-power crossfade by log revs. */
function weights(r: number, at: number[]): number[] {
  const w = at.map(() => 0);
  const n = at.length - 1;
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
interface Voice {
  src: AudioBufferSourceNode;
  g: GainNode;
}

export interface Hearing {
  inside: boolean; // in this car, the windows up
  gain: number; // by distance (0..1)
  pan: number; // −1..1
}

export class CarSound {
  private out: GainNode;
  private pan: StereoPannerNode;
  private outside: BiquadFilterNode; // the world outside the cabin
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
    sq: OscillatorNode[];
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
  // the recorded engine: its loops (each mic's made when first heard), its level, the cabin's filter
  private rec: { g: GainNode; lp: BiquadFilterNode; mic: Record<Mic, GainNode> };
  private voices: Partial<Record<Mic, Record<string, Voice>>> = {};
  private load = 0;
  private startAt = -1; // when the starter clip began (the loops come in under its end)
  private inside = false;
  private hornNode: { g: GainNode; o: OscillatorNode[] } | null = null;
  private lastGear = 0;
  private lastThr = 0;
  private lastHit = -1;
  private lastBlink = false;
  private popT = 0;
  private crank = 0; // seconds of cranking left
  private dead = false;
  private srcs: AudioScheduledSourceNode[] = [];
  private keep<T extends AudioScheduledSourceNode>(n: T): T {
    this.srcs.push(n);
    return n;
  }

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
  ) {
    const c = ctx;
    this.out = c.createGain();
    this.out.gain.value = 0;
    this.pan = c.createStereoPanner();
    this.out.connect(this.pan).connect(dest);
    this.outside = c.createBiquadFilter();
    this.outside.type = "lowpass";
    this.outside.frequency.value = 18000;
    this.outside.connect(this.out);
    // ── the engine: three harmonics of its firing, shaped, filtered by load; pulses of noise
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
    // the firing's pulses: the shaped tone and a band of noise, both gated at the firing rate
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
    // the intake under throttle: a breathy band of noise
    const isrc = this.keep(loopNoise(c));
    const ibp = c.createBiquadFilter();
    ibp.type = "bandpass";
    ibp.Q.value = 3;
    const intake = c.createGain();
    intake.gain.value = 0;
    isrc.connect(ibp).connect(intake).connect(this.outside);
    this.eng = { o, g: eg, lp, am, amo, ng, nbp, intake, ibp };
    // ── the tyres
    const sqg = c.createGain();
    sqg.gain.value = 0;
    const sq: OscillatorNode[] = [];
    for (const f of [820, 1185]) {
      const os = c.createOscillator();
      os.type = "triangle";
      os.frequency.value = f;
      const vib = c.createOscillator();
      vib.frequency.value = 7 + Math.random() * 3;
      const vg = c.createGain();
      vg.gain.value = f * 0.04;
      vib.connect(vg).connect(os.frequency);
      vib.start();
      os.connect(sqg);
      os.start();
      this.keep(vib);
      sq.push(this.keep(os));
    }
    sqg.connect(this.outside);
    const rsrc = this.keep(loopNoise(c));
    const rlp = c.createBiquadFilter();
    rlp.type = "lowpass";
    rlp.frequency.value = 300;
    const roll = c.createGain();
    roll.gain.value = 0;
    rsrc.connect(rlp).connect(roll).connect(this.outside);
    // a crunch: crackling noise (gated at random) in a mid band
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
    // ice: a high hiss; slush: a wet band
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
    // ── the recorded engine (its own filter inside: the bay's heard through the firewall, not the glass)
    const rlpf = c.createBiquadFilter();
    rlpf.type = "lowpass";
    rlpf.frequency.value = 18000;
    const rg = c.createGain();
    rg.gain.value = 0;
    rg.connect(rlpf).connect(this.out);
    const mic = { ex: c.createGain(), bay: c.createGain() };
    for (const m of MICS) mic[m].connect(rg);
    this.rec = { g: rg, lp: rlpf, mic };
    void preloadEngine(ctx);
  }

  private makeVoices(m: Mic, R: Rec): Record<string, Voice> {
    const c = this.ctx;
    const vs: Record<string, Voice> = {};
    for (const l of LOADS)
      for (const [f] of POINTS[l]) {
        const src = c.createBufferSource();
        src.buffer = R.bufs[`${m}-${l}-${f}`];
        src.loop = true;
        const g = c.createGain();
        g.gain.value = 0;
        src.connect(g).connect(this.rec.mic[m]);
        src.start(c.currentTime, Math.random() * src.buffer.duration);
        vs[`${l}-${f}`] = { src: this.keep(src), g };
      }
    return vs;
  }

  /** The starter: the recording's crank and catch; if it isn't in within half a
   *  second, the synth's cranking (longer cold) and then it catches. */
  start(cold: number) {
    let done = false;
    this.crank = 9; // (quiet till it's known which)
    const go = (R: Rec | null) => {
      if (done || this.dead) return;
      done = true;
      const c = this.ctx;
      if (R?.start) {
        const t = c.currentTime;
        const src = c.createBufferSource();
        src.buffer = R.start;
        const g = c.createGain();
        const lvl = START_LEVEL * (this.inside ? 0.5 : 1);
        g.gain.setValueAtTime(lvl, t);
        g.gain.setValueAtTime(lvl, t + 1.3);
        g.gain.linearRampToValueAtTime(0.0001, t + 2.1);
        src.connect(g).connect(this.rec.lp);
        src.start(t);
        this.keep(src);
        this.crank = 0.3;
        this.startAt = t;
      } else {
        this.crank = 0.7 + cold * 1.6;
        this.burst(0.25, 160, 3, this.crank, "starter");
      }
    };
    if (recReady) go(recReady);
    else {
      setTimeout(() => go(recReady), 500);
      void preloadEngine(this.ctx).then(go);
    }
  }

  update(s: CarState, h: Hearing, dt: number, blinkOn: boolean, inCar: boolean) {
    if (this.dead) return;
    const c = this.ctx;
    const t = c.currentTime;
    const r = readout(s);
    const run = s.rpm > 50 && this.crank <= 0;
    if (this.crank > 0) this.crank -= dt;
    const tc = 0.04;
    this.out.gain.setTargetAtTime(h.gain, t, 0.08);
    this.pan.pan.setTargetAtTime(h.pan, t, 0.1);
    this.outside.frequency.setTargetAtTime(h.inside ? 1100 : 18000, t, 0.1);
    this.inside = h.inside;
    // the engine
    const f = Math.max(10, s.rpm / 30); // a four's firings a second (two a turn)
    const load = clamp(s.thr * (s.clutch > 0.5 ? 1 : 0.55));
    const R = recReady;
    const syn = R ? 0 : 1; // (the synth's engine only till the recordings are in)
    if (R) this.recorded(s, h, R, run, load, dt);
    for (const o of this.eng.o) o.frequency.setTargetAtTime(f * (o as unknown as { mul: number }).mul, t, 0.02);
    this.eng.amo.frequency.setTargetAtTime(f, t, 0.02);
    this.eng.lp.frequency.setTargetAtTime(180 + s.rpm * 0.28 + load * 1400, t, tc);
    let eg = run ? 0.1 + 0.18 * load + 0.04 * (s.rpm / 6000) : 0;
    // the limiter's stutter
    if (run && s.rpm > s.spec.engine.limit - 80) eg *= 0.35 + 0.65 * (Math.sin(t * 95) > 0 ? 1 : 0);
    this.eng.g.gain.setTargetAtTime(syn * eg * (h.inside ? 1.15 : 1), t, 0.02);
    this.eng.nbp.frequency.setTargetAtTime(f * 3, t, tc);
    this.eng.ng.gain.setTargetAtTime(run ? syn * (0.05 + 0.08 * load) : 0, t, tc);
    this.eng.ibp.frequency.setTargetAtTime(400 + s.rpm * 0.22, t, tc);
    this.eng.intake.gain.setTargetAtTime(run ? syn * 0.07 * load * (s.rpm / 6000) : 0, t, tc);
    // pops: a lift at high revs
    this.popT -= dt;
    if (run && this.lastThr > 0.6 && s.thr < 0.15 && s.rpm > 3800) this.popT = 0.6;
    if (this.popT > 0 && Math.random() < dt * 9)
      this.burst(0.07 + Math.random() * 0.08, 300 + Math.random() * 300, 0.6, 0.05, "pop");
    this.lastThr = s.thr;
    // a gear change: the lever's clunk (heard inside)
    if (r.gear !== this.lastGear) {
      if (inCar) this.burst(0.05, 900, 2, 0.04, "click");
      this.lastGear = r.gear;
    }
    // the tyres: the ground under the driven wheels sets the sound
    let squeal = 0;
    let crunch = 0;
    let hiss = 0;
    let splash = 0;
    let rough = 0;
    for (const w of s.wheels) {
      if (!w.contact) continue;
      const g = GRIP[w.ground];
      const hard = w.ground === "asphalt" || w.ground === "walk" || w.ground === "floor" || w.ground === "rock";
      const slide = clamp((w.used - 0.85) * 1.6) * clamp(w.slip / 1.5);
      if (hard) squeal = Math.max(squeal, slide);
      if (w.ground === "snow" || w.ground === "deep" || w.ground === "path")
        crunch += 0.25 * clamp(r.speed / 6) + 0.2 * slide;
      if (w.ground === "ice" || w.ground === "blackice") hiss += 0.25 * clamp(r.speed / 15) + 0.3 * slide;
      if (w.ground === "slush") splash += 0.25 * clamp(r.speed / 10);
      rough += 0.25 * g.rough;
    }
    this.tyre.sqg.gain.setTargetAtTime(0.05 * squeal, t, 0.05);
    for (const o of this.tyre.sq) o.detune.setTargetAtTime(-200 * (1 - squeal), t, 0.1);
    this.tyre.roll.gain.setTargetAtTime(clamp(r.speed / 25) * (0.05 + rough * 8), t, tc);
    this.tyre.rlp.frequency.setTargetAtTime(120 + r.speed * 18, t, tc);
    this.tyre.crunch.gain.setTargetAtTime(0.045 * crunch, t, tc);
    this.tyre.cbp.frequency.setTargetAtTime(900 + r.speed * 40, t, tc);
    this.tyre.hiss.gain.setTargetAtTime(0.03 * hiss, t, tc);
    this.tyre.splash.gain.setTargetAtTime(0.05 * splash, t, tc);
    // the wind
    this.wind.g.gain.setTargetAtTime(Math.min(0.08, (r.speed / 30) ** 2 * 0.06), t, 0.2);
    this.wind.bp.frequency.setTargetAtTime(300 + r.speed * 14, t, 0.2);
    // a knock
    if (s.hit && s.hit.at !== this.lastHit) {
      this.lastHit = s.hit.at;
      const k = clamp(s.hit.j / 9000);
      const soft = s.hit.what === "person" || s.hit.what === "bank" || s.hit.what === "tree";
      this.burst(0.15 + 0.25 * k, soft ? 160 : 420, soft ? 0.7 : 1.4, 0.18 + 0.2 * k, "thud");
      if (!soft && k > 0.15) this.ring(0.12 * k);
    }
    // the indicator's tick
    if (inCar && blinkOn !== this.lastBlink) this.burst(0.04, blinkOn ? 2400 : 1900, 4, 0.02, "click");
    this.lastBlink = blinkOn;
  }

  /** The recorded engine at these revs and this load, by these mics. */
  private recorded(s: CarState, h: Hearing, R: Rec, run: boolean, load: number, dt: number) {
    const t = this.ctx.currentTime;
    this.load += (load - this.load) * Math.min(1, dt * 12);
    const mix = MIX[h.inside ? "in" : "out"];
    for (const m of MICS) {
      this.rec.mic[m].gain.setTargetAtTime(mix[m], t, 0.1);
      if (!this.voices[m]) this.voices[m] = this.makeVoices(m, R);
    }
    const rpm = Math.max(300, s.rpm);
    for (const l of LOADS) {
      const ps = POINTS[l];
      const lw = Math.sqrt(l === "on" ? this.load : 1 - this.load);
      const ws = weights(
        rpm,
        ps.map((p) => p[1]),
      );
      for (const m of MICS) {
        const vs = this.voices[m];
        if (!vs) continue;
        ps.forEach(([f, at, lvl], i) => {
          const v = vs[`${l}-${f}`];
          v.g.gain.setTargetAtTime(ws[i] * lw * lvl, t, 0.03);
          v.src.playbackRate.setTargetAtTime(clamp(rpm / at, 0.4, 2.2), t, 0.02);
        });
      }
    }
    let g = run ? 1.1 : 0;
    // the limiter's stutter; the loops come in under the starter clip's end
    if (run && s.rpm > s.spec.engine.limit - 80) g *= 0.35 + 0.65 * (Math.sin(t * 95) > 0 ? 1 : 0);
    if (this.startAt >= 0) g *= clamp((t - this.startAt - 1.0) / 0.8);
    this.rec.g.gain.setTargetAtTime(g, t, 0.02);
    this.rec.lp.frequency.setTargetAtTime(h.inside ? 2400 : 18000, t, 0.1);
  }

  /** A door: opening, a latch's click; shutting, a heavy thud. */
  door(open: boolean) {
    if (this.dead) return;
    if (open) this.burst(0.08, 1800, 3, 0.05, "click");
    else {
      this.burst(0.3, 140, 0.8, 0.16, "thud");
      this.burst(0.06, 900, 2, 0.04, "click");
    }
  }

  horn(on: boolean) {
    const c = this.ctx;
    if (on && !this.hornNode) {
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.11, c.currentTime, 0.01);
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
      this.hornNode = { g, o };
    } else if (!on && this.hornNode) {
      const hn = this.hornNode;
      hn.g.gain.setTargetAtTime(0, c.currentTime, 0.02);
      for (const o of hn.o) o.stop(c.currentTime + 0.12);
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
      this.pan.disconnect();
      for (const n of this.srcs)
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
    }, 300);
  }
}
