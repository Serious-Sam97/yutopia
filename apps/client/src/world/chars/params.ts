import type { AvatarLayers } from "@yutopia/shared";

// ═════════════════════════════════════════════════════════════════════════════
// PARAMETERS — every dimension, thickness and curve of a Yutopia person
// (docs/plan/22-people-3d.md). Lengths are fractions of the figure's height
// (`height`) or of its head (`hh` = height / heads). `paramsFor()` starts from
// `BASE`, applies the body and the gender, and picks a level of detail; change
// any of these at runtime (`PersonModel.rebuild`) and the model is rebuilt.
// ═════════════════════════════════════════════════════════════════════════════

export interface Params {
  height: number; // floor to crown, world units (tiles ≈ metres)
  heads: number; // how many heads tall
  head: { width: number; depth: number; jaw: number; square: number; neckBack: number }; // × hh; jaw 0 round … 1 pointed; square 0 … 1 a wide, flat jaw
  neck: { len: number; r: number }; // × hh
  torso: {
    shoulder: number;
    chest: number;
    waist: number;
    hip: number;
    depth: number;
    squareness: number;
    belly: number;
    bust: number; // 0 none … a chest that stands out in front
  }; // radii × hh
  arm: { len: number; upper: number; fore: number; wrist: number }; // len × height, radii × hh
  leg: { len: number; thigh: number; knee: number; ankle: number; gap: number; calf: number }; // len × height
  hand: { size: number; thick: number }; // × hh
  foot: { len: number; width: number; height: number; sole: number }; // × hh
  face: {
    eyeY: number; // height on the head, 0 chin … 1 crown
    eyeGap: number; // half the distance between the eyes × hh
    eyeSize: number; // × hh
    mouthY: number;
    mouthW: number;
    nose: number; // button nose × hh
    brows: number; // thickness × eyeSize
    browArch: number; // 1 the usual gentle arch; 0 straight, 2 high
    ears: number; // × hh
    lashes: boolean; // a little flick at each eye's outer corner
  };
  hair: { thick: number; lockW: number; count: number; tuft: number }; // × hh; tuft 0..1: the quiff
  bevel: number; // softness of extruded parts × hh
  ink: string; // the line and the eyes
}

/** How finely curves are cut: one set per level of detail. */
export interface Seg {
  radial: number; // round a lathe
  profile: number; // along a lathe's profile
  curve: number; // per curve of an extruded outline
  bevel: number; // bevel steps
  tube: number; // along a swept tube
  tubeRadial: number; // round a swept tube
  ring: number; // per quarter circle (rounded ends, rings)
  capRows: number; // the hair cap, crown to edge
}

export type Lod = 0 | 1 | 2;
// L0 close up (the editor, under ~4 tiles), L1 the room, L2 far away
export const LODS: Record<Lod, Seg> = {
  0: { radial: 28, profile: 36, curve: 12, bevel: 3, tube: 24, tubeRadial: 8, ring: 7, capRows: 20 },
  1: { radial: 16, profile: 20, curve: 6, bevel: 2, tube: 12, tubeRadial: 6, ring: 4, capRows: 10 },
  2: { radial: 9, profile: 11, curve: 3, bevel: 1, tube: 6, tubeRadial: 4, ring: 2, capRows: 5 },
};

// Ligne claire, as the user tuned it on 2026-10-17 (belly, longer trunk,
// shorter arms, the shirt down to the hips).
export const BASE: Params = {
  height: 1.7,
  heads: 5,
  head: { width: 0.9, depth: 0.95, jaw: 0.3, square: 0, neckBack: 0.08 },
  neck: { len: 0.2, r: 0.13 },
  torso: { shoulder: 0.53, chest: 0.5, waist: 0.47, hip: 0.5, depth: 0.74, squareness: 0.65, belly: 0.42, bust: 0 },
  arm: { len: 0.33, upper: 0.12, fore: 0.105, wrist: 0.08 },
  leg: { len: 0.36, thigh: 0.19, knee: 0.13, ankle: 0.09, gap: 0.23, calf: 0.02 },
  hand: { size: 0.34, thick: 0.11 },
  foot: { len: 0.8, width: 0.3, height: 0.3, sole: 0.07 },
  face: {
    eyeY: 0.47,
    eyeGap: 0.15,
    eyeSize: 0.075,
    mouthY: 0.21,
    mouthW: 0.11,
    nose: 0.07,
    brows: 0.35,
    browArch: 1,
    ears: 0.13,
    lashes: false,
  },
  hair: { thick: 0.055, lockW: 0.2, count: 0.6, tuft: 0.9 },
  bevel: 0.012,
  ink: "#151515",
};

type Scale = Partial<Record<string, number>>;
interface Shape {
  torso?: Scale;
  limbs?: number; // arm and leg radii
  arms?: number; // arm radii only
  head?: Scale; // × (jaw is kept ≤ 1)
  neck?: Scale;
  face?: Scale; // × eyeSize, mouthW, nose, ears, brows…
  hand?: Scale;
  foot?: Scale;
  set?: { square?: number; bust?: number; browArch?: number; lashes?: boolean };
}

// The figure (`body`) and the face and frame (`gender`) as changes to BASE —
// size and clothes stay free, as in the 2D drawing. Gender is meant to read at
// a glance, from across a room: the frame (shoulders against hips), the neck,
// arms and hands, the jaw, the brows and eyes.
export const BODY: Record<string, Shape> = {
  regular: {},
  slim: { torso: { shoulder: 0.93, chest: 0.9, waist: 0.86, hip: 0.92, belly: 0.55 }, limbs: 0.9 },
  broad: { torso: { shoulder: 1.1, chest: 1.12, waist: 1.16, hip: 1.08, depth: 1.05, belly: 1.35 }, limbs: 1.12 },
};
export const GENDER: Record<string, Shape> = {
  neutral: {},
  // narrow shoulders, a waist, hips and a bust; slim neck, arms and hands; a
  // pointed chin, bigger eyes with lashes, fine arched brows
  feminine: {
    torso: { shoulder: 0.86, chest: 0.94, waist: 0.84, hip: 1.08, belly: 0.55 },
    arms: 0.86,
    head: { jaw: 1.9, width: 0.97 },
    neck: { r: 0.84 },
    face: { eyeSize: 1.14, brows: 0.62, mouthW: 0.9, nose: 0.85 },
    hand: { size: 0.88, thick: 0.9 },
    foot: { len: 0.92, width: 0.92 },
    set: { bust: 0.4, browArch: 1.7, lashes: true },
  },
  // broad shoulders over narrow hips, a straight flank; a thick neck, strong
  // arms, big hands; a wide square jaw, heavy straight brows, smaller eyes
  masculine: {
    torso: { shoulder: 1.2, chest: 1.08, waist: 1.0, hip: 0.88, belly: 0.75, squareness: 1.3 },
    arms: 1.16,
    head: { jaw: 0.25, width: 1.05 },
    neck: { r: 1.28 },
    face: { eyeSize: 0.9, brows: 2.3, mouthW: 1.12, nose: 1.18, ears: 1.1 },
    hand: { size: 1.14, thick: 1.12 },
    foot: { len: 1.08, width: 1.08 },
    set: { square: 0.6, browArch: 0.25, lashes: false },
  },
};

function scale<T extends Record<string, unknown>>(
  into: T,
  by: Scale | undefined,
  cap?: Partial<Record<string, number>>,
) {
  for (const [k, v] of Object.entries(by ?? {})) {
    if (v === undefined || typeof into[k] !== "number") continue;
    const n = (into[k] as number) * v;
    (into as Record<string, unknown>)[k] = cap?.[k] !== undefined ? Math.min(cap[k] as number, n) : n;
  }
}

function apply(p: Params, s: Shape) {
  scale(p.torso, s.torso, { squareness: 1 });
  scale(p.head, s.head, { jaw: 1 });
  scale(p.neck, s.neck);
  scale(p.face, s.face);
  scale(p.hand, s.hand);
  scale(p.foot, s.foot);
  if (s.limbs) {
    for (const k of ["upper", "fore", "wrist"] as const) p.arm[k] *= s.limbs;
    for (const k of ["thigh", "knee", "ankle"] as const) p.leg[k] *= s.limbs;
  }
  if (s.arms) for (const k of ["upper", "fore", "wrist"] as const) p.arm[k] *= s.arms;
  if (s.set?.square !== undefined) p.head.square = s.set.square;
  if (s.set?.bust !== undefined) p.torso.bust = s.set.bust;
  if (s.set?.browArch !== undefined) p.face.browArch = s.set.browArch;
  if (s.set?.lashes !== undefined) p.face.lashes = s.set.lashes;
}

export function paramsFor(a: Pick<AvatarLayers, "body" | "gender">, base: Params = BASE): Params {
  const p = structuredClone(base);
  apply(p, BODY[a.body] ?? BODY.regular);
  apply(p, GENDER[a.gender] ?? GENDER.neutral);
  return p;
}
