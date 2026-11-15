# 89 — The weight: the same game, lighter

Ask (2026-11-14, the user): friends on the prod server report low frame rates, long loads and stutters; on this
M4 Pro (48 GB) High works the machine hard; a friend's **Mac M1 with 16 GB only manages Low**; the tab here climbs to
3–4 GB after a long play. "The game doesn't have the look or the complexity to be this heavy." Investigate first
(no changes), then plan. **The rule: the game stays exactly the same — same look, same mechanics — only lighter.**

Status: **investigated 2026-11-14 (read-only); planned 2026-11-14; forks decided by the user 2026-11-14**: **F1b**
pixel-identical throughout, plus phase 9's invisible-detail cuts each signed off with stills side by side; **F2c**
Auto starts on Medium and **steps up to High during play** when there's room (asked after: up mid-game, not only
behind the loading screen), down as before, every tier warmed; **F3b** the adaptive buffer; **F4a** versioned URLs +
`immutable` + a Cloudflare cache rule (the user sets the rule); **F5a** the floors' held copy kept, shrunk by phase 2. **Phase 0 (the bench, the baseline) done 2026-11-14. Phase 1 (lights that are off) done 2026-11-14; F6a: the torches left as they are. Phase 2 (by index) tried and reverted 2026-11-15: −135 MB, no fps, +0.3 s load. Phase 3 (painted once) done 2026-11-15: GPU −213 MB, canvas −67 MB, load the same. Phase 4 (outside out of sight) done 2026-11-15: M1 proxy +8–23%; sealing the land left (unsafe without declaring every mover). Phase 5 (loading) done 2026-11-15: files cached by version (revalidations 137–180 → 2), people in before the screen goes (no compiles in play; a first visit +2 s, kept).**

## What was measured (2026-11-14)

All on this M4 Pro, headless Chromium on Metal, the dev stack (`next dev`), the dev world, as Bia, at noon, 1440×900
CSS px on a 2× screen. "Live" = the real loop with no frame cap and no vsync (`--disable-gpu-vsync
--disable-frame-rate-limit`, maxFps 0). **`gl.finish` stepped frames and timer queries lie under ANGLE Metal** (the
GPU didn't show; a fullscreen pass read 22 ms) — only live uncapped fps A/B in one page told the truth.

### Frames

| Live fps | Studio (floor 4) | Lot (outdoors) |
|---|---|---|
| High 2× (2880×1800), as is | **36–40** | **40** |
| … the lights at intensity 0 hidden | 57 | 62 |
| … ratio 1 | 80 | 76 |
| … no GTAO | 47 | 48 |
| … no sun shadow | 45 | 45 |
| … no Grounds | 73 | 75 |
| … everything MeshBasic (to measure only) | 124 | 129 |
| Medium (1.5×) / Low (1×), as is | 81 / 156 | 80 / 116 |
| **Low, CPU throttled 2.5× (an M1's proxy)** | **52** | **46** |
| … the lights at 0 hidden | 59 | 51 |
| … no kart circuit | 60 | 51 |
| … no Grounds | 73 | 62 |

- **High is GPU-bound on the pixels' shading**: 9–17 lights at intensity 0 are in every lit shader's loop — the
  pool's points and **two torch spots with `castShadow` sampled with PCF while off** (their maps' redraw isn't the
  cost; the per-pixel loop is). They're kept so the programs never change (no recompile when a torch or a lamp comes
  on; and memory note `three-shadow-light-no-map`: a shadow light never drawn broke every lit draw).
- **Low on an M1 is CPU-bound** (main thread 17–20 ms): three's scene walk + draw submission 35–40%
  (`projectObject`, `renderBufferDirect`, uniforms), `lazyMatrices` 10–13% (it still visits every one of ~7,000
  objects), the Grounds' per-frame queries ~10% (`heightAt`, `terrainAt`, `nearLines`, `waterSide`), `below-cull`
  ~7% indoors. 450–870 draws, 240–395 programs.
- **The Grounds draw even from floor 4**: 2.8M of the frame's 4.75M triangles, 237 of its draws. The far trees are
  22,691 instances in one InstancedMesh (590k tris, never culled); the kart circuit is 1,944 meshes walked every frame
  with none in view (481k tris); 263 near instanced meshes (2M tris).
- **High doesn't use `lazyMatrices`** (Low does: `tp/parts/culling.ts:155`): ~7,000 `updateMatrixWorld` a frame, the
  same matrices.
- `makeChunk` (a land chunk: 30–50 ms by the river) still runs while standing still, ~6 ms a second.

### Density (why there's so much)

- **The windows**: `lifeWindow` (`world/look/life-kit.ts:591`) is 7 `rbox` pieces — three's `RoundedBoxGeometry`,
  **non-indexed**, (2·seg+1)² quads a face — **3,648 triangles a window** × 174 windows ≈ 635k triangles; the empty
  floors 1–3 are 179k triangles each, almost all windows. `rbox`/`RoundedBoxGeometry` is used in 109 places; lathes
  and cylinders at 32–40 segments, curtains 48×24.
- **Every floor is held twice** (`tp/build.ts:226`): its pieces wait in `held` (for fading) and the merged copy is
  drawn — floor 4: 928k triangles, ~260 MB of geometry in all; the floors together ~260 MB of the ~512 MB of typed
  arrays reachable from the game. **Corrected in phase 2:** the held pieces' arrays are views of the merged ones
  (`share`, plan 72 phase 13) — held once; the ~260 MB counted each view as its own. What is so: all of it was
  non-indexed, every triangle its own three corners.
- **Copies**: 2,938 geometries identical to another (60 MB); 1,934 materials for 919 distinct looks.
- **Painted textures**: 526 canvas-backed textures (181 MB of pixels, kept as canvases after upload, again on the
  GPU with mips); ~380 look like identical copies (same size and pixels — e.g. 38× one 512×256): the same texture
  painted again per object, on the main thread.

### Memory (the 3–4 GB)

- `e2e/memcheck.mts`, 4 cycles (High, dev): the renderer process plateaus at **3.1–3.2 GB, peaks 3.5 GB**; JS heap
  1.11 → 1.17 GB — no real leak, a high floor. Memory-infra dump of the tab: array buffers 732 MB, Blink buffers
  604 MB (part of it `next dev`'s ~276 MB of module sources), canvas 364 MB, V8 246 MB, malloc 239 MB. **The GPU
  process: ~2.1 GB** more (unified memory on a Mac: it counts on a 16 GB M1 too).
- memcheck went **OVER on the world-server's RSS** (467 → 736 MB over 4 cycles, creeping). The test bots log
  colyseus.js `"refId" not found` (the bots only).

### Loading (a subagent's read, spot-checked)

- **Nothing in `public/` is cached**: `next start` sends `Cache-Control: public, max-age=0`, Cloudflare doesn't cache
  `.glb`/`.ktx2`/`.wasm` — every visit pulls or revalidates every body, garment, material and decoder through the
  tunnel (the server's upload). `/_next/static` is already immutable.
- **The top bar's portrait loads both bodies** (`world/chars/picture.ts:123`: man and woman, ~6 MB) on its own second
  WebGL renderer: people's shaders and textures compiled and uploaded twice; the material library queues per
  renderer (`world/look/life-matlib.ts:63`).
- **People load in a chain**: chars chunk → life-people → loaders → the body (3 MB) → only then its garments (their
  list is inside the body's file); a person shows when all of them are in.
- **The loading screen doesn't wait for people**: its people check reads `charF.pending` (`tp/parts/warmup.ts:106`),
  always 0 in the life look; a 15 s cap (`ctl/loading.ts:62`). People then come in during play and **compile their
  shaders synchronously on first draw** (`LifeLook` never goes through `compileAsync`; guns, land and karts do).
- Jolt is the biggest chunk (1 MB gzip, its wasm inlined as a string), loaded late in a chain; the KTX2 transcoder is
  fetched from `public/` though a hashed copy is built.

### Network (a subagent's read)

- Bandwidth is trivial (~1.3 KB/s a client + 0.22 KB/s a moving player); the tick 1.5–1.8 ms.
- **Others stutter over a tunnel**: drawn 110 ms behind (`ctl/common.ts:52`) with 20 Hz patches; dry, extrapolated
  ≤150 ms then frozen, then a snap; the clock offset climbs 2 ms/s (a latency step takes ~50 s to absorb); NPCs and
  pets stamped with arrival time, not the server's. My own moves never wait.
- Every player already sends a 30 s performance report to the API (`features/perf.ts`: frame percentiles, stages,
  ping, snaps) — **prod's own reports would show the friends' real numbers**.

### Quality tiers

- **Auto picks High for any desktop with more than 4 cores** (`lib/prefs.ts:43`), whatever the GPU — an M1 starts on
  High, steps down only after ~6 s under 40 fps, one tier at a time, each step recompiling.
- Low already drops the sun's shadow, the post (GTAO, bloom, finish), the torch's shadow, keeps 3 lamps, ratio 1.

## Targets

Measured the same way as above, on a **prod build** (`NEXT_DIST_DIR`, `next start`), against today's numbers taken
on that same build in phase 0:

- **An M1's proxy on Low** (CPU 2.5×): ≥ 60 fps in the studio and the lot, no frame over 50 ms while walking.
- **High 2× on this M4 Pro**: ≥ 60 fps live in the studio and the lot.
- **Memory**: the tab ≤ 2 GB on Low after memcheck's cycles; the GPU process down by a third; the world-server's RSS
  flat.
- **Loading**: a second visit downloads no asset again (all 304-free: immutable); a cold load over a throttled link
  (20 Mbps, 60 ms) faster by a measured margin; no shader compiled in play when someone comes in.
- **Same pixels**: A/B stills of every phase 0 px apart (beyond the noise floor of a same-code pair — memory
  [[dev-shots-capture]]), unless a fork says otherwise.

## Forks

| # | Question | Options | Recommended |
|---|---|---|---|
| F1 | How strict is "the same" | **a)** pixel-identical only (A/B stills 0 px); fewer segments in bevels and lathes never · **b)** a) for everything, plus one phase at the end that lowers detail no one can see (rbox/lathe segments, the far trees' LOD) — shown first as stills side by side, each change signed off · **c)** b) without stills | **b** |
| F2 | Auto's first tier | **a)** as now (High on any desktop > 4 cores) · **b)** a short measurement behind the loading screen picks the first tier (the GPU's own frame time), and every tier's programs warmed so a step down never hitches · **c)** start on Medium, step up | **b** |
| F3 | Others' smoothing | **a)** as now (110 ms) · **b)** a buffer that follows the measured jitter (110–250 ms), the server's time on NPCs and pets, the clock offset recovering fast | **b** |
| F4 | Asset caching | **a)** versioned URLs (the commit or a content hash) + `immutable` headers + a Cloudflare cache rule — the rule set by the user at Cloudflare · **b)** headers only, no Cloudflare | **a** |
| F5 | The floors' second copy (`held`) — moot: phase 2 found the held pieces are views of the merged arrays, held once | **a)** kept; shared and indexed geometry shrinks both copies · **b)** the held pieces rebuilt from their source when a fade needs them, not kept | **a** |
| F6 | The flashlights while off (found in phase 1: +15–26% on High still there) | **a)** as now — their light skipped, their coordinates still worked out in every vertex · **b)** an off torch out of the programs (visible = false), and the programs for each torch state compiled ahead behind the loading screen, so a torch coming on swaps programs without compiling — more programs and a longer load · **c)** their coordinates worked out in the fragment, only when on — no varyings, no more programs, but not bit-exact (the same maths in another order: the odd pixel at a shadow's edge) | **a** (the user, 2026-11-14) |

## Phases

Each phase: measured before and after on the phase 0 bench, its A/B stills at 0 px, committed on its own.

0. **The bench** — one script (`e2e/weight.mts`, built from this investigation's probes): a prod build; live
   uncapped fps at High 2× and at Low with the CPU at 2.5×, in the studio, the lot and the lawn; the main thread's
   stages; the renderer's and the GPU process's memory (memory-infra) after memcheck-style cycles; a cold and a warm
   load over a throttled link (requests, bytes, time to ready, shaders compiled after ready); the A/B stills
   harness. Today's numbers written here first. **Asked of the user**: prod's own perf reports (the friends' fps,
   stages, ping, GPU strings), read on the server.
   Done in phase 0 (2026-11-14) — `apps/client/e2e/weight.mts` (`frames`, `memory`, `load`, `stills <name>`,
   `diff <a> <b>`, `all`; its header has the knobs). Served from a prod build: `NEXT_DIST_DIR=.next-prod pnpm build`,
   then `next start -p 3107` (`.claude/launch.json` `client-prod-3107`). **The baseline, HEAD 3bcb97d1:**

   | Live fps, uncapped (two runs) | Studio still / walking | Lot still / walking | Lawn still / walking |
   |---|---|---|---|
   | High 2× (2880×1800) | 46–48 / 46–49 | 53–54 / 52–54 | 49–53 / 46–49 |
   | Low, CPU 2.5× (an M1's proxy) | **44–48 / 41–45** | **34–41 / 36–38** | 57–59 / 52–54 |
   | Low M1: frames over 50 ms in 4 s, worst | 2–4, 56–71 ms | 1–6, 60–184 ms | 0–2, 48–56 ms |
   | Main thread (ms, med) High / Low M1 | 20–21 / 18–22 | 18 / 23–26 | 18–20 / 15–17 |
   | Draws / triangles High · Low | 751–762 / 4.5–4.6M · 588–622 / 2.5M | 862–868 / 4.0M · 833–893 / 2.2M | 1,349–1,698 / 5.1–5.2M · 377–402 / 3.4M |
   | Programs High · Low | 320–351 · 248–258 | 324–350 · 246–256 | 337–351 · 256–257 |

   Run to run the fps moves up to ~20% (the M1 lot: 34 one run, 41 the next): every phase compares before and after
   back to back, two runs each.

   Memory (Low, 2× screen, 2 cycles of the spots and floor 2, garbage collected): JS heap 724 MB; three's 4,458
   geometries, 644 textures, 260 programs. **The tab: 1,615 MB resident** — array buffers 748 MB, canvas 362 MB,
   WebGL 459 MB, malloc 188 MB, V8 166 MB, Blink buffers 136 MB. **The GPU process: 956 MB resident**, 1,881 MB in
   its own count (ANGLE 1,398 MB, IOAccelerator 1,124 MB, shared images 420 MB). The scene: 8,049 objects, 6,424
   meshes, 4,895 geometries (256 MB; 2,893 non-indexed; **3,109 copies of another, 92 MB**), 1,977 materials for
   **921 looks**, 510 painted textures (172 MB of pixels, **~374 copies**); the floors' drawn triangles 0: 368k ·
   1–3: 179k each · 4: 928k.

   Loading (Low, 2× screen, a 20 Mbps / 60 ms link; the API and world on this machine):

   | | Requests | Moved | Answered locally / 304s | To ready | In 20 s after ready |
   |---|---|---|---|---|---|
   | Cold | 271 | 17.4 MB (glb 9.9, ktx2 3.8, js 2.7) | 37 / 6 | 9.9 s (9.2 another run) | 13 programs compiled, 2 long tasks (≤ 200 ms) |
   | Reload | 264 | 0.1 MB | 119 / **134** | 11.6 s | none |
   | The tab again | 292 | 0.8 MB | 119 / **143** | 8.9 s | none |

   **Time to ready barely moves with the cache** (9–12 s cold or warm): here the link isn't what the loading screen
   waits on — phase 5 measures what it does wait on. The 134–143 revalidations are one round trip each over a
   tunnel. 9 people at ready, none after (in the dev world: the friends' prod world pops in more).

   Stills: 4 spots (studio, lot, lawn, floor 2) × 6 seeded cameras × High and Low, noon and night; the shot's camera
   set from the game's target rounded to half a metre; people, pets, vehicles, particles and whatever moved hidden;
   the grain fixed. **Same-frame A/B (AB_OFF/AB_ON) is exact: 48 of 48 cameras 0 px with a no-op switch** — that's
   the proof every phase gives (a phase that can't switch at runtime adds a switch, as plan 38's `setUnmerged`).
   Two runs apart are **not** pixel-equal on the same code: the far land streams in at its own pace, and the snow
   layer, the footprints and the tyre tracks change with the server's time (the parked cars come out identical) —
   indoors 2k–42k px apart, outdoors up to the whole ground; `diff` is a smoke check against that noise, not the
   proof.
1. **Lights that are off** — the lights at intensity 0 cost nothing: the programs stay the same (no recompile), but
   each point and spot light is skipped in the shader when it's off (its colour 0 — a uniform branch, the same for
   every pixel of a draw), its shadow lookups with it; or the variants compiled ahead, if the branch isn't enough.
   Both tiers.
   Done in phase 1 (2026-11-14) — `tp/lights-off.ts`: each point and spot light's turn in three's loop inside
   `if ( loAll || its colour != 0 )`, made in the one hook every material's compile goes through (fog3d.ts, which
   now takes others' changes: `compileExtras`) — on the loop wherever it is in the source, as most lit materials put
   the chunk in themselves (the light map's in light3d.ts, the vehicles' sky in car/sedan.ts). `loAll` is the tests'
   switch, a uniform shared by every shader (`tp.lightsSkip(on)`): the A/B is one program drawn twice — a switch by
   recompiling isn't neutral here (materials that make their uniforms in their own hook — the snow on the ledges, the
   tyre tracks — lost them in the recompiled half: the first try showed the whole façade apart).
   - **Same pixels: 32 of 32 cameras 0 px** (4 spots × 4 × High and Low, noon and night), the switch shown live (it
     moves the fps both ways). `lights-off.test.ts`: the guards, three's own loop otherwise, the light map's chunk.
   - **Prod build, walking, the switch flipped in the page** (`weight.mts frames` with AB_OFF/AB_ON — separate runs
     can't show it: the world's draws moved by half between runs, High fell 47 → 34 fps on the same code):

     | on / off | Studio | Lot | Lawn |
     |---|---|---|---|
     | High 2× | **48.3 / 43.2 fps (+12%)** | **50.3 / 41.7 (+21%)** | **53.8 / 45.0 (+20%)** |
     | Low, CPU 2.5× (CPU-bound) | 36.0 / 32.8 (+10%) | 33.1 / 32.6 (+2%) | 51.5 / 46.8 (+10%) |
     | Low, CPU as is (dev, GPU-bound) | 169 / 154 (+10%) | 134 / 125 (+7%) | — |

   - **What's left on the table: the torches.** Hiding the lights at 0 outright (visible = false: a program without
     them) is still +15–26% over the skip on High (lot 50 → 65, studio 52 → 57), and nearly all of it is the two
     flashlights' spots (`view.ts` TORCHES = 2): each keeps its map always (a map coming or going recompiles every
     material) and mine its shadow on High, so every lit vertex works out and hands on their light-space coordinates
     whether they're on or not — work in the vertex stage and the varyings that the fragment's branch can't skip
     (hiding the zero points alone: +4–9%; the zero spots alone: lot 50 → 62). **F6a: left as they are.**
2. **Geometry shared and indexed** — `rbox` / `RoundedBoxGeometry`, lathes and cylinders indexed (the same vertices,
   welded: `mergeVertices`, exact); identical pieces share one geometry (cached by their parameters) — the windows
   first, one geometry for all 174; the merged meshes indexed too. Memory and vertex work down, the triangles as
   they are.
   **Tried and reverted (the user, 2026-11-15)** — built, proven and measured, then taken out: what it gave doesn't
   show to a player, and it cost load time and code. What it found, kept:
   - Not sharing geometry (a floor's things are baked into its merged buffers: nothing to share) but **drawing by
     index**: every corner that's a bit-for-bit copy of another kept once. Known as it's made (a quad's shared
     corners; a kit model's own copies worked out once a model) it needs no hashing at load; hashing every floor at
     build time was exact but 400 → 40 ns a corner: seconds, then ~0.5 s. Two concatenations in build.ts
     (`appendOut`, `append`) — a twin missed in one drops a whole bucket back to unindexed, silently.
   - 32 of 32 cameras 0 px; prod: the tab −81 MB, the GPU process −55 MB, JS heap −60 MB — **fps +1–3% on High,
     nothing on Low** (the vertices aren't the cost: the fragments are, phase 1), **load +0.3 s**.
   - **The floors aren't held twice**: the held pieces' arrays are views of the merged ones (plan 72 phase 13); the
     investigation's ~260 MB counted each view as its own.
3. **Textures painted once** — the procedural canvas textures cached by their inputs (one per distinct look, not per
   object); materials of the same look shared (1,934 → ~919: fewer programs and state changes); canvases let go
   after upload where a lost context can paint them again.
   Done in phase 3 (2026-11-15) — found by tracing every canvas made to its maker (the duplicates weren't the
   life kit's painters: those are the dev pages'):
   - **The cars' paint** (`tp/car/textures.ts`): walnut, cloth, carpet, tread, hubcaps, lenses, plates, heater,
     freshener, diamond plate, gauges, ash, the windscreen's snow and rain — each painted again by every parked car;
     now `once(name, painter)`: a picture per arguments, every car the same texture, never disposed by one car (it's
     the next one's). Their per-car `repeat` settings are constants (the same on the shared one).
   - **The town's signs** (`grounds3d.ts` `signFace`: every FOR LEASE its own 512-px canvas) and **the vehicles'
     decals** (`car/kit.ts` `sharedText`: every snowmobile's, plough's and tractor's) — by what they say, size and
     colours; system fonts only (Georgia, DIN Condensed / Arial Narrow: nothing loads later to change a painting).
   - Left alone, being live: the sedans' cluster and radio displays (each car's own), the lifts' dot-matrix
     indicators, the live panels. (`spot3d.ts` boards shared too — they're only drawn by the dev stills.)
   - **Same pixels**: 32 of 32 cameras 0 px, same-frame A/B `AB=unshare` (each material shown its own painting
     again, as before); every shared texture repainted and compared byte for byte: 30 of 31 the same — the 31st,
     the one GAS sign, repaints ±1 level on 19 channels by itself (Chrome's text raster), and is one sign: painted
     once either way.
   - **Prod build** (Low, 2 cycles): painted textures 510 → 248 (172 → 110 MB of pixels), three's textures
     663 → 411, the tab's canvas 389 → 322 MB, **the GPU process's own count 1,926 → 1,713 MB (IOAccelerator 1,131 →
     967)**, the materials' distinct looks 914 → 624; time to ready the same (7.46–8.06 s → 7.59–8.27 s, 3 runs).
     The tab's resident size barely moves at once (freed canvas memory isn't handed back straight away).

4. **Out of view, out of the walk** — the kart circuit, the far trees and the Grounds' other subtrees left out of the
   scene's walk when out of range or view (the far trees in cells that cull, not one InstancedMesh); still subtrees
   sealed so `lazyMatrices` skips them; High on `lazyMatrices` too; why `makeChunk` runs while still, fixed; the
   Grounds' per-frame queries cached where their answer can't change.
   Done in phase 4, first part (2026-11-15) — what's built outside, out of a camera's sight:
   - `Culling.cullOutdoors` (from view.ts' `scene.onBeforeRender`, as the parked cars already were): the Grounds'
     still roots (`GroundsStream.stillRoots`: the statics, the kart park, the districts) looked into a level at a
     time, every piece three's own culling would trust (`stillBox`, its box made again only when it moves) left
     out of that render when wholly outside its camera; the shadow pass has them on again. ~950–990 pieces,
     2,800–4,300 meshes a render that three no longer walks.
   - **The kart park's crowd** (28 instanced meshes, unculled: their people move in the shader) now in it too:
     `userData.cullPad = 3` — risen ≤ 0.5 m, leant 0.36 m, limbs turned about their joints: never 3 m from where
     they stand — its box the instances' own plus that (`stillBox`); its clock is the time itself, so a crowd out
     of sight comes back as it'd be.
   - **Same pixels: 32 of 32 cameras 0 px** (`AB=outcull`).
   - **Prod, the switch flipped in the page, walking, two runs** — an M1's proxy (Low, CPU 2.5×): studio **+9.5% /
     +7.9%** (main thread 15.1 → 13.6 ms), lot +7.8% / −1.1%, lawn **+18% / +23.5%** (9.3–10.3 → 7.8–8.3 ms); High
     2× within its noise (−3 to +5%: the GPU is its limit — phase 1).
   The rest, looked at (2026-11-15) and left — the M1's proxy profiled again after the part above:
   - **Sealing the land for `lazyMatrices`** (Low's matrices pass: 11% of the main thread on the lot, 18.5% in the
     studio): its ceiling measured by sealing the still roots by hand — lot noise, lawn +5–9%, studio +16%. Not
     done: a sealed piece isn't looked at, so anything that moves or is added in it without the seal knowing is
     drawn frozen or at the origin; the land streams in, and its 5,800-line builder adds and moves things in many
     places — the kart park alone rebuilds its circuit on a layout change, moves its gantry, raises its bridge, and
     its stage is another module's. Safe only with every mover and every late add declared, or watched at a cost
     like the pass it saves. Worth its own careful task, not a quiet change.
   - **High on `lazyMatrices`**: High's limit is the GPU (phase 1; this phase's own A/B moved High nothing).
   - **`makeChunk` while standing still** (0.6% over a minute) and **the Grounds' per-frame queries** (`heightAt`
     1.2%): too small to be worth a change now.
   - Found on the way: three works a program out again **10–21 times a frame** (~6% of the lot's frame on the
     proxy) — every transparent, double-sided material is drawn back then front with `needsUpdate` between
     (people's lash, brow and hair-card edges, a few of the land's): the glass was split into back and front meshes
     for this (memory note `three-two-sided-glass`); the people's edges would need the same, their skeletons and
     their order among the other transparent things kept — ~3–5%, not done.
5. **Loading** — per F4: versioned asset URLs, `immutable` headers, the hashed transcoder; the portrait loads only
   the bodies it shows and shares the view's materials; the garments' list beside the body so they load together;
   the loading screen waits for the people in view and compiles their programs (`compileAsync`) before it lifts;
   Jolt's wasm as its own streamed file if the bundler allows.
   Done in phase 5, first part (2026-11-15):
   - **Every public file the game loads asked for by its folder's version** — `lib/asset.ts` `asset(path)` →
     `/a/<hash>/<path>`; `next.config.ts` hashes each folder under `public/{life,sfx,emu,decoders}` (its own files'
     names and contents, sha1, at config time: dev and build alike), rewrites `/a/:v/:path*` to the file, and in a
     production build sends `Cache-Control: public, max-age=31536000, immutable` for it. A file changes, its
     folder's URLs change; the others stay cached. A path — not a query — so what a loader adds to a folder (the
     KTX2 transcoder's files, the sounds' manifests and theirs) is versioned too. Every loader routed through it
     (people, garments, guns, items, materials, sounds, voices, emulator cores, the transcoder): 174 of 174 asset
     requests of a load versioned, none failing.
   - **Revalidations gone**: prod, a 20 Mbps / 60 ms link — reloading or coming back, **137–180 → 2** requests
     sent to the server (each a round trip through the tunnel before; Cloudflare kept none of them).
   - **For the user, at Cloudflare** (F4a): a Cache Rule — *URI Path starts with `/a/`* → *Eligible for cache*,
     Edge TTL *use cache-control header from origin*, Browser TTL *respect origin*. Then a friend's first visit
     after a change takes the files from Cloudflare's edge, not from the server's upload.
   - **People in before the loading screen goes** (`warmup.ts` readiness: a person's model in — body and the
     garments it wears — before every shader is compiled): **in play after a cold load, 15–16 programs compiled
     and two ~200 ms freezes → none**. The price: a first visit's loading screen **+1.7–2.6 s** (the first body,
     3 MB, and its garments on the link); a visit with them cached waits nothing more. Waiting for one person is
     enough: theirs are the same materials. **Kept (the user, 2026-11-15).**
   The rest, looked at and left:
   - **The garments asked for alongside the body** (their list read out of the body's file at build time, each
     person's asked for while the body comes): tried and taken out — on a 20 Mbps link the 26 garments of 9 people
     shared the link with the bodies, the first body (what the loading screen waits for now) came in 2 s later and
     the screen went 0.5 s later. The link's width is the limit there, not its round trips.
   - **The portrait's second body and renderer** (`chars/picture.ts`): both bodies are wanted anyway wherever both
     kinds of people are about, and with the files cached a visit after the first pays nothing for them.
   - **Jolt's wasm inlined in its chunk** (1 MB gzip): `/_next/static`, cached for good already — a first visit's
     cost only.
6. **Auto's tier** — per F2c: Auto starts on Medium; with room to spare for a while (measured, with hysteresis so it
   never flips back and forth) it steps up to High during play, and down again as today when it can't keep up; every
   tier's programs warmed ahead so neither step hitches. A tier picked by hand in Settings is never touched.
7. **Others' smoothing** — per F3.
8. **The world-server** — its RSS creep (memcheck OVER), the stalls on a room's creation and the cars' tick.
9. **(F1b only) Detail no one sees** — per change, stills side by side first: fewer segments in bevels under a
   centimetre and in small lathes; the far trees' LOD.
10. **Checks** — the bench against phase 0's numbers, memcheck, `e2e/lag.spec.ts`, the e2e suite's known reds
    (memory note `known-red-e2e-2026-10-24`); the targets met or the gap written here.

Not now: WebAssembly for the Grounds' maths (as plan 38 decided: worker first, numbers first); a new renderer
(WebGPU); fewer things in the world.
