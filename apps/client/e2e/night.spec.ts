/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, walkTo } from "./helpers";

// The Grounds' mood (docs/plan/27-the-grounds.md, phase 5), with two people:
// the same storm at the same moment for both (the server times it), and at
// night A's flashlight lights B out in the woods. It needs only the building
// (every world has it), so no fixture is put back; the storm goes back to the
// schedule at the end.

// the ground floor's corner is at (-60, -10) in the studio's coords
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });

async function open(page: Page, who: typeof ANA) {
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "iso" }));
  });
  await enter(page, await token(who));
}
// (out on the land: the Grounds are mounted on the ground floor)
const goTo = async (page: Page, at: { x: number; y: number }) => {
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at);
  await page.waitForFunction(() => (window as any).__yutopia.engine?.grounds?.land.visible, null, { timeout: 60_000 });
  await page.waitForTimeout(2500);
};
const storm = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    return { server: c.room.state.storm as number, here: c.storm as number };
  });

test("the mood: the same storm for both at once; A's flashlight lights B at night", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const a = page;
  const b = await (await browser.newContext()).newPage();
  await open(a, ANA);
  await open(b, BIA);
  try {
    // ── a storm called up (an admin): both in it, together ──
    await a.evaluate(() => (window as any).__yutopia.room.send("mod:storm", { storm: 1, now: true }));
    await a.waitForFunction(() => (window as any).__yutopia.room.state.storm > 0.99, null, { timeout: 10_000 });
    await b.waitForFunction(() => (window as any).__yutopia.room.state.storm > 0.99, null, { timeout: 10_000 });
    // (each eases into it; once in, the same)
    await a.waitForTimeout(1500);
    const [sa, sb] = [await storm(a), await storm(b)];
    expect(sa.here, "A is in the storm").toBeGreaterThan(0.95);
    expect(sb.here, "B is in the storm").toBeGreaterThan(0.95);
    // and sent off: both out of it
    await a.evaluate(() => (window as any).__yutopia.room.send("mod:storm", { storm: 0, now: true }));
    await b.waitForFunction(() => (window as any).__yutopia.room.state.storm < 0.01, null, { timeout: 10_000 });

    // ── night in the woods: A a few steps from B, turned to her, the flashlight on ──
    // (along a screen axis — iso faces eight ways on screen: B straight below A)
    await goTo(b, G(-150, 6));
    await goTo(a, G(-155, 1));
    await walkTo(a, G(-154, 2).x, G(-154, 2).y, 20_000);
    for (const p of [a, b])
      await p.evaluate(() => {
        const c = (window as any).__yutopia;
        c.updateNight = () => {};
        c.engine.setClock(23);
      });
    const lightOnB = () =>
      b.evaluate(() => {
        const c = (window as any).__yutopia;
        const m = c.meTile();
        const g = c.engine.grounds;
        // her light, and the light a few steps to her side (off the beam)
        return { on: g.lightAt(m.x + 0.5, m.y + 0.5), off: g.lightAt(m.x + 0.5, m.y + 6.5) };
      });
    const lum = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.55 + (c & 255) * 0.15;
    const dark = await lightOnB();
    expect(lum(dark.on), "no beam: she's in the dark as the woods round her").toBeLessThan(lum(dark.off) + 4);
    await a.evaluate(() => (window as any).__yutopia.toggleTorch());
    await b.waitForFunction(
      () => {
        const c = (window as any).__yutopia;
        return [...c.room.state.players.values()].some((p: any) => p.torch);
      },
      null,
      { timeout: 10_000 },
    );
    await b.waitForTimeout(500);
    const lit = await lightOnB();
    expect(lum(lit.on), "A's beam lights her").toBeGreaterThan(lum(dark.on) + 40);
    expect(lum(lit.off), "beside the beam: still dark").toBeLessThan(lum(dark.off) + 4);
    if (process.env.YUTOPIA_SHOTS) await b.screenshot({ path: `${process.env.YUTOPIA_SHOTS}/night-beam.png` });
  } finally {
    await a.evaluate(() => {
      const c = (window as any).__yutopia;
      c.room?.send("mod:storm", { storm: null, now: true });
      if (c.room?.state.players.get(c.room.sessionId)?.torch) c.toggleTorch();
    });
  }
});
