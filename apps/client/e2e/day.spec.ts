/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { dayNests, dayOf, NESTS } from "@yutopia/shared/dark";
import { walkableTile } from "@yutopia/shared/grounds";
import { ANA, enter, test, token, walkTo } from "./helpers";

// The day (docs/plan/31-the-day.md, phase 3): Ana out by day near one of the
// day's nests in the woods — asleep, crouched, the shroud drawn in, its cache
// lying among them; she walks in and the nest wakes, all of it. 3D on the
// machine's GPU (YUTOPIA_GPU=1). Shots: YUTOPIA_SHOTS=<dir>.

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
// the ground floor's corner is at (-60, -10) in the building's coords
const OFF = { x: -60, y: -10 };
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};
const near = (page: Page, n: { x: number; z: number }) =>
  page.evaluate(
    (c) =>
      [...((window as any).__yutopia.room.state.shadows?.values() ?? [])]
        .filter((s: any) => Math.hypot(s.x - c.x, s.y - c.y) < 7)
        .map((s: any) => s.s as number),
    { x: n.x - OFF.x, y: n.z - OFF.y },
  );
const LURK = 10; // shared dark/fsm.ts SHADE_STATES

for (const zone of ["woods", "farm"] as const)
  test(`by day: a nest (${zone}) asleep, its cache among them; walked into, it wakes`, async ({ page }) => {
    test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
    });
    await enter(page, await token(ANA));
    await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
    // a woods nest of 2+ with a cache, among the day's first 30; a walkable spot 22 tiles off, clear of the others
    const all = dayNests(dayOf(Date.now())).slice(0, NESTS.base);
    const nest = all.find((n) => n.zone === zone && n.n >= 2 && n.cache) ?? all.find((n) => n.zone === zone);
    expect(nest).toBeTruthy();
    const n = nest as NonNullable<typeof nest>;
    let from: { x: number; z: number } | null = null;
    for (let k = 0; k < 64 && !from; k++) {
      const a = (k / 64) * Math.PI * 2;
      const x = Math.floor(n.x + Math.cos(a) * 22) + 0.5;
      const z = Math.floor(n.z + Math.sin(a) * 22) + 0.5;
      if (walkableTile(Math.floor(x), Math.floor(z)) && all.every((m) => m === n || Math.hypot(m.x - x, m.z - z) > 14))
        from = { x, z };
    }
    expect(from).toBeTruthy();
    const f = from as { x: number; z: number };
    await page.evaluate(
      (p) => {
        const y = (window as any).__yutopia;
        y.room.send("mod:dark", { mode: "normal" });
        y.room.send("mod:hour", { h: 12 });
        y.room.send("mod:storm", { storm: 0, now: true });
        y.teleport({ ...p, level: 0 });
      },
      { x: f.x - OFF.x, y: f.z - OFF.y },
    );
    // out, asleep, as many as the nest holds
    await expect.poll(async () => (await near(page, n)).length, { timeout: 20_000 }).toBe(n.n);
    expect((await near(page, n)).every((s) => s === LURK)).toBe(true);
    // turned to them, the camera over her shoulder
    await page.evaluate(
      (c) => {
        const y = (window as any).__yutopia;
        const me = y.walker.where();
        y.tp.yaw = Math.atan2(c.y - me.y, c.x - me.x);
        y.tp.pitch = -0.18;
      },
      { x: n.x - OFF.x, y: n.z - OFF.y },
    );
    await page.waitForTimeout(1500);
    await shot(page, `02-nest-asleep-${zone}`);
    if (n.cache)
      await expect.poll(() => page.evaluate(() => (window as any).__yutopia.room.state.caches.size)).toBeGreaterThan(0);
    // creeping up, crouched (C): at 9 tiles they sleep on — a close look
    await page.keyboard.press("KeyC");
    const dx = f.x - n.x;
    const dz = f.z - n.z;
    const l = Math.hypot(dx, dz);
    await walkTo(page, n.x + (dx / l) * 9 - OFF.x, n.z + (dz / l) * 9 - OFF.y, 30_000).catch(() => {});
    await page.waitForTimeout(800);
    expect(
      (await near(page, n)).every((s) => s === LURK),
      "crouched at 9 tiles: asleep",
    ).toBe(true);
    await page.evaluate(
      (c) => {
        const y = (window as any).__yutopia;
        const me = y.walker.where();
        y.tp.yaw = Math.atan2(c.y - me.y, c.x - me.x);
        y.tp.pitch = -0.25;
      },
      { x: n.x - OFF.x, y: n.z - OFF.y },
    );
    await page.waitForTimeout(1200);
    await shot(page, `02b-nest-close-${zone}`);
    await page.keyboard.press("KeyC");
    // walking in: the nest wakes (the sting), all of it
    await walkTo(page, n.x - OFF.x + 4, n.z - OFF.y, 30_000).catch(() => {});
    await expect.poll(async () => (await near(page, n)).some((s) => s === LURK), { timeout: 8000 }).toBe(false);
    await page.waitForTimeout(600);
    await shot(page, `03-nest-waking-${zone}`);
    await page.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { mode: "peaceful" }));
  });
