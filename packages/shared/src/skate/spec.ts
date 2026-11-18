// The skate's numbers (docs/plan/104-the-skate-again.md F1a: Tony Hawk's own — heavy and fast). Sourced where a
// source exists (Neversoft's released THUG engine, the THPS3/4/THUG line the 2020 remake reused; docs/plan/104's
// table), else marked est. Metres, seconds; tuned on /dev/skate.
//
// Why three gravities: a flat ollie is ~0.5 s up and down (≈30 frames, the engine's own comment) for ~0.8 m — that's
// ~25 m/s² — while a vert air hangs 1.5–2.5 s at 3–5 m over the coping (est.), ~9 m/s²; on the ramps' faces the pull
// is between, so a pipe is pumped up to the coping without the whole speed going into the climb.

import type { Footing } from "../move/surface.ts";

export const SKATE = {
  /** the pull down in the air off the street and the kickers (heavy: punchy ollies), on the ramps and the land's
   *  slopes, and in a vert air (it hangs) */
  g: 25,
  gRamp: 12,
  gVert: 9,
  /** pushing: the speed W pushes to and how hard; the auto-kick under `kickMin` up to `kick` (you never stall); a push's
   *  cycle (s: the pose's kick) */
  push: 11,
  pushAccel: 6,
  kickMin: 1.3,
  kick: 3,
  pushCycle: 0.62,
  /** the fastest a board goes (~25 m/s: "about 1100 in/s, depends on stats"); lit (the special), × this */
  top: 25,
  litSpeed: 1.15,
  /** rolling's own loss (m/s²) and the air's (× v²) */
  roll: 0.2,
  drag: 0.0012,
  /** S: the brake at a crawl (m/s²); over `cessFrom` m/s held S is a powerslide (the board across, scrubbing) */
  brake: 7,
  cessFrom: 4,
  cess: 9,
  /** carving: the tightest turn (m) at speed, the turn at a crawl (rad/s: a kick turn), the most (rad/s) */
  radius: 3.4,
  pivot: 3.2,
  turnMax: 3.0,
  /** pumping (Space held going down a ramp): m/s² more */
  pump: 3,
  /** the ollie: a tap's and a full crouch's height (m), the crouch it takes (s) — with g 25, ~0.4–0.55 s up */
  ollieTap: 0.5,
  ollie: 0.95,
  crouch: 0.3,
  /** off a grind or a wall: a share of the ollie */
  offPop: 0.8,
  /** a vert lip's way up kept (the speed out of the pipe), and the most of it (m/s: ~8 m over the coping) */
  vertBoost: 1.0,
  vertMax: 12,
  /** a lip this upright (the tangent's up share) is a vert lip: up, turned back in, back down */
  vertLip: 0.85,
  /** a vert air's auto-turn back to face into the ramp (rad/s) — Neversoft's AUTOTURN */
  autoturn: 6.5,
  /** spinning in the air (rad/s), Q/E held */
  spin: 2 * Math.PI * 1.1,
  /** a landing: the most sideways against the way it goes (rad), the hardest it can come down (m/s into it) */
  sideways: (55 * Math.PI) / 180,
  hardest: 20,
  /** a grind: how near (plan m) and how far over (m) a rail is caught (in the air, grind held), the speed it adds
   *  (Rail_Speed_Boost), its loss (m/s²), the least it keeps going */
  reach: 0.7,
  over: 0.6,
  grindBoost: 1.5,
  grindLoss: 0.25,
  grindMin: 3,
  /** the balance (Neversoft's CManual: an inverted pendulum, the same for manuals, grinds and lips): its drift (1/s²),
   *  the keys' push on it (1/s²), its damping (1/s), how much harder each second of balance in the combo makes it, the
   *  time a grind of the same kind again adds and a new one takes off, the nudge when it sits still */
  tip: 2.0,
  hold: 7,
  damp: 1.4,
  hard: 0.12,
  sameAdd: 1.5,
  newSub: 0.5,
  nudge: 0.35,
  /** W then S (S then W) this quickly: a manual (nose manual); a landing's grace to link it (s) */
  tap: 0.25,
  grace: 0.22,
  /** a revert: Shift this soon after landing in a ramp (s) */
  revert: 0.25,
  /** a lip trick: this slow at the coping (m/s), this near it (m along) */
  lipSpeed: 3.6,
  lipNear: 0.4,
  /** a wallride: its longest (s), its fall's share of g; a wallplant: its kick out and up (m/s), no grind after (s) */
  wallLen: 1.0,
  wallG: 0.25,
  plantOut: 4,
  plantUp: 7,
  plantNoGrind: 0.3,
  /** into a wall faster than this (m/s): a bail; slower, it knocks you back */
  bailWall: 7.0,
  /** a step a board rolls up (m): a kerb's foot, a sill — anything more is ollied */
  stepUp: 0.06,
  /** stepping off: kicked up to the hand under this (m/s), else a step off and a few running steps */
  offSlow: 3.5,
  /** the special (score.cpp): full at this, its decay unlit (/s), its drain lit (/s: ~15 s) */
  specialFull: 3000,
  specialDecay: 50,
  specialDrain: 200,
  /** two directions then a trick key within this (s): a special */
  specialWindow: 0.45,
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
