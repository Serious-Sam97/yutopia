/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 70 phase 9 (docs/plan/70-the-chess.md): the life-size board in the game — Ana and Bia on the dev
// stack (:3100, :8100), the machine's GPU. A board put down where there's room (taken away at the end);
// Ana walks onto white's dais and commands; Vortex asked to command black; Bia stands in for white's e2
// pawn, is carried when Ana sends it, then Vortex's men take it and she's thrown and set back; stills.
//   node --experimental-strip-types e2e/chess-big.mts [out dir]
import { mkdirSync } from "node:fs";
import { type Browser, chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/chess/big";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const ID = "e2e-wizard";
mkdirSync(out, { recursive: true });

async function token(email: string): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${api}/api/login`, {
    data: { email, password: pass },
    headers: { Accept: "application/json" },
  });
  return (await res.json()).token;
}
async function open(browser: Browser, email: string): Promise<Page> {
  const tok = await token(email);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log(`  ${email} page:`, e.message));
  page.on("console", (m) => m.type() === "error" && console.log(`  ${email} console:`, m.text().slice(0, 300)));
  await page.addInitScript((t) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high" }));
  }, tok);
  await page.goto(base);
  await page.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 120_000 },
  );
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { mode: "peaceful" }));
  return page;
}
const shot = async (p: Page, name: string, wait = 400) => {
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
};
const frames = (p: Page, ms: number) =>
  p.evaluate(
    (t) =>
      new Promise<{ median: number; max: number; over33: number; n: number }>((done) => {
        const d: number[] = [];
        let last = performance.now();
        const end = last + t;
        const step = (now: number) => {
          d.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(step);
          else {
            const s = [...d.slice(2)].sort((a, b) => a - b);
            done({
              median: +s[Math.floor(s.length / 2)].toFixed(1),
              max: +s[s.length - 1].toFixed(1),
              over33: s.filter((x) => x > 33.4).length,
              n: s.length,
            });
          }
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
const props = (p: Page) => p.evaluate((id) => (window as any).__yutopia.model.getObject(id)?.props ?? null, ID);

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const ana = await open(browser, "ana@yutopia.test");
let bia: Page | null = null;
try {
  // room for a 10×10 on the ground floor: the first clear block, a tile round it
  const spot = await ana.evaluate((id) => {
    const w = (window as any).__yutopia;
    w.room.send("obj:remove", { id });
    w.teleport({ x: 40, y: 20, level: 0 });
    return true;
  }, ID);
  void spot;
  await ana.waitForTimeout(3000);
  const at = await ana.evaluate(() => {
    const w = (window as any).__yutopia;
    const g = w.grid;
    const objs = w.model.allObjects();
    for (let y = 1; y < g.height - 12; y++)
      for (let x = 1; x < g.width - 12; x++) {
        let ok = true;
        for (let yy = y - 1; yy <= y + 10 && ok; yy++)
          for (let xx = x - 1; xx <= x + 10 && ok; xx++) ok = g.ok(xx, yy) && !g.seatAt(xx + 0.5, yy + 0.5);
        if (!ok) continue;
        // (and nothing standing there that's walked over: rugs and the like)
        if (objs.some((o: any) => o.x >= x - 1 && o.x <= x + 10 && o.y >= y - 1 && o.y <= y + 10)) continue;
        return { x, y };
      }
    return null;
  });
  if (!at) throw new Error("no room for a life-size board on the ground floor");
  const level = await ana.evaluate(() => (window as any).__yutopia.level);
  await ana.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 0.3, y: p.y + 5, level: 0 }), at);
  await ana.waitForTimeout(3000);
  console.log("frames, the same spot without the board:", JSON.stringify(await frames(ana, 4000)));
  await ana.evaluate(
    ([id, p, l]) =>
      (window as any).__yutopia.room.send("obj:put", {
        id,
        kind: "wizard_chess",
        x: p.x,
        y: p.y,
        yaw: 0,
        props: { variant: 1, level: l },
      }),
    [ID, at, level] as const,
  );
  await ana.waitForFunction((id) => !!(window as any).__yutopia.model.getObject(id), ID, { timeout: 10_000 });
  console.log("board at", at);
  // Ana to the white dais (u 0.3, v 5)
  await ana.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 0.3, y: p.y + 5, level: 0 }), at);
  await ana.waitForTimeout(2500);
  await ana.waitForFunction(() => (window as any).__hud.get().chess?.side === "w", null, { timeout: 20_000 });
  console.log("Ana commands white");
  await shot(ana, "1-commander-view", 1500);
  console.log("frames, commanding (32 men posed, their bodies):", JSON.stringify(await frames(ana, 4000)));
  await ana.evaluate(() => {
    (window as any).__yutopia.tp.world.chessMen.root.visible = false;
  });
  console.log("frames, commanding, the men hidden:", JSON.stringify(await frames(ana, 4000)));
  await ana.evaluate(() => {
    (window as any).__yutopia.tp.world.chessMen.root.visible = true;
  });
  console.log("frames, commanding again:", JSON.stringify(await frames(ana, 4000)));
  // Vortex commands black
  await ana.evaluate(() => (window as any).__yutopia.chess.vortex("easy"));
  await ana.waitForFunction(() => !!(window as any).__hud.get().chess?.vortex.b, null, { timeout: 10_000 });
  // Bia stands in for white's e2 pawn (e2: square 52 — rank 2 at x 0.6 + 1.5·1.1, file e at z 0.6 + 4.5·1.1)
  bia = await open(browser, "bia@yutopia.test");
  await bia.evaluate(
    ([p]) => (window as any).__yutopia.teleport({ x: p.x + 0.6 + 1.5 * 1.1, y: p.y + 0.6 + 4.5 * 1.1, level: 0 }),
    [at] as const,
  );
  await bia.waitForTimeout(3000);
  await bia.evaluate((id) => (window as any).__yutopia.activateObject(id, true), ID);
  await bia.waitForFunction(
    (id) => {
      const o = (window as any).__yutopia.model.getObject(id);
      return o?.props?.si && Object.keys(o.props.si).length === 1;
    },
    ID,
    { timeout: 10_000 },
  );
  console.log("Bia stands in for", JSON.stringify((await props(bia))?.si));
  await ana.bringToFront();
  await shot(ana, "2-bia-stands-in", 800);
  // Ana sends e2–e4: Bia carried
  await ana.evaluate(() => {
    const c = (window as any).__yutopia.chess;
    c.cursor = 52;
  });
  await ana.keyboard.press("KeyE");
  await ana.evaluate(() => {
    (window as any).__yutopia.chess.cursor = 36;
  });
  await ana.keyboard.press("KeyE");
  await shot(ana, "3-carried", 700);
  await ana.waitForFunction(() => (window as any).__hud.get().chess?.moves.length >= 1, null, { timeout: 10_000 });
  await ana.waitForTimeout(2000);
  console.log("si after e4:", JSON.stringify((await props(ana))?.si));
  await shot(ana, "4-after-e4", 300);
  // the watcher's view (C: over the top)
  await ana.keyboard.press("KeyC");
  await shot(ana, "5-over-the-top", 1500);
  await ana.keyboard.press("KeyC");
  // Vortex's reply
  await ana.waitForFunction(() => (window as any).__hud.get().chess?.moves.length >= 2, null, { timeout: 25_000 });
  await shot(ana, "6-vortex-replied", 2600);
  // from Bia's own eyes (standing in)
  await bia.bringToFront();
  await shot(bia, "7-bia-on-the-board", 600);
  // up off the dais
  await ana.bringToFront();
  await ana.keyboard.press("KeyQ");
  await ana.waitForFunction(() => !(window as any).__hud.get().chess, null, { timeout: 10_000 });
  console.log("Ana off the dais; Vortex:", (await props(ana))?.vx ?? "(gone)");
} finally {
  await ana.evaluate((id) => (window as any).__yutopia.room.send("obj:remove", { id }), ID).catch(() => {});
  await ana.waitForTimeout(500);
  await browser.close();
}
