/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import net from "node:net";
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld, walkTo } from "./helpers";

// Two people at the ping-pong table, one of them far away: Bia's world socket
// (and her clock sync) carries PONG_LAG ms each way (default 150). Both swing
// with the test bot (window.__pongBot: the racket goes behind where the ball
// will be and through it — the hit itself is the real path: contact here,
// `pong:hit`, the server's referee). Measured on both sides: hits sent / taken
// by the server / dropped, frames where the drawn ball jumped, how far the
// drawing overshot a late hit, and rally lengths. Prints a summary line.
const LAG = Number(process.env.PONG_LAG ?? 150);
const SECONDS = Number(process.env.PONG_SECONDS ?? 50);

test(`ping-pong: two people, one ${LAG} ms away — hits taken, no jumps, real rallies`, async ({ browser }) => {
  test.setTimeout(300_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  // small and Low: two WebGL pages share one software renderer here
  const ctx = { viewport: { width: 760, height: 520 } };
  const anaCtx = await browser.newContext(ctx);
  const biaCtx = await browser.newContext(ctx);
  for (const x of [anaCtx, biaCtx])
    await x.addInitScript(() => {
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", maxFps: 0, view: "iso" }));
      // (two 3D views at once are too slow to time hits in here: stay in iso)
      (window as any).__pongStayIso = true;
    });
  // Bia far away: everything she says to the world server and hears back goes
  // through a relay here that holds each chunk LAG ms (her socket and her
  // clock pings: the bytes in order, nothing in the page touched but the port)
  const relay = net.createServer((c) => {
    const up = net.connect(2567, "127.0.0.1");
    const hold = (to: net.Socket) => (d: Buffer) =>
      setTimeout(() => {
        if (!to.destroyed) to.write(d);
      }, LAG);
    c.on("data", hold(up));
    up.on("data", hold(c));
    const end = () => {
      setTimeout(() => {
        c.destroy();
        up.destroy();
      }, LAG);
    };
    c.on("close", end);
    up.on("close", end);
    c.on("error", end);
    up.on("error", end);
  });
  const port: number = await new Promise((ok) =>
    relay.listen(0, "127.0.0.1", () => ok((relay.address() as net.AddressInfo).port)),
  );
  await biaCtx.addInitScript((p: number) => {
    const to = (u: string) => u.replace(/(localhost|127\.0\.0\.1):2567/, `127.0.0.1:${p}`);
    const WS = window.WebSocket;
    (window as any).WebSocket = new Proxy(WS, {
      construct: (T, [url, protos]) => new T(to(String(url)), protos),
    });
    const f = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
      f(typeof input === "string" ? to(input) : input instanceof URL ? to(input.href) : input, init);
  }, port);
  const ana = await anaCtx.newPage();
  const bia = await biaCtx.newPage();
  if (process.env.PONG_TRACE)
    for (const [n, p] of [
      ["ana", ana],
      ["bia", bia],
    ] as const)
      p.on("console", (m) => {
        if (m.type() === "error") console.log(`${n} console: ${m.text().slice(0, 400)}`);
      });
  const id = `e2e-pong2-${Date.now().toString(36)}`;
  const open = async (p: Page, end: { x: number; y: number }) => {
    await walkTo(p, end.x, end.y, 25_000);
    await p.waitForTimeout(400);
    await p.evaluate((i) => (window as any).__yutopia.activateObject(i, true), id);
    await expect(p.getByRole("dialog", { name: "Ping-pong" })).toBeVisible();
    await p.waitForFunction(() => !!(window as any).__yutopia.tables?.pong, null, { timeout: 15_000 });
  };
  try {
    const s = await useWorld("lab");
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    // tables an earlier, interrupted run left behind
    await ana.evaluate(() => {
      const w = (window as any).__yutopia;
      w.room.state.objects.forEach((o: any, k: string) => {
        if (k.startsWith("e2e-pool") || k.startsWith("e2e-pong")) w.send("obj:remove", { id: k });
      });
    });
    await ana.waitForTimeout(500);
    const sp = await ana.evaluate(() => (window as any).__yutopia.map.spawn);
    let at: { x: number; y: number } | null = null;
    for (const [dx, dy] of [
      [-1, -5],
      [2, -5],
      [-6, -4],
      [3, 2],
      [-6, 2],
      [-2, 3],
      [2, -8],
    ]) {
      const p = { x: Math.floor(sp.x) + dx, y: Math.floor(sp.y) + dy };
      await ana.evaluate(
        ([i, q]) =>
          (window as any).__yutopia.send("obj:put", { id: i, kind: "pingpong_table", x: q.x, y: q.y, rot: 0 }),
        [id, p] as const,
      );
      await ana.waitForTimeout(600);
      if (await ana.evaluate((i) => !!(window as any).__yutopia.room.state.objects.get(i), id)) {
        at = p;
        break;
      }
    }
    expect(at, "room for the table").not.toBeNull();
    const T = at as { x: number; y: number };
    await expect.poll(() => bia.evaluate((i) => !!(window as any).__yutopia.engine.getObject(i), id)).toBe(true);
    await open(ana, { x: T.x - 0.7, y: T.y + 1 });
    await open(bia, { x: T.x + 4.7, y: T.y + 1 });
    await ana.getByRole("button", { name: "Take this end" }).first().click();
    await expect.poll(() => bia.getByRole("button", { name: "Take this end" }).count()).toBe(1);
    await bia.getByRole("button", { name: "Take this end" }).click();
    await expect
      .poll(() =>
        ana.evaluate((i) => {
          const t = (window as any).__yutopia.room.state.pong.get(i);
          return t ? t.seats.size : 0;
        }, id),
      )
      .toBe(2);
    await ana.getByRole("button", { name: "Start match" }).click();
    await expect
      .poll(() => ana.evaluate((i) => (window as any).__yutopia.room.state.pong.get(i)?.phase, id))
      .toBe("play");

    // both swing, both count
    for (const p of [ana, bia])
      await p.evaluate(() =>
        Object.assign(window as any, {
          __pongBot: true,
          __pongStats: {},
          __pongJumps: [],
          __pongDrops: [],
          __pongTakes: [],
        }),
      );
    if (process.env.PONG_TRACE)
      for (const p of [ana, bia]) await p.evaluate(() => Object.assign(window as any, { __pongTrace: [] }));
    // how smoothly each page runs here (headless WebGL is slow: the numbers say so)
    const fps = async (pg: Page) =>
      pg.evaluate(async () => {
        const p = (window as any).__yutopia.tables.pong;
        const orig = p.frame.bind(p);
        let n = 0;
        p.frame = (...a: unknown[]) => {
          n++;
          return orig(...a);
        };
        await new Promise((r) => setTimeout(r, 2000));
        p.frame = orig;
        return n / 2;
      });
    const rates = [await fps(ana), await fps(bia)];
    // rallies, from the server's state on Ana's side: hits per point
    await ana.evaluate((i) => {
      const w = window as any;
      w.__rallies = [];
      let seq = -1;
      let point = 0;
      let hits = 0;
      setInterval(() => {
        const t = w.__yutopia.room.state.pong.get(i);
        if (!t) return;
        if (t.pointNo !== point) {
          w.__rallies.push(hits);
          hits = 0;
          point = t.pointNo;
        }
        if (t.seq !== seq) {
          seq = t.seq;
          const f = t.flight ? JSON.parse(t.flight) : null;
          if (f && (f.kind === "hit" || f.kind === "serve")) hits++;
          w.__rallyNow = hits;
        }
      }, 10);
    }, id);
    const t0 = Date.now();
    while (Date.now() - t0 < SECONDS * 1000) {
      await ana.waitForTimeout(2000);
      const phase = await ana.evaluate((i) => (window as any).__yutopia.room.state.pong.get(i)?.phase, id);
      if (phase !== "play") break;
    }
    const sa = await ana.evaluate(() => (window as any).__pongStats);
    const sb = await bia.evaluate(() => (window as any).__pongStats);
    // (the rally still going counts too)
    const rallies: number[] = await ana.evaluate(() => [...(window as any).__rallies, (window as any).__rallyNow ?? 0]);
    const score = await ana.evaluate(
      (i) => JSON.parse((window as any).__yutopia.room.state.pong.get(i)?.score ?? "{}"),
      id,
    );
    const clock = await bia.evaluate(() => (window as any).__yutopia.tables?.pong && performance.now());
    void clock;
    console.log(
      `[pong-lag ${LAG}ms] fps ${rates.join("/")} · ana ${JSON.stringify(sa)} · bia ${JSON.stringify(sb)} · rallies ${JSON.stringify(rallies)} · score ${JSON.stringify(score.points)}`,
    );
    if (process.env.PONG_TRACE)
      for (const [n, pg] of [
        ["ana", ana],
        ["bia", bia],
      ] as const) {
        const d = await pg.evaluate((i) => {
          const w = window as any;
          const p = w.__yutopia.tables.pong;
          const v = p.views.get(i);
          const t = w.__yutopia.room.state.pong.get(i);
          return {
            trace: w.__pongTrace.slice(-25),
            canServe: p.canServe(i),
            rally: t.rally,
            flight: t.flight.slice(0, 80),
            phase: t.phase,
            seq: t.seq,
            pointNo: t.pointNo,
            score: t.score,
            wait: t.wait - Date.now(),
            local: v.local,
          };
        }, id);
        console.log(n, JSON.stringify(d).slice(0, 3000));
      }
    if (process.env.PONG_DETAIL)
      for (const [n, pg] of [
        ["ana", ana],
        ["bia", bia],
      ] as const)
        console.log(
          n,
          JSON.stringify(
            await pg.evaluate(() => ({
              jumps: (window as any).__pongJumps.slice(0, 8),
              drops: (window as any).__pongDrops,
              takes: (window as any).__pongTakes.slice(0, 14),
            })),
          ),
        );
    const ok = (s: any) => (s.taken ?? 0) / Math.max(1, s.sent ?? 0);
    expect(sa.sent ?? 0, "Ana hit the ball").toBeGreaterThan(5);
    expect(sb.sent ?? 0, "Bia hit the ball").toBeGreaterThan(5);
    expect(ok(sa), "Ana's hits taken").toBeGreaterThanOrEqual(0.9);
    expect(ok(sb), "Bia's hits taken").toBeGreaterThanOrEqual(0.9);
    expect(sa.jumps ?? 0, "the ball never jumped on Ana's screen").toBe(0);
    expect(sb.jumps ?? 0, "the ball never jumped on Bia's screen").toBe(0);
    expect(Math.max(0, ...rallies), "a real rally").toBeGreaterThanOrEqual(4);
  } finally {
    for (const p of [ana, bia])
      await p.evaluate(() => Object.assign(window as any, { __pongBot: false })).catch(() => {});
    await ana.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id).catch(() => {});
    await ana.waitForTimeout(400);
    relay.close();
  }
});
