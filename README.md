# Yutopia

**Yondra + Utopia.** An isometric virtual studio where the team works together:
walk up to people to talk, meet in rooms, see the work live on the walls. Fully
synced with [Yondra](../yondra) — same accounts, same projects, same boards.

The plan lives in [`docs/plan/`](docs/plan/00-INDEX.md); progress in
[`docs/plan/PROGRESS.md`](docs/plan/PROGRESS.md).

## Layout

| Path | What |
|---|---|
| `apps/client` | Next.js + PixiJS client (port 3100) |
| `apps/world-server` | Colyseus world server (port 2567) |
| `packages/shared` | Map, iso math, pathfinding, hearing rules, protocol |
| `docker/` | LiveKit (+ optional world container), joins Yondra's `sail` network |
| `tools/` | Bot swarm, budgets |

Yondra-side code lives in the Yondra repos: `yondra/app/**/Yutopia*`,
`routes/yutopia.php`, and the embed/presence bits in `yondra-frontend`.

## Run it locally

1. Start Yondra's stack (`yondra/` compose). Run the migration and, optionally,
   the demo data: `php artisan migrate && php artisan db:seed --class=YutopiaDemoSeeder`.
2. Secrets: `YUTOPIA_*` / `LIVEKIT_*` must match between `yondra/.env` and
   `yutopia/.env` (see `.env.example`); LiveKit reads `docker/livekit.keys.yaml` (chmod 600).
3. `pnpm docker:up` — starts **LiveKit**, the **world-server** (:2567) and the
   **client** (:3100) as containers on Yondra's `sail` network. First start installs
   dependencies inside the containers (~1 min). `pnpm docker:logs` / `pnpm docker:down`.
4. Open http://localhost:3100 and sign in with your Yondra account.

Prefer running on the host? `pnpm dev:server` + `pnpm dev:client` (stop the
`world`/`client` containers first — same ports).

## Checks

```
pnpm test        # shared + world-server tests
pnpm typecheck
pnpm lint
pnpm bots --space 1 --count 45   # needs YUTOPIA_ALLOW_BOTS=1 on the world-server
```

Backend tests: `docker exec yondra-backend ./vendor/bin/pest tests/Feature/YutopiaTest.php`.
