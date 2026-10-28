/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// A private space (a booth someone's talking in, a room its owner locked): walking into it I'm
// stopped at its edge, like a wall, and knock — nobody's put back (no anticheat for now, the
// user's call 2026-10-28: the server takes moves as sent; input/walker.ts holds the edge).
const me = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    const p = w.room.state.players.get(w.room.sessionId);
    return { x: p.x as number, y: p.y as number, area: p.area as string };
  });

test("a booth taken: walked into, stopped at its edge with a knock; let in, in", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const a = page;
  const b = await (await browser.newContext()).newPage();
  await enter(a, await token(ANA));
  await enter(b, await token(BIA));
  for (const pg of [a, b])
    await pg.evaluate(() => {
      const w = window as any;
      w.__knocks = 0;
      w.__snaps = 0;
      w.__yutopia.room.onMessage("knock", () => w.__knocks++);
      w.__yutopia.room.onMessage("snap", () => w.__snaps++);
      for (const k of ["fly", "clip", "fast", "hidden"]) w.__yutopia.room.send("mod:power", { power: k, on: false });
    });
  // Ana in booth 1 (the studio's, x 29–35, y 15–21; its door from the hall at y 15)
  await a.evaluate(() => (window as any).__yutopia.walkTo({ x: 31.5, y: 17.5 }));
  await expect.poll(async () => (await me(a)).area, { timeout: 30_000 }).toBe("booth-1");
  await b.evaluate(() => {
    (window as any).__snaps = 0;
  });
  // Bia walks in after her: stopped at the edge, knocking
  await b.evaluate(() => (window as any).__yutopia.walkTo({ x: 31.5, y: 18.5 }));
  await expect.poll(() => a.evaluate(() => (window as any).__knocks as number), { timeout: 30_000 }).toBeGreaterThan(0);
  await b.waitForTimeout(1500);
  const held = await me(b);
  expect(held.area, "not in").not.toBe("booth-1");
  expect(held.y, "at its edge").toBeLessThan(15.3);
  expect(await b.evaluate(() => (window as any).__snaps), "never put back").toBe(0);
  // let in: in she walks
  const uid = await b.evaluate(() => {
    const w = (window as any).__yutopia;
    return w.room.state.players.get(w.room.sessionId).uid as number;
  });
  await a.evaluate((u) => (window as any).__yutopia.room.send("admit", { userId: u, area: "booth-1" }), uid);
  await b.waitForTimeout(800);
  await b.evaluate(() => (window as any).__yutopia.walkTo({ x: 32.5, y: 18.5 }));
  await expect.poll(async () => (await me(b)).area, { timeout: 30_000 }).toBe("booth-1");
  // out, both
  for (const pg of [a, b]) await pg.evaluate(() => (window as any).__yutopia.room.send("teleport", { to: "spawn" }));
});
