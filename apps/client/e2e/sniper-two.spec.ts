/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, holdCamera, test, token } from "./helpers";

// Two of us and the sniper (docs/plan/83-the-sniper.md phase 7): Bia beside Ana on the pond's north shore by
// day, a sniper and its rounds given her. What she does with it Ana sees, and so does she: slung on her back;
// drawn off her back into the low ready, both hands on; aimed — down the scope on her own screen, upright on
// Ana's (her own body isn't drawn scoped); a shot, then the bolt worked by her right hand; reloaded raised —
// the bolt back, a round at a time out of the sleeve, the bolt home; put away, slung again. YUTOPIA_SHOTS=<dir>:
// stills of each, from her own camera and from Ana's beside her. 3D: the GPU (YUTOPIA_GPU=1).
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
// what a screen has of Bia's sniper: slung (the gun on her back showing), the gun in her hands, the hold, the
// gun's lean off upright, the bolt's clock and its travel, the reload's clock and its closing, a round in her
// hand
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
      sling: !!p3?.slings?.get("sniper"),
      slung: !!p3?.slings?.get("sniper")?.root.visible,
      key: (g?.key ?? "") as string,
      life: !!g?.model.life,
      held: !!p3?.revHeld,
      cant,
      boltT: (p3?.boltT ?? 0) as number,
      bolt: (p3?.boltCycle ?? 0) as number,
      loadT: (p3?.snLoadT ?? -1) as number,
      closing: ((p3?.snCloseAt ?? -1) as number) >= 0,
      round: !!p3?.snRound?.visible,
    };
  }, sid);

test("two of us and the sniper: slung, drawn, aimed upright, a shot and the bolt, reloaded a round at a time — as both see it", async ({
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
  // her hands empty (her quick slots onto the snow — she's no admin: Ana gives her the sniper and its rounds)
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
    ["sniper", 1],
    ["r308", 30],
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
    await bia.screenshot({ path: `${shots}/sniper-two-${name}-hers.png` });
    await page.screenshot({ path: `${shots}/sniper-two-${name}-anas.png` });
  };

  // carried: slung on her back — on both screens
  for (const p of [page, bia]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.sling), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.slung), { timeout: 15_000 }).toBe(true);
  }
  await still("slung");

  // drawn: off her back into the low ready, both hands on (the hold), her back empty
  const slot = (await bia.evaluate(() =>
    (window as any).__dark.inv.quick.findIndex((it: any) => it?.id === "sniper"),
  )) as number;
  await bia.bringToFront();
  await bia.keyboard.press(`Digit${slot + 1}`);
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.key), { timeout: 20_000 }).toBe("sniper");
    await expect.poll(() => seen(p, biaSid).then((s) => s.life), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.held), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.slung), { timeout: 10_000 }).toBe(false);
  }
  await bia.waitForTimeout(800);
  await still("ready");
  const loaded = () =>
    bia.evaluate(() => (window as any).__dark.inv.quick.find((it: any) => it?.id === "sniper")?.loaded as number);
  // (given empty: a reload first — five rounds in)
  if ((await loaded()) < 5) {
    await bia.keyboard.press("KeyR");
    await expect.poll(loaded, { timeout: 10_000 }).toBe(5);
    await expect.poll(() => seen(bia, biaSid).then((s) => s.loadT), { timeout: 8000 }).toBeLessThan(0);
  }

  // aimed: down the scope on her screen, upright on Ana's; a shot, then the bolt worked — on both screens
  await bia.mouse.move(640, 400);
  await bia.mouse.down({ button: "right" });
  await bia.waitForTimeout(900);
  await expect.poll(() => w(bia, (y) => y.tp.scopeK as number), { timeout: 10_000 }).toBeGreaterThan(0.85);
  await expect.poll(() => seen(page, biaSid).then((s) => s.cant), { timeout: 10_000 }).toBeLessThan(0.035);
  await still("aim");
  await bia.mouse.down({ button: "left" });
  await bia.mouse.up({ button: "left" });
  await expect.poll(() => page.evaluate(() => (window as any).__shots), { timeout: 5000 }).toBe(1);
  for (const p of [bia, page])
    await expect
      .poll(() => seen(p, biaSid).then((s) => s.bolt), { timeout: 3000, intervals: [30] })
      .toBeGreaterThan(0.5);
  await still("bolt");
  for (const p of [bia, page]) await expect.poll(() => seen(p, biaSid).then((s) => s.boltT), { timeout: 3000 }).toBe(0);
  await bia.mouse.up({ button: "right" });
  await bia.waitForTimeout(600);
  expect(await loaded()).toBe(4);

  // a second shot (the bolt worked between): one more heard, the bolt again
  await bia.mouse.down({ button: "right" });
  await bia.waitForTimeout(900);
  await bia.mouse.down({ button: "left" });
  await bia.mouse.up({ button: "left" });
  await expect.poll(() => page.evaluate(() => (window as any).__shots), { timeout: 5000 }).toBe(2);
  await expect
    .poll(() => seen(page, biaSid).then((s) => s.bolt), { timeout: 3000, intervals: [30] })
    .toBeGreaterThan(0.5);
  await bia.waitForTimeout(1200);
  await bia.mouse.up({ button: "right" });
  await bia.waitForTimeout(600);
  expect(await loaded()).toBe(3);

  // the reload: raised, the bolt back, a round in her right hand out of the sleeve — on both screens — the
  // closing, the bolt home, back to the ready
  await bia.keyboard.press("KeyR");
  for (const p of [bia, page]) {
    await expect
      .poll(() => seen(p, biaSid).then((s) => s.loadT), { timeout: 4000, intervals: [50] })
      .toBeGreaterThan(0);
    await expect
      .poll(() => seen(p, biaSid).then((s) => s.bolt), { timeout: 3000, intervals: [30] })
      .toBeGreaterThan(0.9);
    await expect.poll(() => seen(p, biaSid).then((s) => s.round), { timeout: 3000, intervals: [30] }).toBe(true);
  }
  await still("reload");
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.closing), { timeout: 6000, intervals: [50] }).toBe(true);
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.loadT), { timeout: 6000 }).toBeLessThan(0);
    await expect.poll(() => seen(p, biaSid).then((s) => s.bolt), { timeout: 3000 }).toBeLessThan(0.05);
    await expect.poll(() => seen(p, biaSid).then((s) => s.held), { timeout: 5000 }).toBe(true);
  }
  await expect.poll(loaded, { timeout: 3000 }).toBe(5);

  // put away: slung on her back again
  await bia.evaluate(() => (window as any).__yutopia.room.send("arms:draw", { slot: -1 }));
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.slung), { timeout: 10_000 }).toBe(true);
  await bia.waitForTimeout(600);
  await still("away");
  await w(page, (y) => y.room.send("mod:hour", { h: null }));
  await ctx.close();
});
