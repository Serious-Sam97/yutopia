// Vortex must look exactly like he does in Yondra: we use Yondra's own drawing
// (yondra-frontend/src/lib/vortexArt.ts), copied verbatim with a header.
//   node tools/sync-vortex-art.mjs          copy it over
//   node tools/sync-vortex-art.mjs --check  fail if the copy drifted
import { readFileSync, writeFileSync } from "node:fs";

const src = new URL("../../yondra-frontend/src/lib/vortexArt.ts", import.meta.url);
const dst = new URL("../apps/client/src/world/art/vortex/vortexArt.ts", import.meta.url);
const HEADER =
  "// GENERATED — copied verbatim from yondra-frontend/src/lib/vortexArt.ts by\n// tools/sync-vortex-art.mjs. Don't edit here: change Yondra's file and re-sync.\n// (excluded from Biome in biome.json)\n";
const wanted = HEADER + readFileSync(src, "utf8");
if (process.argv.includes("--check")) {
  const have = readFileSync(dst, "utf8");
  if (have !== wanted) {
    console.error("[vortex-art] out of sync with Yondra — run: node tools/sync-vortex-art.mjs");
    process.exit(1);
  }
  console.log("[vortex-art] in sync with Yondra");
} else {
  writeFileSync(dst, wanted);
  console.log("[vortex-art] copied from Yondra");
}
