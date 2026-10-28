/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page, request } from "@playwright/test";
import { ANA, API, BIA, enter, test, token, useWorld, walkTo } from "./helpers";

// The disc console, played (docs/plan/23-disc-console.md P3). Ana puts a TV and
// the grey disc console in the Lab, plugs it in and puts our test disc in (the
// lid goes up and down). The space has no BIOS: it won't turn on until she
// brings one (the dev stack's Test BIOS, YUTOPIA_TEST_BIOS_MD5 in the API's .env —
// with it the core boots its stand-in, HLE; a real BIOS would boot itself).
// On: the test card's colour bars at hers and on Bia's TV; ✕ on pad 1 turns it
// red; Bia takes pad 2, ✕: green on both. Saved and off: the memory card and a
// state are in the API; a new session turns on where it was left.
const SHOTS = process.env.YUTOPIA_SHOTS;

// the picture's left side (the test card's second bar: yellow), sampled
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
      return Array.from(g.getImageData(2, 6, 1, 1).data.slice(0, 3)).join(",");
    },
    [which, id] as const,
  );
const hue = (rgb: string) => {
  const [r, g, b] = rgb.split(",").map(Number);
  if (Number.isNaN(r)) return "none";
  if (r > 150 && g > 150 && b < 100) return "bars"; // (yellow)
  if (r > 150 && g < 100 && b < 100) return "red";
  if (g > 150 && r < 100 && b < 100) return "green";
  return `other(${rgb})`;
};
const consoleState = (page: Page, id: string) =>
  page.evaluate((i) => {
    const c = (window as any).__yutopia.room.state.consoles.get(i);
    return c ? { host: c.hostName as string, live: c.live as boolean, p2: c.p2Name as string } : null;
  }, id);
const propsOf = (page: Page, id: string) =>
  page.evaluate((i) => JSON.parse((window as any).__yutopia.room.state.objects.get(i)?.props ?? "{}"), id);

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

const api = async (tok: string) =>
  request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Authorization: `Bearer ${tok}`, Accept: "application/json" },
  });
async function dropTestBios(tok: string) {
  const c = await api(tok);
  const bios = (await (await c.get(`/api/bios`)).json()).bios ?? [];
  for (const b of bios.filter((x: any) => x.model === "Test BIOS")) await c.delete(`/api/bios/${b.id}`);
  await c.dispose();
}

test("disc console: plug in, a disc, the BIOS gate, play for everyone, pads, save and carry on", async ({
  browser,
}) => {
  test.setTimeout(360_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const s = await useWorld("lab");
  await dropTestBios(ta);
  const ctx = { viewport: { width: 1280, height: 800 } };
  let ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  const stamp = Date.now().toString(36);
  const tvId = `e2e-tv-${stamp}`;
  const conId = `e2e-ps1-${stamp}`;
  try {
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    // a TV and, two tiles in front of it, the console — on free ground
    const sp = await ana.evaluate(() => (window as any).__yutopia.map.spawn);
    let T: { x: number; y: number } | null = null;
    for (const [dx, dy] of [
      [-2, -6],
      [1, -6],
      [-6, -5],
      [3, 2],
      [-6, 2],
      [-9, -6],
      [5, -6],
      [8, -6],
      [-12, -6],
      [8, -12],
      [-6, -12],
      [2, -12],
    ]) {
      const p = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
      const busy = await ana.evaluate(
        (a) =>
          (window as any).__yutopia.model
            .allObjects()
            .some((o: any) => o.x >= a.x - 1 && o.x <= a.x + 2 && o.y >= a.y - 1 && o.y <= a.y + 3),
        p,
      );
      if (busy) continue;
      for (const o of [
        { id: tvId, kind: "crt_tv", x: p.x, y: p.y, rot: 0 },
        { id: conId, kind: "console_ps1", x: p.x + 1, y: p.y + 2, rot: 0 },
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
    const open = (page: Page) =>
      page.evaluate((id) => (window as any).__hud.set({ panel: { kind: "console", objectId: id } }), conId);

    await walkTo(ana, at.x + 1.5, at.y + 3.6, 25_000);
    await ana.waitForFunction(() => !!(window as any).__yutopia.games, null, { timeout: 15_000 });
    await open(ana);
    await plugIn(ana, conId, { x: at.x + 1, y: at.y + 1.5 }, { x: at.x + 1.5, y: at.y + 3.6 });

    // the test disc in: the lid goes up, then down
    await ana.getByRole("button", { name: "Insert a disc" }).click();
    await expect(ana.getByRole("heading", { name: "PICK A DISC" })).toBeVisible();
    await ana.locator("li", { hasText: "Test Card" }).getByRole("button", { name: "▶" }).click();
    await expect.poll(() => propsOf(ana, conId).then((p) => p.lid)).toBe("open");
    await expect
      .poll(() => propsOf(ana, conId).then((p) => `${p.cart}|${p.lid}`), { timeout: 5000 })
      .toBe("b:testcard-ps1|closed");

    // no BIOS in the space: it won't turn on, and says why — unless someone
    // brought a real one to the Lab (theirs: it stays; the gate isn't checked then)
    const power = ana.getByRole("button", { name: /^⏻ Turn on/ });
    const ca = await api(ta);
    const real = ((await (await ca.get(`/api/bios`)).json()).bios ?? []).some((b: any) => b.model !== "Test BIOS");
    await ca.dispose();
    if (real)
      test.info().annotations.push({ type: "skipped part", description: "the Lab has a real BIOS: no gate to check" });
    else {
      await expect(ana.getByText("This console needs its BIOS")).toBeVisible();
      await expect(power).toBeDisabled();
      if (SHOTS) await ana.screenshot({ path: `${SHOTS}/console-needs-bios.png` });
      const said = ana.waitForResponse((r) => r.request().method() === "POST" && /\/bios$/.test(r.url()));
      await ana.getByTestId("bios-file").setInputFiles({
        name: "scph5501.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(512 * 1024, 0x42),
      });
      expect((await said).status()).toBe(201);
    }
    await expect(power).toBeEnabled({ timeout: 10_000 });

    // on: the bars at Ana's, the TV out to everyone
    await power.click();
    await expect.poll(() => consoleState(bia, conId).then((c) => c?.host)).toBe("Ana Demo");
    await expect.poll(async () => hue(await colourOf(ana, "host", conId)), { timeout: 90_000 }).toBe("bars");
    await expect.poll(() => consoleState(bia, conId).then((c) => c?.live), { timeout: 20_000 }).toBe(true);
    await expect.poll(async () => hue(await colourOf(bia, "tv", conId)), { timeout: 25_000 }).toBe("bars");
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/console-playing.png` });

    // ✕ on pad 1 (X): red
    await ana.keyboard.down("KeyX");
    await expect.poll(async () => hue(await colourOf(ana, "host", conId))).toBe("red");
    await ana.keyboard.up("KeyX");
    await expect.poll(async () => hue(await colourOf(ana, "host", conId))).toBe("bars");

    // Bia takes pad 2, ✕: green at Ana's and on Bia's TV
    await walkTo(bia, at.x + 2.5, at.y + 3.6, 25_000);
    await open(bia);
    await bia.getByRole("button", { name: "Take pad 2" }).click();
    await expect.poll(() => consoleState(ana, conId).then((c) => c?.p2)).toBe("Bia Demo");
    await bia.keyboard.down("KeyX");
    await expect.poll(async () => hue(await colourOf(ana, "host", conId))).toBe("green");
    await expect.poll(async () => hue(await colourOf(bia, "tv", conId)), { timeout: 10_000 }).toBe("green");
    if (SHOTS) {
      await bia.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
      // over their shoulders, the TV ahead
      for (const [name, v] of [
        ["console-3d-players", { yaw: -Math.PI / 2, pitch: 0.42, dist: 2.6 }],
        ["console-3d-pads", { yaw: Math.PI / 2 + 0.3, pitch: 0.55, dist: 1.5 }],
      ] as const) {
        await bia.evaluate((c) => Object.assign((window as any).__yutopia.tp, c), v);
        await bia.waitForTimeout(1500);
        await bia.screenshot({ path: `${SHOTS}/${name}.png` });
      }
    }
    await bia.keyboard.up("KeyX");

    // saved and off: the memory card and a state are in the API
    await ana.getByRole("button", { name: /Save now/ }).click();
    await expect(ana.getByText(/Saved —/)).toBeVisible({ timeout: 10_000 });
    await ana.getByRole("button", { name: /Turn off/ }).click();
    await expect.poll(() => consoleState(ana, conId)).toBeNull();
    const c = await api(ta);
    const saves = await (await c.get(`/api/saves/b:testcard-ps1`)).json();
    expect(saves).toMatchObject({ state: true, sram: true });
    const card = await c.get(`/api/saves/b:testcard-ps1/sram`);
    expect((await card.body()).length, "the memory card").toBe(128 * 1024);
    await c.dispose();

    // a new session: it turns on where it was left (the state comes down)
    await ana.close();
    ana = await (await browser.newContext(ctx)).newPage();
    await enter(ana, ta, s);
    await walkTo(ana, at.x + 1.5, at.y + 3.6, 25_000);
    await ana.waitForFunction(() => !!(window as any).__yutopia.games, null, { timeout: 15_000 });
    await open(ana);
    const stateLoaded = ana.waitForResponse(
      (r) => /\/saves\/b:testcard-ps1\/state$/.test(r.url()) && r.status() === 200,
      { timeout: 30_000 },
    );
    await ana.getByRole("button", { name: /where it was left/ }).click();
    await stateLoaded;
    await expect.poll(async () => hue(await colourOf(ana, "host", conId)), { timeout: 60_000 }).toBe("bars");
    await ana.getByRole("button", { name: /Turn off/ }).click();
    await expect.poll(() => consoleState(ana, conId)).toBeNull();
  } finally {
    await ana
      .evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), [tvId, conId])
      .catch(() => {});
    await ana.waitForTimeout(1500).catch(() => {});
    await dropTestBios(ta);
  }
});

// A big disc of the team's (P3: the host's download): the ~46 MB test disc
// brought through the API in pieces; Ana turns the console on and the screen
// says how much of it has come down, then the game runs; turned on again, it
// starts from this browser's copy — nothing downloaded.
test("disc console: a big disc comes down once, with its progress", async ({ browser }) => {
  test.setTimeout(300_000);
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const ta = await token(ANA);
  const s = await useWorld("lab");
  const title = `Big Disc ${Date.now().toString(36)}`;
  const dir = mkdtempSync(join(tmpdir(), "yutopia-disc-"));
  execFileSync("node", [join(resolve(__dirname, "../../.."), "tools/test-rom-ps1.mjs"), "--pad", "40", "--out", dir]);
  const files = ["testcard.cue", "testcard.bin"].map((n) => ({ name: n, data: readFileSync(join(dir, n)) }));
  // in pieces through the API
  const c = await api(ta);
  const up = (
    await (
      await c.post(`/api/games/uploads`, {
        data: {
          system: "ps1",
          title,
          color: "#4f86c6",
          files: files.map((f) => ({ name: f.name, size: f.data.length })),
        },
      })
    ).json()
  ).upload;
  for (const [i, f] of up.files.entries())
    for (let n = 0; n < f.chunks; n++)
      expect(
        (
          await c.put(`/api/games/uploads/${up.id}/${i}/${n}`, {
            data: files[i].data.subarray(n * up.chunk, (n + 1) * up.chunk),
            headers: { "Content-Type": "application/octet-stream" },
          })
        ).ok(),
      ).toBe(true);
  const game = (await (await c.post(`/api/games/uploads/${up.id}/finish`)).json()).game;
  expect(game.title).toBe(title);
  await c.post(`/api/bios`, {
    multipart: {
      file: { name: "scph5501.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(512 * 1024, 0x42) },
    },
  });

  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const stamp = Date.now().toString(36);
  const tvId = `e2e-tv-${stamp}`;
  const conId = `e2e-ps1-${stamp}`;
  try {
    await enter(page, ta, s);
    await page.evaluate(() => (window as any).__emuDev?.forgetGames?.());
    // a TV, the console already cabled to it (a free spot near the arrival point)
    const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
    let at: { x: number; y: number } | null = null;
    for (const [dx, dy] of [
      [5, -6],
      [8, -6],
      [-9, -6],
      [-12, -6],
      [2, -12],
      [-6, -12],
      [8, -12],
    ]) {
      const p = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
      const busy = await page.evaluate(
        (a) =>
          (window as any).__yutopia.model
            .allObjects()
            .some((o: any) => o.x >= a.x - 1 && o.x <= a.x + 2 && o.y >= a.y - 1 && o.y <= a.y + 3),
        p,
      );
      if (busy) continue;
      await page.evaluate((q) => (window as any).__yutopia.send("obj:put", q), {
        id: tvId,
        kind: "crt_tv",
        ...p,
        rot: 0,
      });
      await page.evaluate((q) => (window as any).__yutopia.send("obj:put", q), {
        id: conId,
        kind: "console_ps1",
        x: p.x + 1,
        y: p.y + 2,
        rot: 0,
        props: { tv: tvId },
      });
      await page.waitForTimeout(800);
      if (await page.evaluate((i) => !!(window as any).__yutopia.room.state.objects.get(i), conId)) {
        at = p;
        break;
      }
    }
    expect(at, "room for the TV and the console").not.toBeNull();
    const p = at as { x: number; y: number };
    await walkTo(page, p.x + 1.5, p.y + 3.6, 25_000);
    await page.waitForFunction(() => !!(window as any).__yutopia.games, null, { timeout: 15_000 });
    await page.evaluate(([id, g]) => (window as any).__yutopia.send("game:cart", { id, game: g }), [
      conId,
      game.id,
    ] as const);
    await expect.poll(() => propsOf(page, conId).then((q) => q.cart)).toBe(game.id);
    await page.evaluate((id) => (window as any).__hud.set({ panel: { kind: "console", objectId: id } }), conId);
    let downloads = 0;
    page.on("request", (r) => {
      if (r.url().includes(`/games/${String(game.id).slice(2)}/files/`)) downloads++;
    });
    // on: the disc comes down first, and the screen says so
    await page.getByRole("button", { name: /^⏻ Turn on/ }).click();
    await expect(page.getByTestId("screen-status")).toHaveText(/Reading the disc… [\d.]+ MB of 4[\d.]+ MB/, {
      timeout: 30_000,
    });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/console-reading.png` });
    await expect.poll(async () => hue(await colourOf(page, "host", conId)), { timeout: 90_000 }).toBe("bars");
    expect(downloads).toBeGreaterThan(0);
    await page.getByRole("button", { name: /Turn off/ }).click();
    await expect.poll(() => consoleState(page, conId)).toBeNull();
    // again: from the copy
    const before = downloads;
    await page.getByRole("button", { name: /^⏻ Turn on/ }).click();
    await expect.poll(async () => hue(await colourOf(page, "host", conId)), { timeout: 60_000 }).toBe("bars");
    expect(downloads).toBe(before);
    await page.getByRole("button", { name: /Turn off/ }).click();
    await expect.poll(() => consoleState(page, conId)).toBeNull();
  } finally {
    await page
      .evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), [tvId, conId])
      .catch(() => {});
    await page.waitForTimeout(1500).catch(() => {});
    await c.delete(`/api/games/${String(game.id).slice(2)}`);
    await c.dispose();
    await dropTestBios(ta);
  }
});

// The slim one with its screen up (P5): while it plays, its own little screen
// shows the game too — the same picture as the TV.
test("disc console: the slim one's own screen shows the game", async ({ browser }) => {
  test.setTimeout(240_000);
  const ta = await token(ANA);
  const s = await useWorld("lab");
  await dropTestBios(ta);
  const c = await api(ta);
  await c.post(`/api/bios`, {
    multipart: {
      file: { name: "scph5501.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(512 * 1024, 0x42) },
    },
  });
  await c.dispose();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const stamp = Date.now().toString(36);
  const tvId = `e2e-tv-${stamp}`;
  const conId = `e2e-slim-${stamp}`;
  try {
    await enter(page, ta, s);
    const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
    let at: { x: number; y: number } | null = null;
    for (const [dx, dy] of [
      [5, -6],
      [8, -6],
      [-9, -6],
      [-12, -6],
      [2, -12],
      [-6, -12],
      [-2, -6],
    ]) {
      const p = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
      const busy = await page.evaluate(
        (a) =>
          (window as any).__yutopia.model
            .allObjects()
            .some((o: any) => o.x >= a.x - 1 && o.x <= a.x + 2 && o.y >= a.y - 1 && o.y <= a.y + 3),
        p,
      );
      if (busy) continue;
      await page.evaluate((q) => (window as any).__yutopia.send("obj:put", q), {
        id: tvId,
        kind: "crt_tv",
        ...p,
        rot: 0,
      });
      await page.evaluate((q) => (window as any).__yutopia.send("obj:put", q), {
        id: conId,
        kind: "console_ps1_slim",
        x: p.x + 1,
        y: p.y + 2,
        rot: 0,
        props: { tv: tvId, variant: 1 },
      });
      await page.waitForTimeout(800);
      if (await page.evaluate((i) => !!(window as any).__yutopia.room.state.objects.get(i), conId)) {
        at = p;
        break;
      }
    }
    expect(at, "room for the TV and the console").not.toBeNull();
    const p = at as { x: number; y: number };
    await walkTo(page, p.x + 1.5, p.y + 3.6, 25_000);
    await page.waitForFunction(() => !!(window as any).__yutopia.games, null, { timeout: 15_000 });
    await page.evaluate(([id]) => (window as any).__yutopia.send("game:cart", { id, game: "b:testcard-ps1" }), [conId]);
    await page.evaluate((id) => (window as any).__hud.set({ panel: { kind: "console", objectId: id } }), conId);
    const power = page.getByRole("button", { name: /^⏻ Turn on/ });
    await expect(power).toBeEnabled({ timeout: 15_000 });
    await power.click();
    await expect.poll(async () => hue(await colourOf(page, "host", conId)), { timeout: 90_000 }).toBe("bars");
    // its own screen: a picture with its own corners (the 3D view takes those), the game on it
    const lcd = () =>
      page.evaluate((id) => {
        const p = (window as any).__yutopia.games.pictures().find((x: any) => x.def.id === id && x.at);
        if (!p) return "none";
        const c = document.createElement("canvas");
        c.width = 16;
        c.height = 12;
        const g = c.getContext("2d") as CanvasRenderingContext2D;
        g.drawImage(p.canvas, 0, 0, 16, 12);
        return Array.from(g.getImageData(2, 6, 1, 1).data.slice(0, 3)).join(",");
      }, conId);
    await expect.poll(async () => hue(await lcd()), { timeout: 10_000 }).toBe("bars");
    await page.keyboard.down("KeyX");
    await expect.poll(async () => hue(await lcd())).toBe("red");
    await page.keyboard.up("KeyX");
    if (SHOTS) {
      await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
      await page.evaluate(() =>
        // (from above her shoulder: she stands right in front of it)
        Object.assign((window as any).__yutopia.tp, { yaw: -Math.PI / 2 - 0.55, pitch: 0.95, dist: 1.5 }),
      );
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SHOTS}/slim-screen-3d.png` });
      await page.evaluate((id) => (window as any).__hud.set({ panel: { kind: "console", objectId: id } }), conId);
    }
    await page.getByRole("button", { name: /Turn off/ }).click();
    await expect.poll(() => consoleState(page, conId)).toBeNull();
    await expect.poll(() => lcd()).toBe("none"); // (off: its screen goes dark)
  } finally {
    await page
      .evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), [tvId, conId])
      .catch(() => {});
    await page.waitForTimeout(1500).catch(() => {});
    await dropTestBios(ta);
  }
});
