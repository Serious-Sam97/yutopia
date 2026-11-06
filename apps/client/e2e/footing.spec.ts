/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { BIA, enter, test, token } from "./helpers";

// What the feet are on, in the game (docs/plan/63-the-steps.md, phase 1): the controller's
// footingAt, through the 3D view's Jolt (what's stood on) and the things on my floor — every kind
// of floor tile here, a desk's top, a rug. Read only: nobody moves, the world isn't swapped (run
// with YUTOPIA_GPU=1: Jolt comes with the 3D view). The Grounds' side: shared footing.test.ts.

const TILES: Record<string, string> = {
  ".": "wood",
  ",": "carpet",
  _: "tile",
  "~": "hollow",
  ":": "carpet",
  x: "grate",
  a: "asphalt",
  c: "concrete",
};

test("the feet's footing: each floor's tile, a desk's top, a rug", async ({ page }) => {
  await enter(page, await token(BIA));
  // (Jolt in: the view says what's under me)
  await page.waitForFunction(
    () => {
      const w = (window as any).__yutopia;
      return !!w?.tp?.underfoot(w.grid, w.level, w.me.x, w.me.y, 0)?.on;
    },
    null,
    { timeout: 30_000 },
  );
  const seen = await page.evaluate((chars) => {
    const w = (window as any).__yutopia;
    const level = w.level;
    const map = w.rows(); // (the floor as rows, asked of the structure)
    const under = (x: number, y: number, z: number) => ({
      on: w.tp.underfoot(w.grid, level, x, y, z)?.on,
      footing: w.footingAt(x, y, z),
    });
    // (a thing with no level is the home floor's: test each against Jolt, which knows)
    const objs = [...w.objs.values()].filter((o: any) => o.props?.level === level || o.props?.level == null);
    const out: Record<string, any> = { level, tiles: {} };
    // each kind of floor tile here with nothing on it (Jolt says: the slab)
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const ch = map.tiles[y][x];
        if (!(ch in chars) || out.tiles[ch]) continue;
        const u = under(x + 0.5, y + 0.5, 0);
        if (u.on?.startsWith("slab:") && !objs.some((o: any) => o.x === x && o.y === y)) out.tiles[ch] = { x, y, ...u };
      }
    for (const o of objs) {
      if (o.kind === "desk" && !out.desk) {
        const [dw, dh] = (Math.round(o.yaw / (Math.PI / 2)) & 3 ?? 0) % 2 ? [1, 2] : [2, 1];
        const u = under(o.x + dw / 2, o.y + dh / 2, 0.64);
        if (u.on === `thing:${o.id}`) out.desk = { id: o.id, ...u };
      }
      if (o.kind === "rug" && !out.rug) out.rug = { id: o.id, ...under(o.x + 1.5, o.y + 1.5, 0) };
    }
    return out;
  }, TILES);
  console.log("[footing]", JSON.stringify(seen, null, 1));
  const kinds = Object.keys(seen.tiles);
  expect(kinds.length, "more than one kind of floor here").toBeGreaterThan(1);
  for (const [ch, t] of Object.entries(seen.tiles) as [string, any][]) {
    expect(t.on, `tile ${ch}`).toMatch(/^slab:/);
    expect(t.footing, `tile ${ch}`).toBe(TILES[ch]);
  }
  expect(seen.desk, "a desk stood on").toBeTruthy();
  expect(seen.desk.footing).toBe("wood");
  if (seen.rug) expect(seen.rug.footing).toBe("carpet");
});
