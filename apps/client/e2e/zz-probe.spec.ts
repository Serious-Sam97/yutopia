/* biome-ignore-all lint/suspicious/noExplicitAny: probe */
import { ANA, enter, spaceId, test, token } from "./helpers";
test("clean leftovers", async ({ page }) => {
  const tok = await token(ANA);
  await enter(page, tok, await spaceId(tok, "Yutopia Lab"));
  const ids = await page.evaluate(() => [...(window as any).__yutopia.room.state.objects.values()].filter((o: any) => /^e2e-(tv|nes)-/.test(o.id)).map((o: any) => o.id));
  console.log("removing", ids.join(" "));
  if (ids.length) await page.evaluate((x) => (window as any).__yutopia.send("obj:removeMany", { ids: x }), ids);
  await page.waitForTimeout(1500);
});
