/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { writeFileSync } from "node:fs";
import type { BrowserContext, CDPSession, Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// Where the time goes (docs/plan/38-the-lag.md): the same scenarios measured before and
// after each phase, on the machine's GPU (YUTOPIA_GPU=1), at 2× like a laptop's screen,
// on High. Per scenario: the main thread's busy share from Chrome itself (every task:
// scripts, GC, layout, the other loops), the controller's frame stages
// (`__yutopia.perf()`), the drawn frames' spacing, long tasks, and the 3D draw calls.
//
// It measures the world as it is — no fixture is put back (the dev world is played in).
// It only teleports Ana (and Bia), and switches the shadowed off while it runs (back to
// normal after); the hour is held (YUTOPIA_LAG_HOUR, 13) and the storm off. YUTOPIA_LAG_OUT=<file.json> keeps the numbers; YUTOPIA_LAG=<names>
// runs only those scenarios (comma-separated).

const GPU = process.env.YUTOPIA_GPU === "1";
const OUT = process.env.YUTOPIA_LAG_OUT;
const ONLY = process.env.YUTOPIA_LAG?.split(",");
const SECONDS = Number(process.env.YUTOPIA_LAG_SECONDS ?? 8);
// a CPU profile of each scenario's window, saved there (<name>.cpuprofile: DevTools opens it)
const PROFILE = process.env.YUTOPIA_LAG_PROFILE;
test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
});

const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 }); // (the Grounds' offset, grounds.spec)
const LOT = { ...G(-30, 20), level: 0 };
const LAWN = G(-80, 22);

type View = "3p" | "iso";
const results: Record<string, unknown> = {};

async function open(ctx: BrowserContext, who: typeof ANA, view: View): Promise<Page> {
  const page = await ctx.newPage();
  await page.addInitScript((v) => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(
      k,
      JSON.stringify({
        ...p,
        view: v,
        last3d: v === "iso" ? (p.last3d ?? "3p") : v,
        cam3p: "chase",
        quality: "high",
        maxFps: 60,
        reducedMotion: false,
      }),
    );
  }, view);
  await enter(page, await token(who));
  if (view !== "iso")
    await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
      timeout: 60_000,
    });
  return page;
}

async function goTo(page: Page, at: { x: number; y: number; level: number }) {
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), at);
  await page.waitForFunction(
    (p) => {
      const t = (window as any).__yutopia.meTile();
      return Math.hypot(t.x - p.x, t.y - p.y) < 2;
    },
    at,
    { timeout: 30_000 },
  );
}

// back and forth between where I am and `to` (or a spot a few steps off, found by the
// client's own pathfinding) while the numbers are taken
async function pace(page: Page, to?: { x: number; y: number }) {
  await page.evaluate(async (target) => {
    const c = (window as any).__yutopia;
    const from = c.meTile();
    let there = target;
    if (!there) {
      for (const [dx, dy] of [
        [6, 0],
        [-6, 0],
        [0, 6],
        [0, -6],
        [4, 4],
        [-4, 4],
        [4, -4],
        [-4, -4],
        [3, 0],
        [0, 3],
      ]) {
        c.walkTo({ x: from.x + dx, y: from.y + dy });
        await new Promise((r) => setTimeout(r, 250));
        if (c.path?.length) {
          there = { x: from.x + dx, y: from.y + dy };
          break;
        }
      }
    }
    if (!there) return;
    let goal = there;
    c.walkTo(goal);
    (window as any).__pace = setInterval(() => {
      const t = c.meTile();
      if (Math.hypot(t.x - goal.x, t.y - goal.y) < 1.2 || !c.path?.length) {
        goal = goal === there ? from : there;
        c.walkTo(goal);
      }
    }, 200);
  }, to);
}
const stopPace = (page: Page) => page.evaluate(() => clearInterval((window as any).__pace));

async function cpuNow(cdp: CDPSession) {
  const { metrics } = (await cdp.send("Performance.getMetrics")) as { metrics: { name: string; value: number }[] };
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return {
    task: m.TaskDuration,
    script: m.ScriptDuration,
    layout: m.LayoutDuration,
    style: m.RecalcStyleDuration,
    heap: m.JSHeapUsedSize,
  };
}

// the same hour and weather every run (the world's clock and storm are live): noon, no storm
const HOUR = Number(process.env.YUTOPIA_LAG_HOUR ?? 13);
async function holdClock(page: Page) {
  await page.evaluate((h) => {
    const c = (window as any).__yutopia;
    c.updateNight = () => {};
    if (c.life) c.life.weather = () => [0, 0];
    c.hour = h;
    c.engine?.setClock(h);
    c.tp?.setHour(h);
  }, HOUR);
}

async function measure(name: string, page: Page, seconds = SECONDS) {
  await holdClock(page);
  await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  if (PROFILE) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
  }
  await page.evaluate(() => (window as any).__yutopia.perf(true));
  const a = await cpuNow(cdp);
  const t0 = Date.now();
  await page.waitForTimeout(seconds * 1000);
  const b = await cpuNow(cdp);
  const wall = (Date.now() - t0) / 1000;
  if (PROFILE) {
    const { profile } = (await cdp.send("Profiler.stop")) as { profile: unknown };
    writeFileSync(`${PROFILE}/${name}.cpuprofile`, JSON.stringify(profile));
  }
  const r = (await page.evaluate(async () => {
    const c = (window as any).__yutopia;
    const perf = await c.perf();
    // the 3D frame's draw calls, all its passes (the renderer counts one render() at a time)
    let draw = null;
    if (c.tp) {
      const tp = c.tp;
      const info = tp.renderer.info;
      const fr = tp.frame;
      let frames = 0;
      tp.frame = (...a: unknown[]) => {
        frames++;
        return fr.apply(tp, a);
      };
      info.autoReset = false;
      info.reset();
      await new Promise((res) => setTimeout(res, 600));
      tp.frame = fr;
      draw = {
        calls: Math.round(info.render.calls / Math.max(1, frames)),
        triangles: Math.round(info.render.triangles / Math.max(1, frames)),
      };
      info.autoReset = true;
    }
    // the whole frame stepped by hand, the GPU waited on each time (no vsync, no other loop
    // between): what a frame costs, steadier than the live window
    const gl = c.tp ? c.tp.renderer.getContext() : c.engine.app.renderer.gl;
    const ms: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      c.frame(1 / 60, t0);
      gl.finish();
      if (i >= 10) ms.push(performance.now() - t0);
    }
    ms.sort((a, b) => a - b);
    const stepped = { med: +ms[ms.length >> 1].toFixed(2), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(2) };
    return { perf, draw, stepped, people: c.room.state.players.size, objects: c.room.state.objects.size };
  })) as any;
  const pct = (x: number) => +((100 * x) / wall).toFixed(1);
  const out = {
    busyPct: pct(b.task - a.task),
    scriptPct: pct(b.script - a.script),
    layoutStylePct: pct(b.layout - a.layout + b.style - a.style),
    heapMB: +(b.heap / 1048576).toFixed(1),
    heapGrowthMB: +((b.heap - a.heap) / 1048576).toFixed(1),
    fps: r.perf.gap.avg ? +(1000 / r.perf.gap.avg).toFixed(1) : 0,
    gap: r.perf.gap,
    frame: r.perf.frame,
    longTasks: r.perf.longTasks,
    stages: Object.fromEntries(
      Object.entries(r.perf.stages as Record<string, { avg: number; p95: number; worst: number }>)
        .sort((x, y) => y[1].avg - x[1].avg)
        .map(([k, v]) => [k, { avg: v.avg, p95: v.p95, worst: v.worst }]),
    ),
    stepped: r.stepped,
    drawCalls: r.draw?.calls ?? null,
    triangles: r.draw?.triangles ?? null,
    people: r.people,
    objects: r.objects,
  };
  results[name] = out;
  console.log(`[lag] ${name}: ${JSON.stringify(out)}`);
  await cdp.detach();
}

const want = (name: string) => !ONLY || ONLY.includes(name);

test.describe
  .serial("the lag: where the time goes", () => {
    test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
    test.setTimeout(300_000);

    test.afterAll(async ({ browser }) => {
      // the shadowed back on, as the world had them
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await enter(page, await token(ANA)).catch(() => {});
      await page.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { mode: "normal" })).catch(() => {});
      await ctx.close();
      if (OUT) writeFileSync(OUT, `${JSON.stringify(results, null, 1)}\n`);
    });

    for (const view of ["3p", "iso"] as const) {
      test(`${view}: indoors, idle and walking`, async ({ browser }) => {
        test.skip(!want(`${view}-indoors-idle`) && !want(`${view}-indoors-walk`));
        const ctx = await browser.newContext();
        const page = await open(ctx, ANA, view);
        await page.waitForTimeout(3000);
        if (want(`${view}-indoors-idle`)) {
          await page.waitForTimeout(3500); // (idle: frames drop to 30/s after 3 s)
          await measure(`${view}-indoors-idle`, page);
        }
        if (want(`${view}-indoors-walk`)) {
          await pace(page);
          await page.waitForTimeout(1000);
          await measure(`${view}-indoors-walk`, page);
          await stopPace(page);
        }
        await ctx.close();
      });

      test(`${view}: outdoors, walking the lot and the lawn`, async ({ browser }) => {
        test.skip(!want(`${view}-outdoors-walk`));
        const ctx = await browser.newContext();
        const page = await open(ctx, ANA, view);
        await goTo(page, LOT);
        await page.waitForTimeout(5000); // (the land streamed in)
        await pace(page, LAWN);
        await page.waitForTimeout(1000);
        await measure(`${view}-outdoors-walk`, page, SECONDS + 4);
        await stopPace(page);
        await ctx.close();
      });
    }

    test("3p: indoors walking, with Bia walking beside", async ({ browser }) => {
      test.skip(!want("3p-indoors-two"));
      const ctx = await browser.newContext();
      const page = await open(ctx, ANA, "3p");
      const ctxB = await browser.newContext();
      const bia = await open(ctxB, BIA, "3p");
      const anaUid = await page.evaluate(() => (window as any).__yutopia.myUid() as number);
      await bia.evaluate((uid) => (window as any).__yutopia.teleport({ userId: uid }), anaUid);
      // (both in and drawn: the other browser loading its 3D stalls this one's frames)
      await page.waitForTimeout(6000);
      await pace(bia);
      await pace(page);
      await page.waitForTimeout(1500);
      await measure("3p-indoors-two", page);
      await stopPace(page);
      await stopPace(bia);
      await ctxB.close();
      await ctx.close();
    });
  });
