/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page, request } from "@playwright/test";
import { ANA, API, BIA, enter, test, token, useWorld } from "./helpers";

// The sway in the world (docs/plan/61-the-sway.md, phase 6): Ana wears a satchel and a ponytail
// and runs; on Bia's screen, near her, Ana's bag and hair swing on Jolt — their bones turning
// frame to frame, never NaN — and on Ana's own the same, while nothing's thrown. 3D in two
// browsers: run it with the GPU (YUTOPIA_GPU=1).

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const prefs = (page: Page) =>
  page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", reducedMotion: false }));
  });

// (someone's swung joints, as drawn on a page: the hub's, and the bag's and the hair's turns)
const swung = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const tp = (window as any).__yutopia.tp;
    const p = tp.people3.get(id);
    const skip = tp.sway?.skipOf(id);
    const b = p?.model.bones;
    return {
      hub: !!tp.sway,
      skip: skip ? [...skip].sort() : [],
      pack: b ? b.pack.quaternion.toArray() : [],
      hair: b ? b.hair.quaternion.toArray() : [],
    };
  }, sid);

test("a bag and a ponytail swing on Jolt, on her screen and on someone's near", async ({ page, browser }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(240_000);
  const lab = await useWorld("lab");
  const ta = await token(ANA);
  const api = await request.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${ta}`, Accept: "application/json" },
  });
  const before = (await (await api.get(`${API}/api/avatar`)).json()).avatar;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await api.put(`${API}/api/avatar`, { data: { ...before, extra: "satchel", hair: "ponytail", top: "tee" } });
    await prefs(page);
    await enter(page, ta, lab);
    const ana = await page.evaluate(() => (window as any).__yutopia.room.sessionId as string);
    const bia = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    bia.on("pageerror", (e) => errors.push(e.message));
    await prefs(bia);
    await enter(bia, await token(BIA), lab);
    const anaUid = await page.evaluate(() => (window as any).__yutopia.myUid() as number);
    await bia.evaluate((uid) => (window as any).__yutopia.teleport({ userId: uid }), anaUid);
    for (const p of [page, bia])
      await p.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
        timeout: 60_000,
      });
    // both see her bag and hair swung on Jolt (the hub up, her pack and hair joints left to it)
    for (const p of [page, bia])
      await expect.poll(async () => (await swung(p, ana)).skip, { timeout: 60_000 }).toEqual(["hair", "pack"]);
    // she runs: on each screen, her bag's and hair's turns change as she goes, and none is NaN
    const watch = (p: Page) =>
      p.evaluate((id) => {
        const w = window as any;
        const log: number[][] = [];
        w.__sway = log;
        const t0 = performance.now();
        const f = () => {
          const b = w.__yutopia.tp.people3.get(id)?.model.bones;
          if (b) log.push([...b.pack.quaternion.toArray(), ...b.hair.quaternion.toArray()]);
          if (performance.now() - t0 < 4000) requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }, ana);
    await watch(page);
    await watch(bia);
    await page.keyboard.down("w");
    await page.waitForTimeout(1500);
    await page.keyboard.up("w");
    await page.keyboard.press("Space");
    await page.waitForTimeout(2600);
    for (const p of [page, bia]) {
      const log = (await p.evaluate(() => (window as any).__sway)) as number[][];
      expect(log.length).toBeGreaterThan(30);
      for (const r of log) for (const x of r) expect(Number.isFinite(x)).toBe(true);
      // (the bag's turn wandered off its hang and back, as did the hair's)
      const spread = (k: number) =>
        Math.max(...log.map((r) => Math.abs(r[k]))) - Math.min(...log.map((r) => Math.abs(r[k])));
      expect(Math.max(spread(0), spread(1), spread(2))).toBeGreaterThan(0.02);
      expect(Math.max(spread(4), spread(5), spread(6))).toBeGreaterThan(0.02);
    }
    expect(errors).toEqual([]);
  } finally {
    await api.put(`${API}/api/avatar`, { data: before });
  }
});
