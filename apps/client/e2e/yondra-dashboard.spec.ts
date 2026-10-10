import { expect, test } from "@playwright/test";
import { ANA, token } from "./helpers";

// Yondra dashboard → "YUTOPIA" key → Yutopia opens already signed in.
const YONDRA = process.env.YONDRA_APP ?? "http://localhost:3000";

test("dashboard key opens Yutopia signed in as the Yondra user", async ({ page, context }) => {
  const tok = await token(ANA);
  await page.addInitScript((t) => localStorage.setItem("token", t), tok);
  await page.goto(`${YONDRA}/dashboard`);
  const key = page.getByRole("button", { name: "YUTOPIA", exact: true });
  await expect(key).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "../../design/screens/07-yondra-dashboard-key.png" });

  const [popup] = await Promise.all([context.waitForEvent("page"), key.click()]);
  await popup.waitForURL(/localhost:3100\/($|\?)/, { timeout: 30_000 });
  await expect(popup.getByText("Ana Demo")).toBeVisible({ timeout: 30_000 });
  await expect(popup.getByRole("link", { name: /walk in/i }).first()).toBeVisible();
  await popup.screenshot({ path: "../../design/screens/08-yutopia-from-yondra.png" });
});
