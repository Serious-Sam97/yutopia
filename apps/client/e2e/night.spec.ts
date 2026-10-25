/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token, walkTo } from "./helpers";

// The Grounds' mood (docs/plan/27-the-grounds.md, phase 5), with two people:
// the same storm at the same moment for both (the server times it), and at
// night A's flashlight lights B out in the woods. It needs only the building
// (every world has it), so no fixture is put back; the storm goes back to the
// schedule at the end.

// the ground floor's corner is at (-60, -10) in the studio's coords
const G = (x: number, y: number) => ({ x: x + 60, y: y + 10 });

async function open(page: Page, who: typeof ANA) {
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "iso" }));
  });
  await enter(page, await token(who));
}
// (out on the land: the Grounds are mounted on the ground floor)
const goTo = async (page: Page, at: { x: number; y: number }) => {
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at);
  await page.waitForFunction(() => (window as any).__yutopia.engine?.grounds?.land.visible, null, { timeout: 60_000 });
  await page.waitForTimeout(2500);
};
const storm = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__yutopia;
    return { server: c.room.state.storm as number, here: c.storm as number };
  });

test("the mood: the same storm for both at once; A's flashlight lights B at night", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const a = page;
  const b = await (await browser.newContext()).newPage();
  await open(a, ANA);
  await open(b, BIA);
  try {
    // ── a storm called up (an admin): both in it, together ──
    await a.evaluate(() => (window as any).__yutopia.room.send("mod:storm", { storm: 1, now: true }));
    await a.waitForFunction(() => (window as any).__yutopia.room.state.storm > 0.99, null, { timeout: 10_000 });
    await b.waitForFunction(() => (window as any).__yutopia.room.state.storm > 0.99, null, { timeout: 10_000 });
    // (each eases into it; once in, the same)
    await a.waitForTimeout(1500);
    const [sa, sb] = [await storm(a), await storm(b)];
    expect(sa.here, "A is in the storm").toBeGreaterThan(0.95);
    expect(sb.here, "B is in the storm").toBeGreaterThan(0.95);
    // and sent off: both out of it
    await a.evaluate(() => (window as any).__yutopia.room.send("mod:storm", { storm: 0, now: true }));
    await b.waitForFunction(() => (window as any).__yutopia.room.state.storm < 0.01, null, { timeout: 10_000 });

    // ── night in the woods: A a few steps from B, turned to her, the flashlight on ──
    // (along a screen axis — iso faces eight ways on screen: B straight below A)
    await goTo(b, G(-150, 6));
    await goTo(a, G(-155, 1));
    await walkTo(a, G(-154, 2).x, G(-154, 2).y, 20_000);
    for (const p of [a, b])
      await p.evaluate(() => {
        const c = (window as any).__yutopia;
        c.updateNight = () => {};
        c.engine.setClock(23);
      });
    const lightOnB = () =>
      b.evaluate(() => {
        const c = (window as any).__yutopia;
        const m = c.meTile();
        const g = c.engine.grounds;
        // her light, and the light a few steps to her side (off the beam)
        return { on: g.lightAt(m.x + 0.5, m.y + 0.5), off: g.lightAt(m.x + 0.5, m.y + 6.5) };
      });
    const lum = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.55 + (c & 255) * 0.15;
    const dark = await lightOnB();
    expect(lum(dark.on), "no beam: she's in the dark as the woods round her").toBeLessThan(lum(dark.off) + 4);
    await a.evaluate(() => (window as any).__yutopia.toggleTorch());
    await b.waitForFunction(
      () => {
        const c = (window as any).__yutopia;
        return [...c.room.state.players.values()].some((p: any) => p.torch);
      },
      null,
      { timeout: 10_000 },
    );
    await b.waitForTimeout(500);
    const lit = await lightOnB();
    expect(lum(lit.on), "A's beam lights her").toBeGreaterThan(lum(dark.on) + 40);
    expect(lum(lit.off), "beside the beam: still dark").toBeLessThan(lum(dark.off) + 4);
    if (process.env.YUTOPIA_SHOTS) await b.screenshot({ path: `${process.env.YUTOPIA_SHOTS}/night-beam.png` });
  } finally {
    await a.evaluate(() => {
      const c = (window as any).__yutopia;
      c.room?.send("mod:storm", { storm: null, now: true });
      if (c.room?.state.players.get(c.room.sessionId)?.torch) c.toggleTorch();
    });
  }
});

// ── the pitch dark (docs/plan/44-the-night.md, phase 5) ──
// In 3D, on the machine's GPU: what the view draws, measured from its own renderer.
const open3 = async (page: Page, who: typeof ANA) => {
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "chase" }));
  });
  await enter(page, await token(who));
  await page.waitForFunction(() => !!(window as any).__yutopia?.tp, null, { timeout: 60_000 });
};
/** The clock held (its 1 s timer would set it back), no storm. */
const hold = (page: Page, h: number) =>
  page.evaluate((hh) => {
    const c = (window as any).__yutopia;
    c.updateNight = () => {};
    c.hour = hh;
    c.engine.setClock(hh);
    c.tp?.setHour(hh);
    if (c.life) c.life.weather = () => [0, 0];
  }, h);
/** The mean luminance (0 … 1) of a frame drawn from a camera of my own (the floor's coords; the
 *  3D view's renderer, no post), over the frame's middle half. */
const meanFrom = (page: Page, from: number[], to: number[]) =>
  page.evaluate(
    async ([f, a]) => {
      const tp = (window as any).__yutopia.tp;
      const cam = tp.camera.clone();
      cam.position.set(f[0], f[1], f[2]);
      cam.lookAt(a[0], a[1], a[2]);
      cam.updateMatrixWorld();
      tp.renderer.render(tp.scene, cam);
      const img = new Image();
      img.src = tp.renderer.domElement.toDataURL("image/png");
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 160;
      c.height = 90;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      g.drawImage(img, 0, 0, 160, 90);
      const d = g.getImageData(40, 22, 80, 46).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15;
      return s / (d.length / 4) / 255;
    },
    [from, to],
  );

test("the pitch dark: black off every light, lit in a beam; a name only in the light", async ({ page, browser }) => {
  test.skip(process.env.YUTOPIA_GPU !== "1", "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(240_000);
  const a = page;
  await open3(a, ANA);
  await hold(a, 23);
  // the lawn, the floor's (-40, -30): nothing lit round it
  await a.evaluate(() => (window as any).__yutopia.teleport({ x: -40, y: -30, level: 0 }));
  await a.waitForFunction(() => (window as any).__yutopia.engine?.grounds?.land.visible, null, { timeout: 60_000 });
  await hold(a, 23);
  await a.waitForTimeout(3000);
  // the snow 15 tiles off, looked at from above it: as good as black
  const off = await meanFrom(a, [-55, 3, -45], [-62, 0, -52]);
  expect(off, "off every light: under 3%").toBeLessThan(0.03);
  // her torch on: the snow it lands on, from behind her
  await a.evaluate(() => (window as any).__yutopia.toggleTorch());
  const b = await (await browser.newContext()).newPage();
  try {
    await a.waitForTimeout(1500);
    const beam = (await a.evaluate(() => {
      const c = (window as any).__yutopia;
      const t = c.tp.torch3.find((x: any) => x.on && x.who === c.room.sessionId);
      return t ? { x: t.on.x, y: t.on.y, yaw: t.on.yaw } : null;
    })) as { x: number; y: number; yaw: number } | null;
    expect(beam, "her torch on").toBeTruthy();
    const B = beam as { x: number; y: number; yaw: number };
    const along = (k: number, side: number) => ({
      x: B.x + Math.cos(B.yaw) * k - Math.sin(B.yaw) * side,
      y: B.y + Math.sin(B.yaw) * k + Math.cos(B.yaw) * side,
    });
    const behind = along(-3, 0);
    const spot = along(5, 0);
    const lit = await meanFrom(a, [behind.x, 2.4, behind.y], [spot.x, 0, spot.y]);
    expect(lit, "the beam's snow: lit").toBeGreaterThan(Math.max(0.06, off * 2.5));
    // Bia off the beam, then in it: her name only in the light
    await open3(b, BIA);
    await hold(b, 23);
    const bid = await b.evaluate(() => (window as any).__yutopia.room.sessionId as string);
    const named = () =>
      a.evaluate((id) => {
        const tp = (window as any).__yutopia.tp;
        const t = tp.tagEls.get(id);
        const pill = t?.name.parentElement as HTMLElement | undefined;
        return {
          unseen: tp.isUnseen(id),
          name: !!pill && pill.style.display !== "none" && t.root.style.display !== "none",
        };
      }, bid);
    await b.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), along(6, 8));
    await expect.poll(named, { timeout: 10_000 }).toEqual({ unseen: true, name: false });
    await b.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), along(6, 0));
    await expect.poll(named, { timeout: 10_000 }).toEqual({ unseen: false, name: true });
  } finally {
    await a.evaluate(() => {
      const c = (window as any).__yutopia;
      if (c.room?.state.players.get(c.room.sessionId)?.torch) c.toggleTorch();
    });
    await b.context().close();
  }
});
