/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */

import { expect, type Page } from "@playwright/test";
import { HOME_CARS, parkedPose } from "@yutopia/shared/car";
import { ANA, clearDrafts, enter, holdHour, makeDraft, test, token, useWorld } from "./helpers";

// God mode's vehicles (docs/plan/102-god-mode-vehicles.md), on Low on the dev stack, by the hotel's taxis: one picked
// with Select (its panel), dragged 6 m along the street and turned with R — the draft's, drawn there for Ana alone; a BMX
// placed with the Vehicles tool; published — the taxi parked at its new home and the bike made, in the room; rolled
// back — the taxi home again, the bike gone. The draft's deleted.
const TAXI = HOME_CARS.find((h) => h.role === "taxi" && !h.look);
if (!TAXI) throw new Error("no taxi");
const god = (page: Page) => page.evaluate(() => (window as any).__hud.get().god);
const toScreen = (page: Page, x: number, z: number) =>
  page.evaluate(
    ([gx, gz]) => {
      const y = (window as any).__yutopia;
      const t = y.tp;
      const f = t.groundsFrame();
      const v = t.camera.position
        .clone()
        .set(gx, y.G.terrainAt(gx, gz) + f.y + 0.6, gz)
        .project(t.camera);
      const r = t.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    [x, z],
  );
/** A vehicle object in the room, its pose (the Grounds' coords) and props. */
const objOf = async (page: Page, id: string) => {
  const o = await page.evaluate((k) => {
    const x = (window as any).__yutopia.room.state.objects.get(k);
    return x ? { x: x.x, y: x.y, yaw: x.yaw, props: JSON.parse(x.props) } : null;
  }, id);
  if (!o) return null;
  const p = parkedPose(o);
  return { x: p.x, z: p.y, a: p.a, props: o.props as Record<string, unknown> };
};

test("God mode's vehicles: a taxi picked, moved and turned, a bike placed; published, rolled back", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const space = await useWorld("demo");
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
  });
  const tok = await token(ANA);
  await clearDrafts(tok);
  await makeDraft(tok, "e2e: vehicles");
  await enter(page, tok, space);
  await holdHour(page, 13);
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: TAXI.x + 6, y: TAXI.z + 6, level: 0 });
  await page.waitForTimeout(5000);
  const was = await objOf(page, TAXI.id);
  expect(was, "the taxi's in the world").not.toBeNull();
  const rev0 = await page.evaluate(() => (window as any).__yutopia.room.state.groundsRev);
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 15_000 }).toBe(true);
  // (the camera down near the street: a car is a few pixels from 80 m)
  await page.mouse.move(640, 400);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -240);
  await page.waitForTimeout(2500);
  await page.keyboard.press("1");
  expect((await god(page)).tool).toBe("select");

  // the taxi: picked (its panel), dragged 6 m along the street, turned
  const p0 = await toScreen(page, was?.x ?? TAXI.x, was?.z ?? TAXI.z);
  await page.mouse.click(p0.x, p0.y);
  await expect.poll(() => god(page).then((g) => [g.picked, g.vehicles.sel?.key])).toEqual(["vehicle", TAXI.id]);
  await expect(page.getByRole("complementary").getByRole("button", { name: "Turn" })).toBeVisible();
  const to = { x: (was?.x ?? TAXI.x) + Math.cos(TAXI.a) * 6, z: (was?.z ?? TAXI.z) + Math.sin(TAXI.a) * 6 };
  const p1 = await toScreen(page, to.x, to.z);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(p0.x + ((p1.x - p0.x) * i) / 10, p0.y + ((p1.y - p0.y) * i) / 10);
  await page.mouse.up();
  await page.keyboard.press("r");
  await expect
    .poll(() =>
      god(page).then(() =>
        page.evaluate((k) => (window as any).__yutopia.god.draftNow().vehicles?.change?.[k], TAXI.id),
      ),
    )
    .toMatchObject({ x: expect.any(Number), z: expect.any(Number), a: expect.any(Number) });
  const moved = await page.evaluate((k) => (window as any).__yutopia.god.draftNow().vehicles.change[k], TAXI.id);
  expect(Math.hypot(moved.x - to.x, moved.z - to.z), "put down where it was dragged").toBeLessThan(1.5);
  // (drawn there for Ana: the draft's)
  const drawn = await page.evaluate((k) => (window as any).__yutopia.cars.godVehicle(k), TAXI.id);
  expect(Math.hypot(drawn.x - moved.x, drawn.z - moved.z)).toBeLessThan(0.6);
  // (the world's taxi hasn't moved: nothing's published)
  const still = await objOf(page, TAXI.id);
  expect(Math.hypot((still?.x ?? 0) - (was?.x ?? 0), (still?.z ?? 0) - (was?.z ?? 0))).toBeLessThan(0.3);

  // a BMX placed with the Vehicles tool, on the street the other side
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as any).__yutopia.god.setTool("vehicles"));
  await page.locator('[data-god-vehicle="bike_bmx"]').click();
  expect((await god(page)).vehicles.kind).toBe("bike_bmx");
  const bikeAt = { x: TAXI.x - Math.sin(TAXI.a) * 5, z: TAXI.z + Math.cos(TAXI.a) * 5 };
  // (the draft's own vehicles placed before this one: what's live may have some — an admin's)
  const keys0: string[] = await page.evaluate(() =>
    ((window as any).__yutopia.god.draftNow().vehicles?.add ?? []).map((v: any) => v.key),
  );
  const pb = await toScreen(page, bikeAt.x, bikeAt.z);
  await page.mouse.move(pb.x, pb.y);
  await page.waitForTimeout(1500);
  await page.mouse.click(pb.x, pb.y);
  await expect
    .poll(() => page.evaluate(() => (window as any).__yutopia.god.draftNow().vehicles?.add?.length ?? 0))
    .toBe(keys0.length + 1);
  const bike = await page.evaluate(
    (k) => (window as any).__yutopia.god.draftNow().vehicles.add.find((v: any) => !k.includes(v.key)),
    keys0,
  );
  expect(bike.model).toBe("bike_bmx");

  // published: the taxi at its new home, the bike made
  await expect.poll(() => god(page).then((x) => x.save), { timeout: 10_000 }).toBe("saved");
  const id = (await god(page)).draft.id;
  await page.evaluate(
    (d) => (window as any).__yutopia.room.send("god:publish", { draftId: d, note: "e2e: vehicles" }),
    id,
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__yutopia.room.state.groundsRev), { timeout: 20_000 })
    .toBe(rev0 + 1);
  await expect.poll(() => objOf(page, bike.key), { timeout: 10_000 }).not.toBeNull();
  const t1 = await objOf(page, TAXI.id);
  expect(Math.hypot((t1?.x ?? 0) - moved.x, (t1?.z ?? 0) - moved.z), "the taxi at its new home").toBeLessThan(0.8);
  expect((await objOf(page, bike.key))?.props.model).toBe("bike_bmx");

  // rolled back: the taxi home again, the bike gone
  await page.evaluate((r) => (window as any).__yutopia.room.send("god:rollback", { rev: r }), rev0);
  await expect
    .poll(() => page.evaluate(() => (window as any).__yutopia.room.state.groundsRev), { timeout: 20_000 })
    .toBe(rev0 + 2);
  await expect.poll(() => objOf(page, bike.key), { timeout: 10_000 }).toBeNull();
  const t2 = await objOf(page, TAXI.id);
  // (where it was before: its home as what's live has it — an admin's edits may have moved it from the town's)
  expect(
    Math.hypot((t2?.x ?? 0) - (was?.x ?? TAXI.x), (t2?.z ?? 0) - (was?.z ?? TAXI.z)),
    "the taxi home again",
  ).toBeLessThan(0.8);

  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((x) => x.on)).toBe(false);
  await clearDrafts(tok);
});
