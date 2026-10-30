/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// Flowmotion in the world (docs/plan/56-the-controls.md F, phase 7): out on the Grounds a lamp post
// is swung round (the camera held still on it) and the company's fence ground along, a jump off it
// the flow jump's spin — and the server carries each move to everyone (Player.flow). 3D: the GPU
// (YUTOPIA_GPU=1).

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
// (the ground floor's coords are the building's less GROUND_OFFSET)
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
// the driveway's lamp at 100 m (shared grounds.ts LAMPS: nothing else within 4 m, the land flat)
const LAMP = { x: -19.44, z: -102.99 };
// the company's fence along z −360, 1.2 m
const FENCE_Z = -360;

const body = (page: Page) =>
  page.evaluate(() => {
    const b = (window as any).__yutopia.walker.body;
    return { x: b.x as number, y: b.y as number, z: b.z as number, up: b.up as boolean, flow: b.flow?.kind ?? "" };
  });
const serverFlow = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    return (w.room.state.players.get(w.room.sessionId).flow ?? 0) as number;
  });

async function standAt(page: Page, at: { x: number; y: number }, yaw: number) {
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at);
  await page.waitForTimeout(2500);
  await page.evaluate((yaw) => {
    const w = (window as any).__yutopia;
    w.tp.yaw = yaw;
    w.walker.body.yaw = yaw;
  }, yaw);
  await page.waitForTimeout(300);
}

test("Flowmotion: a lamp post swung round (the camera still), the fence ground along and jumped off", async ({
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
  await page.evaluate(() => {
    const r = (window as any).__yutopia.room;
    for (const k of ["fly", "clip", "fast", "hidden"]) r.send("mod:power", { power: k, on: false });
  });
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(LAMP.x - 3, LAMP.z));
  await page.waitForTimeout(4000);
  await page.waitForFunction(
    () => {
      const w = (window as any).__yutopia;
      return !!w.tp.physicsBody(null, w.level, false, w.grid);
    },
    null,
    { timeout: 30_000 },
  );

  // ── the lamp: run fast at it from the west, Shift held — round it; the camera doesn't turn
  await standAt(page, G(LAMP.x - 3.2, LAMP.z + 0.25), 0);
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  await expect.poll(async () => (await body(page)).flow, { timeout: 4000 }).toBe("swing");
  expect((await serverFlow(page)) & 15, "the server has me swinging").toBe(3);
  expect(await page.evaluate(() => !!(window as any).__yutopia.tp.swingAt), "the view holds on the pole").toBe(true);
  const yaws: number[] = [];
  for (let i = 0; i < 10; i++) {
    yaws.push(await page.evaluate(() => (window as any).__yutopia.tp.yaw as number));
    await page.waitForTimeout(40);
  }
  expect(Math.max(...yaws) - Math.min(...yaws), "the camera held still round it").toBeLessThan(0.02);
  // let go: flung off it, and the server hears it's over
  await page.keyboard.up("Shift");
  await page.keyboard.up("w");
  await expect.poll(async () => (await body(page)).flow, { timeout: 3000 }).toBe("");
  await expect.poll(() => serverFlow(page), { timeout: 3000 }).toBe(0);

  // ── the fence: from 2.4 m south of it, a run and a jump onto it — a grind; a jump off, the spin
  await standAt(page, G(3, FENCE_Z + 2.4), -Math.PI / 2);
  await page.keyboard.down("w");
  await page.waitForTimeout(120);
  await page.keyboard.down("Space");
  await page.waitForTimeout(300);
  await page.keyboard.up("Space");
  await expect.poll(async () => (await body(page)).flow, { timeout: 3000 }).toBe("grind");
  await page.keyboard.up("w");
  const on = await body(page);
  expect((await serverFlow(page)) & 15, "the server has me grinding").toBe(4);
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  let top = on.z;
  let spun = false;
  for (let i = 0; i < 20; i++) {
    const b = await body(page);
    top = Math.max(top, b.z);
    if (((await serverFlow(page)) & 15) === 7) spun = true;
    await page.waitForTimeout(30);
  }
  expect(top - on.z, "off it: the flow jump, not caught again").toBeGreaterThan(1.2);
  expect(spun, "the server carried the spin").toBe(true);
  // (a jump straight up comes down on the fence again: grinding on, as KH does; the spin's over)
  await expect.poll(async () => (await serverFlow(page)) & 15, { timeout: 3000 }).not.toBe(7);
  expect([0, 4]).toContain((await serverFlow(page)) & 15);
});

// the town's walls (shared shapes/grounds.ts: buildings, flat ground before them, nothing in the way)
const OVER = { x: 402, z: -464 }; // a 4.2 m face looking west: run up it and over
const TALL = { x: 404, z: -424 }; // an 8.4 m face looking east: up it, too high, kicked off
const LONG = { x: 391, z: -434 }; // an 8.4 m face 26 m long looking south: run along it
const LEDGE = { x: 313, z: -378 }; // a 3.2 m face looking north: jumped at, a hang, then up

test("Flowmotion on the town's walls: up and over, kicked off a tall one, along a long one, a hang and up", async ({
  page,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  await page.evaluate(() => {
    const r = (window as any).__yutopia.room;
    for (const k of ["fly", "clip", "fast", "hidden"]) r.send("mod:power", { power: k, on: false });
  });
  // every move the body made, and its highest and its last place, while a run of keys is held
  const watch = async (ms: number) => {
    const seen = new Set<string>();
    const ends = new Set<string>();
    let top = Number.NEGATIVE_INFINITY;
    const t0 = Date.now();
    const z0 = (await body(page)).z;
    while (Date.now() - t0 < ms) {
      const b = await body(page);
      if (b.flow) seen.add(b.flow);
      top = Math.max(top, b.z);
      await page.waitForTimeout(25);
    }
    const end = await body(page);
    void ends;
    return { seen: [...seen], rise: top - z0, end, z0 };
  };
  const ready = async (at: { x: number; z: number }) => {
    await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(at.x, at.z));
    await page.waitForTimeout(4000);
  };

  // ── up and over: from 5 m west, sprinting east
  await ready(OVER);
  await standAt(page, G(OVER.x - 5, OVER.z + 0.5), 0);
  const startZ = (await body(page)).z;
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  const up = await watch(2200);
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  expect(up.seen, "a wall run, then a climb over").toEqual(expect.arrayContaining(["wallrun", "climb"]));
  await page.waitForTimeout(600);
  const onTop = await body(page);
  expect(onTop.z - startZ, "up on the roof").toBeGreaterThan(4);
  expect(onTop.x, "over the face, on it").toBeGreaterThan(G(OVER.x, 0).x);

  // ── too tall: up it and kicked off, back out east
  await ready(TALL);
  await standAt(page, G(TALL.x + 5, TALL.z + 0.5), Math.PI);
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  await expect.poll(async () => (await body(page)).flow, { timeout: 3000 }).toBe("wallrun");
  const z0 = (await body(page)).z;
  let rise = 0;
  // (up it till it kicks off — then the keys let go, so nothing steers her back at it)
  await expect
    .poll(
      async () => {
        const b = await body(page);
        rise = Math.max(rise, b.z - z0);
        return b.flow;
      },
      { timeout: 3000, intervals: [20] },
    )
    .not.toBe("wallrun");
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  expect(rise, "up most of the way").toBeGreaterThan(3.5);
  await page.waitForTimeout(1200);
  const back = await body(page);
  expect(back.flow).toBe("");
  expect(back.x, "kicked back off it").toBeGreaterThan(G(TALL.x + 0.6, 0).x);

  // ── along the long one: from its south-west, sprinting at it slantwise
  await ready(LONG);
  await standAt(page, G(LONG.x - 9, LONG.z - 2.4), 0.3);
  const from = await body(page);
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  await expect.poll(async () => (await body(page)).flow, { timeout: 3000 }).toBe("wallside");
  const along = await watch(900);
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  expect(along.rise, "a low arc up it").toBeGreaterThan(0.5);
  expect(along.end.x - from.x, "along it").toBeGreaterThan(8);
  expect(Math.abs(along.end.y - G(0, LONG.z).y), "beside its face").toBeLessThan(1.2);

  // ── the 3.2 m ledge: jumped at from 1.6 m out, a hang; W, up onto it
  await ready(LEDGE);
  await standAt(page, G(LEDGE.x, LEDGE.z + 1.6), -Math.PI / 2);
  const foot = (await body(page)).z;
  await page.keyboard.down("w");
  await page.waitForTimeout(60);
  await page.keyboard.down("Space");
  // (caught: W let go at once — held, it's "up onto it" straight away)
  await expect.poll(async () => (await body(page)).flow, { timeout: 2000, intervals: [10] }).toMatch(/hang|climb/);
  await page.keyboard.up("w");
  await page.keyboard.up("Space");
  await page.waitForTimeout(400);
  const hung = await body(page);
  // (if W was still down when it caught, it went straight up: that's up onto it too)
  if (hung.flow) expect(hung.flow, "hanging there").toBe("hang");
  await page.keyboard.press("w");
  await page.keyboard.down("w");
  await expect.poll(async () => (await body(page)).z - foot, { timeout: 3000 }).toBeGreaterThan(3);
  await page.keyboard.up("w");
});
