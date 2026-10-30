/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Phase 0 of docs/plan/56-the-controls.md: the stills under the mocks (design/controls/mock/bg):
// the lobby with today's camera and with the low one behind you (Vortex on the sofa, Bia by
// you), and the lot by day and by night. Ana and Bia on the dev stack (:3100, :8100), the
// machine's GPU.
//   node --experimental-strip-types e2e/controls-shots.mts [out dir]
import { type Browser, chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/controls/mock/bg";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";

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
async function open(browser: Browser, email: string): Promise<Page> {
  const tok = await token(email);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log(`  ${email}:`, e.message));
  await page.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high" }));
  }, tok);
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { mode: "peaceful" }));
  // (the mocks draw their own prompt: today's is hidden)
  await page.addStyleTag({ content: 'button[class*="bottom-[112px]"]{visibility:hidden!important}' });
  return page;
}
const me = (p: Page) =>
  p.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.room.state.players.get(w.room.sessionId);
    return { x: m.x as number, y: m.y as number, level: m.level as number, uid: m.uid as number };
  });
// the camera low behind me, looking at `to` (tiles); `at`: the point it turns round (me by default)
async function frame(
  p: Page,
  to: { x: number; y: number },
  v: { pitch?: number; dist?: number; at?: { x: number; y: number } } = {},
) {
  await p.evaluate(
    ([t, o]) => {
      const w = (window as any).__yutopia;
      const m = w.room.state.players.get(w.room.sessionId);
      const at = o.at ?? { x: m.x, y: m.y };
      const yaw = Math.atan2(t.y - m.y, t.x - m.x);
      const b = w.walker.body;
      b.yaw = yaw;
      if (w.walker.prev) w.walker.prev.yaw = yaw;
      const tp = w.tp;
      tp.mode = "free";
      tp.yaw = Math.atan2(t.y - at.y, t.x - at.x);
      tp.pitch = o.pitch ?? 0.22;
      tp.dist = o.dist ?? 4.2;
      tp.dragged = 1e12;
      const T = tp.target;
      for (const k of ["set", "copy", "lerp", "add"]) delete T[k];
      T.set(at.x, (m.z ?? 0) + 1.25, at.y);
      for (const k of ["set", "copy", "lerp", "add"]) T[k] = () => T;
    },
    [to, v] as const,
  );
  await p.waitForTimeout(1200);
}
async function free(p: Page) {
  await p.evaluate(() => {
    const tp = (window as any).__yutopia.tp;
    for (const k of ["set", "copy", "lerp", "add"]) delete tp.target[k];
    tp.mode = "chase";
    tp.dragged = 0;
  });
}
async function hour(p: Page, h: number) {
  await p.evaluate((hh) => {
    const c = (window as any).__yutopia;
    c.updateNight = () => {};
    c.hour = hh;
    c.model.setClock(hh);
    c.tp?.setHour(hh);
  }, h);
}
const shot = async (p: Page, name: string) => {
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log(`${name}: ${out}/${name}.png`);
};

const tp = (p: Page, x: number, y: number, level: number) =>
  p.evaluate(([px, py, l]) => (window as any).__yutopia.room.send("teleport", { to: { x: px, y: py, level: l } }), [
    x,
    y,
    level,
  ] as const);

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const ana = await open(browser, "ana@yutopia.test");
const bia = await open(browser, "bia@yutopia.test");
const spots = (process.env.SPOTS ?? "lobby,lot").split(",");

if (spots.includes("lobby")) {
  // the lounge's sofa ahead, Bia between
  await tp(ana, 11.5, 32.5, 4);
  await ana.waitForTimeout(2000);
  await hour(ana, 15);
  await free(ana);
  await ana.waitForTimeout(2500);
  await shot(ana, "lobby-now");
  await tp(bia, 13.5, 31.5, 4);
  await bia.waitForTimeout(2500);
  await ready(bia).catch(() => {});
  const a = await me(ana);
  const b = await me(bia);
  console.log("lobby: ana", a, "bia", b);
  await frame(ana, { x: 16, y: 31.5 });
  await shot(ana, "lobby-kh");
  await frame(ana, b, { dist: 5.2, at: { x: a.x + (b.x - a.x) * 0.35, y: a.y + (b.y - a.y) * 0.35 } });
  await shot(ana, "lobby-lock");
}

if (spots.includes("lot")) {
  // the lot's east aisle, looking up it (floor coords: the ground's + 60, + 10)
  const X = Number(process.env.LOT_X ?? 37.8);
  const Y = Number(process.env.LOT_Y ?? 30);
  await tp(ana, X, Y, 0);
  await ana.waitForTimeout(3000);
  await ready(ana);
  await tp(bia, X - 2.6, Y - 3.4, 0);
  await bia.waitForTimeout(4000);
  await ready(bia).catch(() => {});
  const a = await me(ana);
  const b = await me(bia);
  console.log("lot: ana", a, "bia", b);
  await hour(ana, 12);
  await free(ana);
  await ana.waitForTimeout(3000);
  await shot(ana, "lot-now");
  await frame(ana, { x: a.x, y: a.y - 10 }, { pitch: 0.2, dist: 4.4 });
  await shot(ana, "lot-day");
  await frame(ana, b, { dist: 5.2, at: { x: a.x + (b.x - a.x) * 0.35, y: a.y + (b.y - a.y) * 0.35 } });
  await shot(ana, "lot-lock");
  await hour(ana, 21.5);
  await ana.waitForTimeout(2000);
  await ana.keyboard.press("Digit1");
  await ana.waitForTimeout(600);
  await ana.mouse.move(720, 450);
  await ana.mouse.down({ button: "right" });
  await frame(ana, b, { pitch: 0.12, dist: 3.4 });
  await ana.waitForTimeout(800);
  await shot(ana, "lot-night-aim");
  await ana.mouse.up({ button: "right" });
}
await browser.close();
