/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, holdCamera, test, token, useWorld, walkTo } from "./helpers";

// The action menu, Sims-style (in the Lab; everything put out is removed
// after): click a thing → what you can do with it in a ring; picks queue up
// (chips top left), you walk over and do them in order; moving drops the
// queue. Then people (a high five, a drink handed over), focus at your own
// desk, and a light switch for the room.

async function at(page: Page, x: number, y: number, z = 0) {
  return page.evaluate(
    ([tx, ty, tz]) => {
      const w = (window as any).__yutopia;
      const r = w.hostRect();
      const s = w.model.worldToClient(tx, ty, tz);
      return { x: r.left + s.x, y: r.top + s.y };
    },
    [x, y, z],
  );
}
const me = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    const p = w.room.state.players.get(w.room.sessionId);
    return { ...w.meTile(), busy: p.busy, held: p.held, act: p.act, focus: p.focus, sid: w.room.sessionId };
  });
const queue = (page: Page) => page.evaluate(() => (window as any).__hud.get().queue.map((q: any) => q.act));
// click something in the world where it's drawn (z: how high up it)
async function clickAt(page: Page, x: number, y: number, z: number) {
  const p = await at(page, x, y, z);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(100);
  await page.mouse.click(p.x, p.y);
}
const put = (page: Page, o: Record<string, unknown>) =>
  page.evaluate((x) => (window as any).__yutopia.send("obj:put", x), o);

test("the action menu: pick from the ring, the queue walks you over and does it", async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const X = Math.floor(sp.x) - 4;
  const Y = Math.floor(sp.y) - 5;
  const stamp = Date.now().toString(36);
  const piano = `e2e-am-piano-${stamp}`;
  const cooler = `e2e-am-cool-${stamp}`;
  try {
    await put(page, { id: piano, kind: "piano", x: X + 3, y: Y, rot: 0 });
    await put(page, { id: cooler, kind: "water_cooler", x: X, y: Y, rot: 0 });
    await expect.poll(() => page.evaluate((id) => !!(window as any).__yutopia.model.getObject(id), piano)).toBe(true);
    await walkTo(page, X + 1.5, Y + 4.5, 20_000);
    await holdCamera(page, { at: { x: X + 2, y: Y + 2 }, dist: 8 });
    await page.waitForTimeout(400);

    // the ring: what the piano offers, numbered
    await clickAt(page, X + 4, Y + 0.5, 30);
    const menu = page.getByRole("menu", { name: /Upright piano/ });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText(["1Play", "2Play a tune"]);
    // Esc closes it; nothing queued
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    expect(await queue(page)).toEqual([]);

    // two picks: a cup from the cooler, then a tune — done in that order
    await clickAt(page, X + 0.5, Y + 0.5, 30);
    await page.getByRole("menuitem", { name: "Pour a cup" }).click();
    await clickAt(page, X + 4, Y + 0.5, 30);
    await page.keyboard.press("2");
    await expect.poll(() => queue(page)).toEqual(["pour", "tune"]);
    await expect(page.getByRole("list", { name: "Up next" }).getByRole("listitem")).toHaveCount(2);
    // walked to the cooler's front, poured, holding the cup…
    await expect.poll(async () => (await me(page)).held, { timeout: 20_000 }).toBe("cup");
    // …then over to the piano's front, playing it
    await expect.poll(async () => (await me(page)).busy, { timeout: 20_000 }).toBe("piano");
    const m = await me(page);
    expect(Math.hypot(m.x - (X + 4), m.y - (Y + 1.5))).toBeLessThan(0.6);
    await expect.poll(() => queue(page), { timeout: 15_000 }).toEqual([]);

    // moving yourself drops whatever's queued
    await clickAt(page, X + 0.5, Y + 0.5, 30);
    await page.getByRole("menuitem", { name: "Pour a cup" }).click();
    await expect.poll(() => queue(page)).toEqual(["pour"]);
    await page.keyboard.down("ArrowDown");
    await page.waitForTimeout(250);
    await page.keyboard.up("ArrowDown");
    await expect.poll(() => queue(page)).toEqual([]);
  } finally {
    await page.evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), [piano, cooler]);
    await page.evaluate(() => (window as any).__yutopia.send("item:drop", {}));
    await page.waitForTimeout(500);
  }
});

test("people: a high five both of you do, a drink handed over", async ({ browser }) => {
  test.setTimeout(200_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const ctx = { viewport: { width: 1280, height: 820 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  const cooler = `e2e-pp-cool-${Date.now().toString(36)}`;
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: an e2e helper, not a React hook
    const s = await useWorld("lab");
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    const sp = await ana.evaluate(() => (window as any).__yutopia.map.spawn);
    const X = Math.floor(sp.x) - 4;
    const Y = Math.floor(sp.y) - 5;
    await put(ana, { id: cooler, kind: "water_cooler", x: X, y: Y, rot: 0 });
    await walkTo(bia, X + 3.5, Y + 3.5, 20_000);
    await walkTo(ana, X + 1.5, Y + 3.5, 20_000);
    await holdCamera(ana, { at: { x: X + 2, y: Y + 2.5 }, dist: 8 });
    await ana.waitForTimeout(500);
    const biaSid = (await me(bia)).sid;
    const biaAt = async () =>
      ana.evaluate((sid) => {
        const p = (window as any).__yutopia.room.state.players.get(sid);
        return { x: p.x, y: p.y };
      }, biaSid);

    // click Bia: what you can do with her (no drinks yet: no cheers, no handing over)
    let b = await biaAt();
    await clickAt(ana, b.x, b.y, 40);
    const menu = ana.getByRole("menu", { name: /Bia/ });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "High five" })).toBeEnabled();
    await expect(menu.getByRole("menuitem", { name: "Hand over your drink" })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "High five" }).click();
    // Ana steps up beside her; both of them do it, Bia hears about it
    await expect.poll(async () => (await me(bia)).act, { timeout: 15_000 }).toBe("highfive");
    expect((await me(ana)).act).toBe("highfive");
    await expect(bia.getByText(/high-fived you/)).toBeVisible();
    await expect.poll(async () => (await me(ana)).act, { timeout: 5000 }).toBe("");

    // a cup from the cooler, then handed to Bia
    await clickAt(ana, X + 0.5, Y + 0.5, 30);
    await ana.getByRole("menuitem", { name: "Pour a cup" }).click();
    await expect.poll(async () => (await me(ana)).held, { timeout: 20_000 }).toBe("cup");
    b = await biaAt();
    await clickAt(ana, b.x, b.y, 40);
    await ana.getByRole("menuitem", { name: "Hand over your drink" }).click();
    await expect.poll(async () => (await me(bia)).held, { timeout: 15_000 }).toBe("cup");
    expect((await me(ana)).held).toBe("");
  } finally {
    await ana.evaluate((id) => (window as any).__yutopia.send("obj:remove", { id }), cooler);
    await bia.evaluate(() => (window as any).__yutopia.send("item:drop", {}));
    await ana.waitForTimeout(500);
  }
});

test("my desk: focus with headphones on; the room's lights by the switch; a card done", async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  const stamp = Date.now().toString(36);
  const sw = `e2e-sw-${stamp}`;
  const lamp = `e2e-lamp-${stamp}`;
  // a desk with a chair at it, in a room: hers for now (as it was, after)
  const desk = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const objs = w.model.allObjects();
    const d = objs.find(
      (o: any) =>
        o.kind === "desk" &&
        objs.some((c: any) => c.kind === "chair" && Math.abs(c.x - o.x) <= 2 && Math.abs(c.y - o.y) <= 1),
    );
    return d ? JSON.parse(JSON.stringify(d)) : null;
  });
  expect(desk, "the Lab has a desk with a chair").toBeTruthy();
  const uid = await page.evaluate(() => (window as any).__yutopia.myUid());
  try {
    await page.evaluate(
      ([id, owner]) => (window as any).__yutopia.send("desk:assign", { id, ownerId: owner, ownerName: "Ana Demo" }),
      [desk.id, uid],
    );
    await expect
      .poll(() => page.evaluate((id) => (window as any).__yutopia.model.getObject(id)?.props?.ownerId, desk.id))
      .toBe(uid);
    await holdCamera(page, { at: { x: desk.x + 1, y: desk.y }, dist: 8 });
    await page.waitForTimeout(400);

    // my desk: Focus — I go and sit, headphones on, the chip says so (from
    // over by the door, so it's the desk that's clicked, not me)
    await walkTo(page, desk.x + 1, desk.y + 2.5, 20_000);
    await clickAt(page, desk.x + 1, desk.y + 0.5, 22);
    await expect(page.getByRole("menu", { name: /Desk/ })).toBeVisible();
    await page.getByRole("menuitem", { name: "Focus" }).click({ timeout: 5000 });
    await expect.poll(async () => (await me(page)).focus, { timeout: 20_000 }).toBe(true);
    await expect(page.getByText("Focusing 🎧")).toBeVisible();
    expect(
      await page.evaluate(() => {
        const w = (window as any).__yutopia;
        return w.model.avatars.get(w.room.sessionId).avatar.accessory;
      }),
    ).toBe("headphones");
    await page.getByRole("button", { name: "Stop focusing" }).click({ timeout: 5000 });
    await expect.poll(async () => (await me(page)).focus).toBe(false);

    // a light switch on the wall behind the desk, a lamp in the room
    const spots = await page.evaluate(
      ([dx, dy]) => {
        const w = (window as any).__yutopia;
        const area = w.map.areas.find(
          (a: any) => a.key !== "main" && dx >= a.x && dx < a.x + a.w && dy >= a.y && dy < a.y + a.h,
        );
        return { area: area ? { x: area.x, y: area.y, w: area.w, h: area.h } : null };
      },
      [desk.x, desk.y],
    );
    expect(spots.area, "the desk is in a room").toBeTruthy();
    const a = spots.area as { x: number; y: number; w: number; h: number };
    await put(page, { id: sw, kind: "light_switch", x: a.x + a.w - 1, y: a.y, rot: 0 });
    await put(page, { id: lamp, kind: "lamp", x: a.x, y: a.y + a.h - 1, rot: 0 });
    await expect.poll(() => page.evaluate((id) => !!(window as any).__yutopia.model.getObject(id), lamp)).toBe(true);
    await holdCamera(page, { at: { x: a.x + a.w - 1, y: a.y }, dist: 8 });
    await page.waitForTimeout(400);
    await clickAt(page, a.x + a.w - 0.5, a.y + 0.05, 38);
    await page.getByRole("menuitem", { name: "Lights off" }).click({ timeout: 5000 });
    await expect
      .poll(() => page.evaluate((id) => (window as any).__yutopia.model.getObject(id)?.props?.on, lamp), {
        timeout: 20_000,
      })
      .toBe(false);

    // E at the switch: back on, and the keys still walk me (no panel left
    // open behind it to swallow them)
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().prompt?.objectId)).toBe(sw);
    await page.keyboard.press("e");
    await expect
      .poll(() => page.evaluate((id) => (window as any).__yutopia.model.getObject(id)?.props?.on, lamp), {
        timeout: 20_000,
      })
      .not.toBe(false);
    expect(await page.evaluate(() => (window as any).__hud.get().panel.kind)).toBeNull();
    const from = await me(page);
    await page.keyboard.down("s");
    await page.waitForTimeout(600);
    await page.keyboard.up("s");
    const to = await me(page);
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeGreaterThan(0.5);
  } finally {
    // as it was: unassigned first (that lands), then its own props back
    await page.evaluate(
      ([d, ids]) => {
        const w = (window as any).__yutopia;
        w.send("obj:removeMany", { ids });
        w.send("focus", { on: false });
        w.send("desk:assign", { id: d.id, ownerId: null, ownerName: null });
      },
      [desk, [sw, lamp]] as const,
    );
    await expect
      .poll(() => page.evaluate((id) => (window as any).__yutopia.model.getObject(id)?.props?.ownerId ?? 0, desk.id))
      .toBe(0);
    await page.evaluate(
      (d) =>
        (window as any).__yutopia.send("obj:put", {
          id: d.id,
          kind: d.kind,
          x: d.x,
          y: d.y,
          rot: d.rot ?? 0,
          props: d.props ?? {},
        }),
      desk,
    );
    await page.waitForTimeout(600);
  }
});
