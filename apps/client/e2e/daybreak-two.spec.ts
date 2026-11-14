/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, holdCamera, test, token } from "./helpers";

// Two of us and the Daybreak (docs/plan/84-the-daybreak.md phase 6): Bia beside Ana on the pond's north shore by
// day, a Daybreak and its cells given her. What she does with it Ana sees, and so does she: slung upright down
// her back; drawn off it by the carry handle into the low ready, both hands on; aimed — upright, on both screens;
// charged (she leans into it) and the ball away; reloaded on its side — the spent cell drawn out and let fall,
// a new one from the pouch on her belt, home, back up; put away, slung again. YUTOPIA_SHOTS=<dir>: stills of each,
// from her own camera and from Ana's beside her. 3D: the GPU (YUTOPIA_GPU=1).
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
// what a screen has of Bia's Daybreak: slung (the gun on her back showing), the gun in her hands, the hold, the
// gun's lean off upright, how far into its charge she leans, the reload's clock, the spent cell let fall, the
// pouch's drawn cell gone from it, the cell home on the gun
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
    const cell = g?.model.parts.cell;
    return {
      sling: !!p3?.slings?.get("daybreak"),
      slung: !!p3?.slings?.get("daybreak")?.root.visible,
      key: (g?.key ?? "") as string,
      life: !!g?.model.life,
      held: !!p3?.revHeld,
      cant,
      charge: (p3?.lgChargeK ?? 0) as number,
      loadT: (p3?.dbLoadT ?? -1) as number,
      dropped: !!p3?.dbDrop,
      pouchTaken: !!p3?.dbPouch && !p3.dbPouch.cells[0].visible,
      home: !!cell?.visible && cell.position.distanceTo(cell.userData.p0 ?? cell.position) < 1e-4,
    };
  }, sid);

test("two of us and the Daybreak: slung, drawn, aimed upright, charged and away, reloaded on its side — as both see it", async ({
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
    (window as any).__orbs = 0;
    y.room.onMessage("arms:orb", () => {
      (window as any).__orbs++;
    });
  });
  // her hands empty (her quick slots onto the snow — she's no admin: Ana gives her the Daybreak and its cells)
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
    ["daybreak", 1],
    ["cell", 9],
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
  // (stills: Ana's camera held on Bia from her left, a little ahead — the cell's side)
  const at = (await w(page, (y) => {
    const b = y.room.state.players.get((window as any).__bia);
    return { x: b.x, y: b.y };
  })) as { x: number; y: number };
  if (shots) await holdCamera(page, { at, yaw: -0.9, pitch: 0.12, dist: 3.2 });
  const still = async (name: string) => {
    if (!shots) return;
    await bia.screenshot({ path: `${shots}/daybreak-two-${name}-hers.png` });
    await page.screenshot({ path: `${shots}/daybreak-two-${name}-anas.png` });
  };

  // carried: slung on her back — on both screens
  for (const p of [page, bia]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.sling), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.slung), { timeout: 15_000 }).toBe(true);
  }
  await still("slung");

  // drawn: off her back into the low ready, both hands on (the hold), her back empty
  const slot = (await bia.evaluate(() =>
    (window as any).__dark.inv.quick.findIndex((it: any) => it?.id === "daybreak"),
  )) as number;
  await bia.bringToFront();
  await bia.keyboard.press(`Digit${slot + 1}`);
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.key), { timeout: 20_000 }).toBe("daybreak");
    await expect.poll(() => seen(p, biaSid).then((s) => s.life), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.held), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.slung), { timeout: 10_000 }).toBe(false);
  }
  await bia.waitForTimeout(800);
  await still("ready");
  const loaded = () =>
    bia.evaluate(() => (window as any).__dark.inv.quick.find((it: any) => it?.id === "daybreak")?.loaded as number);
  // (given empty: a reload first — three cells in)
  if ((await loaded()) < 3) {
    await bia.keyboard.press("KeyR");
    await expect.poll(loaded, { timeout: 10_000 }).toBe(3);
    await expect.poll(() => seen(bia, biaSid).then((s) => s.loadT), { timeout: 8000 }).toBeLessThan(0);
  }

  // aimed: upright on both screens; pressed, it charges — she leans into it, on both — and the ball's away
  await bia.mouse.move(640, 400);
  await bia.mouse.down({ button: "right" });
  await bia.waitForTimeout(900);
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.cant), { timeout: 10_000 }).toBeLessThan(0.035);
  await still("aim");
  await bia.mouse.down({ button: "left" });
  await bia.mouse.up({ button: "left" });
  for (const p of [bia, page])
    await expect
      .poll(() => seen(p, biaSid).then((s) => s.charge), { timeout: 2000, intervals: [30] })
      .toBeGreaterThan(0.5);
  await still("charge");
  await expect.poll(() => page.evaluate(() => (window as any).__orbs), { timeout: 3000 }).toBe(1);
  await expect.poll(loaded, { timeout: 3000 }).toBe(2);
  await bia.mouse.up({ button: "right" });
  await bia.waitForTimeout(2600);

  // the reload: on its side at her chest — the spent cell drawn out and let fall, a new one from the pouch on
  // her belt — on both screens — then home, back up to the ready
  await bia.keyboard.press("KeyR");
  for (const p of [bia, page]) {
    await expect
      .poll(() => seen(p, biaSid).then((s) => s.loadT), { timeout: 4000, intervals: [50] })
      .toBeGreaterThan(0);
    await expect.poll(() => seen(p, biaSid).then((s) => s.dropped), { timeout: 3000, intervals: [30] }).toBe(true);
  }
  await still("reload-drop");
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.pouchTaken), { timeout: 3000, intervals: [30] }).toBe(true);
  await still("reload-pouch");
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.loadT), { timeout: 6000 }).toBeLessThan(0);
    await expect.poll(() => seen(p, biaSid).then((s) => s.home), { timeout: 3000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.held), { timeout: 5000 }).toBe(true);
  }
  await expect.poll(loaded, { timeout: 3000 }).toBe(3);

  // put away: slung on her back again
  await bia.evaluate(() => (window as any).__yutopia.room.send("arms:draw", { slot: -1 }));
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.slung), { timeout: 10_000 }).toBe(true);
  await bia.waitForTimeout(600);
  await still("away");
  await w(page, (y) => y.room.send("mod:hour", { h: null }));
  await ctx.close();
});
