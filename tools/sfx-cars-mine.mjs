// My picks for the cars' sounds (docs/plan/92-the-cars.md phase 11), made without ears: by what the recordings are
// (a car pack's own horn or door, pinned, over a search's; the title fitting the slot; a cartoon, a synth, a game
// sound or something else entirely kept out) and by what's measured in them (ffmpeg-decoded): clipping, the noise
// floor, how far the sound stands over it, its brightness (spectral centroid) against what the slot wants, how
// even a bed is, its length. The engines' sets by what tools/sfx-cars-engines.mjs measured cutting them (how many of
// the voice's revs and loads they cover, by how many mics, how steady and how sure the loops) and by fit (the period,
// the vehicle). Each slot's pick goes first (letter a) with `mine: 0` and its `why`; public/sfx/cars/picks.json gets
// the reasons for /dev/car-sound. The user's own picks (`pick`) are never touched.
//   ONLY=chirp,scrub node tools/sfx-cars-mine.mjs slots   (those slots alone)
//   node tools/sfx-cars-mine.mjs slots      before tools/sfx-weather.mjs cuts them (the letters follow the order)
//   node tools/sfx-cars-mine.mjs engines    after tools/sfx-cars-engines.mjs has cut and measured them (cut again after)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const SLOTS = join(ROOT, "tools/sfx-cars.json");
const ENG = join(ROOT, "tools/sfx-cars-engines.json");
const PICKS = join(ROOT, "apps/client/public/sfx/cars/picks.json");
const cache = process.env.CACHE ?? join(tmpdir(), "yutopia-sfx-weather");
mkdirSync(cache, { recursive: true });
const what = process.argv[2] ?? "slots";
const SR = 22050;

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
function decode(file) {
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-t", "90", "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"],
    {
      maxBuffer: 1 << 30,
    },
  );
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}
const toDb = (x) => 20 * Math.log10(Math.max(x, 1e-9));

/** a 1024-point FFT's magnitude centroid (Hz) */
function centroid(d, a) {
  const N = 1024;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (d[a + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
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
        const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - xr;
        im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
  }
  let s = 0;
  let sw = 0;
  for (let k = 1; k < N / 2; k++) {
    const m = Math.hypot(re[k], im[k]);
    s += m;
    sw += m * ((k * SR) / N);
  }
  return s > 0 ? sw / s : 0;
}
/** what's measured in a recording */
function measure(file) {
  const d = decode(file);
  const hop = Math.round(0.05 * SR);
  const env = [];
  for (let a = 0; a + hop <= d.length; a += hop) {
    let s = 0;
    for (let i = a; i < a + hop; i++) s += d[i] * d[i];
    env.push(Math.sqrt(s / hop));
  }
  const sorted = [...env].sort((x, y) => x - y);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  let clip = 0;
  let pk = 0;
  for (const x of d) {
    const v = Math.abs(x);
    if (v > 0.985) clip++;
    if (v > pk) pk = v;
  }
  // the brightness of its loud part (the frames over its median), up to 60 of them
  const loudAt = env
    .map((e, i) => [e, i])
    .filter(([e]) => e >= q(0.6))
    .map(([, i]) => i * hop);
  const step = Math.max(1, Math.floor(loudAt.length / 60));
  const cs = [];
  for (let i = 0; i < loudAt.length; i += step) cs.push(centroid(d, loudAt[i]));
  const loud = env.filter((e) => e >= q(0.5));
  const mean = loud.reduce((s, e) => s + e, 0) / Math.max(1, loud.length);
  const cv = Math.sqrt(loud.reduce((s, e) => s + (e - mean) ** 2, 0) / Math.max(1, loud.length)) / Math.max(mean, 1e-9);
  return {
    dur: d.length / SR,
    floor: toDb(q(0.1)),
    loud: toDb(q(0.97)),
    range: toDb(q(0.97)) - toDb(q(0.1)),
    clip: clip / d.length,
    peak: toDb(pk),
    centroid: cs.length ? cs.sort((x, y) => x - y)[cs.length >> 1] : 0,
    uneven: cv,
  };
}

// what each slot wants: its words (in the title: a fit), its brightness (Hz), a bed or a moment
const WANT = {
  "start-four": [/start|ignit|crank/i, [400, 3000]],
  "start-v8": [/v8|v-8|muscle|truck|start/i, [200, 2000]],
  "start-diesel": [/diesel|tractor|truck|start/i, [200, 2000]],
  "start-two": [/snowmobile|two.?stroke|2.?stroke|dirt ?bike|skidoo|ski-doo|pull/i, [400, 4000]],
  stop: [/stop|off|shut/i, [200, 2500]],
  "tick-cool": [/tick|cool/i, [1500, 7000]],
  shift: [/shift|gear/i, [500, 4000]],
  "gear-whine": [/whine|gear|transmission/i, [500, 4000]],
  pops: [/backfire|pop|crackle/i, [300, 3000]],
  limiter: [/limit/i, [300, 3000]],
  intake: [/intake|induction|carb/i, [300, 3000]],
  skid: [/skid|squeal|screech/i, [1200, 5000]],
  squeal: [/squeal|screech|skid|peel/i, [1200, 5000]],
  "squeal-loop": [/squeal|screech|skid|drift|corner/i, [1200, 5000]],
  scrub: [/squeal|scrub|tire|tyre/i, [800, 4000]],
  chirp: [/chirp|squeak|tire|tyre|skid|screech/i, [1200, 6000]],
  "snow-squeak": [/snow/i, [800, 5000]],
  "snow-roll": [/snow/i, [300, 3000]],
  "snow-slide": [/snow|spin|slid/i, [300, 3500]],
  "ice-hiss": [/ice|icy/i, [1000, 6000]],
  gravel: [/gravel/i, [800, 5000]],
  slush: [/wet|slush|rain|puddle/i, [800, 5000]],
  splash: [/splash|puddle|water/i, [800, 5000]],
  rumble: [/rumble ?strip|rumble/i, [100, 1500]],
  "road-roll": [/interior|inside|road|driv/i, [100, 1500]],
  wind: [/wind/i, [200, 2500]],
  "hit-light": [/bump|knock|hit|impact|crash/i, [300, 3500]],
  "hit-mid": [/crash|impact|collision|hit/i, [300, 3500]],
  "hit-heavy": [/crash|impact|collision|metal/i, [200, 3000]],
  "hit-glass": [/glass|window|shatter|smash/i, [2000, 8000]],
  "hit-post": [/metal|pole|post|pipe/i, [500, 5000]],
  "hit-tree": [/wood|tree|trunk|log/i, [200, 2500]],
  "hit-snowbank": [/snow/i, [200, 2500]],
  scrape: [/scrap/i, [800, 5000]],
  thump: [/bump|pothole|bottom|suspension|thump/i, [80, 1500]],
  rattle: [/rattl/i, [600, 5000]],
  "door-open": [/door/i, [400, 4000]],
  "door-shut": [/door|slam|close/i, [200, 3000]],
  "door-van": [/slid|van/i, [300, 4000]],
  "door-truck": [/truck|pickup|door/i, [200, 3000]],
  boot: [/trunk|boot/i, [200, 3000]],
  bonnet: [/hood|bonnet/i, [200, 3000]],
  handbrake: [/brake/i, [600, 5000]],
  indicator: [/indicator|signal|hazard|blinker|tick/i, [800, 6000]],
  wiper: [/wiper/i, [300, 4000]],
  belt: [/belt|buckle/i, [1000, 6000]],
  "horn-saloon": [/horn/i, [400, 2500]],
  "horn-truck": [/horn/i, [200, 1800]],
  "horn-small": [/horn|beep/i, [500, 3000]],
  siren: [/siren/i, [500, 3000]],
  "reverse-beep": [/revers|backup|beep/i, [800, 4000]],
  plough: [/plow|plough/i, [300, 4000]],
  tracks: [/track|tank|groomer|snowcat/i, [100, 2500]],
  runners: [/sled|sledge|toboggan|sleigh/i, [500, 5000]],
};
// not a real car's (the guns' rule: real and heavy, not a game's)
const NOT =
  /cartoon|comic|8.?bit|arcade|chiptune|synth|retro|toy|game ?over|laser|sci.?fi|music|melod|song|loop ?kit|bird|grasshopper|cricket|dog|cat\b|locomotive|helicopter|jet|airplane|plane|boat|sailboat|motorbike|sportsbike|lawnmower|chainsaw|fender|guitar|crowd|cheer/i;

const fmt = (x, n = 0) => (Math.round(x * 10 ** n) / 10 ** n).toString();
function pickSlot(slot, s) {
  const want = WANT[slot] ?? [/./, [200, 4000]];
  const loop = s.kind === "loop";
  const rows = s.from.map((c, i) => {
    let m = null;
    try {
      m = measure(fetched(c));
    } catch (e) {
      console.log(`  ${slot} ${c.id}: ${e.message.split("\n")[0]}`);
    }
    if (!m) return { i, c, score: -99, m: null, why: [] };
    const why = [];
    let score = 0;
    const pinned = /pinned/.test(c.note ?? "");
    if (pinned) {
      score += 1.2;
      why.push("from a car's own pack");
    }
    if (want[0].test(c.title)) score += 0.8;
    else if (!pinned) score -= 1.2;
    if (NOT.test(c.title) && !pinned) score -= 3;
    // (a gear that grinds, a failed one: not a shift)
    if (slot === "shift" && /fail|grind|scratch|crunch/i.test(c.title)) score -= 2;
    // clipping, the floor, standing over it
    if (m.clip > 0.002) score -= 1.5;
    else if (m.clip > 0.0002) score -= 0.5;
    score += Math.min(1.2, Math.max(-1.2, (m.range - (loop ? 18 : 30)) / 15));
    if (m.floor > -40 && !loop) score -= 0.6;
    // its brightness against the slot's
    const [lo, hi] = want[1];
    const off = m.centroid < lo ? Math.log2(lo / m.centroid) : m.centroid > hi ? Math.log2(m.centroid / hi) : 0;
    score -= Math.min(1.5, off * 0.8);
    // a bed: even; a moment: not a whole minute of other things
    if (loop) score -= Math.min(1.2, Math.max(0, m.uneven - 0.25) * 2);
    if (loop && m.dur < 3) score -= 0.6;
    if (!loop && m.dur > 40) score -= 0.4;
    score += Math.min(0.6, Math.log10(1 + (c.downloads ?? 0)) * 0.15);
    // its reason, in a few facts
    if (want[0].test(c.title)) why.push(`"${c.title.slice(0, 40)}"`);
    if (m.clip <= 0.0002) why.push("no clipping");
    why.push(m.floor < -90 ? "silence between its sounds" : `${fmt(m.range)} dB over its floor`);
    if (!off) why.push(`its brightness right (${fmt(m.centroid / 1000, 1)} kHz)`);
    if (loop) why.push(m.uneven < 0.3 ? "even" : `unevenness ${fmt(m.uneven, 2)}`);
    if ((c.downloads ?? 0) > 500) why.push(`${c.downloads} downloads`);
    return { i, c, score, m, why };
  });
  const best = [...rows].sort((a, b) => b.score - a.score)[0];
  return { best, rows };
}

if (what === "slots") {
  const all = JSON.parse(readFileSync(SLOTS, "utf8"));
  const picks = existsSync(PICKS) ? JSON.parse(readFileSync(PICKS, "utf8")) : {};
  // (ONLY=a,b: those slots alone — the others' order, and so their cut files' letters, left as they are)
  const only = process.env.ONLY?.split(",");
  picks.slots = only ? (picks.slots ?? {}) : {};
  for (const [slot, s] of Object.entries(all)) {
    if (slot === "_" || !s.from?.length || (only && !only.includes(slot))) continue;
    // (an earlier run's order back as found: my pick first again from scratch)
    const { best, rows } = pickSlot(slot, s);
    const want = WANT[slot] ?? [/./];
    if (!best?.m) continue;
    // a candidate that's no car's at all goes (the guns' "dropped by hand", by its title)
    // (and one whose title doesn't say it's the slot's — unless none does: then the lot stays, marked)
    const fits = (r) => /pinned/.test(r.c.note ?? "") || (want[0].test(r.c.title) && !NOT.test(r.c.title));
    const any = rows.some(fits);
    const kept = rows.filter((r) => r === best || (any ? fits(r) : !NOT.test(r.c.title)));
    if (!any) best.why.unshift("NOTHING FOUND FITS — the best of a poor lot");
    s.from = [best.c, ...kept.filter((r) => r !== best).map((r) => r.c)];
    s.mine = 0;
    s.why = best.why.join(", ");
    picks.slots[slot] = { why: s.why, id: best.c.id, title: best.c.title };
    console.log(
      `${slot}: ${best.c.title} (${fmt(best.score, 2)}) — ${s.why}${kept.length < rows.length ? ` · ${rows.length - kept.length} dropped` : ""}`,
    );
  }
  writeFileSync(SLOTS, `${JSON.stringify(all, null, 2)}\n`);
  writeFileSync(PICKS, `${JSON.stringify(picks, null, 2)}\n`);
} else {
  // the engines: by what the cutter measured (public/sfx/cars/engines.json) and by fit
  const eng = JSON.parse(readFileSync(ENG, "utf8"));
  const man = JSON.parse(readFileSync(join(ROOT, "apps/client/public/sfx/cars/engines.json"), "utf8"));
  const picks = existsSync(PICKS) ? JSON.parse(readFileSync(PICKS, "utf8")) : {};
  picks.engines = {};
  // (fit: a period engine for an 80s world, the vehicle's own kind — my call, written down)
  const FIT = {
    "Mercedes 190E-16V on a dyno (today's)": [
      1,
      "an 80s saloon's twin-cam four, recorded on a dyno: real load, three mics",
    ],
    "Chevrolet Impala (1980), outside": [1, "a 1980 V8: the period, a big car's lazy burble"],
    "Ford Cortina on a dyno (70s, 328 hp)": [0.4, "a period four pulling under load"],
    "Mini Cooper S (contact mic)": [0.2, "a small four driven hard (the block's own voice, no exhaust mic)"],
    "BMW 120d": [0.8, "a small diesel's idle, low, medium and high, inside and out"],
    "A tractor at a landfill": [0.7, "a working tractor under load: the farm's"],
    "Ski-Doo Skandik": [0.7, "a working snowmobile's two-stroke twin"],
    "Hot-rod V8 (start, rough idle, revs, away)": [-0.4, "a hot rod: louder than a farm pickup"],
  };
  for (const [voice, v] of Object.entries(eng)) {
    if (voice === "_" || !v.sets?.length) continue;
    const cut = man[voice]?.sets ?? [];
    const rows = v.sets.map((set, i) => {
      const m = cut.find((c) => c.name === set.name);
      const pts = m?.points ?? [];
      const n = v.rpm.length;
      const covered = (load) => new Set(pts.filter((p) => p.load === load).map((p) => p.target)).size / n;
      const mics = new Set(pts.map((p) => p.mic)).size;
      const steady = pts.length ? pts.reduce((s, p) => s + p.steady, 0) / pts.length : 0;
      const sure = pts.length ? pts.reduce((s, p) => s + p.sure, 0) / pts.length : 0;
      const snr = pts.length ? pts.reduce((s, p) => s + p.snr, 0) / pts.length : 0;
      const [fit, said] = FIT[set.name] ?? [0, ""];
      const score =
        covered("off") * 2 +
        covered("on") * 1.5 +
        Math.min(3, mics) * 0.3 +
        (steady - 0.9) * 5 +
        sure +
        Math.min(1, snr / 30) +
        fit;
      const why = [
        said,
        `${pts.length} loops: off load ${Math.round(covered("off") * n)}/${n} revs, on ${Math.round(covered("on") * n)}/${n}`,
        `${mics} mic${mics === 1 ? "" : "s"}`,
        `steadiness ${fmt(steady, 3)}, pitch sure ${fmt(sure, 2)}`,
      ].filter(Boolean);
      return { i, set, score, why };
    });
    const best = [...rows].sort((a, b) => b.score - a.score)[0];
    v.sets = [best.set, ...v.sets.filter((s) => s !== best.set)];
    v.mine = 0;
    v.why = best.why.join("; ");
    picks.engines[voice] = { why: v.why, name: best.set.name };
    console.log(`${voice}: ${best.set.name} (${fmt(best.score, 2)}) — ${v.why}`);
  }
  writeFileSync(ENG, `${JSON.stringify(eng, null, 2)}\n`);
  writeFileSync(PICKS, `${JSON.stringify(picks, null, 2)}\n`);
}
