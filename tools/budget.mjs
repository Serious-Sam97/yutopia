// Bundle budget: gzip size of the JS the world page (/s/[spaceId]) loads, from
// the production build's manifest. Run after:
//   NEXT_DIST_DIR=.next-prod pnpm --filter @yutopia/client build
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// (the world page was 524.5 before pets, 2026-10-15; pets add ~3 KB of page code, the rest is lazy)
// (raised to 545 on 2026-10-18 by the user's call: HEAD was 539.8 and jumping needs ~1.3 KB on the page)
const BUDGETS = { "/s/[spaceId]/page": 545, "/page": 260, "/login/page": 160 }; // KB gzip
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
  "yutopia-item-art": 40,
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
  "yutopia-jumps": 10, // a jump's dust and sounds (shared/jump.ts)
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
