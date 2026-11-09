/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// The memory checker (docs/plan/72-the-3d-core.md, phase 13): Yutopia was seen at ~4 GB. An offline
// world-server of its own (run with --expose-gc), people coming and going all the while, and the game
// as Cai going round the world in cycles — up and down the floors, out to the lot, to the far end of
// Long Pine Road and back, things put down and taken away, a still stretch. After each cycle, garbage
// collected on both sides and everything counted:
//   - the browser: JS heap, three's geometries / textures / programs, Jolt's heap and bodies, the
//     land's blocks and chunks, the people drawn;
//   - the world-server: Node's heap and resident memory, Jolt's heap and bodies, the land's chunks,
//     the room's per-person maps (`room_*`).
// Each has a budget against the first cycle (the warm one) and a trend that must stay flat; crossing
// either fails it, and the browser's heap crossing it diffs two heap snapshots (what grew, by kind).
//   node --experimental-strip-types e2e/memcheck.mts [cycles=4] [out.json]
//   PORT=2674; BOTS=12 (people at once; a third of them leave and come back each cycle); IDLE=20 (s);
//   WORLD=<world.json[.gz]> (e.g. prod's); NO_ROAD=1 (skip the long road); LOOK=life (plan 73's look: run here — its files, public/life, aren't in git, so not in CI's nightly)
//   SERVER_DIFF=1: the world-server's heap diffed even when it's within its budget; SERVER_FROM=n:
//   from cycle n (default 1); YUTOPIA_CHUNK_CAP=n: its land cache that small (full early)
//   MEM_FAKE_API=1: no API — answered as the smoke e2e's (e2e/ci/api.ts), the page on Low (CI's
//   software GL): the nightly job (.github/workflows/memory.yml) against the built page — run by tsx
//   (the fake API reads the shared package's index, past what node's type stripping takes)
// (The dev stack's own `next dev` leaks on its own — memory note — and isn't measured: only the page.)
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { chromium, request } from "@playwright/test";
import { SPINE } from "@yutopia/shared/longroad";
import { Client, type Room } from "colyseus.js";

const cycles = Number(process.argv[2] ?? 4);
const outFile = process.argv[3] ?? "";
const port = Number(process.env.PORT ?? 2674);
const bots = Number(process.env.BOTS ?? 12);
const idleS = Number(process.env.IDLE ?? 20);
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";

// ── the world-server: our own, collectable ──
let worldFile = "";
if (process.env.WORLD) {
  const raw = readFileSync(process.env.WORLD);
  worldFile = join(mkdtempSync(join(tmpdir(), "yutopia-mem-")), "world.json");
  writeFileSync(worldFile, process.env.WORLD.endsWith(".gz") ? gunzipSync(raw) : raw);
}
// (node itself, tsx as its loader — one process: its inspector, on port + 1000, is the server's own,
// for heap snapshots)
const inspect = port + 1000;
const server: ChildProcess = spawn(
  process.execPath,
  ["--expose-gc", `--inspect=127.0.0.1:${inspect}`, "--import", "tsx", "src/index.ts"],
  {
    cwd: resolve(import.meta.dirname, "../../world-server"),
    env: {
      ...process.env,
      ...(worldFile ? { YUTOPIA_WORLD_FILE: worldFile } : {}),
      PORT: String(port),
      YUTOPIA_OFFLINE: "1",
      YUTOPIA_WORLD_SECRET: "mem",
      YUTOPIA_INTERNAL_SECRET: "mem",
      YUTOPIA_WEATHER: "winter",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
await new Promise<void>((done, fail) => {
  const t = setTimeout(() => fail(new Error("the world-server didn't start")), 90_000);
  server.stdout?.on("data", (b: Buffer) => {
    if (/world-server on/.test(b.toString())) {
      clearTimeout(t);
      done();
    }
  });
  server.stderr?.on("data", (b: Buffer) => {
    if (!/Debugger listening|For help, see/.test(b.toString())) process.stderr.write(`  [server] ${b}`);
  });
});
console.log(`world-server on :${port}`);
const serverCounts = async (): Promise<Record<string, number>> => {
  const text = await (await fetch(`http://localhost:${port}/metrics?gc=1`)).text();
  const m: Record<string, number> = {};
  for (const r of text.matchAll(/^yutopia_(\w+) (\S+)$/gm)) m[r[1]] = Number(r[2]);
  return {
    heapMB: (m.process_heap_bytes ?? 0) / 1e6,
    rssMB: (m.process_rss_bytes ?? 0) / 1e6,
    joltMB: (m.physics_heap_bytes ?? 0) / 1e6,
    bodies: m.physics_bodies ?? 0,
    chunks: m.grounds_chunks ?? 0,
    built: m.physics_ground_chunks ?? 0,
    places: m.room_places ?? 0,
    waiting: m.room_waiting ?? 0,
    handlers: m.room_handlers ?? 0,
  };
};

/** The world-server's heap, by kind (its inspector: a snapshot, after a GC). */
async function serverSnapshot(): Promise<Map<string, { n: number; size: number }>> {
  const [t] = (await (await fetch(`http://127.0.0.1:${inspect}/json/list`)).json()) as {
    webSocketDebuggerUrl: string;
  }[];
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, f) => {
    ws.onopen = r;
    ws.onerror = f;
  });
  const chunks: string[] = [];
  let id = 0;
  const call = (method: string) =>
    new Promise<void>((done) => {
      const my = ++id;
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.method === "HeapProfiler.addHeapSnapshotChunk") chunks.push(m.params.chunk);
        else if (m.id === my) done();
      };
      ws.send(JSON.stringify({ id: my, method }));
    });
  await call("HeapProfiler.enable");
  await call("HeapProfiler.collectGarbage");
  await call("HeapProfiler.takeHeapSnapshot");
  ws.close();
  return summarize(JSON.parse(chunks.join("")));
}
/** What grew between two heap summaries, the most first. */
function grewOf(a: Map<string, { n: number; size: number }>, b: Map<string, { n: number; size: number }>) {
  return [...b]
    .map(([k, v]) => ({ k, dn: v.n - (a.get(k)?.n ?? 0), ds: v.size - (a.get(k)?.size ?? 0) }))
    .filter((d) => d.ds > 0)
    .sort((p, q) => q.ds - p.ds)
    .slice(0, 20);
}

// ── people coming and going: plain clients walking about near where they arrive ──
interface Bot {
  room: Room;
  timer: ReturnType<typeof setInterval>;
}
const live: Bot[] = [];
let botN = 0;
async function arrive(): Promise<void> {
  const id = 950_000 + botN++;
  const room = await new Client(`ws://localhost:${port}`).joinOrCreate("world", {
    token: `dev:${id}:Mem ${id % 1000}:member`,
  });
  room.onMessage("*", () => {});
  await new Promise<void>((r) => (room.state?.players ? r() : room.onStateChange.once(() => r())));
  const me = room.state.players.get(room.sessionId);
  const at = { x: me?.x ?? 0, y: me?.y ?? 0 };
  let a = Math.random() * Math.PI * 2;
  const timer = setInterval(() => {
    a += (Math.random() - 0.5) * 0.6;
    at.x += Math.cos(a) * 0.12;
    at.y += Math.sin(a) * 0.12;
    room.send("pos", { x: at.x, y: at.y, yaw: a });
  }, 100);
  live.push({ room, timer });
}
async function depart(n: number): Promise<void> {
  for (const b of live.splice(0, n)) {
    clearInterval(b.timer);
    await b.room.leave().catch(() => {});
  }
}

// the long road's far end and its middle (shared longroad.ts SPINE)
const ROAD = [SPINE[Math.floor(SPINE.length / 2)], SPINE[SPINE.length - 1]];

type Sample = Record<string, number>;
const rows: { cycle: number; browser: Sample; server: Sample }[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
let failed = false;
try {
  for (let i = 0; i < bots; i++) await arrive();
  // (on a Mac the GPU through Metal; elsewhere — CI — the browser's own software GL)
  browser = await chromium.launch({
    args: [
      ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : []),
      "--enable-precise-memory-info",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("  page error:", e.message));
  if (process.env.MEM_FAKE_API) {
    // (the smoke's fake API, its session into our world-server)
    process.env.SMOKE_WORLD_PORT = String(port);
    const { fakeApi } = await import("./ci/api.ts");
    await fakeApi(page, { id: 912, name: "Cai", roles: "member,builder,admin" });
  } else {
    const ctx = await request.newContext();
    const tok = (
      await (
        await ctx.post(`${api}/api/login`, {
          data: { email: "cai@yutopia.test", password: pass },
          headers: { Accept: "application/json" },
        })
      ).json()
    ).token;
    await page.route("**/api/session", async (route) => {
      const res = await route.fetch();
      const j = await res.json();
      j.worldUrl = `ws://localhost:${port}`;
      j.worldToken = "dev:912:Cai:member,builder,admin";
      await route.fulfill({ response: res, json: j });
    });
    await page.addInitScript((t) => {
      localStorage.setItem("yutopia:token", t);
      localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high" }));
    }, tok);
  }
  await page.goto(process.env.LOOK ? `${base}/?look=${process.env.LOOK}` : `${base}/`);
  if (process.env.TEX_WHO) await page.evaluate(() => ((window as any).__texWho = true));
  await page.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 240_000 },
  );
  const cdp = await page.context().newCDPSession(page);
  const go = async (to: { x: number; y: number; level: number }, ms: number) => {
    await page.evaluate((p) => (window as any).__yutopia.teleport(p), to);
    await page.waitForTimeout(ms);
  };
  const browserCounts = async (): Promise<Sample> => {
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(300);
    return page.evaluate(() => {
      const w = (window as any).__yutopia;
      const tp = w.tp;
      const info = tp.renderer.info;
      const ph = tp.physics?.counts?.() ?? {};
      const g = tp.around?.grounds?.stats?.() ?? {};
      // (the life look's garment cache: a file a garment, loaded the first time someone wears it and kept —
      // it fills as new people come, to the wardrobe's size: counted apart, as the land's chunks are)
      const held = (window as any).__lifeHeld?.() ?? { files: 0, textures: 0, MB: 0 };
      // (the textures the scene uses, by uuid — what's new since the last cycle described, to find a
      // texture's kind when they grow: TEX_WHO=1)
      const used = new Map<string, string>();
      tp.scene.traverse((o: any) => {
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) {
          // (no named helpers in here: tsx's __name isn't the page's)
          for (const [k, v] of [
            ...Object.entries(m),
            ...Object.entries(m.uniforms ?? {}).map(([k, u]) => [k, (u as any)?.value] as [string, any]),
          ]) {
            if (!(v as any)?.isTexture || used.has((v as any).uuid)) continue;
            const img = (v as any).image ?? {};
            used.set(
              (v as any).uuid,
              `${(v as any).constructor?.name ?? "?"} ${k} ${img.width ?? "?"}x${img.height ?? "?"} on ${m.type}${m.name ? ` ${m.name}` : ""} (${o.name || o.type})`,
            );
          }
        }
      });
      const w2 = window as any;
      const was: Set<string> = w2.__texWas ?? new Set();
      const fresh = [...used].filter(([id]) => !was.has(id)).map(([, d]) => d);
      w2.__texWas = new Set(used.keys());
      return {
        heapMB: ((performance as any).memory?.usedJSHeapSize ?? 0) / 1e6 - held.MB,
        geometries: info.memory.geometries,
        textures: info.memory.textures - held.textures,
        wearFiles: held.files,
        texUsed: used.size,
        texFresh: fresh.length,
        texWho: (window as any).__texWho ? fresh.slice(0, 40) : undefined,
        programs: info.programs?.length ?? 0,
        joltMB: (ph.heap ?? 0) / 1e6,
        bodies: ph.bodies ?? 0,
        blocks: g.blocks ?? 0,
        chunks: g.chunks ?? 0,
        people: tp.people3?.size ?? 0,
      };
    });
  };
  const snapshot = async (): Promise<Map<string, { n: number; size: number }>> => {
    await cdp.send("HeapProfiler.collectGarbage");
    const chunks: string[] = [];
    const on = (e: { chunk: string }) => chunks.push(e.chunk);
    cdp.on("HeapProfiler.addHeapSnapshotChunk", on);
    await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
    cdp.off("HeapProfiler.addHeapSnapshotChunk", on);
    return summarize(JSON.parse(chunks.join("")));
  };
  const home = await page.evaluate(() => {
    const w = (window as any).__yutopia;
    return { ...w.meAt(), level: w.level };
  });
  let first: Map<string, { n: number; size: number }> | null = null;
  let serverFirst: Map<string, { n: number; size: number }> | null = null;
  for (let c = 1; c <= cycles; c++) {
    // up and down the floors
    for (const level of [0, 1, 2, 3, 4]) await go({ ...home, level }, 2500);
    // out to the lot, then down the long road and back
    await go({ x: -23, y: 24, level: 0 }, 4000);
    if (!process.env.NO_ROAD) for (const [x, z] of ROAD) await go({ x, y: z, level: 0 }, 8000);
    await go(home, 4000);
    // things put down and taken away
    for (let k = 0; k < 6; k++) {
      const id = `mem-${c}-${k}`;
      await page.evaluate(
        ([i, p]) => (window as any).__yutopia.send("obj:put", { id: i, kind: "plant", x: p.x, y: p.y, yaw: 0 }),
        [id, { x: Math.floor(home.x) + 1 + k, y: Math.floor(home.y) - 2 }] as const,
      );
      await page.waitForTimeout(400);
      await page.evaluate((i) => (window as any).__yutopia.send("obj:remove", { id: i }), id);
      await page.waitForTimeout(400);
    }
    // a third of the people leave and others come
    const n = Math.max(1, Math.floor(bots / 3));
    await depart(n);
    for (let i = 0; i < n; i++) await arrive();
    // still
    await page.waitForTimeout(idleS * 1000);
    const row = { cycle: c, browser: await browserCounts(), server: await serverCounts() };
    rows.push(row);
    console.log(JSON.stringify(row, (_, v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v)));
    if (c === Number(process.env.SERVER_FROM ?? 1)) serverFirst = await serverSnapshot();
    if (c === 1) {
      first = await snapshot();
      // (what the page's heap is, the biggest kinds)
      const top = [...first].sort((a, b) => b[1].size - a[1].size).slice(0, 15);
      console.log("the page's heap, the biggest kinds (first cycle):");
      for (const [k, v] of top) console.log(`  ${(v.size / 1e6).toFixed(1)} MB  ×${v.n}  ${k}`);
    }
  }

  // ── the budgets: against the first (warm) cycle, and the trend over the rest ──
  // (`cap`: a cache that grows to its cap and stays there — the land's chunks, least lately used out
  // past it: shared grounds.ts setChunkCap — over the cap is the fault; `trend`: what follows where
  // people are, judged only by creeping)
  const LIMITS: Record<string, { pct: number; abs: number; cap?: number; trend?: boolean }> = {
    "browser.heapMB": { pct: 10, abs: 15 },
    "browser.geometries": { pct: 5, abs: 20 },
    "browser.textures": { pct: 5, abs: 10 },
    "browser.programs": { pct: 0, abs: 3 },
    "browser.joltMB": { pct: 10, abs: 4 },
    "browser.bodies": { pct: 10, abs: 50 },
    "browser.blocks": { pct: 20, abs: 4 },
    "browser.chunks": { pct: 0, abs: 0, cap: 1500 },
    // (the life look: the wardrobe's files, two genders' — plan 73 phase 11)
    "browser.wearFiles": { pct: 0, abs: 0, cap: 240 },
    "server.heapMB": { pct: 10, abs: 20 },
    "server.rssMB": { pct: 15, abs: 60 },
    "server.joltMB": { pct: 10, abs: 4, trend: true },
    "server.bodies": { pct: 10, abs: 50, trend: true },
    "server.chunks": { pct: 0, abs: 0, cap: 4000 },
    // (a walk grid a person a floor they've been on: as many as there are people, give or take)
    "server.places": { pct: 0, abs: bots + 6 },
    "server.waiting": { pct: 0, abs: 2 },
    "server.handlers": { pct: 0, abs: 0 },
  };
  const get = (r: (typeof rows)[number], k: string) => {
    const [side, name] = k.split(".") as ["browser" | "server", string];
    return r[side][name] ?? 0;
  };
  const crossed: string[] = [];
  if (rows.length >= 2) {
    const a = rows[0];
    const z = rows[rows.length - 1];
    for (const [k, l] of Object.entries(LIMITS)) {
      const v0 = get(a, k);
      const v1 = get(z, k);
      // (the life look's textures: three more a garment file the cache took in — its maps and its cloth's,
      // kept to the wardrobe's size; a visitor coming and going again adds none: plan 73 phase 11)
      const wear =
        k === "browser.textures" ? 3 * Math.max(0, get(z, "browser.wearFiles") - get(a, "browser.wearFiles")) : 0;
      const allowed = Math.max((v0 * l.pct) / 100, l.abs) + wear;
      // (the trend: every cycle after the first higher than the one before, by more than a fifth of
      // what's allowed — creeping, even if not past the budget yet)
      const vs = rows.map((r) => get(r, k));
      const creeping = vs.length >= 4 && vs.slice(1).every((v, i) => v - vs[i] > allowed / 5);
      const ok = l.cap !== undefined ? Math.max(...vs) <= l.cap : (l.trend || v1 - v0 <= allowed) && !creeping;
      console.log(
        `${ok ? "ok  " : "OVER"} ${k.padEnd(20)} ${vs.map((v) => Math.round(v * 10) / 10).join(" → ")}  (${l.cap !== undefined ? `cap ${l.cap}` : `allowed +${Math.round(allowed * 10) / 10}${l.trend ? ", trend only" : ""}`}${creeping && l.cap === undefined ? ", creeping" : ""})`,
      );
      if (!ok) crossed.push(k);
    }
  }
  failed = crossed.length > 0;
  if (crossed.includes("browser.heapMB") && first) {
    console.log("what grew in the page's heap (by kind, first cycle → last):");
    for (const d of grewOf(first, await snapshot())) console.log(`  +${(d.ds / 1e6).toFixed(2)} MB  +${d.dn}  ${d.k}`);
  }
  if ((crossed.includes("server.heapMB") || process.env.SERVER_DIFF) && serverFirst) {
    console.log("what grew in the world-server's heap (by kind, first cycle → last):");
    for (const d of grewOf(serverFirst, await serverSnapshot()))
      console.log(`  +${(d.ds / 1e6).toFixed(2)} MB  +${d.dn}  ${d.k}`);
  }
  if (outFile) writeFileSync(outFile, JSON.stringify({ rows, crossed }, null, 1));
  console.log(failed ? `memcheck: OVER — ${crossed.join(", ")}` : "memcheck: ok");
} finally {
  await depart(live.length);
  await browser?.close();
  server.kill("SIGTERM");
}
process.exit(failed ? 1 : 0);

/** A heap snapshot's nodes, by kind and name: how many, their own size. */
function summarize(snap: any): Map<string, { n: number; size: number }> {
  const f: string[] = snap.snapshot.meta.node_fields;
  const types: string[] = snap.snapshot.meta.node_types[0];
  const [ti, ni, si] = [f.indexOf("type"), f.indexOf("name"), f.indexOf("self_size")];
  const step = f.length;
  const out = new Map<string, { n: number; size: number }>();
  const nodes: number[] = snap.nodes;
  for (let i = 0; i < nodes.length; i += step) {
    const type = types[nodes[i + ti]];
    if (type !== "object" && type !== "closure" && type !== "array" && type !== "native") continue;
    const k = `${type}:${snap.strings[nodes[i + ni]]}`;
    const e = out.get(k) ?? { n: 0, size: 0 };
    e.n++;
    e.size += nodes[i + si];
    out.set(k, e);
  }
  return out;
}
