/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { KART_DESK, KART_PARK } from "../../../packages/shared/src/kart/park.ts";
import { ANA, enter, test, token } from "./helpers";

// The track changer in the game (docs/plan/47-the-track-changer.md): a Grand Prix on the autopilot
// on each layout — the Oval, the Switchback the other way round, the Long Way, the Figure Eight the
// other way round —, each changed to (its show waited out), a kart taken, a lap to the flag, eight
// karts home, out of the kart; the lobby shows the layout's own record. Back to the Figure Eight
// after (the dev world keeps the layout). Stills of each from above: YUTOPIA_SHOTS=<dir>.

const dir = process.env.YUTOPIA_SHOTS;
if (process.env.YUTOPIA_FIREFOX !== "1")
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, z: number) => ({ x: x + 60, y: z + 10 });
const park = (page: Page) => page.evaluate(() => (window as any).__yutopia.room.state.karts.get("park"));
const phase = (page: Page, ph: string, timeout: number) =>
  page.waitForFunction((p) => (window as any).__yutopia.room.state.karts.get("park").phase === p, ph, { timeout });
const layout = async (page: Page, key: string, reverse = false) => {
  await page.evaluate(([k, r]) => (window as any).__yutopia.room.send("kart:layout", { layout: k, reverse: r }), [
    key,
    reverse,
  ] as const);
  await page.waitForFunction(
    ([k, r]) => {
      const p = (window as any).__yutopia.room.state.karts.get("park");
      return p.layout === k && p.reverse === r && !p.showing;
    },
    [key, reverse] as const,
    { timeout: 25_000 },
  );
};
const RACES: [string, boolean, string][] = [
  ["oval", false, "THE OVAL"],
  ["switchback", true, "THE SWITCHBACK REVERSED"],
  ["longway", false, "THE LONG WAY"],
  ["eight", true, "THE FIGURE EIGHT REVERSED"],
];

test("a Grand Prix on each layout: changed, its show waited out, eight karts home", async ({ page }) => {
  test.setTimeout(720_000);
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", last3d: "3p", cam3p: "chase" }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).__yutopia.room.send("park:stand", {}));
  try {
    for (const [key, reverse, title] of RACES) {
      await layout(page, key, reverse);
      const p = G(KART_DESK.x + 2, KART_DESK.z);
      await page.evaluate((q) => (window as any).__yutopia.teleport({ ...q, level: 0 }), p);
      await page.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "kart:take", null, {
        timeout: 30_000,
      });
      await page.keyboard.press("x");
      await page.waitForSelector("button[data-go='start']", { timeout: 15_000 });
      // the lobby shows the layout's own record
      await expect(page.locator(`text=HOUSE RECORD · ${title}`)).toBeVisible();
      await page.click("button[data-set='mode'][data-v='gp']");
      await page.click("button[data-set='laps'][data-v='1']");
      await page.click("button[data-go='start']");
      await phase(page, "race", 15_000);
      await page.evaluate(() => (window as any).__karts.autopilot(true));
      if (dir) {
        await page.waitForTimeout(9000);
        const url = await page.evaluate(
          (c) => {
            const tp = (window as any).__yutopia.tp;
            const fr = tp.groundsFrame();
            const cam = tp.camera.clone();
            cam.far = 3000;
            cam.position.set(c[0] - fr.x, 190 + fr.y, c[1] + 120 - fr.z);
            cam.lookAt(c[0] - fr.x, fr.y, c[1] - fr.z);
            cam.updateProjectionMatrix();
            cam.updateMatrixWorld();
            const fog = tp.scene.fog;
            tp.scene.fog = null;
            tp.renderer.render(tp.scene, cam);
            tp.scene.fog = fog;
            return tp.renderer.domElement.toDataURL("image/png") as string;
          },
          [KART_PARK.x, KART_PARK.z],
        );
        writeFileSync(
          `${dir}/kart-layout-${key}${reverse ? "-reverse" : ""}.png`,
          Buffer.from(url.split(",")[1], "base64"),
        );
      }
      await phase(page, "done", 150_000);
      const rows = JSON.parse((await park(page)).results).rows;
      console.log(`[kart-layout] ${title}: ${rows.length} karts home`);
      expect(rows.length).toBe(8);
      await page.evaluate(() => (window as any).__karts.autopilot(false));
      await phase(page, "lobby", 30_000);
      await page.click("button[data-go='leave']");
      await page.waitForFunction(
        () => {
          const w = (window as any).__yutopia;
          return !w.room.state.players.get(w.room.sessionId)?.busy;
        },
        null,
        { timeout: 15_000 },
      );
    }
  } finally {
    await layout(page, "eight").catch(() => {});
  }
  expect((await park(page)).layout).toBe("eight");
});
