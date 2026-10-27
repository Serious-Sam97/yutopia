// Counting laps (docs/plan/46-the-karts.md, K-M3): the checkpoints in order, so a cut across the
// infield doesn't count, a lap on crossing the line with all of them passed. The sandbox times
// you with it; the server counts the race with it (phase 3).

import type { Track } from "./park.ts";

/** How far past a checkpoint still counts as passing it (m, along the lap). */
const WINDOW = 30;

export class LapCounter {
  /** laps finished; the next checkpoint (1.. checks.length; past the last: the line) */
  lap = 0;
  next = 1;
  /** on the clock: the current lap's start, the last and the best lap (s), null before */
  started: number | null = null;
  last: number | null = null;
  best: number | null = null;
  constructor(private t: Track) {}

  private ahead(s: number, at: number) {
    const d = (((s - at) % this.t.len) + this.t.len) % this.t.len;
    return d < WINDOW;
  }
  /** Where the kart is now (`s` along the lap) at time `now`: "lap" when one's just done, "start"
   *  when the clock first starts (crossing the line from the grid). */
  update(s: number, now: number): "lap" | "start" | null {
    const checks = this.t.checks;
    if (this.started === null) {
      if (this.ahead(s, 0) && s < WINDOW) {
        this.started = now;
        this.next = 1;
        return "start";
      }
      return null;
    }
    if (this.next < checks.length) {
      if (this.ahead(s, checks[this.next])) this.next++;
      return null;
    }
    if (this.ahead(s, 0)) {
      const tm = now - this.started;
      this.last = tm;
      this.best = this.best === null ? tm : Math.min(this.best, tm);
      this.lap++;
      this.started = now;
      this.next = 1;
      return "lap";
    }
    return null;
  }
}
