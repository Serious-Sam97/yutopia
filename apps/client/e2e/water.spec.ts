/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// The water (docs/plan/66-the-water.md, phase 8), as two people: Ana (an admin) calls the weather,
// Bia's in the pond. Open, Bia walks in from its north shore — wades its shelf, floats past it,
// swims — dives under (her breath going) and comes up, swims back and walks out soaked; Ana sees her
// afloat, under, and soaked after. Frozen, the ice carries her at its level. Freezing from open, the
// young ice (all of it thin under 0.3) gives under Ana: a hole in the room's weather, and her in the
// water. 3D:
// the GPU (YUTOPIA_GPU=1).

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({
  // (and the audio running with no click: the water heard — the second test)
  launchOptions: {
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
  },
});

const POND = { cx: -240, cz: -60, rx: 48, rz: 34 }; // (shared grounds.ts POND)
const G = (x: number, y: number) => ({ x, y }); // the land's coords → the ground floor's
const send = (p: Page, type: string, m: unknown) =>
  p.evaluate(([t, mm]) => (window as any).__yutopia.room.send(t, mm), [type, m] as const);
const go = async (p: Page, at: { x: number; y: number }) => {
  await p.evaluate((a) => (window as any).__yutopia.teleport({ ...a, level: 0 }), at);
  await p.waitForFunction(
    (a) => {
      const w = (window as any).__yutopia;
      const m = w.room.state.players.get(w.room.sessionId);
      return m.level === 0 && Math.hypot(m.x - a.x, m.y - a.y) < 4;
    },
    at,
    { timeout: 25_000 },
  );
  await p.waitForTimeout(3000);
};
// my body as the move core has it, and the pond's water where I am (the Grounds' own)
const body = (p: Page) =>
  p.evaluate(() => {
    const w = (window as any).__yutopia;
    const b = w.walker.body;
    const wat = w.G.waterAt(b.x, b.y);
    return {
      z: b.z as number,
      swim: (b.swim ?? null) as { under: boolean } | null,
      level: (wat?.level ?? null) as number | null,
      air: w.walker.air as number,
    };
  });
// face the pond's middle (or away from it), and walk
const face = (p: Page, away = false) =>
  p.evaluate(
    ([P, a]) => {
      const w = (window as any).__yutopia;
      const m = w.room.state.players.get(w.room.sessionId);
      const yaw = Math.atan2(P.cz - m.y, P.cx - m.x) + (a ? Math.PI : 0);
      w.tp.yaw = yaw;
      w.walker.body.yaw = yaw;
    },
    [POND, away] as const,
  );
// what Ana's view has of Bia: her swim (0 out … 3 under), how wet
const seen = (p: Page, sid: string) =>
  p.evaluate((s) => {
    const w = (window as any).__yutopia;
    return { swim: (w.model.avatars.get(s)?.swim ?? 0) as number, wet: (w.tp.wetOn.get(s) ?? 0) as number };
  }, sid);

test("the water as two: Bia wades, swims, dives and comes out soaked, Ana sees it; frozen it carries her; thin, it gives under Ana", async ({
  page,
  browser,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(360_000);
  const ana = page;
  await enter(ana, await token(ANA));
  const bia = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await enter(bia, await token(BIA));
  const biaSid = await bia.evaluate(() => (window as any).__yutopia.room.sessionId as string);
  try {
    // ── open: in, afloat, under, up, out ──
    await send(ana, "mod:weather", { to: "clear", now: true });
    await send(ana, "mod:ground", { to: "melt", now: true });
    await bia.waitForFunction(() => (window as any).__yutopia.room.state.weather.ice === 0, null, { timeout: 15_000 });
    await go(ana, G(POND.cx + 10, POND.cz - POND.rz - 8));
    await go(bia, G(POND.cx, POND.cz - POND.rz - 6));
    await face(bia);
    await bia.keyboard.down("KeyW");
    // (wading: the water over her feet, her still on them)
    let waded = false;
    for (let i = 0; i < 60 && !waded; i++) {
      const b = await body(bia);
      if (b.level !== null && !b.swim && b.level - b.z > 0.35) waded = true;
      await bia.waitForTimeout(100);
    }
    expect(waded, "waded the shelf").toBe(true);
    await bia.waitForFunction(() => !!(window as any).__yutopia.walker.body.swim, null, { timeout: 15_000 });
    await bia.waitForTimeout(1500);
    await bia.keyboard.up("KeyW");
    const afloat = await body(bia);
    expect(afloat.swim?.under, "afloat on the surface").toBe(false);
    expect(Math.abs((afloat.level ?? 0) - 1.25 - afloat.z), `the head out: ${afloat.z}`).toBeLessThan(0.15);
    await ana.waitForFunction((s) => ((window as any).__yutopia.model.avatars.get(s)?.swim ?? 0) === 2, biaSid, {
      timeout: 10_000,
    });
    // under: C, looking down, on; her breath going
    await bia.keyboard.press("KeyC");
    await bia.evaluate(() => {
      (window as any).__yutopia.tp.pitch = 0.9;
    });
    await bia.keyboard.down("KeyW");
    await bia.waitForTimeout(1800);
    await bia.keyboard.up("KeyW");
    const under = await body(bia);
    expect(under.swim?.under, "under").toBe(true);
    expect(under.air, "her breath going").toBeLessThan(30);
    await ana.waitForFunction((s) => ((window as any).__yutopia.model.avatars.get(s)?.swim ?? 0) === 3, biaSid, {
      timeout: 10_000,
    });
    // up again: C
    await bia.keyboard.press("KeyC");
    await bia.waitForFunction(() => !(window as any).__yutopia.walker.body.swim?.under, null, { timeout: 10_000 });
    // back to the shore and out
    await face(bia, true);
    await bia.keyboard.down("KeyW");
    await bia.waitForFunction(
      () => {
        const w = (window as any).__yutopia;
        const b = w.walker.body;
        return !b.swim && !w.G.waterAt(b.x, b.y);
      },
      null,
      { timeout: 40_000 },
    );
    await bia.keyboard.up("KeyW");
    await ana.waitForTimeout(1500);
    const after = await seen(ana, biaSid);
    expect(after.swim, "out of it").toBe(0);
    expect(after.wet, "soaked, in Ana's view").toBeGreaterThan(0.9);

    // ── frozen: the ice carries her at its level ──
    await send(ana, "mod:ground", { to: "snow", now: true });
    await bia.waitForFunction(() => (window as any).__yutopia.room.state.weather.ice === 1, null, { timeout: 15_000 });
    await bia.waitForTimeout(2500);
    await face(bia);
    await bia.keyboard.down("KeyW");
    await bia.waitForTimeout(5000);
    await bia.keyboard.up("KeyW");
    const ice = await body(bia);
    expect(ice.swim, "on the ice, not in the water").toBeNull();
    expect(ice.level, "over the pond").not.toBeNull();
    expect(Math.abs((ice.level ?? 0) + 0.04 - ice.z), `at its top: ${ice.z}`).toBeLessThan(0.08);

    // ── freezing from open: the young ice near its edge gives under Ana ──
    await send(ana, "mod:ground", { to: "melt", now: true });
    await ana.waitForFunction(() => (window as any).__yutopia.room.state.weather.ice === 0, null, { timeout: 15_000 });
    await send(ana, "mod:ground", { to: "snow" });
    await ana.waitForFunction(
      () => {
        const i = (window as any).__yutopia.room.state.weather.ice;
        return i >= 0.16 && i < 0.22;
      },
      null,
      { timeout: 150_000, polling: 500 },
    );
    // (all of it thin while it's under 0.3: its band from the shore in — at 0.2 from about 0.8 of the
    // way across — stood on in its middle)
    await go(ana, G(POND.cx, POND.cz - POND.rz * 0.9));
    await ana.waitForFunction(() => (window as any).__yutopia.room.state.weather.holes !== "", null, {
      timeout: 15_000,
    });
    // (through it, into the water: over the shelf there, waded — under the ice's level)
    await ana.waitForFunction(
      () => {
        const w = (window as any).__yutopia;
        const b = w.walker.body;
        const wat = w.G.waterAt(b.x, b.y);
        return !!wat && b.z < wat.level - 0.3;
      },
      null,
      { timeout: 10_000 },
    );
  } finally {
    await send(ana, "mod:ground", { to: "snow", now: true }).catch(() => {});
    await send(ana, "mod:weather", { to: "cloudy", now: true }).catch(() => {});
  }
});

// The water heard (phase 9): Ana walks into the open pond — her steps the wades' recordings, the
// ankles' then the thighs' —, floats (treading heard), swims (a stroke's recordings in), dives (under's
// bed, the rest muffled), comes up after a while (a gasp's in), and walks out soaked (the drips off
// her, a squelch with her steps). What's heard read from the game's players.
test("the water heard: wading steps, treading and strokes afloat, under muffled, a gasp coming up, the drips out", async ({
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
  const beds = () => ana.evaluate(() => (window as any).__yutopia.life.sound.water.levels() as Record<string, number>);
  const held = () => ana.evaluate(() => (window as any).__yutopia.life.sound.water.held() as string[]);
  // the steps' banks in (their recordings): the wades', the squelch
  const banks = () =>
    ana.evaluate(() => {
      const st = (window as any).__yutopia.stepper;
      return Object.fromEntries(
        ["wade-shallow", "wade-deep", "soaked"].map((k) => [k, st?.ready.get(k)?.bufs.length ?? 0]),
      ) as Record<string, number>;
    });
  try {
    await send(ana, "mod:weather", { to: "clear", now: true });
    await send(ana, "mod:ground", { to: "melt", now: true });
    await ana.waitForFunction(() => (window as any).__yutopia.room.state.weather.ice === 0, null, { timeout: 15_000 });
    await go(ana, G(POND.cx, POND.cz - POND.rz - 6));
    await face(ana);
    // ── in: wading, then afloat ──
    await ana.keyboard.down("KeyW");
    await ana.waitForFunction(() => !!(window as any).__yutopia.walker.body.swim, null, { timeout: 20_000 });
    await ana.keyboard.up("KeyW");
    const wade = await banks();
    expect(wade["wade-shallow"] + wade["wade-deep"], `the wades' recordings: ${JSON.stringify(wade)}`).toBeGreaterThan(
      3,
    );
    // (afloat, still: treading)
    await ana.waitForFunction(() => ((window as any).__yutopia.life.sound.water.levels().tread ?? 0) > 0.2, null, {
      timeout: 15_000,
    });
    // (swimming on: a stroke's recordings in)
    await ana.keyboard.down("KeyW");
    await ana.waitForTimeout(3000);
    await ana.keyboard.up("KeyW");
    expect(await held(), "a stroke's").toContain("stroke-breast");
    // ── under: its bed, the rest muffled ──
    await ana.keyboard.press("KeyC");
    await ana.evaluate(() => {
      (window as any).__yutopia.tp.pitch = 0.9;
    });
    await ana.keyboard.down("KeyW");
    await ana.waitForFunction(() => ((window as any).__yutopia.life.sound.water.levels().under ?? 0) > 0.4, null, {
      timeout: 10_000,
    });
    await ana.waitForTimeout(4000);
    await ana.keyboard.up("KeyW");
    expect((await beds()).tread ?? 0, "no treading under").toBeLessThan(0.05);
    // ── up after a while: a gasp ──
    await ana.keyboard.press("KeyC");
    await ana.waitForFunction(() => !(window as any).__yutopia.walker.body.swim?.under, null, { timeout: 10_000 });
    await ana.waitForTimeout(800);
    expect(
      (await held()).some((s: string) => s.startsWith("gasp-")),
      "a gasp's",
    ).toBe(true);
    await ana.waitForFunction(() => ((window as any).__yutopia.life.sound.water.levels().under ?? 0) < 0.05, null, {
      timeout: 5_000,
    });
    // ── out, soaked: the drips, a squelch with her steps ──
    await face(ana, true);
    await ana.keyboard.down("KeyW");
    await ana.waitForFunction(
      () => {
        const w = (window as any).__yutopia;
        const b = w.walker.body;
        return !b.swim && !w.G.waterAt(b.x, b.y);
      },
      null,
      { timeout: 40_000 },
    );
    await ana.waitForTimeout(2500);
    await ana.keyboard.up("KeyW");
    expect((await beds())["drip-body"] ?? 0, "the drips off her").toBeGreaterThan(0.05);
    expect((await banks()).soaked, "a squelch's recordings").toBeGreaterThan(3);
  } finally {
    await send(ana, "mod:ground", { to: "snow", now: true }).catch(() => {});
    await send(ana, "mod:weather", { to: "cloudy", now: true }).catch(() => {});
  }
});
