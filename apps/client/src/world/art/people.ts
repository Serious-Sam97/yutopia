// The people's drawing — the rig, its motion, the wardrobe — as one chunk the
// world loads only where WebGL can't draw the 3D people (world/chars); a pawn
// (pawn.ts) stands in for the first moments.

export { drawRig } from "../rig-draw";
export { Motion, phoneGrip, sipEnv, walkPose } from "./avatar-motion";
export { apply, bones, composeSvg, drawOrder, mul } from "./avatar-rig";
export { avatarRig, avatarSvg, FIT, PEOPLE_CHUNK, partSvg, SIT_DROP } from "./avatar-svg";
export { PHONE_BOX, phoneColors, phoneSvg } from "./phone-art";
