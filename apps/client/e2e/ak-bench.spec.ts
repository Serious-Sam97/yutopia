/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the bench's window hooks */
import { expect, type Page } from "@playwright/test";
import { test } from "./helpers";

// Plan 82 phase 6: the AK's hold checked on its bench (/dev/arms?gun=ak47 — the game's own person, the life AK,
// both bodies in a t-shirt): aimed upright and on the look at every pitch and every turn of her, with and
// without the torch, her eye on the sights (the cheek on the stock); no hand through the other, no finger in
// the gun, no arm in it, each wrist at its place, the forearms never turned past 50° (pinched thin); the low
// ready walking and running, both hands on; up from it in the gun's own time; drawn off her back; the reload's
// moments (the empty out and let fall, the pouch, the new one home; run dry, the handle racked); a burst; kept
// across her chest through a roll, a vault, struck; let go sat. 3D: the GPU (YUTOPIA_GPU=1).
const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const DEG = Math.PI / 180;

const set = (page: Page, s: Record<string, unknown>) => page.evaluate((s) => (window as any).__revolver.set(s), s);
const check = (page: Page) => page.evaluate(() => (window as any).__revolver.check());
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
// (each forearm's turn, rad — PersonModel.wristParts; and her right eye in the gun's frame, m)
const arms = (page: Page) =>
  page.evaluate(() => {
    const P = (window as any).__revolver.person;
    const m = P.model;
    const tw = (S: string) => Math.abs(m.wristParts(S, m.bone(`wrist${S}`).quaternion).twist);
    const g = P.gun?.model.root;
    let eye: number[] | null = null;
    const e = m.root.getObjectByName("eyeR");
    if (g && e) {
      g.updateWorldMatrix(true, false);
      const p = e.getWorldPosition(new g.position.constructor()).applyMatrix4(g.matrixWorld.clone().invert());
      eye = [p.x, p.y, p.z];
    }
    return { L: tw("L"), R: tw("R"), eye };
  });

for (const gender of ["feminine", "masculine"])
  test(`the AK's hold on its bench (${gender}): upright, on the look, cheek on the stock, nothing through anything, drawn, reloaded, kept`, async ({
    page,
  }) => {
    test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
    test.setTimeout(480_000);
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.goto(`/dev/arms?gun=ak47&top=tee&gender=${gender}`);
    await page.waitForFunction(() => (window as any).__revolver?.ready, null, { timeout: 120_000 });

    // aimed: every pitch, every turn of her, with and without the torch — the butt in the shoulder, her eye on the
    // sights, both hands on
    for (const yaw of [0, 1.3, -2.4])
      for (const torch of [false, true])
        for (const pitch of [-0.9, -0.3, 0.3, 0.9]) {
          await set(page, { ...BASE, pose: "aim", yaw, torch, pitch });
          await settle(page, 900);
          const c = await check(page);
          const a = await arms(page);
          const at = `yaw ${yaw} pitch ${pitch}${torch ? " torch" : ""}`;
          expect(c, at).not.toBeNull();
          expect(c.cant, `${at}: upright`).toBeLessThan(2 * DEG);
          expect(c.off, `${at}: on the look`).toBeLessThan(2 * DEG);
          expect(c.R.short, `${at}: the right on the pistol grip`).toBeLessThan(0.015);
          // (aimed nearly straight up, the gun up to her face for the cheek: her left hand a little short)
          expect(c.L.short, `${at}: the left under the receiver`).toBeLessThan(Math.abs(pitch) >= 0.9 ? 0.02 : 0.015);
          expect(c.hands, `${at}: a hand through a hand (${c.where})`).toBeGreaterThan(-0.003);
          // (the torch in the left fist: its fingers round it and the receiver)
          if (!torch) expect(c.grip, `${at}: fingers in the gun (${c.whereGrip})`).toBeGreaterThan(-0.005);
          expect(c.arms, `${at}: an arm through the gun`).toBeGreaterThan(-0.005);
          // (gripTo minds a turn past 50° — the life forearm pinches thin from ~60°)
          expect(a.L, `${at}: the left forearm turned`).toBeLessThan(55 * DEG);
          expect(a.R, `${at}: the right forearm turned`).toBeLessThan(55 * DEG);
          // (her right eye on the sight line: over the bore, at the sights' height — tp/ak-hold.ts cheek)
          expect(a.eye, `${at}: an eye`).not.toBeNull();
          expect(Math.abs((a.eye as number[])[1] - 0.106), `${at}: her eye at the sights' height`).toBeLessThan(0.025);
          expect(Math.abs((a.eye as number[])[2]), `${at}: her eye over the bore`).toBeLessThan(0.02);
        }

    // the low ready, both hands on, walking and running, with the torch: upright, square
    for (const [yaw, move, torch] of [
      [0, 0, false],
      [-1.6, 1, false],
      [2.6, 3, false],
      [0.7, 1, true],
    ] as const) {
      await set(page, { ...BASE, yaw, move, torch });
      await settle(page);
      const c = await check(page);
      const a = await arms(page);
      const at = `ready yaw ${yaw} move ${move}${torch ? " torch" : ""}`;
      expect(c.cant, `${at}: upright`).toBeLessThan(2 * DEG);
      expect(c.arms, `${at}: an arm through the gun`).toBeGreaterThan(-0.005);
      expect(c.R.short, `${at}: the right on the pistol grip`).toBeLessThan(0.015);
      expect(c.L.short, `${at}: the left under the receiver`).toBeLessThan(0.015);
      expect(a.L, `${at}: the left forearm turned`).toBeLessThan(52 * DEG);
      expect(a.R, `${at}: the right forearm turned`).toBeLessThan(55 * DEG);
    }

    // up from the ready in the gun's own 0.24 s (shared ARMS.ak47.aim)
    await set(page, { ...BASE });
    await settle(page);
    const t0 = Date.now();
    await set(page, { pose: "aim" });
    await page.waitForTimeout(Math.max(0, 50 - (Date.now() - t0)));
    expect((await check(page)).off, "still coming up 50 ms in").toBeGreaterThan(6 * DEG);
    await page.waitForTimeout(Math.max(0, 420 - (Date.now() - t0)));
    expect((await check(page)).off, "up by 420 ms").toBeLessThan(2 * DEG);

    // drawn off her back: its start where it hangs slung, then down her right side to the hold
    const gunToSlung = () =>
      page.evaluate(() => {
        const P = (window as any).__revolver.person;
        const g = P.gun?.model.root;
        const chest = P.model.bone("chest");
        if (!g || !chest) return 9;
        const V = g.position.constructor;
        // (tp/ak-hold.ts AK_SLUNG: the slung gun's grip in the chest bone's space)
        return g.getWorldPosition(new V()).distanceTo(chest.localToWorld(new V(-0.1, -0.13, -0.14)));
      });
    await set(page, { ...BASE, draw: 0.02 });
    await settle(page);
    expect(await gunToSlung(), "drawn from where it's slung").toBeLessThan(0.04);
    await set(page, { ...BASE, draw: 1 });
    await settle(page);
    expect(await gunToSlung(), "drawn off her back").toBeGreaterThan(0.3);
    // (put away: slung on her back again, for everyone — Player.slingAk)
    await set(page, { ...BASE, away: true, draw: 0 });
    await settle(page, 1200);
    expect(
      await page.evaluate(() => !!(window as any).__revolver.person.slings.get("ak47")?.root.visible),
      "slung again",
    ).toBe(true);

    // the reload's moments: the magazine on the gun, rocked out, let fall (gone from it), the new one in her hand,
    // home; her left hand at its place throughout, its forearm within 52°; run dry, the handle racked back
    const state = () =>
      page.evaluate(() => {
        const P = (window as any).__revolver.person;
        const mag = P.gun?.model.parts.magazine;
        const m = P.model;
        const wl = m.bone("wristL");
        const V = wl.position.constructor;
        return {
          on: mag?.visible as boolean,
          rock: (mag?.rotation.z ?? 0) as number,
          inHand: mag ? mag.getWorldPosition(new V()).distanceTo(wl.getWorldPosition(new V())) < 0.12 : false,
          L: m.gripLeft.L.short as number,
          tw: Math.abs(m.wristParts("L", wl.quaternion).twist) as number,
          bolt: (P.akBolt ?? 0) as number,
        };
      });
    for (const [s, want] of [
      [0.15, { seen: true, rocked: false }],
      [0.45, { seen: true, rocked: true }],
      [0.85, { seen: false, rocked: false }],
      [1.2, { seen: true, hand: true }],
      [1.55, { seen: true, rocked: true }],
      [2.1, { seen: true, rocked: false }],
    ] as const) {
      await set(page, { ...BASE, pose: "reload", t: s / 2.2 });
      await settle(page);
      const st = await state();
      const at = `reload ${s} s`;
      expect(st.on, `${at}: the magazine ${want.seen ? "seen" : "gone"}`).toBe(want.seen);
      if (want.seen && "rocked" in want)
        expect(Math.abs(st.rock) > 0.1, `${at}: the magazine ${want.rocked ? "rocked" : "home"}`).toBe(!!want.rocked);
      if ("hand" in want) expect(st.inHand, `${at}: in her left hand`).toBe(true);
      expect(st.L, `${at}: the left at its place`).toBeLessThan(0.02);
      expect(st.tw, `${at}: the left forearm turned`).toBeLessThan(52 * DEG);
    }
    // (run dry: the closing racks the handle — its carrier back mid-way)
    await set(page, { ...BASE, pose: "reload", dry: true, t: 2.18 / 2.8 });
    await settle(page);
    const rk = await state();
    expect(rk.bolt, "racked: the carrier back").toBeGreaterThan(0.5);
    expect(rk.tw, "racked: the left forearm turned").toBeLessThan(52 * DEG);

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

    // kept through a roll, a vault, a slide, struck: across her chest, both hands on, no arm through it
    for (const [act, actT] of [
      ["roll", 0.4],
      ["vault", 0.4],
      ["slide", 0.4],
      ["hit", 0.1],
    ] as const) {
      await set(page, { ...BASE, act, actT });
      await settle(page);
      const c = await check(page);
      expect(c.R.short, `${act}: the right on the pistol grip`).toBeLessThan(0.02);
      expect(c.L.short, `${act}: the left on the receiver`).toBeLessThan(0.02);
      expect(c.arms, `${act}: an arm through the gun`).toBeGreaterThan(-0.005);
    }
    // sat: let go of — in her right hand, on her lap
    await set(page, { ...BASE, act: "sit" });
    await settle(page, 2500);
    expect(await check(page), "sat: still in her hand").not.toBeNull();
    const held = await page.evaluate(() => (window as any).__revolver.person.revW as number);
    expect(held, "sat: the hold let go").toBeLessThan(0.1);
  });
