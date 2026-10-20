# The Grounds — the campus, the woods and the town, all walkable (plan — decided 2026-10-19; phases 0–1 delivered 2026-10-20)

> Follows `25-building-floors.md` and `26-floor-transitions.md` (its "Part 4 —
> the campus you can walk" is folded in here and grown). Workflow rule: mocks
> first (phase 0), approved before any code.

Ask (2026-10-19): "We just added the other floors and the parking lot, but all
around is a fake scenario — remove it and add a real map walkable by the user.
The inspiration was *Ruptura*; this snow, dark, mysterious thing is a must."

## Where we are

Real (tiles, collision, people on it): the five floors of the headquarters,
and on the ground floor the lobby and the parking lot (`groundLevel`, ~108 × 56,
`LEVEL_MAX` 160).

Scenery (`tp/campus.ts`, ~2,000 lines, no tiles, no collision; plus the iso
backdrop painting `art/themes/snow.ts`): the endless snowfield, the driveway
and its gatehouse, the water tower, the two other glass blocks with their
courtyard and the glazed bridge, the tree line and groves, the visitor's
car's route. You see all of it and can walk to none of it.

## The idea — the Grounds

The company's own land, fenced, deep in snowbound woods, with its company
town down the road. **Everything you can see is a place you can walk to.**
The world ends at the fence, the ridges and the frozen river; beyond them only
the sky and far mountain silhouettes (the one painted thing left). No names,
logos or places from the show — the mood, in our own hand.

Site plan (schematic; the numbers are settled at the mock step):

```
 N
 ┌──────────────────────── ridges · fence ─────────────────────────────────────┐
 │ woods     ravine ⌒ footbridge      frozen river ════╦═══ bridge ══╗          │
 │                                                    ║              ║  TOWN    │
 │   frozen pond ◯ boathouse        gatehouse ▣ barrier╝  road ───────╢ square ⊥ │
 │                                       │ driveway (lamps)           ║ main st. │
 │   shed ▪       trails ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤                            ║ row      │
 │                                       │   bus shelter ▭            ║ houses   │
 │   water tower ⊥    lawn               │                            ╚═════     │
 │              LOT ▤▤▤  HQ ■■ courtyard ■■ east block                           │
 │                          ■■ south block                                       │
 │   woods ┄┄ trails ┄┄ a bench under a lamp, nowhere                            │
 └──────────────────────────────── fence ──────────────────────────────────────┘
```

About **1024 × 768 tiles** (a tile ≈ 1 m: a kilometre across). HQ to the town
is ~600 tiles: 2½ minutes on foot, 1½ running — or the shuttle.

| Zone | What's there |
|---|---|
| **HQ + lot** | As today (the lobby, the lot, its cars and lamp posts) |
| **The courtyard + the two other blocks** | Real buildings: the façade you know, collision, doors. Their **ground floors are enterable and blank** — concrete, the curtain wall, a core — for builders to furnish. Upper floors not reachable yet (the stairs' door locked). The glazed bridge drawn from outside |
| **The lawn + the water tower** | Rolling snow to the tower's fenced base; the red light blinks at night |
| **The driveway** | Winding through pine and birch, a lamp post every ~30 tiles, to the **gatehouse**: a lit booth, the barrier, the fence running off both ways |
| **The woods** | Packed-snow trails; deep snow off them (slow, footprints); a **frozen pond** with a boathouse and a dock; a **ravine** with a footbridge; a maintenance shed; odd things: a lone bench under a lamp in the middle of nowhere, an empty bus shelter on the road |
| **The road + the river** | Past the gate, the public road crosses the frozen river on a steel bridge |
| **The town** | A company town in the snow: a main street (a bar, a diner, a convenience store, a bookshop), a small **square with the founder's statue**, a row of identical townhouses, a church, a bus stop, a gas station. A few ground floors enterable (the bar, the diner, the shop), the rest locked façades for now |
| **The edge** | Chain-link fence with signs on the company's side; ridges and the river on the town's; beyond, silhouettes |

### The mood (a must)

- **Palette**: the snow a shade darker and bluer than today; overcast by day,
  low sun, long shadows; dusk early.
- **Fog** thickens with distance, and with the weather: **blizzard spells**,
  timed by the server so everyone is in the same storm (visibility down, wind
  up, snow sideways).
- **Night is truly dark** off the lit paths. The lamps, the gatehouse, the
  town's windows and the tower's beacon are the only light. The **phone's
  flashlight** lights your way — a cone others see too, a beam in the fog.
- **Sound**: wind (stronger in the open, hushed in the woods), snow
  crunching (packed vs deep), the lamps' buzz, a crow, a dog far off in the
  town, the river's ice ticking, the shuttle's engine, muffled music from the
  bar's door.
- **Traces**: footprints in deep snow that fill back in over minutes; your
  breath in the cold; snow on your shoulders after a while outside.

## The engineering (the real work)

Today's level is tile strings, flat floors and one JSON blob (`SpaceState.levels`)
synced to everyone. A kilometre of that is ~3 MB of JSON and a 786k-tile
iso bake — it doesn't stretch. So:

### G1 — The Grounds: an outdoor level made from code

- **Level 0 becomes the Grounds**: the whole outdoors *plus* every ground floor
  on it (HQ's lobby, the blocks', the town's). Floors 1–4 of HQ stay as they are.
- **Generated, not stored**: shared `grounds/` builds it deterministically from
  a version number and a seed — the **heightfield** (rolls, drifts, the
  ravine, the river bed), the **surface map** (snow, deep snow, packed path,
  asphalt, ice, water = blocks), the **footprints** of the buildings, the
  **trees and rocks** (solid trunks, not objects), the landmarks. The server
  and both views build the same thing; nothing of it goes over the wire.
- **Chunks** of 32 × 32 tiles (32 × 24 of them), built on demand and cached.
- **What's stored** stays what builders change: the hand-made rooms (HQ's
  lobby, the blocks' and the town's ground floors) as sparse per-chunk wall
  and tile overrides, and the things (cars, lamp posts, benches, furniture)
  as objects with `level: 0`. The synced state carries the Grounds' version
  and the overrides, not the tiles.
- **Coordinates**: the Grounds' origin moves (from today's `GROUND_OFFSET`
  −60, −10 to wherever HQ sits in the site plan); a stored world is migrated
  once (the ground floor's things and rooms shifted), as `upgradeCore` did.

### G2 — Moving on it

- `Grid` per chunk; `groundAt` reads the heightfield, so walking up a slope
  raises you smoothly; jumps land on it.
- The server's move check: a **slope cap** outdoors instead of the step cap
  (the step cap stays indoors and on things); deep snow slows (×0.6), ice
  slides a little.
- A*: bounded (a click walks to within ~120 tiles; further, a straight line
  that re-plans), with a coarse chunk graph for "walk to someone" across the map.
- Hearing outdoors: open, a bigger radius, and the wind masks it a little in
  a blizzard; walls and buildings still block.
- Interest: the server sends everyone's position as now (≤ 50 people); NPCs
  and moving things far from anyone sleep.

### G3 — Drawing it

- **3D**: terrain mesh per chunk with two levels of detail; **instanced
  trees** (thousands: pine, birch, bare), rocks, fence posts; chunks within
  the fog built ahead off the frame (the Part 1 rule: no frame over 50 ms);
  `campus.ts` is rewritten to draw *from the shared Grounds* instead of its
  own numbers — the blocks, tower, driveway and gatehouse become the real
  ones; the far ring is only ridge silhouettes and sky. The building-height
  rebase (`GROUND = −14`) goes: the Grounds is the world's zero.
- **Iso**: the Grounds drawn in baked chunks around the camera, streamed in
  as you walk (prewarmed ahead of your direction), evicted behind; the
  backdrop painting goes. A **minimap / map** of the Grounds (on the phone's
  Maps app — "Store and Maps later" in plan 21 — and as an overlay).
- **Night**: the flashlight as a spot light following the phone (others'
  beams drawn as cones + a pool, capped); the lamps' pools as today.
- **Budget**: the world page is at 548.9 / 550 KB. The Grounds' generator and
  art go in a lazy chunk; the page itself must not grow.

### G4 — The other buildings, enterable

- Each block and town building is a **footprint + façade style + doors**,
  defined with the Grounds. Its ground floor is part of level 0 (rooms drawn
  inside the footprint, walls stored as overrides when builders change them).
- HQ's "one building with floors" model stays HQ's; other buildings' upper
  floors come later (their stair door locked — "restricted").
- Façades: the curtain-wall builder from `campus.ts` for the blocks; a new
  small kit for the town (brick, clapboard, shopfronts with lit signs, porches
  with snow on the rails, pitched snowed roofs).

## Phases

| # | Phase | Exit test |
|---|---|---|
| 0 | **Mocks**: the site plan (top-down, the zones and paths to scale), and stills: the driveway at night, the gatehouse, the pond, the woods by flashlight in fog, the courtyard and a blank block's ground floor, the town's main street at dusk, a blizzard on the lawn; one iso still of the lot's edge into the woods | approved images in `design/screens/grounds/` |
| 1 | **The Grounds engine**: generator, chunks, heightfield, surfaces; Grid + server move check on it; both views draw it plain (snow + paths + trees); the ground floor migrated into it | walk from the lobby to the fence and back in both views; no frame > 50 ms while chunks stream; every existing test green |
| 2 | **The fake goes, the campus is real**: `campus.ts` draws from the Grounds; the blocks (enterable ground floors), the bridge, the tower, the driveway, the gatehouse and barrier, the fence | walk into the east block's ground floor, round the tower's fence, up the driveway to the barrier; nothing seen that can't be reached |
| 3 | **The woods**: trails, deep snow, the pond (ice you can walk on, the boathouse), the ravine and footbridge, the shed, the odd things | click-walk a trail to the pond; deep snow slows; footprints |
| 4 | **The road and the town**: the bridge, main street, the square, the townhouses, the enterable bar / diner / shop | walk HQ → town; two people in the bar hear each other, not the street |
| 5 | **The mood**: palette, fog, blizzards (server-timed), real night, the flashlight (both views, seen by others), ambient sound, footprints, breath | two browsers: same storm at the same moment; at night A's beam lights B in the woods |
| 6 | **Life**: the visitor's car server-driven on the real driveway (stops for people, honks); a **shuttle** between HQ and the town you can ride; a night guard walking the fence (says nothing) | ride the shuttle to the town and back with someone |
| 7 | **Checks**: e2e (`grounds.spec`, `town.spec`, `night.spec`), perf on High at the lot, the square and in the woods (≥ 60 fps), Firefox, shots, budget | green; world page ≤ 550 KB |

Phases 3 and 4 are independent once 2 lands.

## Risks

- **Perf in 3D** (thousands of trees, a kilometre of terrain, the town):
  instancing, two LODs, fog that hides the far edge, chunks culled; the town
  is a separate cluster that sleeps when you're far.
- **Iso at this size**: never one bake — chunks only, a cap on chunks kept.
- **The migration** of the stored ground floor into the Grounds' coords.
- **Everything that assumes a flat floor** (pets, the jump, dropped toys,
  the visitor car, click-to-walk's `floorAt`) has to read the heightfield.
- **Scope**: this is the biggest piece of the world so far; phase 1 is
  deliberately invisible-but-walkable so the rest builds on green tests.

## Decided (2026-10-19)

| Topic | Decision |
|---|---|
| Size | **Campus + woods + the town** (about 1 km across) |
| The other blocks | **Enterable**, ground floors blank for builders; upper floors later |
| Who shapes the outdoors | **Terrain, paths and landmarks in code**; the things on it (cars, lamps, benches, furniture) are objects builders move |
| Night | **Truly dark** off the lit paths; the phone's flashlight |

## Still open

- Which town buildings open on day one (proposed: the bar, the diner, the shop).
- The shuttle: a bus everyone rides, or a "go to town" stop-to-stop ride?
- Spawn: still at your desk in the studio (you arrive at work)?

## Phase 0 — delivered for review (2026-10-20)

The mocks are drawn from code meant to stay, so the approved images are what
phase 1 starts from:

- `packages/shared/src/grounds.ts` — **the Grounds, v1**: the bounds (1024 × 832
  tiles, x −480..544, z −624..208), the ways (driveway, county road, Main and
  Church Street, the courtyard walk, five trails) as lines sampled a tile apart
  with their heights and bridged stretches, the river, the ravine, the pond,
  every building (footprint, floors, its door's side, `enter`, its sign), the
  lamps; `terrainAt` / `groundAt` / `groundSurfaceAt` / `treeDensity` /
  `treesIn(chunk)`. Deterministic, no dependencies: the whole land in ~0.2 s,
  44k trees in 0.08 s (node). Nothing of it stored.
- `apps/client/src/world/grounds-plan.ts` — the site plan, drawn from the same
  (the phone's Maps later).
- `apps/client/src/world/tp/grounds3d.ts` — `Grounds3`, the 3D prototype round
  a point: terrain chunks with skirts and two detail levels, roads / trails /
  pavements as ribbons, the plough's banks, ice, the instanced woods (a new
  spruce with drooping ragged tiers and snow on each, birches, bare trees; a
  cheap far pine), the curtain-wall blocks with lit vestibules, the gatehouse
  and barrier, boathouse and dock, shed, bus shelter, the town kit (shopfronts
  with lit windows, awnings and signs, a vacant one boarded up, townhouses with
  porches, the church, the gas station, the hotel), the fence with its signs,
  tower, statue, the bench under its lamp, the road-closed barrier, far ridges.
  Lamps: posts, heads lit at night, glow cards, pools of light.
  `campus.ts` now exports its art helpers (geometry builder, curtain wall,
  cars, road / snow / lot canvases) for it.
- `apps/client/src/world/tp/grounds-shots.ts` + `/dev/grounds?shot=…` — the
  stills: sky and fog by the hour, the nearest twelve lamps lit for real, the
  flashlight (a spot from the hand and its beam in the air), snow falling
  (driven sideways in the blizzard), footprints, the game's own 3D people.
  Overrides while looking: `&hour=night|dusk|day|overcast|blizzard`, `&snow=0`,
  `&people=0`, `&w=&h=`.
- `apps/client/e2e/grounds-shots.mts` — saves them (`node
  --experimental-strip-types e2e/grounds-shots.mts <dir> plan driveway-night …`).

Shots in `design/screens/grounds/`:

| | |
|---|---|
| `01-site-plan` | The whole Grounds to scale: the land shaded, the woods, the ways, the water, the fence, the buildings you walk into ringed in amber |
| `02-driveway-night` | Walking up the driveway through the woods at night: the cobra lamps the only light, snow falling |
| `03-gatehouse-dusk` | The blue hour at the gate: the lit booth, the barrier down, the fence running off into the trees |
| `04-pond-day` | Overcast, across the frozen pond to the boathouse: someone on the ice, someone on the dock |
| `05-woods-flashlight` | The ravine trail at night: the phone's beam the only light, the footbridge somewhere ahead |
| `06-clearing-night` | The clearing: one bench, one lamp, someone sitting there in the middle of the woods |
| `07-courtyard-day` | Between the headquarters and the east block, under the glass bridge: both doors lit, people going in |
| `08-block-inside` | The east block's blank ground floor: concrete, columns, the panels overhead, one chair left behind, someone at the glass |
| `09-town-dusk` | Main Street at dusk: lit shopfronts, parked cars under snow, the road running out to the hills |
| `10-blizzard-lawn` | A blizzard on the lawn: the water tower a ghost, someone leaning into it |
| `11-iso-lot-edge` | The iso angle: the lot's west edge, the lawn, the pond trail going into the woods |

Seen while making them, for phase 1 on:

- **Trails need room**: trees keep 3.2 tiles off a trail's edge and 4.5 off a
  road's, or a spruce's skirt covers the way. The chase camera still meets
  trunks in the woods — it fades them as it fades walls (the stills leave out
  the trees right at the camera to stand for that).
- **People at night** are drawn lit (a Lambert body) so the lamps and the
  flashlight fall on them; the game's unlit, tinted body would glow in the dark.
- **A flashlight casts no shadow** of its holder (their body split the beam).
- **The bloom needs a guard**: one NaN pixel (a degenerate normal somewhere)
  was smeared over the whole frame by the blur at some sizes; a pass now clears
  NaN / Inf before it. Find the NaN's source in phase 1.
- **The iso view** of a place this big wants the fog nearly off (the iso
  camera is far away) and its own, lighter density.
- **The town's yard trees** must keep off the streets and the plaza
  (they did not: fixed in `treeDensity`).

## Phase 1 — the Grounds engine: delivered (2026-10-20)

Phase 0 approved ("Approved — start phase 1"). One change from the plan, on
purpose: **the stored ground floor isn't migrated**. It stays what it is (the
lobby and the lot, 108 × 60 at −60, −10, its things where they were — no API
or layout change, no coordinates moved) and becomes the *built patch* in the
Grounds: past its tiles, and on its empty ones, the land goes on.

- **Shared** (`grounds.ts`, a subpath export `@yutopia/shared/grounds`, never
  in the barrel: the client fetches it once the world starts, chunk marker
  `yutopia-grounds`):
  - `groundsChunk(cx, cz)`: a chunk's land made once, kept — heights on a
    half-tile lattice (the raw terrain), its walkable tiles (trees, lamp posts,
    the bench, the fence but its gate, the tower and the statue, the other
    buildings' footprints, steep rock and the far ridges block; bridges'
    decks walk whatever's under them), its trees. ~7 ms a chunk; all 832 would
    be 4 s and 32 MB (made only where someone goes).
  - `heightAt` (the land, or a bridge's deck: `deckAt`), `landAt`, `slopeAt`,
    `walkableTile`, `missingLand` (a chunk or a neighbour not made yet).
  - `groundsOutdoors(map)`: level 0 of a map with floors gets the Grounds;
    `SITE` (the stored floor's rectangle) is flattened to 0.
- **Shared grid** (`grid.ts`): `setOutdoors(f)` registers who knows the land;
  a `Grid` built for such a floor marks its empty tiles as **land** and asks
  the Grounds about them and about anything past its edges (`ok`, `standOn`,
  `onLand`). Land is ground, never an obstacle: `groundAt` on it is the height
  under your middle (not a slope's uphill corner). `stepHeight` follows the
  ground down as well as up (no hop off every downslope). `findPath` searches
  a box round the two ends outdoors (40 tiles of margin, at most 640², 40 000
  nodes), not the whole grid.
- **Movement**: the client changes floors only on the stairs (outdoors the
  ground itself rises a storey and more); the server's `pos` takes z −30..60
  and lets you up a slope as far as the ground goes; teleports and rescues
  land you on the ground's height; a builder's "Go there" can be on the land
  (no way-finding needed: the land is one place).
- **3D** (`tp/grounds-stream.ts`): the land a quadtree of blocks round you —
  128 tiles a side far off (a sample every 4), 64 nearer (every 2), a 32-tile
  chunk near you (every tile, the walking lattice itself), skirts at the
  seams, ~6 ms of building a frame, nearest first, a chunk's land made a step
  of its own; the trees pools of instances (one draw a kind, ~25 000 of them),
  the near ones again on a layer only the sun's shadow camera sees; **trees
  between the camera and you, and round you, dither away** (as walls fade).
  The rest (the ways and their plough banks, water, the other blocks, the
  bridge, gatehouse, boathouse, shed, the town, fence, lamps, tower, statue,
  the far ridges) is phase 0's `Grounds3` in a stream mode, built a step a
  frame (the longest 27 ms). The campus (`campus.ts`) keeps only the
  headquarters' own skin, drifts and entrance: on the Grounds its painted
  field, driveway, gatehouse, tower, groves, other blocks, bridge, visitor
  and blobs go. Clicks on the land walk there (the ray marched to the ground).
- **Iso** (`art/grounds-iso.ts`, lazy): the land a Pixi mesh a chunk, every
  corner raised by the ground, its top-down picture baked once (surfaces
  blended, hills shaded, grain, roads, trails and their boot prints, the
  trees' shadows); the trees inked sprites sorted with everything else,
  see-through where they cover you; 49 chunks round the camera, a step a frame
  (a chunk's land, then its picture), the furthest dropped past 90. The camera
  rides the ground's height; clicks land where the ground is drawn; the land
  takes the hour's ambient.
- **Checked**: shared 139 (+3 `grounds.test.ts`: out of the lot onto the land,
  up the driveway past a storey's height and through the gate, the fence and
  the ridges hold), world-server 67/68 (the vortex test is a timing flake: it
  passes alone, twice), client 20, typecheck. New e2e `grounds.spec.ts` (3D
  and iso, GPU): out of the lot, across the lawn, into the woods and back,
  then at the west fence (it holds) and the top of the driveway (still the
  ground floor) — **worst frame 17 ms** in both views while the land streams.
  `lighting.spec.ts` (GPU) 4/4. Clicking the land walks there in both views.
- **Build + budget**: world page **550.5 KB** (budget raised to 552 by the user's call: the grid's land,
  A*'s box, the engine's land hooks, ~1.6 KB); the generator is copied into
  several lazy chunks by the bundler (~5 KB gzip each; the marker's total,
  116 KB, counts the dev mock pages too).
- **Not done (phase 2 and on)**: iso draws the land, ways and woods but not
  yet the other buildings, lamps, fence and landmarks (3D does); pets on the
  land in 3D stand at the floor's height (they float or sink on a slope) and
  wander only the stored floor; the minimap is still the stored floor; the
  land has no area names; at night only the lot's lamp posts light for real
  (the Grounds' lamps glow, phase 5 lights them); the e2e suites that swap the
  dev world for a fixture weren't run (they'd overwrite the dev world).

## Phases 2–7 — delivered (2026-10-20)

The user: "finish all phases". What's in, by phase, and what isn't.

### Phase 2 — the campus is real
- **The blocks** (`building.ts` `BLOCKS`, `upgradeGround`): the east and south
  blocks' ground floors are part of the stored ground floor (it grew to 148 × 82,
  a migration on the server); glass with door gaps, the cores' walls, areas;
  blank floors for builders. Their upper floors are the Grounds' boxes.
- **The landmarks** (both views): the water tower and its fence, the driveway
  to the gatehouse and its barrier, the bridge, the fence (it holds; the gate
  is the way out). In iso they're items of their own (`gr_*` kinds registered at
  runtime from `art/grounds-items.ts`, drawn with the Sketch kit) on the land's
  chunks, lifted by the ground; never picked or baked.
- **e2e** `grounds.spec` "the campus": into the east block by its doors, round
  the tower's fence, up the driveway to the barrier (3D and iso).

### Phase 3 — the woods
- Trails, deep snow (slower: `speedAt`), the pond's ice (walkable), the
  boathouse and its dock, the ravine and its footbridge, the shed.
- **Footprints** in the snow and deep snow, everyone's, filling in over four
  minutes (`footprints.ts`, kept by `grounds-life.ts`; iso sprites, 3D instances).
- **e2e** "the woods": the trail to the pond, deep snow slower, prints left.

### Phase 4 — the road and the town
- The county road over the river to the town: Main Street, the square and the
  founder's statue, the church, the gas station, townhouses; the cars parked
  along the kerbs are shared data (`TOWN_CARS`): both views draw them, they block.
- **Inside** the bar, the diner and the market (and the gatehouse): walls with
  a door, their furniture, a private room each (`grounds-<key>`: two at the bar
  hear each other, not the street — `grounds.test.ts`). Walking in, the
  building's outside gives way to its inside (iso cuts it, 3D a doll's house).
- In iso a building between the camera and you goes see-through (as trees do).
- Big drawings (the town's) were a 100–150 ms frame: decoded two at a time,
  drawn to an `ImageBitmap` off the frame and put on the GPU a few a frame
  (`art/textures.ts`).
- **e2e** "the town": out of the gate down the county road, Main Street, a
  parked car is solid, into the bar (3D and iso; worst frame 17 / 33 ms).

### Phase 5 — the mood
- **Truly dark nights**: the land's light by the hour (3D `landLight` on every
  Grounds material: the sun or moon and the sky's fill go, the lamps and
  flashlights stay; iso the land's ambient darker at night). The Grounds' lamps
  light for real in 3D (the point-light pool takes them, reaching 44 tiles out
  on the land) and pool on the snow in iso.
- **The flashlight** (the phone: a pill on its home screen, or F): server-synced
  (`phone:torch`, `Player.torch`); in 3D two spot lights (mine and the nearest
  other's, always there so no shader changes) and a visible beam, brighter in
  snow and fog; in iso a beam drawn on the ground. Whoever stands in a beam or
  a lamp's pool is lit by it (iso `lightAt`, 3D `landTint`).
- **Blizzards, server-timed** (`shared/weather.ts`): about every other hour, 6–14
  minutes, ramped; the server puts the storm in the room's state each second
  (an admin can call one up or send it off: `mod:storm`). 3D: the fog closes in
  white, the snow falls harder and sideways with the wind, a heavy near layer
  comes in; iso: snow across the screen (always, lighter), driven and streaked in
  a storm, a white haze. No snow falls under the Grounds' roofs.
- **Sound** (`grounds-sound.ts`, synthesized): wind (open vs the woods, a roar
  in a storm, muffled indoors), snow crunching (fresh, deep, a packed trail, the
  ice: their own steps), the lamps' buzz under them at night, a crow by day, the
  river's ice ticking, a dog far off in town at night, the bar's music through
  its door, car horns.
- **Breath** in the cold (3D): a puff now and then from everyone on the land.
- Fixed on the way: the land's skirts had zero normals (two-faced) — NaN in the
  light, which at night the bloom spread over the whole frame (black); the bloom
  now never takes a NaN in either.
- **e2e** `night.spec`: two people, a storm called up — both in it at once; at
  night A's beam lights B, beside it still dark.

### Phase 6 — life
- Server-driven (`world-server features/grounds-life.ts`, shared routes
  `VISITOR`, `SHUTTLE`, `GUARD_ROUND`): the **visitor's car** comes in at the
  gate, down the driveway and across the lot into its bay, waits, backs out and
  leaves; the **shuttle** runs the driveway, the county road and Main Street
  between the headquarters' stop and the town square's (25 s at each). Both
  stop for anyone in their way and honk. On at a stop (X), carried in a seat,
  off at the kerb of the next stop (X again at a stop to get off early). A
  **night guard** walks the fence, inside it, and says nothing (seen after dark).
- Drawn in both views (iso: the lot's car and a `gr_bus`, made again when they
  turn or cross a tile and slid between; 3D: models lit as the land); the 3D
  camera keeps out of them as out of walls. Their sound: horns by distance.
- The Grounds' new things compile their shaders before they're drawn
  (`compileAsync` on a layer no camera draws): a town block's first draw was a
  200 ms frame on the ride in.
- **e2e** `town.spec`: two people ride from the headquarters to the town square
  and back (one in 3D, one in iso).

### Phase 7 — checks
- **Unit**: shared 142 (`grounds.test.ts` 5, `weather.test.ts`), world-server 71
  (`grounds-life.test.ts`: a ride from the headquarters to the town square; the
  guard's round; `world.test.ts`: the storm and the flashlight reach everyone),
  client 20; typecheck everywhere; Biome on the touched files.
- **e2e on the GPU** (YUTOPIA_GPU=1): `grounds.spec` 9/9 (the walk out, the
  campus, the woods, the town — 3D and iso — and High's frame rate),
  `night.spec` 1/1, `town.spec` 1/1 (the shuttle there and back: worst frame
  33 ms), `lighting.spec` 5/5 (its lamps-never-pop test caught the Grounds'
  lamps in the lot's pool: they have their own now).
- **Perf on High** (60 Hz display): the lot, the town square and the woods, by
  day and at night with the flashlight on — 59.9–60.2 fps everywhere.
- **Shots**: `design/screens/grounds/built/` (the east block, the pond, Main
  Street and the bar in both views, the beam at night, the square at night, the
  woods by flashlight, a blizzard in both views, the shuttle at the square).
- **Budget**: world page **552.5 KB ≤ 553** (raised from 552 by the user's
  call; the weather, the vehicles' drawing, the footprints, the sound and the
  shuttle's prompts were moved into lazy chunks to get there from 554.9). The lazy
  marker `yutopia-grounds`: 177 KB of 180 (raised from 120: it counts the 3D
  view's chunk whole).
- **Not checked**: Firefox (Playwright's Firefox won't start on this machine:
  "Could not find profile folder"); the e2e suites that swap the dev world for
  a fixture weren't run (they'd overwrite the dev world).
- **Not done**: snow settling on shoulders; breath in iso (3D only); pets and
  the visitor's car on the land in iso stand at the floor's level of detail
  (no pets on the land yet); the vehicles don't block walking (people walk
  through them); the guard is seen after dark only, by each viewer's clock.

### The courtyard's blocks moved (2026-10-20)
On the user's server the studio is 64 × 48: the east block (x 60) stood in its
wall and the south block (y 48) right against its south one. They now stand
clear of a studio up to 64 × 48 across a 12-tile courtyard: the east block at
x 76–100 (24 wide: the ground floor stays within 160 tiles, the API's limit),
the south block at y 60–84. `moveBlocks` (building.ts) takes a stored ground
floor's old blocks away — their floor, glass and cores, never the studio's own
outline — moves what was built in them along, and stamps them again where they
stand now; the world server runs it at start (the dev world: done).
