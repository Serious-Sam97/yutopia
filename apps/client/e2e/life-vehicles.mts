/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 8.3 (dev only) — the vehicles out on the Grounds as Ana: the shuttle bus, the plough and
// the visitors' cars where they are, each framed from a free camera held on it (its model's own), in the
// look given (`life`, `life&out=old`, …).
//   node --experimental-strip-types e2e/life-vehicles.mts <out dir> [look] [hour]
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
await page.evaluate(() => (window as any).__yutopia.teleport({ x: -10, y: 18, level: 0 }));
await page.waitForTimeout(15000);
await page.evaluate((h) => {
  const w = (window as any).__yutopia;
  w.updateNight = () => {};
  w.tp.setHour(h);
}, hour);
// (each kind's first: where its model stands, in the world's frame)
// (each kind's first model: its id)
const found = (await page.evaluate(() => {
  const tp = (window as any).__yutopia.tp;
  const room = (window as any).__yutopia.room;
  const out: Record<string, string> = {};
  for (const [id, m] of tp.vehicles.veh3 as Map<string, any>) {
    const kind = room.state.vehicles?.get?.(id)?.kind ?? (m.userData.big ? "big" : "car");
    out[kind] ??= id;
  }
  return out;
})) as Record<string, string>;
console.log("found", JSON.stringify(found));
for (const [kind, id] of Object.entries(found))
  for (const [tag, turn, pitch, dist] of [
    ["side", Math.PI / 2, 0.15, 9],
    ["quarter", Math.PI / 4, 0.25, 10],
  ] as const) {
    // (the camera on it each frame as it drives)
    await page.evaluate(
      ([id, turn, pitch, dist]) => {
        const w = window as any;
        const tp = w.__yutopia.tp;
        tp.mode = "free";
        tp.pitch = pitch;
        tp.dist = dist;
        tp.dragged = 1e12;
        const T = tp.target;
        for (const k of ["set", "copy", "lerp", "add"]) delete T[k];
        const keep = { set: T.set.bind(T) };
        for (const k of ["set", "copy", "lerp", "add"]) T[k] = () => T;
        cancelAnimationFrame(w.__follow ?? 0);
        const follow = () => {
          const m = tp.vehicles.veh3.get(id);
          if (m) {
            const p = m.getWorldPosition(m.position.clone());
            keep.set(p.x, p.y + 1.2, p.z);
            tp.yaw = -m.rotation.y + turn;
          }
          w.__follow = requestAnimationFrame(follow);
        };
        follow();
      },
      [id, turn, pitch, dist] as const,
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
    const file = `${out}/veh-${kind}-${tag}-${hour}.png`;
    await page.screenshot({ path: file });
    console.log(file);
  }
await b.close();
