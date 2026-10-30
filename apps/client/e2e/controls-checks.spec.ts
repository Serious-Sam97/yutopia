/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { type Browser, expect, type Page } from "@playwright/test";
import { ANA, BIA, CAI, enter, test, token } from "./helpers";

// The controls' checks (docs/plan/56-the-controls.md, phase 8), out on the lot in 3D: someone's menu
// on a pad (Use held, the d-pad, A), the lock-on circled and switched, the double jump onto the bus
// stop's roof, aim assist drawing the view onto someone. The GPU: YUTOPIA_GPU=1.

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
// (the ground floor's coords are the building's less GROUND_OFFSET)
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const LOT = { x: 37.8, y: 30 };
const off = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

const prefs = (page: Page) =>
  page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false }));
  });

// a pad of our own: the browser's gamepads are this one, its buttons set from the test
const fakePad = (page: Page) =>
  page.addInitScript(() => {
    const w = window as any;
    w.__pad = { b: new Array(17).fill(0), a: [0, 0, 0, 0], t: 1 };
    const make = () => {
      const p = w.__pad;
      return {
        id: "e2e pad (STANDARD GAMEPAD)",
        index: 0,
        connected: true,
        mapping: "standard",
        timestamp: p.t,
        axes: p.a.slice(),
        buttons: p.b.map((v: number) => ({ pressed: v > 0.5, touched: v > 0, value: v })),
        vibrationActuator: { type: "dual-rumble", playEffect: async () => "complete", reset: async () => "complete" },
      };
    };
    Object.defineProperty(Navigator.prototype, "getGamepads", { configurable: true, value: () => [make(), null] });
  });
const button = (page: Page, i: number, v: number) =>
  page.evaluate(
    ([i, v]) => {
      const p = (window as any).__pad;
      p.b[i] = v;
      p.t = performance.now();
    },
    [i, v],
  );
const tapButton = async (page: Page, i: number) => {
  await button(page, i, 1);
  await page.waitForTimeout(120);
  await button(page, i, 0);
  await page.waitForTimeout(120);
};

async function inWorld(page: Page, who: typeof ANA) {
  await prefs(page);
  await enter(page, await token(who));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  await page.evaluate(() => {
    const r = (window as any).__yutopia.room;
    for (const k of ["fly", "clip", "fast", "hidden"]) r.send("mod:power", { power: k, on: false });
  });
}
// someone else in their own browser, put at `at` (my floor's coords)
async function other(browser: Browser, who: typeof ANA, at: { x: number; y: number }) {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  await inWorld(page, who);
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at);
  const sid = await page.evaluate(() => (window as any).__yutopia.room.sessionId as string);
  return { page, sid };
}
const sidAt = (page: Page, sid: string) =>
  page.evaluate((s) => {
    const p = (window as any).__yutopia.room.state.players.get(s);
    return { x: p.x as number, y: p.y as number };
  }, sid);
const mine = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    const b = w.walker.body;
    return { x: b.x as number, y: b.y as number, z: b.z as number, up: b.up as boolean, yaw: b.yaw as number };
  });
// I and the camera turned to face (x, y)
const faceTo = (page: Page, at: { x: number; y: number }) =>
  page.evaluate((t) => {
    const w = (window as any).__yutopia;
    const b = w.walker.body;
    const yaw = Math.atan2(t.y - b.y, t.x - b.x);
    b.yaw = yaw;
    w.tp.yaw = yaw;
  }, at);
const standAt = async (page: Page, at: { x: number; y: number }) => {
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at);
  await page.waitForTimeout(3000);
};

test("someone's menu on a pad: Use (Y) held opens it, the d-pad picks, A does it", async ({ page, browser }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
  await fakePad(page);
  await inWorld(page, ANA);
  await standAt(page, LOT);
  const bia = await other(browser, BIA, { x: LOT.x + 1.6, y: LOT.y });
  await page.waitForTimeout(2500);
  await faceTo(page, await sidAt(page, bia.sid));
  await expect
    .poll(() => page.evaluate(() => (window as any).__hud.get().targets?.items[0]?.key), { timeout: 8000 })
    .toBe(`p:${bia.sid}`);

  // Y held past a moment: her menu
  await button(page, 3, 1);
  await page.waitForTimeout(600);
  await button(page, 3, 0);
  const menu = page.getByRole("menu", { name: /Bia/ });
  await expect(menu).toBeVisible();
  const items: string[] = await page.evaluate(() =>
    (window as any).__hud.get().menu.items.map((i: { act: string }) => i.act),
  );
  const five = items.findIndex((a) => /high.?five/i.test(a));
  expect(five, `a high five in ${items.join(", ")}`).toBeGreaterThanOrEqual(0);
  // the d-pad down to it (and once past it and back up: both ways move)
  for (let i = 0; i < five + 1; i++) await tapButton(page, 13);
  await tapButton(page, 12);
  await expect.poll(() => page.evaluate(() => (window as any).__hud.get().menu?.sel)).toBe(five);
  // A: done — both of us
  await tapButton(page, 0);
  await expect(menu).toBeHidden();
  await expect
    .poll(
      () =>
        bia.page.evaluate(() => {
          const w = (window as any).__yutopia;
          return w.room.state.players.get(w.room.sessionId).act as string;
        }),
      { timeout: 15_000 },
    )
    .toBe("highfive");
  await bia.page.context().close();
});

test("the lock-on: circled round (I face her, as far off), switched to the next and back", async ({
  page,
  browser,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(240_000);
  await inWorld(page, ANA);
  await standAt(page, LOT);
  // Bia straight ahead (east), Cai off to the side further on
  const bia = await other(browser, BIA, { x: LOT.x + 4, y: LOT.y });
  const cai = await other(browser, CAI, { x: LOT.x + 5, y: LOT.y + 3.5 });
  await page.waitForTimeout(3000);
  const b = await sidAt(page, bia.sid);
  await faceTo(page, b);
  await page.waitForTimeout(300);
  await page.keyboard.press("KeyF");
  await expect.poll(() => page.evaluate(() => (window as any).__hud.get().lockOn?.label)).toMatch(/Bia/);

  // the next one: ← or →, whichever side Cai's on; then back the other way
  const label = () => page.evaluate(() => (window as any).__hud.get().lockOn?.label as string | undefined);
  // (a tap as a hand makes one: down for a few frames — the lock reads the arrows held)
  const tap = async (k: string) => {
    await page.keyboard.down(k);
    await page.waitForTimeout(120);
    await page.keyboard.up(k);
  };
  let way = "ArrowRight";
  await tap(way);
  await page.waitForTimeout(400);
  if (!/Cai/.test((await label()) ?? "")) {
    way = "ArrowLeft";
    await tap(way);
  }
  await expect.poll(label, { timeout: 3000 }).toMatch(/Cai/);
  await tap(way === "ArrowRight" ? "ArrowLeft" : "ArrowRight");
  await expect.poll(label, { timeout: 3000 }).toMatch(/Bia/);
  // round her: D held — as far from her all the way, facing her
  const d0 = Math.hypot(b.x - (await mine(page)).x, b.y - (await mine(page)).y);
  const start = await mine(page);
  const round: { d: number; off: number }[] = [];
  await page.keyboard.down("KeyD");
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(100);
    const m = await mine(page);
    round.push({ d: Math.hypot(b.x - m.x, b.y - m.y), off: off(m.yaw, Math.atan2(b.y - m.y, b.x - m.x)) });
  }
  await page.keyboard.up("KeyD");
  const end = await mine(page);
  const turned = off(Math.atan2(start.y - b.y, start.x - b.x), Math.atan2(end.y - b.y, end.x - b.x));
  expect(turned, "round her a good way").toBeGreaterThan(0.6);
  expect(Math.max(...round.map((r) => Math.abs(r.d - d0))), "as far from her all the way").toBeLessThan(0.8);
  expect(Math.max(...round.slice(3).map((r) => r.off)), "facing her").toBeLessThan(0.35);

  await page.keyboard.press("KeyF");
  await expect.poll(label).toBeUndefined();
  await bia.page.context().close();
  await cai.page.context().close();
});

// the bus stop (shared grounds.ts: the shelter, x −16..−10, z −417..−413; its roof slab to 2.7)
const STOP = { x: -13, z: -415 };

test("the double jump: up onto the bus stop's roof from a run", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(150_000);
  await inWorld(page, ANA);
  // from 8 m east of it, running west at it
  await standAt(page, G(STOP.x + 8, STOP.z));
  await faceTo(page, G(STOP.x, STOP.z));
  await page.waitForTimeout(300);
  // (its roof's top, as Jolt has it: the stop stands lower than where I start)
  const roof = await page.evaluate(
    (p) => {
      const w = (window as any).__yutopia;
      return w.tp.physicsBody(null, w.level, false, w.grid).collider.groundAt(p.x, p.y, 10) as number;
    },
    G(STOP.x, STOP.z),
  );
  await page.keyboard.down("w");
  await page.waitForTimeout(200);
  await page.keyboard.down("Space");
  await page.waitForTimeout(330);
  await page.keyboard.up("Space");
  await page.waitForTimeout(40);
  // (the second: before the stop's glass is in a wall kick's reach)
  await page.keyboard.down("Space");
  await page.waitForTimeout(400);
  await page.keyboard.up("Space");
  await page.waitForTimeout(700);
  await page.keyboard.up("w");
  await expect
    .poll(
      async () => {
        const m = await mine(page);
        return m.up ? 99 : Math.abs(m.z - roof);
      },
      { timeout: 3000 },
    )
    .toBeLessThan(0.08);
  const on = await mine(page);
  expect(Math.abs(on.x - G(STOP.x, 0).x) < 3.5 && Math.abs(on.y - G(0, STOP.z).y) < 2.5, "on the roof").toBe(true);
});

test("aim assist: aiming on the keys just off someone, the view's drawn onto her", async ({ page, browser }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
  await inWorld(page, ANA);
  await standAt(page, LOT);
  const bia = await other(browser, BIA, { x: LOT.x + 5, y: LOT.y });
  await page.waitForTimeout(3000);
  const b = await sidAt(page, bia.sid);
  const way = await page.evaluate((t) => {
    const me = (window as any).__yutopia.walker.body;
    return Math.atan2(t.y - me.y, t.x - me.x);
  }, b);
  // turned a little off her (no mouse: the pointer's never locked here — the keys' and pad's help)
  expect(await page.evaluate(() => (window as any).__yutopia.tp.aimAssist)).toBe(true);
  await page.keyboard.down("KeyZ");
  await page.waitForTimeout(500);
  // the crosshair's way a little off her (aiming turns the view over the shoulder: its own part)
  await page.evaluate((want) => {
    const t = (window as any).__yutopia.tp;
    t.yaw += want - t.lookYaw;
  }, way + 0.08);
  expect(off(await page.evaluate(() => (window as any).__yutopia.tp.lookYaw as number), way)).toBeGreaterThan(0.06);
  await expect
    // (the crosshair's way: over the shoulder it's the view's turn and the aim's own)
    .poll(async () => off(await page.evaluate(() => (window as any).__yutopia.tp.lookYaw as number), way), {
      timeout: 3000,
    })
    .toBeLessThan(0.03);
  await page.keyboard.up("KeyZ");
  await bia.page.context().close();
});
