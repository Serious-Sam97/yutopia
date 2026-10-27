// The kart's sounds (docs/plan/46-the-karts.md), rendered offline at /dev/kart-sound and saved as
// WAVs to listen to (the dev client on :3100).
//   node --experimental-strip-types e2e/kart-sounds.mts [out dir] [scene …]
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? ".";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text()));
page.on("pageerror", (e) => console.log("  error:", e.message));
await page.goto(`${base}/dev/kart-sound`);
await page.waitForFunction(() => !!(window as unknown as { __kartSound?: unknown }).__kartSound, null, {
  timeout: 120_000,
});
type Board = { scenes: string[]; render(n: string): Promise<string> };
const scenes = process.argv.slice(3);
for (const n of scenes.length
  ? scenes
  : await page.evaluate(() => (window as unknown as { __kartSound: Board }).__kartSound.scenes)) {
  const t0 = Date.now();
  const b64 = await page.evaluate((n) => (window as unknown as { __kartSound: Board }).__kartSound.render(n), n);
  const file = `${out}/kart-${n}.wav`;
  writeFileSync(file, Buffer.from(b64, "base64"));
  console.log(`${n}: ${file} (${Date.now() - t0} ms)`);
}
await browser.close();
