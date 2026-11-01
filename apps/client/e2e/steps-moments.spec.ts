/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { BIA, enter, test, token } from "./helpers";

// The other moments (docs/plan/63-the-steps.md, phase 4), in the game: Bia jumps where she stands —
// her soles off the floor and both feet back onto it, the steps' recordings on what's under her,
// and no step of her walk while she's in the air. The world isn't swapped; YUTOPIA_GPU=1.

test("a jump: the push off and the landing on the floor's recordings, no walking steps in the air", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await enter(page, await token(BIA));
  // (the steps' chunk in: her first step loads it)
  await page.evaluate(async () => {
    const w = (window as any).__yutopia;
    w.myStep("R");
  });
  await page.waitForFunction(() => !!(window as any).__yutopia?.stepper, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const log: any[] = [];
    (window as any).__played = log;
    const P = w.stepper;
    for (const k of ["step", "land", "thud"]) {
      const was = P[k].bind(P);
      P[k] = (...a: any[]) => {
        log.push({ k, f: a[0], t: performance.now(), up: w.height.up });
        return was(...a);
      };
    }
  });
  await page
    .locator("canvas")
    .first()
    .click({ position: { x: 640, y: 400 } });
  await page.keyboard.press("Space");
  await page.waitForTimeout(1800);
  const log: any[] = await page.evaluate(() => (window as any).__played);
  console.log("[jump]", JSON.stringify(log.map((l) => `${l.k}:${l.f}${l.up ? "↑" : ""}`)));
  const kinds = log.map((l) => l.k);
  expect(kinds, "pushed off on the floor").toContain("step");
  expect(kinds, "landed on it").toContain("land");
  expect(log.filter((l) => l.k === "land").every((l) => l.f === "wood" || l.f === "carpet")).toBe(true);
  // (the landing's own two soles are `step`s inside `land`: none else while in the air)
  const air = log.filter((l) => l.k === "step" && l.up);
  expect(air.length, "no walking steps in the air").toBeLessThanOrEqual(2);
});
