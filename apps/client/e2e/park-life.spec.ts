/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { KART_SITTING, KART_STANDS, kartSeats } from "../../../packages/shared/src/kart/park.ts";
import { ANA, enter, test, token } from "./helpers";

// The Kart Park's people and seats in the game (docs/plan/46-the-karts.md, "the park's people"):
// the folk drawn; a bench by the fire walked onto and sat on, walked off; X by the
// stands, a seat up a row. Review shots: YUTOPIA_SHOTS=<dir>. (It moves Ana about the dev world.)

const dir = process.env.YUTOPIA_SHOTS;
if (process.env.YUTOPIA_FIREFOX !== "1")
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, z: number) => ({ x: x + 60, y: z + 10 });
const seats = kartSeats();

async function open(page: Page, view: "3p" | "1p") {
  await page.addInitScript((v) => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: v, cam3p: "chase" }));
  }, view);
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
}
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};
const mine = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    const me = w.room.state.players.get(w.room.sessionId);
    return { busy: me.busy as string, a: me.a as number, x: me.x as number, y: me.y as number, z: me.z as number };
  });
async function go(page: Page, x: number, z: number) {
  const p = G(x, z);
  await page.evaluate((q) => (window as any).__yutopia.teleport({ ...q, level: 0 }), p);
  await page.waitForFunction(
    (q) => {
      const w = (window as any).__yutopia;
      const me = w.room.state.players.get(w.room.sessionId);
      return !!me && Math.hypot(me.x - q.x, me.y - q.y) < 1.5;
    },
    p,
    { timeout: 20_000 },
  );
}
const prompt = (page: Page, kind: string) =>
  page.waitForFunction((k) => (window as any).__hud.get().prompt?.kind === k, kind, { timeout: 30_000 });

for (const view of ["3p"] as const)
  test(`the park's people in ${view}: the folk drawn, a bench by the fire, a seat in the stands`, async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, view);
    // the fire's north bench (the visitors sit on the other two), as the office's: walked onto
    // and stood still on, sat on; a way held, walked off
    const bench = seats.find((s) => s.stand === undefined && Math.abs(Math.sin(s.a)) > 0.5);
    expect(bench).toBeTruthy();
    if (!bench) return;
    await go(page, bench.out[0], bench.out[1]);
    await page.waitForFunction(() => (window as any).__yutopia.room.state.npcs.get("folk-lia"), null, {
      timeout: 20_000,
    });
    await prompt(page, "park:sit");
    await go(page, bench.x, bench.z);
    await page.waitForFunction(
      (b) => {
        const w = (window as any).__yutopia;
        return w.room.state.players.get(w.room.sessionId)?.busy === b;
      },
      KART_SITTING,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(2500);
    const sat = await mine(page);
    expect(sat.a).toBe(2);
    expect(Math.hypot(sat.x - G(bench.x, bench.z).x, sat.y - G(bench.x, bench.z).y)).toBeLessThan(0.05);
    await shot(page, `park-life-${view}-fire`);
    // walked off it
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(700);
    await page.keyboard.up("KeyW");
    await page.waitForFunction(
      () => {
        const w = (window as any).__yutopia;
        return w.room.state.players.get(w.room.sessionId)?.busy === "";
      },
      null,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(600);
    const up = await mine(page);
    expect(up.a).not.toBe(2);
    expect(Math.hypot(up.x - sat.x, up.y - sat.y), "walked off").toBeGreaterThan(0.3);
    await page.waitForTimeout(1200);
    expect((await mine(page)).busy, "not sat down again").toBe("");
    // the stands: from the front of the nearer one, a seat up a row or two
    const st = KART_STANDS[0];
    await go(page, (st.x0 + st.x1) / 2 + 0.3, st.z - 0.9);
    await prompt(page, "park:sit");
    await page.keyboard.press("x");
    await page.waitForFunction(
      (b) => {
        const w = (window as any).__yutopia;
        return w.room.state.players.get(w.room.sessionId)?.busy === b;
      },
      KART_SITTING,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(2500);
    await shot(page, `park-life-${view}-stands`);
    await prompt(page, "park:stand");
    await page.keyboard.press("x");
    await page.waitForFunction(
      () => {
        const w = (window as any).__yutopia;
        return w.room.state.players.get(w.room.sessionId)?.busy === "";
      },
      null,
      { timeout: 10_000 },
    );
  });
