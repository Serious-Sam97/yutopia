# Plan 127 — Default nests, map-wide, God mode's

Asked 2026-11-25, after plan 126's nerf:

> we need to think on something
>
> God mode should yes have control on the nests, but we have a big map, we should think on how to already add all
> the default nests on the entire map.
>
> just a detail, i wen by the map and i found zero animals, i had to spawn the nest manually

Status: **planned 2026-11-25; forks decided 2026-11-25, one by one; built 2026-11-25 straight through (F8a), tested — not committed.** What was built is under "Built" at the end.

The forks:
- **F1** both kinds: the animals' places and the dark's nests;
- **F2a** the defaults are generated and God mode's draft keeps overrides only;
- **F3b** the dark's nests stay random each day, spread map-wide. God mode adds fixed extra nests and marks empty areas; it can't edit a day's nests one by one;
- **F4a** the dark's nests come by a density per km² by zone, made only round people, and each person's cap of shadowed stays;
- **F5a** God mode sees, deletes, moves and changes a default animal place, and a moved one keeps its id and its trust;
- **F6a** markers show within ~500 m of the camera, with a layer toggle each and a count in view;
- **F7a** defaults are recomputed from the land as it is, overrides kept by key, and a moved one on a spot that's no longer walkable is flagged at publish;
- **F8a** built straight through, tested at the end.

## What there is today

There are two kinds of "nest", and neither is a real place God mode can see.

**The animals' places** (plan 126): herds, dens, birds' nests.
- **Generated:** `landGroups(cx, cz, seed)` (shared `animals/habitat.ts`) makes them per 192 m square, by habitat. They're seeded and stable (ids `l{cx}_{cz}_{kind}_{g}`, which trust is keyed by), and made on the server only when someone comes within 2 squares. The density bug is fixed separately (see plan 126, "Zero animals"): `SPAWN_SCALE` 0.4→1.6.
- **Placed:** God mode's places (`animals.add`: herd, den, nest, empty) and the farm's pens, which can be removed by key.
- **The gap:** God mode never shows a generated group. An admin can't see where the wolves' den is, move it, take it away, or see that a valley is empty. All they can do is add more on top.

**The dark's day nests** (plan 31; shared `dark/nests.ts`): the shadowed sleeping by day.
- **A new layout each day:** `dayNests(day)`, seeded by the day, up to 80 nests, 140 shadowed at most.
- **Where:** only inside a box of about 900 × 730 m round the old campus (`LAND` in nests.ts), weighted to named spots (the farm, the ravine, the pond, the tower, the shed, the bridge, the town's edges) and the deep woods.
- **The gap:** the long road, Silver Lake, Hawk Pass and the land grown in God mode (meadow, hills, mountains, farmland, beach, desert) have none. God mode has no control over them; it can't add, move, remove or see them.

The map today is about 11.5 × 3.7 km of bounds (core, kart, strike, long road ×23, Silver Lake) plus whatever God mode grows. At plan 126's new numbers that's several thousand animal groups if they were all listed.

## The proposal (before the forks)

1. **Defaults stay generated but become visible.** The generator is the source of every default place. God mode draws them from the same seeded code, and the draft holds only overrides: removed by key, moved, changed, or added. This is how the farm's pens already work. New land gets its defaults the moment it's grown, and nothing big is written to the edits.
2. **The dark's nests spread map-wide.** (The proposal was fixed sites with a daily pick; the user chose F3b, random daily.) Each day's nests are made per square round people, by zone (woods, fields, shores, rocks, the town's edges), seeded by the day and the square. The campus keeps its named spots. God mode adds fixed extra nests (out every day) and marks areas empty ("no nests here": round a base, a spawn, a showpiece).
3. **Only what's near people runs.** Both kinds are activated round people, the way the animals' squares are, so a bigger map costs nothing extra while it's empty.
4. **God mode shows them by distance,** with a layer toggle each (Animals, The dark) and a count of what's there, so thousands of markers don't swamp the view.

## The forks

- **F1 Which nests** — decided: **both** (the animals' places and the dark's nests).
- **F2 How the defaults exist:** (a) generated + overrides, recommended; (b) baked once into the published edits as a list; (c) baked per region when it's grown.
- **F3 The dark's daily layout:** (a) fixed sites, daily occupancy, recommended; (b) fully random each day as now, map-wide, God mode adds fixed ones and empty areas only; (c) fixed nests, the same every day.
- **F4 How many of the dark's:** (a) a density by zone over all the land, only those near people out, recommended; (b) keep today's 80 a day, spread thinner over the map; (c) scale today's count by the land's area.
- **F5 What God mode can do to a default:** (a) see, pick, delete, move, change species/size, recommended; (b) see and delete only; (c) see only, overrides by adding.
- **F6 How God mode shows them:** (a) near the camera only (~500 m) plus a layer toggle each, recommended; (b) everything on the overview map; (c) both.
- **F7 When the land changes under a default** (land grown, terrain edited): (a) defaults recomputed from the land, overrides kept by key, a moved one whose spot became unwalkable flagged at publish, recommended; (b) defaults frozen when first seen.
- **F8 How it's built and tested:** (a) built straight through, tested at the end, recommended; (b) phase by phase with sign-offs.

## Phases (sketch, refined after the forks)

0. Already done: plan 126's density fix (`SPAWN_SCALE` 1.6, big game up), measured on the live land.
1. **Shared defaults:** `defaultAnimalPlaces(rect)` (the generator's groups as places with stable keys) and `dayNestsIn(day, cx, cz)` (a day's dark nests per square by zone, map-wide, with the campus's named spots kept). Pure, seeded, cached per square.
2. **Overrides in the edits:** `animals.remove` and `animals.change` (moved, species, how many) for generated keys; a new `nests` section (`add` fixed nests, `empty` areas). Validated in `checkAnimalPlace` and a new `checkNest`; draft and publish.
3. **The server:** the animals use defaults minus overrides. The dark's day nests are made per square round people (`dayNestsIn(day, cx, cz)`), by zone density (F4a), with God mode's fixed ones added and its empty areas taken out. The cap of shadowed per person stays.
4. **God mode:**
   - The Animals tool draws the defaults (dimmed) and the placed ones within ~500 m. You can pick, move, delete and change a default.
   - A Dark nests layer shows today's nests near the camera, God mode's fixed ones, and its empty areas. You can add fixed ones and empty areas.
   - Each layer has a toggle and a count.
5. **Checks:**
   - tests for stable keys, overrides, the dark's daily pick;
   - the dark's existing nests tests;
   - the server's tick with the new animal counts (plan 126's open measurement);
   - a God mode e2e: see a default den, delete it, publish, it's gone.

## Built (2026-11-25)

**Shared** (`animals/habitat.ts`, `dark/nests.ts`, `grounds-edits.ts`, `grounds-draft.ts`, `protocol.ts`):
- **The land's own groups have stable keys.** `l<cx>_<cz>_<kind>_<n>`, read by `isGeneratedKey` and `generatedCell`. An empty place now drops a group after its random draws, so it no longer shifts the square's other groups.
- **How a group shows in God mode:** `placeKindOf` (a predator's den, a bird's nest, else a herd), `placeOfGroup`, and a shared `canBeAt` used by the server and God mode alike.
- **The overrides** sit in the existing `animals` section, by key: `remove` takes one of the land's groups away; `change` moves or changes it (species, where, how many, young).
  - `changedDefaults` makes the changed ones, cached per edits object.
  - God mode writes a change whole, so it stands on its own if the land stops making that group (F7a) and never needs the original square's land read again.
- **What a square holds:** `cellGroups(e, cx, cz)` is the land's groups minus the removed, changed and emptied ones, plus the changed ones now in that square, plus God mode's own.
- **Publish checks:** `checkDefaultChange` checks the change itself and that a moved one is somewhere its species can be.
- **The dark past the campus (F3b, F4a):**
  - `dayNestsIn(day, cx, cz)` makes a day's nests per 192 m square, seeded by the day and the square.
  - It works by the share of deep woods, open ground and banks: `FAR_NESTS` woods 22, clearing 5, river 9 per km². That came out at about 14–19 per km² of land, against about 100 inside the campus.
  - `farNestAllowed` keeps them on walkable land, out of the water, off paths and paving, and clear of buildings. The campus box keeps `dayNests` as it was.
- **God mode's own nests:** a new `nests` section (`NestPlaceDef`: `nest` out every day with 1–4 asleep, or `clear` with a radius), read by `nestPlacesOf`, `fixedNests`, `keptClear` and `checkNestPlace`. It's counted in the draft like any section.
- **New messages:** `god:wild` both ways. God mode asks for what's round its camera; the server answers with the land's own places, today's dark nests, and how many squares it's still making.

**Server:**
- **Animals:** `features/animals.ts` makes its squares from `cellGroups`.
  - It now waits for a square's land to be made (`land.ts squareReady`: every land chunk of it, asked for in the worker) before reading it. Before, a square on land not yet made could stall the tick by hundreds of ms, making 36 chunks at about 6 ms each.
  - `god:wild` is answered for admins: within 500 m, with about 10 ms of work per ask, cached by square and cleared when edits are laid.
- **The dark:** `features/dark.ts` keeps today as three lists:
  - the campus's (`all`; the first `count` are out, as before), minus God mode's clear places;
  - God mode's own (`fixed`, out every day);
  - the far land's (`far`, by square).
  The far squares round each player are made at most one a second, once their land is made. The cap of shadowed out of nests (NESTS.cap) covers all of them. A publish that changes the `nests` section lays the day out again.
- **Caches:** `room.dark.nestCaches()` lets survival show and search the caches of God mode's nests and far nests too.
- **Publish:** `godmode.ts` refuses a draft whose changes to the land's own are unsound or moved where they can't be, or whose nest places are unsound.

**God mode** (`world/god/animals.ts`, `GodHud.tsx` AnimalsPanel, `controller.ts`, `store.ts`):
- **What's drawn round the camera's point (500 m, F6a):**
  - the land's own groups, as dimmed green rings (a den with its territory);
  - God mode's places;
  - the moved or changed ones where they are now;
  - today's dark nests, in dark red;
  - God mode's own nests and its clear places.
- **Where it comes from:** the server, through `god:wild`. The client's main thread doesn't make land chunks (its land is the workers'), so reading the land there would mean about 6 ms per chunk on the frame.
- **Layer toggles:** "Animals (n)" and "The dark (n)", with a line counting what's near: the land's own, placed, dark nests today.
- **Two new kinds to place:** "Dark nest" (1–4) and "No dark nests" (a radius).
- **A click picks any of them, the land's own too.** The picked one shows its species and how many, both changeable, plus Move (then a click; Esc cancels) and Take away (or Delete).
  - Moving one of the land's own refuses a spot its species can't stand on.
  - The land's own are written whole into `change`, keeping their key and so their trust.
- **Budget:** `yutopia-god` went from 34 to 37 KB in `tools/budget.mjs` (35.1 measured). The page measured 504.7 of 505.

**Checks:**
- **Shared:** `animals/defaults.test.ts` (7 tests):
  - stable keys;
  - an empty place doesn't shift the square's other groups;
  - removed, moved and changed groups by key, with a moved one in its new square under its own id;
  - a change standing alone;
  - the publish checks;
  - far nests: none in the campus, on the land, off paths, different each day;
  - God mode's nests and clear places.

  The animals, defaults and campus nests tests pass, 28 of 28.
- **Server:**
  - `nests.test.ts` gained a far nest out on the long road (asleep, once you're near) and God mode's own nest out by day with a clear place keeping the farm's nest away: 6 of 6.
  - `animals.test.ts` gained one of the land's own moved by God mode, out where it was moved by its own key: 6 of 6, twice.
  - godmode, pets and dark pass, 23 of 23.
  - survival's loot test fails about one run in three: its 2.6 s wait for a 1.5–2.5 s refill timer is tight. It runs at the real hour, so no nests are involved.
- **Client:**
  - unit tests pass 485 of 486; the one red is the colours check on another session's untracked `hud/lamp` files;
  - typecheck is clean;
  - `e2e/godmode-animals.spec.ts` passes on the dev stack as Ana:
    - God mode's Animals tool (J) draws the land's own places (36–73 near the camera) and today's dark nests (about 77);
    - the dark layer toggles off and on;
    - one of the land's own is picked and taken away, and another picked and moved with the panel's Move;
    - the draft is published: the first's animals leave the world, the second's come out where it was moved;
    - then it rolls back, and the spec's own draft is deleted.

**What's left:**
- The land's own rings are thin from a few hundred metres up.
- The range ideas raised on 2026-11-25 are not built: predator dens spaced a territory apart, the existing roam drawn as a faint ring, and a daily routine for the big herds.

### Double-checked (2026-11-25)

Two fresh reviews, one of the server and shared code and one of the client, given the code, not the conclusions. Every finding was checked against the code. Fixed:

- **Far nests' sleepers were never put away.** Once a player left a far nest's block of squares (went indoors, left, teleported), its 1–4 sleepers stayed out all day and counted against the cap. At dusk they woke as night shadowed far from anyone. Now every far square made today is tended, so those round nobody are put away, as the campus's are.
- **Campus caches ignored God mode's clear places.** Survival laid the caches from the unfiltered day list, so a cleared nest's cache stayed searchable and the nests that slid into the out set had none. Survival now filters by the clear places as the dark does, cached per edits object.
- **Far and God mode nests' caches vanished at dusk.** The campus's stay searchable through the night; these now do too, kept until the day turns.
- **God mode's own nests go first under the cap,** before the campus's and the far land's.
- **Group keys and seeds came from the species' place in the list.** Adding or reordering a species would re-key and reshuffle every later species' groups, losing their trust and God mode's changes. Keys are now `l<cx>_<cz>_<species>_<n>`, seeded by the species' name. The land's groups are therefore laid out differently from before this fix. Any dev trust rows for the old keys are orphaned; nothing was committed.
- **A publish re-checked every old change to the land's own** against today's land, so one stale move could hold up every later publish. Only changes this draft makes are checked now.
- **`god:wild`:**
  - at most one ask every 250 ms per admin, and its square caches are bounded;
  - it sends the campus nests that are actually out (the dark's list, clear places out), not the whole day's laid-out list (~52 near the camera, not ~77).
- **Client:**
  - Taking a place away overwrote the hud with an old copy, losing the draft's counts and undo, and the first change's naming dialog never showed.
  - Move, and a species change on one of the land's own, called `canBeAt`, which made land chunks on the main thread. They now check only where the land is made already; the server checks again at publish. A species change is refused where the new species can't stand (a deer on a swimmer's water).
  - One taken away and then undone or redone could still be picked as the land's own, and a Move with nothing picked still said "Moved".
  - The tool never asked the server again once all was told, so after a publish or a new day it showed old places. It now asks every 15 s, and an answer replaces everything in its round.
  - The "near the camera" counts included far places.
  - A dark nest's ghost ring didn't clamp its count to 1–4.
  - Move stayed armed after leaving the tool.
  - `change: undefined` was written into the nests section.

**Not changed (nits):**
- Far nests are spaced 30 m apart only within their own square.
- Far squares are made one a second for everyone together.
- Empty places don't take away God mode's own moved or placed groups, only the land's.
- Offline test rooms still wait for the land worker.
- The count slider stops at 20 while publish allows 30.

**Re-checked:**
- Typechecks are clean: shared, server, client.
- Shared tests pass, 28 of 28, including new checks that keys carry the species' name.
- Server: animals, nests, God mode and the dark pass, 25 of 25; pets pass. Survival's loot test still fails about one run in three; it's the tight-timer flake noted above.
- The God mode e2e passes on the dev stack.
