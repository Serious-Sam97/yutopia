// The skate's tricks and the combo (docs/plan/103-the-skate.md F4a, F5a): Pro Skater 2–3's core set, each a key
// and a direction, what the board does in it (a flip's turns), how long it takes, its points; and the combo's
// count — each trick's points, spins and switch added, the sum × how many tricks, the same trick again worth less.
// Real skateboarding's names: nothing of any game's own.

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
}

export const TRICKS = {
  // flips (E + a direction; E twice quickly, the double)
  kickflip: { kind: "flip", name: ["Kickflip", "Kickflip"], pts: 100, len: 0.42, roll: 1 },
  heelflip: { kind: "flip", name: ["Heelflip", "Heelflip"], pts: 100, len: 0.42, roll: -1 },
  shoveit: { kind: "flip", name: ["Pop Shove-it", "Pop Shove-it"], pts: 100, len: 0.36, yaw: 0.5 },
  impossible: { kind: "flip", name: ["Impossible", "Impossible"], pts: 250, len: 0.5, pitch: 1 },
  varial: { kind: "flip", name: ["Varial Kickflip", "Varial Kickflip"], pts: 300, len: 0.48, roll: 1, yaw: 0.5 },
  hardflip: { kind: "flip", name: ["Hardflip", "Hardflip"], pts: 400, len: 0.5, roll: 1, yaw: -0.5 },
  treflip: { kind: "flip", name: ["360 Flip", "360 Flip"], pts: 500, len: 0.56, roll: 1, yaw: 1 },
  inwardheel: { kind: "flip", name: ["Inward Heelflip", "Inward Heelflip"], pts: 400, len: 0.5, roll: -1, yaw: -0.5 },
  // grabs (R + a direction, held)
  indy: { kind: "grab", name: ["Indy", "Indy"], pts: 200, perSec: 400, len: 0.18 },
  melon: { kind: "grab", name: ["Melon", "Melon"], pts: 200, perSec: 400, len: 0.18 },
  nosegrab: { kind: "grab", name: ["Nosegrab", "Nosegrab"], pts: 250, perSec: 400, len: 0.2 },
  tailgrab: { kind: "grab", name: ["Tailgrab", "Tailgrab"], pts: 250, perSec: 400, len: 0.2 },
  japan: { kind: "grab", name: ["Japan", "Japan"], pts: 350, perSec: 500, len: 0.24 },
  method: { kind: "grab", name: ["Method", "Method"], pts: 350, perSec: 500, len: 0.24 },
  stalefish: { kind: "grab", name: ["Stalefish", "Stalefish"], pts: 300, perSec: 450, len: 0.22 },
  airwalk: { kind: "grab", name: ["Airwalk", "Airwalk"], pts: 400, perSec: 500, len: 0.26 },
  // grinds and slides (F + a direction at a rail, a ledge, a coping)
  fiftyfifty: { kind: "grind", name: ["50-50", "50-50"], pts: 100, perSec: 200, len: 0, end: 0 },
  nosegrind: { kind: "grind", name: ["Nosegrind", "Nosegrind"], pts: 150, perSec: 250, len: 0, end: 1 },
  fiveo: { kind: "grind", name: ["5-0", "5-0"], pts: 150, perSec: 250, len: 0, end: -1 },
  crooked: { kind: "grind", name: ["Crooked Grind", "Crooked Grind"], pts: 200, perSec: 300, len: 0, end: 1 },
  smith: { kind: "grind", name: ["Smith Grind", "Smith Grind"], pts: 200, perSec: 300, len: 0, end: -1 },
  feeble: { kind: "grind", name: ["Feeble Grind", "Feeble Grind"], pts: 200, perSec: 300, len: 0, end: -1 },
  boardslide: { kind: "slide", name: ["Boardslide", "Boardslide"], pts: 150, perSec: 250, len: 0, across: true },
  lipslide: { kind: "slide", name: ["Lipslide", "Lipslide"], pts: 200, perSec: 300, len: 0, across: true },
  noseslide: { kind: "slide", name: ["Noseslide", "Noseslide"], pts: 200, perSec: 300, len: 0, end: 1 },
  tailslide: { kind: "slide", name: ["Tailslide", "Tailslide"], pts: 200, perSec: 300, len: 0, end: -1 },
  bluntslide: { kind: "slide", name: ["Bluntslide", "Bluntslide"], pts: 300, perSec: 400, len: 0, end: -1 },
  // lip tricks (F + a direction at a coping, going up slowly)
  rocktofakie: { kind: "lip", name: ["Rock to Fakie", "Rock to Fakie"], pts: 250, perSec: 200, len: 0.5 },
  nosestall: { kind: "lip", name: ["Nose Stall", "Nose Stall"], pts: 250, perSec: 250, len: 0.5 },
  axlestall: { kind: "lip", name: ["Axle Stall", "Axle Stall"], pts: 200, perSec: 250, len: 0.5 },
  handplant: { kind: "lip", name: ["Handplant", "Handplant"], pts: 600, perSec: 300, len: 0.9 },
  // manuals (W then S quickly; S then W)
  manual: { kind: "manual", name: ["Manual", "Manual"], pts: 100, perSec: 150, len: 0 },
  nosemanual: { kind: "manual", name: ["Nose Manual", "Nose Manual"], pts: 150, perSec: 200, len: 0 },
  // the revert (Q landing in a ramp), the wallride (F at a wall in the air), a plain air (no trick: the spin's)
  revert: { kind: "revert", name: ["Revert", "Revert"], pts: 100, len: 0.3 },
  wallride: { kind: "wall", name: ["Wallride", "Wallride"], pts: 300, perSec: 300, len: 0 },
  air: { kind: "air", name: ["Air", "Air"], pts: 0, len: 0 },
} as const satisfies Record<string, TrickDef>;
export type TrickId = keyof typeof TRICKS;
export const TRICK_IDS = Object.keys(TRICKS) as TrickId[];
export const trickDef = (id: TrickId): TrickDef => TRICKS[id];

/** Which trick a key and a direction start (a grind's by how the board meets the rail: across it, a slide). */
export const FLIP_BY: Record<Dir, TrickId> = {
  n: "kickflip",
  l: "kickflip",
  r: "heelflip",
  d: "shoveit",
  u: "impossible",
  dl: "varial",
  ur: "hardflip",
  ul: "treflip",
  dr: "inwardheel",
};
export const GRAB_BY: Record<Dir, TrickId> = {
  n: "indy",
  l: "indy",
  r: "melon",
  u: "nosegrab",
  d: "tailgrab",
  ul: "japan",
  ur: "method",
  dl: "stalefish",
  dr: "airwalk",
};
export const GRIND_BY: Record<Dir, TrickId> = {
  n: "fiftyfifty",
  u: "nosegrind",
  d: "fiveo",
  l: "crooked",
  r: "smith",
  ul: "noseslide",
  ur: "tailslide",
  dl: "feeble",
  dr: "bluntslide",
};
export const SLIDE_BY: Record<Dir, TrickId> = {
  n: "boardslide",
  u: "lipslide",
  d: "lipslide",
  l: "boardslide",
  r: "boardslide",
  ul: "lipslide",
  ur: "lipslide",
  dl: "boardslide",
  dr: "boardslide",
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

// ── the combo ────────────────────────────────────────────────────────────────────────────────────────────

/** A trick done in a combo, as counted: its name (spins, switch, double in it), its points. */
export interface Done {
  id: TrickId;
  name: string;
  pts: number;
}

const LANG = 0;
/** The repeat's share: the first time whole, then 75 %, 50 %, 25 %, never under 10 %. */
export const repeatK = (n: number) => Math.max(0.1, 1 - 0.25 * n);

/** The tricks linked since the board last rolled clean on its four wheels: their points × how many. */
export class Combo {
  done: Done[] = [];
  private times = new Map<TrickId, number>();
  /** the one going on (a grind's, a manual's, a grab's points still growing): its share counted so far */
  live: Done | null = null;

  /** A trick counted: its base, × the repeat's share, × 1.2 switch, + 100 a half turn of spin (an air's). */
  add(id: TrickId, o: { spin?: number; switch?: boolean; double?: boolean; held?: number } = {}): Done {
    const d = TRICKS[id] as TrickDef;
    const n = this.times.get(id) ?? 0;
    this.times.set(id, n + 1);
    let pts = d.pts * (o.double ? 1.6 : 1) + (d.perSec ?? 0) * (o.held ?? 0);
    const halves = Math.round(Math.abs(o.spin ?? 0) / Math.PI);
    pts += 100 * halves;
    if (o.switch) pts *= 1.2;
    pts = Math.round(pts * repeatK(n));
    let name = d.name[LANG];
    if (o.double) name = `Double ${name}`;
    if (halves) name = `${halves * 180} ${name}`;
    if (o.switch) name = `Switch ${name}`;
    const done = { id, name, pts };
    this.done.push(done);
    return done;
  }

  /** The going trick's points grown (a grind's seconds). */
  grow(id: TrickId, held: number, o: { switch?: boolean } = {}) {
    const d = TRICKS[id] as TrickDef;
    const n = this.times.get(id) ?? 0;
    let pts = d.pts + (d.perSec ?? 0) * held;
    if (o.switch) pts *= 1.2;
    this.live = { id, name: (o.switch ? "Switch " : "") + d.name[LANG], pts: Math.round(pts * repeatK(n)) };
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
