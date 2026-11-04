/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// docs/plan/69-the-long-road.md, phases 2 and 9: the streaming soaked up and down Long Pine Road.
//   - an offline world-server of its own, a bot going up and down the road at 50 m/s (teleported:
//     the server's physics builds the land round it, takes it out behind);
//   - the game as Cai (Cai, not Ana: whoever's playing as Ana keeps their tab), its land stream and
//     camera taken up and down the road at 50 m/s too (the view's own update handed that path
//     instead of Cai's feet) — the blocks, the districts, the chunks made and freed as it goes;
//   - every 10 s: the browser's worst frame and 95th percentile, its heap, what the stream holds;
//     the server's heap, its resident memory, the chunks kept and built.
//   node --experimental-strip-types e2e/stream-soak.mts [minutes] [out.json]
//   QUALITY=high|medium|low (high); SPEED=50 (m/s); PORT=2671; PROFILE=1 [PROFILE_AFTER=s] [FOCUS=f [CALLERS=g]]
import { type ChildProcess, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, request } from "@playwright/test";
import { SPINE } from "@yutopia/shared/longroad";
import { Client } from "colyseus.js";

const minutes = Number(process.argv[2] ?? 3);
const outFile = process.argv[3] ? resolve(process.argv[3]) : null;
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const quality = process.env.QUALITY ?? "high";
const speed = Number(process.env.SPEED ?? 50);
const port = Number(process.env.PORT ?? 2671);
const OX = 60; // the land's coords → the ground floor's (a teleport's)
const OZ = 10;
// the road, its line every 20 m (shared longroad.ts SPINE)
const ROAD: [number, number][] = SPINE.filter((_, i) => i % 20 === 0).map(([x, z]): [number, number] => [x, z]);
const along = [0];
for (let i = 1; i < ROAD.length; i++)
  along.push(along[i - 1] + Math.hypot(ROAD[i][0] - ROAD[i - 1][0], ROAD[i][1] - ROAD[i - 1][1]));
const LENGTH = along[along.length - 1];
/** where the path is s metres along (there and back again) */
function at(s: number): [number, number, number] {
  const m = s % (2 * LENGTH);
  const d = m < LENGTH ? m : 2 * LENGTH - m;
  let i = 0;
  while (i < ROAD.length - 2 && along[i + 1] < d) i++;
  const t = (d - along[i]) / (along[i + 1] - along[i]);
  const x = ROAD[i][0] + (ROAD[i + 1][0] - ROAD[i][0]) * t;
  const z = ROAD[i][1] + (ROAD[i + 1][1] - ROAD[i][1]) * t;
  const dir = m < LENGTH ? 1 : -1;
  const a = Math.atan2((ROAD[i + 1][1] - ROAD[i][1]) * dir, (ROAD[i + 1][0] - ROAD[i][0]) * dir);
  return [x, z, a];
}

// ── the world-server ──
const ws = resolve(import.meta.dirname, "../../world-server");
const server: ChildProcess = spawn("npx", ["tsx", "src/index.ts"], {
  cwd: ws,
  env: {
    ...process.env,
    PORT: String(port),
    YUTOPIA_OFFLINE: "1",
    YUTOPIA_WORLD_SECRET: "soak",
    YUTOPIA_INTERNAL_SECRET: "soak",
    YUTOPIA_WEATHER: "winter",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise<void>((done, fail) => {
  const t = setTimeout(() => fail(new Error("the world-server didn't start")), 90_000);
  server.stdout?.on("data", (b: Buffer) => {
    const s = b.toString();
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
  for (const m of text.matchAll(/^yutopia_(\w+) (\S+)$/gm)) out[m[1]] = Number(m[2]);
  return out;
};

const stop: (() => void)[] = [];
const results: Record<string, unknown>[] = [];
try {
  // ── the bot: up and down the road at `speed` ──
  const bot = await new Client(`ws://localhost:${port}`).joinOrCreate("world", {
    token: "dev:910:Soak:member,builder,admin",
  });
  bot.onMessage("*", () => {});
  const t0 = Date.now();
  const botTimer = setInterval(() => {
    const [x, z] = at(((Date.now() - t0) / 1000) * speed + 1500);
    bot.send("teleport", { to: { x: x + OX, y: z + OZ, level: 0 } });
  }, 250);
  stop.push(() => clearInterval(botTimer));

  // ── the browser ──
  const ctx = await request.newContext();
  const tok = (
    await (
      await ctx.post(`${api}/api/login`, {
        data: { email: "cai@yutopia.test", password: pass },
        headers: { Accept: "application/json" },
      })
    ).json()
  ).token;
  const browser = await chromium.launch({
    channel: "chromium",
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-precise-memory-info"],
  });
  stop.push(() => void browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("  page:", e.message));
  await page.route("**/api/session", async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    j.worldUrl = `ws://localhost:${port}`;
    j.worldToken = "dev:911:Cai:member,builder,admin";
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
  // (out on the ground, at the road's start: the 3D view's Grounds there)
  await page.evaluate((to) => (window as any).__yutopia.teleport(to), { x: 600 + OX, y: -405 + OZ, level: 0 });
  await page.waitForFunction(() => !!(window as any).__yutopia.tp?.around?.grounds, null, { timeout: 60_000 });
  await page.waitForTimeout(8000);
  // the path handed to the stream and the camera; the frames timed
  await page.evaluate(
    ([road, sp]) => {
      const win = window as any;
      const tp = win.__yutopia.tp;
      const g = tp.around.grounds;
      const L: number[] = [0];
      for (let i = 1; i < road.length; i++)
        L.push(L[i - 1] + Math.hypot(road[i][0] - road[i - 1][0], road[i][1] - road[i - 1][1]));
      const len = L[L.length - 1];
      const at = (s: number) => {
        const m = s % (2 * len);
        const d = m < len ? m : 2 * len - m;
        let i = 0;
        while (i < road.length - 2 && L[i + 1] < d) i++;
        const t = (d - L[i]) / (L[i + 1] - L[i]);
        const dir = m < len ? 1 : -1;
        return {
          x: road[i][0] + (road[i + 1][0] - road[i][0]) * t,
          z: road[i][1] + (road[i + 1][1] - road[i][1]) * t,
          dx: ((road[i + 1][0] - road[i][0]) * dir) / (L[i + 1] - L[i]),
          dz: ((road[i + 1][1] - road[i][1]) * dir) / (L[i + 1] - L[i]),
        };
      };
      const S = { t0: performance.now(), p: at(0) };
      win.__soak = S;
      const V3 = tp.camera.position.constructor;
      const base = g.root.getWorldPosition(new V3());
      const up = g.update.bind(g);
      g.update = (_x: number, _z: number, _cam: any, _target: any) => {
        S.p = at(((performance.now() - S.t0) / 1000) * sp);
        const p = S.p;
        const h = g.heightAt(p.x, p.z);
        const cam = new V3(base.x + p.x - p.dx * 9, base.y + h + 3.4, base.z + p.z - p.dz * 9);
        const target = new V3(base.x + p.x, base.y + h + 1, base.z + p.z);
        return up(p.x, p.z, cam, target);
      };
      const post = tp.post;
      const r0 = post.render.bind(post);
      post.render = (moving: boolean, over: any) => {
        const p = S.p;
        const h = g.heightAt(p.x, p.z);
        tp.camera.position.set(base.x + p.x - p.dx * 9, base.y + h + 3.4, base.z + p.z - p.dz * 9);
        tp.camera.lookAt(base.x + p.x + p.dx * 30, base.y + h + 1.2, base.z + p.z + p.dz * 30);
        tp.camera.updateMatrixWorld(true);
        return r0(moving, over);
      };
      // (DEBUG: the slow steps of what's made — the statics' and districts' steps, the stream's frame)
      win.__slow = [];
      const G3 = g.statics.constructor.prototype;
      const s0 = G3.step;
      G3.step = function (this: any) {
        const name = String(this.pending?.[0] ?? "").slice(0, 90);
        const t = performance.now();
        const r = s0.call(this);
        const d = performance.now() - t;
        if (d > 25) win.__slow.push(`step ${Math.round(d)} ms ${this.o?.part}: ${name}`);
        return r;
      };
      const u0 = g.update;
      g.update = (...a: any[]) => {
        const t = performance.now();
        const r = u0(...a);
        const d = performance.now() - t;
        if (d > 25) win.__slow.push(`update ${Math.round(d)} ms`);
        return r;
      };
      // the frames
      win.__frames = [];
      let last = performance.now();
      const tick = (t: number) => {
        win.__frames.push(t - last);
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    [ROAD, speed] as const,
  );
  console.log(`soaking ${minutes} min at ${speed} m/s, ${quality}…`);
  // (PROFILE=1: the page's CPU profile over 25 s — the functions most of it went to, their own time)
  if (process.env.PROFILE) {
    // (PROFILE_AFTER=40: from 40 s on — the mountains at 50 m/s)
    await page.waitForTimeout(Number(process.env.PROFILE_AFTER ?? 0) * 1000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    await page.waitForTimeout(25_000);
    const { profile } = (await cdp.send("Profiler.stop")) as any;
    const self = new Map<string, number>();
    const dt = new Map<number, number>();
    for (let i = 0; i < profile.samples.length; i++)
      dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
    for (const n of profile.nodes) {
      const f = n.callFrame;
      const k = `${f.functionName || "(anon)"} ${String(f.url).split("/").pop()}:${f.lineNumber}`;
      self.set(k, (self.get(k) ?? 0) + (dt.get(n.id) ?? 0));
    }
    for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25))
      console.log(`  ${Math.round(v)} ms  ${k}`);
    // (and under one function — FOCUS=wayStep: what its time went to, by function, its own time)
    const focus = process.env.FOCUS;
    if (focus) {
      const byId = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
      const under = new Map<string, number>();
      const walk = (id: number) => {
        const n = byId.get(id);
        const f = n.callFrame;
        const k = `${f.functionName || "(anon)"} ${String(f.url).split("/").pop()}:${f.lineNumber}`;
        under.set(k, (under.get(k) ?? 0) + (dt.get(id) ?? 0));
        for (const c of n.children ?? []) walk(c);
      };
      for (const n of profile.nodes) if (n.callFrame.functionName === focus) walk(n.id);
      // (CALLERS=groundAt: who calls that, within it — the parent chains' functions, by time)
      const callee = process.env.CALLERS;
      if (callee) {
        const parent = new Map<number, number>();
        for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
        const incl = (id: number): number =>
          (dt.get(id) ?? 0) + (byId.get(id).children ?? []).reduce((a: number, c: number) => a + incl(c), 0);
        const by = new Map<string, number>();
        for (const n of profile.nodes) {
          if (n.callFrame.functionName !== callee) continue;
          const chain: string[] = [];
          let p = parent.get(n.id);
          let inFocus = false;
          while (p !== undefined) {
            const f = byId.get(p).callFrame;
            if (chain.length < 4) chain.push(`${f.functionName || "(anon)"}:${f.lineNumber}`);
            if (f.functionName === focus) inFocus = true;
            p = parent.get(p);
          }
          if (inFocus) by.set(chain.join(" < "), (by.get(chain.join(" < ")) ?? 0) + incl(n.id));
        }
        console.log(`  ${callee} called (within ${focus}) from:`);
        for (const [k, v] of [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8))
          console.log(`    ${Math.round(v)} ms  ${k}`);
      }
      console.log(`  under ${focus}:`);
      for (const [k, v] of [...under.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15))
        console.log(`    ${Math.round(v)} ms  ${k}`);
    }
  }
  const end = Date.now() + minutes * 60_000;
  while (Date.now() < end) {
    await page.waitForTimeout(10_000);
    const b = await page.evaluate(() => {
      const win = window as any;
      const f: number[] = win.__frames.splice(0);
      f.sort((a, b) => a - b);
      const g = win.__yutopia.tp.around.grounds;
      return {
        frames: f.length,
        worst: Math.round(f[f.length - 1] ?? 0),
        p95: Math.round(f[Math.floor(f.length * 0.95)] ?? 0),
        median: Math.round(f[Math.floor(f.length / 2)] ?? 0),
        heapMB: Math.round(((performance as any).memory?.usedJSHeapSize ?? 0) / 1e6),
        at: Math.round(win.__soak.p.x),
        slow: win.__slow.splice(0).slice(0, 6),
        // (what's drawn: the scene's visible meshes, instances times their triangles, thousands — the
        // biggest few by name or kind)
        ...(() => {
          const by = new Map<string, number>();
          let all = 0;
          const walk = (o: any) => {
            if (!o.visible) return;
            if (o.isMesh && o.geometry) {
              const g = o.geometry;
              const t = (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;
              const n = o.isInstancedMesh ? o.count : 1;
              const k = `${o.isInstancedMesh ? "inst" : "mesh"}:${g.attributes.position?.count ?? 0}`;
              by.set(k, (by.get(k) ?? 0) + t * n);
              all += t * n;
            }
            for (const c of o.children) walk(c);
          };
          walk(win.__yutopia.tp.scene);
          const top = [...by]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([k, v]) => `${k} ${Math.round(v / 1000)}k`);
          // (the land's tree pools: kind, instances, vertices each)
          const pools = (g as any).pools.map(
            (p: any, i: number) => `${i}:${p.mesh.count}x${p.mesh.geometry.attributes.position.count}`,
          );
          return { ktris: Math.round(all / 1000), top, pools: pools.join(" ") };
        })(),
        ...g.stats(),
      };
    });
    const m = await metrics();
    const row = {
      t: Math.round((Date.now() - t0) / 1000),
      ...b,
      server: {
        heapMB: Math.round((m.process_heap_bytes ?? 0) / 1e6),
        rssMB: Math.round((m.process_rss_bytes ?? 0) / 1e6),
        chunks: m.grounds_chunks,
        built: m.physics_ground_chunks,
        joltMB: Math.round((m.physics_heap_bytes ?? 0) / 1e6),
        refused: m.physics_refused,
      },
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  for (const f of stop) f();
  server.kill("SIGTERM");
  if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 1));
}
// the summary: the worst of each, and how the memory went (its first minute's against its last)
const all = results as any[];
if (all.length) {
  const first = all.slice(0, 6);
  const last = all.slice(-6);
  const avg = (rs: any[], f: (r: any) => number) => Math.round(rs.reduce((a, r) => a + f(r), 0) / rs.length);
  console.log(
    JSON.stringify({
      worstFrame: Math.max(...all.map((r) => r.worst)),
      p95: Math.max(...all.map((r) => r.p95)),
      browserHeapMB: [avg(first, (r) => r.heapMB), avg(last, (r) => r.heapMB)],
      browserChunks: [avg(first, (r) => r.chunks), avg(last, (r) => r.chunks)],
      serverHeapMB: [avg(first, (r) => r.server.heapMB), avg(last, (r) => r.server.heapMB)],
      serverRssMB: [avg(first, (r) => r.server.rssMB), avg(last, (r) => r.server.rssMB)],
      serverChunks: Math.max(...all.map((r) => r.server.chunks)),
      serverBuilt: Math.max(...all.map((r) => r.server.built)),
      refused: Math.max(...all.map((r) => r.server.refused ?? 0)),
    }),
  );
}
process.exit(0);
