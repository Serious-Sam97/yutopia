// The weather's sound (docs/plan/65-the-weather.md, phase 9): the CC0 candidates in
// tools/sfx-weather.json fetched (Freesound's HQ previews, 3 s apart: it refuses a machine that
// asks fast — plan 63), then made ready for the game (needs ffmpeg on the PATH):
//   steps  cut into single steps by their onsets: the six most alike, a 3 ms fade in and 30 ms
//          out, about −22 dB over their first 150 ms, mono 80 kb/s → public/sfx/steps/<slot>-<c><n>.mp3
//   loop   a bed: its steadiest 30 s (the windows' loudness the least uneven: no thunder in the
//          rain, no car going by), −24 dB RMS, stereo 96 kb/s → public/sfx/weather/<slot>-<c>.mp3
//          (the game crossfades its seam as it decodes it: weather-sound.ts loopable)
//   shot   thunder: its loudest peals, each from just before it starts to where it's died away
//          (≤ 9 s near, ≤ 14 s far), peaking at −3 dB, stereo 96 kb/s → <slot>-<c><n>.mp3;
//          any other: its events (a splash, a stroke, a gasp: up to six, the most alike) each from
//          its onset to where it's died away (≤ HIT_LEN's), peaking at −3 dB, mono 80 kb/s
// The water's (docs/plan/66-the-water.md, phase 9) the same way into public/sfx/water:
//   LIST=tools/sfx-water.json DIR=water node tools/sfx-weather.mjs
// and the manifests (public/sfx/steps/manifest.json's slots, public/sfx/weather/manifest.json) list
// each slot's candidates in the json's order: the game plays the first; /dev/weather-sound all.
//
//   node tools/sfx-weather.mjs [cache dir]        all of them (fetched once into the cache)
//   ONLY=grass,rain-light node tools/sfx-weather.mjs
//   PICK='{"grass":1,…}' node tools/sfx-weather.mjs   each slot down to the one picked (0-based; the
//   json's `pick` is the user's, used when PICK doesn't say)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SR = 44100;
const ROOT = new URL("../", import.meta.url).pathname;
const SFX = join(ROOT, "apps/client/public/sfx");
const LIST = join(ROOT, process.env.LIST ?? "tools/sfx-weather.json");
const DIR = process.env.DIR ?? "weather";
const cache = process.argv[2] ?? join(tmpdir(), "yutopia-sfx-weather");
mkdirSync(cache, { recursive: true });
const all = JSON.parse(readFileSync(LIST, "utf8"));
delete all._;
const only = process.env.ONLY?.split(",");
const pick = process.env.PICK ? JSON.parse(process.env.PICK) : null;

// ── audio in and out ────────────────────────────────────────────────────────
/** decoded, as `ch` channels of floats at SR */
function decode(file, ch) {
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "f32le", "-ac", String(ch), "-ar", String(SR), "-"],
    {
      maxBuffer: 1 << 30,
    },
  );
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const n = all.length / ch;
  return Array.from({ length: ch }, (_, c) => {
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = all[i * ch + c];
    return d;
  });
}
function encode(chans, file, kbps) {
  const n = chans[0].length;
  const ch = chans.length;
  const inter = new Float32Array(n * ch);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) inter[i * ch + c] = chans[c][i];
  const tmp = join(tmpdir(), `sfx-weather-${process.pid}.f32`);
  writeFileSync(tmp, Buffer.from(inter.buffer));
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "f32le",
    "-ar",
    String(SR),
    "-ac",
    String(ch),
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
const mono = (chans) => {
  const n = chans[0].length;
  const m = new Float32Array(n);
  for (const c of chans) for (let i = 0; i < n; i++) m[i] += c[i] / chans.length;
  return m;
};
const rms = (d, a = 0, b = d.length) => {
  let s = 0;
  for (let i = a; i < b; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const peak = (chans, a = 0, b = chans[0].length) => {
  let p = 0;
  for (const c of chans) for (let i = a; i < b; i++) p = Math.max(p, Math.abs(c[i]));
  return p;
};
const db = (x) => 10 ** (x / 20);
const slice = (chans, a, b) => chans.map((c) => c.slice(a, b));
const scale = (chans, k) => {
  for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= k;
  return chans;
};
function fades(chans, inS, outS) {
  const n = chans[0].length;
  const fi = Math.round(inS * SR);
  const fo = Math.round(outS * SR);
  for (const c of chans) {
    for (let i = 0; i < fi && i < n; i++) c[i] *= i / fi;
    for (let i = 0; i < fo && i < n; i++) c[n - 1 - i] *= i / fo;
  }
  return chans;
}
/** A look-ahead limiter: the few peaks over `ceil` caught (3 ms ahead, let go over 120 ms), the rest as
 *  it was — so a bed's level is its body's, not its loudest tick's (sleet's ice, a drip). */
function limit(chans, ceil) {
  const n = chans[0].length;
  const ahead = Math.round(0.003 * SR);
  const rel = 1 - Math.exp(-1 / (0.12 * SR));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const c of chans) p = Math.max(p, Math.abs(c[i]));
    need[i] = p > ceil ? ceil / p : 1;
  }
  let g = 1;
  for (let i = 0; i < n; i++) {
    let t = 1;
    for (let k = i; k < Math.min(n, i + ahead); k++) t = Math.min(t, need[k]);
    g = Math.min(t, g + (1 - g) * rel);
    for (const c of chans) c[i] *= g;
  }
  return chans;
}
/** the loudness every `hop` s over `win` s */
function envelope(m, win, hop) {
  const w = Math.round(win * SR);
  const h = Math.round(hop * SR);
  const out = [];
  for (let a = 0; a + w <= m.length; a += h) out.push(rms(m, a, a + w));
  return out;
}

// ── the three kinds ─────────────────────────────────────────────────────────
/** single steps: where the loudness jumps after a quiet, to where it's down again */
function steps(chans) {
  const m = mono(chans);
  const hop = 0.005;
  const env = envelope(m, 0.01, hop);
  const sorted = [...env].sort((a, b) => a - b);
  const floor = Math.max(sorted[Math.floor(sorted.length * 0.2)], 1e-5);
  const top = sorted[Math.floor(sorted.length * 0.995)];
  const on = Math.max(floor * 4, top * 0.12);
  const off = Math.max(floor * 1.4, top * 0.025);
  // the onsets: up past `on` after 0.12 s under it
  const onsets = [];
  let quiet = 0;
  for (let i = 0; i < env.length; i++) {
    if (env[i] < on) quiet++;
    else {
      if (quiet * hop >= 0.12) onsets.push(i);
      quiet = 0;
    }
  }
  // each to where it's stayed down 60 ms (from 0.16 s on), the next one's start at the latest, 0.7 s
  const found = [];
  onsets.forEach((i, n) => {
    const last = Math.min(
      env.length,
      onsets[n + 1] !== undefined ? onsets[n + 1] - 4 : env.length,
      i + Math.round(0.7 / hop),
    );
    let j = i + 1;
    let low = 0;
    for (; j < last; j++) {
      low = env[j] < off ? low + 1 : 0;
      if (low * hop >= 0.06 && (j - i) * hop >= 0.16) break;
    }
    if ((j - i) * hop < 0.1) return;
    let p = 0;
    for (let k = i; k < j; k++) p = Math.max(p, env[k]);
    found.push({ a: Math.max(0, Math.round((i * hop - 0.01) * SR)), b: Math.round(j * hop * SR), p });
  });
  // the six most alike (by their loudest), in the order they came
  const med = [...found].sort((x, y) => x.p - y.p)[found.length >> 1]?.p ?? 0;
  const six = [...found]
    .sort((x, y) => Math.abs(Math.log(x.p / med)) - Math.abs(Math.log(y.p / med)))
    .slice(0, 6)
    .sort((x, y) => x.a - y.a);
  return six.map((s) => {
    const one = fades(slice([m], s.a, s.b), 0.003, 0.03);
    const head = rms(one[0], 0, Math.min(one[0].length, Math.round(0.15 * SR)));
    return scale(one, Math.min(db(-22) / Math.max(head, 1e-6), db(-1) / Math.max(peak(one), 1e-6)));
  });
}
/** a bed: the 30 s (and 0.6 s over, for the seam) whose loudness is the least uneven */
function loop(chans) {
  if (chans.length === 1) chans = [chans[0], chans[0]];
  const want = 30.6;
  const n = chans[0].length;
  const len = Math.min(Math.round(want * SR), n - Math.round(1 * SR));
  const m = mono(chans);
  const env = envelope(m, 0.5, 0.25);
  const span = Math.round(len / SR / 0.25);
  let best = 0;
  let bestCv = 1e9;
  // (not the first and last half second: a recording's start and end)
  for (let a = 2; a + span < env.length - 2; a++) {
    let s = 0;
    let s2 = 0;
    for (let k = a; k < a + span; k++) {
      s += env[k];
      s2 += env[k] * env[k];
    }
    const mean = s / span;
    const cv = Math.sqrt(Math.max(0, s2 / span - mean * mean)) / Math.max(mean, 1e-9);
    if (cv < bestCv) {
      bestCv = cv;
      best = a;
    }
  }
  const a = Math.min(Math.round(best * 0.25 * SR), n - len);
  const bed = slice(chans, a, a + len);
  // (to −24 dB RMS as each ear hears it — not the two channels' mix, quieter for a wide recording —,
  // its few peaks over −1.5 dB caught, the MP3's overshoot under 0: not the whole bed turned down for them)
  const ear = Math.sqrt(bed.reduce((s, c) => s + rms(c) ** 2, 0) / bed.length);
  scale(bed, db(-24) / Math.max(ear, 1e-6));
  return { bed: limit(bed, db(-1.5)), unevenness: bestCv };
}
/** thunder's peals: the loudest (up to three), each from 0.25 s before it rises to where it's down */
function shots(chans, far) {
  if (chans.length === 1) chans = [chans[0], chans[0]];
  const m = mono(chans);
  const hop = 0.05;
  const env = envelope(m, 0.1, hop);
  const sorted = [...env].sort((a, b) => a - b);
  const floor = Math.max(sorted[Math.floor(sorted.length * 0.15)], 1e-5);
  const maxLen = far ? 14 : 9;
  const taken = [];
  const used = new Uint8Array(env.length);
  for (let t = 0; t < 3; t++) {
    let pi = -1;
    for (let i = 0; i < env.length; i++) if (!used[i] && (pi < 0 || env[i] > env[pi])) pi = i;
    if (pi < 0 || env[pi] < floor * 5 || (taken.length && env[pi] < taken[0].p * 0.3)) break;
    // back to where it rose from the quiet, on to where it's died away (or the cap)
    let a = pi;
    while (a > 0 && env[a - 1] > floor * 1.6 && (pi - a) * hop < 3) a--;
    let b = pi;
    while (b < env.length - 1 && env[b + 1] > floor * 1.3 && (b - a) * hop < maxLen) b++;
    // (a far one's rumble rolls on under the rain: 6 s at the least, as the recording has it)
    if (far) b = Math.min(env.length - 1, Math.max(b, a + Math.round(6 / hop)));
    for (let i = Math.max(0, a - 20); i < Math.min(env.length, b + 20); i++) used[i] = 1;
    if ((b - a) * hop < 1.2) continue;
    taken.push({ a: Math.max(0, Math.round((a - 5) * hop * SR)), b: Math.round(b * hop * SR), p: env[pi] });
  }
  return taken
    .sort((x, y) => x.a - y.a)
    .map((s) => {
      const one = fades(slice(chans, s.a, s.b), 0.02, Math.min(2.5, (s.b - s.a) / SR / 3));
      return scale(one, db(-3) / Math.max(peak(one), 1e-6));
    });
}

/** how long an event of a slot's may last, at most (s) */
const HIT_LEN = {
  "car-sink": 6,
  "ice-crack": 4,
  "climb-out": 4,
  bubbles: 2.5,
  "breathless-man": 2.5,
  "breathless-woman": 2.5,
  "gasp-man": 2,
  "gasp-woman": 2,
  "stroke-breast": 1.6,
  "stroke-crawl": 1.2,
};
/** a slot's events: where the loudness jumps after a quiet to where it's down a while (or the cap) —
 *  the six most alike; a recording with no quiet between its events, its loudest stretch */
function hits(chans, maxLen) {
  const m = mono(chans);
  const hop = 0.01;
  const env = envelope(m, 0.02, hop);
  const sorted = [...env].sort((a, b) => a - b);
  const floor = Math.max(sorted[Math.floor(sorted.length * 0.2)], 1e-5);
  const top = sorted[Math.floor(sorted.length * 0.998)];
  const on = Math.max(floor * 5, top * 0.15);
  const off = Math.max(floor * 1.5, top * 0.02);
  const cap = Math.round(maxLen / hop);
  const found = [];
  let quiet = 99;
  for (let i = 0; i < env.length; i++) {
    if (env[i] < on) {
      quiet++;
      continue;
    }
    if (quiet * hop < 0.15) {
      quiet = 0;
      continue;
    }
    quiet = 0;
    let j = i + 1;
    let low = 0;
    for (; j < Math.min(env.length, i + cap); j++) {
      low = env[j] < off ? low + 1 : 0;
      if (low * hop >= 0.12 && (j - i) * hop >= 0.15) break;
    }
    let p = 0;
    for (let k = i; k < j; k++) p = Math.max(p, env[k]);
    found.push({ a: Math.max(0, Math.round((i * hop - 0.015) * SR)), b: Math.round(j * hop * SR), p });
    i = j;
  }
  let take = found.filter((f) => (f.b - f.a) / SR >= 0.15);
  if (!take.length) {
    // (no quiet between: its loudest `maxLen`)
    let best = 0;
    for (let i = 0; i < env.length; i++) if (env[i] > env[best]) best = i;
    const a = Math.max(0, Math.round((best * hop - 0.2) * SR));
    take = [{ a, b: Math.min(m.length, a + Math.round(maxLen * SR)), p: env[best] }];
  }
  const med = [...take].sort((x, y) => x.p - y.p)[take.length >> 1].p;
  return [...take]
    .sort((x, y) => Math.abs(Math.log(x.p / med)) - Math.abs(Math.log(y.p / med)))
    .slice(0, 6)
    .sort((x, y) => x.a - y.a)
    .map((s) => {
      const len = (s.b - s.a) / SR;
      const one = fades(slice([m], s.a, s.b), 0.003, Math.min(0.4, Math.max(0.04, len * 0.12)));
      return scale(one, db(-3) / Math.max(peak(one), 1e-6));
    });
}

// ── fetch, make, list ───────────────────────────────────────────────────────
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
const letters = "abcdefgh";
const stepsMan = JSON.parse(readFileSync(join(SFX, "steps/manifest.json"), "utf8"));
const wxDir = join(SFX, DIR);
mkdirSync(wxDir, { recursive: true });
const wxManFile = join(wxDir, "manifest.json");
const wxMan = existsSync(wxManFile) ? JSON.parse(readFileSync(wxManFile, "utf8")) : {};
for (const [slot, s] of Object.entries(all)) {
  if (only && !only.includes(slot)) continue;
  const at = pick && slot in pick ? pick[slot] : s.pick;
  const from = at === undefined ? s.from : [s.from[at]];
  const dir = s.kind === "steps" ? join(SFX, "steps") : wxDir;
  // (this slot's old files out first)
  for (const f of readdirSync(dir)) if (new RegExp(`^${slot}(-[a-h]?\\d*)?\\.mp3$`).test(f)) rmSync(join(dir, f));
  const list = [];
  from.forEach((c, ci) => {
    const tag = from.length > 1 ? letters[ci] : "";
    const src = fetched(c);
    const files = [];
    const credit = { id: c.id, user: c.user, title: c.title, url: c.url };
    if (s.kind === "steps") {
      steps(decode(src, 1)).forEach((one, i) => {
        const name = `${slot}-${tag}${i + 1}.mp3`;
        encode(one, join(dir, name), 80);
        files.push(name);
      });
      console.log(`${slot} ${tag || "·"} ${c.id}: ${files.length} steps`);
    } else if (s.kind === "loop") {
      const { bed, unevenness } = loop(decode(src, 2));
      const name = `${slot}${tag ? `-${tag}` : ""}.mp3`;
      encode(bed, join(dir, name), 96);
      files.push(name);
      console.log(
        `${slot} ${tag || "·"} ${c.id}: ${(bed[0].length / SR).toFixed(1)} s, ${unevenness > 1e6 ? "the whole of it" : `unevenness ${unevenness.toFixed(2)}`}`,
      );
    } else if (!slot.startsWith("thunder")) {
      hits(decode(src, 1), HIT_LEN[slot] ?? 3).forEach((one, i) => {
        const name = `${slot}-${tag}${i + 1}.mp3`;
        encode(one, join(dir, name), 80);
        files.push(name);
      });
      console.log(`${slot} ${tag || "·"} ${c.id}: ${files.length} takes`);
    } else {
      shots(decode(src, 2), slot.endsWith("far")).forEach((one, i) => {
        const name = `${slot}-${tag}${i + 1}.mp3`;
        encode(one, join(dir, name), 96);
        files.push(name);
      });
      console.log(`${slot} ${tag || "·"} ${c.id}: ${files.length} peals`);
    }
    list.push({ ...credit, files });
  });
  if (s.kind === "steps") stepsMan[slot] = list;
  else wxMan[slot] = list;
}
writeFileSync(join(SFX, "steps/manifest.json"), `${JSON.stringify(stepsMan, null, 2)}\n`);
writeFileSync(wxManFile, `${JSON.stringify(wxMan, null, 2)}\n`);
