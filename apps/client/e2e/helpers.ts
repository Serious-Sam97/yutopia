/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { test as base, expect, type Page, request } from "@playwright/test";

// `test` for specs that open extra people (browser.newContext): whatever
// contexts a test opened are closed when it ends — live worlds left behind
// keep rendering and slow every test after them.
export const test = base.extend<{ closeExtraContexts: undefined }>({
  closeExtraContexts: [
    async ({ browser }, use) => {
      const before = new Set(browser.contexts());
      await use(undefined);
      await Promise.all(
        browser
          .contexts()
          .filter((c) => !before.has(c))
          .map((c) => c.close().catch(() => {})),
      );
    },
    { auto: true },
  ],
});

export const API = process.env.YUTOPIA_E2E_API ?? "http://localhost";
// Demo accounts from Yondra's YutopiaDemoSeeder (local dev only).
export const ANA = { email: "ana@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" };
export const BIA = { email: "bia@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" };

// One login per account per run: Yondra rate-limits /api/login (throttle:auth).
const tokens = new Map<string, Promise<string>>();
export function token(who: { email: string; password: string }): Promise<string> {
  if (!tokens.has(who.email)) tokens.set(who.email, login(who));
  return tokens.get(who.email) as Promise<string>;
}

async function login(who: { email: string; password: string }): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API}/api/login`, { data: who, headers: { Accept: "application/json" } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token;
}

export async function spaceId(tok: string, name = "Yutopia Demo"): Promise<number> {
  const ctx = await request.newContext();
  const res = await ctx.get(`${API}/api/yutopia/spaces`, {
    headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" },
  });
  const { spaces } = await res.json();
  return spaces.find((s: { name: string }) => s.name === name).id;
}

export async function enter(page: Page, tok: string, space: number) {
  await page.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    // a fixed tier: Auto would step down mid-test in a headless browser (software GPU)
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: p.quality && p.quality !== "auto" ? p.quality : "high" }));
  }, tok);
  await page.goto(`/s/${space}`);
  await page.waitForFunction(
    () => (window as unknown as { __hud?: { get(): { phase: string } } }).__hud?.get().phase === "ready",
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(800);
}
export const world = (page: Page, fn: (w: any, h: any) => unknown) =>
  page.evaluate(fn as never, null as never) as Promise<unknown>;

export async function walkTo(page: Page, x: number, y: number, ms = 12_000) {
  await page.evaluate(
    ([px, py]) =>
      (window as unknown as { __yutopia: { walkTo(p: { x: number; y: number }): void } }).__yutopia.walkTo({
        x: px,
        y: py,
      }),
    [x, y],
  );
  await page.waitForFunction(
    ([px, py]) => {
      const t = (window as unknown as { __yutopia: { meTile(): { x: number; y: number } } }).__yutopia.meTile();
      return Math.hypot(t.x - px, t.y - py) < 1.2;
    },
    [x, y],
    { timeout: ms },
  );
}
