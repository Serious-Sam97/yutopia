/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, holdCamera, test, token, useWorld } from "./helpers";

// The Walls tool, Sims-style (docs/plan/11-wall-building.md), in the Lab on a
// patch of open floor (everything built is taken down after): Build draws walls
// free, corner after corner, with a preview (plan 72 phase 11), skips walls that
// are there, ⌘/Ctrl takes them away; Paint shows the face under the pointer (which
// side, the room, now → the brush) and paints a face (a drag: one metre of it), Shift-click the room,
// Tab the other side, E samples; Select opens the inspector (swap, remove);
// [ ] the walls' view.

const setBuild = (page: Page, b: Record<string, unknown>) =>
  page.evaluate((p) => {
    const h = (window as any).__hud;
    h.set({ build: { ...h.get().build, ...p } });
  }, b);
const build = (page: Page) => page.evaluate(() => (window as any).__hud.get().build);
const look = (page: Page) => page.evaluate(() => (window as any).__yutopia.model.buildLook());
// (the floor as rows from its corner, asked of the structure: plan 72 phase 11)
const edge = (page: Page, dir: "h" | "v", x: number, y: number) =>
  page.evaluate(
    ([d, ex, ey]) => {
      const m = (window as any).__yutopia.rows();
      return (d === "h" ? m.hWalls[ey]?.[ex] : m.vWalls[ey]?.[ex]) ?? ".";
    },
    [dir, x, y] as const,
  );
const back = (page: Page, dir: "h" | "v", x: number, y: number) =>
  page.evaluate(
    ([d, ex, ey]) => {
      const m = (window as any).__yutopia.rows();
      return ((d === "h" ? m.hBacks : m.vBacks)?.[ey]?.[ex] as string | undefined) ?? ".";
    },
    [dir, x, y] as const,
  );
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
// the structure's walls by id (what a test put up is taken down by id after)
const wallIds = (page: Page) =>
  page.evaluate(() => (window as any).__yutopia.structure.walls.map((q: any) => q.id) as string[]);
// the wall standing on a cell edge of my floor (straight, on whole metres), or null
const wallOn = (page: Page, dir: "h" | "v", x: number, y: number) =>
  page.evaluate(
    ([d, ex, ey]) => {
      const w = (window as any).__yutopia;
      const at = [ex, ey];
      const [k, u] = d === "h" ? [1, 0] : [0, 1]; // (k: the line it stands on, u: along it)
      const q = w.structure.walls.find(
        (q: any) =>
          q.floor === w.level &&
          !q.bow &&
          q.a[k] === at[k] &&
          q.b[k] === at[k] &&
          Math.min(q.a[u], q.b[u]) <= at[u] &&
          Math.max(q.a[u], q.b[u]) >= at[u] + 1,
      );
      return q
        ? {
            id: q.id as string,
            back: (q.back ?? q.front) as string,
            len: Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]),
          }
        : null;
    },
    [dir, x, y] as const,
  );

test("the Walls tool, Sims-style: runs, paint with indicators, the inspector, the view", async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  // an 8 × 6 patch of open floor, no walls on its edges, nothing on it
  const spot = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.rows();
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
  const had = await wallIds(page);
  try {
    // in the room-to-be, the camera held over it (from the south-east: it sees the walls' +y faces)
    await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 2.5, y: p.y + 3.5 }), { x, y });
    await page.waitForTimeout(1500);
    await holdCamera(page);
    await setBuild(page, { on: true, tool: "walls", wallMode: "build", brush: "w:p", paintMode: "line" });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });

    // ── Build: walls drawn free (plan 72 phase 11): a corner, the pointer out, shown before it's in ──
    await page.evaluate(
      ([a, b]) => {
        const bc = (window as any).__yutopia.build;
        bc.down(a, b);
        bc.hover(a + 3.9, b + 0.1);
      },
      [X0 + 0.1, Y0 + 0.1],
    );
    const during = await look(page);
    expect(during.segs).toHaveLength(1);
    expect(during.segs[0]).toMatchObject({ a: [X0, Y0], b: [X0 + 4, Y0], ok: true });
    expect((await build(page)).wallTag).toMatchObject({ kind: "draw", len: 4, snap: "angle", remove: false, n: 0 });
    await page.evaluate(([a, b]) => (window as any).__yutopia.build.up(a + 3.9, b + 0.1), [X0 + 0.1, Y0 + 0.1]);
    await expect.poll(() => edge(page, "h", X0 + 3, Y0)).toBe("p");
    // the run goes on from there: the next corner's ghost, and Esc ends it
    await page.evaluate(([a, b]) => (window as any).__yutopia.build.hover(a, b), [X0 + 4, Y0 + 2.2]);
    expect((await look(page)).segs[0]).toMatchObject({ a: [X0 + 4, Y0], b: [X0 + 4, Y0 + 2] });
    await page.keyboard.press("Escape");
    expect((await look(page)).segs).toHaveLength(0);
    // a box round the room: the north wall that's there is skipped (counted), the rest goes up
    await setBuild(page, { paintMode: "box" });
    await page.evaluate(
      ([a, b]) => {
        const bc = (window as any).__yutopia.build;
        bc.down(a + 0.1, b + 0.1);
        bc.hover(a + 3.9, b + 2.9);
      },
      [X0, Y0],
    );
    expect((await build(page)).wallTag).toMatchObject({ kind: "run", n: 3, skipped: 1, w: 4, h: 3 });
    await page.evaluate(([a, b]) => (window as any).__yutopia.build.up(a + 3.9, b + 2.9), [X0, Y0]);
    await expect.poll(() => edge(page, "v", X0 + 4, Y0 + 2)).toBe("p");
    expect(await edge(page, "h", X0 + 1, Y0 + 3)).toBe("p");
    // a run over walls that are there, with brick: nothing repainted (that's Paint), told why
    await setBuild(page, { paintMode: "line", brush: "w:b" });
    await gesture(page, [X0 + 0.1, Y0 + 0.1], [[X0 + 3.9, Y0 + 0.1]]);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    expect(await edge(page, "h", X0 + 1, Y0)).toBe("p");
    // ⌘/Ctrl takes walls away: a wall outside the room, drawn, then crossed out and gone
    await setBuild(page, { brush: "w:p" });
    await gesture(page, [x + 0.1, y + 5.9], [[x + 2.9, y + 6.1]]);
    await page.keyboard.press("Escape");
    await expect.poll(() => edge(page, "h", x + 1, y + 6)).toBe("p");
    await page.keyboard.down("ControlOrMeta");
    await page.evaluate(
      ([a, b]) => {
        const bc = (window as any).__yutopia.build;
        bc.hover(a, b);
        bc.down(a, b);
      },
      [x + 1.5, y + 6.1],
    );
    expect((await build(page)).wallTag).toMatchObject({ kind: "draw", n: 1, remove: true });
    expect((await look(page)).segs.every((g: any) => g.remove)).toBe(true);
    await page.evaluate(([a, b]) => (window as any).__yutopia.build.up(a, b), [x + 1.5, y + 6.1]);
    await page.keyboard.up("ControlOrMeta");
    await expect.poll(() => edge(page, "h", x + 1, y + 6)).toBe(".");

    // ── Paint: the face under the pointer, before you click (plan 72 phase 11: a face of any wall —
    // the stretch of it between the walls meeting it, a drag from press to release) ──
    await setBuild(page, { wallMode: "paint", paint: "b" });
    // the room's north wall, inside (its +y face, which the camera sees)
    const p = await pointAt(page, X0 + 1.5, Y0 + 0.1, 1.53);
    await expect
      .poll(async () => (await build(page)).wallTag)
      .toMatchObject({ kind: "face", far: false, from: "p", to: "b", n: 1 });
    // (all of it: no wall meets it but at its ends)
    const f = await look(page);
    expect(f.segs).toHaveLength(1);
    expect(f.segs[0]).toMatchObject({ a: [X0, Y0], b: [X0 + 4, Y0], mat: "b", ok: true });
    await page.screenshot({ path: test.info().outputPath("paint-hover.png") });
    // Tab: the same wall's other side (outside the room), and back
    await page.keyboard.press("Tab");
    await expect.poll(async () => (await build(page)).wallTag?.far).toBe(true);
    await page.screenshot({ path: test.info().outputPath("paint-far.png") });
    await page.keyboard.press("Tab");
    await expect.poll(async () => (await build(page)).wallTag?.far).toBe(false);
    // a drag along it paints from press to release (on the cells' edges: to whole metres) — one face
    const d0 = await at(page, X0 + 1.1, Y0 + 0.1, 1.53);
    const d1 = await at(page, X0 + 1.9, Y0 + 0.1, 1.53);
    await page.mouse.move(d0.x, d0.y, { steps: 3 });
    await page.mouse.down();
    await page.mouse.move(d1.x, d1.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => edge(page, "h", X0 + 1, Y0)).toBe("b");
    expect(await back(page, "h", X0 + 1, Y0)).toBe("p"); // the outside stays plaster
    expect(await edge(page, "h", X0 + 2, Y0)).toBe("p");
    expect(await edge(page, "h", X0, Y0)).toBe("p");
    // Shift-click: the whole room inside, in cork
    await setBuild(page, { paint: "k" });
    await page.keyboard.down("Shift");
    await pointAt(page, X0 + 2.5, Y0 + 0.1, 1.53);
    // (its walls' stretches round it: the north wall in three now — the drag split it — the rest whole)
    await expect.poll(async () => (await build(page)).wallTag?.n).toBe(6);
    await page.mouse.click(p.x + 1, p.y);
    await page.keyboard.up("Shift");
    await expect.poll(() => back(page, "h", X0 + 2, Y0 + 3)).toBe("k"); // the south wall's inner (−y) face
    expect(await edge(page, "h", X0 + 1, Y0)).toBe("k");
    expect(await back(page, "v", X0 + 4, Y0 + 1)).toBe("k"); // the east wall, inside
    expect(await edge(page, "v", X0 + 4, Y0 + 1)).toBe("p"); // …its outside
    // E: sample a face (the north wall inside: cork now)
    await setBuild(page, { paint: "w" });
    await pointAt(page, X0 + 2.5, Y0 + 0.1, 1.53);
    await page.keyboard.press("e");
    await expect.poll(async () => (await build(page)).paint).toBe("k");

    // ── Select: the inspector (a whole wall: the north wall's metre the drag split off) ──
    await setBuild(page, { wallMode: "select" });
    const s = await pointAt(page, X0 + 1.5, Y0 + 0.1, 1.53);
    await page.mouse.click(s.x, s.y);
    const card = page.getByTestId("free-wall-inspector");
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
    expect(await page.evaluate(() => (window as any).__yutopia.model.wallView)).toBe("up");
    await page.keyboard.press("[");
    await page.keyboard.press("[");
    await expect.poll(async () => (await build(page)).wallView).toBe("down");
    await page.waitForTimeout(900);
    await page.screenshot({ path: test.info().outputPath("walls-down.png") });
    await page.keyboard.press("]");
    await expect.poll(async () => (await build(page)).wallView).toBe("cut");
  } finally {
    // every wall put up on the patch taken down again (the structure's walls go by id)
    await page.evaluate((h) => {
      const w = (window as any).__yutopia;
      const ids = w.structure.walls.filter((q: any) => q.floor === w.level && !h.includes(q.id)).map((q: any) => q.id);
      if (ids.length) w.send("struct:walls", { level: w.level, remove: ids });
    }, had);
    await setBuild(page, {
      on: false,
      wallMode: "build",
      paintMode: "line",
      brush: "w:p",
      wallView: "cut",
      freeSel: null,
    });
  }
  await expect.poll(() => edge(page, "h", X0 + 2, Y0 + 3)).toBe(".");
});

// Close up, looking at a wall: the face shows under the pointer (and its preview in 3D).
test("close up: Paint shows the face under the pointer", async ({ page }) => {
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
    const m = w.rows();
    const open = (x: number, y: number) => !!w.grid?.ok?.(x, y);
    // (no door or window in it: shared openings.ts)
    const cut = new Set(
      [...w.floorObjects()]
        .filter((o: any) => o.kind === "door" || String(o.kind).startsWith("window"))
        .flatMap((o: any) => [
          (Math.round(o.yaw / (Math.PI / 2)) & 3) % 2 ? `v${o.x},${o.y}` : `h${o.x},${o.y}`,
          `h${o.x + 1},${o.y}`,
        ]),
    );
    // (not the building's core: its stairs and elevators' walls)
    const core = (x: number, y: number) =>
      w.map.areas.some(
        (a: any) => a.key.startsWith("core-") && x >= a.x - 1 && x <= a.x + a.w && y >= a.y - 4 && y <= a.y + a.h,
      );
    for (let y = 1; y < m.height - 5; y++)
      for (let x = 1; x < m.width - 3; x++)
        if (
          !cut.has(`h${x},${y}`) &&
          !core(x, y) &&
          "pwfbk".includes(m.hWalls[y]?.[x] ?? ".") &&
          m.hWalls[y][x] !== "." &&
          [0, 1, 2, 3].every((k) => open(x, y + k))
        )
          return { x, y };
    return null;
  });
  expect(spot).not.toBeNull();
  const { x, y } = spot as { x: number; y: number };
  let farWas: { id: string; back: string; len: number } | null = null;
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
      const c = t.project(s.x + 0.5, s.y + 0.1, 1.53);
      const r = t.renderer.domElement.getBoundingClientRect();
      return c ? { x: r.left + c.x, y: r.top + c.y } : null;
    }, spot);
    expect(p).not.toBeNull();
    const at = p as { x: number; y: number };
    await page.mouse.move(at.x - 15, at.y);
    await page.mouse.move(at.x, at.y, { steps: 3 });
    await expect.poll(async () => (await build(page)).wallTag).toMatchObject({ kind: "face", far: false, to: "w" });
    const f = await look(page);
    // (the stretch it'd paint, shown on that wall: along its line, over the cell the pointer's at)
    expect(f.segs[0]).toMatchObject({ mat: "w" });
    const sg = f.segs[0] as { a: [number, number]; b: [number, number] };
    expect([sg.a[1], sg.b[1]]).toEqual([y, y]);
    expect(Math.min(sg.a[0], sg.b[0])).toBeLessThanOrEqual(x);
    expect(Math.max(sg.a[0], sg.b[0])).toBeGreaterThanOrEqual(x + 1);
    await page.waitForTimeout(500);
    await page.screenshot({ path: test.info().outputPath("3p-paint.png") });
    // painting only a wall's far side redraws the 3D walls (it changes
    // nothing but the back faces: they weren't redrawn until a front changed)
    // (the whole wall's back, so it isn't split and goes back as it was after, in a material that
    // isn't on that far side now)
    const wall = await wallOn(page, "h", x, y);
    expect(wall, "the wall on that edge").not.toBeNull();
    farWas = wall as { id: string; back: string; len: number };
    const was = farWas.back;
    const other = ["b", "k", "f", "w"].find((m) => m !== was) as string;
    await page.evaluate(
      ([q, m]) =>
        (window as any).__yutopia.send("struct:paint", {
          level: (window as any).__yutopia.level,
          stretches: [{ id: q.id, side: -1, from: 0, to: q.len, mat: m }],
        }),
      [farWas, other] as const,
    );
    // (the floor drawn again with it: its walls' edges as drawn have the new back — a relayout, the
    // floor kept)
    await expect
      .poll(() =>
        page.evaluate((s) => (window as any).__yutopia.tp.world.edges.back({ dir: "h", x: s.x, y: s.y }), { x, y }),
      )
      .toBe(other);
  } finally {
    if (farWas)
      await page.evaluate(
        (q) =>
          (window as any).__yutopia.send("struct:paint", {
            level: (window as any).__yutopia.level,
            stretches: [{ id: q.id, side: -1, from: 0, to: q.len, mat: q.back }],
          }),
        farWas,
      );
    await setBuild(page, { on: false, wallMode: "build" });
    await page.evaluate(() => {
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
    });
  }
});
