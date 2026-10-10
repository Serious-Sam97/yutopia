# 03 — Roadmap (Fitas)

Each Fita ends with an **exit test**: something you can do with friends, not a checklist.
Don't start the next Fita until the exit test passes.

## Fita 0 — Foundations
- Create the repo, pnpm workspaces, Biome, TS strict, Playwright, CI.
- Docker compose: client, world-server, LiveKit, all on Yondra's `sail` network.
- Laravel: `Yutopia` module, `yutopia_spaces` migration, `POST /api/yutopia/session` (world + LiveKit tokens), Pest tests.
- Client: lobby page "pick a space" (from your Yondra projects) → empty iso grid.
- world-server: `SpaceRoom` with `onAuth` verifying the world token.

**Exit:** log in with your Yondra account, pick a project, land in an empty isometric room, and a second browser sees you appear.

## Fita 1 — Walk
- Iso renderer: tile layers, depth sorting, camera follow/zoom, Tiled map loading.
- Movement: WASD + click-to-walk (A* in `packages/shared`), collision, server authority, client prediction + interpolation for others.
- Placeholder avatar (8 directions, idle/walk), name tags, emotes.
- Perf tooling: fps/frametime overlay + headless bot swarm (50 fake players) as `tools/world-perf.mjs`.

**Exit:** 5 friends + 45 bots walking around one map at 60 fps, with no rubber-banding.

## Fita 2 — Talk
- LiveKit integration: join on enter, server-decided subscriptions by distance/area.
- Spatial audio (pan + falloff), video bubbles, mic/cam/speaker controls, device picker, noise suppression.
- Private areas, stage, screen share, focus booth + knock.
- Reconnection handling for ws and WebRTC.

**Exit:** a real hour-long team call inside Yutopia that people prefer over Meet.

## Fita 3 — Yondra link
- Spaces from projects; membership gate; desk assignment.
- Presence both ways: world-server → Laravel webhook → `project.{id}` broadcast → badges in yondra-frontend; "join them" deep link.
- Board wall object: live counts via Echo; open panel with `?embed=yutopia` iframe + postMessage bridge. Needs a chrome-less embed layout in yondra-frontend.
- Status from Yondra: your `doing` cards shown at your desk / on hover.

**Exit:** move a card in Yondra, see the wall update in Yutopia within a second, and see "Ana is in the War Room" in Yondra.

## Fita 4 — Art & avatars (image-first)
- Mock images of the main studio floor, War Room, booths, lobby → approval.
- Final tileset + furniture in the 80s hi-fi palette; lighting layer (lamps, VFD glow), day/night tied to local time.
- Modular avatars (layers + colors), avatar editor, saved to `yutopia_avatars`.
- Ambient sound: room tone, tape hiss, a lo-fi radio object everyone hears together.

**Exit:** screenshots look clearly better than Gather; everyone has made their avatar.

## Fita 5 — Rituals
- Standup corner: gathers people, shows each person's `doing` cards, round-robin timer.
- Planning poker table using the existing planning-session API.
- Sprint review stage: sprint report on the big screen.
- Shared whiteboard object (start with tldraw or excalidraw embedded, synced per object).

**Exit:** run a full sprint's ceremonies inside Yutopia.

## Fita 6 — Vortex in Yutopia
- Vortex NPC: behaviour tree (wander, stalk, heckle meetings, sleep in the server room), lines from Laravel `Services/Vortex`.
- Lore spots and mysteries that cross both apps (find something in Yutopia → unlock something in Yondra and vice versa).
- Respect the speech budget so he doesn't wreck meetings (muted on stage/in private areas unless invited).

**Exit:** friends hunt a Vortex mystery across Yondra and Yutopia.

## Fita 7 — Build mode
- In-world editor: place/move furniture and objects, draw private areas, save to `yutopia_objects`.
- Per-project rooms from templates.

**Exit:** a teammate builds their project's room without touching Tiled.

## Fita 8 — Hardening & ship
- Budgets in CI (fps, bundle, latency, contrast).
- Mobile web polish → Capacitor build; desktop wrapper (optional).
- Moderation basics (kick, mute, lock room), observability (logs, metrics, LiveKit stats).
- Production deploy: TLS, TURN for LiveKit, prod secrets, backups.

**Exit:** the team uses Yutopia daily for two weeks without it breaking.
