# Yutopia on its own — own server, one world (plan — 2026-10-18)

**Status:** I0 (production inventory) and I1–I4 delivered 2026-10-18 (see `PROGRESS.md`;
I0's findings in §11). I5 (e2e) and I6 (the import, rehearsed on local data) delivered too; next: the rehearsal on a copy of production (needs the code on the server), then I7.

Ask (2026-10-18): "Make Yutopia an isolated thing from Yondra — today Yutopia uses
Yondra's API and I don't want that anymore (we're going to add a manual integration
with a Yondra project per office in the future). We're also going to remove the
spaces: there's going to be one space for everyone."

Decisions taken with the user:

| Topic | Decision |
|---|---|
| Server | **Laravel 12**, its own app at `yutopia/apps/api` (compared against Go and Rust: nothing here needs their speed — the 20 Hz world stays in the Node world-server — and ~80% of the code already exists as Yondra's Yutopia module with its Pest tests) |
| Existing data | **Migrate all of it** from Yondra. One space becomes *the* world; the import runs on the production server with a dry run first |
| Yondra-backed features | Only **VortexOS sign-in** gets a Yutopia version ("Sign in with Yutopia"). Everything else that reads Yondra's projects, boards, cards, soul or AI is **removed**; its furniture stays as decor |
| Roles | **Everyone can build.** Moderation (mute, kick, room lock) moves to an `is_admin` flag |
| Yondra integration | Later, by hand, **per office** (a room in the world linked to a Yondra project). Not built now; §9 keeps the seam |

## 1. Where we start (the inventory, 2026-10-18)

Yutopia has no backend of its own. Everything durable lives in Yondra:

- **Client → Yondra REST** (`apps/client/src/lib/api.ts`, `world/games/api.ts`,
  `world/phone/data.ts`): login/logout (`/api/login`, Sanctum bearer in
  `localStorage["yutopia:token"]`), the handoff from Yondra's dashboard, `POST
  /api/yutopia/session` (world JWT + LiveKit JWT + Cloudflare TURN), the lobby
  (`GET /api/yutopia/spaces`), avatar, build setups, members, **boards / status /
  planning poker** (Yondra core endpoints), the Vortex terminal (`/api/mascot/fragments*`,
  `/api/ai/vortex-chat`), the whole phone (`/api/yutopia/phone/*`), games / discs /
  BIOS / saves (`/api/yutopia/spaces/{id}/…`), `POST /api/vortexos/handoff`.
- **Client ← Yondra Reverb** (`lib/echo.ts`): `private-board.{id}` (card confetti,
  poker), `private-App.Models.User.{id}` (`.phone` live texts, `.user.event` AI stream).
- **Client embeds Yondra**: `YondraFrame` (BoardPanel = Yondra's board, ArcadePanel =
  Yondra's `/arcade`), links out (TopBar "Yondra", open card, register).
- **World-server → Yondra internal** (`apps/world-server/src/yondra.ts`, HMAC with
  `YUTOPIA_INTERNAL_SECRET`): space info + seed, objects put/delete, layout,
  playlists, desk, spawns, presence (re-broadcast to Yondra's project channel), Vortex
  lines + fragment grants (Y01/Y03/Y04, Soul + cards), game metadata, pets CRUD, phone
  call log. The server stores nothing itself.
- **Yondra side** (`yondra/`): 7 controllers (~2.8k lines with the services),
  `app/Services/Yutopia/*`, 17 models in `app/Infrastructure/Models/Yutopia*`, 16
  `yutopia_*` tables (11 migrations), `YutopiaPhoneEvent`, `NotifyYutopiaText`,
  `yutopia:prune-uploads`, files on the private `local` disk under
  `storage/app/private/yutopia/{photos,games,saves,bios,uploads}`.
  Frontend: `/embed/yutopia`, `components/yutopia/*` (presence chip, dashboard key,
  handoff, NotInEmbed).
- **Spaces** = one per Yondra project (`yutopia_spaces.project_id` unique). Access =
  project membership, builder = project owner. Colyseus room `space` with
  `filterBy(["spaceId"])`, LiveKit room `space-<id>`, per-space tables: objects,
  desks, games, game_saves, spawns, uploads, bios; space-kind phone threads; photos
  tagged with a space.

Only `yutopia_spaces.project_id` and `yutopia_objects.ref_id` (board ids) point at
Yondra-core data. Everything else keys on `users` only — which is what makes a clean
move possible.

Found on the way (fixed by the port, not separately): the internal `vortex` endpoint
rejects the `vortexos` event (422, swallowed by `computer.ts`); signed photo URLs
never expire; space access doesn't exclude archived projects; world-server presence
pushes count against Yondra's 120/min `api` limiter.

## 2. Target

```
 Browser ── https://<domain>/            Next.js client (static + SSR)
        ├── https://<domain>/api/…       apps/api  (Laravel 12, Sanctum)   ── Postgres, private disk
        ├── wss://world.<domain>         apps/world-server (Colyseus, one room "world")
        └── wss://rtc.<domain>           LiveKit (rooms: world, tv-<id>, call-<id>)

 world-server ──HMAC──► api  /api/internal/…   (load/save world, pets, call log, vortex lines)
 api ──────────HMAC──► world-server /internal/push   (live phone events to online people)
 VortexOS backend ─HMAC─► api /api/internal/vortexos/handoff
```

- **Same origin for the API in production**: Caddy routes `/api/*` to the Laravel
  container, so the client needs no CORS and no second domain.
- **No Reverb, no Echo.** With one world, everyone online is connected to the
  world-server, so the API hands live phone events (message, read, typing, react,
  thread) to the world-server, which sends a `phone:live` message to that person's
  client. People offline pick them up on the next fetch, as today after a reconnect.
  `laravel-echo` and `pusher-js` leave the client.
- **World-server stays the authority** for everything live, and keeps talking to the
  API over the same signed internal calls (`yondra.ts` → `api.ts`, the env var
  becomes `YUTOPIA_API_INTERNAL`). The JWT keeps its shape minus `space_id` /
  `project_id`; `iss` becomes `yutopia`.

## 3. The API (`apps/api`)

A fresh Laravel 12 app (PHP ^8.2, Pest 3, Sanctum 4, same Biome-free PHP style as
Yondra: Pint). Module code is **copied** from Yondra and stripped of project coupling
— not shared, not a package.

- **Folders**: `app/Http/Controllers/{Auth,Avatar,Setups,World,Games,Uploads,Bios,Phone,VortexOS,Internal}Controller.php`,
  `app/Services/{Tokens,Turn,Vortex,Phone,GameSystems,Push}.php`, `app/Models/*`
  (plain `app/Models`, no Yondra infra layer), `routes/api.php` only.
- **Internal auth** as route middleware (`VerifyInternalSignature`), not inside
  controllers; internal routes skip the throttle.
- **Queue + scheduler**: `database` queue driver (no Redis needed at this scale);
  `prune-uploads` hourly. Runs as two more containers of the same image.
- **Files**: private `local` disk, same layout minus the space segment
  (`games/<sha1>…`, `saves/<game>/…`, `bios/<file>`, `photos/<uid>/…`,
  `uploads/<ulid>/…`). Signed photo URLs get an expiry (7 days, re-signed on fetch).
- **Container**: one image (FrankenPHP, classic mode — no Octane worker state
  pitfalls) used three ways: `api`, `queue`, `scheduler`. Postgres 17 in its own
  container with a volume; tests on sqlite in memory.

## 4. Data model (single world)

| Table | Change from Yondra's `yutopia_*` |
|---|---|
| `users` | **new**: id, name, email, password, email_verified_at, `is_admin`, remember_token, timestamps. **Imported ids are kept** (pets' bonds, room/desk `ownerId`, messages, photo folders and VortexOS links all hold user ids) |
| `personal_access_tokens`, `password_reset_tokens`, `jobs`, `cache` | Laravel defaults |
| `world` | was `yutopia_spaces`: **one row** — name, map_key, layout, settings (playlists), seeded_at. No project, no slug |
| `objects` | `space_id` gone, unique on `uid`; `ref_id` kept but unused (imported board walls keep their Yondra board id for the per-office integration later) |
| `desks`, `spawns` | `space_id` gone; unique on user (and desk uid) |
| `games`, `game_saves`, `uploads`, `bios` | `space_id` gone; quotas become world-wide (`YUTOPIA_DISC_QUOTA`, cart 128 MB) |
| `avatars`, `setups`, `pets`, `phones`, `contacts` | unchanged (already per user) |
| `threads` | kind `space` → `everyone` (one thread, every account is in it); `space_id` gone |
| `thread_members`, `messages` | unchanged |
| `photos` | `space_id` gone (the `where` text tag stays) |

## 5. Accounts, roles, tokens

- **Sign in** with email + password (`POST /api/login`, `/logout`, `GET /api/me`).
  Imported users keep their Yondra password hash, so their password works on day one.
- **Password reset** by email (Laravel's broker; needs `MAIL_*` on the server).
- **Sign-up**: an env switch `YUTOPIA_SIGNUP=open|invite|closed` (open question 2 for
  the default). `invite` = admins create single-use links.
- **Roles**: every account is `member` + `builder`. `is_admin` adds `admin`
  (mute, kick, room lock, deleting anyone's games/BIOS, granting admin). First
  admins come from `YUTOPIA_ADMINS=<emails>` at seed/import time.
- **`POST /api/session`** (no body): world JWT (HS256, 10 min, `sub,name,avatar,roles`),
  LiveKit JWT for room `world` (6 h), ICE servers (Cloudflare TURN, moved from
  `YutopiaTurn`), `world{name,mapKey}`, `user`, `canBuild: true`, `isAdmin`.
- **Demo seeder** (`DemoSeeder`): ana@/bia@yutopia.test, Ana admin — the dev stack
  and e2e use it.

## 6. What changes per piece

### World-server
- `yondra.ts` → `api.ts`: same `call()`, new base URL (`YUTOPIA_API_INTERNAL`), the
  signature now over `{ts}.{METHOD}.{/api/internal/path}.{body}`, paths without
  `/spaces/{id}` (the map in `apps/api/README.md`: `GET /world`, `POST /world/seed`,
  `PUT /world/layout`, `PUT /world/playlists`, `PUT /objects`, … `POST /phone/calls`).
  `presence` stays (the API keeps it in its cache for the phone's contacts; no
  broadcast); `grantFragment` goes.
- **One room**: `server.define("world", WorldRoom)` with no `filterBy`;
  `ROOM_NAME = "world"`; the client joins with `joinOrCreate("world", { token })`.
  `maxClients` raised (500) and a hard refusal at the cap, so Colyseus never opens a
  second copy that would write the same world. LiveKit room `world`.
- `spaceId` / `projectId` leave the room and the schema (`state.spaceId`,
  `state.projectId`); the media key signs `user.exp`; Jellyfin sessions key on the TV only.
- **Roles**: build / furnish / mapedit / history stay gated by `builder` (now
  everyone); `mod:*`, room lock, **TV / radio locks and door locks** by `admin`
  (a door also by its room's owner) — with everyone a builder, a lock anyone could
  undo would mean nothing. `Player.admin` is in the state for the client.
- **Phone**: the hub stays (now one room); `ring()` shows the area name, not a space
  name; new `POST /internal/push` (HMAC, `{events: [{uid, event}]}`) relays API events
  to that person's client as `phone:live` (dropped when they're offline).
- **Vortex**: `vortexLine` keeps working (the API serves the curated pools without Soul
  nicknames or card nags); fragment grants (Y03 at the terminal, Y04 at VortexOS) go.

### Client
- `lib/api.ts`: `NEXT_PUBLIC_API` points at the Yutopia API (same origin in prod);
  `YONDRA_APP` goes.
- **Routes**: the lobby goes — `/` checks the token and opens the world;
  `/s/[spaceId]` redirects to `/` (keeps the `?to=user:<id>` deep link); new
  `/register` (when sign-up isn't closed) and `/forgot`. Login text drops "Yondra account".
- **Removed** (code deleted, items stay as decor, i18n strings with them):
  `YondraFrame`, `BoardPanel`/`BoardPicker` (board walls show a static drawing),
  `ArcadePanel`, the board loading + `private-board` listeners + confetti
  (`controller.ts` ~2366–2530), desk-nameplate tasks + PersonCard "doing" + standup
  "doing" + notice-board blocked items (the 60 s `status` poll), planning poker
  (`RitualPanels` poker part — the standup ritual stays, world-server only), the
  Vortex terminal's AI chat + fragments + Y02 claim (`VortexTerminal.tsx`), TopBar
  "Yondra" button, the "open card" actions, `lib/echo.ts`.
- **Phone**: `?space=` params go; contacts come with `online` / `here` (the same now) /
  `area` / `status` and no `space` / `spaceId`; the thread kind `space` is `everyone`
  (no `space_id`); photo upload drops `space_id`; live events arrive as `phone:live`
  from the world socket. Paths: `/api/yutopia/phone/*` → `/api/phone/*`,
  `/api/yutopia/photos/{id}` → `/api/photos/{id}`.
- **Games**: `world/games/api.ts` paths lose `/yutopia/spaces/{s}` (`/api/games…`,
  `/api/bios…`, `/api/saves…`); the upload resume key loses the space id.
- **Avatar, setups, members**: `/api/yutopia/{avatar,setups}` → `/api/{avatar,setups}`,
  `/api/yutopia/spaces/{id}/members` → `/api/members`; session: `POST /api/session`
  with no body, answering `world` (name, mapKey), `canBuild`, `user.isAdmin`.
- **Space name** in TopBar / notice board / build bar / phone home becomes the world's
  name (or the area you're in).
- **ComputerPanel**: `POST /api/vortexos/handoff` on the Yutopia API, same flow.
- The world page budget gets room back (Echo, poker, board panels leave).

### VortexOS (no code change needed)
VortexOS links accounts by `yondraUserId` and redeems codes at
`<YONDRA_URL>/api/internal/vortexos/handoff` with `X-VortexOS-*` HMAC. The Yutopia API
serves **the same contract**, and imported user ids are kept, so pointing VortexOS's
`YONDRA_URL` at the Yutopia API (and giving it the new shared secret) keeps every
existing link. Renaming the column/env to `yutopia*` is a later, optional tidy-up in
the vortexos repo.

### Yondra (last, after the cutover has run for a week)
- Backend: remove `routes/yutopia.php` and its mount, the 6 Yutopia controllers,
  `Services/Yutopia/*`, the `Yutopia*` models, `YutopiaPhoneEvent`,
  `NotifyYutopiaText`, `YutopiaTextNotification`, `yutopia:prune-uploads` + its
  schedule, `config/yutopia.php`, the CORS origin, the TrimStrings exception in
  `bootstrap/app.php`, the `yutopia` notification-pref key, the 4 test files.
  A migration drops the `yutopia_*` tables — only after a backup.
  Fragments Y01–Y04 **stay defined** (people earned them; nothing grants them now;
  `VortexDarkTest` keeps its count). `VortexOSController` goes too once VortexOS points
  at Yutopia.
- Frontend: remove `app/embed/yutopia`, `components/yutopia/*`, its CSS import, the
  `NotInEmbed` wrappers in `layout.tsx`, the dashboard key in `HiFiPanels.tsx`.

## 7. The import (`php artisan yutopia:import`)

Runs **inside the new API** on the production server, reading Yondra through a second,
read-only DB connection (`yondra`, `YONDRA_DB_*`) and Yondra's storage folder mounted read-only.

```
php artisan yutopia:import --world=1 --storage=/yondra/storage/app/private \
    [--users=yutopia|all] [--games=world|all] [--threads=keep|drop] [--dry-run] [--fresh]
```

1. **Dry run** prints every space (map, objects, games, BIOS, saves, spawns, desks,
   playlists, its space thread's messages, and whether it's the world, left behind or
   empty), the people coming along (by id and email), the world, the game room, the phone,
   per-person data, owners being cleared, and the files (count, size, missing ones).
   Writes nothing.
2. **People**: `yutopia` = anyone with a Yutopia row of their own (avatar, pet, message,
   photo, spawn, setup, phone, contact they added, desk, thread membership, a game or BIOS
   they brought — in any space); `all` = every Yondra account. Ids, names, emails
   (lower-cased), password hashes and verified dates kept; Sanctum tokens aren't carried
   (everyone signs in once); Yondra's `is_admin` isn't either — `YUTOPIA_ADMINS` decides.
   The users id sequence continues after the *largest Yondra id*, so nobody new inherits
   the id of someone who stayed behind.
3. **World**: the chosen space's layout, playlists (other `settings` keys dropped),
   seeded_at; its objects (`ref_id` kept); desks and own arrival points of the people who
   come along. Rooms and desks owned by people who don't come along lose their owner.
4. **Games**: the chosen space's games (ids kept: consoles' `u:<id>` carts point at them),
   saves, BIOS; with `--games=all` every space's, one per sha1 / md5 (the world's first),
   one save per game (the newest). Unfinished uploads stay behind.
5. **Per person**: avatars, setups, pets, phones as they are; contacts when both people
   come along.
6. **Threads**: direct / group / Vortex threads with someone coming along, as they are; the
   world's space thread → `everyone` (everyone who comes along is a member — the ones who
   never opened it with what came before read); other spaces' space threads → groups with
   their members (`--threads=keep`) or dropped. Messages keep their ids (read receipts
   point at them); a photo that doesn't come along leaves its message without it.
7. **Files**: copied (not moved) with the space taken out of their path
   (`yutopia/games/<space>/x` → `games/x`, `yutopia/photos/<uid>/x` → `photos/<uid>/x`),
   each checked by size + sha1; a copy already there and identical is left alone, so a
   re-run is cheap. Missing files stop the import before anything is written.
8. **Write + check**: one transaction; row counts compared to the plan, a mismatch rolls
   everything back. Sequences moved past the ids. The live world-server (if any) is held
   closed meanwhile, as for a snapshot.

The target must be empty (`--fresh` wipes this database's people and world first).
Rehearse on a copy of the production data before the real cutover.

## 8. Order of work (phases, each with its exit test)

| # | Phase | Exit test |
|---|---|---|
| **I0** ✓ | **Production inventory** (read-only, by the server's Claude): deployment, DB driver, counts per space, file sizes, env names. Pick the world + import flags | The user picks `--world` and answers §10 |
| **I1** ✓ | **API foundation**: `apps/api`, users + admin, login/logout/me/register/reset, invites, Sanctum, `/api/session` (JWTs + TURN), internal-signature middleware, Docker dev stack (api, queue, scheduler, postgres), `DemoSeeder` | Pest green; login → session tokens verify with the world-server's own libraries (jose, livekit-server-sdk) and secrets. (The world-server leaves Yondra's `sail` network in I3, when it stops calling Yondra.) |
| **I2** ✓ | **Port the module, single-world**: world/objects/desks/spawns/playlists, avatars, setups, pets, games + uploads + BIOS + saves, phone (incl. `everyone` thread, photos, calls, curated Vortex replies), VortexOS handoff, internal routes, `Push` to the world-server. Port the ~43 Pest tests | Pest green on the ported suites (57 tests); every ported endpoint answers on the Docker stack's Postgres |
| **I3** ✓ | **World-server**: `api.ts`, one `world` room, roles (everyone builds, admin moderates), drop fragments / board seed, presence without the project broadcast, `/internal/push`, LiveKit room `world` | `pnpm test` + `typecheck`; two bots join the world against the dev API |
| **I4** ✓ | **Client**: new API base, lobby → world, register/forgot, removals listed in §6, phone + games paths, Echo gone, i18n, VortexOS handoff | `pnpm typecheck lint test`, budget under the cap; Ana + Bia walk, talk, text, call, build, play a cart, sit at a computer — both views, Chrome + Firefox |
| **I5** ✓ | **e2e on one world**: `helpers.ts` drops `spaceId()` (44 specs), logs in against the API; world snapshots (`php artisan yutopia:world export|import`, and for the suite `POST /api/e2e/world` with `YUTOPIA_E2E=1`): specs ask for the "demo" or "lab" fixture (`e2e/worlds`) and the world is swapped when the next spec needs the other one; specs for removed features deleted | Full Playwright run green twice in a row |
| **I6** ✓ (local) | **Import**: `yutopia:import` + dry run, tested against a fixture Yondra DB in Pest; then a rehearsal on a copy of production on the server | Dry-run report matches I0's numbers; rehearsal world opens with everything in place |
| **I7** | **Cutover** on the server (runbook in a rewritten `docs/DEPLOY.md`): announce → stop the old world-server → back up Yondra DB + storage → bring up the new stack → import → smoke test → switch DNS/Caddy → VortexOS `YONDRA_URL` → API | Real people in the new world; texts, pets, games, photos all there |
| **I8** | **Yondra cleanup** (§6), after a week without rollback | Yondra's Pest suite + frontend build green; no `yutopia` left in either repo except lore and fragments |

Rollback until I8: the old stack and Yondra's tables are untouched by the import
(read-only), so pointing Caddy back at the old client/world-server restores it — with
anything written in the new world since the cutover lost.

## 9. Seam for the future per-office Yondra integration (not built)

- Rooms (`layout.areas`) keep **stable ids** through the import; an office is an area.
- Later: an `office_links` table (area id, provider `yondra`, project ref, token set by
  hand), and the board-wall / desk-task / standup features come back reading through it.
- So the board-wall item kinds stay in the catalog now (as decor), and nothing in this
  plan renames area ids.

## 10. Open questions (answered 2026-10-18 unless marked)

1. **The world**: space 1, Limiar Core (`--world=1`), from I0.
2. **Sign-up**: invite links (`YUTOPIA_SIGNUP=invite`, the default).
3. **Who comes along**: only the 4 people with any Yutopia data (`--users=yutopia`, which
   no longer adds the project's members); anyone else gets an invite.
4. **Other spaces' games**: moot — only Limiar Core has any.
5. **Other spaces' group chats**: moot — Limiar Core's is the only space thread; it
   becomes "everyone".
6. **Text notifications**: dropped in I2 (the phone shows unread). *(could come back by email)*
7. **Domain**: keep `yutopia.yondra.net`; the API under `/api` on it.
8. **First admins**: *(open — which emails go in `YUTOPIA_ADMINS`; before I7)*
9. **Regular backups**: not now (the user's call). The one right before the cutover
   stays in the runbook — it is the rollback.

## 11. Production, as found (I0, 2026-10-18)

From the Claude on the server (read-only report; one Fedora machine):

- **How it runs**: a host `cloudflared` tunnel is the only way in (no nginx; the
  `galileo-caddy` container serves something else). `yutopia.yondra.net` → :3100
  (client), `yutopia-world.yondra.net` → :2567, `yutopia-livekit.yondra.net` → :7880
  (media direct on host UDP 50000–50100 + TCP 7881); Yondra on `api.yondra.net` → :8001,
  `reverb.yondra.net` → :8080. **Yutopia runs as dev servers** (`next dev`, `tsx watch`,
  source bind-mounted) from `yutopia/docker/compose.yaml`; `docker/prod/` is not running
  (and its `livekit.keys.yaml` is an empty root-owned *directory*). Checkouts level with
  `origin/main` (yutopia `bb73ca7`, yondra `1a0c07e`).
- **Database**: Yondra's Postgres **18.4** (`laravel`, 17 MB; `yutopia_*` 1.8 MB), all 11
  Yutopia migrations run.
- **Data**: 11 spaces, but **all real use is space 1, "Limiar Core"** (433 objects, 2
  games, 3 BIOS, 5 saves, 3 spawns, 4 desks, 1 playlist, 9 photos, the only space
  thread). Five spaces hold only a ~260-object copy of the Studio, five are empty; no
  uploads in progress anywhere. 8 users, **4 with any Yutopia data**; 2 pets; 4 threads
  (1 direct, 1 space, 2 Vortex), 105 messages (93 text, 7 photo, 5 calls), 9 photos
  (2 videos), 2 contacts, 1 phone.
- **Files**: 709 MB under `yondra/storage/app/private/yutopia` (games 698 MB — a 2 MB
  .sfc and a ~730 MB PS1 disc with its .cue; photos 7.4 MB; saves 2.2 MB; BIOS 1.5 MB).
  233 GB free.
- **Secrets**: `YUTOPIA_WORLD_SECRET`, `YUTOPIA_INTERNAL_SECRET`, `LIVEKIT_API_KEY/SECRET`,
  `VORTEXOS_SHARED_SECRET` are the same in `yondra/.env` and `yutopia/.env`;
  **`CLOUDFLARE_TURN_KEY_ID/API_TOKEN` exist only in `yondra/.env`** (the new API needs
  them); Jellyfin's in `yutopia/.env`.
- **No backups at all**: no dump, cron or timer; the database lives only in the Docker
  volume `yondra_sail-pgsql`, the files only in that folder.
- Known: LiveKit's `use_external_ip` breaks calls when the dynamic public IP changes.
- Checked here against yondra `1a0c07e`: Yondra's `vortex:*` scheduler ticks don't touch
  Yutopia's tables (only `yutopia:prune-uploads` does; it goes with the module).

What it settles:

- **The world is space 1, Limiar Core** (`--world=1`). The other spaces have nothing
  worth bringing (`--games=world`, the only space thread is Limiar Core's).
- **The import** runs on the server in a one-off container of the new API image joined
  to `yondra_sail` (reading `pgsql` with a read-only role) with Yondra's
  `storage/app/private/yutopia` mounted read-only. The new API's own database should be
  **Postgres 18** to match (the dev stack moves from 17.11).
- **I7 becomes "production for real"**: the new stack runs production builds (client
  `next start`, world `tsx` without watch, API `prod` target), behind the same tunnel:
  `yutopia.yondra.net` with a path rule `^/api/` → the API (same origin, no CORS), the
  world and LiveKit hostnames unchanged. Fix `docker/prod/livekit.keys.yaml` (a file),
  copy the shared secrets and the TURN keys over.
- **Backups**: a dump of Yondra's database and a copy of the Yutopia files right
  before the cutover (the rollback). Regular backups: not now (§10.9).
