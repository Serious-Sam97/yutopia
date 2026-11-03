/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// The weather (docs/plan/65-the-weather.md, phase 8), as two people: Ana (an admin) calls it, Bia's
// out in it. The same weather in both views at the same moment; snow called lying on the lot for
// both, the lot white in Bia's view, then melting for both (going: islands) and gone (green); the
// rain on for both (its streaks round them, the wet and the puddles in both views as the room has
// them); the water open stops Bia at the pond's shore, frozen it carries her out on it. The picture
// measured from the 3D view itself (as fog.spec's). 3D: the GPU (YUTOPIA_GPU=1).

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({
  // (and the audio running with no click: the weather heard — the second test)
  launchOptions: {
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
  },
});

const LOT = { x: 37.8, y: 30 }; // the lot's east aisle (the ground floor's)
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 }); // the land's coords → the ground floor's
const POND = { cx: -240, cz: -60, rx: 48, rz: 34 }; // (shared grounds.ts POND)
const POND_SHELF = 0.88; // (shared grounds.ts: where its shelf ends, on its ellipse)

const send = (p: Page, type: string, m: unknown) =>
  p.evaluate(([t, mm]) => (window as any).__yutopia.room.send(t, mm), [type, m] as const);
// what a view shows of the weather: the layer's snow and its going, the wet, the puddles, the rain
const view = (p: Page) =>
  p.evaluate(() => {
    const w = window as any;
    const L = w.__wxLayer.wx;
    const s = w.__yutopia.room.state.weather;
    return {
      snow: L.wxSnow.value as number,
      melt: L.wxMelt.value as number,
      wet: L.wxWet.value as number,
      pud: L.wxPud.value as number,
      ice: L.wxIce.value as number,
      rain: !!w.__yutopia.tp.around.rain?.streaks.visible,
      room: {
        kind: s.kind as string,
        snow: s.snow as number,
        wet: s.wet as number,
        puddles: s.puddles as number,
        ice: s.ice as number,
      },
    };
  });
// the view held on `to` from behind me at noon
const look = (p: Page, to: { x: number; y: number }) =>
  p.evaluate((t) => {
    const w = (window as any).__yutopia;
    const m = w.room.state.players.get(w.room.sessionId);
    const tp = w.tp;
    w.updateNight = () => {};
    w.model?.setClock(12);
    tp.setHour(12);
    tp.mode = "free";
    tp.yaw = Math.atan2(t.y - m.y, t.x - m.x);
    tp.pitch = 0.14;
    tp.dist = 5;
    tp.dragged = 1e12;
    w.walker.body.yaw = tp.yaw;
  }, to);
// the scene drawn now, read back small: each cell's brightness, 32 × 20
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
const mean = (a: number[], r0 = 10, r1 = 20) => {
  let s = 0;
  for (let r = r0; r < r1; r++) for (let c = 0; c < 32; c++) s += a[r * 32 + c];
  return s / ((r1 - r0) * 32);
};
const go = async (p: Page, at: { x: number; y: number }) => {
  await p.evaluate((a) => (window as any).__yutopia.teleport({ ...a, level: 0 }), at);
  await p.waitForFunction(
    (a) => {
      const w = (window as any).__yutopia;
      const m = w.room.state.players.get(w.room.sessionId);
      return m.level === 0 && Math.hypot(m.x - a.x, m.y - a.y) < 3;
    },
    at,
    { timeout: 25_000 },
  );
  await p.waitForTimeout(2500);
};
// where I am on the pond: its ellipse's measure (1 its edge, 0 its middle)
const onPond = (p: Page) =>
  p.evaluate((P) => {
    const w = (window as any).__yutopia;
    const m = w.room.state.players.get(w.room.sessionId);
    return Math.hypot((m.x - 60 - P.cx) / P.rx, (m.y - 10 - P.cz) / P.rz);
  }, POND);
// four seconds walking (W) towards the pond's middle
async function walkIn(p: Page) {
  await p.evaluate((P) => {
    const w = (window as any).__yutopia;
    const m = w.room.state.players.get(w.room.sessionId);
    w.tp.yaw = Math.atan2(P.cz + 10 - m.y, P.cx + 60 - m.x);
  }, POND);
  await p.keyboard.down("KeyW");
  await p.waitForTimeout(4000);
  await p.keyboard.up("KeyW");
  await p.waitForTimeout(500);
}

test("the weather as two: the same in both views; snow on the lot for both, melting, gone; the rain; Bia swims the water, the ice carries her", async ({
  page,
  browser,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(300_000);
  const ana = page;
  await enter(ana, await token(ANA));
  const bia = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await enter(bia, await token(BIA));
  await bia.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__wxLayer, null, {
    timeout: 60_000,
  });
  try {
    // ── snow called lying, on a snowy day: the same in both views at once ──
    await send(ana, "mod:weather", { to: "snow", now: true });
    await send(ana, "mod:ground", { to: "snow", now: true });
    await go(bia, LOT);
    await look(bia, { x: 0, y: 34 });
    for (const p of [ana, bia])
      await p.waitForFunction(() => (window as any).__wxLayer.wx.wxSnow.value > 0.99, null, { timeout: 10_000 });
    const [a1, b1] = [await view(ana), await view(bia)];
    expect(b1.room).toEqual(a1.room);
    expect(a1.room.kind).toBe("snow");
    expect(Math.abs(a1.snow - b1.snow)).toBeLessThan(0.01);
    await bia.waitForTimeout(800);
    const white = await picture(bia);

    // ── melting, over its two minutes: going in both views (islands), then all of it at once ──
    await send(ana, "mod:weather", { to: "cloudy", now: true });
    await send(ana, "mod:ground", { to: "melt" });
    for (const p of [ana, bia])
      await p.waitForFunction(
        () => {
          const L = (window as any).__wxLayer.wx;
          return L.wxSnow.value < 0.97 && L.wxMelt.value > 0.05;
        },
        null,
        { timeout: 60_000 },
      );
    const [a2, b2] = [await view(ana), await view(bia)];
    expect(Math.abs(a2.snow - b2.snow), "the same snow in both views").toBeLessThan(0.03);
    await send(ana, "mod:ground", { to: "melt", now: true });
    for (const p of [ana, bia])
      await p.waitForFunction(() => (window as any).__wxLayer.wx.wxSnow.value < 0.01, null, { timeout: 10_000 });
    await bia.waitForTimeout(800);
    const green = await picture(bia);
    console.log(`the lot: white ${mean(white).toFixed(1)}, green ${mean(green).toFixed(1)}`);
    expect(mean(white) - mean(green), "the lot's ground white, then not").toBeGreaterThan(25);

    // ── the rain on: its streaks round both, the wet and the puddles as the room has them ──
    await send(ana, "mod:weather", { to: "rain", now: true });
    for (const p of [ana, bia])
      await p.waitForFunction(() => !!(window as any).__yutopia.tp.around.rain?.streaks.visible, null, {
        timeout: 15_000,
      });
    await bia.waitForTimeout(1500);
    for (const p of [ana, bia]) {
      const v = await view(p);
      expect(v.room.kind).toBe("rain");
      expect(v.room.wet, "wet in the rain").toBeGreaterThan(0.2);
      expect(Math.abs(v.wet - v.room.wet), "the wet as the room has it").toBeLessThan(0.05);
      expect(Math.abs(v.pud - v.room.puddles), "the puddles as the room has them").toBeLessThan(0.05);
    }

    // ── the water: open (melted), Bia wades its shelf and swims out past it (plan 66); frozen, it
    // carries her out on its ice ──
    await send(ana, "mod:weather", { to: "clear", now: true });
    await bia.waitForFunction(() => (window as any).__yutopia.room.state.weather.ice < 0.8, null, { timeout: 10_000 });
    await go(bia, G(POND.cx + 4, POND.cz - POND.rz - 6));
    const e0 = await onPond(bia);
    expect(e0, "on the land by the pond").toBeGreaterThan(1);
    await walkIn(bia);
    // (on in, till she floats: chin-deep she's still wading — plan 66's 1.45 m)
    await bia.keyboard.down("KeyW");
    await bia.waitForFunction(() => !!(window as any).__yutopia.walker.body.swim, null, { timeout: 15_000 });
    await bia.keyboard.up("KeyW");
    const e1 = await onPond(bia);
    expect(e1, "she walked to the shore").toBeLessThan(e0 - 0.1);
    expect(e1, `she's out past the open water's shelf (${e1.toFixed(2)})`).toBeLessThan(POND_SHELF);
    // (back on the bank before it freezes: a freeze over a swimmer is phase 3's)
    await go(bia, G(POND.cx + 4, POND.cz - POND.rz - 6));
    await send(ana, "mod:ground", { to: "snow", now: true });
    await bia.waitForFunction(() => (window as any).__wxLayer.wx.wxIce.value > 0.99, null, { timeout: 10_000 });
    await bia.waitForTimeout(1500);
    await walkIn(bia);
    const e2 = await onPond(bia);
    console.log(`the pond: by it ${e0.toFixed(2)}, open ${e1.toFixed(2)}, frozen ${e2.toFixed(2)}`);
    expect(e2, `frozen, out on the ice (${e2.toFixed(2)})`).toBeLessThan(0.85);
  } finally {
    // (the specs' own weather back: e2e/helpers.ts enter's)
    await send(ana, "mod:weather", { to: "cloudy", now: true }).catch(() => {});
    await send(ana, "mod:ground", { to: "snow", now: true }).catch(() => {});
  }
});

// Phase 9: the weather heard, in the game (Ana: she calls it). The green lawn's steps are grass's own
// recordings (not the stand-in), soaked mud's; the rain's beds round her in the open; the soaked lot's steps the
// wet way's, a puddle's fetched with them; indoors the roof's rain and the open's muffled; a
// thunderstorm's peals fetched before the first is due. What's heard read from the game's players.
test("the weather heard: grass underfoot on a green day, mud soaked, the rain's beds by where she is, the wet way's steps, the thunder", async ({
  page,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(240_000);
  const ana = page;
  await enter(ana, await token(ANA));
  await ana.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.life, null, {
    timeout: 60_000,
  });
  await ana.evaluate(() => (window as any).__yutopia.life.sound.mixer.resume());
  const beds = () =>
    ana.evaluate(() => (window as any).__yutopia.life.sound.weather.levels() as Record<string, number>);
  // a few steps (W, 2.5 s): what was underfoot at each, and whether its recordings are in
  const walk = async () => {
    await ana.evaluate(() => {
      const w = (window as any).__yutopia;
      const log: string[] = [];
      (window as any).__steps = log;
      const was = w.__myStep ?? w.myStep.bind(w);
      w.__myStep = was;
      w.myStep = (side?: string) => {
        log.push(w.myFooting(w.height.z));
        was(side);
      };
    });
    await ana.keyboard.down("KeyW");
    await ana.waitForTimeout(2500);
    await ana.keyboard.up("KeyW");
    await ana.waitForTimeout(400);
    return ana.evaluate(() => {
      const st = (window as any).__yutopia.stepper;
      const log: string[] = (window as any).__steps;
      const ready = (f: string) => st?.ready.get(f)?.bufs.length ?? 0;
      return { log, ready: Object.fromEntries([...new Set([...log, "puddle"])].map((f) => [f, ready(f)])) };
    });
  };
  try {
    // ── a green, dry day on the lawn: grass underfoot, its own recordings ──
    await send(ana, "mod:weather", { to: "clear", now: true });
    await send(ana, "mod:ground", { to: "melt", now: true });
    await go(ana, G(95, -95));
    // (the melt's left it soaked, and soaked grass is mud — the weather's rule: the steps as they'd
    // be on a dry day, the client's footing held so, then let go)
    await ana.evaluate(() => {
      const L = (window as any).__yutopia.life;
      L.underfoot(0, 0, false, 0);
      L.__underfoot = L.underfoot;
      L.underfoot = () => {};
    });
    const lawn = await walk();
    await ana.evaluate(() => {
      const L = (window as any).__yutopia.life;
      L.underfoot = L.__underfoot;
    });
    await ana.waitForTimeout(1500);
    const soaked = await walk();
    expect(soaked.log.filter((f) => f === "mud").length, soaked.log.join(",")).toBeGreaterThan(soaked.log.length / 2);
    expect(soaked.ready.mud, "mud's own recordings").toBeGreaterThan(3);
    expect(lawn.log.length, "steps heard").toBeGreaterThan(2);
    expect(lawn.log.filter((f) => f === "grass").length, lawn.log.join(",")).toBeGreaterThan(lawn.log.length / 2);
    expect(lawn.ready.grass, "grass's own recordings").toBeGreaterThan(3);
    const dry = await beds();
    expect(
      Object.entries(dry).every(([b, v]) => !/^(rain|sleet)/.test(b) || v < 0.01),
      `no rain on a dry day: ${JSON.stringify(dry)}`,
    ).toBe(true);

    // ── the rain on: its beds round her in the open ──
    await send(ana, "mod:weather", { to: "rain", now: true });
    await ana.waitForFunction(
      () => {
        const l = (window as any).__yutopia.life.sound.weather.levels();
        return (l["rain-light"] ?? 0) + (l["rain-heavy"] ?? 0) > 0.15;
      },
      null,
      { timeout: 20_000 },
    );
    // (its fade in done)
    await ana.waitForTimeout(6000);
    const open = await beds();

    // ── the soaked lot: the wet way's steps, the puddles' fetched with them ──
    await go(ana, LOT);
    await ana.waitForFunction(() => (window as any).__yutopia.room.state.weather.wet > 0.6, null, { timeout: 10_000 });
    const lot = await walk();
    expect(lot.log.filter((f) => f === "wet").length, lot.log.join(",")).toBeGreaterThan(lot.log.length / 2);
    expect(lot.ready.wet, "the wet way's recordings").toBeGreaterThan(3);
    expect(lot.ready.puddle, "a puddle's").toBeGreaterThan(3);

    // ── indoors: the roof's rain, the open's muffled ──
    await ana.evaluate(() => (window as any).__yutopia.room.send("teleport", { to: "spawn" }));
    await ana.waitForFunction(() => (window as any).__yutopia.level > 0, null, { timeout: 25_000 });
    await ana.waitForFunction(
      () => ((window as any).__yutopia.life.sound.weather.levels()["rain-roof"] ?? 0) > 0.15,
      null,
      {
        timeout: 20_000,
      },
    );
    await ana.waitForTimeout(6000);
    const inside = await beds();
    const sum = (l: Record<string, number>) => (l["rain-light"] ?? 0) + (l["rain-heavy"] ?? 0);
    expect(
      sum(inside),
      `the open's rain muffled indoors (${sum(open).toFixed(2)} → ${sum(inside).toFixed(2)})`,
    ).toBeLessThan(sum(open) * 0.5);

    // ── a thunderstorm: its peals in before the first's due (the weather sound handed one: a
    // called-up storm thunders only in the warm, shared weather.ts thunderOf, and today may be cold) ──
    await ana.waitForFunction(
      () => {
        const ws = (window as any).__yutopia.life.sound.weather;
        ws.update(0.1, {
          out: true,
          car: false,
          woods: 0,
          water: 0,
          river: 0,
          night: 0,
          storm: 1,
          fog: 0,
          hour: 15,
          rain: 1,
          sleet: false,
          thunder: 1,
          temp: 20,
          wet: 1,
          ice: 0,
          cloud: 1,
        });
        return (ws.ready.get("thunder-near")?.length ?? 0) > 2 && (ws.ready.get("thunder-far")?.length ?? 0) > 2;
      },
      null,
      { timeout: 30_000, polling: 250 },
    );
    console.log(
      `the weather heard: the open ${JSON.stringify(open)}, indoors ${JSON.stringify(inside)}; lawn ${lawn.log.join(",")}; lot ${lot.log.join(",")}`,
    );
  } finally {
    await send(ana, "mod:weather", { to: "cloudy", now: true }).catch(() => {});
    await send(ana, "mod:ground", { to: "snow", now: true }).catch(() => {});
  }
});
