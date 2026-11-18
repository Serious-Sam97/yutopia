// (plan 101) A bike ridden in the world: Ana on Main Street spawns one (KIND, default the BMX), gets on, pedals, sprints,
// turns, hops, wheelies — its state printed, a still at each (OUT=dir). Cleared after.
//   OUT=dir [KIND=bike_bmx] node --experimental-strip-types e2e/bike-ride.mts [url]
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp";
const kind = process.env.KIND ?? "bike_bmx";
const T0 = Date.now();
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
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
page.on("console", (m) => {
  if (m.type() === "error" || /bike/i.test(m.text())) console.log("  console:", m.text().slice(0, 300));
});
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", cam3p: "chase", maxFps: 0 }));
}, tok);
await page.goto(`${base}/`);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 240_000 },
);
console.log(`ready ${((Date.now() - T0) / 1000).toFixed(1)} s`);
await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 12 }));
// Main Street, out by its first town car
const spot = await page.evaluate(() => {
  const c = (window as any).__yutopia;
  let best: any = null;
  c.room.state.objects.forEach((x: any) => {
    if (x.kind === "car" && /^town-car/.test(x.id) && (!best || x.x < best.x)) best = x;
  });
  return best ? { x: best.x + 6, y: best.y + 6 } : { x: 0, y: 0 };
});
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), spot);
await page.waitForTimeout(1500);
await page.evaluate((k) => (window as any).__yutopia.room.send("mod:spawn-car", { model: k, colour: 1 }), kind);
const bike = await page
  .waitForFunction(
    (k: string) => {
      const c = (window as any).__yutopia;
      let id: string | null = null;
      c.room.state.objects.forEach((x: any) => {
        const p = JSON.parse(x.props);
        if (x.kind === "car" && p.model === k && p.spawnedBy && !p.driven) id = x.id;
      });
      return id;
    },
    kind,
    { timeout: 10_000 },
  )
  .then((h) => h.jsonValue());
console.log("spawned", bike);
await page.evaluate(() =>
  (window as any).__yutopia.room.onMessage("car:no", (m: any) => console.log("car:no", JSON.stringify(m))),
);
// beside it, its left
const at = await page.evaluate((id) => {
  const o = (window as any).__yutopia.room.state.objects.get(id);
  const p = JSON.parse(o.props);
  const a = Number(p.a ?? 0);
  return { x: o.x + 0.9 * Math.sin(a), y: o.y - 0.9 * Math.cos(a), a };
}, bike);
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), at);
await page.waitForTimeout(1200);
await page.evaluate((id) => (window as any).__yutopia.room.send("car:enter", { id, seat: 0 }), bike);
await page.waitForFunction(() => (window as any).__yutopia.cars.mine?.seat === 0, null, { timeout: 10_000 });
await page.waitForFunction(() => (window as any).__yutopia.cars.mine?.drive, null, { timeout: 15_000 });
// (sat: past the act)
await page.waitForTimeout(2600);
const state = (what: string) =>
  page.evaluate((w) => {
    const C = (window as any).__yutopia.cars;
    const d = C.mine?.drive;
    if (!d) return `${w}: no drive`;
    const s = d.s;
    const k = d.bk;
    const deg = (x: number) => ((x * 180) / Math.PI).toFixed(0);
    return `${w}: ${(Math.hypot(s.v.x, s.v.z) * 3.6).toFixed(1)} km/h roll ${deg(k.roll)} pitch ${deg(k.pitch)} cad ${k.cadence.toFixed(0)} g${k.gear} stand ${k.stand.toFixed(1)} air ${k.air.toFixed(2)} trick ${k.trick ?? "-"} fell ${k.fell?.why ?? "-"} ready ${C.live.get(C.mine.vid)?.model.ready}`;
  }, what);
const shot = async (name: string) => {
  await page.screenshot({ path: `${out}/bike-${name}.png` });
  console.log(await state(name), `→ ${out}/bike-${name}.png`);
};
await page
  .locator("canvas")
  .first()
  .click({ position: { x: 480, y: 320 } })
  .catch(() => {});
await shot("sat");
await page.keyboard.down("KeyW");
await page.waitForTimeout(3000);
await shot("pedal");
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(2500);
await shot("sprint");
await page.keyboard.up("ShiftLeft");
await page.keyboard.down("KeyD");
await page.waitForTimeout(900);
await shot("turn");
await page.keyboard.up("KeyD");
await page.waitForTimeout(800);
await page.keyboard.down("Space");
await page.waitForTimeout(450);
await shot("crouch");
await page.keyboard.up("Space");
await page.waitForTimeout(250);
await shot("hop");
await page.waitForTimeout(900);
await page.keyboard.down("KeyQ");
await page.waitForTimeout(1200);
await shot("wheelie");
await page.keyboard.up("KeyQ");
await page.keyboard.up("KeyW");
await page.waitForTimeout(400);
await page.keyboard.down("KeyS");
await page.waitForTimeout(2500);
await page.keyboard.up("KeyS");
await shot("stopped");
await page.keyboard.press("KeyX");
await page.waitForTimeout(2500);
await shot("off");
await page.evaluate(() => (window as any).__yutopia.room.send("mod:clear", {}));
await page.waitForTimeout(500);
console.log(`done ${((Date.now() - T0) / 1000).toFixed(1)} s`);
await browser.close();
