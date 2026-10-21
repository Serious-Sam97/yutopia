import { parentPort } from "node:worker_threads";
import { groundsChunk } from "@yutopia/shared/grounds";

// The Grounds' land made off the main thread (land.ts asks): a chunk takes ~6 ms.
parentPort?.on("message", (m: { cx: number; cz: number }) => {
  const c = groundsChunk(m.cx, m.cz);
  parentPort?.postMessage(c);
});
