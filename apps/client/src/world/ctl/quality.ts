import { deviceQuality, drawnAs, gpuKind, prefs, type Quality, resolveQuality } from "@/lib/prefs";
import type { WorldController } from "../controller";
import { hud } from "../store";

/** What QualityWatch reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type QualityWatchHost = Pick<WorldController, "activeAt" | "hudFrames" | "model" | "path" | "tp">;

const ORDER: readonly Quality[] = ["potato", "lowest", "low", "medium", "high"];
const rank = (q: Quality) => ORDER.indexOf(q);

// Auto's tier as this device last held it (docs/plan/89-the-weight.md phase 6, F2c): High kept a minute, or the tier
// it stepped down to — so it starts there next time, not Medium and up again mid-game every visit. A step down is
// tried again after a week (the game may have got lighter since).
const HELD = "yutopia:autoTier";
const RETRY_MS = 7 * 24 * 3600 * 1000;
interface Held {
  tier: Quality;
  at: number;
}
function readHeld(): Held | null {
  try {
    const h = JSON.parse(localStorage.getItem(HELD) ?? "null") as Held | null;
    return h && ORDER.includes(h.tier) && typeof h.at === "number" ? h : null;
  } catch {
    return null;
  }
}
function writeHeld(tier: Quality) {
  try {
    localStorage.setItem(HELD, JSON.stringify({ tier, at: Date.now() }));
  } catch {
    // (no storage: it's worked out again next time)
  }
}

/** Auto's tier to start on (F2c): what this device held last time — a step down only for a week —, else Medium on
 *  a device Auto would give High (it steps up when there's room: QualityWatch.watchFrameRate), else that device's
 *  own tier; never above what the device is (deviceQuality). */
export function startTier(held: Held | null = readHeld(), now = Date.now()): Quality {
  const ceiling = deviceQuality();
  const fresh = held && (rank(held.tier) >= rank("high") || now - held.at < RETRY_MS) ? held.tier : null;
  const want = fresh ?? (ceiling === "high" ? "medium" : ceiling);
  // (a weak GPU that's held lowest — stepped up and kept it — starts there: one above its name's potato)
  const top = ceiling === "potato" && gpuKind() === "weak" ? "lowest" : ceiling;
  return rank(want) <= rank(top) ? want : ceiling;
}

/** Room to spare, steadily (s) before Auto tries High. */
export const ROOM_S = 10;
/** Slow (s) before Auto steps down — a tier tried and found too much included. */
export const SLOW_S = 6;
/** High kept this long (ms): this device holds it (remembered). */
export const HOLD_MS = 60_000;

export class QualityWatch {
  constructor(private readonly c: QualityWatchHost) {}

  // ── quality ──────────────────────────────────────────────────────────────
  autoTier: Quality = "high";

  slowFor = 0;

  /** seconds in a row at the frame rate asked for, playing (not idle) */
  roomFor = 0;

  /** stepped down this session: no trying High again till the next */
  noUp = false;

  /** when High was tried (0: not on trial) */
  trialAt = 0;

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

  /** Once a second (controller): Auto steps down when it can't keep up — and, from Medium on a device Auto would
   *  give High, tries High once it has kept the frame rate asked for a while (F2c): the next tier's shaders
   *  compiled first (Warmup.toQuality), so neither step hitches. A tier picked by hand is never touched. */
  watchFrameRate() {
    const e = this.c.model;
    if (!e || !this.c.tp || prefs().quality !== "auto" || Date.now() - this.startedAt < 8000 || document.hidden) return;
    const step = this.decide(this.c.tp.fps, this.fpsCap(performance.now()), prefs().maxFps, Date.now());
    if (step) this.goTo(step);
  }

  private goTo(step: Quality) {
    this.autoTier = step;
    this.c.model?.setQuality(drawnAs(step), prefs().reducedMotion);
    this.c.tp?.warmup.toQuality(step);
  }

  /** Behind the loading screen, the world built but its frames never steady (plan 90 phase 2, F2c's test): a tier
   *  down now, before anyone sees it, and remembered — the next one down from where it is. False at the bottom (or
   *  a tier picked by hand). */
  stepDownNow(): boolean {
    if (prefs().quality !== "auto" || this.autoTier === "potato") return false;
    const down = ORDER[Math.max(0, rank(this.autoTier) - 1)];
    this.noUp = true;
    writeHeld(down);
    this.goTo(down);
    return true;
  }

  /** (pure, tests) The tier to go to now, or null: `fps` measured, `cap` the frame rate asked for now (30 idle; 0
   *  none), `asked` the setting's. */
  decide(fps: number, cap: number, asked: number, now: number): Quality | null {
    // (under the cap, or 30 when idle: slow is well under what's asked for)
    const floor = cap ? Math.min(40, cap * 0.7) : 40;
    // (far under — under 20 —, down in 2 s, not 6: a weak GPU's first minute was seconds a frame — plan 90)
    this.slowFor = fps > 0 && fps < floor ? this.slowFor + (fps < 20 ? 3 : 1) : 0;
    // room: the frame rate asked for, kept, while playing (idle, the cap's 30 says nothing of what High would cost)
    const playing = !asked || cap === asked;
    this.roomFor = playing && fps >= (asked ? asked * 0.95 : 90) ? this.roomFor + 1 : 0;
    if (this.slowFor >= SLOW_S && this.autoTier !== "potato") {
      this.slowFor = 0;
      this.roomFor = 0;
      this.trialAt = 0;
      this.noUp = true;
      const down = ORDER[rank(this.autoTier) - 1];
      writeHeld(down);
      return down;
    }
    if (this.trialAt && now - this.trialAt >= HOLD_MS) {
      this.trialAt = 0;
      writeHeld(this.autoTier);
    }
    // (put on potato by its GPU's name, not by being slow: up to lowest when it has room — F2c's correction)
    if (this.autoTier === "potato" && !this.noUp && gpuKind() === "weak" && this.roomFor >= ROOM_S) {
      this.roomFor = 0;
      this.slowFor = 0;
      this.trialAt = now;
      return "lowest";
    }
    if (this.autoTier === "medium" && !this.noUp && deviceQuality() === "high" && this.roomFor >= ROOM_S) {
      this.roomFor = 0;
      this.slowFor = 0;
      this.trialAt = now;
      return "high";
    }
    return null;
  }
}

const IDLE_MS = 3000; // nothing moved for this long: frames at 30/s
