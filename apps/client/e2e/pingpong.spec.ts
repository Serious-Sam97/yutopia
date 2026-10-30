/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld, walkTo } from "./helpers";

// Ping-pong against Vortex: walk up to the −x end, open the table, take the
// end, put Vortex at the other one, start. Ana serves with the mouse — click
// to toss, swing through the ball as it falls — and the server takes the hit;
// Vortex plays it back; the points go on the flip cards. Bia sees the rally
// from across the room. The 3D view stands behind Ana's end. In the Lab; the
// table is removed after. YUTOPIA_SHOTS=<dir> keeps pictures.
const SHOTS = process.env.YUTOPIA_SHOTS;
// Hits land on frames: this one needs the GPU, not software GL (headless
// Chromium draws WebGL on the CPU by default, two 3D pages at ~5 fps, and a
// frame that stalls past the server's 450 ms refuses the hit). Metal on macOS;
// elsewhere the flags fall back to whatever the machine has.
test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    ],
  },
});
const pong = (page: Page, id: string) =>
  page.evaluate((i) => {
    const t = (window as any).__yutopia.room.state.pong.get(i);
    if (!t) return null;
    const seats: Record<string, string> = {};
    t.seats.forEach((s: any, k: string) => {
      seats[k] = s.vortex ? `vortex:${s.vortex}` : s.name;
    });
    const f = t.flight ? JSON.parse(t.flight) : null;
    const score = t.score ? JSON.parse(t.score) : null;
    return {
      phase: t.phase as string,
      seq: t.seq as number,
      seats,
      kind: f?.kind as string,
      by: f?.by as number,
      points: score?.points as number[],
      pointNo: t.pointNo as number,
    };
  }, id);

test("ping-pong: serve to Vortex with the mouse, he plays it back — seen from across the room", async ({ browser }) => {
  test.setTimeout(300_000);
  const [ta, tb] = [await token(ANA), await token(BIA)];
  const ctx = { viewport: { width: 1280, height: 800 } };
  const ana = await (await browser.newContext(ctx)).newPage();
  const bia = await (await browser.newContext(ctx)).newPage();
  const id = `e2e-pong-${Date.now().toString(36)}`;
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: an e2e helper, not a React hook
    const s = await useWorld("lab");
    await enter(ana, ta, s);
    await enter(bia, tb, s);
    // tables an earlier, interrupted run left behind
    await ana.evaluate(() => {
      const w = (window as any).__yutopia;
      w.room.state.objects.forEach((_o: any, k: string) => {
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
    // to the −x end (seat 0) and open it
    await walkTo(ana, T.x - 0.7, T.y + 1, 25_000);
    await ana.waitForTimeout(400);
    const prompt = await ana.evaluate(() => (window as any).__hud.get().prompt?.kind);
    if (prompt === "pong") await ana.keyboard.press("e");
    else await ana.evaluate((i) => (window as any).__yutopia.activateObject(i, true), id);
    await expect(ana.getByRole("dialog", { name: "Ping-pong" })).toBeVisible();
    await ana.waitForFunction(() => !!(window as any).__yutopia.tables?.pong, null, { timeout: 15_000 });
    await ana.getByRole("button", { name: "Take this end" }).first().click();
    await expect.poll(async () => (await pong(bia, id))?.seats["0"]).toBe("Ana Demo");
    await ana.getByRole("button", { name: "Medium" }).click();
    await ana.getByRole("button", { name: "Play Vortex" }).click();
    await expect.poll(async () => (await pong(bia, id))?.seats["1"]).toBe("vortex:medium");
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pong-lobby.png` });
    await ana.getByRole("button", { name: "Start match" }).click();
    await expect.poll(async () => (await pong(bia, id))?.phase).toBe("play");
    await ana.waitForTimeout(1500);

    // table metres → the screen, at a height over the table (m)
    const screen = (mx: number, my: number, mz: number) =>
      ana.evaluate(
        ([o, x, y, z]) => {
          const w = (window as any).__yutopia;
          const r = w.hostRect();
          const p = w.model.worldToClient(o.x + 2 + x * 1.26, o.y + 1 - y * 1.26, 24 + z * 1.26 * 39.19);
          return { x: r.left + p.x, y: r.top + p.y };
        },
        [T, mx, my, mz] as const,
      );
    const HL = 1.37;
    // the racket behind where the toss goes up, then click: the toss
    const behind = await screen(-HL - 0.45, 0, 0.15);
    await ana.mouse.move(behind.x, behind.y, { steps: 4 });
    await ana.waitForTimeout(300);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pong-ready.png` });
    // every flight the table goes through, recorded in the page (they can be short)
    await bia.evaluate((i) => {
      const w = window as any;
      w.__pongSeen = [];
      let last = -1;
      setInterval(() => {
        const t = w.__yutopia.room.state.pong.get(i);
        if (t && t.seq !== last) {
          last = t.seq;
          const f = t.flight ? JSON.parse(t.flight) : null;
          w.__pongSeen.push(f ? `${f.kind}:${f.by}` : "none");
        }
      }, 15);
    }, id);
    const seen = () => bia.evaluate(() => (window as any).__pongSeen as string[]);
    let served = false;
    for (let attempt = 0; attempt < 6 && !served; attempt++) {
      const before = (await pong(bia, id))?.seq ?? 0;
      const canServe = await ana.evaluate((i) => (window as any).__yutopia.tables.pong.info(i)?.canServe, id);
      if (!canServe) {
        await ana.waitForTimeout(800);
        continue;
      }
      if (process.env.PONG_TRACE)
        await ana.evaluate(() => {
          (window as any).__pongTrace = [];
        });
      if (process.env.PONG_TRACE)
        await ana.evaluate(() => Object.assign(window as any, { __pongStats: {}, __pongDrops: [] }));
      // (anywhere over the table serves; the racket stays where it is across)
      const b0 = await screen(-HL * 0.4, 0, 0.15);
      await ana.mouse.move(b0.x, b0.y);
      await ana.mouse.down();
      await ana.mouse.up();
      // as it comes down (~0.3 s after the toss): swing through it, fast
      await ana.waitForTimeout(240);
      const through = await screen(-HL + 0.35, 0.02, 0.15);
      await ana.mouse.move(through.x, through.y, { steps: 5 });
      await ana.waitForTimeout(700);
      served = (await seen()).includes("serve:0");
      if (process.env.PONG_TRACE)
        console.log(
          JSON.stringify(
            await ana.evaluate((i) => {
              const w = window as any;
              const p = w.__yutopia.tables.pong;
              return {
                stats: w.__pongStats,
                drops: w.__pongDrops,
                plan: p.plan,
                me: p.me,
                seen: w.__seenA,
                info: p.info(i),
              };
            }, id),
          ).slice(0, 1500),
          JSON.stringify(await seen()),
        );
      if (!served && process.env.PONG_TRACE)
        console.log(JSON.stringify(await ana.evaluate(() => (window as any).__pongTrace?.slice(-40))));
      void before;
      if (!served) {
        await ana.mouse.move(behind.x, behind.y, { steps: 3 });
        await ana.waitForTimeout(2500);
      }
    }
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pong-serve.png` });
    expect(served, "Ana's serve was taken").toBe(true);
    // Vortex plays it back, or it's a point either way: the rally goes on, Bia sees it
    await expect
      .poll(
        async () => {
          const p = await pong(bia, id);
          return (p?.by === 1 ? 1 : 0) + (p?.pointNo ?? 0);
        },
        { timeout: 8000 },
      )
      .toBeGreaterThan(0);
    await ana.waitForTimeout(200);
    if (SHOTS) {
      await ana.screenshot({ path: `${SHOTS}/pong-rally.png` });
      await bia.screenshot({ path: `${SHOTS}/pong-watching.png` });
    }
    // Ana plays it back too: to the marker (the bot moves her racket there, the
    // hit itself is the game's own) — her returns are taken
    await ana.evaluate(() =>
      Object.assign(window as any, { __pongBot: true, __pongStats: {}, __pongDrops: [], __pongJumps: [] }),
    );
    await ana.waitForTimeout(6000);
    if (SHOTS)
      for (let i = 0; i < 6; i++) {
        await ana.screenshot({ path: `${SHOTS}/pong-play-${i}.png` });
        await ana.waitForTimeout(350);
      }
    await ana.waitForTimeout(4000);
    if (process.env.PONG_TRACE)
      for (let i = 0; i < 8; i++) {
        console.log(
          JSON.stringify(
            await ana.evaluate(() => {
              const tp = (window as any).__yutopia.tp;
              const t3 = tp?.tables3;
              const balls = [...(t3?.pongBalls?.values() ?? [])].map((m: any) => ({
                p: [m.position.x, m.position.y, m.position.z].map((n: number) => +n.toFixed(2)),
                vis: m.visible,
                s: m.scale.x,
                inScene: !!m.parent?.parent,
              }));
              const cam = tp.camera.position;
              const m: any = [...(t3?.pongBalls?.values() ?? [])][0];
              const scr = m ? tp.project(m.position.x, m.position.z, m.position.y) : null;
              const mat = m?.material;
              return {
                balls,
                scr,
                mat: mat && {
                  type: mat.type,
                  color: mat.color?.getHexString(),
                  op: mat.opacity,
                  vis: mat.visible,
                  transparent: mat.transparent,
                },
                cam: [cam.x, cam.y, cam.z].map((n: number) => +n.toFixed(2)),
                root: t3?.root.visible,
              };
            }),
          ),
        );
        if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pong-ball-${i}.png` });
        await ana.waitForTimeout(120);
      }
    // (the last hit gets a moment to be answered)
    await ana.evaluate(() => Object.assign(window as any, { __pongBot: false }));
    await ana.waitForTimeout(1500);
    const st = await ana.evaluate(() => (window as any).__pongStats);
    if (process.env.PONG_TRACE)
      console.log(
        JSON.stringify({
          st,
          drops: await ana.evaluate(() => (window as any).__pongDrops),
          jumps: await ana.evaluate(() => (window as any).__pongJumps),
        }).slice(0, 2500),
      );
    expect(st.sent ?? 0, "Ana hit back").toBeGreaterThan(2);
    expect((st.taken ?? 0) / Math.max(1, st.sent ?? 0)).toBeGreaterThanOrEqual(0.9);
    await ana.evaluate(() => Object.assign(window as any, { __pongBot: false }));
    // a few points go by (Ana serves when it's hers): the score moves
    const until = Date.now() + 45_000;
    while (((await pong(bia, id))?.pointNo ?? 0) < 3 && Date.now() < until) {
      const canServe = await ana.evaluate((i) => (window as any).__yutopia.tables.pong.info(i)?.canServe, id);
      if (canServe) {
        const b0 = await screen(-HL * 0.4, 0, 0.15);
        await ana.mouse.move(b0.x, b0.y);
        await ana.mouse.down();
        await ana.mouse.up();
        await ana.waitForTimeout(240);
        const through = await screen(-HL + 0.35, 0.02, 0.15);
        await ana.mouse.move(through.x, through.y, { steps: 5 });
      }
      await ana.waitForTimeout(600);
    }
    expect((await pong(bia, id))?.pointNo ?? 0).toBeGreaterThanOrEqual(3);
    expect(
      (await seen()).some((s) => s === "hit:1" || s === "serve:1"),
      "Vortex hit the ball",
    ).toBe(true);
    // the match in the 3D view, behind Ana's end; the bot plays on a while
    expect(await ana.evaluate(() => !!(window as any).__yutopia.tp), "the match in 3D").toBe(true);
    if (SHOTS) await ana.screenshot({ path: `${SHOTS}/pong-3d.png` });
    await ana.evaluate(() => Object.assign(window as any, { __pongBot: true }));
    await ana.waitForTimeout(3000);
    if (SHOTS)
      for (let i = 0; i < 3; i++) {
        await ana.screenshot({ path: `${SHOTS}/pong-bot-${i}.png` });
        await ana.waitForTimeout(400);
      }
    await ana.evaluate(() => Object.assign(window as any, { __pongBot: false }));
    await ana.getByRole("button", { name: "Give up" }).click();
    await expect.poll(async () => (await pong(bia, id))?.phase).toBe("done");
    await ana.keyboard.press("Escape");
  } finally {
    await ana.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id).catch(() => {});
    await ana.waitForTimeout(400);
  }
});
