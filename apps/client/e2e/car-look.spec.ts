/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// Your car's look (docs/plan/92-the-cars.md F13b): at MOTORS Ana picks the hatch, its hot version, a colour,
// spot lamps and sport wheels — the car turning on the stand as she does —, takes it; Bia, in her own
// browser, has it as chosen. Then, by it on the forecourt (home), Use held: "Repaint" — the GL, another
// colour — and Bia sees that too. YUTOPIA_SHOTS=<dir> saves pictures. On the machine's GPU.
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const SHOTS = process.env.YUTOPIA_SHOTS;

async function open(page: Page, who: typeof ANA) {
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p" }));
  });
  await enter(page, await token(who));
  await page.waitForFunction(() => !!(window as any).__yutopia?.cars, null, { timeout: 60_000 });
}
/** My own (not retired): its id and props. */
const myCar = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    let found: any = null;
    c.room.state.objects.forEach((o: any) => {
      const p = JSON.parse(o.props);
      if (o.kind === "car" && p.ownerId === c.myUid() && !p.retire) found = { id: o.id, p };
    });
    return found as { id: string; p: any } | null;
  });
/** A car's look as someone's world has it: its object's, and the one its model was made from. */
const lookIn = (page: Page, id: string) =>
  page.evaluate((id) => {
    const c = (window as any).__yutopia;
    const o = c.room.state.objects.get(id);
    const parked = c.cars?.parked?.get(id);
    return { props: o ? JSON.parse(o.props).look : null, model: parked?.look ?? null };
  }, id);

test("MOTORS: a look chosen on the stand, bought, seen by someone else; repainted at home", async ({
  page,
  browser,
}) => {
  test.setTimeout(360_000);
  const a = page;
  await open(a, ANA);
  const before = (await myCar(a))?.id ?? "";
  // by the sedan on show: the dealer's prompt, the panel
  await a.evaluate(() => (window as any).__yutopia.teleport({ x: 506.4, y: -393.6, level: 0 }));
  await a.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "motors", null, { timeout: 30_000 });
  await a.evaluate(() => (window as any).__yutopia.interact());
  await expect(a.locator("[data-motors-list]")).toBeVisible();
  await a.locator("[data-motors-model=hatch]").click();
  await expect(a.locator("[data-motors-variant]")).toHaveCount(3);
  await a.locator("[data-motors-variant=hatch-hot]").click();
  await a.locator("[data-motors-colour='10']").click();
  await a.locator("[data-motors-extra=spots]").click();
  await a.locator("[data-motors-wheels=sport]").click();
  // the stand: its car drawn (the loading line gone, something on the canvas)
  await expect(a.getByText(/Bringing it round|Trazendo o carro/)).toBeHidden({ timeout: 30_000 });
  await a.waitForTimeout(2500);
  const drawn = await a.evaluate(() => {
    const cv = document.querySelector("[data-motors-stand]") as HTMLCanvasElement | null;
    return !!cv && cv.width > 50 && cv.height > 50;
  });
  expect(drawn).toBe(true);
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/game-motors-look.png` });
  await a.locator("[data-motors-take]").click();
  await expect(a.locator("[data-motors-list]")).toBeHidden();
  await expect.poll(async () => (await myCar(a))?.id ?? before, { timeout: 15_000 }).not.toBe(before);
  const mine = await myCar(a);
  expect(mine?.p.model).toBe("hatch");
  expect(mine?.p.look).toEqual({ variant: "hatch-hot", colour: 0x22385e, extras: ["spots"], wheels: "sport" });
  const id = mine?.id ?? "";

  // Bia, in her own browser: the same car, its model made from the same look
  const b = await (await browser.newContext()).newPage();
  await open(b, BIA);
  await b.evaluate(() => (window as any).__yutopia.teleport({ x: 516, y: -396, level: 0 }));
  await expect.poll(async () => (await lookIn(b, id)).model?.variant ?? null, { timeout: 30_000 }).toBe("hatch-hot");
  expect((await lookIn(b, id)).props).toEqual(mine?.p.look);
  if (SHOTS) {
    await b.waitForTimeout(6000);
    await b.screenshot({ path: `${SHOTS}/game-motors-look-bia.png` });
  }

  // Ana by it, on the forecourt (home): Use held — "Repaint"
  await a.evaluate((id) => {
    const c = (window as any).__yutopia;
    const q = c.cars.parked.get(id).pose;
    // (beside it, its west side: the forecourt's rail is east of the collection bay)
    const sides = [1, -1].map((s) => ({ x: q.x - Math.sin(q.a) * 2.3 * s, y: q.z + Math.cos(q.a) * 2.3 * s }));
    const w = sides.sort((p, r) => p.x - r.x)[0];
    c.teleport({ x: w.x, y: w.y, level: 0 });
  }, id);
  await a.waitForFunction(() => /^car$/.test((window as any).__hud.get().prompt?.kind ?? ""), null, {
    timeout: 30_000,
  });
  expect(await a.evaluate((id) => (window as any).__yutopia.cars.repaintable(id), id)).toBe(true);
  await expect
    .poll(() => a.evaluate(() => (window as any).__hud.get().prompt?.label ?? ""), { timeout: 10_000 })
    .toMatch(/repaint|repintar/i);
  await a.evaluate((id) => (window as any).__yutopia.cars.hold("car", id), id);
  await expect(a.locator("[data-motors-variant]")).toHaveCount(3);
  await expect(a.locator("[data-motors-list]")).toHaveCount(0);
  await a.locator("[data-motors-variant=hatch-gl]").click();
  await a.locator("[data-motors-colour='9']").click();
  if (SHOTS) {
    await a.waitForTimeout(2500);
    await a.screenshot({ path: `${SHOTS}/game-motors-repaint.png` });
  }
  await a.locator("[data-motors-take]").click();
  await expect(a.locator("[data-motors-take]")).toBeHidden({ timeout: 10_000 });
  // Bia: the GL, the new paint (the spot lamps don't fit a GL: gone; the sport wheels kept)
  await expect.poll(async () => (await lookIn(b, id)).model?.variant ?? null, { timeout: 15_000 }).toBe("hatch-gl");
  const after = await lookIn(b, id);
  expect(after.props).toEqual({ variant: "hatch-gl", colour: 0x8e1c1c, extras: [], wheels: "sport" });
  await b.close();
});
