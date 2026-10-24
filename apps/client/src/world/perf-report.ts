// The frame's stages worked out (perf.ts keeps the raw rings): median, p95, worst, average.
import type { FramePerf, Ring } from "./perf";

function stat(r: Ring) {
  const a = Array.from(r.v.subarray(0, r.n)).sort((x, y) => x - y);
  const at = (p: number) => +(a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0).toFixed(2);
  let sum = 0;
  for (const x of a) sum += x;
  return {
    med: at(0.5),
    p95: at(0.95),
    worst: +(a[a.length - 1] ?? 0).toFixed(2),
    avg: +(sum / (a.length || 1)).toFixed(2),
    n: a.length,
  };
}

export type PerfStat = ReturnType<typeof stat>;
export interface PerfReport {
  /** the drawn frames' spacing (ms) */
  gap: PerfStat;
  /** the controller's whole frame (ms of main thread) */
  frame: PerfStat;
  stages: Record<string, PerfStat>;
  /** long tasks (>50 ms) since the last reset, and the longest */
  longTasks: { n: number; worst: number };
  seconds: number;
}

export function report(p: FramePerf, reset = false): PerfReport {
  // (long tasks watched from the first read on: the overlay's, the lag spec's)
  if (!p.stopLong) {
    p.stopLong = () => {};
    try {
      const o = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          p.long.n++;
          if (e.duration > p.long.worst) p.long.worst = e.duration;
        }
      });
      o.observe({ type: "longtask", buffered: false });
      p.stopLong = () => o.disconnect();
    } catch {
      // (no long-task timing in this browser)
    }
  }
  const stages: Record<string, PerfStat> = {};
  // (only what ran in the last 2 s: the other view's stages keep their old numbers otherwise)
  const now = performance.now();
  for (const [k, r] of p.stages) if (now - r.at < 2000) stages[k] = stat(r);
  const out = {
    gap: stat(p.gap),
    frame: stat(p.frame),
    stages,
    longTasks: { n: p.long.n, worst: +p.long.worst.toFixed(1) },
    seconds: +((performance.now() - p.since) / 1000).toFixed(1),
  };
  if (reset) p.reset();
  return out;
}
