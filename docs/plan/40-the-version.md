# The version — which build each player runs (decided 2026-10-23; delivered 2026-10-23)

The user: every push makes a new version of the client; it shows in Settings, and the
performance reports (`39-the-telemetry.md`) record it, so a push can be judged by how
it ran for everyone after it.

## The number

`0.1.<commits>` — the client's `package.json` major.minor, then the commit count of the
line built (`git rev-list --count HEAD`): one more with every commit pushed to main. With
it, the commit's short hash and its date. `next dev` adds `-dev`.

## Where it comes from

- **`apps/client/next.config.ts`** bakes it in (`NEXT_PUBLIC_YUTOPIA_VERSION`, `_COMMIT`,
  `_DATE`; read through `lib/version.ts`), from git.
  - The **prod image**: the build context leaves `.git` out, so `docker/prod/compose.yaml`
    hands it in as a second build context (`additional_contexts: git`), mounted only
    while `next build` runs (never in the image). Any `docker compose -f
    docker/prod/compose.yaml … up -d --build` gets the version; a plain `docker build`
    without that context says `dev`. Needs a full clone (a shallow one counts wrong).
  - The **dev container** installs git when it starts (`docker/compose.yaml`) and says
    `0.1.<commits>-dev` as of the dev server's start; without git: `dev · <commit>`.

## Where it shows

- **Settings**, at the bottom: "Version 0.1.118 · abc1234 · 2026-10-23".
- **Every performance report** carries it (`perf_reports.version`, the commit in
  `context.commit`). `/admin/perf` shows each player's last version, the version of
  each window (the table, the chart's hover), and a **By version** table: fps, frame
  p95, share under 30 fps, players, windows, first and last seen — newest first.
