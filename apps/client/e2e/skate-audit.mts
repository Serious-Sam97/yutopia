// (plan 104) The skate as a player sees it, for the audit: the game's own camera and HUD, screenshots in a row while
// riding the hall's half-pipe, a kickflip and an indy on the flat, a rail, the yard (OUT=dir: audit-*.png).
//   OUT=dir node --experimental-strip-types e2e/skate-audit.mts [url]
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp";
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
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
let n = 0;
const snap = async (name: string) => {
  await page.screenshot({ path: `${out}/audit-${String(n++).padStart(2, "0")}-${name}.png` });
};
const on = async (x: number, y: number, yaw: number, variant: string) => {
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), { x, y });
  await page.waitForTimeout(5000);
  await page.evaluate(
    (q) => {
      const c = (window as any).__yutopia;
      c.walker.faceYaw?.(q.yaw);
      if (c.walker?.stepBody?.skate) c.walker.stepBody.skate = null;
      c.skateHand(q.variant);
    },
    { yaw, variant },
  );
  await page.waitForTimeout(800);
};
// 1. the hall's half-pipe: pushed east along it, up and back
await on(461, -530.8, 0, "vert-classic");
await snap("hall-on");
await page.keyboard.down("ShiftLeft");
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(350);
  await snap(`pipe-${i}`);
}
await page.keyboard.up("ShiftLeft");
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(300);
  await snap(`pipe-air-${i}`);
}
// 2. on the yard: a kickflip, an indy
await on(466, -478, 0, "street-pop");
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(1800);
await page.keyboard.up("ShiftLeft");
await snap("yard-roll");
await page.keyboard.down("Space");
await page.waitForTimeout(300);
await page.keyboard.up("Space");
await page.waitForTimeout(80);
await page.keyboard.press("KeyE");
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(150);
  await snap(`kickflip-${i}`);
}
await page.waitForTimeout(1200);
await page.keyboard.down("Space");
await page.waitForTimeout(300);
await page.keyboard.up("Space");
await page.waitForTimeout(80);
await page.keyboard.down("KeyR");
for (let i = 0; i < 2; i++) {
  await page.waitForTimeout(200);
  await snap(`indy-${i}`);
}
await page.keyboard.up("KeyR");
await page.waitForTimeout(1500);
// 3. a rail in the yard: at it along it, ollied onto it, F held
await on(470, -458, 0, "street-pop");
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(900);
await page.keyboard.up("ShiftLeft");
await page.keyboard.down("Space");
await page.waitForTimeout(250);
await page.keyboard.up("Space");
await page.keyboard.down("KeyF");
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(220);
  await snap(`rail-${i}`);
}
await page.keyboard.up("KeyF");
console.log(`${n} shots`);
await browser.close();
