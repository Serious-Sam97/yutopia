/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 7.3 (dev only) — the town on the Grounds as Ana: Main Street's shops, the houses, the
// church, the barn, the roofs from above — shot in the life look or `build=old`.
//   node --experimental-strip-types e2e/life-town.mts <out dir> [life|life&build=old] [hour]   BARE=1 no snow
import { mkdirSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const out = process.argv[2];
const look = process.argv[3] ?? "life";
const hour = Number(process.argv[4] ?? 12);
mkdirSync(out, { recursive: true });
const ctx = await request.newContext();
const tok = (
  await (
    await ctx.post("http://localhost:8100/api/login", {
      data: { email: "ana@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" },
      headers: { Accept: "application/json" },
    })
  ).json()
).token;
const b = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("page:", e.message));
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high" }));
}, tok);
await page.goto(`http://localhost:3100/?look=${look}`);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 180_000 },
);
await page.evaluate(() => (window as any).__yutopia.teleport({ x: 420, y: -420, level: 0 }));
// (the Grounds stream in round me, the library's textures after)
await page.waitForTimeout(25000);
await page.evaluate((h) => {
  const w = (window as any).__yutopia;
  w.updateNight = () => {};
  w.tp.setHour(h);
  if (w.life) w.life.weather = () => [0, 0];
}, hour);
// (BARE=1: no snow lying, held — the roofs' slates out from under it)
const bare = process.env.BARE === "1";
if (bare)
  await page.evaluate(() => {
    const L = (window as any).__wxLayer;
    L.hold.on = true;
    L.wx.wxSnow.value = 0;
    if (L.wx.wxWet) L.wx.wxWet.value = 0;
  });
await page.waitForTimeout(2500);
// (the camera free round a point, looking along `yaw`)
for (const [name, at, yaw, pitch, dist] of [
  ["town-shops", [385, 2.2, -402], Math.PI / 2 + 0.3, 0.12, 13],
  ["town-houses", [419, 2, -449], Math.PI, 0.14, 11],
  ["town-church", [420, 3, -526], -Math.PI / 2, 0.16, 18],
  ["town-barn", [434, 3, -305], 0.3, 0.14, 16],
  ["town-roofs", [396, 8, -449], 0.15, 0.32, 22],
  ["town-near", [413, 2, -446], Math.PI - 0.5, 0.05, 3.2],
  ["town-brick", [380, 2.4, -399.5], Math.PI / 2 + 0.5, 0.0, 3.4],
] as const) {
  await page.evaluate(
    ([at, yaw, pitch, dist]) => {
      const tp = (window as any).__yutopia.tp;
      tp.mode = "free";
      tp.yaw = yaw;
      tp.pitch = pitch;
      tp.dist = dist;
      tp.dragged = 1e12;
      const T = tp.target;
      for (const k of ["set", "copy", "lerp", "add"]) delete T[k];
      T.set(at[0], at[1], at[2]);
      for (const k of ["set", "copy", "lerp", "add"]) T[k] = () => T;
    },
    [at, yaw, pitch, dist] as const,
  );
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const cs = [...document.querySelectorAll("canvas")];
    const big = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    big?.setAttribute("data-wxshot", "");
    if (!document.getElementById("wxshot-css")) {
      const st = document.createElement("style");
      st.id = "wxshot-css";
      st.textContent = "*:not(:has([data-wxshot])):not([data-wxshot]){visibility:hidden!important}";
      document.head.appendChild(st);
    }
  });
  const file = `${out}/${name}-${hour}${bare ? "-bare" : ""}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
await b.close();
