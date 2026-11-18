// The skate's numbers (docs/plan/103-the-skate.md, F2b: the whole of Tony Hawk's — huge airs, the moon's gravity,
// landings forgiven — the same on the street as in the park). Metres, seconds; tuned on /dev/skate.

import type { Footing } from "../move/surface.ts";

export const SKATE = {
  /** the pull down, everywhere on a board (the moon's: a vert air hangs) */
  g: 8,
  /** pushing: the speed a push holds, how hard it gets there; a push's cycle (s: the pose's kick) */
  push: 7.6,
  pushAccel: 4.2,
  pushCycle: 0.75,
  /** the fastest a board goes (down a long hill, out of a pipe) */
  top: 16,
  /** rolling's own loss (m/s²) and the air's (× v²) */
  roll: 0.22,
  drag: 0.0035,
  /** S: a powerslide's stop (m/s²) */
  brake: 7,
  /** carving: the tightest turn (m) at speed, the turn at a crawl (rad/s: a kick turn), the most (rad/s) */
  radius: 2.1,
  pivot: 3.2,
  turnMax: 3.4,
  /** pumping (Space held going down a ramp): m/s² more */
  pump: 2.2,
  /** the ollie: a tap's and a full crouch's height (m), the crouch it takes (s) */
  ollieTap: 0.75,
  ollie: 1.45,
  crouch: 0.32,
  /** off a grind or a wall: a share of the ollie */
  offPop: 0.7,
  /** a vert lip's assist: the way up × this (Tony Hawk's: a pipe always sends you higher than the drop) */
  vertBoost: 1.22,
  /** a lip this upright (the tangent's up share) is a vert lip: up and back in */
  vertLip: 0.85,
  /** spinning in the air (rad/s), A/D held */
  spin: 2 * Math.PI * 1.2,
  /** a landing: the most sideways against the way it goes (rad), the hardest it can come down (m/s into it) */
  sideways: (52 * Math.PI) / 180,
  hardest: 15,
  /** a grind: how near (plan m) and how far over (m) a rail is caught, its loss (m/s²), the least it keeps going */
  reach: 0.62,
  over: 0.55,
  grindLoss: 0.45,
  grindMin: 2.2,
  /** the balance's drift (1/s²), the keys' push on it (1/s²), its damping (1/s) */
  tip: 2.1,
  hold: 6.5,
  damp: 1.4,
  /** W then S (S then W) this quickly: a manual (nose manual); a landing's grace to link it (s) */
  tap: 0.26,
  grace: 0.28,
  /** a revert: Q this soon after landing in a ramp (s) */
  revert: 0.34,
  /** a lip trick: this slow at the coping (m/s), this near it (m along) */
  lipSpeed: 3.6,
  lipNear: 0.4,
  /** a wallride: its longest (s), its fall's share of g */
  wallLen: 1.0,
  wallG: 0.25,
  /** into a wall faster than this (m/s): a bail; slower, it knocks you back */
  bailWall: 6.0,
  /** a step a board rolls up (m): a kerb's foot, a sill — anything more is ollied */
  stepUp: 0.06,
  /** stepping off: kicked up to the hand under this (m/s), else a step off and a few running steps */
  offSlow: 3.5,
} as const;

/** The three boards' shapes (F9a): how each goes. */
export type BoardShape = "vert" | "street" | "cruiser";
export const BOARD_SHAPES: BoardShape[] = ["vert", "street", "cruiser"];
export interface BoardFeel {
  /** × the ollie's height, × the top push speed, × a flip's speed (more: quicker), × the carve, × rough ground's loss */
  pop: number;
  speed: number;
  flip: number;
  turn: number;
  rough: number;
}
export const BOARD_FEEL: Record<BoardShape, BoardFeel> = {
  // the 80s vert deck: big, stable, soft wheels; the flips a touch slower
  vert: { pop: 1.0, speed: 1.0, flip: 0.86, turn: 0.92, rough: 0.8 },
  // the early-90s popsicle: pops, flips quick, hard small wheels (rough ground hurts)
  street: { pop: 1.06, speed: 0.96, flip: 1.15, turn: 1.08, rough: 1.25 },
  // the cruiser: rolls fast and over anything, pops low, flips badly
  cruiser: { pop: 0.82, speed: 1.1, flip: 0.72, turn: 1.0, rough: 0.45 },
};

/** The board's nine (three shapes × three variants: tools/art/skate's manifest). */
export const BOARD_VARIANTS = [
  "vert-classic",
  "vert-fish",
  "vert-square",
  "street-pop",
  "street-slick",
  "street-tech",
  "cruiser-classic",
  "cruiser-wood",
  "cruiser-mini",
] as const;
export type BoardVariant = (typeof BOARD_VARIANTS)[number];
export const shapeOf = (v: BoardVariant | string): BoardShape =>
  v.startsWith("vert") ? "vert" : v.startsWith("cruiser") ? "cruiser" : "street";

/** The ground under the wheels (F8a): its loss (m/s² while rolling), × a push, the side grip (1: none slides), and
 *  whether it stops a board dead (deep snow, sand: thrown forward on the move). Plan 65's snow: ploughed roads and
 *  paths are `asphalt` / `walk`, packed snow `snow`, off the paths `deep`. */
export interface Underwheel {
  loss: number;
  push: number;
  grip: number;
  stop?: boolean;
  /** how rough it is (the sound's, the cruiser's say over it) */
  rough: number;
}
export const UNDERWHEEL: Record<Footing, Underwheel> = {
  floor: { loss: 0, push: 1, grip: 1, rough: 0 },
  asphalt: { loss: 0.15, push: 1, grip: 1, rough: 0.2 },
  walk: { loss: 0.35, push: 1, grip: 1, rough: 0.4 },
  path: { loss: 1.6, push: 0.8, grip: 0.9, rough: 1 },
  rock: { loss: 2.2, push: 0.75, grip: 0.9, rough: 1 },
  snow: { loss: 3.2, push: 0.55, grip: 0.6, rough: 0.5 },
  ice: { loss: 0.1, push: 0.3, grip: 0.18, rough: 0.1 },
  deep: { loss: 12, push: 0, grip: 1, stop: true, rough: 1 },
  sand: { loss: 9, push: 0.2, grip: 1, stop: true, rough: 1 },
};
export const underwheel = (f: string | undefined): Underwheel =>
  UNDERWHEEL[(f ?? "floor") as Footing] ?? UNDERWHEEL.floor;

/** A board as a thing in the pack (the inventory's id): one a variant — `board_street_pop` … */
export const boardItem = (v: BoardVariant): string => `board_${v.replace("-", "_")}`;
export const BOARD_ITEMS: string[] = BOARD_VARIANTS.map(boardItem);
export const variantOfItem = (id: string | undefined | null): BoardVariant | null => {
  if (!id?.startsWith("board_")) return null;
  const v = id.slice(6).replace("_", "-");
  return (BOARD_VARIANTS as readonly string[]).includes(v) ? (v as BoardVariant) : null;
};
export const isBoardItem = (id: unknown): boolean => typeof id === "string" && variantOfItem(id) !== null;
