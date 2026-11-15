# 90 — The friends' machines: fast where they play

Ask (2026-11-15, the user, after plan 89): go on to what plan 89 left open — an M1's main thread, foremost — with the
friends' own numbers. Production's performance reports (`perf_reports`, a row every 30 s a player: fps, frame times,
stages, draws, the GPU, the tier, where) were exported read-only for the last 30 days and read here.

**The rule, as plan 89's: the same game — same look, same mechanics — only lighter**, but where a fork below says a
tier may look less (a weak GPU's).

Status: **planned 2026-11-15 from production's reports; forks decided by the user 2026-11-15**: **F1b** plan 89
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
1. **Reports that say more** (F5a) — the worst frame's stages, people near by count, draws and objects by kind, the
   GPU-bound flag. Released with plan 89 and this plan together (F1b): production's table above is the before; the
   after is the reports of the week from the release.
2. **The weak GPUs** (F2c, F3c) — Auto's start by the GPU's name (integrated Intel/AMD, software renderers) and a
   1-s test behind the loading screen to correct it; down faster when far under (2 s under 20 fps, not 6 s at a
   tier); software rendering said so; **a new tier below Lowest** (a lower render scale, sharpened; simpler light),
   the four tiers as they are. Shown first as stills.
3. **People** (F4b) — out of sight not drawn, not posed, their shadows with them; a person's parts in fewer draws
   (merged where their materials allow, the soft edges and depth copies counted); people past ~25 m a lighter body,
   signed off with stills first.
4. **Fewer draws indoors** — a room's furniture and things that stand still merged by material (as the floors are),
   repeated pieces instanced; what moves or is used stays its own.
5. **Fewer objects walked** — what never moves sealed out of the per-frame matrices walk on every tier (only Low and
   Lowest skip any today), marked where it's built; the scene walk skipping still groups out of sight in one step.
6. **The land's questions** — `heightAt`/`terrainAt`/`waterSide` asked every frame answered from what's cached, or
   made ahead in the land worker.
7. **The stutter** — by phase 0's causes: what's built or uploaded mid-play made ahead or spread over frames, garbage
   churned per frame removed.
8. **Checks** — the bench against phase 0; production's reports a week after the release against the table above;
   the targets met or the gap written here.

Not now: moving the renderer to a worker (OffscreenCanvas — the same work on another thread); WebGPU; anything that
changes what the world is.
