/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, spaceId, test, token } from "./helpers";

// The rest of the hand (plan phase 2), in the Lab: Shift-click keeps placing
// copies; what you hold turns with the wheel and with a sideways drag while
// pressing; the arrows nudge it and Enter puts it down; Delete while holding
// removes it; the floor grid shows while building. Removed after.
async function at(page: Page, x: number, y: number, z = 0) {
  return page.evaluate(
    ([tx, ty, tz]) => {
      const e = (window as any).__yutopia.engine;
      const r = e.app.canvas.getBoundingClientRect();
      const s = e.worldToClient(tx, ty, tz);
      return { x: r.left + s.x, y: r.top + s.y };
    },
    [x, y, z],
  );
}
// Clicks a thing where it shows (leaves overlap in a row: points on it until
// the hover is on that one, the way you would).
async function grab(page: Page, id: string, x: number, y: number) {
  for (const z of [38, 30, 22, 44, 16]) {
    const p = await at(page, x, y, z);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(120);
    if ((await page.evaluate(() => (window as any).__yutopia.build.hoverPick?.id)) !== id) continue;
    await page.mouse.click(p.x, p.y);
    return p;
  }
  throw new Error(`couldn't point at ${id}`);
}
const build = (page: Page) => page.evaluate(() => (window as any).__hud.get().build);
const plantsAt = (page: Page, ids: string[]) =>
  page.evaluate(
    (skip) =>
      [...(window as any).__yutopia.room.state.objects.values()]
        .filter((o: any) => o.kind === "plant" && !skip.includes(o.id))
        .map((o: any) => ({ id: o.id, x: o.x, y: o.y, rot: o.rot })),
    ids,
  );

test("the hand: Shift keeps placing, wheel and drag turn, arrows nudge, Delete removes", async ({ page }) => {
  test.setTimeout(150_000);
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok, "Yutopia Lab"));
  const before: string[] = await page.evaluate(() => [...(window as any).__yutopia.room.state.objects.keys()]);
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const X = Math.floor(sp.x) - 3;
  const Y = Math.floor(sp.y) - 4;
  try {
    await page.evaluate(([x, y]) => (window as any).__yutopia.engine.pinCamera({ x, y, zoom: 2 }), [X + 1, Y + 1]);
    await page.evaluate(() => {
      const h = (window as any).__hud;
      h.set({ build: { ...h.get().build, on: true, tool: "furniture", mode: "hand", selected: [] } });
    });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
    // the build grid is drawn
    expect(await page.evaluate(() => (window as any).__yutopia.engine.gridG.bounds.width > 0)).toBe(true);

    // ── Shift-click keeps placing copies; a plain click places the last one and lets go
    await page.getByRole("tab", { name: "Decor" }).click();
    await page.getByRole("button", { name: "Plant", exact: true }).click();
    await page.keyboard.down("Shift");
    for (const dx of [0, 1]) {
      const p = await at(page, X + dx + 0.5, Y + 0.5);
      await page.mouse.move(p.x, p.y, { steps: 3 });
      await page.waitForTimeout(120);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(250);
    }
    await page.keyboard.up("Shift");
    expect((await build(page)).mode).toBe("place"); // still placing after Shift-clicks
    const p3 = await at(page, X + 2.5, Y + 0.5);
    await page.mouse.move(p3.x, p3.y, { steps: 3 });
    await page.waitForTimeout(120);
    await page.mouse.click(p3.x, p3.y);
    await expect.poll(async () => (await plantsAt(page, before)).length).toBe(3);
    await expect.poll(async () => (await build(page)).mode).toBe("hand");

    // ── pick one up; the wheel turns it a quarter, a sideways drag
    // while pressing another
    const first = (await plantsAt(page, before)).find((p) => p.x === X + 2);
    const leaves = await grab(page, first?.id ?? "", X + 2.5, Y + 0.5);
    await expect.poll(async () => (await build(page)).held).toEqual([first?.id]);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => page.evaluate(() => (window as any).__yutopia.build.handInfo()?.rot)).toBe(1);
    await page.mouse.down();
    await page.mouse.move(leaves.x + 60, leaves.y, { steps: 6 }); // the Sims gesture
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => (window as any).__yutopia.build.handInfo()?.rot)).toBe(2);
    expect((await build(page)).carrying).toBe(1); // turning doesn't drop it

    // ── the arrows nudge it two tiles down (+y), Enter puts it there, turned
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await plantsAt(page, before)).find((p) => p.id === first?.id))
      .toEqual(expect.objectContaining({ x: X + 2, y: Y + 2, rot: 2 }));

    // ── Delete while holding: gone
    const second = (await plantsAt(page, before)).find((p) => p.x === X + 1);
    await grab(page, second?.id ?? "", X + 1.5, Y + 0.5);
    await expect.poll(async () => (await build(page)).held).toEqual([second?.id]);
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await plantsAt(page, before)).some((p) => p.id === second?.id)).toBe(false);
  } finally {
    const mine = (await plantsAt(page, before)).map((p) => p.id);
    if (mine.length) await page.evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), mine);
    await page.waitForTimeout(500);
  }
});
