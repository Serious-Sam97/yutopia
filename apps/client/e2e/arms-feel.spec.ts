/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The guns' feel (docs/plan/32-the-arms.md, phase 2): Ana by day on the snow,
// the revolver out and aimed — a shot kicks the look up and most of it settles
// back by itself; shots fired fast open the crosshair's ticks; a click a moment
// early still fires; in first person she looks down the sights (the world's
// lens closes in, the crosshair gives way to them); a reload tips the gun up,
// the gate open. Then the double-barrel. 3D: the GPU (YUTOPIA_GPU=1). Review
// shots: YUTOPIA_SHOTS=<dir>.

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const me = (page: Page) =>
  w(page, (y) => {
    const p = y.room.state.players.get(y.room.sessionId);
    const inv = (window as any).__dark?.inv;
    const g = inv?.quick?.find((it: any) => it?.id === p.gun);
    return { gun: p.gun as string, loaded: (g?.loaded ?? -1) as number };
  });
const gap = (page: Page) =>
  page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.querySelector(".dk-cross") as Element).getPropertyValue("--gap")),
  );
const fire = async (page: Page) => {
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
};

test("the feel: kick and settle, the spread, an early click, down the sights, a reload", async ({ page }) => {
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
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-232, -40));
  await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
  await page.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 20_000 });
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 13 });
    y.room.send("mod:storm", { storm: 0, now: true });
    y.room.send("mod:refill", { kit: true });
    y.tp.yaw = 0;
  });
  await page.waitForTimeout(2000);
  await page.keyboard.press("Digit1");
  await expect.poll(async () => (await me(page)).gun).toBe("revolver");
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: "right" });
  await expect(page.locator(".dk-cross")).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "feel-3p-aim");

  // a shot: the look kicks up (pitch > 0 is down), then most of it comes back by itself
  const p0 = (await w(page, (y) => y.tp.pitch)) as number;
  await fire(page);
  await page.waitForTimeout(60);
  const p1 = (await w(page, (y) => y.tp.pitch)) as number;
  await shot(page, "feel-3p-kick");
  await page.waitForTimeout(700);
  const p2 = (await w(page, (y) => y.tp.pitch)) as number;
  expect(p0 - p1).toBeGreaterThan(0.01);
  expect(p0 - p2).toBeGreaterThan(0);
  expect(p0 - p2).toBeLessThan((p0 - p1) * 0.6);
  await expect.poll(async () => (await me(page)).loaded).toBe(5);

  // fired fast, the ticks open; still, they close again
  const g0 = await gap(page);
  for (let i = 0; i < 3; i++) {
    await fire(page);
    await page.waitForTimeout(440);
  }
  const g1 = await gap(page);
  expect(g1).toBeGreaterThan(g0 + 3);
  await page.waitForTimeout(1500);
  expect(await gap(page)).toBeLessThan(g1);

  // a click a moment early (the revolver's 0.42 s not quite up): it still fires, when it's ready
  const n0 = (await me(page)).loaded;
  await fire(page);
  await page.waitForTimeout(340);
  await fire(page);
  await expect.poll(async () => (await me(page)).loaded, { timeout: 3000 }).toBe(n0 - 2);

  // first person: down the sights — the lens closes in, the crosshair gives way to the sights
  // (Y: first person — let go of the aim first, Y aiming is the next weapon)
  await page.mouse.up({ button: "right" });
  await page.keyboard.press("KeyY");
  await expect.poll(() => w(page, (y) => y.tp.mode)).toBe("first");
  await page.mouse.down({ button: "right" });
  await expect.poll(() => w(page, (y) => y.tp.ads), { timeout: 5000 }).toBeGreaterThan(0.9);
  await expect(page.locator(".dk-cross")).toBeHidden();
  expect((await w(page, (y) => y.tp.camera.fov)) as number).toBeLessThan(46);
  await page.waitForTimeout(500);
  await shot(page, "feel-1p-sights");
  await fire(page);
  await page.waitForTimeout(50);
  await shot(page, "feel-1p-kick");

  // a reload, not aiming: the gun tipped up, the gate open
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(500);
  await shot(page, "feel-1p-reload");
  await expect.poll(async () => (await me(page)).loaded, { timeout: 8000 }).toBe(6);

  // the double-barrel, down its rib; a shot shoves harder
  await page.keyboard.press("Digit2");
  await expect.poll(async () => (await me(page)).gun).toBe("shotgun");
  await page.mouse.down({ button: "right" });
  await expect.poll(() => w(page, (y) => y.tp.ads), { timeout: 5000 }).toBeGreaterThan(0.9);
  await page.waitForTimeout(400);
  await shot(page, "feel-1p-shotgun");
  const s0 = (await w(page, (y) => y.tp.pitch)) as number;
  await fire(page);
  await page.waitForTimeout(60);
  expect(s0 - ((await w(page, (y) => y.tp.pitch)) as number)).toBeGreaterThan(0.04);
  await page.mouse.up({ button: "right" });
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(450);
  await shot(page, "feel-1p-shotgun-open");

  // (put away; the clock back)
  await page.keyboard.press("Digit2");
  await w(page, (y) => y.room.send("mod:hour", { h: null }));
});
