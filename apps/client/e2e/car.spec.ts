/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// The lot's cars, driven (docs/plan/28-the-car.md, phase 7): Ana gets into a
// lot car (3D, the car's camera) and drives it out of its bay with Bia in the
// seat beside her (iso: she sees it go by, her people in it not drawn
// standing); stopped, both get out and it stays where it was left, for both.
// Always on the machine's GPU: in software GL the 3D world draws at ~2 fps, the
// car's sim (a quarter second caught up a frame at most) crawls and a second
// browser's 3D view takes a minute to build. Its frames held to 100 ms only with
// YUTOPIA_GPU=1. It needs only the building, so no fixture is put back;
// `mod:cars` puts the lot back first.
const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

async function open(page: Page, who: typeof ANA, view: "3p" | "iso") {
  await page.addInitScript((v) => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: v, cam3p: "chase" }));
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
  await enter(page, await token(who));
  await page.waitForFunction(() => !!(window as any).__yutopia.cars, null, { timeout: 60_000 });
}
const me = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    const p = c.room.state.players.get(c.room.sessionId);
    return { x: p.x as number, y: p.y as number, busy: p.busy as string, level: p.level as number };
  });
/** A lot car still in its bay: its id, its middle (the ground floor's coords) and heading. */
const aCar = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    const cars: any[] = [];
    c.room.state.objects.forEach((o: any) => {
      const p = JSON.parse(o.props);
      if (o.kind !== "car" || p.driven || p.model === "offroad") return;
      const w = o.rot % 2 ? 2 : 5;
      const h = o.rot % 2 ? 5 : 2;
      const a = Math.PI + (o.rot % 4) * (Math.PI / 2);
      cars.push({ id: o.id, x: o.x + w / 2 + (p.dx ?? 0), y: o.y + h / 2 + (p.dz ?? 0), a });
    });
    return cars[0];
  });
const worst = (page: Page) =>
  page.evaluate(() => {
    const W = window as any;
    const v = W.__worst;
    W.__worst = 0;
    return v as number;
  });
async function getIn(page: Page, at: { x: number; y: number }, busy: RegExp) {
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at);
  await page.waitForFunction(() => /^car/.test((window as any).__hud.get().prompt?.kind ?? ""), null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as any).__yutopia.interact());
  await expect.poll(async () => (await me(page)).busy, { timeout: 10_000 }).toMatch(busy);
}

test("a lot car: driven out with a passenger, left where it stopped", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const a = page;
  const b = await (await browser.newContext()).newPage();
  await open(a, ANA, "3p");
  await open(b, BIA, "iso");
  // the lot as it should be (an admin's)
  await a.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
  await a.waitForTimeout(800);
  const car = await aCar(a);
  expect(car, "a car in its bay").toBeTruthy();
  // in the aisle by its nose
  const aisle = { x: car.x + Math.cos(car.a) * 3.4, y: car.y + Math.sin(car.a) * 3.4 };
  await getIn(a, aisle, /^drive:car:/);
  // the 3D view, the car's camera
  await a.waitForFunction(() => !!(window as any).__yutopia.tp?.gameCam?.snap, null, { timeout: 20_000 });
  await getIn(b, aisle, /^ride:car:/);
  const vid = `car:${car.id}`;
  const seats = await a.evaluate((id) => (window as any).__yutopia.room.state.vehicles.get(id)?.seats, vid);
  expect(String(seats).split("|").filter(Boolean)).toHaveLength(2);
  // (in the car Bia's view turns 3D too: let it finish loading — on one machine its building
  // would stall Ana's frames)
  await b.waitForFunction(() => !!(window as any).__yutopia.tp?.gameCam, null, { timeout: 30_000 });
  await b.waitForTimeout(4000);
  // out of the bay: forward, a little lock
  await worst(a);
  await a.keyboard.down("KeyW");
  await a.waitForTimeout(1600);
  await a.keyboard.up("KeyW");
  await a.keyboard.down("KeyS");
  await a.waitForTimeout(1800);
  await a.keyboard.up("KeyS");
  await a.waitForTimeout(1200);
  const moved = await a.evaluate(
    ([id, x0, y0]) => {
      const c = (window as any).__yutopia;
      const v = c.room.state.vehicles.get(id);
      return Math.hypot(v.x - c.map.ox - (x0 as number), v.z - c.map.oy - (y0 as number));
    },
    [vid, car.x, car.y],
  );
  expect(moved, "it drove out of its bay").toBeGreaterThan(2);
  // (read before the screenshots: taking one stalls the page)
  const hitch = await worst(a);
  if (dir) await a.screenshot({ path: `${dir}/car-driven-3p.png` });
  if (dir) await b.screenshot({ path: `${dir}/car-driven-iso.png` });
  if (GPU) expect(hitch, "no frame over 100 ms while driving").toBeLessThan(100);
  // stopped (the handbrake), both out; it parks where it stopped
  await a.keyboard.down("Space");
  await expect
    .poll(
      () =>
        a.evaluate((id) => {
          const v = (window as any).__yutopia.room.state.vehicles.get(id);
          return Math.hypot(v.vx, v.vz);
        }, vid),
      { timeout: 10_000 },
    )
    .toBeLessThan(0.5);
  await a.keyboard.up("Space");
  await a.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "car:leave", null, { timeout: 10_000 });
  await a.evaluate(() => (window as any).__yutopia.interact());
  await b.evaluate(() => (window as any).__yutopia.interact());
  await expect.poll(async () => (await me(a)).busy, { timeout: 10_000 }).toBe("");
  await expect.poll(async () => (await me(b)).busy, { timeout: 10_000 }).toBe("");
  await expect
    .poll(() => b.evaluate((id) => !(window as any).__yutopia.room.state.vehicles.get(id), vid), { timeout: 15_000 })
    .toBe(true);
  const parked = await b.evaluate((id) => {
    const o = (window as any).__yutopia.room.state.objects.get(id);
    return { ...JSON.parse(o.props), rot: o.rot };
  }, car.id);
  // (at its own heading where it stopped — or, stopped roughly in a free bay, put square in it)
  if (typeof parked.a !== "number") expect(parked.dx !== undefined, "squared into a bay").toBe(true);
  expect(parked.driven).toBeFalsy();
  // solid again for both, to the skin of its body: not walked into, room right beside it
  for (const pg of [a, b])
    await expect
      .poll(
        () =>
          pg.evaluate((id) => {
            const c = (window as any).__yutopia;
            const o = c.room.state.objects.get(id);
            const p = JSON.parse(o.props);
            const w = o.rot % 2 ? 2 : 5;
            const h = o.rot % 2 ? 5 : 2;
            const x = o.x + w / 2 + (p.dx ?? 0);
            const y = o.y + h / 2 + (p.dz ?? 0);
            // (the sedan: 4.9 long, its middle 0.13 behind its CoG, 1.86 wide; squared in a bay, its turn's heading)
            const A = typeof p.a === "number" ? p.a : Math.PI + (o.rot % 4) * (Math.PI / 2);
            const mx = x - Math.cos(A) * 0.13;
            const my = y - Math.sin(A) * 0.13;
            const side = (d: number) => c.grid.fits(mx - Math.sin(A) * d, my + Math.cos(A) * d);
            return [c.grid.fits(mx, my), side(0.93 + 0.12), side(-0.93 - 0.12), side(0.93 + 0.3)];
          }, car.id),
        { timeout: 10_000 },
      )
      .toEqual([false, false, false, true]);
  // the lot back as it was
  await a.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
});

test("a parked car knocked: it slides, stops, and stays there for everyone", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const a = page;
  const b = await (await browser.newContext()).newPage();
  await open(a, ANA, "3p");
  await open(b, BIA, "iso");
  await a.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
  await a.waitForTimeout(800);
  // a sedan with another car straight across the aisle behind it (it backs into it)
  const pair = await a.evaluate(() => {
    const c = (window as any).__yutopia;
    const cars: any[] = [];
    c.room.state.objects.forEach((o: any) => {
      const p = JSON.parse(o.props);
      if (o.kind !== "car" || p.driven) return;
      const w = o.rot % 2 ? 2 : 5;
      const h = o.rot % 2 ? 5 : 2;
      const a = Math.PI + (o.rot % 4) * (Math.PI / 2);
      cars.push({ id: o.id, x: o.x + w / 2 + (p.dx ?? 0), y: o.y + h / 2 + (p.dz ?? 0), a, model: p.model });
    });
    for (const s of cars) {
      if (s.model === "offroad") continue;
      for (const t of cars) {
        if (t === s) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const along = dx * Math.cos(s.a) + dy * Math.sin(s.a);
        const across = -dx * Math.sin(s.a) + dy * Math.cos(s.a);
        if (along < -8 && along > -14 && Math.abs(across) < 1.2) return { s, t };
      }
    }
    return null;
  });
  expect(pair, "a car with another across the aisle behind it").toBeTruthy();
  const { s, t } = pair as { s: any; t: any };
  await getIn(a, { x: s.x - Math.cos(s.a) * 3.4, y: s.y - Math.sin(s.a) * 3.4 }, /^drive:car:/);
  await a.waitForFunction(() => !!(window as any).__yutopia.tp?.gameCam?.snap, null, { timeout: 20_000 });
  await a.waitForTimeout(2500); // (the engine started)
  const poseOf = (pg: Page, id: string) =>
    pg.evaluate((oid) => {
      const o = (window as any).__yutopia.room.state.objects.get(oid);
      const p = JSON.parse(o.props);
      const w = o.rot % 2 ? 2 : 5;
      const h = o.rot % 2 ? 5 : 2;
      return { x: o.x + w / 2 + (p.dx ?? 0), y: o.y + h / 2 + (p.dz ?? 0), a: p.a as number | undefined };
    }, id);
  // straight back across the aisle into it
  await a.keyboard.down("KeyS");
  await expect
    .poll(async () => Math.hypot((await poseOf(a, t.id)).x - t.x, (await poseOf(a, t.id)).y - t.y), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0.1);
  await a.keyboard.up("KeyS");
  await a.keyboard.down("Space");
  await a.waitForTimeout(2500);
  await a.keyboard.up("Space");
  const moved = await poseOf(a, t.id);
  if (dir) await a.screenshot({ path: `${dir}/car-knock-3p.png` });
  expect(typeof moved.a, "left at its own heading").toBe("number");
  // the same for the other browser, and no further than a knock sends it
  await expect
    .poll(async () => Math.hypot((await poseOf(b, t.id)).x - moved.x, (await poseOf(b, t.id)).y - moved.y))
    .toBeLessThan(0.05);
  expect(Math.hypot(moved.x - t.x, moved.y - t.y)).toBeLessThan(6.5);
  // out; the lot back as it was
  await a.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "car:leave", null, { timeout: 10_000 });
  await a.evaluate(() => (window as any).__yutopia.interact());
  await expect.poll(async () => (await me(a)).busy, { timeout: 10_000 }).toBe("");
  await a.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
});
