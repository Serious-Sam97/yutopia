# The night — phase 0 mocks (docs/plan/44-the-night.md)

The pitch dark, for approval before any code. Made by `apps/client/e2e/night-shots.spec.ts`
(`YUTOPIA_GPU=1 npx playwright test night-shots`), from two sources:

- **The game itself** (01, 04, 07): tonight as it is, then the same frame with the dark poked
  into the running view: the sun or moon and the sky's fill off, the sky, ridges, stars and fog
  black, the falling snow and the cars' shine dimmed, and the eyes as a faint fill. Only the
  numbers are changed; no code is. The iso light map (07) is painted over the game's own frame:
  a black layer with the rooms, the lamps' pools and the beam cut out of it.
- **The stills** (02, 03, 05, 06, 08, 09): `/dev/grounds?shot=night-…`, with a new `pitch`
  hour (`tp/grounds-shots.ts`): no moon, no sky fill, black fog, nobody gives off light but
  you (faintly), and `&eyes=0..1`, `&storm=1`. The headlights, lamps and
  torches in them are real lights. The notes and the name tag are HTML laid over them.

| | What it shows |
|---|---|
| `01-lot-now-vs-dark` | The lot tonight (top) and in the dark (bottom), from Ana's height and from above. The lamps and the HQ's windows are what's left |
| `02-driveway-headlights` | Between two lamps on the driveway: Bia's car coming, its low beams lighting the verge and the poles; Ana on the far verge |
| `03-woods-torch` | The ravine trail as Cai, the torch the only light (eyes 0.6). `03b` eyes 0, `03c` eyes 1 |
| `04-lobby-door` | Out of the lobby's doors: tonight, then 0 s (blind), 5 s and 40 s in the dark |
| `05-lamp-island` | The clearing's lamp: the guard on the bench in its pool; Bia past its edge, a shape you might miss |
| `06-blizzard-night-torch` | The ravine trail in a night blizzard: the fog black, the driven snow faint |
| `07-iso-night` | The lot in iso tonight (top), then under its light map (bottom): the beam and the lamp's pool |
| `08a-names-out` / `08b-names-in` | Bia nine steps ahead: off the beam, nothing; in it, her body and her name |

## Seen while making them (they change the plan)

- **The dark is far darker in numbers than it sounds.** 0.01 of light on white snow is still
  plainly grey on screen (sRGB). The dark wants the land's light at ~0.003, and ~0.01 with the
  eyes adjusted, not the 0.01 and 0.035 the plan first said.
- **Fog can't be the darkness.** Black fog brought in close hid the lamps' pools with
  everything else. The fog stays where it is, just black; the eyes are a faint fill instead,
  and the lit things stay lit at any distance.
- **The lot isn't the Grounds.** `landLight` reaches only the Grounds' materials. The lot, the
  campus outside and the cars take the sun and the sky's fill through the light map, so those
  have to go to nearly nothing outdoors too. The view shares the fill with the rooms, so it
  goes through `lmSunOut` / `lmFillOut` (the open sky's mask), not the light itself.
- **Things that glowed on their own**: the far ridges (unlit, no fog), the lamp posts' poles
  (drawn unlit: bright white in the black), the falling snow (unlit points), the cars' paint
  (the environment's shine). Each needs the dark.
- **The lot's lamps are weak islands.** Their pools on the asphalt barely read in the dark,
  while the Grounds' lamps (real lights) do. The lot's pools want to be about twice as strong.
- **People on the lot stay lit**: they take the light map's tint, not the land's. Ana is fully
  lit in 01 and 04. N4 has to darken people on the lot as well as on the land.
- **Lights leak past their pools.** Three.js point lights fade out slowly, so Bia in 05 is
  faintly there past the lamp's edge. Whether someone is *seen* (their name) is N4's threshold,
  not the renderer's.
- **Bloom in the black**: a torch on the snow at your feet blooms over half the frame. The
  stills use a weaker, higher bloom for the dark (0.55, radius 0.45, threshold 0.82), and the
  beam's haze cone at a third of today's strength.
- **The iso light map must cut the lit windows too.** They're on the walls, not the floor's
  tiles, so 07 darkens the HQ's facade, windows and all.
- **The flakes in a beam**: lit white in a beam is the best part of a blizzard at night, and
  the snow is drawn unlit today. Not in 06; phase 1.
- **The town's glow** (a sodium smudge low on the sky towards Main Street) was mocked and
  turned down: the sky stays black all round.
