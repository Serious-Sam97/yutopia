import { editsNow, editsVersion, kartLayoutNow } from "@yutopia/shared/grounds";
import type { BlockAsk, BlockData } from "./land-block";
import type { LandBlockAsk, LandPieceAsk } from "./land-block.worker";
import type { PieceAsk, PieceData } from "./way-piece";

// The streamed land's workers (land-block.worker.ts; grounds-stream.ts asks them). Started as the
// Grounds load, while the world connects — started by the stream's first frame, a worker's first
// block waited ~2 s on its own start (the land's code run, the edits laid) behind the loading
// screen, docs/plan/69 — and kept for the game, their caches with them. What they make waits here
// for the stream to place.
//
// None of them may lock the land up (docs/plan/91-the-big-map.md phase 1): a block made and waiting
// is in hand as much as one asked (asked again, a slow machine re-made the same nearest blocks for
// good — Rafael's dirt road); a worker silent with blocks in hand for STUCK_MS is replaced and its
// blocks asked of the others; one that errs is replaced, not all of them ended — only after DEATHS
// of them does the stream make its blocks itself.

/** a worker with blocks in hand and no answer this long: stuck (a block is 6–50 ms; slowed 6×, ~300) */
export const STUCK_MS = 5000;
/** workers replaced, at most, before the main thread makes the land itself */
export const DEATHS = 4;

interface Worker1 {
  w: Worker;
  /** the blocks asked of it, not back yet */
  keys: Set<string>;
  /** when it last answered (or was given its first block in hand) */
  heardAt: number;
  /** the edits version and the park's layout it has */
  v: number;
  park: string;
}

export interface PoolOpts {
  /** a worker (tests: a fake) */
  make?: () => Worker;
  now?: () => number;
}

export class LandPool {
  private ws: Worker1[] = [];
  /** blocks asked, not back yet */
  readonly asked = new Set<string>();
  /** blocks made, to be placed */
  made: BlockData[] = [];
  /** districts' road pieces made (way-piece.ts), to be handed to their districts (plan 91 phase 3) */
  pieces: PieceData[] = [];
  /** (DEATHS of them gone: none from now on) */
  dead = false;
  /** workers replaced so far (stuck or erred) */
  deaths = 0;
  private make: () => Worker;
  private now: () => number;
  constructor(n: number, opts: PoolOpts = {}) {
    this.make = opts.make ?? (() => new Worker(new URL("./land-block.worker.ts", import.meta.url), { type: "module" }));
    this.now = opts.now ?? (() => performance.now());
    for (let i = 0; i < n; i++) this.ws.push(this.start());
  }
  private start(): Worker1 {
    const o: Worker1 = { w: this.make(), keys: new Set(), heardAt: this.now(), v: -1, park: "" };
    o.w.onmessage = (e: MessageEvent<BlockData | PieceData>) => {
      const d = e.data;
      const key = "geos" in d ? d.piece : d.key;
      o.heardAt = this.now();
      o.keys.delete(key);
      // (one asked again of another while this one was silent: what comes first is kept)
      if (!this.asked.has(key)) return;
      for (const x of this.ws) x.keys.delete(key);
      this.asked.delete(key);
      if ("geos" in d) this.pieces.push(d);
      else this.made.push(d);
    };
    o.w.onerror = (e) => {
      console.warn("land-block worker", e.message);
      this.replace(o);
    };
    o.w.onmessageerror = () => this.replace(o);
    return o;
  }
  /** One gone (stuck, erred): its blocks free to be asked again, another in its place — till DEATHS. */
  private replace(o: Worker1) {
    const i = this.ws.indexOf(o);
    if (i < 0) return;
    o.w.terminate();
    for (const k of o.keys) this.asked.delete(k);
    o.keys.clear();
    if (++this.deaths >= DEATHS) {
      this.end();
      return;
    }
    const n = this.start();
    this.ws[i] = n;
    n.w.postMessage({ warm: true, v: editsVersion, ...this.news(n) });
  }
  /** What a worker's to be told before its next ask: the edits and the park's layout, if they
   *  changed since its last. */
  private news(o: Worker1): Pick<LandBlockAsk, "edits" | "park"> {
    const out: Pick<LandBlockAsk, "edits" | "park"> = {};
    // (what's told once to a worker is told: one reads it with its next ask, a block's or a piece's)
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
  /** Those silent too long with blocks in hand: replaced. */
  private watchedAt = Number.NEGATIVE_INFINITY;
  private watch() {
    const now = this.now();
    // (the main thread itself held up — a long frame, a hidden tab: their answers waiting in its queue,
    // not theirs late; counted again from now)
    const held = now - this.watchedAt > 1000;
    this.watchedAt = now;
    if (held) {
      for (const o of this.ws) o.heardAt = now;
      return;
    }
    for (const o of [...this.ws]) if (o.keys.size && now - o.heardAt > STUCK_MS) this.replace(o);
  }
  /** These blocks (nearest first) to the least busy worker, `most` in hand each at most. */
  ask(list: BlockAsk[], most: number) {
    this.watch();
    // (made and not placed yet is in hand too: asked again, a slow machine's stream re-placed the same
    // nearest blocks over and over — thousands waiting, the land and the districts after it stuck)
    const inHand = new Set(this.made.map((d) => d.key));
    for (const b of list) {
      if (this.dead) return;
      if (this.asked.has(b.key) || inHand.has(b.key)) continue;
      const o = this.ws.reduce((a, c) => (c.keys.size < a.keys.size ? c : a));
      if (o.keys.size >= most) return;
      const a: LandBlockAsk = { ...b, v: editsVersion, ...this.news(o) };
      // (silent since its last answer is only counted from its first block in hand)
      if (!o.keys.size) o.heardAt = this.now();
      o.keys.add(b.key);
      this.asked.add(b.key);
      o.w.postMessage(a);
    }
  }
  /** A piece asked, or made and not handed over yet. */
  pieceInHand(): (piece: string) => boolean {
    const back = new Set(this.pieces.map((d) => d.piece));
    return (k) => this.asked.has(k) || back.has(k);
  }
  /** These road pieces (most wanted first) to the least busy worker, `most` in hand each at most (the land's
   *  blocks counted with them). */
  askPieces(list: PieceAsk[], most: number) {
    this.watch();
    for (const p of list) {
      if (this.dead) return;
      if (this.asked.has(p.piece)) continue;
      const o = this.ws.reduce((a, c) => (c.keys.size < a.keys.size ? c : a));
      if (o.keys.size >= most) return;
      const a: LandPieceAsk = { ...p, v: editsVersion, ...this.news(o) };
      if (!o.keys.size) o.heardAt = this.now();
      o.keys.add(p.piece);
      this.asked.add(p.piece);
      o.w.postMessage(a);
    }
  }
  end() {
    this.dead = true;
    for (const o of this.ws) o.w.terminate();
    this.ws = [];
    this.asked.clear();
    if (pool === this) pool = false;
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
