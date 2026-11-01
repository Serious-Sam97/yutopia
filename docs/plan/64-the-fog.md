# 64 — The fog

Ask (2026-11-01): "Lets work on a new Feature. Add Fog on morning. Lets plan". This plan covers
fog over the Grounds in the morning: when it comes, how it looks, what it does to the lights,
the sounds and the people in it. Planned 2026-11-01. Follows `27-the-grounds.md` (the weather),
`44-the-night.md` (the dark, the fog's colour) and `33-the-look.md` (flat faces, the ink).
Workflow rule: mocks first (phase 0), approved before any code.

## Where we are

### The weather today

- **One kind of weather: the storm.** `shared/weather.ts` `stormAt(ms)` is a schedule from the
  clock. Each hour is a window, seeded by its number, and about every other one has a blizzard
  of 6 to 14 minutes. The server puts it in `WorldState.storm` each second
  (`WorldRoom.ts:422`), easing it in steps of 0.02. An admin can call a storm up or send it off
  for a while (`mod:storm`, `STORM_CALL_MS`, with `stormBy` / `stormTo` / `stormUntil` for the
  panel's line). The client eases towards it (`grounds-life.ts:168`).
- **The hour is the world's.** `state.hour` is São Paulo's (`shared/clock.ts`) unless an admin
  set one. `daylight(h)` (`art/daylight.ts`) gives the phase, the ambient, the sun, `night` and
  `dark`. Dawn runs 5:00–7:00 (`dark` 1 → 0) and the sun is up at 6:30, low in the east.
- **The storm reaches into a lot of places:** the fog (below), the falling snow (two layers of
  points, `campus.ts:2140`, the heavy one only in a storm), the overcast (`sky.ts:231`, `cloudK`),
  the wind's sound (`grounds-sound.ts:88`), the footing (fresh cover, `grounds-life.ts:140`),
  the cars (wipers, the screen's snow, the cold, the plough's spray), and snow settling on people
  (`view.ts:3758`).

### The fog today

- **three's linear `Fog`** on the scene (`view.ts:833`). By day it starts at 120 tiles and is
  full at 520 (`sky.ts` `fogFor`), and the camera sees to 1400.
- **A storm closes it in** (`view.ts` `weatherFrame` :3732): near 4, far 55 at full storm, its
  colour lerped from the sky's horizon to a pale `stormFog` that is as dark as the land's light.
  God mode's high camera pushes it back by its height.
- **Its colour by the hour** is the sky's horizon (`setHour` :2211). At night it follows
  `landLight`, so it is black (plan 44, N1).
- **What it doesn't touch** (`fog: false`): the sky dome and its stars (`sky.ts:96`, :146), the
  far ridges (`grounds3d.ts:4810`), and the lights (lamp heads, glow cards, headlamps, tail
  lights, lit windows: plan 44). Everything else, indoors included, takes it.
- **It's distance only.** It has no height, so a valley is no thicker than a hilltop. It doesn't
  move, and it doesn't brighten towards the sun.
- **Indoors** the scene's fog is still there. With today's 120-tile start nothing in a room is
  near it. Morning fog brought in close would be: a hall's far wall half gone. **To check in
  phase 0:** whether a storm already does this to the rooms (near 4, far 55).
- **The ink** (`ink3d.ts`) reads the frame's depth and has its own distance `fade`. It knows
  nothing of the fog, so ink lines on something deep in fog would be drawn dark on the white.

### The land under it

The Grounds have low places where fog would pool: the **river** (its bed 2.6 under the land,
`grounds.ts:1152`), the **pond** (`POND`, −240, −60), the **ravine** under the trail's
footbridge, and the fields. They also have high things that would stand out of it: the HQ's
upper floors, the water tower and its beacon, the trees' tops, the ridges.

### Budget

The page is at ~425.9 KB of its 430 limit (plan 63, phase 6). Fog code goes in the Grounds'
lazy chunks, except for the few lines that must be in place before the first material compiles
(see the risks). Medium (`Post3.lite`) has no bloom and no grain.

## The idea

**Some mornings the world ends at the tree line.** The lot and the HQ are there, softened. Past
them the field fades to white, and the woods are a grey idea of trees. The far ridges are gone.
Down by the river it's thickest, a white sea with the road bridge's girders standing out of it.
From the hill you see it lying in the valley below you, the HQ's top floors over it and the
water tower's beacon blinking on top. As the sun gets up, the
east glows gold through it. The lamps still on from the night each wear a halo. A car is two
smudges of light, then a shape, then a car. By mid-morning it has burned off and it's an
ordinary day. **Indoors nothing changes, but out of the windows you see white.**

**And now and then, the wall** (the user, 2026-11-01: "the thick fog I want to be Silent Hill
fog"). You step out of the lobby and the lot isn't there. The car you parked is a grey shape at
ten metres and gone at twenty. The lamp post you're walking to appears out of nothing. The
sky, the trees and the ground are one flat grey-white, and there's no sun in it, no up and no
far. Someone's voice carries, but you can't see them until they're right there.

## The mechanics

### F1 — When

- **Three kinds of morning:**

  | | Seen to | How it looks | Share |
  |---|---|---|---|
  | **Mist** | ~350 m | the far woods softened, the ridges gone | 30% |
  | **Fog** | ~150 m on open land, ~60 m down on the river ice | a haze: the near lot clear, the tree line a grey idea, the low places a white sea, gold towards the sun | 25% |
  | **Thick** | ~15 m, everywhere | the Silent Hill wall: grey-white all round, no sun, no sky, no far. You walk into things before you see them | 15% |
  | Clear | | | 30% |

  The shares are proposed. Thick is the rare one, so it stays an event.
- **Most mornings, not every one.** A schedule from the clock, as the storm's is, but by the
  day: `fogOn(day)` (the day's number since the epoch, São Paulo's) gives that morning's kind
  and its `thick` 0..1 within the kind, or none.
- **By the hour:** `fogAt(day, hour)` = `thick` × a curve. It forms in the dark from 4:00
  (unseen: the fog is black then, plan 44). It's thickest 6:00–7:30, around sunrise. It burns
  off 8:30–10:00, earlier on a mist morning and later on a thick one. On a thick morning it
  **lifts** as it goes: the layer's floor rises, so the ground clears first and the tree tops
  and the HQ's roof are last to come out.
- **The hour drives it, not the ms.** The server works it out from `state.hour`, so an admin who
  sets the hour to 7:00 gets that morning's fog. One who sets 15:00 gets none.
- **A storm blows it away:** the fog seen is `fog × (1 − storm)`. The blizzard's own white is
  what you see then.
- **On the server:** `WorldState.fog` (float32), eased in steps as `storm` is, plus `fogBy` /
  `fogTo` / `fogUntil` for the admins' panel. `mod:fog` calls one (1), sends it off (0) or hands
  it back to the schedule (null), admin only (plan 48), and goes in the admin log. The World
  panel gets a Fog row next to the Storm's: scheduled / fog / clear.

### F2 — The air

The fog chunk (`ShaderChunk.fog_pars_fragment` / `fog_fragment`) is replaced once, for every
material that takes fog. That keeps it one change, with no per-material patch. Its parts:

- **Exponential, not linear,** in the morning: the near things fade gently, the far ones are
  all gone. Today's linear fog stays as it is for the day and the storm (the morning term is
  added to it, by `fog`).
- **Height.** Its density falls off with the height above a fog floor
  (`density × e^(−(y − floor) / depth)`), integrated along the view ray. This is the usual
  analytic height fog: one `exp` and a divide a fragment. Low land sits deeper in it, so the
  river and the pond are white and the hilltops are clearer. `floor` rises as it burns off
  (F1).
- **The wall (a thick morning).** A second term, by distance squared (`3 × (l / V)²`, `V` ~15
  m): you and the first few metres stay clear, 10 m is half gone, 20 m is gone. It doesn't fall
  off with height, so the HQ's roof is as lost as the lot. Its colour is a flat light grey (the
  land's light, desaturated), with almost no gold towards the sun.
- **Flat light in the wall.** The sun dims to `(1 − wall)²` and the open sky's fill rises
  `1 + 0.6 × wall`, so a thick morning has no hard shadows (phase 0: they gave it away). The
  sun's shadows painted on the lot go with it.
- **Everything takes it.** The far ridges, the snow's multiplied decals (towards white) and the
  instanced tracks and prints all fog. Only the lights stay out of it (F4).
- **Drift.** A slow 3D noise in the density, moved along by the wind (`state.wind`), so you walk
  through thicker and thinner patches. It is never a flat wall.
- **Towards the sun, gold.** The fog's colour brightens and warms towards the sun's azimuth
  while it's low. At 6:30 the east glows; the west is a cool grey.
- **Its colour by the hour:** black in the dark (plan 44 N1: it follows `landLight`), a blue
  grey at first light, a warm white by 8:00, a plain white by the time it goes.
- **Not in the rooms.** A uniform box holds the room or building the camera is in, or none: the
  HQ by its level, or the town building you're in. The fog counts only the part of the ray
  outside that box. From inside, the room is clear and the land past the windows is white.
  From outside, nothing changes. If a storm does fog the rooms today, this fixes that too.
- **The sky and what's `fog: false`:** the dome goes to the fog's colour by `fog`, and the stars
  are off. The sun's disc is dimmed to a pale disc you can look at, with a soft glow round it.
  The far ridges fade out (they're unlit and unfogged, so they need their own fade). The lights
  stay `fog: false`, as points in the white (F4). In the wall they can't: a lamp 100 m off
  showing through 15 m of fog gives the game away. On a thick morning the lights fade too, over
  about three times the fog's reach, so a lamp appears as a glow at ~40 m, then a lamp.
- **The ink** fades with the fog's own amount at that pixel, not only the distance, so the lines
  go with what they outline. The fog's amount is written where the ink can read it (the alpha
  is taken by the glass's hole; phase 2 picks the channel).
- **The camera** sees no further than the fog: `camera.far` comes in with it (fewer draws: in the wall, ~60 m). God
  mode pushes it back by its height, as the storm's does.

### F3 — The banks

On a thick morning, over the low places only: a few dozen large, soft sheets of fog. They lie
flat and low over the river, the pond, the ravine and the fields, drift with the wind, and fade
out as you come up to them (soft, by the depth, so you never see an edge). From the hill they
make the white sea. Down in it you're inside the height fog and they're gone. High only:
Medium has the height fog alone.

### F4 — Lights in the fog

- **The lamps** still on (dawn, `on` from the night) each get a halo, a glow card scaled up by
  `fog`. On High the bloom picks it up.
- **Beams you can see:** a car's headlights and the torch show as soft cones in the air (the
  torch's cone mesh already exists, `view.ts:282`), stronger with `fog`.
- **Cars' lights on in fog:** the shuttle and the NPC cars drive with their lights on when
  `fog > 0.3`. A car you drive gets them on by itself, as the wipers come on in a storm.
- **The water tower's beacon** and the HQ's lit windows read through the top of it.

### F5 — People in it

- **Seen, then not:** a person (and their name tag) fades with the fog's amount at their
  distance: past ~150 m on a fog morning (less down in the valley), past ~15 m on a thick one. The night's rule (plan 44 N4)
  stays the stronger of the two. Voice and chat bubbles still show.
- **The minimap and the GPS** stay (the phone).

### F6 — The rest

- **The sound:** hushed. The wind is down to almost nothing, there's a drip from the trees and a
  crow somewhere far off. Someone else's steps (plan 63) lose their top a little faster with
  distance, by `fog`.
- **The frost:** freezing fog leaves rime. The trees' branches whiten through the morning and it
  stays till noon. A parked car's screen is misted (the screen's snow, `cars.ts:914`) until the
  wipers or a minute's driving clears it.
- **The breath** hangs a little longer in the air.

## Risks

- **The fog chunk must be in place before materials compile.** Changed after, every material
  recompiles, a hitch of seconds. The chunk's text (~1 KB) goes in the page, and its uniforms
  are 0 when there's no fog. The banks and the rest go in the lazy chunks.
- **Shaders with their own fog** (the dome, the ridges, `patchGrounds`' materials,
  `ShaderMaterial`s with `fog: true`) each need a look: they can't all take the chunk as-is.
- **Transparent things** (glass, the falling snow's points, the banks) fog by their own depth
  and not by what's behind them, as today.
- **Frame time:** the height fog is a few ALU a fragment and the banks are overdraw. The banks
  are capped by count and screen size, and are off on Medium.
- **e2e:** stills taken in the morning change. The fog is off in the tests unless a test calls
  it (`mod:fog` 0 at setup, as the hour is set today).

## The phases

### Phase 0 — the mocks

Dev stills (the `/dev` capture path, as plans 44 and 59): the lot from the lobby doors, the HQ
from the hill, the river from the road bridge, a lamp and a car's headlights, and a window from
the second floor. Each at 5:30, 6:30, 7:30, 9:00 and 10:00, on a mist morning and on a thick
one, on High and on Medium. Also: whether a storm fogs the rooms today. **Approved before any
code.**

Rendered 2026-11-01: `design/screens/fog/` (a contact sheet per spot, `sheet-*.png`; the stills themselves, ~300 MB, left out of the repo — `fog-shots.mts` makes them again), from
`apps/client/e2e/fog-shots.mts`. These are in-game stills as Ana, with F2's air patched into the
live 3D view's materials from the test, so no game code changed. The spots are the lot's east
aisle, the lawn looking back at the HQ, out on the frozen river looking south down it, out on
the pond, and the lobby looking out of its glass doors. (The county road's bridge was tried
first: the traffic stops in the frame and the trusses pull the camera in.) The mock's numbers:
`a` 0.028 a tile at the land's height 0 × `fog`, falling off over 4.4 m. The colour is the
land's light × 1.05 × a tint by the hour. The sun's side is at most 0.5. `fog` at 5:30 / 6:30 /
7:30 / 9:00 / 10:00:

| | 5:30 | 6:30 | 7:30 | 9:00 | 10:00 |
|---|---|---|---|---|---|
| Mist | 0.4 | 0.45 | 0.4 | 0.15 | 0 |
| Fog | 0.85 | 1 | 0.95 | 0.6 | 0.15 |
| Thick (the wall too, by the same) | 0.9 | 1 | 1 | 0.8 | 0.35 |

The wall is `3 × (max(0, l − 3) / 18)²` (V 18 m), greyed 75% towards its own luminance, with
the sun's side × 0.15. The dome goes to its colour by `max(1.1 × fog, 2.5 × wall)`, and the
ink fades over 5–22 m.

The first round's "thick" was the 150 m haze. After seeing it, the user called that the medium
one, the **fog**, and asked for the thick one to be **Silent Hill fog** (2026-11-01). Its stills
are `*-thick-*` and `sheet-thick.png`.

What they showed:
- **At 5:30 the fog is black** (it follows the land's light, plan 44). The lamp's pool and the
  HQ's lit windows read through it.
- **At 6:30 it's a cold blue grey; at 7:30 a warm white**, gold towards the sun. At 0.85 the
  sun's side blew out to a white disc; 0.5 is right.
- **The height works:** the pond and the river are thicker than the lawn, and the HQ's top
  floors are clearer than its base.
- **The overcast's pattern** showed through the whitened dome as dark streaks. It has to thin
  out with the fog (`cloudK`).
- **The room box works:** the lobby is clear, and the lot through its doors is white. The
  lobby's glass wall itself renders as dark tinted panes, so the doors are the view.
- **A storm does fog the rooms today** (`lobby-calm-1200` / `lobby-storm-1200`): the lobby's
  far end goes white. F2's box fixes it, if the storm's fog goes through it too.
- **Medium** (no bloom, no grain) looks almost the same as High. It needs no fallback of its own.
- **The wall reads as Silent Hill's:** Ana is clear, the car at 10 m is a ghost, the lot is gone
  at 20 m, and the sky, the land and the trees are one grey-white. At 5:30 it's black, and the
  lamp's pool is the only thing there.
- **Anything unfogged gives the wall away.** In the haze these didn't show; in the wall they do:
  - **The far ridges** (`ridgeMat`, `fog: false`) floated as a band of grey teeth. They must
    take the fog.
  - **The snow's darkening decals** (a `MeshBasicMaterial` multiplied in) must fog towards
    white, not the fog's colour.
  - **The tyre tracks and prints** (an instanced `ShaderMaterial`, `fog: false`) still show as
    dark smears 30 m off. They need the fog in their own shader (phase 2). The mock leaves them.
- **The sky must follow the wall as it lifts.** At 10:00 (wall 0.35) a sky still mostly its own
  grey made the fogged trees stand out white against it. The dome now goes with `2.5 × wall`.
- **The sun still throws sharp shadows in the wall** at 9:00 and 10:00. Thick fog is flat light:
  F2 dims the sun's direct light by the wall (`1 − 0.8 × wall`) and gives it to the fill.
  The mock doesn't.
- **Not in the stills:** the banks (F3), the halos and beams (F4), the hush and the rime (F6).
  Those are judged in the game, in their own phases.

### Phase 1 — the schedule

`shared/weather.ts` `fogOn(day)` / `fogAt(day, hour)`; `WorldState.fog` + `fogBy/fogTo/fogUntil`;
`mod:fog` (admin only, logged); the World panel's Fog row. Tests: the shares of mornings over
10,000 days, the curve's shape, the storm wiping it, an admin's call and its expiry, a set hour
followed.

Built 2026-11-01:
- **Shared** (`weather.ts`): `fogOn(day)` picks the kind and its `k` (0.7–1). `fogCurve(kind,
  hour)` rises over 4:00–6:00 and burns off over 7:30–9:45 (mist), 7:45–10:30 (fog) and
  8:00–11:00 (thick). `fogOf(kind, k)` turns it into what the view draws, `{ haze, wall }`.
  `fogAt(day, hour)` combines them, and `fogToday(ms)` is for the panel. `clock.ts` gains
  `spDay(ms)`.
- **The state** carries both numbers, so the view doesn't need the kind: `fog` (the haze) and
  `fogWall`, plus `fogBy`, `fogTo` ("" or the called kind / "clear") and `fogUntil`. The world
  state is at 56 of Colyseus's 64 fields.
- **The server** works it out each second from São Paulo's day and the world's hour (an hour an
  admin set brings that morning's fog). It eases by 0.02 a second, as the storm does, and
  multiplies by `1 − storm`. A storm called up `now` clears the fog at once too.
- **`mod:fog`** takes "mist", "fog", "thick", "clear", or null for the schedule. It's admin only,
  offline too, and a call lasts `FOG_CALL_MS` (20 min). A called fog is that kind at its height,
  whatever the hour. It's logged as `fog`, which is added to the API's `LOG_KINDS`.
- **Admins:** the World panel's "The morning fog" card (Clear, Mist, Fog, Thick, As scheduled)
  says who called it and for how long, or "This morning: …". The console has
  `fog [mist|fog|thick|off|auto]`, and the log has a line for it.
- **Checked:**
  - Shared: 483 tests, 4 of them new.
  - Server: `world.test.ts` 13 of 13, with the new fog test (a member refused; thick, then mist;
    a storm blowing it away and letting it back; clear thinning; the schedule at 14:00 and
    7:00). The whole suite was 188 of 189; "a bench by the fire" (park-life) failed once there
    and passed 3 of 3 alone.
  - In the game as Ana: thick called, `fog` and `fogWall` 1 and the card's line; back to the
    schedule at 15:50, both 0, "This morning: mist".
- **Not tested:** the call running out after 20 minutes (it's the storm's own logic), and the
  API's Pest tests, which weren't run (they wiped the dev database once).
- **Nothing draws it yet:** that's phase 2.

### Phase 2 — the air

The fog chunk (exponential, height, drift, the sun's side, the room box), its colour by the
hour, the dome, the sun's disc, the ridges, the ink, `camera.far`. Stills against phase 0's.

Built 2026-11-01:
- **`tp/fog3d.ts`** replaces three's fog chunks once, as the mock did per material. In the
  vertex shader, the world position comes from `mvPosition` and the view's transpose, since not
  every shader has `transformed`. In the fragment:
  - three's own fog (the day's, a storm's) counts only the stretch outside the room box;
  - the haze is the analytic height integral × the drift;
  - the wall is `3 × (max(0, l − 3) / V)²`;
  - towards the sun, gold.
  - Nothing of the morning's runs while `mfA` is 0.
- **The flags:** `MF_WHITE` fogs a multiplied decal to white (the campus's shadows, the cars'
  slush). `MF_SUN_SHADOW` also takes the painted sun shadows away with the sun. `MF_MORNING_ONLY`
  is for the far ridges, which take the morning's fog but not the day's.
- **The uniforms** are the same objects in every shader. A hook on `Material.prototype`'s
  `onBeforeCompile` hands them to each shader that has the fog, after the material's own hook.
  - Each own hook gets its own wrapper. A hook that keeps the one it found (`prev`) and calls it
    looped forever on the first try.
  - A program's key is still its own hook's source.
  - `view.ts` imports `./fog3d` first, so the hook is on before anything makes a material.
- **The view** (`morningFog`, a frame) eases towards the room's state (`setFog`, from the
  controller: `state.fog`, `state.fogWall`) and sets:
  - the amount and the floor (the campus root's height + `GROUND`);
  - the colour (`fogColour`: the land's light, tinted by the hour, greyed in the wall);
  - the sun's side, and the drift with the wind;
  - the room box: the floor's indoor tiles round me (`roomBounds`), or a Grounds building's box
    out on the land.
  - It also passes the fog to the sky (`setFog`: the dome from its hour's colours, the stars,
    the overcast) and the ink (lines fade by the fog's own amount at that distance), and makes
    the light flat (`flatLight`).
  - In the wall `camera.far` comes in to ~46 m (`farFor`), with the dome and stars scaled
    inside it.
- **There's no sun disc in the dome**, so there was nothing to dim.
- **Checked:**
  - Unit tests: `fog3d.test.ts` 7 (the chunks, the hook and the `prev` chain, the colour, the
    reach and the flat light, the room box, the ink); the client's 150 of 150.
  - Stills with the game's own fog (`REAL=1`, `design/screens/fog/real/`) match phase 0's, at
    every spot, every tier and hour, on High and Medium.
  - The storm no longer fogs the lobby.
  - The chain, as Ana: thick called at 16:17 makes the lot the wall (the view's fog 1, `far` 46,
    the sun 0); back to the schedule, all of it back.
  - The cost, the scene drawn with the GPU waited on, 120 frames: mist and fog the same as clear
    (lot 8.2 ms, lawn 5.3 ms, within the noise). Thick is cheaper: lot 6.8 ms (1001 draws),
    lawn 1.9 ms (95 draws).
  - The page is 424.2 of 430 KB (plan 63's 423.9 + the controller's line and phase 1); the
    characters chunk is unchanged at 58.0 of 58 KB.
- **Not done here:** the kart park's particles (their own shader, no fog) and the lights in the
  wall (lamp heads and glows still show through it far off) are phase 4's.

### Phase 3 — the banks

The sheets over the low places, the lift as it burns off. High only.

Built 2026-11-01:
- **The lift comes from the server, not the hour**, so an admin's fog called at noon lies on the
  ground instead of coming out already lifted.
  - `shared/weather.ts` `fogLift(kind, hour)` is 0 while the fog forms and holds, and rises to
    1 over its burn-off window: 7:30–9:45 for a mist, 7:45–10:30 for a fog, 8:00–11:00 for a
    thick one.
  - `fogAt` returns it with the haze and the wall (0 once the fog has gone). `fogOf` (a called
    fog) gives 0.
  - The state gains `fogLift` (57 of 64 fields), eased like the others; the controller passes
    it on.
- **The haze's floor rises** to `LIFT_TOP` (12 m) as the fog lifts. Under it is clear, so the
  ground clears first and the trees' tops and the HQ's upper floors last.
  - The shader takes the haze along a ray by the heights at its two ends, each at least the
    floor's: `h × L × (dens(y0) − dens(y1)) / dy`. The stretch under the floor adds nothing.
  - The first version, the `(1 − e^−k)/k` span less the part under the floor, could overflow
    looking down a long way, and inf − inf is a NaN, which the bloom spreads over the frame.
    Heights at the ends are always bounded.
- **The banks** (`tp/fog-banks.ts`): 21 sheets, one every 70 m along the river (none north of
  −640, under the Kart Park), every 55 m along the ravine, and three on the pond.
  - Each sits 2.2–3 m over the low land at its middle and is a 10 × 10 grid. Each vertex's alpha
    falls to 0 where the land comes within 0.4 m of the sheet, and towards the sheet's own edge,
    so it never cuts into a bank.
  - One cloud texture runs across them by world position, drifting with the wind. Their colour
    is the haze's ×1.12, tops lit from above.
  - In the shader they fade near me (12–45 m) and in their own layer (within 0.8–4 m of their
    height): seen edge on, or from inside, a sheet is nothing.
  - Their strength is `haze × (1 − wall) × (1 − lift)`, on High only. They're made the first
    time a fog wants them, one sheet a frame, nearest first (the land under each is sampled,
    making its chunks), and dropped with the surroundings.
  - "The fields" have no sheets: the campus's land is flat and the haze already lies there.
- **Checked:**
  - Unit tests: `weather.test.ts` gains the lift (shared 484 of 484), `fog-banks.test.ts` has 2
    (where the sheets lie; thinning at the land and the edge, turned with the river), and
    `fog3d.test.ts` checks the bounded haze (client 152 of 152). The room test checks the lift:
    on the ground at 7:00, the day's at 9:30, a called fog on the ground.
  - Stills: `sheet-lift.png` shows the HQ and the river at 7:30, 8:30, 9:00, 9:30 and 10:00. At
    8:30 the lawn is crisp to the horizon while the HQ's top floors are still in it.
    `sheet-banks-up.png` is from raised cameras: at 7:30 the river's valley is a white sea
    between the trees, their tops out of it, and the pond carries drifting cloud.
  - Cost, alternating off and on frame by frame, 200 each: from the bank 9.1 against 9.3 ms;
    from up over the river, within the noise.
  - The page is still 424.2 of 430 KB, and the characters chunk 58.0 of 58 KB.
- **Not done:** the chase camera doesn't go high enough to see the white sea in play (only
  from the bridge or a raised view). The sea shows from the road bridge, but traffic there spoils
  stills, so there are no stills from it yet.
### Phase 4 — the lights

Halos, beams in the air, cars' lights on, the beacon.

Built 2026-11-01:
- **Plan 44's `fog: false` on the lights had gone**: lamp heads, glows and lit windows already
  take the fog. What was wrong was the additive ones, which fogged towards the fog's colour and
  so added a grey patch on top of the scene.
  - Now the hook marks every `AdditiveBlending` material (`#define MF_ADD`, and `|add` in its
    program's key). It fogs towards nothing, over three times the reach: haze ÷ 3, wall ÷ 9.
  - In the wall a lamp shows first as a glow at ~40 m, then as a lamp; its head (not additive)
    fogs as usual.
  - Three's own fog does the same for them, so a far glow on a clear day fades out instead of
    greying.
- **Halos:** the Grounds' lamps' glow cards (and the Kart Park's) and the water tower beacon's
  sprite grow `1 + 1.4 × haze + 0.6 × wall`. `GroundsStream.halo` is set by the view and passed
  to `faceCards`.
- **Lights on in fog:** the view's `lampFog` is 0 below a fog of 0.2 and all of it by 0.5. It
  works wherever the code checks for night:
  - the cars' headlamp lights (`max(night, lampFog) > 0.25`);
  - a car you start driving gets low beams (`> 0.4`), as the wipers come on in a storm;
  - the Grounds' vehicles' lamp glow (`max(night, 0.6 × lampFog)`);
  - the visitor's car (the campus's `lampFog`).
- **Beams in the air:**
  - The torch's beam thickens by `max(storm, haze, wall)`, as it did in the snow.
  - The cars' two real headlamp lights each get the torch's beam (`view.airBeam`: its cone, its
    `along` fade and its shader, shared), 20 m along the throw, as wide as it throws. Its
    opacity is `0.015 + 0.5 × max(fog, storm)`: there in fog and snow, hardly on a clear night.
- **The Kart Park's particles** (spray, smoke, glow) get three's fog includes and its uniforms
  (`UniformsLib.fog`). The glow fades to nothing like the other additive materials.
- **Checked:**
  - Unit tests: `fog3d.test.ts` gains the additive case (marked, fogs to nothing at ÷ 3 / ÷ 9,
    its own program); client 153 of 153.
  - In the game (`design/screens/fog/real/lights/`): the driveway's lamps at 5:45 and 6:15. In
    the fog every lamp wears a halo; in the thick the far ones are gone and the nearest is a
    glow.
  - A lot car got into at 9:00 in broad daylight, in the fog: low beams by themselves, both air
    beams at 0.52. From behind and above at 6:15, a soft white wedge in the air ahead that isn't
    there with the beams hidden.
- **Not done:**
  - The campus's own lot lamps have no glow cards, so no halos (only the Grounds' lamps do).
  - Someone else's car shows its lights as its driver set them; in fog their client turned them
    on when they set off.
  - The shuttle's and the visitor's car's air beams come only from the nearest lit vehicle's
    real light, as at night.
  - The thick tier's car stills from a raised camera show a black sky beyond the shrunk dome.
    That's the test camera only (outside the game's dome); in play the camera is always inside
    its own.
### Phase 5 — people and the rest

People and names fading in it, the hush, the rime, the misted screens, the breath.

Built 2026-11-01:
- **People:** their bodies fade in the shader already. Their name tag and emote fade with what
  the fog leaves of them at their distance from the camera (`fogSeen`: fog3d.ts `inkLeft`;
  everyone's in full when I'm in a room and so are they). Under 0.5 left the tag fades, and under
  0.1 they join `unseen`: no name, no emote, and the dark's HUD hides them as at night.
  - A chat bubble isn't faded (they're heard).
  - The minimap and the GPS are as they were.
- **The hush** (`grounds-sound.ts`, the fog from the controller's `hear`):
  - the wind at `1 − 0.85 × fog` of its level, a storm's not hushed;
  - crows a little more often but far off (`1 − 0.65 × fog` of their gain), and from first light
    in a fog;
  - in the woods, a drip off a branch every 0.5–2.7 s, a falling plip, panned, louder the
    thicker the trees.
  - Someone else's steps lose their top faster with distance:
    `16000 / (1 + 0.35 × d × (1 + 1.5 × fog))`.
- **The rime:** `shared/weather.ts` `rimeAt(day, hour)` is the day's fog's (a mist 0.35, a fog
  0.75, a thick one 1, × its `k`). It builds 5:00–8:30, holds till noon and is gone by 13:30.
  - The view eases to the larger of that and a called fog's (`0.9 × fog`): up over ~4 min, down
    over ~10.
  - The trees' shader (grounds-stream.ts, its instanced colour) frosts the needles and the bark
    towards a pale grey-white by `0.6 × rime`. The snow on them is left as it is.
- **The windscreen:** getting into a car in fog, its screen starts misted (the screen's snow at
  `0.85 × fog`). The wipers clear it as before, and so does about a minute's driving out of a
  storm (above 2 m/s).
- **The breath** lasts `1 + 1.2 × fog` as long and drifts with less drag.
- **Checked:**
  - Unit tests: `weather.test.ts` gains the rime (shared 485 of 485); client 153 of 153.
  - In the game, Bia's name tag as Ana sees it from the lawn (opacity; "hidden" = unseen):

    | | 8 m | 14 m | 22 m | 40 m | 90 m |
    |---|---|---|---|---|---|
    | Clear | 1 | 1 | 1 | 1 | 1 |
    | Fog | 1 | 1 | 1 | 0.79 | 0.13 |
    | Thick | 0.65 | hidden | hidden | hidden | hidden |

  - The rime on the river's trees at 11:00 (`design/screens/fog/real/rest/sheet.png`).
  - Getting into a lot car in fog: the screen at 0.86.
- **Not checked:**
  - The hush, the drips and the steps by ear.
  - The screen clearing as you drive: the test car got stuck in the aisle, and the light snow
    that always falls built back up while it stood.
- **Found in passing:** standing on the frozen river, teleports stop working (the client's and
  the server's): Ana stayed at 318, −320. This is what broke phase 0's runs after the river spot.
  It's not the fog's.
### Phase 6 — the checks

Unit tests per phase; e2e as Bia on a thick morning (fog in state, the field hidden at 150 m and
the lot not, clear indoors, gone at 10:00, gone in a storm); frame time on High and Medium
against a clear morning; the page and chunk budgets; the user's pass in the game.

Done 2026-11-01:
- **`e2e/fog.spec.ts`** (GPU: `YUTOPIA_GPU=1`): Ana calls the fog, Bia's in it. The picture is
  measured from the 3D view itself: the scene drawn and read back at 32 × 20, region by region,
  against the same view clear.
  - **Thick:** the state's wall 1 and called by Ana, Bia's `camera.far` under 60 and the sun
    under 0.05, the lot and the trees gone (> 25 a cell).
  - **Fog:** the lot's far end and the trees changed more than twice as much as its near end.
  - **The lobby:** the inside as it was in the wall outside (< 6 a cell).
  - **Ana:** across the lot (28 m) she's unseen by Bia; a step off, she's seen.
  - **A storm:** called up, it clears the state's fog and wall and Bia's view; sent off, the
    wall comes back.
  - **The schedule:** at 10:00 it's the day's `fogAt` (a mist or a fog all but gone); at 11:30
    nothing.
  - The first suite run failed the lobby (27 a cell). Bia stood just inside the west glass and the
    camera behind her was on the wall's line, a hair outside the room box. The box now reaches
    0.35 m past the room's tiles (a camera against an outer wall is in), and the spec stands Bia
    deeper in and checks she got there. Passing since.
- **Keeping the fog out of the other specs:** `e2e/helpers.ts` `enter` calls `mod:fog` "clear"
  (an admin's, so when Ana enters; 20 minutes) next to `mod:dark` "peaceful". A real foggy
  morning in São Paulo won't fog their shots.
- **The specs nearest it:**
  - Passed: fog, day ×2, night ×2, beam ×2, dark, the Grounds ×4, lighting ×3.
  - Red, already on the known list: car's passenger (a 233 ms frame), the town in 3p, lighting's
    GL errors.
  - Red, and red on `main` too: car's "a parked car knocked" and "under a flier" (no car prompt),
    and dark-hud (no `.dk-team`). They were run against a detached worktree of `e948a59` on its
    own dev client (:3107), with the same world server, and failed the same way. So they're not
    the fog's.
- **Frame time:** the whole frame (the post's passes too) with the GPU waited on, 120 frames,
  median, in ms:

  | | Clear | Mist | Fog | Thick |
  |---|---|---|---|---|
  | High, lot | 10.7 / 9.8 | 10.8 | 10.7 | 8.5 |
  | High, lawn | 7.2 / 6.2 | 6.3 | 6.1 | 2.3 |
  | Medium, lot | 9.4 / 9.3 | 9.2 | 9.2 | 8.0 |
  | Medium, lawn | 5.8 / 5.8 | 5.8 | 6.1 | 2.2 |

  (Clear was measured before and after the fog tiers: two numbers.) The fog costs nothing past
  the noise, and thick is cheaper: the camera sees 46 m.
- **Budgets:** the page is 424.3 of 430 KB, the Grounds' chunk 176.0 of 187, and the characters
  58.0 of 58 (unchanged).
- **Unit tests:** shared 485 of 485, client 153 of 153, the world room's 13 of 13.
- **Still to come:** the user's pass in the game, and the sounds by ear.

Double-checked 2026-11-01 (the whole change re-read for bugs). Fixed:
- **An added light's program could be another's.** The `|add` mark was only on materials with
  no program key of their own. The light map gives every material it lights one key
  (`yutopia-lightmap`), so a glow among them could have taken a plain program, or the other way
  round.
  - `customProgramCacheKey` is now an accessor on `Material.prototype` too, as the hook is: each
    material's own key is kept, and an added light's is marked whoever set it.
  - Keys that wrap the one they found (pets3d.ts, the chars' model.ts) and one handed to another
    material (person3d.ts) each still read their own; there's a unit test.
- **Indoors, the ink faded in the fog.** The outline pass knew nothing of the room box, so in a
  big hall on a thick morning the room's own lines went past ~15 m. It now takes no fog in the
  room I'm in. Out of one, it takes the haze where the camera is, none under a lifted floor.
  - Checked in the lobby with the post's passes: clear against the wall outside, 4.7 a cell (the
    windows); the ink's fog 0.
  - The e2e drew the scene without the post, which is why it didn't catch this.
- **The banks stalled a frame (115–200 ms) the first time.** Two causes:
  - Their shader compiled then. It's now compiled while the world loads, in the view's warm
    group (a one-quad stand-in in their material), along with the flashlight's beam, which the
    cars' beams in the air share.
  - Their sheets made land chunks across the map (a chunk by the river is 30–50 ms). Now only
    sheets within 200 m are made, and only once the Grounds have made the land under them
    (`shared/grounds.ts` `landReady`). The haze leaves under 2% of a sheet past 200 m.
  - The worst frame as a first fog comes in: 26.7 ms (19–25 clear), from 115–200.
- **The haze's exponent is clamped** (e^20): a fragment far under the land would overflow to a
  NaN, which the bloom spreads over the frame.
- **The room box is found again when the floor's map changes**, not only when I move to
  another tile.
- **The cars' beams in the air are disposed** with the cars (their cone is the flashlight's, so
  it's kept).
- **`mod:fog` logs only when it changes**, as `mod:dark` does: the e2e helper's "clear" on every
  spec had put 55 lines in the admin log.
- **The API's `fog` log kind:** `php -l` is clean, and the live admin log holds the fog's rows,
  so the API takes them. Pest wasn't run: the dev database's at stake, and that's the user's call.
- **After:** client 155 of 155, shared 485 of 485, the world room's 13 of 13, the fog e2e passing,
  and the lot's stills in fog and thick as before.
- **The World panel's Fog card, checked in the game as Ana** (each option clicked in turn):
  - The state, the button lit, and the card's line ("Thick called by Ana Demo · 20 min left";
    "This morning: mist" back on the schedule) are right for all five. The log has a line per
    change, and there are no errors. At 760 px wide the five options fit ("As scheduled" wraps).
  - **Fixed:** in a storm the card said "Thick called" with no fog in the air and nothing saying
    why. It now adds "a storm's blowing it away" (EN / PT) whenever a storm's up (≥ 0.3) and
    there's fog to blow away (a call, or this morning's).
  - The World tab's line now names the fog.
  - **Kept gradual** (the user's call, 2026-11-01): a fog called from the card comes in as a
    storm does, eased by the server at 0.02 a second, so thick from clear takes ~48 s and goes as
    slowly.
- **Found again:** the river ice teleport bug (a separate session's fix, on its own branch)
  stuck Bia and Cai there in these checks.

## Decisions

Decided with the user (2026-11-01):

| | |
|---|---|
| How often | **Most mornings, varied.** Seeded by the day, the same for everyone: ~30% clear, ~30% a mist, ~25% a fog, ~15% thick |
| How thick | **Three kinds** (2026-11-01, after phase 0): a mist; a fog, the ~150 m haze of the first stills; and a thick one, **Silent Hill fog** (~15 m everywhere) |
| When | **Thickest 6:00–7:30, gone by ~10:00.** Forms in the dark from 4:00, burns off 8:30–10:00, later on a thick morning |
| People | **Hidden in it**, they and their names fading with the fog, as the night's rule (F5) |
| In scope | **All of it**: lights and beams (F4), the banks (F3), the hush and the frost (F6) |

Still open, for phase 0's stills: the fog's colours by the hour, the banks' look, and whether a
storm fogs the rooms today.
