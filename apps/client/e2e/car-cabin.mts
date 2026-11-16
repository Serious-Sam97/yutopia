// (plan 93 S5) The cabin: Ana at the wheel of Main Street's town car — N winds her window down (the wire's bit, the
// glass gone from its door, her cabin's seal), at a cruise her arm out on the sill, then up again; a crash (its speed
// lost at once, as a wall would): the belt's jolt, the blur, her cabin's people thrown; stills (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-cabin.mts [url]
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
await page.waitForTimeout(2000);
const out = process.env.OUT ?? "/tmp";
const state = () =>
  page.evaluate(() => {
    const W = window as any;
    const C = W.__yutopia.cars;
    const l = C.live.get(C.mine.vid);
    const v = W.__yutopia.room.state.vehicles.get(C.mine.vid);
    let e: any = null;
    for (const p of l.people.values()) if (p.seat === 0) e = p;
    const door = l.model.doorOf(0);
    const name = l.model.e.doors[door];
    let glass = 0;
    l.model.parts.get(name)?.holder.traverse((x: any) => {
      const n = x.material?.name;
      if (x.isMesh && (n === "glass" || n === "glass_tint") && x.visible) glass++;
    });
    const V = l.model.root.position.constructor;
    const wl = l.model.body.worldToLocal(e.m.bones.wristL.getWorldPosition(new V()));
    return {
      win: v.win,
      lwin: l.win,
      glassShown: glass,
      seal: +C.cabinSeal().toFixed(2),
      kmh: +(Math.hypot(l.pose.v.x, l.pose.v.z) * 3.6).toFixed(0),
      sill: +(e.sill ?? 0).toFixed(2),
      wristL: [+wl.x.toFixed(2), +wl.y.toFixed(2), +wl.z.toFixed(2)],
      hip: [+l.model.seats[0].hip.x.toFixed(2), +l.model.seats[0].hip.y.toFixed(2), +l.model.seats[0].hip.z.toFixed(2)],
      crash: l.crash ? { k: +l.crash.k.toFixed(2), dir: l.crash.dir } : null,
      filter: W.__yutopia.tp?.renderer?.domElement?.style.filter ?? "?",
      sillAt: l.model.sillOf?.(0),
    };
  });
console.log("sat:", JSON.stringify(await state()));
await page.keyboard.press("KeyN");
await page.waitForTimeout(900);
console.log("N (down):", JSON.stringify(await state()));
// the arm out, stood still (the probe's: told it's at a cruise), from round it and from the seat
await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  const orig = C.armOut.bind(C);
  C.__armOut = orig;
  C.armOut = (l: any, e: any, a: number, g: any, dt: number) => orig(l, e, a, { ...g, v: 10 }, dt);
});
await page.waitForTimeout(1300);
console.log("  stood, told cruising:", JSON.stringify(await state()));
for (const [k, yaw] of [["a", 0.9], ["c", 1.5], ["d", 2.3]] as const) {
  await page.evaluate((y) => {
    const C = (window as any).__yutopia.cars;
    C.cam.look.yaw = y;
    C.cam.look.pitch = -0.15;
    C.mouseAt = C.time;
  }, yaw);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/cabin-s${k}-arm-out.png` });
}
await page.keyboard.press("KeyC");
await page.waitForTimeout(1300);
await page.screenshot({ path: `${out}/cabin-s-cockpit.png` });
await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  C.cam.look.yaw = 1.2;
  C.cam.look.pitch = -0.35;
  C.mouseAt = C.time;
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/cabin-s-cockpit-left.png` });
await page.keyboard.press("KeyC");
await page.keyboard.press("KeyC");
await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  C.armOut = C.__armOut;
  C.cam.look.yaw = 0;
  C.cam.look.pitch = 0;
});
await page.waitForTimeout(800);
// a cruise down the street : the arm out on the sill
await page.keyboard.down("KeyW");
let snapped = 0;
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(150);
  if (i > 16) await page.keyboard.up("KeyW");
  const st: any = await state();
  if (i % 3 === 0) console.log("  cruising:", JSON.stringify(st));
  if (st.sill >= 0.99 && snapped === 0) {
    snapped = 1;
    await page.screenshot({ path: `${out}/cabin-0-arm-out-chase.png` });
    await page.keyboard.up("KeyW");
    // (from its side: the camera turned round it, held there — both ways)
    for (const [k, yaw] of [["a", 0.7], ["c", 1.0], ["b", -1.5]] as const) {
      await page.evaluate((y) => {
        const C = (window as any).__yutopia.cars;
        C.cam.look.yaw = y;
        C.cam.look.pitch = -0.1;
        C.mouseAt = C.time;
      }, yaw);
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        const C = (window as any).__yutopia.cars;
        C.mouseAt = C.time;
      });
      await page.screenshot({ path: `${out}/cabin-0${k}-arm-out-side.png` });
    }
    await page.keyboard.press("KeyC");
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(1300);
    console.log("  cockpit:", JSON.stringify(await state()));
    await page.screenshot({ path: `${out}/cabin-1-arm-out-cockpit.png` });
    await page.keyboard.press("KeyC");
    await page.keyboard.press("KeyC");
    // (and the brakes: no wall this time)
    await page.keyboard.down("KeyS");
    await page.waitForTimeout(1600);
    await page.keyboard.up("KeyS");
    break;
  }
}
// a crash: the speed it has, lost at once (as a wall would take it — as if doing 50 km/h along its nose a frame before)
const jolt = await page.evaluate(async () => {
  const C = (window as any).__yutopia.cars;
  const l = C.live.get(C.mine.vid);
  let e: any = null;
  for (const p of l.people.values()) if (p.seat === 0) e = p;
  const V = l.model.root.position.constructor;
  // (its nose: the model's −x)
  const q = l.model.root.getWorldQuaternion(new l.model.root.quaternion.constructor());
  const f = new V(-1, 0, 0).applyQuaternion(q);
  l.prevV.set(l.pose.v.x + f.x * 14, l.pose.v.y, l.pose.v.z + f.z * 14);
  const head0 = l.model.body.worldToLocal(e.m.bones.head.getWorldPosition(new V())).x;
  let most = 0;
  const filters = new Set<string>();
  const cv = (window as any).__yutopia.tp?.renderer?.domElement;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    filters.add(cv?.style.filter ?? "?");
    const h = l.model.body.worldToLocal(e.m.bones.head.getWorldPosition(new V())).x;
    if (Math.abs(h - head0) > Math.abs(most)) most = h - head0;
  }
  return { crash: l.crash, headMovedCm: +(most * 100).toFixed(1), filters: [...filters] };
});
console.log("crash:", JSON.stringify(jolt));
await page.screenshot({ path: `${out}/cabin-2-after-crash.png` });
console.log("after:", JSON.stringify(await state()));
await page.keyboard.press("KeyN");
await page.waitForTimeout(900);
console.log("N (up):", JSON.stringify(await state()));
await page.keyboard.down("Space");
await page.waitForTimeout(500);
await browser.close();
