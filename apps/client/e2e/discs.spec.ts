/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { execFileSync } from "node:child_process";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, type Page, request } from "@playwright/test";
import { ANA, API, enter, test, token, useWorld } from "./helpers";

// The disc console's library (docs/plan/23-disc-console.md P2), end to end:
// Ana puts a disc rack in the Lab and opens it. No BIOS yet: it says so; a
// 512 KB file that isn't a known dump is refused, the dev stack's test BIOS
// (YUTOPIA_TEST_BIOS_MD5 in the API's .env: 512 KB of 0x42) goes in with its
// model. Then a ~40 MB disc (our test card, padded: a .cue and its .bin) comes
// in pieces — the tab closed after two of them; a new tab, the same files picked
// again, carries on (fewer pieces the second time) and puts it in the rack.
// Last, the host's side: the disc downloaded into this browser's copy, stopped
// at 10 MB, then carried on with Range.
const ROOT = resolve(__dirname, "../../..");
const SHOTS = process.env.YUTOPIA_SHOTS ? resolve(ROOT, process.env.YUTOPIA_SHOTS) : null; // review shots (opt-in)
const TITLE = "E2E Disc";

const api = async (tok: string) =>
  request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Authorization: `Bearer ${tok}`, Accept: "application/json" },
  });

// e2e leftovers (a failed run's): the disc, the test BIOS
async function tidy(tok: string) {
  const c = await api(tok);
  const games = (await (await c.get(`/api/games`)).json()).games ?? [];
  for (const g of games.filter((x: any) => x.title === TITLE)) await c.delete(`/api/games/${String(g.id).slice(2)}`);
  const bios = (await (await c.get(`/api/bios`)).json()).bios ?? [];
  for (const b of bios.filter((x: any) => x.model === "Test BIOS")) await c.delete(`/api/bios/${b.id}`);
}

async function putRack(page: Page, id: string) {
  // (racks a failed run left behind go first)
  const old = await page.evaluate(() =>
    [...(window as any).__yutopia.room.state.objects.keys()].filter((k: string) => k.startsWith("e2e-rack-")),
  );
  if (old.length) {
    await page.evaluate((ids) => (window as any).__yutopia.send("obj:removeMany", { ids }), old);
    await page.waitForTimeout(old.length * 600 + 500);
  }
  const sp = await page.evaluate(() => (window as any).__yutopia.map.spawn);
  for (const [dx, dy] of [
    [-2, -4],
    [2, -4],
    [-4, 2],
    [3, 3],
    [-6, -2],
  ]) {
    const at = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
    await page.evaluate((q) => (window as any).__yutopia.send("obj:put", q), { id, kind: "disc_rack", ...at, rot: 0 });
    await page.waitForTimeout(700);
    if (await page.evaluate((i) => !!(window as any).__yutopia.room.state.objects.get(i), id)) return;
  }
  throw new Error("no room for the rack");
}
const openRack = async (page: Page, id: string) => {
  await page.evaluate((i) => (window as any).__hud.set({ panel: { kind: "games", objectId: i } }), id);
  await expect(page.getByRole("heading", { name: "DISC RACK" })).toBeVisible();
};
// the rack's "Bring your disc": the files, a title
async function pickDisc(page: Page, files: string[]) {
  await page.getByText("+ Bring your disc").click();
  await page.locator("input[type=file][multiple]").setInputFiles(files);
  await page.getByPlaceholder("testcard").fill(TITLE);
}

test("disc rack: the BIOS, a disc in pieces carried on after the tab closed, then downloaded and carried on", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const tok = await token(ANA);
  const space = await useWorld("lab");
  await tidy(tok);
  const dir = mkdtempSync(join(tmpdir(), "yutopia-disc-"));
  execFileSync("node", [join(ROOT, "tools/test-rom-ps1.mjs"), "--pad", "40", "--out", dir]);
  const files = [join(dir, "testcard.cue"), join(dir, "testcard.bin")];
  const sizes = files.map((f) => statSync(f).size);
  const pieces = sizes.reduce((n, s) => n + Math.ceil(s / (8 * 1024 * 1024)), 0);
  expect(pieces).toBeGreaterThan(4);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const rack = `e2e-rack-${Date.now().toString(36)}`;
  let page = await ctx.newPage();
  await enter(page, tok, space);
  await putRack(page, rack);
  try {
    await openRack(page, rack);

    // the BIOS: none yet; not a known dump; the test one
    await expect(page.getByText("This console needs its BIOS")).toBeVisible();
    // (by what the server says: a toast can wait behind others)
    const biosSaid = () => page.waitForResponse((r) => r.request().method() === "POST" && /\/bios$/.test(r.url()));
    let said = biosSaid();
    await page.getByTestId("bios-file").setInputFiles({
      name: "scph5501.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(512 * 1024, 0x13),
    });
    const refused = await said;
    expect(refused.status()).toBe(422);
    expect((await refused.json()).message).toMatch(/isn't one we know/);
    said = biosSaid();
    await page.getByTestId("bios-file").setInputFiles({
      name: "scph5501.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(512 * 1024, 0x42),
    });
    expect((await said).status()).toBe(201);
    await expect(page.getByTestId("bios-list")).toContainText("Test BIOS");
    await expect(page.getByText("This console needs its BIOS")).toBeHidden();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/rack-bios.png` });

    // the disc, in pieces: the tab goes after two of them (each piece held back a
    // moment here, or a local upload is over before the tab can go)
    await page.route("**/games/uploads/*/*/*", async (route) => {
      if (route.request().method() === "PUT") await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    let sent = 0;
    page.on("requestfinished", (r) => {
      if (r.method() === "PUT" && r.url().includes("/games/uploads/")) sent++;
    });
    await pickDisc(page, files);
    await page.getByRole("button", { name: "Put it in the rack" }).click();
    await expect(page.getByTestId("upload-progress")).toBeVisible();
    await expect.poll(() => sent, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/rack-upload.png` });
    await page.close();

    // a new tab, the same files: it carries on
    page = await ctx.newPage();
    let again = 0;
    page.on("requestfinished", (r) => {
      if (r.method() === "PUT" && r.url().includes("/games/uploads/")) again++;
    });
    await enter(page, tok, space);
    await openRack(page, rack);
    await pickDisc(page, files);
    const finished = page.waitForResponse((r) => r.url().endsWith("/finish"), { timeout: 120_000 });
    await page.getByRole("button", { name: "Put it in the rack" }).click();
    expect((await finished).status()).toBe(201);
    expect(again, "pieces sent the second time").toBeLessThan(pieces);
    await expect(page.locator("li", { hasText: TITLE })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/rack-done.png` });
    const c = await api(tok);
    const game = ((await (await c.get(`/api/games`)).json()).games as any[]).find((g) => g.title === TITLE);
    expect(game.system).toBe("ps1");
    expect(game.files.map((f: any) => f.name)).toEqual(["testcard.cue", "testcard.bin"]);
    expect(game.files.map((f: any) => f.bytes)).toEqual(sizes);

    // the host's side: into this browser's copy, stopped at 10 MB, carried on with
    // Range (on a page of its own: the world tab stays for the clean-up)
    const dev = await ctx.newPage();
    await dev.goto("/dev/emu");
    await dev.waitForFunction(() => (window as any).__emuDev?.cacheGame);
    await dev.evaluate(() => (window as any).__emuDev.forgetGames());
    const ranges: string[] = [];
    dev.on("request", (r) => {
      if (r.url().includes(`/games/${String(game.id).slice(2)}/files/`)) ranges.push(r.headers().range ?? "");
    });
    const first = await dev.evaluate((id) => (window as any).__emuDev.cacheGame(id, 10 * 1024 * 1024), game.id);
    expect(first.stopped).toBe(true);
    const whole = await dev.evaluate((id) => (window as any).__emuDev.cacheGame(id), game.id);
    expect(whole.sizes).toEqual(sizes);
    expect(whole.names).toEqual(["testcard.cue", "testcard.bin"]);
    expect(
      ranges.some((r) => /^bytes=[1-9]\d*-$/.test(r)),
      `a request carried on with Range (${ranges.join(" | ")})`,
    ).toBe(true);
    // a third time: from the copy, nothing downloaded
    const before = ranges.length;
    await dev.evaluate((id) => (window as any).__emuDev.cacheGame(id), game.id);
    expect(ranges.length).toBe(before);
    await dev.evaluate(() => (window as any).__emuDev.forgetGames());
  } finally {
    // the rack away, from a tab in the world (the last one, or a new one)
    const p = !page.isClosed() && !page.url().includes("/dev/") ? page : await ctx.newPage();
    if (p !== page) await enter(p, tok, space);
    await p.evaluate((i) => (window as any).__yutopia.send("obj:removeMany", { ids: [i] }), rack);
    await p.waitForTimeout(1500);
    await tidy(tok);
    await ctx.close();
  }
});
