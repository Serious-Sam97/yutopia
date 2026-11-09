/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 7 (dev only) — a hut on the lot's snow as Ana: four walls (brick, plaster, walnut) and a
// gable over them, shot from outside in the life look or `build=old`, then taken away.
//   node --experimental-strip-types e2e/life-hut.mts <out dir> [life|life&build=old] [hour]
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
const X0 = -22;
const Y0 = -8;
const X1 = -16;
const Y1 = -3;
await page.evaluate(() => (window as any).__yutopia.teleport({ x: -10, y: -14, level: 0 }));
await page.waitForTimeout(3000);
const ids = (k: "walls" | "roofs") =>
  page.evaluate((k) => ((window as any).__yutopia.structure[k] ?? []).map((w: any) => w.id), k);
const w0 = new Set(await ids("walls"));
const r0 = new Set(await ids("roofs"));
try {
  const r: [number, number][] = [
    [X0, Y0],
    [X1, Y0],
    [X1, Y1],
    [X0, Y1],
  ];
  const fronts = ["b", "p", "b", "w"];
  await page.evaluate(
    ([r, fronts]) =>
      (window as any).__yutopia.send("struct:walls", {
        level: 0,
        add: r.map((p, i) => ({ a: p, b: r[(i + 1) % 4], front: fronts[i], height: 3 })),
      }),
    [r, fronts] as const,
  );
  await page.waitForTimeout(1500);
  await page.evaluate(
    (r) =>
      (window as any).__yutopia.send("struct:roofs", { level: 0, add: [{ outline: r, kind: "gable", pitch: 32 }] }),
    r,
  );
  // (the library's textures in: they load a few at a time)
  await page.waitForTimeout(15000);
  await page.evaluate((h) => {
    const w = (window as any).__yutopia;
    w.updateNight = () => {};
    w.tp.setHour(h);
  }, hour);
  await page.waitForTimeout(2500);
  const [cx, cy] = [(X0 + X1) / 2, (Y0 + Y1) / 2];
  // (the camera free round a point outside the hut, looking at it: a point inside, and the camera's pull-in
  // off the hut's own walls kept it in there)
  const OUT = 4.6;
  for (const [name, yaw, pitch, dist, h] of [
    ["hut-a", -2.6, 0.1, 6, 1.8],
    ["hut-b", 0.55, 0.1, 6, 1.8],
    ["hut-roof", -2.3, 0.5, 8, 3.6],
    ["hut-near", -2.6, 0.04, 1.8, 1.6],
    // (inside: the camera's pull-in keeps it there, the roof cut away as a room's ceiling is)
    ["hut-in", 0.3, 0.15, 12, 1.8],
  ] as const) {
    const out0 = name === "hut-in" ? 0 : OUT;
    const at = [cx - Math.cos(yaw) * out0, h, cy - Math.sin(yaw) * out0];
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
  const wNew = (await ids("walls")).filter((i: string) => !w0.has(i));
  const rNew = (await ids("roofs")).filter((i: string) => !r0.has(i));
  await page.evaluate(
    ([w, r]) => {
      const y = (window as any).__yutopia;
      if (r.length) y.send("struct:roofs", { level: 0, remove: r });
      if (w.length) y.send("struct:walls", { level: 0, remove: w });
    },
    [wNew, rNew] as const,
  );
  await page.waitForTimeout(1500);
  console.log("removed", wNew.length, "walls", rNew.length, "roofs");
  await b.close();
}
