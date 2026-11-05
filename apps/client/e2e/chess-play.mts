/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 70 (docs/plan/70-the-chess.md): chess played at the table in the game — Ana and Bia on the dev
// stack (:3100, :8100), the machine's GPU. A chess table put down near Ana (taken away at the end); Ana
// uses it and sits (white), Bia sits across (black); moves sent with the keys and the pointer; stills of
// the lean-in camera, a move played out, a capture, the end. Then Vortex (VORTEX=1): Ana alone, Vortex
// in the other chair.
//   node --experimental-strip-types e2e/chess-play.mts [out dir]
import { mkdirSync } from "node:fs";
import { type Browser, chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/chess/play";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const ID = "e2e-chess";
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
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    w.room.send("mod:dark", { mode: "peaceful" });
  });
  return page;
}
const shot = async (p: Page, name: string, wait = 400) => {
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
};
const chessHud = (p: Page) => p.evaluate(() => (window as any).__hud.get().chess);
const props = (p: Page) =>
  p.evaluate((id) => {
    const o = (window as any).__yutopia.model.getObject(id);
    return o?.props ?? null;
  }, ID);
/** Frame times over `ms` (rAF deltas): the median, the worst, how many over 33 ms. */
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
const key = async (p: Page, k: string, n = 1) => {
  for (let i = 0; i < n; i++) {
    await p.keyboard.press(k);
    await p.waitForTimeout(80);
  }
};

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const ana = await open(browser, "ana@yutopia.test");
try {
  // into the lobby (the lot outside takes no furniture)
  await ana.evaluate(() => {
    const w = (window as any).__yutopia;
    const a = w.map.areas.find((x: any) => x.key === "ground-lobby") ?? w.map.areas.find((x: any) => x.kind === "open");
    w.teleport({ x: a.x + a.w / 2, y: a.y + a.h / 2, level: 0 });
  });
  await ana.waitForTimeout(3000);
  // a table down near Ana: the first free 2×1 on her floor round her, a tile clear round it
  const at = await ana.evaluate((id) => {
    const w = (window as any).__yutopia;
    w.room.send("obj:remove", { id });
    const me = w.me;
    const g = w.grid;
    for (let r = 2; r < 9; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.floor(me.x) + dx;
          const y = Math.floor(me.y) + dy;
          let ok = true;
          for (let yy = y - 1; yy <= y + 1 && ok; yy++)
            for (let xx = x - 1; xx <= x + 2 && ok; xx++) ok = g.ok(xx, yy) && !g.seatAt(xx + 0.5, yy + 0.5);
          if (ok) return { x, y };
        }
    return null;
  }, ID);
  if (!at) throw new Error("no room for a table near Ana");
  await ana.evaluate(
    ([id, p]) =>
      (window as any).__yutopia.room.send("obj:put", {
        id,
        kind: "chess_table",
        x: p.x,
        y: p.y,
        yaw: 0,
        props: { variant: 1, level: (window as any).__yutopia.level },
      }),
    [ID, at] as const,
  );
  await ana
    .waitForFunction((id) => !!(window as any).__yutopia.model.getObject(id), ID, { timeout: 10_000 })
    .catch(async (e) => {
      console.log("at", at, "toasts", JSON.stringify(await ana.evaluate(() => (window as any).__hud.get().toasts)));
      console.log(
        "me",
        JSON.stringify(
          await ana.evaluate(() => ({ ...(window as any).__yutopia.me, level: (window as any).__yutopia.level })),
        ),
      );
      throw e;
    });
  console.log("table at", at);
  console.log("frames, the lobby with the table in view:", JSON.stringify(await frames(ana, 4000)));
  await ana.waitForTimeout(1500);

  // Ana uses it: to the white chair (the nearer free one), sat, the strip up
  await ana.evaluate((id) => (window as any).__yutopia.activateObject(id, true), ID);
  await ana
    .waitForFunction(() => !!(window as any).__hud.get().chess?.side, null, { timeout: 20_000 })
    .catch(async (e) => {
      console.log(
        JSON.stringify(
          await ana.evaluate((id) => {
            const w = (window as any).__yutopia;
            const o = w.model.getObject(id);
            const seats = [];
            for (let dx = -1; dx <= 2; dx++)
              for (let dy = -1; dy <= 1; dy++) {
                const s = w.grid.seatAt(o.x + dx + 0.5, o.y + dy + 0.5);
                if (s) seats.push({ x: o.x + dx, y: o.y + dy, s });
              }
            return {
              chess: !!w.chess,
              me: w.me,
              path: w.path?.length,
              o: { x: o.x, y: o.y },
              seats,
              hud: (window as any).__hud.get().chess,
              panel: (window as any).__hud.get().panel,
            };
          }, ID),
        ),
      );
      throw e;
    });
  const side = (await chessHud(ana)).side as "w" | "b";
  console.log("Ana sits as", side);
  await ana.waitForTimeout(1500);
  await shot(ana, "1-sat-lean-in");

  // Bia across
  const bia = await open(browser, "bia@yutopia.test");
  const level = await ana.evaluate(() => (window as any).__yutopia.level);
  await bia.evaluate(([p, l]) => (window as any).__yutopia.teleport({ x: p.x + 1, y: p.y + 2, level: l }), [
    at,
    level,
  ] as const);
  await bia.waitForFunction((id) => !!(window as any).__yutopia.model.getObject(id), ID, { timeout: 15_000 });
  await bia.waitForTimeout(2500);
  await bia.evaluate((id) => (window as any).__yutopia.activateObject(id, true), ID);
  await bia.waitForFunction(() => !!(window as any).__hud.get().chess?.side, null, { timeout: 20_000 });
  console.log("Bia sits as", (await chessHud(bia)).side);
  await ana.waitForFunction(() => {
    const c = (window as any).__hud.get().chess;
    return c?.names.w && c?.names.b;
  });

  // white plays e2–e4 with the keys: the cursor starts on e2 (white's), E picks, up twice, E sends
  const whitePage = side === "w" ? ana : bia;
  const blackPage = side === "w" ? bia : ana;
  await whitePage.bringToFront();
  await key(whitePage, "KeyE");
  console.log(
    "after E:",
    JSON.stringify(
      await whitePage.evaluate(() => {
        const c = (window as any).__yutopia.chess;
        const o = c.table();
        return {
          picked: c.picked,
          cursor: c.cursor,
          myTurn: c.myTurn(),
          at: c.at,
          uid: c.myUid(),
          w: o?.props?.w,
          fen: o?.props?.fen,
        };
      }),
    ),
  );
  await shot(whitePage, "2-picked");
  await key(whitePage, "ArrowUp", 2);
  await key(whitePage, "KeyE");
  await shot(whitePage, "3-pawn-marching", 450);
  await whitePage.waitForFunction(() => (window as any).__hud.get().chess?.moves.length === 1, null, {
    timeout: 10_000,
  });
  await shot(whitePage, "4-e4", 1600);

  // black: d7–d5 (the cursor on black's side starts at e2 too; move it there: d7 is index 11)
  await blackPage.bringToFront();
  await blackPage.evaluate(() => {
    const c = (window as any).__yutopia.chess;
    c.cursor = 11;
  });
  await key(blackPage, "KeyE");
  await blackPage.evaluate(() => {
    const c = (window as any).__yutopia.chess;
    c.cursor = 27;
  });
  await key(blackPage, "KeyE");
  await blackPage.waitForFunction(() => (window as any).__hud.get().chess?.moves.length === 2, null, {
    timeout: 10_000,
  });
  await blackPage.waitForTimeout(2200);

  // white takes: e4×d5 — the capture played out (the cut close, the pawn breaking)
  await whitePage.bringToFront();
  await whitePage.evaluate(() => {
    (window as any).__yutopia.chess.cursor = 36;
  });
  await key(whitePage, "KeyE");
  await whitePage.evaluate(() => {
    (window as any).__yutopia.chess.cursor = 27;
  });
  await key(whitePage, "KeyE");
  await shot(whitePage, "5-capture-strike", 1350);
  await shot(whitePage, "6-capture-break", 450);
  await shot(whitePage, "7-capture-after", 2200);

  // the pointer: pick the d1 queen by clicking its square (the strip's overlay hands it to the board)
  const p = await props(whitePage);
  console.log("game:", p?.log, p?.fen);

  // Bia resigns: the white king? no — black's: the crown comes off
  await blackPage.evaluate((id) => (window as any).__yutopia.room.send("chess:resign", { id }), ID);
  await whitePage.waitForFunction(() => (window as any).__hud.get().chess?.state === "resign", null, {
    timeout: 10_000,
  });
  await shot(whitePage, "8-resign-uncrown", 1100);
  await shot(whitePage, "9-resign-crown", 2000);
  // the wheel: over the top
  await whitePage.keyboard.press("KeyC");
  await shot(whitePage, "10-over-the-top", 1500);
  await whitePage.keyboard.press("KeyC");

  // Bia gets up (her side given back) and goes
  await bia.bringToFront();
  await bia.keyboard.press("KeyQ");
  await bia.waitForFunction(() => !(window as any).__hud.get().chess, null, { timeout: 10_000 });
  await bia.close();
  // Vortex: Ana alone, a new game, Vortex asked to play
  if (process.env.VORTEX === "1") {
    await ana.bringToFront();
    await ana.evaluate(() => (window as any).__yutopia.chess.newGame());
    await ana.waitForTimeout(800);
    await ana
      .waitForFunction(() => (window as any).__hud.get().chess?.canVortex, null, { timeout: 15_000 })
      .catch(async (e) => {
        console.log("hud.chess:", JSON.stringify(await chessHud(ana)), "props:", JSON.stringify(await props(ana)));
        throw e;
      });
    await ana.evaluate(() => (window as any).__yutopia.chess.vortex("medium"));
    await ana.waitForFunction(
      () => !!(window as any).__hud.get().chess?.vortex.b || !!(window as any).__hud.get().chess?.vortex.w,
      null,
      {
        timeout: 10_000,
      },
    );
    await shot(ana, "11-vortex-sat", 1500);
    console.log("frames, sat with Vortex, nothing moving:", JSON.stringify(await frames(ana, 4000)));
    // (my move, whichever side Vortex left me: my king's pawn two squares)
    const mine = (await chessHud(ana)).side as "w" | "b";
    await ana.waitForFunction(() => (window as any).__hud.get().chess?.myTurn, null, { timeout: 20_000 });
    const n0 = (await chessHud(ana)).moves.length;
    await ana.evaluate(
      (sq) => {
        (window as any).__yutopia.chess.cursor = sq;
      },
      mine === "w" ? 52 : 12,
    );
    await key(ana, "KeyE");
    await ana.evaluate(
      (sq) => {
        (window as any).__yutopia.chess.cursor = sq;
      },
      mine === "w" ? 36 : 28,
    );
    await key(ana, "KeyE");
    console.log("frames, my move and his playing out:", JSON.stringify(await frames(ana, 6000)));
    await ana.waitForFunction((n) => (window as any).__hud.get().chess?.moves.length >= n + 2, n0, { timeout: 25_000 });
    await shot(ana, "12-vortex-answered", 2400);
  }
  // up from the chair: the strip gone, the side given back
  await ana.keyboard.press("KeyQ");
  await ana.waitForFunction(() => !(window as any).__hud.get().chess, null, { timeout: 10_000 });
  console.log("stood up; white:", (await props(ana))?.w ?? "(free)");
} finally {
  await ana.evaluate((id) => (window as any).__yutopia.room.send("obj:remove", { id }), ID).catch(() => {});
  await ana.waitForTimeout(500);
  await browser.close();
}
