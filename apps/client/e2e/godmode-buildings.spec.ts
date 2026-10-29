/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, clearDrafts, enter, holdHour, makeDraft, test, token, useWorld } from "./helpers";

// God mode, phase 9 (docs/plan/53-the-god-mode.md): buildings, on Low on the dev stack, in the
// farm's field. A house put down from the panel (its name, its walls sage): on its plot, a floor
// under it, solid; turned a quarter with R (its sides swapped, its door round); dragged 8 m; made
// one you walk into (its generated inside). One put on the farmhouse is refused. Taken away with
// Delete. Nothing's published: the draft's deleted. Stills: YUTOPIA_SHOTS=<dir>.
const GPU = process.env.YUTOPIA_GPU === "1";
const SHOTS = process.env.YUTOPIA_SHOTS;
if (GPU || SHOTS)
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const FIELD = { x: 446.5, z: -238.5 };
const god = (page: Page) => page.evaluate(() => (window as any).__hud.get().god);
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/god-${name}.png` });
};
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
const mine = (page: Page) =>
  page.evaluate(
    () => (window as any).__yutopia.G.BUILDINGS.find((b: any) => b.key.startsWith("god-building-")) ?? null,
  );

test("God mode's buildings: a house put down, turned, moved, walked into; refused on another; taken away", async ({
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
  await makeDraft(tok, "e2e: buildings");
  await enter(page, tok, space);
  await holdHour(page, 13);
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), {
    x: FIELD.x + 60,
    y: FIELD.z + 10 + 16,
    level: 0,
  });
  await page.waitForTimeout(4000);
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 15_000 }).toBe(true);
  await page.mouse.move(640, 400);
  for (let i = 0; i < 2; i++) await page.mouse.wheel(0, -120);
  await page.waitForTimeout(2500);

  // a house: its name, its size, sage walls, its door east; put down in the field
  await page.keyboard.press("7");
  await page.getByRole("button", { name: "House", exact: true }).click();
  await page.evaluate(() =>
    (window as any).__yutopia.god.buildingsTool().setOpts({ w: 12, d: 10, floors: 2, face: "e" }),
  );
  await page.getByRole("button", { name: "Walls 2" }).click();
  await clickAt(page, FIELD.x, FIELD.z);
  await expect.poll(() => mine(page).then((b) => b?.kind), { timeout: 5000 }).toBe("house");
  let b = await mine(page);
  expect([b.x1 - b.x0, b.z1 - b.z0, b.tint, b.face]).toEqual([12, 10, "#9fb5a2", "e"]);
  await page.getByRole("textbox").first().fill("Pine House");
  await page.getByRole("textbox").first().press("Enter");
  await expect.poll(() => mine(page).then((x) => x?.name)).toBe("Pine House");
  expect(
    await page.evaluate(([x, z]) => (window as any).__yutopia.G.groundSurfaceAt(x, z), [FIELD.x, FIELD.z]),
    "a floor under it",
  ).toBe("floor");
  await page.waitForTimeout(2500);
  await shot(page, "12-house");

  // R: a quarter turned (picked: it is, just put down)
  await page.keyboard.press("r");
  await expect.poll(() => mine(page).then((x) => [x.x1 - x.x0, x.z1 - x.z0, x.face])).toEqual([10, 12, "s"]);

  // dragged 8 m east
  b = await mine(page);
  const mid = [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];
  const from = await toScreen(page, mid[0], mid[1]);
  const to = await toScreen(page, mid[0] + 8, mid[1]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6);
  await page.mouse.up();
  await expect.poll(() => mine(page).then((x) => x.x0), { timeout: 5000 }).toBeGreaterThan(b.x0 + 5);

  // picked, made one you walk into: its door round to one its inside has; its inside there
  b = await mine(page);
  await clickAt(page, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
  await expect.poll(() => god(page).then((g) => g.buildings.sel?.key)).toBe(b.key);
  await page.getByRole("button", { name: "Enterable" }).click();
  await expect.poll(() => mine(page).then((x) => [x.enter, ["e", "w"].includes(x.face)])).toEqual([true, true]);
  await expect
    .poll(() => page.evaluate((k) => (window as any).__yutopia.G.INSIDES.some((i: any) => i.b.key === k), b.key))
    .toBe(true);
  await page.waitForTimeout(2500);
  await shot(page, "13-house-moved");

  // on the farmhouse: refused
  const farm = await page.evaluate(() =>
    (window as any).__yutopia.G.BUILDINGS.find((x: any) => x.kind === "farmhouse"),
  );
  await page.keyboard.press("Escape"); // (let the picked one go)
  const before = (await god(page)).changes;
  await clickAt(page, farm.x0 - 3, (farm.z0 + farm.z1) / 2);
  await page.waitForTimeout(600);
  expect((await god(page)).changes, "nothing put down on it").toBe(before);

  // taken away: picked, Delete
  b = await mine(page);
  await clickAt(page, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
  await expect.poll(() => god(page).then((g) => g.buildings.sel?.key)).toBe(b.key);
  await page.keyboard.press("Delete");
  await expect.poll(() => mine(page)).toBeNull();

  // nothing kept: saved, out, the draft deleted (nothing's published)
  await expect.poll(() => god(page).then((g) => g.save), { timeout: 10_000 }).toBe("saved");
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on)).toBe(false);
  await clearDrafts(tok);
});
