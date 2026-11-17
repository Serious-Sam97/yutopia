// (plan 98 phases 4, 6) Out on the move: Ana at the wheel of Main Street's first town car, flat out ~2 s, X — thrown out
// (down on the ragdoll past 15 km/h); her door flung open and swinging on its hinge as the car rolls on. Prints the
// speed, her fall, and the door's angle every 100 ms.
//   node --experimental-strip-types e2e/car-jump.mts [url]
import { execFileSync } from "node:child_process";
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp";
const seat = Number(process.env.SEAT ?? 0);
const views = (process.env.VIEWS ?? "side,front,back").split(",");
const T0 = Date.now();
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", cam3p: "chase", maxFps: 0 }));
}, tok);
await page.goto(`${base}/`);
await page.waitForFunction(() => {
  const h = (window as any).__hud?.get();
  return h?.phase === "ready" && h.loading?.on === false;
}, null, { timeout: 240_000 });
await page.evaluate(() => {
  const c = (window as any).__yutopia;
  c.room.send("mod:cars", {});
  c.room.send("mod:hour", { h: 12 });
});
const frames = (n = 2) =>
  page.evaluate((k) => new Promise<void>((res) => {
    let i = 0;
    const f = () => (++i >= k ? res() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);
// a town car on Main Street, parked along it
const car = await page.waitForFunction((kind: string) => {
  const c = (window as any).__yutopia;
  const o: any[] = [];
  c.room.state.objects.forEach((x: any) => {
    const p = JSON.parse(x.props);
    const pk = c.cars.parked.get(x.id);
    if (x.kind !== "car" || p.driven || p.role === "show") return;
    if (kind ? pk?.kind === kind : /^town-car/.test(x.id)) o.push({ id: x.id, x: x.x });
  });
  o.sort((a, b) => a.x - b.x);
  return o[0] && c.cars.parked.get(o[0].id)?.pose ? { id: o[0].id, pose: c.cars.parked.get(o[0].id).pose } : null;
}, process.env.KIND ?? "", { timeout: 20_000 }).then((h) => h.jsonValue());
const pp = car.pose;
const side = seat === 1 ? 1 : -1;
const spot = { x: pp.x - 0.4 * Math.cos(pp.a) - side * 2.2 * Math.sin(pp.a), y: pp.z - 0.4 * Math.sin(pp.a) + side * 2.2 * Math.cos(pp.a) };
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), spot);
await page.waitForFunction((q) => {
  const m = (window as any).__yutopia.me?.() ?? (window as any).__yutopia.cars.host?.me?.();
  return !m || Math.hypot(m.x - q.x, m.y - q.y) < 0.6;
}, spot, { timeout: 8000 }).catch(() => {});
await page.evaluate(([id, s]) => (window as any).__yutopia.room.send("car:enter", { id, seat: s }), [car.id, seat] as const);
await page.waitForFunction((s) => (window as any).__yutopia.cars.mine?.seat === s, seat, { timeout: 10_000 });
// (its model's file in)
await page.waitForFunction(() => {
  const C = (window as any).__yutopia.cars;
  return C.live.get(C.mine.vid)?.model.ready !== false;
}, null, { timeout: 15_000 });
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(700);
  console.log("state", JSON.stringify(await page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    const m = C.mine;
    return { started: m?.started, crankAt: m?.crankAt, crankS: m?.crankS, rpm: m?.sim?.rpm, actT: C.myActT(), t: C.time };
  })));
}
await page.keyboard.down("KeyW");
await page.waitForFunction(() => {
  const C = (window as any).__yutopia.cars;
  const l = C.live.get(C.mine?.vid);
  return l && Math.hypot(l.pose.v.x, l.pose.v.z) > 7;
}, null, { timeout: 15_000 }).catch(() => console.log("never got going"));
const vid = await page.evaluate(() => (window as any).__yutopia.cars.mine.vid);
console.log("speed", await page.evaluate((v) => { const l = (window as any).__yutopia.cars.live.get(v); return +Math.hypot(l.pose.v.x, l.pose.v.z).toFixed(1); }, vid));
await page.keyboard.press("KeyX");
await page.keyboard.up("KeyW");
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(100);
  console.log(i * 100 + 100, JSON.stringify(await page.evaluate((v) => {
    const c = (window as any).__yutopia;
    const l = c.cars.live.get(v);
    const p = c.room.state.players.get(c.room.sessionId);
    return { mine: !!c.cars.mine, fell: p.fellAt > 0, hit: p.hitAt > 0, v: l ? +Math.hypot(l.pose.v.x, l.pose.v.z).toFixed(1) : null, doors: l?.doors.map((d: number) => +d.toFixed(2)) };
  }, vid)));
}
await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: null }));
await browser.close();
