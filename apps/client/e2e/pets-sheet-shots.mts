// docs/plan/52-the-pet-two.md (phases 2–3): the pets sheet's plan-52 sections (/dev/pets: the 12 dogs,
// the gaits, the moods, the new poses) saved as PNGs (the dev client on :3100, the machine's GPU).
//   node --experimental-strip-types e2e/pets-sheet-shots.mts [out dir]
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/pet2";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("  error:", e.message));
await page.goto(`${base}/dev/pets`);
await page.waitForSelector("[data-shot=breeds] canvas");
await page.waitForTimeout(6000); // (the pets chunk in, every turntable drawn)
for (const [shot, file] of [
  ["breeds", "breeds-new"],
  ["gaits", "gaits"],
  ["moods", "moods"],
  ["poses", "poses-new"],
] as const) {
  await page.locator(`[data-shot=${shot}]`).screenshot({ path: `${out}/${file}.png` });
  console.log(`${shot}: ${out}/${file}.png`);
}
await browser.close();
