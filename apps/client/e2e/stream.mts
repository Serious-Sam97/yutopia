/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// The streaming's bench (docs/plan/91-the-big-map.md, phase 0): how fast what's round you comes, on a slow machine
// too, and what it all weighs — against a PROD build (`NEXT_DIST_DIR=.next-prod pnpm build`, `next start -p 3107`),
// as Bia, the dev world as it is.
//
//   node --experimental-strip-types e2e/stream.mts <mode>
//     arrive   for each tier (Q) and CPU slow-down (CPU): from town (or the road, arriving in town) a teleport to each
//              spot (SPOTS) in play — not behind the loading screen — then each second for WAIT s: the land's blocks
//              missing, the districts' steps left, the workers' queues, the asphalt under you, the heap, fps. Says
//              when the land, the asphalt and the districts came.
//     drive    along the long road at KMH (120,240) for DRIVE s from its start: the seconds with dirt under you
//              (past the first 10), the land missing, the queues
//     soak     the long road out SOAK_M and back at 240 km/h, High, no slow-down: the heap (after a GC) and
//              the tab's and the GPU process's memory at the start, the far end and back
//     census   after the spots: the tab's and the GPU process's memory by allocator (Chrome's memory-infra), the
//              JS heap, the scene's geometry and textures by owner (the Grounds, floors, people, cars, the rest)
//   YUTOPIA_E2E_URL (http://localhost:3107), YUTOPIA_E2E_API (http://localhost:8100), OUT (/tmp/stream),
//   Q (potato,high), CPU (4), SPOTS (road7k,town; also woods, road2k, roadEnd), WAIT (40), KMH (240), DRIVE (40),
//   SOAK_M (7000: how far out the soak drives before coming back)
// The defaults: a few minutes a mode — the slow machine where it matters; widen them by hand when a phase needs it.
// Every mode writes OUT/<mode>.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, type CDPSession, chromium, type Page, request } from "@playwright/test";
import { SPINE } from "@yutopia/shared/longroad";

const mode = process.argv[2] ?? "arrive";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3107";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const OUT = process.env.OUT ?? "/tmp/stream";
const list = (v: string | undefined, d: string) => (v ?? d).split(",").filter(Boolean);
const QS = list(process.env.Q, "potato,high");
const CPUS = list(process.env.CPU, "4").map(Number);
const WAIT = Number(process.env.WAIT ?? 40);
const KMH = list(process.env.KMH, "240").map(Number);
const DRIVE = Number(process.env.DRIVE ?? 40);
const SOAK_M = Number(process.env.SOAK_M ?? 7000);
mkdirSync(OUT, { recursive: true });

// the long road by length: a point `m` metres along it
const cum = [0];
for (let i = 1; i < SPINE.length; i++)
  cum.push(cum[i - 1] + Math.hypot(SPINE[i][0] - SPINE[i - 1][0], SPINE[i][1] - SPINE[i - 1][1]));
const ROAD_M = cum[cum.length - 1];
function along(m: number): { x: number; y: number } {
  const t = Math.max(0, Math.min(ROAD_M, m));
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = (t - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return { x: SPINE[lo][0] + (SPINE[hi][0] - SPINE[lo][0]) * f, y: SPINE[lo][1] + (SPINE[hi][1] - SPINE[lo][1]) * f };
}

type Spot = { x: number; y: number; level: number };
const TOWN: Spot = { x: 500, y: -390, level: 0 };
const ALL_SPOTS: Record<string, Spot> = {
  town: TOWN,
  woods: { x: -180, y: 22, level: 0 },
  road2k: { ...along(2000), level: 0 },
  road7k: { ...along(7000), level: 0 },
  roadEnd: { ...along(ROAD_M - 50), level: 0 },
};
const SPOTS = list(process.env.SPOTS, "road7k,town").filter((s) => ALL_SPOTS[s]);
const GPU = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-precise-memory-info"];

async function open(browser: Browser, q: string): Promise<{ page: Page; cdp: CDPSession }> {
  const ctx = await request.newContext();
  const tok = (
    await (
      await ctx.post(`${api}/api/login`, {
        data: { email: "bia@yutopia.test", password: "yutopia-demo" },
        headers: { Accept: "application/json" },
      })
    ).json()
  ).token;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(
    ([t, qq]) => {
      localStorage.setItem("yutopia:token", t as string);
      localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: qq, view: "3p", maxFps: 60 }));
    },
    [tok, q],
  );
  await page.goto(`${base}/`);
  await page.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 240_000 },
  );
  const cdp = await page.context().newCDPSession(page);
  return { page, cdp };
}

const teleport = (page: Page, p: Spot) => page.evaluate((s) => (window as any).__yutopia.teleport(s), p);
const slow = (cdp: CDPSession, rate: number) => cdp.send("Emulation.setCPUThrottlingRate", { rate });

/** The stream's state round (x, z): what's missing, the queues, the asphalt under that point. */
function sample(page: Page, at: { x: number; y: number }) {
  return page.evaluate((p) => {
    const w = window as any;
    const c = w.__yutopia;
    c.activeAt = performance.now() + 1e9; // (never idle: the frame cap stays the asked one)
    const g = c.tp.around.grounds;
    const st = g.stats();
    let district = 0;
    for (const d of g.districts?.values?.() ?? []) district += d.left ?? 0;
    // the asphalt under the point: a road piece (the worn, mapped, vertex-coloured ribbon) whose box holds it
    let asphalt = false;
    g.root.updateMatrixWorld();
    g.root.traverse((o: any) => {
      if (asphalt || !o.isMesh || !o.visible) return;
      const m = o.material;
      if (!(m?.userData?.worn && m.map && m.vertexColors)) return;
      const geo = o.geometry;
      geo.boundingBox ?? geo.computeBoundingBox();
      const b = geo.boundingBox;
      const e = o.matrixWorld.elements;
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (const x of [b.min.x, b.max.x])
        for (const y of [b.min.y, b.max.y])
          for (const z of [b.min.z, b.max.z]) {
            const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
            const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
            x0 = Math.min(x0, wx);
            x1 = Math.max(x1, wx);
            z0 = Math.min(z0, wz);
            z1 = Math.max(z1, wz);
          }
      if (p.x >= x0 - 1 && p.x <= x1 + 1 && p.y >= z0 - 1 && p.y <= z1 + 1) asphalt = true;
    });
    return {
      land: g.left.blocks as number,
      near: g.left.statics as number,
      district,
      asked: st.asked as number,
      made: st.made as number,
      asphalt,
      heap: Math.round((performance as any).memory.usedJSHeapSize / 1048576),
      fps: Math.round(c.tp.fps),
    };
  }, at);
}
type Sample = Awaited<ReturnType<typeof sample>>;

/** The tab's and the GPU process's memory (Chrome's memory-infra), MB. */
async function memdump(browser: Browser): Promise<Record<string, { footprint: number; top: [string, number][] }>> {
  const cdp = await browser.newBrowserCDPSession();
  const events: any[] = [];
  cdp.on("Tracing.dataCollected", (e: any) => events.push(...e.value));
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.start", {
    traceConfig: { includedCategories: ["disabled-by-default-memory-infra"], memoryDumpConfig: { triggers: [] } },
    transferMode: "ReportEvents",
  } as any);
  await new Promise((r) => setTimeout(r, 500));
  await cdp.send("Tracing.requestMemoryDump" as any, { deterministic: true, levelOfDetail: "detailed" });
  await cdp.send("Tracing.end");
  await done;
  const names = new Map<number, string>();
  for (const e of events) if (e.ph === "M" && e.name === "process_name") names.set(e.pid, e.args.name);
  const MB = (h: string | number) => Math.round((typeof h === "string" ? Number.parseInt(h, 16) : h) / 1048576);
  const out: Record<string, { footprint: number; top: [string, number][] }> = {};
  for (const e of events.filter((x) => x.ph === "v")) {
    const d = e.args?.dumps;
    if (!d?.allocators) continue;
    const name = names.get(e.pid) ?? String(e.pid);
    const A = d.allocators;
    const size = (a: any) => (a?.attrs?.size ? MB(a.attrs.size.value) : 0);
    const top = Object.keys(A)
      .filter(
        (k) => !k.includes("/") || /^(gpu\/[^/]+|v8\/main\/heap\/[^/]+|partition_alloc\/partitions\/[^/]+)$/.test(k),
      )
      .map((k) => [k, size(A[k])] as [string, number])
      .filter(([, v]) => v >= 8)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    // (the footprint where Chrome says it; else the top-level allocators summed)
    const fp = d.process_totals?.private_footprint_bytes
      ? MB(d.process_totals.private_footprint_bytes)
      : Object.keys(A)
          .filter((k) => !k.includes("/"))
          .reduce((a, k) => a + size(A[k]), 0);
    const k = /GPU/i.test(name) ? "gpu" : /Renderer/i.test(name) ? "tab" : name;
    if (!out[k] || fp > out[k].footprint) out[k] = { footprint: fp, top };
  }
  return out;
}

async function gcHeap(page: Page, cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  return page.evaluate(() => Math.round((performance as any).memory.usedJSHeapSize / 1048576));
}

/** The scene's geometry and textures by owner, MB (what's drawn, its CPU side). */
function owners(page: Page) {
  return page.evaluate(() => {
    const c = (window as any).__yutopia;
    const tp = c.tp;
    const g = tp.around.grounds;
    const roots: [string, any][] = [["grounds", g?.root]];
    const out: Record<string, { geo: number; tex: number }> = {};
    const seenG = new Set<any>();
    const seenT = new Set<any>();
    const geoBytes = (geo: any) => {
      let n = geo.index?.array?.byteLength ?? 0;
      for (const a of Object.values(geo.attributes ?? {}) as any[])
        n += a.array?.byteLength ?? a.data?.array?.byteLength ?? 0;
      for (const list of Object.values(geo.morphAttributes ?? {}) as any[])
        for (const a of list) n += a.array?.byteLength ?? 0;
      return n;
    };
    const texBytes = (t: any) => {
      let n = 0;
      for (const m of t.mipmaps ?? []) n += m.data?.byteLength ?? 0;
      const im = t.image;
      if (im?.data?.byteLength) n += im.data.byteLength;
      return n;
    };
    const ownerOf = (o: any): string => {
      for (let x = o; x; x = x.parent) {
        if (x === g?.root) return "grounds";
        if (x.userData?.person || x.userData?.avatar || /person|avatar/i.test(x.name ?? "")) return "people";
        if (x.userData?.car || x.userData?.vehicle || /car|vehicle|sedan|kart/i.test(x.name ?? "")) return "cars";
        if (x.userData?.floor !== undefined || /floor|storey|building/i.test(x.name ?? "")) return "floors";
      }
      return "other";
    };
    tp.scene.traverse((o: any) => {
      const k = ownerOf(o);
      out[k] ??= { geo: 0, tex: 0 };
      const e = out[k];
      if (o.geometry && !seenG.has(o.geometry)) {
        seenG.add(o.geometry);
        e.geo += geoBytes(o.geometry);
        if (o.instanceMatrix) e.geo += o.instanceMatrix.array.byteLength;
      }
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])
        for (const v of Object.values(m) as any[])
          if (v?.isTexture && !seenT.has(v)) {
            seenT.add(v);
            e.tex += texBytes(v);
          }
    });
    void roots;
    const MB = (b: number) => Math.round(b / 104857.6) / 10;
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { geo: MB(v.geo), tex: MB(v.tex) }]));
  });
}

const firstAt = (rows: Sample[], f: (s: Sample) => boolean) => {
  const i = rows.findIndex(f);
  return i < 0 ? null : i + 1;
};

async function arrive() {
  const res: any[] = [];
  for (const q of QS) {
    const browser = await chromium.launch({ args: GPU });
    const { page, cdp } = await open(browser, q);
    for (const cpu of CPUS)
      for (const name of SPOTS) {
        const to = ALL_SPOTS[name];
        // (from town — arriving in town, from the road's 2 km) with the land there made, then slowed and gone
        await slow(cdp, 1);
        await teleport(page, name === "town" ? ALL_SPOTS.road2k : TOWN);
        await page.waitForTimeout(12000);
        await slow(cdp, cpu);
        await teleport(page, to);
        const rows: Sample[] = [];
        for (let s = 0; s < WAIT; s++) {
          await page.waitForTimeout(1000);
          rows.push(await sample(page, to));
        }
        const last = rows[rows.length - 1];
        const r = {
          q,
          cpu,
          spot: name,
          landAt: firstAt(rows, (x) => x.land === 0),
          asphaltAt: name.startsWith("road") ? firstAt(rows, (x) => x.asphalt) : undefined,
          nearAt: firstAt(rows, (x) => x.near === 0),
          districtsAt: firstAt(rows, (x) => x.district === 0),
          madeMax: Math.max(...rows.map((x) => x.made)),
          left: { land: last.land, district: last.district },
          heap: last.heap,
          fps: Math.round(rows.slice(-10).reduce((a, x) => a + x.fps, 0) / 10),
        };
        console.log(JSON.stringify(r));
        res.push({ ...r, rows });
      }
    await slow(cdp, 1);
    await browser.close();
  }
  writeFileSync(join(OUT, "arrive.json"), JSON.stringify(res, null, 1));
}

/** Along the long road from `from` m at `kmh` for `secs` (a teleport every 100 ms: the stream reads it as speed). */
async function driveAlong(page: Page, from: number, kmh: number, secs: number, each?: (s: Sample, m: number) => void) {
  const v = kmh / 3.6;
  const rows: Sample[] = [];
  const t0 = Date.now();
  let lastS = 0;
  for (;;) {
    const t = (Date.now() - t0) / 1000;
    if (t >= secs) break;
    const m = from + v * t;
    if (m >= ROAD_M - 20 || m < 0) break;
    const p = along(m);
    await teleport(page, { ...p, level: 0 });
    if (Math.floor(t) > lastS) {
      lastS = Math.floor(t);
      const s = await sample(page, p);
      rows.push(s);
      each?.(s, m);
    }
    await page.waitForTimeout(100);
  }
  return rows;
}

async function drive() {
  const res: any[] = [];
  for (const q of QS) {
    const browser = await chromium.launch({ args: GPU });
    const { page, cdp } = await open(browser, q);
    for (const cpu of CPUS)
      for (const kmh of KMH) {
        await slow(cdp, 1);
        await teleport(page, { ...along(0), level: 0 });
        await page.waitForTimeout(12000);
        await slow(cdp, cpu);
        const rows = await driveAlong(page, 0, kmh, DRIVE);
        const after = rows.slice(10);
        const r = {
          q,
          cpu,
          kmh,
          dirtS: after.filter((x) => !x.asphalt).length,
          of: after.length,
          landMissingMax: Math.max(...after.map((x) => x.land)),
          madeMax: Math.max(...rows.map((x) => x.made)),
          heap: rows[rows.length - 1]?.heap,
          fps: Math.round(after.reduce((a, x) => a + x.fps, 0) / Math.max(1, after.length)),
        };
        console.log(JSON.stringify(r));
        res.push({ ...r, rows });
      }
    await slow(cdp, 1);
    await browser.close();
  }
  writeFileSync(join(OUT, "drive.json"), JSON.stringify(res, null, 1));
}

async function soak() {
  const browser = await chromium.launch({ args: GPU });
  const { page, cdp } = await open(browser, QS.includes("high") ? "high" : QS[0]);
  await teleport(page, { ...along(0), level: 0 });
  await page.waitForTimeout(15000);
  const at = async (label: string) => {
    const heap = await gcHeap(page, cdp);
    const mem = await memdump(browser);
    const r = { label, heap, tab: mem.tab?.footprint, gpu: mem.gpu?.footprint };
    console.log(JSON.stringify(r));
    return { ...r, mem };
  };
  const out = [await at("start")];
  const there = await driveAlong(page, 0, 240, (SOAK_M / 240) * 3.6);
  await page.waitForTimeout(10000);
  out.push(await at("out there"));
  // and back (the same road, the other way)
  const v = 240 / 3.6;
  const t0 = Date.now();
  for (;;) {
    const m = Math.min(SOAK_M, ROAD_M - 20) - v * ((Date.now() - t0) / 1000);
    if (m <= 0) break;
    await teleport(page, { ...along(m), level: 0 });
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(15000);
  out.push(await at("back"));
  writeFileSync(join(OUT, "soak.json"), JSON.stringify({ out, there }, null, 1));
  await browser.close();
}

async function census() {
  const res: any[] = [];
  for (const q of QS) {
    const browser = await chromium.launch({ args: GPU });
    const { page, cdp } = await open(browser, q);
    for (const name of SPOTS) {
      await teleport(page, ALL_SPOTS[name]);
      await page.waitForTimeout(15000);
    }
    const heap = await gcHeap(page, cdp);
    const mem = await memdump(browser);
    const by = await owners(page);
    const r = { q, heap, tab: mem.tab?.footprint, gpu: mem.gpu?.footprint, by };
    console.log(JSON.stringify(r));
    console.log("  tab", JSON.stringify(mem.tab?.top));
    console.log("  gpu", JSON.stringify(mem.gpu?.top));
    res.push({ ...r, mem });
    await browser.close();
  }
  writeFileSync(join(OUT, "census.json"), JSON.stringify(res, null, 1));
}

await ({ arrive, drive, soak, census } as Record<string, () => Promise<void>>)[mode]?.();
