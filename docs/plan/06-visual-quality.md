# 06 — Visual quality: items, structure, scenario

The people are now illustrated (vector, shaded, outlined) and Vortex is Yondra's
own art. The world around them is still the first pass — box-built furniture,
blocky walls, flat floors, glow-blob lighting, a black void outside — so the
characters look like they were pasted into a prototype. This plan brings the
whole studio up to (and past) the characters' level.

## Decisions (2026-10-10)
- **Walls:** thin walls on tile edges, done at V5 — after the new items, floors and light prove the look.
- **Outside:** an 80s city through the windows; the sky follows the local clock.
- **Ambience:** full ambient life + finishing effects, with High / Medium / Low tiers.
- **Process:** image-first per step — a review sheet is approved before each rollout.

## What's weak today (audit, 2026-10-10)

| Area | Today | Why it hurts |
|---|---|---|
| Items | 27 pieces built from flat-coloured boxes (`art/furniture.ts`) | Toy-like; clashes with the illustrated people |
| Walls | Full-tile blocks, repeated pinstripes, dark caps, tall see-through walls | Chunky, repetitive, no architecture |
| Floors | Flat diamonds with a line or two | No material, no grounding |
| Light | Multiply darkness + additive blobs | Light never *lands* on anything; no shadows |
| Grounding | No contact shadows or ambient occlusion | Furniture floats; corners look empty |
| Scenario | Black void outside, sparse rooms, nothing moves | Feels like a test level, not a place |
| Consistency | No style rules for environment art | Every new item drifts |

## Target look

**"Illustrated 1984 studio, golden-hour warm."** The same hand as the people:
clean warm-ink outlines, 3-tone shading lit from the top-left, gentle gradients,
small details that reward zooming in — inside a building you can see out of.

### Art rules (the style guide every item follows)
- Light from the **upper-left**: top face lightest, left face mid, right face darkest (3 tones + gradient).
- Outlines: ink `#2a1a12`, 1.3 px at 1×, thinner for inner detail; no outlines on emissive bits.
- Palette: walnut / cream / amber VFD / rust / olive + 4 accent neutrals; emissive only amber, red, phosphor.
- Every item: 2 drawn facings (others mirrored), 2× resolution textures, contact-shadow footprint, optional emissive layer, optional idle animation.
- Detail density: one "story" detail per item (a sticky note, a coffee ring, a cassette left on the desk).

## Workstreams

### A · Item art pipeline (the foundation)
Move furniture from box compositions to **illustrated isometric SVG sprites**, drawn
by the same pipeline as the people (`avatar-svg.ts` → `textures.ts`).
- Generator per item in `art/items/*.ts` returning SVG for a facing + state (door open/closed, radio on/off, chair occupied).
- Depth stays correct: each item declares its footprint and **slice points**, so the
  renderer cuts long items into per-tile slices exactly like today.
- Keep the box version as a fallback while a texture decodes (as people do).
- `/dev/items` review sheet: every item × facing × state on floor swatches, day and night.

### B · Structure (walls, doors, windows)
- **Thin walls on tile edges** instead of full-tile blocks: walls become panels between
  tiles with real thickness (~0.2 tile), caps, skirting and cornice. Rooms gain a full
  tile of floor back, doors sit in the wall line, cut-away becomes a clean "wall-down"
  view (walls in front drop to a low skirting when you're behind them — like The Sims).
- Wall materials per room: walnut panelling, cream plaster with dado rail, acoustic
  foam (booths), brick (lounge), cork (war room), smoked glass partitions.
- **Windows**: placeable in outer walls, showing the outside (see E); light pours in.
- Columns, half-walls, glass doors, a staircase prop to sell the "bigger inside" building.
- Map data change: walls move from tiles to an **edge grid** (`hWalls`/`vWalls`), with a
  one-time converter from today's tile maps. Build mode paints edges.

### C · Floors and grounding
- Material textures generated once per material (wood planks with grain + seams, carpet
  fibre noise, checker tile with grout, felt, stage boards, metal grate), tiled seamlessly.
- **Ambient occlusion** baked into the floor layer: darker along wall bases, in corners,
  under furniture footprints.
- **Contact shadows** under every item and person (soft ellipse/footprint, not a blob).
- Thresholds at doors, rug edges with fringe, floor transitions between materials.

### D · Light
- **Baked light maps** per room: each lamp/window casts light onto floor *and* wall
  faces with falloff, blocked by walls (ray-march on the grid), re-baked when the map or
  lights change (cheap at these sizes).
- Time of day drives an ambient tint **and** window light (warm low sun at dusk, blue
  moonlight at night, lamps take over).
- Emissive layer (VFD, screens, LEDs) gets a soft **bloom** on high quality.
- Optional: soft directional shadows from tall items when the sun is low.

### E · Scenario (the building and beyond)
- Replace the black void with **the outside**: the studio becomes a floor in a building;
  windows look onto an 80s city — skyline silhouettes, lit windows, a sunset sky that
  follows local time, slow clouds, a neon-free warm palette.
- Exterior shell around the map (outer wall thickness, roof edge) so the map has a shape.
- Room **dressing presets** (clutter generator): papers, mugs, cables, tape stacks, vinyl,
  plants of 5 kinds, framed posters — placed on free surfaces with rules, editable in build mode.

### F · Life (motion that makes it a place)
- Ambient animations, all optional under reduced motion: monitors show real Yondra board
  colours and flicker, cassette reels spin on the mixing desk, VU meters dance to the
  radio, steam from the coffee machine, plants sway when someone walks by, server LEDs
  blink, ceiling-fan shadow sweep, dust motes in window light.
- Interaction feedback: chairs turn when you sit, doors swing, lamps click on.

### G · Finish (post-processing, quality tiers)
- High: bloom, soft vignette, film grain, warm colour grade (LUT), light maps.
- Medium: light maps, no bloom/grain.
- Low (phones/battery): flat lighting, no animations except people.
- Budgets in CI: frame time with 50 people + full dressing, texture memory, bundle size.

### H · Quality gates
- Image-first per workstream: a mock sheet (`/dev/items`, `/dev/rooms`) approved before rollout.
- **Screenshot regression**: fixed camera shots of each room, day and night, diffed in CI.
- A one-page style guide (`docs/art-style.md`) with the rules above and reference shots.

## Order (each step ends with an approved screenshot)

| Step | Scope | Exit check |
|---|---|---|
| V1 | Style guide + item pipeline + 6 hero items (desk, chair, sofa, lamp, plant, board wall) | `/dev/items` sheet approved; items in-world at ≥ the people's quality |
| V2 | Remaining 21 items + states + contact shadows | Every room re-shot, no box art left |
| V3 | Floors: materials + AO + thresholds | Before/after per room |
| V4 | Light maps + time of day + bloom tiers | Dusk / night / day shots of the Tracking Room |
| V5 | Thin walls + materials + windows (edge grid + converter + build tools) | Studio converted; build mode paints walls on edges |
| V6 | The outside: city backdrop, sky, building shell | Windows show the city at any hour |
| V7 | Dressing presets + life animations | A room that feels lived in, still ≥ 60 fps with 50 people |
| V8 | Post-processing tiers, screenshot regression in CI | Low/medium/high all within budget |

## Risks
- **Thin walls (V5)** touch maps, pathfinding, hearing, build mode and doors — biggest
  change; done after the look is proven, behind a converter, with the shared tests extended.
- **Texture memory** grows with illustrated items: per-item atlases, LRU, and 2× only on
  high quality.
- **Performance of light maps/bloom**: baked (not per-frame) and tiered.
