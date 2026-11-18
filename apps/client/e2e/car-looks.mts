// (plan 98 phase 27) The look on the move, from beside the car (`__camPeek`): flat out (the rims blurred), braking hard
// (the nose down, the discs warm), at a stop (it rocks back); then the same at night. Stills in OUT=dir.
//   OUT=dir node --experimental-strip-types e2e/car-looks.mts [url]
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
// (the console's errors as it goes: the dev overlay's "issues")
const errs: string[] = [];
page.on("console", (m) => m.type() === "error" && errs.length < 8 && errs.push(m.text().slice(0, 300)));
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
await page.waitForFunction(() => (window as any).__yutopia.cars.mine?.started, null, { timeout: 20_000 });
const peek = (o: number[]) =>
  page.evaluate((o) => {
    const C = (window as any).__yutopia.cars;
    (globalThis as any).__camPeek = () => {
      const l = C.live.get(C.mine?.vid);
      if (!l) return null;
      const b = l.model.body;
      const V = b.position.constructor;
      const f = b.localToWorld(new V(o[0], o[1], o[2]));
      const t = b.localToWorld(new V(0.2, 0.6, 0));
      return { from: [f.x, f.y, f.z], to: [t.x, t.y, t.z] };
    };
  }, o);
await page.addStyleTag({ content: "* { visibility: hidden !important } canvas { visibility: visible !important }" });
for (const [tag, hour] of [["day", 12], ["night", 22]] as const) {
  await page.evaluate((h) => (window as any).__yutopia.room.send("mod:hour", { h }), hour);
  await page.waitForTimeout(600);
  await peek([0.3, 0.9, 5.2]);
  await page.keyboard.down("KeyW");
  await page.waitForFunction(() => { const C = (window as any).__yutopia.cars; const l = C.live.get(C.mine.vid); return Math.hypot(l.pose.v.x, l.pose.v.z) > 11; }, null, { timeout: 12_000 }).catch(() => {});
  await page.screenshot({ path: `${out}/looks-${tag}-speed.png` });
  await page.keyboard.up("KeyW");
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/looks-${tag}-brake.png` });
  await page.waitForFunction(() => { const C = (window as any).__yutopia.cars; const l = C.live.get(C.mine.vid); return Math.hypot(l.pose.v.x, l.pose.v.z) < 0.5; }, null, { timeout: 8_000 }).catch(() => {});
  await page.keyboard.up("KeyS");
  await page.screenshot({ path: `${out}/looks-${tag}-stop.png` });
  await peek([-5.5, 1.2, 1.4]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/looks-${tag}-front.png` });
}
await page.evaluate(() => {
  (globalThis as any).__camPeek = null;
  (window as any).__yutopia.room.send("mod:hour", { h: null });
});
console.log("console errors", JSON.stringify(errs, null, 1));
await browser.close();
