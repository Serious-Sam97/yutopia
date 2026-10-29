/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The building (docs/plan/25-building-floors.md): the studio is the top of five
// floors; an elevator rides between them, the stairs climb them a step at a
// time, the ground floor's lot is walkable. Opt-in review shots: YUTOPIA_SHOTS=<dir>.
const dir = process.env.YUTOPIA_SHOTS;
// the ground floor's corner is at (-60, -10) in the studio's coords
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });

const state = (page: any) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    return { level: c.level, x: c.me.x, y: c.me.y, z: c.height.z, floor: (window as any).__hud.get().floor };
  });

test("the building: five floors, the studio on top, the floor shown in the HUD", async ({ page }) => {
  await enter(page, await token(ANA), "demo");
  await expect.poll(() => page.evaluate(() => (window as any).__hud.get().floors)).toEqual([0, 1, 2, 3, 4]);
  expect((await state(page)).level).toBe(4);
  await expect(page.getByTestId("floor-chip")).toContainText("4");
});

test("an elevator: call it, step in, pick the ground floor on its panel — out by the lobby", async ({ page }) => {
  test.setTimeout(120_000);
  await enter(page, await token(ANA), "demo");
  // up to car A's doors (x 8–10, y 29) on the studio's floor
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: 8.5, y: 27.5, level: 4 }));
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const c = (window as any).__yutopia;
    c.path = [{ x: 8.8, y: 28.4 }];
  });
  await page.waitForTimeout(800);
  const stop = await page.evaluate(() => {
    const c = (window as any).__yutopia;
    const o = [...c.objs.values()].find(
      (x: any) => x.kind === "elevator" && x.props.shaft === "A" && x.props.level === 4,
    );
    c.activateObject(o.id, false);
    return o.id as string;
  });
  await expect
    .poll(() => page.evaluate((id) => (window as any).__yutopia.objs.get(id).props.door, stop), { timeout: 8000 })
    .toBe("open");
  await page.evaluate(() => {
    (window as any).__yutopia.path = [
      { x: 9, y: 29.3 },
      { x: 9, y: 30 },
    ];
  });
  // the panel: the floors it goes to, mine lit
  await expect(page.getByTestId("lift-panel")).toBeVisible({ timeout: 8000 });
  await expect(page.locator('[data-testid="lift-panel"] [data-floor="4"]')).toHaveAttribute("aria-current", "true");
  if (dir) await page.screenshot({ path: `${dir}/floors-lift-panel.png` });
  await page.locator('[data-testid="lift-panel"] [data-floor="0"]').click();
  await expect.poll(async () => (await state(page)).level, { timeout: 15_000 }).toBe(0);
  const s = await state(page);
  const at = G(9, 30);
  expect(Math.hypot(s.x - at.x, s.y - at.y)).toBeLessThan(0.7);
  await expect(page.getByTestId("floor-chip")).toContainText("G");
});

test("the stairs: up a floor step by step, the feet on the treads", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
  });
  await enter(page, await token(ANA), "demo");
  // (the 3D view first: building five floors' scene keeps the page busy a while)
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  const foot = G(13, 30.5);
  // (again if it went out while the last test's session was still being replaced)
  await expect
    .poll(
      async () => {
        await page.evaluate((f) => (window as any).__yutopia.teleport({ ...f, level: 0 }), foot);
        await page.waitForTimeout(1200);
        return (await state(page)).level;
      },
      { timeout: 30_000 },
    )
    .toBe(0);
  await page.waitForTimeout(1500);
  // flight A, the half landing, flight B — in the ground floor's coords
  const legs = [[G(13, 34.3)], [G(11, 35), G(11, 32.2)]];
  let top = 0;
  for (const leg of legs) {
    await page.evaluate((p) => {
      (window as any).__yutopia.path = p;
    }, leg);
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(150);
      const s = await state(page);
      top = Math.max(top, s.level * 3.5 + s.z);
    }
  }
  if (dir) await page.screenshot({ path: `${dir}/floors-stairs.png` });
  // on to the door one floor up (floor 1's coords: the studio's, shifted nothing)
  await page.evaluate(() => {
    const c = (window as any).__yutopia;
    c.path = [{ x: c.me.x, y: c.me.y - 1.8 }];
  });
  await expect.poll(async () => (await state(page)).level, { timeout: 10_000 }).toBe(1);
  expect(top).toBeGreaterThan(2.5);
  await expect(page.getByTestId("floor-chip")).toContainText("1");
});

test("the lot: out through the glass doors, a car to jump up on", async ({ page }) => {
  test.setTimeout(120_000);
  await enter(page, await token(ANA), "demo");
  const lot = G(-21, 4.5); // the aisle by the building's row of bays
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), lot);
  await expect.poll(async () => (await state(page)).level, { timeout: 8000 }).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as any).__hud.get().me?.areaName)).toBe("Parking lot");
  // a car's footprint is solid; its roof is something to stand on
  const car = await page.evaluate(() => {
    const c = (window as any).__yutopia;
    const o = [...c.objs.values()].find((x: any) => x.kind === "car" && x.props.level === 0);
    // (a parked car is a box of its own in the grid — docs/plan/28: its roof what's stood on there)
    return { x: o.x, y: o.y, fits: c.grid.fits(o.x + 2.5, o.y + 1), top: c.grid.standOn(o.x + 2.5, o.y + 1, 10) };
  });
  expect(car.fits).toBe(false);
  expect(car.top).toBeGreaterThan(1.2);
  if (dir) await page.screenshot({ path: `${dir}/floors-lot.png` });
});

test("the stairs by a click: up them from floor 3, down them again from 4", async ({ page }) => {
  test.setTimeout(120_000);
  await enter(page, await token(ANA), "demo");
  // the staircase from floor 3 (the core's stairwell, x 10–14, y 30–36)
  const S = await page.evaluate(() => {
    const c = (window as any).__yutopia;
    const o = [...c.objs.values()].find((x: any) => x.kind === "stairs" && x.props.level === 3);
    return { x: o.x, y: o.y };
  });
  await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 1, y: p.y - 2.5, level: 3 }), S);
  await expect.poll(async () => (await state(page)).level, { timeout: 8000 }).toBe(3);
  await page.waitForTimeout(1500);
  // a click on flight A's treads: over to the door, up, out on floor 4
  await page.evaluate((p) => (window as any).__yutopia.engine.events.onTileClick(p.x + 3.2, p.y + 2.5), S);
  await expect.poll(async () => (await state(page)).level, { timeout: 20_000 }).toBe(4);
  await expect
    .poll(() => page.evaluate(() => (window as any).__yutopia.path?.length ?? 0), { timeout: 10_000 })
    .toBe(0);
  const top = await state(page);
  // out on the landing (two tiles deep, v 0..2): where the way up ends, v 1.2 (shared stairsWayUp)
  expect(Math.abs(top.y - (S.y + 1.2))).toBeLessThan(0.5);
  // from floor 4, a click on flight B down in the well: back to floor 3's landing
  await page.evaluate((p) => (window as any).__yutopia.engine.events.onTileClick(p.x + 1, p.y + 2.5), S);
  await expect.poll(async () => (await state(page)).level, { timeout: 20_000 }).toBe(3);
});
