/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 7.2 (dev only) — mezzanines on Floor 1 as Ana, one of each floor's material (oak,
// walnut, carpet, the cream tile, rust felt) at 1.2 m, shot in the life look or `build=old`, then taken
// away.
//   node --experimental-strip-types e2e/life-decks.mts <out dir> [life|life&build=old] [hour]
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
const LEVEL = 1;
const TOPS = [".", "~", ",", "_", ":"];
const Y0 = 4;
const Y1 = 7;
const W = 3.4;
const GAP = 0.8;
await page.evaluate((l) => (window as any).__yutopia.teleport({ x: 11, y: 11, level: l }), LEVEL);
await page.waitForTimeout(4000);
const ids = () => page.evaluate(() => ((window as any).__yutopia.structure.slabs ?? []).map((w: any) => w.id));
const s0 = new Set(await ids());
const x0 = (i: number) => 1 + i * (W + GAP);
// (the server's word when it refuses an edit)
await page.evaluate(() =>
  (window as any).__yutopia.room.onMessage("toast", (m: any) => console.log("toast:", m?.text)),
);
page.on("console", (m) => {
  if (m.text().startsWith("toast:")) console.log(m.text());
});
try {
  for (const [i, top] of TOPS.entries())
    await page.evaluate(
      ([a, b, Y0, Y1, top, level]) =>
        (window as any).__yutopia.send("struct:slabs", {
          level,
          add: [
            {
              outline: [
                [a, Y0],
                [b, Y0],
                [b, Y1],
                [a, Y1],
              ],
              top,
              over: 1.2,
            },
          ],
        }),
      [x0(i), x0(i) + W, Y0, Y1, top, LEVEL] as const,
    );
  // (the library's textures in: they load a few at a time)
  await page.waitForTimeout(15000);
  await page.evaluate((h) => {
    const w = (window as any).__yutopia;
    w.updateNight = () => {};
    w.tp.setHour(h);
  }, hour);
  await page.waitForTimeout(2500);
  // (the camera free round a point in front of the decks, looking at them)
  const mid = (i: number) => x0(i) + W / 2;
  for (const [name, x, pitch, dist, h] of [
    ["decks-a", mid(1), 0.45, 6, 1.4],
    ["decks-b", mid(3), 0.45, 6, 1.4],
    ["decks-near", mid(0), 0.25, 2.6, 1.2],
  ] as const) {
    const yaw = -Math.PI / 2;
    const at = [x, h, Y1 + 2.5];
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
      [[at[0], at[1], at[2]], yaw, pitch, dist] as const,
    );
    await page.waitForTimeout(2000);
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
    const file = `${out}/${name}-${hour}.png`;
    await page.screenshot({ path: file });
    console.log(file);
  }
} finally {
  const sNew = (await ids()).filter((i: string) => !s0.has(i));
  await page.evaluate(
    ([s, level]) => {
      if (s.length) (window as any).__yutopia.send("struct:slabs", { level, remove: s });
    },
    [sNew, LEVEL] as const,
  );
  await page.waitForTimeout(1500);
  console.log("removed", sNew.length, "decks");
  await b.close();
}
