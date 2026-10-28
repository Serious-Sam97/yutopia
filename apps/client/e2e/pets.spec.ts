/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld } from "./helpers";

// Pets (docs/plan/13-pets.md), in the Lab: adopt one from the panel, it
// turns up beside you; its ring of actions; "Speak!" makes a sound bubble;
// a battle with someone else's pet (the prompt, the bar, a round). The pets
// adopted here are let go at the end.

const pets = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    return [...w.room.state.pets.values()].map((p: any) => ({
      id: p.id,
      name: p.name,
      species: p.species,
      sid: p.sid,
      mine: p.sid === w.room.sessionId,
      say: p.say,
      sayAt: p.sayAt,
      x: p.x,
      y: p.y,
      battle: p.battle,
      carry: p.carry,
    }));
  });
const me = (page: Page) => page.evaluate(() => (window as any).__yutopia.meTile());
const send = (page: Page, type: string, msg: unknown) =>
  page.evaluate(([t, m]) => (window as any).__yutopia.send(t, m), [type, msg] as const);
const release = async (page: Page) => {
  for (const p of await pets(page)) if (p.mine) await send(page, "pet:release", { id: p.id });
};

test("adopt a platypus, its actions, a sound, and a battle with a friend's cat", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const tok = await token(ANA);
  const space = await useWorld("lab");
  await enter(page, tok, space);
  const bia = await browser.newContext();
  const page2 = await bia.newPage();
  try {
    await release(page); // (a run that died halfway)
    // the panel: adopt from the species cards
    await page.evaluate(() => (window as any).__hud.set({ panel: { kind: "pets" } }));
    await page.getByRole("button", { name: /^adopt$/i }).click(); // (someone else's pet may be about)
    await page
      .getByRole("button", { name: /platypus/i })
      .first()
      .click();
    await page.getByPlaceholder(/platypus/i).fill("Perry");
    await page.getByRole("button", { name: /adopt perry/i }).click();
    await expect.poll(async () => (await pets(page)).filter((p) => p.mine).length).toBe(1);
    const perry = (await pets(page)).find((p) => p.mine) as { id: string; x: number; y: number; name: string };
    expect(perry.name).toBe("Perry");
    const at = await me(page);
    expect(Math.hypot(perry.x - at.x, perry.y - at.y)).toBeLessThan(5);
    // the cabinet: the name plate, the meters, the commands
    await expect(page.getByText("PERRY", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: /food 100/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /speak!/i })).toBeVisible();
    // Play: the ball into my hand; thrown ahead, it comes back in Perry's mouth
    await page.getByRole("button", { name: /^play$/i }).click();
    await page
      .getByRole("button", { name: /^take$/i })
      .first()
      .click();
    await expect.poll(() => page.evaluate(() => (window as any).__hud.get().held?.kind)).toBe("ball");
    const from = await me(page);
    await send(page, "toy:throw", { x: from.x + 4, y: from.y });
    await expect.poll(() => page.evaluate(() => (window as any).__yutopia.room.state.toys.size)).toBe(1);
    await expect
      .poll(async () => (await pets(page)).find((x) => x.id === perry.id)?.carry, { timeout: 10_000 })
      .toBe("ball");
    await expect
      .poll(async () => (await pets(page)).find((x) => x.id === perry.id)?.carry, { timeout: 12_000 })
      .toBe("");
    const ball = await page.evaluate(() => {
      const t = [...(window as any).__yutopia.room.state.toys.values()][0];
      return t ? { x: t.x, y: t.y, state: t.state } : null;
    });
    expect(ball?.state).toBe("floor");
    const back = await me(page);
    expect(Math.hypot((ball?.x ?? 99) - back.x, (ball?.y ?? 99) - back.y)).toBeLessThan(1.6);

    // the ring on the pet (it's low), then "Speak!"
    const p = await page.evaluate((id) => {
      const w = (window as any).__yutopia;
      const a = w.model.avatarAt(`pet:${id}`);
      const r = w.hostRect();
      const s = w.model.worldToClient(a.x, a.y, 6);
      return { x: r.left + s.x, y: r.top + s.y };
    }, perry.id);
    await page.mouse.click(p.x, p.y);
    const menu = page.getByRole("menu", { name: /Perry/ });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /give a snack/i })).toBeVisible();
    await menu.getByRole("menuitem", { name: /speak!/i }).click();
    await expect.poll(async () => (await pets(page)).find((x) => x.id === perry.id)?.say).toBe("call");
    await expect(page.locator("canvas").first()).toBeVisible();

    // Bia walks in with a cat; Ana challenges it; Bia accepts in the prompt
    const tok2 = await token(BIA);
    await enter(page2, tok2, space);
    await release(page2);
    await send(page2, "pet:adopt", { species: "cat", name: "Luna" });
    await expect.poll(async () => (await pets(page2)).filter((x) => x.mine).length).toBe(1);
    const luna = (await pets(page2)).find((x) => x.mine) as { id: string };
    await expect.poll(async () => (await pets(page)).some((x) => x.id === luna.id)).toBe(true);
    await send(page, "pet:challenge", { id: luna.id, mine: perry.id });
    await page2.getByRole("button", { name: /accept|aceitar/i }).click();
    const bar = page.getByText(/battle · round 1|batalha · rodada 1/i);
    await expect(bar).toBeVisible();
    await page.getByRole("button", { name: /^(attack|atacar)$/i }).click();
    await page2.getByRole("button", { name: /^(defend|defender)$/i }).click();
    // the round plays out: the log names both, Luna is hurt
    await expect(page.getByText(/Perry (attacks|ataca)/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Luna (braces|se defende)/)).toBeVisible();
    // Luna let go: the battle ends, Perry is free again
    await send(page2, "pet:release", { id: luna.id });
    await expect.poll(async () => (await pets(page)).find((x) => x.id === perry.id)?.battle).toBe("");
    await page2.close();
  } finally {
    await release(page).catch(() => {});
    if (!page2.isClosed()) {
      await release(page2).catch(() => {});
      await page2.close().catch(() => {});
    }
    await bia.close().catch(() => {});
  }
});
