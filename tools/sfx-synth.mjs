// The building's sound effects, synthesised (docs/plan/26-floor-transitions.md):
// made here, as the real things work, until (or instead of) recorded CC0 ones.
// Writes mono MP3s (a loop: a small WAV) into apps/client/public/sfx (needs
// ffmpeg on the PATH).
//
//   node tools/sfx-synth.mjs            all of them
//   node tools/sfx-synth.mjs chime      just the ones whose name has "chime"
//
// lift/chime        a struck tuned bar (a vibraphone's partials), soft mallet
// lift/button       a panel button: the switch's click, then a short beep
// lift/ride         the car going: the motor's hum, air in the shaft — loops seamlessly
// stairs/step-1..4  a shoe on a concrete tread: heel, then toe, in a stairwell
// stairs/door-open  a fire door's push bar: the latch clacks back, the leaf swings
// stairs/door-close the leaf swings to: a heavy thud, the latch, the frame rattles

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const SR = 44100;
const OUT = new URL("../apps/client/public/sfx/", import.meta.url).pathname;

// ── building blocks ─────────────────────────────────────────────────────────
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const buf = (sec) => new Float32Array(Math.ceil(sec * SR));
const add = (into, from, at = 0, gain = 1) => {
  const o = Math.round(at * SR);
  for (let i = 0; i < from.length && o + i < into.length; i++) into[o + i] += from[i] * gain;
  return into;
};

// a decaying sine (one mode of something struck)
function mode(sec, hz, t60, amp = 1, attack = 0.001) {
  const b = buf(sec);
  const k = Math.log(1000) / t60;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const a = Math.min(1, t / attack);
    b[i] = amp * a * Math.exp(-k * t) * Math.sin(2 * Math.PI * hz * t);
  }
  return b;
}

function noise(sec, r) {
  const b = buf(sec);
  for (let i = 0; i < b.length; i++) b[i] = r() * 2 - 1;
  return b;
}

// RBJ biquad, in place
function biquad(b, type, hz, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * hz) / SR;
  const cs = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === "lp") [b0, b1, b2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2];
  else if (type === "hp") [b0, b1, b2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2];
  else [b0, b1, b2] = [al, 0, -al]; // band-pass (peak gain 1)
  [a0, a1, a2] = [1 + al, -2 * cs, 1 - al];
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < b.length; i++) {
    const x = b[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    b[i] = y;
  }
  return b;
}

// an envelope: attack then exponential decay (t60), applied in place
function env(b, attack, t60, delay = 0) {
  const k = Math.log(1000) / t60;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR - delay;
    b[i] *= t < 0 ? 0 : Math.min(1, t / attack) * Math.exp(-k * t);
  }
  return b;
}

// a small room (Schroeder: four combs, two all-passes) — the stairwell's concrete
function room(b, sec, size = 1, damp = 0.35, wet = 0.25) {
  const out = buf(b.length / SR + sec);
  out.set(b);
  const wetb = buf(out.length / SR);
  for (const [ms, g] of [
    [29.7, 0.77],
    [37.1, 0.75],
    [41.1, 0.73],
    [43.7, 0.71],
  ]) {
    const d = Math.round((ms * size * SR) / 1000);
    const line = new Float32Array(d);
    let p = 0;
    let lp = 0;
    for (let i = 0; i < out.length; i++) {
      const y = line[p];
      lp = y * (1 - damp) + lp * damp;
      line[p] = out[i] + lp * g;
      p = (p + 1) % d;
      wetb[i] += y * 0.25;
    }
  }
  for (const ms of [5, 1.7]) {
    const d = Math.round((ms * SR) / 1000);
    const line = new Float32Array(d);
    let p = 0;
    for (let i = 0; i < wetb.length; i++) {
      const x = wetb[i];
      const y = line[p];
      const v = x + y * 0.7;
      line[p] = v;
      wetb[i] = y - v * 0.7;
      p = (p + 1) % d;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] += wetb[i] * wet;
  return out;
}

function fadeOut(b, sec) {
  const n = Math.round(sec * SR);
  for (let i = 0; i < n && i < b.length; i++) b[b.length - 1 - i] *= i / n;
  return b;
}

function peak(b, db = -3) {
  let m = 0;
  for (const v of b) m = Math.max(m, Math.abs(v));
  const g = 10 ** (db / 20) / (m || 1);
  for (let i = 0; i < b.length; i++) b[i] *= g;
  return b;
}

// ── the sounds ──────────────────────────────────────────────────────────────
const SOUNDS = {
  // A struck tuned bar, as the classic lift chime: the fundamental, the bar's
  // tuned 4th and 10th partials (decaying faster), a hint of an inharmonic
  // mode, a slow shimmer, a felt mallet's tick. A5.
  "lift/chime": () => {
    const f = 880;
    const b = buf(2.6);
    add(b, mode(2.6, f, 2.3, 1.0, 0.002));
    add(b, mode(2.6, f * 2.0, 1.2, 0.18, 0.002));
    add(b, mode(2.6, f * 4.0, 0.7, 0.22, 0.0015));
    add(b, mode(2.6, f * 2.76, 0.5, 0.05, 0.0015));
    add(b, mode(2.6, f * 10.0, 0.18, 0.06, 0.001));
    for (let i = 0; i < b.length; i++)
      b[i] *= 1 + 0.06 * Math.sin(2 * Math.PI * 4.6 * (i / SR)) * Math.min(1, i / SR / 0.3);
    add(b, env(biquad(noise(0.03, rng(3)), "bp", 2500, 0.8), 0.0005, 0.012), 0, 0.12);
    return peak(fadeOut(b, 0.3), -4);
  },

  // A panel button: the switch's click (a short bright burst on a little
  // plastic resonance), a soft body knock, then the confirm beep.
  "lift/button": () => {
    const b = buf(0.32);
    add(b, env(biquad(noise(0.02, rng(7)), "bp", 3800, 3), 0.0003, 0.008), 0, 1);
    add(b, mode(0.06, 1850, 0.02, 0.25, 0.0004));
    add(b, mode(0.08, 210, 0.04, 0.35, 0.0008));
    const beep = buf(0.13);
    for (let i = 0; i < beep.length; i++) {
      const t = i / SR;
      const a = Math.min(1, t / 0.004) * Math.min(1, (0.13 - t) / 0.03);
      beep[i] = a * (Math.sin(2 * Math.PI * 1568 * t) + 0.15 * Math.sin(2 * Math.PI * 3136 * t));
    }
    add(b, beep, 0.07, 0.22);
    return peak(b, -4);
  },

  // The car travelling: the hoist motor's hum (50 Hz and its harmonics, a
  // slow beat between two windings), air pushed through the shaft (brown
  // noise, low), the faint whine of the drive. 4 s that loop without a seam.
  "lift/ride": () => {
    const L = 4;
    const x = 1; // crossfade
    const r = rng(11);
    const b = buf(L + x);
    let brown = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      brown = (brown + (r() * 2 - 1) * 0.02) * 0.997;
      const hum =
        0.5 * Math.sin(2 * Math.PI * 50 * t) +
        0.3 * Math.sin(2 * Math.PI * 100 * t + 0.4) * (1 + 0.25 * Math.sin(2 * Math.PI * 0.5 * t)) +
        0.12 * Math.sin(2 * Math.PI * 150.25 * t) +
        0.05 * Math.sin(2 * Math.PI * 300 * t);
      const whine = 0.02 * Math.sin(2 * Math.PI * 412 * t + 2 * Math.sin(2 * Math.PI * 0.25 * t));
      b[i] = hum * 0.5 + brown * 4.5 * (1 + 0.15 * Math.sin(2 * Math.PI * 0.75 * t)) + whine;
    }
    biquad(b, "lp", 900, 0.6);
    biquad(b, "hp", 35, 0.7);
    // fold the extra second back over the start: a seamless loop of L
    const out = buf(L);
    const n = Math.round(x * SR);
    for (let i = 0; i < out.length; i++) out[i] = b[i];
    for (let i = 0; i < n; i++) {
      const k = i / n;
      out[i] = b[i] * Math.sqrt(k) + b[out.length + i] * Math.sqrt(1 - k);
    }
    return peak(out, -6);
  },

  // stairs/door-open: the push bar slams the latch back (a metal clack with a
  // few ringing modes), the leaf starts to swing (a low creak, air)
  "stairs/door-open": () => {
    const r = rng(21);
    const b = buf(1.1);
    add(b, env(biquad(noise(0.06, r), "bp", 2200, 1.4), 0.0004, 0.04), 0, 0.9);
    for (const [hz, t60, a] of [
      [1180, 0.09, 0.3],
      [2930, 0.06, 0.2],
      [4310, 0.04, 0.12],
      [690, 0.12, 0.25],
    ])
      add(b, mode(0.3, hz, t60, a, 0.0005), 0.002);
    add(b, mode(0.25, 95, 0.12, 0.5, 0.002), 0.004);
    // the hinge: a slow, low creak (a buzz through a moving band-pass)
    const creak = buf(0.7);
    let ph = 0;
    for (let i = 0; i < creak.length; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (38 + 22 * Math.sin(2 * Math.PI * 0.9 * t))) / SR;
      creak[i] = ((ph % (2 * Math.PI)) / Math.PI - 1) * Math.sin(Math.PI * Math.min(1, t / 0.7));
    }
    biquad(creak, "bp", 620, 4);
    add(b, creak, 0.12, 0.35);
    add(b, env(biquad(noise(0.8, r), "lp", 500), 0.2, 0.6), 0.1, 0.08);
    return peak(fadeOut(room(b, 0.8, 1.1, 0.3, 0.22), 0.3), -3);
  },

  // stairs/door-close: the closer swings it to — a heavy thud (the leaf on the
  // frame), the latch snapping in a moment after, the frame rattling
  "stairs/door-close": () => {
    const r = rng(23);
    const b = buf(1.4);
    add(b, env(biquad(noise(0.3, r), "lp", 380, 0.7), 0.002, 0.18), 0, 1);
    add(b, mode(0.6, 62, 0.35, 0.9, 0.002));
    add(b, mode(0.5, 118, 0.22, 0.5, 0.002));
    add(b, mode(0.4, 233, 0.12, 0.2, 0.002));
    add(b, env(biquad(noise(0.05, r), "bp", 2600, 1.6), 0.0004, 0.03), 0.035, 0.45);
    for (const [hz, a] of [
      [1320, 0.15],
      [3050, 0.1],
    ])
      add(b, mode(0.2, hz, 0.06, a, 0.0004), 0.036);
    const rattle = env(biquad(noise(0.25, r), "bp", 1700, 2), 0.002, 0.12);
    for (let i = 0; i < rattle.length; i++) rattle[i] *= 0.5 + 0.5 * Math.sin(2 * Math.PI * 34 * (i / SR));
    add(b, rattle, 0.05, 0.12);
    return peak(fadeOut(room(b, 1.0, 1.15, 0.28, 0.3), 0.4), -2);
  },
};

// a shoe on a concrete tread: the heel's hard tap (bright, short, a low body
// knock), the sole rolling, the toe a beat later; the stairwell answers
for (let k = 1; k <= 4; k++)
  SOUNDS[`stairs/step-${k}`] = () => {
    const r = rng(100 + k * 17);
    const b = buf(0.5);
    const bright = 1500 + r() * 900;
    add(b, env(biquad(noise(0.05, r), "bp", bright, 1.1), 0.0006, 0.035), 0, 1);
    add(b, env(biquad(noise(0.05, r), "hp", 3500, 0.7), 0.0003, 0.012), 0, 0.35);
    add(b, mode(0.12, 110 + r() * 30, 0.035, 0.25, 0.001));
    add(b, env(biquad(noise(0.08, r), "bp", 900, 0.8), 0.01, 0.06), 0.02, 0.12); // the roll
    const toe = 0.07 + r() * 0.03;
    add(b, env(biquad(noise(0.04, r), "bp", bright * 1.25, 1.3), 0.0005, 0.02), toe, 0.35 + r() * 0.15);
    // (a tread is hard and small: no boom under it)
    return peak(fadeOut(biquad(room(b, 0.7, 1.2, 0.25, 0.28), "hp", 90, 0.7), 0.25), -3);
  };

// ── out ─────────────────────────────────────────────────────────────────────
function wav(b) {
  const data = Buffer.alloc(44 + b.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + b.length * 2, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(b.length * 2, 40);
  for (let i = 0; i < b.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b[i])) * 32767), 44 + i * 2);
  return data;
}

const LOOPS = new Set(["lift/ride"]);
const only = process.argv[2];
const tmp = join(tmpdir(), `yutopia-sfx-${process.pid}`);
mkdirSync(tmp, { recursive: true });
try {
  for (const [name, make] of Object.entries(SOUNDS)) {
    if (only && !name.includes(only)) continue;
    const b = make();
    const src = join(tmp, `${name.replace("/", "_")}.wav`);
    writeFileSync(src, wav(b));
    // (a loop stays WAV: an MP3's encoder padding would put a gap in it)
    const loop = LOOPS.has(name);
    const dst = join(OUT, `${name}.${loop ? "wav" : "mp3"}`);
    mkdirSync(dirname(dst), { recursive: true });
    const codec = loop ? ["-ar", "22050", "-c:a", "pcm_s16le"] : ["-c:a", "libmp3lame", "-b:a", "96k"];
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, ...codec, dst]);
    console.log(`[sfx] ${dst.slice(OUT.length)}  ${(b.length / SR).toFixed(2)} s`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
