// node bake.mjs: the case's materials as PNGs (plan 125 phase 5)
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../apps/client/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const here = new URL(".", import.meta.url).pathname;
const out = new URL("../../../apps/client/public/lamp/case/", import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${here}bake-textures.html`);
await page.waitForTimeout(400);
for (const k of ["leather", "foam", "felt", "card", "brushed"]) {
  await page.locator(`#${k}`).screenshot({ path: `${out}${k}.png`, omitBackground: true });
  console.log("baked", k);
}
await browser.close();
