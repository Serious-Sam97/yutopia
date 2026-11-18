// (plan 101 feedback) Back on at once: thrown off, then Use on the bike still settling, W held — does it go?
// (from bike-fall.mts) A fall's freeze: ridden, thrown off, the frames' gaps after and where the bike ends up.
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

await page.evaluate(() => (window as any).__yutopia.cars.mine.drive.throwOff("crash"));
await K.up("KeyW");
await page.waitForTimeout(Number(process.env.AFTER ?? 600));
const st = () =>
  page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    const d = C.mine?.drive;
    return `keys:${[...C.input.keys].join("+")} act:${C.myActT()?.toFixed(2) ?? "-"} eff:${d?.bk.effort.toFixed(2)} pos:${d ? `${d.s.p.x.toFixed(1)},${d.s.p.z.toFixed(1)}` : ""} mine:${!!C.mine} coast:${!!C.coast} ${d ? `${(Math.hypot(d.s.v.x, d.s.v.z) * 3.6).toFixed(1)} km/h roll ${d.bk.roll.toFixed(2)} fell ${d.bk.fell?.why ?? "-"}` : ""}`;
  });
await page.evaluate(() => {
  const w = window as any;
  w.__no = [];
  w.__yutopia.room.onMessage("car:no", (m: any) => w.__no.push(JSON.stringify(m)));
});
const me = await page.evaluate(() => {
  const c = (window as any).__yutopia;
  return c.room.state.players.get(c.room.sessionId);
});
console.log(
  "before:",
  await st(),
  "prompt",
  await page.evaluate(() => JSON.stringify((window as any).__hud?.get()?.prompt ?? null)),
);
const pid = await page.evaluate(() => (window as any).__hud?.get()?.prompt?.objectId ?? null);
console.log("act:", await page.evaluate((id) => (window as any).__yutopia.cars.act("car", id), pid ?? id));
await K.down("KeyW");
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(600);
  console.log(
    `  ${((i + 1) * 0.6).toFixed(1)} s:`,
    await st(),
    await page.evaluate(() => (window as any).__no.join(",")),
  );
}
await K.up("KeyW");
await page.evaluate(() => (window as any).__yutopia.room.send("mod:clear", {}));
await page.waitForTimeout(300);
await browser.close();
void me;
