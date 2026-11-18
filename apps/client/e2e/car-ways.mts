// (plan 100) Every kind of vehicle parked in the world, every seat of it: in by its door (car:enter), the act held a
// moment in (`__actAt`), and the doorway the game measured for it read (`__actWay`: the door's opening, the seat, the
// floor, her legs, the feet sat) — written as the fixture the act's unit tests check every car and seat against.
//   OUT=src/world/car/ways.fixture.json node --experimental-strip-types e2e/car-ways.mts [url]
import { writeFileSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
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
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript(
  ([t]) => {
    localStorage.setItem("yutopia:token", t as string);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "low", view: "3p", maxFps: 0 }));
  },
  [tok] as const,
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
await page.waitForTimeout(2500);
// one parked car of each kind (its model's kind as the parked view has it)
const cars: { id: string; kind: string; x: number; z: number; a: number }[] = await page.evaluate(() => {
  const c = (window as any).__yutopia;
  const seen = new Map<string, any>();
  c.room.state.objects.forEach((x: any) => {
    const p = JSON.parse(x.props);
    const pk = c.cars.parked.get(x.id);
    if (x.kind !== "car" || p.driven || p.role === "show" || !pk?.pose || seen.has(pk.kind)) return;
    seen.set(pk.kind, { id: x.id, kind: pk.kind, x: pk.pose.x, z: pk.pose.z, a: pk.pose.a });
  });
  return [...seen.values()];
});
console.log("kinds:", cars.map((c) => c.kind).join(" "));
const out: Record<string, unknown> = {};
for (const car of cars) {
  for (let seat = 0; seat < 6; seat++) {
    await page.evaluate(
      (q) => (window as any).__yutopia.teleport({ x: q.x + 3 * Math.sin(q.a), y: q.z - 3 * Math.cos(q.a), level: 0 }),
      car,
    );
    await page.waitForTimeout(600);
    await page.evaluate(([id, s]) => (window as any).__yutopia.room.send("car:enter", { id, seat: s }), [
      car.id,
      seat,
    ] as const);
    const ok = await page
      .waitForFunction((s) => (window as any).__yutopia.cars.mine?.seat === s, seat, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!ok) break;
    await page.waitForFunction(
      () => {
        const C = (window as any).__yutopia.cars;
        return C.live.get(C.mine.vid)?.model.ready !== false;
      },
      null,
      { timeout: 15_000 },
    );
    const way = await page.evaluate(async () => {
      const W = window as any;
      W.__actWay = null;
      W.__actAt = { t: 0.5 };
      for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
      const w = W.__actWay;
      W.__actAt = null;
      if (!w) return null;
      const v = (p: any) => [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)];
      const C = W.__yutopia.cars;
      const mod = C.live.get(C.mine.vid).model;
      return {
        s: w.s,
        op: w.op,
        hip: v(w.hip),
        floor: +w.floor.toFixed(4),
        stand: +w.stand.toFixed(4),
        satHip: +w.satHip.toFixed(4),
        satFeet: w.satFeet.map(v),
        k: +w.k.toFixed(4),
        driver: w.driver,
        belt: w.belt === undefined ? null : +w.belt.toFixed(4),
        door: mod.doorOf ? mod.doorOf(C.mine.seat) : -1,
      };
    });
    console.log(` ${car.kind} seat ${seat}:`, way ? `door ${way.door}, out ${way.op?.out?.toFixed(2)}` : "no doorway");
    if (way) out[`${car.kind}/${seat}`] = way;
    await page.evaluate(() => (window as any).__yutopia.room.send("car:leave", {}));
    await page.waitForFunction(() => !(window as any).__yutopia.cars.mine, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}
const file = process.env.OUT ?? "/tmp/ways.json";
writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
console.log(`${Object.keys(out).length} doorways → ${file}`);
await browser.close();
