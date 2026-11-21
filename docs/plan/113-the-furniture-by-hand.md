# Plan 113 — the furniture inside, by hand, building by building

Asked 2026-11-21, after plan 112:

> A localização dos moveis dentro de cada building ta totalmente errada, vamos um de cada vez para tu arrumar certo
>
> lets plan

The ask: where the furniture sits inside each building is totally wrong. Go one building at a time and get it right.

Status: **planned 2026-11-21; forks decided 2026-11-21 one by one, all recommended: F1a the six furnished buildings,
and the stairs placed by hand in every building with storeys; F2a the bar first, then the diner, the market, the
farmhouse, the barn, the gatehouse; F3a the missing pieces made new. A sign-off on each building before the next.**

**Then the user (2026-11-21): "just go each by each checking the furniture place, adding the new ones, always compare
with real life photos to be sure and make sure there's no out of place. Finish all now, I will check at the end."
Built 2026-11-21 straight through, uncommitted (on top of uncommitted plan 112).**

## What's wrong, from the code

Plan 112 laid each furnished building's first things with `furnishThings` (`structure/spaces.ts`). It turned the old
walk-in's fits into catalog things, and that conversion lost most of what made them a room.

1. **Nothing faces the right way.** A fit is only a box, with no facing. The converter turned each thing along the
   box's long side (0° or 90°, never 180° or 270°). So half the chairs, stools, the sofa and the armchair face a wall
   or their back to the table.
2. **The wrong pieces.**
   - The bar's and the diner's counters are the catalog's kitchen counter, with a sink.
   - The diner's booths are park-style benches.
   - The market's 11 m fridge strip became one fridge in the middle of it.
   - Every "table" is the long dining table.
   - What the catalog has no piece for was dropped: the farmhouse's bed and wardrobe, the barn's stalls and hay.
3. **The stairs stand in the furniture.** The starting staircase (`starterStairs`) was placed without looking at the
   furniture:
   - in the bar over two tables;
   - in the market over the shelves and the till;
   - in the farmhouse over the sofa, the rug and the coffee table;
   - in the barn over the stalls.
4. **The fits were never laid against the real shell.** They were made for plan 110's tile walk-ins, before the
   shells had windows and doors where plan 111 put them. Pieces stand across windows, and the doorway's approach
   isn't kept clear.

The furnished buildings today:

| Building | Kind | Fits | Storeys | Starting stairs |
|---|---|---|---|---|
| bar | bar | counter, back shelf, 8 stools, 4 tables with 8 chairs, jukebox | 2 | over two tables |
| diner | diner | counter, back shelf, 9 stools, 4 booths | 1 | — |
| market | shop | 6 shelves, a till, a fridge strip | 2 | over the shelves and till |
| farmhouse | farmhouse | living room, kitchen, table, bedroom | 2 | over the sofa and rug |
| barn | barn | 4 stalls, 3 hay piles, a workbench | 2 | over the stalls |
| gatehouse | gatehouse | desk, screens, locker | 1 | — |

## The design

### A. A layout written for each building

The converter is replaced by a hand-made layout per building (`structure/furnishings.ts`).

- **Coordinates are the building's own.**
  - `u` runs along its front from the left as you face the door, `v` goes in from the front, and the facing is
    relative to the door.
  - A building moved, turned or restyled in God mode keeps its room. Plan 112's refit moves things by the corner
    only; a layout re-applied from its own coordinates stays right when the door side turns.
- **Each piece** has:
  - its catalog kind;
  - where its middle is;
  - which way it faces: a wall's back to it, toward a table, toward the room, or the door;
  - its look (variant, colours).
- **Per storey.** The stairs are part of the layout, placed where the room has room for them, never by a rule.

### B. Checks every layout passes (a test per building)

- Nothing overlaps (the placement rule, `freeFits`), and nothing stands in a window, a door or the doorway's approach
  (1.2 m in).
- The stairs' landing and their top on the storey above are clear.
- Every seat and every counter is reached from the door. This is checked on the navmesh, as walk-to does.
- Every seat faces its table, counter or the room. Every piece against a wall has its back to the wall.

### C. The way we go: one building at a time

For each building:

1. I write its layout and pass its checks.
2. I take three stills: a plan from straight above (the shell's outside hidden, the walls cut away), and two at eye
   level, from the door and from the far corner.
3. You sign off, or say what moves where.
4. On to the next.

A signed-off layout is laid in the dev world again: the backup restored and the spaces re-laid. Plan 112 isn't pushed
yet, so nothing in prod has the old furniture to replace.

### D. What the catalog hasn't got

Several fits have no catalog piece: the bed, the wardrobe, the diner booth, a bar counter with its back bar, hay, and
stalls. F3 decides whether they are made as new pieces (native furniture, the plan 67/68 way: `furn/fam/*.ts`, a
catalog entry, the Furnish panel's) or filled with the nearest piece there is.

## Forks

| # | Fork | Options | Recommended |
|---|---|---|---|
| F1 | Which buildings | **a** the six furnished ones (bar, diner, market, farmhouse, barn, gatehouse), and the stairs placed by hand in every building with storeys · b every building you walk into furnished (35: houses as homes, each shop by what it sells, the church's pews…) · c the six only, stairs left as they are | **a** |
| F2 | Which first | **a** the bar, then the diner, the market, the farmhouse, the barn, the gatehouse (the most walked into first) · b you pick each next one as we go | **a** |
| F3 | What's missing from the catalog | **a** made as new pieces (bed, wardrobe, diner booth, bar counter and back bar, hay bales, a stall) · b the nearest piece there is (a sofa for a booth, the café counter for the bar…), nothing new | **a** |

## Phases

0. **Decisions.**
1. **The frame**:
   - `structure/furnishings.ts` (layouts in the building's coordinates, laid by `spacesFix` in place of
     `furnishThings`);
   - the checks (B), as a test over every layout;
   - the plan still (an ortho camera over a storey, the outside hidden, the walls cut).
2. **The missing pieces** (F3a), each with stills beside the catalog's.
3. **One building at a time**, in F2's order: layout, checks, stills, your sign-off.
4. **The stairs by hand** in every other building with storeys (F1a): the houses, the shops, the hotel, the hall.
   A table of stills.
5. **Checks**:
   - the shared tests;
   - a walk-in probe over every building (in, round its furniture, up its stairs);
   - the dev world re-laid.

## Guardrails

- The dev world: restore `.claude/backups/snap-before-112.json`, then re-lay (restart yutopia-world). Check other
  sessions first.
- No full e2e unasked.
- Plan 112 is uncommitted underneath this plan.

## Built (2026-11-21)

### Real life first

A research pass wrote `design/furniture-by-hand/refs.md`: real layouts and measures with their sources (bar design
standards, Worcester-built diners and the Aetna Diner's plan, grocery planograms, New England centre-hall farmhouses,
ag-extension barn guides, guard booths). The layouts follow it.

- **The bar**: one straight bar down a side wall, from 3 m in from the glass to the back. Its top is 1.07 m with a
  0.16 overhang and a brass foot rail; the bartender's aisle is 0.95 m and the back bar is 0.6 deep with three
  mirrored bays. Stools are at 0.62 m centres, with 3.4 m clear behind them.
- **The diner**: the counter parallel to the long front, facing the door; booths at right angles to the front windows,
  one per bay, 1.9 m bench back to bench back, with 0.76 × 1.18 tables.
- **The market**: the first 2.5 m in from the door kept clear, the checkout left of the door, gondolas front to back
  with the cashier's view down them, coolers on the back wall.
- **The farmhouse**: a centre hall with its stair straight ahead, and the rooms off it. The double beds are full-size
  (1.37 × 1.91, before the 1958 queen), with a wardrobe in every bedroom (old farmhouses had few closets).
- **The barn**: the drive floor from the big door, box stalls facing it (solid to 1.4, bars to 2.3), small square
  bales 0.36 × 0.46 × 0.91 stacked a layer turned.
- **The gatehouse**: the desk under a side window's sill looking along the road, with no monitors in front of the
  glass.

### The frame (`structure/furnishings.ts`, `furnish-layouts.ts`)

- Layouts are in each building's own frame (`frameOf`: by where its layout's door looks): `u` along the front, `v` in,
  facings in/out/left/right.
  - `toWorld` and `yawOf` turn them with the building.
  - `stairsAt` places a layout's stairs (rot 0 is the stairs' door looking "out").
- `FURNISHED` holds the six furnished buildings: pieces, stairs, and the farmhouse's hall and bedroom walls.
- `STAIRS` holds the 14 houses, six shops, the hall and the hotel: up from the hall along a side wall, or in a back
  corner away from the back door.
- `laySpace` lays them (`layoutFor`) in place of `furnishThings` and `starterStairs`. The farmhouse's inside walls are
  ordinary walls of its storeys.
- **The rules** (`furnishings-check.ts`, in `furnishings.test.ts` over every layout), on a 10 cm raster of each storey
  from the pieces' own solids:
  - nothing through the shell, an inside wall, the ceiling or another piece (by more than 2 cm);
  - nothing in front of a window, unless meant to be (a sink under one, booths and stalls);
  - the doorway clear 1.3 m in;
  - the stairs clear at both ends;
  - every seat and table reached from the door, and every front used (a wardrobe's, a stove's) reached;
  - every seat facing its table or counter, or the room (not a wall).
- `scripts/furnish-plan.mts <key>` lays a building as the server does, lists what breaks the rules and draws its
  storeys as text.

### The new pieces (`fam/town.ts`, shared and client; the Furnish panel's new "Home, shop & farm")

- **Home**:
  - double bed (full size; oak with a patchwork quilt, white iron with chenille, walnut);
  - wardrobe;
  - farmhouse table (1.8 × 0.9, for six).
- **Bar and diner**:
  - table for four (0.76 square: oak, diner Formica on chrome, dark wood pedestal);
  - booth bench and booth table;
  - bar counter (mahogany and brass, the diner's chrome and red, oak);
  - back bar (mirror and bottles, the diner's urns and pie case, oak).
- **Barn**: hay bale (sat on), hay stack, horse stall (boarded round, bars over, a sliding door on its track).
- **Market**: grocery shelves (a double-sided gondola full of goods), checkout (till, belt, sweets rack), produce
  stand.

Each passes the family tests (footprint, floor, 8k triangles, tops and seats at spec), the shape-fits-model test and
the Jolt walk-at test.

### Fixed on the way

- **Every turned staircase drew unturned**: the 3D stairs read a `rot` objects never carry. They read the yaw now
  (`stairs3d.ts`).
- **Teleporting into a town storey was refused**: it waited on that storey's lazy navmesh. A town storey lets you in as
  the land does, and its mesh is asked for at once.
- **From inside, the stairwell showed the sky**: the storey over yours is drawn in play, not in build mode, and a top
  storey's ceiling closes over its stairwell (`view.ts` `floorShown`, `build.ts` ceilings).
- **Loot**: the bar's, diner's, market's, barn's and farmhouse's searches stand before their new counter, checkout,
  bench and kitchen counter. They're searched from the building's ground storey, and the gatehouse's locker spot
  follows its locker.
- **Barns, sheds and boathouses**: board walls inside and old dark boards underfoot.

### Checks

- shared 787/787;
- client 464/466 (the HUD colour test, red on HEAD; the shape test passes after the new pieces);
- world-server near tests;
- stills of every storey: a plan from straight over, from the door, from the far corner — in
  `design/furniture-by-hand/` with `refs.md`.
- The dev world was re-laid from `.claude/backups/snap-before-112.json`.

## Double check (2026-11-21)

A review of plans 112 and 113 as a whole, every finding fixed:

- **The storeys registered from the live structure only.** `viewOf` used to register a town's storeys every time it
  ran, previews of an edit included, so a refused publish could leave its floors in place. Now the world server
  registers them at boot and on every applied change, and the client does it in `applyMapFromState`.
- **A building turned to face another way** gets its space laid again in the new frame (`relay` in `spaces.ts`). Its
  floors keep their numbers, its shell paint is kept, and its stairs and layout are laid again. Each floor records its
  `turn`. A publish that turns a building is refused when anything an admin built is inside (`spaceShrinkWhy`).
- **Shrink checks by footprint.** A thing counts as inside a building only when all of it is inside, measured at its
  solids' corners rather than its middle.
- **No double move.** Furniture toggled in the same publish as a move used to be laid at the new spot and then moved
  again. It is now laid after the moves.
- **Who's inside when a publish lands:**
  - building moved: they move with it;
  - building turned: they are set at its door;
  - building gone: back where they arrive.

  Coming back into a town storey is allowed, as a teleport there is.
- **Admins only, everywhere.** Room paint (the room's floor), office furnishing, the dressing take/hide, and undo/redo
  now all refuse members on town floors. Nobody's undo can bring back a town storey's old place: a step's floor list
  keeps the town's floors as they are now.
- **The street and a ground storey are one place** for shots, the shades, the Daybreak's burst and who hears a shot,
  with heights converted between the two floors. The street lamps also light from a ground storey. For hearing, each
  ear's rooms are its own floor's, so a private room in a ground storey stays private.
- **The floor picker on a town storey** goes to that storey's stairs landing (town storeys have no spawn). `goInside`
  keeps to the ground storey's plot, which fixes the church's tower porch.
- **One furniture rule** (`furnitureOf`): pieces placed by hand if the layout has them; otherwise plan 112's fits
  while the building is furnished; otherwise nothing. It's used wherever a space is laid, laid again or furnished.
- **The checker:**
  - the stairs are an obstacle: their footprint on the storey they climb from, and the stairwell on the storey they
    reach;
  - inside walls are as thick as they're built;
  - a seat's table is the one whose edge is nearest.

  It caught the farmhouse's beds 5 cm into the hall wall; they were moved back 10 cm.
- **The stairwell's sign and lamp** sit at its own half landing (its rise, not the HQ's storey).
- **The API** accepts a pet placed on any floor up to 255.
- **The page froze, then crashed, at the rest hut.** The rest hut stands off the whole tiles out on the long road
  (x0 = 4173.147…). The fog's flood fill of "the room I'm in" indexed its seen-cells array with fractional numbers, and
  a typed array ignores those, so the fill never ended. Two fixes:
  - `viewOf` gives each floor map the whole tiles over its plot (the stored floor stays exact, so moves still read
    true);
  - `roomBounds` works in whole tiles whatever it's given.

  Both are tested.
- **A town building's stairs couldn't be climbed on foot.** Their solid treads (`shapes/index.ts`) were built up the
  HQ's storey (3.5 m) whatever the floor, so the bar's top tread stopped 0.7 m under its upstairs (4.2 m). You walked
  up, stood under the slab, and never got there. A staircase's treads now rise to the floor over its own
  (`stairsOwn`, from `riseOf`), and a test holds the bar's to 4.2 m. The drawn treads and ramps already did. In the
  game, by path and by a click on either flight, the bar was climbed and come down again. The walk-to (the server's
  navmesh) keeps to one floor, as it does in the HQ.
- **A tree's crown through the church's nave.** A bare tree 8 m out, drawn at 1.7× and leant, reached 1.5 m inside the
  north wall. It showed whenever the outside is cut away (build mode, the stills). Now a tree near a building is grown
  no bigger than keeps its crown 30 cm off the wall (`CROWN_REACH`, measured off the life look's models as drawn:
  pine 6.3, birch 7.6, bare 9.4 per unit of scale), checked from a wider building index (13 m). It's the same trees,
  only smaller by walls; the town's fingerprints changed in trees and trunks only. A test holds every building to it.

### Checks (double check)

- **Suites:**
  - shared 791/791;
  - client 466/467 (the HUD colour test, red since before plan 112);
  - world server: spaces, world, godmode, survival and physics pass. Rooms is 62/65 in one run: slot cars, ping-pong
    and the phone pass alone but fail in the full file under load (different ones each run). Not compared with
    HEAD.
- **Type-checks** are clean in all three packages. Lint is clean on every file touched.
- **Page budget**: 494.3 of 495 KB.
- **On foot** (`e2e/zz-walk-insides.mts`), all 16 buildings: in at the door from the street, up the stairs and down
  again (12 with storeys), sat on a seat of its own (the bar, diner, farmhouse, barn, gatehouse), out to the street.
- **Stills of every storey** are in `design/furniture-by-hand/`: the rest hut, lake boathouse and cabins (never shot
  before), the church, hardware and motors upstairs, and the six again.
- **The dev world** was re-laid from `.claude/backups/snap-before-112.json`; the world server laid all 35 spaces.


## Second double check (2026-11-21)

Three fresh reviews (shared, world server, client) read the code with no notes of mine. Each finding was checked in
the code or reproduced, then fixed with a test where one fits. The walk-through also ran over the 19 buildings not
walked before.

**Getting in**
- **The church and the lake boathouse couldn't be walked into.** The server's way in took the church's tower door,
  2.7 m out in front, as the doorstep, so its "just inside" was the porch (land). The doorstep is now where the door's
  line crosses the building's own edge. Each leg of the way also gets its ground height at both ends; without one, the
  boathouse's buried jetty caught it. A server test walks into both.

**Admins only, really**
- **A member could furnish any town building through the land's floor.** A thing on floor 0 inside a building's plot
  stood in the room. Now it's refused for everyone (`townPlotWhy`), in `obj:put` and `obj:batch` alike.
- **`desk:assign` had no town check.** A member could make a laid piece their desk. Now refused.
- **Locked rooms in town storeys could be teleported into**, because the lazy navmesh shortcut skipped the way check.
  The shortcut now applies only on storeys with no locked door.

**Publishes and rollbacks**
- **The publish check only saw buildings the draft named.** A dropped entry, or a rollback, wasn't checked at all.
  Now every live building is checked against what it would be (`buildingsFor`), on publish and on rollback.
- **A new God mode building could inherit a removed one's inside.** Its key was reused. Two fixes:
  - keys are stamped and never repeat;
  - on the server, an inside that's all away and comes back on a building of another size or door side is set aside
    under a retired key, with its laid walls and floors renamed, and a fresh inside is laid. A put-back (a rollback)
    still gets its own inside back.
- **The publish rule had gaps.** It now checks admins' floors (slabs), rooms and roofs too, not only walls and things,
  and refuses a turn with any of them inside. A wall snapped to the shell no longer blocks growing the building, and a
  storey can't be made lower than a wall built on it. The "only moved" shortcut now also needs its storeys unchanged.
- **A restyle that adds or removes a storey left the stairs wrong.** It now lays the stairs again: up to a new storey,
  none up to a storey it no longer has. Each storey's floor is holed again over its stairs.
- **A storey that was away while its building moved came back from its old place**, its stairwell hole a phantom floor
  outside the house. Each floor now moves by its own offset.
- **A turn wiped the walls of storeys it sent away.** They're kept now.
- **A rename reaches the floor names.**
- **Undo after a publish put an admin's walls back where the building used to be.** Now refused ("a God mode publish
  changed the town since"). It's checked by the revision each step was made on.
- **Turning "Furnished" on or off left stale colliders and nav obstacles.** It now rebuilds the grid. Things are now
  moved before the structure is applied, so a re-attach no longer races the move's save.
- **People inside a moved building** now get its floor's new height too, not only x and y.

**Saving**
- **The API refused anything beyond ±2000 m.** That included the rest hut, the lake boathouse, both cabins, and last
  spots out on the long road. Every position limit is now ±50 km. The spots test was updated (a cabin at 9 km is kept).
- **The boot save of a new layout** goes through `saveStructure`, with its retries.

**Inside**
- **The fallback furniture ("Furnished" on a building with no hand layout)** no longer stands in the stairs. A test
  covers every such building.
- **New walls** can't be taller than their storey's ceiling. From a mezzanine, "up to the ceiling" means this
  storey's.
- **Woods trees** that can't fit by a building even at their smallest are no longer grown. God mode's planted ones
  keep the smallest size. The town's fingerprint is unchanged.

**The client**
- **On a fresh page in a town building, heights were read before the storeys were known.** Mine and other players'
  are now re-derived from the world's heights once the storeys are registered.
- **Painting a shell wall's inside showed the old paint on 104 of 212 walls.** The drawn skin now picks its face by
  the shared `frontNormal`, as the paint tool does. A test covers every shell wall.
- **The HQ's lift landings floated in view from a town storey.** They're now shown as their floor is.
- **Town stairs played fire-door sounds.** They have no fire doors now, and no sounds either.
- **Click-to-climb assumed floor numbers run in sequence.** It now uses `aboveOf`/`belowOf`.
- **"Go in and build" read God mode's draft.** It now leaves God mode first.
- **From a ground storey:**
  - a click on the street walks you out through the door;
  - shades can be aimed at and burned by torches, as the server already allowed.

  Teammates' tags and the dark's eyes stay on level 0, since their floor grid has no land in it.
- **Turned lifts were drawn unturned.** They read a `rot` that objects don't carry. This predates plans 112–113: the
  same bug the stairs had.

**Known, left**
- **Away storeys are never reclaimed.** Each God-mode building put down and taken away keeps its floors, out of the
  world. The pool is 32–255.
- **A publish that's being saved to the API** can race another admin's edit made in that second.
- **The offline test rooms share one registry** of town storeys (one process).

### Checks (second double check)

- **Suites:**
  - shared 798/798;
  - client 467/468 (the HUD colour test, red since before plan 112);
  - world server: spaces (2 tests end to end, the new one covering this pass's server fixes), world, godmode, survival
    and physics all pass.
  - Rooms is 63/65. Its full-file reds (slot cars, the phone; ping-pong on HEAD too) are the same on HEAD (62/65),
    run in a worktree: they predate this work.
- **Type-checks** are clean in all three packages. Lint is clean on every file touched.
- **Page budget**: 494.8 of 495 KB, from a fresh production build.
- **On foot** (`e2e/zz-walk-insides.mts`), all 35 buildings: in from the street at the door and out again; up and down
  the stairs in all 15 with storeys; sat on a seat in the five with seats.

## From the user's look (2026-11-21)

- **Inside, windows and doors were bare holes.** The doll's-house cut (plan 111) hid a walked-in building's whole kit
  model while the eyes were in its plot. A building with a real inside now keeps its model while you're in it (build
  mode still cuts it), so its window frames and door show through the shell's gaps. Its glass gets an inward copy
  ("glass-in", one-sided, back faces), because the glass was drawn for outside only.
- **The top storey's ceiling sits 10 cm under the roof's deck.** A flat roof's vent pipes and AC units stand on the
  deck, and on sloping ground the kit lies a few centimetres lower, so they poked through once the model showed.
- **The gas station's canopy was a hole from below.** Kit boxes had no underside. A box raised off the ground now has
  one: the canopy, its lamps, the signs. A test holds the canopy's underside.
- **The camera** stays inside: backed against a wall, it stands half a metre in front of it.
- **Through a town building's door, the camera ducked and swung down.** The camera keeps out of walls by boxes: a wall
  run's, and the Grounds' box of each building. Both spanned the doorway. Crossing the threshold, the camera stood
  "behind a wall", was pulled 2 m in and tilted about 55° to look over it, then eased back over a second; walking out,
  the building's box did the same. The shell's runs (`FadeGroup.shell`) and the boxes of buildings you walk into
  (`open`) are now left to Jolt's ray, which has the walls with their doors open and only pulls the camera in.
  - Measured in the bar, in and out: no pull and no tilt, the camera's height continuous.
  - Backed against a wall inside (the bar, the diner), or outside against the diner's front, it stops 0.35–0.4 m
    short of the wall.
