/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 72 phase 11 (the rest): Bia on the dev stack (:3100, :8100) — a mezzanine, a lift's stop on
// the floor under it and one up on it (one shaft), a ride up to the mezzanine and back; a chair put
// down at 30° and sat on, facing its own way. Stills; everything taken away at the end.
//   node --experimental-strip-types e2e/lift-mezz.mts [out dir]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/build-tool/lift-mezz";
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
const LEVEL = 3;
const [X, Y] = [Number(process.argv[3] ?? 20), Number(process.argv[4] ?? 18)];
await page.evaluate(([x, y, l]) => (window as any).__yutopia.teleport({ x, y, level: l }), [X - 2, Y + 4, LEVEL]);
await page.waitForTimeout(3000);
const w = <T,>(f: string, arg?: unknown): Promise<T> =>
  page.evaluate(([src, a]) => new Function("w", "a", src)((window as any).__yutopia, a), [
    f,
    arg,
  ] as const) as Promise<T>;
const toasts: string[] = [];
await page.exposeFunction("__toast", (t: string) => toasts.push(t));
await w(`w.room.onMessage("toast", (m) => window.__toast(String(m.text)));`);
const shot = async (name: string, from?: [number, number, number], at?: [number, number, number]) => {
  await page.waitForTimeout(500);
  if (!from) {
    await page.screenshot({ path: `${out}/${name}.png` });
  } else {
    const png = await page.evaluate(
      ([p, c]) => {
        const tp = (window as any).__yutopia.tp;
        const cam = tp.camera.clone();
        cam.position.set(p[0], p[1], p[2]);
        cam.lookAt(c[0], c[1], c[2]);
        cam.updateMatrixWorld();
        tp.renderer.render(tp.scene, cam);
        return tp.renderer.domElement.toDataURL("image/png");
      },
      [from, at ?? [X, 0, Y]] as const,
    );
    writeFileSync(`${out}/${name}.png`, Buffer.from(png.split(",")[1], "base64"));
  }
  console.log(`${out}/${name}.png`);
};
const slabs0 = await w<number>("return w.structure.slabs.length");
const me = () =>
  w<{ z: number; level: number; x: number; y: number; yaw: number; a: number }>(
    "const p = w.room.state.players.get(w.room.sessionId); return { z: p.z, level: p.level, x: p.x, y: p.y, yaw: p.yaw, a: p.a };",
  );
const props = (id: string) => w<any>(`return JSON.parse(w.room.state.objects.get(a)?.props ?? "null")`, id);
const until = async (f: () => Promise<boolean>, ms: number, what: string) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await f()) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`waited for ${what}`);
};
const placed: string[] = [];
let ok = true;
try {
  const elev = await w<number>(`return ${LEVEL} * 3.5`);
  // a mezzanine 2.5 m up, six by six
  await w(
    `w.send("struct:slabs", { level: ${LEVEL}, n: 1, add: [{ outline: [[${X - 1}, ${Y - 1}], [${X + 5}, ${Y - 1}], [${X + 5}, ${Y + 3}], [${X - 1}, ${Y + 3}]], top: ".", over: 2.5 }] })`,
  );
  await until(async () => (await w<number>("return w.structure.slabs.length")) > slabs0, 5000, "the mezzanine");
  // the stops: on the floor, then up on the mezzanine over it
  for (const [id, deck] of [
    ["probe-lift-g", 0],
    ["probe-lift-m", 2.5],
  ] as const) {
    await w(
      `w.send("obj:put", { id: "${id}", kind: "elevator", x: ${X}, y: ${Y}, yaw: 0, props: { level: ${LEVEL}${deck ? `, deck: ${deck}` : ""} } })`,
    );
    await until(async () => !!(await props(id)), 5000, `${id} (toasts: ${toasts.join(" | ")})`);
    placed.push(id);
  }
  console.log("shafts", (await props("probe-lift-g")).shaft, (await props("probe-lift-m")).shaft);
  await shot("01-outside", [X + 9, 5, Y + 9], [X + 1, 2, Y + 1]);
  // into the car on the floor, called, sent up
  // (in front of its doors, called; in when they open)
  await page.evaluate(([x, y, l]) => (window as any).__yutopia.teleport({ x, y, level: l }), [X + 1, Y - 0.8, LEVEL]);
  await page.waitForTimeout(1500);
  console.log("at the doors:", JSON.stringify(await me()));
  await w(`w.send("lift:call", { id: "probe-lift-g" })`);
  await until(async () => (await props("probe-lift-g")).door === "open", 6000, "the doors open");
  await w(`w.walkTo({ x: ${X + 1}, y: ${Y + 1.2} })`);
  await until(async () => (await me()).y > Y + 0.6, 6000, "in the car");
  console.log("in:", JSON.stringify(await me()));
  await shot("02-in-the-car");
  const up = Math.round((LEVEL + 2.5 / 3.5) * 1e4) / 1e4;
  await w(`w.send("lift:go", { id: "probe-lift-g", level: ${up} })`);
  await until(async () => (await props("probe-lift-m")).door === "open", 15000, "up at the mezzanine");
  await page.waitForTimeout(800);
  const m1 = await me();
  console.log("up:", JSON.stringify(m1), "expected z", elev + 2.5);
  if (Math.abs(m1.z - (elev + 2.5)) > 0.1) throw new Error(`not up on it: z ${m1.z}`);
  await shot("03-at-the-mezzanine");
  await shot("04-outside-up", [X + 9, 6, Y + 9], [X + 1, 3, Y + 1]);
  await w(`w.send("lift:go", { id: "probe-lift-m", level: ${LEVEL} })`);
  await until(async () => (await props("probe-lift-g")).door === "open", 15000, "back down");
  await page.waitForTimeout(800);
  const m2 = await me();
  console.log("down:", JSON.stringify(m2));
  if (Math.abs(m2.z - elev) > 0.1) throw new Error(`not down: z ${m2.z}`);
  // a chair at 30°, sat on: facing its own way
  const cx = X - 3;
  const cy = Y + 6;
  await w(
    `w.send("obj:put", { id: "probe-chair", kind: "chair", x: ${cx}, y: ${cy}, yaw: ${Math.PI / 6}, props: { level: ${LEVEL}, free: true } })`,
  );
  await until(async () => !!(await props("probe-chair")), 5000, `the chair (toasts: ${toasts.join(" | ")})`);
  placed.push("probe-chair");
  await page.evaluate(([x, y, l]) => (window as any).__yutopia.teleport({ x, y, level: l }), [cx, cy, LEVEL]);
  await page.waitForTimeout(2000);
  const sat = await me();

  const want = Math.round(((Math.PI / 2 + Math.PI / 6) / Math.PI) * 128) & 255;
  console.log("sat:", JSON.stringify(sat), "facing byte wanted", want);
  if (sat.yaw !== want) throw new Error(`facing ${sat.yaw}, not ${want}`);
  await shot("05-sat-at-30", [cx + 2.5, 2, cy + 3], [cx, 0.8, cy]);
} catch (e) {
  ok = false;
  console.log("failed:", String(e).slice(0, 400));
} finally {
  // (undone step by step — the things put, then the mezzanine — till nothing of the probe's is left)
  const things = () =>
    w<number>(`return [...w.room.state.objects.values()].filter((o) => String(o.id).startsWith("probe-")).length`);
  for (let i = 0; i < 8; i++) {
    if ((await w<number>("return w.structure.slabs.length")) === slabs0 && (await things()) === 0) break;
    await w("w.undo()");
    await page.waitForTimeout(800);
  }
  for (const id of placed) if (await props(id)) await w(`w.send("obj:remove", { id: "${id}" })`);
  await page.waitForTimeout(800);
  const left = (await w<number>("return w.structure.slabs.length")) - slabs0;
  console.log("left over", JSON.stringify({ slabs: left, things: await things() }), ok ? "" : "(a step failed)");
  await b.close();
}
