/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page, request } from "@playwright/test";
import { ANA, API, enter, spaceId, test, token } from "./helpers";

// Build mode, in the Lab: Tab steps through things stacked under the pointer
// (a computer on a desk, then the desk), and a dressed desk saved as one of
// "My setups" goes down again anywhere, its things on it. Removed after.
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
const build = (page: Page) => page.evaluate(() => (window as any).__hud.get().build);
const mine = (page: Page, skip: string[]) =>
  page.evaluate(
    (s) =>
      [...(window as any).__yutopia.room.state.objects.values()]
        .filter((o: any) => !s.includes(o.id) && ["desk", "tabletop", "computer"].includes(o.kind))
        .map((o: any) => ({ id: o.id, kind: o.kind, x: o.x, y: o.y, props: JSON.parse(o.props || "{}") })),
    skip,
  );

test("Tab steps through what's stacked; a dressed desk saved as a setup and placed again", async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok, "Yutopia Lab"));
  const before: string[] = await page.evaluate(() => [...(window as any).__yutopia.room.state.objects.keys()]);
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const X = Math.floor(sp.x) - 3;
  const Y = Math.floor(sp.y) - 5;
  const stamp = Date.now().toString(36);
  const name = `Desk ${stamp}`;
  const api = await request.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${tok}`, Accept: "application/json" },
  });
  try {
    // a desk with a computer and a desk lamp on it
    const send = (o: Record<string, unknown>) => page.evaluate((x) => (window as any).__yutopia.send("obj:put", x), o);
    await send({ id: `e2e-su-desk-${stamp}`, kind: "desk", x: X, y: Y, rot: 0 });
    await page.waitForTimeout(300);
    await send({
      id: `e2e-su-mon-${stamp}`,
      kind: "computer",
      x: X + 1,
      y: Y,
      rot: 0,
      props: { c: [1, 1] },
    });
    await send({
      id: `e2e-su-lamp-${stamp}`,
      kind: "tabletop",
      x: X,
      y: Y,
      rot: 0,
      props: { d: "desklamp", c: [1, 1] },
    });
    await expect.poll(async () => (await mine(page, before)).length).toBe(3);
    await page.evaluate(([x, y]) => (window as any).__yutopia.engine.pinCamera({ x, y, zoom: 2.5 }), [X + 1, Y + 1]);
    await page.evaluate(() => {
      const h = (window as any).__hud;
      h.set({ build: { ...h.get().build, on: true, tool: "furniture", mode: "hand", selected: [] } });
    });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
    await page.waitForTimeout(500);

    // ── over the computer: it's what you'd grab; Tab: the desk under it
    const mon = await at(page, X + 1.375, Y + 0.375, 34);
    await page.mouse.move(mon.x, mon.y);
    await expect.poll(async () => (await build(page)).hover?.label).toBe("Computer");
    expect((await build(page)).hover.of.n).toBeGreaterThanOrEqual(2);
    await page.keyboard.press("Tab");
    await expect.poll(async () => (await build(page)).hover?.label).toBe("Desk");
    expect((await build(page)).hover.of.i).toBe(1);

    // ── Shift-click selects it (and what's on it comes along); saved as a setup
    await page.keyboard.down("Shift");
    await page.mouse.click(mon.x, mon.y);
    await page.keyboard.up("Shift");
    await expect.poll(async () => (await build(page)).selected).toEqual([`e2e-su-desk-${stamp}`]);
    await page.getByRole("button", { name: "Save as setup" }).click();
    await page.getByRole("textbox", { name: /Name this setup/ }).fill(name);
    await page.keyboard.press("Enter");
    await expect(page.getByText(`Saved “${name}” to My setups`)).toBeVisible();
    const saved = (await build(page)).setups.find((s: any) => s.name === name);
    expect(saved.items.map((i: any) => i.kind).sort()).toEqual(["computer", "desk", "tabletop"]);

    // ── from the catalog: My setups → on the pointer, all three; down to the right
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "My setups" }).click();
    await page.getByRole("button", { name: `Place: ${name}` }).click();
    await expect.poll(async () => (await build(page)).carrying).toBe(3);
    const spot = await at(page, X + 3.5, Y + 2.5, 0);
    await page.mouse.move(spot.x, spot.y, { steps: 4 });
    await page.waitForTimeout(200);
    await page.mouse.click(spot.x, spot.y);
    await expect.poll(async () => (await mine(page, before)).length, { timeout: 10_000 }).toBe(6);
    const all = await mine(page, before);
    const copy = all.find((o) => o.kind === "desk" && !o.id.startsWith("e2e-su-"));
    expect(copy).toBeTruthy();
    // its things are on it, where they were on the first one
    const tops = all.filter((o) => (o.kind === "tabletop" || o.kind === "computer") && !o.id.startsWith("e2e-su-"));
    expect(tops.map((t) => [t.x - (copy?.x ?? 0), t.y - (copy?.y ?? 0), t.props.d ?? t.kind]).sort()).toEqual([
      [0, 0, "desklamp"],
      [1, 0, "computer"],
    ]);
  } finally {
    const ids = (await mine(page, before)).map((o) => o.id);
    if (ids.length) await page.evaluate((x) => (window as any).__yutopia.send("obj:removeMany", { ids: x }), ids);
    const list = await (await api.get(`${API}/api/yutopia/setups`)).json();
    for (const s of list.setups ?? []) if (s.name === name) await api.delete(`${API}/api/yutopia/setups/${s.id}`);
    await page.waitForTimeout(500);
  }
});
