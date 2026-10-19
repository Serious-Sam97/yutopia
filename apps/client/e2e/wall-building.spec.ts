/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, useWorld } from "./helpers";

// The Walls tool, Sims-style (docs/plan/11-wall-building.md), in the Lab on a
// patch of open floor (everything built is taken down after): Build draws a
// run corner to corner with a preview and a count, skips walls that are there,
// ⌘/Ctrl-drag takes them away; Paint shows the face under the pointer (which
// side, the room, now → the brush) and paints one face, Shift-click the room,
// Tab the other side, E samples; Select opens the inspector (swap, remove);
// [ ] the walls' view.

const setBuild = (page: Page, b: Record<string, unknown>) =>
  page.evaluate((p) => {
    const h = (window as any).__hud;
    h.set({ build: { ...h.get().build, ...p } });
  }, b);
const build = (page: Page) => page.evaluate(() => (window as any).__hud.get().build);
const look = (page: Page) => page.evaluate(() => (window as any).__yutopia.engine.buildLook());
const edge = (page: Page, dir: "h" | "v", x: number, y: number) =>
  page.evaluate(
    ([d, ex, ey]) => {
      const m = (window as any).__yutopia.map;
      return (d === "h" ? m.hWalls[ey]?.[ex] : m.vWalls[ey]?.[ex]) ?? ".";
    },
    [dir, x, y] as const,
  );
const back = (page: Page, dir: "h" | "v", x: number, y: number) =>
  page.evaluate(
    ([d, ex, ey]) => {
      const m = (window as any).__yutopia.map;
      return ((d === "h" ? m.hBacks : m.vBacks)?.[ey]?.[ex] as string | undefined) ?? ".";
    },
    [dir, x, y] as const,
  );
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
async function pointAt(page: Page, x: number, y: number, z: number) {
  const p = await at(page, x, y, z);
  await page.mouse.move(p.x - 12, p.y - 6);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(150);
  return p;
}
// build mode's press / move / release in world tiles (as both views feed it)
const gesture = (page: Page, from: [number, number], moves: [number, number][]) =>
  page.evaluate(
    ([a, ms]) => {
      const b = (window as any).__yutopia.build;
      b.down(a[0], a[1]);
      for (const m of ms) b.hover(m[0], m[1]);
      const last = ms[ms.length - 1] ?? a;
      b.up(last[0], last[1]);
    },
    [from, moves] as const,
  );

test("the Walls tool, Sims-style: runs, paint with indicators, the inspector, the view", async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  // an 8 × 6 patch of open floor, no walls on its edges, nothing on it
  const spot = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.map;
    const open = (x: number, y: number) => !!w.grid?.ok?.(x, y);
    const none = (s: string | undefined) => !s || s === ".";
    for (let y = 2; y < m.height - 8; y++)
      for (let x = 2; x < m.width - 10; x++) {
        let ok = true;
        for (let dy = 0; dy < 6 && ok; dy++)
          for (let dx = 0; dx < 8 && ok; dx++) {
            if (!open(x + dx, y + dy)) ok = false;
            if (!none(m.hWalls[y + dy]?.[x + dx]) || !none(m.vWalls[y + dy]?.[x + dx])) ok = false;
          }
        if (ok) return { x, y };
      }
    return null;
  });
  expect(spot, "the Lab has open floor").not.toBeNull();
  const { x, y } = spot as { x: number; y: number };
  // the room: x+1..x+4 (4 wide), y+1..y+3 (3 deep)
  const X0 = x + 1;
  const Y0 = y + 1;
  try {
    await page.evaluate(
      ([cx, cy]) => (window as any).__yutopia.engine.pinCamera({ x: cx, y: cy, zoom: 2 }),
      [X0 + 2, Y0 + 3],
    );
    await setBuild(page, { on: true, tool: "walls", wallMode: "build", brush: "w:p", paintMode: "line" });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });

    // ── Build: a run, corner to corner, shown before it's built ──
    await page.evaluate(
      ([a, b]) => {
        const bc = (window as any).__yutopia.build;
        bc.down(a, b);
        bc.hover(a + 3.9, b + 0.3);
      },
      [X0 + 0.1, Y0 + 0.1],
    );
    const during = await look(page);
    expect(during.edges.length).toBe(4);
    expect((await build(page)).wallTag).toMatchObject({ kind: "run", n: 4, remove: false });
    await page.evaluate(([a, b]) => (window as any).__yutopia.build.up(a + 3.9, b + 0.3), [X0 + 0.1, Y0 + 0.1]);
    await expect.poll(() => edge(page, "h", X0 + 3, Y0)).toBe("p");
    // a box round the room: the north wall that's there is skipped (counted), the rest goes up
    await setBuild(page, { paintMode: "box" });
    await page.evaluate(
      ([a, b]) => {
        const bc = (window as any).__yutopia.build;
        bc.down(a + 0.5, b + 0.5);
        bc.hover(a + 3.5, b + 2.5);
      },
      [X0, Y0],
    );
    expect((await build(page)).wallTag).toMatchObject({ kind: "run", n: 10, skipped: 4, w: 4, h: 3 });
    await page.evaluate(([a, b]) => (window as any).__yutopia.build.up(a + 3.5, b + 2.5), [X0, Y0]);
    await expect.poll(() => edge(page, "v", X0 + 4, Y0 + 2)).toBe("p");
    expect(await edge(page, "h", X0 + 1, Y0 + 3)).toBe("p");
    // a run over walls that are there, with brick: nothing repainted (that's Paint)
    await setBuild(page, { paintMode: "line", brush: "w:b" });
    await gesture(page, [X0 + 0.1, Y0 + 0.1], [[X0 + 3.9, Y0 + 0.2]]);
    await page.waitForTimeout(300);
    expect(await edge(page, "h", X0 + 1, Y0)).toBe("p");
    // ⌘/Ctrl-drag takes walls away: a run along a line outside the room, built then removed
    await setBuild(page, { brush: "w:p" });
    await gesture(page, [x + 0.1, y + 5.9], [[x + 2.9, y + 6.1]]);
    await expect.poll(() => edge(page, "h", x + 1, y + 6)).toBe("p");
    await page.keyboard.down("ControlOrMeta");
    await page.evaluate(
      ([a, b]) => {
        const bc = (window as any).__yutopia.build;
        bc.down(a, b);
        bc.hover(a + 2.8, b + 0.1);
      },
      [x + 0.1, y + 5.9],
    );
    expect((await build(page)).wallTag).toMatchObject({ kind: "run", n: 3, remove: true });
    expect((await look(page)).edges.every((g: any) => g.remove)).toBe(true);
    await page.evaluate(([a, b]) => (window as any).__yutopia.build.up(a + 2.8, b + 0.1), [x + 0.1, y + 5.9]);
    await page.keyboard.up("ControlOrMeta");
    await expect.poll(() => edge(page, "h", x + 1, y + 6)).toBe(".");

    // ── Paint: the face under the pointer, before you click ──
    await setBuild(page, { wallMode: "paint", paint: "b" });
    // the room's north wall, inside (its +y face, which iso sees)
    const p = await pointAt(page, X0 + 1.5, Y0 + 0.1, 60);
    await expect
      .poll(async () => (await build(page)).wallTag)
      .toMatchObject({ kind: "face", far: false, from: "p", to: "b", n: 1 });
    const f = await look(page);
    expect(f.faces).toHaveLength(1);
    expect(f.faces[0]).toMatchObject({ p: { dir: "h", x: X0 + 1, y: Y0, side: 1 }, mat: "b", ok: true });
    await page.screenshot({ path: test.info().outputPath("paint-hover.png") });
    // Tab: the same panel's other side (outside the room, the far side here)
    await page.keyboard.press("Tab");
    await expect.poll(async () => (await build(page)).wallTag?.far).toBe(true);
    await page.screenshot({ path: test.info().outputPath("paint-far.png") });
    await page.keyboard.press("Tab");
    await expect.poll(async () => (await build(page)).wallTag?.far).toBe(false);
    // a click paints that one face
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => edge(page, "h", X0 + 1, Y0)).toBe("b");
    expect(await back(page, "h", X0 + 1, Y0)).toBe("p"); // the outside stays plaster
    expect(await edge(page, "h", X0 + 2, Y0)).toBe("p");
    // Shift-click: the whole room inside, in cork
    await setBuild(page, { paint: "k" });
    await page.keyboard.down("Shift");
    await pointAt(page, X0 + 2.5, Y0 + 0.1, 60);
    await expect.poll(async () => (await build(page)).wallTag?.n).toBe(14);
    await page.mouse.click(p.x + 1, p.y);
    await page.keyboard.up("Shift");
    await expect.poll(() => back(page, "h", X0 + 2, Y0 + 3)).toBe("k"); // the south wall's inner (−y) face
    expect(await edge(page, "h", X0 + 1, Y0)).toBe("k");
    expect(await back(page, "v", X0 + 4, Y0 + 1)).toBe("k"); // the east wall, inside
    expect(await edge(page, "v", X0 + 4, Y0 + 1)).toBe("p"); // …its outside
    // E: sample a face (the north wall inside: cork now)
    await setBuild(page, { paint: "w" });
    await pointAt(page, X0 + 2.5, Y0 + 0.1, 60);
    await page.keyboard.press("e");
    await expect.poll(async () => (await build(page)).paint).toBe("k");

    // ── Select: the inspector ──
    await setBuild(page, { wallMode: "select" });
    const s = await pointAt(page, X0 + 1.5, Y0 + 0.1, 60);
    await page.mouse.click(s.x, s.y);
    const card = page.getByTestId("wall-inspector");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Cork");
    await expect(card).toContainText("Plaster");
    await page.screenshot({ path: test.info().outputPath("inspector.png") });
    await card.getByRole("button", { name: "Swap sides" }).click();
    await expect.poll(() => edge(page, "h", X0 + 1, Y0)).toBe("p");
    expect(await back(page, "h", X0 + 1, Y0)).toBe("k");
    await card.getByRole("button", { name: "Remove wall" }).click();
    await expect.poll(() => edge(page, "h", X0 + 1, Y0)).toBe(".");
    await expect(card).toHaveCount(0);

    // ── the walls' view: [ ] (down / cutaway / up) ──
    await page.keyboard.press("]");
    await expect.poll(async () => (await build(page)).wallView).toBe("up");
    expect(await page.evaluate(() => (window as any).__yutopia.engine.wallView)).toBe("up");
    await page.keyboard.press("[");
    await page.keyboard.press("[");
    await expect.poll(async () => (await build(page)).wallView).toBe("down");
    await page.waitForTimeout(900);
    await page.screenshot({ path: test.info().outputPath("walls-down.png") });
    await page.keyboard.press("]");
    await expect.poll(async () => (await build(page)).wallView).toBe("cut");
  } finally {
    // every edge of the patch back to no wall
    await page.evaluate(
      ([px, py]) => {
        const edges: { x: number; y: number; dir: "h" | "v"; ch: string }[] = [];
        for (let dy = 0; dy <= 7; dy++)
          for (let dx = 0; dx <= 8; dx++) {
            edges.push({ x: px + dx, y: py + dy, dir: "h", ch: "." });
            edges.push({ x: px + dx, y: py + dy, dir: "v", ch: "." });
          }
        (window as any).__yutopia.send("map:walls", { edges });
      },
      [x, y],
    );
    await setBuild(page, {
      on: false,
      wallMode: "build",
      paintMode: "line",
      brush: "w:p",
      wallView: "cut",
      wallSel: [],
    });
  }
  await expect.poll(() => edge(page, "h", X0 + 2, Y0 + 3)).toBe(".");
});

// In third person the same face shows under the pointer (and its preview in 3D).
test("third person: Paint shows the face under the pointer", async ({ page }) => {
  test.setTimeout(120_000);
  const tok = await token(ANA);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "free" }));
  });
  await enter(page, tok, await useWorld("lab"));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  // a solid north wall with open floor in front
  const spot = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.map;
    const open = (x: number, y: number) => !!w.grid?.ok?.(x, y);
    // (no door or window in it: shared openings.ts)
    const cut = new Set(
      [...w.room.state.objects.values()]
        .filter((o: any) => o.kind === "door" || String(o.kind).startsWith("window"))
        .flatMap((o: any) => [o.rot % 2 ? `v${o.x},${o.y}` : `h${o.x},${o.y}`, `h${o.x + 1},${o.y}`]),
    );
    for (let y = 1; y < m.height - 5; y++)
      for (let x = 1; x < m.width - 3; x++)
        if (
          !cut.has(`h${x},${y}`) &&
          "pwfbk".includes(m.hWalls[y]?.[x] ?? ".") &&
          m.hWalls[y][x] !== "." &&
          [0, 1, 2, 3].every((k) => open(x, y + k))
        )
          return { x, y };
    return null;
  });
  expect(spot).not.toBeNull();
  const { x, y } = spot as { x: number; y: number };
  let farWas: string | null = null;
  try {
    await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 0.5, y: p.y + 3 }), { x, y });
    await page.waitForTimeout(800);
    await setBuild(page, { on: true, tool: "walls", wallMode: "paint", paint: "w" });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
    await page.evaluate(() => {
      const t = (window as any).__yutopia.tp;
      t.yaw = -Math.PI / 2;
      t.pitch = 0.25;
      t.dist = 3;
    });
    await page.waitForTimeout(1200);
    const p = await page.evaluate((s) => {
      const t = (window as any).__yutopia.tp;
      const c = t.project(s.x + 0.5, s.y + 0.1, 60 / 39.19);
      const r = t.renderer.domElement.getBoundingClientRect();
      return c ? { x: r.left + c.x, y: r.top + c.y } : null;
    }, spot);
    expect(p).not.toBeNull();
    const at = p as { x: number; y: number };
    await page.mouse.move(at.x - 15, at.y);
    await page.mouse.move(at.x, at.y, { steps: 3 });
    await expect.poll(async () => (await build(page)).wallTag).toMatchObject({ kind: "face", far: false, to: "w" });
    const f = await look(page);
    expect(f.faces[0]).toMatchObject({ p: { dir: "h", x, y, side: 1 }, mat: "w" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: test.info().outputPath("3p-paint.png") });
    // painting only a wall's far side rebuilds the 3D walls (it changes
    // nothing but the back faces: they weren't redrawn until a front changed)
    // (a material that isn't on that far side now)
    const was = await page.evaluate((s) => {
      const m = (window as any).__yutopia.map;
      const b = m.hBacks?.[s.y]?.[s.x];
      return b && b !== "." ? b : m.hWalls[s.y][s.x].toLowerCase();
    }, spot);
    farWas = was;
    const other = ["b", "k", "f", "w"].find((m) => m !== was) as string;
    await page.evaluate(() => {
      (window as any).__yutopia.tp.world.__before = true;
    });
    await page.evaluate(
      ([s, m]) =>
        (window as any).__yutopia.send("map:faces", {
          faces: [{ dir: "h", x: (s as any).x, y: (s as any).y, side: -1 }],
          mat: m,
        }),
      [spot, other] as const,
    );
    await expect.poll(() => page.evaluate(() => !(window as any).__yutopia.tp.world.__before)).toBe(true);
  } finally {
    if (farWas)
      await page.evaluate(
        ([s, m]) =>
          (window as any).__yutopia.send("map:faces", {
            faces: [{ dir: "h", x: (s as any).x, y: (s as any).y, side: -1 }],
            mat: m,
          }),
        [spot, farWas] as const,
      );
    await setBuild(page, { on: false, wallMode: "build" });
    await page.evaluate(() => {
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, view: "iso", cam3p: "chase" }));
    });
  }
});
