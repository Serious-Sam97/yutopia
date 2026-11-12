/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The guns' feel (docs/plan/32-the-arms.md, phase 2): Ana by day on the snow,
// the revolver out and aimed — a shot kicks the look up and most of it settles
// back by itself; shots fired fast open the crosshair's ticks; a click a moment
// early still fires; in first person a gun out goes over her shoulder (guns are
// third person: docs/plan/79-the-guns.md F3a), the camera tight there and closer
// still aimed; a reload tips the gun up. Then the double-barrel; the AK's burst and climb (plan 79 phase
// 5); the sniper's scope and bolt (phase 6). 3D: the GPU (YUTOPIA_GPU=1). Review
// shots: YUTOPIA_SHOTS=<dir>.

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, y: number) => ({ x, y });
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

test("the feel: kick and settle, the spread, an early click, over the shoulder, a reload", async ({ page }) => {
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
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-232, -40));
  await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
  await page.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 20_000 });
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 13 });
    y.room.send("mod:storm", { storm: 0, now: true });
    y.room.send("mod:refill", { kit: true, ak: true, sniper: true });
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
  // the misplaced sight (plan 79): something between the muzzle and what the crosshair is on — the
  // reticle goes there and says it's blocked (the muzzle's line made to stop a metre out); clear again
  await page.evaluate(() => {
    const pp = (window as any).__yutopia.tp.pointerPart;
    pp.__rayStop = pp.rayStop;
    pp.rayStop = (...a: unknown[]) => ((a[5] as number) > 1.2 ? { t: 1, what: "wall" } : pp.__rayStop(...a));
  });
  await expect(page.locator(".dk-cross.blocked")).toBeVisible({ timeout: 2000 });
  const moved = await page.evaluate(() => (document.querySelector(".dk-cross") as HTMLElement).style.transform);
  expect(moved, "the reticle moved to where it'd stop").toMatch(/translate\(/);
  await page.evaluate(() => {
    const pp = (window as any).__yutopia.tp.pointerPart;
    pp.rayStop = pp.__rayStop;
  });
  await expect(page.locator(".dk-cross.blocked")).toHaveCount(0, { timeout: 2000 });

  // the guns' recorded sounds (plan 79 phase 9): all of them decoded once a gun's out — before its first
  // shot is over
  // (the page's audio is resumed by the clicks; the headless one may stay suspended — then it's said)
  const sounds = () =>
    page.evaluate(() => {
      const v = (window as any).__dark?.voices;
      return { n: v?.recorded?.size ?? -1, ctx: v?.mixer?.ctx?.state ?? "none" };
    }) as Promise<{ n: number; ctx: string }>;

  // a shot: the look kicks up (pitch > 0 is down), then most of it comes back by itself
  const p0 = (await w(page, (y) => y.tp.pitch)) as number;
  await fire(page);
  await page.waitForTimeout(60);
  const p1 = (await w(page, (y) => y.tp.pitch)) as number;
  await shot(page, "feel-3p-kick");
  await page.waitForTimeout(700);
  const p2 = (await w(page, (y) => y.tp.pitch)) as number;
  // (a small kick on the look since plan 79: the gun in the hands takes the most of it)
  expect(p0 - p1).toBeGreaterThan(0.004);
  expect(p0 - p2).toBeGreaterThan(0);
  expect(p0 - p2).toBeLessThan((p0 - p1) * 0.6);
  await expect.poll(async () => (await me(page)).loaded).toBe(5);
  await page.waitForTimeout(800);
  const heard = await sounds();
  if (heard.ctx === "running") expect(heard.n, "the guns' recordings decoded").toBe(43);
  else console.log(`[arms-feel] audio ${heard.ctx}: the recordings not checked`);

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

  // first person (Y): a gun out stays over the shoulder — guns are third person (plan 79 F3a);
  // the camera in tight, closer aimed (let go of the aim first: Y aiming is the next weapon)
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(600);
  const camTo = () =>
    w(page, (y) => {
      const c = y.tp.camera.position;
      const t = y.walker.where();
      return Math.hypot(c.x - t.x, c.z - t.y);
    }) as Promise<number>;
  const ready = await camTo();
  expect(ready, "a gun out: the camera tight over the shoulder").toBeLessThan(2.1);
  await page.keyboard.press("KeyY");
  await page.waitForTimeout(400);
  expect(await w(page, (y) => y.tp.mode)).toBe("chase");
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(600);
  expect(await camTo(), "aimed: closer still").toBeLessThan(ready - 0.3);
  await expect(page.locator(".dk-cross")).toBeVisible();
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
  await page.waitForTimeout(600);
  await shot(page, "feel-1p-shotgun");
  const s0 = (await w(page, (y) => y.tp.pitch)) as number;
  await fire(page);
  await page.waitForTimeout(60);
  // (the look takes a smaller share of the kick since plan 79 — the gun in the hands the rest: ~0.03–0.04
  // rad left 60 ms on, by its random part; the revolver's ~0.01)
  expect(s0 - ((await w(page, (y) => y.tp.pitch)) as number)).toBeGreaterThan(0.02);
  await page.mouse.up({ button: "right" });
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(450);
  await shot(page, "feel-1p-shotgun-open");

  // the AK (plan 79 phase 5): held down, it fires at its rate (10 a second) and the look climbs — more
  // than one shot's kick, most of it staying; let go, a burst's over; dry, R: a magazine, thirty
  await page.keyboard.press("Digit3");
  await expect.poll(async () => (await me(page)).gun).toBe("ak47");
  await page.waitForTimeout(700);
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(600);
  const a0 = (await w(page, (y) => y.tp.pitch)) as number;
  await page.mouse.down({ button: "left" });
  await page.waitForTimeout(1000);
  await page.mouse.up({ button: "left" });
  await shot(page, "feel-ak-burst");
  const a1 = (await w(page, (y) => y.tp.pitch)) as number;
  await expect.poll(async () => (await me(page)).loaded, { timeout: 2000 }).toBeLessThan(23);
  const left = (await me(page)).loaded;
  expect(left, "a second held: ten rounds or so").toBeGreaterThan(17);
  expect(a0 - a1, "the climb: more than a revolver shot's kick").toBeGreaterThan(0.03);
  await page.waitForTimeout(500);
  expect((await me(page)).loaded, "let go: no more").toBe(left);
  await page.mouse.up({ button: "right" });
  await page.keyboard.press("KeyR");
  await expect.poll(async () => (await me(page)).loaded, { timeout: 5000 }).toBe(30);

  // the sniper (plan 79 phase 6): aimed its moment, down the scope — the glass and its ring, the lens
  // narrow; the wheel, 8×; a shot: out of it for the bolt, back in once it's home; R: a round at a time
  await page.keyboard.press("Digit4");
  await expect.poll(async () => (await me(page)).gun).toBe("sniper");
  await page.waitForTimeout(800);
  await page.mouse.down({ button: "right" });
  await expect.poll(() => w(page, (y) => y.tp.scopeK), { timeout: 3000 }).toBeGreaterThan(0.9);
  await expect(page.locator(".dk-scope.on")).toBeVisible();
  await expect(page.locator(".dk-cross")).toBeHidden();
  await page.waitForTimeout(300);
  const fov4 = (await w(page, (y) => y.tp.camera.fov)) as number;
  expect(fov4, "4×").toBeLessThan(15);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => w(page, (y) => y.tp.camera.fov), { timeout: 2000 }).toBeLessThan(fov4 * 0.6);
  await shot(page, "feel-sniper-scope");
  await fire(page);
  await expect.poll(async () => (await me(page)).loaded).toBe(4);
  await expect.poll(() => w(page, (y) => y.tp.scopeK), { timeout: 1000 }).toBeLessThan(0.2);
  await expect.poll(() => w(page, (y) => y.tp.scopeK), { timeout: 3000 }).toBeGreaterThan(0.9);
  await page.mouse.up({ button: "right" });
  await page.keyboard.press("KeyR");
  await expect.poll(async () => (await me(page)).loaded, { timeout: 4000 }).toBe(5);
  await page.keyboard.press("Digit4");
  await page.keyboard.press("Digit2");
  await expect.poll(async () => (await me(page)).gun).toBe("shotgun");

  // (put away: first person again; the view back to third; the clock back)
  await page.keyboard.press("Digit2");
  await expect.poll(() => w(page, (y) => y.tp.mode), { timeout: 5000 }).toBe("first");
  await page.keyboard.press("KeyY");
  await w(page, (y) => y.room.send("mod:hour", { h: null }));
});
