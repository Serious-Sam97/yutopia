// Each screen of build-tool.html as a still: node render.mjs [names…] (default: every still) → ../NN-name.png.
// The reel: REEL=1 node render.mjs (its frames into reel/), then
//   ffmpeg -framerate 12 -i reel/reel-%02d.png -vf "tpad=stop_mode=clone:stop_duration=1.8,format=yuv420p" -c:v libx264 -crf 20 ../reel-draw-a-room.mp4
// (the frames aren't kept: 35 MB, made again from the shots)
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../apps/client/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const here = new URL(".", import.meta.url).pathname;
// (the screens: the shots that are stills, and the sheet; the reel's frames with REEL=1)
const all = JSON.parse(readFileSync(`${here}shots.json`, "utf8")).map((s) => s.name);
const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : process.env.REEL
    ? all.filter((n) => n.startsWith("reel-"))
    : [...all.filter((n) => /^(0\d|1[01])-/.test(n)), "12-decisions"];
mkdirSync(`${here}reel`, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const n of names) {
  const reel = n.startsWith("reel-");
  await page.goto(`file://${here}build-tool.html?s=${reel ? `reel&f=${n.slice(5)}` : n}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: reel ? `${here}reel/${n}.png` : `${here}../${n}.png` });
  console.log("rendered", n);
}
await browser.close();
