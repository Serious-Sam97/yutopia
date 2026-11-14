"use client";

import { type Group, SoundBench } from "../_bench/SoundBench";

// The fight with Vortex's listening bench (docs/plan/88-vortex-fight.md phase 5): every sound's candidates
// (tools/sfx-vortex.json, found by tools/sfx-vortex-search.mjs, cut by tools/sfx-weather.mjs into public/sfx/vortex),
// each act's moments in order with the picks — the bench is ../_bench/SoundBench.
//   /dev/vortex-sound

const GROUPS: Group[] = [
  {
    name: "Shot — and his voice",
    slots: [
      ["vx-hit", "A hit on him (hollow plastic, his cassette shell)"],
      ["vx-hit-dark", "A hit on him in act III (distorted)"],
      ["vx-babble", "His voice: tape chirps (the game cuts syllables from it, a babble a line)"],
      ["vx-kkzzt", "His *kkzzt* (a burst of static)"],
      ["vx-dodge", "A side-step"],
    ],
    run: ["vx-hit", 450, "vx-hit", 300, "vx-babble", 1200, "vx-kkzzt", 900, "vx-dodge", 500, "vx-hit"],
  },
  {
    name: "Act II — the tape tricks",
    slots: [
      ["vx-whip", "The tape whip's lash"],
      ["vx-bound", "Taped up"],
      ["vx-free", "Cut free (the tape torn off)"],
      ["vx-rew", "◀◀ REW (pulled back)"],
      ["vx-pause", "▮▮ PAUSE (the button)"],
      ["vx-play", "▶ PLAY (the shots coming back)"],
    ],
    run: ["vx-whip", 450, "vx-bound", 2200, "vx-free", 1400, "vx-rew", 2200, "vx-pause", 1800, "vx-play"],
  },
  {
    name: "Act II — the pranks",
    slots: [
      ["vx-steal", "The confiscation (snatched)"],
      ["vx-duck", "…and the duck"],
      ["vx-radio", "The radio at full blast"],
      ["vx-hr", "Reported to HR"],
    ],
    run: ["vx-steal", 700, "vx-duck", 1400, "vx-radio", 3400, "vx-hr"],
  },
  {
    name: "Act III — the dark",
    slots: [
      ["vx-dark", "The lights out (the breaker, the hum dying)"],
      ["vx-flicker", "The lights catching as they die"],
      ["vx-music3", "The music's turn: a dark loop while the lights are out"],
      ["vx-clones", "His clones"],
      ["vx-pop", "A clone popped"],
      ["vx-strike", "His blow"],
      ["vx-possess", "Possessed"],
      ["vx-glitch", "The glitch"],
    ],
    run: [
      "vx-flicker",
      600,
      "vx-dark",
      300,
      "vx-music3",
      2500,
      "vx-clones",
      1400,
      "vx-pop",
      1200,
      "vx-strike",
      1000,
      "vx-possess",
      2600,
      "vx-glitch",
    ],
  },
  {
    name: "The end — and the grudge",
    slots: [
      ["vx-down", "He's down (the tape stopping)"],
      ["vx-unspool", "His tape unspooling"],
      ["vx-pickup", "His cassette taken"],
      ["vx-grudge", "The grudge's slip"],
    ],
    run: ["vx-hit-dark", 250, "vx-down", 900, "vx-unspool", 3200, "vx-pickup", 1600, "vx-grudge"],
  },
];

// (a sound that varies — his hits, his blow, his voice — keeps every take of the one picked; the rest are one
// moment each: their take picked too)
const isShot = (slot: string) => /^vx-(hit|hit-dark|strike|kkzzt|pop|dodge|babble)$/.test(slot);

export default function VortexSoundBench() {
  return (
    <SoundBench
      title="The fight with Vortex's sounds"
      help="▶ a candidate's takes · ★ your pick · for a moment: 1 2 3… each take alone, its ★ that one · ▶▶ the act in order with your picks"
      dir="vortex"
      storageKey="yutopia:vortexpicks"
      groups={GROUPS}
      isShot={isShot}
      loops={{ "vx-music3": [10, 2.5] }}
      testId="vortex-sound-bench"
    />
  );
}
