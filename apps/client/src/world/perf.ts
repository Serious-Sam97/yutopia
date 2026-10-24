// Where a frame's time goes (docs/plan/38-the-lag.md): the controller's frame is cut into
// stages, each timed with performance.now() into a ring of the last frames, plus the gaps
// between drawn frames and the browser's long tasks (>50 ms, anything on the main thread;
// watched from the first time the numbers are read).
// Read with `await __yutopia.perf()` (perf-report.ts works out the numbers, loaded then);
// shown live by Settings → Graphics → Show frame stats (perf-overlay.ts). A few now() a frame.

export const PERF_N = 600; // ~10 s at 60 fps

export class Ring {
  readonly v = new Float32Array(PERF_N);
  n = 0;
  i = 0;
  at = 0; // when it last had one (a stage that stopped — iso's while in 3D — drops out of the report)
  push(x: number) {
    this.at = performance.now();
    this.v[this.i] = x;
    this.i = (this.i + 1) % PERF_N;
    if (this.n < PERF_N) this.n++;
  }
}

export class FramePerf {
  stages = new Map<string, Ring>();
  frame = new Ring();
  gap = new Ring();
  long = { n: 0, worst: 0 };
  since = performance.now();
  private t0 = 0;
  private lastStart = 0;
  /** stops watching long tasks (perf-report.ts starts it, the first time it's read) */
  stopLong: (() => void) | null = null;

  /** The frame starts; returns the clock to pass to `lap`. */
  begin(): number {
    const t = performance.now();
    if (this.lastStart) this.gap.push(t - this.lastStart);
    this.lastStart = t;
    this.t0 = t;
    return t;
  }

  /** A stage ended: its time since `from`; returns now for the next stage. */
  lap(stage: string, from: number): number {
    const t = performance.now();
    let r = this.stages.get(stage);
    if (!r) {
      r = new Ring();
      this.stages.set(stage, r);
    }
    r.push(t - from);
    return t;
  }

  end() {
    this.frame.push(performance.now() - this.t0);
  }

  reset() {
    this.stages = new Map();
    this.frame = new Ring();
    this.gap = new Ring();
    this.long = { n: 0, worst: 0 };
    this.lastStart = 0;
    this.since = performance.now();
  }

  dispose() {
    this.stopLong?.();
  }
}
