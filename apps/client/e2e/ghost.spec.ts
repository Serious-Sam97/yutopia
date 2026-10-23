/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, loaded, test, token, useWorld, walkTo } from "./helpers";

// No ghosts (docs/plan/36-the-ghost.md): Bia reloads — one Bia, for her and for
// Ana, back where she was; Bia closes the tab — gone for Ana at once, in 3D and
// in iso (the iso engine keeps the avatars under the 3D view too).
const bias = (page: Page, uid: number) =>
  page.evaluate((uid) => {
    const out: { sid: string; status: string; x: number; y: number }[] = [];
    (window as any).__yutopia.room.state.players.forEach((p: any, sid: string) => {
      if (p.uid === uid) out.push({ sid, status: p.status, x: p.x, y: p.y });
    });
    return out;
  }, uid);

test("no ghosts: a reload comes back where it was, a closed tab goes at once", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const space = await useWorld("demo");
  // Ana watches in 3D
  await page.addInitScript(() => {
    const p = JSON.parse(localStorage.getItem("yutopia:prefs") ?? "{}");
    localStorage.setItem("yutopia:prefs", JSON.stringify({ ...p, view: "3p", last3d: "3p" }));
  });
  await enter(page, await token(ANA), space);
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  await loaded(page);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bia = await ctx.newPage();
  await enter(bia, await token(BIA), space);
  const uid = (await bia.evaluate(() => (window as any).__yutopia.myUid())) as number;
  // Bia somewhere other than the arrival point, near Ana (drawn in her 3D view)
  // (her own view of herself: Ana's may not have caught up; the room's word, settled)
  const from = (await bias(bia, uid))[0];
  await walkTo(bia, from.x + (from.x > 20 ? -4 : 4), from.y);
  await expect
    .poll(
      async () => {
        const p = (await bias(bia, uid))[0];
        return Math.hypot(p.x - from.x, p.y - from.y);
      },
      { timeout: 8000 },
    )
    .toBeGreaterThan(2.5);
  // (stood still: the walk's last steps in)
  let was = (await bias(bia, uid))[0];
  for (let i = 0; i < 20; i++) {
    await bia.waitForTimeout(400);
    const p = (await bias(bia, uid))[0];
    const still = Math.hypot(p.x - was.x, p.y - was.y) < 0.01;
    was = p;
    if (still) break;
  }

  // the reload: one Bia, online, where she was — for her and for Ana
  await bia.reload();
  await bia.waitForFunction(() => (window as any).__hud?.get().phase === "ready", null, { timeout: 60_000 });
  await loaded(bia);
  await expect.poll(async () => (await bias(bia, uid)).length, { timeout: 3000 }).toBe(1);
  await expect.poll(async () => (await bias(page, uid)).length, { timeout: 3000 }).toBe(1);
  const now = (await bias(page, uid))[0];
  expect(now.sid).not.toBe(was.sid);
  expect(now.status).toBe("online");
  expect(Math.hypot(now.x - was.x, now.y - was.y)).toBeLessThan(0.6);
  // (drawn in Ana's views: the new one, not the old)
  await expect
    .poll(() =>
      page.evaluate(
        ([a, b]) => {
          const w = (window as any).__yutopia;
          return [w.engine.hasAvatar(a), w.engine.hasAvatar(b), w.tp.people3.has(a), w.tp.people3.has(b)];
        },
        [was.sid, now.sid],
      ),
    )
    .toEqual([false, true, false, true]);

  // the tab closed (gone to another page): gone for Ana at once, from both views (well inside the 20 s a seat's
  // kept for a drop; the polls of a software-drawn 3D page take their time)
  // (the page leaving as a tab closed by hand does: its pagehide — Playwright's page.close
  // doesn't always run it, and the context closed outright never does: a crash)
  const t0 = Date.now();
  await bia.goto("about:blank");
  await expect.poll(async () => (await bias(page, uid)).length, { timeout: 5000, intervals: [50] }).toBe(0);
  const gone = Date.now() - t0;
  await expect
    .poll(() =>
      page.evaluate((s) => {
        const w = (window as any).__yutopia;
        return w.engine.hasAvatar(s) || w.tp.people3.has(s);
      }, now.sid),
    )
    .toBe(false);
  console.log(`[ghost] the closed tab gone for Ana in ${gone} ms`);
  expect(gone).toBeLessThan(5000);
});
