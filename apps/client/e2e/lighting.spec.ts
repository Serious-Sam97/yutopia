/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, walkTo } from "./helpers";

// The 3D view's light and shadows (tp/view.ts, light3d.ts, post3d.ts): no GL
// errors (a failed draw is a thing missing from the screen), the lamps' lights
// fading rather than popping, the camera never ending up outside the building
// looking at its glass, the light going smoothly through the day. It needs only
// the building — its floors, the lot, the lamp posts — which every world has,
// so it enters the world as it is (no fixture put back). The day's brightness
// is measured on the machine's GPU (YUTOPIA_GPU=1); opt-in review shots of
// every floor and the lot by the hour: YUTOPIA_SHOTS=<dir>.
const GPU = process.env.YUTOPIA_GPU === "1";
const dir = process.env.YUTOPIA_SHOTS;
if (GPU || dir) test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

// the ground floor's corner is at (-60, -10) in the studio's coords
const LOT = { x: 38, y: 24, level: 0 }; // (the lot's aisle E: docs/plan/42-the-lot.md)

async function open3p(page: Page) {
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
    // every failed draw counted (the console stops reporting them after 256)
    const W = window as any;
    W.__glErrors = 0;
    const get = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as any).getContext = function (type: string, ...a: unknown[]) {
      const gl = get.call(this, type as "webgl2", ...(a as [])) as any;
      if (!gl || type !== "webgl2" || gl.__counted) return gl;
      gl.__counted = true;
      for (const fn of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
        const draw = gl[fn].bind(gl);
        gl[fn] = (...x: unknown[]) => {
          draw(...x);
          if (gl.getError()) W.__glErrors++;
        };
      }
      return gl;
    };
  });
  await enter(page, await token(ANA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  // the hour held where the test puts it (it follows the clock)
  await page.evaluate(() => {
    (window as any).__yutopia.updateNight = () => {};
  });
}

const goTo = async (page: Page, at: { x: number; y: number; level: number }) => {
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), at);
  await page.waitForFunction((l) => (window as any).__yutopia.level === l, at.level, { timeout: 20_000 });
  await page.waitForTimeout(1500);
};

const look = (page: Page, v: { hour: number; yaw: number; pitch: number; dist: number }) =>
  page.evaluate((v) => {
    const tp = (window as any).__yutopia.tp;
    tp.setHour(v.hour);
    tp.yaw = v.yaw;
    tp.dragged = 1e12; // (held: the chase camera doesn't swing in behind)
    tp.pitch = v.pitch;
    tp.dist = v.dist;
  }, v);

test("no GL errors: loading, every quality, every floor, day and night", async ({ page }) => {
  test.setTimeout(120_000);
  await open3p(page);
  await page.waitForTimeout(2000);
  for (const q of ["medium", "low", "high"]) {
    await page.evaluate((q) => (window as any).__yutopia.tp.setQuality(q), q);
    await page.waitForTimeout(800);
  }
  for (const at of [LOT, { x: 16, y: 12, level: 2 }, { x: 16, y: 12, level: 4 }]) {
    await goTo(page, at);
    for (const hour of [3, 12, 19.5]) {
      await look(page, { hour, yaw: 0.8, pitch: 0.5, dist: 7 });
      await page.waitForTimeout(400);
    }
  }
  expect(await page.evaluate(() => (window as any).__glErrors)).toBe(0);
});

test("the lot's lamps fade in and out as you walk by at night, never pop", async ({ page }) => {
  test.setTimeout(120_000);
  await open3p(page);
  await goTo(page, LOT);
  await look(page, { hour: 22, yaw: 0, pitch: 0.6, dist: 7 });
  await page.evaluate(() => {
    const W = window as any;
    W.__lamps = [];
    const tick = () => {
      const tp = W.__yutopia.tp;
      W.__lamps.push({ at: [tp.target.x, tp.target.z], on: tp.pool.map((p: any) => p.intensity) });
      if (W.__lamps.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await walkTo(page, 38, 44, 8000).catch(() => {});
  await walkTo(page, 19, 30, 8000).catch(() => {});
  const frames: { at: number[]; on: number[] }[] = await page.evaluate(() => (window as any).__lamps);
  expect(frames.length).toBeGreaterThan(60);
  expect(Math.max(...frames.flatMap((f) => f.on))).toBeGreaterThan(0.2); // (the lamps are on)
  // a frame's change in all the lamps' light together, against how far you
  // went in it: a fade (over a few tiles) changes with the walking; a lamp
  // switched on or off whole was its full strength (~0.8) at once, however
  // little you'd moved (a slow software GPU walks further a frame)
  // (in a lamp's full strengths: the lamps grew brighter in the pitch dark — docs/plan/44 — and a
  // fade's steps with them; what's measured is a whole lamp at once against a step of its fade)
  const full = Math.max(...frames.flatMap((f) => f.on)) / 0.8;
  const sum = (f: number[]) => f.reduce((a, b) => a + b, 0) / full;
  let over = 0;
  for (let i = 1; i < frames.length; i++) {
    const moved = Math.hypot(frames[i].at[0] - frames[i - 1].at[0], frames[i].at[1] - frames[i - 1].at[1]);
    const jump = Math.abs(sum(frames[i].on) - sum(frames[i - 1].on));
    over = Math.max(over, jump - (0.1 + 0.35 * moved));
  }
  expect(over).toBeLessThanOrEqual(0);
});

test("by an outer wall, the camera stays in the building (it doesn't look at its glass from outside)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await open3p(page);
  // floor 2, by its west wall (x = 0), the camera swung round behind you through it
  await goTo(page, { x: 1.5, y: 8, level: 2 });
  await look(page, { hour: 12, yaw: 0, pitch: 0.5, dist: 6 });
  await page.waitForTimeout(1200);
  const cam = await page.evaluate(() => {
    const tp = (window as any).__yutopia.tp;
    return { x: tp.camera.position.x, y: tp.camera.position.y };
  });
  // inside the wall, or up over it (above the storey's walls: it looks down in)
  expect(cam.x > 0 || cam.y > 3.4).toBeTruthy();
});

test("the light goes smoothly through the day (GPU)", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(300_000);
  await open3p(page);
  const mean = async () => {
    const png = (await page.screenshot({ clip: { x: 0, y: 80, width: 1280, height: 560 } })).toString("base64");
    return page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 160;
      c.height = 70;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      g.drawImage(img, 0, 0, 160, 70);
      const d = g.getImageData(0, 0, 160, 70).data;
      const rgb = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) rgb[k] += d[i + k];
      return rgb.map((v) => v / (d.length / 4));
    }, png);
  };
  for (const at of [LOT, { x: 10, y: 10, level: 2 }]) {
    await goTo(page, at);
    let last: number[] | null = null;
    let worst = 0;
    for (let h = 0; h < 24; h += 0.5) {
      await look(page, { hour: h, yaw: 1.6, pitch: 0.5, dist: 7 });
      await page.waitForTimeout(250);
      const v = await mean();
      if (last) worst = Math.max(worst, ...v.map((x, k) => Math.abs(x - (last as number[])[k])));
      last = v;
    }
    // half an hour's change in the screen's mean colour (0..255): the steepest,
    // at dusk, ~30; a jump (a light popping, the sun flipping over) is far more
    expect(worst, `floor ${at.level}`).toBeLessThan(45);
  }
});

test("review shots: every floor and the lot by the hour", async ({ page }) => {
  test.skip(!dir, "opt-in: YUTOPIA_SHOTS=<dir>");
  test.setTimeout(300_000);
  await open3p(page);
  const spots = [
    { n: "lot", ...LOT, yaw: 0, pitch: 0.5, dist: 9 },
    { n: "lobby", x: 64.5, y: 22, level: 0, yaw: 3.1, pitch: 0.5, dist: 7 },
    { n: "floor1", x: 10, y: 10, level: 1, yaw: 1.6, pitch: 0.5, dist: 7 },
    { n: "floor2-stairs", x: 6, y: 19, level: 2, yaw: 4.7, pitch: 0.9, dist: 7 },
    { n: "floor3", x: 10, y: 10, level: 3, yaw: 1.6, pitch: 0.5, dist: 7 },
    { n: "studio", x: 20, y: 12, level: 4, yaw: 3.1, pitch: 0.5, dist: 7 },
  ];
  for (const s of spots) {
    await goTo(page, s);
    for (const hour of [3, 7, 12, 17.5, 19.5, 22]) {
      await look(page, { hour, yaw: s.yaw, pitch: s.pitch, dist: s.dist });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${dir}/light-${s.n}-${String(hour).replace(".", "h")}.png` });
    }
  }
});
