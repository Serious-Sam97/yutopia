/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld, walkTo } from "./helpers";

// Pool balls out of a game (shared/pool-throw.ts): at a table nobody's playing, Ana takes a ball
// from its console and clicks Bia — the ball flies, Bia's knocked down and up again; then the cue
// taken down, in 3D, fires a ball at Bia: down again. And a break seen from the 3D game camera
// over the table (the pockets: balls going down them). In the Lab; the table is removed after.
// YUTOPIA_SHOTS=<dir> keeps pictures.
const SHOTS = process.env.YUTOPIA_SHOTS;
// (3D on the machine's GPU: a software one is too slow for two 3D views)
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const fellAt = (page: Page, name: string) =>
  page.evaluate((n) => {
    let at = 0;
    (window as any).__yutopia.room.state.players.forEach((p: any) => {
      if (p.name === n) at = p.fellAt;
    });
    return at;
  }, name);
const mine = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    const p = w.room.state.players.get(w.room.sessionId);
    return { held: p.held as string, gun: p.gun as string, x: p.x as number, y: p.y as number };
  });
// where someone's chest is on my screen, in 3D (the view's camera)
const chest3d = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const tp = (window as any).__yutopia.tp;
      const cam = tp.camera;
      cam.updateMatrixWorld();
      const v = [px, 1.1, py, 1];
      const mul = (m: number[], a: number[]) =>
        [0, 1, 2, 3].map((r) => m[r] * a[0] + m[4 + r] * a[1] + m[8 + r] * a[2] + m[12 + r] * a[3]);
      const c = mul(cam.projectionMatrix.elements, mul(cam.matrixWorldInverse.elements, v));
      return { x: ((c[0] / c[3] + 1) / 2) * innerWidth, y: ((1 - c[1] / c[3]) / 2) * innerHeight };
    },
    [x, y],
  );

test("pool balls: a ball off the table thrown knocks Bia down; the cue fires balls; a break into the pockets", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const ctx = { viewport: { width: 1280, height: 800 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  const id = `e2e-pool-${Date.now().toString(36)}`;
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: an e2e helper, not a React hook
    const s = await useWorld("lab");
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    await ana.evaluate(() => {
      const w = (window as any).__yutopia;
      w.room.state.objects.forEach((_o: any, k: string) => {
        if (k.startsWith("e2e-pool") || k.startsWith("e2e-pong")) w.send("obj:remove", { id: k });
      });
    });
    await ana.waitForTimeout(500);
    const sp = await ana.evaluate(() => (window as any).__yutopia.map.spawn);
    let at: { x: number; y: number } | null = null;
    for (const [dx, dy] of [
      [-2, -5],
      [1, -5],
      [-6, -4],
      [3, 2],
      [-6, 2],
      [-2, 3],
      [2, -8],
    ]) {
      const p = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
      await ana.evaluate(
        ([i, q]) => (window as any).__yutopia.send("obj:put", { id: i, kind: "pool_table", x: q.x, y: q.y, rot: 0 }),
        [id, p] as const,
      );
      await ana.waitForTimeout(600);
      if (await ana.evaluate((i) => !!(window as any).__yutopia.room.state.objects.get(i), id)) {
        at = p;
        break;
      }
    }
    expect(at, "room for the table").not.toBeNull();
    const T = at as { x: number; y: number };
    // nobody playing it: its balls racked on it
    await expect
      .poll(() =>
        ana.evaluate(
          (i) => JSON.parse((window as any).__yutopia.room.state.pool.get(i)?.game || "{}").balls?.length ?? 0,
          id,
        ),
      )
      .toBe(16);

    // Ana by its long side, Bia a few steps off in the open
    await walkTo(ana, T.x + 2, T.y + 2.6, 25_000);
    await walkTo(bia, T.x + 2, T.y + 6.5, 25_000);
    await ana.waitForTimeout(600);
    await ana.evaluate((i) => (window as any).__yutopia.activateObject(i, true), id);
    await expect(ana.getByRole("dialog", { name: "Pool" })).toBeVisible();
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/balls-console.png` });
    await ana.getByRole("button", { name: /Take a ball/ }).click();
    await expect.poll(async () => (await mine(ana)).held).toMatch(/^pball:\d+$/);
    await expect(ana.getByRole("dialog", { name: "Pool" })).toBeHidden();
    await ana.waitForTimeout(800);

    // iso: click Bia — the ball goes at her
    const b = await mine(bia);
    const aim = await ana.evaluate(([x, y]) => (window as any).__yutopia.engine.worldToClient(x, y, 45), [b.x, b.y]);
    await ana.mouse.click(aim.x, aim.y);
    await expect.poll(() => fellAt(ana, "Bia Demo"), { timeout: 5000 }).toBeGreaterThan(0);
    expect((await mine(ana)).held).toBe("");
    await ana.waitForTimeout(450);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/balls-iso-hit.png` });
    await ana.waitForTimeout(900);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/balls-iso-lying.png` });
    // up again
    await expect.poll(() => fellAt(ana, "Bia Demo"), { timeout: 6000 }).toBe(0);

    // the cue, in 3D: fired at Bia (across the table, in Ana's view) — down again, and seen falling
    await walkTo(bia, T.x + 2, T.y - 1.7, 25_000);
    await ana.keyboard.press("t");
    await ana.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 30_000 });
    await bia.keyboard.press("t");
    await bia.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 30_000 });
    await ana.waitForTimeout(4000);
    await ana.evaluate((i) => (window as any).__yutopia.activateObject(i, true), id);
    await expect(ana.getByRole("dialog", { name: "Pool" })).toBeVisible();
    await ana.getByRole("button", { name: /Take the cue/ }).click();
    await expect.poll(async () => (await mine(ana)).gun).toBe("cue");
    await ana.waitForTimeout(2500);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/balls-3d-cue.png` });
    const b2 = await mine(bia);
    const c = await chest3d(ana, b2.x, b2.y);
    await ana.mouse.click(c.x, c.y);
    await expect.poll(() => fellAt(ana, "Bia Demo"), { timeout: 5000 }).toBeGreaterThan(0);
    for (const [k, ms] of [
      ["a", 150],
      ["b", 500],
      ["c", 900],
    ] as const) {
      await ana.waitForTimeout(ms === 150 ? 150 : 350);
      if (SHOTS) {
        await ana.screenshot({ path: `${SHOTS}/balls-3d-fall-${k}.png` });
        await bia.screenshot({ path: `${SHOTS}/balls-3d-fallen-bia-${k}.png` });
      }
    }
    // put the cue back (B)
    await ana.keyboard.press("b");
    await expect.poll(async () => (await mine(ana)).gun).toBe("");
    await expect.poll(() => fellAt(ana, "Bia Demo"), { timeout: 6000 }).toBe(0);

    // a game: a break, watched from the 3D camera over the table
    await ana.evaluate((i) => (window as any).__yutopia.activateObject(i, true), id);
    await ana.getByRole("button", { name: "Take seat" }).first().click();
    await ana.getByRole("button", { name: "Easy" }).click();
    await ana.getByRole("button", { name: "Play Vortex" }).click();
    await ana.getByRole("button", { name: "Break!" }).click();
    await ana.waitForTimeout(3000);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/balls-3d-top.png` });
    await ana.evaluate(() => {
      const p = (window as any).__yutopia.tables.pool;
      p.setPower(1);
      p.shootNow();
    });
    for (let i = 0; i < 14; i++) {
      await ana.waitForTimeout(130);
      if (SHOTS) await ana.screenshot({ path: `${SHOTS}/balls-break-${String(i).padStart(2, "0")}.png` });
    }
    await ana.waitForTimeout(3000);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/balls-break-rest.png` });
    await ana.getByRole("button", { name: "Give up" }).click();
  } finally {
    await ana.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id).catch(() => {});
    await ana.waitForTimeout(400);
  }
});
