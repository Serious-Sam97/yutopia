/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, request, test } from "@playwright/test";
import { ANA, API, BIA, enter, spaceId, token } from "./helpers";

// Changing your look without leaving the studio: Settings → Change my look,
// pick Ligne claire, save — it's kept in Yondra and Bia sees it right away.
test("change your look in the studio; others see it live", async ({ browser }) => {
  test.setTimeout(120_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const s = await spaceId(ta);
  const api = await request.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${ta}`, Accept: "application/json" },
  });
  const before = (await (await api.get(`${API}/api/yutopia/avatar`)).json()).avatar;
  const ctx = { viewport: { width: 1440, height: 900 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  const errors: string[] = [];
  ana.on("pageerror", (e) => errors.push(e.message));
  try {
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    const anaUid = await ana.evaluate(() => (window as any).__yutopia.myUid());
    const style = () =>
      bia.evaluate((uid) => JSON.parse((window as any).__yutopia.personByUid(uid)?.avatar ?? "{}").style, anaUid);
    const next = before.style === "ligne" ? "City-pop 80s" : "Ligne claire";

    await ana.getByRole("button", { name: "Settings" }).click();
    await ana.getByRole("button", { name: "Change my look" }).click();
    const panel = ana.getByRole("dialog", { name: "My look" });
    await panel.getByRole("button", { name: next }).click();
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(panel).toBeHidden();

    const want = next === "Ligne claire" ? "ligne" : "citypop";
    await expect.poll(style, { timeout: 5000 }).toBe(want);
    const saved = (await (await api.get(`${API}/api/yutopia/avatar`)).json()).avatar;
    expect(saved.style).toBe(want);
    expect(errors).toEqual([]);
  } finally {
    await api.put(`${API}/api/yutopia/avatar`, { data: before });
  }
});
