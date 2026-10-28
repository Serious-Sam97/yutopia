import { createRequire } from "node:module";

// (Playwright from the client: the same browsers the e2e suite uses)
const require = createRequire(new URL("../../apps/client/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const b = await chromium.launch();
for (const engine of ["jolt"])
  for (const [test, scene, ccd] of [
    ["chars", "area", ""],
    ["dynamics", "area", "1"],
    ["dynamics", "full", "1"],
    ["queries", "area", ""],
  ]) {
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    await page.goto(`http://localhost:8399/index2.html?engine=${engine}&test=${test}&scene=${scene}&ccd=${ccd}`);
    await page.waitForFunction(() => !!window.__result, null, { timeout: 300_000 });
    const r = await page.evaluate(() => window.__result);
    console.log(JSON.stringify({ browser: "chromium", engine, test, scene, ...r }));
    await ctx.close();
  }
await b.close();
