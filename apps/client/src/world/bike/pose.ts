import type { TrickId } from "@yutopia/shared/bike";
import { Vector3 } from "three";
import type { Act, CarStep } from "../chars/anim/acts";
import type { BikeModel } from "../tp/bike/model";

// A bicycle and its rider posed for a frame (docs/plan/101-the-bicycles.md, phase 3, F10a): the bike's cranks round,
// its bars turned, its levers pulled, a trick's frame or bars spun; its rider on it — the hips on the saddle (up off
// it stood on the pedals, down crouched for a hop), each foot on its pedal going round with the crank (the knee over
// it, in the bike's plane), the trunk bent over the bars as its body is (upright on the town bike, low on the racer),
// the head into the turn, the hands on the grips; a foot down at a stop; the tricks' bodies (the superman's legs out
// behind, the no-hander's arms out, the tailwhip's feet off and wide, the barspin's hands let go and caught again).
//
// Her space (carStep's): x her left, y up, z ahead, from her root — on the ground under the saddle, facing the bike's
// nose (the model's −x). The bike's points are the model's (nose −x, +z left).

export interface RiderNow {
  /** the cranks' turn (rad), how hard she pedals (0..1), stood (0..1), crouched for a hop (0..1) */
  crank: number;
  effort: number;
  stand: number;
  charge: number;
  /** a foot down at a stop (−1 the left, 1 the right, 0 none) */
  foot: number;
  trick: TrickId | null;
  trickT: number;
  /** the front wheel's turn (rad, + right), the brake (0..1) */
  steer: number;
  brake: number;
  /** her body's bend over the bars, 0 upright … 1 low (its kind's) */
  bend: number;
  air: boolean;
  /** (F9a) wheeling it on foot, walking beside it; how far (m: her steps' clock) */
  walk?: boolean;
  walked?: number;
  /** how fast it goes (m/s) */
  speed?: number;
}

/** The hip joint over the saddle's top, sat (m). */
const SIT = 0.085;
/** Stood on the pedals: the hips this far up off it and forward (m). */
const STAND_UP = 0.16;
const STAND_AHEAD = 0.12;
const GRIP = { fingers: 1.0, index: 0.95, thumb: 0.65 };
const OPEN = { fingers: 0.15, index: 0.1, thumb: 0.1 };
const ELBOW: [number, number, number] = [-0.85, -0.7, -0.35];

const pa = new Vector3();
const pb = new Vector3();
const ease = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** The bike's own parts posed (its cranks, bars, levers, stand; a trick's spin). */
export function poseBike(m: BikeModel, r: RiderNow) {
  m.tick();
  m.setCrank(r.crank);
  let spin = 0;
  let whip = 0;
  if (r.trick === "barspin") spin = Math.PI * 2 * ease(r.trickT);
  if (r.trick === "tailwhipL" || r.trick === "tailwhipR")
    whip = (r.trick === "tailwhipL" ? 1 : -1) * Math.PI * 2 * ease(r.trickT);
  m.setBars(r.steer, spin);
  m.setWhip(whip);
  m.setLevers(r.brake, r.brake);
  m.setStand(0);
}

/** Where her root goes on the bike (the model's frame): under the saddle, forward as she stands. */
export function riderRoot(m: BikeModel, r: RiderNow, out: Vector3): Vector3 {
  const s = m.bike.saddle;
  // (wheeling it: stood at its left, by the saddle)
  if (r.walk) return out.set(s.x - 0.22, 0, s.z + 0.56);
  const up = Math.max(r.stand, r.trick === "superman" || r.trick === "tailwhipL" || r.trick === "tailwhipR" ? 1 : 0);
  return out.set(s.x - STAND_AHEAD * up, 0, s.z);
}

/** Her pose on it: carStep's (the legs solved in three dimensions to the pedals), its lift; the hands after
 *  (`riderHands`). `stand` her standing hip's height (carFit's). */
export function riderAct(
  A: { carStep(f: CarStep, t: number): Act },
  m: BikeModel,
  r: RiderNow,
  root: Vector3,
  stand: number,
  t: number,
): { act: Act; hipY: number } {
  const b = m.bike;
  // a model point in her space: x her left (the model's +z), up, ahead (the model's −x)
  const her = (p: Vector3): [number, number, number] => [p.z - root.z, p.y, root.x - p.x];
  if (r.walk) {
    // (walking beside it: her steps by how far she's gone, a stride of 0.62 m; stood still, her feet together)
    const ph = ((r.walked ?? 0) / 0.62) * Math.PI;
    const going = Math.min(1, (r.speed ?? 0) / 0.5);
    const sw = (k: number) => Math.sin(ph + k * Math.PI);
    const feet: [[number, number, number], [number, number, number]] = [
      [0.1, 0.06 * Math.max(0, sw(0)) * going, 0.22 * Math.cos(ph) * going],
      [-0.1, 0.06 * Math.max(0, sw(1)) * going, -0.22 * Math.cos(ph) * going],
    ];
    const hipY = stand - 0.03 - 0.015 * Math.abs(Math.cos(ph)) * going;
    const act = A.carStep(
      {
        hipY,
        feet,
        toe: [0.05, 0.05],
        duck: 0.18,
        side: -0.06,
        knee: [
          [0.05, 0.2, 1],
          [-0.05, 0.2, 1],
        ],
        heading: [0, 0],
        look: -r.steer * 0.6,
        hands: { L: GRIP, R: GRIP },
      },
      t,
    );
    act.lift = [0, hipY - stand, 0];
    return { act, hipY };
  }
  const trick = r.trick;
  const k = trick ? Math.sin(Math.PI * Math.min(1, r.trickT)) : 0;
  const up = trick === "superman" || trick === "tailwhipL" || trick === "tailwhipR" ? 1 : r.stand;
  let hipY = b.saddle.y + SIT + STAND_UP * up - 0.14 * r.charge;
  // each foot on its pedal (its sole on the spindle's top), the toes a little down — more as it goes down the stroke
  const feet: [[number, number, number], [number, number, number]] = [
    [0, 0, 0],
    [0, 0, 0],
  ];
  const toe: [number, number] = [0.2, 0.2];
  for (const i of [0, 1] as const) {
    const p = her(m.pedalAt(i, pa));
    feet[i] = [p[0] + (i === 0 ? 0.015 : -0.015), p[1] + 0.012, p[2] - 0.04];
    // (the crank's angle for this side: the left half a turn round from the right)
    const a = r.crank + (i === 0 ? Math.PI : 0);
    toe[i] = 0.18 + 0.14 * Math.sin(a + 0.6);
  }
  // a foot down at a stop: on the ground beside the bike, the other on its pedal; sat a little to that side
  let side = 0;
  if (r.foot && !trick) {
    const i = r.foot < 0 ? 0 : 1;
    const out = i === 0 ? 1 : -1;
    feet[i] = [out * 0.34, 0, 0.12];
    toe[i] = 0.05;
    side = -out * 0.06;
  }
  // the tricks' bodies
  if (trick === "superman") {
    // (out flat behind the bike, the hands on the bars: the legs off the pedals and up behind)
    for (const i of [0, 1] as const) {
      const out = i === 0 ? 1 : -1;
      const f = feet[i];
      feet[i] = [f[0] + (out * 0.06 - f[0]) * k, f[1] + (hipY - 0.05 - f[1]) * k, f[2] + (-0.8 - f[2]) * k];
      toe[i] = 0.2 + 0.9 * k;
    }
    hipY += 0.18 * k;
  } else if (trick === "tailwhipL" || trick === "tailwhipR") {
    // (the feet off the pedals, wide and up, while the frame goes round under them)
    for (const i of [0, 1] as const) {
      const out = i === 0 ? 1 : -1;
      const f = feet[i];
      feet[i] = [f[0] + (out * 0.42 - f[0]) * k, f[1] + (hipY - 0.55 - f[1]) * k, f[2] + (0.15 - f[2]) * k];
    }
  }
  const pole = (out: number): [number, number, number] => [out * 0.12, 0.3, 1];
  // (bent forward from the hips over the bars: a little on the town bike, low on the racer)
  const duck = Math.min(1, 0.38 + 0.55 * r.bend + 0.2 * up + 0.3 * r.charge + (trick === "superman" ? 0.5 * k : 0));
  const step: CarStep = {
    hipY,
    feet,
    toe,
    duck,
    side,
    knee: [pole(1), pole(-1)],
    heading: [0, 0],
    look: -r.steer * 1.4,
    hands: {
      L: trick === "nohander" || trick === "barspin" ? OPEN : GRIP,
      R: trick === "nohander" || trick === "barspin" ? OPEN : GRIP,
    },
  };
  const act = A.carStep(step, t);
  act.lift = [0, hipY - stand, 0];
  return { act, hipY };
}

/** Her hands on the grips (the bars as they're turned), let go for the no-hander (out to her sides) and the barspin
 *  (up off them as they spin, caught again). World targets for her model's reachTo. */
export function riderHands(
  person: { reachTo(S: "L" | "R", at: Vector3, w?: number, pole?: [number, number, number], close?: boolean): void },
  m: BikeModel,
  r: RiderNow,
  w: number,
) {
  const trick = r.trick;
  const k = trick ? Math.sin(Math.PI * Math.min(1, r.trickT)) : 0;
  for (const [i, S] of [
    [0, "L"],
    [1, "R"],
  ] as const) {
    // (wheeling it: the left hand on its grip, the right on the saddle's nose)
    if (r.walk) {
      const at = S === "L" ? m.gripAt(0, pa) : pa.copy(m.bike.saddle).add(pb.set(-0.08, 0.04, 0));
      m.root.localToWorld(at);
      person.reachTo(S, at, w, ELBOW);
      continue;
    }
    const at = m.gripAt(i, pa);
    if (trick === "nohander") at.add(pb.set(0.18 * k, 0.32 * k, (i === 0 ? 1 : -1) * 0.5 * k));
    else if (trick === "barspin") at.add(pb.set(0.05 * k, 0.16 * k, (i === 0 ? 1 : -1) * 0.05 * k));
    m.root.localToWorld(at);
    person.reachTo(S, at, w, ELBOW);
  }
}
