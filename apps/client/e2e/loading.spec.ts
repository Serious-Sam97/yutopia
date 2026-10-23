/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page, test } from "@playwright/test";
import { ANA, loaded, token, useWorld } from "./helpers";

// The loading screen (docs/plan/35-the-loading.md): up on entering until the
// world is built, and on every change between iso and 3D; the change between
// third and first person dips to dark. After each, the frames come steadily.
// With the real GPU (headless's software GL makes every frame slow):
// YUTOPIA_GPU=1 npx playwright test loading
if (process.env.YUTOPIA_GPU)
  test.use({
    launchOptions: {
      args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--use-fake-ui-for-media-stream"],
    },
  });

const hud = (page: Page) => page.evaluate(() => (window as any).__hud.get().loading ?? { on: false });

// the worst gap between frames over `ms`, and how many were over 50 ms
async function worstFrame(page: Page, ms: number): Promise<{ worst: number; long: number; frames: number }> {
  return page.evaluate(
    (ms) =>
      new Promise<{ worst: number; long: number; frames: number }>((done) => {
        let last = performance.now();
        let worst = 0;
        let long = 0;
        let frames = 0;
        const end = last + ms;
        const tick = (t: number) => {
          const gap = t - last;
          last = t;
          frames++;
          worst = Math.max(worst, gap);
          if (gap > 50) long++;
          if (t < end) requestAnimationFrame(tick);
          else done({ worst: Math.round(worst), long, frames });
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

test("the loading screen: entering, iso ↔ 3D, third ↔ first", async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await useWorld("demo");
  const warns: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "warning" && m.text().includes("loading cut short")) warns.push(m.text());
    if (m.type() === "error" && m.text().includes("GL_INVALID")) warns.push(m.text());
  });
  await page.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", last3d: "3p" }));
  }, tok);
  const t0 = Date.now();
  await page.goto("/");
  await page.waitForFunction(() => (window as any).__hud?.get().phase === "ready", null, { timeout: 60_000 });
  const ready = Date.now();
  // the screen's still up once connected: the world's being built behind it
  const at = await hud(page);
  await loaded(page);
  const built = Date.now();
  expect(await page.evaluate(() => !!(window as any).__yutopia.tp)).toBe(true);
  const enter = await worstFrame(page, 4000);
  console.log(
    `[loading] enter: connected ${ready - t0} ms, built ${built - ready} ms more (screen up at ready: ${at.on}) · after: ${JSON.stringify(enter)}`,
  );
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { mode: "peaceful" }));

  // to iso: the screen, then iso steady
  await page.keyboard.press("t");
  await page.waitForTimeout(30);
  expect((await hud(page)).on).toBe(true);
  const s1 = Date.now();
  await loaded(page);
  expect(await page.evaluate(() => !!(window as any).__yutopia.tp)).toBe(false);
  const iso = await worstFrame(page, 3000);
  console.log(`[loading] to iso: ${Date.now() - s1} ms · after: ${JSON.stringify(iso)}`);

  // back to 3D: built afresh behind it
  await page.keyboard.press("t");
  await page.waitForTimeout(30);
  expect((await hud(page)).on).toBe(true);
  const s2 = Date.now();
  await loaded(page);
  expect(await page.evaluate(() => !!(window as any).__yutopia.tp)).toBe(true);
  const back = await worstFrame(page, 4000);
  console.log(`[loading] to 3D: ${Date.now() - s2} ms · after: ${JSON.stringify(back)}`);

  // third → first: a dip to dark, no screen
  const probe = worstFrame(page, 2500);
  await page.keyboard.press("y");
  await page.waitForTimeout(60);
  const veil = await page.evaluate(() => (window as any).__yutopia.tp.veil?.style.opacity);
  expect(veil).toBe("1");
  expect((await hud(page)).on).toBe(false);
  await page.waitForFunction(() => (window as any).__yutopia.tp.mode === "first");
  const first = await probe;
  await page.waitForFunction(() => (window as any).__yutopia.tp.veil?.style.opacity === "0");
  console.log(`[loading] to first person: ${JSON.stringify(first)}`);
  const probe2 = worstFrame(page, 2500);
  await page.keyboard.press("y");
  await page.waitForFunction(() => (window as any).__yutopia.tp.mode !== "first");
  console.log(`[loading] back to third: ${JSON.stringify(await probe2)}`);
  expect(warns, warns.join("\n")).toEqual([]);
});
