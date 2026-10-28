/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// Plan 50's first ask (docs/plan/50-the-volume.md, phase 3): in 3D my body moves on Jolt — walking
// north into the company's fence (1.2 m) it stops me; flying at 2 m and more I go over it; the
// server takes every step (never puts me back). 3D: the GPU (YUTOPIA_GPU=1).

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
// (the ground floor's coords are the building's less GROUND_OFFSET; the fence runs along z −360)
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const FENCE_Y = G(0, -360).y;

const me = (page: Page) =>
  page.evaluate(() => {
    const b = (window as any).__yutopia.walker.body;
    return { x: b.x as number, y: b.y as number, z: b.z as number, up: b.up as boolean };
  });

test("the fence: walked into, it stops you; flown over at 2 m, you pass — the server agrees", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  // inside the fence, 3 m from it, facing north (−y); my powers off
  await page.evaluate(() => {
    const r = (window as any).__yutopia.room;
    for (const k of ["fly", "clip", "fast", "hidden"]) r.send("mod:power", { power: k, on: false });
  });
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(0.5, -357));
  await page.waitForTimeout(5000);
  // (moving on Jolt: the browser's physics world is in, my body on it)
  await page.waitForFunction(
    () => {
      const w = (window as any).__yutopia;
      return !!w.tp.physicsBody(null, w.level, false, w.grid);
    },
    null,
    { timeout: 30_000 },
  );
  await page.evaluate(() => {
    const w = window as any;
    w.__yutopia.tp.yaw = -Math.PI / 2;
    w.__snaps = 0;
    w.__yutopia.room.onMessage("snap", () => w.__snaps++);
  });

  // walking into it: stopped short of it
  await page.keyboard.down("w");
  await page.waitForTimeout(3500);
  await page.keyboard.up("w");
  await page.waitForTimeout(500);
  const walked = await me(page);
  expect(walked.y, "stopped at the fence").toBeGreaterThan(FENCE_Y);
  expect(walked.y, "up against it").toBeLessThan(FENCE_Y + 1);

  // flying: up past 2 m, then on north over it
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:power", { power: "fly", on: true }));
  await page.waitForTimeout(800);
  await page.keyboard.down("Space");
  await expect.poll(async () => (await me(page)).z, { timeout: 10_000 }).toBeGreaterThan(walked.z + 2.3);
  await page.keyboard.up("Space");
  await page.keyboard.down("w");
  await page.waitForTimeout(2500);
  await page.keyboard.up("w");
  const flown = await me(page);
  expect(flown.y, "over it, on the far side").toBeLessThan(FENCE_Y - 2);
  // the server took every step
  await page.waitForTimeout(800);
  const server = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    return w.room.state.players.get(w.room.sessionId).y as number;
  });
  expect(server, "the server has me over it too").toBeLessThan(FENCE_Y - 2);
  expect(await page.evaluate(() => (window as any).__snaps), "never put back").toBe(0);
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:power", { power: "fly", on: false }));
});
