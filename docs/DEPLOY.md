# Deploying Yutopia

Yutopia runs on its own: the **API** (Laravel on FrankenPHP, `apps/api`) with its
**queue** worker, **scheduler** and **Postgres**; the **world-server** (Colyseus);
the **client** (Next.js); and **LiveKit** (voice/video). Nothing of Yondra's is
needed (it was the backend until the move: `docs/plan/24-standalone.md`).

Production is `docker/prod/compose.yaml`: built images, no bind-mounted source, no
watchers. `docker/compose.yaml` is the dev stack (live reload, demo people with
`YUTOPIA_DEMO=1`); the two use the same container names and ports, so only one of
them runs at a time.

## 1. In front: TLS and hostnames

The stack speaks plain HTTP on localhost; whatever is in front does TLS. On the
current server that's a cloudflared tunnel (`/etc/cloudflared/config.yml`), with the
`/api/` rule **above** the client's:

```
  - hostname: yutopia.example.com
    path: ^/api/
    service: http://localhost:8100      # api
  - hostname: yutopia.example.com
    service: http://localhost:3100      # client
  - hostname: world.yutopia.example.com
    service: http://localhost:2567      # world-server (WebSocket)
  - hostname: rtc.yutopia.example.com
    service: http://localhost:7880      # LiveKit signalling
```

The API is on the client's own origin (no CORS). api, world and client listen on
127.0.0.1 only. LiveKit's media is direct: open **7881/tcp and 50000–50100/udp** to
this host. LiveKit finds the public IP by STUN when it starts — if the IP changes,
restart it (`docker restart yutopia-livekit`), or calls connect and carry no audio.
TURN is Cloudflare's (`CLOUDFLARE_TURN_*`; the API hands short-lived credentials to
the client).

Disc uploads come in 8 MB pieces (`PUT /api/games/uploads/{id}/{file}/{n}`): a proxy
in front must take bodies of at least 9 MB.

## 2. Configuration

- **`.env`** (repo root; the API, world-server and the client build all read it):
  `YUTOPIA_WORLD_SECRET`, `YUTOPIA_INTERNAL_SECRET` (`openssl rand -hex 32` each),
  `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` (`wss://rtc.…`),
  `YUTOPIA_WORLD_URL` (`wss://world.…`), `YUTOPIA_CLIENT_URL` (`https://…`),
  `YUTOPIA_ADMINS` (comma-separated emails; admins on their next sign-in),
  `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`, `VORTEXOS_SHARED_SECRET`,
  `NEXT_PUBLIC_VORTEXOS_URL`, and `YUTOPIA_JELLYFIN_URL` / `_KEY` for the TV.
  **Never** `YUTOPIA_ALLOW_BOTS` (lets unauthenticated `bot:` tokens join),
  `YUTOPIA_TEST_BIOS_MD5` or `YUTOPIA_E2E` in production.
- **`apps/api/.env`**: created by the API's dev image on its first start
  (`cp .env.example` + `key:generate`). Production takes `APP_KEY`, `APP_URL`
  (`https://yutopia.example.com`), `YUTOPIA_SIGNUP` (`invite` | `open` | `closed`) and
  mail from it; the compose file fixes the rest (production, no debug, logs to
  stderr, the database, the files folder).
- **`docker/livekit.keys.yaml`** (gitignored): `<LIVEKIT_API_KEY>: <LIVEKIT_API_SECRET>`,
  `chmod 600`. `docker/livekit.yaml` is shared by both stacks.

## 3. Start / update

```
git pull
docker compose -f docker/prod/compose.yaml --env-file .env up -d --build
```

From the repo root, always with `--env-file .env`: the client's `NEXT_PUBLIC_*` are
baked in at build time (the compose file refuses to build without them). The API
migrates on every start. The client image fetches the emulator cores while it
builds (see below), so the build needs the network.

Files (games, discs, saves, BIOS, photos) are in `apps/api/storage/app/private` on
the host, mounted at `/data/files`. The API runs as `www-data` (uid 82), so that
folder must be its own:

```
docker run --rm -v "$PWD/apps/api/storage/app/private:/f" alpine chown -R 82:82 /f
```

To go from the prod stack to the dev one (or back): `down` the one, `up` the other.
They use different database volumes (`yutopia-prod_db_data`, `yutopia_db_data`).

## 4. Check it

- `https://yutopia.example.com/api/config` → `{"worldName":…,"signup":"invite"}`
- `https://world.yutopia.example.com/health` → `{"ok":true,…}`;
  `/metrics` → Prometheus text (rooms, clients, tick time, message and API errors).
- `https://rtc.yutopia.example.com/` → `OK`
- Sign in, walk, check the voice indicator in the top bar (▂▄▆ = good).
- `docker compose -f docker/prod/compose.yaml logs --since 10m api world client`

## 5. Operations

- **Backups:** the database and the files folder are all there is (the world-server
  is stateless: the world rebuilds from the API when it starts).
  ```
  docker exec yutopia-db pg_dump -U yutopia -Fc yutopia > yutopia-$(date +%F).dump
  tar -C apps/api/storage/app -czf yutopia-files-$(date +%F).tgz private
  ```
  Restore: `docker exec -i yutopia-db pg_restore -U yutopia -d yutopia --clean --if-exists < x.dump`.
- **Restarts:** clients reconnect on their own (resume within 20 s, then a fresh
  session). Restarting the world-server during the day is fine.
- **Scheduler:** `yutopia:prune-uploads` hourly (game uploads left unfinished for 24 h).
- **Moderation:** admins (`YUTOPIA_ADMINS`) can mute (enforced by LiveKit), remove
  someone for 10 minutes and lock private rooms; everyone builds.
- **Accounts:** sign-up by invite (admins make invite links in the HUD's invites panel); a
  password reset needs working mail (`MAIL_*` in `apps/api/.env`).

## 6. Moving in from Yondra (once)

`php artisan yutopia:import` copies one Yondra space as the world, with its people,
games, phone and files, reading Yondra read-only: `docs/plan/24-standalone.md` §7.
It ran on the server on 2026-10-18 (`--world=1`).

## 7. Native apps (optional)

`apps/client/capacitor.config.ts` loads the hosted client.
`npx cap add android`, then add `RECORD_AUDIO`, `CAMERA` and
`MODIFY_AUDIO_SETTINGS` to the manifest. The PWA (`/manifest.webmanifest`) already
installs on desktop and mobile without a store.

## The game room's emulators (docs/plan/09-game-room.md)

The client image fetches the emulator cores and the built-in cartridges at build
time (`node tools/emu-assets.mjs`, each file pinned by sha256 in
`tools/emu-cores.json` / `tools/emu-games.json`; GPL sources linked in
`/emu/cores/SOURCES.md` and the library's credits). For a dev checkout run the
same command once; `node tools/emu-assets.mjs --check` tells you if anything's
missing. Next only serves `public/` files that were there when it built: after
fetching a core by hand, rebuild (or restart `next dev`) — until then the core's
`.js` / `.wasm` are 404s and the console stays dark. Snes9x and Genesis Plus GX
are non-commercial licences: fine for a team and friends, to be swapped for other
cores before Yutopia is ever sold.

Discs (the disc console, `docs/plan/23-disc-console.md`) are kept up to
`YUTOPIA_DISC_QUOTA` (default 10 GiB) — size the disk for it.

## VortexOS on the computers (docs/plan/19-vortexos.md)

- Yutopia client: `NEXT_PUBLIC_VORTEXOS_URL` (default `https://vortex.serious-sam.dev`).
- VortexOS frontend (its own repo): build with `VITE_HOST_ORIGINS=https://<yutopia origin>` (comma-separated) so the bridge talks to Yutopia; consider `add_header Content-Security-Policy "frame-ancestors 'self' https://<yutopia origin>" always;` in its nginx `location /`.
- Sign in with Yutopia: one random secret, `VORTEXOS_SHARED_SECRET` in Yutopia's `.env`
  and `YONDRA_SHARED_SECRET` in VortexOS's backend, plus `YONDRA_URL=https://<yutopia origin>`
  there (it calls `/api/internal/vortexos/handoff`; the variable names are from before the
  move). Unset = off (people sign in with their VortexOS account).
