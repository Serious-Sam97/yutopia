/* biome-ignore-all lint/suspicious/noExplicitAny: reads the page's test hooks */
import { expect, type Page, test } from "@playwright/test";

// Fixed camera shots of the Studio (offline, clock frozen), compared to
// baselines with a small pixel-diff threshold; then the budgets.

const ROOMS: [string, number, number, number][] = [
  ["tracking", 12, 9, 1.15],
  ["standup", 22.5, 15.5, 1.5],
  ["war-room", 37, 5.5, 1.2],
  ["booths", 37.5, 16, 1.3],
  ["lobby", 6.5, 27.5, 1.3],
  ["lounge", 19, 27.5, 1.3],
  ["live-room", 33, 27.5, 1.2],
  ["server-room", 44, 27.5, 1.5],
];

async function open(page: Page, q: Record<string, string | number>) {
  const qs = new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]));
  await page.goto(`/dev/shots?${qs}`);
  // the dev server's badge isn't part of the picture
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForFunction(() => (window as any).__shots?.settled(), null, { timeout: 90_000 });
  // a few frames so every sprite is on screen
  await page.waitForTimeout(400);
}

for (const [name, x, y, zoom] of ROOMS)
  for (const [when, hour] of [
    ["day", 12],
    ["night", 23],
  ] as const)
    test(`room ${name} · ${when}`, async ({ page }) => {
      await open(page, { x, y, zoom, hour, quality: "high" });
      await expect(page).toHaveScreenshot(`room-${name}-${when}.png`);
    });

for (const [when, hour] of [
  ["noon", 12],
  ["night", 23],
] as const)
  test(`campus · ${when}`, async ({ page }) => {
    await open(page, { x: 24, y: 18, zoom: 0.55, hour, quality: "high" });
    await expect(page).toHaveScreenshot(`campus-${when}.png`);
  });

for (const quality of ["medium", "low"])
  test(`quality ${quality}`, async ({ page }) => {
    await open(page, { x: 12, y: 9, zoom: 1.15, hour: 19.2, quality });
    await expect(page).toHaveScreenshot(`quality-${quality}.png`);
  });

// Budgets on High with 50 people in the Tracking Room. Logic and memory are
// strict everywhere. Render time depends on the GPU: CI renders with a
// software GPU (SwiftShader), where any off-screen pass (the night bloom) costs
// ~40 ms whatever its size — so there the render budget is checked by day (no
// off-screen passes), and on a real GPU at night with bloom, against 60 fps.
async function measure(page: Page) {
  return (await page.evaluate(() => {
    const e = (window as any).__shots.engine;
    const logic: number[] = [];
    for (let i = 0; i < 240; i++) {
      const t0 = performance.now();
      e.update(1 / 60);
      logic.push(performance.now() - t0);
    }
    const render: number[] = [];
    const rr = e.app.renderer;
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now();
      rr.render({ container: e.app.stage });
      rr.gl?.finish?.();
      render.push(performance.now() - t0);
    }
    const gl = rr.gl as WebGL2RenderingContext;
    const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
    const gpu = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "");
    const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
    return {
      gpu,
      textureMB: e.textureMB(),
      logic: q(logic, 0.5),
      logicP95: q(logic, 0.95),
      render: q(render, 0.5),
      renderP95: q(render, 0.95),
    };
  })) as { gpu: string; textureMB: number; logic: number; logicP95: number; render: number; renderP95: number };
}

test("budgets: texture memory, logic and render time with 50 people", async ({ page }) => {
  const at = { x: 12, y: 9, zoom: 1.15, quality: "high", crowd: 50 };
  await open(page, { ...at, hour: 23 });
  const night = await measure(page);
  const software = /swiftshader/i.test(night.gpu);
  const log = (w: string, r: typeof night) =>
    console.log(
      `[budgets] ${w}${software ? " (software GPU)" : ""}: textures ${r.textureMB} MB · logic ${r.logic.toFixed(2)} ms (p95 ${r.logicP95.toFixed(2)}) · render ${r.render.toFixed(1)} ms (p95 ${r.renderP95.toFixed(1)})`,
    );
  log("night", night);
  expect(night.textureMB, "texture memory (MB)").toBeLessThanOrEqual(192);
  expect(night.logic, "world logic per frame, median (ms)").toBeLessThanOrEqual(4);
  if (!software) {
    expect(night.renderP95, "render per frame at night with bloom, p95 (ms)").toBeLessThanOrEqual(16.7);
    return;
  }
  await open(page, { ...at, hour: 12 });
  const day = await measure(page);
  log("day", day);
  expect(day.renderP95, "render per frame by day, p95, software GPU (ms)").toBeLessThanOrEqual(25);
});
