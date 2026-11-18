// (plan 99 phase 5) The probe's look in the paint: Ana in Main Street's first town car, a camera by its front wing
// (`__camPeek`), at noon and at night, the reflection probe on and off. Stills in OUT=dir: reflect-<on|off>-<h>.png.
//   OUT=dir node --experimental-strip-types e2e/car-reflect.mts [url]
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp";
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
for (const rf of ["on", "off"]) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on("pageerror", (e) => console.log("  page:", e.message));
  await page.addInitScript(
    ([t, rf]) => {
      localStorage.setItem("yutopia:token", t);
      localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", cam3p: "chase", maxFps: 0, carReflect: rf }));
    },
    [tok, rf] as const,
  );
  await page.goto(`${base}/`);
  await page.waitForFunction(() => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  }, null, { timeout: 240_000 });
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
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
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), {
    x: pp.x - 0.4 * Math.cos(pp.a) + 2.2 * Math.sin(pp.a),
    y: pp.z - 0.4 * Math.sin(pp.a) - 2.2 * Math.cos(pp.a),
  });
  await page.waitForTimeout(1500);
  await page.evaluate((id) => (window as any).__yutopia.room.send("car:enter", { id, seat: 0 }), car.id);
  await page.waitForFunction(() => (window as any).__yutopia.cars.mine?.started, null, { timeout: 20_000 });
  await page.addStyleTag({ content: "* { visibility: hidden !important } canvas { visibility: visible !important }" });
  await page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    (globalThis as any).__camPeek = () => {
      const l = C.live.get(C.mine.vid);
      if (!l) return null;
      const b = l.model.body;
      const V = b.position.constructor;
      const f = b.localToWorld(new V(-3.2, 1.5, 2.6));
      const t = b.localToWorld(new V(-0.6, 0.7, 0.5));
      return { from: [f.x, f.y, f.z], to: [t.x, t.y, t.z] };
    };
  });
  for (const h of [12, 22]) {
    await page.evaluate((h) => (window as any).__yutopia.room.send("mod:hour", { h }), h);
    // (the probe caught again after the hour's light is in)
    const at = await page.evaluate(() => (window as any).__yutopia.cars.envFaceAt.length);
    await page.waitForTimeout(3000);
    if (rf === "on")
      await page.waitForFunction((n) => (window as any).__yutopia.cars.envFaceAt.length >= Math.min(24, n + 12), at, { timeout: 30_000 }).catch(() => console.log("  (no probe cycle)"));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/reflect-${rf}-${h}.png` });
    console.log("still", `${out}/reflect-${rf}-${h}.png`);
  }
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: null }));
  await page.close();
}
await browser.close();
