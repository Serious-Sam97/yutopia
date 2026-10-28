# The volume — one world in 3D, on Jolt Physics (plan, 2026-10-27)

Ask (2026-10-27, flying over the Grounds after docs/plan/49-the-height.md): "Ainda errado,
perai precisamos arrumar uma estrutura base do game, parece que tudo roda em um layer só, como
se altura das coisas e onde o player está seja algo mais fake do que realista. Agora por
exemplo, estou voando, mas uma cerca lá no chão não me deixa passar kkkk. Então precisamos
rever isso e deixar a altura das coisas algo realista, lembre-se que o 3D é o modo principal do
Yutopia, o isométrico era o inicial, mas agora está obsoleto, por isso precisamos rever a
estrutura. Lets plan". Then: "Hum essa ideia de um motor de física completo me chama atenção"
→ a web search, the top 3 (Rapier, Jolt, PhysX), a prototype of Rapier and Jolt side by side
on the real Grounds, twice (`tools/physics-bench/RESULTS.md`) → **"Jolt"**.

## Where we are

The world was built for the isometric view, and its structure still is. Height was added on
top, piece by piece (jumps, stairs, the land, standing on tables, the cars); it was never the
base.

1. **Collision is a flat map of columns** (`shared/grid.ts`). Each tile is walkable or not and
   has one "top" to stand on; anything you can't stand on is `Infinity` tall. Walls on tile
   edges block at every height. Out on the Grounds (`grounds.ts` `outdoorsAt`) every fence,
   tree, lamp, the tower, the statue, the Kart Park's fences and stands, every town building is
   an unwalkable tile: a column to the sky — the fence that stops a flier. The only real
   volumes are the parked cars (`SolidBox`).
2. **Heights are iso pixels.** The catalog's `h` is a footprint's depth; heights that exist are
   iso px (`WALL_H = 128`, `standHeight`, `surface`); the 3D view divides them by `ZPX`.
3. **Each floor of the building is its own map** (`levels.ts`): nothing is over or under you in
   the same space; flying up indoors meets no ceiling.
4. **Reach and harm are measured across the floor** (`Math.hypot(dx, dy) < REACH`, ~40 places);
   plan 49's *aloft* gate is a patch over it.
5. **Iso is still the default and on the page**: new players start in iso (`lib/prefs.ts`); Pixi
   is ~92 KB of the page's 561 and `world/engine.ts` (3,730 lines) holds world state the
   controller and the 3D view read.
6. **The grid's callers**: the move sim and the walker, the controller and actions, A*
   (`shared/path.ts`), the server's `pos` / `teleport`, pets, cars, the dark, Vortex, the pool
   balls, the guns — ~16 files.

## The choice: Jolt Physics

`jolt-physics` (JoltPhysics.js, MIT) — the C++ engine of *Horizon Forbidden West*, compiled to
WebAssembly; the same code in the browser and on the Node world server. Measured against Rapier
on the real Grounds (`tools/physics-bench/RESULTS.md`):

- **Players: 5–7× less CPU** — 200 on the whole Grounds in ~1.3 ms a tick (~8% of a core at
  60 Hz; Rapier ~7.1 ms). Its character (`CharacterVirtual`) steps, climbs, slides and stops at
  ceilings with no tuning (8 / 8 behaviour checks).
- **Smaller**: 592 KB brotli (Rapier 858); less memory.
- **Deterministic in every test**: the same results bit for bit on Node arm64, Chrome and Node
  x86-64, for players and for falling things — though the ready-made build doesn't promise it.

What it costs us, and so the guardrails (below): fixed sizes chosen up front (running out
*aborts the process*), memory freed by hand from JS, small fast things falling through the land
by default, a C++-shaped API.

## What we want

**One world in 3D.** Every solid thing is a real shape with a height. A body is a capsule (1.8 m).
Where you can go, what you stand on, what's over your head, what you can reach and what can hit
you are all asked of one physics world — the same on the server and in the browser. The 3D view
is the game; iso goes.

- Flying over the company's fence (1.2 m) at 2 m: you pass. Walking into it: it stops you.
- Into a tree's trunk: stopped; over the tree: free.
- Flying up inside the HQ: the ceiling stops you; through walls on, you come out on the floor above.
- A mug on the floor 3 m below: out of reach, because it's 3 m away.

## Guardrails (from the prototype; built in from the first phase)

1. **Sizes, never an abort.** `mMaxBodies`, body pairs and contact constraints set from the
   world's own counts with headroom (×2), checked before every body is added: past the limit
   the add is refused and logged, never handed to Jolt. The counts on the server's `/metrics`.
   A test loads the whole world with 300 players and 500 falling things.
2. **Continuous collision on everything small and fast** (`EMotionQuality_LinearCast`): the
   factory sets it; nothing makes a body any other way.
3. **One owner of every Jolt object.** A `PhysicsWorld` (shared) creates and destroys bodies,
   shapes and characters; feature code never touches the `Jolt` module. Its scratch objects
   (vectors, rays, collectors) are made once and reused. A long-session test (players joining
   and leaving for 20 simulated minutes) keeps Jolt's heap flat.
4. **Determinism checked, not assumed.** The bench (`tools/physics-bench`) runs in CI: its hashes
   on x86-64 must equal the recorded ones; the Jolt version is pinned exactly and only moves
   with the bench. If a hash ever differs, we build Jolt ourselves with
   `CROSS_PLATFORM_DETERMINISTIC` (the official guarantee).
5. **Off the page.** Jolt's WASM loads with the 3D view's chunk, not the world page; the
   server loads it once at start.

## The design

### A. Shapes in metres, for everything

A table in shared (`shared/shapes.ts`): for each catalog kind, its solid parts as boxes,
cylinders and capsules in metres over its footprint — a desk its top and legs as one box, a
chair a low box, a lamp a thin cylinder, a sofa two boxes. Walls: a box along each wall edge,
3.27 tall, 0.2 thick, with doors cut to their opening (a lintel over) and windows to their sill
and head. Floors: a slab per storey. The Grounds: the land as Jolt heightfields in chunks; trees
a trunk cylinder (the canopy open — see the questions); the fences thin boxes along their lines
(1.2 m; the Kart Park's 1.0); lamps poles; the tower, the statue, the stands, the bridges' rails;
the town's buildings boxes to their roofs. Statics merged into one compound per 32 m chunk
(the prototype's `chunk32`).

Heights in iso px leave shared data (`standHeight`, `surface`, `WALL_H` become metres). A client
test checks each 3D model's bounding box against its shapes, so the drawing and the physics
never drift apart.

### B. The physics world (shared, both sides)

`shared/physics/` — `PhysicsWorld` (guardrail 3) over Jolt: built from the map, the objects and
the Grounds; build mode's edits add and remove bodies as they happen; the parked cars as
kinematic bodies from the car sim (it stays the cars' driver). The server and the browser build
the same world from the same data.

### C. The body

A `CharacterVirtual` per player.

- **The browser moves me** with it (the walker: walking, running, crouching, jumping, the
  vaults and mantles re-based on Jolt's shape casts, flying, through walls, fast).
- **The server checks each move** as now — the client says where it is, the server decides if it
  could be — but with Jolt's answers instead of the grid's: the capsule cast from where it was
  to where it says (nothing in the way), its shape there (not inside anything), something under
  its feet within a step (unless it flies), no faster than its pace allows. Lighter than
  simulating everyone, and the same netcode (snaps, allowance) as today.
- **Powers**: flying is no gravity and no stick-to-floor; through walls a filter that lets the
  capsule pass statics; fast a higher pace.

The grid stays — derived from the same shapes at the floor's height — for A* and those who walk
by paths (pets, the shades, Vortex, the park's folk, click-to-walk), until it's worth giving them
a navmesh.

### D. One building

The HQ's floors become slabs in one space: each floor's shapes at its storey's height. A floor's
index stays (rooms, hearing, the HUD, build mode go by it) but is *where you are*, from your
height — not a separate world. The stairs and lifts are shapes and moving platforms. Flying up
meets the ceiling; through walls you come up on the next floor. The deepest change; its own phase.

### E. Reach and harm in 3D

One shared `reach(hand, thing)` — the hand at feet + 1.2 m, the thing's shapes, a ray for line
of sight — replaces the ~40 flat checks, feature by feature, server and client prompts alike. A
body's capsule for what hits it (a shade's swipe, a car, a high-five). Plan 49's *aloft* gate
falls out of it, and goes.

### F. Things that fall (later)

What's dropped, thrown or knocked over as real bodies (LinearCast — guardrail 2): the dark's
loot, a held mug let go, snowballs. Pool and ping-pong keep their own exact sims.

### G. 3D only

The default view 3D; the world's state out of `engine.ts` into a renderer-free model; iso's
drawing off the page (~100 KB); the minimap as a 2D canvas; build mode in 3D (`tp/build3d.ts`);
a 3D "Lowest" tier for weak machines.

## Phases

0. **The bench in the repo** — `tools/physics-bench` (kept from the prototype: done), its
   dependencies (`jolt-physics` pinned), a CI job: the behaviour checks, the determinism hashes
   on x86-64, the long session's heap (guardrails 3–4). *Done 2026-10-27*: `@yutopia/physics-bench` in the
   workspace, `pnpm physics` (`check.mjs`) and CI's `physics` job; `pnpm budget` fails if a page
   carries Jolt (guardrail 5). All 14 checks green on arm64 and on x86-64 (Docker, scenes made there).
1. **The shapes table** (A) — every catalog kind, the walls, doors, windows, floors, the Grounds'
   solids, in metres; a page to review it (the odd ones flagged); the model-bounds test. *Built
   2026-10-27, for review*: `shared/shapes` (the kinds, walls, openings, slabs) and
   `shared/shapes/grounds` (65,702 solids, at most 99 a chunk); the model-bounds test
   (`tp/shapes.test.ts`: every kind at every turn against its model as drawn); the review as a
   private page (a `/dev/shapes` route costs the page 53 B of chunk-order noise: the user's call).
2. **The physics world** (B) — `shared/physics/` with guardrails 1–3, built on the server and in
   the browser; a debug view in 3D (admins: every shape as a wireframe, from the Powers page). *Built
   2026-10-28*: `shared/physics` (PhysicsWorld, WorldBuilder; guardrail 1 also guards Jolt's heap —
   a fixed 128 MB that never grows, ~34 MB for the whole world, running out aborts Jolt: no world
   or add without room); the server's `features/physics.ts` (one world a process, the Grounds from
   the land worker, edits diffed, /metrics); the browser's for admins (Powers → Physics shapes,
   `tp/physics3d.ts`); `pnpm physics` loads the whole world with 300 bodies and 500 things and runs
   20 minutes of joins. Jolt's browser chunk is 1,025 KB gzip (the wasm inlined as base64).
3. **Movement on Jolt** (C) — the walker on `CharacterVirtual`, the server's check on Jolt's
   queries, the powers; the move tests carried over (jumps, vaults, stairs, snaps). *Built
   2026-10-28*: shared/move's body keeps its input, gaits, jumps and verbs; its physical step is a
   `Mover` — the grid's way (iso, and 3D till Jolt's in) or `CharacterMover` (Jolt's
   CharacterVirtual: walls, steps of the spec's 0.27, slopes, kept to the floor a step down indoors,
   0.6 on the land); the probes and the server's check ask `JoltCollider` (fits, ground, clear);
   object layers (walls apart from slabs: through walls still stands on floors) and each person's
   own locked doors passed (a body filter); lifts' walls and shut shafts, stairwell rails; the
   flights' treads two risers thick (the flight below walks under the next). Carried over: the move
   tests on Jolt (jog, jumps, coyote, vault/mantle, steps, wall slide, roll, ceiling, ledge, the
   HQ's stairs to the next floor); the server takes a flier over the fence and puts a walker back;
   e2e: the verbs, the fence, the shapes view.
4. **The Grounds and the town for real** — every solid out there its shape and height: fly over
   the fence, walk into it. *Built 2026-10-28*: an audit of every Grounds tile — the grid's
   walking against Jolt's solids (`physics/audit.ts`, in `pnpm physics`: no tile Jolt blocks with
   nothing there, the fences thin on both, the rest of the drift capped). The fences are walls on
   the tiles' edges (thin as drawn; cars keep the band); the world's edge an invisible wall (100
   under the land to 200 over it); the land never in a body's way (the collider's fits: only the
   ground); the bridges' decks follow their roads (a lip, never a step); the bus shelter walked
   into, the steeple and the clearing's bench where they're drawn; a pine's spruce (its height)
   one shared choice. The server takes a move either the grid or Jolt allows till iso goes (phase
   7: iso walks the grid). Left by design: a tree blocks its tile on the grid (its trunk's round),
   steep tiles, a bridge's guard strips; the stands' aisles (sat on, not climbed).
5. **Reach and harm in 3D** (E) — feature by feature; plan 49's gate removed. *Built 2026-10-28*: shared
   `reach.ts` — the hands reach from what you stand on to 2.1 over your feet: within that band a
   thing's as far as it is across the floor (every feature's own reach stands), out of it the
   height's gap counts; a thing's height its shapes'; two bodies, each its whole height (a
   high-five, a revive, a shade's strike); a car's door and knock, the shuttle, a bay, the kart
   desk, the park's seats, loot on the ground by what they stand on. The server's `reach3` /
   `reachSpot` / `upOff` (WorldRoom) wrap each feature's flat distance; sight from the hand on
   Jolt (`sees`: walls, floors, locked doors, the land — a wall layer of their own; a door's asked
   none, being in its wall). A knock now needs its room's walls in reach. Plan 49's gate (the
   TOUCH list, `aloft()`, the harm skips) is gone; `ALOFT` stays for the 3D camera, and the
   client's prompts keep the page's 2-tile rule (the same as the band for things on the ground;
   a per-thing one when the page shrinks, phase 7).
6. **One building** (D). *Built 2026-10-28*: much of it already stood — Jolt's world is the
   building's (every floor's walls and slab at its storey, phase 2), the 3D view draws the floors
   below mine and everyone where they are in the building, the stairs change floor by the feet's
   height. What was left: the floor is where you are from your height *anywhere* in the building,
   not only on the stairs (shared `floorAt`: past a storey's band, the floor up or down that has a
   floor under you, as many as you've gone; over the roof or out through a wall up a floor,
   outdoors — the ground floor's frame); the client takes it every step, the server takes a floor
   change where the new floor has a floor under them (a floor at a time, a flier any). Flying, the
   ceiling stops you; through walls and flying (`ghost`: only the land meets you) you go up through
   it onto the next floor, and down through floors the same way; through walls on foot still
   stands on floors (stopped in a slab, flying off, Jolt puts you up on it: the server lets
   through walls rise to the floor under them). The studio's flying in admin.spec now goes as high
   as its ceiling (it's the top floor, under the roof). `/page` 414.4. A roof over the top floor (a slab where the next floor's would be). Checks: the
   HQ's stairs walked up on `floorAt`; a flier stopped by the ceiling and the roof, a ghost up
   through every floor and out over the roof (shared physics tests); the server takes the ghost up
   a floor and puts back a walker who claims it (physics.test); e2e `one-building.spec`. The lifts
   carry their riders (the user's call, after): on the way the car takes them up or down the shaft
   — the server moves each rider every tick on the ride's own curve (shared `rideAt`), their floor
   the one it's passing (`floorAt`), their own moves not taken meanwhile (`room.carried`;
   `moveTo(…, { z, carried })`, no snap till it stops); their client the same from the stops'
   props (the controller's `liftCarry`: my height the car's floor's, my floor changing as it
   passes one); the 3D car raised with me (`liftRise`), the camera in it held to it (`snap`: eased,
   it lagged out through the car's ceiling, and each floor passed moves the frame a storey); the
   panel shows the floor it's passing. Everyone on a floor hears the riders as they pass it. The
   slabs stay whole in the shaft (nobody's moved there by Jolt: the car carries them). Checks:
   `lifts.test.ts` (every floor on the way down, between floors, one way, the moves meanwhile not
   taken, one snap where it stops); e2e `one-building.spec` rides 4 → G → 4 in 3D (every floor,
   in the car all the way). `/page` 414.6.
7. **3D only** (G) — the page budget lowered to what it measures. Goes before 6 (the user's call,
   2026-10-28). Mapped first: the iso engine (`world/engine.ts`) still runs, unseen, in 3D — it
   holds the client's model (things, people, displays, the day, build mode's ghosts) and 3D reads
   it and routes its clicks through it; Pixi reaches the page through engine.ts, art/scene.ts,
   art/pawn.ts and art/textures.ts. In steps, each checked before the next:
   - **7a. 3D the only view** — the default 3p (a stored iso becomes 3p); T and Settings choose 3p
     or 1p; pong and pool stop switching views; no fall back to iso; the server takes Jolt's word
     alone on a move (the grid only with physics off). *Built 2026-10-28*: prefs' `view` is 3p | 1p
     (`last3d` gone); Settings' view choice two-way, mouse look always shown, "(beta)" dropped; T
     unbound (in the world, pong and pool); pong's switch into 3D for a match and the gun's gone;
     the controller always opens the 3D view — failing, a toast and another try on the next prefs
     change (till 7c the unseen iso engine shows through then); WorldRoom's move check asks Jolt
     only. `/page` 560.8. The specs written for iso now run in 3D and some fail (world.spec's
     screenshots time out, use-things' radios): 7e's.
   - **7b. The model out of the engine** — a renderer-free `WorldModel` (objects, avatars' state,
     displays, the day and light, build mode's look and pointer); the controller, the HUD, build
     mode and the live rooms read it. *Built 2026-10-28*: `world/model.ts` — the things on my floor
     as they are this moment, who's where, the wall displays (their panels drawn in canvas 2D now:
     the VU board, NO SIGNAL / — NO BOARD —, ● LIVE, the whiteboard's miniature), the hour, build
     mode's look (with my arrival pin, `mine`, drawn by build3d outside build mode too), the pointer
     in client px; what's on the screen where it asks the 3D view (`model.view`: picks, project,
     floorAt, rayAt, lookedThrough, puff). `controller.hostRect()` / `host` for what was the Pixi
     canvas's rect and parent.
   - **7c. Pixi off** — the engine's drawing and the iso-only modules gone (grounds-iso,
     weather-iso, life, post, the rooms' and tables' iso parts, rig-draw, the snow theme, pawn,
     textures); the screens' panels (VU board, NO SIGNAL, the whiteboard) in canvas 2D; build mode
     on the 3D canvas (pointer, cursor, arrows by the camera, facings named for the camera); the
     minimap's ± zoom the 3D camera. *Built 2026-10-28*: engine.ts deleted, and grounds-iso,
     grounds-items, kart-iso, weather-iso, pawn, textures, scene, life, post, rig-draw, glow, the snow
     theme's backdrop, the dev shots page; `pixi.js` out of the client's dependencies. The live rooms
     (games, media, os), the slot cars and the tables keep their logic and their 3D outputs; their
     iso camera lean-ins, sprites and floor glows went (3D never drew the slot cars' start gantry, the
     screens' night glow on the floor or the projector's beam: dropped, not ported). Build mode on the
     model: the cursor on the 3D canvas, the arrows by the camera's yaw, facings S/W/N/E (rot 0–3, the
     shared convention: iso's labels had rot 1 and 3 swapped), no far side. The dark, the cars, the
     GPS and the HUD read the model; telemetry and the server's perf report know no iso stages.
     `seedOf` its own module (art/seed.ts): light.ts took the item-art kit into every lazy chunk with
     it once the page stopped carrying it (yutopia-grounds 219 → 185.8 KB).
   - **7d. A Lowest tier** — no antialias, a lower pixel ratio, no post, no shadows, fewest lamps.
     *Built 2026-10-28*: prefs' Quality has `lowest` (Auto picks it on ≤ 2 cores or ≤ 2 GB, and steps
     down to it after Low); Settings shows it; the 3D view: ¾ of a pixel a pixel, 2 lamps, no shadows,
     no finish, blob shadows and the people's lower LOD, no antialiasing when it starts on Lowest
     (the renderer's made with it; a step down mid-game keeps what it had).
   - **7e. The tests and the budget** — the specs that ran in iso run in 3D; iso's own specs and
     unit tests go; `/page` lowered to what it measures. *Built 2026-10-28*: `/page` 414.3 KB, its
     budget lowered 561 → 415; the visual suite (`apps/client/visual`, its config, the CI job) gone
     with iso. Specs: iso-shots, room-shots, frame-time and walk-angles deleted, and iso halves of
     night-shots, third-person-shots, kart-play, pool and slotcar; the rest run in 3D (helpers:
     `holdCamera` for iso's pinned camera, `screenAt`, the GPU flags on every page). Run one at a
     time with `YUTOPIA_GPU=1`: all green but the known reds (car passenger, first-person facing,
     grounds' long walkTo) and town's worst frame (both riders in 3D now: the other browser
     streaming the town stalls the first's frames, 50–83 ms against < 50). The run found two app
     regressions, fixed: the arms' number keys took an action menu's pick while walking (the menu
     now keeps them), and a thing dragged onto the catalog's bin stayed (the 3D canvas holds the
     pointer through a drag: the bin's checked where the pointer is). Not run: floors.spec (still
     reads `__yutopia.engine` at 144 and 153: `model` now) and zz-load, not ours; night-shots
     (it rewrites the tracked night shots).
   - **7f. The prompts on the shared reach** — the client's prompts ask `reach.ts`, like the server.
     *Built 2026-10-28*: the controller's `offBand` / `reach` (reach.ts `offBand`: what the thing
     stands on, its shapes' span, my feet) for the nearest usable thing and for using one; the
     2-tile aloft rule gone from the client too. The server's `upOff` / `reachSpot` use the same
     `offBand`.
8. **Checks** — e2e: the fence walked into and flown over, the HQ's ceiling, through walls up a
   floor, a mug from 3 m up, a car passing under a flier; the bench in CI; perf in 3D on a weak
   machine; 200 players on the world server. *Done 2026-10-28*:
   - The fence (`fence.spec`), the HQ's ceiling and through walls up a floor (`one-building.spec`).
   - From 3 m up (`one-building.spec`): a thing dropped on the snow, flown 3 m over — no prompt and
     the server won't hand it up; down by it, picked up. (A mug: indoors the ceiling stops a flier
     at ~1.5 m now; the server's own mug check stays in physics.test.) It found the dark's prompts
     — pick up, search a spot or a locker — still flat: now across and up or down (the controller's
     `offAt`, shared `offBand`; the dark's chunk asks it, not reach.ts, for the page's sake).
   - A car under a flier (`car.spec`): Bia drives on under Ana 3 m up, not knocked; with Ana on the
     ground it stops short of her. It found the car's own sim taking every person on the ground
     floor for an obstacle, any height: now not one over its roof (`CAR_ROOF` 1.5, the server's
     CAR_H). Checked to fail without it (the car stopped 2.3 m on, under her).
   - The bench in CI: the `physics` job (`pnpm physics`: behaviour, hashes, heap, the whole world,
     the Grounds' audit) — as set up in phase 0.
   - 200 players (`BOTS=200 pnpm perf`): ticks 0.6–0.7 ms on average (budget 4), the moves checked
     on Jolt ~36 µs each (3,900 a second), every message ~14% of a core; nobody honest put back.
     Two things in the harness fixed: the bots step by the time since their last move (sharing the
     server's thread at 200, their timers bunched and looked like a dash), and they join once the
     physics world's land is built (moves there were the grid's word, then Jolt's). CI keeps 60.
   - A weak machine (`weak-machine.spec`: 2 cores and 2 GB said, the CPU slowed 4×): Auto picks
     Lowest; on this machine's GPU 20 fps (median 50 ms) in the studio, the Grounds and the town —
     the 3D view's frame ~39 ms of ~46 (logic ~6): CPU-bound, the draw submission. Without the
     slowdown a steady 60. Chrome's software GL is ~1–5 fps there (logged, not held: far slower
     than any real GPU). Held: the tier, and 15 fps on a real GPU.

## Open questions

Settled with the user 2026-10-28, after phase 5:

- **Iso: gone entirely?** Yes — 3D the only view, with a 3D Lowest tier.
- **Trees**: the trunk only (as built in phase 4) — walked into, flown through the canopy.
- **One building (phase 6)** before or after 3D-only (phase 7)? After: phase 7 goes next — it frees
  the page (~100 KB) and drops the grid's fallback, so the one building is built once, for 3D.
- **The server**: checking moves with Jolt (as built); simulating every player from their inputs
  only later, if cheating shows it's needed.
