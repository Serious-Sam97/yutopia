# 69 — The long road

Ask (2026-11-03): "Add the long road outside of the town with more forest along with it (i mean
really long), mountain etc... And in the end a possibility to expand the map using God mode, but
only on last phase. Lets plan."

Planned 2026-11-03. Follows `53-the-god-mode.md` (edits over the generated Grounds, draft →
publish), `55-the-drafts.md`, `64-the-fog.md` (the fog hook, `farFor`), `65-the-weather.md` (the
green base, the snow as a layer), `66-the-water.md` (`waterAt`, swimming) and `50-the-volume.md`
(Jolt, floors by height). Workflow rule: mocks first (phase 0), approved before any game code.
Phase 10's own mocks come at its start.

**What this changes:** the world stops being a fenced box. Today the Grounds are about 1 × 1.2 km,
with ridges past every edge and a "road closed" barricade at the east end of Main Street. After
this plan that barricade is gone. The county road runs on east for **about 14 km**: out of town,
through a long forest, along a gorge, up switchbacks to a mountain pass, and down to a lake with a
lookout at the road's end. Mountains you can walk on stand either side of it, and far ranges are
drawn on the horizon. At the end of the plan, an admin can grow the land from god mode.

## Decisions (the user's, 2026-11-03)

| | |
|---|---|
| How long | **12 km or more**: a real drive. Everything streams; the far ranges are drawn cheaply |
| Which way | **East, past the barricade**: the road-closed barricade at (528, −405) opens, the county road carries on |
| The mountains | **Real, with a pass**: walkable terrain 300–600 m high near the road, switchbacks to a pass, rock and a snowline on the peaks; far ranges drawn only |
| The end | **A lookout and a lake**: the lake basin past the pass, a lookout with a turnaround, a cabin or two |
| God mode | **Expanding the map is the last phase**, and nothing earlier depends on it |
| Traffic | **Now and then**: every few minutes an NPC car drives the road one way, headlights at night (L3) |
| The dark | **The shadowed roam the Long Wood at night, off the road**: never on it or in its lit places (L7) |
| Getting there | **A bus from Main Street** to the lookout and back, on a timetable, ridden like the shuttle (L7) |
| The snowline | **White all year** above about 600 m, even in plan 65's green (L4) |
| Names | **Set 1** (2026-11-03, phase 0): **Long Pine Road**, **Silver Lake**, **Hawk Pass**; the stops take the lake's name (Silver Lake Lookout) |
| Phase 0 | **Signed off 2026-11-03**: the course (13.8 km, the numbers below), the look and the far view as mocked, its findings carried into phases 3–5 |
| Phase 10's land | **Forest, meadow, hills, mountains, lake, plus beach/coast, desert/canyon and farmland** |

## Where we are

### The land is a fixed box

- **`GROUNDS = {x0 −480, z0 −960, x1 544, z1 208}`** (`shared/grounds.ts:83`, 1024 × 1168 m,
  32 m chunks, `CHUNK` :78). Axes: x east, z south (north is −z), y up, 1 tile = 1 m.
- **What people can reach is a second rectangle, written out by hand twice.**
  - The core is x −400..528, z −580..172. The kart ground (`kart/land.ts:62`) is about x −140..242,
    z −890..−560.
  - The two copies are in `beyond()` (`grounds.ts:1059`) and `worldRects()` (:1049; 24 m margin,
    clamped to `GROUNDS` ±2).
  - The reachable land stops **2 m** short of `GROUNDS` in the east, 56 m in the west, 12 m in the
    south and 46 m in the north.
- **Past the reachable land:**
  - `macro` raises ridges of about 28–52 m within about 120 m
    (`40·(1−exp(−(o/60)²))`, :1073).
  - `walkable()` refuses where `beyond > 24` (:2134).
  - Jolt gets an invisible wall from y −100 to +200 (`shapes/grounds.ts:1182`).
  - Outside `GROUNDS` there is no land mesh at all: the void, hidden by fog.
- **The horizon is painted**: two rings round (32, −376), at R 1150 (50–130 m high) and R 1500
  (90–220 m), drawn with MeshBasic (`tp/grounds3d.ts:5257`). The camera's far plane is 1400
  (`tp/sky.ts:67`), so the outer ring is mostly clipped.
- **The barricade**: `ROAD_CLOSED` at (528, −405) (`grounds.ts:1995`). Three barricades and a
  drift, 1.3 m high, their tiles blocked (:1883). Main Street is x 300 → 536, 14 m wide. The county
  road is 9 m wide.

### Height

- **Analytic noise, baked per chunk** on first ask: a 65 × 65 Float32 grid at 0.5 m (`LAT=2`,
  :2001, :2087). `heightAt` interpolates it.
- **`macro = 6·fbm(x/170)`** (±6 m) and `micro = 1.5·fbm(/38) + 0.3·fbm(/9)` (:1066, :1080).
  `FLATS` flattens the campus, the town and the farm (:336). `terrainAt` (:1301) carves the water,
  levels the roads and pads the buildings.
- **Measured**: the highest point people can reach is 6.3 m; the highest anywhere is 52.9 m (the
  edge ridges). **There are no mountains.**
- **Road heights are `macro` averaged over ±10 samples** (:1098). That is fine on ±6 m hills and
  useless on a 500 m climb. Bridges are made only for the river and the ravine (:1154).

### Trees

- **`treesIn`**: one candidate a 3.2 m cell, seeded, kept by `treeDensity` (≤ 0.95; +0.3 past the
  edge) (:1604–1703). Kinds: pine about 70% (six variants, 6.5–13.5 m), birch 20%, bare 10%.
- **63,209 trees today**, about 53 a chunk.
- **Drawn** as one InstancedMesh pool a kind, refilled from the blocks shown. Near blocks get the
  detailed tree, snow mounds and the woods' floor cover. Far tiers get `farPine`, `farBirch` and
  `farBare` (`tp/grounds-stream.ts:262`, :723). There are no impostors.
- **Shadows** within 34 m (`CASTERS_R`).
- **Solids**: a Jolt cylinder a tree, the trunk's tile blocked, a circle for cars.

### Drawing

- **The land** is a quadtree of 128 / 64 / 32 m blocks out to `RADIUS` 440, never outside
  `GROUNDS`, built within 6 ms a frame (`grounds-stream.ts:84`, :435).
- **Everything else is built once**: the statics (`Grounds3`: the ways, water, buildings and lamps)
  within 900 of the centre (:308). The water is one mesh set.
- **Fog** is 120 / 520 by default and 210 / 1150 on a clear day (`tp/view.ts:3908`).
- **The sun's shadow box** follows the camera (:3746). That part already works anywhere.

### Physics and the server

- **Chunks in Jolt**: each chunk is a HeightFieldShape (65 samples padded to 68) plus one compound
  of its solids (`physics/build.ts`).
- **The client** keeps 5 × 5 chunks round you (`RING=2`) and **never drops one**
  (`tp/physics3d.ts:31`).
- **The server builds every chunk in `GROUNDS` at start**: 1184 chunks, 3 ms a tick, from the land
  worker (`world-server/features/physics.ts:29`, :58; `land.ts:52`). Jolt's heap is a fixed
  128 MB; today's world takes about 34 MB.
- **Chunk caches in shared are kept forever**: about 24 KB of JS a chunk, about 28 MB today.
- **Cars** run their own sim off `heightAt` (0 outside `GROUNDS`) and `carBlockedTile`
  (`car/world.ts:131`, :184). A sedan tops out at 160–180 km/h.
- **The walkable grid**: 1 m tiles, built lazily a chunk at a time. `chunkKey` is good for about
  ±65 km (:2013), so the keys already fit.
- **Positions on the wire are float32** (`schema.ts:12`). At x 12,600 one step is about 1 mm, which
  is fine.

### Fixed to `GROUNDS` or the hand-written rectangle

Each of these has to learn the land's real shape:

- **The rectangle and the box**: `grounds.ts` :83, :1049–1065, :2758 (the map area), :3226
  (`checkEdits`).
- **Hard-coded places**: the fence (:1581, :1638), the river's x (:1691) and the town's centre
  (:1082).
- **Shared tools**: `grounds-hash.ts:60`, `grounds-brush.ts:46` and :138, `physics/audit.ts:56`
  and `physics/soak.ts:82`.
- **The client's view**: `grounds-stream.ts` :89, :311 and :457, `grounds3d.ts:5264`, `sky.ts`
  :39 and :67, `view.ts:3910` and `fog-banks.ts:84`.
- **The server**: `physics.ts` :29 and :59, `land.ts:52`, and `car/world.ts:184`.
- **The GPS**: `grounds-plan-data.ts:28` draws one raster of the whole world at 1 px a metre, plus
  a list of every tree. At 14 km that canvas is over 20,000 px wide, past what a canvas can be.
- **God mode**: its camera clamps to `GROUNDS` (`god/controller.ts:323`). Every edit is gated by
  `inWorld` (`beyond === 0`) (:3207 and on).

### Budget

- The page is 443.6 / 446 KB. `yutopia-grounds` is 180.8 / 184.
- The user's standing call: raise budgets as needed, measured and written down
  (`tools/budget.mjs`).

## The idea

**Where the barricade stood, the county road carries on east.**

- **Out of town**: past the last houses, the road runs between snowy fields and fence lines.
- **The Long Wood**: then the forest closes in, far deeper than today's woods.
  - Tall spruce and pine, birch where a creek runs beside the road, fallen logs, boulders.
  - A clearing with a rest stop.
  - Light coming through in shafts by day; black, with only your headlights, at night.
- **The gorge**: the creek drops into it and the road follows its rim, then crosses on a high
  bridge.
- **The climb**: the switchbacks begin, hairpin over hairpin.
  - Guard rails and rock cuts.
  - The forest thins to the treeline, then scree and snow.
  - Looking back down, the whole valley, and the town small and lit at the end of it.
- **The pass**: between two peaks, cold and windy.
- **The lake**: below the pass, in a basin ringed by peaks, a long lake.
  - The road winds down to it and ends at **the lookout**: a turnaround, a few parking spaces, a
    viewing deck over the water with coin binoculars.
  - A jetty, and a cabin or two.
  - It freezes by the weather and is swum when it's open (plan 66).

**Everything is real near you and drawn far off.**

- You can stop anywhere, get out and walk into the forest or up a slope until it's too steep.
- From the pass, the ranges you see 10 km away are drawn, not walked: their own cheap meshes,
  hazed by the air.
- The walkable land is a broad band, about 1 km across, round the road, the lake and today's
  town. Past it the land rises into peaks that walls keep you off, the way today's ridges do.

**At the end (phase 10)**, an admin in god mode can add land next to the land there is.

- They pick what it is: forest, meadow, hills, mountains or a lake.
- It's generated like the rest, then shaped with today's tools: roads, paint, trees, things,
  buildings.
- Draft, then publish, like every edit.

## The course (as mocked in phase 0)

**13.8 km of road**, about 9.8 km east of the barricade as the crow flies. Worked out in
`apps/client/e2e/road-course.mts`, drawn in `design/screens/road/map.png` and `profile.png`.
Altitudes are over today's ground (the town sits at about 0–6 m).

| km | Stretch | Altitude | What's there |
|---|---|---|---|
| 0–1.5 | **The edge of town** | 2 → 10 | Fields either side (forest past 300–400 m), hedgerows, the "Silver Lake 14" sign where the barricade stood |
| 1.5–4.9 | **The Long Wood** | 10 → 93 | Dense forest on gentle bends; the creek on the north; a timber bridge over it at km 2.6; **the rest stop** at km 3.7 (52 m) |
| 4.9–6.1 | **The gorge** | 93 → 159 | The road along the gorge's south rim; the creek about 45 m below; **the high bridge** at km 5.9–6.1 (135 m long, 49 m over the creek) |
| 6.1–10.4 | **The climb** | 159 → 435 | Seven legs and six hairpins up a south face; grades 7–9% on the legs, ≤ 4.7% in the hairpins; **the pull-out** at km 10.0 (411 m) |
| 10.4–11.6 | **The pass** | 435 → 461 | Hawk Pass at km 11.2 (461 m), between peaks of about 1,050 and 1,250 m; snow poles |
| 11.6–13.8 | **The lake** | 461 → 410 → 422 | Down to the lake (401 m, about 1.3 × 0.5 km) and along its south shore; **the lookout** on the bluff at its east end (422 m); the jetty and two cabins at its west end |

- **The steepest grade is 9.0%** (a climb leg); the hairpins are at most 4.7%.
- **The treeline** is at 420 m ± 90, ragged by noise, with scattered firs above it. It's higher
  than the 380 first proposed, so the lake basin keeps a few trees.
- **The peaks round the pass and the lake are 1,050–1,250 m**, higher than the 900 first proposed.
  Far ranges ring everything past about 2 km off the band.
- **Every number is a starting point for phase 3**, where the spine test checks them.

## The mechanics

### L1 — The land as data

- **One list of what the land is**: `LAND: Region[]` (`shared/land.ts`). A region is a `rect` or a
  `ribbon` (a polyline with a half-width, eased at its ends), and each has a **biome**: town,
  field, forest, gorge, alpine, lake.
  - Today's core and the kart ground become two rects. The long road's band is a ribbon round its
    spine. The lake basin is a rect.
  - `beyond(x, z)` becomes the distance to that union, found through a coarse bucket index (256 m
    cells). It no longer reads a hand-written rectangle.
- **`landBounds()`** is derived from `LAND`: the old `GROUNDS` box, now worked out instead of
  written down. Anything that only needs a bounding box (chunk keys, the hash's iteration) reads
  it. Anything that loops over it (streaming, the GPS, the audit, the server's prefetch) **loops
  over the regions' chunks instead**. A box 11 km wide is mostly empty.
- **The edge**: the ridges past the edge still rise from `beyond`, now from the distance to any
  region. A ribbon's edge is a valley wall, not a box's side.
- **Today's world unchanged**: with only the old regions in `LAND`, every chunk's hash matches
  HEAD's. With the long road in, every chunk west of x 470 still does; only the east end of Main
  Street changes. CI proves both.

### L2 — Streaming everywhere

The world grows about 12-fold. Nothing can be built for all of it at start or kept forever.

- **Chunk caches, shared**: an LRU over heights, walk, surfaces and trees, capped at about 4,000
  chunks (about 100 MB). Each holds the chunks near any player or car. A chunk it drops is rebuilt
  from code, which is deterministic and about 2 ms.
- **Server physics on demand**: a ring of chunks round each player and each driven car, ahead
  along its heading at speed. Chunks nobody is near are dropped. The land worker is asked for
  chunks as needed instead of prefetching all of `GROUNDS`.
  - The fixed 128 MB Jolt heap stays, and is checked under a spread-out load (players at both
    ends and a car in the middle).
- **Client physics**: drops chunks out of the ring plus a margin.
- **The land stream** iterates the regions' chunks within `RADIUS`.
  - It **looks ahead along the camera's motion**: at 50 m/s a car crosses a 32 m block in 0.6 s.
  - Its 6 ms a frame is checked on a top-speed drive.
- **The statics stream by district** (512 m squares). The ways, lamps, water, buildings and street
  things are built for districts within about 900 m and dropped behind. Today's town is a few
  districts, built as today.
- **The GPS is tiled**: 256 m tiles at 1 px a metre, drawn on demand in its worker and cached
  (LRU), with a whole-world overview at 1 px per 8 m. Trees are drawn per tile, not as one list.

### L3 — The road

- **The Long Road is a way** in `BASE_WAYS` (`key: "long-road"`), its control points written by
  hand. It joins the county road where the barricade stood, which comes out with its tiles and
  shapes. A sign stands there instead.
- **Its profile is designed, not averaged.**
  - The road has its own altitude along its length: control heights, eased.
  - `terrainAt` eases the land to it. The land doesn't decide the road.
  - **Cut and fill**: banks at a slope the land can hold. Past about 6 m of cut, a rock face.
    Past about 4 m of fill, a retaining wall. Past about 10 m of fill, a bridge.
  - Bridges come from the profile (a generic span and piers), no longer only from the river and
    the ravine.
- **Hairpins**: wider (12 m), flatter (≤ 4%), with a guard rail on the outside.
- **What lines it**:
  - Guard rails wherever there's a drop of more than 2 m.
  - Reflector posts every 50 m; snow poles past the treeline.
  - Signs: km markers, chevrons on bends, "Lake 14 km", the pass's height.
  - No lamps except at the rest stop, the pull-out and the lookout. **The road at night is dark.**
- **Markings** as today's county road: white edges and a dashed yellow centre, doubled on blind
  bends. Worn and snow-dusted by the weather layer.
- **Cars**: the same sim. Grades come from `heightAt`. Grip by the surface: asphalt, with ice
  above the snowline when it's cold. The GPS routes over it, and town cars and the shuttle keep
  their routes.
- **Traffic**: every few minutes (a seeded timetable) an NPC car drives the whole road one way,
  town → lake or back, at a speed for the bends, with its headlights at night (the campus's
  `Visitor` is the precedent). It's the server's, on the road's lane, never off it. It slows for
  anyone on the road and stops short of them; it is drawn only where someone is near, and simulated
  along the spine (not the car sim) where nobody is.
- **A test** walks the spine: grades ≤ 9% (≤ 4% on hairpins), the cross-slope, a 9 m clear width,
  no tree or solid on the road, every drop railed, the car sim drives it end to end without
  leaving it.

### L4 — The mountains

- **A mountain field**: ridged fbm at a 1.5–3 km scale, up to about 900 m, masked so it's nothing
  in town and grows east from about km 5.
- **Shaped round the road**: within a ribbon of the spine the land is pulled toward the road's
  profile, eased out over about 300 m. Valleys open where the road goes and peaks stand off it.
  The road isn't cut 300 m into a mountain, because the mountain was never there. The gorge and
  the lake basin are carved on top, as the river and the pond are today.
- **Walkable** where the slope allows (today's tile rule, < 0.9 within a tile). Steeper ground is
  rock you can't stand on, as today's steep tiles are. Jolt heightfields as today.
- **Surfaces by height and slope** (today's order, extended):
  - forest floor under the treeline
  - alpine grass and scree over it
  - rock on the steep
  - snow above about 600 m, always, even in plan 65's green
  - the snow layer below that, by the weather
- **Far land** (L6) draws the same field coarser, so what you see far off is what you'll walk on.

### L5 — The forest

- **Density by biome**: the Long Wood 0.9 (today's woods are about 0.6), thinning toward the
  treeline, scattered firs above it, none past about 450 m.
- **New kinds**: tall spruce (18–26 m), young pines, dead snags, fallen logs (solid: you climb
  over them), boulders, stumps, ferns and bushes in the floor cover. **Clearings** come from
  low-frequency noise.
- **Drawn in four tiers**:
  1. Near: today's detailed trees.
  2. Out to about 600 m: today's low-poly far trees.
  3. Out to about 2 km: **impostor cards**, each kind rendered from its own model into an atlas
     with the ink line and the snow, crossed or camera-facing, instanced per far block.
  4. Past that: **canopy in the far land**, the forest's colour and a faceted bump in the far
     mesh, so a forested slope reads as forest from 8 km.
- **Solids** as today: a Jolt cylinder a trunk, a box a log. Only chunks in the physics ring have
  them.

### L6 — The far view

- **A far land tier**: 512 m blocks at a 16 m step, and 1 km at 32 m, out to about 12 km from the
  camera. Built from the same height field in the stream's worker. Only the land: no statics, no
  physics.
- **Its own pass**: it is drawn first, with its own camera (near 300, far 14,000), then the depth
  is cleared and the near scene is drawn as today (far 1400, so its depth precision and the ink
  pass are untouched).
  - The two meet in an overlap band (300–440 m), dithered.
  - The far pass gets the same fog function, so the haze is one haze. A clear day sees the far
    ranges; fog and storms hide them as today.
- **The painted rings go.** Past the land's last real range, a **horizon band** of distant peaks
  goes round the camera (not round today's town centre), a few ridgelines at fixed far distances,
  coloured by the sky.
- **The lake and the town lights at night**: points of light (instanced quads) for far lamps and
  windows, so the town glows from the pass.
- **Tiers** (`lib/prefs.ts`):
  - High: far land to 12 km plus impostors.
  - Medium: 8 km.
  - Low: 4 km, impostors to 1 km.

### L7 — The places

- **The rest stop**: picnic tables, a fire pit (a hearth's warmth, plan 68), a toilet hut and
  lamps, all from the furniture kit placed as Grounds things.
- **The pull-out at km 9**: a widened shoulder, a rail and a bench looking back.
- **The lookout**: a turnaround loop, parking for six, a deck 20 m over the water and coin
  binoculars (use them and the camera zooms ×6; Esc lets go).
- **The lake**: `waterAt` gets a `lake` kind (plan 66's shape: level, bed, shelf). It's swimmable
  when open and freezes by the weather, and the ice is walkable. A jetty with a rowing boat (decor,
  like the canoe).
- **The cabins**: two, generated insides as the barn and the farmhouse have (`INSIDES`), one with
  a stove that warms you.
- **The creek**: a narrow water along the Long Wood and down the gorge, swum and waded through
  `waterAt` (plan 66's creek kind).
- **The bus**: a stop on Main Street and one at the lookout (shelters, a timetable on a post). A
  bus runs the road on a timetable, ridden as the shuttle is (`SHUTTLE`'s seats and boarding),
  stopping at the rest stop on request. The same lane and rules as the traffic.
- **Coming home**: the GPS knows the lake by its name (phase 0). Today's come-back and respawn
  rules hold.
- **The dark out there**: at night the shadowed roam the Long Wood's deep forest (plan 58's
  rules), **never the road** (a band of about 6 m either side of it), the rest stop, the pull-out
  or the lookout while their lamps are lit. A car's headlights keep them back as a flare does. So
  off the road at night is theirs; on it, you're safe.

### L8 — The air up high

- **The cold by altitude**: the weather's temperature falls 6.5 °C a km, so the pass is about
  3.4 °C colder than the town. The snow layer and the ice follow it (plan 65's layer by
  temperature), and so does warmth (`vitals.ts`).
- **Wind** grows with height and gusts at the pass (the sway's wind, the snow's drift, the sound).
- **Valley fog**: on misty mornings (plan 64) it pools in the gorge and over the lake (fog banks by
  low ground), and the pass stands above it.
- **Sound (last)**: the forest by day (wind in the trees, birds, the creek), the forest at night,
  the gorge's echo and rush, wind at the pass, the lake's lap. Picked from CC0 sources like plan
  63's, the user choosing.

## Risks

- **Memory**: the leak in `next dev` already freezes the VM (`next-dev-oom-freezes`). Every cache
  must be bounded before the world grows, so L2 lands first and is soaked.
- **Hitches at speed**: the stream, the physics ring and the statics' districts have to keep up at
  50 m/s with no frame over 33 ms. Measured on a scripted top-speed drive, on all tiers.
- **Depth and the far pass**: two passes cost one extra clear and the far draws. The ink pass reads
  the near depth only, so the far land has no ink line except a silhouette drawn into its own
  colour. Phase 0 shows whether that reads.
- **Precision**: float32 at 12 km is about 1 mm, fine for the wire and Jolt. Near-scene meshes are
  built in local coordinates (block origins), so the GPU never sees 12 km vertex values. Checked
  with a still at the lake's far end.
- **The server's CPU**: the chunks of a player at the lake and one in town are built, stepped and
  dropped independently. Measured with N bots spread along the road.
- **Today's tests**: specs that stage things near the east barricade, the physics audit and soak
  (which loop over `GROUNDS`), the hash proof, and fixtures in the shared dev world
  (`e2e-fixture-swap-backup`).
- **God mode's edits**: published edits are keyed by chunk and checked with `inWorld`. With the
  new land in, edits stay valid, because nothing reachable shrinks.
- **Budgets**: the long road's data (control points, regions) is a few KB. The far tier, the
  impostors and the places land in `yutopia-grounds` and are raised as needed.

## The phases

### Phase 0 — the mocks

Approved before any game code. Stills in `design/screens/road/`, contact sheets in the repo.

- **The course**: a top-down map of the whole road (biomes, the creek, the gorge, the hairpins,
  the lake, the walkable band, today's town for scale) and **the profile** (altitude and grade
  along all 14 km), from a mock height field in a dev script.
- **Stills**, from a dev Grounds shot with the mock field and the mock far tier patched in:
  - the barricade's spot opened
  - the edge of town
  - deep in the Long Wood by day and by night with headlights
  - the rest stop
  - the gorge's rim
  - the high bridge
  - a hairpin from above
  - the pull-out looking back at the town (day and dusk)
  - the pass
  - the lake from the lookout
  - the lake from the jetty
- **The far view**: the far land, the impostors, the canopy and the horizon band, on a clear day,
  in light fog and at dusk, on High and Low.
- **Names**: three or four sets for the road, the lake and the pass, shown on the signs in the
  stills, for the user to pick.
- **Agreed here**: the length and course, how high the peaks are, the forest's density, the far
  view's look, and the names.

**Rendered 2026-11-03**: `design/screens/road/`. No game code changed.

- **The course**:
  - `map.png`: the whole road on one map, with the land shaded by height, forest, rock, snow, the
    creek, the lake, the walkable band, km marks and today's Grounds dashed for scale.
  - Close-ups: `map-climb.png`, `map-lake.png`, `map-town.png`.
  - `profile.png`: altitude and grade along the road, the treeline and the snow that never goes.
  - Worked out in `apps/client/e2e/road-course.mts` (the spine, the profile, the land, the creek,
    the lake, the forest) and drawn by `road-map.mts`.
- **The stills**: 30 of them, from `apps/client/e2e/road-shots.mts`.
  - Taken in the game as Ana, with the mock patched into the live 3D view from the test.
  - Contact sheets: `sheet-town`, `sheet-wood`, `sheet-gorge`, `sheet-high`, `sheet-lake`,
    `sheet-far`.
  - Spots: `opened`, `edge`, `wood`, `wood-in`, `rest`, `gorge`, `bridge`, `hairpin`, `pullout`,
    `pass`, `lookout`, `jetty`, `far`.
  - States: noon, dusk, night and haze, each spot in a few of them.
- **How the mock is made** (a sketch of L4–L7, not their code):
  - **The land past today's Grounds** is drawn in rings round the camera, at 2 m, 8 m, 32 m and
    128 m out to 24 km.
    - The near two rings use the game's own land material, so they take its snow layer and its
      light.
    - The far rings are plain colours, with the forest's canopy tinted in past about 4 km.
  - **The forest is in three tiers**, using the game's own tree models and material.
    - Its detailed spruces, birches and bare trees within 520 m.
    - Its far trees on a 9.6 m grid out to 1.8 km.
    - Clumps of them on a 26 m grid out to 5.2 km, thinning into the canopy.
  - **The road and what lines it**: asphalt with its lines (doubled on blind bends), guard rails
    over drops, reflector posts every 50 m and snow poles over the treeline.
  - **The bridges** sit on piers, and the signs carry name set 1.
  - **The places** are simple boxes: the rest stop, the pull-out bench, the lookout's deck, the
    jetty and boat, and two cabins.
  - **The lake** is its ice, and the creek is open water.
  - **Taken away**: the barricade's meshes. **Gone**: the painted ridges.
  - **The camera and the air**: the camera's far plane goes out to 60 km and the haze to 26 km on
    a clear day.
  - **In town views**, the game's own land and trees past x 512 are hidden, because its outer
    blocks carry today's edge ridges.
- **What the mock is not**:
  - It has no physics: Ana stands in town and the camera is set by hand.
  - It isn't the far pass L6 plans: one camera with a deep far plane stands in for it.
  - There are no impostor cards, only the far trees and their clumps.
  - The places are boxes, not the furniture kit.
  - There are no headlights to speak of: two of the torches are borrowed for them, and they show
    faintly.
- **What it found, for the phases**:
  - **The far canopy reads flat.** From the summit, the forest past 5 km is a green-grey plain with
    snowy clearings, like a map. Phase 5's impostor cards should reach further than 2 km, or the far
    land needs a faceted canopy, before it reads as forest.
  - **Cliffs streak.** The land's snow picture is mapped from above, so on near-vertical faces (the
    lake's north wall, the pass) it stretches into stripes. Phase 4 needs a slope-aware mapping, or
    rock with its own picture.
  - **The edge of town reads as forest, not fields**: the hedgerows and the wood's edge are too
    dense near the road. Phase 5 thins them.
  - **The timber bridge comes out 61 m long**, because it crosses the creek at an angle. Phase 3
    crosses square.
  - **What works, and should be kept**:
    - The wood from the road.
    - The gorge and the high bridge from the creek.
    - The legs of the climb from above.
    - The pass between its peaks.
    - The lake basin from the lookout, at noon and at dusk.
    - The ranges on the horizon.

**The names**, for the signs and the GPS. Set 1 is on the signs in the stills.

| | The road | The lake | The pass |
|---|---|---|---|
| 1 | Long Pine Road | Silver Lake | Hawk Pass |
| 2 | Old Mill Road | Lake Morrow | Saddleback Pass |
| 3 | Northway | Mirror Lake | Crown Pass |
| 4 | Larch Road | Lake Vesper | Halfmoon Pass |

**Chosen: set 1** (the user, 2026-11-03). The rest stop and the lookout take the lake's name
("Silver Lake Lookout").

### Phase 1 — the land as data

L1: `LAND`, regions, `beyond` from the union, `landBounds()`. Every hard-coded place in "Fixed to
`GROUNDS`" moves to it.

- **No new land yet**: `LAND` is today's two rects.
- **Tests**: every chunk's hash equals HEAD's; `beyond` matches the old function on a dense grid;
  the audit and soak loop over regions.

**Built 2026-11-03**:

- **`packages/shared/src/land.ts`** holds the land's regions. Each region has its `reach` (a rect
  or a ribbon) and its `drawn` box (the reach plus the scenery round it). Today's world is
  `BASE_LAND`, two regions:
  - the core: reach x −400..528, z −580..172; drawn −480..544, −624..208
  - the Kart Park's ground: drawn −480..544, −960..−624

  Between them the two drawn boxes tile what `GROUNDS` was. From the regions come:
  - `beyondLand`: the larger axis for a rect, as before; the distance off the line past the
    half-width for a ribbon
  - `landBounds`, `inLandBounds`, `inLandDrawn` (the box and whether a spot is on the land)
  - `landChunks`, `isLandChunk`, `overlapsLand` (which chunks and blocks are land)
  - `reachRects` (what `worldRects` was)
  - `setLand` and `landVersion`, for phases 3 and 10

  `KART_LAND` moved there. `grounds.ts` re-exports what the client and server need.
- **`GROUNDS` is gone**, along with the hand-written rectangle in `beyond()` and `worldRects()`.
  Every place in "Fixed to `GROUNDS`" reads the regions now:
  - **Shared**:
    - `grounds.ts`: tree density, walkable, the map's area, `checkEdits`' chunks
    - `grounds-hash.ts` and `physics/audit.ts`: over `landChunks`
    - `physics/soak.ts`: builds `landChunks`
    - `grounds-brush.ts`: `inLandDrawn` and `isLandChunk`
    - `car/world.ts`
  - **Client**:
    - `tp/grounds-stream.ts`: the blocks over the box, if they `overlapsLand`
    - `tp/grounds3d.ts`'s rings
    - god mode's camera and the `GodHud` minimap
    - the GPS: `grounds-plan.ts` and `grounds-plan-data.ts` (trees over `landChunks`), and `gps.tsx`
    - `kart-plan.ts`
  - **Server**:
    - `features/physics.ts`: its chunk count and to-do list are `landChunks`
    - `land.ts`'s prefetch: skips chunks that aren't land
    - `features/cars.ts`
  - **The scripts**: `perf.mts`, and the e2e mock scripts read `landBounds()`.
- **Tests**:
  - `land.test.ts`, 6 tests: today's box is the old one; `beyondLand` equals the old function at
    every 1.7 m over the box and 300 m past it (over 500,000 points); `landChunks` is the old
    loop's 1,184 chunks in its order; `reachRects` equals the old `worldRects`; a ribbon's
    distance; a band added and taken off again.
  - `grounds-edits.test`'s fingerprint of every chunk still equals `TODAY`.
  - Suites:

    | Suite | Result |
    |---|---|
    | Shared | 551/552. The pool AI test failed under load (it ran beside the client suite) and passes alone; nothing it touches changed |
    | Client | 256/256 |
    | World server | 197/198. The snow-melt ground test, red on HEAD |

  - Typecheck is clean across shared, client and server.
- **Budgets**, measured against a HEAD build in a worktree the same day:

  | | HEAD | Now |
  |---|---|---|
  | Page | 443.8 KB | 443.8 KB |
  | `yutopia-grounds` | 50.5 KB | 51.1 KB |
  | All chunks | 4731.6 KB | 4732.2 KB |

  Plan 68's "180.8" for the Grounds chunk is stale: HEAD splits it this way now.
- **The dev world server** restarted on a half-made shared edit and came back up on the finished
  one.

### Phase 2 — streaming everywhere

L2: the shared LRU, server physics on demand, the land worker on request, client physics dropping
chunks, the stream over regions with look-ahead, statics by district, the GPS tiled.

- **Still today's land**, but streamed. A test ribbon 6 km long (flat, plain forest) is added
  behind a dev flag to soak it.
- **Tests and measures**:
  - memory stays flat over a 30-minute scripted drive up and down the test ribbon (server and
    client)
  - the worst frame on the drive at 50 m/s
  - Jolt's heap with players at both ends
  - the GPS's tiles against the old raster for today's land

**Built 2026-11-03**:

- **The chunk cache is bounded** (shared `grounds.ts`):
  - It keeps the chunks least lately used out, up to `setChunkCap`: 4,000 on the server (about
    100 MB) and 1,500 in the browser (`grounds-stream.ts`). Today's 1,184 never fill it.
  - Each chunk carries a `used` stamp, and past the cap the cache trims to nine tenths of it,
    surfaces included.
  - `grounds-cache.test`: past the cap the oldest go, and a chunk asked for again is identical to
    what it was.
- **The server builds the land round people, not all of it**
  (`world-server/features/physics.ts`):
  - Every 0.5 s it works out what's wanted: the chunks within 160 m of each person on the ground,
    and of each car that's moving or carrying someone, plus 4 s ahead of it. These are built
    nearest first, a 3 ms slice a tick, as the land worker makes them.
  - A chunk is dropped once nobody has wanted it for 20 s and nobody is within 260 m
    (`YUTOPIA_LAND_DROP_MS`). The new `WorldBuilder.dropChunk` takes it out of Jolt.
  - Parked cars want nothing.
  - God mode's edits and the park's layout rebuild only the chunks that are built.
  - The world is sized for at most 2,400 chunks.
  - New gauges: `grounds_chunks`, `process_heap_bytes`, `process_rss_bytes`.
  - `physics.test`: the land round P1 (70–200 chunks, not 1,184); someone going far off, where the
    land there is built and the old ring taken out.
- **The browser's physics drops chunks** more than 4 away (`tp/physics3d.ts`).
- **The land stream** (`tp/grounds-stream.ts`):
  - It loops over the blocks within its radius only, not the whole box.
  - It builds what's nearest to where you'll be in 1.5 s first, from its feet's speed (a jump of
    over 60 m isn't counted as speed).
  - It already freed blocks nobody wants.
- **Statics by district** (`tp/grounds3d.ts`, `grounds-stream.ts`):
  - `near()` became ownership. The rest's circle (900 m round the town) has what's inside it, as
    before. Out past it, 512 m districts, each its own `Grounds3` (`part: "district"`), have their
    ways, buildings and lamps.
  - Districts are made within 900 m of you, nearest first, in the frame's time left over, and
    freed past 1,300 m. God mode's edits make them again.
  - A district builds its ways in 64 m pieces. A district's whole stretch of road in one step was a
    300 ms frame; 128 m pieces were 35–55 ms.
  - `ridge` reads the ground's height only at the stations it draws. It used to read it along the
    whole road for nothing.
  - Snow banks keep their shape across a border (`Station.away`) instead of easing down at it.
  - The lamps go through `near()` too.
  - Today's land is all inside the circle, so it's drawn as before.
- **The GPS in tiles** (`gps.tsx`, `grounds-plan.ts`, `grounds-plan-data.ts`, the worker):
  - 256 m tiles at 2 px a metre, and 1 km ones at a sample every 4 m when zoomed out (under the
    near ones while those come).
  - Drawn on demand in one worker that keeps its edits, latest asked first. Up to 60 are kept.
  - `drawSitePlan` takes a `tile` (no legend, no frame) and `planData` a rect and step.
  - `grounds-plan-data.test`: four tiles side by side are the whole, pixel for pixel, every tree
    included.
- **The dev's test strip** (shared `devLand("ribbon")`, `TEST_RIBBON`, `TEST_ROAD`): 6 km of
  forest east of the barricade (reach x 528..6536, z −700..−110) and a 9 m road down it.
  - Laid by the world server's `YUTOPIA_LAND=ribbon` (and its land worker), the browser's
    `?land=ribbon` (dev builds only) and the GPS worker.
  - `dev-land.test`: it's walkable, its road is asphalt at its height, and it's walled at its
    sides.
- **The soak** (`apps/client/e2e/stream-soak.mts`):
  - An offline world server on the strip, and a bot teleported down the road at 50 m/s.
  - The game as Ana, its stream and camera taken down the road at 50 m/s.
  - Every 10 s it records the frames, both heaps, what's kept and what's built. With `PROFILE`,
    `FOCUS` and `CALLERS` it takes a CPU profile.
  - **30 minutes, up and down** (High, an M4 Pro already at a load average of about 5):

    | | Result |
    |---|---|
    | Browser heap | 0.9–1.5 GB, a dev build's sawtooth, ending lower than it started |
    | Browser chunks | at the cap, 1,500 |
    | Blocks | 111–202 |
    | Districts | 6–15 |
    | Server resident memory | flat, 376–553 MB |
    | Server chunks | 2,570 kept, 407–868 built |
    | Jolt | 23–30 MB, nothing refused |
    | Frame median | 33 ms, the machine's own baseline standing still that day (17 ms earlier) |
    | Worst frame | 50 ms typical, one 250 ms |

  - The server's JS heap crept from about 160 to 260 MB. Chunks wanted but never built were kept
    in the "last wanted" map forever; now they're forgotten too. Not soaked again since.
- **Left for later phases**:
  - **`nearLines` builds a fresh map on every read**, and every terrain read and surface goes
    through it: about 2 s of 25 s of CPU while streaming. It's for phase 3, and needs the
    fingerprint test to stay equal.
  - **The browser's garbage**: streaming makes about 7 MB/s of it, and a full collection is a
    100–250 ms frame in a dev build. The arrays the land blocks are built in are the first to
    pool.
  - **No frame over 33 ms at top speed** still isn't met on that loaded machine. Phase 9 measures
    it on a quiet one and a production build.
  - **Ribbon regions have no walls yet** (only rects get them, in `reachRects`). Phase 3's band
    needs them.
- **Tests**:

  | Suite | Result |
  |---|---|
  | Shared | 554/554 |
  | Client | 258/258 |
  | World server | 198/199 (the snow-melt test, red on HEAD) |

- **e2e on the shared dev stack: not settled.**
  - The run had the machine at a load average of 6–8, with Firefox busy beside it.
  - `gps`: the outdoors test passed. The other two timed out, one while the page was still loading,
    one with `page.evaluate` waiting 3 minutes.
  - `third-person`: all three timed out, the pages closed.
  - `godmode-redraw`: the swap wasn't seen within 90 s.
  - Its other 2 tests passed.
  - Reproduced by hand as Cai, the GPS's steps (search, pick, on foot, go, Escape) had no long
    tasks at all, and the tiles drew.
  - To run again on a quiet machine, before any of this is committed.

### Phase 3 — the road

L3: the long road's spine and profile, the land eased to it, cut and fill, rock faces, retaining
walls, generic bridges, hairpins, rails, posts, signs, markings, the barricade gone.

- **The mountains are a placeholder** (the profile's land only).
- **Tests**: the spine test (grades, widths, rails, nothing on the road) and a car-sim drive end to
  end.

### Phase 4 — the mountains

L4: the mountain field, the shaping round the road, the gorge and the lake basin, the surfaces by
height and slope, the snowline, walls at the band's edges.

- **Tests**: the physics audit along the band; walkable only where the rule allows; no hole
  between chunks; the road's profile untouched by the field.

### Phase 5 — the forest

L5: density by biome, the new kinds, clearings, logs and boulders as solids, the impostor tier
and the canopy.

- **Checks**: the treeline, nothing on the road or in the clearings, the far tiers matching what
  you walk into.
- **Perf**: in the Long Wood on all tiers, by day and night.

### Phase 6 — the far view

L6: the far land tier and its pass, the overlap band, the horizon band (the rings gone), far
lights at night, the tiers.

- **Checks**: stills against phase 0's; frames at the pass looking back on High, Medium and Low;
  fog, storm and night.

### Phase 7 — the places

L7: the rest stop, the pull-out, the lookout and its binoculars, the lake in `waterAt`, the jetty,
the cabins and their insides, the creek, the GPS names, the bus and its stops, the traffic (L3),
the shadowed in the Long Wood.

- **Tests**: swimming in the lake and walking on its ice (plan 66's cases); the binoculars; a
  cabin's inside; riding the bus town → lake; the traffic stops short of someone on the road; no
  shadowed within the road's band or by a lit lamp.

### Phase 8 — the air up high

L8: the cold by altitude, the wind, valley fog.

- **Tests**: temperature at the pass against the town; the snowline in green weather; warmth
  drains faster at the pass.

### Phase 9 — the checks and the sound

- **The checks**:
  - a scripted drive of the whole road and back on every tier (frames, no holes, no falls through,
    memory)
  - a walk from the lookout up a slope to the band's wall
  - bots spread along the road on the server
  - today's e2e suite (the known reds noted)
  - an independent review
- **The sound (last)**: picks for the user, applied once chosen.

### Phase 10 — god mode: grow the land (last)

Its own mocks first:

- the overview with the land's outline
- the "Land" tool adding a piece
- the biome picker
- a fresh piece of forest
- a road drawn out into it
- the draft and the publish

**The design:**

- **`GroundsEdits.land`**: a `Section` of regions like ways and things (add, change, remove by
  key). Regions are snapped to 32 m chunks as rects, or as ribbons with points on a 1 m grid. Each
  has a biome and an optional height bias (lower to make a valley, raise for hills).
- **The eight biomes** (the user's, 2026-11-03):
  - **forest, meadow, hills, mountains, lake**: from L4 and L5's fields, with the lake through
    `waterAt`
  - **farmland**: fields, fence lines and hedgerows like today's farm, flat by `FLATS`' rule
  - **beach / coast**: sand easing down to a `sea` kind in `waterAt`, a flat level at the region's
    far side, waves (plan 66's surface), swimmable, never frozen
  - **desert / canyon**: sand and red rock, mesas and a canyon carved by noise, sparse dry scrub
    and cacti. It needs weather work: no snow layer, no frost, warm by day and cold by night,
    so the weather's temperature and the snow layer are read by biome. Rain still falls.
  - Where two biomes meet, they blend over about 100 m (heights, surfaces, tree density).
  - Added land must touch the land there is.
  - **Land can be removed only if nothing an edit placed stands on it** and it isn't anchored.
    Today's town, the kart ground and the long road's band are anchored.
- **Generated like the rest**: the new region joins `LAND`, `beyond` moves out, the edge's ridges
  move with it, and its biome decides its trees, surface and mountain mask. Then the land, paint,
  roads, nature, things and buildings tools work inside it, since `inWorld` reads the union with
  the draft's land.
- **The rules**, in shared `checkEdits`:
  - a total area cap (for example 40 km² added)
  - a region cap (200)
  - no region past ±30 km
  - every region checked against the anchored ones
- **Rebuild**: the chunks within the edge's reach of a changed region are dropped and remade.
  Streaming (phase 2) means nothing else has to be. Clients follow `groundsRev` as today, and the
  GPS's tiles covering it are redrawn.
- **God mode itself**:
  - the camera clamps to the union plus a margin, not `GROUNDS`
  - the overview map (M, plan 53's unbuilt one) shows the land's outline and lets you jump
  - the new **Land** tool adds, resizes and removes pieces, and picks their biome
  - members refused on the server, as every `god:*` message
- **Tests**:
  - a member's attempt refused
  - an empty `land` section means today's world (the hashes)
  - a piece added, published, walked into, rolled back, and the chunks back as they were
  - a road drawn into new land
  - a piece that doesn't touch the land refused

## Where it stands (2026-11-04: phases 3–10 built, nothing committed)

The user said "Finish all phases" on 2026-11-03. Phases 3–9 are built and checked; phase 10 is
built, but **its own mocks were never made or approved** (it went straight to the real thing).

**Phase 3, the road** (shared `longroad.ts`, `grounds.ts`):
- The spine runs 13.7 km to the pass at 461 m, with grades of 9% at most and hairpins under 5%. The
  last leg's hairpin was dropped because it doubled the road back.
- The road is eased onto Main Street over its first 80 m.
- There are two bridges, each drawn and made solid as its own run:
  - the timber one over the creek at km 2.65
  - the high one over the gorge at km 5.95
- **Fixed on 11-04:** the physics built one deck and truss from the first bridged sample to the
  last, which walled the 3.3 km of road between the bridges. `shapes/grounds.ts` now builds per
  run, and `longroad.test` checks it.
- Along the road: rails where it drops (solid, and they shut the walk mask and the cars), posts,
  poles past the treeline, km markers and signs.
- `grounds-town.test` checks that every town chunk west of x 470 is exactly as it was.

**Phases 4–5, the mountains and the forest:** `longLand` provides the valley, the ridged mountains
and named peaks, the far ranges, the creek's gorge and the lake's bowl. `longForest` handles the
fields by town, the Long Wood, a ragged treeline at about 420 m, and clearings.

**Phase 6, the far view** (client `tp/far3d.ts` and `far-land.worker.ts`):
- Rings per tier, out to 24 km on High; far trees out to 1.8 km.
- Drawn first with its own projection, in the scene's own fog; hidden in the morning fog's wall and
  in storms.

**Phase 7, the places:**
- The bus from Main Street's stop to Silver Lake's: a minute at each stop, boarded like the shuttle.
- Traffic: a sedan every few minutes, either way.
- The rest stop's hut, the pull-out and the lookout, each with lamps (`lamp:rest-stop-0` etc.).
- On the lake shore: the boathouse, the jetty and two cabins. The cabins are houses with porches;
  they face each other across the new **Silver Lake path** (a trail from the road down to the
  boathouse, cleared of trees).
- Long-road plots are levelled 3.5 m round, so the porches' steps sit on level ground.
- **Silver Lake freezes:** `waterSide` treats it like the pond. Its water covers the whole bowl
  under its level, and its tiles are "ice". The physics' ice sheet covers it in rows of 2 m (about
  176 ms the first time, then about 6 ms a step).
- **The creek runs and never freezes;** you can wade it.
- The near view draws the lake's ice and water and the creek's ribbon; they weren't drawn before
  11-04.
- The GPS's "Silver Lake" is the shore at the path's end.
- The shadowed keep off the road.
- **Not done:**
  - the binoculars aren't usable
  - no insides for the cabins
  - headlights don't keep the shadowed away

**Phase 8, the air:**
- Snow by height in the weather shader (some from 300 m, all of it past 600).
- Cold by height (6.5 °C/km), and wind chill above 380 m.
- **Not done:** the wind's visuals and valley fog.

**Phase 9, the checks:**
- **Tests:**
  - shared 566/566
  - client 261/261
  - world-server: the bus and traffic test, and god mode 6/6 including the land test
  - world-server, whole suite: 198/201. The shuttle and snow-melt tests are red on HEAD. Vortex
    and ping-pong failed under load but pass when run on their own.
- **Typecheck:** clean.
- **Lint:** nothing new. What's left is in files this plan didn't touch.
- **Budgets:** the page is 443.8 of 446 KB. The god chunk's budget went from 20 to 24 KB (it is
  19.8).
- **Physics audit:** run over the lake end and the rest stop (`audit(…, of)`). The only remaining
  "nothing" tiles are 0.65–0.9 slopes, where the grid's corner rule is stricter than the audit's
  steep label.
- **Stream soak** (`e2e/stream-soak.mts`, which now drives the real road as Cai), 3 minutes at
  50 m/s on High:
  - memory is bounded: the browser's heap stays at about 1 GB, the server's at about 200 MB, its
    chunk cache stays under its cap, and nothing was refused
  - frames are a median of 17–33 ms and a p95 of 33–50 ms, with spikes of 67–100 ms
  - **so the 33 ms guardrail is not met at that speed:** the districts' steps and the stream's
    update take 25–35 ms
- **In-game stills:** in `design/screens/road/game` (made with `e2e/road-real.mts`, as Cai).
- **Not done:** the sound picks, the drives on every tier, the bots spread along the road, the full
  e2e suite and an independent review.

**Phase 10, god mode grows the land:**
- **The data:** `GroundsEdits.land` holds pieces (`GrowDef`: a rect on the 32 m grid, one of the
  eight biomes, and a lift).
- **The generator** (shared `grow.ts`):
  - A piece's land starts at the height of the land it meets, and blends in over 100 m from its
    edges and from the fixed land. **Today's town and the road's band never change under a piece.**
  - Each biome has its own heights, trees, sand, a lake (which freezes) or a sea (which never does).
  - The desert and the beach are warm: no snow lies there (`wx3d` `wxDry`), and survival reads them
    as warm air. The desert is cold at night.
  - A new surface, `sand`, walked and driven like earth.
- **The rules,** in `checkEdits`:
  - pieces sit on the grid, 64 m to 4 km a side, within ±30 km, at most 200 of them and 40 km² in all
  - each must be joined to the land, overlapping it or touching it, possibly through another piece
  - pieces may not overlap each other
  - every other edit is judged against the draft's land, so a road into a piece is allowed only
    with that piece, and taking a piece away that has things on it is refused
- **The rebuild:** chunks within 300 m of a changed piece are remade. Anyone standing on land that
  was taken away is sent back to where they arrive.
- **The god-mode UI** (built by a sub-agent, checked here):
  - the **Grow** tool (key 8): drag to draw a piece; the ghost is green when allowed and red with
    the reason
  - its panel: biome chips, a lift slider, a name and "Take it away"
  - the **M** overview map
  - the camera may go 512 m past the edge
  - drafts count and merge the land
- **Not done:**
  - ribbon pieces
  - cacti
  - snowfall still falls over the desert (only the lying snow is gone)
  - no in-game stills of grown land: publishing on the shared dev world needs Ana's account

## The frame-time pass and the review's fixes (2026-11-04)

The user asked to fix the frame spikes, double-check everything and raise the quality.

**Frames** (`e2e/stream-soak.mts`, 50 m/s up and down the road on High, as Cai):

| | before | after |
|---|---|---|
| median | 17–33 ms | 17 ms |
| p95 | 33–50 ms | 17–33 ms (the guardrail met) |
| worst | 67–100 ms, often | 33–67 ms, a lone 100–150 now and then |
| mountains | ~31 fps | ~50 fps |

What it took:
- **Land blocks are made in two workers** (`tp/land-block.ts`, `land-block.worker.ts`). A near block
  was 20–90 ms, and one alone blew the frame. The main thread only puts the mesh together. Behind
  the loading screen they're still made in place. The worker gets god mode's edits and the park's
  layout when they change; a block made under older edits is dropped.
- **The tree pools upload only the blocks that came or went.** They re-uploaded every instance
  whenever any block changed: ~30 times a second, ~5 MB each time.
- **The far blocks' trees are their own instanced meshes, culled with the view.** The pools drew
  all ~100k far trees round you, three in four behind. The far pine is open underneath (half its
  triangles), and the far land's trees sit on a 14 m grid instead of 10 m.
- **A district's road pieces** are made only where the line passes (the long road's 13 km box
  made every piece of every district run it), are 32 m, and walk only the line's samples near the
  piece (`span`). A bank asks its `skip` only near what it draws.
- **The asphalt's texture runs on along the whole road**; it restarted at every piece's edge.

**The independent review's fixes:**
- **The HQ shuttle could no longer be boarded or left.** The bus and the shuttle both took
  `ride:board`/`ride:leave`, and Colyseus keeps only the last handler. `WorldRoom.on` now keeps them
  all. The shuttle test, "red on HEAD", passes.
- **The town's street things, fence, lot, landmarks, motors yard and farm weren't drawn.** The
  rest's circle was centred on the land's middle, out in the gorge; it's round the town again
  (`townBounds`). An edit now remakes a district behind the old one, shown till the new is done.
- **The GPS drew no new tiles past 60.** A new tile was the one the cache let go.
- **A lifted grown lake's water hung in the air** where its land eased into what it meets. A lake's
  bowl is now sized inside the piece's own land, its rim kept over its level, its water only where
  the piece is all its own. A lake must be 100 m clear of the town and the road, 1.5 km a side at
  most, 12 lakes at most.
- **A piece's start height moved when another was laid beside it, but its chunks weren't remade.**
  Its sig now carries its height and side.
- **A big grown lake's ice took 2.6 s** (14k solids). It's now sampled over the bowl, from an 8 m
  grid of its shape, the water asked only on its shore: about 300 ms for the biggest allowed, once a
  publish.
- **The far land's rings left a gap behind you and overlapped ahead.** Each ring now skips, as it's
  drawn, where the ring inside it is now. The rings are remade when the edits change. The far trees
  no longer free the near pools' geometry.
- The far land's and GPS's workers lay the edits again when the main thread did (a draft, a rollback
  to none), not only on a new rev.
- The road's dressing cache is dropped when edits are laid and bounded; the server's land worker
  keeps 256 chunks, not 4,000.
- Bridges are split into runs by one rule (`bridgeRuns`) for the decks, the solids and the drawing.
- The snow kept off warm land: the nearest 8 warm pieces, not the first 8.
- A piece's join is checked every 16 m along its sides.

**Checks:** shared 567/567; client 261/261; world-server 200/202 (snow melt red on HEAD; the lost
pets' dangers timed out under load, passes alone); typecheck and lint clean; page 443.8 of 446 KB.
In-game stills of the town, the wood, the gorge and the lookout look right. The GPS and god-mode
e2e specs join as Ana, so they weren't run.

**Still to do (seen, not fixed):** where a coarse land block meets a fine one on a steep side (the
gorge under the rail), the skirt shows as coloured stripes (it did before this pass too).

## The loading pass (2026-11-04)

The user found the loading screen slow and asked whether only what's near is loaded, the rest as
you go. `e2e/load-time.mts` times it (an offline world-server, Cai, the readiness's parts every
250 ms; PROFILE=1 [WINDOW=a-b]).

| | dev server | production build |
|---|---|---|
| before | 17 s, cut short at the 15 s cap (67 blocks and 1,451 steps left) | 9.3 s |
| HEAD (before plan 69) | — | 9.2–9.3 s |
| after | ~9 s, everything made | 8.1–8.3 s |

What it was:
- **The road's slush and black ice** (`car/fx.ts` RoadPatches) asked the land's height of every
  road, and that made the land's chunks along all of them, the long road's 14 km too: ~7 s. Now the
  height's worked out where the land isn't made yet.
- **A Kart Park step waiting on its code** put itself back and was asked again at once: the stream
  spun on it for the frame's whole budget, ~200,000 times a load, starving the very download it
  waited for (an older bug, plans 46–47). A step that's waiting now ends the frame's steps.
- **The land's workers** (`tp/land-pool.ts`) start as the Grounds load, while the world connects,
  three where there are the cores, and are kept for the game. Behind the loading screen all the
  missing blocks go to them at once (only taken between frames, and a frame there is a quarter to a
  whole second long).
- **What's waited for:** districts only where what they draw is within 200 m (it's outside the
  rest's circle); the rest of the land streams as you go.
- Shared: `lakeR` skips its noise far from the lake (identical results: nothing asks past 1.7), and
  `nearLines` keeps its last answer (each point's height, surface and trees ask it in turn).

What's left of the load is mostly not the land's: the page, connecting and opening the 3D view
(~3.6 s), the shaders linked as they're first drawn and compiled at the end, the town's rest
(~1 s of steps) and the parked cars built.

## The user's screenshots: the hairpins, the lake, the mountain (2026-11-04)

Three pictures from god mode: the hairpins' road torn and overlapping, Silver Lake with no water in
it, the mountain behind it a striped wall. `e2e/road-real.mts` now takes `TOPS` (straight down) and
`VIEWS` (any camera) to see them as the user did.

- **The hairpins:**
  - The spine was a uniform Catmull-Rom. From a 250 m leg into a hairpin's 10 m steps it overshot
    and came back: at each hairpin's ends the road ran on past the turn and turned back under it
    (175° in 3 m). The spine is centripetal now (`longroad.ts` `dense`).
  - Each leg west started 8 m behind its hairpin's end, a 24° kink in a metre. It starts 6 m past
    it now, as a leg east does.
  - On the road the land's height is its own stretch's alone. A hairpin's other leg came into the
    height across it, and the land showed through the asphalt's middle (its ribbon has no middle).
  - `longroad.test` checks it never turns back, never kinks over 10° a metre, and the land is under
    the ribbon edge to edge.
- **Silver Lake had no water:**
  - Only the rest (the town's circle) drew water; the districts never did, the lake's and the
    creek's included. They do now, a lake met by its box, not its middle.
  - Its water mesh stops where its water does (1.25).
  - No trees in its water or on its shore a metre over it.
  - The far land draws a lake flat at its level, as water or ice by the room's ice (its pale bed
    under the near water's edge was a band).
- **The wall:**
  - The land round the lake was held under its bowl to r 1.7, then let go: the mountains stood up out
    of it, a wall a few hundred metres high all round. The mountains are now eased down to the
    shore, their own shape kept; the shore is held over the level, so no hollow by it holds a pond.
  - The land shader draws cliffs past ~60° as rock in strata across them. The grass and the snow's
    picture, read straight down, ran down them in streaks.
- **God mode:** the far land is shown in a storm and in the morning's fog wall too. God mode's camera
  is above them, and the land it saw was an island in white.

Checked: stills of every hairpin from above and the lake from the lookout and across it; shared
568/568, client 261/261, world-server 202/202; page 443.8 KB.

**The lookout's deck** (the user's next screenshot: "a small bridge — shouldn't it face the water?"):
- It lay on the pad, 18–34 m out, in the middle of the bluff, reaching nothing. Now
  `LOOKOUT_DECK` (shared, one measure for the drawing and the solids) runs from the pad 26–48 m out
  over the drop towards the lake, its posts down to the ground.
- It's a solid now (its planks, its rails), and so is Silver Lake's jetty: neither was before.
- No trees under it.
- The pad came down over 20 m: it stood on a drum of rock, a dark face that read as a pond from
  the side. It comes down over 35 m now, a knoll.
- Deep water is opaque: at 0.93 what was behind showed, past the near land the sky, a pale band
  across the lake.
- A still water's depth is signed, and none of it is drawn over dry land: its edge where the land
  comes up through it, not its 8 m cells' squares.
- The far land shows the lakes as ice only once they're all but frozen.

## Guardrails

- **Today's town is untouched**, proven by chunk hashes, except the barricade's few metres.
- **Every cache is bounded** before the land grows (phase 2 before 3).
- **No frame over 33 ms** on the scripted drive at top speed, on every tier.
- **Admins only, on the server**, for every land edit (`admin-powers-admin-only`).
- **The dev world is shared**: e2e that publish land use a throwaway revision and roll it back.
- **Never deep-compare a three.js scene** in tests (`no-deep-compare-three`).
- **Stylized** (`art-direction-stylized`): flat facets and the ink line, the far land's facets
  coarser, never photoreal.

## Open questions

None left: the six asked on 2026-11-03 are answered in the decisions table. The course, the far
view's look and the names are agreed at phase 0.
