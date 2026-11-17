# Plan 97 — the car's memory

Asked 2026-11-17: "Car memory leak". This came from the leftovers of plans 90–96: plan 93's memcheck step, which
was never explained, and plans 94–96, which have put a lot on the GPU per car since then.

Status: **planned 2026-11-17.** Forks decided 2026-11-17, one by one, all recommended:
- F1a: the memcheck's car cycle covers the whole life: in, drive, shot, burnt, blown, wrecked, mended, out.
- F2a: a short car cycle in the nightly job (one car, a few shots, burn and mend, no drive across town); the full
  life run locally.
- F3a: strict: once a car is gone or mended, everything it made is freed; programs may go up once, by +3.
- F4a: the server judged by its heap in use and the car maps' sizes; RSS reported as a trend only.

**PLAN 97 DONE 2026-11-17** (phases 0–4, results below), uncommitted. Phase 3, the nightly job's short car cycle, went in with phase 1.

## Why

- **The memcheck never touches a car.** `e2e/memcheck.mts` takes Cai up and down the floors, out to the lot and
  along the long road, puts things down and picks them up, and sends people in and out. Nobody gets in a car,
  shoots one, burns one or mends one. The nightly job (`.github/workflows/memory.yml`, 3 cycles, software GL)
  doesn't either.
- **Plan 93 saw a step and never explained it.** Over 5 cycles, geometries went 3088 → 3358 and programs 253 → 259.
  About 150 geometries arrived once, roughly 10 min in (cycle 4), and stayed flat after that. They weren't there
  before the cars (0de45a5c).
  - Ruled out then: a per-cycle leak, the car GLB cache, Auto quality, the time of day and snow, the scene counts,
    the sky's PMREM.
  - The last lead: something on a ~10 min timer from plans 92–93 (`EMPTY_TOW_MS`, a dry car towed home, so its
    parked model gets rebuilt).
  - Plan 94's run (4 cycles) didn't see it, which may only mean it ended too soon.
- **Plans 94–96 added a lot per car:** fire and smoke, debris on Jolt, per-pane glass, cracks, windscreen stars,
  6 cm marks re-laid on every dent change, the flat tyre's shader variant, the blowout, the hop, parts shot off.
  The car's sound also builds its own graph (`car/sound.ts` makes about 80 nodes in all).
  - Only the debris has been checked on its own (`e2e/car-debris-freed.mts`).
- **The server's resident memory was OVER in plan 94** (220 → 347 MB), but its heap in use was flat (164 →
  168 MB). That was as noisy before the cars, so it's unexplained but probably not the cars.

## Where we are, from the code (leads, none measured yet)

- **L1, the stars** (`tp/car/glb.ts:1868`). Every time a car's windscreen stars are laid again, a new 0.36 m
  `PlaneGeometry` is made and pushed to the car's `geos`. The old instanced meshes are freed, but the old
  geometries stay until the whole car is disposed. A car that lives and keeps getting shot grows by one geometry
  per re-lay. The marks don't have this problem (`markGeo` is made once).
- **L2, programs.** The flat tyre (`…|flat`), the paint (`car-paint-glb`) and the life look's materials each
  link a program the first time they're seen. three only frees a program when the last material using it is
  disposed. We need to see whether the count comes back down after the cars have gone, or only ever goes up.
- **L3, the ~10 min step.** Plan 93's lead, not followed up yet: a towed-home car's parked model being rebuilt.
  Other candidates are any timer of 5–10 min in `world-server features/cars.ts` or `world/car/cars.ts`.
- **L4, the server's maps** (`features/cars.ts`). `knockedAt` is keyed by session id and nothing ever deletes
  from it, so it grows by one entry for every driver who has ever knocked someone. `unstuckAt` and `shovedAt`
  are keyed by car id, so they stay bounded. The others (`live`, `bySid`, `heat`, `burning`, `saveSoon`,
  `chainJobs`) do get deleted from.
- **L5, the sound.** `CarSound.dispose` disconnects the car's panner and stops its loops. Its one-shots
  disconnect on timers (up to 9 s). No sound node is counted today, so nobody has checked.

## Phases

0. **Measure, before changing anything:**
   - the memcheck on today's main:
     - on the production build (`next dev` adds ~276 MB of strings), on a quiet machine;
     - 8 cycles, so a 10 min step has room to show;
     - with `GEO_WHO=1`, so any step comes with its owners;
   - a new probe, `e2e/car-memory.mts`, on the dev world. It runs *N car lives* and counts after each, with
     garbage collected first:
     - one life is a parked car that someone gets in, drives a short loop in, shoots up (glass, body, a tyre),
       burns until it blows, sees wrecked and mended or towed home, and gets out of;
     - counted on the browser: geometries, textures, programs, Jolt bodies and its heap, the scene's children,
       and the car's live sound nodes (an init script tallies `AudioNode` connect/disconnect, for the probe only);
     - counted on the server: heap in use and each car map's size.
   - The leads L1–L5 are each confirmed or dropped by those numbers.
1. **A car cycle in the memcheck:** after the walk, Cai gets in a car and drives the lot and back. A second car
   takes the beating as far as fork F1 says. The car counts go into the existing table with their own budgets
   (fork F3).
2. **The fixes**, one at a time, each with its probe numbers before and after:
   - L1: the stars share one geometry, made once, like the marks;
   - L4: `knockedAt` is cleared when the driver leaves;
   - whatever phase 0 finds for L2, L3 and L5.
3. **The nightly job**, as fork F2 says.
4. **Checks:**
   - the memcheck twice at 8 cycles;
   - `car-debris-freed` and the specs near the cars (car, car-look, pets-car, arms);
   - the page budget (488.1 of 489 KB): the probe's hooks must live in the lazy car chunk or in the probe's own
     init script, not on the page.

## Forks

| | Question | Options | Recommended |
|---|---|---|---|
| F1 | How much of a car's life the memcheck cycle covers | **a)** the whole life: in, drive, shot (glass, body, tyre), burnt, blown, wrecked, mended, out · **b)** in, drive and out only; the beating stays in `car-memory.mts` · **c)** a different part of the life each cycle | **a** |
| F2 | The nightly job (software GL, a 60 min limit) | **a)** a short car cycle every night (one car, a few shots, no drive across town); the full one run locally · **b)** local only; the nightly job stays as it is · **c)** a separate weekly job with the full life | **a** |
| F3 | The budget for the car counts | **a)** strict: once a car is gone or mended, its geometries, textures, sound nodes and bodies are back to where they were; programs may only go up by the variants the car brings in (`+3`), once · **b)** the existing budgets (5% / +20 geometries) | **a** |
| F4 | The server's resident memory (OVER in plan 94, heap flat) | **a)** judge the server by heap in use and the car maps' sizes; RSS reported as a trend only · **b)** leave the server's numbers as they are; browser and car maps only · **c)** chase the RSS too (allocator, Jolt, land worker) | **a** |

## Guardrails (from earlier plans)

- Count three's objects by identity and by the renderer's `info`, never with a deep compare (plan 72: ~300 GB).
- Jolt's JS wrapper cache holds every wrapper until it's destroyed (`physics/world.ts forget()/letGo()`): a body
  count that only goes up may be a forgotten wrapper rather than a body that's still alive.
- The dev world is shared: check ListAgents and `ps` before the probe or a restart. The memcheck runs its own
  offline world-server on :2674, so it doesn't touch the shared world.
- Never two e2e runs at once; no full e2e suite.

## Phase 0 — built (2026-11-17): the measures

### The memcheck, 8 cycles (production build on :3107, `GEO_WHO=1`, its own offline world-server)

- **All ok but one: `browser.geometries` OVER**, 3267 → 3422 → 3421 → 3427 → 3430 → 3429 → 3430 → 3438.
  - The whole step is **once, between cycles 1 and 2 (+155)**. After that it's flat: +16 over six cycles, about what
    the garment cache adds (`wearFiles` 90 → 103, under its cap of 240).
  - It's plan 93's step again. The draw tracker still can't name it: cycle 2's owners add up to a few, so most of
    the 155 are geometries made earlier and uploaded later.
  - So it's **a warm-up, not a leak**: the first cycle is too early to be the baseline.
- Programs 358 → 360, textures 459 → 498 (allowed +80), heap 893 → 906 MB, Jolt and bodies flat.
- **The server:** heap in use 164 → 174 MB (+1.4 a cycle, allowed +20). Its RSS swings 206–338 MB with no trend,
  and its heap total swings the same way. `server.chunks` climbs to its cap as the land cache fills
  (471 → 1135 of 4000). Externals and buffers each go up ~1.7 MB a cycle, both within budget.
- This run had no cars in it: it's the baseline the car cycle (phase 1) will be added to.

### `e2e/car-memory.mts`, the car's whole life (dev world :3100, Ana, High)

One life: Main Street's first town car is taken, driven 3 s, braked, crashed in to smoking (as `car-fire`). Then
outside: four windscreen stars and a fifth round that goes in, a side window, a door shot five times, the front
tyre (blowout), the wing. Then the blast, the debris' wait, every car put home fresh (`mod:cars`), and back to where
she began. Garbage collected twice, then counted. Four runs: 4, 5, 3 and 3 lives. Every round hit (5/7/4), and
every life ended in one blast. It comes during the side volley: the smoking front plus seven more rounds is enough.

What it counts, beyond three's `info`:
- WebGL's own buffers, textures and programs, each with the stack that made it (an init script around
  `create*`/`delete*`);
- **every geometry with the code that first gave it an attribute** (`BufferGeometry.setAttribute`, a WeakRef
  each, dropped on `dispose` or once collected), and for the furniture's, the object wearing it;
- every shadow-casting light that got a map, and whether it's still in the scene;
- each program's cache key (hashed), new and gone;
- sound nodes made by kind, and those still alive in JS (a FinalizationRegistry).

The 5-life run (life 1 is the warm one):

| | life 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| geometries | 3012 | 3089 | 3099 | 3092 | 3101 |
| textures | 394 | 400 | 401 | 402 | 403 |
| programs | 335 | 337 | 337 | 337 | 339 |
| Jolt bodies | 279 | 279 | 279 | 279 | 279 |
| debris, fire loops, hops, fire lights | 0 | 0 | 0 | 0 | 0 |
| sound nodes alive (JS) | 25 | 25 | 25 | 25 | 25 |

- **Geometries the car code made: none left over.** Every glb.ts maker (`splitRearBumper`'s pieces, the pine
  tree, the tail patch, the screen, `new GlbCar`) goes ±1–3 a life as parked models come and go, and nets to
  about nothing. The rest of the life-to-life movement is untracked geometry (made before the probe's hook) being
  uploaded, or the land streaming in.
- **The one steady grower: 2 geometries a life from the furniture** (`furn/kit.ts Model.geometry` by way of
  `native.ts modelOf`), worn by no mesh. That's `modelOf`'s cache: each new look of a placed thing is made and kept
  for good, and the room's buffers get a copy. Something near the route changes its look every life (food
  `portions`, a lamp's `on`, darts…). Its kind is still to be named.
- **Textures: +1 a life**, first uploaded in the shadow pass (`view.ts`'s `shadowMap.render` wrapper). No
  shadow-casting light took a new map (none recorded, none left the scene). So it's a texture first used by a
  shadow caster, perhaps the same furniture look's.
- **Programs: only first sightings.** Life 2 brought `livery_police` and a `blade` variant (a police car came
  near), and life 3 brought none. No program is lost or made again.
- **The fire, the blast and the debris all let go:** at the count, fire loops, hops, fire lights and Jolt's
  debris crates are back to 0 (as `car-debris-freed` found in plan 94).
- **Sound:** 4,491 nodes made over 4 lives, 25 alive at every count. The connected tally is dropped from the probe:
  it counted nodes the GC had already collected.

### The leads

- **L1, the stars: real, but bounded by the car's model.** Each re-lay keeps its 0.36 m plane in `geos` until the
  model is disposed. The car is put home with a new model, so nothing stays past its life. It's a one-line fix
  (one plane, made once), done in phase 2.
- **L2, programs: dropped.** They only go up when a variant is first seen, never per life.
- **L3, the ~10 min step: it's the warm-up.** It shows between the memcheck's cycles 1 and 2 and then stays flat
  for six cycles, and the car life shows nothing like it. Phase 1 judges the memcheck from cycle 2, with the
  setAttribute census in it so a step names its maker.
- **L4, the server's `knockedAt`: real by the code** (keyed by session id, never deleted). It's tiny, and no probe
  measures it until phase 1 puts the car maps' sizes into the memcheck.
- **L5, the sound: dropped.** JS-alive nodes stay flat.
- **L6, new: the furniture's model cache** (`furn/native.ts modelOf`), 2 geometries a life:
  - every look ever made is kept;
  - the "by state" kinds (`dartboard`, `wall_calendar`, `advent_calendar`) drop an old look from the cache
    without disposing it, so a dart thrown leaves its old board's geometry on the GPU;
  - phase 2 names the kind that changed and lets go of looks no longer worn.

## Phase 1 — built (2026-11-17): a car's life in the memcheck

- **`e2e/car-life.ts`**, the car's life (from phase 0's probe), shared by the memcheck and `e2e/car-memory.mts`:
  - `carLife(page, armed, { home, short })`: the town's first car (the lot's if the town has none) is driven,
    crashed to smoking, got out of and shot up. Then it blows, its debris gets its two minutes, every car is put
    home fresh, and back to `home`.
  - **`short` (the nightly job's, F2a):** no windscreen volley; the side window, one door round and the tyre, then
    the wing's four rounds. The blast still comes.
  - The in-page counters go in as strings, because tsx (the nightly job's runner) wraps named functions in a
    `__name` the page doesn't have:
    - `SOUND_TALLY`: the sound nodes alive in JS;
    - `CENSUS`: each geometry by its maker, and the shadow-mapped lights.
  - `carCounts`, `movedSites`, `armCarLife` (the `car:shot` and `car:blast` listeners).
- **The memcheck** (`e2e/memcheck.mts`):
  - each cycle, after things are put down and before people come and go, a car's life runs (`NO_CAR=1` leaves it
    out, `CAR_SHORT=1` makes it the short one);
  - **new browser counts:** `carsLive`, `debris`, `fireLoops`, `hops`, `fireLights`, `soundAlive` (after a second
    GC, so the FinalizationRegistry has run);
  - each cycle's row prints the geometries by maker that moved since the last cycle, and the programs new and
    gone. That's how a step names its maker now (minified on the production build; `e2e/car-memory.mts` on the dev
    world gives the source names);
  - **the warm cycle is the second** when there are three or more (phase 0's step comes in the first);
  - **the budgets (F3a):**
    - debris, fire loops, hops and fire lights capped at 0;
    - cars driven +1 (the AI's);
    - sound alive +12: at a count it swings 22–33 with whatever's playing, and one life makes ~1,000 nodes, so
      one kept would be dozens;
    - programs +6, was +3: with a car's life each cycle they swing 366–373 and back. Garments' programs are named
      and renamed as people come and go, and six (four lit, a depth, a sprite) are let go one cycle and made again
      the next. The trend still catches a count that only grows. This is wider than F3a's +3, and the car itself
      brings no new ones.
  - **The server (F4a):**
    - RSS is a trend only;
    - its heap in use keeps its budget;
    - **the cars' maps** are new gauges, `room_cars_*` (`WorldRoom.carMaps`, set by `features/cars.ts`):
      `live`, `bySid`, `knockedAt`, `unstuckAt`, `shovedAt`, `saveSoon`, `chainJobs`, `heat`, `burning`. Each is
      budgeted against the warm cycle (0 to +2).
- **The nightly job** (`.github/workflows/memory.yml`): `CAR_SHORT=1`.

### Runs (production build on :3107, its own offline world-server)

- **4 cycles:** every car life the same (town-car-0, rounds in 5/7/4, one blast, put home with no damage or holes,
  201 s). Everything ok but programs 366 → 370 → 370 (on the old +3). That run led to the program list below.
- **5 cycles: memcheck ok.**
  - From cycle 2: geometries 3564 → 3567 → 3575 → 3568, textures 510 → 520, programs 368 → 373 → 371 → 371,
    sound alive 22 flat.
  - Every car count 0 at each count, every car map on the server 0.
  - Server heap 174 → 179 MB, RSS 308–374 MB (a trend).
  - The new programs were only garments' (`wear-eyewear-round` and the like, renamed as they came and went) and
    the six that were let go and came back.
- **The nightly job's path, locally** (`MEM_FAKE_API=1`, tsx, `BOTS=6 IDLE=8 NO_ROAD=1 CAR_SHORT=1`, 2 cycles):
  - the short life works: rounds in 0/3/4, one blast, put home fresh, 182 s a cycle;
  - all ok but sound alive 27 → 33 on the old +5. That's what set +12 (with 2 cycles the warm one is the first;
    the job runs 3).
- Server car tests: `cars.test.ts` + `car-shot.test.ts` 22/22.

### Still open for phase 2

- L4: `knockedAt` stays 0 here, because no one in the memcheck knocks a person with a car. Its fix goes in with a
  unit test.
- L6: the furniture model cache.
- L1: the stars.
- The six programs let go and made again each other cycle are a compile each time (a frame hitch, not memory).
  Which materials they are is worth a look in phase 2.

## Phase 2 — built (2026-11-17): the fixes

- **L6, the furniture model cache** (`furn/native.ts`, `furn/pictures.ts`):
  - **What grew:** the 7-frame maker (`DEPTH=7`) was `Model.geometry < make < modelOf < nativeInto < renderLife <
    render < pictureOf`. The HUD's prompt shows a thumbnail of whatever thing someone stands by (`ItemThumb` →
    `pictureOf`). The car stops a little elsewhere each life, so it's a different thing each time. Its picture
    put that look in `modelOf`'s cache for good, a geometry and its glow pair a thing pictured.
    - No room object's props changed in a life (`PROPS=1` on the probe).
    - It was JS memory, not GPU: the picture draws a copy and disposes it.
  - **The fix:** `pictureOf` asks `hasModel` before drawing, and if the look wasn't made yet, `forgetModel` lets it
    go after. That takes it out of the cache and out of the same-looks list (unless another look shares it), and
    disposes its geometry, glow and glass. The picture itself is kept, as its URL. `turntable` (the held piece, drawn
    every frame) is left as it was.
  - **The stateful kinds** (dartboard, wall and advent calendars): an old look no one else has is now disposed as
    it leaves the cache. Each dart thrown used to leave its board's old model behind.
  - Tests in `furn/native.test.ts`: the old advent look disposed and made anew if wanted; `forgetModel` drops and
    disposes. 19/19.
- **L4, `knockedAt`** (`world-server features/cars.ts`): cleared in `leave`. `cars.test.ts` (plan 93 S3) now has
  the knocked person leave and checks `WorldRoom.carMaps().knockedAt` drops by one. Server car tests 22/22.
- **L1, the stars** (`tp/car/glb.ts setStars`): one 0.36 m plane a car (`starGeo`), made once and shared by every
  star mesh. They used to get a new one each time they were laid again.
- **The six programs let go and made again:** four `MeshPhysical`, a depth and a sprite, unnamed. They swung the
  same way in phase 0's memcheck with no cars (357–361), so they aren't the cars'. Naming them needs a probe
  matching each program to its material. That's left for a plan about frame hitches, not this one.

### Runs

- **`e2e/car-memory.mts`, 3 lives** (dev world): no `native.ts` maker grows any more. The car code's own
  geometries go 201 → 212 → 212 (a parked model come near, then flat). Sound alive 25 flat, programs 372 → 371 →
  372.
- **The memcheck, 5 cycles** (production build, rebuilt): **ok**, every cycle's car life the same (5/7/4, one blast,
  put home fresh, 200 s). From cycle 2:
  - geometries 3717 → 3704 → 3715 → 3706;
  - textures 505 → 522 (the garments: `wearFiles` 93 → 99);
  - programs 376 → 381;
  - heap 929 → 938 MB;
  - every car count 0, sound alive 22–33;
  - the server's heap 175 → 179 MB, every car map 0.
- The page budget: the world page still 488.1 of 489 KB.

## Phase 4 — built (2026-11-17): the checks, and a faster cycle

### A cycle in a minute

The user, at the first 8-cycle run (36 min): no process should take that long, and a cycle shouldn't take
2 minutes. Measured, a cycle was ~4.5 min: the car's life 200 s, the walk ~55 s, the still stretch and the
counts. Now **60–62 s** (the nightly job's, 48–50 s):
- **The car's life, 200 s → 27 s** (`e2e/car-life.ts`):
  - the debris lay its game's 2 minutes. `Debris.keepS` (`car/fx.ts`, 120 in the game) is set to 2 s by the
    life, which goes on as soon as the pieces and their Jolt crates have gone;
  - every step waits for what it's waiting for, not a fixed time: a round for the server's word on it (~50 ms,
    was 0.8 s), a teleport for her position, the revolver for her hand (the draw tried again until it's there:
    pressed before the kit reached the pack, it drew nothing), the seat, getting out, the blast, the car fresh;
  - a reload tried every 250 ms (was 3.5 s), and a volley whose first round finds nothing stops;
  - no engine volley once the car has blown (it does during the side volley);
  - the drive 1.5 s and the brake 1 s (were 3 s and 1.8 s).
- **The walk** (`e2e/memcheck.mts`): each floor 1.5 s (was 2.5), the lot and home 2.5 s (4), each road stop
  5 s (8), a thing put down and taken away 0.25 + 0.25 s (0.4 + 0.4), the still stretch 8 s (20; CI's
  already). Each cycle prints its time.
- What's left is mostly the game's own: a car burns at least 10 s before it blows (plan 95), and each place
  needs a moment to come in.

### Runs

- **The memcheck, 8 cycles, twice** (production build, rebuilt): **ok both**, 510 s and 507 s; every cycle
  60–62 s, all 16 car lives the same (5/7/4, one blast, put home fresh). From cycle 2:

  | | run 1 | run 2 |
  |---|---|---|
  | geometries | 3917 → 3940 | 3916 → 3944 |
  | textures | 516 → 545 | 516 → 548 |
  | programs | 378 → 382 | 378 → 381 |
  | heap (MB) | 934 → 957 | 942 → 971 |
  | sound alive | 22–37 | 22–27 |
  | server heap (MB) | 166 → 175 | 166 → 175 |

  Every car count and every server car map 0 at each count. Most of the textures' rise is the garment cache
  filling (`wearFiles`, capped). Geometries and the page's heap each go up ~4 a cycle and ~4 MB a cycle, and the
  server's heap ~1.3 MB a cycle. All are inside their budgets and none trips the creeping rule. A longer soak would
  say whether they level off.
- **The nightly job's path** (`MEM_FAKE_API=1`, tsx, `CAR_SHORT=1`, 3 cycles): ok, 177 s; cycles 48–50 s, the
  short life 23–26 s (0/3/4, one blast).
- **`car-debris-freed`** (plan 94's, the game's own 2 minutes): 16 pieces and 16 crates thrown, 0 and 0 after
  two minutes, the scene back to 112.
- **The specs near cars** (`YUTOPIA_GPU=1`): car, car-look, pets-car, arms — 5 of 6.
  - car.spec "a car passes under a flier 3 m up; for someone on the ground it stops" failed twice (11 m on, not
    stopped short of her).
  - It then passed twice with this plan's client stashed (HEAD's client, this plan's server: the world's
    watcher didn't restart), and twice more with it back. So it's flaky, not this plan's.
- **The pictures after L6:** the Build catalog's Walls and Furnish tabs draw every picture (16 of 16 each, the
  chair, armchair, sofa… seen).
- Server car tests 22/22; `furn/native.test.ts` 19/19; the page budget: the world page 488.1 of 489 KB, the car
  chunk 54.4 KB.
