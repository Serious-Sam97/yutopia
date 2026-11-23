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
  /** (plan 118, F9a) my own shot as I fired it (the server's "arms:shot" goes to the others): its holes */
  onShot: null as
    | ((m: {
        gun: string;
        ox: number;
        oy: number;
        oz: number;
        yaw: number;
        pitch: number;
        seed: number;
        spread: number;
      }) => void)
    | null,
  /** (plan 118, F11a) in the arena: what's under someone's feet there (the map's own materials), and how much of a
   *  sound from there gets through the map's walls to me (1 none in the way) — null, the world's own */
  footing: null as ((x: number, y: number, z: number) => string | null) | null,
  muffle: null as ((x: number, y: number, z: number) => number) | null,
  /** (plan 118) a grenade in hand: the clicks throw it, not the gun's */
  nadeReady: false,
  /** (plan 118) the charge in hand (5): G drops it, not the gun — put away by 1/2/3/Q like the grenade (the hand's
   *  keys are dark/index.ts's capture listener's, the park's own never sees them: the double check 2) */
  chargeSel: false,
  /** (plan 118, F7a) my shot's on someone as my screen draws them: the park plays the hit at once (the server's
   *  word follows) — the point (the floor's coords, z up) */
  predictHit: null as ((x: number, y: number, z: number) => void) | null,
  /** (plan 119, F2a) the knife's swings to draw on each person: sid → when (performance.now), the right's stab or the
   *  left's slash, the n-th (the slash's side alternates) */
  swings: new Map<string, { at: number; heavy: boolean; n: number }>(),
  /** (plan 119) who has the charge before them: drawn in both hands, knelt over it planting, or defusing it */
  gear: new Map<string, "hold" | "plant" | "defuse">(),
  /** (the user's feedback 2026-11-23) in the match and out of the round — dead: no firing, no moving (the body lies
   *  where it fell; the spectator's camera is the mouse's) */
  dead: false,
  /** my primary and pistol as the match has them: 1 and 2 draw these, whichever quick slots they sit in (no rifle: the
   *  pistol's slot 0 — 2 found nothing there and the charge stayed in hand) */
  loadout: { primary: "", pistol: "" },
  /** (plan 119) the charge's carriers with it on their backs (not drawn) */
  packs: new Set<string>(),
  /** (plan 119) where the charge is being planted or lies planted (the floor's coords x, z: the park's own) */
  gearAt: null as [number, number] | null,
};
