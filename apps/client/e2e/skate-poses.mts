// (plan 103) The skater's poses as stills from beside her (a camera of our own: OUT=dir) — standing on the board,
// pushing, the crouch, an ollie's air, a kickflip, an indy, a manual — on Main Street, riding east.
//   OUT=dir [VARIANT=street-pop] [SIDE=front|back] node --experimental-strip-types e2e/skate-poses.mts [url]
import { writeFileSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp";
const variant = process.env.VARIANT ?? "street-pop";
const side = process.env.SIDE === "back" ? -1 : 1;
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", cam3p: "chase", maxFps: 0 }));
}, tok);
await page.goto(`${base}/`);
await page.waitForFunction(() => (window as any).__hud?.get()?.phase === "ready" && !(window as any).__hud.get().loading?.on, null, {
  timeout: 240_000,
});
await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 12 }));
await page.evaluate(() => (window as any).__yutopia.teleport({ x: 320, y: -405, level: 0 }));
await page.waitForTimeout(2500);
await page.evaluate((v) => {
  const c = (window as any).__yutopia;
  c.walker.faceYaw?.(0);
  c.skateHand(v);
}, variant);
await page.waitForTimeout(800);

/** A still from beside her (the toe side: in front of her, a regular rider riding east), at her hips' height. */
async function shot(name: string) {
  const url = await page.evaluate((sd) => {
    const c = (window as any).__yutopia;
    const tp = c.tp;
    const b = c.walker.stepBody;
    const cam = tp.camera.clone();
    cam.fov = 40;
    cam.aspect = 900 / 700;
    cam.updateProjectionMatrix();
    cam.position.set(b.x + 0.4, b.z + 1.0, b.y + 3.4 * sd);
    cam.lookAt(b.x, b.z + 0.75, b.y);
    tp.renderer.render(tp.scene, cam);
    return tp.renderer.domElement.toDataURL("image/png");
  }, side);
  writeFileSync(`${out}/pose-${name}.png`, Buffer.from(url.split(",")[1], "base64"));
  const st = await page.evaluate(() => {
    const k = (window as any).__yutopia.walker.stepBody.skate;
    return k ? `${k.mode} ${k.air?.cur?.id ?? k.manual?.id ?? ""} s=${k.s.toFixed(1)}` : "off";
  });
  console.log(name, st);
}
await shot("0-stand");
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(500);
await shot("1-push");
await page.waitForTimeout(1200);
await page.keyboard.up("ShiftLeft");
await page.keyboard.down("Space");
await page.waitForTimeout(280);
await shot("2-crouch");
await page.keyboard.up("Space");
await page.waitForTimeout(250);
await shot("3-ollie");
await page.keyboard.press("KeyE");
await page.waitForTimeout(160);
await shot("4-kickflip");
await page.waitForTimeout(1600);
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(900);
await page.keyboard.up("ShiftLeft");
await page.keyboard.down("Space");
await page.waitForTimeout(300);
await page.keyboard.up("Space");
await page.waitForTimeout(150);
await page.keyboard.down("KeyR");
await page.waitForTimeout(350);
await shot("5-indy");
await page.keyboard.up("KeyR");
await page.waitForTimeout(1600);
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(600);
await page.keyboard.up("ShiftLeft");
await page.keyboard.press("KeyW");
await page.waitForTimeout(60);
await page.keyboard.press("KeyS");
await page.waitForTimeout(300);
await shot("6-manual");
await browser.close();
