/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect } from "@playwright/test";
import { BIA, enter, test, token } from "./helpers";

// Drawn merged, drawn as before: the same picture (docs/plan/38-the-lag.md, round 4).
//
// Each floor is drawn merged an area at a time (World3), its loose pieces left out an area
// at a time when out of view, the parked cars out of view left out, the games' still
// pieces merged. `tp.setUnmerged(true)` draws it all the old way, piece by piece. Every
// camera is rendered both ways in the same frame and compared pixel by pixel.
//
// What may differ, and only that:
// - a pixel where two opaque faces lie in the same plane (a window's frame flush with its
//   wall): the old way, whichever piece three drew last won it, and that order changes with
//   the camera — the same frame drawn the old way with the ties broken the other way round
//   (two other orders) changes those pixels too; anything else fails;
// - with glass and ink merged (World3.setMergeClear, on in the game: the user's call),
//   overlapping see-through pieces blend in the merged order: a few pixels, bounded below.
//
// It measures the dev world as it is (no fixture: the dev world is played in), as Bia —
// teleports only. Needs the machine's GPU: YUTOPIA_GPU=1. YUTOPIA_AB_CAMERAS per spot (10).

const GPU = process.env.YUTOPIA_GPU === "1";
const PER = Number(process.env.YUTOPIA_AB_CAMERAS ?? 10);
test.use({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
});

const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 }); // (the Grounds' offset)
const SPOTS = [
  { x: 17.5, y: 14.5, level: 4 }, // the Tracking Room
  { x: 6.5, y: 28.5, level: 4 }, // by the stairs, walls all round (fades)
  { x: 34, y: 28, level: 4 }, // the Live Room
  { x: 30.5, y: 20.5, level: 2 },
  { x: 11.5, y: 27.5, level: 2 },
  { x: 30.5, y: 20.5, level: 0 },
  { ...G(-30, 20), level: 0 }, // the car park (the parked cars)
];

interface Cam {
  i: number;
  faded: number;
  differ: number; // pixels not the same as the old way
  notTie: number; // …of those, not explained by the old way's own draw order
  big: number; // …of those, more than 48 levels off
}

// in the page: `per` cameras round where I am, each drawn both ways in one frame
async function sweep(page: any, per: number, seed: number): Promise<Cam[]> {
  return page.evaluate(
    async ({ per, seed }: { per: number; seed: number }) => {
      const c = (window as any).__yutopia;
      const tp = c.tp;
      const r = tp.renderer;
      const gl = r.getContext();
      let z = seed;
      const rnd = () => {
        z = (z * 1103515245 + 12345) % 2147483648;
        return z / 2147483648;
      };
      c.updateNight = () => {};
      if (c.life) c.life.weather = () => [0, 0];
      const W = r.domElement.width;
      const H = r.domElement.height;
      const read = () => {
        const px = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
      };
      const shot = () => {
        tp.cullBelow();
        try {
          if (tp.post) tp.post.render(false);
          else r.render(tp.scene, tp.camera);
        } finally {
          tp.below3.end();
        }
        return read();
      };
      const keys = (a: any, b: any) =>
        a.groupOrder !== b.groupOrder
          ? a.groupOrder - b.groupOrder
          : a.renderOrder !== b.renderOrder
            ? a.renderOrder - b.renderOrder
            : a.material.id !== b.material.id
              ? a.material.id - b.material.id
              : 0;
      const out: Cam[] = [];
      for (let i = 0; i < per; i++) {
        const hour = i % 2 ? 21.5 : 13;
        c.hour = hour;
        c.engine?.setClock(hour);
        tp.setHour(hour);
        const free = i % 2 === 1;
        tp.yaw = rnd() * Math.PI * 2;
        tp.dragged = 1e12;
        tp.pitch = 0.1 + rnd() * 0.9;
        tp.dist = 2 + rnd() * 9;
        for (let k = 0; k < 14; k++) c.frame(1 / 30, performance.now()); // (fades settle)
        let faded = 0;
        for (const f of tp.world.fades) if (f.alpha < 0.999) faded++;
        const m = tp.world.map;
        const o = tp.world.root.position;
        const pose = free
          ? {
              p: [o.x + rnd() * m.width, o.y + 0.5 + rnd() * (rnd() < 0.3 ? 30 : 3), o.z + rnd() * m.height],
              t: [o.x + rnd() * m.width, o.y + rnd() * 2, o.z + rnd() * m.height],
            }
          : null;
        out.push(
          await new Promise<Cam>((done) => {
            const fr = tp.frame;
            tp.frame = (...a: unknown[]) => {
              const x = fr.apply(tp, a);
              tp.frame = fr;
              const cam = tp.camera;
              if (pose) {
                cam.position.fromArray(pose.p);
                cam.lookAt(pose.t[0], pose.t[1], pose.t[2]);
                cam.updateMatrixWorld(true);
              }
              const A = shot();
              tp.setUnmerged(true);
              const B = shot();
              r.setOpaqueSort((a: any, b: any) => keys(a, b) || (a.z !== b.z ? b.z - a.z : b.id - a.id));
              const B2 = shot();
              r.setOpaqueSort((a: any, b: any) => keys(a, b) || b.id - a.id);
              const B3 = shot();
              r.setOpaqueSort(null);
              tp.setUnmerged(false);
              const same = (X: Uint8Array, Y: Uint8Array, j: number) =>
                X[j] === Y[j] && X[j + 1] === Y[j + 1] && X[j + 2] === Y[j + 2];
              let differ = 0;
              let notTie = 0;
              let big = 0;
              for (let j = 0; j < A.length; j += 4) {
                if (same(A, B, j)) continue;
                differ++;
                const tie = !same(B, B2, j) || !same(B, B3, j) || same(A, B2, j) || same(A, B3, j);
                if (tie) continue;
                notTie++;
                if (Math.max(Math.abs(A[j] - B[j]), Math.abs(A[j + 1] - B[j + 1]), Math.abs(A[j + 2] - B[j + 2])) > 48)
                  big++;
              }
              done({ i, faded, differ, notTie, big });
              return x;
            };
          }),
        );
      }
      return out;
    },
    { per, seed },
  );
}

test.describe("drawn merged", () => {
  test.skip(!GPU, "needs the machine's GPU (YUTOPIA_GPU=1)");

  test("the same picture as piece by piece", async ({ page }) => {
    test.setTimeout(30 * 60_000);
    await page.addInitScript(() => {
      const k = "yutopia:prefs";
      const p = JSON.parse(localStorage.getItem(k) ?? "{}");
      localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", last3d: "3p", cam3p: "chase", quality: "high" }));
    });
    await enter(page, await token(BIA));
    await page.waitForFunction(() => !!(window as any).__yutopia?.tp, null, { timeout: 90_000 });
    const pixels = 1280 * 720;
    let seed = 7;
    let fades = 0;
    for (const at of SPOTS) {
      await page.evaluate((p) => (window as any).__yutopia.teleport(p), at);
      await page.waitForFunction(
        (p) => {
          const t = (window as any).__yutopia.meTile();
          return Math.hypot(t.x - p.x, t.y - p.y) < 2 && (window as any).__yutopia.level === p.level;
        },
        at,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(5000);
      // glass and ink drawn apart: only ties may differ
      await page.evaluate(() => (window as any).__yutopia.tp.setMergeClear(false));
      const exact = await sweep(page, PER, seed);
      // glass and ink merged (as in the game): a few blended pixels, nothing gone or added
      await page.evaluate(() => (window as any).__yutopia.tp.setMergeClear(true));
      const merged = await sweep(page, PER, seed);
      seed++;
      for (const cam of exact) {
        fades += cam.faded ? 1 : 0;
        expect(cam.notTie, `${JSON.stringify(at)} camera ${cam.i}: not a draw-order tie`).toBe(0);
      }
      for (const cam of merged) {
        expect(cam.differ, `${JSON.stringify(at)} camera ${cam.i}: pixels differing`).toBeLessThan(pixels * 0.01);
        expect(cam.big, `${JSON.stringify(at)} camera ${cam.i}: pixels far off`).toBeLessThan(pixels * 0.0002);
      }
    }
    // (the fades were exercised: some cameras stood behind walls)
    expect(fades).toBeGreaterThan(0);
  });
});
