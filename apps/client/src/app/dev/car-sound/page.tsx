"use client";

import { useEffect, useMemo, useState } from "react";
import { type Group, SoundBench } from "../_bench/SoundBench";
import { EngineBench } from "./EngineBench";

// The cars' listening bench (docs/plan/92-the-cars.md phase 11): the engines (./EngineBench: public/sfx/cars/engines,
// tools/sfx-cars-engines.mjs) and every other sound's candidates (tools/sfx-cars.json, found by
// tools/sfx-cars-search.mjs, cut by tools/sfx-weather.mjs into public/sfx/cars — ../_bench/SoundBench). In each, "a" is
// my pick (tools/sfx-cars-mine.mjs: public/sfx/cars/picks.json gives its reason); ★ yours, "copy picks" the tools' PICK.
//   /dev/car-sound

const GROUPS: Group[] = [
  {
    name: "The engine's moments",
    slots: [
      ["start-four", "Started: a petrol four (the saloon, the hatch)"],
      ["start-v8", "Started: the V8 (the pickup)"],
      ["start-diesel", "Started: a diesel (the plough, the tractor, the snowcat)"],
      ["start-two", "Started: the two-stroke (the snowmobile, a pull or a starter)"],
      ["stop", "Switched off"],
      ["tick-cool", "Ticking as it cools"],
      ["shift", "A gear: the lever and the clutch"],
      ["gear-whine", "The gearbox's whine (low gears, reverse)"],
      ["pops", "Pops and a backfire on a lift"],
      ["limiter", "The limiter"],
      ["intake", "The intake under throttle"],
    ],
  },
  {
    name: "The tyres",
    slots: [
      ["skid", "A skid on asphalt (long)"],
      ["squeal", "A squeal (short)"],
      ["squeal-loop", "A squeal held round a corner (loop) — plan 93"],
      ["scrub", "The scrub near the grip's limit (loop) — plan 93"],
      ["chirp", "A chirp: a quick turn-in, a launch — plan 93"],
      ["snow-squeak", "Packed snow's squeak in the cold (loop) — plan 93"],
      ["snow-roll", "Rolling on snow"],
      ["snow-slide", "Sliding and spinning on snow"],
      ["ice-hiss", "On ice"],
      ["gravel", "On gravel"],
      ["slush", "On a wet road, slush"],
      ["splash", "Through a puddle"],
      ["rumble", "Over a rumble strip"],
      ["road-roll", "The road under the tyres (inside)"],
      ["wind", "The wind at speed"],
    ],
    run: ["snow-roll", 300, "snow-slide", 300, "skid", 300, "squeal", 600, "splash"],
  },
  {
    name: "The body",
    slots: [
      ["hit-light", "A knock"],
      ["hit-mid", "A crash"],
      ["hit-heavy", "A big crash"],
      ["hit-glass", "Glass breaking"],
      ["hit-post", "Into a post"],
      ["hit-tree", "Into a tree"],
      ["hit-snowbank", "Into a snowbank"],
      ["scrape", "Scraping along"],
      ["thump", "The suspension: a bump, a landing"],
      ["rattle", "A loose bumper's rattle"],
    ],
    run: [
      "thump",
      500,
      "hit-light",
      700,
      "hit-post",
      900,
      "scrape",
      200,
      "hit-heavy",
      300,
      "hit-glass",
      1200,
      "rattle",
    ],
  },
  {
    name: "The parts",
    slots: [
      ["door-open", "A door opened"],
      ["door-shut", "A door shut (the saloon's clunk)"],
      ["door-van", "The van's sliding door"],
      ["door-truck", "A truck's door (the pickup, the plough)"],
      ["boot", "The boot"],
      ["bonnet", "The bonnet"],
      ["handbrake", "The handbrake's ratchet"],
      ["indicator", "The indicator's relay"],
      ["wiper", "The wipers' motor"],
      ["belt", "A seat belt"],
      ["horn-saloon", "The saloon's horn (the estate, the van)"],
      ["horn-truck", "A truck's horn (the pickup, the plough)"],
      ["horn-small", "The hatch's horn"],
      ["siren", "The police siren"],
      ["reverse-beep", "The plough reversing"],
    ],
    run: [
      "door-open",
      600,
      "belt",
      500,
      "door-shut",
      900,
      "indicator",
      600,
      "wiper",
      300,
      "handbrake",
      900,
      "horn-saloon",
    ],
  },
  {
    name: "The work vehicles",
    slots: [
      ["plough", "The plough's blade on the road"],
      ["tracks", "The snowcat's tracks"],
      ["runners", "The toboggan's runners"],
    ],
  },
];
const LOOPS: Record<string, [number, number]> = Object.fromEntries(
  [
    "gear-whine",
    "intake",
    "skid",
    "snow-roll",
    "snow-slide",
    "ice-hiss",
    "gravel",
    "slush",
    "rumble",
    "road-roll",
    "wind",
    "scrape",
    "rattle",
    "indicator",
    "wiper",
    "siren",
    "reverse-beep",
    "plough",
    "tracks",
    "runners",
  ].map((s) => [s, [4, 1.6]]),
);
// (a sound the game goes round: every take of the one picked; else one moment, its take picked)
const isShot = (slot: string) => /^(hit-|squeal|splash|pops|thump|shift|limiter)/.test(slot) || slot in LOOPS;

type Picks = { slots?: Record<string, { why: string }> };
type Chosen = { slots: Record<string, number | [number, number]>; engines: Record<string, number>; synth?: string[] };

/** The whole of public/sfx/cars/chosen.json (what the game plays — car/sound-bank.ts) from both tabs' ★ in this
 *  browser: paste it over that file and reload, that's all (docs/plan/92 phase 11). */
async function chosenText(): Promise<string> {
  const read = <T,>(k: string): T => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? "{}") as T;
    } catch {
      return {} as T;
    }
  };
  const [man, eng, was] = await Promise.all(
    ["manifest.json", "engines.json", "chosen.json"].map((f) =>
      fetch(`/sfx/cars/${f}`).then((r) => (r.ok ? r.json() : {})),
    ),
  );
  const sp = read<Record<string, { c?: number; t?: number }>>("yutopia:carpicks");
  const ep = read<Record<string, number>>("yutopia:carenginepicks");
  const out: Chosen = { slots: {}, engines: {}, synth: (was as Chosen).synth };
  for (const [slot, cands] of Object.entries(man as Record<string, unknown[]>)) {
    const c = sp[slot]?.c !== undefined && (sp[slot].c as number) < cands.length ? (sp[slot].c as number) : 0;
    const t = sp[slot]?.t;
    out.slots[slot] = !isShot(slot) && t !== undefined ? [c, t] : c;
  }
  for (const [voice, v] of Object.entries(eng as Record<string, { sets: unknown[] }>))
    out.engines[voice] = ep[voice] !== undefined && ep[voice] < v.sets.length ? ep[voice] : 0;
  return `${JSON.stringify(out, null, 1)}\n`;
}

export default function CarSoundBench() {
  const [tab, setTab] = useState<"engines" | "rest">("engines");
  const [mine, setMine] = useState<Picks>({});
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void fetch("/sfx/cars/picks.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then(setMine);
  }, []);
  // (each slot's label with my pick's reason)
  const groups = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        slots: g.slots.map(
          ([s, label]) =>
            [s, mine.slots?.[s] ? `${label} — my pick a: ${mine.slots[s].why}` : label] as [string, string],
        ),
      })),
    [mine],
  );
  const tabBtn = (on: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid rgba(239,228,204,.25)",
    background: on ? "#ffb347" : "rgba(30,20,12,.95)",
    color: on ? "#1d1408" : "#efe4cc",
    cursor: "pointer",
    font: "13px 'Share Tech Mono', ui-monospace, monospace",
  });
  return (
    <>
      <div style={{ position: "fixed", bottom: 14, right: 16, zIndex: 5, display: "flex", gap: 6 }}>
        <button
          type="button"
          style={tabBtn(tab === "engines")}
          onClick={() => setTab("engines")}
          data-testid="tab-engines"
        >
          engines
        </button>
        <button type="button" style={tabBtn(tab === "rest")} onClick={() => setTab("rest")} data-testid="tab-rest">
          everything else
        </button>
        <button
          type="button"
          style={tabBtn(copied)}
          title="both tabs' picks as public/sfx/cars/chosen.json — paste over that file, reload: the game plays them"
          onClick={async () => {
            await navigator.clipboard.writeText(await chosenText()).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          data-testid="copy-chosen"
        >
          {copied ? "copied" : "copy chosen.json"}
        </button>
      </div>
      {tab === "engines" ? (
        <EngineBench />
      ) : (
        <SoundBench
          title="The cars' sounds"
          help="▶ a candidate's takes · ★ your pick (a is mine, its reason by the name) · a moment's takes: 1 2 3… each alone, its ★ that one · ▶▶ in order with your picks"
          dir="cars"
          storageKey="yutopia:carpicks"
          groups={groups}
          isShot={isShot}
          loops={LOOPS}
          testId="car-sound-bench"
        />
      )}
    </>
  );
}
