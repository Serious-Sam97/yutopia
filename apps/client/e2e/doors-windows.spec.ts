/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, useWorld, walkTo } from "./helpers";

// Doors and windows are things you put into a wall (shared openings.ts), from
// the catalog's Doors & windows: the wall stays (its material), the door or
// window cuts its own hole; a door lets people through, a window doesn't.
// In the Lab (everything put in is taken out after). Shots in iso and 3D.

const put = (page: Page, o: Record<string, unknown>) =>
  page.evaluate((x) => (window as any).__yutopia.send("obj:put", x), o);
const remove = (page: Page, id: string) =>
  page.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id);
const obj = (page: Page, id: string) =>
  page.evaluate((i) => {
    const o = (window as any).__yutopia.room.state.objects.get(i);
    return o ? { kind: o.kind, x: o.x, y: o.y, rot: o.rot, props: JSON.parse(o.props || "{}") } : null;
  }, id);
const setBuild = (page: Page, b: Record<string, unknown>) =>
  page.evaluate((p) => {
    const h = (window as any).__hud;
    h.set({ build: { ...h.get().build, ...p } });
  }, b);
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
const newIds = (page: Page, had: string[]) =>
  page.evaluate(
    (h) => [...(window as any).__yutopia.room.state.objects.keys()].filter((k: string) => !h.includes(k)),
    had,
  );

test("doors and windows go into a wall from the catalog; the wall stays, a door lets you through", async ({ page }) => {
  test.setTimeout(180_000);
  await enter(page, await token(ANA), await useWorld("lab"));
  // an inside wall along x, four tiles of it solid, floor on both sides, no
  // wall meeting it and nothing on it or in it near
  const spot = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.map;
    const solid = (ch: string | undefined) => !!ch && "pwfbk".includes(ch);
    const floor = (x: number, y: number) => !!w.grid?.ok?.(x, y);
    const things = [...w.room.state.objects.values()].filter(
      (o: any) =>
        ["door", "window", "window_wide", "window_tall", "poster", "frame", "clock", "whiteboard"].includes(o.kind) ||
        o.kind.startsWith("board") ||
        o.kind.startsWith("tv") ||
        o.kind.includes("screen"),
    );
    const near = (x: number, y: number) => things.some((o: any) => Math.abs(o.x - x) < 6 && Math.abs(o.y - y) < 3);
    const v = (x: number, y: number) => m.vWalls[y]?.[x] ?? ".";
    for (let y = 2; y < m.height - 3; y++)
      for (let x = 1; x < m.width - 5; x++) {
        const k = [0, 1, 2, 3];
        if (!k.every((d) => solid(m.hWalls[y]?.[x + d]) && floor(x + d, y) && floor(x + d, y - 1))) continue;
        if ([1, 2, 3].some((d) => v(x + d, y) !== "." || v(x + d, y - 1) !== ".")) continue;
        if (!floor(x, y + 1) || !floor(x, y - 2) || near(x, y)) continue;
        return { x, y, ch: m.hWalls[y][x] as string };
      }
    return null;
  });
  expect(spot, "the Lab has an inside wall with room on both sides").not.toBeNull();
  const { x, y, ch } = spot as { x: number; y: number; ch: string };
  const made: string[] = [];
  try {
    // the catalog has a Doors tab and a Windows tab
    await setBuild(page, { on: true, tool: "furniture", mode: "hand", catalogTab: "doors" });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
    await expect(page.getByRole("tab", { name: "Doors", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Saloon doors").first()).toBeVisible();
    await expect(page.getByText("Tall window")).toHaveCount(0);
    await page.getByRole("tab", { name: "Windows", exact: true }).click();
    await expect(page.getByText("Tall window").first()).toBeVisible();
    await expect(page.getByText("Saloon doors")).toHaveCount(0);

    // a door in hand, pointed at the wall: in it, at the pointer
    const had = (await page.evaluate(() => [...(window as any).__yutopia.room.state.objects.keys()])) as string[];
    await page.evaluate(
      ([cx, cy]) => (window as any).__yutopia.engine.pinCamera({ x: cx, y: cy, zoom: 2.2 }),
      [x + 2, y + 2],
    );
    await page.waitForTimeout(600);
    await setBuild(page, { mode: "place", kind: "door", props: null, rot: 0 });
    const p = await at(page, x + 0.5, y + 0.1, 40);
    await page.mouse.move(p.x - 30, p.y + 20);
    await page.mouse.move(p.x, p.y, { steps: 4 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: test.info().outputPath("iso-door-hand.png") });
    await page.mouse.click(p.x, p.y);
    await expect.poll(async () => (await newIds(page, had)).length).toBe(1);
    const doorId = (await newIds(page, had))[0];
    made.push(doorId);
    const d = await obj(page, doorId);
    expect([d?.kind, d?.x, d?.y, d?.rot, d?.props.state]).toEqual(["door", x, y, 0, "open"]);
    // the wall is still there, in its material
    expect(await page.evaluate((q) => (window as any).__yutopia.map.hWalls[q.y][q.x], { x, y })).toBe(ch);

    // a wide window and a tall one further along (through the server's rules)
    const wide = `e2e-win-wide-${Date.now().toString(36)}`;
    const tall = `e2e-win-tall-${Date.now().toString(36)}`;
    made.push(wide, tall);
    await put(page, { id: wide, kind: "window_wide", x: x + 1, y, rot: 0 });
    await put(page, { id: tall, kind: "window_tall", x: x + 3, y, rot: 0 });
    await expect.poll(async () => (await obj(page, wide))?.kind).toBe("window_wide");
    await expect.poll(async () => (await obj(page, tall))?.kind).toBe("window_tall");
    // nothing hangs over them
    const poster = `e2e-poster-${Date.now().toString(36)}`;
    await put(page, { id: poster, kind: "poster", x: x + 1, y, rot: 0, props: { wu: 0, wz: 0 } });
    await expect(page.getByText(/doesn't fit/i).first()).toBeVisible();
    expect(await obj(page, poster)).toBeNull();
    await setBuild(page, { on: false, mode: "hand", selected: [] });
    await page.waitForTimeout(900);
    await page.screenshot({ path: test.info().outputPath("iso-door-windows.png") });

    // through the door (and not through the windows)
    await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x + 0.5, y: q.y + 1.5 }), { x, y });
    await page.waitForTimeout(600);
    await walkTo(page, x + 0.5, y - 1.5);
    expect(await page.evaluate(() => (window as any).__yutopia.meTile().y)).toBeLessThan(y);
    expect(
      await page.evaluate((q) => (window as any).__yutopia.grid.step(q.x + 1, q.y, q.x + 1, q.y - 1), { x, y }),
    ).toBe(false);

    // third person: from the south room, looking at the wall
    await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x + 2, y: q.y + 3.5 }), { x, y });
    await page.waitForTimeout(800);
    await page.keyboard.press("t");
    await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
    await page.evaluate(() => {
      const t = (window as any).__yutopia.tp;
      t.setMode?.("free");
      t.yaw = -Math.PI / 2; // looking −y, at the wall's front face
      t.pitch = 0.15;
      t.dist = 5;
    });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: test.info().outputPath("3p-door-windows.png") });
    await page.keyboard.press("t");
    await page.waitForFunction(() => !(window as any).__yutopia.tp, null, { timeout: 30_000 });
  } finally {
    for (const id of made) await remove(page, id);
  }
  await expect
    .poll(() => page.evaluate((m) => m.some((id) => (window as any).__yutopia.room.state.objects.has(id)), made))
    .toBe(false);
});

// Review shots (YUTOPIA_SHOTS=<dir>): doors shut, open, locked, swung the other
// way, a glass one; the windows; close up in iso and from both sides in 3D.
test("doors and windows: review shots", async ({ page }) => {
  const dir = process.env.YUTOPIA_SHOTS;
  test.skip(!dir, "review shots: set YUTOPIA_SHOTS");
  test.setTimeout(240_000);
  await enter(page, await token(ANA), await useWorld("lab"));
  // open floor 7 tiles wide and 6 deep, nothing on it: a plaster wall across it
  const spot = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.map;
    const floor = (x: number, y: number) => !!w.grid?.ok?.(x, y);
    const busy = [...w.room.state.objects.values()];
    const near = (x: number, y: number) => busy.some((o: any) => o.x >= x - 2 && o.x <= x + 8 && Math.abs(o.y - y) < 4);
    for (let y = 4; y < m.height - 4; y++)
      for (let x = 2; x < m.width - 9; x++) {
        let ok = true;
        for (let d = 0; d < 7 && ok; d++)
          for (let k = -3; k < 3 && ok; k++) {
            if (!floor(x + d, y + k)) ok = false;
            if ((m.hWalls[y + k]?.[x + d] ?? ".") !== "." || (m.vWalls[y + k]?.[x + d + 1] ?? ".") !== ".") ok = false;
          }
        if (ok && !near(x, y)) return { x, y };
      }
    return null;
  });
  expect(spot, "open floor in the Lab").not.toBeNull();
  const { x, y } = spot as { x: number; y: number };
  const run = (ch: string) => Array.from({ length: 7 }, (_, d) => ({ x: x + d, y, dir: "h", ch }));
  await page.evaluate((e) => (window as any).__yutopia.send("map:walls", { edges: e }), run("p"));
  await expect.poll(() => page.evaluate((q) => (window as any).__yutopia.map.hWalls[q.y][q.x + 6], { x, y })).toBe("p");
  const s = Date.now().toString(36);
  const ids = { a: `e2e-door-a-${s}`, g: `e2e-door-g-${s}`, w: `e2e-win-${s}`, ww: `e2e-ww-${s}`, wt: `e2e-wt-${s}` };
  const shot = (name: string) => page.screenshot({ path: `${dir}/${name}.png` });
  const state = (id: string, st: string) =>
    page.evaluate(([i, v]) => (window as any).__yutopia.send("door:set", { id: i, state: v }), [id, st]);
  try {
    await put(page, { id: ids.a, kind: "door", x, y, rot: 0 });
    await put(page, { id: ids.w, kind: "window", x: x + 1, y, rot: 0 });
    await put(page, { id: ids.g, kind: "door", x: x + 2, y, rot: 0, props: { glass: true, swing: -1 } });
    await put(page, { id: ids.ww, kind: "window_wide", x: x + 3, y, rot: 0 });
    await put(page, { id: ids.wt, kind: "window_tall", x: x + 5, y, rot: 0 });
    await expect.poll(async () => !!(await obj(page, ids.wt))).toBe(true);
    await page.evaluate(() => (window as any).__yutopia.engine.setClock?.(11));
    await page.evaluate(
      ([cx, cy]) => (window as any).__yutopia.engine.pinCamera({ x: cx, y: cy, zoom: 1.9 }),
      [x + 3, y + 0.5],
    );
    // (doors open and shut for someone next to them)
    await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x + 1.5, y: q.y + 1.6 }), { x, y });
    await page.waitForTimeout(1500);
    await shot("01-iso-open");
    await state(ids.a, "closed");
    await state(ids.g, "closed");
    await page.waitForTimeout(800);
    await shot("02-iso-shut");
    // the other side (the camera's from the south-east: walk round to the north room)
    await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x + 3, y: q.y - 2.5 }), { x, y });
    await page.evaluate(
      ([cx, cy]) => (window as any).__yutopia.engine.pinCamera({ x: cx, y: cy, zoom: 1.9 }),
      [x + 3, y - 1.5],
    );
    await page.waitForTimeout(1200);
    await shot("03-iso-north-room");
    // 3D, both sides
    await page.keyboard.press("t");
    await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
    const look = (yaw: number) =>
      page.evaluate((a) => {
        const t = (window as any).__yutopia.tp;
        t.setMode?.("free");
        t.yaw = a;
        t.pitch = 0.12;
        t.dist = 4.5;
      }, yaw);
    await look(Math.PI / 2);
    await page.waitForTimeout(2500);
    await shot("04-3p-back-face");
    await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x + 1.5, y: q.y + 1.6 }), { x, y });
    await page.waitForTimeout(600);
    await state(ids.a, "open");
    await page.waitForTimeout(800);
    await look(-Math.PI / 2);
    await page.waitForTimeout(2500);
    await shot("05-3p-front-face");
    await page.keyboard.press("t");
    await page.waitForFunction(() => !(window as any).__yutopia.tp, null, { timeout: 30_000 });
  } finally {
    for (const id of Object.values(ids)) await remove(page, id);
    await page.waitForTimeout(500);
    await page.evaluate((e) => (window as any).__yutopia.send("map:walls", { edges: e }), run("."));
  }
});

// Review shots (YUTOPIA_SHOTS=<dir>): every kind of door in one wall — open,
// then shut (one locked, the studio's ON AIR lit) — in iso and in 3D.
test("door kinds: review shots", async ({ page }) => {
  const dir = process.env.YUTOPIA_SHOTS;
  test.skip(!dir, "review shots: set YUTOPIA_SHOTS");
  test.setTimeout(300_000);
  await enter(page, await token(ANA), await useWorld("lab"));
  const W = 11;
  const spot = await page.evaluate((len) => {
    const w = (window as any).__yutopia;
    const m = w.map;
    const floor = (x: number, y: number) => !!w.grid?.ok?.(x, y);
    const busy = [...w.room.state.objects.values()];
    const near = (x: number, y: number) =>
      busy.some((o: any) => o.x >= x - 2 && o.x <= x + len + 1 && Math.abs(o.y - y) < 4);
    for (let y = 4; y < m.height - 4; y++)
      for (let x = 1; x < m.width - len - 1; x++) {
        let ok = true;
        for (let d = 0; d < len && ok; d++)
          for (let k = -3; k < 3 && ok; k++) {
            if (!floor(x + d, y + k)) ok = false;
            if ((m.hWalls[y + k]?.[x + d] ?? ".") !== "." || (m.vWalls[y + k]?.[x + d + 1] ?? ".") !== ".") ok = false;
          }
        if (ok && !near(x, y)) return { x, y };
      }
    return null;
  }, W);
  expect(spot, "open floor in the Lab").not.toBeNull();
  const { x, y } = spot as { x: number; y: number };
  const run = (ch: string) => Array.from({ length: W }, (_, d) => ({ x: x + d, y, dir: "h", ch }));
  await page.evaluate((e) => (window as any).__yutopia.send("map:walls", { edges: e }), run("p"));
  await expect
    .poll(() => page.evaluate((q) => (window as any).__yutopia.map.hWalls[q.y][q.x + 10], { x, y }))
    .toBe("p");
  const s = Date.now().toString(36);
  const doors: [string, number, Record<string, unknown>][] = [
    ["door", 0, {}],
    ["door", 1, { glass: true }],
    ["door_double", 2, {}],
    ["door_studio", 4, {}],
    ["door_barn", 5, {}], // (rolls onto the wall at 6)
    ["door_saloon", 7, {}],
    ["archway", 8, {}],
    ["door", 9, { color: "#3d4a5c" }],
  ];
  const ids = doors.map(([k, dx]) => `e2e-${k}-${dx}-${s}`);
  const shot = (name: string) => page.screenshot({ path: `${dir}/${name}.png` });
  const set = async (i: number, st: string) => {
    const [, dx] = doors[i];
    await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y }), { x: x + dx + 0.5, y: y + 1.5 });
    await page.waitForTimeout(350);
    await page.evaluate(([id, v]) => (window as any).__yutopia.send("door:set", { id, state: v }), [ids[i], st]);
    await page.waitForTimeout(250);
  };
  try {
    for (const [i, [kind, dx, props]] of doors.entries())
      await put(page, { id: ids[i], kind, x: x + dx, y, rot: 0, props });
    await expect.poll(async () => !!(await obj(page, ids[ids.length - 1]))).toBe(true);
    await page.evaluate(() => (window as any).__yutopia.engine.setClock?.(11));
    const pin = (cx: number, cy: number, zoom: number) =>
      page.evaluate(([a, b, z]) => (window as any).__yutopia.engine.pinCamera({ x: a, y: b, zoom: z }), [cx, cy, zoom]);
    await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y }), { x: x + 5, y: y + 4.5 });
    await pin(x + 5.5, y + 0.5, 1.5);
    await page.waitForTimeout(1500);
    await shot("10-doors-open");
    for (let i = 0; i < doors.length; i++) if (doors[i][0] !== "archway") await set(i, "closed");
    await set(3, "closed");
    await set(0, "locked");
    await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y }), { x: x + 5, y: y + 4.5 });
    await pin(x + 5.5, y + 0.5, 1.5);
    await page.waitForTimeout(1500);
    await shot("11-doors-shut");
    await pin(x + 2.5, y + 0.3, 2.6);
    await page.waitForTimeout(900);
    await shot("12-doors-shut-left");
    await pin(x + 7.5, y + 0.3, 2.6);
    await page.waitForTimeout(900);
    await shot("13-doors-shut-right");
    // open again and swung the other way, in 3D
    for (let i = 1; i < doors.length; i++) if (!["archway", "door_saloon"].includes(doors[i][0])) await set(i, "open");
    await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y }), { x: x + 3, y: y + 3.5 });
    await page.keyboard.press("t");
    await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
    const look = (yaw: number, dist: number) =>
      page.evaluate(
        ([a, d]) => {
          const t = (window as any).__yutopia.tp;
          t.setMode?.("free");
          t.yaw = a;
          t.pitch = 0.14;
          t.dist = d;
        },
        [yaw, dist],
      );
    await look(-Math.PI / 2, 4.2);
    await page.waitForTimeout(2500);
    await shot("14-3p-left");
    await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y }), { x: x + 7.5, y: y + 3.5 });
    await page.waitForTimeout(800);
    await look(-Math.PI / 2, 4.2);
    await page.waitForTimeout(2500);
    await shot("15-3p-right");
    await page.keyboard.press("t");
    await page.waitForFunction(() => !(window as any).__yutopia.tp, null, { timeout: 30_000 });
  } finally {
    await set(0, "open").catch(() => {});
    for (const id of ids) await remove(page, id);
    await page.waitForTimeout(500);
    await page.evaluate((e) => (window as any).__yutopia.send("map:walls", { edges: e }), run("."));
  }
});

// Review shots (YUTOPIA_SHOTS=<dir>): every kind of window in one wall, by day
// and by night in iso, and from both sides in 3D.
test("window kinds: review shots", async ({ page }) => {
  const dir = process.env.YUTOPIA_SHOTS;
  test.skip(!dir, "review shots: set YUTOPIA_SHOTS");
  test.setTimeout(300_000);
  await enter(page, await token(ANA), await useWorld("lab"));
  const W = 13;
  const spot = await page.evaluate((len) => {
    const w = (window as any).__yutopia;
    const m = w.map;
    const floor = (x: number, y: number) => !!w.grid?.ok?.(x, y);
    const busy = [...w.room.state.objects.values()];
    const near = (x: number, y: number) =>
      busy.some((o: any) => o.x >= x - 2 && o.x <= x + len + 1 && Math.abs(o.y - y) < 4);
    for (let y = 4; y < m.height - 4; y++)
      for (let x = 1; x < m.width - len - 1; x++) {
        let ok = true;
        for (let d = 0; d < len && ok; d++)
          for (let k = -3; k < 3 && ok; k++) {
            if (!floor(x + d, y + k)) ok = false;
            if ((m.hWalls[y + k]?.[x + d] ?? ".") !== "." || (m.vWalls[y + k]?.[x + d + 1] ?? ".") !== ".") ok = false;
          }
        if (ok && !near(x, y)) return { x, y };
      }
    return null;
  }, W);
  expect(spot, "open floor in the Lab").not.toBeNull();
  const { x, y } = spot as { x: number; y: number };
  const run = (ch: string) => Array.from({ length: W }, (_, d) => ({ x: x + d, y, dir: "h", ch }));
  await page.evaluate((e) => (window as any).__yutopia.send("map:walls", { edges: e }), run("p"));
  await expect
    .poll(() => page.evaluate((q) => (window as any).__yutopia.map.hWalls[q.y][q.x + 12], { x, y }))
    .toBe("p");
  const s = Date.now().toString(36);
  const wins: [string, number][] = [
    ["window", 0],
    ["window_wide", 1],
    ["window_tall", 3],
    ["window_round", 4],
    ["window_arched", 5],
    ["window_high", 6],
    ["window_stained", 8],
    ["window_blinds", 9],
    ["window_studio", 10],
  ];
  const ids = wins.map(([k, dx]) => `e2e-${k}-${dx}-${s}`);
  const shot = (name: string) => page.screenshot({ path: `${dir}/${name}.png` });
  const pin = (cx: number, cy: number, zoom: number) =>
    page.evaluate(([a, b, z]) => (window as any).__yutopia.engine.pinCamera({ x: a, y: b, zoom: z }), [cx, cy, zoom]);
  try {
    for (const [i, [kind, dx]] of wins.entries()) await put(page, { id: ids[i], kind, x: x + dx, y, rot: 0 });
    await expect.poll(async () => !!(await obj(page, ids[ids.length - 1]))).toBe(true);
    await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y }), { x: x + 6, y: y + 4.5 });
    await page.evaluate(() => (window as any).__yutopia.engine.setClock?.(11));
    await pin(x + 6.5, y + 0.5, 1.35);
    await page.waitForTimeout(1600);
    await shot("20-windows");
    await pin(x + 2.5, y + 0.3, 2.6);
    await page.waitForTimeout(900);
    await shot("21-windows-left");
    await pin(x + 9, y + 0.3, 2.6);
    await page.waitForTimeout(900);
    await shot("22-windows-right");
    await page.evaluate(() => (window as any).__yutopia.engine.setClock?.(21.5));
    await pin(x + 6.5, y + 0.5, 1.35);
    await page.waitForTimeout(1500);
    await shot("23-windows-night");
    await page.evaluate(() => (window as any).__yutopia.engine.setClock?.(11));
    await page.keyboard.press("t");
    await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
    const look = (yaw: number) =>
      page.evaluate((a) => {
        const t = (window as any).__yutopia.tp;
        t.setMode?.("free");
        t.yaw = a;
        t.pitch = 0.1;
        t.dist = 4.6;
      }, yaw);
    for (const [name, px, py, yaw] of [
      ["24-3p-left", x + 2.5, y + 3.5, -Math.PI / 2],
      ["25-3p-right", x + 9, y + 3.5, -Math.PI / 2],
      ["26-3p-back", x + 6, y - 3, Math.PI / 2],
    ] as const) {
      await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y }), { x: px, y: py });
      await page.waitForTimeout(700);
      await look(yaw);
      await page.waitForTimeout(2300);
      await shot(name);
    }
    // close, looking down at the sills (where the wall's top and a sill used to flicker)
    await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y }), { x: x + 1.5, y: y + 1.6 });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const t = (window as any).__yutopia.tp;
      t.yaw = -Math.PI / 2 + 0.5;
      t.pitch = 0.75;
      t.dist = 2.6;
    });
    await page.waitForTimeout(2300);
    await shot("27-3p-sills");
    await page.keyboard.press("t");
    await page.waitForFunction(() => !(window as any).__yutopia.tp, null, { timeout: 30_000 });
  } finally {
    for (const id of ids) await remove(page, id);
    await page.waitForTimeout(500);
    await page.evaluate((e) => (window as any).__yutopia.send("map:walls", { edges: e }), run("."));
  }
});
