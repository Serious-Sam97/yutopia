// The guns' sound candidates (docs/plan/79-the-guns.md phase 9): each slot's searches on Freesound —
// CC0 only, the most downloaded first — read from the search page (plain curl, 4 s apart: Freesound
// refuses a machine that asks fast, plan 63), the first few of a fitting length kept, written to
// tools/sfx-guns.json for tools/sfx-weather.mjs (LIST=tools/sfx-guns.json DIR=guns) to fetch and cut.
// A slot already in the json keeps its `pick`.
//   node tools/sfx-guns-search.mjs            every slot
//   ONLY=revolver-near,ak-near node tools/sfx-guns-search.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname;
const OUT = `${ROOT}tools/sfx-guns.json`;
const only = process.env.ONLY?.split(",");

// slot: [kind, [queries], [min s, max s], how many]
//   kind: shot (cut into its events by tools/sfx-weather.mjs), loop (a bed)
const SLOTS = {
  "revolver-near": ["shot", ["357 magnum gunshot", "revolver gunshot", "revolver shot outdoor"], [0.4, 20], 4],
  "revolver-in": [
    "shot",
    ["pistol shot indoor", "gunshot indoors room", "handgun shot inside", "gunshot room reverb"],
    [0.4, 20],
    4,
  ],
  "revolver-far": ["shot", ["distant gunshot", "gunshot far away", "distant pistol shots"], [0.5, 30], 4],
  "shotgun-near": ["shot", ["shotgun blast", "shotgun shot", "double barrel shotgun"], [0.4, 20], 4],
  "shotgun-in": [
    "shot",
    [
      "12 gauge shotgun indoor",
      "shotgun indoor range",
      "shotgun garage",
      "shotgun warehouse",
      "shotgun blast reverb",
      "12 gauge shot",
      "shotgun shot",
    ],
    [0.4, 20],
    8,
  ],
  "shotgun-far": ["shot", ["distant shotgun", "shotgun far away"], [0.5, 30], 4],
  "ak-near": [
    "shot",
    ["ak47 single shot", "ak-47 gunshot", "assault rifle single shot", "rifle shot 7.62"],
    [0.3, 20],
    4,
  ],
  "ak-in": [
    "shot",
    ["rifle shot indoor", "assault rifle indoors", "indoor shooting range rifle", "gunshot room reverb"],
    [0.3, 20],
    4,
  ],
  "ak-far": ["shot", ["distant rifle fire", "distant automatic gunfire", "distant rifle shots"], [0.5, 30], 4],
  "sniper-near": ["shot", ["sniper rifle shot", "bolt action rifle shot", "hunting rifle shot"], [0.4, 20], 4],
  "sniper-in": [
    "shot",
    ["rifle shot indoor", "large caliber rifle indoor", "indoor shooting range", "rifle gunshot reverb"],
    [0.4, 20],
    4,
  ],
  "sniper-far": ["shot", ["distant rifle shot", "far rifle shot echo", "distant hunting rifle"], [0.5, 30], 4],
  "daybreak-charge": ["shot", ["sci-fi charge up", "energy charge up", "laser charging"], [0.6, 8], 4],
  "daybreak-fire": ["shot", ["sci fi laser blast", "plasma shot", "energy weapon shot"], [0.2, 6], 4],
  "daybreak-ball": ["loop", ["energy hum loop", "sci-fi plasma loop", "electric hum loop"], [1.5, 60], 4],
  "daybreak-burst": ["shot", ["energy explosion", "sci-fi explosion", "plasma explosion"], [0.5, 12], 4],
  "daybreak-burst-far": [
    "shot",
    ["distant explosion", "far explosion rumble", "distant energy explosion"],
    [0.8, 20],
    4,
  ],
  draw: ["shot", ["gun draw holster", "pistol draw", "weapon draw"], [0.2, 10], 4],
  holster: ["shot", ["holster gun", "pistol holster", "weapon holster"], [0.2, 10], 4],
  "revolver-dry": ["shot", ["revolver dry fire", "revolver hammer click", "gun empty click"], [0.1, 10], 4],
  "shotgun-dry": ["shot", ["shotgun dry fire", "shotgun trigger click"], [0.1, 10], 4],
  "rifle-dry": ["shot", ["rifle dry fire", "rifle trigger click empty"], [0.1, 10], 4],
  "case-snow": [
    "shot",
    ["shell casing snow", "bullet casing dirt", "brass casing grass", "casing ground", "bullet shell drop ground"],
    [0.1, 30],
    4,
  ],
  "case-floor": ["shot", ["bullet casing drop", "brass shell casing concrete", "shell casings falling"], [0.1, 20], 4],
  "shell-snow": [
    "shot",
    [
      "shotgun shell drop dirt",
      "shotgun shell grass",
      "plastic shell drop ground",
      "shotgun shell ground",
      "shell falling dirt",
    ],
    [0.1, 30],
    4,
  ],
  "shell-floor": ["shot", ["shotgun shell drop", "shotgun shell falling floor"], [0.1, 20], 4],
  "revolver-open": ["shot", ["revolver cylinder open", "revolver cylinder swing out", "revolver reload"], [0.2, 15], 4],
  "revolver-eject": [
    "shot",
    ["revolver eject shells", "revolver empty casings", "revolver unload", "revolver reload", "revolver casings drop"],
    [0.2, 20],
    4,
  ],
  "revolver-speedloader": [
    "shot",
    ["speedloader", "revolver speed loader", "revolver loading rounds", "revolver reload", "revolver load bullets"],
    [0.2, 20],
    4,
  ],
  "revolver-close": [
    "shot",
    ["revolver cylinder close", "revolver cylinder snap shut", "revolver reload", "revolver cylinder"],
    [0.2, 20],
    4,
  ],
  "revolver-cock": ["shot", ["revolver hammer cock", "revolver cocking", "pistol hammer cock"], [0.1, 10], 4],
  "shotgun-break": [
    "shot",
    [
      "break action shotgun open",
      "double barrel shotgun open",
      "shotgun break open",
      "double barrel shotgun reload",
      "break action shotgun",
    ],
    [0.2, 20],
    4,
  ],
  "shotgun-eject": [
    "shot",
    [
      "shotgun shell eject",
      "shotgun shells ejected",
      "double barrel eject",
      "double barrel shotgun reload",
      "shotgun reload",
    ],
    [0.2, 20],
    4,
  ],
  "shotgun-shell": ["shot", ["shotgun shell insert", "loading shotgun shell", "shotgun loading"], [0.2, 15], 4],
  "shotgun-close": [
    "shot",
    [
      "break action shotgun close",
      "double barrel shotgun close",
      "shotgun snap shut",
      "double barrel shotgun reload",
      "break action shotgun",
    ],
    [0.2, 20],
    4,
  ],
  "ak-mag-out": ["shot", ["ak47 magazine out", "rifle magazine release", "magazine eject rifle"], [0.2, 15], 4],
  "ak-mag-in": ["shot", ["ak47 magazine insert", "rifle magazine insert", "magazine load rifle"], [0.2, 15], 4],
  "ak-rack": ["shot", ["ak47 charging handle", "rifle cocking", "ak-47 cock"], [0.2, 15], 4],
  "sniper-bolt-open": ["shot", ["bolt action open", "rifle bolt open", "bolt action rifle reload"], [0.2, 15], 4],
  "sniper-bolt-close": [
    "shot",
    ["bolt action close", "rifle bolt close", "bolt action chamber", "bolt action rifle cycle", "mosin nagant bolt"],
    [0.2, 20],
    4,
  ],
  "sniper-round": ["shot", ["rifle round insert", "loading rifle cartridge", "bullet load magazine"], [0.2, 15], 4],
  "daybreak-cell-out": ["shot", ["sci-fi reload", "battery eject", "power cell remove"], [0.2, 10], 4],
  "daybreak-cell-in": [
    "shot",
    ["sci-fi reload click", "battery insert click", "energy cell insert", "sci-fi gun reload", "sci fi mechanism"],
    [0.2, 10],
    4,
  ],
};

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
async function search(q) {
  const url = `https://freesound.org/search/?q=${encodeURIComponent(q).replace(/%20/g, "+")}&f=license%3A%22Creative+Commons+0%22&s=Downloads+desc`;
  const html = execFileSync("curl", ["-s", "-A", "yutopia-sfx/1.0", url], { maxBuffer: 1 << 26 }).toString();
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
        dur: Math.round(Number(attr(b, "data-duration")) * 10) / 10,
        downloads: Number(attr(b, "data-num-downloads")) || 0,
      };
    })
    .filter((r) => r.id);
}

const had = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const out = {
  _: "The guns' sound candidates (docs/plan/79-the-guns.md phase 9): CC0 on Freesound, the most downloaded of each slot's searches (tools/sfx-guns-search.mjs), fetched as their HQ previews and cut by tools/sfx-weather.mjs (LIST=tools/sfx-guns.json DIR=guns). The user picks by ear on /dev/gun-sound.",
  ...had,
};
for (const [slot, [kind, queries, [lo, hi], n]] of Object.entries(SLOTS)) {
  if (only && !only.includes(slot)) continue;
  const seen = new Set();
  const from = [];
  for (const q of queries) {
    if (from.length >= n) break;
    let rs = [];
    try {
      rs = await search(q);
    } catch (e) {
      console.log(`  ${slot}: "${q}" failed (${e.message})`);
    }
    await sleep(4000);
    for (const r of rs) {
      if (from.length >= n) break;
      if (seen.has(r.id) || r.dur < lo || r.dur > hi) continue;
      seen.add(r.id);
      from.push({ ...r, note: `"${q}"` });
    }
  }
  out[slot] = { kind, from, ...(had[slot]?.pick !== undefined ? { pick: had[slot].pick } : {}) };
  console.log(`${slot}: ${from.length} — ${from.map((f) => `${f.title} (${f.dur}s)`).join(" · ")}`);
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
}
