"use client";

import { type Group, SoundBench } from "../_bench/SoundBench";

// The guns' listening bench (docs/plan/79-the-guns.md phase 9): every sound's candidates (tools/sfx-guns.json, found by
// tools/sfx-guns-search.mjs, cut by tools/sfx-weather.mjs into public/sfx/guns) — the bench is ../_bench/SoundBench.
//   /dev/gun-sound

const GROUPS: Group[] = [
  {
    name: "The revolver",
    slots: [
      ["revolver-near", "A shot, outdoors (its tail into the land)"],
      ["revolver-in", "A shot, in a room"],
      ["revolver-far", "Someone's shot, far off"],
      ["revolver-cock", "The hammer thumbed back"],
      ["revolver-dry", "Dry: the hammer on nothing"],
      ["revolver-open", "The cylinder swung out"],
      ["revolver-eject", "The rod punched: the cases dumped"],
      ["revolver-speedloader", "The speedloader in, twisted"],
      ["revolver-close", "The cylinder snapped shut"],
    ],
    run: [
      "draw",
      400,
      "revolver-cock",
      500,
      "revolver-near",
      900,
      "revolver-cock",
      300,
      "revolver-near",
      900,
      "revolver-dry",
      700,
      "revolver-open",
      250,
      "revolver-eject",
      300,
      "case-snow",
      500,
      "revolver-speedloader",
      600,
      "revolver-close",
      700,
      "holster",
    ],
  },
  {
    name: "The double-barrel",
    slots: [
      ["shotgun-near", "A shot, outdoors"],
      ["shotgun-in", "A shot, in a room"],
      ["shotgun-far", "Someone's shot, far off"],
      ["shotgun-dry", "Dry"],
      ["shotgun-break", "Broken open"],
      ["shotgun-eject", "Both shells out"],
      ["shotgun-shell", "A shell in"],
      ["shotgun-close", "Snapped shut"],
    ],
    run: [
      "draw",
      500,
      "shotgun-near",
      1100,
      "shotgun-near",
      1100,
      "shotgun-break",
      200,
      "shotgun-eject",
      300,
      "shell-snow",
      600,
      "shotgun-shell",
      550,
      "shotgun-shell",
      500,
      "shotgun-close",
      700,
      "holster",
    ],
  },
  {
    name: "The AK-47",
    slots: [
      ["ak-near", "A round, outdoors (full auto plays it ten times a second)"],
      ["ak-in", "A round, in a room"],
      ["ak-far", "Someone's fire, far off"],
      ["ak-mag-out", "The magazine out"],
      ["mag-floor", "The empty landing on a floor"],
      ["mag-snow", "The empty landing on snow or the ground"],
      ["ak-mag-in", "A new one rocked in"],
      ["ak-rack", "The charging handle racked"],
    ],
    run: [
      "draw",
      500,
      ...Array.from({ length: 8 }, () => ["ak-near", 100]).flat(),
      600,
      ...Array.from({ length: 5 }, () => ["ak-near", 100]).flat(),
      800,
      "rifle-dry",
      600,
      "ak-mag-out",
      380,
      "mag-floor",
      520,
      "ak-mag-in",
      700,
      "ak-rack",
      700,
      "holster",
    ],
  },
  {
    name: "The sniper",
    slots: [
      ["sniper-near", "A shot, outdoors"],
      ["sniper-in", "A shot, in a room"],
      ["sniper-far", "Someone's shot, far off"],
      ["sniper-bolt-open", "The bolt up and back"],
      ["sniper-bolt-close", "The bolt forward and down"],
      ["sniper-round", "A round thumbed in"],
    ],
    run: [
      "draw",
      600,
      "sniper-near",
      500,
      "sniper-bolt-open",
      350,
      "case-snow",
      150,
      "sniper-bolt-close",
      900,
      "sniper-near",
      500,
      "sniper-bolt-open",
      600,
      "sniper-round",
      500,
      "sniper-round",
      500,
      "sniper-bolt-close",
      700,
      "holster",
    ],
  },
  {
    name: "The Daybreak (sci-fi energy)",
    slots: [
      ["daybreak-charge", "Its charge (a second)"],
      ["daybreak-fire", "The ball leaving"],
      ["daybreak-ball", "The ball flying (a loop)"],
      ["daybreak-burst", "Its burst"],
      ["daybreak-burst-far", "A burst far off"],
      ["daybreak-cell-out", "A cell out"],
      ["daybreak-cell-in", "A cell in"],
    ],
    run: [
      "draw",
      600,
      "daybreak-charge",
      1000,
      "daybreak-fire",
      200,
      "daybreak-ball",
      1800,
      "daybreak-burst",
      2500,
      "daybreak-cell-out",
      900,
      "daybreak-cell-in",
      700,
      "holster",
    ],
  },
  {
    name: "Every gun",
    slots: [
      ["draw", "Drawn"],
      ["holster", "Put away"],
      ["rifle-dry", "Dry: the AK's, the sniper's"],
      ["case-snow", "Brass landing on snow"],
      ["case-floor", "Brass landing on a floor"],
      ["shell-snow", "A shell landing on snow"],
      ["shell-floor", "A shell landing on a floor"],
    ],
  },
];

// (a shot keeps every take of the one picked — the game goes round them; a handling sound is one moment: its take
// picked too)
const isShot = (slot: string) => /-(near|in|far|burst|burst-far|ball)$/.test(slot);

export default function GunSoundBench() {
  return (
    <SoundBench
      title="The guns' sounds"
      help="▶ a candidate's takes · ★ your pick · for a reload's moments: 1 2 3… each take alone, its ★ that one · ▶▶ the gun in order with your picks"
      dir="guns"
      storageKey="yutopia:gunpicks"
      groups={GROUPS}
      isShot={isShot}
      loops={{ "daybreak-ball": [4, 1.8] }}
      testId="gun-sound-bench"
    />
  );
}
