/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { test } from "@playwright/test";
import { ANA, enter, spaceId, token } from "./helpers";

// Frame time over the Tracking Room (run the bot swarm first for a crowd).
// Off by default: YUTOPIA_PERF=1 npx playwright test frame-time
// YUTOPIA_PERF=box measures the old box art (same renderer, for an A/B).
const MODE = process.env.YUTOPIA_PERF;
test.skip(!MODE, "set YUTOPIA_PERF=1 (or =box) to measure frame time");

test("frame time over the Tracking Room", async ({ page }) => {
  test.setTimeout(120_000);
  const tok = await token(ANA);
  await page.addInitScript((box) => localStorage.setItem("yutopia:boxart", box ? "1" : "0"), MODE === "box");
  await enter(page, tok, await spaceId(tok));
  // YUTOPIA_PERF_HOUR=23 measures the night (lights, emissive layer, bloom)
  await page.evaluate(
    (hour) => {
      const c = (window as any).__yutopia;
      c.engine.pinCamera({ x: 12, y: 9, zoom: 1.15 });
      if (hour !== null) {
        c.updateNight = () => {};
        c.engine.setClock(hour);
      }
    },
    process.env.YUTOPIA_PERF_HOUR ? Number(process.env.YUTOPIA_PERF_HOUR) : null,
  );
  await page.waitForTimeout(3000);
  const r = await page.evaluate(
    () =>
      new Promise<{ median: number; p95: number; stats: unknown }>((done) => {
        // time spent rendering each frame (headless caps the frame rate, so the
        // interval says nothing; with software GL the render call includes raster)
        const e = (window as any).__yutopia.engine;
        const r = e.app.renderer;
        const render = r.render.bind(r);
        const t: number[] = [];
        r.render = (...a: unknown[]) => {
          const t0 = performance.now();
          render(...a);
          r.gl?.finish?.();
          t.push(performance.now() - t0);
        };
        setTimeout(() => {
          r.render = render;
          t.sort((a, b) => a - b);
          done({ median: t[Math.floor(t.length / 2)], p95: t[Math.floor(t.length * 0.95)], stats: e.stats() });
        }, 8000);
      }),
  );
  console.log(
    `[frame-time] ${MODE}: median ${r.median.toFixed(1)} ms · p95 ${r.p95.toFixed(1)} ms ·`,
    JSON.stringify(r.stats),
  );
});
