// The skate's tricks and the combo (docs/plan/103-the-skate.md F4a, F5a): Pro Skater 2–3's core set, each a key
// and a direction, what the board does in it (a flip's turns), how long it takes, its points; and the combo's
// count — each trick's points, spins and switch added, the sum × how many tricks, the same trick again worth less.
// Real skateboarding's names; the maps, points and factors after Tony Hawk's Pro Skater 1+2 (docs/plan/104 F3a).

/** A direction held with a trick key (the board's: up = W, the skater's toes' side is "r" for a regular rider). */
export type Dir = "n" | "u" | "d" | "l" | "r" | "ul" | "ur" | "dl" | "dr";
export const DIRS: Dir[] = ["n", "u", "d", "l", "r", "ul", "ur", "dl", "dr"];
export function dirOf(up: boolean, down: boolean, left: boolean, right: boolean): Dir {
  const v = up && !down ? "u" : down && !up ? "d" : "";
  const h = left && !right ? "l" : right && !left ? "r" : "";
  return (v + h || "n") as Dir;
}

export type TrickKind = "flip" | "grab" | "grind" | "slide" | "lip" | "manual" | "revert" | "wall" | "air";

export interface TrickDef {
  kind: TrickKind;
  name: [string, string];
  /** points: a flip's or a lip's, a grab's to start, a grind's or a manual's to start (more as it goes on) */
  pts: number;
  /** points a second held (grabs, grinds, manuals, lips) */
  perSec?: number;
  /** s it takes (flips: the board's turns; grabs: to reach the board; lips: the stall's least) */
  len: number;
  /** a flip's board: turns about its long axis (kick side +), up axis, across (nose over +) */
  roll?: number;
  yaw?: number;
  pitch?: number;
  /** a grind's board on the rail: the trucks (0), the board across it (1), and which end is up (+1 nose, −1 tail) */
  across?: boolean;
  end?: number;
  /** a special (the meter lit) */
  special?: boolean;
}

export const TRICKS = {
  // flips (J + a direction; J again quickly, the upgrade) — base points THUG2's scripts
  kickflip: { kind: "flip", name: ["Kickflip", "Kickflip"], pts: 100, len: 0.36, roll: 1 },
  heelflip: { kind: "flip", name: ["Heelflip", "Heelflip"], pts: 100, len: 0.36, roll: -1 },
  shoveit: { kind: "flip", name: ["Pop Shove-it", "Pop Shove-it"], pts: 100, len: 0.32, yaw: 0.5 },
  impossible: { kind: "flip", name: ["Impossible", "Impossible"], pts: 100, len: 0.42, pitch: 1 },
  varial: { kind: "flip", name: ["Varial Kickflip", "Varial Kickflip"], pts: 300, len: 0.42, roll: 1, yaw: 0.5 },
  varialheel: { kind: "flip", name: ["Varial Heelflip", "Varial Heelflip"], pts: 300, len: 0.42, roll: -1, yaw: -0.5 },
  hardflip: { kind: "flip", name: ["Hardflip", "Hardflip"], pts: 300, len: 0.42, roll: 1, yaw: -0.5 },
  inwardheel: { kind: "flip", name: ["Inward Heelflip", "Inward Heelflip"], pts: 300, len: 0.42, roll: -1, yaw: 0.5 },
  treflip: { kind: "flip", name: ["360 Flip", "360 Flip"], pts: 550, len: 0.5, roll: 1, yaw: 1 },
  shove360: { kind: "flip", name: ["360 Shove-it", "360 Shove-it"], pts: 500, len: 0.48, yaw: 1 },
  // grabs (L + a direction, held; L again quickly, the upgrade)
  melon: { kind: "grab", name: ["Melon", "Melon"], pts: 300, perSec: 300, len: 0.16 },
  indy: { kind: "grab", name: ["Indy", "Indy"], pts: 300, perSec: 300, len: 0.16 },
  nosegrab: { kind: "grab", name: ["Nosegrab", "Nosegrab"], pts: 300, perSec: 300, len: 0.18 },
  tailgrab: { kind: "grab", name: ["Tailgrab", "Tailgrab"], pts: 300, perSec: 300, len: 0.18 },
  japan: { kind: "grab", name: ["Japan", "Japan"], pts: 350, perSec: 350, len: 0.2 },
  madonna: { kind: "grab", name: ["Madonna", "Madonna"], pts: 750, perSec: 400, len: 0.26 },
  benihana: { kind: "grab", name: ["Benihana", "Benihana"], pts: 450, perSec: 350, len: 0.22 },
  airwalk: { kind: "grab", name: ["Airwalk", "Airwalk"], pts: 450, perSec: 350, len: 0.22 },
  method: { kind: "grab", name: ["Method", "Method"], pts: 400, perSec: 350, len: 0.2 },
  stiffy: { kind: "grab", name: ["Stiffy", "Stiffy"], pts: 400, perSec: 350, len: 0.2 },
  stalefish: { kind: "grab", name: ["Stalefish", "Stalefish"], pts: 350, perSec: 350, len: 0.2 },
  // grinds and slides (K + a direction at a rail, a ledge, a coping, caught in the air)
  fiftyfifty: { kind: "grind", name: ["50-50", "50-50"], pts: 100, perSec: 150, len: 0, end: 0 },
  nosegrind: { kind: "grind", name: ["Nosegrind", "Nosegrind"], pts: 150, perSec: 200, len: 0, end: 1 },
  fiveo: { kind: "grind", name: ["5-0", "5-0"], pts: 150, perSec: 200, len: 0, end: -1 },
  crooked: { kind: "grind", name: ["Crooked Grind", "Crooked Grind"], pts: 200, perSec: 250, len: 0, end: 1 },
  overcrook: { kind: "grind", name: ["Overcrook", "Overcrook"], pts: 250, perSec: 250, len: 0, end: 1 },
  smith: { kind: "grind", name: ["Smith Grind", "Smith Grind"], pts: 200, perSec: 250, len: 0, end: -1 },
  feeble: { kind: "grind", name: ["Feeble Grind", "Feeble Grind"], pts: 200, perSec: 250, len: 0, end: -1 },
  boardslide: { kind: "slide", name: ["Boardslide", "Boardslide"], pts: 150, perSec: 200, len: 0, across: true },
  lipslide: { kind: "slide", name: ["Lipslide", "Lipslide"], pts: 200, perSec: 250, len: 0, across: true },
  noseslide: { kind: "slide", name: ["Noseslide", "Noseslide"], pts: 200, perSec: 250, len: 0, end: 1 },
  tailslide: { kind: "slide", name: ["Tailslide", "Tailslide"], pts: 200, perSec: 250, len: 0, end: -1 },
  bluntslide: { kind: "slide", name: ["Bluntslide", "Bluntslide"], pts: 300, perSec: 300, len: 0, end: -1 },
  // lip tricks (K + a direction at a coping, going up slowly)
  rocktofakie: { kind: "lip", name: ["Rock to Fakie", "Rock to Fakie"], pts: 400, perSec: 150, len: 0.5 },
  nosestall: { kind: "lip", name: ["Nose Stall", "Nose Stall"], pts: 400, perSec: 150, len: 0.5 },
  axlestall: { kind: "lip", name: ["Axle Stall", "Axle Stall"], pts: 400, perSec: 150, len: 0.5 },
  handplant: { kind: "lip", name: ["Handplant", "Handplant"], pts: 500, perSec: 200, len: 0.9 },
  // manuals (W then S quickly; S then W)
  manual: { kind: "manual", name: ["Manual", "Manual"], pts: 50, perSec: 150, len: 0 },
  nosemanual: { kind: "manual", name: ["Nose Manual", "Nose Manual"], pts: 75, perSec: 175, len: 0 },
  // the glue: the revert (Shift landing in a ramp), the wallride (K at a wall in the air), the wallplant (Space at a
  // wall in the air), the spine transfer (over a spine, Shift held), the acid drop (Shift in the air over a ramp),
  // the powerslide (S at speed), a plain air (no trick: the spin's)
  revert: { kind: "revert", name: ["Revert", "Revert"], pts: 100, len: 0.25 },
  wallride: { kind: "wall", name: ["Wallride", "Wallride"], pts: 250, perSec: 250, len: 0 },
  wallplant: { kind: "wall", name: ["Wallplant", "Wallplant"], pts: 300, len: 0.2 },
  spine: { kind: "air", name: ["Spine Transfer", "Spine Transfer"], pts: 500, len: 0 },
  acid: { kind: "air", name: ["Acid Drop", "Acid Drop"], pts: 300, len: 0 },
  powerslide: { kind: "revert", name: ["Powerslide", "Powerslide"], pts: 0, len: 0.3 },
  air: { kind: "air", name: ["Air", "Air"], pts: 0, len: 0 },
  // the specials (the special meter lit: two directions, then the key) — real skateboarding's names
  mctwist: { kind: "grab", name: ["McTwist", "McTwist"], pts: 5000, perSec: 0, len: 1.0, special: true },
  christair: { kind: "grab", name: ["Christ Air", "Christ Air"], pts: 2500, perSec: 400, len: 0.35, special: true },
  judo: { kind: "grab", name: ["Judo", "Judo"], pts: 2000, perSec: 400, len: 0.3, special: true },
  ghettobird: {
    kind: "flip",
    name: ["Ghetto Bird", "Ghetto Bird"],
    pts: 3000,
    len: 0.75,
    roll: -1,
    yaw: 0.5,
    special: true,
  },
  fingerflip: {
    kind: "flip",
    name: ["Fingerflip Airwalk", "Fingerflip Airwalk"],
    pts: 2500,
    len: 0.7,
    roll: 1,
    special: true,
  },
  darkslide: {
    kind: "slide",
    name: ["Darkslide", "Darkslide"],
    pts: 2500,
    perSec: 400,
    len: 0,
    across: true,
    special: true,
  },
  casper: {
    kind: "slide",
    name: ["Casper Slide", "Casper Slide"],
    pts: 2000,
    perSec: 400,
    len: 0,
    end: 1,
    special: true,
  },
  hangten: {
    kind: "manual",
    name: ["Hang Ten Nose Manual", "Hang Ten Nose Manual"],
    pts: 1500,
    perSec: 400,
    len: 0,
    special: true,
  },
} as const satisfies Record<string, TrickDef>;
export type TrickId = keyof typeof TRICKS;
export const TRICK_IDS = Object.keys(TRICKS) as TrickId[];
export const trickDef = (id: TrickId): TrickDef => TRICKS[id];

/** Which trick a key and a direction start (Tony Hawk's Pro Skater 1+2's maps; a grind's by how the board meets the
 *  rail: across it, a slide). No direction: the map's middle trick. */
export const FLIP_BY: Record<Dir, TrickId> = {
  n: "kickflip",
  l: "kickflip",
  r: "heelflip",
  u: "impossible",
  d: "shoveit",
  ul: "hardflip",
  ur: "inwardheel",
  dl: "varial",
  dr: "varialheel",
};
export const GRAB_BY: Record<Dir, TrickId> = {
  n: "indy",
  l: "melon",
  r: "indy",
  u: "nosegrab",
  d: "tailgrab",
  ul: "japan",
  ur: "madonna",
  dl: "benihana",
  dr: "airwalk",
};
export const GRIND_BY: Record<Dir, TrickId> = {
  n: "fiftyfifty",
  l: "noseslide",
  r: "tailslide",
  u: "nosegrind",
  d: "fiveo",
  ul: "overcrook",
  ur: "crooked",
  dl: "feeble",
  dr: "smith",
};
export const SLIDE_BY: Record<Dir, TrickId> = {
  n: "boardslide",
  u: "lipslide",
  d: "boardslide",
  l: "boardslide",
  r: "lipslide",
  ul: "lipslide",
  ur: "lipslide",
  dl: "boardslide",
  dr: "bluntslide",
};
export const LIP_BY: Record<Dir, TrickId> = {
  n: "rocktofakie",
  u: "nosestall",
  d: "axlestall",
  l: "handplant",
  r: "handplant",
  ul: "nosestall",
  ur: "nosestall",
  dl: "axlestall",
  dr: "axlestall",
};
/** The key again quickly: the trick it becomes (Kickflip → Double Kickflip is the same id, `double`; these change). */
export const UPGRADE: Partial<Record<TrickId, TrickId>> = {
  melon: "method",
  indy: "stiffy",
  varial: "treflip",
  shoveit: "shove360",
};
/** The specials (lit): two directions in turn, then the key — which. */
export const SPECIALS: { dirs: [Dir, Dir]; key: "flip" | "grab" | "grind"; id: TrickId }[] = [
  { dirs: ["r", "d"], key: "grab", id: "mctwist" },
  { dirs: ["l", "d"], key: "grab", id: "christair" },
  { dirs: ["u", "d"], key: "grab", id: "judo" },
  { dirs: ["d", "u"], key: "flip", id: "ghettobird" },
  { dirs: ["l", "r"], key: "flip", id: "fingerflip" },
  { dirs: ["r", "l"], key: "grind", id: "darkslide" },
  { dirs: ["l", "r"], key: "grind", id: "casper" },
  { dirs: ["u", "d"], key: "grind", id: "hangten" },
];

// ── the combo ────────────────────────────────────────────────────────────────────────────────────────────

/** A trick done in a combo, as counted: its name (spins, switch, double in it), its points. */
export interface Done {
  id: TrickId;
  name: string;
  pts: number;
}

const LANG = 0;
/** The spin's factor by half turns (score.cpp). */
export const SPIN_K = [1, 1.5, 2, 2.5, 3, 3.5];
/** The repeat's share: the first time whole, then 75 %, 50 %, 25 %, never under 10 %. */
export const repeatK = (n: number) => Math.max(0.1, 1 - 0.25 * n);

/** The tricks linked since the board last rolled clean on its four wheels: their points × how many. */
export class Combo {
  done: Done[] = [];
  private times = new Map<TrickId, number>();
  /** the one going on (a grind's, a manual's, a grab's points still growing): its share counted so far */
  live: Done | null = null;

  /** A trick counted (Neversoft's score.cpp): its base (+ a second held's), × the repeat's share, × the spin's factor
   *  (180 ×1.5, 360 ×2, 540 ×2.5, 720 ×3, 900+ ×3.5), × 1.2 switch. A gap's its own points, never less. */
  add(id: TrickId, o: { spin?: number; switch?: boolean; double?: boolean; held?: number } = {}): Done {
    const d = TRICKS[id] as TrickDef;
    const n = this.times.get(id) ?? 0;
    this.times.set(id, n + 1);
    let pts = (o.double ? 500 : d.pts) + (d.perSec ?? 0) * (o.held ?? 0);
    // (a hair short of the half turn still counts it: the engine's spin_count_slop)
    const halves = Math.floor((Math.abs(o.spin ?? 0) + 0.35) / Math.PI);
    pts *= SPIN_K[Math.min(halves, SPIN_K.length - 1)];
    if (o.switch) pts *= 1.2;
    pts = Math.round(pts * repeatK(n));
    let name = d.name[LANG];
    if (o.double) name = `Double ${name}`;
    if (halves) name = `${halves * 180} ${name}`;
    if (o.switch) name = `Fakie ${name}`;
    const done = { id, name, pts };
    this.done.push(done);
    return done;
  }
  /** A gap (docs/plan/104 F9a): its name and points, as they are. */
  gap(name: string, pts: number) {
    this.done.push({ id: "air", name, pts });
  }

  /** The going trick's points grown (a grind's seconds). */
  grow(id: TrickId, held: number, o: { switch?: boolean } = {}) {
    const d = TRICKS[id] as TrickDef;
    const n = this.times.get(id) ?? 0;
    let pts = d.pts + (d.perSec ?? 0) * held;
    if (o.switch) pts *= 1.2;
    this.live = { id, name: (o.switch ? "Fakie " : "") + d.name[LANG], pts: Math.round(pts * repeatK(n)) };
  }
  /** The going trick finished: counted. */
  settle(o: { switch?: boolean } = {}) {
    const l = this.live;
    if (!l) return;
    this.live = null;
    const n = this.times.get(l.id) ?? 0;
    this.times.set(l.id, n + 1);
    this.done.push(l);
    void o;
  }

  get count(): number {
    return this.done.length + (this.live ? 1 : 0);
  }
  get base(): number {
    return this.done.reduce((a, d) => a + d.pts, 0) + (this.live?.pts ?? 0);
  }
  /** What it's worth now */
  get score(): number {
    return this.base * this.count;
  }
  /** Its name as the HUD writes it: "Kickflip + 50-50 + Manual". */
  get name(): string {
    return [...this.done, ...(this.live ? [this.live] : [])].map((d) => d.name).join(" + ");
  }
  clear() {
    this.done = [];
    this.live = null;
    this.times.clear();
  }
}
