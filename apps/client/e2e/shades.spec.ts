/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The shadowed on screen (docs/plan/30-the-dark.md, phase 4): at night on the
// pond, three called up out of the dark come at Ana — drawn in 3D as office
// people wrapped in smoke, the windup's arms up, a strike's red at the edges;
// under her focused torch one burns (embers, the arm over its face) and is
// exposed (its office clothes); in iso they're people drawn dark. 3D: the GPU
// (YUTOPIA_GPU=1). Review shots: YUTOPIA_SHOTS=<dir>.

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};
// the shadowed as the server has them for me, and as the 3D view draws them
const shades = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    const out: { id: string; s: number; sh: number; x: number; y: number; drawn: boolean }[] = [];
    w.room.state.shadows?.forEach((s: any) => {
      out.push({ id: s.id, s: s.s, sh: s.sh, x: s.x, y: s.y, drawn: !!w.tp?.people3.get(s.id)?.root.visible });
    });
    return out;
  });

test("the shadowed: out of the dark, at you, burnt under a focused torch", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", last3d: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-250, -60));
  await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    w.room.send("mod:hour", { h: 23 });
    w.room.send("mod:storm", { storm: 0, now: true });
    w.room.send("mod:refill", {});
    w.room.send("mod:dark", { mode: "normal" });
  });
  await page.waitForTimeout(3000);
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { spawn: 3 }));
  await expect.poll(async () => (await shades(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  await page.waitForTimeout(600);
  await shot(page, "shades-emerge");
  // drawn in 3D (their bodies, past the emerge's first moments)
  await expect
    .poll(async () => (await shades(page)).filter((s) => s.drawn).length, { timeout: 10_000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(2500);
  await shot(page, "shades-stalk");
  // a windup: the arms up
  await expect.poll(async () => (await shades(page)).some((s) => s.s === 3), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(250);
  await shot(page, "shades-windup");
  // struck (standing there): health down, red at the edges
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).hp as number,
        ),
      { timeout: 20_000 },
    )
    .toBeLessThan(100);
  await shot(page, "shades-hit");
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:refill", {}));

  // the torch, focused on the nearest: it burns, then it's exposed
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    if (!w.room.state.players.get(w.room.sessionId).torch) w.toggleTorch();
  });
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: "right" });
  const aim = async () =>
    page.evaluate(() => {
      const w = (window as any).__yutopia;
      const me = w.walker.where();
      let best: any = null;
      w.room.state.shadows?.forEach((s: any) => {
        if (!best || Math.hypot(s.x - me.x, s.y - me.y) < Math.hypot(best.x - me.x, best.y - me.y)) best = s;
      });
      if (best) w.tp.yaw = Math.atan2(best.y - me.y, best.x - me.x);
      const p = w.room.state.players.get(w.room.sessionId);
      return best
        ? {
            s: best.s as number,
            sh: best.sh as number,
            focused: p.focused as boolean,
            level: w.level as number,
            hp: p.hp as number,
          }
        : null;
    });
  let burnt = false;
  for (let i = 0; i < 80 && !burnt; i++) {
    // (kept on her feet: the others strike while she burns this one)
    if (i % 10 === 0) await page.evaluate(() => (window as any).__yutopia.room.send("mod:refill", {}));
    const s = await aim();
    if (s?.s === 6 && !burnt) await shot(page, "shades-burning");
    burnt = s?.s === 7;
    if (i % 10 === 9) console.log("burn", JSON.stringify(s));
    await page.waitForTimeout(100);
  }
  expect(burnt, "one burnt to exposed").toBe(true);
  await shot(page, "shades-exposed");
  await page.mouse.up({ button: "right" });

  // iso: people drawn dark
  await page.evaluate(() => {
    for (const type of ["keydown", "keyup"]) window.dispatchEvent(new KeyboardEvent(type, { key: "t", code: "KeyT" }));
  });
  await page.waitForFunction(() => !(window as any).__yutopia.tp, null, { timeout: 20_000 });
  await page.waitForTimeout(1200);
  const iso = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    let n = 0;
    w.room.state.shadows?.forEach((s: any) => {
      if (w.engine.hasAvatar(s.id)) n++;
    });
    return n;
  });
  expect(iso, "drawn in iso").toBeGreaterThan(0);
  await shot(page, "shades-iso");
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    w.room.send("mod:hour", { h: null });
    w.toggleTorch();
  });
});
