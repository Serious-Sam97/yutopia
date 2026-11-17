// (plan 94 P2) Parts off a car in the world: Ana in Main Street's first town car, its right-front door, bonnet,
// boot lid, rear bumper and right mirror come off (its damage's wreck bits, as a crash sets them) — the pieces
// falling and lying (their height off the land, how far from their lie), the server's damage, and once she's out
// the parked car as everyone sees it; stills (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-wreck-drop.mts [url]
// (the same car each run: `mod:cars` puts it home first — run one at a time)
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
// what comes off: the right-front door, the bonnet, the boot lid, the rear bumper, the right mirror (WRECK's bits)
const off = 32 | 512 | 2048 | 8192 | 32768;
const vid = await page.evaluate((bits) => {
  const C = (window as any).__yutopia.cars;
  const m = C.mine;
  const l = C.live.get(m.vid);
  m.dmg.zones = [0.95, 0.8, 0.3, 0.9, 0];
  m.dmg.wreck |= bits;
  C.partsChanged(l, m.dmg);
  return m.vid;
}, off);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/drop-falling.png` });
await page.waitForTimeout(4000);
const lying = await page.evaluate(() => {
  const Y = (window as any).__yutopia;
  const C = Y.cars;
  return C.debris.bits.map((b: any) => {
    const q = b.o.quaternion;
    const d = q.angleTo(b.lie);
    const p = b.o.position;
    return { y: +(p.y - C.G.heightAt(p.x + C.root.position.x, p.z + C.root.position.z)).toFixed(2), off: +d.toFixed(2), t: +b.t.toFixed(1) };
  });
});
console.log("pieces", lying.length, JSON.stringify(lying));
const sv = await page.evaluate((id) => (window as any).__yutopia.room.state.vehicles.get(id)?.dmg, vid);
console.log("server's dmg", sv);
// out of it; stood off its right side
await page.keyboard.press("KeyX");
await page.waitForTimeout(3500);
const car2 = await page.evaluate((id) => {
  const Y = (window as any).__yutopia;
  const oid = id.replace(/^car:/, "");
  const o = Y.room.state.objects.get(oid);
  const p = Y.cars.parked.get(oid);
  const shown: Record<string, boolean> = {};
  const m = p?.full;
  for (const n of ["door_fr", "bonnet", "boot", "bumper_r", "mirror_r", "door_fl"]) {
    const pp = m?.parts?.get(n);
    if (pp) shown[n] = pp.outer.visible;
  }
  return { dmg: o ? JSON.parse(o.props).dmg : null, level: p?.level, shown, pose: p?.pose };
}, vid);
console.log("parked", JSON.stringify(car2));
if (car2.pose) {
  const pp = car2.pose;
  const at = { x: pp.x - Math.sin(pp.a) * 5 + Math.cos(pp.a) * 2.5, y: pp.z + Math.cos(pp.a) * 5 + Math.sin(pp.a) * 2.5 };
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), at);
  await page.waitForTimeout(3000);
  await page.evaluate(async (q) => {
    const y = (window as any).__yutopia;
    const V = y.tp.camera.position.constructor;
    let best = { yaw: 0, off: 9 };
    for (let i = 0; i < 24; i++) {
      const yaw = -Math.PI + (i / 24) * 2 * Math.PI;
      y.tp.yaw = yaw;
      await new Promise((r) => setTimeout(r, 100));
      const p = new V(q.x, q.h + 0.7, q.z).project(y.tp.camera);
      if (p.z < 1 && Math.abs(p.x) < best.off) best = { yaw, off: Math.abs(p.x) };
    }
    y.tp.yaw = best.yaw;
    y.tp.pitch = 0.18;
  }, { x: pp.x, z: pp.z, h: pp.y });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/drop-parked.png` });
}
await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await browser.close();
