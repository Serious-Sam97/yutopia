// UI redo mocks: each look × screen of ui-life.html as a still → ../<look>-<screen>.png
//   node render.mjs [look-screen …]   (default: all)
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../apps/client/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const here = new URL(".", import.meta.url).pathname;
const all = ["a", "b", "c"].flatMap((l) => ["play", "act", "night", "wheel"].map((s) => `${l}-${s}`));
const names = process.argv.slice(2).length ? process.argv.slice(2) : all;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
for (const n of names) {
  const [look, s] = n.split("-");
  await page.goto(`file://${here}ui-life.html?look=${look}&s=${s}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${here}../${n}.png` });
  console.log("rendered", n);
}
await browser.close();
