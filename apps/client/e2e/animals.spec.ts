/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */

import { expect, type Page } from "@playwright/test";
import { ANA, loaded, test, token } from "./helpers";

// Animal life (docs/plan/126-animal-life.md) on the dev stack, as Ana: the farm's pens drawn (horses, cows, sheep,
// pigs, hens), bread from the barn's crate, a cow fed from the hand, a horse ridden — Ana sat up on its back —, the
// wild round the pond and in the woods drawn; stills of each to the scratch dir (YUTOPIA_SHOTS).
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const SHOTS = process.env.YUTOPIA_SHOTS ?? "";
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const teleport = async (page: Page, x: number, y: number) => {
  await page.evaluate(([px, py]) => (window as any).__yutopia.room.send("teleport", { to: { x: px, y: py, level: 0 } }), [x, y]);
  await page.waitForFunction(
    ([px, py]) => {
      const y = (window as any).__yutopia;
      const p = y.room.state.players.get(y.room.sessionId);
      return p.level === 0 && Math.hypot(p.x - px, p.y - py) < 1;
    },
    [x, y],
    { timeout: 20_000 },
  );
};
/** The animals drawn near me: their ids, kinds, where, what they're doing, whether their model's in. */
const drawn = (page: Page) =>
  page.evaluate(() => {
    const y = (window as any).__yutopia;
    const seen = y.animals?.seen as Map<string, any> | undefined;
    return [...(seen?.values() ?? [])].map((s) => ({
      id: s.id,
      kind: s.kind,
      x: s.x,
      y: s.y,
      doing: s.doing,
      young: s.young,
      model: !!s.body,
      visible: !!s.body?.root.visible,
    }));
  });
const did = (page: Page) => page.evaluate(() => ((window as any).__animalDid ?? []) as any[]);

// (the shared dev world's hour back to its clock, however the test ended)
test.afterEach(async ({ page }) => {
  await page
    .evaluate(() => {
      const r = (window as any).__yutopia?.room;
      r?.send("mod:hour", { h: null });
      // (the dark back on: a test may have put it to peaceful — the shared dev world's)
      r?.send("mod:dark", { mode: "normal" });
    })
    .catch(() => {});
});

test("animal life: the farm, a cow fed from the hand, a horse ridden, the wild drawn", async ({ page }) => {
  test.setTimeout(300_000);
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  const tok = await token(ANA);
  await page.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
  }, tok);
  await page.goto("/");
  await page.waitForFunction(() => (window as any).__hud?.get().phase === "ready", null, { timeout: 120_000 });
  await loaded(page);
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    (window as any).__animalDid = [];
    y.room.onMessage("animal:did", (m: unknown) => (window as any).__animalDid.push(m));
    y.room.send("mod:hour", { h: 12 });
  });

  // ── the farm ──
  await teleport(page, 470, -268);
  await page.waitForFunction(() => {
    const s = (window as any).__yutopia.animals?.seen as Map<string, any> | undefined;
    return [...(s?.values() ?? [])].some((a) => a.kind === "horse" && a.body);
  }, undefined, { timeout: 60_000 });
  const farm = await drawn(page);
  console.log(`[farm] ${farm.length} near: ${[...new Set(farm.map((a) => a.kind))].join(", ")}; with models ${farm.filter((a) => a.model).length}`);
  for (const k of ["horse", "cow", "sheep", "pig", "chicken"]) expect(farm.some((a) => a.kind === k)).toBeTruthy();
  await page.waitForTimeout(1500);
  await shot(page, "126-farm");

  // bread from the barn's crate, a cow fed from the hand
  await teleport(page, 437.5, -304.5);
  await page.evaluate(() => (window as any).__yutopia.room.send("animal:take", { food: "carrot" }));
  await page.waitForTimeout(800);
  const cow = (await drawn(page)).find((a) => a.kind === "cow" && !a.young);
  expect(cow).toBeTruthy();
  if (cow) {
    await teleport(page, cow.x + 1.6, cow.y);
    await page.evaluate((id) => (window as any).__yutopia.room.send("animal:act", { id, act: "feed" }), cow.id);
    await page.waitForFunction(() => ((window as any).__animalDid ?? []).some((m: any) => m.act === "feed"), undefined, { timeout: 10_000 });
    console.log(`[feed] ${JSON.stringify((await did(page)).find((m) => m.act === "feed"))}`);
    await shot(page, "126-cow-fed");
  }

  // a horse ridden: sat up on its back, the walker at its gaits
  const horse = (await drawn(page)).find((a) => a.kind === "horse" && !a.young);
  expect(horse).toBeTruthy();
  if (horse) {
    await teleport(page, horse.x + 1.2, horse.y);
    await page.evaluate((id) => (window as any).__yutopia.room.send("animal:act", { id, act: "mount" }), horse.id);
    await page.waitForFunction(
      (id) => (window as any).__yutopia.animals?.seen.get(id)?.doing === "ridden",
      horse.id,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(1200);
    await shot(page, "126-horse-ridden");
    await page.evaluate((id) => (window as any).__yutopia.room.send("animal:act", { id, act: "dismount" }), horse.id);
  }

  // ── the wild: the pond's banks, the woods ──
  await teleport(page, -240, -100);
  await page.waitForTimeout(6000);
  const pond = await drawn(page);
  console.log(`[pond] ${pond.length} near: ${[...new Set(pond.map((a) => a.kind))].join(", ")}`);
  await shot(page, "126-pond");
  await teleport(page, -300, -450);
  await page.waitForTimeout(6000);
  const woods = await drawn(page);
  console.log(`[woods] ${woods.length} near: ${[...new Set(woods.map((a) => a.kind))].join(", ")}`);
  await shot(page, "126-woods");
  expect(pond.length + woods.length).toBeGreaterThan(0);
});

// Animal minds (docs/plan/128-animal-minds.md) on the dev stack, as Ana with the dev overlay (`?animals=debug`): the
// wild round the fields and woods at dusk out on its day — most of it moving within a minute, not stood stock still —
// and each labelled with its mind; a still of it.
const FLYERS = ["crow", "songbird", "duck", "goose", "owl", "gull", "pigeon", "bat"];
test("animal minds: the wild at dusk goes about its day; the overlay shows their minds", async ({ page }) => {
  test.setTimeout(300_000);
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  const tok = await token(ANA);
  await page.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
  }, tok);
  await page.goto("/?animals=debug");
  await page.waitForFunction(() => (window as any).__hud?.get().phase === "ready", null, { timeout: 120_000 });
  await loaded(page);
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    y.room.send("mod:hour", { h: 18.5 });
    y.room.send("mod:dark", { mode: "peaceful" });
  });
  // the fields and woods south-west of the HQ
  await teleport(page, 60, -150);
  // (those round here: the page may have come up where the last test left her, its animals still drawn a moment)
  await page.waitForFunction((FLYERS) => {
    const s = (window as any).__yutopia.animals?.seen as Map<string, any> | undefined;
    return [...(s?.values() ?? [])].filter((a) => !FLYERS.includes(a.kind) && !["chicken", "cow", "sheep", "pig", "horse"].includes(a.kind) && Math.hypot(a.x - 60, a.y + 150) < 150).length >= 3;
  }, FLYERS, { timeout: 90_000 });
  // (on the ground: the birds go to roost at dusk — perched is right for them)
  const wild = (a: { kind: string; x: number; y: number }) =>
    !FLYERS.includes(a.kind) && !["chicken", "cow", "sheep", "pig", "horse"].includes(a.kind) && Math.hypot(a.x - 60, a.y + 150) < 150;
  const t0 = new Map((await drawn(page)).filter(wild).map((a) => [a.id, a]));
  // the overlay: labels over them, from the server's minds (while they're here: they don't stay)
  const labels = () => page.evaluate(() => [...document.querySelectorAll("div")].filter((d) => /food .* water .* sees/.test(d.textContent ?? "")).length);
  await expect.poll(labels, { timeout: 10_000 }).toBeGreaterThan(0);
  console.log(`[minds] ${await labels()} labels on the screen`);
  await shot(page, "128-dusk-minds");
  await page.waitForTimeout(45_000);
  const t1 = (await drawn(page)).filter(wild);
  // (moved on: more than 3 m in 45 s — or gone off out of the round altogether)
  const now = new Map(t1.map((a) => [a.id, a]));
  const went = [...t0.values()].filter((b) => {
    const a = now.get(b.id);
    return !a || Math.hypot(a.x - b.x, a.y - b.y) > 3;
  });
  const doings = new Map<string, number>();
  for (const a of t1) doings.set(a.doing, (doings.get(a.doing) ?? 0) + 1);
  console.log(`[minds] ${t0.size} on the ground round here, ${went.length} moved on in 45 s; now: ${[...doings].map(([d, n]) => `${d} ${n}`).join(", ")}`);
  expect(t0.size).toBeGreaterThanOrEqual(3);
  expect(went.length / t0.size).toBeGreaterThanOrEqual(0.3);
});
