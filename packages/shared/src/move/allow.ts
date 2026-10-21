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
