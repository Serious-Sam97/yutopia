/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { type Browser, expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// The fight with Vortex (docs/plan/88-vortex-fight.md phase 2), Ana and Bia in the studio's reception. Ana shoots
// him (aimed, the left button): his cassette at the top of both screens, act I's slip on hers. Act II set, each of
// his moves on her, as both screens show it — the whip's lash and the tape round her (she can't move; Bia beside her
// holds E and cuts her free), REW's ◀◀, PAUSE (▮▮, then her shot back at her), the confiscation (her revolver gone,
// a slip), the radio's dance, HR's slip; beaten — the building's slip on both. YUTOPIA_SHOTS=<dir>: stills, hers
// and Bia's. 3D: the GPU (YUTOPIA_GPU=1).
const GPU = process.env.YUTOPIA_GPU === "1";
const shots = process.env.YUTOPIA_SHOTS;
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const w = (page: Page, fn: (y: any) => unknown) =>
  page.evaluate((src) => new Function("y", `return (${src})(y)`)((window as any).__yutopia), fn.toString());
const prefs = (p: Page) =>
  p.addInitScript(() => {
    const k = "yutopia:prefs";
    const v = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...v, view: "3p", cam3p: "chase", reducedMotion: false, lang: "en" }));
    localStorage.setItem("yutopia:lang", "en");
  });
// where they stand (the studio's lobby, its open floor): Ana, Bia a step behind and aside (out of her line, close
// enough to cut her free), Vortex 4 m ahead
const ANA_AT = { x: 8.5, y: 26.5 };
const BIA_AT = { x: 7.6, y: 27.3 };
const VX_AT = { x: 12.5, y: 26.5 };
// (a page behind the other draws no frames, and the HUD is drawn in them: each read from the front)
let front: Page | null = null;
const vxSeen = async (p: Page) => {
  if (front !== p) {
    await p.bringToFront();
    front = p;
    await p.waitForTimeout(120);
  }
  return p.evaluate(() => {
    const d = (window as any).__dark?.vxf;
    const q = (s: string) => document.querySelector(s) as HTMLElement | null;
    const shown = (s: string) => !!q(s) && q(s)?.style.display !== "none";
    return {
      boss: shown(".vxf-boss"),
      act: q(".vxf-boss .act")?.textContent ?? "",
      who: q(".vxf-boss .who")?.textContent ?? "",
      slips: [...document.querySelectorAll(".vxf-slip")].map((e) => e.textContent ?? ""),
      notice: shown(".vxf-notice") ? (q(".vxf-notice")?.textContent ?? "") : "",
      mine: shown(".vxf-mine") ? (q(".vxf-mine")?.textContent ?? "") : "",
      marks: q(".vxf-marks")?.textContent ?? "",
      pause: shown(".vxf-vhs.pause") ? (q(".vxf-vhs.pause")?.textContent ?? "") : "",
      rew: shown(".vxf-vhs.rew"),
      tape: (q(".vxf-layer")?.childElementCount ?? 0) > 0,
      prompt: shown(".vxf .dk-prompt") ? (q(".vxf .dk-prompt")?.textContent ?? "") : "",
      frozen: !!d?.frozen(),
    };
  });
};

// both in the studio's lobby, his fight reset and him held ahead of Ana, by day; the stills, both screens
async function two(page: Page, browser: Browser) {
  await prefs(page);
  await enter(page, await token(ANA));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bia = await ctx.newPage();
  await prefs(bia);
  await enter(bia, await token(BIA));
  for (const p of [page, bia])
    await p.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
      timeout: 90_000,
    });
  const home = (await w(page, (y) => y.homeFloor())) as number;
  const anaSid = (await page.evaluate(() => (window as any).__yutopia.room.sessionId)) as string;
  await page.evaluate(([p, l]) => (window as any).__yutopia.teleport({ ...(p as object), level: l }), [ANA_AT, home]);
  await bia.evaluate(([p, l]) => (window as any).__yutopia.teleport({ ...(p as object), level: l }), [BIA_AT, home]);
  for (const p of [page, bia]) {
    await p.waitForFunction((l) => (window as any).__yutopia.level === l, home, { timeout: 30_000 });
    await p.waitForFunction(() => !!(window as any).__dark?.vxf, null, { timeout: 60_000 });
  }
  await w(page, (y) => {
    y.room.send("mod:hour", { h: 12 });
    y.room.send("mod:refill", { kit: true });
  });
  await page.evaluate(
    (at) => (window as any).__yutopia.room.send("mod:vortex", { reset: true, hold: true, at }),
    VX_AT,
  );
  await expect
    .poll(() => w(page, (y) => y.room.state.npcs.get("vortex").x), { timeout: 10_000 })
    .toBeCloseTo(VX_AT.x, 1);
  await page.waitForTimeout(2500);
  const still = async (name: string) => {
    if (!shots) return;
    await page.screenshot({ path: `${shots}/vx-${name}-anas.png` });
    await bia.screenshot({ path: `${shots}/vx-${name}-bias.png` });
  };

  return { bia, ctx, home, anaSid, still };
}

test("the fight with Vortex, acts I–II: his cassette, each move on Ana — as both see it", async ({ page, browser }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(300_000);
  const { bia, ctx, home, anaSid, still } = await two(page, browser);
  // Ana: the revolver out, facing him, aimed, a shot — hit; his cassette on both screens, act I; her slip
  await page.bringToFront();
  front = page;
  await page.keyboard.press("Digit2");
  await expect
    .poll(() => w(page, (y) => y.room.state.players.get(y.room.sessionId).gun), { timeout: 10_000 })
    .toBe("revolver");
  await w(page, (y) => {
    y.tp.yaw = 0;
    y.tp.pitch = 0.08;
  });
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(1200);
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
  await expect.poll(() => w(page, (y) => y.room.state.npcs.get("vortex").vk), { timeout: 8000 }).toBeLessThan(1);
  for (const p of [page, bia]) {
    await expect.poll(() => vxSeen(p).then((s) => s.boss), { timeout: 8000 }).toBe(true);
    await expect.poll(() => vxSeen(p).then((s) => s.act)).toContain("act I");
    expect((await vxSeen(p)).who).toContain("Ana");
  }
  await expect.poll(() => vxSeen(page).then((s) => s.slips.join("|"))).toContain("not fighting back");
  await page.waitForTimeout(300);
  await still("act1");
  await page.mouse.up({ button: "right" });

  // act II
  await w(page, (y) => y.room.send("mod:vortex", { act: 2 }));
  for (const p of [page, bia]) await expect.poll(() => vxSeen(p).then((s) => s.act)).toContain("act II");
  const move = (kind: string) =>
    page.evaluate(([k, s]) => (window as any).__yutopia.room.send("mod:vortex", { move: k, to: s }), [kind, anaSid]);

  // the whip: the lash, the tape round her (both screens); she can't move; Bia beside her cuts her free
  await move("whip");
  for (const p of [page, bia]) await expect.poll(() => vxSeen(p).then((s) => s.tape), { timeout: 8000 }).toBe(true);
  await expect.poll(() => vxSeen(page).then((s) => s.mine), { timeout: 8000 }).toContain("Taped up");
  expect((await vxSeen(page)).frozen, "taped up: she stands still").toBe(true);
  await expect.poll(() => vxSeen(bia).then((s) => s.marks)).toContain("taped up");
  await expect.poll(() => vxSeen(bia).then((s) => s.prompt), { timeout: 8000 }).toContain("cut Ana Demo free");
  await still("whip");
  await bia.bringToFront();
  front = bia;
  await bia.keyboard.down("KeyE");
  await expect.poll(() => vxSeen(page).then((s) => s.mine), { timeout: 4000 }).toBe("");
  await bia.keyboard.up("KeyE");
  expect((await vxSeen(page)).slips.join("|")).toContain("Bia Demo cut you free");
  expect((await vxSeen(page)).frozen).toBe(false);
  await page.bringToFront();
  front = page;

  // REW: a step away, then back — her ◀◀, Bia's mark over her
  await page.waitForTimeout(600);
  await page.evaluate(
    ([a, l]) => (window as any).__yutopia.teleport({ x: (a as any).x, y: (a as any).y - 2, level: l }),
    [ANA_AT, home],
  );
  await page.waitForTimeout(700);
  await move("rew");
  await expect.poll(() => vxSeen(page).then((s) => s.rew), { timeout: 8000 }).toBe(true);
  await expect.poll(() => vxSeen(bia).then((s) => s.marks), { timeout: 8000 }).toContain("REW");
  await still("rew");
  await expect
    .poll(() => w(page, (y) => y.room.state.players.get(y.room.sessionId).y), { timeout: 8000 })
    .toBeCloseTo(ANA_AT.y, 0);

  // PAUSE: ▮▮ on both; her shot held; then ▶ and it's back at her (a slip)
  await move("pause");
  for (const p of [page, bia])
    await expect.poll(() => vxSeen(p).then((s) => s.pause), { timeout: 8000 }).toContain("PAUSE");
  await w(page, (y) => {
    y.tp.yaw = 0;
    y.tp.pitch = 0.08;
  });
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(700);
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
  await still("pause");
  await page.mouse.up({ button: "right" });
  await expect.poll(() => vxSeen(page).then((s) => s.slips.join("|")), { timeout: 8000 }).toContain("shots came back");

  // the confiscation: her revolver gone, her slip; Bia's slip says whose
  await move("steal");
  await expect
    .poll(() => vxSeen(page).then((s) => s.slips.join("|")), { timeout: 8000 })
    .toContain("Vortex took your revolver");
  await expect
    .poll(() => vxSeen(bia).then((s) => s.slips.join("|")), { timeout: 8000 })
    .toContain("Ana Demo's revolver");
  await expect.poll(() => w(page, (y) => y.room.state.players.get(y.room.sessionId).gun)).toBe("");
  await still("steal");

  // the radio's blast: she dances (stands still), the notes over her on Bia's screen
  await move("radio");
  await expect.poll(() => vxSeen(page).then((s) => s.mine), { timeout: 8000 }).toContain("dancing");
  expect((await vxSeen(page)).frozen).toBe(true);
  await expect.poll(() => vxSeen(bia).then((s) => s.marks), { timeout: 8000 }).toContain("♪");
  await still("radio");
  await expect.poll(() => vxSeen(page).then((s) => s.frozen), { timeout: 6000 }).toBe(false);

  // HR: to reception's corner, her slip; Bia's
  await move("hr");
  await expect.poll(() => vxSeen(page).then((s) => s.slips.join("|")), { timeout: 8000 }).toContain("REPORTED TO HR");
  await expect
    .poll(() => vxSeen(bia).then((s) => s.slips.join("|")), { timeout: 8000 })
    .toContain("Ana Demo was reported");
  await page.waitForTimeout(500);
  await still("hr");

  // beaten: the building's slip on both, the cassette gone
  await w(page, (y) => y.room.send("mod:vortex", { beat: true }));
  for (const p of [page, bia]) {
    await expect.poll(() => vxSeen(p).then((s) => s.notice), { timeout: 8000 }).toContain("VORTEX IS DOWN");
    await expect.poll(() => vxSeen(p).then((s) => s.boss)).toBe(false);
  }
  await still("down");
  await w(page, (y) => y.room.send("mod:vortex", { reset: true, hold: false }));
  await ctx.close();
});

// (phase 3) Act III, Ana and Bia in the lobby by day: into it — the lights out on both screens (Ana's torch what's
// left), his look gone dark, the shadowed drawn on both; his clones ("a clone?" on both); possessed — her legs walked
// to him, Bia's mark; the glitch — her move the other way round; his blows, unheld beside her, till she's down — Bia
// holds E and gets her up; beaten — the lights back.
test("the fight with Vortex, act III: the lights out, the shadowed, clones, the mind games, down and up", async ({
  page,
  browser,
}) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(300_000);
  const { bia, ctx, anaSid, still } = await two(page, browser);
  const dark = (p: Page) => w(p, (y) => y.tp.studioDark as number);
  await page.bringToFront();
  front = page;
  await page.keyboard.press("Digit2");
  await expect
    .poll(() => w(page, (y) => y.room.state.players.get(y.room.sessionId).gun), { timeout: 10_000 })
    .toBe("revolver");
  await w(page, (y) => {
    y.tp.yaw = 0;
    y.tp.pitch = 0.08;
  });
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(1200);
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
  await page.mouse.up({ button: "right" });
  await expect.poll(() => w(page, (y) => y.room.state.npcs.get("vortex").vk), { timeout: 8000 }).toBeLessThan(1);
  // her torch on (1: the left hand)
  await page.keyboard.press("Digit1");
  await expect
    .poll(() => w(page, (y) => !!y.room.state.players.get(y.room.sessionId).torch), { timeout: 8000 })
    .toBe(true);

  // act III: the lights out on both screens, his act; the shadowed let in, drawn on both
  await w(page, (y) => y.room.send("mod:vortex", { act: 3 }));
  for (const p of [page, bia]) {
    await expect.poll(() => vxSeen(p).then((s) => s.act), { timeout: 8000 }).toContain("act III");
    await expect.poll(() => vxSeen(p).then(() => dark(p)), { timeout: 8000 }).toBeGreaterThan(0.95);
    await expect
      .poll(() => p.evaluate(() => (window as any).__dark.vxf.shadeBodies().length), { timeout: 8000 })
      .toBeGreaterThan(0);
  }
  await page.waitForTimeout(1500);
  await still("act3");

  // his clones: "a clone?" over the three of them, on both
  await w(page, (y) => y.room.send("mod:vortex", { move: "clones" }));
  for (const p of [page, bia])
    await expect.poll(() => vxSeen(p).then((s) => s.marks), { timeout: 8000 }).toContain("a clone?");
  await still("clones");

  // possessed: her edge and its count; walked towards him; Bia's mark
  const dist = () =>
    w(page, (y) => {
      const v = y.room.state.npcs.get("vortex");
      const m = y.walker.where();
      return Math.hypot(v.x - m.x, v.y - m.y);
    }) as Promise<number>;
  await w(page, (y) => y.room.send("mod:vortex", { at: { x: 12.5, y: 26.5 } }));
  await page.waitForTimeout(400);
  const d0 = await dist();
  await page.evaluate((s) => (window as any).__yutopia.room.send("mod:vortex", { move: "possess", to: s }), anaSid);
  await expect
    .poll(() => page.evaluate(() => (document.querySelector(".vxf-possess") as HTMLElement).style.display), {
      timeout: 8000,
    })
    .toBe("block");
  await expect.poll(() => vxSeen(bia).then((s) => s.marks), { timeout: 8000 }).toContain("possessed");
  await still("possess");
  await bia.waitForTimeout(400);
  await page.bringToFront();
  front = page;
  await page.waitForTimeout(1500);
  expect(await dist(), "walked to him").toBeLessThan(d0 - 0.5);

  // the glitch: her move the other way round; its lines (after possession's rest: on her the next mind game waits)
  await page.waitForTimeout(9000);
  await page.evaluate((s) => (window as any).__yutopia.room.send("mod:vortex", { move: "glitch", to: s }), anaSid);
  await expect
    .poll(() => page.evaluate(() => (document.querySelector(".vxf-glitch") as HTMLElement).style.display), {
      timeout: 8000,
    })
    .toBe("block");
  const turned = await page.evaluate(() => {
    const m = { x: 1, y: 0.5, sprint: false, aim: false, jump: false, jumpPressed: false };
    (window as any).__dark.vxf.steer(m);
    return m;
  });
  expect(turned.x).toBe(-1);
  expect(turned.y).toBe(-0.5);
  await still("glitch");

  // unheld beside her: his blows (and theirs) till she's down; Bia by her holds E — up
  await page.evaluate(() => {
    const y = (window as any).__yutopia;
    const m = y.walker.where();
    y.room.send("mod:vortex", { hold: false, at: { x: m.x + 1.2, y: m.y } });
  });
  await expect
    .poll(() => w(page, (y) => y.room.state.players.get(y.room.sessionId).downAt), { timeout: 40_000 })
    .toBeGreaterThan(0);
  // (him held away, that she's got up)
  await w(page, (y) => y.room.send("mod:vortex", { hold: true, at: { x: 12.5, y: 23 } }));
  await bia.evaluate((s) => {
    const y = (window as any).__yutopia;
    const a = y.room.state.players.get(s);
    y.teleport({ x: a.x - 0.6, y: a.y + 0.6, level: y.level });
  }, anaSid);
  await bia.bringToFront();
  front = bia;
  await bia.waitForTimeout(800);
  await still("down");
  // (held; again if it didn't take — a blow still landing as she went down stops the first)
  // (got up: that down over — the shadowed still by her may put her down again at once, a new one)
  const downAt = (await w(page, (y) => y.room.state.players.get(y.room.sessionId).downAt)) as number;
  const up = () =>
    w(page, (y) => y.room.state.players.get(y.room.sessionId).downAt).then((d) => d !== downAt) as Promise<boolean>;
  for (let i = 0; i < 3 && !(await up()); i++) {
    await bia.keyboard.down("KeyE");
    // (Bia's hands on her — the server's word: a revive, not the bleeding running out)
    if (i === 0) {
      const biaSid = (await bia.evaluate(() => (window as any).__yutopia.room.sessionId)) as string;
      await expect
        .poll(() => w(page, (y) => y.room.state.players.get(y.room.sessionId).revBy), { timeout: 3000 })
        .toBe(biaSid);
    }
    await expect
      .poll(up, { timeout: 6000 })
      .toBe(true)
      .catch(() => {});
    await bia.keyboard.up("KeyE");
  }
  expect(await up(), "Bia got her up").toBe(true);

  // beaten: the lights back
  await w(page, (y) => y.room.send("mod:vortex", { beat: true }));
  for (const p of [page, bia])
    await expect.poll(() => vxSeen(p).then(() => dark(p)), { timeout: 10_000 }).toBeLessThan(0.05);
  await w(page, (y) => {
    y.room.send("mod:vortex", { reset: true, hold: false });
    y.room.send("mod:heal", {});
  });
  await ctx.close();
});
