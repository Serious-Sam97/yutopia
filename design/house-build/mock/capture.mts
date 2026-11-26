/* biome-ignore-all lint/suspicious/noExplicitAny: a mock's capture (plan 130 phase 0) */
// Plan 130 phase 0: the mock house's shots — the game's own scene as Bia (dev world, Metal, 13:00), house.js's pieces
// drawn into it — to bg/<shot>.jpg, the anchors (each named point's place on the picture) to anchors.json, the
// materials drawn for it to tex/<name>.jpg.   (from apps/client) npx tsx ../../design/house-build/mock/capture.mts [shot…]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { goTo, hold, open } from "./lib.mts";
const HERE = new URL(".", import.meta.url).pathname;
mkdirSync(`${HERE}bg`, { recursive: true });
mkdirSync(`${HERE}tex`, { recursive: true });
const only = process.argv.slice(2);
const { browser, page } = await open();
// Bia by the path, off the lot (build mode leaves the body where it stood)
await goTo(page, 130 - 9.5, -40 - 17);
await hold(page);
await page.addScriptTag({ content: readFileSync(`${HERE}house.js`, "utf8") });
const names: string[] = await page.evaluate(() => (window as any).HOUSE.shots);
const anchorsFile = `${HERE}anchors.json`;
const anchors = existsSync(anchorsFile) ? JSON.parse(readFileSync(anchorsFile, "utf8")) : {};
for (const n of names) {
  if (only.length && !only.includes(n)) continue;
  await hold(page);
  const r = await page.evaluate((s: string) => (window as any).HOUSE.run(s), n);
  writeFileSync(`${HERE}bg/${n}.jpg`, Buffer.from(r.url.split(",")[1], "base64"));
  anchors[n] = r.anchors;
  console.log("shot", n, JSON.stringify(r.anchors));
}
writeFileSync(anchorsFile, JSON.stringify(anchors, null, 1));
const tex = await page.evaluate(() => Object.fromEntries(Object.entries((window as any).HOUSE.TEX).map(([k, v]: any) => [k, v.url])));
for (const [k, u] of Object.entries(tex)) writeFileSync(`${HERE}tex/${k}.jpg`, Buffer.from((u as string).split(",")[1], "base64"));
await browser.close();
