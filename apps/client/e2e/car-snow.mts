// (plan 93 S6) The snow remembers: Ana given a set of chains, knelt at Main Street's town car's back wheels — the
// prompt, the kneel, each fitted (the car's props, the pack); the chains on its wheels; in it, pulled away hard: the
// roof's snow off in a slab; floored: no faster than 45 km/h; the tracks and ruts laid; stills (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-snow.mts [url]
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
const spec = await page.evaluate((id) => {
  const s = (window as any).__yutopia.cars.parked.get(id)?.spec;
  return { front: s.front, wheelbase: s.wheelbase, track: s.track, width: s.body.width };
}, car.id);
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  y.room.send("mod:refill", { chains: 4 });
  y.room.send("mod:hour", { h: 12 });
});
// a wheel's kneeling spot (as shared car/store.ts chainSpot)
const spot = (i: number) => {
  const u = i < 2 ? spec.front : -(spec.wheelbase - spec.front);
  const side = i % 2 === 0 ? -1 : 1;
  const w = side * (spec.width / 2 + 0.45);
  const c = Math.cos(pp.a);
  const s = Math.sin(pp.a);
  return { x: pp.x + c * u - s * w, y: pp.z + s * u + c * w };
};
const fit = async (i: number, still: boolean) => {
  const at = spot(i);
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), at);
  await page.waitForTimeout(2500);
  const prompt = await page.evaluate(() => (window as any).__hud.get().prompt);
  console.log(`wheel ${i} prompt:`, JSON.stringify(prompt));
  await page.evaluate(() => (window as any).__yutopia.interact());
  await page.waitForTimeout(2000);
  const k = await page.evaluate(() => {
    const y = (window as any).__yutopia;
    return { kneeling: [...y.tp.kneeling], me: y.room.sessionId, busy: y.room.state.players.get(y.room.sessionId).busy, prompt: (window as any).__hud.get().prompt?.label };
  });
  console.log("  knelt:", JSON.stringify(k));
  if (still) {
    // (the camera from behind her and a little up: her at the wheel)
    await page.screenshot({ path: `${out}/snow-0-kneeling.png` });
  }
  await page.waitForTimeout(4800);
  const done = await page.evaluate((id) => {
    const y = (window as any).__yutopia;
    const o = y.room.state.objects.get(id);
    return { chains: JSON.parse(o.props).chains ?? 0, have: y.walker?.dark?.countOf?.("chains") ?? y.cars.host?.items?.("chains") };
  }, car.id);
  console.log("  after:", JSON.stringify(done));
};
await fit(2, true);
await fit(3, false);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/snow-1-chained.png` });
console.log(
  "drawn:",
  await page.evaluate((id) => {
    const p = (window as any).__yutopia.cars.parked.get(id);
    return { chainBits: p?.full?.chainBits, meshes: p?.full?.chainMeshes?.length, level: p?.level };
  }, car.id),
);
// in, at the wheel (by its driver's door: between the front wheel's spot and the back's — the car's prompt)
let inCar = false;
for (const k of [0.5, 0.35, 0.65, 0.2]) {
  const a = spot(0);
  const b = spot(2);
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
  });
  await page.waitForTimeout(1500);
  const kind = await page.evaluate(() => (window as any).__hud.get().prompt?.kind ?? "");
  if (kind !== "car") continue;
  await page.evaluate(() => (window as any).__yutopia.interact());
  await page.waitForTimeout(4000);
  inCar = await page.evaluate(() => (window as any).__yutopia.cars.driving());
  if (inCar) break;
}
console.log("driving", inCar);
if (inCar) {
  const st = () =>
    page.evaluate(() => {
      const C = (window as any).__yutopia.cars;
      const l = C.live.get(C.mine.vid);
      return {
        kmh: +(Math.hypot(l.pose.v.x, l.pose.v.z) * 3.6).toFixed(1),
        snowK: +(l.snowK ?? 0).toFixed(2),
        accF: +(l.accF ?? 0).toFixed(1),
        slabs: C.slabs.list.length,
        chains: C.mine.drive?.chains,
        ruts: C.ruts.count,
      };
    });
  console.log("sat:", JSON.stringify(await st()));
  await page.keyboard.down("KeyW");
  let max = 0;
  let snapped = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    const s: any = await st();
    max = Math.max(max, s.kmh);
    if (s.slabs > 0 && !snapped) {
      snapped = true;
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${out}/snow-2-slab.png` });
    }
    if (i % 4 === 0) console.log("  going:", JSON.stringify(s));
  }
  await page.keyboard.up("KeyW");
  console.log("most:", max, "km/h");
  await page.keyboard.down("Space");
  await page.waitForTimeout(800);
}
await browser.close();
