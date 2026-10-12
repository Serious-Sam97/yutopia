/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "@playwright/test";
import { ANA, enter, spaceId, token, walkTo } from "./helpers";

// Review shots are taken on High: Auto would step down in a headless browser
// (software GPU, ~10 fps) after a few seconds and change the look mid-run.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "high" }));
  });
});

// Fixed-camera shots of every room of the Studio, day and night. Off by default;
// YUTOPIA_SHOTS=<folder> (relative to the repo root) turns it on:
//   YUTOPIA_SHOTS=design/screens/visual/before npx playwright test room-shots
const OUT = process.env.YUTOPIA_SHOTS;
const WORLD = 'canvas[aria-label="Yutopia world"]';

export const ROOMS: { name: string; x: number; y: number; zoom: number }[] = [
  { name: "tracking", x: 12, y: 9, zoom: 1.15 },
  { name: "standup", x: 22.5, y: 15.5, zoom: 1.5 },
  { name: "war-room", x: 37, y: 5.5, zoom: 1.2 },
  { name: "booths", x: 37.5, y: 16, zoom: 1.3 },
  { name: "lobby", x: 6.5, y: 27.5, zoom: 1.3 },
  { name: "lounge", x: 19, y: 27.5, zoom: 1.3 },
  { name: "live-room", x: 33, y: 27.5, zoom: 1.2 },
  { name: "server-room", x: 44, y: 27.5, zoom: 1.5 },
];

test.skip(!OUT, "set YUTOPIA_SHOTS=<folder> to take room shots");

test("room shots, day and night", async ({ page }) => {
  test.setTimeout(180_000);
  const dir = resolve(__dirname, "../../..", OUT ?? ".");
  mkdirSync(dir, { recursive: true });
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok));
  // the world only: no HUD, no clock ticking the light while we shoot
  await page.addStyleTag({
    content: `*{visibility:hidden!important}${WORLD}{visibility:visible!important}`,
  });
  await page.evaluate(() => {
    const c = (window as any).__yutopia;
    c.updateNight = () => {};
  });
  await page.waitForTimeout(1500); // textures decode
  for (const r of ROOMS) {
    for (const [when, level] of [
      ["day", 0],
      ["night", 0.85],
    ] as const) {
      await page.evaluate(
        ([room, night]) => {
          const e = (window as any).__yutopia.engine;
          e.setNight(night);
          e.pinCamera(room);
        },
        [r, level] as const,
      );
      await page.waitForTimeout(450);
      await page.locator(WORLD).screenshot({ path: `${dir}/${r.name}-${when}.png` });
    }
  }
  // close-up: Ana sitting in a desk chair whose backrest faces the camera
  const seat = (await page.evaluate(() => {
    const c = (window as any).__yutopia;
    const me = c.engine.localId ? c.meTile() : { x: 0, y: 0 };
    const chairs = c.engine.allObjects().filter((o: any) => o.kind === "chair" && o.rot === 2 && o.props?.desk);
    chairs.sort((a: any, b: any) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    return chairs[0] && { x: chairs[0].x + 0.5, y: chairs[0].y + 0.5 };
  })) as { x: number; y: number } | undefined;
  if (seat) {
    await page.evaluate(() => (window as any).__yutopia.engine.pinCamera(null));
    await walkTo(page, seat.x, seat.y, 30_000);
    await page.waitForTimeout(1200);
    for (const [when, level] of [
      ["day", 0],
      ["night", 0.85],
    ] as const) {
      await page.evaluate(
        ([at, night]) => {
          const e = (window as any).__yutopia.engine;
          // Vortex wanders into shots: keep him out of the close-up
          for (const v of e.avatars.values()) if (v.state.npc) v.root.visible = v.tag.visible = false;
          e.setNight(night);
          e.pinCamera({ x: at.x - 0.5, y: at.y - 1.5, zoom: 2.4 });
        },
        [seat, level] as const,
      );
      await page.waitForTimeout(450);
      await page.locator(WORLD).screenshot({ path: `${dir}/desk-close-${when}.png` });
    }
  }
});

// Doors live in rooms built in the Lab (map-edit.spec builds one with a locked door).
test("lab door shots, day and night", async ({ page }) => {
  test.setTimeout(120_000);
  const dir = resolve(__dirname, "../../..", OUT ?? ".");
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok, "Yutopia Lab"));
  await page.addStyleTag({ content: `*{visibility:hidden!important}${WORLD}{visibility:visible!important}` });
  const door = (await page.evaluate(() => {
    const c = (window as any).__yutopia;
    c.updateNight = () => {};
    const d = c.engine.allObjects().find((o: any) => o.kind === "door");
    return d && { x: d.x + 0.5, y: d.y + 0.5 };
  })) as { x: number; y: number } | undefined;
  test.skip(!door, "no door in the Lab");
  await page.waitForTimeout(1500);
  for (const [when, level] of [
    ["day", 0],
    ["night", 0.85],
  ] as const) {
    await page.evaluate(
      ([at, night]) => {
        const e = (window as any).__yutopia.engine;
        e.setNight(night);
        e.pinCamera({ ...at, zoom: 2.2 });
      },
      [door, level] as const,
    );
    await page.waitForTimeout(450);
    await page.locator(WORLD).screenshot({ path: `${dir}/lab-door-${when}.png` });
  }
});

// The Tracking Room through the day: noon, golden hour, dusk, night.
test("through the day: tracking room, the building, the lobby windows", async ({ page }) => {
  test.setTimeout(120_000);
  const dir = resolve(__dirname, "../../..", OUT ?? ".");
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok));
  await page.addStyleTag({ content: `*{visibility:hidden!important}${WORLD}{visibility:visible!important}` });
  await page.evaluate(() => {
    (window as any).__yutopia.updateNight = () => {};
  });
  await page.waitForTimeout(1500);
  const views = [
    ["tracking", ROOMS[0]],
    // the whole building, from outside: the tower's facade, the city, the sky
    ["building", { x: 24, y: 18, zoom: 0.55 }],
    // the Lobby's windows, from inside
    ["lobby-windows", { x: 4, y: 26, zoom: 1.6 }],
  ] as const;
  for (const [view, at] of views)
    for (const [name, hour] of [
      ["noon", 12],
      ["golden", 17.6],
      ["dusk", 19.2],
      ["night", 23],
    ] as const) {
      await page.evaluate(
        ([h, room]) => {
          const e = (window as any).__yutopia.engine;
          e.setClock(h);
          e.pinCamera(room);
        },
        [hour, at] as const,
      );
      await page.waitForTimeout(500);
      await page.locator(WORLD).screenshot({ path: `${dir}/${view}-${name}.png` });
    }
  // the clouds drift: the whole studio twice, 3 s apart
  await page.evaluate(() => {
    const e = (window as any).__yutopia.engine;
    e.setClock(12);
    e.pinCamera({ x: 24, y: 18, zoom: 0.55 });
  });
  await page.waitForTimeout(600);
  await page.locator(WORLD).screenshot({ path: `${dir}/clouds-a.png` });
  await page.waitForTimeout(3000);
  await page.locator(WORLD).screenshot({ path: `${dir}/clouds-b.png` });
});

// Each theme around the studio (set locally in the engine, nothing saved):
// the whole studio at noon, golden hour and night, and a room by day.
test("themes: clouds, city, snow", async ({ page }) => {
  test.setTimeout(180_000);
  const dir = resolve(__dirname, "../../..", OUT ?? ".");
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok));
  await page.addStyleTag({ content: `*{visibility:hidden!important}${WORLD}{visibility:visible!important}` });
  await page.evaluate(() => {
    (window as any).__yutopia.updateNight = () => {};
  });
  for (const theme of ["clouds", "city", "snow"]) {
    for (const [name, hour, at] of [
      ["noon", 12, { x: 24, y: 18, zoom: 0.55 }],
      ["golden", 17.6, { x: 24, y: 18, zoom: 0.55 }],
      ["night", 23, { x: 24, y: 18, zoom: 0.55 }],
      ["room", 12, { x: 8, y: 26, zoom: 1.1 }],
    ] as const) {
      await page.evaluate(
        ([t, h, p]) => {
          const e = (window as any).__yutopia.engine;
          e.map = { ...e.map, theme: t };
          e.applyTheme();
          e.setClock(h);
          e.pinCamera(p);
        },
        [theme, hour, at] as const,
      );
      await page.waitForTimeout(1200); // the theme chunk loads lazily
      await page.locator(WORLD).screenshot({ path: `${dir}/theme-${theme}-${name}.png` });
    }
  }
});
