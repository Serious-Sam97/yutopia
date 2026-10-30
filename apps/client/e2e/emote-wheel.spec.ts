/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The emote wheel (docs/plan/56-the-controls.md phase 6): X held opens it; the arrows (or WASD, a
// stick, the pointer) point at one; letting go of X does it. Esc, or letting go pointing nowhere,
// nothing.

test("the emote wheel: X held, → points at the third, let go: laugh", async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page, await token(ANA));
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    (window as any).__sent = [];
    const send = w.send.bind(w);
    w.send = (k: string, m: any) => {
      if (k === "emote") (window as any).__sent.push(m.e);
      return send(k, m);
    };
  });
  const sent = () => page.evaluate(() => (window as any).__sent as string[]);

  await page.keyboard.down("KeyX");
  await expect(page.locator("[data-emote-wheel]")).toBeVisible();
  await page.keyboard.down("ArrowRight");
  await page.keyboard.up("ArrowRight");
  await expect(page.locator('[data-wheel="laugh"]')).toHaveCSS("box-shadow", /rgb/);
  await page.keyboard.up("KeyX");
  await expect(page.locator("[data-emote-wheel]")).toBeHidden();
  await expect.poll(sent).toEqual(["laugh"]);

  // opened and let go without pointing: nothing
  await page.waitForTimeout(400);
  await page.keyboard.down("KeyX");
  await expect(page.locator("[data-emote-wheel]")).toBeVisible();
  await page.mouse.move(640, 400);
  await page.keyboard.press("Escape");
  await page.keyboard.up("KeyX");
  await expect(page.locator("[data-emote-wheel]")).toBeHidden();
  await page.waitForTimeout(300);
  expect(await sent()).toEqual(["laugh"]);
});
