# Yutopia art style — environment

**"Illustrated 1984 studio, golden-hour warm."** Items, walls and floors are drawn by
the same hand as the people (`apps/client/src/world/art/avatar-svg.ts`): clean warm-ink
outlines, three-tone shading lit from the upper-left, gentle gradients, and small details
that reward zooming in. Review sheets: `/dev/items` (items), `/dev/sheet` (people), both
dev-only. Reference shots: `design/screens/visual/`.

## Rules every item follows

| Rule | Value |
|---|---|
| Light | From the **upper-left**. Top face lightest, left (+y) face mid, right (+x) face darkest. |
| Tones | 3 tones per material, each with a soft gradient (top: diagonal, sides: lighter at the top). `Mat` in `items/kit.ts` derives them; override `top/left/right` when a material needs it. |
| Bevel | A thin light line along the top's two front edges (stronger on glossy materials). |
| Outline | Ink `#2a1a12`, **1.3 px** at 1× on silhouettes; inner edges ~0.65 px at 55 %; small parts 0.6–0.9 px. No outline on emissive bits. |
| Palette | walnut `#5b3a26` · cream `#efe4cc` · amber VFD `#ffb35c` · rust `#b5562f` · olive `#6e7b3a` + neutrals putty `#d6c9a6`, graphite `#2b2a26`, aluminium `#b9b2a3`, brass `#c39a4a` (all in `items/pal.ts`). No neon. |
| Emissive | Only **amber, red, phosphor** (screens, VFDs, LEDs, lamp shades). Marked `glow`; they go into a separate emissive layer that lights up as the room darkens (and feeds bloom later). |
| Facings | All four facings come from the same 3D drawing, so the light stays upper-left in every rotation (mirroring would flip the light — don't). |
| Resolution | Textures at **2×** (2.5× on HiDPI High, 1.25× on Low), mipmapped. |
| Story | **One "story" detail per item**: a sticky note, a coffee ring, a cassette left on a cushion, a cardigan on a chair back, a plant tag. Seeded, so the same item looks the same for everyone. |
| Grounding | Every item declares a **contact-shadow footprint** (`s.shadow`, `s.shadowDot`): soft, footprint-shaped, drawn on the floor layer under items and people. |
| Proportions | 1 tile ≈ 80 cm; desk top at z 21–25 px, chair seat at z 11–15 (sitters are drawn at those heights — keep them). |

## How an item is built (`apps/client/src/world/art/items/`)

- `kit.ts` — the `Sketch` illustrator. Draw in **local 3D at rot 0** (x/y in tiles, z in px):
  `box` (shaded box; `puff` for upholstery, `bias` for seat backs), `cyl` (pots, poles,
  shades — `r2` tapers), `shape` (free-form SVG anchored in 3D: leaves, cables, spokes),
  face details through the `Draw` callback (`poly`, `line` on a face, clipped to the slice),
  `shadow`/`shadowDot`.
- One file per item: `(sketch, props) → void`; the seed is on `sketch.seed` (pick a variant
  with `Math.floor(seed * variants)`); register it in `index.ts` with its variant count and
  the props that change the drawing (`lamp.on`, `plant.variant`, door state…).
- **Depth:** long items are cut into per-tile slices exactly like the old box art
  (`scene.ts` `objectParts`); the kit clips boxes and face details to each slice and anchors
  free shapes to the slice that holds their centre. Keep organic shapes inside one tile.
  Seats split into a *back* and *front* group so a sitter sorts between seat and backrest.
- **Fallback:** the box composition in `furniture.ts` shows until the texture decodes.
- Textures are shared by key (`kind|rot|slice|group|variant|props|res`), reference-counted
  while on the map, and kept in a 64 MB budget once unused (`textures.ts`).

## Checklist for a new item
1. Draw it in `/dev/items` on wood, carpet and tile, day and night, all four facings.
2. Light upper-left in every facing; outlines 1.3 px; one story detail; contact shadow.
3. Emissive only amber/red/phosphor, marked `glow`.
4. Long items: nothing organic crossing a tile boundary.
5. Screenshot it in a room (`YUTOPIA_SHOTS=<dir> npx playwright test room-shots`).
