# Yutopia API

Yutopia's own server (Laravel 12, PHP 8.4, Sanctum, Postgres in Docker / sqlite in
tests). Plan: `docs/plan/24-standalone.md`.

- **Dev:** `pnpm docker:up` runs it as `yutopia-api` on http://localhost:8100 with
  Postgres (`yutopia-db`, host port 5444), a queue worker and the scheduler. It
  migrates and seeds ana@ / bia@yutopia.test (password `yutopia-demo`, Ana is an admin)
  every time it starts. Without Docker: `composer install && cp .env.example .env &&
  php artisan key:generate && php artisan migrate --seed && php artisan serve`.
- **Checks:** `pnpm api:test` (Pest), `pnpm api:lint` (Pint). Biome stays out of here.
- **Config:** `config/yutopia.php`. Secrets shared with the world-server
  (`YUTOPIA_WORLD_SECRET`, `YUTOPIA_INTERNAL_SECRET`, `LIVEKIT_*`) come from
  `yutopia/.env` on the Docker stack. `YUTOPIA_SIGNUP` = `open | invite | closed`;
  `YUTOPIA_ADMINS` = emails made admin when they sign in; `php artisan yutopia:admin
  <email> [--revoke]`.

## Endpoints

People (Sanctum bearer, `throttle:api` 240/min unless noted):

| | |
|---|---|
| `GET /api/config` | world name + sign-up mode |
| `POST /api/login` · `/register` · `/forgot-password` · `/reset-password` | accounts (10/min per IP) |
| `GET /api/invites/{code}` | is this invite still good |
| `GET /api/me` · `POST /api/logout` | |
| `POST /api/session` | world JWT (`iss yutopia`, `aud yutopia-world`; roles: everyone `member`+`builder`, admins + `admin`), LiveKit JWT for room `world`, TURN relays |
| `GET/PUT /api/avatar` · `GET/POST/DELETE /api/setups[/{id}]` · `GET /api/members` | look, saved build setups, everyone (to give a room or desk to) |
| `/api/games` (list, upload a cartridge, delete, `/{id}/rom`, `/{id}/files/{i}` with Range) · `/api/games/uploads` (start, show, `PUT /{id}/{file}/{n}` pieces, finish, cancel) · `/api/bios` · `/api/saves/{game}[/{state\|sram}]` | the game room; files under `storage/app/private/{games,uploads,bios,saves}`; who brought it or an admin removes it |
| `/api/phone/*` | settings, contacts, threads (incl. the one `everyone` thread), messages, read, typing, react, calls, photos (+ keep), Vortex |
| `GET /api/photos/{id}` | a photo / video file by signed URL (7 days, re-signed in every listing) |
| `POST /api/vortexos/handoff` | a one-time code for VortexOS |
| `GET/POST/DELETE /api/admin/invites` | admins only |

The world-server (`/api/internal/*`, HMAC over `{ts}.{METHOD}.{path?query}.{body}` with `YUTOPIA_INTERNAL_SECRET`, never throttled):
`GET /world`, `POST /world/seed`, `PUT /world/layout`, `PUT /world/playlists`, `PUT /objects`, `DELETE /objects/{uid}`,
`POST /desk`, `GET/PUT /spawn/{uid}`, `POST /presence`, `POST /vortex`, `GET /games/{id}`, `POST /phone/calls`,
`GET/POST /pets/{uid}`, `PUT/DELETE /pets/{uid}/{petId}`, `GET /ping`.

VortexOS's backend: `POST /api/internal/vortexos/handoff` (its own `X-VortexOS-*` HMAC, `VORTEXOS_SHARED_SECRET`) — the contract Yondra served.

**Live phone events** go the other way: `Push` gathers them during a request and, after the response, sends
`POST {YUTOPIA_WORLD_INTERNAL}/internal/push` with `{"events": [{"uid": 2, "event": {"type": "message", …}}]}`, signed the same way
(path `/internal/push`). The world-server hands each to that person's client; a failure is only logged.

## The move off Yondra (once)

`php artisan yutopia:import --world=<space id> --storage=<Yondra's storage/app/private> [--users=yutopia|all] [--games=world|all] [--threads=keep|drop] [--dry-run] [--fresh]`
reads Yondra through the `yondra` connection (`YONDRA_DB_*`) and its files, prints what comes along (the dry run stops
there), copies the files (checked by size + sha1, the space dropped from their paths), then writes everything in one
transaction and counts it against the plan. Ids are kept; the id sequences move past them (users: past every Yondra
account). `YUTOPIA_ADMINS` decides the admins (Yondra's own admin flag isn't carried). Owners of rooms and desks who
don't come along are cleared. A world-server that's up is held closed while it writes. Plan: `docs/plan/24-standalone.md` §7.

`php artisan yutopia:world export|import <file>` keeps the world (map, objects, desks) aside / puts it back.
