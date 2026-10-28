/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { ANA, enter, test, token } from "./helpers";

// The look (docs/plan/33-the-look.md): snow on people's shoulders and heads after a while out —
// a review shot, the snow set full rather than waited for (opt-in: YUTOPIA_SHOTS=<dir>).
const dir = process.env.YUTOPIA_SHOTS;
if (dir) test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

test("the look: snow settled on someone out a while", async ({ page }) => {
  test.skip(!dir, "YUTOPIA_SHOTS not set");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "free", quality: "high" }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -62 + 60, y: -222 + 10, level: 0 }));
  await page.waitForTimeout(6000);
  for (const [name, k, yaw, pitch, dist] of [
    ["snow-none", 0, 2.4, 0.25, 3.2],
    ["snow-full", 1, 2.4, 0.25, 3.2],
    ["snow-full-back", 1, -0.7, 0.45, 3.0],
  ] as const) {
    await page.evaluate(
      ([kk, y, p, d]) => {
        const t = (window as any).__yutopia.tp;
        t.setHour(13);
        t.yaw = y;
        t.pitch = p;
        t.dist = d;
        const set = () => {
          for (const id of t.snowOn.keys()) t.snowOn.set(id, kk);
        };
        set();
        (window as any).__snowSet = setInterval(set, 50);
      },
      [k, yaw, pitch, dist] as const,
    );
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${dir}/${name}.png` });
    await page.evaluate(() => clearInterval((window as any).__snowSet));
  }
});
