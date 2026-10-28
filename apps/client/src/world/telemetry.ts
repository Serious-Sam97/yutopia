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
    ratioAtStart: number;
    dprAtStart: number;
    ratioFixes: number;
  } | null;
  qualityNow(): string;
  onFrame(cb: () => void): () => void;
}

/** Since the last report: frame times and gaps in 0.5 ms buckets (the last: 100 ms and
 *  over), the worst of each, stage time summed. */
interface Tally {
  frames: Uint32Array;
  gaps: Uint32Array;
  worst: number;
  gapWorst: number;
  stages: Map<string, number>;
}
const bucket = (ms: number) => Math.min(200, (ms * 2) | 0);

// The frame timer's own begin / lap / end, counted into the tally too: wrapped on its
// instance from here (the page's frame timer stays as it was; these come with this chunk).
function count(perf: FramePerf, get: () => Tally): () => void {
  const { begin, lap, end } = perf;
  let last = 0;
  let t0 = 0;
  perf.begin = function (this: FramePerf) {
    const t = begin.call(this);
    const y = get();
    if (last) {
      const g = t - last;
      y.gaps[bucket(g)]++;
      if (g > y.gapWorst) y.gapWorst = g;
    }
    last = t0 = t;
    return t;
  };
  perf.lap = function (this: FramePerf, stage: string, from: number) {
    const t = lap.call(this, stage, from);
    const y = get();
    y.stages.set(stage, (y.stages.get(stage) ?? 0) + t - from);
    return t;
  };
  perf.end = function (this: FramePerf) {
    end.call(this);
    const ms = performance.now() - t0;
    const y = get();
    y.frames[bucket(ms)]++;
    if (ms > y.worst) y.worst = ms;
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

function gpuOf(gl: WebGLRenderingContext | null | undefined): string {
  if (!gl) return "";
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
  } catch {
    return "";
  }
}

/** Starts the reports; they stop with the controller (or by what this returns). */
export function startTelemetry(controller: WorldController): () => void {
  const c = controller as unknown as Ctl;
  if (c.stopped) return () => {};
  const perf = c.framePerf;
  let tally = fresh();
  const uncount = count(perf, () => tally);
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
  let sampling: (() => void) | null = null;
  const sampleDraws = () => {
    const tp = c.tp;
    if (!tp || sampling) return;
    const info = tp.renderer.info;
    let started = false;
    sampling = c.onFrame(() => {
      if (!started) {
        // (from this frame's end to the next's)
        info.autoReset = false;
        info.reset();
        started = true;
        return;
      }
      draws = info.render.calls;
      info.autoReset = true;
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
    };
    try {
      room.send("perf:report", report);
    } catch {
      // (the line just dropped: the next window says it)
    }
    draws = null;
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
