/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, CAI, enter, loaded, test, token, useWorld } from "./helpers";

// The phone (docs/plan/21-cellphone.md): P brings it out (it boots once), the
// home grid with the keyboard, you keep walking with it out, others see it in
// your hand; texts between two people arrive live (the peek); a call rings,
// is answered and hung up; the camera takes a photo into the Gallery.
// YUTOPIA_SHOTS=<dir> saves screenshots along the way.
// With the real GPU (headless's software GL makes every frame slow):
// YUTOPIA_GPU=1 npx playwright test phone
if (process.env.YUTOPIA_GPU)
  test.use({
    launchOptions: {
      args: [
        "--use-angle=metal",
        "--enable-gpu",
        "--ignore-gpu-blocklist",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  });
const SHOTS = process.env.YUTOPIA_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const world = (page: Page, fn: (w: any) => unknown) =>
  page.evaluate(`(${fn.toString()})(window.__yutopia)`) as Promise<unknown>;
const ph = (page: Page) => page.evaluate(() => (window as any).__phone?.get());

test("the phone: out with P, the grid by keyboard, walking with it, others see it", async ({ page, browser }) => {
  const tok = await token(ANA);
  const space = await useWorld("demo");
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
  const space = await useWorld("demo");
  await enter(page, tokA, space);
  const bia = await browser.newPage();
  await enter(bia, tokB, space);
  for (const p of [page, bia])
    await p.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 20_000 });
  const biaUid = (await world(bia, (w) => w.myUid())) as number;
  const anaUid = (await world(page, (w) => w.myUid())) as number;
  // the phone book: Ana adds Bia by her id (from Bia's Settings), Bia adds Ana
  await page.evaluate((u) => (window as any).__yutopia.phone.addContact(u), biaUid);
  await bia.evaluate((u) => (window as any).__yutopia.phone.addContact(u), anaUid);

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

// A call of three (docs/plan/37-the-gps.md § 1): everyone hears everyone. Ana
// has her world mic on and then muted (a muted mic is a disabled track, and the
// call's copy of it was silent); Cai answers a moment after Bia.
test("a call of three: everyone on the line hears the other two", async ({ page, browser }) => {
  test.setTimeout(240_000); // (three worlds loading at once)
  const space = await useWorld("demo");
  await enter(page, await token(ANA), space);
  const bia = await browser.newPage();
  await enter(bia, await token(BIA), space);
  const cai = await browser.newPage();
  await enter(cai, await token(CAI), space);
  const all = [page, bia, cai];
  for (const p of all) await p.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 60_000 });
  const [anaUid, biaUid, caiUid] = (await Promise.all(all.map((p) => world(p, (w) => w.myUid())))) as number[];
  // Ana's world mic: on, then muted (the line stays up, the track disabled)
  await world(page, (w) => w.toggleMic());
  await page.waitForFunction(() => (window as any).__hud.get().media.mic, null, { timeout: 15_000 });
  await world(page, (w) => w.toggleMic());
  await page.waitForFunction(() => !(window as any).__hud.get().media.mic, null, { timeout: 15_000 });

  await page.evaluate((u) => (window as any).__yutopia.phone.calls.start(u), [biaUid, caiUid]);
  await expect(bia.locator("[data-call-answer]")).toBeVisible({ timeout: 10_000 });
  await expect(cai.locator("[data-call-answer]")).toBeVisible({ timeout: 10_000 });
  // (answered through the phone, not a click: three worlds at once draw few
  // frames, and a click waits for them)
  const answer = (p: Page) => p.evaluate(() => (window as any).__yutopia.phone.calls.answer());
  await answer(bia);
  // live for Ana and Bia; Cai's phone still rings (it took the others' "live"
  // for its own: no ring, no line, and Answer did nothing)
  await expect.poll(async () => (await ph(page))?.call?.phase, { timeout: 15_000 }).toBe("live");
  await cai.waitForTimeout(400);
  expect((await ph(cai))?.call?.phase).toBe("incoming");
  await answer(cai);

  const line = (p: Page) => p.evaluate(() => (window as any).__yutopia.phone.calls.lineInfo());
  const others = (uid: number) => [anaUid, biaUid, caiUid].filter((u) => u !== uid).sort();
  const each = [
    [page, anaUid],
    [bia, biaUid],
    [cai, caiUid],
  ] as const;
  // on the line, my mic live and on, the other two's voices coming in
  await Promise.all(
    each.map(([p, uid]) =>
      expect
        .poll(
          async () => {
            const l = await line(p);
            return { on: l.on, mic: l.mic, far: l.far.map((f: { uid: number }) => f.uid).sort() };
          },
          { timeout: 60_000 },
        )
        .toEqual({ on: true, mic: { enabled: true, live: true }, far: others(uid) }),
    ),
  );
  // and heard: the fake mic's beep reaches each of them from both others —
  // sound, not the trickle a silent line sends (~1 KB/s; speech is ~10)
  const bytesIn = () =>
    Promise.all(each.map(([p]) => p.evaluate(() => (window as any).__yutopia.phone.calls.heard()))) as Promise<
      Record<number, number>[]
    >;
  const b0 = await bytesIn();
  await page.waitForTimeout(4000);
  const b1 = await bytesIn();
  // (a count that went down started again: a voice resubscribed meanwhile)
  const grew = (a = 0, b = 0) => (b >= a ? b - a : b);
  for (const [i, [, uid]] of each.entries())
    for (const o of others(uid)) expect(grew(b0[i][o], b1[i][o]), `${uid} hears ${o}`).toBeGreaterThan(16_000);
  // the screen shows the other two
  await expect(page.locator("[data-call-people] [data-call-peer]")).toHaveCount(2);
  await shot(page, "phone-call-three");
  const hangup = (p: Page) => p.evaluate(() => (window as any).__yutopia.phone.calls.hangup());
  await hangup(page);
  // Ana's gone: Bia and Cai go on
  await bia.waitForTimeout(800);
  expect((await ph(bia))?.call?.phase).toBe("live");
  await hangup(bia);
  await expect.poll(async () => (await ph(cai))?.call?.phase ?? "none", { timeout: 10_000 }).not.toBe("live");
  await bia.close();
  await cai.close();
});

test("the camera: a selfie in iso and in 3D, saved to the Gallery", async ({ page }) => {
  const tok = await token(ANA);
  const space = await useWorld("demo");
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
  await loaded(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => (window as any).__yutopia.phone.camera.open("selfie"));
  await page.waitForTimeout(2000);
  await shot(page, "phone-selfie-3d");
  await page.evaluate(() => (window as any).__yutopia.phone.camera.setMode("photo"));
  await page.waitForTimeout(1500);
  await shot(page, "phone-photo-3d");
  await page.keyboard.press("Escape");
  await page.keyboard.press("t");
});

// A photo in a chat (docs/plan/37-the-gps.md § 2): + slides the latest photos
// up over the composer; one tap sends it, and the chat stays.
test("the photo tray: + shows the latest photos, a tap sends one, the chat stays", async ({ page, browser }) => {
  const space = await useWorld("demo");
  await enter(page, await token(ANA), space);
  const bia = await browser.newPage();
  await enter(bia, await token(BIA), space);
  for (const p of [page, bia])
    await p.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 20_000 });
  const biaUid = (await world(bia, (w) => w.myUid())) as number;
  const anaUid = (await world(page, (w) => w.myUid())) as number;
  await page.evaluate((u) => (window as any).__yutopia.phone.addContact(u), biaUid);
  await world(page, (w) => w.togglePhone(true));
  await page.waitForTimeout(2200);
  // a photo to send
  await page.evaluate(() => (window as any).__yutopia.phone.camera.open("photo"));
  await expect(page.locator("[data-shutter]")).toBeVisible();
  await page.waitForTimeout(800);
  const n0 = ((await ph(page)).photos ?? []).filter((x: { id: number }) => x.id > 0).length;
  await page.locator("[data-shutter]").click();
  await expect
    .poll(async () => ((await ph(page)).photos ?? []).filter((x: { id: number }) => x.id > 0).length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(n0);
  await page.evaluate(() => (window as any).__yutopia.phone.camera.close());
  // the chat with Bia, the tray (Ana's page in front: a page behind draws no
  // frames, and a click waits for one)
  await page.bringToFront();
  await page.evaluate((u) => (window as any).__yutopia.phone.openThreadWith([u]), biaUid);
  await expect(page.locator("[data-composer]")).toBeVisible();
  await page.locator("[data-photo-add]").click();
  await expect(page.locator("[data-photo-tray]")).toBeVisible();
  await expect(page.locator("[data-tray-photo]").first()).toBeVisible({ timeout: 10_000 });
  await shot(page, "phone-photo-tray");
  // Back closes the tray, not the chat
  await page.locator("[data-composer]").blur();
  await page.keyboard.press("Backspace");
  await expect(page.locator("[data-photo-tray]")).toHaveCount(0);
  await expect(page.locator("[data-composer]")).toBeVisible();
  // open it again and send the newest
  await page.locator("[data-photo-add]").click();
  const pick = page.locator("[data-tray-photo]").first();
  const pid = Number(await pick.getAttribute("data-tray-photo"));
  await pick.click();
  await expect(page.locator("[data-photo-tray]")).toHaveCount(0);
  // in the thread, from me, that photo; and still in the chat
  await expect
    .poll(
      () =>
        page.evaluate(
          ([pid, me]) =>
            Object.values((window as any).__phone.get().msgs as Record<number, any[]>)
              .flat()
              .some((m) => m.kind === "photo" && m.photo?.id === pid && m.from === me),
          [pid, anaUid],
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  expect((await ph(page)).stack.at(-1).app).toBe("messages");
  // and it reaches Bia (her phone peeks up)
  await expect(bia.locator("[data-phone-peek]")).toBeVisible({ timeout: 10_000 });
  await bia.close();
});

// Every screen, for the review sheet (only with YUTOPIA_SHOTS).
test("the phone's screens (shots)", async ({ page }) => {
  test.skip(!SHOTS, "review shots only");
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("demo"));
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

test("contacts are the people you add by id; a photo sent to you opens; a video call holds up", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const tokA = await token(ANA);
  const tokB = await token(BIA);
  const space = await useWorld("demo");
  await enter(page, tokA, space);
  const bia = await browser.newPage();
  const errors: string[] = [];
  for (const p of [page, bia]) p.on("pageerror", (e) => errors.push(e.message));
  await enter(bia, tokB, space);
  for (const p of [page, bia])
    await p.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 20_000 });
  const biaUid = (await world(bia, (w) => w.myUid())) as number;
  const anaUid = (await world(page, (w) => w.myUid())) as number;

  // Ana's Settings show her id; Bia removes her, then adds her back by typing it
  await world(page, (w) => w.togglePhone(true));
  await page.waitForTimeout(2300);
  await page.evaluate(() => (window as any).__phone.set({ stack: [{ app: "home" }, { app: "settings" }], sel: 0 }));
  await expect(page.locator(`[data-my-id="${anaUid}"]`)).toBeVisible();
  await bia.evaluate((u) => (window as any).__yutopia.phone.removeContact(u), anaUid);
  await world(bia, (w) => w.togglePhone(true));
  await bia.waitForTimeout(2300);
  await bia.evaluate(() => (window as any).__phone.set({ stack: [{ app: "home" }, { app: "contacts" }], sel: 0 }));
  await bia.locator("[data-add-contact]").click();
  await bia.locator("[data-contact-id]").fill(String(anaUid));
  await bia.keyboard.press("Enter");
  await bia.locator("[data-contact-add]").click();
  await expect
    .poll(() => bia.evaluate(() => (window as any).__phone.get().contacts.map((c: any) => c.uid)))
    .toContain(anaUid);
  await page.evaluate((u) => (window as any).__yutopia.phone.addContact(u), biaUid);

  // Ana takes a photo and sends it to Bia; Bia opens it from the thread (not a black screen) and keeps it
  await page.evaluate(() => (window as any).__yutopia.phone.camera.open("photo"));
  await page.waitForTimeout(1200);
  const n0 = (await page.evaluate(() => (window as any).__phone.get().photos.length)) as number;
  await page.locator("[data-shutter]").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__phone.get().photos.length), { timeout: 15_000 })
    .toBeGreaterThan(n0);
  await page.keyboard.press("Escape");
  const photoId = (await page.evaluate(
    () => (window as any).__phone.get().photos.find((p: any) => p.id > 0).id,
  )) as number;
  await page.evaluate(
    async ([u, pid]) => {
      const ph = (window as any).__yutopia.phone;
      await ph.openThreadWith([u]);
      const t = (window as any).__phone.get().threads.find((x: any) => x.kind === "direct" && x.members[0] === u);
      await ph.send(t.id, "", { photoId: pid });
    },
    [biaUid, photoId],
  );
  await bia.evaluate((u) => (window as any).__yutopia.phone.openThreadWith([u]), anaUid);
  await bia.locator("[data-photo-msg]").last().click();
  await expect(bia.locator(`[data-photo-view="${photoId}"] img`)).toBeVisible();
  if (SHOTS) await bia.screenshot({ path: `${SHOTS}/phone-received-photo.png` });

  // a video call: answered, both pictures up, no crash, hung up
  await page.evaluate((u) => (window as any).__yutopia.phone.calls.start([u], true), biaUid);
  await expect(bia.locator("[data-call-answer]")).toBeVisible({ timeout: 10_000 });
  await bia.locator("[data-call-answer]").click();
  await expect(page.locator("[data-video-call]")).toBeVisible({ timeout: 15_000 });
  await expect(bia.locator("[data-video-call]")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(4000);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-video-call.png` });
  // the camera off and on again (where it used to crash)
  await page.locator("[data-video-call] button[aria-label='Camera']").click();
  await page.waitForTimeout(800);
  await page.locator("[data-video-call] button[aria-label='Camera']").click();
  await page.waitForTimeout(1500);
  await expect(page.locator("[data-video-call]")).toBeVisible();
  await page.locator("[data-call-end]").first().click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__phone.get().call?.phase ?? "none"), { timeout: 10_000 })
    .not.toBe("live");
  expect(errors.filter((e) => !/ResizeObserver/.test(e))).toEqual([]);
  await bia.close();
});

test("the camera records a video into the Gallery; others see the red light", async ({ page }) => {
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("demo"));
  await page.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 20_000 });
  await world(page, (w) => w.togglePhone(true));
  await page.waitForTimeout(2300);
  await page.evaluate(() => (window as any).__yutopia.phone.camera.open("selfie"));
  await page.locator("[data-video-mode]").click();
  const v0 = (await page.evaluate(
    () => (window as any).__phone.get().photos.filter((p: any) => p.kind === "video").length,
  )) as number;
  await page.locator("[data-shutter]").click();
  await expect(page.locator("[data-rec]")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = (window as any).__yutopia;
        return w.room.state.players.get(w.room.sessionId).recording;
      }),
    )
    .toBe(true);
  await page.waitForTimeout(3500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-recording.png` });
  await page.locator("[data-shutter]").click();
  await expect
    .poll(
      () => page.evaluate(() => (window as any).__phone.get().photos.filter((p: any) => p.kind === "video").length),
      {
        timeout: 20_000,
      },
    )
    .toBeGreaterThan(v0);
  const v = await page.evaluate(() => (window as any).__phone.get().photos.find((p: any) => p.kind === "video"));
  expect(v.secs).toBeGreaterThanOrEqual(2);
  // it plays in the viewer
  await page.keyboard.press("Escape");
  await page.evaluate((p) => (window as any).__yutopia.phone.viewPhoto(p), v);
  await expect(page.locator(`[data-photo-view="${v.id}"] video`)).toBeVisible();
  await page.waitForFunction(
    (id) => {
      const el = document.querySelector(`[data-photo-view="${id}"] video`) as HTMLVideoElement | null;
      return !!el && el.readyState >= 2;
    },
    v.id,
    { timeout: 15_000 },
  );
  if (SHOTS) await page.locator("[data-phone-open]").screenshot({ path: `${SHOTS}/phone-video-view.png` });
});
