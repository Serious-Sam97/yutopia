import { parentPort } from "node:worker_threads";
import { groundsChunk, setParkLayout } from "@yutopia/shared/grounds";

// The Grounds' land made off the main thread (land.ts asks): a chunk takes ~6 ms. The Kart Park's
// layout raced (what's asphalt there) is told it first, and each chunk goes back with the layout
// it was made for (`v`: one made before a change isn't taken).
let v = 0;
parentPort?.on("message", (m: { cx: number; cz: number } | { layout: [string, boolean]; v: number }) => {
  if ("layout" in m) {
    setParkLayout(m.layout[0], m.layout[1]);
    v = m.v;
    return;
  }
  const c = groundsChunk(m.cx, m.cz);
  parentPort?.postMessage({ c, v });
});
