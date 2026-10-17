// The skeleton every person shares: 16 joints, each a bone of the skinned
// mesh. At rest no joint is turned — a pose is Euler angles per joint (x, y,
// z, radians); L is the person's own left (+x; they face +z).

export const JOINTS = [
  "hips",
  "spine",
  "neck",
  "head",
  "shoulderL",
  "elbowL",
  "wristL",
  "shoulderR",
  "elbowR",
  "wristR",
  "thighL",
  "kneeL",
  "ankleL",
  "thighR",
  "kneeR",
  "ankleR",
] as const;
export type JointName = (typeof JOINTS)[number];

export const PARENT: Record<JointName, JointName | null> = {
  hips: null,
  spine: "hips",
  neck: "spine",
  head: "neck",
  shoulderL: "spine",
  elbowL: "shoulderL",
  wristL: "elbowL",
  shoulderR: "spine",
  elbowR: "shoulderR",
  wristR: "elbowR",
  thighL: "hips",
  kneeL: "thighL",
  ankleL: "kneeL",
  thighR: "hips",
  kneeR: "thighR",
  ankleR: "kneeR",
};

export type Euler3 = [number, number, number];
export type Pose = Partial<Record<JointName, Euler3>>;

/** Standing at ease: arms a little out, elbows soft. */
export const REST: Pose = {
  shoulderL: [0.04, 0, 0.13],
  shoulderR: [0.04, 0, -0.13],
  elbowL: [-0.16, 0, 0],
  elbowR: [-0.16, 0, 0],
  wristL: [0, 0, -0.05],
  wristR: [0, 0, 0.05],
};

/** Where each joint sits relative to its parent at rest. */
export type RestPose = Record<JointName, [number, number, number]>;
