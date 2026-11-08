/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// The headquarters' facade from outside against its floors' real windows (tp/campus.ts): stills in
// the game as Bia (the dev stack, :3100 and :8100, the machine's GPU) — from the lot, at noon and
// at night, and from inside a floor looking at its outer wall.
//   node --experimental-strip-types e2e/facade-shots.mts [out dir]
//   SPOTS=lot,corner,…  HOURS=12,22
import { chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/facade";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const hours = process.env.HOURS?.split(",").map(Number) ?? [12, 22];
const want = process.env.SPOTS?.split(",");

interface Spot {
  name: string;
  at: { x: number; y: number };
  level: number;
  to: { x: number; y: number };
  pitch?: number;
  dist?: number;
  lift?: number;
  /** a camera of its own (the game's own can't leave the building from up there): where, at what
   *  (x, height over my floor, y) */
  eye?: [number, number, number];
  look?: [number, number, number];
}
const SPOTS: Spot[] = [
  { name: "lot", at: { x: -24, y: 18 }, level: 0, to: { x: 10, y: 18 }, pitch: 0.12, dist: 6 },
  { name: "corner", at: { x: -16, y: -14 }, level: 0, to: { x: 10, y: 10 }, pitch: 0.18, dist: 6 },
  { name: "south", at: { x: 24, y: 58 }, level: 0, to: { x: 24, y: 20 }, pitch: 0.18, dist: 6 },
  { name: "floor1", at: { x: 6, y: 18 }, level: 1, to: { x: -5, y: 18 }, pitch: 0.05, dist: 3 },
  { name: "studio", at: { x: 5, y: 6 }, level: 4, to: { x: 5, y: -5 }, pitch: 0.05, dist: 3 },
  // (out of a window up close: the facade's glass mustn't stand in the way)
  { name: "window1", at: { x: 2.2, y: 6.5 }, level: 1, to: { x: -5, y: 6.5 }, pitch: -0.05, dist: 1.2, lift: 1.5 },
  { name: "lobby", at: { x: 3, y: 12 }, level: 0, to: { x: -5, y: 12 }, pitch: 0.02, dist: 1.5 },
  // the studio's own windows from the lot, up in the building (you on the studio's floor)
  { name: "studio-far", at: { x: 20, y: 4 }, level: 4, to: { x: 20, y: 30 }, eye: [14, 1.5, -24], look: [14, 0.5, 0] },
];

async function token(email: string): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${api}/api/login`, {
    data: { email, password: pass },
    headers: { Accept: "application/json" },
  });
  return (await res.json()).token;
}
const ready = (p: Page) =>
  p.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 120_000 },
  );

const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const tok = await token("bia@yutopia.test");
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high" }));
}, tok);
await page.goto(base);
await ready(page);
await page.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { mode: "peaceful" }));

const go = async (at: { x: number; y: number }, level: number) => {
  for (let k = 0; k < 3; k++) {
    await page.evaluate(([a, l]) => (window as any).__yutopia.teleport({ ...a, level: l }), [at, level] as const);
    const there = await page
      .waitForFunction(
        ([a, l]) => {
          const w = (window as any).__yutopia;
          const m = w.room.state.players.get(w.room.sessionId);
          return w.level === l && Math.hypot(m.x - a.x, m.y - a.y) < 3;
        },
        [at, level] as const,
        { timeout: 25_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (there) {
      await page.waitForTimeout(6000);
      return;
    }
  }
  throw new Error(`can't get to ${at.x}, ${at.y} on ${level}`);
};
const frame = async (s: Spot) =>
  page.evaluate((s) => {
    const w = (window as any).__yutopia;
    const m = w.room.state.players.get(w.room.sessionId);
    const yaw = Math.atan2(s.to.y - m.y, s.to.x - m.x);
    const b = w.walker.body;
    b.yaw = yaw;
    if (w.walker.prev) w.walker.prev.yaw = yaw;
    const tp = w.tp;
    tp.mode = "free";
    tp.yaw = yaw;
    tp.pitch = s.pitch ?? 0.16;
    tp.dist = s.dist ?? 5.5;
    tp.dragged = 1e12;
    const T = tp.target;
    for (const k of ["set", "copy", "lerp", "add"]) delete T[k];
    T.set(m.x, (m.z ?? 0) + (s.lift ?? 1.4), m.y);
    for (const k of ["set", "copy", "lerp", "add"]) T[k] = () => T;
  }, s);
const hold = (h: number) =>
  page.evaluate((h) => {
    const w = (window as any).__yutopia;
    w.updateNight = () => {};
    w.hour = h;
    w.model?.setClock?.(h);
    w.engine?.setClock?.(h);
    w.tp.setHour(h);
    if (w.life) w.life.weather = () => [0, 0];
  }, h);
// (through a camera of its own, the canvas's picture in the same call)
const eyeShot = async (name: string, s: Spot) => {
  const url = await page.evaluate(
    ([eye, look]) => {
      const tp = (window as any).__yutopia.tp;
      const cam = tp.camera.clone();
      cam.position.set(eye[0], eye[1], eye[2]);
      cam.lookAt(look[0], look[1], look[2]);
      cam.updateMatrixWorld();
      // (what the campus shows by where the camera is: by this one, in its own frame)
      const campus = tp.around.campus;
      const p = campus.root.worldToLocal(cam.position.clone());
      campus.update(0, p, false);
      tp.renderer.render(tp.scene, cam);
      return tp.renderer.domElement.toDataURL("image/png");
    },
    [s.eye ?? [0, 0, 0], s.look ?? [0, 0, 0]] as const,
  );
  const { writeFileSync } = await import("node:fs");
  const file = `${out}/${name}.png`;
  writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
  console.log(`${name}: ${file}`);
};
const shot = async (name: string) => {
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const cs = [...document.querySelectorAll("canvas")];
    const big = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    big?.setAttribute("data-wxshot", "");
    if (!document.getElementById("wxshot-css")) {
      const st = document.createElement("style");
      st.id = "wxshot-css";
      st.textContent = "*:not(:has([data-wxshot])):not([data-wxshot]){visibility:hidden!important}";
      document.head.appendChild(st);
    }
  });
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file });
  console.log(`${name}: ${file}`);
};

for (const s of SPOTS) {
  if (want && !want.includes(s.name)) continue;
  await go(s.at, s.level);
  await frame(s);
  for (const h of hours) {
    await hold(h);
    await page.waitForTimeout(400);
    await hold(h);
    const name = `${s.name}-${String(Math.floor(h)).padStart(2, "0")}`;
    if (s.eye) {
      await page.waitForTimeout(900);
      await eyeShot(name, s);
    } else await shot(name);
  }
}
await browser.close();
