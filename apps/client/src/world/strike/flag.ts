// (plan 114) What the Strike Park's match wants of the keys this frame — read by the modules that take keys first
// (dark/index.ts, in the capture phase: B a battery, Use): kept tiny so they don't load the park's chunk.
export const strikeKeys = {
  /** in the match: B is the buy grid, Tab the scoreboard */
  playing: false,
  /** held Use is the match's here (the charge on a site, the planted charge, a hostage) */
  use: false,
  /** the match's camera (null: not in it — the world's own) */
  view: null as "first" | "chase" | null,
  /** the run speed with what's in my hand (m/s, CS's: shared strike rules speedWith), 0 not in the match */
  speed: 0,
  /** the digits are the match's (the map vote, the radio's lines): not the world's quick slots */
  digits: false,
  /** holding use for the match (planting, defusing): crouched and still */
  holding: false,
  /** (plan 115 phase 55) my kit as I've chosen it (strike/kit.ts), and whether I'm at the corner trying it on (shown
   *  on me out of the match too, in that team's colours) */
  myKit: "",
  kitTry: null as "r" | "w" | null,
  /** crouched now (walker.ts): the tutorial's tick */
  crouched: false,
  /** carrying a hostage: slowed to 60 % (CS's) */
  carrying: false,
  /** (plan 115 phase 23) when I last pressed inspect (F), ms (performance.now) — the view model turns the gun to show it */
  inspectAt: -1e9,
  /** the combat knife in my hand (left click stabs) */
  knife: false,
  /** (plan 115 F3) the map's climate while I'm in the arena (null: the world's own) */
  climate: null as import("@yutopia/shared/strike").Climate | null,
};
