/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token } from "./helpers";

// The lift (docs/plan/52-the-pet-two.md, item 8), in the game: Ana's dog follows her into car A on her
// floor and rides down to the lobby in the car with her (drawn there, at its height), and walks out
// with her. It used to stay in the corridor, hop floor to floor beside the shaft and end up behind the
// lift on the ground floor. The dog adopted here is let go at the end.
// On the machine's GPU: YUTOPIA_GPU=1.
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const now = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    const me = w.room.state.players.get(w.room.sessionId);
    const p = [...w.room.state.pets.values()].find((x: any) => x.sid === w.room.sessionId) as any;
    const m = p && w.tp?.pets3?.get(`pet:${p.id}`);
    return {
      me: { x: me.x as number, y: me.y as number, level: me.level as number, z: me.z as number },
      pet: p
        ? { x: p.x as number, y: p.y as number, floor: p.floor as number, ride: p.ride as string, z: p.z as number }
        : null,
      drawn: m ? { y: m.model.root.position.y as number, visible: !!m.model.root.visible } : null,
    };
  });
const release = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    c.room.state.pets.forEach((p: any) => p.sid === c.room.sessionId && c.send("pet:release", { id: p.id }));
  });

test("a dog follows Ana into the lift, rides down in it with her, and walks out into the lobby", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  try {
    await release(page);
    await page.evaluate(() => (window as any).__yutopia.send("pet:adopt", { species: "dog", name: "Rex" }));
    await expect.poll(async () => (await now(page)).pet?.floor).toBe(4);
    const stop = (level: number) =>
      page.evaluate((l) => {
        const w = (window as any).__yutopia;
        let out: any = null;
        w.room.state.objects.forEach((o: any) => {
          const p = JSON.parse(o.props || "{}");
          if (o.kind === "elevator" && p.shaft === "A" && p.level === l) out = { id: o.id, door: p.door, ph: p.ph };
        });
        return out as { id: string; door: string; ph: string };
      }, level);
    // to car A with him, in
    await page.evaluate(() => (window as any).__yutopia.teleport({ x: 9, y: 27.5, level: 4 }));
    await page.waitForTimeout(3000);
    const top = await stop(4);
    await page.evaluate((id) => (window as any).__yutopia.room.send("lift:call", { id }), top.id);
    await expect.poll(async () => (await stop(4)).door, { timeout: 15_000 }).toBe("open");
    await page.evaluate(() => (window as any).__yutopia.walkTo({ x: 9, y: 30.2 }));
    await page.waitForTimeout(2500);
    // down: in the car with her the whole way, drawn at its height
    await page.evaluate((id) => (window as any).__yutopia.room.send("lift:go", { id, level: 0 }), top.id);
    await expect.poll(async () => (await now(page)).pet?.ride, { timeout: 8000 }).toBe("lift");
    for (let t = Date.now(); Date.now() - t < 15_000; ) {
      const s = await now(page);
      if (s.pet?.ride === "lift") {
        expect(s.pet.floor, "on her floor").toBe(s.me.level);
        expect(Math.hypot(s.pet.x - s.me.x, s.pet.y - s.me.y), "beside her in the car").toBeLessThan(1);
        if (s.drawn) expect(Math.abs(s.drawn.y - s.pet.z), "drawn at the car's height").toBeLessThan(0.3);
      }
      if (s.me.level === 0 && (await stop(0)).door === "open") break;
      await page.waitForTimeout(80);
    }
    await expect.poll(async () => (await now(page)).pet?.ride, { timeout: 8000 }).toBe("");
    expect((await now(page)).pet?.floor).toBe(0);
    // out into the lobby: he comes too
    const s0 = await now(page);
    await page.evaluate((p) => (window as any).__yutopia.walkTo(p), { x: s0.me.x, y: s0.me.y - 5 });
    await expect
      .poll(
        async () => {
          const s = await now(page);
          return s.me.y < s0.me.y - 3 && !!s.pet && Math.hypot(s.pet.x - s.me.x, s.pet.y - s.me.y) < 3.5;
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  } finally {
    await release(page);
  }
});
