/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the bench's window hooks */
import { expect, type Page } from "@playwright/test";
import { test } from "./helpers";

// Plan 83 phase 7: the sniper's hold checked on its bench (/dev/arms?gun=sniper — the game's own person, the life
// sniper, both bodies in a t-shirt), every state of it, by plan 82's strict audit: aimed upright and on the look
// across the aim's whole reach in the game (−0.55…0.7) at any turn of her, with and without the torch, her right
// eye on the scope's axis (her cheek on the riser); the low ready walking and running; up from it in the gun's
// own time; drawn off her back (by the stock first); the bolt worked by her right hand, the rifle at her
// shoulder; the reload raised, a round at a time out of the sleeve; kept across her chest through a roll, a
// vault, a slide — over the floor all through a roll; struck, kept at the ready through the flinch, her forearms
// not wrung; let go sat. Everywhere: each hand at its place,
// each wrist within its reach, each forearm turned no more than ~50° (pinched thin past it), no hand through the
// other, no finger or arm in the gun. Known and left (docs/plan/83-the-sniper.md): mid-draw her right forearm
// along the tall stock's belly (3–6 cm), and the reload's two changes of hold (~0.15 s each) — not held to it.
// 3D: the GPU (YUTOPIA_GPU=1).
const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const DEG = Math.PI / 180;

const set = (page: Page, s: Record<string, unknown>) => page.evaluate((s) => (window as any).__revolver.set(s), s);
const settle = (page: Page, ms = 700) => page.waitForTimeout(ms);
const BASE = {
  pose: "ready",
  pitch: 0,
  move: 0,
  draw: 1,
  away: false,
  torch: false,
  kick: 0,
  trigger: 0,
  act: "",
  actT: 0,
  yaw: 0,
  t: 0,
  dry: false,
  play: 0,
};
// (tp/sniper-hold.ts: the scope's axis over the grip; the bolt's 0.85 s; the reload's 3.5 s on the bench —
// opened, five rounds, closed at 2.85, back)
const SCOPE_Y = 0.112;
const BOLT_S = 0.85;
const LOAD_S = 3.5;
// the hold as it is: the bench's checks, each forearm's turn (rad — PersonModel.wristParts), her right eye in the
// gun's frame (m)
const state = (page: Page) =>
  page.evaluate(() => {
    const R = (window as any).__revolver;
    const P = R.person;
    const m = P.model;
    const c = R.check();
    const tw = (S: string) => Math.abs(m.wristParts(S, m.bone(`wrist${S}`).quaternion).twist);
    const g = P.gun?.model.root;
    let eye: number[] | null = null;
    const e = m.root.getObjectByName("eyeR");
    if (g && e) {
      g.updateWorldMatrix(true, false);
      const p = e.getWorldPosition(new g.position.constructor()).applyMatrix4(g.matrixWorld.clone().invert());
      eye = [p.x, p.y, p.z];
    }
    return { c, tL: tw("L"), tR: tw("R"), eye, torch: !!P.torch };
  });
type Lim = { short: number; over: number; twist: number; arms: number; grip: number };
const HELD: Lim = { short: 0.01, over: 3 * DEG, twist: 53 * DEG, arms: -0.003, grip: -0.003 };
// (moving between places — the bolt, the reload — a forearm's capsule against the gun's rods is rough: a few mm)
const MOVING: Lim = { short: 0.012, over: 6 * DEG, twist: 53 * DEG, arms: -0.008, grip: -0.004 };
const held = async (page: Page, at: string, lim: Lim = HELD, left = true) => {
  const s = await state(page);
  const c = s.c;
  expect(c, at).not.toBeNull();
  expect(c.R.short, `${at}: the right at its place`).toBeLessThan(lim.short);
  expect(c.R.over, `${at}: the right wrist past its reach`).toBeLessThan(lim.over);
  expect(s.tR, `${at}: the right forearm turned`).toBeLessThan(lim.twist);
  if (left) {
    expect(c.L, `${at}: the left on the gun`).not.toBeNull();
    expect(c.L.short, `${at}: the left at its place`).toBeLessThan(lim.short);
    expect(c.L.over, `${at}: the left wrist past its reach`).toBeLessThan(lim.over);
    expect(s.tL, `${at}: the left forearm turned`).toBeLessThan(lim.twist);
  }
  expect(c.hands, `${at}: a hand through a hand (${c.where})`).toBeGreaterThan(-0.003);
  // (the torch in the left fist: its fingers round it and the fore-end)
  if (!s.torch) expect(c.grip, `${at}: fingers in the gun (${c.whereGrip})`).toBeGreaterThan(lim.grip);
  expect(c.arms, `${at}: an arm through the gun (${c.whereArms})`).toBeGreaterThan(lim.arms);
  return s;
};
const onScope = (s: Awaited<ReturnType<typeof state>>, at: string) => {
  expect(s.eye, `${at}: an eye`).not.toBeNull();
  expect(Math.abs((s.eye as number[])[1] - SCOPE_Y), `${at}: her eye at the scope's height`).toBeLessThan(0.015);
  expect(Math.abs((s.eye as number[])[2]), `${at}: her eye over the bore`).toBeLessThan(0.01);
};

for (const gender of ["feminine", "masculine"])
  test(`the sniper's hold on its bench (${gender}): upright, her eye on the scope, the bolt by her right hand, reloaded raised, nothing through anything, kept`, async ({
    page,
  }) => {
    test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.goto(`/dev/arms?gun=sniper&top=tee&gender=${gender}`);
    await page.waitForFunction(() => (window as any).__revolver?.ready, null, { timeout: 120_000 });

    // aimed: the aim's whole reach in the game, at any turn of her, with and without the torch — the butt in the
    // shoulder, her cheek on the riser, her eye on the scope's axis, both hands on
    // (settled first, and longer at each new turn: the elbow's swing eases from where it was — plan 81 — and the
    // first frames after the page's load or a half-turn of her aren't where it comes to rest)
    await set(page, { ...BASE, pose: "aim", pitch: -0.55 });
    await settle(page, 2500);
    for (const yaw of [0, 1.3, -2.4])
      for (const torch of [false, true])
        for (const pitch of [-0.55, -0.3, 0, 0.3, 0.7]) {
          await set(page, { ...BASE, pose: "aim", yaw, torch, pitch });
          await settle(page, pitch === -0.55 ? 1800 : 900);
          const at = `aim yaw ${yaw} pitch ${pitch}${torch ? " torch" : ""}`;
          // (aimed lowest, the smaller body's left forearm is at the edge: 51–54° by the way it got there — the
          // AK's is 52)
          const s = await held(page, at, pitch <= -0.55 ? { ...HELD, twist: 55 * DEG } : HELD);
          expect(s.c.cant, `${at}: upright`).toBeLessThan(2 * DEG);
          expect(s.c.off, `${at}: on the look`).toBeLessThan(2 * DEG);
          onScope(s, at);
        }

    // the low ready, both hands on, walking and running, with the torch: upright, square
    for (const [yaw, move, torch] of [
      [0, 0, false],
      [-1.6, 1, false],
      [2.6, 2, false],
      [0.4, 3, false],
      [0.7, 1, true],
    ] as const) {
      await set(page, { ...BASE, yaw, move, torch });
      await settle(page);
      const at = `ready yaw ${yaw} move ${move}${torch ? " torch" : ""}`;
      const s = await held(page, at);
      expect(s.c.cant, `${at}: upright`).toBeLessThan(2 * DEG);
    }

    // up from the ready in the gun's own 0.3 s (shared ARMS.sniper.aim)
    await set(page, { ...BASE });
    await settle(page);
    const t0 = Date.now();
    await set(page, { pose: "aim" });
    await page.waitForTimeout(Math.max(0, 50 - (Date.now() - t0)));
    expect((await state(page)).c.off, "still coming up 50 ms in").toBeGreaterThan(6 * DEG);
    await page.waitForTimeout(Math.max(0, 500 - (Date.now() - t0)));
    expect((await state(page)).c.off, "up by 500 ms").toBeLessThan(2 * DEG);

    // drawn off her back (on the AK's diagonal): by its stock at her right hip first, on to the grip as it comes
    // round — her right wrist within its reach, her forearm ≤50°, no finger in the gun; (her forearm by the scope
    // as her hand leaves the stock, along the tall stock's belly hanging at her side — mid-draw, 0.1–0.8 of it — is
    // known: docs/plan/83 phase 2 — so the arms' check is loose there); slung again
    for (const d of [0.06, 0.12, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9]) {
      await set(page, { ...BASE, draw: d });
      await settle(page, 500);
      await held(page, `draw ${d}`, { ...HELD, over: 4 * DEG, arms: d < 0.1 || d > 0.8 ? HELD.arms : -0.07 }, d >= 0.9);
    }
    await set(page, { ...BASE, away: true, draw: 0 });
    await settle(page, 1200);
    expect(
      await page.evaluate(() => !!(window as any).__revolver.person.slings.get("sniper")?.root.visible),
      "slung again",
    ).toBe(true);

    // the bolt after a shot (F3a): her right hand off the grip to the knob, up, back, home, down, back — the rifle
    // at her shoulder, her cheek on it, her eye on the scope, her left hand on the fore-end; the bolt run back
    // (drawn again off her back and aimed first: the draw's 0.6 s, the aim's)
    await set(page, { ...BASE });
    await settle(page, 1500);
    await set(page, { ...BASE, pose: "aim" });
    await settle(page, 1500);
    let back = 0;
    for (const t of [0.06, 0.13, 0.2, 0.28, 0.36, 0.43, 0.52, 0.6, 0.66, 0.74, 0.82]) {
      await set(page, { ...BASE, pose: "aim", act: "bolt", actT: t / BOLT_S });
      await settle(page, 500);
      const s = await held(page, `bolt ${t} s`, MOVING);
      onScope(s, `bolt ${t} s`);
      back = Math.max(back, await page.evaluate(() => (window as any).__revolver.person.boltCycle as number));
    }
    expect(back, "the bolt run back").toBeGreaterThan(0.9);

    // the reload (F4a, F5a): raised before her right chest, her left hand over the fore-end's top; her right hand
    // to the knob (the bolt back), a round at a time out of the sleeve to the port, thumbed down; the bolt home —
    // all the loading held to it (the changes of hold either side not: known, docs/plan/83 phase 5)
    const load = () =>
      page.evaluate(() => {
        const P = (window as any).__revolver.person;
        return { round: !!P.snRound?.visible, sleeve: P.snSleeve as number, bolt: P.boltCycle as number };
      });
    let sawRound = false;
    let minSleeve = 5;
    for (const sec of [0.3, 0.42, 0.55, 0.66, 0.78, 1.3, 1.8, 2.3, 2.95, 3.1]) {
      await set(page, { ...BASE, pose: "reload", t: sec / LOAD_S });
      await settle(page, 550);
      await held(page, `reload ${sec} s`, MOVING);
      const l = await load();
      sawRound ||= l.round;
      minSleeve = Math.min(minSleeve, l.sleeve);
      // (back by 0.35 s — the server's open — till the closing at 2.85)
      if (sec > 0.35 && sec < 2.85) expect(l.bolt, `reload ${sec} s: the bolt back`).toBeGreaterThan(0.9);
    }
    expect(sawRound, "a round in her hand").toBe(true);
    expect(minSleeve, "the sleeve's rounds taken").toBeLessThan(5);
    await set(page, { ...BASE, pose: "reload", t: 3.45 / LOAD_S });
    await settle(page, 600);
    expect((await load()).bolt, "the bolt home").toBeLessThan(0.05);

    // kept through a roll, a vault, a slide: across her chest, both hands on as held
    for (const [act, actT] of [
      ["roll", 0.2],
      ["roll", 0.5],
      ["vault", 0.4],
      ["slide", 0.4],
    ] as const) {
      await set(page, { ...BASE, act, actT });
      await settle(page);
      await held(page, `${act} ${actT}`);
    }
    // struck: kept at the ready, gone with her chest through the flinch — every frame of it, both hands on, each
    // forearm turned no more than ~50° (pulled in across her chest and back out, the right was turned 48° all
    // of it and the left spun 105° one way and 137° the other: the user's thin arm, 2026-11-13)
    await set(page, { ...BASE });
    await settle(page, 1200);
    await page.evaluate(() => {
      const W = window as any;
      W.__hitLog = [];
      W.__hitOn = true;
      const tick = () => {
        const m = W.__revolver.person.model;
        const c = W.__revolver.check();
        const tw = (S: string) => Math.abs(m.wristParts(S, m.bone(`wrist${S}`).quaternion).twist);
        W.__hitLog.push([tw("R"), tw("L"), c ? c.R.short : 1, c?.L ? c.L.short : 1, c ? c.arms : -1]);
        if (W.__hitOn) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    for (let i = 0; i <= 14; i++) {
      await set(page, { ...BASE, act: "hit", actT: i * 0.06 });
      await page.waitForTimeout(60);
    }
    await set(page, { ...BASE });
    await settle(page, 800);
    const hit: number[][] = await page.evaluate(() => {
      (window as any).__hitOn = false;
      return (window as any).__hitLog;
    });
    const most = (k: number) => Math.max(...hit.map((r) => r[k]));
    expect(most(0), "struck: her right forearm not wrung").toBeLessThan(53 * DEG);
    expect(most(1), "struck: her left forearm not wrung").toBeLessThan(53 * DEG);
    expect(most(2), "struck: her right hand on").toBeLessThan(MOVING.short);
    expect(most(3), "struck: her left hand on").toBeLessThan(MOVING.short);
    expect(Math.min(...hit.map((r) => r[4])), "struck: no arm through the gun").toBeGreaterThan(MOVING.arms);
    // …and through a whole roll, never through the floor
    for (let i = 1; i < 20; i++) {
      await set(page, { ...BASE, act: "roll", actT: i / 20 });
      await settle(page, 350);
      const low = await page.evaluate(() => {
        const P = (window as any).__revolver.person;
        const g = P.gun.model.root;
        g.updateWorldMatrix(true, true);
        const V = g.position.constructor;
        let low = 9;
        for (const x of [-0.39, -0.2, 0, 0.3, 0.6, 0.88])
          for (const y of [-0.09, 0, 0.11]) low = Math.min(low, new V(x, y, 0).applyMatrix4(g.matrixWorld).y);
        return low - P.root.position.y;
      });
      expect(low, `roll ${i / 20}: the gun over the floor`).toBeGreaterThan(-0.01);
    }
    // sat: let go of — in her right hand, on her lap
    await set(page, { ...BASE, act: "sit" });
    await settle(page, 2500);
    expect((await state(page)).c, "sat: still in her hand").not.toBeNull();
    const heldW = await page.evaluate(() => (window as any).__revolver.person.revW as number);
    expect(heldW, "sat: the hold let go").toBeLessThan(0.1);
  });
