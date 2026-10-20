/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld } from "./helpers";

// First person, live: Ana sees the Lab from her own eyes (the 3D view's
// "first" camera, a per-player setting), Bia in iso. The camera stands on
// Ana at eye height and she isn't drawn; where she looks (mouse look) is
// where she faces, and Bia sees her turn; S walks her backwards without
// turning; a click (the crosshair) walks her there and the camera comes
// along; sitting drops the eyes and turns the view the seat's way; Y goes
// back to third person, T to iso and T again to first person.
// Headless Chromium never grants a pointer lock, so the lock is stubbed as
// in mouse-look.spec.ts.

// (3D: the real GPU — headless software GL draws a frame in seconds, and the hints fade first)
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const shots = process.env.YUTOPIA_SHOTS;
// the 8 facings as world angles (the controller's table)
const DIR_ANGLE = [
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
].map(([x, y]) => Math.atan2(y, x));

const sid = (page: Page) => page.evaluate(() => (window as any).__yutopia.room.sessionId as string);
const me = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    return { x: w.me.x as number, y: w.me.y as number, a: w.me.a as number, d: w.me.d as number };
  });
const cam = (page: Page) =>
  page.evaluate(() => {
    const t = (window as any).__yutopia.tp;
    const c = t.camera.position;
    return { x: c.x as number, y: c.y as number, z: c.z as number, yaw: t.yaw as number, mode: t.mode as string };
  });
const myCardShown = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    return !!w.tp?.drawnAt(w.room.sessionId)?.shown;
  });
// Ana's 8-way facing as Bia's world has it
const seenD = (pageB: Page, id: string) =>
  pageB.evaluate((i) => (window as any).__yutopia.room.state.players.get(i)?.d as number, id);
const turn = (page: Page, px: number) =>
  page.evaluate((dx) => {
    const c = document.pointerLockElement as HTMLElement;
    c.dispatchEvent(new PointerEvent("pointermove", { movementX: dx, movementY: 0, bubbles: true }));
  }, px);

function stubLock(page: Page) {
  return page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "1p", last3d: "1p", lookSens: 1, lookInvert: false }));
    let el: Element | null = null;
    Object.defineProperty(Document.prototype, "pointerLockElement", { configurable: true, get: () => el });
    Element.prototype.requestPointerLock = function (this: Element) {
      el = this;
      setTimeout(() => document.dispatchEvent(new Event("pointerlockchange")));
      return Promise.resolve();
    } as any;
    Document.prototype.exitPointerLock = () => {
      el = null;
      setTimeout(() => document.dispatchEvent(new Event("pointerlockchange")));
    };
  });
}

test("first person: in my head, facing where I look, Bia sees me turn", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const tokA = await token(ANA);
  const tokB = await token(BIA);
  const lab = await useWorld("lab");
  await stubLock(page);
  await enter(page, tokA, lab);
  await page.waitForFunction(() => (window as any).__yutopia.tp?.mode === "first", null, { timeout: 60_000 });
  await page.waitForTimeout(600);

  // the camera is me, at eye height; I'm not drawn
  const a0 = await me(page);
  const c0 = await cam(page);
  expect(Math.hypot(c0.x - a0.x, c0.z - a0.y)).toBeLessThan(0.05);
  expect(c0.y).toBeGreaterThan(1.5);
  expect(c0.y).toBeLessThan(1.9);
  expect(await myCardShown(page)).toBe(false);

  // Bia, in iso, in her own browser; Ana goes to her
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await ctxB.newPage();
  await enter(pageB, tokB, lab);
  const anaSid = await sid(page);
  const biaUid = await pageB.evaluate(() => (window as any).__yutopia.myUid() as number);
  await page.evaluate((uid) => (window as any).__yutopia.teleport({ userId: uid }), biaUid);
  await page.waitForTimeout(1500);

  // Z: mouse look; a quarter turn to the right → I face that way, and so does
  // the Ana in Bia's world
  await page.keyboard.press("z");
  await expect.poll(() => page.evaluate(() => !!(window as any).__yutopia.tp.looking)).toBe(true);
  const y0 = (await cam(page)).yaw;
  await turn(page, 330);
  await turn(page, 325);
  await expect.poll(async () => (await cam(page)).yaw - y0).toBeGreaterThan(1.4);
  const faced = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const yaw = w.tp.yaw as number;
    return { yaw, dx: Math.cos(yaw), dy: Math.sin(yaw) };
  });
  const a1 = await me(page);
  // (my facing, as 8 directions, is the one nearest where I look: within 45°)
  let off1 = faced.yaw - DIR_ANGLE[a1.d];
  off1 = Math.atan2(Math.sin(off1), Math.cos(off1));
  expect(Math.abs(off1)).toBeLessThan(Math.PI / 4 + 0.15);
  expect(a1.d).not.toBe(a0.d);
  await expect.poll(() => seenD(pageB, anaSid), { timeout: 8000 }).toBe(a1.d);

  // W: I walk where I look; S: back the same way, still facing it
  await page.keyboard.down("w");
  await page.waitForTimeout(700);
  await page.keyboard.up("w");
  await page.waitForTimeout(300);
  const a2 = await me(page);
  const fwd = { x: a2.x - a1.x, y: a2.y - a1.y };
  expect(Math.hypot(fwd.x, fwd.y)).toBeGreaterThan(0.4);
  expect(fwd.x * faced.dx + fwd.y * faced.dy).toBeGreaterThan(0);
  await page.keyboard.down("s");
  await page.waitForTimeout(500);
  await page.keyboard.up("s");
  await page.waitForTimeout(300);
  const a3 = await me(page);
  const back = { x: a3.x - a2.x, y: a3.y - a2.y };
  expect(Math.hypot(back.x, back.y)).toBeGreaterThan(0.3);
  expect(back.x * faced.dx + back.y * faced.dy).toBeLessThan(0);
  expect(a3.d).toBe(a1.d);
  // the camera came along, still in my head
  const c3 = await cam(page);
  expect(Math.hypot(c3.x - a3.x, c3.z - a3.y)).toBeLessThan(0.05);

  // a click: the crosshair's spot on the floor ahead → I walk there
  let spot: { x: number; y: number } | null = null;
  for (const pitch of [0.9, 0.7, 1.1, 0.5]) {
    await page.evaluate((p) => {
      (window as any).__yutopia.tp.pitch = p;
    }, pitch);
    await page.waitForTimeout(120);
    spot = await page.evaluate(() => {
      const w = (window as any).__yutopia;
      const t = w.tp;
      const r = t.renderer.domElement.getBoundingClientRect();
      const f = t.floorAt(r.left + r.width / 2, r.top + r.height / 2, 0);
      if (!f || !w.grid.fits(f.x, f.y) || Math.hypot(f.x - w.me.x, f.y - w.me.y) < 0.8) return null;
      t.setRay(r.left + r.width / 2, r.top + r.height / 2);
      return t.personAt() || t.pickObject() ? null : f;
    });
    if (spot) break;
  }
  expect(spot).not.toBeNull();
  if (spot) {
    await page.mouse.click(640, 400);
    await expect
      .poll(
        async () => {
          const m = await me(page);
          return Math.hypot(m.x - spot.x, m.y - spot.y);
        },
        { timeout: 10_000 },
      )
      .toBeLessThan(0.6);
  }
  if (shots) {
    await page.evaluate(() => {
      (window as any).__yutopia.tp.pitch = 0.1;
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${shots}/live-ana-first-person.png` });
    await pageB.screenshot({ path: `${shots}/live-bia-iso-of-first-person.png` });
  }

  // a sofa by the spawn: sitting drops the eyes and turns the view the seat's way
  await page.keyboard.press("z");
  await expect.poll(() => page.evaluate(() => !!(window as any).__yutopia.tp.looking)).toBe(false);
  await page.evaluate(() => (window as any).__yutopia.teleport("spawn"));
  await page.waitForTimeout(1200);
  const id = `e2e-1p-sofa-${Date.now().toString(36)}`;
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
    await page.waitForFunction((i) => (window as any).__yutopia.tp.world.picks.some((p: any) => p.id === i), id, {
      timeout: 15_000,
    });
    // Sit (the action menu's item): walks onto the seat
    await page.evaluate((i) => (window as any).__yutopia.actions.add("sit", { type: "object", id: i }, "Sofa"), id);
    await expect.poll(async () => (await me(page)).a, { timeout: 20_000 }).toBe(2);
    await page.waitForTimeout(1200);
    const seated = await me(page);
    const cs = await cam(page);
    expect(cs.y).toBeLessThan(1.35);
    expect(cs.y).toBeGreaterThan(1.0);
    // facing the seat's way, the view too
    let off = cs.yaw - DIR_ANGLE[seated.d];
    off = Math.atan2(Math.sin(off), Math.cos(off));
    expect(Math.abs(off)).toBeLessThan(0.05);
    if (shots) await page.screenshot({ path: `${shots}/live-ana-first-person-seated.png` });
  } finally {
    await page.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id);
  }

  // Y: third person (drawn again); T: iso; T: back to first person
  await page.keyboard.press("y");
  await expect.poll(async () => (await cam(page)).mode).toBe("chase");
  await expect.poll(() => myCardShown(page)).toBe(true);
  await page.keyboard.press("y");
  await expect.poll(async () => (await cam(page)).mode).toBe("first");
  await page.keyboard.press("t");
  await page.waitForFunction(
    () => !(window as any).__yutopia.tp && (window as any).__yutopia.engine.app.canvas.style.visibility !== "hidden",
  );
  await page.keyboard.press("t");
  await page.waitForFunction(() => (window as any).__yutopia.tp?.mode === "first", null, { timeout: 30_000 });

  // Settings → View: the three choices, first person pressed; a click on
  // Third person takes the chase camera back
  await page.getByRole("button", { name: "Settings" }).click();
  const first = page.getByRole("button", { name: "First person (beta)" });
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Isometric" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Third person (beta)" }).click();
  await expect.poll(async () => (await cam(page)).mode).toBe("chase");
  await expect(page.getByRole("button", { name: "Camera follows me" })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/live-ana-settings-view.png` });

  // leave her setting as it was for the other specs
  await page.evaluate(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "iso", last3d: "3p" }));
  });
});

// My hands (docs/plan/22-people-3d.md, P5): with nothing to do they stay out
// of view; the phone out brings them up holding it (drawn in their own pass);
// put away, they go down again; Settings can turn them off.
test("first person: my hands come up with the phone, and Settings can hide them", async ({ page }) => {
  test.setTimeout(120_000);
  const tok = await token(ANA);
  const lab = await useWorld("lab");
  await stubLock(page);
  await enter(page, tok, lab);
  await page.waitForFunction(() => (window as any).__yutopia.tp?.mode === "first", null, { timeout: 60_000 });
  await page.waitForFunction(() => (window as any).__hud.get().phone.loaded, null, { timeout: 20_000 });
  const hands = () =>
    page.evaluate(() => (window as any).__yutopia.tp.handsNow() as { shown: boolean; doing: string } | null);
  await page.waitForTimeout(800);
  expect((await hands())?.shown ?? false).toBe(false);

  await page.keyboard.press("p");
  await expect.poll(async () => (await hands())?.doing, { timeout: 15_000 }).toBe("text");
  await expect.poll(async () => (await hands())?.shown, { timeout: 30_000 }).toBe(true);
  if (shots) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${shots}/live-ana-hands-phone.png` });
  }
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await hands())?.shown ?? false, { timeout: 10_000 }).toBe(false);

  // Settings: the switch is there in first person, on; off, the phone comes out with no hands
  await page.evaluate(() => (window as any).__hud.set({ panel: { kind: "settings" } }));
  const row = page.locator("label", { hasText: "Show my hands in first person" }).getByRole("button");
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
  await page.keyboard.press("p");
  await page.waitForTimeout(1500);
  expect(await hands()).toBeNull();
  await page.keyboard.press("Escape");

  // leave her settings as they were for the other specs
  await page.evaluate(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "iso", last3d: "3p", hands1p: true }));
  });
});
