// (plan 99 F5a) The way out holds you: in Main Street's first town car, out (X), then W held WAIT ms after — every frame
// my walker's place, my act's time and the body's root: no jump (teleport), the act hurried to its end, walking on
// from where she stood.
//   [WAIT=500] node --experimental-strip-types e2e/car-hold.mts [url]
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
await page.waitForTimeout(800);
await page.evaluate(() => {
  const W = window as any;
  const c = W.__yutopia;
  W.__h = [];
  const t0 = performance.now();
  const f = () => {
    const me = c.me;
    const e = c.cars.myExit();
    let b: number[] | null = null;
    for (const l of c.cars.live.values()) {
      const p = l.people.get(c.room.sessionId);
      if (p?.m?.root) {
        const v = p.m.root.getWorldPosition(p.m.root.position.clone());
        b = [+v.x.toFixed(2), +v.z.toFixed(2)];
      }
    }
    W.__h.push({
      t: Math.round(performance.now() - t0),
      me: [+me.x.toFixed(2), +me.y.toFixed(2)],
      act: e ? +(c.cars.time - e.gone).toFixed(2) : null,
      b,
      j: (() => { const m = c.tp?.body?.physics?.mover; return m ? [+m.p[0].toFixed(2), +m.p[2].toFixed(2), +m.p[1].toFixed(2)] : null; })(),
      z: +c.height.z.toFixed(2),
    });
    if (W.__h.length < 400) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  c.interact();
});
await page.waitForTimeout(Number(process.env.WAIT ?? 500));
await page.keyboard.down("KeyW");
const tw = await page.evaluate(() => (window as any).__h.at(-1).t);
await page.waitForTimeout(3000);
await page.keyboard.up("KeyW");
const h = await page.evaluate(() => (window as any).__h);
if (process.env.PROBE) {
  console.log(JSON.stringify(await page.evaluate(() => {
    const c = (window as any).__yutopia;
    const m = c.tp.body.physics.mover;
    const W = m.world;
    const e = (window as any).__h.find((s: any) => s.act !== null && s.act > 2.4);
    const [x, z] = e ? e.me : [c.me.x, c.me.y];
    const y = m.frame().elev + 1.62;
    const r: any = { veh: [...W.vehicleIds()], cars: W.carCount(), car: [...W.carrierKeys()] };
    for (const dz of [0, -0.2, -0.4, -0.5, 0.2, 0.4]) r["fits" + dz] = W.fits(x, y, z + dz, 0.3, 1.6);
    r.near = [...W.keys()].filter((k: string) => !/^land/.test(k)).slice(0, 40);
    return r;
  })));
}
let maxJ = 0, at = 0, end = 0;
for (let i = 1; i < h.length; i++) {
  const d = Math.hypot(h[i].me[0] - h[i - 1].me[0], h[i].me[1] - h[i - 1].me[1]);
  if (h[i].t > 200 && d > maxJ) ((maxJ = d), (at = h[i].t));
  if (h[i - 1].act !== null && h[i].act === null) end = h[i].t;
}
const ie = h.findIndex((s: any, i: number) => i > 0 && h[i - 1].act !== null && s.act === null);
for (const s of h.slice(Math.max(0, ie - 3), ie + 8)) console.log(JSON.stringify(s));
{
  const k = h.findIndex((s: any) => s.t === at);
  console.log("biggest step's frame:", h[k].t - h[k - 1].t, "ms");
}
console.log("W at", tw, "ms; act over at", end, "ms (", end - tw, "ms after W ); biggest step of my walker", maxJ.toFixed(2), "m at", at, "ms");
await browser.close();
