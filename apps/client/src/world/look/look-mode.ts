// Plan 73 — which look the world is drawn in: `life` (the grown-up look, everyone's since 2026-11-10) or
// `classic` (the old one: flat, cel, ink — kept to compare). Read once, at start: `?look=classic` in the
// address, or `localStorage["yutopia:look"]` — no UI; a reload changes it. Everything that differs by look
// asks `lookMode()`.
export type LookMode = "classic" | "life";

let mode: LookMode | null = null;

function read(): LookMode {
  if (typeof window === "undefined") return "life";
  try {
    const q = new URLSearchParams(window.location.search).get("look");
    if (q === "life" || q === "classic") return q;
    const kept = window.localStorage.getItem("yutopia:look");
    if (kept === "life" || kept === "classic") return kept;
  } catch {
    // (no storage, an odd address: the default)
  }
  return "life";
}

/** The look the world is drawn in (fixed for the page's life). */
export function lookMode(): LookMode {
  mode ??= read();
  return mode;
}

/** Drawn in the life look. */
export const isLife = () => lookMode() === "life";

/** The life look's buildings (plan 73 phase 7: walls, floors, the outside in the library's materials) —
 *  `?build=old` the buildings as they were under the life light, to compare. */
export const isLifeBuild = (): boolean => {
  if (!isLife()) return false;
  try {
    return new URLSearchParams(window.location.search).get("build") !== "old";
  } catch {
    return true;
  }
};

/** The life look's outdoors (plan 73 phase 8: the ground, the trees, the plants, the cars in the
 *  library's materials and new shapes) — `?out=old` the outdoors as they were under the life light. */
export const isLifeOut = (): boolean => {
  if (!isLife()) return false;
  try {
    return new URLSearchParams(window.location.search).get("out") !== "old";
  } catch {
    return true;
  }
};

/** The life look's pets (plan 73 phase 9: soft fur, wet eyes, no ink) — `?pets=old` as they were. */
export const isLifePets = (): boolean => {
  if (!isLife()) return false;
  try {
    return new URLSearchParams(window.location.search).get("pets") !== "old";
  } catch {
    return true;
  }
};

/** (tests only) set the look. */
export function setLookModeForTest(m: LookMode | null) {
  mode = m;
}
