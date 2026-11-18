// (plan 101 F9a) A bike wheeled on foot: held Use by it, walked 3 s, shot beside it (OUT=dir: walk-<n>.png), let go.
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

await page.evaluate(() => (window as any).__yutopia.teleport({ x: 412, y: -376, level: 0 }));
await page.waitForTimeout(2500);
await page.evaluate(() => (window as any).__yutopia.room.send("mod:spawn-car", { model: "bike_town", colour: 1 }));
const id = await page
  .waitForFunction(
    () => {
      const c = (window as any).__yutopia;
      let id: string | null = null;
      c.room.state.objects.forEach((x: any) => {
        const p = JSON.parse(x.props);
        if (x.kind === "car" && p.model === "bike_town" && p.spawnedBy && !p.driven && !p.retire) id = x.id;
      });
      return id && (window as any).__yutopia.cars.parked.get(id) ? id : null;
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
await page.waitForTimeout(1200);
await page.evaluate(() =>
  (window as any).__yutopia.room.onMessage("car:no", (m: any) => console.log("car:no", JSON.stringify(m))),
);
console.log("hold", await page.evaluate((id) => (window as any).__yutopia.cars.hold("car", id), id));
await page
  .waitForFunction(() => (window as any).__yutopia.cars.mine?.drive, null, { timeout: 20_000 })
  .catch(async () => {
    console.log(
      "no bike:",
      await page.evaluate(() => {
        const C = (window as any).__yutopia.cars;
        const c = (window as any).__yutopia;
        const me = c.room.state.players.get(c.room.sessionId);
        return JSON.stringify({ walkIn: C.walkIn, walkBike: C.walkBike, me: [me.x, me.y, me.busy] });
      }),
    );
    process.exit(1);
  });
await page.waitForTimeout(800);
const say = (w: string) =>
  page.evaluate((w) => {
    const C = (window as any).__yutopia.cars;
    const d = C.mine?.drive;
    return d
      ? `${w}: walk ${d.bk.walk} ${(Math.hypot(d.s.v.x, d.s.v.z) * 3.6).toFixed(1)} km/h roll ${d.bk.roll.toFixed(2)}`
      : `${w}: none`;
  }, w);
console.log(await say("held"));
await page
  .locator("canvas")
  .first()
  .click({ position: { x: 480, y: 320 } })
  .catch(() => {});
await page.keyboard.down("KeyW");
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(700);
  const png = await page.evaluate(() => {
    const c = (window as any).__yutopia;
    const C = c.cars;
    const l = C.live.get(C.mine.vid);
    const tp = c.tp;
    const cam = tp.camera.clone();
    const b = l.model.body;
    const V = cam.position.constructor;
    cam.position.copy(b.localToWorld(new V(-1.6, 1.3, 2.8)));
    cam.lookAt(b.localToWorld(new V(0, 0.8, 0.3)));
    cam.fov = 40;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    tp.renderer.render(tp.scene, cam);
    return tp.renderer.domElement.toDataURL("image/png");
  });
  writeFileSync(`${out}/walk-${i}.png`, Buffer.from(png.split(",")[1], "base64"));
}
console.log(await say("walking"));
console.log(
  "keys",
  await page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    return JSON.stringify({
      keys: [...C.input.keys],
      pos: C.mine?.drive?.s.p,
      acc: C.mine?.acc,
      started: C.mine?.started,
    });
  }),
);
await page.keyboard.up("KeyW");
await page.waitForTimeout(600);
await page.keyboard.press("KeyX");
await page.waitForTimeout(1500);
console.log(await say("let go"));
await page.evaluate(() => (window as any).__yutopia.room.send("mod:clear", {}));
await page.waitForTimeout(400);
console.log(`done ${((Date.now() - T0) / 1000).toFixed(1)} s`);
await browser.close();
