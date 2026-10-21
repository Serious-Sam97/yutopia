/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The inventory (docs/plan/30-the-dark.md; design/screens/dark/06a-inventory,
// 06b-inventory): I opens it, out on the pond with a kit — you stand still
// while it's open; the first aid used from it; a pocket dragged to another;
// the flares dropped on the snow and dragged back into a chosen pocket; Esc
// and I close it; indoors it opens too, and the flares dropped there lie on its
// floor and are taken back. Review shots: YUTOPIA_SHOTS=<dir>.

const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};
const inv = (page: Page) =>
  page.evaluate(() => (window as any).__dark.inv as { pockets: ({ id: string; n: number } | null)[]; weapons: any[] });
const me = (page: Page) =>
  page.evaluate(() => {
    const y = (window as any).__yutopia;
    const p = y.room.state.players.get(y.room.sessionId);
    return { x: p.x as number, y: p.y as number, hp: p.hp as number };
  });
const slot = (page: Page, i: number) => page.locator(`.dk-inv [data-slot="${i}"]`);
const drag = async (page: Page, from: ReturnType<typeof slot>, to: ReturnType<typeof slot>) => {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("no box");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 10, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
};

test("the inventory: open with I, standing still; use, drag, drop and take back; closed; indoors too", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", last3d: "3p", cam3p: "chase", lang: "en" }));
    // the pointer lock, as mouse-look.spec fakes it (headless has none)
    let el: Element | null = null;
    Object.defineProperty(Document.prototype, "pointerLockElement", { configurable: true, get: () => el });
    Element.prototype.requestPointerLock = function (this: Element) {
      el = this;
      setTimeout(() => document.dispatchEvent(new Event("pointerlockchange")));
      return Promise.resolve();
    } as any;
    Document.prototype.exitPointerLock = () => {
      el = null;
      setTimeout(() => document.dispatchEvent(new Event("pointerlockchange")));
    };
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-250, -60));
  await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
  await page.waitForFunction(() => !!(window as any).__dark, null, { timeout: 20_000 });
  // known pockets: whatever Ana carried from before left here on the snow, then a step away and a kit,
  // and hurt (something to use)
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    for (let i = 0; i < 8; i++) y.room.send("dark:drop", { slot: i });
  });
  await expect
    .poll(async () => {
      const v = await inv(page);
      return v.pockets.every((s) => !s) && v.weapons.every((w) => !w);
    })
    .toBe(true);
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), G(-250, -48));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    y.room.send("mod:refill", { kit: true });
    y.room.send("mod:refill", { kit: true, hp: 40 });
  });
  await expect.poll(async () => (await inv(page)).pockets.some((s) => s?.id === "aid")).toBe(true);
  await expect.poll(async () => (await me(page)).hp).toBe(40);

  // I: open — the weapons, six pockets, the snow in reach
  await page.keyboard.press("KeyI");
  await expect(page.locator(".dk-inv .panel")).toBeVisible();
  await expect(page.locator(".dk-inv [data-slot]")).toHaveCount(8);
  // standing still while it's open (W held a second)
  const before = await me(page);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1000);
  await page.keyboard.up("KeyW");
  const after = await me(page);
  expect(Math.hypot(after.x - before.x, after.y - before.y), "stood still").toBeLessThan(0.05);

  // the first aid: picked, its details, E uses it — health to 100, one fewer
  const pockets = (await inv(page)).pockets;
  const aid = pockets.findIndex((s) => s?.id === "aid");
  await slot(page, aid).click();
  await expect(page.locator(".dk-inv .det h2")).toHaveText(/first aid|kit médico/i);
  await shot(page, "inventory-aid");
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await me(page)).hp).toBe(100);
  await expect.poll(async () => (await inv(page)).pockets[aid]).toBe(null);

  // a drag: the flares to the pocket the first aid left
  const fl = (await inv(page)).pockets.findIndex((s) => s?.id === "flare");
  await drag(page, slot(page, fl), slot(page, aid));
  await expect.poll(async () => (await inv(page)).pockets[aid]?.id).toBe("flare");
  await expect.poll(async () => (await inv(page)).pockets[fl]).toBe(null);

  // right click drops them on the snow; they show in reach; dragged back into a chosen pocket
  await slot(page, aid).click({ button: "right" });
  await expect.poll(async () => (await inv(page)).pockets[aid]).toBe(null);
  const lying = page.locator(".dk-inv [data-drop]");
  await expect(lying).toHaveCount(1);
  await shot(page, "inventory-ground");
  const empty = (await inv(page)).pockets.findIndex((s, i) => !s && i !== aid);
  await drag(page, lying, slot(page, empty));
  await expect.poll(async () => (await inv(page)).pockets[empty]?.id).toBe("flare");
  await expect(lying).toHaveCount(0);

  // the weapons: 2 takes the shotgun out from here
  await page.keyboard.press("Digit2");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).gun,
      ),
    )
    .toBe("shotgun");

  // Esc closes; I opens and I closes
  await page.keyboard.press("Escape");
  await expect(page.locator(".dk-inv .panel")).toBeHidden();
  await page.keyboard.press("KeyI");
  await expect(page.locator(".dk-inv .panel")).toBeVisible();
  await page.keyboard.press("KeyI");
  await expect(page.locator(".dk-inv .panel")).toBeHidden();
  // closed: walking again
  const p0 = await me(page);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(800);
  await page.keyboard.up("KeyW");
  const p1 = await me(page);
  expect(Math.hypot(p1.x - p0.x, p1.y - p0.y), "walks once it's closed").toBeGreaterThan(0.5);

  // mouse look (Z) on: opening shows the pointer (the lock let go), closing locks it again
  await page.keyboard.press("KeyZ");
  await expect.poll(() => page.evaluate(() => (window as any).__yutopia.tp.looking)).toBe(true);
  await page.keyboard.press("KeyI");
  await expect(page.locator(".dk-inv .panel")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__yutopia.tp.looking)).toBe(false);
  await page.keyboard.press("KeyI");
  await expect(page.locator(".dk-inv .panel")).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as any).__yutopia.tp.looking)).toBe(true);
  await page.keyboard.press("KeyZ");
  await expect.poll(() => page.evaluate(() => (window as any).__yutopia.tp.looking)).toBe(false);

  // indoors (the studio): it opens, nothing on the ground; the flares dropped lie on its floor
  await page.evaluate(() => (window as any).__yutopia.room.send("arms:draw", { slot: -1 }));
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: 10, y: 20, level: 0 }));
  await page.waitForFunction(() => !(window as any).__yutopia.walker.outside, null, { timeout: 20_000 });
  await page.keyboard.press("KeyI");
  await expect(page.locator(".dk-inv .panel")).toBeVisible();
  await expect(page.locator(".dk-inv .gl .none")).toBeVisible();
  const flares = (await inv(page)).pockets.findIndex((s) => s?.id === "flare");
  await slot(page, flares).click({ button: "right" });
  await expect.poll(async () => (await inv(page)).pockets[flares]).toBe(null);
  await expect(lying).toHaveCount(1);
  await shot(page, "inventory-inside");
  await lying.click();
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await inv(page)).pockets.some((s) => s?.id === "flare")).toBe(true);
  await expect(lying).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
