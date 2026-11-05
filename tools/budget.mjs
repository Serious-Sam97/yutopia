// Bundle budget: gzip size of the JS the world page (/, the one world) loads, from
// the production build's manifest. Run after:
//   NEXT_DIST_DIR=.next-prod pnpm --filter @yutopia/client build
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// (the world page was 524.5 before pets, 2026-10-15; pets add ~3 KB of page code, the rest is lazy)
// (raised to 545 on 2026-10-18 by the user's call: HEAD was 539.8 and jumping needs ~1.3 KB on the page)
// (the world moved from /s/[spaceId] to / on 2026-10-18, one world; the lobby that was / is gone)
// (raised to 550 on 2026-10-19 by the user's call: floors without a hitch — docs/plan/26 — keep every floor ready)
// (raised to 552 on 2026-10-20 by the user's call: the Grounds — docs/plan/27 — the grid's land, A*'s box, the engine's land hooks)
// (raised to 553 on 2026-10-20 by the user's call: the Grounds' phases 2–6 — the night, the weather, the shuttle — their page hooks)
// (raised to 554 on 2026-10-20 by the user's call: the car's page hooks — the controller's, the grid's turned cars)
// (raised to 555 on 2026-10-21 by the user's call: the HQ armed, the lobby's locker, the earbud, the flashlight)
// (raised to 556 on 2026-10-23 by the user's call: the loading screen — docs/plan/35 — the controller's readiness and the screen)
// (raised to 557 on 2026-10-23 by the user's call: no ghosts — docs/plan/36 — the page's goodbye, a beacon and the socket's close)
// (raised to 558.5 on 2026-10-24 by the user's call: the lot — docs/plan/42 — the floor paints its bays from the shared layout)
// (raised to 559 on 2026-10-24 by the user's call: the spot — docs/plan/43 — my bay, the keys on someone's card)
// (raised to 559.5 on 2026-10-25 by the user's call: the night — docs/plan/44 — the dark curve, the light map's open sky, the engine's dark)
// (raised to 560.5 on 2026-10-26 by the user's call: the UI — docs/plan/45 — the top bar's me menu, the dock's named keys, the place card)
// (raised to 561 on 2026-10-26 by the user's call: the Kart Park's land — docs/plan/46 — the Grounds' chunks split anew, their file lists on the page)
// (lowered to 415 on 2026-10-28: iso retired — docs/plan/50, phase 7 — Pixi and the iso engine off the page, 414.3)
// (raised to 419 on 2026-10-29 by the user's call: the controls — docs/plan/56 — the focus's prompt, Use held, the mouse as the camera; HEAD was already 416.2 after pets and god mode)
// (raised to 421 on 2026-10-29 by the user's call: the controls — docs/plan/56, phase 5 — the lock-on and its chip, the camera's settings)
// (raised to 430 on 2026-10-30 by the user's call: the world switched to plan 58's animations — the page
// was 420.2 of 421 with it)
// (raised to 434 on 2026-11-03, free to (2026-11-01): plan 68 phase 1 — live parts in the world, the
// 5×7 face, the signs' boards drawn live, the marquee/ticker/split-flap — 429.5 → 431.0)
// (raised to 438 on 2026-11-03, free to: plan 68 phase 2 into the world — the wrap picker, the
// Christmas words and actions, presents and cocoa in the controller, the gift icon — 432.0 → 433.3)
// (raised to 446 on 2026-11-03, free to: plan 68 phases 3–25 — ~150 kinds' catalog entries, shapes and
//  seats (shared fam/, on the page as every kind's are), the Furnish panel's lists, the games' and the
//  kitchen's strings; 443.5, the models, games and panels lazy)
// (raised to 456 on 2026-11-05, the user's standing call on budgets: plan 72 phases 6–7 — the one world frame, the
// structure's ops and Place, the floor's questions on Jolt, in place of the tile grid and its A*: 452.5 → 455.7)
// (raised to 457 on 2026-11-05, the user's standing call on budgets: plan 72 phase 8 — an edit spread over frames,
// the lifts' cars as bodies in Jolt each frame and the shafts' floors: 455.7 → 456.6)
const BUDGETS = { "/page": 457, "/login/page": 160 }; // KB gzip
// (/page raised from 451 on 2026-11-04 under the same call: plan 72's phase 4 — the controller split
// into 17 feature modules (world/ctl), the same code: what the minifier can't shorten — `this.c.x`,
// `this.<feature>.x`, the forwarders for what's read from outside — 449.7 → 451.2; the lazy chunks
// unchanged)
// (/page raised from 446 on 2026-11-04 under the user's standing call to raise as needed: plan 72's phase 1 —
// the HUD's parts each in its own error boundary (Guard), the page's errors reported (lib/crash.ts),
// the error screen app/error.tsx that loads with the root — 445.5 → 449.7)
const dist = new URL(`../apps/client/${process.env.NEXT_DIST_DIR ?? ".next-prod"}/`, import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(`${dist}app-build-manifest.json`, "utf8"));
let failed = false;
for (const [page, budget] of Object.entries(BUDGETS)) {
  const files = (manifest.pages[page] ?? []).filter((f) => f.endsWith(".js"));
  const kb = files.reduce((n, f) => n + gzipSync(readFileSync(dist + f)).length, 0) / 1024;
  // (Jolt loads with the 3D view's chunk, never a page: docs/plan/50, guardrail 5)
  const jolt = files.filter((f) => readFileSync(dist + f, "utf8").includes("JoltInterface"));
  if (jolt.length) console.log(`[budget] OVER ${page.padEnd(22)} carries Jolt: ${jolt.join(", ")}`);
  failed ||= jolt.length > 0;
  const ok = kb <= budget;
  failed ||= !ok;
  console.log(
    `[budget] ${ok ? "ok  " : "OVER"} ${page.padEnd(22)} ${kb.toFixed(1)} KB gzip (budget ${budget} KB, ${files.length} files)`,
  );
}
// Lazy chunks (not in the page's files): found by a marker string in their code.
const LAZY = {
  "yutopia-item-art": 45, // (raised from 40 on 2026-10-22 by the user's call: it sat at 40.0, the next item would tip it)
  "yutopia-themes": 30,
  "yutopia-build": 40,
  "yutopia-people": 40,
  "yutopia-pets": 40, // the drawings, animation, sounds and strings; the panel carries a copy
  "yutopia-slots": 20,
  "yutopia-tables": 40,
  "yutopia-games": 60,
  "yutopia-media": 30, // TVs and the radio's media; hls.js is its own chunk, fetched for Jellyfin only
  "yutopia-os": 15, // VortexOS on the computers' glass (docs/plan/19-vortexos.md)
  "yutopia-phone": 60, // the phone: Vortex Mobile's screens, calls, camera, sounds (docs/plan/21-cellphone.md)
  "yutopia-chars": 58.5, // (raised from 58 on 2026-11-02 under the user's standing call to raise as needed: plan 66's swim — the hook that loads its own chunk, yutopia-swim — tipped it over 58.0) // (raised from 40 on 2026-10-22 by the user's call: 39.1, the next detail on people would tip it; to 50 on 2026-10-31 by the user's call: the character pass — docs/plan/59 — 48.8; to 58 the same day by the user's call: the wardrobe — docs/plan/60 — 55.8) // the 3D people: the model builder, motion, iso sprites (docs/plan/22-people-3d.md)
  "yutopia-input": 17.5, // (raised from 17 on 2026-11-05 under the user's standing call to raise as needed: plan 72 phase 8 — measured 17.1; the lifts' code isn't in it) // (raised from 15.5 on 2026-11-02 under the user's standing call to raise as needed: plan 66's swimming — shared move/swim.ts, the walker's breath and water — 15.0 → 16.5) // (raised from 15 on 2026-11-02 under the user's standing call to raise as needed: 14.99 → 15.04 with plan 65's phase 3 — none of the weather in it, the minifier's names moved with the shared modules) // the keys by position, the pad, my body's movement core (docs/plan/29-the-move.md)
  "yutopia-anim": 15, // plan 58's animations, loaded with the 3D people when asked for (docs/plan/58-the-animation.md)
  "yutopia-air": 15, // plan 58 phase 5's: over things with the hands placed, Flowmotion's grips, the ragdoll and the get-ups (loaded with the hero's)
  "yutopia-acts": 15, // plan 58 phase 6's: sitting, the hands and the phone, busy, together, the emotes (loaded with the hero's)
  "yutopia-night": 15, // plan 58 phase 7's: the torch, the gun's life, hits, the crawl and the kneel, the fear (loaded with the hero's)
  "yutopia-life": 15, // plan 58 phase 9's: the cold, the breath caught, who she is, a sound's turn (loaded with the hero's)
  "yutopia-swim": 15, // (added 2026-11-02) plan 66 phase 4's: the swim body — treading, the strokes, under, the dives, wading (loaded with the hero's)
  "yutopia-sway": 10, // plan 61's: what's worn swinging on Jolt — the bags, the hair, the scarf, the tie, the badge, earrings (loaded with the 3D view's physics)
  "yutopia-jumps": 10, // a jump's dust and sounds (shared/jump.ts)
  "yutopia-steps": 10, // the steps' player (docs/plan/63-the-steps.md): the recordings by surface, shoe and gait
  "yutopia-dark": 80, // the dark: vitals, pockets, loot on the client (docs/plan/30-the-dark.md)
  // the land round the building, generated (shared/grounds.ts, docs/plan/27): the bundler copies it into every
  // chunk that uses it — its own, the 3D view's, the dev mock pages' (~6 KB each), and the marker counts those
  // whole chunks (the 3D view's ~46 KB); raised from 120 on 2026-10-20 with phases 2–6 (the town, the night, life)
  "yutopia-grounds": 205, // (raised from 184 on 2026-11-05 under the user's standing call to raise as needed: plan 72 phase 9 — 171.2 → 202.9 with no code moved in: the bundler put light3d (whose patchGrounds key carries this marker's string) in with the people's art chunk, 47.9 KB, instead of a 17 KB one of its own; every chunk together the same 5,074 KB in 259 files, measured against the last commit's build in a worktree) // (raised from 181 on 2026-11-02 under the user's standing call to raise as needed: plan 66's phase 9 — the water's sound, water-sound.ts — 179.0 → 180.8) // (raised from 176 on 2026-11-02 under the user's standing call to raise as needed: plan 66's water — the surface's grids and shader, under the water, the reeds, rocks, weeds, the canoe afloat — 174.7 → 179.0) // (lowered from 210 on 2026-11-02 to 173.1: the cars' chunk is loaded through the game's view (tp/game-view.ts), a child of its chunks, not beside it from the page — its own copy of light3d, wx3d, the lot's 3D and three's merging (~17 KB) gone; wx3d is now one chunk the game's view and /dev/3p's share, light3d one copy a page (the game's view, /dev/3p's); every chunk together −20 KB, the page 424.9 → 424.6) // (raised from 187 on 2026-11-02 under the user's standing call to raise as needed: plan 65's phases 3–4 — the snow's layer, its tags, the green, the leaves, the canvases redone — put it at 191.1, from 176.1; to 210 the same day with phase 5 — the wet, the icicles, the floor's open tiles, a car's own snow, the footing by the weather — at 203.2: light3d.ts, and with it tp/wx3d.ts and three's BufferGeometryUtils, is copied into three of the 3D view's chunks, so the layer counts thrice — a split to fix) // (raised from 180 on 2026-10-24 by the user's call: the lag's culling — docs/plan/38 — put it at 183.1; to 187 the same day, the user's call: the lot's 3D dressing — docs/plan/42 — put it at 186.3)
  // the lot's cars, driven (docs/plan/28-the-car.md): the sim, the models and their cabins, the sound, the fx
  "yutopia-car": 120,
  // the Kart Park in 3D (docs/plan/46-the-karts.md), loaded once the Grounds get to it: one ~16 KB file a
  // browser loads; the build makes a copy for each group that reaches it (the game, /dev/karts, /dev/kart),
  // and this counts them all, as the Grounds' own line does
  "yutopia-karts": 60,
  // the karts in play (docs/plan/46-the-karts.md, phases 2–6): your kart, the HUD and lobby, everyone's karts, what flies
  "yutopia-kart-play": 40,
  // god mode (docs/plan/53-the-god-mode.md): an admin's editor of the open world, its tools and strings
  // (24 on 2026-11-04: plan 69 phase 10 — the Grow tool, its panel and the land map; 17.7 → 19.8)
  "yutopia-god": 24,
}; // KB gzip
const chunks = `${dist}static/chunks/`;
for (const [marker, budget] of Object.entries(LAZY)) {
  const files = readdirSync(chunks).filter(
    (f) => f.endsWith(".js") && readFileSync(chunks + f, "utf8").includes(marker),
  );
  const kb = files.reduce((n, f) => n + gzipSync(readFileSync(chunks + f)).length, 0) / 1024;
  const ok = files.length > 0 && kb <= budget;
  failed ||= !ok;
  console.log(
    `[budget] ${ok ? "ok  " : "OVER"} ${`lazy: ${marker}`.padEnd(22)} ${kb.toFixed(1)} KB gzip (budget ${budget} KB, ${files.length} files)`,
  );
}
if (failed) process.exit(1);
