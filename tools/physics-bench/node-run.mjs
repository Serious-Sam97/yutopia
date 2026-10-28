// node node-run.mjs jolt <scene: area | full> <players> <seconds> <chunk: 32 | 0>
import { readFileSync } from "node:fs";
import { run } from "./bench.mjs";
import { joltEngine } from "./jolt.mjs";

const [, sceneName = "area", players = "50", seconds = "60", chunk = "0"] = process.argv.slice(2);
const scene = JSON.parse(readFileSync(new URL(`./${sceneName}.json`, import.meta.url)));
const e = joltEngine(); // (Rapier was measured alongside it: RESULTS.md)
const before = process.memoryUsage().rss;
const out = await run(e, scene, { players: +players, seconds: +seconds, chunk: +chunk });
out.rssMB = Math.round((process.memoryUsage().rss - before) / 1048576);
console.log(JSON.stringify(out));
