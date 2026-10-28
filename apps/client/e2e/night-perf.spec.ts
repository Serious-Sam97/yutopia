/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The night's frame check (docs/plan/44-the-night.md, phase 5), on High at 23:00 on the machine's
// GPU (YUTOPIA_GPU=1; the numbers are printed either way):
// - no shader linked when a car's headlamps come on, nor while the eyes adjust (the lamps are the
//   same two spots always there; the eyes only uniforms);
// - driving on the lot with the headlamps on, and on the lawn in a night blizzard with the torch
//   on: ≥ 57 fps (rAF at the display's 60), p95 under 20 ms.
// Ana leaves the car where it stopped; the storm goes back to the schedule.

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const hold = (page: Page, h: number) =>
  page.evaluate((hh) => {
    const c = (window as any).__yutopia;
    c.updateNight = () => {};
    c.hour = hh;
    c.model.setClock(hh);
    c.tp?.setHour(hh);
  }, h);
const programs = (page: Page) =>
  page.evaluate(() => (window as any).__yutopia.tp.renderer.info.programs.length as number);
/** `ms` of frames: fps, p95, worst. */
async function frames(page: Page, ms: number) {
  const out = (await page.evaluate(
    (span) =>
      new Promise<number[]>((done) => {
        const f: number[] = [];
        let last = performance.now();
        const t0 = last;
        const tick = (t: number) => {
          f.push(t - last);
          last = t;
          if (t - t0 < span) requestAnimationFrame(tick);
          else done(f.slice(1));
        };
        requestAnimationFrame(tick);
      }),
    ms,
  )) as number[];
  const sorted = [...out].sort((a, b) => a - b);
  return {
    fps: (out.length * 1000) / out.reduce((a, b) => a + b, 0),
    p95: sorted[Math.floor(sorted.length * 0.95)],
    worst: sorted[sorted.length - 1],
  };
}

test("the night on High: headlamps and the eyes link no shader; driving and a night blizzard keep 60 fps", async ({
  page,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", quality: "high" }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia?.tp && !!(window as any).__yutopia?.cars, null, {
    timeout: 60_000,
  });
  await hold(page, 23);
  // a lot car in its bay (the lot as it should be: an admin's)
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
  await page.waitForTimeout(800);
  const car = await page.evaluate(() => {
    const c = (window as any).__yutopia;
    const out: any[] = [];
    c.room.state.objects.forEach((o: any) => {
      const p = JSON.parse(o.props);
      if (o.kind !== "car" || p.driven || p.model === "offroad") return;
      const w = o.rot % 2 ? 2 : 5;
      const h = o.rot % 2 ? 5 : 2;
      out.push({
        x: o.x + w / 2 + (p.dx ?? 0),
        y: o.y + h / 2 + (p.dz ?? 0),
        a: Math.PI + (o.rot % 4) * (Math.PI / 2),
      });
    });
    return out[0];
  });
  const nose = (k: number) => ({ x: car.x + Math.cos(car.a) * k, y: car.y + Math.sin(car.a) * k });
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), nose(4));
  await page.waitForTimeout(4000);
  await hold(page, 23);
  await page.waitForTimeout(2000);
  const before = await programs(page);
  // in (by its nose; a free bay across the aisle offers itself instead — docs/plan/43: closer then)
  for (const k of [3.4, 2.9, 2.5]) {
    await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), nose(k));
    const ok = await page
      .waitForFunction(() => /^car/.test((window as any).__hud.get().prompt?.kind ?? ""), null, { timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
  }
  await page.evaluate(() => (window as any).__yutopia.interact());
  await expect
    .poll(
      () => page.evaluate(() => Math.max(0, ...(window as any).__yutopia.tp.carBeams.map((s: any) => s.intensity))),
      {
        timeout: 10_000,
      },
    )
    .toBeGreaterThan(0);
  await page.waitForTimeout(2000);
  // in the car: its lamps off (L: low → high → off), then on again — nothing linked between
  await page.keyboard.press("KeyL");
  await page.waitForTimeout(300);
  await page.keyboard.press("KeyL");
  await expect
    .poll(
      () => page.evaluate(() => Math.max(0, ...(window as any).__yutopia.tp.carBeams.map((s: any) => s.intensity))),
      {
        timeout: 5000,
      },
    )
    .toBe(0);
  await page.waitForTimeout(1500);
  const dark = await programs(page);
  await page.keyboard.press("KeyL");
  await expect
    .poll(
      () => page.evaluate(() => Math.max(0, ...(window as any).__yutopia.tp.carBeams.map((s: any) => s.intensity))),
      {
        timeout: 5000,
      },
    )
    .toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  const lamps = await programs(page);
  // driving out with them on
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1200);
  await page.keyboard.up("KeyW");
  const drive = await frames(page, 5000);
  await page.keyboard.down("Space");
  await page.waitForTimeout(800);
  await page.keyboard.up("Space");
  console.log(
    `[night-perf] driving, headlamps on: ${drive.fps.toFixed(1)} fps, p95 ${drive.p95.toFixed(1)} ms, worst ${drive.worst.toFixed(1)} ms`,
  );
  // out, on the lawn: the eyes adjust; a blizzard called up, the torch on
  await page.evaluate(() => (window as any).__yutopia.interact());
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -40, y: -30, level: 0 }));
  await page.waitForFunction(() => (window as any).__yutopia.tp?.around?.grounds?.left.blocks === 0, null, {
    timeout: 60_000,
  });
  await hold(page, 23);
  await page.waitForTimeout(12_000);
  const eyes = await page.evaluate(() => (window as any).__yutopia.tp.around.eyes as number);
  const adjusted = await programs(page);
  try {
    await page.evaluate(() => {
      const c = (window as any).__yutopia;
      c.room.send("mod:storm", { storm: 1, now: true });
      if (!c.room.state.players.get(c.room.sessionId).torch) c.toggleTorch();
    });
    await page.waitForFunction(() => (window as any).__yutopia.room.state.storm > 0.99, null, { timeout: 10_000 });
    await page.waitForTimeout(3000);
    const storm = await frames(page, 5000);
    console.log(
      `[night-perf] a night blizzard, the torch on: ${storm.fps.toFixed(1)} fps, p95 ${storm.p95.toFixed(1)} ms, worst ${storm.worst.toFixed(1)} ms`,
    );
    console.log(
      `[night-perf] programs: before the car ${before}, in it lamps off ${dark}, on ${lamps}, eyes ${eyes.toFixed(2)} ${adjusted}`,
    );
    expect(lamps, "no shader linked for the headlamps coming on").toBe(dark);
    expect(eyes, "the eyes adjusting").toBeGreaterThan(0.05);
    expect(adjusted, "no shader linked for the eyes").toBe(lamps);
    expect(drive.fps).toBeGreaterThan(57);
    expect(drive.p95).toBeLessThan(20);
    expect(storm.fps).toBeGreaterThan(57);
    expect(storm.p95).toBeLessThan(20);
  } finally {
    await page.evaluate(() => {
      const c = (window as any).__yutopia;
      c.room?.send("mod:storm", { storm: null, now: true });
      if (c.room?.state.players.get(c.room.sessionId)?.torch) c.toggleTorch();
    });
  }
});
