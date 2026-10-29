/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, clearDrafts, enter, holdHour, makeDraft, test, token, useWorld } from "./helpers";

// God mode, phase 7 (docs/plan/53-the-god-mode.md): the roads tool, on Low on the dev stack, in
// the field south of the county road. A road drawn by clicks, ended with a double-click on the
// county road: there, joined at its height, lit along. A point of it dragged; taken away and
// brought back with undo. The county road (the shuttle's) can't be taken away. Nothing's
// published: the draft's deleted at the end. Stills of the drawing: YUTOPIA_SHOTS=<dir>.
const GPU = process.env.YUTOPIA_GPU === "1";
const SHOTS = process.env.YUTOPIA_SHOTS;
if (GPU || SHOTS)
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const AT = { x: 150, z: -350 }; // (the Grounds' coords: between the field and the county road)
const god = (page: Page) => page.evaluate(() => (window as any).__hud.get().god);
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/god-${name}.png` });
};
/** Where a point of the land (the Grounds' coords) is on the screen (the page's px). */
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
const ways = (page: Page) =>
  page.evaluate(() =>
    (window as any).__yutopia.G.WAYS.map((w: any) => ({ key: w.key, pts: w.pts, h: w.h, line: w.line, w: w.w })),
  );
const clickAt = async (page: Page, x: number, z: number) => {
  const p = await toScreen(page, x, z);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(400); // (not a double-click)
};

test("God mode's roads: drawn to the county road and joined, a point dragged, taken away and back", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const space = await useWorld("demo");
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
  });
  const tok = await token(ANA);
  await clearDrafts(tok);
  await makeDraft(tok, "e2e: roads");
  await enter(page, tok, space);
  await holdHour(page, 13);
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: AT.x + 60, y: AT.z + 10, level: 0 });
  await page.waitForTimeout(4000);
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 15_000 }).toBe(true);
  // (straight down more, a little closer: the field and the road both in view)
  await page.keyboard.down("KeyF");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyF");
  await page.waitForTimeout(2500);

  // draw: two clicks, then a double-click on the county road (x 140, z −401)
  await page.keyboard.press("4");
  await expect(page.getByRole("button", { name: "Edit points" })).toBeVisible();
  await clickAt(page, 150, -312);
  await clickAt(page, 148, -350);
  await expect.poll(() => god(page).then((g) => g.roads.drawing?.n)).toBe(2);
  const end = await toScreen(page, 140, -401.5);
  await page.mouse.move(end.x, end.y);
  await page.waitForTimeout(800);
  await shot(page, "08-road-drawing");
  expect((await god(page)).roads.drawing?.joins).toBe("County road");
  await page.mouse.dblclick(end.x, end.y);
  await expect.poll(() => god(page).then((g) => g.changes), { timeout: 5000 }).toBe(1);
  expect((await god(page)).roads.drawing).toBeNull();
  const all = await ways(page);
  const mine = all.find((w: any) => w.key === "god-way-1");
  expect(mine, "laid").toBeTruthy();
  const road = all.find((w: any) => w.key === "road");
  const last = mine.pts[mine.pts.length - 1];
  const at = road.line.findIndex((p: number[]) => p[0] === last[0] && p[1] === last[1]);
  expect(at, "its end on the county road's line").toBeGreaterThan(0);
  expect(Math.abs(mine.h[mine.h.length - 1] - road.h[at]), "the two at one height").toBeLessThan(0.05);
  expect(
    await page.evaluate(() => (window as any).__yutopia.G.LAMPS.some((l: any) => l.key.startsWith("lamp:god-way-1:"))),
    "lit along",
  ).toBe(true);
  await page.waitForTimeout(2500);
  await shot(page, "09-road-drawn");

  // edit points: the middle one dragged 12 m east
  await page.getByRole("button", { name: "Edit points" }).click();
  const mid = await toScreen(page, mine.pts[1][0], mine.pts[1][1]);
  const to = await toScreen(page, mine.pts[1][0] + 12, mine.pts[1][1]);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++)
    await page.mouse.move(mid.x + ((to.x - mid.x) * i) / 6, mid.y + ((to.y - mid.y) * i) / 6);
  await page.mouse.up();
  await expect
    .poll(() => ways(page).then((ws) => ws.find((w: any) => w.key === "god-way-1")?.pts[1][0]), { timeout: 5000 })
    .toBeGreaterThan(mine.pts[1][0] + 8);

  // remove: it, then undone; the county road can't be
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  const on = await toScreen(page, 150, -320);
  await page.mouse.click(on.x, on.y);
  await expect.poll(() => ways(page).then((ws) => ws.some((w: any) => w.key === "god-way-1"))).toBe(false);
  await page.keyboard.press("Control+z");
  await expect.poll(() => ways(page).then((ws) => ws.some((w: any) => w.key === "god-way-1"))).toBe(true);
  // (the county road east of the join, on the screen)
  const near = await page.evaluate(() => {
    const r = (window as any).__yutopia.G.WAYS.find((w: any) => w.key === "road");
    return r.line.find((p: number[]) => p[0] > 170 && p[0] < 180);
  });
  const county = await toScreen(page, near[0], near[1]);
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  expect(county.x > 0 && county.x < vp.width && county.y > 0 && county.y < vp.height, "the county road on screen").toBe(
    true,
  );
  await page.waitForTimeout(400);
  await page.mouse.click(county.x, county.y);
  await expect(page.getByText(/not moved nor taken away/)).toBeVisible();
  expect((await ways(page)).some((w: any) => w.key === "road")).toBe(true);

  // nothing kept: saved, out, the draft deleted (nothing's published)
  await expect.poll(() => god(page).then((g) => g.save), { timeout: 10_000 }).toBe("saved");
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on)).toBe(false);
  await clearDrafts(tok);
});
