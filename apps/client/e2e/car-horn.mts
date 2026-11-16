// (plan 93 S3) The horn heard: H held 2 s in the town car — the view's sound (who's near turns to it) set again
// every 0.8 s, at the car.
//   node --experimental-strip-types e2e/car-horn.mts [url]
// Was: (plan 93 S2) A gun from the driver's seat: Ana in the town car, the revolver drawn (2), the right button —
// aimed out of her window (the view, a still) —, a shot (the server takes it: a round fewer); then going faster
// the same aim from outside (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-gunseat.mts [url]
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

await page.waitForTimeout(2000);
const out = process.env.OUT ?? "/tmp";
const loaded = () =>
  page.evaluate(() => {
    const y = (window as any).__yutopia;
    const inv = y.dark?.inv ?? y.darkInv?.() ?? null;
    return inv?.quick?.[0]?.loaded ?? (window as any).__loaded ?? null;
  });
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  y.room.onMessage("dark:pockets", (m: any) => ((window as any).__loaded = m.inv?.quick?.[0]?.loaded));
  y.room.send("mod:refill", { kit: true });
  y.room.send("mod:dark", { mode: "peaceful" });
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  (window as any).__heard = [];
  const tp = y.tp;
  const was = tp.heard.bind(tp);
  tp.heard = (x: number, yy: number, from?: string) => {
    (window as any).__heard.push({ t: performance.now(), x: +x.toFixed(1), y: +yy.toFixed(1), from });
    return was(x, yy, from);
  };
});
await page.keyboard.down("KeyH");
await page.waitForTimeout(2000);
await page.keyboard.up("KeyH");
await page.waitForTimeout(300);
const heard = await page.evaluate(() => (window as any).__heard);
const hornCar = await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  const l = C.live.get(C.mine.vid);
  return { x: +l.pose.p.x.toFixed(1), y: +l.pose.p.z.toFixed(1), me: (window as any).__yutopia.room.sessionId };
});
console.log("heard", heard.length, "times:", JSON.stringify(heard.map((h: any) => ({ ...h, t: Math.round(h.t - heard[0].t) }))), "the car at", JSON.stringify(hornCar));
await page.keyboard.down("Space");
await page.waitForTimeout(800);
await browser.close();
