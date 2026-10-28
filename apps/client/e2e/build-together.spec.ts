/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, holdCamera, test, token, useWorld, walkTo } from "./helpers";

// Two builders in one studio: what one holds, the other can't grab — they see
// it outlined in rust with "held by …", and get told who's moving it. Once it's
// put down, it's free again. (Everyone builds in the one world.)
const SHOTS = process.env.YUTOPIA_SHOTS;

async function at(page: Page, x: number, y: number, z = 0) {
  return page.evaluate(
    ([tx, ty, tz]) => {
      const w = (window as any).__yutopia;
      const r = w.hostRect();
      const s = w.model.worldToClient(tx, ty, tz);
      return { x: r.left + s.x, y: r.top + s.y };
    },
    [x, y, z],
  );
}
const build = (page: Page) => page.evaluate(() => (window as any).__hud.get().build);
const buildOn = (page: Page) =>
  page.evaluate(() => {
    const h = (window as any).__hud;
    h.set({ build: { ...h.get().build, on: true, tool: "furniture", mode: "hand", selected: [] } });
  });

test("two builders: one hand at a time, and you can see whose", async ({ browser }) => {
  test.setTimeout(240_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const ctx = { viewport: { width: 1280, height: 820 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  let plant = "";
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: an e2e helper, not a React hook
    const s = await useWorld("lab");
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    expect(await bia.evaluate(() => (window as any).__hud.get().canBuild)).toBe(true);
    // a plant to fight over, on a free tile near the arrival point
    const spot = await ana.evaluate(() => {
      const w = (window as any).__yutopia;
      const sp = w.map.spawn;
      return { x: Math.floor(sp.x) + 2, y: Math.floor(sp.y) + 1 };
    });
    await walkTo(ana, spot.x - 1.5, spot.y + 1.5, 20_000);
    await walkTo(bia, spot.x - 2.5, spot.y + 1.5, 20_000);
    plant = `tg-plant-${Date.now().toString(36)}`;
    await ana.evaluate(
      ([id, p]) => (window as any).__yutopia.send("obj:put", { id, kind: "plant", x: p.x, y: p.y, rot: 0 }),
      [plant, spot] as const,
    );
    await expect.poll(() => bia.evaluate((id) => !!(window as any).__yutopia.model.getObject(id), plant)).toBe(true);
    for (const p of [ana, bia]) {
      await holdCamera(p, { at: spot, dist: 8 });
      await buildOn(p);
      await p.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
    }
    await ana.waitForTimeout(600);

    // Ana picks it up (by its leaves)
    const leaves = await at(ana, spot.x + 0.5, spot.y + 0.5, 34);
    await ana.mouse.move(leaves.x, leaves.y);
    await ana.waitForTimeout(150);
    await ana.mouse.click(leaves.x, leaves.y);
    await expect.poll(async () => (await build(ana)).held).toEqual([plant]);
    await expect
      .poll(() => bia.evaluate((id) => (window as any).__yutopia.room.state.holds.get(id) ?? "", plant))
      .toContain("Ana Demo");

    // Bia points at it: held by Ana (tag + rust outline); her click is refused
    const there = await at(bia, spot.x + 0.5, spot.y + 0.5, 34);
    await bia.mouse.move(there.x, there.y);
    await expect.poll(async () => (await build(bia)).hover?.by ?? null).toBe("Ana Demo");
    await expect(bia.getByText("held by Ana Demo")).toBeVisible();
    // outlined in rust (C.rust), not the amber of a normal hover
    const outline = await bia.evaluate(
      (id) =>
        (window as any).__yutopia.model
          .buildLook()
          .outlines.filter((o: any) => o.id === id)
          .map((o: any) => o.color),
      plant,
    );
    expect(outline).toEqual([0xb5562f]);
    if (SHOTS) await bia.screenshot({ path: `${SHOTS}/build-held-by-other.png` });
    await bia.mouse.click(there.x, there.y);
    await expect(bia.getByText("Ana Demo is moving that.")).toBeVisible();
    expect((await build(bia)).carrying).toBe(0);

    // Ana puts it down a tile over: it's free, and Bia can take it now
    const drop = await at(ana, spot.x + 1.5, spot.y + 0.5, 34);
    await ana.mouse.move(drop.x, drop.y, { steps: 4 });
    await ana.mouse.click(drop.x, drop.y);
    await expect
      .poll(() => bia.evaluate((id) => (window as any).__yutopia.room.state.holds.get(id) ?? "", plant))
      .toBe("");
    const moved = await bia.evaluate((id) => (window as any).__yutopia.model.getObject(id), plant);
    const free = await at(bia, moved.x + 0.5, moved.y + 0.5, 34);
    await bia.mouse.move(free.x, free.y);
    await bia.waitForTimeout(150);
    await bia.mouse.click(free.x, free.y);
    await expect.poll(async () => (await build(bia)).held).toEqual([plant]);
    await expect
      .poll(() => ana.evaluate((id) => (window as any).__yutopia.room.state.holds.get(id) ?? "", plant))
      .toContain("Bia Demo");
    await bia.keyboard.press("Escape");
    await expect
      .poll(() => ana.evaluate((id) => (window as any).__yutopia.room.state.holds.get(id) ?? "", plant))
      .toBe("");
  } finally {
    if (plant) await ana.evaluate((id) => (window as any).__yutopia.send("obj:remove", { id }), plant).catch(() => {});
    await ana.waitForTimeout(400);
  }
});
