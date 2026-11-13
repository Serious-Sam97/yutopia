/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, holdCamera, test, token } from "./helpers";

// Two of us and the AK (docs/plan/82-the-ak.md phase 6): Bia beside Ana on the pond's north shore by day, an AK
// and its rounds given her. What she does with it Ana sees, and so does she: slung on her back, the pouch on
// her hip; drawn off her back into the low ready, both hands on; aimed, upright; a burst; reloaded — the
// magazine out of the well into her left hand, a new one from the pouch — and, run dry, the handle racked; put
// away, slung again. YUTOPIA_SHOTS=<dir>: stills of each, from her own camera and from Ana's beside her. 3D: the
// GPU (YUTOPIA_GPU=1).
const GPU = process.env.YUTOPIA_GPU === "1";
const shots = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const prefs = (p: Page) =>
  p.addInitScript(() => {
    const k = "yutopia:prefs";
    const v = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...v, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
// what a screen has of Bia's AK: slung (the gun on her back showing), the pouch, the gun in her hands, the
// hold, the gun's lean off upright, the reload's clock, its magazine off the gun, its handle racked
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
      sling: !!p3?.slings?.get("ak47"),
      slung: !!p3?.slings?.get("ak47")?.root.visible,
      pouch: !!p3?.akPouch,
      key: (g?.key ?? "") as string,
      life: !!g?.model.life,
      held: !!p3?.revHeld,
      cant,
      loadT: (p3?.akLoadT ?? -1) as number,
      magOff: !!g?.model.parts.magazine?.userData.akMoved,
      rack: !!p3?.akRack,
      bolt: (p3?.akBolt ?? 0) as number,
    };
  }, sid);

test("two of us and the AK: slung, drawn, aimed upright, a burst, reloaded and racked dry — as both see it", async ({
  page,
  browser,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(360_000);
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
  // her hands empty (her quick slots onto the snow — she's no admin: Ana gives her the AK and its rounds)
  await bia.evaluate(async () => {
    (window as any).__yutopia.room.send("arms:draw", { slot: -1 });
    for (const slot of [6, 7, 8, 9]) {
      (window as any).__yutopia.room.send("dark:drop", { slot });
      await new Promise((r) => setTimeout(r, 150));
    }
  });
  await expect.poll(() => seen(page, biaSid).then((s) => s.sling), { timeout: 10_000 }).toBe(false);
  const biaUid = (await w(page, (y) => y.room.state.players.get((window as any).__bia).uid)) as number;
  for (const [item, n] of [
    ["ak47", 1],
    ["r762", 120],
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
  // (stills: Ana's camera held on Bia from her right, a little ahead)
  const at = (await w(page, (y) => {
    const b = y.room.state.players.get((window as any).__bia);
    return { x: b.x, y: b.y };
  })) as { x: number; y: number };
  if (shots) await holdCamera(page, { at, yaw: 0.9, pitch: 0.12, dist: 3.2 });
  const still = async (name: string) => {
    if (!shots) return;
    await bia.screenshot({ path: `${shots}/ak-two-${name}-hers.png` });
    await page.screenshot({ path: `${shots}/ak-two-${name}-anas.png` });
  };

  // carried: slung on her back, the pouch on her hip — on both screens
  for (const p of [page, bia]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.sling), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.slung), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.pouch), { timeout: 15_000 }).toBe(true);
  }
  await still("slung");

  // drawn: off her back into the low ready, both hands on (the hold), her back empty
  const slot = (await bia.evaluate(() =>
    (window as any).__dark.inv.quick.findIndex((it: any) => it?.id === "ak47"),
  )) as number;
  await bia.bringToFront();
  await bia.keyboard.press(`Digit${slot + 1}`);
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.key), { timeout: 20_000 }).toBe("ak47");
    await expect.poll(() => seen(p, biaSid).then((s) => s.life), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.held), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.slung), { timeout: 10_000 }).toBe(false);
  }
  await bia.waitForTimeout(800);
  await still("ready");
  const loaded = () =>
    bia.evaluate(() => (window as any).__dark.inv.quick.find((it: any) => it?.id === "ak47")?.loaded as number);
  // (given empty: a reload first — the magazine in)
  if ((await loaded()) < 30) {
    await bia.keyboard.press("KeyR");
    await expect.poll(loaded, { timeout: 8000 }).toBe(30);
    await expect.poll(() => seen(bia, biaSid).then((s) => s.loadT), { timeout: 8000 }).toBeLessThan(0);
  }

  // aimed: upright, on both screens; a burst
  await bia.mouse.move(640, 400);
  await bia.mouse.down({ button: "right" });
  await bia.waitForTimeout(900);
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.cant), { timeout: 10_000 }).toBeLessThan(0.035);
  await still("aim");
  await bia.mouse.down({ button: "left" });
  await bia.waitForTimeout(700);
  await still("burst");
  await bia.mouse.up({ button: "left" });
  await expect.poll(() => page.evaluate(() => (window as any).__shots), { timeout: 5000 }).toBeGreaterThan(2);
  await bia.mouse.up({ button: "right" });
  await bia.waitForTimeout(600);
  expect(await loaded()).toBeLessThan(30);

  // the reload (not dry): its timeline on both screens — the magazine off the gun, into her left hand — and
  // back to the ready, shouldered, not racked
  await bia.keyboard.press("KeyR");
  for (const p of [bia, page]) {
    await expect
      .poll(() => seen(p, biaSid).then((s) => s.loadT), { timeout: 4000, intervals: [50] })
      .toBeGreaterThan(0);
    await expect.poll(() => seen(p, biaSid).then((s) => s.magOff), { timeout: 4000, intervals: [50] }).toBe(true);
  }
  await bia.waitForTimeout(400);
  await still("reload");
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.loadT), { timeout: 8000 }).toBeLessThan(0);
    await expect.poll(() => seen(p, biaSid).then((s) => s.held), { timeout: 5000 }).toBe(true);
  }
  expect((await seen(page, biaSid)).rack, "not run dry: not racked").toBe(false);
  await expect.poll(loaded, { timeout: 3000 }).toBe(30);

  // run dry, reloaded: the closing racks the handle — on both screens, the carrier back
  await bia.mouse.down({ button: "right" });
  await bia.waitForTimeout(600);
  await bia.mouse.down({ button: "left" });
  await expect.poll(loaded, { timeout: 30_000, intervals: [200] }).toBe(0);
  await bia.mouse.up({ button: "left" });
  await bia.mouse.up({ button: "right" });
  await bia.waitForTimeout(500);
  await bia.keyboard.press("KeyR");
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.rack), { timeout: 6000, intervals: [50] }).toBe(true);
    await expect
      .poll(() => seen(p, biaSid).then((s) => s.bolt), { timeout: 3000, intervals: [30] })
      .toBeGreaterThan(0.5);
  }
  await still("racked");
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.loadT), { timeout: 8000 }).toBeLessThan(0);
  await expect.poll(loaded, { timeout: 3000 }).toBe(30);

  // put away: slung on her back again
  await bia.evaluate(() => (window as any).__yutopia.room.send("arms:draw", { slot: -1 }));
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.slung), { timeout: 10_000 }).toBe(true);
  await bia.waitForTimeout(600);
  await still("away");
  await w(page, (y) => y.room.send("mod:hour", { h: null }));
  await ctx.close();
});
