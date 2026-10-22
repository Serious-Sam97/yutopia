/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// Out of ammo (docs/plan/32-the-arms.md): nothing left in the pockets, R does
// nothing — no reload going round for ever (the HUD's cylinder or shells not
// spinning, the gun not held up to load), the spare count red; the revolver,
// then the double-barrel. 3D: the GPU (YUTOPIA_GPU=1).

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const loaded = (page: Page) =>
  page.evaluate(() => {
    const y = (window as any).__yutopia;
    const p = y.room.state.players.get(y.room.sessionId);
    const g = (window as any).__dark?.inv?.quick?.find((it: any) => it?.id === p.gun);
    return (g?.loaded ?? -1) as number;
  });
// every stack of `id` in the pockets dropped on the snow
const dropAll = (page: Page, id: string) =>
  page.evaluate((what) => {
    const y = (window as any).__yutopia;
    const inv = (window as any).__dark?.inv;
    inv?.pockets?.forEach((s: any, i: number) => {
      if (s?.id === what) y.room.send("dark:drop", { slot: i });
    });
  }, id);
const fire = async (page: Page) => {
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
};

test("out of ammo: R does nothing, nothing spins for ever, the spare count red", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(120_000);
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
  await page.waitForFunction(() => !!(window as any).__dark?.inv, null, { timeout: 30_000 });
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 13 });
    y.room.send("mod:refill", { kit: true });
  });
  await expect.poll(() => page.evaluate(() => (window as any).__dark?.inv?.quick?.[0]?.id)).toBe("revolver");
  await dropAll(page, "r38");
  await dropAll(page, "shell");
  await expect
    .poll(() =>
      page.evaluate(() =>
        ((window as any).__dark?.inv?.pockets ?? []).some((s: any) => s?.id === "r38" || s?.id === "shell"),
      ),
    )
    .toBe(false);

  for (const [key, gun, shots, rate] of [
    ["Digit1", "revolver", 3, 470],
    ["Digit2", "shotgun", 2, 1000],
  ] as const) {
    await page.keyboard.press(key);
    await expect.poll(() => w(page, (y) => y.room.state.players.get(y.room.sessionId).gun)).toBe(gun);
    await page.mouse.move(640, 400);
    await page.mouse.down({ button: "right" });
    await page.waitForTimeout(600);
    const n0 = await loaded(page);
    for (let i = 0; i < shots; i++) {
      await fire(page);
      await page.waitForTimeout(rate);
    }
    await expect.poll(() => loaded(page)).toBe(n0 - shots);
    await page.mouse.up({ button: "right" });
    // R with nothing to load: nothing happens, and nothing keeps going
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(900);
    await expect(page.locator(".dk-arms .re")).toHaveCount(0);
    await expect(page.locator(".dk-arms .spare.out")).toHaveCount(1);
    expect((await w(page, (y) => y.tp.myGun?.reload ?? 0)) as number).toBeLessThan(0.3);
    expect(await w(page, (y) => y.room.state.players.get(y.room.sessionId).arm)).toBe(0);
    expect(await loaded(page)).toBe(n0 - shots);
  }

  // (armed again, the clock back)
  await w(page, (y) => {
    y.room.send("mod:refill", { kit: true });
    y.room.send("mod:hour", { h: null });
  });
  await page.keyboard.press("Digit2");
});
