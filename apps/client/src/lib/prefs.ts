"use client";

import { useSyncExternalStore } from "react";

// Per-device preferences. Browser storage only (and safe when it's blocked).
export interface Prefs {
  quality: QualityPref;
  reducedMotion: boolean;
  spatial: boolean;
  noiseSuppression: boolean;
  // tv: YouTube / Jellyfin / game consoles on TVs (radios are music)
  vol: { master: number; voices: number; ambience: number; music: number; effects: number; tv: number };
  micId: string;
  camId: string;
  speakerId: string;
  seenIntro: boolean;
  // how you see the world: behind you, or in your head
  view: "3p" | "1p";
  cam3p: "chase" | "free";
  // mouse look (Z, in 3D): how fast the mouse turns the camera (× the base), up/down flipped
  lookSens: number;
  lookInvert: boolean;
  // the camera (docs/plan/56-the-controls.md D): how it comes round behind you, the stick's and
  // the arrows' speed, left–right flipped
  camFollow: "on" | "gentle" | "off";
  stickSens: number;
  lookInvertX: boolean;
  // first person: my own arms come into view when they're doing something
  hands1p: boolean;
  // frames per second, at most (0 = as many as the screen shows); 30 once nothing moves
  maxFps: MaxFps;
  // the frame's numbers in a corner (fps, where each frame's time goes: docs/plan/38-the-lag.md)
  perfStats: boolean;
}

// (lowest: weak machines — no antialiasing, under a pixel a pixel; docs/plan/50-the-volume.md 7d)
export type Quality = "high" | "medium" | "low" | "lowest";
export type QualityPref = Quality | "auto";
export type MaxFps = 0 | 30 | 60 | 120;
export const MAX_FPS: readonly MaxFps[] = [30, 60, 120, 0];

// Auto: a tier for this device (the world steps down one more if it can't keep up).
export function deviceQuality(): Quality {
  if (typeof navigator === "undefined") return "high";
  const n = navigator as Navigator & { deviceMemory?: number };
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const small = typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 600;
  const cores = n.hardwareConcurrency ?? 4;
  const mem = n.deviceMemory ?? 8;
  if (cores <= 2 || mem <= 2) return "lowest";
  if (touch && small) return "low";
  if (touch || cores <= 4 || mem <= 4) return "medium";
  return "high";
}

export function resolveQuality(q: QualityPref): Quality {
  return q === "auto" ? deviceQuality() : q;
}

const KEY = "yutopia:prefs";
const DEFAULTS: Prefs = {
  quality: "auto",
  reducedMotion: false,
  spatial: true,
  noiseSuppression: true,
  vol: { master: 0.9, voices: 1, ambience: 0.5, music: 0.5, effects: 0.7, tv: 0.8 },
  micId: "",
  camId: "",
  speakerId: "",
  seenIntro: false,
  view: "3p",
  cam3p: "chase",
  lookSens: 1,
  lookInvert: false,
  camFollow: "on",
  stickSens: 1,
  lookInvertX: false,
  hands1p: true,
  maxFps: 60,
  perfStats: false,
};

let cache: Prefs | null = null;
const subs = new Set<() => void>();

export function prefs(): Prefs {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    cache = { ...DEFAULTS, ...raw, vol: { ...DEFAULTS.vol, ...(raw?.vol ?? {}) } };
    if (cache && !["auto", "high", "medium", "low", "lowest"].includes(cache.quality)) cache.quality = "auto";
    if (cache && cache.view !== "1p") cache.view = "3p"; // (a stored "iso" too: the view retired)
    if (cache && cache.cam3p !== "free") cache.cam3p = "chase";
    if (cache && !MAX_FPS.includes(cache.maxFps)) cache.maxFps = 60;
    if (cache && !(cache.lookSens >= 0.25 && cache.lookSens <= 3)) cache.lookSens = 1;
    if (cache) cache.lookInvert = cache.lookInvert === true;
    // (the free camera was one that didn't follow: plan 56 merged it into the one camera)
    if (cache && !["on", "gentle", "off"].includes(cache.camFollow))
      cache.camFollow = raw?.cam3p === "free" ? "off" : "on";
    if (cache && !(cache.stickSens >= 0.25 && cache.stickSens <= 3)) cache.stickSens = 1;
    if (cache) cache.lookInvertX = cache.lookInvertX === true;
    if (cache) cache.hands1p = cache.hands1p !== false;
    if (cache) cache.perfStats = cache.perfStats === true;
    if (
      cache &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches &&
      raw?.reducedMotion === undefined
    ) {
      cache.reducedMotion = true;
    }
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache as Prefs;
}

export function setPrefs(patch: Partial<Prefs>) {
  cache = { ...prefs(), ...patch, vol: { ...prefs().vol, ...(patch.vol ?? {}) } };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {}
  for (const s of subs) s();
}

export function subscribePrefs(cb: () => void) {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribePrefs, prefs, () => DEFAULTS);
}
