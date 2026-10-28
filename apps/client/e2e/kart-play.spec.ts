/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { KART_DESK, KART_STANDS } from "../../../packages/shared/src/kart/park.ts";
import { ANA, BIA, enter, test, token } from "./helpers";

// The karts in the game (docs/plan/46-the-karts.md, phases 2–6): Ana at the paddock's desk takes a
// kart (X), drives off (her kart moves, the server has it), Bia sees it go by; Ana sets up a
// Grand Prix with Vortex filling the grid, starts it — the lights, the race, Vortex away — and gets
// out. Frame times on the machine's GPU (YUTOPIA_GPU=1). Review shots: YUTOPIA_SHOTS=<dir>.

const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
// (Chromium's GPU flags; Firefox has its own: playwright.firefox.config.ts)
if (process.env.YUTOPIA_FIREFOX !== "1")
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
test.use({ viewport: { width: 1280, height: 800 } });
const G = (x: number, z: number) => ({ x: x + 60, y: z + 10 });

async function open(page: Page, who: typeof ANA, view: "3p" | "1p" = "3p") {
  await page.addInitScript((v) => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: v, cam3p: "chase" }));
    const W = window as any;
    W.__worst = 0;
    let last = performance.now();
    W.__long = [];
    const tick = (t: number) => {
      if (t - last > 80) {
        const p = W.__yutopia?.room?.state?.karts?.get("park");
        W.__long.push({
          ms: Math.round(t - last),
          phase: p?.phase,
          shots: p ? [...p.shots.values()].map((x: any) => x.kind).join(",") : "",
        });
      }
      W.__worst = Math.max(W.__worst, t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, view);
  await enter(page, await token(who));
}
const shot = async (page: Page, name: string) => {
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};
const worst = (page: Page) =>
  page.evaluate(() => {
    const W = window as any;
    const v = W.__worst;
    W.__worst = 0;
    return v as number;
  });
const park = (page: Page) =>
  page.evaluate(() => {
    const p = (window as any).__yutopia.room.state.karts.get("park");
    const me = (window as any).__yutopia.room.sessionId;
    const karts = [...p.karts.entries()].map(([k, s]: any) => ({
      k,
      sid: s.sid,
      x: s.x,
      z: s.z,
      vortex: s.vortex,
      place: s.place,
    }));
    return { phase: p.phase, mode: p.mode, karts, mine: karts.find((k) => k.sid === me) };
  });
async function toDesk(page: Page) {
  const p = G(KART_DESK.x + 2, KART_DESK.z);
  await page.evaluate((q) => (window as any).__yutopia.teleport({ ...q, level: 0 }), p);
  await page.waitForFunction(
    (q) => {
      const w = (window as any).__yutopia;
      const me = w.room.state.players.get(w.room.sessionId);
      return !!me && Math.hypot(me.x - q.x, me.y - q.y) < 2;
    },
    p,
    { timeout: 20_000 },
  );
}

test("a kart at the desk, driven off, a Grand Prix with Vortex started, out", async ({ page, browser }) => {
  test.setTimeout(300_000);
  await open(page, ANA);
  await toDesk(page);
  // the X: "take a kart" (the karts' module loads near the park)
  await page.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "kart:take", null, { timeout: 30_000 });
  await shot(page, "kart-play-desk");
  await page.keyboard.press("x");
  await page.waitForFunction(
    () => {
      const w = (window as any).__yutopia;
      return (w.room.state.players.get(w.room.sessionId)?.busy ?? "").startsWith("drive:kart:");
    },
    null,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(2500);
  await shot(page, "kart-play-grid");
  // drive: W held, it moves (the server has it moving)
  const a0 = (await park(page)).mine;
  await worst(page);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(3000);
  await shot(page, "kart-play-driving");
  await page.keyboard.down("Space");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1500);
  await shot(page, "kart-play-drift");
  await page.keyboard.up("KeyD");
  await page.keyboard.up("Space");
  await page.keyboard.up("KeyW");
  const w1 = await worst(page);
  console.log(`[kart-play] worst frame driving: ${Math.round(w1)} ms`);
  const a1 = (await park(page)).mine;
  expect(a0 && a1, "my kart in the park").toBeTruthy();
  const moved = Math.hypot((a1?.x ?? 0) - (a0?.x ?? 0), (a1?.z ?? 0) - (a0?.z ?? 0));
  console.log(`[kart-play] my kart moved ${moved.toFixed(1)} m`);
  expect(moved, "driven off").toBeGreaterThan(20);
  if (GPU) expect(w1, "worst frame driving").toBeLessThan(120);

  // Bia, by the stands, sees Ana's kart there
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bp = await ctx.newPage();
  await open(bp, BIA);
  await toDesk(bp);
  await bp.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").karts.size >= 1, null, {
    timeout: 20_000,
  });

  // the lobby (in a kart, between races): a Grand Prix, 1 lap, Vortex at medium, Start
  await page.waitForSelector("button[data-go='start']", { timeout: 10_000 });
  await shot(page, "kart-play-lobby");
  await page.click("button[data-set='laps'][data-v='1']");
  await page.click("button[data-go='start']");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "lights", null, {
    timeout: 10_000,
  });
  await page.waitForTimeout(3200);
  await shot(page, "kart-play-lights");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "race", null, {
    timeout: 10_000,
  });
  const p = await park(page);
  expect(p.karts.length, "the grid filled").toBe(8);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(4000);
  await shot(page, "kart-play-race");
  // Bia at the stands: "Follow the race" lends her the leader's camera
  const st = KART_STANDS[0];
  const at = G((st.x0 + st.x1) / 2, st.z - 3);
  await bp.evaluate((q) => (window as any).__yutopia.teleport({ ...q, level: 0 }), at);
  await bp.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "kart:follow", null, { timeout: 20_000 });
  await bp.keyboard.press("x");
  await bp.waitForTimeout(2500);
  if (dir) await bp.screenshot({ path: `${dir}/kart-play-bia-follows.png` });
  expect(await bp.evaluate(() => !!(window as any).__yutopia.tp.gameCam), "the leader's camera").toBeTruthy();
  await page.keyboard.up("KeyW");
  const p2 = await park(page);
  const vortexMoved = p2.karts
    .filter((k) => k.vortex)
    .some((k) => {
      const k0 = p.karts.find((x) => x.k === k.k);
      return k0 && Math.hypot(k.x - k0.x, k.z - k0.z) > 20;
    });
  expect(vortexMoved, "Vortex away").toBeTruthy();
  // out: X once it's stopped
  await page.waitForTimeout(2500);
  await page.keyboard.press("x");
  await page.waitForFunction(
    () => {
      const w = (window as any).__yutopia;
      return (w.room.state.players.get(w.room.sessionId)?.busy ?? "") === "";
    },
    null,
    { timeout: 15_000 },
  );
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "lobby", null, {
    timeout: 20_000,
  });
  await ctx.close();
});

const auto = (page: Page, on: boolean) => page.evaluate((o) => (window as any).__karts.autopilot(o), on);
const phase = (page: Page) =>
  page.evaluate(() => (window as any).__yutopia.room.state.karts.get("park").phase as string);
async function inKart(page: Page) {
  await toDesk(page);
  await page.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "kart:take", null, { timeout: 30_000 });
  await page.keyboard.press("x");
  await page.waitForFunction(
    () => {
      const w = (window as any).__yutopia;
      return (w.room.state.players.get(w.room.sessionId)?.busy ?? "").startsWith("drive:kart:");
    },
    null,
    { timeout: 10_000 },
  );
  await page.waitForSelector("button[data-go='start']", { timeout: 10_000 });
}

test("a Grand Prix to the flag on the autopilot: crates, items flying, the results", async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, ANA);
  await inKart(page);
  await page.click("button[data-set='mode'][data-v='gp']");
  await page.click("button[data-set='laps'][data-v='1']");
  await page.click("button[data-go='start']");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "race", null, {
    timeout: 12_000,
  });
  await auto(page, true);
  // items: someone's (mine or Vortex's) in the air before long; the flag within a couple of minutes
  let sawShot = false;
  let shotTaken = false;
  const t0 = Date.now();
  await worst(page);
  while (Date.now() - t0 < 150_000) {
    const s = await page.evaluate(() => {
      const p = (window as any).__yutopia.room.state.karts.get("park");
      return { phase: p.phase, shots: [...p.shots.values()].map((x: any) => x.kind) };
    });
    if (s.shots.some((k: string) => k !== "stapler")) {
      sawShot = true;
      if (!shotTaken) {
        shotTaken = true;
        await shot(page, "kart-play-items");
      }
    }
    if (s.phase === "done") break;
    await page.waitForTimeout(400);
  }
  const w = await worst(page);
  console.log(`[kart-play] race: worst frame ${Math.round(w)} ms, items seen ${sawShot}`);
  expect(await phase(page), "the flag").toBe("done");
  expect(sawShot, "something thrown").toBeTruthy();
  await page.waitForTimeout(800);
  await shot(page, "kart-play-results");
  const res = await page.evaluate(() => JSON.parse((window as any).__yutopia.room.state.karts.get("park").results));
  expect(res.rows.length).toBe(8);
  if (GPU) expect(w, "worst frame racing").toBeLessThan(150);
  await auto(page, false);
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "lobby", null, {
    timeout: 20_000,
  });
  await page.click("button[data-go='leave']");
});

test("the start: the engine revved on the grid, the throttle down on the fourth light, a rocket start", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await open(page, ANA);
  await inKart(page);
  await page.click("button[data-set='mode'][data-v='gp']");
  await page.click("button[data-set='laps'][data-v='1']");
  await page.click("button[data-go='start']");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "lights", null, {
    timeout: 12_000,
  });
  // (the fourth light's on 3 s in: down then, and held)
  await page.waitForTimeout(3200);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(700);
  const revs = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const p = w.room.state.karts.get("park");
    const mine = [...p.karts.values()].find((k: any) => k.sid === w.room.sessionId) as any;
    return { phase: p.phase, mine: mine?.rev ?? 0, x: mine?.x, z: mine?.z };
  });
  console.log(`[kart-play] the start: revs on the grid ${revs.mine.toFixed(2)} (${revs.phase})`);
  expect(revs.phase).toBe("lights");
  expect(revs.mine, "revving where it stands (the others told)").toBeGreaterThan(0.7);
  await shot(page, "kart-play-revving");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "race", null, {
    timeout: 10_000,
  });
  // the rocket start: boosting off the line, said so
  const said = await page.waitForFunction(
    () => {
      const w = (window as any).__yutopia;
      const p = w.room.state.karts.get("park");
      const mine = [...p.karts.values()].find((k: any) => k.sid === w.room.sessionId) as any;
      return mine?.boost && /ROCKET START/.test(document.body.innerText) ? { rev: mine.rev } : false;
    },
    null,
    { timeout: 3000 },
  );
  expect(((await said.jsonValue()) as { rev: number }).rev, "the revs back to nothing").toBe(0);
  await page.waitForTimeout(400);
  await shot(page, "kart-play-rocket");
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(3000);
  await page.keyboard.press("x");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "lobby", null, {
    timeout: 30_000,
  });
});

test("a battle in the bowl: the clock, smashes", async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, ANA);
  await inKart(page);
  await page.click("button[data-set='mode'][data-v='battle']");
  await page.click("button[data-go='start']");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "race", null, {
    timeout: 12_000,
  });
  await auto(page, true);
  await page.waitForTimeout(4000);
  await shot(page, "kart-play-battle");
  await page.waitForFunction(
    () => [...(window as any).__yutopia.room.state.karts.get("park").karts.values()].some((k: any) => k.score > 0),
    null,
    { timeout: 120_000 },
  );
  await shot(page, "kart-play-battle-smash");
  await auto(page, false);
  // (stopped first: X is refused on the move)
  await page.waitForTimeout(4000);
  await page.keyboard.press("x");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "lobby", null, {
    timeout: 30_000,
  });
});

test("a night race under the floodlights: eight karts, frame times on High", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, ANA);
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    y.room.send("mod:hour", { h: 23 });
  });
  await inKart(page);
  await page.click("button[data-set='mode'][data-v='gp']");
  await page.click("button[data-set='laps'][data-v='1']");
  await page.click("button[data-go='start']");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "race", null, {
    timeout: 12_000,
  });
  await auto(page, true);
  await page.waitForTimeout(3000);
  await worst(page);
  await page.waitForTimeout(20_000);
  const w = await worst(page);
  const fps = await page.evaluate(
    () =>
      new Promise<number>((r) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(f);
          else r(n / 2);
        };
        requestAnimationFrame(f);
      }),
  );
  console.log(`[kart-play] night race: worst frame ${Math.round(w)} ms, ${fps} fps`);
  await shot(page, "kart-play-night");
  if (GPU) {
    expect(w, "worst frame at night").toBeLessThan(150);
    expect(fps, "frame rate at night").toBeGreaterThan(45);
  }
  await auto(page, false);
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 12 }));
  await page.waitForTimeout(4000);
  await page.keyboard.press("x");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "lobby", null, {
    timeout: 30_000,
  });
});

test("the lobby's colour and Ready, the race's mini-map, Vortex's drone fishing me out", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, ANA);
  await inKart(page);
  // a colour of mine (the swatches), then Ready: alone, everyone's ready — it starts in 3 s
  await page.click("button[data-set='colour'][data-v='4']");
  await page.waitForFunction(
    () => {
      const w = (window as any).__yutopia;
      const p = w.room.state.karts.get("park");
      const k = [...p.karts.values()].find((s: any) => s.sid === w.room.sessionId) as any;
      return k?.colour === 4;
    },
    null,
    { timeout: 5000 },
  );
  await page.click("button[data-set='mode'][data-v='gp']");
  await page.click("button[data-set='laps'][data-v='1']");
  await page.click("button[data-go='ready']");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "lights", null, {
    timeout: 8000,
  });
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "race", null, {
    timeout: 12_000,
  });
  // the mini-map's up in a race
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector("[data-k='mapBox']") as Element).display !== "none",
    null,
    {
      timeout: 5000,
    },
  );
  await page.waitForTimeout(1500);
  await shot(page, "kart-play-minimap");
  // backwards for a while: the wrong way round — the drone fishes me out
  await page.keyboard.down("KeyS");
  await page.waitForFunction(() => !!(window as any).__karts.fish, null, { timeout: 15_000 });
  await page.keyboard.up("KeyS");
  await page.waitForTimeout(700);
  await shot(page, "kart-play-fished");
  await page.waitForFunction(() => !(window as any).__karts.fish, null, { timeout: 5000 });
  // out
  await page.waitForTimeout(1500);
  await page.keyboard.press("x");
  await page.waitForFunction(() => (window as any).__yutopia.room.state.karts.get("park").phase === "lobby", null, {
    timeout: 40_000,
  });
});
