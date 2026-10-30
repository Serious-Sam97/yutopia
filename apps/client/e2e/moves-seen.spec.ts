/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// The new moves seen by someone else (docs/plan/56-the-controls.md, phase 8): Ana's double jump,
// air dash and roll, and a lamp post swung round and let go of (its spin) — Bia, in her own
// browser, draws each of them on Ana (what Ana's 3D body there was last given: person3d `drawn`).
// Two 3D views: the GPU (YUTOPIA_GPU=1).

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });
const LOT = { x: 37.8, y: 30 };
const LAMP = { x: -19.44, z: -102.99 };

async function inWorld(page: Page, who: typeof ANA) {
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, await token(who));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  await page.evaluate(() => {
    const r = (window as any).__yutopia.room;
    for (const k of ["fly", "clip", "fast", "hidden"]) r.send("mod:power", { power: k, on: false });
  });
}
const goTo = (page: Page, at: { x: number; y: number }, yaw: number) =>
  page.evaluate(
    ([p, yaw]) => {
      const w = (window as any).__yutopia;
      w.teleport({ ...(p as object), level: 0 });
      setTimeout(() => {
        w.walker.body.yaw = yaw;
        w.tp.yaw = yaw;
      }, 2500);
    },
    [at, yaw] as const,
  );

test("Ana's new moves, drawn on her in Bia's browser: a double jump, an air dash, a roll, a swing and its spin", async ({
  page,
  browser,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(300_000);
  await inWorld(page, ANA);
  const ana = await page.evaluate(() => (window as any).__yutopia.room.sessionId as string);
  const bia = await (await browser.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  await inWorld(bia, BIA);
  // Ana on the lot facing east; Bia 6 m south of her, looking at her
  await goTo(page, LOT, 0);
  await goTo(bia, { x: LOT.x, y: LOT.y + 6 }, -Math.PI / 2);
  await page.waitForTimeout(3500);
  await expect
    .poll(() => bia.evaluate((sid) => !!(window as any).__yutopia.tp.people3.get(sid), ana), { timeout: 30_000 })
    .toBe(true);
  // Bia's record of what Ana's body there is drawn doing, every frame
  await bia.evaluate((sid) => {
    const w = window as any;
    w.__seen = { verb: new Set(), jump: new Set(), flow: new Set() };
    const f = () => {
      const p = w.__yutopia.tp.people3.get(sid);
      if (p?.drawn) for (const k of ["verb", "jump", "flow"]) if (p.drawn[k]) w.__seen[k].add(p.drawn[k]);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }, ana);
  const seen = () =>
    bia.evaluate(() => {
      const s = (window as any).__seen;
      return { verb: [...s.verb], jump: [...s.jump], flow: [...s.flow] } as Record<string, string[]>;
    });

  // a jump and a jump in the air (a flip)
  await page.keyboard.press("Space");
  await page.waitForTimeout(280);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await seen()).jump, { timeout: 5000 }).toContain("flip");
  await page.waitForTimeout(1200);
  // a jump and an air dash
  await page.keyboard.press("Space");
  await page.waitForTimeout(220);
  await page.keyboard.press("q");
  await expect.poll(async () => (await seen()).verb, { timeout: 5000 }).toContain("adash");
  await page.waitForTimeout(1200);
  // a roll
  await page.keyboard.press("q");
  await expect.poll(async () => (await seen()).verb, { timeout: 5000 }).toContain("roll");

  // the driveway's lamp: Ana runs fast at it from the west, round it, lets go; Bia watches from the
  // north of it
  await goTo(page, G(LAMP.x - 3.2, LAMP.z + 0.25), 0);
  await goTo(bia, G(LAMP.x, LAMP.z - 7), Math.PI / 2);
  await page.waitForTimeout(4500);
  await expect
    .poll(() => bia.evaluate((sid) => !!(window as any).__yutopia.tp.people3.get(sid), ana), { timeout: 30_000 })
    .toBe(true);
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  await expect
    .poll(() => page.evaluate(() => (window as any).__yutopia.walker.body.flow?.kind ?? ""), { timeout: 4000 })
    .toBe("swing");
  await page.waitForTimeout(700);
  await page.keyboard.up("Shift");
  await page.keyboard.up("w");
  await expect.poll(async () => (await seen()).flow, { timeout: 5000 }).toContain("swing");
  await expect.poll(async () => (await seen()).flow, { timeout: 5000 }).toContain("spin");
  await bia.context().close();
});
