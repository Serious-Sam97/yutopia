/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 79 phase 4: the holds seen close — Ana by day on the pond, each gun out (ready) and aimed, drawn
// again by the game's own renderer from cameras of our own (her right side, her left, ahead of her) so the
// player's camera — which her aim follows — stays where it is. The dev stack (:3100, :8100), the GPU.
//   node --experimental-strip-types e2e/guns-hold.mts [out dir]   (NAME=x: the files' prefix)
import { writeFileSync } from "node:fs";
import { chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/guns";
const name = process.env.NAME ?? "hold";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";

async function token(email: string): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${api}/api/login`, {
    data: { email, password: pass },
    headers: { Accept: "application/json" },
  });
  return (await res.json()).token;
}
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const gun = (page: Page) => w(page, (y) => y.room.state.players.get(y.room.sessionId).gun as string);

/** Draw the scene from beside her: `side` +1 her right, −1 her left, 0 ahead of her; at `h` up, `d` out. */
async function view(page: Page, file: string, side: number, d = 1.6, h = 1.35) {
  const url = (await page.evaluate(
    ([side, d, h]) => {
      const y = (window as any).__yutopia;
      const tp = y.tp;
      const me = y.walker.where();
      const yaw = tp.lookYaw ?? tp.yaw;
      // (floor coords: x, y; three: x, up, z = the floor's y)
      const fx = Math.cos(yaw);
      const fz = Math.sin(yaw);
      const rx = -fz;
      const rz = fx;
      const cam = tp.camera.clone();
      cam.fov = 32;
      const base = me.z ?? 0;
      const ax = side === 0 ? fx : rx * side + fx * 0.35;
      const az = side === 0 ? fz : rz * side + fz * 0.35;
      cam.position.set(me.x + ax * d, base + h, me.y + az * d);
      cam.lookAt(me.x + fx * 0.3, base + 1.3, me.y + fz * 0.3);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      tp.renderer.render(tp.scene, cam);
      return tp.renderer.domElement.toDataURL("image/png");
    },
    [side, d, h],
  )) as string;
  writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
}

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
const tok = await token("ana@yutopia.test");
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  const p = JSON.parse(localStorage.getItem("yutopia:prefs") ?? "{}");
  localStorage.setItem(
    "yutopia:prefs",
    JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false, quality: "high" }),
  );
}, tok);
await page.goto(base);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false && !!(window as any).__yutopia?.tp;
  },
  null,
  { timeout: 120_000 },
);
await page.evaluate(() => (window as any).__yutopia.teleport({ x: -250, y: -60, level: 0 }));
await page.waitForFunction(() => !!document.querySelector(".dk"), null, { timeout: 30_000 });
await w(page, (y) => {
  y.room.send("mod:hour", { h: 13 });
  y.room.send("mod:storm", { storm: 0, now: true });
  y.room.send("mod:refill", { kit: true });
  y.room.send("mod:dark", { mode: "peaceful" });
  if (!y.room.state.players.get(y.room.sessionId).torch) y.toggleTorch();
  y.tp.yaw = 0;
  y.tp.pitch = 0.1;
});
await page.waitForTimeout(3000);
await page.mouse.move(640, 400);
for (const [key, id] of [
  ["Digit1", "revolver"],
  ["Digit2", "shotgun"],
] as const) {
  await page.keyboard.press(key);
  const end = Date.now() + 15_000;
  while ((await gun(page)) !== id && Date.now() < end) await page.waitForTimeout(200);
  await page.waitForTimeout(1500);
  await view(page, `${out}/${name}-${id}-ready-right.png`, 1);
  await view(page, `${out}/${name}-${id}-ready-front.png`, 0, 2.2);
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}-${id}-aim-game.png` });
  await view(page, `${out}/${name}-${id}-aim-right.png`, 1);
  await view(page, `${out}/${name}-${id}-aim-left.png`, -1);
  await view(page, `${out}/${name}-${id}-aim-front.png`, 0, 2.2);
  await page.mouse.up({ button: "right" });
  console.log("  wrote", id);
}
await browser.close();
