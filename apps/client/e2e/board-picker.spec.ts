/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page, request } from "@playwright/test";
import { ANA, API, enter, spaceId, test, token } from "./helpers";

// Which board a board wall shows, in the Lab (its project starts with no
// boards; everything made here is taken away after): a wall from the catalog
// asks which board; a new board made right there goes up on it; Change board
// swaps it; build mode's item toolbar picks too; the next wall from the
// catalog comes with the board no wall shows yet.

const remove = (page: Page, id: string) =>
  page.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id);
const refOf = (page: Page, id: string) =>
  page.evaluate((i) => (window as any).__yutopia.room.state.objects.get(i)?.refId ?? null, id);
const setBuild = (page: Page, b: Record<string, unknown>) =>
  page.evaluate((p) => {
    const h = (window as any).__hud;
    h.set({ build: { ...h.get().build, ...p } });
  }, b);
const ids = (page: Page) => page.evaluate(() => [...(window as any).__yutopia.room.state.objects.keys()] as string[]);
async function at(page: Page, x: number, y: number, z = 0) {
  return page.evaluate(
    ([tx, ty, tz]) => {
      const e = (window as any).__yutopia.engine;
      const r = e.app.canvas.getBoundingClientRect();
      const s = e.worldToClient(tx, ty, tz);
      return { x: r.left + s.x, y: r.top + s.y };
    },
    [x, y, z],
  );
}

test("board walls: pick a board, make one, change it, from the panel and the toolbar", async ({ page }) => {
  test.setTimeout(150_000);
  const tok = await token(ANA);
  const space = await spaceId(tok, "Yutopia Lab");
  await enter(page, tok, space);
  const api = await request.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${tok}`, Accept: "application/json" },
  });
  // what a run that didn't finish left: its boards, and the walls showing them
  const listed: { id: number; name: string }[] = (
    await (await api.get(`${API}/api/yutopia/spaces/${space}/boards`)).json()
  ).boards;
  const stale = listed.filter((b) => b.name.startsWith("E2E ")).map((b) => b.id);
  await page.evaluate((refs) => {
    const w = (window as any).__yutopia;
    for (const o of [...w.room.state.objects.values()])
      if (o.kind === "board_wall" && refs.includes(o.refId)) w.send("obj:remove", { id: o.id });
  }, stale);
  for (const id of stale) await api.delete(`${API}/api/boards/${id}`);
  await page.evaluate(() => (window as any).__yutopia.loadBoards());
  const boardsBefore = listed.filter((b) => !stale.includes(b.id)).map((b) => b.id);
  await expect
    .poll(() => page.evaluate(() => (window as any).__hud.get().boards.map((b: any) => b.id)))
    .toEqual(boardsBefore);
  await expect
    .poll(() =>
      page.evaluate(
        (refs) => [...(window as any).__yutopia.room.state.objects.values()].some((o: any) => refs.includes(o.refId)),
        stale,
      ),
    )
    .toBe(false);
  // three tiles of solid wall with floor in front, nothing hung near, two
  // board walls side by side, or apart)
  const spots = (await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.map;
    const solid = (ch: string | undefined) => !!ch && "pwfbk".includes(ch);
    const floor = (x: number, y: number) => {
      const ch = m.tiles[y]?.[x];
      return !!ch && ch !== " " && ch !== "#";
    };
    const hung = [...w.room.state.objects.values()].filter((o: any) =>
      [
        "board_wall",
        "screen_wall",
        "whiteboard",
        "notice_board",
        "poster",
        "frame",
        "clock",
        "neon",
        "tv_wall",
        "tv_hd",
        "tv_giant",
        "projector_screen",
        "cinema_screen",
        "acoustic_panel",
      ].includes(o.kind),
    );
    const near = (x: number, y: number) => hung.some((o: any) => o.y === y && o.x > x - 6 && o.x < x + 3);
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < m.height - 2; y++)
      for (let x = 1; x < m.width - 4; x++) {
        if (![0, 1, 2].every((d) => solid(m.hWalls[y]?.[x + d]) && floor(x + d, y) && floor(x + d, y + 1))) continue;
        if ([1, 2].some((d) => (m.vWalls[y]?.[x + d] ?? ".") !== ".")) continue;
        if (near(x, y) || out.some((s) => s.y === y && Math.abs(s.x - x) < 4)) continue;
        out.push({ x, y });
        if (out.length === 2) return out;
      }
    return out;
  })) as { x: number; y: number }[];
  expect(spots.length, "the Lab has room for two board walls").toBe(2);

  const stamp = Date.now().toString(36);
  const made: string[] = [];
  const boards: number[] = [];
  // a board wall from the catalog, pointed at the wall's face
  async function hang(s: { x: number; y: number }) {
    await page.evaluate(
      ([cx, cy]) => (window as any).__yutopia.engine.pinCamera({ x: cx, y: cy, zoom: 2 }),
      [s.x + 1.5, s.y + 2],
    );
    await setBuild(page, { on: true, tool: "furniture", mode: "place", kind: "board_wall", props: null, rot: 0 });
    await page.waitForFunction(() => !!(window as any).__yutopia.build, null, { timeout: 15_000 });
    await page.waitForTimeout(500);
    const had = await ids(page);
    const p = await at(page, s.x + 1.5, s.y + 0.1, 46);
    await page.mouse.move(p.x - 30, p.y - 30);
    await page.mouse.move(p.x, p.y, { steps: 4 });
    await page.waitForTimeout(300);
    await page.mouse.click(p.x, p.y);
    await expect.poll(async () => (await ids(page)).find((k) => !had.includes(k)) ?? "").not.toBe("");
    const id = (await ids(page)).find((k) => !had.includes(k)) as string;
    made.push(id);
    return id;
  }
  const open = (id: string) =>
    page.evaluate((i) => (window as any).__hud.set({ panel: { kind: "board", objectId: i } }), id);
  const dialog = () => page.getByRole("dialog");

  try {
    // ── a wall from the catalog, and no boards yet: it asks, and offers a new one
    const a = await hang(spots[0]);
    if (!boardsBefore.length) expect(await refOf(page, a)).toBe(0);
    await setBuild(page, { on: false });
    await open(a);
    if (!boardsBefore.length) {
      await expect(dialog()).toHaveAccessibleName("Pick a board");
      await expect(dialog()).toContainText("doesn't show a board yet");
      await expect(dialog()).toContainText("no boards yet");
    }
    await page.screenshot({ path: test.info().outputPath("pick-empty.png") });

    // ── make one right there: it goes up on the wall, the board opens
    await dialog().getByRole("textbox", { name: "Board name" }).fill(`E2E Roadmap ${stamp}`);
    await dialog().getByRole("button", { name: "Create" }).click();
    await expect(dialog()).toHaveAccessibleName(`E2E Roadmap ${stamp}`, { timeout: 15_000 });
    const first = await refOf(page, a);
    expect(first).toBeGreaterThan(0);
    boards.push(first);
    await expect(dialog().getByRole("button", { name: /Change board/ })).toBeVisible();

    // ── Change board: a second one (Scrum), then back to the first from the list
    await dialog()
      .getByRole("button", { name: /Change board/ })
      .click();
    await expect(dialog()).toHaveAccessibleName("Change board");
    await expect(dialog().getByRole("button", { name: new RegExp(`E2E Roadmap ${stamp}`) })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await dialog().getByRole("textbox", { name: "Board name" }).fill(`E2E Sprint ${stamp}`);
    await dialog().getByRole("button", { name: "Scrum" }).click();
    await dialog().getByRole("button", { name: "Create" }).click();
    await expect.poll(() => refOf(page, a), { timeout: 15_000 }).not.toBe(first);
    const second = await refOf(page, a);
    boards.push(second);
    await expect(dialog()).toHaveAccessibleName(`E2E Sprint ${stamp}`);
    await dialog()
      .getByRole("button", { name: /Change board/ })
      .click();
    await page.screenshot({ path: test.info().outputPath("pick-change.png") });
    await dialog()
      .getByRole("button", { name: new RegExp(`E2E Roadmap ${stamp}`) })
      .click();
    await expect.poll(() => refOf(page, a)).toBe(first);
    await expect(dialog()).toHaveAccessibleName(`E2E Roadmap ${stamp}`);
    await page.keyboard.press("Escape");

    // ── the next wall from the catalog comes with the board no wall shows yet
    const b = await hang(spots[1]);
    await expect.poll(() => refOf(page, b)).toBe(second);

    // ── build mode: select it, the toolbar's board button lists the boards
    // (the first is on the other wall), pick the first
    await setBuild(page, { mode: "hand", selected: [b] });
    const pickBtn = page.getByRole("button", { name: "Pick a board" });
    await expect(pickBtn).toBeVisible();
    await pickBtn.click();
    const list = page.getByRole("group", { name: "Pick a board" });
    await expect(list.getByRole("button", { name: new RegExp(`E2E Sprint ${stamp}.*Here`) })).toBeVisible();
    await expect(list.getByRole("button", { name: new RegExp(`E2E Roadmap ${stamp}.*On a wall`) })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("pick-toolbar.png") });
    await list.getByRole("button", { name: new RegExp(`E2E Roadmap ${stamp}`) }).click();
    await expect.poll(() => refOf(page, b)).toBe(first);
    await expect(list).toBeHidden();
  } finally {
    await setBuild(page, { on: false, selected: [] });
    for (const id of made) await remove(page, id);
    for (const id of boards) await api.delete(`${API}/api/boards/${id}`);
  }
});
