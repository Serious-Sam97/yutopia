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
  head: {
    width: number;
    depth: number;
    jaw: number;
    square: number;
    neckBack: number; // × hh, the head forward of where the neck meets it (the neck joins it behind the jaw)
    neckFwd: number; // 0 … 1 the neck's root in the middle of the trunk's top (a collar's middle), not set back; the head goes with it
    lean: number;
    jawLine: number;
    form: number;
  }; // × hh; form 0 … 1 the head shaped round it, not one outline turned: cheekbones, the brow, the back of the skull; jaw 0 round … 1 pointed; square 0 … 1 a wide, flat jaw; lean 0 … 1 the cheeks and jaw drawn in; jawLine 0 … 1 the head's underside a jaw, from the chin up and back to the nape (not a bowl as low behind as the chin)
  neck: { len: number; r: number; apple: number }; // × hh; apple 0 … 1 an Adam's apple (drawn with `anatomy`)
  torso: {
    shoulder: number;
    chest: number;
    waist: number;
    hip: number;
    depth: number;
    squareness: number;
    belly: number;
    bust: number; // 0 none … a chest that stands out in front
    seat: number; // 0 … 1 the bottom of the trunk drawn in front to back, into the thighs
    bustH: number; // how tall the bust's rounds are, × the trunk
    trap: number; // 0 … 1 the shoulders sloping down from the neck (the trapezius), not a flat top
    pelvis: number; // how far below the hip joints the trunk comes down (the crotch), × the thigh's radius
    bowl: number; // 1 … the trunk's bottom a deep bowl between the thighs; less, flatter
  }; // radii × hh
  arm: { len: number; upper: number; fore: number; wrist: number; socket: number }; // len × height, radii × hh; socket 0 … 1 the arm set up into the shoulder, under its cap, not hung below it
  leg: { len: number; thigh: number; knee: number; ankle: number; gap: number; calf: number }; // len × height
  hand: { size: number; thick: number; fingers: number }; // × hh; fingers 0 a mitten … 1 four fingers, thinner to the tips
  foot: { len: number; width: number; height: number; sole: number; shape: number }; // × hh; shape 0 a slab … 1 a shoe's own shape (a round toe, the top drawn in, a higher toe box)
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
    earBack: number; // 0 … 1 the ears set back and a touch lower, as on a real head
    lashes: boolean; // a little flick at each eye's outer corner
    smile: number; // the mouth's curve: 1 the usual smile, 0 a straight line
    lid: number; // 0 none … 1 an upper lid line over a shorter eye
    bridge: number; // 0 a button nose … 1 a narrower one with a bridge
    iris: number; // 0 a dot for an eye … 1 an eye: the white, an iris, a pupil and a glint
  };
  hair: {
    thick: number; // × hh
    lockW: number; // × hh
    count: number;
    tuft: number; // 0..1 the quiff
    flat: number; // × how thin a lock is for its width
    nape: number; // 0..1 a bob's or long hair's cap down over the nape
    blunt: number; // 0..1 a bob's locks cut square, not to a point
    fringe: number; // × the fringe's locks' width
    side: number; // how far round from the front (rad) the locks round the sides start
  };
  folds: number; // 0 … 1 a top's creases inked in: from under the arms, at the waist
  anatomy: number; // 0 the limbs as capsules … 1 shaped: the shoulder, bicep, forearm, knee, calf
  wear: number; // 0 the wardrobe as it is … 1 plan 60's mocks (the quality pass): only /dev/chars asks for it
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

// (2026-10-30, plan 58: the legs 15% longer — at 36% of 1.7 m they read short, worst from a little
// above and running; the head, the trunk and the arms as they were, so she stands 9 cm taller)
const LEGS = 0.612 * 1.15;
const TALL = 1.7 + LEGS - 0.612;
// (2026-10-31, plan 59: the legs 14% longer for the same height, the trunk shorter by as much, the
// crotch from 39% of the height to 46% — moves.ts THIGH and SHIN agree, chars.test.ts checks)
export const LEG_X = 1.14;
// Ligne claire, as the user tuned it on 2026-10-17 (belly, longer trunk,
// shorter arms, the shirt down to the hips) — then the character pass (2026-10-31, plan 59): lean
// (the belly to a fifth, the cheeks and jaw drawn in) and grown up, the head 10% shorter (`M`)
// with everything else measured in heads made 1/M as many, so the body's the same; a longer neck
// into a trapezius, bigger hands with fingers, the shoes shaped; a jaw and a head shaped round it,
// real eyes with lids, a nose with a bridge, a calm mouth; the hair closer and in bigger shapes; folds,
// seams and the limbs' anatomy close up.
const M = 0.9;
export const BASE: Params = {
  height: TALL,
  heads: TALL / 0.34 / M,
  head: {
    width: 0.9 * 0.96,
    depth: 0.95,
    jaw: 0.3,
    square: 0,
    neckBack: 0.08,
    neckFwd: 1,
    lean: 1,
    jawLine: 1,
    form: 1,
  },
  // (the neck shorter than it was: 2026-10-31, the user found it too long on the smaller head)
  neck: { len: 0.1 / M, r: 0.13 / M, apple: 0 },
  torso: {
    shoulder: (0.53 * 1.05) / M,
    chest: (0.5 * 1.04) / M,
    waist: (0.47 * 0.9) / M,
    hip: (0.5 * 0.93) / M,
    depth: 0.74 * 0.93,
    squareness: 0.65,
    belly: 0.42 * 0.2,
    bust: 0,
    seat: 1,
    bustH: 0.12,
    trap: 1,
    pelvis: 0.35,
    bowl: 0.4,
  },
  arm: { len: (0.33 * 1.7) / TALL, upper: 0.12 / M, fore: 0.105 / M, wrist: 0.08 / M, socket: 0.5 },
  leg: { len: (LEGS * LEG_X) / TALL, thigh: 0.19 / M, knee: 0.13 / M, ankle: 0.09 / M, gap: 0.23 / M, calf: 0.02 / M },
  hand: { size: (0.34 * 1.12) / M, thick: 0.11 / M, fingers: 1 },
  // (smaller feet: 10% in heads, which are 1/M as many)
  foot: { len: 0.8, width: 0.3, height: 0.3, sole: 0.07, shape: 1 },
  face: {
    eyeY: 0.47,
    eyeGap: 0.15,
    eyeSize: 0.075 * 1.35,
    mouthY: 0.21,
    mouthW: 0.11,
    nose: 0.07,
    brows: 0.35,
    browArch: 1,
    ears: 0.13 * 1.2,
    earBack: 1,
    lashes: false,
    smile: 0.45,
    lid: 0.7,
    bridge: 1,
    iris: 1,
  },
  hair: {
    thick: 0.055 * 0.7,
    lockW: 0.2 * 1.4,
    count: 0.6 * 0.75,
    tuft: 0,
    flat: 0.7,
    nape: 1,
    blunt: 1,
    fringe: 0.7,
    side: 1.2,
  },
  folds: 1,
  anatomy: 1,
  wear: 0,
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
  set?: { square?: number; bust?: number; browArch?: number; lashes?: boolean; apple?: number };
}

// The figure (`body`) and the face and frame (`gender`) as changes to BASE —
// size and clothes stay free, as in the 2D drawing. Gender is meant to read at
// a glance, from across a room: the frame (shoulders against hips), the neck,
// arms and hands, the jaw, the brows and eyes.
export const BODY: Record<string, Shape> = {
  regular: {},
  slim: { torso: { shoulder: 0.93, chest: 0.9, waist: 0.86, hip: 0.92, belly: 0.55 }, limbs: 0.9 },
  // (with the belly cut to a fifth in BASE, broad keeps half of its own, its waist and its depth, and
  // a stronger neck: or the three bodies come out nearly alike)
  broad: {
    torso: {
      shoulder: 1.1,
      chest: 1.12,
      waist: (1.16 * 0.98) / 0.9,
      hip: 1.08,
      depth: (1.05 * 0.98) / 0.93,
      belly: 1.35 * 2.5,
    },
    neck: { r: 1.12 },
    limbs: 1.12,
  },
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
    set: { bust: 0.4 * 0.85, browArch: 1.7, lashes: true },
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
    set: { square: 0.6, browArch: 0.25, lashes: false, apple: 1 },
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
  if (s.set?.apple !== undefined) p.neck.apple = s.set.apple;
}

export function paramsFor(a: Pick<AvatarLayers, "body" | "gender">, base: Params = BASE): Params {
  const p = structuredClone(base);
  apply(p, BODY[a.body] ?? BODY.regular);
  apply(p, GENDER[a.gender] ?? GENDER.neutral);
  // (plan 60's mocks: a `wear` key on the avatar, from /dev/chars only)
  p.wear = (a as { wear?: number }).wear ?? 0;
  return p;
}
