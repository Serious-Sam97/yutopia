// (plan 94 P3) Each pane on its own: Ana's rounds into Main Street's first town car — its front side window twice
// (cracked, then gone), the rear side window once, then from behind its rear window twice — each pane's state on
// the server and on the model (its glass shown, its crack), the shards in the air; stills (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-glass.mts [url]
// (the same car each run: `mod:cars` puts it home first — run one at a time)
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
const fire = async (name: string, u: number, w: number, h: number) => {
  await page.evaluate(
    ([t, h, g]) => {
      const y = (window as any).__yutopia;
      const me = y.room.state.players.get(y.room.sessionId);
      const oz = me.z + 1.35;
      const tz = (g as number) + (h as number);
      const d = Math.hypot((t as any).x - me.x, (t as any).y - me.y);
      y.room.send("arms:fire", { ox: me.x, oy: me.y, oz, yaw: Math.atan2((t as any).y - me.y, (t as any).x - me.x), pitch: Math.atan2(tz - oz, d), lag: 0, seed: 7 });
    },
    [P(u, w), h, pp.y] as const,
  );
  await page.waitForTimeout(900);
  const st = await page.evaluate((id) => {
    const y = (window as any).__yutopia;
    const dmg = JSON.parse(y.room.state.objects.get(id).props).dmg ?? "";
    const bits = Number(String(dmg).split("|")[1] ?? 0);
    const CR = [1 << 8, 1 << 18, 1 << 20, 1 << 21, 1 << 22, 1 << 23];
    const GO = [1 << 17, 1 << 19, 1 << 24, 1 << 25, 1 << 26, 1 << 27];
    const server = CR.map((c, i) => (bits & GO[i] ? "gone" : bits & c ? "crack" : "-"));
    const m = y.cars.parked.get(id)?.full;
    const vis = [0, 0, 0, 0, 0, 0];
    const cracks = [0, 0, 0, 0, 0, 0];
    m?.root.traverse((o: any) => {
      if (typeof o.userData.pane === "number" && o.visible) vis[o.userData.pane]++;
      if (typeof o.userData.crackOf === "number" && o.visible) cracks[o.userData.crackOf]++;
    });
    const sh = y.cars.shards;
    let live = 0;
    for (let i = 0; i < sh.n; i++) if (sh.life[i] > 0) live++;
    return { server, vis, cracks, shards: live };
  }, car.id);
  console.log(`  ${name}: struck ${JSON.stringify(heard[heard.length - 1]?.hits?.map((x: any) => x.struck) ?? "nothing")} · panes ${st.server.join(" ")} · glass shown ${st.vis.join(",")} · cracks ${st.cracks.join(",")} · shards ${st.shards}`);
};
const look = async (file: string, at: { x: number; y: number }) => {
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), at);
  await page.waitForTimeout(2000);
  await page.evaluate(async (q) => {
    const y = (window as any).__yutopia;
    const V = y.tp.camera.position.constructor;
    let best = { yaw: 0, off: 9 };
    for (let i = 0; i < 24; i++) {
      const yaw = -Math.PI + (i / 24) * 2 * Math.PI;
      y.tp.yaw = yaw;
      await new Promise((r) => setTimeout(r, 100));
      const p = new V(q.x, q.h + 0.9, q.z).project(y.tp.camera);
      if (p.z < 1 && Math.abs(p.x) < best.off) best = { yaw, off: Math.abs(p.x) };
    }
    y.tp.yaw = best.yaw;
    y.tp.pitch = 0.1;
  }, { x: pp.x, z: pp.z, h: pp.y });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${file}` });
};
// (its right side — the street's — from 5 m off it)
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), P(-0.3, 5.5));
await page.waitForTimeout(2500);
await fire("front side window", -0.2, 0, 1.18);
await fire("front side window again", -0.25, 0, 1.15);
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/glass-falling.png` });
await fire("rear side window", -1.25, 0, 1.15);
await page.mouse.up({ button: "right" });
await look("glass-side.png", P(-0.6, 3.4));
// (behind it, its rear window)
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), P(-7, 0.6));
await page.waitForTimeout(2500);
await page.mouse.down({ button: "right" });
await page.waitForTimeout(1000);
await fire("rear window", -1.8, 0, 1.12);
await page.mouse.up({ button: "right" });
await look("glass-rear-cracked.png", P(-5.2, 1.2));
await page.mouse.down({ button: "right" });
await page.waitForTimeout(800);
await fire("rear window again", -1.8, 0.2, 1.1);
await page.mouse.up({ button: "right" });
await look("glass-rear-gone.png", P(-5.2, 1.2));
await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await browser.close();
