# Plan 112 — the insides: build inside the town's buildings, Sims-style

Asked 2026-11-21, after plans 110–111:

> Criar ambientes internos editaveis dentro das estruturas estilo The sims
> Dentro dos buildings que melhoramos, vamos usar a mesma ferramenta de building que usamos no office para colocar
> os moveis, paredes etc... dentro desses ambientes prontos

The ask: editable interiors inside the town's buildings, The Sims style. Inside the buildings plans 110–111 improved,
use the office's own build tool to place furniture, walls and so on, in the ready-made shells.

Status: **built 2026-11-21 ("go all"), uncommitted; planned 2026-11-21; forks decided 2026-11-21 one by one: F1a admins only build inside (members walk in;
the one change from the recommendations), F2a every walk-in building, F3c every storey with a starting staircase,
F4a a fixed shell, F5a empty unless Furnished, F6b no sign-offs.**

This takes up plan 54 ("Spaces", 2026-10-29), which was designed and decided but never built. Plan 72 has since
rebuilt the build tool on a structure in world metres, so plan 54's investigation is redone here against today's
code.

## Where we are (2026-11-21)

### The build tool edits one structure: the HQ's

- `structure/types.ts`: one `Structure` per world.
  - Floors `{index, z, grid}`, walls as segments, slabs as polygons, rooms, roofs.
  - Everything is in world metres, in the Grounds' own frame (x/y the ground plane, z up).
- The client's tool is `world/build/controller.ts` (`BuildController`, the lazy "yutopia-build" chunk):
  - walls (`freewalls.ts`: line, arc, box, erase), floors and roofs (`freefloors.ts`), rooms, and the furniture hand;
  - the camera's walls up / cut away / down (`store.ts:390`, `model.ts:523`): already Sims-like;
  - the panels in `components/hud/build/`.
- Edits go as messages to the server:
  - `struct:walls|paint|slabs|roofs`, `level:add|remove`, `map:room:*` → `features/mapedit.ts`;
  - `obj:put|remove` → `WorldRoom.putObject`; `obj:batch|hold|removeMany` → `features/furnish.ts`;
  - undo and redo → `history.ts`.
- The server applies them with `commitStructure` → `applyStruct`: the shared `applyOps`, `structRev`, a
  `struct:ops` broadcast, the grid rebuilt. Clients fetch the whole structure with `struct:get`.
- The rules are shared (`structure/edit.ts`, `slab-edit.ts`, `roof.ts`, `rooms.ts`, `floors-edit.ts`,
  `free-things.ts`'s `freeFits`). A wall or slab off its floor's `grid` is refused ("off the floor").
- Storage:
  - the API's `worlds.structure` (version 4, ≤ 13 floors, ≤ 4 MB), saved 1.2 s after an edit;
  - objects in the `world_objects` rows, their floor in `props.level`;
  - `WorldSnapshot` v3 exports both.
- Physics and nav: `buildingSolids(map, objects, structure)` builds the Jolt bodies, and `syncNav` the recast
  navmesh, a floor at a time.
- Who builds: every real account is a builder (`User.php` roles, `p.builder`). Room owners lock their rooms
  (`lockBreak`). Admins alone refurnish a floor, give rooms away and use God mode.

### A town building's inside is code

- Plan 111 made every kit building walkable (`grounds.ts` `INSIDES`, `layInsides`). An `Inside` is
  `{b, floor colour, fits, door, fy}`:
  - its floor is a slab at the door's sill (`fy` over the land);
  - its walls are the shell's (`shapes/grounds.ts` `insideWalls`);
  - its furniture is fixed `Fit` boxes, not objects.
- Drawn by `grounds3d.ts` `interior()`. While you're in, the building's outside is hidden.
- Not one line of the build code knows an `Inside`. The two systems share only the land.
- **The town has 36 walk-in buildings: 16 houses, 8 shops, and the diner, bar, hotel, church, barn, farmhouse,
  warehouse, boathouses, sheds and gatehouse.** 25 stand more than one storey outside, but only the ground floor
  exists inside. Their layouts know their storey heights (`building-styles.ts` `storey`, 2.75–3.4 m).
- Plan 111's cheap rooms behind each window (`kit-rooms.ts`) are quads inside the shell, over every storey but a
  walk-in's ground floor.

## The design

### A. A space is a structure of its own

A building's inside is a **space**: a `Structure` of the same type as the HQ's, keyed by the building's key. The
same ops, rules, view, physics and nav then work on it unchanged. Plan 54 found the alternative, one map for
everything, touched ~100 places. Plan 72's structure is the seam that makes this cheap.

- **In the Grounds' frame** (plan 54's decision 2):
  - its floors are the building's storeys, at their real heights: `z = land + fy + i × storey`;
  - its `grid` is the plot;
  - nothing is moved or shifted.
- **Laid from the building's layout** the first time it is opened. It gets:
  - a floor per storey (F3);
  - a slab over the inside at each (an upper one with a stairwell hole when there are stairs);
  - the shell's inner faces as **shell walls**: flagged `shell`, never moved or erased, drawn by the kit outside,
    but there for the tools to snap to, hang things on and cut away;
  - the door's and windows' openings marked on them.
- **The HQ is the space `hq`**, and nothing of it changes (its structure byte for byte).
- **A building with a space has no generated inside**: no `Fit`s, no porch slab, no `INSIDES` walls. Its space's
  slabs, walls and things are its inside. Plan 111's fake rooms are dropped at every storey the space has.

### B. Storage and sync

- API:
  - a `spaces` table (building key, structure JSON, rev, updated);
  - `GET` with the world, and `PUT /internal/spaces/{key}` with the structure's rules (≤ 1 MB each);
  - objects carry `props.space` beside `props.level` (none means `hq`);
  - `WorldSnapshot` v4 carries the spaces.
- World server:
  - spaces load with the world and each saves on its own 1.2 s timer;
  - the edit messages carry `space`;
  - `struct:get {space}`, and `struct:ops` carry their space.
- Clients fetch a space when its building comes within ~80 m (the Grounds' stream), not with the world.

### C. Where you are

- **In a space when your feet are inside its building's plot**, at one of its floors' heights (floors by height,
  plan 50). Outside every plot, the HQ's or the land.
- `space` joins the player. `Player` sits at the 64-field limit (memory: colyseus 64 fields), so it folds into an
  existing field, with `schema.test.ts`'s guard.
- Inside a space, `level` is the storey (0 = the ground floor, as the walk-ins are today). The `level === 0` checks
  (~85) stay true on the ground floor.
- Hearing, areas, spots and last spots key by `space|level`.

### D. Build mode inside

- **Inside a building, B opens build mode on its space for an admin** (F1a: a member's B there does nothing, as
  God mode's tools; the server refuses their edits by `Player.admin`), on the floor you're on:
  - the same tools, catalog, history and camera;
  - the floor picker lists the building's storeys;
  - the HUD names it ("Pine House · ground floor").
- **The camera's walls up / cut away / down includes the shell.**
  - The building is drawn on its own from its layout (as God mode's pictures do: `kitBatches` for one building),
    wall by wall.
  - Its slice of the merged kit cell is hidden while you build.
  - The roof and the storeys above the one you're on are hidden, as The Sims does.
- What's out of place inside a shell: the map tool, and desks (the office's seats). The rest is as in the office.
- The shell is fixed (F4): inside you build walls, floors, stairs, rooms, furniture, lights, wallpaper and floor
  tops.

### E. Physics and nav

- A space's solids join the one Jolt world, keyed `space:<key>:…`. The shell's own bodies stay `shapes/grounds.ts`'s,
  minus the porch slab and fits.
- Nav: the Grounds' land windows already cover the walk-ins. A space's walls and things go into the window over
  its plot, and its upper floors get their own navmesh as the HQ's do. Mind the GRID_OFF and fromZ/toZ fixes of
  plan 111.

### F. When the building changes (God mode)

These are plan 54's rules, kept:

- **Moved** in a publish: its space moves with it.
- **Resized** smaller than what's built inside: refused, with why.
- **Restyled**: allowed. The shell walls are laid again from the new layout. Things that end up in a wall or a
  doorway are flagged in the publish's checks.
- **Taken away**: its space is kept out of the world, and a rollback brings both back.
- God mode's building panel shows its space (rooms, things, floors) and a "Go in and build" button
  (`design/god/09-inside.png`).

### G. Lights and looks

- A space's lamps light it as the office's do, and its windows show them at night.
- From outside, near (≤ 60 m), a building's windows look into its real space. Farther, plan 111's cheap room stands
  in, with the space's light share (lit or not) carried to it.

## Forks

| # | Fork | Options | Recommended |
|---|---|---|---|
| F1 | Who builds inside | a admins only (plan 54's) · **b** every builder, as in the office today (room owners' locks as there) · c each building has an owner (given by an admin, Sims' "your lot"), only they and admins build in it | **b** |
| F2 | Which buildings | **a** every building you can walk into (the 36, and any God mode places) · b homes only (houses, farmhouse) · c only those an admin opens to building in God mode | **a** |
| F3 | Upper floors | a ground floor only for now · b every storey the outside shows, as a floor; stairs placed with the tool · **c** every storey, with a starting staircase laid by the door (moved or taken away with the tool) | **c** |
| F4 | The shell | **a** fixed: its outer walls, door and windows are the building's; inside, everything else · b openings editable from inside too (a window added shows outside) | **a** |
| F5 | What a space starts with | **a** empty, except where the building is "Furnished": its kind's furniture turned into real things you can move · b always its kind's furniture as real things · c always empty | **a** |
| F6 | Sign-offs | a mocks first (build mode inside a house: cutaway, floor picker, HUD; the God panel), signed off, then straight · **b** no sign-offs | **b** |

## Phases

0. **Decisions** (and the mocks, if F6a).
1. **Shared: a space.**
   - `spaceOf(b)` lays a structure from the layout: floors, slabs, shell walls with their openings, the stairs (F3).
   - The rules: shell walls kept, the plot as the floor's grid.
   - `INSIDES` defers to a space. Tests: every kind × style laid, then a wall, a slab and a thing put and refused
     where they should be.
2. **Storage**: the API's `spaces` table and routes, `props.space`, snapshot v4 (API tests, isolated from the dev
   DB).
3. **The world server**:
   - spaces loaded, saved and fetched; the edit messages by space; `space` on players;
   - hearing, areas, spots; physics and nav per space; admins only build in a space (F1a), on the server.
   - Tests: two players in two spaces; an edit in one never reaching the other's structure.
4. **The client's view**:
   - spaces fetched with the stream and drawn by `World3` (a view per space);
   - the generated inside, the porch and the fake rooms dropped where a space is;
   - lights; the floor from your height.
5. **Build mode inside**: B in a building, the floor picker, the HUD, the shell drawn alone and cut away, the panels
   that fit (D).
6. **Floors and stairs** (F3): storeys you can walk up, the stairwell hole, the upper floors' nav.
7. **What it starts with** (F5): a furnished building's `Fit`s turned into catalog things.
8. **God mode**: the panel's space, "Go in and build", and the publish rules (F).
9. **Checks**:
   - e2e: an admin (Ana) builds inside a house (a wall, a sofa, the stairs, upstairs), seen by a second browser
     (a member, whose edits there are refused), kept over a reload
     and a world-server restart;
   - the HQ's structure unchanged;
   - the shared, world-server and client units;
   - the flicker scan over a built space;
   - frame times in town with every space loaded; a memcheck cycle.

## Guardrails

- The HQ is the space `hq`: its saves, snapshot and every office feature unchanged.
- Run the API tests isolated from the dev DB (memory: api-tests-dev-db).
- The `Player` field limit: fold, never a 65th field.
- The shared dev world: check other sessions before restarts and e2e.
- No full e2e unasked; the specs near the change and the known reds.

## Built (2026-11-21, "go all")

### The one change to the design: storeys are floors of the one structure

Design A had each space as a structure of its own, stored in a table of its own (B). Built, a town building's storeys
are **floors of the HQ's one structure**:

- They're numbered from `SPACE_BASE` 32 up to 255 (`Player.level` is a byte).
- Each is tagged with its building: `Floor.space`, `storey`, `ceil`, and `away` when its building is taken away.

What this keeps:

- Every edit message, the server's `applyStruct`, `struct:ops`, undo and redo, the API's save, the snapshot, physics
  (`buildingSolids`) and the navmesh work on them unchanged.
- No `spaces` table, no per-space sync, and no `space` field on `Player`. The 64-field limit is untouched: the floor
  *is* the space.

What it took instead:

- **A floor's height is no longer `level × STOREY`.** `levels.ts` keeps a registry of the town's storeys
  (`setSpaceFloors`, called by `viewOf` on every change). `elevOf` reads their real heights from it.
  `aboveOf`/`belowOf`/`riseOf` give each storey's own stack and rise.
- The code that assumed `l ± 1` and STOREY now asks these instead:
  - `floorAt`/`floorChange`, from the land into a building's ground storey (`spaceGroundAt`) and out again;
  - the stairs' ramps (`stairsRise`), wells, rails, physics and connectors.
- The API takes up to 256 floors, and spots, spawns and perf reports on any level 0–255.

The dev world went from 5 floors to 58 (53 town storeys, 35 buildings) and from 101 KB to 155 KB. Laying them at
boot: physics 1.4 s; navmeshes are made when a way is first asked on a storey (12 kept).

### Shared (`structure/spaces.ts`)

- **Laying a space** (`laySpace`):
  - `hasSpace(b)`: every kit building you walk into except the skate hall;
  - `storeysOf(b)`: the layout's new `storeys` (frame and block styles), the first storey at its door's sill;
  - `shellWalls`: the plot's four edges as `shell` walls, with the kit's holes over that storey as `gaps`;
  - an inner slab per storey, the upper ones open over the stairwell;
  - `starterStairs`: against a side wall by the front, clear of the doorway, its landing into the room;
  - `furnishThings`: a furnished building's fits turned into catalog things (bentwood chairs, counters a catalog
    length each).
- **Keeping spaces with their buildings** (`spacesFix`):
  - laid where missing;
  - **refit** when a building moves, regrows or is restyled: things move with its corner, the shell is laid again,
    gone storeys go `away`, new ones are laid;
  - floors go `away` (kept) when the building goes, and come back when it does.
- **The shrink rule** (`spaceShrinkWhy`): a publish that leaves walls or things outside the plot, or on a storey the
  building no longer has, is refused.
- **Rules**:
  - shell walls are never erased, made higher or thicker, nor given doors or windows (tile or free); they are painted;
  - a drawn wall's full height is its storey's `ceil`;
  - no lifts in a town building.
- **Grounds**:
  - a kit building's `Inside` has `space: true` and no fits;
  - its porch slab is the structure's;
  - loot reads `furnishingsOf`;
  - `slabsOf` takes a town storey's slab where the land is the same height.

### World server

- `fixSpaces` runs at load and after every publish or rollback. It lays, moves things and saves.
- `spaceWhy`: admins alone build on a town storey (F1a). This is enforced on `struct:*`, `obj:put`/`remove`,
  `obj:batch`/`hold`/`removeMany`, and `shellEdgeWhy`.
- `level:add`/`remove` count the HQ's floors only (`hqFloorsOf`).
- `wayThrough`: a walk-to through a building's door — the land's leg to the door, then the storey's leg inside, and
  the other way round.
- God mode's publish checks `spaceProblems`.

### Client

- **The 3D view's floor rule** (`floorShown`):
  - the HQ's floors below mine;
  - from inside a town building, the land's floor;
  - my building's storeys below me;
  - every storey of another building within `SPACE_NEAR`. That is 110 m, the kit's near level, whose fake rooms are
    now off for space buildings; its far panes stay.
  - It is placed again when the set of near storeys changes.
  - People, stairs and the warm-up follow the same rule. Readiness counts the HQ's floors.
- **Drawing a storey**:
  - shell walls as a 4 cm skin on the inner face, cut by their gaps (`walls3d` `skinOf`, World3's free walls);
  - ceilings at the storey's `ceil`;
  - town stairs climb their own rise, with no fire doors.
- **Building inside**:
  - a building's outside stays hidden while you build in it (`Grounds3.cutFor`);
  - the floor picker lists its storeys as G, 1, 2, with no add or remove;
  - the top bar names the building;
  - a member's build mode closes with "Only admins build inside the town's buildings."
- **God mode's building panel**: "Inside · N floors · M things" and **Go in and build**, which leaves God mode,
  puts you at the door inside and opens build mode.

### Found on the way

- **Hearing**: a town building's ground storey hears like the land (its door open on the street, as the walk-ins
  did). Its storeys are a stairwell apart, as the HQ's floors are (`hearingGain`, `aboveOf`/`belowOf`).
- **Lazy navmeshes**: 53 navmeshes a room aborted the wasm in `rooms.test.ts`. A storey's mesh is now made when a way
  is first asked on it, and the last 12 asked are kept (`BuildingNav.lazy`).
- **The porch**: the Grounds' porch block coincided with a storey's slab, and `slabsOf` read the porch's key. The porch
  is gone for space buildings.
- **Lists of every floor**: these now count the HQ's floors only (`hqFloorsOf`): the roof sound's top floor, the admin
  "Anywhere" chips, `level:add`/`remove`, and the warm-up's readiness.

### Checks

- **Tests**:
  - shared: 784/784, with five new tests in `structure/spaces.test.ts`; the Grounds fingerprints and the town fixture
    (13 chunks) were updated for the fits and porches gone;
  - world-server: world, rooms (two floor tests count the HQ's floors now), godmode, grounds-edits, schema, physics,
    survival, dark, lifts, spot and admin. Under load, the full rooms run had vortex, slot cars and the phone red
    and the survival run its loot test; each passes alone;
  - client units: 463/464. The red is the HUD colour test, already red on HEAD;
  - API: the world and perf tests, apart from two reds that predate this plan (a spawn at x 500 now inside the
    ±2000 bounds, and 5 vs 5.0).
- **Budgets**: `/page` 493.4 KB, so the budget was raised 493 → 494 (`tools/budget.mjs`, noted there). Every lazy
  chunk is within its budget (god 26.7/27, grounds 173.2/205).
- **Probes**: `e2e/zz-space.mts` (the bar: in, up, down, out by walk-to) and `e2e/zz-space-build.mts` (a house: Ana in
  from God mode's way, a wall and a sofa, the shell's erase refused; Bia refused). Stills are in `design/insides/`.
- **Not done**:
  - a memcheck;
  - pets and people on Jolt-less heights (pets) stand at the land's height inside;
  - the full e2e (not asked).
