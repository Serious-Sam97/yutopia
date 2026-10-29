/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, API, clearDrafts, enter, holdHour, test, token, useWorld } from "./helpers";

// God mode, phase 5 (docs/plan/53-the-god-mode.md): the shell, on Low on the dev stack. Ana goes
// in with O: her body stays, marked "building"; the camera rises 80 m over her, the land streamed
// round where it looks; it pans, turns and zooms. With no draft, her first change (a tile painted,
// as a tool will) asks a name (docs/plan/55-the-drafts.md): kept by it, counted, saved, undone and
// done again. Walk it puts her on foot where the camera
// looks (Esc: back up). Published from the dialog, it's the next revision; rolled back from the
// panel's history page. O again: out, the camera back down into her. Frames are measured on the
// machine's GPU (YUTOPIA_GPU=1; else logged). The dev world's shared: rolled back at the end.
const GPU = process.env.YUTOPIA_GPU === "1";
const SHOTS = process.env.YUTOPIA_SHOTS; // (stills of each step, for review)
if (GPU || SHOTS)
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const AT = { x: -150, z: -110 }; // (the woods west of the HQ, the Grounds' coords)
const TILE = { x: -150, z: -110, cx: -5, cz: -4 };

/** `f` run in the page on the world's hook (window.__yutopia). */
const y = (page: Page, f: (y: any) => unknown): Promise<any> => page.evaluate(`(${f})(window.__yutopia)`);
const god = (page: Page) => page.evaluate(() => (window as any).__hud.get().god);
const busy = (page: Page) =>
  page.evaluate(() => {
    const r = (window as any).__yutopia.room;
    return r.state.players.get(r.sessionId)?.busy as string;
  });
const camY = (page: Page) => page.evaluate(() => (window as any).__yutopia.tp.camera.position.y as number);
const worst = (page: Page) =>
  page.evaluate(() => {
    const W = window as any;
    const v = W.__worst;
    W.__worst = 0;
    return v as number;
  });
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/god-${name}.png` });
};
const call = (tok: string, method: string, path: string) =>
  fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } });

test("God mode's shell: in and out, the camera, the draft, walk it, publish, roll back", async ({ page }) => {
  test.setTimeout(300_000);
  const space = await useWorld("demo");
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
    const W = window as any;
    W.__worst = 0;
    let last = performance.now();
    const tick = (t: number) => {
      W.__worst = Math.max(W.__worst, t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // (what the page complains of, said)
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  page.on("console", (m) => m.type() === "error" && console.log(`[console] ${m.text().slice(0, 300)}`));
  const tok = await token(ANA);
  await clearDrafts(tok);
  await enter(page, tok, space);
  await holdHour(page, 13);
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: AT.x + 60, y: AT.z + 10, level: 0 });
  await page.waitForTimeout(4000);
  const was = await y(page, (y) => y.room.state.groundsRev);
  const standing = await y(page, (y) => y.meTile());
  const low = await camY(page);

  // in: O
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 15_000 }).toBe(true);
  await expect(page.getByText("God mode", { exact: true })).toBeVisible();
  await expect.poll(() => busy(page), { timeout: 5000 }).toBe("god");
  await expect.poll(() => camY(page), { timeout: 5000 }).toBeGreaterThan(low + 60);
  await page.waitForTimeout(1500);
  await shot(page, "01-in");
  await worst(page);

  // the camera: pans (W for a second), the land round where it looks; turns; zooms out with the wheel
  const before = await y(page, (y) => ({ ...y.tp.target }));
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1000);
  await page.keyboard.up("KeyW");
  const after = await y(page, (y) => ({ ...y.tp.target }));
  expect(Math.hypot(after.x - before.x, after.z - before.z), "panned").toBeGreaterThan(30);
  const yaw0 = (await god(page)).yaw;
  await page.keyboard.down("KeyE");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyE");
  await expect.poll(() => god(page).then((g) => Math.abs(g.yaw - yaw0) > 0.3)).toBe(true);
  const panW = await worst(page);
  await page.mouse.move(640, 400);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 120);
  await expect.poll(() => god(page).then((g) => g.up), { timeout: 5000 }).toBeGreaterThan(300);
  await page.waitForTimeout(3000);
  await shot(page, "02-high");
  const highW = await worst(page);
  console.log(
    `[god] worst frame panning at 80 m: ${Math.round(panW)} ms; zoomed out to 300+ m: ${Math.round(highW)} ms`,
  );
  if (GPU) expect(panW, "panning at 80 m").toBeLessThan(50);
  // (the body stayed where it stood)
  const still = await y(page, (y) => y.meTile());
  expect(Math.hypot(still.x - standing.x, still.y - standing.y)).toBeLessThan(0.5);
  // the pointer's readout
  await expect.poll(() => god(page).then((g) => !!g.pointer), { timeout: 5000 }).toBe(true);

  // the draft: a tile painted (as the Paint tool will), counted, saved; undone, done again
  await page.evaluate(
    ([x, z, cx, cz]) => {
      const g = (window as any).__yutopia.god;
      const d = g.draftNow();
      const k = `${cx},${cz}`;
      const at = (z - cz * 32) * 32 + (x - cx * 32);
      const prev = d.paint?.[k];
      const bytes = prev ? Uint8Array.from(atob(prev), (c) => c.charCodeAt(0)) : new Uint8Array(32 * 32);
      bytes[at] = 3; // ("path")
      g.change({ ...d, paint: { ...d.paint, [k]: btoa(String.fromCharCode(...bytes)) } });
    },
    [TILE.x, TILE.z, TILE.cx, TILE.cz],
  );
  await expect.poll(() => god(page).then((g) => g.changes)).toBe(1);
  // (no draft open: its name asked, then kept by it)
  const name = "e2e: the shell";
  await expect(page.getByRole("dialog", { name: "A new draft" })).toBeVisible();
  await page.getByRole("dialog", { name: "A new draft" }).getByRole("textbox").fill(name);
  await page.getByRole("button", { name: "Make it" }).click();
  await expect.poll(() => god(page).then((g) => g.draft.name)).toBe(name);
  await expect(page.getByText("1 change", { exact: true })).toBeVisible();
  await expect.poll(() => god(page).then((g) => g.save), { timeout: 10_000 }).toBe("saved");
  const id = (await god(page)).draft.id;
  const saved = (await (await call(tok, "GET", `/api/admin/grounds/drafts/${id}`)).json()).draft;
  expect([saved?.name, !!saved?.data.paint?.[`${TILE.cx},${TILE.cz}`]]).toEqual([name, true]);
  expect(await y(page, (y) => y.G.surfaceTileAt(-150, -110))).toBe("path");
  await page.keyboard.press("Control+z");
  await expect.poll(() => god(page).then((g) => g.changes)).toBe(0);
  expect(await y(page, (y) => y.G.surfaceTileAt(-150, -110))).not.toBe("path");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => god(page).then((g) => g.changes)).toBe(1);

  // walk it: on foot where the camera looks; Esc: back up
  await page.keyboard.press("w"); // (nothing: a tap)
  const look = await y(page, (y) => ({ ...y.tp.target }));
  await page.getByRole("button", { name: "Walk it" }).click();
  await expect.poll(() => god(page).then((g) => g.walking)).toBe(true);
  await expect(page.getByText("Walking the draft")).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, "04-walk");
  await expect.poll(() => busy(page), { timeout: 5000 }).toBe("");
  await expect
    .poll(
      async () => {
        const me = await y(page, (y) => y.meTile());
        return Math.hypot(me.x - look.x, me.y - look.z) < 3;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(() => god(page).then((g) => g.walking)).toBe(false);
  await expect.poll(() => busy(page), { timeout: 5000 }).toBe("god");

  // publish: the dialog, a note, the next revision; the draft is what's live
  const note = `e2e: the shell's path ${Date.now() % 100000}`;
  await page.getByRole("button", { name: "Publish…" }).click();
  await expect(page.getByRole("dialog", { name: `Publish “${name}”` })).toBeVisible();
  await page.getByPlaceholder("What it changes, in a line").fill(note);
  await shot(page, "03-publish");
  await page.getByRole("button", { name: `Publish revision ${was + 1}` }).click();
  await expect.poll(() => y(page, (y) => y.room.state.groundsRev), { timeout: 20_000 }).toBe(was + 1);
  try {
    await expect.poll(() => god(page).then((g) => g.changes), { timeout: 10_000 }).toBe(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // (published: gone from her drafts, nothing open)
    expect((await (await call(tok, "GET", "/api/admin/grounds/drafts")).json()).drafts).toEqual([]);
    expect((await god(page)).draft.id).toBeNull();

    // the history page: rolled back to where it was
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: "admin" } }));
    await page.getByRole("tab", { name: "God mode" }).click();
    await expect(page.getByText(note)).toBeVisible();
    await shot(page, "05-history");
    await page.getByRole("button", { name: "Roll back to here" }).first().click();
    await expect.poll(() => y(page, (y) => y.room.state.groundsRev), { timeout: 20_000 }).toBe(was + 2);
  } finally {
    // (the dev world's shared: whatever happened above, not left published)
    if ((await y(page, (y) => y.room.state.groundsRev)) === was + 1)
      await page.evaluate((r) => (window as any).__yutopia.room.send("god:rollback", { rev: r }), was);
  }
  await page.keyboard.press("Escape");

  // out: O, the camera back down into her, the draft (none) not laid
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on)).toBe(false);
  await expect.poll(() => busy(page), { timeout: 5000 }).toBe("");
  await expect.poll(() => camY(page), { timeout: 5000 }).toBeLessThan(low + 15);
  await expect.poll(() => y(page, (y) => y.G.surfaceTileAt(-150, -110))).not.toBe("path");
});
