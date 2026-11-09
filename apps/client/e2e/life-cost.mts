/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 2.6 — what the life look costs against the classic one, on this machine's GPU (the dev
// stack, as Bia): per look and quality, at two places at noon — the frame stepped by hand (its CPU, and
// with the GPU waited on), draws, programs, textures; how long until the world is ready; the longest
// real frame in the first seconds after (a shader compiled late shows there).
//   node --experimental-strip-types e2e/life-cost.mts [out.json]   QUALITIES=high,medium,low
import { writeFileSync } from "node:fs";
import { chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "/tmp/life-cost.json";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const qualities = (process.env.QUALITIES ?? "high,medium,low").split(",");
const SPOTS = [
  { name: "studio", at: { x: 20, y: 12 }, level: 4 },
  { name: "lot", at: { x: -24, y: 18 }, level: 0 },
];

const ctx = await request.newContext();
const tok = (
  await (
    await ctx.post(`${api}/api/login`, {
      data: { email: "bia@yutopia.test", password: pass },
      headers: { Accept: "application/json" },
    })
  ).json()
).token;
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });

async function open(look: string, quality: string): Promise<{ page: Page; readyMs: number }> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("  page:", e.message));
  await page.addInitScript(
    ([t, q]) => {
      localStorage.setItem("yutopia:token", t);
      localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q }));
    },
    [tok, quality] as const,
  );
  const t0 = Date.now();
  await page.goto(`${base}/?look=${look}`);
  await page.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 180_000 },
  );
  return { page, readyMs: Date.now() - t0 };
}

const go = async (p: Page, s: (typeof SPOTS)[number]) => {
  await p.evaluate(([a, l]) => (window as any).__yutopia.teleport({ ...a, level: l }), [s.at, s.level] as const);
  await p.waitForTimeout(7000);
  await p.evaluate(() => {
    const w = (window as any).__yutopia;
    w.updateNight = () => {};
    w.hour = 12;
    w.tp.setHour(12);
    if (w.life) w.life.weather = () => [0, 0];
  });
  await p.waitForTimeout(1500);
};

// the longest real frame over `ms`
const worst = (p: Page, ms: number) =>
  p.evaluate(
    (ms) =>
      new Promise<number>((done) => {
        let last = performance.now();
        let w = 0;
        const t0 = last;
        const f = () => {
          const now = performance.now();
          w = Math.max(w, now - last);
          last = now;
          if (now - t0 < ms) requestAnimationFrame(f);
          else done(+w.toFixed(1));
        };
        requestAnimationFrame(f);
      }),
    ms,
  );

const frame = (p: Page) =>
  p.evaluate(() => {
    const c = (window as any).__yutopia;
    const r = c.tp.renderer;
    const gl = r.getContext();
    const cpu: number[] = [];
    const all: number[] = [];
    for (let i = 0; i < 70; i++) {
      gl.finish();
      const t0 = performance.now();
      c.frame(1 / 60, t0);
      const t1 = performance.now();
      gl.finish();
      const t2 = performance.now();
      if (i >= 10) {
        cpu.push(t1 - t0);
        all.push(t2 - t0);
      }
    }
    const q = (a: number[], k: number) => +[...a].sort((x, y) => x - y)[Math.floor(a.length * k)].toFixed(2);
    r.info.autoReset = false;
    r.info.reset();
    c.frame(1 / 60, performance.now());
    const calls = r.info.render.calls;
    r.info.autoReset = true;
    return {
      cpu: q(cpu, 0.5),
      total: q(all, 0.5),
      p90: q(all, 0.9),
      calls,
      programs: r.info.programs.length,
      textures: r.info.memory.textures,
      geometries: r.info.memory.geometries,
    };
  });

const results: any[] = [];
for (const quality of qualities)
  for (const look of ["classic", "life"]) {
    const { page, readyMs } = await open(look, quality);
    const firstWorst = await worst(page, 4000);
    for (const s of SPOTS) {
      await go(page, s);
      const f = await frame(page);
      const r = { quality, look, spot: s.name, readyMs, firstWorst, ...f };
      results.push(r);
      const line = (tag: string, f: any) =>
        console.log(
          `${quality.padEnd(6)} ${tag.padEnd(9)} ${s.name.padEnd(6)} ${f.total} ms (cpu ${f.cpu}, p90 ${f.p90}) · ${f.calls} draws · ${f.programs} programs · ${f.textures} tex · ready ${(readyMs / 1000).toFixed(1)} s · worst first ${firstWorst} ms`,
        );
      line(look, f);
      // (the life look on High without its AO: what the AO alone costs)
      if (look === "life" && quality === "high") {
        await page.evaluate(() => {
          const ao = (window as any).__yutopia.tp.post?.ao;
          if (ao) ao.enabled = false;
        });
        const g = await frame(page);
        results.push({ quality, look: "life-noao", spot: s.name, ...g });
        line("life-noao", g);
        await page.evaluate(() => {
          const ao = (window as any).__yutopia.tp.post?.ao;
          if (ao) ao.enabled = true;
        });
      }
    }
    await page.close();
  }
writeFileSync(out, JSON.stringify(results, null, 2));
await browser.close();
