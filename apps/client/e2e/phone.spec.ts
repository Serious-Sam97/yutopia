/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, spaceId, test, token } from "./helpers";

// The phone (docs/plan/21-cellphone.md): P brings it out (it boots once), the
// home grid with the keyboard, you keep walking with it out, others see it in
// your hand; texts between two people arrive live (the peek); a call rings,
// is answered and hung up; the camera takes a photo into the Gallery.
// YUTOPIA_SHOTS=<dir> saves screenshots along the way.
const SHOTS = process.env.YUTOPIA_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const world = (page: Page, fn: (w: any) => unknown) =>
  page.evaluate(`(${fn.toString()})(window.__yutopia)`) as Promise<unknown>;
const ph = (page: Page) => page.evaluate(() => (window as any).__phone?.get());

test("the phone: out with P, the grid by keyboard, walking with it, others see it", async ({ page, browser }) => {
  const tok = await token(ANA);
  const space = await spaceId(tok);
  await enter(page, tok, space);
  await page.waitForFunction(() => (window as any).__hud.get().phone.loaded, null, { timeout: 20_000 });
  // the dock's phone key (the chat's gone)
  await expect(page.locator("[data-phone-key]")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Chat" })).toHaveCount(0);

  await page.keyboard.press("p");
  await expect(page.locator("[data-phone-boot]")).toBeVisible();
  await expect(page.locator("[data-app=messages]")).toBeVisible({ timeout: 6000 });
  await shot(page, "phone-home");
  // others see it out
  const bia = await browser.newPage();
  await enter(bia, await token(BIA), space);
  await bia.waitForFunction(
    (uid) => {
      const st = (window as any).__yutopia.room.state;
      let out = "";
      st.players.forEach((p: any) => {
        if (p.uid === uid) out = p.phone;
      });
      return out === "text";
    },
    await world(page, (w) => w.myUid()),
    { timeout: 10_000 },
  );

  // arrows move the highlight over the grid; Enter opens; Backspace goes back
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await ph(page)).stack.at(-1).app).toBe("messages");
  await shot(page, "phone-messages");
  await page.keyboard.press("Backspace");
  await expect.poll(async () => (await ph(page)).stack.at(-1).app).toBe("home");

  // walking with it out: WASD still moves me
  const before = (await world(page, (w) => w.meTile())) as { x: number; y: number };
  await page.keyboard.down("s");
  await page.waitForTimeout(600);
  await page.keyboard.up("s");
  const after = (await world(page, (w) => w.meTile())) as { x: number; y: number };
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.3);
  expect((await ph(page)).open).toBe(true);

  // Esc puts it away
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-phone-open]")).toHaveCount(0);
  await bia.close();
});

test("texts arrive live (the phone peeks up), and a call rings, is answered and hung up", async ({ page, browser }) => {
  const tokA = await token(ANA);
  const tokB = await token(BIA);
  const space = await spaceId(tokA);
  await enter(page, tokA, space);
  const bia = await browser.newPage();
  await enter(bia, tokB, space);
  for (const p of [page, bia])
    await p.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 20_000 });
  const biaUid = (await world(bia, (w) => w.myUid())) as number;

  // Ana opens a thread with Bia and texts her
  await world(page, (w) => w.togglePhone(true));
  await page.waitForTimeout(2200);
  await page.evaluate((u) => (window as any).__yutopia.phone.openThreadWith([u]), biaUid);
  await page.locator("[data-composer]").fill("board walls PR is up — free before standup?");
  await page.keyboard.press("Enter");
  // Bia's phone peeks up
  await expect(bia.locator("[data-phone-peek]")).toBeVisible({ timeout: 10_000 });
  await shot(bia, "phone-peek");
  await shot(page, "phone-thread");
  await bia.keyboard.press("p"); // P opens the thread it peeked
  await expect(bia.locator("[data-msg]").last()).toContainText("board walls PR");

  // Ana calls Bia: it rings (her phone comes up), she answers, Ana hangs up
  await page.evaluate((u) => (window as any).__yutopia.phone.calls.start([u]), biaUid);
  await expect(bia.locator("[data-call-answer]")).toBeVisible({ timeout: 10_000 });
  await shot(bia, "phone-incoming");
  await bia.locator("[data-call-answer]").click();
  await expect.poll(async () => (await ph(page))?.call?.phase, { timeout: 10_000 }).toBe("live");
  await page.waitForTimeout(1200);
  await shot(page, "phone-incall");
  await page.locator("[data-call-end]").first().click();
  await expect
    .poll(async () => (await ph(bia))?.call?.end ?? (await ph(bia))?.call, { timeout: 10_000 })
    .not.toBe("live");
  await bia.close();
});

test("the camera: a selfie in iso and in 3D, saved to the Gallery", async ({ page }) => {
  const tok = await token(ANA);
  const space = await spaceId(tok);
  await enter(page, tok, space);
  await page.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 20_000 });
  await world(page, (w) => w.togglePhone(true));
  await page.waitForTimeout(2200);
  await page.evaluate(() => (window as any).__yutopia.phone.camera.open("selfie"));
  await expect(page.locator("[data-viewfinder=selfie]")).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, "phone-selfie-iso");
  const n0 = ((await ph(page)).photos ?? []).length;
  await page.locator("[data-shutter]").click();
  await expect.poll(async () => ((await ph(page)).photos ?? []).length, { timeout: 15_000 }).toBeGreaterThan(n0);
  // 3D
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("yutopia:prefs") ?? "{}");
    localStorage.setItem("yutopia:prefs", JSON.stringify({ ...p, view: "3p" }));
  });
  await page.keyboard.press("Escape");
  await page.keyboard.press("t");
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window as any).__yutopia.phone.camera.open("selfie"));
  await page.waitForTimeout(2000);
  await shot(page, "phone-selfie-3d");
  await page.evaluate(() => (window as any).__yutopia.phone.camera.setMode("photo"));
  await page.waitForTimeout(1500);
  await shot(page, "phone-photo-3d");
  await page.keyboard.press("Escape");
  await page.keyboard.press("t");
});

// Every screen, for the review sheet (only with YUTOPIA_SHOTS).
test("the phone's screens (shots)", async ({ page }) => {
  test.skip(!SHOTS, "review shots only");
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok));
  await page.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 20_000 });
  await world(page, (w) => w.togglePhone(true));
  await page.waitForTimeout(2300);
  const go = async (screen: object, name: string, wait = 900) => {
    await page.evaluate((s) => (window as any).__phone.set({ stack: [{ app: "home" }, s], sel: 0 }), screen);
    await page.waitForTimeout(wait);
    await page.locator("[data-phone-open]").screenshot({ path: `${SHOTS}/screen-${name}.png` });
  };
  await go({ app: "home" }, "home");
  await go({ app: "messages" }, "messages", 1500);
  await go({ app: "contacts" }, "contacts", 1500);
  await go({ app: "phone" }, "recents", 1500);
  await go({ app: "phone", arg: "keypad" }, "keypad");
  await go({ app: "gallery" }, "gallery", 1500);
  await go({ app: "settings" }, "settings");
  await go({ app: "settings", view: "wallpaper" }, "wallpapers");
  await go({ app: "settings", view: "sounds" }, "sounds");
  await go({ app: "settings", view: "case" }, "case");
  await go({ app: "store" }, "store");
  await go({ app: "maps" }, "maps");
  await go({ app: "vortex" }, "vortex");
  // a text to Vortex, and his answer
  await page.evaluate(() => (window as any).__yutopia.phone.openThreadWith([0]));
  await page.waitForTimeout(800);
  await page.locator("[data-composer]").fill("who are you?");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(4500);
  await page.locator("[data-phone-open]").screenshot({ path: `${SHOTS}/screen-vortex-thread.png` });
  // calling him
  await page.evaluate(() => (window as any).__yutopia.phone.calls.start([0]));
  await page.waitForTimeout(9000);
  await page.locator("[data-phone-open]").screenshot({ path: `${SHOTS}/screen-vortex-call.png` });
  await page.evaluate(() => (window as any).__yutopia.phone.calls.hangup());
});
