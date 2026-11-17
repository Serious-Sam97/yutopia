// (plan 98) Getting in and out, recorded in real time from the player's own view (a video: screenshots lag hundreds
// of ms, a video doesn't): Ana 2.6 m off Main Street's first town car's driver's door, X — walked to the door, in —,
// X — out —; then the same from the passenger's side (in, across to the wheel). Prints MARK lines (ms) to cut the
// video by. OUT=dir node --experimental-strip-types e2e/car-act-video.mts [url]
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
const vctx = await browser.newContext({ viewport: { width: 960, height: 600 }, recordVideo: { dir: process.env.OUT ?? "/tmp", size: { width: 960, height: 600 } } });
const page = await vctx.newPage();
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
console.log("MARK start", Date.now());
await page.goto(`${base}/`);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 240_000 },
);
await page.evaluate(() => {
  (window as any).__yutopia.room.send("mod:cars", {});
  (window as any).__yutopia.room.send("mod:hour", { h: 12 });
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
  console.log("MARK in", tag, Date.now());
  await page.waitForTimeout(4000);
  await page.waitForTimeout(800);
  console.log(tag, "driving", await page.evaluate(() => (window as any).__yutopia.cars.driving()));
}
async function outAgain(tag: string) {
  await page.evaluate(() => (window as any).__yutopia.interact());
  console.log("MARK out", tag, Date.now());
  // (the doors as it goes: each live car's, and whether it's still live — every 300 ms)
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(300);
    if (process.env.DOORS)
      console.log(`  doors ${tag} ${(i + 1) * 300}`, JSON.stringify(await page.evaluate(() => {
        const C = (window as any).__yutopia.cars;
        return [...C.live.values()].map((l: any) => ({ id: l.id, linger: !!l.linger, people: l.people.size, doors: l.doors.map((d: number) => +d.toFixed(2)), by: l.doorBy }));
      })));
  }
}
await inFrom(-2.6, "driver");
await outAgain("driver");
await inFrom(2.6, "passenger");
await outAgain("passenger");
await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: null }));
await vctx.close();
await browser.close();
