/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { ANA, clearDrafts, enter, holdHour, makeDraft, test, token, useWorld } from "./helpers";

// God mode, phase 4 (docs/plan/53-the-god-mode.md): what's published is drawn again where you are,
// on Low, in the woods west of the HQ. A hill 64 m across under Ana's feet (a full brush stroke,
// nine chunks): the land's blocks there are made again with it, and her body's ground (the
// browser's physics) — nothing else stands on it, so nothing else is made again: no frame over
// 25 ms. A road by her: the rest of the Grounds is made again behind what's shown (the Kart Park
// isn't, nor the ways the road isn't near: taken from what's shown) and swapped in whole — a
// way's step is one step, so its frames are walking into new land's (grounds.spec: under 50 ms).
// Frames measured on the machine's GPU (YUTOPIA_GPU=1; else logged). Each rolled back at the end
// (the dev world's shared). A profile of a publish: YUTOPIA_PROFILE=<file.cpuprofile>.
const GPU = process.env.YUTOPIA_GPU === "1";
if (GPU) test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const PROFILE = process.env.YUTOPIA_PROFILE;

const CHUNK = 32;
const N = CHUNK * 2 + 1;
const AT = { x: -150, z: -110 }; // (the Grounds' coords; the room's are 60 and 10 on)
const R = 32;
const TOP = 3;

/** The hill: a lift a chunk, in cm, every half metre (shared grounds-edits.ts encodeHeights). */
function hill(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let cz = Math.floor((AT.z - R) / CHUNK); cz <= Math.floor((AT.z + R) / CHUNK); cz++)
    for (let cx = Math.floor((AT.x - R) / CHUNK); cx <= Math.floor((AT.x + R) / CHUNK); cx++) {
      const b = Buffer.alloc(N * N * 2);
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const d = Math.hypot(cx * CHUNK + i / 2 - AT.x, cz * CHUNK + j / 2 - AT.z) / R;
          b.writeInt16LE(d < 1 ? Math.round(((TOP * 100) / 2) * (1 + Math.cos(Math.PI * d))) : 0, (j * N + i) * 2);
        }
      out[`${cx},${cz}`] = b.toString("base64");
    }
  return out;
}
const ROAD = {
  key: "god-e2e-road",
  kind: "road",
  name: "E2E Road",
  w: 7,
  pts: [
    [AT.x - 30, AT.z + 14],
    [AT.x, AT.z + 12],
    [AT.x + 30, AT.z + 16],
  ],
};

/** What's drawn and solid at AT: the land's block's vertex there, the browser physics' ground,
 *  the Grounds' own; the road's picture in the rest; whether anything's still being made again. */
const seen = (page: Page) =>
  page.evaluate(
    ([x, z, road]) => {
      const y = (window as any).__yutopia;
      const g = y.tp?.around?.grounds;
      const x0 = Math.floor(x / 32) * 32;
      const z0 = Math.floor(z / 32) * 32;
      const b = g?.blocks.get(`2:${x0}:${z0}`);
      const pos = b?.mesh?.geometry.getAttribute("position");
      const drawn = pos ? pos.getY((z - z0) * 33 + (x - x0)) : null;
      const solid = y.tp?.physics?.world.groundUnder(x, 80, z, 0.2, 160, "all") ?? null;
      return {
        rev: y.G?.editsNow().rev as number,
        land: y.G?.terrainAt(x, z) as number,
        drawn: drawn as number | null,
        solid: solid as number | null,
        feet: y.height?.z as number,
        road: !!g?.statics.asphalts.has(road),
        done: !g?.stale.size && !g?.next,
      };
    },
    [AT.x, AT.z, ROAD.key] as const,
  );

/** Ana's draft (what's published, changed by `edit`) published, and once it's laid here, `drawn`
 *  waited for. How long that took, the worst frame meanwhile, and every long one with what was
 *  being made again then: [ms, blocks stale, the rest's steps left (−1: none), the revision]. */
async function publish(
  page: Page,
  tok: string,
  edit: (e: any) => any,
  note: string,
  drawn: (s: Awaited<ReturnType<typeof seen>>) => boolean,
) {
  const was = (await seen(page)).rev;
  await clearDrafts(tok);
  const id = await makeDraft(tok, note, edit);
  const cdp = PROFILE ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
  }
  // (from here: the profiler's start is a long frame of its own)
  await page.evaluate(() => {
    const W = window as any;
    W.__worst = 0;
    W.__long = [];
    W.__longOn = true;
  });
  await page.evaluate(([n, d]) => (window as any).__yutopia.room.send("god:publish", { draftId: d, note: n }), [
    note,
    id,
  ] as const);
  const t0 = Date.now();
  try {
    await expect.poll(() => seen(page).then((s) => s.rev), { timeout: 20_000 }).toBe(was + 1);
    await expect
      .poll(() => seen(page).then((s) => s.done && drawn(s)), { timeout: 90_000, intervals: [250] })
      .toBe(true);
  } catch (e) {
    // (published, never drawn: rolled back all the same — the dev world's shared)
    if ((await seen(page)).rev === was + 1) await rollBack(page, was).catch(() => {});
    throw e;
  }
  const took = Date.now() - t0;
  const out = await page.evaluate(() => {
    const W = window as any;
    W.__longOn = false;
    return { worst: W.__worst as number, long: W.__long as number[][] };
  });
  if (cdp && PROFILE) writeFileSync(PROFILE, JSON.stringify((await cdp.send("Profiler.stop")).profile));
  console.log(
    `[god] ${note}: drawn in ${took} ms; worst frame ${Math.round(out.worst)} ms; long: ${JSON.stringify(out.long)}`,
  );
  return { was, took, ...out };
}
/** Rolled back to `rev` (from the one after it), and drawn again as it was. */
async function rollBack(page: Page, rev: number) {
  await page.evaluate((r) => (window as any).__yutopia.room.send("god:rollback", { rev: r }), rev);
  await expect.poll(() => seen(page).then((s) => s.rev), { timeout: 20_000 }).toBe(rev + 2);
  await expect.poll(() => seen(page).then((s) => s.done), { timeout: 90_000, intervals: [250] }).toBe(true);
}

test.describe.configure({ mode: "serial" });
let page: Page;
let anaToken = "";
let before: Awaited<ReturnType<typeof seen>>;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const space = await useWorld("demo");
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "low", view: "3p", cam3p: "chase" }));
    const W = window as any;
    W.__worst = 0;
    W.__long = [];
    let last = performance.now();
    const tick = (t: number) => {
      W.__worst = Math.max(W.__worst, t - last);
      if (W.__longOn && t - last > 25) {
        const g = W.__yutopia?.tp?.around?.grounds;
        W.__long.push([
          Math.round(t - last),
          g?.stale.size,
          g?.next ? g.next.left : -1,
          W.__yutopia?.G?.editsNow().rev,
        ]);
      }
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  anaToken = await token(ANA);
  await enter(page, anaToken, space);
  await holdHour(page, 13);
  await page.evaluate((p) => (window as any).__yutopia.teleport(p), { x: AT.x + 60, y: AT.z + 10, level: 0 });
  // (there, and what's round her made)
  await expect.poll(() => seen(page).then((s) => s.drawn !== null && s.solid !== null), { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(3000);
  before = await seen(page);
  expect(Math.abs((before.drawn ?? 0) - before.land)).toBeLessThan(0.05);
  expect(before.road).toBe(false);
});
test.afterAll(() => page?.close());

test("a hill published: drawn and stood on where you are, nothing else made again, no long frame", async () => {
  test.setTimeout(180_000);
  const near = (a: number | null, b: number, d: number) => a !== null && Math.abs(a - b) < d;
  const r = await publish(
    page,
    anaToken,
    (e) => ({ ...e, height: { ...e.height, ...hill() } }),
    "e2e: a hill in the woods",
    (s) => Math.abs(s.land - before.land - TOP) < 0.05 && near(s.drawn, s.land, 0.05) && near(s.solid, s.land, 0.15),
  );
  try {
    expect(
      r.long.filter((l) => l[2] >= 0),
      "the rest not made again",
    ).toEqual([]);
    if (GPU) expect(r.worst, "the worst frame while it's made again").toBeLessThan(25);
    // Ana on it (lifted by the server; her ground made again under her: not fallen through)
    await page.waitForTimeout(2500);
    const on = await seen(page);
    expect(Math.abs(on.feet - on.land), `on the hill: feet ${on.feet}, land ${on.land}`).toBeLessThan(0.3);
  } finally {
    await rollBack(page, r.was);
  }
  const s = await seen(page);
  expect(s.drawn !== null && Math.abs(s.drawn - before.land) < 0.05, "the woods as they were").toBe(true);
  // (down onto it again)
  await page.waitForTimeout(2500);
  const down = await seen(page);
  expect(Math.abs(down.feet - before.land), `back down: feet ${down.feet}, land ${before.land}`).toBeLessThan(0.3);
});

test("a road published: the rest made again behind what's shown, swapped in, no frame missed for long", async () => {
  test.setTimeout(180_000);
  const r = await publish(
    page,
    anaToken,
    (e) => ({ ...e, ways: { ...e.ways, add: [...(e.ways?.add ?? []), ROAD] } }),
    "e2e: a road in the woods",
    (s) => s.road,
  );
  try {
    if (GPU) expect(r.worst, "the worst frame while it's made again").toBeLessThan(50);
  } finally {
    await rollBack(page, r.was);
  }
  expect((await seen(page)).road, "the road gone again").toBe(false);
});
