/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the bench's window hooks */
import { expect, type Page } from "@playwright/test";
import { test } from "./helpers";

// Plan 84 phase 6: the Daybreak's hold checked on its bench (/dev/arms?gun=daybreak — the game's own person, the
// life Daybreak, both bodies in a t-shirt), every state of it, by plan 82's strict audit: aimed upright and on the
// look across the aim's whole reach in the game (−0.55…0.7) at any turn of her, with and without the torch, her
// right eye on the ring sight's line, the brace's pad out of her shirt; charging, leant into it; the shot's shove;
// the low ready walking and running; up from it in the gun's own time; drawn off her back by the carry handle; the
// reload on its side played live, frame by frame, standing and walking — the spent cell let fall, a new one drawn
// from the pouch on her belt, home; kept across her chest through a roll, a vault, a slide — over the floor all
// through a roll; struck, kept at the ready through the flinch, her forearms not wrung; let go sat. Everywhere:
// each hand at its place, each wrist within its reach, each forearm turned no more than ~50° (pinched thin past
// it), no hand through the other, no finger or arm in the gun. Known and left (docs/plan/84-the-daybreak.md): the
// draw's change of hold (0.62–0.85 of it), the pad pressing the shirt 1.6–2.6 cm at a few points aimed, the left
// wrist at the shove's peak aimed highest — not held to the strict limit.
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
  charge: 0,
};
// (tp/daybreak-hold.ts: the ring sight's line over the grip; the reload's 2.0 s — the cell let fall at 0.55, its
// closing at 1.6)
const SIGHT_Y = 0.115 + 0.085;
const LOAD_S = 2.0;
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
// (moving between places — the reload — a forearm's capsule against the gun's rods is rough: a few mm)
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
  // (the torch in the left fist: its fingers round it and the fore-grip)
  if (!s.torch) expect(c.grip, `${at}: fingers in the gun (${c.whereGrip})`).toBeGreaterThan(lim.grip);
  expect(c.arms, `${at}: an arm through the gun (${c.whereArms})`).toBeGreaterThan(lim.arms);
  return s;
};
const onSight = (s: Awaited<ReturnType<typeof state>>, at: string) => {
  expect(s.eye, `${at}: an eye`).not.toBeNull();
  expect(Math.abs((s.eye as number[])[1] - SIGHT_Y), `${at}: her eye at the ring's height`).toBeLessThan(0.015);
  expect(Math.abs((s.eye as number[])[2]), `${at}: her eye over the lamp's axis`).toBeLessThan(0.01);
};
// (the brace's pad: how much of it is in her — by most of six rays each way, the bench's stockIn(true); the skin
// under her shirt isn't drawn, so a point by her side can read as in her skin by rays leaving through that gap, as
// deep as the gap is far — the brace's strut 10 cm off his upper arm's bone read 12 cm in it: a skin reading past
// 5 cm is that, not her)
const pad = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__revolver.stockIn(true) as { inside: number; n: number; deep: number; pts: string[] };
    const real = s.pts.filter((p) => !(p.startsWith("body") && Number(p.split(" d")[1]) > 5));
    const deep = Math.max(0, ...real.map((p) => Number(p.split(" d")[1]) / 100));
    return { inside: real.length, n: s.n, deep };
  });

for (const gender of ["feminine", "masculine"])
  test(`the Daybreak's hold on its bench (${gender}): upright, her eye on the ring, leant into the charge, reloaded on its side, nothing through anything, kept`, async ({
    page,
  }) => {
    test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
    test.setTimeout(900_000);
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.goto(`/dev/arms?gun=daybreak&top=tee&gender=${gender}`);
    await page.waitForFunction(() => (window as any).__revolver?.ready, null, { timeout: 120_000 });
    // (a feminine finger at the fore-grip's top, held, aimed — phase 1's: known, a few mm)
    const HELD_F = gender === "feminine" ? { ...HELD, grip: -0.006 } : HELD;

    // aimed: the aim's whole reach in the game, at any turn of her, with and without the torch — the pad in her
    // shoulder's pocket, her head nearly upright, her eye on the ring's line, both hands on
    // (settled first, and longer at each new turn: the elbow's swing eases from where it was — plan 81)
    await set(page, { ...BASE, pose: "aim", pitch: -0.55 });
    await settle(page, 2500);
    for (const yaw of [0, 1.3, -2.4])
      for (const torch of [false, true])
        for (const pitch of [-0.55, -0.3, 0, 0.3, 0.7]) {
          await set(page, { ...BASE, pose: "aim", yaw, torch, pitch });
          // (the first of each turn: from aimed high at the last to aimed low here — longer: a feminine right wrist
          // read 3.4° 1.8 s in, at rest 0)
          await settle(page, pitch === -0.55 ? 3500 : 900);
          const at = `aim yaw ${yaw} pitch ${pitch}${torch ? " torch" : ""}`;
          const s = await held(page, at, HELD_F);
          expect(s.c.cant, `${at}: upright`).toBeLessThan(2 * DEG);
          expect(s.c.off, `${at}: on the look`).toBeLessThan(2 * DEG);
          onSight(s, at);
          // (the pad pressing her shirt at a few points in some turns — known: phase 1 — not deep, not much of it; read
          // again once she's settled longer: a ray through her arm can read it in her a moment)
          let p = await pad(page);
          if (p.deep >= 0.03 || p.inside > 4) {
            await settle(page, 1500);
            const q = await pad(page);
            if (q.deep < p.deep) p = q;
          }
          expect(p.inside, `${at}: the pad out of her (${p.inside}/${p.n})`).toBeLessThanOrEqual(4);
          expect(p.deep, `${at}: the pad not deep in her`).toBeLessThan(0.03);
        }

    // charging (F3a): leant into it — both hands on, every pitch; the shot's shove: the lens up, back into her
    // shoulder (its peak's left wrist aimed highest at most ~6°: known)
    for (const pitch of [-0.55, 0, 0.7]) {
      await set(page, { ...BASE, pose: "aim", pitch, charge: 1 });
      await settle(page, 1200);
      const s = await held(page, `charge pitch ${pitch}`, HELD_F);
      expect(s.c.off, `charge pitch ${pitch}: on the look`).toBeLessThan(2 * DEG);
      await set(page, { ...BASE, pose: "aim", pitch, kick: 1 });
      await settle(page, 900);
      await held(page, `shot pitch ${pitch}`, { ...MOVING, over: 6.5 * DEG });
    }

    // the low ready, both hands on, walking and running, with the torch: upright
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
      const s = await held(page, at, HELD_F);
      expect(s.c.cant, `${at}: upright`).toBeLessThan(2 * DEG);
    }

    // up from the ready in the gun's own 0.3 s (shared ARMS.daybreak.aim)
    await set(page, { ...BASE });
    await settle(page);
    const t0 = Date.now();
    await set(page, { pose: "aim" });
    await page.waitForTimeout(Math.max(0, 50 - (Date.now() - t0)));
    expect((await state(page)).c.off, "still coming up 50 ms in").toBeGreaterThan(6 * DEG);
    await page.waitForTimeout(Math.max(0, 500 - (Date.now() - t0)));
    expect((await state(page)).c.off, "up by 500 ms").toBeLessThan(2 * DEG);

    // drawn off her back by the carry handle: carried at her side as a lamp, lifted, her right on to the walnut grip
    // — (the change of hold at 0.62–0.85 of the draw, her hand rolled from the handle round the gun's side: known,
    // phase 2 — loose there); slung again
    for (const d of [0.06, 0.15, 0.3, 0.45, 0.56, 0.7, 0.8, 0.95]) {
      await set(page, { ...BASE, draw: d });
      await settle(page, 500);
      const loose = d > 0.6 && d < 0.86;
      await held(
        page,
        `draw ${d}`,
        loose ? { ...HELD, short: 0.06, over: 12 * DEG, arms: -0.035 } : { ...HELD, over: 4 * DEG },
        d >= 0.95,
      );
    }
    await set(page, { ...BASE, away: true, draw: 0 });
    await settle(page, 1200);
    expect(
      await page.evaluate(() => !!(window as any).__revolver.person.slings.get("daybreak")?.root.visible),
      "slung again",
    ).toBe(true);

    // the reload (F4a, F5a), played live and checked every frame, standing and walking: the gun at her chest rolled
    // a little, the spent cell drawn out underneath and let fall (dark), a new one from the pouch on her belt,
    // pressed home, back on the fore-grip — within the moving limits, each forearm turned no more than ~50° (rolled
    // on its side, her right was turned 72–82°)
    await set(page, { ...BASE });
    await settle(page, 1500);
    for (const move of [0, 1]) {
      await set(page, { ...BASE, move });
      await settle(page, 900);
      const log = await page.evaluate(
        async (B) => {
          const R = (window as any).__revolver;
          const P = R.person;
          const m = P.model;
          const out: any[] = [];
          let dropped = false;
          let fromPouch = false;
          R.set({ ...B, pose: "reload", play: performance.now() });
          const t0 = performance.now();
          while (performance.now() - t0 < (2.0 + 0.3) * 1000) {
            await new Promise((r) => requestAnimationFrame(r));
            const T = P.dbLoadT as number;
            if (T < 0) continue;
            const c = R.check();
            if (!c) continue;
            const tw = (S: string) => Math.abs(m.wristParts(S, m.bone(`wrist${S}`).quaternion).twist);
            dropped ||= !!P.dbDrop;
            fromPouch ||= !!P.dbPouch && !P.dbPouch.cells[0].visible && T > 0.9 && T < 1.3;
            out.push({ T, c, tL: tw("L"), tR: tw("R") });
          }
          return { out, dropped, fromPouch };
        },
        { ...BASE, move },
      );
      expect(log.out.length, `reload move ${move}: frames`).toBeGreaterThan(60);
      for (const f of log.out) {
        const at = `reload move ${move} at ${f.T.toFixed(2)} s`;
        expect(f.c.R.short, `${at}: the right at its place`).toBeLessThan(MOVING.short);
        expect(f.c.R.over, `${at}: the right wrist past its reach`).toBeLessThan(MOVING.over);
        expect(f.tR, `${at}: the right forearm turned`).toBeLessThan(MOVING.twist);
        expect(f.c.L.short, `${at}: the left at its place`).toBeLessThan(MOVING.short);
        expect(f.c.L.over, `${at}: the left wrist past its reach`).toBeLessThan(MOVING.over);
        expect(f.tL, `${at}: the left forearm turned`).toBeLessThan(MOVING.twist);
        expect(f.c.grip, `${at}: fingers in the gun (${f.c.whereGrip})`).toBeGreaterThan(MOVING.grip);
        expect(f.c.arms, `${at}: an arm through the gun (${f.c.whereArms})`).toBeGreaterThan(MOVING.arms);
      }
      expect(log.dropped, `reload move ${move}: the spent cell let fall`).toBe(true);
      expect(log.fromPouch, `reload move ${move}: a new one from the pouch`).toBe(true);
      await settle(page, 300);
      expect(
        await page.evaluate(() => {
          const cell = (window as any).__revolver.person.gun.model.parts.cell;
          return !!cell?.visible && cell.position.distanceTo(cell.userData.p0 ?? cell.position) < 1e-4;
        }),
        `reload move ${move}: the cell home`,
      ).toBe(true);
    }
    // (the pad out of her, the gun in close — at most against her shirt: a feminine one 0.6 cm into it)
    for (const sec of [0.4, 1.0, 1.4]) {
      await set(page, { ...BASE, pose: "reload", t: sec / LOAD_S });
      await settle(page, 600);
      expect((await pad(page)).deep, `reload ${sec} s: the pad not in her`).toBeLessThan(0.01);
    }

    // kept through a roll, a vault, a slide: across her chest, both hands on as held, the pad out of her
    for (const [act, actT] of [
      ["roll", 0.2],
      ["roll", 0.5],
      ["vault", 0.4],
      ["slide", 0.4],
    ] as const) {
      await set(page, { ...BASE, act, actT });
      await settle(page);
      await held(page, `${act} ${actT}`, HELD_F);
      expect((await pad(page)).deep, `${act} ${actT}: the pad not in her`).toBeLessThan(0.005);
    }
    // struck: kept at the ready, gone with her chest through the flinch — every frame of it, both hands on, each
    // forearm turned no more than ~50°
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
    // …and through a whole roll, never through the floor (the lamp's body and its lens's cage round, the pad, the
    // fore-grip's foot, the handle)
    for (let i = 1; i < 40; i++) {
      await set(page, { ...BASE, act: "roll", actT: i / 40 });
      await settle(page, 250);
      const low = await page.evaluate(() => {
        const P = (window as any).__revolver.person;
        const g = P.gun.model.root;
        g.updateWorldMatrix(true, true);
        const V = g.position.constructor;
        const pts: number[][] = [];
        for (const x of [-0.13, 0, 0.2, 0.42, 0.53])
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            const r = x > 0.42 || x < -0.02 ? 0.072 : 0.058;
            pts.push([x, 0.115 + Math.sin(a) * r, Math.cos(a) * r]);
          }
        for (const x of [-0.312, -0.29]) for (const y of [-0.065, 0.015]) pts.push([x, y, 0.035]);
        pts.push([0.27, -0.034, 0], [0.31, -0.034, 0], [0.2, 0.215, 0]);
        let low = 9;
        for (const p of pts) low = Math.min(low, new V(...p).applyMatrix4(g.matrixWorld).y);
        return low - P.root.position.y;
      });
      expect(low, `roll ${i / 40}: the gun over the floor`).toBeGreaterThan(0);
    }
    // sat: let go of — in her right hand, on her lap
    await set(page, { ...BASE, act: "sit" });
    await settle(page, 2500);
    expect((await state(page)).c, "sat: still in her hand").not.toBeNull();
    const heldW = await page.evaluate(() => (window as any).__revolver.person.revW as number);
    expect(heldW, "sat: the hold let go").toBeLessThan(0.1);
  });
