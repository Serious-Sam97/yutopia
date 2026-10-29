/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, API, BIA, clearDrafts, enter, makeDraft, test, token, useWorld } from "./helpers";

/** Into the world as `enter` does, its waits polling on a timer (a page behind another browser's
 *  gets no frames to poll on). */
async function join(page: Page, tok: string) {
  await page.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "lowest" }));
  }, tok);
  await page.goto("/");
  await page.waitForFunction(() => (window as any).__hud?.get().phase === "ready", null, {
    timeout: 90_000,
    polling: 500,
  });
  await page.waitForFunction(() => (window as any).__hud?.get().loading.on === false, null, {
    timeout: 90_000,
    polling: 500,
  });
}

// God mode, phase 3 (docs/plan/53-the-god-mode.md): what's published reaches everyone. Bia — a
// member — can't keep a draft (the API: 403) and her publish is dropped (the world server); Ana's
// draft, a path painted in the woods west of the HQ, published, is laid in Bia's game; rolled back
// at the end (a revision of its own), it's gone from hers again.

// one tile in the woods west of the HQ: chunk (−5, −4), tile (−150, −110)
const CHUNK_KEY = "-5,-4";
const TILE = { x: -150, z: -110 };
const at = (TILE.z + 128) * 32 + (TILE.x + 160);

const rev = (page: Page) => page.evaluate(() => (window as any).__yutopia.room.state.groundsRev as number);
const laid = (page: Page) =>
  page.evaluate(
    ([x, z]) => {
      const G = (window as any).__yutopia.G;
      return G ? { rev: G.editsNow().rev as number, surface: G.surfaceTileAt(x, z) as string } : null;
    },
    [TILE.x, TILE.z],
  );
const call = (tok: string, method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("God mode: a member can't; an admin's publish is laid in everyone's game, and rolled back", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const space = await useWorld("demo");
  // (Ana first, then Bia: a second browser loading its 3D view stalls the first's frames)
  const anaToken = await token(ANA);
  await enter(page, anaToken, space);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bia = await ctx.newPage();
  const biaToken = await token(BIA);
  await join(bia, biaToken);
  const was = await rev(page);
  await expect.poll(() => laid(bia).then((l) => l?.rev), { timeout: 30_000 }).toBe(was);
  const before = (await laid(bia))?.surface;
  expect(before).not.toBe("path");

  // Bia: no draft, no publish
  expect(
    (await call(biaToken, "POST", "/api/admin/grounds/drafts", { name: "Bia's", baseRev: was, data: { rev: 0 } }))
      .status,
  ).toBe(403);
  await bia.evaluate(() => (window as any).__yutopia.room.send("god:publish", { draftId: 1 }));
  await bia.waitForTimeout(1200);
  expect(await rev(bia)).toBe(was);

  // Ana: what's published, a path painted on it, as her draft; published
  const now = (await (await call(anaToken, "GET", "/api/world/edits")).json()).edits;
  const grid = Buffer.from(now.paint?.[CHUNK_KEY] ?? Buffer.alloc(32 * 32).toString("base64"), "base64");
  grid[at] = 3; // (SURFACES' "path", + 1)
  const draft = { ...now, paint: { ...now.paint, [CHUNK_KEY]: grid.toString("base64") } };
  await clearDrafts(anaToken);
  const id = await makeDraft(anaToken, "e2e: a path in the woods", () => draft);
  await page.evaluate(
    (d) => (window as any).__yutopia.room.send("god:publish", { draftId: d, note: "e2e: a path in the woods" }),
    id,
  );
  await expect.poll(() => rev(bia), { timeout: 20_000 }).toBe(was + 1);
  await expect.poll(() => laid(bia), { timeout: 20_000 }).toEqual({ rev: was + 1, surface: "path" });

  // rolled back to where it was: a revision of its own, the path gone from Bia's game
  await page.evaluate((r) => (window as any).__yutopia.room.send("god:rollback", { rev: r }), was);
  await expect.poll(() => rev(bia), { timeout: 20_000 }).toBe(was + 2);
  await expect.poll(() => laid(bia), { timeout: 20_000 }).toEqual({ rev: was + 2, surface: before });
  await ctx.close();
});
