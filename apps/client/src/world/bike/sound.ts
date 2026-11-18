import { BIKE_VARIANTS, type BikeKind } from "@yutopia/shared/bike";
import type { CarState, Ground } from "@yutopia/shared/car";
import type { CarExtras, Hearing } from "../car/sound";
import { distanceGain } from "../car/sound";
import { slotBuffers } from "../car/sound-bank";

// A bicycle heard (docs/plan/101-the-bicycles.md, phase 8): what a car's sound is to cars.ts (start, update, the horn —
// its bell —, switched off, let go), made of
//   - its tyres on the ground: the cars' own recordings of a road, snow and slush rolling (sfx/cars — car/sound-bank.ts
//     slots `road-roll`, `snow-roll`, `slush`), thinned and lifted for a bicycle's narrow ones, by its speed;
//   - the freewheel's pawls ticking as it coasts (made here: a buffer of clicks played faster as the wheel turns — its
//     hub's engagement points by its kind: the town bike's hub hums, the BMX's buzzes; a fixed gear has none);
//   - the chain and the cranks as it's pedalled, the gear's click as it changes;
//   - a rim brake's squeal (the cars' `squeal-loop`) and a locked back wheel's skid (`skid`) on the brakes;
//   - the bell (made here: four of a bell's own partials, struck twice, ringing down);
//   - a hard landing's thump, a crash's knock (`thump`, `hit-light`), the wind past the rider's ears.
// Its candidates for recordings of its own (a bell, a freewheel, a chain) wait on the user's OK to fetch them:
// docs/plan/101 phase 8.

const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const ROAD = new Set<Ground>(["asphalt", "walk", "floor", "rock", "earth"]);
const WET = new Set<Ground>(["slush", "wet", "mud"]);

/** Each kind's freewheel: its pawls' engagement points a turn of the wheel, how loud. */
const TICKS: Record<BikeKind, [number, number]> = {
  bike_town: [18, 0.35],
  bike_bmx: [36, 0.7],
  bike_mtb: [24, 0.55],
  bike_road: [24, 0.6],
};

let noiseB: AudioBuffer | null = null;
function noiseBuf(c: BaseAudioContext): AudioBuffer {
  if (noiseB && noiseB.sampleRate === c.sampleRate) return noiseB;
  const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = b.getChannelData(0);
  let s = 777;
  for (let i = 0; i < d.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (s / 0x7fffffff) * 2 - 1;
  }
  noiseB = b;
  return b;
}
let clickB: AudioBuffer | null = null;
/** A second of a pawl's clicks, a hundred of them (played faster or slower: the wheel's turning). */
function clickBuf(c: BaseAudioContext): AudioBuffer {
  if (clickB && clickB.sampleRate === c.sampleRate) return clickB;
  const sr = c.sampleRate;
  const b = c.createBuffer(1, sr, sr);
  const d = b.getChannelData(0);
  let s = 31;
  for (let k = 0; k < 100; k++) {
    const at = Math.floor((k / 100) * sr);
    const len = Math.floor(sr * 0.0025);
    const amp = 0.75 + (0.25 * ((k * 37) % 7)) / 7;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = (s / 0x7fffffff) * 2 - 1;
      // (a ring of metal: a fast decaying 4.2 kHz under the noise)
      d[at + i] = amp * Math.exp(-i / (sr * 0.0006)) * (0.6 * n + 0.4 * Math.sin((i / sr) * Math.PI * 2 * 4200));
    }
  }
  clickB = b;
  return b;
}

export class BikeSound {
  private out: GainNode;
  private air: BiquadFilterNode;
  private panner: PannerNode;
  private srcs: AudioScheduledSourceNode[] = [];
  private rolls = new Map<string, { src: AudioBufferSourceNode; g: GainNode } | null>();
  private tick: { src: AudioBufferSourceNode; g: GainNode };
  private chain: { g: GainNode; bp: BiquadFilterNode };
  private wind: { g: GainNode; bp: BiquadFilterNode };
  private squeal: { src: AudioBufferSourceNode; g: GainNode } | null = null;
  private skid: { src: AudioBufferSourceNode; g: GainNode } | null = null;
  private gear = 0;
  private hitAt = -1;
  private bellWas = false;
  private gone = false;
  private readonly fixed: boolean;
  private readonly kind: BikeKind;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
    who: { kind: BikeKind; variant?: string },
  ) {
    const c = ctx;
    this.kind = who.kind;
    this.fixed = !!BIKE_VARIANTS[who.variant ?? ""]?.fixed;
    this.out = c.createGain();
    this.out.gain.value = 0;
    this.air = c.createBiquadFilter();
    this.air.type = "lowpass";
    this.air.frequency.value = 16000;
    this.panner = c.createPanner();
    this.panner.panningModel = "equalpower";
    this.panner.distanceModel = "linear";
    this.panner.rolloffFactor = 0;
    this.out.connect(this.air).connect(this.panner).connect(dest);
    // the freewheel
    const tsrc = c.createBufferSource();
    tsrc.buffer = clickBuf(c);
    tsrc.loop = true;
    tsrc.playbackRate.value = 0.01;
    const tg = c.createGain();
    tg.gain.value = 0;
    const thp = c.createBiquadFilter();
    thp.type = "highpass";
    thp.frequency.value = 1800;
    tsrc.connect(thp).connect(tg).connect(this.out);
    tsrc.start();
    this.srcs.push(tsrc);
    this.tick = { src: tsrc, g: tg };
    // the chain and the cranks: a whirr of the links over the teeth
    const n = c.createBufferSource();
    n.buffer = noiseBuf(c);
    n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 3;
    bp.frequency.value = 1400;
    const cg = c.createGain();
    cg.gain.value = 0;
    n.connect(bp).connect(cg).connect(this.out);
    n.start(c.currentTime, Math.random());
    this.srcs.push(n);
    this.chain = { g: cg, bp };
    // the wind past the ears
    const w = c.createBufferSource();
    w.buffer = noiseBuf(c);
    w.loop = true;
    const wbp = c.createBiquadFilter();
    wbp.type = "lowpass";
    wbp.frequency.value = 600;
    const wg = c.createGain();
    wg.gain.value = 0;
    w.connect(wbp).connect(wg).connect(this.out);
    w.start(c.currentTime, Math.random());
    this.srcs.push(w);
    this.wind = { g: wg, bp: wbp };
    // the recordings, as they come
    for (const slot of ["road-roll", "snow-roll", "slush"]) this.loop(slot, (x) => this.rolls.set(slot, x), 0.9);
    this.loop(
      "squeal-loop",
      (x) => {
        this.squeal = x;
      },
      1.6,
    );
    this.loop(
      "skid",
      (x) => {
        this.skid = x;
      },
      1.3,
    );
  }

  /** A slot's first take looped, quiet till it's wanted (thinned: a bicycle's tyres, not a car's). */
  private loop(slot: string, then: (x: { src: AudioBufferSourceNode; g: GainNode }) => void, rate: number) {
    void slotBuffers(this.ctx, slot).then((bs) => {
      if (this.gone || !bs[0]) return;
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = bs[0];
      src.loop = true;
      src.playbackRate.value = rate;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 260;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(hp).connect(g).connect(this.out);
      src.start(c.currentTime, Math.random() * bs[0].duration);
      this.srcs.push(src);
      then({ src, g });
    });
  }
  private oneShot(slot: string, gain: number, rate = 1) {
    void slotBuffers(this.ctx, slot).then((bs) => {
      if (this.gone || !bs.length) return;
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = bs[Math.floor(Math.random() * bs.length)];
      src.playbackRate.value = rate;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.out);
      src.start();
    });
  }
  /** The gear changed: the derailleur's click. */
  private click(gain: number) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = clickBuf(c);
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.out);
    src.start(c.currentTime, 0, 0.012);
  }
  /** The bell: two strikes, its partials ringing down. */
  private bell() {
    const c = this.ctx;
    const f0 = this.kind === "bike_bmx" ? 3100 : 2550;
    for (const at of [0, 0.17]) {
      const t = c.currentTime + at;
      for (const [k, a, d] of [
        [1, 0.5, 1.4],
        [2.76, 0.28, 0.8],
        [5.4, 0.16, 0.45],
        [8.93, 0.08, 0.25],
      ]) {
        const o = c.createOscillator();
        o.frequency.value = f0 * k;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a * 0.22, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(this.out);
        o.start(t);
        o.stop(t + d + 0.05);
      }
    }
  }

  start() {}
  switchOff() {}
  siren() {}
  /** Its bell (the horn's key): rung as it's pressed. */
  horn(on: boolean) {
    if (on && !this.bellWas) this.bell();
    this.bellWas = on;
  }

  update(s: CarState, h: Hearing, dt: number, _blinkOn?: boolean, _inCar?: boolean, _x: CarExtras = {}) {
    if (this.gone) return;
    const c = this.ctx;
    const t = c.currentTime;
    const ease = (p: AudioParam, v: number, k = 0.06) => p.setTargetAtTime(v, t, k);
    const speed = Math.hypot(s.v.x, s.v.z);
    // its level by distance, where it is from me
    ease(this.out.gain, distanceGain(h.dist) * (h.inside ? 1 : 0.9), 0.05);
    ease(this.air.frequency, h.dist > 20 ? 16000 - Math.min(13000, h.dist * 110) : 16000, 0.1);
    if (h.at) {
      this.panner.positionX.value = h.at.x;
      this.panner.positionY.value = h.at.y;
      this.panner.positionZ.value = h.at.z;
    } else {
      this.panner.positionX.value = 0;
      this.panner.positionY.value = 0;
      this.panner.positionZ.value = -1;
    }
    // the tyres on what they're on (the front's ground for both)
    const w = s.wheels[0];
    const touching = s.wheels[0]?.contact || s.wheels[2]?.contact;
    const g = w?.ground ?? "asphalt";
    const which = WET.has(g) ? "slush" : ROAD.has(g) ? "road-roll" : "snow-roll";
    const roll = touching ? clamp(speed / 9) ** 1.3 * 0.42 : 0;
    for (const [slot, x] of this.rolls) {
      if (!x) continue;
      ease(x.g.gain, slot === which ? roll : 0, 0.12);
      x.src.playbackRate.setTargetAtTime(0.75 + speed / 16, t, 0.2);
    }
    // the freewheel's pawls: coasting, the wheel turning
    const [pts, loud] = TICKS[this.kind];
    const R = s.spec.wheel.r;
    const rps = speed / (2 * Math.PI * R);
    const coasting = !this.fixed && s.thr < 0.05 && speed > 0.4 && touching;
    this.tick.src.playbackRate.setTargetAtTime(Math.max(0.01, (rps * pts) / 100), t, 0.05);
    ease(this.tick.g.gain, coasting ? loud * 0.22 * clamp(speed / 2) : 0, 0.04);
    // the chain as it's pedalled
    const cad = s.rpm;
    ease(this.chain.g.gain, cad > 5 ? 0.035 * clamp(cad / 90) * (0.6 + 0.4 * s.thr) : 0, 0.08);
    ease(this.chain.bp.frequency, 900 + cad * 9, 0.1);
    if (s.gear !== this.gear) {
      if (this.gear !== 0 && speed > 1) this.click(0.5);
      this.gear = s.gear;
    }
    // the brakes: a rim's squeal at speed, a locked wheel's skid
    const braking = s.brk > 0.3 && speed > 2.5 && touching;
    if (this.squeal) ease(this.squeal.g.gain, braking && this.kind !== "bike_town" ? 0.05 * clamp(speed / 8) : 0, 0.08);
    const slid = Math.max(s.wheels[2]?.slip ?? 0, s.wheels[0]?.slip ?? 0);
    if (this.skid) ease(this.skid.g.gain, touching && slid > 1.5 ? 0.12 * clamp((slid - 1.5) / 4) : 0, 0.05);
    // the wind, by how fast
    ease(this.wind.g.gain, h.inside ? 0.12 * clamp((speed - 3) / 12) ** 1.5 : 0, 0.15);
    ease(this.wind.bp.frequency, 300 + speed * 40, 0.2);
    // a landing or a knock
    const hit = s.hit;
    if (hit && hit.at !== this.hitAt) {
      this.hitAt = hit.at;
      if (hit.what === "ground") this.oneShot("thump", clamp(hit.j / 900) * 0.8);
      else this.oneShot("hit-light", clamp(hit.j / 1500) * 0.7, 1.15);
    }
    void dt;
  }

  dispose() {
    this.gone = true;
    for (const x of this.srcs)
      try {
        x.stop();
      } catch {}
    this.out.disconnect();
  }
}
