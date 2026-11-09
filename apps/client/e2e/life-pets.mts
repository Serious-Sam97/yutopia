/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 9 (dev only) — the pets in the life look as Ana: three adopted at a time (a person's
// most), each framed close from a free camera where it stands, then let go; every species. In the look
// given (`life`, `life&pets=old`, …), in the lobby (or AT='x,y' outside).
//   node --experimental-strip-types e2e/life-pets.mts <out dir> [look] [hour]
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
const [ax, ay] = (process.env.AT ?? "3,12").split(",").map(Number);
await page.evaluate(([x, y]) => (window as any).__yutopia.teleport({ x, y, level: 0 }), [ax, ay] as const);
await page.waitForTimeout(8000);
const mine = () =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    return [...w.room.state.pets.values()]
      .filter((p: any) => p.sid === w.room.sessionId)
      .map((p: any) => ({ id: p.id, species: p.species, x: p.x, y: p.y, z: p.z ?? 0 }));
  }) as Promise<{ id: string; species: string; x: number; y: number; z: number }[]>;
const send = (type: string, msg: unknown) =>
  page.evaluate(([t, m]) => (window as any).__yutopia.send(t, m), [type, msg] as const);
for (const p of await mine()) await send("pet:release", { id: p.id });
await page.evaluate((h) => {
  const w = (window as any).__yutopia;
  w.updateNight = () => {};
  w.tp.setHour(h);
}, hour);
try {
  for (const group of [
    ["dog", "cat", "platypus"],
    ["rabbit", "capybara", "parrot"],
  ]) {
    for (const sp of group) await send("pet:adopt", { species: sp, name: sp[0].toUpperCase() + sp.slice(1) });
    // (they come to me, then stay: the textures and their first poses in)
    await page.waitForTimeout(9000);
    for (const p of await mine()) await send("pet:cmd", { id: p.id, cmd: "stay" });
    await page.waitForTimeout(2500);
    for (const p of await mine()) {
      await page.evaluate(
        ([at, yaw]) => {
          const tp = (window as any).__yutopia.tp;
          tp.mode = "free";
          tp.yaw = yaw;
          tp.pitch = 0.3;
          tp.dist = 2.1;
          tp.dragged = 1e12;
          const T = tp.target;
          for (const k of ["set", "copy", "lerp", "add"]) delete T[k];
          T.set(at[0], at[1], at[2]);
          for (const k of ["set", "copy", "lerp", "add"]) T[k] = () => T;
        },
        [[p.x, p.z + 0.45, p.y], -2.3] as const,
      );
      await page.waitForTimeout(1500);
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
      const file = `${out}/pet-${p.species}-${hour}.png`;
      await page.screenshot({ path: file });
      console.log(file);
    }
    for (const p of await mine()) await send("pet:release", { id: p.id });
    await page.waitForTimeout(1500);
  }
} finally {
  for (const p of await mine()) await send("pet:release", { id: p.id });
  await page.waitForTimeout(1000);
  await b.close();
}
