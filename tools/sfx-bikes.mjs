// (plan 101 phase 8) The bikes' recordings cut and levelled into apps/client/public/sfx/bikes: a shot's peak to −3 dB, a
// bed's mean to −20 dB, mono 80 kb/s. Its sources, fetched by hand (each listed with its licence in
// public/sfx/bikes/manifest.json and public/sfx/CREDITS.md) into <dir>/raw (Freesound's HQ previews: 405572, 484344,
// 74792, 719482 as <id>_<user>.mp3) and <dir>/oga (OpenGameArt's bicycle_sounds.zip's wavs):
//   node tools/sfx-bikes.mjs <dir> apps/client/public/sfx/bikes
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [src, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const cuts = [
  // [file in src, from s, length s, out name, kind]
  ["raw/405572_5197114.mp3", 2.35, 2.2, "bell-a1", "shot"],
  ["raw/405572_5197114.mp3", 5.4, 2.2, "bell-a2", "shot"],
  ["raw/405572_5197114.mp3", 9.05, 2.2, "bell-a3", "shot"],
  ["raw/405572_5197114.mp3", 13.3, 2.2, "bell-a4", "shot"],
  ["raw/405572_5197114.mp3", 17.9, 2.2, "bell-a5", "shot"],
  ["raw/484344_5121236.mp3", 0, 1.8, "bell-b1", "shot"],
  ["oga/rotating_bicycle_bell-1.wav", 0, 1.35, "bell-c1", "shot"],
  ["oga/bicycle_horn-1.wav", 0, 0.71, "bell-d1", "shot"],
  ["raw/74792_7037.mp3", 2.0, 4.0, "freewheel-a", "bed"],
  ["raw/74792_7037.mp3", 20.0, 5.0, "freewheel-b", "bed"],
  ["oga/bicycle_spokes-1.wav", 0, 1.16, "freewheel-c", "bed"],
  ["raw/719482_4921277.mp3", 4.0, 8.0, "ride-a", "bed"],
  ["raw/719482_4921277.mp3", 24.6, 2.4, "brake-a1", "shot"],
];
const level = (f) => {
  const r = execFileSync("ffmpeg", ["-v", "info", "-i", f, "-af", "volumedetect", "-f", "null", "-"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  return r.toString();
};
for (const [file, from, len, name, kind] of cuts) {
  const inF = join(src, file);
  const tmp = join(out, `${name}.tmp.wav`);
  const fadeOut = kind === "shot" ? Math.min(0.4, len * 0.3) : 0.03;
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-ss",
    String(from),
    "-t",
    String(len),
    "-i",
    inF,
    "-ac",
    "1",
    "-ar",
    "44100",
    "-af",
    `afade=t=in:d=0.004,afade=t=out:st=${(len - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`,
    tmp,
  ]);
  // (its level: a shot's peak to −3 dB, a bed's mean to −20 dB)
  const st = execFileSync("ffmpeg", ["-hide_banner", "-i", tmp, "-af", "volumedetect", "-f", "null", "-"], {
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
  });
  void st;
  let info = "";
  try {
    execFileSync("ffmpeg", ["-hide_banner", "-i", tmp, "-af", "volumedetect", "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch {}
  const r = (() => {
    try {
      return execFileSync("sh", ["-c", `ffmpeg -hide_banner -i "${tmp}" -af volumedetect -f null - 2>&1`], {
        encoding: "utf8",
      });
    } catch (e) {
      return String(e.stdout ?? "");
    }
  })();
  info = r;
  const max = Number(/max_volume: (-?[\d.]+) dB/.exec(info)?.[1] ?? 0);
  const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(info)?.[1] ?? -20);
  const gain = kind === "shot" ? -3 - max : Math.min(-1 - max, -20 - mean);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    tmp,
    "-af",
    `volume=${gain.toFixed(2)}dB`,
    "-b:a",
    "80k",
    join(out, `${name}.mp3`),
  ]);
  execFileSync("rm", [tmp]);
  console.log(name, `peak ${max} mean ${mean} gain ${gain.toFixed(1)}`);
}
