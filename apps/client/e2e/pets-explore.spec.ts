/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { BIA, enter, spaceId, test, token, walkTo } from "./helpers";

// A pet off exploring (docs/plan/13-pets.md, "Explore"), in the Lab: "Go
// explore" from its ring sends it round the place on its own; "Call my pets
// back" on my own ring brings it the whole way back, walking; and following
// me a long way it runs after me — never a jump to my side. YUTOPIA_SHOTS=<dir>
// saves iso and 3D shots. The dog is let go at the end.

const SHOTS = process.env.YUTOPIA_SHOTS;
const pet = (page: Page, id: string) =>
  page.evaluate((i) => {
    const p = (window as any).__yutopia.room.state.pets.get(i);
    return p ? { x: p.x as number, y: p.y as number, mode: p.mode as string, act: p.act as string } : null;
  }, id);
const me = (page: Page) => page.evaluate(() => (window as any).__yutopia.meTile() as { x: number; y: number });
const send = (page: Page, type: string, msg: unknown) =>
  page.evaluate(([t, m]) => (window as any).__yutopia.send(t, m), [type, msg] as const);
const mine = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    return [...w.room.state.pets.values()].filter((p: any) => p.sid === w.room.sessionId).map((p: any) => p.id);
  }) as Promise<string[]>;
// its top speed (tiles a second) between two looks while `until` holds off: a
// jump shows as far more than any run (the headless page stalls for whole
// frames, so it's the distance over the time between looks, not one step)
async function watchSteps(page: Page, id: string, until: () => Promise<boolean>, ms: number) {
  await page.evaluate((i) => {
    const w = window as any;
    let prev: { x: number; y: number; t: number } | null = null;
    w.__step = 0;
    w.__stepTimer = setInterval(() => {
      const p = w.__yutopia.room.state.pets.get(i);
      const t = performance.now();
      if (prev) {
        const d = Math.hypot(p.x - prev.x, p.y - prev.y);
        if (d > 0.01) w.__step = Math.max(w.__step, d / Math.max(0.1, (t - prev.t) / 1000));
      }
      prev = { x: p.x, y: p.y, t };
    }, 20);
  }, id);
  try {
    await expect.poll(until, { timeout: ms, intervals: [250] }).toBe(true);
  } finally {
    await page.evaluate(() => clearInterval((window as any).__stepTimer));
  }
  return (await page.evaluate(() => (window as any).__step)) as number;
}
// pick an action from the open ring (a bored pet may ignore the first call: a second always works)
async function command(page: Page, target: unknown, label: RegExp, done: () => Promise<boolean>) {
  for (let i = 0; i < 2 && !(await done()); i++) {
    await page.evaluate((t) => (window as any).__yutopia.openMenu(t, { x: 640, y: 400 }), target);
    await page.getByRole("menuitem", { name: label }).click();
    await page.waitForTimeout(600);
  }
  expect(await done()).toBe(true);
}

test("explore: the dog tours the place, comes back when called, and runs after me all the way", async ({ page }) => {
  test.setTimeout(150_000);
  const tok = await token(BIA);
  await enter(page, tok, await spaceId(tok, "Yutopia Lab"));
  for (const id of await mine(page)) await send(page, "pet:release", { id });
  await send(page, "pet:adopt", { species: "dog", name: "Rex" });
  await expect.poll(async () => (await mine(page)).length).toBe(1);
  const [id] = await mine(page);
  const shot = (name: string) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);
  try {
    // Go explore: off it goes, well away from me (I stand still)
    await command(page, { type: "pet", id }, /go explore/i, async () => (await pet(page, id))?.mode === "explore");
    const far = async () => {
      const [p, m] = [await pet(page, id), await me(page)];
      return !!p && Math.hypot(p.x - m.x, p.y - m.y) > 9;
    };
    const exploring = await watchSteps(page, id, far, 40_000);
    expect(exploring).toBeLessThan(12);
    await page.waitForTimeout(4000); // (a sniff about over there)
    const zoom = (z: number) => page.evaluate((v) => (window as any).__yutopia.engine.setZoom(v), z);
    await zoom(0.55);
    await page.waitForTimeout(600);
    await shot("explore-iso");
    await zoom(1);
    // my pets on the minimap: the dot is there
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().myPetsAt.length)).toBe(1);
    // the rings: its own (Follow me, not Go explore), and mine (Call my pets back)
    const ring = async (target: unknown) => {
      await page.evaluate((t) => (window as any).__yutopia.openMenu(t, { x: 640, y: 400 }), target);
      await page.waitForTimeout(500);
    };
    await ring({ type: "pet", id });
    await expect(page.getByRole("menuitem", { name: /follow me/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /go explore/i })).toHaveCount(0);
    await shot("ring-pet");
    await page.keyboard.press("Escape");
    await ring({ type: "self" });
    await shot("ring-self");
    await page.keyboard.press("Escape");
    // Call my pets back (my own ring), once it's well off again: the whole way back, walking
    const near = async () => {
      const [p, m] = [await pet(page, id), await me(page)];
      return !!p && Math.hypot(p.x - m.x, p.y - m.y) < 3.5;
    };
    await expect.poll(far, { timeout: 40_000 }).toBe(true);
    await command(page, { type: "self" }, /call my pets back/i, async () => (await pet(page, id))?.mode === "follow");
    const back = await watchSteps(page, id, near, 30_000);
    expect(back).toBeLessThan(12);
    // following: I walk a long way off, it runs after me — never a jump
    const from = await me(page);
    const to = { x: from.x > 16 ? 3.5 : 28.5, y: from.y };
    await walkTo(page, to.x, to.y, 20_000);
    const caught = await watchSteps(page, id, near, 20_000);
    expect(caught).toBeLessThan(12);
    await shot("followed-iso");
    // the 3D view: at my heels there too
    await page.keyboard.press("t");
    await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
    await page.waitForTimeout(2500);
    await shot("followed-3d");
  } finally {
    await send(page, "pet:release", { id });
  }
});
