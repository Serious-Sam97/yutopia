/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, clearDrafts, enter, holdHour, makeDraft, test, token, useWorld } from "./helpers";

// God mode's select tool (docs/plan/53-the-god-mode.md; the mock 08-select), on Low on the dev
// stack, by the farm: the generator's own picked — the farmhouse (its panel, its name), let go with
// Esc; the farm lane (a way: its name, Edit points), taken away with Delete and back with undo; a
// click on the empty field picks nothing and puts nothing down. Nothing's published: the draft's deleted.
const FIELD = { x: 446.5, z: -238.5 };
const god = (page: Page) => page.evaluate(() => (window as any).__hud.get().god);
const toScreen = (page: Page, x: number, z: number) =>
  page.evaluate(
    ([gx, gz]) => {
      const y = (window as any).__yutopia;
      const t = y.tp;
      const f = t.groundsFrame();
      const v = t.camera.position
        .clone()
        .set(gx - f.x, y.G.terrainAt(gx, gz) + f.y, gz - f.z)
        .project(t.camera);
      const r = t.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    [x, z],
  );
const clickAt = async (page: Page, x: number, z: number) => {
  const p = await toScreen(page, x, z);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(400);
};
const hasWay = (page: Page, key: string) =>
  page.evaluate((k) => (window as any).__yutopia.G.WAYS.some((w: any) => w.key === k), key);

test("God mode's select: the farmhouse and the farm lane picked; the lane taken away and back", async ({ page }) => {
  test.setTimeout(240_000);
  const space = await useWorld("demo");
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
  });
  const tok = await token(ANA);
  await clearDrafts(tok);
  await makeDraft(tok, "e2e: select");
  await enter(page, tok, space);
  await holdHour(page, 13);
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: FIELD.x + 60, y: FIELD.z + 10, level: 0 });
  await page.waitForTimeout(4000);
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 15_000 }).toBe(true);
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(2500);
  await page.keyboard.press("1");
  expect((await god(page)).tool).toBe("select");

  // the farmhouse: picked, its panel; Esc lets it go
  const farm = await page.evaluate(() => {
    const b = (window as any).__yutopia.G.BUILDINGS.find((x: any) => x.key === "farmhouse");
    return { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, name: b.name as string };
  });
  await clickAt(page, farm.x, farm.z);
  await expect.poll(() => god(page).then((g) => [g.picked, g.buildings.sel?.key])).toEqual(["building", "farmhouse"]);
  await expect(page.getByText(farm.name).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(() => god(page).then((g) => g.picked)).toBeNull();
  expect((await god(page)).on, "Esc let it go, not out of god mode").toBe(true);

  // the farm lane: picked by its line (the middle of the segment nearest the field)
  const lane = await page.evaluate(
    ([fx, fz]) => {
      const w = (window as any).__yutopia.G.WAYS.find((x: any) => x.key === "farm-lane");
      let best = { x: 0, z: 0, d: Infinity };
      for (let i = 1; i < w.pts.length; i++) {
        const x = (w.pts[i - 1][0] + w.pts[i][0]) / 2;
        const z = (w.pts[i - 1][1] + w.pts[i][1]) / 2;
        const d = Math.hypot(x - fx, z - fz);
        if (d < best.d) best = { x, z, d };
      }
      return best;
    },
    [FIELD.x, FIELD.z],
  );
  await clickAt(page, lane.x, lane.z);
  await expect.poll(() => god(page).then((g) => [g.picked, g.roads.sel?.key])).toEqual(["way", "farm-lane"]);
  await expect(page.getByRole("button", { name: "Edit points" })).toBeVisible();
  await page.keyboard.press("Delete");
  await expect.poll(() => hasWay(page, "farm-lane")).toBe(false);
  await expect.poll(() => god(page).then((g) => g.picked)).toBeNull();
  await page.keyboard.press("Control+z");
  await expect.poll(() => hasWay(page, "farm-lane")).toBe(true);

  // the empty field: nothing picked, nothing put down
  const before = (await god(page)).changes;
  await clickAt(page, FIELD.x + 2, FIELD.z + 6);
  await page.waitForTimeout(600);
  const g = await god(page);
  expect([g.picked, g.changes]).toEqual([null, before]);

  // nothing kept: saved, out, the draft deleted (nothing's published)
  await expect.poll(() => god(page).then((x) => x.save), { timeout: 10_000 }).toBe("saved");
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((x) => x.on)).toBe(false);
  await clearDrafts(tok);
});
