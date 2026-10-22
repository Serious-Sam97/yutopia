/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, walkTo } from "./helpers";

// The Grounds (docs/plan/27-the-grounds.md, phase 1): out of the lot and onto
// the land round the building, in both views — the feet on the ground as it
// rises and falls, the land streamed in round you with no long frame. It
// needs only the building (every world has it), so no fixture is put back.
// Frame times are measured on the machine's GPU (YUTOPIA_GPU=1); review shots
// with YUTOPIA_SHOTS=<dir>.
const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
if (GPU || dir) test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

// the ground floor's corner is at (-60, -10) in the studio's coords
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const LOT = { ...G(-30, 20), level: 0 };

async function open(page: Page, view: "3p" | "iso") {
  await page.addInitScript((v) => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: v, cam3p: "chase" }));
    // the longest frame since asked
    const W = window as any;
    W.__worst = 0;
    let last = performance.now();
    const tick = (t: number) => {
      W.__worst = Math.max(W.__worst, t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, view);
  await enter(page, await token(ANA));
  if (view === "3p") await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  await page.evaluate(() => {
    (window as any).__yutopia.updateNight = () => {};
  });
}

const goTo = async (page: Page, at: { x: number; y: number; level: number }) => {
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), at);
  await page.waitForFunction((l) => (window as any).__yutopia.level === l, at.level, { timeout: 20_000 });
  await page.waitForTimeout(2500);
};
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};
const me = (page: Page) =>
  page.evaluate(() => ({ ...(window as any).__yutopia.meTile(), z: (window as any).__yutopia.height.z }));
const worst = (page: Page, reset = false) =>
  page.evaluate((r) => {
    const W = window as any;
    const v = W.__worst;
    if (r) W.__worst = 0;
    return v;
  }, reset);

for (const view of ["3p", "iso"] as const)
  test(`the Grounds in ${view}: out of the lot, across the lawn, into the woods and back`, async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, view);
    await goTo(page, LOT);
    if (view === "3p")
      await page.evaluate(() => {
        const tp = (window as any).__yutopia.tp;
        tp.setHour(13);
      });
    await page.waitForTimeout(3000);
    await shot(page, `${view}-01-lot`);
    await worst(page, true);
    // west, off the lot's own tiles, onto the land
    for (const [i, at] of [G(-80, 22), G(-118, 12), G(-158, -4)].entries()) {
      await walkTo(page, at.x, at.y, 60_000);
      const w = await worst(page, true);
      console.log(`[grounds] ${view}: worst frame to ${at.x},${at.y}: ${Math.round(w)} ms`);
      await shot(page, `${view}-0${i + 2}-walk`);
      if (GPU) expect(w, `worst frame on the way to ${at.x},${at.y}`).toBeLessThan(50);
    }
    const out = await me(page);
    expect(Math.hypot(out.x - G(-158, -4).x, out.y - G(-158, -4).y)).toBeLessThan(1.5);
    expect((await page.evaluate(() => (window as any).__yutopia.level)) as number).toBe(0);
    // and back to the lot
    await walkTo(page, LOT.x, LOT.y, 90_000);
    if (GPU) expect(await worst(page, true)).toBeLessThan(50);
    // the edge: by the west fence, walking at it, it holds
    await goTo(page, { ...G(-394, 2), level: 0 });
    await page.evaluate((p) => (window as any).__yutopia.walkTo(p), G(-412, 2));
    await page.waitForTimeout(4000);
    await shot(page, `${view}-05-fence`);
    expect((await me(page)).x, "kept in by the fence").toBeGreaterThan(G(-400, 0).x);
    // up the driveway, a storey up the hill: still the ground floor, feet on the land
    await goTo(page, { ...G(-41, -330), level: 0 });
    const top = await me(page);
    expect(top.z, "up the hill").toBeGreaterThan(2.5);
    expect((await page.evaluate(() => (window as any).__yutopia.level)) as number).toBe(0);
    await shot(page, `${view}-06-driveway`);
  });

// Phase 2: the campus is real — into the east block's ground floor, round the
// water tower's fence, up the driveway to the gate's barrier.
for (const view of ["3p", "iso"] as const)
  test(`the campus in ${view}: the east block, the tower, the barrier`, async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, view);
    await goTo(page, LOT);
    // round the headquarters, across the courtyard, in at the east block's doors
    await walkTo(page, G(82, 18).x, G(82, 18).y, 90_000);
    const inside = await page.evaluate(() => {
      const c = (window as any).__yutopia;
      const m = c.meTile();
      return c.map.areas.find((a: any) => m.x >= a.x && m.x < a.x + a.w && m.y >= a.y && m.y < a.y + a.h)?.key;
    });
    expect(inside).toBe("east-block");
    await shot(page, `${view}-10-east-block`);
    // the tower: from the lawn south of it to the north, round its fence
    await goTo(page, { ...G(-34, -80), level: 0 });
    await walkTo(page, G(-34, -112).x, G(-34, -112).y, 60_000);
    await shot(page, `${view}-11-tower`);
    // up the driveway to the barrier
    await goTo(page, { ...G(-41, -320), level: 0 });
    await walkTo(page, G(-40, -356).x, G(-40, -356).y, 60_000);
    expect((await me(page)).z, "up on the hill").toBeGreaterThan(2);
    await shot(page, `${view}-12-barrier`);
  });

// Phase 3: the woods — the trail out to the frozen pond (onto the ice), deep
// snow slower than the trail, footprints left in the snow behind you.
for (const view of ["3p", "iso"] as const)
  test(`the woods in ${view}: to the pond, deep snow, footprints`, async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, view);
    await goTo(page, { ...G(-150, -6), level: 0 });
    // off the trail into the snow and back, then out onto the pond's ice
    await walkTo(page, G(-150, 6).x, G(-150, 6).y, 30_000);
    await walkTo(page, G(-205, -58).x, G(-205, -58).y, 90_000);
    const r = await page.evaluate(
      ([deep, trail, ice]) => {
        const c = (window as any).__yutopia;
        return {
          deep: c.grid.speedAt(deep.x, deep.y),
          trail: c.grid.speedAt(trail.x, trail.y),
          ice: c.grid.speedAt(ice.x, ice.y),
          prints: c.life.prints.list.length,
        };
      },
      [G(-150, 30), G(-160, -6), G(-225, -60)],
    );
    expect(r.deep, "deep snow holds you back").toBeLessThan(r.trail);
    expect(r.ice).toBe(1);
    expect(r.prints, "footprints in the snow").toBeGreaterThan(8);
    await shot(page, `${view}-20-pond`);
  });

// Phase 4: the town — out of the gate down the county road, over the river,
// along Main Street past the parked cars (they block), into the bar by its door.
for (const view of ["3p", "iso"] as const)
  test(`the town in ${view}: the road from the gate, Main Street, the bar`, async ({ page }) => {
    test.setTimeout(420_000);
    await open(page, view);
    await goTo(page, { ...G(-40, -380), level: 0 });
    await worst(page, true);
    for (const at of [G(40, -409), G(140, -401), G(230, -403), G(330, -403), G(456, -403)]) {
      await walkTo(page, at.x, at.y, 120_000);
      const w = await worst(page, true);
      console.log(`[town] ${view}: worst frame to ${at.x},${at.y}: ${Math.round(w)} ms`);
      if (GPU) expect(w, `worst frame on the way to ${at.x},${at.y}`).toBeLessThan(50);
    }
    await shot(page, `${view}-30-main-street`);
    // a parked car is solid
    const car = await page.evaluate(
      (rows) => {
        const c = (window as any).__yutopia;
        const m = c.meTile();
        for (let x = m.x - 60; x < m.x + 60; x++) for (const y of rows) if (!c.grid.ok(x, y)) return { x, y };
        return null;
      },
      [G(0, -400).y, G(0, -411).y],
    );
    expect(car, "a parked car along the kerb").not.toBeNull();
    // into the bar (its door on the north face, at x 455..457)
    await walkTo(page, G(456, -392).x, G(456, -392).y, 60_000);
    await expect(page.getByText(/Bar ·/)).toBeVisible({ timeout: 10_000 });
    await shot(page, `${view}-31-bar`);
  });

// Phase 7: on High, standing at the lot, on the town square and in the woods
// (by day and at night, a flashlight on), the frames keep up (≥ 60 fps on the
// machine's GPU: YUTOPIA_GPU=1; the count is printed either way).
test("the Grounds on High: the lot, the square, the woods, day and night", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, "3p");
  const fps = () =>
    page.evaluate(
      () =>
        new Promise<number>((done) => {
          let n = 0;
          const t0 = performance.now();
          const tick = () => {
            n++;
            if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
            else done((n * 1000) / (performance.now() - t0));
          };
          requestAnimationFrame(tick);
        }),
    );
  for (const [name, at] of [
    ["lot", LOT],
    ["square", { ...G(418, -396), level: 0 }],
    ["woods", { ...G(-150, -6), level: 0 }],
  ] as const) {
    await goTo(page, at);
    for (const hour of [13, 23]) {
      await page.evaluate((h) => {
        const c = (window as any).__yutopia;
        c.tp.setHour(h);
        if (h > 20 && !c.room.state.players.get(c.room.sessionId)?.torch) c.toggleTorch();
      }, hour);
      await page.waitForTimeout(2500);
      const f = await fps();
      console.log(`[perf] ${name} at ${hour}h: ${f.toFixed(1)} fps`);
      await shot(page, `perf-${name}-${hour}`);
      if (GPU) expect(f, `${name} at ${hour}h`).toBeGreaterThan(55);
    }
    await page.evaluate(() => {
      const c = (window as any).__yutopia;
      if (c.room.state.players.get(c.room.sessionId)?.torch) c.toggleTorch();
    });
  }
});
