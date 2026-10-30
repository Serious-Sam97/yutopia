/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// The camera after Kingdom Hearts 3 and the lock-on (docs/plan/56-the-controls.md D, E), out on the
// lot: low and behind at rest; R puts it behind me; F locks on to Bia (the chip says so, the camera
// comes round to her, I face her); F again lets go.

test("the camera behind me, R to put it there, F to lock on to Bia and let go", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const lot = { x: 37.8, y: 30, level: 0 };
  await enter(page, await token(ANA));
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), lot);
  await page.waitForTimeout(2500);
  const cam = () =>
    page.evaluate(() => {
      const t = (window as any).__yutopia.tp;
      return { yaw: t.yaw as number, pitch: t.pitch as number, mode: t.mode as string };
    });
  const facing = () => page.evaluate(() => (window as any).__yutopia.walker.body.yaw as number);
  const off = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

  // at rest: low (the KH camera's 0.25), behind me
  const c0 = await cam();
  expect(c0.mode).toBe("chase");
  expect(Math.abs(c0.pitch - 0.25)).toBeLessThan(0.05);

  // turned away on the arrows, then R: behind me again
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(600);
  await page.keyboard.up("ArrowLeft");
  expect(off((await cam()).yaw, await facing())).toBeGreaterThan(0.5);
  await page.keyboard.press("KeyR");
  await expect.poll(async () => off((await cam()).yaw, await facing()), { timeout: 2000 }).toBeLessThan(0.05);

  // Bia a few steps off, the camera looking her way: F locks on to her
  const ctxB = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const bia = await ctxB.newPage();
  await enter(bia, await token(BIA));
  const uid = await page.evaluate(() => (window as any).__yutopia.myUid());
  await bia.evaluate((u) => (window as any).__yutopia.teleport({ userId: u }), uid);
  await page.waitForTimeout(2500);
  const biaSid = await bia.evaluate(() => (window as any).__yutopia.room.sessionId);
  await page.evaluate((sid) => {
    const w = (window as any).__yutopia;
    const b = w.room.state.players.get(sid);
    w.tp.yaw = Math.atan2(b.y - w.me.y, b.x - w.me.x);
  }, biaSid);
  await page.waitForTimeout(300);
  await page.keyboard.press("KeyF");
  await expect.poll(() => page.evaluate(() => (window as any).__hud.get().lockOn?.label)).toMatch(/Bia/);
  await expect(page.getByText("Bia Demo").first()).toBeVisible();
  // the camera on her, and I face her
  const way = () =>
    page.evaluate((sid) => {
      const w = (window as any).__yutopia;
      const b = w.room.state.players.get(sid);
      return Math.atan2(b.y - w.me.y, b.x - w.me.x);
    }, biaSid);
  await expect.poll(async () => off((await cam()).yaw, await way()), { timeout: 3000 }).toBeLessThan(0.15);
  await expect.poll(async () => off(await facing(), await way()), { timeout: 3000 }).toBeLessThan(0.3);
  // the prompt's hers: Use acts on her
  expect(await page.evaluate(() => (window as any).__hud.get().targets?.items[0]?.key)).toBe(`p:${biaSid}`);

  // F again: let go
  await page.keyboard.press("KeyF");
  await expect.poll(() => page.evaluate(() => (window as any).__hud.get().lockOn)).toBeNull();
  await ctxB.close();
});
