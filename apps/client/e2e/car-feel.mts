// (plan 93 A.1) A turn in town on the user's own roads: each tyre's slip angle, the body's slip, the ground, the
// arcade layer's yaw — FEEL=92 for plan 92's layer (`?feel=92`). After the door check of car-fixes.mts.
//   FEEL=92 node --experimental-strip-types e2e/car-feel.mts [url]
// Was: Each frame of a drive down Main Street: where the car and its model
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
await page.goto(`${base}/${process.env.FEEL ? `?feel=${process.env.FEEL}` : ""}`);
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
    await page.waitForTimeout(450);
    const door = await page.evaluate(() => {
      const C = (window as any).__yutopia.cars;
      const m = C.mine;
      if (!m) return null;
      const l = C.live.get(m.vid);
      const mod = l?.model;
      return { seat: m.seat, doors: l?.doors?.map((x: number) => +x.toFixed(2)), names: mod?.e?.doors, doorOf: mod?.doorOf?.(m.seat) };
    });
    console.log("door on entry", JSON.stringify(door));
    await page.waitForTimeout(2600);
    inCar = await page.evaluate(() => (window as any).__yutopia.cars.driving());
    if (inCar) break;
  }
}
console.log("driving", inCar);
if (!inCar) process.exit(1);


await page.waitForTimeout(2500);
await page.keyboard.down("KeyW");
await page.waitForTimeout(Number(process.env.RUN ?? 3200));
await page.keyboard.up("KeyW");
await page.keyboard.down(process.env.KEY ?? "KeyA");
const rows: number[][] = [];
let ground = "";
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(100);
  const r = await page.evaluate(() => {
    const m = (window as any).__yutopia.cars.mine;
    const s = m.sim;
    const w = s.wheels;
    return {
      v: Math.hypot(s.v.x, s.v.z) * 3.6,
      aF: ((Math.abs(w[0].alpha) + Math.abs(w[1].alpha)) / 2) * 57.3,
      aR: ((Math.abs(w[2].alpha) + Math.abs(w[3].alpha)) / 2) * 57.3,
      b: Math.abs(Math.atan2(-(s.v.x * Math.sin(0)) , 1)) ,
      ay: m.drive?.assistYaw ?? 0,
      g: w.map((x: any) => x.ground).join(","),
    };
  });
  rows.push([r.v, r.aF, r.aR, r.ay]);
  ground = r.g;
}
await page.keyboard.up(process.env.KEY ?? "KeyA");
const mx = (k: number) => Math.max(...rows.filter((r) => r[0] > 15).map((r) => Math.abs(r[k])));
if (process.env.ALL) for (const r of rows) console.log("  ", r.map((x) => x.toFixed(1)).join(" "));
console.log(`feel ${process.env.FEEL ?? "93"} · ${ground} · from ${rows[0][0].toFixed(0)} km/h: front α max ${mx(1).toFixed(1)}° · rear α max ${mx(2).toFixed(1)}° · assist yaw max ${mx(3).toFixed(2)} rad/s²`);
await page.keyboard.down("Space");
await page.waitForTimeout(1500);
await browser.close();
