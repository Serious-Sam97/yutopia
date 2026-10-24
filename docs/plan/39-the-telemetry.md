# The telemetry — how the game runs for each player (plan — decided 2026-10-23; delivered 2026-10-23)

The lag work (`38-the-lag.md`) was measured on one Mac in Chromium, while the user and
friends play in Firefox, on other machines, at other hours and in other places. Every
round the lab numbers missed what friends felt. So the server now records each
player's real performance, and an admin page shows it.

## Decided (2026-10-23)

| Topic | Decision |
|---|---|
| Viewing | An admin-only web page, `/admin/perf` (Settings → "Performance" for admins) |
| Consent | Always on, no switch (a friends' world) |
| Data | Frame stats, where & how, machine & browser, network |
| Retention | 30 days, a daily cleanup |

## What a report holds (one row per player per ~30 s of play)

- **Frames**, exact over the window: fps (frames ÷ time), frame time median / p95 /
  worst, gap (frame spacing) p95 / worst, frames over 33 ms and over 50 ms, long
  tasks (count, worst), each stage's average ms (logic, iso.update, tp.update,
  tp.frame, iso.render, hud, dark), 3D draw calls (one sampled frame), things culled.
- **Where & how**: floor, area, x/y, view (iso / 3p / 1p), quality (resolved and the
  pref), max fps pref, game hour, people within 12 tiles, in a car, share of the
  window the tab was hidden.
- **Machine & browser**: browser + version, OS, the GPU's name (WebGL renderer),
  screen and canvas size, devicePixelRatio, cores, device memory.
- **Network**: ping to the world server (median / p95 of a ping every 5 s),
  reconnects; the server adds how often it snapped the player back.

## How it flows

1. **Client** — `world/telemetry.ts`, its own lazy chunk started after joining. It
   wraps the frame timer's `begin / lap / end` on its instance (the page's
   `world/perf.ts` is unchanged) to fill 0.5 ms histograms, works out percentiles every
   30 s and sends `perf:report`. A window with fewer than 10 frames or hidden over 95 %
   is skipped; the partial window goes on `pagehide`. It stops itself when the
   controller stops.
2. **World-server** — `features/perf.ts`: one report per 20 s per client, every field
   clamped (strings cut, unknown stages dropped), the user id and snap count added,
   queued (2,000 at most) and sent to the API every 60 s and when the room closes.
   `perf:ping` → `perf:pong`. `/metrics`: `perf_reports_total`,
   `perf_report_errors_total`.
3. **API** — `POST /api/internal/perf-reports` (signed), table `perf_reports`;
   admin endpoints `/api/admin/perf/summary`, `/player/{user}`, `/spots`
   (`?days=1|7|30`); `yutopia:prune-perf` daily drops rows over 30 days.
4. **Admin page** — `app/admin/perf/page.tsx`: players slowest first; a player's fps
   over time (hover for the window), their places, what a frame costs them, their
   machine; where it's slow for everyone. Members get "Only admins can see this page".

## Cost

- The world page: none in size (557.0 ≤ 557 KB; everything is in the lazy chunk or
  the admin route). Per frame: three wrapped calls and a few array increments.
- Network: one ~1 KB message per 30 s and a ping per 5 s per player; the API gets
  one batch a minute per room.
