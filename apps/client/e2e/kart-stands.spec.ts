/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { KART_DESK, KART_STANDS } from "../../../packages/shared/src/kart/park.ts";
import { ANA, enter, test, token } from "./helpers";

// The Kart Park's stands in the game (docs/plan/46-the-karts.md, "the stands"): their people drawn
// (tp/kart/crowd3d.ts), by day and lit after dark; at a race (a Grand Prix on the autopilot) the
// crowd up at the go, a wave along the stands as the karts go by, up again at the flag (the kart
// module's uniforms). Review shots: YUTOPIA_SHOTS=<dir>. (It moves Ana about the dev world.)

const dir = process.env.YUTOPIA_SHOTS;
if (process.env.YUTOPIA_FIREFOX !== "1")
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const G = (x: number, z: number) => ({ x: x + 60, y: z + 10 });
const st = KART_STANDS[0];
const mx = (st.x0 + st.x1) / 2;

async function open(page: Page) {
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  // (sat somewhere from a run before: up)
  await page.evaluate(() => (window as any).__yutopia.room.send("park:stand", {}));
}
async function go(page: Page, x: number, z: number) {
  const p = G(x, z);
  await page.evaluate((q) => (window as any).__yutopia.teleport({ ...q, level: 0 }), p);
  await page.waitForFunction(
    (q) => {
      const w = (window as any).__yutopia;
      const me = w.room.state.players.get(w.room.sessionId);
      return !!me && Math.hypot(me.x - q.x, me.y - q.y) < 2;
    },
    p,
    { timeout: 20_000 },
  );
}
/** A picture from a camera of my own (the park's coords), the 3D view's renderer: saved. */
async function look(page: Page, name: string, from: number[], to: number[]) {
  const url = await page.evaluate(
    ([f, a]) => {
      const tp = (window as any).__yutopia.tp;
      const fr = tp.groundsFrame();
      const cam = tp.camera.clone();
      cam.far = 3000;
      cam.position.set(f[0] - fr.x, f[1] + fr.y, f[2] - fr.z);
      cam.lookAt(a[0] - fr.x, a[1] + fr.y, a[2] - fr.z);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      tp.renderer.render(tp.scene, cam);
      return tp.renderer.domElement.toDataURL("image/png") as string;
    },
    [from, to],
  );
  if (dir) writeFileSync(`${dir}/${name}.png`, Buffer.from(url.split(",")[1], "base64"));
}
const crowd = (page: Page) =>
  page.evaluate(() => {
    const g = (window as any).__yutopia.tp.scene.getObjectByName("kart-crowd");
    if (!g) return null;
    const u = g.userData.crowd;
    return {
      parts: g.children.length,
      people: g.children[0]?.count ?? 0,
      cheer: u.uCheer.value as number,
      kw: Math.max(u.uKw.value.x, u.uKw.value.y, u.uKw.value.z, u.uKw.value.w) as number,
      look: u.uLook.value.y as number,
    };
  });
const front = (page: Page, name: string) => look(page, name, [mx + 6, 3.6, st.z - 14], [mx, 4.5, st.z + 3]);

test("the stands: their people, by day and lit after dark", async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await go(page, mx, st.z - 4);
  await page.waitForFunction(() => !!(window as any).__yutopia.tp.scene.getObjectByName("kart-crowd"), null, {
    timeout: 30_000,
  });
  const c = await crowd(page);
  console.log(`[kart-stands] ${c?.people} people, ${c?.parts} parts`);
  expect(c?.people, "the crowd").toBeGreaterThan(60);
  await page.evaluate(() => (window as any).__yutopia.tp.setHour(13));
  await page.waitForTimeout(2500);
  await front(page, "kart-stands-day");
  await look(page, "kart-stands-close", [mx + 2, 3.9, st.z - 3.2], [mx - 1, 3.8, st.z + 3]);
  await look(page, "kart-stands-along", [st.x1 + 8, 5, st.z - 5], [st.x0, 4, st.z + 3]);
  await page.evaluate(() => (window as any).__yutopia.tp.setHour(22));
  await page.waitForTimeout(2500);
  await front(page, "kart-stands-night");
});

test("the crowd at a race: up at the go, a wave as the karts go by, up at the flag", async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  await go(page, KART_DESK.x + 2, KART_DESK.z);
  await page.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "kart:take", null, { timeout: 30_000 });
  await page.keyboard.press("e");
  await page.waitForSelector("button[data-go='start']", { timeout: 15_000 });
  await page.click("button[data-set='mode'][data-v='gp']");
  await page.click("button[data-set='laps'][data-v='1']");
  await page.click("button[data-go='start']");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "race", null, {
    timeout: 15_000,
  });
  await page.evaluate(() => (window as any).__karts.autopilot(true));
  let goCheer = 0;
  let wave = 0;
  let flag = 0;
  let snapped = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 160_000) {
    const ph = await page.evaluate(() => (window as any).__yutopia.room.state.karts.get("park").phase as string);
    const c = await crowd(page);
    if (c) {
      if (Date.now() - t0 < 3000) goCheer = Math.max(goCheer, c.cheer);
      wave = Math.max(wave, c.kw);
      if (ph === "done") flag = Math.max(flag, c.cheer);
      if (!snapped && c.kw > 0.6 && c.cheer < 0.5) {
        snapped = true;
        await front(page, "kart-stands-wave");
      }
    }
    if (ph === "done" && flag > 0.8) break;
    await page.waitForTimeout(250);
  }
  console.log(
    `[kart-stands] at the go ${goCheer.toFixed(2)}, a kart by ${wave.toFixed(2)}, the flag ${flag.toFixed(2)}`,
  );
  if (flag > 0.8) await front(page, "kart-stands-flag");
  expect(goCheer, "up at the go").toBeGreaterThan(0.6);
  expect(wave, "a kart going by").toBeGreaterThan(0.5);
  expect(flag, "up at the flag").toBeGreaterThan(0.8);
  await page.evaluate(() => (window as any).__karts.autopilot(false));
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "lobby", null, {
    timeout: 30_000,
  });
  await page.click("button[data-go='leave']");
});
