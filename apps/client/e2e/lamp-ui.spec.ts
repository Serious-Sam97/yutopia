/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { CASE_H, CASE_W, fitsAt, HAND_SLOT, type Inventory, QUICK_SLOT, sizeOf } from "@yutopia/shared/inventory";
import { ANA, enter, test, token } from "./helpers";

// The new UI (docs/plan/125-the-new-ui.md, look F) on the desktop: the play HUD (radar, bars, the top-right block,
// the place, my plumbob) with no Dock; Esc → the pause map, a waypoint from its legend and the gold route; Tab held →
// the quick wheel; I → Ana's Case, a thing dragged to a free spot and kept there by the server. The other specs keep
// the old UI (playwright.config.ts' storageState, helpers' enter); this one asks for the new.

// (on the GPU: the town outdoors doesn't finish loading in a spec's time on the software renderer)
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

test("the new UI: HUD, pause map + waypoint, quick wheel, the case's drag kept by the server", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page, await token(ANA), "demo", { ui: "new" });

  // the play HUD: F's corners, the old Dock and top bar gone
  await expect(page.locator("html")).toHaveClass(/lamp-ui/);
  await expect(page.locator("[data-lamp]")).toBeVisible();
  await expect(page.locator("[data-lamp-radar]")).toBeVisible();
  await expect(page.locator("[data-lamp-topright]")).toBeVisible();
  await expect(page.locator("[data-lamp-place]")).toBeVisible();
  await expect(page.locator("[data-dock]")).toHaveCount(0);
  await expect(page.locator("[data-lamp-radar] .l-bars > div")).toHaveCount(4);

  // Esc: the pause menu on its map; a place in the legend → the waypoint, the route drawn along the ways
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-lamp-pause]")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-lamp-pause]")).toHaveAttribute("data-lamp-pause", "map");
  const row = page.locator("[data-lamp-pause] button", { hasText: /church|igreja|farm|fazenda|bar/i }).first();
  await row.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__hud.get().lamp.waypoint), { timeout: 5_000 })
    .not.toBeNull();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-lamp-pause]")).toHaveCount(0);

  // Tab held: the wheel; let go: gone
  await page.keyboard.down("Tab");
  await expect(page.locator("[data-lamp-wheel]")).toBeVisible({ timeout: 3_000 });
  await page.keyboard.up("Tab");
  await expect(page.locator("[data-lamp-wheel]")).toHaveCount(0);

  // I: the case; a thing dragged to the first free spot that isn't where it is
  await page.keyboard.press("KeyI");
  await expect(page.locator("[data-lamp-case]")).toBeVisible({ timeout: 5_000 });
  const inv = (await page.evaluate(() => (window as any).__hud.get().lamp.inv)) as Inventory;
  const all = [
    ...inv.pockets.map((it, i) => ({ it, slot: i })),
    ...inv.quick.map((it, i) => ({ it, slot: QUICK_SLOT + i })),
    { it: inv.hand, slot: HAND_SLOT },
  ].filter((x) => x.it && inv.place?.[x.slot]);
  expect(all.length).toBeGreaterThan(0);
  let move: { slot: number; from: [number, number, 0 | 1]; to: [number, number] } | null = null;
  for (const { it, slot } of all) {
    const from = inv.place?.[slot] as [number, number, 0 | 1];
    for (let y = 0; y < CASE_H && !move; y++)
      for (let x = 0; x < CASE_W && !move; x++)
        if ((x !== from[0] || y !== from[1]) && fitsAt(inv, it?.id as any, [x, y, from[2]], slot))
          move = { slot, from, to: [x, y] };
    if (move) break;
  }
  expect(move, "a free spot in the case").not.toBeNull();
  if (!move) return;
  const m = move;
  const box = await page.locator(`[data-case-slot="${m.slot}"]`).boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const it = all.find((x) => x.slot === m.slot)?.it;
  const [w] = sizeOf(it?.id as any, m.from[2]);
  // (the box is a cell's 56 px less 3 each side, scaled to the window: LampCase's C)
  const cell = (box.width / (w * 56 - 6)) * 56;
  const gx = box.x + cell / 2;
  const gy = box.y + cell / 2;
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + (m.to[0] - m.from[0]) * cell, gy + (m.to[1] - m.from[1]) * cell, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate((s) => (window as any).__hud.get().lamp.inv.place?.[s]?.slice(0, 2), m.slot), {
      timeout: 5_000,
    })
    .toEqual(m.to);
  // and back where it was (the dev world's Ana as she was)
  const box2 = await page.locator(`[data-case-slot="${m.slot}"]`).boundingBox();
  if (box2) {
    await page.mouse.move(box2.x + cell / 2, box2.y + cell / 2);
    await page.mouse.down();
    await page.mouse.move(
      box2.x + cell / 2 + (m.from[0] - m.to[0]) * cell,
      box2.y + cell / 2 + (m.from[1] - m.to[1]) * cell,
      { steps: 10 },
    );
    await page.mouse.up();
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-lamp-case]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
