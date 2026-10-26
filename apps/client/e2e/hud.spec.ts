/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld, walkTo } from "./helpers";

// The main HUD (proposal v2): top bars, the side panel (people · room) with
// who can hear you, quick emotes, the phone key, the status menu, the minimap.
const SHOTS = process.env.YUTOPIA_SHOTS;

test("HUD: who hears you, emotes, the phone key, people, room, status, minimap", async ({ browser }) => {
  test.setTimeout(180_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const s = await useWorld("demo");
  const ctx = { viewport: { width: 1440, height: 900 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  const errors: string[] = [];
  ana.on("pageerror", (e) => errors.push(e.message));
  await enter(ana, ta, s);
  await enter(bia, tb, s);
  const at = await ana.evaluate(() => (window as any).__yutopia.meTile());
  await walkTo(bia, at.x + 1.5, at.y + 0.5, 25_000);

  // top bars: where I am — the room's name, who's here under it (people come in at the arrival point) — who's in
  const here = await ana.evaluate(() => (window as any).__hud.get().me?.areaName as string);
  const where = ana.locator("header").first();
  await expect(where.getByText(here, { exact: true })).toBeVisible();
  await expect(where.getByText(/\d+ here/)).toBeVisible();
  await expect(ana.getByText(/\d+ online/)).toBeVisible();

  // the people panel: who can hear me (the chat's gone — texts are on the phone)
  await ana.getByTitle("People", { exact: true }).click();
  const panel = ana.getByRole("complementary", { name: "People" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Bia Demo.* can hear you/)).toBeVisible({ timeout: 10_000 });
  await expect(ana.locator("[data-phone-key]")).toBeVisible();

  // a quick emote from the dock shows over my head
  await ana.getByRole("button", { name: "Emote" }).click();
  await ana.getByRole("menuitem", { name: "wave" }).click();
  await expect
    .poll(() =>
      ana.evaluate(
        () => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).emote,
      ),
    )
    .toBe("wave");
  if (SHOTS) await ana.screenshot({ path: `${SHOTS}/hud-people.png` });

  // people and room tabs
  await expect(panel.getByText("hears you").first()).toBeVisible();
  await ana.getByRole("tab", { name: /Room/ }).click();
  const room = ana.getByRole("complementary", { name: "Room" });
  await expect(room.getByText(here.toUpperCase())).toBeVisible();
  await expect(room.getByText(/\d+ here/)).toBeVisible();

  // status menu
  await ana.getByTitle("Status").click();
  await ana.getByRole("menuitemradio", { name: /Focus/ }).click();
  await expect.poll(() => ana.evaluate(() => (window as any).__hud.get().me?.status)).toBe("dnd");
  await ana.getByTitle("Status").click();
  await ana.getByRole("menuitemradio", { name: /Available/ }).click();

  // the minimap names the room I'm in
  await expect(ana.getByRole("button", { name: "Map", exact: true })).toBeVisible();
  await expect(ana.getByRole("button", { name: "Zoom in" })).toBeVisible();
  expect(errors).toEqual([]);
});
