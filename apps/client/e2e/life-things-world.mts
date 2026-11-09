/* biome-ignore-all lint/suspicious/noExplicitAny: a probe */
// (plan 73 phase 6, dev only) the sample things put on Floor 1 as Ana, shot in the life look (or ?look=classic),
// then taken away: node --experimental-strip-types e2e/life-things-world.mts <out dir> [life|classic]
import { chromium, request } from "@playwright/test";

const base = "http://localhost:3100";
const out = process.argv[2];
const look = process.argv[3] ?? "life";
const ctx0 = await request.newContext();
const tok = (
  await (
    await ctx0.post("http://localhost:8100/api/login", {
      data: { email: "ana@yutopia.test", password: "yutopia-demo" },
      headers: { Accept: "application/json" },
    })
  ).json()
).token;
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("page:", e.message));
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high" }));
}, tok);
await page.goto(`${base}/?look=${look}`);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 180000 },
);
await page.evaluate(() => (window as any).__yutopia.teleport({ x: 10, y: 9, level: 1 }));
await page.waitForTimeout(4000);
const SAMPLE: [string, number, number][] = [
  ["sofa", 0, 3],
  ["armchair", 1, 1],
  ["chair", 0, 1],
  ["dining_table", 0, 3],
  ["desk", 0, 2],
  ["bookcase", 0, 2],
  ["lamp", 0, 1],
  ["plant", 3, 1],
];
const ids: string[] = [];
let x = 1;
for (const [k, v, w] of SAMPLE) {
  const id = `life-things-${k}`;
  ids.push(id);
  await page.evaluate((o) => (window as any).__yutopia.send("obj:put", o), {
    id,
    kind: k,
    x,
    y: 3,
    rot: 2,
    props: { variant: v },
  });
  x += w + 1;
}
try {
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    w.updateNight = () => {};
    w.tp.setHour(12);
    const cs = [...document.querySelectorAll("canvas")];
    const big = cs.sort((a: any, b: any) => b.width * b.height - a.width * a.height)[0];
    big?.setAttribute("data-wxshot", "");
    const st = document.createElement("style");
    st.textContent = "*:not(:has([data-wxshot])):not([data-wxshot]){visibility:hidden!important}";
    document.head.appendChild(st);
  });
  for (const [name, cx, d, pitch] of [
    ["row", 10, 9, 0.18],
    ["left", 4.5, 4, 0.3],
    ["right", 15.5, 4, 0.3],
  ] as [string, number, number, number][]) {
    await page.evaluate(
      ([cx, d, pitch]) => {
        const w = (window as any).__yutopia;
        w.teleport({ x: cx, y: 9, level: 1 });
        const tp = w.tp;
        tp.mode = "free";
        tp.yaw = -Math.PI / 2;
        tp.pitch = pitch;
        tp.dist = d;
        tp.dragged = 1e12;
      },
      [cx, d, pitch] as const,
    );
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${out}/world-${look}-${name}.png` });
    console.log(`${out}/world-${look}-${name}.png`);
  }
} finally {
  await page.evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), ids);
  await page.waitForTimeout(1500);
  await browser.close();
}
