// The skeleton every person shares: 29 joints, each a bone of the skinned
// mesh (plan 58's phase 2: the chest between the spine and the neck, so the
// trunk bends in two places; a toe at each foot's ball; each hand's fingers as
// one hinge, the index on its own, and the thumb; four springs — long hair or a
// ponytail, a skirt, a scarf's ends, a backpack — weighted only on whoever
// wears them, swung by `model.ts`'s springs, never by a pose). At rest no joint is turned — a pose is Euler angles per joint (x, y,
// z, radians); L is the person's own left (+x; they face +z).

export const JOINTS = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "shoulderL",
  "elbowL",
  "wristL",
  "fingersL",
  "indexL",
  "thumbL",
  "shoulderR",
  "elbowR",
  "wristR",
  "fingersR",
  "indexR",
  "thumbR",
  "thighL",
  "kneeL",
  "ankleL",
  "toeL",
  "thighR",
  "kneeR",
  "ankleR",
  "toeR",
  "hair",
  "skirt",
  "scarf",
  "pack",
] as const;
export type JointName = (typeof JOINTS)[number];

export const PARENT: Record<JointName, JointName | null> = {
  hips: null,
  spine: "hips",
  chest: "spine",
  neck: "chest",
  head: "neck",
  shoulderL: "chest",
  elbowL: "shoulderL",
  wristL: "elbowL",
  fingersL: "wristL",
  indexL: "wristL",
  thumbL: "wristL",
  shoulderR: "chest",
  elbowR: "shoulderR",
  wristR: "elbowR",
  fingersR: "wristR",
  indexR: "wristR",
  thumbR: "wristR",
  thighL: "hips",
  kneeL: "thighL",
  ankleL: "kneeL",
  toeL: "ankleL",
  thighR: "hips",
  kneeR: "thighR",
  ankleR: "kneeR",
  toeR: "ankleR",
  hair: "head",
  skirt: "hips",
  scarf: "chest",
  pack: "chest",
};

/** The springs (plan 58 phase 2d): joints a pose never turns — `model.ts` swings them. */
export const SPRINGS = ["hair", "skirt", "scarf", "pack"] as const;
export type SpringName = (typeof SPRINGS)[number];

export type Euler3 = [number, number, number];
export type Pose = Partial<Record<JointName, Euler3>>;

/** A hand's shape: the fingers' curl at the knuckles, the index's own, the thumb folded in (rad;
 *  0 the flat mitten). */
export interface HandShape {
  fingers: number;
  index: number;
  thumb: number;
}
export const HANDS = {
  open: { fingers: 0.05, index: 0.05, thumb: 0 },
  relaxed: { fingers: 0.45, index: 0.35, thumb: 0.25 },
  loose: { fingers: 0.85, index: 0.75, thumb: 0.45 },
  grip: { fingers: 1.15, index: 1.05, thumb: 0.65 },
  fist: { fingers: 1.5, index: 1.5, thumb: 0.95 },
  point: { fingers: 1.5, index: 0.05, thumb: 0.9 },
  thumbsUp: { fingers: 1.5, index: 1.5, thumb: -0.35 },
} satisfies Record<string, HandShape>;
/** A hand's joints for a shape (side 1 the left): the fingers curl towards the palm (the left
 *  palm faces −x, the right +x), the thumb folds across it and a little down. */
export function handPose(side: 1 | -1, h: HandShape): Pose {
  const S = side > 0 ? "L" : "R";
  return {
    [`fingers${S}`]: [0, 0, -side * h.fingers],
    [`index${S}`]: [0, 0, -side * h.index],
    [`thumb${S}`]: [0.3 * h.thumb, -side * h.thumb, 0],
  };
}

/** Standing at ease: arms a little out, elbows soft, hands relaxed. */
export const REST: Pose = {
  ...handPose(1, HANDS.relaxed),
  ...handPose(-1, HANDS.relaxed),
  shoulderL: [0.04, 0, 0.13],
  shoulderR: [0.04, 0, -0.13],
  elbowL: [-0.16, 0, 0],
  elbowR: [-0.16, 0, 0],
  wristL: [0, 0, -0.05],
  wristR: [0, 0, 0.05],
};

/** Where each joint sits relative to its parent at rest. */
export type RestPose = Record<JointName, [number, number, number]>;
