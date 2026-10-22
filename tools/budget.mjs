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
const BUDGETS = { "/page": 555, "/login/page": 160 }; // KB gzip
const dist = new URL(`../apps/client/${process.env.NEXT_DIST_DIR ?? ".next-prod"}/`, import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(`${dist}app-build-manifest.json`, "utf8"));
let failed = false;
for (const [page, budget] of Object.entries(BUDGETS)) {
  const files = (manifest.pages[page] ?? []).filter((f) => f.endsWith(".js"));
  const kb = files.reduce((n, f) => n + gzipSync(readFileSync(dist + f)).length, 0) / 1024;
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
  "yutopia-chars": 40, // the 3D people: the model builder, motion, iso sprites (docs/plan/22-people-3d.md)
  "yutopia-input": 15, // the keys by position, the pad, my body's movement core (docs/plan/29-the-move.md)
  "yutopia-jumps": 10, // a jump's dust and sounds (shared/jump.ts)
  "yutopia-dark": 80, // the dark: vitals, pockets, loot on the client (docs/plan/30-the-dark.md)
  // the land round the building, generated (shared/grounds.ts, docs/plan/27): the bundler copies it into every
  // chunk that uses it — its own, the 3D view's, the dev mock pages' (~6 KB each), and the marker counts those
  // whole chunks (the 3D view's ~46 KB); raised from 120 on 2026-10-20 with phases 2–6 (the town, the night, life)
  "yutopia-grounds": 180,
  // the lot's cars, driven (docs/plan/28-the-car.md): the sim, the models and their cabins, the sound, the fx
  "yutopia-car": 120,
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
