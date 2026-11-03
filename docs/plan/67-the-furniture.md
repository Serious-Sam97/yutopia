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
5. **Screens + games** — GLASS/TV_SCREEN rects, LEDs, pads and cables still land.
6. **Play, tech, music, lights** — arcade, slot track (tops), pool (restyle), ping-pong, piano
   (stool, keys), vending, cooler, server rack, terminal, mixing desk, speaker, mic, the lamps.
7. **Walls, doors, windows** — the clock's live hands; `CUTS` and sills unchanged.
8. **Decor, floor, pets, outside** — real foliage, rugs, the toy box's first art, parkour, bayboard.
8b. **New pieces** — the staples above: specs, models, solids, catalog entries, server checks
   (placement, seats, the booth's walls), shared tests.
9. **The Furnish panel** — reskin, 3D thumbnails, turntable, Look picker, catalog fixes.
10. **The Office** — floor 4, floors 1–3 and the ground floor's layouts as templates (mocked as
    stills on the bench first), an admin's "refurnish this floor" with undo, build mode's new
    templates.
11. **Retire the iso art + checks** — delete G; full shared/client/server tests, e2e build specs,
    `merge-ab`, `lag.spec` at the user's view (Tracking Room, floor 4, evening, ~2000 px), budgets.

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
