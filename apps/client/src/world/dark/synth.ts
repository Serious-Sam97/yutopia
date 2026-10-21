// The dark's sounds (docs/plan/30-the-dark.md D9), made here as they were for
// the audition: a typed port of design/screens/dark/sounds/synth.mjs (the
// approved shortlist), rendered into buffers in the browser — nothing ships as
// a file. Each sound is a mono Float32Array, or [left, right], at SR.
// (Keep the two in step: a sound changed there is changed here.)

/** The rate they're made at: the highest in them (crackles to 7 kHz) is under its half. */
export const SR = 22050;
type Hz = number | ((t: number) => number);
export type Sound = Float32Array | Float32Array[];

// ── building blocks (sfx-synth.mjs's, plus oscillators, loops, stereo) ────────
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(30);
const buf = (sec: number) => new Float32Array(Math.ceil(sec * SR));
const add = (into: Float32Array, from: Float32Array, at = 0, gain = 1) => {
  const o = Math.round(at * SR);
  for (let i = 0; i < from.length && o + i < into.length; i++) if (o + i >= 0) into[o + i] += from[i] * gain;
  return into;
};
const mul = (b: Float32Array, f: (t: number) => number) => {
  for (let i = 0; i < b.length; i++) b[i] *= f(i / SR);
  return b;
};
// a decaying sine (one mode of something struck)
function mode(sec: number, hz: number, t60: number, amp = 1, attack = 0.001) {
  const b = buf(sec);
  const k = Math.log(1000) / t60;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    b[i] = amp * Math.min(1, t / attack) * Math.exp(-k * t) * Math.sin(2 * Math.PI * hz * t);
  }
  return b;
}
// an oscillator whose frequency is a function of time: sine, saw (band-limited enough at these pitches), tri
function osc(sec: number, hz: Hz, shape: "sine" | "saw" | "tri" = "sine", amp = 1) {
  const b = buf(sec);
  let ph = r();
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    ph += (typeof hz === "function" ? hz(t) : hz) / SR;
    const p = ph - Math.floor(ph);
    b[i] =
      amp * (shape === "sine" ? Math.sin(2 * Math.PI * p) : shape === "saw" ? 2 * p - 1 : 1 - 4 * Math.abs(p - 0.5));
  }
  return b;
}
function noise(sec: number, rr: () => number = r) {
  const b = buf(sec);
  for (let i = 0; i < b.length; i++) b[i] = rr() * 2 - 1;
  return b;
}
// RBJ biquad, in place; `hz` may follow time (a sweep)
function biquad(b: Float32Array, type: "lp" | "hp" | "bp", hz: Hz, q = Math.SQRT1_2) {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let c: number[] = [];
  const coef = (f: number): number[] => {
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    let n: number[];
    if (type === "lp") n = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2];
    else if (type === "hp") n = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2];
    else n = [al, 0, -al];
    return [...n, 1 + al, -2 * cs, 1 - al];
  };
  const sweep = typeof hz === "function";
  if (!sweep) c = coef(hz as number);
  for (let i = 0; i < b.length; i++) {
    if (sweep && i % 32 === 0) c = coef((hz as (t: number) => number)(i / SR));
    const [b0, b1, b2, a0, a1, a2] = c;
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
function env(b: Float32Array, attack: number, t60: number, delay = 0) {
  const k = Math.log(1000) / t60;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR - delay;
    b[i] *= t < 0 ? 0 : Math.min(1, t / attack) * Math.exp(-k * t);
  }
  return b;
}
// Schroeder: four combs, two all-passes. Outdoors in the woods: `size` large, damped
function room(b: Float32Array, sec: number, size = 1, damp = 0.35, wet = 0.25) {
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
// a shot outdoors: the treeline answers (a few dull slaps back), then the woods' long tail
function outdoors(b: Float32Array, tail = 2.2) {
  const out = buf(b.length / SR + tail);
  out.set(b);
  for (const [at, g] of [
    [0.13, 0.32],
    [0.27, 0.22],
    [0.46, 0.16],
    [0.71, 0.1],
    [1.05, 0.06],
  ])
    add(out, biquad(b.slice(), "lp", 1400 - at * 700), at, g);
  return room(out, 0.3, 3.2, 0.55, 0.22);
}
function fadeOut(b: Float32Array, sec: number) {
  const n = Math.round(sec * SR);
  for (let i = 0; i < n && i < b.length; i++) b[b.length - 1 - i] *= i / n;
  return b;
}
function fadeIn(b: Float32Array, sec: number) {
  const n = Math.round(sec * SR);
  for (let i = 0; i < n && i < b.length; i++) b[i] *= i / n;
  return b;
}
function peak(b: Float32Array, db = -3) {
  let m = 0;
  for (const v of b) m = Math.max(m, Math.abs(v));
  const g = 10 ** (db / 20) / (m || 1);
  for (let i = 0; i < b.length; i++) b[i] *= g;
  return b;
}
/** A seamless loop of `sec`: rendered `xf` longer, the overhang crossfaded into the head (equal power for
 *  noise; `lin` for tones, which add up in phase). */
function loop(b: Float32Array, sec: number, xf: number, lin = false) {
  const n = Math.round(sec * SR);
  const m = Math.round(xf * SR);
  const out = b.slice(0, n);
  for (let i = 0; i < m; i++) {
    const k = i / m;
    out[i] = lin
      ? out[i] * k + b[n + i] * (1 - k)
      : out[i] * Math.sin((k * Math.PI) / 2) + b[n + i] * Math.cos((k * Math.PI) / 2);
  }
  return out;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

// ── the sounds ──────────────────────────────────────────────────────────────
// Each returns a mono Float32Array, or [left, right].
export const SOUNDS: Record<string, () => Sound> = {
  // The tension drone, calm (danger ~0.2): two low sines a fifth apart, beating
  // slowly (0.083 Hz: once a loop), the wind through the spruce as band-passed
  // noise breathing on a 6 s swell. 12 s loop.
  "drone-calm": () => {
    const L = 13;
    const b = buf(L);
    add(b, osc(L, 41.25), 0, 0.5);
    add(b, osc(L, 41.25 + 1 / 12), 0, 0.35);
    add(b, osc(L, 743 / 12), 0, 0.22);
    const w = biquad(noise(L), "bp", (t) => 380 + 120 * Math.sin((2 * Math.PI * t) / 6), 1.6);
    add(
      b,
      mul(w, (t) => 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 6 - 1)),
      0,
      0.5,
    );
    return peak(loop(b, 12, 1, true), -9);
  },
  // Hunted (danger ~0.9, one near): the same ground, a minor second leaning on
  // it (F over E), a filtered saw cluster pulsing like breath at 0.5 Hz, a
  // glassy high E/F beating far above (the office's cold fluorescent edge),
  // and the wind thinner and higher. 12 s loop; the game crossfades calm → hunted by danger.
  "drone-hunted": () => {
    const L = 13;
    const b = buf(L);
    add(b, osc(L, 41.25), 0, 0.5);
    add(b, osc(L, 43.75), 0, 0.32);
    const saws = buf(L);
    for (const f of [82.5, 87.5, 123.75, 131.25]) add(saws, osc(L, f + (r() - 0.5) * 0.2, "saw"), 0, 0.18);
    biquad(saws, "lp", (t) => 240 + 160 * (0.5 + 0.5 * Math.sin(Math.PI * t)), 2);
    add(
      b,
      mul(saws, (t) => 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(Math.PI * t - 1.5)) ** 2),
      0,
      0.9,
    );
    add(b, osc(L, 1318.5), 0, 0.025);
    add(b, osc(L, 1396.9 - 1 / 12), 0, 0.02);
    const w = biquad(noise(L), "bp", (t) => 900 + 300 * Math.sin((2 * Math.PI * t) / 4), 3);
    add(
      b,
      mul(w, (t) => 0.4 + 0.6 * Math.sin((2 * Math.PI * t) / 4) ** 2),
      0,
      0.35,
    );
    return peak(loop(b, 12, 1, true), -7);
  },
  // Whispers: formant noise — the vowels' resonances (a, e, o, u) over noise,
  // in syllables 4–7 a second with breaths between and an "s" now and then;
  // five voices placed round you, the far ones duller. Stereo, 7 s.
  whispers: () => {
    const L = 7;
    const left = buf(L + 1.5);
    const right = buf(L + 1.5);
    const VOW = [
      [730, 1090, 2440],
      [530, 1840, 2480],
      [570, 840, 2410],
      [300, 870, 2240],
      [390, 1990, 2550],
    ];
    for (let v = 0; v < 5; v++) {
      const vb = buf(L);
      const pan = r() * 2 - 1;
      const far = r();
      let t = r() * 0.8;
      while (t < L - 0.4) {
        const syl = 0.09 + r() * 0.12;
        const [f1, f2, f3] = VOW[Math.floor(r() * VOW.length)];
        const n = noise(syl + 0.05);
        const s = buf(syl + 0.05);
        add(s, biquad(n.slice(), "bp", f1 * (0.9 + r() * 0.2), 6), 0, 1);
        add(s, biquad(n.slice(), "bp", f2 * (0.9 + r() * 0.2), 8), 0, 0.7);
        add(s, biquad(n.slice(), "bp", f3, 9), 0, 0.35);
        mul(s, (u) => Math.sin(Math.PI * Math.min(1, u / syl)) ** 1.5);
        add(vb, s, t, 1);
        if (r() < 0.18) add(vb, env(biquad(noise(0.16), "hp", 5200), 0.03, 0.12), t + syl, 0.25);
        t += syl + (r() < 0.2 ? 0.35 + r() * 0.5 : 0.02 + r() * 0.08);
      }
      biquad(vb, "lp", 6000 - far * 3800);
      const g = 0.4 + 0.6 * (1 - far);
      add(left, vb, 0, g * Math.cos(((pan + 1) * Math.PI) / 4));
      add(right, vb, 0, g * Math.sin(((pan + 1) * Math.PI) / 4));
    }
    const L2 = room(left, 0.1, 1.8, 0.45, 0.5);
    const R2 = room(right, 0.1, 1.9, 0.45, 0.5);
    let m = 0;
    for (const x of L2) m = Math.max(m, Math.abs(x));
    for (const x of R2) m = Math.max(m, Math.abs(x));
    const k = 10 ** (-8 / 20) / m;
    return [
      fadeOut(
        L2.map((x) => x * k),
        0.6,
      ),
      fadeOut(
        R2.map((x) => x * k),
        0.6,
      ),
    ];
  },
  // The sting when one comes out of the dark (the 1.2 s emerge): a reversed
  // swell — noise and a dissonant cluster rising — cut by a low blow falling
  // from 70 to 34 Hz, the woods ringing after.
  "emerge-sting": () => {
    const b = buf(3.6);
    const sw = 1.2;
    const rise = buf(sw);
    for (const f of [146.8, 155.6, 207.7, 220]) add(rise, osc(sw, f, "saw"), 0, 0.15);
    add(
      rise,
      biquad(noise(sw), "bp", (t) => 600 + 2400 * (t / sw), 1.2),
      0,
      0.8,
    );
    biquad(rise, "lp", (t) => 400 + 4000 * (t / sw) ** 2);
    mul(rise, (t) => (t / sw) ** 3);
    add(b, rise);
    const hit = buf(2.4);
    add(
      hit,
      osc(2.4, (t) => 34 + 36 * Math.exp(-t * 9), "sine"),
      0,
      1,
    );
    env(hit, 0.004, 1.5);
    add(hit, env(biquad(noise(0.3), "lp", 500), 0.002, 0.25), 0, 0.6);
    add(b, hit, sw, 1);
    return peak(fadeOut(room(b, 1.2, 2.6, 0.5, 0.3), 0.8), -2);
  },
  // Focus on: the torch narrowing — the switch's click, a whine rising as the
  // beam tightens (2.2 → 3.4 kHz) over the hum settling in.
  "focus-on": () => {
    const b = buf(0.8);
    add(b, env(biquad(noise(0.02), "bp", 3800, 2), 0.0005, 0.012), 0, 0.6);
    const wh = osc(0.8, (t) => 2200 + 1200 * smooth(Math.min(1, t / 0.35)));
    mul(wh, (t) => Math.min(1, t / 0.05) * (0.6 + 0.4 * Math.exp(-t * 4)));
    add(b, wh, 0.01, 0.12);
    const hum = buf(0.8);
    for (const [h, a] of [
      [1, 1],
      [2, 0.5],
      [3, 0.3],
      [5, 0.12],
    ])
      add(hum, osc(0.8, 120 * h), 0, a);
    add(b, fadeIn(hum, 0.3), 0, 0.12);
    return peak(fadeOut(b, 0.1), -6);
  },
  // Holding the focus: the hum (120 Hz and harmonics, a slight flutter) and the
  // whine on top, as an electric lamp on its limit. 2 s loop.
  "focus-hum": () => {
    const L = 2.5;
    const b = buf(L);
    for (const [h, a] of [
      [1, 1],
      [2, 0.5],
      [3, 0.3],
      [5, 0.12],
      [7, 0.06],
    ])
      add(
        b,
        osc(L, (t) => 120 * h * (1 + 0.002 * Math.sin(2 * Math.PI * 7 * t))),
        0,
        a * 0.12,
      );
    add(
      b,
      osc(L, (t) => 3400 + 30 * Math.sin(2 * Math.PI * 3 * t)),
      0,
      0.05,
    );
    add(b, biquad(noise(L), "bp", 3400, 4), 0, 0.05);
    return peak(loop(b, 2, 0.5, true), -8);
  },
  // The shield burning under the beam: a hiss (high noise), frying crackles
  // (60 a second, 2–7 kHz), and a thin singing tone, wavering. 3 s loop.
  "burn-sizzle": () => {
    const L = 3.5;
    const b = buf(L);
    add(
      b,
      mul(biquad(noise(L), "hp", 3000), (t) => 0.55 + 0.45 * Math.sin(2 * Math.PI * 1.3 * t) ** 2),
      0,
      0.25,
    );
    add(b, biquad(noise(L), "bp", 1500, 0.8), 0, 0.12);
    for (let t = 0; t < L; t += -Math.log(r()) / 60) {
      const c = env(biquad(noise(0.02), "bp", 2000 + r() * 5000, 3), 0.0003, 0.003 + r() * 0.008);
      add(b, c, t, 0.3 + r() * 0.7);
    }
    add(
      b,
      osc(L, (t) => 1820 + 40 * Math.sin(2 * Math.PI * 5.3 * t) + 25 * Math.sin(2 * Math.PI * 0.7 * t)),
      0,
      0.035,
    );
    return peak(loop(b, 3, 0.5), -6);
  },
  // The shield breaking (exposed: shoot now): a bright glassy burst of
  // inharmonic modes, the dark rushing out (a band sweeping down), a thump.
  "shield-break": () => {
    const b = buf(2.2);
    for (let i = 0; i < 14; i++) add(b, mode(2.2, 1800 + r() * 5600, 0.15 + r() * 0.35, 0.3 + r() * 0.4), r() * 0.02);
    add(
      b,
      env(
        biquad(noise(1.2), "bp", (t) => 4000 * Math.exp(-t * 3) + 500, 1.4),
        0.01,
        0.9,
      ),
      0,
      1.2,
    );
    add(
      b,
      env(
        osc(0.6, (t) => 45 + 40 * Math.exp(-t * 14)),
        0.003,
        0.35,
      ),
      0,
      1.4,
    );
    return peak(fadeOut(outdoors(b, 1.2), 0.5), -2);
  },
  // Dissolve (one is gone, in a burst of light): a shimmer rising (A5 E6 A6
  // C#7), then an airy bloom and a bright chord dying away.
  dissolve: () => {
    const b = buf(3.2);
    for (const [i, f] of [880, 1318.5, 1760, 2217.5].entries()) add(b, env(osc(1.6, f), 0.08, 1.4), i * 0.06, 0.18);
    const air = biquad(noise(1.4), "bp", (t) => 900 + 2500 * Math.exp(-t * 2), 0.9);
    add(b, env(air, 0.12, 1.1), 0.18, 0.8);
    for (const f of [440, 554.4, 659.3, 880]) add(b, env(osc(2.6, f, "tri"), 0.3, 2.2), 0.25, 0.08);
    return peak(fadeOut(room(b, 1, 2.2, 0.4, 0.35), 0.6), -4);
  },
  // The heartbeat under 30 health: lub-dub, low thumps (a falling sine, a dull
  // knock) — slow (70 a minute) and racing (120). Loops of 8 beats.
  "heartbeat-70": () => heart(70),
  "heartbeat-120": () => heart(120),
  // The revolver (.38): the crack — a 1 ms click, a band of noise —, the body
  // falling 95 → 42 Hz, then the treeline slapping it back and the woods' tail.
  "revolver-shot": () => {
    const b = buf(0.6);
    add(b, env(biquad(noise(0.01), "hp", 2500), 0.0001, 0.006), 0, 1);
    add(b, env(biquad(noise(0.15), "bp", 1600, 0.9), 0.0004, 0.06), 0, 0.9);
    add(
      b,
      env(
        osc(0.5, (t) => 42 + 53 * Math.exp(-t * 20)),
        0.001,
        0.22,
      ),
      0,
      1.0,
    );
    add(b, env(biquad(noise(0.5), "lp", 700), 0.001, 0.25), 0, 0.6);
    return peak(fadeOut(outdoors(b, 2.4), 0.6), -1);
  },
  // Reloading one round (0.35 s each, plan D3): the cartridge's brass tick into
  // the chamber, the cylinder's ratchet turning one notch.
  "revolver-load": () => {
    const b = buf(0.4);
    add(b, mode(0.4, 3150, 0.05, 0.6), 0.02);
    add(b, mode(0.4, 4720, 0.035, 0.4), 0.02);
    add(b, env(biquad(noise(0.03), "bp", 2600, 2), 0.0005, 0.02), 0.02, 0.5);
    for (const [t, a] of [
      [0.2, 0.7],
      [0.24, 0.45],
    ]) {
      add(b, mode(0.1, 5200, 0.012, a), t);
      add(b, env(biquad(noise(0.02), "bp", 3800, 3), 0.0003, 0.008), t, a * 0.6);
    }
    return peak(room(b, 0.1, 0.6, 0.3, 0.12), -4);
  },
  // Empty: the hammer falling on nothing.
  "revolver-dry": () => {
    const b = buf(0.25);
    add(b, mode(0.25, 2400, 0.03, 0.8), 0);
    add(b, mode(0.25, 3900, 0.02, 0.4), 0);
    add(b, env(biquad(noise(0.02), "bp", 3000, 2), 0.0003, 0.01), 0, 0.6);
    return peak(b, -6);
  },
  // The shotgun: wider and lower — the crack at 900 Hz, the body 75 → 32 Hz,
  // more of it, the echoes longer.
  "shotgun-shot": () => {
    const b = buf(0.9);
    add(b, env(biquad(noise(0.01), "hp", 1800), 0.0001, 0.008), 0, 1);
    add(b, env(biquad(noise(0.3), "bp", 900, 0.7), 0.0005, 0.12), 0, 1.0);
    add(
      b,
      env(
        osc(0.8, (t) => 32 + 43 * Math.exp(-t * 14)),
        0.001,
        0.4,
      ),
      0,
      1.3,
    );
    add(b, env(biquad(noise(0.8), "lp", 450), 0.001, 0.5), 0, 0.8);
    return peak(fadeOut(outdoors(b, 3), 0.8), -1);
  },
  // Racking it: the slide back (a scrape, a clack), forward (the clack home).
  "shotgun-pump": () => {
    const b = buf(0.7);
    const clack = (t: number, a: number) => {
      for (const f of [1150, 2630, 3920]) add(b, mode(0.2, f * (0.97 + r() * 0.06), 0.06, a / 3), t);
      add(b, env(biquad(noise(0.04), "bp", 2200, 1.5), 0.0004, 0.025), t, a * 0.7);
    };
    add(
      b,
      mul(biquad(noise(0.12), "bp", 1800, 1.2), (t) => Math.sin((Math.PI * t) / 0.12)),
      0.02,
      0.18,
    );
    clack(0.14, 1);
    add(
      b,
      mul(biquad(noise(0.1), "bp", 2100, 1.2), (t) => Math.sin((Math.PI * t) / 0.1)),
      0.3,
      0.15,
    );
    clack(0.4, 0.9);
    return peak(room(b, 0.2, 0.7, 0.3, 0.12), -3);
  },
  // A flare lit: the cap's scratch, the ignition's whoosh opening up.
  "flare-strike": () => {
    const b = buf(1.2);
    const sc = biquad(noise(0.16), "bp", 3200, 1.5);
    mul(sc, (t) => (0.5 + 0.5 * Math.sin(2 * Math.PI * 38 * t) ** 2) * Math.sin((Math.PI * t) / 0.16));
    add(b, sc, 0, 0.6);
    const wh = biquad(noise(1.0), "bp", (t) => 350 + 1800 * smooth(Math.min(1, t / 0.25)), 0.9);
    add(b, env(wh, 0.04, 0.9), 0.14, 1);
    add(
      b,
      env(
        osc(0.5, (t) => 60 + 30 * Math.exp(-t * 8)),
        0.02,
        0.3,
      ),
      0.14,
      0.4,
    );
    return peak(fadeOut(b, 0.3), -3);
  },
  // Burning (its 12 s): a sputtering hiss — fast, uneven — with pops, over a
  // low roar. 3 s loop.
  "flare-burn": () => {
    const L = 3.5;
    const b = buf(L);
    const sp = rng(77);
    let amp = 0.7;
    const hiss = biquad(noise(L), "hp", 1200);
    for (let i = 0; i < hiss.length; i++) {
      if (i % 220 === 0) amp += (0.75 + (sp() - 0.5) * 0.6 - amp) * 0.5;
      hiss[i] *= amp;
    }
    add(b, hiss, 0, 0.35);
    add(b, biquad(noise(L), "lp", 280), 0, 0.5);
    for (let t = 0; t < L; t += -Math.log(r()) / 9)
      add(b, env(biquad(noise(0.03), "bp", 1500 + r() * 3000, 2), 0.0004, 0.02), t, 0.5 + r() * 0.5);
    return peak(loop(b, 3, 0.5), -6);
  },
  // A shadowed's strike landing on you (25 health): the swing's whoosh, the
  // blow (a body thud), and a breath knocked out.
  strike: () => {
    const b = buf(1.0);
    add(
      b,
      mul(
        biquad(noise(0.3), "bp", (t) => 500 + 1500 * (t / 0.3), 1.2),
        (t) => Math.sin((Math.PI * t) / 0.3) ** 2,
      ),
      0,
      0.5,
    );
    add(
      b,
      env(
        osc(0.4, (t) => 48 + 52 * Math.exp(-t * 25)),
        0.001,
        0.18,
      ),
      0.27,
      1.2,
    );
    add(b, env(biquad(noise(0.2), "lp", 900), 0.001, 0.12), 0.27, 0.6);
    const breath = biquad(noise(0.35), "bp", 1100, 2.5);
    add(
      b,
      mul(breath, (t) => Math.sin((Math.PI * t) / 0.35) ** 2),
      0.33,
      0.25,
    );
    return peak(fadeOut(b, 0.2), -2);
  },
};

function heart(bpm: number) {
  const beat = 60 / bpm;
  const L = beat * 8;
  const b = buf(L + 0.5);
  const thump = (at: number, f0: number, a: number) => {
    add(
      b,
      env(
        osc(0.3, (t) => f0 * (0.7 + 0.3 * Math.exp(-t * 30))),
        0.004,
        0.16,
      ),
      at,
      a,
    );
    add(b, env(biquad(noise(0.08), "lp", 180), 0.002, 0.05), at, a * 0.5);
  };
  for (let i = 0; i < 9; i++) {
    thump(i * beat, 62, 1);
    thump(i * beat + Math.min(0.3, beat * 0.32), 74, 0.62);
  }
  biquad(b, "lp", 220);
  return peak(loop(b, L, 0.05), -3);
}
