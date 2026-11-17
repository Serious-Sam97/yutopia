// (plan 93 S9, S10) Lock, alarm, drive-in: Ana buys a car at MOTORS (at night); L by it — locked (its flash); her
// own shot into it sets its alarm off (the lamps flashing, her phone told); in it, unlocked; the lights on, the
// radio on, stood still — the lamps stay on (plan 95 F2a: no drive-in dip); U flashes them. Stills (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-lock.mts [url]
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
let shown = 0;
page.on("pageerror", (e) => {
  if (shown++ < 2) console.log("  page:", e.message, (e.stack ?? "").split("\n").slice(0, 6).join(" / "));
});
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
const told: any[] = [];
await page.exposeFunction("__told", (m: any) => told.push(m));
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  y.room.onMessage("car:alarm", (m: any) => (window as any).__told(m));
  y.room.send("mod:hour", { h: 22 });
  y.room.send("mod:dark", { mode: "peaceful" });
  y.room.send("mod:refill", { kit: true });
});
// at MOTORS: bought
await page.evaluate(() => (window as any).__yutopia.teleport({ x: 512, y: -393.5, level: 0 }));
await page.waitForTimeout(3000);
const id = await page.evaluate(
  () =>
    new Promise<string>((ok) => {
      const y = (window as any).__yutopia;
      y.room.onMessage("car:bought", (m: any) => ok(m.id));
      y.room.send("car:buy", { model: "sedan", colour: 3, plate: "" });
    }),
);
console.log("bought", id);
await page.waitForFunction((i) => !!(window as any).__yutopia.cars.parked.get(i)?.full?.ready, id, { timeout: 30000 });
const pp = await page.evaluate((i) => (window as any).__yutopia.cars.parked.get(i).pose, id);
const at = (u: number, w: number) => ({ x: pp.x + Math.cos(pp.a) * u - Math.sin(pp.a) * w, y: pp.z + Math.sin(pp.a) * u + Math.cos(pp.a) * w });
const off = at(-1.5, 4.5);
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), off);
await page.waitForTimeout(2500);
await page.evaluate(([dx, dz]) => { (window as any).__yutopia.tp.yaw = Math.atan2(dz, dx); }, [pp.x - off.x, pp.z - off.y] as const);
await page.waitForTimeout(800);
console.log("prompt:", JSON.stringify(await page.evaluate(() => (window as any).__hud.get().prompt)));
// L: locked — its flash
await page.keyboard.press("KeyL");
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/lock-0-flash.png` });
await page.waitForTimeout(1500);
const props = () => page.evaluate((i) => JSON.parse((window as any).__yutopia.room.state.objects.get(i).props), id);
console.log("locked:", (await props()).locked);
// a shot into it (her own): its alarm
await page.keyboard.press("Digit2");
await page.waitForFunction(() => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).gun === "revolver", null, { timeout: 10000 });
await page.mouse.move(720, 450);
await page.mouse.down({ button: "right" });
await page.waitForTimeout(1200);
await page.evaluate(([t, g]) => {
  const y = (window as any).__yutopia;
  const me = y.room.state.players.get(y.room.sessionId);
  const oz = me.z + 1.35;
  const d = Math.hypot(t.x - me.x, t.y - me.y);
  y.room.send("arms:fire", { ox: me.x, oy: me.y, oz, yaw: Math.atan2(t.y - me.y, t.x - me.x), pitch: Math.atan2(g + 0.6 - oz, d), lag: 0, seed: 3 });
}, [at(-0.3, 0), pp.y] as const);
await page.waitForTimeout(1200);
await page.mouse.up({ button: "right" });
console.log("alarm:", (await props()).alarmAt ? "on" : "off", "told:", JSON.stringify(told));
await page.screenshot({ path: `${out}/lock-1-alarm.png` });
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/lock-1b-alarm.png` });
// in it: unlocked; the lights, the radio; still — the lamps stay on (plan 95 F2a); U flashes
await page.keyboard.press("Digit2");
const side = at(0.3, -1.6);
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), side);
await page.waitForTimeout(2000);
await page.evaluate((i) => (window as any).__yutopia.room.send("car:enter", { id: i, seat: 0 }), id);
await page.waitForTimeout(4000);
console.log("in; locked:", (await props()).locked ?? "no");
await page.keyboard.press("KeyL");
await page.keyboard.press("KeyR");
await page.waitForTimeout(800);
const lamps = () =>
  page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    const s = C.mine?.sim;
    const f = s ? C.flags(s) : 0;
    return { beams: C.beams, station: C.station, low: !!(f & 1), high: !!(f & 2) };
  });
console.log("lit:", JSON.stringify(await lamps()));
await page.waitForTimeout(4500);
console.log("still a while:", JSON.stringify(await lamps()));
await page.screenshot({ path: `${out}/lock-2-drivein.png` });
await page.keyboard.press("KeyU");
await page.waitForTimeout(100);
console.log("flashed:", JSON.stringify(await lamps()));
await page.keyboard.press("KeyY");
await page.waitForTimeout(1500);
await browser.close();
