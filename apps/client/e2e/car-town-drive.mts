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
    await page.waitForTimeout(3000);
    inCar = await page.evaluate(() => (window as any).__yutopia.cars.driving());
    if (inCar) break;
  }
}
console.log("driving", inCar);
if (!inCar) process.exit(1);
const cdp = await page.context().newCDPSession(page);
if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
await page.waitForTimeout(3000);
const vid = `car:${car.id}`;
const at = () =>
  page.evaluate((id) => {
    const v = (window as any).__yutopia.room.state.vehicles.get(id);
    return v ? { x: v.x, z: v.z, v: Math.hypot(v.vx, v.vz) } : null;
  }, vid);
// (the car's own entry in the room's state before the clock starts: read missing, its distance was counted
// from (0, 0) — the "523 m at 4 km/h" once in phase 10 was that: hypot(335, −400), the car never seen moving)
let a0 = await at();
for (let i = 0; i < 20 && !a0; i++) {
  await page.waitForTimeout(250);
  a0 = await at();
}
if (!a0) {
  console.log("no vehicle in the room's state for", vid);
  process.exit(1);
}
const t0 = await page.evaluate(() => {
  (window as any).__f = [];
  (window as any).__s = [];
  return performance.now();
});
if (process.env.PROF) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await cdp.send("Profiler.start");
}
// (a mark the profile can be lined up by: 40 ms of a function of its own, at a time the page knows)
const markAt: number = await page.evaluate(() => {
  const t = performance.now();
  const __mark92 = () => {
    const e = performance.now() + 40;
    while (performance.now() < e);
  };
  __mark92();
  return t;
});
await page.keyboard.down("KeyW");
let top = 0;
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(500);
  const p = await at();
  top = Math.max(top, p?.v ?? 0);
  console.log(`  t ${(i + 1) * 0.5}s x ${p?.x.toFixed(0)} z ${p?.z.toFixed(0)} v ${((p?.v ?? 0) * 3.6).toFixed(0)}`);
}
await page.keyboard.up("KeyW");
const f: number[] = await page.evaluate(() => (window as any).__f);
const st: number[][] = await page.evaluate(() => (window as any).__s ?? []);
const stalls = st.filter(([, d]) => d > 90);
console.log("  stalls (s from W, ms):", st.map(([t, d]) => `${((t - t0) / 1000).toFixed(1)}:${d}`).join(" "));
const a1 = await at();
const sorted = [...f].sort((a, b) => b - a);
const mean = f.reduce((s, x) => s + x, 0) / f.length;
console.log(
  `${quality} cpu×${cpu}: ${(1000 / mean).toFixed(1)} fps mean, >50ms ${f.filter((x) => x > 50).length}, worst ${sorted
    .slice(0, 3)
    .map((x) => x.toFixed(0))
    .join(
      "/",
    )} ms · top ${(top * 3.6).toFixed(0)} km/h · ${a1 ? `${Math.hypot(a1.x - a0.x, a1.z - a0.z).toFixed(0)} m` : "no vehicle at the end"}`,
);
if (process.env.PROF) {
  const { profile } = (await cdp.send("Profiler.stop")) as any;
  const byId = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const stack = (id: number) => {
    const out: string[] = [];
    for (let x: number | undefined = id; x !== undefined; x = parent.get(x)) {
      const f = byId.get(x).callFrame;
      out.push(`${f.functionName || "(anon)"}@${(f.url || "").split("/").pop()}:${f.lineNumber + 1}`);
    }
    return out;
  };
  let t = profile.startTime;
  const at: { t: number; id: number }[] = [];
  let markT = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i];
    at.push({ t, id: profile.samples[i] });
    if (!markT && stack(profile.samples[i]).some((f) => f.startsWith("__mark92"))) markT = t;
  }
  console.log("  mark found", !!markT);
  for (const [st, d] of stalls) {
    const end = markT + (st - markAt) * 1000;
    const begin = end - d * 1000;
    const self = new Map<string, number>();
    const incl = new Map<string, number>();
    let n = 0;
    for (const x of at) {
      if (x.t < begin || x.t > end) continue;
      n++;
      const s2 = stack(x.id);
      self.set(s2[0], (self.get(s2[0]) ?? 0) + 1);
      for (const f of new Set(s2)) incl.set(f, (incl.get(f) ?? 0) + 1);
    }
    console.log(`  stall ${d} ms (${n} samples)`);
    console.log(
      "   self:",
      [...self]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, v]) => `${k} ${v}`)
        .join(" | "),
    );
    console.log(
      "   incl:",
      [...incl]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([k, v]) => `${k} ${v}`)
        .join(" | "),
    );
  }
}
if (shot) await page.screenshot({ path: shot });
await page.keyboard.down("Space");
await page.waitForTimeout(3000);
await browser.close();
