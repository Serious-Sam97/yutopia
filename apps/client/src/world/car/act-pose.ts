import { Vector3 } from "three";
import type { CarStep } from "../chars/anim/acts";
import type { HandShape } from "../chars/rig";
import type { ActPose, Grip } from "./getin";

// Plan 100: the get-in act's pose put on a body — shared by the game (Cars) and the bench (/dev/getin): the act in her
// own space for carStep (the feet, the knees' way, the feet's headings, the trunk's and the head's turns, each hand's
// shape), and each hand onto what it holds — a hand going from one grip to the next travels between them, its elbow
// as that grip wants it.

/** How each grip is held: the elbow's way (reachTo's pole: the chest's space, the right arm's — the left mirrors x;
 *  x out, y up, z ahead) and the hand's shape on it. */
export const GRIPS: Record<Grip, { pole: [number, number, number]; shape: HandShape }> = {
  // (fingers hooked under it, the thumb off)
  handle: { pole: [-0.45, -1, -0.55], shape: { fingers: 1.0, index: 0.95, thumb: 0.35 } },
  pull: { pole: [-0.35, -1, -0.45], shape: { fingers: 1.0, index: 0.95, thumb: 0.35 } },
  // (wrapped round the door's back edge, the elbow down and out)
  edge: { pole: [-0.75, -1, -0.25], shape: { fingers: 1.1, index: 1.0, thumb: 0.75 } },
  top: { pole: [-0.75, -1, -0.25], shape: { fingers: 1.1, index: 1.0, thumb: 0.75 } },
  // (a grab handle: the elbow out under it)
  roof: { pole: [-0.85, -0.6, -0.15], shape: { fingers: 1.15, index: 1.05, thumb: 0.65 } },
  wheel: { pole: [-0.9, -0.8, -0.2], shape: { fingers: 1.15, index: 1.05, thumb: 0.65 } },
  // (pressed on the seat's bolster: the palm flat, the elbow back)
  seat: { pole: [-0.5, -1, -0.7], shape: { fingers: 0.15, index: 0.1, thumb: 0.4 } },
  saddle: { pole: [-0.6, -1, -0.45], shape: { fingers: 0.3, index: 0.25, thumb: 0.5 } },
  // (rested on her thigh: the elbow easy at her side)
  thigh: { pole: [-0.4, -1, -0.5], shape: { fingers: 0.55, index: 0.45, thumb: 0.6 } },
};
const RELAXED: HandShape = { fingers: 0.45, index: 0.35, thumb: 0.7 };

/** The act in her own space (x her left, y up from her root, z ahead; her root under the hips, facing `act.yaw`), `k`
 *  her size, `side` the car's side (+1 its left: the act's lean toward it is her right). */
export function stepOf(act: ActPose, k: number, side: number): CarStep {
  const cy = Math.cos(act.yaw);
  const sy = Math.sin(act.yaw);
  const own = (p: Vector3): [number, number, number] => {
    const dx = p.x - act.hips.x;
    const dz = p.z - act.hips.z;
    return [(dx * cy - dz * sy) / k, p.y / k, (dx * sy + dz * cy) / k];
  };
  const dir = (v: Vector3): [number, number, number] => [v.x * cy - v.z * sy, v.y, v.x * sy + v.z * cy];
  // each hand's shape: the grips it holds, by how much
  const hands: { L?: HandShape; R?: HandShape } = {};
  for (const S of ["L", "R"] as const) {
    let w = 0;
    const sh = { fingers: 0, index: 0, thumb: 0 };
    for (const h of act.hands) {
      if (h.S !== S) continue;
      const g = GRIPS[h.at].shape;
      sh.fingers += g.fingers * h.w;
      sh.index += g.index * h.w;
      sh.thumb += g.thumb * h.w;
      w += h.w;
    }
    if (w <= 0) continue;
    const u = Math.min(1, w);
    hands[S] = {
      fingers: RELAXED.fingers + (sh.fingers / w - RELAXED.fingers) * u,
      index: RELAXED.index + (sh.index / w - RELAXED.index) * u,
      thumb: RELAXED.thumb + (sh.thumb / w - RELAXED.thumb) * u,
    };
  }
  return {
    hipY: act.hips.y / k,
    feet: [own(act.feet[0]), own(act.feet[1])],
    toe: act.toe,
    duck: act.duck,
    // (toward the car: her right on its +z side)
    side: act.lean * side,
    knee: [dir(act.knee[0]), dir(act.knee[1])],
    heading: [act.heading[0] - act.yaw, act.heading[1] - act.yaw],
    twist: act.twist,
    look: act.look,
    hands,
  };
}

const _at = new Vector3();
const _g = new Vector3();
/** Each hand onto what it holds (`where`: a grip's point in the world, or null): a hand going from one grip to the next
 *  travels between them, its weight the most of theirs; its elbow the grips' own way. After the pose's set. */
export function handsOnGrips(
  m: {
    reachTo(S: "L" | "R", at: Vector3, w: number, pole?: [number, number, number], close?: boolean): void;
  },
  act: ActPose,
  where: (at: Grip, S: "L" | "R") => Vector3 | null,
) {
  for (const S of ["L", "R"] as const) {
    let w = 0;
    let most = 0;
    _at.set(0, 0, 0);
    const pole: [number, number, number] = [0, 0, 0];
    for (const h of act.hands) {
      if (h.S !== S || h.w <= 0) continue;
      const p = where(h.at, S);
      if (!p) continue;
      _at.addScaledVector(_g.copy(p), h.w);
      const g = GRIPS[h.at].pole;
      pole[0] += g[0] * h.w;
      pole[1] += g[1] * h.w;
      pole[2] += g[2] * h.w;
      w += h.w;
      most = Math.max(most, h.w);
    }
    if (w <= 0) continue;
    _at.multiplyScalar(1 / w);
    m.reachTo(S, _at, Math.min(1, most + 0.5 * (w - most)), [pole[0] / w, pole[1] / w, pole[2] / w]);
  }
}
