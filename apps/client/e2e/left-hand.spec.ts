/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { HAND_SLOT, POCKETS, QUICK } from "@yutopia/shared/inventory";
import { ANA, BIA, enter, holdCamera, test, token } from "./helpers";

// The left hand (docs/plan/87-the-left-hand.md phase 3): Bia beside Ana on the pond's north shore at night. Her
// torch is in her left hand (everyone's is): 1 lights it — in her hand, its beam, on both screens — and 1 again puts
// it out and away. Flares given her, moved to her left hand: 1 lights one and she holds it up (F3b) — a flare in her
// left hand, burning, its light where it burns, on both screens, her hand one fewer; with the revolver out, held
// where the torch would be; G throws it — lying lit where it lands, its time going on. YUTOPIA_SHOTS=<dir>: stills,
// hers and Ana's. 3D: the GPU (YUTOPIA_GPU=1).
const GPU = process.env.YUTOPIA_GPU === "1";
const shots = process.env.YUTOPIA_SHOTS;
const ALL = POCKETS + QUICK;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const prefs = (p: Page) =>
  p.addInitScript(() => {
    const k = "yutopia:prefs";
    const v = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...v, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
const inv = (p: Page) => p.evaluate(() => (window as any).__dark?.inv as { quick: any[]; pockets: any[]; hand: any });
// what a screen has of Bia's left hand: the light on (the server's word), what's in her drawn hand (the torch or a
// flare), a flare held (the server's), where its end burns (the view's), and the flares the view draws lying
const seen = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const y = (window as any).__yutopia;
    const p = y.room.state.players.get(id);
    const p3 = y.tp.people3.get(id);
    let held = false;
    y.room.state.flares.forEach((f: any) => {
      if (f.held === id) held = true;
    });
    const tip = y.tp.flareTipOf(id);
    return {
      torch: !!p?.torch,
      inHand: p3?.torch ? (p3.torchKind as string) : "",
      held,
      tip: tip as { x: number; y: number; z: number } | null,
      at: { x: p?.x as number, y: p?.y as number, z: p?.z as number },
      lying: (y.tp.flares as any[]).filter((f) => !f.held).length,
      heldDrawn: (y.tp.flares as any[]).filter((f) => f.held).length,
    };
  }, sid);

test("the left hand: the torch by 1, a flare lit and held up by 1, thrown by G — as both see it", async ({
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
  for (const p of [page, bia]) {
    await p.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
      timeout: 90_000,
    });
  }
  const biaSid = (await bia.evaluate(() => (window as any).__yutopia.room.sessionId)) as string;
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -240, y: -22, level: 0 }));
  await bia.evaluate(() => (window as any).__yutopia.teleport({ x: -236.5, y: -22, level: 0 }));
  for (const p of [page, bia]) await p.waitForFunction(() => !!(window as any).__dark?.inv, null, { timeout: 30_000 });
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 22 });
    y.room.send("mod:storm", { storm: 0, now: true });
    y.room.send("mod:dark", { mode: "peaceful" });
  });
  // her quick slots, her pack and her left hand emptied; then a step away from what's dropped (a torch given her
  // after: into her left hand, as everyone's)
  await bia.evaluate(async (all) => {
    (window as any).__yutopia.room.send("arms:draw", { slot: -1 });
    for (let slot = 0; slot <= all; slot++) {
      (window as any).__yutopia.room.send("dark:drop", { slot });
      await new Promise((r) => setTimeout(r, 80));
    }
  }, ALL);
  await bia.evaluate(() => (window as any).__yutopia.teleport({ x: -236.5, y: -16, level: 0 }));
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -240, y: -16, level: 0 }));
  await bia.waitForTimeout(1200);
  await page.evaluate((id) => {
    (window as any).__bia = id;
  }, biaSid);
  const biaUid = (await w(page, (y) => y.room.state.players.get((window as any).__bia).uid)) as number;
  // her torch: into her left hand
  await page.evaluate(
    (u) => (window as any).__yutopia.room.send("mod:give", { item: "torch", n: 1, userId: u }),
    biaUid,
  );
  await expect.poll(async () => (await inv(bia))?.hand?.id, { timeout: 10_000 }).toBe("torch");
  await w(bia, (y) => {
    y.tp.yaw = 0;
  });
  const at = (await w(page, (y) => {
    const b = y.room.state.players.get((window as any).__bia);
    return { x: b.x, y: b.y };
  })) as { x: number; y: number };
  if (shots) await holdCamera(page, { at, yaw: -0.9, pitch: 0.12, dist: 3.2 });
  const still = async (name: string) => {
    if (!shots) return;
    await bia.screenshot({ path: `${shots}/left-${name}-hers.png` });
    await page.screenshot({ path: `${shots}/left-${name}-anas.png` });
  };

  // 1: the torch out and lit — in her left hand, on both screens; 1 again: out, away
  await bia.bringToFront();
  await bia.keyboard.press("Digit1");
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.torch), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.inHand), { timeout: 10_000 }).toBe("torch");
  }
  await bia.waitForTimeout(600);
  await still("torch");
  await bia.keyboard.press("Digit1");
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.torch), { timeout: 10_000 }).toBe(false);
    await expect.poll(() => seen(p, biaSid).then((s) => s.inHand), { timeout: 10_000 }).toBe("");
  }

  // flares given her, into her left hand (the torch to the pack, swapped)
  for (const [item, n] of [
    ["flare", 3],
    ["revolver", 1],
  ] as const)
    await page.evaluate(([u, i, k]) => (window as any).__yutopia.room.send("mod:give", { item: i, n: k, userId: u }), [
      biaUid,
      item,
      n,
    ] as const);
  await expect.poll(async () => (await inv(bia))?.pockets.some((s: any) => s?.id === "flare")).toBe(true);
  const fl = (await inv(bia))?.pockets.findIndex((s: any) => s?.id === "flare") as number;
  await bia.evaluate(([from, to]) => (window as any).__yutopia.room.send("dark:move", { from, to }), [fl, HAND_SLOT]);
  await expect.poll(async () => (await inv(bia))?.hand?.id).toBe("flare");

  // 1: one lit and held up — burning in her left hand, its light where it burns, on both screens; the hand one fewer
  await bia.keyboard.press("Digit1");
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.held), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => seen(p, biaSid).then((s) => s.inHand), { timeout: 10_000 }).toBe("flare");
    await expect.poll(() => seen(p, biaSid).then((s) => s.heldDrawn), { timeout: 5000 }).toBe(1);
    const s = await seen(p, biaSid);
    expect(s.tip, "its end drawn").not.toBeNull();
    expect(Math.hypot((s.tip?.x ?? 0) - s.at.x, (s.tip?.y ?? 0) - s.at.y), "in her hand, by her").toBeLessThan(1);
    expect((s.tip?.z ?? 0) - s.at.z, "held up: well over her feet").toBeGreaterThan(0.6);
  }
  expect((await inv(bia))?.hand?.n).toBe(2);
  await bia.waitForTimeout(500);
  await still("flare");
  // the revolver out: the flare held where the torch would be (Harries); still on both screens
  const rev = (await inv(bia))?.quick.findIndex((s: any) => s?.id === "revolver") as number;
  await bia.keyboard.press(`Digit${rev + 2}`);
  for (const p of [bia, page]) {
    await expect
      .poll(() => w(p, (y) => y.room.state.players.get((window as any).__bia ?? y.room.sessionId).gun), {
        timeout: 10_000,
      })
      .toBe("revolver");
    await expect.poll(() => seen(p, biaSid).then((s) => s.inHand), { timeout: 10_000 }).toBe("flare");
  }
  await bia.waitForTimeout(900);
  await still("flare-revolver");

  // G: thrown — no longer in her hand; lying lit where it lands, on both screens; her hand still two
  const lyingBefore = (await seen(page, biaSid)).lying;
  await bia.keyboard.press("KeyG");
  for (const p of [bia, page]) {
    await expect.poll(() => seen(p, biaSid).then((s) => s.held), { timeout: 5000 }).toBe(false);
    await expect.poll(() => seen(p, biaSid).then((s) => s.inHand), { timeout: 5000 }).toBe("");
  }
  await expect.poll(() => seen(page, biaSid).then((s) => s.lying), { timeout: 5000 }).toBe(lyingBefore + 1);
  expect((await inv(bia))?.hand?.n).toBe(2);
  await bia.waitForTimeout(600);
  await still("thrown");
  await w(page, (y) => y.room.send("mod:hour", { h: null }));
  await ctx.close();
});
