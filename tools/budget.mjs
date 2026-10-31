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
const BUDGETS = { "/page": 430, "/login/page": 160 }; // KB gzip
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
  "yutopia-chars": 58, // (raised from 40 on 2026-10-22 by the user's call: 39.1, the next detail on people would tip it; to 50 on 2026-10-31 by the user's call: the character pass — docs/plan/59 — 48.8; to 58 the same day by the user's call: the wardrobe — docs/plan/60 — 55.8) // the 3D people: the model builder, motion, iso sprites (docs/plan/22-people-3d.md)
  "yutopia-input": 15, // the keys by position, the pad, my body's movement core (docs/plan/29-the-move.md)
  "yutopia-anim": 15, // plan 58's animations, loaded with the 3D people when asked for (docs/plan/58-the-animation.md)
  "yutopia-air": 15, // plan 58 phase 5's: over things with the hands placed, Flowmotion's grips, the ragdoll and the get-ups (loaded with the hero's)
  "yutopia-acts": 15, // plan 58 phase 6's: sitting, the hands and the phone, busy, together, the emotes (loaded with the hero's)
  "yutopia-night": 15, // plan 58 phase 7's: the torch, the gun's life, hits, the crawl and the kneel, the fear (loaded with the hero's)
  "yutopia-life": 15, // plan 58 phase 9's: the cold, the breath caught, who she is, a sound's turn (loaded with the hero's)
  "yutopia-jumps": 10, // a jump's dust and sounds (shared/jump.ts)
  "yutopia-dark": 80, // the dark: vitals, pockets, loot on the client (docs/plan/30-the-dark.md)
  // the land round the building, generated (shared/grounds.ts, docs/plan/27): the bundler copies it into every
  // chunk that uses it — its own, the 3D view's, the dev mock pages' (~6 KB each), and the marker counts those
  // whole chunks (the 3D view's ~46 KB); raised from 120 on 2026-10-20 with phases 2–6 (the town, the night, life)
  "yutopia-grounds": 187, // (raised from 180 on 2026-10-24 by the user's call: the lag's culling — docs/plan/38 — put it at 183.1; to 187 the same day, the user's call: the lot's 3D dressing — docs/plan/42 — put it at 186.3)
  // the lot's cars, driven (docs/plan/28-the-car.md): the sim, the models and their cabins, the sound, the fx
  "yutopia-car": 120,
  // the Kart Park in 3D (docs/plan/46-the-karts.md), loaded once the Grounds get to it: one ~16 KB file a
  // browser loads; the build makes a copy for each group that reaches it (the game, /dev/karts, /dev/kart),
  // and this counts them all, as the Grounds' own line does
  "yutopia-karts": 60,
  // the karts in play (docs/plan/46-the-karts.md, phases 2–6): your kart, the HUD and lobby, everyone's karts, what flies
  "yutopia-kart-play": 40,
  // god mode (docs/plan/53-the-god-mode.md): an admin's editor of the open world, its tools and strings
  "yutopia-god": 20,
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
