/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { ANA, BIA, enter, spaceId, test, token, walkTo } from "./helpers";

// The main HUD (proposal v2): top bars, the side panel (chat · people · room)
// with who can hear you, reactions and quick emotes, the status menu, the minimap.
const SHOTS = process.env.YUTOPIA_SHOTS;

test("HUD: who hears you, chat with reactions, people, room, status, minimap", async ({ browser }) => {
  test.setTimeout(180_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const s = await spaceId(ta);
  const ctx = { viewport: { width: 1440, height: 900 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  const errors: string[] = [];
  ana.on("pageerror", (e) => errors.push(e.message));
  await enter(ana, ta, s);
  await enter(bia, tb, s);
  const at = await ana.evaluate(() => (window as any).__yutopia.meTile());
  await walkTo(bia, at.x + 1.5, at.y + 0.5, 25_000);

  // top bars: where I am (people come in at the arrival point), who's in
  const here = await ana.evaluate(() => (window as any).__hud.get().me?.areaName as string);
  await expect(ana.getByText(new RegExp(`${here} · \\d+ here`))).toBeVisible();
  await expect(ana.getByText(/\d+ online/)).toBeVisible();

  // chat: who can hear me, then a message from Bia
  await ana.keyboard.press("Enter");
  const panel = ana.getByRole("complementary", { name: "Chat" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Bia Demo.* can hear you/)).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByPlaceholder(/Say something to Bia/)).toBeVisible();
  await bia.evaluate(() => (window as any).__yutopia.chat("standup in 5?", "nearby"));
  const msg = panel.getByText("standup in 5?");
  await expect(msg).toBeVisible();

  // react from the UI; Bia sees the count
  await msg.hover();
  await panel.getByRole("button", { name: "React: heart" }).click();
  await expect(panel.getByRole("button", { name: "heart 1" })).toBeVisible();
  await expect
    // (that message: another line, Vortex's say, can arrive after it)
    .poll(() =>
      bia.evaluate(
        () =>
          (window as any).__hud.get().chat.find((c: any) => c.text === "standup in 5?")?.reactions?.heart?.length ?? 0,
      ),
    )
    .toBe(1);

  // a quick emote from the composer shows over my head
  await panel.getByRole("button", { name: "wave" }).click();
  await expect
    .poll(() =>
      ana.evaluate(
        () => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).emote,
      ),
    )
    .toBe("wave");
  if (SHOTS) await ana.screenshot({ path: `${SHOTS}/hud-chat.png` });

  // people and room tabs
  await panel.getByRole("tab", { name: /People/ }).click();
  await expect(ana.getByRole("complementary", { name: "People" }).getByText("hears you").first()).toBeVisible();
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
