/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The physics world in the browser (docs/plan/50-the-volume.md, phase 2): Ana, an admin, turns on
// the physics shapes from the Powers page by the company's gate — the browser's own world is built
// (the same data as the server's) and every solid near her is drawn over the 3D view, nothing
// refused. 3D: the GPU (YUTOPIA_GPU=1).

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });

test("the physics shapes: built in the browser, drawn round you, nothing refused", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  // by the gate: the fence (1.2 m), the gatehouse, the road
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-36, -352));
  await page.waitForTimeout(4000);
  await page.click("[data-me-menu] > button");
  await page.getByRole("menuitem", { name: /Run the place|Cuidar do lugar/ }).click();
  await page.getByRole("tab", { name: /Powers|Poderes/ }).click();
  await page.getByRole("button", { name: /^(Physics shapes|Formas da física)$/ }).click();
  const tag = page.getByText(/\d+ (bodies|corpos) (of|de) \d+/);
  await expect(tag).toBeVisible({ timeout: 30_000 });
  // (the building and the land round you: well over a hundred bodies, within the sizes)
  await expect
    .poll(async () => Number((await tag.textContent())?.match(/^(\d+)/)?.[1] ?? 0), { timeout: 20_000 })
    .toBeGreaterThan(100);
  await expect(page.getByText(/\d+ (refused|recusados)/)).toHaveCount(0);
  const drawn = await page.evaluate(() => {
    const d = (window as any).__yutopia.tp.physicsShown;
    return d ? d.counts() : null;
  });
  expect(drawn?.refused).toBe(0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/physics-shapes.png" });
  // off again: gone
  await page.evaluate(() => (window as any).__yutopia.tp.physicsDebug(false));
  await expect.poll(() => page.evaluate(() => !!(window as any).__yutopia.tp.physicsShown)).toBe(false);
});
