/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 7.1 (dev only) — a row of walls on Floor 1 as Ana, one of each kind (plaster with its
// dado, walnut, foam, brick, cork, glass, a half wall, a bowed one (a painted window an old save's only)), shot in the life
// look or `build=old`, then taken away.
//   node --experimental-strip-types e2e/life-walls.mts <out dir> [life|life&build=old] [hour]
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
const Y = 5;
const LEN = 2;
const GAP = 0.45;
const KINDS = ["p", "w", "f", "b", "k", "g", "h", "p"];
await page.evaluate((l) => (window as any).__yutopia.teleport({ x: 11, y: 10, level: l }), LEVEL);
await page.waitForTimeout(4000);
const ids = () => page.evaluate(() => ((window as any).__yutopia.structure.walls ?? []).map((w: any) => w.id));
const w0 = new Set(await ids());
const x0 = (i: number) => 0.6 + i * (LEN + GAP);
// (the server's word when it refuses an edit)
await page.evaluate(() =>
  (window as any).__yutopia.room.onMessage("toast", (m: any) => console.log("toast:", m?.text)),
);
page.on("console", (m) => {
  if (m.text().startsWith("toast:")) console.log(m.text());
});
try {
  await page.evaluate(
    ([kinds, Y, LEN, GAP, level]) =>
      (window as any).__yutopia.send("struct:walls", {
        level,
        add: kinds.map((k, i) => ({
          a: [0.6 + i * (LEN + GAP), Y],
          b: [0.6 + i * (LEN + GAP) + LEN, Y],
          front: k,
          // (the last: bowed)
          ...(i === kinds.length - 1 ? { bow: 0.5 } : {}),
        })),
      }),
    [KINDS, Y, LEN, GAP, LEVEL] as const,
  );
  // (the library's textures in: they load a few at a time)
  await page.waitForTimeout(15000);
  await page.evaluate((h) => {
    const w = (window as any).__yutopia;
    w.updateNight = () => {};
    w.tp.setHour(h);
  }, hour);
  await page.waitForTimeout(2500);
  // (the camera free round a point in front of the row, looking at it)
  const mid = (i: number) => x0(i) + LEN / 2;
  for (const [name, x, pitch, dist, h] of [
    ["walls-1", mid(1), 0.12, 4.6, 1.5],
    ["walls-2", mid(4), 0.12, 4.6, 1.5],
    ["walls-3", mid(6), 0.12, 4.6, 1.5],
    ["walls-near", mid(0) + 0.4, 0.02, 1.2, 1.1],
    ["walls-row", mid(3.5), 0.32, 9, 1.4],
  ] as const) {
    const yaw = -Math.PI / 2;
    const at = [x, h, Y + 2.2];
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
  const wNew = (await ids()).filter((i: string) => !w0.has(i));
  await page.evaluate(
    ([w, level]) => {
      if (w.length) (window as any).__yutopia.send("struct:walls", { level, remove: w });
    },
    [wNew, LEVEL] as const,
  );
  await page.waitForTimeout(1500);
  console.log("removed", wNew.length, "walls");
  await b.close();
}
