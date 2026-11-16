// (plan 93 S8) The body in the car: Ana at the wheel of Main Street's town car — stopped a while (a hand onto her
// thigh), backing up (round in the seat, an arm over the seat beside); then as its passenger, a hard turn told
// (the g faked: parked), her hand up on the grab handle. Stills by an own camera at the window (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-body.mts [url]
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
const busy = () => page.evaluate(() => { const y = (window as any).__yutopia; return y.room.state.players.get(y.room.sessionId).busy; });
const enter = async (seat: number) => {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(([id, s]) => (window as any).__yutopia.room.send("car:enter", { id, seat: s }), [car.id, seat] as const);
    await page.waitForTimeout(2500);
    if ((await busy()) !== "") return true;
  }
  return false;
};
const leave = async () => {
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => (window as any).__yutopia.room.send("car:leave", {}));
    await page.waitForTimeout(1200);
    if ((await busy()) === "") return true;
  }
  return false;
};
// (a still from beside the car: out from the seat's side, at its window's height, looking in)
const look = async (name: string, seat: number, from = 1) => {
  const url = await page.evaluate(
    ([sn, f]) => {
      const y = (window as any).__yutopia;
      const C = y.cars;
      const l = C.live.get(C.mine?.vid);
      if (!l) return null;
      const m = l.model;
      m.root.updateMatrixWorld(true);
      const s = m.seats[sn];
      const V = m.root.position.constructor;
      const at = m.body.localToWorld(new V(s.hip.x, s.hip.y + 0.45, s.hip.z));
      const eye = m.body.localToWorld(new V(s.hip.x - 0.6, s.hip.y + 0.75, s.hip.z + f * Math.sign(s.hip.z || 1) * 2.2));
      const cam = y.tp.camera.clone();
      cam.fov = 45;
      cam.updateProjectionMatrix();
      cam.position.copy(eye);
      cam.lookAt(at);
      y.tp.renderer.render(y.tp.scene, cam);
      return y.tp.renderer.domElement.toDataURL("image/png");
    },
    [seat, from] as const,
  );
  if (!url) return console.log("no car");
  const fs = await import("node:fs");
  fs.writeFileSync(`${out}/${name}`, Buffer.from(url.split(",")[1], "base64"));
};
const state = () =>
  page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    const l = C.live.get(C.mine?.vid);
    const out: any = {};
    if (l) for (const [, e] of l.people) out[e.seat] = { rev: +(e.rev ?? 0).toFixed(2), rest: +(e.rest ?? 0).toFixed(2), still: +(e.still ?? 0).toFixed(1), grab: +(e.grab ?? 0).toFixed(2) };
    return out;
  });
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x + Math.sin(q.a) * 1.6, y: q.z - Math.cos(q.a) * 1.6, level: 0 }), pp);
await page.waitForTimeout(2500);
console.log("in:", await enter(0));
await page.waitForTimeout(4000);
console.log("stopped:", JSON.stringify(await state()));
await look("body-0-rest.png", 0);
// backing up
await page.keyboard.down("KeyS");
await page.waitForTimeout(1600);
console.log("backing:", JSON.stringify(await state()));
await look("body-1-reverse.png", 0, -1);
await page.keyboard.up("KeyS");
await page.keyboard.down("Space");
await page.waitForTimeout(1200);
await page.keyboard.up("Space");
console.log("out:", await leave());
// its passenger: a hard turn told
await page.waitForTimeout(1500);
const p2 = await page.evaluate((id) => (window as any).__yutopia.cars.parked.get(id)?.pose ?? null, car.id);
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x - Math.sin(q.a) * 1.6, y: q.z + Math.cos(q.a) * 1.6, level: 0 }), p2);
await page.waitForTimeout(2500);
console.log("in beside:", await enter(1));
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  const orig = C.bodyLife.bind(C);
  C.bodyLife = (l: any, e: any, d: boolean, a: number, g: any, _lat: number, dt: number) => orig(l, e, d, a, g, -8, dt);
});
await page.waitForTimeout(1200);
console.log("turning:", JSON.stringify(await state()));
await look("body-2-grab.png", 1);
console.log("out:", await leave());
await browser.close();
