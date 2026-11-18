// (plan 99 F3a) One car, people in it or not: in and out of Main Street's first town car; once it's parked, whether its
// parked self is the very model it was driven with, and how far it moved from where it was left.
//   node --experimental-strip-types e2e/car-one.mts [url]
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const quality = process.env.Q ?? "high";
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript(
  ([t, q]) => {
    localStorage.setItem("yutopia:token", t as string);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q, view: "3p", maxFps: 0 }));
    const W = window as any;
    W.__s = [];
    let last = performance.now();
    const tick = (t: number) => {
      if (t - last > 50) W.__s.push([t, Math.round(t - last)]);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  [tok, quality] as const,
);
await page.goto(`${base}/`);
await page.waitForFunction(() => {
  const h = (window as any).__hud?.get();
  return h?.phase === "ready" && h.loading?.on === false;
}, null, { timeout: 240_000 });
const cdp = await page.context().newCDPSession(page);
await page.evaluate(() => {
  const c = (window as any).__yutopia;
  c.room.send("mod:cars", {});
  c.room.send("mod:hour", { h: 12 });
});
const car = await page.waitForFunction(() => {
  const c = (window as any).__yutopia;
  const o: any[] = [];
  c.room.state.objects.forEach((x: any) => {
    const p = JSON.parse(x.props);
    if (x.kind === "car" && !p.driven && /^town-car/.test(x.id)) o.push({ id: x.id, x: x.x });
  });
  o.sort((a, b) => a.x - b.x);
  return o[0] && c.cars.parked.get(o[0].id)?.pose ? { id: o[0].id, pose: c.cars.parked.get(o[0].id).pose } : null;
}, null, { timeout: 20_000 }).then((h) => h.jsonValue());
const pp = car.pose;
// (by its driver's door, else its other side: the first with the car's prompt)
let prompted = false;
for (const w of [2.6, -2.6, 2.2, -2.2]) {
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), {
    x: pp.x - 0.4 * Math.cos(pp.a) + w * Math.sin(pp.a),
    y: pp.z - 0.4 * Math.sin(pp.a) - w * Math.cos(pp.a),
  });
  prompted = await page
    .waitForFunction(() => (window as any).__hud.get().prompt?.kind === "car", null, { timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  if (prompted) break;
}
if (!prompted) throw new Error("no car prompt by it");
await page.waitForTimeout(1500); // (settled: the long frames of arriving not counted)
await page.evaluate(() => (window as any).__yutopia.interact());
await page.waitForFunction(() => (window as any).__yutopia.cars.mine?.started, null, { timeout: 15_000 });
const before = await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  const l = C.live.get(C.mine.vid);
  (window as any).__liveModel = l.model;
  const p = l.model.root.position;
  return { id: C.mine.vid.slice(4), x: +p.x.toFixed(3), z: +p.z.toFixed(3) };
});
await page.evaluate(() => (window as any).__yutopia.interact());
const t0 = Date.now();
const after = await page.waitForFunction(
  (id) => {
    const C = (window as any).__yutopia.cars;
    const p = C.parked.get(id);
    if (!p?.full || C.live.get(`car:${id}`)) return null;
    const r = p.full.root.position;
    return { same: p.full === (window as any).__liveModel, x: +r.x.toFixed(3), z: +r.z.toFixed(3) };
  },
  before.id,
  { timeout: 15_000 },
).then((h) => h.jsonValue());
console.log("parked after", ((Date.now() - t0) / 1000).toFixed(1), "s:", JSON.stringify(after), "moved", Math.hypot(after.x - before.x, after.z - before.z).toFixed(3), "m");
await browser.close();
