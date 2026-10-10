# 01 — Vision

## The pitch

Open Yutopia and you're *in the studio* with your team. Your avatar sits at your
desk; the people around you are the people you work with. Walk over to someone and
their voice fades in. Step into the War Room and you're in a meeting. The wall shows
the project's Yondra board — live — and when someone moves a card in Yondra, it moves
on the wall too. Vortex is somewhere in the building, being a jerk.

Yondra is where the work is **tracked**. Yutopia is where the team **is**.

## Where we beat Gather ("more quality")

| Gather | Yutopia |
|---|---|
| Flat top-down pixel tiles | 2.5D isometric rooms with depth, light, shadows, day/night, 80s hi-fi furniture |
| Mono proximity audio that just fades | **Spatial stereo audio** (left/right + distance), room acoustics per area, noise suppression |
| Generic office, no idea what you're working on | Your desk, status and rooms come **from Yondra**: what cards you're doing, which project you're in, sprint rituals |
| Embeds are iframes in a corner | The board *is* the wall: live card counts drawn in-world; walk up to open the full board |
| Static NPCs | Vortex: a persona with lore, mysteries and memory, spanning both apps |
| Janky arrow-key movement | Click-to-walk pathfinding + WASD + gamepad, 60 fps, interpolated remote movement |
| Meeting = a video grid | Meeting rooms with stage/spotlight, screen share, shared whiteboard, planning-poker table |

## Core loops

1. **Presence loop** — open the app → land at your desk → see who's around → drop in on someone.
2. **Meeting loop** — standup corner / War Room / stage → talk, share, look at the board → leave.
3. **Work loop** — walk to the board wall → open a card → change it → everyone sees it, in both apps.
4. **Play loop** — Vortex mysteries, arcade cabinet (Yondra already has `/arcade`), easter eggs in rooms.

## Non-goals for v1

- Public sign-up, billing, multi-tenant ops.
- Full 3D.
- Native mobile app (the web client should *work* on mobile; a Capacitor build comes later).
- Replacing Yondra's UI — Yutopia embeds and links to it, never re-implements boards.

## Quality budgets (enforced by tools, like MK-V)

| Budget | Target |
|---|---|
| Render | 60 fps with 50 avatars on a mid-range laptop; ≤ 4 ms/frame of world logic |
| Movement | Remote-position latency ≤ 150 ms p95; no visible rubber-banding |
| Server tick | 20 Hz authoritative world tick |
| Audio | First audio ≤ 2 s after walking into range; mouth-to-ear ≤ 250 ms |
| Load | Lobby interactive ≤ 2 s; world playable ≤ 5 s on a cold cache |
| A11y | Contrast AA on all UI, reduced-motion mode, keyboard-only playable |
