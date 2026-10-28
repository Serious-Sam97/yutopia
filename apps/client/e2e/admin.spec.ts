/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, API, BIA, enter, test, token, useWorld } from "./helpers";

// Run the place (docs/plan/48-the-admin.md): for admins only. Bia — a member — has no menu item,
// no panel, no quick box, the API answers her 403 and the world server ignores her powers; Ana
// opens the panel from her face's menu, flies (the server takes her up), goes invisible (Bia's
// game neither lists nor draws her) and comes back, and her powers are in the log.
const mine = (page: Page) =>
  page.evaluate(() => {
    const r = (window as any).__yutopia.room;
    const p = r.state.players.get(r.sessionId);
    return { powers: p.powers as number, z: p.z as number };
  });

test("Run the place: admins only — the panel, flying, invisible, the log", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const space = await useWorld("demo");
  // a member first: nothing of it
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bia = await ctx.newPage();
  const biaToken = await token(BIA);
  await enter(bia, biaToken, space);
  await bia.click("[data-me-menu] > button");
  await expect(bia.getByRole("menuitem", { name: /Run the place|Cuidar do lugar/ })).toHaveCount(0);
  await bia.keyboard.press("Escape");
  await bia.evaluate(() => {
    const r = (window as any).__yutopia.room;
    r.send("mod:power", { power: "fly", on: true });
    (window as any).__hud.set({ panel: { kind: "admin" } });
  });
  await bia.keyboard.press("Backquote");
  await bia.waitForTimeout(1200);
  expect((await mine(bia)).powers, "no powers for a member").toBe(0);
  await expect(bia.getByRole("dialog")).toHaveCount(0);
  await expect(bia.locator("[data-admin-box]")).toHaveCount(0);
  for (const path of ["/api/admin/members", "/api/admin/log", "/api/admin/invites"]) {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${biaToken}`, Accept: "application/json" },
    });
    expect(res.status, path).toBe(403);
  }
  await bia.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));

  // the admin
  await enter(page, await token(ANA), space);
  await page.click("[data-me-menu] > button");
  await page.getByRole("menuitem", { name: /Run the place|Cuidar do lugar/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("tab", { name: /Powers|Poderes/ }).click();
  await page.getByRole("button", { name: /^(Fly|Voar)$/ }).click();
  await expect.poll(async () => (await mine(page)).powers & 1).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-admin-strip]")).toBeVisible();
  const z0 = (await mine(page)).z;
  await page.keyboard.down("Space");
  await page.waitForTimeout(1200);
  await page.keyboard.up("Space");
  // (indoors: up as far as the ceiling lets me — the studio's the top floor, under the roof)
  await expect
    .poll(async () => (await mine(page)).z - z0, { message: "up in the air, as the server has it" })
    .toBeGreaterThan(1.2);

  // invisible: gone from Bia's list and view, back when it's off
  const anaSid = await page.evaluate(() => (window as any).__yutopia.room.sessionId);
  const seen = () =>
    bia.evaluate(
      (sid) => [
        (window as any).__hud.get().people.some((p: any) => p.sid === sid),
        !!(window as any).__yutopia.model?.hasAvatar(sid),
      ],
      anaSid,
    );
  await page.keyboard.press("Backquote");
  await page.keyboard.type("hide");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await mine(page)).powers & 8).toBe(8);
  await expect.poll(seen).toEqual([false, false]);
  await page.evaluate(() => {
    const r = (window as any).__yutopia.room;
    for (const k of ["hidden", "fly"]) r.send("mod:power", { power: k, on: false });
  });
  await expect.poll(async () => (await mine(page)).powers).toBe(0);
  await expect.poll(seen).toEqual([true, true]);

  // the log has them
  await page.evaluate(() => (window as any).__hud.set({ panel: { kind: "admin" } }));
  await page.getByRole("tab", { name: /The log|O registro/ }).click();
  await expect(page.getByText(/used a power: hidden|usou um poder: hidden/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/used a power: fly|usou um poder: fly/).first()).toBeVisible();
  await ctx.close();
});
