// (plan 98, the user's report 2026-11-17: "entering the car, hitting fast — there may be a freeze") Long frames getting
// into a car and in a fast crash, named: Ana walks to Main Street's first town car and gets in by its act (X), waits for
// its engine, then her car is put 14 m behind a parked car aimed at it at 18 m/s. Every frame over 50 ms is printed with
// what was going on (s from X), and PROF=1 a CPU profile of each over 70 ms (its heaviest functions).
//   [PROF=1] [Q=high|low] node --experimental-strip-types e2e/car-hitch.mts [url]
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
  ([t, q, r]) => {
    localStorage.setItem("yutopia:token", t as string);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q, view: "3p", maxFps: 0, carReflect: r || undefined }));
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
  [tok, quality, process.env.REFLECT ?? ""] as const,
);
await page.goto(`${base}/`);
await page.waitForFunction(() => {
  const h = (window as any).__hud?.get();
  return h?.phase === "ready" && h.loading?.on === false;
}, null, { timeout: 240_000 });
const cdp = await page.context().newCDPSession(page);
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
await page.waitForTimeout(1500); // (settled: the long frames of arriving not counted)
if (process.env.PROF) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await cdp.send("Profiler.start");
}
const ev: [number, string][] = [];
const now = () => page.evaluate(() => performance.now());
// (the renderer's programs: new ones at each moment — what compiled — by name and its material's kind)
const progs = () =>
  page.evaluate(() => {
    const r = (window as any).__yutopia.tp?.renderer;
    return (r?.info.programs ?? []).map((p: any) => `${p.name}#${String(p.cacheKey).slice(0, 60).replace(/,/g, " ")}`);
  });
let progWas: string[] = await progs();
const newProgs = async (tag: string) => {
  const now2 = await progs();
  const fresh = now2.filter((x: string) => !progWas.includes(x));
  progWas = now2;
  console.log(`  programs new at ${tag}: ${fresh.length}`);
  for (const f of fresh.slice(0, 14)) console.log(`    ${f}`);
  if (fresh.length && process.env.WHO)
    console.log("    whose:", JSON.stringify(await page.evaluate((keys: string[]) => {
      const tp = (window as any).__yutopia.tp;
      const r = tp.renderer;
      const out: string[] = [];
      tp.scene.traverse((o: any) => {
        for (const m of [].concat(o.material ?? [])) {
          const pr = r.properties.get(m)?.currentProgram;
          if (!pr) continue;
          const k = `${pr.name}#${String(pr.cacheKey).slice(0, 60).replace(/,/g, " ")}`;
          if (!keys.includes(k)) continue;
          const path: string[] = [];
          for (let x = o; x && path.length < 5; x = x.parent) path.push(x.name || x.type);
          out.push(`${(m as any).type}:${(m as any).name} on ${path.join("<")} geo ${o.geometry?.type} u ${Object.keys((m as any).uniforms ?? {}).join("/")} grp ${o.parent?.children?.length}`);
        }
      });
      return [...new Set(out)].slice(0, 8);
    }, fresh)));
};
// (a mark to line the profile up by)
const markAt: number = await page.evaluate(() => {
  const t = performance.now();
  const __mark98 = () => {
    const e = performance.now() + 40;
    while (performance.now() < e);
  };
  __mark98();
  (window as any).__s = [];
  return t;
});
const x0 = await now();
ev.push([x0, "X"]);
await page.evaluate(() => (window as any).__yutopia.interact());
await page.waitForFunction(() => (window as any).__yutopia.cars.mine, null, { timeout: 10_000 });
ev.push([await now(), "seated (the act begins)"]);
await page.waitForTimeout(1200);
await newProgs("seated");
await page.waitForFunction(() => (window as any).__yutopia.cars.mine?.started, null, { timeout: 15_000 });
ev.push([await now(), "engine running"]);
await newProgs("engine running");
await page.waitForTimeout(800);
// aimed at the nearest other parked car, 14 m behind it, at 18 m/s
const aim = await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  const m = C.mine;
  const s = m.sim;
  let best: any = null;
  let bd = 1e9;
  for (const [id, p] of C.parked) {
    const d = Math.hypot(p.pose.x - s.p.x, p.pose.z - s.p.z);
    if (d > 4 && d < bd) {
      bd = d;
      best = { id, p: p.pose };
    }
  }
  if (!best) return null;
  const a = best.p.a;
  const x = best.p.x - Math.cos(a) * 14;
  const z = best.p.z - Math.sin(a) * 14;
  const qy = Math.sin(-a / 2);
  const qw = Math.cos(-a / 2);
  m.drive.car.place(x, s.p.y + 0.1, z, [0, qy, 0, qw], [Math.cos(a) * 18, 0, Math.sin(a) * 18], [0, 0, 0]);
  return best.id;
});
ev.push([await now(), `put 14 m behind ${aim} at 18 m/s`]);
await page.keyboard.down("KeyW");
await page.waitForFunction(() => (window as any).__yutopia.cars.mine?.sim?.hit, null, { timeout: 4000 }).catch(() => {});
ev.push([await now(), "crashed"]);
await newProgs("going fast, crashed");
await page.waitForTimeout(2500);
await newProgs("after the crash");
if (process.env.REFLECT) {
  // (the probe's cycles: 10 s apart, at rest — a few of them, each face's cost)
  await page.keyboard.up("KeyW");
  ev.push([await now(), "stopped, the probe going round"]);
  await page.waitForTimeout(22_000);
  await newProgs("the probe's cycles");
  console.log("kinds in the scene:", JSON.stringify(await page.evaluate(() => {
    const tp = (window as any).__yutopia.tp;
    const k = new Map<string, number>();
    tp.scene.traverse((o: any) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      const g = o.geometry;
      const a = g?.attributes ?? {};
      const sig = [
        o.isInstancedMesh ? "inst" : o.isSkinnedMesh ? "skin" : o.isPoints ? "pts" : o.isLine ? "line" : o.isSprite ? "spr" : o.isBatchedMesh ? "batch" : "mesh",
        o.instanceColor ? "icol" : "",
        o.morphTargetInfluences?.length ? `morph${g.morphAttributes.position?.length ?? 0}n${g.morphAttributes.normal?.length ?? 0}c${g.morphAttributes.color?.length ?? 0}` : "",
        a.uv1 ? "uv1" : "",
        a.uv2 ? "uv2" : "",
        a.uv3 ? "uv3" : "",
        o.isInstancedMesh && o.morphTexture ? "imorph" : "",
      ].filter(Boolean).join("+");
      k.set(sig, (k.get(sig) ?? 0) + 1);
    });
    return [...k];
  })));
  const pf = await page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    return { ms: C.envFaces as number[], at: C.envFaceAt as number[] };
  });
  console.log("probe faces (ms):", JSON.stringify(pf.ms));
  console.log("probe faces over 20 ms (s from X: ms):", pf.ms.map((m, i) => [m, pf.at[i]]).filter(([m]) => m > 20).map(([m, t]) => `${((t - x0) / 1000).toFixed(2)}: ${m}`).join(" | "));
}
await page.keyboard.up("KeyW");
ev.push([await now(), "end"]);
const st: [number, number][] = await page.evaluate(() => (window as any).__s);
const label = (t: number) => {
  let l = "before X";
  for (const [et, e] of ev) if (t >= et) l = e;
  return l;
};
console.log("events (s from X):", ev.map(([t, e]) => `${((t - x0) / 1000).toFixed(2)} ${e}`).join(" | "));
console.log("frames over 50 ms (s from X: ms — during):");
for (const [t, d] of st) console.log(`  ${((t - x0) / 1000).toFixed(2)}: ${d} — ${label(t)}`);
if (process.env.PROF) {
  const { profile } = (await cdp.send("Profiler.stop")) as any;
  const byId = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const stack = (id: number) => {
    const out: string[] = [];
    for (let x: number | undefined = id; x !== undefined; x = parent.get(x)) {
      const f = byId.get(x).callFrame;
      out.push(`${f.functionName || "(anon)"}@${(f.url || "").split("/").pop()}:${f.lineNumber + 1}`);
    }
    return out;
  };
  let t = profile.startTime;
  const at: { t: number; id: number }[] = [];
  let markT = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i];
    at.push({ t, id: profile.samples[i] });
    if (!markT && stack(profile.samples[i]).some((f) => f.startsWith("__mark98"))) markT = t;
  }
  for (const [s0, d] of st.filter(([, d]) => d > 70)) {
    const end = markT + (s0 - markAt) * 1000;
    const begin = end - d * 1000;
    const incl = new Map<string, number>();
    let n = 0;
    for (const x of at) {
      if (x.t < begin || x.t > end) continue;
      n++;
      for (const f of new Set(stack(x.id))) incl.set(f, (incl.get(f) ?? 0) + 1);
    }
    console.log(`  ${((s0 - x0) / 1000).toFixed(2)} s, ${d} ms (${n} samples) — ${label(s0)}:`);
    console.log(
      "   ",
      [...incl]
        .filter(([k]) => !/^\(root\)|^\(program\)|^\(anon\)@:0/.test(k))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 22)
        .map(([k, v]) => `${k} ${v}`)
        .join(" | "),
    );
  }
}
await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: null }));
await browser.close();
