import type { PerfReport } from "@yutopia/shared";
import { api, type PerfRow } from "../api.ts";
import { config } from "../config.ts";
import { metrics } from "../metrics.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// How the game runs for each player (docs/plan/39-the-telemetry.md). Each browser sends a
// report of its last ~30 s of play; this checks it field by field, adds who it is and how
// often the server put them back (snaps), and hands the API a minute's worth at a time.
// The browser's ping is answered here too (perf:ping → perf:pong).

const EVERY_MS = 20_000; // a client's reports, at most this often
const FLUSH_MS = 60_000; // to the API
const KEEP = 2_000; // waiting at most (the API down: the oldest go)
// the frame's stages a client may report (world/perf.ts in the client)
const STAGES = new Set(["logic", "iso.update", "tp.update", "tp.frame", "iso.render", "hud", "dark (own)"]);
const VIEWS = new Set(["iso", "3p", "1p"]);
const QUALITIES = new Set(["high", "medium", "low", "auto"]);

/** Where the reports go (tests swap it; offline: nowhere). */
export const perfSink = {
  send: (rows: PerfRow[]): Promise<unknown> => (config.offline ? Promise.resolve() : api.perfReports(rows)),
};

const num = (v: unknown, lo: number, hi: number, d = 0): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : d;
  return Math.min(hi, Math.max(lo, n));
};
const opt = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const round = (v: number, k = 10) => Math.round(v * k) / k;

/** A report as the API keeps it, every field bounded (anything else dropped). */
export function perfRow(uid: number, r: PerfReport, snaps: number, at = Date.now()): PerfRow {
  const f = (r?.frames ?? {}) as Partial<PerfReport["frames"]>;
  const w = (r?.where ?? {}) as Partial<PerfReport["where"]>;
  const m = (r?.machine ?? {}) as Partial<PerfReport["machine"]>;
  const n = (r?.net ?? {}) as Partial<PerfReport["net"]>;
  const stages: Record<string, number> = {};
  for (const [k, v] of Object.entries(r?.stages ?? {}))
    if (STAGES.has(k) && typeof v === "number" && Number.isFinite(v)) stages[k] = round(num(v, 0, 60_000), 100);
  const pair = (v: unknown): [number, number] =>
    Array.isArray(v) ? [Math.round(num(v[0], 0, 20_000)), Math.round(num(v[1], 0, 20_000))] : [0, 0];
  const view = str(w.view, 8);
  const quality = str(w.quality, 8);
  const qualityPref = str(w.qualityPref, 8);
  return {
    user_id: uid,
    at,
    session: str(r?.session, 40) || "?",
    version: str(r?.client?.version, 40) || "?",
    secs: round(num(r?.secs, 0, 600)),
    view: VIEWS.has(view) ? view : "?",
    quality: QUALITIES.has(quality) ? quality : "?",
    level: Math.round(num(w.level, -5, 20)),
    area: str(w.area, 40),
    x: round(num(w.x, -3000, 3000)),
    y: round(num(w.y, -3000, 3000)),
    fps: round(num(f.fps, 0, 1000)),
    frame_med: round(num(f.med, 0, 60_000)),
    frame_p95: round(num(f.p95, 0, 60_000)),
    frame_worst: round(num(f.worst, 0, 60_000)),
    gap_p95: round(num(f.gapP95, 0, 60_000)),
    over33: Math.round(num(f.over33, 0, 1_000_000)),
    over50: Math.round(num(f.over50, 0, 1_000_000)),
    long_tasks: Math.round(num(r?.long?.n, 0, 1_000_000)),
    draws: opt(r?.draws, 0, 1_000_000) === null ? null : Math.round(num(r?.draws, 0, 1_000_000)),
    ping_med: opt(n.pingMed, 0, 60_000),
    ping_p95: opt(n.pingP95, 0, 60_000),
    snaps: Math.round(num(snaps, 0, 1_000_000)),
    browser: str(m.browser, 60),
    gpu: str(m.gpu, 120),
    stages,
    machine: {
      os: str(m.os, 40),
      screen: pair(m.screen),
      canvas: pair(m.canvas),
      dpr: round(num(m.dpr, 0, 8), 100),
      cores: Math.round(num(m.cores, 0, 256)),
      memory: opt(m.memory, 0, 1024),
      ratio: opt(m.ratio, 0, 8),
      ratioAtStart: opt(m.ratioAtStart, 0, 8),
      dprAtStart: opt(m.dprAtStart, 0, 8),
      ratioFixes: opt(m.ratioFixes, 0, 10_000),
    },
    context: {
      hidden: round(num(r?.hidden, 0, 1), 100),
      qualityPref: QUALITIES.has(qualityPref) ? qualityPref : "?",
      maxFps: Math.round(num(w.maxFps, 0, 1000)),
      hour: round(num(w.hour, 0, 24), 100),
      near: Math.round(num(w.near, 0, 500)),
      inCar: w.inCar === true,
      longWorst: round(num(r?.long?.worst, 0, 60_000)),
      gapWorst: round(num(f.gapWorst, 0, 60_000)),
      culled: opt(r?.culled, 0, 1_000_000),
      reconnects: Math.round(num(n.reconnects, 0, 10_000)),
      commit: str(r?.client?.commit, 12),
    },
  };
}

registerFeature((room: WorldRoom) => {
  const queue: PerfRow[] = [];
  const lastAt = new WeakMap<WorldClient, number>();
  const snapsSent = new WeakMap<WorldClient, number>();
  const flush = () => {
    if (!queue.length) return;
    const batch = queue.splice(0, 500);
    void perfSink
      .send(batch)
      .then(() => metrics.inc("perf_reports_total", batch.length))
      .catch(() => metrics.inc("perf_report_errors_total"));
  };
  room.clock.setInterval(flush, FLUSH_MS);

  room.on("perf:ping", (client, m) => room.send(client, "perf:pong", { t: num(m.t, 0, Number.MAX_SAFE_INTEGER) }));

  room.on("perf:report", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p || p.bot) return;
    const now = Date.now();
    if (now - (lastAt.get(client) ?? 0) < EVERY_MS) return;
    lastAt.set(client, now);
    // (the snaps since their last report)
    const total = client.userData?.snaps ?? 0;
    const snaps = total - (snapsSent.get(client) ?? 0);
    snapsSent.set(client, total);
    queue.push(perfRow(p.uid, m, snaps, now));
    if (queue.length > KEEP) queue.splice(0, queue.length - KEEP);
  });

  return { dispose: flush };
});
