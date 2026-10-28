/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, walkTo } from "./helpers";

// The farm (docs/plan/31-the-day.md, phase 1): in 3D, down the lane
// from the square, in at the barn's doors and out again, then up a row of
// the cornfield — the land streamed in with no long frame (the machine's GPU:
// YUTOPIA_GPU=1). Review shots: YUTOPIA_SHOTS=<dir>.

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
// the ground floor's corner is at (-60, -10) in the building's coords
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });

async function open(page: Page, view: "3p" | "1p") {
  await page.addInitScript((v) => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: v, cam3p: "chase" }));
    const W = window as any;
    W.__worst = 0;
    let last = performance.now();
    const tick = (t: number) => {
      W.__worst = Math.max(W.__worst, t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, view);
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    y.updateNight = () => {};
    y.room.send("mod:hour", { h: 12 });
  });
}
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};
const worst = (page: Page) =>
  page.evaluate(() => {
    const W = window as any;
    const v = W.__worst;
    W.__worst = 0;
    return v as number;
  });
// where the HUD says I am (the Grounds' rooms: shared grounds.ts placeAt)
const area = (page: Page) => page.evaluate(() => (window as any).__hud.get().me?.areaName as string | undefined);

for (const view of ["3p"] as const)
  test(`the farm in ${view}: down the lane, into the barn and out, up a row of the corn`, async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, view);
    // the square, then down the lane
    const sq = G(420, -380);
    await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), sq);
    await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
    await page.waitForTimeout(3000);
    await worst(page);
    const door = G(436, -311);
    await walkTo(page, door.x, door.y, 60_000);
    const w = await worst(page);
    console.log(`[farm] ${view}: worst frame down the lane: ${Math.round(w)} ms`);
    if (GPU) expect(w, "worst frame down the lane").toBeLessThan(50);
    await shot(page, `farm-${view}-barn-doors`);
    // in at the doors: the barn's room
    const inside = G(446, -311);
    await walkTo(page, inside.x, inside.y, 30_000);
    await expect.poll(() => area(page)).toBe("Barn");
    await shot(page, `farm-${view}-barn-inside`);
    // (3D: looking up, the roof's underside and its trusses — not the sky)
    if (view === "3p") {
      // (first person, looking up: the chase camera's always looking down at you)
      await page.keyboard.press("KeyY");
      await page.waitForTimeout(600);
      await page.evaluate(() => {
        (window as any).__yutopia.tp.pitch = -0.7;
      });
      await page.waitForTimeout(800);
      await shot(page, "farm-3p-barn-roof");
      await page.keyboard.press("KeyY");
      await page.waitForTimeout(600);
    }
    // the farmhouse: in by its front door, furnished
    await walkTo(page, door.x, door.y, 30_000);
    const porch = G(447, -264.5);
    await walkTo(page, porch.x, porch.y, 40_000);
    const room = G(447, -257);
    await walkTo(page, room.x, room.y, 30_000);
    await expect.poll(() => area(page)).toBe("Farmhouse");
    await shot(page, `farm-${view}-farmhouse`);
    await walkTo(page, porch.x, porch.y, 30_000);
    // out again, round to the field's gate (its east side, the lane's) and up a row
    await walkTo(page, door.x, door.y, 30_000);
    const gate = G(417, -267);
    await walkTo(page, gate.x, gate.y, 60_000);
    const row = G(411, -300);
    await walkTo(page, row.x, row.y, 60_000);
    const at = await page.evaluate(() => (window as any).__yutopia.meTile());
    expect(Math.hypot(at.x - row.x, at.y - row.y), "up the row").toBeLessThan(1.5);
    await shot(page, `farm-${view}-corn`);
    const w2 = await worst(page);
    if (GPU) expect(w2, "worst frame in the corn").toBeLessThan(50);
  });
