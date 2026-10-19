/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import { canPlace, findPath, Grid, Q, topAt, type WorldObjectDef } from "@yutopia/shared";
import { ANA, enter, test, token, useWorld } from "./helpers";

// Review shots for media on TVs (docs/plan/10-media.md): the new screens in the
// Lab, each with something on (YouTube thumbnails; one paused), by day and by
// night (the glow, the projector's beam), and the remote, Jellyfin's browser
// and the radio's YouTube tab. Off by default: YUTOPIA_SHOTS=<dir>.
const OUT = process.env.YUTOPIA_SHOTS;
const VIDEOS = ["M7lc1UVf-VE", "dQw4w9WgXcQ", "jNQXAC9IVRw", "9bZkp7q19f0", "kJQP7kiw5Fk", "fJ9rUzIMcZQ"];

const STUB = `window.YT={Player:function(el,o){const f=document.createElement("iframe");el.replaceWith(f);let s=-1;const a={playVideo(){s=1},pauseVideo(){s=2},seekTo(){},getCurrentTime(){return 0},getDuration(){return 300},getPlayerState(){return s},setVolume(){},getVolume(){return 100},mute(){},unMute(){},isMuted(){return false},setPlaybackRate(){},getPlaybackRate(){return 1},getAvailablePlaybackRates(){return[1]},loadVideoById(){},destroy(){f.remove()}};setTimeout(()=>o.events&&o.events.onReady&&o.events.onReady({data:0,target:a}),30);return a}};setTimeout(()=>window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady(),0);`;

const put = (page: Page, o: WorldObjectDef) => page.evaluate((x) => (window as any).__yutopia.send("obj:put", x), o);
const has = (page: Page, id: string) =>
  page.waitForFunction((i) => !!(window as any).__yutopia.room.state.objects.get(i), id, { timeout: 8000 });

test("media shots: the new screens by day and night, the remote", async ({ page }) => {
  test.skip(!OUT, "set YUTOPIA_SHOTS=<dir> to take the review shots");
  test.setTimeout(240_000);
  const dir = resolve(__dirname, "../../..", OUT ?? ".");
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({ status: 200, contentType: "text/javascript", body: STUB }),
  );
  const tok = await token(ANA);
  await enter(page, tok, await useWorld("lab"));
  const stamp = Date.now().toString(36);
  const ids: string[] = [];
  try {
    const { map, objects, bodies } = await page.evaluate(() => {
      const y = (window as any).__yutopia;
      return {
        map: JSON.parse(JSON.stringify(y.map)),
        objects: y.engine.allObjects(),
        bodies: [...y.room.state.players.values()].map((p: any) => ({ x: p.x, y: p.y })),
      };
    });
    const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
    const grid = Grid.from(map, objects, { uid: 0 });
    const placed: WorldObjectDef[] = [...objects];
    // wall pieces: the HD TV on a wall anyone can walk up to, the others as near it as they fit
    const near = (kind: string, ax: number, ay: number, reach: boolean) => {
      let best: { x: number; y: number } | null = null;
      let bd = Number.POSITIVE_INFINITY;
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++) {
          const d = Math.hypot(x - ax, y - ay);
          if (d >= bd || !canPlace(map, placed, { id: "p", kind, x, y, rot: 0 }, bodies)) continue;
          if (reach && !findPath(grid, { x: sp.x, y: sp.y }, { x: x + 1.5, y: y + 1.5 })) continue;
          best = { x, y };
          bd = d;
        }
      return best;
    };
    const R = near("tv_hd", sp.x, sp.y, true);
    expect(R, "a wall for the HD TV").toBeTruthy();
    for (const k of ["tv_hd", "tv_wall", "projector_screen"]) {
      const at = k === "tv_hd" ? R : near(k, (R?.x ?? 0) + 2, R?.y ?? 0, false);
      if (!at) continue;
      const o = { id: `shot-${k}-${stamp}`, kind: k, ...at, rot: 0 };
      await put(page, o);
      await has(page, o.id);
      ids.push(o.id);
      placed.push(o);
    }
    const ca = near("tv_console", (R?.x ?? 0) + 1, (R?.y ?? 0) + 3, false);
    const con = { id: `shot-tv_console-${stamp}`, kind: "tv_console", x: ca?.x ?? 0, y: ca?.y ?? 0, rot: 0 };
    if (ca) {
      await put(page, con);
      await has(page, con.id);
      ids.push(con.id);
      placed.push(con);
    }
    // on side tables: the projector in front of its screen (its beam), the portable TV by the console
    const screen = placed.find((o) => o.id === `shot-projector_screen-${stamp}`);
    for (const [kind, ax, ay] of [
      ["projector", (screen?.x ?? R?.x ?? 0) + 1, (screen?.y ?? R?.y ?? 0) + 3],
      ["tv_portable", (ca?.x ?? 0) + 3, (ca?.y ?? 0) + 1],
    ] as const) {
      const at = near("side_table", ax, ay, false);
      if (!at) continue;
      const table = { id: `shot-table-${kind}-${stamp}`, kind: "side_table", ...at, rot: 0 };
      await put(page, table);
      await has(page, table.id);
      ids.push(table.id);
      placed.push(table);
      let top: WorldObjectDef | null = null;
      for (let qy = at.y * Q; qy < (at.y + 1) * Q && !top; qy++)
        for (let qx = at.x * Q; qx < (at.x + 1) * Q && !top; qx++) {
          const t = topAt({ id: `shot-${kind}-${stamp}`, kind, x: 0, y: 0, rot: 0 }, qx, qy);
          if (canPlace(map, placed, t, [])) top = t;
        }
      if (!top) continue;
      await put(page, top);
      await has(page, top.id);
      ids.unshift(top.id); // removed before its table
      placed.push(top);
    }
    // something on every screen (the projector shows its screen's)
    let n = 0;
    for (const id of ids) {
      if (/shot-(projector|table)-/.test(id)) continue;
      await page.evaluate(
        ([i, v]) =>
          (window as any).__yutopia.send("media:play", {
            id: i,
            items: [{ src: "yt", ref: v, title: "YouTube", dur: 0 }],
            mode: "now",
          }),
        [id, VIDEOS[n++ % VIDEOS.length]],
      );
    }
    await page.waitForTimeout(1500);
    // one paused (the ❚❚ on its glass)
    const paused = ids.find((i) => i.includes("tv_wall"));
    if (paused) await page.evaluate((i) => (window as any).__yutopia.send("media:ctl", { id: i, op: "pause" }), paused);
    await page.waitForTimeout(4000); // thumbnails load, the media chunk draws
    const sheet = await page.addStyleTag({ content: `.ymc,.ymc-back{display:none!important}` });
    for (const [when, level] of [
      ["day", 0],
      ["night", 0.85],
    ] as const) {
      await page.evaluate(
        ([at, night]) => {
          const c = (window as any).__yutopia;
          c.updateNight = () => {};
          c.engine.setNight(night);
          c.engine.pinCamera({ x: at.x + 2, y: at.y + 3, z: 30, zoom: 1.7 });
        },
        [R, level] as const,
      );
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${dir}/media-${when}.png` });
    }
    await sheet.evaluate((el) => el.remove());
    await page.evaluate(() => {
      const c = (window as any).__yutopia;
      c.engine.setNight(0);
      c.engine.pinCamera(null);
    });
    // the remote for the HD TV, its YouTube and Jellyfin tabs
    const hd = ids.find((i) => i.includes("tv_hd")) as string;
    await page.evaluate((i) => (window as any).__hud.set({ panel: { kind: "media", objectId: i } }), hd);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${dir}/media-remote.png` });
    const jf = page.getByRole("button", { name: "Jellyfin", exact: true });
    if (await jf.count()) {
      await jf.click();
      await page.waitForTimeout(2500);
      const lib = page.locator("nav button").nth(1);
      if (await page.locator("ul.grid li button").count()) await page.locator("ul.grid li button").first().click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${dir}/media-jellyfin.png` });
      void lib;
    }
    // a radio's panel (the Lab may have none: then skip it)
    const radio = await page.evaluate(() =>
      (window as any).__yutopia.engine.allObjects().find((o: any) => o.kind === "radio" || o.kind === "turntable"),
    );
    if (radio) {
      await page.evaluate((i) => (window as any).__hud.set({ panel: { kind: "radio", objectId: i } }), radio.id);
      await page.waitForTimeout(800);
      await page
        .getByRole("button", { name: /^YouTube/ })
        .first()
        .click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${dir}/media-radio-panel.png` });
    }
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: null } }));
  } finally {
    for (const id of ids) await page.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id);
    await page.waitForTimeout(1000);
  }
});
