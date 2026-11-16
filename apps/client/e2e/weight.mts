/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// The weight's bench (docs/plan/89-the-weight.md, phase 0): what the game costs a machine, measured the same way
// before and after every phase — against a PROD build (`NEXT_DIST_DIR=.next-prod pnpm build`, `next start -p 3107`:
// `next dev` carries ~276 MB of module sources and slower code), as Bia, teleports only, the dev world as it is.
//
//   node --experimental-strip-types e2e/weight.mts <mode> [...]
//     frames            (AB_OFF / AB_ON: the switch flipped in the same page, walking — on, off, on, off)
//                       live fps, uncapped (no vsync, no frame cap): High at 2×, and Low with the CPU slowed (M1, an
//                       M1's proxy) — in each spot, standing still and walking; the main thread's stages, the frames
//                       over 50 ms, draws, triangles, programs
//     memory            the spots visited CYCLES times, then garbage collected: the tab's and the GPU process's memory
//                       by allocator (Chrome's memory-infra) and resident size; the JS heap; the scene's density
//                       (meshes, geometries and their copies, materials and looks, painted textures and their copies)
//     load              a cold load over a slowed link (DOWN Mbps, RTT ms), then a warm reload: requests, bytes, 304s,
//                       time to ready; what's compiled and how many people come in after the loading screen lifts
//     stills <name>     the same seeded cameras in every spot, High and Low, noon and night, the world held still
//                       (people, vehicles, particles hidden; the clock, the storm and the film grain fixed): saved under
//                       OUT/stills/<name>. With AB_OFF / AB_ON (JS run in the page, `c` the controller and `tp` the
//                       view): each camera drawn both ways in the same frame and the pixels compared — exact
//     diff <a> <b>      two stills sets compared pixel by pixel (a same-code pair first: the noise floor); PNGs of
//                       the cameras that differ (a, b, and the differing pixels in red) under OUT/diff-<a>-<b>
//     all               frames, memory, load
//   YUTOPIA_E2E_URL (http://localhost:3107), YUTOPIA_E2E_API (http://localhost:8100), OUT (/tmp/weight),
//   AB=<preset> (lights, unshare, outcull) or AB_OFF/AB_ON: the switch for frames' and stills' A/B; PNG=1 (stills also saved as PNGs to look at), SPOTS (studio,lot,lawn), M1 (2.5), SECONDS (4), CYCLES (2), MEM_Q (low), DOWN (20), RTT (60), CAMS (6)
// Every mode writes OUT/<mode>.json too.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync, gunzipSync, gzipSync } from "node:zlib";
import { type Browser, type CDPSession, chromium, type Page, request } from "@playwright/test";
import { Client, type Room } from "colyseus.js";

const mode = process.argv[2] ?? "all";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3107";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const OUT = process.env.OUT ?? "/tmp/weight";
const M1 = Number(process.env.M1 ?? 2.5);
const SECONDS = Number(process.env.SECONDS ?? 4);
mkdirSync(OUT, { recursive: true });

type Spot = { x: number; y: number; level: number };
const ALL_SPOTS: Record<string, Spot> = {
  studio: { x: 20, y: 12, level: 4 }, // the Tracking Room's floor, furnished
  lot: { x: -24, y: 18, level: 0 }, // the car park, outdoors
  lawn: { x: -80, y: 22, level: 0 }, // the lawn by the woods
  floor2: { x: 30.5, y: 20.5, level: 2 }, // an empty floor (its windows)
  woods: { x: -180, y: 22, level: 0 }, // the thickest of the forest by the lawn (plan 90's loading checks)
};
const SPOTS = (process.env.SPOTS ?? "studio,lot,lawn").split(",").filter((s) => ALL_SPOTS[s]);
const GPU = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-precise-memory-info"];
const UNCAPPED = ["--disable-gpu-vsync", "--disable-frame-rate-limit"];

// A phase's switch for the A/B (JS run in the page; `c` the controller, `tp` the view): AB=<name> for one of these,
// or AB_OFF / AB_ON by hand
const PRESETS: Record<string, { off: string; on: string }> = {
  // plan 89 phase 1: the lights at 0 worked out again, as three does (a uniform: the same programs)
  lights: { off: "tp.lightsSkip(false)", on: "tp.lightsSkip(true)" },
  // phase 4: what's built outside never left out of a render (Culling.outCull), then back
  outcull: { off: "tp.culling.outCull = false", on: "tp.culling.outCull = true" },
  // phase 3: every texture painted once and shared (its painter kept: userData.repaint) painted again for each
  // material that shows it, as each thing painted its own before — its repeat, offset and wrap as set on the shared
  // one — then back
  unshare: {
    off: `const W = (window.__unshare ??= new WeakMap());
      tp.scene.traverse((o) => {
        for (const m of [].concat(o.material || [])) {
          for (const k of Object.keys(m)) {
            const t = m[k];
            if (!t || !t.isTexture || !t.userData || !t.userData.repaint) continue;
            const e = W.get(m) || {};
            let own = e[k];
            if (!own) {
              own = t.userData.repaint();
              own.repeat.copy(t.repeat); own.offset.copy(t.offset); own.wrapS = t.wrapS; own.wrapT = t.wrapT;
              own.userData = { shared: t };
              e[k] = own;
              W.set(m, e);
            }
            m[k] = own;
          }
        }
      });`,
    on: `tp.scene.traverse((o) => {
        for (const m of [].concat(o.material || []))
          for (const k of Object.keys(m)) { const t = m[k]; if (t && t.isTexture && t.userData && t.userData.shared) m[k] = t.userData.shared; }
      });`,
  },
};
function abSwitch(): { off: string; on: string } | null {
  if (process.env.AB) {
    const p = PRESETS[process.env.AB];
    if (!p) throw new Error(`AB=${process.env.AB}: one of ${Object.keys(PRESETS).join(", ")}`);
    return p;
  }
  return process.env.AB_OFF ? { off: process.env.AB_OFF, on: process.env.AB_ON ?? "" } : null;
}

let tok = "";
async function login(): Promise<string> {
  if (tok) return tok;
  const ctx = await request.newContext();
  const r = await ctx.post(`${api}/api/login`, {
    data: { email: "bia@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" },
    headers: { Accept: "application/json" },
  });
  if (!r.ok()) throw new Error(`login ${r.status()}`);
  tok = (await r.json()).token;
  return tok;
}

const ready = () => {
  const h = (window as any).__hud?.get();
  return h?.phase === "ready" && h.loading?.on === false;
};

interface Opts {
  quality: string;
  dpr: number;
  maxFps: number;
  width?: number;
  height?: number;
}
async function open(browser: Browser, o: Opts): Promise<{ page: Page; readyMs: number }> {
  const t = await login();
  const page = await browser.newPage({
    viewport: { width: o.width ?? 1440, height: o.height ?? 900 },
    deviceScaleFactor: o.dpr,
  });
  page.on("pageerror", (e) => console.log(`  page: ${e.message}`));
  await page.addInitScript(
    ([t, q, f]) => {
      localStorage.setItem("yutopia:token", t as string);
      localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q, view: "3p", cam3p: "chase", maxFps: f }));
    },
    [t, o.quality, o.maxFps] as const,
  );
  const t0 = Date.now();
  await page.goto(`${base}/`);
  await page.waitForFunction(ready, null, { timeout: 240_000 });
  return { page, readyMs: Date.now() - t0 };
}

async function goTo(page: Page, at: Spot, settle = 8000) {
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), at);
  await page.waitForFunction((p) => {
    const t = (window as any).__yutopia.meAt();
    return Math.hypot(t.x - p.x, t.y - p.y) < 2;
  }, at);
  await page.waitForTimeout(settle);
}

// noon, no storm, never idle (the idle cap would halve the frames)
async function hold(page: Page, hour = 13) {
  await page.evaluate((h) => {
    const c = (window as any).__yutopia;
    c.updateNight = () => {};
    if (c.life) c.life.weather = () => [0, 0];
    c.hour = h;
    c.model.setClock(h);
    c.tp?.setHour(h);
    c.activeAt = performance.now() + 1e9;
  }, hour);
}

// back and forth a few steps (the client's own path finding), as lag.spec.ts
async function pace(page: Page) {
  await page.evaluate(async () => {
    const c = (window as any).__yutopia;
    const from = c.meAt();
    let there: { x: number; y: number } | null = null;
    for (const [dx, dy] of [
      [6, 0],
      [-6, 0],
      [0, 6],
      [0, -6],
      [4, 4],
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
    if (!there) return;
    let goal = there;
    c.walkTo(goal);
    (window as any).__pace = setInterval(() => {
      const t = c.meAt();
      if (Math.hypot(t.x - goal.x, t.y - goal.y) < 1.2 || !c.path?.length) {
        goal = goal === there ? from : (there as { x: number; y: number });
        c.walkTo(goal);
      }
    }, 200);
  });
}
const stopPace = (page: Page) => page.evaluate(() => clearInterval((window as any).__pace));

// the live loop for `s` seconds: fps, frames over 50 ms, the controller's stages; then one frame's draws
async function live(page: Page, s: number) {
  return page.evaluate(async (ms) => {
    const c = (window as any).__yutopia;
    const tp = c.tp;
    const R = tp.renderer;
    await c.perf(true);
    let over = 0;
    let last = performance.now();
    let on = true;
    const f = () => {
      const t = performance.now();
      if (t - last > 50) over++;
      last = t;
      if (on) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    await new Promise((r) => setTimeout(r, ms));
    on = false;
    const p = await c.perf();
    const stages = Object.fromEntries(
      Object.entries(p.stages as Record<string, { med: number }>)
        .sort((a, b) => b[1].med - a[1].med)
        .slice(0, 6)
        .map(([k, v]) => [k, v.med]),
    );
    // one frame's draws over all its passes
    let calls = 0;
    let tris = 0;
    await new Promise<void>((done) => {
      const fr = tp.frame;
      tp.frame = (...a: unknown[]) => {
        tp.frame = fr;
        R.info.autoReset = false;
        R.info.reset();
        const x = fr.apply(tp, a);
        calls = R.info.render.calls;
        tris = R.info.render.triangles;
        R.info.autoReset = true;
        done();
        return x;
      };
    });
    return {
      fps: p.gap.avg ? +(1000 / p.gap.avg).toFixed(1) : 0,
      frameMs: p.frame.med,
      frameP95: p.frame.p95,
      gapWorst: p.gap.worst,
      over50: over,
      longTasks: p.longTasks.n,
      stages,
      draws: calls,
      triangles: Math.round(tris),
      programs: R.info.programs?.length ?? 0,
    };
  }, s * 1000);
}

// ── frames ──
async function frames() {
  const configs = [
    { name: "high-2x", quality: "high", dpr: 2, cpu: 1 },
    { name: `low-m1 (cpu ${M1}×)`, quality: "low", dpr: 2, cpu: M1 },
  ];
  const out: Record<string, unknown> = {};
  // (CONFIGS=high or low: one of them only)
  for (const cf of configs.filter((c) => !process.env.CONFIGS || c.name.startsWith(process.env.CONFIGS))) {
    const browser = await chromium.launch({ args: [...GPU, ...UNCAPPED] });
    const { page } = await open(browser, { quality: cf.quality, dpr: cf.dpr, maxFps: 0 });
    const cdp = await page.context().newCDPSession(page);
    for (const s of SPOTS) {
      await goTo(page, ALL_SPOTS[s]);
      await hold(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cf.cpu });
      await page.waitForTimeout(1500);
      const AB = abSwitch();
      if (AB) {
        // the phase's switch flipped in this page, the world as it is: on, off, on, off (same-page A/B — runs apart
        // differ by more than a phase's gain: the world's draws move by half between them)
        const flip = (js: string) =>
          page.evaluate(
            (js) => new Function("c", "tp", js)((window as any).__yutopia, (window as any).__yutopia.tp),
            js,
          );
        const rows: { on: any[]; off: any[] } = { on: [], off: [] };
        await pace(page);
        await page.waitForTimeout(1000);
        for (let k = 0; k < 2; k++) {
          await flip(AB.on);
          await page.waitForTimeout(800);
          rows.on.push(await live(page, SECONDS));
          await flip(AB.off);
          await page.waitForTimeout(800);
          rows.off.push(await live(page, SECONDS));
        }
        await flip(AB.on);
        await stopPace(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        const avg = (a: any[], k: string) => +(a.reduce((s, x) => s + x[k], 0) / a.length).toFixed(1);
        const on = { fps: avg(rows.on, "fps"), frameMs: avg(rows.on, "frameMs"), over50: avg(rows.on, "over50") };
        const off = { fps: avg(rows.off, "fps"), frameMs: avg(rows.off, "frameMs"), over50: avg(rows.off, "over50") };
        out[`${cf.name} · ${s}`] = { on, off, runs: rows };
        console.log(
          `${cf.name} · ${s} (walking, A/B in the page): on ${on.fps} fps (${rows.on.map((r) => r.fps).join(", ")}) · off ${off.fps} fps (${rows.off.map((r) => r.fps).join(", ")}) → ${(((on.fps - off.fps) / off.fps) * 100).toFixed(1)}%  · main ${on.frameMs} vs ${off.frameMs} ms · >50ms ${on.over50} vs ${off.over50}`,
        );
        continue;
      }
      const still = await live(page, SECONDS);
      await pace(page);
      await page.waitForTimeout(1000);
      const walking = await live(page, SECONDS);
      await stopPace(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      out[`${cf.name} · ${s}`] = { still, walking };
      const row = (k: string, v: any) =>
        `  ${k.padEnd(8)} ${String(v.fps).padStart(6)} fps  main ${String(v.frameMs).padStart(5)} ms (p95 ${v.frameP95})  >50ms ${v.over50}  worst ${v.gapWorst}  draws ${v.draws}  tris ${Math.round(v.triangles / 1000)}k  programs ${v.programs}`;
      console.log(`${cf.name} · ${s}\n${row("still", still)}\n${row("walking", walking)}`);
      console.log(`    stages (walking): ${JSON.stringify(walking.stages)}`);
    }
    await browser.close();
  }
  return out;
}

// ── memory ──
const MB = (b: number) => +(b / 1048576).toFixed(1);
async function memoryDump(browser: Browser) {
  const cdp = await browser.newBrowserCDPSession();
  const events: any[] = [];
  cdp.on("Tracing.dataCollected", (e: any) => events.push(...e.value));
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.start", {
    traceConfig: { includedCategories: ["disabled-by-default-memory-infra"], memoryDumpConfig: { triggers: [] } },
    transferMode: "ReportEvents",
  } as any);
  await new Promise((r) => setTimeout(r, 500));
  await cdp.send("Tracing.requestMemoryDump", { deterministic: true, levelOfDetail: "detailed" } as any);
  await cdp.send("Tracing.end");
  await done;
  const names = new Map<number, string>();
  for (const e of events) if (e.ph === "M" && e.name === "process_name") names.set(e.pid, e.args.name);
  const size = (a: any) => {
    const v = a?.attrs?.size?.value ?? a?.attrs?.effective_size?.value;
    return v ? MB(Number.parseInt(v, 16)) : 0;
  };
  const rss = (pid: number) => {
    try {
      return MB(Number(execFileSync("/bin/ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim()) * 1024);
    } catch {
      return 0;
    }
  };
  const want: Record<string, string[]> = {
    Renderer: [
      "partition_alloc/partitions/array_buffer",
      "partition_alloc/partitions/buffer",
      "canvas",
      "v8",
      "malloc",
      "webgl",
      "blink_gc",
    ],
    "GPU Process": ["gpu", "gpu/angle", "gpu/shared_images", "ioaccelerator", "iosurface", "malloc"],
  };
  const out: Record<string, Record<string, number>> = {};
  for (const e of events) {
    const A = e.ph === "v" ? e.args?.dumps?.allocators : null;
    const kind = names.get(e.pid) ?? "";
    if (!A || !want[kind]) continue;
    const row: Record<string, number> = { rss: rss(e.pid) };
    for (const k of want[kind]) row[k] = size(A[k]);
    out[kind === "Renderer" && out.Renderer ? `Renderer ${e.pid}` : kind] = row;
  }
  return out;
}

// what's in the scene and how much of it is a copy (plan 89's phases 2–3 count it down)
async function density(page: Page) {
  return page.evaluate(() => {
    const tp = (window as any).__yutopia.tp;
    const geos = new Set<any>();
    const mats = new Set<any>();
    const texs = new Set<any>();
    let meshes = 0;
    let objects = 0;
    tp.scene.traverse((o: any) => {
      objects++;
      if (o.geometry) {
        geos.add(o.geometry);
        meshes++;
      }
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        mats.add(m);
        for (const k of Object.keys(m)) if (m[k]?.isTexture) texs.add(m[k]);
      }
    });
    const bytes = (g: any) => {
      let b = g.index ? g.index.array.byteLength : 0;
      for (const a of Object.values(g.attributes) as any[]) b += a.array?.byteLength ?? 0;
      return b;
    };
    const sig = (g: any) => {
      const p = g.attributes.position;
      if (!p) return `none${g.id}`;
      const a = p.array;
      let h = 0;
      const step = Math.max(1, Math.floor(a.length / 64));
      for (let i = 0; i < a.length; i += step) h = (h * 31 + Math.round(a[i] * 1000)) | 0;
      return `${Object.keys(g.attributes).sort()}|${p.count}|${g.index?.count ?? 0}|${h}`;
    };
    const seen = new Map<string, number>();
    let gBytes = 0;
    let dupBytes = 0;
    let nonIndexed = 0;
    for (const g of geos) {
      const b = bytes(g);
      gBytes += b;
      if (!g.index) nonIndexed++;
      const k = sig(g);
      if (seen.has(k)) dupBytes += b;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const look = (m: any) =>
      [
        m.type,
        m.name,
        m.color?.getHexString?.(),
        m.emissive?.getHexString?.(),
        m.map?.uuid,
        m.normalMap?.uuid,
        m.roughness,
        m.metalness,
        m.opacity,
        m.transparent,
        m.side,
        m.vertexColors,
        m.customProgramCacheKey?.() ?? "",
      ].join("|");
    const looks = new Set([...mats].map(look));
    let canvasN = 0;
    let canvasPx = 0;
    const painted = new Map<string, number>();
    for (const t of texs) {
      const im = t.image;
      const isCanvas =
        (typeof HTMLCanvasElement !== "undefined" && im instanceof HTMLCanvasElement) ||
        (typeof OffscreenCanvas !== "undefined" && im instanceof OffscreenCanvas);
      if (!isCanvas) continue;
      canvasN++;
      canvasPx += im.width * im.height * 4;
      try {
        const d = im.getContext("2d")?.getImageData(0, 0, Math.min(16, im.width), Math.min(16, im.height)).data;
        let h = 0;
        if (d) for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0;
        const k = `${im.width}x${im.height}:${h}`;
        painted.set(k, (painted.get(k) ?? 0) + 1);
      } catch {
        // (a canvas that won't read back)
      }
    }
    // the floors' triangles (each held twice: its pieces and the merged copy drawn — tp/build.ts)
    const floors: Record<string, number> = {};
    for (const [lvl, f] of tp.floors) {
      let t = 0;
      for (const ch of f.world.chunks.values())
        for (const m of ch.merged)
          t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      floors[lvl] = Math.round(t);
    }
    return {
      objects,
      meshes,
      geometries: geos.size,
      geometryMB: +(gBytes / 1048576).toFixed(1),
      nonIndexed,
      duplicateGeometries: geos.size - seen.size,
      duplicateMB: +(dupBytes / 1048576).toFixed(1),
      materials: mats.size,
      looks: looks.size,
      paintedTextures: canvasN,
      paintedMB: +(canvasPx / 1048576).toFixed(1),
      paintedCopies: [...painted.values()].reduce((s, v) => s + v - 1, 0),
      floorTriangles: floors,
    };
  });
}

async function memory() {
  const q = process.env.MEM_Q ?? "low";
  const cycles = Number(process.env.CYCLES ?? 2);
  const browser = await chromium.launch({ args: GPU });
  const { page } = await open(browser, { quality: q, dpr: 2, maxFps: 60 });
  const cdp: CDPSession = await page.context().newCDPSession(page);
  for (let i = 0; i < cycles; i++) for (const s of [...SPOTS, "floor2"]) await goTo(page, ALL_SPOTS[s], 6000);
  await cdp.send("HeapProfiler.collectGarbage");
  await page.waitForTimeout(2000);
  const heap = await page.evaluate(() => {
    const R = (window as any).__yutopia.tp.renderer;
    return {
      jsHeapMB: +((performance as any).memory.usedJSHeapSize / 1048576).toFixed(1),
      geometries: R.info.memory.geometries,
      textures: R.info.memory.textures,
      programs: R.info.programs?.length ?? 0,
    };
  });
  const procs = await memoryDump(browser);
  const dens = await density(page);
  await browser.close();
  const out = { quality: q, cycles, ...heap, processes: procs, density: dens };
  console.log(`memory (${q}, ${cycles} cycles): ${JSON.stringify(heap)}`);
  for (const [k, v] of Object.entries(procs)) console.log(`  ${k}: ${JSON.stringify(v)}`);
  console.log(`  density: ${JSON.stringify(dens)}`);
  return out;
}

// ── load ──
async function load() {
  const down = Number(process.env.DOWN ?? 20);
  const rtt = Number(process.env.RTT ?? 60);
  const browser = await chromium.launch({ args: GPU });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const t = await login();
  await ctx.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "low", view: "3p", cam3p: "chase", maxFps: 60 }));
    // long tasks from the start (the loading screen's and after)
    (window as any).__long = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) (window as any).__long.push([e.startTime, e.duration]);
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // (no long-task timing here)
    }
  }, t);
  const throttled = async () => {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: rtt,
      downloadThroughput: (down * 1e6) / 8,
      uploadThroughput: (5 * 1e6) / 8,
    });
    return { page, cdp };
  };
  const run = async (label: string, page: Page, cdp: CDPSession, go: () => Promise<unknown>) => {
    // (a request answered locally — Chrome's memory or disk cache — moves no bytes; a revalidated one is a 304 on
    // the wire, whatever the page is shown: responseReceivedExtraInfo has the wire's status)
    const reqs = new Map<string, { url: string; status: number; cached: boolean; bytes: number }>();
    const onResp = (e: any) => {
      const r = reqs.get(e.requestId);
      reqs.set(e.requestId, {
        url: e.response.url,
        status: r?.status ?? e.response.status,
        cached: !!(r?.cached || e.response.fromDiskCache || e.response.fromMemoryCache || e.response.fromPrefetchCache),
        bytes: r?.bytes ?? 0,
      });
    };
    const onExtra = (e: any) => {
      const r = reqs.get(e.requestId) ?? { url: "", status: 0, cached: false, bytes: 0 };
      r.status = e.statusCode;
      reqs.set(e.requestId, r);
    };
    const onCache = (e: any) => {
      const r = reqs.get(e.requestId) ?? { url: "", status: 0, cached: false, bytes: 0 };
      r.cached = true;
      reqs.set(e.requestId, r);
    };
    const onDone = (e: any) => {
      const r = reqs.get(e.requestId);
      if (r) r.bytes = e.encodedDataLength;
    };
    cdp.on("Network.responseReceived", onResp);
    cdp.on("Network.responseReceivedExtraInfo", onExtra);
    cdp.on("Network.requestServedFromCache", onCache);
    cdp.on("Network.loadingFinished", onDone);
    const t0 = Date.now();
    await go();
    await page.waitForFunction(ready, null, { timeout: 300_000 });
    const readyMs = Date.now() - t0;
    const at = await page.evaluate(() => {
      const c = (window as any).__yutopia;
      return { programs: c.tp.renderer.info.programs?.length ?? 0, people: c.tp.people3.size, now: performance.now() };
    });
    await page.waitForTimeout(20_000);
    const after = await page.evaluate((t: number) => {
      const c = (window as any).__yutopia;
      const long = ((window as any).__long as [number, number][]).filter(([s]) => s > t);
      return {
        programs: c.tp.renderer.info.programs?.length ?? 0,
        people: c.tp.people3.size,
        longTasks: long.length,
        longestMs: Math.round(Math.max(0, ...long.map(([, d]) => d))),
      };
    }, at.now);
    cdp.off("Network.responseReceived", onResp);
    cdp.off("Network.responseReceivedExtraInfo", onExtra);
    cdp.off("Network.requestServedFromCache", onCache);
    cdp.off("Network.loadingFinished", onDone);
    const list = [...reqs.values()].filter((r) => r.url);
    const kind = (u: string) => u.match(/\.(glb|ktx2|wasm|mp3|js|css|webp|png|json)(\?|$)/)?.[1] ?? "other";
    const byKind: Record<string, { n: number; MB: number }> = {};
    for (const r of list) {
      const k = kind(r.url);
      byKind[k] ??= { n: 0, MB: 0 };
      byKind[k].n++;
      byKind[k].MB = +(byKind[k].MB + r.bytes / 1048576).toFixed(2);
    }
    const res = {
      readyMs,
      requests: list.length,
      transferredMB: MB(list.reduce((s, r) => s + r.bytes, 0)),
      fromCache: list.filter((r) => r.cached || (!r.bytes && r.status !== 304)).length,
      notModified304: list.filter((r) => r.status === 304).length,
      byKind,
      atReady: { programs: at.programs, people: at.people },
      in20sAfter: {
        programsCompiled: after.programs - at.programs,
        peopleCameIn: after.people - at.people,
        longTasks: after.longTasks,
        longestMs: after.longestMs,
      },
    };
    console.log(`${label} (${down} Mbps, ${rtt} ms): ${JSON.stringify(res)}`);
    return res;
  };
  const a = await throttled();
  const cold = await run("cold", a.page, a.cdp, () => a.page.goto(`${base}/`));
  const warm = await run("reload", a.page, a.cdp, () => a.page.reload());
  await a.page.close();
  // (the tab opened again, the browser still up: a second visit)
  const b = await throttled();
  const again = await run("again", b.page, b.cdp, () => b.page.goto(`${base}/`));
  await browser.close();
  return { link: { downMbps: down, rttMs: rtt }, cold, reload: warm, again };
}

// ── stills ──
// the seeded cameras round each spot, the world held still; `ab`: each drawn both ways in one frame
async function stills(name: string) {
  const dir = join(OUT, "stills", name);
  mkdirSync(dir, { recursive: true });
  const cams = Number(process.env.CAMS ?? 6);
  const ab = abSwitch();
  const spots = (process.env.SPOTS ?? "studio,lot,lawn,floor2").split(",").filter((s) => ALL_SPOTS[s]);
  const summary: Record<string, unknown> = {};
  for (const q of ["high", "low"]) {
    const browser = await chromium.launch({ args: GPU });
    const { page } = await open(browser, { quality: q, dpr: 1, maxFps: 60, width: 1280, height: 720 });
    for (const s of spots) {
      await goTo(page, ALL_SPOTS[s]);
      for (let i = 0; i < cams; i++) {
        const r = await page.evaluate(
          async ({ i, seed, ab }) => {
            const c = (window as any).__yutopia;
            const tp = c.tp;
            const R = tp.renderer;
            const gl = R.getContext();
            let z = seed * 7919 + i * 104729 + 1;
            const rnd = () => {
              z = (z * 1103515245 + 12345) % 2147483648;
              return z / 2147483648;
            };
            const hour = i % 2 ? 21.5 : 13;
            c.updateNight = () => {};
            if (c.life) c.life.weather = () => [0, 0];
            c.hour = hour;
            c.model.setClock(hour);
            tp.setHour(hour);
            tp.yaw = rnd() * Math.PI * 2;
            tp.dragged = 1e12;
            tp.pitch = 0.05 + rnd() * 0.5;
            tp.dist = 3 + rnd() * 7;
            // the shot's own camera, round where the game's camera looks (me), its point rounded to half a metre: the
            // teleport leaves me a few centimetres apart run to run, and the chase camera follows me
            const g = tp.target;
            const r2 = (v: number) => Math.round(v * 2) / 2;
            const T = [r2(g.x) + (rnd() - 0.5) * 4, r2(g.y) + 1 + rnd() * 0.8, r2(g.z) + (rnd() - 0.5) * 4];
            const cy = Math.cos(tp.pitch) * tp.dist;
            const P = [T[0] + Math.sin(tp.yaw) * cy, T[1] + Math.sin(tp.pitch) * tp.dist, T[2] + Math.cos(tp.yaw) * cy];
            for (let k = 0; k < 14; k++) c.frame(1 / 30, performance.now()); // (fades settle)
            // what moves on its own, hidden for the shot: people, pets, vehicles, particles, anything whose
            // matrix changed over those frames
            const before = new Map<any, string>();
            const key = (o: any) =>
              `${o.matrixWorld.elements.join()}|${o.isInstancedMesh ? o.instanceMatrix.version : ""}`;
            tp.scene.traverse((o: any) => before.set(o, key(o)));
            for (let k = 0; k < 6; k++) c.frame(1 / 30, performance.now());
            const moving: any[] = [];
            const reasons: Record<string, number> = {};
            tp.scene.traverse((o: any) => {
              const was = before.get(o);
              const why = o.isSkinnedMesh
                ? "skinned"
                : o.isPoints
                  ? "points"
                  : o.isSprite
                    ? "sprite"
                    : was === undefined
                      ? "new"
                      : was !== key(o)
                        ? "moved"
                        : "";
              if (why) {
                moving.push(o);
                let n = 0;
                o.traverse((d: any) => {
                  if (d.isMesh) n++;
                });
                const top = (() => {
                  let p = o;
                  while (p.parent && p.parent !== tp.scene) p = p.parent;
                  return p.name || p.type;
                })();
                const k = `${why}:${top}`;
                reasons[k] = (reasons[k] ?? 0) + n;
              }
            });
            // and everyone's, whether they moved or not (their blob shadows, holsters, torches) — only what's
            // theirs: never the scene, a floor, or anything holding a light or a floor
            const shared = new Set<any>([
              tp.scene,
              tp.world.root,
              ...[...tp.floors.values()].map((f: any) => f.world.root),
            ]);
            const theirs = (x: any) => {
              if (!x?.isObject3D || shared.has(x)) return false;
              let ok = true;
              x.traverse((d: any) => {
                if (d.isLight || shared.has(d)) ok = false;
              });
              return ok;
            };
            for (const m of [tp.people3, tp.pets3, tp.vehicles?.veh3])
              for (const v of (m as Map<string, any>)?.values() ?? [])
                for (const x of [v, ...Object.values(v ?? {})]) {
                  const o = x?.isObject3D ? x : x?.root;
                  if (theirs(o)) moving.push(o);
                }
            // (the guard: a shot with most of the frame hidden is a broken shot, not a still)
            const hiddenMeshes = moving.reduce((n: number, o: any) => {
              let k = 0;
              o.traverse((d: any) => {
                if (d.isMesh) k++;
              });
              return n + k;
            }, 0);
            const W = R.domElement.width;
            const H = R.domElement.height;
            const read = () => {
              const px = new Uint8Array(W * H * 4);
              gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
              return px;
            };
            return await new Promise<any>((done) => {
              const fr = tp.frame;
              tp.frame = (...a: unknown[]) => {
                const x = fr.apply(tp, a);
                tp.frame = fr;
                const cam = tp.camera;
                cam.position.set(P[0], P[1], P[2]);
                cam.lookAt(T[0], T[1], T[2]);
                cam.updateMatrixWorld(true);
                const hid: any[] = [];
                for (const o of moving)
                  if (o.visible) {
                    o.visible = false;
                    hid.push(o);
                  }
                const shot = () => {
                  const slab = tp.culling.noCull ? null : tp.world.slab();
                  tp.scene.updateMatrixWorld();
                  tp.culling.cullBelow(slab);
                  try {
                    if (tp.post) {
                      tp.post.frame = 0; // (the film grain's pattern fixed)
                      tp.post.render(false);
                    } else R.render(tp.scene, tp.camera);
                  } finally {
                    tp.culling.below3.end();
                  }
                  return read();
                };
                const A = shot();
                let differ = -1;
                let bB = "";
                if (ab) {
                  new Function("c", "tp", ab.off)(c, tp);
                  const B = shot();
                  new Function("c", "tp", ab.on)(c, tp);
                  differ = 0;
                  for (let j = 0; j < A.length; j += 4)
                    if (A[j] !== B[j] || A[j + 1] !== B[j + 1] || A[j + 2] !== B[j + 2]) differ++;
                  // (the other side too, when they differ: to look at)
                  if (differ)
                    for (let j = 0; j < B.length; j += 0x8000) bB += String.fromCharCode(...B.subarray(j, j + 0x8000));
                }
                for (const o of hid) o.visible = true;
                let bin = "";
                for (let j = 0; j < A.length; j += 0x8000) bin += String.fromCharCode(...A.subarray(j, j + 0x8000));
                done({
                  w: W,
                  h: H,
                  px: btoa(bin),
                  pxB: bB ? btoa(bB) : "",
                  differ,
                  hidden: hid.length,
                  hiddenMeshes,
                  reasons,
                });
                return x;
              };
            });
          },
          { i, seed: s.length * 31 + (q === "high" ? 1 : 2), ab },
        );
        const file = `${q}-${s}-${i}`;
        const head = Buffer.alloc(8);
        head.writeUInt32LE(r.w, 0);
        head.writeUInt32LE(r.h, 4);
        const px = Buffer.from(r.px, "base64");
        writeFileSync(join(dir, `${file}.rgba.gz`), gzipSync(Buffer.concat([head, px])));
        if (process.env.PNG) writeFileSync(join(dir, `${file}.png`), png(r.w, r.h, px));
        if (r.pxB) {
          // the A/B's two sides and where they differ (red), to look at
          const pb = Buffer.from(r.pxB, "base64");
          const mask = Buffer.from(px);
          for (let j = 0; j < px.length; j += 4)
            if (px[j] !== pb[j] || px[j + 1] !== pb[j + 1] || px[j + 2] !== pb[j + 2]) mask.set([255, 0, 0, 255], j);
          writeFileSync(join(dir, `${file}-ab-on.png`), png(r.w, r.h, px));
          writeFileSync(join(dir, `${file}-ab-off.png`), png(r.w, r.h, pb));
          writeFileSync(join(dir, `${file}-ab-diff.png`), png(r.w, r.h, mask));
        }
        if (process.env.WHY) console.log(`  ${file} hidden: ${JSON.stringify(r.reasons)}`);
        summary[file] = { hidden: r.hidden, hiddenMeshes: r.hiddenMeshes, ...(ab ? { abDiffer: r.differ } : {}) };
        // (a black or blank shot proves nothing: said loudly)
        let hi = 0;
        for (let j = 0; j < px.length; j += 4 * 97) hi = Math.max(hi, px[j], px[j + 1], px[j + 2]);
        if (hi < 6) console.log(`  ${file}: black — check it (PNG=1)`);
        if (ab) console.log(`  ${file}: same-frame A/B ${r.differ} px differ`);
      }
      console.log(`stills ${q} · ${s}: ${cams} cameras → ${dir}`);
    }
    await browser.close();
  }
  return summary;
}

// ── diff ──
function png(w: number, h: number, rgba: Buffer): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  // (readPixels is bottom-up: flipped)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, (h - 1 - y) * w * 4, (h - y) * w * 4);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function diff(a: string, b: string) {
  const da = join(OUT, "stills", a);
  const db = join(OUT, "stills", b);
  const outDir = join(OUT, `diff-${a}-${b}`);
  mkdirSync(outDir, { recursive: true });
  const rows: Record<string, { differ: number; over48: number; maxDelta: number }> = {};
  let total = 0;
  let cams = 0;
  for (const f of readdirSync(da).filter((f) => f.endsWith(".rgba.gz"))) {
    if (!existsSync(join(db, f))) continue;
    const A = gunzipSync(readFileSync(join(da, f)));
    const B = gunzipSync(readFileSync(join(db, f)));
    const w = A.readUInt32LE(0);
    const h = A.readUInt32LE(4);
    const pa = A.subarray(8);
    const pb = B.subarray(8);
    const mask = Buffer.from(pa);
    let differ = 0;
    let over48 = 0;
    let maxDelta = 0;
    for (let j = 0; j < pa.length; j += 4) {
      const d = Math.max(Math.abs(pa[j] - pb[j]), Math.abs(pa[j + 1] - pb[j + 1]), Math.abs(pa[j + 2] - pb[j + 2]));
      if (!d) continue;
      differ++;
      if (d > 48) over48++;
      if (d > maxDelta) maxDelta = d;
      mask[j] = 255;
      mask[j + 1] = 0;
      mask[j + 2] = 0;
      mask[j + 3] = 255;
    }
    const name = f.replace(".rgba.gz", "");
    rows[name] = { differ, over48, maxDelta };
    total += differ;
    cams++;
    if (differ) {
      writeFileSync(join(outDir, `${name}-a.png`), png(w, h, Buffer.from(pa)));
      writeFileSync(join(outDir, `${name}-b.png`), png(w, h, Buffer.from(pb)));
      writeFileSync(join(outDir, `${name}-diff.png`), png(w, h, mask));
    }
  }
  const differing = Object.entries(rows).filter(([, v]) => v.differ);
  console.log(`diff ${a} → ${b}: ${cams} cameras, ${differing.length} differ, ${total} px in all`);
  for (const [k, v] of differing) console.log(`  ${k}: ${v.differ} px (${v.over48} over 48 levels, max ${v.maxDelta})`);
  if (differing.length) console.log(`  pictures: ${outDir}`);
  return { cameras: cams, differing: differing.length, pixels: total, rows };
}

const save = (name: string, data: unknown) =>
  writeFileSync(join(OUT, `${name}.json`), `${JSON.stringify(data, null, 1)}\n`);

// ── census (docs/plan/90-the-friends-machines.md, phase 0) ──
// What a frame is made of, by where it comes from: the draws (each pass apart), the objects three walks, the main
// thread's time (a CPU profile, walking), the frame against people near (bots by the dev world-server's `bot:`
// tokens, stood round me), and every frame over 50 ms with what ran in it (Chrome's long-animation-frame entries).
const WORLD = process.env.YUTOPIA_WORLD_WS ?? "ws://localhost:2567";

// one frame's draws, by source (the nearest labelled ancestor: a part of the view by its field's name, or a person)
async function drawsBySource(page: Page) {
  return page.evaluate(async () => {
    const c = (window as any).__yutopia;
    const tp = c.tp;
    const R = tp.renderer;
    const labels = new Map<any, string>();
    for (const [k, v] of Object.entries(tp)) {
      const o = v as any;
      if (o?.isObject3D) labels.set(o, k);
      else if (o && typeof o === "object" && !Array.isArray(o) && !(o instanceof Map))
        for (const [k2, v2] of Object.entries(o))
          if ((v2 as any)?.isObject3D && !labels.has(v2)) labels.set(v2, `${k}.${k2}`);
    }
    for (const [f, b] of tp.floors ?? []) labels.set(b.world.root, f === c.level ? "floor (mine)" : `floor ${f}`);
    if (tp.around?.grounds?.root) labels.set(tp.around.grounds.root, "grounds");
    for (const [, p] of tp.people3 ?? []) labels.set(p.root, "people");
    const label = (o: any) => {
      for (let x = o; x; x = x.parent) {
        const l = labels.get(x);
        if (l) return l;
        if (x.parent === tp.scene) return `scene:${x.name || x.type}`;
      }
      return "?";
    };
    const by: Record<string, number> = {};
    await new Promise<void>((done) => {
      const fr = tp.frame;
      const rbd = R.renderBufferDirect;
      tp.frame = (...a: unknown[]) => {
        tp.frame = fr;
        R.renderBufferDirect = function (cam: any, scene: any, geo: any, mat: any, obj: any, group: any) {
          const rt = R.getRenderTarget();
          const pass = !rt ? "" : rt === tp.sun?.shadow?.map ? "shadow " : "target ";
          const k = pass + label(obj);
          by[k] = (by[k] ?? 0) + 1;
          return rbd.call(this, cam, scene, geo, mat, obj, group);
        };
        try {
          return fr.apply(tp, a);
        } finally {
          R.renderBufferDirect = rbd;
          done();
        }
      };
    });
    // the objects three walks, by the same sources
    const objs: Record<string, { all: number; visible: number }> = {};
    tp.scene.traverse((o: any) => {
      const k = label(o);
      objs[k] ??= { all: 0, visible: 0 };
      objs[k].all++;
    });
    tp.scene.traverseVisible((o: any) => {
      const k = label(o);
      objs[k] ??= { all: 0, visible: 0 };
      objs[k].visible++;
    });
    const sort = <T,>(o: Record<string, T>, f: (v: T) => number) =>
      Object.fromEntries(
        Object.entries(o)
          .sort((a, b) => f(b[1]) - f(a[1]))
          .slice(0, 18),
      );
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    return { draws: total, by: sort(by, (v) => v), objects: sort(objs, (v) => v.all) };
  });
}

// the main thread's time, walking: a CPU profile's self time, by function and by file
async function profile(page: Page, cdp: CDPSession, s: number) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await pace(page);
  await page.waitForTimeout(800);
  await cdp.send("Profiler.start");
  await page.waitForTimeout(s * 1000);
  const { profile: pr } = (await cdp.send("Profiler.stop")) as any;
  await stopPace(page);
  const nodes = new Map<number, any>(pr.nodes.map((n: any) => [n.id, n]));
  const self = new Map<number, number>();
  for (let i = 0; i < pr.samples.length; i++)
    self.set(pr.samples[i], (self.get(pr.samples[i]) ?? 0) + (pr.timeDeltas[i] ?? 0));
  const byFn = new Map<string, number>();
  const byFile = new Map<string, number>();
  let busy = 0;
  for (const [id, us] of self) {
    const cf = nodes.get(id).callFrame;
    if (cf.functionName === "(idle)" || cf.functionName === "(program)") continue;
    busy += us;
    const file = (cf.url.split("/").pop() || cf.functionName).replace(/\?.*$/, "");
    const fn = `${cf.functionName || "(anon)"} ${file}:${cf.lineNumber + 1}:${cf.columnNumber + 1}`;
    byFn.set(fn, (byFn.get(fn) ?? 0) + us);
    byFile.set(file, (byFile.get(file) ?? 0) + us);
  }
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => [k, +((v / busy) * 100).toFixed(1)]);
  return { busyMs: Math.round(busy / 1000), wallMs: s * 1000, byFn: top(byFn, 30), byFile: top(byFile, 15) };
}

// bots stood round me (in front, a ring 2–6 m out), as long as they're wanted
async function botsRound(page: Page, n: number, from: number): Promise<Room[]> {
  const me = await page.evaluate(() => {
    const c = (window as any).__yutopia;
    const p = c.room.state.players.get(c.room.sessionId);
    return { x: p.x, y: p.y, z: p.z, l: p.level, yaw: c.tp?.camYaw ?? 0 };
  });
  const rooms: Room[] = [];
  for (let i = 0; i < n; i++) {
    const id = from + i;
    const r = await new Client(WORLD).joinOrCreate("world", { token: `bot:${id}:Bench ${id % 1000}` });
    r.onMessage("*", () => {});
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const d = 2 + (i % 4);
    const x = me.x + Math.cos(a) * d;
    const y = me.y + Math.sin(a) * d;
    let seq = 0;
    const put = () =>
      r.send("pos", {
        x,
        y,
        z: me.z,
        l: me.l,
        a: 0,
        seq: ++seq,
        mv: 0,
        yaw: Math.round(((a + Math.PI) / (Math.PI * 2)) * 256) & 255,
        pitch: 0,
        mt: Date.now() >>> 0,
      });
    put();
    setTimeout(put, 600);
    rooms.push(r);
  }
  return rooms;
}

// every frame over 50 ms while walking `s` s: its length, what blocked, the scripts in it
async function longFrames(page: Page, s: number) {
  await page.evaluate(() => {
    const w = window as any;
    w.__loaf = [];
    w.__loafObs?.disconnect();
    w.__loafObs = new PerformanceObserver((l) => {
      for (const e of l.getEntries() as any[])
        if (e.duration > 50)
          w.__loaf.push({
            ms: Math.round(e.duration),
            blocking: Math.round(e.blockingDuration ?? 0),
            render: Math.round((e.renderStart ? e.startTime + e.duration - e.renderStart : 0) || 0),
            scripts: (e.scripts ?? [])
              .sort((a: any, b: any) => b.duration - a.duration)
              .slice(0, 3)
              .map(
                (x: any) =>
                  `${Math.round(x.duration)}ms ${x.invokerType}:${x.invoker} ${x.sourceFunctionName || ""} ${(x.sourceURL || "").split("/").pop()}:${x.sourceCharPosition}`,
              ),
          });
    });
    w.__loafObs.observe({ type: "long-animation-frame", buffered: false });
  });
  await pace(page);
  await page.waitForTimeout(s * 1000);
  await stopPace(page);
  return page.evaluate(() => (window as any).__loaf);
}

async function census() {
  const out: Record<string, unknown> = {};
  const cf = { name: `low-m1 (cpu ${M1}×)`, quality: "low", dpr: 2, cpu: M1 };
  const browser = await chromium.launch({ args: [...GPU, ...UNCAPPED] });
  const { page } = await open(browser, { quality: cf.quality, dpr: cf.dpr, maxFps: 0 });
  const cdp = await page.context().newCDPSession(page);
  let botId = 930_000 + Math.floor(Math.random() * 50_000);
  for (const s of (process.env.SPOTS ?? "studio,lot,lawn,floor2").split(",")) {
    await goTo(page, ALL_SPOTS[s]);
    await hold(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cf.cpu });
    await page.waitForTimeout(1500);
    const draws = await drawsBySource(page);
    const prof = await profile(page, cdp, 5);
    const loaf = await longFrames(page, 12);
    // the frame against people near: 0, 5, 10, 20 (standing still)
    const people: Record<string, unknown> = {};
    let bots: Room[] = [];
    for (const n of [0, 5, 10, 20]) {
      if (n > bots.length) {
        bots = bots.concat(await botsRound(page, n - bots.length, botId));
        botId += n;
        await page.waitForTimeout(6000);
      }
      const l = await live(page, SECONDS);
      people[n] = {
        fps: l.fps,
        frameMs: l.frameMs,
        draws: l.draws,
        over50: l.over50,
        near: await page.evaluate(() => (window as any).__yutopia.tp.people3.size),
      };
    }
    for (const b of bots) await b.leave().catch(() => {});
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await page.waitForTimeout(2000);
    out[s] = { draws, profile: prof, longFrames: loaf, people };
    console.log(`\n== ${cf.name} · ${s}: ${draws.draws} draws`);
    console.log(`  draws by source: ${JSON.stringify(draws.by)}`);
    console.log(`  objects by source: ${JSON.stringify(draws.objects)}`);
    console.log(`  main thread busy ${prof.busyMs} of ${prof.wallMs} ms; by file: ${JSON.stringify(prof.byFile)}`);
    console.log(`  top functions: ${JSON.stringify(prof.byFn.slice(0, 20))}`);
    console.log(`  people near → frame: ${JSON.stringify(people)}`);
    console.log(`  frames over 50 ms in 12 s walking: ${loaf.length}`);
    for (const f of loaf.slice(0, 8)) console.log(`    ${f.ms} ms (render ${f.render}): ${f.scripts.join(" | ")}`);
  }
  await browser.close();
  return out;
}

if (mode === "census") save("census", await census());
if (mode === "frames" || mode === "all") save("frames", await frames());
if (mode === "memory" || mode === "all") save("memory", await memory());
if (mode === "load" || mode === "all") save("load", await load());
if (mode === "stills") save(`stills-${process.argv[3] ?? "a"}`, await stills(process.argv[3] ?? "a"));
if (mode === "diff") save(`diff-${process.argv[3]}-${process.argv[4]}`, diff(process.argv[3], process.argv[4]));
