// Plan 73, phase 1 — loading the life look's assets (tools/art/life/build_all.sh's .glb: meshopt
// geometry, KTX2 textures). Two parts:
//
//   lifeLoader(renderer)   one GLTFLoader for all of them: KTX2 (Basis Universal, its transcoder served
//                          from /decoders/basis/ — tools/decoders.mjs) and meshopt, set up once
//   AssetQueue             what's asked for, loaded by priority (the nearest first) a few at a time,
//                          each url once; kept while anyone holds it, the unheld let go oldest-first
//                          once the cache is over its budget
//
// The queue knows nothing of three: it's given how to load a thing, how big it is and how to let it
// go — so it's tested on its own (life-assets.test.ts).
import type { WebGLRenderer } from "three";
import type { GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

// ── the loader ─────────────────────────────────────────────────────────────────────────────────

let shared: Promise<GLTFLoader> | null = null;
let sharedKtx2: Promise<KTX2Loader> | null = null;

/** The one KTX2 loader (Basis Universal, its transcoder served from /decoders/basis/): the .glb files'
 *  textures and the material library's (life-matlib.ts). */
export function lifeKTX2(renderer: WebGLRenderer): Promise<KTX2Loader> {
  sharedKtx2 ??= (async () => {
    const { KTX2Loader } = await import("three/addons/loaders/KTX2Loader.js");
    return new KTX2Loader().setTranscoderPath("/decoders/basis/").detectSupport(renderer);
  })();
  return sharedKtx2;
}

/** The one GLTFLoader for the life look's files (KTX2 + meshopt), made the first time it's asked for. */
export function lifeLoader(renderer: WebGLRenderer): Promise<GLTFLoader> {
  shared ??= (async () => {
    const [{ GLTFLoader }, ktx2, { MeshoptDecoder }] = await Promise.all([
      import("three/addons/loaders/GLTFLoader.js"),
      lifeKTX2(renderer),
      import("three/addons/libs/meshopt_decoder.module.js"),
    ]);
    await MeshoptDecoder.ready;
    return new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  })();
  return shared;
}

/** A file loaded by the life loader. */
export async function loadLifeGLTF(renderer: WebGLRenderer, url: string): Promise<GLTF> {
  return (await lifeLoader(renderer)).loadAsync(url);
}

// ── the queue ──────────────────────────────────────────────────────────────────────────────────

export interface QueueOpts<T> {
  /** load one (its url) */
  load: (url: string) => Promise<T>;
  /** what it costs held (bytes: its textures and geometry on the GPU) */
  size: (t: T) => number;
  /** let it go (dispose its GPU resources) */
  free: (t: T) => void;
  /** loads at once */
  concurrency?: number;
  /** what may stay cached unheld, in bytes; past it the oldest unheld are freed */
  budget?: number;
}

interface Entry<T> {
  url: string;
  prio: number;
  holds: number;
  state: "queued" | "loading" | "ready" | "failed";
  value?: T;
  error?: unknown;
  waiters: { ok: (t: T) => void; fail: (e: unknown) => void }[];
  /** when it was last let go (for the oldest-first eviction) */
  idleSince: number;
}

/** Assets by url: asked for with a priority (lower loads sooner — a distance), held while used. */
export class AssetQueue<T> {
  private items = new Map<string, Entry<T>>();
  private running = 0;
  private clock = 0;
  private readonly concurrency: number;
  private readonly budget: number;

  constructor(private o: QueueOpts<T>) {
    this.concurrency = o.concurrency ?? 2;
    this.budget = o.budget ?? 64 * 1024 * 1024;
  }

  /** Ask for `url` (held once more until `release`); resolves when it's loaded. Asked again, its
   *  priority becomes the more urgent of the two. */
  get(url: string, prio = 0): Promise<T> {
    let e = this.items.get(url);
    if (!e) {
      e = { url, prio, holds: 0, state: "queued", waiters: [], idleSince: 0 };
      this.items.set(url, e);
    }
    e.holds++;
    e.prio = Math.min(e.prio, prio);
    const entry = e;
    const p =
      entry.state === "ready"
        ? Promise.resolve(entry.value as T)
        : entry.state === "failed"
          ? Promise.reject(entry.error)
          : new Promise<T>((ok, fail) => entry.waiters.push({ ok, fail }));
    this.pump();
    return p;
  }

  /** A new priority for something still waiting (the person walked nearer). */
  reprioritise(url: string, prio: number) {
    const e = this.items.get(url);
    if (e && e.state === "queued") e.prio = prio;
  }

  /** Let go of one hold; with none left it may be freed when the cache is over its budget. */
  release(url: string) {
    const e = this.items.get(url);
    if (!e || e.holds === 0) return;
    e.holds--;
    if (e.holds === 0) {
      e.idleSince = ++this.clock;
      // (still waiting and nobody wants it: never loaded)
      if (e.state === "queued") this.items.delete(url);
      this.evict();
    }
  }

  /** What's cached, in bytes (held or not), and what's held. */
  stats() {
    let bytes = 0;
    let held = 0;
    let queued = 0;
    let ready = 0;
    for (const e of this.items.values()) {
      if (e.state === "ready") {
        bytes += this.o.size(e.value as T);
        ready++;
      }
      if (e.holds > 0) held++;
      if (e.state === "queued") queued++;
    }
    return { bytes, held, queued, ready, loading: this.running };
  }

  private pump() {
    while (this.running < this.concurrency) {
      let next: Entry<T> | null = null;
      for (const e of this.items.values())
        if (e.state === "queued" && e.holds > 0 && (!next || e.prio < next.prio)) next = e;
      if (!next) return;
      this.start(next);
    }
  }

  private start(e: Entry<T>) {
    e.state = "loading";
    this.running++;
    this.o.load(e.url).then(
      (v) => {
        this.running--;
        e.state = "ready";
        e.value = v;
        for (const w of e.waiters) w.ok(v);
        e.waiters = [];
        // (let go of while it loaded: cached unheld, the budget minds it)
        if (e.holds === 0) e.idleSince = ++this.clock;
        this.evict();
        this.pump();
      },
      (err) => {
        this.running--;
        e.state = "failed";
        e.error = err;
        for (const w of e.waiters) w.fail(err);
        e.waiters = [];
        this.items.delete(e.url);
        this.pump();
      },
    );
  }

  /** Free the oldest unheld until the cache fits its budget. */
  private evict() {
    let bytes = 0;
    const idle: Entry<T>[] = [];
    for (const e of this.items.values()) {
      if (e.state !== "ready") continue;
      bytes += this.o.size(e.value as T);
      if (e.holds === 0) idle.push(e);
    }
    idle.sort((a, b) => a.idleSince - b.idleSince);
    for (const e of idle) {
      if (bytes <= this.budget) break;
      bytes -= this.o.size(e.value as T);
      this.o.free(e.value as T);
      this.items.delete(e.url);
    }
  }
}
