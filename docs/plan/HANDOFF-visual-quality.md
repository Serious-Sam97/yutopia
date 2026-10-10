# Handoff — Yutopia visual quality (V1–V8)

Read this first, then `06-visual-quality.md` (why + art rules) and
`06-visual-quality-steps.md` (the checklist you work through).

## Where things are
- **Yutopia** (`projects/yondra/yutopia/`): pnpm 12 monorepo — `apps/client` (Next.js 15 + PixiJS 8, :3100), `apps/world-server` (Colyseus 0.16, :2567), `packages/shared` (maps, catalog, grid, pathfinding, hearing, map editing), `docker/compose.yaml` (LiveKit + world + client). Start everything: `pnpm docker:up` (Yondra's stack must be up first). Status of everything shipped: `docs/plan/PROGRESS.md`.
- **Art today**
  - People: illustrated SVG — `apps/client/src/world/art/avatar-svg.ts`, rasterised + LRU-cached by `art/textures.ts`; review sheet `/dev/sheet` (dev only).
  - Vortex: verbatim copy of Yondra's `vortexArt.ts` in `art/vortex/` — never edit; `pnpm sync:vortex` / `--check`.
  - Items: box compositions in `art/furniture.ts` + `art/iso.ts` (rotatable, sliced per tile for depth in `art/scene.ts` `objectParts`). **This is what V1–V2 replace.**
  - Walls/floors: `art/scene.ts` (`wallParts`, `drawFloors`); doors in `furniture.ts` (`case "door"`); live wall displays + whiteboard miniatures + signs in `engine.ts` (`mountWall`, `drawLabels`).
  - Light: `engine.ts` `drawDarkness` + glow sprites.
- **Maps** are per-space data (`yutopia_spaces.layout`, null = built-in Studio); rules in `packages/shared/src/map-edit.ts`; per-person walk grids for locked doors (`Grid.from(map, objects, { uid })`). Sandbox project for destructive tests: **Yutopia Lab**.
- **Yondra side** (Laravel `projects/yondra/yondra/`, frontend `projects/yondra/yondra-frontend/`): `YutopiaController` / `YutopiaInternalController`, `routes/yutopia.php`, `YutopiaDemoSeeder` (demo accounts ana@ / bia@yutopia.test, password in the seeder).

## Rules (from the user)
- **Image-first:** every step starts with a review sheet/screenshots sent to the user; roll out only after approval.
- Commit/push only when asked, and never with a Claude co-author trailer.
- Biome only on touched files in Yondra repos (Yutopia is all ours: `pnpm lint`).
- Vortex must stay identical to Yondra.
- Keep every check green (list at the top of the steps file). e2e needs the stack running; Playwright is pinned to 1.63.0 (cached chromium-1243); e2e logs in once per account (Yondra rate-limits /api/login).

## Gotchas learned the hard way
- Never `next build` into `.next` while dev runs — use `NEXT_DIST_DIR=.next-prod`.
- `pnpm up` is pnpm's update command — scripts are `docker:up` / `docker:down` / `docker:logs`.
- New routes in the client container sometimes need `docker restart yutopia-client`.
- SVG gradients on a perfectly straight stroke have a zero-width bbox and vanish — use solid colours on straight strokes.
- Use deterministic ids in generated SVG (hydration).
- Colyseus `ArraySchema` can't splice-insert; nested-schema callbacks need the first state.
- `useHud` selectors are memoized per store state.
- The in-app browser pane pauses rAF when hidden; use Playwright (headless renders WebGL in software, so compare A/B in the same environment, don't read absolute fps from it).
- Backend tests: `docker exec yondra-backend ./vendor/bin/pest <files>`, then delete the `testing` sqlite it leaves.
