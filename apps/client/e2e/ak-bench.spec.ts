/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the bench's window hooks */
import { expect, type Page } from "@playwright/test";
import { test } from "./helpers";

// Plan 82 phase 6 (and the "make it perfect" pass, 2026-11-13): the AK's hold checked on its bench
// (/dev/arms?gun=ak47 — the game's own person, the life AK, both bodies in a t-shirt), every state of it: aimed
// upright and on the look across the aim's whole reach in the game (its camera: −0.55…0.7) at any turn of her,
// with and without the torch, her eye on the sights (the cheek on the stock); the low ready walking and running;
// up from it in the gun's own time; drawn off her back (by the stock first) and slung again; the reload's moments,
// full and run dry (the handle racked by her right hand); a burst; kept across her chest through a roll, a vault,
// a slide, struck — and in a roll, the gun never through the floor; let go sat. Everywhere: each hand at its
// place, each wrist within its reach, each forearm turned no more than ~50° (pinched thin past it), no hand
// through the other, no finger or arm in the gun. 3D: the GPU (YUTOPIA_GPU=1).
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
// (moving between places in the reload — a forearm's capsule against the gun's rods is rough: a few mm)
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
  // (the torch in the left fist: its fingers round it and the receiver)
  if (!s.torch) expect(c.grip, `${at}: fingers in the gun (${c.whereGrip})`).toBeGreaterThan(lim.grip);
  expect(c.arms, `${at}: an arm through the gun`).toBeGreaterThan(lim.arms);
  return s;
};

for (const gender of ["feminine", "masculine"])
  test(`the AK's hold on its bench (${gender}): upright, on the look, cheek on the stock, nothing through anything, drawn, reloaded, kept`, async ({
    page,
  }) => {
    test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.goto(`/dev/arms?gun=ak47&top=tee&gender=${gender}`);
    await page.waitForFunction(() => (window as any).__revolver?.ready, null, { timeout: 120_000 });

    // aimed: the aim's whole reach in the game, at any turn of her, with and without the torch — the butt in the
    // shoulder, her eye on the sights, both hands on
    for (const yaw of [0, 1.3, -2.4])
      for (const torch of [false, true])
        for (const pitch of [-0.55, -0.3, 0, 0.3, 0.7]) {
          await set(page, { ...BASE, pose: "aim", yaw, torch, pitch });
          await settle(page, 900);
          const at = `aim yaw ${yaw} pitch ${pitch}${torch ? " torch" : ""}`;
          const s = await held(page, at);
          expect(s.c.cant, `${at}: upright`).toBeLessThan(2 * DEG);
          expect(s.c.off, `${at}: on the look`).toBeLessThan(2 * DEG);
          // (her right eye on the sight line: over the bore, at the sights' height — tp/ak-hold.ts cheek)
          expect(s.eye, `${at}: an eye`).not.toBeNull();
          expect(Math.abs((s.eye as number[])[1] - 0.106), `${at}: her eye at the sights' height`).toBeLessThan(0.015);
          expect(Math.abs((s.eye as number[])[2]), `${at}: her eye over the bore`).toBeLessThan(0.01);
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

    // up from the ready in the gun's own 0.24 s (shared ARMS.ak47.aim)
    await set(page, { ...BASE });
    await settle(page);
    const t0 = Date.now();
    await set(page, { pose: "aim" });
    await page.waitForTimeout(Math.max(0, 50 - (Date.now() - t0)));
    expect((await state(page)).c.off, "still coming up 50 ms in").toBeGreaterThan(6 * DEG);
    await page.waitForTimeout(Math.max(0, 420 - (Date.now() - t0)));
    expect((await state(page)).c.off, "up by 420 ms").toBeLessThan(2 * DEG);

    // drawn off her back: from where it hangs slung, by its stock at her right hip, on to the grip as it comes
    // round — her right hand within its reach throughout, no arm through it; slung again
    const gunToSlung = () =>
      page.evaluate(() => {
        const P = (window as any).__revolver.person;
        const g = P.gun?.model.root;
        const chest = P.model.bone("chest");
        if (!g || !chest) return 9;
        const V = g.position.constructor;
        // (tp/ak-hold.ts AK_SLUNG: the slung gun's grip in the chest bone's space)
        return g.getWorldPosition(new V()).distanceTo(chest.localToWorld(new V(-0.1, -0.13, -0.12)));
      });
    await set(page, { ...BASE, draw: 0.02 });
    await settle(page);
    expect(await gunToSlung(), "drawn from where it's slung").toBeLessThan(0.04);
    for (const d of [0.06, 0.12, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9]) {
      await set(page, { ...BASE, draw: d });
      await settle(page, 500);
      await held(page, `draw ${d}`, { ...HELD, over: 4 * DEG }, d >= 0.9);
    }
    await set(page, { ...BASE, draw: 1 });
    await settle(page);
    expect(await gunToSlung(), "drawn off her back").toBeGreaterThan(0.3);
    await set(page, { ...BASE, away: true, draw: 0 });
    await settle(page, 1200);
    expect(
      await page.evaluate(() => !!(window as any).__revolver.person.slings.get("ak47")?.root.visible),
      "slung again",
    ).toBe(true);

    // the reload's moments: the magazine on the gun, rocked out, let fall (gone from it), the new one in her hand,
    // home — both hands at their places, within their reach, nothing through the gun
    const mag = () =>
      page.evaluate(() => {
        const P = (window as any).__revolver.person;
        const g = P.gun?.model.parts.magazine;
        const wl = P.model.bone("wristL");
        const V = wl.position.constructor;
        return {
          on: g?.visible as boolean,
          rock: (g?.rotation.z ?? 0) as number,
          inHand: g ? g.getWorldPosition(new V()).distanceTo(wl.getWorldPosition(new V())) < 0.12 : false,
          bolt: (P.akBolt ?? 0) as number,
        };
      });
    for (const [s, want] of [
      [0.15, { seen: true, rocked: false }],
      [0.45, { seen: true, rocked: true }],
      [0.6, { seen: true }],
      [0.85, { seen: false }],
      [1.05, { seen: true, hand: true }],
      [1.25, { seen: true, hand: true }],
      [1.55, { seen: true, rocked: true }],
      [1.75, { seen: true, rocked: false }],
      [1.95, { seen: true }],
      [2.1, { seen: true, rocked: false }],
    ] as const) {
      await set(page, { ...BASE, pose: "reload", t: s / 2.2 });
      await settle(page);
      const at = `reload ${s} s`;
      await held(page, at, MOVING);
      const m = await mag();
      expect(m.on, `${at}: the magazine ${want.seen ? "seen" : "gone"}`).toBe(want.seen);
      if (want.seen && "rocked" in want)
        expect(Math.abs(m.rock) > 0.1, `${at}: the magazine ${want.rocked ? "rocked" : "home"}`).toBe(!!want.rocked);
      if ("hand" in want) expect(m.inHand, `${at}: in her left hand`).toBe(true);
    }
    // run dry: her right hand off the grip to the handle, the carrier swept back, home; back on the grip
    for (const s of [1.9, 2.05, 2.15, 2.3, 2.45, 2.6, 2.75]) {
      await set(page, { ...BASE, pose: "reload", dry: true, t: s / 2.8 });
      await settle(page);
      const at = `racked ${s} s`;
      await held(page, at, MOVING);
      if (s === 2.15) expect((await mag()).bolt, `${at}: the carrier back`).toBeGreaterThan(0.5);
    }

    // a burst: a round every 0.1 s for 2 s — the hands kept on, no arm in the gun (the racked closing done and
    // the gun up first)
    await set(page, { ...BASE, pose: "aim" });
    await settle(page, 1600);
    const burst = await page.evaluate(
      () =>
        new Promise<{ R: number; L: number; arms: number }>((done) => {
          const R = (window as any).__revolver;
          let last = 0;
          const out = { R: 0, L: 0, arms: 9 };
          const t0 = performance.now();
          const tick = () => {
            const now = performance.now();
            if (now - last >= 100) {
              R.fire();
              last = now;
            }
            const c = R.check();
            if (c) {
              out.R = Math.max(out.R, c.R.short);
              out.L = Math.max(out.L, c.L?.short ?? 0);
              out.arms = Math.min(out.arms, c.arms ?? 9);
            }
            if (now - t0 < 2000) requestAnimationFrame(tick);
            else done(out);
          };
          tick();
        }),
    );
    expect(burst.R, "a burst: the right kept on").toBeLessThan(0.015);
    expect(burst.L, "a burst: the left kept on").toBeLessThan(0.015);
    expect(burst.arms, "a burst: no arm in the gun").toBeGreaterThan(-0.005);

    // kept through a roll, a vault, a slide, struck: across her chest, both hands on as held
    for (const [act, actT] of [
      ["roll", 0.2],
      ["roll", 0.5],
      ["vault", 0.4],
      ["slide", 0.4],
      ["hit", 0.1],
    ] as const) {
      await set(page, { ...BASE, act, actT });
      await settle(page);
      await held(page, `${act} ${actT}`);
    }
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
        for (const x of [-0.41, -0.2, 0, 0.2, 0.45, 0.69])
          for (const y of [-0.08, 0, 0.06]) low = Math.min(low, new V(x, y, 0).applyMatrix4(g.matrixWorld).y);
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
