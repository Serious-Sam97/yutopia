// (plan 103) The two parks as stills (OUT=dir): the hall from its door and inside, the yard from its corner — then a
// board ridden down the hall's half-pipe (its state printed: it should go up the wall, into the air and back in).
//   OUT=dir node --experimental-strip-types e2e/skate-parks.mts [url]
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
/** A still through a camera of our own: from `eye` to `at` (Grounds x, height, z). */
async function shot(name: string, eye: [number, number, number], at: [number, number, number]) {
  const url = await page.evaluate(
    ([e, a]) => {
      const c = (window as any).__yutopia;
      const tp = c.tp;
      const cam = tp.camera.clone();
      cam.fov = 55;
      cam.aspect = 1000 / 640;
      cam.updateProjectionMatrix();
      cam.position.set(e[0], e[1], e[2]);
      cam.lookAt(a[0], a[1], a[2]);
      tp.renderer.render(tp.scene, cam);
      return tp.renderer.domElement.toDataURL("image/png");
    },
    [eye, at] as const,
  );
  writeFileSync(`${out}/park-${name}.png`, Buffer.from(url.split(",")[1], "base64"));
  console.log("shot", name);
}
// the yard, from its south-west corner
await page.evaluate(() => (window as any).__yutopia.teleport({ x: 466, y: -444, level: 0 }));
await page.waitForTimeout(6000);
await shot("yard", [458, 7, -440], [486, 1.5, -470]);
// the hall: outside from the south, then inside from its door
await page.evaluate(() => (window as any).__yutopia.teleport({ x: 478, y: -504, level: 0 }));
await page.waitForTimeout(6000);
await shot("hall-out", [470, 5, -496], [478, 4, -520]);
await shot("hall-in", [478, 4.5, -509.5], [470, 1.5, -526]);
await shot("hall-pipe", [474, 4, -524], [464, 2.5, -531]);
// down the half-pipe: on the board in its middle, across it
const ride = await page.evaluate(async () => {
  const c = (window as any).__yutopia;
  c.teleport({ x: 464, y: -530.8, level: 0 });
  await new Promise((res) => setTimeout(res, 2500));
  const b = c.walker.stepBody;
  c.walker.faceYaw?.(0);
  c.skateHand("vert-classic");
  await new Promise((res) => setTimeout(res, 300));
  if (b.skate) b.skate.s = 9;
  const log: string[] = [];
  let top = 0;
  for (let i = 0; i < 40; i++) {
    await new Promise((res) => setTimeout(res, 100));
    const k = b.skate;
    top = Math.max(top, b.z);
    if (i % 4 === 0) log.push(`${k?.mode ?? "off"} z=${b.z.toFixed(2)} x=${b.x.toFixed(2)} s=${k?.s.toFixed(1) ?? "-"}`);
  }
  return { log, top };
});
console.log(ride.log.join("\n"), "\ntop", ride.top.toFixed(2));
await browser.close();
