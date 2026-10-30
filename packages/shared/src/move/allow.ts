import { MOVE, type MoveSpec } from "./spec.ts";
import { rollSpeed, type VerbKind } from "./verbs.ts";

// The server's check (docs/plan/29-the-move.md, M7): instead of a speed limit
// per message, a distance allowance per body — it grows by the fastest a body
// may go (its verb's, else a sprint's) over the time that passed, up to a
// little slack, and every reported move spends it. Short of it: a snap back.

/** The fastest a body may go, tiles / s, doing `verb` (null: on its feet);
 *  `winded` (out of breath: docs/plan/30-the-dark.md D2), no sprint, a jog's. */
export function speedCap(verb: VerbKind | null, spec: MoveSpec = MOVE, winded = false): number {
  const feet = (winded ? spec.jog : spec.sprint) * 1.15;
  switch (verb) {
    case "roll":
      return Math.max(feet, rollSpeed(0, spec) * 1.1);
    case "slide":
      return Math.max(feet, (spec.sprint + spec.slide.boost) * 1.15);
    case "adash":
      return Math.max(feet, ((spec.airDash?.dist ?? 3) / (spec.airDash?.len ?? 0.18)) * 1.1);
    case "vault":
      return Math.max(feet, ((spec.vault.reach + 0.9 + spec.vault.beyond) / spec.vault.len) * 1.1);
    default:
      return feet;
  }
}

export class Allowance {
  private left: number;
  constructor(readonly slack = 1.2) {
    this.left = slack;
  }
  /** `dt` s passed, at most `cap` tiles / s allowed */
  grow(dt: number, cap: number): void {
    this.left = Math.min(this.slack, this.left + Math.max(0, dt) * cap);
  }
  /** a move of `d` tiles: allowed (and spent), or not (nothing spent) */
  spend(d: number): boolean {
    if (d > this.left + 1e-6) return false;
    this.left -= d;
    return true;
  }
  /** after a snap or a teleport */
  reset(): void {
    this.left = this.slack;
  }
  get remaining(): number {
    return this.left;
  }
}

/** The time a body's next move may count (docs/plan/41-the-snap.md): the client's own clock
 *  between its messages, not when they arrived. A hiccup on the line or on the server holds
 *  messages back and hands them over at once; arrival time says no time passed between
 *  them, and the allowance said no. Each still carries when it was sent (`mt`: the page's
 *  `performance.now()`, ms, uint32 — no clock, no time zone: only the difference between two
 *  of them counts). The client's clock may not run ahead of the server's by more than
 *  `ahead` s in all (a sped-up clock gains no more than that), and what it's owed for
 *  messages held back is kept to `behind` s (longer than that, what's over is let go). */
export class SentClock {
  private last: number | null = null;
  private lead = 0; // s: their clock's total since we started counting, less ours
  constructor(
    readonly ahead = 0.25,
    readonly behind = 3,
  ) {}
  /** `mt`: the stamp on this message; `serverDt`: s since their last message reached us.
   *  The s this move may count. (No stamp: an older client — the server's time, as before.) */
  step(mt: unknown, serverDt: number): number {
    const sdt = Math.max(0, serverDt);
    if (typeof mt !== "number" || !Number.isFinite(mt)) {
      this.last = null;
      return sdt;
    }
    const cur = mt >>> 0;
    const prev = this.last;
    this.last = cur;
    if (prev === null) return sdt;
    const d = (cur - prev) >>> 0; // (uint32: across a wrap too)
    const cdt = d < 0x80000000 ? d / 1000 : 0; // (one older than the last: none)
    const used = Math.max(0, Math.min(cdt, this.ahead - this.lead + sdt));
    this.lead = Math.max(-this.behind, this.lead + used - sdt);
    return used;
  }
}
