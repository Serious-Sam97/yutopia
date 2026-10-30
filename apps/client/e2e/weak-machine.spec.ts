/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// 3D on a weak machine (docs/plan/50-the-volume.md, phase 8): a page that says it has 2 cores and
// 2 GB, so Auto picks the Lowest tier, its CPU slowed 4× (Chrome's devtools). Frames measured in
// the studio, out on the Grounds and in the town. With YUTOPIA_GPU=1 the machine's GPU; without,
// Chrome's software GL — a weak GPU's stand-in. The numbers are logged; what's held: the tier, and
// the median frame.
const GPU = process.env.YUTOPIA_GPU === "1";
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
// how much slower the CPU (YUTOPIA_SLOW=1: as it is, to compare)
const SLOW = Number(process.env.YUTOPIA_SLOW ?? 4);

async function frames(page: Page, secs: number) {
  const gaps = (await page.evaluate(
    (ms) =>
      new Promise<number[]>((done) => {
        const out: number[] = [];
        let last = performance.now();
        const t0 = last;
        const f = (t: number) => {
          out.push(t - last);
          last = t;
          if (t - t0 < ms) requestAnimationFrame(f);
          else done(out);
        };
        requestAnimationFrame(f);
      }),
    secs * 1000,
  )) as number[];
  const s = [...gaps].sort((a, b) => a - b);
  const q = (k: number) => s[Math.min(s.length - 1, Math.floor(k * s.length))];
  return { median: q(0.5), p95: q(0.95), worst: s[s.length - 1], n: s.length };
}

test("a weak machine: the Lowest tier, and frames it can live with", async ({ page }) => {
  test.setTimeout(480_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 2 });
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", quality: "auto" }));
  });
  await enter(page, await token(ANA));
  // (enter() holds every spec to High — Auto steps down in a headless browser — so Auto again, after
  // its own, and in once more)
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? "{}"), quality: "auto" }));
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__hud?.get().phase === "ready", null, { timeout: 120_000 });
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 120_000 });
  expect(await page.evaluate(() => (window as any).__yutopia.tp.quality), "Auto picks the Lowest tier").toBe("lowest");
  await page.evaluate(() => {
    const r = (window as any).__yutopia.room;
    for (const k of ["fly", "clip", "fast", "hidden"]) r.send("mod:power", { power: k, on: false });
    r.send("mod:hour", { h: 13 });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: SLOW });
  const out: Record<string, Awaited<ReturnType<typeof frames>>> = {};
  const stages: Record<string, string> = {};
  for (const [name, to] of [
    ["the studio", { x: 20.5, y: 18.5, level: 4 }],
    ["the Grounds", { ...G(-232, -44), level: 0 }],
    ["the town", { ...G(440, -405), level: 0 }],
  ] as const) {
    await page.evaluate((p) => (window as any).__yutopia.teleport(p), to);
    await expect.poll(() => page.evaluate(() => (window as any).__yutopia.level), { timeout: 30_000 }).toBe(to.level);
    // (what's there built and its shaders compiled first)
    await page.waitForTimeout(12_000);
    // walking: the view, the people and the land on the move
    await page.keyboard.down("w");
    await page.evaluate(() => (window as any).__yutopia.perf(true));
    out[name] = await frames(page, 6);
    // (where the main thread's time went: the controller's stages, as Settings' frame stats show)
    stages[name] = await page.evaluate(async () => {
      const r = await (window as any).__yutopia.perf();
      const top = Object.entries(r.stages as Record<string, { avg: number }>)
        .sort((a, b) => b[1].avg - a[1].avg)
        .slice(0, 4)
        .map(([k, v]) => `${k} ${v.avg.toFixed(1)}`);
      return `frame ${r.frame.avg.toFixed(1)} ms: ${top.join(", ")}`;
    });
    await page.keyboard.up("w");
  }
  // Flowmotion slowed down too (docs/plan/56-the-controls.md phase 8): up the town's 4.2 m house and
  // over its roof's step, the frames as she goes — the move's steps are the clock's, not the frames'
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), { ...G(397, -463.5), level: 0 });
  await page.waitForTimeout(12_000);
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    w.walker.body.yaw = 0;
    w.tp.yaw = 0;
  });
  await page.waitForTimeout(500);
  const z0 = await page.evaluate(() => (window as any).__yutopia.walker.body.z as number);
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  out["Flowmotion: up and over"] = await frames(page, 3);
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  await page.waitForTimeout(1500);
  const rose = (await page.evaluate(() => (window as any).__yutopia.walker.body.z as number)) - z0;
  expect(rose, "up on the roof, slowed down as it is").toBeGreaterThan(4);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  for (const [name, f] of Object.entries(out))
    console.log(
      `[weak ${GPU ? "GPU" : "software GL"}, CPU ÷${SLOW}] ${name}: median ${f.median.toFixed(1)} ms · p95 ${f.p95.toFixed(1)} · worst ${f.worst.toFixed(0)} (${f.n} frames)${stages[name] ? ` · ${stages[name]}` : ""}`,
    );
  expect(await page.evaluate(() => (window as any).__yutopia.tp.quality), "still Lowest (no lower)").toBe("lowest");
  // (on a real GPU, a CPU a quarter of this one's: 15 fps at the least, everywhere — software GL is
  // only logged, far slower than any real GPU)
  if (GPU) for (const [name, f] of Object.entries(out)) expect(f.median, name).toBeLessThan(1000 / 15 + 1);
});
