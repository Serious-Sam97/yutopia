/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { chromium, expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, spaceId, test, token, walkTo } from "./helpers";

// The voice line sleeps after a quiet spell (nothing of mine live, nobody near)
// and wakes on demand; proximity voice must work exactly as before. The wait is
// 5 minutes in the world; here window.__voiceSleepMs makes it 4 s.
const SLEEP = 4000;
const hud = (p: Page) => p.evaluate(() => (window as any).__hud.get().media);
const asleep = (p: Page) => p.evaluate(() => (window as any).__hud.get().media.asleep as boolean);
const micTrack = (p: Page) =>
  p.evaluate(() => {
    const room = (window as any).__yutopia.media.room;
    const pub = room?.localParticipant.getTrackPublication("microphone");
    return pub?.track?.mediaStreamTrack?.readyState ?? "none";
  });

async function launch() {
  return chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
}
async function open(browser: Awaited<ReturnType<typeof launch>>, who: { email: string; password: string }) {
  const tok = await token(who);
  const lab = await spaceId(tok, "Yutopia Lab");
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 720 },
    permissions: ["camera", "microphone"],
  });
  const page = await ctx.newPage();
  await page.addInitScript((ms) => {
    (window as any).__voiceSleepMs = ms;
  }, SLEEP);
  await enter(page, tok, lab);
  return page;
}
// walk somewhere open, far from (x, y) (well out of earshot)
async function goFar(page: Page, from: { x: number; y: number }) {
  const spots = (await page.evaluate((f) => {
    const w = (window as any).__yutopia;
    const m = w.map;
    const out: { x: number; y: number; d: number }[] = [];
    for (const [x, y] of [
      [2, 2],
      [m.width - 3, 2],
      [2, m.height - 3],
      [m.width - 3, m.height - 3],
      [Math.floor(m.width / 2), 2],
    ]) {
      const o = w.grid.nearestOpen(x, y);
      if (!o) continue;
      // away from where we start and from anyone else here (people from an
      // earlier run linger ~20 s after their browser closes)
      let d = Math.hypot(o.x - f.x, o.y - f.y);
      w.room.state.players.forEach((p: any, sid: string) => {
        if (sid !== w.room.sessionId) d = Math.min(d, Math.hypot(o.x - p.x, o.y - p.y));
      });
      out.push({ x: o.x, y: o.y, d });
    }
    return out.sort((a, b) => b.d - a.d);
  }, from)) as { x: number; y: number; d: number }[];
  for (const s of spots) {
    if (s.d < 14) break;
    try {
      await walkTo(page, s.x, s.y, 30_000);
      return s;
    } catch {}
  }
  throw new Error("nowhere far to walk to");
}

test("alone and muted, the voice line sleeps (letting go of the mic); the mic wakes it", async () => {
  test.setTimeout(120_000);
  const browser = await launch();
  try {
    const ana = await open(browser, ANA);
    await goFar(ana, await ana.evaluate(() => (window as any).__yutopia.meTile()));
    await expect.poll(() => asleep(ana), { timeout: SLEEP + 10_000 }).toBe(true);
    expect(await ana.evaluate(() => (window as any).__yutopia.media.room)).toBeNull();
    expect((await hud(ana)).offline).toBe(false);
    await expect(ana.locator("[data-voice-asleep]")).toBeVisible();

    // M: the line wakes and the mic goes live
    await ana.keyboard.press("m");
    await expect.poll(async () => (await hud(ana)).mic, { timeout: 15_000 }).toBe(true);
    expect(await asleep(ana)).toBe(false);
    expect(await micTrack(ana)).toBe("live");
    // a while with the mic on: no sleep
    await ana.waitForTimeout(SLEEP + 2500);
    expect(await asleep(ana)).toBe(false);
    // M again: muted; and M once more (still awake): live again, no error
    await ana.keyboard.press("m");
    await expect.poll(async () => (await hud(ana)).mic).toBe(false);
    await ana.keyboard.press("m");
    await expect.poll(async () => (await hud(ana)).mic, { timeout: 15_000 }).toBe(true);
    expect(await micTrack(ana)).toBe("live");
    await ana.keyboard.press("m");
    await expect.poll(async () => (await hud(ana)).mic).toBe(false);
    // after the quiet spell, asleep again: the microphone itself is let go
    const track = await ana.evaluateHandle(
      () =>
        (window as any).__yutopia.media.room.localParticipant.getTrackPublication("microphone").track.mediaStreamTrack,
    );
    await expect.poll(() => asleep(ana), { timeout: SLEEP + 10_000 }).toBe(true);
    expect(await track.evaluate((t: MediaStreamTrack) => t.readyState)).toBe("ended");
    // asleep, M wakes it and the mic is live again
    await ana.keyboard.press("m");
    await expect.poll(async () => (await hud(ana)).mic, { timeout: 15_000 }).toBe(true);
    expect(await micTrack(ana)).toBe("live");
    await ana.keyboard.press("m");
    await expect.poll(async () => (await hud(ana)).mic).toBe(false);
    await expect.poll(() => asleep(ana), { timeout: SLEEP + 10_000 }).toBe(true);
    // the camera wakes it too (V), and off again it goes back to sleep
    await ana.keyboard.press("v");
    await expect.poll(async () => (await hud(ana)).cam, { timeout: 15_000 }).toBe(true);
    expect(await asleep(ana)).toBe(false);
    await ana.waitForTimeout(SLEEP + 1500);
    expect(await asleep(ana)).toBe(false);
    await ana.keyboard.press("v");
    await expect.poll(async () => (await hud(ana)).cam).toBe(false);
    await expect.poll(() => asleep(ana), { timeout: SLEEP + 10_000 }).toBe(true);
  } finally {
    await browser.close();
  }
});

test("proximity voice still works: walking up to someone wakes both lines, and you hear them", async () => {
  test.setTimeout(180_000);
  const browser = await launch();
  try {
    const ana = await open(browser, ANA);
    const bia = await open(browser, BIA);
    const anaAt = await ana.evaluate(() => (window as any).__yutopia.meTile());
    await goFar(bia, anaAt);
    // both alone: both asleep
    await expect.poll(() => asleep(ana), { timeout: SLEEP + 12_000 }).toBe(true);
    await expect.poll(() => asleep(bia), { timeout: SLEEP + 12_000 }).toBe(true);
    // Bia unmutes far away: her line wakes, Ana's stays asleep (nobody near her)
    await bia.keyboard.press("m");
    await expect.poll(async () => (await hud(bia)).mic, { timeout: 15_000 }).toBe(true);
    await ana.waitForTimeout(1500);
    expect(await asleep(ana)).toBe(true);
    // Bia walks over to Ana: Ana's line wakes and Bia's voice reaches her
    await walkTo(bia, anaAt.x + 1.5, anaAt.y + 0.5, 40_000);
    await expect.poll(() => asleep(ana), { timeout: 10_000 }).toBe(false);
    const biaUid = await bia.evaluate(() => (window as any).__yutopia.myUid());
    await expect
      .poll(() => ana.evaluate((u) => (window as any).__yutopia.media.voices.has(String(u)), biaUid), {
        timeout: 15_000,
      })
      .toBe(true);
    // and it doesn't fall asleep while they're together (well past the wait)
    await ana.waitForTimeout(SLEEP + 3000);
    expect(await asleep(ana)).toBe(false);
    expect(await ana.evaluate((u) => (window as any).__yutopia.media.voices.has(String(u)), biaUid)).toBe(true);
    // Ana unmutes too: Bia hears her
    await ana.keyboard.press("m");
    const anaUid = await ana.evaluate(() => (window as any).__yutopia.myUid());
    await expect
      .poll(() => bia.evaluate((u) => (window as any).__yutopia.media.voices.has(String(u)), anaUid), {
        timeout: 15_000,
      })
      .toBe(true);
    // both mute, Bia walks away: both sleep again
    await ana.keyboard.press("m");
    await bia.keyboard.press("m");
    await goFar(bia, anaAt);
    await expect.poll(() => asleep(ana), { timeout: SLEEP + 12_000 }).toBe(true);
    await expect.poll(() => asleep(bia), { timeout: SLEEP + 12_000 }).toBe(true);
  } finally {
    await browser.close();
  }
});

test("a phone call between two sleeping lines works, and keeps them awake while it lasts", async () => {
  test.setTimeout(180_000);
  const browser = await launch();
  try {
    const ana = await open(browser, ANA);
    const bia = await open(browser, BIA);
    const anaAt = await ana.evaluate(() => (window as any).__yutopia.meTile());
    await goFar(bia, anaAt);
    await expect.poll(() => asleep(ana), { timeout: SLEEP + 12_000 }).toBe(true);
    await expect.poll(() => asleep(bia), { timeout: SLEEP + 12_000 }).toBe(true);
    for (const p of [ana, bia])
      await p.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 20_000 });
    const anaUid = await ana.evaluate(() => (window as any).__yutopia.myUid());
    const biaUid = await bia.evaluate(() => (window as any).__yutopia.myUid());
    await ana.evaluate((u) => (window as any).__yutopia.phone.addContact(u), biaUid);
    await bia.evaluate((u) => (window as any).__yutopia.phone.addContact(u), anaUid);
    // Ana calls (no "no voice line" refusal while asleep), Bia answers
    await ana.evaluate((u) => (window as any).__yutopia.phone.calls.start([u]), biaUid);
    await expect(bia.locator("[data-call-answer]")).toBeVisible({ timeout: 10_000 });
    await bia.locator("[data-call-answer]").click();
    await expect
      .poll(() => ana.evaluate(() => (window as any).__phone.get().call?.phase), { timeout: 15_000 })
      .toBe("live");
    // the world's lines wake for the call and stay up past the quiet wait
    await expect.poll(() => asleep(ana), { timeout: 8000 }).toBe(false);
    await expect.poll(() => asleep(bia), { timeout: 8000 }).toBe(false);
    await ana.waitForTimeout(SLEEP + 2000);
    expect(await asleep(ana)).toBe(false);
    expect(await ana.evaluate(() => (window as any).__phone.get().call?.phase)).toBe("live");
    // hang up: after the quiet spell, both asleep again
    await ana.locator("[data-call-end]").first().click();
    await expect.poll(() => asleep(ana), { timeout: SLEEP + 12_000 }).toBe(true);
    await expect.poll(() => asleep(bia), { timeout: SLEEP + 12_000 }).toBe(true);
  } finally {
    await browser.close();
  }
});
