// Plan 130 phase 0: each shot of house-build.html as a still → ../<n>-<shot>.png, and the sheet (../sheet.jpg).
//   node render.mjs [shot …]   (default: all)
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

const require = createRequire(new URL("../../../apps/client/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const here = new URL(".", import.meta.url).pathname;
const ALL = ["lot", "foundation", "basement", "walls", "floors", "stairs", "roof", "openings", "coverings", "pool", "blueprint"];
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const types = { ".html": "text/html", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png" };
const srv = createServer((q, r) => {
  const root = join(here, "..");
  const f = join(root, decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (!f.startsWith(root) || !existsSync(f)) return r.writeHead(404).end();
  r.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
for (const n of names) {
  await page.goto(`http://localhost:${port}/mock/house-build.html?s=${n}`);
  await page.waitForSelector("#mocktag");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const i = ALL.indexOf(n) + 1;
  await page.screenshot({ path: `${here}../${String(i).padStart(2, "0")}-${n}.png` });
  console.log("rendered", n);
}
// the sheet: every still, three across
if (names.length === ALL.length) {
  const tiles = ALL.map((n, i) => `<img src="../${String(i + 1).padStart(2, "0")}-${n}.png">`).join("");
  await page.setViewportSize({ width: 2160, height: 1080 });
  await page.setContent(`<html><head><style>img{width:720px;height:450px;display:block}</style></head><body style="margin:0;background:#0d1a2a;display:grid;grid-template-columns:repeat(3,720px);gap:0">${tiles.replaceAll('src="../', `src="http://localhost:${port}/`)}</body></html>`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${here}../sheet.jpg`, fullPage: true, type: "jpeg", quality: 82 });
}
await browser.close();
srv.close();
