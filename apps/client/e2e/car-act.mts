// (plan 98 phases 0–3) The get-in and get-out act, frozen at moments and shot from outside: Ana sat in Main Street's
// first town car (its driver's seat, or SEAT=1 the passenger's), the act's clock held (`__actAt`) at each moment,
// a camera beside the door (`__camPeek`). One sheet a view (OUT=dir): in-<view>.png, out-<view>.png.
// Also prints the car's measures (the door's opening, the seat, the floor).
//   OUT=dir [SEAT=1] [VIEWS=side,front] node --experimental-strip-types e2e/car-act.mts [url]
import { execFileSync } from "node:child_process";
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "/tmp";
const seat = Number(process.env.SEAT ?? 0);
const views = (process.env.VIEWS ?? "side,front,back").split(",");
const T0 = Date.now();
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", cam3p: "chase", maxFps: 0 }));
}, tok);
await page.goto(`${base}/`);
await page.waitForFunction(() => {
  const h = (window as any).__hud?.get();
  return h?.phase === "ready" && h.loading?.on === false;
}, null, { timeout: 240_000 });
await page.evaluate(() => {
  const c = (window as any).__yutopia;
  c.room.send("mod:cars", {});
  c.room.send("mod:hour", { h: 12 });
});
const frames = (n = 2) =>
  page.evaluate((k) => new Promise<void>((res) => {
    let i = 0;
    const f = () => (++i >= k ? res() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);
// a town car on Main Street, parked along it
const car = await page.waitForFunction(() => {
  const c = (window as any).__yutopia;
  const o: any[] = [];
  c.room.state.objects.forEach((x: any) => {
    const p = JSON.parse(x.props);
    if (x.kind === "car" && !p.driven && /^town-car/.test(x.id)) o.push({ id: x.id, x: x.x });
  });
  o.sort((a, b) => a.x - b.x);
  return o[0] && c.cars.parked.get(o[0].id)?.pose ? { id: o[0].id, pose: c.cars.parked.get(o[0].id).pose } : null;
}, null, { timeout: 20_000 }).then((h) => h.jsonValue());
const pp = car.pose;
const side = seat === 1 ? 1 : -1;
const spot = { x: pp.x - 0.4 * Math.cos(pp.a) - side * 2.2 * Math.sin(pp.a), y: pp.z - 0.4 * Math.sin(pp.a) + side * 2.2 * Math.cos(pp.a) };
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), spot);
await page.waitForFunction((q) => {
  const m = (window as any).__yutopia.me?.() ?? (window as any).__yutopia.cars.host?.me?.();
  return !m || Math.hypot(m.x - q.x, m.y - q.y) < 0.6;
}, spot, { timeout: 8000 }).catch(() => {});
await page.evaluate(([id, s]) => (window as any).__yutopia.room.send("car:enter", { id, seat: s }), [car.id, seat] as const);
await page.waitForFunction((s) => (window as any).__yutopia.cars.mine?.seat === s, seat, { timeout: 10_000 });
// the measures
const m = await page.evaluate((s) => {
  const C = (window as any).__yutopia.cars;
  const l = C.live.get(C.mine.vid);
  const mod = l.model;
  const d = mod.doorOf(s);
  const r = (v: any) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
  return {
    kind: l.kind,
    door: d,
    opening: mod.openingOf?.(d),
    sill: mod.sillOf?.(d),
    seat: r(mod.seats[s].hip),
    floor: mod.seats[s].floor,
  };
}, seat);
console.log("measures", JSON.stringify(m));
await page.waitForTimeout(400);
// the camera, in the car body's frame: x its tail, y up, z its left (the driver's side +z)
const cams: Record<string, { from: number[]; to: number[] }> = {
  side: { from: [0.7, 2.5, 2.7], to: [0.1, 0.75, 0.9] },
  front: { from: [-2.5, 2.0, 2.3], to: [0.2, 0.8, 0.95] },
  back: { from: [2.7, 2.1, 2.3], to: [0.0, 0.8, 0.95] },
};
const s = m.seat[2] > 0 ? 1 : -1;
// (the HUD hidden: only the world's canvas)
await page.addStyleTag({ content: "* { visibility: hidden !important } canvas { visibility: visible !important }" });
async function sheet(name: string, ts: number[], outTo: boolean) {
  for (const v of views) {
    const c = cams[v];
    await page.evaluate(([c, s]) => {
      const C = (window as any).__yutopia.cars;
      (globalThis as any).__camPeek = () => {
        const l = C.live.get(C.mine.vid);
        if (!l) return null;
        const b = l.model.body;
        const V = b.position.constructor;
        const f = b.localToWorld(new V(c.from[0], c.from[1], c.from[2] * s));
        const t = b.localToWorld(new V(c.to[0], c.to[1], c.to[2] * s));
        return { from: [f.x, f.y, f.z], to: [t.x, t.y, t.z] };
      };
    }, [c, s] as const);
    const files: string[] = [];
    for (const t of ts) {
      await page.evaluate(([t, o]) => ((globalThis as any).__actAt = { t, out: o }), [t, outTo] as const);
      await frames(3);
      const f = `${out}/${name}-${v}-${t.toFixed(2)}.png`;
      await page.screenshot({ path: f, clip: { x: 53, y: 0, width: 853, height: 640 } });
      files.push(f);
    }
    const cols = 5;
    const args = ["-nostdin", "-loglevel", "error", "-y"];
    for (const f of files) args.push("-i", f);
    const n = files.length;
    const rows = Math.ceil(n / cols);
    let fc = files.map((_, i) => `[${i}]scale=360:-1[v${i}]`).join(";");
    for (let i = n; i < rows * cols; i++) fc += `;color=c=black:s=360x270[v${i}]`;
    fc += ";" + Array.from({ length: rows * cols }, (_, i) => `[v${i}]`).join("") + `xstack=inputs=${rows * cols}:layout=` +
      Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 360}_${Math.floor(i / cols) * 270}`).join("|");
    execFileSync("ffmpeg", [...args, "-filter_complex", fc, "-frames:v", "1", `${out}/${name}-${v}.png`]);
    console.log("sheet", `${out}/${name}-${v}.png`);
  }
}
// (DBG=t,t…: the hands' targets and where the wrists got to, at those moments of the way in; OUTDBG the way out)
for (const [env, o] of [["DBG", false], ["OUTDBG", true]] as const)
  for (const t of (process.env[env] ?? "").split(",").filter(Boolean).map(Number)) {
    await page.evaluate(([t, o]) => {
      (globalThis as any).__actAt = { t, out: o };
      (globalThis as any).__actDbg = [];
    }, [t, o] as const);
    await frames(2);
    const d = await page.evaluate(() => {
      const r = (globalThis as any).__actDbg.slice(-4);
      (globalThis as any).__actDbg = null;
      return r;
    });
    console.log(env, t, JSON.stringify(d));
  }
if (process.env.ONLYDBG) {
  await page.evaluate(() => ((globalThis as any).__actAt = null));
  await browser.close();
  process.exit(0);
}
const IN = [0, 0.3, 0.55, 0.8, 1.0, 1.2, 1.4, 1.55, 1.7, 1.85, 2.0, 2.15, 2.3, 2.5, 2.7];
const OUTS = [0, 0.3, 0.5, 0.7, 0.9, 1.05, 1.2, 1.35, 1.5, 1.7, 1.9, 2.05, 2.2, 2.35, 2.5];
await sheet("in", IN, false);
await sheet("out", OUTS, true);
await page.evaluate(() => {
  (globalThis as any).__actAt = null;
  (globalThis as any).__camPeek = null;
  (window as any).__yutopia.room.send("mod:hour", { h: null });
});
console.log(`done in ${((Date.now() - T0) / 1000).toFixed(0)} s`);
await browser.close();
