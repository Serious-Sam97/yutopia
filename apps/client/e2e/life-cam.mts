/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 8 (dev only) — stills from a free camera held where you say, as Ana: teleported to (x, y)
// on the ground floor, the Grounds streamed in, noon (or the hour), then each shot's target, its yaw, pitch
// and distance (its height over where I stand) — in the look given (`life`, `life&out=old`, …). BARE=1 holds the snow off.
//   SHOTS='[["name", tx, ty, tz, yaw, pitch, dist], …]' AT='x,y' \
//     node --experimental-strip-types e2e/life-cam.mts <out dir> [look] [hour]
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
const [ax, ay] = (process.env.AT ?? "0,0").split(",").map(Number);
const shots = JSON.parse(process.env.SHOTS ?? "[]") as [string, number, number, number, number, number, number][];
await page.evaluate(([x, y]) => (window as any).__yutopia.teleport({ x, y, level: 0 }), [ax, ay] as const);
// (the Grounds stream in round me, the library's textures after)
await page.waitForTimeout(22000);
await page.evaluate((h) => {
  const w = (window as any).__yutopia;
  w.updateNight = () => {};
  w.tp.setHour(h);
}, hour);
const bare = process.env.BARE === "1";
if (bare)
  await page.evaluate(() => {
    const L = (window as any).__wxLayer;
    L.hold.on = true;
    L.wx.wxSnow.value = 0;
    if (L.wx.wxWet) L.wx.wxWet.value = 0;
  });
await page.waitForTimeout(2500);
// (the targets' heights over where I stand: the long road climbs)
const ground = (await page.evaluate(() => {
  const w = (window as any).__yutopia;
  return w.room.state.players.get(w.room.sessionId)?.z ?? 0;
})) as number;
for (const [name, tx, ty0, tz, yaw, pitch, dist] of shots) {
  const ty = ty0 + ground;
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
    [[tx, ty, tz], yaw, pitch, dist] as const,
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
