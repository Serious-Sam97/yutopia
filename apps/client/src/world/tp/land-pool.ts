import { editsNow, editsVersion, kartLayoutNow } from "@yutopia/shared/grounds";
import type { BlockAsk, BlockData } from "./land-block";
import type { LandBlockAsk } from "./land-block.worker";

// The streamed land's workers (land-block.worker.ts; grounds-stream.ts asks them). Started as the
// Grounds load, while the world connects — started by the stream's first frame, a worker's first
// block waited ~2 s on its own start (the land's code run, the edits laid) behind the loading
// screen, docs/plan/69 — and kept for the game, their caches with them. What they make waits here
// for the stream to place.

interface Worker1 {
  w: Worker;
  /** blocks asked of it, not back yet */
  busy: number;
  /** the edits version and the park's layout it has */
  v: number;
  park: string;
}

export class LandPool {
  private ws: Worker1[] = [];
  /** blocks asked, not back yet */
  readonly asked = new Set<string>();
  /** blocks made, to be placed */
  made: BlockData[] = [];
  /** (one failed: none of them from now on) */
  dead = false;
  constructor(n: number) {
    for (let i = 0; i < n; i++) {
      const o: Worker1 = {
        w: new Worker(new URL("./land-block.worker.ts", import.meta.url), { type: "module" }),
        busy: 0,
        v: -1,
        park: "",
      };
      o.w.onmessage = (e: MessageEvent<BlockData>) => {
        o.busy--;
        this.asked.delete(e.data.key);
        this.made.push(e.data);
      };
      o.w.onerror = (e) => {
        console.warn("land-block worker", e.message);
        this.end();
      };
      this.ws.push(o);
    }
  }
  /** What a worker's to be told before its next ask: the edits and the park's layout, if they
   *  changed since its last. */
  private news(o: Worker1): Pick<LandBlockAsk, "edits" | "park"> {
    const out: Pick<LandBlockAsk, "edits" | "park"> = {};
    if (o.v !== editsVersion) {
      out.edits = editsNow();
      o.v = editsVersion;
    }
    const p = kartLayoutNow();
    const park = `${p.key}:${p.reverse}`;
    if (o.park !== park) {
      out.park = { key: p.key, reverse: p.reverse };
      o.park = park;
    }
    return out;
  }
  /** Each worker's land made ready (its code run, the edits laid): nothing made. */
  warm() {
    for (const o of this.ws) o.w.postMessage({ warm: true, v: editsVersion, ...this.news(o) });
  }
  /** These blocks (nearest first) to the least busy worker, `most` in hand each at most. */
  ask(list: BlockAsk[], most: number) {
    for (const b of list) {
      if (this.dead) return;
      if (this.asked.has(b.key)) continue;
      const o = this.ws.reduce((a, c) => (c.busy < a.busy ? c : a));
      if (o.busy >= most) return;
      const a: LandBlockAsk = { ...b, v: editsVersion, ...this.news(o) };
      o.busy++;
      this.asked.add(b.key);
      o.w.postMessage(a);
    }
  }
  end() {
    this.dead = true;
    for (const o of this.ws) o.w.terminate();
    this.ws = [];
    this.asked.clear();
    pool = false;
  }
}

let pool: LandPool | null | false = null;
/** The land's workers (null: none here — the stream makes its blocks itself). Two, three with the
 *  cores for it. */
export function landPool(): LandPool | null {
  if (pool === null) {
    pool = false;
    if (typeof Worker !== "undefined")
      try {
        const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
        pool = new LandPool(cores >= 8 ? 3 : 2);
      } catch {
        pool = false;
      }
  }
  return pool || null;
}
