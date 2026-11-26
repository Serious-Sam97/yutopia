// (plan 126, F11b) The animals' sound: every species' calls by mood (call / alarm / hurt / angry …) and the generic
// ones (wings, splashes, hooves, a body falling), all CC0 on Freesound (their HQ previews), picked by the plan's agent
// (the user tests after and we change what doesn't fit), cut and levelled into apps/client/public/sfx/animals:
//   - a one-shot (a call, an alarm, a hurt, a growl, wings, a splash, a thud): each event of a recording found by its
//     loudness (up from a quiet to where it's stayed down), from 15 ms before its onset to its end (the slot's `max`
//     at most), a 3 ms fade in and a short fade out, a high-pass under the slot's `hp` (wind, handling), its peak to
//     −3 dB, mono 80 kb/s → <slot>-<n>.mp3;
//   - a loop (hooves, paws): `len` s from `at`, its next 0.25 s crossfaded (equal power) into its head, padded with
//     its own wrap (0.1 s each side: the loop points listed in index.json's `loops`, as plan 104's skate beds), RMS
//     −20 dB, peak ≤ −1 dB.
// The list (tools/sfx-animals.json): each slot's candidates from the search (most downloaded first, a fitting
// length), its `picks` ([{ id, n?, cuts? }]: a candidate's id, how many of its events to take — or its `cuts`, given
// by hand as [from, to] s), and what was made (`out`: every file with its source, licence and cut).
//   node tools/sfx-animals.mjs search [slot,…]     the candidates (plain curl, 4 s apart: Freesound refuses a machine
//                                                   that asks fast, plan 63), picks kept
//   node tools/sfx-animals.mjs fetch               the picked recordings into ../yutopia-art-src/sfx-animals/raw
//                                                   (3 s apart), each candidate's quality measured (`snr`)
//   node tools/sfx-animals.mjs cut [slot,…]        cut, level, write the files + index.json
//   node tools/sfx-animals.mjs events <id> [max]   a fetched recording's events (start, end, peak) — to cut by hand
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SR = 44100;
const ROOT = new URL("../", import.meta.url).pathname;
const LIST = join(ROOT, "tools/sfx-animals.json");
const OUT = join(ROOT, "apps/client/public/sfx/animals");
const RAW = join(ROOT, "../yutopia-art-src/sfx-animals/raw");

// ── the slots ───────────────────────────────────────────────────────────────
// slot: [kind, [queries], [min s, max s] of the recording, candidates kept, the cut's longest (s), variants wanted]
const S = (q, rec, max, want, n = 6) => ["shot", q, rec, n, max, want];
const L = (q, rec, want, n = 5) => ["loop", q, rec, n, 6, want];
const SLOTS = {
  "crow-call": S(["crow caw", "crow", "raven call"], [0.5, 40], 3, 4),
  "crow-alarm": S(["crows alarm", "crow angry", "crows cawing"], [0.5, 40], 3, 2),
  "songbird-call": S(["bird chirp", "robin song", "blackbird song", "sparrow chirp", "bird tweet"], [0.3, 40], 3, 4),
  "songbird-alarm": S(["bird alarm call", "blackbird alarm", "bird chirp alarm"], [0.3, 40], 2, 2),
  "duck-call": S(["duck quack", "mallard duck", "duck"], [0.3, 40], 2.5, 3),
  "duck-alarm": S(["duck quacking flying", "duck alarm", "mallard alarm"], [0.3, 40], 2.5, 1),
  "goose-call": S(["goose honk", "canada goose", "goose"], [0.3, 40], 2.5, 3),
  "goose-angry": S(["goose hiss", "goose angry"], [0.3, 40], 2.5, 2),
  "owl-call": S(["owl hoot", "tawny owl", "great horned owl", "owl"], [0.5, 40], 4, 3),
  "gull-call": S(["seagull", "gull call", "herring gull"], [0.3, 40], 3, 3),
  "pigeon-call": S(["pigeon coo", "dove coo", "pigeon"], [0.5, 40], 3, 3),
  "bat-call": S(["bat squeak", "bat", "bats"], [0.3, 40], 1.5, 2),
  "squirrel-call": S(["squirrel chatter", "squirrel", "red squirrel"], [0.3, 40], 3, 3),
  "squirrel-alarm": S(["squirrel alarm", "squirrel angry", "squirrel squeak"], [0.3, 40], 2.5, 1),
  "hare-hurt": S(["rabbit scream", "rabbit squeal", "hare scream", "rabbit"], [0.3, 40], 2, 2),
  "fox-call": S(["fox bark", "fox scream", "red fox", "fox"], [0.3, 40], 3, 3),
  "fox-alarm": S(["fox scream", "vixen scream", "fox yelp"], [0.3, 40], 3, 1),
  "raccoon-call": S(["raccoon", "raccoon chitter", "racoon"], [0.3, 40], 3, 3),
  "beaver-alarm": S(["beaver tail slap", "beaver slap", "beaver", "tail slap water"], [0.3, 40], 2.5, 2),
  "frog-call": S(["frog croak", "ribbit", "frog", "toad"], [0.3, 40], 2.5, 3),
  "cat-call": S(["cat meow", "meow", "kitten meow"], [0.3, 40], 2.5, 4),
  "cat-angry": S(["cat hiss", "cat hissing", "angry cat"], [0.3, 40], 2.5, 2),
  "cat-hurt": S(["cat screech", "cat yowl", "cat scream"], [0.3, 40], 2, 1),
  "deer-alarm": S(["deer snort", "deer bark", "roe deer bark", "deer alarm"], [0.3, 40], 2, 2),
  "deer-call": S(["deer bleat", "deer call", "deer grunt"], [0.3, 40], 2.5, 2),
  "elk-call": S(["elk bugle", "elk", "red deer stag roar", "stag roar"], [0.5, 40], 5, 3),
  "moose-call": S(["moose call", "moose grunt", "moose"], [0.3, 40], 3, 3),
  "boar-call": S(["wild boar grunt", "wild boar", "boar"], [0.3, 40], 2.5, 3),
  "boar-angry": S(["boar squeal", "wild boar squeal", "pig squeal angry", "boar snort"], [0.3, 40], 2.5, 2),
  "wolf-call": S(["wolf howl", "wolves howling", "wolf"], [1, 40], 6, 3),
  "wolf-angry": S(["wolf growl", "wolf snarl", "dog growl", "dog snarl"], [0.3, 40], 3, 2),
  "wolf-hurt": S(["dog yelp", "wolf whimper", "dog whine yelp"], [0.3, 40], 1.5, 1),
  "lynx-angry": S(["lynx growl", "bobcat growl", "lynx", "cougar growl", "big cat growl"], [0.3, 40], 3, 2),
  "lynx-call": S(["lynx call", "bobcat", "lynx yowl"], [0.3, 40], 3, 1),
  "bear-angry": S(["bear roar", "bear growl", "grizzly bear"], [0.3, 40], 3.5, 2),
  "bear-call": S(["bear huff", "bear grunt", "bear breathing", "bear"], [0.3, 40], 3, 2),
  "chicken-call": S(["chicken cluck", "hen cluck", "chicken", "hen"], [0.3, 40], 2.5, 3),
  "chicken-alarm": S(["chicken squawk", "chicken alarm", "hen squawk"], [0.3, 40], 2.5, 1),
  "cow-call": S(["cow moo", "cow", "moo"], [0.5, 40], 3.5, 3),
  "sheep-call": S(["sheep baa", "sheep", "lamb bleat"], [0.3, 40], 2.5, 3),
  "pig-call": S(["pig oink", "pig grunt", "pig"], [0.3, 40], 2.5, 3),
  "pig-hurt": S(["pig squeal", "pig scream"], [0.3, 40], 2, 1),
  "horse-call": S(["horse whinny", "horse neigh", "horse"], [0.5, 40], 3, 2),
  "horse-snort": S(["horse snort", "horse blow", "horse nicker"], [0.3, 40], 2, 2),
  "wings-small": S(["bird wings flap", "small bird flying away", "bird flutter", "bird take off"], [0.2, 30], 1.5, 1),
  "wings-medium": S(["pigeon take off", "pigeon wings", "dove wings flap", "pigeon flying away"], [0.2, 30], 2, 1),
  "wings-large": S(["wings flapping", "large bird take off", "swan wings", "goose take off", "wing flap"], [0.2, 30], 2.5, 1),
  "splash": S(["splash small", "water splash", "splash", "big splash", "object falling into water"], [0.2, 30], 2.5, 3),
  thud: S(["body fall snow", "body fall", "body drop", "thud snow", "bodyfall"], [0.2, 30], 1.5, 2),
  "hooves-gallop": L(["horse gallop", "galloping", "horse galloping"], [2, 60], 2),
  "hooves-trot": L(["horse trot", "trotting", "horse walk"], [2, 60], 1),
  paws: L(["dog running", "dog paws running", "animal running"], [1, 60], 1),
};

// ── the search ──────────────────────────────────────────────────────────────
const attr = (block, name) => {
  const m = block.match(new RegExp(`${name}="([^"]*)"`));
  return m
    ? m[1]
        .replace(/&amp;/g, "&")
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
    : "";
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function search(q) {
  const url = `https://freesound.org/search/?q=${encodeURIComponent(q).replace(/%20/g, "+")}&f=license%3A%22Creative+Commons+0%22&s=Downloads+%28most+first%29`;
  const html = execFileSync("curl", ["-s", "-f", "-A", "yutopia-sfx/1.0", url], { maxBuffer: 1 << 26 }).toString();
  return html
    .split('class="bw-player"')
    .slice(1)
    .map((b) => {
      const id = attr(b, "data-sound-id");
      const uid = attr(b, "data-user-id");
      return {
        id,
        user: attr(b, "data-username"),
        title: attr(b, "data-title"),
        preview: `https://cdn.freesound.org/previews/${Math.floor(Number(id) / 1000)}/${id}_${uid}-hq.mp3`,
        url: `https://freesound.org/people/${attr(b, "data-username")}/sounds/${id}/`,
        licence: "CC0",
        dur: Math.round(Number(attr(b, "data-duration")) * 10) / 10,
        downloads: Number(attr(b, "data-num-downloads")) || 0,
      };
    })
    .filter((r) => r.id);
}
const load = () => (existsSync(LIST) ? JSON.parse(readFileSync(LIST, "utf8")) : {});
const save = (all) => writeFileSync(LIST, `${JSON.stringify(all, null, 2)}\n`);
const HEADER =
  "The animals' sound candidates (docs/plan/126-animal-life.md, F11b): every one CC0 on Freesound, fetched as its HQ preview. `picks`: what the game gets — each a candidate's id and how many of its events (`n`) or its cuts by hand (`cuts`, [from, to] s); `out`: every file made, with its source, licence and cut (s into the HQ preview). Picked by the agent from the titles, lengths and measured quality (snr: the loudest 20 ms over the quietest fifth, dB); the user tests and we change what doesn't fit. Made by tools/sfx-animals.mjs.";

async function doSearch(only) {
  const all = { ...load(), _: HEADER };
  for (const [slot, [kind, queries, [lo, hi], n]] of Object.entries(SLOTS)) {
    if (only && !only.includes(slot)) continue;
    const seen = new Set();
    const from = [];
    for (const q of queries) {
      if (from.length >= n) break;
      let rs = [];
      try {
        rs = search(q);
      } catch (e) {
        console.log(`  ${slot}: "${q}" failed (${e.message.split("\n")[0]})`);
      }
      await sleep(4000);
      for (const r of rs) {
        if (from.length >= n) break;
        if (seen.has(r.id) || r.dur < lo || r.dur > hi) continue;
        seen.add(r.id);
        from.push({ ...r, note: `"${q}"` });
      }
    }
    const keep = all[slot] ?? {};
    all[slot] = { kind, from, ...(keep.picks ? { picks: keep.picks } : {}), ...(keep.out ? { out: keep.out } : {}) };
    console.log(`${slot}: ${from.length} — ${from.map((f) => `${f.id} ${f.title} (${f.dur}s, ${f.downloads})`).join(" · ")}`);
    save(all);
  }
}

// ── audio ───────────────────────────────────────────────────────────────────
const BIG = 1 << 30;
function decode(file, af = "") {
  const args = ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR)];
  if (af) args.push("-af", af);
  args.push("-f", "f32le", "-");
  const b = execFileSync("ffmpeg", args, { maxBuffer: BIG });
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength >> 2).slice();
}
function encode(pcm, out) {
  const tmp = `${out}.tmp.f32`;
  writeFileSync(tmp, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
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
    "80k",
    out,
  ]);
  rmSync(tmp);
}
const peakOf = (p, a = 0, b = p.length) => {
  let m = 0;
  for (let i = a; i < b; i++) m = Math.max(m, Math.abs(p[i]));
  return m;
};
const rmsOf = (p, a = 0, b = p.length) => {
  let s = 0;
  for (let i = a; i < b; i++) s += p[i] * p[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const dB = (x) => 20 * Math.log10(Math.max(1e-9, x));
const gain = (x) => 10 ** (x / 20);
const HOP = 0.01;
function envelope(p) {
  const h = Math.round(HOP * SR);
  const w = 2 * h;
  const out = [];
  for (let a = 0; a + w <= p.length; a += h) out.push(rmsOf(p, a, a + w));
  return out;
}
/** how clean: the loudest 20 ms over the quietest fifth's (dB) */
function snr(p) {
  const env = envelope(p);
  const s = [...env].sort((a, b) => a - b);
  return Math.round(dB(s[s.length - 1]) - dB(Math.max(s[Math.floor(s.length * 0.2)], 1e-6)));
}
/** a recording's events: where the loudness rises out of a quiet to where it's stayed down 120 ms (max at most) */
function events(p, max) {
  const env = envelope(p);
  const s = [...env].sort((a, b) => a - b);
  const floor = Math.max(s[Math.floor(s.length * 0.2)], 1e-5);
  const top = s[Math.floor(s.length * 0.998)];
  const on = Math.max(floor * 4, top * 0.12);
  const off = Math.max(floor * 1.6, top * 0.03);
  const cap = Math.round(max / HOP);
  const found = [];
  let quiet = 99;
  for (let i = 0; i < env.length; i++) {
    if (env[i] < on) {
      quiet++;
      continue;
    }
    if (quiet * HOP < 0.12) {
      quiet = 0;
      continue;
    }
    quiet = 0;
    // (back to where it rose from the floor, 60 ms at most)
    let a = i;
    while (a > 0 && i - a < 6 && env[a - 1] > off) a--;
    let j = i + 1;
    let low = 0;
    for (; j < Math.min(env.length, a + cap); j++) {
      low = env[j] < off ? low + 1 : 0;
      if (low * HOP >= 0.12) {
        j -= low - 2;
        break;
      }
    }
    let pk = 0;
    for (let k = a; k < j; k++) pk = Math.max(pk, env[k]);
    const from = Math.max(0, a * HOP - 0.015);
    const to = Math.min(p.length / SR, (j + 1) * HOP);
    if (to - from >= 0.12) found.push({ from: r3(from), to: r3(to), peak: Math.round(dB(pk)) });
    i = j;
  }
  return found;
}
const r3 = (x) => Math.round(x * 1000) / 1000;
/** a one-shot from..to: fades, peak −3 dB */
function shot(p, from, to) {
  const cut = p.slice(Math.round(from * SR), Math.round(to * SR));
  const len = cut.length / SR;
  const fi = Math.round(0.003 * SR);
  const fo = Math.round(Math.min(0.35, Math.max(0.03, len * 0.15)) * SR);
  for (let i = 0; i < fi && i < cut.length; i++) cut[i] *= i / fi;
  for (let i = 0; i < fo && i < cut.length; i++) cut[cut.length - 1 - i] *= (i / fo) ** 1.5;
  const g = gain(-3) / Math.max(1e-6, peakOf(cut));
  for (let i = 0; i < cut.length; i++) cut[i] *= g;
  return cut;
}
const PAD = 0.1;
const XF = 0.25;
/** a loop: len s from `at`, its next XF s crossfaded into its head, padded with its own wrap; RMS −20, peak ≤ −1 */
function loop(p, at, len) {
  const a = Math.round(at * SR);
  const Ls = Math.round(len * SR);
  const X = Math.round(XF * SR);
  if (a + Ls + X > p.length) throw new Error(`too short for a ${len} s loop at ${at}`);
  const lp = p.slice(a, a + Ls);
  for (let i = 0; i < X; i++) {
    const k = ((i / X) * Math.PI) / 2;
    lp[i] = p[a + i] * Math.sin(k) + p[a + Ls + i] * Math.cos(k);
  }
  const g = Math.min(gain(-20) / Math.max(1e-6, rmsOf(lp)), gain(-1) / Math.max(1e-6, peakOf(lp)));
  for (let i = 0; i < Ls; i++) lp[i] *= g;
  const P = Math.round(PAD * SR);
  const out = new Float32Array(Ls + 2 * P);
  for (let i = 0; i < out.length; i++) out[i] = lp[(((i - P) % Ls) + Ls) % Ls];
  return { pcm: out, loop: [r3(P / SR), r3((P + Ls) / SR)] };
}

// ── fetch, cut ──────────────────────────────────────────────────────────────
const rawOf = (c) => join(RAW, `${c.id}_${c.preview.match(/_(\d+)-hq/)[1]}.mp3`);
let lastFetch = 0;
function fetched(c) {
  const f = rawOf(c);
  if (existsSync(f) && statSync(f).size > 1000) return f;
  const wait = lastFetch + 3000 - Date.now();
  if (wait > 0) execFileSync("sleep", [String(wait / 1000)]);
  execFileSync("curl", ["-s", "-f", "-A", "yutopia-sfx/1.0", "-o", f, c.preview]);
  lastFetch = Date.now();
  return f;
}
const candOf = (all, id) => {
  for (const [k, s] of Object.entries(all)) {
    if (k === "_") continue;
    const c = s.from?.find((f) => f.id === String(id));
    if (c) return c;
  }
  throw new Error(`no candidate ${id}`);
};
// (a high-pass under each kind: the wind and the handling out; small birds' under 250 Hz, big beasts' kept)
const HP = { songbird: 250, bat: 300, squirrel: 150, wings: 80, frog: 80, bear: 30, elk: 40, moose: 30, thud: 30 };
const hpOf = (slot) => HP[slot.split("-")[0]] ?? 60;

function doFetch() {
  mkdirSync(RAW, { recursive: true });
  const all = load();
  for (const [slot, s] of Object.entries(all)) {
    if (slot === "_" || !s.picks) continue;
    for (const pk of s.picks) {
      const c = candOf(all, pk.id);
      const f = fetched(c);
      c.snr = snr(decode(f, `highpass=f=${hpOf(slot)}`));
      console.log(`${slot} ${c.id} ${c.title}: snr ${c.snr} dB`);
    }
    save(all);
  }
}

function doCut(only) {
  mkdirSync(OUT, { recursive: true });
  const all = load();
  const index = existsSync(join(OUT, "index.json")) ? JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")) : {};
  index.loops ??= {};
  for (const [slot, s] of Object.entries(all)) {
    if (slot === "_" || !s.picks || (only && !only.includes(slot))) continue;
    const [kind, , , , max] = SLOTS[slot];
    for (const f of readdirSync(OUT)) if (new RegExp(`^${slot}-\\d+\\.mp3$`).test(f)) rmSync(join(OUT, f));
    const out = [];
    let n = 0;
    for (const pk of s.picks) {
      const c = candOf(all, pk.id);
      const p = decode(fetched(c), `highpass=f=${hpOf(slot)}`);
      const credit = { id: c.id, title: c.title, user: c.user, url: c.url, licence: c.licence ?? "CC0" };
      if (kind === "loop") {
        for (const [at, len] of pk.cuts) {
          const name = `${slot}-${++n}.mp3`;
          const { pcm, loop: lp } = loop(p, at, len);
          encode(pcm, join(OUT, name));
          index.loops[name] = lp;
          out.push({ file: name, ...credit, cut: [at, r3(at + len)] });
        }
        continue;
      }
      const cuts = pk.cuts ?? events(p, pk.max ?? max).slice(pk.skip ?? 0, (pk.skip ?? 0) + (pk.n ?? 1)).map((e) => [e.from, e.to]);
      if (!cuts.length) console.log(`  ${slot} ${c.id}: no events found`);
      for (const [a, b] of cuts) {
        const name = `${slot}-${++n}.mp3`;
        encode(shot(p, a, b), join(OUT, name));
        out.push({ file: name, ...credit, cut: [a, b] });
      }
    }
    s.out = out;
    // (the index: species → mood → files; wings by size, hooves by gait, splash and thud plain lists)
    const [sp, mood] = slot.includes("-") ? slot.split(/-(.*)/s) : [slot, null];
    const files = out.map((o) => o.file);
    if (mood) {
      index[sp] = { ...(index[sp] ?? {}), [mood]: files };
    } else index[slot] = files;
    console.log(`${slot}: ${out.map((o) => `${o.file} ${o.id} [${o.cut.join("–")}]`).join(" · ")}`);
    save(all);
  }
  for (const k of Object.keys(index.loops)) if (!existsSync(join(OUT, k))) delete index.loops[k];
  const sorted = Object.fromEntries(Object.keys(index).sort((a, b) => (a === "loops") - (b === "loops") || a.localeCompare(b)).map((k) => [k, index[k]]));
  writeFileSync(join(OUT, "index.json"), `${JSON.stringify(sorted, null, 2)}\n`);
}

const [mode, arg, arg2] = process.argv.slice(2);
const only = arg?.split(",");
if (mode === "search") await doSearch(only);
else if (mode === "fetch") doFetch();
else if (mode === "cut") doCut(only);
else if (mode === "events") {
  const all = load();
  const c = candOf(all, arg);
  const p = decode(fetched(c));
  console.log(`${c.id} ${c.title}: ${(p.length / SR).toFixed(2)} s, snr ${snr(p)} dB`);
  for (const e of events(p, Number(arg2 ?? 4))) console.log(`  ${e.from.toFixed(3)}–${e.to.toFixed(3)}  ${(e.to - e.from).toFixed(2)} s  ${e.peak} dB`);
} else console.log("node tools/sfx-animals.mjs search|fetch|cut|events");
