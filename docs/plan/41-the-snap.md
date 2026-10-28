# The snap — put back only for real (decided 2026-10-24; delivered 2026-10-24)

> **Retired 2026-10-28 — no put-backs at all.** The user, playing after plan 50: too fast (with
> the fast power too), a car going fast, some places, flying high — the game kept putting them
> back: *"remove all those teleportings … I don't want that now."* The server now takes every
> move as sent: no pace, way, height or floor check (`WorldRoom` `pos`), no car plausibility
> check (`features/cars.ts`: a state only let go if it isn't numbers — shared `finiteState`), no
> moving people who stand where the grid thinks they don't fit after an edit or a car stopping
> (`rescue()`: only for a floor that's gone — the grid called a tree's whole tile solid, so cars
> stopping anywhere put people by trees elsewhere). Kept: an admin's freeze, and a server
> placement (a teleport, out of a car) not undone by moves already on their way (the second
> after it). Private spaces (a booth in use, a locked room) stop you at their edge in your own
> browser and knock (`input/walker.ts` `shutBy`), instead of the server putting you back.
> Flying goes to 180 m (was 60). Walls, fences and doors still hold — in the browser, on Jolt.

The user, playing: "now and then a lag that isn't the fps: it takes me back to a point
behind, as if my ping were huge" — walking and driving, on the dev stack and in prod.

## What it was

- **The server judged a move by when it arrived.** Each `pos` message grows the body's
  allowance (shared `Allowance`, docs/plan/29-the-move.md M7) by the time since the last
  one *reached the server*, up to 1.2 tiles banked. A hiccup — Wi-Fi, the Cloudflare tunnel,
  the server itself busy or stopped — holds messages back and hands them over at once:
  between them, by arrival, no time passed. Past 1.2 tiles of backlog (~290 ms jogging,
  ~180 ms sprinting) the next was refused and the body put back; every message already on
  its way was refused too, each with its own snap.
- Measured (Bia jogging, her messages held N ms then sent at once, 3 runs each):

| Hiccup | Snaps before | Snaps after |
|---|---|---|
| 150 ms | 0 | 0 |
| 300 ms | 1 | 0 |
| 500 ms | 3–5 | 0 |
| 1 s | 13 | 0 |
| 2 s | 29–31 | 0 |

- **On the dev stack, worse**: `next dev` (the client's container) grows ~120–175 MB with
  every recompile and is killed for memory at ~3.2 GB — five times on 2026-10-23/24, 101
  restarts. The kill is the whole Docker VM out of memory (8 GB): every container stops
  for seconds, the world-server too (a 12 s tick, 265 car messages refused at once).
- **In prod** (2026-10-24, the server's Claude): a 596 ms tick in 9 h of light play, swap
  100 % used on the host, the tunnel steady. Prod didn't log when or why.

## What changed

1. **A move counts the client's clock** (`SentClock`, shared/move/allow.ts): every `pos`
   already carried `mt`, the page's `performance.now()` when it was sent (no wall clock,
   no time zone: only the difference between two counts). The allowance grows by that
   difference. The client's clock may not get ahead of the server's by more than 250 ms in
   all (a sped-up clock gains no more), and what it's owed for held-back messages is kept to
   3 s (a longer hold: what's over is let go). An old client without `mt`: arrival time, as
   before.
2. **One snap is one**: after a snap (any: a refused move, a teleport), what the client
   sent before it could have landed — for a second — is let go quietly, not taken and not
   snapped again (`SNAP_QUIET_MS`, WorldRoom.ts).
3. **Stalls logged** (metrics.ts): a timer every 100 ms; late by more than 250 ms, a line
   `[stall] N ms, ending <time> — our longest work: <tick (feature N ms) | message type |
   patch | hearing>; CPU X ms of Y (busy | not running); GC Z ms; page reads from disk K`.
   Busy: our code or the GC. Not running: the host stopped the process (CPU, swap — the
   disk reads say swap). `/metrics`: `yutopia_stalls`, `yutopia_stall_ms_max`. Each
   feature's tick is timed so a slow tick says whose.

Not changed: the car's check (`car:state`, shared car/net.ts `implausible`) gives each
message at least ~3 m and only breaks on gaps over 1.5 s — prod's worst seen was 0.6 s.

## Checked

- `snap.test.ts` (world-server): a second of jogging handed over at once — no snap; 12
  tiles / s — snapped; a clock run at 2× to hide it — snapped; one snap then 8 stale
  messages — one snap, and a new one a second later; in the second after a teleport a leap
  is let go, not taken.
- `sent-clock.test.ts` (shared): steady, hiccups of 0.3–2.5 s, the old way refusing the
  same hiccup, a fast clock bounded to 250 ms, a 10 s hold bounded to 3 s, no stamp,
  uint32 wrap.
- `metrics.test.ts`: a busy stall logged busy with the work's name; a process stopped from
  outside (SIGSTOP) logged as not running.
- The Bia hiccup runs above, against the dev server.
