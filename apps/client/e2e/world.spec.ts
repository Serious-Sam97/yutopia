/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { ANA, BIA, enter, spaceId, test, token, walkTo } from "./helpers";

const SHOTS = "../../design/screens";

test("sign in, land at your desk, walk across the building", async ({ page }) => {
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok));
  const me = await page.evaluate(
    () => (window as never as { __hud: { get(): { me: { areaName: string } } } }).__hud.get().me,
  );
  expect(me.areaName).toBe("Tracking Room");
  await page.screenshot({ path: `${SHOTS}/01-desk.png` });
  await walkTo(page, 19.5, 27.5, 20_000);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/02-lounge.png` });
});

test("two people see each other and the Yondra board wall is live", async ({ browser }) => {
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const space = await spaceId(ta);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, ta, space);
  await enter(b, tb, space);
  await a.waitForFunction(
    () => (window as never as { __hud: { get(): { people: unknown[] } } }).__hud.get().people.length >= 1,
  );
  const boards = await a.evaluate(() =>
    (window as never as { __hud: { get(): { boards: { name: string }[] } } }).__hud.get().boards.map((x) => x.name),
  );
  expect(boards).toContain("Product");
  await walkTo(a, 4.5, 2.5);
  await a.evaluate(() =>
    (window as never as { __yutopia: { engine: { setZoom(z: number): void } } }).__yutopia.engine.setZoom(1.8),
  );
  await a.waitForTimeout(700);
  await a.screenshot({ path: `${SHOTS}/03-board-wall.png` });
});

test("vortex wanders and answers when poked", async ({ page }) => {
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok));
  const said = await page.evaluate(async () => {
    const c = (window as any).__yutopia;
    const out: string[] = [];
    c.onVortexSay((t: string) => out.push(t));
    for (let i = 0; i < 8 && !out.length; i++) {
      const v = c.room.state.npcs.get("vortex");
      c.walkTo({ x: v.x, y: v.y });
      await new Promise((r) => setTimeout(r, 4000));
      c.send("vortex:poke", {});
      await new Promise((r) => setTimeout(r, 1500));
    }
    c.engine.setZoom(2);
    return out;
  });
  expect(said.length).toBeGreaterThan(0);
  expect(said[0]).toBe(said[0].toLowerCase());
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/04-vortex.png` });
});
