/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The guns' show (docs/plan/32-the-arms.md, phase 4), review shots only: Ana at
// night on the pond, a shot into the snow ahead — the star of a flash, the
// ground lit under it, a tracer flying out and the snow thrown up where it
// stops, the smoke drifting off; the double-barrel's two, then broken open,
// its shells thrown out on the snow. 3D: the GPU (YUTOPIA_GPU=1), shots to
// YUTOPIA_SHOTS=<dir>. (The show slowed down 20 times for the shots: a flash
// lasts 50 ms.)

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const shot = (page: Page, name: string) => page.screenshot({ path: `${dir}/${name}.png` });
const fire = async (page: Page) => {
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
};

test("the show: a flash, a tracer into the snow, smoke; the double-barrel's shells out", async ({ page }) => {
  test.skip(!GPU || !dir, "review shots: YUTOPIA_GPU=1 YUTOPIA_SHOTS=<dir>");
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
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-250, -60));
  await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
  await page.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 20_000 });
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 22 });
    y.room.send("mod:dark", { mode: "peaceful" });
    y.room.send("mod:storm", { storm: 0, now: true });
    y.room.send("mod:refill", { kit: true });
    y.tp.yaw = 0;
  });
  await page.waitForTimeout(2500);
  await page.keyboard.press("Digit1");
  await expect.poll(() => w(page, (y) => y.room.state.players.get(y.room.sessionId).gun)).toBe("revolver");
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(900);
  // (down at the snow some steps ahead)
  await w(page, (y) => {
    y.tp.pitch = 0.32;
  });
  await page.waitForTimeout(500);
  await w(page, (y) => {
    y.tp.arms().slow = 0.05;
  });
  await fire(page);
  await page.waitForTimeout(150);
  await shot(page, "fx-revolver-flash");
  await page.waitForTimeout(1800);
  await shot(page, "fx-revolver-impact");
  await page.waitForTimeout(6000);
  await shot(page, "fx-revolver-smoke");
  await w(page, (y) => {
    y.tp.arms().slow = 1;
  });

  // the double-barrel: one, then broken open
  await page.mouse.up({ button: "right" });
  await page.keyboard.press("Digit2");
  await expect.poll(() => w(page, (y) => y.room.state.players.get(y.room.sessionId).gun)).toBe("shotgun");
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(900);
  await w(page, (y) => {
    y.tp.pitch = 0.32;
  });
  await page.waitForTimeout(400);
  await w(page, (y) => {
    y.tp.arms().slow = 0.05;
  });
  await fire(page);
  await page.waitForTimeout(150);
  await shot(page, "fx-shotgun-flash");
  await page.waitForTimeout(1600);
  await shot(page, "fx-shotgun-impact");
  await w(page, (y) => {
    y.tp.arms().slow = 1;
  });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(600);
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(700);
  await shot(page, "fx-shotgun-brass");
  await page.waitForTimeout(2500);
  await page.keyboard.press("Digit2");
  await w(page, (y) => {
    y.room.send("mod:hour", { h: null });
    y.room.send("mod:dark", { mode: "normal" });
  });
});
