import { type Bone, Vector3 } from "three";

// (plan 62, docs/plan/62-the-touch.md) A hand laid level on what it's on — the keys —, however the
// forearm comes in: after the arm's IK, the wrist's own bend. The 3D view's, not the people's chunk.

const at = new Vector3();
const to = new Vector3();

/** The hand turned at the wrist till it points `pitch` rad from level (− down: the fingers onto
 *  keys) — two steps of the wrist's own bend, `w` of the way. */
export function levelHand(wrist: Bone | null, tip: Bone | null, pitch: number, w: number) {
  if (!wrist || !tip) return;
  const pitchNow = () => {
    wrist.updateMatrixWorld(true);
    wrist.getWorldPosition(at);
    tip.getWorldPosition(to).sub(at);
    return Math.atan2(to.y, Math.hypot(to.x, to.z));
  };
  const x0 = wrist.rotation.x;
  const p0 = pitchNow();
  wrist.rotation.x = x0 + 0.1;
  const p1 = pitchNow();
  const slope = (p1 - p0) / 0.1;
  if (Math.abs(slope) < 0.2) {
    wrist.rotation.x = x0;
    return;
  }
  const want = x0 + 0.1 + (pitch - p1) / slope;
  wrist.rotation.x = x0 + Math.max(-1.2, Math.min(1.2, want - x0)) * Math.min(1, w);
}

/** Every hand given a `level`, laid level (after `handsTo`). */
export function levelHands(
  bone: (j: "wristL" | "wristR" | "fingersL" | "fingersR") => Bone | null,
  hands: { [S in "L" | "R"]?: { w: number; level?: number } } | null,
) {
  if (!hands) return;
  for (const S of ["L", "R"] as const) {
    const h = hands[S];
    if (h && h.w > 0 && h.level !== undefined) levelHand(bone(`wrist${S}`), bone(`fingers${S}`), h.level, h.w);
  }
}
