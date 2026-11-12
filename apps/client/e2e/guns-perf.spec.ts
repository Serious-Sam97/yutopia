/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The guns' frame cost (docs/plan/79-the-guns.md phase 8): Ana on the pond's north shore at night, the
// torch on, on High and on Low — 4 s of frames aimed and still; the AK held down (its rounds, tracers,
// brass, sounds — a magazine and its reload); the Daybreak charged, its ball flying and lighting the place,
// its burst — each against the same view with no gun out, in the same run: the guns cost at most 15%
// more frame time on average (the machine's load moves the absolute numbers: dark-perf.spec.ts, the
// dark's 60 fps, measures those). The machine's GPU: YUTOPIA_GPU=1; printed either way.
const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const gun = (page: Page) => w(page, (y) => y.room.state.players.get(y.room.sessionId).gun as string);
// `ms` of frames: fps, p95, the worst
const frames = async (page: Page, ms: number) => {
  const f = (await page.evaluate(
    (span) =>
      new Promise<number[]>((done) => {
        const out: number[] = [];
        let last = performance.now();
        const t0 = last;
        const tick = (t: number) => {
          out.push(t - last);
          last = t;
          if (t - t0 < span) requestAnimationFrame(tick);
          else done(out.slice(1));
        };
        requestAnimationFrame(tick);
      }),
    ms,
  )) as number[];
  const s = [...f].sort((a, b) => a - b);
  return {
    mean: f.reduce((a, b) => a + b, 0) / f.length,
    fps: (f.length * 1000) / f.reduce((a, b) => a + b, 0),
    p95: s[Math.floor(s.length * 0.95)],
    worst: s[s.length - 1],
  };
};

for (const quality of ["high", "low"] as const)
  test(`the guns' frames on ${quality}: aimed, the AK held down, the Daybreak's ball`, async ({ page }) => {
    test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
    test.setTimeout(180_000);
    await page.addInitScript((q) => {
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", quality: q }));
    }, quality);
    await enter(page, await token(ANA));
    await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
      timeout: 60_000,
    });
    await page.evaluate(() => (window as any).__yutopia.teleport({ x: -240, y: -23, level: 0 }));
    await page.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 30_000 });
    await w(page, (y) => {
      y.room.send("mod:hour", { h: 23 });
      y.room.send("mod:storm", { storm: 0, now: true });
      y.room.send("mod:dark", { mode: "peaceful" });
      y.room.send("mod:refill", { kit: true, ak: true, daybreak: true });
      if (!y.room.state.players.get(y.room.sessionId).torch) y.toggleTorch();
      y.tp.yaw = -Math.PI / 2;
    });
    await page.waitForTimeout(4000);
    await page.mouse.move(640, 400);
    const out: Record<string, { mean: number; fps: number; p95: number; worst: number }> = {};
    // (each gun drawn once first: its model fetched and its shaders compiled — not what's measured)
    for (const key of ["Digit4", "Digit3"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(2500);
    }
    await expect.poll(() => gun(page)).toBe("ak47");
    // (the same view, no gun out: what the rest costs)
    await page.keyboard.press("Digit3");
    await expect.poll(() => gun(page)).toBe("");
    await page.waitForTimeout(1500);
    await w(page, (y) => {
      y.tp.pitch = 0.03;
    });
    out.bare = await frames(page, 4000);
    await page.keyboard.press("Digit3");
    await expect.poll(() => gun(page)).toBe("ak47");
    await page.waitForTimeout(1000);
    await page.mouse.down({ button: "right" });
    await page.waitForTimeout(1000);
    await w(page, (y) => {
      y.tp.pitch = 0.03;
    });
    out.aimed = await frames(page, 4000);
    await page.mouse.down({ button: "left" });
    out.ak = await frames(page, 4000);
    await page.mouse.up({ button: "left" });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(3500);
    await page.keyboard.press("Digit4");
    await expect.poll(() => gun(page)).toBe("daybreak");
    await page.waitForTimeout(1000);
    await page.mouse.down({ button: "right" });
    await page.waitForTimeout(900);
    await w(page, (y) => {
      y.tp.pitch = 0.03;
    });
    await page.mouse.down({ button: "left" });
    await page.mouse.up({ button: "left" });
    out.daybreak = await frames(page, 4000);
    await page.mouse.up({ button: "right" });
    for (const [k, v] of Object.entries(out))
      console.log(
        `[guns-perf ${quality}] ${k}: ${v.fps.toFixed(1)} fps, p95 ${v.p95.toFixed(1)} ms, worst ${v.worst.toFixed(1)} ms`,
      );
    await w(page, (y) => {
      y.room.send("mod:hour", { h: null });
      y.toggleTorch();
    });
    for (const [k, v] of Object.entries(out))
      if (k !== "bare") expect(v.mean / out.bare.mean, `${k} against no gun`).toBeLessThan(1.15);
  });
