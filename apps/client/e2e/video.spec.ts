/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { chromium, expect, test } from "@playwright/test";
import { ANA, BIA, enter, spaceId, token, walkTo } from "./helpers";

// A camera turned off is a muted track that stays published: the bubble over the
// person must go away (no black square) and come back when the camera is on again.
test("video bubble shows only while the camera is on", async () => {
  test.setTimeout(180_000);
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  try {
    const [ta, tb] = [await token(ANA), await token(BIA)];
    const s = await spaceId(ta);
    const ctx = { viewport: { width: 1280, height: 800 }, permissions: ["camera", "microphone"] };
    const ana = await (await browser.newContext(ctx)).newPage();
    const bia = await (await browser.newContext(ctx)).newPage();
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    const at = await ana.evaluate(() => (window as any).__yutopia.meTile());
    await walkTo(bia, at.x + 1.5, at.y + 0.5, 30_000);
    const bubbles = () => bia.locator("[data-x] video").count();

    await ana.getByRole("button", { name: "Camera" }).click();
    await expect.poll(bubbles, { timeout: 20_000 }).toBe(1);
    await ana.getByRole("button", { name: "Camera" }).click(); // off
    await expect.poll(bubbles, { timeout: 10_000 }).toBe(0);
    // and the muted (black) stream itself is dropped, not just hidden
    const videos = () => bia.evaluate(() => Object.keys((window as any).__hud.get().videos).length);
    await expect.poll(videos, { timeout: 10_000 }).toBe(0);
    await ana.getByRole("button", { name: "Camera" }).click(); // on again
    await expect.poll(bubbles, { timeout: 20_000 }).toBe(1);
  } finally {
    await browser.close();
  }
});
