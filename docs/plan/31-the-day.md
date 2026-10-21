# The day — the shadowed lie in wait (plan — proposed 2026-10-21)

> Follows `30-the-dark.md`. Workflow rule: mocks first (phase 0), approved
> before any code.

Ask (2026-10-21): "Them spawning and coming at you is great in a blizzard and
at night, but by day it's strange even with fewer; maybe treat the day
differently. They spawn in random places (to vary the surprise), well spread
out, some together, but by day in specific places like the forest, near the
farm — and recommend other places that make sense by day."

## Where we are

- **Night and blizzards**: a director per group of players spends the danger
  on them. They come out of the dark 25–45 tiles off, behind your beam if it
  can (`features/dark.ts`). Good as it is.
- **The day today**: the same director at a lower rate, about 1 a person,
  for anyone off the paths and 40+ tiles from the HQ. They still appear
  round you and walk in, and that's what reads wrong in daylight.
- **There's no farm** on the Grounds. There's the campus, the woods inside
  the fence, the pond and boathouse, the ravine, the water tower, the shed,
  the river, and the town across the bridge (`shared/grounds.ts`).

## The idea

**By day nobody appears near you. They're already out there, waiting.**

1. **When**: at the end of dawn (7:30), the day's shadowed are placed in
   **nests**, and they stay put.
2. **How they're placed**:
   - **Seeded by the day**: everyone sees the same ones. A restart keeps them
     (saved with the loot), and every day is a new layout.
   - **Spread**: nests 40+ tiles apart. Most hold 1–2, some 3–4.
3. **They sleep in place**:
   - Crouched among the trees, in the reeds, under the boathouse's deck, by
     the barn's wall.
   - The shroud is drawn in and barely moving: you can walk up on one
     without seeing it.
   - Cheap for the server: a proximity check twice a second, nothing more.
4. **What wakes them**: the whole nest wakes together (the emerge sting) when
   any of these happens:
   - someone comes within 10 tiles in their sight (5 crouching);
   - a sprint within 14 tiles;
   - a shot within 30;
   - a focused beam on one of them.
5. **On a leash**:
   - Awake, they hunt as at night, but never more than 30 tiles from their
     nest.
   - Lose you past that, and they walk back and sleep again (the shield
     grows back meanwhile).
   - Run, and you get away.
6. **Killed stays killed** for the rest of the day: the nest is cleared.
7. **Dusk** (17:30–20:30): whatever's left of the day's nests wakes and
   leaves them, and they become night hunters. The night director starts
   as now.
8. **Dawn**: all flee, as now. At 7:30, the new day's nests.
9. **A blizzard by day** still brings the night's director, on top of the
   nests.
10. **The day director goes away.** Off the nests, the day is calm.

## Where (by day) — `design/screens/day/01-day-map.png`

| Place | Why it makes sense | Nests |
|---|---|---|
| **The deep woods** (trees ≥ 0.6, off the trails) | where the light doesn't reach the ground | most, scattered |
| **The farm (new)**: barn, silo, house, a dry cornfield in the snow | the surprise between the rows; the barn's dark inside | 2–4 |
| **The ravine** | the icy floor, below the line of sight: you walk the rim, they're under you | 1–2 |
| **The pond**: under the boathouse's deck, the reeds on the far bank | the cold and the reeds | 1–2 |
| **The water tower** | inside its fence, one way in | 0–1 |
| **The grounds shed** | alone in the south woods | 0–1 |
| **Under the bridge** | on the river's ice, beneath the road | 0–1 |
| **The shut shop and behind the church** | the town's dead corner | 0–1 |

**Never**:
- on the trails, roads or streets, or within 6 tiles of one;
- within 60 tiles of the HQ;
- on the campus lawn or the town's streets.

The paths stay the safe way through by day.

### The farm (new, phase 1)

- **Where**: across the river, south of Main Street (x 330–505, z −330 to
  −205), today only woods.
- **How you get there**: a farm lane from the plaza, south.
- **What's there**:
  - a red barn you can walk into (dark inside);
  - a grain silo;
  - the farmhouse (shut);
  - a fenced cornfield of dry stalks poking out of the snow, rows to walk
    between;
  - a tractor under snow (its toolbox is a loot spot);
  - a scarecrow or two (that may not be scarecrows).
- **Loot spots**: the barn, the farmhouse door, the tractor.

## How many

- **Per day**: 14 nests, about 25 shadowed. Plus 2 nests per player who was
  out that day, up to 40 shadowed. *(Yours to tune.)*
- **The server**: each player is sent only those within 70 tiles
  (StateView). Asleep, they cost almost nothing.

## Phases

| # | Phase | Exit test |
|---|---|---|
| 0 | **Mocks**: the day map (done, `01-day-map`); a still of a nest asleep in the woods by day; one waking; the farm (map + still) | approved |
| 1 | **The farm**: the land, the lane, the barn (enterable), silo, house, cornfield, tractor, in both views; loot spots | walk the rows and into the barn in both views; frames on High as the Grounds' spec |
| 2 | **Nests**: shared `dark/nests.ts` (zones, the day's layout seeded by the day, pure and tested); the server places, saves, wakes, leashes, sends home, wakes at dusk; the day director removed | `nests.test.ts`: the same day, the same nests; never on a path or near the HQ; spread. Server tests: wakes on approach, crouching closer; leash; dead stays dead; dusk turns them |
| 3 | **The look and sound**: the sleeping pose (crouched, the shroud drawn in), the waking, the walk home; a low breathing near one asleep | e2e on the GPU: walk into a nest in the woods and it wakes; the shots match the mocks |
| 4 | **Checks**: `pnpm perf` with 40 asleep plus the night; bandwidth; the page budget; PROGRESS | tick ≤ 4 ms; page ≤ 554 KB |

## Yours to decide

1. **The farm**: build it (phase 1), and there (across the river, south of
   Main Street)? Or somewhere else?
2. **How many**: 14 nests, ~25 a day, +2 nests per player out?
3. **Killed stays killed** until the next day?
4. **Dusk**: the day's leftovers wake and join the night?
5. **The town**: lurkers in the shut shop and behind the church, or keep the
   town clean by day?
6. **Something guarded**: should a nest sometimes sit on a small cache (a
   few rounds, a battery), so clearing one pays?

## Decided (2026-10-21)

| Question | The user | So |
|---|---|---|
| 2. How many | "it has to fill it well" | **~30 nests, ~60 shadowed a day**, +3 nests per player out that day, up to 90. Asleep they cost almost nothing; phase 4's perf checks it |
| 3. Killed | "dead respawns after 5 minutes", then "make the day's respawn 10 minutes" | **Each one comes back 10 minutes after it died**, at another spot in its nest's area (not where it fell). Only when nobody's within 40 tiles: never popping up in front of you |
| 4. Dusk | yes | the day's leftovers wake at dusk and join the night |
| 5. The town | "the town with a few scattered around" | **a few nests on the town's outskirts**: behind the buildings, the yards, the church's back, the edge of the woods. Never on the streets or the plaza |
| 6. Caches | "yes, be creative" | **what they were**: see below |
| 1. The farm | asked again, plainer: "build it across the river" | **built (phase 1)** across the river, south of Main Street, a dirt lane from the plaza; barn (enterable), silo, house, cornfield, tractor, scarecrows |

### What they guard (caches)

The shadowed were the company's people. A nest keeps what one of them
carried, lying in the snow among them: you see it from a distance, and it
draws you in.

| The cache | What's in it | Where it turns up |
|---|---|---|
| **A briefcase** (a glint in the snow) | 6–12 .38 rounds | the woods, the town's outskirts |
| **A lunchbox** | a first aid kit | anywhere |
| **A toolbox** | 1–2 fuses (for phase 7's lamps), sometimes a battery | the farm, the shed, under the bridge |
| **A hunting bag** | 3–6 shells | the farm, the deep woods |
| **A flare bag** | 1–2 flares | the ravine, the pond |
| **A torch, still on** (its beam on the snow: you see it from far off at dusk) | a battery | the deep woods |

- **One cache a nest a day**: it doesn't come back with the respawns, so it
  can't be farmed. A bigger nest guards a better one (a nest of 3–4
  doubles it).
- **Two ways to take it**:
  - **Clear the nest**: kill them all, then take it in peace.
  - **Sneak it**: crouched, a nest wakes only within 5 tiles. A cache at
    the nest's middle, with its sleepers 3–6 tiles round it, can be reached
    from the right side, slowly.
- **Shown like the drops** (a shape on the snow, its glint), with the
  search ring to open it (E, 0.8 s). The search makes no sound; the shots
  do.

## Delivered (2026-10-21)

The user: "approved, do all phases".

### Phase 0 — mocks
- **The day's map** (`design/screens/day/01-day-map.png`) is the plan,
  approved with the decisions above.
- **The rest were shot in the engine** once built, not painted:
  - the farm (`farm-day`, `farm-barn`, `farm-corn`);
  - a nest asleep, up close, and waking (`02-…`, `02b-…`, `03-…`).

### Phase 1 — the farm
- **The land** (shared `grounds.ts`):
  - **Where**: across the river, south of Main Street (`FARM`), cleared of
    trees and flattened like the town (`FLATS`).
  - **The lane**: a 4-wide trail from the square past the barn's doors to the
    farmhouse ("Farm lane").
  - **Buildings**: the barn (2 storeys, its doors on the west, **walked
    into**: stalls, hay, a workbench), the silo, the farmhouse (shut, a
    porch).
  - **The cornfield** (`CORN`): rows 2 tiles apart, walked through.
  - **In the way**: the tractor (vaulted, 1.4 high) and two scarecrows.
  - **Places**: "The farm", "The cornfield", "Barn". `GROUNDS_VERSION` 2.
- **Loot**: the barn's workbench (shells, fuses, flares, now and then the
  shotgun), the farmhouse's door, and the tractor's toolbox.
- **3D** (`tp/grounds3d.ts`):
  - **The barn**: red siding, an open doorway, X-braced doors slid aside, the
    loft door, white trim, a weathervane, red gables, a snowy roof.
  - **The silo**: bands, a ladder, a dome.
  - **The farmhouse**: porch, chimney, dark windows.
  - **The cornfield**: about 5,000 dry stalks (a stem, drooping leaves, a
    tassel), built in 6 bands, a step each. All at once was a 117 ms frame.
  - **The rest**: the fence with its gate, the scarecrows, the tractor, hay
    bales.
- **Iso** (`art/grounds-items.ts`): the same as items. The cornfield is
  runs of 10 tiles in 5 looks, each drawn once (385 different drawings was a
  100 ms frame).
- **Tests**:
  - **shared `farm.test.ts`**: cleared and flat; the lane; the barn walked
    into and its walls; the corn walked through; the tractor and scarecrows
    in the way; the loot reached.
  - **e2e `farm.spec.ts`**, both views: down the lane, into the barn and out,
    up a row. Worst frame 17 ms in 3D, 33 ms in iso.

### Phase 2 — the nests
- **Shared `dark/nests.ts`** (pure):
  - **`dayNests(day)`**: the day's layout, seeded by São Paulo's day.
    - Named places first: farm 5, town edges 4, ravine 2, pond 2, tower,
      shed and bridge 1 each. Then the deep woods, 40 tiles apart.
    - Never on a path or within 6 tiles of one, 60+ from the HQ, never in a
      building.
    - 1–4 in each (40 / 30 / 20 / 10%). Caches in 60% of them.
  - **`nestCount`**: 30 nests, plus 3 per person out that day, up to 45
    nests and 90 shadowed.
  - **`revive`**: 10 minutes, with nobody within 40.
  - **Speed**: a day's layout takes 21 ms. Two things made it fast:
    - **`onPathAt` reads the surface roughly**: with the slope, it built
      land and the layout took 1.9 s.
    - **`wayClearance`**: one distance to the nearest path, for the 6-tile
      rule.
- **The mind** (shared `dark/fsm.ts`): two states, appended (the wire's
  numbers unchanged).
  - **`lurk`**, asleep:
    - **What wakes it**: seen within 10 (5 crouching), a sprint heard within
      14, a shot within 30, or a focused beam on it.
    - **Asleep**, the shield comes back whole.
  - **`home`**: past its 30-tile leash (or whoever it's after past it, or
    nobody), it walks back and sleeps again.
  - **No drifting off**: a nest's never leaves when nobody's near, and isn't
    drawn to the living.
- **The server** (`features/dark.ts`):
  - **No more appearing by day.** The director spends nothing by day; a
    storm still counts as night.
  - **Out and away**: a nest's sleepers come out within 64 tiles of someone,
    a fresh spot round the nest each time. They're put away past 100 if
    they sleep.
  - **Waking**: one waking wakes its nest, once (a flag left on had them
    re-woken in a loop).
  - **Dead**: a killed one stays dead until it revives.
  - **The dusk**: the day's leftovers lose their leash and become the
    night's.
  - **Cheap**: sleepers with nobody within 20 tiles, nothing heard, aren't
    thought about at all.
  - **Land**: made ahead to 68 tiles.
- **Caches** (`features/survival.ts`, state `caches`):
  - **What's out**: the out nests' caches, from the day's start until the
    next day's.
  - **Opening one**: searched as a loot spot (E, the ring). What doesn't fit
    in your pockets stays in it.
  - **Saved** with the loot, with who's been out that day.
  - **What's in them**:

    | Cache | Holds |
    |---|---|
    | Briefcase | .38s |
    | Lunchbox | first aid |
    | Toolbox | fuses, a battery |
    | Hunting bag | shells |
    | Flare bag | flares |
    | A torch, still on | a battery |

  - A nest of 3–4 keeps twice as much.
- **Tests**:
  - **shared `nests.test.ts`**: the same day the same layout; spread and
    clear; each place; how many; the caches; the day's hours; the revive.
  - **world-server `nests.test.ts`**:
    - by day nothing appears;
    - a farm nest out asleep;
    - crouched at 12 tiles it sleeps on, at 6 it wakes, all of it;
    - led past its leash, it goes home and sleeps;
    - the dusk makes it the night's;
    - a cache searched.
  - **Gone**: the old "by day, fewer" test.

### Phase 3 — the look and sound
- **Asleep in 3D** (`chars/moves.ts` `lurkPose`): squatting low, folded over
  the knees, the arms round them, a slow breath, now and then a shiver.
  - **The shroud** is drawn in (`dark` × 0.55) and half as tall
    (`shroud3d` takes a height per figure).
  - **Iso**: crouched (the move's crouch bit).
- **Waking**: the emerge's sting, as at night.
- **Asleep near**: a low whisper from the nearest within 12 tiles, every
  9–13 s.
- **Caches**:
  - **3D**: a box of their shape and colour, with a glint. A torch left on
    glows steady and big.
  - **Iso**: an icon.
  - **Prompt**: their name ("Briefcase", "A torch, still on").
- **e2e `day.spec.ts`** (GPU), a woods nest and a farm nest:
  - out and asleep, as many as the nest holds, with its cache;
  - crept up on crouched to 9 tiles, they sleep on;
  - walked into, all of it wakes.

### Phase 4 — the checks
- **The page**: 567,278 bytes (18 under 554 KB).
- **The chunks**:

  | Chunk | Size | Budget |
  |---|---|---|
  | `yutopia-dark` | 25.5 KB | 80 |
  | `yutopia-grounds` | 114.7 KB | 180 |
  | `yutopia-chars` | 37.8 KB | 40 |
  | `yutopia-input` | 10.1 KB | 15 |

- **`DAY=1 pnpm perf`** (new):
  - **The setup**: 50 bots by day. Half stand by a nest each; half sprint
    laps of the pond.
  - **Result**: 57 sleepers out at once, tick 0.56 ms (max 2), 0 put back.
    Nearly nothing extra on the wire (they sleep still).
- **The other perf runs**:
  - **`pnpm perf`**: 0.44 ms, 0 put back.
  - **`DARK=1`**: 1.0 ms with 60 shadowed; their share 5.0 KB/s.
- **Unit tests**: shared 230, world-server 97, client 21. Typecheck and Biome
  are clean.
- **The GPU run**, 22 of 22: farm, day, grounds, shades, arms, down, dark,
  dark-hud, inventory, beam, dark-perf.
  - **The farm**: worst frame 17 ms in both views.
  - **The Grounds on High**: 60 fps at the lot, the square and the woods, by
    day and night.
  - **The night woods**, 20 shadowed and 4 flares: 60 fps.

## After: more nests, the farm's insides, better models (2026-10-21)

The user:
1. "add more nests by day, we have few spots";
2. "inside the barn the roof's invisible";
3. "make the farm's models better, all of them";
4. "make the farmhouse enterable, with all sorts of furniture";
5. "make the things you pick up off the ground better — they're red or blue blocks".

- **More nests** (shared `dark/nests.ts`):
  - **New places**: the clearing's edge, along the river's ice, the woods by
    the gatehouse and the bus shelter.
  - **More spots**: round the farm (behind the silo, its edges, more of the
    cornfield, round the barn's back) and the townhouses' back yards up
    Church Street.
  - **The day's share**:

    | Place | Nests |
    |---|---|
    | Farm | 8 |
    | Town | 6 |
    | Ravine | 4 |
    | River | 4 |
    | Pond | 3 |
    | Clearing | 2 |
    | Gate | 2 |
    | Bridge | 2 |
    | Tower | 1 |
    | Shed | 1 |

  - **How many**: 50 nests a day (~100 shadowed), +4 per person out, up to
    80 nests and 140 shadowed.
  - **Spacing**: woods nests 30 tiles apart (was 40), named ones 18.
  - **Speed**: a day's layout in 31 ms.
- **The barn's roof from inside**:
  - **Walls**: inside they're as tall as outside (5.2), with a lintel over
    the doorway.
  - **The roof's underside**, its trusses (tie beams, king posts,
    rafters), the gables inside, a hay loft over the east end with a
    ladder.
  - **Seen from below only**: it all faces down, so a camera above still
    sees in.
- **The farmhouse, enterable**:
  - **The door**: in its north wall, through the porch.
  - **The room**:
    - **The living room**: a bookshelf, a sofa, a rug, a low table, an
      armchair, a fireplace with embers.
    - **The kitchen**: a counter, a stove with its pipe, a fridge, a table
      and chairs.
    - **The bedroom corner**: a bed, a nightstand, a wardrobe.
  - **The loot** is at the kitchen counter now.
  - **No ceiling**: its room is too low for the camera over your shoulder.
    Like the town's, it's open above. A ceiling there covered half the
    view.
- **Better models**:
  - **The barn**:
    - a real gambrel roof under snow;
    - red gambrel gables;
    - a stone foundation;
    - white rake boards and fascia;
    - framed windows;
    - the doors with planks and X-braces on their rail, a lantern;
    - the loft door with its hood and hay beam;
    - a louvred cupola with a weathervane.
  - **The silo**: ribbed sheets ring on ring, bands, a concrete footing, a
    domed cap with snow and a vent, a railing, a caged ladder, a chute.
  - **The farmhouse**:
    - a foundation, corner boards, gutters and downpipes;
    - a porch with steps, posts and railings;
    - a door frame, the door stood open;
    - framed windows with green shutters all round;
    - a brick chimney.
  - **The tractor**: a rounded hood with a grille and headlights, an
    exhaust stack, lugged rear tyres with red hubs and fenders, front
    wheels on an axle, a seat, a steering wheel, the cab's frame and roof
    under snow.
  - **The scarecrows**: a plaid shirt, patched trousers, straw at the
    cuffs, a stitched burlap face, a hat.
  - **The rest of the yard**: split-rail fence on round-topped posts, round
    hay bales with darker ends.
  - **Iso**: the barn gets the gambrel, a foundation and the cupola; the
    farmhouse's furniture is drawn there too.
- **What lies on the snow** (`tp/items3d.ts`): lit models instead of
  coloured boxes, a little larger than life to read, with the glint.
  - **From the pockets**: a revolver, a pump shotgun, a box of .38s with
    rounds spilled, three red shells, a flare, a battery, a first aid case,
    a glass fuse.
  - **The caches**:
    - a briefcase with clasps;
    - a domed lunchbox;
    - a red toolbox;
    - a slumped hunting bag with a shell rolled out;
    - a flare bag with flares standing in it;
    - a torch still on.
- **Tests**:
  - **shared**: `farm.test`'s farmhouse is walked into and furnished
    (round the sofa, the rug walked on); `nests.test` checks the new
    numbers. 231 in all.
  - **world-server**: 97.
  - **`DAY=1` perf**: tick 0.67 ms, 0 put back.
  - **e2e `farm.spec`**: into the farmhouse; the barn's roof shot from
    inside in first person.
  - **e2e `drops.spec`** (new, shots): one of each dropped in a row.
- **The page**: 567,282 bytes (14 under). **`yutopia-grounds`**: 117.0 KB.
- **The GPU run**: 22 of 22. The farm's worst frame is 17 ms in 3D and 33 ms in
  iso; the night woods hold 60 fps.
