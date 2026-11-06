/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 72 phase 11.6: Bia puts a door and a window into a wall drawn at 45° on the dev stack (:3100,
// :8100) with the real mouse — aimed at the wall, dropped — stills from her camera and from above;
// every change undone at the end.
//   node --experimental-strip-types e2e/free-openings.mts [out dir]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/build-tool/free-openings";
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
const shot = async (name: string) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
};
const n0 = await page.evaluate(() => {
  const w = (window as any).__yutopia;
  return { walls: w.structure.walls.length, objs: w.model.allObjects().length };
});
let ok = true;
try {
  // a wall at an angle ahead of her: from two points on the floor in view, 6 m apart
  const ends = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const r = w.hostRect();
    const a = w.model.screenToWorld(r.left + 760, r.top + 700);
    const b0 = w.model.screenToWorld(r.left + 1180, r.top + 560);
    const d = Math.hypot(b0.x - a.x, b0.y - a.y) || 1;
    const k = 6 / d;
    const q = (v: number) => Math.round(v * 1000) / 1000;
    return { a: [q(a.x), q(a.y)], b: [q(a.x + (b0.x - a.x) * k), q(a.y + (b0.y - a.y) * k)] };
  });
  console.log("wall from", JSON.stringify(ends));
  await page.evaluate(
    (e) => (window as any).__yutopia.send("struct:walls", { level: 3, n: 9, add: [{ ...e, front: "w" }] }),
    ends,
  );
  await page.waitForTimeout(1200);
  const wall = await page.evaluate((e) => {
    const w = (window as any).__yutopia;
    return w.structure.walls.find((q: any) => q.a[0] === e.a[0] && q.a[1] === e.a[1]);
  }, ends);
  const [A, B] = [ends.a, ends.b];
  console.log("wall", wall?.id);
  await page.evaluate(async () => {
    const w = (window as any).__yutopia;
    await w.loadBuild();
    (window as any).__hud.set((s: any) => ({
      build: { ...s.build, on: true, tool: "furniture", mode: "place", kind: "door", props: null, rot: 0 },
    }));
    w.refreshGhost();
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    const room = w.room;
    const orig = room.send.bind(room);
    (window as any).__sent = [];
    room.send = (t: string, m: unknown) => {
      if (String(t).startsWith("obj")) (window as any).__sent.push([t, JSON.stringify(m).slice(0, 300)]);
      return orig(t, m);
    };
  });
  const scr = (x: number, y: number, z: number) =>
    page.evaluate(
      ([px, py, pz]) => {
        const w = (window as any).__yutopia;
        const r = w.hostRect();
        const q = w.model.worldToClient(px, py, pz);
        return { x: r.left + q.x, y: r.top + q.y };
      },
      [x, y, z] as const,
    );
  for (const [kind, at] of [
    ["door", 2],
    ["window", 4.4],
  ] as const) {
    if (kind === "window")
      await page.evaluate(() => {
        (window as any).__hud.set((s: any) => ({ build: { ...s.build, mode: "place", kind: "window", props: null } }));
        (window as any).__yutopia.refreshGhost();
      });
    const t = at / Math.hypot(6, 6);
    const p = await scr(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, 1.2);
    console.log(
      kind,
      "screen",
      Math.round(p.x),
      Math.round(p.y),
      await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [p.x, p.y] as const),
    );
    await page.mouse.move(p.x - 30, p.y, { steps: 3 });
    await page.mouse.move(p.x, p.y, { steps: 6 });
    await page.waitForTimeout(400);
    const ghost = await page.evaluate(() =>
      (window as any).__yutopia.model
        .buildLook()
        .ghosts.map((g: any) => [g.def.x, g.def.y, g.def.yaw, g.def.props?.free, g.def.props?.on, g.ok]),
    );
    console.log(kind, "ghost", JSON.stringify(ghost));
    await shot(`01-${kind}-ghost`);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(1200);
    console.log(kind, "sent", JSON.stringify(await page.evaluate(() => (window as any).__sent.splice(0))));
    console.log(
      kind,
      "toasts",
      JSON.stringify((await page.evaluate(() => (window as any).__hud.get().toasts)).map((t: any) => t.text)),
    );
  }
  const placed = await page.evaluate(() =>
    (window as any).__yutopia.model
      .allObjects()
      .filter((o: any) => o.props?.free)
      .map((o: any) => [o.kind, +o.x.toFixed(3), +o.y.toFixed(3), +(o.yaw ?? 0).toFixed(4), o.props.on]),
  );
  console.log("placed", JSON.stringify(placed));
  if (placed.length < 2) ok = false;
  await page.evaluate(() => (window as any).__hud.set((s: any) => ({ build: { ...s.build, on: false } })));
  await page.waitForTimeout(800);
  // stills: from above-front and from the other side
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const [ux, uy] = [(B[0] - A[0]) / 6, (B[1] - A[1]) / 6];
  for (const [name, side] of [
    ["02-front", "f"],
    ["03-back", "b"],
  ] as const) {
    const sg = side === "f" ? 1 : -1;
    const pos = [mid[0] - uy * 6 * sg, 3.2, mid[1] + ux * 6 * sg];
    const look = [mid[0], 1.4, mid[1]];
    const png = await page.evaluate(
      ([p, l]) => {
        const tp = (window as any).__yutopia.tp;
        const cam = tp.camera.clone();
        cam.position.set(p[0], p[1], p[2]);
        cam.lookAt(l[0], l[1], l[2]);
        cam.updateMatrixWorld();
        tp.renderer.render(tp.scene, cam);
        return tp.renderer.domElement.toDataURL("image/png");
      },
      [pos, look] as const,
    );
    writeFileSync(`${out}/${name}.png`, Buffer.from(png.split(",")[1], "base64"));
    console.log(`${out}/${name}.png`);
  }
} catch (e) {
  ok = false;
  console.log("failed:", String(e).slice(0, 300));
} finally {
  for (let i = 0; i < 8; i++) {
    const now = await page.evaluate(() => {
      const w = (window as any).__yutopia;
      return { walls: w.structure.walls.length, objs: w.model.allObjects().length };
    });
    if (now.walls === n0.walls && now.objs === n0.objs) break;
    await page.evaluate(() => (window as any).__yutopia.undo());
    await page.waitForTimeout(700);
  }
  const end = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    return { walls: w.structure.walls.length, objs: w.model.allObjects().length };
  });
  console.log("left over", end.walls - n0.walls, "walls,", end.objs - n0.objs, "things", ok ? "" : "(a step failed)");
  await b.close();
}
