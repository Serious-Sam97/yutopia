# 02 — Architecture

## Big picture

```
                   ┌──────────────────────── Yondra (existing) ────────────────────────┐
                   │  yondra-frontend (Next.js)        yondra (Laravel 12)             │
                   │   boards, cards, Vortex UI   ◄──►  Sanctum · Reverb · Postgres ·   │
                   │   + "who's in Yutopia" badges      Redis · Services/Vortex         │
                   │                                    + NEW Yutopia module            │
                   └───────────▲───────────────────────────▲──────────▲─────────────────┘
                     embed     │ /boards/{id}?embed=yutopia │ REST +   │ signed internal
                   (iframe)    │                            │ Echo     │ webhooks (presence)
┌──────────────────────────────┴────────────┐              │          │
│ yutopia/apps/client (Next.js + PixiJS v8) │──────────────┘          │
│  isometric world · React HUD · LiveKit    │                         │
└───────┬──────────────────────┬────────────┘                         │
        │ WebSocket (positions)│ WebRTC (audio/video/screen)          │
┌───────▼──────────────────┐ ┌─▼───────────────────────┐              │
│ apps/world-server        │ │ LiveKit (self-hosted)   │              │
│ Colyseus (Node/TS)       │─┘ SFU, rooms per space    │              │
│ authoritative rooms,     │                                          │
│ 20 Hz tick, Vortex NPC   │──────────────────────────────────────────┘
└──────────────────────────┘
```

## Why each piece

- **Colyseus for the world, not Reverb.** Reverb is great for Yondra's event broadcasts,
  but avatar movement needs an authoritative 20 Hz game loop, binary state deltas,
  interest management and collision on the server. Colyseus does exactly that in TS,
  so client and server share movement and collision code.
- **LiveKit for A/V.** An SFU with selective subscription: each client only subscribes to
  the tracks of people in range, so 50 people in one space stay cheap. Simulcast,
  data channels, screen share and a PHP server SDK to mint tokens from Laravel.
- **PixiJS v8** for the isometric renderer (WebGPU/WebGL, sprite batching, filters for
  light/shadow). React only for the HUD (chat, controls, panels), never per-frame.
- **Next.js client** to match yondra-frontend (same Biome, Tailwind 4, Playwright, auth
  patterns, Capacitor later). The world is one client-only component.
- **Tiled** (isometric maps) as the v1 map editor. An in-world build mode comes later (Fita 7).

## Repo layout

New repo `projects/yondra/yutopia/`, pnpm workspaces:

```
yutopia/
├── apps/
│   ├── client/          Next.js — lobby, world canvas, HUD
│   └── world-server/    Colyseus — rooms, tick, NPCs
├── packages/
│   ├── shared/          protocol types, iso math, collision, pathfinding (A*), map schema
│   └── maps/            Tiled .tmj maps + tilesets + sprite atlases
├── docker/              compose: client, world-server, livekit (joins Yondra's `sail` network)
└── docs/plan/           this plan
```

Yondra-side changes live in the existing repos (a `Yutopia` module in Laravel, a few
components in yondra-frontend). No shared database access from Yutopia: **only Laravel
touches Postgres.**

## Auth (same accounts)

1. The user is logged into Yondra (Sanctum SPA cookie). The Yutopia client origin is added to
   `SANCTUM_STATEFUL_DOMAINS` + CORS, so it shares the session. (Prod: same parent domain,
   e.g. `app.yondra…` / `world.yondra…`.)
2. Client calls `POST /api/yutopia/session` with `space_id`. Laravel checks access via
   `Project::isAccessibleBy()` and returns:
   - `world_token` — short-lived JWT (HS256, 10 min, shared secret with world-server):
     `{ sub, name, avatar, space_id, project_id, roles }`
   - `livekit_token` — LiveKit JWT for room `space:{id}`, with the grants the user's role allows.
3. world-server verifies `world_token` in `onAuth`. Never calls Postgres.
4. Tokens refresh silently before expiry. Leaving the project = next refresh is denied → kicked.

## Realtime channels

| What | Transport | Owner |
|---|---|---|
| Avatar position, facing, animation, emotes | Colyseus state deltas, 20 Hz | world-server |
| Area enter/leave (desk, room, stage) | Colyseus messages | world-server |
| Voice / video / screen | LiveKit tracks, subscribed by distance + area | LiveKit |
| Board/card changes | Existing Reverb channel `board.{id}` (Echo in the client) | Laravel |
| "Who's in Yutopia, and where" for Yondra | Laravel broadcast on `project.{id}` | Laravel (fed by world-server) |
| Chat in the world | Colyseus (ephemeral), optional persistence via Laravel later | world-server |

## Proximity A/V rules

- **Open floor:** subscribe to people within radius *R* (≈ 6 tiles); gain and stereo pan from
  relative position (WebAudio `PannerNode`); video bubble above the avatar fades with distance.
- **Private area** (meeting room, booth): everyone inside hears everyone inside, nobody outside
  hears in. Area = polygon from the Tiled map.
- **Stage:** whoever stands on it is heard by the whole space (all-hands / demo).
- **Focus booth / Do-not-disturb:** you don't publish or subscribe until someone knocks.
- Decision is made **on the server** (world-server tells each client who to subscribe to),
  so a modified client can't eavesdrop. LiveKit permissions back it up.

## Data model (Laravel, new tables)

| Table | Purpose |
|---|---|
| `yutopia_spaces` | id, project_id (nullable for a "lobby" space), slug, name, map_key, settings json |
| `yutopia_objects` | space_id, kind (`board_wall`, `whiteboard`, `poker_table`, `arcade`, `door`…), ref_id (e.g. board_id), position, props json |
| `yutopia_avatars` | user_id, layers json (body, hair, outfit, accessory, colors), updated_at |
| `yutopia_desks` | space_id, user_id, desk_key — your assigned desk |

Ephemeral state (who's where right now) lives in world-server memory + a Redis hash that
Laravel reads for the Yondra badges. Nothing per-frame ever reaches Postgres.

## Yondra sync contract

**Yutopia → Yondra**
- `POST /internal/yutopia/presence` (HMAC-signed, from world-server, throttled to changes only):
  `{ user_id, space_id, area_key | null, status: online|away|dnd|offline }`.
- Laravel stores it in Redis (`yutopia:presence:{project_id}`) and broadcasts
  `YutopiaPresenceChanged` on `project.{id}`. yondra-frontend shows avatars + "in the War Room".
- Deep link `yutopia://…/space/{id}?to=user:{id}` (web URL in practice) — "join them" from Yondra.

**Yondra → Yutopia**
- Board wall: client subscribes to `board.{id}` via Echo and redraws counts/cards in Pixi.
- Opening the board: a panel with an iframe to `yondra-frontend /boards/{id}?embed=yutopia`
  (chrome-less layout), plus a `postMessage` bridge (`card:open`, `card:moved`, `close`).
  Exact parity with Yondra, zero duplicated board code. A native in-world card view can come later.
- Your status/desk: what you're doing comes from cards assigned to you in `doing`.
- Rituals reuse existing APIs: planning poker → `usePlanningSession` endpoints, sprint review → sprint report.

**Vortex**
- Same persona and lore bible (`design/vortex-mk5/01-lore-biblia.md` is the source of truth).
- In Yutopia he's an NPC entity owned by world-server (movement, behaviour tree), and his
  *lines* come from Laravel's `Services/Vortex` (new endpoint scoped to world context), so
  memory/state is shared with his Yondra self.
- All MK-V rules apply: never breaks character, crisis handling stays in character + CVV 188,
  never changes data without confirmation.

## Ports (local dev, proposal)

| Service | Port |
|---|---|
| yutopia client | 3100 |
| world-server (ws) | 2567 |
| LiveKit | 7880 (ws), 7881 tcp, 50000–50100 udp |

All containers join Yondra's `sail` network so world-server can reach `laravel.test` directly.
