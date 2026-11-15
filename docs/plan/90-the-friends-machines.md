# 90 — The friends' machines: fast where they play

Ask (2026-11-15, the user, after plan 89): go on to what plan 89 left open — an M1's main thread, foremost — with the
friends' own numbers. Production's performance reports (`perf_reports`, a row every 30 s a player: fps, frame times,
stages, draws, the GPU, the tier, where) were exported read-only for the last 30 days and read here.

**The rule, as plan 89's: the same game — same look, same mechanics — only lighter**, but where a fork below says a
tier may look less (a weak GPU's).

Status: **done 2026-11-15 — phases 0–8 (the user tests at the end); planned from production's reports; forks decided by the user 2026-11-15**: **F1b** plan 89
deployed with this plan, together (the friends weren't playing that day); **F2c** the GPU's name first, a 1-s test to
correct it; **F3c** a new tier below Lowest for the weak GPUs, the four tiers untouched; **F4b** same pixels for people,
and far people (past ~25 m) a lighter body, signed off with stills; **F5a** richer reports; **F6a** nothing of
Firefox's own.

## What production says (2026-10-24 → 2026-11-15, before plan 89)

Production runs plan 88 (`3bcb97d1`; some tabs still `90a8faa`): **none of plan 89 is there yet**. 28,725 reports;
18,209 are idle (the 30 fps cap with the main thread to spare) and 720 hidden — **9,796 of real play** read here.
"Work" is the main thread's time a frame (`frame_med`), "interval" the time between frames (1000 / fps): work near the
interval, the main thread's the limit; far under it, the GPU (or the browser) is.

### The friends on Apple silicon (M1, M1 Pro, M2 Pro, M3): the main thread

| Who, machine | Tier | fps | Work / interval | Over 50 ms a minute |
|---|---|---|---|---|
| Rafael, 8 cores (the M1), Safari | Low | 41 | 17 / 25 ms (70%) | 5 |
| Rafael, 10 cores (M1 Pro) | Lowest | 54 | 13 / 19 ms | 2.5 |
| GABRIEL, 8 cores (an Air) | Lowest · Medium | 57 · 49 | 9 / 18 · 14 / 20 ms | 8 · 15 |
| Gabriel Freitas, M1 Pro | Lowest · High | 50 · 52 | 14 / 20 · 14 / 19 ms | 10 · 9 |

- The main thread fills 50–70% of a frame — the biggest share, not all of it. Its stages: **the render (scene walk +
  draws) ~11.8 ms**, logic 1.5, the rest under a millisecond.
- **Indoors is worse**: 44 fps against 55 outdoors (work 14.3 vs 12.8 ms). Their own rooms most: Rafael's 41 fps
  (18 ms of work, ~1,100 draws), the Serious Office 39 frames over 50 ms a minute.
- **One person near costs ~3.5 ms a frame**: 51 fps alone, 46 with one other (work 11.8 → 15.3 ms, ~+180 draws).
- Draws follow the work: ~800–1,200 draws, 11–15 ms; ~3,500, 23–30 ms (the user's own sessions on High).

### Windows laptops on integrated graphics: the GPU — the worst off

| Who, GPU | Tier | fps | Work / interval | Over 50 ms a minute |
|---|---|---|---|---|
| Rudney, Intel UHD | Lowest | **13.5** | 18 / 74 ms (**25%**) | **156** |
| Rafael, AMD Radeon (Renoir) | Lowest · Low · Medium | 24 · **4** · **2** | 26 / 42 ms (62%) on Lowest | 93 · 130 · 104 |
| GABRIEL, AMD Radeon (Renoir) | Lowest | 22 | 30 / 46 ms | **113** |

- The main thread waits: **the GPU is the wall** — no main-thread work would help them.
- Auto picks its tier by cores and memory (`lib/prefs.ts deviceQuality`), never the GPU: a 12–20-core laptop on an
  integrated GPU reads as High (Medium since plan 89), and steps down a tier a time — minutes at 2–4 fps first.
- Italo's GPU once read "Microsoft Basic Render Driver": **no GPU at all** (software).
- Lowest today: render scale 0.75, no antialiasing, no shadow, no post, 2 lamps, the campus' and land's lite.

### Everyone: the stutter, and Firefox

- **Frames over 50 ms 5–15 a minute on good machines**, 39 in the Serious Office, 90–156 on the integrated GPUs —
  what reads as freezing. The reports don't say what they were.
- **Firefox**: the main thread 88–93% of every frame — the user's M4 Pro 35 fps there, 50–57 in Chrome; Marcus' GTX
  980 the same.

### Here (plan 89's bench, an M1's proxy: Low, the CPU 2.5× slower)

The main thread 17–25 ms a frame (43–51 fps); phase 0 of plan 89's split: three's walk and draw submission 35–40%,
matrices for ~7,000 objects 10–13%, the land's per-frame questions ~10%, what's below my floor ~7% indoors.
Triangles cost ~nothing (plan 89 phase 9); draws do. **To be taken again on today's build** (phase 0).

## Targets

Measured on production's own reports a week after each release (against the table above), and on the bench here:

- **Apple friends, Low/Lowest: ≥ 60 fps indoors and out** (now 41–57); one person near ≤ 1 ms (now ~3.5).
- **Frames over 50 ms ≤ 3 a minute** on the Apple friends (now 5–15), ≤ 15 on the integrated GPUs (now 90–156).
- **Integrated GPUs: ≥ 30 fps from the first minute** (now 13–24 on Lowest, 2–4 before Auto gets there); software
  rendering said so on screen.
- **Firefox within 25% of Chrome** on the same machine (now ~35%).
- Same pixels on High, Medium and Low (A/B stills, as plan 89), unless a fork says otherwise.

## Forks

| # | Question | Options | Recommended |
|---|---|---|---|
| F1 | Deploy plan 89 first? | **a)** yes, now — a week of its own reports before this plan's first change, so each phase's gain is seen on the friends' machines · **b)** with plan 90's first phase | **a** |
| F2 | The weak GPUs' start | **a)** by the GPU's name (integrated Intel/AMD, software renderers → Lowest; software also told) · **b)** a 1-s GPU test behind the loading screen picks the tier · **c)** both: the name first, the test to correct it | **c** |
| F3 | May Lowest look less, for the weak GPUs? | **a)** yes — Lowest only: a lower render scale (0.5–0.6, sharpened) and simpler light (the sun and the lamps' glow, no per-pixel lamp loop); High/Medium/Low untouched · **b)** no — Lowest stays as it is, only the start and Auto change · **c)** a new tier below Lowest ("Potato") for them, Lowest as is | **c** |
| F4 | People | **a)** same pixels only: a person's parts in fewer draws, people out of the camera's sight not drawn (and not posed), their shadows too · **b)** a) and far people (past ~25 m) as a lighter body — a visible change at distance, signed off with stills | **b** |
| F5 | The reports | **a)** richer: the worst frame's stages, people near by count, objects and draws by kind, a GPU-bound flag (the frame waiting with the main thread idle) — so each phase is judged on the friends' machines · **b)** as they are | **a** |
| F6 | Firefox | **a)** nothing of its own — it gains with the main thread's work · **b)** a) and a one-line hint in Settings that Chrome/Safari run faster | **a** |

## Phases

0. **The bench again, and what plan 89 left unsaid** — on today's build, an M1's proxy and High: the main thread's
   split per spot (studio, a furnished room, the lot, the lawn); **the draws by source** (floors, furniture, people,
   the land's props, cars, lights) and **the objects walked by source**; **the frame against people near** (0, 1, 5,
   10, 20); **every frame over 50 ms with its cause** (land streaming, a compile, garbage collection, someone coming
   in, an upload); the client's physics' share; Firefox beside Chrome. Written here; each phase after is sized by it.
   Done 2026-11-15 (`e2e/weight.mts census`, a prod build, an M1's proxy on Low — Bia, noon, still weather):

   | Spot | Draws: the Grounds · cars · people · my floor | Objects walked | Frame, 0 · 5 · 10 · 20 people near |
   |---|---|---|---|
   | Studio (floor 4) | 329: **216** · 46 · 37 · 18 | ~6,300 | 15.1 · 19.9 · 23.8 · 32.3 ms |
   | Lot | 667: 286 · 65 · 37 · 173 | ~7,600 | 17.0 · 21.3 · 26.1 · 35.1 ms |
   | Lawn | 1,154: 314 · **463** · 37 · 244 | ~7,600 | 26.0 · 30.5 · 34.3 · 43.8 ms |
   | Floor 2 (empty) | 412: 227 · 46 · 37 · 14 (+ floor 0: 77) | ~7,600 | 15.4 · 20.7 · 24.9 · 33.1 ms |

   - **A person near: ~0.85 ms and ~16 draws** on the proxy (20 → the frame doubles). (Production's one person:
     ~3.5 ms on the friends' machines.)
   - **The Grounds draw 216–314 times from everywhere** — floor 4 through its windows too; the cars 46–463 (the lawn:
     the park's).
   - **The main thread** (self time walking, 5 s; minified names read off the build): `lazyMatrices`' walk of every
     object **15% indoors**, 7% out; `below-cull`'s `across` 5% indoors; three's scene walk 6.5–8%; the draws'
     submission (renderBufferDirect, uniforms, uploads, vertex arrays) ~20–25%; a Grounds lookup on a 28 m grid ~2%
     out. The client's physics didn't show in the top 30.
   - **Frames over 50 ms**: 2–8 in 12 s walking, each 51–70 ms, all one rAF callback (the frame itself: 2–3× the
     average) — no compile, upload or GC of their own in the attribution; the frame's own work peaking.
   - Firefox and the real M1's GPU not measured here (no M1); production's reports after release will say.
1. **Reports that say more** (F5a) — the worst frame's stages, people near by count, draws and objects by kind, the
   GPU-bound flag. Released with plan 89 and this plan together (F1b): production's table above is the before; the
   after is the reports of the week from the release.
   Done 2026-11-15: a report's `detail` (shared `PerfReport`), stored in the row's `context` — `worstStages` (the
   worst frame's own stages), `waited` (the share of frames late with the main thread done: past the frame cap, the
   GPU's or the browser's wait), `people` (drawn), `drawsBy` (a sampled frame's draws: grounds, floors, people,
   cars, other). Checked through the dev stack into the dev database.
2. **The weak GPUs** (F2c, F3c) — Auto's start by the GPU's name (integrated Intel/AMD, software renderers) and a
   1-s test behind the loading screen to correct it; down faster when far under (2 s under 20 fps, not 6 s at a
   tier); software rendering said so; **a new tier below Lowest** (a lower render scale, sharpened; simpler light),
   the four tiers as they are. Shown first as stills.
   Done 2026-11-15 — **Potato** (`lib/prefs.ts`; Settings "Potato (weak graphics)"): drawn as lowest (every
   "low or lowest" rule applies), the view's `potato` adding **half a pixel a pixel** (lowest's 0.75) and **no lamps**
   (lowest's 2) — `tp.tier` says which. **By the GPU's name** (`gpuKindOf`, a throwaway context's renderer string):
   integrated Intel (Iris Xe and Arc aside) and AMD APUs (Radeon Graphics, Vega n, Renoir…) → potato, software
   (Basic Render Driver, SwiftShader, llvmpipe) → potato and said on screen; Auto steps a weak GPU up to lowest when it
   has room (10 s), remembered a minute on. **The test behind the loading screen** (`ctl/loading.ts`): the world
   built, a second without steady frames (6 over 50 ms) → a tier down there and then, again each second, the screen
   held till the switch is in — a weak GPU used to sit out the 15 s cap. **Down faster in play**: under 20 fps, 2 s
   (6 s otherwise). Checked live (a faked Intel UHD; frames slowed to 70 ms): potato at 0.5 and no lamps; stepped down
   behind the screen; up when there was room. Stills for the user: `design/plan90/tier-lowest-lot.png`,
   `tier-potato-lot.png`.
3. **People** (F4b) — out of sight not drawn, not posed, their shadows with them; a person's parts in fewer draws
   (merged where their materials allow, the soft edges and depth copies counted); people past ~25 m a lighter body,
   signed off with stills first.
   Done 2026-11-15. What a person is (the dev client, a person near): 13 skinned parts (body, brows, eyes, lashes
   and their soft edge, teeth, tongue, top, bottom, shoes, the hair's shell, cards and their edge), a blob, a ring —
   and **a holstered revolver: ~20 meshes of its own** (body, cylinder, crane, rod, hammer, latch, trigger, six
   rounds, the holster), each a draw and a shadow. **The far people (F4b) were there already**: past 12 m the life
   look's `life-far`, one mesh. Three culls each part out of view already. With 20 near (Low, the proxy): the
   render 55% (the draws' programs and uniforms), people's own update 15% (motion 8%, the feet on the ground 7% —
   Jolt rays and land heights asked ~60 times a person a frame), the tags 5%.
   - **A gun that only hangs — holstered, slung — merged** (`person3d.ts stillGun`, `mergeWith`): one mesh a
     material, its parts gone, its root kept (shown, hidden when drawn, the strap's ends). Bia, holstered: 35 → 22
     meshes. `revolver-two`, `shotgun-two`, `ak-two` green.
   - **A joint's place read by its own chain** (`model.ts jointPosition`, `eyePosition`): not the whole body's
     matrices made again (the tags ask every head every frame) — the same numbers.
   - Left: the feet's ground asked of Jolt every frame (an idle body's feet move by its breath: no exact cache, and
     a rounded one isn't the same picture); the soft edges' and brows' two passes (three re-checks their shaders
     every draw — but the look swaps their materials as it fades: a split copy would have to follow); people out of
     view still posed (their steps are heard).
4. **Fewer draws indoors** — a room's furniture and things that stand still merged by material (as the floors are),
   repeated pieces instanced; what moves or is used stays its own.
   Done 2026-11-15 — measured first, and the floors aren't where the draws are: my floor, furnished, is 18 draws
   (World3 merges it already). From floor 4 the Grounds give ~108 (69 of them instanced already); on the lawn the
   parked sedans 163 (~10 each, merged each — across cars not, a parked car can be knocked or driven off). What was
   left per draw: **a parked car's glass drawn in three's two passes** — a see-through two-sided material, its side
   flipped and marked changed twice a frame, its shader worked out again each time (114 in the lot). Now two meshes
   (`two-pass.ts`, from `Culling.stillModel`): the back faces' with a back-only material, right after it the front
   faces' — the same place and made after it, so drawn after it, as three's passes; their materials shared by every
   car with that glass. People's two-pass parts (brows, soft edges) left: the look swaps their materials (phase 3).
   The friends' own rooms (production's world) not here to measure: the reports' `drawsBy` (phase 1) will say.
5. **Fewer objects walked** — what never moves sealed out of the per-frame matrices walk on every tier (only Low and
   Lowest skip any today), marked where it's built; the scene walk skipping still groups out of sight in one step.
   Measured 2026-11-15, nothing kept: **High and Medium on the lazy walk** (three's own pass, every object every
   frame, was the suspect: ~7,000) — A/B in the page, walking: High 2× +0.3% studio, +0.8% lot, Low the same (it's
   lazy already): noise — reverted. Low's own walk (15% of the proxy's main thread indoors, 7% out) only gets
   cheaper by sealing what never moves, and the biggest of it, the land, was found unsafe in plan 89 (it moves things
   unannounced). Below-cull's `across` (5% indoors) depends on the eye: the same answer only standing quite still,
   and it was walking that cost — left.
6. **The land's questions** — `heightAt`/`terrainAt`/`waterSide` asked every frame answered from what's cached, or
   made ahead in the land worker.
   Done 2026-11-15 — who asks, profiled (the lot, the proxy): the land's questions ~2–3% in all, spread thin (the
   vehicles, the dark's distances, the feet) — but one of them **made land on the main thread mid-frame**: every
   vehicle placed on the land every frame (`tp/parts/vehicles.ts`), the long road's bus and traffic too, kilometres
   off — a chunk not made here yet made then (6–50 ms) as the bus drove on, every few seconds. Now a vehicle whose
   land isn't made here keeps the height it had (past the near land, out of sight); made — by the streaming, as it
   nears — it's on the land exactly as before.
7. **The stutter** — by phase 0's causes: what's built or uploaded mid-play made ahead or spread over frames, garbage
   churned per frame removed.
   Done 2026-11-15 — what's in a frame over 45 ms, by a Chrome trace walking 20 s (the frames and the main
   thread's own samples on one clock; the proxy, Low; minified names read off the build):
   - **The lot: 18 → 2.** 60% of the long frames was `driveVehicles → setVehicles →` the land made for a vehicle far
     off — phase 6's fix. The two left: **an NPC placed on his land every frame** (`npcs.forEach → mapGround →
     heightAt`, the Grounds' folk 800 m off: his chunk made then) — now his ground kept while his land isn't made
     here (`controller.ts npcGround`, the land module's `landReady`), as the vehicles'.
   - **The lawn: 0.**
   - **The studio: 7 → 2–3.** A parked car coming near the camera made whole (`buildSedan`) and made still
     (`stillModel`: merged, its shadow, its glass split) in one frame — several at once by the windows. Now one such
     a frame (`car/cars.ts syncParked`), a car waiting shown as its far model meanwhile (what it is a little further
     off). Left: the studio's TV's YouTube player made and destroyed as one walks in and out of its hearing (the
     media's own rule), a shader linked at a car's first sight.
   `car.spec` green but "under a flier" (flaky before: 1 of 2 again).
8. **Checks** — the bench against phase 0; production's reports a week after the release against the table above;
   the targets met or the gap written here.
   Done 2026-11-15 (the friends' week after the release is theirs to come): plan 90's start (f948bc9d) built again
   and benched back to back with HEAD, the same world:

   | An M1's proxy (Low) | Plan 90's start | Now |
   |---|---|---|
   | fps, studio · lot · lawn (still / walking) | 56 / 52 · 43 / 41 · 82 / 78 | 58 / 52 · 47 / 44 · 87 / 82 (**+1…+10%**) |
   | Frames over 50 ms in 4 s | **1–4** everywhere | **0** everywhere |
   | Frames over 45 ms in 20 s walking (trace): lot · studio | 10 · 17 | **0 · 8** |
   | The frame with 0 · 20 people near (studio) | 13.4 · 31.0 ms | 12.9 · 30.5 ms |

   High 2×: the same (four rounds, order swapped: 54.0 vs 54.2, 54.5 vs 53.8, 56.9 vs 54.9 fps; the first run of a
   session read ~10% better either way). Stills (seeded cameras): no change past the noise floor — which run to run
   is large here (the same build twice: up to 870k px, 320k over 48 levels, the snow and weather moving on); by eye
   the same, glass included. Unit tests 353 green; `people-3d`, `avatar`, `others-link`, `move-others`, `loading`,
   `lag`, `revolver-two`, `shotgun-two`, `ak-two` green; `car` but its flaky "under a flier".

   The targets:
   - **The stutter on the proxy: met** (frames over 50 ms 1–4 per 4 s → 0; long frames walking the lot 10 → 0).
   - **Integrated GPUs ≥ 30 fps from the first minute**: by construction (potato: a third of lowest's pixels, no
     lamps; picked by the GPU's name, the test behind the loading screen) — **to be seen in production's reports**.
     Software rendering said on screen: met.
   - **Apple friends ≥ 60 fps indoors and out on Low**: **not shown here** — the proxy +1…+10%, its studio ~52–58;
     the friends' rooms and their real GPU only production's reports (now with `drawsBy`, `waited`, the worst frame's
     stages) will say. **One person near ≤ 1 ms**: on the proxy ~0.85 ms a person (not a holstered gun's 13 draws
     more since phase 3); the friends' 3.5 ms to be re-read.
   - **Firefox within 25% of Chrome**: not measured here.
   - Left for a next plan, with the reports' own numbers: people's soft edges and brows in three's two passes (the
     look swaps their materials), Low's matrices walk (sealing the land: unsafe), the studio's TV made and destroyed
     by hearing, a shader linked at a car's first sight.

**After the plan (2026-11-15, the user, testing): the loading screen didn't cover it all** — entering in the woods
(prod too), the screen went with one's own body a stand-in and the forest still coming. Two causes in
`ctl/loading.ts` and `tp/parts/warmup.ts`: the screen was cut at a fixed 15 s whatever was left (the 3D view's
code, Jolt, the land, every body and its clothes, every shader — past 15 s on a slow link, in a forest, or under
`next dev`), and the people it waited for were any one ready anywhere (an NPC far out on the Grounds was enough).
Now it's up while things keep coming — a readiness step, or any file the page gets (a body's megabytes are one
step till their last byte) — and down once all's in and steady; only stuck (nothing for 15 s, the view up and
drawing), built but never steady 6 s, or 90 s cut it short; it waits for my own body and those within 20 m.
Entering the woods cold (a fresh profile): 10 Mbps — main 16.1 s with the stand-in ("cut short"), now 19.5–23.5 s
all in; 4 Mbps — main 17.1 s with the stand-in (all in at 51.9 s), now 42.8 s all in; no cap — 12.3 vs 10.4 s.
`ctl/loading.test.ts`. Commits b49fe198, 94542624.

**And a patch on High (2026-11-15, the user)**: a dark, grainy patch on the ground round one's legs, sliding with
the camera — High's GTAO (the life look's screen-space AO, plan 73; not this plan's): its `thickness` of 2 m let
someone's legs shade the snow a metre or two behind them on screen. 0.4 m (`tp/post3d.ts`): the patch gone, a foot
on the ground, a wall on the floor, the studio's rug and corners as they were (side by side at 2, 1, 0.6, 0.35).

Not now: moving the renderer to a worker (OffscreenCanvas — the same work on another thread); WebGPU; anything that
changes what the world is.
