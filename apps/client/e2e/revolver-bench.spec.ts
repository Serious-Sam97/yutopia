/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the bench's window hooks */
import { expect, type Page } from "@playwright/test";
import { test } from "./helpers";

// Plan 80 phase 6: the revolver's hold checked on its bench (/dev/revolver — the game's own person, the life
// revolver): upright and on the look aimed at every pitch and every turn of her, with and without the torch;
// no hand through the other or the grip; each wrist at its place; up from the ready in the gun's own time;
// the draw from the holster; the reload's every key with both hands on their places. 3D: the GPU
// (YUTOPIA_GPU=1).
const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const DEG = Math.PI / 180;

const set = (page: Page, s: Record<string, unknown>) => page.evaluate((s) => (window as any).__revolver.set(s), s);
const check = (page: Page) => page.evaluate(() => (window as any).__revolver.check());
const settle = (page: Page) => page.waitForTimeout(700);
const BASE = {
  pose: "ready",
  pitch: 0,
  move: 0,
  draw: 1,
  away: false,
  torch: false,
  kick: 0,
  trigger: 0,
  act: "",
  actT: 0,
};

test("the revolver's hold on its bench: upright, on the look, no hand through a hand, drawn, reloaded", async ({
  page,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto("/dev/revolver");
  await page.waitForFunction(() => (window as any).__revolver?.ready, null, { timeout: 120_000 });

  // aimed: every pitch, every turn of her, with and without the torch (Harries)
  for (const yaw of [0, 1.3, -2.4, 3.0])
    for (const torch of [false, true])
      for (const pitch of [-0.9, -0.3, 0.3, 0.9]) {
        await set(page, { ...BASE, pose: "aim", yaw, torch, pitch });
        await settle(page);
        const c = await check(page);
        const at = `yaw ${yaw} pitch ${pitch}${torch ? " torch" : ""}`;
        expect(c, at).not.toBeNull();
        expect(c.cant, `${at}: upright`).toBeLessThan(2 * DEG);
        expect(c.off, `${at}: on the look`).toBeLessThan(2 * DEG);
        expect(c.R.short, `${at}: the right at its place`).toBeLessThan(0.015);
        // (skin gives a few mm; Harries' hands pressed together)
        expect(c.hands, `${at}: a hand through a hand (${c.where})`).toBeGreaterThan(torch ? -0.005 : -0.003);
        if (!torch) {
          expect(c.grip, `${at}: fingers through the grip`).toBeGreaterThan(-0.003);
          expect(c.L.short, `${at}: the left on the gun`).toBeLessThan(0.015);
        }
      }

  // the low ready, at every turn: upright, both hands on
  for (const yaw of [0, -1.6, 2.6]) {
    await set(page, { ...BASE, yaw });
    await settle(page);
    const c = await check(page);
    expect(c.cant, `ready yaw ${yaw}: upright`).toBeLessThan(2 * DEG);
    expect(c.hands, `ready yaw ${yaw}: a hand through a hand`).toBeGreaterThan(-0.003);
    expect(c.L.short, `ready yaw ${yaw}: the left on the gun`).toBeLessThan(0.015);
  }

  // up from the ready in the gun's own 0.18 s (shared ARMS.revolver.aim)
  await set(page, { ...BASE });
  await settle(page);
  const t0 = Date.now();
  await set(page, { pose: "aim" });
  await page.waitForTimeout(Math.max(0, 50 - (Date.now() - t0)));
  expect((await check(page)).off, "still coming up 50 ms in").toBeGreaterThan(8 * DEG);
  await page.waitForTimeout(Math.max(0, 320 - (Date.now() - t0)));
  expect((await check(page)).off, "up by 320 ms").toBeLessThan(2 * DEG);

  // the draw starts at the holster: the gun's grip in it, then out and up
  const gunToHolster = () =>
    page.evaluate(() => {
      const P = (window as any).__revolver.person;
      const g = P.gun?.model.root;
      const h = P.holster?.root;
      if (!g || !h) return 9;
      const V = g.position.constructor;
      return g.getWorldPosition(new V()).distanceTo(h.getWorldPosition(new V()));
    });
  await set(page, { ...BASE, draw: 0.02 });
  await settle(page);
  expect(await gunToHolster(), "drawn from the holster").toBeLessThan(0.03);
  await set(page, { ...BASE, draw: 1 });
  await settle(page);
  expect(await gunToHolster(), "drawn out of it").toBeGreaterThan(0.25);

  // the reload's keys: both hands on their places, the cylinder out while the loader goes in, the loader in
  // the right hand, the gun back in it at the end
  const state = () =>
    page.evaluate(() => {
      const P = (window as any).__revolver.person;
      return {
        crane: P.gun?.model.parts.crane?.rotation.x ?? 0,
        loader: P.revLoaderState as string,
        free: P.revFree as boolean,
        R: P.model.gripLeft.R.short as number,
        L: P.model.gripLeft.L.short as number,
      };
    });
  for (const [t, want] of [
    [0.45, { out: true, loader: "none", free: false }],
    [0.62, { out: true, loader: "none", free: true }],
    [1.04, { out: true, loader: "hand", free: true }],
    [1.6, { out: true, loader: "hand", free: true }],
    [2.18, { out: false, loader: "fall", free: false }],
  ] as const) {
    await set(page, { ...BASE, pose: "reload", t: t / 2.2 });
    await settle(page);
    const s = await state();
    const at = `reload ${t} s`;
    expect(s.crane < -1, `${at}: the cylinder ${want.out ? "out" : "shut"}`).toBe(want.out);
    expect(s.loader, `${at}: the loader`).toBe(want.loader);
    expect(s.free, `${at}: the gun off the right hand's grip`).toBe(want.free);
    expect(s.R, `${at}: the right at its place`).toBeLessThan(0.02);
    expect(s.L, `${at}: the left at its place`).toBeLessThan(0.02);
  }
});
