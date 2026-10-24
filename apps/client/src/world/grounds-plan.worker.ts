// The site plan's land and trees worked out off the main thread (grounds-plan-data.ts),
// handed back (transferred, not copied).
import { planData } from "./grounds-plan-data";

self.onmessage = () => {
  const d = planData();
  (self as unknown as Worker).postMessage(d, [d.land.buffer as ArrayBuffer, d.trees.buffer as ArrayBuffer]);
};
