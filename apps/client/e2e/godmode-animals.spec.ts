/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */

import { expect, type Page } from "@playwright/test";
import { ANA, API, loaded, makeDraft, test, token } from "./helpers";

// The land's own animal places and the dark's nests in God mode (docs/plan/127-default-nests.md) on the dev stack, as
// Ana: the Animals tool (J) draws the land's own groups round the camera and today's dark nests; one of the land's
// picked with a click and taken away (Delete), another moved (the panel's Move, a click); published — the first's
// animals gone from the world, the second's out where it was moved, by its own key —; rolled back. Its own draft,
// deleted after; Ana's other drafts left alone (the shared dev world).
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
// (the woods and fields south-west of the HQ: deer, hares, crows about)
const AT = { x: 60, z: -150 };
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
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, on: v.z < 1 && Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9 };
    },
    [gx, gz],
  );
const json = (tok: string) => ({
  Authorization: `Bearer ${tok}`,
  Accept: "application/json",
  "Content-Type": "application/json",
});
/** The land's own places the tool draws now (its private list: a test's look). */
const shown = (page: Page): Promise<{ key: string; x: number; z: number; species: string; kind: string }[]> =>
  page.evaluate(() => ((window as any).__yutopia.god?.animalsTool()?.shownLand ?? []).map((p: any) => ({ ...p })));
const animalsOf = (page: Page, key: string) =>
  page.evaluate((k) => {
    const out: { id: string; x: number; y: number }[] = [];
    (window as any).__yutopia.room.state.animals?.forEach((a: any) => {
      if (String(a.id).startsWith(`${k}#`)) out.push({ id: a.id, x: a.x, y: a.y });
    });
    return out;
  }, key);

test("God mode's animals: the land's own drawn and the day's dark nests; one taken away, one moved; published; rolled back", async ({
  page,
}) => {
  test.setTimeout(300_000);
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  const tok = await token(ANA);
  const draftId = await makeDraft(tok, "e2e: animals");
  let rev0: number | null = null;
  let published = false;
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
    await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 12 }));
    await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: AT.x, y: AT.z, level: 0 });
    await page.waitForTimeout(3000);
    await loaded(page);
    rev0 = await page.evaluate(() => (window as any).__yutopia.room.state.groundsRev);
    await page.keyboard.press("o");
    await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 20_000 }).toBe(true);
    await page.mouse.move(640, 400);
    // (out: the land's own are a hundred metres and more apart)
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1500);
    // the Animals tool (J): the land's own round the camera, the day's dark nests
    await page.keyboard.press("j");
    await expect.poll(() => god(page).then((g) => g.tool)).toBe("animals");
    await expect.poll(() => god(page).then((g) => g.animals.inView.land), { timeout: 60_000 }).toBeGreaterThan(3);
    await expect.poll(() => god(page).then((g) => g.animals.inView.dark), { timeout: 30_000 }).toBeGreaterThan(0);
    const g0 = await god(page);
    console.log(`[animals] near the camera: ${g0.animals.inView.land} the land's own, ${g0.animals.inView.dark} dark nests`);
    // the layers: off and on
    await page.getByRole("button", { name: /^The dark/ }).click();
    await expect.poll(() => god(page).then((g) => g.animals.inView.dark)).toBe(0);
    await page.getByRole("button", { name: /^The dark/ }).click();
    // two of the land's own on the screen, apart: the nearest the player first
    const pick = async (not: string[] = []) => {
      for (const p of (await shown(page)).sort((a, b) => Math.hypot(a.x - AT.x, a.z - AT.z) - Math.hypot(b.x - AT.x, b.z - AT.z))) {
        if (not.includes(p.key) || p.kind === "den") continue;
        const s = await toScreen(page, p.x, p.z);
        if (s.on) return { ...p, s };
      }
      return null;
    };
    const gone = await pick();
    expect(gone, "one of the land's own on the screen").toBeTruthy();
    if (!gone) return;
    await page.mouse.click(gone.s.x, gone.s.y);
    await expect.poll(() => god(page).then((g) => g.animals.sel)).toBe(gone.key);
    await expect(page.getByText(/^The land's own:/)).toBeVisible();
    await page.keyboard.press("Delete");
    await expect.poll(() => god(page).then((g) => g.animals.sel)).toBe(null);
    // another moved to by the player (the panel's Move, a click there)
    const moved = await pick([gone.key]);
    expect(moved, "another on the screen").toBeTruthy();
    if (!moved) return;
    await page.mouse.click(moved.s.x, moved.s.y);
    await expect.poll(() => god(page).then((g) => g.animals.sel)).toBe(moved.key);
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await expect.poll(() => god(page).then((g) => g.animals.moving)).toBe(true);
    const to = { x: AT.x + 6, z: AT.z + 6 };
    const ts = await toScreen(page, to.x, to.z);
    await page.mouse.click(ts.x, ts.y);
    await expect.poll(() => god(page).then((g) => g.animals.moving)).toBe(false);
    const draft = await page.evaluate(() => (window as any).__yutopia.god.draftNow());
    expect(draft.animals?.remove ?? []).toContain(gone.key);
    const ch = draft.animals?.change?.[moved.key];
    expect(ch?.species).toBe(moved.species);
    expect(Math.hypot((ch?.x ?? 0) - to.x, (ch?.z ?? 0) - to.z)).toBeLessThan(4);
    // published (saved first): the first's gone from the world, the second's out where it was moved
    await expect.poll(() => god(page).then((g) => g.save), { timeout: 15_000 }).toBe("saved");
    expect((await god(page)).draft.id).toBe(draftId);
    await page.evaluate((d) => (window as any).__yutopia.room.send("god:publish", { draftId: d, note: "e2e: animals" }), draftId);
    await expect.poll(() => page.evaluate(() => (window as any).__yutopia.room.state.groundsRev), { timeout: 30_000 }).toBeGreaterThan(rev0 ?? 0);
    published = true;
    await page.keyboard.press("o");
    await expect.poll(() => god(page).then((g) => g.on)).toBe(false);
    await expect.poll(() => animalsOf(page, gone.key).then((a) => a.length), { timeout: 30_000 }).toBe(0);
    await expect
      .poll(
        () => animalsOf(page, moved.key).then((a) => a.some((q) => Math.hypot(q.x - to.x, q.y - to.z) < 30)),
        { timeout: 60_000 },
      )
      .toBe(true);
  } finally {
    if (rev0 !== null && published) {
      const r = rev0;
      await page.evaluate((v) => (window as any).__yutopia.room.send("god:rollback", { rev: v }), r).catch(() => {});
      await page.waitForTimeout(3000);
    }
    await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: null })).catch(() => {});
    await fetch(`${API}/api/admin/grounds/drafts/${draftId}`, { method: "DELETE", headers: json(tok) });
  }
});
