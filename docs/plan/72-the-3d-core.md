# 72 — The 3D core (no more 2.5D)

Ask (2026-11-04): "QUERO retirar completamente qualquer dívida que temos com o 2.5, estamos indo a
caminho de um jogo em 3d de mundo aberto com estruturas complexas, avião e os caralhos kkkk. Então
bora arrumar tudo isso! PS: sobre as mudanças para a parede para não travar pode continuar sim, pode
adicionar uma phase sobre isso. LETS PLAN"

Planned 2026-11-04, after two investigations the same day: `71-the-renderer.md` (stay on three.js;
the limits are WebGL's and our own shape, not three's) and a health audit (below, "Why"). Follows
`50-the-volume.md` (Jolt, iso gone as a *view* — but not as a *model*), `67-the-furniture.md`
(the native kit; its "retire the iso art" step never done), `38-the-lag.md`, `53-the-god-mode.md`.
Workflow rule: mocks first for anything the user sees or touches (phase 0), approved before code.

**What this changes:** the game stops being a tile map with a 3D view on top. Today a building is
five 2D maps (`tiles`, wall *edges* as strings, rectangles for rooms) stacked 3.5 m apart and placed
by their corners; things sit on whole tiles facing one of four ways; heights are iso pixels; a tile
grid decides where you can stand, arrive and walk while Jolt decides what you bump into. After this
plan the world is **one 3D space in metres**: walls are segments at any angle (curves too), slabs at
any height, things anywhere at any turn, the floor you're on is just your height, **Jolt is the only
truth** for solid and standing, and paths come from a navmesh. Nothing of the iso era is left in the
model, the server, the drawing or the tools.

## Decisions (the user's, 2026-11-04)

| | |
|---|---|
| Walls | **Free-form now**: segments at any angle and length, curved walls too, real base and height. (Not the Sims-style grid edges) |
| Things | **Free + snap**: position in metres (x, y, z), any turn; the tool snaps to the grid and to 90° by default (a key for free) |
| Floors | **Real heights**: slabs at any height — mezzanines, ramps, split levels, roofs you walk on. "Which floor" is worked out from your height, never stored as a frame |
| Engine | **Stay on three.js** (no Babylon spike). The drawing phases are written for three, shaped as plan 71 says (draw lists, one material family) |
| The wall freeze | **Keep the fix** (World3.relayout, uncommitted): its own phase, now |
| Scope | **All of the audit**, not just the iso model: hardening, CI, typed state, the god objects |

## Why (the audit, 2026-11-04)

- **Two truths.** The tile grid (`shared/grid.ts`) still decides standing, arrival, teleports,
  seats and A* paths (~70 call sites in 18 files, 29 in pets alone); Jolt decides collision. CI
  allows up to 1,000 tiles of disagreement (`physics/audit.ts:163`). Recorded bugs from it: falling
  through unbuilt land (plan 53), stuck poses on roofs (56), pets left on the bank (66), slopes (69).
- **Units.** One constant, 39.19 px a metre, under five names plus ~15 bare copies; wall height has
  four different values (128 px, 3.27, 3.5, 1.6); `STOREY` is copied in three files.
- **Frames.** Floors re-based by integer `ox`/`oy` (`across`, ~160 refs to the level model); the
  building's frame shifted to the world's by `GROUND_OFFSET` in 13 files with mixed signs.
- **Integers everywhere a float would go.** `putObject` does `x|0`, `rot%4`; the schema stores
  `int16`/`uint8`; the API validates and casts to int (three layers that would silently floor).
- **Rooms are rectangles**; doors, windows and wall items live on grid edges; light and the floor's
  look are baked in plan space through an iso transform; four ways to draw a thing; 11 map
  conversions run at every server start.
- **Fragile:** one exception in any of the 42 features' tick kills the world-server (no try/catch,
  no `uncaughtException`, verified); `/health` always says ok; a failed layout save isn't retried;
  the client has one error boundary (the phone), no ChunkLoadError handling, no error reporting.
- **Tests:** unit green (shared 590, client 271), world-server 203/205, ~18 e2e known red since
  10-24, e2e and the API's tests not in CI. Room state typed `any` in 10 client modules.
- **God objects:** `controller.ts` 4,771 lines / 32 concerns, `view.ts` 5,685 (render + input +
  physics), `frame()` 375 and 580 lines.

## The target model

One world frame, metres, **x/y the ground plane, z up** (as the shared code has it today; three's
y-up stays at the drawing's edge). The building's frame disappears: the migration moves everything
by `GROUND_OFFSET` once.

**Structures** (shared `structure/`, replacing `MapDef`/`LevelDef`/`AreaDef`):

- **Wall** — `{ id, a: [x, y], b: [x, y], bulge?, base, height, thickness, front, back }`: a
  segment, or an arc (`bulge`, as DXF), standing on `base` (metres), its two faces' materials.
  Walls meet in a graph (shared endpoints): joints are mitred, posts only where the look wants one.
- **Opening** — a door, window or arch *on a wall*: `{ wall, at (metres along it), width, sill,
  head, kind }`. It moves with its wall. Hung things (pictures, shelves, TVs) likewise:
  `{ wall, side, at, z }`.
- **Slab** — `{ id, outline: polygon, holes: polygon[], z, thickness, top, under }`: floors,
  ceilings, roofs, balconies, a mezzanine. Stairwells are holes.
- **Room** — found from the wall graph on a slab (the enclosed faces), kept by a stable id with its
  name, kind, owner, lock, dressing, lights. A room is a polygon, not a rectangle.
- **Connector** — stairs, ramps, ladders, lifts: real objects with their own shapes between heights.
  Lifts are moving platforms by height.
- **Thing** — `{ id, kind, x, y, z, yaw, on?, props }`: metres and radians, floats everywhere;
  `on` = what it's attached to (a wall, an opening, a surface it sits on).
- **Levels** survive only as an *editing aid*: a named working height in the build tool and a
  label for the HUD ("4th floor"). Never a coordinate frame.

**Truths:**
- **Jolt** says what's solid and where you stand. Spawn, arrival, teleport, seats and "is there
  room for this" are Jolt queries (shape casts on the layers plan 50 made).
- **The navmesh** says how to get somewhere: recast (`recast-navigation-js`, wasm, the de-facto
  standard) built per chunk from the same solids, on the server and in the browser. Locked doors are
  area flags with a per-person query filter, replacing the personal grids.
- **Height** says which floor you're on: the slab under your feet.

**Drawing** (three, plan 71's shape): structures drawn as chunked draw lists (8 m world cells, one
mesh per material per cell), an edit rebuilds only the cells it touches (phase 2's principle,
general). Light as a **light volume** (a 3D texture of lamp light round each structure, sampled by
world position) instead of the plan-space light map: many lamps stay cheap and it works on any
height. The floor's look baked per slab in the slab's own space.

**What it unlocks:** buildings of any shape anywhere on the land (houses, a lighthouse, a hangar),
walking on roofs and bridges, vehicles that leave the ground (the plane) with no floor/tile
assumption to trip on, free decorating.

## Guardrails

- **Every phase lands green**: typecheck, lint, unit suites, the world-server suite, the phase's
  own e2e, and the bench (phase 3). No phase leaves two truths for the same thing behind it.
- **Behaviour-identical phases are proven, not argued**: same-pose stills (8 places × day/night,
  the plan 38 tool) and position hashes before/after. "Identical" means pixel-identical or a stated
  tolerance agreed with the user.
- **Migrations**: one-time, offline, idempotent, with a backup (WorldSnapshot export) before and a
  dry run on prod's saved world (`~/Downloads/yutopia-world.json.gz`, `tools/prod-world.mjs`) and
  the e2e fixtures (`demo.json`, `lab.json`). The boot-time conversions go; the server refuses an
  unmigrated world loudly instead of converting it in memory.
- **The dev DB**: never run the API's Pest tests against it (memory: they wiped it); the API's
  migrations tested in an isolated database.
- **Probe as Cai/Bia, never Ana** (the user plays as Ana); the offline world-server for anything
  that edits a world.
- **Budgets** raise freely, measured and noted (2026-11-01 rule); a jump with no new code is a
  split bug.
- **Jolt's rules from plan 50** hold (sizes checked, one PhysicsWorld owns every object, the
  determinism hashes in CI).

## Phases

Sizes are rough: S a day, M a few days, L a week, XL more.

### Phase 0 — mocks and the yardstick (M)
- **The free-form build tool, mocked** (stills + a short reel, the furniture-mocks way): drawing a
  wall (click-click, chaining, snaps: grid 0.5/1 m, 15° angles, endpoints, midpoints, perpendicular,
  continuing a wall), a curved wall, wall height, rooms found and named as you close them, a door
  slid along a wall, a floor/roof drawn, the working height ("level") switcher, stairs between two
  slabs, a thing placed free with snap, the same tool outdoors in god mode.
- **Decisions to bring to the user with the mocks**: arcs in v1 (yes, per the ask) and their snaps;
  variable wall thickness; pitched roofs now or later; posts at joints (look); how rooms split when
  a wall crosses one; what a "level" means in the HUD when slabs are at any height.
- **The yardstick**: the stills set and position hashes for "identical" phases; the bench from
  plan 71 phase 0 (road at speed, prod floor 4, town at night in rain, a crowd) with a wall edit in
  it — draws, CPU ms, p95, worst frame, Chromium and Firefox.

### Phase 1 — hardening (S–M) — independent, first
- Server: each feature's `tick` and every `clock` timer wrapped (log, count, carry on; a feature
  failing N times in a row is switched off and reported); `uncaughtException` /
  `unhandledRejection` logged with the room kept alive where safe; `/health` honest (tick age,
  stall state, rooms) and the compose healthcheck acting on it (autoheal or the orchestrator's
  restart); the layout save retried with backoff and flushed on shutdown; API failures counted
  instead of swallowed.
- Client: error boundaries round each HUD region plus `app/error.tsx` / `global-error.tsx`; lazy
  imports through one loader that retries a ChunkLoadError and then offers "a new version — reload";
  `window.onerror` / `unhandledrejection` into the telemetry the client already has; a
  `webglcontextlost` notice.
- Done when: a feature made to throw in its tick leaves the world running (test); a forced chunk
  failure shows the reload offer (e2e); `/health` goes unhealthy on a stall (test).

### Phase 2 — the wall without the freeze (S) — the work already on disk
- `World3.relayout` (tp/build.ts) + the view using it (tp/view.ts): a layout edit on the same-size
  floor keeps every thing and redraws only the wall pieces it touches (`touchedWalls`: the pieces
  meeting each changed edge's ends), the ceiling if the tiles changed, the floor bake, and the doors
  whose frame meets a post that came or went. Measured on prod's floor 4: the edit's frame 600 → ~250
  ms before the per-piece walls; the rest to measure.
- To finish: the exactness check (`VERIFY=60 e2e/wall-hitch.mts`: random edits vs a fresh build,
  every piece's geometry digest — colour left out, the hour tints glass) green; measure again
  (target: no frame over 100 ms on prod floor 4 in Chromium; Firefox measured); the follow-up frame
  (the GPU taking the new geometry) measured; commit.
- On the old model on purpose: players feel it now. Phase 8 carries the principle (rebuild only
  the cells an edit touches) into the new drawing.

### Phase 3 — green and typed (M)
- The world-server suite 205/205; every known-red e2e fixed or quarantined with a reason and a date
  (`known-red-e2e` memory emptied); lint clean.
- A smoke e2e set in CI against an offline world-server with the session rewritten (the
  stream-soak pattern), so CI no longer depends on a local stack; the API's tests in CI against
  their own database.
- **Typed room state**: the schema's shape exported from shared (types generated from or checked
  against `schema.ts`), the client's `type S = any` gone in all 10 modules.

### Phase 4 — the seams (L)
- `controller.ts` and `view.ts` split by concern into feature modules with a small core (the
  server's `features/` pattern): the frame loop calls registered features; input, physics glue,
  culling, floors, cars, games, pets, build mode each their own. No behaviour change (stills +
  e2e). Done before the model work so phases 5–10 touch small files, not two giants.

### Phase 5 — one unit, one frame (L) — behaviour-identical
- **Metres everywhere**: catalog heights (`standHeight`, `surface`, `isoPx` in 12 fam files),
  hang steps (`WQ`, `WZ_PX`), `props.z`, model and view APIs; `ZPX`, `zt()`, `PX_PER_M`,
  `ISO_PX`, `ZPX_TILE` and every bare 39.19 deleted; one `units.ts` (wall height, storey, slab) and
  every copy (`STOREY` ×3, wall height ×4) reading it.
- ~~One frame~~ — moved to phase 6 (the user, 2026-11-05): on the tile maps it meant an origin on
  every map and a subtraction at every tile lookup, code phase 6 replaces.
- **Turns as angles**: `rot` 0–3 → `yaw` radians; people's `d` (8 iso screen facings,
  `dirFromDelta`/`toScreen`) → yaw; still quantized here, so identical.
- **Floats end to end**: schema (`float32` x/y/z/yaw), `putObject` (no `|0`, no `%4`), the API
  (float columns, validation), `WorldSnapshot`/import casts.
- Data migration (objects, spawns, last spots, fixtures) with backup and prod dry run. Proven by
  stills + hashes.

### Phase 6 — the structure model (XL)
- shared `structure/`: walls, openings, slabs, rooms (detected from the wall graph), connectors,
  things; edit operations (add/move/split/join/delete wall, slab, opening…) with validation and
  undo, applied the same on the server and in the browser; structures in chunks with versions.
- **One frame** (moved here from phase 5, the user 2026-11-05): `GROUND_OFFSET` folded in (the
  building moved into world metres), floors' `ox`/`oy` re-basing replaced by absolute positions,
  `Player.z` absolute (not "feet off the floor"), in the same migration: slabs and walls are
  written in world metres from the start.
- **Migration to layout v4** (v3 is phase 5's metres and radians): edge runs → wall segments (collinear runs joined, faces kept), tiles →
  slab polygons (per floor, at its height), area rects → rooms (matched to the detected polygons,
  owners and locks kept), openings and hung things re-attached to walls, floors → slabs at real
  heights, the 11 boot conversions applied for the last time and deleted.
- Storage: `world.structure` (v4 JSON) and float things; the server streams **edits as operations**
  (not the whole map re-sent in room state on every change).
- An adapter derives what the not-yet-ported consumers read, *read-only*, for phases 7–10 only;
  it's deleted in phase 11.

### Phase 7 — Jolt the only truth, the navmesh (XL)
- `buildingSolids` from v3: walls at any angle and arcs (convex pieces), slabs with holes, openings
  cut, connectors' shapes; lifts as moving platforms.
- Spawn, arrival, teleport, "fits", seats and use spots from Jolt queries; the floor from the slab
  under you (`floorAt`, `setLevel`'s map swap, the per-floor Jolt frames gone).
- The navmesh: recast on server and client, built per chunk from the solids, rebuilt on edits;
  locked doors as flags with per-person filters; pets, zombies, Vortex, NPCs, walk-to and the GPS
  on it. `Grid`, `findPath`, personal grids, `groundAt`'s "higher of the two" and the grid-vs-Jolt
  audit deleted.
- Done when: the plan 50 checks (determinism hashes, heap soak) and the movement e2e pass with no
  grid in the code; the recorded mismatch bugs have tests.

### Phase 8 — drawing structures (XL)
- Walls from segments (mitred joints, arcs, openings cut, two faces, half walls), slabs, ceilings
  and roofs, chunked into 8 m cells drawn as one mesh per material; an edit rebuilds only its cells
  (phase 2 generalised; target: an edit costs < 1 frame of budget on prod floor 4).
- The fade (walls and tall things turning see-through round you) on the new pieces; below-cull with
  slabs as the occluders; stairs and lifts drawn from v3; the campus generated as structures.
- Same look on the migrated worlds (stills within the agreed tolerance). One material family
  (plan 71 phase 1) for the structures from the start.
- **Lifts as moving platforms** (moved here from phase 7 — the user, 2026-11-05: "Leave for phase
  8"): the slabs open at the shafts (as at the stairs) and drawn so, the shafts' walls the whole
  height, the car a moving body in Jolt on the server and in the browser (its floor, walls and
  doors), its riders standing on it rather than held at its height.

### Phase 9 — light and the floor in 3D (L)
- The light volume: lamps (and windows by day) baked into a 3D texture per structure chunk,
  occluded by walls and slabs, sampled by world position in the shared material family; the night
  and the dark (plan 44) read it. The plan-space light map and its ray-march across tiles deleted.
- The floor's look (materials, contact shadows, AO) baked per slab in slab space; `art/floors.ts`'s
  iso transform deleted. Stills against phase 0's.

### Phase 10 — rooms, sound, ownership (M)
- Rooms as polygons from the wall graph: locks, owners, dressing, lights by room, the office,
  stand-ups, pets' home room, Vortex's areas; hearing by room polygon (and, as a choice for the
  user, muffled through walls by a Jolt ray on the wall layer).

### Phase 11 — the free-form build tool (XL) — from phase 0's mocks
- Walls drawn free (snaps, arcs, heights), rooms found as you close them, openings slid along
  walls, slabs and roofs, connectors, the working height; things placed free with snap and any
  turn; undo/history on operations; the same tool in god mode outdoors; the minimap and GPS from
  structures. The adapter deleted: no consumer of the old model left.

### Phase 12 — retire the iso leftovers (M)
- `art/iso.ts`, `chars/iso.ts`, the SVG paper people (stand-ins become a low 3D proxy), item-art
  sketches through `MeshSketch` (every kind on the native kit — plan 67's last step), the box art
  (`piece()`), `?furn=old`, `?anim=old` and the 21 `v2` branches, `shared/iso.ts`, the remaining
  e2e written in tiles (`walkTo`/`actOn` in metres). Done when a grep for the iso words finds only
  history.

### Phase 13 — checks (M)
- Everything green; the bench against phase 0 (no frame worse, the wall edit fixed); prod's world
  migrated in a dry run and played offline; a soak; an independent review; the plan's "Where it
  stands" written.
- **A memory checker** (the user, 2026-11-05: Yutopia seen at ~4 GB of RAM the day before), run in
  CI and on demand against a long session, each with a budget and a trend that must stay flat:
  - **Jolt**: its heap in use (`sGetTotalMemory − sGetFreeMemory`) and its grown size per world,
    bodies and shapes counted against what the world should hold (statics, things, characters,
    land chunks) — a world made and destroyed, land streamed out and back, edits, joins and
    leaves leave nothing behind; the heap never creeps (it grows now: packages/jolt).
  - **The world-server**: Node's heap after a forced GC, RSS, the land cache (`chunkCount`), the
    room's maps and per-person state (grids/navmesh tiles, trails, samples) over hours of bots
    joining, moving, building and leaving (`tools/bots.mts`, physics `soak.ts`).
  - **The browser**: JS heap after GC, GPU memory (three's `renderer.info`: geometries, textures,
    programs), Jolt's heap, the drawn floors and the land's chunks — walking the long road and
    back, floors up and down, build edits, an hour idle — every count back where it started.
  - **The dev stack's own**: `next dev` (known to leak to ~3 GB over long e2e sessions — memory
    note) measured apart, so a dev-server leak isn't taken for the game's.
  - Reports per process with the top retainers (heap snapshots diffed) when a budget's crossed.

## Order and what can run side by side

1 → 2 → 3 first (safety, the freeze, a green CI). 4 then 5 (the seams and the units, both
behaviour-identical). 6 → 7 → 8 are the spine. 9 and 10 can run beside 8 once 7 is in. 11 after 8
and the mocks. 12 last, 13 closes. Phase 0's mocks can be made while 1–5 are built (they're needed
only by 11).

## Where it stands

- 2026-11-04: planned. The user: "Pode começar" — phases 1 and 2 built the same day (uncommitted).

### Phase 1 — built 2026-11-04
- **Server.** Each feature's hooks run on their own (`WorldRoom.hook`, the 11 loops). The tick runs
  each feature in a try/catch, and a tick that throws 100 times in a row (`TICK_FAILS`, ~5 s) is
  switched off, logged loudly and counted (`features_switched_off_total`). `onUncaughtException` on
  the room means Colyseus wraps its own hooks, clock timers and the simulation interval. The
  process logs `uncaughtException`/`unhandledRejection` and stays up, but exits after 30 in a minute
  so the container restarts.
- **`/health` and saves.** `/health` returns 503 when a room is up and hasn't ticked for 5 s
  (`tickAgeMs`), and reports `degraded` plus `featuresOff`. A layout save that failed for the
  network's or the API's sake is retried (2/5/15/30/60 s) until it goes or a newer save takes over.
  Network failures count in `api_errors_total`.
- **Client.** Every HUD region in WorldView sits in its own `Guard` (left out, reported, tried
  again 3×). `app/error.tsx` (try again or reload; a stale chunk says "a new version is out") and
  `app/global-error.tsx` cover the page. `lib/crash.ts` catches window errors and stray promises,
  sends them to the server as `client:error` (logged ≤20 a session, all counted
  `client_errors_total`), and turns a ChunkLoadError into a reload toast. A lost WebGL context is
  said and reported (controller).
- **Tests and budget.** New tests: `world-server/src/guard.test.ts` (a broken feature's join and
  tick, the others still run, switch-off, /health degraded, a broken clock timer counted) and
  `client/src/lib/crash.test.ts`. Page 445.5 → 449.7 KB (budget 446 → 451, noted in
  tools/budget.mjs).
- **Not done.** The compose healthcheck acting on 503: plain Docker doesn't restart an unhealthy
  container, so autoheal or the orchestrator needs the user's call on prod infra. Firefox wasn't
  tried.

### Phase 2 — built 2026-11-04
- **Walls.** `World3.relayout`: the walls are keyed pieces (`low|<area>`, `run|<run>`, `ceiling`),
  and an edit rebuilds only the ones `touchedWalls` finds (`buildWalls(only)`). The floor's bake is
  done again only for the chunks near the edit, near the doors redrawn and near the areas `update`
  redrew. A wall can move a room's dressing to its far side, so the contact shadows go there too.
  The AO is worked out only a tile past those chunks (`aoCanvas(…, only)`: each pixel as the whole
  floor's would be).
- **Exactness.** `VERIFY=80 e2e/wall-hitch.mts` on prod's floor 4 makes random edits and compares
  each against a floor built afresh: every wall piece, area, tall thing and floor chunk (its pixels)
  matched, **80/80**. Two caveats: an area with nothing in it equals no area, and the hour's glass
  tint is left out.
- **Measured** (prod's floor 4, Chromium, Metal, 1440×900, NOPROF): the edit's frame went from
  ~600 ms plus a ~250 ms GPU frame to a worst of 85 ms the first time (cold), then 52–54, then
  nothing over 50 ms. The floor runs 38–40 ms a frame there without an edit. `relayout` itself
  takes 12–43 ms. Firefox wasn't measured: Playwright's Firefox won't start in the agent's sandbox.
- **Also measured.** The physics' rebuild of the building (`keepUp`, 13–50 ms) happens in a later
  frame; that's phase 7's.
- **Tests.** `client/src/world/tp/relayout.test.ts` (touchedWalls).

### Phase 3 — built 2026-11-04 (the user: "go")
- **World-server 206/206.** The weather test "snowed in…" ran on the schedule's weather and wanted
  `wet > 0.7` 5 s into a forced rain, which only held on a day already wet; the rule takes ~30 min.
  It now checks the ground getting wetter.
- **Typed room state.** `@yutopia/state` is a tsconfig alias for `apps/world-server/src/schema.ts`,
  imported **for types only** (`import type`, erased: the page is the same 449.7 KB). The client has
  `experimentalDecorators` on to read the schema's decorators. `type S = any` is gone from all 10
  modules, and the cars' `state: any` too. `Room<WorldState>`, the callbacks typed by
  `getStateCallbacks`, the entities by their classes (Pet, Player, KartPark…). The kart record and
  results became shared types (`KartRecord`, `KartResults`), written by the server and read by the
  client.
  - Found on the way: `games/room.ts` read `this.state.consoles` with no room (a crash when the room
    drops), now guarded.
  - Guard: `src/state-types.test.ts` fails on a value import of `@yutopia/state`.
- **Lint.** 0 errors in tracked files: pets-lift/pets-wheel forEach, weather-shots, the chess
  scripts' and emu-assets' format. One error left in `e2e/zz-load.spec.ts`, another session's
  untracked file, left alone. Warnings are unchanged.
- **The known-red e2e** (14 specs, as Ana/Bia on the dev world — backed up and restored after,
  579 objects identical):
  - **Pass now:** actions ×3, computer, wall-sofa-menu ×2, the night storm, the car knocked and
    the car under a flier.
  - **Fixed — 7:**
    - lighting "no GL errors": a real bug. warmDraw's shadow-pass fix from 10-23 had been lost; a
      car headlamp casting a shadow with no map made ~200 lit draws fail entering on the lot. Put
      back, and the spec now always enters on the lot.
    - hud: the core moved a wall into its walk. New `walkNear` helper, and `walkTo` now says why
      it failed.
    - car passenger: get in at 2.7 m, not 3.4, where the bay's claim prompt wins.
    - dark-hud: the breath panel shared the battery's class, so it's now `dk-air`. Plan 44 hides
      the teammate tag for the unseen, so Ana now turns her beam on Bia.
    - actions: the hand-over now polls for Ana's empty hand.
    - beam: the same selector as dark-hud.
  - **Quarantined (`test.fixme`, reason and date in the spec) — 4:**
    - build.spec's carry/drop: the drop click never reaches `drop()`.
    - build-tops' bin: lands a tile past.
    - Both go with the build tool in phase 11.
    - first-person facing: the 8-way facing lags the look, once by π/2. Phase 4.
    - the town in 3p: the long road walk blocked by a solid the grid can't see. Phase 7.
  - **Frame budgets behind `YUTOPIA_PERF=1`:** grounds, town and car's worst-frame and fps limits.
    They failed on this machine with spikes of 200–266 ms on the road and the shuttle, 52 fps at the
    lot at night, and 100 ms+ driving. That's open performance work for phase 0's bench. With the
    GPU alone the specs check behaviour.
  - Final run: everything green but the quarantined.
- **CI.**
  - New `e2e` job: the smoke `apps/client/e2e/ci/smoke.spec.ts` with `playwright.ci.config.ts`.
    - It needs no local stack: `next start` on the build, an offline world-server, and the API faked
      by `page.route` (`e2e/ci/api.ts`).
    - It checks that the world comes up, a walk by path, a wall built (the nearest open edges in
      turn), the frames going on, a healthy world-server not degraded, and no page errors.
    - It passes locally in 1.6 min. `pnpm --filter @yutopia/client test:smoke`.
  - New `api` job: Pest (SQLite in memory, forced) and pint on PHP 8.4. Pint passes here. Pest
    wasn't run here: the permission system refused running it in the dev container (the 10-19 wipe).
  - The main Playwright config ignores `e2e/ci`.
- **Not done.** CI itself not yet seen running (nothing pushed).

### Phase 4 — built 2026-11-04 (the user: "Go to phase 4")
- **What moved.** controller.ts went from 4,782 to 2,797 lines and tp/view.ts from 5,699 to 3,544.
  No behaviour change: the same code, moved into features.
  - The controller's are in `world/ctl/` (17): lifts, pets, menu, water, jumps, steps, input,
    focus (with the lock-on), arrival, photo, cable, boards, tables, quality (`QualityWatch`),
    doors (and the stairs' climb), loading, plus `common.ts`.
  - The view's are in `tp/parts/` (15): prints, eyes, guns, lens, look, pointer, buildpick,
    vehicles, mood, sun, tags, seats, culling, body, warmup, plus `common.ts`.
- **The pattern.**
  - Each feature is a class taking its owner as `c`. Its dependencies are said in
    `XHost = Pick<Owner, …>`, the members it really uses (recomputed after each move).
  - The owner holds it as `readonly x: X = new X(this)`, with the type written out (two features
    reading each other otherwise made a type cycle).
  - The moved code is verbatim: `this.c.y` for the owner's own members.
  - Callers that are typed were moved to `owner.feature.y` by the typechecker's own errors.
  - Members read by code the typechecker can't see (the e2e's `__yutopia.x`, cars/karts' `any`)
    keep a forwarder on the owner.
  - Things outside the class went with the code: only one feature using it, into that feature;
    the owner too, into `common.ts`; exported types stay put and are imported as types.
- **Kept on purpose.**
  - The play's lazy imports (walker, grounds life, cars) stay in the controller (`loadPlay()`,
    called from `Input.bindInput`): the importer the same, the chunks the same.
  - A part made before the view's scene builds what reads it on first use (`Culling.gather`).
- **Tools** (scratchpad, not in the repo): an extractor that moves members with their comments,
  rewrites `this.` and `.bind(this)`, understands template literals (the GLSL), adds forwarders
  and the Host, and flags field initializers that read the owner; plus fixers for callers, the
  module-level names and the Host lists.
- **Found on the way.** A forwarder the first extractor version put *inside a GLSL template*
  (it took a `}` of the shader for the class's end). TS can't see that: it broke the shader and
  brought back GL errors. Fixed, and the extractor made template-aware. Every template's text was
  compared against HEAD afterwards: only the expected rewrites.
- **Measured.**
  - typecheck green, client unit 278/278, lint at its 18 old warnings.
  - The page 449.7 → 451.3 KB (what the minifier can't shorten: `this.c.x`, the forwarders;
    budget 451 → 453, noted). Every lazy chunk the same.
  - The CI smoke 3/3.
  - GPU e2e (~70 specs' tests over the slices): green, except
    - **red on HEAD as well** (checked against a worktree of HEAD's client on :3107, same three
      errors): flowmotion "a lamp post swung round", merge-ab "the same picture as piece by
      piece" (no fades), night "the mood" (a torch on before anyone lit one). Not the split's;
      not yet triaged;
    - the cars and some others failed while the dev client was near its memory limit (2.6 GB;
      it restarted once, the `next dev` leak) and the world dirty from hours of runs. All green
      after a restart and a restored world;
    - weak-machine "up on the roof" (2.9 m of 4) and doors-windows (a catalog tab that's gone
      since plan 67): not the split's by what they touch, not checked against HEAD.
  - Specs that *patch* a moved method follow it (steps/weather `steps.myStep`, mouse-look
    `buildPick.pick`, night-shots/weather-shots `mood.weatherFrame`).
- **Left for later.**
  - The two `frame()` loops are still in the owners: the controller's frame (~700 lines), the
    view's frame and constructor.
  - The features' members keep their old names (`lifts.liftCarry`): renaming is a separate,
    cosmetic pass.
  - The client error the reports caught: `firstElem.toArray is not a function`, a uniform array
    given a non-vector. Seen once from Ana's tab in the dev world, not traced.

### Phase 5 — built 2026-11-05 (the user: "Go to phase 5"; then "Yes, that order")
Built: metres everywhere, things turned by `yaw`, things' floats end to end, people's facing as a
yaw, and the migrations for them. The one frame went to phase 6 (the user's call, on the held
question below).
- **One unit.** `shared/units.ts`: `STOREY`, `WALL_H` (3.266), `HALF_WALL_H`, `SLAB`, `WALL_T` and
  nothing else; `levels.ts`, `shapes/`, `grid.ts`, the client's `stairs3d`/`campus`/`jolt-pad`
  read them. Gone: `ZPX_TILE`, `PX_PER_M`/`m()`, `ISO_PX`/`isoPx`, `WZ_PX`, the client's `ZPX`
  (model.ts, pong, pool, pballs, games room) and every bare 39.19 outside the old art.
- **Metres in the model.** The catalog's `surface` and `standHeight`, `props.z` (stored), the door
  and window cuts, the hung things' sizes, lifts and steps (`WZ` 0.25 m), the screens' glass
  (media `GLASS`, `TV_SCREEN`, `COMPUTER_GLASS`, the fam ones), the game tables' tops and
  `tableZ` (was `tablePx`), the slot cars, the kart park's seats, dressing. The view's API too:
  `worldToClient`/`clientAt`/`pointerWorld`/`puff`, the pointer's `Ray`, the live pictures' quads,
  the wall panels (`zTop`, `h`), the build ghosts' lift.
- **The old art's edge.** The item drawings (`art/items`, drawn through `tp/kit3d.ts`) and the paper
  people still measure in their px: one constant, `ART_PX` (45.25·cos 30°), and `artPx`/`artM` at
  their edge. `artPx` rounds to 0.01 px: the art tests heights exactly (a window's sill against
  its frame), and 0.9187 m must come back as its 36. Phase 12 deletes all of it.
- **Turns as angles.** `WorldObjectDef.rot` → `yaw` (radians, π/2 a quarter, the way rot counted);
  `quarterOf(o)` / `quarterYaw(q)` in the catalog; things still turn by quarters. The structural
  helper types (`{ x; y; rot? }` in stairs, grid, openings, hang, lift, tables, cars, loot) went to
  `yaw` first, so the typechecker found every read; a fixer driven by its errors rewrote ~315
  reads and writes; the untyped writes (spreads, `map()` callbacks, e2e) by hand. Setups' items,
  the game room's set, messages (`obj:put`/`obj:batch`) carry `yaw`.
- **Floats.** Schema `WorldObject` x/y/yaw `float32` (were int16/uint8); `putObject` takes them as
  sent (finite, no `|0`, no `%4`); the API's columns `double`, its rules `numeric`.
- **Migrations.** API `2026_11_05_000001_heights_in_metres` (props.z over 3 → ÷ ART_PX, objects and
  setups) and `_000002_things_turn_by_yaw` (rot → yaw, x/y double, setups, the layout stamped
  `version: 3`). Both reversible. `WorldSnapshot` v2; a v1 snapshot is brought up on import (the
  e2e fixtures stay v1 files). `shared/migrate.ts` `worldToV3` does the same for files (the
  offline world-server reads a world file through it). The world-server **refuses** a layout older
  than 3 (no conversion in memory). Phase 6's structure migration becomes layout v4.
- **The dev world.** Backed up (`scratchpad/p5/dev-world-before-v3.json`, v1), then migrated by
  `php artisan migrate`: heights 16–44 px → 0.42–1.12 m, turns 354/89/123/13 per quarter as before.
- **Proven** on prod's saved world (`~/Downloads/yutopia-world.json.gz`), HEAD's code on its px
  data against this code on the data moved:
  - the physics solids and the grid's standing heights: 44,921 numbers, worst 0.5 mm;
  - the drawing, HEAD's client (:3107 worktree) and this one, each on its own offline world-server,
    up on floor 4 with every floor built: 4,445 meshes (walls, rooms, tall things, floors, the
    live screens) matched, worst 0.3 mm;
  - the catalog's 406 heights against HEAD's (÷ ART_PX): worst 0.05 mm, every lift range the same.
- **The CI smoke** on a fresh production build: green. Page 451.3/453 KB, unchanged; every lazy
  chunk within budget.
- **GPU e2e** on the migrated dev world (build hand and turning, tops, wall faces, wall/sofa menus,
  setups, use-things, computer, cars, ping-pong, pool, slot cars, doors/windows): green except
  doors-windows (the catalog's Doors tab, gone since plan 67) and wall-faces "both faces": the
  clock's target, 2.45 m up (the same as its old 96 px), projects above the viewport (y −45 px)
  with the camera the spec holds, so the click misses; not checkable on HEAD once the database
  moved. The cars failed first with the dev client at 3 GB (the `next dev` leak) and passed after
  a restart. A setBuild patch converted by mistake (the build store's `rot` is the hand's quarter
  and stays) made the hand's yaw NaN; `quarterYaw` now gives 0 for a missing turn.
- **Tests.** Shared 591, client 278, world-server 204/206: the two reds (Vortex "personal lines",
  the nest "crouched at 12") are timing-flaky on HEAD too (Vortex failed 1 of 4 on HEAD; the nest
  failed twice on HEAD, passed twice here).
- **Found on the way.** The fixer prepended its import above `"use client"` in three files; biome
  turned the directive into an expression and the dev client's build failed (an error page) until
  it was fixed. The prod file's tabletops sit at the old 25 px desk; the boot's `topsOnHosts` lifts
  them to 0.74 m as on HEAD.
- **People's facing** (built after the user's "Yes, that order"). `Player.d` gone: a player faces by
  the `yaw` byte the move already sent (256 a turn), which the 3D view already drew others by.
  `Npc.d` and `Pet.d` → `yaw` bytes; the `pos` message has no `d`. `shared/facing.ts`:
  `faceByte` (a world delta → a byte on 8 ways, 32 a step), `face8` (the same in radians),
  `byteFace`, `faceStep` (the old FACING table's step), `SEAT_FACE`. The client's `AvatarState`,
  the view's `Body3`, `me` and the walker's first-person hysteresis hold radians (`yaw`); the
  3D view draws `angle ?? yaw` (was `angle ?? dirAngle(d)`). The 8 ways are the same angles the
  view drew `d` at; only where a delta tips from one to the next moved (by the world's angle now,
  not the iso screen's). Last spots: API `2026_11_05_000003_last_spots_face_by_yaw`
  (`yaw = ((d + 1) mod 8) · 32`), the dev DB's moved (d 7 → 0, d 2 → 96). Tests: shared
  `facing.test.ts` (each old `d`'s own way gives its byte, its radians and its step);
  world-server 206/206. Left on the iso screen: `dirFromDelta`/`toScreen` in shared iso.ts, the
  paper people and pets' sprites (art), and the pool/ping-pong/ball aim's screen side
  (tables/*.ts) — phase 12's.
  GPU e2e on facing and movement (first and third person, sofa and menus, actions with a high
  five, pets, cars, lock-on, controls checks, use-things), with one retry: 21 green. Red: the
  arcade mantle in move.spec (the vault before it fine; not the arcade's 0.1 mm of height — tried),
  move-others' sideways step drawn at 2.2 m/s of its 2.5 (its facing check passes; two browsers'
  frames), and pets-lift's car A door at the dev world's spot. None reads a facing; none checkable
  on HEAD once the database moved. On the way: a bad save killed the dev world-server's watch
  (down from 04:29 till a restart), and failing tests restart Playwright's worker, each logging in
  again — the API's 10 a minute tripped and failed whole batches; and a room whose onCreate was
  refused threw again in onDispose (its weather saved with no state) — guarded.
- **Held, and decided** (the user, 2026-11-05: "Yes, that order"): people's facing done here
  (above); the one frame folded into phase 6's migration — on today's tile maps every floor keeps
  a grid with its corner at 0,0, so absolute positions would have meant an origin on every map and
  a subtraction at every tile lookup, code phase 6 replaces with slab polygons in world metres.

### Phase 6 — first part built 2026-11-05 (the user: "Go to phase 6")
The structure is the world's truth, stored and streamed as operations; the tile maps the rest of
the code reads are made from it. Still to come in this phase: listed at the end.
- **The model** (`shared/structure/`): `Structure` v4 — floors (a working height and a label, the
  old floor number, its spawn; `grid`, the old tile grid's extent, for the adapter only), slabs
  (one material each: an outline with holes, at its floor's height), walls (a segment from `a` to
  `b` on `base`, `height` tall, the old edge chars as its front and back face), rooms (an outline,
  everything the old area kept in `props`), the core and the world's spawn. World metres: a floor's
  tiles moved by its corner; the land's frame is the building's (the ground floor's corner is
  GROUND_OFFSET), so nothing else moves.
- **From the maps and back.** `structureFromMap` traces each floor char's cells into polygons
  (`rings.ts`: rings with the region on their left, holes the other way, collinear corners dropped,
  each hole given to its outline) and joins each run of like edges into one wall;
  `mapFromStructure` (the adapter, read-only, for phases 7–10) reads cells by their middles.
  `roundTrip`/`mapDiff` check every tile, every edge's front and back, every room, the floors'
  places, names, spawns and the core: the studio, prod's saved world (5 floors → 23 slabs, 132
  walls, 28 rooms, 18 KB), the dev world, both e2e fixtures and 40 random multi-floor maps come back
  the same.
- **Operations** (`ops.ts`): `walls` (taken away by id, put in), a floor's `slabs`, a floor's
  `rooms` (in order), the `floors`, `meta` (spawn, core, home). `applyOps` (refuses a wall that isn't
  there or comes twice), `invertOps` (undo, from the structure it's applied to), `diffStructures`.
  The build tool still edits tile maps: an edit is checked by the old rules, then
  `commitMap` diffs its result into operations — the structure applies them, its revision goes up,
  `struct:ops` goes to everyone, the save is the structure (`PUT /internal/world/structure`).
  A client asks `struct:get` once its handlers are set (`struct:full`), applies each batch whose
  revision is the next, asks again when behind. Room state keeps only `structRev`: tiles, walls,
  areas and floors are gone from it.
- **Storage.** API: `world.structure` (JSON; migration `2026_11_05_000004_world_structure`), the
  endpoint, `WorldSnapshot` v3 with the structure. `layout` stays as it was at the conversion,
  untouched, until phase 11.
- **The conversion** (`pnpm --filter @yutopia/world-server world-v4 [--dry]`, `--file` for
  snapshot files): keeps a copy of the world, runs the old boot's conversions a last time
  (`structure/finish.ts`: openings into walls, bare desks, computers, tops on hosts, the building,
  the core, the blocks, the ground, the lot, the core's fronts — what they still change is stored),
  checks the round trip, stores the structure. The world-server **refuses** a world without one
  ("run world-v4"); a new world is made from the studio through the same function; the boot runs
  none of them any more. Offline world files (prod-world) are converted in memory — files only.
  Dev: converted (20 slabs, 119 walls, 30 rooms; nothing left for the conversions to do). The
  e2e fixtures are now v3 snapshots with their structure, the building's floors in them.
  Prod's saved file: the conversions still lift 133 tabletops to the 0.74 m desks and square 28
  cars into today's lot — they will run once when prod is converted.
- **Checks.** Shared (structure: 4 tests incl. 25 random edits applied, diffed and undone), world-
  server 206/206 (its clients keep the structure like the game), page 452.5/453 KB.
- **Still to come in phase 6** (as it stood after the first part): the frame fold, openings and
  hung things on walls, connectors, rooms from the wall graph, undo by operations — see below.

### Phase 6 — second part built 2026-11-05 (the user: "Continue")
- **Rooms from the walls** (`structure/faces.ts`). A floor's walls as a planar graph — split where
  they cross or one ends on another, walls ending in the open pruned — and its enclosed faces walked
  (any segments at any angle: phase 11's walls too; a ring inside a face is its hole). Gaps up to 2 m
  between walls in line close a room (`doorways`: a doorway's room-separation line — doors in the
  tile maps are often gaps). A room's outline is the face its rectangle lies in when the walls close
  round it and no other room's middle is in there; else its rectangle. `Room.rect` keeps the old
  rectangle for the adapter (phase 11 deletes it). On today's worlds every room's face is its own
  rectangle (dev: 10 of 30 rooms closed by walls — the rest open plan: lobby, corridors, zones in an
  open office); tests: an L, a +, a slanted wall, a box inside a room, doorway widths.
- **Things fixed to walls** (`structure/attach.ts`). A door, a window, a picture or a shelf carries
  `props.on`: its wall (by id), how far along it (m from `a`, to its middle) and, hung, which face
  (1 the front). Kept by the world-server on every rebuild (a thing moved, or a wall's run re-ided by
  the tile tool: `WorldRoom.reattach`), made by `world-v4` and for a new world. Dev, demo, lab: every
  one on a wall (196, 196, 107). **Prod's saved file: 13 windows on the ground floor at no wall** —
  12 `win-0-v124-*` at x 140 (the east block's old wall line, moved 16 m by `moveBlocks`; the
  windows were left), one at 82,70. A data bug on prod today (they draw in the open); `world-v4`
  lists them, leaves them unattached.
- **The one frame.** The world's frame is the building's (the home floor's corner at 0, 0 — the
  land was always drawn there); every place is now the world's: things, people, pets, rooms,
  spawns, last spots, loot. Only the ground floor moved (its corner −60, −10; floors 1–4 sit at 0, 0).
  - **Maps that say so.** The adapter's maps are *world maps* (`MapDef.world`): every place asked of
    them the world's, their tile rows starting at their corner (`ox`, `oy`). The accessors
    (`tileAt`, `hWall`, `vWall`, `backAt`, `setEdge`, `setBack`) and `Grid` (an origin `x0`, `y0`)
    read through it; `originOf`, `spanOf`, `tileInMap`, `edgeInMap` for loops and bounds;
    `worldShift` / `shiftOf` (nothing on a world map) where a map's places were made the world's.
    Older maps (the built-in ones, the old boot's conversions) work as before: `foldMap` /
    `foldThings` (`structure/fold.ts`) bring them over — `finishWorld` ends with it, and the
    world-server folds an offline file the same.
  - **Gone:** `GROUND_OFFSET` from every runtime path (cars, karts, the lot and its boards,
    grounds/park life, the long road, pets, survival, the dark, arms, ice, god mode, physics, the
    client's cars/karts/GPS/water/steps/sky/minimap/view parts); the view's per-floor offsets
    (`offsetTo` → `cornerTo`/`upTo`), `floorOffset`, the Grounds frame's x/z; `boardObject`/
    `postOf`'s offset.
  - **The browser's per-floor drawing** (tp/build.ts, the light maps) still builds a floor in its own
    frame — given its `localView` and its things moved back — and is placed at its corner; what it
    gives out (picks, fade groups) is the world's (`World3.corner`), the light map takes scene
    points (`Light3.tintAt`/`reaches`). Phase 8 draws the structure instead.
  - **Dressing ids** were their tile on the floor; now from their room's corner
    (`d-{room}-{kind}-{dx}-{dy}`): the same in either frame; `dressOff` converted by the fold.
  - **Storage.** Things: `world-v4` folds them (with the structure). The other places kept:
    API migration `2026_11_05_000005_places_in_the_world_frame` (last spots, people's arrivals,
    pets' places, the night's loot — each floor's corner from the stored layout, which stays v3).
    The API's arrival rules widened to ±2000 (were 0–160).
  - **Proven identical** on prod's saved world and the dev world (before vs after, by world tile):
    physics solids 254/195, every floor's standing heights, walkable tiles, ground and fit at every
    tile's middle, 798/579 things' places, rooms: no difference. The drawing (`draw-dump`, prod's
    world up on floor 4, every floor built): 465 groups, 4,420 meshes, worst 0.00000 m.
- **Undo by operations** — `invertOps` (part one) is the structure's undo; the build tool's
  history becoming operations is phase 11's ("undo/history on operations"), with its tool.
- Tests: shared 602 (fold: 12 random two-floor maps — places, rooms, dressing, the grid asked at
  world places as the old at its own; attachments on the campus), world-server 205/206 (Vortex's
  "personal lines", timing-flaky on HEAD), client 278. Converted: dev (from its kept copy: structure
  cleared, `world-v4` again — 127 things folded, 196 fixed to walls; backup
  `scratchpad/p6/dev-before-fold.json`), the e2e fixtures (again from their originals).
- **Heights the world's** (`Player.z`). The room state, the `pos` message, snaps and the join hold
  the feet's world height; the walker and the server's grid still work over the person's floor
  (phase 7 ends floors as frames), converted where they meet: shared `overFloor` / `worldZ`
  (levels.ts). Server: the move's footing, a jump's ground, teleport landings, `moveTo` (lifts),
  the arrival, `rescue`, god mode and map edits' arrivals, reach (`upOff`, `reachSpot`), arms'
  muzzle and trails, flares, paintballs, a pet in the lift. Client: the join, snaps, `pos`, the
  remotes' samples, paintball targets. Pets' heights stay over their floor (they aren't players).
  World-server tests sending moves on floors 1–4 now send world heights.
- **Stairs and lifts as connectors** (`structure/connectors.ts`): `connectorsOf(map, things)` —
  each staircase joins its floor to the next (its footprint, its door below and landing above, its
  treads' ramps at world heights), each lift (by shaft) every floor it stops at (its front at each).
  Read from the things (they stay the truth); phase 7 makes them Jolt shapes and navmesh links.
- **Checks after both:** shared 603, client 278, world-server 205/206 then the floor files 82/82.
  GPU e2e (ground floor, then floors): spot ×3, water ×2, fence, one-building, grounds, gps,
  controls, lifts (one-building, pets-lift — green on the real dev world: they had been run after
  jump.spec swaps in the lab fixture, the likely cause of phase 5's "lift door stays closed"),
  jump's desk hop (its desk top was 0.638 m, stale since plan 67's 0.74 m desks, at HEAD too).
  Red, not this phase's: map-edit (stale tab name), doors-windows (the Doors tab, gone since
  plan 67), Flowmotion's lamp swing (red at HEAD), move's arcade mantle (red since phase 5), the
  lock-on (flaky), jump's run → "leap" not "flip" (the jump's kind, not its height), car "knocked"
  and pets-car (the bay-claim prompt beats the car's 3.4 m behind it — replayed on the dev data
  before and after the fold: the same car, place and claimable bay mouth either way).

### Phase 7 — started 2026-11-05 (the user: "Go to phase 7")
- **The building's solids from its structure** (`physics/structure-solids.ts`, used by
  `buildingSolids(map, things, structure)`): each wall a box along its segment (square to the world
  along x or y, turned to its heading otherwise), cut where its doors and windows are (their `on`;
  `cutsOf`), a window's pane in its hole, out-of-doors pieces Flowmotion's runs up a storey; each
  floor's slab and the top floor's roof from its slabs' rings (even-odd) less the stairwells, cut at
  every chunk's edge (`slabBoxes`: rectilinear rings — the tile tool's; free floors' convex pieces
  are phase 11's). The server and the browser pass the live structure (`room.structure`,
  `ThirdPersonView.structure`). Proven on prod's and the dev world: the space every layer fills,
  floor by floor, cell by cell between all boxes' boundaries, the same as the tile walk's (0.1 mm
  rounding slivers only); 252/192 statics for 254/195.
- **The server stands on Jolt** (the user, 2026-11-05, after the costs were measured on prod's
  world: building into Jolt 11–20 ms, the land round one person ~15 ms once made, ~15 MB of Jolt's
  heap a room, a query ~6.5 µs): every room builds its physics world before it lets anyone in
  (`room.physicsReady`, awaited in onCreate; was: the first room of a process, after it opened);
  the navmesh only for paths. The navmesh-on-the-server alternative was weighed and not taken.
- **Our own Jolt** (`packages/jolt`, every `jolt-physics` import through a pnpm override): 1.1.1's
  wasm-compat built with `ALLOW_MEMORY_GROWTH` (128 MB → 2 GB; the published heap is a fixed
  128 MB — the user had hit it on their server). `build.sh` remakes it (Docker, Emscripten 6.0.13,
  the release's Jolt revision). The bench (`pnpm physics`): behaviour, the three determinism
  hashes and the heaps over 2-minute sessions the same; its land audit (grid vs Jolt: 1,039 of
  905,934 tiles the grid keeps you off, allowed 1,000) is the grid's, deleted with it.
- **Jolt's free-heap check** walked its allocator (`sGetFreeMemory`) before every add: with a world
  a room it was most of a test process's time (48 s of 150 profiled). Now the heap's size bounds it
  and it's asked exactly only near the 2 GB top — the live server paid the same walk.
- Tests that had passed only because their room had no physics: paintballs' cue test (the table
  landed against a wall with the player behind it: the reach's sight is Jolt's now) — the player
  steps round to it. Build undo's "the plant is gone" was phase 6's race (tiles come as operations
  at once, the plant with the next patch): it waits for both.
- Tests: shared 603, world-server 205/206 → after the fixes the failing files green (Vortex's
  "personal lines" still timing-flaky).
- **A floor's questions on Jolt** (`physics/place.ts`, `Place`): the grid's vocabulary — fits,
  fitsAt, groundAt, underfoot, clear, nearestOpen, ok, topAt (Jolt), onLand, onRamp, speedAt, the
  treads (the floor's map, the land, the stairs), seats (`seatsOf`: the things, the chess table's
  chairs, a desk's chair pulled in) — so the move core and the server ask what they asked. Against
  the grid on the campus, every tile of every floor: the same but the stairwells (Jolt stands you
  on the treads; the grid kept you off, 18–20 tiles a floor) and the lot (the grid let you stand
  under a parked car; 206 tiles). Not wired in yet: paths still walk the grid, and Jolt's clear()
  is a query a 0.1 m — too slow for a tile A*; the navmesh comes first.
- **The navmesh, prototyped** (recast-navigation 0.44 in shared): the building's solids as
  triangles (every box and cylinder Jolt gets), a tiled navmesh over all five floors in ~100 ms;
  paths across a floor in < 1 ms. Learned: recast's detail-mesh settings must stay its defaults
  (a sample distance of 0 crashed it: memory out of bounds); the stairs go in as their ramps
  (stairs.ts `stairsRamps`), not their tread boxes (ledges: none walkable); still open — the flights
  come out in pieces that don't join (the door landing to flight A's foot, flight A's top to the half
  landing): cell size, radius and the treads' width to tune with a top-down check of the mesh
  (scratchpad p7/scratch/nav.ts). Locked doors: two meshes (locked shut, all open), an owner's path
  on the open one checked against others' doors.
- **The navmesh, wired in on the server** (`shared/nav`: `BuildingNav`, `FloorNav`): every floor's
  mesh made from the same solids Jolt's world is (its walls, slab and roof fixed; things, clutter, a
  lift's stop, a locked door and parked cars obstacles in a tile cache, put in and taken out as they
  change); the ground floor's with the land round its span (4 m). The room keeps it in step
  (`features/physics.ts` `syncNav`: at its start — awaited before anyone's in — after every edit,
  after god mode's land). Every server path is on it (`room.wayFor(uid, level, from, to)`: pets,
  Vortex, the dark's walkers, teleport's checks), a locked door's owner through their own. What
  the grid's findPath did, it does: an end inside something (a desk's middle, under a car) takes the
  mesh's nearest point, 2 m round the start, 3 m round the target.
  - **Made a few tiles at a time** (`nav/tilecache.ts`: recast's generateTileCache, the same steps,
    handing the event loop back every 8 ms; each tile's triangles sorted to it in JS — recast's
    chunky-mesh tree over the land was 365 ms in one call). A floor whose fixed part changed is made
    again in the background, the one there was answering till then. Measured on the campus: all five
    floors ~0.8 s of work, the longest stall 55 ms (the Grounds' solids index, once a process; it was
    1.8 s in one go). Floors made lately are kept by what they were made of (exported tile caches,
    96 MB at most): a room made again from the same building takes them in ~35 ms.
  - **Out on the land: windows.** The grid's findPath searched a box 40 m round both ends (to
    640 m across); the ground floor's mesh stops 4 m past the span. A way with an end past it is
    asked of a window: a mesh over that box (its side on the land's chunks), the ground floor's
    solids and things in it, cells 0.15 m (half the work; a 1 m door still a way through), made
    when first asked and kept (six). Till it's in, a sync ask says none (pets ask again);
    `pathSoon` waits for it.
  - **Two leaks found and fixed:** the tile cache's obstacles aren't widened by a body's radius as
    the walls are (erosion) — a 0.12 m one, a lift's wall or a shut door, marked no cell and a pet
    walked through lift B's wall; every obstacle is now widened by 0.22 m. And an obstacle may touch
    8 tiles at most — a longer box is cut into ≤ 4 m pieces. And the worst: the tile cache queues
    64 obstacle requests, and takes them in only once its tiles are made — a floor's hundreds of
    things went in as their first few dozen, the rest dropped without a word (a pet walked into
    lift B through its shut door); it's settled before the queue fills. All three have tests.
  - **Walk-to asks the server** (`way` / `way` messages; `controller.walkTo` sends, the answer is
    walked, any way you're on goes on meanwhile; the stairs' flights appended): no recast in the
    page (its wasm, the ground floor's 0.4 s of work on the main thread). A change from "recast on
    server and client" above — the browser keeps Jolt for the body, the server answers ways.
  - A pet bug of the conversion: `nearBy` lost the floor its grid had stood for (asked on the pet's
    floor, not its owner's) — given back.
  - Checked: shared 608 (nav 5), client 278, world-server's path files (dark, guard, nests, pets ×7,
    rooms, snap) 95/95; a walk-to e2e as Bia on the dev world — across a floor, and 50 m out on the
    land west of the lot (one waypoint, its window made on the ask). The dev world server needed a
    restart for its install (its node_modules are a Docker volume: the new package).
- **No grid** (the user: "Yes, keep going", 2026-11-05). `Grid`, `findPath` (path.ts), the
  personal grids, `isLegalMove`, `JoltCollider` and the grid-vs-Jolt land audit are gone; a floor's
  questions are `Place`'s (physics/place.ts) everywhere:
  - **The server:** `room.gridFor(uid, level)` and `moveAsk` are Places on the room's Jolt world
    (`room.placeFor`, set by features/physics.ts; each person's through their own locked doors,
    kept till the next rebuild); `room.grid` is the home floor's for nobody. Physics is no longer
    switchable (`YUTOPIA_PHYSICS` gone). Lines of sight are Jolt's sight ray, not a body swept along
    them (`room.sight`): a shot, the torch's beam, the dark's looks — asked as a body standing at a
    bullet's height they hit the lobby's ceiling. A ball in flight asks `room.solidAt` (a sphere
    where it is), not whether a body fits there.
  - **The browser:** `controller.grid` is my Place on my floor (`tp.body.placeFor`, made again when
    Jolt's in: `body.onPhysics`); before it's in, Place reads the floor's map and the walker holds
    still (`holdStill`). `BrowserPhysics.place/body/groundUnder/underfoot` ask Place. The dev pages:
    the move sandbox and its Jolt pad on Place (its `?grid=1` gone), `/dev/3p`'s bots on the view's
    Place, walking straight to clear goals; the anim bench on `move/floor.ts` `openFloor` (an
    analytic floor for tests and benches — no walls, no things: the world's are Jolt's).
  - **Place grew the grid's word where the game leaned on it:** the land is ground whatever its
    height (a height asked under it or far over it, out on it, is asked from it: the ray reaches the
    land, the search for tops down to it); `fits` on the land also takes the land's own verdict (a
    ridge too steep, deep water); `topAt` is the highest standable top in a tile; `step`, `inBounds`;
    a world of none (the browser's first second) answers from the floor's map; its land can be given
    (tests).
  - **Jolt's `groundUnder` read a side as a floor:** where the cast's box began inside something (a
    corner grazing a parked car's side) the hit came at its start and the ground read as the cast's
    own top — a walk climbed a car's flank a step at a time. A start-hit now asks again under the
    body's middle, and the cast starts a hair over its top so a surface right at a step still
    counts.
  - **The navmesh's searches:** a mesh with land is searched up and down as far as the land goes (a
    place on it is asked at the floor's height; the gate's land is 3 m up, the town's more); a way
    across a window's wood (400 m) ran out of the query's 2048 nodes — 65,535 on meshes with land,
    8,192 on a building's floors.
  - **`canPlace`** keeps the tile tool's rule with its own tile occupancy (solid things' footprints,
    a lift's empty shaft, parked cars' and the chess table's boxes, seats) — phase 11's free tool
    replaces it.
  - **The tests:** grid fixtures moved onto Jolt (`physics/testing.ts`: `testWorld` — a map and its
    things built as a room builds them, the land round it and where asked; its places, its navmesh;
    `wayOn`), the open floor (`openFloor`) where a test's floor is a plain plane, the room's own
    Place and ways in the world-server's tests (`matchMaker.getLocalRoomById`). What moved with
    them, Jolt's truth over the grid's: a square body by an angled car (room at √2 of its
    half-width), the cabinet's drawn box (1.17 m, its face 0.17 in from its tile), the clearing's
    bench as one block to 1.0 m (its seat and back: shapes/grounds.ts), a stop at a thing's face
    not its tile's edge, room in the air over a lamp, headroom under a flight's top, the rooms'
    dressing in a converted map. The stairs walked by the character mover, as the game does.
  - **Checked** (2026-11-05): shared 608, client 278, world-server 203–206/206 across full runs and
    the failing files again alone (what's left red is load-flaky and passes alone: the pond's sled,
    the phone's reconnect, Vortex's "personal lines"); the plan 50 bench (`MINUTES=2 pnpm physics`):
    behaviour, the three determinism hashes (68ea128e, d430410a, a54956d2) and the heaps flat; a
    movement e2e as Bia on the dev world on Metal — Jolt in, W walked 5.5 m, a jump to 0.72 landed,
    walk-to in a second (headless on the software GPU the page stalls seconds a frame: Metal, as
    controls-checks). The page 455.7 KB (budget 453 → 456; nothing of Jolt's or the navmesh's on it).
- **The floor from the slab under you** (the user: "Yes, keep going", 2026-11-05). `floorAt` takes
  what says a floor has a floor under you (`SlabUnder`); the browser and the room's lifts ask Jolt
  (`physics/place.ts slabsOf`: floor L's slab under you, or a staircase's treads coming up into its
  well — asked of what holds a body up through walls, not a plant or a parked car on it); without
  it (tests' older maps), the floors' tiles. Checked against the tiles on the HQ, every tile of every
  floor (the wells apart: deep in one the treads are the floor below's; a flight's top is the floor
  above's — both checked), and the stairs walked up and down by the mover on it.
- **The per-floor frames' corners are gone:** a floor's `Frame` is its height (`{ elev }`), every
  floor's x, y the world's; the mover, Flowmotion and the browser's physics without `ox`/`oy`; the
  tests' HQ folded into the world's frame.
- A teleport's "is it there" asked whether a body fits (Place's `ok`), so a target by a parked car's
  tail was dropped without a word once Jolt had built that land: the pond sled's test, red in every
  full run. It asks the land now (a walkable tile of it); the landing finds room as before.
- Checked: shared 609, client 278, world-server 205/206 then the pond fixed (load-flaky alone left:
  the phone's reconnect, Vortex's lines, the elevator's raw steps); a browser walk as Bia on Metal
  down a flight to floor 3 and back up to 4, the floor changing on the way, feet on the floor.
- **Not done in phase 7 — moved to phase 8 (the user: "Leave for phase 8"):** lifts as moving platforms. Riding works as it is
  (the car moving, its rider held and carried at its height, server and browser alike); a Jolt
  platform needs the slabs open at the shafts (as at the stairs), the shafts' walls, the car as a
  moving body on both sides, and the floors drawn with the holes — phase 8's drawing. Arcs' convex
  pieces wait for arcs (the structure's walls are segments; phase 11's tool brings arcs); the
  connectors' shapes are the stairs' and lifts' own solids, as built. The repo's movement specs
  (move, jump, first-person) not run here — they log in as Ana and swap the dev world.

### Checks run 2026-11-04
- Typecheck green in all three packages. Shared 590/590, client 277/277, world-server 205/206 (the
  snow test, known red).
- Lint: no new errors (8 left, none in files touched here). Budget ok.
- The wall e2e specs weren't run: they swap the shared dev world (`useWorld`). wall-hitch.mts
  covers the path on an offline world-server instead.

### Phase 8 — started 2026-11-05 (the user: "Go to phase 8")
- **The yardstick** (scratchpad `p8/zz-p8-stills.spec.ts`, `cmp-stills.mjs`, `diffimg.mjs`, `sheet.mjs`):
  8 places × day and night — floor 4's hall and a room, the lift landing, the stairs on floor 1,
  floor 2, the lobby, the lot's front, the courtyard — as Bia on Metal, the hour and the weather
  held, rendered by our own camera (the game's can't be steered from a test) with people and pets
  out of the picture. Two runs of the same code: indoors 0 px over 8 levels (a stray few at most),
  outdoors only the wind in the trees (≤0.5%).
- **Walls from the structure** (`tp/walls3d.ts`): a floor's walls are the structure's (`drawnFloor`
  → `edgesOfWalls`, the map's edges only where there's no structure: tests, dev pages), read by
  `World3.buildWalls`, its posts, `shell()` (below-cull) and `relayout`'s `touchedWalls`. A wall
  along x or y on whole metres is drawn a metre at a time as before; one at any other angle or off
  the metres is drawn as pieces along its own line — the x-wall's piece turned and placed
  (`turnOut`), its own low part and runs of up to four (`low|free|…`, `run|free|…|n`), a post square
  to it at each end the lattice doesn't hold. Proven: on the campus the structure's walls are the
  maps' edges exactly, every floor, front and back (test); the stills identical indoors to the
  baseline (only the far tree line moves outdoors).
- **The ceiling from the structure:** the floor's indoor slabs (not the lot's asphalt and concrete:
  open sky) less the wells going up, as the rectangles Jolt's slabs are (`slabBoxes`, now exported
  as `@yutopia/shared/physics/structure-solids`), each a quad facing down. Proven: on the campus it
  covers exactly the tiles the old ceiling did, every floor (test); stills unchanged.
- **Cells:** a floor's walls and things are merged by **8 m cells square to the world** (the floor's
  corner added: `cellKey`), not 6-tile areas in its own frame; relayout's touched pieces in the same
  cells. Stills unchanged.
- **Below-cull from the structure:** what's floor (the cull's slab and its shell's inside) is the
  floor's slabs read even-odd (a mask a row at a time, kept till they change — asked per tile it was
  80 ms of an edit's frame); the shell's walls are the structure's edges. Proven: the slabs say what
  the tiles said on every campus floor (test); stills unchanged.
- **Checked:** client 282 (walls3d 4: the campus's walls, ceiling and floor from the structure equal
  to the tiles', a 45° wall's pieces), the relayout's 4; `VERIFY=40 e2e/wall-hitch.mts`: 40/40 edits
  laid in place identical to a fresh build; stills within the noise, every place, day and night.
- **An edit's cost on prod's floor 4** (`wall-hitch.mts`, prod's saved world): worst frames 67–108
  ms a wall put or taken (tp.update 37–73: relaying the cell and the floor's bake near it;
  light.update 31 the first time), not the plan's < 1 frame; phase 2 had 54 ms. 6 m cells measured
  the same (65–88, the run-to-run spread). Getting under a frame is its own work: merging only what
  changed in a cell, the floor's bake off the edit's frame.
- **Left in phase 8:** ~~that edit cost~~ (done below); ~~lifts as moving platforms~~ (done below); ~~one
  material family for the structures (plan 71 phase 1)~~ (done below); ~~the campus's outside (tp/campus.ts, its
  facade from the home map's runs) from the structure~~ (done below); openings in walls off the lattice (none can
  be made yet: phase 11's tool), and their fades and picks as turned boxes (an AABB now).
- **An edit's cost, cut** (the user: "Edit cost first"). Profiled on prod's floor 4
  (`wall-hitch.mts`): the edit's long task was 93 ms — the light map baked whole 28 ms, the floor's
  bake 21 (its AO 16), the light's composite twice ~10 each.
  - **The light map from the one before** (`art/light.ts` `LightMap(map, objects, prev)`): what an
    edit changed (a tile, a wall's edge, a door, a lamp that came, went or moved) found against the
    bake before; only the lamps (and windows' pools) whose reach takes it in added again, inside
    their reach — 26 → 4.7 ms. Proven equal to a fresh bake (`light.test.ts`: 25 random edits, a
    lamp moved, a door the other way; within 1e-4).
  - **The AO** (`art/floors.ts aoCanvas`): the walls read into arrays once (they were ~30 reads of
    the map's rows a pixel), a tile with nothing in reach skipped, only the part asked for written
    back — 16 → 8 ms, the same pixels by construction.
  - **The composite** once a bake and an hour (`setHour` after the edit's update made it twice; a
    GPU reset redraws it outright: `Light3.redraw`).
  - **The floor's bake the frame after an edit** (`World3.bakeSoon`/`flushBake`): the edit's frame
    has the walls; their shadows on the floor follow a frame later.
  - Measured: worst frames **35–52 ms** a wall put or taken (were 67–108); this machine's ordinary
    frame there is 33–40 ms. Left in the edit's frame (~25 ms of work, so not yet under one frame):
    `World3.update` signing every thing and laying every room's dressing out again (8–12 ms — a wall
    can change a room's dressing), the structure turned back into tile maps (`mapFromStructure`, 6:
    the adapter phase 11 removes), finding the touched pieces (2.5), the walls (4).
    `VERIFY=40`: 40/40 identical to a fresh build (the deferred bake flushed to compare); stills
    within the noise; client 284.
- **Cut further** (the user: "Keep cutting"). The sampling profiler had inflated the small parts;
  timed instead by wrapping each step as it runs (`WRAP=1 e2e/wall-hitch.mts`, with an idle stretch
  first as the yardstick — `IDLE` — and a timeline of the frames after the send). Signing and
  dressing turned out ~1.3 ms on prod's floor 4 (507 things, 45 rooms); the edit's frame was the
  map turned from the structure (5–7) + the light (5) + the relayout (8–9) + its render (11): 28 ms.
  - **Each floor's tile grid kept** (`structure/to-map.ts floorGrid`): by the identity of its
    walls, slabs and rooms (applyOps keeps what an edit didn't touch) — only the edited floor made
    again: `applyMapFromState` 5–7 → 1.3–1.9 ms. Shared read-only (nothing writes a map's rows in
    place; the edits copy).
  - **An edit over three frames:** the map applied in one (the 3D view's update held to the next:
    `controller.frame`, `tpDue`); its walls the next (`World3.relayout`, 4–6 ms); the things it
    touched (door frames, rooms' dressing, `relaidThings`) and its light (`Light3.update`, deferred
    in `view.update`) the one after; the floor's bake after that (`bakeSoon`). `World3.flushSoon`
    does what's left at once (a new edit first does, and the checks).
  - Measured (3 puts, 3 takes): every frame of the edit **14–18 ms** of work (`ctl.frame`), the
    same as this machine's ordinary frames there (15–18); worst frames 33–38 ms against an idle
    stretch's 26–33 — in the noise. `VERIFY=40` 40/40; stills: indoors identical, outdoors only the
    treeline's sway and a moving shadow (both differ between two baseline runs too); client 284,
    shared 609, world-server 206/206.
- **Lifts as moving platforms** (the user: "Lifts as platforms", 2026-11-05).
  - **The shaft** (shared `lift.ts`: `liftShafts`, `shaftHoles`, `shaftAt`): open from a shaft's
    lowest stop to its highest — each floor's slab between has a hole its size (physics/build.ts,
    as the stairwells), and the drawing's floors and ceilings with it (`wellsOf` takes the shafts:
    no floor drawn over one going on down, no ceiling under one going on up). A stop's statics
    (`lift:id`) are its shaft's three walls the storey's height, up to the next floor's slab, and its
    landing's doors — shut, but where the car stands open (then the wall on up from 2.3 m). The
    navmesh walks the car's floor at each stop (`BuildingSolids.liftFloors`); the landing's doors are
    its obstacle while shut.
  - **The car** a carrier in Jolt (`PhysicsWorld.setCarrier`: a kinematic body, layer floor — it
    holds you up as a slab does): its floor and its ceiling (`liftCarBody`), moved each frame in the
    browser (`Lifts.carBodies` → `BrowserPhysics.setLifts`) and each tick on the server
    (`room.liftCars`, features/physics.ts) to where `liftMotion` says it is.
  - **Riding:** whoever stands on a carrier goes with it — `moveCharacter` moves a body by what its
    carrier moved since it last stood on it, then moves it as asked (Jolt's own update kept a body on
    a slowly rising floor within 0.9 mm; the carry makes it exact, and takes a body along a jump
    — a tab that slept while the car went two floors on). Riding, you walk about the car; your floor
    is the one it's passing (`floorAt`, with the shaft a floor on every floor it goes through —
    `slabsOf`'s third argument). Before Jolt's in, held at its height as before.
  - **The server** still holds its riders in the car (so one whose page stopped drawing arrives with
    it) but no longer snaps them at the stop: their own car has brought them.
  - Checked: shared 612 (`physics/lift.test.ts`: the shaft's holes and floors, the drawing's wells, a
    ride up two floors standing on the car — exact, failing without the carry — a slept tab's jump,
    the landings' doors; building.test's and move.test's lift checks now set the car's body),
    client 284, world-server 202/206 in a full run with all 4 green alone (the phone's reconnect, the elevators' two riders, the stairs' long frame, the loot — load-flaky); in the browser as Bia on Metal, car A
    called on floor 4, walked into, ridden 4 → 1 and 1 → 4: on `liftcar:A` every sample, feet on its
    floor exactly, every floor passed, out onto floor 4's landing; no console errors. Stills: within
    the noise (a first run's lot at night lost a car's beam — load timing; the retake matched).
    Page 456.6 KB (budget 456 → 457); input 17.1 (17 → 17.5).
- **One material family for the structures** (plan 71 phase 1; the user: "Material family",
  2026-11-05). `world/look/yulit.ts`: a lit material of the world is three's Lambert (or Basic) with
  our look put on it in one place and one order — `yuLit(m, { light, cel, fade })`, one hook calling
  the parts in that order, one program key from them (`yu|lightmap-way|cel|fade`) — instead of hooks
  chained on hooks by whoever touched the material last (the room's light, then `celLit`, then
  World3's `withFade`, each wrapping the one before; switching a floor's light re-chained them).
  The parts: the room's light (`Light3.piece`: its light map, the day's balance, the lamps' pools,
  the snow's layer and a material's own extra — what `Light3.patch` was; `patch` is now the family
  with that part alone, so every lit thing of the view is one of it), the cel bands (`CEL`, from
  `furn/look.ts`), the fade flags (`fadePiece`, from `World3.withFade`). The fog stays every
  material's (fog3d.ts, on three's own chunk). World3 takes a light as a part (`(m) => Piece`) and
  `setLight` re-makes its materials from the parts. The shaders are the same text in the same order.
  - Checked: stills within the noise (indoors 0–2 px of 921,600, as every run against the base);
    `VERIFY=20` identical to a fresh build; client 284. In a session on prod's floor 4, 29 of the
    267 programs are the family's. Page 456.6 KB (unchanged: the family's in the 3D view's chunk).
  - Not in it yet: the campus's outside (`patchOutdoors`, with the campus from the structure), the
    land (`patchGrounds`), the people's and the pets' own looks — plan 71 phase 1 proper.
- **The campus's outside from the structure** (the user: "Campus outside", 2026-11-05).
  - The main block's facade (`tp/campus.ts`) runs round the home floor's slabs — what's floor read
    even-odd from their rings, row by row (`facadeRuns`) — and its windows are where the
    structure's walls are windows (`Outline.edges`: walls3d.ts `edgesOfWalls`, the same the floor's
    drawing reads), not the home map's tiles and edges. The view hands it over (`outlineOf`, the
    structure in `ViewOpts` so the first campus is drawn from it); with no structure (tests, dev
    pages) the map's, as before.
  - Drawn again when what it's drawn from changes: the studio's window things (as before) or, now,
    the outline — its slabs' rings, the window walls on it (a key worked out from each new
    structure in 0.01 ms; an edit elsewhere leaves the campus be: `surround` never ran in the
    measured edits).
  - The open sky's light is a part of the family now (`outdoorsPiece`; a campus material's own hook
    its `base` part, first): `patchOutdoors` is `yuLit(m, { base, light })`. 43 of 267 programs in
    a session on prod's floor 4 are the family's (29 before this).
  - Checked: `campus-outline.test.ts` — the campus's runs and windows from the structure equal the
    tiles' (a rectangle there); an L-shaped floor round a courtyard with 10 windows painted on its
    outline the same from either. Stills within the noise. Client 286.
  - Not drawn from the structure yet: the other two blocks and the bridge (the campus's own scenery,
    not the building's structure), the ground floor's lobby front (its doors from `entranceZOf`).

### Phase 9 — built 2026-11-05 (the user: "continue!"; then "Real heights")
- **The light volume** (`art/light-volume.ts`): a floor's light in three dimensions — 4 samples a
  metre across, 8 layers up its storey (layer 0 the floor, the last the slab over it) — sampled by
  the 3D view where a face is (`Light3`: a `sampler3D`, the floor's height in the scene `lmY`), the
  hour's ambient (the rooms' and the open sky's) and the windows' daylight put together on the GPU
  instead of painted into a canvas each hour. The plan-space light map and its composite are gone;
  `art/light.ts LightMap` is what lights a floor and what stands in the way (its lamps and windows'
  pools, its walls and shut doors, the line to a point ray-marched across the tiles — a wall stands
  the storey).
- **Lamps at their heights** (the user's pick between that and lamps at the floor, from stills:
  `design/screens/light-volume/`): each source has its height (`LightSource.z`: a floor lamp's shade
  1.45, a pendant 2.3, a panel 3.2, a fire 0.5, wall signs 1.6–2.0, a window's pool 1.3 — `LIGHT_Z`).
  The floor is lit exactly as before: a source at z gets R'² = R² + z² − 0.35², I' = I·(R'/R)⁴, which
  makes its light on the floor what the light map's was (proven: `light-volume.test.ts`, floors 0 and
  4, within half-float precision); above the floor, walls, furniture and people are lit by their
  distance to it in 3D — the band a lamp painted up the whole wall and onto the ceiling is a glow
  round its shade. People take the tint at chest height (`tintAt(x, y, 1.2)`).
- **An edit** makes the volume from the one before (`LightMap.changedSince` with the volume's own
  reach): only the sources whose reach meets what changed added again — proven equal to a fresh one
  (`light.test.ts`: 25 random edits, a lamp moved, a door turned). `light.update` 1.7–3.4 ms an edit
  on prod's floor 4 (it was 7–10 with a float copy converted whole).
- **Memory:** half floats only, the texture's own array (one copy, CPU and GPU alike), no cache of old
  volumes: prod's world 3 MB a 64 × 48 m floor, 14.7 MB the ground floor with the lot (~27 MB all
  five). The render's CPU time unchanged (A/B against the last commit: 5.6–5.8 ms vs 5.7–6.1).
- **The floor's look per slab** (`art/floors.ts`): each slab painted in its own shape with its
  material (the structure's slabs, less the wells), a hair past its edge so two meet without a seam;
  the strips between materials from the slabs too; the floor's quads from the slabs' rings
  (`World3.isFloorAt`). The iso view's turn (`FloorBake.draw`, its screen chunks, `floorRes`) is
  gone — `/dev/rooms` turns the plan itself for its old sheet. Stills against the volume's run:
  indoors 0–2 levels off, outdoors the usual noise. The floor's bake an edit 9.2–9.5 ms (6–8 with
  the tiles' squares), in its own frame.
- Budgets: page 456.5 KB (457); the Grounds' line 171.2 → 202.9 (184 → 205) with no code moved in —
  the bundler put light3d in with the people's art chunk (every chunk together 5,074 KB in 259 files,
  the same as the last commit's, built in a worktree to see).
- Checked: client 289; stills (8 places × day/night) — day unchanged, night as signed off; the edit
  check `VERIFY=20` 20/20 (it now puts the floor on the map's own slabs and tiles first, baked whole:
  its edits are the map's, not the structure's).
- **Left:** the light's occlusion from the structure's walls (a wall off the lattice, phase 11's;
  the ray-march is across the tiles), light through stairwells and shafts between floors (each floor
  its own volume), the AO from the structure's walls (`aoCanvas` reads the map's edges), slabs off
  the lattice and at other heights in the floor's quads (none can be made yet). A one-off seen once:
  the campus's facade bands bright in one stills run's lot (not again in three) — the campus built
  again while the structure arrived, not confirmed.

### Phase 10 — built 2026-11-05 (the user: "Phase 10")
- **Rooms as polygons.** A room is the face its walls close round (phase 6's `roomsFromWalls`); the
  adapter's areas now carry it (`AreaDef.outline`, world frame, folded with the area) when it isn't
  their rectangle, and `inArea(a, x, y)` tests it (even-odd), else the rectangle. `areaAt` asks it,
  so everything that finds a room by a point does: a door's room and owner (`doorRoom`: the room
  one side of its edge and not the other), locks and who passes (the walker's closed rooms), the
  room's dressing (`dressing.ts`), its lights by its switch (`lights:room`), the office's plans
  (`furnishedIn`), stand-ups, pets' home room and their rounds, Vortex's areas, hearing, the room
  panel's things, Christmas's decorations. The area's rectangle is kept as drawn (what a map made
  from the structure again keeps: the round trip leaves the derived outline out).
- **Measured on prod's saved world:** all 28 rooms' outlines are their rectangles (`ROOMS=1
  e2e/wall-hitch.mts`), and the campus's too — nothing changes there today; a room whose walls
  close round more than its rectangle (phase 11's free walls) is the whole of it.
- **Sound:** voices already pan by the 3D camera (`tp.pan`); a phone's ring did by the old iso screen
  (`stereoPan`), now by the camera too.
- Checked: `structure/room-shape.test.ts` — an L-shaped room drawn as its top arm's rectangle: its
  outline the L (six corners), its arm down the office by `areaAt`, the inner corner's outside not,
  its door's edge the office's, two in it hear each other and one outside (it's private) doesn't.
  Shared 614, client 289, world-server 204/206 (Vortex, the loot: green alone).
- **Left:** what lays a room out by its rectangle (the dressing's rows, the office's plans, Christmas's
  places, the room's middle a walk-to aims at) takes the rectangle, not the rest of an L; voices
  muffled through walls (a Jolt ray on the wall layer) is the user's choice, not built.

### Phase 0 — the build tool's mocks, made 2026-11-05 (the user: "Continue then")
- **`design/build-tool/`**: 11 stills, the decisions' sheet and a reel (a room drawn wall by wall,
  `reel-draw-a-room.mp4` / `.gif`). Made over the game's own 3D view — floor 3 of the studio (blank)
  and the east field by the woods for god mode — with the mock's walls, arc, slabs, ghosts, guides
  and dots drawn into its scene as real 3D (`mock/capture.spec.ts`, as Bia on Metal, its own camera,
  people hidden; the shots in `mock/shots.mjs`), the HUD and the notes over it in HTML from the
  live classes (`mock/build-tool.html`, `mock/render.mjs`).
- The stills: 01 drawing a wall (click-click chaining, length and angle typed), 02 the snaps (ends,
  middles, square, a wall's line carried on; 0.5 m grid, 15°), 03 an arc (two ends, its bow), 04 a
  wall's height (dragged to a rail), 05 a room found as the chain closes (named there), 06 a door
  slid along its wall, 07 a floor drawn at a height (a mezzanine), 08 the level (the floors and the
  mezzanine between), 09 stairs between two slabs, 10 a thing at 23° with its back to a wall, 11 the
  same drawing outdoors in god mode, 12 the six decisions with a pick each (arcs: yes; thickness:
  three; pitched roofs: later; posts: where walls meet at an angle; a split room: the bigger part
  keeps it; a level: the floors and what's between).
- **Decided** (the user, 2026-11-05, asked one by one): arcs in v1 (ends snap as a straight wall's,
  bowed by the middle in 0.25 m steps or a half circle, doors and windows in them); three wall
  thicknesses (0.1 a partition, 0.2, 0.3 outer); **pitched roofs now** (a gable or a hip drawn over a
  closed set of walls — not my pick: in phase 11, with the flat ones); a post where walls meet at an
  angle, none where one carries straight on; a wall across a room — the bigger part keeps it (name,
  owner, lock), the smaller a new room, unnamed; the level — the floors at their heights, a slab
  between them (a mezzanine) under its floor, PgUp/PgDn through them, a height of its own for any;
  snaps on by default (Shift: free; 0.5 m grid, 15°; things turn 15° on R).
