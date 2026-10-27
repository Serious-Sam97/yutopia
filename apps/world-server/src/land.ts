import { Worker } from "node:worker_threads";
import {
  adoptChunk,
  CHUNK,
  GROUNDS,
  type GroundsChunk,
  hasChunk,
  layoutVersion,
  setParkLayout,
} from "@yutopia/shared/grounds";
import { kartLayoutNow } from "@yutopia/shared/kart";

// The Grounds' land is made a chunk at a time when first asked (shared
// grounds.ts), ~6 ms each: on the tick that's a long one. So land round the
// people out there is made ahead, in a worker, and adopted here; whoever only
// looks (the shadowed's director, finding a spot) asks `ready` first.

let worker: Worker | null = null;
const asked = new Set<number>();
const key = (cx: number, cz: number) => (cx + 2048) * 4096 + (cz + 2048);

function start(): Worker {
  const w = new Worker(new URL("./land.worker.ts", import.meta.url));
  w.unref();
  // (the Kart Park's layout raced, first: docs/plan/47-the-track-changer.md)
  const n = kartLayoutNow();
  w.postMessage({ layout: [n.key, n.reverse], v: layoutVersion });
  w.on("message", (m: { c: GroundsChunk; v: number }) => {
    if (m.v === layoutVersion) adoptChunk(m.c);
    asked.delete(key(m.c.cx, m.c.cz));
  });
  w.on("error", (e) => {
    console.error("[land] worker", e);
    worker = null;
    asked.clear();
  });
  return w;
}

/** Is the land at (x, z) (building coords, tiles) made? */
export function ready(x: number, z: number): boolean {
  return hasChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
}

/** Make the land within `r` tiles of (x, z) ahead (in the worker), if it isn't. */
export function prefetch(x: number, z: number, r: number): void {
  const c0 = Math.floor(Math.max(GROUNDS.x0, x - r) / CHUNK);
  const c1 = Math.floor(Math.min(GROUNDS.x1 - 1, x + r) / CHUNK);
  const d0 = Math.floor(Math.max(GROUNDS.z0, z - r) / CHUNK);
  const d1 = Math.floor(Math.min(GROUNDS.z1 - 1, z + r) / CHUNK);
  for (let cz = d0; cz <= d1; cz++)
    for (let cx = c0; cx <= c1; cx++) {
      const k = key(cx, cz);
      if (hasChunk(cx, cz) || asked.has(k)) continue;
      worker ??= start();
      asked.add(k);
      worker.postMessage({ cx, cz });
    }
}

/** The worker stopped (a room closing: the next prefetch starts it again). */
export function stopLand(): void {
  void worker?.terminate();
  worker = null;
  asked.clear();
}

/** The Kart Park's layout to race (docs/plan/47-the-track-changer.md): the park's land made again
 *  here and in the worker. True if it changed. */
export function landLayout(layout: string, reverse: boolean): boolean {
  if (!setParkLayout(layout, reverse)) return false;
  worker?.postMessage({ layout: [kartLayoutNow().key, reverse], v: layoutVersion });
  return true;
}
