/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, useWorld } from "./helpers";

// Both faces of a wall, in the Lab (everything put out is put back after):
// each face its own material, things hung on either face, anywhere along it
// and up it; the hand puts a wall item where the pointer meets the wall, R
// turns it over to the other side. Shots in iso and in third person.

const put = (page: Page, o: Record<string, unknown>) =>
  page.evaluate((x) => (window as any).__yutopia.send("obj:put", x), o);
const remove = (page: Page, id: string) =>
  page.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id);
const obj = (page: Page, id: string) =>
  page.evaluate((i) => {
    const o = (window as any).__yutopia.room.state.objects.get(i);
    return o ? { x: o.x, y: o.y, rot: o.rot, props: JSON.parse(o.props || "{}") } : null;
  }, id);
const setBuild = (page: Page, b: Record<string, unknown>) =>
  page.evaluate((p) => {
    const h = (window as any).__hud;
    h.set({ build: { ...h.get().build, ...p } });
  }, b);
const walls = (page: Page, edges: Record<string, unknown>[]) =>
  page.evaluate((e) => (window as any).__yutopia.send("map:walls", { edges: e }), edges);
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

test("both faces of a wall: a material each, things on either, anywhere on it", async ({ page }) => {
  test.setTimeout(150_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  // three tiles of solid wall along x with floor on both sides, nothing hung
  // near, no wall meeting it (an inside wall), and the material it is
  const spot = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.map;
    const solid = (ch: string | undefined) => !!ch && "pwfbk".includes(ch);
    const floor = (x: number, y: number) => {
      const ch = m.tiles[y]?.[x];
      return !!ch && ch !== " " && ch !== "#";
    };
    const hung = [...w.room.state.objects.values()].filter((o: any) =>
      [
        "board_wall",
        "screen_wall",
        "whiteboard",
        "notice_board",
        "poster",
        "frame",
        "clock",
        "neon",
        "tv_wall",
      ].includes(o.kind),
    );
    const near = (x: number, y: number) => hung.some((o: any) => Math.abs(o.x - x) < 6 && Math.abs(o.y - y) < 3);
    const v = (x: number, y: number) => m.vWalls[y]?.[x] ?? ".";
    for (let y = 2; y < m.height - 2; y++)
      for (let x = 1; x < m.width - 4; x++) {
        if (![0, 1, 2].every((d) => solid(m.hWalls[y]?.[x + d]) && floor(x + d, y) && floor(x + d, y - 1))) continue;
        if ([1, 2].some((d) => v(x + d, y) !== "." || v(x + d, y - 1) !== ".")) continue;
        if (near(x, y)) continue;
        return { x, y, ch: m.hWalls[y][x + 1] as string };
      }
    return null;
  });
  expect(spot, "the Lab has an inside wall with room on both faces").not.toBeNull();
  const { x, y, ch } = spot as { x: number; y: number; ch: string };
  const mat = ch.toLowerCase();
  const other = mat === "k" ? "b" : "k";
  const stamp = Date.now().toString(36);
  const ids = { back: `e2e-wb-back-${stamp}`, front: `e2e-poster-${stamp}`, hand: "" };
  try {
    // the back face (−y: the room north of it) in another material; the front keeps its own
    await walls(page, [{ x: x + 1, y, dir: "h", ch: other, side: -1 }]);
    await expect
      .poll(() => page.evaluate((p) => (window as any).__yutopia.map.hBacks?.[p.y]?.[p.x + 1], { x, y }))
      .toBe(other);
    expect(await page.evaluate((p) => (window as any).__yutopia.map.hWalls[p.y][p.x + 1], { x, y })).toBe(ch);

    // a whiteboard on the back face, a quarter tile along, two steps up; a
    // poster on the front, half a tile along and high
    await put(page, { id: ids.back, kind: "whiteboard", x, y: y - 1, rot: 2, props: { wu: 1, wz: 2 } });
    await put(page, { id: ids.front, kind: "poster", x: x + 1, y, rot: 0, props: { wu: 2, wz: 4 } });
    await expect.poll(async () => (await obj(page, ids.back))?.props).toEqual({ wu: 1, wz: 2 });
    await expect.poll(async () => (await obj(page, ids.front))?.props).toEqual({ wu: 2, wz: 4 });

    // iso: the front face (the back one is behind its wall)
    await page.evaluate(
      ([cx, cy]) => (window as any).__yutopia.engine.pinCamera({ x: cx, y: cy, zoom: 2.4 }),
      [x + 1.5, y + 2],
    );
    await page.waitForTimeout(900);
    await page.screenshot({ path: test.info().outputPath("iso-front.png") });

    // the hand: a clock from the catalog, pointed at the front face three
    // quarters of a tile along, high up: it hangs there, its middle under the pointer
    await setBuild(page, { on: true, tool: "furniture", mode: "place", kind: "clock", props: null, rot: 0 });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
    const before = new Set(await page.evaluate(() => [...(window as any).__yutopia.room.state.objects.keys()]));
    const p = await at(page, x + 0.75, y + 0.1, 96);
    await page.mouse.move(p.x - 30, p.y - 30);
    await page.mouse.move(p.x, p.y, { steps: 4 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: test.info().outputPath("iso-hand.png") });
    await page.mouse.click(p.x, p.y);
    await expect
      .poll(() =>
        page.evaluate(
          (had) => [...(window as any).__yutopia.room.state.objects.keys()].find((k: string) => !had.includes(k)) ?? "",
          [...before] as string[],
        ),
      )
      .not.toBe("");
    ids.hand = await page.evaluate(
      (had) => [...(window as any).__yutopia.room.state.objects.keys()].find((k: string) => !had.includes(k)),
      [...before] as string[],
    );
    // (a clock: a tile-wide drawing, its face in the middle at 52 px; a step is 9.8 px)
    const c = await obj(page, ids.hand);
    const placed = {
      rot: c?.rot,
      line: c?.y,
      mid: (c?.x ?? 0) + (c?.props.wu ?? 0) / 4 + 0.5,
      z: 52 + (c?.props.wz ?? 0) * 9.8,
    };
    expect(placed.rot).toBe(0);
    expect(placed.line).toBe(y);
    expect(Math.abs(placed.mid - (x + 0.75))).toBeLessThanOrEqual(0.25);
    expect(Math.abs(placed.z - 96)).toBeLessThanOrEqual(10);

    // R with it selected: over to the wall's other side, same spot
    await setBuild(page, { mode: "hand", selected: [ids.hand] });
    await page.evaluate(() => (window as any).__yutopia.build.rotate());
    await expect.poll(async () => (await obj(page, ids.hand))?.rot).toBe(2);
    expect((await obj(page, ids.hand))?.y).toBe(y - 1);
    await setBuild(page, { on: false, selected: [] });

    // third person, from the north room: the back face, its material and things
    await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 1.5, y: p.y - 3.5 }), { x, y });
    await page.waitForTimeout(800);
    await page.keyboard.press("t");
    await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
    await page.evaluate(() => {
      const t = (window as any).__yutopia.tp;
      t.setMode?.("free");
      t.yaw = Math.PI / 2; // looking +y, at the wall's back face
      t.pitch = 0.3;
      t.dist = 5;
    });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: test.info().outputPath("3p-back.png") });
    await page.keyboard.press("t");
    await page.waitForFunction(() => !(window as any).__yutopia.tp, null, { timeout: 30_000 });
  } finally {
    for (const id of Object.values(ids)) if (id) await remove(page, id);
    await walls(page, [{ x: x + 1, y, dir: "h", ch: mat, side: -1 }]);
  }
  await expect
    .poll(() => page.evaluate((p) => (window as any).__yutopia.map.hBacks?.[p.y]?.[p.x + 1] ?? ".", { x, y }))
    .toBe(".");
});

// In third person, high up a wall with the camera low, the pointer looks above
// the horizon (no floor under it): a click still puts the wall item there.
test("third person: a click high up a wall, above the horizon, hangs the thing", async ({ page }) => {
  test.setTimeout(120_000);
  const tok = await token(ANA);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "free" }));
  });
  await enter(page, tok, await useWorld("lab"));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  // two tiles of solid north wall (facing +y) with open floor in front, nothing hung near
  const spot = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.map;
    const solid = (ch: string | undefined) => !!ch && "pwfbk".includes(ch);
    const wallKinds = new Set([
      "board_wall",
      "screen_wall",
      "whiteboard",
      "notice_board",
      "poster",
      "frame",
      "clock",
      "neon",
      "tv_wall",
      "light_switch",
    ]);
    const hung = [...w.room.state.objects.values()].filter((o: any) => wallKinds.has(o.kind));
    const free = (x: number, y: number) => !hung.some((o: any) => Math.abs(o.x - x) < 3 && Math.abs(o.y - y) < 2);
    const open = (x: number, y: number) => !!w.grid?.ok?.(x, y);
    for (let y = 1; y < m.height - 5; y++)
      for (let x = 1; x < m.width - 3; x++) {
        if (![0, 1].every((d) => solid(m.hWalls[y]?.[x + d]))) continue;
        if (![0, 1, 2, 3].every((k) => open(x, y + k) && open(x + 1, y + k))) continue;
        if (free(x, y)) return { x, y };
      }
    return null;
  });
  expect(spot, "the Lab has a free north wall with floor in front").not.toBeNull();
  const { x, y } = spot as { x: number; y: number };
  const before = await page.evaluate(() => [...(window as any).__yutopia.room.state.objects.keys()] as string[]);
  let made = "";
  try {
    await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 1, y: p.y + 2.5 }), { x, y });
    await page.waitForTimeout(800);
    await setBuild(page, { on: true, tool: "furniture", mode: "place", kind: "light_switch", props: null, rot: 0 });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
    // eye level, looking at the wall (−y), a little up
    await page.evaluate(() => {
      const t = (window as any).__yutopia.tp;
      t.yaw = -Math.PI / 2;
      t.pitch = -0.12;
      t.dist = 1.4;
    });
    await page.waitForTimeout(1200);
    // a point high on its face that the camera sees above the horizon
    const p = await page.evaluate((s) => {
      const t = (window as any).__yutopia.tp;
      const c = t.project(s.x + 1, s.y + 0.1, 112 / 39.19);
      const r = t.renderer.domElement.getBoundingClientRect();
      return c ? { x: r.left + c.x, y: r.top + c.y, floor: t.floorAt(r.left + c.x, r.top + c.y) } : null;
    }, spot);
    expect(p, "the point is on screen").not.toBeNull();
    const at = p as { x: number; y: number; floor: unknown };
    expect(at.floor, "no floor under the pointer there").toBeNull();
    await page.mouse.move(at.x - 20, at.y + 10);
    await page.mouse.move(at.x, at.y, { steps: 4 });
    await page.waitForTimeout(300);
    await page.mouse.click(at.x, at.y);
    await expect
      .poll(() =>
        page.evaluate(
          (had) => [...(window as any).__yutopia.room.state.objects.keys()].find((k: string) => !had.includes(k)) ?? "",
          before,
        ),
      )
      .not.toBe("");
    made = await page.evaluate(
      (had) => [...(window as any).__yutopia.room.state.objects.keys()].find((k: string) => !had.includes(k)),
      before,
    );
    const o = await obj(page, made);
    expect(o?.rot).toBe(0);
    expect(o?.y).toBe(y);
    // high up: a light switch rests at 32–45 px, so well raised
    expect(o?.props.wz).toBeGreaterThan(4);
    await setBuild(page, { on: false, selected: [] });
  } finally {
    if (made) await remove(page, made);
    await page.evaluate(() => {
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, view: "iso", cam3p: "chase" }));
    });
  }
});

// A wall drag keeps to the line it started on and leaves no gaps: the 3D
// view's floor point wobbles across lines and jumps tiles with small mouse
// moves (it painted a second wall beside the first). Fed to build mode the
// way the 3D view feeds it.
test("a wall drag stays on its line, wobble and jumps and all", async ({ page }) => {
  test.setTimeout(90_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  // a 6 × 3 patch of open floor with no walls on its edges
  const spot = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.map;
    const open = (x: number, y: number) => !!w.grid?.ok?.(x, y);
    const none = (s: string | undefined) => !s || s === ".";
    for (let y = 2; y < m.height - 4; y++)
      for (let x = 2; x < m.width - 8; x++) {
        let ok = true;
        for (let dy = -1; dy <= 1 && ok; dy++)
          for (let dx = 0; dx < 6 && ok; dx++) {
            if (!open(x + dx, y + dy)) ok = false;
            if (!none(m.hWalls[y + dy]?.[x + dx]) || !none(m.hWalls[y + dy + 1]?.[x + dx])) ok = false;
            if (!none(m.vWalls[y + dy]?.[x + dx])) ok = false;
          }
        if (ok) return { x, y };
      }
    return null;
  });
  expect(spot, "the Lab has open floor").not.toBeNull();
  const { x, y } = spot as { x: number; y: number };
  const row = (yy: number) => page.evaluate((r) => (window as any).__yutopia.map.hWalls[r].slice(0, 200), yy);
  const before = [await row(y - 1), await row(y), await row(y + 1)];
  try {
    await setBuild(page, { on: true, tool: "walls", wallMode: "build", brush: "w:p", paintMode: "line" });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
    // press by the corner (x, y), then wobble across the lines either side and jump two tiles
    await page.evaluate((p) => {
      const b = (window as any).__yutopia.build;
      b.down(p.x + 0.1, p.y + 0.1);
      for (const [dx, dy] of [
        [0.9, 0.62],
        [1.4, -0.58],
        [3.6, 0.7],
        [4.5, -0.3],
      ])
        b.hover(p.x + dx, p.y + dy);
      b.up(p.x + 4.5, p.y - 0.3);
    }, spot);
    await expect.poll(async () => (await row(y)).slice(x, x + 5)).toBe("ppppp");
    expect((await row(y - 1)).slice(x, x + 6)).toBe(before[0].slice(x, x + 6));
    expect((await row(y + 1)).slice(x, x + 6)).toBe(before[2].slice(x, x + 6));
  } finally {
    await page.evaluate(
      (p) =>
        (window as any).__yutopia.send("map:walls", {
          edges: [0, 1, 2, 3, 4, 5].flatMap((d) =>
            [p.y - 1, p.y, p.y + 1].map((yy) => ({ x: p.x + d, y: yy, dir: "h", ch: "." })),
          ),
        }),
      spot,
    );
    await setBuild(page, { on: false });
  }
  await expect.poll(async () => (await row(y)).slice(x, x + 6)).toBe(before[1].slice(x, x + 6));
});
