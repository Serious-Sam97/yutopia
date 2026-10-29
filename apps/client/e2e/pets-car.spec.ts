/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// Pets in the car (docs/plan/51-the-pet.md, phase 2), in the game: Ana gets into a lot car with her dog
// and her cat at her heels; they run to the doors and hop in ("Waiting for…" on the car's HUD), ride in
// their seats as she drives, and get out with her. The pets adopted here are let go at the end.
// On the machine's GPU (as car.spec): YUTOPIA_GPU=1; YUTOPIA_SHOTS=<dir> saves its pictures.
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const pets = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    return [...c.room.state.pets.values()]
      .filter((p: any) => p.sid === c.room.sessionId)
      .map((p: any) => ({ id: p.id, name: p.name, ride: p.ride, seat: p.seat, act: p.act, mode: p.mode }));
  });
const busy = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    return c.room.state.players.get(c.room.sessionId).busy as string;
  });
const send = (page: Page, type: string, msg: unknown) =>
  page.evaluate(([t, m]) => (window as any).__yutopia.send(t, m), [type, msg] as const);
const release = async (page: Page) => {
  for (const p of await pets(page)) await send(page, "pet:release", { id: p.id });
};

test("a dog and a cat get in with Ana, ride as she drives, and get out with her", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.cars, null, { timeout: 60_000 });
  try {
    await release(page); // (a run that died halfway)
    await send(page, "pet:adopt", { species: "dog", name: "Rex", look: { breed: "beagle" } });
    await send(page, "pet:adopt", { species: "cat", name: "Mia", look: { breed: "tabby" } });
    await expect.poll(async () => (await pets(page)).length).toBe(2);
    // a lot car in its bay (not the 4x4: two doors), and the aisle by its nose
    const car = await page.evaluate(() => {
      const c = (window as any).__yutopia;
      const out: any[] = [];
      c.room.state.objects.forEach((o: any) => {
        const p = JSON.parse(o.props);
        if (o.kind !== "car" || p.driven || p.model === "offroad" || p.ownerId) return;
        const w = o.rot % 2 ? 2 : 5;
        const h = o.rot % 2 ? 5 : 2;
        const a = Math.PI + (o.rot % 4) * (Math.PI / 2);
        out.push({ id: o.id, x: o.x + w / 2 + (p.dx ?? 0), y: o.y + h / 2 + (p.dz ?? 0), a });
      });
      return out[0];
    });
    expect(car, "a car in its bay").toBeTruthy();
    const aisle = { x: car.x + Math.cos(car.a) * 3.4, y: car.y + Math.sin(car.a) * 3.4 };
    await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), aisle);
    // (the pets come down with her and catch up)
    await page.waitForTimeout(4000);
    // the door's prompt (a car's comes before anything else, pets at her feet too)
    await page.waitForFunction(() => /^car/.test((window as any).__hud.get().prompt?.kind ?? ""), null, {
      timeout: 20_000,
    });
    await page.evaluate(() => (window as any).__yutopia.interact());
    await expect.poll(() => busy(page), { timeout: 10_000 }).toMatch(/^drive:car:/);
    const vid = `car:${car.id}`;
    // on their way to the doors: the car's HUD says so
    await page
      .waitForFunction(() => /Waiting for/.test(document.body.innerText), null, { timeout: 8000 })
      .then(async () => {
        if (dir) await page.screenshot({ path: `${dir}/game-board.png` });
      })
      .catch(() => {}); // (they may already be in)
    await expect.poll(async () => (await pets(page)).every((p) => p.ride === vid), { timeout: 20_000 }).toBe(true);
    const seats = (await pets(page)).map((p) => p.seat);
    expect(seats.every((s) => s >= 1) && seats[0] !== seats[1], `seats ${seats}`).toBe(true);
    await page.waitForTimeout(1500);
    if (dir) await page.screenshot({ path: `${dir}/game-in.png` });
    // driven a little, then stopped
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2500);
    await page.keyboard.up("KeyW");
    if (dir) await page.screenshot({ path: `${dir}/game-driving.png` });
    expect(
      (await pets(page)).every((p) => p.ride === vid),
      "still in as it goes",
    ).toBe(true);
    await page.keyboard.down("Space");
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const v = (window as any).__yutopia.room.state.vehicles.get(id);
            return Math.hypot(v.vx, v.vz);
          }, vid),
        { timeout: 10_000 },
      )
      .toBeLessThan(0.5);
    await page.keyboard.up("Space");
    await page.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "car:leave", null, {
      timeout: 10_000,
    });
    await page.evaluate(() => (window as any).__yutopia.interact());
    await expect.poll(() => busy(page), { timeout: 10_000 }).toBe("");
    // out with her, following
    await expect
      .poll(async () => (await pets(page)).every((p) => p.ride === "" && p.mode === "follow"), { timeout: 10_000 })
      .toBe(true);
    await page.waitForTimeout(1500);
    if (dir) await page.screenshot({ path: `${dir}/game-out.png` });
  } finally {
    await release(page);
  }
});
