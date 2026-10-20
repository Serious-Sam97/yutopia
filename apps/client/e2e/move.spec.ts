/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, enter, test, token, useWorld } from "./helpers";

// The verbs in the world (docs/plan/29-the-move.md, phase 4): running at a
// desk across its short side and jumping vaults it; at an arcade cabinet
// (1.38 up), climbs onto it; Q rolls; C crouches (and sprinting, slides) — the
// server takes all of it (never puts me back) and everyone sees what I did
// (Player.jump, Player.mv). 3D: run it with the GPU (YUTOPIA_GPU=1).

const GPU = process.env.YUTOPIA_GPU === "1";
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const me = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    const b = w.walker.body;
    return { x: b.x as number, y: b.y as number, z: b.z as number, up: b.up as boolean, verb: b.verb?.kind as string };
  });
const server = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    const p = w.room.state.players.get(w.room.sessionId);
    return { jump: p.jump as string, mv: p.mv as number, x: p.x as number, y: p.y as number, z: p.z as number };
  });

test("the verbs: a vault over a desk, onto an arcade, a roll, crouching and a slide", async ({ page }) => {
  test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
  test.setTimeout(180_000);
  const lab = await useWorld("lab");
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", last3d: "3p", cam3p: "chase", reducedMotion: false }));
  });
  await enter(page, await token(ANA), lab);
  await page.waitForFunction(() => !!(window as any).__yutopia.tp && !!(window as any).__yutopia.walker, null, {
    timeout: 60_000,
  });
  // somewhere clear: 3 wide, 9 long going south (+y)
  const spot = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    for (let y = 2; y < w.map.height - 10; y++)
      for (let x = 2; x < w.map.width - 3; x++) {
        let open = true;
        for (let dy = 0; dy < 9 && open; dy++)
          for (let dx = -1; dx <= 2 && open; dx++) open = w.grid.fits(x + 0.5 + dx, y + 0.5 + dy, 0.3);
        if (open) return { x, y };
      }
    return null;
  });
  expect(spot, "a clear stretch of floor").not.toBeNull();
  const s = spot as { x: number; y: number };
  const ids = {
    desk: `e2e-vault-desk-${Date.now().toString(36)}`,
    arcade: `e2e-climb-arcade-${Date.now().toString(36)}`,
  };
  try {
    await page.evaluate((sp) => (window as any).__yutopia.teleport({ x: sp.x + 0.5, y: sp.y + 0.5 }), s);
    await page.waitForTimeout(1200);
    // facing south; the server's put-backs counted; the verbs I start, noted
    await page.evaluate(() => {
      const w = window as any;
      w.__yutopia.tp.yaw = Math.PI / 2;
      w.__snaps = [];
      w.__yutopia.room.onMessage("snap", (m: any) => {
        const b = w.__yutopia.walker.body;
        w.__snaps.push({
          ...m,
          after: w.__started.join(","),
          me: [b.x, b.y, b.z, b.verb?.kind, b.up].map((v: any) => (typeof v === "number" ? +v.toFixed(2) : v)),
        });
      });
      w.__started = [];
      const walker = w.__yutopia.walker;
      const frame = walker.frame.bind(walker);
      walker.frame = (dt: number, c: any) => {
        const out = frame(dt, c);
        if (out.started) w.__started.push(out.started.kind);
        return out;
      };
    });

    // crouching: C, seen in Player.mv; C again stands
    await page.keyboard.press("c");
    await expect.poll(async () => (await server(page)).mv & 8).toBe(8);
    await page.keyboard.press("c");
    await expect.poll(async () => (await server(page)).mv & 8).toBe(0);

    // a slide: sprinting south down the clear floor, C
    await page.keyboard.down("Shift");
    await page.keyboard.down("w");
    await page.waitForTimeout(800);
    await page.keyboard.press("c");
    await expect.poll(() => page.evaluate(() => (window as any).__started.join(","))).toContain("slide");
    await page.keyboard.up("w");
    await page.keyboard.up("Shift");
    await page.waitForTimeout(1200);
    await page.keyboard.press("c"); // (stand up)

    // back to the start (a teleport comes as a put-back: counted from after it), and the things
    // to get over put down
    const slid = await page.evaluate(() => (window as any).__snaps.length);
    expect(slid, "put back while crouching or sliding").toBe(0);
    await page.evaluate((sp) => (window as any).__yutopia.teleport({ x: sp.x + 0.5, y: sp.y + 0.5 }), s);
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      (window as any).__snaps = [];
    });
    // the desk across the way (its short side ahead), the arcade three tiles past it
    await page.evaluate(
      ([d, a, sp]) => {
        const w = (window as any).__yutopia;
        w.send("obj:put", { id: d, kind: "desk", x: sp.x, y: sp.y + 2, rot: 0 });
        w.send("obj:put", { id: a, kind: "arcade", x: sp.x, y: sp.y + 6, rot: 0 });
      },
      [ids.desk, ids.arcade, s] as const,
    );
    await expect
      .poll(() => page.evaluate((id) => !!(window as any).__yutopia.engine.getObject(id), ids.arcade))
      .toBe(true);
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      (window as any).__yutopia.tp.yaw = Math.PI / 2;
    });

    // the vault: run at the desk, jump a step short of it
    await page.keyboard.down("w");
    await page.waitForFunction((y) => (window as any).__yutopia.walker.body.y >= y, s.y + 1.05, { polling: "raf" });
    await page.keyboard.press(" ");
    await expect.poll(() => page.evaluate(() => (window as any).__started.join(","))).toContain("vault");
    await expect.poll(async () => (await server(page)).jump).toBe("vault");
    // (over it and down beyond: the vault done)
    await page.waitForFunction(
      (y) => {
        const b = (window as any).__yutopia.walker.body;
        return b.y >= y && !b.verb;
      },
      s.y + 3.3,
      { polling: "raf" },
    );
    expect((await me(page)).z, "down beyond the desk").toBeLessThan(0.05);

    // onto the arcade: on at the same jog, a jump a step short of it
    await page.waitForFunction((y) => (window as any).__yutopia.walker.body.y >= y, s.y + 5.05, { polling: "raf" });
    await page.keyboard.press(" ");
    await expect.poll(() => page.evaluate(() => (window as any).__started.join(","))).toContain("mantle");
    await page.keyboard.up("w");
    await expect.poll(async () => (await me(page)).verb ?? "", { timeout: 4000 }).toBe("");
    const onTop = await me(page);
    expect(onTop.z, "standing on the arcade").toBeGreaterThan(1.3);
    await expect.poll(async () => (await server(page)).z).toBeGreaterThan(1.3);
    // (and down off it, back the way I came: a fall)
    await page.keyboard.down("s");
    await page.waitForTimeout(700);
    await page.keyboard.up("s");
    await expect.poll(async () => (await me(page)).z).toBeLessThan(0.05);

    // a roll back north (S still faces south: the body turns into it)
    await page.keyboard.down("s");
    await page.waitForTimeout(300);
    await page.keyboard.press("q");
    await expect.poll(() => page.evaluate(() => (window as any).__started.join(","))).toContain("roll");
    await expect.poll(async () => (await server(page)).jump).toBe("roll");
    await page.keyboard.up("s");
    await page.waitForTimeout(600);

    const snaps = await page.evaluate(() => (window as any).__snaps);
    expect(snaps, "the server put me back").toEqual([]);
  } finally {
    await page.evaluate((all) => {
      for (const id of all) (window as any).__yutopia.send("obj:remove", { id });
    }, Object.values(ids));
  }
});
