/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// Changing floors without a hitch (docs/plan/26-floor-transitions.md, phase 1):
// every floor is built once and kept (3D), its art and light ready ahead, so going up or down only moves and shows things. Measured on the
// machine's GPU — headless Chrome's software one is ~10× slower at everything —
// so opt-in: YUTOPIA_GPU=1 (macOS: Metal through ANGLE).
const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

for (const view of ["3p"] as const)
  test(`floor changes don't stall the page (${view})`, async ({ page }) => {
    test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
    test.setTimeout(120_000);
    await page.addInitScript((v) => {
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, view: v }));
    }, view);
    await enter(page, await token(ANA), "demo");
    await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
    // (the other floors are readied in the first seconds)
    await page.waitForTimeout(7000);
    const worst: number[] = [];
    // down to 3, to the lobby, home, and the same again (the second round: kept floors)
    const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
    for (const to of [
      { x: 20.5, y: 12.5, level: 3 },
      { ...G(12.5, 17.5), level: 0 },
      { x: 20.5, y: 12.5, level: 4 },
      { x: 20.5, y: 12.5, level: 3 },
      { ...G(12.5, 17.5), level: 0 },
      { x: 20.5, y: 12.5, level: 4 },
    ]) {
      await page.evaluate(() => {
        const w = window as any;
        w.__gaps = [];
        let last = performance.now();
        const f = (t: number) => {
          w.__gaps.push(t - last);
          last = t;
          if (w.__gaps.length < 200) requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      });
      await page.evaluate((p) => (window as any).__yutopia.teleport(p), to);
      await expect.poll(() => page.evaluate(() => (window as any).__yutopia.level), { timeout: 8000 }).toBe(to.level);
      await page.waitForTimeout(2500);
      worst.push(Math.max(...(await page.evaluate(() => (window as any).__gaps as number[]))));
    }
    console.log(`[floors-perf] ${view}: worst frame per change (ms)`, worst.map(Math.round).join(", "));
    // the first visit to a floor may take a frame or two more (its first upload);
    // after that, never a dropped beat worth seeing
    for (const [i, ms] of worst.entries()) expect(ms, `change ${i + 1}`).toBeLessThan(i < 3 ? 85 : 55);
  });
