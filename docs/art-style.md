# Yutopia art style — environment

**"Illustrated 1984 studio, golden-hour warm."** Items, walls and floors: clean warm-ink
outlines, three-tone shading lit from the upper-left, gentle gradients, and small details
that reward zooming in. Review sheets: `/dev/items` (items), `/dev/sheet` (people), both
dev-only. Reference shots: `design/screens/visual/`.

## People — Ligne claire

Everyone is drawn in **Ligne claire**: one even black line (`#151515`), flat colours
with a darker flat tone for shade (`shade()` mixes 22 % black), dot eyes, thin brows,
a nose hook and a line for a mouth — no shade shapes, hair gradient or rim light.
City-pop, the second style people could pick until 2026-10-17, was retired
(`docs/plan/22-people-3d.md`, P0): `AvatarLayers.style` is always `ligne` (Yondra
saves `ligne` whatever it is sent; the migration `2026_10_17_000003` moved every saved
look; `parseAvatar` turns anything else into `ligne`). The 3D people (`world/chars`,
same plan) are Ligne claire too.

### The 3D model (everywhere)

`apps/client/src/world/chars/` (the lazy `yutopia-chars` chunk; plan
`docs/plan/22-people-3d.md`). Every person in every view is one parametric model:
- **Built only from smooth, bevelled shapes** — lathes and swept tubes along splines,
  `Shape` + `ExtrudeGeometry` with bevels, flat pieces bent onto the body after an
  edge-based refinement — with welded smooth normals; never a raw box or a low-segment
  cylinder. Every dimension sits at the top of `params.ts` (`BASE`, as tuned with the
  user: 5 heads, a belly, legs 0.36, a long torso; `BODY` slim/regular/broad and
  `GENDER` as changes to it) and can change at runtime.
- **Flat colour + one line:** a single `MeshBasicMaterial` with the colours in the
  vertices, and the ink drawn as a screen-space inverted hull (`ink.ts`) — the same
  width in pixels near and far, with creases (hems, seams) as hair-thin rings. Two
  draw calls per person. Lit only by the room's light map, so night dims them.
- **Every `AvatarLayers` option** has its 3D part (`build/`): 10 hair styles, 11 tops,
  7 bottoms, 5 shoes, 7 headwear, 3 eyewear, 6 extras. Hair hangs from under a hat's
  rim; skin hidden by clothes isn't built.
- **Levels of detail** ~44k / 17k / 6k triangles on one skeleton (16 joints); a factory
  builds each look × level once, a few per frame, shared by everyone wearing it.
- **Motion** (`motion.ts`) has the 2D people's layers and timings: idle life, the walk
  from distance, sitting and typing, drinks with sips, every busy use, the phone,
  moves with someone, every emote, blink and talk (morphs); hands go to the ear,
  mouth, chin, chest, belly by IK.
- **Where:** in the 3D / first-person view each person is a model (`tp/person3d.ts`);
  in first person my own arms come up when they're doing something (`tp/hands1p.ts`);
  in iso each person is a sprite of the model drawn from the iso camera
  (`chars/iso.ts`, 1.38× life-size, ~92 px tall); the HUD's turntable and portraits
  are the model too. Vortex stays his drawing everywhere.
- **Review:** `/dev/chars` (`?turn=`, `?lods=`, `?crowd=`, `?sheet=<field>`,
  `?anim=base|busy|phone|social|emote`), `/dev/3p?cam=first&me=…` (the hands),
  `/dev/3p?view=iso`; concepts and sheets in `design/chars-3d/`.

### The 2D drawing (the fallback)

Where WebGL can't draw (and for a moment while the 3D people load) people are still
the vector drawing: `apps/client/src/world/art/avatar-svg.ts`. About 5½ heads tall, drawn on a 120×180 board
(feet on y = 168) and fitted into the engine's 64×100 texture box (shown at 0.5 →
~92 px tall). The world is drawn `WORLD_SCALE` (1.3, `world/art/iso.ts`) larger than
the people in it: the camera zooms in by that much and each person's container is
scaled by `PERSON` (1 / 1.3), so people keep their size on screen while rooms and
furniture read at believable proportions; item and floor art are drawn that much finer.
Five drawn views (S, SW, W, NW, N; the rest mirror), every hair style has a real back
and side — never a bare scalp. Seated poses put the hips on the seat (engine `lift`
12); from behind, the chair's backrest (the `bias` part) sorts in front, so only head
and shoulders show. Frame 0 is both "standing" and the walk's passing frame. Review it
with `/dev/sheet`; `/dev/shots?crowd=N` puts a crowd in the Studio.

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

## Real things, no marks

Some items echo real products (the game room's consoles and TV, `art/items/games.ts`):
their silhouette, colours, materials and parts are drawn faithfully — the woodgrain,
the switches, the cartridge standing in the slot, the colour dots — but never a
logo, a brand name or a model name. Labels in the UI are generic ("8-bit
console"). What moves (the picture, LEDs, cables, pads in hands) is drawn live.

## Checklist for a new item
1. Draw it in `/dev/items` on wood, carpet and tile, day and night, all four facings.
2. Light upper-left in every facing; outlines 1.3 px; one story detail; contact shadow.
3. Emissive only amber/red/phosphor, marked `glow`.
4. Long items: nothing organic crossing a tile boundary.
5. Screenshot it in a room (`YUTOPIA_SHOTS=<dir> npx playwright test room-shots`).

## Quality tiers (Settings → Quality)

| | High | Medium | Low |
|---|---|---|---|
| Baked light (lamps, screens, windows) + emissive glow | ✓ | ✓ | flat light |
| Bloom, vignette, film grain, warm grade | ✓ | — | — |
| Ambient life (flicker, reels, steam, sway, motes, fans), drifting skies | ✓ | ✓ | people only |
| Texture scale / screen resolution cap | 2–2.5× / 2× | 1.5× / 1.5× | 1.25× / 1× |
| Snowflakes (Snow theme) | 260 | 160 | 70 |

**Auto** (the default) picks a tier from the device (touch + small screen, cores, memory), then steps down one tier
when the frame rate stays under 40 fps for 6 s. Reduced motion turns every extra motion off on any tier.

## Screenshot regression + budgets

`/dev/shots` renders the Studio offline from the built-in map (no server, no people, fixed hour and camera, the
clock frozen, nothing random). `apps/client/visual/shots.spec.ts` compares every room (day + night), each theme
(noon + night) and the Medium/Low tiers against baselines (per-pixel threshold 0.08, at most 0.2 % of pixels), then
enforces the budgets with 50 people on High: texture memory ≤ 192 MB, world logic ≤ 4 ms per frame, render
≤ 16.7 ms at night with bloom on a real GPU (CI's software GPU: ≤ 25 ms by day — off-screen passes cost ~40 ms there
whatever their size, so the bloom isn't measured there).

```bash
pnpm visual                      # against the dev client on :3100
pnpm visual --update-snapshots   # accept intended changes (look at the diffs first)
VISUAL_SERVE=1 pnpm visual       # starts its own dev server on :3101 (what CI does)
```

Baselines are per platform (`visual/__screenshots__/*-darwin.png` locally, `*-linux.png` in CI). The CI `visual`
job writes missing Linux baselines and uploads them as the `visual-baselines-linux` artifact — commit them once.
