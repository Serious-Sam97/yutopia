/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { ANA, enter, test, token } from "./helpers";

// The look, phase 6 (docs/plan/33-the-look.md): review shots of what moves on the Grounds — the
// shuttle at the headquarters' stop, the visitor's car, the night guard with his flashlight
// (opt-in: YUTOPIA_SHOTS=<dir>). Pins the hour for everyone while it runs, then lets it go.
const dir = process.env.YUTOPIA_SHOTS;
if (dir) test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const G = (x: number, z: number) => ({ x: x + 60, y: z + 10, level: 0 });

test("the look: what moves, in the game", async ({ page }) => {
  test.skip(!dir, "YUTOPIA_SHOTS not set");
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", last3d: "3p", cam3p: "free", quality: "high" }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  const look = async (
    at: { x: number; z: number },
    from: { x: number; z: number },
    hour: number,
    pitch = 0.12,
    dist = 7,
  ) => {
    await page.evaluate((p) => (window as any).__yutopia.teleport(p), G(from.x, from.z));
    await page.waitForTimeout(6000);
    await page.evaluate(
      ([a, f, h, pi, d]) => {
        const t = (window as any).__yutopia.tp;
        t.setHour(h);
        t.yaw = Math.atan2(a.z - f.z, a.x - f.x);
        t.pitch = pi;
        t.dist = d;
      },
      [at, from, hour, pitch, dist] as const,
    );
    await page.waitForTimeout(2500);
  };
  try {
    // the shuttle, called to the headquarters' stop
    await page.evaluate(() => (window as any).__yutopia.room.send("mod:shuttle", {}));
    await page.waitForFunction(
      () => (window as any).__yutopia.room.state.vehicles.get("shuttle")?.stop === "hq",
      null,
      {
        timeout: 120_000,
      },
    );
    const bus = await page.evaluate(() => {
      const v = (window as any).__yutopia.room.state.vehicles.get("shuttle");
      return { x: v.x as number, z: v.z as number, a: v.a as number };
    });
    // (a vehicle's coords are the Grounds' own)
    const b = { x: bus.x, z: bus.z };
    await look(b, { x: b.x + Math.cos(bus.a + 0.9) * 9, z: b.z + Math.sin(bus.a + 0.9) * 9 }, 13, 0.1, 6);
    await page.screenshot({ path: `${dir}/shuttle-day.png` });
    await look(b, { x: b.x + Math.cos(bus.a + 0.9) * 9, z: b.z + Math.sin(bus.a + 0.9) * 9 }, 21, 0.1, 6);
    await page.screenshot({ path: `${dir}/shuttle-night.png` });
    // the night guard, after dark (the hour pinned so he's out)
    await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 23 }));
    await page.waitForTimeout(3000);
    const guard = await page.evaluate(() => {
      let g: { x: number; y: number } | null = null;
      (window as any).__yutopia.room.state.npcs.forEach((n: any) => {
        if (n.kind === "guard") g = { x: n.x, y: n.y };
      });
      return g as { x: number; y: number } | null;
    });
    if (guard) {
      // (he walks on: near him, then turned to where he is now)
      await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: guard.x, y: guard.y, level: 0 });
      await page.waitForTimeout(5000);
      // (on his round again, where he is now: a few tiles behind him)
      await page.evaluate(() => {
        const c = (window as any).__yutopia;
        c.room.state.npcs.forEach((n: any) => {
          if (n.kind === "guard")
            c.teleport({
              x: n.x - Math.cos(n.a) * 9 + Math.sin(n.a) * 2,
              y: n.y - Math.sin(n.a) * 9 - Math.cos(n.a) * 2,
              level: 0,
            });
        });
      });
      await page.waitForTimeout(1500);
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => {
          const c = (window as any).__yutopia;
          let g: { x: number; y: number } | null = null;
          c.room.state.npcs.forEach((n: any) => {
            if (n.kind === "guard") g = { x: n.x, y: n.y };
          });
          const m = c.meTile();
          const t = c.tp;
          t.setHour(23);
          if (g) t.yaw = Math.atan2((g as any).y - m.y, (g as any).x - m.x);
          t.pitch = 0.75;
          t.dist = 13;
        });
        await page.waitForTimeout(250);
      }
      await page.screenshot({ path: `${dir}/guard-night.png` });
    }
  } finally {
    await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: null }));
  }
});
