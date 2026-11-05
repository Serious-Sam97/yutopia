// The anchors capture.spec.ts wrote for each shot, as one script the mock page loads (file:// can't fetch).
// node anchors.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("./bg/", import.meta.url).pathname;
const out = {};
for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")))
  out[f.slice(0, -5)] = JSON.parse(readFileSync(dir + f, "utf8"));
writeFileSync(`${dir}anchors.js`, `window.ANCHORS = ${JSON.stringify(out)};\n`);
// (and what each reel frame shows: its wall and length, or how far the room's been found)
const shots = JSON.parse(readFileSync(new URL("./shots.json", import.meta.url), "utf8"));
const reel = Object.fromEntries(shots.filter((q) => q.reel).map((q) => [q.name, q.reel]));
writeFileSync(`${dir}reel.js`, `window.REEL = ${JSON.stringify(reel)};\n`);
