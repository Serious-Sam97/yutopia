// (plan 92 feedback: the backward flicks) Each frame of a drive down Main Street: where the car and its model
// and the camera are, its speed and gear — the frames where it moves back, or stops a frame.
//   node --experimental-strip-types e2e/car-jerk.mts [url] [quality]
// Plan 92 phase 10's drive: Ana in Main Street's first town car, held flat out west down the street ~12 s on a prod
// build (`next start -p 3107`) — the frames over 50 ms and when (s from the throttle), the worst, top speed, distance.
// PROF=1 (best on the dev client, :3100: names) adds a CPU profile of each stall over 90 ms, lined up by a mark.
//   node --experimental-strip-types e2e/car-town-drive.mts [url] [quality: high|low] [cpu slowdown] [still.png]
// (the same car each run: `mod:cars` puts it home first — run them one after another, never two at once)
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3107";
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
// by it, then in
await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 1.6, y: p.y + 1.6, level: 0 }), car);
await page.waitForTimeout(6000);
let inCar = false;
for (const [dx, dy] of [
  [1.4, 1.0],
  [-1.4, 1.0],
  [1.4, -1.0],
  [-1.4, -1.0],
  [1.0, 1.4],
  [-1.0, 1.4],
  [1.0, -1.4],
  [-1.0, -1.4],
]) {
  await page.evaluate(
    ([x, y]) => (window as any).__yutopia.teleport({ x, y, level: 0 }),
    [car.x + 1 + dx, car.y + 1 + dy],
  );
  await page.waitForTimeout(1200);
  const k = await page.evaluate(() => (window as any).__hud.get().prompt?.kind ?? "");
  if (/^car/.test(k)) {
    await page.evaluate(() => (window as any).__yutopia.interact());
    await page.waitForTimeout(3000);
    inCar = await page.evaluate(() => (window as any).__yutopia.cars.driving());
    if (inCar) break;
  }
}
console.log("driving", inCar);
if (!inCar) process.exit(1);

await page.waitForTimeout(2500);
await page.evaluate(() => {
  const W = window as any;
  W.__j = [];
  const C = W.__yutopia.cars;
  let last = performance.now();
  const tick = (t: number) => {
    const m = C.mine;
    const s = m?.sim;
    const tp = W.__yutopia.tp ?? null;
    if (s) {
      const r = m.rig?.model?.root;
      const cam = C.camScratch;
      W.__j.push([t - last, s.p.x, s.p.z, s.v.x, s.v.z, s.gear, s.rpm, r ? r.position.x : 0, r ? r.position.z : 0, cam ? cam.position.x : 0, cam ? cam.position.z : 0, s.wheels.map((w: any) => (w.contact ? 1 : 0)).join(""), s.thr ?? 0, m.drive?.s === s ? 1 : 0]);
    }
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.keyboard.down("KeyW");
await page.waitForTimeout(Number(process.env.SECS ?? 10) * 1000);
await page.keyboard.up("KeyW");
await page.waitForTimeout(400);
const rows: any[] = await page.evaluate(() => (window as any).__j);
// the car against the camera, along its heading: smooth if they agree; a frame's sudden step toward the
// camera (the car falling back) is a flick
const rel: number[] = [];
const dts: number[] = [];
for (let i = 1; i < rows.length; i++) {
  const [dt, , , vx, vz, , , rx, rz, cx, cz] = rows[i];
  const sp = Math.hypot(vx, vz);
  if (sp < 3) continue;
  rel.push(((rx - cx) * vx + (rz - cz) * vz) / sp);
  dts.push(dt);
}
const d1: number[] = [];
for (let i = 1; i < rel.length; i++) d1.push(rel[i] - rel[i - 1]);
for (let i = 0; i < d1.length; i++) if (Math.abs(d1[i]) > 0.04) console.log(`  #${i} dt ${dts[i + 1].toFixed(1)} prev ${dts[i].toFixed(1)} next ${(dts[i + 2] ?? 0).toFixed(1)} Δ ${(d1[i] * 100).toFixed(1)} cm`);
const back = d1.filter((x) => x < -0.04).length;
const big = d1.filter((x) => Math.abs(x) > 0.08).length;
const rms = Math.sqrt(d1.reduce((s, x) => s + x * x, 0) / d1.length);
const ds = [...dts].sort((x, y) => x - y);
console.log(`frames ${rel.length} · dt p10 ${ds[Math.floor(ds.length * 0.1)].toFixed(1)} p50 ${ds[Math.floor(ds.length / 2)].toFixed(1)} p90 ${ds[Math.floor(ds.length * 0.9)].toFixed(1)} ms`);
console.log(`car vs camera per frame: rms ${(rms * 100).toFixed(1)} cm · back >4 cm ${back} · |jump| >8 cm ${big} · worst ${(Math.min(...d1) * 100).toFixed(1)} cm`);
await page.keyboard.down("Space");
await page.waitForTimeout(2000);
await browser.close();
