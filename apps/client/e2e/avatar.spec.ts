/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, request } from "@playwright/test";
import { ANA, API, BIA, enter, test, token, useWorld } from "./helpers";

// Changing your look without leaving the studio: Settings → Change my look,
// pick another figure, save — it's kept in the API and Bia sees it right away.
// (Everyone is Ligne claire: the editor has no style row, the look keeps it.)
test("change your look in the studio; others see it live", async ({ browser }) => {
  test.setTimeout(120_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const s = await useWorld("demo");
  const api = await request.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${ta}`, Accept: "application/json" },
  });
  const before = (await (await api.get(`${API}/api/avatar`)).json()).avatar;
  const ctx = { viewport: { width: 1440, height: 900 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  const errors: string[] = [];
  ana.on("pageerror", (e) => errors.push(e.message));
  try {
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    const anaUid = await ana.evaluate(() => (window as any).__yutopia.myUid());
    const look = () =>
      bia.evaluate((uid) => JSON.parse((window as any).__yutopia.personByUid(uid)?.avatar ?? "{}"), anaUid);
    const next = before.gender === "feminine" ? "Masculine" : "Feminine";

    await ana.getByRole("button", { name: "Settings" }).click();
    await ana.getByRole("button", { name: "Change my look" }).click();
    const panel = ana.getByRole("dialog", { name: "My look" });
    await expect(panel.getByRole("button", { name: next })).toBeVisible();
    await expect(panel.getByRole("button", { name: /City-pop/ })).toHaveCount(0);
    await panel.getByRole("button", { name: next }).click();
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(panel).toBeHidden();
    const want = next.toLowerCase();
    await expect.poll(async () => (await look()).gender, { timeout: 5000 }).toBe(want);
    expect((await look()).style).toBe("ligne");
    const saved = (await (await api.get(`${API}/api/avatar`)).json()).avatar;
    expect(saved.gender).toBe(want);
    expect(saved.style).toBe("ligne");
    expect(errors).toEqual([]);
  } finally {
    await api.put(`${API}/api/avatar`, { data: before });
  }
});

// A look saved elsewhere (the lobby's editor in another tab, or before a world
// restart rejoined with an old token) reaches the room when you come back.
test("a look saved elsewhere reaches the room when you come back to the tab", async ({ browser }) => {
  test.setTimeout(120_000);
  const ta = await token(ANA);
  const s = await useWorld("demo");
  const api = await request.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${ta}`, Accept: "application/json" },
  });
  const before = (await (await api.get(`${API}/api/avatar`)).json()).avatar;
  const ana = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  try {
    await enter(ana, ta, s);
    const mine = () =>
      ana.evaluate(() => {
        const w = (window as any).__yutopia;
        return JSON.parse(w.personByUid(w.myUid())?.avatar ?? "{}").hairColor;
      });
    const color = before.hairColor === "#d9b26a" ? "#6e7b3a" : "#d9b26a";
    await api.put(`${API}/api/avatar`, { data: { ...before, hairColor: color } });
    expect(await mine()).toBe(before.hairColor); // the room still has the old look
    await ana.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(mine, { timeout: 5000 }).toBe(color);
  } finally {
    await api.put(`${API}/api/avatar`, { data: before });
  }
});
