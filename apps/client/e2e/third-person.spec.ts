/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld } from "./helpers";

// Third person, live: Ana sees the Lab in third person (a per-player setting),
// Bia in iso, in the same room at the same time. Each sees the other where
// they really are and moving; Ana walks with WASD relative to her camera and by
// clicking the floor; T switches her view and back. YUTOPIA_SHOTS=<dir> saves
// both screens.

const shots = process.env.YUTOPIA_SHOTS;

const sid = (page: Page) => page.evaluate(() => (window as any).__yutopia.room.sessionId as string);
const mePos = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    return { x: w.me.x as number, y: w.me.y as number, a: w.me.a as number };
  });
// where Ana's 3D view draws someone (tiles), or null
const drawnIn3d = (page: Page, id: string) =>
  page.evaluate((i) => {
    const p = (window as any).__yutopia.tp?.drawnAt(i);
    return p?.shown ? { x: p.x as number, y: p.y as number } : null;
  }, id);
// where Bia's iso engine draws someone
const drawnInIso = (page: Page, id: string) =>
  page.evaluate((i) => (window as any).__yutopia.engine.avatarAt(i) as { x: number; y: number } | null, id);

async function waitNear(read: () => Promise<{ x: number; y: number } | null>, x: number, y: number, ms = 6000) {
  const end = Date.now() + ms;
  let last: { x: number; y: number } | null = null;
  while (Date.now() < end) {
    last = await read();
    if (last && Math.hypot(last.x - x, last.y - y) < 0.6) return last;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`not near (${x.toFixed(2)}, ${y.toFixed(2)}): ${JSON.stringify(last)}`);
}

test("third person and iso players share the Lab live", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const tokA = await token(ANA);
  const tokB = await token(BIA);
  const lab = await useWorld("lab");

  // Ana: third person (her own setting), chase camera
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
  });
  await enter(page, tokA, lab);
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  // the iso engine stops drawing underneath
  // (the iso picture is hidden under the 3D one; the engine keeps its logic running)
  expect(await page.evaluate(() => (window as any).__yutopia.engine.app.canvas.style.visibility)).toBe("hidden");

  // Bia: iso, in her own browser
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await ctxB.newPage();
  await enter(pageB, tokB, lab);
  const anaSid = await sid(page);
  const biaSid = await sid(pageB);
  const biaUid = await pageB.evaluate(() => (window as any).__yutopia.myUid() as number);

  // Ana goes to Bia
  await page.evaluate((uid) => (window as any).__yutopia.teleport({ userId: uid }), biaUid);
  await page.waitForTimeout(1500);
  const a0 = await mePos(page);
  const b0 = await mePos(pageB);

  // each sees the other where they are: Bia in Ana's 3D view, Ana in Bia's iso view
  await waitNear(() => drawnIn3d(page, biaSid), b0.x, b0.y, 15_000);
  await waitNear(() => drawnInIso(pageB, anaSid), a0.x, a0.y);

  // Ana walks with W: away from her camera, and Bia sees her move there
  const fwd = await page.evaluate(() => {
    const yaw = (window as any).__yutopia.tp.yaw as number;
    return { x: Math.cos(yaw), y: Math.sin(yaw) };
  });
  await page.keyboard.down("w");
  await page.waitForTimeout(900);
  await page.keyboard.up("w");
  await page.waitForTimeout(400);
  const a1 = await mePos(page);
  const moved = { x: a1.x - a0.x, y: a1.y - a0.y };
  // (walls may slide her along, but never backwards)
  expect(Math.hypot(moved.x, moved.y)).toBeGreaterThan(0.5);
  expect(moved.x * fwd.x + moved.y * fwd.y).toBeGreaterThan(0);
  await waitNear(() => drawnInIso(pageB, anaSid), a1.x, a1.y);

  // Bia walks (iso: S = screen down = world +x +y) and Ana's 3D view follows her
  await pageB.keyboard.down("s");
  await pageB.waitForTimeout(700);
  await pageB.keyboard.up("s");
  await pageB.waitForTimeout(400);
  const b1 = await mePos(pageB);
  expect(Math.hypot(b1.x - b0.x, b1.y - b0.y)).toBeGreaterThan(0.3);
  await waitNear(() => drawnIn3d(page, biaSid), b1.x, b1.y);

  if (shots) {
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${shots}/live-ana-third-person.png` });
    await pageB.screenshot({ path: `${shots}/live-bia-iso.png` });
  }

  // a click on the floor in front of her: she walks there
  const target = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const yaw = w.tp.yaw as number;
    const r = w.tp.renderer.domElement.getBoundingClientRect();
    // somewhere free in view, clear of the HUD (ahead first, then to the sides)
    for (const turn of [0, 0.5, -0.5, 1, -1])
      for (let d = 2.5; d >= 1; d -= 0.5) {
        const x = w.me.x + Math.cos(yaw + turn) * d;
        const y = w.me.y + Math.sin(yaw + turn) * d;
        if (!w.grid.fits(x, y)) continue;
        const p = w.tp.project(x, y, 0);
        if (!p || p.x < 260 || p.x > r.width - 60 || p.y < 120 || p.y > r.height - 120) continue;
        // bare floor there: not someone, not something to use
        w.tp.setRay(r.left + p.x, r.top + p.y);
        if (w.tp.personAt() || w.tp.pickObject()) continue;
        return { x, y, cx: r.left + p.x, cy: r.top + p.y };
      }
    return null;
  });
  expect(target).not.toBeNull();
  if (target) {
    await page.mouse.click(target.cx, target.cy);
    await waitNear(() => mePos(page), target.x, target.y, 8000);
  }

  // T: back to iso and into third person again
  await page.keyboard.press("t");
  await page.waitForFunction(
    () => !(window as any).__yutopia.tp && (window as any).__yutopia.engine.app.canvas.style.visibility !== "hidden",
  );
  await page.keyboard.press("t");
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 30_000 });
  await waitNear(() => drawnIn3d(page, biaSid), b1.x, b1.y, 15_000);

  // leave her setting as it was for the other specs
  await page.evaluate(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "iso" }));
  });
});

// What people do shows in third person as in iso (an emote over Bia's head in
// Ana's 3D view, her phone in her hand), and things are used by clicking them in 3D: a
// sofa put down in the Lab, clicked, Sit → Ana sits on it (drawn seated).
test("third person: emotes and phones over there, a sofa clicked in 3D seats you", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const tokA = await token(ANA);
  const tokB = await token(BIA);
  const lab = await useWorld("lab");
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
  });
  await enter(page, tokA, lab);
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await ctxB.newPage();
  await enter(pageB, tokB, lab);
  const biaSid = await sid(pageB);
  const biaUid = await pageB.evaluate(() => (window as any).__yutopia.myUid() as number);
  await page.evaluate((uid) => (window as any).__yutopia.teleport({ userId: uid }), biaUid);
  await page.waitForTimeout(1500);

  // Bia waves and says something: Ana sees both over her head
  await pageB.evaluate(() => (window as any).__yutopia.emote(0));
  await expect
    .poll(() =>
      page.evaluate((i) => {
        const t = (window as any).__yutopia.tp.tagEls.get(i);
        return !!t && t.emote.style.display !== "none" && t.emote.src.startsWith("data:image/svg");
      }, biaSid),
    )
    .toBe(true);
  // Bia takes her phone out: Ana's 3D view draws it in her hand
  await pageB.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 20_000 });
  await pageB.evaluate(() => (window as any).__yutopia.togglePhone(true));
  await expect
    .poll(() =>
      page.evaluate((i) => {
        let out = "";
        (window as any).__yutopia.room.state.players.forEach((p: any, s: string) => {
          if (s === i) out = p.phone;
        });
        return out;
      }, biaSid),
    )
    .toBe("text");
  await pageB.evaluate(() => (window as any).__yutopia.togglePhone(false));

  // a sofa by the spawn, clicked in 3D
  await page.evaluate(() => (window as any).__yutopia.teleport("spawn"));
  await page.waitForTimeout(1200);
  const id = `e2e-3p-sofa-${Date.now().toString(36)}`;
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const X = Math.floor(sp.x) - 1;
  const Y = Math.floor(sp.y) - 3;
  try {
    await page.evaluate((o) => (window as any).__yutopia.send("obj:put", o), {
      id,
      kind: "sofa",
      x: X,
      y: Y,
      rot: 0,
      props: {},
    });
    // in the 3D room (redrawn where it changed) and clickable
    await page.waitForFunction((i) => (window as any).__yutopia.tp.world.picks.some((p: any) => p.id === i), id, {
      timeout: 15_000,
    });
    await page.evaluate(() => {
      const t = (window as any).__yutopia.tp;
      t.yaw = -Math.PI / 2; // looking north, at the sofa
      t.pitch = 0.7;
      t.dist = 6;
    });
    await page.waitForTimeout(800);
    // a spot on the sofa that isn't someone
    const at = await page.evaluate((i) => {
      const t = (window as any).__yutopia.tp;
      const p = t.world.picks.find((q: any) => q.id === i);
      const r = t.renderer.domElement.getBoundingClientRect();
      for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        const s = t.project(p.x0 + (p.x1 - p.x0) * fx, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2);
        if (!s) continue;
        t.setRay(r.left + s.x, r.top + s.y);
        if (!t.personAt() && t.pickObject() === i) return { x: r.left + s.x, y: r.top + s.y };
      }
      return null;
    }, id);
    expect(at).not.toBeNull();
    if (at) await page.mouse.click(at.x, at.y);
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
    // drawn seated in 3D (on the sofa's tile)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = (window as any).__yutopia;
          const p = w.tp.drawnAt(w.room.sessionId);
          return p?.shown ? Math.floor(p.y) : null;
        }),
      )
      .toBe(Y);
    if (shots) await page.screenshot({ path: `${shots}/live-ana-sofa.png` });
  } finally {
    await page.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id);
    await page.evaluate(() => {
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, view: "iso" }));
    });
  }
});

// Build mode in third person: the iso build controller, fed the 3D pointer —
// pick a plant from the catalog and click a spot on the floor in 3D; click
// its leaves to pick it up (a ghost in hand, gone from the room); click two
// tiles over to put it down there.
test("third person: build mode places, picks up and moves a thing in 3D", async ({ page }) => {
  test.setTimeout(150_000);
  const tok = await token(ANA);
  const lab = await useWorld("lab");
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
  });
  await enter(page, tok, lab);
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).__yutopia.teleport("spawn"));
  await page.waitForTimeout(1200);
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  const X = Math.floor(sp.x) + 1;
  const Y = Math.floor(sp.y) - 3;
  const objectsAt = (x: number, y: number) =>
    page.evaluate(
      ([tx, ty]) =>
        [...(window as any).__yutopia.room.state.objects.values()]
          .filter((o: any) => o.x === tx && o.y === ty)
          .map((o: any) => ({ id: o.id, kind: o.kind })),
      [x, y],
    );
  const build = () => page.evaluate(() => (window as any).__hud.get().build);
  // a point on screen over a world spot (tiles, h in tiles), as the 3D camera sees it
  const screenAt = (x: number, y: number, h = 0) =>
    page.evaluate(
      ([tx, ty, th]) => {
        const t = (window as any).__yutopia.tp;
        const r = t.renderer.domElement.getBoundingClientRect();
        const p = t.project(tx, ty, th);
        return { x: r.left + p.x, y: r.top + p.y };
      },
      [x, y, h],
    );
  const clickAt = async (x: number, y: number, h = 0) => {
    const p = await screenAt(x, y, h);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(150);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(150);
  };
  let plant = "";
  try {
    await page.evaluate(() => {
      const h = (window as any).__hud;
      h.set({ build: { ...h.get().build, on: true, tool: "furniture", mode: "hand", selected: [] } });
    });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
    // still third person while building, the camera held looking north at the spot
    expect(await page.evaluate(() => !!(window as any).__yutopia.tp)).toBe(true);
    await page.evaluate(() => {
      const t = (window as any).__yutopia.tp;
      t.mode = "free";
      t.yaw = -Math.PI / 2;
      t.pitch = 0.8;
      t.dist = 7;
    });
    await page.waitForTimeout(600);

    // place from the catalog: the ghost follows the 3D pointer, a click puts it down
    await page.getByRole("tab", { name: "Decor" }).click();
    await page.getByRole("button", { name: "Plant", exact: true }).click();
    expect((await build()).mode).toBe("place");
    const p0 = await screenAt(X + 0.5, Y + 0.5);
    await page.mouse.move(p0.x, p0.y);
    await expect
      .poll(() => page.evaluate(() => (window as any).__yutopia.tp.builder.ghosts.children.length))
      .toBeGreaterThan(0);
    await clickAt(X + 0.5, Y + 0.5);
    await expect.poll(() => objectsAt(X, Y)).toEqual([expect.objectContaining({ kind: "plant" })]);
    plant = (await objectsAt(X, Y))[0].id;

    // pick it up by its leaves (half a tile up): in hand, out of the room
    await page.waitForFunction((i) => (window as any).__yutopia.tp.world.picks.some((p: any) => p.id === i), plant, {
      timeout: 10_000,
    });
    await clickAt(X + 0.5, Y + 0.5, 0.6);
    await expect.poll(async () => (await build()).carrying).toBe(1);
    await expect
      .poll(() => page.evaluate((i) => !(window as any).__yutopia.tp.world.picks.some((p: any) => p.id === i), plant))
      .toBe(true);
    if (shots) await page.screenshot({ path: `${shots}/live-ana-build-carry.png` });

    // put it down two tiles over (letting go at the height it was held, as in iso: it keeps where you hold it)
    await clickAt(X + 2.5, Y + 0.5, 0.6);
    await expect.poll(() => objectsAt(X + 2, Y)).toEqual([expect.objectContaining({ id: plant })]);
    await expect.poll(async () => (await build()).carrying).toBe(0);
    if (shots) await page.screenshot({ path: `${shots}/live-ana-build-placed.png` });

    // the Walls tool: a wall about to go on the edge under the pointer, drawn in 3D
    await page.evaluate(() => {
      const h = (window as any).__hud;
      h.set({ build: { ...h.get().build, tool: "walls", wallMode: "build", brush: "w:p", selected: [] } });
    });
    await page.waitForTimeout(300);
    const pe = await screenAt(X + 4.5, Y + 0.05);
    await page.mouse.move(pe.x - 5, pe.y);
    await page.mouse.move(pe.x, pe.y);
    await expect
      .poll(() => page.evaluate(() => (window as any).__yutopia.engine.buildLook().edges.length))
      .toBeGreaterThan(0);
    await expect
      .poll(() => page.evaluate(() => (window as any).__yutopia.tp.builder.cues.children.length))
      .toBeGreaterThan(0);
    if (shots) await page.screenshot({ path: `${shots}/live-ana-build-wall.png` });
  } finally {
    if (plant) await page.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), plant);
    await page.evaluate(() => {
      const h = (window as any).__hud;
      h.set({ build: { ...h.get().build, on: false } });
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, view: "iso" }));
    });
  }
});
