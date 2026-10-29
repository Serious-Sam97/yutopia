// The site plan's land and trees worked out off the main thread (grounds-plan-data.ts),
// handed back (transferred, not copied). God mode's edits as laid in the world come with the ask
// (this worker's Grounds are its own: docs/plan/53-the-god-mode.md).
import { applyEdits } from "@yutopia/shared/grounds";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import { planData } from "./grounds-plan-data";

self.onmessage = (e: MessageEvent<GroundsEdits | null>) => {
  if (e.data?.rev) applyEdits(e.data);
  const d = planData();
  (self as unknown as Worker).postMessage(d, [d.land.buffer as ArrayBuffer, d.trees.buffer as ArrayBuffer]);
};
