/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { type Beam, beamAt } from "@yutopia/shared/beam";
import { ANA, BIA, enter, test, token } from "./helpers";

// Light, shared (docs/plan/30-the-dark.md, phase 3): Ana focuses her torch on
// Bia out on the pond; the beam is the same on both screens — where it starts,
// where it points (as she turned, not 8 ways), up as she aims, focused
// (narrow, far) — and lights Bia the same on both. Her battery runs down while
// she focuses. 3D in two browsers: the GPU (YUTOPIA_GPU=1). Review shots at
// night with YUTOPIA_SHOTS=<dir>.

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

// the ground floor's corner is at (-60, -10) in the building's coords
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });

const prefs = (page: Page) =>
  page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
// the beams a screen draws (shared beam.ts Beam), and where someone is on it
const beams = (page: Page) =>
  page.evaluate(() =>
    ((window as any).__yutopia.tp.torch3 as { on: Beam | null }[]).filter((t) => t.on).map((t) => ({ ...t.on })),
  );
const pos = (page: Page, sid: string) =>
  page.evaluate((s) => {
    const w = (window as any).__yutopia;
    if (s === w.room.sessionId) return { x: w.walker.where().x as number, y: w.walker.where().y as number };
    const p = w.tp.people3.get(s);
    return { x: p.root.position.x as number, y: p.root.position.z as number };
  }, sid);

test("a focused beam on someone: the same on both screens", async ({ page, browser }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
  await prefs(page);
  await enter(page, await token(ANA));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bia = await ctx.newPage();
  await prefs(bia);
  await enter(bia, await token(BIA));
  for (const p of [page, bia])
    await p.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
      timeout: 60_000,
    });
  const [ana, biaSid] = await Promise.all(
    [page, bia].map((p) => p.evaluate(() => (window as any).__yutopia.room.sessionId as string)),
  );
  // on the pond's ice: Ana, and Bia 6 tiles off at 0.3 rad round from east (not one of
  // the 8 ways: a beam that snapped to them would miss her)
  const YAW = 0.3;
  const at = { ana: G(-250, -60), bia: G(-250 + 6 * Math.cos(YAW), -60 + 6 * Math.sin(YAW)) };
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at.ana);
  await bia.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at.bia);
  await expect
    .poll(() => bia.evaluate((s) => !!(window as any).__yutopia.tp.people3.get(s), ana), { timeout: 30_000 })
    .toBe(true);
  await expect
    .poll(() => page.evaluate((s) => !!(window as any).__yutopia.tp.people3.get(s), biaSid), { timeout: 30_000 })
    .toBe(true);
  if (dir) await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 23 }));
  // (a full battery: it's kept from the last time, and comes back only to 40 by itself)
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:refill", {}));
  await page.waitForFunction(() => (window as any).__yutopia.walker.vitals.bat > 99, null, { timeout: 5000 });
  await page.waitForTimeout(2500);

  // Ana: the torch on, facing Bia, aiming with it — the right button held
  await page.evaluate((yaw) => {
    const w = (window as any).__yutopia;
    if (!w.room.state.players.get(w.room.sessionId).torch) w.toggleTorch();
    w.tp.yaw = yaw;
  }, YAW);
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: "right" });
  // the server has her focused; Bia sees it
  await expect
    .poll(() => bia.evaluate((s) => !!(window as any).__yutopia.room.state.players.get(s).focused, ana), {
      timeout: 10_000,
    })
    .toBe(true);
  await page.waitForTimeout(800);

  const mine = (await beams(page))[0];
  const seen = (await beams(bia)).find((b) => Math.hypot(b.x - mine.x, b.y - mine.y) < 1);
  expect(mine.focus, "focused on her own screen").toBe(true);
  expect(seen, "Bia's screen draws Ana's beam").toBeTruthy();
  const b = seen as Beam;
  expect(b.focus, "focused on Bia's").toBe(true);
  expect(Math.hypot(b.x - mine.x, b.y - mine.y), "from the same place").toBeLessThan(0.15);
  expect(Math.abs(b.z - mine.z)).toBeLessThan(0.1);
  const turn = Math.abs(Math.atan2(Math.sin(b.yaw - mine.yaw), Math.cos(b.yaw - mine.yaw)));
  expect(turn, "pointing the same way (a byte's worth)").toBeLessThan(0.04);
  // where she looks: turned a little so the light from her hand meets the crosshair (tp.lookYaw)
  const look = await page.evaluate(() => (window as any).__yutopia.tp.lookYaw as number);
  expect(Math.abs(mine.yaw - look), "where she looks").toBeLessThan(0.06);
  expect(Math.abs(look - YAW), "a little off the camera's line, no more").toBeLessThan(0.36);
  expect(Math.abs(b.pitch - mine.pitch), "up the same").toBeLessThan(0.04);
  // Bia lit by it the same on both screens
  const onA = beamAt(mine, ...(Object.values(await pos(page, biaSid)) as [number, number]));
  const onB = beamAt(b, ...(Object.values(await pos(bia, biaSid)) as [number, number]));
  expect(onA, "Ana's beam on Bia, on Ana's screen").toBeGreaterThan(0.3);
  expect(Math.abs(onA - onB), `the same light on Bia: ${onA} vs ${onB}`).toBeLessThan(0.08);
  if (dir) {
    await page.screenshot({ path: `${dir}/beam-ana.png` });
    await bia.screenshot({ path: `${dir}/beam-bia.png` });
  }
  // focusing eats the battery, the FOCO bar shows it
  await page.waitForTimeout(1500); // (100% lasts ~8 s focused)
  const bat = await page.evaluate(() => (window as any).__yutopia.walker.vitals.bat as number);
  expect(bat).toBeLessThan(90);
  // run flat: no focus left, the beam wide again on both (and the bar red)
  await expect
    .poll(() => bia.evaluate((s) => !!(window as any).__yutopia.room.state.players.get(s).focused, ana), {
      timeout: 12_000,
    })
    .toBe(false);
  // (run out, and coming back: under the 25% it takes to focus again)
  expect(await page.evaluate(() => (window as any).__yutopia.walker.vitals.bat as number)).toBeLessThan(25);
  expect(await page.evaluate(() => (window as any).__yutopia.walker.breath.drained as boolean)).toBe(true);
  await expect(page.locator(".dk-bat")).toBeVisible();

  // let go: wide again on both
  await page.mouse.up({ button: "right" });
  await expect
    .poll(() => bia.evaluate((s) => !!(window as any).__yutopia.room.state.players.get(s).focused, ana), {
      timeout: 10_000,
    })
    .toBe(false);
  await page.waitForTimeout(500);
  expect((await beams(page))[0].focus).toBe(false);
  await expect.poll(async () => (await beams(bia)).some((t) => t.focus)).toBe(false);
  await page.evaluate(() => (window as any).__yutopia.toggleTorch());
  if (dir) await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: null }));
});

// Run out focusing: the focus goes, and stays gone while still aiming — no on and off
// at 0 — until the battery's back to 25% (shared vitals.ts), on my screen and the server's.
test("run out: the focus goes and stays off until 25%", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(120_000);
  await prefs(page);
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-250, -60));
  await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    y.room.send("mod:refill", {});
    if (!y.room.state.players.get(y.room.sessionId).torch) y.toggleTorch();
  });
  await page.waitForFunction(() => (window as any).__yutopia.walker.vitals.bat > 99, null, { timeout: 5000 });
  // aim (the right button) and hold it: 100% lasts ~8 s
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: "right" });
  await page.waitForFunction(
    () => (window as any).__yutopia.walker.vitals.bat === 0 && (window as any).__yutopia.walker.breath.drained,
    null,
    { timeout: 15_000 },
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // still aiming: every frame till it's back, my focus and the server's. The server's ends a
  // moment after mine (it heard me aim a moment later, so it runs out later); what counts is
  // that neither comes back on before 25%
  const seen = (await page.evaluate(
    () =>
      new Promise<{ ms: number; back: number; serverOn: number }>((done) => {
        const y = (window as any).__yutopia;
        const t0 = performance.now();
        let was = !!y.room.state.players.get(y.room.sessionId).focused;
        let serverOn = 0;
        const tick = () => {
          const bat = y.walker.vitals.bat as number;
          const on = !!y.room.state.players.get(y.room.sessionId).focused;
          if (y.walker.focus) {
            done({ ms: performance.now() - t0, back: bat, serverOn });
            return;
          }
          if (on && !was) serverOn++;
          was = on;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  )) as { ms: number; back: number; serverOn: number };
  await page.mouse.up({ button: "right" });
  console.log(`[beam] run out: off ${Math.round(seen.ms)} ms, back on at ${seen.back.toFixed(1)}%`);
  expect(seen.back, "back on only at 25%").toBeGreaterThanOrEqual(24.5);
  // (~6 s from empty; sooner when the server's word lifts mine — it ran out a moment later)
  expect(seen.ms, "off for a while, not a flicker").toBeGreaterThan(2000);
  expect(seen.serverOn, "the server's focus never came back on meanwhile").toBe(0);
  await page.evaluate(() => (window as any).__yutopia.toggleTorch());
});
