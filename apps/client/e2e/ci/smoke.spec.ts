/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { expect, type Page, test } from "@playwright/test";
import { fakeApi } from "./api";

// The smoke (docs/plan/72-the-3d-core.md, phase 3): the world comes up, I walk, a wall goes up and
// comes back from the server, the frames go on — and nothing the page throws on the way. Run with
// playwright.ci.config.ts (no local stack: the page built, an offline world-server, the API faked).

async function enterWorld(page: Page, errors: string[]) {
  page.on("pageerror", (e) => errors.push(e.message));
  await fakeApi(page, { id: 931, name: "Smoke" });
  await page.goto("/");
  await page.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 200_000 },
  );
}

/** Frames drawn over `ms` (the page's own rAF). (Alive, not fast: a headless browser draws the world in
 *  software, a frame or two a second.) */
const framesIn = (page: Page, ms: number) =>
  page.evaluate(
    (t) =>
      new Promise<number>((done) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t0 < t) requestAnimationFrame(f);
          else done(n);
        };
        requestAnimationFrame(f);
      }),
    ms,
  );

test("the world comes up, I walk, a wall goes up — and the page throws nothing", async ({ page }) => {
  const errors: string[] = [];
  await enterWorld(page, errors);
  // the 3D view is up and drawing
  expect(await page.evaluate(() => !!(window as any).__yutopia.tp)).toBe(true);
  expect(await framesIn(page, 3000)).toBeGreaterThan(1);

  // walking: forward a second, and the server has me where I went
  const at = () =>
    page.evaluate(() => {
      const c = (window as any).__yutopia;
      const p = c.room.state.players.get(c.room.sessionId);
      return { x: p.x as number, y: p.y as number };
    });
  const from = await at();
  // (by a path, as the other specs walk: keys in a headless browser drawing a frame or two a second
  // aren't the walk being checked) — a spot 2–3 tiles off with a way there
  const went = await page.evaluate(() => {
    const c = (window as any).__yutopia;
    for (let r = 2; r <= 4; r++)
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const p = { x: c.me.x + Math.cos(a) * r, y: c.me.y + Math.sin(a) * r };
        if (c.grid?.ok?.(Math.floor(p.x), Math.floor(p.y)) && c.walkTo(p, undefined, true)) return true;
      }
    return false;
  });
  expect(went, "a spot near me with a way there").toBe(true);
  await expect
    .poll(
      async () => {
        const p = await at();
        return Math.hypot(p.x - from.x, p.y - from.y);
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0.5);

  // a wall: on an open edge of my floor near me, as the Walls tool sends it; back from the server
  // (the nearest few in turn: one with a thing across it or a lock is refused, said in a toast)
  const edges = await page.evaluate(() => {
    const c = (window as any).__yutopia;
    const m = c.map;
    const floorAt = (x: number, y: number) => {
      const t = m.tiles[y]?.[x];
      return !!t && t !== " "; // (" " is the void; "." is wood)
    };
    const out: { x: number; y: number; d: number }[] = [];
    for (let y = 1; y < m.height - 1; y++)
      for (let x = 1; x < m.width - 1; x++) {
        if ((m.hWalls[y]?.[x] ?? ".") !== "." || !floorAt(x, y) || !floorAt(x, y - 1)) continue;
        const d = Math.hypot(x - c.me.x, y - c.me.y);
        if (d >= 2) out.push({ x, y, d });
      }
    return { level: c.level, list: out.sort((a, b) => a.d - b.d).slice(0, 6) };
  });
  expect(edges.list.length).toBeGreaterThan(0);
  let built = false;
  for (const e of edges.list) {
    await page.evaluate(
      ([lv, ed]) => {
        (window as any).__yutopia.room.send("map:walls", {
          level: lv,
          edges: [{ x: ed.x, y: ed.y, dir: "h", ch: "p" }],
        });
      },
      [edges.level, e] as const,
    );
    built = await page
      .waitForFunction(([ed]) => (window as any).__yutopia.map.hWalls[ed.y][ed.x] === "p", [e] as const, {
        timeout: 8000, // (a frame or two a second here: the map's applied in the next frame)
      })
      .then(() => true)
      .catch(() => false);
    if (built) break;
  }
  const toasts = await page.evaluate(() => (window as any).__hud.get().toasts.map((t: any) => t.text));
  expect(built, `a wall built (toasts: ${toasts.join(" | ")})`).toBe(true);
  // the frames go on after it
  expect(await framesIn(page, 3000)).toBeGreaterThan(1);

  // the world-server healthy, nothing switched off
  const health = await (await fetch(`http://localhost:${process.env.SMOKE_WORLD_PORT ?? 2681}/health`)).json();
  expect(health.ok).toBe(true);
  expect(health.degraded).toBeUndefined();
  expect(errors).toEqual([]);
});
