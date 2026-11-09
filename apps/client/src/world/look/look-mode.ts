// Plan 73 — which look the world is drawn in: `classic` (today's: flat, cel, ink) or `life` (the
// grown-up look, built phase by phase behind this switch until people, things and buildings are all in).
// Read once, at start: `?look=life` in the address, or `localStorage["yutopia:look"]` — no UI; a reload
// changes it. Everything that differs by look asks `lookMode()`.
export type LookMode = "classic" | "life";

let mode: LookMode | null = null;

function read(): LookMode {
  if (typeof window === "undefined") return "classic";
  try {
    const q = new URLSearchParams(window.location.search).get("look");
    if (q === "life" || q === "classic") return q;
    const kept = window.localStorage.getItem("yutopia:look");
    if (kept === "life" || kept === "classic") return kept;
  } catch {
    // (no storage, an odd address: today's look)
  }
  return "classic";
}

/** The look the world is drawn in (fixed for the page's life). */
export function lookMode(): LookMode {
  mode ??= read();
  return mode;
}

/** Drawn in the life look. */
export const isLife = () => lookMode() === "life";

/** (tests only) set the look. */
export function setLookModeForTest(m: LookMode | null) {
  mode = m;
}
