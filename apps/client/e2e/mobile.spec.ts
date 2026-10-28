/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { ANA, enter, test, token, useWorld } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("phone: world loads, HUD fits, tap to walk", async ({ page }) => {
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("demo"));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await expect(page.getByRole("navigation", { name: /controls/i })).toBeVisible();
  // (the camera settles on me first: a tap aimed while it glides lands elsewhere)
  const onScreen = () =>
    page.evaluate(() => {
      const c = (window as any).__yutopia;
      const s = c.model.worldToClient(c.me.x, c.me.y);
      return `${Math.round(s.x)},${Math.round(s.y)}`;
    });
  let was = "";
  await expect
    .poll(async () => {
      const now = await onScreen();
      const still = now === was;
      was = now;
      return still;
    })
    .toBe(true);
  const before = await page.evaluate(() =>
    (window as never as { __yutopia: { meTile(): { x: number; y: number } } }).__yutopia.meTile(),
  );
  // tap bare floor a few tiles away from me, clear of the HUD (not someone, not something to use)
  const p = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const t = w.tp;
    const r = t.renderer.domElement.getBoundingClientRect();
    for (const d of [3, 2.5, 2])
      for (const a of [0, 1, -1, 2, -2, 3, -3]) {
        const yaw = t.yaw + a * 0.5;
        const x = w.me.x + Math.cos(yaw) * d;
        const y = w.me.y + Math.sin(yaw) * d;
        if (!w.grid.fits(x, y)) continue;
        const s = t.project(x, y, 0);
        if (!s) continue;
        const cx = r.left + s.x;
        const cy = r.top + s.y;
        if (document.elementFromPoint(cx, cy) !== t.renderer.domElement) continue;
        t.setRay(cx, cy);
        if (t.personAt() || t.pickObject()) continue;
        return { x: cx, y: cy };
      }
    return null;
  });
  expect(p, "bare floor on screen").not.toBeNull();
  if (!p) return;
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() =>
    (window as never as { __yutopia: { meTile(): { x: number; y: number } } }).__yutopia.meTile(),
  );
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.8);
  await page.screenshot({ path: "../../design/screens/06-mobile.png" });
});
