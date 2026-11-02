/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Phase 3 of docs/plan/65-the-weather.md: the stills of the snow as a layer — the game's own (wx3d.ts),
// on today's white world, in the game as Ana (the dev stack, :3100 and :8100, the machine's GPU):
// the snow lying held at each state (the room's left out), the shapes pressed and grown, the dusting.
// snow 1 is to match today's (design/screens/weather's snow100), snow 0 to leave no snow shapes.
//   node --experimental-strip-types e2e/snow-layer-shots.mts [out dir]
//   QUALITY=medium; SPOTS=lot,…; STATES=s0,…; HOURS=12,…; SHEETS=1: the contact sheets alone;
//   FRAMES=1 (or all): frame times instead of stills; WORLD=ws://localhost:2667: an offline world
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, chromium, type Page, request } from "@playwright/test";
import { DRY, type Ground, type Sky, stepGround } from "@yutopia/shared/weather";

const out = resolve(process.argv[2] ?? "../../design/screens/snow-layer");
mkdirSync(out, { recursive: true });
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const quality = process.env.QUALITY ?? "high";
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 }); // the land's coords → the ground floor's

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
// (WORLD=ws://localhost:2667: in an offline world-server's world instead — the dev world and whoever's
// in it untouched — as an admin there, signed in to the API as Bia)
const offline = process.env.WORLD;
async function open(browser: Browser, email: string): Promise<Page> {
  const tok = await token(offline ? "bia@yutopia.test" : email);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  if (offline)
    await page.route("**/api/session", async (route) => {
      const r = await route.fetch();
      const j = await r.json();
      j.worldUrl = offline;
      j.worldToken = "dev:905:Shots:member,builder,admin";
      await route.fulfill({ response: r, json: j });
    });
  page.on("pageerror", (e) => console.log(`  ${email}:`, e.message));
  page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text().slice(0, 400)));
  await page.addInitScript(
    ([t, q]) => {
      localStorage.setItem("yutopia:token", t);
      localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q }));
    },
    [tok, quality] as const,
  );
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => {
    const room = (window as any).__yutopia.room;
    room.send("mod:dark", { mode: "peaceful" });
    // (no morning fog, an even grey sky: the snow's own look)
    room.send("mod:fog", { fog: "clear", now: true });
    room.send("mod:weather", { to: "cloudy", now: true });
  });
  return page;
}

interface State {
  name: string;
  snow: number;
  melt?: number;
  sky?: "clear" | "cloudy" | "rain" | "snow";
  wet?: number;
  puddles?: number;
  icicle?: number;
  ice?: number;
}
// DAY=1 (phase 5's): a whole snow day, then a whole thaw, run fast — the shared ground rule stepped
// here (four hours of snow at −3 °C, two cold and clear, ten of thaw at +6 in the sun), a still at
// each step, the snow, its going, the wet and the icicles as the view would have them
function timeline(): State[] {
  const out: State[] = [];
  let g: Ground = { ...DRY };
  let was = 0;
  let ice = 0;
  const at = (name: string, sky: State["sky"]) => {
    const melt = g.snow < was - 1e-4 ? 1 : 0;
    // (numbered: the sheet in the day's order)
    out.push({
      name: `t${String(out.length).padStart(2, "0")}${name}`,
      snow: g.snow,
      melt,
      sky,
      wet: g.wet,
      icicle: ice,
    });
    was = g.snow;
  };
  const run = (hours: number, sky: Sky, every: number, label: string, look: State["sky"]) => {
    for (let h = 1; h <= hours; h++) {
      for (let m = 0; m < 6; m++) {
        g = stepGround(g, sky, 12, 10 * 60_000);
        // (the view's icicles: grow while freezing after a thaw, drip above +1 — wx3d.ts)
        if (g.snow > 0.4 && g.wet > 0.2 && sky.temp < -0.5) ice = Math.min(1, ice + 1 / 3);
        else if (sky.temp > 1 || g.snow < 0.2) ice = Math.max(0, ice - 1 / 3);
      }
      if (h % every === 0) at(`${label}${h}h`, look);
    }
  };
  at("day0h", "clear");
  run(4, { kind: "snow", fall: 0.8, temp: -3, cloud: 1, storm: 0, thunder: 0 }, 1, "snow", "snow");
  run(2, { kind: "clear", fall: 0, temp: -4, cloud: 0, storm: 0, thunder: 0 }, 2, "cold", "clear");
  run(10, { kind: "clear", fall: 0, temp: 6, cloud: 0.2, storm: 0, thunder: 0 }, 2, "thaw", "clear");
  return out;
}
// (the green ones with the water open, as a warm day has it: else they'd keep the room's ice)
const STATES: State[] = [
  { name: "s0", snow: 0, sky: "clear", ice: 0 },
  { name: "grey0", snow: 0, ice: 0 },
  { name: "s15", snow: 0.15 },
  { name: "s30", snow: 0.3 },
  { name: "s60", snow: 0.6 },
  { name: "s100", snow: 1 },
  { name: "melt50", snow: 0.5, melt: 1 },
  { name: "melt20", snow: 0.2, melt: 1 },
  // (phase 6's: the rain — a downpour soaked, its puddles; a light one; the morning after it)
  { name: "rain", snow: 0, sky: "rain", wet: 1, puddles: 1, ice: 0 },
  { name: "drizzle", snow: 0, sky: "rain", wet: 0.6, puddles: 0.2, ice: 0 },
  { name: "after", snow: 0, sky: "cloudy", wet: 0.7, puddles: 0.8, ice: 0 },
  // (phase 7's: the water — open, freezing in from the shores, frozen; open in the rain)
  { name: "water", snow: 0, sky: "clear", ice: 0 },
  { name: "ice40", snow: 0.2, sky: "cloudy", ice: 0.4 },
  { name: "ice100", snow: 0.6, sky: "cloudy", ice: 1 },
  { name: "waterrain", snow: 0, sky: "rain", wet: 1, puddles: 0.6, ice: 0 },
];
const LATE = ["s0", "s100", "rain"];
async function setState(p: Page, s: State, hour: number) {
  await p.evaluate(
    ([s, hour]) => {
      const win = window as any;
      const w = win.__yutopia;
      const tp = w.tp;
      w.updateNight = () => {};
      w.hour = hour;
      w.model?.setClock(hour);
      tp.setHour(hour);
      if (w.life) w.life.weather = () => [0, 0];
      // (the sky: the room's, called — an even grey unless the state says)
      if (win.__wxSky !== (s.sky ?? "cloudy")) {
        win.__wxSky = s.sky ?? "cloudy";
        w.room.send("mod:weather", { to: win.__wxSky, now: true });
      }
      const L = win.__wxLayer;
      L.hold.on = true;
      L.wx.wxSnow.value = s.snow;
      L.wx.wxMelt.value = s.melt ?? 0;
      L.wx.wxWet.value = s.wet ?? 0;
      L.wx.wxPud.value = s.puddles ?? 0;
      L.wx.wxIce.value = s.ice ?? 1;
      L.wx.wxIcicle.value = s.icicle ?? 1;
    },
    [s, hour] as const,
  );
}

const me = (p: Page) =>
  p.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.room.state.players.get(w.room.sessionId);
    return { x: m.x as number, y: m.y as number, z: (m.z ?? 0) as number, level: m.level as number };
  });
// the camera behind me, looking at `to` (floor tiles)
async function frame(p: Page, to: { x: number; y: number }, v: { pitch?: number; dist?: number; lift?: number } = {}) {
  await p.evaluate(
    ([t, o]) => {
      const w = (window as any).__yutopia;
      const m = w.room.state.players.get(w.room.sessionId);
      const yaw = Math.atan2(t.y - m.y, t.x - m.x);
      const b = w.walker.body;
      b.yaw = yaw;
      if (w.walker.prev) w.walker.prev.yaw = yaw;
      const tp = w.tp;
      tp.mode = "free";
      tp.yaw = yaw;
      tp.pitch = o.pitch ?? 0.16;
      tp.dist = o.dist ?? 5.5;
      tp.dragged = 1e12;
      const T = tp.target;
      for (const k of ["set", "copy", "lerp", "add"]) delete T[k];
      T.set(m.x, (m.z ?? 0) + (o.lift ?? 1.4), m.y);
      for (const k of ["set", "copy", "lerp", "add"]) T[k] = () => T;
    },
    [to, v] as const,
  );
  await p.waitForTimeout(1200);
}
const go = async (p: Page, at: { x: number; y: number }, level = 0) => {
  for (let k = 0; k < 4; k++) {
    if (k > 0) {
      // (a long jump that didn't take: by the arrival point first)
      await p.evaluate(() => (window as any).__yutopia.teleport("spawn"));
      await p.waitForTimeout(8000);
    }
    await p.evaluate(([a, l]) => (window as any).__yutopia.teleport({ ...a, level: l }), [at, level] as const);
    await p.waitForFunction((l) => (window as any).__yutopia.level === l, level, { timeout: 20_000 });
    const there = await p
      .waitForFunction(
        (a) => {
          const w = (window as any).__yutopia;
          const m = w.room.state.players.get(w.room.sessionId);
          return Math.hypot(m.x - a.x, m.y - a.y) < 3;
        },
        at,
        { timeout: 25_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (there) {
      await p.waitForTimeout(7000);
      return;
    }
    console.log(`  (teleport to ${at.x}, ${at.y} didn't take: again)`);
  }
  throw new Error(`can't get to ${at.x}, ${at.y}`);
};
const shot = async (p: Page, name: string) => {
  await p.waitForTimeout(700);
  await p.evaluate(() => {
    // the 3D view's canvas alone: the HUD hidden
    const cs = [...document.querySelectorAll("canvas")];
    const big = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    big?.setAttribute("data-wxshot", "");
    if (!document.getElementById("wxshot-css")) {
      const s = document.createElement("style");
      s.id = "wxshot-css";
      s.textContent = "*:not(:has([data-wxshot])):not([data-wxshot]){visibility:hidden!important}";
      document.head.appendChild(s);
    }
  });
  const file = `${out}/${quality === "high" ? "" : `${quality}-`}${name}.png`;
  await p.screenshot({ path: file });
  console.log(`${name}: ${file}`);
};

interface Spot {
  name: string;
  at: { x: number; y: number };
  to: { x: number; y: number };
  pitch?: number;
  dist?: number;
  car?: boolean; // stand by the nearest parked car and look at it
}
const SPOTS: Spot[] = [
  // the lot from the lobby's doors, looking west across it to the field and the trees
  { name: "lot", at: { x: 52, y: 22 }, to: { x: 0, y: 34 }, pitch: 0.14, dist: 6 },
  // the lawn north-east of the HQ, looking back at it and the water tower
  { name: "lawn", at: G(95, -95), to: G(20, 25), pitch: 0.12, dist: 6 },
  // the South woods trail, looking along it (dense woods both sides)
  { name: "trail", at: G(-258, 17), to: G(-278, -7), pitch: 0.12, dist: 4.5 },
  // the pond's south-west shore, looking over it to the dock and the woods
  { name: "pond", at: G(-240, -96), to: G(-236, -20), pitch: 0.1, dist: 4 },
  // Main Street, looking east along it
  { name: "main", at: G(380, -398), to: G(470, -405), pitch: 0.1, dist: 6 },
  // a car parked on Main Street, close
  { name: "car", at: G(380, -398), to: G(390, -405), pitch: 0.3, dist: 4.5, car: true },
  // (phase 3's: where the most hand-made snow is — the barn and its yard, the church, the water
  // tower, the statue on the plaza)
  { name: "farm", at: G(424, -318), to: G(452, -311), pitch: 0.12, dist: 6 },
  { name: "church", at: G(420, -515), to: G(420, -545), pitch: 0.18, dist: 6 },
  { name: "tower", at: G(-12, -78), to: G(-34, -96), pitch: 0.32, dist: 7 },
  { name: "statue", at: G(420, -372), to: G(420, -384), pitch: 0.2, dist: 5 },
  // (phase 4's: the Kart Park, in from its gate, looking over the paddock to the track)
  { name: "kart", at: G(205, -690), to: G(110, -745), pitch: 0.2, dist: 7 },
];
const hh = (h: number) =>
  `${Math.floor(h)}${h % 1 ? String(Math.round((h % 1) * 60)).padStart(2, "0") : "00"}`.padStart(4, "0");

// ── the contact sheets: a page of the stills, screenshotted ──
async function sheets(browser: Browser) {
  const files = readdirSync(out).filter((f) => f.endsWith(".png") && !f.startsWith("sheet-"));
  const groups: Record<string, string[]> = {};
  for (const f of files) {
    const [spot] = f.replace(/^medium-/, "").split("-");
    const k = f.startsWith("medium-") ? "medium" : spot;
    if (!groups[k]) groups[k] = [];
    groups[k].push(f);
  }
  const order = (f: string) => {
    const s = STATES.findIndex((x) => f.includes(`-${x.name}-`));
    const h = f.match(/-(\d{4})\.png$/)?.[1] ?? "";
    return `${h}-${String(s).padStart(2, "0")}-${f}`;
  };
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  for (const [k, fs] of Object.entries(groups)) {
    fs.sort((a, b) => order(a).localeCompare(order(b)));
    const html = `<html><body style="margin:0;background:#1b1d20;font:14px system-ui;color:#ddd">
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px">
${fs.map((f) => `<figure style="margin:0"><img src="file://${out}/${f}" style="width:100%;display:block"><figcaption style="padding:3px 2px">${f.replace(".png", "")}</figcaption></figure>`).join("\n")}
</div></body></html>`;
    const tmp = `${out}/.sheet.html`;
    writeFileSync(tmp, html);
    await page.goto(`file://${tmp}`);
    await page.waitForLoadState("load");
    await page.screenshot({ path: `${out}/sheet-${k}.png`, fullPage: true });
    console.log(`sheet-${k}.png (${fs.length})`);
  }
  await page.close();
}

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--allow-file-access-from-files"],
});
if (process.env.SHEETS) {
  await sheets(browser);
  await browser.close();
  process.exit(0);
}
const ana = await open(browser, "ana@yutopia.test");
const wantSpots = process.env.SPOTS?.split(",");
const wantStates = process.env.STATES?.split(",");
const hours = process.env.HOURS?.split(",").map(Number) ?? (quality === "high" ? [12, 22] : [12]);
for (const s of SPOTS) {
  if (wantSpots && !wantSpots.includes(s.name)) continue;
  await go(ana, s.at, 0);
  await ready(ana).catch(() => {});
  let to = s.to;
  if (s.car) {
    const c = await ana.evaluate(() => {
      const w = (window as any).__yutopia;
      const tp = w.tp;
      const m = w.room.state.players.get(w.room.sessionId);
      let best: any = null;
      let bd = 1e9;
      const v = tp.camera.position.clone();
      tp.scene.traverse((o: any) => {
        const k = o.material?.customProgramCacheKey?.() ?? "";
        if (!o.isMesh || !String(k).startsWith("car-wear")) return;
        o.getWorldPosition(v);
        const d = Math.hypot(v.x - m.x, v.z - m.y);
        if (d < bd) {
          bd = d;
          best = { x: v.x, y: v.z };
        }
      });
      return best;
    });
    if (c) {
      await go(ana, { x: c.x + 3.2, y: c.y + 2.2 }, 0);
      to = c;
    }
  }
  console.log(s.name, await me(ana));
  await frame(ana, to, { pitch: s.pitch, dist: s.dist });
  if (process.env.FRAMES) {
    // the whole frame stepped by hand, the GPU waited on (as plan 64's), 120 frames, the median
    // (FRAMES=all: every weather, phase 8's — dry, white, thawing, the downpour, the morning after,
    // the water open, frozen)
    const timed =
      process.env.FRAMES === "all"
        ? ["s0", "s100", "melt50", "rain", "after", "water", "ice100"]
        : ["s0", "s100", "rain"];
    for (const st of STATES.filter((x) => timed.includes(x.name))) {
      await ana.waitForTimeout(st.sky ? 1200 : 0);
      await setState(ana, st, 12);
      await ana.waitForTimeout(800);
      const ms = await ana.evaluate(() => {
        const c = (window as any).__yutopia;
        const gl = c.tp.renderer.getContext();
        const out: number[] = [];
        for (let i = 0; i < 130; i++) {
          const t0 = performance.now();
          c.frame(1 / 60, t0);
          gl.finish();
          if (i >= 10) out.push(performance.now() - t0);
        }
        out.sort((a, b) => a - b);
        return +out[out.length >> 1].toFixed(2);
      });
      console.log(`frame ${quality} ${s.name} ${st.name}: ${ms} ms`);
    }
    continue;
  }
  for (const h of hours) {
    const states = process.env.DAY
      ? timeline()
      : STATES.filter((x) => (wantStates ? wantStates.includes(x.name) : h === 12 ? true : LATE.includes(x.name)));
    for (const st of states) {
      await setState(ana, st, h);
      await ana.waitForTimeout(st.sky ? 1500 : 600);
      await setState(ana, st, h);
      await shot(ana, `${s.name}-${st.name}-${hh(h)}`);
    }
  }
}
await sheets(browser);
await browser.close();
