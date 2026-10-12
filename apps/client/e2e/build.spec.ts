/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page, test } from "@playwright/test";
import { ANA, enter, spaceId, token, walkTo } from "./helpers";

// Build mode works like The Sims: pick up what you see (click its body), carry
// it, drop it; drag to move; box-select; turn, copy, delete; pick a look;
// generated clutter turns into real things you can move.

// A point on screen over a tile, `z` px up (to hit a thing's body, not the floor).
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
async function click(page: Page, x: number, y: number, z = 0) {
  const p = await at(page, x, y, z);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(120);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(120);
}
const objectsAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([tx, ty]) =>
      [...(window as any).__yutopia.room.state.objects.values()]
        .filter((o: any) => o.x === tx && o.y === ty)
        .map((o: any) => ({ id: o.id, kind: o.kind, rot: o.rot, props: JSON.parse(o.props) })),
    [x, y],
  );
const build = (page: Page) => page.evaluate(() => (window as any).__hud.get().build);
const setBuild = (page: Page, patch: Record<string, unknown>) =>
  page.evaluate((p) => {
    const h = (window as any).__hud;
    h.set({ build: { ...h.get().build, ...p } });
  }, patch);

test("build mode: pick up what you see, carry, drop, select, copy, look, clutter", async ({ page }) => {
  test.setTimeout(240_000);
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok));
  await walkTo(page, 9.5, 13.5, 30_000);
  // hold the camera still (a moving camera makes a click land on the next tile)
  await page.evaluate(() => (window as any).__yutopia.engine.pinCamera({ x: 11, y: 10, zoom: 1.8 }));
  await setBuild(page, { on: true, tool: "furniture", mode: "hand", selected: [] });
  await expect(page.getByRole("region", { name: /build mode/i })).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
  const made: string[] = [];
  try {
    // ── place from the catalog: the item follows the pointer, a click puts it down
    await page.getByRole("tab", { name: "Decor" }).click();
    await page.getByRole("button", { name: "Plant", exact: true }).click();
    expect((await build(page)).mode).toBe("place");
    await click(page, 10.5, 10.5);
    await expect.poll(() => objectsAt(page, 10, 10)).toEqual([expect.objectContaining({ kind: "plant" })]);
    const plant = (await objectsAt(page, 10, 10))[0].id;
    made.push(plant);
    expect((await build(page)).mode).toBe("hand"); // one placed, back to the hand (Shift keeps placing)

    // ── pick it up by its leaves (well above the floor tile), carry, drop: it
    // keeps where you hold it, so let go at the same height two tiles over
    await click(page, 10.5, 10.5, 40);
    await expect.poll(async () => (await build(page)).carrying).toBe(1);
    await click(page, 12.5, 10.5, 40);
    await expect.poll(() => objectsAt(page, 12, 10)).toEqual([expect.objectContaining({ id: plant })]);
    await page.screenshot({ path: "../../design/screens/05-build.png" });

    // ── pick up, turn, then Esc: it goes back exactly where it was
    await click(page, 12.5, 10.5, 40);
    await page.keyboard.press("r");
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await build(page)).carrying).toBe(0);
    expect(await objectsAt(page, 12, 10)).toEqual([expect.objectContaining({ id: plant })]);

    // ── drag a desk by its body to a new spot
    await setBuild(page, { mode: "place", kind: "desk", props: null, rot: 0 });
    await click(page, 9.5, 9.5);
    await expect.poll(() => objectsAt(page, 9, 9)).toEqual([expect.objectContaining({ kind: "desk" })]);
    const desk = (await objectsAt(page, 9, 9))[0].id;
    made.push(desk);
    const from = await at(page, 10, 9.5, 22);
    const to = await at(page, 13, 9.5, 22);
    await page.mouse.move(from.x, from.y);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.waitForTimeout(250);
    await page.mouse.up();
    await expect.poll(() => objectsAt(page, 12, 9)).toEqual([expect.objectContaining({ id: desk })]);

    // ── a look for the desk (Design tool): pick variant 3 from the item toolbar
    await click(page, 13, 9.5, 22); // pick up…
    await page.keyboard.press("Escape"); // …and put back: it stays selected
    await expect.poll(async () => (await build(page)).selected).toContain(desk);
    await page.getByRole("button", { name: "Look" }).first().click();
    await page.getByRole("button", { name: "Look 3" }).click();
    await expect.poll(async () => (await objectsAt(page, 12, 9))[0]?.props.variant).toBe(2);

    // ── duplicate the selection (Ctrl/Cmd+D): the copy is on the pointer, click to place it
    const dup = await at(page, 14.5, 10.5);
    await page.mouse.move(dup.x, dup.y);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+d" : "Control+d");
    await expect.poll(async () => (await build(page)).carrying).toBe(1);
    await click(page, 14.5, 10.5);
    await expect.poll(() => objectsAt(page, 14, 10)).toEqual([expect.objectContaining({ kind: "desk" })]);
    made.push((await objectsAt(page, 14, 10))[0].id);

    // ── box-select both desks and delete them together
    // from a free tile (pressing on a thing would pick it up instead)
    const a = await at(page, 13.5, 10.5);
    const b = await at(page, 15.5, 9.5);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => (await build(page)).selected.length).toBe(2);
    await page.keyboard.press("Delete");
    await expect.poll(async () => [...(await objectsAt(page, 12, 9)), ...(await objectsAt(page, 14, 10))]).toEqual([]);

    // ── eyedropper: click the plant to place copies of it
    await page.keyboard.press("e");
    expect((await build(page)).mode).toBe("eyedrop");
    await click(page, 12.5, 10.5, 40);
    await expect.poll(async () => (await build(page)).mode).toBe("place");
    expect((await build(page)).kind).toBe("plant");
    await page.keyboard.press("Escape");
  } finally {
    // tidy the demo studio
    await page.evaluate((ids) => {
      const w = (window as any).__yutopia;
      const live = ids.filter((id: string) => w.room.state.objects.get(id));
      if (live.length) w.send("obj:removeMany", { ids: live });
    }, made);
    await page.waitForTimeout(500);
    await setBuild(page, { on: false });
  }
});

test("generated clutter becomes a real thing you can move", async ({ page }) => {
  test.setTimeout(150_000);
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok));
  await setBuild(page, { on: true, tool: "furniture", mode: "hand", selected: [] });
  await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
  // a piece of floor clutter (boxes by a wall, a bin…) the rules placed, away from real things
  const piece = await page.evaluate(() => {
    const e = (window as any).__yutopia.engine;
    const free = (v: any) =>
      !e.allObjects().some((o: any) => Math.abs(o.x + 0.5 - v.at[0]) < 1.6 && Math.abs(o.y + 0.5 - v.at[1]) < 1.6);
    const d = e.dress.find(
      (v: any) => v.piece && !v.piece.host && v.piece.kind !== "frame" && v.root.visible && free(v),
    );
    return d ? { id: d.piece.id, kind: d.piece.kind, x: d.at[0], y: d.at[1] } : null;
  });
  // point at it: the hover tag names it; click to pick it up
  // the middle of its drawing on screen
  const p = await page.evaluate((id) => {
    const e = (window as any).__yutopia.engine;
    const d = e.dress.find((v: any) => v.piece?.id === id);
    const b = d.root.getBounds();
    const r = e.app.canvas.getBoundingClientRect();
    return { x: r.left + b.x + b.width / 2, y: r.top + b.y + b.height * 0.55 };
  }, piece.id);
  await page.mouse.move(p.x, p.y);
  await expect.poll(async () => (await build(page)).hover?.label ?? "").not.toBe("");
  await page.mouse.click(p.x, p.y);
  const real = `x-${piece.id}`;
  await expect.poll(async () => (await build(page)).held).toEqual([real]);
  await page.keyboard.press("Escape");
  const o = await page.evaluate((id) => (window as any).__yutopia.engine.getObject(id), real);
  expect(o.kind).toBe("decor");
  expect(o.props.d).toBe(piece.kind);
  // undo puts the studio back the way the rules made it
  await page.waitForTimeout(900);
  await page.evaluate(() => (window as any).__yutopia.undo());
  await expect.poll(() => page.evaluate((id) => !!(window as any).__yutopia.engine.getObject(id), real)).toBe(false);
  await setBuild(page, { on: false });
});
