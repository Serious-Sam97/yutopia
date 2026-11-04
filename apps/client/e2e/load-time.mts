/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// How long the loading screen takes, and what it waits on (docs/plan/35-the-loading.md; the long
// road's land, docs/plan/69): an offline world-server of its own, the game as Cai (Cai, not Ana:
// whoever's playing as Ana keeps their tab), the readiness's parts and what the land stream has
// left, every 250 ms till the screen goes; PROFILE=1: the page's CPU profile over the load, the
// functions most of it went to (their own time).
//   node --experimental-strip-types e2e/load-time.mts
//   QUALITY=high|medium|low (high); PORT=2672
import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium, request } from "@playwright/test";

const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const quality = process.env.QUALITY ?? "high";
const port = Number(process.env.PORT ?? 2672);

const ws = resolve(import.meta.dirname, "../../world-server");
const server: ChildProcess = spawn("npx", ["tsx", "src/index.ts"], {
  cwd: ws,
  env: {
    ...process.env,
    PORT: String(port),
    YUTOPIA_OFFLINE: "1",
    YUTOPIA_WORLD_SECRET: "load",
    YUTOPIA_INTERNAL_SECRET: "load",
    YUTOPIA_WEATHER: "winter",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise<void>((done, fail) => {
  const t = setTimeout(() => fail(new Error("the world-server didn't start")), 90_000);
  server.stdout?.on("data", (b: Buffer) => {
    if (/world-server on/.test(b.toString())) {
      clearTimeout(t);
      done();
    }
  });
});
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
  const browser = await chromium.launch({
    channel: "chromium",
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  });
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
      const win = window as any;
      win.__load = [];
      const t0 = performance.now();
      const tick = () => {
        const h = win.__hud?.get();
        const tp = win.__yutopia?.tp;
        const g = tp?.around?.grounds;
        // (the steps of what's made, timed: by part, the slow ones by name — once the class is here)
        const G3 = tp?.around?.grounds?.statics?.constructor?.prototype;
        if (G3 && !G3.__timed) {
          G3.__timed = true;
          win.__steps = {};
          // (a way's step by its key)
          const w0 = G3.wayStep;
          G3.wayStep = function (this: any, w: any) {
            const a = performance.now();
            const r = w0.call(this, w);
            const d = performance.now() - a;
            win.__ways ??= [];
            if (d > 20) win.__ways.push(`${Math.round(d)} ms ${w.key} (${w.line.length} samples)`);
            return r;
          };
          const s0 = G3.step;
          G3.step = function (this: any) {
            const name = String(this.pending?.[0] ?? "")
              .slice(0, 60)
              .replace(/\s+/g, " ");
            const a = performance.now();
            const r = s0.call(this);
            const d = performance.now() - a;
            const k = this.o?.part ?? "?";
            win.__steps[k] ??= { n: 0, ms: 0, slow: [] as string[] };
            const e = win.__steps[k];
            e.n++;
            e.ms += d;
            if (d > 40 && e.slow.length < 12) e.slow.push(`${Math.round(d)} ms ${name}`);
            return r;
          };
        }
        win.__load.push({
          t: Math.round(performance.now() - t0),
          phase: h?.phase,
          on: h?.loading?.on,
          p: Math.round((h?.loading?.progress ?? 0) * 100),
          r: tp?.readiness ? tp.readiness() : null,
          // (an older build's stream has no stats: its load timed alone)
          left: g?.stats
            ? {
                ...g.left,
                districts: g.stats().districts,
                asked: g.stats().asked,
                made: g.stats().made,
                edits: g.stats().edits,
                rest: g.statics.left,
                kart: g.kart?.left ?? 0,
                dl: [...g.districts.values()].map((d: any) => d.left).join(","),
              }
            : null,
        });
        if (h?.phase !== "ready" || h.loading?.on !== false) setTimeout(tick, 250);
      };
      tick();
    },
    [tok, quality] as const,
  );
  const cdp = process.env.PROFILE ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
    await cdp.send("Profiler.start");
  }
  const t0 = Date.now();
  await page.goto(base);
  await page.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 300_000, polling: 250 },
  );
  console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s (${quality})`);
  const rows: any[] = await page.evaluate(() => (window as any).__load);
  // (a row a second, and when the parts change)
  let last = "";
  let lastT = -1e9;
  for (const r of rows) {
    const k = JSON.stringify([r.phase, r.on, r.r?.done, r.left?.blocks, r.left?.statics, r.left?.asked, r.left?.made]);
    if (k === last && r.t - lastT < 1000) continue;
    last = k;
    lastT = r.t;
    console.log(
      `${(r.t / 1000).toFixed(1).padStart(6)} s  ${String(r.phase).padEnd(8)} ${r.p}%  ready ${r.r ? `${r.r.done.toFixed(2)}/${r.r.of}` : "-"}  ${r.left ? `blocks ${r.left.blocks} statics ${r.left.statics} (rest ${r.left.rest}, kart ${r.left.kart}, districts ${r.left.dl}) asked ${r.left.asked} made ${r.left.made} edits ${r.left.edits}` : ""}`,
    );
  }
  const steps = await page.evaluate(() => (window as any).__steps ?? {});
  for (const [k, e] of Object.entries<any>(steps))
    console.log(`  ${k}: ${e.n} steps, ${Math.round(e.ms)} ms${e.slow.length ? `; slow: ${e.slow.join(" · ")}` : ""}`);
  console.log((await page.evaluate(() => (window as any).__ways ?? [])).join("\n"));
  if (cdp) {
    const { profile } = (await cdp.send("Profiler.stop")) as any;
    const self = new Map<string, number>();
    const dt = new Map<number, number>();
    // (WINDOW=4300-5700: only the samples between those ms after the page's start)
    const [w0, w1] = (process.env.WINDOW ?? "0-1e9").split("-").map(Number);
    // (the profile's clock against the page's: the page's now, just after it stopped)
    const start = profile.endTime - (await page.evaluate(() => performance.now())) * 1000;
    let at = profile.startTime;
    for (let i = 0; i < profile.samples.length; i++) {
      at += profile.timeDeltas[i] ?? 0;
      const ms = (at - start) / 1000;
      if (ms < w0 || ms > w1) continue;
      dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
    }
    for (const n of profile.nodes) {
      const f = n.callFrame;
      const k = `${f.functionName || "(anon)"} ${String(f.url).split("/").pop()}:${f.lineNumber}`;
      self.set(k, (self.get(k) ?? 0) + (dt.get(n.id) ?? 0));
    }
    for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30))
      console.log(`  ${Math.round(v)} ms  ${k}`);
    // (the time under each function, its callees with it — the biggest, not counted twice down a
    // chain of the same name)
    const byId = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
    const incl = new Map<string, number>();
    const walk = (id: number, on: Set<string>): number => {
      const n = byId.get(id);
      const name = `${n.callFrame.functionName || "(anon)"} ${String(n.callFrame.url).split("/").pop()}:${n.callFrame.lineNumber}`;
      let t = dt.get(id) ?? 0;
      const fresh = !on.has(name);
      if (fresh) on.add(name);
      for (const c of n.children ?? []) t += walk(c, on);
      if (fresh) {
        on.delete(name);
        incl.set(name, (incl.get(name) ?? 0) + t);
      }
      return t;
    };
    walk(profile.nodes[0].id, new Set());
    console.log("  under:");
    for (const [k, v] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 45))
      console.log(`    ${Math.round(v)} ms  ${k}`);
  }
  await browser.close();
} finally {
  server.kill("SIGTERM");
}
process.exit(0);
