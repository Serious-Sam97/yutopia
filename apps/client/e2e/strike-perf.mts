// Plan 114 checks: frame times in the Strike Park's match on Low (10 players: me and 9 bots; a smoke, a fire, an HE,
// a flash), and the renderer's memory over map swaps (geometries, textures, programs back where they were).
// node --experimental-strip-types e2e/strike-perf.mts [base] [quality] [swaps]
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const quality = process.argv[3] ?? "low";
const swaps = Number(process.argv[4] ?? 3);
const P = { x: -270, z: -735 };
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "bia@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(
  ([t, q]) => {
    localStorage.setItem("yutopia:token", t as string);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q, view: "3p", cam3p: "chase", maxFps: 0 }));
  },
  [tok, quality] as const,
);
await page.goto(`${base}/`);
await page.waitForFunction(() => (window as any).__hud?.get()?.phase === "ready" && (window as any).__hud.get().loading?.on === false, null, {
  timeout: 240_000,
});
const send = (t: string, m: unknown) => page.evaluate(([a, b]) => (window as any).__yutopia.room.send(a, b), [t, m] as const);
const frames = (secs: number) =>
  page.evaluate(
    (s) =>
      new Promise<{ fps: number; p95: number; worst: number }>((res) => {
        const d: number[] = [];
        let last = performance.now();
        const t0 = last;
        const f = (t: number) => {
          d.push(t - last);
          last = t;
          if (t - t0 < s * 1000) requestAnimationFrame(f);
          else {
            d.sort((a, b) => a - b);
            res({ fps: Math.round(1000 / (d.reduce((a, b) => a + b, 0) / d.length)), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), worst: +d[d.length - 1].toFixed(1) });
          }
        };
        requestAnimationFrame(f);
      }),
    secs,
  );
const mem = () =>
  page.evaluate(() => {
    const i = (window as any).__yutopia.tp.renderer.info;
    return { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0 };
  });
await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 20, y: p.z + 122, level: 0 }), P);
await page.waitForTimeout(6000);
await send("strike:leave", {});
await page.waitForTimeout(500);
await send("strike:join", { squad: 0, mode: "competitive" });
await page.waitForTimeout(4000);
for (const it of ["smoke", "molotov", "he", "flash"]) await send("strike:buy", { item: it });
await page.waitForTimeout(1500);
console.log(quality, "in the match, warmup:", JSON.stringify(await frames(5)));
for (const k of ["smoke", "molotov", "he", "flash"]) {
  await page.evaluate((kind) => (window as any).__strike.nadeSel = (window as any).__yutopia.room.state.strike.members.get((window as any).__yutopia.room.sessionId).nades.split(",").indexOf(kind), k);
  await page.keyboard.press("KeyJ");
  await page.waitForTimeout(300);
}
await page.waitForTimeout(2200);
console.log(quality, "smoke + fire + HE + flash:", JSON.stringify(await frames(5)));
await send("strike:leave", {});
await page.waitForTimeout(1000);
const before = await mem();
const order = ["freight", "lodge", "sawmill"];
for (let i = 0; i < swaps; i++) {
  const key = order[i % order.length];
  await send("strike:map", { key });
  await page.waitForFunction((k) => {
    const s = (window as any).__strike;
    return s.mapKey === k && s.mapUp && !s.rising && !s.show3d && !s.leaving.length;
  }, key, { timeout: 60_000 });
  console.log("swap", key, JSON.stringify(await mem()));
}
if (order[(swaps - 1) % order.length] !== "sawmill") {
  await send("strike:map", { key: "sawmill" });
  await page.waitForFunction(() => (window as any).__strike.mapKey === "sawmill" && (window as any).__strike.mapUp && !(window as any).__strike.show3d, null, { timeout: 60_000 });
}
console.log("before", JSON.stringify(before), "after", JSON.stringify(await mem()));
await browser.close();
