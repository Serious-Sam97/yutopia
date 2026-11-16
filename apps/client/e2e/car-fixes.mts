// (plan 92 feedback) The door on entry, the front wheels' turn, a turn's lean (a still). Was: Each frame of a drive down Main Street: where the car and its model
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

await page.waitForTimeout(2500);
const shotDir = process.env.OUT ?? "/tmp";
// standing: steer right, the front wheels read
await page.keyboard.down("KeyD");
await page.waitForTimeout(700);
const wheels = await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  const mod = C.mine.rig.model;
  const V = mod.root.position.constructor;
  const fwd = new V(-1, 0, 0).applyQuaternion(mod.root.getWorldQuaternion(new mod.root.quaternion.constructor()));
  const out: any[] = [];
  for (const w of mod.wheels) {
    if (!w.front) continue;
    const z = w.steer.getWorldDirection(new V()); // (its +z: the car's right in the file's frame — swung back as it turns right)
    out.push({ rotY: +w.steer.rotation.y.toFixed(3), rightAxisForward: +z.dot(fwd).toFixed(3) });
  }
  return { str: C.mine.sim.str, out };
});
console.log("steering right (D):", JSON.stringify(wheels), "→", wheels.out.every((w: any) => w.rightAxisForward < -0.05) ? "wheels turned RIGHT (ok)" : "wheels turned LEFT (wrong)");
await page.screenshot({ path: `${shotDir}/fix-steer-right.png` });
await page.keyboard.up("KeyD");
// a turn at speed, its lean
await page.keyboard.down("KeyW");
await page.waitForTimeout(3500);
await page.keyboard.down("KeyA");
await page.waitForTimeout(900);
const lean = await page.evaluate(() => {
  const s = (window as any).__yutopia.cars.mine.sim;
  const q = s.q;
  return { kmh: Math.hypot(s.v.x, s.v.z) * 3.6, roll: Math.asin(2 * (q.y * q.z - q.w * q.x)) * 57.3 };
});
console.log("turning at", lean.kmh.toFixed(0), "km/h: roll", lean.roll.toFixed(1), "°");
await page.screenshot({ path: `${shotDir}/fix-lean.png` });
await page.keyboard.up("KeyA");
await page.keyboard.up("KeyW");
await page.keyboard.down("Space");
await page.waitForTimeout(2000);
await browser.close();
