// (plan 101 feedback) A fall's freeze: ridden, thrown off, the frames' gaps after and where the bike ends up.
// (from bike-tricks.mts) Tricks in the world: a BMX on the town square, a hop with a tailwhip, a hop with a 360 held round,
// a wheelie; what each landing was. (OUT unused.)
// (from bike-poses.mts) The rider's poses on each bike, held (`__bikeRider`) and shot from its side (and a three-
// quarter): the cranks round in quarters, stood on the pedals, crouched for a hop, a foot down, each trick halfway.
// One sheet a bike (OUT=dir: poses-<kind>.png). Ana spawns each on the town square, gets on, the shots, gets off.
//   OUT=dir [KINDS=bike_town,bike_bmx,bike_mtb,bike_road] [VIEW=side|34] node --experimental-strip-types e2e/bike-poses.mts
import { writeFileSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp";
const kinds = (process.env.KINDS ?? "bike_town,bike_bmx,bike_mtb,bike_road").split(",");
const view = process.env.VIEW ?? "side";
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
page.on(
  "console",
  (m) =>
    (m.type() === "warning" || m.type() === "error") && console.log("  console:", m.type(), m.text().slice(0, 400)),
);
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
await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 12 }));
const frames = (n = 3) =>
  page.evaluate(
    (k) =>
      new Promise<void>((res) => {
        let i = 0;
        const f = () => (++i >= k ? res() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );

await page.evaluate(() => (window as any).__yutopia.teleport({ x: 405, y: -382, level: 0 }));
await page.waitForTimeout(2500);
await page.evaluate(() => (window as any).__yutopia.room.send("mod:spawn-car", { model: "bike_bmx", colour: 2 }));
const id = await page
  .waitForFunction(
    () => {
      const c = (window as any).__yutopia;
      let id: string | null = null;
      c.room.state.objects.forEach((x: any) => {
        const p = JSON.parse(x.props);
        if (x.kind === "car" && p.model === "bike_bmx" && p.spawnedBy && !p.driven && !p.retire) id = x.id;
      });
      return id;
    },
    null,
    { timeout: 10_000 },
  )
  .then((h) => h.jsonValue());
const at = await page.evaluate((id) => {
  const o = (window as any).__yutopia.room.state.objects.get(id);
  const p = JSON.parse(o.props);
  return { x: o.x + 1 + Number(p.dx ?? 0) - 0.9 * Math.sin(Number(p.a ?? 0)), y: o.y + 1 + Number(p.dz ?? 0) };
}, id);
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), at);
await page.waitForTimeout(1000);
await page.evaluate((id) => (window as any).__yutopia.room.send("car:enter", { id, seat: 0 }), id);
await page.waitForFunction(() => (window as any).__yutopia.cars.mine?.drive, null, { timeout: 15_000 });
await page.waitForTimeout(2600);
await page
  .locator("canvas")
  .first()
  .click({ position: { x: 480, y: 320 } })
  .catch(() => {});
const state = () =>
  page.evaluate(() => {
    const d = (window as any).__yutopia.cars.mine?.drive;
    if (!d) return "off the bike";
    const L = d.bk.landed;
    return `${(Math.hypot(d.s.v.x, d.s.v.z) * 3.6).toFixed(0)} km/h air ${d.bk.air.toFixed(2)} trick ${d.bk.trick ?? "-"} fell ${d.bk.fell?.why ?? "-"} landed ${L ? `${L.clean ? "clean" : L.why} [${L.tricks}] turns ${L.turns} wobble ${L.wobble.toFixed(2)}` : "-"}`;
  });

const K = page.keyboard;
await K.down("KeyW");
await page.waitForTimeout(1500);
console.log("rolling:", await state());
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
await cdp.send("Profiler.start");
await page.evaluate(() => {
  const w = window as any;
  w.__long = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) w.__long.push([Math.round(e.startTime - w.__t0), Math.round(e.duration)]);
  }).observe({ type: "longtask", buffered: false });
  w.__fell = [];
  const me = () => w.__yutopia.room.state.players.get(w.__yutopia.room.sessionId);
  const iv = setInterval(() => {
    const p = me();
    let seats = "";
    w.__yutopia.room.state.vehicles.forEach((v: any) => (seats += `[${v.seats}]`));
    const C = w.__yutopia.cars;
    w.__fell.push(
      `${Math.round(performance.now() - w.__t0)}:${p.fellAt ? "F" : "-"}${C.mine ? `M(${C.mine.vid},${C.mine.seat})` : ""}${C.coast ? "C" : ""} t${C.time?.toFixed(1)} want${C.coastWant} sid${w.__yutopia.room.sessionId}${seats.slice(0, 40)}`,
    );
    if (w.__fell.length > 40) clearInterval(iv);
  }, 100);
  w.__yutopia.room.onMessage("car:thrown", () => w.__fell.push(`thrown@${Math.round(performance.now() - w.__t0)}`));
  w.__gaps = [];
  let last = performance.now();
  const f = () => {
    const n = performance.now();
    w.__gaps.push(Math.round(n - last));
    last = n;
    if (w.__gaps.length < 600) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  w.__t0 = performance.now();
  w.__yutopia.cars.mine.drive.throwOff("crash");
});
await K.up("KeyW");
await page.waitForTimeout(3000);
const { profile } = await cdp.send("Profiler.stop");
const self = new Map<string, number>();
const dt = profile.timeDeltas ?? [];
const idx = new Map(profile.nodes.map((n: any) => [n.id, n]));
(profile.samples ?? []).forEach((id: number, i: number) => {
  const n: any = idx.get(id);
  const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`;
  self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
});
console.log(
  "top self ms:",
  [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([k, v]) => `${v.toFixed(0)} ${k}`)
    .join("\n  "),
);
console.log("long tasks:", await page.evaluate(() => JSON.stringify((window as any).__long)));
console.log("states:", await page.evaluate(() => (window as any).__fell.join(" ")));
await page.waitForTimeout(2000);
const res = await page.evaluate(() => {
  const w = window as any;
  const g: number[] = w.__gaps;
  const big = g.map((x, i) => [i, x]).filter(([, x]) => x > 100);
  const C = w.__yutopia.cars;
  const me = w.__yutopia.room.state.players.get(w.__yutopia.room.sessionId);
  const coast = C.coast?.drive;
  return JSON.stringify({
    frames: g.length,
    big,
    mine: !!C.mine,
    coast: coast ? { roll: coast.bk.roll, v: Math.hypot(coast.s.v.x, coast.s.v.z) } : null,
    busy: me.busy,
    fellAt: me.fellAt,
  });
});
console.log("after:", res);
await page.waitForTimeout(3000);
console.log(
  "parked:",
  await page.evaluate((id) => {
    const o = (window as any).__yutopia.room.state.objects.get(id);
    return o ? o.props : null;
  }, id),
);
await page.waitForTimeout(1500);
const png = await page.evaluate((id) => {
  const c = (window as any).__yutopia;
  const p = c.cars.parked.get(id);
  if (!p?.full) return null;
  const tp = c.tp;
  const cam = tp.camera.clone();
  const root = p.full.root;
  const V = cam.position.constructor;
  const t = root.localToWorld(new V(0, 0.3, 0));
  cam.position.copy(root.localToWorld(new V(-1.5, 1.6, 2.6)));
  cam.lookAt(t);
  cam.updateMatrixWorld(true);
  tp.renderer.render(tp.scene, cam);
  return tp.renderer.domElement.toDataURL("image/png");
}, id);
if (png) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`${process.env.OUT ?? "/tmp"}/fallen.png`, Buffer.from(png.split(",")[1], "base64"));
  console.log("still: fallen.png");
}
await page.evaluate(() => (window as any).__yutopia.room.send("mod:clear", {}));
await page.waitForTimeout(400);
await browser.close();
