// (plan 93 C) Getting in by hand: Ana stood 2.5 m off the town car's driver's door, X — walked to it, the door
// opened by her hand, in, shut from inside —, stills as she goes (OUT=dir); out again; then from the passenger's
// side: in by that door and across to the wheel (F3a). The door's opening and the hand's weight read each still.
//   OUT=dir node --experimental-strip-types e2e/car-getin.mts [url]
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
console.log("parked pose", JSON.stringify(pp));
// a spot `w` m to the car's side (−: the driver's), `u` along it
const at = (u: number, w: number) => ({
  x: pp.x + u * Math.cos(pp.a) - w * Math.sin(pp.a),
  y: pp.z + u * Math.sin(pp.a) + w * Math.cos(pp.a),
});
const state = () =>
  page.evaluate((id) => {
    const C = (window as any).__yutopia.cars;
    const l = C.live.get(`car:${id}`) ?? [...C.live.values()][0];
    if (!l) return { none: true, walking: !!C.walkIn };
    const ps = [...l.people.values()].map((e: any) => ({ seat: e.seat, via: e.via, x: +e.m.root.position.x.toFixed(2), z: +e.m.root.position.z.toFixed(2) }));
    return { doors: l.doors.map((d: number) => +d.toFixed(2)), by: l.doorBy, people: ps };
  }, car.id);
async function inFrom(w: number, tag: string) {
  const p = at(-0.4, w);
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), p);
  await page.waitForTimeout(2500);
  const k = await page.evaluate(() => (window as any).__hud.get().prompt?.kind ?? "");
  console.log(tag, "prompt", k);
  await page.evaluate(() => (window as any).__yutopia.interact());
  for (const ms of [300, 700, 1100, 1500, 1900, 2400, 3000]) {
    await page.waitForTimeout(ms === 300 ? 300 : 400);
    await page.screenshot({ path: `${out}/getin-${tag}-${ms}.png` });
    console.log(`  ${tag} ${ms} ms`, JSON.stringify(await state()));
  }
  await page.waitForTimeout(800);
  console.log(tag, "driving", await page.evaluate(() => (window as any).__yutopia.cars.driving()));
}
async function outAgain(tag: string) {
  await page.evaluate(() => (window as any).__yutopia.interact());
  for (const ms of [250, 600, 950, 1300]) {
    await page.waitForTimeout(ms === 250 ? 250 : 350);
    await page.screenshot({ path: `${out}/getout-${tag}-${ms}.png` });
    console.log(`  out ${tag} ${ms} ms`, JSON.stringify(await state()));
  }
  await page.waitForTimeout(1500);
}
await inFrom(-2.6, "driver");
await outAgain("driver");
await inFrom(2.6, "passenger");
await outAgain("passenger");
await browser.close();
