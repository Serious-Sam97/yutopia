/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// Two of us and the guns (docs/plan/79-the-guns.md phase 8): Bia beside Ana on the pond's north shore by
// day; what Bia does with each gun Ana sees — the AK in Bia's hands (the life model), its burst's shots,
// its magazine out in her left hand reloading; the sniper's bolt worked; the Daybreak's core swelling as
// she charges it, its ball and its burst. 3D: the GPU (YUTOPIA_GPU=1).
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
// Bia's hands empty (her quick slots onto the snow — she's no admin: Ana gives her the guns), and a gun
// of hers drawn by its slot
const empty = (bia: Page) =>
  bia.evaluate(async () => {
    for (const slot of [6, 7, 8, 9]) {
      (window as any).__yutopia.room.send("dark:drop", { slot });
      await new Promise((r) => setTimeout(r, 150));
    }
  });
const give = (ana: Page, uid: number, item: string, n = 1) =>
  ana.evaluate(([u, i, k]) => (window as any).__yutopia.room.send("mod:give", { item: i, n: k, userId: u }), [
    uid,
    item,
    n,
  ] as const);
const drawOn = async (bia: Page, id: string) => {
  await expect
    .poll(() => bia.evaluate((g) => (window as any).__dark?.inv?.quick.findIndex((it: any) => it?.id === g), id), {
      timeout: 10_000,
    })
    .toBeGreaterThan(-1);
  const i = (await bia.evaluate(
    (g) => (window as any).__dark.inv.quick.findIndex((it: any) => it?.id === g),
    id,
  )) as number;
  await bia.keyboard.press(`Digit${i + 1}`);
  await expect.poll(() => w(bia, (y) => y.room.state.players.get(y.room.sessionId).gun), { timeout: 10_000 }).toBe(id);
};
// what Ana's screen has of Bia's gun: its key, life model or not, its moving parts' state
const seen = (ana: Page, sid: string) =>
  ana.evaluate((id) => {
    const p3 = (window as any).__yutopia.tp.people3.get(id);
    const g = p3?.gun;
    return {
      key: (g?.key ?? "") as string,
      life: !!g?.model.life,
      magInHand: !!p3?.magInHand,
      held: !!p3?.revHeld,
      akT: (p3?.akLoadT ?? -1) as number,
      magMoved: !!g?.model.parts.magazine?.userData.akMoved,
      boltT: (p3?.boltT ?? 0) as number,
      core: (g?.model.parts.core?.scale.x ?? 1) as number,
    };
  }, sid);

test("two of us: Ana sees Bia's guns — held, fired, reloaded, the bolt, the Daybreak's charge and ball", async ({
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
    y.tp.yaw = 0;
  });
  const biaUid = (await w(page, (y) => y.room.state.players.get((window as any).__bia).uid)) as number;
  await empty(bia);
  for (const [item, n] of [
    ["ak47", 1],
    ["sniper", 1],
    ["r762", 60],
    ["r308", 15],
  ] as const) {
    await give(page, biaUid, item, n);
    await page.waitForTimeout(150);
  }
  await w(bia, (y) => {
    y.tp.yaw = 0;
  });
  await bia.waitForTimeout(1500);
  await bia.mouse.move(640, 400);

  // the AK: in Bia's hands on Ana's screen, its own model
  await drawOn(bia, "ak47");
  await expect
    .poll(() => w(page, (y) => y.room.state.players.get((window as any).__bia ?? "")?.gun ?? "?"), { timeout: 10_000 })
    .toBe("ak47");
  await expect.poll(() => seen(page, biaSid).then((s) => s.key), { timeout: 20_000 }).toBe("ak47");
  await expect.poll(() => seen(page, biaSid).then((s) => s.life), { timeout: 20_000 }).toBe(true);
  // a burst: its rounds' shots reach Ana (each its own)
  // (Bia's page in front while she shoots: two 3D pages share the GPU, and the one behind runs slow —
  // full auto fires on her frames)
  await bia.bringToFront();
  await bia.mouse.down({ button: "right" });
  await bia.waitForTimeout(800);
  await bia.mouse.down({ button: "left" });
  await bia.waitForTimeout(1500);
  await bia.mouse.up({ button: "left" });
  // (more than one: a burst — its rate is arms-feel's and the server's; two 3D pages here run a few
  // frames a second, and full auto fires on its own page's frames)
  await expect.poll(() => page.evaluate(() => (window as any).__shots), { timeout: 5000 }).toBeGreaterThan(1);
  // its reload on Ana's screen: run as Bia's — the magazine out of the well into her left hand (plan 82 phase 4:
  // one timeline from the server's steps, Player.arm), the gun kept in her hands
  await bia.mouse.up({ button: "right" });
  await bia.waitForTimeout(300);
  await bia.keyboard.press("KeyR");
  await expect.poll(() => seen(page, biaSid).then((s) => s.akT), { timeout: 4000, intervals: [50] }).toBeGreaterThan(0);
  await expect.poll(() => seen(page, biaSid).then((s) => s.held), { timeout: 4000, intervals: [50] }).toBe(true);
  await expect.poll(() => seen(page, biaSid).then((s) => s.magMoved), { timeout: 4000, intervals: [50] }).toBe(true);
  await bia.waitForTimeout(2500);

  // the sniper: a shot, then the bolt worked — on Ana's screen
  await drawOn(bia, "sniper");
  await expect.poll(() => seen(page, biaSid).then((s) => s.key), { timeout: 20_000 }).toBe("sniper");
  await bia.waitForTimeout(800);
  await bia.mouse.down({ button: "right" });
  await bia.waitForTimeout(900);
  await bia.mouse.down({ button: "left" });
  await bia.mouse.up({ button: "left" });
  await expect
    .poll(() => seen(page, biaSid).then((s) => s.boltT), { timeout: 3000, intervals: [50] })
    .toBeGreaterThan(0);
  await bia.mouse.up({ button: "right" });
  await bia.waitForTimeout(1500);

  // the Daybreak: charging, its core swells on Ana's screen; its ball and its burst there too
  await empty(bia);
  await give(page, biaUid, "daybreak");
  await give(page, biaUid, "cell", 3);
  await drawOn(bia, "daybreak");
  await expect.poll(() => seen(page, biaSid).then((s) => s.key), { timeout: 20_000 }).toBe("daybreak");
  await expect.poll(() => seen(page, biaSid).then((s) => s.life), { timeout: 20_000 }).toBe(true);
  const bursts0 = (await w(page, (y) => y.tp.arms().burstsShown)) as number;
  await bia.waitForTimeout(800);
  await bia.mouse.down({ button: "right" });
  await bia.waitForTimeout(900);
  await w(bia, (y) => {
    y.tp.pitch = 0.1;
  });
  await bia.mouse.down({ button: "left" });
  await bia.mouse.up({ button: "left" });
  await expect
    .poll(() => seen(page, biaSid).then((s) => s.core), { timeout: 2000, intervals: [50] })
    .toBeGreaterThan(1.2);
  await expect.poll(() => w(page, (y) => y.tp.arms().burstsShown), { timeout: 6000 }).toBeGreaterThan(bursts0);
  await bia.mouse.up({ button: "right" });
  await w(page, (y) => y.room.send("mod:hour", { h: null }));
  await ctx.close();
});
