/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld, walkTo } from "./helpers";

const SHOTS = "../../design/screens";

async function screen(page: Page, x: number, y: number) {
  return page.evaluate(
    ([tx, ty]) => {
      const e = (window as any).__yutopia.engine;
      const r = e.app.canvas.getBoundingClientRect();
      const s = e.worldToClient(tx + 0.5, ty + 0.5);
      return { x: r.left + s.x, y: r.top + s.y };
    },
    [x, y],
  );
}
async function clickTile(page: Page, x: number, y: number) {
  const p = await screen(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(120);
  await page.mouse.click(p.x, p.y);
}
async function dragTiles(page: Page, from: [number, number], to: [number, number]) {
  const a = await screen(page, ...from);
  const b = await screen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12);
  await page.mouse.up();
}
// drag along world points (walls go on the lines between tiles)
async function dragWorld(page: Page, from: [number, number], to: [number, number]) {
  const at = (x: number, y: number) =>
    page.evaluate(
      ([wx, wy]) => {
        const e = (window as any).__yutopia.engine;
        const r = e.app.canvas.getBoundingClientRect();
        const s = e.worldToClient(wx, wy);
        return { x: r.left + s.x, y: r.top + s.y };
      },
      [x, y],
    );
  const a = await at(...from);
  const b = await at(...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 18; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 18, a.y + ((b.y - a.y) * i) / 18);
  await page.mouse.up();
}
const st = (page: Page, fn: (s: any) => unknown) => page.evaluate(fn as never, null as never);
const zoom = (page: Page, z: number) => page.evaluate((v) => (window as any).__yutopia.engine.setZoom(v), z);

test("build: blank map, a room with an owner, walls, a desk, and a locked door", async ({ browser }) => {
  // a whole map built by two people (and screenshots of it): more than the default
  test.setTimeout(180_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const lab = await useWorld("lab");
  const ana = await (await browser.newContext()).newPage();
  const bia = await (await browser.newContext()).newPage();
  ana.on("dialog", (d) => d.accept());
  await enter(ana, ta, lab);

  // 4 · map size: start blank 32×24
  await ana.evaluate(() =>
    (window as any).__hud.set({ build: { ...(window as any).__hud.get().build, on: true, tool: "map" } }),
  );
  await ana.getByRole("button", { name: /^S\s*32×24$/ }).click();
  await ana.getByRole("button", { name: /Start from a blank/ }).click();
  await expect.poll(() => st(ana, () => (window as any).__yutopia.room.state.width)).toBe(32);
  // stand near where we'll build so it's on screen (no walking in build mode)
  const build = (on: boolean, tool = "rooms") =>
    ana.evaluate(
      ([o, t]) => (window as any).__hud.set({ build: { ...(window as any).__hud.get().build, on: o, tool: t } }),
      [on, tool] as const,
    );
  await build(false);
  await walkTo(ana, 11.5, 9.5, 20_000);
  await zoom(ana, 1);
  await ana.waitForTimeout(600);
  await build(true, "rooms");

  // 2 · a room for Ana, with walls and a door
  await dragTiles(ana, [4, 4], [8, 7]);
  await ana.getByPlaceholder("Ana's office").fill("Ana's office");
  await ana.getByLabel("Owner (can lock its doors)").selectOption({ label: "Ana Demo" });
  await ana.getByRole("button", { name: "Create room" }).click();
  await expect
    .poll(() => st(ana, () => !!(window as any).__yutopia.room.state.objects.get("door-room-ana-s-office")))
    .toBe(true);

  // 1 · walls go on tile edges: drag along the line x = 16 for a brick wall
  await ana.getByRole("tab", { name: /Walls/ }).click();
  await ana.getByRole("button", { name: "Brick", exact: true }).click();
  await dragWorld(ana, [16, 3.5], [16, 12.5]);
  await expect.poll(() => st(ana, () => (window as any).__yutopia.room.state.vWalls[8][16])).toBe("b");
  expect(await st(ana, () => (window as any).__yutopia.room.state.tiles[8][16])).toBe("."); // no floor lost
  // one straight line: nothing painted across it where the pointer passed corners
  const across = (await st(ana, () =>
    [4, 5, 6, 7, 8, 9, 10, 11, 12].map((y) => (window as any).__yutopia.room.state.hWalls[y].slice(15, 17)).join(""),
  )) as string;
  expect(across).toBe(".".repeat(18));

  // 2 · a desk for Ana inside her room
  await ana.getByRole("tab", { name: /Furnish/ }).click();
  await ana.getByRole("tab", { name: "Desks & tables", exact: true }).click();
  await ana.getByRole("button", { name: "Desk", exact: true }).click();
  await clickTile(ana, 5, 5);
  await ana.getByRole("tab", { name: "Seating" }).click();
  await ana.getByRole("button", { name: "Chair", exact: true }).click();
  await clickTile(ana, 5, 4);
  await expect
    .poll(() =>
      st(ana, () => [...(window as any).__yutopia.floorObjects()].filter((o: any) => o.kind === "chair").length),
    )
    .toBe(1);
  await ana.getByRole("tab", { name: "Desks", exact: true }).click();
  await clickTile(ana, 5, 4);
  await ana.getByLabel("Whose desk is this?").selectOption({ label: "Ana Demo" });
  await ana.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() =>
      st(ana, () =>
        [...(window as any).__yutopia.floorObjects()].some((o: any) => JSON.parse(o.props).ownerName === "Ana Demo"),
      ),
    )
    .toBe(true);
  await ana.getByRole("tab", { name: /Walls/ }).click();
  await ana.screenshot({ path: `${SHOTS}/09-build-walls-room.png` });
  await ana.keyboard.press("Escape");
  await ana.evaluate(() => (window as any).__hud.set({ build: { ...(window as any).__hud.get().build, on: false } }));

  // 3 · Ana walks in and locks the door
  await walkTo(ana, 6.5, 6.5, 20_000);
  await ana.evaluate(() => (window as any).__yutopia.activateObject("door-room-ana-s-office", true));
  await ana.getByRole("button", { name: /Lock/ }).click();
  await expect
    .poll(() =>
      st(ana, () => JSON.parse((window as any).__yutopia.room.state.objects.get("door-room-ana-s-office").props).state),
    )
    .toBe("locked");
  await ana.keyboard.press("Escape");

  // Bia can't get in: not by walking, not by teleporting to Ana
  await enter(bia, tb, lab);
  await walkTo(bia, 6.5, 10.5, 20_000);
  await bia.evaluate(() => (window as any).__yutopia.walkTo({ x: 6.5, y: 6.5 }));
  await bia.waitForTimeout(2500);
  const biaPos = (await st(bia, () => (window as any).__yutopia.meTile())) as { x: number; y: number };
  expect(biaPos.y).toBeGreaterThan(8);
  await bia.evaluate(() =>
    (window as any).__yutopia.teleport({
      userId: (window as any).__hud.get().people.find((p: any) => p.name === "Ana Demo").uid,
    }),
  );
  await expect(bia.getByText(/door is locked/i)).toBeVisible();
  const after = (await st(bia, () => (window as any).__yutopia.meTile())) as { x: number; y: number };
  expect(after.y).toBeGreaterThan(8);
  await zoom(bia, 1.6);
  await bia.waitForTimeout(500);
  await bia.screenshot({ path: `${SHOTS}/10-locked-door.png` });

  // Ana (the owner) walks out through her locked door
  await walkTo(ana, 6.5, 11.5, 20_000);

  // 4 · resize keeps the content
  await ana.evaluate(() =>
    (window as any).__hud.set({ build: { ...(window as any).__hud.get().build, on: true, tool: "map" } }),
  );
  await ana.getByRole("spinbutton").first().fill("40");
  await ana.getByRole("button", { name: /^Resize to/ }).click();
  await expect.poll(() => st(ana, () => (window as any).__yutopia.room.state.width)).toBe(40);
  expect(await st(ana, () => (window as any).__yutopia.room.state.vWalls[8][16])).toBe("b");
});
