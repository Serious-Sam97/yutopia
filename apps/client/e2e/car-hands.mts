// (plan 93 D, S8) The driver's hands as the wheel turns, stood still: each wrist against the rim point it holds,
// the wheel's turn, the re-grips (hand over hand), where the head looks; stills from the cockpit (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-hands.mts [url]
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
const out = process.env.OUT ?? "/tmp";
// the cockpit
await page.keyboard.press("KeyC");
await page.waitForTimeout(1200);
const read = () =>
  page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    const l = C.live.get(C.mine.vid);
    let e: any = null;
    for (const p of l.people.values()) if (p.seat === 0) e = p;
    if (!e?.drv) return { none: true };
    const V = l.model.root.position.constructor;
    const gap = (S: "L" | "R") => {
      const g = e.drv.grips[S];
      const w = e.m.bones[`wrist${S}`].getWorldPosition(new V());
      return { moving: g.moving, gap: +w.distanceTo(g.a.getWorldPosition(new V())).toFixed(3) };
    };
    // the head's facing against the car's (+: to the driver's left)
    const hq = e.m.bones.head.getWorldQuaternion(new l.model.root.quaternion.constructor());
    const hf = new V(0, 0, 1).applyQuaternion(hq);
    const cq = l.model.root.getWorldQuaternion(new l.model.root.quaternion.constructor());
    const cf = new V(-1, 0, 0).applyQuaternion(cq);
    const cl = new V(0, 0, -1).applyQuaternion(cq); // (the model's −z: the driver's left? +z is its right)
    const yaw = Math.atan2(hf.dot(cl), hf.dot(cf));
    return { wheel: +((-l.model.steering.rotation.z * 180) / Math.PI).toFixed(0), L: gap("L"), R: gap("R"), head: +((yaw * 180) / Math.PI).toFixed(0) };
  });
console.log("straight:", JSON.stringify(await read()));
await page.screenshot({ path: `${out}/hands-0-straight.png` });
await page.keyboard.down("KeyD");
let regrips = 0;
let was = "";
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(60);
  const r: any = await read();
  const now = `${r.L?.moving}${r.R?.moving}`;
  if (now !== was && /true/.test(now)) regrips++;
  was = now;
  if (i === 6) await page.screenshot({ path: `${out}/hands-1-turning.png` });
  if (i % 5 === 0) console.log("  turning:", JSON.stringify(r));
}
console.log("re-grips seen:", regrips);
console.log("full lock:", JSON.stringify(await read()));
await page.screenshot({ path: `${out}/hands-2-lock.png` });
await page.keyboard.up("KeyD");
await page.waitForTimeout(1500);
console.log("back:", JSON.stringify(await read()));
// a turn at speed: the head against the seat, sideways (+ to the driver's left: the g pushes them out of a right turn)
const sideways = () =>
  page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    const l = C.live.get(C.mine.vid);
    let e: any = null;
    for (const p of l.people.values()) if (p.seat === 0) e = p;
    const V = l.model.root.position.constructor;
    const h = l.model.root.worldToLocal(e.m.bones.head.getWorldPosition(new V()));
    const s = l.model.seats[0].hip;
    return +((s.z - h.z) * 100).toFixed(1); // (model +z: the driver's left — they sit at +z) → cm to their right
  });
const h0 = await sideways();
await page.keyboard.down("KeyW");
await page.waitForTimeout(2500);
await page.keyboard.down("KeyD");
await page.waitForTimeout(700);
const h1 = await sideways();
await page.screenshot({ path: `${out}/hands-3-turn-at-speed.png` });
await page.keyboard.up("KeyD");
await page.keyboard.up("KeyW");
console.log(`head sideways: straight ${h0} cm, turning right at speed ${h1} cm (to the right; less = leaned left)`);
await page.keyboard.down("Space");
await page.waitForTimeout(800);
await browser.close();
