# No ghosts — leaving is leaving, a reload is coming back (plan — decided 2026-10-23; delivered 2026-10-23)

Someone who left stayed in the room, faded ("away"), for 20 s. Someone who
reloaded came back next to their own faded self.

## Why

- The server keeps a seat for 20 s after a connection drops without a
  goodbye (`allowReconnection`, `WorldRoom.onLeave`), so a wifi blip can
  come back. The player stays in the state meanwhile, `status = "away"`,
  drawn at 0.55 alpha.
- A reload or a closed tab never says goodbye: the clean leave
  (`room.leave(true)` in `WorldController.stop()`) runs only on a React
  unmount. The socket just closes, which is the same as a drop.
- A fresh join doesn't take over a seat still waiting: `onJoin` only puts
  out other *connected* clients of the same person, and the waiting one isn't
  connected.

Seen live (2026-10-23, Ana and Bia): after Bia's reload both saw
`Bia:kaie:away` beside `Bia:UmG5:online` for ~16 s; after Bia closed the
tab, Ana saw her faded for ~20 s.

## Decided (2026-10-23)

| Topic | Decision |
|---|---|
| Closing, reloading, going away | Gone at once for everyone |
| Coming back | Where you were: the same floor, spot and facing — after a reload, the next day, a server restart (changed 2026-10-23 from "within a minute") |
| A real drop (network) | As now: faded for up to 20 s while the seat waits |

## Steps

1. **A goodbye on the way out (client).** On `pagehide` the controller
   closes the room's socket as a consented leave (close code 4000, what
   `leave(true)` ends in, but sent at once — no round trip on the way out)
   and drops the voice line. A page brought back from the back/forward cache
   (`pageshow` with `persisted`) reloads.
2. **A new join takes over (server).** The seat waiting in `onLeave` is kept
   by user (`waiting: Map<uid, Deferred>`); `onJoin` for the same person
   rejects it, so the old player is removed at once (its features' `leave`
   run, the LiveKit identity kept — the new session's the same person).
   For a crashed browser, or a phone that killed the tab without `pagehide`.
3. **Back where you were (server).** On leaving (or being taken over) the
   server remembers where the person was — floor, x, y, facing — for a
   minute (`lastSpot` by user). A join within that minute arrives there
   instead of the arrival point: on the nearest open tile if it's taken now;
   not if they were riding or driving (the car's left where it stopped: they
   arrive beside it). Older than a minute, or a new world: the arrival point
   as now.
4. **Checks.**
   - world-server: a join of the same person while their seat waits removes
     the old player at once; a consented leave removes at once; a drop keeps
     the seat 20 s and a reconnect takes it; a join within a minute arrives
     where they left, after that at the arrival point; a taken spot → the
     nearest open.
   - e2e (two browsers): Bia reloads — one Bia for both, not faded, where
     she was; Bia closes the tab — gone for Ana in under a second, in iso and
     in 3D; Bia's network cut (`context.setOffline`) — faded, then back.

## Delivered (2026-10-23)

- **The goodbye** (`WorldController.onPage`). On `pagehide` the controller
  stops and says goodbye twice, as neither always gets out before the page is
  gone (seen in e2e: the socket's close lost one time in three after a reload,
  the beacon lost more often on Playwright's `page.close`):
  - a beacon to the world-server's `POST /bye` with the session's
    reconnection token (`WorldRoom.bye`): the line still open is cut at once
    (marked `bye`, so its leave isn't taken for a drop — a server-side close
    would wait for the dead page's answer), or a dropped line's kept seat is
    given up;
  - the socket's own close, code 4000 (consented).

  The room drops the LiveKit identity as they go. On `pageshow` from the
  back/forward cache, a reload.
- **The takeover.** `WorldRoom.waiting` (by user): the seat kept in
  `onLeave` is rejected by a new join of the same person, after the new
  player is in the state and its features have joined — the old one's
  `leave` hooks then see the new one, as with a second tab (survival keeps
  the vitals, the phone and the pets stay with the new session).
- **Back where you were, always.**
  - The API keeps it: `last_spots` (one row a person: x, y, level, facing;
    building coords, out on the Grounds too), `GET /internal/last-spot/{id}`,
    `PUT /internal/last-spots` (a batch). The world-server saves each person
    as they leave and everyone a minute apart (`saveSpots`: a server stopped
    without goodbyes loses no more than that).
  - `WorldRoom.lastSpot` (static: the last one out closes the room, and they
    come back to a new one) keeps the newest till they're back — fresher than
    the API's for a quick return.
  - `comeBack`: the person's other player still in the room (kept, or a tab
    being put out), else the kept spot, else the API's; the floor, the spot
    (the nearest open tile if it's taken) and the facing. Out on the land as
    it is (all one place); inside, checked as an own arrival point is
    (`arrivalProblem`): the floor gone, walled in by changed walls, a room shut
    to them now → the arrival point.
  - The arrival point (the world's, or your own) is for the first time in,
    or when the spot won't do; "Go to the arrival point" still goes there.
    `WorldRoom.comeBack = false` turns it off (the arrival-point tests).
- **Checks.**
  - api: last spots kept, out on the land too, a batch, unknown people
    skipped, bounds (WorldTest).
  - world-server (world.test, rooms.test): a reload's kept seat goes at once
    and they're where they were; a goodbye goes at once and they're back where
    they were; a drop keeps the seat and a reconnection takes it; the last one
    out comes back where they were to a new room; the beacon cuts an open line
    or gives up a kept seat; back in a booth while it's free, at the arrival
    point while someone's talking in it.
  - e2e `ghost.spec.ts`: Bia walks off, reloads — one Bia for both, online,
    where she was, the old one gone from Ana's 3D and iso views; Bia's tab
    leaves (to another page) — gone for Ana in ~1.5–3 s. `helpers.enter`
    sends everyone to the arrival point after entering, as the specs were
    written.
  - Live (2026-10-23): Ana walked off, left; the room closed and opened again
    — back there; the world-server restarted — back there (from the API).
- **Found on the way:** a spot saved in one world is walled in in another
  (e2e swaps the demo world and the lab): Ana came back sealed in and every
  teleport was refused ("the door is locked") — hence the arrival-point check.
- **Known:**
  - A page killed without its pagehide (a crash; Playwright's
    `context.close()`) still leaves a faded body for up to 20 s for the
    others — until the person comes back, which takes it over at once.
  - The page is 50 bytes over its 556 KB budget.
