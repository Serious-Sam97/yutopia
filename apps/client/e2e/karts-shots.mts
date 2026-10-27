// Phase 0 of docs/plan/46-the-karts.md: the plans and the stills from
// /dev/karts, saved as PNGs (the dev client on :3100, the machine's GPU).
//   node --experimental-strip-types e2e/karts-shots.mts [out dir] [shot …]
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/karts";
const shots = process.argv.slice(3);
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text()));
page.on("pageerror", (e) => console.log("  error:", e.message));
for (const s of shots.length ? shots : ["plan", "park-plan"]) {
  const [name, q = ""] = s.split("?");
  const t0 = Date.now();
  await page.goto(`${base}/dev/karts?shot=${name}${q ? `&${q}` : ""}`);
  await page.waitForFunction(() => (window as unknown as { __shot?: boolean }).__shot === true, null, {
    timeout: 180_000,
  });
  const data = await page.evaluate(() =>
    (document.querySelector("canvas") as HTMLCanvasElement).toDataURL("image/png"),
  );
  const file = `${out}/${name}${q ? `-${q.replace(/[^a-z0-9]+/gi, "-")}` : ""}.png`;
  writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
  console.log(`${name}: ${file} (${Date.now() - t0} ms)`, await page.locator("[data-status]").textContent());
}
await browser.close();
