// The decoders three's loaders fetch at run time (plan 73 phase 1: the life look's KTX2 textures), copied
// from three's own package into apps/client/public/decoders (served as static files, not in git):
// basis/ — the Basis Universal transcoder KTX2Loader runs in its workers. (Meshopt's decoder is bundled:
// three/addons/libs/meshopt_decoder.module.js, imported in a lazy chunk.)
//   node tools/decoders.mjs            copy what's missing or changed
//   node tools/decoders.mjs --check    fail if something is missing
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const three = join(root, "apps/client/node_modules/three/examples/jsm/libs");
const out = join(root, "apps/client/public/decoders");
const FILES = [["basis/basis_transcoder.js"], ["basis/basis_transcoder.wasm"]];

let missing = 0;
for (const [rel] of FILES) {
  const from = join(three, rel);
  const to = join(out, rel);
  const same = existsSync(to) && readFileSync(to).equals(readFileSync(from));
  if (process.argv.includes("--check")) {
    if (!same) {
      console.error(`decoders: ${rel} missing or stale (node tools/decoders.mjs)`);
      missing++;
    }
    continue;
  }
  if (same) continue;
  mkdirSync(join(to, ".."), { recursive: true });
  copyFileSync(from, to);
  console.log(`decoders: ${rel}`);
}
if (missing) process.exit(1);
