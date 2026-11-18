// Getting in, frame by frame: is a car drawn where the parked one stood? (the parked view's model, the driven one's —
// made, ready, shown) — no frame with neither (the blink as you get in).
//   node --experimental-strip-types e2e/car-blink.mts [url]
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const quality = process.env.Q ?? "high";
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript(
  ([t, q]) => {
    localStorage.setItem("yutopia:token", t as string);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q, view: "3p", maxFps: 0 }));
    const W = window as any;
    W.__s = [];
    let last = performance.now();
    const tick = (t: number) => {
      if (t - last > 50) W.__s.push([t, Math.round(t - last)]);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  [tok, quality] as const,
);
await page.goto(`${base}/`);
await page.waitForFunction(() => {
  const h = (window as any).__hud?.get();
  return h?.phase === "ready" && h.loading?.on === false;
}, null, { timeout: 240_000 });
const cdp = await page.context().newCDPSession(page);
await page.evaluate(() => {
  const W = window as any;
  const r = W.__yutopia.tp.renderer;
  const gl = r.getContext();
  W.__fu = [];
  const g = gl.getProgramInfoLog.bind(gl);
  gl.getProgramInfoLog = (pr: any) => {
    const t0 = performance.now();
    const out = g(pr);
    const ms = performance.now() - t0;
    const p = r.info.programs.find((x: any) => x.program === pr);
    W.__fu.push([Math.round(t0), +ms.toFixed(1), p ? `${p.name}#${String(p.cacheKey).slice(0, 90)}` : "?", p ? String(p.cacheKey) : ""]);
    return out;
  };
});
await page.evaluate(() => {
  const c = (window as any).__yutopia;
  c.room.send("mod:cars", {});
  c.room.send("mod:hour", { h: 12 });
});
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
// (by its driver's door, else its other side: the first with the car's prompt)
let prompted = false;
for (const w of [2.6, -2.6, 2.2, -2.2]) {
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), {
    x: pp.x - 0.4 * Math.cos(pp.a) + w * Math.sin(pp.a),
    y: pp.z - 0.4 * Math.sin(pp.a) - w * Math.cos(pp.a),
  });
  prompted = await page
    .waitForFunction(() => (window as any).__hud.get().prompt?.kind === "car", null, { timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  if (prompted) break;
}
if (!prompted) throw new Error("no car prompt by it");
await page.evaluate(() => {
  const W = window as any;
  const c = W.__yutopia.cars;
  W.__sp = [];
  let last = "";
  const tick = () => {
    const sp = c.spare;
    const k = sp ? `${sp.model.ready ? "R" : "r"}:${sp.warm.stage}` : "none";
    if (k !== last) W.__sp.push([Math.round(performance.now()), k]);
    last = k;
    if (W.__sp.length < 50) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
if (process.env.PROF) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");
}
await page.waitForTimeout(Number(process.env.SETTLE ?? 1500)); // (settled: the long frames of arriving not counted; SETTLE=0 — pressed the moment the prompt shows)
await page.evaluate((id) => {
  const W = window as any;
  const c = W.__yutopia.cars;
  W.__b = [];
  const t0 = performance.now();
  const shown = (o: any) => {
    if (!o) return false;
    for (let x = o; x; x = x.parent) if (!x.visible) return false;
    return true;
  };
  let draws = 0;
  const hooked = new WeakSet();
  const tick = () => {
    const p = c.parked.get(id);
    const l = c.live.get(`car:${id}`);
    if (l && !hooked.has(l.model.root)) {
      hooked.add(l.model.root);
      let meshes = 0;
      l.model.root.traverse((m: any) => {
        if (!m.isMesh) return;
        meshes++;
        const was = m.onBeforeRender;
        m.onBeforeRender = function (...a: any[]) {
          draws++;
          return was.apply(this, a);
        };
      });
      W.__meshes = meshes;
    }
    const dr = draws;
    draws = 0;
    const pm = p?.full ?? p?.old;
    W.__b.push({
      t: Math.round(performance.now() - t0),
      park: p ? `${pm ? (pm.ready ? "R" : "r") : "-"}${shown(pm?.root) ? "v" : "h"}${p.far ? (shown(p.far.root) ? "F" : "f") : ""}` : "",
      live: l ? `${l.model.ready ? "R" : "r"}${shown(l.model.glb ?? l.model.root) ? "v" : "h"}${l.model.root.parent ? "" : "x"}` : "",
      ho: c.handoff?.has(id) ? 1 : 0,
      dr,
      cam: W.__yutopia.tp?.camera?.position?.toArray().map((v: number) => +v.toFixed(1)),
      lp: l ? l.model.root.getWorldPosition(new (l.model.root.position.constructor)()).toArray().map((v: number) => +v.toFixed(2)) : null,
      pp: pm ? pm.root.getWorldPosition(new (pm.root.position.constructor)()).toArray().map((v: number) => +v.toFixed(2)) : null,
      progs: W.__yutopia.tp?.renderer?.info?.programs?.length,
    });
    if (performance.now() - t0 < 5000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, car.id);
const shots: { t: number; d: string }[] = [];
const fs = await import("node:fs");
const out = process.env.OUT ?? "/tmp/car-blink";
fs.mkdirSync(out, { recursive: true });
cdp.on("Page.screencastFrame", async (f: any) => {
  shots.push({ t: f.metadata.timestamp, d: f.data });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 });
await page.evaluate(() => {
  const W = window as any;
  const r = W.__yutopia.tp.renderer;
  const keys = () => new Set<string>(r.info.programs.map((p: any) => `${p.name}#${p.cacheKey}`));
  W.__pk = { before: null, after: null, t: [] };
  const ca = r.compileAsync.bind(r);
  r.compileAsync = (o: any, c: any, sc: any) => {
    const isCar = String(o?.name ?? "").startsWith("car:");
    const t0 = performance.now();
    if (isCar) W.__pk.before = keys();
    const pr = ca(o, c, sc);
    if (isCar) {
      W.__pk.sync = keys();
      pr.then(() => {
        W.__pk.after = keys();
        W.__pk.t.push(Math.round(performance.now() - t0));
        setTimeout(() => (W.__pk.later = keys()), 1500);
      });
    }
    return pr;
  };
});
console.log("spare before getting in:", await page.evaluate(() => {
  const c = (window as any).__yutopia.cars;
  const sp = c.spare;
  return sp ? JSON.stringify({ oid: sp.oid, ready: sp.model.ready, stage: sp.warm.stage, left: sp.warm.toDraw.length, q: sp.warm.queue?.length, all: sp.warm.all.length, age: +(c.time - sp.at).toFixed(2) }) : "none";
}));
await page.evaluate(() => {
  const W = window as any;
  const r = W.__yutopia.tp.renderer;
  const seen = new WeakSet();
  W.__fd = [];
  const rb = r.renderBufferDirect.bind(r);
  r.renderBufferDirect = (cam: any, sc: any, g: any, m: any, o: any, gr: any) => {
    if (!seen.has(m)) {
      seen.add(m);
      const path: string[] = [];
      for (let x = o; x && path.length < 6; x = x.parent) path.push(x.name || x.type);
      W.__fd.push([Math.round(performance.now()), `${m.type}:${m.name || ""}`, path.join("<")]);
    }
    return rb(cam, sc, g, m, o, gr);
  };
});
const tIn = await page.evaluate(() => {
  (window as any).__yutopia.interact();
  return performance.now();
});
await page.waitForTimeout(5500);
if (process.env.PROF) {
  const { profile } = (await cdp.send("Profiler.stop")) as any;
  fs.writeFileSync(`${out}/get-in.cpuprofile`, JSON.stringify(profile));
}
const pk = await page.evaluate(() => {
  const P = (window as any).__pk;
  if (!P.before) return null;
  const diff = (a: Set<string>, b: Set<string>) => [...b].filter((k) => !a.has(k));
  const short = (k: string) => k.slice(0, 140);
  return {
    ms: P.t,
    madeByCompile: diff(P.before, P.after).length,
    madeAfter: diff(P.after, P.later).map(short),
    compiledSample: diff(P.before, P.after).slice(0, 6).map(short),
  };
});
console.log(JSON.stringify(pk, null, 1));
const fu: any[] = await page.evaluate(() => (window as any).__fu);
{
  const fd: any[] = await page.evaluate(() => (window as any).__fd);
  const near = fd.filter((x) => x[0] > tIn + 200 && x[0] < tIn + 1500);
  console.log(`materials first drawn 0.2–1.5 s after getting in: ${near.length}`);
  for (const x of near.slice(0, 40)) console.log(`   ${x[0] - Math.round(tIn)} ${x[1]} ${x[2]}`);
}
console.log("spare stages:", (await page.evaluate(() => (window as any).__sp)).map((x: any) => `${x[0] - Math.round(tIn)}:${x[1]}`).join(" "));
console.log(`first uses after getting in: ${fu.filter((x) => x[0] > tIn).length}`);
for (const x of fu.filter((x) => x[0] > tIn - Number(process.env.SETTLE ?? 1500) - 1500)) console.log(`  ${x[0] - Math.round(tIn)} ms ${x[1]} ms ${x[2]}`);
// the first-used paint's key against every other paint program's: where they differ
const keysNow: string[] = await page.evaluate(() => (window as any).__yutopia.tp.renderer.info.programs.map((p: any) => `${p.name}#${p.cacheKey}`));
const fp = fu.find((x) => x[0] > tIn && /^paint#|^wear-top/.test(x[2]));
if (fp) {
  const nm = fp[2].split("#")[0];
  const a = fp[3].split(",");
  for (const k of keysNow.filter((k) => k.startsWith(`${nm}#`))) {
    const b = k.slice(nm.length + 1).split(",");
    if (b.join(",") === a.join(",")) continue;
    const d: string[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) d.push(`[${i}] used=${a[i]} other=${b[i]}`);
    console.log(`  ${nm} differs: ${d.slice(0, 12).join("  ")}${a.length > 200 ? "" : ""} (len ${a.length}/${b.length})`);
  }
}
await cdp.send("Page.stopScreencast");
const t0s = shots[0]?.t ?? 0;
shots.forEach((s, i) => fs.writeFileSync(`${out}/${String(i).padStart(3, "0")}-${Math.round((s.t - t0s) * 1000)}.jpg`, Buffer.from(s.d, "base64")));
console.log(`shots ${shots.length} in ${out}`);
const b: any[] = await page.evaluate(() => (window as any).__b);
let last = "";
let gap = 0;
for (const f of b) {
  const k = `park=${f.park || "·"} live=${f.live || "·"}`;
  const drawn = /v/.test(f.park) || f.live === "Rv";
  if (!drawn) gap++;
  if (k !== last || (f.live && f.dr < 5) || f.t < 700) console.log(`${String(f.t).padStart(5)} ms  ${k} lp=${f.lp} draws=${f.dr} cam=${f.cam} progs=${f.progs}${drawn ? "" : "   <- no car"}`);
  last = k;
}
console.log(`frames ${b.length}, with no car drawn: ${gap}`);
const long: any[] = await page.evaluate(() => (window as any).__s);
console.log("long frames after getting in (at ms: ms):", long.filter((x) => x[0] > tIn - Number(process.env.SETTLE ?? 1500) - 50).map((x) => `${Math.round(x[0] - tIn)}:${x[1]}`).join(" "));
console.log("ready at start:", await page.evaluate(() => JSON.stringify((window as any).__hud?.get()?.loading ?? null)));
await browser.close();
