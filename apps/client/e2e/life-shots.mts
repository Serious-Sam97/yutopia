/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73, phase 0a — the life look's light alone on today's models: the same frames of the live game
// (as Bia, High, the dev stack) in today's look and with the probe on (src/world/look/life-probe.ts,
// `__lifeProbe` — dev builds only), back to back.
//   node --experimental-strip-types e2e/life-shots.mts [out dir]
//   SPOTS=lot,…  TAKES=today,life,…  LOOK=life (the game's own life look; with TAKES=today)
import { mkdirSync } from "node:fs";
import { chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/life/0a";
mkdirSync(out, { recursive: true });
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const want = process.env.SPOTS?.split(",");

interface Spot {
  name: string;
  at: { x: number; y: number };
  level: number;
  to: { x: number; y: number };
  pitch?: number;
  dist?: number;
  lift?: number;
  face?: boolean;
  hours: number[];
}
const SPOTS: Spot[] = [
  { name: "lot", at: { x: -24, y: 18 }, level: 0, to: { x: 10, y: 18 }, pitch: 0.12, dist: 6, hours: [12, 17, 22] },
  { name: "corner", at: { x: -16, y: -14 }, level: 0, to: { x: 10, y: 10 }, pitch: 0.18, dist: 6, hours: [12] },
  {
    name: "face",
    at: { x: -16, y: 18 },
    level: 0,
    to: { x: 10, y: 18 },
    pitch: 0.04,
    dist: 1.15,
    face: true,
    hours: [12, 22],
  },
  { name: "lobby", at: { x: 3, y: 12 }, level: 0, to: { x: -5, y: 12 }, pitch: 0.06, dist: 2.6, hours: [12, 22] },
  { name: "studio", at: { x: 20, y: 12 }, level: 4, to: { x: 10, y: 12 }, pitch: 0.45, dist: 6, hours: [12, 22] },
  { name: "live", at: { x: 34, y: 28 }, level: 4, to: { x: 34, y: 18 }, pitch: 0.35, dist: 5, hours: [12] },
  { name: "tracking", at: { x: 17.5, y: 14.5 }, level: 4, to: { x: 17.5, y: 24 }, pitch: 0.3, dist: 4, hours: [12] },
  // (plan 73 phase 7.2: the lifts' lobby on the ground floor, the stairwell's foot)
  { name: "lifts", at: { x: 7, y: 25 }, level: 0, to: { x: 7, y: 30 }, pitch: 0.08, dist: 3.2, hours: [12] },
  {
    name: "stairs",
    at: { x: 11, y: 30.4 },
    level: 0,
    to: { x: 13, y: 33.5 },
    pitch: 0.1,
    dist: 0.6,
    lift: 1.6,
    hours: [12],
  },
  // (plan 73 phase 8: in among the woods north of the campus, and their edge from the field)
  { name: "woods", at: { x: 10, y: -40 }, level: 0, to: { x: 14, y: -70 }, pitch: 0.06, dist: 5, hours: [12] },
  { name: "edge", at: { x: 30, y: -20 }, level: 0, to: { x: 30, y: -60 }, pitch: 0.12, dist: 7, hours: [12] },
  { name: "grounds", at: { x: 5, y: 6 }, level: 4, to: { x: 5, y: -5 }, pitch: 0.1, dist: 4, hours: [12, 17] },
];

// A take: today's look, or the probe with these options (life-probe.ts LifeOpts).
const TAKES: { name: string; on: boolean; o?: Record<string, unknown> }[] = [
  { name: "today", on: false },
  { name: "life", on: true },
];
// (more takes from the command line, for a quick A/B: EXTRA='[{"name":"x","on":true,"o":{"ao":0}}]')
if (process.env.EXTRA) TAKES.push(...JSON.parse(process.env.EXTRA));
const wantTakes = process.env.TAKES?.split(",");
const takes = TAKES.filter((t) => !wantTakes || wantTakes.includes(t.name));

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
// (QUALITY=medium|low: another tier)
const quality = process.env.QUALITY ?? "high";
await page.addInitScript(
  ([t, q]) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q }));
  },
  [tok, quality] as const,
);
// (LOOK=life: the game's own life look, `?look=` — plan 73 phase 2 on; with TAKES=today, the probe off)
await page.goto(process.env.LOOK ? `${base}/?look=${process.env.LOOK}` : base);
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
    b.yaw = s.face ? yaw + Math.PI : yaw;
    if (w.walker.prev) w.walker.prev.yaw = b.yaw;
    const tp = w.tp;
    tp.mode = "free";
    tp.yaw = yaw;
    tp.pitch = s.pitch ?? 0.16;
    tp.dist = s.dist ?? 5.5;
    tp.dragged = 1e12;
    const T = tp.target;
    for (const k of ["set", "copy", "lerp", "add"]) delete T[k];
    T.set(m.x, (m.z ?? 0) + (s.lift ?? (s.face ? 1.55 : 1.4)), m.y);
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

const apply = async (t: { on: boolean; o?: Record<string, unknown> }) => {
  // (off first: a take's options are made fresh, the scene's newcomers swapped too)
  await page.evaluate(() => (window as any).__lifeProbe(false));
  if (t.on) console.log("  ", await page.evaluate((o) => (window as any).__lifeProbe(true, o), t.o ?? {}));
};

const shot = async (name: string) => {
  await page.waitForTimeout(1500);
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
  for (const h of s.hours) {
    await hold(h);
    await page.waitForTimeout(400);
    for (const t of takes) {
      await hold(h);
      await apply(t);
      await shot(`${s.name}-${String(h).padStart(2, "0")}-${t.name}`);
    }
  }
  await apply({ on: false });
}
await browser.close();
