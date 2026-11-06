// Where a sound is, left or right of the one hearing it (plan 72 phase 12: by the camera's facing —
// the iso screen's x, which the old pan went by, retired): the 3D view tells its yaw each frame;
// before it has, as if facing north.
let yaw = -Math.PI / 2;

/** The view's camera, turned `y` (radians, as the 3D view keeps it). */
export function setEarYaw(y: number): void {
  if (Number.isFinite(y)) yaw = y;
}

/** −1 (all left) … 1 (all right): `src` from `ear` (world x, y), as the camera faces. */
export function panOf(ear: { x: number; y: number }, src: { x: number; y: number }, reach = 6): number {
  const rx = -Math.sin(yaw);
  const ry = Math.cos(yaw);
  return Math.max(-1, Math.min(1, ((src.x - ear.x) * rx + (src.y - ear.y) * ry) / reach));
}
