/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, holdCamera, test, token } from "./helpers";

// Two of us and the double-barrel (docs/plan/81-the-shotgun.md phase 6): Bia beside Ana on the pond's north
// shore by day, a double-barrel and shells given her. What she does with it Ana sees, and so does she: slung on
// her back, the shell carrier on her hip; drawn over her shoulder into the low ready, both hands on; aimed,
// upright; both barrels fired; the reload — broken open, a shell from the carrier in her right hand, two in,
// shut — and back to the ready; put away, slung again. YUTOPIA_SHOTS=<dir>: stills of each, from her own camera
// and from Ana's beside her. 3D: the GPU (YUTOPIA_GPU=1).
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
// what a screen has of Bia's double-barrel: slung (the gun on her back showing), the carrier, the gun in her
// hands, the hold, the gun's lean off upright, the reload's clock, a shell in her hand
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
      // (plan 82: each slung long gun's, by its key)
      sling: !!p3?.slings?.get("shotgun"),
      slung: !!p3?.slings?.get("shotgun")?.root.visible,
      carrier: !!p3?.carrier,
      key: (g?.key ?? "") as string,
      life: !!g?.model.life,
      held: !!p3?.revHeld,
      cant,
      loadT: (p3?.sgLoadT ?? -1) as number,
      shell: !!p3?.sgShell?.visible,
    };
  }, sid);

test("two of us and the double-barrel: slung, drawn, aimed upright, fired, reloaded a shell at a time — as both see it", async ({
  page,
  browser,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(300_000);
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
  // her hands empty (her quick slots onto the snow — she's no admin: Ana gives her the gun and the shells)
  await bia.evaluate(async () => {
    (window as any).__yutopia.room.send("arms:draw", { slot: -1 });
    // (plan 85: her pack too — a weapon there is still hers, one of a kind: a given one wouldn't go in)
    for (let slot = 0; slot < 10; slot++) {
      (window as any).__yutopia.room.send("dark:drop", { slot });
      await new Promise((r) => setTimeout(r, 150));
    }
  });
  await expect.poll(() => seen(page, biaSid).then((s) => s.sling), { timeout: 10_000 }).toBe(false);
  const biaUid = (await w(page, (y) => y.room.state.players.get((window as any).__bia).uid)) as number;
  for (const [item, n] of [
    ["shotgun", 1],
    ["shell", 12],
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
    await bia.screenshot({ path: `${shots}/two-${name}-hers.png` });
    await page.screenshot({ path: `${shots}/two-${name}-anas.png` });
  };

  // carried: slung on her back, the carrier on her hip — on both screens
  for (const p of [page, bia]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.sling), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.slung), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.carrier), { timeout: 15_000 }).toBe(true);
  }
  await still("slung");

  // drawn: off her back into the low ready, both hands on (the hold), her back empty
  const slot = (await bia.evaluate(() =>
    (window as any).__dark.inv.quick.findIndex((it: any) => it?.id === "shotgun"),
  )) as number;
  await bia.bringToFront();
  await bia.keyboard.press(`Digit${slot + 1}`);
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.key), { timeout: 20_000 }).toBe("shotgun");
    await expect.poll(() => seen(p, biaSid).then((s) => s.life), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.held), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.slung), { timeout: 10_000 }).toBe(false);
  }
  await bia.waitForTimeout(800);
  await still("ready");

  // aimed: upright, on both screens; both barrels fired
  await bia.mouse.move(640, 400);
  await bia.mouse.down({ button: "right" });
  await bia.waitForTimeout(900);
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.cant), { timeout: 10_000 }).toBeLessThan(0.035);
  await still("aim");
  for (let i = 1; i <= 2; i++) {
    await bia.mouse.down({ button: "left" });
    await bia.mouse.up({ button: "left" });
    await expect.poll(() => page.evaluate(() => (window as any).__shots), { timeout: 5000 }).toBeGreaterThan(i - 1);
    await bia.waitForTimeout(1100);
  }
  await bia.mouse.up({ button: "right" });
  await bia.waitForTimeout(600);
  const loaded = () =>
    bia.evaluate(() => (window as any).__dark.inv.quick.find((it: any) => it?.id === "shotgun")?.loaded as number);
  expect(await loaded()).toBe(0);

  // the reload: its timeline on both screens — a shell from the carrier in her right hand — two in, shut,
  // back to the ready
  await bia.keyboard.press("KeyR");
  for (const p of [bia, page])
    await expect
      .poll(() => seen(p, biaSid).then((s) => s.loadT), { timeout: 4000, intervals: [50] })
      .toBeGreaterThan(0);
  await expect.poll(() => seen(bia, biaSid).then((s) => s.shell), { timeout: 3000, intervals: [30] }).toBe(true);
  await still("reload");
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.loadT), { timeout: 8000 }).toBeLessThan(0);
    await expect.poll(() => seen(p, biaSid).then((s) => s.held), { timeout: 5000 }).toBe(true);
  }
  await expect.poll(loaded, { timeout: 3000 }).toBe(2);

  // put away: slung on her back again
  await bia.evaluate(() => (window as any).__yutopia.room.send("arms:draw", { slot: -1 }));
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.slung), { timeout: 10_000 }).toBe(true);
  await bia.waitForTimeout(600);
  await still("away");
  await w(page, (y) => y.room.send("mod:hour", { h: null }));
  await ctx.close();
});
