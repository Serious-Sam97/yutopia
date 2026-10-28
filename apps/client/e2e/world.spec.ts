/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { ANA, BIA, enter, holdCamera, test, token, useWorld, walkTo } from "./helpers";

const SHOTS = "../../design/screens";

test("sign in, arrive at the arrival point, My desk, walk across the building", async ({ page }) => {
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("demo"));
  // everyone comes in at the arrival point (builders move it: build mode → Map)
  const at = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const p = w.room.state.players.get(w.room.sessionId);
    return { x: p.x, y: p.y, spawn: { x: w.room.state.spawnX, y: w.room.state.spawnY }, desk: p.desk as string };
  });
  expect(Math.hypot(at.x - at.spawn.x, at.y - at.spawn.y)).toBeLessThan(1.5);
  // your desk is still yours: "My desk" takes you there
  if (at.desk) {
    await page.evaluate(() => (window as any).__yutopia.teleport("desk"));
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().me?.areaName)).toBe("Tracking Room");
  }
  await page.screenshot({ path: `${SHOTS}/01-desk.png` });
  await walkTo(page, 19.5, 27.5, 20_000);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/02-lounge.png` });
});

test("two people see each other in the one world", async ({ browser }) => {
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const space = await useWorld("demo");
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, ta, space);
  await enter(b, tb, space);
  await a.waitForFunction(
    () => (window as never as { __hud: { get(): { people: unknown[] } } }).__hud.get().people.length >= 1,
  );
  await b.waitForFunction(
    () => (window as never as { __hud: { get(): { people: unknown[] } } }).__hud.get().people.length >= 1,
  );
  // (from the arrival point: a longer walk than from a desk)
  await walkTo(a, 4.5, 2.5, 30_000);
  await holdCamera(a, { dist: 6 });
  await a.waitForTimeout(700);
  await a.screenshot({ path: `${SHOTS}/03-board-wall.png` });
});

test("vortex wanders and answers when poked", async ({ page }) => {
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("demo"));
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
    return out;
  });
  expect(said.length).toBeGreaterThan(0);
  expect(said[0]).toBe(said[0].toLowerCase());
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/04-vortex.png` });
});
