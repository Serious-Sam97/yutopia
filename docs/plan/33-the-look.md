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

## Phase 6 — vehicles and life: delivered (2026-10-22)

- **The parked and far cars** (`campus.ts` `carGeometry`: the town's, the lot's
  past 38 tiles, the visitor's): plates front and back, grey road salt along the
  sills, the wheel arches dark rings round the tyres with slush packed at their
  tops, the snow on the roof, the hood, the trunk and the windscreen's foot
  settled in lumps (`flatSnow`) instead of slabs.
- **The visitor's car**: a colour and a shape (sedan or wagon) by its id, snow on
  it, **tail lamps** (only headlamps before).
- **The shuttle** (`tp/vehicles3d.ts`, same 10 × 2.4 footprint): cream over a
  rust stripe, a band of windows with pillars you see the riders through, the
  windscreen and wipers, the folding door on the kerb side, mirrors on their
  arms, rounded roof edges and a vent, snow on the roof, a lit destination sign,
  red tail lamps, dark arches — and its **wheels turn** by how far it went (they
  were four square boxes).
- **The night guard carries a flashlight** (`grounds-life.ts`: `torch: true`):
  the beam everyone's flashlights use, its pool and its light on what he walks
  past.
- Review shots of what moves: `e2e/life-shots.spec.ts` (calls the shuttle to the
  headquarters' stop, pins the hour while it runs, then lets it go).
- **Checked**: client 23; typecheck; Biome; High 60 fps at the lot, the square and
  the woods by day and night; `town.spec` (two ride the shuttle there and back) —
  passes, and fails now and then on a long frame (50–117 ms) **on phase 5's code
  too** (83 ms): the two-browser stall already noted, not this phase; world page
  553.9 KB.
- **Not done**: snow building up on people's shoulders and on parked cars over
  time (it's a fixed amount); the guard still appears at dusk rather than walking
  in; the iso view's vehicles are as they were (phase 7).

## Phase 7 — iso parity: delivered (2026-10-22)

- **One look, two views** (`world/grounds-look.ts`, no three.js in it): a shop's
  wall (brick or clapboard, its colour), trim, false front, awning colour and
  stripes, which upstairs windows are lit; a townhouse's kind, colour, shutters,
  roof and chimney — decided once from the building (its own seed, no drawing
  order in it). `grounds3d.ts` and `grounds-items.ts` both read it (the 3D
  shops' and houses' colours changed a little doing so).
- **Found and fixed**: in iso, everything drawn on a big building's walls as a
  `shape` was clipped to the one slice its middle fell in — the town's windows
  came out as stray lines on blank walls (since phase 2 of plan 27). They're
  drawn by the walls' own box now, slice by slice.
- **Iso shops**: their walls' look, false fronts with a raised middle, framed
  windows with stone heads, the shopfront's panes, base and door, awnings in
  strips, **signs with their names** (`faceText`: SVG text in the face's slant),
  the diner's chrome and roof sign, the hotel's marquee, the vacant shop's
  boards; the town hall's columns, pediment, clock and name, the post office's
  canopy and name, both up their steps.
- **Iso townhouses**: the three kinds, colours, shuttered street windows and a
  door in the shutters' colour, framed windows on every face we see, chimneys,
  the dormer, the porch across the front gable; gables in the walls' colour.
- **Iso church**: pointed lit windows, the steeple's door up its steps, the open
  belfry with louvres, the spire and its cross.
- **Iso landmarks**: the water tower on its braced legs, the bowl, walkway and
  roof; the road bridge's steel trusses and the footbridge's railings (on the
  land's picture, where iso paints the way); sawhorse barricades where the road
  closes (it was the gate's barrier turned); the shed flat-roofed as in 3D, its
  corrugation; the gas pumps red with lit dials.
- **The farm**: hay bales lying on their sides, the scarecrows in red plaid and
  blue trousers — as 3D has them.
- Review shots of the iso view: `e2e/iso-shots.spec.ts`.
- **Checked**: client 23; typecheck; Biome; `grounds.spec` in iso (the walk out,
  the campus, the woods, the town: worst frame 17 ms — the town was 33),
  `lighting.spec` no GL errors; world page 553.9 KB, the Grounds' chunk 160.3 of
  180.
- **Not done**: iso has no settled-snow shapes (drifts, banks, roof lips), no
  woods floor (shrubs, stones) and no ink line — it's drawn in its own inked
  style; the vehicles in iso still turn in four steps.

## After — snow on people, the guard's shift (2026-10-22)

- **Snow settles on people** out under the sky (the land, the lot's open tiles):
  a drift across the shoulders following the spine, a cap on the crown tilting
  with the head (`Person3D.updateSnow`, lit as the land). Full after about six
  minutes out, a minute and a half in a storm; gone in a minute and a half
  indoors, in a car or on the shuttle. Each viewer counts it (no server state).
  Review shot: `e2e/snow-shots.spec.ts`.
- **The night guard keeps a shift** (server, `features/grounds-life.ts`): by day
  at his post in the gatehouse; as it gets dark (nightness > 0.3) out of its door
  and up to the fence, then his rounds; as it gets light (< 0.2) home the
  shorter way round, in at the door. The client no longer hides him by the hour,
  and his flashlight is on outside after dark, off at his post. Test:
  `grounds-life.test.ts` "the guard's shift".
- Budget: `yutopia-item-art` 40 → 45 KB (it sat at 40.0).
- Not done: a review shot of the guard leaving the gatehouse (the teleport near
  the gate lands in the woods; his walk checked by the server test and by his
  positions in the game).

## The roads (2026-10-22)

Ask: "investigate the road's quality — the look and the size: two cars don't pass side by
side, the town above all." Main Street was 10 wide with cars parked at both kerbs: 5.1
between the rows for both ways (the sedan is 1.86 wide, the shuttle 2.4).

- **Sizes** (shared `grounds.ts`): Main Street 10 → **14** (two 3.5 lanes, 2.5 parking each
  side, the parked cars at ±5.7, clear of the crossing ±10.5); its buildings, the square
  and the statue moved out 2 (their insides with them: they're the building's own
  coords); the county road 8 → 9; the driveway 7 → 8; Church Street stays 8, its
  townhouses set back 2 (its pavement went through their porches) and its pavements
  1.6 (`Way.pave`). The shuttle keeps to its lane's middle (1.75).
- **The look** (`tp/roads3d.ts`): the asphalt its own picture per way (its lanes' tyre
  tracks, salt grey in the parking lanes, a crack — no snow painted in, nothing that
  shows a repeat); as geometry: white edge lines (the roads') and the parking lanes'
  lines, the yellow middle (dashed on the roads, doubled in town), worn away here and
  there; the verges' packed snow with a ragged edge by distance (no repeat); in town the
  gutters' slush, kerbs with a face and a top, the pavements' concrete slabs, snow along
  the buildings' side; crosswalks either side of Church Street's mouth and across it,
  its stop line; Main's paint and kerbs open where Church Street meets it. Snow poles
  (shared `SNOW_POLES`, 56) along the driveway and the county road.
- **Iso** paints the same in passes (pavements and verges, asphalt and wheel paths, the
  lines, the crossing) and draws the snow poles; three sawhorses close the wider road.
- **Perf**: the dressing's "is another way crossing here" worked out once a way (asked
  per sample per strip it was a 130 ms frame building Main Street); the Grounds' new
  pictures uploaded to the GPU while they're prepared, not the frame they're first seen.
- **Checked**: shared 242, client 23, world-server 112 + the vortex flake; typecheck;
  Biome; `grounds.spec` 3D and iso (the town's worst frame 17–33 ms), High 60 fps,
  `lighting.spec` no GL errors; `town.spec` (the shuttle there and back) 2 of 3 — the
  third a 67 ms frame, as the code before this had (33 / 50 / 50-fail: the two-browser
  stall); world page 553.9 KB, the Grounds' chunk 161.5 of 180.

## The roads, worn (plan — decided 2026-10-22)

Ask: "the street is too clean: the snow in the corners is missing, the wear of use."

| Question | Answer |
| --- | --- |
| How much snow on the carriageway | **By the way**: the town ploughed and salted but dirty at its edges; the county road packed snow with deep wheel ruts; the driveway between |
| With the weather | **Yes**: whiter during and after a blizzard, clearing over about an hour — from the shared weather, the same for everyone |
| The car's grip | **Look only** for now |

1. **Mocks**: Main Street by day and dusk, the county road, the crossing from above, the
   driveway, iso — stills from the game, approved before the rest.
2. **The carriageway's cover** (a shader on the asphalt, no repeat): packed snow
   blended over it by a world-space noise and the way's kind, the asphalt showing in
   two wheel ruts a lane, a pale ridge between them and over the middle line; the paint
   under it (dimmed, worn where wheels cross it); a `roadSnow` uniform from the weather
   (shared `weather.ts`: how long since the last storm).
3. **The wear**: slush brown-grey at the edges and out of the parking bays, salt
   crusts drying white, dark wet patches with a sheen, grit at the crossing, spray
   fanned into the verges' snow, the crosswalks scuffed where the wheels run.
4. **The corners** (geometry, `snow3d.ts`): the plough's windrow along each kerb,
   ragged and dirty; the empty parking bays snowed in, a bare patch where a car is
   (shared `TOWN_CARS`); heaps at the crossing's corners and the pavements' ends.
5. **Iso**: the same on the land's picture.
6. **Checks**: shots, `grounds.spec` 3D/iso, High 60 fps, budget.

### Bugs on the ways (found 2026-10-22, plan)

The user's shots: a "hole" where the driveway meets the lot, a bump on the road at the
gatehouse, a hard straight line where the county road becomes Main Street, and the bridge
by the town (a lip at its entry flips the car, the car crawls on it, nothing stops you
falling off its sides). Investigated:

| | Cause |
| --- | --- |
| Lot mouth | Not a dip (the land is 0 there): the lot's asphalt is the ground floor's own material, with none of the roads' cover, framed by the driveway's verges and banks — it reads as a pit |
| Gatehouse | A real 0.17 step: each way's heights are smoothed on their own, so the driveway's last and the road's first differ, and the land takes the nearest way's; the two ways' verges overlap there too |
| Town edge | The road (9, packed snow) and Main Street (14, nearly clear, kerbs) swap on one straight line at x 300 |
| Bridge | The deck is the way's height + 0.35 from 3 samples before the bridge: a 0.35–0.43 step (the wheel's radius is 0.317); the deck's height is the nearest sample's (stairs); `patchAt` makes most of a deck black ice; the deck ends 4.5 out but the truss is at 5.2 — between, the ground drops 2.8 to the river and is walkable. The footbridge shares the code |

Decided: small black-ice patches on the decks (bridges freeze first); the worn roads'
mocks approved as they are.

1. **Bridges**: the deck flush with the way (no lift), its height along the line
   interpolated, from where the bridge starts to its guard rail; a blocked strip just past
   the rail (people and cars: `walkable` → `carBlockedTile`); black ice in patches. Tests:
   the height continuous (no step > 0.05), the sides blocked, a car across at speed.
2. **Joins**: the ways' heights smoothed as one chain where they meet (driveway → road →
   Main Street); a way's verges stop where another begins.
3. **Into town**: the road's last ~15 tiles widen 9 → 14, the cover blends from road to
   town over ~25, the kerbs and pavements start with a taper.
4. **The lot**: its asphalt takes the roads' cover; the driveway's ribbon and verges stop at
   its edge.
5. **The worn roads**: iso, perf (with the above).
6. **Checks**: shots of each spot, `grounds.spec` 3D/iso, the car's e2e, High 60 fps, budget.

### Delivered (2026-10-22)

- **The cover** (`tp/roads3d.ts roadCover`): packed snow over each way's asphalt by its kind
  (street 0.1, driveway 0.38, road 0.5) and a noise in the Grounds' own coords, the asphalt
  in two wheel ruts a lane, whiter and slushy towards the edges and the parking lanes, salt
  and wet patches on the bare; the paint dimmed under it; `roadSnow` from the shared weather
  (whiter in a blizzard, clearing over the hour after). Where two ways run end to end the
  cover, the ruts' lanes and the edge ease halfway into the other's over 25 tiles.
- **The corners** (`streetCorners`, `crossingHeaps`): the windrow along Main's kerbs, the
  empty bays snowed in, lower where a car's dug out; heaps at the crossing.
- **The lot**: a see-through layer of the same weather over the ground floor's asphalt.
- **Joins**: the ways' heights smoothed as one chain (the gatehouse's 0.17 step gone); the
  driveway 9 like the road (their lanes meet); the road's verges narrow to nothing over its
  last 10 tiles into Main Street, whose kerbs' windrow rises with its pavement.
- **Into town**: Main Street flares 9 → 14 over its first 18 samples (`Way.flare`, shared
  `wayHalf`/`wayPave`: the land, the walkable, the ribbon, the kerbs and the cover follow).
- **Bridges**: the deck flush with the way and interpolated along it (no lip — the car keeps
  50 km/h and its wheels down), a blocked strip past each guard rail, black ice in patches.
- **Found on the way**: the snow's ragged-edge noise (`snow3d.ts wobble`) eased out without
  bound before its start — Main's north gutter slush was a sheet flung 270 tiles across
  the county road (the "straight line" at the town's edge); mirrored now, and a test keeps
  every way's dressing by its line. The cover's join distances were measured in world
  space while the joins are in the Grounds' — they never blended.
- **Iso**: Main's flare drawn as bands; the cover rastered an eighth of a tile a pixel and
  stretched smooth over the paint (soft ruts: the land's picture is seen shrunk, unmipmapped).
