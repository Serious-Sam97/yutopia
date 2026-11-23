import { expect } from "@playwright/test";
import { ROOM_NAME } from "@yutopia/shared";
import type { NpcDef } from "@yutopia/shared/npc";
import { Client, type Room } from "colyseus.js";
import { ANA, API, BIA, test, token } from "./helpers";

// The world's cast (docs/plan/120-god-mode-npcs.md) on the dev stack: the page as Ana lists every NPC the API has; Lia
// renamed on it is renamed in the world at once (Bia's room, a member's, sees it), and put back; someone made, copied,
// both deleted with the confirm. A member gets none of it. (Deleting one of the town's can't be undone on the shared
// world — the cast never re-seeds —: the world server's cast.test.ts and the API's NpcsTest have that.)
const json = (tok: string) => ({
  Authorization: `Bearer ${tok}`,
  Accept: "application/json",
  "Content-Type": "application/json",
});

test("the cast page: everyone listed; a change live in the world; made, copied, deleted; members refused", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const ana = await token(ANA);
  const bia = await token(BIA);
  // a member: refused
  expect((await fetch(`${API}/api/admin/npcs`, { headers: json(bia) })).status).toBe(403);
  const list = (await (await fetch(`${API}/api/admin/npcs`, { headers: json(ana) })).json()) as { npcs: NpcDef[] };
  const lia = list.npcs.find((d) => d.key === "folk-lia");
  if (!lia) throw new Error("no Lia in the cast");

  // Bia in the world, watching Lia
  const s = (await (await fetch(`${API}/api/session`, { method: "POST", headers: json(bia) })).json()) as {
    worldUrl: string;
    worldToken: string;
  };
  const room: Room = await new Client(s.worldUrl).joinOrCreate(ROOM_NAME, { token: s.worldToken });
  room.onMessage("*", () => {});
  const liaName = () =>
    (room.state as { npcs?: Map<string, { name: string }> } | undefined)?.npcs?.get("folk-lia")?.name;
  try {
    await expect.poll(liaName, { timeout: 15_000 }).toBe(lia.name);

    await page.addInitScript((t) => localStorage.setItem("yutopia:token", t), ana);
    await page.goto("/admin/npcs");
    await expect(page.locator("[data-cast-card]")).toHaveCount(list.npcs.length, { timeout: 60_000 });

    // renamed on the page: saved, and the world has it
    await page.click('[data-cast-card="folk-lia"]');
    await page.fill("[data-npc-name]", "Lia of the cocoa");
    await expect(page.locator('[data-npc-status="saved"]')).toBeVisible({ timeout: 10_000 });
    await expect.poll(liaName, { timeout: 10_000 }).toBe("Lia of the cocoa");
    await page.fill("[data-npc-name]", lia.name);
    await expect(page.locator('[data-npc-status="saved"]')).toBeVisible({ timeout: 10_000 });
    await expect.poll(liaName, { timeout: 10_000 }).toBe(lia.name);

    // made, copied; both deleted with the confirm
    await page.click("[data-cast-new]");
    const editor = page.locator('[data-npc-editor^="npc-"]');
    await expect(editor).toBeVisible();
    const made = await editor.getAttribute("data-npc-editor");
    await page.fill("[data-npc-name]", "Dora");
    await expect(page.locator('[data-npc-status="saved"]')).toBeVisible({ timeout: 10_000 });
    await page.click("[data-npc-copy]");
    await expect(page.locator("[data-npc-name]")).toHaveValue(/Dora · (copy|cópia)/);
    const copy = await page.locator("[data-npc-editor]").getAttribute("data-npc-editor");
    expect(copy).not.toBe(made);
    await expect(page.locator("[data-cast-card]")).toHaveCount(list.npcs.length + 2);
    for (const key of [copy, made]) {
      await page.click(`[data-cast-card="${key}"]`);
      await page.click("[data-npc-delete]");
      await page.click("[data-cast-confirm-delete]");
      await expect(page.locator(`[data-cast-card="${key}"]`)).toHaveCount(0);
    }
    const after = (await (await fetch(`${API}/api/admin/npcs`, { headers: json(ana) })).json()) as { npcs: NpcDef[] };
    expect(after.npcs.map((d) => d.key)).toEqual(list.npcs.map((d) => d.key));
  } finally {
    // (Lia as she was, whatever happened above)
    await fetch(`${API}/api/admin/npcs/folk-lia`, {
      method: "PUT",
      headers: json(ana),
      body: JSON.stringify({ npc: lia }),
    });
    await room.leave(true).catch(() => {});
  }
});
