/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

const STOREY = 3.5; // (shared levels.ts)

// One building (docs/plan/50-the-volume.md, phase 6): the HQ's floors are one space and my floor is
// where I am, from my height. Flying up inside, the ceiling stops me; through walls, I go up
// through it onto the floor above and land on its floor — the server agrees all the way. 3D: the
// GPU (YUTOPIA_GPU=1).

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const me = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    const p = w.room.state.players.get(w.room.sessionId);
    return { z: w.walker.body.z as number, level: w.level as number, server: p.level as number };
  });
const power = (page: Page, power: string, on: boolean) =>
  page.evaluate(([k, v]) => (window as any).__yutopia.room.send("mod:power", { power: k, on: v }), [
    power,
    on,
  ] as const);

test("through walls, up through the ceiling onto the floor above; without, the ceiling stops me", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  for (const k of ["fly", "clip", "fast", "hidden"]) await power(page, k, false);
  // floor 1, in the open
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: 20.5, y: 18.5, level: 1 }));
  await page.waitForFunction(() => (window as any).__yutopia.level === 1, null, { timeout: 20_000 });
  await page.waitForFunction(
    () => {
      const w = (window as any).__yutopia;
      return !!w.tp.physicsBody(null, w.level, false, w.grid);
    },
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const w = window as any;
    w.__snaps = 0;
    w.__yutopia.room.onMessage("snap", () => w.__snaps++);
  });

  // flying: up to the ceiling, no further
  await power(page, "fly", true);
  await page.waitForTimeout(800);
  await page.keyboard.down("Space");
  await page.waitForTimeout(2500);
  const shut = await me(page);
  expect(shut.level, "still on floor 1").toBe(1);
  expect(shut.z, "under its ceiling").toBeLessThan(1.6);

  // through walls too: up through it
  await power(page, "clip", true);
  await expect.poll(async () => (await me(page)).level, { timeout: 10_000 }).toBe(2);
  await page.keyboard.up("Space");
  // flying off: down onto floor 2 (through walls still stands on floors)
  await power(page, "fly", false);
  await expect.poll(async () => Math.abs((await me(page)).z), { timeout: 10_000 }).toBeLessThan(0.1);
  await page.waitForTimeout(800);
  const landed = await me(page);
  expect(landed.level, "on floor 2").toBe(2);
  expect(landed.server, "the server has me there too").toBe(2);
  expect(await page.evaluate(() => (window as any).__snaps), "never put back").toBe(0);
  await power(page, "clip", false);
});

test("a lift's car carries me down the shaft: every floor on the way, in it all the way", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  for (const k of ["fly", "clip", "fast", "hidden"]) await power(page, k, false);
  // car A on the studio's floor (its doors at y 29, x 8–10): called, in it, down to the ground floor
  const stop = (level: number) =>
    page.evaluate((l) => {
      const w = (window as any).__yutopia;
      let out: { id: string; door: string; ph: string } | null = null;
      w.room.state.objects.forEach((o: any) => {
        const p = JSON.parse(o.props || "{}");
        if (o.kind === "elevator" && p.shaft === "A" && p.level === l) out = { id: o.id, door: p.door, ph: p.ph };
      });
      return out as unknown as { id: string; door: string; ph: string };
    }, level);
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: 9, y: 27.5, level: 4 }));
  await page.waitForFunction(() => (window as any).__yutopia.level === 4, null, { timeout: 20_000 });
  await page.waitForTimeout(1500);
  const top = await stop(4);
  await page.evaluate((id) => (window as any).__yutopia.room.send("lift:call", { id }), top.id);
  await expect.poll(async () => (await stop(4)).door, { timeout: 15_000 }).toBe("open");
  await page.evaluate(() => (window as any).__yutopia.walkTo({ x: 9, y: 30.2 }));
  await page.waitForFunction(
    () => {
      const w = (window as any).__yutopia;
      const p = w.room.state.players.get(w.room.sessionId);
      return p.y > 29.6;
    },
    null,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(500);
  // a ride: what floors it passes, my height all the way, in the car all the way
  const ride = async (from: number, to: number) => {
    const at = await stop(from);
    await page.evaluate(([id, l]) => (window as any).__yutopia.room.send("lift:go", { id, level: l }), [at.id, to]);
    await expect.poll(async () => (await stop(from)).ph, { timeout: 10_000 }).toBe("moving");
    const seen = new Set<number>();
    const heights: number[] = [];
    let inCar = 0;
    let shot = false;
    for (let t = Date.now(); Date.now() - t < 15_000; ) {
      const s = await page.evaluate(() => {
        const w = (window as any).__yutopia;
        return { level: w.level as number, z: w.height.z as number, inCar: !!w.tp.liftIn };
      });
      seen.add(s.level);
      heights.push(s.level * STOREY + s.z);
      if (s.inCar) inCar++;
      if (!shot && s.level === 2 && process.env.YUTOPIA_SHOTS) {
        shot = true;
        await page.screenshot({ path: `${process.env.YUTOPIA_SHOTS}/lift-${from}-${to}.png` });
      }
      if (s.level === to && (await stop(to)).door === "open") break;
      await page.waitForTimeout(50);
    }
    const way = [from, to].sort();
    expect([...seen].sort(), "every floor on the way").toEqual(
      [0, 1, 2, 3, 4].filter((l) => l >= way[0] && l <= way[1]),
    );
    const dir = Math.sign(to - from);
    for (let i = 1; i < heights.length; i++)
      expect((heights[i] - heights[i - 1]) * dir, "one way all the way").toBeGreaterThan(-0.05);
    expect(inCar, "in the car all the way").toBe(heights.length);
    const end = await page.evaluate(() => {
      const w = (window as any).__yutopia;
      return { level: w.level as number, z: w.height.z as number };
    });
    expect(end.level).toBe(to);
    expect(Math.abs(end.z)).toBeLessThan(0.05);
  };
  await ride(4, 0);
  // (and back up: where the other specs expect me)
  await ride(0, 4);
});

// (the ground floor's coords are the building's less GROUND_OFFSET)
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });

test("a thing on the snow 3 m below: out of reach — no prompt, the server won't hand it up; down by it, picked up", async ({
  page,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  for (const k of ["fly", "clip", "fast", "hidden"]) await power(page, k, false);
  // out on the land by day, a kit in my pockets; one thing dropped here
  const at = G(-232, -44);
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at);
  await page.waitForFunction(() => !!(window as any).__dark, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    y.room.send("mod:hour", { h: 13 });
    y.room.send("mod:refill", { kit: true });
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__dark?.inv?.quick?.filter(Boolean).length ?? 0))
    .toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  const before = new Set(
    (await page.evaluate(() => [...(window as any).__yutopia.room.state.drops.keys()])) as string[],
  );
  const slot = await page.evaluate(() => (window as any).__dark.inv.quick.findIndex(Boolean) as number);
  await page.evaluate((s) => (window as any).__yutopia.room.send("dark:drop", { slot: s }), slot);
  const id = await expect
    .poll(() =>
      page.evaluate(
        (had) => [...(window as any).__yutopia.room.state.drops.keys()].find((k: string) => !had.includes(k)) ?? "",
        [...before],
      ),
    )
    .not.toBe("")
    .then(() =>
      page.evaluate(
        (had) => [...(window as any).__yutopia.room.state.drops.keys()].find((k: string) => !had.includes(k)) as string,
        [...before],
      ),
    );
  const target = () => page.evaluate(() => ((window as any).__dark.target?.id ?? "") as string);
  await expect.poll(target, { timeout: 10_000 }).toBe(id);
  // up 3 m over it
  await power(page, "fly", true);
  await page.waitForTimeout(800);
  const z0 = await page.evaluate(() => (window as any).__yutopia.walker.body.z as number);
  await page.keyboard.down("Space");
  await expect
    .poll(() => page.evaluate(() => (window as any).__yutopia.walker.body.z as number), { timeout: 10_000 })
    .toBeGreaterThan(z0 + 3);
  await page.keyboard.up("Space");
  await page.waitForTimeout(500);
  expect(await target(), "no prompt for it up here").toBe("");
  await expect(page.locator(".dk-prompt", { hasText: /Pick up|Pegar/ })).toBeHidden();
  await page.evaluate((d) => (window as any).__yutopia.room.send("dark:pick", { id: d }), id);
  await page.waitForTimeout(1000);
  expect(
    await page.evaluate((d) => (window as any).__yutopia.room.state.drops.has(d), id),
    "the server didn't hand it up",
  ).toBe(true);
  // down beside it: there it is, and picked up
  await power(page, "fly", false);
  await expect.poll(target, { timeout: 10_000 }).toBe(id);
  await page.evaluate((d) => (window as any).__yutopia.room.send("dark:pick", { id: d }), id);
  await expect
    .poll(() => page.evaluate((d) => (window as any).__yutopia.room.state.drops.has(d), id), { timeout: 5000 })
    .toBe(false);
});
