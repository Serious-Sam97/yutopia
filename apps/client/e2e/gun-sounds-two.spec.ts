/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { type Browser, expect, type Page } from "@playwright/test";
import { POCKETS, QUICK, WEAPONS } from "@yutopia/shared/inventory";
import { ANA, BIA, enter, test, token } from "./helpers";

// A gun's handling sounds with someone else near (2026-11-16: drawn beside another player, a roar — a draw or a
// holster every frame; the sniper's reload too). Its cause: the Player at 65 fields, and Colyseus sends 64 — the
// 65th read on every screen as "delete field 0", everyone's sid ""; the gun sounds kept each player's arm by it, two
// near sharing one entry, flipping between them each frame. Ana and Bia side by side in the studio's lobby,
// each in a browser of her own (both drawing every frame, as two friends' machines do): with each gun, both given
// it, both draw it, both fire it, both reload it, both put it away — on each screen, every handling sound
// heard a few times at most, never one over and over a frame apart; the draws and the put-aways, two each.
const ARGS = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
test.use({ launchOptions: { args: ARGS } });
const ALL = POCKETS + QUICK;
const GUNS = ["revolver", "shotgun", "ak47", "sniper", "daybreak"] as const;
type Gun = (typeof GUNS)[number];
// (the sound each one's reload opens with — dark/arms.ts armSounds)
const RELOAD: Record<Gun, string> = {
  revolver: "revolver-open",
  shotgun: "shotgun-break",
  ak47: "ak-mag-in",
  sniper: "sniper-bolt-open",
  daybreak: "daybreak-cell-out",
};
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
// every gun sound a screen plays: its slot and when
const listen = (p: Page) =>
  p.evaluate(() => {
    const v = (window as any).__dark.voices;
    const heard: [string, number][] = [];
    (window as any).__gunheard = heard;
    const f = v.gun.bind(v);
    v.gun = (...a: any[]) => {
      heard.push([a[0], performance.now()]);
      return f(...a);
    };
  });
const heard = (p: Page) => p.evaluate(() => [...((window as any).__gunheard as [string, number][])]);
const clear = (p: Page) =>
  p.evaluate(() => {
    (window as any).__gunheard.length = 0;
  });
// (a shot's sounds, and brass landing: many at once is right)
// (voices.ts isShotSound: a shot near, indoors, far; the Daybreak's; a dry click — and brass landing)
const isShot = (s: string) => /-(near|in|far|fire|burst|burst-far|dry)$|^(case|shell|mag)-/.test(s);
const mine = (p: Page) => w(p, (y) => y.room.state.players.get(y.room.sessionId));
const held = (p: Page, gun: Gun) =>
  p.evaluate((g) => (window as any).__dark.inv.quick.find((it: any) => it?.id === g)?.loaded ?? -1, gun);

// her hands and pockets emptied (a gun given goes in a free quick slot)
const empty = (p: Page) =>
  p.evaluate(async (all) => {
    (window as any).__yutopia.room.send("arms:draw", { slot: -1 });
    for (let slot = 0; slot < all; slot++) {
      (window as any).__yutopia.room.send("dark:drop", { slot });
      await new Promise((r) => setTimeout(r, 120));
    }
  }, ALL);

async function draw(p: Page, gun: Gun) {
  const slot = (await p.evaluate(
    (g) => (window as any).__dark.inv.quick.findIndex((it: any) => it?.id === g),
    gun,
  )) as number;
  expect(slot).toBeGreaterThanOrEqual(0);
  await p.keyboard.press(`Digit${slot + 2}`);
  await expect.poll(() => mine(p).then((m: any) => m.gun), { timeout: 10_000 }).toBe(gun);
  return slot;
}
async function reload(p: Page, gun: Gun) {
  const mag = WEAPONS[gun].mag;
  await expect
    .poll(
      async () => {
        const n = (await held(p, gun)) as number;
        // (pressed again whenever it isn't loading: a round at a time, or the whole)
        if (n < mag && (await mine(p).then((m: any) => m.arm)) === 0) await p.keyboard.press("KeyR");
        return n;
      },
      { timeout: 25_000, intervals: [700] },
    )
    .toBe(mag);
  await p.waitForTimeout(1500);
}
async function fire(p: Page, gun: Gun, yaw: number) {
  await p.evaluate((a) => {
    const y = (window as any).__yutopia;
    y.tp.yaw = a;
    y.tp.pitch = 0.05;
  }, yaw);
  await p.mouse.move(640, 400);
  await p.mouse.down({ button: "right" });
  await p.waitForTimeout(900);
  await p.mouse.down({ button: "left" });
  await p.mouse.up({ button: "left" });
  // (the Daybreak: pressed, it charges, and goes once it's charged — plan 79 phase 7)
  await p.waitForTimeout(gun === "daybreak" ? 3500 : 1500);
  await p.mouse.up({ button: "right" });
  await p.waitForTimeout(800);
}

test("every gun beside someone: drawn, reloaded, fired and put away — each sound heard once a time, on both screens", async ({
  page,
  playwright,
}) => {
  test.setTimeout(900_000);
  // (Bia's own browser first, loaded before Ana's: one loading its 3D view stalls the other's frames)
  const other: Browser = await playwright.chromium.launch({ args: ARGS });
  const bia = await (
    await other.newContext({ viewport: { width: 1280, height: 800 }, baseURL: test.info().project.use.baseURL })
  ).newPage();
  await enter(bia, await token(BIA)).catch(async (e) => {
    await bia.screenshot({ path: test.info().outputPath("bia-entering.png") });
    throw e;
  });
  await enter(page, await token(ANA));
  for (const p of [page, bia])
    await p.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__dark?.voices, null, {
      timeout: 90_000,
    });
  // (both in the studio's lobby on Ana's home floor, 7 m apart (the Daybreak's burst reaches 6), each firing away from the other — sent again till it holds: the
  // entry's own "to the arrival point" can land after it)
  const home = (await w(page, (y) => y.homeFloor())) as number;
  for (const [p, at] of [
    [page, { x: 8.5, y: 26.5 }],
    [bia, { x: 15.5, y: 26.5 }],
  ] as const)
    await expect
      .poll(
        () =>
          p.evaluate(
            ([a, l]) => {
              const y = (window as any).__yutopia;
              const me = y.walker.where();
              const there = y.level === l && Math.hypot(me.x - a.x, me.y - a.y) < 1;
              if (!there) y.teleport({ ...a, level: l });
              return there && !!(window as any).__dark?.voices;
            },
            [at, home] as const,
          ),
        { timeout: 60_000, intervals: [2000] },
      )
      .toBe(true);
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 13 });
    y.room.send("mod:vortex", { reset: true, forget: true });
  });
  // (everyone's sid on Ana's screen — the Player within Colyseus's 64 fields)
  const biaSid = (await bia.evaluate(() => (window as any).__yutopia.room.sessionId)) as string;
  expect(await w(page, (y) => [...y.room.state.players.values()].map((p: any) => p.sid))).toContain(biaSid);
  const uids = [(await mine(page)).uid as number, (await mine(bia)).uid as number];
  for (const p of [page, bia]) await listen(p);
  const report: string[] = [];

  // (YUTOPIA_GUNS=a,b: only those)
  const only = process.env.YUTOPIA_GUNS?.split(",");
  for (const gun of GUNS.filter((g) => !only || only.includes(g))) {
    for (const p of [page, bia]) await empty(p);
    await page.waitForTimeout(800);
    for (const uid of uids)
      for (const [item, n] of [
        [gun, 1],
        [WEAPONS[gun].ammo, 40],
      ] as const) {
        await page.evaluate(
          ([u, i, k]) => (window as any).__yutopia.room.send("mod:give", { item: i, n: k, userId: u }),
          [uid, item, n] as const,
        );
        await page.waitForTimeout(150);
      }
    for (const p of [page, bia]) await expect.poll(() => held(p, gun), { timeout: 10_000 }).toBeGreaterThanOrEqual(0);
    await page.waitForTimeout(1500);
    for (const p of [page, bia]) await clear(p);

    // both draw (Ana first: one drawn, one not — the moment the old roar began)
    const aSlot = await draw(page, gun);
    await page.waitForTimeout(1500);
    const bSlot = await draw(bia, gun);
    await page.waitForTimeout(1500);
    // both fire (a round spent: something to reload)
    // (again if the server didn't take it — a shot it turned down, the round still in: up to three)
    for (const p of [page, bia]) {
      for (let k = 0; k < 3 && ((await held(p, gun)) as number) >= WEAPONS[gun].mag; k++) {
        // (away from each other: Ana west, Bia east — the Daybreak's burst reaches 6 m)
        await fire(p, gun, p === page ? Math.PI : 0);
        await p.waitForTimeout(800);
      }
      const spent = (await held(p, gun)) as number;
      console.log(`${gun}: ${p === page ? "Ana" : "Bia"} has ${spent} of ${WEAPONS[gun].mag} after firing`);
      expect(spent, `${gun}: a round spent — heard ${JSON.stringify(await heard(p))}`).toBeLessThan(WEAPONS[gun].mag);
    }
    // both reload, one then the other (the other's gun out, idle)
    await reload(page, gun);
    await reload(bia, gun);
    // both put it away
    await page.keyboard.press(`Digit${aSlot + 2}`);
    await expect.poll(() => mine(page).then((m: any) => m.gun), { timeout: 10_000 }).toBe("");
    await page.waitForTimeout(1200);
    await bia.keyboard.press(`Digit${bSlot + 2}`);
    await expect.poll(() => mine(bia).then((m: any) => m.gun), { timeout: 10_000 }).toBe("");
    await page.waitForTimeout(1500);

    for (const [who, p] of [
      ["Ana", page],
      ["Bia", bia],
    ] as const) {
      const h = await heard(p);
      const n = new Map<string, number>();
      for (const [s] of h) n.set(s, (n.get(s) ?? 0) + 1);
      report.push(`${gun} · ${who} heard ${h.length}: ${[...n].map(([s, k]) => `${s}×${k}`).join(" ")}`);
      // the draws and the put-aways: hers and the other's, one each
      expect(n.get("draw") ?? 0, `${gun} · ${who}: draws`).toBe(2);
      expect(n.get("holster") ?? 0, `${gun} · ${who}: put-aways`).toBe(2);
      // a reload's own sound, hers and the other's: one each
      expect(n.get(RELOAD[gun]) ?? 0, `${gun} · ${who}: ${RELOAD[gun]}`).toBeGreaterThanOrEqual(2);
      // no handling sound over and over: a few at most, and never two of one a frame or two apart
      for (const [s, k] of n) if (!isShot(s)) expect(k, `${gun} · ${who}: ${s}`).toBeLessThanOrEqual(12);
      const last = new Map<string, number>();
      for (const [s, t] of h) {
        if (!isShot(s) && last.has(s))
          expect(t - (last.get(s) as number), `${gun} · ${who}: ${s} twice, close`).toBeGreaterThan(120);
        last.set(s, t);
      }
    }
  }
  console.log(report.join("\n"));
  for (const p of [page, bia]) await empty(p);
  await w(page, (y) => y.room.send("mod:vortex", { reset: true, forget: true }));
  await other.close();
});
