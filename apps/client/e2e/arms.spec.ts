/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// Guns and flares (docs/plan/30-the-dark.md, phase 5): Ana, armed, at night on
// the pond — G throws a flare (it lands ahead and burns, red); 1 takes the
// revolver out (in the hand, the cylinder bottom right); aiming, her torch
// burns one of the shadowed to exposed and the left button puts it down (the
// crosshair marks it); R reloads a round at a time. 3D: the GPU (YUTOPIA_GPU=1).
// Review shots: YUTOPIA_SHOTS=<dir>.

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const pockets = (page: Page) =>
  page.evaluate(() => {
    const y = (window as any).__yutopia;
    const p = y.room.state.players.get(y.room.sessionId);
    return { gun: p.gun as string, hp: p.hp as number };
  });

test("armed at night: a flare, the revolver out, one burnt and shot down, a reload", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", last3d: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-250, -60));
  await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
  await page.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 20_000 });
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 23 });
    y.room.send("mod:storm", { storm: 0, now: true });
    y.room.send("mod:refill", { kit: true });
    y.tp.yaw = 0;
  });
  await page.waitForTimeout(2500);

  // G: a flare, ahead, burning red
  await page.keyboard.press("KeyG");
  await expect.poll(() => w(page, (y) => y.room.state.flares.size), { timeout: 5000 }).toBe(1);
  await expect(page.locator(".dk-arms .fl .n")).toHaveText("2");
  await page.waitForTimeout(800);
  await shot(page, "arms-flare");

  // 1: the revolver out — in the hand for everyone, the cylinder bottom right
  await page.keyboard.press("Digit1");
  await expect.poll(async () => (await pockets(page)).gun).toBe("revolver");
  await expect(page.locator(".dk-arms .cyl")).toBeVisible();

  // one called up; the torch on; aiming (the right button), the crosshair
  await w(page, (y) => {
    y.room.send("mod:dark", { mode: "normal", spawn: 1 });
    if (!y.room.state.players.get(y.room.sessionId).torch) y.toggleTorch();
  });
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: "right" });
  await expect(page.locator(".dk-cross")).toBeVisible();
  // the crosshair on it (wherever it goes: the camera turned till its ray passes through it —
  // over the shoulder that isn't where the body faces), until it's exposed, then shoot
  const face = () =>
    w(page, (y) => {
      const me = y.walker.where();
      let best: any = null;
      y.room.state.shadows?.forEach((s: any) => {
        if (s.s !== 9 && (!best || Math.hypot(s.x - me.x, s.y - me.y) < Math.hypot(best.x - me.x, best.y - me.y)))
          best = s;
      });
      if (!best) return null;
      const cam = y.tp.camera;
      const e = cam.matrixWorld.elements;
      const fwd = Math.atan2(-e[10], -e[8]);
      const want = Math.atan2(best.y - cam.position.z, best.x - cam.position.x);
      y.tp.yaw += Math.atan2(Math.sin(want - fwd), Math.cos(want - fwd));
      // (and up or down to its chest)
      const dist = Math.hypot(best.x - cam.position.x, best.y - cam.position.z);
      const chest = me.z + 1;
      const elev = Math.asin(Math.max(-1, Math.min(1, -e[9])));
      const wantE = Math.atan2(chest - cam.position.y, dist);
      y.tp.pitch -= wantE - elev;
      return { s: best.s as number, k: best.k as boolean };
    });
  let exposed = false;
  for (let i = 0; i < 120 && !exposed; i++) {
    if (i % 15 === 0) await w(page, (y) => y.room.send("mod:refill", {}));
    const s = await face();
    exposed = s?.s === 7;
    await page.waitForTimeout(100);
  }
  expect(exposed, "burnt to exposed").toBe(true);
  // the left button, twice (a revolver round is 50; it takes 100)
  let killed = false;
  for (let i = 0; i < 12 && !killed; i++) {
    await face();
    await page.waitForTimeout(80);
    await page.mouse.down({ button: "left" });
    await page.mouse.up({ button: "left" });
    if (i === 0) await shot(page, "arms-fire");
    await page.waitForTimeout(450);
    killed = (await w(page, (y) => {
      let k = false;
      y.room.state.shadows?.forEach((s: any) => {
        if (s.k) k = true;
      });
      return k || y.room.state.shadows.size === 0;
    })) as boolean;
  }
  expect(killed, "shot down").toBe(true);
  await shot(page, "arms-killed");
  await page.mouse.up({ button: "right" });

  // R: a reload, a round at a time
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(400);
  await shot(page, "arms-reload");
  await w(page, (y) => {
    y.room.send("mod:hour", { h: null });
    y.toggleTorch();
    y.room.send("arms:draw", { slot: -1 });
  });
});
