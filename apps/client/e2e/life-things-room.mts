/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 6.9 (dev only) — a furnished room in the game: ~40 of the kit's things put on Floor 1 as
// Ana, the scene's draws and triangles counted (its own render, not the post's), its frames timed and its
// memory read, in the life look or the classic one; shot, then taken away.
//   node --experimental-strip-types e2e/life-things-room.mts <out dir> [life|classic] [high|medium|low]
import { chromium, request } from "@playwright/test";

const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const out = process.argv[2];
const look = process.argv[3] ?? "life";
const quality = process.argv[4] ?? "high";
const ROOM = [
  "sofa",
  "armchair",
  "chair",
  "chair",
  "coffee_table",
  "rug",
  "lamp",
  "plant",
  "bookcase",
  "desk",
  "tv_console",
  "side_table",
  "dining_table",
  "cupboard",
  "display_cabinet",
  "filing_cabinet",
  "piano",
  "drum_kit",
  "kitchen_island",
  "fridge",
  "pinball",
  "foosball",
  "air_hockey",
  "egg_chair",
  "rocking_chair",
  "bar_stool",
  "floor_vase",
  "indoor_tree",
  "fireplace",
  "xmas_tree",
  "chess_table",
  "card_table",
  "speaker_cab",
  "wood_stove",
  "shelving",
  "record_crates",
  "beanbag",
  "jukebox",
  "claw_machine",
  "loveseat",
]; // fmt: skip

const ctx0 = await request.newContext();
const tok = (
  await (
    await ctx0.post(`${api}/api/login`, {
      data: { email: "ana@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" },
      headers: { Accept: "application/json" },
    })
  ).json()
).token;
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("page:", e.message));
await page.addInitScript(
  ([t, q]) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q }));
  },
  [tok, quality] as const,
);
await page.goto(`${base}/?look=${look}`);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 180_000 },
);
await page.evaluate(() => (window as any).__yutopia.teleport({ x: 11, y: 9.5, level: 1 }));
await page.waitForTimeout(4000);
// the things in rows along the far wall, their footprints and a gap apart
const ids: string[] = [];
// (their footprints, tiles: the shared catalog's)
const FOOT: Record<string, [number, number]> = {
  sofa: [3, 1],
  armchair: [1, 1],
  chair: [1, 1],
  coffee_table: [2, 1],
  rug: [4, 3],
  lamp: [1, 1],
  plant: [1, 1],
  bookcase: [2, 1],
  desk: [2, 1],
  tv_console: [2, 1],
  side_table: [1, 1],
  dining_table: [3, 2],
  cupboard: [1, 1],
  display_cabinet: [1, 1],
  filing_cabinet: [1, 1],
  piano: [2, 1],
  drum_kit: [2, 2],
  kitchen_island: [2, 1],
  fridge: [1, 1],
  pinball: [1, 2],
  foosball: [2, 2],
  air_hockey: [3, 2],
  egg_chair: [1, 1],
  rocking_chair: [1, 1],
  bar_stool: [1, 1],
  floor_vase: [1, 1],
  indoor_tree: [2, 2],
  fireplace: [2, 1],
  xmas_tree: [2, 2],
  chess_table: [2, 1],
  card_table: [1, 1],
  speaker_cab: [1, 1],
  wood_stove: [1, 1],
  shelving: [2, 1],
  record_crates: [1, 1],
  beanbag: [1, 1],
  jukebox: [1, 1],
  claw_machine: [1, 1],
  loveseat: [2, 1],
};
const sizes = Object.fromEntries(Object.entries(FOOT).map(([k, [w, h]]) => [k, { w, h }]));
let x = 1;
let y = 1.5;
// (EMPTY=1: the room as it is, for the things' own share)
for (const [i, k] of (process.env.EMPTY === "1" ? [] : ROOM).entries()) {
  const s = sizes[k] ?? { w: 1, h: 1 };
  if (x + s.w > 22) {
    x = 1;
    y += 2.6;
  }
  const id = `life-room-${i}`;
  ids.push(id);
  await page.evaluate((o) => (window as any).__yutopia.send("obj:put", o), { id, kind: k, x, y, rot: 2 });
  x += s.w + 0.5;
}
try {
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    w.updateNight = () => {};
    w.tp.setHour(12);
    const tp = w.tp;
    tp.mode = "free";
    tp.yaw = -Math.PI / 2;
    tp.pitch = 0.32;
    tp.dist = 9;
    tp.dragged = 1e12;
  });
  await page.waitForTimeout(4000);
  const m = await page.evaluate(
    () =>
      new Promise((done) => {
        const w = window as any;
        const tp = w.__yutopia.tp;
        const r = tp.renderer;
        const scene = tp.scene;
        // (the scene's own render each frame: its draws and triangles, read straight after it)
        let calls = 0;
        let tris = 0;
        const render = r.render.bind(r);
        r.render = (s: unknown, c: unknown) => {
          render(s, c);
          if (s === scene) {
            calls = r.info.render.calls;
            tris = r.info.render.triangles;
          }
        };
        const gaps: number[] = [];
        let last = performance.now();
        const tick = (now: number) => {
          gaps.push(now - last);
          last = now;
          if (gaps.length < 241) requestAnimationFrame(tick);
          else {
            r.render = render;
            const g = gaps.slice(1).sort((a, b) => a - b);
            done({
              calls,
              tris,
              frameMs: +(g.reduce((a, b) => a + b, 0) / g.length).toFixed(2),
              p95Ms: +g[Math.floor(g.length * 0.95)].toFixed(2),
              geometries: r.info.memory.geometries,
              textures: r.info.memory.textures,
              heapMb: +((performance as any).memory?.usedJSHeapSize / 1e6).toFixed(1),
              programs: r.info.programs?.length ?? 0,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(look, quality, JSON.stringify(m));
  await page.evaluate(() => {
    const cs = [...document.querySelectorAll("canvas")];
    const big = cs.sort((a: any, b: any) => b.width * b.height - a.width * a.height)[0];
    big?.setAttribute("data-wxshot", "");
    const st = document.createElement("style");
    st.textContent = "*:not(:has([data-wxshot])):not([data-wxshot]){visibility:hidden!important}";
    document.head.appendChild(st);
  });
  await page.screenshot({ path: `${out}/room-${look}-${quality}${process.env.EMPTY === "1" ? "-empty" : ""}.png` });
} finally {
  await page.evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), ids);
  await page.waitForTimeout(1500);
  await browser.close();
}
