/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { ANA, enter, test, token, useWorld } from "./helpers";

// Review shots of the live world in third person (opt-in: YUTOPIA_SHOTS=<dir>):
// Ana in the Demo space, at a few spots, the camera set by hand.
const dir = process.env.YUTOPIA_SHOTS;

const SPOTS: { name: string; x: number; y: number; yaw: number; pitch: number; dist: number }[] = [
  { name: "tracking-boards", x: 10.5, y: 5.5, yaw: -Math.PI / 2, pitch: 0.42, dist: 6 },
  { name: "war-room-screen", x: 38.5, y: 7.5, yaw: -Math.PI / 2, pitch: 0.4, dist: 5.5 },
  { name: "lounge", x: 19.5, y: 29.5, yaw: -2.3, pitch: 0.55, dist: 6 },
  { name: "live-room", x: 33.5, y: 29.5, yaw: -Math.PI / 2, pitch: 0.45, dist: 7 },
  { name: "lobby", x: 6.5, y: 27.5, yaw: -2.0, pitch: 0.55, dist: 6.5 },
];

test("third person review shots", async ({ page }) => {
  test.skip(!dir, "YUTOPIA_SHOTS not set");
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "free" }));
  });
  await enter(page, tok, await useWorld("demo"));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  const only = process.env.YUTOPIA_SHOT;
  for (const s of SPOTS) {
    if (only && !s.name.includes(only)) continue;
    await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x, y: p.y }), s);
    await page.waitForTimeout(1200);
    await page.evaluate((p) => {
      const t = (window as any).__yutopia.tp;
      t.yaw = p.yaw;
      t.pitch = p.pitch;
      t.dist = p.dist;
    }, s);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${dir}/3p-${s.name}.png` });
  }
  await page.evaluate(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "iso", cam3p: "chase" }));
  });
});

// Side by side (opt-in): each spot in third person, then — same moment, same
// place — in iso (T switches the view), for a review of the two.
test("third person vs iso, side by side", async ({ page }) => {
  test.skip(!dir, "YUTOPIA_SHOTS not set");
  test.setTimeout(240_000);
  const tok = await token(ANA);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "free" }));
  });
  await enter(page, tok, await useWorld("demo"));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  for (const s of SPOTS) {
    await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x, y: p.y }), s);
    await page.waitForTimeout(1200);
    await page.evaluate((p) => {
      const t = (window as any).__yutopia.tp;
      t.yaw = p.yaw;
      t.pitch = p.pitch;
      t.dist = p.dist;
    }, s);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${dir}/pair-${s.name}-3p.png` });
    await page.keyboard.press("t");
    await page.waitForFunction(() => !(window as any).__yutopia.tp);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${dir}/pair-${s.name}-iso.png` });
    await page.keyboard.press("t");
    await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 30_000 });
    await page.waitForTimeout(1500);
  }
  await page.evaluate(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "iso", cam3p: "chase" }));
  });
});

// First person (opt-in): the same spots from Ana's own eyes, looking level,
// in the Demo space; plus night under the lounge lamps.
test("first person review shots", async ({ page }) => {
  test.skip(!dir, "YUTOPIA_SHOTS not set");
  test.setTimeout(180_000);
  const tok = await token(ANA);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "1p", last3d: "1p" }));
  });
  await enter(page, tok, await useWorld("demo"));
  await page.waitForFunction(() => (window as any).__yutopia.tp?.mode === "first", null, { timeout: 60_000 });
  const only = process.env.YUTOPIA_SHOT;
  for (const s of SPOTS) {
    if (only && !s.name.includes(only)) continue;
    await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x, y: p.y }), s);
    await page.waitForTimeout(1200);
    await page.evaluate((p) => {
      const t = (window as any).__yutopia.tp;
      t.yaw = p.yaw;
      t.pitch = 0.08;
    }, s);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${dir}/1p-${s.name}.png` });
  }
  await page.evaluate(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "iso", last3d: "3p" }));
  });
});
