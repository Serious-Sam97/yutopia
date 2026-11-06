/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 72 phase 11.9: Bia puts a desk down free on the dev stack (:3100, :8100) with the real mouse —
// turned 30° with R, its middle on the grid — a still of it and of the minimap drawn from the
// structure (11.11); undone at the end.
//   node --experimental-strip-types e2e/free-things.mts [out dir]
import { mkdirSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/build-tool/free-things";
mkdirSync(out, { recursive: true });
const ctx = await request.newContext();
const tok = (
  await (
    await ctx.post("http://localhost:8100/api/login", {
      data: { email: "bia@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" },
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
await page.goto("http://localhost:3100");
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 120_000 },
);
await page.evaluate(() => (window as any).__yutopia.teleport({ x: 20, y: 20, level: 3 }));
await page.waitForTimeout(3000);
const n0 = await page.evaluate(() => (window as any).__yutopia.model.allObjects().length);
let ok = true;
try {
  await page.evaluate(async () => {
    const w = (window as any).__yutopia;
    await w.loadBuild();
    (window as any).__hud.set((s: any) => ({
      build: { ...s.build, on: true, tool: "furniture", mode: "place", kind: "desk", props: null, rot: 0 },
    }));
    w.refreshGhost();
  });
  await page.waitForTimeout(800);
  await page.mouse.move(980, 640, { steps: 6 });
  await page.waitForTimeout(300);
  await page.keyboard.press("r");
  await page.keyboard.press("r");
  await page.mouse.move(985, 642, { steps: 2 });
  await page.waitForTimeout(400);
  const ghost = await page.evaluate(() =>
    (window as any).__yutopia.model
      .buildLook()
      .ghosts.map((g: any) => [
        +g.def.x.toFixed(3),
        +g.def.y.toFixed(3),
        +(g.def.yaw ?? 0).toFixed(4),
        g.def.props?.free,
        g.ok,
      ]),
  );
  console.log("ghost", JSON.stringify(ghost));
  await page.screenshot({ path: `${out}/01-ghost.png` });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const placed = await page.evaluate(() =>
    (window as any).__yutopia.model
      .allObjects()
      .filter((o: any) => o.kind === "desk" && o.props?.free)
      .map((o: any) => [+o.x.toFixed(3), +o.y.toFixed(3), +(o.yaw ?? 0).toFixed(4)]),
  );
  console.log(
    "placed",
    JSON.stringify(placed),
    "toasts",
    JSON.stringify((await page.evaluate(() => (window as any).__hud.get().toasts)).map((t: any) => t.text)),
  );
  if (!placed.length) ok = false;
  await page.evaluate(() => (window as any).__hud.set((s: any) => ({ build: { ...s.build, on: false } })));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/02-placed.png` });
  console.log(`${out}/02-placed.png`);
} catch (e) {
  ok = false;
  console.log("failed:", String(e).slice(0, 300));
} finally {
  for (let i = 0; i < 4; i++) {
    if ((await page.evaluate(() => (window as any).__yutopia.model.allObjects().length)) === n0) break;
    await page.evaluate(() => (window as any).__yutopia.undo());
    await page.waitForTimeout(800);
  }
  console.log(
    "left over",
    (await page.evaluate(() => (window as any).__yutopia.model.allObjects().length)) - n0,
    ok ? "" : "(a step failed)",
  );
  await b.close();
}
