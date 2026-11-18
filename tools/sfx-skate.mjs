// (plan 104, F12a) The skate's recordings — Tony Hawk's sound model: eleven slots a surface (concrete, wood, metal,
// asphalt) and the board's own (the push, the bail, the wheels spinning in the air, the kick-up, a ramp's boom, the
// board put down) — cut and levelled into apps/client/public/sfx/skate, mono 80 kb/s:
//   - a shot (a pop, a landing, a knock) by its transient: each cut starts 6 ms before an onset the analysis found
//     (the time given is snapped to the nearest one within 80 ms), runs till its tail stays 30 dB under its loudest
//     (or the length given), fades out over its last quarter; its peak to −3 dB;
//   - a bed (the wheels rolling, a grind, a slide, the wheels spinning) as a seamless loop: its last `xf` seconds
//     crossfaded (equal power) into its head, written padded on both sides with the loop's own wrap (0.1 s), so its
//     loop points (`loop` in the manifest) stay seamless whether or not the decoder trims the mp3's delay; its RMS to
//     −20 dB (peak at most −1 dB);
//   - a reuse: no file — another slot's pick played pitched (`rate`) and filtered (`lp`/`hp`), where no recording
//     exists for that surface.
// Its sources: Freesound's HQ previews (CC0, or CC BY 4.0 where the entry says so — each read off its own page),
// fetched on the user's OK (2026-11-18) into <dir> as <id>_<user>.mp3; each candidate listed with its licence in
// public/sfx/skate/manifest.json, each file kept in public/sfx/CREDITS.md. The cuts are by measurement, picked by ear
// on /dev/skate-sound (chosen.json; −1 = the sound made in code).
//   node tools/sfx-skate.mjs <dir> apps/client/public/sfx/skate      cut every slot
//   node tools/sfx-skate.mjs --onsets <file> [from] [to]              a recording's transients (time, peak, tail)
//   node tools/sfx-skate.mjs --level <file> [from] [len]              a stretch's RMS by the half second
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SR = 44100;
const BIG = 1 << 30;

/** A stretch of a recording as mono floats at 44.1 kHz (an ffmpeg filter first, if given). */
function decode(file, from = 0, len = 0, af = "") {
  const args = ["-v", "error", "-ss", String(from)];
  if (len > 0) args.push("-t", String(len));
  args.push("-i", file, "-ac", "1", "-ar", String(SR));
  if (af) args.push("-af", af);
  args.push("-f", "f32le", "-");
  const b = execFileSync("ffmpeg", args, { maxBuffer: BIG });
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength >> 2).slice();
}

/** Floats to an mp3 (mono, 80 kb/s), through a wav. */
function encode(pcm, out) {
  const tmp = `${out}.tmp.wav`;
  const n = pcm.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2);
  writeFileSync(tmp, buf);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-ac", "1", "-b:a", "80k", out]);
  rmSync(tmp);
}

const db = (x) => 20 * Math.log10(Math.max(1e-9, x));
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

/** The transients: where the 5 ms energy jumps over 4× its last 50 ms (and within 30 dB of the loudest), 60 ms
 *  apart at least. Each: its time, its peak, how long till it falls 24 dB under it, its brightness (zero crossings a
 *  second over its first 30 ms). */
function onsets(p) {
  const hop = 220;
  const n = Math.floor(p.length / hop);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) e[i] = rmsOf(p, i * hop, (i + 1) * hop);
  const top = Math.max(...e);
  const out = [];
  let last = -BIG;
  for (let i = 10; i < n; i++) {
    let m = 0;
    for (let j = i - 10; j < i - 1; j++) m += e[j];
    m /= 9;
    if (e[i] > 4 * m + 1e-4 && e[i] > top * 0.03 && i - last > 12) {
      // (the frame's own loudest rise)
      let k = i;
      while (k + 1 < n && e[k + 1] > e[k]) k++;
      const at = i * hop;
      const pk = peakOf(p, at, Math.min(p.length, at + 0.04 * SR));
      let tail = k;
      while (tail < n && e[tail] > e[k] * 0.063) tail++;
      let zc = 0;
      const z1 = Math.min(p.length, at + 0.03 * SR);
      for (let j = at + 1; j < z1; j++) if (p[j - 1] < 0 !== p[j] < 0) zc++;
      // (how much of its first 80 ms is under ~150 Hz: a boom's, a thud's)
      const z2 = Math.min(p.length, at + 0.08 * SR);
      let lp = 0;
      let lo = 0;
      let all = 0;
      const a1 = Math.exp((-2 * Math.PI * 150) / SR);
      for (let j = at; j < z2; j++) {
        lp = (1 - a1) * p[j] + a1 * lp;
        lo += lp * lp;
        all += p[j] * p[j];
      }
      out.push({
        t: at / SR,
        peak: db(pk),
        tail: ((tail - i) * hop) / SR,
        zc: Math.round(zc / 0.03),
        lo: Math.round(10 * Math.log10(Math.max(1e-9, lo / Math.max(1e-12, all)))),
      });
      last = i;
    }
  }
  return out;
}

/** A shot: from just before the onset nearest `at`, till its tail dies (`len` at most), faded out, peak −3 dB. */
function shot(file, at, len, af, keep = false) {
  const from = Math.max(0, at - 0.12);
  const p = decode(file, from, 0.12 + len + 0.2, af);
  const os = onsets(p).filter((o) => Math.abs(o.t - (at - from)) < 0.08);
  const o = os.sort((a, b) => Math.abs(a.t - (at - from)) - Math.abs(b.t - (at - from)))[0];
  const t0 = Math.max(0, Math.round(((o ? o.t : at - from) - 0.006) * SR));
  let cut = p.slice(t0, t0 + Math.round(len * SR));
  // (its tail: till the 10 ms RMS stays 30 dB under its loudest 10 ms for 40 ms, 150 ms at least)
  const w = 441;
  let top = 0;
  for (let i = 0; i + w < cut.length; i += w) top = Math.max(top, rmsOf(cut, i, i + w));
  let end = cut.length;
  let under = 0;
  for (let i = 0; !keep && i + w < cut.length; i += w) {
    under = rmsOf(cut, i, i + w) < top * 0.0316 ? under + 1 : 0;
    if (under >= 4 && i + w >= 0.15 * SR) {
      end = i + w;
      break;
    }
  }
  cut = cut.slice(0, end);
  const fi = Math.round(0.002 * SR);
  const fo = Math.round(cut.length * 0.25);
  for (let i = 0; i < fi; i++) cut[i] *= i / fi;
  for (let i = 0; i < fo; i++) cut[cut.length - 1 - i] *= (i / fo) ** 1.5;
  const g = 10 ** (-3 / 20) / Math.max(1e-6, peakOf(cut));
  for (let i = 0; i < cut.length; i++) cut[i] *= g;
  return { pcm: cut, onset: o ? Math.round((from + o.t) * 1000) / 1000 : null };
}

const PAD = 0.1;
/** A bed: `len` s from `from` looped seamlessly (its next `xf` s crossfaded into its head), padded with its own wrap;
 *  RMS −20 dB, peak ≤ −1 dB. Returns the floats and its loop points (s). */
function bed(file, from, len, xf, af) {
  const s = decode(file, from, len + xf, af);
  const L = Math.round(len * SR);
  const X = Math.min(Math.round(xf * SR), s.length - L);
  if (X < 0) throw new Error(`${file}: too short for a ${len} s loop at ${from}`);
  const loop = s.slice(0, L);
  for (let i = 0; i < X; i++) {
    const k = ((i / X) * Math.PI) / 2;
    loop[i] = s[i] * Math.sin(k) + s[L + i] * Math.cos(k);
  }
  const g = Math.min(10 ** (-20 / 20) / Math.max(1e-6, rmsOf(loop)), 10 ** (-1 / 20) / Math.max(1e-6, peakOf(loop)));
  for (let i = 0; i < L; i++) loop[i] *= g;
  const P = Math.round(PAD * SR);
  const out = new Float32Array(L + 2 * P);
  for (let i = 0; i < out.length; i++) out[i] = loop[(((i - P) % L) + L) % L];
  return { pcm: out, loop: [P / SR, (P + L) / SR] };
}

// ── the analysis modes ──
const argv = process.argv.slice(2);
if (argv[0] === "--onsets") {
  const [, f, a = "0", b = "0"] = argv;
  const from = Number(a);
  const p = decode(f, from, Number(b) > 0 ? Number(b) - from : 0);
  console.log(`${f}: ${(p.length / SR).toFixed(2)} s, peak ${db(peakOf(p)).toFixed(1)} dB`);
  for (const o of onsets(p))
    console.log(
      `  ${(from + o.t).toFixed(3)}  ${o.peak.toFixed(1)} dB  tail ${o.tail.toFixed(2)} s  zc ${String(o.zc).padStart(5)}  lo ${o.lo} dB`,
    );
  process.exit(0);
}
if (argv[0] === "--sustain") {
  // the stretches a bed could loop: its 50 ms RMS held within `range` dB of the stretch's loudest, `min` s at least
  const [, f, a = "0", b = "0", mn = "0.8", rg = "12"] = argv;
  const from = Number(a);
  const p = decode(f, from, Number(b) > 0 ? Number(b) - from : 0);
  const w = Math.round(0.05 * SR);
  const e = [];
  for (let i = 0; i + w <= p.length; i += w) e.push(db(rmsOf(p, i, i + w)));
  const top = Math.max(...e);
  let i = 0;
  while (i < e.length) {
    if (e[i] < top - 30) {
      i++;
      continue;
    }
    let j = i;
    let hi = e[i];
    let lo = e[i];
    while (j + 1 < e.length && Math.max(hi, e[j + 1]) - Math.min(lo, e[j + 1]) <= Number(rg) && e[j + 1] > top - 30) {
      j++;
      hi = Math.max(hi, e[j]);
      lo = Math.min(lo, e[j]);
    }
    const len = (j - i + 1) * 0.05;
    if (len >= Number(mn))
      console.log(`  ${(from + i * 0.05).toFixed(2)} +${len.toFixed(2)} s  ${lo.toFixed(0)}…${hi.toFixed(0)} dB`);
    i = j + 1;
  }
  process.exit(0);
}
if (argv[0] === "--level") {
  const [, f, a = "0", b = "0"] = argv;
  const p = decode(f, Number(a), Number(b));
  const w = SR / 2;
  const row = [];
  for (let i = 0; i + w <= p.length; i += w) row.push(db(rmsOf(p, i, i + w)).toFixed(0));
  console.log(`${f} from ${a}: ${(p.length / SR).toFixed(1)} s; RMS by 0.5 s: ${row.join(" ")}`);
  process.exit(0);
}

// ── the sources (each licence read off its own Freesound page, 2026-11-18) ──
const FS = (id, uid, title, author, license = "CC0 1.0") => ({
  file: `${id}_${uid}.mp3`,
  title,
  author,
  source: `https://freesound.org/s/${id}/`,
  license,
});
const S = {
  s262083: FS(262083, 4883517, "Skateboard Rolling in Pool.wav", "rokenjocu"),
  s348329: FS(348329, 6362497, "Skate.wav", "BlackNeon1234"),
  s250384: FS(250384, 4587471, "Skateboard.wav", "lostphosphene", "CC BY 4.0"),
  s727643: FS(727643, 13355471, "Rolling Wheels 2", "CJspellsfish"),
  s196702: FS(196702, 1138806, "Skateboard Drive And Wooden Ramp.wav", "tjandrasounds"),
  s346380: FS(346380, 2416529, "Skateboarding Indoors", "neotronable"),
  s836284: FS(836284, 11519060, "skate board rolling", "bruno.auzet"),
  s478165: FS(478165, 2554042, "BPS-SKATEBOARDING RIDING-City Street-Pushing-Fast-Long Strides-1.wav", "bspiller5"),
  s398883: FS(398883, 3053145, "skateboard_ride.wav", "PHetish"),
  s655371: FS(655371, 13723333, "skateboard grinding on metal rail.wav", "21100495"),
  s348326: FS(348326, 6362497, "Skateboard_Grinds.wav", "BlackNeon1234"),
  s262085: FS(262085, 4883517, "Skateboard Metal Grinding.wav", "rokenjocu"),
  s845524: FS(845524, 8956746, "Skateboarding Rail Slide", "C-V"),
  s478166: FS(478166, 2554042, "BPS-SKATEBOARDING GRINDS-Concrete Halfpipe-Truck Grinds.wav", "bspiller5"),
  s655372: FS(655372, 13723333, "skateboard grinding on concreate slab.wav", "21100495"),
  s478164: FS(478164, 2554042, "BPS-SKATEBOARDING GRINDS-Slides-Concrete Ledge-Multiple Lands-1.wav", "bspiller5"),
  s105081: FS(105081, 537412, "Skateboard_Skate_schlittert.wav", "mbezzola"),
  s515229: FS(515229, 11123146, "skateboard ollie", "nolimitkid"),
  s105076: FS(105076, 537412, "Skateboard_Ollie_Pop_Shove-It.wav", "mbezzola"),
  s746602: FS(746602, 15857333, "Skateboarding Tricks", "SoundBiterSFX", "CC BY 4.0"),
  s515230: FS(515230, 11123146, "skateboard kickflip", "nolimitkid"),
  s348321: FS(348321, 6362497, "Ollie.wav", "BlackNeon1234"),
  s766416: FS(766416, 15764407, "Skateboard Trick", "DariusOW"),
  s540777: FS(540777, 10869493, "Skateboard ride ollie then stop lift board.wav", "visionear"),
  s568406: FS(568406, 3248005, "Skateboard Ollie Interior 1 (1)", "Sheyvan"),
  s630645: FS(630645, 13757871, "skateboard1.wav", "Rbrtbiehl"),
  s105073: FS(105073, 537412, "Skateboard_Heel_Flip.wav", "mbezzola"),
  s435213: FS(435213, 109726, "Skateboard ramp sounds.wav", "mikewest"),
  s630642: FS(630642, 13757871, "skateboard4.wav", "Rbrtbiehl"),
  s243766: FS(243766, 3557375, "Skateboard hitting metal rail.wav", "Bruno_Garcez"),
  s464120: FS(464120, 9754227, "Hitting wood against floor", "takeabeat"),
  s464122: FS(464122, 9754227, "Knocking on wood", "takeabeat"),
  s348317: FS(348317, 6362497, "Drive over Border.wav", "BlackNeon1234"),
  s717547: FS(717547, 14674536, "SPRTSkate_Drop-skateboard-ground-concrete_01", "nico-audio"),
  s153285: FS(153285, 2358240, "Longboard hitting the ground", "gerardcatala"),
  s581378: FS(581378, 6966770, "Powerslide", "jarrondesnudo"),
  s581379: FS(581379, 6966770, "powerslide (2).", "jarrondesnudo"),
  s581380: FS(581380, 6966770, "powerslide 3", "jarrondesnudo"),
  s154855: FS(154855, 2592501, "skate board screech.wav", "pawsound"),
  s765875: FS(765875, 15688680, "Skating", "MattyCauldron"),
  s669937: FS(669937, 14631530, "Skateboard crash.ogg", "FOSSarts"),
  s669936: FS(669936, 14631530, "skateboard pennyboard crashing.ogg", "FOSSarts"),
  s692069: FS(692069, 15046244, "Skateboard wheel spinning - Long, Free", "Wastefield"),
  s515228: FS(515228, 11123146, "skateboard wheels spinning", "nolimitkid"),
  s740131: FS(740131, 14631530, "skateboard wheel spinning 4", "FOSSarts"),
  s452874: FS(452874, 9101469, "SkateWheels.WAV", "jrsevers3"),
  s464125: FS(464125, 9754227, "Stomping on wood", "takeabeat"),
  s464118: FS(464118, 9754227, "Dropping", "takeabeat"),
  s740121: FS(740121, 14631530, "skateboard drop 1", "FOSSarts"),
};

// ── the slots: "<slot>.<surface>" (the eleven) and the board's own; each a list of candidates ──
//   shot(name, source, [at…], len, { keep: the whole length, its tail not trimmed })  ·  bed(name, source, from, len, { xf, pitch })  ·  reuse(name, slot, { rate, lp, hp, gain })
const shotC = (name, s, at, len = 0.45, o = {}) => ({ kind: "shot", name, s, at, len, ...o });
const bedC = (name, s, from, len, o = {}) => ({ kind: "bed", name, s, from, len, ...o });
const reuse = (name, slot, o = {}) => ({ kind: "reuse", name, slot, ...o });
// (where no recording exists for a surface: a reuse of another's, pitched and filtered — said so in its name)
const SLOTS = {
  // ── the wheels rolling (beds) ──
  "roll.concrete": [
    bedC("Round a concrete pool (rokenjocu)", S.s262083, 2.9, 3),
    bedC("Riding around (BlackNeon1234)", S.s348329, 23.6, 3.5),
    bedC("On concrete (lostphosphene)", S.s250384, 6.5, 2.8),
  ],
  "roll.wood": [
    bedC("On a wood floor (CJspellsfish)", S.s727643, 0.1, 2.8, { xf: 0.25 }),
    bedC("A skate hall (tjandrasounds)", S.s196702, 1.9, 1.9, { xf: 0.25 }),
    bedC("Indoors (neotronable)", S.s346380, 0.3, 2, { xf: 0.25 }),
    reuse("No recording: concrete's, lower and duller", "roll.concrete", { rate: 0.85, lp: 2200 }),
  ],
  "roll.metal": [
    reuse("No recording: wood's, brighter and thinner (a steel plate)", "roll.wood", { rate: 1.15, hp: 350 }),
    reuse("No recording: concrete's, brighter", "roll.concrete", { rate: 1.2, hp: 500 }),
  ],
  "roll.asphalt": [
    bedC("A road, close up (bruno.auzet)", S.s836284, 111, 4),
    bedC("A city street, fast (bspiller5)", S.s478165, 16.3, 4),
    bedC("Paving stones (PHetish)", S.s398883, 16, 3),
  ],
  // ── a grind (beds) ──
  "grind.metal": [
    bedC("Trucks on a rail (21100495)", S.s655371, 10.4, 0.65, { xf: 0.12 }),
    bedC("On a metal rail (BlackNeon1234)", S.s348326, 8.9, 1.5, { xf: 0.15 }),
    bedC("Metal grinding (rokenjocu)", S.s262085, 1.0, 0.9, { xf: 0.15 }),
    bedC("A street rail (C-V)", S.s845524, 2.9, 0.7, { xf: 0.12 }),
  ],
  "grind.concrete": [
    bedC("Trucks on a halfpipe's lip (bspiller5)", S.s478166, 3.0, 1, { xf: 0.15 }),
    bedC("Trucks on a halfpipe's lip, a second (bspiller5)", S.s478166, 0.25, 0.9, { xf: 0.15 }),
  ],
  "grind.wood": [
    reuse("No recording: concrete's, duller (a wooden ledge)", "grind.concrete", { rate: 0.9, lp: 2500 }),
    reuse("No recording: the rail's, low and dull", "grind.metal", { rate: 0.8, lp: 1800 }),
  ],
  "grind.asphalt": [reuse("No recording: concrete's (a kerb)", "grind.concrete", { rate: 0.95 })],
  // ── the pop ──
  "jump.concrete": [
    shotC("An ollie (nolimitkid)", S.s515229, [0.479], 0.3),
    shotC("A pop (mbezzola)", S.s105076, [0.309], 0.3),
    shotC("Tricks' pops (SoundBiterSFX)", S.s746602, [0.424, 3.293, 6.126], 0.3),
    shotC("A kickflip's pop (nolimitkid)", S.s515230, [0.429], 0.3),
  ],
  "jump.asphalt": [
    shotC("Street ollies (BlackNeon1234)", S.s348321, [1.477, 3.542, 5.448], 0.3),
    shotC("A parking lot (DariusOW)", S.s766416, [0.399], 0.25),
    shotC("A street ollie (visionear)", S.s540777, [10.945], 0.3),
    reuse("No recording: concrete's", "jump.concrete", { rate: 0.97 }),
  ],
  "jump.wood": [
    shotC("Indoors (Sheyvan)", S.s568406, [0.339], 0.35),
    shotC("A warehouse park (Rbrtbiehl)", S.s630645, [0.484], 0.3),
    reuse("No recording: concrete's, duller", "jump.concrete", { rate: 0.92, lp: 3500 }),
  ],
  "jump.metal": [
    reuse("No recording: concrete's, brighter (off a steel plate)", "jump.concrete", { rate: 1.05, hp: 400 }),
  ],
  // ── the landing ──
  "land.concrete": [
    shotC("An ollie's landing (nolimitkid)", S.s515229, [0.788], 0.4),
    shotC("Tricks' landings (SoundBiterSFX)", S.s746602, [0.883, 3.861, 6.44], 0.4),
    shotC("A heelflip's landing (mbezzola)", S.s105073, [2.539], 0.4),
  ],
  "land.asphalt": [
    shotC("Street landings (BlackNeon1234)", S.s348321, [1.576, 5.722], 0.4),
    shotC("A parking lot (DariusOW)", S.s766416, [0.649], 0.4),
    shotC("A street landing (visionear)", S.s540777, [12.008], 0.4),
  ],
  "land.wood": [
    shotC("Under a ramp (mikewest)", S.s435213, [14.115, 19.149, 20.321], 0.5),
    shotC("A wooden ramp (tjandrasounds)", S.s196702, [12.376, 15.658], 0.5),
    shotC("A warehouse park (Rbrtbiehl)", S.s630645, [0.833], 0.4),
    shotC("A warehouse park, more (Rbrtbiehl)", S.s630642, [5.647, 6.111], 0.4),
  ],
  "land.metal": [
    shotC("A board on a metal rail (Bruno_Garcez)", S.s243766, [0.389, 2.15, 3.916], 0.5),
    reuse("No recording: concrete's, brighter", "land.concrete", { rate: 1.08, hp: 400 }),
  ],
  // ── a bonk: a knock into something ──
  "bonk.metal": [
    shotC("A board hitting a rail (Bruno_Garcez)", S.s243766, [0.958, 2.834, 4.555], 0.6),
    shotC("A street rail (C-V)", S.s845524, [3.632], 0.5),
  ],
  "bonk.wood": [
    shotC("A board against the floor (takeabeat)", S.s464120, [0.369, 1.556, 2.749], 0.4),
    shotC("Knocking on a deck (takeabeat)", S.s464122, [0.264, 0.773, 1.292], 0.25),
  ],
  "bonk.concrete": [
    shotC("Over a kerb (BlackNeon1234)", S.s348317, [2.938, 5.617], 0.4),
    shotC("A board hitting the ground (gerardcatala)", S.s153285, [0.928], 0.5),
    shotC("A board dropped on concrete (nico-audio)", S.s717547, [1.202], 0.4),
  ],
  "bonk.asphalt": [
    shotC("Over a border (BlackNeon1234)", S.s348317, [3.213, 6.021], 0.4),
    reuse("No recording: concrete's", "bonk.concrete", { rate: 0.95 }),
  ],
  // ── off a grind, onto one ──
  "grind-jump.metal": [
    shotC("Off the rail (21100495)", S.s655371, [4.265, 7.214, 10.586], 0.35),
    reuse("No recording: concrete's pop, brighter", "jump.concrete", { rate: 1.05, hp: 500 }),
  ],
  "grind-jump.concrete": [
    shotC("Off the lip (bspiller5)", S.s478166, [1.776, 4.575, 6.884], 0.35),
    reuse("No recording: concrete's pop", "jump.concrete"),
  ],
  "grind-jump.wood": [
    reuse("No recording: concrete's off the lip, duller", "grind-jump.concrete", { rate: 0.9, lp: 3000 }),
  ],
  "grind-jump.asphalt": [reuse("No recording: concrete's off the lip", "grind-jump.concrete")],
  "grind-land.metal": [
    shotC("Onto the rail (21100495)", S.s655371, [0.419, 12.093, 14.502], 0.4),
    shotC("Onto a street rail (C-V)", S.s845524, [2.609, 7.867], 0.4),
    shotC("A board on a rail (Bruno_Garcez)", S.s243766, [6.246], 0.45),
  ],
  "grind-land.concrete": [
    shotC("Onto the lip (bspiller5)", S.s478166, [0.16, 5.258], 0.4),
    reuse("No recording: the rail's, duller", "grind-land.metal", { rate: 0.85, lp: 2500 }),
  ],
  "grind-land.wood": [reuse("No recording: concrete's, duller", "grind-land.concrete", { rate: 0.9, lp: 2500 })],
  "grind-land.asphalt": [reuse("No recording: concrete's (a kerb)", "grind-land.concrete")],
  // ── a slide: board, lip, tail (beds) ──
  "slide.concrete": [
    bedC("A tail on a concrete slab (21100495)", S.s655372, 19.75, 1.9, { xf: 0.2 }),
    bedC("A tail on a concrete slab, short (21100495)", S.s655372, 3.75, 0.9, { xf: 0.15 }),
    bedC("A ledge slide (bspiller5)", S.s478164, 1.6, 0.55, { xf: 0.1 }),
    bedC("A board sliding (mbezzola)", S.s105081, 0, 1.4, { xf: 0.15 }),
  ],
  "slide.metal": [
    reuse("No recording: concrete's, brighter (a boardslide on a rail)", "slide.concrete", { rate: 1.15, hp: 600 }),
    reuse("No recording: the grind's, lower", "grind.metal", { rate: 0.85 }),
  ],
  "slide.wood": [reuse("No recording: concrete's, duller", "slide.concrete", { rate: 0.9, lp: 2500 })],
  "slide.asphalt": [reuse("No recording: concrete's", "slide.concrete", { rate: 0.95 })],
  "slide-jump.concrete": [
    shotC("Off a ledge (bspiller5)", S.s478164, [3.023, 8.321], 0.35),
    shotC("Off a slab (21100495)", S.s655372, [1.512, 10.142], 0.35),
  ],
  "slide-jump.metal": [reuse("No recording: off the rail's", "grind-jump.metal", { rate: 0.95 })],
  "slide-jump.wood": [reuse("No recording: concrete's, duller", "slide-jump.concrete", { rate: 0.9, lp: 3000 })],
  "slide-jump.asphalt": [reuse("No recording: concrete's", "slide-jump.concrete")],
  "slide-land.concrete": [
    shotC("Onto a slab (21100495)", S.s655372, [0.494, 3.367, 6.336], 0.4),
    shotC("Onto a ledge (bspiller5)", S.s478164, [2.519, 7.832], 0.4),
  ],
  "slide-land.metal": [
    reuse("No recording: onto the rail's", "grind-land.metal", { rate: 0.95 }),
    reuse("No recording: concrete's, brighter", "slide-land.concrete", { rate: 1.1, hp: 500 }),
  ],
  "slide-land.wood": [reuse("No recording: concrete's, duller", "slide-land.concrete", { rate: 0.9, lp: 3000 })],
  "slide-land.asphalt": [reuse("No recording: concrete's", "slide-land.concrete")],
  // ── the cess: a powerslide ──
  "cess.concrete": [
    shotC("A powerslide on polished concrete (jarrondesnudo)", S.s581378, [2.305, 5.178, 7.423], 0.9),
    shotC("A powerslide, two (jarrondesnudo)", S.s581379, [0.604, 5.158], 0.9),
    shotC("A powerslide, three (jarrondesnudo)", S.s581380, [1.761, 4.465], 0.9),
  ],
  "cess.asphalt": [
    shotC("A board's screech (pawsound)", S.s154855, [9.708, 5.797], 0.9, { keep: true }),
    reuse("No recording: concrete's, rougher", "cess.concrete", { rate: 0.92 }),
  ],
  "cess.wood": [reuse("No recording: concrete's, duller", "cess.concrete", { rate: 0.9, lp: 3000 })],
  "cess.metal": [reuse("No recording: concrete's, brighter", "cess.concrete", { rate: 1.1, hp: 600 })],
  // ── the board's own ──
  push: [shotC("A push down the road (MattyCauldron)", S.s765875, [4.27, 7.737, 11.429], 0.45)],
  bail: [
    shotC("A crash, the wheels spinning on (FOSSarts)", S.s669937, [0.449], 1.4, { keep: true }),
    shotC("A board into the pavement (FOSSarts)", S.s669936, [0.748], 0.9, { keep: true }),
    shotC("A board hitting the ground (gerardcatala)", S.s153285, [0.928], 0.8, { keep: true }),
  ],
  spin: [
    bedC("A wheel spinning free (Wastefield)", S.s692069, 1.0, 3, { xf: 0.3 }),
    bedC("The wheels spinning (nolimitkid)", S.s515228, 0.3, 3, { xf: 0.3 }),
    bedC("A cruiser's wheel (FOSSarts)", S.s740131, 0.1, 1.5, { xf: 0.2 }),
    bedC("The wheels spun (jrsevers3)", S.s452874, 6.3, 2.8, { xf: 0.3 }),
  ],
  kickup: [
    shotC("A tail kicked up to the hand (visionear)", S.s540777, [12.958], 0.7),
    reuse("No recording: concrete's pop, light", "jump.concrete", { rate: 1.15, gain: 0.6 }),
  ],
  boom: [
    shotC("Under a ramp (mikewest)", S.s435213, [12.903, 15.158], 0.8),
    shotC("Stomping on a board on the floor (takeabeat)", S.s464125, [0.454, 0.913], 0.4),
    shotC("A board dropped on a floor (takeabeat)", S.s464118, [1.053, 3.352], 0.5),
  ],
  on: [
    shotC("A board dropped on concrete (nico-audio)", S.s717547, [0.055], 0.5),
    shotC("A board dropped onto its wheels (FOSSarts)", S.s740121, [0.229], 0.5),
  ],
};

// ── cut ──
const [src, out] = argv;
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith(".mp3")) rmSync(join(out, f));
const manifest = {
  _: "The skate's recordings (docs/plan/104 F12a — Tony Hawk's model: eleven slots a surface and the board's own): each slot's candidates; the game plays chosen.json's pick of each (-1: the sound made in code). A shot cut at its transient (peak −3 dB); a bed a seamless loop between `loop`'s points (RMS −20 dB); a reuse another slot's pick, pitched and filtered. tools/sfx-skate.mjs.",
};
let bytes = 0;
for (const [slot, cands] of Object.entries(SLOTS)) {
  manifest[slot] = cands.map((c, ci) => {
    if (c.kind === "reuse") {
      const { kind: _k, name, slot: from, ...o } = c;
      return { name, reuse: from, ...o };
    }
    const base = `${slot.replace(".", "-")}-${String.fromCharCode(97 + ci)}`;
    const meta = { title: c.s.title, author: c.s.author, source: c.s.source, license: c.s.license };
    if (c.kind === "bed") {
      const b = bed(join(src, c.s.file), c.from, c.len, c.xf ?? 0.3, c.af ?? "");
      encode(b.pcm, join(out, `${base}.mp3`));
      bytes += statSync(join(out, `${base}.mp3`)).size;
      return {
        name: c.name,
        files: [`${base}.mp3`],
        loop: b.loop.map((x) => Math.round(x * 1e4) / 1e4),
        ...(c.pitch ? { pitch: c.pitch } : {}),
        ...meta,
      };
    }
    const files = c.at.map((at, k) => {
      const f = `${base}${c.at.length > 1 ? k + 1 : ""}.mp3`;
      const sh = shot(join(src, c.s.file), at, c.len, c.af ?? "", !!c.keep);
      if (sh.onset === null) console.warn(`  (${slot} ${c.name}: no onset near ${at} s — cut as given)`);
      encode(sh.pcm, join(out, f));
      bytes += statSync(join(out, f)).size;
      return f;
    });
    return { name: c.name, files, ...meta };
  });
}
writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
// (the picks: the first of each — the user's to change on /dev/skate-sound)
const chosen = Object.fromEntries(Object.keys(SLOTS).map((k) => [k, 0]));
writeFileSync(join(out, "chosen.json"), `${JSON.stringify(chosen, null, 1)}\n`);
const n = Object.values(SLOTS).reduce((a, c) => a + c.length, 0);
console.log(`${Object.keys(SLOTS).length} slots, ${n} candidates, ${(bytes / 1024).toFixed(0)} KB of mp3`);
