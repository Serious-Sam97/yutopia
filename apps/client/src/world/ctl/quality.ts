import { prefs, type Quality, resolveQuality } from "@/lib/prefs";
import type { WorldController } from "../controller";
import { hud } from "../store";

/** What QualityWatch reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type QualityWatchHost = Pick<WorldController, "activeAt" | "hudFrames" | "model" | "path" | "tp">;

export class QualityWatch {
  constructor(private readonly c: QualityWatchHost) {}

  // ── quality ──────────────────────────────────────────────────────────────
  autoTier: Quality = "high";

  slowFor = 0;

  startedAt = Date.now();

  qualityNow(): Quality {
    return prefs().quality === "auto" ? this.autoTier : resolveQuality(prefs().quality);
  }

  // Frames per second, at most, right now: the setting — or 30 once nothing
  // has moved for a while (ambient life alone doesn't need more). 0 = no cap.
  fpsCap(now: number): number {
    const cap = prefs().maxFps;
    if (!cap) return 0;
    const last = Math.max(this.c.activeAt, this.c.model?.activeAt ?? 0, this.c.tp?.activeAt ?? 0);
    const h = hud.get();
    const idle = now - last > IDLE_MS && !h.build.on && !h.menu && !this.c.path;
    return idle ? Math.min(30, cap) : cap;
  }

  // HUD pieces that follow the picture (tags, meters): run once per drawn frame
  onFrame(cb: () => void): () => void {
    this.c.hudFrames.add(cb);
    return () => void this.c.hudFrames.delete(cb);
  }

  watchFrameRate() {
    const e = this.c.model;
    if (!e || !this.c.tp || prefs().quality !== "auto" || Date.now() - this.startedAt < 8000 || document.hidden) return;
    const fps = this.c.tp.fps;
    // (under the cap, or 30 when idle: slow is well under what's asked for)
    const cap = this.fpsCap(performance.now());
    const floor = cap ? Math.min(40, cap * 0.7) : 40;
    this.slowFor = fps > 0 && fps < floor ? this.slowFor + 1 : 0;
    if (this.slowFor < 6 || this.autoTier === "lowest") return;
    this.slowFor = 0;
    this.autoTier = this.autoTier === "high" ? "medium" : this.autoTier === "medium" ? "low" : "lowest";
    e.setQuality(this.autoTier, prefs().reducedMotion);
    this.c.tp?.warmup.toQuality(this.autoTier);
  }
}

const IDLE_MS = 3000; // nothing moved for this long: frames at 30/s
