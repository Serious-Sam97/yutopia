/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */

import { expect, type Page } from "@playwright/test";
import { canPlace, findPath, Grid, type MapDef, Q, topAt, type WorldObjectDef } from "@yutopia/shared";
import { ANA, BIA, enter, spaceId, test, token } from "./helpers";

// Media on TVs and the radio, end to end (docs/plan/10-media.md). YouTube's
// player is a stub here (the real IFrame API needs the network and plays ads):
// it keeps time like a player, so we can read where it is and how loud.
// Ana puts a video on a wall TV in the Lab and leaves; Bia arrives later and
// finds it at the right second, louder as she walks up; far away, no card.
// The radio's YouTube source plays in the same card near the radio.
// YUTOPIA_JF_LIVE=1 also plays an episode from the real Jellyfin.

const SHOTS = process.env.YUTOPIA_SHOTS;
const VIDEO = "M7lc1UVf-VE";
// a public playlist and the name YouTube gives it (oEmbed)
const LIST = "PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i";
const LIST_TITLE = "Top 100 Songs Global";

const STUB = `
window.__ytStubs = [];
window.YT = { Player: function (el, o) {
  const f = document.createElement("iframe");
  f.setAttribute("data-yt-stub", "1");
  el.replaceWith(f);
  let t = Number(o.playerVars && o.playerVars.start) || 0, base = performance.now(), playing = false, state = -1;
  let vol = 100, muted = false, rate = 1, vid = o.videoId;
  const cur = () => playing ? t + ((performance.now() - base) / 1000) * rate : t;
  const api = {
    playVideo() { if (!playing) { t = cur(); base = performance.now(); playing = true; state = 1; o.events && o.events.onStateChange && o.events.onStateChange({ data: 1, target: api }); } },
    pauseVideo() { t = cur(); playing = false; state = 2; },
    seekTo(s) { t = s; base = performance.now(); },
    getCurrentTime: cur, getDuration() { return 300; }, getPlayerState() { return state; },
    setVolume(v) { vol = v; }, getVolume() { return vol; }, mute() { muted = true; }, unMute() { muted = false; }, isMuted() { return muted; },
    setPlaybackRate(r) { t = cur(); base = performance.now(); rate = r; }, getPlaybackRate() { return rate; }, getAvailablePlaybackRates() { return [0.25, 0.5, 1, 2]; },
    loadVideoById(x) { vid = x.videoId; t = x.startSeconds || 0; base = performance.now(); playing = true; state = 1; },
    destroy() { f.remove(); api.gone = true; }, video() { return vid; },
  };
  window.__ytStubs.push(api);
  setTimeout(() => o.events && o.events.onReady && o.events.onReady({ data: 0, target: api }), 30);
  return api;
} };
setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 0);
`;

async function stubYouTube(page: Page) {
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({ status: 200, contentType: "text/javascript", body: STUB }),
  );
}

// the live player (the last stub not destroyed): where it is, how loud
const player = (page: Page) =>
  page.evaluate(() => {
    const s = ((window as any).__ytStubs ?? []).filter((x: any) => !x.gone).pop();
    return s ? { t: s.getCurrentTime() as number, vol: s.getVolume() as number, video: s.video() as string } : null;
  });
const status = (page: Page) => page.evaluate(() => (window as any).__yutopia.screens?.status ?? null);
const mediaOn = (page: Page, id: string) =>
  page.evaluate((i) => {
    const o = (window as any).__yutopia.room.state.objects.get(i);
    return o ? (JSON.parse(o.props || "{}").media ?? null) : null;
  }, id);
async function liveMap(
  page: Page,
): Promise<{ map: MapDef; objects: WorldObjectDef[]; bodies: { x: number; y: number }[] }> {
  return page.evaluate(() => {
    const y = (window as any).__yutopia;
    const bodies = [...y.room.state.players.values()].map((p: any) => ({ x: p.x, y: p.y }));
    return { map: JSON.parse(JSON.stringify(y.map)), objects: y.engine.allObjects(), bodies };
  });
}

// a free spot for a thing, nearest to (x, y) first, whose front (dx, dy from
// it) anyone can walk to from (x, y) — locked rooms are out (uid 0: a stranger)
async function spotFor(page: Page, kind: string, x: number, y: number, front = { dx: 1, dy: 2 }, r = 40) {
  const { map, objects, bodies } = await liveMap(page);
  const grid = Grid.from(map, objects, { uid: 0 });
  const spots: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) spots.push([x + dx, y + dy]);
  spots.sort((a, b) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y));
  for (const [sx, sy] of spots)
    if (
      canPlace(map, objects, { id: "probe", kind, x: sx, y: sy, rot: 0 }, bodies) &&
      findPath(grid, { x: x + 0.5, y: y + 0.5 }, { x: sx + front.dx + 0.5, y: sy + front.dy + 0.5 })
    )
      return { x: sx, y: sy };
  return null;
}

async function walk(page: Page, to: { x: number; y: number }, ms = 30_000) {
  const ok = await page.evaluate((p) => (window as any).__yutopia.walkTo(p), to);
  if (!ok) return false;
  await page.waitForFunction(
    (p) => {
      const t = (window as any).__yutopia.meTile();
      return Math.hypot(t.x - p.x, t.y - p.y) < 1.3;
    },
    to,
    { timeout: ms },
  );
  return true;
}

test("media: a YouTube video on a wall TV — left playing, found at the right second, heard near", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const ctx = { viewport: { width: 1280, height: 800 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  await stubYouTube(ana);
  const s = await spaceId(ta, "Yutopia Lab");
  await enter(ana, ta, s);
  const tvId = `e2e-hd-${Date.now().toString(36)}`;
  try {
    const sp = await ana.evaluate(() => (window as any).__yutopia.map.spawn);
    const at = await spotFor(ana, "tv_hd", Math.floor(sp.x), Math.floor(sp.y), { dx: 1, dy: 1 });
    expect(at, "a wall for the TV").toBeTruthy();
    await ana.evaluate((o) => (window as any).__yutopia.send("obj:put", o), { id: tvId, kind: "tv_hd", ...at, rot: 0 });
    await ana.waitForFunction((i) => !!(window as any).__yutopia.room.state.objects.get(i), tvId, { timeout: 10_000 });
    // put a video on it
    await ana.evaluate(
      ([i, v]) =>
        (window as any).__yutopia.send("media:play", {
          id: i,
          items: [{ src: "yt", ref: v, title: "YouTube", dur: 0 }],
          mode: "now",
        }),
      [tvId, VIDEO],
    );
    await expect.poll(async () => (await mediaOn(ana, tvId))?.item?.ref, { timeout: 15_000 }).toBe(VIDEO);
    // the server looked the title up (oEmbed)
    await expect.poll(async () => (await mediaOn(ana, tvId))?.item?.title, { timeout: 15_000 }).not.toBe("YouTube");
    // Ana is near it: the card plays it, and its length reaches the server
    const front = { x: (at?.x ?? 0) + 1, y: (at?.y ?? 0) + 2 };
    await walk(ana, front);
    await expect.poll(async () => (await status(ana))?.card, { timeout: 20_000 }).toBe(true);
    await expect.poll(async () => (await mediaOn(ana, tvId))?.item?.dur, { timeout: 15_000 }).toBe(300);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/media-ana-near.png` });
    // Ana leaves; it keeps playing
    await ana.close();
    await new Promise((r) => setTimeout(r, 4000));

    // Bia arrives later and walks up to it
    const bia = await (await browser.newContext(ctx)).newPage();
    await stubYouTube(bia);
    await enter(bia, tb, s);
    // far away (she arrives at the arrival point, well out of earshot): no card
    const me0 = await bia.evaluate(() => (window as any).__yutopia.meTile());
    expect(Math.hypot(me0.x - front.x, me0.y - front.y)).toBeGreaterThan(8);
    await bia.waitForTimeout(3000);
    expect((await status(bia))?.card ?? false).toBe(false);
    // halfway: quieter than right in front
    expect(await walk(bia, { x: front.x + 0.5, y: front.y + 0.8 }, 60_000)).toBe(true);
    await expect.poll(async () => (await status(bia))?.card, { timeout: 20_000 }).toBe(true);
    await bia.waitForTimeout(1500);
    const mid = await player(bia);
    await walk(bia, { x: front.x + 0.5, y: (at?.y ?? 0) + 0.5 }, 40_000);
    await bia.waitForTimeout(1500);
    const near = await player(bia);
    expect(near?.video).toBe(VIDEO);
    expect(near?.vol ?? 0).toBeGreaterThan(mid?.vol ?? 0);
    // the TV's own knob down: quieter right in front of it (it eases there)
    await bia.evaluate((i) => (window as any).__yutopia.send("media:volume", { id: i, volume: 0.3 }), tvId);
    await expect
      .poll(async () => (await player(bia))?.vol ?? 100, { timeout: 10_000 })
      .toBeLessThan((near?.vol ?? 0) * 0.45);
    // and it's at the right second: where it would be had it played all along
    await bia.waitForTimeout(2500);
    const want = await bia.evaluate((i) => {
      const o = (window as any).__yutopia.room.state.objects.get(i);
      const m = JSON.parse(o.props || "{}").media;
      return (Date.now() - m.at) / 1000;
    }, tvId);
    const got = (await player(bia))?.t ?? -99;
    expect(Math.abs(got - want)).toBeLessThan(1.5);
    // the in-world picture is there too (the thumbnail on the glass)
    if (SHOTS) await bia.screenshot({ path: `${SHOTS}/media-bia-near.png` });
    // Watch: the card goes big; Esc brings it back
    await bia.evaluate((i) => (window as any).__yutopia.screens.watch(i), tvId);
    await expect.poll(async () => (await status(bia))?.big, { timeout: 5000 }).toBe(true);
    if (SHOTS) await bia.screenshot({ path: `${SHOTS}/media-bia-watch.png` });
    await bia.keyboard.press("Escape");
    await expect.poll(async () => (await status(bia))?.big, { timeout: 5000 }).toBe(false);
    // tidy up
    await bia.evaluate((i) => (window as any).__yutopia.send("media:ctl", { id: i, op: "stop" }), tvId);
  } finally {
    // only builders remove things: Ana does it
    const a2 = await (await browser.newContext(ctx)).newPage();
    await enter(a2, ta, s);
    await a2.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), tvId);
    await a2.waitForTimeout(800);
  }
});

test("media: YouTube on a radio — its own queue, the card plays near it, a station takes over", async ({ browser }) => {
  test.setTimeout(150_000);
  const ta = await token(ANA);
  const ana = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await stubYouTube(ana);
  const s = await spaceId(ta, "Yutopia Lab");
  await enter(ana, ta, s);
  const radioId = `e2e-radio-${Date.now().toString(36)}`;
  // a radio on a desk (a surface with room on its top)
  const { map, objects } = await liveMap(ana);
  let box: WorldObjectDef | null = null;
  for (const d of objects.filter((o) => o.kind === "desk"))
    for (let qy = d.y * Q; qy < (d.y + 2) * Q && !box; qy++)
      for (let qx = d.x * Q; qx < (d.x + 2) * Q && !box; qx++) {
        const r = topAt({ id: radioId, kind: "radio", x: 0, y: 0, rot: 0 }, qx, qy);
        if (canPlace(map, objects, r, [])) box = r;
      }
  expect(box, "a desk with room for a radio").toBeTruthy();
  const radio = box as WorldObjectDef;
  await ana.evaluate((o) => (window as any).__yutopia.send("obj:put", o), radio);
  await ana.waitForFunction((i) => !!(window as any).__yutopia.room.state.objects.get(i), radioId);
  try {
    await ana.evaluate(
      ([i, v]) =>
        (window as any).__yutopia.send("media:play", {
          id: i,
          items: [{ src: "yt", ref: v, title: "YouTube", dur: 0 }],
          mode: "now",
        }),
      [radioId, VIDEO] as const,
    );
    await ana.waitForFunction(
      (i) => (window as any).__yutopia.engine.getObject(i)?.props?.radio?.source === "yt",
      radioId,
    );
    await walk(ana, { x: radio.x + 0.5, y: radio.y + 1.5 }, 60_000).catch(() => false);
    await expect.poll(async () => (await status(ana))?.card, { timeout: 20_000 }).toBe(true);
    // the card shows at once, its player a moment later
    await expect.poll(async () => (await player(ana))?.video, { timeout: 10_000 }).toBe(VIDEO);
    // the procedural lo-fi isn't playing under it
    expect(await ana.evaluate(() => !!(window as any).__audio.radio.out)).toBe(false);
    await expect(ana.locator(".ymc-tag")).toHaveText(/RADIO|RÁDIO/);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/media-radio.png` });
    // back to a lo-fi station: the card goes
    await ana.evaluate(
      (i) => (window as any).__yutopia.send("radio:set", { id: i, playing: true, station: 0 }),
      radioId,
    );
    await expect.poll(async () => (await status(ana))?.card, { timeout: 10_000 }).toBe(false);
    // a YouTube playlist played on it: on the space's quick list, named by YouTube
    await ana.evaluate(
      ([i, l]) =>
        (window as any).__yutopia.send("media:play", {
          id: i,
          items: [
            { src: "yt", ref: "dQw4w9WgXcQ", title: "YouTube", dur: 0 },
            { src: "yt", ref: "M7lc1UVf-VE", title: "YouTube", dur: 0 },
          ],
          mode: "now",
          list: l,
        }),
      [radioId, LIST] as const,
    );
    await expect
      .poll(
        () =>
          ana.evaluate(
            (l) => JSON.parse((window as any).__yutopia.room.state.playlists).find((p: any) => p.list === l)?.title,
            LIST,
          ),
        {
          timeout: 15_000,
        },
      )
      .toBe(LIST_TITLE);
    // back on lo-fi, the radio's panel offers it: one tap plays it again on this radio
    await ana.evaluate(
      (i) => (window as any).__yutopia.send("radio:set", { id: i, playing: true, station: 1 }),
      radioId,
    );
    await ana.evaluate((i) => (window as any).__hud.set({ panel: { kind: "radio", objectId: i } }), radioId);
    const chip = ana.getByRole("button", { name: new RegExp(LIST_TITLE) });
    await expect(chip).toBeVisible({ timeout: 10_000 });
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/media-radio-playlists.png` });
    await chip.click();
    await expect
      .poll(
        () =>
          ana.evaluate((i) => (window as any).__yutopia.engine.getObject(i)?.props?.radio?.media?.item?.ref, radioId),
        {
          timeout: 15_000,
        },
      )
      .toBe("dQw4w9WgXcQ");
    // the YouTube tab lists it too (with its channel and size)
    await ana
      .getByRole("button", { name: /^YouTube/ })
      .first()
      .click();
    await expect(ana.getByText(/2 (videos|vídeos)/).first()).toBeVisible();
    // star it (Mine), then rename and pin it from its ⋯
    const saved = () =>
      ana.evaluate(
        (l) => JSON.parse((window as any).__yutopia.room.state.playlists).find((p: any) => p.list === l),
        LIST,
      );
    await ana.getByRole("button", { name: new RegExp(`^(Add to Mine|Pôr em Minhas): ${LIST_TITLE}`) }).click();
    await expect.poll(async () => (await saved())?.stars?.length ?? 0).toBe(1);
    await ana
      .getByRole("button", { name: new RegExp(`^(Rename, pin, remove|Renomear, fixar, tirar): ${LIST_TITLE}`) })
      .click();
    const field = ana.getByRole("textbox", { name: /^(Rename|Renomear)$/ });
    await field.fill("Friday mix");
    await field.press("Enter");
    await expect.poll(async () => (await saved())?.title).toBe("Friday mix");
    await ana.getByRole("button", { name: /^(Rename, pin, remove|Renomear, fixar, tirar): Friday mix/ }).click();
    await ana.getByRole("button", { name: /(Pin for everyone|Fixar para todos)/ }).click();
    await expect.poll(async () => (await saved())?.pinned).toBe(true);
    await ana.getByRole("button", { name: /★ (Mine|Minhas)/ }).click();
    await expect(ana.getByRole("button", { name: /^(Play now|Tocar agora): Friday mix/ }).first()).toBeVisible();
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/media-radio-yt-tab.png` });
    await ana.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
  } finally {
    await ana.evaluate((l) => (window as any).__yutopia.send("playlist:forget", { list: l }), LIST);
    await ana.evaluate((i) => (window as any).__yutopia.send("radio:set", { id: i, playing: false }), radioId);
    await ana.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), radioId);
    await ana.waitForTimeout(800);
  }
});

test("media: one saved playlist after another on a radio", async ({ browser }) => {
  test.setTimeout(120_000);
  const ta = await token(ANA);
  const ana = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await stubYouTube(ana);
  await enter(ana, ta, await spaceId(ta, "Yutopia Lab"));
  const radioId = `e2e-radio2-${Date.now().toString(36)}`;
  const { map, objects } = await liveMap(ana);
  let box: WorldObjectDef | null = null;
  for (const d of objects.filter((o) => o.kind === "desk"))
    for (let qy = d.y * Q; qy < (d.y + 2) * Q && !box; qy++)
      for (let qx = d.x * Q; qx < (d.x + 2) * Q && !box; qx++) {
        const r = topAt({ id: radioId, kind: "radio", x: 0, y: 0, rot: 0 }, qx, qy);
        if (canPlace(map, objects, r, [])) box = r;
      }
  expect(box, "a desk with room for a radio").toBeTruthy();
  await ana.evaluate((o) => (window as any).__yutopia.send("obj:put", o), box);
  await ana.waitForFunction((i) => !!(window as any).__yutopia.room.state.objects.get(i), radioId);
  const LIST2 = "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG";
  const A = ["dQw4w9WgXcQ", "M7lc1UVf-VE"];
  const B = ["9bZkp7q19f0", "kJQP7kiw5Fk"];
  const now = () =>
    ana.evaluate((i) => (window as any).__yutopia.engine.getObject(i)?.props?.radio?.media?.item?.ref, radioId);
  const saved = (l: string) =>
    ana.evaluate((x) => JSON.parse((window as any).__yutopia.room.state.playlists).find((p: any) => p.list === x), l);
  try {
    // two playlists played here: both on the quick list, B playing
    for (const [l, refs] of [
      [LIST, A],
      [LIST2, B],
    ] as const) {
      await ana.evaluate(
        ([i, list, r]) =>
          (window as any).__yutopia.send("media:play", {
            id: i,
            items: r.map((ref: string) => ({ src: "yt", ref, title: "YouTube", dur: 0 })),
            mode: "now",
            list,
          }),
        [radioId, l, refs] as const,
      );
      await expect.poll(() => saved(l), { timeout: 15_000 }).toBeTruthy();
      await expect.poll(now, { timeout: 15_000 }).toBe(refs[0]);
    }
    await ana.evaluate(
      (l) => (window as any).__yutopia.send("playlist:edit", { list: l, title: "Second list" }),
      LIST2,
    );
    await expect.poll(async () => (await saved(LIST2))?.title).toBe("Second list");

    // the YouTube tab: A again, now
    await ana.evaluate((i) => (window as any).__hud.set({ panel: { kind: "radio", objectId: i } }), radioId);
    await ana
      .getByRole("button", { name: new RegExp(`^(Play now|Tocar agora): ${LIST_TITLE}`) })
      .first()
      .click();
    await expect.poll(now, { timeout: 15_000 }).toBe(A[0]);
    // and B from the lo-fi tab's chips
    await ana.getByRole("button", { name: /^Lo-fi/ }).click();
    await ana.getByRole("button", { name: /Second list/ }).click();
    await expect.poll(now, { timeout: 15_000 }).toBe(B[0]);
  } finally {
    await ana.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
    for (const l of [LIST, LIST2])
      await ana.evaluate((x) => (window as any).__yutopia.send("playlist:forget", { list: x }), l);
    await ana.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), radioId);
    await ana.waitForTimeout(800);
  }
});

test("media: Jellyfin on a console TV — the stream on the glass, in step (live server)", async ({ browser }) => {
  test.skip(!process.env.YUTOPIA_JF_LIVE, "set YUTOPIA_JF_LIVE=1 to play from the real Jellyfin");
  test.setTimeout(240_000);
  const ta = await token(ANA);
  const ana = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const s = await spaceId(ta, "Yutopia Lab");
  await enter(ana, ta, s);
  const tvId = `e2e-ctv-${Date.now().toString(36)}`;
  try {
    expect(await ana.evaluate(() => (window as any).__yutopia.mediaKey?.jf)).toBe(true);
    // the first playable thing the library search finds
    const pick = await ana.evaluate(async () => {
      const y = (window as any).__yutopia;
      const base = `${y.worldHttp}/media/jf/api/${encodeURIComponent(y.mediaKey.key)}/browse`;
      for (const q of ["a", "e", "o"]) {
        const r = await (await fetch(`${base}?q=${q}`)).json();
        const it = r.items.find((x: any) => !x.folder);
        if (it) return it;
      }
      return null;
    });
    expect(pick).toBeTruthy();
    const sp = await ana.evaluate(() => (window as any).__yutopia.map.spawn);
    const at = await spotFor(ana, "tv_console", Math.floor(sp.x), Math.floor(sp.y), { dx: 1, dy: 1 }, 10);
    await ana.evaluate((o) => (window as any).__yutopia.send("obj:put", o), {
      id: tvId,
      kind: "tv_console",
      ...at,
      rot: 0,
    });
    await ana.waitForFunction((i) => !!(window as any).__yutopia.room.state.objects.get(i), tvId, { timeout: 10_000 });
    await ana.evaluate(
      ([i, ref]) =>
        (window as any).__yutopia.send("media:play", {
          id: i,
          items: [{ src: "jf", ref, title: "?", dur: 0 }],
          mode: "now",
        }),
      [tvId, pick.id],
    );
    await expect.poll(async () => (await mediaOn(ana, tvId))?.item?.title, { timeout: 20_000 }).toBe(pick.name);
    await walk(ana, { x: (at?.x ?? 0) + 1.5, y: (at?.y ?? 0) + 1.5 }, 60_000);
    await expect.poll(async () => (await status(ana))?.jf?.ready, { timeout: 60_000 }).toBe(true);
    // a seek or two to learn how long the stream takes to start, then in step
    await expect
      .poll(async () => Math.abs((await status(ana))?.jf?.drift ?? 99), { timeout: 40_000, intervals: [2000] })
      .toBeLessThan(0.5);
    const st = await status(ana);
    expect(Math.abs(st.jf.drift)).toBeLessThan(1.5);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/media-jf.png` });
    await ana.evaluate((i) => (window as any).__yutopia.send("media:ctl", { id: i, op: "stop" }), tvId);
  } finally {
    await ana.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), tvId);
    await ana.waitForTimeout(800);
  }
});
