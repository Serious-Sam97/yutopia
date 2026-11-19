/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page } from "@playwright/test";
import { ANA, clearDrafts, enter, holdHour, makeDraft, test, token, useWorld } from "./helpers";

// The bridges (docs/plan/109-bridges.md), on Low on the dev stack. The river bridge by town as Jolt has it in the
// game: under the wheels the whole way, from the road before it onto the road after — no slot at its ends (there
// was one, 3–4 m deep, each end). Then God mode: a bridge added on the county road west of the river with the Bridges
// tool (B), its deck solid in Jolt; the river bridge picked, restyled in each style (stills: YUTOPIA_SHOTS=<dir>, with
// YUTOPIA_GPU=1), its sides off, taken away (the road on the land there). Nothing's published: the draft's deleted.
const GPU = process.env.YUTOPIA_GPU === "1";
const SHOTS = process.env.YUTOPIA_SHOTS;
if (GPU || SHOTS)
  test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

/** Where a point of the land (the Grounds' coords) is on the screen (the page's px). */
const toScreen = (page: Page, x: number, z: number) =>
  page.evaluate(
    ([gx, gz]) => {
      const y = (window as any).__yutopia;
      const t = y.tp;
      const f = t.groundsFrame();
      const v = t.camera.position
        .clone()
        .set(gx, y.G.terrainAt(gx, gz) + f.y, gz)
        .project(t.camera);
      const r = t.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    [x, z],
  );
const god = (page: Page) => page.evaluate(() => (window as any).__hud.get().god);
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/bridge-${name}.png` });
};
const bridges = (page: Page) =>
  page.evaluate(() =>
    (window as any).__yutopia.G.BRIDGES.map((b: any) => ({
      key: b.key,
      way: b.w.key,
      a: b.a,
      b: b.b,
      style: b.style,
      rails: b.rails,
      piers: b.piers,
    })),
  );
/** Along a bridge's way from `pad` samples before it to `pad` after, every 10 cm, kerb to kerb: how far under the road
 *  what Jolt stands a body on is (the worst), and where. Null till Jolt has its chunks. */
const joltDrop = (page: Page, key: string, pad = 6) =>
  page.evaluate(
    ([k, n]) => {
      const y = (window as any).__yutopia;
      const G = y.G;
      const br = G.BRIDGES.find((b: any) => b.key === k);
      if (!br) return { missing: true };
      const w = br.w;
      const L = w.line;
      let worst = { drop: 0, at: "" };
      for (let i = Math.max(0, br.a - n); i < Math.min(L.length - 1, br.b + n); i++) {
        const [ax, az] = L[i];
        const [bx, bz] = L[i + 1];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        const nx = -(bz - az) / len;
        const nz = (bx - ax) / len;
        for (let u = 0; u <= 1; u += 0.1 / len)
          for (const o of [-(w.w / 2 - 0.6), 0, w.w / 2 - 0.6]) {
            const x = ax + (bx - ax) * u + nx * o;
            const z = az + (bz - az) * u + nz * o;
            const want = w.h[i] + (w.h[i + 1] - w.h[i]) * u;
            const hit = y.tp.underfoot(0, x, z, want + 0.4);
            if (!hit) return null;
            const drop = want - hit.g;
            if (drop > worst.drop)
              worst = { drop, at: `sample ${i} + ${u.toFixed(2)} (${x.toFixed(1)}, ${z.toFixed(1)}) on ${hit.on}` };
          }
      }
      return worst;
    },
    [key, pad] as const,
  );

test("the bridges: the river bridge solid end to end in Jolt; God mode's Bridges — added, restyled, opened, taken away", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const space = await useWorld("demo");
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
  });
  const tok = await token(ANA);
  await clearDrafts(tok);
  await makeDraft(tok, "e2e: bridges");
  await enter(page, tok, space);
  await holdHour(page, 13);
  const river = (await bridges(page)).find((b: any) => b.key === "road~0");
  expect(river, "the river bridge, keyed").toMatchObject({ way: "road", style: "steel", rails: "truss" });
  const mid = await page.evaluate(() => {
    const b = (window as any).__yutopia.G.BRIDGES.find((x: any) => x.key === "road~0");
    return b.w.line[(b.a + b.b) >> 1];
  });
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: mid[0], y: mid[1] - 14, level: 0 });

  // the river bridge as Jolt has it: nothing to fall into at either end
  await expect.poll(() => joltDrop(page, "road~0").then((d) => d !== null), { timeout: 60_000 }).toBe(true);
  const ends = await joltDrop(page, "road~0");
  console.log(`[bridge] the river bridge in Jolt: worst ${JSON.stringify(ends)}`);
  expect((ends as any).drop, "under the wheels the whole way").toBeLessThan(0.15);

  // God mode, the Bridges tool: a bridge laid on the county road west of the river (two clicks on the road)
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on && g.loaded), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(1500);
  // (a key pressed again till it's taken: the first frames in God mode can be long ones)
  const tool = async (key: string, want: string) =>
    expect
      .poll(
        async () => {
          if ((await god(page)).tool !== want) await page.keyboard.press(key);
          return (await god(page)).tool;
        },
        { timeout: 15_000, intervals: [500] },
      )
      .toBe(want);
  await tool("b", "bridges");
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
  const [p0, p1] = await page.evaluate(() => {
    const w = (window as any).__yutopia.G.WAYS.find((x: any) => x.key === "road");
    return [w.line[250], w.line[290]].map(([x, z]: number[]) => ({ x, z, h: 0 }));
  });
  await page.evaluate(([a]) => (window as any).__yutopia.god.bridgesTool().up(a, true), [p0]);
  await expect.poll(() => god(page).then((g) => g.bridges.drawing?.name)).toBe("County road");
  await page.evaluate(([b]) => (window as any).__yutopia.god.bridgesTool().up(b, true), [p1]);
  await expect.poll(() => god(page).then((g) => g.changes), { timeout: 5000 }).toBe(1);
  expect((await god(page)).bridges.sel).toMatchObject({ key: "god-bridge-1", style: "steel", made: false });
  await expect.poll(() => bridges(page).then((l) => l.some((b: any) => b.key === "god-bridge-1"))).toBe(true);
  await expect(page.getByRole("heading", { name: "Bridge" })).toBeVisible();
  await expect
    .poll(() => joltDrop(page, "god-bridge-1", 2).then((d: any) => d && d.drop < 0.15), { timeout: 20_000 })
    .toBe(true);

  // the river bridge picked (Select, on its deck), in each style
  await tool("1", "select");
  /** The river bridge picked as a hand picks it: a click — a press, then let go — where its middle is on the screen
   *  now (aimed again each time: the camera eases to where it's going, so a spot found a moment ago drifts off it),
   *  again till it's taken. */
  const pickRiver = async () => {
    await expect
      .poll(
        async () => {
          if ((await god(page)).picked !== "bridge") {
            const deck = await toScreen(page, mid[0], mid[1]);
            await page.mouse.move(deck.x, deck.y);
            await page.waitForTimeout(150);
            await page.mouse.down();
            await page.waitForTimeout(120);
            await page.mouse.up();
            await page.waitForTimeout(300);
          }
          return (await god(page)).picked;
        },
        { timeout: 20_000, intervals: [500] },
      )
      .toBe("bridge");
  };
  await pickRiver();
  await expect.poll(() => god(page).then((g) => [g.picked, g.bridges.sel?.key])).toEqual(["bridge", "road~0"]);
  await shot(page, "picked");
  for (const [style, rails, label] of [
    ["stone", "parapet", "Stone arches"],
    ["concrete", "parapet", "Concrete"],
    ["timber", "railing", "Timber"],
    ["steel", "truss", "Steel truss"],
  ] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect.poll(() => bridges(page).then((l) => l.find((b: any) => b.key === "road~0")?.style)).toBe(style);
    expect((await bridges(page)).find((b: any) => b.key === "road~0")?.rails).toBe(rails);
    await page.waitForTimeout(SHOTS ? 3000 : 300);
    await shot(page, style);
    if (SHOTS) {
      // (from the river, low, looking at its side: what stands under the deck — the arches, the piers)
      const was = await page.evaluate(
        ([m]) => {
          const c = (window as any).__yutopia.god;
          const w = { x: c.at.x, z: c.at.z, up: c.up, pitch: c.pitch, yaw: c.yaw };
          c.at.x = m[0];
          c.at.z = m[1] + 2;
          c.up = 14;
          c.pitch = 0.32;
          c.yaw = Math.PI / 2 + 0.35;
          return w;
        },
        [mid],
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(2500);
      await shot(page, `${style}-side`);
      await page.evaluate((w) => {
        const c = (window as any).__yutopia.god;
        Object.assign(c, { up: w.up, pitch: w.pitch, yaw: w.yaw });
        c.at.x = w.x;
        c.at.z = w.z;
      }, was);
      await pickRiver();
    }
  }
  // its sides off: open
  await page.getByRole("button", { name: "None", exact: true }).click();
  await expect.poll(() => bridges(page).then((l) => l.find((b: any) => b.key === "road~0")?.rails)).toBe("none");
  // taken away: the road on the land across the river (filled to it), still under the wheels
  await page.keyboard.press("Delete");
  await expect.poll(() => bridges(page).then((l) => l.some((b: any) => b.key === "road~0"))).toBe(false);
  const fill = await page.evaluate(
    ([m]) => {
      const y = (window as any).__yutopia;
      const w = y.G.WAYS.find((x: any) => x.key === "road");
      const at = w.line.findIndex((p: number[]) => p[0] === m[0] && p[1] === m[1]);
      return { land: y.G.terrainAt(m[0], m[1]), road: w.h[at] };
    },
    [mid],
  );
  expect(Math.abs(fill.land - fill.road), "the land filled to the road there").toBeLessThan(0.1);
  await page.waitForTimeout(SHOTS ? 3000 : 300);
  await shot(page, "taken-away");
  await page.keyboard.press("Control+z");
  await expect.poll(() => bridges(page).then((l) => l.some((b: any) => b.key === "road~0"))).toBe(true);

  // nothing kept: saved, out, the draft deleted (nothing's published)
  await expect.poll(() => god(page).then((g) => g.save), { timeout: 10_000 }).toBe("saved");
  await page.keyboard.press("o");
  await expect.poll(() => god(page).then((g) => g.on)).toBe(false);
  await clearDrafts(tok);
});
