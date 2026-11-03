# 66 — The water

Ask (2026-11-02): "There is some invisible walls in some parts of the map? I found some next to
rivers" → "Actually, lets do this now then! Add swimming mechanics and improve water quality!"
Planned 2026-11-02. Follows `65-the-weather.md` (W6: the water open or frozen, its shores walls),
`56-the-controls.md` (the keys, the mouse as the camera), `58-the-animation.md` (the body),
`61-the-sway.md` (worn things on Jolt), `63-the-steps.md` (the steps' sounds) and `64-the-fog.md`
(the global fog hook). Workflow rule: mocks first (phase 0), approved before any game code; the
body's motions signed off on `/dev/anim` before they reach the world (plan 58's rule).

**This changes what the water is.** Today it is a picture on flat ground fenced by invisible
walls. After this plan it is a body you go into: shallows you wade, deep water you swim on and
dive under, cold by the weather, a river that runs one way, down from the hills to the south.

## Where we are

### The invisible walls

- **They are plan 65's shores** (`physics/build.ts:309` `waterWalls`): while the water's ice is
  under `ICE_WALK` 0.8, Jolt gets 0.3 m walls, 2.2 m over the water: round the pond at its edge,
  the dock's deck fenced on three sides, and both sides of the river's bed at w/2 + 0.15 (11.15 m
  from its middle). `WorldBuilder.water(open)` (:395) adds or takes them; the client calls it every
  second (`tp/physics3d.ts:147`), the server every tick (`world-server/features/physics.ts:113`).
- **Measured 2026-11-02**: every metre of the river's walls against the land and the one road
  bridge — none stands on dry land, none pokes through the deck (its top is 0.07–0.45 under it).
  The wall a walker meets is at the drawn water's edge (the ribbon reaches 11.6 m; a body stops at
  ~11.6). It is the shore, drawn as nothing.
- **The water's been open for two days** (rain at 5–9 °C), so they are up everywhere. Over the
  last fortnight the water was open 50% of the time, part-frozen 8%, walkable 42%.
- **They are layer `wall`, which the camera's sight ray meets** (`view.ts:3611`): near a shore the
  third-person camera is pulled in by them.
- **The grid closes open water separately** (`grounds.ts:2090` `walkableTile`): paths, pets, the
  NPCs, teleports, getting out of a car and the walk before Jolt loads all keep off it.

### The water has no depth

- **The pond is flat land at `POND_LEVEL`** (−1.69; `grounds.ts:1164`, :1170), easing back over
  1 → 1.9 of its ellipse. **The river's bed is flat land at `RIVER.h = macro − 2.6`** (:1152), 22 m
  wide, its banks easing up over 14 m (:1175) — about 1.6 m high at z −93.
- **The water is drawn on it**: ice at +0.04, the water 2.5 cm under (`tp/grounds3d.ts:1191`
  `water()`). Take the walls away and people walk on the water's surface.
- **The river runs uphill.** `RIVER.h` follows the land: 44.3 m at its north end (z −990, in the
  hills past the Kart Park), down a 44 m slope to 0.5 by z −904, 0.5–2.3 to z −605, −4.2 by −579,
  back up to −0.3 at z −8, down to −5.0 at z 104 and up to +7.2 at its south end (z 208, past the
  land's edge at 172). The ribbon and the walls follow all of it.
- **The dock has no solid**: its deck is drawn 0.55 over the water and walkers on it walk the
  ground 0.67 m under its planks (`grounds3d.ts:1266`; an old bug).
- **The ravine's creek** is a 2.8 m ice line on the ravine's floor, walked as grass ("waded" is
  only a comment, `grounds.ts:2094`).

### How it's drawn

- `grounds3d.ts:1191-1345`, built once for the whole river (the statics' radius is 900).
  - **The water**: an opaque white `MeshLambertMaterial`, FrontSide, `wx="water"`. A `wxSide`
    attribute (0 the middle, 1 a shore) stands in for depth.
  - **Its shader** (`tp/wx3d.ts:370` `WX_WATER`): dark teal by `wxSide`, the sky's one horizon
    colour as a fresnel, two scrolling noises that change only the brightness (stretched along x:
    they streak *across* the north–south river), rain rings, a dark band at the shore.
  - **What it has not got**: depth, a moving normal, any flow, foam, a sun glint, reflections (no
    `scene.environment` in the game), anything seen from below (FrontSide: from under it the sky
    shows straight through), reeds. The canoe is upturned on the deck under snow.
  - The running length along the river, `v`, is worked out and thrown away (:1319) — a ready
    flow coordinate.
- **The tiers** (`lib/prefs.ts:37`): the wx layer is the same on all of them; new shader
  *variants* cost load time (plan 65:1261), so the water's options should be uniforms.
- **The depth texture** on Medium/High (`post3d.ts:82`) is the ink's; the water writes into it,
  so depth under the water has to be analytic (the bed's depth per vertex).

### The body

- **One pure step moves a body**: `stepBody` (`shared/move/step.ts:191`), on the client only;
  Jolt's `CharacterVirtual` carries it out (`physics/body.ts:144` `CharacterMover.step`). The
  server takes positions as sent (`WorldRoom.ts:832`). There's no mode enum: a mode is whichever
  of `Body`'s fields is set (`verb`, `flow`, …), checked in order.
- **The precedent**: admin flying, `stepFly` (`world/input/walker.ts:124`, chosen at :557), runs
  the mover with `fly = true` — no gravity, no landing, no stick-down. A swim step is that plus
  buoyancy and drag.
- **The determinism tests pin today's numbers** (`move.test.ts:433`, :658): `stepBody` must stay
  bit-identical for anyone not in water.
- **"In the air" is read from the height**: `person3d.ts:510` `up = jump || h > ground + 0.03`
  and the remotes' `theirJump` (`controller.ts:2897`). A floating swimmer reads as falling: the
  fall pose, the landing squash, the ragdoll at 6 m, the camera's air pull (`view.ts:2600`).
- **The animation is all procedural** (plan 58): channels → `body(c)` (`chars/moves.ts:159`),
  layers in `Locomotion.compose` (`chars/locomotion.ts:724`). A new mode is a flag in `LocoIn`, a
  pose function in a lazy module, a blend, and the ground layers turned off (foot lock, stepper,
  `grounded`, life). `crawl2` (`anim/night.ts:219`) is the nearest template for a stroke.
- **Motion3's layers have no gating**: a held mug, the phone, emotes would play over a swim.
- **On the wire** (`schema.ts`, 61 of 64 fields): position, `mv` (gait in bits 0–2; 64 and 128
  free but masked off at `WorldRoom.ts:863`), `flow` (codes 8–15 free), `jump`. Everything a
  swimmer is can be worked out from where they are, given one shared `waterAt`.
- **Sway** (`sway/sway.ts`): no gravity factor or force hooks yet; jolt-physics 1.1.1 has
  `ApplyBuoyancyImpulse` and `SetGravityFactor`, unused.

### What else meets the water

- **Cars aren't on Jolt**: their sim reads `heightAt` and the "ice" grip, so a car driven into
  the open river today drives across its surface. The tow's `freeSpot` can pick a spot on the
  water; a door over the water puts you on it (`cars.ts:446`). Two snowmobiles are parked *on* the
  pond (`car/homes.ts:57`). Karts never reach the river (their fence ends at x 236).
- **Pets** path on the grid; a swimming owner leaves them whining on the bank (`pets.ts:3055`);
  the river's ice is a "wild" zone where a pet may never come back (`pets.ts:2475`).
- **The shadowed** can't enter water and strike within reach (`features/dark.ts:293`): a swimmer
  out of reach is out of their way.
- **Loot nests sit on the water**: two on the pond, six on the river (`dark/nests.ts:115`).
- **Teleports and come-backs** land through the grid: teleporting to a swimmer says "Can't get
  there — the door is locked" (`WorldRoom.ts:1022`).
- **Vitals** (`shared/vitals.ts`): warmth drains outside by night, chill and storm; "the cold
  never kills"; no breath.
- **Held things** aren't dropped by anything; survival drops and flares land where you stand.
- **Sound**: the river's bed fades out as ice grows, the rain on open water; no splash, wade,
  swim or underwater sound anywhere. `ICE_WALK` 0.8 is written in four places (`grounds.ts:2089`,
  `controller.ts:207`, `grounds-sound.ts:45`, a literal in `weather-sound.ts:142`).
- **Tests that say water stops you**: `physics/water.test.ts`, `e2e/weather.spec.ts:182`. Tests
  that stage scenes on the pond's ice and assume it's frozen: `dark.spec`, `arms.spec`,
  `arms-fx.spec`, `beam.spec`, `down.spec`, `dark-hud.spec`, `inventory.spec`, the server's
  `survival.test` and `down.test`. The physics audit runs frozen (`UNDER.ice` defaults to 1).

### Budget

The page 425.2 / 430 KB, the Grounds' chunk 174.7 / 176, the characters 58.0 / 58 (at its limit),
`yutopia-anim` 14.3 / 15, `air` 5.4, `acts` 6.4, `night` 3.6, `life` 2.8 (each / 15), sway 5.0 / 10.
The standing call: raise them as needed, measured and written down (`tools/budget.mjs`).

## The idea

**The river comes down from the hills in the north in a run of falls, past the Kart Park,
broadens, drops over a rapid near the old world's edge (z −590), and runs deep and slow past the
bridge and the woods to the south, where it leaves through a cut in the hills.** The pond is
still: reeds round it, a shelf of shallows, deep in the middle, the dock out over 2 m of water,
the canoe tied up and bobbing.

**You walk in.** Ankle, knee, waist: slower, splashing, the water dragging at your legs. At the
chest you lift off and swim — a steady breaststroke, your head up; Shift for a crawl that tires
you. Still, you tread water. C takes you under: the light goes green, the sound goes thick,
your breath counts down; the mouse steers you down to the bed and back up; Space brings you up
gasping. In the river the current carries you south; in the rapids it carries you hard. Out at a
gentle bank you walk out; at the dock you climb the ladder; at a steep bank or an ice edge you
pull yourself up.

**It's cold, by the weather.** On a warm afternoon it's a swim; on a cold night it takes your
warmth fast. You come out soaked, dripping and shivering, and it shows to everyone till you dry.
When it freezes, the ice grows in from the shores and you can walk on what's drawn — thin near
its edge, where it can crack and give.

**Cars don't swim.** Driven in, a car ploughs to a stop as the water reaches its floor, the
engine dies, it settles; you climb out and swim. It goes home later.

**It looks alive and fits the world**: flat-faceted waves and the ink line, not glossy realism —
the river visibly flowing, foam where it meets banks, piers and rocks, white water at the rapid
and the falls, the sky and a sun glint on it, rings and a wake round anyone in it, and under it a
green murk with light rippling on the bed.

## The mechanics

### S1 — The water's shape

- **One shared answer: `waterAt(x, z) → { level, bed, flow: [vx, vz], open } | null`** in
  `shared/grounds.ts` (with `water.ts` beside it if it grows): the pond, the river, the creek. The
  server, the client, the remotes, the pets and the tests all ask it.
- **The river's level runs downhill, north → south**: `RIVER.level` = the running minimum of
  today's `RIVER.h` from the north end, eased (no corners), with the steep drops kept as features:
  - **the falls**, z −990 → −904 (44 → 0.4 m): a run of cascades and pools in the hills;
  - **the upper reach**, z −904 → −605: about level (0.4), the old bed 0–1.9 m higher cut down;
  - **the rapid**, z −605 → −579 (0.4 → −4.2): white water over rocks;
  - **the long reach**, z −579 → 104: deep and slow at about −4.2 → −5.0 (a slight fall added so
    it never pools flat); the old bed was up to 3.9 m higher here (−0.3 at z −8), so its banks
    get taller (up to ~4 m over the water) — something to climb out of;
  - **the cut**, z 104 → 208: through the hills at the land's edge (172), up to 12.9 m deep at the
    end. Only its first ~70 m are in the walkable land. *(Chosen over a culvert at z ~165, 2026-11-02.)*
  - Measured: north → south needs a cut deeper than 3 m on 286 of the 1202 samples; south → north
    would need 832 and up to 49 m — so north → south.
- **Depth is carved into the land** (`terrainAt`): the bed falls from the bank to a wading shelf
  and then to the deep:
  - **the river**: 0 → 0.9 m deep over the first 2.5 m from each bank, then down to ~2.8 m across
    its middle (its width stays 22 m); 0.3–0.6 m on the rapid's rocks, pools under the falls;
  - **the pond**: a shelf to 0.9 m round its edge, ~3.5 m in the middle, 2.2 m at the dock's end;
  - **the creek**: 0.2–0.4 m, waded, never swum.
  - The land is the one source for Jolt's heightfield and the drawn land (`makeChunk` 2× a metre;
    the 2 m and 4 m tiers call `terrainAt`), so they stay together.
- **What moves with it**: the bridge's piers and their heaped ice (`grounds3d.ts:1177`, tied to
  `terrainAt`), the fog banks' heights (`fog-banks.ts:63`), rain splashes (they land on the
  ground function: on the water they need the level, `rain3d.ts:240`), the ear's height
  (`view.ts:3984`), the walk mask's 0.9 m tile rule and the rock rule on steeper banks
  (`grounds.ts:1986`, :1287), the nests, the place names ("The frozen pond").
- **The dock gets a solid deck** at its drawn height, and the ladder a climb.
- **The walls go** (`waterWalls`, `WorldBuilder.water`): nothing invisible is left at the water.

### S2 — In the water

One new step, `stepSwim`, beside `stepFly` (`walker.ts:557`), chosen by the body's depth: how
deep the water is at the body (level − feet).

| Depth at the body | What you do | Speed (walk / run) | Jump |
|---|---|---|---|
| under 0.3 m | walk; the steps splash | as on land | yes |
| 0.3 – 1.25 m: **wade** | walk, legs dragged | × (1 − 0.45 · d/1.25); no sprint | low, d < 0.8 only |
| over 1.25 m, or off the bed: **swim** | float with the head up | 1.3 m/s, Shift 2.3 (crawl, stamina) | Space: a kick up at the bank / ladder |
| C pressed while swimming: **under** | dive; the mouse's pitch steers | 1.4, Shift 2.0 | Space: rise |

- **Wading is `stepBody`** with a slower `groundSpeed` and grip ("water" footing), so the
  mover, the verbs and the determinism of everyone else stay as they are. Running into deep water
  carries you in with a splash; a running jump off the bank or the dock into deep water is a dive.
- **Swimming is `stepSwim`**: the mover in fly mode, buoyancy holding the chest at the surface
  (a soft spring, a bob), drag, the current added (`waterAt.flow`: ~0.4 m/s in the long reach,
  ~2.5 in the rapid, strong below the falls — you can't swim up them), turning by the camera as on
  land (plan 56).
- **Under**: C dives (a duck dive), C held keeps you going down, Space rises, the camera's pitch
  steers; you can't go under the bed (the mover's land), and you float up when you stop swimming.
- **Out**: where the bed rises to wading depth you stand and walk out. A bank or ice edge within
  1.2 m over the water is a mantle (the existing verb, `probeVault`); the dock's ladder is the
  flow `climb`.
- **Falling in**: off the bridge (its truss stays: you can't jump it), off the dock, off a bank,
  through thin ice. Water deeper than 1.6 m catches a fall of any height: no ragdoll, a big
  splash.
- **The modes the water turns off**: Flowmotion (except the mantle and climb out), roll, slide,
  air dash, crouch, aim, the torch, held things, the phone's poses, emotes, sitting.
- **Admin flying and clipping** ignore the water, as they ignore walls.

### S3 — Breath, stamina, the cold

- **Breath**: 30 s under (15 s in a crawl), a ring on the HUD under water only. At 0 you are
  pushed up gasping and spent (stamina to 0). **Nobody drowns** (the world's rule: the cold never
  kills). Admins' `unhurt` keeps it full (it already promises "breath", `admin.ts:15`).
- **Stamina**: the crawl drains it as a sprint does; treading water slowly; wading as a walk.
- **The water's warmth follows the air's, slowly**: `waterTemp` = the air's temperature eased
  over ~24 h, never under 1 °C while open — from the schedule, so the server and everyone agree.
  In water the warmth drains by how cold it is: none over 20 °C, at about 4× the cold night's
  rate at 2 °C, ×1.5 at night. The server works it from where you are (`waterAt`), no new field.
- **Soaked**: in water up to the chest your clothes and hair are wet to 1 (rain's look, plan 65's
  `wetOf`), drying as after rain; everyone sees it, because everyone works it out from the
  swimmer's position. Wading soaks you to the waterline (a waterline in the body's shader — the
  per-person material `setTint` already clones, `person3d.ts:1408`). Out of cold water you shiver
  (the cold body's shiver, plan 58) till you warm up.

### S4 — The ice

- **One rule for the ice, drawn and walked**: a point on the water is iced where
  `1 − |side| ≤ ice` — the shader's own (`wx3d.ts:368`). So it freezes in from the shores, and
  what you see is what holds you. No more `ICE_WALK` 0.8 switch; the four copies go.
- **The ice is a solid at the level**: boxes over the iced band (rebuilt as `ice` moves by
  0.02), so walkers stand on it over the carved bed.
- **Thin ice**: within 2 m of its edge while `ice` < 0.95, or anywhere while `ice` < 0.3: it creaks
  (the existing synth), and a landing or standing there 1.5 s cracks it through. A hole: the
  server keeps up to 8 (`ice:break`, position and time), the shader cuts them, the solid is
  rebuilt round them, and they freeze over in 10 minutes. You fall in; you climb out at its edge
  (the mantle).
- **A freeze with someone in the water**: a body under the ice as it closes is put up on it at
  the nearest point (the server, then the snap); the drawn ice doesn't close over a swimmer for
  their 10 s.

### S5 — Cars and things

- **A car in the water** (the car sim, `shared/car/*`): its grip falls with depth; at 0.5 m at
  the floor the engine stalls (it won't start in water); over 1.2 m it floats briefly then
  settles to the bed over ~6 s with a tilt and bubbles. Its riders are put out swimming. An empty
  car in the water goes home after 2 minutes (the existing home path, `features/cars.ts:529`).
  The tow's `freeSpot` and the door's spot skip water.
- **The two pond sleds** are moved to the bank (`car/homes.ts:57`).
- **Things dropped in water**: survival drops and pet toys float to the nearest bank; a flare
  goes out; a held drink is dropped on entering deep water.

### S6 — Everyone else

- **The grid**: deep water stays closed to paths (people walking by click, NPCs, pets); the
  wading shelf opens. Teleports, admin bring and come-backs may land a person in water (a swimmer
  is a fair target); the "door is locked" toast is fixed for water.
- **Pets wait on the bank** and come along to the nearest bank point when you're more than 3
  tiles out (`comeAlong` finds the bank, not `nearestOpen`); the river's "wild" zone only counts
  frozen. *(Dogs swimming: a later plan.)*
- **The shadowed** keep to land; a swimmer is out of their reach, but the night's water drains
  warmth fast — the water is a costly refuge, not a free one.
- **Nests on the water** move to the banks.

### S7 — The look (stylized, alive)

All in the wx layer and the Grounds' chunk, uniforms over variants, the same on every tier
except where noted.

- **A real surface**: the river's ribbon and the pond's disc subdivided (~1.5 m), the water's
  vertices moved by a few slow waves in the vertex shader, **flat-faceted** (face normals, as the
  land and the people) so the light breaks into facets; an ink line where the water meets the
  land.
- **Depth colour from the bed**: each vertex carries its depth (`level − bed`), not `wxSide`:
  clear and bed-coloured in the shallows, teal, then deep green-black.
- **Flow**: the river's surface UV runs along it (the thrown-away `v`), so its streaks, flecks and
  facets travel south at the current's speed — slow in the reach, fast and white at the rapid.
- **Foam**: a foam line along every shore, the bridge's piers and the rocks, thicker where the
  water's fast; white water on the rapid and the falls (sheets of water over each step, a foam
  pool at each foot, a mist on High).
- **Light on it**: the sky's colour by angle (zenith to horizon, not one colour), a stylized sun
  glint (a broken band of bright facets towards the sun), the moon's at night; the lamps' and
  the windows' glints at night on High.
- **People in it**: a ring where the body meets the surface, a wake behind a swimmer, splashes on
  going in, on strokes, on a car going down; drips off someone coming out.
- **Round it**: reeds and a few lily pads at the pond's edge and the river's slow reach (plan 65
  left them "not done"), rocks at the rapid, the canoe afloat at the dock (decor, bobbing), the
  wet mud band where the water's been.
- **The weather on it**: the rain's rings (kept), the fog's banks over it (re-heighted), the ice
  growing in from the shores (kept) and its holes.

### S8 — Under the water

- **The camera under the surface** (third person when the body's under; first person by the eye):
  the fog hook (`tp/fog3d.ts`, as its `mfBox`) gets a water volume: a thick green-teal fog by
  depth for whatever's under the level, the sky dome tinted, the sun's light dimmed with depth.
- **The surface from below**: its underside drawn (a separate back-face mesh — not one
  DoubleSide transparent material, which re-checks shaders every draw), bright and rippling, the
  sky through it near overhead (a Snell's window, cheaply).
- **The bed**: caustics (a moving pattern on the land's colour under the water, from the wx
  layer, High and Medium), weeds in the pond, stones in the river.
- **Bubbles** from a diver; the camera never sits half in (it's kept out of a 10 cm band round
  the level).

### S9 — The sound

Its own last phase, picked by ear on a bench (plan 63 and 65's way, CC0):

- **Going in**: splashes by speed and size (a step in, a jump in, a dive, a fall, a car).
- **In it**: wading steps (a "water" step set, by depth), strokes (breast and crawl), treading,
  a gasp on surfacing, breath out of breath.
- **Under**: everything through a low-pass and quieter, an underwater bed, bubbles, the current.
- **The water's own beds**: lapping at the pond's edge (calm days), the river by its speed — a
  murmur on the reach, the rapid's roar, the falls' — placed where they are, not one bed by
  distance.
- **Out**: drips off the body for a while, wet steps.

### S10 — The wire and the server

- **Nothing new on the wire.** Whether someone wades, swims or is under is worked out from their
  position by `waterAt`; the crawl is their gait's sprint. `person3d.ts:510` and `theirJump`
  learn that a swimmer isn't in the air.
- **The server**: the jump check (`WorldRoom.ts:899`) allows a kick from water; vitals take
  `inWater` and `waterTemp`; `ice:break` and its holes; the freeze putting swimmers up; cars
  sinking; tows, doors, drops and toys off the water.

## Risks

- **Carving the land moves everything near the water.** The river's banks get up to ~4 m taller
  in the long reach; the walk mask and the rock rule follow the slope; the bridge's piers, the
  fog banks, the nests, the place names, e2e spots by `heightAt`. Phase 1 is only this, measured.
- **The determinism tests**: `stepBody` must stay bit-identical out of the water. Wading's
  speed comes through `groundSpeed`/footing (data), not new branches.
- **The tests that stand on the frozen pond** (seven e2e specs, two server tests) will find water
  on an open day: they freeze it first (`mod:ground snow`) or move to land. The weather's shore
  tests are rewritten. Several e2e specs are already red on HEAD (memory: known red e2e).
- **A camera under a surface** that's drawn FrontSide shows the sky: the back-face mesh is a must,
  and the fog hook's water volume must not reach indoors or the first-person arms.
- **The characters' chunk is at its limit**: every line of wiring in `locomotion.ts` / `motion.ts`
  costs it. The swim poses go in a new lazy chunk (`yutopia-swim`), loaded with the hero.
- **Frame time**: the subdivided river (~1200 m × 22 m at 1.5 m ≈ 12k quads, more with the
  falls), the foam and the underside. Measured on High and Medium against plan 65's table
  (`e2e/perf-weather.mts`: the pond's place, plus the rapid and the bridge).
- **The world server's watch** goes stale after big shared edits (memory): restart it after each
  phase's shared change.

## The phases

### Phase 0 — the mocks

Dev stills, approved before any game code (plan 65's way: in-game as Ana, the mock patched into
the live view from the test, `design/screens/water/`, contact sheets in the repo).

- **The river's course**: a profile strip (today's bed, the new level, the cut depths) and stills
  of the falls in the north, the rapid at z −590, the long reach at the bridge (its taller banks),
  and **the south end both ways** (the cut through the hills, or a culvert at z ~165).
- **The water's look**: the pond from the lawn and from the dock, the reach from the bridge, the
  rapid, the falls; at noon clear, in rain, at dusk, at night, in fog; part-frozen; on High and
  Medium. With a still swimmer (a stand-in pose) for the ring and wake.
- **Under the water**: the pond's middle looking up and along the bed, the river looking
  upstream into the current.
- **The swim body's key poses** on `/dev/anim` as stills: tread, breaststroke (two keys), crawl
  (two), the duck dive, swimming under, the dive in, the climb out, wading at knee and waist.
  **The course, the look and the poses agreed here.**

Rendered 2026-11-02: `design/screens/water/` — the profile (`profile.png`), a contact sheet a spot
(`sheet-*.png`: noon, rain, dusk, night, fog, half frozen), `sheet-under.png`, `sheet-medium.png`,
and the poses (`poses/sheet-poses.png`). No game code changed: the water's from
`apps/client/e2e/water-shots.mts` (in the game as Ana, patched into the live view from the test,
the camera set by hand), its shape from `e2e/water-course.mts`; the poses are dev-only clips on
`/dev/anim` ("swim (plan 66)": `app/dev/anim/swim.ts`, stills by `e2e/water-poses.mts`).

- **The course** (water-course.mts): the level the running minimum of today's bed north → south,
  0.1 % fall on the slow reaches, eased, and **held 0.6 m under the lower bank** — at z ≈ −895 the
  land beside the river is under the plain north → south level, so the upper reach sits at about
  −1.3 rather than 0.4 and the rapid is a 2.7 m drop (−1.5 → −4.2), not 4.6. The deepest cut under
  today's bed is 12.9 m, at the south end.
- **The mock's look**: the drawn land lowered in its vertex shader by the change (a 1 m texture of
  the change and the level round each spot), wet mud on what's carved (pale silt under the water);
  a new surface over it (1 m rows × 26 across on the river, 120 × 40 on the pond): three slow
  waves, flat faceted, colour by depth (clear in the shallows, the bed seen through), streaks moving
  with the current, a lapping foam line at the shore, white water by the current's speed (the rapid
  and the falls), the ink line where it meets the land, the sky by angle and a sun glint, rain
  rings, the ice in from the shores (`ice50`); under it the murk by how much of each ray is under
  the level (every fogged material), caustics on the bed, the underside silvered with its window
  to the sky. Reeds in the shallows.
- **Not in the mock**: a swimmer (the rings are drawn where one would be; the poses are their own
  sheet), the canoe afloat, the rocks at the rapid (white water only), the falls as falls (a white
  sloping ribbon down the hill — they'd want steps and pools), the bridge's piers' foam, the
  physics (Ana stands where she stood).
- **The poses** (36 stills): tread (2 keys), breaststroke (3), crawl (2), the duck dive, under (2),
  the dive in (2), the climb out (2), wading knee- and waist-deep (2 each). Unsure: tread reads a
  little like sitting on a chair with the arms ahead; the breaststroke's kick from the side like
  kneeling; the crawl's roll may be small.

### Phase 1 — the water's shape

S1: `waterAt`, the river's level and its features, the carved beds, the dock's solid, the walls
gone (the grid still closing deep water, the shore now the shelf's edge). The bridge, the fog
banks, the splashes, the nests and the names moved with it. Tests: `waterAt` against the drawn
ribbon; the level never rises southwards; the land under the water at the depths; the audit run
with water open and frozen; nothing poking through the bridge. The water drawn at its new level
(today's look). No swimming yet: you can wade the shelf only (the grid's deep tiles closed, and a
temporary wall at the shelf's edge — the last invisible wall, gone in phase 2).

Built 2026-11-02 (the user approved phase 0's look and poses, the south end a cut):

- **The shape** (`shared/grounds.ts`): `riverWater()` — the river's level a sample (the running
  minimum of its old bed southwards, held 0.6 m under the lower bank 26 m off, 0.1 % fall, eased),
  its slope, its current (0.35 + 25 × slope m/s, to 3.55), its length along; worked out on first
  asking, the land beside it read with the river left out (`layingRiver`). `waterAt(x, z)` → level,
  bed, depth, current, pond or river. `terrainAt` carves the beds: the river a 2.5 m shelf to
  `SHELF` 0.9 m, then to 2.8 m in its middle (×0.35 where it falls fast); the pond a shelf to 0.9 m at
  `POND_SHELF` 0.88 of its ellipse, then to 3.5 m. Its banks come down to its level over 14 m as
  before. Measured: never rising southwards; 44.0 m at its north end, −5.1 at its south; the rapid
  −1.9 → −4.2; the bridge's deck 5.9 m over the water.
- **Where you stand**: `heightAt` the bed on open water, the ice's top (`ICE_TOP` 0.04 over the level)
  when frozen, the dock's planks (`DOCK.top`, the level + 0.67); `topAt` the water's level over its
  bed (the rain lands on it, the fog's sheets lie over it, the ear's height is from it).
- **The physics** (`physics/build.ts`): `waterWalls` now where the shelves end (the pond's at 0.88,
  the river's 8.65 m off its middle), from under the shelf to 2.2 over the level; `iceSheet` — the
  pond in metre strips, the river a slab a sample, at the level — put in on a freeze (layer floor)
  as the walls come out. The dock a solid (`shapes/grounds.ts` `dock`: its planks and eight posts
  to the bed).
- **The grid**: the water's tiles walked as flat (its ice, or its shelf — the carved bed's slope
  isn't the rule there); open, `walkableTile` closes it where it's `SHELF` deep or more.
- **Moved**: the pond's two nests and the bridge's two to the banks, the river's six 16 m off its
  middle; the two pond sleds to the bank west of the boathouse (−280, −103 and −284.5, −103);
  "The frozen pond" → "The pond" (the place, the route's landmark), the map's labels THE POND, THE
  RIVER.
- **Drawn**: the river's ribbon at its level; the dock's posts and ladder down to the bed. (The
  water's look is today's: phase 5.)
- **Checks**: `physics/water.test.ts` rewritten (6: waded to the shelf's end and stopped, the feet
  under the water; frozen, on the ice's top; the dock's planks to its end; the walls under the
  bridge's deck; the paths; the river downhill and the current south; the beds' depths) — shared
  508/508 (the Grounds' fingerprint updated: land, walk, trees, surfaces, solids); client 174/174;
  world server 191/193 (the shuttle, red on HEAD; the fire's bench, a visitor in the seat in the
  full run — alone it passes, and on HEAD); the physics audit frozen and open (`--open`: the deep and
  its walls by design; `tools/physics-bench/check.mjs` runs both). In the game as Ana in the rain:
  walked into the pond from its south shore, stopped 0.8 m deep where its shelf ends.
  `e2e/weather.spec.ts`'s open water now expects the shelf (not run).
- **Left for later**: the creek's depth (phase 2, waded); the pets' "wild" river ice (phase 7).

### Phase 2 — the moving body

S2 in the move core: wading through `stepBody`'s footing, `stepSwim` (float, swim, under, the
current), going in, coming out (walk out, mantle, the ladder), falls into water. `/dev/move` gets
the pond. Tests in `physics/move.test.ts`'s harness: depth → mode, the bob, the current carries,
the rapid beats a swimmer, out at a bank, the ladder; determinism unchanged on land. The body
still uses the land's poses (a stand-in): the feel first.

Built 2026-11-02:

- **The core** (`shared/move/swim.ts`, hooked in `stepBody` after a verb, before the air dash and
  Flowmotion: on land the env's `water` is never asked — a test runs the same 240 steps with it and
  without and gets the same body): `MoveEnv.water(x, y)` → level, bed, current; `MoveInput.pitch`;
  `Body.swim` (`{ under }`); `StepEvents.splash` (0..1).
  - **Wading**: `stepBody`'s own, the speed × `wadeK` (to 0.4 at chest-deep), no sprint past 0.5 m,
    no jump past 0.8, the water's drag on slowing (decel × 1 + 4 × depth).
  - **Afloat** from 1.45 m of water (`SWIM.enter`) or a fall into 1.3 m or more; stood up again where
    the bed comes within 0.1 of where a swimmer's feet ride (1.25 under the surface: 1.35 m) — the
    gap keeps it from flickering. On the surface: the bob (3.5 cm, 0.45 Hz), 1.3 m/s, 2.3 crawling
    (the sprint); under (C): 1.4 / 2.0, the camera's pitch steers, Space up, C down, let go it
    floats up 0.5 m/s and back onto the surface. The current added under it all. A fall from 5 m
    goes under; one into water is caught — a splash, no landing.
  - **Out**: the bed up the slope (stood on it, waded out); a ledge under the water ahead (stepped up
    onto it); Space at a bank or the dock's planks in reach (0.4–0.9 m ahead, up to 1 m over the
    surface): a mantle onto it.
- **The walls are gone** (`waterWalls` out; `WorldBuilder.water` only puts the ice in on a freeze).
  Nothing invisible is left at the water. The paths still keep off its deep (`walkableTile`); the
  audit counts that as by design.
- **The client**: the walker hands the core the water (the Grounds', on the land, not clipping) and
  the camera's pitch; says `swim` (0 out, 1 wading, 2 afloat, 3 under) and the splash. Everyone's
  `swim` worked out from where they are (the controller's `swimOf`), and `overWater` (deep enough to
  catch a fall): afloat isn't in the air (the body's air pose, the remotes' jump track, the camera's
  air pull), and no ragdoll falling into deep water. The bodies still stand (phase 4); no sound
  (phase 9).
- **Checks**: `physics/swim.test.ts` (7, a pool on Jolt: waded slower, afloat with the head out, a
  swim and a crawl, back to the shelf and stood on it, the current, under and back up, Space out
  onto the land's edge, a fall caught, land untouched) and `physics/water.test.ts` (8: walked in
  from the pond's north shore, waded and swum out; the dock's planks; off its end into the water;
  swum to its end and climbed out; frozen, its ice) — shared 517/517, client 174/174, the audit
  frozen and open; world server 192/193 (a dog in the lift, flaky: alone it passes). In the game as
  Ana: walked in from the pond's south shore (waded −94 → −88, afloat
  from −85 at 1.3 m/s), dived under with C (1 m down), floated back up, swam back, stood up at −87,
  waded and walked out up the bank. `e2e/weather.spec.ts` now expects her afloat (not run).
- **Not done here**: `/dev/move`'s pond (the bench; the tests and the game were enough to tune it);
  the creek's depth (it's still walked as land); a swimmer when it freezes (phase 3).

### Phase 3 — breath, cold, the ice, the server

S3 and S4: breath and the HUD ring, stamina, `waterTemp`, the warmth drain on the server, soaked
and the waterline, the shiver; the ice as drawn = as walked, its solid, thin ice, holes, the
freeze putting swimmers up; the server's jump check. Tests: vitals in water by temperature,
breath to 0 and up, the ice band against the shader's rule, a hole and its healing, a freeze over
a swimmer.

Built 2026-11-02:

- **The ice, walked where it's drawn** (`shared/grounds.ts`): `iceCovers(side, ice)` — the shader's
  own rule (`1 − |side| ≤ ice × 1.02 − 0.01`); `waterSide` (the pond's ellipse measure, the river's
  distance over its half width); `iceAt(x, z)` → its top and whether it's thin, null on open water,
  in a hole or on **fast water: the rapid and the falls don't freeze** (`ICE_FAST` 1.2 m/s — a flat
  sheet can't follow a fall of 0.7 m a metre, and they'd stay white anyway). `heightAt` and
  `walkableTile` by it. The `ICE_WALK` 0.8 switch is gone from the physics and the paths (it stays
  for the sounds' ticks and the river's quiet, phase 9's).
- **Its sheet** (`physics/build.ts` `iceSheet(ice, holes)`, `WorldBuilder.ice`): in from the shores to
  its edge — the pond's strips in two where its middle's open, the river's slabs either side, none on
  the fast stretches — made again as the ice moves 0.02; a hole's pieces cut into metre cells, the
  ones in it left out. The drawn river's ice too skips the fast stretches (`grounds3d.ts`: the water
  ribbon all along, the ice only where it's slow).
- **Thin ice and holes**: thin within 2 m of its edge while it's under 0.95, all of it under 0.3; it
  creaks under the steps (the old synth, now by `iceAt`); stood on 1.5 s, or landed on hard, it gives:
  `ice:break` (the Grounds' coords) — the server's `features/ice.ts` checks it (thin there, within 3 m
  of them) and keeps it (`weather.holes`, "x,z,at;…", 8 at most, each healing in 10 minutes, all gone
  with the ice); mine cut at once (the physics' ice within the second), the crack loud. Drawn: the
  ice's shader cuts the holes (`wxHoles`, 8).
- **A freeze over a swimmer**: on the surface where it's iced over, up on its top; under it, swim on
  to open water or a hole; caught under it (a teleport on to young ice), up through it.
- **Breath** (the walker's): 30 s under, half that at a crawl, back six times as fast up top; run
  out, up and spent (stamina 0, winded); an admin unhurt never runs out. The HUD's BREATH bar under
  Focus, while under and as it fills (`dark/index.ts`). **C under water dives and again comes up**
  (the controls' crouch is a toggle: kept, it sank you for good) — the crouch let go while swimming.
- **The cold**: `waterTempAt` (shared weather.ts: the air's mean over its last 24 h every two hours,
  never under 1 °C), the room's `weather.water` a minute at a time; in it to the chest, not iced over,
  the warmth drains (`VITALS.water`: 6 a minute at 2 °C, none at 20 or over, half again at night) —
  the server's vitals and my walker's alike. The cold body's shiver follows the warmth (plan 58).
- **Soaked**: afloat or under, wet to 1 at once; wading, half wet in a few seconds — the rain's
  darkening (`view.ts wetOf`), dried as after the rain. (The waterline on a wader: phase 4.)
- **Checks**: `physics/ice.test.ts` (7: the ice where it's drawn, thin, a hole and its sheet and wire,
  the sheet by band, a swimmer frozen round put up, the water's cold, its warmth over the day);
  swim.test's dive now C and C again — shared 524/524, client 174/174, world server 193/193, the
  audit frozen and open (open deep water — all of it, or the fast water frozen — by design). In the
  game as Ana: dived looking down to −4.2 m, the breath to 26 s and back to 30 up top; a slow freeze
  from open, out on the young ice at its top (−1.65), it gave after 1.5 s near its edge — the hole in
  the room's weather, her afloat in it.

### Phase 4 — the swim body

The poses from phase 0 made motions on `/dev/anim` (a water plane in the bench, a `Drive.swim`):
tread, breaststroke, crawl, the duck dive, under, the dive in, the climb out, wading (legs
dragged, arms lifted), the transitions between. The ground layers off in water (foot lock,
stepper, `grounded`, life's hunch and hug, the quirks, the trunk inertia), Motion3's held things,
phone and emotes gated. Hair and worn things float (sway: buoyancy on its dangles; the model's
springs' "down" turned up). In a new `yutopia-swim` chunk. **Signed off on its stills and videos
before the world** (plan 58's rule). Then in the world: me and others, first person (the arms in
`hands1p.ts`).

Built and **signed off by the user 2026-11-02** (the bench's stills and videos:
`design/anim/swim/` — `sheet-swim.png`, 12 mp4s, `numbers.txt`; `e2e/swim-shots.mts` makes them):

- **The module** (`chars/anim/swim.ts`, its own chunk `yutopia-swim`, ~3.7 KB of its 15; loaded with
  the hero's: `swimNow()`): `Swim2` a swimmer (`update(dt, { swim, speed, fast, sea, pitch, dive })` →
  the pose, the hands, its weight — the strokes' phases by the water covered, the modes eased into
  each other, the duck dive as it goes under, eased out as it comes out); `wade2(walk, over)` over the
  walk (a high step knee-deep, the legs dragged and a lean deeper, the arms out, the hands over the
  water from 0.8 m); the poses themselves (`tread2`, `breast2`, `crawl2`, `under2`, `duck2`, `dive2`).
  The tread upright, an eggbeater, sculling low and wide; the breaststroke's kick a frog's (a thigh's
  twist turned on its own axis first — the rig's Euler order had swung a spread thigh under the body);
  the crawl rolled 0.9 at the chest, 0.5 at the hips, breathing left. Pops: none on the cycles, one on
  the dive in's entry (elbows), the swim→stand's from the bench's stand-in.
- **In the world** (`tp/person3d.ts`, after the crawl's overlay): `wade2` over the walk whenever the
  water's over 0.3 m (fed afloat too), `Swim2` laid over it while afloat or under (the speed the
  body's, the crawl at the sprint, under pitched by the way it's going); the hands the swim's — the
  drink, the phone, a wave let go while it's swimming. Everyone's from where they are (`swim`,
  `waterOver` from the controller).
- **Waterline** (S3): wading, the clothes darker under the water's line and a pale line at it (the
  body's per-person material, `Person3D.setWater`).
- **Checked** in the game as Ana: the wade waist-deep, the breaststroke, the crawl, treading, under.
  Not checked: someone else's swim seen by another (it's the same path, from their position); the
  dive in from a run (`dive` isn't fed yet: the swim's own way in plays).
- **Not done here**: hair and worn things floating (sway's buoyancy); first person's arms
  (`hands1p.ts`); Motion3's layers gated beyond the hands (an emote's face still plays).

### Phase 5 — the look

S7: the faceted surface, depth colour, flow, foam, the rapid's and the falls' white water, the
sky and the glint, rings, wakes and splashes, reeds, rocks, the canoe afloat. Checked against the
phase-0 stills; frame times on High and Medium.

Built 2026-11-02 — the approved mock's look, the game's own now:

- **The surface** (`tp/grounds3d.ts` `surface`): the river a row a sample (1 m) and 26 across, out
  over its banks' foot; the pond 40 rings of 120; the creek's ribbon too (0.3 m, its ice apart). Each
  vertex: `wxSide` (for its ice), `wxDepth` (the level to the carved bed: `terrainAt`), `wxFlow`
  (along it, across it, its current, the foam fixed there), `wxDir`. One see-through, flat-shaded
  Lambert (`wx = "water"`).
- **Its shader** (`tp/wx3d.ts`, `WX_WATER` and the water's own vertex part): three slow waves
  (calm in the shallows, chopped where it's fast, none under its ice), faceted; colour and how see-
  through by its depth; the current's streaks; the lapping foam line; white water by its speed (the
  rapid, the falls) and round the rocks; rings and a V wake round anyone in it (`wxSwim`, 8, the
  view's `swimmer`: where, which way, how fast); the rain's rings; the ink line at the shore; the
  sky by angle and the sun's glint (`wxSun`: its way, how much — up, out, not in the fog's wall);
  none of it where it's iced over (its holes open).
- **Round it**: reeds in clumps on the pond's shelf and the river's slow reach (~1,500 blades);
  faceted rocks in the rapid and on the falls, the water white round them; the canoe afloat off the
  dock's east side, its floor and thwarts showing.
- **Checked**: stills from phase 0's spots, the game's own (`e2e/water-shots.mts REAL=1` →
  `design/screens/water/game/`): noon at every spot, the pond and the reach in rain, at dusk, at
  night, in fog (the low sun's glint gold), half frozen (the ice in from the shores, the middle
  moving). In the game as Ana: a swim past the dock — the rings, the wake, the reeds, the canoe.
  **Frame**: at the pond 5.5 ms on High (plan 65's: 5.5), 5.3 on Medium; hidden, no better (it's in
  the noise). The page and the Grounds' chunk not measured yet (phase 8's).
- **Not done here**: the bridge's piers' foam; the falls as steps and pools (a white slope still);
  the mist over the falls; drips off someone coming out; splashes going in (with the sound: phase 9).

### Phase 6 — under the water

S8: the fog hook's water volume, the underside, caustics, weeds, bubbles, the camera kept out of
the surface's band.

Built 2026-11-02:

- **The murk** (`tp/fog3d.ts`, in the fog's own chunk — every fogged material, all tiers): with the
  camera under a water's level (`mfUw`: the level, the density — the pond 0.14 a metre, the river
  0.2 — on, the sun's on its bed), each fragment murked by how much of its ray is under the level,
  lighter looking up and darker down (`mfUwCol`, by the light out there); what's under it lit by the
  rippling light (two noises' crossings, fainter deeper); the surface's own underside murked less.
- **The underside** (`wx = "under"`: the water's grid again, its back faces, the waves the same):
  bright and rippling, the sky through its window within ~48° of straight up, silvered past it, a
  bright ring at the window's edge.
- **The camera** (`view.ts underWater`): never in the 24 cm band at the surface — kept on the side
  its target's on; the murk's state set from where it is (the Grounds' `waterAt`).
- **On the bed**: weeds up off the pond's deep (~3,000 blades), stones on the river's slow bed.
- **Bubbles** (`tp/bubbles3d.ts`): off the head of anyone under, a few a second, wobbling up, gone at
  the surface (96 points for everyone).
- **Checked** in the game as Ana: dived under the pond — the murk, the light on the bed, the weeds,
  the bubbles, the underside's waves over her. **Frame** by the pond over the water on High: 5.1 ms
  (before, 5.5: no cost). Client 174/174.
- **Not done**: first person under it (it's the same murk — not looked at); the river under it with
  its current's silt; the sound's low-pass (phase 9).

### Phase 7 — cars and everything else

S5 and S6: cars stalling and sinking, riders out, home; the sleds moved; drops, toys, flares;
the grid's shelf, teleports and come-backs into water; pets on the bank; nests on the banks.
Tests on the server (a car in the pond, its riders swimming, home after 2 min) and the paths.

Built 2026-11-02:

- **Cars** (`shared/car/sim.ts`, `world.ts`): `CarWorld.water(x, z)` (the water over the ground —
  open water's; its ice is driven on); in it, the water drags the car (by how deep, to 2 m); at
  `DROWN` 0.5 m the engine drowns — dead, the throttle gone, and it won't start (`CarState.drowned`,
  `setEngine`). The tow rope's spot never in water. The server (`features/cars.ts`): a car at `SUNK`
  1.2 m or deeper puts its people out of their doors into the water, afloat (`snap` at the level −
  the swimmer's ride); nobody gets into a sunk car ("gone"); left there two minutes it's towed —
  home, or a plain bay — whoever's near, and someone's own too.
- **Things**: a survival drop in deep water washes up on its nearest bank (`bankNear`); a flare
  landing in it goes out; pet toys stop at the water as before.
- **Teleports**: to someone swimming — in the water beside them (`inDeepWater`), no more "the door is
  locked".
- **Pets**: following someone out swimming, to the bank nearest them, waiting there (`swimmingTo`);
  they don't swim.
- **Checks**: shared `car.test` (dragged to a stop, drowned, won't start), the world server's
  `cars.test` "into the pond" (driven into its deep middle: the driver out afloat at the level −
  1.25; parked there, nobody gets in) — shared 525/525, client 174/174, the audit, world server
  194/194 (6 min 18 s). (The server's suite had hung twice: its test files drew their ports from
  ranges that overlapped — 13 pairs — and two at once on the same one left one file's server unstarted
  and the file hanging on its way out; each file now has a hundred of its own, 30000–32799.)
- **Not done**: a sunk car's look (it drives down the bed under the water: no tilt, no bubbles), the
  pets' "wild" river (only reachable frozen now, as before), karts (they never reach the water).

### Phase 8 — the checks

The tests that stood on the frozen pond fixed; `weather.spec`'s water rewritten (open: Bia wades,
swims across, dives and comes out; frozen: walks the ice; part-frozen: the edge cracks); two
browsers (one sees the other swim, soaked after); frame times; the budgets measured and written
down.

**Built (2026-11-02):**
- **`e2e/water.spec.ts`** (new, two browsers, 1.6 min): Ana calls the weather, Bia's in the pond.
  Open: Bia walks in from its north shore, wades the shelf (the water 0.35 m over her feet, still on
  them), floats past it with her head out (the level − 1.25 ± 0.15), dives (C, looking down: under, her
  breath going), comes up (C), swims back and walks out — Ana sees her afloat (swim 2), under (3), out
  (0) and soaked (> 0.9). Frozen: the ice carries her at its top (the level + 0.04). Freezing from open
  (the ice 0.16–0.22, all of it thin under 0.3): Ana stands on its band near the north shore, a hole
  comes into the room's weather, and she's through it, under the ice's level.
- **`weather.spec`**'s water: open, walking on until afloat (not a fixed 4 s: the pond's shelf is wide
  where it walks in); `down.spec` passes too.
- **Frame times** (median, 1440 × 900, M-series on Metal): by the pond High 5.6 ms, Medium 5.4 (5.5 /
  5.3 before phase 5's look); on the river's bridge 11.4 / 11.5, at the rapid 13.4 / 13.3 — the water
  is 0.2 ms of the bridge's and 1 ms of the rapid's (hidden: 10.6, 10.3); the rest is the land there.
- **Budgets** (`pnpm budget`): the page 426.4 / 430 KB — it had gone to 433 when the controller took
  `SWIM` from the move core as a value (the core came into the page): its one number is a local
  `SWIM_CATCH` now, the import a type only. Raised, with their notes in `tools/budget.mjs`:
  `yutopia-chars` 58 → 58.5 (58.0: the swim's hook in the person), `yutopia-input` 15.5 → 17 (15.0 →
  16.5: the swim in the walker, breath), `yutopia-grounds` 176 → 181 (174.7 → 179.0: the water's grids,
  rocks, reeds, the dock, the canoe, the underside); `yutopia-swim` 3.9 / 15 KB.
- **All of it**: shared 525/525, client 174/174, world server 194/194, the physics audit frozen and
  open.

### Phase 9 — the sound (last)

S9, picked by ear on `/dev/weather-sound` (or its own `/dev/water-sound`), then in the world. **New
recordings** (the user, 2026-11-02: "we're gonna need new audios") — CC0, cut and levelled as the steps'
(plan 63) and the weather's (plan 65), several takes each so none repeats:
- going in: a step in, a jump in, a dive, a fall, a car going down; the ice cracking through;
- wading (by depth: ankle splashes to thigh-deep sloshing), swimming strokes (breast, crawl),
  treading, coming up for air (a gasp), out of breath;
- under: the muffled bed, bubbles, the current going by;
- the water's own: the pond lapping, the river's murmur on the reach, the rapid, the falls;
- coming out: the climb out, drips, wet steps.

**Built (2026-11-02; picked by the user 11-03, below):**
- **The recordings.** 65 CC0 candidates from Freesound for 22 sounds (3 each, the climb out's 2), in
  `tools/sfx-water.json` with their lengths and notes. Each page was checked for CC0 1.0, by its
  description: no one has listened to them yet. `tools/sfx-weather.mjs` makes them
  (`LIST=tools/sfx-water.json DIR=water`) with a new cut for the one-shots: each event from its onset
  to where it's died away (capped per sound: a stroke 1.2–1.6 s, a car sinking 6), the six most
  alike, peaking at −3 dB, mono. The wades' and the soaked shoes' steps go to the steps' set, and the
  beds are their steadiest 30 s. With every candidate in: `public/sfx/water` 9.1 MB, the new steps
  324 KB. Each is fetched only when it's first heard.
  - Weak spots, to judge by ear: nothing on Freesound is labelled by stroke (breast and crawl sorted by
    their descriptions), treading or drips off a body; the car sinking is jars and bottles glugging;
    the deep wade is river wading; the climb out has 2; some cut takes are very short (0.2 s).
- **The player** (`world/water-sound.ts`, in the Grounds' sound beside the weather's):
  - **The beds by where I am** (`mixOf`, pure): under, its bed (and the river's current by its
    speed); afloat, treading (quieter swimming); the pond lapping near its shore, none frozen over;
    the rapid and the falls placed (the river's samples by their current: the falls past 2.4 m/s,
    heard to 100 m; the rapid to 70); out of the water soaked, drips off me for 45 s. Indoors and
    high up they fade as the weather's do.
  - **Under, the rest muffled**: the mixer has a low-pass and a dip in front of its master (`muffle`,
    420 Hz and −45 % under); the water's own under-sounds (its bed, the current, the bubbles) go out
    beside it, clear (`mixer.clear`, at the ambience's level).
  - **What's heard of someone** (me, and everyone else within 30 m, by the voices' hearing rule and
    the camera's pan), from how they're in the water frame to frame: going in, a splash by how fast
    they were falling (a step down, a jump, a fall, a dive that takes them under — walked in off the
    shelf, or teleported in, none); a duck dive's splash and my breath going out; under, my breath
    out now and then; coming up after 3 s under, a gasp, and out of breath three times after 15 s;
    swimming, a stroke a pull (breast every 1.3 s, crawl every 0.62 s past 1.9 m/s); climbing straight
    out, the climb out.
  - **A car going in** (its middle under the level in water 1 m deep or more): a big splash and its
    sinking 0.7 s after, once (`Cars.where`).
  - **The ice giving way**: a hole that wasn't there (mine at once, as I break it; anyone's as the
    room has it), the crack's recording, which is fetched as I stand on thin ice; the holes already
    there when I came aren't heard. (The synth's crack is gone from the break; its creak under a
    step on thin ice stays.)
- **The steps**: the water over the feet makes a step a wade (`steps.ts` `WADE`: past 4 cm,
  splashy to 30 cm, sloshing deeper — the synth's wet step till they're in), mine and everyone's;
  no steps swimming; soaked (the view's `wetness`), a squelch with each step on land, the wetter
  the louder.
- **The bench**: `/dev/water-sound`, every candidate alone at the game's level (the one-shots' takes
  one after another, the steps walked), and the game's mix in nine scenes (afloat, swimming breast
  and crawl, under in the pond and the river, the shore, the rapid, the falls, just out). ★ picks,
  and "copy picks" gives the tool's PICK.
- **Checks**:
  - Unit: `water-sound.test.ts` (9): the beds by where I am, the splash by how hard, and what's heard
    of a jump in (not a walk in, not a teleport), under and up, the strokes' rate, the climb out, a
    car going in once, a new hole cracking.
  - Client 183/183.
  - e2e: `water.spec`'s second test, "the water heard", passes. Ana walks into the open pond and the
    wades' recordings are in; afloat she treads; swimming, a stroke's in; under, its bed with no
    treading; coming up, a gasp's in; out, the drips off her and the squelch's recordings. The first
    test passes too (2.4 min for both).
- **Budgets**: the page 427.4 / 430 KB (+1.0: the mixer's muffle, the controller's side). The
  Grounds' chunk 180.8 KB, its budget raised 181 → 184 with a note. The steps' chunk 7.2 / 10.

**Picked (2026-11-03, by the user's ear on `/dev/water-sound`):** one recording each, every slot cut
down to it (`pick` in `tools/sfx-water.json`; named in `public/sfx/CREDITS.md`): `public/sfx/water`
9.1 → 3.4 MB.
- **A man's and a woman's** (the user: "we have two genders"): the gasp coming up and the breath
  after long under are each two slots, `gasp-man`/`gasp-woman` and `breathless-man`/`breathless-woman`,
  played by the swimmer's avatar gender (`voiceOf`: masculine a man's, feminine a woman's, neutral one
  or the other by who they are, the same each time). The gasp's woman is the list's own second
  (marythewitch's inhales); the user's breathless pick is a man's, so the woman's is three new CC0
  candidates (MelvinJaepel, perspektywa_tn, tcrocker68); the user picked MelvinJaepel's (2026-11-03).
- Unit 10/10 (`voiceOf`, and a woman under long: her gasp and breath, not his).

**The camera afloat (2026-11-03, the user: "the char should be centralized, not on top"):** swimming,
the chase camera's target was the bed under me plus the jump's rise (`view.ts`: ground = the bed),
far under the water, so I sat at the top of the screen with the camera down on the surface. Now
afloat or under it's on me: my feet's height + EYE, and afloat `SWIM_LIFT` (0.3) more, my head just
out. Checked in the game (Ana afloat in the pond, in the middle of the screen); `water.spec` passes.

## Decisions

Decided with the user (2026-11-02):

| | |
|---|---|
| How far it goes | **Wade, swim on the surface and dive under** |
| The cold | **By the weather**: warmth drains in the water, more when it's cold and at night; soaked and shivering after; thin ice can break |
| Cars and karts | **Stall and sink**; the riders swim out; the car goes home |
| The look | **Stylized and alive**: facets and the ink line, flow, foam, depth colour, a glint, wakes |
| The river's south end | **A cut through the hills** past the land's edge (z 104 → 208, up to 12.9 m deep), not a culvert (phase 0's stills) |

Proposed in this plan, for the user to confirm at phase 0:

| | |
|---|---|
| The river's way | **North → south**: falls in the hills, a rapid at z −590, a long deep reach, out through the hills in the south (cut or culvert: the stills) |
| Drowning | **None**: out of breath pushes you up spent |
| Pets | **Wait on the bank**; swimming dogs a later plan |
| The water at night | **A costly refuge**: the shadowed can't reach a swimmer, the cold water can |
| The canoe | **Afloat at the dock, decor**; paddling it a later plan |
