// (plan 103) A board ridden in the world: Ana on Main Street gets on one (VARIANT, default the street popsicle),
// pushes, carves, ollies, kickflips — the board's state printed, a still at each (OUT=dir).
//   OUT=dir [VARIANT=street-pop] [AT=x,y] node --experimental-strip-types e2e/skate-ride.mts [url]
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp";
const variant = process.env.VARIANT ?? "street-pop";
const T0 = Date.now();
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
  ],
});
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
// (the board's recordings, as they load: plan 103 phase 7)
const heard: string[] = [];
page.on("response", (r) => {
  if (r.url().includes("/sfx/skate/")) heard.push(`${r.status()} ${r.url().split("/sfx/skate/")[1]}`);
});
page.on("console", (m) => {
  if (m.type() === "error" || /skate|board/i.test(m.text())) console.log("  console:", m.text().slice(0, 300));
});
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", cam3p: "chase", maxFps: 0 }));
}, tok);
await page.goto(`${base}/`);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 240_000 },
);
console.log(`ready ${((Date.now() - T0) / 1000).toFixed(1)} s`);
await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 12 }));
const at = (process.env.AT ?? "330,-405").split(",").map(Number);
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q[0], y: q[1], level: 0 }), at);
await page.waitForTimeout(2500);
const state = () =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    const b = c.walker?.stepBody;
    const k = b?.skate;
    const me = c.room.state.players.get(c.room.sessionId);
    return {
      x: +b.x.toFixed(2),
      y: +b.y.toFixed(2),
      z: +b.z.toFixed(2),
      yaw: +b.yaw.toFixed(2),
      mode: k?.mode ?? "off",
      s: k ? +k.s.toFixed(2) : 0,
      combo: k?.combo?.name ?? "",
      sk: me?.sk ?? -1,
    };
  });
await page.evaluate((v) => {
  const c = (window as any).__yutopia;
  // (facing east along Main Street)
  c.walker.faceYaw?.(0);
  c.skateHand(v);
}, variant);
await page.waitForTimeout(1200);
console.log("on:", JSON.stringify(await state()));
await page.screenshot({ path: `${out}/skate-0-on.png` });
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(2500);
console.log("pushed:", JSON.stringify(await state()));
await page.screenshot({ path: `${out}/skate-1-push.png` });
await page.keyboard.up("ShiftLeft");
await page.keyboard.down("Space");
await page.waitForTimeout(300);
console.log("crouch:", JSON.stringify(await state()));
await page.keyboard.up("Space");
await page.waitForTimeout(120);
await page.keyboard.press("KeyE");
await page.waitForTimeout(180);
console.log("air:", JSON.stringify(await state()));
await page.screenshot({ path: `${out}/skate-2-flip.png` });
await page.waitForTimeout(1500);
console.log("landed:", JSON.stringify(await state()));
await page.keyboard.down("KeyD");
await page.waitForTimeout(700);
await page.keyboard.up("KeyD");
console.log("carved:", JSON.stringify(await state()));
await page.screenshot({ path: `${out}/skate-3-carve.png` });
await page.keyboard.press("KeyX");
await page.waitForTimeout(600);
console.log("off:", JSON.stringify(await state()));
console.log(`recordings: ${heard.length} — ${heard.join(", ")}`);
await browser.close();
