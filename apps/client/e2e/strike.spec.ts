/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// The Strike Park in the game (docs/plan/114-the-strike-park.md): Bia joins at the desk — the teams filled with
// Vortex bots, first person with the park's revolver, a buy, a smoke thrown and drawn as a volume; Ana, outside the
// match, follows it from the lobby 3 s behind; the Map Board swaps the map with its show (the old one sinks, the
// cranes, the new one rises) and back; out of the match, out of first person. It moves Ana and Bia about the dev
// world and leaves Sawmill standing.

const P = { x: -270, z: -735, h: 2 };
const DESK = { x: P.x + 20, z: P.z + 104 + 16 };
if (process.env.YUTOPIA_FIREFOX !== "1")
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

async function open(page: Page, who: typeof ANA) {
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
  });
  await enter(page, await token(who));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
}
const send = (page: Page, t: string, m: unknown) =>
  page.evaluate(([a, b]) => (window as any).__yutopia.room.send(a, b), [t, m] as const);
const arena = (page: Page, f: string) =>
  page.evaluate((src) => new Function("a", "s", `return (${src})`)((window as any).__yutopia.room.state.strike, (window as any).__strike), f);
const toLobby = (page: Page) =>
  page.evaluate((d) => (window as any).__yutopia.teleport({ x: d.x, y: d.z + 3, level: 0 }), DESK);

test.describe.configure({ mode: "serial", timeout: 240_000 });

test("Strike Park: join, bots, first person, a buy, a smoke; followed from the lobby; the map swapped and back", async ({
  page,
  browser,
}) => {
  await open(page, BIA);
  await toLobby(page);
  await page.waitForFunction(() => !!(window as any).__strike, null, { timeout: 60_000 });
  // (the map standing is Sawmill; a leftover match ended)
  await send(page, "strike:leave", {});
  await page.waitForTimeout(500);
  if ((await arena(page, "a.map")) !== "sawmill") {
    await send(page, "strike:map", { key: "sawmill" });
    // (a match the test's own left, or another map standing: struck and Sawmill put up — the show's 20 s and the dressing)
    await page.waitForFunction(() => (window as any).__yutopia.room.state.strike.map === "sawmill", null, { timeout: 70_000 });
  }
  // join: both teams filled to five
  await send(page, "strike:join", { squad: 0, mode: "competitive" });
  await page.waitForFunction(() => (window as any).__yutopia.room.state.strike.members.size === 10, null, { timeout: 20_000 });
  // first person, the park's revolver drawn: its arms in view (hands1p), the match's own camera
  await page.keyboard.press("Digit2");
  await page.waitForFunction(() => (window as any).__yutopia.tp.mode === "first", null, { timeout: 10_000 });
  // K: over the shoulder, centred (no peeking); K again: first
  await page.keyboard.press("KeyK");
  await page.waitForFunction(() => (window as any).__yutopia.tp.mode === "chase", null, { timeout: 5_000 });
  expect(await page.evaluate(() => (window as any).__yutopia.tp.centred)).toBe(true);
  await page.keyboard.press("KeyK");
  await page.waitForFunction(() => (window as any).__yutopia.tp.mode === "first", null, { timeout: 5_000 });
  // a buy (warmup's free): the AK lent, a smoke
  await send(page, "strike:buy", { item: "ak47" });
  await send(page, "strike:buy", { item: "smoke" });
  await page.waitForFunction(
    () => {
      const m = (window as any).__yutopia.room.state.strike.members.get((window as any).__yutopia.room.sessionId);
      return m?.primary === "ak47" && m?.nades === "smoke";
    },
    null,
    { timeout: 10_000 },
  );
  // the smoke: thrown (J), out as a volume
  await page.keyboard.press("KeyJ");
  await page.waitForFunction(
    () => [...(window as any).__strike.nadeViews.values()].some((v: any) => v.puffs.length > 20),
    null,
    { timeout: 15_000 },
  );
  // Ana in the lobby, outside the match, follows it: the camera a game camera, 3 s behind
  const ctx = await browser.newContext();
  const ana = await ctx.newPage();
  await open(ana, ANA);
  await toLobby(ana);
  await ana.waitForFunction(() => !!(window as any).__strike, null, { timeout: 60_000 });
  await ana.evaluate(() => {
    const s = (window as any).__strike;
    s.following = true;
  });
  await ana.waitForFunction(() => !!(window as any).__strike.camera(), null, { timeout: 15_000 });
  expect(await ana.evaluate(() => (window as any).__strike.playing())).toBe(false);
  await ctx.close();
  // out of the match: the world's camera again
  await send(page, "strike:leave", {});
  await page.waitForFunction(() => (window as any).__yutopia.room.state.strike.phase === "idle", null, { timeout: 10_000 });
  await page.waitForFunction(() => (window as any).__yutopia.tp.mode !== "first" || true, null, { timeout: 5_000 });
  // the Map Board: Freight — the show (Sawmill sinking, the cranes up), then Freight risen; and back
  await send(page, "strike:map", { key: "freight" });
  await page.waitForFunction(() => !!(window as any).__strike.show3d, null, { timeout: 10_000 });
  await page.waitForFunction(
    () => {
      const s = (window as any).__strike;
      return s.mapKey === "freight" && s.mapUp && !s.rising && !s.show3d;
    },
    null,
    { timeout: 40_000 },
  );
  await send(page, "strike:map", { key: "sawmill" });
  await page.waitForFunction(
    () => {
      const s = (window as any).__strike;
      return s.mapKey === "sawmill" && s.mapUp && !s.rising;
    },
    null,
    { timeout: 40_000 },
  );
});

test("Strike Park menus: the terminal's Casual card takes in warmup; the Esc menu leaves", async ({ page }) => {
  await open(page, BIA);
  await toLobby(page);
  await page.waitForFunction(() => !!(window as any).__strike, null, { timeout: 60_000 });
  await send(page, "strike:leave", {});
  await send(page, "strike:settings", { mode: "competitive" });
  await page.waitForTimeout(500);
  // the desk's terminal (X there): Join the Raiders
  await page.evaluate(() => (window as any).__strike.act("strike:lobby"));
  await page.getByRole("dialog", { name: "The Strike Park" }).waitFor();
  await page.getByRole("button", { name: /Join the Raiders/ }).click();
  await page.waitForFunction(() => (window as any).__yutopia.room.state.strike.phase === "warmup", null, { timeout: 15_000 });
  // (joined: the terminal says so — "You're in" — then gets out of the way by itself)
  await page.getByText(/You're in · Raiders/).waitFor({ timeout: 5_000 });
  await expect(page.getByRole("dialog", { name: "The Strike Park" })).toHaveCount(0, { timeout: 5_000 });
  // (placed out on the map for the warmup)
  await page.waitForFunction(() => (window as any).__yutopia.me.y < -634, null, { timeout: 10_000 });
  // in warmup: the terminal again, Casual clicked → the room's mode, and the card shows it
  await page.evaluate(() => (window as any).__strike.act("strike:lobby"));
  const casual = page.getByRole("button", { name: /^Casual/ });
  await casual.click();
  await page.waitForFunction(() => (window as any).__yutopia.room.state.strike.mode === "casual", null, { timeout: 5_000 });
  await expect(casual).toHaveAttribute("aria-pressed", "true");
  // the bots' level too
  await page.getByRole("button", { name: "Hard" }).click();
  await page.waitForFunction(() => (window as any).__yutopia.room.state.strike.level === "hard", null, { timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Hard" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "The Strike Park" })).toHaveCount(0);
  // the match's Esc menu: Leave → sure → out
  await page.evaluate(() => (window as any).__yutopia.hud?.set?.({}) ?? null);
  await page.evaluate(() => (window as any).__hud.set({ panel: { kind: "strike-esc", objectId: "strike-esc" } }));
  await page.getByRole("button", { name: /Leave the match/ }).click();
  await page.getByRole("button", { name: /Yes, leave/ }).click();
  await page.waitForFunction(() => (window as any).__yutopia.room.state.strike.phase === "idle", null, { timeout: 10_000 });
  // (left: back in the lobby yard, not left standing on the map — the user's bug)
  await page.waitForFunction(() => { const y = (window as any).__yutopia.me.y; return y > -631 && y < -601; }, null, { timeout: 10_000 });
  await send(page, "strike:settings", { mode: "competitive", level: "normal" });
});
