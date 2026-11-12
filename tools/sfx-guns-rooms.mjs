// The guns' shots in a room, made (docs/plan/79-the-guns.md phase 9): where nothing recorded indoors
// is good enough, the slot's outdoor shots (its `near` slot's candidates, their first take each) through
// a real room's impulse response (the slot's `ir` in tools/sfx-guns.json: a CC0 recording of how that room
// rings), some of the dry shot kept for its punch — added to the slot's candidates in
// public/sfx/guns/manifest.json as `<slot>-m<n>.mp3`. Run after tools/sfx-weather.mjs (it rewrites the
// slot's list):
//   SLOT=shotgun-in node tools/sfx-guns-rooms.mjs [cache dir]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const DIR = join(ROOT, "apps/client/public/sfx/guns");
const slot = process.env.SLOT ?? "shotgun-in";
const near = slot.replace(/-in$/, "-near");
const cache = process.argv[2] ?? join(tmpdir(), "yutopia-sfx-weather");
const list = JSON.parse(readFileSync(join(ROOT, "tools/sfx-guns.json"), "utf8"));
const ir = list[slot]?.ir;
if (!ir) throw new Error(`${slot}: no ir in tools/sfx-guns.json`);
const irFile = join(cache, `${ir.id}.mp3`);
if (!existsSync(irFile) || statSync(irFile).size < 1000) execFileSync("curl", ["-s", "-f", "-o", irFile, ir.preview]);
const manFile = join(DIR, "manifest.json");
const man = JSON.parse(readFileSync(manFile, "utf8"));
man[slot] = (man[slot] ?? []).filter((c) => !String(c.id).startsWith("made:"));
(man[near] ?? []).forEach((c, i) => {
  const dry = join(DIR, c.files[0]);
  const name = `${slot}-m${i + 1}.mp3`;
  // (the room's ring under the dry shot; then to −3 dB peak, as every take is)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    dry,
    "-i",
    irFile,
    "-filter_complex",
    "[1:a]aformat=channel_layouts=mono,atrim=0:2.5[ir];[0:a]aformat=channel_layouts=mono,apad=pad_dur=2.5[d];[d][ir]afir=dry=6:wet=4:length=1,atrim=0:3.2,afade=t=out:st=2.4:d=0.8,loudnorm=I=-14:TP=-3:LRA=11[o]",
    "-map",
    "[o]",
    "-ac",
    "1",
    "-b:a",
    "80k",
    join(DIR, name),
  ]);
  man[slot].push({
    id: `made:${c.id}`,
    user: `${c.user} · in ${ir.user}'s room`,
    title: `${c.title.slice(0, 18)} in a garage`,
    url: c.url,
    files: [name],
  });
  console.log(`${slot} m${i + 1}: ${c.title} in ${ir.title}`);
});
writeFileSync(manFile, `${JSON.stringify(man, null, 2)}\n`);
