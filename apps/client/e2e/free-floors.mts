/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 72 phase 11.7: Bia draws floors and roofs on the dev stack (:3100, :8100) with the real mouse —
// a carpet floor corner by corner, a mezzanine (Floors at +1.75 m), a rail on it, a box of walls
// and a gable on it — stills from her camera and from outside; every change undone at the end.
//   node --experimental-strip-types e2e/free-floors.mts [out dir]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/build-tool/free-floors";
mkdirSync(out, { recursive: true });
const ctx = await request.newContext();
const tok = (
  await (
    await ctx.post("http://localhost:8100/api/login", {
      data: { email: "bia@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" },
      headers: { Accept: "application/json" },
    })
  ).json()
).token;
const b = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("page:", e.message));
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high" }));
}, tok);
await page.goto("http://localhost:3100");
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 120_000 },
);
await page.evaluate(() => (window as any).__yutopia.teleport({ x: 20, y: 20, level: 3 }));
await page.waitForTimeout(3000);
const counts = () =>
  page.evaluate(() => {
    const s = (window as any).__yutopia.structure;
    return { walls: s.walls.length, slabs: s.slabs.length, roofs: (s.roofs ?? []).length };
  });
const n0 = await counts();
const set = (patch: Record<string, unknown>) =>
  page.evaluate((p) => {
    (window as any).__hud.set((s: any) => ({ build: { ...s.build, ...p } }));
    (window as any).__yutopia.refreshGhost();
  }, patch);
const click = async (x: number, y: number) => {
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(150);
};
const shot = async (name: string) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
};
const world = (sx: number, sy: number) =>
  page.evaluate(
    ([x, y]) => {
      const w = (window as any).__yutopia;
      const r = w.hostRect();
      const p = w.model.screenToWorld(r.left + x, r.top + y);
      return [Math.round(p.x * 2) / 2, Math.round(p.y * 2) / 2] as [number, number];
    },
    [sx, sy] as const,
  );
let ok = true;
try {
  await page.evaluate(async () => {
    const w = (window as any).__yutopia;
    await w.loadBuild();
  });
  // a carpet floor, five corners
  await set({ on: true, tool: "walls", wallMode: "floors", paintMode: "line", brush: ",", over: 0 });
  for (const [x, y] of [
    [640, 760],
    [900, 700],
    [1000, 780],
    [880, 860],
    [700, 860],
  ])
    await click(x, y);
  await page.mouse.move(640, 760, { steps: 5 });
  await shot("01-floor-ghost");
  await click(640, 760);
  await page.waitForTimeout(800);
  console.log("after floor", JSON.stringify(await counts()));
  // a mezzanine: Floors at +1.75, a box
  await set({ paintMode: "box", brush: ".", over: 1.75 });
  // (its corners on the floor ahead, aimed at up where it'll be)
  const [d0, d1] = [await world(1000, 470), await world(1240, 560)];
  const up = (p: [number, number]) =>
    page.evaluate(([x, y]) => {
      const w = (window as any).__yutopia;
      const r = w.hostRect();
      const q = w.model.worldToClient(x, y, 1.75);
      return { x: r.left + q.x, y: r.top + q.y };
    }, p);
  const [u0, u1] = [await up(d0), await up(d1)];
  await page.mouse.move(u0.x, u0.y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(u1.x, u1.y, { steps: 10 });
  await shot("02-deck-ghost");
  await page.mouse.up();
  await page.waitForTimeout(800);
  console.log("after deck", JSON.stringify(await counts()));
  // a box of walls ahead, then a gable on it
  await set({ wallMode: "build", paintMode: "box", brush: "w:p", over: 0, wallHeight: 3.266 });
  const [A, B] = [await world(500, 470), await world(760, 560)];
  await page.evaluate(
    ([a, c]) => {
      const w = (window as any).__yutopia;
      const r = [a, [c[0], a[1]], c, [a[0], c[1]]];
      w.send("struct:walls", { level: 3, add: r.map((p, i) => ({ a: p, b: r[(i + 1) % 4], front: "b" })) });
    },
    [A, B] as const,
  );
  await page.waitForTimeout(1200);
  await set({ wallMode: "roof", roofKind: "gable", roofPitch: 30 });
  const mid = await page.evaluate(
    ([a, c]) => {
      const w = (window as any).__yutopia;
      const r = w.hostRect();
      const q = w.model.worldToClient((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0.05);
      return { x: r.left + q.x, y: r.top + q.y };
    },
    [A, B] as const,
  );
  await page.mouse.move(mid.x, mid.y, { steps: 6 });
  await shot("03-roof-ghost");
  await click(mid.x, mid.y);
  await page.waitForTimeout(1200);
  console.log(
    "after roof",
    JSON.stringify(await counts()),
    JSON.stringify(
      await page.evaluate(() =>
        ((window as any).__yutopia.structure.roofs ?? []).map((r: any) => [r.kind, r.pitch, r.z]),
      ),
    ),
  );
  await set({ on: false });
  await page.waitForTimeout(1000);
  await shot("04-her-view");
  // from outside, high
  const [cx, cy] = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  for (const [name, pos] of [
    ["05-outside", [cx + 9, 9, cy + 9]],
    ["06-above", [cx + 3, 16, cy + 6]],
  ] as const) {
    const png = await page.evaluate(
      ([p, c]) => {
        const tp = (window as any).__yutopia.tp;
        const cam = tp.camera.clone();
        cam.position.set(p[0], p[1], p[2]);
        cam.lookAt(c[0], 2, c[1]);
        cam.updateMatrixWorld();
        tp.renderer.render(tp.scene, cam);
        return tp.renderer.domElement.toDataURL("image/png");
      },
      [pos, [cx, cy]] as const,
    );
    writeFileSync(`${out}/${name}.png`, Buffer.from(png.split(",")[1], "base64"));
    console.log(`${out}/${name}.png`);
  }
} catch (e) {
  ok = false;
  console.log("failed:", String(e).slice(0, 300));
} finally {
  for (let i = 0; i < 12; i++) {
    const c = await counts();
    if (c.walls === n0.walls && c.slabs === n0.slabs && c.roofs === n0.roofs) break;
    await page.evaluate(() => (window as any).__yutopia.undo());
    await page.waitForTimeout(700);
  }
  const c = await counts();
  console.log(
    "left over",
    JSON.stringify({ walls: c.walls - n0.walls, slabs: c.slabs - n0.slabs, roofs: c.roofs - n0.roofs }),
    ok ? "" : "(a step failed)",
  );
  await b.close();
}
