/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page, test } from "@playwright/test";
import { ANA, enter, spaceId, token, walkTo } from "./helpers";

const W = (page: Page) => page.evaluateHandle(() => (window as any).__yutopia);

async function clickTile(page: Page, x: number, y: number) {
  const p = await page.evaluate(
    ([tx, ty]) => {
      const e = (window as any).__yutopia.engine;
      const r = e.app.canvas.getBoundingClientRect();
      const s = e.worldToClient(tx + 0.5, ty + 0.5);
      return { x: r.left + s.x, y: r.top + s.y };
    },
    [x, y],
  );
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(150);
  await page.mouse.click(p.x, p.y);
}

const objectsAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([tx, ty]) =>
      [...(window as any).__yutopia.room.state.objects.values()]
        .filter((o: any) => o.x === tx && o.y === ty)
        .map((o: any) => ({ id: o.id, kind: o.kind })),
    [x, y],
  );

test("an owner builds the room with the mouse, and it persists", async ({ page }) => {
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok));
  await walkTo(page, 9.5, 9.5);
  // hold the camera still: it eases after the walk, and a moving camera makes a
  // click land on the neighbouring tile
  await page.evaluate(() => (window as any).__yutopia.engine.pinCamera({ x: 9.5, y: 9.5 }));
  await W(page);
  await page.evaluate(() => {
    const h = (window as any).__hud;
    h.set({ build: { ...h.get().build, on: true, kind: "plant", rot: 0, holding: null } });
  });
  await expect(page.getByRole("region", { name: /build mode/i })).toBeVisible();

  // place a plant on an empty tile
  await clickTile(page, 10, 10);
  await expect.poll(() => objectsAt(page, 10, 10)).toEqual([expect.objectContaining({ kind: "plant" })]);
  const id = (await objectsAt(page, 10, 10))[0].id;

  // pick it up and drop it two tiles over
  await clickTile(page, 10, 10);
  await clickTile(page, 12, 10);
  await expect.poll(() => objectsAt(page, 12, 10)).toEqual([{ id, kind: "plant" }]);
  await page.screenshot({ path: "../../design/screens/05-build.png" });

  // pick it up again and remove it
  await clickTile(page, 12, 10);
  await page.keyboard.press("Delete");
  await expect.poll(() => objectsAt(page, 12, 10)).toEqual([]);

  // walls are off limits
  await page.evaluate(() => {
    const h = (window as any).__hud;
    h.set({ build: { ...h.get().build, on: true, kind: "plant", rot: 0, holding: null } });
  });
  await clickTile(page, 0, 10);
  await expect.poll(() => objectsAt(page, 0, 10)).toEqual([]);
  await page.keyboard.press("Escape");
});
