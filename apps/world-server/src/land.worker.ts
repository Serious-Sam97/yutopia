import { parentPort } from "node:worker_threads";
import { applyEdits, groundsChunk, setChunkCap, setParkLayout } from "@yutopia/shared/grounds";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";

// The Grounds' land made off the main thread (land.ts asks): a chunk takes ~6 ms. The Kart Park's
// layout raced (what's asphalt there) is told it first, and each chunk goes back with the layout
// it was made for (`v`: one made before a change isn't taken). God mode's edits the same.
let v = 0;
// (what it makes goes to the main thread, which keeps it: few kept here — the cap's 4,000 was ~100 MB
// over the main thread's own)
setChunkCap(256);
type Ask = { cx: number; cz: number } | { layout: [string, boolean]; v: number } | { edits: GroundsEdits; v: number };
parentPort?.on("message", (m: Ask) => {
  if ("layout" in m) {
    setParkLayout(m.layout[0], m.layout[1]);
    v = m.v;
    return;
  }
  if ("edits" in m) {
    applyEdits(m.edits);
    v = m.v;
    return;
  }
  const c = groundsChunk(m.cx, m.cz);
  parentPort?.postMessage({ c, v });
});
