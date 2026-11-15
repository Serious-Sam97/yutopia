/* biome-ignore-all lint/suspicious/noExplicitAny: a bench reading the page's hooks and a trace */
// What's in a frame over 45 ms (docs/plan/90-the-friends-machines.md phase 7): a Chrome trace while Bia walks 20 s
// (SECS) on an M1's proxy (Low, the CPU 2.5× slower) at SPOT, the main thread's own CPU samples summed inside the
// long frames and inside normal ones (minified names: read them off the build's chunk at the column given).
//   URL (http://localhost:3107, a prod build) SPOT ('{"x":-24,"y":18,"level":0}') node --experimental-strip-types e2e/long-frames.mts
import { chromium, request } from "@playwright/test";

const base = process.env.URL ?? "http://localhost:3107";
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "bia@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "low", view: "3p", cam3p: "chase", maxFps: 0 }));
}, tok);
await page.goto(`${base}/`);
await page.waitForFunction(
  () => (window as any).__hud?.get().phase === "ready" && !(window as any).__hud.get().loading?.on,
  null,
  { timeout: 240_000 },
);
const spot = JSON.parse(process.env.SPOT ?? '{"x":-24,"y":18,"level":0}');
await page.evaluate((p) => (window as any).__yutopia.teleport(p), spot);
await page.waitForTimeout(9000);
await page.evaluate(() => {
  const c = (window as any).__yutopia;
  c.activeAt = performance.now() + 1e9;
});
const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 2.5 });
// walk back and forth
await page.evaluate(() => {
  const c = (window as any).__yutopia;
  const from = c.meAt();
  const pts = [{ x: from.x + 12, y: from.y }, { x: from.x, y: from.y + 10 }, { x: from.x - 10, y: from.y }, from];
  let i = 0;
  c.walkTo(pts[0]);
  (window as any).__pace = setInterval(() => {
    if (!c.path?.length) {
      i = (i + 1) % pts.length;
      c.walkTo(pts[i]);
    }
  }, 300);
});
await page.waitForTimeout(1500);
const events: any[] = [];
cdp.on("Tracing.dataCollected", (d: any) => events.push(...d.value));
const done = new Promise<void>((ok) => cdp.once("Tracing.tracingComplete", () => ok()));
await cdp.send("Tracing.start", {
  traceConfig: {
    includedCategories: [
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
      "v8.execute",
      "disabled-by-default-v8.cpu_profiler",
      "v8",
      "blink.user_timing",
    ],
  },
  transferMode: "ReportEvents",
} as any);
await page.waitForTimeout(Number(process.env.SECS ?? 20) * 1000);
await cdp.send("Tracing.end");
await done;
// frames: FireAnimationFrame (or the rAF's FunctionCall) on the main thread
const pid = events.find((e) => e.name === "TracingStartedInBrowser")?.args?.data?.frames?.[0]?.processId;
const frames = events.filter((e) => e.name === "FireAnimationFrame" && e.ph === "X" && e.dur > 0);
const long = frames.filter((e) => e.dur > 45_000);
console.log(
  "frames",
  frames.length,
  "over 45 ms",
  long.length,
  "durations",
  long.map((e) => Math.round(e.dur / 1000)).join(","),
);
// CPU samples (ProfileChunk): reconstruct node map + sample times
const mainTid = frames[0]?.tid;
const mainPid = frames[0]?.pid;
const ours = new Set<string>(
  events.filter((e) => e.name === "Profile" && e.tid === mainTid && e.pid === mainPid).map((e) => String(e.id)),
);
const nodes = new Map<number, any>();
const parent = new Map<number, number>();
const samples: { t: number; id: number }[] = [];
let t = 0;
for (const e of events) {
  if (!ours.has(String(e.id))) continue;
  if (e.name === "Profile") t = e.args?.data?.startTime ?? t;
  if (e.name !== "ProfileChunk") continue;
  const cp = e.args?.data?.cpuProfile;
  for (const n of cp?.nodes ?? []) {
    nodes.set(n.id, n);
    if (n.parent) parent.set(n.id, n.parent);
  }
  const ids = cp?.samples ?? [];
  const deltas = e.args?.data?.timeDeltas ?? [];
  for (let i = 0; i < ids.length; i++) {
    t += deltas[i] ?? 0;
    samples.push({ t, id: ids[i] });
  }
}
const name = (id: number) => {
  const cf = nodes.get(id)?.callFrame ?? {};
  return `${cf.functionName || "(anon)"} ${String(cf.url ?? "")
    .split("/")
    .pop()}:${(cf.lineNumber ?? 0) + 1}:${(cf.columnNumber ?? 0) + 1}`;
};
const tally = (wins: any[]) => {
  const self = new Map<string, number>();
  const incl = new Map<string, number>();
  let n = 0;
  for (const s of samples) {
    if (!wins.some((w) => s.t >= w.ts && s.t <= w.ts + w.dur)) continue;
    n++;
    self.set(name(s.id), (self.get(name(s.id)) ?? 0) + 1);
    const seen = new Set<string>();
    for (let x: number | undefined = s.id; x; x = parent.get(x)) {
      const k = name(x);
      if (!seen.has(k)) {
        seen.add(k);
        incl.set(k, (incl.get(k) ?? 0) + 1);
      }
    }
  }
  const top = (m: Map<string, number>, k: number) =>
    [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([a, b]) => `${((b / Math.max(1, n)) * 100).toFixed(0)}% ${a}`);
  return { n, self: top(self, 15), incl: top(incl, 40) };
};
const L = tally(long);
const N = tally(frames.filter((e) => e.dur < 30_000).slice(0, 200));
console.log(
  "LONG FRAMES samples",
  L.n,
  "\nSELF\n" + L.self.join("\n") + "\nINCL\n" + L.incl.filter((x) => !/\(root\)|\(program\)/.test(x)).join("\n"),
);
console.log("\nNORMAL FRAMES samples", N.n, "\nSELF\n" + N.self.slice(0, 10).join("\n"));
// GC and other main-thread events inside long frames
const gc = events.filter(
  (e) =>
    e.tid === mainTid &&
    /^(MinorGC|MajorGC|V8.GC_MC_BACKGROUND|V8.GCFinalizeMC|V8.GCIncrementalMarking)$/.test(e.name) &&
    e.ph === "X" &&
    long.some((w) => e.ts >= w.ts && e.ts <= w.ts + w.dur),
);
console.log("GC in long frames:", gc.map((e) => `${e.name} ${Math.round(e.dur / 1000)}ms`).join(", "));
await browser.close();
