/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, useWorld, walkTo } from "./helpers";

// Walking in all eight directions, in the world: while the step is under way
// the person is drawn in the view that faces where they're going on screen
// (five drawn views, three mirrored), as the posed rig.

// world heading → its direction on screen (x right, y down): the iso camera
// turns world (1, 1) into straight down
const screenOf = (dx: number, dy: number): [number, number] => [Math.sign(dx - dy), Math.sign(dx + dy)];
// the view facing a screen direction, and whether it's the mirror
const VIEW: Record<string, [string, boolean]> = {
  "0,1": ["S", false],
  "-1,1": ["SW", false],
  "-1,0": ["W", false],
  "-1,-1": ["NW", false],
  "0,-1": ["N", false],
  "1,-1": ["NW", true],
  "1,0": ["W", true],
  "1,1": ["SW", true],
};
const shown = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    return w.engine.avatarShown(w.room.sessionId);
  });

test("walking every way shows the view facing it", async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const cx = Math.floor(sp.x) + 0.5;
  const cy = Math.floor(sp.y) - 2.5;
  await walkTo(page, cx, cy, 30_000);
  // the people's drawing has loaded: the rig is up; and the walk there is over
  // (people come in at the arrival point, just a few steps from here)
  await expect.poll(async () => (await shown(page))?.rigged).toBe(true);
  await expect.poll(async () => (await shown(page))?.walking, { timeout: 10_000 }).toBe(false);
  const headings: [number, number][] = [
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
  ];
  for (const [dx, dy] of headings) {
    const [sx, sy] = screenOf(dx, dy);
    const [view, mirror] = VIEW[`${sx},${sy}`];
    await page.evaluate(([x, y]) => (window as any).__yutopia.walkTo({ x, y }), [cx + dx * 2, cy + dy * 2]);
    // mid-step (turning goes through the facings in between, so give it a moment)
    await expect
      .poll(
        async () => {
          const s = await shown(page);
          return s?.walking ? `${s.view}${s.mirror ? "*" : ""}${s.rigged ? "" : " (not rigged)"}` : "standing";
        },
        { message: `walking world (${dx},${dy})`, timeout: 3000, intervals: [40] },
      )
      .toBe(`${view}${mirror ? "*" : ""}`);
    await walkTo(page, cx + dx * 2, cy + dy * 2, 10_000);
    await page.waitForTimeout(300);
    // stopped, still facing the way they went
    const s = await shown(page);
    expect(`${s.view}${s.mirror ? "*" : ""}`).toBe(`${view}${mirror ? "*" : ""}`);
    // and back to the middle for the next one
    await walkTo(page, cx, cy, 10_000);
    await page.waitForTimeout(400);
  }
});
