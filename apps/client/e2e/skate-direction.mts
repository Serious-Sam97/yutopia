// (plan 104, "the board's direction") In the browser, every 60 ms of a ride — straight, carving, an ollie, the hall's
// vert (an air, back in), a revert: the step's nose against the way it rolls, her drawn body (its left: the nose, for a
// regular rider) against the nose, the camera's heading against the way it rolls. Prints the worst of each and fails
// (exit 1) past its limit.
//   node --experimental-strip-types e2e/skate-direction.mts [url]
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
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
// a sampler in the page: every 60 ms, the three headings' differences (deg)
await page.evaluate(() => {
  const w = window as any;
  w.__skDir = { nose: 0, body: 0, cam: 0, n: 0, log: [] as string[] };
  const deg = (a: number) => (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * 180) / Math.PI;
  setInterval(() => {
    const c = w.__yutopia;
    const b = c.walker?.stepBody;
    const k = b?.skate;
    if (!k) return;
    const S = w.__skDir;
    S.n++;
    const sp = Math.hypot(b.vx, b.vy);
    const roll = (k.mode === "roll" || k.mode === "manual") && !k.cess && sp > 1.5;
    // the nose against the way it rolls (either way: fakie's legal)
    if (roll) {
      const d = deg(Math.atan2(b.vy, b.vx) - b.yaw);
      S.nose = Math.max(S.nose, Math.min(d, 180 - d));
    }
    // her body: its left (the root's +x) is the nose for a regular rider, the tail for goofy
    const p3 = c.tp?.people3?.get(c.room.sessionId);
    if (p3?.root) {
      const e = p3.root.matrixWorld.elements;
      const left = Math.atan2(e[2], e[0]);
      const want = k.stance > 0 ? b.yaw : b.yaw + Math.PI;
      const d = deg(left - want);
      if (k.mode !== "air" || k.air?.spun < 0.1) S.body = Math.max(S.body, d);
      if (d > 20 && S.log.length < 12) S.log.push(`body ${d.toFixed(0)}° in ${k.mode}`);
    }
    // the camera: behind the way it rolls, on the flat once it's settled (a second rolling straight)
    const cam = c.tp?.camera;
    if (cam && roll && !k.on && k.t > 1) {
      const e = cam.matrixWorld.elements;
      // (its look: −z)
      const look = Math.atan2(-e[10], -e[8]);
      const d = deg(look - Math.atan2(b.vy, b.vx));
      S.cam = Math.max(S.cam, d);
      if (d > 40 && S.log.length < 12) S.log.push(`camera ${d.toFixed(0)}° off`);
    }
  }, 60);
});
const ride = async (x: number, y: number, yaw: number, variant: string, keys: (p: typeof page) => Promise<void>) => {
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), { x, y });
  await page.waitForTimeout(4000);
  await page.evaluate(
    (q) => {
      const c = (window as any).__yutopia;
      if (c.walker?.stepBody?.skate) c.walker.stepBody.skate = null;
      c.walker.faceYaw?.(q.yaw);
      c.skateHand(q.variant);
    },
    { yaw, variant },
  );
  await page.waitForTimeout(600);
  await keys(page);
  await page.keyboard.press("KeyX");
  await page.waitForTimeout(400);
};
// 1. Main Street: pushed straight, carved both ways, an ollie, a powerslide
await ride(320, -405, 0, "street-pop", async (p) => {
  await p.keyboard.down("ShiftLeft");
  await p.waitForTimeout(2200);
  await p.keyboard.down("KeyD");
  await p.waitForTimeout(500);
  await p.keyboard.up("KeyD");
  await p.keyboard.down("KeyA");
  await p.waitForTimeout(500);
  await p.keyboard.up("KeyA");
  await p.keyboard.up("ShiftLeft");
  await p.keyboard.down("Space");
  await p.waitForTimeout(300);
  await p.keyboard.up("Space");
  await p.waitForTimeout(900);
  await p.keyboard.down("KeyS");
  await p.waitForTimeout(800);
  await p.keyboard.up("KeyS");
});
// 2. the hall's half-pipe: pushed along it, up the wall, an air, back in, a revert
await ride(461, -530.8, 0, "vert-classic", async (p) => {
  await p.keyboard.down("ShiftLeft");
  await p.waitForTimeout(1800);
  await p.keyboard.up("ShiftLeft");
  await p.waitForTimeout(2600);
  await p.keyboard.press("ShiftLeft");
  await p.waitForTimeout(1500);
});
const S = await page.evaluate(() => (window as any).__skDir);
console.log(`samples ${S.n}: nose vs rolling ${S.nose.toFixed(1)}°, body vs nose ${S.body.toFixed(1)}°, camera vs rolling ${S.cam.toFixed(1)}°`);
for (const l of S.log) console.log("  ", l);
await browser.close();
const bad = S.nose > 3 || S.body > 12 || S.cam > 45 || S.n < 20;
if (bad) console.log("DIRECTION: FAIL");
else console.log("DIRECTION: ok");
process.exit(bad ? 1 : 0);
