/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, spaceId, test, token, walkTo } from "./helpers";

// Things to use, Sims-style: walk up, press X — the water cooler pours you a
// cup and the vending machine drops a can (in hand, sipped little by little),
// the piano opens its keys (you're shown playing). In the Lab; removed after.
const held = (page: Page) => page.evaluate(() => (window as any).__hud.get().held?.kind ?? "");
const mine = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    return w.room.state.players.get(w.room.sessionId);
  });

test("a cup from the cooler, a can from the machine, a tune on the piano", async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok, "Yutopia Lab"));
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const X = Math.floor(sp.x) - 4;
  const Y = Math.floor(sp.y) - 5;
  const stamp = Date.now().toString(36);
  const items = [
    { id: `e2e-cool-${stamp}`, kind: "water_cooler", x: X, y: Y, rot: 0 },
    { id: `e2e-vend-${stamp}`, kind: "vending", x: X + 2, y: Y, rot: 0 },
    { id: `e2e-piano-${stamp}`, kind: "piano", x: X + 4, y: Y, rot: 0 },
  ];
  // walk up to it and settle (the path ends a moment after we're near)
  const goTo = async (x: number, y: number) => {
    await walkTo(page, x, y, 20_000);
    await page.waitForTimeout(500);
  };
  try {
    for (const it of items) await page.evaluate((o) => (window as any).__yutopia.send("obj:put", o), it);
    await expect
      .poll(() => page.evaluate((id) => !!(window as any).__yutopia.room.state.objects.get(id), items[2].id))
      .toBe(true);

    await goTo(X + 0.5, Y + 1.6);
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().prompt?.kind)).toBe("water");
    await page.keyboard.press("x");
    // the cooler does its thing first: you're shown using it, then the cup
    await expect.poll(async () => (await mine(page))?.busy).toBe("water");
    await expect.poll(() => held(page)).toBe("cup");
    await expect(page.getByRole("button", { name: "Put down" })).toBeVisible();

    await goTo(X + 2.5, Y + 1.6);
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().prompt?.kind)).toBe("vending");
    await page.keyboard.press("x");
    await expect.poll(() => held(page)).toBe("soda");
    await page.getByRole("button", { name: "Put down" }).click();
    await expect.poll(() => held(page)).toBe("");

    await goTo(X + 5, Y + 1.6);
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().prompt?.kind)).toBe("piano");
    await page.keyboard.press("x");
    await expect(page.getByRole("button", { name: "C4", exact: true })).toBeVisible();
    await expect.poll(async () => (await mine(page))?.busy).toBe("piano");
    await page.getByRole("button", { name: "E4", exact: true }).click();
    await expect(page.getByText("E4", { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await mine(page))?.busy).toBe("");
  } finally {
    await page.evaluate(
      (ids) => (window as any).__yutopia.send("obj:removeMany", { ids }),
      items.map((i) => i.id),
    );
    await page.evaluate(() => (window as any).__yutopia.send("item:drop", {}));
    await page.waitForTimeout(500);
  }
});
