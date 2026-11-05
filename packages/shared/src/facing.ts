// Which way people, the folk and pets face (docs/plan/72-the-3d-core.md, phase 5: what the 8 iso
// screen ways `d` were). On the wire a byte, 256 a turn, as a player's `yaw` (shared move
// yawToByte); in the client radians. Kept to 8 ways where the server or a seat sets it.

// The facing people, the folk and pets are given by the server (docs/plan/72-the-3d-core.md,
// phase 5: what the 8 iso screen ways `d` were): a byte as the wire's, on 8 ways a quarter of a
// quarter turn apart (32 a step) — the world angles the 3D view drew them at.
const STEPS: [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
/** Facing along a world delta, in 8 ways (a byte); `was` when there's none. */
export function faceByte(dx: number, dy: number, was = 0): number {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return was;
  return (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * 32) & 255;
}
/** Facing along a world delta, in 8 ways, as radians (−π < yaw ≤ π); `was` when there's none.
 *  (The local facing the 8 iso screen ways `d` were; the same angles the 3D view drew.) Computed
 *  as k/4 · π, as byteFace does: the same way faced compares equal. */
export function face8(dx: number, dy: number, was = 0): number {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return was;
  const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return k <= -4 ? Math.PI : (k / 4) * Math.PI;
}
/** A facing byte as radians on face8's footing (−π < yaw ≤ π). */
export function byteFace(b: number): number {
  const s = (((((b & 255) + 128) % 256) + 256) % 256) - 128;
  return s === -128 ? Math.PI : (s / 128) * Math.PI;
}
/** A seat's facing by its quarter turn: away from its back (rot 0 faces +y), as a byte. */
export const SEAT_FACE = [64, 128, 192, 0] as const;
/** A facing byte's step on the 8 ways: a whole tile across, down or both ([1, 1] the diagonal). */
export const faceStep = (b: number): [number, number] => STEPS[Math.round((b & 255) / 32) & 7];
