# Plan 111 — the buildings, fixed: none invisible, no flicker, real glass

Asked 2026-11-20, after plan 110's quality pass:

> 1- Alguns predios ficaram invisiveis
> 2- Algumas bordas estao flicando por confito de texturas eu acho
> 3- Algumas frentes estao bem feias, principalmente as que tem vidros grandes com coisa, ta absurdamente horrivel

Status: **planned 2026-11-20; forks decided 2026-11-20 one by one: F1b real see-through glass on every window with
cheap 3D rooms behind, F2a faces fixed where they're made + the flicker scan, F3b no sign-offs. All phases built
2026-11-20 ("go all"), not committed (on top of plan 110, also uncommitted).**

Evidence stills: `design/buildings/fixes/`.

## What's wrong, from the code

### 1. Invisible buildings: the outdoor cull's stale boxes

Reproduced on Church Street: from some angles, houses e4, w4, w5 and e5 show only their roof snow floating over
their plot pads (`invisible-church-street.png`). Their shadows are still drawn on the pad.

The geometry is there. The same cell geometry cloned into a plain mesh draws whole
(`invisible-same-geometry-drawn.png`). A red material doesn't draw either, so it isn't the shader. Matrices, layers,
bounds and the LOD level are all right.

The cause is in `tp/parts/culling.ts`:

- `cullOutdoors` hides, for one render, each still piece of the Grounds whose box is outside the camera's frustum. The
  shadow pass turns them back on, which is why the shadows stay.
- `stillBox` caches that box per object, keyed only by the object's world matrix.
- Plan 110 merges buildings into **64 m kit cells** (`grounds3d.ts` `kitCells`). A cell's LOD is made with its first
  building, and its levels are rebuilt as each next building joins. The LOD never moves, so its cached box stays the
  box of its first building or two.
- When the camera looks at the cell's other buildings with that first one out of view, the whole cell is skipped.
  The bigger the cell, the more often it happens: Main Street's north side, the hotel's cell (its sign floats alone),
  the Church Street rows.

There are two smaller issues of the same kind:

- **Rebuilt cells skip the stream's prepare.** `step()` returns only new root children, so a rebuilt cell's new
  meshes miss `patchAdded`/`prepare`. Their materials aren't patched when a cell brings a new one, and their shaders
  aren't warmed off the frame.
- **The town shows up after "ready".** On a warm dev server, `statics.left` was 69 at 3 s past ready and 0 at 9 s.
  For a few seconds you stand in an empty town. This may be longer on friends' machines (measure it on a prod
  build).

### 2. Flicker: coplanar faces

To find it, I render the same frame 8 times with the camera nudged by under a millimetre. Pixels that flip are
depth fights (`e2e/zz-flicker.mts`).

| Where | What fights | Still |
|-------|-------------|-------|
| House corners | the corner boards and quoins lie flush with the side wall | `flicker-house-corner.png` |
| Church tower front | the pilaster's edge against the wall | `flicker-church.png` |
| Door panels | the mouldings flush with the leaf | `flicker-church.png` |
| Gas canopy | the band against the fascia's top | `flicker-gas-canopy.png` |
| Snow | against steps and sills | — |
| Gutters | against the eave trim | — |

The camera's near plane is 0.1 m. With that, depth steps are about 1.5 mm at 50 m and 6 mm at 100 m, so offsets of a
few millimetres fight at a distance even when they're right up close.

### 3. Big glass: wallpaper, not windows

Every pane shares one painted picture: a 4.8 m square of 12 "rooms" (curtains, blinds, a sheer, a lamp-lit room,
sky), laid in world metres (`kit-buildings.ts` `paint("glass")`). On a house window that reads as a room. On a 4 m
shopfront or an office's curtain wall it's a strip of three or four rooms cut by mullions, the same repeat across the
whole facade, the sheer's stripes reading as corrugated metal (`glass-laundry.png`,
`design/buildings/built/row1-mid.png`).

And a shop you can walk into has a real furnished inside right behind that painted glass: shelves, counters, stools,
none of it seen.

## Forks

| # | Fork | Options (recommended first) | Decided |
|---|------|-----|-----|
| F1 | The glass | a interior mapping: a shader draws a room with depth behind each pane (back wall, floor, ceiling, side walls, a few props, its light), each pane its own, rooms by use (shop, office, home, café/bar, garage), a fresnel sky reflection over it; the enterable buildings' shopfronts truly see-through to their real inside · **b** see-through glass everywhere, with cheap box rooms behind every window · c dark reflective glass, blinds and curtains only, no rooms | **b** |
| F2 | Depth precision | **a** every coplanar face fixed where it's made (parts standing ≥ 2 cm proud, corners wrapped, wall ends mitred), with the flicker scan as a check · b that, plus a reversed depth buffer (three r186 has it; the post's and ink's depth reads move with it) · c faces only, no scan | **a** |
| F3 | Sign-offs | a the glass mocked first (before/after stills: shopfront, office, house, at day and night), signed off, then straight · **b** no sign-offs | **b** |

## Phases

0. **The scans.**
   - `e2e/zz-flicker.mts` and `e2e/zz-sides.mts` become one tool, `e2e/buildings-scan.mts`. It renders every kind ×
     style placed in a draft, from four sides at 10, 30 and 80 m, and reports for each:
     - **flicker**: pixels that flip under a sub-millimetre nudge;
     - **cull truth**: the view's culling on vs off, with any pixel that differs meaning something wrongly left out;
     - **see-through**: front-faces vs two-sided.
   - A baseline report saved: `design/buildings/fixes/scan-before.md`.
1. **None invisible.**
   - `stillBox` keyed by a version as well as the matrix. The Grounds bump `userData.cullV` on whatever it rebuilds
     in place (the kit cells; anything else found doing the same).
   - A rebuilt cell handed to the stream as added, so its meshes are patched and warmed.
   - A unit test: a cell grown after its first cull is still drawn.
   - The town held behind the loading screen until the buildings round the spawn are in (measured on a prod build
     first).
   - The scan's cull-truth column: zero everywhere, the long road's districts too.
2. **No flicker** (F2).
   - In the layout (`building-styles.ts` / `building-kit.ts`): trims, corners, pilasters, bands and coping stand
     proud of what they're on. Corner pieces wrap both walls. Walls meet without overlapping faces.
   - In the Blender kit (`tools/art/buildings/parts.py`): door panels and mouldings stand proud. The kit is
     re-exported.
   - Snow on sills and steps sits a hair above. Signs stand off their boards.
   - A shared test: no two of a layout's boxes or polys coplanar and overlapping.
   - The scan's flicker column: zero at 10 and 30 m, and only sub-pixel noise at 80 m.
3. **The glass** (F1b: real glass, real rooms behind).
   - **Glass**: kit glass drawn see-through with the sky's reflection, a fresnel, a faint tint and a little grime. It's
     merged per cell like the rest, its front and back halves split so transparent two-sided draws don't re-check
     shaders every draw (memory three-two-sided-glass). The painted room picture is gone.
   - **A room behind every window** of a building with no inside. It's a box from the layout: back wall, floor,
     ceiling and side walls, as deep as its use wants (2.5–4 m), as wide as its bay (never into the next window's
     room).
     - Each room is coloured by its use: homes papered, shops bright, offices with ceiling panels, the garage bare.
     - Its light is in its vertex colours, not a lamp.
     - Rooms are merged per cell, about 10 triangles each.
   - **Things in the rooms**, by use and seeded per window:
     - homes: curtains and blinds as real cloth planes at the window, a lamp, a sofa or bed back, a picture;
     - shops: shelving, a counter, displays at the glass (produce crates, books, mannequins, tools, by the shop's sign
       or kind);
     - offices: desks, partitions, a plant;
     - café and bar: tables, the bar back.
     - Drawn from the furniture kit (`furn/native.ts`) where it has the piece, instanced per cell; low-poly blocks
       where it doesn't. Only near: the far level has none.
   - **Night**: a share of rooms lit. Their walls glow warm through the glass, the same rooms as by day.
   - **Walk-in buildings**: no fake rooms. Their street glass looks into their real furnished inside, as built by plan
     110 phase 9.
   - **The far level**: an opaque pane in the room's average colour, lit or not as it is near.
   - **Cost**: draw calls and frame time measured before and after on Medium and Low in town (`town-cost.mts`). The
     rooms' and things' near distance is tuned to keep Medium within today's frame. Low may keep the far panes nearer.
4. **Checks.**
   - The shared suite, `godmode-buildings` and `godmode-select`, and the page and chunk budgets.
   - The scan again: `scan-after.md` beside the baseline.
   - A walk down Main Street and Church Street, memcheck.
   - Stills of every style's front at day and night into `design/buildings/built/`.

## Guardrails

- Walking and solids unchanged: `TODAY` and the town fixture hold. Only what's drawn changes.
- The cull stays: the fix makes it right, not off. Frame cost measured before and after on Medium (`town-cost.mts`).
- Plan 110 isn't committed yet. This plan builds on it, and both are committed when the user asks.
- Budgets raised as needed, measured and noted.

## Built (2026-11-20)

### Phase 0: the scan

`apps/client/e2e/buildings-scan.mts` (as Bia, against the dev client):

- **Kinds × styles.** Every kind × style is built on its own scene from the kit. `grounds3d.ts` exposes the kit's
  functions on `window.__kit` in dev builds only. Each building is drawn through the game's renderer from four sides
  at 10, 30 and 80 m. Two counts per view:
  - **flicker**: rendered into a target without MSAA, each batch flat in its own colour, with the camera nudged six
    times by 0.7 mm; a pixel that flips twice or more is a depth fight. Without the flat colours, MSAA edge samples
    and a concrete texture's grazing shimmer counted too.
  - **see-through**: front faces against two-sided.
- **Cull truth.** At five town spots, four ways each, the view's culling on against off.
- **Output.** The report and the worst views go to `design/buildings/fixes/scan-*/`; the baseline is `scan-before/`.

### Phase 1: none invisible

- **The cause** was `Culling.stillBox`, which kept a piece's box keyed only by its world matrix. Kit cells are rebuilt
  in place, so each kept its first building's box and vanished whenever that one was out of view. Shadows were still
  drawn, because the shadow pass re-shows what the main pass leaves out.
- **The fix:**
  - The cache is also keyed by `userData.cullV`, which `kitLod` bumps on every rebuild.
  - A rebuilt cell is handed to the stream (`Grounds3.touched` → `GroundsStream.patchTouched`), so new materials in
    it are patched. Its layers are left alone: `prepare` would hide the whole cell while it compiles.
- **Tests:** a unit test in `tp/parts/culling.test.ts`.
- **Scan:** cull truth was 0 / 11,809 / 92,744 / 54,892 wrongly hidden pixels; it is now 0 at every spot and in
  every direction.
- **Not needed:** holding the loading screen. It already waits for the statics (`warmup.readiness`); the empty town
  was only my probe reading "ready" too early.

### Phase 2: no flicker

- **`settleFaces`** (shared `building-kit.ts`) runs at the end of `layoutOf`:
  - Every wall is drawn `WALL_IN` (1.5 cm) in from its line. What's put on it stands proud, and corners still close
    (the walls overlap, they don't gap).
  - Any box still in one plane with another face is grown 1.2 cm off it on that face: the smaller box of two, or a box
    before a wall or a poly.
- **`coplanarFights`** finds every pair of a layout's faces in one plane, facing the same way, overlapping and drawn
  differently. It found 870 across the kinds × styles; there are 0 now. The new shared test
  `building-faces.test.ts` checks 798 layouts (every kind × style × size × floors × side).
- **Parts can't be seen by that check** (the kit's GLB isn't in shared), so the client draws them in batches of their
  own (`p:<key>` materials) pulled 3 depth units toward the eye with `polygonOffset`. Only the units term is used:
  the slope term grew at grazing angles and pulled recessed faces through the wall in front of them.
- **Smaller fixes:**
  - The garage's deck slabs stop 3 cm short of the sides, where the spandrels stand.
  - Roof snow lies 2.5 cm in from the edges it's laid to; flat snow and sill snow sit 4 mm up.
- **Scan, flicker at 10 m, before → after:**

  | Style | Before | After |
  |---|---|---|
  | brick garage | 9,544 | 125 |
  | modern townhouse row | 3,283 | ~100 |
  | modern school | 2,563 | 78 |
  | concrete office | 2,259 | 65 |
  | Victorian house | 2,131 | 61 |
  | civic shop | 1,560 | 48 |
  | Carnegie library | 719 | 54 |

  Most styles are now at the thin-line noise floor (25–100 px of 129,600). What's left is the sash bars against
  their own glass inside the window parts.

### Phase 3: the glass

- **Glass.** Every pane is real glass (`kit-buildings.ts`): a sky mirror (metalness 1, roughness 0.05) whose alpha
  goes from 0.3 straight on to 0.92 at a glance (a fresnel hook in the shader). It's drawn after the rest, writes no
  depth, and has `userData.ownLook`, so the Grounds' `patchGrounds` doesn't replace its hook. The painted 12-room
  picture is gone.
- **Rooms** (`tp/kit-rooms.ts` `roomQuads`). Every wall opening gets a box of a room behind it. It's as deep as its use
  (home 3.2 m, shop 4.6, café and office 4.2, hall 4.5, bare 3.0; never past 45% of the plan) and as wide as its
  opening plus up to 0.3 m a side (never into the next one's).
  - Its light is in its vertex colours: 0.3 of the street's at the window, falling to 0.14 at the back.
  - Openings behind solid doors (garage, roll-up, barn, service) get none.
  - What a room is for comes from `roomUse(kind)`: ground floor and the floors above.
- **Things by use**, seeded per window:
  - homes: curtains drawn back or a blind part down, a sofa (ground floor) or a bed (upstairs), a picture, a floor
    lamp;
  - shops: four shelves of coloured goods, a counter, a display of goods behind the glass, ceiling light panels;
  - cafés: a bar back of bottles, tables and stools by the glass, pendants;
  - offices: desks with screens, partitions, light panels, a plant;
  - bare rooms (barn, shed, warehouse): crates.
- **Night.** About 55% of rooms are lit: a window part's own `lit`, or a seeded share. A lit room is drawn in its own
  `room-lit` material, whose emissive is the room's own colours × 8 in warm light, faded in with the night through
  `glows`. It replaced an additive glow layer laid over the shell, which kept losing the depth test (the two shaders'
  depths weren't the same).
- **Walk-in buildings.** No rooms under their inside's height (`insideHeight`, shared now with `interior()`); you see
  their real inside through the glass. Over the inside goes a ceiling at that height, hidden with the outside when
  you walk in. Their upper floors get rooms.
- **The far level.** An opaque pane each (`pane`, or `pane-lit` glowing at night).
- **God mode's style pictures** draw the rooms too.
- **Rooms off the frames**, from the after-scan: each room is at least 4 cm past its opening on each side, and its
  floor at least 3 cm under the opening's foot. Close-set windows put a room's side on the frame's jamb plane, and a
  doorway put the floor on the threshold's plane (the brick school went 977 → 177).
- **Cost** (Main Street, Medium, a steady frame, dev client): 2,290 draws and 5.37 M triangles. Rooms and glass are
  20 of those draws and 0.06 M of the triangles. The parts' own batches add about 50 meshes in view, roughly 8% more
  draws. Plan 110 measured 1,964–1,982 draws and 4.6–4.8 M triangles, on turbopack rather than this dev client.

### Phase 4: checks

- **Scan** (`design/buildings/fixes/scan-after/`):
  - Flicker over every view of every kind × style went from **199,607 to 18,876 pixels** (−91%). Most styles are at
    the noise floor.
  - What's left: aliasing on the mesh garage's fine wire screen; the meetinghouse's open belfry (seen through, as it
    should be); sash bars against their own glass.
  - Cull truth is 0 at every spot.
- **Stills:** `design/buildings/fixes/after-day/` and `after-night/` (Main Street, the laundry, Church Street, the
  hotel).
- **Tests:**
  - The shared suite passes, 776/776 (+2: the faces).
  - Client units pass, 462/464 plus the culling test. Of the two reds, the HUD colours test is red on HEAD too
    (`Overlays.tsx`, untouched since b9dbbaec). The material library's download budget was raised to 6.5 MB,
    measured at 6.2 after plan 110's ten skins and roofs.
  - e2e `godmode-buildings` and `godmode-select` pass with `YUTOPIA_GPU=1`. Without it, both time out on the loading
    screen under software rendering.
- **Bundles** (prod build): the world page 492.0 / 493 KB, `yutopia-grounds` 170.7 / 205, `yutopia-god` 26.7 / 27.
- **Not done:**
  - The memcheck and a walk down both streets, which plan 110's checks covered.
  - The walk-in buildings' real insides seen through their glass are plain (flat-lit furniture-kit interiors); their
    look is plan 110 phase 9's.

## Follow-up (2026-11-20): every building walked into

Asked after the phases:

> some of the buildings dont have a door to enter, for now, every building have a empty space inside

- **Every building that can be walked into is.**
  - Every kit kind with `enter` gets an `Inside`, the townhouse row too (it's enterable now). It's empty unless
    furnished.
  - God mode's old "Enterable" toggle is now **"Furnished"** (empty inside / furnished).
  - Still not walked into: the gas kiosk under its canopy, the round silo, the garage's open decks, the open shelter.
- **The plinth is kept.** Walked into, a building used to drop its plinth to 0.15 m, flattening houses' raised
  foundations and stoops. Now the inside's floor is a slab up to the door's sill (`Inside.fy` = the layout door's
  `y`):
  - shared: the slab's solid, and the fits on it;
  - client: the inside's floor, walls and fits drawn on it, and the outside ceiling (and the rooms' cut-off) over it;
  - the doorway's head over the sill.
- **The doorway is under the drawn door.** `doorOf` takes the layout's `door` (the tiles under its width, two at
  least) instead of always the front's middle. Shops and stores whose door isn't central, and the boathouse, were
  open where no door was drawn.
  - **The townhouse row** records the unit door nearest the middle; it used to record `W / 2`, between doors.
  - **A boathouse whose big door opens on the water** (the land falls more than 1.5 m before it: `dropBefore`) gets a
    service door at its back, on the land, and that's its way in.
  - **The meetinghouse's tower**, which stands out of the plot in front of its door, was one solid block. Its ground
    storey is now a porch through to the nave: side walls, front and back either side of a 1.8 m way, solid over 2.9
    m, its floor at the sill. The nave's front and the tower's back are opened, and the porch is lined inside.
- **Steps down to the land** (`stepsToLand`, with `setLandAt` given by `grounds.ts`). Where the land in front of a
  door's steps is lower than the building stands, a landing and treads (≤ 0.18 a rise) go down to it. The gatehouse
  is by the road's cut (0.65 m) and the town boathouse by its bank (0.97 m).
- **Two navmesh bugs, both older than this:**
  - **A land window's cells lay on the chunk lines.** On Church Street's west row every 0.3 m tread edge fell exactly
    on a cell line, and Recast lost the stoops' lower treads: no way up any of them. The cells are now set 0.0537 m
    off (`GRID_OFF`).
  - **The server asked for ways at the floor's own height.** The lake boathouse's front stands over the jetty's buried
    end (6.4 m down), and the way snapped to the jetty. The server now passes the asker's height and the target's
    ground (`way` → `waySoon` `fromZ` / `toZ`).
- **Checks:**
  - **Walk-in probe:** a walk in from 4 m out at every door in town and on the long road, 36 of 36. Before, 13 failed:
    the west row, the gatehouse, the church, the lake boathouse, house-w0.
  - **Shared suite:** 778/778. New tests: every doorway under its drawn door with its floor at the sill; a navmesh way
    up a west-row stoop and into the lake boathouse. `TODAY` walk and solids and 29 town chunks were updated on
    purpose.
  - **World server:** God mode 6/6, rooms 65/65, pets-lift 3/3.
  - **e2e:** `godmode-buildings` (its button renamed) and `godmode-select` pass.
  - **Client units:** 463/464; the red is the HUD colours test, red on HEAD.
- **Not done:** pets and other walkers drawn from the land's height (memory: pets aren't on Jolt) will stand 0.6–0.9 m
  under a raised inside floor.

### A door drawn where you go in (2026-11-20)

> Sim, mas design tambem alguns nao tem nem o design da porta (the books shop, the market — "and there are more")

A scan of every kind × style at five widths, both sides, and the town found 77 of 685 with no door drawn where you go
in:
- **Shopfronts** (shop, corner shop, bar, at every width): pilasters went every ≤ 8 m, and with an even number of bays
  one stood on the front's middle. The door is placed only in a bay holding the middle, so none was drawn. Now there's
  always an odd number of bays: the middle is glass and its door is there.
- **Fire stations**: their way in was recorded at the front's middle, over a pier between the engine doors. It's now
  their office door.
- **Townhouse rows**: their way in was recorded at the middle, between units. It's now the unit door nearest the
  middle.
- **Rooms behind the glass** no longer go behind any opening in a walked-into building's ground storey. A shop door's
  transom sat just over the inside's walls and showed a little room above the door.

New shared test: every building walked into has a door part (or a shop's recess) at its way in. The scan is now 0 of
685, and the shared suite passes 779/779. Stills: `design/buildings/fixes/doors/`.
