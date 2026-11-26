/* biome-ignore-all lint/suspicious/noExplicitAny: a mock's probe (plan 130 phase 0) */
// Plan 130 phase 0: the game opened as Bia on the dev world (Metal), the hour held, with a three copy at window.MOCK3 to
// draw the mock's pieces into the game's own scene.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../apps/client/package.json", import.meta.url));
const { chromium, request } = require("@playwright/test");
const THREE_DIR = new URL("../../../node_modules/.pnpm/three@0.186.1/node_modules/three/build/", import.meta.url).pathname;

export async function open() {
  const ctx = await request.newContext();
  const tok = (await (await ctx.post("http://localhost:8100/api/login", {
    data: { email: "bia@yutopia.test", password: "yutopia-demo" }, headers: { Accept: "application/json" },
  })).json()).token;
  const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const page = await (await browser.newContext({ bypassCSP: true, viewport: { width: 1440, height: 900 } })).newPage();
  page.on("pageerror", (e: any) => console.log("  page:", e.message));
  await page.addInitScript(([t]: any) => {
    (window as any).__name = (f: unknown) => f;
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", cam3p: "free" }));
  }, [tok]);
  await page.route("**/__mock3/*", (route: any) => {
    const file = new URL(route.request().url()).pathname.split("/").pop() as string;
    route.fulfill({ contentType: "text/javascript", body: readFileSync(THREE_DIR + file, "utf8") });
  });
  await page.goto("http://localhost:3100");
  await page.waitForFunction(() => (window as any).__hud?.get()?.phase === "ready" && !(window as any).__hud?.get()?.loading?.on, null, { timeout: 240_000 });
  await page.addScriptTag({ type: "module", content: "import * as T from '/__mock3/three.module.js'; window.MOCK3 = T;" });
  await page.waitForFunction(() => !!(window as any).MOCK3, null, { timeout: 30_000 });
  return { browser, page };
}

export async function goTo(page: any, x: number, y: number) {
  await page.evaluate((p: any) => (window as any).__yutopia.teleport({ ...p, level: 0 }), { x, y });
  await page.waitForTimeout(3000);
  await page.waitForFunction(() => { const g = (window as any).__yutopia?.tp?.around?.grounds; return g && !g.statics?.left; }, null, { timeout: 90_000 }).catch(() => console.log("  statics not settled"));
  await page.waitForTimeout(3000);
}

export function hold(page: any, hour = 13) {
  return page.evaluate((h: number) => {
    const c = (window as any).__yutopia;
    c.updateNight = () => {};
    c.hour = h;
    c.engine?.setClock?.(h);
    if (c.life) c.life.weather = () => [0, 0];
    c.tp.setHour(h);
  }, hour);
}
