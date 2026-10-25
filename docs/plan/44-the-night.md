# The night — can't see a thing (plan — decided 2026-10-24; phase 0 approved, phases 1–5 built 2026-10-24/25)

> Follows `27-the-grounds.md` (truly dark nights, the torch), `30-the-dark.md`
> (the shadowed, the lamps as islands) and `28-the-car.md` (the cars driven).
> Workflow rule: mocks first (phase 0), approved before any code.

Ask (2026-10-24): "Now it's night and we can see everything outside. I'm thinking
of something really dark, because we already have a light and a car, so the night
should not be a problem. Really dark, like can't see shit."

Decided with the user (2026-10-24):

| | |
|---|---|
| How dark | **Pitch black.** Away from a light you see nothing: snow, trees and sky all black, no stars under the overcast |
| The eyes | **They adjust, both ways.** Out of the lit lobby you're blind for a few seconds; after a while in the dark the nearest shapes come back; a lamp or headlights in your face and they're gone again |
| Other people | **Seen only when lit**, or within a couple of tiles of you: their names, their bodies, the shadowed |
| The iso view | **The same rules**: neither view is a way round the dark |

## Where we are

- **The hour's light** (`art/daylight.ts` `KEYS`): night's ambient is
  `[0.44, 0.46, 0.66]`, about half of noon's. Indoors and outdoors share it.
- **The land's light in 3D** (`tp/sky.ts` `setDay` :197): `landLight` = ambient ×
  `(1 − 0.75 × night)`, so ~0.11 at night. It scales the sun or moon *and* the
  sky's hemisphere fill on every Grounds material (`tp/light3d.ts` :115–127).
  Snow is near white, so 0.11 of it still reads clearly.
- **The sky** (`art/themes/snow.ts` `SKY`): midnight is `#141a28 / #2a3346 /
  #4a5670`, a lit navy. The stars fade in with `night`.
- **The fog takes the sky's middle colour** (`tp/view.ts` `weatherFrame` :3162):
  at night the distance fades to `#2a3346`, not to black. That's what draws the
  tree line and the ridges against it. In a storm it goes to a pale `stormFog`.
- **The lamps**: the nearest twelve are real point lights (`tp/view.ts` pool
  :506–511), the rest glow. Pools in iso.
- **The torch**: two real spot lights in 3D (mine and the nearest other,
  `tp/view.ts` :624). In iso, a beam drawn on the ground. The beam's reach is
  shared `beam.ts`, also used by the server for the burn.
- **Headlights are a picture, not a light** (`tp/campus.ts` :886–1015): a
  `MeshBasicMaterial` decal on the snow ahead of the car (`beam.opacity = night
  × 0.8`). It lights no tree, no person, no other car.
- **The cars' paint** reflects an environment map (`tp/car/sedan.ts`, the
  generator kept since round 5). At night it still shines.
- **Iso** (`art/grounds-iso.ts`): one `tint` per sprite from `setAmbient` (land
  chunks, trees, things), plus the lamp pools and beams added on top. People
  get `lightAt(x, y)`. A tree half in a lamp's pool is tinted all one way.
- **Who's lit** (`tp/view.ts` `landTint` :3202, iso `lightAt` :614) is worked
  out per person for their body. Name tags show regardless.

## The idea

**Outside at night, light is the only thing that exists.** Your torch is a cone
of world in the black. A car is a pair of white eyes coming up the driveway, and
its beams paint the trees as it passes. A lamp post is an island of snow. The HQ
is the brightest thing for a kilometre, its windows laying yellow squares on the
snow. You can tell someone's there only when they step into a light, and the
shadowed are worse: the dark is their armour already, and now it's yours to lose.
**Indoors nothing changes.**

## The mechanics

### N1 — The dark

- **Outdoors gets its own curve.** `daylight()` gains `dark` (0..1): 0 by day,
  ramping over dusk (19:00–21:30) and dawn (5:00–7:00), **1 from 21:30 to 5:00**.
  `ambient` stays as it is, so the offices lit by it don't change.
- **`landLight` at full dark ≈ 0.003** (linear), the moon and the hemisphere
  fill both going (today 0.11). The eyes (N3) lift it to ~0.01. (0.01 on white
  snow is still plainly grey on screen: phase 0.)
- **The lot and the campus outside too**: they take the sun and the sky's fill
  through the light map, not `landLight`. They go dark through the open sky's
  balance (`lmSunOut` / `lmFillOut`), since the rooms share the fill. The cars'
  paint, the far ridges (unlit, no fog), the lamp posts' poles (unlit) and the
  falling snow (unlit points) each go dark with it.
- **The sky**: new night keys, `#030407 / #05070b / #080a10`, almost black with
  a hint of cloud. Stars off once `dark` passes 0.6 (the overcast). **No town
  glow** on the horizon (the user's call, 2026-10-24): the sky is black all
  round, and the GPS is the only way to tell which way you face.
- **The fog goes to black**: its colour follows `landLight`, not the dome. Its
  distance stays as it is: black fog brought in close hid the lamps' pools with
  everything else (phase 0). A blizzard's fog stays black at night (today it's
  pale), and only the flakes inside a beam show: the snow drawn lit there.
- **Lights ignore the fog**: lamp heads, glow cards, headlamps, tail lights and
  lit windows stay visible a long way off as points in the black (`fog: false`
  on those materials).
- **Everything outside darkens with it**: the campus's outsides, the lot's
  asphalt and cars, the falling snow, the footprints and breath. The cars' env
  map intensity goes with `1 − dark` (no shine in the dark). Anything still
  lit after the change is a bug: there's a check for it in the e2e (N5).
- **Iso: a light map.** A half-resolution render texture over the land, black,
  with the lights cut out of it (pools, beams, headlight cones, window spills,
  flares), multiplied over the land layer and under the HUD. The per-sprite
  `tint` stays for the day. A tree half in a pool is now half lit. Built in the
  lazy dark chunk (see the risks: Pixi's pipes for lazy classes).

### N2 — The lights that matter

| | 3D | Iso |
|---|---|---|
| **Headlights** | **Real spot lights**: yours when you drive and the nearest other car with its lights on (2, made at start at 0 intensity, no shadows). Further cars keep today's decal. Their lamps glow through the fog | A cone on the light map, like the torch's but wider and longer |
| **Lit windows** | Each lit window lays a soft yellow square on the snow below it (an additive decal per wall, merged). The HQ lights the lot's near rows | The same squares on the light map, and the windows themselves cut out of it (they're on the walls, not the floor's tiles) |
| **Lamps** | Their pools a touch warmer and wider, so they read as islands. The lot's pools (`lmGlowK`) about twice today's: they barely read in the dark | Pools on the light map |
| **The torch** | The light spills ~30% past the shared beam's reach, fading, so you see where you're going. `beam.ts` (the burn) stays as it is | The same on the light map |
| **Tail lights, brake lights** | A red glow on the snow behind | A red smear behind |

### N3 — The eyes

`shared/eyes.ts`, client side only, one number per viewer, `eyes` 0..1:

- **In the dark it climbs** over ~40 s to 1 (slow at first). Fully adjusted, the
  land's light is ~0.01 instead of 0.003: the nearest trees and the snow at
  your feet come back, grey and colourless; the far ones are still lost in the
  black fog.
- **A bright light knocks it down fast** (~0.5 s): standing in a lamp's pool,
  being indoors, a car's headlights facing you within ~25 tiles, a flare. It
  isn't knocked down by your own torch on the snow (it'd make the torch useless),
  but it is by someone else's beam in your face.
- **Stepping out of the lobby** at night is a few seconds of only the lamps and
  the windows, then the shapes coming back.
- `eyes` drives `landLight`'s floor (and the open sky's balance on the lot) in
  3D, and the light map's black alpha in iso. Indoors it's 0 and unused.

### N4 — Seen and unseen

- **A person outside at night is seen** if they're lit (`landTint` or `lightAt`
  over a threshold), or within 2.5 tiles of you. Otherwise their body is black
  (it already takes the light), and **their name tag and emote are hidden**.
  The threshold decides, not the renderer: point lights fade out slowly, so a
  body past a pool's edge is still faintly there (phase 0, `05`).
- **On the lot too**: people there take the light map's tint, not the land's,
  and stayed fully lit in the dark (phase 0). They get the same rule.
- **Chat bubbles still show**: you can hear someone talk in the dark. Voice
  chat already gives away where they are.
- **The shadowed** follow the same rule, so they're unseen until they're in a
  light. Their steps in the snow are heard first (if `features/dark` has no
  sound for it yet, it gets one: a crunch, panned and by distance).
- **The GPS and the minimap stay** (the phone). The minimap shows no other
  people outside at night, only your friends who share their location (as the
  GPS does today).
- **Your own body** is always drawn faintly, so you know where you are.

## Phases

| | Work | Exit |
|---|---|---|
| 0 | **Mocks** (`design/screens/night/`, painted over `/dev/grounds?shot=…&hour=night`): `01-lot-now-vs-dark`, `02-driveway-headlights` (a car coming at you, its beams on the trees), `03-woods-torch` (the torch the only light), `04-lobby-door` (stepping out: 0 s, 5 s, 40 s), `05-lamp-island` (someone in a pool, the dark round them), `06-blizzard-night-torch`, `07-iso-night` (the lot's edge into the woods, a car, a torch), `08-names` (a friend out of the light, then in it) | the user approves the stills |
| 1 | **The dark** (N1): the curve, the sky, the fog, the stars, the land's light, the outsides, the cars' shine, the snow, the iso light map | the stills match the mocks, in both views |
| 2 | **The lights** (N2): real headlights, windows on the snow, lamps, the torch's spill, tail lights | drive the driveway at night with someone walking it: the beams light them and the trees |
| 3 | **The eyes** (N3) | lobby → woods → lamp → car facing you, each behaving as decided |
| 4 | **Seen and unseen** (N4) | two browsers: B out of every light is gone for A, name and all; in A's beam B is there |
| 5 | **Checks** (below) | green |

## Phase 0 — the mocks (approved 2026-10-24)

In `design/screens/night/` (its README has each still and what was learned), made by
`e2e/night-shots.spec.ts`:

- **From the game itself**: the lot tonight against the dark (`01`), the lobby's doors
  at 0, 5 and 40 s (`04`), and iso under a painted light map (`07`).
- **From the stills**, a new `pitch` hour in `tp/grounds-shots.ts` with `&eyes` and
  `&storm`: headlights (`02`), the torch at three eye levels (`03`), a lamp's island
  (`05`), a night blizzard (`06`), someone out of and in your beam (`08`).

What they changed in the plan is folded in above: the light levels (N1, N3), the fog
staying where it is, the lot going dark through the open sky's balance, the lot's
lamps and people (N2, N4), the iso windows, and the bloom. The town's glow on the sky
was mocked too and turned down: the sky stays black.

## Phase 1 — the dark: built (2026-10-24)

Stills of the game at 23:00, nothing poked, in `design/screens/night/built/`
(`e2e/night-shots.spec.ts`, its "built" test).

- **`daylight()` has `dark`**: 0 by day, down over 19:00–21:30, 1 until 5:00,
  up again over 5:00–7:00. The ramps are slower than dusk and dawn themselves:
  2 h and 1.5 h stacked on them broke `lighting.spec`'s smooth day (a
  half-hour step of 45 on the lot, at dawn). `DARK_LEFT` and `darkK` say how
  much of the sky's light is left (geometric: it falls evenly).
- **3D**:
  - the land: `landLight` × `darkK(dark, 0.035)` (sky.ts);
  - the campus outside: `lmSkyLeft` on its patch (light3d.ts) and on its
    tinted things, trees and steam (campus.ts). Only the dark scales it, so
    its dusk and dawn are as before;
  - the lot: the light map has an open-sky ambient (`LightMap.open`,
    `outAmbient`); its lamps' light stays. People on the lot take it too, so
    they go dark there (part of N4, for free);
  - the cars: every lit material of a vehicle takes `skyLeft`
    (`tp/sky-left.ts`, its own module for the cars' chunk) and their
    reflections go black;
  - the sky: the night keys all but black (`themes/snow.ts`), the fog with
    them; no stars past dark 0.6; the far ridges follow `landLight`; the
    footprints and the breath with it.
- **Iso**: the land's ambient × `darkK(dark, 0.06)`, the lot through the same
  light map ambient, the building's shell, the footprints with the land. Its
  light-map *layer* isn't needed for this: the lamps' pools and the beams are
  drawn over the dark land already. A tree half in a pool is still lit all
  one way (phase 2 if it shows).
- **Not yet, by phase**: the lamp posts' poles still shine (lit by their own
  lamp in the light map; phase 2 with the lamps), the lot's pools are weak
  (phase 2), your own body is lit on the land (phase 4).
- **Checks**: `daylight.test` 4/4, client unit tests 29/29; `lighting.spec`'s
  smooth day and lamps-never-pop pass; the beam half of `night.spec` passes.
  Two failures that are the same without these changes: `lighting.spec`'s
  "no GL errors" (684 INVALID_OPERATION draws) and `night.spec`'s storm
  check (0.92 eased in 1.5 s, wants 0.95). The page is 559.2 KB (558.8
  without these changes: the curve, the light map's open sky and the engine's
  dark are page code); its budget raised to 559.5 by the user's call
  (2026-10-25).

## Phase 2 — the lights: built (2026-10-25)

Checked in `design/screens/night/built/` (`e2e/night-shots.spec.ts`: "built: the dark"
and "built: headlamps on someone").

- **Headlamps as real light**, with no light added to the scene: the car module's two
  spots (always there, so nothing recompiles) are my car's while I drive with them on,
  and on foot the nearest car with its lamps on within 80 tiles: another player's
  (its `CAR_FLAGS`), or a Grounds vehicle on the move (`ThirdPersonView.vehicleLamps`,
  their lamps placed from each model's box). As a passenger, the car I ride in. Whoever
  stands in them takes their light (`headlampTint`, the people's tint). This replaces
  the plan's "yours and the nearest other": two spots, given to one car.
- **Iso**: a car's beam on the ground (the torch's picture, wider and 13 tiles long,
  warm) and its light in `lightAt`; the Grounds' own vehicles only on the move, a driven
  car with its lamps on (`fl` from the room's vehicles, through `grounds-life.ts`).
- **Tail lamps**: a red patch on the snow behind every vehicle (`tp/tail-glow.ts`),
  brighter braking; in iso a small red pool.
- **Lamps**: the lot's pools three times as strong at full dark (on the dark asphalt
  twice still barely read); the Grounds' lamps' reach 25% wider. Out under the sky in
  the dark a high lamp's light falls on faces turned up: its pool (`lmGlow`) on those
  only, its baked light 8% on a standing face. The lot's poles, which shone white under
  their own lamps, are dark now; their heads still glow.
- **The torch**: its haze a third as thick at full dark (it hid what the beam lit); in
  iso its picture runs 30% past its reach (`SPILL`). The 3D spot already reached past it.
- **Lit windows**: a soft warm fan on the ground out from the HQ's facade, a tile at a
  time, some dark (as the offices above are), just over the pavement's kerb
  (`campus.ts` spill). It reads as a thin band from the lot; the iso view's windows
  already show the rooms inside.
- **Not done**: the lot's lamp posts don't light the snow just off the lot (in either
  view; the light map stops at the floor's edge) — seen in the iso shot by the lawn.
  The other blocks' and the town's windows lay no light. Lights through a blizzard's
  fog: the fog stays where it was (phase 0), so nothing to do there.
- **Checks**: lint, types, client unit tests 29/29; `lighting.spec` smooth day and
  lamps-never-pop pass; `car.spec` 2/3 — its "driven out with a passenger" fails the
  same way without these changes (no car prompt in 20 s), as does `lighting.spec`'s
  "no GL errors". The page stays at 559.2 KB; the Grounds' chunk 181.1 (of 187).

## Phase 3 — the eyes: built (2026-10-25)

- **`world/eyes.ts`** (not `shared/`: only the client needs it): seconds adjusted, up to 40 in the
  dark (`eyesOf`: smoothstep, slow at first), down to none in half a second under a full glare
  (`glareOf` of the light where you stand: a lamp's pool, the rooms, headlamps or someone's
  torch on you — not your own; nothing by day). Run each frame by the dark's chunk (it loads
  the first time you're out; until then the eyes are 0, the darkest).
- **The light where you stand** (`glareAt`): 3D the people's tint (the light map, the land's
  tint without your own torch, the real headlamps); iso the land's `lightAt` without a torch held
  there, or the floor's light map.
- **What they lift** (`EYES_LIFT` in daylight.ts): the land and the campus and cars in 3D
  (`landLight`, `skyLeft`: 0.035 → 0.12 of the night's), the lot in 3D as a fill of its own
  (`lmEyes`, no light map composite), iso's land (0.06 → 0.16, its tint a step of 0.03 at a
  time) and its lot (its light map composited again, a quarter at a time).
- **Checked** (`night-shots.spec`, "built: the eyes…", `built/3d-eyes.png`): on the lawn at
  23:00 0.002 at 1 s, 0.07 at 6 s, 1.0 at 42 s; under a lot lamp 0 within 1.2 s. Headlamps:
  Bia's glare 0.79 in front of a lit car, 0.001 behind it. Iso: 0.82 after 26 s, the lot at 0.75.
- **Found on the way**: the client's `pnpm test` glob wasn't quoted, so the shell expanded it —
  a test file at `src/world/` matched alone and the other 29 stopped running. Quoted
  (33 run). And `car.spec`'s "driven out" fails because at a parked car's nose you stand in the
  free bay across the aisle, whose "claim this bay" prompt wins (docs/plan/43): the night's
  headlamps check gets in from closer.
- **Budgets**: the page 559.4 of 559.5 KB (the engine's `setEyes`, `glareAt`); the dark chunk
  30.3 KB.

## Phase 4 — seen and unseen: built (2026-10-25)

- **The rule** (`world/eyes.ts` `unseen`, `SEEN`): out under the sky with `dark` past 0.5, someone
  is unseen when the light on them is under 0.08 (their tint's luminance) and they're more than
  2.5 tiles from you. And `nearLift`: what's right round you is faintly lit (up to 0.1, nothing
  at 2.5 tiles) — your own body, someone a step away.
- **3D**: one `lightOn` for both kinds of people (the drawings and the 3D characters): the floor's
  light map, the land's tint, the real headlamps, the lift round me; unseen → the name pill and
  the emote hidden, the chat bubble kept. **Found and fixed**: the 3D characters out on the land
  sampled the floor's light map at its edge (the rooms' moonlit ambient), so they were lit at
  night and no torch or lamp touched them. Now past the floor's map a light-mapped surface takes
  `landLight` (a wall's outer face too), and each character out there has its own copy of the
  body's material (the same shader: nothing compiles) coloured with its tint over `landLight`.
- **Iso**: the land's `lightAt` lifts round me (`grounds.dark`, set by the dark chunk); the
  engine asks `unseen(x, y, tint)` (filled by the dark chunk) before drawing a name or an emote.
- **The dark HUD's teammate tag** (distance, health) hides for the unseen too — it gave them away.
- **The minimap**: after dark nobody on the lot's open tiles (the land is off its map already).
- **The shadowed**: they were already unseen in the dark (their shroud). Their steps in the snow
  are new (`dark/voices.ts` `crunch`): a banded noise burst every 0.75 tiles they move, panned,
  heard 22 tiles.
- **Checked** (`night-shots.spec`, "built: seen and unseen"): Ana's torch on, Bia eight steps off
  the beam: unseen, no name, a dark shape (`built/3d-unseen.png`); six steps along it: seen, her
  name (`3d-seen.png`); iso, off every light: no tag (`iso-unseen.png`). Unit tests 35/35;
  `lighting.spec`'s smooth day and lamps-never-pop and the other night checks pass.
- **Not done**: your own body on the lot in iso between its lamps isn't lifted (the lot is the
  light map's; the lift is the land's). The GPS's friends are as before.
- **Budgets**: the page 559.5 of 559.5 KB — none left (the engine's hook, the minimap's filter);
  the dark chunk 30.8, the Grounds' 182.5 of 187.

## Phase 5 — the checks: done (2026-10-25)

- **`night.spec`**, new (GPU): "the pitch dark: black off every light, lit in a beam; a name only
  in the light" — on the lawn at 23:00 the snow 15 tiles off any light 2.5% luminance (under 3%),
  the snow in Ana's beam over 2.5× that; Bia off the beam unseen with no name, in it seen and
  named. The headlamps on someone (Bia's glare 0.79 in front of a lit car, 0.001 behind) are
  asserted in `night-shots.spec` ("built: headlamps on someone"), with the eyes ("built: the
  eyes…") and seen and unseen in iso.
- **`night-perf.spec`**, new (GPU, High, 23:00): in a lot car its lamps off and on again — 178
  programs both (nothing linked); the eyes adjusting on the lawn (0.49) — 178; driving out with
  the headlamps on 60.0 fps, p95 16.7 ms; a night blizzard with the torch on 60.0 fps, p95
  16.8 ms. (Getting into a car links 2 programs — 176 → 178 — the car's own, not the night's.)
- **`pnpm perf`**: 60 bots, tick 0.454 ms average, 0 put back.
- **Suites** (`lighting`, `night`, `car`, `night-perf`): 7 pass, 1 skipped; 3 fail as they do
  without the night (the passenger drive: the free bay's prompt at the car's nose, plan 43;
  "no GL errors"; the storm's easing in 1.5 s). Client unit tests 35/35.
- **Budget**: the page 559.5 of 559.5 KB, the dark chunk 30.8 of 80, the Grounds' 182.5 of 187
  (phase 5 is tests only).

## After phase 5 — the lamps brighter, and every one lit (2026-10-25)

Ask: "The post lights are really dim, increase. And also some don't show light."

- **Why some showed none**:
  - *Iso, the lot*: its snow cover was tinted with the land's light (at night ~6%) and then
    multiplied by the floor's light map as well — the lamps' pools went twice as dark and none
    showed. It's untinted now: the light map alone lights it (`grounds-iso.ts`).
  - *3D, the lot*: its snow cover (`roads3d.ts lotCover`, up to 92% over the asphalt) took the
    land's light, not the lot's lamps — the pools showed only where it's worn. It's lit by the
    floor's light map now (`userData.onFloor`, sky.ts `floorLit` → `Light3.patch`, which applies
    a material's own extra patch too).
  - *3D, the Grounds' lamps past the four nearest*: their pool was one flat quad at the lamp's
    own height, under the land's rolls round it. It's draped over the ground now, a cell at a
    time (`grounds3d.ts pool`). The campus's road lamps' pools sat under the pavement's kerb:
    lifted over it.
- **Brighter**: the lamp post's light 9 → 11 tiles, 0.7 → 1 (shared catalog); the lot's pools
  in 3D five times as strong at full dark (`lmGlowK × (1 + 4·dark)`); what stands under a lamp
  post (people, cars) lit up to 8× at full dark; the Grounds' lamps' pools 0.5 → 0.85.
- **Checks**: `lighting.spec`'s lamps-never-pop measured in a lamp's full strength (a fade's steps
  grew with the lamps; a whole lamp at once still fails it), smooth day, the pitch dark,
  `night-perf` pass; unit tests 35/35, shared 293/293; the page 559.5 of 559.5 KB.

## Tests

- **`daylight.test`**: `dark` is 1 from 21:30 to 5:00 and 0 by day; noon and
  midnight `ambient` unchanged (indoors).
- **`eyes.test`**: 0 → 1 in ~40 s of dark; a lamp knocks it to 0 in under a
  second; your own beam doesn't; headlights facing you do, from behind they don't.
- **e2e `night.spec`** (extended):
  - at night, pixels 15 tiles off any light are near black (luminance < 3%),
    in the beam they're lit;
  - B's name tag is hidden out of the light and shown in A's beam;
  - a car's headlights light B (B's body brighter than beside the beam).
- **`lighting.spec`** stays 5/5 (the lamps never pop).
- **Perf**:
  - no shader program linked when a car's lights come on or the eyes change
    (`renderer.info.programs` steady: the spots exist from the start);
  - ≥ 60 fps on High at the lot at night with two cars driving and two torches,
    and in a night blizzard;
  - `pnpm perf`: 0 put back.
- **Budget**: the page at 559.5 (phase 1). The eyes go in the lazy dark chunk.

## Risks

- **Shader links mid-game** (`38-the-lag.md`): a light count that changes
  recompiles every lit material. The headlight spots are made at start at 0
  intensity, like the torch's, and never removed.
- **A castShadow light never drawn breaks every lit draw on High**: the new
  spots cast no shadows.
- **Pixi's lazy pipes**: a Pixi class (the light map's render texture, its
  blend) used only in a lazy chunk may have no pipe in the renderer. Check it
  the way `pixi-lazy-pipes` says, or register the pipe from the page.
- **Bloom**: brighter lights on a near-black frame is where the bloom spreads:
  a torch on the snow at your feet bloomed over half the frame in phase 0. The
  stills settled on a weaker, higher bloom in the dark (0.55, radius 0.45,
  threshold 0.82) and the beam's haze at a third of today's. `litCap` and the
  bloom get looked at in phase 2, on every quality.
- **Dark monitors**: pitch black is the intent, so there's no brightness slider.
  The HUD, the phone and the menus are untouched, so nobody's lost in a menu.
