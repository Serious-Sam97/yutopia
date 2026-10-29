/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, walkTo } from "./helpers";

// The pet stays (docs/plan/51-the-pet.md, phase 1): Ana's dog is still in the world when she's gone,
// waiting where she left it, its tag saying whose it is; Bia may feed it; back, Ana has it again.
// The dog adopted here is let go at the end.

const pets = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    return [...w.room.state.pets.values()].map((p: any) => ({
      id: p.id,
      name: p.name,
      sid: p.sid,
      mine: p.sid === w.room.sessionId,
      mode: p.mode,
      act: p.act,
      x: p.x,
      y: p.y,
    }));
  });
const send = (page: Page, type: string, msg: unknown) =>
  page.evaluate(([t, m]) => (window as any).__yutopia.send(t, m), [type, msg] as const);
const release = async (page: Page) => {
  for (const p of await pets(page)) if (p.mine) await send(page, "pet:release", { id: p.id });
};

test("Ana's dog stays when she leaves: Bia sees it waiting, tagged as hers, and feeds it", async ({ browser }) => {
  test.setTimeout(240_000);
  const anaCtx = await browser.newContext();
  const ana = await anaCtx.newPage();
  await enter(ana, await token(ANA));
  await release(ana); // (a run that died halfway)
  await send(ana, "pet:adopt", { species: "dog", name: "Rex", look: { breed: "beagle" } });
  await expect.poll(async () => (await pets(ana)).filter((p) => p.mine).length).toBe(1);
  const id = (await pets(ana)).find((p) => p.mine)?.id as string;

  const biaCtx = await browser.newContext();
  const bia = await biaCtx.newPage();
  let anaAgain: Page | null = null;
  try {
    await enter(bia, await token(BIA));
    await expect.poll(async () => (await pets(bia)).find((p) => p.id === id)?.sid ?? "none").not.toBe("");
    // Ana goes (her tab shut)
    await anaCtx.close();
    await expect
      .poll(async () => (await pets(bia)).find((p) => p.id === id)?.sid ?? "gone", { timeout: 60_000 })
      .toBe("");
    const rex = (await pets(bia)).find((p) => p.id === id);
    expect(rex?.mode).toBe("wait");
    // its tag: whose it is
    await expect
      .poll(() =>
        bia.evaluate(() => [...document.querySelectorAll("span")].some((s) => s.textContent === "Rex · Ana's")),
      )
      .toBe(true);
    // Bia beside it feeds it (her ring offers a snack with its owner away)
    await walkTo(bia, (rex?.x ?? 0) + 1.2, rex?.y ?? 0);
    await send(bia, "pet:care", { id, what: "snack" });
    await expect.poll(async () => (await pets(bia)).find((p) => p.id === id)?.act, { timeout: 10_000 }).toBe("eat");
    // Ana back: hers again
    anaAgain = await (await browser.newContext()).newPage();
    await enter(anaAgain, await token(ANA));
    await expect.poll(async () => (await pets(anaAgain as Page)).find((p) => p.id === id)?.mine).toBe(true);
  } finally {
    if (anaAgain) await release(anaAgain);
    await biaCtx.close();
  }
});
