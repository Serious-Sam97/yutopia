/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Phase 0 of docs/plan/79-the-guns.md: today's guns in the game, the "before" beside the mocks — Ana on
// the pond at night, the torch on, one of the shadowed called up ahead: the revolver out, then aimed;
// the double-barrel aimed. The dev stack (:3100, :8100), the machine's GPU.
//   node --experimental-strip-types e2e/guns-today.mts [out dir]   (HOUR=13: by day; NAME=x: the files'
//   prefix, "today" by default)
import { chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/guns";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const G = (x: number, y: number) => ({ x, y });
const name = process.env.NAME ?? "today";

async function token(email: string): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${api}/api/login`, {
    data: { email, password: pass },
    headers: { Accept: "application/json" },
  });
  return (await res.json()).token;
}
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const gun = (page: Page) => w(page, (y) => y.room.state.players.get(y.room.sessionId).gun as string);
async function until(f: () => Promise<boolean>, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("timed out");
}

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
const tok = await token("ana@yutopia.test");
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  const p = JSON.parse(localStorage.getItem("yutopia:prefs") ?? "{}");
  localStorage.setItem(
    "yutopia:prefs",
    JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false, quality: "high" }),
  );
}, tok);
await page.goto(base);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false && !!(window as any).__yutopia?.tp;
  },
  null,
  { timeout: 120_000 },
);
await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-250, -60));
await page.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 30_000 });
await page.evaluate((h) => (window as any).__yutopia.room.send("mod:hour", { h }), Number(process.env.HOUR ?? 23));
await w(page, (y) => {
  y.room.send("mod:storm", { storm: 0, now: true });
  y.room.send("mod:refill", { kit: true });
  y.room.send("mod:dark", { mode: "normal", spawn: 1 });
  if (!y.room.state.players.get(y.room.sessionId).torch) y.toggleTorch();
  y.tp.yaw = 0;
  y.tp.pitch = 0.12;
});
await page.waitForTimeout(4000);
await page.mouse.move(720, 405);

for (const [key, id] of [
  ["Digit1", "revolver"],
  ["Digit2", "shotgun"],
] as const) {
  await page.keyboard.press(key);
  try {
    await until(async () => (await gun(page)) === id);
  } catch {
    console.log(`  no ${id} in slot ${key}: skipped`);
    continue;
  }
  await page.waitForTimeout(1200);
  // (which model's in the hand: the life look's, plan 79 phase 3 — its points are nodes — or the drawn one)
  const life = await w(page, (y) => !!y.tp.scene.getObjectByName("pt_muzzle"));
  console.log(`  ${id}: ${life ? "the life model" : "the drawn model"}`);
  await page.screenshot({ path: `${out}/0-${name}-${id}-ready.png` });
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/0-${name}-${id}-aim.png` });
  await page.mouse.up({ button: "right" });
  console.log("  wrote", id);
}
await browser.close();
