// (plan 103 phase 7) The skate's recordings cut and levelled into apps/client/public/sfx/skate: a shot's peak to −3 dB, a
// bed's mean to −20 dB, mono 80 kb/s. Its sources: Freesound's HQ previews, fetched on the user's OK (2026-11-18) into
// <dir> as <id>_<user>.mp3, each listed with its licence in public/sfx/skate/manifest.json and public/sfx/CREDITS.md.
// The cuts are by measurement (each recording's transients: a pop, then its landing), not by ear — picked by ear later.
//   node tools/sfx-skate.mjs <dir> apps/client/public/sfx/skate
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [src, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const FS = (id, user, title, author, license = "CC0 1.0") => ({
  file: `${id}_${user}.mp3`,
  title,
  author,
  source: `https://freesound.org/s/${id}/`,
  license,
});
const S = {
  nolimit: FS(515229, 11123146, "skateboard ollie", "nolimitkid"),
  neon: FS(348321, 6362497, "Ollie.wav", "BlackNeon1234"),
  biter: FS(746602, 15857333, "Skateboarding Tricks", "SoundBiterSFX", "CC BY 4.0"),
  rail: FS(655371, 13723333, "skateboard grinding on metal rail.wav", "21100495"),
  ramp: FS(243765, 3557375, "Skateboard rolling down concrete ramp.wav", "Bruno_Garcez"),
  drive: FS(521086, 11206605, "Skateboard", "zvance1110"),
  tile: FS(593494, 12595642, "Wheels rolling.wav", "Scottrex05"),
  pool: FS(262083, 4883517, "Skateboard Rolling in Pool.wav", "rokenjocu"),
  slide: FS(105081, 537412, "Skateboard_Skate_schlittert.wav", "mbezzola"),
  slide1: FS(105082, 537412, "Skateboard_Slide_I.wav", "mbezzola"),
};
// slot → candidates: [name, source, kind, [from, length][], rate (a bed's: the speed it sounds like, m/s)]
const SLOTS = {
  pop: [
    ["An ollie's pop (nolimitkid)", S.nolimit, "shot", [[0, 0.32]]],
    [
      "Ollies' pops (BlackNeon1234)",
      S.neon,
      "shot",
      [
        [1.46, 0.32],
        [3.5, 0.32],
        [5.4, 0.3],
      ],
    ],
    [
      "Tricks' pops (SoundBiterSFX)",
      S.biter,
      "shot",
      [
        [0.38, 0.3],
        [3.26, 0.3],
        [6.08, 0.3],
      ],
    ],
  ],
  land: [
    ["An ollie's landing (nolimitkid)", S.nolimit, "shot", [[0.47, 0.42]]],
    ["A landing (BlackNeon1234)", S.neon, "shot", [[5.68, 0.42]]],
    [
      "Tricks' landings (SoundBiterSFX)",
      S.biter,
      "shot",
      [
        [3.82, 0.42],
        [6.4, 0.42],
        [21.2, 0.42],
      ],
    ],
  ],
  roll: [
    ["Down a concrete ramp (Bruno_Garcez)", S.ramp, "bed", [[3, 8]], 6],
    ["An old board on a driveway (zvance1110)", S.drive, "bed", [[3, 8]], 5],
    ["On tile (Scottrex05)", S.tile, "bed", [[1.5, 8]], 4],
  ],
  pool: [["Round a pool (rokenjocu)", S.pool, "bed", [[3, 9]], 6]],
  grind: [
    ["Trucks on a steel rail (21100495)", S.rail, "bed", [[0.6, 3.2]], 5],
    ["Trucks on a steel rail, a second (21100495)", S.rail, "bed", [[12.2, 2.1]], 5],
  ],
  slide: [
    ["A board sliding (mbezzola)", S.slide, "bed", [[0, 1.4]], 4],
    ["A short slide (mbezzola)", S.slide1, "shot", [[0, 0.6]]],
  ],
};

const volume = (f) => {
  let r = "";
  try {
    r = execFileSync("sh", ["-c", `ffmpeg -hide_banner -i "${f}" -af volumedetect -f null - 2>&1`], {
      encoding: "utf8",
    });
  } catch (e) {
    r = String(e.stdout ?? "");
  }
  return {
    max: Number(/max_volume: (-?[\d.]+) dB/.exec(r)?.[1] ?? 0),
    mean: Number(/mean_volume: (-?[\d.]+) dB/.exec(r)?.[1] ?? -20),
  };
};

const manifest = {
  _: "The skate's recordings (docs/plan/103 phase 7): each slot's candidates, their takes; the game plays chosen.json's pick of each (-1: the sound made in code). Cut by measurement from the HQ previews (a shot to −3 dB peak, a bed to −20 dB mean).",
};
for (const [slot, cands] of Object.entries(SLOTS)) {
  manifest[slot] = cands.map(([name, s, kind, cuts, rate], ci) => {
    const files = cuts.map(([from, len], k) => {
      const base = `${slot}-${String.fromCharCode(97 + ci)}${cuts.length > 1 ? k + 1 : ""}`;
      const tmp = join(out, `${base}.tmp.wav`);
      const fadeOut = kind === "shot" ? Math.min(0.12, len * 0.3) : 0.05;
      const fadeIn = kind === "shot" ? 0.003 : 0.05;
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-ss",
        String(from),
        "-t",
        String(len),
        "-i",
        join(src, s.file),
        "-ac",
        "1",
        "-ar",
        "44100",
        "-af",
        `afade=t=in:d=${fadeIn},afade=t=out:st=${(len - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`,
        tmp,
      ]);
      const v = volume(tmp);
      const gain = kind === "shot" ? -3 - v.max : Math.min(-1 - v.max, -20 - v.mean);
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        tmp,
        "-af",
        `volume=${gain.toFixed(2)}dB`,
        "-ac",
        "1",
        "-b:a",
        "80k",
        join(out, `${base}.mp3`),
      ]);
      rmSync(tmp);
      return `${base}.mp3`;
    });
    return {
      name,
      files,
      ...(rate ? { rate } : {}),
      title: s.title,
      author: s.author,
      source: s.source,
      license: s.license,
    };
  });
}
writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
// the picks: the first of each (mine, F14b — yours to change)
const chosen = Object.fromEntries(Object.keys(SLOTS).map((k) => [k, 0]));
writeFileSync(join(out, "chosen.json"), `${JSON.stringify(chosen, null, 1)}\n`);
console.log(
  Object.entries(manifest)
    .filter(([k]) => k !== "_")
    .map(([k, v]) => `${k}: ${v.length}`)
    .join(", "),
);
