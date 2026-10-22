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
