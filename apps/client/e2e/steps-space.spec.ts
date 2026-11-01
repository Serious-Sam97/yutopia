/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { BIA, enter, test, token } from "./helpers";

// The space (docs/plan/63-the-steps.md, phase 5), in the game: the kind of room Bia's in picks the
// steps' reverb (built, crossfaded in), and someone else's steps lose their top with distance and
// more through a doorway. Read only; YUTOPIA_GPU=1.

test("the steps' space: my room's reverb, the far off and the next room muffled", async ({ page }) => {
  await enter(page, await token(BIA));
  await page.evaluate(() => (window as any).__yutopia.myStep("R"));
  await page.waitForFunction(() => !!(window as any).__yutopia?.stepper?.room, null, { timeout: 20_000 });
  const seen = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const me = { x: w.me.x, y: w.me.y };
    const at = (dx: number, dy: number) => ({ id: "x", x: me.x + dx, y: me.y + dy, level: w.level });
    // a spot in another area of this floor, if there's one
    const areas = (w.map.areas ?? []) as any[];
    const mine = areas.filter((a) => me.x >= a.x && me.x < a.x + a.w && me.y >= a.y && me.y < a.y + a.h);
    const other = mine.length
      ? areas.find((a) => !mine.some((m) => m.key === a.key) && a.kind !== "stage" && a.w * a.h > 4)
      : undefined;
    return {
      space: w.stepper.room.space,
      picked: w.spaceHere(w.myFooting(w.height.z)),
      areas: areas.map((a) => `${a.key}:${a.kind}:${a.w}x${a.h}`),
      mine: mine.map((a) => a.key),
      near: w.ears.lp(at(1, 0)),
      far: w.ears.lp(at(8, 0)),
      other: other ? w.ears.lp({ id: "x", x: other.x + other.w / 2, y: other.y + other.h / 2, level: w.level }) : null,
    };
  });
  console.log("[space]", JSON.stringify(seen));
  expect(seen.space).toBe(seen.picked);
  expect(["small", "room", "hall", "booth", "server", "stairs", "lift"]).toContain(seen.space);
  expect(seen.near).toBeGreaterThan(10000);
  expect(seen.far).toBeLessThan(seen.near / 2);
  if (seen.other !== null) expect(seen.other).toBeLessThanOrEqual(900);
});
