import type { WorldController } from "../controller";
import { hud } from "../store";

/** What Loading reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type LoadingHost = Pick<WorldController, "G" | "cars" | "life" | "tp">;

export class Loading {
  constructor(private readonly c: LoadingHost) {}

  // ── the loading screen (docs/plan/35-the-loading.md) ──────────────────
  // Up on entering, until what the view shows is all built and a few frames in
  // a row have come steadily; never longer than LOAD_CAP_MS.
  loadFrom = 0; // when it went up (0: it's down)

  loadSteady = 0; // steady frames in a row, everything built

  loadLast = 0;

  holdLoading(why: "enter" | "view") {
    this.loadFrom = performance.now();
    this.loadLast = 0;
    this.loadSteady = 0;
    hud.set({ loading: { on: true, progress: why === "enter" ? hud.get().loading.progress : 0, why } });
    if (this.c.tp) this.c.tp.warmup.warming = true;
  }

  watchLoading(now: number) {
    if (!this.loadFrom) return;
    const gap = this.loadLast ? now - this.loadLast : 0;
    this.loadLast = now;
    const r = this.readiness();
    const built = r.done >= r.of;
    this.loadSteady = built && gap > 0 && gap < STEADY_MS ? this.loadSteady + 1 : 0;
    if ((built && this.loadSteady >= STEADY_FRAMES) || now - this.loadFrom > LOAD_CAP_MS) {
      if (!built) console.warn("loading cut short", r);
      this.loadFrom = 0;
      if (this.c.tp) this.c.tp.warmup.warming = false;
      hud.set((h) => ({ loading: { ...h.loading, on: false, progress: 1 } }));
      return;
    }
    // (never backwards: a part found late adds to what's left, not to what's shown)
    const p = Math.min(0.98, r.done / Math.max(1, r.of));
    const l = hud.get().loading;
    if (p > l.progress + 0.01) hud.set({ loading: { ...l, progress: p } });
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

const LOAD_CAP_MS = 15_000;
