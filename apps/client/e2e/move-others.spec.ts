/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld } from "./helpers";

// The move, seen by someone else (docs/plan/29-the-move.md, phase 3): Ana, in
// first person, sprints, stops, steps aside and jumps; Bia, in 3D, sees her do
// it in step — at her speeds, smoothly (played back on Ana's own clock, no
// stalls), facing the way she faces (not 8 ways), up and down in the jump.
// 3D in two browsers: run it with the GPU (YUTOPIA_GPU=1) or it crawls.

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const prefs = (page: Page, view: "1p" | "3p") =>
  page.addInitScript((v) => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: v, reducedMotion: false }));
  }, view);

test("the move seen by others: sprint, stop, a step aside, a jump", async ({ page, browser }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(240_000);
  const lab = await useWorld("lab");
  await prefs(page, "1p");
  await enter(page, await token(ANA), lab);
  const ana = await page.evaluate(() => (window as any).__yutopia.room.sessionId as string);

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ...(process.env.YUTOPIA_SHOTS ? { recordVideo: { dir: process.env.YUTOPIA_SHOTS } } : {}),
  });
  const bia = await ctx.newPage();
  await prefs(bia, "3p");
  await enter(bia, await token(BIA), lab);
  // Bia a few steps from Ana, both with their walkers and views up
  const anaUid = await page.evaluate(() => (window as any).__yutopia.myUid() as number);
  await bia.evaluate((uid) => (window as any).__yutopia.teleport({ userId: uid }), anaUid);
  for (const p of [page, bia])
    await p.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
      timeout: 60_000,
    });
  await expect
    .poll(() => bia.evaluate((sid) => !!(window as any).__yutopia.tp.people3.get(sid), ana), { timeout: 30_000 })
    .toBe(true);
  await page.waitForTimeout(1500);

  // (Ana's own: the server never puts her back — an honest sprint is allowed)
  await page.evaluate(() => {
    const w = window as any;
    w.__snaps = [];
    w.__yutopia.room.onMessage("snap", (m: any) => w.__snaps.push(m));
  });
  // Bia watches: Ana as she's drawn there, every frame
  await bia.evaluate((sid) => {
    const w = window as any;
    const log: number[][] = [];
    w.__seen = log;
    const t0 = performance.now();
    const f = () => {
      const p = w.__yutopia.tp.people3.get(sid);
      if (p)
        log.push([performance.now() - t0, p.root.position.x, p.root.position.z, p.root.position.y, p.turned, p.spd]);
      if (performance.now() - t0 < 9000) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }, ana);
  const t0 = Date.now();
  const at = (ms: number) => page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
  // sprint ahead 0.3–1.6 s, stopped till 2.6, aside 2.6–3.8, stopped, a jump at 5
  await at(300);
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  await at(1600);
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  await at(2600);
  await page.keyboard.down("d");
  await at(3800);
  await page.keyboard.up("d");
  await at(5000);
  await page.keyboard.press(" ");
  await at(9300);
  const seen = (await bia.evaluate(() => (window as any).__seen)) as number[][];
  const during = (a: number, b: number) => seen.filter((s) => s[0] >= a && s[0] <= b);
  const fast = Math.max(...during(800, 1900).map((s) => s[5]));
  const still = Math.max(...during(2300, 2700).map((s) => s[5]));
  const aside = during(3000, 4000);
  const top = Math.max(...during(5000, 6500).map((s) => s[3])) - Math.min(...during(4400, 4900).map((s) => s[3]));
  const snaps = await page.evaluate(() => (window as any).__snaps);
  console.log({ frames: seen.length, fast, still, top, snaps: JSON.stringify(snaps) });
  expect(snaps, "the server put Ana back").toEqual([]);

  // at Ana's speeds: sprinting, then stopped
  expect(fast).toBeGreaterThan(5.8);
  // (the drawn speed is from frame to frame on Bia's side: a little over now and then)
  expect(fast).toBeLessThan(8.4);
  expect(still).toBeLessThan(0.6);
  // stepping aside she keeps facing the same way (a facing as she turned, not 8 ways)
  const turned = aside.map((s) => s[4]);
  expect(Math.max(...turned) - Math.min(...turned)).toBeLessThan(0.15);
  expect(Math.max(...aside.map((s) => s[5]))).toBeGreaterThan(2.5);
  // up in the jump (a hop's 0.55–0.8)
  expect(top).toBeGreaterThan(0.4);
  expect(top).toBeLessThan(1.0);
  // smooth: while she's moving, no frame drawn where she stands still or leaps (a stall or a catch-up)
  const moving = during(800, 1500);
  let stalls = 0;
  for (let i = 1; i < moving.length; i++) {
    const d = Math.hypot(moving[i][1] - moving[i - 1][1], moving[i][2] - moving[i - 1][2]);
    const dt = (moving[i][0] - moving[i - 1][0]) / 1000;
    if (dt > 0 && (d / dt < 2 || d / dt > 11)) stalls++;
  }
  expect(stalls, "frames where she stalled or jumped ahead").toBeLessThanOrEqual(Math.ceil(moving.length * 0.05));
  await ctx.close();
});
