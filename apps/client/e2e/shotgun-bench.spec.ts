/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the bench's window hooks */
import { expect, type Page } from "@playwright/test";
import { test } from "./helpers";

// Plan 81 phase 6: the double-barrel's hold checked on its bench (/dev/arms?gun=shotgun — the game's own
// person, the life double-barrel): aimed upright and on the look at every pitch and every turn of her, with
// and without the torch under the fore-end; no hand through the other, the gun's wrist or the gun itself; each
// wrist at its place; the low ready walking and running, both hands on (2026-11-13: as the AK's), each wrist
// within its reach; up from it in the gun's own time; drawn off her back; the reload's moments; kept across her
// chest through a roll, a vault, a slide, struck; let go sat. 3D: the GPU (YUTOPIA_GPU=1).
const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const DEG = Math.PI / 180;

const set = (page: Page, s: Record<string, unknown>) => page.evaluate((s) => (window as any).__revolver.set(s), s);
const check = (page: Page) => page.evaluate(() => (window as any).__revolver.check());
const settle = (page: Page, ms = 700) => page.waitForTimeout(ms);
// each forearm's turn (rad — PersonModel.wristParts)
const twists = (page: Page) =>
  page.evaluate(() => {
    const m = (window as any).__revolver.person.model;
    const tw = (S: string) => Math.abs(m.wristParts(S, m.bone(`wrist${S}`).quaternion).twist);
    return { L: tw("L"), R: tw("R") };
  });
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
// (the double-barrel's reload: 2.3 s — plan 81 phase 4)
const LOAD_LEN = 2.3;

test("the double-barrel's hold on its bench: upright, on the look, no hand through anything, drawn, reloaded, kept", async ({
  page,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto("/dev/arms?gun=shotgun");
  await page.waitForFunction(() => (window as any).__revolver?.ready, null, { timeout: 120_000 });

  // aimed: every pitch, every turn of her, with and without the torch — the butt in the shoulder, both hands on
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
        expect(c.R.short, `${at}: the right on the stock's wrist`).toBeLessThan(0.015);
        expect(c.L.short, `${at}: the left under the fore-end`).toBeLessThan(0.015);
        // (skin gives a few mm)
        expect(c.hands, `${at}: a hand through a hand (${c.where})`).toBeGreaterThan(-0.003);
        expect(c.grip, `${at}: fingers through the stock's wrist`).toBeGreaterThan(-0.003);
        expect(c.arms, `${at}: an arm through the gun`).toBeGreaterThan(-0.005);
      }

  // carried at the low ready in both hands, at every turn, walking and running, with the torch: upright, the
  // right on the stock's wrist, the left under the fore-end (2026-11-13: the user's — held as the AK is)
  for (const [yaw, move, torch] of [
    [0, 0, false],
    [-1.6, 1, false],
    [2.6, 3, false],
    [0.7, 1, true],
  ] as const) {
    await set(page, { ...BASE, yaw, move, torch });
    await settle(page);
    const c = await check(page);
    const at = `carried yaw ${yaw} move ${move}${torch ? " torch" : ""}`;
    expect(c.cant, `${at}: upright`).toBeLessThan(2 * DEG);
    expect(c.arms, `${at}: an arm through the gun`).toBeGreaterThan(-0.005);
    expect(c.R.short, `${at}: the right on the stock's wrist`).toBeLessThan(0.015);
    expect(c.L, `${at}: the left on the gun`).not.toBeNull();
    expect(c.L.short, `${at}: the left under the fore-end`).toBeLessThan(0.01);
    expect(c.hands, `${at}: a hand through a hand (${c.where})`).toBeGreaterThan(-0.003);
    expect(c.grip, `${at}: fingers in the gun (${c.whereGrip})`).toBeGreaterThan(-0.003);
    expect(c.arms, `${at}: an arm through the gun (${c.whereArms})`).toBeGreaterThan(-0.003);
    // (each wrist within its reach, each forearm turned no more than ~50° — pinched thin past it)
    const tw = await twists(page);
    expect(c.R.over, `${at}: the right wrist past its reach`).toBeLessThan(3 * DEG);
    expect(c.L.over, `${at}: the left wrist past its reach`).toBeLessThan(3 * DEG);
    expect(tw.R, `${at}: the right forearm turned`).toBeLessThan(53 * DEG);
    expect(tw.L, `${at}: the left forearm turned`).toBeLessThan(53 * DEG);
  }

  // up from the ready in the gun's own 0.26 s (shared ARMS.shotgun.aim)
  await set(page, { ...BASE });
  await settle(page);
  const t0 = Date.now();
  await set(page, { pose: "aim" });
  await page.waitForTimeout(Math.max(0, 50 - (Date.now() - t0)));
  expect((await check(page)).off, "still coming up 50 ms in").toBeGreaterThan(8 * DEG);
  await page.waitForTimeout(Math.max(0, 420 - (Date.now() - t0)));
  expect((await check(page)).off, "up by 420 ms").toBeLessThan(2 * DEG);

  // drawn off her back: its start where it hangs slung, then out over her shoulder to the hold
  const gunToSlung = () =>
    page.evaluate(() => {
      const P = (window as any).__revolver.person;
      const g = P.gun?.model.root;
      const chest = P.model.bone("chest");
      if (!g || !chest) return 9;
      const V = g.position.constructor;
      // (shotgun-hold.ts SLUNG_AT: the slung gun's grip in the chest bone's space)
      return g.getWorldPosition(new V()).distanceTo(chest.localToWorld(new V(-0.12, -0.07, -0.095)));
    });
  await set(page, { ...BASE, draw: 0.02 });
  await settle(page);
  expect(await gunToSlung(), "drawn from where it's slung").toBeLessThan(0.04);
  await set(page, { ...BASE, draw: 1 });
  await settle(page);
  expect(await gunToSlung(), "drawn off her back").toBeGreaterThan(0.3);

  // the reload's moments: the barrels dropped, the gun off the right hand's grip (the left and the stock
  // under her arm hold it), a shell in the right hand at the carrier and going in, both hands at their places;
  // shut again at the end
  const state = () =>
    page.evaluate(() => {
      const P = (window as any).__revolver.person;
      return {
        open: -(P.gun?.model.parts.barrels?.rotation.z ?? 0),
        shell: !!P.sgShell?.visible,
        free: P.revFree as boolean,
        R: P.model.gripLeft.R.short as number,
        L: P.model.gripLeft.L.short as number,
        leftOn: (P.lgLeftW as number) > 0.5,
      };
    });
  for (const [t, want] of [
    [0.2, { open: false, shell: false }],
    [0.42, { open: true, shell: false }],
    [0.73, { open: true, shell: true }],
    [0.95, { open: true, shell: true }],
    [1.48, { open: true, shell: true }],
    [1.9, { open: true, shell: true }],
    [2.28, { open: false, shell: false }],
  ] as const) {
    // (both hands on it throughout — carried at the low ready, the left stays on as it goes back up)
    await set(page, { ...BASE, pose: "reload", t: t / LOAD_LEN });
    await settle(page);
    const s = await state();
    const at = `reload ${t} s`;
    expect(s.open > 0.4, `${at}: the barrels ${want.open ? "dropped" : "shut"}`).toBe(want.open);
    expect(s.shell, `${at}: a shell in the right hand`).toBe(want.shell);
    expect(s.free, `${at}: the gun off the right hand's grip`).toBe(true);
    expect(s.R, `${at}: the right at its place`).toBeLessThan(0.02);
    expect(s.leftOn, `${at}: the left on`).toBe(true);
    expect(s.L, `${at}: the left at its place`).toBeLessThan(0.02);
  }

  // kept through a roll, a vault, a slide, struck: across her chest, both hands on, no arm through it
  for (const [act, actT] of [
    ["roll", 0.4],
    ["vault", 0.4],
    ["slide", 0.4],
    ["hit", 0.1],
  ] as const) {
    await set(page, { ...BASE, act, actT });
    await settle(page);
    const c = await check(page);
    expect(c.R.short, `${act}: the right on the stock's wrist`).toBeLessThan(0.02);
    expect(c.L.short, `${act}: the left on the fore-end`).toBeLessThan(0.02);
    expect(c.arms, `${act}: an arm through the gun`).toBeGreaterThan(-0.005);
  }
  // sat: let go of — in her right hand, on her lap
  await set(page, { ...BASE, act: "sit" });
  await settle(page, 2500);
  expect(await check(page), "sat: still in her hand").not.toBeNull();
  const held = await page.evaluate(() => (window as any).__revolver.person.revW as number);
  expect(held, "sat: the hold let go").toBeLessThan(0.1);
});
