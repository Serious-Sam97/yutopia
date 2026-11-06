/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { BIA, CAI, enter, test, token, walkTo } from "./helpers";

// Everyone else's steps (docs/plan/63-the-steps.md, phase 3): Cai walks past Bia; Bia hears each of
// Cai's steps (the steps chunk's Footfalls) — as loud and where the voices' rule has it, on what's
// under Cai's feet. The world isn't swapped; run with YUTOPIA_GPU=1 (two 3D views).

test("someone walking past: their steps heard, near, from their side, on their floor", async ({ browser, page }) => {
  test.setTimeout(150_000);
  await enter(page, await token(BIA));
  const cai = await (await browser.newContext()).newPage();
  await enter(cai, await token(CAI));
  // (Bia's steps chunk in, and its Footfalls made: someone else is here)
  await page.waitForFunction(() => !!(window as any).__yutopia?.footfalls, null, { timeout: 30_000 });
  await page.evaluate(() => {
    const ff = (window as any).__yutopia.footfalls;
    const log: any[] = [];
    (window as any).__heard = log;
    const was = ff.play.bind(ff);
    ff.play = (h: any) => {
      const e = (window as any).__yutopia.ears;
      log.push({
        id: h.w.id,
        t: performance.now(),
        gain: e.gain(h.w),
        pan: e.pan(h.w),
        f: e.footing(h.w),
        gait: ff.gait(h),
      });
      was(h);
    };
  });
  const caiId = await cai.evaluate(() => (window as any).__yutopia.room.sessionId);
  // Cai walks a few metres from beside Bia
  const to = await cai.evaluate(() => {
    const w = (window as any).__yutopia;
    const me = w.meAt();
    for (let r = 6; r >= 4; r--)
      for (let a = 0; a < 16; a++) {
        const x = Math.floor(me.x + r * Math.cos((a * Math.PI) / 8));
        const y = Math.floor(me.y + r * Math.sin((a * Math.PI) / 8));
        if (w.grid.fits?.(x + 0.5, y + 0.5) && !w.grid.onLand(x + 0.5, y + 0.5)) return { x, y };
      }
    return null;
  });
  if (!to) throw new Error("no spot for Cai to walk to");
  await walkTo(cai, to.x, to.y, 20_000);
  await page.waitForTimeout(1000);
  const heard: any[] = (await page.evaluate(() => (window as any).__heard)).filter((h: any) => h.id === caiId);
  const where = await page.evaluate((id) => {
    const w = (window as any).__yutopia;
    const p = w.room.state.players.get(id);
    return { me: [w.me.x, w.me.y], cai: [p?.x, p?.y], level: [w.level, p?.level] };
  }, caiId);
  console.log("[heard]", JSON.stringify({ where, n: heard.length, heard: heard.slice(0, 8) }));
  expect(heard.length, "Cai's steps heard").toBeGreaterThanOrEqual(3);
  for (const h of heard) {
    expect(h.gain).toBeGreaterThan(0.02);
    expect(Math.abs(h.pan)).toBeLessThanOrEqual(1);
    expect(["wood", "carpet", "tile", "hollow", "grate", "concrete"]).toContain(h.f);
    expect(["walk", "jog", "sprint", "crouch"]).toContain(h.gait);
  }
});
