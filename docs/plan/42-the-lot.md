# The lot — a parking lot that meets its driveway (plan — decided 2026-10-24; delivered 2026-10-24)

> Follows `27-the-grounds.md` (the driveway made real), `28-the-car.md` (the lot's
> cars driven) and `33-the-look.md` (the roads' cover). Workflow rule: mocks first
> (phase 0), approved before the rest.

Ask (2026-10-24): "Today the parking lot has an old design, it does not connect
right with the main road and it's a little weird — analyse and suggest
improvements and changes."

The lot is older than the Grounds. Plan 25 laid it out when the driveway was
scenery in `tp/campus.ts`, "from the lot's corner, curving away". Plan 27 made the
driveway a real way starting at that old corner, `[-48, -9]`. Everything since has
worked round the corner instead of fixing it: the car, the visitor's route, the
shuttle's stop, the roads' cover.

## What's wrong today (measured)

Coordinates are the building's: the studio is x 0..W, z 0..H.

1. **The driveway lands on parked cars.** Its 9-wide mouth (x −52.5..−43.5) meets the
   back-to-back line of the two west columns. Neither aisle (x −38.55, −20.85) is
   there, and seeded cars sit right in the mouth.
2. **There is no real cross aisle.** The bays run to 3 tiles from the north and
   south edges. The only link from the driveway to the aisles is that 3-wide strip;
   the visitor's car (2 wide) threads it for 27 tiles past every car's nose. The two
   aisles are dead ends.
3. **The west column faces nothing.** Its open ends look onto the 3-wide strip at
   x −56..−53, not an aisle.
4. **The lamps stand in bay mouths**, not on islands.
5. **Nothing says "entrance".**
   - A 4-wide concrete strip runs to the doors.
   - There is no pavement or kerb along the building.
   - The visitor's bay is unmarked, and there are no accessible bays, sign or stop line.
6. **It's a rectangle stamped in the snow.**
   - The edge is a painted line plus scattered banks.
   - The driveway stops dead on it, with a strip of land between the two (it ends a
     tile short).
   - Iso has no banks, and its asphalt is bare black beside the snowed-over driveway.
7. **Prod's lot is 12 tiles deeper than the code thinks.**
   - `groundLevel` stamps it to z = H + 12. The user's studio is 64 × 48, so prod's
     asphalt runs to z 60 (checked in the saved prod world).
   - These assume z 48 (`campusLot(36)`): `LOT`, the 3D view, the car sim, the
     server's tow, `lotBanks` and the visitor's bay.
   - Prod's lot is otherwise pristine: the 3,128 asphalt tiles are exactly the
     rectangle. It holds the 16 seeded cars, 8 lamps and 4 cars the user placed
     (`b-car-*`).

## The design (decided 2026-10-24)

The user chose, from the options put to them:

- **The size**: keep it, reorganised.
- **The entrance side**: a pavement and marked bays.
- **The dressing**: the full set, in both views.

One rectangle for every world: **x −56..−10, z −8..60**. It is no longer tied to the
studio's height: 60 fits the largest studio and clears the south block.

West to east (bays 2.8 × 5.6, aisles 7.2 two-way):

| x | What |
|---|---|
| −56 .. −49.8 | **The plough's dump**: heaps, soft for cars, open where the pond trail goes out (z ≈ 22) |
| −49.8 .. −44.2 | Row W, nosed west to its kerb |
| −44.2 .. −37.0 | **Aisle W** (middle −40.6): **the driveway lands on it** |
| −37.0 .. −25.8 | A back-to-back pair of rows (the line between them at −31.4) |
| −25.8 .. −18.6 | **Aisle E** (middle −22.2) |
| −18.6 .. −13.0 | Row E, nosed east to the pavement |
| −13 .. −10 | **The pavement**: kerbed, joining the doors' path |

- **Cross aisles** (7.2) at both ends make the aisles a loop. The north one is the
  mouth's T.
- **The driveway** ends flush on the lot's north edge at aisle W's middle (shared
  `LOT_MOUTH`). It opens into a bellmouth: 17 wide at the lot, 9 after 8 tiles
  (`Way.flare`).
- **Islands**: kerbed, snow on them. They cap every row and break the pair and row E
  in the middle. The **8 lamps** stand on them, their arms over the aisles.
- **The marked bays** are either side of row E's middle island, by the doors in every
  studio. North: the accessible pair (blue, a hatched strip between them). South:
  three **VISITOR** bays.
- **The geometry** never moves with the studio; the doors only pick which visitors'
  bay the visitor's car takes.
- **64 bays** for the 16 seeded cars, which never take a marked bay.
- **At the mouth**: a stop line on the way out, and the lot's sign.
- **The visitor's car** loops, keeping right, with no reversing up an aisle:
  1. In along the north cross aisle and down aisle E.
  2. Into its bay.
  3. Out south along aisle E, the south cross aisle, up aisle W and away.

## Phases

| # | Phase | Exit |
|---|---|---|
| 0 | **Mocks**: the shared layout (`lot.ts`), the driveway moved, stills of the new lot | the user approves `design/screens/lot/` |
| 1 | **The lot for real**, part 1: `groundLevel` stamps the new lot. `upgradeLot` migrates a stored one: tiles, pavement, lamps moved, `car-N` into its seeded bay, other cars in the rect re-parked, driven cars left alone. |  |
| 1 | **The lot for real**, part 2: `LOT`/`lotBanks`/`campusLot` go to `lot.ts`. The car sim's solids (lamps, island kerbs, dump), the server's park and tow, and the visitor's loop come from it. | Unit tests green; the dev world migrated once |
| 2 | **The dressing in the game**: 3D, the stills' kerbs, islands, pavement, snow, sign and worn cover drawn in the game too. Iso: the stripes from the layout, the roads' cover on the asphalt, `gr_*` items for the kerbs, islands, heaps and sign. Then the site plan and GPS, and the stills' and sandbox's aisle points. | Look-shots and iso-shots of the lot reviewed |
| 3 | **Checks**: e2e on the GPU, prod's world offline (`tools/prod-world.mjs`), budget | All green |

## Phase 0 — delivered for review (2026-10-24)

- **`packages/shared/src/lot.ts`** (new, subpath `@yutopia/shared/lot`) is the whole
  layout:
  - `lotLayout(entranceZ)`: rows, aisles, cross aisles, bays with their kind,
    islands, hatches, lamps with their facing, the dump, the pavement, the mouth, the
    stop line, the sign, the seeded cars and the visitor's bay.
  - `lotStripes(layout)` and `lotBanksOf(layout)`: the paint and the plough's banks,
    from the layout.
  - The game still uses `building.ts` `campusLot` until phase 1.
- **`lot.test.ts`**:
  - Every bay is driven to from the mouth by a car-sized disc, all other bays shut.
  - No lamp is off an island or in a bay or aisle.
  - No bay overlaps another, the dump, the pavement, an island or an aisle.
  - No bank is on the asphalt or in the mouth.
  - Cars are only in plain bays.
  - The driveway lands flush on aisle W.
  - The doors pick the visitor's bay and nothing else.
- **The driveway** (shared `grounds.ts`): its first point is `LOT_MOUTH`, with the
  bellmouth flare. The old lot's north bank gap follows it, so the game's lot stays
  drivable until phase 1.
- **3D** (`tp/lot3d.ts`, new; `grounds3d.ts` `lot()` draws it in the stills; the game
  keeps today's lot, `lotGame()`):
  - The asphalt's paint and its tyre tracks round the loop.
  - Accessible blue with its figure, the hatching, the VISITOR stencils, the stop line.
  - Kerbs; islands with snow mounds.
  - The pavement; the windrows; the dump's heaps; snow in the empty bays.
  - The sign.
  - `lotCover(m, lot)` (roads3d.ts) wears it like the driveway (base 0.3, the aisles
    and the tyre tracks thinner, the paint showing through).
- **Stills**: `/dev/grounds?shot=lot-plan` (today and proposed side by side, with the
  visitor's way in and out) and `lot-top`, `lot-mouth`, `lot-doors`, `lot-aisle`,
  `lot-dump`, `lot-night`, `lot-iso`, saved to `design/screens/lot/`.
- **Seen while making them**:
  - The stills never patch the Grounds' materials (the game's `view.ts` does). So the
    lot's cover drew there as an opaque white sheet; a still now patches it itself.
  - Snow heaps jittered per corner crack into shards (an icosahedron's faces don't
    share corners). `lot3d.ts` `heap` moves corners by position. Roads3d's
    `crossingHeaps` jitters the same way, smaller.
  - The driveway's verge banks end in a square block at the lot's edge (phase 2).
  - `lot-iso` is the 3D view at the iso angle; the Pixi iso's dressing is phase 2.

## Phase 1 — the lot for real: delivered (2026-10-24)

Phase 0 approved ("Approved — start phase 1 of the lot").

- **One source.** `lot.ts` is the lot for everything.
  - The shared index exports it itself. Passed on through `building.ts`, the bundler kept all
    of `building.ts`'s world-making on the page: +6 KB.
  - `building.ts`'s old `campusLot`/`lotStripes` and its copy of `CAR_COLOURS` are gone.
- **A new world** (`groundLevel`): asphalt over the rect, concrete for the pavement, rows down
  to z 60 whatever the studio. The 8 lamp posts sit on the islands, turned so their arms (and
  their light) reach over the aisles. The 16 seeded cars are in their bays.
- **A stored world** (`upgradeLot`, run by the world server after `upgradeGround`, saved like
  the others): an old lot, known by no concrete where the pavement goes, is stamped again in
  place. Rows grow to z 60 if they stop short (a 36-deep studio's lot ended at z 48). The `lot`
  area is 68 deep.
  - The lamp posts move onto the islands.
  - Each `car-i` goes square into `lotLayout().cars[i]`'s bay, keeping its own colour, model,
    tank and wear.
  - Any other car on the lot (the user's own on prod: `b-car-*`) goes into the nearest plain bay
    no seeded car owns.
  - Cars being driven, the ones that live elsewhere, and everything off the lot are left alone.
  - The dev world: `[building] the lot: today's (24 things moved)`, once.
- **The Grounds** (`grounds.ts`): it keeps its own copy of the lot's rect, mouth, pavement edge
  and rows (`LOT`, `LOT_MOUTH`, `LOT_PAVE`, `LOT_ROWS`; `lot.test.ts` checks they agree). The
  Grounds' module is lazy on the client, and one it shared with the page split its chunks.
  - The pavement's surface is `walk`.
  - `visitorRoute(layout)` is the visitor's loop. The server builds it from its own studio's
    doors and drives it at a walk on the lot.
  - `lotBanks` went to its callers (`lotBanksOf` in `lot.ts`).
- **Cars.**
  - The sim's solids: the lot's lamp posts where their objects stand, the islands' kerbs as
    walls, the windrows and the dump's heaps as soft banks.
  - The server parks into `lotLayout()`'s bays. Its tow puts a stranger in a plain bay, never a
    visitors' or accessible one. `mod:cars` puts each seeded car back in its own.
- **Drawing.**
  - The floor (iso and 3D) paints the bays from the layout (`lotStripes`), not from the asphalt's
    bounding box.
  - The game's 3D lot has the stills' dressing: kerbs, islands, the pavement, windrows, the dump,
    the sign, and the worn cover (`lotCover` with the layout). The floor draws the asphalt, cars
    and lamp posts.
  - The sign moved clear of the bellmouth.
  - The site plan draws the rows (the Grounds' copy).
  - The stills', the sandbox's and the e2e specs' lot spots moved onto the new aisles. Old
    G(−30, 20) is a bay in both lots; it's now aisle E's (−22, 20).
- **Checked.**
  - shared 288: `lot.test.ts` 5 and `lot-upgrade.test.ts` 3. The migration is tested from an
    old lot 48 and 60 deep, with a builder's car, one driven and one on the land; it runs
    once.
  - world-server 135, 1 flaky under load: the nests test, 4/4 alone.
  - Types and Biome clean.
  - The game in 3D and iso after the dev world's migration.
- **Budget.** The world page is 558.1 KB (HEAD here: 557.1; budget 557). The lot's code the
  floor paints from is on it. The Grounds' lazy code is 186.3 KB (HEAD: 183.1; budget 186): the
  3D dressing and the dev lot plan. Found on the way:
  - The site plan importing `lot.ts` gave +16 KB.
  - The dev page importing the lot plan on its own gave +61 KB. It now goes through the stills'
    module.
  - The stills importing `light3d` gave +11 KB. The lot's cover in a still now patches itself.
  - The raise is the user's call.
- **Not done here (phases 2–3):**
  - Snow in the game's empty bays (it has to follow the cars).
  - The iso dressing.
  - The driveway's verge banks ending square at the lot.
  - A thin dark line where the driveway's ribbon meets the floor.
  - `campus.ts`'s dead copy of the old lot.
  - The e2e suites on the GPU.
  - Prod's world offline.

## Phase 2 — the dressing in the game: delivered (2026-10-24)

The user raised the budgets: the page to 558.5 KB, the Grounds' lazy code to 187 KB.

- **Iso** (`art/grounds-items.ts`, `art/grounds-iso.ts`, `engine.ts`): the page hands the lot
  in (`lotLayout`, `lotBanksOf`: `lot.ts` is the page's; a lazy chunk importing it would split
  the chunks).
  - **Items**: islands (a concrete kerb round a bed of snow) and the plough's heaps (the
    windrows and the dump, puffed snow) as `gr_island_*` and `gr_heap_*`, and the lot's sign
    (`gr_sign`, dark blue).
  - **The cover**: the lot's snow over the floor's asphalt, as the roads have theirs. It's
    packed snow worn round the aisles' loop and down the tyres' tracks, a mesh laid just over
    the baked floor, under the shadows. The snow is worked out at 5 px a tile (~20 ms, once).
  - **The marks over it**: the accessible bays' blue and wheel, the hatching, and VISITOR along
    each visitors' bay.
  - **Not drawn in iso**: the pavement's and the dump's kerbs. The tiles' edge reads as one.
- **3D**:
  - **Snow in the game's empty bays** (`car/fx.ts BaySnow`, from `tp/lot3d.ts baySnow`): made
    again only when a parked car takes a bay or leaves one, by the cars that draw them.
  - **The driveway's banks** follow the bellmouth's width (`wayHalf`) and ease down over three
    tiles wherever they stop (`snow3d.ts bankAlong`). Every way's banks now end that way, not
    square. The driveway's surface eases down to the lot's over its last two tiles.
  - **The dark line where the lot meets the snow**: the lot's snow cover is a sheet 0.12 over
    the floor. Seen at a slant its edge parted from the floor's and a strip of bare asphalt
    showed. It now reaches 0.4 past the lot's north and south edges; the kerbs cover east and
    west. Found by elimination in the game: not the ink, the shadows, the floor's texture, its
    AO or the land.
  - **`campus.ts`** (a world without floors, the old painted campus) draws its lot from the
    shared layout: bays, cars, banks, lamps, mouth, the visitor's way. Its own five-column copy
    is gone.
- **Checked**:
  - The game in iso and 3D on the dev world; shots in `design/screens/lot/built/`.
  - Client 25 tests, types, Biome.
  - `/dev/shots` renders with no errors.
  - Budget: page 558.2 / 558.5; Grounds' lazy 186.3 / 187; car 20.3 / 120.
- **Left for phase 3**: the e2e suites on the GPU (`car`, `grounds`, `floors`, `lighting`,
  `town`) and prod's world offline (`tools/prod-world.mjs`).

## Phase 3 — checks: delivered (2026-10-24)

- **Prod's world** (the saved `yutopia-world.json.gz`):
  - `upgradeLot` on it, in node, moves 28 things: the 8 lamp posts, the 16 seeded cars and
    the user's 4 own cars.
  - The tiles come to 2,924 asphalt and 204 pavement (the old 3,128).
  - All 20 cars on the lot are each in a bay of their own, square. The user's four are in
    plain bays: three in row E, one in the pair.
  - The visitors' bay is z 28.8, by the doors at z 22–26.
  - A second run: nothing.
  - Then an offline world-server on it (`YUTOPIA_WORLD_FILE`; the dev world untouched) logged
    `[building] the lot: today's (28 things moved)`. The game in 3D and iso showed no errors.
    Shots: `design/screens/lot/built/prod-*`.
- **e2e on the GPU**: car, grounds, floors, lighting, town. `floors.spec` swaps the dev world
  for its fixture, so the dev world was saved first (the API's `WorldSnapshot` export) and put
  back after. All 571 things came back; the only differences are empty props stored as `{}`, not
  `[]`.
- **What they found, fixed**:
  - **The bay snow's first geometry was empty** (no position): a GL error every frame in 3D,
    612 in the lighting test. It's made from the lot from the start now.
  - **A passenger's camera** (a bug since plan 34's vehicles, not the lot's) crashed every frame
    (`spec.body` of the stand-in state it's given). The view never turned 3D for whoever rode
    along. The stand-in carries the car's spec now; `car.spec`'s ride passes.
  - **The iso cover** was worked out in one go as the Grounds came in: a long frame on going
    down to the ground floor in iso. It's built a few ms at a time now.
  - **`floors.spec`'s "a car to jump up on"** read the car's roof from the tiles' tops. Since
    plan 28 a parked car is a box of its own in the grid, so it reads `standOn` now.
- **Green**:
  - car 2/2.
  - grounds 3p ×4, iso ×3, High.
  - lighting 4/4.
  - town 1/1.
  - floors 4/5.
  - client 25; types; Biome; budget page 558.2 / 558.5, Grounds 186.3 / 187, car 20.3 / 120.
- **Red on main as well, not the lot's** (checked against HEAD's client on :3107, three runs
  each):
  - **"The town in iso"** has frames of 50–117 ms walking the county road and Main Street,
    with HEAD's client too.
  - **"The stairs by a click"** lands 0.73 off the landing (allowed 0.7); HEAD's client fails it
    too, timing out.

