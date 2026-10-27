// The kart's sound (docs/plan/46-the-karts.md, K-M6), synthesized, nothing to download.
//
// The engine is a little two-stroke: a buzzy harmonic wave through a soft clip and two
// resonances (the exhaust's, the expansion chamber's howl that climbs with the revs). Off the
// throttle it stutters ("ring-ding-ding") and lifting off at speed it crackles. Under it, the tyres
// by what they're on (a hum on asphalt, a crunch in snow, the kerb's brrr), the wind by the speed,
// the squeal of a drift with its sparks fizzing by tier. Once each: a chime as a tier comes in, the
// turbo's fwoomp, a bank's thud, a landing, a hop's spring; the lights and the flag.

import type { KartGround } from "@yutopia/shared/kart";

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  noiseBuf = b;
  return b;
}

/** A soft clip (tanh), harder with `k`. */
const clips = new Map<number, Float32Array<ArrayBuffer>>();
function clip(k: number): Float32Array<ArrayBuffer> {
  let c = clips.get(k);
  if (!c) {
    c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      c[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    clips.set(k, c);
  }
  return c;
}

/** The two-stroke's wave: every harmonic, the odd ones louder, a ragged phase (a buzz, not a saw). */
const waves = new WeakMap<BaseAudioContext, PeriodicWave>();
function engineWave(ctx: BaseAudioContext): PeriodicWave {
  let w = waves.get(ctx);
  if (!w) {
    const n = 28;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      const a = (i % 2 ? 1 : 0.55) / i ** 0.85;
      const ph = i * 2.39996;
      re[i] = a * Math.cos(ph);
      im[i] = a * Math.sin(ph);
    }
    w = ctx.createPeriodicWave(re, im);
    waves.set(ctx, w);
  }
  return w;
}

export interface KartSoundIn {
  /** forward speed (m/s), the throttle (0..1), drifting, the spark tier, boosting, in the air */
  speed: number;
  throttle: number;
  drift: boolean;
  tier: number;
  boost: boolean;
  air: boolean;
  /** what's under it (none: asphalt), spun out, in a wake (0..1), a Doppler shift (1: none) */
  ground?: KartGround;
  spin?: boolean;
  draft?: number;
  pitch?: number;
  /** on the grid, the throttle down: the engine's revs where it stands (0..1; minus: flooded,
   *  bouncing off the limiter — shared gridRevs) */
  rev?: number;
}

export interface KartSoundOpts {
  /** someone else's kart: the engine and the squeal only (eight of them cost little) */
  lite?: boolean;
  /** its engine a little apart from the others' (−1..1) */
  detune?: number;
}

export class KartSound {
  private out: GainNode;
  private pan: StereoPannerNode;
  private lite: boolean;
  private detune: number;
  private srcs: AudioScheduledSourceNode[] = [];
  // the engine
  private osc: OscillatorNode;
  private harm: OscillatorNode;
  private sub: OscillatorNode;
  private am: OscillatorNode;
  private amDepth: GainNode;
  private vca: GainNode;
  private drive: GainNode;
  private exhaust: BiquadFilterNode;
  private howl: BiquadFilterNode;
  private tone: BiquadFilterNode;
  private engineGain: GainNode;
  private intake: GainNode | null = null;
  // the drift
  private squeal: GainNode;
  private squealBand: BiquadFilterNode;
  private screech: OscillatorNode;
  private screechGain: GainNode;
  private fizz: GainNode | null = null;
  // the tyres, the wind
  private road: GainNode | null = null;
  private roadTone: BiquadFilterNode | null = null;
  private crunch: GainNode | null = null;
  private crunchBand: BiquadFilterNode | null = null;
  private crunchLfo: OscillatorNode | null = null;
  private kerb: GainNode | null = null;
  private kerbLfo: OscillatorNode | null = null;
  private wind: GainNode | null = null;
  private windBand: BiquadFilterNode | null = null;
  // memory
  private tier = 0;
  private throttle = 0;
  private rev = 0;
  private air = false;
  private airFrom = 0;
  private crackleAt = 0;

  constructor(
    private ctx: BaseAudioContext,
    dest: AudioNode,
    o: KartSoundOpts = {},
  ) {
    this.lite = !!o.lite;
    this.detune = o.detune ?? 0;
    this.pan = ctx.createStereoPanner();
    this.pan.connect(dest);
    this.out = ctx.createGain();
    this.out.gain.value = 0.55;
    // (nothing under 40 Hz: a speaker can't play it, and it eats the headroom)
    const floor = ctx.createBiquadFilter();
    floor.type = "highpass";
    floor.frequency.value = 40;
    this.out.connect(floor).connect(this.pan);

    // ── the engine: the wave and its octave-up rasp, a sub for the chug, through the clip ──
    this.osc = ctx.createOscillator();
    this.osc.setPeriodicWave(engineWave(ctx));
    this.harm = ctx.createOscillator();
    this.harm.type = "sawtooth";
    this.sub = ctx.createOscillator();
    this.sub.type = "triangle";
    this.drive = ctx.createGain();
    this.drive.gain.value = 1;
    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.18;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    this.osc.connect(this.drive);
    this.harm.connect(harmGain).connect(this.drive);
    this.sub.connect(subGain).connect(this.drive);
    // (the stutter: its loudness beaten at half the firing rate, deep off the throttle)
    this.vca = ctx.createGain();
    this.vca.gain.value = 0.8;
    this.am = ctx.createOscillator();
    this.am.type = "square";
    this.amDepth = ctx.createGain();
    this.amDepth.gain.value = 0.2;
    this.am.connect(this.amDepth).connect(this.vca.gain);
    const shaper = ctx.createWaveShaper();
    shaper.curve = clip(2.6);
    shaper.oversample = "2x";
    this.drive.connect(this.vca).connect(shaper);
    // two resonances side by side over a dry path, then a lowpass that opens with the revs
    this.exhaust = ctx.createBiquadFilter();
    this.exhaust.type = "bandpass";
    this.exhaust.Q.value = 2.2;
    this.howl = ctx.createBiquadFilter();
    this.howl.type = "bandpass";
    this.howl.Q.value = 5;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.Q.value = 0.9;
    const dry = ctx.createGain();
    dry.gain.value = 0.35;
    const exG = ctx.createGain();
    exG.gain.value = 1.1;
    const howlG = ctx.createGain();
    howlG.gain.value = 0.7;
    shaper.connect(dry).connect(this.tone);
    shaper.connect(this.exhaust).connect(exG).connect(this.tone);
    shaper.connect(this.howl).connect(howlG).connect(this.tone);
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.tone.connect(this.engineGain).connect(this.out);
    for (const s of [this.osc, this.harm, this.sub, this.am]) {
      s.start();
      this.srcs.push(s);
    }

    // ── the drift: a squeal of noise in a narrow band, a screech with a vibrato ──
    this.squealBand = ctx.createBiquadFilter();
    this.squealBand.type = "bandpass";
    this.squealBand.frequency.value = 2100;
    this.squealBand.Q.value = 7;
    this.squeal = ctx.createGain();
    this.squeal.gain.value = 0;
    this.loop().connect(this.squealBand).connect(this.squeal).connect(this.out);
    this.screech = ctx.createOscillator();
    this.screech.type = "triangle";
    this.screech.frequency.value = 1300;
    const vib = ctx.createOscillator();
    vib.frequency.value = 7.5;
    const vibD = ctx.createGain();
    vibD.gain.value = 35;
    vib.connect(vibD).connect(this.screech.frequency);
    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;
    this.screech.connect(this.screechGain).connect(this.out);
    for (const s of [this.screech, vib]) {
      s.start();
      this.srcs.push(s);
    }
    if (this.lite) return;

    // ── mine only: the intake's hiss, the sparks' fizz, the tyres, the wind ──
    const intakeBand = ctx.createBiquadFilter();
    intakeBand.type = "bandpass";
    intakeBand.frequency.value = 1700;
    intakeBand.Q.value = 1.4;
    this.intake = ctx.createGain();
    this.intake.gain.value = 0;
    this.loop().connect(intakeBand).connect(this.intake).connect(this.out);
    // (the sparks: high noise chopped fast and unevenly)
    const fizzHp = ctx.createBiquadFilter();
    fizzHp.type = "highpass";
    fizzHp.frequency.value = 5200;
    const fizzVca = ctx.createGain();
    fizzVca.gain.value = 0.5;
    const chop = ctx.createOscillator();
    chop.type = "sawtooth";
    chop.frequency.value = 31;
    const chopD = ctx.createGain();
    chopD.gain.value = 0.5;
    chop.connect(chopD).connect(fizzVca.gain);
    this.fizz = ctx.createGain();
    this.fizz.gain.value = 0;
    this.loop().connect(fizzHp).connect(fizzVca).connect(this.fizz).connect(this.out);
    // the tyres on the road: a low hum
    this.roadTone = ctx.createBiquadFilter();
    this.roadTone.type = "lowpass";
    this.roadTone.frequency.value = 300;
    this.road = ctx.createGain();
    this.road.gain.value = 0;
    this.loop().connect(this.roadTone).connect(this.road).connect(this.out);
    // in snow: a crunch, the noise beaten unevenly as the treads bite
    this.crunchBand = ctx.createBiquadFilter();
    this.crunchBand.type = "bandpass";
    this.crunchBand.frequency.value = 1500;
    this.crunchBand.Q.value = 0.8;
    const crunchVca = ctx.createGain();
    crunchVca.gain.value = 0.5;
    this.crunchLfo = ctx.createOscillator();
    this.crunchLfo.type = "sawtooth";
    const crunchD = ctx.createGain();
    crunchD.gain.value = 0.5;
    this.crunchLfo.connect(crunchD).connect(crunchVca.gain);
    this.crunch = ctx.createGain();
    this.crunch.gain.value = 0;
    this.loop().connect(this.crunchBand).connect(crunchVca).connect(this.crunch).connect(this.out);
    // over the kerb: brrr, the stripes going by
    const kerbLp = ctx.createBiquadFilter();
    kerbLp.type = "lowpass";
    kerbLp.frequency.value = 500;
    const kerbVca = ctx.createGain();
    kerbVca.gain.value = 0.5;
    this.kerbLfo = ctx.createOscillator();
    this.kerbLfo.type = "square";
    const kerbD = ctx.createGain();
    kerbD.gain.value = 0.5;
    this.kerbLfo.connect(kerbD).connect(kerbVca.gain);
    this.kerb = ctx.createGain();
    this.kerb.gain.value = 0;
    this.loop().connect(kerbLp).connect(kerbVca).connect(this.kerb).connect(this.out);
    // the wind past your helmet
    this.windBand = ctx.createBiquadFilter();
    this.windBand.type = "bandpass";
    this.windBand.Q.value = 0.6;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    this.loop().connect(this.windBand).connect(this.wind).connect(this.out);
    for (const s of [chop, this.crunchLfo, this.kerbLfo]) {
      s.start();
      this.srcs.push(s);
    }
  }

  /** A looping noise, started at its own place in the buffer (so no two are the same). */
  private loop(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = noise(this.ctx);
    s.loop = true;
    s.start(0, (this.srcs.length * 0.377) % 2);
    this.srcs.push(s);
    return s;
  }

  /** How loud (someone else's kart: by how far off it is), and where (−1 left … 1 right). */
  setGain(g: number, pan = 0) {
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0.55 * g, t, 0.1);
    this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.08);
  }

  update(k: KartSoundIn) {
    const t = this.ctx.currentTime;
    const v = Math.abs(k.speed);
    const r = Math.min(1.3, v / 24);
    const grid = k.rev ?? 0;
    const thr = grid ? 1 : Math.max(0, Math.min(1, k.throttle));
    // ── the revs: with the speed, a little ahead of it under the throttle (the clutch slipping off
    //    the line), more on a boost, free-revving in the air and on the grid ──
    let rev = Math.max(0.04, r * 0.82 + thr * 0.16 * (1 - r * 0.5)) + (k.boost ? 0.12 : 0);
    if (k.air) rev += thr * 0.22;
    rev = Math.max(rev, Math.abs(grid));
    let f = (36 + rev * 205) * (1 + this.detune * 0.025) * (k.pitch ?? 1);
    if (k.spin) f *= 1 + 0.18 * Math.sin(t * 13);
    const at = (p: AudioParam, x: number, tc = 0.05) => p.setTargetAtTime(x, t, tc);
    at(this.osc.frequency, f);
    at(this.harm.frequency, f * 2.013);
    at(this.sub.frequency, f / 2);
    at(this.am.frequency, f / 2);
    // (off the throttle it stutters; on it, it smooths out and the clip bites harder)
    // (flooded: missing, hunting at the limiter)
    const stutter = grid < 0 ? 0.55 : (1 - thr) * (rev < 0.55 ? 0.42 : 0.18) + 0.06;
    at(this.amDepth.gain, stutter, 0.08);
    at(this.vca.gain, 1 - stutter, 0.08);
    at(this.drive.gain, 0.55 + thr * 1.5 + (k.boost ? 0.5 : 0), 0.06);
    at(this.exhaust.frequency, f * 3.1);
    at(this.howl.frequency, 650 + rev * 1500, 0.07);
    at(this.tone.frequency, 700 + rev * 2600 + thr * 1800, 0.06);
    at(this.engineGain.gain, 0.045 + 0.055 * thr + 0.04 * Math.min(1, rev) + (k.boost ? 0.025 : 0), 0.05);
    // lifting off at speed (or off a rev on the grid): the exhaust pops and crackles
    const was = Math.max(rev, this.rev);
    if (!this.lite && this.throttle > 0.6 && thr < 0.2 && was > 0.5 && t > this.crackleAt) {
      this.crackleAt = t + 0.6;
      this.crackle(3 + Math.floor(was * 4));
    }
    this.throttle = thr;
    this.rev = rev;

    // ── the drift ──
    const sliding = k.drift && !k.air;
    at(this.squeal.gain, sliding ? 0.09 + 0.03 * k.tier : 0, 0.04);
    at(this.squealBand.frequency, 1900 + k.tier * 220, 0.1);
    at(this.screechGain.gain, sliding ? 0.016 + 0.006 * k.tier : 0, 0.05);
    at(this.screech.frequency, 1180 + k.tier * 140 + v * 6, 0.1);
    if (k.tier > this.tier && k.drift) this.tick(k.tier);
    this.tier = k.drift ? k.tier : 0;
    if (this.lite) return;
    if (this.fizz) at(this.fizz.gain, sliding && k.tier > 0 ? 0.018 * k.tier : 0, 0.05);
    if (this.intake) at(this.intake.gain, thr * (0.006 + 0.02 * Math.min(1, rev)), 0.05);

    // ── the tyres, by what they're on (nothing in the air) ──
    const g = k.air ? null : (k.ground ?? "asphalt");
    const hard = g === "asphalt" || g === "kerb";
    const slick = g === "ice" || g === "blackice";
    const soft = g === "snow" || g === "deep";
    if (this.road && this.roadTone) {
      at(this.road.gain, hard ? Math.min(0.07, v * 0.0028) : slick ? Math.min(0.02, v * 0.0008) : 0, 0.06);
      at(this.roadTone.frequency, 180 + v * 22 + (slick ? 2500 : 0), 0.1);
    }
    if (this.crunch && this.crunchBand && this.crunchLfo) {
      at(this.crunch.gain, soft ? Math.min(0.14, v * (g === "deep" ? 0.01 : 0.007)) : 0, 0.06);
      at(this.crunchLfo.frequency, 5 + v * 0.9, 0.1);
      at(this.crunchBand.frequency, (g === "deep" ? 700 : 1300) + v * 25, 0.1);
    }
    if (this.kerb && this.kerbLfo) {
      at(this.kerb.gain, g === "kerb" ? Math.min(0.12, v * 0.006) : 0, 0.03);
      at(this.kerbLfo.frequency, Math.max(1, v * 3.2), 0.05);
    }
    // ── the wind: with the speed's square, more in the air and in a wake ──
    if (this.wind && this.windBand) {
      at(this.wind.gain, 0.003 + r * r * 0.05 + (k.air ? 0.02 : 0) + (k.draft ?? 0) * 0.035, 0.12);
      at(this.windBand.frequency, 450 + r * 1500 + (k.draft ?? 0) * 600, 0.15);
    }
    // landing (the update after the air): a thump by the drop (not a drift's little hop)
    if (!this.air && k.air) this.airFrom = t;
    if (this.air && !k.air && t - this.airFrom > 0.3) this.land(0.4 + r * 0.6 + (t - this.airFrom) * 0.8);
    this.air = k.air;
  }

  // ── once each ──
  private noiseHit(o: {
    type: BiquadFilterType;
    f: number;
    f1?: number;
    q?: number;
    at?: number;
    len: number;
    vol: number;
    attack?: number;
  }) {
    const t = this.ctx.currentTime + (o.at ?? 0);
    const s = this.ctx.createBufferSource();
    s.buffer = noise(this.ctx);
    const f = this.ctx.createBiquadFilter();
    f.type = o.type;
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.len);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.len);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + o.len + 0.05);
  }
  private toneHit(type: OscillatorType, f0: number, f1: number, len: number, vol: number, at = 0, attack = 0.005) {
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  /** A spark tier comes in: a bright two-note chime, higher each time. */
  private tick(tier: number) {
    const f = [0, 1046, 1318, 1760][tier] ?? 1760;
    this.toneHit("triangle", f, f, 0.16, 0.1);
    this.toneHit("sine", f * 2.01, f * 2, 0.22, 0.05, 0.03);
    this.noiseHit({ type: "highpass", f: 6000, len: 0.08, vol: 0.05 });
  }

  /** Lifting off at speed: the exhaust's pops, uneven, dying away. */
  private crackle(n: number) {
    let at = 0.04;
    for (let i = 0; i < n; i++) {
      at += 0.03 + Math.random() * 0.09;
      const vol = 0.16 * (1 - i / (n + 1));
      this.noiseHit({ type: "bandpass", f: 500 + Math.random() * 700, q: 1.6, at, len: 0.045, vol });
      this.toneHit("sine", 140, 60, 0.05, vol * 0.6, at);
    }
  }

  /** A turbo fired (its tier: the bigger, the bigger the fwoomp). */
  whoosh(tier: number) {
    const k = 0.7 + tier * 0.25;
    // the flame lighting: a low thump with a pop on it
    this.toneHit("sine", 150, 45, 0.25, 0.32 * k);
    this.noiseHit({ type: "lowpass", f: 900, len: 0.12, vol: 0.25 * k });
    // the rush: noise swept up and away
    this.noiseHit({ type: "bandpass", f: 400, f1: 2800, q: 1.1, len: 0.45 + tier * 0.15, vol: 0.22 * k, attack: 0.05 });
    // crackling as it burns
    for (let i = 0; i < 2 + tier * 2; i++)
      this.noiseHit({ type: "highpass", f: 2500, at: 0.05 + i * 0.07 + Math.random() * 0.04, len: 0.03, vol: 0.08 });
  }

  /** The slipstream paid out: the air letting go of you, a rising rush. */
  drafted() {
    this.noiseHit({ type: "bandpass", f: 700, f1: 3500, q: 0.9, len: 0.6, vol: 0.2, attack: 0.15 });
    this.toneHit("sine", 400, 900, 0.5, 0.05, 0.05, 0.1);
  }

  /** Off a bank or a wall: a thud by how hard, the bodywork's clack, a scrape on a hard one. */
  thud(j: number) {
    const v = Math.min(1, 0.15 + j * 0.06);
    this.toneHit("sine", 110, 45, 0.22, 0.5 * v);
    this.noiseHit({ type: "lowpass", f: 320, len: 0.25, vol: 0.45 * v });
    this.noiseHit({ type: "bandpass", f: 1300, q: 3, len: 0.06, vol: 0.2 * v });
    if (j > 6) this.noiseHit({ type: "bandpass", f: 3200, f1: 2200, q: 2, at: 0.03, len: 0.3, vol: 0.12 * v });
  }

  /** Down from the air: a thump and the frame's rattle. */
  land(j: number) {
    const v = Math.min(1, j * 0.5);
    this.toneHit("sine", 90, 40, 0.18, 0.35 * v);
    this.noiseHit({ type: "lowpass", f: 260, len: 0.16, vol: 0.3 * v });
    for (let i = 0; i < 3; i++)
      this.noiseHit({ type: "bandpass", f: 2200, q: 4, at: 0.03 + i * 0.035, len: 0.025, vol: 0.05 * v });
  }

  /** A hop: a little spring. */
  hop() {
    this.toneHit("sine", 260, 520, 0.12, 0.07);
  }

  /** At the flag: a jingle (the podium's longer, harmonised, with a drum), or a two-note chime. */
  fanfare(podium: boolean) {
    const lead: [number, number, number][] = podium
      ? [
          [523, 0, 0.12],
          [659, 0.13, 0.12],
          [784, 0.26, 0.12],
          [1046, 0.39, 0.3],
          [784, 0.72, 0.12],
          [1046, 0.85, 0.7],
        ]
      : [
          [784, 0, 0.16],
          [1046, 0.18, 0.5],
        ];
    for (const [f, at, len] of lead) {
      this.toneHit("square", f, f, len, 0.11, at, 0.01);
      if (podium) this.toneHit("triangle", f * 0.8, f * 0.8, len, 0.09, at, 0.01);
    }
    if (!podium) return;
    for (const [f, at, len] of [
      [131, 0, 0.38],
      [196, 0.39, 0.32],
      [131, 0.72, 0.8],
    ])
      this.toneHit("triangle", f, f, len, 0.12, at, 0.01);
    for (const at of [0, 0.26, 0.39, 0.72, 0.85])
      this.noiseHit({ type: "bandpass", f: 1800, q: 0.8, at, len: 0.1, vol: 0.09 });
  }

  /** The start lights: a beep each, a higher, longer one for GO. */
  beep(go: boolean) {
    const f = go ? 880 : 440;
    const len = go ? 0.75 : 0.22;
    this.toneHit("square", f, f, len, 0.13, 0, 0.004);
    this.toneHit("sine", f * 2, f * 2, len * 0.8, 0.08, 0, 0.004);
  }

  dispose() {
    for (const s of this.srcs) {
      try {
        s.stop();
      } catch {}
    }
    this.pan.disconnect();
  }
}

/** Each item's level, evened out (measured offline: /dev/kart-sound's peaks, −8 dB for the biggest
 *  bang to about −20 for the small ones; the engine runs at about −22). */
const LEVEL: Record<string, number> = {
  throw: 1.4,
  snowball: 0.8,
  ice: 1.8,
  fax: 1.8,
  blast: 0.5,
  drone: 1.6,
  coffee: 1.8,
  pop: 0.55,
  smash: 0.6,
  plough: 0.8,
  trick: 1.3,
};

/** What the items sound like, once each, `gain` by how near, `pan` where (synthesized, as the rest). */
export function kartFx(ctx: BaseAudioContext, dest: AudioNode, kind: string, gain = 1, pan = 0) {
  if (gain <= 0.02) return;
  gain *= LEVEL[kind] ?? 1;
  const t = ctx.currentTime;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(dest);
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(p);
  const tone = (type: OscillatorType, f0: number, f1: number, at: number, len: number, vol: number, attack = 0.01) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t + at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + at + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(vol, t + at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
    o.connect(g).connect(out);
    o.start(t + at);
    o.stop(t + at + len + 0.02);
    return o;
  };
  const hiss = (
    type: BiquadFilterType,
    fq: number,
    q: number,
    at: number,
    len: number,
    vol: number,
    sweepTo?: number,
    attack = 0.004,
  ) => {
    const s = ctx.createBufferSource();
    s.buffer = noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(fq, t + at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + at + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(vol, t + at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
    s.connect(f).connect(g).connect(out);
    s.start(t + at, Math.random() * 1.5);
    s.stop(t + at + len + 0.02);
  };
  /** Little bits (snow, glass, debris): `n` short ticks over `len` s. */
  const grains = (n: number, at: number, len: number, f: number, vol: number) => {
    for (let i = 0; i < n; i++) {
      const u = i / n;
      hiss(
        "bandpass",
        f * (0.7 + Math.random() * 0.6),
        3,
        at + u * len + Math.random() * 0.02,
        0.025,
        vol * (1 - u * 0.7),
      );
    }
  };
  switch (kind) {
    case "throw": // a snowball, a fax: the arm's swish
      hiss("bandpass", 700, 1.4, 0, 0.2, 0.28, 2600, 0.04);
      break;
    case "snowball": // its splat: a soft thump and the snow scattering
      tone("sine", 180, 60, 0, 0.12, 0.3);
      hiss("lowpass", 1400, 0.7, 0, 0.18, 0.5);
      grains(10, 0.02, 0.25, 3200, 0.12);
      break;
    case "staple": // the stapler: a metal clack, the staple's zip past
      tone("square", 2300, 1500, 0, 0.025, 0.1);
      tone("triangle", 3170, 2900, 0, 0.09, 0.05);
      hiss("bandpass", 4000, 2, 0.02, 0.12, 0.12, 1800);
      break;
    case "ice": // laid down: a glassy crackle, spreading
      for (let i = 0; i < 6; i++) tone("triangle", 2600 + i * 350, 1700 + i * 100, i * 0.035, 0.07, 0.05);
      grains(14, 0, 0.35, 6000, 0.07);
      break;
    case "fax": // its modem: the answer tone, the warble, then the screech
      tone("sine", 2100, 2100, 0, 0.35, 0.06);
      for (let i = 0; i < 6; i++) tone("square", i % 2 ? 1200 : 2400, i % 2 ? 1200 : 2400, 0.38 + i * 0.05, 0.05, 0.04);
      hiss("bandpass", 1800, 4, 0.7, 0.4, 0.08, 2600, 0.02);
      break;
    case "blast": // the fax going off: a boom with a sub, crackling, the debris coming down
      tone("sine", 95, 28, 0, 0.9, 0.8);
      tone("triangle", 60, 30, 0, 0.6, 0.4);
      hiss("lowpass", 1200, 0.6, 0, 0.9, 0.7, 150);
      hiss("bandpass", 3000, 0.8, 0.02, 0.25, 0.25);
      grains(16, 0.25, 0.8, 2400, 0.1);
      break;
    case "drone": {
      // Vortex's drone: its rotors' buzz, beaten by the blades, rising as it comes
      const a = tone("sawtooth", 170, 250, 0, 0.7, 0.07, 0.08);
      const b = tone("sawtooth", 173, 256, 0, 0.7, 0.05, 0.08);
      const beat = ctx.createOscillator();
      beat.frequency.value = 38;
      const d = ctx.createGain();
      d.gain.value = 40;
      beat.connect(d);
      d.connect(a.frequency);
      d.connect(b.frequency);
      beat.start(t);
      beat.stop(t + 0.75);
      hiss("bandpass", 900, 1.2, 0, 0.7, 0.05, 1300, 0.1);
      break;
    }
    case "coffee": // a slurp, then the power coming on
      for (let i = 0; i < 3; i++) hiss("bandpass", 600 + i * 250, 3, i * 0.07, 0.09, 0.25, 1400);
      [392, 523, 659, 784].forEach((f, i) => {
        tone("square", f, f, 0.25 + i * 0.06, 0.07, 0.06);
      });
      break;
    case "umbrella": // up with a whoomph and a pop
      hiss("lowpass", 300, 1, 0, 0.18, 0.35, 1500, 0.06);
      tone("sine", 500, 1400, 0.12, 0.1, 0.18);
      break;
    case "pop": // the umbrella taking a hit: a bubble popping
      tone("sine", 1400, 400, 0, 0.09, 0.22);
      hiss("highpass", 2000, 1, 0, 0.1, 0.35);
      break;
    case "spin": // spun out: a cartoon whistle, wobbling down
      tone("triangle", 900, 220, 0, 0.8, 0.13);
      tone("triangle", 960, 200, 0.05, 0.8, 0.08);
      hiss("bandpass", 2400, 6, 0, 0.5, 0.08, 1400);
      break;
    case "smash": // smashed: a crunch, bits flying, the crowd's "ooh"
      tone("sawtooth", 100, 35, 0, 0.4, 0.3);
      hiss("lowpass", 2000, 0.6, 0, 0.45, 0.8, 200);
      grains(18, 0.05, 0.6, 3000, 0.12);
      for (const f of [330, 392, 466]) tone("sine", f, f * 0.8, 0.35, 0.9, 0.025, 0.2);
      break;
    case "crate": // a crate's taken: the cardboard bursting, then the roulette's ticks, slowing
      hiss("bandpass", 900, 1.4, 0, 0.1, 0.35);
      tone("square", 220, 160, 0, 0.06, 0.12);
      for (let i = 0, at = 0.12; i < 10; i++, at += 0.06 + i * 0.008) {
        const f = 1100 + (i % 4) * 180;
        tone("square", f, f, at, 0.03, 0.05);
      }
      break;
    case "plough": // the plough's two-tone horn and its diesel growl
      tone("sawtooth", 220, 214, 0, 0.7, 0.13, 0.04);
      tone("sawtooth", 277, 270, 0, 0.7, 0.11, 0.04);
      tone("square", 55, 50, 0, 0.9, 0.12, 0.05);
      break;
    case "trick": // a trick off the jump: a whistle up
      tone("triangle", 600, 1800, 0, 0.22, 0.12);
      tone("triangle", 900, 2400, 0.08, 0.2, 0.08);
      break;
    case "cheer": // the stands: a roar of voices swelling and a few whistles
      for (let i = 0; i < 6; i++) hiss("bandpass", 500 + i * 230, 4, i * 0.03, 1.8, 0.09, 600 + i * 210, 0.4);
      hiss("lowpass", 900, 0.8, 0, 1.8, 0.1, undefined, 0.35);
      tone("sine", 2000, 2600, 0.3, 0.35, 0.03);
      tone("sine", 2400, 1900, 0.8, 0.3, 0.025);
      break;
  }
}
