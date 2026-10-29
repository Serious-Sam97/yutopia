/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, holdCamera, test, token } from "./helpers";

// Lost, seen by someone else (docs/plan/51-the-pet.md, phase 5), two browsers: Ana leaves Rex staying in
// the lot with Bia beside him and drives off from the far end of the world; he's lost. Bia sees him
// wander off (the "?"-less tag "Rex · …" is his own, still Ana's), and Ana's told Bia saw him. Ana goes
// back and finds him. The dog adopted here is let go at the end.
// On the machine's GPU (as car.spec): YUTOPIA_GPU=1; YUTOPIA_SHOTS=<dir> saves its pictures.
const dir = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const petOf = (page: Page, id: string) =>
  page.evaluate((pid) => {
    const p = (window as any).__yutopia.room.state.pets.get(pid);
    return p ? { mode: p.mode as string, x: p.x as number, y: p.y as number, sid: p.sid as string } : null;
  }, id);
const me = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    const p = c.room.state.players.get(c.room.sessionId);
    return { x: p.x as number, y: p.y as number, uid: p.uid as number, busy: p.busy as string };
  });
const send = (page: Page, type: string, msg: unknown) =>
  page.evaluate(([t, m]) => (window as any).__yutopia.send(t, m), [type, msg] as const);
// a command, said twice (a pet may not mind the first time; a second call within a few seconds it always does)
const call = async (page: Page, id: string, cmd: string) => {
  await send(page, "pet:cmd", { id, cmd });
  await page.waitForTimeout(400);
  await send(page, "pet:cmd", { id, cmd });
};
const release = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    c.room.state.pets.forEach((p: any) => {
      if (p.sid === c.room.sessionId) c.send("pet:release", { id: p.id });
    });
  });
// every toast seen since the page began watching (they fade: a sighting's is told once in ten minutes)
const watchToasts = (page: Page) =>
  page.evaluate(() => {
    const w = window as any;
    w.__toasts = [];
    setInterval(() => {
      for (const t of document.querySelectorAll(".toast"))
        if (t.textContent && !w.__toasts.includes(t.textContent)) w.__toasts.push(t.textContent);
    }, 150);
  });
const toasts = (page: Page) => page.evaluate(() => (window as any).__toasts as string[]);

test("Rex lost: Bia sees him wander, Ana's told she saw him, Ana finds him", async ({ browser }) => {
  test.setTimeout(300_000);
  const ana = await (await browser.newContext()).newPage();
  const bia = await (await browser.newContext()).newPage();
  await enter(ana, await token(ANA));
  await enter(bia, await token(BIA));
  await ana.waitForFunction(() => !!(window as any).__yutopia.cars, null, { timeout: 60_000 });
  await watchToasts(ana);
  try {
    await release(ana);
    await send(ana, "pet:adopt", { species: "dog", name: "Rex", look: { breed: "beagle" } });
    await expect
      .poll(() =>
        ana.evaluate(() => {
          const c = (window as any).__yutopia;
          return [...c.room.state.pets.values()].find((x: any) => x.sid === c.room.sessionId)?.id ?? "";
        }),
      )
      .not.toBe("");
    const id = (await ana.evaluate(() => {
      const c = (window as any).__yutopia;
      return [...c.room.state.pets.values()].find((x: any) => x.sid === c.room.sessionId)?.id;
    })) as string;
    // down to the lot, Rex told to stay; Bia comes to her
    const lot = await ana.evaluate(() => {
      const c = (window as any).__yutopia;
      const o = [...c.room.state.objects.values()].find((x: any) => x.kind === "car") as any;
      return { x: o.x - 2, y: o.y + 1 };
    });
    await ana.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), lot);
    await expect.poll(async () => (await petOf(ana, id))?.mode).toBe("follow");
    await ana.waitForTimeout(4000);
    await call(ana, id, "stay");
    await expect.poll(async () => (await petOf(ana, id))?.mode).toBe("stay");
    const anaUid = (await me(ana)).uid;
    await send(bia, "teleport", { to: { userId: anaUid } });
    await expect
      .poll(async () => {
        const [a, b] = [await me(ana), await me(bia)];
        return Math.hypot(a.x - b.x, a.y - b.y);
      })
      .toBeLessThan(4);
    // Ana off to the far end of the world, into a car, and calls him: he's lost
    const r0 = (await petOf(ana, id)) as { x: number; y: number };
    const far = await ana.evaluate((at) => {
      const c = (window as any).__yutopia;
      const out: any[] = [];
      c.room.state.objects.forEach((o: any) => {
        const p = JSON.parse(o.props);
        if (o.kind !== "car" || p.driven || p.ownerId || p.role === "show" || p.retire || p.model === "offroad") return;
        const d = Math.hypot(o.x - at.x, o.y - at.y);
        if (d > 250) out.push({ x: o.x + 1, y: o.y + 1, d });
      });
      out.sort((p, q) => q.d - p.d);
      return out[0];
    }, r0);
    await ana.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), far);
    await ana.waitForFunction(() => /^car/.test((window as any).__hud.get().prompt?.kind ?? ""), null, {
      timeout: 20_000,
    });
    await ana.evaluate(() => (window as any).__yutopia.interact());
    await expect.poll(async () => (await me(ana)).busy, { timeout: 10_000 }).toMatch(/^drive:car:/);
    await call(ana, id, "follow");
    await expect.poll(async () => (await petOf(bia, id))?.mode, { timeout: 40_000 }).toBe("lost");
    // Bia sees him wander off (his tag still Ana's dog's), and Ana's told she saw him
    const seenAt = (await petOf(bia, id)) as { x: number; y: number };
    await expect
      .poll(
        async () => {
          const p = await petOf(bia, id);
          return p ? Math.hypot(p.x - seenAt.x, p.y - seenAt.y) : 0;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(4);
    if (dir) {
      // (her camera on him, where he's got to — he's on the move: aimed again just before the picture)
      for (let i = 0; i < 4; i++) {
        const p = (await petOf(bia, id)) as { x: number; y: number };
        await holdCamera(bia, { at: { x: p.x, y: p.y }, yaw: Math.PI * 0.25, pitch: 0.8, dist: 6 });
        await bia.waitForTimeout(350);
      }
      await bia.screenshot({ path: `${dir}/game-two-bia-sees.png` });
    }
    await expect.poll(() => toasts(ana), { timeout: 15_000 }).toContainEqual(expect.stringMatching(/Bia saw Rex/));
    if (dir) await ana.screenshot({ path: `${dir}/game-two-ana-told.png` });
    // Ana back, out of the car, to him: found
    await send(ana, "car:leave", {});
    await expect.poll(async () => (await me(ana)).busy, { timeout: 10_000 }).toBe("");
    // (he's on the move: to where he is now, again, till she's near enough)
    await expect
      .poll(
        async () => {
          const r1 = (await petOf(ana, id)) as { x: number; y: number; mode: string };
          if (r1.mode === "lost")
            await ana.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), { x: r1.x + 2, y: r1.y });
          return r1.mode;
        },
        { timeout: 30_000, intervals: [2500] },
      )
      .toBe("follow");
    await expect.poll(async () => (await petOf(bia, id))?.mode).toBe("follow");
  } finally {
    await release(ana);
  }
});
