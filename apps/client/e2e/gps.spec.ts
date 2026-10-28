/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, loaded, test, token, useWorld } from "./helpers";

// The GPS (docs/plan/37-the-gps.md): the phone's first app. The map with me on
// it, a place found and gone to — a route with its turns, the ribbon on the
// ground in 3D, the next turn on top with the phone away — ended; arriving;
// and a contact who shares where they are on the map (and gone once they stop).
// YUTOPIA_SHOTS=<dir> saves screenshots along the way.
// With the real GPU (headless's software GL makes every frame slow):
// YUTOPIA_GPU=1 npx playwright test gps
if (process.env.YUTOPIA_GPU)
  test.use({
    launchOptions: {
      args: [
        "--use-angle=metal",
        "--enable-gpu",
        "--ignore-gpu-blocklist",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  });
const SHOTS = process.env.YUTOPIA_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const yu = (page: Page, fn: (w: any) => unknown) =>
  page.evaluate(`(${fn.toString()})(window.__yutopia)`) as Promise<any>;
const gps = (page: Page) => page.evaluate(() => (window as any).__phone.get().gps);
const openGps = async (page: Page) => {
  await yu(page, (w) => w.togglePhone(true));
  await page.waitForTimeout(2200);
  await yu(page, (w) => w.phone.open("maps"));
  await expect(page.locator("[data-gps]")).toBeVisible();
};

test("the GPS: me on the map, a place found, a route with its turns, the ribbon in 3D, ended; arriving", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await enter(page, await token(ANA), await useWorld("demo"));
  await page.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 30_000 });
  // where I am: the headquarters' floor (floors 1–5 are the Grounds' own coords)
  const at = await yu(page, (w) => w.gpsWhere());
  expect(at.level).toBeGreaterThan(0);
  expect(at.x).toBeGreaterThanOrEqual(0);
  expect(at.x).toBeLessThanOrEqual(48);
  expect(at.z).toBeGreaterThanOrEqual(0);
  expect(at.z).toBeLessThanOrEqual(36);

  await openGps(page);
  await expect(page.locator("[data-gps-where]")).toBeVisible();
  await page.waitForTimeout(1500); // (the site plan drawn)
  await shot(page, "gps-map");
  // find the diner, go there on foot
  await page.locator("[data-gps-search]").click();
  await page.locator("[data-gps-search]").fill("din");
  await expect(page.locator("[data-gps-place='b:diner']")).toBeVisible();
  await shot(page, "gps-search");
  await page.locator("[data-gps-place='b:diner']").click();
  await expect(page.locator("[data-gps-card]")).toBeVisible();
  await page.locator("[data-gps-mode=foot]").click();
  await page.locator("[data-gps-go]").click();
  await expect.poll(async () => (await gps(page)).route?.steps.length ?? 0, { timeout: 10_000 }).toBeGreaterThan(2);
  const g = await gps(page);
  expect(g.target.name).toBe("Diner");
  const ways = new Set(g.route.steps.map((s: { way: string }) => s.way));
  expect(ways.has("Main Street")).toBe(true);
  await expect(page.locator("[data-gps-next]")).toContainText(/Head|Turn|Bear|Continue/);
  await expect(page.locator("[data-gps-bar]")).toContainText("Diner");
  await page.waitForTimeout(800);
  await shot(page, "gps-route");

  // the phone away: the next turn on top, the small map in the corner
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-gps-banner]")).toBeVisible();
  await expect(page.locator("[data-gps-corner]")).toBeVisible();
  await shot(page, "gps-away");

  // the ribbon on the ground
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const root = (window as any).__yutopia.tp?.scene.getObjectByName("gps-guide");
          const mesh = root?.children[0];
          return !!mesh?.visible && (mesh.geometry.attributes.position?.count ?? 0) > 10;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
  await shot(page, "gps-ribbon-3d");

  // ended: no route, no banner
  await openGps(page);
  await page.locator("[data-gps-end]").click();
  await expect.poll(async () => (await gps(page)).target).toBeNull();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-gps-banner]")).toHaveCount(0);

  // arriving: a place a few steps away — "You've arrived", and it's over
  await yu(page, (w) => {
    const me = w.gpsWhere();
    w.phone.gps.go({ key: "here", name: "Here", p: [me.x + 2, me.z] });
  });
  await expect(page.locator("[data-gps-banner]")).toContainText("arrived", { timeout: 10_000 });
  await expect.poll(async () => (await gps(page)).target).toBeNull();
  await expect(page.locator("[data-gps-banner]")).toHaveCount(0, { timeout: 10_000 });
});

test("the GPS's friends: a contact who shares is on my map; once they stop, gone", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const space = await useWorld("demo");
  await enter(page, await token(ANA), space);
  const bia = await browser.newPage();
  await enter(bia, await token(BIA), space);
  for (const p of [page, bia])
    await p.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 30_000 });
  const anaUid = await yu(page, (w) => w.myUid());
  const biaUid = await yu(bia, (w) => w.myUid());
  // Ana has Bia in her phone book, and shares where she is
  await page.evaluate((u) => (window as any).__yutopia.phone.addContact(u), biaUid);
  await yu(page, (w) => w.phone.setSettings({ shareLocation: true }));
  // Bia's map: Ana's face on it
  await openGps(bia);
  await expect(bia.locator(`[data-gps-friend='${anaUid}']`)).toBeVisible({ timeout: 20_000 });
  await bia.locator("[data-gps-search]").click();
  await expect(bia.locator(`[data-gps-place='f:${anaUid}']`)).toBeVisible();
  await shot(bia, "gps-friends");
  // Ana stops sharing: gone from Bia's map
  await yu(page, (w) => w.phone.setSettings({ shareLocation: false }));
  await expect(bia.locator(`[data-gps-friend='${anaUid}']`)).toHaveCount(0, { timeout: 20_000 });
  await bia.close();
});

// Out on the Grounds (the ground floor: its corner is the Grounds' −60, −10):
// where I am reads right, and the route lies on the land: a ribbon.
test("the GPS outdoors: where I am on the land, the route as a ribbon", async ({ page }) => {
  test.setTimeout(180_000);
  await enter(page, await token(ANA), await useWorld("demo"));
  await page.waitForFunction(() => (window as any).__yutopia.phone, null, { timeout: 30_000 });
  // on the driveway, by the lot
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -40 + 60, y: -40 + 10, level: 0 }));
  await page.waitForFunction(() => (window as any).__yutopia.level === 0, null, { timeout: 20_000 });
  await loaded(page);
  const at = await yu(page, (w) => w.gpsWhere());
  expect(Math.hypot(at.x + 40, at.z + 40)).toBeLessThan(3);
  // to the gatehouse, on foot
  await yu(page, (w) => w.phone.gps.go({ key: "b:gatehouse", name: "Gatehouse", p: [-36, -364] }, "foot"));
  // the ribbon, from behind me
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const mesh = (window as any).__yutopia.tp?.scene.getObjectByName("gps-guide")?.children[0];
          return !!mesh?.visible && (mesh.geometry.attributes.position?.count ?? 0) > 10;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
  await page.waitForTimeout(1500);
  await shot(page, "gps-ribbon-3d-outdoors");
  await yu(page, (w) => w.phone.gps.end());
});
