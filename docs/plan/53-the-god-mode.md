# 53 — God mode: building the open world (plan, 2026-10-29; four decisions made, mocks approved)

> Workflow rule: mocks first (phase 0), approved before any code.
> Mocks: `design/god/01-enter.png` … `14-mobile.png`; source `design/god/mock/god.html`
> (`?s=enter|land|paint|roads|nature|things|buildings|select|inside|overview|draft|publish|history|mobile`), drawn in the
> chosen look (`45-the-ui.md`: ink in walnut frames). Their backgrounds are real stills of the Grounds from
> god mode's camera: `/dev/grounds?shot=god&cam=x,y,z&look=x,y,z` (y over the ground there; `e2e/grounds-shots.mts`).

Ask (2026-10-29): "God mode to build things into the map — Create a tool like Sim city to edit
terrain, roads, items, objects and structures of the open world, ONLY FOR ADMIN. Lets plan."

Decided with the user the same day:

1. **Edits on top of the generated world.** The Grounds stay generated from code; what admins
   change is stored on its own and laid over it. With no edits the world is exactly today's.
2. **Draft, then publish.** An admin's edits are theirs alone until they publish; then everyone gets
   them at once. Every publish is a revision that can be rolled back.
3. **A SimCity camera.** Your body stays where it stood. A free camera flies over the world, and a
   toolbar of tools sits along the bottom.
4. **Structures: prefabs, and enterable.** Place the building kinds we already draw. A placed
   building can also have floors of its own, built inside with today's build mode.

**Only admins.** Every message is refused by the world server unless `Player.admin` is set, and every
API route sits behind `EnsureAdmin`. Hiding the UI is not the protection (`admin-powers-admin-only`).
Everyone else only ever sees what has been published.

## Where we are

The outdoor world (the Grounds, `packages/shared/src/grounds.ts`) is **all code**. "Nothing of it
is stored or sent, only GROUNDS_VERSION." The server, the 3D view, both physics worlds and the GPS
all call the same functions, so they agree by construction.

| Part | How it's made today | Can it change while running? |
|---|---|---|
| **Height** | Procedural noise (`macro` + `micro`), flattened toward `FLATS`. `terrainAt` then carves the pond, river and ravine, levels the land to each road's height, and makes pads for every building, `SITE`, `PLAZA` and `KART_APRON`. `heightAt` samples the 32 m chunk caches (2 samples a metre). | No. Chunks are cached forever. |
| **Surface** | `groundSurfaceAt`, in order: building plot → kart → road kind → `LOT`/`PLAZA`/`MOTORS` → water (ice) → steep (rock) → woods (deep) → snow. Cached per tile. | No. |
| **Roads** | `WAYS`: hard-coded control points, smoothed Catmull-Rom, one sample a tile. Their heights, `bridged` flags and the spatial index (`cells`) are worked out **once at module load**. The GPS and the people's routes read them (`route.ts`). So does the shuttle (`SHUTTLE`, built from the driveway, the road and Main St). | No. |
| **Trees** | `treesIn`: jittered 3.2 m cells, seeded by the cell, gated by `treeDensity`. The woods' floor cover (`woods3d.ts coverIn`) is client-only and has no physics. | No. |
| **Props** | `LAMPS` (spaced along roads, plus a few placed by hand), `STREET`, `SNOW_POLES`: derived at load. `FENCE`, `TOWER`, `STATUE`, `BENCH`, `TOWN_CARS`, `PUMPS` and the park's stands, tower and shed: hard-coded. | No. |
| **Buildings** | `BUILDINGS`: axis-aligned rectangles with a kind, floors, a door side, `enter`/`stored`/`built`. Each kind has its own hand-written mesh builder (`grounds3d.ts`). The insides of the bar, diner, market, gatehouse, barn and farmhouse are generated (`INSIDES`). Only the HQ (and the east and south blocks' ground floor) has a stored `MapDef`, edited in build mode. | No. |
| **Physics** | `groundSolidsIn(cx, cz)` (fixed solids bucketed per chunk once, plus one cylinder a tree). `WorldBuilder.groundChunk` makes a `land:cx,cz` heightfield and a `grounds:cx,cz` compound, on the server (`features/physics.ts`) and in the browser (`tp/physics3d.ts`). | The server can rebuild a chunk again (`again=true`). The client only builds what it hasn't. |
| **Drawing** | `grounds-stream.ts`: a quadtree of 128/64/32 blocks out to 440 m, 6 ms a frame. **Once built, a block is never rebuilt.** Lamps, fence and landmarks are built once, merged. | No. |
| **The map** | `grounds-plan.ts drawSitePlan` (in a worker). It is one raster of the whole world, and the GPS caches it for the session (`plan ??=`). | No. |

**The precedent for a live change** is the track changer (`setParkLayout`, plan 47). It bumps
`layoutVersion`, drops the chunks and surfaces overlapping the park, and lets them rebuild. The
server's land worker and physics re-queue those chunks, and clients follow `park.layout` in the
room's state. It never changes height, and the 3D side got away with drawing the circuit as its
own meshes instead of rebuilding the land. God mode can't dodge that: **every derived thing above
has to become rebuildable for a region.** That refactor is most of the risk, and it comes first.

What's stored today, on the API's `World`: the indoor layout, the objects, playlists, loot and the
kart record (`WorldSnapshot` exports them). Everyone has the `builder` role, so indoor build mode is
anyone's. God mode is not.

## What we're making

### Getting in

- **God mode** is a new item on the admin panel's rail ("Run the place"), and a key for admins.
  The key is chosen at the mocks, from the keys that are still free.
- Going in: your body stays where it is, held still and marked "building" to others, like being
  busy. The camera rises out of your head to about 80 m over you. The HUD goes, apart from the
  top bar's place name. The god mode HUD comes in.
- Going out (Esc, or the key): the camera comes down back into you. If there's a draft, it stays
  saved but not shown ("You have 37 unpublished changes").

### The camera

- Pan with WASD, the arrows, dragging, or the screen's edges. Zoom with the wheel or a pinch, from
  4 m to 600 m over the ground. Turn with Q / E or a right-drag. Tilt with a middle-drag or
  Shift+wheel, from straight down to nearly level at street height.
- It never goes under the land or outside `GROUNDS`.
- The overview (M) opens the site plan full-screen; clicking it flies the camera there. On it: the
  published world, the draft's changes outlined, and every person in.
- It's the 3D view's own camera, with streaming centred on the camera instead of on me.
  `grounds-stream`, physics and the people's culling follow the camera's ground point. Zoomed far
  out, the 128-tile tier and fog do the work. A Lowest-tier machine is never an admin's tool, but
  it must not break.

### The toolbar (bottom; on a phone, two rows of chips)

| Tool | What you do | Notes |
|---|---|---|
| **Land** | Raise, lower, smooth, flatten (to the height clicked first), ramp (drag from a height to a height), noise (roughen). The brush's size is 2–64 m and its strength 1–100. Hold to keep going. | The brush shows as a ring on the ground. Shift inverts. |
| **Paint** | Paint a surface: snow, deep snow, path, asphalt, walk, ice, rock, or *as generated*. | Speed on foot follows (`speedOn`). Cars follow the asphalt. |
| **Roads** | Draw a way by clicking points: kind (road, street, driveway, trail, walk), width, pavements, lamps on/off. Drag an existing way's points, insert a point on a way, delete a way. | An end dropped on another way joins it: same height, a junction drawn. Over water or the ravine it becomes a bridge, as today's `bridged`. The land levels to it as the generator does now. |
| **Nature** | The forest brush: plant (a species, or a mix, and how thick) or clear. One tree or one rock: place, move, remove. | Works on the 3.2 m tree cells, so the woods' floor cover follows. |
| **Things** | Outdoor props from a catalog: lamps, benches, bins, hydrants, newsboxes, signs (with text), snow poles, fences (drawn as a line), boulders, statues, a bus shelter. Each sits on the ground, turns freely, and some scale (0.5–2). | A generated thing (a road's lamp, a hard-coded bench) can be moved or removed too. |
| **Buildings** | Place a prefab: house, shop, bar, diner, barn, farmhouse, church, silo, shed, gas station, hotel, boathouse. Size within the kind's limits, floors, its door's side, tint, the sign's words. Turned in quarters (the walls stay on tile edges). | Its pad levels the land as today. *Enterable* gives it the kind's generated inside, or floors of its own (see "Insides"). |
| **Select** | Click anything placed, generated or edited. Move it, turn it, delete it, or open its properties. Box-select and move a group. | Anchored things show a pin and say why (see "What can't be edited"). |

Always on screen:

- **Undo / redo** (Ctrl+Z / Ctrl+Shift+Z): the draft's history, 200 steps.
- **The draft strip**: "37 changes · saved". *Walk it*, *Discard*, *Publish…*.
- **A grid snap** toggle (1 m / 4 m / off) and a height readout under the pointer.
- **The ghost**: green where it fits and red where it doesn't, with the reason ("on the road",
  "too steep for a building", "inside the Kart Park").

### Draft, walk it, publish

- **The draft** is saved on the server as you go, a few seconds after a change, so a reload keeps it.
  One draft per admin. Another admin's draft isn't shown. When two admins publish in turn, the
  second is rebased on the first and told about any overlap ("Ana's publish moved Main Street; your
  lamp on it was kept where it was").
- **Seen only by you.** Your client lays the draft over the published world: drawing, physics, GPS.
  Nobody else's does. The server's world stays published.
- **Walk it**: drops your body at the camera's ground point, in the draft, to try it on foot or by
  car. Esc goes back up. The server takes moves as sent (`no-anticheat-for-now`), so walking a draft
  needs nothing from it. Others see you walking on what is, to them, the old ground. That's
  expected, and noted on the strip.
- **Publish…** asks for a one-line note ("Pond path and two benches"), then shows what changes:
  counts per kind and the area on a little map.
  - The server checks the whole draft against the shared rules.
  - It stores the result as revision *n+1*, broadcasts it, and logs it (`publish`).
  - Everyone's world rebuilds the touched regions over the next few frames.
- **Safe landing**: anyone standing where the land rose, or inside something new, is lifted to the
  surface or nudged clear of it. A car is set down on the new ground. A pet too. Then a short toast
  for those near it: "The ground shifts here."
- **History** (a page on the admin panel): every revision with who, when and the note, and its area
  on a map. *Roll back to here* is itself a new revision, so nothing is lost. *Compare* shows a
  revision's changes on the map.

### Insides

A placed building marked enterable gets one of two kinds of inside:

- **Generated**, as the bar, diner and market are today (`INSIDES`): the kind's furniture laid out
  for its size. Nothing more to edit.
- **Its own floors**: a stored map per building, made with **today's build mode**. You walk in and
  build (paint floors, walls, rooms, furniture, doors), the same tools the HQ uses, one floor per
  storey. This means generalising "one stored layout per world" into **a layout per building** (a
  *space*). See "The design" § E. Editing an inside is live, as build mode is now, but only an
  admin can edit a placed building's inside, until it's handed over (open question 3).

### What can't be edited (anchored)

These are what other features hang on. They show a pin in god mode and say what depends on them.
The land under them is locked too.

- **The HQ and its blocks** (east, south), **the parking lot**, **the gatehouse**, **the company's
  fence and gate**.
- **The Kart Park**: its fence, road, paddock and bowl (plan 47 owns the track).
- **The shuttle's ways**: the driveway, the county road and Main St, as far as its stops. They can be
  widened or get lamps, but not be moved or removed (`SHUTTLE` is built from them).
- **Buildings a feature reads by key**: `gas`, `motors` (the dealer), `hall` and `hotel`
  (`car/homes.ts`), the bus shelter. Phase 1 makes this list by search, not memory, and the
  editor reads it from one table (`ANCHORED`).
- **The world's edge** (`worldRects`). Past it is scenery. The ridges are not editable.

Anything not on the list is fair game, including town buildings, trails and the woods.

## The design

### A. The edits, as data (`packages/shared/src/grounds-edits.ts`)

```ts
interface GroundsEdits {
  rev: number;                                    // the revision these are (0: none)
  height: Record<ChunkKey, string>;               // per 32 m chunk: 65×65 Int16 deltas in cm, deflated, base64
  paint:  Record<ChunkKey, string>;               // per chunk: 32×32 bytes, 0 = as generated, else a surface
  trees:  Record<ChunkKey, string>;               // per chunk: one byte a 3.2 m cell: as generated / cleared / a species
  ways:   { add: WayDef[]; change: Record<WayKey, Partial<WayDef>>; remove: WayKey[] };
  things: { add: ThingDef[]; change: Record<ThingKey, Partial<ThingDef>>; remove: ThingKey[] };
  buildings: { add: BuildingDef[]; change: Record<BuildingKey, Partial<BuildingDef>>; remove: BuildingKey[] };
}
```

- **Stable keys for everything generated**, as the first thing phase 1 does. A way already has one.
  Every hard-coded thing gets one (`bench:clearing`). A road's lamp is keyed by its way and its
  place along it (`lamp:main:12`), so moving a road moves its lamps and removing one is remembered.
  A tree is its cell (`t:i,j`).
- **Height** deltas are sparse: only the chunks touched. A full chunk is 8.4 KB raw (11.3 KB as
  base64). The grids are plain base64 in the blob, and the blob is gzipped on the wire by the API, so
  `applyEdits` stays synchronous with no inflate of its own. **Cap**: the whole blob at 8 MB as
  stored; the publish is refused past it.
- **Order of laying over** (the generator becomes a pipeline):
  1. base noise
  2. ways (added, changed, removed), then their levelling and `bridged`
  3. buildings' pads
  4. the height deltas
  5. the surface paint
  6. the tree mask
  7. things

  So a hand-sculpted bump on a road wins over the road's levelling, and a road drawn after
  sculpting levels the land again. That's what you'd expect from a brush.
- **Validation is one shared function**, `checkEdits(edits) → problems[]`. It checks bounds,
  anchored areas, building sizes and slopes, things on roads, counts (things ≤ 20,000, ways ≤ 400,
  buildings ≤ 300) and the blob's size. The client runs it for the ghost and the server for authority.

### B. The Grounds made rebuildable (the refactor)

What's worked out once at module load today becomes the result of `applyEdits(edits)`. It returns
the **dirty regions** (chunk rectangles) between the old revision and the new:

- `WAYS` (lines, heights, `bridged`), `cells` and `bCells`, `LAMPS`, `STREET`, `SNOW_POLES`,
  `BUILDINGS`, `INSIDES`, `FIT_TILES` and `WALL_EDGES`, the fixed solids' buckets, and the
  `route.ts` graph (its `routeOver` already resets).
- The chunk caches (`chunks`, `surfaces`) drop the dirty chunks, and `layoutVersion` is bumped as
  `setParkLayout` does. The park's own changes go through the same door.
- **The proof**: with no edits, every chunk's heights, walk mask, surfaces, solids and the site plan
  hash the same as today's. A test, run in CI, beside the physics bench's hashes.
- **The budget**: `applyEdits` lives in the shared Grounds, the lazy `yutopia-grounds` chunk
  (budget 187 KB), not on `/page`. The god mode tools are a lazy chunk of their own.

### C. Rebuilding what's drawn and what's solid

- **`grounds-stream`**: `invalidate(regions)` marks the blocks overlapping a region as stale. They
  rebuild under the same 6 ms a frame, the old block shown until the new one is ready, then swapped.
  The instanced pools (trees, cover) refill for those blocks.
- **The merged statics** (lamps, fence, landmarks, buildings, roads' ribbons and dressing) are
  bucketed by chunk instead of merged world-wide, so a region rebuilds alone. Check the frame cost
  of more, smaller draws on Low (`lag-round1`). Buckets of 128 m, not 32, if the draw calls bite.
- **Physics, both sides**: drop and rebuild `land:` and `grounds:` for dirty chunks. The client's
  `physics3d.ts` learns `layoutVersion` (today it only builds what it hasn't, so a track change may
  leave old bridge solids in the browser: check and fix that in phase 2). One owner of every Jolt
  object, sizes checked before every add (plan 50's guardrails).
- **The site plan**: repaint only the dirty regions in the worker. The GPS's cached plan is keyed by
  the revision.
- **Buildings** of a placed kind are built by the kind's existing mesh builder, given the new
  rectangle. Phase 7 checks each builder takes any size within its limits; some have numbers fitted
  to their one building.

### D. The server

- `features/godmode.ts`. Messages: `god:enter`, `god:leave`, `god:draft` (the draft's patch, saved
  through the API), `god:publish {note}`, `god:rollback {rev}`. All are refused without
  `Player.admin`.
- **On start**: the published edits come with the world (`WorldInfo.edits`, `api.world()`, and
  `YUTOPIA_WORLD_FILE` offline). They're applied before the land worker and physics build a chunk.
- **On publish**: check, store (API), `applyEdits`, tell the land worker (`landEdits`, as
  `landLayout`), re-queue the dirty chunks in physics, run the safe landing, then set
  `state.groundsRev = n`.
- **Clients**: a changed `groundsRev` → fetch `/api/world/edits?rev=n` (from the API's cache, so the
  blob never rides the room's state) → `applyEdits` → rebuild. A joining client fetches the current
  one before the world shows (`35-the-loading.md`: one more step).
- **The log**: new `LOG_KINDS` `publish`, `rollback`, `god` (enter and leave).

### E. Spaces: an inside per building

The biggest unknown. Phase 8 starts with a day's investigation, and if it's bigger than this, it
becomes its own plan (54). The shape of it:

- Today: one `Layout` per world (the HQ's, with `levels`), objects in that map's tiles with a `level`.
  The ground floor's stored rectangle has its offset (`GROUND_OFFSET`). Generated insides are
  separate code (`INSIDES`).
- To have: a `space` per enterable placed building. Its `Layout` has its own levels, kept in a
  `spaces` table (building key → layout). Objects get a `space` beside their `level`, so the HQ's are
  space `hq` and nothing of theirs moves.
- Every place that reads "the map" (`Grid.from`, `canPlace`, map-edit, physics' indoor bodies,
  lights, the minimap, hearing's private rooms, the floor from your height) takes the space you're
  in. Placed buildings are small and few, so their spaces load with the world.
- Build mode opens inside a space as it does in the HQ, for admins (open question 3).

### F. Mocks (phase 0)

Drawn in the look. Each is a state of `god.html`:

- **enter**: the camera rising, the toolbar, the strip
- **land**: the brush ring, the height readout
- **paint**
- **roads**: drawing, a junction, a bridge's ghost
- **nature**: the forest brush
- **things**: the catalog
- **buildings**: a prefab's ghost and its properties, the anchored pin
- **inside**: building inside a placed house
- **draft**: walk it
- **publish**: the summary and its map
- **history**: on the admin panel
- **mobile**: the chips, two-finger pan

## Phases

0. **Mocks** (F): approved before any code. *Approved by the user 2026-10-29* ("Approved").
1. **Keys and anchors**. A stable key for every generated thing, and the `ANCHORED` table (found by
   searching every feature for buildings and ways it reads by key or place). No behaviour changes. *Built
   2026-10-29*, in shared `grounds.ts` (its own data, so no new module for the client's chunks to copy):
   - **Keys**: a way's and a building's own (`way:main`, `building:bakery`); every lamp keyed by its way
     and its place along it (`lamp:main:6l`) or by name (`lamp:gate`, `lamp:kart-flood:3`); street
     furniture by place (`street:main-s:322`, `street:statue-bench:w`), snow poles
     (`snowpole:road:33l`), a tree by its cell (`treeKey`: `tree:i,j`, one tree a cell), the rest by
     name (`landmark:statue`, `scarecrow:0`, `town-car:4`, `tractor`, `water:pond`, `park:kart`).
     `groundsThings()` lists them all (bar the trees, per chunk).
   - **`ANCHORED`** (key → why), found by search: the HQ and its blocks, the gatehouse (its locker, the
     guard), the gas station (its pumps), Motors (the dealer), the hall and the hotel (car homes), the
     driveway, the county road and Main Street (the shuttle and the visitors), the Kart Park and its
     road, the company's fence, the tractor and the town cars (driven, with homes), and the water (for
     now). **`ANCHORED_AREAS`** and `anchoredAt(x, z)`: the campus (`SITE`), the park's ground, each
     anchored building's plot and 2 m round it, Motors' yard, past the world's edge.
   - Read **by place only**, so they follow in phase 2 rather than being anchored: the GPS's places
     (`route.ts`: the square, the pond, the tower, the statue, the gate, the farm), the dark's nests
     (the tower, the clearing's bench, the pond, the scarecrows, the tractor) and its loot (by each
     building's key and kind: a building taken away takes its loot spot with it).
   - Checked: `grounds-keys.test.ts` (keys unique, every lamp and thing keyed, anchored keys are real,
     what features read by key anchored, the areas); shared 389/389, the client's unit tests and the
     world server's dark/down tests green; types and lint clean. The Grounds chunk's budget (187) not
     measured (it wants a production build).
2. **The Grounds made rebuildable** (B). `applyEdits`, dirty regions, everything derived at load
   moved into it, and the park through the same door. The no-edits proof (hashes equal to today's).
   A hand-written edits file (a hill, a road, a house) applied in a world-server test. *Built
   2026-10-29*:
   - **The edits** (`shared/grounds-edits.ts`): the type, `NO_EDITS`, `TREE_MASK`, the grids'
     base64 codecs. No run-time imports, so a chunk can take it without a copy of the Grounds.
   - **The Grounds as steps** (`grounds.ts`): the generator's ways and buildings are now
     `BASE_WAYS` / `BASE_BUILDINGS`, and `WAYS`, `BUILDINGS`, `LAMPS`, `STREET`, `SNOW_POLES`,
     `INSIDES` are them as edited (the same arrays, refilled in place, so every importer keeps its
     reference). Each load-time block is a step run at load and again by `applyEdits`:
     `layWays`, `layBuildings`, `layIndex` (the river's and ravine's line numbers now follow the
     ways' count), `layLevels` (heights, bridges), `layLamps` (a new way with `lamps` gets them: a
     street's both sides every 22, a road's one side every 30), `layStreet`, `laySnowPoles`,
     `layThings` (generated lamps, street things and snow poles moved or taken away by key; lamps
     and street things put down), `layDecks`, `layInsides` (`insideOf` by the building's key now).
   - **The grids**: the land's lift added in `terrainAt` (bilinear, as the chunks sample), the paint
     in `groundSurfaceAt` (after a building's plot, before everything else), the tree mask in
     `treesIn` (a cleared cell has none; a planted one always has its tree, where and how big the
     generator's own would be, in the species asked). A chunk is exactly 10 × 10 tree cells. Each
     cell's byte is kept in the grid of the chunk its tenth is (`floor(i / 10)`), because the
     generator's loop puts a cell on a chunk edge in either chunk as the floats fall.
   - **`applyEdits(edits) → chunks`**: re-runs the steps and compares every thing's look before
     and after. A way that changed dirties its line and 30 m round it, a building its plot and
     12 m, a lamp or street thing 3 m, a grid its chunk and those round it. It drops only those
     chunks and their surfaces, bumps `layoutVersion` (a worker's chunk made before isn't taken) and
     the new `editsVersion`. What's kept from the Grounds once now follows `editsVersion`: the
     solids' buckets (`shapes/grounds.ts`), the GPS's graph and places (`route.ts`), the lamps'
     light pools (`light.ts`). `forgetGrounds()` drops every chunk.
   - **The park through the same door**: `setParkLayout` drops its chunks with the same helpers
     (`chunksOver`, `drop`).
   - **The server**: `land.ts landEdits` lays the edits here and in the land worker (which also gets
     them when it starts), and tells `onLandChanged` listeners the chunks. The physics feature
     queues those chunks to be built again.
   - **The proof** (`grounds-hash.ts`, `grounds-edits.test.ts`): a fingerprint of every chunk's
     heights, walking and wall edges, trees, surfaces (as walking reads them, cached) and solids, and
     every way, lamp, street thing, pole, building and inside. With no edits it equals today's
     (`TODAY` in the test, recorded before the refactor), and it stayed equal after every step of
     it. Laid, each kind of edit does what it says (a 4 m hill, a path painted, a chunk's woods
     cleared but one birch, a road with lamps, a trail gone, a house with an inside, the bookshop
     gone, a lamp gone and its tile walked, the stop sign moved, a lamp put down). The chunks it
     reports are all that changed: what's cached matches what's made from nothing. One lamp dirties
     1–4 chunks, and taken off again it's today's world. On the world server
     (`grounds-edits.test.ts`): the worker's chunks carry the hill, the listeners are told, the
     physics world stands on the hill and walks into the house's wall, and taken off it's flat again.
   - Still made once and **not yet following edits** (for phase 3, as the server lays them for real):
     the dark's `LOOT` spots and the gatehouse `LOCKER` (`dark/loot.ts`), the nests (`dark/nests.ts`,
     by place), `HOME_CARS` (`car/homes.ts`), and on the client everything drawn (phase 4). Edits
     can't yet move or remove the hand-placed singles (the tower, the statue, the clearing's bench,
     the scarecrows: they're read directly by `walkable` and the solids). That's for phase 8.
3. **Storage and the server** (D): API tables `ground_revisions` (rev, data, note, by, at) and
   `ground_drafts` (one per admin), `EnsureAdmin` routes, `WorldSnapshot` exports them. Then
   `features/godmode.ts`, publish, rollback, the safe landing, the log. Clients fetch and apply.
   e2e: two browsers, publish seen by the second, a member refused. *Built 2026-10-29*:
   - **The API** (`GroundsController`, migration `create_ground_edits`): `ground_revisions` (rev
     unique, the whole set as JSON, size, note, who, `rollback_of`) and `ground_drafts` (one per
     admin, the revision it was made on). Everyone in: `GET /api/world/edits` (the newest, with an
     ETag by revision). Admins: `GET/PUT/DELETE /api/admin/grounds/draft`,
     `GET /api/admin/grounds/revisions[/{rev}]`. The world server: `GET /internal/grounds/draft/{id}`,
     `GET /internal/grounds/revisions/{rev}`, `POST /internal/grounds/revisions` (an admin's only,
     made on what's live or 409, the newest row locked; the draft dropped once published).
     `/internal/world` carries `edits`. A world snapshot keeps them (`grounds`) and puts them back
     as a revision of its own (a snapshot without them leaves them as they are). At most 6 MB.
     The log takes `publish`, `rollback`, `god`.
   - **The draft goes to the API from the admin's client**, not through the room (§ D said
     `god:draft`): the room's messages are capped at 4 KB, and one chunk's heights are 11 KB.
   - **The rule book** (shared `grounds.ts checkEdits`): grids on chunks of the Grounds, the right
     size, in bounds (lift ±30 m), nothing on anchored ground. Anchored things not taken away or
     moved (the shuttle's ways may only change `w`, `pave`, `lamps`). New keys are god mode's own
     (`god-…`, so never one the generator makes) and each used once. Ways: 2–16 m wide, 2–64 points,
     not through anchored ground. Buildings: a kind from `PREFABS` with its size and floor limits,
     whole-metre corners, not on another building's plot. Things: a lamp or street kind. Counts:
     400 ways, 300 buildings, 20,000 things.
   - **The world server** (`features/godmode.ts`): `god:publish {note}` takes the admin's draft from
     the API. It's refused (`god:refused {reason, problems}`, and a toast) if it wasn't made on
     what's live, or if the rule book finds anything. Otherwise it's kept as the next revision, laid
     (`land.ts landEdits`), and the room's `groundsRev` moves. `god:rollback {rev}` publishes that
     revision's set as a new one (0: none). One at a time. Anyone standing on the land where it now
     rises is lifted onto it (a snap) and told "The ground shifts here."; a car nobody's driving is
     set down on it (`cars.ts`). The room lays the published edits before anything's made of the
     land when it starts. Offline (the tests, a world file) it keeps the revisions and the drafts
     itself (`offlineDrafts`) and sends the edits to whoever joins (`god:edits`).
   - **Clients** (`grounds-load.ts`): the room's `groundsRev` followed, the edits fetched from the
     API and laid on the Grounds before anyone has the module, and again on every change
     (`onEditsLaid` for phase 4's redraw).
   - **What followed edits**: the dark's loot spots (`lootNow()`: a house put down has one, one
     taken away takes it). The gatehouse's locker and the car homes needn't, because they hang on
     anchored things. The nests are made fresh each day.
   - **Not here yet**: bringing a stale draft up to date (a publish on an older revision is refused
     with what's live; the merge is phase 5's), `god:enter/leave` (phase 5), a moved building
     nudging people out of it (only the land's lift sets them down).
   - Checked: API `GroundsTest` (4 tests, 49 assertions; the whole API suite 89 green); shared
     `grounds-rules.test.ts`; world server `godmode.test.ts` (a member's publish and roll back
     dropped; a draft taking away the county road refused with why, one on an old revision too;
     a publish raising the farm's field 3 m lifts the admin standing there onto it and tells them;
     a late joiner gets the edits; rolled back to none, revision 2); e2e `godmode.spec.ts` on the dev
     stack (Bia's draft 403 and her publish dropped; Ana's path in the woods laid in Bia's game; rolled
     back, gone; Ana joins first and Bia waits polling on a timer, because a page behind another
     browser's gets no frames). It leaves two revisions in the dev world's history each run (a
     publish and its roll back), and no edits.
   - Postgres won't `FOR UPDATE` an aggregate: the publish locks the newest row instead (SQLite's
     tests didn't see it; the dev stack's e2e did).
4. **Rebuilding on the client** (C): `grounds-stream.invalidate`, statics bucketed by chunk,
   physics3d by `layoutVersion`, the site plan by region. A perf check: a publish of a full 64 m
   brush stroke costs no frame over 25 ms on the Low tier. *Built 2026-10-29*:
   - **Told what changed** (shared `grounds.ts onGroundsChanged`): `applyEdits` and the park's
     `setParkLayout` say which chunks, and why (`"edits"`, `"park"`).
   - **The land** (`grounds-stream.ts invalidate`): the blocks over the chunks that changed are
     made again, nearest first under the same budget, the old one shown till the new is. On every
     tier (a far block's heights are `terrainAt`'s, the lift in them).
   - **The rest, not bucketed** (§ C said by chunk): its steps feed what the lamps' step gathers at
     the end (pools, glow cards, lamp posts, the night's list: ~80 places), so a part can't be made
     alone without that untangled. Instead the rest is made again whole, behind what's shown
     (hidden till it's all there), and swapped in. Three things keep it short:
     - only when something it draws changed: the ways, buildings and things as listed, or the land
       moved under a way, a building, a lamp, a street thing or a snow pole (each sampled on the
       lift grids). A hill in the woods makes none of it again.
     - **the Kart Park is a part of its own** (`GroundsOpts.part`), made once: it's anchored, and
       its karts were 232 ms in one step.
     - **a way that didn't change is taken from the one shown** at the swap (`Grounds3.adopt`), not
       made again: same index (its banks' random), same line, heights and width, and no changed way
       within 30 m (its banks, crossings and corners see the others'), nor the land moved under it.
       Its step adds only its own meshes and its own asphalt (made its own material for that). The
       pictures and the materials of the shared pictures are one lot for every part
       (`groundsShared`), so a remake doesn't paint them again, and the one going doesn't free them.
       What was the last way's step's (the square's crossing, the snow poles, the bridges) is a step
       of its own (`waysAll`).
     - the old one hidden at the swap and freed 20 frames on; a mesh's bounds worked out as it's
       made; no remake step in a frame that made a chunk of land.
   - **The browser's physics** (`physics3d.ts`): a chunk that changed is made again once its land
     is, round you (the park's layout too, so its bridge's solids no longer stay behind).
   - **My feet** (`controller.ts ontoLand`): for 6 s after the land changes, never under the land
     where I stand: onto it, as the server's snap does. Without it, the e2e found Ana fallen through
     the hill: lifted by the server, her ground then made again 3 m above her.
   - **The GPS** (`gps.tsx`, `grounds-plan.worker.ts`): its plan drawn again a revision, the worker
     handed the edits (its Grounds are its own); the old one shown till the new is. Whole, not by
     region (it's in the worker: off the frame). Its places already followed (`route.ts`).
   - **What follows by itself**: the camera's roofs (`boxes`, filled again in place), the lamps' light
     (shared `LAMPS`, laid in place), the roads' crossings cache (`roads3d.ts`, by `editsVersion`).
   - Checked: shared `grounds-edits.test.ts` (who's told, which chunks, why; not once unsubscribed);
     e2e `godmode-redraw.spec.ts` on the dev stack, on Low and the machine's GPU: a hill 64 m across
     (nine chunks) under Ana is drawn and stood on in ~0.5–1 s, nothing else made again, no frame
     over 17 ms, her feet on it and back down after the roll back; a road by her: the rest made
     again and swapped in ~1 s, worst frame 33 ms (one missed), under the 50 ms the land's own
     streaming has (`grounds.spec`). Then `godmode.spec`, `kart-park.spec`, `kart-layout.spec`.
   - **Still long**: a way's step is one step, 9–24 ms for these (a long road's was 72), and the
     lamps' step is ~24 ms. A road tool drawing as you drag (phase 7) wants a way made in parts, and
     the lamps gathered by region.
5. **The god camera and the shell**: enter and leave, the camera, streaming from the camera, the
   toolbar, draft (saved, undo, discard), walk it, publish, history. The admin panel's page.
   *Built 2026-10-29*:
   - **In and out**: O (open question 1: the mocks' key, approved with them), the panel's new page
     *God mode*, or Esc / O / 0 to leave. The world server's `god:enter`, `god:walk {on}`,
     `god:leave` (admins only; logged as `god`, in and out, and out on leaving the room) mark the
     body `busy = "god"`: others see its tag "Ana · building". The client holds the body still (the
     server takes moves as sent: `no-anticheat-for-now`). Not from a car.
   - **The camera** (`world/god/controller.ts`): a ground point, a height over it (4–600 m), a turn
     and a tilt. WASD / arrows / the screen's edges pan (faster with Shift and with height), Q / E
     turn, R / F tilt, + / − and the wheel zoom, Shift+wheel tilts; dragging pans, the right button
     turns and tilts, the middle tilts; on a phone one finger pans, two pan, pinch and twist. Never
     under the land, never past `GROUNDS`. It's the view's game camera (`gameCam`, snapped), so it
     eases out of my head and back into it. The view follows its ground point
     (`ThirdPersonView.god`): the land, the lamps and the sun stream round it, the fog and the lens
     reach as far again as the camera is off, walls don't fade and the trees in the way don't
     either (`GroundsStream.fadeOff`), the view's own pointer and wheel go to god mode. The
     pointer's readout marches the analytic `terrainAt` (`landUnder`): far off, no chunk's made.
   - **The HUD** (`components/hud/god/GodHud.tsx`, its own chunk): as the mocks 01, 11, 12 and 14,
     the usual HUD gone (the dark's too). The tools' bar has the seven tools (Select works; the rest
     say they come next), undo, redo, leave. The snap is kept for the tools. The overview (M) and
     *Compare* aren't here yet.
   - **The draft**: fetched from the API going in, or what's published if there's none; laid over
     the generated Grounds for me alone (`grounds-load.ts layDraft`: what's published since is handed
     to god mode, not laid). A change (`GodController.change`: the tools', and the e2e's) is a
     step of a 200-step history (Ctrl+Z, Ctrl+Shift+Z), laid at once (phase 4's redraw), saved 2.5 s
     after the last (a failed save retries every 10 s); none left, the API's draft is deleted.
     *Discard* is a step too (undone, it's back). Its count is shared `grounds-draft.ts
     editsCount` against what it's made on.
   - **Brought up to date** (shared `mergeEdits`): a three-way merge on what the draft was made on,
     the draft, and what's live: each chunk's grid and each keyed way, thing and building from the
     side that changed it; where both did, the draft's, and a toast says what ("the paint in 1
     chunk"). On going in, and whenever a revision's published while I'm in.
   - **Walk it** teleports me where the camera looks (the ground floor), `god:walk` clears the mark,
     the HUD is the walking one (the top bar and the dark's), the strip on top says so with *Back up
     (Esc)*, and a note that others see me on the published ground.
   - **Publish…**: the note, the counts, the rule book's problems (the shared `checkEdits`, the
     server's own), the size, how many stand where the height changes, a small map with the chunks
     that change. The draft is saved first, then `god:publish`. Refused: the dialog says why.
     Published: what's live is the draft, the history cleared.
   - **The panel's page** (`admin/God.tsx`): my draft's count, the way in, every revision (who,
     when, the note, a roll back's source, *live*), *Roll back to here* and *to none*. The log names
     the new kinds.
   - Checked: shared `grounds-draft.test.ts` (the counts; the merge, an overlap kept and said);
     world server `godmode.test.ts` (a member can't go in; an admin's mark, walking, out); e2e
     `godmode-shell.spec.ts` on the dev stack, Low, the machine's GPU: in with O (the mark, the
     camera 60 m+ up), panned, turned, zoomed past 300 m, the body still, the pointer's readout; a
     painted tile counted, saved to the API, laid, undone and done again; walked (where the camera
     looked) and back up; published from the dialog; rolled back from the page; out with O, the
     camera back down. Worst frames 17 ms panning at 80 m and 17–33 ms out at 300 m+. Then the other
     god mode specs again.
   - **Not here yet**: the overview map (M), *Compare*, the floors above mine from the camera (on an
     upper floor of the HQ, the ones over it aren't drawn: the office shows open from above), a
     pet set down when the land moves, nudging people out of a placed building.
6. **Land and paint**: the brushes, flatten, ramp, the readout. Slope checks for what stands there.
   *Built 2026-10-29*:
   - **The brushes** (shared `grounds-brush.ts`): a stroke changes the draft's grids round the
     brush, weight 1 in the middle to 0 at its edge (a cosine). The land: raise and lower (up to
     4 m a second at full strength, while held), smooth (to the mean a metre round), flatten (to
     the height first pressed), ramp (from where it was pressed to where it is now, as wide as the
     brush, made again from the stroke's start as it's dragged), roughen (bumps). Shift inverts
     raise, lower and roughen. Size 2–64 m, strength 1–100. Paint: snow, deep, path, asphalt, walk,
     ice, rock or as made, 1–32 m, dabbed all along the drag.
   - **What it never does**: a sample on anchored ground (the rule book's own test, a quarter
     metre in, sample by sample) or past the edge; past ±30 m. Every chunk edge is kept in both
     chunks it bounds (a corner in four), so the land has no seam. A stroke's lift is kept in
     fractions of a centimetre while it goes: rounding each frame's bit made terraces 90 cm high
     near the edge (the e2e's still showed them; a test now looks for steps).
   - **The land as generated** (levelled to its roads and buildings: a stroke goes on top) comes
     from the chunks made, less the lift laid in them. Nothing's worked out again.
   - **In god mode** (`world/god/controller.ts`): the left button (one finger) presses a brush, held
     to keep going. A stroke is one step to undo, laid every 300 ms as it goes and when it ends.
     Each lay makes its chunks again, so not every frame. The ring on the land at the brush's size
     (`god/ring.ts`), a dashed ring at half, a dot. The row over the tools has the modes or
     swatches, size and strength (`[` `]` too), and the warning. The pointer's readout says what was
     published where the draft changed it ("Snow · was 2.3", "Path · was As made").
   - **What stands on it** (`slopeIssues`, warnings not refusals): a building's plot more than 0.6 m
     out of level, a way made more than 14% steeper where the land moves. In the tools' row, and in
     the publish dialog with a "!".
   - **What follows by itself**: on foot, speed (`speedOn`) and footing are the painted surface's.
     The land's colour is per vertex, so a painted path is soft-edged from above.
   - Checked: shared `grounds-brush.test.ts` (raise up 2 m in the middle, nothing past its edge, no
     seam across x 416, by the rule book, back down inverted; flatten to the foot; a ramp half way
     up at its middle; across the campus's edge only the outside lifts; a path painted along a
     long drag and back as made; a house tipped by half a stroke is said, one lifted whole isn't;
     no steps under a brush held 90 frames); e2e `godmode-land.spec.ts` on the dev stack, Low, the
     machine's GPU (the land raised 2.4 m under a brush held 1.5 s, one step, undone; a path painted
     across the field; discarded), worst frame 33 ms while held. Then the other god mode specs.
   - **Not here yet**: the brush's centre doesn't snap, and it drifts toward the camera as the land
     rises under the pointer (the ray meets it sooner).
7. **Roads**: draw, drag, join, bridge, delete, lamps along. The GPS and the people's routes over new
   ways. Town cars and the shuttle keep to theirs. *Built 2026-10-29*:
   - **The generator does most of it**: a way in the draft is smoothed as its own are, the land
     levelled to it, bridged where it crosses the river or the ravine, lit along if `lamps`, and
     joined where an end lies on another way (both at one height there: `layLevels`). The GPS's
     graph is made again with the edits (`route.ts`), so it drives a new road. Town cars and the
     shuttle keep their own routes.
   - **Shared `grounds-roads.ts`**: `addWay`, `changeWay` (a new way's own definition; the
     generator's by its change), `removeWay` (a new one: as if never drawn), `snapEnd` (an end put
     on the line of the way it's dropped near), `wayBlocked` (anchored ground or the edge, the rule
     book's own test), `insertAt`, `wayLength`, the kinds' defaults (a road 7 m and lit, a street
     9 m with pavements, a driveway 5 m, a trail 2.4 m, a walk 2 m). `grounds.ts` exports
     `smoothLine` and `wayAt`. The rule book now also refuses a generator's way moved onto anchored
     ground (only new ones were checked).
   - **The tool** (`world/god/roads.ts`, the ghost `road-ghost.ts`): Draw: a click a point (on the
     snap), a double-click or Enter ends it, Backspace takes one back, Esc lets it go. The first
     and last points go onto a way they're dropped near (a green ring there). The ghost is the line
     as it'll be smoothed, a band as wide, a dot a point, red where it can't go. Edit points: a
     point dragged; a click on the line puts one in; Alt-click takes one out; a click picks the way,
     and the row's kind, width, pavements and lamps then change it (the width when the slider's
     let go). Remove: a click takes a way away. The shuttle's ways may be widened or lit, not moved
     nor taken away (a toast says why). Each is a step to undo. A drag pans as with Select.
   - **The row** (as the mock 04-roads): Draw / Edit points / Remove, the five kinds, width 2–16 m,
     pavements, lamps, and a line: "2 points · 89 m · joins County road".
   - **Walking on land not built yet** (found by these e2e, older than god mode): after a long
     teleport the browser's physics hasn't the land under you yet. The collision checks used the
     grid's heights there, but the body's own step (Jolt) didn't: you fell, and the land built a
     moment later had you under it for good. The step now takes the grid's way too until the land's
     built (`Mover.ready`, shared `move/step.ts`; a test that fails without it). It's the
     intermittent fall seen at the Kart Park in phase 4.
   - Checked: shared `grounds-roads.test.ts` (a road drawn to the county road joined at its height,
     lit along, by the rules, taken by the GPS by car; one over the river bridged, not at its ends;
     a trail moved, another taken away, the county road widened; the shuttle's moved or taken away
     refused; into the campus refused for new and moved ways; a point put in where it's least out of
     the way); `physics/move.test.ts` (standing and walking on land not built); e2e
     `godmode-roads.spec.ts` on the dev stack (drawn by clicks, ended by a double-click on the county
     road: joined at one height, lit; a point dragged 12 m; taken away and back with undo; the county
     road refused; discarded). Then the other god mode specs.
   - **Not here yet**: naming a way (it's "Road 1": the Select tool's properties), a junction's
     own shape (the generator's crossings only), traffic on new roads (open question 5).
8. **Nature and things**: the forest brush and the tree mask, the catalog (shapes from the shapes
   table: `model-bounds` test for each new kind), fences as lines, signs with text. *Built
   2026-10-29*:
   - **The woods** (shared `grounds-brush.ts WoodsStroke`, `oneTree`): the forest brush on the
     3.2 m tree cells. Plant (pine, birch, bare, or a mix: most pines), as thick as asked (each
     cell's own hash, so brushing again changes nothing); clear; as made. One tree: a click puts a
     tree in that cell, or takes the one there out. A planted tree needs room
     (`grounds.ts treeRoom`): not on a way, a building or the water, whatever the woods would do
     there, so a brush over the county road plants beside it. The woods' floor follows by itself.
   - **The things** (shared `grounds-things.ts`): a catalog of 16. The lamps (town, road, path), the
     street furniture there was, and five new kinds:
     - a **snow pole**
     - a **boulder** and a **planter**, sized 0.5–2
     - a **sign** with its words (40 at most, on both faces of its board: their own picture)
     - a **fence** along a line (split rails on posts every 2.5 m)

     Each new kind is in `town3d.ts` (drawn) and `shapes/grounds.ts` (solid). A thing can't stand
     on a way's carriageway, in a building, or on anchored ground ("Not there: on County road").
     The generator's own are moved or taken away by key; what's anchored (the company's fence,
     the tractor) stays.
   - **The rule book**: the new kinds; a size only for a boulder or a planter, words only for a
     sign, a fence's line 2–64 points with runs of 60 m at most and not over anchored ground; a
     generator's thing not moved onto anchored ground. The edits' signature of a street thing
     takes its size, words and line, and a fence reaches as far as its line.
   - **The tools**: Nature (key 5) has plant, clear, as made, one tree, one rock (a boulder, a
     size of its own), the kinds, thickness and size. Things (key 6) has the catalog panel (find
     a kind; turn, size, words; the picked one's, Take it away), Place or A line (fences). Its
     ghost is the box a thing takes up: green, red with why, the lamp's colour for one picked. R
     turns 15° (Shift back), a drag moves one (a fence's whole line), a click picks it, Delete
     takes it away, Alt and a click takes its kind. Each is a step.
   - **The poles' wires** now run only between poles within 70 m: one put down anywhere was
     wired to the town's (they were wired in order of x).
   - Checked: shared `grounds-things.test.ts` (a boulder, a sign, a fence, a snow pole laid and
     solid where they stand, picked by their place or line; what the rule book refuses; a lamp
     moved and a bench taken away, not moved into the campus; pines planted thick and half as
     thick, the woods cleared and back to as made exactly, none on a road, one tree in and out);
     client `street-bounds.test.ts` (each of the 12 street kinds, old and new: its solid inside its
     model, as tall; it found the boulder's solid wider than its rock); e2e `godmode-nature.spec.ts`
     on the dev stack (pines brushed across the field and undone; one tree in and out; a boulder put
     down, dragged, sized, taken away; a sign with "Frost Farm"; a fence along three points;
     discarded). Then the other god mode specs.
   - **Not here yet**: statues and the bus shelter in the catalog (theirs are landmarks), a thing's
     tint, a row of them with Ctrl-drag (the mock), the trees a stroke cleared or planted counted.
9. **Buildings: prefabs** with generated insides. Each kind's builder for any size, pads, door
   sides, signs, tint, quarter turns. *Built 2026-10-29*:
   - **Each builder at any size**: the twelve kinds drawn at their smallest, their biggest (most
     floors) and between with their doors north and west (the stills' `&prefabs=min|max|turn`, in
     the woods north-west). Only the shed had numbers fitted to its one building (a door 9 m along
     a front that can be 6). A narrow one's door is in the middle, and the plough blade and salt
     are the town's shed's own.
   - **Door sides and quarter turns** (shared `grounds.ts turnOf`): each kind's builder draws its
     door on some sides (`NATIVE_FACES`: a house east or west, the shops north or south, the barn
     west, the farmhouse north, the church south, the gas station north, the shed north, the
     boathouse south, the silo any). On another side it's built on one of those and turned a
     quarter (or two, three) about its plot's middle:
     - **drawn** in a pivot (`Grounds3.turned`; its light and pool turned with it)
     - **solid** (`shapes/grounds.ts`: its solids made the same, then turned)
     - **walked**: the steeple and a gas station's kiosk and forecourt turned (`steepleOf`,
       `forecourtOf`)

     One you walk into faces a side its builder draws (its generated inside's door is there), so
     the rule book says so. The panel's door chips follow it, and R turns to the next one it can.
   - **A gas station put down** has its own forecourt: solids where its islands, pumps and posts are
     drawn (the town's are now made from its plot the same way: the no-edits proof unchanged), its
     kiosk `built`, its forecourt walked. Only the town's sells fuel (`atPump`).
   - **Walls' colours**: five (`WALL_TINTS`: cream, sage, tan, oxblood, pale grey) or the kind's own
     (`Building.tint`).
   - **Pads**: the land levelled under each plot as the generator's are (`terrainAt`), the trees
     cleared round it. A plot where the land falls over 4 m is "too steep for a building".
   - **The rule book**: a building on a way (any way's line or carriageway on its plot) is refused,
     as before only another building or anchored ground was. Also a door where its inside isn't, a
     colour not in the five, a name (40) and a sign (24). A generator's building moved: its corners
     on whole metres, not onto anchored ground or another.
   - **Safe landing** (the world server): someone in a building published over them (not one you
     walk into) is set down 0.8 m out by its nearest wall and told "Field House stands here now:
     you're moved out of it."
   - **The tool** (`world/god/buildings.ts`, key 7): the panel as the mock 07-buildings (the twelve
     kinds; name, size within the kind's limits, floors, door, walls, enterable, inside, sign; the
     picked one's, Take it away). The box under the pointer is green where it goes, red with why. A
     click puts it down (picked, to change), R turns a quarter, a drag moves one, Delete takes it
     away. The generator's are changed, moved or taken away too; what's anchored stays.
   - Checked: shared `grounds-buildings.test.ts` (a house in the field by the rules, a floor on its
     plot, off the walking, solid, taken away; one facing north turned a quarter, its solids too; a
     gas station's own forecourt and kiosk, no fuel; a church facing north, its steeple out past its
     north end; the refusals); world server `godmode.test.ts` (a house published over an admin: out
     by its west wall, told); e2e `godmode-buildings.spec.ts` on the dev stack (a house with a name
     and sage walls put down; R; dragged 8 m; made enterable, its inside there; refused on the
     farmhouse; taken away). Then the other god mode specs.
   - **Not here yet**: dragging a corner to size one (the panel's sliders do it), *own floors*
     (phase 10), a pet set down when the land moves.
10. **Spaces** (E): the investigation, then an inside of its own per placed building with build mode.
    May split out as plan 54.
    *Investigated 2026-10-29: split out as plan 54 (`docs/plan/54-the-spaces.md`).* About 90–110
    places assume one stored layout a world (the API's `world.layout`, the room's whole-string
    `levels`, `levels.ts`, `level === 0` meaning the Grounds). A walk-in building today is level 0
    past the HQ's own tiles, its inside code. Plan 54 proposes spaces in the Grounds' frame (a
    space's ground floor on level 0 over its plot, its floors its own), stored and synced a space at
    a time, with four decisions for the user.
11. **Checks**: e2e (each tool on the dev world, publish, rollback, a member refused, walk it),
    world-server tests (a 4 MB blob, 200 players during a publish), the no-edits hashes in CI,
    `pnpm budget`. *Done 2026-10-29*:
   - **e2e**: the phases' own cover it, on the dev stack, each rolling back or discarding what it
     made — every tool (`godmode-land`, `-roads`, `-nature`, `-buildings`), publish and roll back
     in everyone's game and a member refused (`godmode.spec`), the shell and walk it
     (`godmode-shell`), the redraw without a long frame (`godmode-redraw`).
   - **A member refused, everywhere**: the world server drops every `god:*` from a member
     (`godmode.test.ts`); the API refuses them every admin route, now with the revision read and
     the draft's discard too (`GroundsTest.php`), and a draft over 6 MB.
   - **4 MB with 200 players** (`GOD=1 BOTS=200 pnpm perf`): a third of the way in, an admin
     publishes 4.01 MB (the land lifted and painted over 317 chunks of the woods) and rolls it
     back. The server's work on it: 102 ms (the rule book ~60, laying it ~20), the roll back 15 ms
     (held under 200); every bot had each within 150 ms; nobody put back; ticks 2.9 ms on average
     (budget 4: the physics world's land made again 3 ms a tick, ~420 chunks twice). CI keeps
     `pnpm perf` without it.
   - **The no-edits hashes in CI**: `grounds-edits.test.ts`'s `TODAY`, in `pnpm test`.
   - **`pnpm budget`**: god mode's strings moved off the page into its own chunk
     (`i18n-god.ts`, added by `world/god/controller.ts`; the tag "building" stays, everyone sees
     it), and its chunk given a line of its own (`yutopia-god` 14.3 KB, budget 20). `/page` is
     416.2 KB, over its 415 by 1.2: the page's hooks (the edits fetched and laid, O, the camera,
     onto the land, the HUD's state and the lazy loaders). Raising it is the user's call.
   - **Select, built** (found by the user: it picked nothing — phase 5 left it panning only): as
     the mock 08-select, anything under the pointer, the smallest first (a thing, a building, a
     way), generated, placed or edited: dragged to move it, R turns it, Delete takes it away, Esc
     lets it go; its properties in its own tool's panel, a way's Edit points in the roads tool;
     what's anchored says why. A click on nothing puts nothing down. The tools' own code (`grab`,
     `grabWay`, `frame(…, only)`). Box-select for a group isn't here yet. `godmode-select.spec`.
   - **A save stuck on "saving"**: undone back to what was saved within 2.5 s, nothing was sent
     and the strip never said saved. Fixed (found by the select spec).
   - Named drafts, kept and come back to: plan 55 (`docs/plan/55-the-drafts.md`).

Phases 1–4 have no visible tool. They're the foundation: once they're in, an edits file written by
hand changes the world for everyone, and could ship on its own.

## Guardrails

- **Admins only, on the server**: every `god:*` message and every edits route. Tests for a member's
  attempt at each.
- **No edits = today's world**, proven by hashes, in CI.
- **One rule book**: `checkEdits` shared, so the ghost and the server never disagree.
- **No hitch on publish**: rebuilds stay inside the stream's per-frame budget, and the old block is
  shown until the new is ready.
- **The dev world is shared** (`worktree-client-e2e`, `e2e-fixture-swap-backup`): god mode e2e
  publish to a throwaway revision and roll back at the end. The API tests must not run against the
  dev database (`api-tests-dev-db`).
- **Never deep-compare a three.js scene** in tests (`no-deep-compare-three`). Compare hashes of
  data, never of meshes.

## Open questions (the user's)

1. **The key** for god mode. The mocks show **O**: G is the flare, and J, L, O and U are the only
   letters still free.
2. **Others' drafts**: kept private (as planned), or shown faintly to other admins in god mode?
3. **Who builds inside a placed building**: admins only, or handed to a member as its owner (as a
   room's owner today)?
4. **Water**: the pond, river and ravine are left as they are for now. Editable (draw a lake, move
   the river) later, or never?
5. **Traffic on new roads**: town cars and the shuttle keep their routes. Should NPC traffic use new
   streets later?
6. **The page budget**: `applyEdits` on the page for everyone, a few KB. Your call at phase 2.
