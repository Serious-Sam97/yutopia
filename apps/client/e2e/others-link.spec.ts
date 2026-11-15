/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld } from "./helpers";

// Someone else over a link that comes in bursts (docs/plan/89-the-weight.md phase 7, F3b): Ana runs back and forth;
// what reaches Bia is held up now and then (8% of the messages 120–250 ms, those after them with them, as a
// websocket's are), and Bia watches her — first as it was (110 ms behind, always: Smooth.fixed), then as it is now
// (as far behind as the link has needed lately). Counted: the frames where Ana, running, is drawn stood still or
// leaping ahead. A/B in the same page, the same link.
// 3D in two browsers: run it with the GPU (YUTOPIA_GPU=1) or it crawls.

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const prefs = (page: Page, view: "1p" | "3p") =>
  page.addInitScript((v) => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: v, reducedMotion: false }));
  }, view);

test("others over a bursty link: drawn smooth, a little further behind", async ({ page, browser }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(300_000);
  const lab = await useWorld("lab");
  await prefs(page, "1p");
  await enter(page, await token(ANA), lab);
  const ana = await page.evaluate(() => (window as any).__yutopia.room.sessionId as string);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bia = await ctx.newPage();
  await prefs(bia, "3p");
  // Bia's link: the world-server's messages held up in bursts, in order (a seeded pattern: the same both halves)
  await bia.addInitScript(() => {
    const w = window as any;
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const WS = window.WebSocket;
    w.WebSocket = new Proxy(WS, {
      construct(T, args: [string | URL, (string | string[])?]) {
        const ws = new T(...args);
        if (!/:2567/.test(String(args[0]))) return ws;
        let handler: ((e: MessageEvent) => void) | null = null;
        let free = 0;
        Object.defineProperty(ws, "onmessage", {
          get: () => handler,
          set: (h) => {
            handler = h;
          },
        });
        ws.addEventListener("message", (e) => {
          const now = performance.now();
          const hold = w.__jitter ? (rnd() < 0.08 ? 120 + rnd() * 130 : rnd() * 25) : 0;
          free = Math.max(free, now + hold);
          const d = free - now;
          if (d <= 0) handler?.call(ws, e);
          else setTimeout(() => handler?.call(ws, e), d);
        });
        return ws;
      },
    });
  });
  await enter(bia, await token(BIA), lab);
  const anaUid = await page.evaluate(() => (window as any).__yutopia.myUid() as number);
  await bia.evaluate((uid) => (window as any).__yutopia.teleport({ userId: uid }), anaUid);
  for (const p of [page, bia])
    await p.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
      timeout: 60_000,
    });
  await expect
    .poll(() => bia.evaluate((sid) => !!(window as any).__yutopia.tp.people3.get(sid), ana), { timeout: 30_000 })
    .toBe(true);
  await page.waitForTimeout(1500);

  // Ana runs ahead and back, 2 s each way, `legs` times; Bia logs her as drawn every frame from `from` ms on
  const leg = async (legs: number) => {
    for (let i = 0; i < legs; i++) {
      const k = i % 2 ? "s" : "w";
      await page.keyboard.down(k);
      await page.waitForTimeout(2000);
      await page.keyboard.up(k);
      await page.waitForTimeout(300);
    }
  };
  const half = async (fixed: boolean, jitter = true) => {
    await bia.evaluate(
      ([sid, f, j]) => {
        const w = window as any;
        w.__jitter = j;
        w.__yutopia.remotes.get(sid).smooth.fixed = f;
      },
      [ana, fixed, jitter] as const,
    );
    // (a while on the link first: what it's had to be lately learnt)
    await leg(2);
    await bia.evaluate((sid) => {
      const w = window as any;
      const log: number[][] = [];
      w.__seen = log;
      w.__logging = true;
      const t0 = performance.now();
      // (at the frame's own time: what was drawn in it)
      const f = (ft: number) => {
        const p = w.__yutopia.tp.people3.get(sid);
        if (p) log.push([ft - t0, p.root.position.x, p.root.position.z]);
        if (w.__logging) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }, ana);
    await leg(6);
    const seen = (await bia.evaluate(() => {
      (window as any).__logging = false;
      return (window as any).__seen;
    })) as number[][];
    const delay = await bia.evaluate((sid) => (window as any).__yutopia.remotes.get(sid).smooth.delay, ana);
    // running frames: drawn speed over 3 m/s on either side of them; a stall: under 1 m/s between running ones,
    // a leap: over twice the median
    const v: number[] = [];
    for (let i = 1; i < seen.length; i++) {
      const dt = (seen[i][0] - seen[i - 1][0]) / 1000;
      v.push(dt > 0 ? Math.hypot(seen[i][1] - seen[i - 1][1], seen[i][2] - seen[i - 1][2]) / dt : 0);
    }
    const run = v.filter((s) => s > 3).sort((a, b) => a - b);
    const med = run[Math.floor(run.length / 2)] ?? 0;
    let frames = 0;
    let stalls = 0;
    let leaps = 0;
    for (let i = 3; i < v.length - 3; i++) {
      // (well inside a leg: running 3 frames either side, by how far she's gone over them)
      const span = (a: number, b: number) =>
        Math.hypot(seen[b][1] - seen[a][1], seen[b][2] - seen[a][2]) / ((seen[b][0] - seen[a][0]) / 1000);
      if (span(i - 3, i) < 3 || span(i + 1, i + 4) < 3) continue;
      frames++;
      if (v[i] < 1) stalls++;
      else if (v[i] > med * 2) leaps++;
    }
    const gaps = seen
      .slice(1)
      .map((s, i) => s[0] - seen[i][0])
      .sort((a, b) => a - b);
    const p99 = Math.round(gaps[Math.floor(gaps.length * 0.99)] ?? 0);
    return { fixed, jitter, frames, stalls, leaps, median: +med.toFixed(2), delay: Math.round(delay), frameP99: p99 };
  };
  const clean = await half(false, false);
  const before = await half(true);
  const after = await half(false);
  // the NPCs and pets: on the server's clock (WorldState.tickAt), followed the same way
  const room = await bia.evaluate(() => {
    const w = (window as any).__yutopia;
    return { tickAt: w.room.state.tickAt, off: w.roomSmooth.off, delay: w.roomSmooth.delay };
  });
  console.log(JSON.stringify({ clean, before, after, room }));
  expect(room.tickAt).toBeGreaterThan(0);
  expect(Number.isFinite(room.off)).toBe(true);
  expect(after.frames).toBeGreaterThan(100);
  expect(after.delay).toBeGreaterThan(110);
  expect(after.delay).toBeLessThanOrEqual(250);
  expect(after.stalls + after.leaps).toBeLessThan(before.stalls + before.leaps);
  await ctx.close();
});
