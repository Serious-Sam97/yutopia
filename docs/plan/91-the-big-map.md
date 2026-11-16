# 91 — The big map: loaded by where you are

Ask (2026-11-15, the user, testing plan 90): look at how the world is loaded — what, how well, how in real time.
(1) the tab at ~3 GB of RAM on its own: is it done the right way? (2) Rafael (a 16 GB PC): leaving the town for the
long road, the asphalt never came — a dirt road, "as if something had locked up", not even after a while. "Remember
this game will have a gigantic map: we have to be smart about how we load things."

**The rule, as plans 89–90's: the same game — the same look, the same world — only loaded smarter.** What's near
you as it is now; what's far, made and freed by distance; nothing built "for good".

Status: **done 2026-11-15 — phases 0–10 (the user tests at the end); forks decided by the user 2026-11-15**: **F1a** the road fix committed and deployed
ahead of the plan; **F2b** a map past ±60 km — the chunk keys widened and a floating origin built now; **F3a** the
districts made in workers; **F4a** nothing built for good, the town too; **phases 9–10** (graphics settings, a game's; changing them without the stall) added by the user the same day. The road bug (phase 1) found and fixed in
the investigation.

## What was found (2026-11-15)

### Rafael's road: the land asked for again and again

The land's blocks are made by 2–3 workers (`tp/land-pool.ts`) and placed by the stream a few ms a frame
(`tp/grounds-stream.ts`). A block left the pool's `asked` set the moment a worker answered — but it was placed only
later, so the next frame saw it still missing and **asked for it again**. A fast machine places what comes the frame
it comes: no harm. A slow one places less than the workers make, and the queue fills with copies of the nearest
blocks — sorted nearest first, so **the stream spends its budget making the same nearest blocks again** (a new
geometry each, the trees' pools filled again each time) and the new ones never come.

The asphalt is a district's (plan 69): districts step only in a frame the land placed nothing. The land placed
something every frame — the same blocks — so **the districts never stepped: the dirt road under the asphalt, for
good.** And the queue kept growing (~50 KB a block): RAM with it.

The probe (`e2e/zz-stall.mts`: a prod build, CPU throttled 4×, entered in town, then onto the long road):

| | Before | After the fix |
|---|---|---|
| Blocks made and waiting, 60 s on | 4,858, growing | 0 |
| The land (High) | a block every ~10 s, 71 missing at a minute | all in under 10 s |
| The districts — the asphalt (High) | never a step | all in under 20 s |
| Potato | stuck the same | land under 10 s, districts ~40 s |

Unthrottled (the M4): both under 10 s, before and after — why it was never seen here.

### The 3 GB

Chrome's whole tab, not the page's JavaScript. On a prod build, High, the office then the woods:

- **The JS heap ~755 MB** (`next dev` ~1,030: +265 MB of dev code strings). **The GPU process ~2.2 GB on High,
  1.27 GB on Low.**
- Of the heap's ~640 MB of array data, **only ~220 MB is the scene's geometry** (the Grounds 89, floors 54, people
  43, cars 28). Off the scene: **~160 MB of geometry nothing draws** (by its retainers, the wardrobe's garments,
  never freed), **73 MB of raw file buffers** kept after parsing, **58 MB of land data**, **38 MB of the light
  volume** (and its `Data3DTexture` a second copy), **31 MB of compressed textures' CPU copies**, 12 MB of morph
  textures' copies, 17 MB of Jolt.

### How it's loaded now — what doesn't scale

- **Built once, never freed**: the rest's circle (900 m round the town: ways, buildings, lamps, props), the Kart Park
  (~2,000 meshes), the office. Fine for today's map; on a big one, every town passed through would be kept.
- **Caches that only grow**: a car's plate and full model per vehicle seen, sign canvases, the tree pools, the
  wardrobe's garments.
- **Two build lanes that starve each other**: the land and the districts, the districts only in what the land leaves
  (Rafael's bug was the extreme of it; a slow machine driving fast is the ordinary case).
- **The districts made on the main thread**, 32 m road pieces a step — the land's in workers, theirs not.
- **No tier changes the reach**: the land's radius (440 m), the districts' (900 / 1,300 m), the caches, the
  workers — the same on Potato as on High.
- **Workers trusted for good**: an ask a worker never answers stays asked forever (a block missing for good); one
  error ends them all for the session (then the main thread makes everything).
- **The coordinates have a ceiling** (F2b: lifted in phase 7): the land's chunk key packs ±2,048 chunks of 32 m — **±65 km** from the middle
  (`grounds.ts chunkKey`, `world-server land.ts key`); float32 positions lose millimetres past ~15 km (the long road
  reaches 13.7 km now).
- What's good already: the land streamed by a quadtree (128/64/32 m), its chunks kept under a cap (4,000, least
  lately used out: plan 89), the server's land made ahead in a worker, the loading screen waiting for what's to be
  seen (plan 90).

## Targets

On a prod build, the bench of phase 0:

- **The asphalt under you within 10 s of arriving anywhere**, at CPU 4× on Potato; driving the long road at 240 km/h
  at CPU 4×, **no dirt road in view** past the first 10 s.
- **No build queue grows without end** on any machine: the made-and-waiting held under a cap, every ask answered or
  asked again.
- **The JS heap ≤ 500 MB on High after 10 minutes driving** (now ~755 standing), ≤ 350 MB on Low and Potato; **the
  tab ≤ 2 GB on High, ≤ 1.2 GB on Low/Potato**.
- **Flat over a round trip**: the town → the far end of the long road → the town, the heap back within 50 MB.
- Same pixels where you stand (A/B stills, as plan 89).

## Forks

| # | Question | Options | Recommended |
|---|---|---|---|
| F1 | The road fix (phase 1) | **a)** committed and deployed now, ahead of the plan — Rafael's road, today · **b)** with the plan | **a** |
| F2 | How big is "gigantic"? | **a)** up to ~±60 km (today's ceiling): no origin work · **b)** past it: the chunk keys widened and a floating origin (the world shifted under you every few km, so the GPU's floats stay precise) — built now · **c)** a) now, b) written down and built when the map nears 50 km | **c** |
| F3 | The districts' geometry | **a)** made in workers, as the land's — the main thread only places · **b)** on the main thread, in finer steps | **a** |
| F4 | What stays built | **a)** nothing for good — the town too, by distance, as the districts (coming back, it's made again: a few seconds out of sight) · **b)** the town you entered in kept, the rest by distance | **a** |

## Phases

0. **The bench** — `e2e/zz-stall.mts` made a tool (`e2e/stream.mts`): a prod build; CPU 1×/4×/6×; Potato, Low,
   High; arriving (teleport) in the town, the woods, the long road's middle and far end; driving the long road at
   120 and 240 km/h. Read each second: the land's blocks missing, the districts' steps left, the queues (asked,
   made, waiting), the asphalt under you (a ray down: asphalt or dirt), the heap, the GPU's memory (Chrome's
   process), fps. And a census by owner (a heap snapshot's retainers: the scene, the wardrobe, the cars, the land,
   textures, file buffers, Jolt). The round trip as a soak. Written here; each phase after measured by it.
   Done 2026-11-15 — `e2e/stream.mts` (`arrive`, `drive`, `soak`, `census`; a few minutes a mode by default:
   Potato and High, the CPU 4×; widen by hand). Arriving in play (a teleport, not behind the loading screen), the
   seconds till the land's all in · the asphalt under you · the districts within 200 m · all of them (with the road
   fix of phase 1 in; 60 s at most):

   | CPU 4× | Woods | Road, 2 km | Road, 7 km | Town (from the road) |
   |---|---|---|---|---|
   | Potato | 6 · – · 1 · 1 | 4 · 7 · 14 · 26 | 6 · 7 · **55 · never** (3,821 steps left) | 6 · – · 1 · 21 |
   | Low | 3 · – · 1 · 1 | 3 · 4 · 6 · 11 | 4 · 2 · 20 · 29 | 2 · – · 1 · 6 |
   | High | 3 · – · 1 · 1 | 3 · 5 · 8 · 13 | 5 · 4 · 26 · 39 | 3 · – · 1 · 8 |

   - Unslowed, all of it in under 11 s but Potato at 7 km (30 s: lite's one frame in three, 2 ms a step).
   - **Driving the long road at 240 km/h, CPU 4×** (the seconds with dirt under you past the first 10, of 29):
     **Potato 25**, High 6; the land up to 77 blocks behind on Potato.
   - **Memory** (`census`, High, after the town and the woods): the JS heap 710 MB; the tab's array buffers 749 MB,
     WebGL's own 442, **canvases 290**, malloc 189, V8 163; the GPU process's `gpu` 1,673 MB (ANGLE's 1,290). The
     scene's geometry ~230 MB (the Grounds 87, cars 50, people 31, the rest 61), its textures' CPU copies 39 — **the
     array buffers' other ~500 MB aren't the scene's**. The heap at the road's 7 km up to 1,150 MB (High) against
     ~710–860 elsewhere.
1. **The road fix, and workers that can't lock it up** — (found 2026-11-15, 296f3e79) a block made and waiting
   isn't asked again (`land-pool.ts ask`); one built isn't placed again (`grounds-stream.ts`). And: an ask not
   answered in 5 s asked again of another worker; a worker that errs replaced, not all of them ended; the made queue
   capped (the furthest dropped, asked again when wanted). `land-pool.test.ts` with fake workers: a slow placer, a
   silent worker, a dying one — the land all in.
   Done 2026-11-15 — `land-pool.ts`: a worker's blocks in hand by key (not a count); a worker silent for
   `STUCK_MS` (5 s) with blocks in hand replaced and its blocks freed for the others (a main thread held up over a
   second isn't the workers' fault: counted again from then); one that errs replaced too; only after `DEATHS` (4)
   the main thread makes the land; a late answer for a block asked again isn't kept twice. The stream's made queue
   capped at 256 (`MADE_CAP`). `land-pool.test.ts` (fake workers): a slow placer (each block asked once — red on the
   old pool), a silent worker, a stalled main thread, a dying one. In the bench, as phase 0 (within the noise);
   blocks made and waiting at most 39 (were 4,858 and growing).
2. **One build lane, by priority** — the land, the districts, the rest's steps and the cars' models in one queue a
   frame, shared out by what you'd see first: **the ground under you and the road ahead** (asphalt, its land),
   then the land round you, then what stands (buildings, lamps, props), then what's far; going fast, what's ahead
   first (as the land's `LOOK_S` now). No lane waits for another to finish its frame: each gets its share of the
   budget. The asphalt with the land it lies on — a road block never shown as dirt while its land is.
   Done 2026-11-15 — a district's steps carry their place and group (`Grounds3.queue`): its road pieces, the
   crossings and the bridges first (group 0), what stands by them next (the long road's dressing, buildings,
   water: 1), the lamps last (2); `step()` takes the first group's nearest to its `focus` (the stream's look-ahead
   point). The stream (`grounds-stream.ts`) picks the district whose next step comes first (`pickDistrict`, by
   `nextKey`: group, then metres), every frame — not only in one the land placed nothing; the land takes the
   budget but **half of it when the road's next piece is within 160 m** (`URGENT_ROAD_M`), the road a step at
   least then; the land within 64 m of where you'll be or the road near is urgent: Lowest/Potato build it every
   frame, not one in three. CPU 4×:

   | | Before | After |
   |---|---|---|
   | Driving at 240 km/h: seconds with dirt under you (of 29) | Potato 25 · High 6 | **0 · 0** |
   | Arriving 7 km out: the asphalt under you | 7–8 s · 4–5 s | **2 s · 2 s** |
   | Driving: the land's blocks behind, at most | 77 · 19 | 92 · 37 |
   | Driving: fps (the bench's average, teleporting 10 a second) | 39 · 22 | 25 · 17 |

   The road there costs frames on a slow CPU: a road piece is a 32 m stretch made on the main thread — phase 3's.
   Potato's districts 7 km out still not all in a minute (the dressing after every road within 900 m).
3. **The districts in workers** (F3a) — a district's pieces (the ways' ribbons, the ground's props, the buildings'
   shells) made as data in the land's workers (the same shared code: `Grounds3`'s builders moved to plain arrays),
   the main thread making only meshes from them, a few a frame, as the land's blocks.
   Done 2026-11-15 — measured first (a profile 7 km out, High, CPU 4×): the district steps were a third of the main
   thread, all but nothing of it **the road pieces** (`ways`: the ground's height under each vertex, `roadTarget`,
   `nearRoad`, the banks) — the land's chunks made for them only 0.4 s of 6.4. So the road pieces went to the
   workers, not all of `Grounds3`: `way-piece.ts` holds a way's geometry alone (`wayGeo`, `ribbon`, `wayPiece`:
   by slot — asphalt, lines, paint, slabs, trail, walk, banks), the main thread's `ways()` and the workers both
   making it with the one code; **the land's own workers** make a district's pieces (`land-block.worker.ts`: their
   chunks warm, the edits and the park's layout told them already), `LandPool.askPieces` / `pieces`, the stream
   asking the nearest not in hand (3 in a worker's hand with the land's blocks) and handing what's back to its
   district (`takePiece`); a piece still with a worker isn't ready (`pick` skips it), the district's other steps go
   on; with no workers, made here as before. The main thread only makes the meshes (`placePiece`: its arrays taken
   as they are). And: a district's long road dressing only in the pieces the road passes (256 a district were
   queued, ~20 had anything); Lowest/Potato's one frame in three only when there's nothing to make; the steps a
   share of the budget (1.5 ms, Potato 0.75) whatever the land took. Two of Next's client build's `typeof window`
   ("object" there, so a worker's import threw) now asked of `globalThis` (`wx3d.ts`, `roads3d.ts`). The main
   thread keeps 23 land chunks where it kept 222. CPU 4×:

   | | Phase 2 | Now |
   |---|---|---|
   | Arriving 7 km out: every district in · Potato | never (5,671 steps left at 40 s) | **19 s** |
   | · High | 27 s | **14 s** |
   | Arriving in town: every district in · Potato · High | 20 s · 8 s | **5 s · 5 s** |
   | Driving at 240 km/h: dirt under you | 0 · 0 | 0 · 0 |
   | Driving: fps (Potato · High) | 25 · 17 | 18 · 16 |

   Potato draws fewer frames while it's building (every frame now, not one in three); left: the land's own block
   placing on the main thread (`computeVertexNormals` — its covered cells are the main thread's to know) and the
   far land's rings made again after a long jump (~3 s of a slowed main thread: `far3d.ts`).
4. **Nothing for good** (F4a) — the rest's circle and the Kart Park cut into districts like the rest (512 m squares,
   made near, freed far, with hysteresis: made within 900 m, freed past 1,300 m as now); the office and buildings
   inside as a district's; what's kept a while after you leave (a few minutes, under the memory's cap) so coming
   back is instant. The loading screen waits for the districts within 200 m (as now).
   Done 2026-11-15 — not cut into districts (each of the rest's builders — the lot, the town, the farm, the park —
   would have to cut itself to a square): **the rest and the Kart Park parked** (`grounds-stream.ts parkFar`):
   after `AWAY_MS` (2 min) past `DISTRICT_GONE` (1.3 km) of the rest's circle or the park (its middle, 260 m), all
   of it freed and a new one queued, nothing made (its steps not taken, not counted by the loading screen); made
   again, by the same steps, once you're within `DISTRICT_R` (900 m) of it. Entering out there (nothing made yet):
   parked at once — the town not made behind the loading screen for someone on the long road's far end. God mode's
   remake finished first. The probe (High): the town and the park standing 476 + 1,944 meshes; 13 km out after
   2 min both parked, **the heap −80 MB, −113 textures**; back in town all made again in under 5 s (a teleport —
   driving, they're made from 900 m out).
   **Left (the user, 2026-11-15): the town by district.** Parked whole, the town is one piece — it goes and comes
   all at once. Fine for today's one town; **not for a giant map with many**: new towns are to be made by district
   from the start (their builders cut to a square, as the ways' pieces are — `way-piece.ts`), and today's town
   moved to districts one day (the lot, the streets, the farm, the square, the park each made a piece at a time).
5. **The memory: copies freed, caches capped** — after the GPU has it, no CPU copy: compressed textures' images,
   morph textures' arrays, the light volume's second copy (one, `Data3DTexture`'s own); file buffers dropped once
   parsed; **caches with a ceiling, the least lately used out**: the wardrobe's garments (refcounted, as plan 90's
   outfits), the cars' full models and plates, sign canvases, tree pools by distance. Measured by phase 0's census.
   Done 2026-11-15 — measured first (High, the town, the lot, the woods; every canvas made traced to its maker,
   held weakly): the wardrobe's garments are **19 MB** (not phase 0's guess of 160 — that was the floors below);
   canvases 310 MB live, **174 MB of it the floors' bakes** (`FloorBake.drawPlan`, ~3 MB a chunk, 56 of them),
   34 MB the parked cars' dashboards; and **206 MB of geometry in the four floors held off the scene** (built,
   not drawn: the ones above mine, plan 89 F5a). A CPU copy can't just be dropped (a GPU reset uploads from it:
   plan 72's heap pass) — so each went where it's made again:
   - **A floor's bake let go once on the GPU** (`build.ts`: its canvas a pixel after upload); a GPU reset bakes
     every floor again, the held ones too (`World3.live`, `rebakeAll` — the view's handler baked only mine).
   - **One parked dashboard for every car** (`sedan.ts parkedDash`: the cluster and the radio every car drew when
     made, the same for all); a car's own canvases a pixel till it shows something of its own.
   - **The floors held off the scene let go** when I've been 400 m from them 2 min (`view.ts letFloorsGo`), built
     again by the warm-up from 300 m.
   After (High, the same walk): canvases **310 → 118 MB**; the GPU process **1,673 → 1,395 MB**; 13 km out after
   2 min, the floors 5 → 1 (the GPU's geometries 4,133 → 2,102), back in under 5 s. Left: the KTX2 textures' CPU
   copies (~31 MB — a GPU reset needs them, and they'd have to be fetched again), the facades' and signs' canvases
   (~30 MB, shared already), the light volume (its array is the texture's own — no second copy of ours).
6. **Reach by tier and memory** — the land's radius, the districts' reach, the caches' ceilings, the workers'
   count by the tier (Potato and Lowest nearer, the fog closer to hide it) and the device's memory
   (`navigator.deviceMemory`); the server told nothing of it (it's the client's view only). Same pixels on High,
   Medium and Low within the fog's reach.
   Done 2026-11-15 — `tp/reach.ts`: `REACH` by tier — High, Medium, Low the land 440 m and the districts 900 m as
   they were (the same pixels); **Lowest the districts 700; Potato the land 330, the districts 600**; 4 GB or less
   (`navigator.deviceMemory`), the districts no further than Lowest's; a district freed 400 m past its reach
   (`GONE_PAST`), the town and the park parked past it too. The stream's `setReach` (from `Warmup.setQuality`, so
   Auto's steps too); the far land's hole and its trees follow the near land's reach (`far3d.ts setNear`: its rings
   made again). The main thread's land chunks kept 750 at 4 GB or less (1,500). The fog isn't brought in: with the
   long road the air sees kilometres, and the far land's there past the near land (a still on Potato 2 km out: the
   road on to the horizon, no seam). `reach.test.ts`. CPU 4×, Potato: driving at 240 km/h the land at most 23
   blocks behind (153), fps 23 (18); arriving 7 km out every district in 17 s (19); High as before.
7. **Built for a bigger map** (F2b) — what reads the whole map each frame made to read only what's near: the land's
   regions and the districts' grid looked up by cell, not looped; the server's land chunks freed by distance from
   every player (it keeps 4,000 now). **The chunk keys widened** past ±2,048 chunks (client `grounds.ts chunkKey`,
   server `land.ts key`, anything else packing a cell in a number: a string or a 2×32-bit key, the land's lookups
   timed before and after). **A floating origin**: the scene's root shifted under you every ~2 km (the camera, the
   people, the cars, the land's blocks, the districts, the lights' and shadows' cameras, the shaders' world-space
   uniforms — snow, fog, wind, the light volume — and Jolt's bodies on the client), so what the GPU draws stays near
   0,0; the server and the shared code keep world coordinates in doubles, the shift only the client's view. A test
   lays a 200 km road (a fake region) and checks that what's made and kept depends on where you are, not the map's
   size, and stills at 150 km match those at the town (no jitter: a person, a car, the asphalt's lines).
   Done 2026-11-15 — measured what a far place actually loses before building anything: three works out each
   object's place from the camera in doubles on the CPU (`modelViewMatrix`), so what's placed as an object — people,
   cars, the land's blocks — draws as well 1,000 km out as in town; what doesn't is **geometry made in the world's
   own coordinates** (a float has 1.6 cm at 150 km, 6 cm at 1,000) and **the physics** (Jolt in single precision:
   a walk's 2.3 cm steps came out as 0 or 1.6 cm at 150 km — a jerk every frame — on the client and the server
   alike). So, not a scene shifted under you (every system's coordinates, the server's too, for what two things
   already do):
   - **Jolt in double precision** (`packages/jolt/build.sh`: `DOUBLE_PRECISION=ON`; +16 KB gzip): every position
     a double, client and server — the wrapper (`physics/world.ts`) already passed positions as `RVec3`; nothing
     else talks to Jolt directly (the sway, the ragdoll through the wrapper). `physics/far.test.ts`: a character
     20 m, 150 km and 1,000 km out placed and read back to 0.1 mm, a walk's steps kept, the ground found under
     it — red on the single-precision build at 150 and 1,000 km, green now. Shared 670 tests, the client's 367,
     the server's physics, long road, lifts and cars green.
   - **The road pieces made from their corner** (`way-piece.ts wayPiece`: worked out in doubles, the corner taken
     off before they're made floats; `placePiece` puts the mesh there). (The rest's circle is round the town, by
     0,0.)
   - **The packed cell keys widened** (`shared/cellkey.ts`: ±2^20 cells each way — ±33,000 km at 32 m): the land's
     chunks (client and server), the ways' sample index (`grounds.ts cellKey` — it collided past ±2,048 cells
     already), the long road's buckets, the cars' static solids.
   Not done (not needed for this: a far point in the shaders' world space is a few cm off at 1,000 km — the snow's
   noise, the fog's); the land's regions and ways looped whole (a handful today — a spatial index when there are
   hundreds). A 200 km fake road, and stills there, not made: the precision test says it in numbers. The budget's
   two overs (/page 483.5, steps 14.7 KB) were there before plan 91 (the same in a build of `cbc63c89`).
8. **Checks** — the bench against phase 0 and the targets; the stills; the specs near the streaming
   (`loading`, `car`, `godmode-land`, `godmode-roads`, the world-server's `long-road.test.ts`) and the known reds; the gap
   written here.
   Done 2026-11-15 (a prod build; the CPU 4× where it says; `e2e/stream.mts`):
   - **The asphalt under you within 10 s of arriving anywhere, Potato at CPU 4×: met** — 2–3 s (7–8 at phase 0).
   - **Driving at 240 km/h, CPU 4×, no dirt road in view past the first 10 s: met** — 0 s of 29 on Potato and High
     (25 and 6 at phase 0).
   - **No build queue grows without end: met** — made and waiting at most 63, capped at 256 (4,858 and growing
     before the road fix); a silent or dying worker replaced (`land-pool.test.ts`).
   - **Flat over a round trip: met** — the soak (High, 7 km out and back at 240 km/h): the heap 713 MB at the start,
     542 out there, 522 back (the town and the floors let go out there, made again as they're needed).
   - **The JS heap ≤ 500 MB on High after driving: not quite** — 522–542 out on the road; 733 in town with all of
     it about (710 at phase 0: more people in the world that day). **≤ 350 MB on Low/Potato: not met** — 735 in
     town. What's left is what's drawn there (the scene's geometry ~250 MB) and the code; a next pass would be the
     people's and the cars' own (each a model of its own) and the KTX2 copies.
   - **The tab ≤ 2 GB on High, ≤ 1.2 on Low/Potato: not shown** — the memory dump's sums count the GPU's shared
     surfaces twice (the GPU process read 2.0–2.9 GB summed, its `gpu` allocator 1,395 MB on High after phase 5,
     1,673 at phase 0); the friends' reports will say.
   - **Same pixels where you stand**: by construction — the reach on High/Medium/Low as it was, the parked
     dashboard the same picture, the floors' bakes the same until a GPU reset bakes them again, the road pieces
     where they were; stills looked at, no A/B.
   - Specs (`YUTOPIA_GPU=1`, the prod build): `loading`, `godmode-roads`, `car` green but its known-flaky "under a
     flier"; `godmode-land` red — the worst frame while the brush is held 150–200 ms (< 50 asked) — **and as red on
     a build of `cbc63c89`, before plan 91** (167, 200 ms). Unit: shared 670, client 367, the server's physics,
     long road, lifts, cars green.
9. **The graphics settings, a game's** (added 2026-11-15, the user: "everything customizable, like a game") — the
   tiers (Potato … High) become **presets**: picking one sets every setting below; each setting can then be changed
   on its own, and the preset reads **Custom**. Auto picks a preset as now (by the GPU, the 1-s test, stepping
   down/up); once one setting is changed by hand, Auto stops (as a tier picked by hand now) — "Reset to preset" puts
   it back. Each setting stored alone in the prefs (`lib/prefs.ts`: a `graphics` record; today's `quality` read as
   its preset), sent with the perf reports (plan 90's `detail`), applied live where it can be (`Warmup.toQuality`'s
   compile-first path, one setting at a time) and marked "on restart" where not (antialiasing: the view's for good).
   What a tier fixes today, each its own setting (today's values the presets'):

   | Setting | Values | Today (High · Medium · Low · Lowest · Potato) |
   |---|---|---|
   | **Resolution** (render scale, % of the screen) | 50–200%, in 5% steps, + the screen's own size shown | 200 · 150 · 100 · 75 · 50 (capped by the screen's dpr) |
   | Antialiasing | off · on (MSAA) | on · on · on · off · off |
   | **Draw distance: land** | 220 · 330 · 440 · 660 m | 440 all (phase 6: by tier) |
   | **Draw distance: buildings and roads** (districts) | 500 · 700 · 900 · 1,200 m | 900 all |
   | Far land (the horizon) | off · near · far · farthest | farthest · far · far · near · near |
   | Far trees | off · 1,200 · 1,800 m | 1,800 · 1,200 · off · off · off |
   | Sun shadows | off · 1024 · 2048 · 4096 | 2048 · 1024 · off · off · off |
   | Flashlight and headlamp shadows | off · on | on · off · off · off · off |
   | Lamps lit (point lights) | 0 · 2 · 3 · 6 · 10 | 10 · 6 · 3 · 2 · 0 |
   | Ambient occlusion (GTAO) | off · on | on · off · off · off · off |
   | Bloom | off · on | on · off · off · off · off |
   | Colour grade and vignette | off · on | on · on · off · off · off |
   | Film grain | off · on | on · off · off · off · off |
   | Fog banks | off · on | on · off · off · off · off |
   | Rain and snow density | low · medium · high | high · medium · medium · low · low |
   | Car mirror | off · low · high | high · low · off · off · off |
   | People's detail | low (no nearest level, blob shadow) · high | high · high · low · low · low |
   | Max fps (as now) | 30 · 60 · 120 · unlimited | 60 |

   **The Settings panel** (the manuscript-in-wood look, plan 45): Graphics with the preset on top, the settings
   grouped below (Display: resolution, antialiasing, fps · Distance · Light and shadow · Effects · World), each with
   a line on what it costs (the GPU, the CPU, memory) and the frame's numbers (fps, the frame's ms) beside it, so
   one can see a change land. The draw distances tied to phase 6's limits (a distance past what the device's memory
   holds is shown and capped, said why), the fog drawn in to hide the edge at short ones. Unit tests: each preset's
   values equal today's tier (same pixels: the A/B stills of plan 89 on each preset), a custom set stored and read
   back, Auto stopping on a hand change; `loading`, the Settings panel's spec.

   Done 2026-11-15 — `lib/graphics.ts`: `Graphics` (17 settings), `presetOf(tier)` — each the tier's own, the
   resolution exactly its pixels (`ratioOf`: to a thousandth, Lowest's 0.75 on a 2× screen is 37.5%, not 38) —,
   `prefs().graphics` only what's set by hand (`cleanGraphics`: what's known and in range), `graphicsFor(tier)` the
   two laid together, `gfxNow()` what the world draws with now (set by `Warmup.setQuality`). What decided by the
   tier now reads its setting: the pixels (`view.ratioNow`), antialiasing (the view's making), the sun's shadow and
   its map, the torch's and headlamps' shadows, the lamps (and the Grounds' lamp pool by them), the post — its
   passes each a flag (`Post3` `PostFlags`: bloom, grain, AO; the finish the chain itself) —, the far land's rings
   and its trees (`far3d.setQuality(horizon, farTrees)`), the reach, the fog banks, the rain's and snow's density,
   the car's mirror, people's nearest level and blob (and the hands'). What stays the tier's: Lowest's streaming
   cadence and the lazy matrices (the CPU's, not a look). **Settings → Graphics**: the preset on top (Custom once a
   setting differs, "Back to the preset"); Display (resolution 25–200 %, antialiasing, the frame rate), Distance
   (land 220–660 m, roads 500–1,200, horizon, distant trees), Light and shadow (sun shadows Off/Medium/High/Ultra,
   torch and headlamp shadows, lamps 0–10), Effects (the colour finish and, under it, AO, glow, grain), World (fog
   banks, rain and snow, the car's mirror, people's detail) — each with a line on what it costs; the fps beside.
   Nothing's applied as it's picked: an **Apply** bar (and Cancel) at the page's foot once something's changed. A
   setting changed on Auto keeps Auto's tier as the preset (Auto stops, as a tier picked by hand). Checked live
   (High; sun shadows to Ultra, the glow off, applied): the sun's map 4,096, the post's bloom off, stored as two
   settings over High. `graphics.test.ts`: each preset what its tier drew, the pixels exact on 1–3× screens.
10. **Changing them without the stall** (added 2026-11-15, the user: "today you feel monstrous stalls when you
    switch" — with many settings, nothing applied as it's picked: an **Apply** button shows once something's
    changed, and the change is masked or solved). What's there: `Warmup.toQuality` compiles the new tier's shaders a
    few a frame against stand-in lights before switching (plan 50) — but only one of each kind of visible thing, not
    the shadow pass's depth materials, nor the post chain (`Post3` made new: GTAO's, bloom's, the finish's shaders,
    their render targets), the shadow maps' first allocation and drawing, the far land's rings made again in one go
    (`far3d.setQuality`), people's nearest level built when it comes in, the render targets resized at the new
    resolution. Each setting applied alone would pay that again for each.
    - **Measured first**: a Chrome trace of each switch (High↔Low, Low↔Potato, shadows on, AO on, the resolution
      100→150%), its long frames by cause, written here.
    - **Solved where it can be — the switch made ahead, behind the picture**: every setting changed applied as one
      transition (one compile, one resize); the new state's shaders compiled with the real lights and the real
      shadow, depth and post variants (`compileAsync` with `KHR_parallel_shader_compile`, into an offscreen target at
      the new resolution), the post chain and its targets made and drawn once offscreen, the shadow maps allocated
      and drawn, the far land's rings and people's levels built a few a frame — only then swapped in, in one frame
      that has nothing left to do.
    - **Masked where it can't — "the photograph"**: on Apply, the frame on screen is copied into a still (a GPU copy,
      no readback: `toDataURL` waits on the GPU 20–90 ms), laid over the game as an image whose only motion
      is the compositor's (CSS transform and opacity: it keeps moving even when the main thread is stuck in a
      compile), a soft "developing" on it, the Settings panel still there. The switch happens behind it; once the
      new frames are steady (a few in a row under the frame's budget), **a wipe sweeps across the screen from the
      old picture to the new** — the player sees the change land, the before beside the after, no stutter seen.
    - **Then "Keep these settings?"** — as a game's display settings: a 15 s countdown with the fps before and after
      ("48 → 61 fps"), and **hold to compare** (the old still shown while a key is held); not confirmed, or the new
      settings under 20 fps, back to the old ones by the same transition.
    - Checks: the trace's long frames on each switch before and after (target: no frame over 100 ms seen — under the
      still is free; the swap frame ≤ 33 ms), the wipe and the revert on the proxy (an M1's, CPU throttled) and on
      High; `loading` and the Settings spec green.

    Done 2026-11-15 — **measured first** (High, the lot; each switch as the page applies it, then the panel
    closed): High → Low a **1.2 s** frame, sun shadows back on **2.2 s**, High → Potato 133 ms — none while the panel
    was open (nothing under it drawn: the bill came at the first frame after). A profile: the first draw making and
    linking every program the new state needs (`getProgramInfoLog` 1.1 s of it). And why the compile ahead hadn't
    caught them: **81 programs** the first frames made that it hadn't — the cars' headlamps' shadows (and the
    like) follow the settings in the game's own frame, after it, so it compiled for a spot light with a shadow that
    was gone by the draw (`numSpotLightShadows`, the shadow map's flag in the programs' keys). So:
    - **"The photograph"** (`tp/still-switch.ts`): Apply closes the panel; the frame's copied into a still right
      after it's rendered (drawn into a 2D canvas: a copy on the GPU, no readback) and laid over the 3D view,
      "developing" — a warm wash breathing over it — moving on the compositor only (opacity, transform: it goes on
      while the main thread's busy). Nothing under it is drawn (`view.holdDraw`; the game's frame runs).
    - **The switch behind it** (`Warmup.switchBehind`): the settings put in at once; two of the game's frames, not
      drawn, so everything that reads them each frame is on them; then **one of each kind of thing compiled, 4 ms of
      it a frame, with the scene's real lights, into what the frame draws to**, each lot linked in parallel
      (`compileAsync`) — the first draw makes **0** programs (81 before), and no frame holds them all (the whole
      scene's compile at once was a 370 ms frame).
    - Then **steady** (`view.steady`: 8 drawn frames each under 50 ms), and **the wipe**: the old picture slides off
      to the right — a line of light on its edge — the new one under it, 0.7 s.
    - **"Keep these settings?"** (`components/hud/GfxConfirm.tsx`, `lib/gfx-switch.ts`): the fps before → after
      (averaged from its second second), a 15 s bar, **Compare** held (or C) shows the photograph again, **Keep**
      (Enter), **Put back** (Esc); not kept, or under 20 fps three seconds running, put back by the same switch.
    After (the same walk, the same switches; the worst frame from Apply to the dialog):

    | Switch | Before | After |
    |---|---|---|
    | High → Low | 1,200 ms | **67** |
    | Low → High | 17–383 | 33 |
    | High → Potato | 133–5,267 | **50** |
    | Potato → High | 17–33 | 33 |
    | Sun shadows off | 50–2,050 | **67** |
    | Sun shadows on | 17–2,217 | **17** |
    | AO off / on | 17 | 17 |

    No frame over 100 ms on any switch (the target); the switch itself 2.3–4.4 s, under the photograph. Checked: a
    switch put back (Low applied, compared, put back: High again, the photograph gone); `loading` green; the
    client's 369 unit tests.

Not now: a disk cache of our own (the browser's HTTP cache has the files); the renderer in a worker; WebGPU.
