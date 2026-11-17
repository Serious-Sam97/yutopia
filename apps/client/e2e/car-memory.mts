/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// (plan 97 phase 0) A car's whole life (e2e/car-life.ts, as the memcheck's cycles have it), again and again, and
// what's left after each. Ana takes Main Street's first
// town car, drives it a little, crashes its front to smoking, gets out, shoots it up — four stars and the fifth in
// on its windscreen, a side window, a door to hanging, a tyre to a blowout —, sets it burning, watches it blow,
// waits out its debris (two minutes) and has every car put home fresh. Then she walks back to where she began and,
// garbage collected, everything is counted:
//   - three: geometries, textures, programs; the scene's objects;
//   - WebGL itself: its live buffers, textures and programs, each by the code that made it (the two frames nearest
//     it outside three) — what grows from one life to the next says who keeps it;
//   - Jolt: its heap and bodies; the cars' own lists (live, parked, debris, fire loops, hops, fire lights);
//   - sound: the nodes made by kind, those still alive in JS (a FinalizationRegistry, after the GC) and those
//     (the connected tally dropped: it counted nodes already collected).
// The first life warms the caches (the car's files, its programs): the rest are judged against it.
//   node --experimental-strip-types e2e/car-memory.mts [lives=4] [url=http://localhost:3100] [out.json]
//   QUALITY=high|low; DEBRIS_S=2 (how long the debris lies); SITES=1 (the WebGL objects by their maker)
// (the shared dev world: Ana, the town car put home by `mod:cars` — never two probes at once)
import { writeFileSync } from "node:fs";
import { chromium, request } from "@playwright/test";
import { armCarLife, CENSUS, carGeos, carLife, movedSites, SOUND_TALLY } from "./car-life.ts";

const lives = Number(process.argv[2] ?? 4);
const base = process.argv[3] ?? "http://localhost:3100";
const outFile = process.argv[4] ?? "";
const quality = process.env.QUALITY ?? "high";
const debrisS = Number(process.env.DEBRIS_S ?? 2);
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
    "--js-flags=--expose-gc",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript(
  ([t, q, sites]) => {
    localStorage.setItem("yutopia:token", t as string);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q, view: "3p", cam3p: "chase", maxFps: 0 }));
    const W = window as any;
    // ── WebGL's own objects, alive, by the code that made them ──
    const live = {
      buffer: new Map<object, string>(),
      texture: new Map<object, string>(),
      program: new Map<object, string>(),
    };
    W.__gl = live;
    const siteOf = () => {
      if (!sites) return "";
      const st = (new Error().stack ?? "").split("\n").slice(2);
      const mine = st.filter((l) => !/node_modules|three|WebGL|<anonymous>/.test(l)).slice(0, 2);
      return mine
        .map((l) =>
          l
            .trim()
            .replace(/^at /, "")
            .replace(/\(?https?:\/\/[^/]+\/_next\/static\/chunks\//, "")
            .replace(/\)$/, ""),
        )
        .join(" < ");
    };
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const [k, make, del] of [
        ["buffer", "createBuffer", "deleteBuffer"],
        ["texture", "createTexture", "deleteTexture"],
        ["program", "createProgram", "deleteProgram"],
      ] as const) {
        const m0 = (P as any)[make];
        const d0 = (P as any)[del];
        (P as any)[make] = function (this: any, ...a: any[]) {
          const o = m0.apply(this, a);
          if (o) live[k].set(o, siteOf());
          return o;
        };
        (P as any)[del] = function (this: any, o: any) {
          live[k].delete(o);
          return d0.call(this, o);
        };
      }
    }
  },
  [tok, quality, !!process.env.SITES] as const,
);
await page.addInitScript({ content: SOUND_TALLY });
await page.goto(`${base}/`);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 240_000 },
);
// (DEPTH=n: each maker by n frames, not 2)
if (process.env.DEPTH) await page.evaluate((n) => ((window as any).__censusDepth = n), Number(process.env.DEPTH));
await page.evaluate(CENSUS);
const send = (type: string, msg: unknown = {}) =>
  page.evaluate(([t, m]) => (window as any).__yutopia.room.send(t, m), [type, msg] as const);
const home = await page.evaluate(() => (window as any).__yutopia.meAt());
console.log("home", JSON.stringify(home));
const armed = await armCarLife(page);

// ── the counts ──
type Row = Record<string, any>;
const count = async (): Promise<Row> => {
  await cdp.send("HeapProfiler.collectGarbage");
  await page.waitForTimeout(400);
  // (the FinalizationRegistry's callbacks come after a GC, in a task of their own)
  await cdp.send("HeapProfiler.collectGarbage");
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const W = window as any;
    const Y = W.__yutopia;
    const T = Y.tp;
    const C = Y.cars;
    const info = T.renderer.info;
    const ph = T.physics?.counts?.() ?? {};
    let objects = 0;
    T.scene.traverse(() => objects++);
    const by = (m: Map<object, string>) => {
      const o: Record<string, number> = {};
      for (const s of m.values()) o[s] = (o[s] ?? 0) + 1;
      return o;
    };
    let full = 0;
    let far = 0;
    for (const p of C.parked.values()) {
      if (p.full) full++;
      if (p.far) far++;
    }
    return {
      heapMB: (performance as any).memory.usedJSHeapSize / 1e6,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      objects,
      glBuffers: W.__gl.buffer.size,
      glTextures: W.__gl.texture.size,
      glPrograms: W.__gl.program.size,
      joltMB: (ph.heap ?? 0) / 1e6,
      bodies: ph.bodies ?? 0,
      carsLive: C.live.size,
      carsParked: C.parked.size,
      carsFull: full,
      carsFar: far,
      debris: C.debris.bits.length,
      fireLoops: C.fireLoops.size,
      hops: C.hops.size,
      fireLights: T.fireLights?.length ?? 0,
      soundAlive: W.__sound().n,
      shadowMaps: W.__shadowMaps(),
      programKeys: (info.programs ?? []).map((p: any) => {
        const k = String(p.cacheKey);
        let h = 5381;
        for (let i = 0; i < k.length; i++) h = ((h * 33) ^ k.charCodeAt(i)) >>> 0;
        return `${p.name} #${h.toString(36)} ${k.slice(0, 40)}`;
      }),
      sites: {
        geometry: W.__geoSites(),
        buffer: by(W.__gl.buffer),
        texture: by(W.__gl.texture),
        program: by(W.__gl.program),
      },
    };
  });
};

const rows: Row[] = [];
const atStart = await count();
console.log("start", JSON.stringify({ ...atStart, sites: undefined, programKeys: undefined }));
rows.push({ life: 0, after: atStart });
for (let n = 1; n <= lives; n++) {
  const log: Row = { life: n };
  // (PROPS=1: the things — not cars — whose props a life changed, by kind and what changed)
  const propsOf = () =>
    page.evaluate(() => {
      const o: Record<string, string> = {};
      (window as any).__yutopia.room.state.objects.forEach((x: any) => {
        if (x.kind !== "car") o[x.id] = `${x.kind}|${x.props}`;
      });
      return o;
    });
  const before = process.env.PROPS ? await propsOf() : null;
  const l = await carLife(page, armed, {
    home,
    debrisS,
    atBurnt: async () => {
      const { sites, programKeys, shadowMaps, ...b } = await count();
      return b;
    },
  });
  Object.assign(log, l);
  if (before) {
    const after = await propsOf();
    const changed = Object.keys({ ...before, ...after })
      .filter((id) => before[id] !== after[id])
      .map((id) => `${id}: ${(before[id] ?? "—").slice(0, 160)} → ${(after[id] ?? "—").slice(0, 160)}`);
    console.log(`  things changed by the life (${changed.length}):`);
    for (const c of changed.slice(0, 20)) console.log(`    ${c}`);
  }
  log.after = await count();
  rows.push(log);
  const { sites, shadowMaps, programKeys, ...plain } = log.after;
  console.log(
    `life ${n}: shots in ${log.screen}/${log.side}/${log.engine}, blasts ${log.blasts}, fire reached ${log.fireMax}, props after ${JSON.stringify(log.propsAfter)}`,
  );
  console.log("  burnt", JSON.stringify(log.burnt));
  console.log("  after", JSON.stringify(plain));
  {
    const was = rows[rows.length - 2].after;
    const off = (log.after.shadowMaps as string[]).filter((x) => x.startsWith("OFF"));
    console.log(
      `  shadow maps ${log.after.shadowMaps.length} (left the scene with theirs: ${off.length})`,
      JSON.stringify(off.slice(-4)),
    );
    const pk = (log.after.programKeys as string[]).filter((k) => !(was.programKeys as string[]).includes(k));
    const pg = (was.programKeys as string[]).filter((k) => !(log.after.programKeys as string[]).includes(k));
    if (pk.length || pg.length) console.log("  programs new", JSON.stringify(pk), "gone", JSON.stringify(pg));
  }
  if (process.env.SITES && rows.length > 1) {
    for (const [k, d] of movedSites(rows[rows.length - 2].after.sites.geometry, log.after.sites.geometry))
      console.log(`  geometries ${d > 0 ? "+" : ""}${d}  ${k}`);
  }
  if (outFile) writeFileSync(outFile, JSON.stringify(rows, null, 1));
}

// ── what grew: against the first life (the warm one), and life by life ──
const K = [
  "heapMB",
  "geometries",
  "textures",
  "programs",
  "objects",
  "glBuffers",
  "glTextures",
  "glPrograms",
  "joltMB",
  "bodies",
  "carsLive",
  "debris",
  "fireLoops",
  "hops",
  "fireLights",
];
console.log("\n            " + rows.map((r) => `life ${r.life}`.padStart(9)).join(""));
for (const k of K)
  console.log(k.padEnd(12) + rows.map((r) => String(Math.round(r.after[k] * 10) / 10).padStart(9)).join(""));
console.log(`sound.alive ${rows.map((r) => String(r.after.soundAlive).padStart(9)).join("")}`);
console.log(`car geos    ${rows.map((r) => String(carGeos(r.after.sites.geometry)).padStart(9)).join("")}`);
if (process.env.SITES && rows.length > 2) {
  const a = rows[1].after.sites;
  const b = rows[rows.length - 1].after.sites;
  for (const kind of ["geometry", "buffer", "texture", "program"]) {
    const keys = new Set([...Object.keys(a[kind]), ...Object.keys(b[kind])]);
    const moved = [...keys]
      .map((k) => [k, (b[kind][k] ?? 0) - (a[kind][k] ?? 0)] as const)
      .filter(([, d]) => d !== 0)
      .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
      .slice(0, 12);
    console.log(`\n${kind}s, life 1 → ${rows.length - 1}, by maker:`);
    for (const [k, d] of moved) console.log(`  ${d > 0 ? "+" : ""}${d}  ${k || "(no site)"}`);
  }
}
await send("mod:cars");
await browser.close();
