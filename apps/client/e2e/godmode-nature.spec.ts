/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, clearDrafts, enter, holdHour, makeDraft, test, token, useWorld } from "./helpers";

// God mode, phase 8 (docs/plan/53-the-god-mode.md): nature and things, on Low on the dev stack,
// in the farm's field. Pines planted with the forest brush, undone; one tree put in a cell and
// taken out again. A boulder put down from the catalog, dragged, sized, taken away; a sign with
// words; a fence along three points. Nothing's published: the draft's deleted at the end.
// Stills: YUTOPIA_SHOTS=<dir>.
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
  await page.waitForTimeout(400); // (not a double-click)
};
const treesNear = (page: Page, x: number, z: number, r: number) =>
  page.evaluate(
    ([px, pz, pr]) => {
      const G = (window as any).__yutopia.G;
      const out: any[] = [];
      for (let cx = Math.floor((px - pr) / 32); cx <= Math.floor((px + pr) / 32); cx++)
        for (let cz = Math.floor((pz - pr) / 32); cz <= Math.floor((pz + pr) / 32); cz++)
          out.push(...G.treesIn(cx, cz).filter((t: any) => Math.hypot(t.x - px, t.z - pz) < pr));
      return out.map((t) => t.kind);
    },
    [x, z, r],
  );
const street = (page: Page) =>
  page.evaluate(() => (window as any).__yutopia.G.STREET.filter((t: any) => t.key.startsWith("god-")));

test("God mode's nature and things: pines planted and undone, one tree, a boulder, a sign, a fence", async ({
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
  await makeDraft(tok, "e2e: nature and things");
  await enter(page, tok, space);
  await holdHour(page, 13);
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: FIELD.x + 60, y: FIELD.z + 10, level: 0 });
  await page.waitForTimeout(4000);
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 15_000 }).toBe(true);
  await page.mouse.move(640, 400);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -120);
  await page.waitForTimeout(2500);

  // nature: pines, the brush dragged across the field; undone
  await page.keyboard.press("5");
  await page.getByRole("button", { name: "Pine", exact: true }).click();
  const before = (await treesNear(page, FIELD.x, FIELD.z, 12)).length;
  const a = await toScreen(page, FIELD.x - 8, FIELD.z);
  const b = await toScreen(page, FIELD.x + 8, FIELD.z);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
    await page.waitForTimeout(80);
  }
  await page.mouse.up();
  await expect
    .poll(() => treesNear(page, FIELD.x, FIELD.z, 12).then((t) => t.length), { timeout: 5000 })
    .toBeGreaterThan(before + 5);
  expect((await treesNear(page, FIELD.x, FIELD.z, 6)).every((k: string) => k === "pine")).toBe(true);
  await page.waitForTimeout(2500);
  await shot(page, "10-planted");
  await page.keyboard.press("Control+z");
  await expect.poll(() => treesNear(page, FIELD.x, FIELD.z, 12).then((t) => t.length)).toBe(before);

  // one tree: there, then none
  await page.getByRole("button", { name: "One tree" }).click();
  await clickAt(page, FIELD.x + 4, FIELD.z + 4);
  await expect.poll(() => treesNear(page, FIELD.x + 4, FIELD.z + 4, 3.3).then((t) => t.length)).toBeGreaterThan(0);
  await clickAt(page, FIELD.x + 4, FIELD.z + 4);
  await expect.poll(() => treesNear(page, FIELD.x + 4, FIELD.z + 4, 3.3).then((t) => t.length)).toBe(0);

  // things: a boulder, put down, dragged 6 m, made bigger, taken away
  await page.keyboard.press("6");
  await page
    .getByRole("radio", { name: "Boulder" })
    .or(page.getByRole("button", { name: "Boulder" }))
    .first()
    .click();
  await clickAt(page, FIELD.x, FIELD.z);
  await expect.poll(() => street(page).then((s) => s.filter((t: any) => t.kind === "boulder").length)).toBe(1);
  // (where it went down: on the snap's grid)
  const put = (await street(page)).find((t: any) => t.kind === "boulder");
  const from = await toScreen(page, put.x, put.z);
  const to = await toScreen(page, put.x + 6, put.z);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6);
  await page.mouse.up();
  await expect
    .poll(() => street(page).then((s) => s.find((t: any) => t.kind === "boulder")?.x))
    .toBeGreaterThan(put.x + 3.5);
  // picked (a click on it), sized from the panel's slider, then taken away with Delete
  const moved = (await street(page)).find((t: any) => t.kind === "boulder");
  await clickAt(page, moved.x, moved.z);
  await expect.poll(() => god(page).then((g) => g.things.sel?.kind)).toBe("boulder");
  await page.evaluate(() => (window as any).__yutopia.god.thingsTool().setOpts({ s: 1.6 }));
  await expect.poll(() => street(page).then((s) => s.find((t: any) => t.kind === "boulder")?.s)).toBe(1.6);
  await page.keyboard.press("Delete");
  await expect.poll(() => street(page).then((s) => s.some((t: any) => t.kind === "boulder"))).toBe(false);

  // a sign with words
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await page.getByRole("textbox").last().fill("Frost Farm");
  await page.getByRole("textbox").last().press("Enter");
  await clickAt(page, FIELD.x - 6, FIELD.z + 3);
  await expect.poll(() => street(page).then((s) => s.find((t: any) => t.kind === "sign")?.text)).toBe("Frost Farm");

  // a fence along three points, ended with Enter
  await page.getByRole("button", { name: "A line (fences)" }).click();
  await clickAt(page, FIELD.x - 10, FIELD.z - 6);
  await clickAt(page, FIELD.x + 10, FIELD.z - 6);
  await clickAt(page, FIELD.x + 10, FIELD.z + 8);
  await page.keyboard.press("Enter");
  await expect.poll(() => street(page).then((s) => s.find((t: any) => t.kind === "fence")?.pts?.length)).toBe(3);
  await page.waitForTimeout(3000);
  await shot(page, "11-things");

  // nothing kept: saved, out, the draft deleted (nothing's published)
  await expect.poll(() => god(page).then((g) => g.save), { timeout: 10_000 }).toBe("saved");
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on)).toBe(false);
  await clearDrafts(tok);
});
