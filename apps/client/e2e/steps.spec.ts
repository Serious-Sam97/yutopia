/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { BIA, enter, test, token, walkTo } from "./helpers";

// My steps in the game (docs/plan/63-the-steps.md, phase 2): Bia walks a few metres across her
// floor; each step heard is logged (the steps' myStep: world/ctl/steps.ts) — from the body's feet as they're put
// down, at the walk's pace, the feet in turn, on what's under them — and none once she's still.
// The world isn't swapped; run with YUTOPIA_GPU=1 (the body's feet are the 3D view's).

test("my steps: the body's feet as they land, at the walk's pace, in turn; none standing", async ({ page }) => {
  test.setTimeout(120_000);
  await enter(page, await token(BIA));
  await page.waitForFunction(() => !!(window as any).__yutopia?.tp?.onStep, null, { timeout: 30_000 });
  // every step heard: when, which foot (none: by the way gone), on what
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const log: { t: number; side: string; f: string; ok: boolean }[] = [];
    (window as any).__steps = log;
    const was = w.steps.myStep.bind(w.steps); // (the steps: world/ctl/steps.ts — plan 72 phase 4)
    w.steps.myStep = (side?: string) => {
      log.push({ t: performance.now(), side: side ?? "", f: w.myFooting(w.height.z), ok: w.feet.ok });
      was(side);
    };
  });
  // somewhere 5–8 tiles off that she can walk to
  const to = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const me = w.meAt();
    for (let r = 8; r >= 5; r--)
      for (let a = 0; a < 16; a++) {
        const x = Math.floor(me.x + r * Math.cos((a * Math.PI) / 8));
        const y = Math.floor(me.y + r * Math.sin((a * Math.PI) / 8));
        if (w.grid.fits?.(x + 0.5, y + 0.5) && !w.grid.onLand(x + 0.5, y + 0.5)) return { x, y };
      }
    return null;
  });
  if (!to) throw new Error("no spot to walk to");
  const t0 = await page.evaluate(() => performance.now());
  await walkTo(page, to.x, to.y);
  // (arrived: then still — not moved for half a second — and a second more of standing)
  const t1 = await page.evaluate(
    () =>
      new Promise<number>((done) => {
        const w = (window as any).__yutopia;
        let at = { x: w.me.x, y: w.me.y };
        let since = performance.now();
        const tick = () => {
          const now = performance.now();
          if (Math.hypot(w.me.x - at.x, w.me.y - at.y) > 1e-3) {
            at = { x: w.me.x, y: w.me.y };
            since = now;
          }
          if (now - since > 500) done(since);
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
  await page.waitForTimeout(1200);
  const log: { t: number; side: string; f: string; ok: boolean }[] = await page.evaluate(() => (window as any).__steps);
  // (a step's played the frame its foot's put down: what's left is the audio's own way out)
  const latency = await page.evaluate(() => {
    const c = (window as any).__audio?.mixer?.ctx;
    return c ? { base: c.baseLatency, output: c.outputLatency, state: c.state } : null;
  });
  console.log("[latency]", JSON.stringify(latency));
  const walking = log.filter((s) => s.t >= t0 && s.t <= t1 + 300 && s.ok);
  // (the stop's last foot brought alongside is a step: from 0.4 s after the last move, none)
  const after = log.filter((s) => s.t > t1 + 400);
  const secs = (t1 - t0) / 1000;
  console.log(
    "[steps]",
    JSON.stringify({
      secs: secs.toFixed(2),
      heard: walking.length,
      after: after.map((s) => ({ ...s, t: Math.round(s.t - t1) })),
      steps: walking.map((s) => `${s.side || "·"}${Math.round(s.t - t0)}`).join(" "),
    }),
  );
  expect(walking.length, "steps heard walking").toBeGreaterThanOrEqual(Math.floor(secs * 1.5));
  expect(walking.length / secs, "no faster than a brisk walk").toBeLessThan(4);
  const body = walking.filter((s) => s.side);
  expect(body.length / walking.length, "the body's own feet, not the way gone").toBeGreaterThan(0.7);
  let turns = 0;
  for (let i = 1; i < body.length; i++) if (body[i].side !== body[i - 1].side) turns++;
  expect(turns, "the feet in turn").toBeGreaterThanOrEqual(body.length - 3);
  for (const s of walking) expect(["wood", "carpet", "tile", "hollow", "grate", "concrete"]).toContain(s.f);
  expect(after.filter((s) => s.ok).length, "none once still").toBe(0);
});
