/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

// Yutopia's API (apps/api); the dev stack's on :8100.
export const API = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
// Demo accounts from the API's DemoSeeder (local dev only); Ana is an admin.
export const ANA = { email: "ana@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" };
export const BIA = { email: "bia@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" };

// One login per account per run: the API rate-limits /api/login (throttle:auth).
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

// There's one world. The specs were written against two layouts, kept as fixtures
// in ./worlds: "demo" (the Studio as designed) and "lab" (the build sandbox, as
// map-edit.spec leaves it: a blank floor with Ana's office, its desk and its door). The world is put back to the one a spec asks for whenever
// the last spec used the other (or this run hasn't set it yet) — so a run starts
// from a known world, and specs in a row on the same one share it as before.
// Needs the API's YUTOPIA_E2E=1 (local stacks only); it closes the live room while
// it swaps (anyone in the world is put out and comes back to the fixture).
export type World = "demo" | "lab";
let current: World | null = null;

export async function useWorld(name: World = "demo"): Promise<World> {
  if (current === name) return name;
  const snap = JSON.parse(readFileSync(join(__dirname, "worlds", `${name}.json`), "utf8"));
  const ctx = await request.newContext();
  // the fixtures were saved with Ana as user 1; a reseeded database numbers her anew
  const me = await ctx.get(`${API}/api/me`, {
    headers: { Authorization: `Bearer ${await token(ANA)}`, Accept: "application/json" },
  });
  const ana = (await me.json()).user.id as number;
  for (const o of [...(snap.objects ?? []).map((x: any) => x.props), ...(snap.layout?.areas ?? [])])
    if (o?.ownerId === 1) o.ownerId = ana;
  const res = await ctx.post(`${API}/api/e2e/world`, {
    data: snap,
    headers: { Authorization: `Bearer ${await token(ANA)}`, Accept: "application/json" },
    timeout: 60_000,
  });
  expect(res.ok(), `putting the "${name}" world back: ${res.status()} ${await res.text()}`).toBeTruthy();
  current = name;
  return name;
}

export async function enter(page: Page, tok: string, worldName?: World) {
  if (worldName) await useWorld(worldName);
  await page.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    // a fixed tier: Auto would step down mid-test in a headless browser (software GPU)
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: p.quality && p.quality !== "auto" ? p.quality : "high" }));
  }, tok);
  await page.goto("/");
  await page.waitForFunction(
    () => (window as unknown as { __hud?: { get(): { phase: string } } }).__hud?.get().phase === "ready",
    null,
    { timeout: 60_000 },
  );
  // (the shadowed off: at the real hour it may be night on the Grounds, and a spec walking
  // the land would be struck down and woken at the office. The dark's own specs turn them on.)
  await page.evaluate(() => {
    const w = (window as unknown as { __yutopia?: { room?: { send(t: string, m: unknown): void } } }).__yutopia;
    w?.room?.send("mod:dark", { mode: "peaceful" });
  });
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
