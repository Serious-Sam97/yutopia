// Plan 73 — which look the world is drawn in: `life` (the grown-up look, everyone's since 2026-11-10) or
// `classic` (the old one: flat, cel, ink — kept to compare). Everything that differs by look asks
// `lookMode()`, read once at start.
// On live (the production build) there's one look: life — no address, no setting picks another (the
// user, 2026-11-10: "we should have only one style on live"). In development `?look=classic` (and
// `?build=old`, `?out=old`, `?pets=old`) still draw the old to compare. The look a browser once kept
// (`localStorage["yutopia:look"]`, plan 73's comparisons) is forgotten everywhere.
export type LookMode = "classic" | "life";

/** The production build: the one look, no switches. */
const LIVE = process.env.NODE_ENV === "production";

let mode: LookMode | null = null;

/** An address switch — only in development. */
function asked(key: string, value: string): boolean {
  if (LIVE || typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get(key) === value;
  } catch {
    return false;
  }
}

function read(): LookMode {
  if (typeof window === "undefined") return "life";
  try {
    window.localStorage.removeItem("yutopia:look");
  } catch {
    // (no storage: nothing kept)
  }
  return asked("look", "classic") ? "classic" : "life";
}

/** The look the world is drawn in (fixed for the page's life). */
export function lookMode(): LookMode {
  mode ??= read();
  return mode;
}

/** Drawn in the life look. */
export const isLife = () => lookMode() === "life";

/** The life look's buildings (plan 73 phase 7: walls, floors, the outside in the library's materials) —
 *  `?build=old` (development) the buildings as they were under the life light, to compare. */
export const isLifeBuild = (): boolean => isLife() && !asked("build", "old");

/** The life look's outdoors (plan 73 phase 8: the ground, the trees, the plants, the cars in the
 *  library's materials and new shapes) — `?out=old` (development) as they were under the life light. */
export const isLifeOut = (): boolean => isLife() && !asked("out", "old");

/** The life look's pets (plan 73 phase 9: soft fur, wet eyes, no ink) — `?pets=old` (development) as
 *  they were. */
export const isLifePets = (): boolean => isLife() && !asked("pets", "old");

/** (tests only) set the look. */
export function setLookModeForTest(m: LookMode | null) {
  mode = m;
}
