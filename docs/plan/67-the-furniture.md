# 67 — The furniture

Ask (2026-11-03): "Lets do a big feature now. Redesign and improve current Furnish and Office. Lets
go through each furnish item and improve its quality even redesign it ALL OF THEM. Lets plan".
Planned 2026-11-03; the four decisions at the end taken the same day. Follows `45-the-ui.md` (the
HUD's look), `50-the-volume.md` (SHAPES, Jolt), `38-the-lag.md` (the merge, the cull),
`59-the-character.md` (the people's size), `62-the-touch.md` (sit spots, hands on things) and the
art direction (stylized: flat facets + ink, 2026-10-22). Workflow rule as before: mocks and a bench
first (phase 0), each family signed off on the bench before it reaches the world.

**This changes what furniture is.** Today every placed thing is an isometric SVG drawing from the
2D days, pushed through a converter into boxes. After this plan each one is a real 3D model in
metres, at the people's scale, in the world's stylized look, and the Furnish panel shows those
models.

## Where we are

### How furniture is drawn (the root of the quality problem)

- **All 99 kinds but four are iso drawings.** `world/art/items/*.ts` (6,935 lines, 30 files) draw
  each thing in iso px with the `Sketch` kit. In 3D, `tp/kit3d.ts` `MeshSketch` replays the same
  calls into vertex buffers (`tp/build.ts:869` `drawObject`). Only the pool table
  (`tp/pooltable3d.ts`), the stairs, the lifts and the cars are native 3D.
- **What the conversion can't do**: no curves but cylinders and `puff` rounded boxes; heights in iso
  px (39.19 a metre); gradients flattened to their middle colour; details are decals on faces.
- **Free-hand parts become billboards** (`raw` in `shape()` → a two-sided card turned to the camera
  every frame, `view.ts:2773`): **all plant foliage**, the chair's five-star base, the sofa's
  pillow, the armchair's back pillow, the desk lamp's arm, the floor lamps' cords, arms and globe,
  the mug's handle, the succulent, the mic stand, the radio's antenna, the turntable's arm, the
  projector's lens and reels, the portable TV's handle, the CRT's rabbit ears, the arcade's ball,
  the bin's paper. They swivel as you walk round them.
- **No cel ramp on furniture**: Lambert × the baked light map (`light3d.ts:357`); the people and
  pets have the toon ramp (`view.ts:3347`). Ink is a box's top rim and verticals plus the
  screen-space `InkPass`.
- **No instancing**; per 6×6-tile area merges, one mesh a material (`build.ts:732`), with a fade
  slot per vertex for tall things. Plan 38's numbers depend on this: keep it.

### The scale is off since plan 59

The people are 1.79 m with a knee at ~0.47 m (`chars/params.ts:103`, `moves.ts:33`). The furniture
was sized for the iso art: **chair seat 0.36 m** (real ~0.46), **sofa 0.42**, **bench 0.29**,
**desk top 0.64** (real ~0.74), meeting table 0.64, counter 0.66 (real ~0.90), coffee table 0.33.
Sitting, knees ride up and the desk is at the lap.

### What depends on exact sizes (scattered, by hand)

Seat tops and fronts (`tp/seats3d.ts:23` `SEATS`), surfaces and tops (`catalog.ts` `surface`,
`top`, `tops.ts` cells), stand heights (`catalog.ts:478` `STAND`), physics (`shapes/index.ts:180`
`SHAPES`, one block a kind), hand points (`view.ts:187–211` `partsOf`: cooler tap, vending keypad,
whiteboard, piano keys), screen rects (`media.ts:214` `GLASS`, `games.ts:195` `TV_SCREEN`,
`computer.ts:74` `COMPUTER_GLASS`), LEDs (`games/room.ts:39`), `PIANO_STOOL`, `DESK_PULL`,
`KEYBOARD_H`, `TABLES` (copied by hand into `pooltable3d.ts:22`), slot track tops, door/window
`CUTS`, the light points (`art/light.ts`). Tests pin them: `shapes.test` (model bounds vs SHAPES,
0.06 m), `kinds.test`, `seats3d.test`, `keys3d.test`, `uses3d.test`, `build`, `jump`, `footing`,
`hang`, `reach`, `openings`, `media`, `computer`, e2e `merge-ab`.

### The Furnish panel

- Built 2026-10-12 (`components/hud/build/`); it shares the HUD's tokens, so plan 45 gave it the
  walnut frame and the ink (`.cabinet`). What it lacks: 16 bare-icon category tabs in two rows, no
  preview of what you hold, the Look and the colour hidden in the details strip.
- **Thumbnails are the iso SVGs** (`build/thumbs.tsx`): a different art style from the world (and
  the pool table, stairs, lift and cars aren't even what's drawn).
- Gaps: `toy_box` is buildable but not in the catalog and has no art (old rust box,
  `furniture.ts:593`); `decor:plant` exists but isn't offered; `monitor` only comes by dressing.

### The Office

- The HQ (`building.ts`): floor 4 the studio (`maps/studio.ts`: Tracking Room, Standup Corner, War
  Room, Booth Hall + 3 booths, Lobby, Lounge, Live Room + Stage, Server Room); **floors 1–3 blank**
  (`blankLevel`: windows, the core); ground: lobby, mail room, security, records, north/south
  offices (6 desks).
- Templates (`build.ts:130`): desk pods, studio rows, tape library. Dressing presets
  (`dressing.ts`): bare / tidy / lived / busy.
- The stored layout is the world's (the user's prod office is their own furnishing); code layouts
  only seed new worlds and upgrades. The dev world is nearly empty today (floor 4: one desk, a chair,
  TVs; 1–3 bare).

## The design

### A. One spec a kind, in metres (shared)

`packages/shared/src/furniture/` — for each kind: its footprint, its **anchors** (seat top and
front, surface height and usable cells, stand height, hand points, screen rects, LEDs, the stool,
light points) and its **solids**. SHAPES, SEATS, `surface`, `STAND`, `partsOf`, GLASS and friends
read from it instead of their own numbers. The models are built to it; tests check every model's
bounds and anchors against it at 4 turns × every look. One place to change a chair's height.

### B. True scale

Every kind at real-world size for a 1.79 m person (seat 0.46, desk 0.74, counter 0.90…), measured
against the body on the bench. Seats feed `seatFit`; plan 62's sit spots, the typing hands, the
piano, the cooler and vending hands are refit and checked (the anim bench's own stills).
**Footprints don't change** (saves keep working, nothing moves); a model may sit inside its tiles
differently.

### C. A native furniture kit (client)

`world/furn/` — builders in metres writing into the **same `Out`** `MeshSketch` fills (`lit`,
`glow`, `clear`, `lines`, `soft`), so mounting, merging, fades, ghosts, the shadow proxies and the
cull stay as they are.

- Shapes: bevelled/chamfered boxes, lathe profiles (lamps, pots, mugs, legs, knobs), extrusions
  (chair backs, arms, frames, mouldings), tapered and turned legs, slats, cushions with seams and
  piping as geometry, cables as tubes, **foliage as low-poly leaf geometry** (no billboards left).
- Finishes: a named palette (walnut, oak, teak, black ash, cream laminate, brushed steel, chrome,
  brass, felt, leather, wool…) as vertex colour with per-face tone; `paint` picks the fabric.
- Printed things (book spines, posters, keycaps' legends, labels) from one small shared atlas, not
  a texture each.
- The look: facets + ink like the people; **the toon ramp on furniture** (decision 3).
- Each (kind, look, colour) built once and cached; budgets per kind in triangles (e.g. a chair
  ≤ 1.5 k); draws must not rise (they merge as now).

### D. Every kind redesigned, with its looks

All 99, by family (the inventory below). Each gets 2–4 curated looks where it makes sense (the Look
picker), its movable parts named (a chair's swivel, the lamp's shade, drawers, the vending flap) so
later plans can animate them. The four native ones (pool table, stairs, lift, cars) are restyled to
match, not rebuilt. Live overlays (screens, whiteboard, VU, VortexOS, pads, balls, slot cars) keep
working on the new glass rects.

| Family | Kinds | Today's worst |
|---|---|---|
| Seating | chair, armchair, sofa, beanbag, bench | chair base a card; all too low |
| Desks & tables | desk, meeting_table, coffee_table, side_table, reception, counter | boxes; 0.64 m desk |
| Storage | cupboard, bookcase, tape_shelf, locker, cart_shelf, disc_rack | 7–10 line boxes (locker, cupboard) |
| On desks | computer, monitor, radio, turntable, coffee_machine, 13 tabletops | handles, arms, leaves as cards |
| Screens | tv_wall, tv_hd, tv_giant, projector_screen, cinema_screen, projector, tv_console, tv_portable | lens/reels/handle cards |
| Games | crt_tv, 7 consoles | rabbit ears a card |
| Play & tech | arcade, slot_track, pool_table, pingpong_table, piano, vending, water_cooler, server_rack, crt_terminal | ball card; pool table restyle |
| Music | mixing_desk, speaker_cab, mic_stand | mic stand all cards |
| Lights | lamp (3 looks), desklamp, lamp_post | cords, arm, globe cards |
| On the walls | board_wall, screen_wall, whiteboard, notice_board, acoustic_panel, clock (live hands), neon, poster, light_switch, frame | clock hands only in thumbs |
| Doors & windows | 6 doors + archway, 9 windows | fine already; restyle, `CUTS` kept |
| Decor & floor | plant (5), succulent, partition, column, boxes, bin, cable, rug (3), standup_mat | all foliage cards |
| Pets | pet_bed, bowls, scratch_post, pet_house, **toy_box (no art)** | toy box missing |
| Outside | pk_* (6), bayboard | plain |

**New pieces** (decision 2), each a new catalog kind with its spec, solids and anchors from the
start: task chair on casters (swivels, a seat), standing desk (surface, two heights), filing
cabinet, printer/copier, open shelving (surface + top cells), fridge, microwave (on a counter),
bar stool (a seat) and high table (surface), phone booth (a one-person room, solid walls, a seat
inside), coat rack, wall shelf (a wall item with a surface), ceiling lights (pendant and panel:
a light each, hung from the slab). Interactions only where one already exists (the fridge and
microwave as the coffee machine's kind of use is a later plan).

### E. The Furnish panel

- Plan 45's frame kept; categories as labelled chips with counts (one scrolling row), phone layout
  kept.
- **Thumbnails rendered from the 3D models** (an offscreen renderer, once per kind/look/colour,
  cached for the session; or a sprite sheet at build time — whichever measures cheaper).
- A details strip with a slow turntable of the held piece; the Look picker as thumbnails; finishes
  as named swatches.
- Catalog fixes: toy box, plant as decor, monitor offered; categories tidied (an "Office" one —
  decision 2).

### F. The Office

Decision 1: new code layouts — floor 4's rooms furnished again
with the new pieces, floors 1–3 given real office layouts, the ground floor's lobby and offices
redone — plus new **templates** in build mode (open plan, meeting room, kitchen, lounge, focus
booths, reception). Applied to a world **only by choice** (a template you place, or an admin's
"refurnish this floor" with undo), never by a silent migration of a stored layout.

### G. Retire the iso art

When nothing draws through `MeshSketch` any more: delete `world/art/items/` (6.9 k lines),
`tp/kit3d.ts`, the `yutopia-item-art` chunk and the `/dev/items` iso sheet. The page and the 3D
chunk should shrink; budgets measured and noted either way.

## Phases

0. **Bench + mocks.** `/dev/furniture`: every kind × look on a turntable in a lit room, old next to
   new, day and night, a person standing and sitting by it for scale, tris and draws shown. Mocks of
   four heroes (chair, desk, sofa, plant) in 2–3 intensities of the look (facet density, bevels,
   ink weight, toon on/off) plus a Furnish panel mock. **Approve the language before anything
   else.**
   **Built 2026-11-03** (uncommitted): `/dev/furniture` (`world/furn/bench.ts`: today's piece by the
   game's own World3 in a room of the game's, the post's ink and grain, people sat and stood;
   `&look=toon&night=1&col=&thumb=`), the kit's first shapes (`world/furn/kit.ts`), the four heroes
   in three tiers (`world/furn/heroes.ts`: chair 548/3,432/4,712 tris, desk 156/1,416/1,872, sofa
   1,272/3,508/7,648, plant 640/1,880/3,244), the cel shade as the people's (`celShade`'s numbers on
   a static Lambert) and a stronger one (`toon(true)`, `&look=toon2`: deeper, harder, a third band;
   close-ups turned to the shadow side in `design/furniture/shade/`, SHADE=1), catalog pictures rendered from the models, the panel mock
   (`design/furniture/mock/panel.html`). Stills `design/furniture/` by `e2e/furniture-shots.mts`;
   review page https://claude.ai/artifact/VbQVtNsC3vF1nnKu8Peqbf. **Signed off 2026-11-03**: Rich,
   cel as the people, the panel as mocked.
1. **Spec + kit.** Shared `furniture/` specs (today's numbers moved in unchanged: no behaviour
   change, all tests green), the kit builders, the `Out` adapter, the bounds/anchor tests, thumbnail
   renderer. One kind (the chair) end to end behind a flag.
   **Built 2026-11-03** (uncommitted):
   - `packages/shared/src/furniture.ts`: SEAT_SPEC (the 3D view's seats, m), SURFACE and STAND (m);
     the catalog's `surface` and `standHeight` read them back in iso px (`isoPx`, exact), seats3d's
     SEATS is SEAT_SPEC. SEAT_NEXT holds the redrawn seats awaiting sign-off (the task chair, 0.47).
     The other anchors (GLASS, partsOf, LEDs, the stool, TABLES, SHAPES) move in with their own
     families (phases 2–8), as each is refit: moving them now would only copy numbers twice.
   - `world/furn/`: `flag.ts` (`?furn=new` draws what's built but not signed off, `?furn=old` none),
     `native.ts` (the kinds the kit draws: a model built once a look, turned into World3's lit
     buffers exactly as shared `turnPoint` turns the shapes, plan 62's `pull` kept, a contact
     shadow), `look.ts` (the cel in the world: the vertices marked by colour alpha 0.999, World3's
     one lit material shading them — one material, one merge, plan 38's draws unchanged),
     `seating.ts` (the task chair, from phase 0), `palette.ts`; `world/cel.ts` holds the people's
     cel bands, now shared by chars/model.ts (byte for byte) and the furniture.
   - The kit's `cushion` rebuilt: three's rounded box has no points mid-face, so phase 0's cushions
     never swelled (the chair's seat measured 0.41 for 0.47); now a cut grid, rounded by hand.
   - Checked: shared 529, client 187 (new: furniture.test, cel.test, furn/native.test — on its
     tile, the seat at its spec, every turn as turnPoint, the pull, the cel mark; seats3d.test sits
     every body on SEAT_NEXT too); in the game as Bia, `/?furn=new` draws the new chair at a desk on
     floor 4, no console errors.
   - Moved to phase 9: the catalog's pictures from the models (the bench's `runThumb` proves the
     renderer; the panel's rebuild is where it lands).
2. **Seating** — at true scale; `seatFit`, sit spots and plan 62's desk spots refit; anim bench
   stills sitting on each.
   **Built 2026-11-03, on the bench** (uncommitted; `/dev/furniture?kind=…`, `?furn=new` in the
   game): `world/furn/seating.ts` — each kind's looks are its `variant`s, its old story details a
   seeded extra:
   - chair (4): mesh task chair (look 0, phase 0's), padded task chair, bentwood chair, executive
     chair; story: a cardigan on a task chair's back. Seat 0.47 for all four.
   - armchair (2): 70s lounge chair, leather club chair; story: a doily on the back or the paper on
     an arm. Seat 0.44, arms 0.6.
   - sofa (3): three-seat (phase 0's), Chesterfield, mid-century; story: a blanket over an arm. Seat
     0.455; each back's face moved to ~0.1 behind the middle so one spec sits all three.
   - beanbag: slumped low in front, heaped behind, dented, two seams. Sat into 0.33.
   - bench: slatted teak on walnut trestles; story: a scarf. Seat 0.45.
   - SEAT_NEXT holds all five; `native.ts` draws all five with `?furn=new`, an unset look as look 0
     (a room's chairs match), a sat-on one sunk (`props.occupied`).
   - Checked: native.test (every kind × look × story × sat: on its footprint, on the floor, the seat
     by a ray down at its spec, < 8 k tris), seats3d.test sits three bodies on every new seat.
   **At sign-off, into the world**: SEAT_NEXT → SEAT_SPEC, the seats' SHAPES (physics) to the new
   sizes, catalog `look: 0` for chair, armchair and sofa, `signed: true`. **The desk chair waits on
   the desk**: a 0.47 seat at today's 0.64 desk puts the thighs into its top. **The user's call
   (2026-11-03): seating goes into the world with phase 3's desks**, together; no changes named to
   the looks.
3. **Desks, tables, storage** — desk height, typing hands, `DESK_PULL`, tops' cells; `build-tops`
   e2e.
   **Built 2026-11-03, on the bench** (uncommitted): `world/furn/tables.ts`, `storage.ts`.
   - desk (4 looks, today's four finishes, each with its own legs: walnut slab ends with brass shoes,
     oak on white sleds, cream with chrome C-legs and a rust modesty panel, black ash on A-frames).
     A 2×1 desk seats two (the pods and rows templates), so its underside is free along the whole
     sitters' side: the legs at the ends, a modesty panel and a cable tray at the back, no drawer
     pedestal. Top 0.74, nearly the whole footprint.
   - meeting table (top 0.74, the planning-poker VFD strip lit: the kit's first `glow` parts),
     coffee table (0.42, a shelf with magazines), side table (0.55, turned legs, a drawer), reception
     (a 0.74 work surface behind a raised 1.05 stone ledge on a fluted front: tabletops on the work
     surface, TOP_NEXT [0,0,12,3]), counter (0.90; stone or teak; shaker doors, the sink and tap,
     a tea towel story).
   - storage: cupboard (0.85), bookcase (1.8; three finishes; books, stacks and a trailing plant
     seeded by its id), tape shelf (1.12; three finishes; four rows of cassettes), locker (1.85),
     cartridge shelf (0.8), disc tower (1.38; black or walnut). Small repeated things are plain
     boxes (a rounded box is nine times the triangles).
   - SURFACE_NEXT, TOP_NEXT, STAND_NEXT in shared furniture.ts; the bench seats someone typing at
     each desk on its chair, pulled in (`?kind=desk&col=1&sitters=1&turn=1.25`): at the new pair
     the thighs pass under the top, the hands at its keyboard height.
   - Checked: native.test — on the footprint, the top at its spec under every quarter-tile cell a
     tabletop can use (it caught the meeting table's and coffee table's round corners), < 8 k tris,
     and nothing where a desk's sitters' knees go, either tile.
   **Live 2026-11-03 (signed off by the user; seating and desks together)**, uncommitted:
   1. Shared furniture.ts: SEAT_SPEC, SURFACE and STAND at true scale (desk 0.74, counter 0.90,
      chair seat 0.47…); the *_NEXT tables empty, kept for the next families. The catalog's
      reception `top` is its work surface ([0,0,12,3]); `look: 0` on chair, armchair, sofa,
      bookcase, tape shelf, counter, disc rack (a room's pieces match until one's picked).
   2. SHAPES (physics) for the 17 kinds from the kit's measured bounds, every look (shapes.test
      green); `native.ts` marks the 17 `signed` — drawn for everyone; `?furn=old` still shows the iso
      art (sat on at the new heights).
   3. **Tabletops lifted**: shared `topsOnHosts` sets each placed tabletop's `props.z` from its host,
      floor by floor, once; WorldRoom runs it on load and saves what changed. On the dev world it
      lifted 2 (the floor-4 desk's computer and portable TV, 25 → 28.999 px).
   4. Typing, the keyboard height, the hand points and the light points read the catalog already:
      keys3d, uses3d, seats3d green unchanged.
   5. Tests moved to the new sizes (build, jump, reach, kinds: the desk 0.64 → 0.74; the chair's
      look 0 not seeded); build-tops e2e reads the desk's height from the catalog.
4. **On desks** — computer/monitor (VortexOS glass), keyboard keys, all 13 tabletops, radio,
   turntable, coffee machine (hand points).
   **Built 2026-11-03, on the bench** (uncommitted): `world/furn/desktop.ts` — the computer (putty,
   graphite: its glass on shared COMPUTER_GLASS, its bezel a frame round it, never over the picture's
   plane), radio, turntable, espresso machine (its buttons and cup where partsOf puts the hands; these
   three face the room, +z, as the iso art had them: the kit's `facing`), and the desk things by
   `props.d` (keyboard, anglepoise lamp lit when on, phone, mug, papers, book, binder, tapes, record,
   photo, succulent, poker cards, bell) and the dressing's old monitor. The rooms' dressing draws
   through the same models (`nativeDressInto`, World3.drawDress). `nativeInto` now frames every
   kind as the physics does (shared `frameOf`: a thing on a surface round its middle, lifted).
   Bench `?scene=desk|hosts`, things on their own `?thumb=2&kind=tabletop&d=…`; the bench's
   "Today" always the iso art (`useFurn("old")`), sat on and typed at today's heights.
   Checked: in their frame and on their top, < 3–4 k tris, a dressed mug and a placed one alike,
   nothing in front of the computer's glass (rays across it). Review:
   https://claude.ai/artifact/BeNxqAVnUW8Gx4FTK4bPXD.
   **Live 2026-11-03 (signed off by the user)**, uncommitted: `signed` on computer, radio,
   turntable, coffee machine and tabletop (the dressing with them); shared `KEYBOARD_TOP` 0.03 m
   (view.ts KEYBOARD_H reads it: typing at the new keys); SHAPES for the five from the models' own
   frame bounds (the tabletop's one box the mug's, the kit's default thing the mug). Checked:
   shared 530, client 192 (shapes, keys3d typing, uses3d green), world-server 192/194 (the snow
   melt red on HEAD; the fire bench passed alone — timing under load), build-tops' desk dressing
   e2e green (its bin test red as before), in the game as Bia no errors, budgets as they were.
5. **Screens + games** — GLASS/TV_SCREEN rects, LEDs, pads and cables still land.
   **Live 2026-11-03** (the user: "finish all phases go" — phases 5–11 built and put in the world
   without stopping for each sign-off; changes on call), uncommitted: `world/furn/screens.ts` — CRT TV
   (wood-grain, black; its stand and shelf, rabbit ears), console TV (walnut, teak), portable TV (red,
   cream), projector, wall TV (grey, black), HD TV, giant TV, projector screen, cinema screen (and
   curtained), the seven consoles (the NES a front or top loader, the slim with its screen). Every
   screen's glass a hair behind the plane its live picture is drawn on (media.ts GLASS, games.ts
   TV_SCREEN), its case further behind, nothing in front; the consoles' LEDs where world/games/room.ts
   lights them. Wall kinds go native in World3 (hung in the wall's frame); the bench hangs them on its
   back wall. SHAPES from the models; STAND crt_tv 1.13. Checked: native.test (the glass first across
   each picture, just behind its plane; the LEDs within 2 cm), shapes, client 193, shared 530.
6. **Play, tech, music, lights** — arcade, slot track (tops), pool (restyle), ping-pong, piano
   (stool, keys), vending, cooler, server rack, terminal, mixing desk, speaker, mic, the lamps.
   **Live 2026-11-03**, uncommitted: `world/furn/play.ts` at true scale — arcade (1.8 m, its panel at
   0.98, the screen tipped back, coin door), vending (slate, rust; 1.8 m, lit window of cans and
   snacks), water cooler, upright piano (walnut, black lacquer; keys at 0.74, its bench 0.5),
   ping-pong (blue, green, slate), server rack (glass, mesh, open frame with patch cables; 2 m),
   Vortex's terminal on its cart, mixing desk on its stand (a sloped face, the meter bridge lit),
   speaker cabinet, mic stand, the floor lamps (drum, arc, paper globe; the shade lit when on, its
   colour the paint), the lot's lamp post, and the slot track's whole diorama (its circuit by
   `props.track`: tarmac, slots and rails, kerbs, sand, the grid; grandstand, lap tower, garage,
   pines, boards, the controllers).
   - Shared furniture.ts: `TABLE_TOP` (pool 0.79, ping-pong 0.76, slot track 0.76 — tables.ts
     TABLES.top and slotcar.ts SLOT_TOP read it; the balls, cars and gantry follow; the pool model's
     cloth from TABLES, its 3D restyle otherwise unchanged); `HANDS_AT` (the cooler's tap and cups,
     the vending keypad and flap, the piano's keys and keybed: tp/view.ts partsOf reads them); the
     piano's stool 0.5 (SEAT_SPEC.stool) and PIANO_STOOL 1.27 → 1.1 (0.2 m from the keys' front, the
     knees under the keybed); STAND for the redrawn tops.
   - SHAPES from the models' bounds. The jump test's "a flip lands on top" moved from the arcade (1.8
     now) to the speaker cabinet (1.17).
   - Checked: native.test (footprints — the bench, the net's posts, the arc lamp's shade and the lamp
     post's arm allowed out; the tables' tops at TABLE_TOP; the keys and the bench; each hand part
     just behind where it goes; a lamp lit only when on), keys3d (sat at the piano: the hands on the
     keys, the knees under the keybed), shapes; client 194, shared 530. Stills
     `design/furniture/play/`.
7. **Walls, doors, windows** — the clock's live hands; `CUTS` and sills unchanged.
   **Live 2026-11-03**, uncommitted: `world/furn/walls.ts`, in the wall's frame (its face at z 0.1,
   out from it): board wall (walnut round smoked glass, the VU on it), big screen (bezel, soundbar,
   ON AIR lamp), whiteboard (aluminium, its tray and markers), notice board (cork in walnut or oak, a
   felt pinboard with ribbons; notes, pins, a polaroid by its seed), acoustic panel (foam pyramids),
   wall clock, neon (cup, heart, bolt: lit tubes on a smoked backing on standoffs), poster (by
   `props.art`: cassette, VU, sunset), light switch (its rocker by `on`), picture frame (its picture
   by `props.seed`). Each board's surface just behind where its live picture is drawn (model.ts
   keepDisplay/keepWhiteboard: 0.16, 0.165), its frame round it. **The clock's hands live**:
   tp/live.ts draws them on its face (`CLOCK_FACE`), the time where you are, one clear canvas for
   every clock redrawn as the minute turns; its pictures (`_thumb`) show ten past ten. Catalog
   `look: 0` on the looks of phases 6–7 (vending, piano, ping-pong, rack, neon, notice board): the
   neon's light (art/light.ts, variantOf) the colour drawn. SHAPES from the models (their backs on
   the wall's face, not 6 cm into it).
   **Doors and windows keep their drawings** (as the table above has it, "fine already"): their
   leaves swing and slide as parts (`_part`), they cut the walls (`CUTS`) and draw by World3's own
   path for openings; redrawing them is left for a later plan — so phase 11 retires the iso art
   only where nothing draws through it.
   Checked: native.test (on the wall's face within the footprint; the boards' surfaces just behind
   their live pictures across them), shapes; client 194.
8. **Decor, floor, pets, outside** — real foliage, rugs, the toy box's first art, parkour, bayboard.
   **Live 2026-11-03**, uncommitted: `world/furn/decor.ts` — plants (the monstera, phase 0's; a snake
   plant's swords in a banded cream pot; a fern arching off a walnut stand; a rubber tree; a bowl of
   cacti, one in flower by its seed: folded, bent leaves, no cards), the room divider at 1.25 m
   (upholstered in its paint, teak slats, frosted glass), the column, rugs (medallion, kilim, shag; the
   field its paint), the standup ring, for pets (cushion bed, wicker basket; the bowls showing what's
   left in them; the scratching post; the pet house, its walls the paint, walnut or rust roof; **the toy
   box's first drawing**: a chest, its lid ajar, a ball, a bone and a rope knot), the parkour pieces to
   their shapes' numbers (rails, walls, poles), and `decor` and the rooms' floor clutter (boxes, bin,
   cable, a plant) through one set of models (`nativeDressInto`). A plant's leaves reach over the next
   tiles and are walked through (its shape the pot; shapes.test's `SOFT`). STAND toy_box 0.5. **The
   name board keeps its drawing** (the bay's name painted on it, a picture of its own).
8b. **New pieces** — the staples above: specs, models, solids, catalog entries, server checks
   (placement, seats, the booth's walls), shared tests.
   **Live 2026-11-03**, uncommitted: `world/furn/staples.ts`, new catalog kinds — standing desk (oak,
   white; its top 1.05), filing cabinet (grey, green; a drawer left out), copier, open shelving (oak,
   black steel; its top 1.2, things on its shelves by its seed), fridge (cream, steel), microwave (on a
   surface), bar stool (walnut, chrome; seat 0.76, **its feet on the ring**: SeatSpec `rest` 0.3, the
   sitter's floor — tp/person3d.ts), high table (1.05), phone booth (a seat inside felt walls, the front
   open; seat 0.46), coat rack, wall shelf (on the wall, 1.45 m up), pendant light and ceiling panel
   (at the ceiling, 3.27; their lights at their height — catalog `light.h`, art/light.ts; switched off by
   the room's switch: world-server mapedit `isLamp`). The chair's task chairs (mesh, padded) were
   already its looks, so no separate kind. SEAT_SPEC bar_stool, phone_booth; SURFACE standing_desk,
   high_table, shelving; STAND filing_cabinet, printer, fridge; HANG_SIZE wall_shelf; SHAPES from the
   models. The second height of the standing desk is left for a later plan (one top, 1.05).
   Checked: native.test (tops and seats at the spec, on the footprint, the ceiling lights at the ceiling
   and lit only when on), seats3d (sat on every seat, the bar stool's feet on its ring), shapes; client
   197, shared 530.
9. **The Furnish panel** — reskin, 3D thumbnails, turntable, Look picker, catalog fixes.
   **Live 2026-11-03**, uncommitted:
   - **Pictures from the models**: `world/furn/pictures.ts` (lazy, one offscreen renderer: the cel and
     the post's ink as the world; a data URL a kind, look and paint, kept for the session; doors,
     windows and the cars keep their drawings) — every card, the Look pickers (the selection's
     toolbar too) and the setups' rows.
   - **The panel as mocked** (components/hud/build/Catalog.tsx): the categories as labelled chips
     with counts in one scrolling row (Layouts and Setups at its end); cards with their looks as
     dots and NEW on plan 67's new pieces; **the held card** while placing from the catalog — the
     piece on a slow turntable (drag to turn; 20 frames a second through the same renderer), its
     size and spec (seat or top height, light, use, wall), its looks as pictures by name, its fabric
     or paint as twelve named swatches (the name of the picked one shown); what's picked goes down
     with it (build controller `placeLook`), **L** the next look (placing, or the selection).
   - Categories tidied: Storage and Office (the new pieces: copier, phone booth, divider, cooler,
     vending, fridge, microwave, the espresso machine), Lights (floor lamp, pendant, ceiling panel,
     desk lamp); catalog fixes — the toy box offered, a plant as decor, the monitor offered on desks
     (shared DECOR.tabletop).
   - Checked: in the game as Bia (build mode opened, nothing placed: the chips, the Office cards, a
     sofa held — L to the Chesterfield, Olive — no console errors), client 197, budgets (page 429.5 of
     430 KB, +1.2).
10. **The Office** — floor 4, floors 1–3 and the ground floor's layouts as templates (mocked as
    stills on the bench first), an admin's "refurnish this floor" with undo, build mode's new
    templates.
    **Built 2026-11-03**, uncommitted — as **room plans** rather than fixed per-floor layouts (they
    furnish any room, on any floor, by its own rectangle — the HQ's floors included):
    - shared `office.ts` (`@yutopia/shared/office`): six plans — open plan (pods of four with two
      tiles of aisle, the copier, a filing cabinet, water, pendants), meeting room (the long table,
      chairs round it, two pendants over it; a small room a coffee table), kitchen (counters along the
      back wall or the first clear row, the fridge, the espresso machine and a microwave on them, high
      tables with stools), lounge (rug, sofa, armchairs, coffee table, lamps, bookcase, a bean bag),
      focus booths (phone booths, dividers, standing desks), reception (the desk facing the way in,
      the visitors' sofa and table, the coat rack, pendants); every piece only where the one placement
      rule allows (build.ts canPlace), never on a door's tiles, a standup corner or a stage, nothing
      solid before what hangs on a wall, never onto someone standing there; the desks dressed
      (splitAll). `planFor` reads a room's name (War Room → meeting, Lobby → reception…);
      `refurnishFloor` furnishes every room of a floor (not corners, stages, corridors or the server
      room). What's taken out: the furniture only (`furnishes`), never the walls' things, doors,
      windows, screens, games, stairs or lifts.
    - world-server `features/office.ts`: `build:furnish {plan}` (a builder: the room they stand in),
      `build:refurnish` (an admin: their floor; a builder is told no); the old pieces removed and the
      new put down at once (saved as they land), **undone by the build history** like any step
      (shared history.ts STEP_LABELS "furnished a room", "refurnished the floor": Undo puts it all
      back).
    - The panel's Layouts tab: "Furnish this room" (the six plans, each confirmed), "Refurnish the
      whole floor" for admins; the Tracking Room's three templates kept as they were.
    - On the bench: `/dev/furniture?room=…&plan=…` draws the studio through the game's own World3 with
      a room furnished by a plan, from over its south wall; stills `design/furniture/office/`.
    - Checked: shared office.test (each plan in five of the studio's rooms: inside the room, put down
      where it can go among what stays; a floor by its rooms' names, its corners and corridors left
      alone, ids unique), world-server rooms.test (a builder furnishes the lounge — its old furniture
      out, the new in — Undo puts it back exactly; a builder's refurnish refused).
    - Not done: the per-floor fixed default layouts the plan first named (floors 1–3, the ground
      floor) — the plans cover them by choice; nothing in a stored world was changed.
11. **Retire the iso art + checks** — delete G; full shared/client/server tests, e2e build specs,
    `merge-ab`, `lag.spec` at the user's view (Tracking Room, floor 4, evening, ~2000 px), budgets.
    **2026-11-03 — the art kept, the checks run:**
    - **The iso art isn't retired yet**: doors and windows (their swinging leaves, the walls' cuts),
      the stairs and lifts' stops, the cars, the name board, the Grounds and the karts still draw
      through `art/items`/MeshSketch; and `?furn=old` with the bench's "Today" columns need the old
      drawings until the user has seen phases 5–10 in the world. Retiring the redrawn kinds' old
      drawings (and `?furn=old`) waits on that sign-off; the rest waits on a doors-and-windows plan.
    - A/B as Bia at her own spot (the furniture old against new, twice each, on the GPU at 2×): 3D
      draw calls 409/411 new against 411/419 old (the guardrail: not above today's); a frame stepped
      by hand 11.1/10.9 ms new against 12.0/10.3 old (within the noise).
    - Budgets: page 429.5 of 430 KB (+1.2 for the panel), every chunk within its budget.
    - Tests: shared 532, client 197 (the panel's fabric swatches take the shared CLOTH_COLORS: no
      colour of the HUD's hard-coded — components/colours.test).
    - Not run: `lag.spec` (it signs in as Ana and switches the world's dark off while it runs — the
      user's call) and the e2e build specs (they put a fixture world over the dev world: back it up
      first, WorldSnapshot export).
    **Quality pass, 2026-11-03** (the user: "double check on everything and check quality"): a close
    still of every look of every phase 5–8b kind (101), fitted pictures of the tall and hung ones, the
    lit ones at night, the Furnish panel's every category in the game as Bia, and an independent
    review of the code. Fixed:
    - **Unset looks as before**: native `lookOf` now reads shared `variantOf` with the iso art's id
      seed (the catalog's `look` where a room should match, else by the id) — every unpicked plant,
      TV, column, partition… had become look 0, and an unpicked slim console could show the game
      room's LCD over a model without one.
    - Models: the glass-door rack hid its units in a solid body (now a cabinet open to its door); the
      top-loader's and the slim console's power lights floated off their bodies (bodies out to
      room.ts's points; native.test now casts onto each light's body); the wicker basket's and the
      cushion bed's square cushions poked through (round); the bar stool's square pad (round); a box
      on the open shelving spilt past its end; the vending window bloomed white at night (dimmer
      glow, the cans read).
    - The rooms' own wall frames (dressing) drawn by the new frame model.
    - Room plans: seats at a table's ends faced away (rot 1 is −x: swapped); what stood on a removed
      top was left floating (it goes with its host now); someone's own desk (a seat with an owner, the
      desk at it) stays; every furnishing gets its own ids (re-furnishing raced delete and put on one
      id); a top's host found on the furnished floor only.
    - Catalog: the monitor isn't offered after all (the server turns a placed one into a computer on
      load: shared computer.ts monitorsToComputers); open shelving's top is its shelf's cells
      `[0,1,8,3]`, the high table's its round top's `[1,1,3,3]`.
    **Jolt pass, 2026-11-03** (the user: "check jolt collision on furniture"): only `solid` kinds are
    bodies in Jolt (`thing:id`, their SHAPES; seats, wall pieces, rugs and the ceiling lights aren't).
    A column audit (the model's top against the shape's every 10 cm over each footprint) found
    invisible walls and wrong tops the bounds check couldn't: the room divider's box was its feet's
    depth all the way up (now the feet and the thin screen); every floor lamp carried the arc lamp's
    head box at 1.6–2 m beside it (dropped: the arc's head walked under); the piano's case box ran over
    its keys (now the case to 1.27 and the keybed to 0.76); the slot track's 1.5 m strip along its whole
    back (now the stand, the lap tower and the floodlight's mast); `decor` was one 0.57 m box for all —
    a floor cable an invisible waist-high wall (now by props.d: `DECOR_PARTS`, the rooms' clutter
    passing what it is too: physics/build.ts); the coat rack a 0.6 m block (its feet and post, the
    coats brushed past); the pet house flat at 0.77 (its ridge over its walls); the CRT TV's cabinet
    over its whole stand, and its rabbit ears solid (a body jumped up slid off their tips to the
    floor — not solid now). Stand heights where Jolt really puts you: pet house 0.72 (the ridge),
    terminal 1.16 (its top; the cart's edge too narrow). New `physics/furniture.test.ts`: every solid
    kind at two turns, walked at from four sides along its middle — stopped where something stands
    between a climb (0.45: the capsule rides up a 0.42 coffee table) and a head, never inside it or
    through it — and dropped on, landing at its stand height. shapes.test `SOFT` + lamp, coat rack,
    CRT TV (drawn past their shapes). Checked: shared 534, client 197, world-server 193/195 (snow melt
    red on HEAD; vortex flaky under the full suite, passes alone).
    - Noted, not changed: the phone booth is `solid: false` (a seat, like a sofa: its walls are in the
      physics but click-to-walk paths pass them).
    - Checked after: shared 533, client 197, world-server 193/195 (snow melt red on HEAD; ping-pong
      flaky under the full suite's load, rooms.test 52/52 alone); the panel's every category shows
      pictures from the models (doors, windows, the pool table, stairs, lifts and cars their drawings),
      no console errors.

Each family phase: on the bench → signed off → in the world → its tests → committed.

## Guardrails

- Footprints, kinds, `props.variant` indices and saves don't change; a look that goes away maps to
  its nearest new one.
- No billboard cards on furniture when done.
- Draw calls in a furnished room not above today's; frame time at the user's view not worse
  (`lag.spec`, A/B back to back).
- Every anchor comes from the spec; no new hand-copied numbers.
- Shadow lights and fades as plan 38 left them (`three-shadow-light-no-map`, two-sided glass split).
- No deep compares of three objects in tests.

## Decisions (the user, 2026-11-03)

1. **The Office: refurnish + templates.** New default layouts for the HQ (floor 4's rooms, real
   offices on floors 1–3, the ground floor's lobby and offices) and new build-mode templates;
   applied to a world only by choice, with undo (F). The room plan itself stays.
2. **Redesign the 99 and add office staples** (D, "New pieces"; phase 8b).
3. **Cel, as the people** (picked on phase 0's wipe, 2026-11-03): the furniture takes the people's
   `celShade` numbers (the cool side from a light over the viewer's left shoulder, the warm rim), not
   the bench's stronger option nor soft Lambert.
4. **True scale** (B): seat 0.46, desk 0.74, counter 0.90; sitting, typing, the piano and the hand
   points refit and checked on the anim bench.
5. **Rich is the house standard** (phase 0's pick, 2026-11-03): every piece is built at the rich
   tier — piping, tufting, hardware, split leaves. Tris are watched per kind (the rich sofa 7.6 k);
   where a room's count would hurt frame time (`lag.spec` at the user's view), a far LOD drops the
   small parts (buttons, piping, casters' forks) rather than the tier being lowered.
6. **The Furnish panel as mocked** (phase 0's `design/furniture/panel-mock.png`): labelled category
   chips with counts, pictures from the 3D models, a held-piece card with a turntable, the looks and
   named fabrics (phase 9).
