"use client";

import { useSyncExternalStore } from "react";

// Per-device preferences. Browser storage only (and safe when it's blocked).
export interface Prefs {
  quality: QualityPref;
  reducedMotion: boolean;
  spatial: boolean;
  noiseSuppression: boolean;
  vol: { master: number; voices: number; ambience: number; music: number; effects: number };
  micId: string;
  camId: string;
  speakerId: string;
  seenIntro: boolean;
}

export type Quality = "high" | "medium" | "low";
export type QualityPref = Quality | "auto";

// Auto: a tier for this device (the world steps down one more if it can't keep up).
export function deviceQuality(): Quality {
  if (typeof navigator === "undefined") return "high";
  const n = navigator as Navigator & { deviceMemory?: number };
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const small = typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 600;
  const cores = n.hardwareConcurrency ?? 4;
  const mem = n.deviceMemory ?? 8;
  if ((touch && small) || cores <= 2 || mem <= 2) return "low";
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
  vol: { master: 0.9, voices: 1, ambience: 0.5, music: 0.5, effects: 0.7 },
  micId: "",
  camId: "",
  speakerId: "",
  seenIntro: false,
};

let cache: Prefs | null = null;
const subs = new Set<() => void>();

export function prefs(): Prefs {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    cache = { ...DEFAULTS, ...raw, vol: { ...DEFAULTS.vol, ...(raw?.vol ?? {}) } };
    if (cache && !["auto", "high", "medium", "low"].includes(cache.quality)) cache.quality = "auto";
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
