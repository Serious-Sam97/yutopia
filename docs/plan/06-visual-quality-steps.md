# 06 — Visual quality: step checklist

Companion to [06-visual-quality.md](06-visual-quality.md) (the why + art rules).
Work top to bottom. Each step ends with an **image-first gate**: build the review
sheet / shots, send them to the user, roll out after approval. Tick boxes and add a
dated line to [PROGRESS.md](PROGRESS.md) when a step is done.

**Decisions locked (2026-10-10):** thin walls at V5 · 80s city outside, sky follows
the clock · full ambient life with High/Medium/Low tiers · image-first per step.

**Every step must keep green:** `pnpm lint` · `pnpm typecheck` · `pnpm test`
(shared + world-server) · `cd apps/client && npx playwright test` (stack running via
`pnpm docker:up`) · `NEXT_DIST_DIR=.next-prod pnpm --filter @yutopia/client build && pnpm budget`
· `pnpm contrast` · `pnpm perf` · `node tools/sync-vortex-art.mjs --check`.

---

## V1 · Style guide + item pipeline + 6 hero items
- [x] `docs/art-style.md`: light upper-left, 3 tones + gradient, ink `#2a1a12` 1.3 px, palette + emissive colours, 2 facings (mirror the rest), 2× textures, one "story" detail per item, contact-shadow footprint.
- [x] `apps/client/src/world/art/items/` — one SVG generator per item: `(facing, state, seed) → svg`. Facing = the item's rot; mirror for the opposite pair where the art allows.
- [x] Texture loading through `art/textures.ts` (extend with an item cache + LRU budget).
- [x] Depth: each item declares footprint + slice points; renderer cuts long items into per-tile slices from the texture (sub-texture frames), same rule as today's `objectParts`.
- [x] Box art (`art/furniture.ts`) stays as the fallback while a texture decodes.
- [x] Hero items: desk (with monitors facing the right way per rot), chair (seat/back split so sitters sort between), sofa, floor lamp, plant (5 seeded variants), board wall (keeps the live VU display on top).
- [x] `/dev/items` review sheet (dev only): every item × facing × state on wood/carpet/tile, day + night.
- [x] Gate: send `/dev/items` + Tracking Room shots → approval.

## V2 · All remaining items + states + contact shadows
- [x] The other 21 catalog items (see `packages/shared/src/catalog.ts`): meeting table, coffee table, armchair, bench, rug, arcade, radio, tape shelf, coffee machine, reception, mic stand, mixing desk, standup ring, speaker cabinet, server rack, CRT terminal, screen wall, whiteboard (keeps live miniature), notice board, acoustic panel, poster (3 arts), door (open/closed/locked/passing).
- [x] States: radio on/off, arcade attract screen, door states, chair occupied tilt, lamp on/off.
- [x] Contact shadows for every item and person (footprint-shaped, soft).
- [x] No box art visible anywhere in normal play.
- [x] Gate: every room re-shot (day + night) → approval.

## V3 · Floors + grounding
- [x] Seamless material textures generated once: wood planks (grain, seams, varied tone), carpet fibre, checker tile + grout, felt, stage boards, metal grate.
- [x] Baked ambient occlusion in the floor layer: wall bases, corners, under footprints.
- [x] Door thresholds, rug fringe, material transitions.
- [x] Rebuild on map edits (build mode) without hitches.
- [x] Gate: before/after per room → approval.

## V4 · Light
- [x] Baked light maps per room: lamps + windows light floors and wall faces with falloff; walls block light (ray-march on the grid). Re-bake on map/light changes.
- [x] Time of day: ambient tint + sun direction/colour from the local clock (day, golden hour, dusk, night).
- [x] Emissive layer + bloom on High.
- [x] Gate: Tracking Room at day / dusk / night → approval.

## V5 · Thin walls on tile edges (biggest change)
- [ ] Shared map format v2: `hWalls` / `vWalls` edge grids + floor tiles; converter from tile walls (`packages/shared`), with tests (every existing map converts; reachability, doors, rooms preserved).
- [ ] Grid / pathfinding / `isLegalMove` / hearing (rooms) / doors (doors sit on an edge) / build mode (paint edges) / layouts in Laravel (`yutopia_spaces.layout` v2 + migration of saved layouts).
- [ ] Rendering: wall panels with thickness ~0.2, caps, skirting, cornice; **wall-down** view (walls in front of the camera drop to skirting height when you're behind them).
- [ ] Wall materials per room (walnut panel, plaster + dado, acoustic foam, brick, cork, smoked glass) chosen in build mode.
- [ ] Windows (outer walls), columns, half-walls, glass doors.
- [ ] All world-server room tests + e2e updated and green.
- [ ] Gate: converted Studio + Lab, build mode on edges → approval.

## V6 · The outside
- [ ] Building shell around the map (outer wall depth, roof edge) instead of the void.
- [ ] 80s city backdrop seen through windows and around the building: skyline layers (parallax), lit windows that change at night, sky gradient + sun/moon + slow clouds following the local clock. Warm palette, no neon.
- [ ] Window light ties into V4.
- [ ] Gate: same view at 4 times of day → approval.

## V7 · Lived-in rooms + life
- [ ] Dressing presets (clutter generator): papers, mugs, cables, tape stacks, vinyl, 5 plant kinds, framed posters — placed on free surfaces by rules; build mode can add/remove/apply a preset per room.
- [ ] Ambient animation: monitors show the board's colours + flicker, reels spin on the mixing desk, VU meters follow the radio, coffee steam, plants sway when passed, server LEDs, dust motes in window light, ceiling-fan shadow. All off under reduced motion.
- [ ] Interaction feedback: chair turns on sit, doors swing, lamps click.
- [ ] Perf: ≥ 60 fps target with 50 people + full dressing on a real GPU; logic ≤ 4 ms/frame.
- [ ] Gate: a dressed room, day + night → approval.

## V8 · Finish + regression
- [ ] Quality tiers: High (light maps, bloom, vignette, grain, warm LUT, all animation) · Medium (light maps, animation, no post) · Low (flat light, people only animated). Settings panel + auto-pick by device.
- [ ] Screenshot regression in CI: fixed camera shots per room, day + night, pixel-diff threshold.
- [ ] Budgets: texture memory, bundle, frame time — enforced.
- [ ] `docs/plan/PROGRESS.md` updated; screenshots in `design/screens/`.
- [ ] Gate: final tour shots → approval.
