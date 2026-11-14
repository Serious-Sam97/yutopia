/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The fight with Vortex's frame cost (docs/plan/88-vortex-fight.md phase 6): Ana alone in the studio's lobby by day
// — her frames over 5 s with no fight, in act I (his cassette up), and in act III (the lights out, the shadowed he
// let in, two clones of him, the music) — what act III adds kept small. One page only: a second browser's 3D view
// stalls this one's frames (e2e-two-browser-frames). 3D: the GPU (YUTOPIA_GPU=1).
const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
// rAF intervals over `ms`: their mean and 95th percentile
const frames = (page: Page, ms = 5000) =>
  page.evaluate(
    (span) =>
      new Promise<{ mean: number; p95: number; n: number }>((done) => {
        const d: number[] = [];
        let last = performance.now();
        const end = last + span;
        const tick = (t: number) => {
          d.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(tick);
          else {
            const s = [...d].sort((a, b) => a - b);
            done({
              mean: d.reduce((a, b) => a + b, 0) / d.length,
              p95: s[Math.floor(s.length * 0.95)],
              n: d.length,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

test("the fight with Vortex's frame cost: none, act I, act III", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const v = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...v, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 90_000,
  });
  const home = (await w(page, (y) => y.homeFloor())) as number;
  await page.evaluate((l) => (window as any).__yutopia.teleport({ x: 8.5, y: 26.5, level: l }), home);
  await page.waitForFunction((l) => (window as any).__yutopia.level === l, home, { timeout: 30_000 });
  await page.waitForFunction(() => !!(window as any).__dark?.vxf, null, { timeout: 60_000 });
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 12 });
    y.room.send("mod:refill", { kit: true });
    y.room.send("mod:vortex", { reset: true, forget: true, hold: true, at: { x: 12.5, y: 26.5 } });
    y.tp.yaw = 0;
    y.tp.pitch = 0.08;
  });
  await page.waitForTimeout(4000);
  const none = await frames(page);

  // act I: her shot, his cassette up
  await page.keyboard.press("Digit2");
  await expect
    .poll(() => w(page, (y) => y.room.state.players.get(y.room.sessionId).gun), { timeout: 10_000 })
    .toBe("revolver");
  await w(page, (y) => {
    y.tp.yaw = 0;
    y.tp.pitch = 0.08;
  });
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(1200);
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
  await page.mouse.up({ button: "right" });
  await expect.poll(() => w(page, (y) => y.room.state.npcs.get("vortex").vk), { timeout: 8000 }).toBeLessThan(1);
  await page.waitForTimeout(1000);
  const act1 = await frames(page);

  // act III: the lights out, the shadowed (and his clones) in — her torch on
  await page.keyboard.press("Digit1");
  await w(page, (y) => y.room.send("mod:vortex", { act: 3 }));
  await expect.poll(() => w(page, (y) => y.tp.studioDark), { timeout: 8000 }).toBeGreaterThan(0.95);
  await w(page, (y) => y.room.send("mod:vortex", { move: "clones" }));
  await expect
    .poll(() => page.evaluate(() => (window as any).__dark.vxf.shadeBodies().length), { timeout: 8000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  const act3 = await frames(page);
  console.log(
    `frames (ms) — none ${none.mean.toFixed(1)} / p95 ${none.p95.toFixed(1)} · act I ${act1.mean.toFixed(1)} / ${act1.p95.toFixed(1)} · act III ${act3.mean.toFixed(1)} / ${act3.p95.toFixed(1)}`,
  );
  // (what act III adds: kept small — within a few ms of act I's)
  expect(act3.mean).toBeLessThan(act1.mean * 1.35 + 3);
  await w(page, (y) => y.room.send("mod:vortex", { reset: true, forget: true, hold: false }));
});
