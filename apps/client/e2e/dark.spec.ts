/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The dark, phase 2 (docs/plan/30-the-dark.md): out on the land a sprint drains
// stamina — mine (the walker's) and the server's together — until I'm out of
// breath: the sprint becomes a jog, the arc by my body turns amber, and the
// server never puts me back. Then a search at a townhouse's door says what was
// there, and Tab shows the pockets. Iso (no GPU needed). It needs only the
// building and the Grounds (every world has them), so no fixture is put back.

// the ground floor's corner is at (-60, -10) in the building's coords
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
// review shots: YUTOPIA_SHOTS=<dir>; the 3D view: YUTOPIA_VIEW=3p (with the GPU: YUTOPIA_GPU=1)
const dir = process.env.YUTOPIA_SHOTS;
const VIEW = process.env.YUTOPIA_VIEW === "3p" ? "3p" : "iso";
if (process.env.YUTOPIA_GPU === "1")
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};

const goTo = async (page: Page, at: { x: number; y: number }) => {
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at);
  await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
  await page.waitForTimeout(2500);
};
const breath = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    const p = w.room.state.players.get(w.room.sessionId);
    return {
      st: w.walker.vitals.st as number,
      winded: w.walker.breath.winded as boolean,
      server: p.st as number,
      gait: w.walker.body.gait as string,
      dark: !!document.querySelector(".dk"),
    };
  });

test("a sprint across the pond: out of breath, a jog; a search; the pockets", async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript((view) => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view, cam3p: "chase" }));
  }, VIEW);
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.walker, null, { timeout: 60_000 });
  // the pond's north-east shore, on the ice; W goes up the screen: north-west, across it
  await goTo(page, G(-214, -34));
  await page.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 20_000 });
  // (3D: the camera looking north-west too, so W goes across the ice as in iso)
  await page.evaluate(() => {
    const tp = (window as any).__yutopia.tp;
    if (tp) tp.yaw = Math.atan2(-1, -1);
  });
  await page.evaluate(() => {
    const w = window as any;
    w.__snaps = 0;
    w.__yutopia.room.onMessage("snap", () => w.__snaps++);
    // the server's stamina at its lowest (sampled every frame)
    w.__minSt = 100;
    const low = () => {
      const y = w.__yutopia;
      w.__minSt = Math.min(w.__minSt, y.room.state.players.get(y.room.sessionId).st);
      requestAnimationFrame(low);
    };
    requestAnimationFrame(low);
  });
  expect((await breath(page)).st).toBe(100);
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  await page.waitForFunction(() => (window as any).__yutopia.walker.breath.winded, null, { timeout: 12_000 });
  const out = await breath(page);
  expect(out.st).toBe(0);
  // still holding Shift: a jog now, the arc amber with its words
  await page.waitForTimeout(300);
  expect((await breath(page)).gait).not.toBe("sprint");
  await expect(page.locator(".dk-arc-l")).toBeVisible();
  await shot(page, "dark-winded");
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
  // the server counted it too (a tick's drain either side of mine)
  await page.waitForFunction(() => (window as any).__minSt <= 2, null, { timeout: 3000 });
  expect(await page.evaluate(() => (window as any).__snaps), "never put back").toBe(0);
  // breath back
  await page.waitForFunction(() => !(window as any).__yutopia.walker.breath.winded, null, { timeout: 5000 });
  await expect(page.locator(".dk-arc-l")).toBeHidden();

  // a townhouse's door on Church Street (house-w0: x 404–414, its door on the east)
  await goTo(page, G(415, -444));
  await expect(page.locator(".dk-prompt", { hasText: /Front door|Porta da casa/ })).toBeVisible();
  await page.keyboard.press("KeyE");
  await expect(page.locator(".dk-toast")).toBeVisible({ timeout: 5000 });
  await shot(page, "dark-search");
  // Tab: the pockets
  await page.keyboard.down("Tab");
  await expect(page.locator(".dk-strip")).toBeVisible();
  await expect(page.locator(".dk-strip .dk-slot")).toHaveCount(10);
  await shot(page, "dark-pockets");
  await page.keyboard.up("Tab");
  await expect(page.locator(".dk-strip")).toBeHidden();
});
