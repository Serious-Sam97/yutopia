/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, holdCamera, test, token, useWorld, walkTo } from "./helpers";

// Build mode works like The Sims: pick up what you see (click its body), carry
// it, drop it; drag to move; box-select; turn, copy, delete; pick a look;
// generated clutter turns into real things you can move.

// A point on screen over a tile, `z` px up (to hit a thing's body, not the floor).
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
      [...(window as any).__yutopia.floorObjects()]
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
  await enter(page, tok, await useWorld("demo"));
  await walkTo(page, 9.5, 13.5, 30_000);
  // hold the camera still (a moving camera makes a click land on the next tile)
  await holdCamera(page, { at: { x: 11, y: 10 }, dist: 10 });
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

    // ── pick it up, carry, drop two tiles over (aimed at floor points: the ray meets its leaves
    // first, and the floor point under the pointer is what carries it)
    await click(page, 10.5, 10.5);
    await expect.poll(async () => (await build(page)).carrying).toBe(1);
    await click(page, 12.5, 10.5);
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
    // (aimed at floor points inside it: the ray meets its body first, and the floor point under
    // the pointer is what carries it — in perspective a raised point's floor point drifts)
    const from = await at(page, 10, 9.5);
    const to = await at(page, 13, 9.5);
    await page.mouse.move(from.x, from.y);
    await page.waitForTimeout(150);
    await page.mouse.down();
    // (a nudge past the drag's threshold, held till it's in hand: the hand takes it where the
    // pointer is when the pick-up lands — sweeping on at once, it lands a tile short)
    await page.mouse.move(from.x + 8, from.y, { steps: 2 });
    await expect.poll(async () => (await build(page)).carrying).toBe(1);
    await page.mouse.move(to.x + 8, to.y, { steps: 12 });
    await page.waitForTimeout(250);
    await page.mouse.up();
    await expect.poll(() => objectsAt(page, 12, 9)).toEqual([expect.objectContaining({ id: desk })]);
    // (shown again once its move has landed: until then it can't be picked)
    await expect
      .poll(() => page.evaluate((id) => (window as any).__yutopia.model.buildLook().hidden.has(id), desk))
      .toBe(false);

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
  await enter(page, tok, await useWorld("demo"));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp?.world.picks.length, null, { timeout: 30_000 });
  // a piece of floor clutter (boxes by a wall, a bin…) the rules placed, away from real things
  // (the 3D view's picks: its box, tiles)
  const piece = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const objs = w.model.allObjects();
    const d = w.tp.world.picks.find((p: any) => {
      if (!p.dress || p.dress.kind === "frame" || p.z0 > 0.2) return false;
      const x = (p.x0 + p.x1) / 2;
      const y = (p.y0 + p.y1) / 2;
      return !objs.some((o: any) => Math.abs(o.x + 0.5 - x) < 1.6 && Math.abs(o.y + 0.5 - y) < 1.6);
    });
    return d
      ? { id: d.id, kind: d.dress.kind, x: (d.x0 + d.x1) / 2, y: (d.y0 + d.y1) / 2, h: (d.z0 + d.z1) / 2 }
      : null;
  });
  expect(piece, "a piece of clutter").toBeTruthy();
  const q = piece as { id: string; kind: string; x: number; y: number; h: number };
  // go and look at it (people arrive at the arrival point, not by this clutter)
  await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 1.5, y: p.y + 1.5 }), q);
  await page.waitForTimeout(1500);
  await setBuild(page, { on: true, tool: "furniture", mode: "hand", selected: [] });
  await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
  await holdCamera(page, { dist: 5 });
  await page.waitForTimeout(600);
  // point at it: the hover tag names it; click to pick it up
  // the middle of its box on screen
  const p = await page.evaluate((d) => {
    const t = (window as any).__yutopia.tp;
    const r = t.renderer.domElement.getBoundingClientRect();
    const s = t.project(d.x, d.y, d.h);
    return { x: r.left + s.x, y: r.top + s.y };
  }, q);
  await page.mouse.move(p.x, p.y);
  await expect.poll(async () => (await build(page)).hover?.label ?? "").not.toBe("");
  await page.mouse.click(p.x, p.y);
  const real = `x-${q.id}`;
  await expect.poll(async () => (await build(page)).held).toEqual([real]);
  await page.keyboard.press("Escape");
  const o = await page.evaluate((id) => (window as any).__yutopia.model.getObject(id), real);
  expect(o.kind).toBe("decor");
  expect(o.props.d).toBe(q.kind);
  // undo puts the studio back the way the rules made it
  await page.waitForTimeout(900);
  await page.evaluate(() => (window as any).__yutopia.undo());
  await expect.poll(() => page.evaluate((id) => !!(window as any).__yutopia.model.getObject(id), real)).toBe(false);
  await setBuild(page, { on: false });
});
