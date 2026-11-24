"use client";

import { useSyncExternalStore } from "react";

// The new UI (docs/plan/125-the-new-ui.md) is the desktop's: a mouse and a wide window (F12c — phones keep the old
// one). `?ui=old` keeps the old one on a desktop too (to compare), and so does `yutopia:ui` = "old" in the
// browser's storage (the e2e specs written against the old UI: playwright.config.ts sets it; e2e/lamp-ui.spec.ts doesn't).
const QUERY = "(pointer: fine) and (min-width: 900px)";
let forcedOld: boolean | null = null;

export function lampWanted(): boolean {
  if (typeof window === "undefined") return false;
  forcedOld ??= new URLSearchParams(window.location.search).get("ui") === "old" || storedOld();
  if (forcedOld) return false;
  return window.matchMedia?.(QUERY).matches ?? false;
}

function storedOld(): boolean {
  try {
    return localStorage.getItem("yutopia:ui") === "old";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void): () => void {
  const m = window.matchMedia?.(QUERY);
  m?.addEventListener("change", cb);
  return () => m?.removeEventListener("change", cb);
}

export function useLamp(): boolean {
  return useSyncExternalStore(subscribe, lampWanted, () => false);
}
