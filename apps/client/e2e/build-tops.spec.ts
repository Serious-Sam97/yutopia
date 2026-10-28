/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, holdCamera, test, token, useWorld } from "./helpers";

// Desks come bare and you dress them, Sims-style: things from the "On desks &
// tables" tab go on a quarter-tile grid on the top (several per tile), move
// cell by cell, and ride along when the desk moves or turns. In the Lab
// (the build sandbox); everything made here is removed at the end.
const SHOTS = process.env.YUTOPIA_SHOTS;

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
const build = (page: Page) => page.evaluate(() => (window as any).__hud.get().build);

test("dress a desk: many things on top, moved cell by cell, carried with the desk", async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  const before = new Set<string>(await page.evaluate(() => [...(window as any).__yutopia.room.state.objects.keys()]));
  // the things made here (by id), as [kind/d, tile x, y, rot, cell]
  const mine = () =>
    page.evaluate(
      (skip) =>
        [...(window as any).__yutopia.floorObjects()]
          .filter((o: any) => (o.kind === "tabletop" || o.kind === "computer") && !skip.includes(o.id))
          .map((o: any) => ({ id: o.id, x: o.x, y: o.y, rot: o.rot, p: JSON.parse(o.props) })),
      [...before],
    );
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const D = { x: Math.floor(sp.x) + 2, y: Math.floor(sp.y) + 2 };
  const desk = `e2e-desk-${Date.now().toString(36)}`;
  try {
    await page.evaluate(
      ([id, d]) => (window as any).__yutopia.send("obj:put", { id, kind: "desk", x: d.x, y: d.y, rot: 0 }),
      [desk, D] as const,
    );
    await expect.poll(() => page.evaluate((id) => !!(window as any).__yutopia.model.getObject(id), desk)).toBe(true);
    await holdCamera(page, { at: { x: D.x + 1, y: D.y + 0.5 }, dist: 4.5, pitch: 1.0 });
    await page.evaluate(() => {
      const h = (window as any).__hud;
      h.set({ build: { ...h.get().build, on: true, tool: "furniture", mode: "hand", selected: [] } });
    });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
    await page.getByRole("tab", { name: "On desks & tables" }).click();

    // ── a workstation, piece by piece: seven things on one desk
    const plan: [string, number, number][] = [
      ["Computer", D.x + 0.5, D.y + 0.75],
      ["Keyboard", D.x + 0.5, D.y + 0.15],
      ["Mug", D.x + 0.9, D.y + 0.3],
      ["Desk lamp", D.x + 1.85, D.y + 0.85],
      ["Photo frame", D.x + 1.4, D.y + 0.85],
      ["Succulent", D.x + 1.85, D.y + 0.4],
      ["Papers", D.x + 1.4, D.y + 0.3],
    ];
    for (const [i, [label, x, y]] of plan.entries()) {
      await page.getByRole("button", { name: label, exact: true }).last().click(); // (not the "recently used" one)
      const p = await at(page, x, y, 25);
      await page.mouse.move(p.x, p.y, { steps: 4 });
      await page.waitForTimeout(150);
      expect((await build(page)).fits, label).toBe(true);
      await page.mouse.click(p.x, p.y);
      await expect.poll(async () => (await mine()).length, { message: label }).toBe(i + 1);
    }
    const all = await mine();
    expect(all.every((t) => t.p.z === 25)).toBe(true); // at the desk's height
    expect(new Set(all.map((t) => `${t.x},${t.y}`)).size).toBe(2); // all on its two tiles
    // not on the floor
    await page.getByRole("button", { name: "Mug", exact: true }).last().click();
    const floor = await at(page, D.x + 0.5, D.y + 2.5);
    await page.mouse.move(floor.x, floor.y, { steps: 4 });
    await expect.poll(async () => (await build(page)).fits).toBe(false);
    await page.keyboard.press("Escape");
    await page.mouse.move(5, 400);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/build-desk-dressed.png` });

    // ── the mug, a quarter tile over
    const mug = all.find((t) => t.p.d === "mug");
    const m = await at(page, D.x + 0.9, D.y + 0.3, 30);
    await page.mouse.move(m.x, m.y);
    await page.waitForTimeout(150);
    await page.mouse.click(m.x, m.y);
    await expect.poll(async () => (await build(page)).held).toEqual([mug.id]);
    const m2 = await at(page, D.x + 1.15, D.y + 0.3, 30);
    await page.mouse.move(m2.x, m2.y, { steps: 3 });
    await page.waitForTimeout(150);
    await page.mouse.click(m2.x, m2.y);
    await expect
      .poll(async () => {
        const t = (await mine()).find((x) => x.id === mug.id);
        return t.x * 4 + t.p.c[0];
      })
      .toBe(mug.x * 4 + mug.p.c[0] + 1);

    // ── drag the desk (by its front) two tiles back: everything rides along
    const placed = await mine();
    const from = await at(page, D.x + 0.3, D.y + 1, 10);
    const to = await at(page, D.x + 0.3, D.y - 1, 10);
    await page.mouse.move(from.x, from.y);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.waitForTimeout(250);
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate((id) => (window as any).__yutopia.model.getObject(id)?.y, desk))
      .toBe(D.y - 2);
    await expect
      .poll(async () => (await mine()).every((t) => placed.find((p) => p.id === t.id)?.y === t.y + 2))
      .toBe(true);

    // ── turn it (it's selected after the drop): they turn with it
    await page.keyboard.press("r");
    await expect.poll(() => page.evaluate((id) => (window as any).__yutopia.model.getObject(id)?.rot, desk)).toBe(1);
    await expect.poll(async () => (await mine()).every((t) => t.rot === 1)).toBe(true);
    await page.keyboard.press("Escape");
  } finally {
    // the desk goes, and what's on it with it
    await page.evaluate((id) => (window as any).__yutopia.send("obj:remove", { id }), desk).catch(() => {});
    await expect.poll(async () => (await mine()).length).toBe(0);
    await page.evaluate(() => {
      const h = (window as any).__hud;
      h.set({ build: { ...h.get().build, on: false } });
    });
  }
});

// The bin removes what's dropped on it, and only that: after using it, plain
// moves put things down (it once kept thinking the pointer was over it).
test("the bin takes only what's dropped on it", async ({ page }) => {
  test.setTimeout(120_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  const exists = (id: string) => page.evaluate((i) => !!(window as any).__yutopia.room.state.objects.get(i), id);
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const P = { x: Math.floor(sp.x) + 2, y: Math.floor(sp.y) - 1 };
  const stamp = Date.now().toString(36);
  const [a, b] = [`e2e-bin-a-${stamp}`, `e2e-bin-b-${stamp}`];
  try {
    await page.evaluate(
      ([a, b, p]) => {
        const w = (window as any).__yutopia;
        w.send("obj:put", { id: a, kind: "plant", x: p.x, y: p.y, rot: 0 });
        w.send("obj:put", { id: b, kind: "plant", x: p.x + 2, y: p.y, rot: 0 });
      },
      [a, b, P] as const,
    );
    await expect.poll(() => exists(b)).toBe(true);
    await holdCamera(page, { at: { x: P.x + 2, y: P.y + 1 }, dist: 7 });
    await page.evaluate(() => {
      const h = (window as any).__hud;
      h.set({ build: { ...h.get().build, on: true, tool: "furniture", mode: "hand", selected: [] } });
    });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
    await page.waitForTimeout(600);
    // click A, carry it over the bin, click: gone
    const pa = await at(page, P.x + 0.5, P.y + 0.5, 30);
    await page.mouse.move(pa.x, pa.y);
    await page.waitForTimeout(150);
    await page.mouse.click(pa.x, pa.y);
    await expect.poll(async () => (await build(page)).held).toEqual([a]);
    const bin = await page.getByText("Drop here to remove").boundingBox();
    if (!bin) throw new Error("no bin while carrying");
    await page.mouse.move(bin.x + bin.width / 2, bin.y + bin.height / 2, { steps: 8 });
    await page.mouse.click(bin.x + bin.width / 2, bin.y + bin.height / 2);
    await expect.poll(() => exists(a)).toBe(false);
    // then click B, carry it two tiles, click: it moves (and stays)
    const pb = await at(page, P.x + 2.5, P.y + 0.5, 30);
    await page.mouse.move(pb.x, pb.y, { steps: 6 });
    await page.waitForTimeout(150);
    await page.mouse.click(pb.x, pb.y);
    await expect.poll(async () => (await build(page)).held).toEqual([b]);
    const to = await at(page, P.x + 2.5, P.y + 2.5, 30);
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.waitForTimeout(150);
    await page.mouse.click(to.x, to.y);
    await expect.poll(() => page.evaluate((i) => (window as any).__yutopia.model.getObject(i)?.y, b)).toBe(P.y + 2);
    await page.waitForTimeout(600);
    expect(await exists(b)).toBe(true);
    // and dragging something onto the bin still removes it
    const pb2 = await at(page, P.x + 2.5, P.y + 2.5, 30);
    await page.mouse.move(pb2.x, pb2.y);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.mouse.move(pb2.x + 20, pb2.y, { steps: 4 });
    await expect(page.getByText("Drop here to remove")).toBeVisible();
    await page.mouse.move(bin.x + bin.width / 2, bin.y + bin.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => exists(b)).toBe(false);
  } finally {
    await page.evaluate(
      ([a, b]) => {
        const w = (window as any).__yutopia;
        for (const i of [a, b]) if (w.room.state.objects.get(i)) w.send("obj:remove", { id: i });
      },
      [a, b] as const,
    );
    await page.waitForTimeout(400);
  }
});
