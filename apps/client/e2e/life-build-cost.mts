/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 7.4 (dev only) — the buildings' cost: on each floor (the lobby, Floor 1, the studio), out
// on the lot and in the town, the scene's draws and triangles (its own render, not the post's), its
// frames timed, its geometries, textures, programs and heap, in the look given (`life` or
// `life&build=old`), at noon, the camera held.
//   node --experimental-strip-types e2e/life-build-cost.mts [life|life&build=old|classic] [high|medium|low]
import { chromium, request } from "@playwright/test";

const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const look = process.argv[2] ?? "life";
const quality = process.argv[3] ?? "high";
const SPOTS: { name: string; x: number; y: number; level: number; yaw: number; pitch: number; dist: number }[] = [
  { name: "lobby", x: 3, y: 12, level: 0, yaw: Math.PI, pitch: 0.1, dist: 4 },
  { name: "floor1", x: 11, y: 10, level: 1, yaw: -Math.PI / 2, pitch: 0.3, dist: 8 },
  { name: "studio", x: 20, y: 12, level: 4, yaw: Math.PI, pitch: 0.45, dist: 6 },
  { name: "lot", x: -24, y: 18, level: 0, yaw: 0, pitch: 0.12, dist: 6 },
  { name: "town", x: 420, y: -420, level: 0, yaw: Math.PI / 2, pitch: 0.2, dist: 8 },
];

const ctx0 = await request.newContext();
const tok = (
  await (
    await ctx0.post(`${api}/api/login`, {
      data: { email: "ana@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" },
      headers: { Accept: "application/json" },
    })
  ).json()
).token;
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("page:", e.message));
await page.addInitScript(
  ([t, q]) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q }));
  },
  [tok, quality] as const,
);
// (the life look's files fetched — the people, their wear, the library's maps, the trees — and how long
// till the game's ready: plan 73 phase 11)
let lifeBytes = 0;
let lifeFiles = 0;
page.on("response", async (r) => {
  if (!r.url().includes("/life/")) return;
  try {
    lifeBytes += (await r.body()).length;
    lifeFiles++;
  } catch {}
});
const t0 = Date.now();
await page.goto(look === "classic" ? `${base}/` : `${base}/?look=${look}`);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 180_000 },
);
console.log(look, quality, "load", JSON.stringify({ readyS: (Date.now() - t0) / 1000 }));
for (const s of SPOTS) {
  await page.evaluate((s) => (window as any).__yutopia.teleport({ x: s.x, y: s.y, level: s.level }), s);
  await page.waitForTimeout(s.name === "town" ? 25000 : 12000);
  await page.evaluate((s) => {
    const w = (window as any).__yutopia;
    w.updateNight = () => {};
    w.tp.setHour(12);
    const tp = w.tp;
    tp.mode = "free";
    tp.yaw = s.yaw;
    tp.pitch = s.pitch;
    tp.dist = s.dist;
    tp.dragged = 1e12;
  }, s);
  await page.waitForTimeout(4000);
  const m = await page.evaluate(
    () =>
      new Promise((done) => {
        const w = window as any;
        const tp = w.__yutopia.tp;
        const r = tp.renderer;
        const scene = tp.scene;
        // (the scene's own render each frame: its draws and triangles, read straight after it)
        let calls = 0;
        let tris = 0;
        const render = r.render.bind(r);
        r.render = (s: unknown, c: unknown) => {
          render(s, c);
          if (s === scene) {
            calls = r.info.render.calls;
            tris = r.info.render.triangles;
          }
        };
        const gaps: number[] = [];
        let last = performance.now();
        const tick = (now: number) => {
          gaps.push(now - last);
          last = now;
          if (gaps.length < 241) requestAnimationFrame(tick);
          else {
            r.render = render;
            const g = gaps.slice(1).sort((a, b) => a - b);
            done({
              calls,
              tris,
              frameMs: +(g.reduce((a, b) => a + b, 0) / g.length).toFixed(2),
              p95Ms: +g[Math.floor(g.length * 0.95)].toFixed(2),
              geometries: r.info.memory.geometries,
              textures: r.info.memory.textures,
              heapMb: +((performance as any).memory?.usedJSHeapSize / 1e6).toFixed(1),
              programs: r.info.programs?.length ?? 0,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(look, quality, s.name, JSON.stringify(m));
}
console.log(look, quality, "life files", JSON.stringify({ files: lifeFiles, MB: +(lifeBytes / 1e6).toFixed(2) }));
await browser.close();
