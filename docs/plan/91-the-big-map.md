# 91 — The big map: loaded by where you are

Ask (2026-11-15, the user, testing plan 90): look at how the world is loaded — what, how well, how in real time.
(1) the tab at ~3 GB of RAM on its own: is it done the right way? (2) Rafael (a 16 GB PC): leaving the town for the
long road, the asphalt never came — a dirt road, "as if something had locked up", not even after a while. "Remember
this game will have a gigantic map: we have to be smart about how we load things."

**The rule, as plans 89–90's: the same game — the same look, the same world — only loaded smarter.** What's near
you as it is now; what's far, made and freed by distance; nothing built "for good".

Status: **planned 2026-11-15; forks decided by the user 2026-11-15**: **F1a** the road fix committed and deployed
ahead of the plan; **F2b** a map past ±60 km — the chunk keys widened and a floating origin built now; **F3a** the
districts made in workers; **F4a** nothing built for good, the town too. The road bug (phase 1) found and fixed in
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
1. **The road fix, and workers that can't lock it up** — (found 2026-11-15, uncommitted) a block made and waiting
   isn't asked again (`land-pool.ts ask`); one built isn't placed again (`grounds-stream.ts`). And: an ask not
   answered in 5 s asked again of another worker; a worker that errs replaced, not all of them ended; the made queue
   capped (the furthest dropped, asked again when wanted). `land-pool.test.ts` with fake workers: a slow placer, a
   silent worker, a dying one — the land all in.
2. **One build lane, by priority** — the land, the districts, the rest's steps and the cars' models in one queue a
   frame, shared out by what you'd see first: **the ground under you and the road ahead** (asphalt, its land),
   then the land round you, then what stands (buildings, lamps, props), then what's far; going fast, what's ahead
   first (as the land's `LOOK_S` now). No lane waits for another to finish its frame: each gets its share of the
   budget. The asphalt with the land it lies on — a road block never shown as dirt while its land is.
3. **The districts in workers** (F3a) — a district's pieces (the ways' ribbons, the ground's props, the buildings'
   shells) made as data in the land's workers (the same shared code: `Grounds3`'s builders moved to plain arrays),
   the main thread making only meshes from them, a few a frame, as the land's blocks.
4. **Nothing for good** (F4a) — the rest's circle and the Kart Park cut into districts like the rest (512 m squares,
   made near, freed far, with hysteresis: made within 900 m, freed past 1,300 m as now); the office and buildings
   inside as a district's; what's kept a while after you leave (a few minutes, under the memory's cap) so coming
   back is instant. The loading screen waits for the districts within 200 m (as now).
5. **The memory: copies freed, caches capped** — after the GPU has it, no CPU copy: compressed textures' images,
   morph textures' arrays, the light volume's second copy (one, `Data3DTexture`'s own); file buffers dropped once
   parsed; **caches with a ceiling, the least lately used out**: the wardrobe's garments (refcounted, as plan 90's
   outfits), the cars' full models and plates, sign canvases, tree pools by distance. Measured by phase 0's census.
6. **Reach by tier and memory** — the land's radius, the districts' reach, the caches' ceilings, the workers'
   count by the tier (Potato and Lowest nearer, the fog closer to hide it) and the device's memory
   (`navigator.deviceMemory`); the server told nothing of it (it's the client's view only). Same pixels on High,
   Medium and Low within the fog's reach.
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
8. **Checks** — the bench against phase 0 and the targets; the stills; the specs near the streaming
   (`loading`, `car`, `godmode-land`, `godmode-roads`, the world-server's `long-road.test.ts`) and the known reds; the gap
   written here.

Not now: a disk cache of our own (the browser's HTTP cache has the files); the renderer in a worker; WebGPU.
