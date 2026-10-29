/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, API, clearDrafts, enter, holdHour, makeDraft, test, token, useWorld } from "./helpers";

// God mode's drafts (docs/plan/55-the-drafts.md; the mocks 15–17), on Low on the dev stack, in the
// woods west of the HQ. With none, the first change asks a name ("e2e: the bridge"), Save says so.
// A second made from the list ("e2e: the pond") with a tile of its own; switched back (the bridge's
// tile, not the pond's); god mode left and come back to: the bridge open again. The pond renamed,
// the bridge duplicated. The bridge published from the dialog (its name the note; gone from the
// list, the history keeps its name), rolled back at once (the dev world's shared). Then a draft
// made on an older revision, opened from the list: brought up to date (its tile kept, on what's
// live); deleted from the list (asked first).
const AT = { x: -150, z: -110 }; // (the Grounds' coords)
const CHUNK = { cx: -5, cz: -4 };
const BRIDGE = -150; // (the tiles' x, both at z −110)
const POND = -146;

const y = (page: Page, f: (y: any) => unknown): Promise<any> => page.evaluate(`(${f})(window.__yutopia)`);
const god = (page: Page) => page.evaluate(() => (window as any).__hud.get().god);
const call = (tok: string, method: string, path: string) =>
  fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } });
const drafts = async (tok: string) =>
  (await (await call(tok, "GET", "/api/admin/grounds/drafts")).json()).drafts as {
    id: number;
    name: string;
    baseRev: number;
    changes: number;
  }[];
/** A tile painted "path" in the draft (as the Paint tool does): a step. */
const paint = (page: Page, x: number) =>
  page.evaluate(
    ([tx, tz, cx, cz]) => {
      const g = (window as any).__yutopia.god;
      const d = g.draftNow();
      const k = `${cx},${cz}`;
      const at = (tz - cz * 32) * 32 + (tx - cx * 32);
      const prev = d.paint?.[k];
      const bytes = prev ? Uint8Array.from(atob(prev), (c) => c.charCodeAt(0)) : new Uint8Array(32 * 32);
      bytes[at] = 3; // ("path")
      g.change({ ...d, paint: { ...d.paint, [k]: btoa(String.fromCharCode(...bytes)) } });
    },
    [x, AT.z, CHUNK.cx, CHUNK.cz],
  );
const surface = (page: Page, x: number): Promise<string> =>
  page.evaluate(([tx, tz]) => (window as any).__yutopia.G.surfaceTileAt(tx, tz), [x, AT.z]);
/** The list opened from the draft's name in the strip. */
const list = async (page: Page) => {
  if (!(await god(page)).drafts.open) await page.getByRole("button", { name: "Your drafts" }).click();
  await expect(page.getByRole("dialog", { name: "Your drafts" })).toBeVisible();
  return page.getByRole("dialog", { name: "Your drafts" });
};
const row = (page: Page, name: string) =>
  page.getByRole("dialog", { name: "Your drafts" }).getByRole("listitem").filter({ hasText: name });

test("God mode's drafts: named, two kept, switched, left and come back to, renamed, duplicated, one published", async ({
  page,
}) => {
  test.setTimeout(480_000);
  const space = await useWorld("demo");
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
  });
  const tok = await token(ANA);
  await clearDrafts(tok);
  await enter(page, tok, space);
  await holdHour(page, 13);
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: AT.x + 60, y: AT.z + 10, level: 0 });
  await page.waitForTimeout(4000);
  const was = await y(page, (y) => y.room.state.groundsRev);
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 15_000 }).toBe(true);
  await expect(page.getByRole("button", { name: "Your drafts" })).toContainText("No draft");

  try {
    // the first change asks a name; Save says so
    await paint(page, BRIDGE);
    const ask = page.getByRole("dialog", { name: "A new draft" });
    await expect(ask).toBeVisible();
    await ask.getByRole("textbox").fill("e2e: the bridge");
    await ask.getByRole("textbox").press("Enter");
    await expect.poll(() => god(page).then((g) => g.draft.name), { timeout: 30_000 }).toBe("e2e: the bridge");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved: e2e: the bridge")).toBeVisible();
    await expect
      .poll(() => drafts(tok).then((d) => d.map((x) => [x.name, x.changes])), { timeout: 30_000 })
      .toEqual([["e2e: the bridge", 1]]);

    // a second, from the list: from what's live (no tile), one of its own
    let l = await list(page);
    await l.getByPlaceholder("A name for a new draft").fill("e2e: the pond");
    await l.getByRole("button", { name: "New draft" }).click();
    await expect
      .poll(() => god(page).then((g) => [g.draft.name, g.changes, g.drafts.open]), { timeout: 30_000 })
      .toEqual(["e2e: the pond", 0, false]);
    expect(await surface(page, BRIDGE)).not.toBe("path");
    await paint(page, POND);
    await expect.poll(() => god(page).then((g) => g.save), { timeout: 30_000 }).toBe("saved");
    expect(await surface(page, POND)).toBe("path");

    // switched back: the bridge's tile, not the pond's
    l = await list(page);
    await expect(l.getByRole("listitem")).toHaveCount(2);
    await row(page, "e2e: the bridge").getByRole("button", { name: "Open" }).click();
    await expect
      .poll(() => god(page).then((g) => [g.draft.name, g.changes]), { timeout: 30_000 })
      .toEqual(["e2e: the bridge", 1]);
    await expect.poll(() => surface(page, BRIDGE), { timeout: 30_000 }).toBe("path");
    expect(await surface(page, POND)).not.toBe("path");

    // left and come back to: the bridge open again
    await page.keyboard.press("o");
    await expect.poll(() => god(page).then((g) => g.on), { timeout: 30_000 }).toBe(false);
    await page.keyboard.press("o");
    await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 15_000 }).toBe(true);
    expect((await god(page)).draft.name).toBe("e2e: the bridge");

    // the pond renamed, the bridge duplicated (⋯)
    await list(page);
    await row(page, "e2e: the pond").getByRole("button", { name: "e2e: the pond …" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    // (renaming, its name's in the box: the row's text no longer)
    const box = page.getByRole("dialog", { name: "Your drafts" }).getByRole("listitem").getByRole("textbox");
    await box.fill("e2e: the pond, renamed");
    await box.press("Enter");
    await expect
      .poll(() => drafts(tok).then((d) => d.map((x) => x.name).sort()), { timeout: 30_000 })
      .toEqual(["e2e: the bridge", "e2e: the pond, renamed"]);
    await row(page, "e2e: the bridge").getByRole("button", { name: "e2e: the bridge …" }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect.poll(() => drafts(tok).then((d) => d.length), { timeout: 30_000 }).toBe(3);
    await page.getByRole("button", { name: "Your drafts" }).click();

    // the bridge published: its name the note; gone from the list, the history keeps it
    await page.getByRole("button", { name: "Publish…" }).click();
    const pub = page.getByRole("dialog", { name: "Publish “e2e: the bridge”" });
    await expect(pub).toBeVisible();
    await expect(pub.getByRole("textbox")).toHaveValue("e2e: the bridge");
    await pub.getByRole("button", { name: `Publish revision ${was + 1}` }).click();
    await expect.poll(() => y(page, (y) => y.room.state.groundsRev), { timeout: 20_000 }).toBe(was + 1);
    await expect.poll(() => god(page).then((g) => g.draft.id), { timeout: 30_000 }).toBeNull();
    await expect
      .poll(() => drafts(tok).then((d) => d.map((x) => x.name).sort()), { timeout: 30_000 })
      .toEqual(["e2e: the bridge · copy", "e2e: the pond, renamed"]);
    const hist = (await (await call(tok, "GET", "/api/admin/grounds/revisions")).json()).revisions;
    expect([hist[0].rev, hist[0].draft, hist[0].note]).toEqual([was + 1, "e2e: the bridge", "e2e: the bridge"]);
    // (rolled back at once: the dev world's shared, not left published if what's next runs long)
    await page.evaluate((r) => (window as any).__yutopia.room.send("god:rollback", { rev: r }), was);
    await expect.poll(() => y(page, (y) => y.room.state.groundsRev), { timeout: 30_000 }).toBe(was + 2);
  } finally {
    // (whatever happened above, not left published; no drafts left)
    const now = await y(page, (y) => y.room.state.groundsRev).catch(() => null);
    if (now === was + 1)
      await page.evaluate((r) => (window as any).__yutopia.room.send("god:rollback", { rev: r }), was);
    await clearDrafts(tok);
  }
  // (nothing open over the camera: O leaves)
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on), { timeout: 30_000 }).toBe(false);
});

test("God mode's drafts: one made on an older revision brought up to date as it opens; deleted from the list", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const space = await useWorld("demo");
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
  });
  const tok = await token(ANA);
  await clearDrafts(tok);
  // the pond: made on the revision before what's live, its tile painted ("path")
  const live = (await (await call(tok, "GET", "/api/world/edits")).json()).edits;
  const older = live.rev - 1;
  expect(older, "a revision before what's live").toBeGreaterThan(0);
  const base = (await (await call(tok, "GET", `/api/admin/grounds/revisions/${older}`)).json()).revision.data;
  const k = `${CHUNK.cx},${CHUNK.cz}`;
  const grid = Buffer.from(base.paint?.[k] ?? Buffer.alloc(32 * 32).toString("base64"), "base64");
  grid[(AT.z - CHUNK.cz * 32) * 32 + (POND - CHUNK.cx * 32)] = 3;
  const id = await makeDraft(tok, "e2e: the pond", () => ({
    ...base,
    paint: { ...base.paint, [k]: grid.toString("base64") },
  }));
  // (made on the older one: the API takes the base it's given)
  await fetch(`${API}/api/admin/grounds/drafts/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tok}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      baseRev: older,
      data: { ...base, paint: { ...base.paint, [k]: grid.toString("base64") } },
      changes: 1,
    }),
  });
  await makeDraft(tok, "e2e: another");
  await enter(page, tok, space);
  await holdHour(page, 13);
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: AT.x + 60, y: AT.z + 10, level: 0 });
  await page.waitForTimeout(4000);
  try {
    await page.keyboard.press("o");
    await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 30_000 }).toBe(true);
    // (the newest open: "another")
    expect((await god(page)).draft.name).toBe("e2e: another");
    // the pond: made on an older revision, brought up to date as it opens (its tile kept)
    const l = await list(page);
    await expect(row(page, "e2e: the pond")).toContainText("brought up to date");
    await row(page, "e2e: the pond").getByRole("button", { name: "Open" }).click();
    await expect
      .poll(() => god(page).then((g) => [g.draft.name, g.changes]), { timeout: 30_000 })
      .toEqual(["e2e: the pond", 1]);
    await expect.poll(() => surface(page, POND), { timeout: 30_000 }).toBe("path");
    await expect
      .poll(() => drafts(tok).then((d) => d.find((x) => x.name === "e2e: the pond")?.baseRev), {
        timeout: 30_000,
      })
      .toBe(live.rev);

    // deleted from the list, asked first: nothing open
    await list(page);
    await row(page, "e2e: the pond").getByRole("button", { name: "e2e: the pond …" }).click();
    await page.getByRole("menuitem", { name: "Delete…" }).click();
    await expect(l.getByText("Delete “e2e: the pond”? It can't be undone.")).toBeVisible();
    await row(page, "e2e: the pond").getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(() => god(page).then((g) => g.draft.id), { timeout: 30_000 }).toBeNull();
    await expect
      .poll(() => drafts(tok).then((d) => d.map((x) => x.name)), { timeout: 30_000 })
      .toEqual(["e2e: another"]);
    expect(await surface(page, POND)).not.toBe("path");
  } finally {
    await clearDrafts(tok);
  }
  await page.keyboard.press("Escape");
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on), { timeout: 30_000 }).toBe(false);
});
