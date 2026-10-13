# Deploying Yutopia

Yutopia is three services next to Yondra: the **client** (Next.js), the
**world-server** (Colyseus) and **LiveKit** (voice/video). Yondra's Laravel stays
the source of truth (users, projects, boards, Vortex) and is deployed as today.

## 1. Yondra side (once)

1. Deploy the Yondra backend with the Yutopia module (migrations
   `2026_10_11_000001_create_yutopia_tables` … `2026_10_13_000001_create_yutopia_games`,
   `routes/yutopia.php`). The game room keeps uploaded cartridges and saves on
   Yondra's private `local` disk (`storage/app/private/yutopia/{games,saves}`):
   back it up with the rest of Yondra's storage.
2. Add to Yondra's backend `.env` (generate fresh secrets, never reuse dev ones):
   ```
   YUTOPIA_WORLD_SECRET=<openssl rand -hex 32>
   YUTOPIA_INTERNAL_SECRET=<openssl rand -hex 32>
   YUTOPIA_WORLD_URL=wss://world.yutopia.example.com
   YUTOPIA_CLIENT_URL=https://yutopia.example.com
   LIVEKIT_URL=wss://rtc.yutopia.example.com
   LIVEKIT_API_KEY=<APIxxxxxxxx>
   LIVEKIT_API_SECRET=<openssl rand -hex 32>
   ```
3. Add the Yutopia origin to `config/cors.php` (`allowed_origins` / patterns).
4. Yondra frontend env: `NEXT_PUBLIC_YUTOPIA_ORIGINS=https://yutopia.example.com`
   and `NEXT_PUBLIC_YUTOPIA_URL=https://yutopia.example.com` (embed allow-list +
   "Open Yutopia").
5. Do **not** set `YUTOPIA_ALLOW_BOTS` in production.

## 2. Yutopia services

```
cd docker/prod
cp .env.example .env            # fill in domains + the same secrets as Yondra
printf 'APIxxxxxxxx: <secret>\n' > livekit.keys.yaml && chmod 600 livekit.keys.yaml
docker compose up -d --build
```

- DNS: `yutopia.`, `world.yutopia.`, `rtc.yutopia.`, `turn.` → this server.
- Firewall: 80/443 tcp, 443/udp, 7881 tcp, 50000–60000 udp, 3478 udp, 5349 tcp (TURN).
- TURN certificate: point `docker/prod/livekit.yaml` → `turn.cert_file/key_file`
  at a certificate for the TURN domain (e.g. copied from Caddy's data volume).

## 3. Check it

- `https://world.yutopia.example.com/health` → `{"ok":true,…}`
- `https://world.yutopia.example.com/metrics` → Prometheus text (rooms, clients,
  tick time, message errors, Yondra call errors). Scrape it.
- Sign in on `https://yutopia.example.com` with a Yondra account, open a project
  space, check the voice indicator in the top bar (▂▄▆ = good).

## 4. Operations

- **Backups:** everything durable is in Yondra's database (`yutopia_*` tables) —
  covered by Yondra's backups. The world-server is stateless (rooms rebuild from
  Laravel on start).
- **Restarts:** clients reconnect on their own (resume within 20 s, then a fresh
  session). Restarting the world-server during the day is fine.
- **Scaling:** one world-server process handles a space; for more spaces/people
  run several and add Colyseus' Redis presence/driver (Yondra already runs Redis).
- **Moderation:** project owners can mute (enforced by LiveKit), remove someone
  for 10 minutes, and lock private rooms (entry by knocking).

## 5. Native apps (optional)

`apps/client/capacitor.config.ts` loads the hosted client (same as Yondra).
`npx cap add android`, then add `RECORD_AUDIO`, `CAMERA` and
`MODIFY_AUDIO_SETTINGS` to the manifest. The PWA (`/manifest.webmanifest`) already
installs on desktop and mobile without a store.

## The game room's emulators (docs/plan/09-game-room.md)

The client image fetches the emulator cores and the built-in cartridges at build
time (`node tools/emu-assets.mjs`, each file pinned by sha256 in
`tools/emu-cores.json` / `tools/emu-games.json`; GPL sources linked in
`/emu/cores/SOURCES.md` and the library's credits). For a dev checkout run the
same command once; `node tools/emu-assets.mjs --check` tells you if anything's
missing. Snes9x and Genesis Plus GX are non-commercial licences: fine for a team
and friends, to be swapped for other cores before Yutopia is ever sold.
