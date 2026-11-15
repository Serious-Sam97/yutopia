import type { WorldController } from "../controller";
import { hud } from "../store";

/** What Loading reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type LoadingHost = Pick<WorldController, "G" | "cars" | "life" | "tp" | "quality" | "framePerf">;

export class Loading {
  constructor(private readonly c: LoadingHost) {}

  // ── the loading screen (docs/plan/35-the-loading.md) ──────────────────
  // Up on entering, until what the view shows is all built and a few frames in
  // a row have come steadily. Not cut at a fixed time (it was 15 s: on a slow link, or a forest to make, the
  // screen went with the land and one's own body still coming — docs/plan/90-the-friends-machines.md): only when
  // nothing's come for STALL_MS (something stuck), built but never steady for BUILT_WAIT_MS, or LOAD_MAX_MS.
  loadFrom = 0; // when it went up (0: it's down)

  loadSteady = 0; // steady frames in a row, everything built

  loadLast = 0;

  // (plan 90 phase 2, F2c's test) the world built, its frames timed: never steady a second on — a GPU that can't
  // draw this tier — a tier down behind the screen, and again, before anyone sees it
  builtAt = 0;
  slowFrames = 0;

  // how far it's got (readiness' done) and when it last got further — or a file came in: a body and its clothes are
  // megabytes, half done on the list till the last byte (over a slow link, 15 s and more of no step: not stuck)
  bestDone = 0;
  movedAt = 0;
  private files: PerformanceObserver | null = null;

  holdLoading(why: "enter" | "view") {
    this.loadFrom = performance.now();
    this.loadLast = 0;
    this.loadSteady = 0;
    this.builtAt = 0;
    this.slowFrames = 0;
    this.bestDone = 0;
    this.movedAt = this.loadFrom;
    this.watchFiles(true);
    hud.set({ loading: { on: true, progress: why === "enter" ? hud.get().loading.progress : 0, why } });
    if (this.c.tp) this.c.tp.warmup.warming = true;
  }

  watchLoading(now: number) {
    if (!this.loadFrom) return;
    const gap = this.loadLast ? now - this.loadLast : 0;
    this.loadLast = now;
    const r = this.readiness();
    if (r.done > this.bestDone + 0.001) {
      this.bestDone = r.done;
      this.movedAt = now;
    }
    // (a tier switch on its way — the test's step down, its shaders compiling —: not built till it's in)
    const built = r.done >= r.of && !this.c.tp?.warmup.qualityTo;
    this.loadSteady = built && gap > 0 && gap < STEADY_MS ? this.loadSteady + 1 : 0;
    if (built) {
      this.builtAt ||= now;
      if (gap >= STEADY_MS) this.slowFrames++;
      if (now - this.builtAt > TEST_MS && this.loadSteady < STEADY_FRAMES && this.slowFrames >= TEST_SLOW) {
        this.slowFrames = 0;
        // (a step taken: its tier given its own second; none left — the bottom, a tier picked by hand —: the wait
        // for steady frames runs on from when it was built)
        if (this.c.quality.stepDownNow()) this.builtAt = now;
      }
    } else {
      this.builtAt = 0;
      this.slowFrames = 0;
    }
    // (stuck: nothing's come for a while — once the view's up and drawing: before, it's its own code coming)
    const stuck = !!this.c.tp && (this.c.tp.warmup.drawn ?? 0) > 3 && now - this.movedAt > STALL_MS;
    const unsteady = built && now - this.builtAt > BUILT_WAIT_MS;
    if ((built && this.loadSteady >= STEADY_FRAMES) || unsteady || stuck || now - this.loadFrom > LOAD_MAX_MS) {
      if (!built) console.warn(stuck ? "loading stuck" : "loading cut short", r);
      this.loadFrom = 0;
      this.watchFiles(false);
      // (the frame stats from here: play's, not the loading's slow frames — Show frame stats, the bench)
      this.c.framePerf.reset();
      if (this.c.tp) this.c.tp.warmup.warming = false;
      hud.set((h) => ({ loading: { ...h.loading, on: false, progress: 1 } }));
      return;
    }
    // (never backwards: a part found late adds to what's left, not to what's shown)
    const p = Math.min(0.98, r.done / Math.max(1, r.of));
    const l = hud.get().loading;
    if (p > l.progress + 0.01) hud.set({ loading: { ...l, progress: p } });
  }

  // (each file the page got — a body, a garment, a texture, the code —: still coming)
  private watchFiles(on: boolean) {
    this.files?.disconnect();
    this.files = null;
    if (!on || typeof PerformanceObserver === "undefined") return;
    try {
      this.files = new PerformanceObserver(() => {
        this.movedAt = performance.now();
      });
      this.files.observe({ type: "resource", buffered: false });
    } catch {
      this.files = null; // (no such entries here: readiness alone says it moves)
    }
  }

  // what's built: each part 0..1 — the Grounds, their life, the cars, then the 3D view's own
  // parts (tp/view.ts readiness)
  readiness(): { done: number; of: number } {
    const G = !!this.c.G;
    const v = this.c.tp?.warmup.readiness() ?? { done: 0, of: 9 };
    return { done: +G + +(!!this.c.life || !G) + +(!!this.c.cars || !G) + v.done, of: 3 + v.of };
  }
}

// the loading screen (docs/plan/35-the-loading.md): down once it's all built and this
// many frames in a row have come this steadily — or after the cap, whatever's left
const STEADY_FRAMES = 10;

const STEADY_MS = 50;

const STALL_MS = 15_000; // nothing more built this long (the view up): something's stuck — down
const BUILT_WAIT_MS = 6000; // all built, never steady (a GPU the test's steps can't help): down anyway
const LOAD_MAX_MS = 90_000; // down whatever's left

const TEST_MS = 1000; // built this long, never steady …
const TEST_SLOW = 6; // … with this many slow frames: a tier down
