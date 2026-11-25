/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// What putting a door or window in a wall costs (wall-hitch.mts's set-up: an offline world-server,
// the game as Cai): the opening nearest Cai on his floor taken out (`obj:remove`) and put back
// (`obj:put`, the same def), EDITS times; per edit the frames over 50 ms for 3 s after, and the worst
// frame split by stage.
//   node --experimental-strip-types e2e/opening-hitch.mts
//   QUALITY=high|medium|low (high); PORT=2673; EDITS=2; KIND=door|window (either); WORLD, AS_UID, LEVEL
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { chromium, request } from "@playwright/test";

const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const quality = process.env.QUALITY ?? "high";
const port = Number(process.env.PORT ?? 2673);
const edits = Number(process.env.EDITS ?? 2);
const focus = (process.env.FOCUS ?? "").split(",").filter(Boolean);

// WORLD=<world.json[.gz]> (the API's /internal/world, e.g. prod's: tools/prod-world.mjs) — the
// server plays that world; AS_UID (1) is who Cai is in it; LEVEL: the floor to stand on
const worldArg = process.env.WORLD ?? "";
let worldFile = "";
if (worldArg) {
  const raw = readFileSync(worldArg);
  const dir = mkdtempSync(join(tmpdir(), "yutopia-hitch-"));
  worldFile = join(dir, "world.json");
  writeFileSync(worldFile, worldArg.endsWith(".gz") ? gunzipSync(raw) : raw);
}
const uid = process.env.AS_UID ?? "912";
const standOn = process.env.LEVEL === undefined ? null : Number(process.env.LEVEL);

const ws = resolve(import.meta.dirname, "../../world-server");
const server: ChildProcess = spawn("npx", ["tsx", "src/index.ts"], {
  cwd: ws,
  env: {
    ...process.env,
    ...(worldFile ? { YUTOPIA_WORLD_FILE: worldFile } : {}),
    PORT: String(port),
    YUTOPIA_OFFLINE: "1",
    YUTOPIA_WORLD_SECRET: "hitch",
    YUTOPIA_INTERNAL_SECRET: "hitch",
    YUTOPIA_WEATHER: "winter",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const serverLog: string[] = [];
await new Promise<void>((done, fail) => {
  const t = setTimeout(() => fail(new Error("the world-server didn't start")), 90_000);
  server.stdout?.on("data", (b: Buffer) => {
    const s = b.toString();
    serverLog.push(s);
    if (/world-server on/.test(s)) {
      clearTimeout(t);
      done();
    }
  });
  server.stderr?.on("data", (b: Buffer) => process.stderr.write(`  [server] ${b}`));
});
console.log(`world-server on :${port}`);

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
try {
  const ctx = await request.newContext();
  const tok = (
    await (
      await ctx.post(`${api}/api/login`, {
        data: { email: "cai@yutopia.test", password: pass },
        headers: { Accept: "application/json" },
      })
    ).json()
  ).token;
  browser = await chromium.launch({
    channel: "chromium",
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-precise-memory-info"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("  page:", e.message));
  await page.route("**/api/session", async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    j.worldUrl = `ws://localhost:${port}`;
    j.worldToken = `dev:${uid}:Cai:member,builder,admin`;
    await route.fulfill({ response: r, json: j });
  });
  await page.addInitScript(
    ([t, q]) => {
      localStorage.setItem("yutopia:token", t);
      localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q }));
    },
    [tok, quality] as const,
  );
  await page.goto(base);
  await page.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 180_000 },
  );
  if (standOn !== null) {
    // that floor, at its middle's nearest floor tile
    await page.evaluate((level) => {
      const c = (window as any).__yutopia;
      // (the floor as rows from its corner, asked of the structure; none such: the home floor)
      const l = c.rows(level) ?? c.rows(c.structure.home);
      const ox = l.ox ?? 0;
      const oy = l.oy ?? 0;
      let best: [number, number] | null = null;
      for (let y = 0; y < l.height; y++)
        for (let x = 0; x < l.width; x++) {
          const t = l.tiles[y]?.[x];
          if (!t || t === "." || t === " ") continue;
          const d = Math.hypot(x - l.width / 2, y - l.height / 2);
          if (!best || d < Math.hypot(best[0] - l.width / 2, best[1] - l.height / 2)) best = [x, y];
        }
      const [x, y] = best ?? [l.width / 2, l.height / 2];
      c.teleport({ x: x + 0.5 + ox, y: y + 0.5 + oy, level });
    }, standOn);
    await page.waitForFunction((level) => (window as any).__yutopia.level === level, standOn, { timeout: 20_000 });
  }
  await page.waitForTimeout(8000); // (settled: shaders, the land round, the first uploads)

  // each stage of a frame timed, frame by frame (the frames an edit costs, split)
  await page.evaluate(() => {
    const w = window as any;
    const c = w.__yutopia;
    const tp = c.tp;
    w.__frames = [];
    let cur: Record<string, number> = {};
    const wrap = (obj: any, key: string, label: string) => {
      const f = obj?.[key];
      if (typeof f !== "function") return;
      obj[key] = function (this: any, ...a: any[]) {
        const t = performance.now();
        try {
          return f.apply(this, a);
        } finally {
          cur[label] = (cur[label] ?? 0) + performance.now() - t;
        }
      };
    };
    wrap(c, "applyMapFromState", "applyMap");
    wrap(c, "rebuildGrid", "grid");
    wrap(c.model, "setMap", "model.setMap");
    wrap(tp, "update", "tp.update");
    wrap(tp, "placeFloors", "  placeFloors");
    wrap(tp, "indexSeats", "  indexSeats");
    wrap(tp.light, "update", "  light.update");
    wrap(tp, "surround", "  surround");
    for (const n of [
      "update",
      "relayout",
      "buildWalls",
      "bakeFloor",
      "flushBake",
      "relaidThings",
      "buildCeiling",
      "drawObject",
      "mount",
      "unmount",
      "rechunk",
      "collect",
      "syncLive",
      "syncChess",
      "syncSkate",
      "listWalls",
    ])
      wrap(Object.getPrototypeOf(tp.world), n, `    W3.${n}`);
    wrap(tp.builder, "setMap", "  builder.setMap");
    wrap(tp, "setHour", "  setHour");
    wrap(tp.post, "render", "render");
    wrap(tp, "frame", "tp.frame");
    // every WebGL call over 2 ms, by name (a call that waits on the GPU: a canvas upload, a link)
    const gl = tp.renderer.getContext();
    w.__gl = new Map<string, { n: number; ms: number; max: number }>();
    for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(gl))) {
      const f = (gl as any)[k];
      if (typeof f !== "function" || k === "constructor") continue;
      (gl as any)[k] = function (this: any, ...a: any[]) {
        const t = performance.now();
        const r = f.apply(gl, a);
        const d = performance.now() - t;
        if (d > 2) {
          const key = k === "texImage2D" || k === "texSubImage2D" ? `${k}(${a[a.length - 1]?.constructor?.name})` : k;
          const s = w.__gl.get(key) ?? { n: 0, ms: 0, max: 0 };
          s.n++;
          s.ms += d;
          s.max = Math.max(s.max, d);
          w.__gl.set(key, s);
        }
        return r;
      };
    }
    if (tp.physics) wrap(Object.getPrototypeOf(tp.physics), "keepUp", "physics.keepUp");
    if (tp.physics?.build) wrap(Object.getPrototypeOf(tp.physics.build), "building", "  phys.build");
    if (tp.physics?.flow) wrap(Object.getPrototypeOf(tp.physics.flow), "building", "  phys.flow");
    const fr = c.frame;
    c.frame = function (this: any, ...a: any[]) {
      cur = {};
      const t = performance.now();
      try {
        return fr.apply(this, a);
      } finally {
        cur.frame = performance.now() - t;
        w.__frames.push({ at: t, ...cur });
      }
    };
  });

  // FREE=1: two walls off the tile lines first — diagonal, meeting at a corner (one post for both) — on
  // open floor near me, a door and windows set free in them; the measuring and VERIFY then on those
  if (process.env.FREE) {
    const spot = await page.evaluate(() => {
      const c = (window as any).__yutopia;
      const m = c.rows();
      const me = c.me ?? c.tp?.focus;
      const px = me.x - m.ox;
      const py = me.y - m.oy;
      const floor = (x: number, y: number) => {
        const t = m.tiles[y]?.[x];
        return !!t && t !== " ";
      };
      const clear = (x0: number, y0: number, w: number, h: number) => {
        for (let y = y0; y < y0 + h; y++)
          for (let x = x0; x < x0 + w; x++) {
            if (!floor(x, y)) return false;
            if (x > x0 && (m.vWalls[y]?.[x] ?? ".") !== ".") return false;
            if (y > y0 && (m.hWalls[y]?.[x] ?? ".") !== ".") return false;
          }
        return true;
      };
      let best: any = null;
      for (let y = 1; y < m.height - 6; y++)
        for (let x = 1; x < m.width - 10; x++) {
          if (!clear(x, y, 10, 6)) continue;
          const d = Math.hypot(x + 5 - px, y + 3 - py);
          if (!best || d < best.d) best = { x: x + m.ox, y: y + m.oy, d };
        }
      return best && { ...best, level: c.level };
    });
    if (!spot) throw new Error("no open floor for the free walls");
    const [x0, y0] = [spot.x + 1, spot.y + 1];
    const A: [number, number] = [x0, y0];
    const B: [number, number] = [x0 + 4, y0 + 4];
    const C: [number, number] = [x0 + 8, y0];
    const ids: string[] = await page.evaluate(
      async ([level, A, B, C]) => {
        const c = (window as any).__yutopia;
        const n = c.structure.walls.length;
        c.room.send("struct:walls", {
          level,
          add: [
            { a: A, b: B, front: "w" },
            { a: B, b: C, front: "w" },
          ],
        });
        const t0 = performance.now();
        while (c.structure.walls.length < n + 2 && performance.now() - t0 < 8000)
          await new Promise((r) => setTimeout(r, 50));
        // (and one on the tile lines from the first's start — a lattice wall meeting one drawn free — as a
        // second edit: the floor relaid with them)
        await new Promise((r) => setTimeout(r, 1500));
        c.room.send("struct:walls", { level, add: [{ a: A, b: [A[0], A[1] + 3], front: "w" }] });
        const t1 = performance.now();
        while (c.structure.walls.length < n + 3 && performance.now() - t1 < 8000)
          await new Promise((r) => setTimeout(r, 50));
        const near = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
        return c.structure.walls
          .filter((w: any) => w.floor === level && ((near(w.a, A) && near(w.b, B)) || (near(w.a, B) && near(w.b, C))))
          .map((w: any) => w.id);
      },
      [spot.level, A, B, C] as const,
    );
    console.log("free walls:", JSON.stringify({ A, B, C, ids }));
    if (ids.length !== 2) throw new Error("the free walls weren't built");
    await page.waitForTimeout(2000);
    const len = Math.hypot(4, 4);
    const puts = [
      { id: "free-door", kind: "door", wall: ids[0], at: len / 2 },
      { id: "free-win-a", kind: "window", wall: ids[0], at: len - 1.1 },
      { id: "free-win-b", kind: "window", wall: ids[1], at: 1.6 },
      { id: "free-win-c", kind: "window", wall: ids[1], at: len - 1.4 },
    ];
    await page.evaluate(() => {
      const c = (window as any).__yutopia;
      (window as any).__toasts = [];
      c.room.onMessage("toast", (t: any) => (window as any).__toasts.push(t.text));
    });
    for (const q of puts)
      await page.evaluate(
        ([q, level]) =>
          (window as any).__yutopia.room.send("obj:put", {
            id: q.id,
            kind: q.kind,
            x: 0,
            y: 0,
            yaw: 0,
            refId: null,
            props: { level, free: true, on: { wall: q.wall, at: q.at } },
          }),
        [q, spot.level] as const,
      );
    await page.waitForTimeout(3000);
    const got = await page.evaluate(() =>
      ((window as any).__yutopia.tp.hereObjects ?? []).filter((o: any) => o.props?.free === true).map((o: any) => o.id),
    );
    console.log(
      "free openings in:",
      JSON.stringify(got),
      "refused:",
      await page.evaluate(() => JSON.stringify((window as any).__toasts)),
    );
    if (!got.length) throw new Error("no free opening was put");
    // (stand by them: the nearest opening is one of theirs)
    await page.evaluate(([x, y, level]) => (window as any).__yutopia.teleport({ x, y, level }), [
      B[0],
      B[1] - 2,
      spot.level,
    ] as const);
    await page.waitForTimeout(3000);
  }
  const kind = process.env.KIND ?? "";
  // (KIND=door and none on my floor: one put in first, between the windows of the wall nearest me —
  // the dev world has none)
  if (kind === "door") {
    // (inside walls, floor both sides, nearest me first; the server says which take one)
    const tries: any[] = await page.evaluate(() => {
      const c = (window as any).__yutopia;
      const here = c.tp.hereObjects ?? [];
      if (here.some((o: any) => /door/.test(o.kind))) return [];
      const m = c.rows();
      const me = c.me ?? c.tp?.focus;
      const px = me.x - m.ox;
      const py = me.y - m.oy;
      const floor = (x: number, y: number) => {
        const t = m.tiles[y]?.[x];
        return !!t && t !== " ";
      };
      const full = (ch: string | undefined) => !!ch && ch !== "." && /[a-z]/.test(ch) && ch !== "h" && ch !== "g";
      const out: any[] = [];
      for (let y = 1; y < m.height - 1; y++)
        for (let x = 1; x < m.width - 1; x++) {
          if (full(m.hWalls[y]?.[x]) && floor(x, y) && floor(x, y - 1))
            out.push({ x: x + m.ox, y: y + m.oy, yaw: 0, d: Math.hypot(x - px, y - py) });
          if (full(m.vWalls[y]?.[x]) && floor(x, y) && floor(x - 1, y))
            out.push({ x: x + m.ox, y: y + m.oy, yaw: Math.PI / 2, d: Math.hypot(x - px, y - py) });
        }
      return out.sort((a, b) => a.d - b.d).slice(0, 12);
    });
    await page.evaluate(() => {
      const c = (window as any).__yutopia;
      (window as any).__toasts = [];
      c.room.onMessage("toast", (t: any) => (window as any).__toasts.push(t.text));
    });
    for (const t of tries) {
      const d = { id: "hitch-door", kind: "door", x: t.x, y: t.y, yaw: t.yaw, refId: null, props: {} };
      await page.evaluate((d) => (window as any).__yutopia.room.send("obj:put", d), d);
      const ok = await page
        .waitForFunction(
          () => ((window as any).__yutopia.tp.hereObjects ?? []).some((o: any) => o.id === "hitch-door"),
          null,
          {
            timeout: 2500,
          },
        )
        .then(() => true)
        .catch(() => false);
      if (ok) {
        console.log("door put in first:", JSON.stringify(d));
        await page.waitForTimeout(3000);
        break;
      }
    }
    if (tries.length) console.log("  refused:", await page.evaluate(() => JSON.stringify((window as any).__toasts)));
  }
  const pick = await page.evaluate((kind) => {
    const c = (window as any).__yutopia;
    const me = c.me ?? c.tp?.focus;
    const opening = (k: string) => /door|window|win_/.test(k) && (!kind || k.includes(kind));
    const all = (c.tp.hereObjects ?? []).filter((o: any) => opening(o.kind));
    all.sort((a: any, b: any) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    const o = all[0];
    return o ? JSON.parse(JSON.stringify(o)) : null;
  }, kind);
  console.log("opening:", JSON.stringify(pick));
  if (!pick) {
    console.log(
      "openings by props.level:",
      await page.evaluate((kind) => {
        const c = (window as any).__yutopia;
        const n = new Map<string, number>();
        for (const o of c.model.allObjects())
          if (/door|window|win_/.test(o.kind) && (!kind || o.kind.includes(kind))) {
            const k = `${o.kind}@${o.props?.level ?? "-"}`;
            n.set(k, (n.get(k) ?? 0) + 1);
          }
        return `${JSON.stringify([...n])} (I'm on ${c.level})`;
      }, kind),
    );
    throw new Error("no opening on my floor");
  }
  {
    const idle: number[] = await page.evaluate(
      () =>
        new Promise<number[]>((done) => {
          const gaps: number[] = [];
          let last = performance.now();
          const end = last + 3000;
          const f = () => {
            const t = performance.now();
            gaps.push(t - last);
            last = t;
            if (t < end) requestAnimationFrame(f);
            else done(gaps);
          };
          requestAnimationFrame(f);
        }),
    );
    const sorted = [...idle].sort((a, b) => b - a);
    const mid = sorted[Math.floor(sorted.length / 2)];
    console.log(
      `IDLE: worst ${sorted
        .slice(0, 4)
        .map((g) => g.toFixed(0))
        .join(", ")} ms; median ${mid.toFixed(1)}`,
    );
  }
  const DIGEST = `(objs) => {
  const parts = [];
  for (const o of objs) {
    const g = o.geometry;
    let h = 0;
    let len = 0;
    for (const name of ["position", "normal", "color", "uv"]) {
      const a = g?.getAttribute?.(name)?.array;
      if (!a) continue;
      len += a.length;
      for (let i = 0; i < a.length; i++) h = (h + Math.round(a[i] * 1000) * ((i % 97) + 1)) % 1e9;
    }
    const m = o.userData?.base ?? o.material;
    parts.push(\`\${o.type}|\${m?.type}|\${m?.name ?? ""}|\${m?.transparent}|\${m?.opacity}|\${len}|\${h}\`);
  }
  return parts.sort().join(";");
}`;
  // (the digest as a page function, for the checks below)
  await page.evaluate(`window.__digest = ${DIGEST}`);
  for (let i = 0; i < edits * 2; i++) {
    const put = i % 2 === 1;
    await page.evaluate(() => {
      const w = window as any;
      w.__gaps = [];
      w.__frames.length = 0;
      let last = performance.now();
      w.__stopGaps = false;
      w.__gen = (w.__gen ?? 0) + 1;
      const gen = w.__gen;
      const f = () => {
        if (w.__gen !== gen) return;
        const t = performance.now();
        w.__gaps.push([t - last, t]);
        last = t;
        if (!w.__stopGaps) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await page.waitForTimeout(500);
    const cdp = process.env.PROF ? await page.context().newCDPSession(page) : null;
    if (cdp) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
      await cdp.send("Profiler.start");
    }
    if (process.env.SAME)
      await page.evaluate(() => {
        const w = window as any;
        const src = w.__yutopia.tp.body.physics.src.world();
        w.__was = {
          b: src.building,
          st: src.structure,
          areas: src.building.levels?.map((l: any) => l.areas),
          objs: src.objects,
        };
      });
    const sent = await page.evaluate(
      ([o, on]) => {
        const c = (window as any).__yutopia;
        if (on)
          c.room.send("obj:put", {
            id: o.id,
            kind: o.kind,
            x: o.x,
            y: o.y,
            yaw: o.yaw ?? 0,
            refId: null,
            props: o.props,
          });
        else c.room.send("obj:remove", { id: o.id });
        return performance.now();
      },
      [pick, put] as const,
    );
    await page.waitForTimeout(3000);
    if (process.env.SAME)
      console.log(
        "  same:",
        await page.evaluate(() => {
          const w = window as any;
          const src = w.__yutopia.tp.body.physics.src.world();
          const was = w.__was;
          const a = src.building.levels?.map((l: any) => l.areas) ?? [];
          const tiles = src.building.levels?.map((l: any) => l.tiles) ?? [];
          const same = new Set(was.objs);
          return JSON.stringify({
            b: src.building === was.b,
            st: src.structure === was.st,
            areas: `${a.filter((x: any, i: number) => x === was.areas[i]).length}/${a.length}`,
            tiles: tiles.filter(Boolean).length,
            objsKept: `${src.objects.filter((o: any) => same.has(o)).length}/${src.objects.length}`,
          });
        }),
      );
    if (cdp) {
      // PROF=1: the inclusive time of the functions whose names match FOCUS (or all), the 3 s after
      const { profile } = (await cdp.send("Profiler.stop")) as any;
      const nodes = new Map<number, any>();
      for (const n of profile.nodes) nodes.set(n.id, n);
      const parent = new Map<number, number>();
      for (const n of profile.nodes) for (const ch of n.children ?? []) parent.set(ch, n.id);
      const dt = profile.timeDeltas ?? [];
      const incl = new Map<string, number>();
      const name = (n: any) => {
        const cf = n.callFrame;
        const file = String(cf.url).split("/").pop()?.split("?")[0] ?? "";
        return `${cf.functionName || "(anon)"} ${file}:${cf.lineNumber + 1}`;
      };
      profile.samples?.forEach((id: number, k: number) => {
        const ms = (dt[k + 1] ?? dt[k] ?? 0) / 1000;
        const seen = new Set<string>();
        let cur: number | undefined = id;
        while (cur !== undefined) {
          const kk = name(nodes.get(cur));
          if (!seen.has(kk)) {
            seen.add(kk);
            incl.set(kk, (incl.get(kk) ?? 0) + ms);
          }
          cur = parent.get(cur);
        }
      });
      const inc = [...incl]
        .filter(([k]) => !/^\((root|idle|program)\)/.test(k))
        .filter(([k]) => !focus.length || focus.some((f) => k.includes(f)))
        .sort((a, b) => b[1] - a[1]);
      for (const [k, v] of inc.slice(0, 30)) console.log(`    ${v.toFixed(1).padStart(7)} ms  ${k}`);
      await cdp.detach();
    }
    const r = await page.evaluate((t0) => {
      const w = window as any;
      w.__stopGaps = true;
      const gaps = w.__gaps.filter(([, t]: number[]) => t > t0);
      const late = gaps
        .filter(([g]: number[]) => g > 50)
        .map(([g, t]: number[]) => `${g.toFixed(0)} ms at ${(t - t0).toFixed(0)}`);
      const frames = w.__frames.filter((f: any) => f.at > t0).sort((a: any, b: any) => b.frame - a.frame);
      const worst = (frames[0] ?? {}) as Record<string, number>;
      const split = Object.entries(worst)
        .filter(([k, v]) => k !== "at" && v >= 0.5)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k.trim()} ${v.toFixed(1)}`)
        .join(", ");
      const gl = [...w.__gl.entries()].map(([k, s]: any) => `${k}×${s.n} ${s.ms.toFixed(0)}`).join(", ");
      w.__gl.clear();
      const max = Math.max(0, ...gaps.map(([g]: number[]) => g));
      return { late, split, gl, max };
    }, sent);
    if (process.env.VERIFY)
      console.log(
        "  campus facade as built anew:",
        await page.evaluate(() => {
          const digest = (window as any).__digest;
          const tp = (window as any).__yutopia.tp;
          const live = digest(tp.around.campus.main.children);
          const n = tp.around.campus.main.children.length;
          // (built anew: as before this change — the shape forgotten, the update run again)
          tp.aroundShape = "";
          tp.winSig = "";
          tp.update(tp.building, tp.allObjects, tp.level, tp.solidObjects);
          const fresh = digest(tp.around.campus.main.children);
          return live === fresh ? `same (${n} meshes)` : `DIFFERENT (${n} vs ${tp.around.campus.main.children.length})`;
        }),
      );
    console.log(`${put ? "put" : "taken"}: worst ${r.max.toFixed(0)} ms; over 50: ${r.late.join(", ") || "none"}`);
    console.log(`  worst frame: ${r.split}`);
    if (r.gl) console.log(`  gl over 2 ms: ${r.gl}`);
  }
  // VERIFY=n: n random door/window edits on my floor in the browser only (World3.update, as the view
  // calls it: an opening taken, put back, moved a metre along its wall), each checked against the floor
  // built anew from the same: every wall piece, area and tall thing the same, the picks, fades and
  // posts; the floor's chunks baked again the same as a fresh bake's
  const verify = Number(process.env.VERIFY ?? 0);
  if (verify && process.env.VFURN)
    await page.evaluate(() => {
      (window as any).__vfurn = true;
    });
  if (verify)
    console.log(
      await page.evaluate((n) => {
        const digest = (window as any).__digest;
        const tp = (window as any).__yutopia.tp;
        const mine = tp.world;
        const W3 = mine.constructor;
        let seed = 4242;
        const rnd = () => {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          return seed / 0x7fffffff;
        };
        // (read once first: a fresh build's lazy parts are filled on their first read — lazy-matrices.ts)
        const fresh = () => {
          const f = made();
          snap(f);
          return f;
        };
        const made = () =>
          new W3(
            mine.map,
            mine.objects,
            4,
            () => null,
            mine.wells,
            mine.edges,
            mine.rings,
            mine.floorRings,
            mine.slabs,
            mine.decks,
            mine.roofs,
          );
        const snap = (w: any) => {
          const parts = new Map<string, string>();
          for (const [k, p] of w.wallParts) parts.set(`wall|${k}`, digest(p.built.objs));
          // (an area with nothing drawn in it is as none)
          for (const [k, a] of w.areas) if (a.built.objs.length) parts.set(`area|${k}`, digest(a.built.objs));
          for (const [k, t] of w.tall) parts.set(`tall|${k}`, digest(t.built.objs));
          return { parts, picks: w.picks.length, fades: w.fades.length, posts: [...w.posts].sort().join(";") };
        };
        // (a chunk's picture: only those baked since the last upload still hold theirs)
        const pixels = (m: any) => {
          const img = m.userData.bake?.image;
          if (!img?.getContext || img.width <= 1) return null;
          const d = img.getContext("2d").getImageData(0, 0, img.width, img.height).data;
          let h = 0;
          for (let i = 0; i < d.length; i += 3) h = (h * 31 + d[i]) % 1e9;
          return `${img.width}x${img.height}|${h}`;
        };
        // (VFURN=1: the furniture instead — anything not set in a wall)
        const opening = (window as any).__vfurn
          ? (k: string) => !/door|window|win_|stairs|elevator|flight/.test(k)
          : (k: string) => /door|window|win_/.test(k);
        const out: string[] = [];
        // (the baseline: as it is against a fresh build, and two fresh builds against each other)
        {
          const cmp = (x: any, y: any) => {
            const a = snap(x).parts;
            const b = snap(y).parts;
            return [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
          };
          const f1 = fresh();
          const f2 = fresh();
          out.push(
            `  baseline: live/fresh ${cmp(mine, f1).join(",") || "same"}; fresh/fresh ${cmp(f1, f2).join(",") || "same"}`,
          );
          const k0 = cmp(mine, f1)[0];
          if (k0) {
            const [, ...rest] = k0.split("|");
            const key = rest.join("|");
            const tab = k0.startsWith("wall|") ? "wallParts" : "areas";
            const x = digest(mine[tab].get(key)?.built.objs ?? []).split(";");
            const y = digest(f1[tab].get(key)?.built.objs ?? []).split(";");
            const has = (w: any) =>
              [...w.wallParts.keys()]
                .filter((q: string) => q.includes("|free|"))
                .sort()
                .join(" ");
            out.push(`    free parts live: ${has(mine)}\n    free parts fresh: ${has(f1)}`);
            out.push(
              `    ${k0}: live ${x.length} fresh ${y.length} meshes; live only ${x
                .filter((v: string) => !y.includes(v))
                .slice(0, 4)
                .join(" ")}; fresh only ${y
                .filter((v: string) => !x.includes(v))
                .slice(0, 4)
                .join(" ")}`,
            );
          }
          f1.dispose();
          f2.dispose();
        }
        let bad = 0;
        let baked = 0;
        let objs = [...mine.objects];
        const away: any[] = [];
        for (let i = 0; i < n; i++) {
          const here = objs.filter((o: any) => opening(o.kind));
          const r = rnd();
          let what = "";
          if (away.length && r < 0.3) {
            const o = away.splice(Math.floor(rnd() * away.length), 1)[0];
            objs = [...objs, o];
            what = `put ${o.id}`;
          } else if (here.length && r < 0.7) {
            const o = here[Math.floor(rnd() * here.length)];
            objs = objs.filter((q: any) => q !== o);
            away.push(o);
            what = `took ${o.id}`;
          } else if (here.length && here.some((o: any) => o.props?.free === true) && rnd() < 0.6) {
            const fr = here.filter((o: any) => o.props?.free === true);
            const o = fr[Math.floor(rnd() * fr.length)];
            const d = (rnd() < 0.5 ? -1 : 1) * (0.2 + rnd() * 0.5);
            const m = { ...o, props: { ...o.props, on: { ...o.props.on, at: o.props.on.at + d } } };
            objs = objs.map((q: any) => (q === o ? m : q));
            what = `slid ${o.id} ${d.toFixed(2)}`;
          } else if (here.length) {
            const o = here[Math.floor(rnd() * here.length)];
            const odd = Math.round(((o.yaw ?? 0) / (Math.PI / 2)) % 2) !== 0;
            const d = rnd() < 0.5 ? -1 : 1;
            const m = { ...o, ...(odd ? { y: o.y + d } : { x: o.x + d }) };
            objs = objs.map((q: any) => (q === o ? m : q));
            what = `moved ${o.id}`;
          }
          mine.update(objs);
          mine.flushSoon();
          const f = fresh();
          const a = snap(mine);
          const b = snap(f);
          const diff: string[] = [];
          for (const k of new Set([...a.parts.keys(), ...b.parts.keys()]))
            if (a.parts.get(k) !== b.parts.get(k)) diff.push(k);
          if (a.picks !== b.picks) diff.push(`picks ${a.picks}/${b.picks}`);
          if (a.fades !== b.fades) diff.push(`fades ${a.fades}/${b.fades}`);
          if (a.posts !== b.posts) diff.push("posts");
          for (const [k, m] of mine.floor?.chunks ?? []) {
            const p = pixels(m);
            if (p === null) continue;
            baked++;
            const q = f.floor?.chunks.get(k);
            if (!q || pixels(q) !== p) diff.push(`floor ${k}`);
          }
          f.dispose();
          if (diff.length) {
            bad++;
            out.push(`  ${i}: ${what}: ${diff.slice(0, 6).join(", ")}${diff.length > 6 ? ` …${diff.length}` : ""}`);
          }
        }
        return `VERIFY: ${n - bad}/${n} the same as built anew (${baked} floor chunks baked again compared)\n${out.join("\n")}`;
      }, verify),
    );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
process.exit(0);
