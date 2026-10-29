/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// Lost and found (docs/plan/51-the-pet.md, phase 3), in the game: Ana leaves Rex staying in the lot,
// goes off and gets into a car far away, and calls him — too far behind her car, he's lost. Out of the
// car: the panel says where he was last seen, the GPS draws the circle to search; she goes there, and
// near him he's found. The dog adopted here is let go at the end.
// On the machine's GPU (as car.spec): YUTOPIA_GPU=1; YUTOPIA_SHOTS=<dir> saves its pictures.
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const rex = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    const p = [...c.room.state.pets.values()].find((x: any) => x.sid === c.room.sessionId);
    return p ? { id: p.id, mode: p.mode, x: p.x, y: p.y, floor: p.floor, seen: p.seen } : null;
  });
const me = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    const p = c.room.state.players.get(c.room.sessionId);
    return { x: p.x as number, y: p.y as number, busy: p.busy as string };
  });
const send = (page: Page, type: string, msg: unknown) =>
  page.evaluate(([t, m]) => (window as any).__yutopia.send(t, m), [type, msg] as const);
// a command, said twice (a pet may not mind the first time; a second call within a few seconds it always does)
const call = async (page: Page, id: string, cmd: string) => {
  await send(page, "pet:cmd", { id, cmd });
  await page.waitForTimeout(400);
  await send(page, "pet:cmd", { id, cmd });
};
const release = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    c.room.state.pets.forEach((p: any) => {
      if (p.sid === c.room.sessionId) c.send("pet:release", { id: p.id });
    });
  });
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};

test("Rex left in the lot, Ana drives off far away: lost; the panel and the GPS say where; found", async ({ page }) => {
  test.setTimeout(300_000);
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.cars, null, { timeout: 60_000 });
  try {
    await release(page);
    await send(page, "pet:adopt", { species: "dog", name: "Rex", look: { breed: "beagle" } });
    await expect.poll(async () => (await rex(page))?.mode).toBe("follow");
    const id = (await rex(page))?.id as string;
    // down in the lot with her, told to stay there
    const lot = await page.evaluate(() => {
      const c = (window as any).__yutopia;
      const o = [...c.room.state.objects.values()].find((x: any) => x.kind === "car");
      return { x: o.x - 2, y: o.y + 1 };
    });
    await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), lot);
    await expect.poll(async () => (await rex(page))?.floor, { timeout: 15_000 }).toBe(0);
    await page.waitForTimeout(3000);
    await call(page, id, "stay");
    await expect.poll(async () => (await rex(page))?.mode).toBe("stay");
    // a car far off from him (not her own, not on show), and in it
    const r0 = (await rex(page)) as { x: number; y: number };
    const car = await page.evaluate((at) => {
      const c = (window as any).__yutopia;
      const out: any[] = [];
      c.room.state.objects.forEach((o: any) => {
        const p = JSON.parse(o.props);
        if (o.kind !== "car" || p.driven || p.ownerId || p.role === "show" || p.retire || p.model === "offroad") return;
        const w = o.rot % 2 ? 2 : 5;
        const h = o.rot % 2 ? 5 : 2;
        const a = Math.PI + (o.rot % 4) * (Math.PI / 2);
        const x = o.x + w / 2 + (p.dx ?? 0);
        const y = o.y + h / 2 + (p.dz ?? 0);
        const d = Math.hypot(x - at.x, y - at.y);
        if (d > 250) out.push({ id: o.id, x, y, a, d });
      });
      // (as far as there is: he runs fast — further than he can close in the time it takes to be lost)
      out.sort((p, q) => q.d - p.d);
      return out[0];
    }, r0);
    expect(car, "a car far from the lot").toBeTruthy();
    // (beside it: set down at the nearest open spot to its middle)
    await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), { x: car.x, y: car.y });
    // (in by its door's prompt: the nearest car's, whichever it is)
    await page.waitForFunction(() => /^car/.test((window as any).__hud.get().prompt?.kind ?? ""), null, {
      timeout: 20_000,
    });
    await page.evaluate(() => (window as any).__yutopia.interact());
    await expect.poll(async () => (await me(page)).busy, { timeout: 10_000 }).toMatch(/^drive:car:/);
    // called, from the car, too far off: he runs after her — and he's lost
    await call(page, id, "follow");
    await expect.poll(async () => (await rex(page))?.mode, { timeout: 40_000 }).toBe("lost");
    await shot(page, "game-lost-toast");
    // out of the car: the panel says where he was last seen
    await send(page, "car:leave", {});
    await expect.poll(async () => (await me(page)).busy, { timeout: 10_000 }).toBe("");
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: "pets" } }));
    await expect(page.getByText(/^lost · last seen/i).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);
    await shot(page, "game-lost-panel");
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
    // the GPS: his circle in "Mine"
    await page.evaluate(() => (window as any).__yutopia.togglePhone(true));
    await page.waitForTimeout(2200);
    await page.evaluate(() => (window as any).__yutopia.phone.open("maps"));
    await expect(page.locator("[data-gps]")).toBeVisible();
    await page.locator("[data-gps-search]").click();
    await expect(page.getByText(/Rex \(lost/).first()).toBeVisible({ timeout: 10_000 });
    if (dir) await page.locator("[data-gps]").screenshot({ path: `${dir}/game-lost-gps-list.png` });
    await page
      .getByText(/Rex \(lost/)
      .first()
      .click();
    await expect(page.locator("[data-gps-card]")).toBeVisible();
    await page.waitForTimeout(2500);
    if (dir) await page.locator("[data-gps]").screenshot({ path: `${dir}/game-lost-gps-map.png` });
    await page.evaluate(() => (window as any).__yutopia.togglePhone(false));
    // she goes there, and near him: found
    // (he's on the move: to where he is now, again, till she's near enough)
    await expect
      .poll(
        async () => {
          const r1 = (await rex(page)) as { x: number; y: number; mode: string };
          if (r1.mode === "lost")
            await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), {
              x: r1.x + 2,
              y: r1.y,
            });
          return r1.mode;
        },
        { timeout: 30_000, intervals: [2500] },
      )
      .toBe("follow");
    await expect(page.getByText(/You found Rex/)).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1500);
    await shot(page, "game-found");
  } finally {
    await release(page);
  }
});
