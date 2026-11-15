import { type DrawnQuality, drawnAs, prefs, type Quality } from "./prefs";

// The graphics settings, a game's (docs/plan/91-the-big-map.md phase 9): the tiers (Potato … High) are presets —
// picking one sets every setting below, as the tier always drew — and each can be changed on its own, the preset
// then reading Custom (`prefs().graphics`: only what was changed by hand, laid over the preset). Auto picks the
// preset as before; a setting changed by hand stops it (the tier it was on kept, as a tier picked by hand).

/** The far land's rings (far3d.ts RINGS): Low … Ultra, the tiers' own. */
export type Horizon = DrawnQuality;
export type FarTrees = 0 | 1200 | 1800;
export type SunShadows = 0 | 1024 | 2048 | 4096;
export type Level3 = "low" | "medium" | "high";

export interface Graphics {
  /** the frame drawn at this % of the screen's own pixels (devicePixelRatio): 25 … 200 */
  res: number;
  /** antialiasing (MSAA): set when the 3D view's made — on a restart */
  aa: boolean;
  /** the near land made out to here (m: reach.ts) */
  land: number;
  /** the districts — the roads, the buildings past the town — made within this (m) */
  districts: number;
  /** the far land, the horizon's rings */
  horizon: Horizon;
  /** the far land's trees, out to here (m; 0: none) */
  farTrees: FarTrees;
  /** the sun's shadow map (0: no shadows) */
  shadows: SunShadows;
  /** the torch's and the headlamps' shadows */
  lightShadows: boolean;
  /** the lamps lit near you (point lights, of 10) */
  lamps: number;
  /** the frame's finish — the colour grade and the vignette (and with it the passes below) */
  finish: boolean;
  /** the life look's ambient occlusion (needs the finish) */
  ao: boolean;
  /** the glow round lamps and screens at night (needs the finish) */
  bloom: boolean;
  /** the film grain (needs the finish) */
  grain: boolean;
  /** the morning fog's banks over low places */
  fogBanks: boolean;
  /** the rain's and the snow's density */
  weather: Level3;
  /** a car's rear-view mirror */
  mirror: "off" | "low" | "high";
  /** people's nearest detail (low: the nearest level never built, a blob for a shadow) */
  people: "low" | "high";
}

export const GRAPHICS_KEYS = [
  "res",
  "aa",
  "land",
  "districts",
  "horizon",
  "farTrees",
  "shadows",
  "lightShadows",
  "lamps",
  "finish",
  "ao",
  "bloom",
  "grain",
  "fogBanks",
  "weather",
  "mirror",
  "people",
] as const satisfies readonly (keyof Graphics)[];

/** The pixels a resolution (% of the screen's own) draws at: to a thousandth, so a preset's is its tier's exactly
 *  (2 × 37.5 / 100 is 0.75, not 0.7499…: the view compares them each second). */
export const ratioOf = (res: number, dpr = screenDpr()): number => Math.round(dpr * res * 10) / 1000;
/** The screen's own pixels per CSS pixel. */
export const screenDpr = (): number => (typeof window !== "undefined" && window.devicePixelRatio) || 1;

/** The pixels a tier drew at (render pixels per CSS pixel: view.ts ratioFor, as it always was). */
export function tierRatio(q: Quality, dpr = screenDpr()): number {
  return q === "high"
    ? Math.min(2, dpr)
    : q === "medium"
      ? Math.min(1.5, dpr)
      : q === "low"
        ? 1
        : q === "lowest"
          ? 0.75
          : 0.5;
}

// (reach.ts's, here so the settings' module reads none of the 3D view's)
export const REACH: Record<Quality, { land: number; districts: number }> = {
  high: { land: 440, districts: 900 },
  medium: { land: 440, districts: 900 },
  low: { land: 440, districts: 900 },
  lowest: { land: 440, districts: 700 },
  potato: { land: 330, districts: 600 },
};

/** A tier's every setting: what it always drew (plan 91 phase 9's table). */
export function presetOf(q: Quality, dpr = screenDpr(), mem = deviceMem()): Graphics {
  const d = drawnAs(q);
  const hi = d === "high";
  const lowish = d === "low" || d === "lowest";
  const reach = { ...REACH[q] };
  if (mem <= 4) reach.districts = Math.min(reach.districts, REACH.lowest.districts);
  return {
    // (not rounded: the preset's pixels are the tier's exactly — Lowest's 0.75 on a 2× screen is 37.5%)
    res: (tierRatio(q, dpr) / dpr) * 100,
    aa: q !== "lowest" && q !== "potato",
    land: reach.land,
    districts: reach.districts,
    horizon: d,
    farTrees: hi ? 1800 : d === "medium" ? 1200 : 0,
    shadows: hi ? 2048 : d === "medium" ? 1024 : 0,
    lightShadows: hi,
    lamps: q === "high" ? 10 : q === "medium" ? 6 : q === "low" ? 3 : q === "lowest" ? 2 : 0,
    finish: hi || d === "medium",
    ao: hi,
    bloom: hi,
    grain: hi,
    fogBanks: hi,
    weather: hi ? "high" : d === "lowest" ? "low" : "medium",
    mirror: hi ? "high" : d === "medium" ? "low" : "off",
    people: lowish ? "low" : "high",
  };
}

export function deviceMem(): number {
  return (typeof navigator !== "undefined" && (navigator as Navigator & { deviceMemory?: number }).deviceMemory) || 8;
}

/** What's laid over the preset, kept to what's valid (a stored one from another version: what's known of it). */
export function cleanGraphics(raw: unknown): Partial<Graphics> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: Partial<Graphics> = {};
  const num = (k: keyof Graphics, lo: number, hi: number) => {
    const v = r[k];
    if (typeof v === "number" && v >= lo && v <= hi) (out as Record<string, unknown>)[k] = v;
  };
  const bool = (k: keyof Graphics) => {
    if (typeof r[k] === "boolean") (out as Record<string, unknown>)[k] = r[k];
  };
  const one = <T extends string | number>(k: keyof Graphics, of: readonly T[]) => {
    if (of.includes(r[k] as T)) (out as Record<string, unknown>)[k] = r[k];
  };
  num("res", 25, 200);
  bool("aa");
  num("land", 220, 660);
  num("districts", 500, 1200);
  one("horizon", ["lowest", "low", "medium", "high"] as const);
  one("farTrees", [0, 1200, 1800] as const);
  one("shadows", [0, 1024, 2048, 4096] as const);
  bool("lightShadows");
  num("lamps", 0, 10);
  for (const k of ["finish", "ao", "bloom", "grain", "fogBanks"] as const) bool(k);
  one("weather", ["low", "medium", "high"] as const);
  one("mirror", ["off", "low", "high"] as const);
  one("people", ["low", "high"] as const);
  return Object.keys(out).length ? out : null;
}

/** A tier's preset with what's set by hand over it (`over`; the prefs' by default). */
export function graphicsFor(q: Quality, over: Partial<Graphics> | null = cleanGraphics(prefs().graphics)): Graphics {
  return { ...presetOf(q), ...(over ?? {}) };
}

/** Whether the settings are a preset's own (nothing set by hand that differs from it). */
export function isPreset(q: Quality, over: Partial<Graphics> | null): boolean {
  if (!over) return true;
  const p = presetOf(q);
  return GRAPHICS_KEYS.every((k) => over[k] === undefined || over[k] === p[k]);
}

/** A short signature (what's drawn changes when it does). */
export const graphicsSig = (g: Graphics): string => GRAPHICS_KEYS.map((k) => String(g[k])).join("|");

// ── the settings the world draws with now (the view sets them; what reads them — the cars, the mood, the rain —
// asks here) ──
let now: Graphics | null = null;
let tierNow: Quality | null = null;
export function gfxNow(): Graphics {
  now ??= presetOf("high");
  return now;
}
/** The tier drawn now (Auto's, when it's Auto: the settings' page shows its preset). */
export const gfxTier = (): Quality | null => tierNow;
export function setGfxNow(g: Graphics, tier?: Quality) {
  now = g;
  if (tier) tierNow = tier;
}
