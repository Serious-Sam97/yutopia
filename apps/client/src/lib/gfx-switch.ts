"use client";

import { useSyncExternalStore } from "react";
import { cleanGraphics, type Graphics } from "./graphics";
import { prefs, type QualityPref, setPrefs } from "./prefs";

// Applying the graphics settings (docs/plan/91-the-big-map.md phase 10): the switch behind a photograph of the
// frame (the world's: still-switch.ts), then "Keep these settings?" — as a game's display settings — the fps before
// and after, a countdown, hold to compare with the photograph; not kept (or far too slow), put back the same way.

export interface GfxSettings {
  quality: QualityPref;
  over: Partial<Graphics> | null;
}

/** What the world does for a switch (the controller registers it with its 3D view; none: prefs set as they are). */
export interface GfxHost {
  /** the photograph laid over, `apply` run (the prefs set), the switch made behind it, the wipe: done */
  switchBehind(apply: () => void): Promise<void>;
  /** the photograph shown again while held, or put away */
  compare(on: boolean): void;
  /** the photograph let go */
  drop(): void;
  fps(): number;
}

let host: GfxHost | null = null;
export function setGfxHost(h: GfxHost | null) {
  host = h;
}

export const KEEP_S = 15;
/** under this many fps a few seconds after, the new settings are put back without asking */
export const TOO_SLOW = 20;

export interface GfxSwitchState {
  phase: "idle" | "switching" | "confirm";
  /** the fps before the switch, and after it (null till measured) */
  before: number;
  after: number | null;
  /** seconds left to keep them */
  left: number;
  comparing: boolean;
}
let state: GfxSwitchState = { phase: "idle", before: 0, after: null, left: 0, comparing: false };
const subs = new Set<() => void>();
function set(p: Partial<GfxSwitchState>) {
  state = { ...state, ...p };
  for (const s of subs) s();
}
export function useGfxSwitch(): GfxSwitchState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => state,
  );
}

let prev: GfxSettings | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

const now = (): GfxSettings => ({ quality: prefs().quality, over: cleanGraphics(prefs().graphics) });
const write = (s: GfxSettings) => setPrefs({ quality: s.quality, graphics: s.over });

/** The settings picked, applied (the Settings page's Apply). */
export async function applyGraphics(next: GfxSettings) {
  if (state.phase !== "idle") return;
  if (!host) {
    write(next);
    return;
  }
  prev = now();
  const before = Math.round(host.fps());
  set({ phase: "switching", before, after: null, left: KEEP_S, comparing: false });
  try {
    await host.switchBehind(() => write(next));
  } catch {
    // (the world gone mid-switch: the prefs are set, that's all)
  }
  if (!host) {
    set({ phase: "idle" });
    return;
  }
  set({ phase: "confirm" });
  let t = 0;
  let sum = 0;
  let n = 0;
  timer = setInterval(() => {
    t++;
    // (the fps after: the seconds after the first, averaged)
    if (t >= 2 && host) {
      sum += host.fps();
      n++;
      set({ after: Math.round(sum / n) });
    }
    set({ left: Math.max(0, KEEP_S - t) });
    if (t >= KEEP_S || (n >= 3 && sum / n < TOO_SLOW)) void revertGraphics();
  }, 1000);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** The new settings kept. */
export function keepGraphics() {
  if (state.phase !== "confirm") return;
  stop();
  prev = null;
  host?.drop();
  set({ phase: "idle", comparing: false });
}

/** The old settings put back, by the same switch (not asked again). */
export async function revertGraphics() {
  if (state.phase !== "confirm") return;
  stop();
  const back = prev;
  prev = null;
  host?.compare(false);
  if (!back || !host) {
    if (back) write(back);
    set({ phase: "idle", comparing: false });
    return;
  }
  set({ phase: "switching", comparing: false });
  try {
    await host.switchBehind(() => write(back));
  } catch {
    // (as above)
  }
  host?.drop();
  set({ phase: "idle" });
}

/** The old picture shown while held. */
export function compareGraphics(on: boolean) {
  if (state.phase !== "confirm" || state.comparing === on) return;
  host?.compare(on);
  set({ comparing: on });
}
