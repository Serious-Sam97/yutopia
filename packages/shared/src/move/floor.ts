import { BODY_R, STEP } from "../ground.ts";
import type { Collider } from "./step.ts";

/** An open floor for the move core where nothing else is wanted (a test, the anim bench): its
 *  ground `top(tx, ty)` a tile at a time (0 everywhere: flat), `blocks` — a tile up is in the way
 *  at the floor's height, stood on from above. No walls, no things, no land; the world's own floors
 *  are Jolt's (physics/place.ts). */
export function openFloor(top: (tx: number, ty: number) => number = () => 0, blocks = false): Collider {
  const corners = (x: number, y: number, r: number) =>
    [
      [x - r, y - r],
      [x + r, y - r],
      [x - r, y + r],
      [x + r, y + r],
    ] as const;
  const stand = (px: number, py: number, up: number) => {
    const t = top(Math.floor(px), Math.floor(py));
    return t <= up + 1e-4 ? t : Number.NEGATIVE_INFINITY;
  };
  const fitsAt = (x: number, y: number, z: number, r = BODY_R) =>
    z <= 0 && z > -STEP
      ? corners(x, y, r).every(([cx, cy]) => !blocks || top(Math.floor(cx), Math.floor(cy)) <= 0)
      : corners(x, y, r).every(([cx, cy]) => stand(cx, cy, z + STEP) !== Number.NEGATIVE_INFINITY);
  return {
    fitsAt,
    groundAt: (x, y, z, r = BODY_R) => Math.max(0, ...corners(x, y, r).map(([cx, cy]) => stand(cx, cy, z + STEP))),
    clear: (a, b, r = BODY_R, z = 0) => {
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1));
      for (let i = 1; i <= n; i++)
        if (!fitsAt(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, z, r)) return false;
      return true;
    },
    onRamp: () => false,
    onLand: () => false,
    speedAt: () => 1,
  };
}
