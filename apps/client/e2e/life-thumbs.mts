/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 10 (dev only) — the Furnish panel's pictures in the life look (or `life&build=old`, the
// classic `classic`) as Ana: build mode on, its Furnish tab, each category's cards drawn, shot.
//   CATS='Seating,Tables' node --experimental-strip-types e2e/life-thumbs.mts <out dir> [look]
import { mkdirSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const out = process.argv[2];
const look = process.argv[3] ?? "life";
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
await page.goto(look === "classic" ? "http://localhost:3100/" : `http://localhost:3100/?look=${look}`);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 180_000 },
);
// (PETS=1: the pet panel's pictures instead — a dog adopted, its card, let go)
if (process.env.PETS === "1") {
  const send = (t: string, m: unknown) =>
    page.evaluate(([t, m]) => (window as any).__yutopia.send(t, m), [t, m] as const);
  await send("pet:adopt", { species: "dog", name: "Rex" });
  await page.waitForTimeout(5000);
  await page.evaluate(() => (window as any).__hud.set({ panel: { kind: "pets" } }));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/pets-panel.png` });
  console.log(`${out}/pets-panel.png`);
  const ids = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    return [...w.room.state.pets.values()].filter((p: any) => p.sid === w.room.sessionId).map((p: any) => p.id);
  });
  for (const id of ids) await send("pet:release", { id });
  await page.waitForTimeout(1000);
  await b.close();
  process.exit(0);
}
await page.evaluate(() =>
  (window as any).__hud.set({ build: { ...(window as any).__hud.get().build, on: true, tool: "walls" } }),
);
await page.waitForTimeout(1500);
await page.getByRole("tab", { name: /Furnish/ }).click();
// (the library's textures in, then the cards a few a frame)
await page.waitForTimeout(14000);
await page.screenshot({ path: `${out}/thumbs-first.png` });
console.log(`${out}/thumbs-first.png`);
for (const cat of (process.env.CATS ?? "").split(",").filter(Boolean)) {
  const tab = page.getByRole("button", { name: new RegExp(`^${cat}`, "i") }).first();
  if (!(await tab.count())) continue;
  await tab.click();
  await page.waitForTimeout(6000);
  const file = `${out}/thumbs-${cat.toLowerCase()}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
await b.close();
