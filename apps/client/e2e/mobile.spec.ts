/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, test } from "@playwright/test";
import { ANA, enter, spaceId, token } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("phone: world loads, HUD fits, tap to walk", async ({ page }) => {
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await expect(page.getByRole("navigation", { name: /controls/i })).toBeVisible();
  const before = await page.evaluate(() =>
    (window as never as { __yutopia: { meTile(): { x: number; y: number } } }).__yutopia.meTile(),
  );
  // tap two tiles away from me
  const p = await page.evaluate(
    ([x, y]) => {
      const e = (window as any).__yutopia.engine;
      const r = e.app.canvas.getBoundingClientRect();
      const s = e.worldToClient(x, y);
      return { x: r.left + s.x, y: r.top + s.y };
    },
    [before.x + 2, before.y + 2],
  );
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() =>
    (window as never as { __yutopia: { meTile(): { x: number; y: number } } }).__yutopia.meTile(),
  );
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.8);
  await page.screenshot({ path: "../../design/screens/06-mobile.png" });
});
