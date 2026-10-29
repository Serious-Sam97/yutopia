/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, holdCamera, test, token } from "./helpers";

// Waiting in the office (docs/plan/51-the-pet.md, phase 4), in the game: Ana (the War Room hers for the
// run — the dev world has no office) leaves Rex in her office from the pet panel, goes down to the lot,
// drives off and logs off; back, he's in her office, at home. The room is given back, the dog let go.
// On the machine's GPU (as car.spec): YUTOPIA_GPU=1; YUTOPIA_SHOTS=<dir> saves its pictures.
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const rex = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    const p = [...c.room.state.pets.values()].find((x: any) => x.sid === c.room.sessionId);
    return p ? { id: p.id, mode: p.mode, x: p.x, y: p.y, floor: p.floor } : null;
  });
const me = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    const p = c.room.state.players.get(c.room.sessionId);
    return { x: p.x as number, y: p.y as number, level: p.level as number, busy: p.busy as string, uid: p.uid };
  });
const send = (page: Page, type: string, msg: unknown) =>
  page.evaluate(([t, m]) => (window as any).__yutopia.send(t, m), [type, msg] as const);
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
// the War Room: its place on its floor, and whose it is
const office = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    const a = c.map.areas.find((x: any) => x.key === "war-room");
    return a ? { x: a.x, y: a.y, w: a.w, h: a.h, ownerId: a.ownerId ?? null, ownerName: a.ownerName ?? null } : null;
  });
const inIt = (o: { x: number; y: number; w: number; h: number }, p: { x: number; y: number }) =>
  p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h;

test("Rex left in Ana's office; she drives off and logs off; back, he's there", async ({ browser }) => {
  test.setTimeout(300_000);
  let page = await (await browser.newContext()).newPage();
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.cars, null, { timeout: 60_000 });
  const room = await office(page);
  expect(room, "the War Room").toBeTruthy();
  const was = { ownerId: room?.ownerId ?? null, ownerName: room?.ownerName ?? null };
  const o = room as { x: number; y: number; w: number; h: number };
  try {
    await release(page);
    const uid = (await me(page)).uid;
    await send(page, "map:room:update", { key: "war-room", ownerId: uid, ownerName: "Ana Demo" });
    await expect.poll(async () => (await office(page))?.ownerId).toBe(uid);
    await send(page, "pet:adopt", { species: "dog", name: "Rex", look: { breed: "beagle" } });
    await expect.poll(async () => (await rex(page))?.mode).toBe("follow");
    const id = (await rex(page))?.id as string;
    // in her office with him
    await send(page, "teleport", { to: { x: o.x + o.w / 2 + 2, y: o.y + o.h / 2 } });
    await expect.poll(async () => inIt(o, await me(page)), { timeout: 10_000 }).toBe(true);
    await expect.poll(async () => inIt(o, (await rex(page)) ?? { x: -1, y: -1 }), { timeout: 20_000 }).toBe(true);
    // the panel: "Wait in my office"
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: "pets" } }));
    await page.getByRole("button", { name: /wait in my office/i }).click();
    await expect.poll(async () => (await rex(page))?.mode).toBe("home");
    await shot(page, "game-home-panel");
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
    // down to the lot, into a car, off
    const car = await page.evaluate(() => {
      const c = (window as any).__yutopia;
      const x = [...c.room.state.objects.values()].find((v: any) => {
        const p = JSON.parse(v.props);
        return v.kind === "car" && !p.driven && !p.ownerId && p.model !== "offroad";
      }) as any;
      return { x: x.x + 2, y: x.y + 1 };
    });
    await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), car);
    await page.waitForFunction(() => /^car/.test((window as any).__hud.get().prompt?.kind ?? ""), null, {
      timeout: 20_000,
    });
    await page.evaluate(() => (window as any).__yutopia.interact());
    await expect.poll(async () => (await me(page)).busy, { timeout: 10_000 }).toMatch(/^drive:car:/);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2500);
    await page.keyboard.up("KeyW");
    expect((await rex(page))?.mode, "he stayed at home").toBe("home");
    // she logs off (her tab shut, the car left on the road)
    await page.context().close();
    await new Promise((r) => setTimeout(r, 6000));
    // back
    page = await (await browser.newContext()).newPage();
    await enter(page, await token(ANA));
    await expect.poll(async () => (await rex(page))?.id, { timeout: 20_000 }).toBe(id);
    const back = (await rex(page)) as { mode: string; x: number; y: number; floor: number };
    expect(back.mode).toBe("home");
    expect(inIt(o, back), `in her office: ${back.x},${back.y}`).toBe(true);
    // to her office, to see him
    await send(page, "teleport", { to: { x: o.x + o.w / 2 + 2, y: o.y + o.h / 2 } });
    await page.waitForTimeout(2500);
    const r = (await rex(page)) as { x: number; y: number };
    await holdCamera(page, { at: { x: r.x, y: r.y }, yaw: -Math.PI * 0.7, pitch: 0.6, dist: 6 });
    await page.waitForTimeout(2000);
    await shot(page, "game-home-back");
  } finally {
    await release(page);
    await send(page, "map:room:update", { key: "war-room", ownerId: was.ownerId ?? 0, ownerName: was.ownerName });
  }
});
