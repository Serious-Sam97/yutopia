// (plan 93 S4) The boot: Ana behind Main Street's town car — the prompt, X: its lid up and the pack open on what's
// in it; a box of rounds put in from her pockets, then taken out; stills (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-boot.mts [url]
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

const out = process.env.OUT ?? "/tmp";
const pp = await page.evaluate((id) => (window as any).__yutopia.cars.parked.get(id)?.pose ?? null, car.id);
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  y.room.send("mod:refill", { kit: true });
  y.room.send("mod:hour", { h: 12 });
});
// behind it, a little further back and to its side (so the camera, behind her, sees the boot)
const at = (u: number, w: number) => ({ x: pp.x + Math.cos(pp.a) * u - Math.sin(pp.a) * w, y: pp.z + Math.sin(pp.a) * u + Math.cos(pp.a) * w });
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), at(-3.1, -0.4));
await page.waitForTimeout(3000);
// face the car: the view turned to it
await page.evaluate((q) => {
  const y = (window as any).__yutopia;
  y.tp.yaw = Math.atan2(q.dz, q.dx);
}, { dx: Math.cos(pp.a), dz: Math.sin(pp.a) });
await page.waitForTimeout(800);
const prompt = await page.evaluate(() => (window as any).__hud.get().prompt);
console.log("prompt:", JSON.stringify(prompt));
await page.evaluate(() => (window as any).__yutopia.interact());
await page.waitForTimeout(1500);
const store = await page.evaluate(() => (window as any).__yutopia.cars.store());
console.log("open:", JSON.stringify(store && { kind: store.kind, label: store.label, items: store.items }));
console.log(
  "lid:",
  await page.evaluate((id) => {
    const C = (window as any).__yutopia.cars;
    const p = C.parked.get(id);
    const part = p?.full?.parts?.get("boot");
    return { opening: C.lids.get(id), drawn: part ? +part.anim.rotation.z.toFixed(2) + "/" + part.anim.rotation.y.toFixed(2) : "no boot part", level: p?.level };
  }, car.id),
);
await page.screenshot({ path: `${out}/boot-open.png` });
// a stack from her pockets in (as the pack's drag does: its drop, routed to the boot)
const slot = await page.evaluate(() => {
  const y = (window as any).__yutopia;
  const st = y.cars.store();
  // (the first pocket with a stack)
  return st ? 0 : -1;
});
await page.evaluate((s) => {
  const y = (window as any).__yutopia;
  const st = y.cars.store();
  for (let i = 0; i < 8; i++) y.room.send("car:put", { kind: st.kind, id: st.id, from: i });
  void s;
}, slot);
await page.waitForTimeout(1500);
console.log("in it:", JSON.stringify(await page.evaluate(() => (window as any).__yutopia.cars.store()?.items)));
await page.screenshot({ path: `${out}/boot-filled.png` });
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  const st = y.cars.store();
  y.room.send("car:take", { kind: st.kind, id: st.id, i: -1 });
});
await page.waitForTimeout(1200);
console.log("taken out:", JSON.stringify(await page.evaluate(() => (window as any).__yutopia.cars.store()?.items)));
await page.keyboard.press("Escape");
await page.waitForTimeout(1500);
console.log("closed:", JSON.stringify(await page.evaluate(() => (window as any).__yutopia.cars.store())));
await page.screenshot({ path: `${out}/boot-closed.png` });
await browser.close();
