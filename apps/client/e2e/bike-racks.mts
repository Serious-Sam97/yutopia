// (plan 101) The town's bike racks and their bikes, each shot from a camera of its own a few metres off (OUT=dir:
// rack-<id>.png), as Ana walks up to it. Prints what stands there.
//   OUT=dir node --experimental-strip-types e2e/bike-racks.mts [url]
import { writeFileSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp";
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
const racks = (process.env.RACKS ?? "rack-square,rack-boathouse,rack-shelter").split(",");
for (const id of racks) {
  const at = await page.evaluate((id) => {
    const c = (window as any).__yutopia;
    const o = c.room.state.objects.get(id);
    if (!o) return null;
    const bikes: string[] = [];
    c.room.state.objects.forEach((x: any) => {
      if (x.id.startsWith(`${id}-`)) bikes.push(`${x.id} ${JSON.parse(x.props).model}`);
    });
    return { x: o.x + 1.5, z: o.y + 1.5, bikes };
  }, id);
  if (!at) {
    console.log(id, "— not in the world");
    continue;
  }
  console.log(id, JSON.stringify(at));
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x + 4, y: q.z + 4, level: 0 }), at);
  // (there: the view's camera near it)
  await page
    .waitForFunction(
      (q) => {
        const p = (window as any).__yutopia.tp.camera.position;
        return Math.hypot(p.x - q.x, p.z - q.z) < 25;
      },
      at,
      { timeout: 30_000 },
    )
    .catch(async () =>
      console.log(
        "  (the camera never got there)",
        await page.evaluate(() => {
          const c = (window as any).__yutopia;
          const me = c.room.state.players.get(c.room.sessionId);
          return `me ${me.x.toFixed(1)},${me.y.toFixed(1)} L${me.level} busy ${me.busy} hud ${JSON.stringify((window as any).__hud?.get()?.loading)}`;
        }),
      ),
    );
  // (its bikes' models in)
  await page
    .waitForFunction(
      (id) => {
        const C = (window as any).__yutopia.cars;
        const ks = [...C.parked.keys()].filter((k: string) => k.startsWith(`${id}-`));
        return ks.length > 0 && ks.every((k: string) => C.parked.get(k)?.full?.ready);
      },
      id,
      { timeout: 15_000 },
    )
    .catch(async () =>
      console.log(
        "  (models not all in)",
        await page.evaluate((id) => {
          const C = (window as any).__yutopia.cars;
          return [...C.parked.entries()]
            .filter(([k]: [string, unknown]) => k.startsWith(`${id}-`))
            .map(
              ([k, p]: [string, any]) =>
                `${k}: ${p.level} ${p.full?.ready} ${p.look?.variant} pose ${p.pose.x.toFixed(1)},${p.pose.z.toFixed(1)} cam ${(window as any).__yutopia.tp.camera.position.x.toFixed(1)},${(window as any).__yutopia.tp.camera.position.z.toFixed(1)} root ${C.root.position.x.toFixed(1)},${C.root.position.z.toFixed(1)}`,
            )
            .join(" | ");
        }, id),
      ),
    );
  await page.waitForTimeout(600);
  const png = await page.evaluate(
    (q) => {
      const c = (window as any).__yutopia;
      const tp = c.tp;
      const cam = tp.camera.clone();
      const root = c.cars.root;
      const V = cam.position.constructor;
      const t = new V(q.x - root.position.x, 0.6, q.z - root.position.z);
      root.localToWorld(t);
      const k = Number(q.far ?? 1);
      cam.position.set(t.x + 3.2 * k, t.y + 1.6 * k * (k > 1 ? 2.5 : 1), t.z + 3.4 * k);
      cam.lookAt(t);
      cam.updateMatrixWorld(true);
      tp.renderer.render(tp.scene, cam);
      return tp.renderer.domElement.toDataURL("image/png");
    },
    { ...at, far: process.env.FAR ?? "1" },
  );
  const f = `${out}/rack-${id}${process.env.FAR ? "-far" : ""}.png`;
  writeFileSync(f, Buffer.from(png.split(",")[1], "base64"));
  console.log("  →", f);
}
console.log(`done ${((Date.now() - T0) / 1000).toFixed(1)} s`);
await browser.close();
