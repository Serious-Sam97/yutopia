/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */

import { expect, type Page } from "@playwright/test";
import type { NpcDef } from "@yutopia/shared/npc";
import { ANA, API, loaded, makeDraft, test, token } from "./helpers";

// NPCs on the map (docs/plan/121-npcs-on-the-map.md) on the dev stack, as Ana in God mode by the street of houses: one
// of the cast (made for this, on the cast page's API) held from the NPCs tool's list (N) and put down with a click;
// made a wanderer with a circle, given house-w0 as their home; the draft published — they're in the world
// (`place:<key>`); rolled back — gone. Its own draft and its own NPC, both deleted after; the world's fixture and
// Ana's other drafts left alone (no useWorld, no clearDrafts: the shared dev world).
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const AT = { x: 418, z: -446 };
const god = (page: Page) => page.evaluate(() => (window as any).__hud.get().god);
const toScreen = (page: Page, gx: number, gz: number) =>
  page.evaluate(
    ([x, z]) => {
      const y = (window as any).__yutopia;
      const t = y.tp;
      const f = t.groundsFrame();
      const v = t.camera.position
        .clone()
        .set(x, y.G.terrainAt(x, z) + f.y + 0.2, z)
        .project(t.camera);
      const r = t.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    [gx, gz],
  );
const json = (tok: string) => ({
  Authorization: `Bearer ${tok}`,
  Accept: "application/json",
  "Content-Type": "application/json",
});

test("God mode's NPCs: one held from the list and placed, a wanderer with a home; published, in the world; rolled back", async ({
  page,
}) => {
  test.setTimeout(240_000);
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  const tok = await token(ANA);
  // (one of the cast, made for this)
  const made = (await (
    await fetch(`${API}/api/admin/npcs`, {
      method: "POST",
      headers: json(tok),
      body: JSON.stringify({ npc: { name: "E2E Wren", behaviour: { type: "stand" } } }),
    })
  ).json()) as { npc: NpcDef };
  const key = made.npc.key;
  const draftId = await makeDraft(tok, "e2e: npcs");
  try {
    await page.addInitScript((t) => {
      localStorage.setItem("yutopia:token", t);
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
    }, tok);
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__hud?.get().phase === "ready", null, { timeout: 120_000 });
    await loaded(page);
    await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: AT.x + 4, y: AT.z + 4, level: 0 });
    await page.waitForTimeout(3000);
    await loaded(page);
    const rev0 = await page.evaluate(() => (window as any).__yutopia.room.state.groundsRev);
    await page.keyboard.press("o");
    await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 20_000 }).toBe(true);
    await page.mouse.move(640, 400);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -240);
    await page.waitForTimeout(2000);
    // the NPCs tool (N): the cast listed; Wren held
    await page.keyboard.press("n");
    await expect.poll(() => god(page).then((g) => g.tool)).toBe("npcs");
    await expect(page.locator(`[data-god-npc="${key}"]`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-god-npc="vortex"]')).toHaveCount(0);
    await page.locator(`[data-god-npc="${key}"]`).click();
    await expect.poll(() => god(page).then((g) => g.npcs.held)).toBe(key);
    // put down by the houses
    const p0 = await toScreen(page, AT.x, AT.z);
    await page.mouse.move(p0.x, p0.y);
    await page.waitForTimeout(800);
    await page.mouse.click(p0.x, p0.y);
    await expect
      .poll(() =>
        page.evaluate((k) => (window as any).__yutopia.god.draftNow().npcs?.add?.find((p: any) => p.key === k), key),
      )
      .toMatchObject({ key, level: 0 });
    const place = await page.evaluate(
      (k) => (window as any).__yutopia.god.draftNow().npcs.add.find((p: any) => p.key === k),
      key,
    );
    expect(Math.hypot(place.x - AT.x, place.z - AT.z), "put down where clicked").toBeLessThan(1.5);
    expect((await god(page)).npcs.sel).toBe(key);
    await page.screenshot({ path: "test-results/godmode-npcs-placed.png" });

    // a wanderer, a circle of 8 m; home: house-w0 clicked
    await page.locator('[data-god-npc-type="wander"]').click();
    await page.locator("[data-god-npc-radius]").fill("8");
    await page.locator("[data-god-npc-pick-home]").click();
    const ph = await toScreen(page, 407, -444);
    await page.mouse.click(ph.x, ph.y);
    await expect
      .poll(() =>
        page.evaluate((k) => (window as any).__yutopia.god.draftNow().npcs.add.find((p: any) => p.key === k), key),
      )
      .toMatchObject({ type: "wander", r: 8, home: "house-w0" });

    // published: in the world
    await expect.poll(() => god(page).then((g) => g.save), { timeout: 15_000 }).toBe("saved");
    const id = (await god(page)).draft.id;
    expect(id).toBe(draftId);
    await page.evaluate(
      (d) => (window as any).__yutopia.room.send("god:publish", { draftId: d, note: "e2e: npcs" }),
      id,
    );
    await expect
      .poll(() => page.evaluate(() => (window as any).__yutopia.room.state.groundsRev), { timeout: 20_000 })
      .toBeGreaterThan(rev0);
    await expect
      .poll(() => page.evaluate((k) => !!(window as any).__yutopia.room.state.npcs.get(`place:${k}`), key), {
        timeout: 15_000,
      })
      .toBe(true);
    expect(await page.evaluate((k) => (window as any).__yutopia.room.state.npcs.get(`place:${k}`).name, key)).toBe(
      "E2E Wren",
    );

    // a second draft moves her: the world's Wren not drawn for Ana (the draft's is), back once the draft's let go
    await page.evaluate(() => (window as any).__yutopia.god.newDraft("e2e: npcs 2"));
    await expect.poll(() => god(page).then((g) => g.draft.name)).toBe("e2e: npcs 2");
    const draft2 = (await god(page)).draft.id;
    await page.evaluate((k) => {
      const g = (window as any).__yutopia.god;
      const d = g.draftNow();
      const add = d.npcs.add.map((p: any) => (p.key === k ? { ...p, x: p.x + 4 } : p));
      g.change({ ...d, npcs: { ...d.npcs, add } });
    }, key);
    await expect
      .poll(() => page.evaluate((k) => (window as any).__yutopia.god.npcsHidden().has(`place:${k}`), key))
      .toBe(true);
    await expect
      .poll(() => page.evaluate((k) => (window as any).__yutopia.model.hasAvatar(`npc:place:${k}`), key))
      .toBe(false);
    await page.evaluate(() => (window as any).__yutopia.god.undo());
    await expect
      .poll(() => page.evaluate((k) => (window as any).__yutopia.god.npcsHidden().has(`place:${k}`), key))
      .toBe(false);
    await fetch(`${API}/api/admin/grounds/drafts/${draft2}`, { method: "DELETE", headers: json(tok) });

    // rolled back: gone
    const rev1 = await page.evaluate(() => (window as any).__yutopia.room.state.groundsRev);
    await page.evaluate((r) => (window as any).__yutopia.room.send("god:rollback", { rev: r }), rev0);
    await expect
      .poll(() => page.evaluate(() => (window as any).__yutopia.room.state.groundsRev), { timeout: 20_000 })
      .toBeGreaterThan(rev1);
    await expect
      .poll(() => page.evaluate((k) => !!(window as any).__yutopia.room.state.npcs.get(`place:${k}`), key), {
        timeout: 15_000,
      })
      .toBe(false);
    await page.keyboard.press("Escape");
  } finally {
    await fetch(`${API}/api/admin/npcs/${key}`, { method: "DELETE", headers: json(tok) });
    await fetch(`${API}/api/admin/grounds/drafts/${draftId}`, { method: "DELETE", headers: json(tok) });
  }
});

test("God mode's insides: the bakery's ground storey shown, its outside cut away; one placed on it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  const made = (await (
    await fetch(`${API}/api/admin/npcs`, {
      method: "POST",
      headers: json(tok),
      body: JSON.stringify({ npc: { name: "E2E Baker", behaviour: { type: "counter" } } }),
    })
  ).json()) as { npc: NpcDef };
  const key = made.npc.key;
  const draftId = await makeDraft(tok, "e2e: npcs inside");
  try {
    await page.addInitScript((t) => {
      localStorage.setItem("yutopia:token", t);
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
    }, tok);
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__hud?.get().phase === "ready", null, { timeout: 120_000 });
    await loaded(page);
    await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: 465, y: -408, level: 0 });
    await page.waitForTimeout(3000);
    await loaded(page);
    await page.keyboard.press("o");
    await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 20_000 }).toBe(true);
    await page.keyboard.press("n");
    await expect(page.locator(`[data-god-npc="${key}"]`)).toBeVisible({ timeout: 15_000 });
    // the bakery's ground storey: shown (the 3D view on its floor), the camera over it, the bakery cut away
    const level = await page.evaluate(
      () =>
        (window as any).__yutopia.god
          .npcsTool()
          .floors()
          .filter((f: any) => f.cut === "bakery")
          .sort((a: any, b: any) => a.level - b.level)[0]?.level,
    );
    expect(level, "the bakery has a ground storey").toBeGreaterThanOrEqual(32);
    await page.locator("[data-god-npc-floor]").selectOption(String(level));
    await expect.poll(() => page.evaluate(() => (window as any).__yutopia.viewLevel())).toBe(level);
    await expect.poll(() => page.evaluate(() => (window as any).__yutopia.tp.god?.cut)).toBe("bakery");
    await page.waitForTimeout(2500);
    // held and put down in the middle of the screen (the floor's middle, the camera over it)
    await page.locator(`[data-god-npc="${key}"]`).click();
    await page.mouse.move(640, 400);
    await page.waitForTimeout(800);
    await page.mouse.click(640, 400);
    await expect
      .poll(() =>
        page.evaluate((k) => (window as any).__yutopia.god.draftNow().npcs?.add?.find((p: any) => p.key === k), key),
      )
      .toMatchObject({ key, level });
    const p = await page.evaluate(
      (k) => (window as any).__yutopia.god.draftNow().npcs.add.find((q: any) => q.key === k),
      key,
    );
    // (inside the bakery's plot: x 458–472, z −428–−414)
    expect(p.x).toBeGreaterThan(457);
    expect(p.x).toBeLessThan(473);
    expect(p.z).toBeGreaterThan(-429);
    expect(p.z).toBeLessThan(-413);
    await page.screenshot({ path: "test-results/godmode-npcs-inside.png" });
    // back out: the land again
    await page.locator("[data-god-npc-floor]").selectOption("");
    await expect.poll(() => page.evaluate(() => (window as any).__yutopia.tp.god?.cut ?? null)).toBe(null);
    await page.keyboard.press("Escape");
  } finally {
    await fetch(`${API}/api/admin/npcs/${key}`, { method: "DELETE", headers: json(tok) });
    await fetch(`${API}/api/admin/grounds/drafts/${draftId}`, { method: "DELETE", headers: json(tok) });
  }
});
