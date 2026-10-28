/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import {
  KART_BOWL,
  KART_GATE,
  KART_PARK,
  KART_ROAD,
  KART_STANDS,
  KART_TURN,
} from "../../../packages/shared/src/kart/park.ts";
import { ANA, enter, test, token } from "./helpers";

// The Kart Park on in the game (docs/plan/46-the-karts.md): in 3D, the road's turn off the
// county road (the billboard), the gate, the car park, the paddock, inside by the stands — drawn, the park streamed in with no long frame (the machine's GPU: YUTOPIA_GPU=1). Review shots:
// YUTOPIA_SHOTS=<dir>. (It moves Ana about the dev world; nothing else of it.)

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
// (Chromium's GPU flags; Firefox has its own: playwright.firefox.config.ts)
if (process.env.YUTOPIA_FIREFOX !== "1")
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
// the ground floor's corner is at (-60, -10) in the building's coords
const G = (x: number, z: number) => ({ x: x + 60, y: z + 10 });

async function open(page: Page, view: "3p" | "1p") {
  await page.addInitScript((v) => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: v, cam3p: "chase" }));
    const W = window as any;
    W.__worst = 0;
    let last = performance.now();
    const tick = (t: number) => {
      W.__worst = Math.max(W.__worst, t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, view);
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
}
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};
const worst = (page: Page) =>
  page.evaluate(() => {
    const W = window as any;
    const v = W.__worst;
    W.__worst = 0;
    return v as number;
  });
/** A picture from a camera of my own (building coords), the 3D view's renderer: a data URL. */
const look = (page: Page, from: number[], to: number[]) =>
  page.evaluate(
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
async function go(page: Page, x: number, z: number, settle = 4000) {
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
  await page.waitForTimeout(settle);
}

for (const view of ["3p"] as const)
  test(`the Kart Park in ${view}: the road off the county road, the gate, the stands`, async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, view);
    // where the road turns off the county road, looking up it
    const [rx, rz] = KART_ROAD[1];
    await go(page, rx - 1.5, rz + 6, 6000);
    await shot(page, `kart-park-${view}-turn-off`);
    await worst(page);
    // at the gate (the park streams in on the way)
    await go(page, KART_GATE.x - 1, KART_GATE.z + 8, 8000);
    const w1 = await worst(page);
    console.log(`[kart-park] ${view}: worst frame to the gate: ${Math.round(w1)} ms`);
    await shot(page, `kart-park-${view}-gate`);
    // the car park by the turning circle, and in the paddock by the fire (the way in)
    await go(page, KART_TURN.x - 13, KART_TURN.z + 1, 5000);
    await shot(page, `kart-park-${view}-carpark`);
    expect(await page.evaluate(() => (window as any).__hud.get().me?.areaName as string | undefined)).toBe(
      "The Kart Park's car park",
    );
    await go(page, KART_GATE.x + 2, KART_PARK.z + 50, 5000);
    await shot(page, `kart-park-${view}-paddock`);
    // inside: in front of the stands, on the start straight's verge
    const st = KART_STANDS[0];
    await go(page, (st.x0 + st.x1) / 2, st.z - 3, 6000);
    await shot(page, `kart-park-${view}-stands`);
    // where the HUD says I am
    const place = await page.evaluate(() => (window as any).__hud.get().me?.areaName as string | undefined);
    expect(place).toBe("Yutopia Kart Park");
    const w2 = await worst(page);
    console.log(`[kart-park] ${view}: worst frame in the park: ${Math.round(w2)} ms`);
    if (GPU) expect(Math.max(w1, w2), "worst frame").toBeLessThan(120);
    // the whole park (after the frames are measured: a camera of my own draws all of it at once):
    // from the game's own 3D renderer, a camera of my own over the stands' corner
    await page.waitForTimeout(4000);
    for (const [name, from, to] of [
      ["aerial", [KART_PARK.x + 130, 62, KART_PARK.z + 150], [KART_PARK.x, 0, KART_PARK.z]],
      ["bowl", [KART_BOWL.x + 30, 16, KART_BOWL.z + 40], [KART_BOWL.x, 0, KART_BOWL.z]],
    ] as [string, number[], number[]][]) {
      const url = await look(page, from, to);
      if (dir) writeFileSync(`${dir}/kart-park-3p-${name}.png`, Buffer.from(url.split(",")[1], "base64"));
    }
  });
