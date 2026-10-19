/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page, request } from "@playwright/test";
import { ANA, API, BIA, enter, test, token, useWorld, walkTo } from "./helpers";

// The game room, end to end (docs/plan/09-game-room.md): Ana puts a TV and an
// 8-bit console in the Lab, plugs it in, puts our test cartridge in (light blue;
// red while pad 1 holds A, green while pad 2 does) and turns it on — the game
// runs in her browser and her TV goes out through LiveKit. Bia, across the room,
// sees it on the TV; she walks up, takes pad 2, presses A: green, on both
// screens. Ana leaves: paused; Bia carries on from the last save.
const SHOTS = process.env.YUTOPIA_SHOTS;

// the middle of a picture, sampled (r,g,b)
const colourOf = (page: Page, which: "tv" | "host", id: string) =>
  page.evaluate(
    ([w, i]) => {
      const y = (window as any).__yutopia;
      const src: HTMLVideoElement | HTMLCanvasElement | undefined =
        w === "tv" ? y.tvVideos.get(`tv-${i}`) : y.games?.hosting?.canvas;
      if (!src) return "none";
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 12;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      g.drawImage(src, 0, 0, 16, 12);
      return Array.from(g.getImageData(8, 6, 1, 1).data.slice(0, 3)).join(",");
    },
    [which, id] as const,
  );
const hue = (rgb: string) => {
  const [r, g, b] = rgb.split(",").map(Number);
  if (Number.isNaN(r)) return "none";
  if (r > 150 && g < 100 && b < 100) return "red";
  if (g > 120 && r < 100 && b < 100) return "green";
  if (b > 180 && g > 140 && r < 140) return "blue";
  return `other(${rgb})`;
};
// From the console's panel: its cable into my hands, over to the TV's front,
// X there; then back to the console, its panel open again.
async function plugIn(page: Page, consoleId: string, front: { x: number; y: number }, back: { x: number; y: number }) {
  await page.getByRole("button", { name: "Take the cable" }).click();
  await expect(page.getByText("Console cable")).toBeVisible();
  await walkTo(page, front.x, front.y, 25_000);
  await expect.poll(() => page.evaluate(() => (window as any).__hud.get().prompt?.kind)).toBe("plug");
  await page.keyboard.press("x");
  await expect(page.getByText("Console cable")).toBeHidden({ timeout: 10_000 });
  await walkTo(page, back.x, back.y, 25_000);
  await page.evaluate((id) => (window as any).__hud.set({ panel: { kind: "console", objectId: id } }), consoleId);
  await expect(page.getByText("Plugged into the TV")).toBeVisible();
}

const consoleState = (page: Page, id: string) =>
  page.evaluate((i) => {
    const c = (window as any).__yutopia.room.state.consoles.get(i);
    return c ? { host: c.hostName as string, live: c.live as boolean, p2: c.p2Name as string } : null;
  }, id);

test("game room: plug in, cartridge, on — everyone sees the TV, pad 2 plays, carry on", async ({ browser }) => {
  test.setTimeout(300_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const ctx = { viewport: { width: 1280, height: 800 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  const stamp = Date.now().toString(36);
  const tvId = `e2e-tv-${stamp}`;
  const conId = `e2e-nes-${stamp}`;
  try {
    const s = await useWorld("lab");
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    // a TV and, two tiles in front of it, the console (the server says no to a bad spot)
    const sp = await ana.evaluate(() => (window as any).__yutopia.map.spawn);
    let T: { x: number; y: number } | null = null;
    for (const [dx, dy] of [
      [-2, -6],
      [1, -6],
      [-6, -5],
      [3, 2],
      [-6, 2],
    ]) {
      const p = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
      for (const o of [
        { id: tvId, kind: "crt_tv", x: p.x, y: p.y, rot: 0 },
        { id: conId, kind: "console_nes", x: p.x + 1, y: p.y + 2, rot: 0 },
      ])
        await ana.evaluate((q) => (window as any).__yutopia.send("obj:put", q), o);
      await ana.waitForTimeout(700);
      const ok = await ana.evaluate(
        ([a, b]) =>
          !!(window as any).__yutopia.room.state.objects.get(a) &&
          !!(window as any).__yutopia.room.state.objects.get(b),
        [tvId, conId] as const,
      );
      if (ok) {
        T = p;
        break;
      }
      await ana.evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), [tvId, conId]);
    }
    expect(T, "room for the TV and the console").not.toBeNull();
    const at = T as { x: number; y: number };

    // Ana walks up and opens the console
    await walkTo(ana, at.x + 1.5, at.y + 3.6, 25_000);
    await ana.waitForFunction(() => !!(window as any).__yutopia.games, null, { timeout: 15_000 });
    await ana.evaluate((id) => (window as any).__hud.set({ panel: { kind: "console", objectId: id } }), conId);
    // the cable into her hands (the panel closes), over to the TV, X there
    await plugIn(ana, conId, { x: at.x + 1, y: at.y + 1.5 }, { x: at.x + 1.5, y: at.y + 3.6 });
    await ana.getByRole("button", { name: "Insert a cartridge" }).click();
    const card = ana.locator("li", { hasText: "Test Card" }).filter({ hasText: "8-bit" });
    await card.getByRole("button", { name: "▶" }).click();
    await expect(ana.getByText("Test Card", { exact: true })).toBeVisible();
    await ana.getByRole("button", { name: /^⏻ Turn on/ }).click();
    // the game runs at Ana's (light blue), the TV goes out
    await expect.poll(() => consoleState(bia, conId).then((c) => c?.host)).toBe("Ana Demo");
    await expect.poll(async () => hue(await colourOf(ana, "host", conId)), { timeout: 90_000 }).toBe("blue");
    await expect.poll(() => consoleState(bia, conId).then((c) => c?.live), { timeout: 20_000 }).toBe(true);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/games-host.png` });

    // Bia, across the room, sees it on the TV
    await expect.poll(async () => hue(await colourOf(bia, "tv", conId)), { timeout: 25_000 }).toBe("blue");
    const hearsTv = () => bia.evaluate((i) => (window as any).__yutopia.media.voices.has(`tv-${i}`), conId);

    if (SHOTS) {
      await bia.evaluate((p) => (window as any).__yutopia.engine.pinCamera({ x: p.x + 1, y: p.y + 1, zoom: 2.4 }), at);
      await bia.waitForTimeout(600);
      await bia.screenshot({ path: `${SHOTS}/games-watching.png` });
      await bia.evaluate(() => (window as any).__yutopia.engine.pinCamera(null));
    }
    // Ana presses A on pad 1: red
    await ana.keyboard.down("KeyX");
    await expect.poll(async () => hue(await colourOf(ana, "host", conId))).toBe("red");
    await ana.keyboard.up("KeyX");

    // Bia walks up, takes pad 2, presses A: green — at Ana's and on Bia's TV
    await walkTo(bia, at.x + 2.5, at.y + 3.6, 25_000);
    // its sound comes through too (in earshot: the Lab is one open studio)
    await expect.poll(hearsTv, { timeout: 15_000 }).toBe(true);
    // …and it really plays: the test card's tone arrives as audio
    const audioIn = () =>
      bia.evaluate(async (i) => {
        const p = (window as any).__yutopia.media.room.remoteParticipants.get(`tv-${i}`);
        let n = 0;
        for (const pub of p?.trackPublications.values() ?? []) {
          if (pub.kind !== "audio" || !pub.track?.receiver) continue;
          (await pub.track.receiver.getStats()).forEach((x: any) => {
            if (x.type === "inbound-rtp") n += x.bytesReceived ?? 0;
          });
        }
        return n;
      }, conId);
    const heard = await audioIn();
    await expect.poll(async () => (await audioIn()) - heard, { timeout: 10_000 }).toBeGreaterThan(2000);
    await bia.evaluate((id) => (window as any).__hud.set({ panel: { kind: "console", objectId: id } }), conId);
    await bia.getByRole("button", { name: "Take pad 2" }).click();
    await expect.poll(() => consoleState(ana, conId).then((c) => c?.p2)).toBe("Bia Demo");
    await bia.keyboard.down("KeyX");
    await expect.poll(async () => hue(await colourOf(ana, "host", conId))).toBe("green");
    await expect.poll(async () => hue(await colourOf(bia, "tv", conId)), { timeout: 10_000 }).toBe("green");
    if (SHOTS) await bia.screenshot({ path: `${SHOTS}/games-player2.png` });
    await bia.keyboard.up("KeyX");
    // both shown with a pad in hand
    await expect
      .poll(() =>
        bia.evaluate(() => {
          const w = (window as any).__yutopia;
          return [...w.room.state.players.values()].filter((p: any) => p.busy === "gamepad").length;
        }),
      )
      .toBe(2);

    // Ana saves and leaves: paused; Bia carries on from the save, now running it
    await ana.getByRole("button", { name: /Save now/ }).click();
    await ana.waitForTimeout(1500);
    await ana.close();
    await expect.poll(() => consoleState(bia, conId).then((c) => c?.host), { timeout: 8000 }).toBe("");
    await bia.getByRole("button", { name: /Carry on/ }).click();
    await expect.poll(() => consoleState(bia, conId).then((c) => c?.host)).toBe("Bia Demo");
    await expect.poll(async () => hue(await colourOf(bia, "host", conId)), { timeout: 20_000 }).toBe("blue");
    await bia.getByRole("button", { name: /Turn off/ }).click();
    await expect.poll(() => consoleState(bia, conId)).toBeNull();
  } finally {
    // (Ana builds; Bia can't take things away)
    const clean = await (await browser.newContext()).newPage();
    await enter(clean, ta, await useWorld("lab"));
    await clean.evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), [tvId, conId]);
    await clean.waitForTimeout(800);
  }
});

// Bring your own cartridge (the library, G5): Ana uploads one (our test card
// under another name), plays it, saves, turns it off; back in a new session the
// console offers to turn on where it was left, and does so from the save state.
test("bring your cartridge: upload, play, save, come back and carry on", async ({ browser }) => {
  test.setTimeout(240_000);
  const ta = await token(ANA);
  const s = await useWorld("lab");
  const stamp = Date.now().toString(36);
  const tvId = `e2e-tv-${stamp}`;
  const conId = `e2e-nes-${stamp}`;
  const title = `My Cart ${stamp}`;
  let page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  try {
    await enter(page, ta, s);
    const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
    const p = { x: Math.floor(sp.x) - 2, y: Math.floor(sp.y) - 6 };
    for (const o of [
      { id: tvId, kind: "crt_tv", x: p.x, y: p.y, rot: 0 },
      { id: conId, kind: "console_nes", x: p.x + 1, y: p.y + 2, rot: 0 },
    ])
      await page.evaluate((q) => (window as any).__yutopia.send("obj:put", q), o);
    await expect
      .poll(() => page.evaluate((i) => !!(window as any).__yutopia.room.state.objects.get(i), conId))
      .toBe(true);
    await walkTo(page, p.x + 1.5, p.y + 3.6, 25_000);
    await page.waitForFunction(() => !!(window as any).__yutopia.games, null, { timeout: 15_000 });
    const open = () =>
      page.evaluate((id) => (window as any).__hud.set({ panel: { kind: "console", objectId: id } }), conId);
    await open();
    await plugIn(page, conId, { x: p.x + 1, y: p.y + 1.5 }, { x: p.x + 1.5, y: p.y + 3.6 });
    await page.getByRole("button", { name: "Insert a cartridge" }).click();
    // bring one: the file, a title
    await page.getByText("Bring your cartridge").click();
    await page.locator("input[type=file]").setInputFiles({
      name: "my-cart.nes",
      mimeType: "application/octet-stream",
      buffer: (await page.request.get("/emu/test/colors.nes").then((r) => r.body())) as Buffer,
    });
    await page.locator("input[maxlength='60']").fill(title);
    await page.getByRole("button", { name: "Put it on the shelf" }).click();
    const mine = page.locator("li", { hasText: title });
    await expect(mine).toBeVisible({ timeout: 10_000 });
    await mine.getByRole("button", { name: "▶" }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^⏻ Turn on/ }).click();
    await expect.poll(async () => hue(await colourOf(page, "host", conId)), { timeout: 20_000 }).toBe("blue");
    await page.getByRole("button", { name: /Save now/ }).click();
    await expect(page.getByText(/Saved —/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Turn off/ }).click();
    await expect.poll(() => consoleState(page, conId)).toBeNull();

    // a new session: it offers to carry on, and loads the save state
    await page.close();
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await enter(page, ta, s);
    await walkTo(page, p.x + 1.5, p.y + 3.6, 25_000);
    await page.waitForFunction(() => !!(window as any).__yutopia.games, null, { timeout: 15_000 });
    await open();
    const stateLoaded = page.waitForResponse((r) => /\/saves\/u:\d+\/state$/.test(r.url()) && r.status() === 200, {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /where it was left/ }).click();
    await stateLoaded;
    await expect.poll(async () => hue(await colourOf(page, "host", conId)), { timeout: 20_000 }).toBe("blue");
    await page.getByRole("button", { name: /Turn off/ }).click();
    await expect.poll(() => consoleState(page, conId)).toBeNull();
  } finally {
    await page
      .evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), [tvId, conId])
      .catch(() => {});
    // take the cartridge back off the shelf
    const api = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${ta}`, Accept: "application/json" },
    });
    const list = await (await api.get(`${API}/api/games`)).json();
    for (const g of list.games ?? [])
      if (g.title === title) await api.delete(`${API}/api/games/${String(g.id).slice(2)}`);
    await api.dispose();
    await page.waitForTimeout(500).catch(() => {});
  }
});

// On a phone: the panel puts a touch pad under the picture; holding its A
// reaches the game like a key would.
test("phone: the touch pad plays", async ({ browser }) => {
  test.setTimeout(180_000);
  const ta = await token(ANA);
  const s = await useWorld("lab");
  const page = await (
    await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  ).newPage();
  const stamp = Date.now().toString(36);
  const ids = [`e2e-tv-${stamp}`, `e2e-nes-${stamp}`];
  try {
    await enter(page, ta, s);
    const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
    const p = { x: Math.floor(sp.x) - 2, y: Math.floor(sp.y) - 6 };
    await page.evaluate((q) => (window as any).__yutopia.send("obj:put", q), {
      id: ids[0],
      kind: "crt_tv",
      x: p.x,
      y: p.y,
      rot: 0,
    });
    await page.evaluate((q) => (window as any).__yutopia.send("obj:put", q), {
      id: ids[1],
      kind: "console_nes",
      x: p.x + 1,
      y: p.y + 2,
      rot: 0,
    });
    await expect
      .poll(() => page.evaluate((i) => !!(window as any).__yutopia.room.state.objects.get(i), ids[1]))
      .toBe(true);
    await walkTo(page, p.x + 1.5, p.y + 3.6, 25_000);
    await page.waitForFunction(() => !!(window as any).__yutopia.games, null, { timeout: 15_000 });
    await page.evaluate((id) => (window as any).__hud.set({ panel: { kind: "console", objectId: id } }), ids[1]);
    await plugIn(page, ids[1], { x: p.x + 1, y: p.y + 1.5 }, { x: p.x + 1.5, y: p.y + 3.6 });
    await page.getByRole("button", { name: "Insert a cartridge" }).click();
    await page
      .locator("li", { hasText: "Test Card" })
      .filter({ hasText: "8-bit" })
      .getByRole("button", { name: "▶" })
      .click();
    await page.getByRole("button", { name: /^⏻ Turn on/ }).click();
    await expect.poll(async () => hue(await colourOf(page, "host", ids[1])), { timeout: 20_000 }).toBe("blue");
    const a = page.getByRole("button", { name: "A", exact: true });
    await a.dispatchEvent("pointerdown", { pointerId: 1 });
    await expect.poll(async () => hue(await colourOf(page, "host", ids[1]))).toBe("red");
    await a.dispatchEvent("pointerup", { pointerId: 1 });
    await expect.poll(async () => hue(await colourOf(page, "host", ids[1]))).toBe("blue");
    await page.getByRole("button", { name: /Turn off/ }).click();
  } finally {
    await page.evaluate((x) => (window as any).__yutopia.send("obj:removeMany", { ids: x }), ids).catch(() => {});
    await page.waitForTimeout(600).catch(() => {});
  }
});

test("a Console TV takes a console too: the cable, the game on its glass, back to its TV input", async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  const stamp = Date.now().toString(36);
  const tvId = `e2e-ctv-${stamp}`;
  const conId = `e2e-cnes-${stamp}`;
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  let T: { x: number; y: number } | null = null;
  for (const [dx, dy] of [
    [-2, -6],
    [1, -6],
    [-6, -5],
    [3, 2],
    [-6, 2],
  ]) {
    const p = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
    for (const o of [
      { id: tvId, kind: "tv_console", x: p.x, y: p.y, rot: 0 },
      { id: conId, kind: "console_nes", x: p.x + 1, y: p.y + 2, rot: 0 },
    ])
      await page.evaluate((q) => (window as any).__yutopia.send("obj:put", q), o);
    await page.waitForTimeout(700);
    const ok = await page.evaluate(
      ([a, b]) =>
        !!(window as any).__yutopia.room.state.objects.get(a) && !!(window as any).__yutopia.room.state.objects.get(b),
      [tvId, conId] as const,
    );
    if (ok) {
      T = p;
      break;
    }
    await page.evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), [tvId, conId]);
  }
  expect(T, "room for the TV and the console").not.toBeNull();
  const at = T as { x: number; y: number };
  const input = () => page.evaluate((i) => (window as any).__yutopia.engine.getObject(i)?.props?.input ?? "", tvId);
  const onGlass = () =>
    page.evaluate((i) => ((window as any).__yutopia.games?.pictures() ?? []).some((p: any) => p.def.id === i), tvId);
  try {
    await walkTo(page, at.x + 1.5, at.y + 3.6, 25_000);
    await page.waitForFunction(() => !!(window as any).__yutopia.games, null, { timeout: 15_000 });
    await page.evaluate((id) => (window as any).__hud.set({ panel: { kind: "console", objectId: id } }), conId);
    await plugIn(page, conId, { x: at.x + 1, y: at.y + 1.5 }, { x: at.x + 1.5, y: at.y + 3.6 });
    expect(await input()).toBe(conId);
    await page.getByRole("button", { name: "Insert a cartridge" }).click();
    await page
      .locator("li", { hasText: "Test Card" })
      .filter({ hasText: "8-bit" })
      .getByRole("button", { name: "▶" })
      .click();
    await page.getByRole("button", { name: /^⏻ Turn on/ }).click();
    await expect.poll(async () => hue(await colourOf(page, "host", conId)), { timeout: 20_000 }).toBe("blue");
    await expect.poll(onGlass).toBe(true);
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
    if (SHOTS) {
      await page.evaluate((p) => (window as any).__yutopia.engine.pinCamera({ x: p.x + 1, y: p.y + 1, zoom: 2.4 }), at);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOTS}/games-console-tv.png` });
      await page.evaluate(() => (window as any).__yutopia.engine.pinCamera(null));
    }
    // its own panel now: the inputs (AV1, the TV input), and back to YouTube / Jellyfin
    await walkTo(page, at.x + 1, at.y + 1.5, 25_000);
    await page.evaluate((id) => (window as any).__yutopia.activateObject(id, false), tvId);
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().panel.kind)).toBe("tv");
    await page.getByRole("button", { name: /^TV · YouTube/ }).click();
    await expect.poll(input).toBe("media");
    await expect.poll(onGlass).toBe(false);
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
  } finally {
    await page.evaluate((id) => (window as any).__yutopia.send("game:power", { id, on: false }), conId).catch(() => {});
    await page.evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), [tvId, conId]);
    await page.waitForTimeout(600);
  }
});

test("two games at once: one each, both TVs live for everyone; a second of mine pauses my first", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const ctx = { viewport: { width: 1280, height: 800 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  const stamp = Date.now().toString(36);
  const [tvA, conA, tvB, conB] = ["tvA", "conA", "tvB", "conB"].map((k) => `e2e-2g-${k}-${stamp}`);
  try {
    const s = await useWorld("lab");
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    const sp = await ana.evaluate(() => (window as any).__yutopia.map.spawn);
    let T: { x: number; y: number } | null = null;
    for (const [dx, dy] of [
      [-2, -6],
      [-6, -5],
      [-6, 2],
      [1, 2],
    ]) {
      const p = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
      for (const o of [
        { id: tvA, kind: "crt_tv", x: p.x, y: p.y, rot: 0 },
        { id: conA, kind: "console_nes", x: p.x + 1, y: p.y + 2, rot: 0 },
        { id: tvB, kind: "crt_tv", x: p.x + 4, y: p.y, rot: 0 },
        { id: conB, kind: "console_nes", x: p.x + 5, y: p.y + 2, rot: 0 },
      ])
        await ana.evaluate((q) => (window as any).__yutopia.send("obj:put", q), o);
      await ana.waitForTimeout(800);
      const ok = await ana.evaluate(
        (ids) => ids.every((i: string) => !!(window as any).__yutopia.room.state.objects.get(i)),
        [tvA, conA, tvB, conB],
      );
      if (ok) {
        T = p;
        break;
      }
      await ana.evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), [tvA, conA, tvB, conB]);
    }
    expect(T, "room for two TVs and two consoles").not.toBeNull();
    const at = T as { x: number; y: number };
    // each plugs one in (at its TV), puts the test card in and turns it on (at the console)
    const setUp = async (page: Page, con: string, tv: string, dx: number) => {
      await walkTo(page, at.x + dx + 1, at.y + 1.5, 25_000);
      await page.evaluate(([c, t]) => (window as any).__yutopia.send("game:plug", { id: c, tv: t }), [con, tv]);
      await walkTo(page, at.x + dx + 1.5, at.y + 3.6, 25_000);
      await page.evaluate((id) => (window as any).__yutopia.send("game:cart", { id, game: "b:testcard-nes" }), con);
      await page.waitForTimeout(600);
      await page.evaluate((id) => (window as any).__yutopia.send("game:power", { id, on: true }), con);
    };
    await setUp(ana, conA, tvA, 0);
    await setUp(bia, conB, tvB, 4);
    await expect.poll(() => consoleState(bia, conA).then((c) => c?.host)).toBe("Ana Demo");
    await expect.poll(() => consoleState(ana, conB).then((c) => c?.host)).toBe("Bia Demo");
    await expect.poll(async () => hue(await colourOf(ana, "host", conA)), { timeout: 30_000 }).toBe("blue");
    await expect.poll(async () => hue(await colourOf(bia, "host", conB)), { timeout: 30_000 }).toBe("blue");
    // both TVs live: each sees the other's
    await expect.poll(async () => hue(await colourOf(ana, "tv", conB)), { timeout: 30_000 }).toBe("blue");
    await expect.poll(async () => hue(await colourOf(bia, "tv", conA)), { timeout: 30_000 }).toBe("blue");

    // Bia turns hers off; Ana turns it on again herself: her first one pauses
    await bia.evaluate((id) => (window as any).__yutopia.send("game:power", { id, on: false }), conB);
    await expect.poll(() => consoleState(ana, conB)).toBeNull();
    await walkTo(ana, at.x + 4.5, at.y + 3.6, 25_000);
    await ana.evaluate((id) => (window as any).__yutopia.send("game:power", { id, on: true }), conB);
    await expect(ana.getByText(/paused: you run one game at a time/)).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => consoleState(bia, conA).then((c) => c?.host)).toBe("");
    await expect
      .poll(() => ana.evaluate(() => (window as any).__yutopia.games?.hosting?.id), { timeout: 20_000 })
      .toBe(conB);
    // (her tab lets the first go, then boots the second: slow on a busy test machine)
    await expect.poll(async () => hue(await colourOf(ana, "host", conB)), { timeout: 90_000 }).toBe("blue");
    await expect.poll(async () => hue(await colourOf(bia, "tv", conB)), { timeout: 60_000 }).toBe("blue");
  } finally {
    for (const id of [conA, conB])
      await ana.evaluate((i) => (window as any).__yutopia.send("game:power", { id: i, on: false }), id).catch(() => {});
    await ana
      .evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), [tvA, conA, tvB, conB])
      .catch(() => {});
    await ana.waitForTimeout(800).catch(() => {});
  }
});
