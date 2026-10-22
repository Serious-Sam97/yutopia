# The guns' sounds (docs/plan/32-the-arms.md)

Synthesised in the game (`apps/client/src/world/dark/synth.ts`); these WAVs are rendered from it
(`node --experimental-strip-types design/screens/arms/sounds/render.mts [name …]`), so there's one
source. Peak-normalised for listening, not mixed (the game sets each one's level).

| File | What | When |
|---|---|---|
| `revolver-shot` · `-in` · `-far` | The .38: the hammer's fall, the blast's front, crack, bark (1.2 kHz), the body 140 → 45 Hz, the gas, driven; out on the land (the treeline, the woods' tail), in a room (quick reflections, a short dense tail), far off (dulled) | A shot: mine by where I am; anyone's far off past 22 tiles |
| `shotgun-shot` · `-in` · `-far` | The 12 gauge: bigger and lower — bark at 700 Hz, the body 110 → 32 Hz, a long rumble | The same |
| `revolver-cock` | Click-click: the hammer back, the cylinder locking | Coming up to aim; after each shot |
| `revolver-gate` | The loading gate's spring click | A reload starting (and, a touch lower, ending) |
| `revolver-load` | The spent case punched out, the round slid in, seated, the ratchet a notch on | Each round |
| `revolver-dry` · `shotgun-dry` | The hammer on nothing; the tumbler in the wood | Fire, empty |
| `shotgun-break` | The top lever, the barrels dropping on the hinge | Broken open |
| `shotgun-eject` | The fired shells' two plastic pops | Just after the break, if any were fired |
| `shotgun-shell` | A shell slid in, its rim seating | Each shell |
| `shotgun-shut` | The action's snap, the lever home | Shut |
| `gun-draw` · `gun-holster` | Cloth and steel | Drawn, put away |
| `brass` · `shell-drop` | A case's tinkle; a shell's plastic tock | Spent ones landing |
| `hit-tick` · `hit-head` · `hit-kill` | In my ear: a hit, the head, one put down | My shot's hits |
