// The cars' sound candidates (docs/plan/92-the-cars.md phase 11): each slot's searches on Freesound — CC0 only, the
// most downloaded first, read from its search page (plain curl, 4 s apart: Freesound refuses a machine that asks fast,
// plan 63) — with the recordings found in car packs pinned first (a 190E's horn and doors, an Elantra's switches, a
// Duster's boot…). Written to tools/sfx-cars.json for tools/sfx-weather.mjs (LIST=tools/sfx-cars.json DIR=cars) to
// fetch and cut, and the engines' sets (a voice's recordings at their revs, by mic) to tools/sfx-cars-engines.json for
// tools/sfx-cars-engines.mjs. tools/sfx-cars-mine.mjs then puts my pick first in each (its `mine`, its reason) and
// /dev/car-sound plays them all. A slot already in the json keeps its `pick` (the user's).
//   node tools/sfx-cars-search.mjs            every slot and every engine
//   ONLY=horn-saloon,skid node tools/sfx-cars-search.mjs
//   ENGINES=0 node tools/sfx-cars-search.mjs  the slots alone
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { searchSlots } from "./sfx-search.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const OUT = `${ROOT}tools/sfx-cars.json`;
const ENG_OUT = `${ROOT}tools/sfx-cars-engines.json`;
const only = process.env.ONLY?.split(",");

// slot: [kind, [queries], [min s, max s], how many, pinned ["user:id", …]?]
//   kind: shot (cut into its events), loop (a bed: its steadiest stretch)
const SLOTS = {
  // ── the engine's moments (the running sound is the engines' sets, below) ──
  "start-four": [
    "shot",
    ["car engine start", "car ignition start"],
    [1, 12],
    4,
    ["Chippy569:162528", "GiocoSound:401558", "semenov_nick:380716"],
  ],
  "start-v8": [
    "shot",
    ["v8 engine start", "v8 cold start", "v8 start up", "ford v8 start", "chevy v8 start"],
    [1, 15],
    4,
  ],
  "start-diesel": [
    "shot",
    ["diesel engine start", "tractor engine start", "truck engine start"],
    [1, 15],
    4,
    ["radwoc:256808"],
  ],
  "start-two": [
    "shot",
    ["snowmobile start", "two stroke engine start", "dirt bike start", "pull start engine", "snowmobile", "two stroke"],
    [1, 15],
    4,
  ],
  stop: ["shot", ["car engine stop", "car engine turn off", "engine shut off"], [0.8, 10], 4, ["GiocoSound:401557"]],
  "tick-cool": [
    "shot",
    [
      "engine cooling ticking",
      "hot engine ticking",
      "exhaust cooling tick",
      "engine ticking",
      "car cooling down",
      "metal ticking cooling",
    ],
    [1.5, 40],
    4,
  ],
  shift: [
    "shot",
    ["car gear shift", "gear stick shift", "gearbox shift manual"],
    [0.3, 25],
    4,
    ["semenov_nick:380723", "microman502:865231"],
  ],
  "gear-whine": [
    "loop",
    ["gear whine", "transmission whine", "reverse gear whine", "gearbox whine", "straight cut gears", "car reversing"],
    [1.5, 60],
    4,
  ],
  pops: ["shot", ["car backfire", "exhaust pops", "exhaust crackle"], [0.2, 20], 4],
  limiter: [
    "shot",
    ["rev limiter car", "engine bouncing off limiter", "car revving limiter", "rev limiter"],
    [0.5, 20],
    4,
  ],
  intake: ["loop", ["engine intake sound", "carburetor", "intake roar", "engine intake"], [1, 60], 4],
  // ── the tyres ──
  skid: ["loop", ["tire skid", "tyre screech long", "car skid"], [1, 40], 4],
  squeal: ["shot", ["tire squeal", "tyre squeal short", "car tires squeal"], [0.3, 10], 4],
  // (plan 93 B: the squeal led by the slip — a held corner's loop, the scrub near the limit, a chirp; the snow's squeak)
  "squeal-loop": [
    "loop",
    ["tire screech cornering", "tires squealing corner", "car cornering tires", "tyre squeal loop", "tire screech", "car drift tires", "drifting car", "burnout"],
    [2, 60],
    5,
  ],
  scrub: ["loop", ["tire scrub", "tyre scrub", "tires scrubbing", "low tire squeal", "parking garage tires", "tires squeak parking"], [1, 60], 4],
  chirp: [
    "shot",
    ["tire chirp", "tyre chirp", "tire chirp launch", "short tire squeak", "tire squeak", "tires screech short", "car peel out", "car screech"],
    [0.1, 15],
    4,
  ],
  "snow-squeak": [
    "loop",
    ["snow squeak", "cold snow squeak", "tires snow squeak", "car cold snow", "snow crunch squeak", "squeaky snow", "snow compression", "frozen snow", "snow crunch cold", "packed snow"],
    [1, 60],
    4,
  ],
  "snow-roll": [
    "loop",
    ["car driving on snow", "tires snow crunch", "driving snow interior", "driving in snow", "car snow", "snow tires"],
    [2, 120],
    4,
    ["semenov_nick:380718"],
  ],
  "snow-slide": [
    "loop",
    [
      "car sliding snow",
      "tires spinning snow",
      "wheel spin snow",
      "car stuck in snow",
      "wheels spinning snow",
      "tires spinning",
    ],
    [1, 60],
    4,
  ],
  "ice-hiss": [
    "loop",
    ["tires on ice", "car on ice", "skidding on ice", "ice road car", "ice scrape", "skating on ice"],
    [1, 60],
    4,
  ],
  gravel: ["loop", ["car driving gravel", "tires gravel", "gravel road car"], [2, 120], 4],
  slush: ["loop", ["car driving wet road", "tires wet road", "car slush"], [2, 120], 4],
  splash: [
    "shot",
    ["car puddle splash", "car splash water", "tire splash puddle", "car through puddle", "car driving through water"],
    [0.3, 15],
    4,
  ],
  rumble: ["loop", ["rumble strip", "car rumble strip", "tires rumble"], [1, 60], 4],
  "road-roll": ["loop", ["car interior road noise", "tyre road noise", "car driving interior"], [3, 180], 4],
  wind: ["loop", ["wind noise car driving", "car window wind", "driving wind interior"], [3, 180], 4],
  // ── the body ──
  "hit-light": ["shot", ["car bump", "car door bump", "light car impact"], [0.2, 10], 4],
  "hit-mid": ["shot", ["car crash", "car impact metal", "car collision"], [0.2, 10], 4],
  "hit-heavy": ["shot", ["car crash heavy", "big car crash", "metal crash heavy"], [0.3, 15], 4],
  // (plan 94 P1) a car on fire: its bed (flames roaring and crackling), the moment it catches, the blast
  fire: ["loop", ["car fire burning", "car on fire", "vehicle fire", "fire burning large", "fire roaring crackling", "bonfire crackling"], [10, 300], 5],
  "fire-catch": ["shot", ["fire ignite whoosh", "fire whoosh", "gasoline ignite", "petrol ignition fire"], [0.3, 8], 4],
  blast: ["shot", ["car explosion", "vehicle explosion", "explosion large", "big explosion", "explosion debris"], [1, 15], 6],
  "hit-glass": ["shot", ["car window smash", "glass shatter", "glass break"], [0.2, 10], 4],
  "hit-post": ["shot", ["metal pole hit", "hit metal post", "metal pipe impact"], [0.2, 10], 4],
  "hit-tree": ["shot", ["wood impact heavy", "tree trunk hit", "wood thud"], [0.2, 10], 4],
  "hit-snowbank": ["shot", ["snow impact", "snow thud", "snowball hit"], [0.2, 10], 4],
  scrape: ["loop", ["metal scrape", "car scraping", "metal scraping concrete"], [1, 60], 4],
  thump: ["shot", ["car suspension bump", "car pothole", "car bottoming out"], [0.2, 10], 4],
  rattle: ["loop", ["metal rattle", "loose metal rattle", "car rattle"], [1, 60], 4],
  // ── the parts ──
  "door-open": [
    "shot",
    ["car door open", "car door handle open"],
    [0.3, 15],
    4,
    ["Nox_Sound:522219", "Nox_Sound:465610"],
  ],
  "door-shut": ["shot", ["car door close", "car door slam"], [0.3, 15], 4, ["Nox_Sound:522220", "Chippy569:162531"]],
  "door-van": ["shot", ["van sliding door", "sliding door van"], [0.5, 20], 4, ["Nox_Sound:558144"]],
  "door-truck": ["shot", ["truck door close", "old truck door", "pickup truck door"], [0.3, 20], 4],
  boot: [
    "shot",
    ["car trunk close", "car boot close", "trunk slam"],
    [0.3, 20],
    4,
    ["Chippy569:162529", "semenov_nick:380724"],
  ],
  bonnet: ["shot", ["car hood close", "car bonnet close", "hood slam"], [0.3, 20], 4, ["microman502:865230"]],
  // (plan 95 F1a) a power window wound down or up: its motor's whine, the glass's slide, the stop
  window: [
    "shot",
    ["car power window", "electric car window", "power window motor", "car window up down", "car electric window"],
    [0.6, 20],
    6,
  ],
  handbrake: [
    "shot",
    ["handbrake car", "parking brake", "hand brake ratchet"],
    [0.3, 25],
    4,
    ["Chippy569:162538", "microman502:865232", "semenov_nick:380722"],
  ],
  indicator: [
    "loop",
    ["car indicator ticking", "turn signal clicking", "car hazard lights"],
    [1, 60],
    4,
    ["microman502:865233"],
  ],
  wiper: ["loop", ["windshield wipers", "car wipers", "wiper motor"], [2, 60], 4, ["microman502:865241"]],
  belt: ["shot", ["seatbelt buckle", "seat belt click", "seatbelt"], [0.3, 30], 4, ["microman502:865236"]],
  "horn-saloon": ["shot", ["car horn", "old car horn", "car horn honk"], [0.3, 15], 4, ["Chippy569:162540"]],
  "horn-truck": ["shot", ["truck horn", "pickup truck horn", "van horn"], [0.3, 15], 4],
  "horn-small": ["shot", ["small car horn", "beep beep car horn", "compact car horn"], [0.2, 10], 4],
  siren: ["loop", ["police siren", "police siren wail", "american police siren"], [2, 90], 4],
  "reverse-beep": ["loop", ["truck reversing beep", "reverse beeper", "backup alarm"], [1, 60], 4],
  plough: ["loop", ["snow plow scraping", "snowplow blade", "snow plough"], [2, 120], 4],
  tracks: ["loop", ["tank tracks", "tracked vehicle", "snow groomer"], [2, 120], 4],
  runners: [
    "loop",
    ["sled on snow", "sledge snow", "toboggan snow", "sledding", "sled runners", "sleigh snow", "skis on snow"],
    [1, 60],
    4,
  ],
};

// The engines: each voice's candidate sets. A set is a car's (or an engine's) recordings, each by its mic (ex: by the
// exhaust · bay: the engine bay · cabin: inside · far: from a distance) and load (on: pulling · off: free · auto: a
// ramp or a run of revs, its parts told apart by the revs rising), with its cylinders and strokes (the firing rate
// read from it gives its revs). tools/sfx-cars-engines.mjs cuts each set into loops at the voice's revs.
const VOICES = {
  four: { rpm: [900, 1600, 2600, 4200, 6200], for: "the saloon, the estate, the 4x4 (petrol)" },
  revvy: { rpm: [950, 2000, 3500, 5200, 7000], for: "the hatch" },
  v8: { rpm: [650, 1300, 2200, 3400, 4800], for: "the pickup" },
  "diesel-light": { rpm: [800, 1500, 2300, 3200, 4200], for: "the van, the 4x4 (diesel)" },
  diesel: { rpm: [650, 1000, 1400, 1900, 2400], for: "the snowcat, the plough truck, the tractor" },
  two: { rpm: [1500, 3000, 5000, 6500, 8000], for: "the snowmobile" },
};
// [name, cylinders, strokes, [["user:id", mic, load], …], start "user:id"?, note]
const ENGINES = {
  four: [
    [
      "Mercedes 190E-16V on a dyno (today's)",
      4,
      4,
      [
        ...["162506", "162509", "162512"].map((id) => [`Chippy569:${id}`, "ex", "on"]),
        ...["162507", "162510", "162513"].map((id) => [`Chippy569:${id}`, "bay", "on"]),
        ...["162505", "162508", "162511"].map((id) => [`Chippy569:${id}`, "far", "on"]),
        ...["162515", "162518", "162521"].map((id) => [`Chippy569:${id}`, "ex", "off"]),
        ...["162516", "162519", "162522"].map((id) => [`Chippy569:${id}`, "bay", "off"]),
        ...["162514", "162517", "162520"].map((id) => [`Chippy569:${id}`, "far", "off"]),
        ["Chippy569:162504", "ex", "auto"],
        ["Chippy569:162502", "bay", "auto"],
        ["Chippy569:162499", "bay", "on"],
      ],
      "Chippy569:162528",
      "three mics (D6 the exhaust, 4062 the bay, a distant one); the sweeps give the points between",
    ],
    [
      "Peugeot 308",
      4,
      4,
      [
        ["Nox_Sound:522221", "ex", "auto"],
        ["Nox_Sound:522225", "ex", "off"],
        ["Nox_Sound:522223", "cabin", "off"],
      ],
      null,
      "an acceleration run from idle and idle loops outside and in",
    ],
    [
      "Ford Ranger (2000), outside",
      4,
      4,
      [["YannSauvin:779214", "ex", "auto"]],
      null,
      "4 min of revs held at many points (if it's the V6, its revs read 1.5× high)",
    ],
    [
      "Hyundai Elantra (2004)",
      4,
      4,
      [
        ["microman502:865228", "ex", "auto"],
        ["microman502:865229", "ex", "off"],
      ],
      "microman502:865229",
      "idle and revs, the key start",
    ],
  ],
  revvy: [
    [
      "Mini Cooper S (contact mic)",
      4,
      4,
      [
        ["TheLittleCrow:669618", "bay", "auto"],
        ["TheLittleCrow:669622", "bay", "auto"],
        ["TheLittleCrow:669623", "bay", "auto"],
      ],
      null,
      "a contact mic on the block: the engine's own voice, driven hard",
    ],
    [
      "Ford Cortina on a dyno (70s, 328 hp)",
      4,
      4,
      [["Ears68:177183", "ex", "auto"]],
      null,
      "a period four pulling on a dyno",
    ],
    [
      "Renault Duster",
      4,
      4,
      [
        ["semenov_nick:380717", "ex", "auto"],
        ["semenov_nick:380719", "ex", "auto"],
      ],
      "semenov_nick:380716",
      "revs rising by the exhaust, outdoors",
    ],
  ],
  v8: [
    [
      "Chevrolet Impala (1980), outside",
      8,
      4,
      [["YannSauvin:779211", "ex", "auto"]],
      null,
      "a period V8, revs held at many points, four mics",
    ],
    [
      "Hot-rod V8 (start, rough idle, revs, away)",
      8,
      4,
      [
        ["Ears68:146832", "ex", "auto"],
        ["Ears68:144454", "ex", "auto"],
      ],
      "Ears68:146832",
      "a lumpy cam: louder than a farm pickup",
    ],
    [
      "Ford F-350 5.4 V8 and a Crown Victoria",
      8,
      4,
      [
        ["Therancher01:610772", "ex", "auto"],
        ["Therancher01:610774", "ex", "auto"],
      ],
      "Therancher01:610772",
      "real trucks' starts and idles (few revs)",
    ],
  ],
  "diesel-light": [
    [
      "BMW 120d",
      4,
      4,
      [
        ...["401552", "401556", "401555", "401551"].map((id) => [`GiocoSound:${id}`, "ex", "off"]),
        ...["401550", "401548", "401547", "401549"].map((id) => [`GiocoSound:${id}`, "cabin", "off"]),
      ],
      "GiocoSound:401558",
      "idle, low, medium, high, outside and inside, the start and the stop",
    ],
    [
      "Ram 5.9 Cummins (start, idle)",
      6,
      4,
      [["Therancher01:610771", "ex", "auto"]],
      "Therancher01:610771",
      "a big pickup diesel: heavier than a van's",
    ],
  ],
  diesel: [
    [
      "A tractor at a landfill",
      4,
      4,
      [
        ["radwoc:256805", "ex", "auto"],
        ["radwoc:256806", "ex", "auto"],
      ],
      "radwoc:256808",
      "working: revs up and down under load",
    ],
    [
      "A truck's engine",
      6,
      4,
      [
        ["jusebago:515040", "ex", "auto"],
        ["jusebago:515042", "ex", "auto"],
      ],
      null,
      "a heavy truck, idle and moving off on dirt",
    ],
    ["A diesel engine", 4, 4, [["AugustSandberg:237292", "bay", "auto"]], null, "an engine room's diesel, close"],
    [
      "Ram 5.9 Cummins (start, idle)",
      6,
      4,
      [["Therancher01:610771", "ex", "auto"]],
      "Therancher01:610771",
      "a straight six diesel",
    ],
  ],
  two: [
    ["Ski-Doo Skandik", 2, 2, [["SoundsLikeYukon:726286", "ex", "auto"]], null, "a working snowmobile's twin"],
    ["A snowmobile (with swans)", 2, 2, [["SoundsLikeYukon:732881", "ex", "auto"]], null, "passing, in the cold"],
    [
      "Snowmobile braaap",
      2,
      2,
      [
        ["IMikey18:554894", "ex", "auto"],
        ["IMikey18:554893", "ex", "auto"],
        ["IMikey18:554892", "ex", "auto"],
      ],
      null,
      "revved hard",
    ],
  ],
};

// ── a pinned recording's details, read from its page (CC0 only) ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const attr = (b, n) => {
  const m = b.match(new RegExp(`${n}="([^"]*)"`));
  return m
    ? m[1]
        .replace(/&amp;/g, "&")
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
    : "";
};
const seen = new Map();
async function pinned(ref) {
  if (seen.has(ref)) return seen.get(ref);
  const [user, id] = ref.split(":");
  const html = execFileSync(
    "curl",
    ["-sL", "-A", "yutopia-sfx/1.0", `https://freesound.org/people/${user}/sounds/${id}/`],
    {
      maxBuffer: 1 << 26,
    },
  ).toString();
  await sleep(4000);
  const b = html.split('class="bw-player"').find((x) => attr(x, "data-sound-id") === id);
  const cc0 = /creativecommons\.org\/publicdomain\/zero|Creative Commons 0/.test(html);
  if (!b || !cc0) {
    console.log(`  ${ref}: ${b ? "not CC0 — left out" : "not found"}`);
    seen.set(ref, null);
    return null;
  }
  const uid = attr(b, "data-user-id");
  const r = {
    id,
    user,
    title: attr(b, "data-title"),
    preview: `https://cdn.freesound.org/previews/${Math.floor(Number(id) / 1000)}/${id}_${uid}-hq.mp3`,
    url: `https://freesound.org/people/${user}/sounds/${id}/`,
    dur: Math.round(Number(attr(b, "data-duration")) * 10) / 10,
    downloads: Number(attr(b, "data-num-downloads")) || 0,
    note: "pinned (a car pack's)",
  };
  seen.set(ref, r);
  return r;
}

const slots = Object.fromEntries(Object.entries(SLOTS).map(([k, [kind, q, len, n]]) => [k, [kind, q, len, n]]));
await searchSlots(
  slots,
  OUT,
  "The cars' sound candidates (docs/plan/92-the-cars.md phase 11): CC0 on Freesound — recordings from car packs pinned first, then the most downloaded of each slot's searches (tools/sfx-cars-search.mjs) — fetched as their HQ previews and cut by tools/sfx-weather.mjs (LIST=tools/sfx-cars.json DIR=cars). `mine` is my pick (tools/sfx-cars-mine.mjs, its `why`), first in each; the user picks by ear on /dev/car-sound.",
  only,
);
// the pinned ones first (a slot keeps 4: the pinned, then the searches'), none twice
const all = JSON.parse(readFileSync(OUT, "utf8"));
for (const [slot, [, , , n, pins]] of Object.entries(SLOTS)) {
  if ((only && !only.includes(slot)) || !pins?.length) continue;
  const got = (await Promise.all(pins.map(pinned))).filter(Boolean);
  const ids = new Set(got.map((g) => g.id));
  all[slot].from = [...got, ...all[slot].from.filter((f) => !ids.has(f.id))].slice(0, Math.max(n, got.length + 1));
  console.log(`${slot}: ${got.length} pinned`);
}
writeFileSync(OUT, `${JSON.stringify(all, null, 2)}\n`);

if (process.env.ENGINES !== "0") {
  const had = existsSync(ENG_OUT) ? JSON.parse(readFileSync(ENG_OUT, "utf8")) : {};
  const eng = {
    _: "The cars' engines (docs/plan/92-the-cars.md phase 11): each voice's candidate sets — a car's recordings by mic and load, CC0 on Freesound (tools/sfx-cars-search.mjs) — cut into loops at the voice's revs by tools/sfx-cars-engines.mjs into public/sfx/cars/engines. `mine` is my pick.",
  };
  for (const [voice, sets] of Object.entries(ENGINES)) {
    const out = [];
    for (const [name, cyl, strokes, srcs, start, note] of sets) {
      const rec = [];
      for (const [ref, mic, load] of srcs) {
        const r = await pinned(ref);
        if (r) rec.push({ ...r, mic, load });
      }
      const st = start ? await pinned(start) : null;
      if (rec.length) out.push({ name, cyl, strokes, note, rec, ...(st ? { start: st } : {}) });
      console.log(`${voice} · ${name}: ${rec.length}/${srcs.length}`);
    }
    eng[voice] = { ...VOICES[voice], sets: out, ...(had[voice]?.pick !== undefined ? { pick: had[voice].pick } : {}) };
  }
  writeFileSync(ENG_OUT, `${JSON.stringify(eng, null, 2)}\n`);
}
