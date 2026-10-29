/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, clearDrafts, enter, holdHour, makeDraft, test, token, useWorld } from "./helpers";

// God mode, phase 6 (docs/plan/53-the-god-mode.md): the land and paint brushes, on Low on the dev
// stack, over the farm's open field. The land brush held for a second and a half under the
// pointer: the land there rises (and the ring's there), one step to undo. Paint: dragged, the
// tiles along the drag are a path. Frames are measured while the brush is held (the land laid
// a few times a second, its chunks made again): on the machine's GPU (YUTOPIA_GPU=1; else
// logged). Nothing's published: the draft's deleted at the end.
const GPU = process.env.YUTOPIA_GPU === "1";
const SHOTS = process.env.YUTOPIA_SHOTS;
if (GPU || SHOTS)
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const FIELD = { x: 446.5, z: -238.5 }; // (the farm's field, the Grounds' coords)
/** `f` run in the page on the world's hook (window.__yutopia). */
const y = (page: Page, f: (y: any) => unknown): Promise<any> => page.evaluate(`(${f})(window.__yutopia)`);
const god = (page: Page) => page.evaluate(() => (window as any).__hud.get().god);
const worst = (page: Page) =>
  page.evaluate(() => {
    const W = window as any;
    const v = W.__worst;
    W.__worst = 0;
    return v as number;
  });
/** The land under a point of the screen (the Grounds' coords) and its height now. */
const under = (page: Page, px: number, py: number) =>
  page.evaluate(
    ([a, b]) => {
      const t = (window as any).__yutopia.tp;
      const r = t.renderer.domElement.getBoundingClientRect();
      const p = t.landUnder(r.left + a, r.top + b);
      return p ? { ...p, surface: (window as any).__yutopia.G.surfaceTileAt(Math.floor(p.x), Math.floor(p.z)) } : null;
    },
    [px, py],
  );
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/god-${name}.png` });
};

test("God mode's brushes: the land raised under a held brush and undone; a path painted", async ({ page }) => {
  test.setTimeout(300_000);
  const space = await useWorld("demo");
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
    const W = window as any;
    W.__worst = 0;
    let last = performance.now();
    const tick = (t: number) => {
      W.__worst = Math.max(W.__worst, t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const tok = await token(ANA);
  await clearDrafts(tok);
  await makeDraft(tok, "e2e: the brushes");
  await enter(page, tok, space);
  await holdHour(page, 13);
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: FIELD.x + 60, y: FIELD.z + 10, level: 0 });
  await page.waitForTimeout(4000);
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 15_000 }).toBe(true);
  // (a little lower, looking down more: the field fills the screen)
  await page.mouse.move(640, 400);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -120);
  await page.waitForTimeout(2500);

  // the land brush: raise, 24 m, held a second and a half where the pointer is
  await page.keyboard.press("2");
  await expect(page.getByRole("button", { name: "Raise" })).toBeVisible();
  const at = await under(page, 640, 380);
  expect(at, "land under the pointer").not.toBeNull();
  const was = at?.h as number;
  await page.mouse.move(640, 380);
  await page.waitForTimeout(500);
  await worst(page);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  const held = await worst(page);
  await expect.poll(() => god(page).then((g) => g.changes), { timeout: 5000 }).toBeGreaterThan(0);
  const up = await page.evaluate(([x, z]) => (window as any).__yutopia.G.terrainAt(x, z), [at?.x, at?.z]);
  console.log(`[god] raised ${(up - was).toFixed(2)} m; worst frame while held ${Math.round(held)} ms`);
  expect(up - was, "raised").toBeGreaterThan(1);
  expect((await god(page)).undo, "one step").toBe(1);
  await expect.poll(() => y(page, (y) => y.god.ring?.root.visible ?? false)).toBe(true);
  await page.waitForTimeout(2000);
  await shot(page, "06-land");
  if (GPU) expect(held, "the worst frame while the brush is held").toBeLessThan(50);
  await page.keyboard.press("Control+z");
  await expect
    .poll(() => page.evaluate(([x, z]) => (window as any).__yutopia.G.terrainAt(x, z), [at?.x, at?.z]), {
      timeout: 5000,
    })
    .toBeCloseTo(was, 1);

  // paint: a path, dragged across the field
  await page.keyboard.press("3");
  await page.getByRole("button", { name: "Path" }).click();
  const from = await under(page, 560, 420);
  const to = await under(page, 720, 420);
  await page.mouse.move(560, 420);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(560 + i * 20, 420);
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await expect.poll(() => under(page, 640, 420).then((p) => p?.surface), { timeout: 5000 }).toBe("path");
  for (const p of [from, to])
    expect(
      await page.evaluate(
        ([x, z]) => (window as any).__yutopia.G.surfaceTileAt(Math.floor(x), Math.floor(z)),
        [p?.x, p?.z],
      ),
    ).toBe("path");
  await shot(page, "07-paint");

  // nothing kept: saved, out, the draft deleted (nothing's published)
  await expect.poll(() => god(page).then((g) => g.save), { timeout: 10_000 }).toBe("saved");
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on)).toBe(false);
  await clearDrafts(tok);
});
