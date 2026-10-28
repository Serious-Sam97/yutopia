// node node-round2.mjs jolt <behaviour | queries | dynamics | longrun> [area | full] [ccd]
import { readFileSync } from "node:fs";
import { joltEngine } from "./jolt.mjs";
import * as R2 from "./round2.mjs";

const [engine, test, sceneName = "area", ccd] = process.argv.slice(2);
if (ccd === "ccd") globalThis.CCD = true;
if (process.env.MINUTES) globalThis.MINUTES = process.env.MINUTES;
const e = joltEngine(); // (Rapier was measured alongside it: RESULTS.md)
const scene = test === "behaviour" ? null : JSON.parse(readFileSync(new URL(`./${sceneName}.json`, import.meta.url)));
// biome-ignore lint/performance/noDynamicNamespaceImportAccess: the test named on the command line
const out = await R2[test](e, scene);
console.log(JSON.stringify({ engine, test, scene: sceneName + (ccd ? "+ccd" : ""), ...out }));
