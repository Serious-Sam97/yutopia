/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, holdCamera, test, token } from "./helpers";

// A weapon in the pack (docs/plan/85-weapons-in-the-pockets.md phase 4): Bia beside Ana on the pond's north shore
// by day, a revolver and a double-barrel given her (and their rounds). Equipped — in her quick slots — they show on
// her: the revolver's holster on her hip, the double-barrel on her back and its shell carrier at her hip, on both
// screens. Her inventory open (I): the revolver in her hand dragged to the pack — put away and off her hip at once;
// the double-barrel dragged to the pack — off her back, its carrier gone; on Ana's screen too. Picked in the pack:
// its details say so, Equip (E) puts it in the first empty quick slot — on her hip again. Gone and back: the
// double-barrel still in her pack, still worn nowhere. YUTOPIA_SHOTS=<dir>: stills of each, hers and Ana's. 3D: the
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
    localStorage.setItem(k, JSON.stringify({ ...v, view: "3p", cam3p: "chase", reducedMotion: false, lang: "en" }));
    // (the pointer lock, as mouse-look.spec fakes it — headless has none)
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
const inv = (p: Page) => p.evaluate(() => (window as any).__dark?.inv as { quick: any[]; pockets: any[] } | undefined);
// what a screen has of Bia: the server's word (in her hand, worn) and the drawn (her holster, the slung double-barrel,
// its shell carrier)
const seen = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const y = (window as any).__yutopia;
    const p = y.room.state.players.get(id);
    const p3 = y.tp.people3.get(id);
    return {
      gun: (p?.gun ?? "") as string,
      holster: !!p?.holster,
      sling: !!p?.sling,
      holster3: !!p3?.holster?.root?.parent,
      sling3: !!p3?.slings?.get("shotgun")?.root.visible,
      carrier3: !!p3?.carrier?.root?.parent,
    };
  }, sid);
const slot = (page: Page, i: number) => page.locator(`.dk-inv [data-slot="${i}"]`);
const drag = async (page: Page, from: ReturnType<typeof slot>, to: ReturnType<typeof slot>) => {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("no box");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 10, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
};

test("a weapon in the pack: put away and worn nowhere, on both screens; equipped again; kept across a rejoin", async ({
  page,
  browser,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(300_000);
  await prefs(page);
  await enter(page, await token(ANA));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  let bia = await ctx.newPage();
  await prefs(bia);
  const biaTok = await token(BIA);
  await enter(bia, biaTok);
  for (const p of [page, bia])
    await p.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
      timeout: 90_000,
    });
  const biaSid = (await bia.evaluate(() => (window as any).__yutopia.room.sessionId)) as string;
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -240, y: -22, level: 0 }));
  await bia.evaluate(() => (window as any).__yutopia.teleport({ x: -236.5, y: -22, level: 0 }));
  for (const p of [page, bia]) {
    await p.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 30_000 });
    await p.waitForFunction(() => !!(window as any).__dark?.inv, null, { timeout: 30_000 });
  }
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 13 });
    y.room.send("mod:storm", { storm: 0, now: true });
    y.room.send("mod:dark", { mode: "peaceful" });
  });
  // her hands and her pack empty (onto the snow — then a step away from it); she's no admin: Ana gives her the guns
  await bia.evaluate(async () => {
    (window as any).__yutopia.room.send("arms:draw", { slot: -1 });
    for (let slot = 0; slot < 10; slot++) {
      (window as any).__yutopia.room.send("dark:drop", { slot });
      await new Promise((r) => setTimeout(r, 80));
    }
  });
  await expect
    .poll(async () => {
      const v = await inv(bia);
      return !!v && v.quick.every((it) => !it) && v.pockets.every((it) => !it);
    })
    .toBe(true);
  await bia.evaluate(() => (window as any).__yutopia.teleport({ x: -236.5, y: -16, level: 0 }));
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -240, y: -16, level: 0 }));
  await bia.waitForTimeout(1200);
  await page.evaluate((id) => {
    (window as any).__bia = id;
  }, biaSid);
  const biaUid = (await w(page, (y) => y.room.state.players.get((window as any).__bia).uid)) as number;
  for (const [item, n] of [
    ["revolver", 1],
    ["shotgun", 1],
    ["r38", 12],
    ["shell", 6],
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
  const at = (await w(page, (y) => {
    const b = y.room.state.players.get((window as any).__bia);
    return { x: b.x, y: b.y };
  })) as { x: number; y: number };
  if (shots) await holdCamera(page, { at, yaw: 2.6, pitch: 0.15, dist: 3 });
  const still = async (name: string) => {
    if (!shots) return;
    await bia.screenshot({ path: `${shots}/pack-${name}-hers.png` });
    await page.screenshot({ path: `${shots}/pack-${name}-anas.png` });
  };

  // equipped: both in her quick slots — worn, on both screens
  for (const p of [page, bia])
    await expect
      .poll(() => seen(p, biaSid).then((s) => s.holster && s.sling && s.holster3 && s.sling3 && s.carrier3), {
        timeout: 20_000,
      })
      .toBe(true);
  const quick = (await inv(bia))?.quick ?? [];
  const rev = quick.findIndex((it) => it?.id === "revolver");
  const sg = quick.findIndex((it) => it?.id === "shotgun");
  expect(rev >= 0 && sg >= 0, "both in her quick slots").toBe(true);
  // the revolver drawn
  await bia.bringToFront();
  await bia.keyboard.press(`Digit${rev + 1}`);
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.gun), { timeout: 10_000 }).toBe("revolver");
  await bia.waitForTimeout(600);
  await still("worn");

  // her inventory open: the revolver in her hand dragged to the pack — put away, off her hip, on both screens
  await bia.keyboard.press("KeyI");
  await expect(bia.locator(".dk-inv .panel")).toBeVisible();
  await expect(bia.locator(".dk-inv .head h1")).toHaveText(/pack/i);
  await drag(bia, slot(bia, 6 + rev), slot(bia, 0));
  await expect.poll(async () => (await inv(bia))?.pockets[0]?.id, { timeout: 5000 }).toBe("revolver");
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.gun), { timeout: 3000 }).toBe("");
    await expect.poll(() => seen(p, biaSid).then((s) => s.holster || s.holster3), { timeout: 5000 }).toBe(false);
  }
  // the double-barrel to the pack too — off her back, its carrier gone, on both screens
  await drag(bia, slot(bia, 6 + sg), slot(bia, 1));
  await expect.poll(async () => (await inv(bia))?.pockets[1]?.id, { timeout: 5000 }).toBe("shotgun");
  for (const p of [bia, page])
    await expect
      .poll(() => seen(p, biaSid).then((s) => s.sling || s.sling3 || s.carrier3), { timeout: 5000 })
      .toBe(false);
  // picked in the pack: its details — in the pack, Equip
  await slot(bia, 0).click();
  await expect(bia.locator(".dk-inv .det .note")).toHaveText(/in the pack/i);
  await expect(bia.locator('.dk-inv .det [data-act="equip"]')).toBeVisible();
  await still("pack");
  // Equip (E): into the first empty quick slot (the pockets' rounds swapped up into the ones the guns left) — on
  // her hip again
  const free = (await inv(bia))?.quick.indexOf(null) ?? -1;
  expect(free, "a quick slot empty").toBeGreaterThanOrEqual(0);
  await bia.keyboard.press("KeyE");
  await expect
    .poll(async () => (await inv(bia))?.quick.findIndex((it) => it?.id === "revolver"), { timeout: 5000 })
    .toBe(free);
  for (const p of [bia, page])
    await expect.poll(() => seen(p, biaSid).then((s) => s.holster && s.holster3), { timeout: 5000 }).toBe(true);
  await bia.keyboard.press("Escape");
  await bia.waitForTimeout(600);
  await still("equipped");

  // gone and back: the double-barrel still in her pack, still worn nowhere
  await bia.close();
  await page.waitForTimeout(1500);
  bia = await ctx.newPage();
  await prefs(bia);
  await enter(bia, biaTok);
  await bia.waitForFunction(() => !!(window as any).__dark?.inv, null, { timeout: 90_000 });
  await expect
    .poll(async () => (await inv(bia))?.pockets.some((it) => it?.id === "shotgun"), { timeout: 15_000 })
    .toBe(true);
  const sid2 = (await bia.evaluate(() => (window as any).__yutopia.room.sessionId)) as string;
  await expect.poll(() => seen(page, sid2).then((s) => s.holster), { timeout: 10_000 }).toBe(true);
  expect((await seen(page, sid2)).sling, "the double-barrel in her pack: not on her back").toBe(false);
  await w(page, (y) => y.room.send("mod:hour", { h: null }));
  await ctx.close();
});
