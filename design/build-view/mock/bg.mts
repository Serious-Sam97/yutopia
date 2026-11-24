/* biome-ignore-all lint/suspicious/noExplicitAny: probe */
// Scratch (plan 113): each furnished building's storeys as laid — a plan from straight over (its outside gone, the
// storeys over it hidden), and two at eye level (from its door looking in, from its far corner back) — at noon.
// npx tsx e2e/zz-furnish-stills.mts <out dir> [building keys…]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const OUT = process.argv[2];
const KEYS = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ["bar", "diner", "market", "farmhouse", "barn", "gatehouse"];
mkdirSync(OUT, { recursive: true });
const ctx = await request.newContext();
const tok = (
  await (
    await ctx.post("http://localhost:8100/api/login", {
      data: { email: "ana@yutopia.test", password: "yutopia-demo" },
      headers: { Accept: "application/json" },
    })
  ).json()
).token;
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript(
  ([t]) => {
    // (tsx names the probe's inner functions with a helper the page hasn't got)
    (window as any).__name = (f: unknown) => f;
    (window as any).__R = 0.62; (window as any).__OFF = 0;
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p" }));
  },
  [tok] as const,
);
await page.goto("http://localhost:3100");
await page.waitForFunction(
  () => (window as any).__hud?.get()?.phase === "ready" && !(window as any).__hud?.get()?.loading?.on,
  null,
  { timeout: 240_000 },
);
const save = (name: string, url: string) =>
  writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(url.split(",")[1], "base64"));
for (const key of KEYS) {
  const s = await page.evaluate((k) => (window as any).__yutopia.spaceOf(k), key);
  if (!s) {
    console.log(key, "no space");
    continue;
  }
  for (const [storey, level] of s.floors.entries()) {

    // in by its door on its ground storey (God mode's way), then up by the floor picker's
    await page.evaluate((k) => {
      const c = (window as any).__yutopia;
      c.goInside(k);
      (window as any).__hud.set((h: any) => ({ build: { ...h.build, on: false } }));
    }, key);
    await page.waitForTimeout(2500);
    if (storey > 0) {
      await page.evaluate((l) => (window as any).__yutopia.goToFloor(l), level);
      await page.waitForTimeout(2500);
    }
    // (on that storey: its floor the scene's, the ones over it hidden)
    await page
      .waitForFunction((l) => (window as any).__yutopia?.level === l, level, { timeout: 30_000 })
      .catch(() => {
        console.log("  not on", level);
      });
    await page.waitForFunction(
      () => {
        const g = (window as any).__yutopia?.tp?.around?.grounds;
        return g && !g.statics.left;
      },
      null,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(2500);
    const shots = await page.evaluate(
      ([k, lv]) => {
        const c = (window as any).__yutopia;
        c.updateNight = () => {};
        c.hour = 12;
        c.engine?.setClock?.(12);
        c.tp.setHour(12);
        const tp = c.tp;
        const b = c.G.BUILDINGS.find((q: any) => q.key === k);
        const st = tp.around.grounds?.statics;
        if (st) {
          st.cutFor = k;
          st.cutAt(0, 0, 0);
        }
        const cx = (b.x0 + b.x1) / 2;
        const cz = (b.z0 + b.z1) / 2;
        const ext = Math.max(b.x1 - b.x0, b.z1 - b.z0) + 1;
        const out: Record<string, string> = {};
        const shoot = (name: string, eye: number[], look: number[], fov: number, up?: number[]) => {
          const cam = tp.camera.clone();
          cam.fov = fov;
          cam.near = 0.1;
          cam.far = 400;
          cam.position.set(eye[0], eye[1], eye[2]);
          if (up) cam.up.set(up[0], up[1], up[2]);
          cam.lookAt(look[0], look[1], look[2]);
          cam.updateProjectionMatrix();
          tp.renderer.render(tp.scene, cam);
          out[name] = tp.renderer.domElement.toDataURL("image/jpeg", 0.85);
        };
        // Sims-like 3/4 views from above: from each corner, 50° down, the room filling the frame
        const r = ext * Number((window as any).__R ?? 0.95);
        for (const [i, [sx, sz]] of [[1, 1], [-1, 1], [1, -1], [-1, -1]].entries()) {
          const d = r * 0.62;
          const lx = cx + sx * ext * ((window as any).__OFF ?? 0); const lz = cz + sz * ext * ((window as any).__OFF ?? 0);
          shoot(`q${i}`, [lx + sx * d, r * 0.95, lz + sz * d], [lx, 0, lz], 42);
        }
        if (st) st.cutFor = null;
        void lv;
        return out;
      },
      [key, level] as const,
    );
    for (const [n, url] of Object.entries(shots)) save(`${key}-${storey}-${n}`, url);
    console.log(key, "storey", storey, "level", level, "shot");
  }
}
await browser.close();
