/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { POCKETS, QUICK, QUICK_SLOT } from "@yutopia/shared/inventory";
import { ANA, enter, test, token } from "./helpers";

// The pack's hand tools (docs/plan/86-the-inventory.md phase 3, look B): Ana by the pond with the admin's kit (the
// revolver and the double-barrel at hand; .38s, shells, flares, a first aid, a battery in the pack), hurt. The
// mouse and the keys: right click, the menu — Drop 1, Drop all; T takes all back; Split from the menu and by a
// Shift-drag; O organizes; hover + 5 puts the first aid at hand (plan 87: the quick slots on 2–5), Shift + click back in the pack, a double click uses
// it; the menu's To the pack and its chip 4; a drag off the pack drops; Esc closes the menu first. The pad: the
// d-pad picks, Y the menu, X held drops, B closes. A phone (touch): tap picks, tap an empty pouch moves it there, a
// touch held opens the menu, the tag's Drop only by a hold. YUTOPIA_SHOTS=<dir>: stills.

const dir = process.env.YUTOPIA_SHOTS;
// (every slot: the pack, then the quick slots — plan 86: 8 + 4)
const ALL = POCKETS + QUICK;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};
type Inv = { pockets: ({ id: string; n?: number; loaded?: number } | null)[]; quick: any[]; hand?: any };
const inv = (page: Page) => page.evaluate(() => (window as any).__dark.inv as Inv);
const at = async (page: Page, id: string) => (await inv(page)).pockets.findIndex((s) => s?.id === id);
const total = async (page: Page, id: string) => {
  const v = await inv(page);
  return [...v.pockets, ...v.quick].reduce((a, s) => a + (s?.id === id ? (s.n ?? 1) : 0), 0);
};
const hp = (page: Page) =>
  page.evaluate(() => {
    const y = (window as any).__yutopia;
    return y.room.state.players.get(y.room.sessionId).hp as number;
  });
const slot = (page: Page, i: number) => page.locator(`.dk-inv [data-slot="${i}"]`);
// (its box measured once it's there — the panel's rebuilt when an item's picture comes in: a box asked mid-rebuild
// is none, so asked again)
const boxOf = async (l: ReturnType<typeof slot>) => {
  for (let i = 0; i < 10; i++) {
    await l.waitFor({ state: "visible" });
    const box = await l.boundingBox();
    if (box) return box;
    await l.page().waitForTimeout(100);
  }
  throw new Error("no box");
};
const dragTo = async (page: Page, from: ReturnType<typeof slot>, x: number, y: number) => {
  const a = await boxOf(from);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 10, { steps: 4 });
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
};
const drag = async (page: Page, from: ReturnType<typeof slot>, to: ReturnType<typeof slot>) => {
  const b = await boxOf(to);
  await dragTo(page, from, b.x + b.width / 2, b.y + b.height / 2);
};
const prefs = (page: Page) =>
  page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", lang: "en" }));
  });
// a pad of our own (controls-checks.spec's): the browser's gamepads are this one, its buttons set from the test
const fakePad = (page: Page) =>
  page.addInitScript(() => {
    const w = window as any;
    w.__pad = { b: new Array(17).fill(0), a: [0, 0, 0, 0], t: 1 };
    const make = () => {
      const p = w.__pad;
      return {
        id: "e2e pad (STANDARD GAMEPAD)",
        index: 0,
        connected: true,
        mapping: "standard",
        timestamp: p.t,
        axes: p.a.slice(),
        buttons: p.b.map((v: number) => ({ pressed: v > 0.5, touched: v > 0, value: v })),
        vibrationActuator: { type: "dual-rumble", playEffect: async () => "complete", reset: async () => "complete" },
      };
    };
    Object.defineProperty(Navigator.prototype, "getGamepads", { configurable: true, value: () => [make(), null] });
  });
const button = (page: Page, i: number, v: number) =>
  page.evaluate(
    ([i, v]) => {
      const p = (window as any).__pad;
      p.b[i] = v;
      p.t = performance.now();
    },
    [i, v],
  );
const tapButton = async (page: Page, i: number) => {
  await button(page, i, 1);
  await page.waitForTimeout(120);
  await button(page, i, 0);
  await page.waitForTimeout(120);
};

// in the world with the kit, her pack emptied first (onto the snow, then a step away from it), hurt
async function kitted(page: Page) {
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__dark?.inv, null, {
    timeout: 90_000,
  });
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -250, y: -60, level: 0 }));
  await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
  await page.evaluate((all) => {
    const y = (window as any).__yutopia;
    y.room.send("arms:draw", { slot: -1 });
    for (let i = 0; i < all; i++) y.room.send("dark:drop", { slot: i });
  }, ALL);
  await expect
    .poll(async () => {
      const v = await inv(page);
      return v.pockets.every((s) => !s) && v.quick.every((w) => !w);
    })
    .toBe(true);
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -250, y: -46, level: 0 }));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    y.room.send("mod:refill", { kit: true, hp: 40 });
  });
  await expect.poll(async () => (await at(page, "aid")) >= 0).toBe(true);
  await expect.poll(() => hp(page)).toBe(40);
}

test("the pack's hand tools: the menu, Take all, split, organize, hover + 2–5, Shift + click, a double click, a drag off it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await prefs(page);
  await kitted(page);
  await page.keyboard.press("KeyI");
  await expect(page.locator(".dk-inv .panel")).toBeVisible();
  await expect(page.locator(".dk-inv .flap")).toHaveText(/the pack/i);
  await expect(page.locator(".dk-inv [data-slot]")).toHaveCount(ALL);
  const lying = page.locator(".dk-inv [data-drop]");
  const menu = page.locator(".dk-inv-menu");
  await expect(lying).toHaveCount(0);

  // right click the .38s: the menu — Drop 1, one on the snow, 23 kept
  await slot(page, await at(page, "r38")).click({ button: "right" });
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-menu="split"]')).toBeVisible();
  await expect(menu.locator('[data-menu="drop"]')).toHaveText(/drop all 24/i);
  await shot(page, "tools-menu");
  await menu.locator('[data-menu="drop1"]').click();
  await expect(menu).toBeHidden();
  await expect.poll(() => total(page, "r38")).toBe(23);
  await expect(lying).toHaveCount(1);
  // …and the battery, all of it
  await slot(page, await at(page, "battery")).click({ button: "right" });
  await menu.locator('[data-menu="drop"]').click();
  await expect.poll(() => at(page, "battery")).toBe(-1);
  await expect(lying).toHaveCount(2);
  await shot(page, "tools-ground");
  // T: both taken back
  await page.keyboard.press("KeyT");
  await expect(lying).toHaveCount(0);
  await expect.poll(() => total(page, "r38")).toBe(24);
  await expect.poll(() => at(page, "battery")).toBeGreaterThanOrEqual(0);

  // Split, from the menu: the .38s halved into a free pouch
  await slot(page, await at(page, "r38")).click({ button: "right" });
  await menu.locator('[data-menu="split"]').click();
  await expect
    .poll(async () => (await inv(page)).pockets.filter((s) => s?.id === "r38").map((s) => s?.n))
    .toEqual([12, 12]);
  // …and by a Shift-drag: half the shells
  const sh = await at(page, "shell");
  const free = (await inv(page)).pockets.indexOf(null);
  await page.keyboard.down("Shift");
  await drag(page, slot(page, sh), slot(page, free));
  await page.keyboard.up("Shift");
  await expect.poll(async () => (await inv(page)).pockets[free]).toEqual({ id: "shell", n: 6 });
  await expect.poll(() => total(page, "shell")).toBe(12);

  // O: organized — like stacks one again, the rounds first, then the rest, no gaps
  await page.keyboard.press("KeyO");
  await expect
    .poll(async () => (await inv(page)).pockets.filter(Boolean).map((s) => s?.id))
    .toEqual(["r38", "shell", "aid", "battery", "flare"]);
  expect((await inv(page)).pockets.slice(0, 5).every(Boolean), "no gaps").toBe(true);

  // hover the first aid and press 5: at hand, in the fourth quick slot
  await slot(page, await at(page, "aid")).hover();
  await page.keyboard.press("Digit5");
  await expect.poll(async () => (await inv(page)).quick[3]?.id).toBe("aid");
  // Shift + click: back in the pack
  await slot(page, QUICK_SLOT + 3).click({ modifiers: ["Shift"] });
  await expect.poll(async () => (await inv(page)).quick[3]).toBe(null);
  await expect.poll(() => at(page, "aid")).toBeGreaterThanOrEqual(0);
  // a double click uses it: health to 100, the pouch empty
  await slot(page, await at(page, "aid")).dblclick();
  await expect.poll(() => hp(page)).toBe(100);
  await expect.poll(() => at(page, "aid")).toBe(-1);

  // the menu on the revolver at hand: To the pack — then from its pouch, Equip to 4 (its chip)
  await slot(page, QUICK_SLOT).click({ button: "right" });
  await menu.locator('[data-menu="pack"]').click();
  await expect.poll(() => at(page, "revolver")).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => (await inv(page)).quick[0]).toBe(null);
  await slot(page, await at(page, "revolver")).click();
  await expect(page.locator(".dk-inv .det .cap")).toHaveText(/in the pack/i);
  await expect(page.locator('.dk-inv .det [data-act="equip"]')).toBeVisible();
  await shot(page, "tools-tag");
  await slot(page, await at(page, "revolver")).click({ button: "right" });
  await menu.locator('[data-menu="to"][data-n="3"]').click();
  await expect.poll(async () => (await inv(page)).quick[3]?.id).toBe("revolver");

  // a drag off the pack drops it: the flares on the snow
  await dragTo(page, slot(page, await at(page, "flare")), 1262, 420);
  await expect.poll(() => at(page, "flare")).toBe(-1);
  await expect(lying).toHaveCount(1);
  // Esc: the menu first, then the pack; the menu's Take
  await lying.click({ button: "right" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator(".dk-inv .panel")).toBeVisible();
  await lying.click({ button: "right" });
  await menu.locator('[data-menu="take"]').click();
  await expect(lying).toHaveCount(0);
  await expect.poll(() => total(page, "flare")).toBe(3);
  await page.keyboard.press("Escape");
  await expect(page.locator(".dk-inv .panel")).toBeHidden();
  expect(errors).toEqual([]);
});

test("the pack on the pad: the d-pad picks, Y the menu, X held drops, B closes", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await prefs(page);
  await fakePad(page);
  await kitted(page);
  await page.keyboard.press("KeyI");
  await expect(page.locator(".dk-inv .panel")).toBeVisible();
  const sel = () => page.evaluate(() => document.querySelector(".dk-inv .sel")?.getAttribute("data-slot"));
  // ↓: the first at hand; ↓ again: the pack's first pouch (the .38s)
  await tapButton(page, 13);
  await expect.poll(sel).toBe(String(QUICK_SLOT));
  await tapButton(page, 13);
  await expect.poll(sel).toBe("0");
  await expect(page.locator(".dk-inv .det h2")).toHaveText(/\.38/);
  // Y: the menu at it; ↓ moves through it; B closes it (not the pack)
  const menu = page.locator(".dk-inv-menu");
  await tapButton(page, 3);
  await expect(menu).toBeVisible();
  await expect(menu.locator(".it.on")).toHaveCount(1);
  const first = await menu.locator(".it.on").getAttribute("data-menu");
  await tapButton(page, 13);
  expect(await menu.locator(".it.on").getAttribute("data-menu")).not.toBe(first);
  await tapButton(page, 1);
  await expect(menu).toBeHidden();
  await expect(page.locator(".dk-inv .panel")).toBeVisible();
  // X tapped: nothing; held: dropped
  await tapButton(page, 2);
  await page.waitForTimeout(300);
  expect(await total(page, "r38")).toBe(24);
  await button(page, 2, 1);
  await page.waitForTimeout(900);
  await button(page, 2, 0);
  await expect.poll(() => total(page, "r38")).toBe(0);
  await expect(page.locator(".dk-inv [data-drop]")).toHaveCount(1);
  // B: closed
  await tapButton(page, 1);
  await expect(page.locator(".dk-inv .panel")).toBeHidden();
  // (the .38s back)
  await page.evaluate(() => (window as any).__yutopia.room.send("dark:takeAll", {}));
  await expect.poll(() => total(page, "r38")).toBe(24);
  expect(errors).toEqual([]);
});

test("the HUD: the quick slots captioned with the held gun's rounds; a slip for what came, none for a move; H, B", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await prefs(page);
  await kitted(page);
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 21 }));
  const cap = page.locator(".dk-quick .cap");
  const slips = page.locator(".dk-slip");
  const toast = page.locator(".dk-toast");
  // hurt, a first aid carried: the caption says H; the kit's things came as slips (three at most), then go
  await expect(cap.locator(".hurt")).toContainText("H");
  await expect.poll(() => slips.count()).toBeGreaterThan(0);
  expect(await slips.count()).toBeLessThanOrEqual(3);
  await expect(slips).toHaveCount(0, { timeout: 6000 });
  // the revolver drawn: its rounds in the caption — in it + spare
  await page.keyboard.press("Digit2");
  await expect(cap.locator("b")).toHaveText(".38 · 6 + 24");
  // four shells dropped and taken back: one slip, typed
  const sh = await at(page, "shell");
  await page.evaluate((slot) => (window as any).__yutopia.room.send("dark:drop", { slot, n: 4 }), sh);
  await expect.poll(() => total(page, "shell")).toBe(8);
  await page.evaluate(() => (window as any).__yutopia.room.send("dark:takeAll", {}));
  await expect(slips).toHaveCount(1);
  await expect(slips).toHaveText("+4 shells · in the pack");
  await shot(page, "hud-slip");
  await expect(slips).toHaveCount(0, { timeout: 6000 });
  // a move in the pack: no slip
  const free = (await inv(page)).pockets.indexOf(null);
  await page.evaluate(([from, to]) => (window as any).__yutopia.room.send("dark:move", { from, to }), [sh, free]);
  await expect.poll(async () => (await inv(page)).pockets[free]?.id).toBe("shell");
  await page.waitForTimeout(500);
  await expect(slips).toHaveCount(0);
  // H: the first aid used from the pack — health 100, the caption's H gone; H again: none left, said
  await page.keyboard.press("KeyH");
  await expect.poll(() => hp(page)).toBe(100);
  await expect.poll(() => at(page, "aid")).toBe(-1);
  await expect(cap.locator(".hurt")).toHaveCount(0);
  await page.keyboard.press("KeyH");
  await expect(toast).toHaveText(/no first aid/i);
  // B with the torch full: not wasted, said
  await page.keyboard.press("KeyB");
  await expect(toast).toHaveText(/torch is full/i);
  expect(await total(page, "battery")).toBe(1);
  // (plan 87) 1 is the left hand: the torch lit from it, and off; L no longer anything
  const torch = () =>
    page.evaluate(() => {
      const y = (window as any).__yutopia;
      return !!y.room.state.players.get(y.room.sessionId).torch;
    });
  expect((await inv(page)).hand?.id, "a torch in the left hand").toBe("torch");
  await page.keyboard.press("Digit1");
  await expect.poll(torch).toBe(true);
  await page.keyboard.press("Digit1");
  await expect.poll(torch).toBe(false);
  await page.keyboard.press("KeyL");
  await page.waitForTimeout(400);
  expect(await torch(), "L is nothing now").toBe(false);
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: null }));
  expect(errors).toEqual([]);
});

test.describe("a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("the pack on a phone: tap picks, tap an empty pouch moves it, held the menu, Drop only by a hold", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await prefs(page);
    await kitted(page);
    await page.keyboard.press("KeyI");
    await expect(page.locator(".dk-inv.phone .panel")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const centre = async (l: ReturnType<typeof slot>) => {
      const b = await boxOf(l);
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const tap = async (l: ReturnType<typeof slot>) => {
      const c = await centre(l);
      await page.touchscreen.tap(c.x, c.y);
      await page.waitForTimeout(150);
    };
    const press = async (l: ReturnType<typeof slot>, ms: number) => {
      const c = await centre(l);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] });
      await page.waitForTimeout(ms);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(150);
    };
    // tap the .38s, then an empty pouch: moved there
    const r = await at(page, "r38");
    const free = (await inv(page)).pockets.indexOf(null);
    await tap(slot(page, r));
    await expect(page.locator(".dk-inv .det h2")).toHaveText(/\.38/);
    await shot(page, "tools-phone");
    await tap(slot(page, free));
    await expect.poll(async () => (await inv(page)).pockets[free]?.id).toBe("r38");
    await expect.poll(async () => (await inv(page)).pockets[r]).toBe(null);
    // a touch held on the battery: the menu
    const menu = page.locator(".dk-inv-menu");
    await press(slot(page, await at(page, "battery")), 700);
    await expect(menu).toBeVisible();
    await shot(page, "tools-phone-menu");
    await menu.locator('[data-menu="drop"]').tap();
    await expect.poll(() => at(page, "battery")).toBe(-1);
    // the tag's Drop: a tap drops nothing, a hold drops the flares
    await tap(slot(page, await at(page, "flare")));
    const drop = page.locator('.dk-inv .det [data-act="drop"]');
    await expect(drop).toContainText(/hold/i);
    await drop.tap();
    await page.waitForTimeout(800);
    expect(await total(page, "flare")).toBe(3);
    await press(drop, 800);
    await expect.poll(() => total(page, "flare")).toBe(0);
    // ✕ closes; the things back
    await page.locator(".dk-inv .top .x").tap();
    await expect(page.locator(".dk-inv .panel")).toBeHidden();
    await page.evaluate(() => (window as any).__yutopia.room.send("dark:takeAll", {}));
    await expect.poll(() => total(page, "flare")).toBe(3);
    expect(errors).toEqual([]);
  });
});
