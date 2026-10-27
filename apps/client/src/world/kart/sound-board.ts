// The kart's sounds, scripted (a dev page's: /dev/kart-sound). Each scene drives KartSound and
// kartFx through a context, live or offline: the offline render is what a test listens to (its
// levels, its spectrum) and what's saved as a WAV to hear.

import { KartSound, kartFx } from "./sound";

type Ctx = BaseAudioContext;
interface Scene {
  len: number;
  /** what to do at each step (1/60 s): `t` from the scene's start */
  run(ctx: Ctx, dest: AudioNode): (t: number) => void;
}

const STEP = 1 / 60;

/** A lap's worth: idle, off the line, a drift through the tiers, the turbo, lifting off, the kerb,
 *  snow, the jump, a bank. */
const drive: Scene = {
  len: 14,
  run(ctx, dest) {
    const s = new KartSound(ctx, dest);
    let v = 0;
    const fired = new Set<string>();
    const once = (k: string, f: () => void) => {
      if (fired.has(k)) return;
      fired.add(k);
      f();
    };
    return (t) => {
      const thr = t < 1 ? 0 : t > 8.5 && t < 9.5 ? 0 : 1;
      const boost = t > 6.5 && t < 8.1;
      const top = 24 * (boost ? 1.35 : 1) * (t > 10.5 && t < 11.5 ? 0.75 : 1);
      if (thr) v += (top * thr - v) * Math.min(1, 1.25 * STEP);
      else v = Math.max(0, v - (1.2 + 0.004 * v * v) * STEP);
      if (v > top) v -= (v - top) * Math.min(1, 2.5 * STEP);
      const drift = t > 4.5 && t < 6.5;
      const tier = drift ? Math.min(3, Math.floor((t - 4.5) / 0.6)) : 0;
      if (t > 6.5) once("turbo", () => s.whoosh(3));
      if (t > 4.42) once("hop", () => s.hop());
      if (t > 12.9) once("thud", () => s.thud(9));
      s.update({
        speed: v,
        throttle: thr,
        drift,
        tier,
        boost,
        air: (t > 4.42 && t < 4.5) || (t > 11.6 && t < 12.3),
        ground: t > 9.5 && t < 10.5 ? "kerb" : t > 10.5 && t < 11.5 ? "snow" : "asphalt",
      });
    };
  },
};

/** Every item's sound, a second and a half apart. */
const ITEMS = [
  "crate",
  "throw",
  "snowball",
  "staple",
  "ice",
  "fax",
  "blast",
  "drone",
  "coffee",
  "umbrella",
  "pop",
  "spin",
  "smash",
  "plough",
  "trick",
];
const items: Scene = {
  len: ITEMS.length * 1.5 + 1,
  run(ctx, dest) {
    let i = 0;
    return (t) => {
      while (i < ITEMS.length && t >= i * 1.5 + 0.2) kartFx(ctx, dest, ITEMS[i++]);
    };
  },
};

/** The lights, the go and the crowd, the flag (a podium, then not). */
const race: Scene = {
  len: 9,
  run(ctx, dest) {
    const s = new KartSound(ctx, dest);
    const at = [
      [0.2, () => s.beep(false)],
      [1.2, () => s.beep(false)],
      [2.2, () => s.beep(false)],
      [3.2, () => s.beep(true)],
      [3.25, () => kartFx(ctx, dest, "cheer", 0.8)],
      [5, () => s.fanfare(true)],
      [7.5, () => s.fanfare(false)],
    ] as [number, () => void][];
    let i = 0;
    return (t) => {
      s.update({ speed: 0, throttle: 0, drift: false, tier: 0, boost: false, air: false });
      while (i < at.length && t >= at[i][0]) at[i++][1]();
    };
  },
};

/** Someone else's kart going by, left to right, close: its pitch dropping as it passes. */
const flyby: Scene = {
  len: 6,
  run(ctx, dest) {
    const s = new KartSound(ctx, dest, { lite: true, detune: 0.4 });
    return (t) => {
      const x = -60 + t * 22;
      const z = 6;
      const d = Math.hypot(x, z);
      const vr = -(22 * x) / d;
      s.setGain(Math.max(0, 1 - d / 60) ** 2 * 0.8, (x / d) * 0.8);
      s.update({
        speed: 22,
        throttle: 0.8,
        drift: t > 2.6 && t < 3.6,
        tier: t > 3 ? 1 : 0,
        boost: false,
        air: false,
        pitch: 343 / (343 - vr),
      });
    };
  },
};

export const SCENES: Record<string, Scene> = { drive, items, race, flyby };

/** Rendered offline: the scene stepped at 60 Hz (the context suspended at each step). */
export async function renderScene(name: string, rate = 44100): Promise<AudioBuffer> {
  const sc = SCENES[name];
  const ctx = new OfflineAudioContext(2, Math.ceil(sc.len * rate), rate);
  const step = sc.run(ctx, ctx.destination);
  const n = Math.floor(sc.len / STEP);
  for (let i = 1; i < n; i++)
    void ctx.suspend(i * STEP).then(() => {
      step(i * STEP);
      void ctx.resume();
    });
  step(0);
  return ctx.startRendering();
}

/** Played live, in the page's context. */
export function playScene(ctx: AudioContext, name: string): () => void {
  const sc = SCENES[name];
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const step = sc.run(ctx, out);
  const t0 = ctx.currentTime;
  const id = setInterval(() => {
    const t = ctx.currentTime - t0;
    if (t > sc.len) stop();
    else step(t);
  }, STEP * 1000);
  const stop = () => {
    clearInterval(id);
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    setTimeout(() => out.disconnect(), 300);
  };
  return stop;
}

/** A buffer as a 16-bit WAV. */
export function wav(b: AudioBuffer): Uint8Array {
  const ch = b.numberOfChannels;
  const n = b.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  data.setUint32(4, 36 + n * ch * 2, true);
  str(8, "WAVEfmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, b.sampleRate, true);
  data.setUint32(28, b.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  str(36, "data");
  data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => b.getChannelData(c));
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const x = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(44 + (i * ch + c) * 2, x * 32767, true);
    }
  return new Uint8Array(data.buffer);
}
