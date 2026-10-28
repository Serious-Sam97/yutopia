/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, holdCamera, test, token, useWorld } from "./helpers";

// Build mode's tools beyond placing: box / fill / erase painting, undo + redo,
// copies, catalog search, dragging a person onto a seat, "go there".
// Runs in Yutopia Lab (the sandbox project): it starts from a blank floor.
const SHOTS = process.env.YUTOPIA_SHOTS;

async function screen(page: Page, x: number, y: number) {
  return page.evaluate(
    ([wx, wy]) => {
      const w = (window as any).__yutopia;
      const r = w.hostRect();
      const s = w.model.worldToClient(wx, wy);
      return { x: r.left + s.x, y: r.top + s.y };
    },
    [x, y],
  );
}
// The camera pinned over a spot, looking north (the build panel covers the screen's left: the
// work spans 18 tiles, more than one held view shows clear of it)
async function look(page: Page, x: number, y: number) {
  await holdCamera(page, { at: { x, y }, yaw: -Math.PI / 2, dist: 9, pitch: 1.0 });
  await page.waitForTimeout(250);
}
async function clickTile(page: Page, x: number, y: number) {
  await look(page, x + 0.5, y + 0.5);
  const p = await screen(page, x + 0.5, y + 0.5);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(120);
  await page.mouse.click(p.x, p.y);
}
async function drag(page: Page, from: [number, number], to: [number, number], steps = 12) {
  await look(page, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  const a = await screen(page, ...from);
  const b = await screen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
  await page.mouse.up();
}
const tile = (page: Page, x: number, y: number) =>
  page.evaluate(([tx, ty]) => (window as any).__yutopia.room.state.tiles[ty][tx], [x, y]);
const hWall = (page: Page, x: number, y: number) =>
  page.evaluate(([tx, ty]) => (window as any).__yutopia.room.state.hWalls[ty][tx], [x, y]);
const vWall = (page: Page, x: number, y: number) =>
  page.evaluate(([tx, ty]) => (window as any).__yutopia.room.state.vWalls[ty][tx], [x, y]);
const width = (page: Page) => page.evaluate(() => (window as any).__yutopia.room.state.width);
const kinds = (page: Page, kind: string) =>
  page.evaluate(
    (k) =>
      [...(window as any).__yutopia.floorObjects()]
        .filter((o: any) => o.kind === k)
        .map((o: any) => ({ x: o.x, y: o.y, props: JSON.parse(o.props) })),
    kind,
  ) as Promise<{ x: number; y: number; props: Record<string, unknown> }[]>;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test("build tools: paint modes, undo/redo, copies, search, seats by drag, go there", async ({ page }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  page.on("dialog", (d) => d.accept());
  await enter(page, tok, await useWorld("lab"));
  const build = (on: boolean, tool = "walls") =>
    page.evaluate(
      ([o, t]) => (window as any).__hud.set({ build: { ...(window as any).__hud.get().build, on: o, tool: t } }),
      [on, tool] as const,
    );

  // a clean floor to work on
  await build(true, "map");
  await page.getByRole("button", { name: /^S\s*32×24$/ }).click();
  await page.getByRole("button", { name: /Start from a blank/ }).click();
  await expect.poll(() => width(page)).toBe(32);
  await build(false);
  // (a teleport: right after the new map the walk there sometimes never starts)
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: 14.5, y: 9.5 }));
  await page.waitForFunction(
    () => {
      const t = (window as any).__yutopia.meTile();
      return Math.hypot(t.x - 14.5, t.y - 9.5) < 1;
    },
    null,
    { timeout: 10_000 },
  );
  await look(page, 14.5, 6.5);
  await page.waitForTimeout(600);
  await build(true, "walls");
  await expect(page.getByRole("region", { name: /build mode/i })).toBeVisible();

  // Box: a carpet rectangle in one drag (floors have their own tab)
  await page.getByRole("button", { name: "Floors", exact: true }).click();
  await page.getByRole("button", { name: "Carpet", exact: true }).click();
  await page.getByRole("button", { name: "Box", exact: true }).click();
  await drag(page, [16.5, 4.5], [19.5, 6.5]);
  await expect.poll(() => tile(page, 16, 4)).toBe(",");
  expect(await tile(page, 19, 6)).toBe(",");
  expect(await tile(page, 20, 6)).toBe(".");

  // Undo / redo, from the keyboard and the top bar
  const undo = page.getByRole("button", { name: /^Undo/ });
  await expect(undo).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => tile(page, 16, 4)).toBe(".");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => tile(page, 16, 4)).toBe(",");
  await shot(page, "build-walls-box");

  // Box with a wall brush (Build): brick walls all around
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Brick", exact: true }).click();
  await page.getByRole("button", { name: "Box", exact: true }).click();
  await drag(page, [8.5, 3.5], [11.5, 5.5]);
  await expect.poll(() => hWall(page, 8, 3)).toBe("b");
  expect(await hWall(page, 11, 6)).toBe("b");
  expect(await vWall(page, 8, 4)).toBe("b");
  expect(await vWall(page, 12, 4)).toBe("b");

  // Fill room: a tile floor inside those walls, not past them
  await page.getByRole("button", { name: "Floors", exact: true }).click();
  await page.getByRole("button", { name: "Tile", exact: true }).click();
  await page.getByRole("button", { name: "Fill room", exact: true }).click();
  await clickTile(page, 9, 4);
  await expect.poll(() => tile(page, 11, 5)).toBe("_");
  expect(await tile(page, 8, 3)).toBe("_");
  expect(await tile(page, 13, 4)).toBe(".");

  // Erase: drag along the top wall line, corner to corner, in Build
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Brick", exact: true }).click();
  await page.getByRole("button", { name: "Erase", exact: true }).click();
  await drag(page, [8.2, 3], [11.8, 3], 18);
  await expect.poll(() => hWall(page, 9, 3)).toBe(".");
  expect(await vWall(page, 8, 4)).toBe("b"); // the sides stay

  // Search, place, pick up, copy (C)
  await page.getByRole("tab", { name: /Furnish/ }).click();
  await page.keyboard.press("/");
  await page.keyboard.type("pla");
  await expect(page.getByRole("button", { name: "Plant", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Desk", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Plant", exact: true }).click();
  await clickTile(page, 15, 10);
  await expect.poll(async () => (await kinds(page, "plant")).length).toBe(1);
  await clickTile(page, 15, 10); // pick it up
  await page.keyboard.press("c"); // a copy of it on the pointer (the original goes back)
  await clickTile(page, 17, 10);
  await expect.poll(async () => (await kinds(page, "plant")).length).toBe(2);
  const plants = await kinds(page, "plant");
  expect(plants.map((p) => `${p.x},${p.y}`).sort()).toEqual(["15,10", "17,10"]);
  // one copy per click (Shift+click keeps placing): back to the hand, build stays on
  await shot(page, "build-furnish");

  // A chair, then Bia dragged onto it from the Desks panel
  await page.getByPlaceholder(/Search furniture/).fill("chair");
  await page.getByRole("button", { name: "Chair", exact: true }).click();
  await clickTile(page, 19, 10);
  await expect.poll(async () => (await kinds(page, "chair")).length).toBe(1);
  await page.getByRole("tab", { name: /Desks/ }).click();
  await look(page, 19.5, 10.5);
  const seat = await screen(page, 19.5, 10.5);
  const canvas = page.locator('canvas[aria-label="Yutopia world"]');
  const box = await canvas.boundingBox();
  await page.getByRole("button", { name: /Bia Demo/ }).dragTo(canvas, {
    targetPosition: { x: seat.x - (box?.x ?? 0), y: seat.y - (box?.y ?? 0) },
  });
  await expect.poll(async () => (await kinds(page, "chair"))[0]?.props.ownerName).toBe("Bia Demo");
  await shot(page, "build-desks");

  // Rooms: draw one, then "go there"
  await page.getByRole("tab", { name: /Rooms/ }).click();
  await drag(page, [21.5, 3.5], [25.5, 6.5]);
  await page.getByPlaceholder("Ana's office").fill("Lab room");
  await page.getByRole("button", { name: "Create room" }).click();
  await page.getByRole("button", { name: /LAB ROOM/ }).click();
  await shot(page, "build-rooms");
  await page.getByRole("button", { name: "Go there" }).click();
  await page.waitForFunction(
    () => {
      const t = (window as any).__yutopia.meTile();
      return t.x >= 21 && t.x <= 26 && t.y >= 3 && t.y <= 7;
    },
    null,
    { timeout: 10_000 },
  );

  await page.getByRole("tab", { name: /Map/ }).click();
  await shot(page, "build-map");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("region", { name: /build mode/i })).toHaveCount(0);
});
