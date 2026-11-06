/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 72 phase 11.11: Bia paints a wall drawn free on the dev stack (:3100, :8100) with the real mouse
// — a face in brick from where she stands — then picks it in Select and swaps its sides in the
// inspector, then takes it away; stills; every change undone at the end.
//   node --experimental-strip-types e2e/free-paint.mts [out dir]
import { mkdirSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/build-tool/free-paint";
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
const walls = () => page.evaluate(() => (window as any).__yutopia.structure.walls.length);
const n0 = await walls();
const set = (patch: Record<string, unknown>) =>
  page.evaluate((p) => {
    (window as any).__hud.set((s: any) => ({ build: { ...s.build, ...p } }));
    (window as any).__yutopia.refreshGhost();
  }, patch);
const wallNow = (id: string) =>
  page.evaluate((i) => (window as any).__yutopia.structure.walls.find((q: any) => q.id === i), id);
let ok = true;
try {
  // a wall at an angle in view, from two floor points on screen
  const ends = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const r = w.hostRect();
    const a = w.model.screenToWorld(r.left + 700, r.top + 640);
    const c = w.model.screenToWorld(r.left + 1150, r.top + 560);
    const q = (v: number) => Math.round(v * 1000) / 1000;
    return { a: [q(a.x), q(a.y)], b: [q(c.x), q(c.y)] };
  });
  await page.evaluate(
    (e) => (window as any).__yutopia.send("struct:walls", { level: 3, n: 5, add: [{ ...e, front: "p" }] }),
    ends,
  );
  await page.waitForTimeout(1200);
  const id = await page.evaluate(
    (e) => (window as any).__yutopia.structure.walls.find((q: any) => q.a[0] === e.a[0] && q.a[1] === e.a[1])?.id,
    ends,
  );
  console.log("wall", id);
  await page.evaluate(async () => (window as any).__yutopia.loadBuild());
  const mid = await page.evaluate((e) => {
    const w = (window as any).__yutopia;
    const r = w.hostRect();
    const q = w.model.worldToClient((e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, 1.5);
    return { x: r.left + q.x, y: r.top + q.y };
  }, ends);
  // Paint: brick on the face toward her
  await set({ on: true, tool: "walls", wallMode: "paint", paint: "b" });
  await page.mouse.move(mid.x - 20, mid.y, { steps: 3 });
  await page.mouse.move(mid.x, mid.y, { steps: 4 });
  await page.waitForTimeout(300);
  console.log("paint tag", JSON.stringify(await page.evaluate(() => (window as any).__hud.get().build.wallTag)));
  await page.screenshot({ path: `${out}/01-paint-hover.png` });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(1200);
  let w1 = await wallNow(id);
  console.log("after paint", w1?.front, w1?.back);
  // Select: picked, the inspector, swap
  await set({ wallMode: "select" });
  await page.mouse.move(mid.x + 4, mid.y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(600);
  const insp = await page.$('[data-testid="free-wall-inspector"]');
  console.log(
    "inspector",
    !!insp,
    JSON.stringify(await page.evaluate(() => (window as any).__hud.get().build.freeSel)),
  );
  await page.screenshot({ path: `${out}/02-inspector.png` });
  await page.evaluate(() => (window as any).__yutopia.build.freeWallAction("swap"));
  await page.waitForTimeout(1200);
  w1 = await wallNow(id);
  console.log("after swap", w1?.front, w1?.back);
  await page.evaluate(() => (window as any).__yutopia.build.freeWallAction("remove"));
  await page.waitForTimeout(1200);
  console.log("after remove", !!(await wallNow(id)));
} catch (e) {
  ok = false;
  console.log("failed:", String(e).slice(0, 300));
} finally {
  for (let i = 0; i < 6 && (await walls()) !== n0; i++) {
    await page.evaluate(() => (window as any).__yutopia.undo());
    await page.waitForTimeout(800);
  }
  console.log("left over", (await walls()) - n0, ok ? "" : "(a step failed)");
  await b.close();
}
