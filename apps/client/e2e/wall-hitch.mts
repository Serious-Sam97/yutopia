/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// What placing a wall costs: an offline world-server of its own (the dev world untouched), the game
// as Cai (a builder there), a wall put on an open edge near Cai the way the Walls tool sends it
// (`map:walls`), then taken away again. Per edit: the browser's frames for 4 s after (worst, the
// gaps over 50 ms), a CPU profile of those 4 s (top self time, and the inclusive time of the
// functions named in FOCUS), and the server's time on the message and its event-loop's worst.
//   node --experimental-strip-types e2e/wall-hitch.mts
//   QUALITY=high|medium|low (high); PORT=2672; EDITS=2; FOCUS="update,keepUp,World3,applyMapFromState"
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
const port = Number(process.env.PORT ?? 2672);
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
const metrics = async (): Promise<Record<string, number>> => {
  const text = await (await fetch(`http://localhost:${port}/metrics`)).text();
  const out: Record<string, number> = {};
  for (const m of text.matchAll(/^yutopia_([\w{}=":]+) (\S+)$/gm)) out[m[1]] = Number(m[2]);
  return out;
};

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
      const l = c.building.levels?.find((v: any) => v.index === level) ?? c.building;
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

  // an open edge near me on my floor (floor on both sides, no wall), and the commonest wall there
  const pick = await page.evaluate(() => {
    const c = (window as any).__yutopia;
    const m = c.map;
    const me = c.me ?? null;
    const px = Math.floor(me?.x ?? c.tp?.focus?.x ?? m.width / 2);
    const py = Math.floor(me?.y ?? c.tp?.focus?.y ?? m.height / 2);
    const count = new Map<string, number>();
    for (const row of m.hWalls)
      for (const ch of row) if (ch !== "." && /[a-z]/.test(ch)) count.set(ch, (count.get(ch) ?? 0) + 1);
    const ch = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "w";
    const floorAt = (x: number, y: number) => {
      const t = m.tiles[y]?.[x];
      return !!t && t !== " "; // (" " is the void; "." is wood)
    };
    let best: any = null;
    for (let y = 1; y < m.height - 1; y++)
      for (let x = 1; x < m.width - 1; x++) {
        if ((m.hWalls[y]?.[x] ?? ".") !== ".") continue;
        if (!floorAt(x, y) || !floorAt(x, y - 1)) continue;
        const d = Math.hypot(x - px, y - py);
        if (d < 2) continue;
        if (!best || d < best.d) best = { x, y, d };
      }
    return { level: c.level, ch, edge: best, at: [px, py], size: [m.width, m.height] };
  });
  console.log("edit:", JSON.stringify(pick));
  if (!pick.edge) throw new Error("no open edge found");

  // VERIFY=n: n random layout edits laid on my floor in place (World3.relayout, the browser only —
  // nothing sent), each checked against the floor built anew from the same map: every wall
  // piece, area and tall thing the same (a digest of its geometry and material), the picks and
  // fades as many. Then the measuring is skipped.
  // TIMES=1: what a floor's steady pieces cost each call (nothing changed: the signing alone)
  if (process.env.TIMES) {
    const t = await page.evaluate(() => {
      const c = (window as any).__yutopia;
      const mine = c.tp.world;
      const time = (f: () => void, n = 20) => {
        f();
        const t0 = performance.now();
        for (let i = 0; i < n; i++) f();
        return +((performance.now() - t0) / n).toFixed(2);
      };
      return {
        objects: mine.objects.length,
        areas: mine.areas.size,
        tall: mine.tall.size,
        update: time(() => mine.update(mine.objects)),
        relayoutSame: time(() => mine.relayout(mine.map, mine.objects), 5),
        // the campus's key from a structure not seen yet (an edit's: tp/view.ts outline)
        outlineKey: time(() => {
          c.tp.outlined.of = null;
          c.tp.outline();
        }),
        // the shader programs linked, and the material family's among them (look/yulit.ts)
        programs: c.tp.renderer.info.programs?.length ?? 0,
        family: (c.tp.renderer.info.programs ?? []).filter((p: any) => String(p.cacheKey).includes("yu|")).length,
        // each floor's light volume drawn (art/light-volume.ts): its samples, MB on the GPU (half floats)
        volumes: [c.tp.light, ...(c.tp.below?.values?.() ?? [])].map((l: any) => {
          const v = l.vol;
          return v
            ? `${v.lm.map.floor ?? "?"}:${v.w}x${v.h}x${v.d}=${((v.w * v.h * v.d * 8) / 1048576).toFixed(1)}MB`
            : "none";
        }),
      };
    });
    console.log("times:", JSON.stringify(t));
  }
  // ROOMS=1: the structure's rooms against their old rectangles (plan 72 phase 10): which rooms' outlines
  // aren't their rectangles, by floor
  if (process.env.ROOMS) {
    const r = await page.evaluate(() => {
      const st = (window as any).__yutopia.structure;
      const area2 = (ring: [number, number][]) => {
        let a = 0;
        for (let i = 0; i < ring.length; i++) {
          const [x0, y0] = ring[i];
          const [x1, y1] = ring[(i + 1) % ring.length];
          a += x0 * y1 - x1 * y0;
        }
        return Math.abs(a) / 2;
      };
      const out: string[] = [];
      for (const room of st.rooms) {
        const [x0, y0, x1, y1] = room.rect;
        const ra = (x1 - x0) * (y1 - y0);
        const oa = area2(room.outline);
        if (Math.abs(oa - ra) > 1e-6 || room.outline.length !== 4)
          out.push(
            `${room.floor}:${room.key} "${room.props?.name ?? ""}" rect ${ra} m² → ${oa} m² (${room.outline.length} corners)`,
          );
      }
      return { rooms: st.rooms.length, differ: out };
    });
    console.log(`rooms: ${r.rooms}, outline ≠ rect: ${r.differ.length}`);
    for (const d of r.differ) console.log(`  ${d}`);
  }
  const verify = Number(process.env.VERIFY ?? 0);
  if (verify) {
    const res = await page.evaluate((n) => {
      const c = (window as any).__yutopia;
      const tp = c.tp;
      const mine = tp.world;
      const W3 = mine.constructor;
      let seed = 12345;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const digest = (objs: any[]) => {
        const parts: string[] = [];
        for (const o of objs) {
          const g = o.geometry;
          let h = 0;
          let len = 0;
          for (const name of ["position", "normal", "color", "uv"]) {
            const a = g?.getAttribute?.(name)?.array as Float32Array | undefined;
            if (!a) continue;
            len += a.length;
            for (let i = 0; i < a.length; i++) h = (h + Math.round(a[i] * 1000) * ((i % 97) + 1)) % 1e9;
          }
          const m = o.userData?.base ?? o.material;
          parts.push(`${o.type}|${m?.type}|${m?.name ?? ""}|${m?.transparent}|${m?.opacity}|${len}|${h}`);
        }
        return parts.sort().join(";");
      };
      const snapshot = (w: any) => {
        const walls = new Map<string, string>();
        for (const [k, p] of w.wallParts) walls.set(k, digest(p.built.objs));
        const areas = new Map<string, string>();
        for (const [k, a] of w.areas) areas.set(k, digest(a.built.objs));
        for (const [k, t] of w.tall) areas.set(`tall|${k}`, digest(t.built.objs));
        // the floor's bake: each chunk's quads and its picture's pixels
        const floor = new Map<string, string>();
        for (const [k, m] of w.floor?.chunks ?? []) {
          const img = m.material.map?.image as HTMLCanvasElement | undefined;
          let h = 0;
          if (img) {
            const d = (img.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, img.width, img.height).data;
            for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) % 1e9;
          }
          floor.set(k, `${digest([m])}|${img?.width}x${img?.height}|${h}`);
        }
        return {
          walls,
          areas,
          floor,
          picks: w.picks.length,
          fades: w.fades.length,
          posts: [...w.posts].sort().join(";"),
        };
      };
      const diff = (a: Map<string, string>, b: Map<string, string>) => {
        const out: string[] = [];
        for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) out.push(k);
        return out;
      };
      const set = (row: string, x: number, ch: string) => row.slice(0, x) + ch + row.slice(x + 1);
      const wallChars = new Set<string>();
      for (const r of [...mine.map.hWalls, ...mine.map.vWalls]) for (const ch of r) if (ch !== ".") wallChars.add(ch);
      const chars = [...wallChars];
      const report: string[] = [];
      let bad = 0;
      // (the edits here are the map's, not the structure's: the floor put on its map's own walls, slabs
      // and tiles first, and baked whole — as a fresh build from the map is)
      mine.relayout(mine.map, mine.objects);
      mine.flushSoon?.();
      mine.rebakeFloor?.();
      {
        // the baseline: as it is, against a fresh build
        const fresh = new W3(tp.items, mine.map, mine.objects, 4, () => {}, mine.wells);
        const a = snapshot(mine);
        const b = snapshot(fresh);
        fresh.dispose();
        const dw = diff(a.walls, b.walls);
        const da = diff(a.areas, b.areas);
        let why = "";
        const k = dw[0];
        if (k) {
          const f = new W3(tp.items, mine.map, mine.objects, 4, () => {}, mine.wells);
          const x = digest(mine.wallParts.get(k).built.objs).split(";");
          const y = digest(f.wallParts.get(k).built.objs).split(";");
          why = ` e.g. ${k}: live ${x.length} [${x
            .filter((v: string) => !y.includes(v))
            .slice(0, 3)
            .join(" ")}] fresh ${y.length} [${y
            .filter((v: string) => !x.includes(v))
            .slice(0, 3)
            .join(" ")}]`;
          f.dispose();
        }
        report.push(
          `baseline: walls ${dw.length} ${dw.slice(0, 4).join(",")} floor ${diff(a.floor, b.floor).length} areas ${da.length} ${da.slice(0, 4).join(",")}${why}`,
        );
      }
      {
        // two fresh builds against each other (is the drawing itself the same twice?)
        const f1 = new W3(tp.items, mine.map, mine.objects, 4, () => {}, mine.wells);
        const f2 = new W3(tp.items, mine.map, mine.objects, 4, () => {}, mine.wells);
        const a = snapshot(f1);
        const b = snapshot(f2);
        const dw = diff(a.walls, b.walls);
        const k = dw[0];
        let why = "";
        if (k) {
          const x = digest(f1.wallParts.get(k).built.objs).split(";");
          const y = digest(f2.wallParts.get(k).built.objs).split(";");
          why = ` e.g. ${k}: ${x
            .filter((v: string) => !y.includes(v))
            .slice(0, 2)
            .join(" ")} vs ${y
            .filter((v: string) => !x.includes(v))
            .slice(0, 2)
            .join(" ")}`;
          const live = digest(mine.wallParts.get(k).built.objs).split(";");
          why += ` | live: ${live
            .filter((v: string) => !x.includes(v))
            .slice(0, 2)
            .join(" ")}`;
        }
        f1.dispose();
        f2.dispose();
        report.push(`fresh vs fresh: walls ${dw.length} areas ${diff(a.areas, b.areas).length}${why}`);
      }
      for (let i = 0; i < n; i++) {
        const m = mine.map;
        const next = { ...m, hWalls: [...m.hWalls], vWalls: [...m.vWalls] };
        // 1–3 edges, next to walls that are there more often than not
        const k = 1 + Math.floor(rnd() * 3);
        for (let j = 0; j < k; j++) {
          const dir = rnd() < 0.5 ? "h" : "v";
          const rows = dir === "h" ? next.hWalls : next.vWalls;
          let y = Math.floor(rnd() * rows.length);
          let x = Math.floor(rnd() * (rows[y]?.length ?? 1));
          if (rnd() < 0.7) {
            // beside an edge that has a wall
            for (let t = 0; t < 200; t++) {
              const yy = Math.floor(rnd() * rows.length);
              const xx = Math.floor(rnd() * (rows[yy]?.length ?? 1));
              if ((rows[yy]?.[xx] ?? ".") !== ".") {
                y = yy;
                x = Math.max(0, Math.min((rows[yy]?.length ?? 1) - 1, xx + (rnd() < 0.5 ? -1 : 1)));
                break;
              }
            }
          }
          if (!rows[y]) continue;
          const cur = rows[y][x];
          rows[y] = set(rows[y], x, cur === "." ? chars[Math.floor(rnd() * chars.length)] : ".");
        }
        const objs = mine.objects;
        // (the things as drawn live can differ from a fresh build — a door swung open — so an
        // area is judged by what the edit does to it: one a fresh build draws differently after
        // the edit must come out as the fresh one; one it doesn't must be left as it was)
        const f0 = new W3(tp.items, m, objs, 4, () => {}, mine.wells);
        const s0 = snapshot(f0);
        f0.dispose();
        const before = snapshot(mine);
        const t0 = performance.now();
        mine.relayout(next, objs);
        mine.flushSoon?.(); // (what the edit left for the frames after: now, to compare)
        const ms = performance.now() - t0;
        const fresh = new W3(tp.items, next, objs, 4, () => {}, mine.wells);
        const a = snapshot(mine);
        const b = snapshot(fresh);
        fresh.dispose();
        const dw = diff(a.walls, b.walls);
        const df = diff(a.floor, b.floor);
        const da: string[] = [];
        // (an area with nothing drawn in it and no area at all draw the same: "")
        const g = (m: Map<string, string>, k: string) => m.get(k) ?? "";
        for (const k of new Set([...a.areas.keys(), ...b.areas.keys()])) {
          const hit = g(s0.areas, k) !== g(b.areas, k);
          const ok = hit
            ? g(a.areas, k) === g(b.areas, k) || g(before.areas, k) !== g(s0.areas, k)
            : g(a.areas, k) === g(before.areas, k) || g(a.areas, k) === g(b.areas, k);
          if (!ok) {
            const x = (a.areas.get(k) ?? "").split(";");
            const y = (b.areas.get(k) ?? "").split(";");
            const z = (before.areas.get(k) ?? "").split(";");
            da.push(
              `${k}${hit ? "(edit)" : "(kept)"} relaid−fresh [${x.filter((v) => !y.includes(v)).join(" ")}] fresh−relaid [${y.filter((v) => !x.includes(v)).join(" ")}] before=relaid ${a.areas.get(k) === before.areas.get(k)} n ${x.length}/${y.length}/${z.length}`,
            );
          }
        }
        const ok =
          !dw.length && !df.length && !da.length && a.picks === b.picks && a.fades === b.fades && a.posts === b.posts;
        if (!ok) {
          bad++;
          report.push(
            `#${i}: walls ${dw.slice(0, 6).join(",")} floor ${df.slice(0, 6).join(",")} areas ${da.slice(0, 6).join(",")} picks ${a.picks}/${b.picks} fades ${a.fades}/${b.fades} posts ${a.posts === b.posts}`,
          );
        } else if (i < 5) report.push(`#${i}: ok in ${ms.toFixed(0)} ms`);
      }
      return { bad, report, n };
    }, verify);
    console.log(`verify: ${res.n - res.bad}/${res.n} edits identical to a fresh build`);
    for (const r of res.report.slice(0, 30)) console.log(`  ${r}`);
    await browser.close();
    server.kill("SIGTERM");
    process.exit(res.bad ? 1 : 0);
  }

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });

  // WRAP=1: each step of the edit timed as it runs (wrapped methods, no profiler): the calls
  // in the second after the send, nested, with their milliseconds
  const wrap = !!process.env.WRAP;
  if (wrap)
    console.log(
      "wrapped:",
      await page.evaluate(() => {
        const w = window as any;
        const c = w.__yutopia;
        const tp = c.tp;
        w.__calls = [];
        let depth = 0;
        const targets: [any, string, string[]][] = [
          [c, "ctl", ["applyMapFromState", "rebuildGrid", "frame"]],
          [c.model, "model", ["setMap", "setObjects"]],
          [tp, "view", ["update", "placeFloors", "frame", "surround"]],
          [
            tp.world,
            "W3",
            [
              "relayout",
              "update",
              "buildWalls",
              "buildCeiling",
              "collect",
              "flushBake",
              "relaidThings",
              "syncLive",
              "rechunk",
              "listWalls",
              "shell",
              "slab",
            ],
          ],
          [tp.light, "light", ["update", "composite", "patch"]],
          [tp.body, "body", ["placeFor", "keepUp", "rebuild"]],
          [tp.renderer, "gl", ["render"]],
        ];
        for (const [o, tag, names] of targets) {
          if (!o) continue;
          for (const n of names) {
            // (a method the instance holds itself — bound, or timed by perf.ts — is wrapped there)
            const proto = Object.hasOwn(o, n) ? o : Object.getPrototypeOf(o);
            const f = proto[n];
            if (typeof f !== "function" || f.__wrapped) continue;
            const g = function (this: any, ...a: any[]) {
              const t0 = performance.now();
              const d = depth++;
              try {
                return f.apply(this, a);
              } finally {
                depth--;
                const ms = performance.now() - t0;
                if (w.__callsOn && ms >= 0.3) w.__calls.push({ t: t0, ms, d, n: `${tag}.${n}` });
              }
            };
            (g as any).__wrapped = true;
            proto[n] = g;
            w.__wrappedList = [...(w.__wrappedList ?? []), `${tag}.${n}${Object.hasOwn(o, n) ? "(own!)" : ""}`];
          }
        }
        return (w.__wrappedList ?? []).join(" ");
      }),
    );
  // the yardstick: as long a stretch with no edit (this machine's own frames)
  {
    const idle: number[] = await page.evaluate(
      () =>
        new Promise<number[]>((done) => {
          const gaps: number[] = [];
          let last = performance.now();
          const end = last + 4500;
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
    console.log(
      `IDLE: worst frames ${sorted
        .slice(0, 5)
        .map((g) => g.toFixed(0))
        .join(", ")} ms; total over 16.7: ${idle
        .filter((g) => g > 16.7)
        .reduce((a, b) => a + b - 16.7, 0)
        .toFixed(0)} ms`,
    );
  }
  for (let i = 0; i < edits * 2; i++) {
    const put = i % 2 === 0;
    const before = await metrics();
    await page.evaluate(() => {
      const w = window as any;
      w.__gaps = [];
      w.__gapAt = [];
      let last = performance.now();
      const f = () => {
        const t = performance.now();
        w.__gaps.push(t - last);
        w.__gapAt.push(t);
        last = t;
        if (!w.__stopGaps) requestAnimationFrame(f);
      };
      w.__stopGaps = false;
      requestAnimationFrame(f);
    });
    await page.waitForTimeout(500);
    // (NOPROF=1: no profiler — starting it stalls the page for a moment itself)
    const prof = !process.env.NOPROF;
    if (prof) await cdp.send("Profiler.start");
    const sent = await page.evaluate(
      ([p, on]) => {
        const c = (window as any).__yutopia;
        const t = performance.now();
        (window as any).__calls = [];
        (window as any).__callsOn = true;
        c.room.send("map:walls", {
          level: p.level,
          edges: [{ x: p.edge.x, y: p.edge.y, dir: "h", ch: on ? p.ch : "." }],
        });
        return t;
      },
      [pick, put] as const,
    );
    // when the edit's back (the map as the browser has it)
    const back = await page.evaluate(
      ([p, on, t0]) =>
        new Promise<number>((done) => {
          const c = (window as any).__yutopia;
          const t = setInterval(() => {
            const v = c.map.hWalls[p.edge.y]?.[p.edge.x] ?? ".";
            if ((on && v !== ".") || (!on && v === ".")) {
              clearInterval(t);
              done(performance.now() - t0);
            }
          }, 2);
          setTimeout(() => {
            clearInterval(t);
            done(-1);
          }, 5000);
        }),
      [pick, put, sent] as const,
    );
    await page.waitForTimeout(4000);
    const { profile } = prof
      ? await cdp.send("Profiler.stop")
      : { profile: { nodes: [], samples: [], timeDeltas: [] } as any };
    const late: string = await page.evaluate((t0) => {
      const w = window as any;
      const at: number[] = w.__gapAt ?? [];
      w.__gapAtWas = at;
      w.__gapAt = [];
      return w.__gaps
        .map((g: number, i: number) => [g, at[i]])
        .filter(([g]: number[]) => g > 50)
        .map(([g, t]: number[]) => `${g.toFixed(0)} ms at ${(t - t0).toFixed(0)}`)
        .join(", ");
    }, sent);
    console.log(`  frames over 50 ms (ms after the send): ${late || "none"}`);
    const gaps: number[] = await page.evaluate(() => {
      const w = window as any;
      w.__stopGaps = true;
      return w.__gaps;
    });
    const slow: any[] = await page.evaluate((t0) => {
      const w = window as any;
      const fs = w.__frames.filter((f: any) => f.at >= t0 - 50);
      w.__frames = [];
      return fs
        .filter((f: any) => f.frame > 30)
        .map((f: any) => ({ ...f, at: Math.round(f.at - t0) }))
        .slice(0, 8);
    }, sent);
    const glSlow = await page.evaluate(() => {
      const w = window as any;
      const out = [...w.__gl].map(([k, s]: any) => `${k} ×${s.n} ${s.ms.toFixed(0)} ms (max ${s.max.toFixed(0)})`);
      w.__gl.clear();
      return out;
    });
    console.log(`  WebGL calls over 2 ms: ${glSlow.join(" · ") || "none"}`);
    console.log("  slow frames (ms after send; stages):");
    for (const f of slow)
      console.log(
        `    +${f.at}: ${Object.entries(f)
          .filter(([k]) => k !== "at")
          .map(([k, v]) => `${k.trim()} ${(v as number).toFixed(0)}`)
          .join(" · ")}`,
      );
    const after = await metrics();
    const msgMax = Object.entries(after).filter(([k]) => k.includes("map:walls") && k.startsWith("message_ms_max"));
    const loopMax = after.event_loop_delay_ms_max;
    const stallMax = after.stall_ms_max;
    const sorted = [...gaps].sort((a, b) => b - a);
    console.log(
      `\n${put ? "PUT" : "TAKE"} #${(i >> 1) + 1}: map back in ${back.toFixed(0)} ms; worst frames ${sorted
        .slice(0, 5)
        .map((g) => g.toFixed(0))
        .join(", ")} ms; frames > 50 ms: ${gaps.filter((g) => g > 50).length}; total over 16.7: ${gaps
        .filter((g) => g > 16.7)
        .reduce((a, b) => a + b - 16.7, 0)
        .toFixed(0)} ms`,
    );
    {
      // the frames over time: each half second after the send, the mean frame and the worst
      const at: number[] = await page.evaluate(() => (window as any).__gapAtWas);
      const line: string[] = [];
      for (let b = -500; b < 4000; b += 500) {
        const g = gaps.filter((_, k) => at[k] - sent >= b && at[k] - sent < b + 500);
        if (!g.length) continue;
        line.push(`${b}:${(g.reduce((x, y) => x + y, 0) / g.length).toFixed(0)}/${Math.max(...g).toFixed(0)}`);
      }
      console.log(`  timeline (ms after send: mean/worst): ${line.join(" ")}`);
    }
    if (wrap) {
      const calls: any[] = await page.evaluate((t0) => {
        const w = window as any;
        w.__callsOn = false;
        return w.__calls.filter((k: any) => k.t - t0 < 1500 && (k.n !== "ctl.frame" || k.ms > 12));
      }, sent);
      calls.sort((a, b) => a.t - b.t || a.d - b.d);
      for (const k of calls.filter((k) => k.ms >= 1 || k.d === 0))
        console.log(`    +${(k.t - sent).toFixed(0).padStart(5)} ${"  ".repeat(k.d)}${k.n} ${k.ms.toFixed(1)}`);
    }
    console.log(
      `  server: map:walls max ${JSON.stringify(msgMax)}, loop max ${loopMax} (before ${before.event_loop_delay_ms_max}), stall max ${stallMax}`,
    );
    // the profile: self time by function, and the inclusive time of the FOCUS functions
    const nodes = new Map<number, any>();
    for (const n of profile.nodes) nodes.set(n.id, n);
    const parent = new Map<number, number>();
    for (const n of profile.nodes) for (const ch of n.children ?? []) parent.set(ch, n.id);
    const dt = profile.timeDeltas ?? [];
    const self = new Map<string, number>();
    const incl = new Map<string, number>();
    const name = (n: any) => {
      const cf = n.callFrame;
      const file = String(cf.url).split("/").pop()?.split("?")[0] ?? "";
      return `${cf.functionName || "(anon)"} ${file}:${cf.lineNumber + 1}`;
    };
    profile.samples?.forEach((id: number, k: number) => {
      const ms = (dt[k + 1] ?? dt[k] ?? 0) / 1000;
      const n = nodes.get(id);
      const key = name(n);
      self.set(key, (self.get(key) ?? 0) + ms);
      const seen = new Set<string>();
      let cur: number | undefined = id;
      while (cur !== undefined) {
        const nn = nodes.get(cur);
        const kk = name(nn);
        if (!seen.has(kk)) {
          seen.add(kk);
          incl.set(kk, (incl.get(kk) ?? 0) + ms);
        }
        cur = parent.get(cur);
      }
    });
    // the long tasks: stretches of work with no idle sample in them, over 80 ms — what ran in each
    {
      const idle = (id: number) => /^\((idle)\)/.test(name(nodes.get(id)));
      let seg: { ms: number; incl: Map<string, number> } | null = null;
      const segs: { ms: number; incl: Map<string, number> }[] = [];
      profile.samples?.forEach((id: number, k: number) => {
        const ms = (dt[k + 1] ?? dt[k] ?? 0) / 1000;
        if (idle(id)) {
          if (seg && seg.ms > 80) segs.push(seg);
          seg = null;
          return;
        }
        seg ??= { ms: 0, incl: new Map() };
        seg.ms += ms;
        const seen = new Set<string>();
        let cur: number | undefined = id;
        while (cur !== undefined) {
          const kk = name(nodes.get(cur));
          if (!seen.has(kk)) {
            seen.add(kk);
            seg.incl.set(kk, (seg.incl.get(kk) ?? 0) + ms);
          }
          cur = parent.get(cur);
        }
      });
      if (seg && (seg as { ms: number }).ms > 80) segs.push(seg);
      for (const s of segs) {
        console.log(`  long task ${s.ms.toFixed(0)} ms:`);
        const list = [...s.incl].filter(([k]) => !/^\((root)\)/.test(k)).sort((a, b) => b[1] - a[1]);
        for (const [k, v] of list.slice(0, 22)) console.log(`    ${v.toFixed(1).padStart(7)} ms  ${k}`);
      }
    }
    const top = [...self].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]);
    console.log("  top self:");
    for (const [k, v] of top.slice(0, 18)) console.log(`    ${v.toFixed(1).padStart(7)} ms  ${k}`);
    console.log(`    (gc ${(self.get("(garbage collector) :0") ?? 0).toFixed(1)} ms)`);
    const inc = [...incl]
      .filter(([k]) => !/^\((root|idle|program)\)/.test(k))
      .sort((a, b) => b[1] - a[1])
      .filter(([k]) => !focus.length || focus.some((f) => k.includes(f)));
    console.log("  top inclusive:");
    for (const [k, v] of inc.slice(0, 40)) console.log(`    ${v.toFixed(1).padStart(7)} ms  ${k}`);
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
process.exit(0);
