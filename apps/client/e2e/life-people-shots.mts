/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 4.7 — the life look's people in the world, for sign-off: Bia (the life look, High) sees Ana
// and Cai (each in a browser of their own — their look doesn't matter: Bia's view draws everyone) stood
// together at the lot, the lobby and the studio, by day and at night; then their faces at talking
// distance (the game's renderer, a camera of our own at the face). The dev stack on :3100.
//   node --experimental-strip-types e2e/life-people-shots.mts [out dir]      SPOTS=lot,…  HOURS=12,22
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/life/p47";
mkdirSync(out, { recursive: true });
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const want = process.env.SPOTS?.split(",");
const hours = (process.env.HOURS ?? "12,22").split(",").map(Number);

interface Spot {
  name: string;
  at: { x: number; y: number };
  level: number;
  /** which way the group stands from Bia */
  to: { x: number; y: number };
  /** the camera this far back (m) */
  d?: number;
}
const SPOTS: Spot[] = [
  { name: "lot", at: { x: -20, y: 18 }, level: 0, to: { x: 10, y: 18 } },
  { name: "lobby", at: { x: 3, y: 12 }, level: 0, to: { x: -5, y: 12 } },
  // (upstairs: where everyone arrives, the office's lobby — `at` and `to` from the spawn; level 4 by a
  // coordinate is the old roof now, plan 72's floors)
  { name: "upstairs", at: { x: 0, y: 1 }, level: -1, to: { x: 0, y: -6 }, d: 5.4 },
];

async function token(email: string): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${api}/api/login`, {
    data: { email, password: pass },
    headers: { Accept: "application/json" },
  });
  return (await res.json()).token;
}

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
async function open(email: string, look: string, quality: string, w = 1440, h = 900): Promise<Page> {
  const tok = await token(email);
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  ${email}:`, e.message));
  await page.addInitScript(
    ([t, q]) => {
      localStorage.setItem("yutopia:token", t);
      localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q }));
    },
    [tok, quality] as const,
  );
  await page.goto(`${base}/?look=${look}`);
  await page.waitForFunction(
    () => {
      const hud = (window as any).__hud?.get();
      return hud?.phase === "ready" && hud.loading?.on === false;
    },
    null,
    { timeout: 180_000 },
  );
  return page;
}

// (the others first, small and low: only Bia's frames matter)
const ana = await open("ana@yutopia.test", "classic", "low", 640, 400);
const cai = await open("cai@yutopia.test", "classic", "low", 640, 400);
const bia = await open("bia@yutopia.test", "life", "high");
await bia.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { mode: "peaceful" }));

const go = async (p: Page, at: { x: number; y: number }, level: number) => {
  for (let k = 0; k < 3; k++) {
    await p.evaluate(([a, l]) => (window as any).__yutopia.teleport({ ...a, level: l }), [at, level] as const);
    const there = await p
      .waitForFunction(
        ([a, l]) => {
          const w = (window as any).__yutopia;
          const m = w.room.state.players.get(w.room.sessionId);
          return w.level === l && Math.hypot(m.x - a.x, m.y - a.y) < 1.5;
        },
        [at, level] as const,
        { timeout: 25_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (there) return;
  }
  throw new Error(`can't get to ${at.x}, ${at.y} on ${level}`);
};
const face = (p: Page, yaw: number) =>
  p.evaluate((y) => {
    const w = (window as any).__yutopia;
    w.walker.body.yaw = y;
    if (w.walker.prev) w.walker.prev.yaw = y;
  }, yaw);
const hold = (h: number) =>
  bia.evaluate((h) => {
    const w = (window as any).__yutopia;
    w.updateNight = () => {};
    w.hour = h;
    w.model?.setClock?.(h);
    w.engine?.setClock?.(h);
    w.tp.setHour(h);
    if (w.life) w.life.weather = () => [0, 0];
  }, h);
const hud = () =>
  bia.evaluate(() => {
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
// the game's camera behind Bia's shoulder, the group ahead; `d` back, `pitch` down
const frame = (yaw: number, d: number, pitch: number, lift: number) =>
  bia.evaluate(
    ([yaw, d, pitch, lift]) => {
      const w = (window as any).__yutopia;
      const m = w.room.state.players.get(w.room.sessionId);
      const tp = w.tp;
      tp.mode = "free";
      tp.yaw = yaw;
      tp.pitch = pitch;
      tp.dist = d;
      tp.dragged = 1e12;
      const T = tp.target;
      for (const k of ["set", "copy", "lerp", "add"]) delete T[k];
      // (its height as the game has it — on an upper floor that's not the world's height: off that, the
      // camera went up over the roof — moved to `lift` over the floor as the game holds it at 1.4)
      T.set(m.x + Math.cos(yaw) * 1.1, T.y - 1.4 + lift, m.y + Math.sin(yaw) * 1.1);
      for (const k of ["set", "copy", "lerp", "add"]) T[k] = () => T;
    },
    [yaw, d, pitch, lift] as const,
  );
// someone's face, from in front of them a little turned, at talking distance (the game's renderer,
// our own camera: the game's won't come this close)
const closeUp = (sid: string, file: string, turn: number) =>
  bia
    .evaluate(
      ([sid, turn]) => {
        const w = (window as any).__yutopia;
        const tp = w.tp;
        const p3 = tp.people3.get(sid);
        if (!p3) return null;
        const V = tp.camera.position.constructor;
        const head = p3.model.bones.head.getWorldPosition(new V());
        const eye = p3.model.eyePosition();
        p3.model.root.localToWorld(eye);
        const q = p3.model.root.getWorldQuaternion(tp.camera.quaternion.clone());
        const fwd = new V(Math.sin(turn), 0, Math.cos(turn)).applyQuaternion(q);
        const cam = tp.camera.clone();
        cam.fov = 28;
        cam.aspect = 1;
        cam.near = 0.02;
        cam.updateProjectionMatrix();
        cam.position.copy(eye).addScaledVector(fwd, 0.85);
        cam.position.y += 0.02;
        cam.lookAt(head.x, eye.y - 0.06, head.z);
        const r = tp.renderer;
        const was = { w: r.domElement.width, h: r.domElement.height };
        r.setSize(900, 900, false);
        r.render(tp.scene, cam);
        const url = r.domElement.toDataURL("image/png");
        r.setSize(was.w / r.getPixelRatio(), was.h / r.getPixelRatio(), false);
        return url;
      },
      [sid, turn] as const,
    )
    .then((url) => {
      if (url) writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
      console.log(url ? `${file}` : `  no ${sid} to draw`);
    });

const sidOf = (p: Page) => p.evaluate(() => (window as any).__yutopia.room.sessionId as string);
const anaId = await sidOf(ana);
const caiId = await sidOf(cai);

for (const s0 of SPOTS) {
  if (want && !want.includes(s0.name)) continue;
  let s = s0;
  if (s0.level < 0) {
    // (off the spawn: its place and floor)
    await bia.evaluate(() => (window as any).__yutopia.teleport("spawn"));
    await bia.waitForTimeout(3000);
    const sp = await bia.evaluate(() => {
      const w = (window as any).__yutopia;
      return { x: w.map.spawn.x, y: w.map.spawn.y, level: w.level };
    });
    s = {
      ...s0,
      at: { x: sp.x + s0.at.x, y: sp.y + s0.at.y },
      to: { x: sp.x + s0.to.x, y: sp.y + s0.to.y },
      level: sp.level,
    };
  }
  const yaw = Math.atan2(s.to.y - s.at.y, s.to.x - s.at.x);
  const ux = Math.cos(yaw);
  const uy = Math.sin(yaw);
  // Ana ahead and a little left, Cai ahead and right: a three in a loose ring, facing in
  const anaAt = { x: s.at.x + ux * 1.9 - uy * 0.55, y: s.at.y + uy * 1.9 + ux * 0.55 };
  const caiAt = { x: s.at.x + ux * 1.6 + uy * 0.9, y: s.at.y + uy * 1.6 - ux * 0.9 };
  await go(bia, s.at, s.level);
  await go(ana, anaAt, s.level);
  await go(cai, caiAt, s.level);
  const mid = { x: (s.at.x + anaAt.x + caiAt.x) / 3, y: (s.at.y + anaAt.y + caiAt.y) / 3 };
  const toMid = (a: { x: number; y: number }) => Math.atan2(mid.y - a.y, mid.x - a.x);
  await face(ana, toMid(anaAt));
  await face(cai, toMid(caiAt));
  await face(bia, toMid(s.at));
  await bia.waitForTimeout(6000);
  await hud();
  for (const h of hours) {
    await hold(h);
    await frame(yaw + 0.62, s.d ?? 4.2, 0.16, 1.35);
    await bia.waitForTimeout(2500);
    await bia.screenshot({ path: `${out}/${s.name}-${String(h).padStart(2, "0")}.png` });
    console.log(`${out}/${s.name}-${String(h).padStart(2, "0")}.png`);
    // Cai waves
    await cai.evaluate(() => (window as any).__yutopia.emote(0));
    await bia.waitForTimeout(700);
    await bia.screenshot({ path: `${out}/${s.name}-${String(h).padStart(2, "0")}-wave.png` });
    await closeUp(anaId, `${out}/${s.name}-${String(h).padStart(2, "0")}-ana.png`, 0.35);
    await closeUp(caiId, `${out}/${s.name}-${String(h).padStart(2, "0")}-cai.png`, -0.35);
    await bia.waitForTimeout(2500);
  }
}
await browser.close();
