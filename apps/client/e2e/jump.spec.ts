/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { ANA, BIA, enter, test, token, useWorld } from "./helpers";

// Jumping (shared/jump.ts): Space hops, Space while running flips. The server
// takes it and everyone sees it; the body leaves the floor. With
// YUTOPIA_SHOTS=<dir> it also shoots the jumps held moment by moment. People are drawn from
// their models only with a GPU: Metal on macOS.
const dir = process.env.YUTOPIA_SHOTS;
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

test("Space jumps: a hop, a flip on the run, seen by others, off the floor", async ({ page, browser }) => {
  test.setTimeout(200_000);
  const tok = await token(ANA);
  const lab = await useWorld("lab");
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, tok, lab);
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  const me = await page.evaluate(() => (window as any).__yutopia.room.sessionId);

  // Bia, in the same room, sees it
  const ctx = await browser.newContext();
  const bia = await ctx.newPage();
  await enter(bia, await token(BIA), lab);

  // a hop: the server takes it, and my body in the 3D view goes up (tiles) and comes down
  const highest = page.evaluate(
    (sid) =>
      new Promise<number>((done) => {
        let max = 0;
        const t0 = performance.now();
        const step = () => {
          const v = (window as any).__yutopia.tp.people3.get(sid);
          max = Math.max(max, v?.root.position.y ?? 0);
          if (performance.now() - t0 < 1400) requestAnimationFrame(step);
          else done(max);
        };
        requestAnimationFrame(step);
      }),
    me,
  );
  await page.keyboard.press(" ");
  expect(await highest).toBeGreaterThan(0.25);
  await expect
    .poll(() => bia.evaluate((sid) => (window as any).__yutopia.room.state.players.get(sid)?.jump, me))
    .toBe("hop");
  // and back on the floor after
  await page.waitForTimeout(400);
  expect(await page.evaluate((sid) => (window as any).__yutopia.model.avatars.get(sid).jump ?? "", me)).toBe("");
  await ctx.close();

  // running (Shift + a direction) it's a flip
  const at0 = await page.evaluate((sid) => (window as any).__yutopia.room.state.players.get(sid).jumpAt, me);
  await page.keyboard.down("Shift");
  await page.keyboard.down("s");
  await page.waitForTimeout(250);
  await page.keyboard.press(" ");
  await page.waitForTimeout(150);
  await page.keyboard.up("s");
  await page.keyboard.up("Shift");
  await expect
    .poll(() => page.evaluate((sid) => (window as any).__yutopia.room.state.players.get(sid).jumpAt, me))
    .toBeGreaterThan(at0);
  const after = await page.evaluate((sid) => {
    const p = (window as any).__yutopia.room.state.players.get(sid);
    return { jump: p.jump, at: p.jumpAt };
  }, me);
  expect(after.jump).toBe("flip");
  expect(after.at).toBeGreaterThan(at0);
  await page.waitForTimeout(1200);

  if (dir) {
    // held moment by moment (the review hook)
    const hold = async (kind: "hop" | "flip", t: number, name: string) => {
      await page.evaluate(
        ([k, tt]) => {
          (window as any).__yutopia.jumpHold = { kind: k, t: tt };
        },
        [kind, t] as const,
      );
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${dir}/${name}.png` });
    };
    // somewhere clear: open floor all round, away from Vortex and anyone else
    const spot = await page.evaluate(() => {
      const w = (window as any).__yutopia;
      const others: { x: number; y: number }[] = [];
      w.room.state.npcs.forEach((n: any) => {
        others.push({ x: n.x, y: n.y });
      });
      w.room.state.players.forEach((p: any, sid: string) => {
        if (sid !== w.room.sessionId) others.push({ x: p.x, y: p.y });
      });
      let best = { x: w.me.x, y: w.me.y, score: -1 };
      for (let y = 1; y < w.map.height - 1; y++)
        for (let x = 1; x < w.map.width - 1; x++) {
          let open = true;
          for (let dy = -2; dy <= 2 && open; dy++)
            for (let dx = -2; dx <= 2 && open; dx++) open = w.grid.fits(x + 0.5 + dx, y + 0.5 + dy, 0.3);
          if (!open) continue;
          const far = Math.min(99, ...others.map((o) => Math.hypot(o.x - x, o.y - y)));
          const score = Math.min(far, 8) - Math.hypot(x - w.me.x, y - w.me.y) * 0.05;
          if (score > best.score) best = { x: x + 0.5, y: y + 0.5, score };
        }
      w.teleport({ x: best.x, y: best.y });
      return best;
    });
    console.log("shots at", spot);
    await page.waitForTimeout(2500);
    // (the chase camera, side on)
    await page.evaluate(() => {
      const t = (window as any).__yutopia.tp;
      t.yaw += Math.PI / 2;
      t.pitch = 0.25;
    });
    for (const t of [0.05, 0.2, 0.33, 0.45, 0.62]) await hold("hop", t, `3d-hop-${t}`);
    for (const t of [0.08, 0.2, 0.3, 0.4, 0.5, 0.6, 0.72, 0.9]) await hold("flip", t, `3d-flip-${t}`);
    await page.evaluate(() => {
      (window as any).__yutopia.jumpHold = null;
    });
  }
  // leave her view as it was for the other specs
  await page.evaluate(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p" }));
  });
});

// Up onto things: a desk put down in the Lab, a hop onto it running at it, standing
// on its top (the server and Bia agree), walking off its edge drops you back down.
test("a hop up onto a desk: standing on it, seen up there, dropping off its edge", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const tok = await token(ANA);
  const lab = await useWorld("lab");
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, tok, lab);
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  const me = await page.evaluate(() => (window as any).__yutopia.room.sessionId);
  // somewhere clear (5×5 open, away from others), the desk two tiles along +x
  const spot = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const others: { x: number; y: number }[] = [];
    w.room.state.npcs.forEach((n: any) => {
      others.push({ x: n.x, y: n.y });
    });
    let best = { x: 0, y: 0, score: -1 };
    for (let y = 2; y < w.map.height - 2; y++)
      for (let x = 2; x < w.map.width - 5; x++) {
        let open = true;
        for (let dy = -2; dy <= 2 && open; dy++)
          for (let dx = -2; dx <= 5 && open; dx++) open = w.grid.fits(x + 0.5 + dx, y + 0.5 + dy, 0.3);
        if (!open) continue;
        const far = Math.min(99, ...others.map((o) => Math.hypot(o.x - x, o.y - y)));
        const score = Math.min(far, 6) - Math.hypot(x - w.me.x, y - w.me.y) * 0.02;
        if (score > best.score) best = { x, y, score };
      }
    return best;
  });
  expect(spot.score).toBeGreaterThan(0);
  const desk = `e2e-jump-desk-${Date.now().toString(36)}`;
  const ctx = await browser.newContext();
  try {
    await page.evaluate((s) => (window as any).__yutopia.teleport({ x: s.x + 0.5, y: s.y + 0.5 }), spot);
    await page.evaluate(
      ([id, s]) => (window as any).__yutopia.send("obj:put", { id, kind: "desk", x: s.x + 2, y: s.y, rot: 0 }),
      [desk, spot] as const,
    );
    await expect.poll(() => page.evaluate((id) => !!(window as any).__yutopia.model.getObject(id), desk)).toBe(true);
    await page.waitForTimeout(1200);
    const top = 25 / 39.19;
    // (the camera looking north-west: D + S go along +x, A + W back)
    await page.evaluate(() => {
      const t = (window as any).__yutopia.tp;
      t.yaw = -Math.PI * 0.75;
      t.dragged = 1e12;
    });

    // run at it (D + S: along +x) and hop — a few steps' run-up first: the body takes a moment
    // to get going (docs/plan/29-the-move.md M2)
    await page.keyboard.down("d");
    await page.keyboard.down("s");
    await page.waitForTimeout(160);
    await page.keyboard.press(" ");
    await page.waitForTimeout(480);
    await page.keyboard.up("d");
    await page.keyboard.up("s");
    await page.waitForTimeout(500);
    const up = await page.evaluate((sid) => {
      const w = (window as any).__yutopia;
      const v = w.model.avatars.get(sid);
      return { x: w.me.x, z: v.z, ground: v.ground, server: w.room.state.players.get(sid).z };
    }, me);
    expect(up.x).toBeGreaterThan(spot.x + 2);
    expect(up.x).toBeLessThan(spot.x + 4);
    expect(Math.abs(up.z - top)).toBeLessThan(0.01);
    expect(Math.abs(up.ground - top)).toBeLessThan(0.01);
    await expect
      .poll(() => page.evaluate((sid) => (window as any).__yutopia.room.state.players.get(sid).z, me))
      .toBeGreaterThan(top - 0.01);

    // Bia sees me up there
    const bia = await ctx.newPage();
    await enter(bia, await token(BIA), lab);
    await expect
      .poll(() => bia.evaluate((sid) => (window as any).__yutopia.room.state.players.get(sid)?.z ?? 0, me))
      .toBeGreaterThan(top - 0.01);

    if (dir) {
      await page.evaluate(() => {
        const t = (window as any).__yutopia.tp;
        t.yaw += Math.PI / 2;
        t.pitch = 0.2;
      });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${dir}/on-desk-3d.png` });
      await page.evaluate(() => {
        (window as any).__yutopia.tp.yaw = -Math.PI * 0.75;
      });
      await page.waitForTimeout(800);
    }

    // walk off its edge (back along −x): down on the floor again
    await page.keyboard.down("a");
    await page.keyboard.down("w");
    await page.waitForTimeout(700);
    await page.keyboard.up("a");
    await page.keyboard.up("w");
    await page.waitForTimeout(600);
    const down = await page.evaluate((sid) => {
      const w = (window as any).__yutopia;
      return { x: w.me.x, z: w.model.avatars.get(sid).z ?? 0 };
    }, me);
    expect(down.x).toBeLessThan(spot.x + 2);
    expect(down.z).toBe(0);
  } finally {
    await page.evaluate((id) => (window as any).__yutopia.send("obj:remove", { id }), desk);
    await ctx.close();
  }
});
