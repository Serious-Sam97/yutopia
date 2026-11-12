/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// Two of us and the revolver (docs/plan/80-the-revolver.md phase 6): Bia beside Ana on the pond's north shore
// by day, a revolver given her. What she does with it Ana sees, and so does she: the holster on her hip with
// the gun in it; drawn out of it into the low ready, both hands on; aimed, upright; a shot; the reload — the
// cylinder out, the speedloader in her right hand, shut — and back to the ready. 3D: the GPU (YUTOPIA_GPU=1).
const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const prefs = (p: Page) =>
  p.addInitScript(() => {
    const k = "yutopia:prefs";
    const v = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...v, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
// what a screen has of Bia's revolver: the holster (its gun showing), the gun in her hand, the hold, the gun's
// lean off upright, the reload's clock, the speedloader
const seen = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const p3 = (window as any).__yutopia.tp.people3.get(id);
    const g = p3?.gun;
    let cant = 9;
    if (g?.model.root) {
      const q = g.model.root.getWorldQuaternion(new g.model.root.quaternion.constructor());
      const V = g.model.root.position.constructor;
      const f = new V(1, 0, 0).applyQuaternion(q);
      const u = new V(0, 1, 0).applyQuaternion(q);
      const want = new V(0, 1, 0).addScaledVector(f, -f.y).normalize();
      const top = u.addScaledVector(f, -u.dot(f)).normalize();
      cant = Math.acos(Math.max(-1, Math.min(1, top.dot(want))));
    }
    return {
      holster: !!p3?.holster,
      holstered: !!p3?.holster?.gun?.root.visible,
      key: (g?.key ?? "") as string,
      life: !!g?.model.life,
      held: !!p3?.revHeld,
      cant,
      loadT: (p3?.revLoadT ?? -1) as number,
      loader: (p3?.revLoaderState ?? "none") as string,
    };
  }, sid);

test("two of us and the revolver: holstered, drawn, aimed upright, fired, reloaded — as both see it", async ({
  page,
  browser,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(240_000);
  await prefs(page);
  await enter(page, await token(ANA));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bia = await ctx.newPage();
  await prefs(bia);
  await enter(bia, await token(BIA));
  for (const p of [page, bia])
    await p.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
      timeout: 90_000,
    });
  const biaSid = (await bia.evaluate(() => (window as any).__yutopia.room.sessionId)) as string;
  await page.evaluate((id) => {
    (window as any).__bia = id;
  }, biaSid);
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -240, y: -22, level: 0 }));
  await bia.evaluate(() => (window as any).__yutopia.teleport({ x: -236.5, y: -22, level: 0 }));
  for (const p of [page, bia])
    await p.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 30_000 });
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 13 });
    y.room.send("mod:storm", { storm: 0, now: true });
    y.room.send("mod:dark", { mode: "peaceful" });
    (window as any).__shots = 0;
    y.room.onMessage("arms:shot", () => {
      (window as any).__shots++;
    });
  });
  // her hands empty (her quick slots onto the snow — she's no admin: Ana gives her the revolver and rounds)
  await bia.evaluate(async () => {
    (window as any).__yutopia.room.send("arms:draw", { slot: -1 });
    for (const slot of [6, 7, 8, 9]) {
      (window as any).__yutopia.room.send("dark:drop", { slot });
      await new Promise((r) => setTimeout(r, 150));
    }
  });
  await expect.poll(() => seen(page, biaSid).then((s) => s.holster), { timeout: 10_000 }).toBe(false);
  const biaUid = (await w(page, (y) => y.room.state.players.get((window as any).__bia).uid)) as number;
  for (const [item, n] of [
    ["revolver", 1],
    ["r38", 24],
  ] as const) {
    await page.evaluate(([u, i, k]) => (window as any).__yutopia.room.send("mod:give", { item: i, n: k, userId: u }), [
      biaUid,
      item,
      n,
    ] as const);
    await page.waitForTimeout(150);
  }
  await w(bia, (y) => {
    y.tp.yaw = 0;
  });

  // carried: the holster on her hip, the revolver in it — on both screens
  for (const p of [page, bia]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.holster), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.holstered), { timeout: 15_000 }).toBe(true);
  }

  // drawn: out of the holster into the low ready, both hands on (the hold), the holster empty
  const slot = (await bia.evaluate(() =>
    (window as any).__dark.inv.quick.findIndex((it: any) => it?.id === "revolver"),
  )) as number;
  await bia.bringToFront();
  await bia.keyboard.press(`Digit${slot + 1}`);
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.key), { timeout: 20_000 }).toBe("revolver");
    await expect.poll(() => seen(p, biaSid).then((s) => s.life), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.held), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.holstered), { timeout: 10_000 }).toBe(false);
  }

  // aimed: upright, on both screens; a shot
  await bia.mouse.move(640, 400);
  await bia.mouse.down({ button: "right" });
  await bia.waitForTimeout(900);
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.cant), { timeout: 10_000 }).toBeLessThan(0.035);
  await bia.mouse.down({ button: "left" });
  await bia.mouse.up({ button: "left" });
  await expect.poll(() => page.evaluate(() => (window as any).__shots), { timeout: 5000 }).toBeGreaterThan(0);
  await bia.mouse.up({ button: "right" });
  await bia.waitForTimeout(600);

  // the reload: its timeline on both screens — the speedloader in her right hand — then back to the ready
  await bia.keyboard.press("KeyR");
  for (const p of [bia, page]) {
    await expect
      .poll(() => seen(p, biaSid).then((s) => s.loadT), { timeout: 4000, intervals: [50] })
      .toBeGreaterThan(0);
    // (in her hand 1.0–1.8 s in, then let go — the page behind runs a few frames a second: either)
    await expect
      .poll(() => seen(p, biaSid).then((s) => s.loader), { timeout: 4000, intervals: [50] })
      .toMatch(/^(hand|fall)$/);
  }
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.loadT), { timeout: 8000 }).toBeLessThan(0);
    await expect.poll(() => seen(p, biaSid).then((s) => s.held), { timeout: 5000 }).toBe(true);
  }
  expect(
    await bia.evaluate(() => (window as any).__dark.inv.quick.find((it: any) => it?.id === "revolver")?.loaded),
  ).toBe(6);

  // put away: back in the holster
  await bia.evaluate(() => (window as any).__yutopia.room.send("arms:draw", { slot: -1 }));
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.holstered), { timeout: 10_000 }).toBe(true);
  await w(page, (y) => y.room.send("mod:hour", { h: null }));
  await ctx.close();
});
