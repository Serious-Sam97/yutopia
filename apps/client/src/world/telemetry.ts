// How the game runs for this player, sent to the server (docs/plan/39-the-telemetry.md):
// every ~30 s a report of the window — the frames (from the frame timer's tally, every frame
// counted), where they were and how they were looking, the machine and browser, the ping.
// The world-server adds who they are and stores it for the admins' page. Loaded on its own
// once the world is joined (the page doesn't carry it).
import type { PerfReport } from "@yutopia/shared";
import type { Room } from "colyseus.js";
import { prefs } from "@/lib/prefs";
import { VERSION } from "@/lib/version";
import type { WorldController } from "./controller";
import type { FramePerf } from "./perf";
import { hud } from "./store";

const EVERY_MS = 30_000;
const PING_MS = 5_000;
const NEAR = 12; // tiles: people counted round me
const session =
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);

// what's read off the controller (some of it private there: this is its own instrument)
interface Ctl {
  stopped: boolean;
  framePerf: WorldController["framePerf"];
  room: Room | null;
  level: number;
  hour: number;
  me: { x: number; y: number };
  viewNow: "none" | "3d";
  cars: { inCar(): boolean } | null;
  tp: {
    renderer: {
      info: { autoReset: boolean; reset(): void; render: { calls: number } };
      getPixelRatio(): number;
      getContext(): WebGLRenderingContext;
      domElement: HTMLCanvasElement;
    };
    below3?: { count: number };
    people3?: Map<string, { root: unknown }>;
    floors?: Map<number, { world: { root: unknown } }>;
    around?: { grounds?: { root: unknown } | null };
    ratioAtStart: number;
    dprAtStart: number;
    ratioFixes: number;
  } | null;
  qualityNow(): string;
  onFrame(cb: () => void): () => void;
  quality?: { fpsCap(now: number): number };
}

/** Since the last report: frame times and gaps in 0.5 ms buckets (the last: 100 ms and
 *  over), the worst of each, stage time summed. */
interface Tally {
  frames: Uint32Array;
  gaps: Uint32Array;
  worst: number;
  gapWorst: number;
  stages: Map<string, number>;
  /** this frame's stages so far, and the worst frame's (plan 90 phase 1) */
  cur: Map<string, number>;
  worstStages: Map<string, number>;
  /** frames that came late with the main thread done: waiting on the GPU (past the frame cap) */
  waited: number;
}
const bucket = (ms: number) => Math.min(200, (ms * 2) | 0);

// The frame timer's own begin / lap / end, counted into the tally too: wrapped on its
// instance from here (the page's frame timer stays as it was; these come with this chunk).
function count(perf: FramePerf, get: () => Tally, cap: () => number): () => void {
  const { begin, lap, end } = perf;
  let last = 0;
  let t0 = 0;
  let work = 0; // the frame before's main-thread time
  // (behind the loading screen: not play's frames — a report's first window read its slow frames; the user's
  // fps counter did too, 2026-11-15)
  let loading = false;
  perf.begin = function (this: FramePerf) {
    const t = begin.call(this);
    loading = hud.get().loading.on;
    if (loading) {
      last = 0;
      work = 0;
      return t;
    }
    const y = get();
    if (last) {
      const g = t - last;
      y.gaps[bucket(g)]++;
      if (g > y.gapWorst) y.gapWorst = g;
      // (late with the main thread long done — not the frame cap's wait: the GPU's, or the browser's)
      const c = cap();
      if (work > 0 && g > work + 8 && g > work * 1.5 && g > (c > 0 ? 1000 / c : 0) * 1.2) y.waited++;
    }
    last = t0 = t;
    y.cur.clear();
    return t;
  };
  perf.lap = function (this: FramePerf, stage: string, from: number) {
    const t = lap.call(this, stage, from);
    if (loading) return t;
    const y = get();
    y.stages.set(stage, (y.stages.get(stage) ?? 0) + t - from);
    y.cur.set(stage, (y.cur.get(stage) ?? 0) + t - from);
    return t;
  };
  perf.end = function (this: FramePerf) {
    end.call(this);
    if (loading) return;
    const ms = performance.now() - t0;
    work = ms;
    const y = get();
    y.frames[bucket(ms)]++;
    if (ms > y.worst) {
      y.worst = ms;
      y.worstStages = new Map(y.cur);
    }
  };
  return () => {
    // (back to the class's own)
    delete (perf as Partial<FramePerf>).begin;
    delete (perf as Partial<FramePerf>).lap;
    delete (perf as Partial<FramePerf>).end;
  };
}

const fresh = (): Tally => ({
  frames: new Uint32Array(201),
  gaps: new Uint32Array(201),
  worst: 0,
  gapWorst: 0,
  stages: new Map(),
  cur: new Map(),
  worstStages: new Map(),
  waited: 0,
});

// a percentile of a 0.5 ms histogram (its bucket's middle; the last bucket: the worst seen)
function pct(h: Uint32Array, n: number, p: number, worst: number): number {
  if (!n) return 0;
  const want = Math.ceil(n * p);
  let seen = 0;
  for (let i = 0; i < h.length; i++) {
    seen += h[i];
    if (seen >= want) return i === h.length - 1 ? worst : i / 2 + 0.25;
  }
  return worst;
}
const sum = (h: Uint32Array, from = 0) => {
  let s = 0;
  for (let i = from; i < h.length; i++) s += h[i];
  return s;
};
const r1 = (v: number) => Math.round(v * 10) / 10;

function browserOf(ua: string): { browser: string; os: string } {
  let browser = "Other";
  for (const [name, re] of [
    ["Edge", /Edg\/(\d+)/],
    ["Firefox", /Firefox\/(\d+)/],
    ["Chrome", /Chrome\/(\d+)/],
    ["Safari", /Version\/(\d+).*Safari/],
  ] as const) {
    const v = re.exec(ua)?.[1];
    if (v) {
      browser = `${name} ${v}`;
      break;
    }
  }
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "Other";
  return { browser, os };
}

// (asked once a context: the GPU's name doesn't change, and asking it waits on the GPU — ~12 ms at every report, a
// frame lost now and then: plan 121's specs)
const gpuNames = new WeakMap<object, string>();
function gpuOf(gl: WebGLRenderingContext | null | undefined): string {
  if (!gl) return "";
  const had = gpuNames.get(gl);
  if (had !== undefined) return had;
  let name = "";
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
  } catch {
    name = "";
  }
  gpuNames.set(gl, name);
  return name;
}

/** Starts the reports; they stop with the controller (or by what this returns). */
export function startTelemetry(controller: WorldController): () => void {
  const c = controller as unknown as Ctl;
  if (c.stopped) return () => {};
  const perf = c.framePerf;
  let tally = fresh();
  const uncount = count(
    perf,
    () => tally,
    () => c.quality?.fpsCap(performance.now()) ?? 0,
  );
  let from = performance.now();
  let reconnects = 0;
  let room: Room | null = null;
  let offPong: (() => void) | null = null;
  const pings: number[] = [];
  // long tasks over the window
  const long = { n: 0, worst: 0 };
  let watch: PerformanceObserver | null = null;
  try {
    watch = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        long.n++;
        if (e.duration > long.worst) long.worst = e.duration;
      }
    });
    watch.observe({ type: "longtask", buffered: false });
  } catch {
    watch = null; // (not in every browser)
  }
  // the share of the window the tab was hidden
  let hiddenMs = 0;
  let hiddenAt = document.hidden ? performance.now() : 0;
  const onVis = () => {
    const now = performance.now();
    if (document.hidden) hiddenAt = now;
    else if (hiddenAt) {
      hiddenMs += now - hiddenAt;
      hiddenAt = 0;
    }
  };
  document.addEventListener("visibilitychange", onVis);

  // the room I'm in (a reconnect is another one): its pong
  const watchRoom = () => {
    if (c.room === room) return;
    if (room) reconnects++;
    offPong?.();
    room = c.room;
    offPong = room ? room.onMessage("perf:pong", (m: { t: number }) => pings.push(performance.now() - m.t)) : null;
  };
  watchRoom();

  // 3D: one frame's draw calls, every pass (the renderer counts one render() at a time)
  let draws: number | null = null;
  // (and by where they come from — plan 90 phase 1: the nearest of these up the tree)
  let drawsBy: Record<string, number> | null = null;
  let sampling: (() => void) | null = null;
  const sampleDraws = () => {
    const tp = c.tp;
    if (!tp || sampling) return;
    const info = tp.renderer.info;
    const R = tp.renderer as unknown as { renderBufferDirect: (...a: unknown[]) => unknown };
    let started = false;
    let rbd: ((...a: unknown[]) => unknown) | null = null;
    sampling = c.onFrame(() => {
      if (!started) {
        // (from this frame's end to the next's)
        info.autoReset = false;
        info.reset();
        started = true;
        const roots = new Map<unknown, string>();
        if (tp.around?.grounds?.root) roots.set(tp.around.grounds.root, "grounds");
        for (const b of tp.floors?.values() ?? []) roots.set(b.world.root, "floors");
        for (const p of tp.people3?.values() ?? []) roots.set(p.root, "people");
        const by: Record<string, number> = {};
        drawsBy = by;
        const own = R.renderBufferDirect;
        rbd = own;
        R.renderBufferDirect = function (this: unknown, ...a: unknown[]) {
          let k = "other";
          for (let o = a[4] as { parent?: unknown; name?: string } | null; o; o = o.parent as typeof o) {
            const r = roots.get(o);
            if (r) {
              k = r;
              break;
            }
            if (o.name === "cars") {
              k = "cars";
              break;
            }
          }
          by[k] = (by[k] ?? 0) + 1;
          return own.apply(this, a);
        };
        return;
      }
      draws = info.render.calls;
      info.autoReset = true;
      if (rbd) R.renderBufferDirect = rbd;
      rbd = null;
      sampling?.();
      sampling = null;
    });
  };

  let machine: PerfReport["machine"] | null = null;
  const machineNow = (): PerfReport["machine"] => {
    const canvas = c.tp?.renderer.domElement;
    const base = machine ?? {
      ...browserOf(navigator.userAgent),
      gpu: gpuOf(c.tp?.renderer.getContext()),
      screen: [screen.width, screen.height] as [number, number],
      canvas: [0, 0] as [number, number],
      dpr: devicePixelRatio,
      cores: navigator.hardwareConcurrency ?? 0,
      memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      ratio: null,
      ratioAtStart: null,
      dprAtStart: null,
      ratioFixes: null,
    };
    if (!base.gpu) base.gpu = gpuOf(c.tp?.renderer.getContext());
    machine = base;
    const tp = c.tp;
    return {
      ...base,
      canvas: canvas ? [canvas.width, canvas.height] : base.canvas,
      dpr: devicePixelRatio,
      ratio: tp ? tp.renderer.getPixelRatio() : null,
      ratioAtStart: tp?.ratioAtStart || null,
      dprAtStart: tp?.dprAtStart || null,
      ratioFixes: tp ? tp.ratioFixes : null,
    };
  };

  const send = () => {
    watchRoom();
    const now = performance.now();
    const t = tally;
    tally = fresh();
    const secs = (now - from) / 1000;
    from = now;
    let hid = hiddenMs + (hiddenAt ? now - hiddenAt : 0);
    hiddenMs = 0;
    if (hiddenAt) hiddenAt = now;
    hid = Math.min(1, hid / 1000 / Math.max(0.001, secs));
    const n = sum(t.frames);
    const pingsNow = pings.splice(0).sort((a, b) => a - b);
    const longNow = { n: long.n, worst: r1(long.worst) };
    long.n = 0;
    long.worst = 0;
    // (nothing drawn — hidden all along, or loading —: nothing to say)
    if (!room || n < 10 || hid > 0.95) return;
    const stages: Record<string, number> = {};
    for (const [k, v] of t.stages) stages[k] = Math.round((v / n) * 100) / 100;
    const h = hud.get();
    const p = prefs();
    let near = 0;
    room.state?.players?.forEach((o: { x: number; y: number; level?: number }, sid: string) => {
      if (sid !== room?.sessionId && (o.level ?? 0) === c.level && Math.hypot(o.x - c.me.x, o.y - c.me.y) < NEAR)
        near++;
    });
    const report: PerfReport = {
      session,
      client: { version: VERSION.version, commit: VERSION.commit },
      secs: r1(secs),
      hidden: Math.round(hid * 100) / 100,
      frames: {
        fps: r1(n / secs),
        med: pct(t.frames, n, 0.5, t.worst),
        p95: pct(t.frames, n, 0.95, t.worst),
        worst: r1(t.worst),
        gapP95: pct(t.gaps, sum(t.gaps), 0.95, t.gapWorst),
        gapWorst: r1(t.gapWorst),
        over33: sum(t.frames, 66),
        over50: sum(t.frames, 100),
      },
      long: longNow,
      stages,
      draws: c.tp ? draws : null,
      culled: c.tp?.below3?.count ?? null,
      where: {
        level: c.level,
        area: h.me?.area ?? "",
        x: r1(c.me.x),
        y: r1(c.me.y),
        view: c.viewNow === "none" ? "none" : p.view,
        quality: c.qualityNow(),
        qualityPref: p.quality,
        maxFps: p.maxFps,
        hour: Math.round(c.hour * 100) / 100,
        near,
        inCar: !!c.cars?.inCar(),
      },
      machine: machineNow(),
      net: {
        pingMed: pingsNow.length ? Math.round(pingsNow[pingsNow.length >> 1]) : null,
        pingP95: pingsNow.length ? Math.round(pingsNow[Math.floor(pingsNow.length * 0.95)]) : null,
        reconnects,
      },
      detail: {
        worstStages: Object.fromEntries([...t.worstStages].map(([k, v]) => [k, Math.round(v * 100) / 100])),
        waited: Math.round((t.waited / Math.max(1, n)) * 1000) / 1000,
        people: c.tp?.people3 ? c.tp.people3.size : null,
        drawsBy: c.tp ? drawsBy : null,
      },
    };
    try {
      room.send("perf:report", report);
    } catch {
      // (the line just dropped: the next window says it)
    }
    draws = null;
    drawsBy = null;
    sampleDraws();
  };

  const timers = [
    setInterval(send, EVERY_MS),
    setInterval(() => {
      if (c.stopped) return stop(); // (the world left: done)
      watchRoom();
      if (draws === null) sampleDraws(); // (3D built since: its draws)
      try {
        room?.send("perf:ping", { t: performance.now() });
      } catch {
        // (between rooms)
      }
    }, PING_MS),
  ];
  sampleDraws();
  // the window so far, as the page goes (before its goodbye closes the line)
  const onHide = () => send();
  window.addEventListener("pagehide", onHide);

  const stop = () => {
    for (const t of timers) clearInterval(t);
    window.removeEventListener("pagehide", onHide);
    document.removeEventListener("visibilitychange", onVis);
    offPong?.();
    sampling?.();
    watch?.disconnect();
    uncount();
  };
  return stop;
}
