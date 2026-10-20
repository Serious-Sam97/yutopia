# The dark — sound shortlist (phase 0, D9)

Synthesised, as the building's effects are (`tools/sfx-synth.mjs`): the WAVs in
`sounds/` are auditions, made by `sounds/synth.mjs` (`node
design/screens/dark/sounds/synth.mjs [name]`, no ffmpeg needed). In the game
they become voices on `GroundsSound`'s scheduler (`world/grounds-sound.ts`),
built from Web Audio nodes the same way (oscillators, filtered noise, gains),
so nothing ships as a file unless a CC0 recording beats the synth.

Loops are seamless (crossfaded into their own head). Levels are peak-normalised
for listening, not mixed.

| File | What it is | Made of | When it plays (proposed) |
|---|---|---|---|
| `drone-calm.wav` | The tension drone, calm (12 s loop) | E1 + B1 sines beating once a loop; the wind through spruce as band-passed noise breathing on a 6 s swell | Always outside at night, under the Grounds' wind; its gain follows `dangerAt` |
| `drone-hunted.wav` | The drone when hunted (12 s loop) | The same ground with F leaning on E (a minor second), a saw cluster pulsing like breath, a glassy high E/F beating (the office's cold fluorescent edge), thinner wind | Crossfaded in from calm by danger × nearness of the closest shadowed |
| `whispers.wav` | Whispers (stereo, 7 s) | Formant noise (the vowels a e o u i over noise) in 4–7 syllables a second, an "s" now and then; five voices round you, the far ones duller | One stalking within ~15 tiles, panned from where it is; never words |
| `emerge-sting.wav` | One comes out of the dark | A reversed swell (noise + dissonant cluster, 1.2 s, the emerge's own length) cut by a low blow falling 70 → 34 Hz | On `emerge`, only if you can see it or it's within 20 tiles |
| `focus-on.wav` | The torch narrowing | The switch's click, a whine rising 2.2 → 3.4 kHz, the hum settling in | Aim pressed |
| `focus-hum.wav` | Holding the focus (2 s loop) | 120 Hz + harmonics with a flutter, the whine on top | While focused; pitch sags as the battery falls under 20% |
| `burn-sizzle.wav` | The shield burning (3 s loop) | High hiss, frying crackles (~60/s, 2–7 kHz), a thin singing tone | While a focused beam holds a shielded one; gain by the burn rate |
| `shield-break.wav` | The shield gone: exposed, shoot now | A glassy burst of inharmonic modes, the dark rushing out (a band sweeping down), a thump; outdoors | On `exposed` |
| `dissolve.wav` | One is gone, in a burst of light | A shimmer rising (A5 E6 A6 C♯7), an airy bloom, a bright chord dying away | On `dissolve` |
| `heartbeat-70.wav` · `heartbeat-120.wav` | The heartbeat (8-beat loops) | Lub-dub: a falling low sine and a dull knock, low-passed | Health under 30: 70 bpm, racing to 120 under 15 or when struck |
| `revolver-shot.wav` | The .38 | A 1 ms click, a noise crack at 1.6 kHz, the body falling 95 → 42 Hz; the treeline slapping it back (5 reflections), the woods' tail | Fire; others hear it by distance (a shot is heard 40 tiles off, D5) |
| `revolver-load.wav` | One round in (0.35 s, D3) | The cartridge's brass tick, the cylinder's ratchet one notch | Each round of a reload |
| `revolver-dry.wav` | Empty | The hammer on nothing | Fire with 0 loaded |
| `shotgun-shot.wav` | The shotgun | Wider and lower: the crack at 900 Hz, the body 75 → 32 Hz, longer echoes | Fire |
| `shotgun-pump.wav` | Racking it | A scrape and a clack back, a scrape and a clack home | After each shot; reload |
| `flare-strike.wav` | A flare lit | The cap's scratch, the ignition's whoosh opening up | G, as it leaves the hand |
| `flare-burn.wav` | A flare burning (3 s loop) | A sputtering hiss with pops over a low roar | For its 12 s, from where it lies |
| `strike.wav` | A strike landing on you (25 health) | The swing's whoosh, a body thud, a breath knocked out | On a hit |

## Next, if the synth isn't enough

The plan says synth first and a CC0 shortlist to audition for the guns. For
that: Freesound filtered to **CC0** ("revolver", "38 special", "shotgun
outdoor", "pump action", "road flare ignite"), and Kenney's CC0 packs for the
small mechanical clicks. Nothing is picked yet: any recording goes in
`apps/client/public/sfx/CREDITS.md` like the rest.

## Mix notes for phase 8

- The drone and whispers sit under the Grounds' wind (`GroundsSound`'s wind
  bus), ducked inside and gone indoors (inside is always safe, so silent).
- The heartbeat ducks the drone by ~6 dB while it plays.
- Shots are the loudest thing on the Grounds; give the treeline echo its own
  delay so others far off hear mostly the echo.
