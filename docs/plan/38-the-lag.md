# The lag — find it, measure it, remove it (plan — decided 2026-10-23; round 1 delivered 2026-10-23)

Friends feel lag: the screen stutters, fps drops, the CPU climbs and the laptop
heats up as soon as the world is open. In 3D indoors and outdoors, at the game
tables and consoles; on the prod stack (Cloudflare tunnel) and the dev stack;
on laptops with integrated GPUs and on desktops.

## Decided (2026-10-23)

| Topic | Decision |
|---|---|
| The rule | Same behaviour, same pixels. Only wasted or repeated work goes |
| Order | Measure first; then the big wins (no double work in 3D), garbage, React, cascades, tables, network smoothing, workers |
| WebAssembly | Not now. The cost found is work done twice, garbage, React re-renders and GPU passes — none faster in another language. The only pure compute that's heavy (terrain chunks, the light bake) goes to a Web Worker first (the server already does: `land.worker.ts`); WASM reconsidered for `terrainAt` only if a measured number still says so after |
| The dev world | Measured as it is: the lag spec never puts a fixture back |

## How it is now (2026-10-23, from reading the code)

1. **The iso engine runs in full while in 3D**: `controller.frame` calls
   `engine.update(dt)` every frame. Every person's iso sprite is rendered by a
   second WebGL renderer and read back (`chars/iso.ts`), pets too
   (`art/pets-render.ts`), the iso land chunks, 1400 snow sprites, floor / light /
   dressing / label bakes, clocks, marker. The 3D view only reads objects, live
   panels and wall canvases from it; its canvas is hidden.
2. **The dark's own uncapped rAF loop runs for everyone**, indoors by day too
   (`dark/index.ts`), at the screen's rate, writing `innerHTML` and reading layout
   every frame.
3. **JSON and objects per player per frame**: `parseAvatar` for every player every
   frame, so every downstream cache misses and stringifies again; pets' looks parsed
   and stringified per frame; spreads per body; `engine.allObjects()` ×4 a frame.
4. **React driven from the frame**: `hud.set({ following: null })` every frame with
   movement input; `publishPeople` every 250 ms always new objects → the Minimap
   redraws every tile.
5. **Every 200 ms in 3D**: signature strings over the whole map and every object.
6. **Cascades**: a door swinging for someone or a seat taken → every nameplate
   recreated, light rebaked, 3D area rebuilt; every elevator phase replaces 5
   objects (remove + add on every client, a full grid rebuild on both ends).
7. **GPU**: 2× DPR, composer + ink + bloom, a 2048 sun shadow and the torch's every
   frame, 16 lights in every lit shader; 5–11k snow points moved on the CPU.
8. **Tables / TVs**: "no signal" static redrawn as 90 rects a frame; TV copies and
   uploads every frame regardless of view; pong's `ballAt` rebuilds keys per call.
9. **Network smoothing**: 110 ms behind, extrapolation walk-only and ≤150 ms;
   positions sent from the frame loop (a 30 fps sender sends 15/s).
10. **Server**: light at friends' scale; `/metrics` timed only the features' tick.

## Phases

0. **Measure** — `world/perf.ts` (the frame's stages, `__yutopia.perf()`), the dev
   overlay (Settings → Graphics → Show frame stats), `e2e/lag.spec.ts` (YUTOPIA_GPU=1:
   3D/iso × indoors idle / walking / outdoors, and two people; Chrome's own
   main-thread busy share), server `/metrics` with handler / hearing / patch /
   event-loop timings.
1. **No double work in 3D** — the iso engine keeps state, skips drawing; the dark's
   loop on the controller's frames, only when the dark can matter.
2. **Per-frame garbage** — parsed avatars cached by string, look keys once, no
   spreads per body, cached object lists, scratch vectors.
3. **React** — publish only on change; the Minimap's tiles drawn once.
4. **Cascades** — cached signatures; labels updated one by one; elevators update
   in place; no grid rebuild for non-grid props.
5. **Tables / TVs** — static at the eye's cadence; no copies of screens out of view.
6. **Others' motion** — positions from a timer; jitter-sized delay.
7. **Workers** — the client's terrain chunks and the GPS site plan.

## What the measuring found (2026-10-23) — it reordered the plan

Phase 0 first, then a CPU profile of each scenario. The reading of the code (above)
over-ranked the CPU work outside the 3D draw: in 3D the iso engine costs 0.4–0.8 ms a
frame, the dark's loop ~0.1 ms, a door/elevator cascade ~1 ms, the 3D signatures ~1.3 ms
every 200 ms, React well under 1%. **The lag is the 3D view indoors: ~28 ms of main
thread a frame (30 fps, 99 % busy — the heat), 4,800 draw calls** (outdoors: 142 draws,
6 ms). In that frame:

1. **A third went to three.js looking shaders up again.** Glass (and the free-hand cards)
   are see-through and two-sided; three.js draws such a material in two passes, flipping
   its side between them, and every flip marks the material changed: ~1,000 shader
   look-ups a frame. → each is two meshes now, back faces then front faces, made one
   after the other (they sort as three's two passes did: same depth, the next id), each
   side fixed (`tp/build.ts` `twoSided`). Same shaders, same order: the same picture.
2. **The rest was draws.** Stairwells (a box a step, a baluster every 12 cm: ~850 draws with
   their shadow), lifts (~500), the walls of every floor below mine (~1,450), parked cars
   (~1,000), each with the sun's shadow. → `tp/merge-static.ts`: still pieces one mesh per
   material: the stairwells and the lift cars (not their doors, lit buttons, lights), the
   solid parts of the walls of floors that aren't mine (mine fades its walls run by run;
   they're kept as they are, and come back when the floor is mine again). World3's built
   meshes have their matrices made once (only the cards turn).
3. **The phone's GPS froze the world ~4 s the first time it opened** (the whole site plan's
   land worked out on the main thread). → the land and trees in a worker
   (`grounds-plan-data.ts`, `grounds-plan.worker.ts`); the drawing as it was.

Left as they were (on purpose):
- **The lift landings**: their frame and the wall round them lie in one plane; merged, the
  sliver where they meet showed differently (a dashed flicker became a solid line).
- **Parked cars**: the sedan builder already merges each part per material; what's left at
  its origin merged saved 7 % of their draws but cost the grounds chunk 45 KB (taken out).
- **Glass and ink of the floors below**, merged: ~1,400 draws fewer, **~3–6 ms a frame
  more** — but a see-through thing merged blends in another order where an ink line and a
  pane overlap (a few pixels, up to 27/255). Not done: the look changes. **The user's call.**
- Phases 1–6 as planned: measured small for now (the numbers above); kept for later.

## Round 2 — what my floor hides (2026-10-23)

The user, after round 1: "I'm on a Mac M4 Pro and getting less than 50 fps on High". Round 1
left 3D indoors at 36–42 fps: ~2,100 draws in the main pass at ~7 µs each. From the top floor
most of them were the floors below — under my own floor's slab.

- **`tp/below-cull.ts`**: my floor's floor is an opaque slab at its level over every floor
  tile but the wells. A thing wholly below that level can only be seen where a line from the
  camera to it crosses the level off the slab (down a well, past the building's edge). Each
  candidate's box — every piece of the floors below, the stairwells and lift stops below — is
  projected from the camera onto the level; if every tile under the projection is slab, the
  main pass leaves it out (a summed table of open tiles: one lookup a box). Exact, not a guess:
  a box's projection lies within its corners' bounds, and a bigger box only keeps more drawn.
- **Shadows unchanged**: what's left out goes, for that one render, onto a layer the main
  pass doesn't draw. three r186 tests a shadow caster's layers against the *view's* camera
  (not the light's — `WebGLShadowMap.renderObject`), so a hook on the shadow pass gives the
  camera that layer for the shadow pass only. (The same means `CASTER_LAYER`'s comment in
  `grounds-stream.ts` — "seen by the sun's shadow camera only" — doesn't hold: the trees on it
  cast no shadow today. Left as it is: changing it would change the look.)
- **Proved the same**: every still rendered twice in one frame, culled and not: 26 fixed views
  and 650 random cameras (floors 2–4, inside and out, high and low, noon and night): 0 px.
  Two random cameras showed a difference before the shadow hook — that's how the layer test
  above was found.

| 3D, this Mac, High, 2× | original | round 1 | round 2 |
|---|---|---|---|
| indoors walking: fps | 30 | 36 | **60** |
| indoors walking: frame | 31.5 ms | 26.3 ms | **14.6 ms** |
| indoors: draws | 4,549 | 3,255 | **2,138** |
| outdoors walking: fps | 56 | 58 | 60 |

### Round 2b — the user's own view (2026-10-23)

The user, in the Tracking Room at 18:07 on a ~2000 px window: 38 fps. Round 2 had been measured
by the lifts at noon in a 1440 px window. At their view (evening: bloom and lamps on;
4000 × 2000 px) the 3D frame was 21.6 ms — **the parked cars in the lot were half the draws**
(906 + 510 shadow), outside the floors-below culling.

- The cull also takes **the parked cars** (`userData.still`, under the cars' root) **and the
  campus' pieces** — whatever three itself trusts the bounds of (no particles, sprites,
  instances, skinned or unculled meshes); their boxes made again only when they move.
- **My floor's walls** join the slab: a line that comes down over my floor (below the walls'
  top) and leaves it only through solid full walls (no window, door, glass, half wall; not faded
  see-through) can't get out. Exact the same way (summed tables of "a way out" tiles).
- **`tp.update` (5×/s) is skipped while nothing it's made from changed** (the controller's things,
  the engine's own changes — `engine.objRev` —, the floor, the map, the view): 15 runs in 3 s → 0.
- Worst angle in the Tracking Room: **21.6 → ~14 ms**; main-pass draws 1,897 → 1,093.
- Proved the same: 750 more random cameras (150 in the Tracking Room at 18:15), 0 px.
- **The user plays in Firefox** (its GPU process was at 111 % CPU). Firefox sends every WebGL call
  to a separate process: a draw costs it more than Chrome's. Everything here was measured in
  Chromium (Playwright's Firefox can't start inside the agent's sandbox).

### Round 2c — Firefox 44 fps (2026-10-23)

The user, in Firefox after 2b: 44 fps. Firefox pays more for each draw and each scene walk, so:

- **Shadow proxies** (`merge-static.ts` `shadowProxy`): a still model's shadow — a parked car's,
  a lift stop's — cast by one shadow-only mesh per shadow side (its triangles where they
  stand, on the shadow-only layer); its own pieces stop casting. Same shadow map; the shadow
  pass's draws at the Tracking Room 1,086 → ~410. During the shadow pass a proxied model's
  parts that cast nothing are switched off (not walked).
- **Hiding by visibility, not layers**: what the cull leaves out is `visible = false` while three
  collects what to draw (its whole subtree skipped), on again for the shadow pass that follows
  (a hook), back after. Never a thing with a light in it.
- **Parked cars**: pieces at the car's origin merged (bit-exact points) and part matrices frozen
  (`ThirdPersonView.stillModel`, called by cars.ts — no import of these helpers from the car
  chunk). Campus pieces culled mesh by mesh (their groups move inside it: a group's cached box
  went stale — found by the sweep). Card backs left out when the card's front faces the camera.
- Tracking Room, Chromium: live main thread ~7.2 → ~6.2 ms a frame; draws 2,096 → ~1,300.
- Proved the same: same-frame A/B (culling on/off; proxies vs originals) — 1,200+ more cameras, 0 px.
- **Budget**: the 3D view's chunk (counted as "grounds": it carries a copy of the Grounds) is
  183.1 KB > 180 with this code in it. The user's call: raise it, or split the cull into a chunk
  of its own.

Found on the way, not ours to fix here: **entering the world on the ground floor (the lot) in
3D throws ~1,300–1,800 WebGL INVALID_OPERATION errors while it loads** — the original code
too (`lighting.spec` "no GL errors" fails when Ana starts there; it passes from floor 4).

## Checking it looks the same

`stills` (scratch tool, in-game 3D renders from fixed camera poses, the hour and the storm
held): before/after pixel diffs. Indoors (floors 0–4, stairwells, lifts): identical (0 px)
for every change kept. Outdoors only snow, film grain, the visitor's car moving and Vortex
wandering differ between any two runs. The GPS map: identical (0 px).

## Numbers

Baseline and each phase: `pnpm --filter @yutopia/client exec playwright test e2e/lag.spec.ts`
with `YUTOPIA_GPU=1` (this Mac, the dev world as it is, High, 2×, 60 fps cap, the hour held at
13, no storm). Before/after back to back (only the optimisation files stashed):

| Scenario | fps | main-thread frame (avg) | draws |
|---|---|---|---|
| 3D indoors, idle | 32 → 42 | 29.4 → 22.4 ms | 4,742 → 3,346 |
| 3D indoors, walking | 30 → 36 | 31.5 → 26.3 ms | 4,549 → 3,255 |
| 3D outdoors, walking | 56 → 58 | 8.9 → 9.3 ms (noise) | 213 → 147 |
| iso indoors / outdoors | 60 → 60 | unchanged | — |
| GPS, first open | 4.1 s frozen → no frame over 40 ms | | |

Server (`/metrics` now has handler, hearing, patch and event-loop timings): tick 0.5 ms,
patch 0.04 ms, hearing 0.1 ms with friends' numbers — not the lag.

## Round 3 — the pixel ratio kept to the screen (2026-10-24)

Found by the performance reports (`39-the-telemetry.md`) on the user's own play: Firefox,
a 2560×1440 monitor at 1×, nothing moved or zoomed. The first page load drew the 3D view
at **2×** (canvas 5120×2546, 4× the pixels) and the Tracking Room ran at **29.5 fps**; after
a reload the canvas was 2560×1273 and the same room ran at **57 fps**. The user had noticed
it: "after reloading 2–3 times the game ran better".

The 3D view read `devicePixelRatio` once, when it was built; the browser said 2 at that
moment and 1 from then on (why Firefox did isn't knowable from here), and nothing looked
again. Now `TpView` (`tp/view.ts`) keeps the ratio a fresh load would pick
(`ratioFor(quality)`: High up to 2, Medium up to 1.5, Low 1): checked about once a second
from the frame, on the screen's density changing (`matchMedia` resolution), and on every
resize. Any browser; it also covers windows moved between screens, browser zoom and system
scaling (2× → 1× stops wasting pixels, 1× → 2× stops being blurry).

The reports now carry the 3D ratio, the ratio and density it started with, and how often
it was put right (`machine.ratio`, `ratioAtStart`, `dprAtStart`, `ratioFixes`), so a friend
hitting it shows up on `/admin/perf`'s data.

- **Reproduced**: a page told 2× while the 3D view starts, then 1×: before, 2× for good;
  now 1× within ~1 s, on High, Medium and Low. A screen change mid-game (CDP) followed in
  ~1 s (headless Chromium sends no media-query event: the once-a-second check did it).
- **Same picture**: 16 stills (8 places × day and night) after the fix-up against a fresh
  1× load with the same cameras: 15 identical, one 4 px by 1 level (live outdoors).
- **Not covered**: the iso view (Pixi, `engine.ts`) reads its ratio once the same way;
  its code is page code, and the page has 7 bytes of budget left — the user's call.

## Round 4 — the floor as few meshes (2026-10-24)

The user, in prod: 38–42 fps in their office on floor 4 (Firefox), 56–60 outdoors. Prod's
world was measured here as it is: the API's `/internal/world` saved on the server and served
by an offline world-server (`YUTOPIA_WORLD_FILE`, apps/world-server/src/config.ts), the
session rewritten to it, standing in the Serious Office (Chromium, 2560×1273, 1×).

**What it was.** Floor 4 there is 64×48 with 798 objects (~245 wall pieces, 253 windows). The
scene held **8,578 objects**, ~7,100 of them visible to three, which walks every one every
frame (world matrix, frustum test, lists) to draw ~700: ~5 ms before any draw; then ~1,850
draws (~2,570 with the shadow). The 3D view made every piece that could fade (each 4-edge
wall run, each tall thing) or turn to the camera (cards) a mesh of its own, fading by
swapping in a cloned material; only the floors below had their walls' solid parts merged,
with the originals left in the scene hidden. Most of a furnished floor's meshes are see-
through (glass back and front, ink outlines, cards, decals).

**What changed** (build.ts World3, view.ts, games3d.ts, merge-static.ts):
- Every floor drawn merged an area (6×6 tiles) at a time, one mesh per material, the pieces
  held out of the scene. Each merged point carries its fade group (`aFade`); a group that
  fades has its points dropped by the shared material's shader (a flags texture) and its own
  pieces put back, faded exactly as before; whole again, merged again. The merged meshes use
  the shared materials themselves (the same draw order among the rest).
- **Glass and ink merged too** (`setMergeClear`, on — the user's call, 2026-10-24): where two
  see-through pieces overlap they blend in the merged order. An outline crossing glass a few
  levels lighter or darker.
- The pieces that stay apart (cards, decals; glass and ink if not merged) in a group an area,
  left out with one test when the area is out of the rendering camera's view
  (`scene.onBeforeRender`: the view's, a car's mirror, the warm-up's). None casts a shadow.
- Parked cars out of the rendering camera's view off for that render only (back on for the
  shadow pass: they cast; back after: the cars' code shows and hides their models).
- The games' still pieces (cables, pads at rest and their cords, LEDs) merged, again when one
  changes; a held pad and its cord drawn themselves.
- Floors above mine out of the scene (were hidden: still walked); a floor's root matrix made
  when it moves.

**Numbers** (3D frame CPU per frame, the same page alternating old and new, Chromium):

| World | Before | Exact changes | + glass and ink merged |
|---|---|---|---|
| Prod, the Serious Office | 12.8 ms, 1,848 draws | 10.7 ms, 1,305 | **7.6 ms, 965** |
| Dev, the Tracking Room | 8.1 ms, 1,221 | 6.9 ms, 955 | **5.9 ms, 790** |

Objects three walks: 8,578 → 5,120 (visible to it: 7,138 → 3,114).

**Same picture.** `e2e/merge-ab.spec.ts` (YUTOPIA_GPU=1, as Bia): every camera drawn both
ways in one frame (`tp.setUnmerged`), 7 spots × 10 cameras (chase with fades, free, noon and
night). With glass and ink apart, a pixel may differ only where the old picture itself
changes when its own ties are broken another way (two opaque faces in one plane — a window's
frame flush with its wall: whichever three drew last won, by the camera); with them merged,
<1 % of pixels and <0.02 % far off. Measured on prod's world as well (80 cameras): exact
parts only ties; the games' pads ≤4 levels at their edges (their places baked into the merged
points); glass and ink merged: 0.1–0.5 % of a frame's pixels, mostly ≤16 levels, a few dozen
up to ~200 where a dark outline crosses glass over something bright.

**Playing prod's world here**: `node tools/prod-world.mjs <world.json[.gz]> [uid] [name]` — an
offline world-server on :2667 loaded from the saved world and a Chromium window pointed at it
(signed in as Ana, in that world `uid`, default 1: Sam); closing the window stops both.

**Found on the way** (not changed): the round-2 below-floor cull leaves out 1 px in 1 of 70
cameras on prod's world (both before and after this round); a faded wall or tall thing loses
the lamps' light map (its cloned material drops the light patch); the 3D view's own chunk
(~77.5 KB gzip) is under no budget (`yutopia-grounds` counts other files).
