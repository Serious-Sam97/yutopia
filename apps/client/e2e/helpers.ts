/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect, type Page, request } from "@playwright/test";

// `test` for specs that open extra people (browser.newContext): whatever
// contexts a test opened are closed when it ends — live worlds left behind
// keep rendering and slow every test after them.
// With YUTOPIA_GPU=1 every browser draws on the machine's GPU: the world is 3D only now, and
// two 3D pages on headless Chromium's software GL crawl (the other one's loading stalls this
// one's frames past every timeout).
const GPU_ARGS = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
export const test = base.extend<{ closeExtraContexts: undefined }>({
  launchOptions: [
    async ({ launchOptions }, use) => {
      const args = launchOptions.args ?? [];
      await use(
        process.env.YUTOPIA_GPU === "1"
          ? { ...launchOptions, args: [...args, ...GPU_ARGS.filter((a) => !args.includes(a))] }
          : launchOptions,
      );
    },
    { scope: "worker" },
  ],
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
export const CAI = { email: "cai@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" };

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

// God mode's drafts (docs/plan/55-the-drafts.md): an admin's all deleted (a spec's start and end:
// the dev world's shared), or one made by its name on what's live — the newest, so god mode opens
// it going in (no name asked by the first change).
const draftCall = (tok: string, method: string, path: string, body?: unknown) =>
  fetch(`${API}/api/admin/grounds${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
export async function clearDrafts(tok: string): Promise<void> {
  const r = await (await draftCall(tok, "GET", "/drafts")).json();
  for (const d of r.drafts ?? []) await draftCall(tok, "DELETE", `/drafts/${d.id}`);
}
export async function makeDraft(
  tok: string,
  name: string,
  edit: (live: { rev: number } & Record<string, unknown>) => unknown = (e) => e,
): Promise<number> {
  const live = (
    await (
      await fetch(`${API}/api/world/edits`, { headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } })
    ).json()
  ).edits;
  const res = await draftCall(tok, "POST", "/drafts", { name, baseRev: live.rev, data: edit(live) });
  expect(res.status, `a draft "${name}": ${await res.clone().text()}`).toBe(201);
  return (await res.json()).draft.id;
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
  // biome-ignore lint/correctness/useHookAtTopLevel: an e2e helper, not a React hook
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
  await loaded(page);
  // at the arrival point, as the specs were written: people come back where they last
  // left (docs/plan/36-the-ghost.md), and a spec before left them anywhere
  await page.evaluate(() => {
    const w = (window as unknown as { __yutopia?: { room?: { send(t: string, m: unknown): void } } }).__yutopia;
    w?.room?.send("teleport", { to: "spawn" });
  });
  await page
    .waitForFunction(
      () => {
        const w = (window as any).__yutopia;
        const h = (window as any).__hud.get();
        const s = w.room.state;
        const me = s.players.get(w.room.sessionId);
        const at = h.mySpawn ?? { x: s.spawnX, y: s.spawnY };
        return !!me && Math.hypot(me.x - at.x, me.y - at.y) < 1.5;
      },
      null,
      { timeout: 10_000 },
    )
    .catch(() => {});
  // (the shadowed off: at the real hour it may be night on the Grounds, and a spec walking
  // the land would be struck down and woken at the office. The dark's own specs turn them on.)
  await page.evaluate(() => {
    const w = (window as unknown as { __yutopia?: { room?: { send(t: string, m: unknown): void } } }).__yutopia;
    w?.room?.send("mod:dark", { mode: "peaceful" });
  });
  await page.waitForTimeout(800);
}
// The loading screen gone (docs/plan/35-the-loading.md): the world built, the keys live
// again. After entering, and after a change of view.
export async function loaded(page: Page, timeout = 60_000) {
  await page.waitForFunction(
    () => (window as unknown as { __hud?: { get(): { loading: { on: boolean } } } }).__hud?.get().loading.on === false,
    null,
    { timeout },
  );
}
export const world = (page: Page, fn: (w: any, h: any) => unknown) =>
  page.evaluate(fn as never, null as never) as Promise<unknown>;

// A world point on the page (client px) as the 3D camera sees it: tiles, `z` iso px up
// (39.19 a tile, as the build code measures). Off screen / behind the camera: far off.
export const screenAt = (page: Page, x: number, y: number, z = 0) =>
  page.evaluate(
    ([tx, ty, tz]) => {
      const w = (window as any).__yutopia;
      const r = w.hostRect();
      const s = w.model.worldToClient(tx, ty, tz);
      return { x: r.left + s.x, y: r.top + s.y };
    },
    [x, y, z],
  );

// The 3D camera held (iso's pinCamera, gone with iso): free, not swinging in behind me, looking
// `yaw` (radians; north-west, where iso looked, by default) from `dist` tiles, `pitch` down. Round
// me — or, given `at` (tiles), pinned there: it stays put while I walk (null lets it follow again).
export const holdCamera = (
  page: Page,
  v: { at?: { x: number; y: number } | null; yaw?: number; pitch?: number; dist?: number } = {},
) =>
  page.evaluate((c) => {
    const t = (window as any).__yutopia.tp;
    t.mode = "free";
    t.yaw = c.yaw ?? -Math.PI * 0.75;
    t.pitch = c.pitch ?? 0.9;
    t.dist = c.dist ?? 9;
    t.dragged = 1e12;
    // (the view moves its target to me every frame: pinned, the target's own setters do nothing)
    const T = t.target;
    for (const k of ["set", "copy", "lerp", "add"]) delete T[k];
    if (c.at) {
      T.set(c.at.x, 1.2, c.at.y);
      for (const k of ["set", "copy", "lerp", "add"]) T[k] = () => T;
    }
  }, v);

// The hour held in both the model and the 3D view (the controller's 1 s timer would set it back).
export const holdHour = (page: Page, h: number) =>
  page.evaluate((hh) => {
    const c = (window as any).__yutopia;
    c.updateNight = () => {};
    c.hour = hh;
    c.model.setClock(hh);
    c.tp?.setHour(hh);
  }, h);

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

// Use on something (docs/plan/56-the-controls.md C — no clicking the world): close enough to it,
// facing it, it the focus ([ ] till it is, given its key: "o:id", "p:sid", "pet:id", "toy:id"),
// then E held (its menu) or tapped (its main action).
export async function actOn(page: Page, x: number, y: number, o: { key?: string; near?: number; hold?: boolean } = {}) {
  const near = o.near ?? 1.3;
  const m = (await page.evaluate(() => (window as any).__yutopia.meTile())) as { x: number; y: number };
  const d = Math.hypot(x - m.x, y - m.y);
  if (d > near + 0.25) {
    const k = (d - near) / d;
    await walkTo(page, m.x + (x - m.x) * k, m.y + (y - m.y) * k, 20_000);
  }
  await page.evaluate(
    ([tx, ty]) => {
      const w = (window as any).__yutopia;
      const yaw = Math.atan2(ty - w.me.y, tx - w.me.x);
      w.walker.body.yaw = yaw;
      if (w.walker.prev) w.walker.prev.yaw = yaw;
    },
    [x, y],
  );
  const focus = () => page.evaluate(() => (window as any).__yutopia.walker.targets.focus?.key ?? null);
  await expect.poll(focus, { timeout: 5000 }).not.toBeNull();
  if (o.key) {
    for (let i = 0; i < 4 && (await focus()) !== o.key; i++) {
      await page.keyboard.press("BracketRight");
      await page.waitForTimeout(150);
    }
    const list = await page.evaluate(() =>
      (window as any).__yutopia.walker.targets.list.map((t: any) => `${t.key} ${t.score.toFixed(2)}`),
    );
    expect(await focus(), `the focus (in reach: ${list.join(", ")})`).toBe(o.key);
  }
  if (o.hold === false) return page.keyboard.press("KeyE");
  await page.keyboard.down("KeyE");
  await page.waitForTimeout(450);
  await page.keyboard.up("KeyE");
}
