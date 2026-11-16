// (plan 93 S1) Rounds into a parked car: Ana armed on the street side of Main Street's town car, a round each
// into its front door, its back door, its front side window, its front tyre and its wing — sent as her client
// sends a shot, from her muzzle at each spot —; what the server says each struck, the car's damage and holes
// after, and stills of it (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-shots.mts [url]
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
const fwd = [Math.cos(pp.a), Math.sin(pp.a)];
const right = [-Math.sin(pp.a), Math.cos(pp.a)];
const P = (u: number, w: number) => ({ x: pp.x + fwd[0] * u + right[0] * w, y: pp.z + fwd[1] * u + right[1] * w });
const stand = P(-0.3, 5.5);
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), stand);
await page.waitForTimeout(2500);
const heard: any[] = [];
await page.exposeFunction("__carShot", (m: any) => heard.push(m));
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  y.room.onMessage("car:shot", (m: any) => (window as any).__carShot(m));
  y.room.send("mod:hour", { h: 12 });
  y.room.send("mod:dark", { mode: "peaceful" });
  y.room.send("mod:refill", { kit: true });
});
await page.waitForTimeout(1500);
await page.keyboard.press("Digit2");
await page.waitForFunction(() => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).gun === "revolver", null, { timeout: 10000 });
await page.mouse.move(720, 450);
await page.mouse.down({ button: "right" });
await page.waitForTimeout(1200);
const spots: [string, number, number][] = [
  ["front door", -0.35, 0.62],
  ["back door", -1.2, 0.66],
  ["front side window", -0.2, 1.18],
  ["front tyre", 1.37, 0.32],
  ["the wing", 1.75, 0.72],
];
for (const [name, u, h] of spots) {
  const r = await page.evaluate(
    ([t, h, g]) => {
      const y = (window as any).__yutopia;
      const me = y.room.state.players.get(y.room.sessionId);
      const oz = me.z + 1.35;
      const tz = (g as number) + (h as number);
      const d = Math.hypot((t as any).x - me.x, (t as any).y - me.y);
      const msg = { ox: me.x, oy: me.y, oz, yaw: Math.atan2((t as any).y - me.y, (t as any).x - me.x), pitch: Math.atan2(tz - oz, d), lag: 0, seed: 7 };
      y.room.send("arms:fire", msg);
      return msg;
    },
    [P(u, 0), h, pp.y] as const,
  );
  await page.waitForTimeout(800);
  console.log(`  ${name}:`, JSON.stringify(heard[heard.length - 1]?.hits?.map((x: any) => x.struck) ?? "nothing"), r.pitch.toFixed(3));
}
await page.mouse.up({ button: "right" });
const props = await page.evaluate((id) => JSON.parse((window as any).__yutopia.room.state.objects.get(id).props), car.id);
console.log("dmg", props.dmg, "holes", props.holes);
// close: stood a little off it, looking at its side
const near = P(-0.6, 3.2);
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), near);
await page.waitForTimeout(2500);
// (the view turned to it: the heading that has its middle nearest the picture's)
const best = await page.evaluate(async (q) => {
  const y = (window as any).__yutopia;
  const V = y.tp.camera.position.constructor;
  let best = { yaw: 0, off: 9 };
  for (let i = 0; i < 24; i++) {
    const yaw = -Math.PI + (i / 24) * 2 * Math.PI;
    y.tp.yaw = yaw;
    await new Promise((r) => setTimeout(r, 120));
    const p = new V(q.x, q.h + 0.8, q.z).project(y.tp.camera);
    if (p.z < 1 && Math.abs(p.x) < best.off) best = { yaw, off: Math.abs(p.x) };
  }
  y.tp.yaw = best.yaw;
  y.tp.pitch = 0.12;
  return best;
}, { x: pp.x, z: pp.z, h: pp.y });
console.log("view", JSON.stringify(best));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/shot-car-side.png` });
await browser.close();
