// Phase 0 of docs/plan/29-the-move.md: the pose sheets from /dev/chars?anim=…,
// saved as PNGs (the dev client on :3100, the machine's GPU); `group~s` records
// it playing for s seconds instead (a .webm).
//   node --experimental-strip-types e2e/move-shots.mts [out dir] [group[@t] | group~s …]
import { renameSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/move";
const groups = process.argv.slice(3);
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1900, height: 1100 } });
page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text()));
page.on("pageerror", (e) => console.log("  error:", e.message));
for (const g of groups.length
  ? groups
  : ["move@1.3", "jog", "run", "sprint", "land", "vault", "mantle", "roll", "slide"]) {
  if (g.includes("~")) {
    const [group, secs] = g.split("~");
    const ctx = await browser.newContext({
      viewport: { width: 1848, height: 1048 },
      recordVideo: { dir: out, size: { width: 1848, height: 1048 } },
    });
    const p = await ctx.newPage();
    await p.goto(`${base}/dev/chars?anim=${group}`);
    await p.waitForFunction(() => (window as unknown as { __chars?: { ready: boolean } }).__chars?.ready === true);
    await p.waitForTimeout(Number(secs) * 1000);
    const video = p.video();
    await ctx.close();
    const file = `${out}/${group}.webm`;
    if (video) renameSync(await video.path(), file);
    console.log(`${group}: ${file}`);
    continue;
  }
  const [group, t = "0.01"] = g.split("@");
  const t0 = Date.now();
  await page.goto(`${base}/dev/chars?anim=${group}&t=${t}`);
  await page.waitForFunction(
    () => (window as unknown as { __chars?: { ready: boolean } }).__chars?.ready === true,
    null,
    {
      timeout: 120_000,
    },
  );
  await page.waitForTimeout(300);
  const file = `${out}/${group}.png`;
  await page.locator("#sheet").screenshot({ path: file });
  console.log(`${group}: ${file} (${Date.now() - t0} ms)`);
}
await browser.close();
