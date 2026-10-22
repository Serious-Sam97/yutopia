# The look — refining every part of the Grounds (plan — decided 2026-10-22)

> Follows `27-the-grounds.md` (the land, the woods, the town) and `31-the-day.md`
> (the farm). Workflow rule: every phase starts with stills sent for approval.

Ask (2026-10-22): "We have a nice little open world, but I never had the chance
to refine each detail — each terrain, each tree, each house, the barn, the
objects. Analyse every element, then we'll think how to improve each one."

The audit (every element, with stills, bugs and ideas):
https://claude.ai/artifact/GkiFkPb2u6E5Cz4yDsJZLb — in short, the problems are
seven patterns, not single objects: everything is boxes under one Lambert with
vertex colour (A); one builder, many copies (B); snow pasted on, never settled
(C); things that don't sit on the ground (D); quality uneven side by side — the
farm and the sedan far above the town and the bus (E); 3D and iso drifting apart
(F); missing things — rocks, shrubs, street furniture, sun and moon (G).

## Decided (2026-10-22)

| Question | Answer |
| --- | --- |
| Art direction | **Stylized**, not realistic: flat-shaded facets and flat colour, an **ink line** on the world like the people's (ligne claire), blue in the shade and warm in the light, the woods varied, soft occlusion. The realistic mock (PBR, normal maps) made the people look pasted on and costs more GPU. Mock renders: `/dev/grounds?shot=…&look=styl\|real` (the audit's "Direção de arte"). |
| Order | The cross-cutting passes first (they lift everything at once), then zone by zone. |

## Phases

| # | Phase | What |
| --- | --- | --- |
| 1 | **The look, in the game** | The ink pass (edges from the depth the frame already has — no second render of the scene), the grade (blue shade, warm light), flat shading on the Grounds' materials, each tree its own shade; High and Medium. The quick bugs from the audit: the courtyard bridge stopping in mid-air, the comb shadows along the roads, the barn's stair-stepped X braces, the town cars' glass turned against their bodies, the town's ninth car colour. Stills from the game itself. |
| 2 | **Snow that settles** | Roofs with thickness and eaves; drifts along every wall, not only the blocks'; continuous plough banks instead of beads; snow on sills, rails, cars and props; icicles. |
| 3 | **The woods and the ground** | More tree shapes, scale and lean per tree, clumps and clearings, far impostors for birch and bare trees, wind; rocks, shrubs, stumps, fallen logs; trails sunk into the snow; the pond's ice. |
| 4 | **The town** | A façade kit (false fronts, cornices, framed windows), 3–4 house types and colours with the farmhouse's trim, the church and town hall their own, street furniture. |
| 5 | **The landmarks** | Bridges with rails and trusses, the water tower on legs, the gatehouse, the shed, the dock, the fence. |
| 6 | **Vehicles and life** | The sedan's own LODs for every car, a real bus, the guard's flashlight, snow on people. |
| 7 | **Iso parity** | One description per object read by both views. |

## Phase 1 — the look, in the game

- `tp/ink3d.ts`: a pass after the scene's render reading its depth (the
  composer's targets carry a depth texture). An edge where 1/depth stops being
  linear across the screen: a plane's is linear, so only silhouettes and
  creases ink, never a floor at a grazing angle. Fades with distance (fog keeps
  the far woods clean), softer at night. The first person's hands are drawn
  after it (no ink).
- `post3d.ts`: the finish's warm tint becomes the grade; Post3 runs on Medium
  too (no bloom, no grain there); Low draws straight to the screen as before.
- `grounds3d.ts` / `grounds-stream.ts`: flat shading on the Grounds' Lambert
  materials and the land; a colour per tree instance.

### Delivered (2026-10-22)

- **The ink** (`tp/ink3d.ts`, in `post3d.ts` after the scene's render, before the
  first person's hands): `|i(l) + i(r) − 2 i(c)| / i(c)` over 1/depth in four
  directions — silhouettes and creases ink, a floor at a grazing angle doesn't.
  Fades from 18 to 90 tiles, 0.8 by day → 0.4 at night. Indoors too (the rooms'
  walls and furniture get the same line).
- **The grade** (the finish): the shade × (0.84, 0.91, 1.06), the light × (1.01,
  1.0, 0.97), saturation × 1.1; in place of the old flat warm tint.
- **Medium** runs Post3 too (`lite`: the ink and the grade, no bloom, no grain);
  Low draws straight to the screen as before.
- **The Grounds' light** (`light3d.ts` `patchGrounds`): flat shading on every
  Grounds material; the hemisphere's ground half there is the sky's light ×
  `landBounce` (0.68, 0.77, 0.92) — the rooms' warm brown bounce had turned the
  snow beige.
- **The woods**: each tree instance its own value (0.84–1.10) and warmth, the
  snow on it left white (`grounds-stream.ts`, the trees' `color_vertex`).
- **Fixed**: the courtyard bridge spans the headquarters' east wall to the east
  block's west one (read from `BUILDINGS`), mullions every 2 tiles; the road's
  verges a ragged line of wrapping sines (the row of flat ellipses was the
  "comb" down every road and street) and the tyre tracks a little off straight;
  the plough banks only take shadows (their beads cast scallops); the barn's X
  braces two straight boards; the ice patched as the land (it stayed bright at
  night); the town cars' glass turned with the body; all nine car colours in
  town.
- **Review shots from the game**: `e2e/look-shots.spec.ts` (YUTOPIA_SHOTS=<dir>,
  YUTOPIA_SHOT=<name>) — the lot, the courtyard and the bridge, the driveway, Main
  Street by day / dusk / night, the farm and the barn, the ravine, the pond at
  night, the lobby. The `/dev/grounds` stills light their own way (ACES,
  exponential fog) and aren't the game.
- **Checked**: shared 242, client 23, world-server 112; typecheck; Biome on the
  touched files; `lighting.spec` (no GL errors at every quality, the lamps, the
  day's light) and `grounds.spec` High: 60 fps at the lot, the square and the
  woods, day and night (GPU); world page 553.9 ≤ 555 KB.
- **Not done**: the flashlight's green halo and the lamp pool's hard edge were
  seen in the `/dev/grounds` stills only — to look for in the game in phase 2.

## Phase 2 — snow that settles: delivered (2026-10-22)

- **The kit** (`tp/snow3d.ts`), all faceted, lumpy by a smooth noise along its
  run (`wobble`), standing on the ground where it is:
  - `ridge` / `driftAlong` / `bankAlong`: a continuous ridge with a cross-section
    — drifts banked against walls (tapered at the ends, open at doors), the
    plough's banks along roads and streets (kerbside heaps with gaps on the
    streets). In place of strings of squashed spheres.
  - `slopeSnow`: snow on a slope with a thickness, lumps along the eave, a lip
    curled over the edge and icicles under it — every pitched roof, the shops'
    awnings, the porches.
  - `flatSnow`: lumps on a 2-tile grid, lower at the edges — the shops', the
    gatehouse's, the shed's, the bus shelter's, the gas station's tops.
  - `icicles`: three-sided, odd lengths, now and then a long one.
- **Roofs** (`pitched`): boards with an edge — a soffit under the overhang, a
  fascia along the eaves, rake boards up the gables; the gables in their walls'
  colour (they were beige on the red boathouse and the white church).
- **Every building** (`settle`, but the blocks, the silo, the shelter and the
  gas station): drifts round its walls except its front where it meets a
  pavement, a porch or the water (the church and the barn keep theirs, open at
  the door); its windows' sills, snow on them. The headquarters' and the
  blocks' drifts are ridges too (`campus.ts`, `block`), open at the doors.
- **The lot's banks**: ridges strung through `lotBanks()`'s positions along each
  edge, broken where they're apart (the driveway, the path).
- The roads' banks only take shadows (a long low ridge's own came out jagged).
- **Checked**: client 23; typecheck; Biome; `grounds.spec` in 3D (the walk out,
  the campus, the woods, the town: worst frame 17 ms), High 60 fps at the lot,
  the square and the woods by day and at night, `lighting.spec` no GL errors;
  world page 553.9 KB.
- **Not done**: iso draws none of it yet (phase 7); snow on the cars, people and
  props stays as it was (phase 6).

## Phase 3 — the woods and the ground: delivered (2026-10-22)

- **More spruces**: `pineGeometry(r, { tiers, H, width, snow })` — besides the
  usual three, a young one (5 tiers, 6.5 tall), a tall thin one (9 tiers, 13.5)
  and an old broad one heavy with snow; mixed 60 / 15 / 13 / 12 % by a hash of
  where each stands.
- **Each tree its own**: a lean of up to ±2.6°, girth ×0.9–1.1 on each axis (a
  hash of its position: the same for everyone), on top of phase 1's shade.
- **Wind**: the crowns sway in the vertex shader (by height², each tree in its
  own time); harder in a storm (`sky.ts` → `GroundsStream.wind`).
- **Far birches and bare trees** (`farBirchGeometry`, `farBareGeometry`): a
  trunk and a few limbs past the near tier — they used to vanish there.
- **Snow mounds** under birches and bare trees too; the mound a finer half-dome
  (a coarse one, faceted, was a heap of shards).
- **The woods' floor** (`tp/woods3d.ts`, per chunk from its own seed, near
  you only): shrubs (green under snow, twigs poking out), stumps, fallen logs,
  stones in deep snow; boulders and stones on the steep rock. Low or out of the
  way: not in the walking grid (server and client agree without it).
- **Trails trodden down**: a low berm either side (`bankAlong`, open where
  another way crosses and on the footbridge).
- **The pond**: the ice dark and smooth where the wind swept it, snow in long
  drifts one way, white cracks (a new `iceCanvas`, rougher 0.38); a snow lip
  all round its shore (but at the dock).
- **Checked**: client 23; typecheck; Biome; `grounds.spec` 3D worst frame 17 ms;
  High 60 fps at the lot, the square and the woods by day and at night;
  `lighting.spec` no GL errors.
- **Not done**: the steep rock is rare inside the fence (the ravine's walls,
  the ridges), so boulders are few; the iso view has none of it (phase 7).

## Phase 4 — the town: delivered (2026-10-22)

Footprints unchanged (the walking, the insides and the server's rooms are as
they were).

- **The façade kit** (`grounds3d.ts` `shop`, `wallsUV`): brick with a dentilled
  cornice and a corbelled band over the shopfront, or clapboard with a false
  front (capped, a raised middle; the one-storey shops get one for their
  signs); framed upstairs windows with stone heads on the front **and the
  sides**; a shopfront of panes over a panelled base, a transom, pilasters, a
  glazed door; the awnings in strips (striped on half), a valance, closed ends.
  Signs over the awning, never into the upstairs windows (those moved up).
- **Their own**: the town hall columned under a pediment with its clock, its
  name on the entablature, steps, a double door; the post office's canopy;
  both flags on their roofs (`civicFront`). The diner in chrome with a red
  band, a strip of windows and its sign up on the roof. The hotel's marquee,
  lit underneath. The vacant shop boarded plank by plank.
- **Townhouses**: three kinds (two storeys side-gabled; two storeys gable to
  the street with a porch across the front and its railing; a storey and a
  half with a dormer), seven colours, five shutter colours, by a hash of the
  house; framed windows on every face, a chimney, a door in the shutters'
  colour, the mailbox moved off the road onto the pavement (with its flag).
- **The church**: pointed windows (`pointed`), a door up three steps under the
  steeple, an open belfry with louvres, cornices, snow on the spire's foot, a
  cross.
- **Street furniture** (shared `STREET`, solid for everyone; `tp/town3d.ts` in
  3D, `gr_*` kinds in iso): hydrants, bins, newspaper boxes along both kerbs
  (off the doors, the lamps, the square and the gas station), nine wooden poles
  down the north side with crossarms, insulators, a transformer now and then
  and four sagging wires, benches and bins round the statue, the stop sign and
  the street names at Church Street, the post office's box.
- **Perf**: a building's windows are one mesh per kind of light (they were one
  mesh each — hundreds of first draws on the way into town, a 50 ms frame);
  wall pictures shared by colour. The town walk's worst frame back to 33 ms.
- **Checked**: shared 242, client 23, world-server 111 + the vortex flake
  (passes alone); typecheck; Biome; `grounds.spec` "the town" in 3D and iso
  (worst 33 ms), High 60 fps at the lot, the square and the woods by day and
  night, `lighting.spec` no GL errors; world page 553.9 KB.
- **Not done**: the gas station's pumps, the statue and the square's paving are
  the landmarks' (phase 5); iso shows the new street furniture but not the new
  façades (phase 7).

## Phase 5 — the landmarks: delivered (2026-10-22)

- **Beams** (`tp/landmarks3d.ts`): a square beam between any two points (snow on
  its top when it's near level), a Warren through truss along a deck, a railing.
- **The road bridge**: a steel through truss (chords, verticals, diagonals, struts
  across the top, the end posts sloping down), a guard rail inside, the deck's
  edges seen from the side; the piers capped, ice heaped against them. **The
  footbridge**: stringers under the deck, a railing on posts both sides. (They
  were solid walls.)
- **The water tower** on four splayed lattice legs braced in X at three levels,
  a riser, a ladder up the south leg, a bowl, the tank with its seams, a roof
  under snow, a walkway with its rail; the beacon **blinks** (a second on, a
  second and a half off; `Grounds3.tick`), a halo with it. Its fence chain-link
  between posts with a top rail (it was a ring of sticks), the gap kept, a
  "DANGER / NO CLIMBING" sign.
- **The company fence**: a top rail, the arms leaning **out** with the three
  strands on them (they were straight up), the snow at its foot following the
  ground both sides (a box at the start post's height floated on slopes).
- **The gatehouse**: a fascia, mullions, a door up two steps, a camera, a
  floodlight on a pole. **The barrier**: a yellow housing on a plinth, the pivot,
  a counterweight, a skirt under the boom, a forked rest post, a warning light
  lit at night.
- **The square**: paved in slabs with dark joints, snow lying on some (more at
  the edges); the pedestal in three steps with a cornice and a plaque; the
  founder in a long coat and a hat, his shoes, a cane, his arm out, green where
  the weather's had him, snow on his hat, shoulders and arm — turned to face the
  street (he had his back to it).
- **The gas station's pumps**: a red body, a white head with lit dials, hoses to
  the nozzles in their holsters, the islands' kerbs, a bin and a bucket.
- **The road closed**: two sawhorse barricades (striped boards on A-frame legs, a
  lamp each, lit at night) in place of a bar of boxes. **The shed**: a slatted
  roll-up door in its frame under the drum's box, a side door, a lamp. **The
  dock**: snow capping its posts, a ladder down to the ice, a cleat.
- **Checked**: client 23; typecheck; Biome; `grounds.spec` 3D (the walk out, the
  campus, the woods, the town: worst frame 17 ms), High 60 fps at the lot, the
  square and the woods by day and night, `lighting.spec` no GL errors; world
  page 553.9 KB.
- **Not done**: the iso view's landmarks are as they were (phase 7).
