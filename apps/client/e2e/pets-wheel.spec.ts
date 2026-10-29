/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// The wheel and "get him" (docs/plan/52-the-pet-two.md D6–D8), two browsers: Ana holds T, points at
// "Stay" and lets go — Rex stays; "Follow" from the panel's command row; then "Get him!" on the wheel
// — Rex runs to Bia, she's down and her client won't walk; "Leave it" in the panel and she's up.
// On the machine's GPU: YUTOPIA_GPU=1; YUTOPIA_SHOTS=<dir> saves its pictures. The dog's let go at the end.
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const rex = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    const p = [...c.room.state.pets.values()].find((x: any) => x.sid === c.room.sessionId) as any;
    return p ? { id: p.id as string, mode: p.mode as string, act: p.act as string } : null;
  });
const self = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    const p = c.room.state.players.get(c.room.sessionId);
    return {
      x: p.x as number,
      y: p.y as number,
      uid: p.uid as number,
      bitBy: p.bitBy as string,
      fellAt: p.fellAt as number,
    };
  });
const release = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    c.room.state.pets.forEach((p: any) => p.sid === c.room.sessionId && c.send("pet:release", { id: p.id }));
  });
/** Hold T, the pointer onto a word of the wheel, let go. */
async function wheel(page: Page, word: string, shot?: string) {
  await page.mouse.move(640, 400);
  await page.keyboard.down("KeyT");
  const b = page.locator(`[data-wheel="${word}"]`);
  await expect(b).toBeVisible({ timeout: 5000 });
  const box = await b.boundingBox();
  if (!box) throw new Error("no wheel");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
  if (shot && dir) await page.screenshot({ path: `${dir}/${shot}.png` });
  await page.keyboard.up("KeyT");
  await expect(page.locator("[data-pet-wheel]")).toHaveCount(0);
}

test("the wheel's words, the panel's row, and get him on Bia till Ana calls it off", async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const bia = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await enter(ana, await token(ANA));
  await enter(bia, await token(BIA));
  try {
    await release(ana);
    await ana.evaluate(() => (window as any).__yutopia.send("pet:adopt", { species: "dog", name: "Rex" }));
    await expect.poll(async () => (await rex(ana))?.mode).toBe("follow");
    // the wheel: Stay (said twice, as a dog may not mind the first)
    await wheel(ana, "stay", "game-wheel");
    if ((await rex(ana))?.mode !== "stay") await wheel(ana, "stay");
    await expect.poll(async () => (await rex(ana))?.mode, { timeout: 5000 }).toBe("stay");
    // the panel's command row: Follow
    await ana.evaluate(() => (window as any).__hud.set({ panel: { kind: "pets" } }));
    const row = ana.locator("[data-pet-commands]");
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /follow me/i }).click();
    if ((await rex(ana))?.mode !== "follow") await row.getByRole("button", { name: /follow me/i }).click();
    await expect.poll(async () => (await rex(ana))?.mode, { timeout: 5000 }).toBe("follow");
    if (dir) await ana.screenshot({ path: `${dir}/game-panel-care.png` });
    await ana.getByRole("button", { name: /^mind$/i }).click();
    await expect(ana.getByText(/your days/i)).toBeVisible();
    if (dir) await ana.screenshot({ path: `${dir}/game-panel-mind.png` });
    await ana.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
    // Bia comes over; Get him!
    const anaUid = (await self(ana)).uid;
    await bia.evaluate((u) => (window as any).__yutopia.send("teleport", { to: { userId: u } }), anaUid);
    await expect
      .poll(async () => {
        const [a, b] = [await self(ana), await self(bia)];
        return Math.hypot(a.x - b.x, a.y - b.y);
      })
      .toBeLessThan(4);
    await ana.waitForTimeout(1500);
    await wheel(ana, "attack");
    if ((await self(bia)).bitBy === "") await wheel(ana, "attack");
    await expect.poll(async () => (await self(bia)).bitBy, { timeout: 10_000 }).not.toBe("");
    // down, and she can't walk off
    const at = await self(bia);
    await bia.evaluate((p) => (window as any).__yutopia.walkTo(p), { x: at.x + 4, y: at.y });
    await bia.waitForTimeout(4500);
    const still = await self(bia);
    expect(Math.hypot(still.x - at.x, still.y - at.y), "held down").toBeLessThan(0.5);
    expect(still.bitBy).not.toBe("");
    if (dir) await bia.screenshot({ path: `${dir}/game-gethim-bia.png` });
    if (dir) await ana.screenshot({ path: `${dir}/game-gethim-ana.png` });
    // Leave it (the panel's row): up again
    await ana.evaluate(() => (window as any).__hud.set({ panel: { kind: "pets" } }));
    await ana
      .locator("[data-pet-commands]")
      .getByRole("button", { name: /leave it/i })
      .click();
    await expect.poll(async () => (await self(bia)).bitBy, { timeout: 5000 }).toBe("");
  } finally {
    await release(ana);
  }
});
