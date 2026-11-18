// (plan 103) Getting a board: the admin's give (into the left hand), and the hall's rack — its prompt naming the
// board nearest, Use taking it into the hand, key 1 riding it; a still of the rack (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/skate-get.mts [url]
import { writeFileSync } from "node:fs";
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
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
  ],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", cam3p: "chase", maxFps: 0 }));
}, tok);
await page.goto(`${base}/`);
await page.waitForFunction(
  () => (window as any).__hud?.get()?.phase === "ready" && !(window as any).__hud.get().loading?.on,
  null,
  {
    timeout: 240_000,
  },
);
await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 12 }));
const hand = () =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    // the pack as the dark's chunk keeps it
    const inv = c.walker?.dark?.inv;
    return inv?.hand?.id ?? null;
  });
const start = await hand();
console.log("hand at the start:", start);
// 1. the hall's rack: stood just north of it, by its middle board
await page.evaluate(() => (window as any).__yutopia.teleport({ x: 464, y: -450.7, level: 0 }));
await page.waitForTimeout(6000);
const prompt = await page.evaluate(() => (window as any).__hud.get().prompt);
console.log("prompt:", JSON.stringify(prompt));
const url = await page.evaluate(() => {
  const c = (window as any).__yutopia;
  const tp = c.tp;
  const cam = tp.camera.clone();
  cam.fov = 45;
  cam.aspect = 1000 / 640;
  cam.updateProjectionMatrix();
  cam.position.set(464.3, 2.6, -452.2);
  cam.lookAt(464, 2.0, -449.4);
  tp.renderer.render(tp.scene, cam);
  return tp.renderer.domElement.toDataURL("image/png");
});
writeFileSync(`${out}/rack.png`, Buffer.from(url.split(",")[1], "base64"));
// Use, tapped (and, if that didn't, the message itself — to tell the key from the server)
const me = await page.evaluate(() => {
  const c = (window as any).__yutopia;
  const p = c.room.state.players.get(c.room.sessionId);
  return { x: p.x, y: p.y, z: p.z, busy: p.busy, level: p.level };
});
console.log("me on the server:", JSON.stringify(me));
await page.keyboard.press("KeyE");
await page.waitForTimeout(1500);
if ((await hand()) === start) {
  console.log("  (Use took nothing: the message straight)");
  await page.evaluate(() => (window as any).__yutopia.room.send("skate:take", { variant: "street-pop" }));
  await page.waitForTimeout(1500);
}
console.log("hand after the rack:", await hand());
await page.keyboard.press("Digit1");
await page.waitForTimeout(1500);
console.log("riding:", await page.evaluate(() => (window as any).__yutopia.walker?.stepBody?.skate?.variant ?? "no"));
await page.keyboard.press("KeyX");
await page.waitForTimeout(500);
// 2. the admin's give
await page.evaluate(() => (window as any).__yutopia.room.send("mod:give", { item: "board_cruiser_mini" }));
await page.waitForTimeout(1500);
console.log("hand after a give:", await hand());
// (put the pack back: the boards it took dropped, what was in the hand back there)
const inv = await page.evaluate(() => {
  const i = (window as any).__yutopia.walker?.dark?.inv;
  return i ? { hand: i.hand?.id ?? null, pockets: i.pockets.map((x: any) => x?.id ?? null) } : null;
});
console.log("pack:", JSON.stringify(inv));
const boards = (inv?.pockets ?? []).flatMap((id: string | null, i: number) => (id?.startsWith("board_") ? [i] : []));
if (inv?.hand?.startsWith("board_")) boards.unshift(12);
for (const slot of boards) {
  await page.evaluate((s) => (window as any).__yutopia.room.send("dark:drop", { slot: s }), slot);
  await page.waitForTimeout(400);
}
const back = (inv?.pockets ?? []).indexOf(start);
if (start && back >= 0)
  await page.evaluate((f) => (window as any).__yutopia.room.send("dark:move", { from: f, to: 12 }), back);
await page.waitForTimeout(800);
console.log("hand at the end:", await hand());
await browser.close();
