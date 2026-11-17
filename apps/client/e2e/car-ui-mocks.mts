// (plan 94 phase 0) design/car-ui/mocks.html's three looks to PNGs (a-walnut, b-vfd, c-minimal).
//   node --experimental-strip-types e2e/car-ui-mocks.mts
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
const dir = resolve("../../design/car-ui");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const [v, name] of [["a", "a-walnut"], ["b", "b-vfd"], ["c", "c-minimal"]]) {
  await page.goto(`file://${dir}/mocks.html?v=${v}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/${name}.png` });
  console.log("wrote", name);
}
await browser.close();
