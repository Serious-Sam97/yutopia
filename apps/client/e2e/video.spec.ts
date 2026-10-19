/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { chromium, expect } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld, walkTo } from "./helpers";

// A camera turned off is a muted track that stays published: the bubble over the
// person must go away (no black square) and come back when the camera is on again.
test("video bubble shows only while the camera is on", async () => {
  test.setTimeout(180_000);
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  try {
    const [ta, tb] = [await token(ANA), await token(BIA)];
    const s = await useWorld("demo");
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

// A shared screen shows up: a tile for whoever shares (with a way to stop) and
// one for the people near them, which opens big; stopping takes it away.
test("a shared screen: your tile, theirs, big, and gone when you stop", async () => {
  test.setTimeout(180_000);
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--auto-select-desktop-capture-source=Entire screen",
    ],
  });
  try {
    const [ta, tb] = [await token(ANA), await token(BIA)];
    const s = await useWorld("lab");
    const ctx = { viewport: { width: 1280, height: 800 }, permissions: ["camera", "microphone"] };
    const ana = await (await browser.newContext(ctx)).newPage();
    const bia = await (await browser.newContext(ctx)).newPage();
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    // out on the open floor, near each other
    await walkTo(ana, 10.5, 12.5, 30_000);
    await walkTo(bia, 12.5, 12.5, 30_000);
    await expect
      .poll(() => bia.evaluate(() => (window as any).__hud.get().people.some((p: any) => p.hearing)), {
        timeout: 15_000,
      })
      .toBe(true);

    await ana.getByRole("button", { name: "Share screen" }).click();
    const mine = ana.getByRole("list", { name: "Shared screens" });
    await expect(mine.getByText("Your screen")).toBeVisible({ timeout: 20_000 });
    const theirs = bia.getByRole("button", { name: "Open big: Ana Demo's screen" });
    await expect(theirs).toBeVisible({ timeout: 20_000 });
    // the tile really plays it
    await expect
      .poll(
        () =>
          bia.evaluate(() => (document.querySelector("[aria-label='Shared screens'] video") as any)?.videoWidth ?? 0),
        {
          timeout: 15_000,
        },
      )
      .toBeGreaterThan(0);
    await theirs.click();
    await expect(bia.getByRole("region", { name: "Ana Demo's screen" })).toBeVisible();
    await bia.keyboard.press("Escape");
    await expect(bia.getByRole("region", { name: "Ana Demo's screen" })).toBeHidden();

    await mine.getByRole("button", { name: "Stop sharing" }).click();
    await expect(mine).toBeHidden();
    await expect(theirs).toBeHidden({ timeout: 15_000 });
  } finally {
    await browser.close();
  }
});
