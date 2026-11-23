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
  // (plan 116 F7a) first person's gun: the view model's own lens (°), where it sits (CS's presets), its bob
  vmFov: number;
  vmPlace: "classic" | "close" | "couch";
  vmBob: boolean;
  // the car's gearbox (docs/plan/92, F4a): shifted for you, or by hand (Q/E, the bumpers)
  carManual: boolean;
  // (plan 98 phase 22) the cars' paint and chrome reflecting the world round them (a probe caught near you now and
  // then): on High by itself ("auto"), or on or off by hand on any quality — (plan 99) drawn in its own few programs
  carReflect: "auto" | "on" | "off";
  // frames per second, at most (0 = as many as the screen shows); 30 once nothing moves
  maxFps: MaxFps;
  // the frame's numbers in a corner (fps, where each frame's time goes: docs/plan/38-the-lag.md)
  perfStats: boolean;
  // the graphics settings set by hand over the quality's preset (lib/graphics.ts; docs/plan/91 phase 9): null, the
  // preset as it is
  graphics: Record<string, unknown> | null;
}

// (lowest: weak machines — no antialiasing, under a pixel a pixel; docs/plan/50-the-volume.md 7d)
// (potato: below lowest, for a weak GPU — an integrated Intel/AMD one, or drawing without one: docs/plan/90-the-
// friends-machines.md phase 2, F3c. Drawn as lowest, at half a pixel a pixel, no lamps: the four tiers untouched)
export type Quality = "high" | "medium" | "low" | "lowest" | "potato";
/** The tier the world draws as: potato is lowest, made lighter by the view (tp's `potato`). */
export type DrawnQuality = Exclude<Quality, "potato">;
export const drawnAs = (q: Quality): DrawnQuality => (q === "potato" ? "lowest" : q);
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
  // (the GPU first: a weak one is the wall, however many cores — production's reports, plan 90)
  const gpu = gpuKind();
  if (gpu === "weak" || gpu === "software") return "potato";
  if (cores <= 2 || mem <= 2) return "lowest";
  if (touch && small) return "low";
  if (touch || cores <= 4 || mem <= 4) return "medium";
  return "high";
}

// What the GPU is, by its name (a throwaway context's, once): "software" — the browser drawing without one, "weak" —
// an integrated Intel or AMD (Iris Xe and Arc aside), else "ok". Production's reports (plan 90): Intel UHD 13 fps
// and AMD Radeon (Renoir) 22–24 on lowest, the main thread waiting; "Microsoft Basic Render Driver" seen.
export type GpuKind = "software" | "weak" | "ok";
let gpuSeen: { name: string; kind: GpuKind } | null = null;
export function gpuName(): string {
  if (gpuSeen) return gpuSeen.name;
  let name = "";
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    // (no WebGL at all: nothing to say)
  }
  gpuSeen = { name, kind: gpuKindOf(name) };
  return name;
}
export function gpuKind(): GpuKind {
  if (typeof document === "undefined") return "ok";
  gpuName();
  return gpuSeen?.kind ?? "ok";
}
/** (pure, tests) */
export function gpuKindOf(name: string): GpuKind {
  if (/SwiftShader|llvmpipe|Basic Render|Software|softpipe/i.test(name)) return "software";
  if (/Intel/i.test(name) && !/Arc|Iris\(R\) Xe|Iris Xe/i.test(name)) return "weak";
  // (an AMD APU's graphics: "AMD Radeon(TM) Graphics", "Radeon Vega 8 Graphics" — a discrete card has its model)
  if (
    /AMD|Radeon/i.test(name) &&
    /Radeon(\(TM\))? (Vega \d+ )?Graphics|Vega \d+ Graphics|renoir|cezanne|lucienne|picasso|raven/i.test(name)
  )
    return "weak";
  return "ok";
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
  vmFov: 62,
  vmPlace: "classic",
  vmBob: true,
  carManual: false,
  carReflect: "auto",
  maxFps: 60,
  perfStats: false,
  graphics: null,
};

let cache: Prefs | null = null;
const subs = new Set<() => void>();

export function prefs(): Prefs {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    cache = { ...DEFAULTS, ...raw, vol: { ...DEFAULTS.vol, ...(raw?.vol ?? {}) } };
    if (cache && !["auto", "high", "medium", "low", "lowest", "potato"].includes(cache.quality)) cache.quality = "auto";
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
    if (cache) {
      cache.vmFov = Math.max(54, Math.min(74, Number(cache.vmFov) || 62));
      if (!["classic", "close", "couch"].includes(cache.vmPlace)) cache.vmPlace = "classic";
      cache.vmBob = cache.vmBob !== false;
    }
    if (cache) cache.carManual = cache.carManual === true;
    if (cache && !["auto", "on", "off"].includes(cache.carReflect)) cache.carReflect = "auto";
    if (cache) cache.perfStats = cache.perfStats === true;
    if (cache && (typeof cache.graphics !== "object" || Array.isArray(cache.graphics))) cache.graphics = null;
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
