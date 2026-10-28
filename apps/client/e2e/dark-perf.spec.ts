/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The dark's frame check (docs/plan/30-the-dark.md, phase 9): on High, in the
// woods at night, the torch on, 20 of the shadowed called up round Ana and 4
// flares burning round her — the frames keep up (≥ 60 fps on the machine's
// GPU: YUTOPIA_GPU=1; the numbers are printed either way). Shot: YUTOPIA_SHOTS.

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());

test("the woods at night on High: 20 shadowed, 4 flares, ≥ 60 fps", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", quality: "high" }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  expect(await w(page, (y) => y.tp.quality ?? "high")).toBe("high");
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-150, -6));
  await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
  await page.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 20_000 });
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 23 });
    y.room.send("mod:storm", { storm: 0, now: true });
    y.room.send("mod:refill", { kit: true });
    y.room.send("mod:dark", { mode: "normal", spawn: 10 });
    y.room.send("mod:dark", { spawn: 10 });
    if (!y.room.state.players.get(y.room.sessionId).torch) y.toggleTorch();
  });
  // the land streamed in, the shadowed out of the dark
  await page.waitForTimeout(5000);
  await expect.poll(() => w(page, (y) => y.room.state.shadows.size), { timeout: 10_000 }).toBeGreaterThanOrEqual(20);

  // 4 flares round her (the kit has 3: a refill for the 4th), each a quarter turn on
  await w(page, (y) => {
    for (let i = 0; i < 3; i++) y.room.send("arms:flare", { yaw: (i * Math.PI) / 2, pitch: 0.35 });
    y.room.send("mod:refill", { kit: true });
    y.room.send("arms:flare", { yaw: Math.PI * 1.5, pitch: 0.35 });
  });
  await expect.poll(() => w(page, (y) => y.room.state.flares.size), { timeout: 5000 }).toBe(4);
  await page.waitForTimeout(1500); // (landed and lit)

  // 6 s of frames (the flares burn 12), kept up and on her feet
  const frames = (await page.evaluate(
    () =>
      new Promise<number[]>((done) => {
        const y = (window as any).__yutopia;
        const out: number[] = [];
        let last = performance.now();
        const t0 = last;
        const heal = setInterval(() => y.room.send("mod:refill", { hp: 100 }), 1000);
        const tick = (t: number) => {
          out.push(t - last);
          last = t;
          if (t - t0 < 6000) requestAnimationFrame(tick);
          else {
            clearInterval(heal);
            done(out.slice(1));
          }
        };
        requestAnimationFrame(tick);
      }),
  )) as number[];
  const seen = (await w(page, (y) => ({ shades: y.room.state.shadows.size, flares: y.room.state.flares.size }))) as {
    shades: number;
    flares: number;
  };
  if (dir) await page.screenshot({ path: `${dir}/dark-perf.png` });
  const sorted = [...frames].sort((a, b) => a - b);
  const fps = (frames.length * 1000) / frames.reduce((a, b) => a + b, 0);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const worst = sorted[sorted.length - 1];
  console.log(
    `[dark-perf] ${fps.toFixed(1)} fps, p95 ${p95.toFixed(1)} ms, worst ${worst.toFixed(1)} ms; ${seen.shades} shadowed, ${seen.flares} flares`,
  );
  expect(seen.shades, "the shadowed still out").toBeGreaterThanOrEqual(20);
  expect(seen.flares, "the flares still burning").toBe(4);
  // (rAF runs at the display's rate: 60 is the cap on a 60 Hz screen)
  expect(fps).toBeGreaterThan(57);
  expect(p95).toBeLessThan(20);

  await w(page, (y) => {
    y.room.send("mod:hour", { h: null });
    y.room.send("mod:dark", { mode: "peaceful" });
    y.toggleTorch();
  });
});
