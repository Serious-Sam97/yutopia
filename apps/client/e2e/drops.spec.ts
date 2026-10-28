/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// What lies on the snow (tp/items3d.ts): one of each of the pockets' things
// dropped in a row by day, then a close look — models, not blocks. Shots only
// (YUTOPIA_SHOTS=<dir>), on the GPU (YUTOPIA_GPU=1).

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const inv = (page: Page) => page.evaluate(() => (window as any).__dark?.inv);

test("dropped on the snow: a model each", async ({ page }) => {
  test.skip(!GPU || !dir, "a review shot: YUTOPIA_GPU=1 YUTOPIA_SHOTS=<dir>");
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  const at = G(-232, -40);
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at);
  await page.waitForFunction(() => !!(window as any).__dark, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    y.room.send("mod:hour", { h: 13 });
    y.room.send("mod:refill", { kit: true });
  });
  await expect.poll(async () => (await inv(page))?.quick?.filter(Boolean).length ?? 0).toBe(2);
  // (what lay here before: left alone — only ours are picked up at the end)
  const before = new Set(
    (await page.evaluate(() => [...(window as any).__yutopia.room.state.drops.keys()])) as string[],
  );
  // each pocket and quick slot dropped a step along
  const slots = [6, 7, 8, 9, 0, 1, 2, 3, 4, 5];
  for (const [k, slot] of slots.entries()) {
    await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + p.k * 0.9, y: p.y, level: 0 }), {
      ...at,
      k,
    });
    await page.waitForTimeout(500);
    await page.evaluate((s) => (window as any).__yutopia.room.send("dark:drop", { slot: s }), slot);
    await page.waitForTimeout(300);
  }
  // stand back and look along the row
  await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 3, y: p.y + 3, level: 0 }), at);
  await page.waitForTimeout(1500);
  await page.evaluate((p) => {
    const y = (window as any).__yutopia;
    const me = y.walker.where();
    y.tp.yaw = Math.atan2(p.y - me.y, p.x + 3 - me.x);
    y.tp.pitch = -0.6;
  }, at);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/drops-row.png` });
  // and take them back up (the snow as it was)
  const lying = (
    (await page.evaluate(() =>
      [...(window as any).__yutopia.room.state.drops.values()].map((d: any) => ({ id: d.id, x: d.x, y: d.y })),
    )) as { id: string; x: number; y: number }[]
  ).filter((d) => !before.has(d.id));
  for (const d of lying) {
    await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x, y: p.y, level: 0 }), d);
    await page.waitForTimeout(400);
    await page.evaluate((id) => (window as any).__yutopia.room.send("dark:pick", { id }), d.id);
  }
  await expect
    .poll(
      () =>
        page.evaluate(
          (ids) => ids.filter((id) => (window as any).__yutopia.room.state.drops.has(id)).length,
          lying.map((d) => d.id),
        ),
      { timeout: 10_000 },
    )
    .toBe(0);
});
