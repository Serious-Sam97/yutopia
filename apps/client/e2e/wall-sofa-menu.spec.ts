/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, useWorld } from "./helpers";

// Three fixes, in the Lab (everything put out is removed after): things that
// hang on a wall go on a west wall too (turned, rot 3); people stay clickable
// after build mode closes; the sofa seats people.

async function at(page: Page, x: number, y: number, z = 0) {
  return page.evaluate(
    ([tx, ty, tz]) => {
      const e = (window as any).__yutopia.engine;
      const r = e.app.canvas.getBoundingClientRect();
      const s = e.worldToClient(tx, ty, tz);
      return { x: r.left + s.x, y: r.top + s.y };
    },
    [x, y, z],
  );
}
async function clickAt(page: Page, x: number, y: number, z: number) {
  const p = await at(page, x, y, z);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(100);
  await page.mouse.click(p.x, p.y);
}
const put = (page: Page, o: Record<string, unknown>) =>
  page.evaluate((x) => (window as any).__yutopia.send("obj:put", x), o);
const obj = (page: Page, id: string) =>
  page.evaluate((i) => {
    const o = (window as any).__yutopia.room.state.objects.get(i);
    return o ? { x: o.x, y: o.y, rot: o.rot } : null;
  }, id);
const setBuild = (page: Page, b: Record<string, unknown>) =>
  page.evaluate((p) => {
    const h = (window as any).__hud;
    h.set({ build: { ...h.get().build, ...p } });
  }, b);

test("wall things hang on a west wall", async ({ page }) => {
  test.setTimeout(90_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  const id = `e2e-west-${Date.now().toString(36)}`;
  // two tiles of solid west wall (no window, nothing hung there) with a solid
  // north wall within reach: where a whiteboard goes and comes back from
  const spot = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.map;
    const solid = (ch: string | undefined) => !!ch && "pwfbk".includes(ch);
    const floor = (x: number, y: number) => {
      const ch = m.tiles[y]?.[x];
      return !!ch && ch !== " " && ch !== "#";
    };
    const hung = [...w.room.state.objects.values()].filter((o: any) =>
      ["board_wall", "screen_wall", "whiteboard", "notice_board", "poster", "frame", "clock", "neon"].includes(o.kind),
    );
    const free = (x: number, y: number) => !hung.some((o: any) => Math.abs(o.x - x) < 5 && Math.abs(o.y - y) < 5);
    for (let y = 1; y < m.height - 2; y++)
      for (let x = 0; x < m.width; x++) {
        if (![0, 1].every((d) => solid(m.vWalls[y + d]?.[x]) && floor(x, y + d))) continue;
        if (!free(x, y)) continue;
        for (let yy = y - 2; yy <= y + 2; yy++)
          if ([0, 1].every((d) => solid(m.hWalls[yy]?.[x + d]) && floor(x + d, yy))) return { x, y };
      }
    return null;
  });
  expect(spot, "the Lab has a free stretch of west wall by a corner").not.toBeNull();
  const { x, y } = spot as { x: number; y: number };
  try {
    await put(page, { id, kind: "whiteboard", x, y, rot: 3, props: {} });
    await expect.poll(() => obj(page, id)).toEqual({ x, y, rot: 3 });
    await page.evaluate(
      ([cx, cy]) => (window as any).__yutopia.engine.pinCamera({ x: cx, y: cy, zoom: 2.4 }),
      [x + 1.5, y + 1.5],
    );
    await page.waitForTimeout(800);
    // drawn on that wall: its outline runs along y (taller than wide on screen
    // would be wrong for a wall board; its hull spans the wall's slope instead)
    const hull = await page.evaluate((i) => (window as any).__yutopia.engine.hullOf(i), id);
    expect(hull?.length).toBeGreaterThan(4);
    await page.screenshot({ path: test.info().outputPath("west-wall.png") });

    // (turning one now takes it over to its wall's other side: wall-faces.spec.ts)
  } finally {
    await page.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id);
  }
});

test("after build mode, people (and you) are clickable again", async ({ page }) => {
  test.setTimeout(60_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  await setBuild(page, { on: true, tool: "furniture", mode: "hand", selected: [] });
  await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => (window as any).__yutopia.engine.passAvatars)).toBe(true);
  // out with Esc, the way people leave it
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => (window as any).__hud.get().build.on)).toBe(false);
  expect(await page.evaluate(() => (window as any).__yutopia.engine.passAvatars)).toBe(false);
  // click myself: my menu
  const me = await page.evaluate(() => (window as any).__yutopia.meTile());
  await page.evaluate(
    ([cx, cy]) => (window as any).__yutopia.engine.pinCamera({ x: cx, y: cy, zoom: 2 }),
    [me.x, me.y],
  );
  await page.waitForTimeout(400);
  const p = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    return w.engine.avatars.get(w.room.sessionId).state;
  });
  await clickAt(page, p.x, p.y, 40);
  await expect(page.getByRole("menu")).toBeVisible();
});

test("the sofa: click it, Sit, and you sit on it", async ({ page }) => {
  test.setTimeout(60_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  const id = `e2e-sofa-${Date.now().toString(36)}`;
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const X = Math.floor(sp.x) - 1;
  const Y = Math.floor(sp.y) - 3;
  try {
    await put(page, { id, kind: "sofa", x: X, y: Y, rot: 0, props: {} });
    await expect.poll(() => obj(page, id)).toEqual({ x: X, y: Y, rot: 0 });
    await page.evaluate(
      ([cx, cy]) => (window as any).__yutopia.engine.pinCamera({ x: cx, y: cy, zoom: 2 }),
      [X + 1.5, Y + 1],
    );
    await page.waitForTimeout(500);
    await clickAt(page, X + 1.5, Y + 0.5, 14);
    const menu = page.getByRole("menu", { name: /Sofa/ });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Sit" }).click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = (window as any).__yutopia;
            const p = w.room.state.players.get(w.room.sessionId);
            return { a: p.a, y: Math.floor(p.y) };
          }),
        { timeout: 20_000 },
      )
      .toEqual({ a: 2, y: Y });
    await page.screenshot({ path: test.info().outputPath("sofa.png") });
  } finally {
    await page.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id);
  }
});
