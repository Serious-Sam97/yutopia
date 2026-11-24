# Plan 124 — The build view

Asked 2026-11-24, after plan 123:

> New feature!
>
> Improve Building view
>
> 1- Remove any char action when Building view is up, to avoid making conflicts when moving camera
> 2- Improve UI (USE THe Sims 3 for references and inspiration!)
> 3- BUG - When you have 2 items one in top of a table, you cant move only the item on top
>
> The improve UI is the main for this plan, so LETS PLAN

"Building view" is **Build mode**, the hammer on the Dock (`hud.build.on`), not God mode (plan 53, the admin's
outdoor editor, which has its own HUD and camera). This plan gives build mode a camera of its own with the body left
standing, rebuilds its screen after The Sims 3's Build/Buy, and fixes the stacked-things bug.

Status: **planned 2026-11-24; forks decided 2026-11-24, one by one. Phase 0 mocked 2026-11-24: three looks
(`design/build-view/sheet-{a,b,c}.jpg`); **the user picked C · Glass** (2026-11-24): build mode in The Sims 3's
pale blue gloss, its own look apart from the HUD's walnut and ink. Phases 1–9 built 2026-11-24 straight through
(F11a), not committed — the user tests it. What was built is under "Built" below.**

The forks:
- **F1c** three looks mocked, from ours (walnut and ink) to The Sims 3's own (glassy blue); **picked: C · Glass**;
- **F2a** The Sims 3's layout: the catalog strip along the bottom, mode tabs bottom-left, the view cluster top-right,
  the tools along the bottom edge;
- **F3a** Buy · Build · Lot tabs;
- **F4a** a free build camera (WASD/arrows pan, Q/E turn, wheel zoom, RMB/MMB orbit, T top-down); the avatar stands
  still;
- **F5a** the avatar stands idle where it was;
- **F6a** By Room and By Function, a toggle, with subcategories, every kind tagged;
- **F7a — no price for now, but ready for money**: the user will add a money system later. The card, the catalog data
  and the layout leave room for a price (a `price?` on each kind, a price slot in the card and the grid's tiles, a
  funds slot by the mode tabs), all hidden until money exists;
- **F8a** the Design tool: one panel for looks, fabrics, colours and sign text, live, with undo;
- **F9b** desktop only: phones stay as they are, no touch camera;
- **F10a** the loose ends fixed here: "start blank" admins only, "Draw a room" draws a box of walls, our own confirm
  dialog, translations;
- **F11a** the mocks first (F1), then built straight through, tested at the end.

## What there is today

### The body while building (point 1)

Build mode turns off pointer lock and the follow camera, closes the action menu and stops click-to-walk. Everything
else still reaches the character:

- **Movement.** `input.ts:147` hands every key build mode doesn't take to `walker.controls.world`: WASD, Space jump,
  Shift sprint, C crouch, Q dodge, Z aim, F lock-on. The walker's frame (`controller.ts:1888`) has no build check, the
  gamepad still drives (`usePad`, `:1903`), and positions and jumps go to the server (`:2088`, `:2101`), so everyone
  sees you walk around.
- **WASD is the only pan.** The camera is still the chase camera aimed at your avatar (`view.ts:2795`). The shortcuts
  sheet lists "WASD walk" as a build key (`BuildMode.tsx:308`). Arrows turn the camera, RMB-drag orbits, the wheel
  zooms. Q/E turning is off (`controller.ts:2476`).
- **Guns and items.** Keys 1–9 draw weapons or use items (`input.ts:163` → `arms.quick`, no build check). The dark
  chunk's capture listeners run first: E searches loot (`dark/index.ts:417`, so it never reaches the eyedropper) and
  LMB fires while aiming (`:432`). **RMB is both the orbit drag and aim**, so orbiting raises the gun or torch
  (`walker.ts:310`).
- **Other keys.** Emotes, M mic, V/Y camera, I inventory, T pets wheel, X emote wheel (`walker.ts:313-334`), skate and
  car keys (`input.ts:105, :113`). An RMB click on a person opens their menu (`controller.ts:484`).
- **Clashes.**

  | Key | Build mode | Character |
  |---|---|---|
  | WASD | the only way to pan | walk |
  | Shift | multi-select, keep placing | sprint |
  | E | eyedropper | use / loot first |
  | C | copy | crouch |
  | M | move the selection | mic |
  | RMB | orbit | aim |

### The screen (point 2)

`components/hud/build/*` uses the plan-45 look, ink in walnut frames:

- **Layout.** A top bar (Brand, "BUILD MODE", the floor picker, Undo/Redo, Done). Below it a 76 px tool rail on the
  left with **Furnish · Walls · Rooms · Desks · Map**, a 352 px panel beside it, a keys card over the panel's foot, and
  an action bar at the bottom. Chips follow the pointer: hover tag, wall chip, item toolbar, wall inspector, room
  name.
- **The catalog** (`Catalog.tsx`). About 350 things in 21 categories, reached through **one sideways-scrolling row of
  23 chips** (3–4 visible at a time). It has a 3-column grid of 112 px cards with pictures rendered from the 3D models,
  a search box, the last 6 used, and a held card with a turntable, looks, fabrics and sign text. There are no
  subcategories and no filters. Layouts and Setups sit at the end of the chip row. The NEW badge is on all 193 family
  kinds.
- **Walls** (`WallsPanel.tsx`) has five sub-modes (Build / Paint / Floors / Roof / Select) and six draw modes. Doors
  and windows are two buttons that jump into the catalog. Walls up / cut / down are buttons only in this panel; the
  `[` `]` keys work everywhere.
- **Rooms.** Cards with name, owner, sound, paint, Go there and Remove. **"Draw a room" only shows a toast**: rooms
  come only from closed walls.
- **Desks.** Seats, with people dragged onto them by HTML drag-and-drop, which is mouse-only.
- **Map.** Lot size and spawn point. Its Danger section, "start blank", **has no admin check**, in the UI or on the
  server (`MapPanel.tsx:104`, `mapedit.ts:300`), and wipes the floor for everyone.
- **Not on phones.** The hammer is `hidden sm:flex` and the More menu doesn't offer it, although BuildMode has a
  phone layout.
- **Rough edges.**
  - Offsets are hard-coded and depend on each other (`left-[100px]`, `w-[352px]`, `sm:left-[464px]`), and the action
    bar can overlap the minimap.
  - Every destructive action asks through `window.confirm`.
  - `Dialogs.tsx` and the swatch names aren't translated.
  - Panel titles are still `.lcd` instead of plan 45's `.title`.
  - Facing is shown by quarter turn even for things turned 15°.
- **No prices.** The town has no money except Strike Park's.

### The stacked-things bug (point 3)

Things on a surface keep their tile, `props.c` (the quarter cell) and `props.z` (the host's top). The host is found
by shape (`shared/tops.ts` `hostOf`, `riders`, `carried`). Moving a table carries its tops on the client and the
server. Two causes stop you moving only the top thing:

- **A — the selection swallows the click** (`build/controller.ts:569`). Picking up a table selects the table *and
  everything on it* (`:582`), and putting it down keeps them all selected (`:691`); a box select takes the tops in too
  (`:1244`). After that, clicking the lamp finds it in the selection (`sel.includes(id) ? sel : [id]`) and lifts the
  whole lot. The usual repro: move a table, then try to move the lamp on it.
- **B — the pick favours the table** (`tp/parts/buildpick.ts:126`). Pick boxes are padded by 4 cm, so a flat thing
  (papers, a plate, a keyboard) lies inside the table's box. At a low camera the ray enters the table's box first. The
  comment says "a mug wins over its desk", but the code only sorts by distance. Tab cycles the stack, but nobody knows
  that.

## The Sims 3 reference

What The Sims 3's Build/Buy does that we take from:

- **Two modes, Buy and Build**, side by side in the bottom-left corner with Live (F2/F3).
  - Buy is the objects.
  - Build is the structure: walls, floors, wall coverings, doors, windows, stairs, roof, foundations, terrain, fences.
- **The catalog is a wide strip along the bottom**, not a side column. On its left is a column of large category
  icons: **By Room** (Living, Kitchen, Bath, Bedroom, Dining, Study, Kids, Outdoors, Community) or **By Function**
  (Comfort, Surfaces, Decor, Electronics, Appliances, Lighting, Plumbing, Storage…), swapped with one toggle. Above the
  grid is a row of subcategory icons. The grid of square object pictures fills the middle and pages sideways.
- **An object card** on hover or select: name, price, a short line, what it's good for (comfort, fun…), and its
  colour swatches.
- **Create a Style** (the Design tool): click any placed thing and recolour or repattern it in place.
- **The tools along the bottom edge:** Hand (H), Eyedropper (E), Sledgehammer (K), Design. Undo/Redo is one keypress
  each (C / Z).
- **The camera** pans freely and doesn't follow anyone. It turns with `,` and `.` or a middle-drag, zooms with the
  wheel, and has a top-down view (T). PgUp/PgDn change floor, Home/End cycle the walls through Up / Cutaway / Down, and
  G toggles the grid. These view controls sit together in one cluster, always on screen.
- **Placement feedback:** a footprint that is green where it fits and red where it doesn't, a blue outline on hover,
  `,`/`.` to rotate, and Alt for free placement. Things snap to surface slots, and moving a table carries what's on
  it, but **clicking the plate on it picks the plate.**
- **Feel:** big friendly icons, a soft pop sound on placing, a sparkle where something lands, and a short dust puff
  when something is sold.

We keep our own look (plan 45) unless the forks say otherwise. The Sims 3 gives the **layout and the feel**, not its
blue glass.

Sources: [Prima, building basics](https://primagames.com/eguides/the-sims-3-eguide/essentials/creating-a-house/building-basics),
[Sims Wiki, Buy mode](https://sims.fandom.com/wiki/Buy_mode),
[Snooty Sims, TS3 shortcuts](https://snootysims.com/wiki/sims-3/sims-3-keyboard-shortcuts/),
[Magic Game World, TS3 hotkeys](https://www.magicgameworld.com/?p=30748).

## The proposal (before the forks)

1. **The body stands still.** Building freezes the walker (the existing `frozen` flag, as the inventory does). The
   avatar stays idle where it is and everyone sees it standing. Build mode takes every key and both mouse buttons
   first; the dark chunk, slots, wheels, emotes, vehicles and the gamepad are all off while it's up. You can't open
   build mode from a car, a bike or a skate.
2. **A build camera of its own.** The camera aims at a free point, not the avatar:
   - **move:** WASD and arrows pan; the screen edge pans too (a setting);
   - **turn and tilt:** Q/E or `,`/`.` turn; MMB or RMB drag orbits; Ctrl/Alt-drag tilts;
   - **zoom:** the wheel;
   - **views:** T is top-down; PgUp/PgDn change floor; Home/End or `[` `]` set the walls.

   It starts where your own camera was. On Done it flies back to your avatar.
3. **A Sims 3 screen in our look.**
   - **Bottom left:** the **mode tabs**, Buy (things) and Build (walls, floors, paint, doors and windows, stairs, roof,
     rooms) with a Lot tab (Desks, Map, Layouts).
   - **Bottom:** a **wide catalog strip**. The left column is Room / Function category icons. Above the grid is a
     subcategory row. The grid is big pictures that page (or scroll) sideways. On the right is an **object card**
     (name, a line, size, what it's for, looks and colours, Design).
   - **Top right:** the **view cluster**, always on screen: floors up/down with their names, walls up/cut/down,
     top-down, the grid, rotate. Undo/Redo and Done sit beside it.
   - **Bottom edge:** the **tools**: Hand, Eyedropper, Sledgehammer, Design.
   - **Look and feel:** a hover outline, a card on hover, the pop and sparkle on placing, and dust on deleting.
   - **Clean-up:** our own confirm dialogs instead of `window.confirm`, every string translated, and the hard-coded
     offsets replaced by one layout grid.
4. **Things in the catalog, sorted twice.** Every kind gets a **room** (Living, Kitchen, Bath, Bedroom, Dining,
   Office/Study, Kids & Games, Shop & Town, Outdoors, Seasonal) and a **function** (Seating, Surfaces, Storage,
   Lighting, Electronics, Appliances, Plumbing, Decor, Openings, Building, Pets, Play). The ~350 kinds are tagged once
   in shared data, with a test that none is left untagged. Search stays. The NEW badge marks only what's really new.
5. **The Design tool.** Click a placed thing to get one panel with its looks, fabrics and colours, and the sign text,
   applied live. It replaces both the held card's looks and the item toolbar's Look pop-up.
6. **The stacked-things fix.**
   - **A:** a click on a top lifts only that top, even when its host is selected. The tops follow their host by
     shape, as today, but don't join the selection.
   - **B:** when both are hit, the pick puts a thing that sits on a surface ahead of its host. The pick boxes stop
     overlapping (the host's box ends at its top).
   - The hover outline shows which one you'll get.
   - Tests in shared/client for both.
7. **Loose ends.**
   - "Start blank" becomes admins only, in the UI and on the server.
   - "Draw a room" either works (draw a box of walls) or goes.
   - Phones stay as they are (F9b).

## The forks

Asked one by one 2026-11-24 (the answers in the status above). Each lists its options; ⭐ is the one recommended.

- **F1 — the look.**
  - a ⭐ The Sims 3 layout in our look: walnut frames and ink, bigger, softer, the icons more playful.
  - b Closer to The Sims 3's own: light glassy blue panels and rounded tabs, only in build mode.
  - c Mock three intensities between the two, and you pick.
- **F2 — the layout.**
  - a ⭐ The Sims 3's: the catalog strip along the bottom, mode tabs bottom-left, the view cluster top-right, tools
    along the bottom edge.
  - b Keep the left column but wider (two columns of categories plus the grid), with the view cluster added.
  - c The Sims 4's: a bottom bar with a category flyout over the scene.
- **F3 — Buy and Build split.**
  - a ⭐ Two modes, Buy (things) and Build (structure), plus Lot (desks, map, layouts), as tabs.
  - b One catalog for everything (walls and floors as categories), as now.
- **F4 — the camera.**
  - a ⭐ A free build camera: WASD/arrows pan, Q/E turn, wheel zoom, RMB/MMB orbit, T top-down; the avatar stands
    still.
  - b The chase camera around the avatar as now, only frozen, so you can't pan.
  - c a, plus the screen edges pan and a Sims 2/3 "classic" toggle (Tab) for a fixed-angle camera.
- **F5 — the avatar while you build.**
  - a ⭐ Stands idle where it was; others see it standing.
  - b Hidden while you build, back on Done.
  - c Stands with a "building" act (a tablet or blueprint in hand) so others know.
- **F6 — sorting the catalog.**
  - a ⭐ By Room and By Function both, a toggle as in The Sims 3, with subcategories, every kind tagged.
  - b By Function only (today's categories regrouped with subcategories).
  - c By Room only.
- **F7 — the object card and prices.**
  - a ⭐ Name, a line, size, what it's for, looks and colours. No price (the town has no money).
  - b The same with a price and a budget, which needs a money system: a plan of its own.
- **F8 — the Design tool.**
  - a ⭐ One panel for looks, fabrics, colours and sign text on any placed thing, as Create a Style.
  - b A full colour picker per part, any colour (more work: every model's parts named and recoloured).
  - c Leave it as it is: the looks in the held card and the toolbar.
- **F9 — phones.**
  - a ⭐ Build mode opens on phones: the More menu, one finger pans, two fingers pinch, turn and tilt, and the catalog
    as a bottom sheet.
  - b Desktop only, as now.
- **F10 — the loose ends.**
  - a ⭐ Fix them here: "start blank" for admins only, "Draw a room" works as a box of walls, our own confirm dialogs,
    translations.
  - b Only "start blank" for admins; drop "Draw a room".
- **F11 — sign-offs.**
  - a ⭐ Mocks first (three looks of the new screen; the user picks), then built straight through, tested at the end.
  - b No sign-offs: built straight through.

## Phases

0. **Mocks.**
   - HTML mocks in `design/build-view/mock` and their stills, one per look (F1): Buy with the catalog open, Build with
     walls, the Design tool, the view cluster.
   - The price and funds slots shown greyed in one still, so the room for money (F7) is seen.
   - A still of the free camera from the avatar's spot and from top-down.
   - The user picks one of the three looks (F1c, F11a).
1. **The body stands still** (point 1).
   - `walker.ts` `frozen` also while building.
   - `usePad` off while building.
   - Build mode takes every key: after `buildKey` in `input.ts`, nothing else reaches the character.
   - `dark/index.ts` capture listeners (E, mousedown) skip while building.
   - RMB click opens no person menu.
   - No build mode from a vehicle, a bike or a skate.
   - Test: no `pos`/jump messages leave while building with keys held.
2. **The build camera.**
   - `tp/view.ts`: a build target that isn't `me`, with its yaw, pitch and distance and its own keys (F4).
   - Panning follows the floor's height; floors change by height.
   - T is top-down; the walls modes on Home/End and `[` `]`.
   - Starts at the chase camera's spot, flies back on Done.
   - The shortcuts sheet rewritten.
3. **The stacked-things fix** (point 3).
   - Fix A in `pickUp`/`drop`/box select: tops not swallowed by a selected host.
   - Fix B in `buildpick.ts`: a thing sitting on a surface ahead of its host when both are hit; boxes not overlapping.
   - The hover outline shows the one you'll get.
   - Tests.
4. **Catalog data.** Shared tags per kind: room(s), function, subcategory, a line of text (i18n), and an optional
   `price` left empty for the money system to come (F7). A guard test that every buildable kind is tagged. The NEW
   badge only on a short list.
5. **The new screen.**
   - The shell: mode tabs, view cluster, tools bar, one layout grid with no hard-coded offsets, and the minimap kept
     clear.
   - Buy: the category column (Room/Function toggle), subcategory row, picture grid, object card, search, recent.
   - Build: the walls, floors, paint, roof, doors and windows, stairs and rooms tools in the strip, the same shape as
     Buy.
   - Lot: desks (tap to assign, not drag-and-drop), map, layouts, setups.
6. **The Design tool** (F8). One panel on any placed thing, live, with undo.
7. **Feel.** The hover outline, the pop and sparkle on placing, dust on the sledgehammer, sounds checked against
   `build/sounds.ts`, and the turntable kept in the object card.
8. **Loose ends** (F10).
   - "Start blank" for admins only (UI and `mapedit.ts`).
   - "Draw a room" as a box of walls.
   - Our own confirm dialog.
   - `Dialogs.tsx` and the swatches translated.
   - The colours guard (`colours.test.ts`) updated.
9. **Checks.**
   - The build specs near the change and the known reds (not the full e2e).
   - Stills of every mode, desktop, day and night.
   - Frame time with the catalog open (the pictures render a few at a time).
   - The page budget measured (the build chunk stays lazy).

## Phase 0 — the mocks (2026-11-24)

`design/build-view/mock/build-view.html?look=a|b|c&s=buy|build|design|money`, stills by `node render.mjs` into
`design/build-view/<look>-<screen>.png`, one sheet per look (`sheet-a.jpg`, `sheet-b.jpg`, `sheet-c.jpg`).
- The backdrops are the game's own: the diner and the farmhouse's upstairs from a Sims-like 3/4 view (`mock/bg.mts`,
  run from `apps/client/e2e`), the avatar standing idle in both.
- The catalog's pictures are the game's own renders, 349 kinds (`mock/items.mts` → `mock/items/`).
- **A · Walnut and ink** — the HUD's own look (plan 45): ink panels in walnut frames, Cormorant titles, typewriter
  labels, the amber lamp.
- **B · The cabin** — cream paper in walnut trim, round and soft, walnut for what's on, a green Done.
- **C · Glass** — The Sims 3's own feel: pale blue glossy panels, round white buttons, blue for what's on, Nunito.
- Each look: Buy (By room · Dining, a plant being placed, the napkin holder on a table lit alone — the bug's fix),
  Build (Walls: a wall being drawn, its coverings, thickness and snap), Design (a booth's looks, fabric and frame,
  live), and Buy with money (prices on the tiles and the card, the funds by the place — for later, F7).

## Built (2026-11-24)

### 1 · The body stands still
- `input/walker.ts`: `frozen` while building — no move, sprint, jump, dodge, crouch, aim. The right button doesn't aim
  (`onDown`): it's the build camera's orbit.
- `controller.ts`: `usePad` false while building — the walker isn't "stepping", so the slots (1–5), the wheels (I, T,
  X), the hand and the quick use stand down; no `pos` leaves.
- `ctl/input.ts`: after build mode's own keys, every other key is the build camera's or nothing; only M (mic), V (camera)
  and +/− (zoom) pass.
- `dark/index.ts`: its capture listeners (E search, the gun's click) skip while building.
- People, pets and toys aren't clicked while building; build mode doesn't open from a car, a bike or a board (a toast:
  "Get off first").
- The quick slots, the gun's counter and the minimap hide while building (the strip has the bottom of the screen).

### 2 · The build camera (`world/build/camera.ts`)
- Its own point (`tp.buildAt`, the view's target while building): W A S D and the arrows pan it (Shift faster), Q / E
  turn, the wheel zooms, the right drag orbits, T looks straight down and back. Kept within 45 m of me.
- Opens where my camera looked, eased back and over (pitch 0.82, 11 m) — the follow camera only; a view set by hand
  stays, and anything that moves the camera mid-ease stops it. `BUILD_LIMITS`: as low and near as the chase camera,
  out to 34 m and straight down. If I'm moved while building ("Go there", a teleport) the camera comes along. Done
  gives the camera back to me.
- **Keys moved:** the eyedropper is **I** (E turns the camera now; Photoshop's key), the sledgehammer **K**, the grid
  **G**; Paint's sample is I too.

### 3 · A top off its table (point 3)
- shared `tops.ts` `lifted()` — a click on a thing on a surface whose host is selected lifts it alone — and `unridden()`
  — what rode along isn't selected after a move; `build/controller.ts` `pickUp` and `drop` use them. Test in
  `build.test.ts`.
- `tp/parts/buildpick.ts` `standsOn()`: under the pointer, a small thing standing on another's top comes before it (the
  sort was by distance only). Test `buildpick.test.ts`.

### 4 · The catalog sorted twice (`components/hud/build/shop.ts`)
- The catalog's lists moved out of `Catalog.tsx` as data. Every thing has a function and a subcategory and its rooms:
  11 rooms (living 120, kitchen 22, dining 29, bedroom 45, office 104, studio & stage 37, game room 31, shop & town 19,
  outdoors 54, pets 17, seasonal 25), 11 functions with 2–5 subcategories each; doors, windows and the stairs go to the
  Build tab. Words in pt too, in the build chunk (`addStrings`).
- `price?` on the shared catalog entry (F7): none set; the tiles and the card show it once set.
- NEW only on a short list. `shop.test.ts`: every thing placed, every family's piece in once, every shelf non-empty.

### 5 · The glass screen (look C)
- Tokens `--glass-*` and classes `.gl-*` in `globals.css`; Nunito (not preloaded). Inside `.gl` the HUD's own tokens
  are re-pointed, so the older panels (rooms, desks, the map, layouts) read as glass.
- `BuildMode.tsx`: the place and the save state top left; the view top right (the floor ▼ name ▲ with a menu of floors,
  add / take away; walls up / cut / down; top-down; grid; turn ◀ ▶; mic; undo; redo; Done); Buy · Build · Lot bottom
  left with the hand's tools (Hand, Eyedropper, Sledgehammer, Design) over them; the strip along the bottom
  (categories · middle · card); over its right end, taking no clicks, what the tool in hand does and the camera's keys.
  (First the tools sat on the strip's top edge mid-screen: they took the clicks meant for the floor there — moved
  left. The found room's name chip is at the top for the same reason.)
- `tabs.ts`: what's shown is worked out from the tool (specs set the tool alone); the tab decides among the furniture
  tool's three.
- Buy (`Catalog.tsx`): By room / By function, the faces of the categories as the things' own pictures, subcategories
  and Recent, search (/), two rows of pictures that page sideways; the card — the hovered picture, the thing being placed
  (turntable, looks, fabric, words, fits and facing), what's carried (turn, put down, the bin to sell it), the selected
  thing (move, design, sell) or how to start.
- Build (`BuildTab.tsx`): walls (Line, Arc, Box, Adjust, Erase, Select; materials; height, thickness, snaps in the
  card), floors, paint, roof, rooms, doors, windows, stairs.
- Lot (`LotTab.tsx`): layouts, my setups, desks, the floor (map).
- The toolbar over the selection: move, turn, copy, design, save as setup, sell. The pointer's tags and the wall
  inspector in glass.

### 6 · The Design tool
- The brush on the tools, or Design on the card or the toolbar: a click on a thing picks it (not lifted); the strip's
  middle shows its looks (or its decor kinds and Shuffle), fabric with names, words — applied as clicked, undone with
  ⌘Z (`LotTab.tsx` `DesignMain`).

### 7 · Feel
- A sparkle where a new thing lands (with the dust and the thunk already there); the sledgehammer's red outline and
  cursor; the poof on selling.

### 8 · Loose ends
- "Start blank" admins only: hidden for members (`MapPanel.tsx`), refused by the server (`mapedit.ts`; the booth test
  in `rooms.test.ts` made its owner an admin).
- "Draw a room": Build's Walls with Box (the room's found when the walls close).
- `ask()` / `ConfirmDialog` (`Dialogs.tsx`) instead of `window.confirm` everywhere in build mode; `build-tools` and
  `map-edit` specs answer it.
- `Dialogs.tsx`, the walls', floors' and fabrics' names translated.

### 9 · Checks (2026-11-24)
- Unit: shared 886/886, client 485/485 (with `shop.test.ts`, `buildpick.test.ts`, the colour guard), world-server's
  two blank-start tests 2/2. Types and lint clean.
- In the game (`apps/client/e2e/zz-bv-check.mts`, as Ana in the diner): WASD panned the camera 11 m while I stood
  still; E turned it; Space, 2, 6, C, F, X, I did nothing; T looked straight down; every tab and part shown; the design
  tool picked a booth; a mug put on a pub table, the table and the mug selected, a click on the mug lifted the mug alone
  (the mug taken away after); Done gave the camera back. No page errors. Stills: `design/build-view/built-sheet.jpg`.
- e2e, the build specs (build, build-tools, build-hand, build-tops, build-setups, build-together, doors-windows,
  map-edit, wall-building, wall-faces, wall-sofa-menu, third-person): **19 passed, 5 skipped** (their own quarantines).
  All 7 that failed on the first run passed on HEAD — each was this plan's: fixed in the screen (the tools and the room
  chip out of the floor's clicks, the camera's limits and ease, the camera following a teleport) or in the spec (the
  new tabs and parts by test id, the shop's sorting set directly, I for the eyedropper, a held view over where a setup
  goes down).
- Budgets (a production build): the world page 499.7 of 500 KB (at the edge: the Nunito face, the icons, the store's
  fields); the build chunk 46.9 KB — its budget raised 40 → 50 (`tools/budget.mjs`, noted there).

### Double-checked (2026-11-24)
An independent review of the diff (a fresh reader, given the code, not the conclusions) and edge cases in the game.
Fixed:
- **The design tool outside Buy was a dead end** (Build's doors / windows / stairs, Lot's layouts): its panel now shows
  wherever the furniture tool works.
- **A mixed selection restyled every kind** with the first one's looks: the design tool keeps one thing.
- **A pool ball or the cue in hand** still threw / shot on a build click, B and E theirs (`tables/pballs.ts`, there
  before): they stand down while building.
- **From first person the camera opened ~2 m from the eye**: the pull-back eases in from first person too (the free
  camera — a spec's held view — still stays as set); a stale ease no longer cancels the next opening's.
- **T held** flipped top-down on and off with the key's repeat: once per press.
- **The card kept a hovered picture** after the grid was gone: forgotten when the grid changes or unmounts.
- **Move / M lifted only a plate** when its table was selected too: the whole selection, as before (a click on a top
  still lifts it alone).
- **Space** pressed the last button clicked (its default): taken.
- **A confirm left open when build mode closed** came back on the next opening with a live Yes: answered no on close;
  keys under it don't reach build mode.
- **Paint's hint** still said E: I. **Search** finds doors, windows and stairs again.
- The camera's height follows my floor (it took the floor's height already — the scene's 0 is my floor — kept so).
Checked in the game (`zz-bv-check.mts`, also with the first-person view; `zz-bv-edge.mts`; `zz-bv-review.mts`): a floor
up while building (58 → 59), walking again after Done, right-drag orbit without aiming, a tab switch dropping what was
on the pointer, Esc out of the design tool then out of build mode, God mode's "Go in and build" (it leaves God mode
first, the camera follows the teleport), the design tool from Build › Doors, a mixed selection, T held.
After the fixes: client unit 485/485, types and lint clean, the 12 build specs again 19 passed, 5 skipped (their own).

### Follow-up: customize before it goes down (2026-11-24)
Asked: "when I select a furniture, be able to customize the color etc. before I put it — today only after placing".
- While something from the catalog is on the pointer, its card has **Customize**: the strip's middle becomes the
  design panel for the piece in hand (`LotTab.tsx` `DesignHeld`; the panel is shared with the placed thing's,
  `DesignPanel`) — its looks, decor kinds with Another look, fabric by name, words — shown live on the ghost and kept by
  every copy put down after (Shift); **Back to the catalog** returns to the pictures. It works in any tab that places
  things (Buy, Build's doors / windows / stairs, Lot). The card's small looks/fabric rows hide while the panel's open.
- Store: `build.styling` (reset when another picture is picked); the controller's `placeLook` applies it.
- Checked in the game (`e2e/zz-bv-style.mts`): an armchair customized to Sage put down in Sage; a mug turned into a
  succulent put down as a succulent (both taken away after); a keyboard too wide for the spot said "Doesn't fit here".
  Client unit 485/485; build, build-tops, build-hand, doors-windows, build-setups 5 passed (build-setups once flaky in a
  batch, passed alone and in the batch again).

## Committed
Committed and pushed to main as `d68f3aff` (2026-11-24), with the customize-before-placing follow-up.

### Follow-up: build mode's music (2026-11-24)
Asked: "Music when we enter build menu… The Sims 3 build music". The Sims 3's own tracks are EA's — not usable; the
same spirit from CC BY music instead. Forks asked 2026-11-24: **CC BY tracks, credited**; **candidates picked by ear**;
**a shuffled playlist**.
- 12 candidates by Kevin MacLeod (incompetech.com, CC BY 4.0) in `public/sfx/build` (levelled −18 LUFS, 128 kb/s;
  `manifest.json`): Bossa Antigua, Lobby Time, Local Forecast - Elevator, Airport Lounge, Cool Vibes, Daily Beetle,
  Hep Cats, George Street Shuffle, Jazz Brunch, Easy Lemon, Wallpaper, Laid Back Guitars.
- `/dev/build-music`: each heard (▷, a bar to seek) and ★ kept; the picks play in the game at once on that machine;
  "copy picks" gives `chosen.json`. Until picks: every candidate.
- `world/build/music.ts` `BuildMusic`: the picks shuffled (a fresh shuffle once round, not the same one twice running),
  through the mixer's music bus (Settings' Music volume); fades in as build mode opens (1.6 s) and out on Done (0.9 s),
  paused where it was and going on from there the next time; the world's ambience dips under it (`mixer.duck`).
- Credits: `public/sfx/CREDITS.md` lines read by `tools/credits.py` as CC BY (a new pattern, before the CC0 one; a
  work counted once by its link; the author up to its comma) → Settings → Credits. The regeneration also brought in
  the Strike Park's music credits that weren't in `credits.json` yet.
- Checked in the game (`e2e/zz-bv-music.mts`): opened → playing at full gain; Done → faded and paused; opened again →
  the same track went on. Client unit 485/485.
- **Picked by ear 2026-11-24** (6 of 12): Lobby Time, Cool Vibes, Daily Beetle, Hep Cats, Easy Lemon, Bossa Antigua
  — `chosen.json`; the other six's files, manifest entries and credit lines taken out (25 MB left). Checked again in
  the game from chosen.json alone (a fresh browser): one of the six played, faded on Done, went on when opened again.

### Follow-up: the music in God mode, and an admin's level for everyone (2026-11-24)
Asked: "add also on God Mode — and this background music's volume on build mode and god mode in admin settings so I
can change it for all".
- `world/build/music.ts` is one player for the page (`buildMusic`): build mode and God mode each `want` it; it plays
  while either does (God mode's "Go in and build" carries straight on). God mode's chunk imports it.
- The admin's level, as the steps' and the weather's are: `mod:buildMusic { v }` (shared protocol; admins only,
  0 … 2, null back to 1) → `WorldState.buildMusicVol / buildMusicBy / buildMusicAt` (51 of 64 fields) → saved in the
  world's settings' `sound` (`music`, `musicBy`, `musicAt`; the API's InternalController checks them, a Pest test) →
  loaded on start; logged in the admin log ("buildmusic", allowed by the API, shown by the log page). The player follows
  it while it plays (a level gain after the fades; each player's own Music volume still on top).
- Admin panel → The world: "Build & God mode music", a slider 0–200 % with who set it and when, and Back to 100 %.
- Checked in the game (`e2e/zz-bv-music2.mts`): God mode → playing; out → faded and paused; an admin's 30 % → the
  world's 0.30 and the music's level 0.30 within a second; the card in the admin panel; reset → 1; the admin log
  taken (no 422). API WorldTest + AdminTest 33 passed (3 failing on HEAD too, untouched); schema guard; client 485/485.
- Budgets: the world page 499.8 of 500 KB; the build chunk 47.5 of 50; God mode's 32.0 — its budget raised 32 → 34
  (`tools/budget.mjs`, noted).

### Fix: a gun out kept the build camera at the shoulder (2026-11-24)
The user: "when I have a weapon equipped, the camera even in build mode is always close". The view's over-the-shoulder
ease (`armK`, plan 79's gun camera; `aimK` too) went in whatever the mode: building, the camera sat ~1.7 m from its
point whatever the wheel did. `tp/view.ts`: building, both ease to 0 (the gun counts as held down). Checked
(`e2e/zz-bv-gun.mts`): a gun drawn on foot 1.68 m; building 11.00 m, the wheel out to 16.11; after Done back at the
shoulder.

### B for build mode, the cursor at once in God mode (2026-11-24)
Asked (pt): "Deixe o atalho B para ir ao build mode; quando eu clicar O para o God mode, faça o mouse já aparecer".
- **B** opens build mode on foot (where I may build, not in God mode); B again is Done. In a car B still looks back,
  in the Strike Park's match it still buys, holding a pool ball or the cue it still puts it back — those take it first.
  The **battery moves to N** (the dark's quick use, the HUD's battery caption, the pack's key list); the Dock's hammer
  says "(B)".
- **God mode's cursor**: `ctl/focus.ts` `watchLook` let the camera's pointer lock go when build mode, a panel, a menu…
  opened — not God mode, so the cursor came only later. God mode joined them (and its leaving locks again when nothing
  else wants the pointer).
- Checked (`e2e/zz-bv-keys.mts`, `zz-bv-godlock.mts`): B opens and closes build mode with the cursor free; N says "The
  torch is full"; B no longer touches the battery; with the lock held (faked — headless never locks), O let it go at
  once — and without the change it didn't (0). inventory-tools (N for the battery) and pool-balls (B puts the cue back):
  6 passed.
- Then: "when you exit building mode, make the mouse disappear too, like in God mode". Leaving build mode left the
  cursor out: the lock came back only if it had been held when build mode opened (a Dock click left the mouse free),
  and even then was refused — the view still thought it was building (it hears it a frame later). `watchLook` now, out
  of build mode or God mode, tells the view at once and gives the mouse back to the camera if nothing else wants it.
  Checked with the lock faked (`e2e/zz-bv-relock.mts`): Done, B out and O out all lock again; without the change none
  did.

Committed and pushed as `c339a2cd` (2026-11-24): the build and God mode music with its admin level, B for build mode
(the battery on N), the mouse handed over in and out of both modes, the gun's camera kept out while building.
