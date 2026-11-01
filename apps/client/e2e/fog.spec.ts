/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { fogAt, spDay } from "@yutopia/shared";
import { ANA, BIA, enter, test, token } from "./helpers";

// The morning fog (docs/plan/64-the-fog.md, phase 6): Ana (an admin) calls it, Bia's in it. The
// wall in the room's state and in Bia's view (the camera's reach in, the sun out); the lot's near
// end seen and its far end not in a fog; the lobby clear of it, the lot not; Ana gone from Bia's
// sight across the lot and back up close; a storm blowing it away; the schedule's by the world's
// hour, gone by late morning. The picture measured from the 3D view itself: the scene drawn and
// read back, region by region, against the same view clear. 3D: the GPU (YUTOPIA_GPU=1).

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({
  launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
});

const LOT = { x: 37.8, y: 30 }; // the lot's east aisle (the ground floor's)
const LOBBY = { x: 72, y: 15 }; // (well in: the camera behind me in too)

// The view held looking at `to` from behind me, at `hour`, the server's fog taken as it comes.
const look = (p: Page, to: { x: number; y: number }, hour: number) =>
  p.evaluate(
    ([t, h]) => {
      const w = (window as any).__yutopia;
      const m = w.room.state.players.get(w.room.sessionId);
      const tp = w.tp;
      w.updateNight = () => {};
      w.model?.setClock(h);
      tp.setHour(h);
      tp.mode = "free";
      tp.yaw = Math.atan2(t.y - m.y, t.x - m.x);
      tp.pitch = 0.12;
      tp.dist = 4.5;
      tp.dragged = 1e12;
      w.walker.body.yaw = tp.yaw;
    },
    [to, hour] as const,
  );
// The scene drawn now, read back small: each cell's brightness (0 … 255), 32 × 20.
const picture = (p: Page) =>
  p.evaluate(() => {
    const tp = (window as any).__yutopia.tp;
    tp.renderer.render(tp.scene, tp.camera);
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 20;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.drawImage(tp.renderer.domElement, 0, 0, 32, 20);
    const d = g.getImageData(0, 0, 32, 20).data;
    const out: number[] = [];
    for (let i = 0; i < d.length; i += 4) out.push(0.3 * d[i] + 0.55 * d[i + 1] + 0.15 * d[i + 2]);
    return out;
  });
// how far apart two pictures are over rows [r0, r1): the mean difference a cell
const apart = (a: number[], b: number[], r0 = 0, r1 = 20) => {
  let s = 0;
  for (let r = r0; r < r1; r++) for (let c = 0; c < 32; c++) s += Math.abs(a[r * 32 + c] - b[r * 32 + c]);
  return s / ((r1 - r0) * 32);
};
const fog = (p: Page, kind: string | null) =>
  p.evaluate((k) => (window as any).__yutopia.room.send("mod:fog", { fog: k, now: true }), kind);
// Bia's view settled on the state's fog (it eases in a couple of seconds)
const settled = (p: Page, haze: number, wall: number) =>
  p.waitForFunction(
    ([h, w]) => {
      const tp = (window as any).__yutopia.tp;
      return Math.abs(tp.fogNow.haze - h) < 0.01 && Math.abs(tp.fogNow.wall - w) < 0.01;
    },
    [haze, wall] as const,
    { timeout: 15_000 },
  );
const go = async (p: Page, at: { x: number; y: number }) => {
  await p.evaluate((a) => (window as any).__yutopia.teleport({ ...a, level: 0 }), at);
  await p.waitForFunction(
    (a) => {
      const w = (window as any).__yutopia;
      const m = w.room.state.players.get(w.room.sessionId);
      return m.level === 0 && Math.hypot(m.x - a.x, m.y - a.y) < 2;
    },
    at,
    { timeout: 15_000 },
  );
  await p.waitForTimeout(2500);
};

test("a thick morning: Bia in the wall, the lot gone, the lobby clear, Ana lost and found, a storm blows it off", async ({
  page,
  browser,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(240_000);
  const ana = page;
  await enter(ana, await token(ANA));
  const bia = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await enter(bia, await token(BIA));
  await bia.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  await ana.evaluate(() => {
    const y = (window as any).__yutopia;
    y.room.send("mod:hour", { h: 7 });
    y.room.send("mod:storm", { storm: 0, now: true });
  });
  try {
    // ── the lot, clear, then the wall: Bia's view and the room's state ──
    await go(bia, LOT);
    await fog(ana, "clear");
    await settled(bia, 0, 0);
    await look(bia, { x: 0, y: 34 }, 7.5);
    await bia.waitForTimeout(800);
    const clear = await picture(bia);
    await fog(ana, "thick");
    await bia.waitForFunction(() => (window as any).__yutopia.room.state.fogWall === 1, null, { timeout: 5000 });
    await settled(bia, 1, 1);
    await bia.waitForTimeout(800);
    const v = await bia.evaluate(() => {
      const tp = (window as any).__yutopia.tp;
      return { far: tp.camera.far, sun: tp.sun.intensity, by: (window as any).__yutopia.room.state.fogBy };
    });
    expect(v.far, "the camera sees no further than the wall").toBeLessThan(60);
    expect(v.sun, "no sun in it: flat light").toBeLessThan(0.05);
    expect(v.by).toBe("Ana Demo");
    const thick = await picture(bia);
    expect(apart(clear, thick, 0, 12), "the lot and the trees gone in the wall").toBeGreaterThan(25);

    // ── a fog (the haze, ~150 m): the lot's near end seen, its far end and the trees not ──
    await fog(ana, "fog");
    await settled(bia, 1, 0);
    await bia.waitForTimeout(800);
    const haze = await picture(bia);
    const near = apart(clear, haze, 15, 20);
    const far = apart(clear, haze, 4, 10);
    expect(
      far,
      `the far end and the trees whited out (far ${far.toFixed(1)}, near ${near.toFixed(1)})`,
    ).toBeGreaterThan(near * 2);

    // ── the lobby: clear of it inside, through the doors not ──
    await go(bia, LOBBY);
    await fog(ana, "clear");
    await settled(bia, 0, 0);
    await look(bia, { x: 120, y: 15 }, 7.5);
    await bia.waitForTimeout(1200);
    const inClear = await picture(bia);
    await fog(ana, "thick");
    await settled(bia, 1, 1);
    await bia.waitForTimeout(800);
    const inThick = await picture(bia);
    expect(apart(inClear, inThick), "the lobby as it was, in the wall outside").toBeLessThan(6);

    // ── Ana across the lot, then up close: gone in it, seen again ──
    await go(bia, LOT);
    const anaId = await ana.evaluate(() => (window as any).__yutopia.room.sessionId);
    await go(ana, { x: LOT.x - 28, y: LOT.y });
    await look(bia, { x: 0, y: 30 }, 7.5);
    await bia.waitForTimeout(1000);
    expect(await bia.evaluate((id) => (window as any).__yutopia.tp.isUnseen(id), anaId), "Ana lost in the wall").toBe(
      true,
    );
    await go(ana, { x: LOT.x - 4, y: LOT.y });
    await bia.waitForTimeout(1000);
    expect(await bia.evaluate((id) => (window as any).__yutopia.tp.isUnseen(id), anaId), "Ana a step off: seen").toBe(
      false,
    );

    // ── a storm blows it away (and the fog's back after) ──
    await ana.evaluate(() => (window as any).__yutopia.room.send("mod:storm", { storm: 1, now: true }));
    await bia.waitForFunction(
      () => {
        const s = (window as any).__yutopia.room.state;
        return s.fog === 0 && s.fogWall === 0;
      },
      null,
      { timeout: 5000 },
    );
    await settled(bia, 0, 0);
    await ana.evaluate(() => (window as any).__yutopia.room.send("mod:storm", { storm: 0, now: true }));
    await settled(bia, 1, 1);

    // ── the schedule's, by the world's hour: the day's at 10:00, gone by 11:30 ──
    await fog(ana, null);
    await ana.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 10 }));
    const at10 = fogAt(spDay(Date.now()), 10);
    await bia.waitForFunction(
      ([h, w]) => {
        const s = (window as any).__yutopia.room.state;
        return Math.abs(s.fog - h) < 0.02 && Math.abs(s.fogWall - w) < 0.02;
      },
      [at10.haze, at10.wall] as const,
      { timeout: 60_000 },
    );
    if (at10.haze < 0.2) expect(at10.wall, "a mist or a fog all but gone by 10:00").toBe(0);
    await ana.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 11.5 }));
    await bia.waitForFunction(
      () => {
        const s = (window as any).__yutopia.room.state;
        return s.fog === 0 && s.fogWall === 0;
      },
      null,
      { timeout: 60_000 },
    );
  } finally {
    await ana.evaluate(() => {
      const y = (window as any).__yutopia;
      y.room.send("mod:hour", { h: null });
      y.room.send("mod:storm", { storm: null, now: true });
      y.room.send("mod:fog", { fog: "clear", now: true });
    });
  }
});
