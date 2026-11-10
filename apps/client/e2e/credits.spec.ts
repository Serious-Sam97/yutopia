import { expect } from "@playwright/test";
import { BIA, enter, test, token, useWorld } from "./helpers";

// The credits (docs/plan/75-the-credits.md): the works by others, readable signed out on /credits —
// linked from the sign-in screen — and in the world under Settings → Credits. Each CC BY work with its
// author, its source and the licence, all links out; the sounds and the code's licences after them.
// (the world on the GPU: headless software drawing stalls the page for seconds)
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

test("credits: signed out, from the sign-in screen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByRole("link", { name: "Credits" }).click();
  await expect(page).toHaveURL(/\/credits$/);
  await expect(page.getByRole("heading", { name: "Credits", level: 1 })).toBeVisible();
  const works = page.locator("[data-work]");
  await expect(works.first()).toBeVisible();
  expect(await works.count()).toBeGreaterThanOrEqual(10);
  // each work: its title and author links, and the licence's
  for (const w of await works.all()) {
    const hrefs = await w.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs.some((h) => h.startsWith("https://sketchfab.com/3d-models/"))).toBe(true);
    expect(hrefs).toContain("https://creativecommons.org/licenses/by/4.0/");
  }
  await expect(page.getByText("Bearded Man")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sounds" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Code" })).toBeVisible();
  // (still there with no session: nothing sent it to sign in)
  await expect(page).toHaveURL(/\/credits$/);
  expect(errors).toEqual([]);
});

test("credits: in the world, Settings → Credits", async ({ page }) => {
  test.setTimeout(120_000);
  const s = await useWorld("demo");
  await enter(page, await token(BIA), s);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Credits" }).click();
  const works = page.getByRole("dialog").locator("[data-work]");
  await expect(works.first()).toBeVisible();
  expect(await works.count()).toBeGreaterThanOrEqual(10);
  await expect(page.getByRole("dialog").getByText("CT Reed").first()).toBeVisible();
});
