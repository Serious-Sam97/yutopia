# Plan 130 — Build a house (The Sims' Build mode)

Asked 2026-11-26, after plan 129:

> New feature
>
> The sims construir casa
>
> Lets get our current build mode and improve a lot the tools on build mode and the items for house construction,
> improve the stairs, foundation, walls, roofs, floors etc...
> That a user be able to build all of that
>
> Add a lot of more items on build too for all
> Lets plan

This plan takes build mode (plan 124's screen, plan 72's free structure) and makes it a house builder after The
Sims 3 and 4. A member should be able to build a whole house: the foundation, walls, floors, stairs, a roof,
openings, coverings and the outside, with many more pieces to build with.

Status: **planned 2026-11-26; forks decided 2026-11-26, one by one:**
- **F1a** a lot of your own in the world. Admins lay lots out in God mode; **a member claims a free one** (a For Sale
  sign), one each, and admins can still assign or take one back;
- **F2a** the owner, the roommates they add, and admins build there;
- **F3b — foundations and basements both now; basements up to two storeys deep.** The land's heightfield and Jolt's
  ground get a hole the size of the house's footprint;
- **F4a** a tile brush (1 m, halves, quarters, triangles) on top of the polygons;
- **F5a** storey heights short / normal / tall (3.0 / 3.5 / 4.5 m);
- **F6a** one modular stair tool; spirals and ladders from the catalog;
- **F7a** Auto Roof over any shape, and dragged roofs with handles;
- **F8a** CC0 photo textures tinted by a colour you choose;
- **F9a** measured pieces in code families, ornate ones in Blender;
- **F10a** the full counts;
- **F11a** the Pool tool now;
- **F12b — blueprints: saving and placing your own rooms and houses only, no starter houses;**
- **F13a** mocked first in the Glass look, then built straight through with no sign-offs, tested at the end.

Phase 0 mocked 2026-11-26 (below): 11 stills and a sheet, `design/house-build/`. Nothing else built yet.

## What there is today

A survey of the code on 2026-11-26 (file:line refs as of `78fd4960`).

### Walls
- **Modes:** Line, Arc, Box, Adjust, Erase (`WallsPanel.tsx:42-49`), and Select, which picks one wall at a time
  (`build/controller.ts:1716-1741`).
  - Line snaps to wall ends and middles. The grid snap is 0.5 m, 1 m or off; the angle snap is 15°, 45° or off. You
    can type a length, and Backspace takes the last wall back.
- **Adjust changes height and thickness only.** A wall's ends can't be moved and a wall can't be dragged: you erase
  it and draw it again. Nothing selects, moves or copies several walls or a whole room.
- **Materials:** 6 (plaster, walnut, foam, brick, cork, glass) plus the half wall "h", with a front and a back face
  (`structure/edit.ts:12`, `types.ts:63-68`).
- **Heights:** presets at the ceiling (3.266), a rail (1.1) and low (0.6); any height from 0.5 m up by Adjust. The half
  wall is fixed at 0.868. **Thickness:** 0.1, 0.2 or 0.3 m.
- **Missing:**
  - fences, railings and gates in the house tools (fences and `gwall` exist only outdoors, in God mode);
  - columns as a build piece (only the catalog `column`, in Buy › Decor);
  - trims, mouldings, friezes and spandrels.

### Floors and storeys
- **Tools:** Line (a polygon), Box, Fill (the room under the pointer), Erase (`freefloors.ts`).
- **Materials:** 6 (wood, carpet, tile, felt, stage, grate) plus "No floor".
- **No tile brush.** A floor is a polygon or a room's face, one material each; there's no painting a checker or a
  border by tiles, and no turning a pattern.
- **No hole tool.** Slabs have holes, but only Fill leaving inner rooms out makes them.
- **Mezzanines** at 1.0–2.5 m over their floor; PgUp/PgDn step the working height.
- **A new storey** only as "Add a floor on top", copying the home floor's footprint. At most 12 storeys, each 3.5 m
  (`units.ts:6`). Only the top floor can be taken away.

### Foundations
- **Nothing.** No foundation, platform, basement or raised floor in the structure.
- Flattening and painting the land are God mode's (admin) brushes only (`grounds-brush.ts:35`, `grounds.ts:3380`).

### Roofs
- **Three kinds:** flat, gable, hip. Pitches 20/30/45° in the tool (the server takes 10–60°). The overhang is fixed at
  0.3 m.
- **Placed by clicking a closed room.** The eaves go at its highest wall's top (`roof.ts:128-141`).
  - A gable needs a rectangle; a hip needs a rectangle or a convex face.
  - **An L-shaped house, or a roof over several rooms, gets no pitched roof.**
- **One look:** slate slopes, plaster gables, a concrete flat roof (`tp/build.ts:653-664`).
- **Missing:** dormers, shed/mansard/gambrel kinds, eaves and pitch handles, roof trims, chimneys. A roof can't be
  edited, only clicked again, removed, or its ridge turned with R.

### Stairs
- **`stairs`:** a 4 × 7 switchback, one storey always, turned by quarters only. It cuts the floor above itself and has
  a handrail (`stairs.ts`, `tp/stairs3d.ts`).
- **`flight`:** 1 × 3 straight steps, rise 0.5–2.5 m, for mezzanines, with no rail (`flight.ts`).
- **Elevator:** 2 × 2, floors only.
- **Missing:** straight stairs to the next storey, L and U shapes you lay yourself, spirals, ladders, a choice of
  width, rails and look, and steps up to a raised floor.

### Doors and windows
- **10 doors:** door, glass, double, studio, barn, saloon, automatic, revolving, garage, archway.
- **10 windows:** window, wide, tall, round, arched, high, stained, blinds, studio, and the skylight.
- **Placing:** each is 1 m or 2 m wide with a fixed sill and head (`openings.ts:68-87`). They slide along any wall in
  0.25 m steps.
- **Missing:**
  - choosing a size or a height;
  - windows that join side by side into one long window;
  - shutters and curtains;
  - porch, French and sliding patio doors, gates.

### Paint
- **5 paints** (`edit.ts:48`), no wallpapers, no patterns, no colours.
- **What one action paints:** a click, a face; a drag, any stretch; Shift-click, a whole room.
- Floors take one material per slab.

### Who builds
- **Every user is a `builder`** (`apps/api/app/Models/User.php:64`), and every `struct:*`, `level:*` and `obj:put`
  checks it.
- **There are no lots.** Everyone builds in the one HQ building. What limits them:
  - locked rooms;
  - a room's owner;
  - "Start blank", which is admins' only;
  - the town's buildings' insides, which are admins' only (plan 112 F1a).
- Undo is per person on the server, 50 steps, and covers structure edits.
- Copy, the eyedropper and multi-select work on furniture only. There are no house blueprints.

## The Sims reference

What The Sims 3 and 4's Build mode does that this plan takes from:

- **A lot you own.** A lot has a boundary you build inside. The Sims 3 also has a "Raise/Lower lot" setting, and its
  terrain tools work on the lot: flatten, raise, lower, smooth, and terrain paint.
- **Foundations.** A Foundation tool draws a raised platform under the house: a box, or one room at a time. Stairs to
  the doors are added automatically, or placed (The Sims 4's foundation heights). Basements dig a storey under the
  ground with the Basement tool.
- **Walls:**
  - the Wall tool, the Room tool (a box), diagonal walls, half walls and short walls;
  - in The Sims 4, three wall heights per storey;
  - The Sims 4's **room manipulation**: push and pull a wall, move, turn or copy a whole room;
  - fences and gates, railings, columns;
  - spandrels, friezes, mouldings and trims (The Sims 4).
- **Floors:**
  - painted tile by tile, by quarter tiles or triangles, or a whole room with Shift;
  - Ctrl-Shift for every floor of a storey;
  - patterns turned.
- **Stairs:**
  - The Sims 4's **modular stairs**: one tool, straight, then add landings to turn it into an L or a U;
  - a choice of tread, rail and width;
  - the hole above cut as it goes;
  - spirals and ladders in the catalog.
- **Roofs:**
  - **Auto Roof** over any shape of walls;
  - roofs placed by dragging: gable, hip, shed, half-hip, mansard, gambrel, Dutch gable, flat, round;
  - **handles** to stretch the eaves and change the pitch and the height;
  - roof trims, roof patterns, chimneys;
  - dormers (in The Sims 4, a roof over a small room set on a roof).
- **Doors and windows:**
  - sizes from 1 to 3 tiles, including double doors and archways;
  - The Sims 4 moves a window up and down a wall (Alt / the arrows);
  - windows that join along a wall;
  - shutters and curtains in Buy.
- **Coverings:**
  - wallpapers, paints, tile, panelling, brick, stone, sidings, many in colour variants;
  - Create a Style recolours any of them;
  - an outside face and an inside face.
- **Pools:** a Pool tool (a box or room-shaped, any depth), its tiles, coping, a ladder, and a fountain made the same
  way.
- **Blueprints:** The Sims 4's prebuilt rooms and houses, placed whole; the Library and the Gallery to save and load
  your own.
- **Feel:**
  - the grid;
  - a green or red ghost;
  - a wall tool that shows the length as you draw;
  - a sledgehammer that knocks down a whole room with Ctrl;
  - the eyedropper on any piece.

Sources:
- [Sims Wiki, Build mode](https://sims.fandom.com/wiki/Build_mode)
- [Sims Wiki, Room manipulation](https://sims.fandom.com/wiki/Room_manipulation)
- [Sims Wiki, Modular stairs](https://sims.fandom.com/wiki/Stairs)
- [Prima, TS3 building basics](https://primagames.com/eguides/the-sims-3-eguide/essentials/creating-a-house/building-basics)

## The proposal (before the forks)

1. **A lot of your own** (F1). A member gets a lot in the world: an outline on the land with an owner. Build mode
   opens on it, and only its owner (and those they let in) builds there.
   - The lot is a space, as plan 112's town buildings are. Its house is that space's storeys. The machinery is there:
     storeys, shells, the space's floors, admins' God mode placing them.
   - The HQ keeps building as it does today.
2. **Foundations** (F3): a platform under the house, its height chosen, with the steps to its doors. Basements are F3's
   call.
3. **Walls you can work with**:
   - select several, drag a wall's ends, push or pull a wall, move, turn or copy a room;
   - fences, gates, railings, columns, half walls in more heights, all in the house tools;
   - trims, mouldings, friezes and spandrels;
   - storey heights (F5).
4. **Floors:**
   - a tile brush on the 1 m grid, in halves, quarters and triangles (F4), its pattern turned;
   - a hole tool;
   - decks and porches outside;
   - paint for the land on the lot.
5. **Stairs, one modular tool** (F6): draw a straight run for any rise (a storey, a mezzanine, a foundation), drag
   landings into it to make an L or a U, choose the width, the treads and the rails, and the hole above is cut.
   Spirals and ladders come from the catalog.
6. **Roofs:**
   - Auto Roof over any shape of walls;
   - roofs placed by dragging, with handles;
   - six more kinds;
   - eaves, pitch and height set by hand;
   - roof materials, trims, chimneys, dormers (F7).
7. **Doors and windows:**
   - a size and a height of their own;
   - windows that join;
   - shutters and curtains;
   - many more kinds.
8. **Coverings:**
   - wall coverings, floors and roofs from a real material library (F8), each with a colour you choose;
   - an inside and an outside face;
   - sidings.
9. **Many more pieces** (F9, F10): see the counts below.
10. **Pools** (F11), on plan 66's water.
11. **Blueprints** (F12): rooms and whole houses saved and placed, and starter houses to begin from.
12. **The tools in the Glass look** (plan 124 C): mocked first (F13).

### The counts (today → after, the proposal's)

| | Today | After |
|---|---|---|
| Wall coverings (paints, papers, tile, panels, brick, stone, sidings) | 5 | ~60, each with colours |
| Floors | 6 | ~50 |
| Roof kinds | 3 | 9 |
| Roof materials | 1 | ~12 |
| Doors (with gates, arches) | 10 | ~30 |
| Windows | 10 | ~35 (with sizes) |
| Stairs (styles × shapes, spirals, ladders) | 3 | modular + ~12 styles |
| Fences, gates, railings | 0 in the house tools | ~20 |
| Columns | 2 | ~12 |
| Trims, mouldings, friezes, spandrels | 0 | ~20 |
| Fireplaces, chimneys | 1 | ~8 |
| Porches, pergolas, awnings, decks | 0 | ~10 |
| Pool pieces | 0 | coping, ladders, lights, tiles |

## The forks

- **F1 Where a member builds:**
  - (a) **a lot of their own in the world**, placed by admins in God mode (one per member to begin with), as a
    space like plan 112's, recommended;
  - (b) in the shared HQ only, as today, with better tools;
  - (c) both, with lots coming later in their own plan.
- **F2 Who builds on a lot:**
  - (a) the owner, plus people the owner adds ("roommates"), and admins, recommended;
  - (b) the owner and admins only.
- **F3 Foundations and basements:**
  - (a) foundations now, with heights 0.25–1.5 m and steps to the doors; basements in their own plan later (they need
    holes in the land's heightfield and Jolt's), recommended;
  - (b) both now.
- **F4 Floors by the tile:**
  - (a) a tile brush on the 1 m grid, in halves, quarters and triangles, on top of the polygons we have, recommended;
  - (b) polygons and Fill only, as today.
- **F5 Storey heights:**
  - (a) per storey, short / normal / tall (3.0 / 3.5 / 4.5 m), as The Sims 4's walls; the stairs, lifts and roofs
    follow, recommended;
  - (b) 3.5 m always, as today.
- **F6 Stairs:**
  - (a) one modular tool: draw a run, drag landings into it for an L or a U, any rise; spirals and ladders from the
    catalog, recommended;
  - (b) fixed pieces in the catalog (straight, L, U, spiral, ladder), each laid whole.
- **F7 Roofs:**
  - (a) Auto Roof over any shape (a straight skeleton for hips over any outline) **and** roofs dragged out with
    handles, recommended;
  - (b) dragged roofs only;
  - (c) Auto Roof only.
- **F8 Materials:**
  - (a) CC0 photo textures (ambientCG, Poly Haven) cut to our life look (plan 73), each tinted by a colour you choose,
    recommended;
  - (b) drawn in our shaders from code, no textures;
  - (c) textures with fixed colour variants only.
- **F9 How the new pieces are made:**
  - (a) the measured pieces (rails, stairs, roofs, windows with sizes, trims) in code families as plan 68's, and
    ornate pieces (columns, fireplaces, doors' details) in Blender as plan 110's kit, recommended;
  - (b) everything in code;
  - (c) everything in Blender.
- **F10 How many pieces:**
  - (a) the counts above, recommended;
  - (b) half of that now, more later.
- **F11 Pools:**
  - (a) a Pool tool now, on plan 66's swimming, recommended;
  - (b) later.
- **F12 Blueprints:**
  - (a) rooms and houses saved and placed, plus ~6 starter houses, recommended;
  - (b) saving your own only;
  - (c) later.
- **F13 Building it:**
  - (a) the tools mocked first in the Glass look, then built straight through with no sign-offs, tested at the end,
    recommended;
  - (b) phase by phase with sign-offs.

Desktop only as plan 124's F9b, and price-ready as its F7: kept, not asked again.

## Phases (sketch, refined after the forks)

0. **The mocks:** the lot and its boundary, a foundation going down, the stair tool with a landing dragged, a roof's
   handles, the coverings' catalog with a colour, a room moved whole, a pool. Stills in `design/house-build/`.
1. **Lots** (F1, F2):
   - the `lot` space (an outline, an owner, roommates) on the server and the API;
   - God mode lays lots out, assigns and takes them back;
   - a free lot's For Sale sign; a member claims one, one each;
   - build mode opens on your lot, and what's built there is checked against its outline;
   - the lot's land flattened under its house;
   - terrain paint and the land brushes for the owner, inside the lot.
2. **Structure selection and moving:**
   - select several walls, slabs, roofs and openings (marquee, Shift);
   - drag a wall's ends; push or pull a wall with its neighbours following;
   - move, turn or copy a room with what's in it;
   - Ctrl-sledgehammer a room;
   - undo as one step each.
3. **Walls more:**
   - fences, gates, railings, half and short walls in the wall tool;
   - columns that snap to corners and ends;
   - trims, mouldings, friezes, spandrels;
   - storey heights (F5) through stairs, lifts, roofs and Place.
4. **Floors more:** the tile brush (F4), patterns turned, the hole tool, decks and porches outside.
5. **Foundations and basements** (F3b):
   - a platform under a box or a room, at its height;
   - basements up to two storeys down: a hole in the land's heightfield and Jolt's ground the size of the footprint,
     its walls retaining the earth, stairs down, light without windows;
   - its sides in the lot's coverings;
   - steps where a door is over it;
   - Jolt and the navmesh.
6. **Stairs** (F6):
   - the modular tool, any rise and width, landings for an L or a U;
   - the hole above cut and railed;
   - styles of tread and rail;
   - spirals and ladders;
   - Jolt's steps and the navmesh's links.
7. **Roofs** (F7):
   - Auto Roof by a straight skeleton over any outline;
   - dragged roofs with eave, pitch and height handles;
   - shed, half-hip, mansard, gambrel, Dutch gable and round;
   - roofs meeting roofs (valleys);
   - trims, chimneys, dormers;
   - Jolt's lids.
8. **Doors and windows:**
   - width and height choices;
   - sliding up and down the wall;
   - windows joining along a wall;
   - shutters and curtains;
   - the new kinds (F10).
9. **Coverings** (F8):
   - the material library and its credits (plan 75's `sources.json`);
   - the colour per face;
   - inside and outside faces, sidings;
   - floor and roof materials;
   - the Design tool and the eyedropper on structure.
10. **More pieces** (F9, F10): fireplaces with chimneys, porches, pergolas, awnings, the columns' and doors' details.
11. **Pools** (F11):
    - the Pool tool, depths, coping, ladders, lights;
    - plan 66's swim and dive in them;
    - water drawn and its Jolt volume.
12. **Blueprints** (F12b): your own rooms and houses saved to the API, the library panel, placed with the ghost and
    checked against the lot. No starter houses.
13. **Cost:**
    - the light volume and occlusion from the new pieces;
    - draw calls merged per house;
    - the page and the build chunk's budgets, raised and noted;
    - an edit inside one frame, as plan 72's wall hitch.
14. **Checks:**
    - unit tests for each module;
    - the build specs and e2e near the changes;
    - a member building a whole house from a bare lot to the roof in the game, as Bia;
    - stills of the house;
    - memcheck over a long build.

## Phase 0 — the mocks (2026-11-26)

Eleven stills in the Glass look (plan 124 C), one per tool, and a sheet: `design/house-build/01-lot.png` … `11-blueprint.png`,
`sheet.jpg`.

**How they're made.**
- The backdrops are the game's own scene, captured as Bia on the dev world (Metal, 13:00): `mock/capture.mts`, run from
  `apps/client`.
- The mock house is drawn into that scene in 3D with a copy of three (`mock/house.js`), on the open meadow at
  (130, −40) by the north path.
- The materials are drawn on canvases for the mock (`mock/tex/`); F8's real ones are CC0 photo textures.
- The basement shot hides the world (a level view) and the pool shot cuts the land out with clipping planes on its
  materials. The game's own land took the clipping, so phase 11's hole in the land can start from the same idea.
- The HUD goes over the stills: `mock/house-build.html?s=<shot>`, with `mock/anchors.json` giving each 3D point's place
  on the picture. `node mock/render.mjs` makes the PNGs and the sheet.

**What each shows.**
1. **Lot:** a free lot by the path. The boundary is staked out with a For Sale sign, and live mode shows the claim card
   ("Claim this lot", E) — one lot each, roommates, and a price slot for when money comes.
2. **Foundation:** a fieldstone foundation down, and the wing's being dragged out as a ghost at 0.75 m with its ↕ handle.
   Steps are added where a door will be. The strip has the sides' materials and heights 0.25–1.5 m; the card has steps
   at doors and the basement (none / 1 / 2).
3. **Basement:** a section through two storeys dug under the main block (a rec room, a cellar), with the stairs down
   cut through. The floor picker reads "Basement 2"; the card has depth, storey height and the cut-through view.
4. **Walls:** the ground storey on its foundation.
   - The dining wing is selected whole, with the move cross and turn ring and an orange push handle on its wall.
   - A picket fence is being drawn on from the gate.
   - The strip has 16 wall kinds: full, half and short walls, glass, fences, a stone wall, rails, columns, crown trim, a
     frieze, a spandrel, an arch and a gate.
   - The card has Move, Turn, Copy and Delete, and the storey seg 3.0 / 3.5 / 4.5 m.
5. **Floors:** a cutaway from above. The kitchen is being painted in chessboard tile by tile, with a triangle at a
   corner and the brush on the next tile, quartered. The modes are Tile, Half, Quarter, Triangle, Room and Erase, with
   Turn 45°; there are two colours for the tile.
6. **Stairs:** an open oak L stair laid up the left wall, a landing in the corner, then along the back wall.
   - The floor above is ghosted, with the hole the stair cut in it dashed in orange.
   - Handles for the foot, the top, the landing's corner and the width.
   - Shapes: straight, L, U, spiral, ladder. The strip has 12 styles; the card has the rail and the sides.
7. **Roof:** the whole house.
   - Auto Roof's three pieces: a hip on the main block, a gable on the wing and a shed on the porch.
   - The hip is selected, with handles on its eaves and its ridge (pitch).
   - A dormer ghost sits on the front slope.
   - The strip has the 9 kinds and 4 materials; the card has pitch, eaves and height sliders.
8. **Windows:** the wing's bay of three joined six-over-sixes is selected, with ↑ ↓ to move it up the wall, side
   handles, and a green pane joining on. Shutters are on the others. The strip has 16 kinds and a width of 1 / 2 / 3
   panes; the card has height and frame colour.
9. **Coverings:** the house in sage lap siding, its west face lit by the Design tool. The strip has 16 of the coverings;
   the card has the colour swatches, any colour on a hue bar, and "Pick up a style".
10. **Pool:** a mosaic pool dug behind the house in a patio of pavers, with coping and a ladder.
    - A ghost stretches it, and its depth handle reads 1.6 m.
    - Depths are 1.2 / 1.6 / 2.2 m or a slope.
    - The pieces are coping, a ladder, steps, a light, a diving board, a slide, a hot tub and a fountain.
11. **Blueprints:** Lot › Blueprints, your own only (F12b): six saved pieces, from a sunroom to the whole house. A
    sunroom ghost goes down green against the house's side, with "Save the selection", Turn and Mirror.

## Built

### Phase 1 · Lots (2026-11-26)

**Shared (`homes.ts`):**
- `HomeLotDef` and the generator's three lots, Pine Meadow's Lots 1–3 (22 × 28 m, x 91–169, z −53 … −25, by the north
  path).
- God mode's `homeLots` section of `GroundsEdits`; `grounds.ts` `HOME_LOTS` / `homeLotsFor` / `homeLotAt`.
- On the land, each lot is a flat pad at its middle's height, eased 1 m out, with no trees on it or within 2–3 m. Its
  sign marks its change.
- `checkEdits` checks lots: their size (12–48 m), not on another lot or a building, not on a road or on anchored ground.
- A claim is **the lot's ground storey**: a floor of the one structure, as plan 112's spaces are.
  - Its space is `home:<key>`, its grid is the lot, and `Floor.claim` holds the owner and roommates.
  - It carries one slab over the whole lot at the land's height, top `g`: the ground. It's walked on and is Jolt's, but
    it's never drawn — no floor, ceiling or mezzanine.
  - On the lot is on its ground storey (`floorAt` through `spaceGroundAt`), so build mode, things and walls are the
    lot's.
- Storeys:
  - `storeyAddOps` adds one up or down, each short, normal or tall (3.0 / 3.5 / 4.5 m). There are 4 over the ground
    and 2 basements at most.
  - `riseTop` puts the next storey over the foundation, the walls and a slab.
  - `storeyRemoveOps` takes away the top storey or the lowest basement only.
- `releaseOps` gives the lot back: its floors go, and their walls and slabs with them. `lotsFix` takes a claimed
  lot's floors out of the world while its lot is gone and puts them back when it returns.
- Who builds: `lotWhy` / `lotRole` — the owner, the roommates, admins.
- `spacesFix` leaves lots alone (it would have taken them away as town spaces with no building).
- `levels.ts`: a space's ground storey is storey 0, with basements under it.
- `homes.test.ts`: 6 tests.

**World server (`features/homes.ts`):**
- Messages:
  - `lot:claim` — one each;
  - `lot:release` — the lot's things dropped, whoever's on it put by its sign;
  - `lot:mate` — someone here added or taken off, 8 at most;
  - `lot:storey` and `lot:storey:remove`;
  - `lot:go`;
  - admins' `lot:assign` and `lot:free`.
- `spaceWhy` asks `lotWhy` on a lot.
- `lotEdgeWhy`: a thing off the lot is refused. A wall off the lot is already refused by the floor's grid.
- `fixSpaces` runs `lotsFix`.
- God mode's publish refuses to take away or move a claimed lot. A publish no longer sends someone on a lot back to
  the arrival point (they aren't in a town building).

**Client:**
- `tp/lots3d.ts`: a free lot is staked out — white dashes and blue-capped corner pegs — with a For Sale sign at its
  front. A claimed lot is staked only while its builder is in build mode.
- By a free lot's sign, the prompt "Lot 1 · free — have a look" (E) opens the **lot card** (`LotCard.tsx`, its own
  chunk):
  - Claim;
  - on mine, roommates (add someone here, take one off), a storey up or a basement down with its height, Go to my lot,
    and Give it back (asked first);
  - for admins, give it to someone or free it.
- Build mode:
  - on someone else's lot it closes with the reason;
  - the floor menu has a storey on top or a basement with its height (3.0 / 3.5 / 4.5 m), and takes away the top
    storey or the lowest basement;
  - Lot › My lot opens the card.
- The ground slab isn't drawn: `drawnFloor` skips top `g` in rings, slabs and decks.
- God mode's **Lots** tool (H; `god/lots.ts`):
  - the panel's size under the pointer, green or red with the reason;
  - a click lays a lot, a drag moves one, Delete removes the picked one;
  - its size, name and neighbourhood set in the panel.

**Checks:**
- `e2e/zz-lots.mts`, as Bia, 12/12: by the sign the prompt and the card; Claim; on the lot is on its ground storey; a
  wall on it; one off it refused; a tall storey up and a short basement down; the picker lists the three; build mode
  stays open; given back, everything gone.
- `zz-lots-god.mts`, as Ana with nothing published: the panel; a lot laid in the draft; one on Lot 2 refused; undone.
- `zz-lots-diag.mts` found the ground slab drawn as a brown mezzanine: fixed.
- Shared tests 932/932 after updating the Grounds fingerprints (`grounds-edits.test.ts` TODAY; `grounds-town.test.ts`
  allows the lots' chunks) and giving tile `g` a footing (snow).

### Phase 2 · Selecting and moving the structure (2026-11-26)

**Shared (`structure/move.ts`):**
- `endMoves`: a wall's end dragged, and every wall joined there follows.
- `pushMoves`: a wall pushed or pulled square to itself, its neighbours' ends with it; a wall carrying on along its own
  line stays.
- `movesWhy` / `movesOp`: the checks (on the floor, not a building's shell, long enough, still long enough for what's set
  in it), then one `walls` operation that keeps the ids.
- `roomsFollow`: a room's corners move with its walls, so a room pushed out grows.
- `roomPieces`: a room's own walls, the walls it shares (another room on their other side), its slabs and its roofs.
- `roomMoveOps`: a room moved, turned by quarters about its middle, or copied.
  - Its own walls go with it. A shared wall stays for the room next door, and the moved room takes a copy.
  - Its floors and roofs go with it (a turned gable's ridge with it), and its outline and rect follow.
  - A copy gets new ids and "(copy)" on its name.
- `roomRemoveOps`: the room, its own walls, floors and roofs. Shared walls stay.
- `move.test.ts`: 6 tests.

**World server (`features/house.ts`):**
- `struct:wallmove` (push or end): checked, rooms follow, splits found, lock checks.
- `struct:room` (move, turn, copy, remove): the things in the room go with it. Free things turn with it
  (`placeFree`); others go by their corner. Doors and windows in its own walls go with their walls; a copy's are copied
  into the copied walls.
- Both messages are in `STEP_LABELS` and the building edits, so each is **one undo step**, things included.

**Client:**
- `world/build/house.ts` `HouseTools`, in Walls › Select:
  - the picked wall's ends dragged, snapped to the grid;
  - the wall's body dragged to push it, with its neighbours as ghosts;
  - a click on a room's floor picks the room (its outline lit) and dragging its floor moves it, Alt copies, R turns it,
    Delete knocks it down (asked).
- The card (`BuildTab.tsx` `RoomCard`): the room's name and size, Turn, Copy (beside it), Knock down, and the hint.

**Checks:**
- `e2e/zz-house.mts`, as Bia on Lot 1, 9/9: a room drawn and found; picked by a click on its floor; dragged 6 m with
  the tool's own down / hover / up; turned (5 × 4 → 4 × 5); copied beside it; a wall pushed out a metre so the room
  grows (that failed first — rooms didn't follow: `roomsFollow`); undone; the copy knocked down.

### Phase 3 · Fences, rails, columns, trims (2026-11-26)

**Wall styles** (`structure/edit.ts` `WALL_STYLES`):
- picket, iron, ranch, lattice, hedge, stone wall, porch rail, glass rail, iron rail, spandrel, gate.
- Each is a `Wall` with a `style`, drawn with Line, Arc and Box like any wall, at its own height and thickness. A
  spandrel hangs under the ceiling (`styleShape`).
- A styled wall closes no room (`faces.ts`), takes no paint, door or window, and keeps its height. Jolt makes it solid
  as its box, except a gate, which you walk through.
- Drawn as itself by `tp/fences3d.ts` (posts, rails, pickets, bars, boards, glass, a hedge's bulk, a stone cap,
  spindles), into the walls' lit buffers. It goes to its own list in `walls3d.ts`, so the walls' own drawing never
  sees it.

**Trims** (`Wall.trim`): skirting, a chair rail, crown moulding and a frieze, on any plain wall's two faces. Set in
the wall inspector's toggles (`wallsSet` takes `trim`) and drawn by `fences3d.ts`.

**Columns:** 11 new kinds in `fam/house.ts`, shared and client:
- porch column and square post (3 paints each);
- the Tuscan, Doric and Ionic orders;
- log post, brick pier, stone pier, steel pole, pergola post, newel post.

They're a storey high. The Build tab has a **Columns** part (the old column moved there). There are 13 columns with
the old one's two looks.

**Lots moved off the trail:** the still showed the clearing trail running through Lot 1. The lots are now Lot 1
x 119–141 and Lot 2 x 147–169 (both z −53 … −25), and Lot 3 x 119–141, z −19 … 9. The land fingerprint was updated.

**Checks:** `zz-house.mts` phase 3, 5/5: nine styles drawn; no room closed by a fence; the spandrel under the ceiling;
a wall trimmed; three columns down. Still: `p3-fences` in the scratchpad.

### Phase 4 · The tile brush and the hole tool (2026-11-26)

- **A generic layer operation** (`ops.ts` `op: "layer"`, `Structure.layers[name][floor]`): applied, inverted, diffed,
  and dropped with its floor. Tile paint uses it; foundations and pools will too.
- **`structure/tiles.ts`:**
  - each tile is cut into 8 triangles round its middle;
  - `brushMask` picks a tile, a half (the side nearest), a quarter (the corner's square) or a triangle (a diagonal's
    half);
  - `painted`, `tilesWhy` (only over a real floor — a lot's ground isn't one), `tilesIn` (a room's, the storey's).
- **Server** `struct:tiles` (cells, a room, or the storey; `mat` null takes paint off) and `struct:hole` (a box cut
  out of the slabs it overlaps, at the working height). Both are one undo step.
- **Drawing:** the painted tiles join the floor's slab pieces in `drawnFloor`, drawn last so they're on top. A part is
  flagged so the floor's texture keeps its slab's. The bake now takes the last-drawn slab (as it paints them). Floor
  signatures include the tiles, so a stroke re-bakes.
- **Build mode, Floors:** Tile, Half, Quarter, Triangle and Hole. A drag paints a stroke; Shift paints a room,
  Ctrl+Shift the storey, and ⌘/Ctrl takes paint off. Hole drags a half-metre box.
- **Checks:** `zz-house.mts` phase 4, 5/5: a chessboard; a half tile; no paint off the floor; a hole cut and undone.
  Still: `p4-tiles`.
- Decks and porches outside go with the foundations (phase 5).

### Phase 5 · Foundations and basements (2026-11-26)

**The model** (`structure/found.ts`):
- The ground storey's own height (`Floor.z`) is its foundation's top, with `Floor.found` the foundation's height
  (0.25–1.5 m). The house's floors, walls and things stand on it as on any floor.
- The yard round it is the land, `found` lower:
  - a wall put there stands on the land (`wallsEdit` asks `overAt`);
  - so does a thing (`props.over` negative, set by the server's `putObject`). The client draws it lowered and Jolt
    makes it there.
- The lot's ground slab stays at the land's height. It counts as its floor (`query.ts` index, `slabsOf`), and `floorAt`
  lets the yard count as the lot's ground storey down to `found` under it.
- Pads are a layer, `found`: boxes in six styles (fieldstone, brick, concrete, stucco, logs, a deck on posts).
  - `padOps` lays one with a floor on it (concrete, a deck's wood) and raises the house — every storey over the ground,
    its walls, slabs and roofs, but not the lot's ground or the yard's walls — when the height is new.
  - `foundHeightOps` changes the height. `padRemoveOps` takes one off; the last one brings the house down.
- Basements are a layer, `dig`: `digOps` digs a box under the ground storey. Each basement storey gets a concrete floor
  there and four thick walls round it, and the ground storey gets a floor over it (the lid) if it has none.
- **The land's holes** (`landHolesOf`, a registry): the dug boxes, and pools later.
  - In Jolt, `landOf` makes NaN samples there and `setLand` turns them into the heightfield's holes. The server's and
    the client's physics rebuild the chunks when the holes change.
  - In the drawing, `tp/land-holes.ts` makes the land's shader discard inside them (up to 16, their uniforms set on
    every structure change).
- Pad solids from the land up to the floor (not a deck's); the pads drawn under the floor in their style
  (`fences3d.ts` `drawPads`).
- Undo now gives back a lot's storeys as they were (their heights, their foundation) while they're there still
  (`history.ts`).

**Build mode — the Foundation part:**
- Lay (drag a box), Take away (click a pad), Steps (by the edge clicked near: a flight from the land up to the floor;
  flights go down to 0.2 m now), and Dig a basement (drag a box).
- The six styles as tiles; the height 0.25 / 0.5 / 0.75 / 1 / 1.5 m. With a foundation there already, the height
  raises or lowers the house.

**Checks:** `zz-house.mts` phase 5, 8/8:
- the house up 0.75 m on a stone foundation, its walls with it, the yard's fence on the land still;
- a yard bench on the land;
- steps up to it (rise 0.75, on the land);
- standing in the yard counts as the lot's storey;
- a basement dug with its walls and floor.

Found on the way and fixed:
- walls on a new pad weren't raised (the pad wasn't counted yet);
- the yard's land didn't count as the floor for placing things or for `floorAt` (the land's heightfield answered
  first).

Still: `p5-foundation`.

### Phase 6 · Stairs, one tool (2026-11-26)

**Shared** (`structure/flights.ts`, a floor's `flights` layer):
- A stair is its foot (its middle), the way it climbs, its shape, an L's or a U's turn, its width (0.8 / 1.0 / 1.3 m),
  how high it climbs, its look (oak open, white closed, iron, glass and oak, rustic, concrete) and its rail
  (balusters, glass, iron, none).
- Shapes: straight; L (a square landing, then a quarter round); U (a landing across, then back beside itself); spiral
  (wedges round a pole); ship's ladder (0.25 m risers, 0.14 m treads, strings).
- `flightBoxes` gives its treads, risers, landings, strings and pole, the same for the drawing and for Jolt. Risers are
  under 20 cm (`stepsOf`).
- `flightAddOps`: up a whole storey, the floor over it gets a hole the stair's size and rails round it (styled `rail`
  walls, `rail-<id>-n`), but not on the side it comes up at. `flightRemoveOps` takes all of that away again.
- `flights.test.ts`: 4 tests.

**Physics:** treads and landings are stood on under the stair's own key `flight:`, which `slabsOf` counts for every
floor it joins (as a staircase's treads count). Without that, the walker going up was put "outdoors" past the lower
floor's band. Strings and the pole are solid.

**Server** `struct:flight` (add, remove): up to the storey over it unless it's told how high; one undo step.

**Drawing** (`fences3d.ts` `drawFlight`): treads and landings in the look's wood or stone, white risers and strings,
balusters and a handrail along both sides, glass panes for a glass rail. Each stair is its own mesh.

**Build mode — the Stairs part** (`flighttool.ts`): the five shapes and six looks as tiles; width and rail in the card.
The footprint follows the pointer on the half metre; R turns it, T turns an L or a U the other way, a click builds,
⌘/Ctrl-click takes one away.

**Fixed on the way:** a storey added over a foundation stood 0.75 m too high (`riseTop` counted the foundation twice).

**Checks:** `zz-house.mts` phase 6, 4/4: stairs built; a hole over them upstairs; railed round but where they come up;
**walked up them** to the storey over (feet 0 → 1.3 → the upper floor's level).

Still to check: from upstairs, my own still doesn't show the stair in its hole, though its mesh is in the scene and
visible (`zz-house-diag2.mts`). It may be the still's own render catching the view's per-frame culling; to look at in
a real frame at the checks (phase 14).

### Phase 7 · Roofs (2026-11-26)

**Shared** (`structure/roof.ts`):
- Six new kinds, each drawn over a rectangle turned any way:
  - shed: one slope, its high wall and ends carried up;
  - half-hip: a gable with little hips clipping its tops;
  - mansard: steep 70° sides to a low flat top;
  - gambrel: a barn's, 62° to a knee, then the pitch;
  - Dutch gable: a hip to a ledge, a little gable on it;
  - round: a barrel of 12 facets, its ends the arc.
- Two pieces that sit on a roof:
  - a dormer: a box out of the slope, its own gable, a window in front, facing the nearer eave;
  - a chimney: a brick stack from the slope's lowest corner to 0.9 m past the ridge, with a cap.
- Every roof gets `over` (its overhang, 0–1.5 m) and `mat`, one of 8 coverings: slate, clay, cedar, mossy, metal,
  thatch, tar and copper.
- `roofHeightAt` gives the top of a roof over a point.
- `onRoofDraft` puts a dormer or a chimney where the pointer is.
- Auto Roof (`autoRoofRects` / `autoRoofDrafts`):
  - the floor's rooms are rasterised at 0.5 m and cut greedily into maximal rectangles, overlapping where the
    outline turns, so an L gets two crossing roofs and they meet in valleys;
  - each rectangle's eaves sit at the top of the walls inside it.
  - It isn't a straight skeleton. Overlapping roofs cross through each other rather than being cut along the
    valley. That reads right for L, T and U plans; odd outlines get more rectangles (24 at most).
- `roofSetOps` changes a roof in place (kind, pitch, overhang, covering, eaves' height, ridge) and keeps its id.
- `reseat`: every edit sits dormers and chimneys down again on whatever roof is under them now.
- `roof.test.ts`: 9 tests.

**Server** `struct:roofs`:
- the new kinds and fields are accepted;
- `set` changes a roof in place;
- `auto` remakes the floor's roofs over its rooms and keeps its dormers and chimneys;
- each is one undo step.

**Physics:** chimneys are solid boxes; dormers make no lid of their own (their roof's lid is there).

**Drawing** (`tp/build.ts` `buildRoofs`):
- The coverings come from the library: slate or shingles or metal, tinted per covering.
- Dormer glass and chimney brick are parts of their own.
- Faces with more than four corners are fanned in their own plane (the ends of a gambrel or a round roof).
- A dormer or chimney hides with the roof it sits on while you're under that roof.

**Build mode, the Roof part:**
- 11 kinds and 8 coverings as tiles, each kind with its silhouette;
- pitch and overhang in the bar, plus an **Auto Roof** button;
- a click roofs the room under the pointer, or puts a dormer or chimney on the roof there;
- **Shift-click changes the roof under the pointer to the current choices**, which is how you edit a roof in place;
- R turns the ridge; ⌘/Ctrl-click takes one off.
- There are no dragged handles yet: pitch and overhang are set in the bar, and the eaves' height only by message.

**Checks** (`zz-house.mts` phase 7, 14/14):
- an L of walls upstairs, and Auto Roof made two crossing clay gables at the walls' top;
- a dormer and a chimney went on, the chimney past the ridge;
- the big roof was made each kind in place, its id kept;
- the Roof part's own Auto Roof button made metal hips and kept the dormer and the chimney.

Stills: `p7-auto`, `p7-gambrel` (the dormer re-seated on it), `p7-mansard`, `p7-round`, `p7-halfhip`, `p7-hips`.

### Phase 8 · Doors and windows (2026-11-26)

**Shared** (`openings.ts`, `structure/free-openings.ts`):
- A door or window in a wall drawn free has its own size:
  - `props.ow`: width, doors 0.7–2.6 m, windows 0.4–4 m;
  - `props.oh`: height, doors 1.9–2.8 m, windows 0.3–2.6 m;
  - `props.sill`: a window's sill, 0–2.4 m.
- `openingSpanOf` / `openingCutOf` read those. The hole, the physics (`structure-solids` `cutsOf`), the wall
  drawing's keys and the drawing all go through them. Openings on the tile lines keep the catalog's size.
- `openingSizeWhy` refuses widths, heights and sills out of range, a sill on a door, a look a kind doesn't come in,
  and shutters or curtains that aren't a colour (or on a door).
- `freeOpeningWhy` now checks the object itself (its kind and props), so the wall's top and the neighbours are
  checked at the opening's own size.
- **A home lot's walls take free openings even on the tile lines.** Before this, a wall drawn on whole metres took
  only the tile tool's fixed-size openings, so no size ever reached a house. The wall drawing already draws such a
  wall free round a hole (`walls3d` `holed`).
- Windows join: one may start where another ends.
- `openingOutside` gives the face that is out of doors (a room on the wall's left or not). The server stores it as
  `props.out` when a window goes in, and the hand's preview sets it too.

**Server:** `obj:put` checks and places a free opening with its own props; `cleanProps` rounds the sizes to the cm.

**Drawing** (`furn/openings.ts`):
- The hole comes from `L.z0`/`L.z1`, at the opening's own width (`openingInto` with `openingSpanOf`).
- 10 door leaves (`DOOR_LOOKS`): panelled, six-panel, flush, glazed, half glass, French, plank (ledged and braced),
  Dutch (split with a shelf), Craftsman (stepped lights, a dentil shelf), modern (a glass slot and a bar pull).
- 10 window glazings (`WINDOW_LOOKS`): casement, colonial grid (bars every ~30 cm), double-hung (two sashes, a
  meeting rail), picture, transom, awning, louvre, leaded diamond, prairie and slider.
- A wide window gets a mullion every metre or so.
- Shutters are louvred, on the outdoor face. Curtains hang from a brass rod on the room's face, drawn back as two
  folded drapes.

**Build mode:**
- The held card and the picked card get the opening's options (`OpeningOptions.tsx`): width, height, sill, look,
  shutters and curtains (the fabric colours, or none).
- PgUp / PgDn slide a window up and down the wall, the one in hand or the one picked.
- The catalog gains **20 doors** (30 in all) and **26 windows** (35 in all). They are named presets of a kind with
  a look, a size, shutters or curtains: patio doors, cottage door, Dutch door, ribbon window, clerestory,
  floor-to-ceiling glass, kitchen and bathroom windows, and so on.

**Checks** (`zz-house.mts` phase 8):
- on the L's front wall: a 1.5 × 1.2 m colonial with shutters from a 0.9 m sill, a second window joined to it, a
  4 m ribbon with curtains; French patio doors 2.4 × 2.45 m on its end;
- too wide and over the wall's top are refused;
- each hole is its own size, and the joined one starts where the other ends;
- slid up to a 1.1 m sill; its shutters out of doors (`out −1`);
- the held window's card shows, and PgUp slid it up 0.1 m.
- 56 checks in the whole probe pass.

Stills: `p8-front` (shutters outside), `p8-inside` (curtains inside), `p8-patio` (the French doors).

Not done: the plan's sketch had windows joining into one frame. Here joined windows are two frames side by side,
and a wide window draws its own mullions.

### Phase 9 · Coverings (2026-11-26)

**Shared** (`structure/coverings.ts`):
- **61 wall coverings:**
  - paint in 12 colours;
  - striped wallpaper (6) and damask (6);
  - brick (4);
  - clapboard (6), shingles (4), board and batten (4);
  - stucco (4), fieldstone (3), limestone (2);
  - panelling (4), wall tile (5), corrugated metal.
- **50 floor coverings:**
  - oak (6) and walnut (3);
  - carpet (10);
  - tile (8) and small tile (4);
  - flagstone (3), limestone and travertine (3);
  - brick pavers (3), decking (3), planks (3);
  - cork, brushed metal, checker plate and corrugated.
- Each is a material of the life look's own library (the CC0 photo textures already in the game: no new downloads)
  and a tint.
- A covering's key is `cov:<id>` or `cov:<id>#rrggbb` (a tint of one's own).
- `coverOf` / `isCover` / `coverKey` read and make those keys.
- `Wall.coverF` / `coverB` hold a face's covering over its paint. `wallsPaint` lays one by the stretch or the room,
  and a paint takes it off that face.
- A floor tile (the phase 4 tiles layer) takes a covering key. `tilesWhy` accepts coverings and refuses anything
  that isn't one.
- `coverings.test.ts`: 3 tests.
- Roof coverings go to the plan's 12: blue slate, red and black shingle, and sandstone tile join the 8.

**Drawing:**
- A wall with a covered face is drawn free (walls3d), each face its own.
- `nativeWall` draws plain plaster under a covering and lays the covering over the face between the skirting and the
  cap, in the library material at its tint. A foam wall's wedges or a brick's courses would otherwise show through.
- Floors: the bake paints a covering's tint flat, and the chunk's library groups draw its material
  (`floorLib`: a char's or a covering's, with its UV scale).

**Build mode:**
- Paint and Floors scroll their tiles in two rows: the paints or floors, then every covering with a chip of its
  pattern.
- A tint row: "its own" or 13 colours. Changing the tint re-keys the covering that's picked.
- A floor covering switches the Floors part to the tile brush.
- **Alt-click is the eyedropper:** on a wall face in Paint, on a tile with the tile brush.
- Ghosts and the face's label show the covering's colour and name.

**Checks** (`zz-house.mts` phase 9):
- the L's front wall in blue clapboard outside and sage damask inside;
- the end wall in brick with a tint of its own;
- the upstairs floor in honey oak with a terracotta tile hearth;
- a key that isn't a covering is refused.

Stills: `p9-outside`, `p9-inside`, `p9-floor`, `p9-end`.

Not done:
- New CC0 textures (the plan's F8a meant fetching more). Every covering here is drawn from the library already in the
  game, so `sources.json` needs no new entries.
- Fetching more (a parquet, a herringbone, a terrazzo, a wallpaper or two) would need your OK to download.

### Phase 10 · More pieces (2026-11-26)

**24 new kinds** in the house family (shared `fam/house.ts` for entries and solids, client `furn/fam/house.ts` for
models), all in code (F9a's ornate Blender pieces are still to make):
- **8 fireplaces:**
  - brick, stone, marble mantel, rustic hearth (log mantel) and tiled (a Victorian insert), each with a breast, a
    firebox, a hearth and a mantel shelf;
  - a linear modern one;
  - a cast-iron wood stove with its flue to the ceiling;
  - a corner kiva.
  - Each is lit by its fire (on and off as a lamp), its flames glowing.
- **10 porch and yard structures:**
  - pergolas: cedar, white, louvred;
  - a porch roof (a shed roof on two posts);
  - a gazebo (8 posts, its rail open at the way in), a pavilion (a hip roof on 4 posts);
  - a garden arbor (an arch, leaves), a carport, a trellis with a climber, a lattice screen.
  - Their solids are their posts; you walk under their roofs.
- **3 awnings and hoods, hung on the wall:** a striped awning (3 colours), a metal awning, a door hood on brackets.
- **3 door details:** house numbers (3 looks), a porch lantern (lit) and a wall mailbox (3 colours).

**Placing:** out-of-doors pieces may stand on a home lot's ground. The tile rule had refused outdoor things on any
floor tile, and the lot's ground is one (`build.ts` `canPlace`).

**Build mode:**
- a new **Porches & yard** part holds the yard pieces, awnings and details;
- the fireplaces are in Decor beside the old one;
- the Columns part keeps the columns.

**Checks** (`zz-house.mts` phase 10): a stone fireplace upstairs against the front wall; a cedar pergola and a
gazebo in the yard. Stills: `p10-fireplace`, `p10-yard`.

Not done: a fireplace doesn't put its chimney up by itself. Phase 7's chimney goes on the roof over it.

### Phase 11 · Pools (2026-11-26)

**Shared** (`structure/pools.ts`, a lot ground storey's `pools` layer):
- A pool is a box (half metres, 2–12 by 2–20 m) with:
  - depth: 1.0, 1.4, 1.8 or 2.4 m;
  - tiles: blue, teal, white, black or mosaic;
  - coping: stone, brick, concrete or wood;
  - a ladder on a side (or none);
  - lights.
- `poolAddOps` refuses it off the lot, over the house (its foundation, a basement, a floor slab), on another pool, or
  with a wall in the way (a hedge, as the check found). `poolRemoveOps` fills it in.
- The water's registry: `setPoolWater` is filled by `setLandHoles`, so it's live on the server and the client
  alike. `poolWaterAt` gives the surface 15 cm under the land and the bed, in world metres.
- The land is holed over a pool (`landHolesOf` already took `pools`).

**Physics:**
- The pool's floor is stood on under the key `pool:<level>:`, which `slabsOf` counts as the yard's. The search
  reaches down into the pool.
- Its four walls are solid.
- **The lot's ground slab (`g`) is cut open over a pool.** It's a deck under a floor raised on a foundation, and it
  had held the walker at the land's height over the water.

**Swimming:** the walker asks a lot storey's pools for its water (`poolFloors`, `poolWaterAt` in that storey's own
heights), so plan 66's wade, swim and dive work in them. The Grounds' level 0 keeps its pond and river.

**Server:** `struct:pool` (add, remove), one undo step ("dug a pool").

**Drawing** (`fences3d` `drawPool`, each pool its own wall part):
- a tiled basin, a darker band at the waterline and a lane line;
- the coping round it;
- the water as a clear sheet;
- a steel ladder;
- glowing lamps under the water in its long walls.

**Fixed on the way:** **a floor's layout signature now holds its house layers** (tiles, pads, stairs, pools;
`query.ts` `floorSig`). A pool changes only its layer, so the floor never redrew it. The same gap may be behind the
stair seen through its hole from upstairs (phase 6's open question).

**Build mode:** the Foundation part gains a **Pool** mode:
- a box dragged digs it;
- its tiles are the part's tiles;
- the card holds depth, coping, ladder side and lights;
- Remove fills a pool in when one is clicked.

**Checks** (`zz-house.mts` phase 11):
- down in the yard, a 7 × 2.6 m pool 1.4 m deep dug, and one over the house refused;
- its water 15 cm under the land, 1.25 m deep;
- the land holed over it;
- **Bia teleported into it wades** (swim state on, feet on its floor at 1.4 m down).

Stills: `p11-pool`, `p11-pool-low`, `p11-pool-top`, `p11-swim`.

### Phase 12 · Blueprints (2026-11-26)

F12b: your own saves only, no starter houses.

**Shared** (`blueprints.ts`):
- `blueprintOf` captures a lot's house, measured from the lot's corner:
  - each storey by number with its rise (short, normal or tall);
  - its walls (wall heights from the storey's floor), slabs (not the lot's ground) and roofs;
  - the house layers (painted tiles, the foundation's pads, the stairs, the pools, a basement's dig);
  - the foundation's height;
  - its things, with their storey.
- `blueprintWhy`: only on an empty lot (its ground storey alone, nothing on it) that's big enough.
- `blueprintBuild` makes one diff:
  - the storeys added (up, then down);
  - the foundation raised (the storeys over the land lifted, the ground storey's `found` set);
  - every wall, slab, roof, stair and pool a new id;
  - a stair's rails keep its new name (`rail-<flight>-<n>`);
  - a door's or window's wall followed to its new id.
- `blueprints.test.ts`: a house on Lot 1 built again on Lot 2 where it stood on the lot. Its tall storey, walls and
  painted tile came across, the door went on its wall's new id, and a second build is refused.

**API** (`apps/api`):
- the `house_blueprints` table (migrated) and the `HouseBlueprint` model, 24 a person, 400 KB of JSON at most;
- `GET` / `POST /api/blueprints`, `DELETE /api/blueprints/{id}`, each a person's own (`WorldController`).
- Tried as Bia with curl: save, list, delete.

**Server:** `lot:blueprint` (the owner or a roommate) builds it on their empty lot:
- the structure diff is applied;
- its things go in when they're buildable, a door or window placed on its wall again.

**Build mode:** the Lot tab's new **Blueprints** part:
- name the house and **Save this house**;
- the list shows each one's storeys and things, with **Build here** and **Delete**.

**Checks** (`zz-house.mts` phase 12):
- the probe's house saved through the API (3 storeys, 12 things, 7.7 KB);
- Lot 1 given back and Lot 2 claimed;
- the blueprint built there: 3 storeys, 26 of 26 walls, 12 of 12 things, its pool.

Stills: `p12-built` (the whole house on Lot 2), `p12-live`.

Not done:
- The ghost before building (the plan's "placed with the ghost"). It builds where it stood on its lot, since lots
  are all one size today.
- Room names aren't kept: rooms are found again from the walls.
- Building a blueprint isn't one undo step: the lot's storeys come off from the Lot card.

### Phase 13 · Cost (2026-11-26)

**The page budget** (production build, `tools/budget.mjs`; HEAD built in its own worktree for a baseline):
- HEAD is 504.7 KB. With the house build it measured **622.5 KB**.
- The split bug: `tp/land-holes.ts` took three's `Vector4` onto the page through the controller, bringing three's
  core with it (100 KB). The holes are now a flat `Float32Array` (three takes a vec4 array so), so the module
  imports only three's types.
- Blueprints were moved out of the shared root barrel to their own export, `@yutopia/shared/blueprints` (the
  panel and the server load them).
- The page is now **520.6 KB** (+15.9 over HEAD): the new kinds' catalog entries and solids, the roofs' kinds, the
  pools', stairs' and foundations' solids the physics reads, and the coverings the floor bake draws.
- Budget raised to 522 under your standing call, with a note.
- The build chunk is 47.5 → **68.4 KB**: the house tools, the roof part, the opening options, the blueprints
  panel and the presets. Budget raised to 70. The God chunk is 36.6 of 37.

**Draw calls:** a roof was a mesh and an ink line per face, ~50 draw calls for the probe's house. Its faces are now
merged by material (a mesh each) with one ink outline a roof, ~8. Hiding the roof over you still works roof by
roof.

**An edit's cost** (`zz-house.mts` phase 13; the longest frame in the 1.5 s after each edit, on the rebuilt house;
the measure sees a 150 ms block as 150):
- a roof made a gambrel: 50 ms;
- a wall covered: 33 ms;
- tiles painted, a pool dug, Auto Roof: within a frame (17 ms).
- No edit froze the page.

**Fixed on the way:**
- The client's `shapes.test.ts` (each kind's solid against its drawing) had the phase 3 columns and the new pieces
  out.
  - The awnings', hood's and lantern's solids now fit their drawings, with their hang heights.
  - The lattice screen's and the hood's drawings were trimmed inside their frames.
  - The pieces whose solid sits inside the drawing are on its `SOFT` list: a capital, a hearth walked onto, a
    stove's flue, the yard's roofs walked under.

Light: the fireplaces and the porch lantern light through the catalog's `light`, as every lamp does. The yard's
structures stand out of doors, so there's nothing new for the light volume to occlude.

### Phase 14 · Checks (2026-11-26)

- **The house probe** (`apps/client/e2e/zz-house.mts`, as Bia, the dev world, Metal flags): a whole house built
  from a bare lot, phase by phase, **74 checks**:
  - lots, rooms moved, fences, the tile brush, foundation and basement, stairs walked up;
  - roofs of every kind, sized and dressed windows, coverings, the new pieces;
  - a pool waded in;
  - the house saved as a blueprint and built again on Lot 2;
  - an edit's cost.
- Stills of each phase are kept in `design/house-build/built/`.
- **Unit tests:** shared 954 of 954; the client's next to the change (walls3d, relayout, campus-outline,
  land-pool, native, buildpick, below-cull, shapes, light, light-volume) all pass.
- **Build specs** (YUTOPIA_GPU=1, one worker): build-tools, wall-building, doors-windows, wall-faces, build,
  build-hand, build-tops and build-setups. 10 passed, 5 skipped (the opt-in shots), 1 red.
  - The red, `build-tools`, was mine: the tile brush's mode was labelled "Tile", the same name as the Floors part's
    tile floor.
  - Renamed "Whole tile", it passes.
- `floors.spec` was left out: it overwrites the dev world.
- Not run: a memcheck over a long build.

### The quality pass (2026-11-26)

Asked: "improve quality of all". Scope: polish what's built and finish what was left. The user also caught a floor
standing upstairs with no walls under it ("is that permitted on The Sims?" — it isn't).

**Nothing floats** (shared `structure/support.ts`, The Sims' rule):
- On a home lot's storey over another, a floor or a wall stands only over something on the storey under it:
  inside one of its rooms, or within 2 m (the overhang) of one of its walls (not a fence's) or its columns.
- A foundation alone holds nothing up.
- The other way: a wall, a room or a column that holds up the storey over it stays.
- Checked on the server for walls drawn, floors laid, walls pushed, rooms moved or knocked down, and columns taken
  away. The draw tools show it before the click: a red ghost and the reason.
- `support.test.ts`: refused over nothing, held over a room, a 2 m balcony but not 3 m, columns holding it, a
  supporting wall kept.

**CC0 photo textures** (downloaded with the user's OK, all 15 from ambientCG):
- Kept in `yutopia-art-src/textures/ambientcg/`. `tools/art/life/photo-materials.mts` makes the library's three
  maps (albedo, AO-roughness-metal, OpenGL normal) at 512 px and half, KTX2 by basisu.
- 15 new library materials, marked `photo` (the painted generator skips them): herringbone, light and dark parquet,
  two terrazzos, two marbles, a hex mosaic, slate and dark-tile roofs, polished concrete, three woodchip/worn papers,
  hex pavers.
- New coverings on them:
  - walls: woodchip in six paints and fine woodchip, worn paper, marble, veined marble, hex mosaic, green mosaic,
    concrete, terrazzo;
  - floors: herringbone ×3, parquet ×2, terrazzo ×2, marble ×3, hex mosaic ×2, polished concrete, hex pavers.
- Roofs: slate (and blue slate) now the slate photograph; tar the dark-tile one. ambientCG's "clay" set turned out to
  be a dark grey tile, so clay stays the painted shingle, tinted.
- The library's budget test was raised under the standing call: 8.5 MB to download (7.8 measured), 72 MB GPU if all
  were drawn at once. Each material loads only when drawn.

**Roofs:**
- A gable end now wears the face of the wall under it, its covering or its paint (it was always plaster).
- A dormer takes its roof's covering, and follows it when the roof changes.
- **Fixed:** a chimney's top was passed in world height while its foot was floor-relative, so on an upper storey it
  stood a storey too tall.
- **Picking a roof** (Alt-click in the Roof part) opens its card:
  - pitch, overhang and eaves height on sliders, live;
  - the bar's kind and covering put on with a button;
  - keys while it's picked: `[` / `]` pitch, PgUp/PgDn eaves, `,` / `.` overhang, Esc lets go;
  - its outline stays shown.
  - These stand in for 3D drag handles.

**Windows joined in one frame:** two free windows touching on a wall, at the same sill and height, drop the linings,
casings, sills' ends and shutters between them and share one mullion. They're drawn again when a neighbour comes or
goes (the joins are in the window's key).

**Blueprints:** **Preview** shows the house's ground-storey walls and its upper floors as ghosts on your lot (red if
it won't go). **Build here** and **Cancel** follow.

**Ornate pieces in Blender** (F9a; `tools/art/house/ornate.py` → `public/life/house/ornate.glb`, 109 KB, meshopt):
- a Victorian fireplace: marble, fluted pilasters, corbels with volutes, a frieze with an oval medallion, a garland
  and rosettes, an ogee shelf, a cast-iron arched insert with a fan grille, tiled slips, a grate and logs, lit;
- a Corinthian column: fluted, two rows of eight acanthus leaves flaring off the bell, four volutes on stalks, a
  concave abacus. It holds up a storey like the other columns.
- a porch bracket: a scrolled corbel with a ring, a scroll and a drop;
- a balustrade: eight turned balusters, a moulded handrail, newel posts with ball finials.
- `furn/ornate.ts` loads the GLB the first time one is on a floor. The kinds draw a code stand-in till then, and the
  floor redraws them when it's in (their look key says which).

**Fixed on the way:**
- The fireplaces' flames were behind their fireboxes; they're in front now.
- The probe's house is built the way the rule wants: a ground-floor room under the upstairs (phase 3's fences ran
  along the pad's front, so the room stands half a metre in).

**Checks:**
- `zz-house.mts` 77 checks, all passing. New ones:
  - a floor over a bare foundation refused;
  - the windows joined;
  - a picked roof changed from its card;
  - photo coverings on the floor, a wall and the roofs;
  - the ornate pieces placed.
- Shared 955/955.
- Client walls3d, relayout, native, shapes, shop and the texture budget all pass.
- Build specs (build-tools, wall-building, doors-windows, wall-faces, build): 8 passed, 4 skipped.
- Budgets: the world page 521.7 KB ≤ 522; the build chunk 70.0 KB, its budget raised to 74 under the standing call.

Stills: `q-front`, `q-roof`, `q-inside` (herringbone, the fire), `q-ornate` (the Corinthian column, the balustrade).

### The flicker pass (11-26)

The user saw foundations flicker; every new piece was checked for faces drawn in the same place.

- Foundation pads: library materials (brick, fieldstone, concrete, stucco, bark), the body 8 mm out, a limestone/oak/concrete cap from 7 cm under the floor to 4 mm under it, set 3 cm in from the floor's edge.
- Fences: picket rails, iron bars, lattice posts, rail tops and glass-rail posts moved off each other's faces; crown trim tops 4–8 mm under the wall top.
- Doors and windows: the flush plate gone, craftsman/modern glass ±6 mm, the Dutch shelf off the leaf's top, frames and sills joined.
- The tiled fireplace's slips moved off its face, the flames forward; the ornate pieces offset.
- Roofs: overlapping Auto Roof rects 2 cm apart, roof groups 4 mm apart.
- Fences and trims are now part of the floor's redraw key (view.ts freeSig): before it a fence added didn't draw until something else changed the floor.

Probe: `e2e/zz-flicker.mts` (a free lot, as Bia; stills of the pad, the fences live, doors, the fireplace, an L with Auto Roof hips; releases the lot).

### A foundation off the whole metre (11-26)

The user's 12.5 m foundation showed its cap along one side: the floor was drawn by whole metre squares, a square in only if its middle was, so the last half metre had no floor. Now a square a slab's edge crosses off the whole metre is drawn as the slab clipped to it (build.ts `cutCells`, a test in relayout.test.ts). The open-sky map (light3d.ts) and the floor's shade (floors.ts aoCanvas) read such a square by its quarter points, so its half gets the sun and the snow like the rest. Probe: `e2e/zz-halfpad.mts`.

### Lots refused only at Publish (11-26)

The user's draft had a lot (x 39–69, z −34…−4) with its corner 6 m into the campus; Publish refused it with no reason, and God mode had shown it green. Now one check, `lotGroundWhy` (grounds.ts): any of the lot on fixed ground (by rectangle, not three points), past the edge, or on a way — with why. God mode's ghost and the publish check both use it. The draft had two "Lot 6": the panel's name box kept a picked lot's name after it was unpicked, and the next lot laid took it; unpicking now clears it. Test in grounds-buildings.test.ts.

### Lots each: no limit (11-26)

The user changed F1a's "one lot each": a person claims as many free lots as they like (asked, "No limit"). `lotsOf` (homes.ts) lists them; `lotOf` is the first. The server no longer refuses a second claim, an admin giving someone a lot no longer frees their other one, and "Go to my lot" goes to the lot whose card it's pressed on. Freeing someone's lot was already there: an admin opens the lot's card (by its sign) and presses Free it. Test in homes.test.ts; checked live as Bia (two lots claimed, gone to the second, both given back — `e2e/zz-twolots.mts`).

### Freeing a lot from God mode (11-26)

Publish refused taking Lot 1 away: "someone's" — it was Ana's own (the user's), claimed in testing. The message now names the owner and where to free it. God mode's lot panel shows **Free it** on a claimed lot (asks first: the owner loses it and everything on it goes — the same `lot:free` as the lot card's), and **Take it away** on a claimed lot is refused with a toast when clicked, not only at Publish. Not clicked through live: God mode needs Ana, the user's account.

### Steps, ceilings, storeys (11-26)

The user: steps up onto a foundation were missing; roofs and a second storey weren't intuitive; with only a roof, inside, you saw the sky. Asked which UX changes; all four chosen.

- **Steps at doors** (`structure/steps.ts doorSteps`): every door out of a house on a foundation gets a flight of solid steps from the yard's land up to the pad's edge in front of it — worked out from the doors, never kept; drawn (view.ts → fences3d drawFlight with its base) and solid (physics/build.ts). `Flight.base` (the foot under the floor) and `Flight.solid` (treads as blocks). Walked up live in zz-roofin.mts. Test: steps.test.ts.
- **Ceilings on a lot** (view.ts `homeCeil`): a house's ceiling is what's over it — the next storey's floor slabs (stair holes kept) and the roofs on this storey — not its floor's kind (a room on a foundation stood on the yard's open-sky concrete: no ceiling, so the sky). A hair under the eaves/next floor (build.ts buildCeiling).
- **Indoors under it**: light3d openSky counts what's under a house's ceiling as in (no sun, no snow dusting on the floor); the falling snow and the dusting's roof list take the houses' roofs (sky.ts `houseRoofs`).
- **▲ adds a storey**: on a lot's top floor the floor stepper's ▲ is a + that puts a storey on top (normal) and goes up onto it; the menu's "A storey on top" goes up too.
- **Auto floor upstairs** (`homes.ts autoFloorOps`, mapedit struct:walls): a room closed on a house's upper storey gets an oak floor by itself, holes for the stairs from below kept — the room under it gets its ceiling. Test in homes.test.ts.
- **A new storey's floor** (`storeyAddOps`): a floor over every room of the storey under it, stair holes kept — build mode shows only the floor you stand on, and a storey with no floor couldn't be gone up to at all.
- **The roof moves up** (`homes.ts roofsUpOps`, mapedit struct:walls): not when the storey is put on (it floated over a storey with no walls — the user's "flying ceiling" on Lot 6) but when walls close a room up there under it: the roof (its dormers, chimneys) goes onto those walls' top. Asked again: "Empty storey, roof waits" over "walls go up with it". Test in homes.test.ts.
- The ceiling under a roof covers only the rooms under it (walls round them), never open air.
- **Roofs shown in build mode**, a Roofs button hides them (`build.roofs`, view.ts `buildRoofs`, World3 `roofsAll`).
- The "A room · Name it" box moved under the Build chip (it covered the floor menu).

#### The double check (11-26)

An independent review of the diff, then fixes:
- A roof goes up only when the rooms up there stand under most of its plan (`ROOF_UP_COVER` 0.6) — a small room under the middle of a whole house's roof took it all up.
- Taking the top storey away puts its roofs back down on the storey under it (`storeyRemoveOps`), as high over those walls — they went with it.
- The Roofs button (and leaving build mode) reaches every floor's roofs, not only mine.
- Stairs built up from the top storey before a storey's on it (their rise the walls' height, a slab short) are made to reach the new floor, and it's holed over them.
- A room closed under an existing storey gets its floor up there too (`roomsClosedOps`), the same on a wall moved (house.ts).
- An automatic floor nothing holds up is left out rather than the wall refused.
- Door steps never behind a wall; the floors drawn under mine get the covered rings for their light too.
- A roof waiting under a storey's floor has no lid in physics (its lid, 23 cm under that floor, stood you on the roof — read as the land).
- Going up with +: the client's physics reads the building through the view, a frame late, and refreshes once a second; + waits for the new floor's slab (`BrowserPhysics.floorReady`) before taking you up — it intermittently dropped you to the land.

Probes: `e2e/zz-storey.mts` (4/4 after the fix), `zz-roofin.mts`, `zz-halfpad.mts`.
