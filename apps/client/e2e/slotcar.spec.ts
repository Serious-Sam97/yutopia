/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld, walkTo } from "./helpers";

// The slot-car track: walk up and press X — the controls open; take a lane,
// start, five lights, GO; hold Space and the car goes round (too long into a
// corner and it flies off). Bia, across the room, sees the car running. Esc
// gives the lane back.
// In the Lab; the track is removed after. YUTOPIA_SHOTS=<dir> keeps pictures.
const SHOTS = process.env.YUTOPIA_SHOTS;
const race = (page: Page, id: string) =>
  page.evaluate((i) => {
    const r = (window as any).__yutopia.room.state.slots.get(i);
    if (!r) return null;
    const cars: Record<string, { s: number; offs: number; name: string }> = {};
    r.cars.forEach((c: any, lane: string) => {
      cars[lane] = { s: c.s, offs: c.offs, name: c.name };
    });
    return { phase: r.phase as string, lights: r.lights as number, cars };
  }, id);

test("a race on the slot-car track: lights, GO, fly off — seen from across the room", async ({ browser }) => {
  test.setTimeout(240_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const ctx = { viewport: { width: 1280, height: 800 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  const id = `e2e-slot-${Date.now().toString(36)}`;
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: an e2e helper, not a React hook
    const s = await useWorld("lab");
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    // a free spot for the 4 × 3 table near the arrival point (the server says no to a bad one)
    const sp = await ana.evaluate(() => (window as any).__yutopia.map.spawn);
    let at: { x: number; y: number } | null = null;
    for (const [dx, dy] of [
      [-2, -6],
      [1, -6],
      [-6, -5],
      [3, 2],
      [-6, 2],
      [-2, 3],
    ]) {
      const p = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
      await ana.evaluate(
        ([i, q]) => (window as any).__yutopia.send("obj:put", { id: i, kind: "slot_track", x: q.x, y: q.y, rot: 0 }),
        [id, p] as const,
      );
      await ana.waitForTimeout(600);
      if (await ana.evaluate((i) => !!(window as any).__yutopia.room.state.objects.get(i), id)) {
        at = p;
        break;
      }
    }
    expect(at, "room for the track").not.toBeNull();
    const T = at as { x: number; y: number };
    await expect.poll(() => bia.evaluate((i) => !!(window as any).__yutopia.model.getObject(i), id)).toBe(true);

    // Ana walks up to its front and presses X: the controls
    await walkTo(ana, T.x + 2, T.y + 3.6, 25_000);
    await ana.waitForTimeout(500);
    await expect.poll(() => ana.evaluate(() => (window as any).__hud.get().prompt?.kind)).toBe("slotcar");
    await ana.keyboard.press("x");
    await expect(ana.getByRole("dialog", { name: "Slot cars" })).toBeVisible();
    // the cars come in their own chunk
    await ana.waitForFunction(() => !!(window as any).__yutopia.slots, null, { timeout: 15_000 });

    await ana.getByRole("button", { name: "Take lane" }).first().click();
    await expect.poll(async () => (await race(bia, id))?.cars["0"]?.name).toBe("Ana Demo");
    await expect(ana.getByRole("button", { name: "Start race" })).toBeVisible();
    await ana.getByRole("button", { name: "3", exact: true }).click();
    await ana.getByRole("button", { name: "Start race" }).click();
    await expect.poll(async () => (await race(bia, id))?.phase).toBe("countdown");
    await expect.poll(async () => (await race(bia, id))?.lights ?? 0, { timeout: 4000 }).toBeGreaterThanOrEqual(3);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/slot-lights.png` });
    await expect.poll(async () => (await race(bia, id))?.phase, { timeout: 8000 }).toBe("race");
    // you're shown at the controls
    await expect
      .poll(() =>
        bia.evaluate(() => {
          const w = (window as any).__yutopia;
          let busy = "";
          w.room.state.players.forEach((p: any) => {
            if (p.name === "Ana Demo") busy = p.busy;
          });
          return busy;
        }),
      )
      .toBe("slotcar");

    // a gentle squeeze: the car moves off, and Bia sees it go
    await ana.keyboard.down("Space");
    await ana.waitForTimeout(450);
    await ana.keyboard.up("Space");
    await expect.poll(async () => (await race(bia, id))?.cars["0"]?.s ?? 0).toBeGreaterThan(0.3);
    await ana.waitForTimeout(400);
    if (SHOTS) {
      await ana.screenshot({ path: `${SHOTS}/slot-racing.png` });
      await bia.screenshot({ path: `${SHOTS}/slot-watching.png` });
    }
    // flat out into the corner: off it flies
    await ana.keyboard.down("Space");
    await expect.poll(async () => (await race(bia, id))?.cars["0"]?.offs ?? 0, { timeout: 8000 }).toBeGreaterThan(0);
    await ana.keyboard.up("Space");
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/slot-off.png` });
    await expect(ana.getByText(/1 offs/)).toBeVisible();

    // Esc: the lane goes back
    await ana.keyboard.press("Escape");
    await expect(ana.getByRole("dialog", { name: "Slot cars" })).toBeHidden();
    await expect.poll(async () => Object.keys((await race(bia, id))?.cars ?? {}).length).toBe(0);
  } finally {
    await ana.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id).catch(() => {});
    await ana.waitForTimeout(400);
  }
});
