# Yutopia — Plan Index

> **Yondra + Utopia.** A Gather-style virtual world where the team works together
> immersed — walk up to people to talk, meet in rooms, see the work live on the
> walls — built to a much higher quality bar and **fully synced with Yondra**.

## Locked decisions (2026-10-09)

| Topic | Decision |
|---|---|
| Look | **2.5D isometric**, in Yondra's warm 80s hi-fi language (walnut, cream, amber VFD, rust, olive — no neon) |
| Renderer | PixiJS v8 on a client-only canvas, React UI overlay |
| Audience v1 | **Team & friends first** (≤ 50 concurrent), architecture ready to grow, no billing |
| Sync with Yondra | **All four:** same accounts/teams · live boards in the world · Vortex lives there · presence both ways |
| Audio/video | **LiveKit self-hosted** in Docker (same API as LiveKit Cloud → can move later) |
| Source of truth | Yondra's Laravel stays the owner of users, projects, boards, Vortex. Yutopia owns only world state (maps, avatars, positions) |

## Reading order

1. [01-vision.md](01-vision.md) — what it is, what "more quality than Gather" means, budgets
2. [02-architecture.md](02-architecture.md) — services, repos, auth, realtime, A/V, data model, Yondra sync contract
3. [03-roadmap.md](03-roadmap.md) — delivery in **Fitas** (tapes), each with an exit test
4. [04-world-and-art.md](04-world-and-art.md) — isometric art direction, avatars, rooms, sound
5. [05-risks-and-open-questions.md](05-risks-and-open-questions.md) — what can sink it + decisions still open
6. [09-game-room.md](09-game-room.md) — Fita 9 (delivered): game room, consoles plugged into a TV, emulators streamed to everyone
7. [10-media.md](10-media.md) — Fita 10 (delivered): more TVs (wall too), YouTube + Jellyfin on them for everyone nearby, YouTube on the radio
8. [11-wall-building.md](11-wall-building.md) — Fita 11 (delivered): Sims-style wall building and painting, face indicators
9. [12-first-person.md](12-first-person.md) — First person (delivered): the 3D view's camera in your head, a third View choice
10. [13-pets.md](13-pets.md) — Fita 12 (delivered): pets — six species incl. the platypus, needs, XP, tricks, toys, clothes, commands, sounds, battles, pet furniture
11. [14-pets-v2.md](14-pets-v2.md) — Pets v2 (delivered): real 3D models in both views, throw-and-fetch play with toys in the world, the Pets cabinet
12. [15-pets-models-v3.md](15-pets-models-v3.md) — Pet models v3 (delivered): one-piece bodies and ramp shading, weight and gaits, expressions and species behaviour, breeds, sharper iso
13. [16-pets-breeds.md](16-pets-breeds.md) — Pets breeds (delivered): twelve dog and twelve cat breeds, part colours and eye colour for every species, a fedora
14. [17-pets-minds.md](17-pets-minds.md) — Pets with a mind (delivered): drives and intentions with thought bubbles, personality traits and a will of its own, memory and bonds, a day
15. [18-snow-campus.md](18-snow-campus.md) — The snow campus (delivered): the Ruptura-style headquarters, lawn and parking lot outside the 3D windows
16. [19-vortexos.md](19-vortexos.md) — VortexOS on the computers (delivered): a `computer` item you sit at, the real OS from vortex.serious-sam.dev in a monitor panel, a drawn boot / desktop / screensaver on the glass for everyone, sign in with Yondra

## Workflow rules (inherited from Yondra)

- Image-first for anything visual: mock image → approval → build → match the approved image.
- Commit/push only when asked, never with a Claude co-author trailer.
- Biome only on touched files.
- UI text in PT through `tr()`; Vortex's lines stay English and he never breaks character.
- Vortex never changes Yondra data without explicit confirmation.

## Status

All Fitas (0–8) delivered and verified — see [PROGRESS.md](PROGRESS.md). Open item: real-team validation
(Fita 8's two-week exit test and Fita 2's hour-long call).

## Deviations from the plan (on purpose)

- Maps are TypeScript (rooms + doors builder, validated by tests) and edited in-world (build mode), not Tiled.
- Art is procedural (box compositions + drawn avatars) instead of a Blender sprite pipeline.
- Who-hears-whom is enforced with LiveKit **publisher track permissions** (server-forced subscriptions are ignored by LiveKit when `canSubscribe=false`).
- Whiteboard is our own light vector board (keeps the bundle small) instead of Excalidraw/tldraw.
- Arcade = Yondra's own `/arcade`, embedded; planning poker = Yondra's own planning sessions.
