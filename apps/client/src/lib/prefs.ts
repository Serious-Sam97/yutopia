"use client";

import { useSyncExternalStore } from "react";

// Per-device preferences. Browser storage only (and safe when it's blocked).
export interface Prefs {
  quality: "high" | "low";
  reducedMotion: boolean;
  spatial: boolean;
  noiseSuppression: boolean;
  vol: { master: number; voices: number; ambience: number; music: number; effects: number };
  micId: string;
  camId: string;
  speakerId: string;
  seenIntro: boolean;
}

const KEY = "yutopia:prefs";
const DEFAULTS: Prefs = {
  quality: "high",
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
