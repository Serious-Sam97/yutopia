/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// Sound and the HUD (docs/plan/30-the-dark.md, phase 8), as the mock
// 02-hud-night has it: Ana at night on the pond, hurt (22) and cold (15), the
// revolver out, focusing her torch on one of the shadowed while Bia stands a few
// tiles off — the vignette, the frost, the battery, the cylinder, the flares,
// Bia's distance and health under her name; and the sound: every sound made,
// the drone playing, the focus's hum. 3D: the GPU (YUTOPIA_GPU=1). Review shots:
// YUTOPIA_SHOTS=<dir>.

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({
  launchOptions: {
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
  },
});
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const prefs = (page: Page) =>
  page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", last3d: "3p", cam3p: "chase", reducedMotion: false }));
  });

test("the HUD at night, hurt and cold, focusing, armed; the dark's sounds", async ({ page, browser }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
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
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-250, -60));
  await bia.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-247, -63));
  await page.waitForFunction(() => !!(window as any).__dark, null, { timeout: 20_000 });
  // (a click: the sound starts on a gesture)
  await page.mouse.click(640, 400);
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    y.room.send("mod:hour", { h: 23 });
    y.room.send("mod:storm", { storm: 0, now: true });
    y.room.send("mod:refill", { kit: true, hp: 22, wm: 15 });
    y.room.send("mod:dark", { mode: "normal", spawn: 1 });
    if (!y.room.state.players.get(y.room.sessionId).torch) y.toggleTorch();
    y.tp.yaw = 0;
  });
  await bia.evaluate(() => {
    const y = (window as any).__yutopia;
    if (!y.room.state.players.get(y.room.sessionId).torch) y.toggleTorch();
  });
  await page.keyboard.press("KeyG");
  await page.keyboard.press("Digit1");
  await page.waitForTimeout(2500);
  // every sound made (one at a time, while idle)
  await expect
    .poll(() => page.evaluate(() => (window as any).__dark.voices.buffers.size as number), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(19);
  // aiming at it: the focus
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: "right" });
  for (let i = 0; i < 25; i++) {
    await page.evaluate(() => {
      const y = (window as any).__yutopia;
      const me = y.walker.where();
      let best: any = null;
      y.room.state.shadows?.forEach((s: any) => {
        if (!best || Math.hypot(s.x - me.x, s.y - me.y) < Math.hypot(best.x - me.x, best.y - me.y)) best = s;
      });
      if (!best) return;
      const cam = y.tp.camera;
      const e = cam.matrixWorld.elements;
      const fwd = Math.atan2(-e[10], -e[8]);
      const want = Math.atan2(best.y - cam.position.z, best.x - cam.position.x);
      y.tp.yaw += Math.atan2(Math.sin(want - fwd), Math.cos(want - fwd));
    });
    await page.waitForTimeout(100);
  }
  // the HUD: vignette, frost, the battery, the cylinder, the flares, the crosshair, Bia's tag
  const opacity = (sel: string) =>
    page.evaluate((s) => Number((document.querySelector(s) as HTMLElement).style.opacity), sel);
  expect(await opacity(".dk-vig"), "hurt: the vignette").toBeGreaterThan(0.3);
  expect(await opacity(".dk-frost"), "cold: the frost").toBeGreaterThan(0.5);
  await expect(page.locator(".dk-bat")).toBeVisible();
  await expect(page.locator(".dk-arms .cyl")).toBeVisible();
  await expect(page.locator(".dk-cross")).toBeVisible();
  await expect(page.locator(".dk-team").first()).toContainText(/\d+ m/);
  // the sound: the drone playing, the focus's hum
  const loops = await page.evaluate(() => [...(window as any).__dark.voices.loops.keys()] as string[]);
  expect(
    loops.some((l) => l.startsWith("drone")),
    `loops: ${loops}`,
  ).toBe(true);
  expect(loops, "the focus's hum").toContain("focus-hum");
  if (dir) await page.screenshot({ path: `${dir}/hud-night.png` });
  await page.mouse.up({ button: "right" });
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    y.room.send("mod:refill", {});
    y.room.send("mod:hour", { h: null });
    y.room.send("arms:draw", { slot: -1 });
    y.toggleTorch();
  });
});
