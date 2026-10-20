/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld, walkTo } from "./helpers";

// The pool table: walk up and press X — the camera leans in, the console opens;
// take a seat, put Vortex in the other, break (aim at the rack with the mouse,
// hold Space to build the power, let go). Bia, across the room, sees the shot roll; Vortex
// plays his turn by himself; the 3D view takes a game camera; leaving the
// table mid-game gives it to Vortex. In the Lab; the table is removed after.
// YUTOPIA_SHOTS=<dir> keeps pictures.
const SHOTS = process.env.YUTOPIA_SHOTS;
const pool = (page: Page, id: string) =>
  page.evaluate((i) => {
    const t = (window as any).__yutopia.room.state.pool.get(i);
    if (!t) return null;
    const seats: Record<string, string> = {};
    t.seats.forEach((s: any, k: string) => {
      seats[k] = s.vortex ? `vortex:${s.vortex}` : s.name;
    });
    const g = t.game ? JSON.parse(t.game) : null;
    return {
      phase: t.phase as string,
      shotNo: t.shotNo as number,
      seats,
      turn: g?.turn as number,
      broken: !!g?.broken,
    };
  }, id);

test("pool: lean in, play Vortex, break with the mouse — seen from across the room, Vortex shoots back", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const ctx = { viewport: { width: 1280, height: 800 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  const id = `e2e-pool-${Date.now().toString(36)}`;
  try {
    const s = await useWorld("lab");
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    // tables an earlier, interrupted run left behind
    await ana.evaluate(() => {
      const w = (window as any).__yutopia;
      w.room.state.objects.forEach((o: any, k: string) => {
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
    await expect.poll(() => bia.evaluate((i) => !!(window as any).__yutopia.engine.getObject(i), id)).toBe(true);

    // up to its long side, X: the console, the camera leans in
    const zoom0 = await ana.evaluate(() => (window as any).__yutopia.engine.getZoom());
    await walkTo(ana, T.x + 2, T.y + 2.6, 25_000);
    await ana.waitForTimeout(500);
    // X when the table is what's in reach; another thing nearer (the Lab's consoles): click it
    const prompt = await ana.evaluate(() => (window as any).__hud.get().prompt?.kind);
    expect(prompt, "a table in reach").toBeTruthy();
    // (this table, as a click on it does — X takes whichever's nearest)
    await ana.evaluate((i) => (window as any).__yutopia.activateObject(i, true), id);
    await expect(ana.getByRole("dialog", { name: "Pool" })).toBeVisible();
    await ana.waitForFunction(() => !!(window as any).__yutopia.tables, null, { timeout: 15_000 });
    await expect.poll(() => ana.evaluate(() => (window as any).__yutopia.engine.getZoom())).toBeGreaterThan(zoom0);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pool-lobby.png` });

    await ana.getByRole("button", { name: "Take seat" }).first().click();
    await expect.poll(async () => (await pool(bia, id))?.seats["0"]).toBe("Ana Demo");
    await ana.getByRole("button", { name: "Easy" }).click();
    await ana.getByRole("button", { name: "Play Vortex" }).click();
    await expect.poll(async () => (await pool(bia, id))?.seats["1"]).toBe("vortex:easy");
    await ana.getByRole("button", { name: "Break!" }).click();
    await expect.poll(async () => (await pool(bia, id))?.phase).toBe("play");
    expect((await pool(bia, id))?.turn, "the first game: Ana breaks").toBe(0);
    await ana.waitForTimeout(1200); // the camera settles

    // aim at the head ball with the pointer, press, pull back, let go
    const aimAt = await ana.evaluate((i) => {
      const w = (window as any).__yutopia;
      const o = w.engine.getObject(i);
      // the head ball: on the foot spot (table metres +0.495, 0) — tiles: x 2 + 0.495·1.55, y 1
      const head = w.engine.worldToClient(o.x + 2 + 0.495 * 1.55, o.y + 1, 26.7);
      const cue = w.engine.worldToClient(o.x + 2 - 0.495 * 1.55, o.y + 1, 26.7);
      return { head, cue };
    }, id);
    await ana.mouse.move(aimAt.head.x, aimAt.head.y, { steps: 6 });
    await ana.waitForTimeout(300);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pool-aim.png` });
    // the power: hold Space — it builds little by little — and let go
    await ana.keyboard.down(" ");
    await ana.waitForTimeout(700);
    const mid = await ana.evaluate(
      () => (window as any).__yutopia.tables.pool.info((window as any).__hud.get().panel.objectId)?.power,
    );
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pool-pull.png` });
    await ana.waitForTimeout(700);
    await ana.keyboard.up(" ");
    expect(mid, "the power grows while Space is held").toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(0.9);
    await expect.poll(async () => (await pool(bia, id))?.shotNo).toBe(1);
    expect((await pool(bia, id))?.broken).toBe(true);
    await ana.waitForTimeout(350);
    if (SHOTS) {
      await ana.screenshot({ path: `${SHOTS}/pool-break.png` });
      await bia.screenshot({ path: `${SHOTS}/pool-watching.png` });
    }
    // shown at the table with a cue
    await expect
      .poll(() =>
        bia.evaluate(() => {
          let busy = "";
          (window as any).__yutopia.room.state.players.forEach((p: any) => {
            if (p.name === "Ana Demo") busy = p.busy;
          });
          return busy;
        }),
      )
      .toBe("pool");

    // Vortex's turn comes (a foul or a miss): he plays it himself
    await ana.waitForTimeout(6000);
    if ((await pool(bia, id))?.turn === 1) {
      if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pool-vortex-thinks.png` });
      await expect.poll(async () => (await pool(bia, id))?.shotNo ?? 0, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
      await ana.waitForTimeout(500);
      if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pool-vortex-shot.png` });
    }
    await ana.waitForTimeout(4000);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pool-rest.png` });

    // the 3D view: a game camera over the table
    await ana.keyboard.press("t");
    await ana.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 30_000 });
    await ana.waitForTimeout(4000);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pool-3d-top.png` });
    await ana.keyboard.press("y");
    await ana.waitForTimeout(2500);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pool-3d-cue.png` });
    await ana.keyboard.press("y");
    await ana.keyboard.press("t");
    await ana.waitForTimeout(1000);

    // leaving mid-game: Vortex wins
    await ana.getByRole("button", { name: "Give up" }).click();
    await expect.poll(async () => (await pool(bia, id))?.phase).toBe("done");
    await ana.keyboard.press("Escape");
    await expect(ana.getByRole("dialog", { name: "Pool" })).toBeHidden();
  } finally {
    await ana.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id).catch(() => {});
    await ana.waitForTimeout(400);
  }
});
