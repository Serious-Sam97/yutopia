/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { DOWN } from "@yutopia/shared/vitals";
import { ANA, BIA, enter, test, token } from "./helpers";

// Down, up, awake (docs/plan/30-the-dark.md, phase 6), two browsers: Ana goes
// down on the pond — she crawls, her screen says so, Bia sees the red cross
// over her; Bia comes to her and holds E for 3 s (the ring fills) — Ana's up
// at 35. Then alone, down again: nobody comes and she wakes at the office.
// 3D: the GPU (YUTOPIA_GPU=1). Review shots: YUTOPIA_SHOTS=<dir>.

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const prefs = (page: Page) =>
  page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", last3d: "3p", cam3p: "chase", reducedMotion: false }));
  });
const mine = (page: Page) =>
  page.evaluate(() => {
    const y = (window as any).__yutopia;
    const p = y.room.state.players.get(y.room.sessionId);
    return { downAt: p.downAt as number, hp: p.hp as number, level: y.level as number };
  });

test("down: crawling, a teammate gets you up; alone, you wake at the office", async ({ page, browser }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(240_000);
  await prefs(page);
  await enter(page, await token(ANA));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bia = await ctx.newPage();
  await prefs(bia);
  await enter(bia, await token(BIA));
  for (const p of [page, bia])
    await p.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
      timeout: 60_000,
    });
  // on the pond, Bia 5 tiles off
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-250, -60));
  await bia.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-245, -60));
  for (const p of [page, bia])
    await p.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 20_000 });
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 23 }));
  await page.waitForTimeout(2000);

  // Ana down: her screen, a crawl; Bia sees the cross over her
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:down", {}));
  await expect.poll(async () => (await mine(page)).downAt, { timeout: 5000 }).toBeGreaterThan(0);
  await expect(page.locator(".dk-down")).toBeVisible();
  await expect(bia.locator(".dk-sign").first()).toBeVisible({ timeout: 5000 });
  // (a crawl: slow)
  const x0 = await page.evaluate(() => (window as any).__yutopia.walker.where().x as number);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1000);
  await page.keyboard.up("KeyD");
  const crawled = Math.abs((await page.evaluate(() => (window as any).__yutopia.walker.where().x as number)) - x0);
  expect(crawled, `crawled ${crawled.toFixed(2)} in a second`).toBeLessThan(1.2);
  if (dir) {
    await page.screenshot({ path: `${dir}/down-ana.png` });
    await bia.screenshot({ path: `${dir}/down-bia-sees.png` });
  }

  // Bia to her side, holding E (the key held down in her page — a real press would bring her
  // window up and blur Ana's): 3 s, and Ana's up at 35
  const ana = await page.evaluate(() =>
    (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId),
  );
  await bia.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 1, y: p.y, level: 0 }), {
    x: ana.x,
    y: ana.y,
  });
  await bia.waitForTimeout(1500);
  await expect(bia.locator(".dk-prompt", { hasText: "Ana" })).toBeVisible();
  await bia.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", code: "KeyE" })));
  await bia.waitForTimeout(1500);
  if (dir) await bia.screenshot({ path: `${dir}/down-revive.png` });
  await expect.poll(async () => (await mine(page)).downAt, { timeout: 5000 }).toBe(0);
  await bia.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: "e", code: "KeyE" })));
  expect((await mine(page)).hp).toBeGreaterThanOrEqual(DOWN.upHp);
  await expect(page.locator(".dk-down")).toBeHidden();

  // alone: down again, nobody comes — the office (30 s)
  await bia.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-200, -40));
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:down", {}));
  await expect.poll(async () => (await mine(page)).downAt, { timeout: 5000 }).toBeGreaterThan(0);
  await expect
    .poll(async () => (await mine(page)).downAt, { timeout: (DOWN.bleed + 10) * 1000, intervals: [1000] })
    .toBe(0);
  const after = await mine(page);
  expect(after.hp).toBe(DOWN.awakeHp);
  expect(await page.evaluate(() => (window as any).__yutopia.walker.outside)).toBe(false);
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: null }));
});
