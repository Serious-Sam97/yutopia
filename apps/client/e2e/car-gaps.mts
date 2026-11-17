// (plan 94 G2, G5) Two of plan 93's gaps in the world, close stills by an own camera (OUT=dir): Main Street's first
// town car's front-right tyre shot out and changed (the jack, the corner up, the wheel off, the spare on); then Ana
// in its passenger's seat, the shotgun out of her window (both hands on it).
//   OUT=dir node --experimental-strip-types e2e/car-gaps.mts [url]
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
const still = async (file: string, from: { x: number; y: number; z: number }, at: { x: number; y: number; z: number }) => {
  const url = await page.evaluate(
    ([f, a]) => {
      const tp = (window as any).__yutopia.tp;
      const Cam = tp.camera.constructor;
      const c = new Cam(42, 1440 / 900, 0.05, 300);
      c.position.set((f as any).x, (f as any).y, (f as any).z);
      c.lookAt((a as any).x, (a as any).y, (a as any).z);
      c.updateMatrixWorld();
      tp.renderer.setRenderTarget(null);
      tp.renderer.render(tp.scene, c);
      return tp.renderer.domElement.toDataURL("image/png");
    },
    [from, at] as const,
  );
  (await import("node:fs")).writeFileSync(`${out}/${file}`, Buffer.from(url.split(",")[1], "base64"));
};
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  y.room.send("mod:hour", { h: 12 });
  y.room.send("mod:dark", { mode: "peaceful" });
  y.room.send("mod:heal", {});
  y.room.send("mod:refill", { kit: true });
});
await page.waitForTimeout(1200);
// ── G5: its front-right tyre shot out, then changed ──
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), P(1.4, 5));
await page.waitForTimeout(2000);
await page.keyboard.press("Digit2");
await page.waitForFunction(() => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).gun === "revolver", null, { timeout: 10000 });
await page.mouse.move(720, 450);
await page.mouse.down({ button: "right" });
await page.waitForTimeout(1200);
await page.evaluate(
  ([t, g]) => {
    const y = (window as any).__yutopia;
    const me = y.room.state.players.get(y.room.sessionId);
    const oz = me.z + 1.35;
    const tz = (g as number) + 0.32;
    const d = Math.hypot((t as any).x - me.x, (t as any).y - me.y);
    y.room.send("arms:fire", { ox: me.x, oy: me.y, oz, yaw: Math.atan2((t as any).y - me.y, (t as any).x - me.x), pitch: Math.atan2(tz - oz, d), lag: 0, seed: 3 });
  },
  [P(1.37, 0.6), pp.y] as const,
);
await page.waitForTimeout(900);
await page.mouse.up({ button: "right" });
await page.keyboard.press("Digit2");
const dmg = await page.evaluate((id) => JSON.parse((window as any).__yutopia.room.state.objects.get(id).props).dmg, car.id);
console.log("shot its tyre:", dmg);
// kneeling at it: changed (the server's 20 s)
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), P(1.37, 1.55));
await page.waitForTimeout(1800);
await page.evaluate((id) => (window as any).__yutopia.room.send("car:mend", { id, what: "tyre", wheel: 1 }), car.id);
await page.waitForTimeout(500);
const busy = await page.evaluate(() => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).busy);
console.log("busy:", busy);
const hub = { x: pp.x + fwd[0] * 1.37 + right[0] * 0.75, z: pp.z + fwd[1] * 1.37 + right[1] * 0.75 };
const view = (k: number) => ({ x: hub.x + right[0] * 2.6 - fwd[0] * 1.6 * k, y: pp.y + 0.9, z: hub.z + right[1] * 2.6 - fwd[1] * 1.6 * k });
const state = () =>
  page.evaluate((id) => {
    const C = (window as any).__yutopia.cars;
    const m = C.parked.get(id)?.full;
    const jobs = [...C.tyreJobs.values()];
    return { lift: +(m?.body.position.y ?? 0).toFixed(3), wheelOn: m?.wheels[1]?.steer.visible, jack: !!jobs[0]?.jack, jobs: jobs.length };
  }, car.id);
await page.waitForTimeout(2600);
console.log("at 3 s:", JSON.stringify(await state()));
await still("gap-tyre-1-jacked.png", view(1), { x: hub.x, y: pp.y + 0.3, z: hub.z });
await page.waitForTimeout(5000);
console.log("at 8 s:", JSON.stringify(await state()));
await still("gap-tyre-2-off.png", view(1), { x: hub.x, y: pp.y + 0.3, z: hub.z });
await page.waitForTimeout(13000);
console.log("done:", JSON.stringify(await state()), JSON.parse(await page.evaluate((id) => (window as any).__yutopia.room.state.objects.get(id).props, car.id)).dmg ?? "mended");
// ── G2: a passenger, the shotgun out of the window ──
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), P(-0.35, 1.7));
await page.waitForTimeout(1500);
await page.evaluate((id) => (window as any).__yutopia.room.send("car:enter", { id, seat: 1 }), car.id);
await page.waitForTimeout(3500);
await page.keyboard.press("Digit3");
await page.waitForTimeout(2500);
const gunNow = await page.evaluate(() => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).gun);
await page.mouse.move(720, 450);
await page.mouse.down({ button: "right" });
await page.waitForTimeout(2000);
const seated = await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  return { seat: C.mine?.seat, aiming: C.gunSeat()?.aiming };
});
console.log("passenger:", gunNow, JSON.stringify(seated));
const win = { x: pp.x + fwd[0] * -0.35 + right[0] * 1.0, y: pp.y + 1.1, z: pp.z + fwd[1] * -0.35 + right[1] * 1.0 };
// (aimed out of her window — the window's own aim: straight out, then a little forward)
for (const [tag, yaw] of [["out", 0], ["fwd", 0.5]] as const) {
  await page.evaluate((y) => {
    const C = (window as any).__yutopia.cars;
    C.aimLook.yaw = y;
    C.aimLook.pitch = 0;
  }, yaw);
  await page.waitForTimeout(1200);
  console.log(
    tag,
    JSON.stringify(
      await page.evaluate(() => {
        const C = (window as any).__yutopia.cars;
        const room = (window as any).__yutopia.room;
        const l = C.live.get(C.mine.vid);
        const aim = C.aimOf(l, room.sessionId, C.mine.seat);
        const e = l.people.get(room.sessionId);
        return { aim: aim && [aim.x, aim.y, aim.z].map((n: number) => +n.toFixed(2)), gs: C.gunSeat(), held: !!e?.gun?.held, key: e?.gun?.key, people: [...l.people.keys()].length, seat: e?.seat };
      }),
    ),
  );
  // (the game's own camera swung round to her side: what the world shows — an own camera finds it culled)
  for (const [view, cy] of [["side", Math.PI / 2], ["back", Math.PI * 0.75]] as const) {
    await page.evaluate((y) => {
      const C = (window as any).__yutopia.cars;
      C.cam.look.yaw = y;
      C.cam.look.pitch = -0.12;
    }, cy);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/gap-gun-${tag}-${view}.png` });
    await page.evaluate((y) => {
      (window as any).__yutopia.cars.cam.look.yaw = -y;
    }, cy);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/gap-gun-${tag}-${view}-other.png` });
  }
}
await page.mouse.up({ button: "right" });
await page.keyboard.press("KeyX");
await page.waitForTimeout(1500);
await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await browser.close();
