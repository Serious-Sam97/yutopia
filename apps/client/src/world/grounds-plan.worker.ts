// The site plan's land and trees worked out off the main thread (grounds-plan-data.ts),
// handed back (transferred, not copied). God mode's edits as laid in the world come with the ask
// (this worker's Grounds are its own: docs/plan/53-the-god-mode.md).
import { applyEdits } from "@yutopia/shared/grounds";
import { type GroundsEdits, NO_EDITS } from "@yutopia/shared/grounds-edits";
import { type PlanRect, planData } from "./grounds-plan-data";

// (a tile of it, docs/plan/69 L2: `rect` and its `step`; the edits once, then tile after tile)
// (laid again when the main thread laid them again — `v`, its layings: a god-mode draft keeps the
// published rev, and a rollback to none has none)
let laid = -1;
self.onmessage = (e: MessageEvent<{ edits: GroundsEdits | null; v: number; rect?: PlanRect; step?: number }>) => {
  const { edits, v, rect, step } = e.data;
  if (v !== laid) {
    applyEdits(edits ?? NO_EDITS);
    laid = v;
  }
  const d = planData(rect, step);
  (self as unknown as Worker).postMessage(d, [d.land.buffer as ArrayBuffer, d.trees.buffer as ArrayBuffer]);
};
