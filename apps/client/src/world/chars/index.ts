// The 3D people chunk (docs/plan/22-people-3d.md): loaded on demand, like the
// pets. Marks the chunk for `pnpm budget`.
export const CHARS_CHUNK = "yutopia-chars";

export { bake } from "./bake";
export { buildPerson } from "./build";
export { INK, inkMaterial, inkResolution } from "./ink";
export {
  ISO,
  type IsoIn,
  type IsoMem,
  type IsoSprite,
  type IsoState,
  isoPeople,
  isoPose,
  isoState,
  type PictureMotion,
  verbAt,
} from "./iso";
export type { Anchor } from "./kit";
export {
  actsNow,
  airNow,
  heroNow,
  jumpNowOf,
  type LocoIn,
  Locomotion,
  loadHero,
  localVel,
  nightNow,
  verbIn,
  verbT,
} from "./locomotion";
export { bodyMaterial, CharFactory, legShade, lookKey, PersonModel, type Reach } from "./model";
export { blend, CONTACT, carPose, jumpPose, Motion3, type MotionIn, type MotionOut, STRIDE, walkPose } from "./motion";
export {
  ANKLE,
  aimPose,
  BACK_STRIDE,
  backpedalPose,
  crawlPose,
  crouchPose,
  crouchWalkPose,
  deathPose,
  FALL_LEN,
  type FlowPoseIn,
  type FlowPoseKind,
  fellPose,
  flowPose,
  HIP_H,
  kneelPose,
  landPose,
  lurkPose,
  type Moved,
  runPose,
  runStride,
  type ShadeKind,
  SNEAK_STRIDE,
  STRAFE_STRIDE,
  shadePose,
  spinPose,
  strafePose,
  VERB_LEN,
  type Verb,
  verbPose,
  verbRoot,
} from "./moves";
export { BASE, LODS, type Lod, type Params, paramsFor } from "./params";
export { buildProp, inHand, keepUpright, type PropKind, pointAlong } from "./props";
export { HANDS, type HandShape, handPose, JOINTS, type JointName, type Pose, REST } from "./rig";
