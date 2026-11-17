// (plan 94 phase 9) The debris let go: a few parked cars' parts thrown (as many as it keeps, 16), then their two
// minutes — the pieces, their Jolt crates, the scene's objects and three's geometries before, during and after.
//   node --experimental-strip-types e2e/car-debris-freed.mts [url]
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const quality = process.argv[3] ?? "high";
const cpu = Number(process.argv[4] ?? 1);
const shot = process.argv[5];
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
page.on("console", (m) => /stall|long|slow/i.test(m.text()) && console.log("  console:", m.text().slice(0, 300)));
await page.addInitScript(
  ([t, q]) => {
    localStorage.setItem("yutopia:token", t as string);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q, view: "3p", cam3p: "chase", maxFps: 0 }));
    const W = window as any;
    W.__f = [];
    let last = performance.now();
    const tick = (t: number) => {
      W.__f.push(t - last);
      if (t - last > 50) {
        W.__s ??= [];
        W.__s.push([Math.round(t), Math.round(t - last)]);
      }
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  [tok, quality] as const,
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
await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await page.waitForTimeout(1500);
// a town car on Main Street, parked along it
const car = await page.evaluate(() => {
  const c = (window as any).__yutopia;
  const out: any[] = [];
  c.room.state.objects.forEach((o: any) => {
    const p = JSON.parse(o.props);
    if (o.kind !== "car" || p.driven || !/^town-car/.test(o.id)) return;
    out.push({ id: o.id, x: o.x, y: o.y, yaw: o.yaw, p });
  });
  out.sort((a, b) => a.x - b.x);
  return out[0];
});
console.log("car", JSON.stringify(car));
const pose = await page.evaluate((id) => {
  const c = (window as any).__yutopia;
  return c.cars.where().find((w: any) => w.id === id) ?? null;
}, car.id);
console.log("where", JSON.stringify(pose));

const out = process.env.OUT ?? "/tmp";
const pp = await page.evaluate((id) => (window as any).__yutopia.cars.parked.get(id)?.pose ?? null, car.id);
const fwd = [Math.cos(pp.a), Math.sin(pp.a)];
const right = [-Math.sin(pp.a), Math.cos(pp.a)];
const P = (u: number, w: number) => ({ x: pp.x + fwd[0] * u + right[0] * w, y: pp.z + fwd[1] * u + right[1] * w });
const stand = P(-0.3, 5.5);
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), stand);
await page.waitForTimeout(2500);
// thrown off three parked cars near: as many pieces as the debris keeps (16), on Jolt and on their own fall
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), P(-0.3, 5.5));
await page.waitForTimeout(4000);
const count = () =>
  page.evaluate(() => {
    const Y = (window as any).__yutopia;
    const C = Y.cars;
    const at: [number, number, number] = [0, 0, 0];
    const crates = C.debris.bits.filter((b: any) => b.id !== null && C.physics()?.carWorld.thingAt(b.id, at)).length;
    const kinds: Record<string, number> = {};
    for (const o of C.root.children) {
      const k = o.name || o.type;
      kinds[k] = (kinds[k] ?? 0) + 1;
    }
    return { pieces: C.debris.bits.length, crates, geometries: Y.tp.renderer.info.memory.geometries, inScene: C.root.children.length, kinds };
  });
const before = await count();
const thrown = await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  const me = (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId);
  const near = [...C.parked.values()]
    .filter((p: any) => p.full?.ready)
    .sort((a: any, b: any) => Math.hypot(a.pose.x - me.x, a.pose.z - me.y) - Math.hypot(b.pose.x - me.x, b.pose.z - me.y))
    .slice(0, 3);
  near.forEach((p: any, i: number) => C.partsOff(p.full, 0xffff, i ? { x: 0, y: 1, z: 0 } : { x: 0, y: 7.5, z: 0 }));
  return near.length;
});
await page.waitForTimeout(3000);
const during = await count();
console.log("cars", thrown, "before", JSON.stringify(before), "thrown", JSON.stringify(during));
// (two minutes, their time: every one let go — off the scene, out of Jolt, its copies' geometry freed)
await page.waitForTimeout(125_000);
const after = await count();
console.log("after 2 min", JSON.stringify(after));
await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await browser.close();
