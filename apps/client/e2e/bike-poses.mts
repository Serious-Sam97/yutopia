// (plan 101 phases 0 and 3) The rider's poses on each bike, held (`__bikeRider`) and shot from its side (and a three-
// quarter): the cranks round in quarters, stood on the pedals, crouched for a hop, a foot down, each trick halfway.
// One sheet a bike (OUT=dir: poses-<kind>.png). Ana spawns each on the town square, gets on, the shots, gets off.
//   OUT=dir [KINDS=bike_town,bike_bmx,bike_mtb,bike_road] [VIEW=side|34] node --experimental-strip-types e2e/bike-poses.mts
import { execFileSync } from "node:child_process";
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
const TAU = Math.PI * 2;
const POSES: [string, Record<string, unknown>][] = [
  ["crank 0", { crank: 0, effort: 0.6, stand: 0, foot: 0 }],
  ["crank 90", { crank: TAU / 4, effort: 0.6, stand: 0, foot: 0 }],
  ["crank 180", { crank: TAU / 2, effort: 0.6, stand: 0, foot: 0 }],
  ["crank 270", { crank: (3 * TAU) / 4, effort: 0.6, stand: 0, foot: 0 }],
  ["stood", { crank: TAU / 4, effort: 1, stand: 1, foot: 0 }],
  ["crouch", { crank: 0, stand: 1, charge: 1, foot: 0 }],
  ["foot down", { crank: 0, effort: 0, stand: 0, foot: -1 }],
  ["turn", { crank: 0, stand: 0, foot: 0, steer: 0.3 }],
  ["superman", { trick: "superman", trickT: 0.5, stand: 1, foot: 0 }],
  ["no-hander", { trick: "nohander", trickT: 0.5, stand: 1, foot: 0 }],
  ["tailwhip", { trick: "tailwhipL", trickT: 0.35, stand: 1, foot: 0 }],
  ["barspin", { trick: "barspin", trickT: 0.4, stand: 1, foot: 0 }],
];
// (the test bikes left about the square: retired, gone once nobody's by — away a moment)
await page.evaluate(() => (window as any).__yutopia.room.send("mod:clear", {}));
await page.evaluate(() => (window as any).__yutopia.teleport({ x: -8, y: -405, level: 0 }));
await page.waitForTimeout(4000);
// the square, its open middle
await page.evaluate(() => (window as any).__yutopia.teleport({ x: 412, y: -376, level: 0 }));
await page.waitForTimeout(2500);
for (const kind of kinds) {
  await page.evaluate((k) => (window as any).__yutopia.room.send("mod:spawn-car", { model: k, colour: 1 }), kind);
  const id = await page
    .waitForFunction(
      (k: string) => {
        const c = (window as any).__yutopia;
        let id: string | null = null;
        c.room.state.objects.forEach((x: any) => {
          const p = JSON.parse(x.props);
          if (x.kind === "car" && p.model === k && p.spawnedBy && !p.driven && !p.retire) id = x.id;
        });
        return id;
      },
      kind,
      { timeout: 10_000 },
    )
    .then((h) => h.jsonValue());
  const at = await page.evaluate((id) => {
    const o = (window as any).__yutopia.room.state.objects.get(id);
    const p = JSON.parse(o.props);
    return { x: o.x + 1 + Number(p.dx ?? 0) - 0.9 * Math.sin(Number(p.a ?? 0)), y: o.y + 1 + Number(p.dz ?? 0) };
  }, id);
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), at);
  await page.waitForTimeout(900);
  await page.evaluate((id) => (window as any).__yutopia.room.send("car:enter", { id, seat: 0 }), id);
  await page.waitForFunction(() => (window as any).__yutopia.cars.mine?.drive, null, { timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const C = (window as any).__yutopia.cars;
      return C.live.get(C.mine.vid)?.model.ready;
    },
    null,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(3000);
  const files: string[] = [];
  // (ACT=1: the getting on and off, its clock held, in place of the poses)
  const act = process.env.ACT === "1";
  // (TRICKS=1: each trick at three moments, the rider up off the saddle as in the air)
  const TR: [string, Record<string, unknown>][] = [];
  for (const id of ["superman", "nohander", "tailwhipL", "barspin"])
    for (const t of [0.2, 0.5, 0.8]) TR.push([`${id} ${t}`, { trick: id, trickT: t, stand: 1, foot: 0, air: true }]);
  const shots: [string, unknown][] = process.env.TRICKS
    ? TR
    : act
      ? [0.2, 0.5, 0.8, 1.1, 1.4, 1.7, 0.3, 0.6, 0.9, 1.2, 1.5, 1.7].map((t, i) => [
          `${i < 6 ? "on" : "off"} ${t}`,
          { t, out: i >= 6 },
        ])
      : POSES;
  for (const [name, pose] of shots) {
    if (act) await page.evaluate((p) => ((globalThis as any).__actAt = p), pose);
    else await page.evaluate((p) => ((globalThis as any).__bikeRider = p), pose);
    await frames(4);
    const png = await page.evaluate((v) => {
      const c = (window as any).__yutopia;
      const C = c.cars;
      const l = C.live.get(C.mine.vid);
      const tp = c.tp;
      const cam = tp.camera.clone();
      const b = l.model.body;
      const V = cam.position.constructor;
      // (the model's frame: nose −x, +z its left)
      const from = v === "34" ? new V(-2.2, 1.35, 2.4) : new V(0.05, 0.95, 2.9);
      const f = b.localToWorld(from);
      const t = b.localToWorld(new V(-0.05, 0.85, 0));
      cam.position.copy(f);
      cam.lookAt(t);
      cam.fov = 38;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      tp.renderer.render(tp.scene, cam);
      return tp.renderer.domElement.toDataURL("image/png");
    }, view);
    const f = `${out}/pose-${kind}-${name.replace(/ /g, "_")}.png`;
    writeFileSync(f, Buffer.from(png.split(",")[1], "base64"));
    files.push(f);
  }
  await page.evaluate(() => {
    (globalThis as any).__bikeRider = undefined;
    (globalThis as any).__actAt = undefined;
  });
  // a sheet: four across, each labelled
  const cols = 4;
  const rows = Math.ceil(files.length / cols);
  const args = ["-nostdin", "-loglevel", "error", "-y"];
  for (const f of files) args.push("-i", f);
  let fc = files.map((_, i) => `[${i}]scale=400:-1[v${i}]`).join(";");
  fc += `;${files.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${files.length}:layout=${files
    .map((_, i) => `${(i % cols) * 400}_${Math.floor(i / cols) * 267}`)
    .join("|")}`;
  const sheet = `${out}/${process.env.TRICKS ? "tricks" : act ? "act" : "poses"}-${kind}${view === "34" ? "-34" : ""}.png`;
  execFileSync("ffmpeg", [...args, "-filter_complex", fc, "-frames:v", "1", sheet]);
  console.log(kind, "→", sheet, `(${rows} rows)`);
  await page.keyboard.press("KeyX");
  await page.waitForFunction(() => !(window as any).__yutopia.cars.mine, null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2500);
}
await page.evaluate(() => (window as any).__yutopia.room.send("mod:clear", {}));
await page.waitForTimeout(400);
console.log(`done ${((Date.now() - T0) / 1000).toFixed(1)} s`);
await browser.close();
