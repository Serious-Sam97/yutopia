/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, useWorld, walkTo } from "./helpers";

// Things to use, Sims-style: walk up, press X — the water cooler pours you a
// cup and the vending machine drops a can (in hand, sipped little by little),
// the piano opens its keys (you're shown playing). In the Lab; removed after.
const held = (page: Page) => page.evaluate(() => (window as any).__hud.get().held?.kind ?? "");
const mine = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    return w.room.state.players.get(w.room.sessionId);
  });

test("a cup from the cooler, a can from the machine, a tune on the piano", async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const X = Math.floor(sp.x) - 4;
  const Y = Math.floor(sp.y) - 5;
  const stamp = Date.now().toString(36);
  const items = [
    { id: `e2e-cool-${stamp}`, kind: "water_cooler", x: X, y: Y, rot: 0 },
    { id: `e2e-vend-${stamp}`, kind: "vending", x: X + 2, y: Y, rot: 0 },
    { id: `e2e-piano-${stamp}`, kind: "piano", x: X + 4, y: Y, rot: 0 },
  ];
  // walk up to it and settle (the path ends a moment after we're near)
  const goTo = async (x: number, y: number) => {
    await walkTo(page, x, y, 20_000);
    await page.waitForTimeout(500);
  };
  try {
    for (const it of items) await page.evaluate((o) => (window as any).__yutopia.send("obj:put", o), it);
    await expect
      .poll(() => page.evaluate((id) => !!(window as any).__yutopia.room.state.objects.get(id), items[2].id))
      .toBe(true);

    await goTo(X + 0.5, Y + 1.6);
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().prompt?.kind)).toBe("water");
    await page.keyboard.press("x");
    // the cooler does its thing first: you're shown using it, then the cup
    await expect.poll(async () => (await mine(page))?.busy).toBe("water");
    await expect.poll(() => held(page)).toBe("cup");
    await expect(page.getByRole("button", { name: "Put down" })).toBeVisible();

    await goTo(X + 2.5, Y + 1.6);
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().prompt?.kind)).toBe("vending");
    await page.keyboard.press("x");
    await expect.poll(() => held(page)).toBe("soda");
    await page.getByRole("button", { name: "Put down" }).click();
    await expect.poll(() => held(page)).toBe("");

    await goTo(X + 5, Y + 1.6);
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().prompt?.kind)).toBe("piano");
    await page.keyboard.press("x");
    await expect(page.getByRole("button", { name: "C4", exact: true })).toBeVisible();
    await expect.poll(async () => (await mine(page))?.busy).toBe("piano");
    await page.getByRole("button", { name: "E4", exact: true }).click();
    await expect(page.getByText("E4", { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await mine(page))?.busy).toBe("");
  } finally {
    await page.evaluate(
      (ids) => (window as any).__yutopia.send("obj:removeMany", { ids }),
      items.map((i) => i.id),
    );
    await page.evaluate(() => (window as any).__yutopia.send("item:drop", {}));
    await page.waitForTimeout(500);
  }
});

// Each radio and record player plays its own: two far-apart radios on
// different stations — next to each you hear its own station, loud; one off,
// by it you only hear the other's, faint from across the room.
test("every radio its own: its station next to it, the other's faint when it's off", async ({ page }) => {
  test.setTimeout(150_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  const stamp = Date.now().toString(36);
  const ids = [`e2e-r-t1-${stamp}`, `e2e-r-r1-${stamp}`, `e2e-r-t2-${stamp}`, `e2e-r-r2-${stamp}`];
  const level = () => page.evaluate(() => (window as any).__audio.radio.level as number);
  try {
    // two side tables far apart on the open floor, a radio on each
    for (const [i, x] of [
      [0, 3],
      [2, 25],
    ] as const) {
      await page.evaluate((o) => (window as any).__yutopia.send("obj:put", o), {
        id: ids[i],
        kind: "side_table",
        x,
        y: 14,
        rot: 0,
      });
      await page.waitForTimeout(300);
      await page.evaluate((o) => (window as any).__yutopia.send("obj:put", o), {
        id: ids[i + 1],
        kind: "radio",
        x,
        y: 14,
        rot: 0,
        props: { c: [0, 0] },
      });
    }
    await expect
      .poll(() => page.evaluate((r) => r.every((id: string) => !!(window as any).__yutopia.model.getObject(id)), ids))
      .toBe(true);
    // (the music needs the page's audio started: a click does it)
    await page.mouse.click(5, 400);
    const station = () => page.evaluate(() => (window as any).__audio.radio.station as number);
    const set = (id: string, playing: boolean, st = 0) =>
      page.evaluate(([i, p, n]) => (window as any).__yutopia.send("radio:set", { id: i, playing: p, station: n }), [
        id,
        playing,
        st,
      ] as const);
    await set(ids[1], true, 0);
    await set(ids[3], true, 2);
    await walkTo(page, 3.5, 15.6, 30_000);
    await expect.poll(level, { timeout: 10_000 }).toBeGreaterThan(0.6);
    expect(await station()).toBe(0);
    // its own knob: turned down, it's quieter right next to it; back up, loud again
    await page.evaluate((i) => (window as any).__yutopia.send("radio:volume", { id: i, volume: 0.25 }), ids[1]);
    await expect.poll(level, { timeout: 10_000 }).toBeLessThan(0.3);
    expect(await page.evaluate((i) => (window as any).__yutopia.model.getObject(i)?.props?.radio?.volume, ids[3])).toBe(
      0.8,
    );
    await page.evaluate((i) => (window as any).__yutopia.send("radio:volume", { id: i, volume: 1 }), ids[1]);
    await expect.poll(level, { timeout: 10_000 }).toBeGreaterThan(0.9);
    // over by the other one: loud too, and its own station
    await walkTo(page, 25.5, 15.6, 40_000);
    await expect.poll(level, { timeout: 10_000 }).toBeGreaterThan(0.6);
    await expect.poll(station, { timeout: 10_000 }).toBe(2);
    // that one off: by it now, only the first one's station, faint from across the room
    await set(ids[3], false);
    await expect.poll(station, { timeout: 10_000 }).toBe(0);
    await expect.poll(level, { timeout: 10_000 }).toBeLessThan(0.25);
    expect(
      await page.evaluate((i) => (window as any).__yutopia.model.getObject(i)?.props?.radio?.playing, ids[1]),
    ).toBe(true);
  } finally {
    for (const id of [ids[1], ids[3]])
      await page.evaluate((i) => (window as any).__yutopia.send("radio:set", { id: i, playing: false }), id);
    await page.evaluate((x) => (window as any).__yutopia.send("obj:removeMany", { ids: x }), ids);
    await page.waitForTimeout(500);
  }
});
