# Plan 110 — the buildings: every kind God mode puts down, made good

Asked 2026-11-19:

> Lets improve all buildings we have on God mode, all of them (mainly the ones we use to make a city, but also all)

Status: **planned 2026-11-19; forks decided 2026-11-19 one by one: F1a a Blender kit laid out by code, F2a 3–4
styles per kind, F3b a full city set (all four groups: apartments + townhouse row, office + corner shop, school /
police / fire / clinic, parking garage + library), F4a each kind its own ground floor, F5a shelter + gatehouse
placeable, F6a four colours from palettes, F7a the town re-dressed, F8a instancing + far LOD, F9b no sign-offs,
F10a the full panel, the garage's decks drivable. Phases 0–13 built 2026-11-19 ("finish all phases"), not committed: waiting on the user's test.**

## Where we are, from the code

Stills of today: `design/buildings/today/` (main street, Church Street, the farm, the diner and gas station).

- **Thirteen kinds God mode builds** (`grounds.ts` `PREFABS`): house, shop, bar, diner, hotel, church, barn,
  farmhouse, silo, shed, gas, boathouse, warehouse. **Four it doesn't**: hq, block (anchored), gatehouse (anchored),
  shelter (pickable and movable, not in `PREFABS`, so you can't add one).
- **The town is 44 buildings, all placed by hand** (`BASE_BUILDINGS`): 16 houses (14 identical 10×8 townhouses in
  two rows on Church Street, 2 lake cabins), 8 shops (market, books, hardware, motors, post office, laundromat, town
  hall, bakery), one each of diner, bar, hotel, church, barn, silo, farmhouse, gas, warehouse (the skate hall), and
  the sheds, boathouses, shelters, HQ and blocks.
- **All of it is code-built boxes and quads** with canvas textures (`tp/grounds3d.ts`, 6,200 lines), the life look's
  materials laid over by hooks (plan 73 phase 7: pine relief on siding, the library's brick, slate on pitched roofs,
  garden plants). The one GLB is the skate hall's.
- **Variety**: only shops (`shopLook`: brick or clapboard, false front / cornice / coping, awning) and houses
  (`houseLook`: side gable, front gable with porch, storey-and-a-half with dormer) are seeded. Everything else is one
  look stretched to its plot. A 20 m house is a 10 m house stretched.
- **What reads as weak** (from the stills): flat white roofs on every shop block; blank sides and backs (a shop is a
  front and a box); the 14 townhouses read as one house fourteen times; big windows-to-wall gaps; no ground detail
  (steps, foundations, downpipes, meters, AC, back doors, bins, fire escapes); the gas station a flat box under a
  canopy; the church, boathouse and shed plain boxes with a roof.
- **God mode's panel** (`GodHud.tsx` `BuildingsPanel`): kind (one icon for all 13), name, width, depth, floors, door
  side, walls (5 tints or the kind's own), enterable, sign (shop/bar/diner/hotel). Not there: a style, a roof or
  trim colour, vacant, change kind in place, size by dragging a corner.
- **Bugs and gaps found**:
  - `floors` is ignored by every kind but the four shop kinds (drawing and solids); the ghost uses `floors × 3.8 + 2`
    for all.
  - Enterable means **market shelves** for house, church, silo, shed, gas, boathouse; a bar is a bar only when its
    sign says exactly "BAR"; the town hall's and post office's civic front is chosen by key, so a placed one never
    gets it.
  - **A placed warehouse draws the skate hall's GLB at the skate hall**, not on its plot, and its inside puts the
    skate shop's counter there too.
  - An enterable gas station or silo: inside walls over the whole plot while the solids return early.
  - Changing a generator building re-checks only its move: size, floors and door side aren't checked against
    `PREFABS` / `NATIVE_FACES`.
  - One floor inside, open above; no stairs, no upper floors (plan 54, "spaces", designed, never built).
- **Cost**: each building a few meshes, one per material; not merged, no LOD. The town is built whole once (900 m
  "rest" circle) and parked past 1.3 km (plan 91). `yutopia-grounds` 196 / 205 KB (budgets: raise freely, measured).

## The idea

**Every kind a real building, at any size and any number of floors, in styles you choose.** A building is laid out
from a **facade grammar**: its plot and floors cut into bays (a window, a door, a shopfront, a blank, a corner), each
bay filled from a **kit of parts** (window frames and sills, doors, cornices, porches, awnings, chimneys, downpipes,
roof edges), every side dressed (fronts the richest, sides and backs real: windows, back doors, meters, bins, fire
escapes), the roof a real one (pitched, hipped, gambrel, mansard, flat with a parapet and rooftop plant). The same
layout gives the solids, the walking and the ghost, so they always agree.

- **Styles per kind** (F2): each kind 3–4 named styles (house: colonial, cape, victorian, bungalow; shop: brick
  commercial, clapboard false front, art deco, civic; …), chosen in the panel; the generator's own seeded as today.
- **Colours** (F6): walls, trim, roof, door — from each style's palette.
- **The city set** (F3b): ten new kinds on the same kit — apartments (3–6 storeys), townhouse row (joined
  houses, any length), office (2–8, brick or glass), corner shop (shop below, flats above), school (with its yard),
  police station, fire station (engine bays), clinic, parking garage (drivable decks: Jolt ramps and slabs, its
  floors are levels), library. Each with its styles, its insides, its sizes in `PREFABS`.
- **Floors honoured** by every kind, each within its kind's limits; the height of a storey per kind.
- **Interiors** (F4): each kind its own furnished ground floor.
- **The town re-dressed** (F7): the 44 laid with the new kit, each given a style so no street repeats.
- **Cheap** (F8): parts instanced, a building merged per material, a far LOD.

## Styles (phase 0)

The numbers behind each are in `design/buildings/refs.md`. The first of each kind is the one a new building gets.

| Kind | Styles |
|---|---|
| house | **colonial** (side gable, 3 or 5 bays, centre door with fanlight, 6/6) · **cape** (1½ storeys, steep, dormers, shingle) · **victorian** (Queen Anne: cross gable, wraparound porch, bay window, shingled gables, tall 1/1) · **bungalow** (craftsman: low broad gable, deep eaves on brackets, tapered posts on piers, 3/1 in threes) |
| townhouse row | **brick row** (stoops, bracketed cornice, arched heads) · **clapboard row** (New England, gables to the street) · **modern** (flat roof, panel and glass, recessed doors) |
| apartments | **walk-up** (brick, 3–6 storeys, cornice, fire escapes, a stoop) · **garden** (2–3 storeys, pitched roof, balconies, siding) · **modern** (flat roof, stucco or panel, balconies, ground-floor lobby glass) |
| shop | **brick commercial** (Italianate cornice, arched or hooded upper windows) · **false front** (clapboard, square parapet over a gable) · **art deco** (stucco and limestone, vertical piers, stepped parapet) · **civic** (columns, pediment, clock: the town hall's and post office's, open to any) |
| corner shop | **brick corner** (chamfered corner door, flats above, cornice) · **clapboard store** (porch along the front, a gable) · **modern** (glass on the corner, flat roof) |
| bar | **tavern** (brick, dark, neon in the window, a blade sign) · **roadhouse** (clapboard, gable to the road, porch) · **pub** (painted timber shopfront, gold letters, lanterns) |
| diner | **streamline** (stainless bands, rounded corners, glass block) · **railcar** (barrel roof, end vestibule) · **modern** (glass box, a canopy) |
| hotel | **brick hotel** (cornice, marquee, blade sign) · **inn** (clapboard, two-storey porches, gables) · **art deco** (stucco, vertical sign, stepped top) |
| church | **meetinghouse** (white clapboard, front steeple: today's) · **gothic** (stone, pointed windows, square tower) · **brick romanesque** (round arches, rose window, a bell tower) |
| gas | **classic** (the 1950s box: tall glass kiosk, flat canopy) · **modern** (deep canopy, a convenience store) · **service garage** (two bays, an office, pumps out front) |
| shed | **metal** (corrugated: today's) · **timber** (board and batten, a pitched roof) · **block** (concrete block, a roll-up door) |
| boathouse | **timber** (board and batten, big doors to the water) · **clapboard** (a cupola, white trim) · **stone base** (fieldstone below, shingle above) |
| warehouse | **brick** (the skate hall's look, any plot) · **steel** (metal panel, a low gable) · **mill** (clapboard, long rows of windows, a stair tower) |
| barn | **gambrel** (today's) · **bank barn** (a gable, a stone lower storey into a bank) · **pole barn** (metal, a low pitch) |
| farmhouse | **classic** (two storeys, a porch: today's) · **federal** (hipped, twin chimneys, a fanlit door under a portico — built in place of the connected farm, whose joined wings the one-mass frame composer can't lay) · **gothic** (a steep centre gable, a lancet in it) |
| silo | **stave** (concrete staves, banded: today's) · **steel bin** (corrugated, a cone roof) · **brick** (a dome) |
| office | **brick** (4–8 storeys, punched windows, a cornice) · **glass** (curtain wall) · **concrete** (1970s ribbon windows, a recessed ground floor) |
| school | **brick** (1920s, big banks of windows, a cupola entrance) · **modern** (1960s low, ribbon windows, a flat roof) · **schoolhouse** (one-room, clapboard, a belfry) |
| police | **brick civic** (a pedimented door, lamps, a flagpole) · **modern** (glass and concrete, a canopy) · **small-town** (one storey, brick and siding) |
| fire | **brick classic** (arched bays, a hose tower) · **modern** (metal and glass bays) · **volunteer** (block and metal, small) |
| clinic | **brick** (two-storey practice) · **modern** (glass entry, low) · **house** (a converted house, a sign on the lawn) |
| parking garage | **concrete** (open decks, spandrel rails) · **brick-clad** (arched screens on the street side) · **mesh** (metal screen panels) |
| library | **carnegie** (brick and limestone, columns, steps up) · **modern** (glass, low, a deep roof) · **clapboard** (small-town, a porch) |
| shelter | **glass** (today's) · **timber** (a pitched roof, a bench) · **brick** (heritage, an arched opening) |
| gatehouse | **glass** (today's) · **brick** · **timber** |

## The kit (phase 0)

`tools/art/buildings/` (Blender, by code): **parts**, each a small model at its own origin, never a wall. The walls
themselves (with their openings cut) are laid by the grammar in code (phase 1), in the skins' tiling materials.

- **A part's frame**: metres; its origin on the wall's face at the bottom middle of its opening (or its footprint's
  centre for a free-standing part); it faces +z in three (out of the wall); x along the wall. Scaled only along x
  and y where its name says it stretches (`~x`, `~y`: frames, sills, cornices, rails), never otherwise.
- **Materials by role**, so a building's colours (F6) reach them: `trim`, `sash`, `door`, `glass`, `canvas`, `metal`
  (dark painted), `chrome`, `stone`, `brick`, `roof`, `wood` (natural), `lamp` (lit at night), `sign`. The client
  maps each role to the material library (plan 73) and the building's colour.
- **Families**: windows (double-hung 6/6 and 2/2, Victorian 1/1, craftsman 3/1, square, round-arch, pointed, ribbon,
  curtain-wall panel, industrial steel, bay window, gable and shed dormers), window dress (casings flat / hooded /
  pedimented, sills, shutters louvred and panel, a window box, an AC unit), doors (front with transom and sidelights,
  shop door in a recess, double, garage, roll-up, apparatus, sliding barn, service, glass slider), entries (stoop,
  porch posts turned / tapered / Tuscan, rails, a portico, a canopy, awnings striped and plain, a marquee), edges
  (corner board, pilaster, frieze, cornices bracketed / dentil / box, parapet coping, water table, belt course,
  quoin, rake board and return, gutter and downpipe), roof parts (chimneys brick and stone, cupola, belfry, spire,
  vents, rooftop plant, water tank, stair bulkhead, skylight, flagpole), the backs (meters, fire escape storey, a
  back stair, bins, a dumpster), signs (blade, fascia board, a neon frame), the gas station (pump, island, canopy
  post), the garage (column, spandrel rail, ramp kerb), and a stair-and-lift core's head.
- **New skins** for the material library (phase 1): clapboard, cedar shingle, board and batten, limestone, fieldstone,
  stucco, precast concrete, corrugated and standing-seam metal, asphalt shingle (brick and slate exist).
- **The sheet**: `design/buildings/kit/` (`blender -b --factory-startup -P tools/art/buildings/sheet.py`).

## Data

```ts
// grounds.ts Building (and so BuildingDef)
style?: string;        // one of its kind's STYLES; none: seeded from its plot, as today
colours?: { walls?: string; trim?: string; roof?: string; door?: string }; // each from its style's palette
vacant?: boolean;      // (exists: now in the panel)
```

`checkEdits` checks the style is its kind's, each colour its style's, size and floors within `PREFABS` (added and
changed alike), the door side allowed when it's enterable.

## Forks

| # | Fork | Options (recommended first) | Decided |
|---|------|-----|-----|
| F1 | How the buildings are made | **a** a kit of parts made in Blender (GLB, instanced), laid out by code to any size · b better code-built boxes, no Blender · c a whole Blender model per kind and style (fixed sizes) | **a** |
| F2 | Styles | **a** 3–4 named styles per kind, picked in the panel · b seeded variety only · c one better look per kind | **a** |
| F3 | New kinds for a city | a none now · **b** a city set now · c 2–3 now | **b**, all four groups |
| F4 | Insides | **a** each kind its own furnished ground floor (house a home, church pews, gas a kiosk shop…) · b also upper floors with stairs (pulls plan 54 in) · c outsides only | **a** |
| F5 | Placeable extras | **a** the shelter and gatehouse placeable too; HQ and blocks stay anchored, untouched · b also restyle the HQ and blocks · c only the 13 | **a** |
| F6 | Colours | **a** walls, trim, roof, door, each from its style's palette · b a free colour picker for each · c walls only (as today) | **a** |
| F7 | The town's 44 | **a** re-dressed with the new kit, each given a style (the town changes look) · b left as they are | **a** |
| F8 | Cost | **a** instanced parts + a far LOD (massing with a baked facade) · b instancing only · c none | **a** |
| F9 | Sign-offs | a phase 0 mocks signed off, then straight · **b** no sign-offs · c a sign-off per phase | **b** |
| F10 | Panel extras | **a** style picker with 3D thumbnails, 4 colours, kind changed in place, vacant, corner-drag sizing, an icon per kind, kinds grouped · b style + colours only | **a** |
| — | The garage | **a** drivable, walkable decks (Jolt ramps and slabs) · b ground level only | **a** |

## Phases

No sign-offs (F9b): built straight through, each step committed, stills of everything at the end.

0. **References and the kit's design**: references per kind and style (real New England small-town and small-city
   buildings), the style list per kind written down here, the kit's parts sheet in Blender (`design/buildings/kit/`).
1. **The grammar and the kit**: `packages/shared/src/building-layout.ts` (plot + floors + style → bays per side,
   storey heights, roof, parts with transforms), its tests (every kind × style × min/max/turned: bays fill the walls,
   doors on the door side, nothing past the plot); `tools/art/buildings/` Blender kit → GLBs; the client loader
   (instanced parts, a building merged per material). The solids and walking from the same layout.
2. **Houses** — styles, porches, chimneys, garages and back yards; the Church Street rows no longer twins.
3. **Main Street** — shop, bar, diner, hotel: storefronts, upper floors, cornices, parapets and rooftop plant, the
   civic style (town hall, post office) open to any shop, the bar a bar by kind not by sign, signs per kind.
4. **The rest of town** — church, gas station (a real kiosk shop, canopy, pumps), warehouse (its own model on its
   plot: the placed-warehouse bug fixed; the skate hall keeps its GLB), shed, boathouse, shelter, gatehouse.
5. **The farm** — barn, farmhouse, silo honouring size and floors (the barn's gable UVs fixed).
6. **City homes and work** (F3b) — apartments, townhouse row, office, corner shop: new `BuildingKind`s, `PREFABS`,
   `NATIVE_FACES`, styles, the API/world-server's lists where kinds are named.
7. **City services** — school (its yard), police station, fire station (engine bays, open doors), clinic, library.
8. **The parking garage** — decks and ramps from the layout, Jolt slabs and ramps (floors by height, plan 50), cars
   and people up and down, parked cars on its decks (plan 102's homes may sit on a deck).
9. **Insides** (F4a) — each kind its own furnished ground floor (old and new kinds), laid by the layout (doors where
   the door is); the enterable gas/silo mismatch fixed.
10. **God mode** (F10a) — the panel (kinds grouped with an icon each, style picker with 3D thumbnails, four colours,
    vacant, kind in place, corner drag), the ghost from the layout, `checkEdits` for changes too, shelter and gatehouse
    placeable (F5a), words in English and Portuguese, the server's checks.
11. **The town re-dressed** (F7a) — each of the 44 a style; `TODAY` and the town fixture updated once, on purpose.
12. **Cost** (F8a) — the far LOD, draw calls and triangles in town before/after, a test city of ~200 placed buildings
    measured on Low/Medium, the page and chunk budgets.
13. **Checks** — the shared suite, `godmode-buildings` / `godmode-select` specs, a walk and a drive down Main Street
    and up the garage, memcheck, stills of every kind × style (`design/buildings/built/`).

## Guardrails

- With no edits the world is today's through phases 1–7 (`TODAY` and the town fixture hold); phase 8 changes them on
  purpose.
- What's drawn, what's solid, what's walked and the ghost come from one layout.
- God mode stays admin-only on the server (plan 48).
- Saved drafts and published edits from before keep working (no style: seeded, as today).
- Budgets raised as needed, measured and noted.

## Built

### Phase 0 — references and the kit (2026-11-19)

- **References**: `design/buildings/refs.md` — storey heights per kind, every opening's size, the skins' modules,
  roof pitches and eaves, what each kind keeps on its plot. The style list per kind is above (§ Styles).
- **The kit**, `tools/art/buildings/`: `bkit.py` (the part frame, roles, boxes / prisms / lathes / arcs / beams,
  planar UVs in metres, Blender objects, the GLB export through the bikes' quantised exporter), `parts.py` (**108
  parts, 23.3k triangles** in all, eleven families: windows 20, dress 7, doors 11, shopfronts 7, entries 12, edges 17,
  roof parts 13, backs 5, signs 5, the gas station 5, the garage 6), `sheet.py` (a sheet a family), `sampler.py` (the
  kit in use).
- **Stills**: `design/buildings/kit/00-windows.png` … `10-garage.png`; `sample-street.png`, `sample-house.png`,
  `sample-shop.png` — a five-bay colonial (door-fan, 6/6 cased with louvred shutters, boxed cornice, a return, a
  chimney) and a two-storey brick shop (cast-iron pilasters, bulkheads, plate glass, transoms, a recessed door, a
  fascia, a striped awning, goosenecks, hooded windows, a bracketed cornice, a blade sign) put together by hand at
  true scale. They meet as they should; the kit is ready for the grammar.
- **For phase 1**, from the build:
  - The GLB is 854 KB: every face has its own corners. Weld the parts' vertices by role before export (expect a
    third), and keep the kit lazy (its own chunk, loaded with the Grounds).
  - A part with a wall of its own (the dormers' fronts and cheeks) carries it as `skin`: the grammar gives `skin` the
    building's wall material, as it gives `trim`, `door` and `roof` the building's colours.
  - A building's mass must stay open behind a recess (the shop's door is 1.2 m in): the grammar sets the shop storey
    back where its recess is, as the sampler does.
  - Brackets, mullions, balusters and dentils are their own parts or fixed-length runs, never stretched: the grammar
    repeats them along a stretched cornice, shopfront or rail.
  - Rebuild: `blender -b --factory-startup -P tools/art/buildings/sheet.py` (a few seconds), `… sampler.py`.

### Phases 1–13 (2026-11-19)

- **The grammar** (phase 1): `packages/shared/src/building-kit.ts` — the engine: the local frame (u along the front,
  v back) mapped by the door's side, so **every kind faces any side** with no turning; walls with their openings cut
  (rectangles, arched / pointed / round heads) and raised under their gables; roofs (gable, hip, gambrel, flat with a
  parapet, shed, mansard, barrel) drawn, snowed on and solid in steps; stairs a drawn box and a solid a step (≤ 0.2);
  parts placed; signs, lamps, masses, the door. `packages/shared/src/building-styles.ts` — **25 kinds, 75 styles**
  (§ Styles; the connected farm built as a federal one), 12 palettes, the composers (`frame`: the wood-frame house and
  everything pitched; `block`: Main Street and every flat-roofed building, shopfronts, entries, civic porticoes, fire
  bays, curtain walls, ribbons, cornices, false fronts, stepped deco tops, fire escapes, water tanks; and the church,
  gas station, silo, parking garage, railcar diner, shelter, gatehouse of their own), `layoutOf` (cached by what it's
  made from). 0.1 ms a layout; 1,232 kind × style × size × side × floors combinations laid without a fault.
- **One layout for everything**: drawn (`apps/client/src/world/tp/kit-buildings.ts`), solid (`shapes/grounds.ts`
  `building`: its solids), walked (`grounds.ts`: the meetinghouse's tower past the plot from the layout, the gas
  station's kiosk and forecourt, a garage's open ground), the ghost (God mode: the layout's height), the insides'
  door. `wallsHigh`, `steepleOf`, `forecourtOf` read it. The HQ, the blocks and the skate hall (its Blender models,
  plan 104) keep their own.
- **The client** (phases 1, 12): the kit GLB (`public/life/buildings/kit.glb`, 595 KB, no UVs — laid in metres in the
  game) loaded once (the Grounds' building steps wait for it; a still's Grounds load it first); each building's
  batches packed small (positions, byte normals and colours, UVs only where a picture is) into its **64 m cell's**
  merged meshes, a material each, near and far (**LOD at 110 m**: the far without the parts, a pane in each opening);
  one walked into its own (its outside cut while you're in). Skins and roofs painted once (clapboard, shingle, batten,
  brick, stone, fieldstone, stucco, concrete, metal, panel; slate, shingle, standing seam, tin, copper, membrane),
  glass with the sky in it by day and lit at night. *Deviation from F8a:* parts merged a cell at a time rather than
  instanced — fewer draws on the CPU-bound machines (plan 89/90), memory measured below.
- **The kinds** (phases 2–8): houses (colonial, cape, victorian, bungalow), Main Street (brick, false front, deco,
  civic — the town hall's and post office's, open to any shop), the bar by its kind (not its sign), diners (streamline,
  railcar, modern), hotels, the church (meetinghouse, gothic, romanesque), gas stations (classic, modern, service
  garage), warehouses (a placed one its own, not the skate hall's model), sheds, boathouses, barns (gambrel, bank,
  pole), farmhouses, silos, shelters, gatehouses; and the city set: townhouse rows, apartments, offices, corner shops,
  schools, police, fire stations, clinics, libraries, **parking garages** (decks on columns, a ramp a storey ≤ 18 %,
  spandrels, a stair core: Jolt solids, the plot walked and driven).
- **Insides** (phase 9, F4a): each kind's own ground floor, laid with its door on one side and turned to its door's
  (`grounds.ts fitsOf`): a home, pews and an altar, offices of desks and screens, classrooms, a police front counter
  and cell, fire engines in their bays, a clinic's waiting room and exam beds, a library's stacks and tables, lobbies,
  racks, a boat on its slip; drawn in `grounds3d.ts interior()` (10 new pieces).
- **God mode** (phase 10, F10a): kinds grouped (Homes, Shops, Work, Town, Farm) each with its own icon; a style picker
  of pictures drawn from the kit (`god/building-pictures.ts`, one offscreen renderer, a picture a frame); four colours
  from the style's palette; shut (vacant) for shops; the kind changed where it stands; a picked one's corner dragged to
  size it; walked into on any side; the ghost as tall as the layout. The rule book (`checkEdits`): a style its kind's,
  each colour its style's palette's, floors within the kind's, a kind that isn't walked into refused as one; changes
  to the town's own buildings checked as new ones are.
- **The town re-dressed** (phase 11, F7a): every building its style (and a few their colours): Main Street brick,
  false fronts, the deco Motors, the civic town hall and post office, the tavern, the brick hotel, the meetinghouse
  church; Church Street's fourteen houses colonials, capes, Victorians and bungalows, no two alike side by side or
  across; the farm's gambrel barn, stave silo, classic farmhouse. **Walking unchanged** (the fingerprint's `walk` the
  same); `solids` and 25 town chunks' fixture updated once, on purpose.
- **Cost** (phase 12, `e2e/town-cost.mts`, Medium, noon, two frames, both clients under turbopack, after a forced
  GC): Main Street 1,964–1,982 draws against the old 2,046–2,092, 4.6–4.8 M triangles against 4.6–4.9 M; Church
  Street 1,476–1,528 against 1,549, 6.3–6.5 M against 6.1 M; scene geometry +3 MB. The V8 heap the same (145 vs 147
  MB); typed arrays +25–70 MB with the kit's buildings against the same build without them (noisy). Walking the farm
  lane, the worst frame 317–333 ms against HEAD's 783–817 (dev server; the corn's 83–117 ms spike is HEAD's too).
  Bundles (prod build): the world page 492.0 / 492 KB, `yutopia-grounds` **167.6** / 205 (from ~196: the old builders,
  ~1,300 lines, gone), `yutopia-god` 26.7 / 27.
- **Checks** (phase 13): the shared suite 774/774 (new: the kit's roofs under their drawn slopes up to the ridge,
  every awning 2.2 over what's under it, every door climbed from the street ≤ 0.27 a step, any side, the meetinghouse's
  steeple, the rule book's style and colours); the world server's God mode tests 9/9; e2e `godmode-buildings` (a cape
  put down with a palette colour, turned, moved, walked into facing north, made a shop where it stands, sized by its
  corner, refused on the farmhouse, taken away), `godmode-select`, `physics`, `farm` (all its walks; its frame budget is
  red on HEAD too on these servers). Stills: `design/buildings/built/` — the city kinds in a God mode draft
  (`e2e/buildings-shots.spec.ts`: rows, street level, insides) and every kind's styles as the panel draws them.
- **Left**: the far LOD has no baked facade picture (panes only); the connected farm's joined wings; a parking garage's
  decks aren't the walking grid's floors (the cars and bodies are on Jolt's); interiors' upper floors stay plan 54's.

### Quality pass (2026-11-20, "improve the quality even more")

- **The library's materials on every building** (the life look): ten new painted materials in the life look's library
  (`life-matlib-list.ts`, painted by `tools/art/life/materials.mts`, KTX2 in `public/life/mat/`): clapboard (boards
  lapping, the foot's shadow), cedar shingle, board and batten, stucco, fieldstone (rounded stones in deep mortar),
  limestone ashlar, composite panel, corrugated metal, asphalt shingle, standing seam — with brick, slate and concrete
  already there. Every skin and cover is drawn in its library material (relief, roughness, the crevices' shade), and the
  parts' stone, brick, concrete and wood too (sills, lintels, arches, steps, quoins, chimneys, porch floors). A building's
  colours are its vertices' over each material's mean, so a wall is the colour picked for it. The canvases stay for the
  classic look.
- **Glass with rooms behind it**: a 4.8 m square of rooms (curtains drawn back, blinds half down, sheers, a lamp-lit room,
  the sky's paleness) laid in metres, so the windows along a row each show another; the same picture lit warm at night
  through the lit ones (a home's rooms lit more often than a shop's upstairs).
- **Winter and wear**: snow on every window's sill; icicles along every pitched roof's eaves; a wall's foot darker for its
  lowest 0.7 m (the splash of years).
- **Facade life**: window boxes under some of a home's front windows, window units in some of a walk-up's.
- **Insides from the furniture kit** (`furn/native.ts`, loaded with the first building walked into): sofas, loveseats,
  armchairs, coffee tables, bookcases, fireplaces, rugs, kitchen stoves, fridges, the market's shelving and the bar's
  counters laid one after another along their spots, bar stools, bentwood chairs (task chairs in the work places), desks,
  workbenches, bedside tables, plants and indoor trees, the jukebox, a reception desk — each its back to the nearest
  wall, a seat turned to the table or counter it's at; what the kit has none of its size for (a table smaller than its
  dining tables, pews, beds, engines, the boat) drawn as before, tables now on four legs.
- **Checks**: the shared suite 774/774 (no solids changed: the fingerprints hold), stills of the town by day and night,
  inside the bar, the market, the farmhouse and the diner (`e2e/buildings-shots.spec.ts`: `HOUR=21`, `TOWN=only`).
