import { Object3D, Vector3 } from "three";
import type { CarStep } from "../chars/anim/acts";
import type { PersonModel } from "../chars/model";
import type { HandShape } from "../chars/rig";
import type { Sedan } from "../tp/car/model";
import { carFit } from "../tp/car/seatfit";
import { type ActPose, type Doorway, edgeY, type Grip, handleY } from "./getin";

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

const _m = new Vector3();
/** (plan 98, plan 100) A seat's doorway as the act needs it: the door's opening (a back door's heights and belt from
 *  the front door on its side when its own meshes don't hold its frame), the seat, its floor, her legs and her feet sat
 *  (carFit). A seat with no door (`door` −1): straddled — from the side she stood on (`fromZ`), else its own. */
export function doorwayOf(
  mod: Sedan,
  m: PersonModel,
  seatIn: number,
  door: number,
  fromZ: number | null,
): Doorway | null {
  const seat = mod.seats[seatIn];
  const fs = fromZ !== null ? Math.sign(fromZ - (seat?.hip.z ?? 0)) : 0;
  const op =
    door >= 0
      ? (mod.openingOf?.(door) ?? null)
      : seat
        ? {
            x0: seat.hip.x - 0.4,
            x1: seat.hip.x + 0.4,
            y0: 0,
            y1: seat.hip.y,
            out: Math.abs(seat.hip.z) + 0.3,
            glass: seat.hip.y,
            slide: false,
          }
        : null;
  if (!seat || !op) return null;
  // (plan 100) a back door whose own meshes don't hold its frame and glass (the sedan's: one stops at its belt, the
  // other takes the roof's rail with it) — its opening's foot and top, and its belt, the front door's on its side
  let opening = op;
  let belt = door >= 0 ? mod.sillOf?.(door)?.y : undefined;
  if (door >= 0 && mod.doorOf) {
    const front = mod.doorOf(Math.sign(seat.hip.z) > 0 ? 0 : 1);
    const ref = front >= 0 && front !== door ? mod.openingOf?.(front) : null;
    if (ref && (Math.abs(op.y1 - ref.y1) > 0.15 || Math.abs(op.y0 - ref.y0) > 0.06)) {
      opening = { ...op, y0: ref.y0, y1: ref.y1, glass: ref.glass };
      belt = mod.sillOf?.(front)?.y ?? belt;
    }
    belt ??= mod.sillOf?.(front)?.y;
  }
  const k = m.root.scale.x || 1;
  const fit = carFit(m, seat, seatIn === 0, mod, k, -1);
  // (each foot sat, from her own space — x out to its side, ahead, up — into the body's: sat facing −x)
  const satFeet = fit.feet.map((f, i) => {
    const left = (i === 0 ? 1 : -1) * f[0];
    return new Vector3(seat.hip.x - f[1] * k, f[2] * k, seat.hip.z + left * k);
  }) as [Vector3, Vector3];
  const s = door < 0 ? fs || Math.sign(seat.hip.z) || 1 : Math.sign(seat.hip.z) || 1;
  return {
    s,
    op: opening,
    hip: seat.hip,
    floor: seat.floor ?? mod.floor ?? seat.hip.y - 0.4,
    stand: fit.stand * k,
    satHip: (fit.stand + fit.drop) * k,
    satFeet,
    k,
    driver: seatIn === 0 && !!mod.rim,
    belt,
  };
}

/** (plan 93 C, plan 98, plan 100) The door's handle, its inside pull, its frame's top at the back and its back edge at
 *  the chest: marks on the door's own group, put on while it's shut (`was`: how far it's open, put back), so a hand
 *  stays on them as it swings. Into `e`; kept while they're on this door. */
export function doorMarksOn(
  mod: Sedan,
  door: number,
  way: Doorway,
  e: { handle?: Object3D; pull?: Object3D; top?: Object3D; edge?: Object3D },
  was: number,
) {
  const dg = mod.doors[door].group;
  if (e.handle && e.handle.parent === dg && e.top && e.edge) return;
  mod.doors[door].open(0);
  mod.root.updateMatrixWorld(true);
  e.handle?.removeFromParent();
  e.pull?.removeFromParent();
  e.top?.removeFromParent();
  e.edge?.removeFromParent();
  const h = new Object3D();
  const ed = new Object3D();
  const pu = new Object3D();
  const tp = new Object3D();
  dg.add(h, pu, tp, ed);
  const { op, s } = way;
  const mid = (op.y0 + op.y1) / 2;
  // (the handle: just ahead of the door's back edge, under the glass, on its skin — a tall cab's low on it; the pull
  // inside, ahead of it, at the armrest; the frame's top at the back, over the glass; the back edge at the chest)
  h.position.copy(dg.worldToLocal(mod.body.localToWorld(_m.set(op.x1 - 0.1, handleY(way), s * (op.out + 0.01)))));
  pu.position.copy(dg.worldToLocal(mod.body.localToWorld(_m.set(op.x1 - 0.42, mid + 0.02, s * (op.out - 0.1)))));
  tp.position.copy(dg.worldToLocal(mod.body.localToWorld(_m.set(op.x1 - 0.14, op.glass + 0.02, s * (op.out - 0.04)))));
  ed.position.copy(dg.worldToLocal(mod.body.localToWorld(_m.set(op.x1 - 0.03, edgeY(way), s * (op.out - 0.02)))));
  e.handle = h;
  e.pull = pu;
  e.top = tp;
  e.edge = ed;
  mod.doors[door].open(was);
}
