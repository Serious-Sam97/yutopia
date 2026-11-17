// (plan 94 P5) A tyre out at speed: Ana up Main Street in its first town car at ~45 km/h, its front right tyre's
// part bit set as a shot sets it — her heading from then (the kick, the pull, hands off), the drive's flats, the
// rim's sparks; a still (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-burst.mts [url]
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
await page.goto(`${base}/${process.env.FEEL ? `?feel=${process.env.FEEL}` : ""}`);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 240_000 },
);
await page.evaluate(() => {
  const r = (window as any).__yutopia.room;
  r.send("mod:cars", {});
  // (the shared dev world may have her down, or the dark out: up, peaceful, midday)
  r.send("mod:heal", {});
  r.send("mod:dark", { mode: "peaceful" });
  r.send("mod:hour", { h: 12 });
});
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
// up Main Street, then its front right tyre out (as a shot sets it: the part's bit) — the kick, the pull, sparks
console.log("its damage", await page.evaluate(() => JSON.stringify((window as any).__yutopia.cars.mine.dmg)));
// (out of its spot along the kerb — the road's on its right —, then straight up the street)
await page.keyboard.down("KeyS");
await page.waitForTimeout(900);
await page.keyboard.up("KeyS");
await page.keyboard.down("Space");
await page.waitForTimeout(600);
await page.keyboard.up("Space");
await page.keyboard.down("KeyW");
await page.keyboard.down("KeyD");
await page.waitForTimeout(900);
await page.keyboard.up("KeyD");
await page.keyboard.down("KeyA");
await page.waitForTimeout(500);
await page.keyboard.up("KeyA");
await page.waitForTimeout(3000);
console.log("after 4 s", await page.evaluate(() => {
  const s = (window as any).__yutopia.cars.mine.sim;
  return `${(Math.hypot(s.v.x, s.v.z) * 3.6).toFixed(0)} km/h, rpm ${s.rpm.toFixed(0)}, gear ${s.gear}, wheels ${JSON.stringify(s.wheels.map((w: any) => [w.contact, w.ground, +w.slip.toFixed(1), +w.w.toFixed(1)]))}, thr ${s.thr}, brk ${s.brk}, p ${s.p.x.toFixed(1)},${s.p.y.toFixed(2)},${s.p.z.toFixed(1)}, hit ${JSON.stringify(s.hit)}, t ${s.t.toFixed(1)}, a ${Math.atan2(2 * (s.q.x * s.q.z - s.q.w * s.q.y), 1 - 2 * (s.q.y * s.q.y + s.q.z * s.q.z)).toFixed(2)}`;
}));
await page.screenshot({ path: `${out}/stuck.png` });
await page.keyboard.up("KeyW");
const before = await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  const s = C.mine.sim;
  const fx = 1 - 2 * (s.q.y * s.q.y + s.q.z * s.q.z);
  const fz = 2 * (s.q.x * s.q.z - s.q.w * s.q.y);
  (window as any).__spk = 0;
  const sp = C.sparks;
  const burst = sp.burst.bind(sp);
  sp.burst = (...a: any[]) => {
    (window as any).__spk++;
    return burst(...a);
  };
  C.mine.dmg.parts |= 8192; // (PART.flatFR)
  // (plan 96 F5a: its blowout, every frame — the front right's flat as far as it's gone)
  const m = C.live.get(C.mine.vid).model;
  (window as any).__flat = [];
  const t0 = performance.now();
  const rec = () => {
    (window as any).__flat.push([(performance.now() - t0) / 1000, m.flatK[1]]);
    if (performance.now() - t0 < 1200) requestAnimationFrame(rec);
  };
  rec();
  return { a: Math.atan2(fz, fx), kmh: Math.hypot(s.v.x, s.v.z) * 3.6 };
});
const rows: string[] = [];
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(250);
  if (i === 1) await page.screenshot({ path: `${out}/burst.png` });
  rows.push(
    await page.evaluate((a0) => {
      const C = (window as any).__yutopia.cars;
      const s = C.mine.sim;
      const fx = 1 - 2 * (s.q.y * s.q.y + s.q.z * s.q.z);
      const fz = 2 * (s.q.x * s.q.z - s.q.w * s.q.y);
      let d = Math.atan2(fz, fx) - a0;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return `${(d * 57.3).toFixed(1)}° ${(Math.hypot(s.v.x, s.v.z) * 3.6).toFixed(0)} km/h flats ${C.mine.drive.flats} sparks ${(window as any).__spk}`;
    }, before.a),
  );
}
console.log("at", before.kmh.toFixed(0), "km/h, then each 0.25 s:\n " + rows.join("\n "));
{
  const f = (await page.evaluate(() => (window as any).__flat)) as number[][];
  const half = f.find((r) => r[1] >= 0.5);
  const most = f.reduce((a, r) => (r[1] > a[1] ? r : a), [0, 0]);
  console.log(`its blowout: ${f.length} frames · half at ${half?.[0].toFixed(2)} s · deepest ${most[1].toFixed(2)} at ${most[0].toFixed(2)} s · last ${f[f.length - 1]?.[1].toFixed(2)}`);
}
await page.keyboard.down("Space");
await page.waitForTimeout(2500);
await page.keyboard.up("Space");
// (plan 95 F6a: stopped, its flat — the model's own word, and a still turned round to its front right wheel)
console.log(
  "flat state:",
  JSON.stringify(
    await page.evaluate(() => {
      const C = (window as any).__yutopia.cars;
      const m = C.live.get(C.mine.vid).model;
      return {
        flatY: m.flatY.map((x: number) => +x.toFixed(3)),
        body: [m.body.rotation.x, m.body.rotation.z, m.body.position.y].map((x: number) => +x.toFixed(4)),
        hubs: m.flatU.hub.value.map((h: any) => +h.w.toFixed(2)),
        rigFlats: C.mine.rig?.flats,
      };
    }),
  ),
);
if (process.env.OUT)
  for (const [k, yaw] of [["a", -1.0], ["b", -0.6]] as const) {
    await page.evaluate((y) => {
      const C = (window as any).__yutopia.cars;
      C.cam.look.yaw = y;
      C.cam.look.pitch = -0.05;
      C.mouseAt = C.time;
    }, yaw);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/burst-flat-${k}.png` });
  }
await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await browser.close();
