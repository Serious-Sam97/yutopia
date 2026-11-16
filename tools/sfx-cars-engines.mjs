// The cars' engines (docs/plan/92-the-cars.md phase 11): each voice's candidate sets in tools/sfx-cars-engines.json
// (found by tools/sfx-cars-search.mjs) fetched — Freesound's HQ previews, 3 s apart — and cut into loops at the
// voice's revs, as the game plays them (world/car/sound.ts: each loop pitched by revs ÷ its own, the two either side
// crossfaded by log revs; on load and off; by mic). Needs ffmpeg on the PATH.
//   1. the firing rate followed through each recording (YIN on a 5.5 kHz copy, every 40 ms), read as revs from the
//      set's cylinders and strokes;
//   2. for each of the voice's revs, the best stretch: held steady (off load — or on, a dyno's hold), or rising hard
//      (on load, from a ramp: `auto`), loud and sure of its pitch;
//   3. the stretch's pitch made level (resampled along its own phase), so it loops with no wow; −20 dB RMS, mono
//      96 kb/s → public/sfx/cars/engines/<voice>-<c>-<load>-<mic>-<n>.mp3; the start clip <voice>-<c>-start.mp3;
//   4. public/sfx/cars/engines.json: each set's points (file, load, mic, revs measured, how steady, how clear).
//   node tools/sfx-cars-engines.mjs [cache dir]
//   ONLY=four,v8 node tools/sfx-cars-engines.mjs
//   PICK='{"four":0,…}' node tools/sfx-cars-engines.mjs   each voice down to the set picked (the json's `pick`, the user's)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SR = 44100;
const ROOT = new URL("../", import.meta.url).pathname;
const LIST = join(ROOT, "tools/sfx-cars-engines.json");
const OUT = join(ROOT, "apps/client/public/sfx/cars");
const DIR = join(OUT, "engines");
const cache = process.argv[2] ?? join(tmpdir(), "yutopia-sfx-weather");
mkdirSync(cache, { recursive: true });
mkdirSync(DIR, { recursive: true });
const all = JSON.parse(readFileSync(LIST, "utf8"));
delete all._;
const only = process.env.ONLY?.split(",");
const pick = process.env.PICK ? JSON.parse(process.env.PICK) : null;

// ── audio in and out ────────────────────────────────────────────────────────
function decode(file) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"], {
    maxBuffer: 1 << 30,
  });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}
function encode(d, file, kbps = 96) {
  const tmp = join(tmpdir(), `sfx-cars-${process.pid}.f32`);
  writeFileSync(tmp, Buffer.from(d.buffer, d.byteOffset, d.byteLength));
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "f32le",
    "-ar",
    String(SR),
    "-ac",
    "1",
    "-i",
    tmp,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    `${kbps}k`,
    file,
  ]);
  rmSync(tmp);
}
const rms = (d, a = 0, b = d.length) => {
  let s = 0;
  for (let i = a; i < b; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const peak = (d) => d.reduce((p, x) => Math.max(p, Math.abs(x)), 0);
const db = (x) => 10 ** (x / 20);
const toDb = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};
let lastFetch = 0;
function fetched(c) {
  const f = join(cache, `${c.id}.mp3`);
  if (existsSync(f) && statSync(f).size > 1000) return f;
  const wait = lastFetch + 3000 - Date.now();
  if (wait > 0) execFileSync("sleep", [String(wait / 1000)]);
  execFileSync("curl", ["-s", "-f", "-o", f, c.preview]);
  lastFetch = Date.now();
  return f;
}

// ── the firing rate, followed ───────────────────────────────────────────────
const DEC = 8; // → 5512.5 Hz
const FFT = 2048; // (0.37 s at that: 2.7 Hz a bin)
/** a Hann-windowed FFT's magnitudes, FFT points from `a` */
function spectrum(x, a) {
  const N = FFT;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[a + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < N; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const j = i + k + len / 2;
        const xr = re[j] * wr - im[j] * wi;
        const xi = re[j] * wi + im[j] * wr;
        re[j] = re[i + k] - xr;
        im[j] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
  }
  const m = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) m[k] = Math.hypot(re[k], im[k]);
  return m;
}
const HOP = 0.04;
/** [{t, f (Hz), conf (0..1), level}] every HOP s, the rate looked for between fmin and fmax */
function track(d, fmin, fmax) {
  const sr = SR / DEC;
  const n = Math.floor(d.length / DEC);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < DEC; k++) s += d[i * DEC + k];
    x[i] = s / DEC;
  }
  const tmin = Math.max(2, Math.floor(sr / fmax));
  const tmax = Math.ceil(sr / fmin);
  const W = Math.max(Math.round(0.09 * sr), tmax * 2);
  const hop = Math.round(HOP * sr);
  const out = [];
  const dd = new Float32Array(tmax + 2);
  for (let a = 0; a + W + tmax < n; a += hop) {
    // YIN's difference, its cumulative-mean normalised form
    let run = 0;
    dd[0] = 1;
    for (let tau = 1; tau <= tmax; tau++) {
      let s = 0;
      for (let i = a; i < a + W; i++) {
        const v = x[i] - x[i + tau];
        s += v * v;
      }
      run += s;
      dd[tau] = run > 0 ? (s * tau) / run : 1;
    }
    let best = -1;
    for (let tau = tmin; tau < tmax; tau++)
      if (dd[tau] < 0.22 && dd[tau] <= dd[tau - 1] && dd[tau] <= dd[tau + 1]) {
        best = tau;
        break;
      }
    if (best < 0) {
      best = tmin;
      for (let tau = tmin; tau <= tmax; tau++) if (dd[tau] < dd[best]) best = tau;
    }
    const y0 = dd[best - 1] ?? dd[best];
    const y2 = dd[best + 1] ?? dd[best];
    const den = y0 - 2 * dd[best] + y2;
    const p = den !== 0 ? best + (0.5 * (y0 - y2)) / den : best;
    // (YIN finds the engine's whole cycle — two turns — as often as its firing: of the cycle's multiples in range,
    // the one the spectrum is loudest at, with its next two harmonics, is the firing rate)
    const f1 = sr / p;
    const mag = spectrum(x, Math.max(0, Math.round(a + W / 2 - FFT / 2)));
    const at = (fr) => {
      const b = (fr * FFT) / sr;
      let m = 0;
      for (let k = Math.floor(b * 0.97); k <= Math.ceil(b * 1.03); k++) m = Math.max(m, mag[k] ?? 0);
      return m;
    };
    const cand = [];
    for (const k of [0.5, 1, 2, 3, 4, 6, 8]) {
      const c = f1 * k;
      if (c < fmin * 0.9 || c > fmax * 1.1) continue;
      cand.push({ f: c, m: at(c) + 0.6 * at(2 * c) + 0.4 * at(3 * c) });
    }
    if (!cand.length) cand.push({ f: f1, m: 1 });
    const top = Math.max(...cand.map((c) => c.m));
    for (const c of cand) c.s = c.m / Math.max(top, 1e-12);
    const f = cand.reduce((p, c) => (c.m > p.m ? c : p)).f;
    // how sure: the firing line over the spectrum round it (an engine outdoors is noisy: YIN's own measure
    // is low there though the line is plain), or YIN's, whichever's higher
    const band = [];
    for (let k = Math.floor((fmin * FFT) / sr); k <= Math.ceil((fmax * 3 * FFT) / sr) && k < mag.length; k++)
      band.push(mag[k]);
    band.sort((p, q) => p - q);
    const over = toDb(at(f) / Math.max(band[band.length >> 1] ?? 1e-9, 1e-9));
    const conf = Math.max(1 - dd[best], Math.min(1, Math.max(0, (over - 6) / 18)));
    out.push({ t: (a + W / 2) / sr, f, conf, level: rms(x, a, a + W), cand });
  }
  // the path through each read's multiples that's loudest and jumps least (an engine's revs don't double in 40 ms):
  // a Viterbi pass, a jump costing by its size in octaves
  const cost = [];
  const from = [];
  out.forEach((o, i) => {
    cost.push(o.cand.map(() => 0));
    from.push(o.cand.map(() => 0));
    o.cand.forEach((c, j) => {
      let best = 0;
      let bc = 1e9;
      if (i > 0)
        out[i - 1].cand.forEach((p, q) => {
          const jump = Math.abs(Math.log2(c.f / p.f));
          const v = cost[i - 1][q] + 3 * Math.max(0, jump - 0.04);
          if (v < bc) {
            bc = v;
            best = q;
          }
        });
      cost[i][j] = (i > 0 ? bc : 0) + (1 - c.s);
      from[i][j] = best;
    });
  });
  if (out.length) {
    let j = cost[out.length - 1].indexOf(Math.min(...cost[out.length - 1]));
    for (let i = out.length - 1; i >= 0; i--) {
      out[i].f = out[i].cand[j].f;
      j = from[i][j];
    }
  }
  // a median of five against single wrong reads
  return out.map((o, i) => ({
    ...o,
    cand: undefined,
    f: median(out.slice(Math.max(0, i - 2), i + 3).map((q) => q.f)),
  }));
}

/** the stretch [i, i + w) of `tr` as a loop at its own median rate, the pitch levelled along its phase */
function levelled(d, tr, i, w) {
  const a = Math.round(tr[i].t * SR - (HOP * SR) / 2);
  const b = Math.round(tr[i + w - 1].t * SR + (HOP * SR) / 2);
  const f0 = median(tr.slice(i, i + w).map((q) => q.f));
  const len = b - a;
  // the phase (in cycles) at each input sample, from the rate between the reads
  const ph = new Float64Array(len + 1);
  for (let s = 0; s < len; s++) {
    const t = (a + s) / SR;
    const k = Math.min(w - 2, Math.max(0, Math.floor((t - tr[i].t) / HOP)));
    const u = Math.min(1, Math.max(0, (t - tr[i + k].t) / HOP));
    const f = tr[i + k].f * (1 - u) + tr[i + k + 1].f * u;
    ph[s + 1] = ph[s] + f / SR;
  }
  const outN = Math.floor((ph[len] * SR) / f0);
  const out = new Float32Array(outN);
  let s = 0;
  for (let k = 0; k < outN; k++) {
    const want = (k * f0) / SR;
    while (s < len - 1 && ph[s + 1] < want) s++;
    const u = (want - ph[s]) / Math.max(1e-12, ph[s + 1] - ph[s]);
    const i0 = a + s;
    out[k] = (d[i0] ?? 0) * (1 - u) + (d[i0 + 1] ?? 0) * u;
  }
  return { out, f0 };
}

// ── a set into its points ───────────────────────────────────────────────────
const rateOf = (rpm, set) => (rpm / 60) * set.cyl * (2 / set.strokes);
const rpmOf = (f, set) => (f * 60 * set.strokes) / (2 * set.cyl);
const letters = "abcdefgh";
for (const f of readdirSync(DIR)) if (!only || only.some((v) => f.startsWith(`${v}-`))) rmSync(join(DIR, f));
const manFile = join(OUT, "engines.json");
const man = existsSync(manFile) ? JSON.parse(readFileSync(manFile, "utf8")) : {};
for (const [voice, v] of Object.entries(all)) {
  if (only && !only.includes(voice)) continue;
  const at = pick && voice in pick ? pick[voice] : v.pick;
  const sets = at === undefined ? v.sets : [v.sets[at]];
  const lo = v.rpm[0] * 0.6;
  const hi = v.rpm[v.rpm.length - 1] * 1.3;
  const list = [];
  sets.forEach((set, si) => {
    const tag = sets.length > 1 ? letters[si] : "a";
    // every recording's track, and its stretches for each rev and load
    const cands = []; // {rpm target index, load, mic, score, cut()}
    for (const rec of set.rec) {
      const d = decode(fetched(rec));
      const tr = track(d, rateOf(lo, set), rateOf(hi, set));
      if (tr.length < 10) continue;
      const lv = tr.map((q) => q.level).sort((x, y) => x - y);
      const floor = Math.max(lv[Math.floor(lv.length * 0.1)], 1e-6);
      const loud = lv[Math.floor(lv.length * 0.85)];
      v.rpm.forEach((target, ti) => {
        for (const load of rec.load === "auto" ? ["on", "off"] : [rec.load]) {
          // (a pull rising: half a second will do; a hold: a second)
          const w = Math.round((load === "on" && rec.load === "auto" ? 0.6 : 1.1) / HOP);
          let best = null;
          for (let i = 0; i + w < tr.length; i += 2) {
            const seg = tr.slice(i, i + w);
            const conf = seg.reduce((s, q) => s + q.conf, 0) / w;
            if (conf < 0.55) continue;
            const r = seg.map((q) => rpmOf(q.f, set));
            const m = median(r);
            const off = Math.abs(Math.log(m / target));
            if (off > 0.16) continue;
            const level = seg.reduce((s, q) => s + q.level, 0) / w;
            // (over its quiet — a held loop has none: then a quarter of its loud is enough)
            if (level < Math.min(floor * 2.5, loud * 0.25)) continue;
            const spread = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / w) / m;
            const slope = (r[w - 1] - r[0]) / m / (w * HOP); // (a share of its revs a second)
            let score;
            if (load === "on" && rec.load === "auto") {
              if (slope < 0.12) continue; // rising hard: pulling
              score = conf * 2 + Math.min(1, level / loud) - off * 3;
            } else {
              if (rec.load === "auto" && Math.abs(slope) > 0.15) continue; // held
              score = conf * 2 - spread * 12 - off * 3 + Math.min(1, level / loud) * 0.5;
            }
            if (!best || score > best.score) best = { i, score, conf, spread, level, m };
          }
          if (best)
            cands.push({
              ti,
              load,
              mic: rec.mic,
              rec,
              score: best.score,
              conf: best.conf,
              spread: best.spread,
              snr: toDb(best.level / floor),
              cut: () => levelled(d, tr, best.i, w),
            });
        }
      });
    }
    // the best per rev, load and mic
    const keep = new Map();
    for (const c of cands) {
      const k = `${c.ti}:${c.load}:${c.mic}`;
      if (!keep.has(k) || keep.get(k).score < c.score) keep.set(k, c);
    }
    const points = [];
    for (const c of [...keep.values()].sort((x, y) => x.ti - y.ti)) {
      const { out, f0 } = c.cut();
      if (out.length < 0.5 * SR) continue;
      const k = db(-20) / Math.max(rms(out), 1e-6);
      for (let i = 0; i < out.length; i++) out[i] *= k;
      const pk = peak(out);
      if (pk > 0.98) for (let i = 0; i < out.length; i++) out[i] *= 0.98 / pk;
      const file = `${voice}-${tag}-${c.load}-${c.mic}-${c.ti + 1}.mp3`;
      encode(out, join(DIR, file));
      points.push({
        file,
        load: c.load,
        mic: c.mic,
        rpm: Math.round(rpmOf(f0, set)),
        target: v.rpm[c.ti],
        steady: Math.round((1 - c.spread) * 1000) / 1000,
        sure: Math.round(c.conf * 100) / 100,
        snr: Math.round(c.snr),
        from: c.rec.id,
        len: Math.round((out.length / SR) * 100) / 100,
      });
    }
    let start = null;
    if (set.start) {
      const d = decode(fetched(set.start));
      // (from where it's first heard to 5 s on, its peak at −3 dB, a quick fade out)
      let a = 0;
      const thr = peak(d) * 0.05;
      while (a < d.length && Math.abs(d[a]) < thr) a++;
      a = Math.max(0, a - Math.round(0.05 * SR));
      const clip = d.slice(a, Math.min(d.length, a + 5 * SR));
      const g = db(-3) / Math.max(peak(clip), 1e-6);
      const fo = Math.round(0.3 * SR);
      for (let i = 0; i < clip.length; i++) clip[i] *= g * Math.min(1, (clip.length - i) / fo);
      start = `${voice}-${tag}-start.mp3`;
      encode(clip, join(DIR, start));
    }
    const loads = new Set(points.map((p) => p.load));
    const mics = [...new Set(points.map((p) => p.mic))];
    console.log(
      `${voice} ${tag} ${set.name}: ${points.length} points (${[...loads].join("/")}; ${mics.join(", ")}) — revs ${points.map((p) => p.rpm).join(" ")}`,
    );
    list.push({
      name: set.name,
      note: set.note,
      cyl: set.cyl,
      strokes: set.strokes,
      credit: [
        ...new Map(
          [...set.rec, ...(set.start ? [set.start] : [])].map((r) => [
            r.id,
            { id: r.id, user: r.user, title: r.title, url: r.url },
          ]),
        ).values(),
      ],
      points,
      start,
    });
  });
  man[voice] = { rpm: v.rpm, for: v.for, sets: list, ...(v.mine !== undefined ? { mine: v.mine, why: v.why } : {}) };
}
writeFileSync(manFile, `${JSON.stringify(man, null, 2)}\n`);
