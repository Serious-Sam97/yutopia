/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// Life on the Grounds (docs/plan/27-the-grounds.md, phase 6): two people ride
// the shuttle from the headquarters' stop to the town square and back — both
// in 3D (the first one's frames measured on the machine's GPU with YUTOPIA_GPU=1). It needs only the building, so no fixture is put back.
const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
if (GPU || dir) test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const OFF = { x: -60, y: -10 }; // the ground floor's corner in the studio's coords

// (`quality`: the second rider on Lowest — her browser streaming the town in stalls the first's frames)
async function open(page: Page, who: typeof ANA, view: "3p" | "1p", quality = "high") {
  await page.addInitScript(
    ([v, q]) => {
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, view: v, cam3p: "chase", quality: q }));
      const W = window as any;
      W.__worst = 0;
      let last = performance.now();
      const tick = (t: number) => {
        W.__worst = Math.max(W.__worst, t - last);
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    [view, quality],
  );
  await enter(page, await token(who));
  if (view === "3p") await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
}
const bus = (page: Page) =>
  page.evaluate(() => {
    const v = (window as any).__yutopia.room.state.vehicles.get("shuttle");
    return { x: v.x as number, z: v.z as number, stop: v.stop as string, riders: v.riders as number };
  });
const me = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    const p = c.room.state.players.get(c.room.sessionId);
    return { x: p.x as number, y: p.y as number, busy: p.busy as string, level: p.level as number };
  });
// to the shuttle's side at its stop, and on (the X prompt)
async function board(page: Page) {
  const b = await bus(page);
  await page.evaluate((at) => (window as any).__yutopia.teleport({ ...at, level: 0 }), {
    x: b.x - OFF.x + 2.6,
    y: b.z - OFF.y,
  });
  await page.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "ride", null, { timeout: 20_000 });
  await page.evaluate(() => (window as any).__yutopia.interact());
  await page.waitForFunction(
    () => {
      const c = (window as any).__yutopia;
      return c.room.state.players.get(c.room.sessionId)?.busy === "ride:shuttle";
    },
    null,
    { timeout: 10_000 },
  );
}
const worst = (page: Page) =>
  page.evaluate(() => {
    const W = window as any;
    const v = W.__worst;
    W.__worst = 0;
    return v as number;
  });

test("the shuttle: two ride from the headquarters to the town square and back", async ({ page, browser }) => {
  test.setTimeout(480_000);
  const a = page;
  const b = await (await browser.newContext()).newPage();
  await open(a, ANA, "3p");
  await open(b, BIA, "3p", "lowest");
  // (an admin calls it to the headquarters' stop: no waiting on its timetable)
  await a.evaluate(() => (window as any).__yutopia.room.send("mod:shuttle", {}));
  await a.waitForFunction(() => (window as any).__yutopia.room.state.vehicles.get("shuttle")?.stop === "hq", null, {
    timeout: 10_000,
  });
  for (const there of ["town", "hq"] as const) {
    await board(a);
    await board(b);
    expect((await bus(a)).riders).toBe(2);
    await worst(a);
    // off it goes; at the other stop they're let off at the kerb
    await a.waitForFunction(
      (s) => {
        const c = (window as any).__yutopia;
        return (
          c.room.state.vehicles.get("shuttle")?.stop === s && c.room.state.players.get(c.room.sessionId)?.busy === ""
        );
      },
      there,
      { timeout: 200_000 },
    );
    const w = await worst(a);
    console.log(`[shuttle] 3p: worst frame on the ride to ${there}: ${Math.round(w)} ms`);
    if (GPU) expect(w, `worst frame riding to ${there}`).toBeLessThan(50);
    await b.waitForFunction(() => {
      const c = (window as any).__yutopia;
      return c.room.state.players.get(c.room.sessionId)?.busy === "";
    });
    for (const p of [a, b]) {
      const m = await me(p);
      const bx = m.x + OFF.x;
      const bz = m.y + OFF.y;
      if (there === "town") expect(Math.hypot(bx - 412, bz + 401), `off at the square: ${bx}, ${bz}`).toBeLessThan(10);
      else expect(Math.hypot(bx + 45, bz + 19), `off at the headquarters: ${bx}, ${bz}`).toBeLessThan(10);
      expect(m.level).toBe(0);
    }
    if (dir) {
      await a.screenshot({ path: `${dir}/shuttle-${there}-3p.png` });
      await b.screenshot({ path: `${dir}/shuttle-${there}-bia.png` });
    }
    // (it waits at the stop for the way back)
    expect((await bus(a)).stop).toBe(there);
  }
});
