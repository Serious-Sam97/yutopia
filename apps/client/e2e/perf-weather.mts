/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// The whole game's cost with the weather in (docs/plan/65-the-weather.md: the performance
// investigation) — in a world of its own: an offline world-server (tools/prod-world.mjs's way, a
// saved world on :2667, here as an admin so the weather can be called), the page from the dev
// client (:3100), the dev API's login (Bia's: the dev world's Ana isn't touched).
//   PORT=2667 … npx tsx src/index.ts (apps/world-server, YUTOPIA_OFFLINE=1, YUTOPIA_WORLD_FILE=…)
//   node --experimental-strip-types e2e/perf-weather.mts <out.json> [high,medium]
// Per quality, place and weather: the frame stepped by hand (its CPU, and with the GPU waited on),
// draws, triangles, programs, things drawn; the longest real frame after each weather comes in and
// the shaders it made; the bytes a second from the server; the memory over ten weather cycles; a
// CPU profile of a walk in the rain and in falling snow, by file.
import { writeFileSync } from "node:fs";
import { type Browser, chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "perf.json";
const qualities = (process.argv[3] ?? "high,medium").split(",");
const APP = process.env.APP ?? "http://localhost:3100";
const API = "http://localhost:8100";
const PORT = 2667;
const G = (x: number, y: number) => ({ x, y });
const SPOTS: { name: string; at: { x: number; y: number } | "spawn"; yaw: number }[] = [
  { name: "office (floor 4)", at: "spawn", yaw: 0 },
  { name: "lot", at: { x: 37.8, y: 30 }, yaw: Math.PI },
  { name: "lawn", at: G(95, -95), yaw: 2.3 },
  { name: "Main Street", at: G(380, -398), yaw: 0 },
  { name: "woods (trail)", at: G(-258, 17), yaw: 2.4 },
  { name: "pond", at: G(-240, -96), yaw: 1.5 },
];
type Wx = { name: string; sky: string; snow: number; melt?: number; wet: number; pud: number; ice: number };
const WEATHERS: Wx[] = [
  { name: "dry, clear", sky: "clear", snow: 0, wet: 0, pud: 0, ice: 0 },
  { name: "grey", sky: "cloudy", snow: 0, wet: 0, pud: 0, ice: 0 },
  { name: "snowing, white", sky: "snow", snow: 1, wet: 0, pud: 0, ice: 1 },
  { name: "thaw", sky: "cloudy", snow: 0.5, melt: 1, wet: 0.7, pud: 0.3, ice: 1 },
  { name: "downpour", sky: "rain", snow: 0, wet: 1, pud: 1, ice: 0 },
  { name: "storm", sky: "storm", snow: 0, wet: 1, pud: 1, ice: 0 },
];

async function open(browser: Browser, quality: string): Promise<Page> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API}/api/login`, {
    data: { email: "bia@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" },
    headers: { Accept: "application/json" },
  });
  const tok = (await res.json()).token;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("  page:", e.message.slice(0, 200)));
  await page.route("**/api/session", async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    j.worldUrl = `ws://localhost:${PORT}`;
    j.worldToken = "dev:901:Perf:member,builder,admin";
    await route.fulfill({ response: r, json: j });
  });
  await page.addInitScript(
    ([t, q]) => {
      localStorage.setItem("yutopia:token", t);
      localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q, view: "3p", cam3p: "chase" }));
    },
    [tok, quality] as const,
  );
  const t0 = Date.now();
  await page.goto(APP);
  await page.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false && !!(window as any).__yutopia?.tp;
    },
    null,
    { timeout: 180_000 },
  );
  console.log(`  ${quality}: in after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    w.room.send("mod:dark", { mode: "peaceful" });
    w.room.send("mod:fog", { fog: "clear", now: true });
    w.updateNight = () => {};
    w.tp.setHour(12);
    w.model?.setClock(12);
  });
  return page;
}

const go = async (p: Page, at: { x: number; y: number } | "spawn", yaw: number) => {
  await p.evaluate(
    ([a, y]) => {
      const w = (window as any).__yutopia;
      if (a === "spawn") w.room.send("teleport", { to: "spawn" });
      else w.teleport({ ...(a as object), level: 0 });
      w.tp.yaw = y;
      w.tp.pitch = 0.15;
      w.tp.dragged = 1e12;
    },
    [at, yaw] as const,
  );
  await p.waitForTimeout(6000);
};
const weather = async (p: Page, s: Wx) => {
  await p.evaluate((s) => {
    const w = (window as any).__yutopia;
    w.room.send("mod:weather", { to: s.sky, now: true });
    const L = (window as any).__wxLayer;
    // (a build from before the weather — the baseline — has no layer: the sky's call alone)
    if (!L) return;
    L.hold.on = true;
    L.wx.wxSnow.value = s.snow;
    L.wx.wxMelt.value = s.melt ?? 0;
    L.wx.wxWet.value = s.wet;
    L.wx.wxPud.value = s.pud;
    L.wx.wxIce.value = s.ice;
    w.tp.setHour(12);
  }, s);
};
// the frame stepped by hand: its CPU alone, and with the GPU waited on; what it drew
const frame = (p: Page) =>
  p.evaluate(() => {
    const c = (window as any).__yutopia;
    const r = c.tp.renderer;
    const gl = r.getContext();
    const cpu: number[] = [];
    const all: number[] = [];
    for (let i = 0; i < 90; i++) {
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
    const med = (a: number[]) => +[...a].sort((x, y) => x - y)[a.length >> 1].toFixed(2);
    const p90 = (a: number[]) => +[...a].sort((x, y) => x - y)[Math.floor(a.length * 0.9)].toFixed(2);
    r.info.autoReset = false;
    r.info.reset();
    c.frame(1 / 60, performance.now());
    const info = { calls: r.info.render.calls, tris: r.info.render.triangles };
    r.info.autoReset = true;
    let drawn = 0;
    c.tp.scene.traverseVisible((o: any) => {
      if (o.isMesh || o.isPoints || o.isLine) drawn++;
    });
    return {
      cpu: med(cpu),
      total: med(all),
      p90: p90(all),
      ...info,
      programs: r.info.programs.length,
      drawn,
      geometries: r.info.memory.geometries,
      textures: r.info.memory.textures,
    };
  });
// real frames for `ms`: the longest, how many over 33 ms
const real = (p: Page, ms: number) =>
  p.evaluate(
    (ms) =>
      new Promise<{ worst: number; over33: number; fps: number }>((done) => {
        const d: number[] = [];
        let last = performance.now();
        const t0 = last;
        const tick = (t: number) => {
          d.push(t - last);
          last = t;
          if (t - t0 < ms) requestAnimationFrame(tick);
          else
            done({
              worst: Math.round(Math.max(...d)),
              over33: d.filter((x) => x > 34).length,
              fps: +((d.length * 1000) / (t - t0)).toFixed(1),
            });
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
const programs = (p: Page) => p.evaluate(() => (window as any).__yutopia.tp.renderer.info.programs.length);

const browser = await chromium.launch({
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--enable-precise-memory-info",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const report: any = { at: new Date().toISOString(), qualities: {} };
for (const q of qualities) {
  const page = await open(browser, q);
  await page.evaluate(() => (window as any).__yutopia.life?.sound.mixer.resume());
  const R: any = { frames: [], switches: [], net: {}, memory: {}, profile: {}, sound: {} };
  report.qualities[q] = R;
  // ── the frame by place and weather ──
  for (const s of SPOTS) {
    await go(page, s.at, s.yaw);
    for (const w of WEATHERS) {
      await weather(page, w);
      await page.waitForTimeout(2500);
      const f = await frame(page);
      R.frames.push({ spot: s.name, weather: w.name, ...f });
      console.log(
        `  ${q} ${s.name} ${w.name}: ${f.total} ms (cpu ${f.cpu}) · ${f.calls} draws · ${f.programs} programs`,
      );
    }
  }
  // ── a weather coming in: the longest real frame in the 3 s after, the shaders made ──
  await go(page, G(95, -95), 2.3);
  await weather(page, WEATHERS[0]);
  await page.waitForTimeout(3000);
  for (const w of [WEATHERS[4], WEATHERS[2], WEATHERS[3], WEATHERS[5], WEATHERS[0]]) {
    const p0 = await programs(page);
    await weather(page, w);
    const r = await real(page, 3000);
    R.switches.push({ to: w.name, ...r, newPrograms: (await programs(page)) - p0 });
  }
  // ── the server's bytes a second, by weather (10 s each) ──
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  let bytes = 0;
  cdp.on("Network.webSocketFrameReceived", (e: any) => {
    bytes += e.response.payloadData.length;
  });
  for (const w of [WEATHERS[0], WEATHERS[4], WEATHERS[2]]) {
    await weather(page, w);
    await page.waitForTimeout(1500);
    bytes = 0;
    await page.waitForTimeout(10_000);
    R.net[w.name] = Math.round(bytes / 10);
  }
  // ── memory over ten weather cycles ──
  const mem = () =>
    page.evaluate(() => {
      const r = (window as any).__yutopia.tp.renderer;
      return {
        heapMB: +((performance as any).memory.usedJSHeapSize / 1048576).toFixed(1),
        geometries: r.info.memory.geometries,
        textures: r.info.memory.textures,
        programs: r.info.programs.length,
        beds: Object.keys((window as any).__yutopia.life?.sound.weather?.levels() ?? {}).length,
      };
    });
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  R.memory.before = await mem();
  for (let i = 0; i < 10; i++)
    for (const w of [WEATHERS[4], WEATHERS[2], WEATHERS[3], WEATHERS[0]]) {
      await weather(page, w);
      await page.waitForTimeout(700);
    }
  await page.waitForTimeout(3000);
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  R.memory.after = await mem();
  // ── the sound: its recordings fetched, their decode ──
  R.sound = await page.evaluate(async () => {
    const m = await fetch("/sfx/weather/manifest.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    const ctx = new AudioContext();
    const out: any[] = [];
    for (const [slot, cands] of Object.entries(m) as any) {
      for (const f of cands.flatMap((c: any) => c.files)) {
        const b = await fetch(`/sfx/weather/${f}`).then((r) => r.arrayBuffer());
        const t0 = performance.now();
        const a = await ctx.decodeAudioData(b);
        out.push({
          slot,
          file: f,
          kb: Math.round(b.byteLength / 1024),
          decodeMs: +(performance.now() - t0).toFixed(1),
          secs: +a.duration.toFixed(1),
          mb: +((a.length * a.numberOfChannels * 4) / 1048576).toFixed(1),
        });
      }
    }
    await ctx.close();
    return out;
  });
  // ── a CPU profile of a walk: in the downpour on the lawn, in falling snow in town ──
  if (q === "high") {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    for (const [name, at, w, yaw] of [
      ["downpour, the lawn", G(95, -95), WEATHERS[4], 2.3],
      ["falling snow, Main Street", G(380, -398), WEATHERS[2], 0],
    ] as const) {
      await go(page, at, yaw);
      await weather(page, w);
      await page.waitForTimeout(2000);
      await cdp.send("Profiler.start");
      await page.keyboard.down("KeyW");
      const r = await real(page, 8000);
      await page.keyboard.up("KeyW");
      const { profile } = await cdp.send("Profiler.stop");
      // self time by file and by function
      const total = profile.endTime - profile.startTime;
      const dt: number[] = profile.timeDeltas;
      const self = new Map<number, number>();
      for (let i = 0; i < profile.samples.length; i++)
        self.set(profile.samples[i], (self.get(profile.samples[i]) ?? 0) + (dt[i] ?? 0));
      const byFile = new Map<string, number>();
      const byFn = new Map<string, number>();
      for (const n of profile.nodes) {
        const us = self.get(n.id) ?? 0;
        const url = (n.callFrame.url || "(native)").replace(/^.*\/_next\/static\/chunks\//, "").replace(/\?.*$/, "");
        const file = url.includes("webpack-internal") ? url.replace(/^.*\/\.\//, "") : url.split("/").pop() || url;
        const fn = `${n.callFrame.functionName || "(anon)"} · ${file}`;
        byFile.set(file, (byFile.get(file) ?? 0) + us);
        byFn.set(fn, (byFn.get(fn) ?? 0) + us);
      }
      const top = (m: Map<string, number>, k: number) =>
        [...m]
          .sort((a, b) => b[1] - a[1])
          .slice(0, k)
          .map(([n, us]) => ({ n, pct: +((100 * us) / total).toFixed(1) }));
      R.profile[name] = { real: r, byFile: top(byFile, 30), byFn: top(byFn, 40) };
      console.log(`  profile ${name}: ${r.fps} fps, worst ${r.worst} ms`);
    }
  }
  await page.close();
}
await browser.close();
writeFileSync(out, JSON.stringify(report, null, 2));
console.log("written", out);
