/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The Daybreak (docs/plan/79-the-guns.md phase 7): Ana on the pond's north shore by night, facing out
// over the water; pressed, it charges (Player.arm says so; no ball yet), a second on the ball flies — its
// light in the place — and bursts out there; a cell spent; R, three again. 3D: the GPU (YUTOPIA_GPU=1).
const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const me = (page: Page) =>
  w(page, (y) => {
    const p = y.room.state.players.get(y.room.sessionId);
    const g = (window as any).__dark?.inv?.quick?.find((it: any) => it?.id === p.gun);
    return { gun: p.gun as string, arm: p.arm as number, loaded: (g?.loaded ?? -1) as number };
  }) as Promise<{ gun: string; arm: number; loaded: number }>;

test("the Daybreak: charged, a ball of light flies and bursts; a cell spent, three again", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -240, y: -23, level: 0 }));
  await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
  await page.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 20_000 });
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 22 });
    y.room.send("mod:storm", { storm: 0, now: true });
    y.room.send("mod:dark", { mode: "peaceful" });
    y.room.send("mod:refill", { kit: true, daybreak: true });
    y.tp.yaw = -Math.PI / 2;
  });
  await page.waitForTimeout(2000);
  await page.keyboard.press("Digit4");
  await expect.poll(async () => (await me(page)).gun).toBe("daybreak");
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(900);
  await w(page, (y) => {
    y.tp.pitch = 0.02;
  });
  await page.waitForTimeout(200);
  // pressed: charging — no ball yet
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
  await expect.poll(async () => (await me(page)).arm, { timeout: 1000 }).toBe(5);
  expect((await me(page)).loaded, "charging: none spent").toBe(3);
  // a second on: off, its light in the place; a cell spent; then its burst out there
  await expect.poll(() => w(page, (y) => y.tp.orbLights.length), { timeout: 2500 }).toBeGreaterThan(0);
  await expect.poll(async () => (await me(page)).loaded, { timeout: 2000 }).toBe(2);
  await expect.poll(() => w(page, (y) => y.tp.arms().burstsShown), { timeout: 5000 }).toBeGreaterThan(0);
  // let go of the aim mid-charge: nothing goes
  await page.waitForTimeout(ARMS_RATE_MS);
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(400);
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(1500);
  expect((await me(page)).loaded, "let go before it went: none spent").toBe(2);
  // R: the cells out, three in
  await page.keyboard.press("KeyR");
  await expect.poll(async () => (await me(page)).loaded, { timeout: 4000 }).toBe(3);
  await page.keyboard.press("Digit4");
  await w(page, (y) => y.room.send("mod:hour", { h: null }));
});
const ARMS_RATE_MS = 2600;
